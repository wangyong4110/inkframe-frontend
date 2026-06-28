<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import type { Character, AIModel } from '~/types'
import { useCharacterApi } from '~/composables/useCharacterApi'
import { useModelApi } from '~/composables/useModelApi'

const props = defineProps<{ character: Character }>()
const emit = defineEmits<{ update: [data: Partial<Character>] }>()

const { updateCharacter, previewVoice } = useCharacterApi()
const { getAvailableModels } = useModelApi()
const taskStore = useTaskStore()
const toast = useToast()

// ─── Static catalog ───────────────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'zh', label: '中文',     flag: '🇨🇳' },
  { code: 'en', label: 'English',  flag: '🇺🇸' },
  { code: 'ja', label: '日本語',   flag: '🇯🇵' },
  { code: 'ko', label: '한국어',   flag: '🇰🇷' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch',  flag: '🇩🇪' },
  { code: 'es', label: 'Español',  flag: '🇪🇸' },
]

const ZH_DIALECTS = [
  // 官话
  { code: 'cmn',  label: '普通话' },
  { code: 'ne',   label: '东北话' },
  { code: 'bjg',  label: '北京话' },
  { code: 'tjn',  label: '天津话' },
  { code: 'sdu',  label: '山东话' },
  { code: 'hen',  label: '河南话' },
  { code: 'sha',  label: '陕西话' },
  { code: 'scu',  label: '四川话' },
  { code: 'cqg',  label: '重庆话' },
  { code: 'yun',  label: '云南话' },
  { code: 'hub',  label: '湖北话' },
  // 吴语
  { code: 'wu',   label: '吴语（沪语）' },
  { code: 'suz',  label: '苏州话' },
  { code: 'nbg',  label: '宁波话' },
  { code: 'wzh',  label: '温州话' },
  // 粤语
  { code: 'yue',  label: '粤语（广州话）' },
  { code: 'hkg',  label: '香港粤语' },
  // 闽语
  { code: 'min',  label: '闽南语（台语）' },
  { code: 'fzh',  label: '闽东语（福州话）' },
  // 其他方言
  { code: 'hak',  label: '客家话' },
  { code: 'gan',  label: '赣语' },
  { code: 'xia',  label: '湘语（长沙话）' },
  { code: 'jin',  label: '晋语（太原话）' },
]

const STYLES = [
  { id: '',         label: '默认' },
  { id: 'calm',     label: '平静' },
  { id: 'excited',  label: '兴奋' },
  { id: 'sad',      label: '悲伤' },
  { id: 'angry',    label: '愤怒' },
  { id: 'cheerful', label: '欢快' },
  { id: 'serious',  label: '严肃' },
]

// ─── Dynamic voice models ─────────────────────────────────────────────────────

const voiceModels = ref<AIModel[]>([])
const voiceModelsLoading = ref(false)
const voiceModelsLoadFailed = ref(false)

const noVoiceConfigured = computed(
  () => !voiceModelsLoading.value && !voiceModelsLoadFailed.value && voiceModels.value.length === 0
)

// ─── Filters ─────────────────────────────────────────────────────────────────

const GENDER_OPTIONS = [
  { value: '',        label: '全部' },
  { value: 'female',  label: '女声' },
  { value: 'male',    label: '男声' },
  { value: 'neutral', label: '中性' },
]

const AGE_OPTIONS = [
  { value: '',      label: '全部' },
  { value: 'child', label: '少年' },
  { value: 'teen',  label: '青年' },
  { value: 'adult', label: '中年' },
  { value: 'elder', label: '长者' },
]

function inferAgeGroup(age: string | undefined): string {
  if (!age) return 'adult'
  const n = parseInt(age.replace(/[^0-9]/g, ''))
  if (!isNaN(n)) {
    if (n < 13) return 'child'
    if (n <= 25) return 'teen'
    if (n <= 60) return 'adult'
    return 'elder'
  }
  if (/童|儿|幼/.test(age)) return 'child'
  if (/少年|青少|青年/.test(age)) return 'teen'
  if (/老|长者|爷|奶|暮/.test(age)) return 'elder'
  return 'adult'
}

function charGender(char: typeof props.character): string {
  const g = char.gender ?? ''
  return ['male', 'female', 'neutral'].includes(g) ? g : ''
}

const filterGender   = ref(charGender(props.character))
const filterAgeGroup = ref(inferAgeGroup(props.character.age))

// ─── Custom dropdown ──────────────────────────────────────────────────────────

const voiceDropdownOpen  = ref(false)
const voiceTriggerRef    = ref<HTMLElement | null>(null)
const voiceDropdownStyle = ref({ top: '0px', left: '0px', width: '0px' })

const voiceLabel = computed(() => {
  if (!voiceId.value) return '请选择音色…'
  const found = voiceModels.value.find(m => m.name === voiceId.value)
  return found ? (found.display_name || found.name) : voiceId.value
})

function openVoiceDropdown() {
  const el = voiceTriggerRef.value
  if (!el) { voiceDropdownOpen.value = !voiceDropdownOpen.value; return }
  const rect = el.getBoundingClientRect()
  voiceDropdownStyle.value = {
    top:   `${rect.bottom + window.scrollY + 4}px`,
    left:  `${rect.left  + window.scrollX}px`,
    width: `${rect.width}px`,
  }
  voiceDropdownOpen.value = !voiceDropdownOpen.value
}

function closeVoiceDropdown(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.char-voice-dropdown-wrapper') && !target.closest('.char-voice-dropdown-portal'))
    voiceDropdownOpen.value = false
}
function handleScrollOrResize() { if (voiceDropdownOpen.value) voiceDropdownOpen.value = false }

// Groups: [{ key, label, voices: [{id, label}] }]
const voiceGroups = computed(() => {
  const map: Record<string, { key: string; label: string; voices: { id: string; label: string }[] }> = {}
  for (const m of voiceModels.value) {
    if (filterGender.value && m.gender && m.gender !== filterGender.value) continue
    if (filterAgeGroup.value && m.age_group && m.age_group !== filterAgeGroup.value) continue
    const key = m.provider?.name ?? 'unknown'
    const label = m.provider?.display_name ?? key
    if (!map[key]) map[key] = { key, label, voices: [] }
    map[key].voices.push({ id: m.name, label: m.display_name || m.name })
  }
  return Object.values(map)
})

// 筛选后是否有音色（用于提示无结果）
const noFilteredVoices = computed(() =>
  !voiceModelsLoading.value && !voiceModelsLoadFailed.value &&
  voiceModels.value.length > 0 &&
  voiceGroups.value.length === 0
)

const allKnownIds = computed(() => voiceModels.value.map(m => m.name))

// ─── Helpers ──────────────────────────────────────────────────────────────────

// "zh-yue" → { lang: 'zh', dialect: 'yue' }
function parseLang(raw: string | undefined): { lang: string; dialect: string } {
  if (!raw) return { lang: 'zh', dialect: 'cmn' }
  const [lang, dialect = lang === 'zh' ? 'cmn' : ''] = raw.split('-')
  return { lang, dialect }
}

// ─── State ────────────────────────────────────────────────────────────────────

const { lang: initLang, dialect: initDialect } = parseLang((props.character as any).voice_language)

const selectedLang    = ref(initLang)
const selectedDialect = ref(initDialect)

function defaultVoiceId(char: typeof props.character): string {
  return char.voice_id ?? ''
}

const voiceId         = ref(defaultVoiceId(props.character))
const voiceSpeed      = ref(props.character.voice_speed ?? 1.0)
const voiceStyle      = ref(props.character.voice_style ?? '')
const previewText     = ref('')
const audioUrl        = ref(props.character.voice_sample ?? '')
const audioEl         = ref<HTMLAudioElement | null>(null)
const saving          = ref(false)
const saveStatus      = ref<'' | 'saving' | 'saved' | 'error'>('')
const previewing      = ref(false)
const errorMsg        = ref('')
// 保存进行中时，屏蔽 watch 对本地状态的重置
const suppressWatch   = ref(false)

// Whether to show the manual text input (for IDs not in the dropdown)
const showCustomInput = ref(false)

const isZh = computed(() => selectedLang.value === 'zh')

// Stored format: "zh-yue", "zh" (mandarin), "en", "ja", ...
const voiceLanguage = computed(() =>
  isZh.value && selectedDialect.value && selectedDialect.value !== 'cmn'
    ? `${selectedLang.value}-${selectedDialect.value}`
    : selectedLang.value
)

function checkCustom(id: string) {
  if (id && !allKnownIds.value.includes(id)) {
    showCustomInput.value = true
  }
}

onMounted(async () => {
  voiceModelsLoading.value = true
  try {
    const res = await getAvailableModels('voice_gen')
    voiceModels.value = res.data ?? []
    checkCustom(voiceId.value)
  } catch (e: any) {
    voiceModelsLoadFailed.value = true
    toast.error('音色模型加载失败：' + (e?.message || ''))
  } finally {
    voiceModelsLoading.value = false
  }
  document.addEventListener('click', closeVoiceDropdown)
  window.addEventListener('scroll', handleScrollOrResize, true)
  window.addEventListener('resize', handleScrollOrResize)
})

onUnmounted(() => {
  document.removeEventListener('click', closeVoiceDropdown)
  window.removeEventListener('scroll', handleScrollOrResize, true)
  window.removeEventListener('resize', handleScrollOrResize)
})

watch(() => props.character, (c, prev) => {
  if (suppressWatch.value) return
  const { lang, dialect } = parseLang((c as any).voice_language)
  selectedLang.value    = lang
  selectedDialect.value = dialect
  voiceId.value         = defaultVoiceId(c)
  voiceSpeed.value      = c.voice_speed ?? 1.0
  voiceStyle.value      = c.voice_style ?? ''
  audioUrl.value        = c.voice_sample ?? ''
  showCustomInput.value = false
  checkCustom(voiceId.value)
  // 切换角色时重置筛选为新角色的性别/年龄
  if (c.id !== prev?.id) {
    filterGender.value   = charGender(c)
    filterAgeGroup.value = inferAgeGroup(c.age)
  }
}, { deep: true })

// ─── Actions ──────────────────────────────────────────────────────────────────

function onSelectVoice(id: string) {
  if (id === '__custom__') {
    showCustomInput.value = true
  } else {
    showCustomInput.value = false
    voiceId.value = id
  }
}

async function save() {
  if (saving.value) return
  saving.value = true
  saveStatus.value = 'saving'
  suppressWatch.value = true
  try {
    await updateCharacter(props.character.id, {
      voice_id:       voiceId.value,
      voice_speed:    voiceSpeed.value,
      voice_style:    voiceStyle.value,
      voice_language: voiceLanguage.value,
    } as any)
    emit('update', { voice_id: voiceId.value, voice_speed: voiceSpeed.value, voice_style: voiceStyle.value, voice_language: voiceLanguage.value })
    saveStatus.value = 'saved'
    setTimeout(() => { if (saveStatus.value === 'saved') saveStatus.value = '' }, 2000)
  } catch (e: any) {
    saveStatus.value = 'error'
    errorMsg.value = e.message || '自动保存失败'
  } finally {
    saving.value = false
    setTimeout(() => { suppressWatch.value = false }, 200)
  }
}

const debouncedSave = useDebounceFn(save, 800)

// 任意配音字段变化时自动保存
watch([voiceId, voiceSpeed, voiceStyle, voiceLanguage], () => {
  if (suppressWatch.value) return
  debouncedSave()
})

async function preview() {
  previewing.value = true
  errorMsg.value = ''
  try {
    const res = await previewVoice(props.character.id, {
      text:           previewText.value || undefined,
      voice_id:       voiceId.value || undefined,
      voice_speed:    voiceSpeed.value,
      voice_style:    voiceStyle.value || undefined,
      voice_language: voiceLanguage.value || undefined,
    })
    const taskId = (res as any)?.data?.task_id ?? ''
    if (!taskId) { throw new Error('未获取到任务ID') }
    taskStore.trackTask(taskId, async (task) => {
      previewing.value = false
      if (task.status === 'completed') {
        audioUrl.value = (task.data?.audio_url as string) ?? ''
        await nextTick()
        audioEl.value?.load()
        audioEl.value?.play()
      } else if (task.status === 'failed') {
        audioUrl.value = ''
        errorMsg.value = task.error || '试听失败，请检查语音合成配置'
      }
    })
  } catch (e: any) {
    audioUrl.value = ''
    errorMsg.value = e.message || '试听失败，请检查语音合成配置'
    previewing.value = false
  }
}

function onAudioError() {
  audioUrl.value = ''
  errorMsg.value = '音频加载失败，请重新生成试听'
}

function speedLabel(v: number) {
  if (v <= 0.5) return '很慢'
  if (v <= 0.8) return '较慢'
  if (v <= 1.2) return '正常'
  if (v <= 1.8) return '较快'
  return '很快'
}

defineExpose({
  getVoiceData: () => ({
    voice_id:       voiceId.value,
    voice_speed:    voiceSpeed.value,
    voice_style:    voiceStyle.value,
    voice_language: voiceLanguage.value,
  }),
})
</script>

<template>
  <div class="space-y-5">

    <!-- Language + Dialect -->
    <div class="grid grid-cols-2 gap-3">
      <div>
        <label class="block text-xs text-gray-500 mb-1.5">语言</label>
        <div class="relative">
          <select
            v-model="selectedLang"
            class="w-full appearance-none border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 pr-8 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-blue-400"
          >
            <option v-for="l in LANGUAGES" :key="l.code" :value="l.code">
              {{ l.flag }} {{ l.label }}
            </option>
          </select>
          <svg class="absolute right-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
      </div>

      <div>
        <label class="block text-xs text-gray-500 mb-1.5">
          方言
          <span v-if="!isZh" class="text-gray-300 ml-1">（仅中文可选）</span>
        </label>
        <div class="relative">
          <select
            v-model="selectedDialect"
            :disabled="!isZh"
            class="w-full appearance-none border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 pr-8 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-blue-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <option v-if="!isZh" value="">—</option>
            <template v-else>
              <optgroup label="官话">
                <option v-for="d in ZH_DIALECTS.slice(0, 11)" :key="d.code" :value="d.code">{{ d.label }}</option>
              </optgroup>
              <optgroup label="吴语">
                <option v-for="d in ZH_DIALECTS.slice(11, 15)" :key="d.code" :value="d.code">{{ d.label }}</option>
              </optgroup>
              <optgroup label="粤语">
                <option v-for="d in ZH_DIALECTS.slice(15, 17)" :key="d.code" :value="d.code">{{ d.label }}</option>
              </optgroup>
              <optgroup label="闽语">
                <option v-for="d in ZH_DIALECTS.slice(17, 19)" :key="d.code" :value="d.code">{{ d.label }}</option>
              </optgroup>
              <optgroup label="其他方言">
                <option v-for="d in ZH_DIALECTS.slice(19)" :key="d.code" :value="d.code">{{ d.label }}</option>
              </optgroup>
            </template>
          </select>
          <svg class="absolute right-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
      </div>
    </div>

    <!-- Voice dropdown / manual input (互斥显示) -->
    <div>
      <label class="block text-xs text-gray-500 mb-1.5">声音音色</label>

      <!-- 未配置语音合成模型提示 -->
      <div v-if="noVoiceConfigured" class="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-3 text-xs text-amber-700 dark:text-amber-300">
        <svg class="mt-0.5 shrink-0 w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/>
        </svg>
        <span>
          尚未配置任何语音合成模型，请先到模型管理中添加并填写 TTS 供应商的 API Key。
          <NuxtLink to="/model" class="font-medium underline hover:no-underline ml-1">前往模型管理 →</NuxtLink>
        </span>
      </div>

      <!-- 预设模式：自定义下拉 -->
      <template v-else-if="!showCustomInput">
        <div class="char-voice-dropdown-wrapper">
          <button
            ref="voiceTriggerRef"
            type="button"
            class="w-full flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-blue-400 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
            @click="openVoiceDropdown"
          >
            <span :class="voiceId ? '' : 'text-gray-400 dark:text-gray-500'">{{ voiceLabel }}</span>
            <svg class="w-4 h-4 text-gray-400 shrink-0 ml-2 transition-transform" :class="voiceDropdownOpen ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
        </div>

        <Teleport to="body">
          <div
            v-if="voiceDropdownOpen"
            class="char-voice-dropdown-portal fixed z-[9999] shadow-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 rounded-xl overflow-hidden flex flex-col"
            :style="voiceDropdownStyle"
          >
            <!-- 筛选 chips -->
            <div v-if="voiceModels.length > 0" class="px-3 pt-2.5 pb-2 border-b border-gray-100 dark:border-gray-700 space-y-1.5">
              <div class="flex flex-wrap gap-1">
                <button
                  v-for="opt in GENDER_OPTIONS" :key="opt.value"
                  type="button"
                  class="px-2 py-0.5 rounded text-xs border transition-colors"
                  :class="filterGender === opt.value
                    ? 'bg-blue-500 border-blue-400 text-white'
                    : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400'"
                  @click.stop="filterGender = opt.value"
                >{{ opt.label }}</button>
              </div>
              <div class="flex flex-wrap gap-1">
                <button
                  v-for="opt in AGE_OPTIONS" :key="opt.value"
                  type="button"
                  class="px-2 py-0.5 rounded text-xs border transition-colors"
                  :class="filterAgeGroup === opt.value
                    ? 'bg-blue-500 border-blue-400 text-white'
                    : 'border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-gray-400'"
                  @click.stop="filterAgeGroup = opt.value"
                >{{ opt.label }}</button>
              </div>
            </div>

            <!-- 音色列表 -->
            <div class="overflow-y-auto" style="max-height: 260px">
              <p v-if="voiceModelsLoading" class="px-3 py-3 text-sm text-gray-400">加载中…</p>
              <p v-else-if="noFilteredVoices" class="px-3 py-3 text-xs text-gray-400">当前筛选条件下无匹配音色，请调整筛选。</p>
              <template v-else>
                <div v-for="g in voiceGroups" :key="g.key">
                  <div class="px-3 py-1 text-xs font-medium text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-750 sticky top-0">{{ g.label }}</div>
                  <button
                    v-for="v in g.voices" :key="v.id"
                    type="button"
                    class="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between transition-colors"
                    @click="onSelectVoice(v.id); voiceDropdownOpen = false"
                  >
                    <span>{{ v.label }}</span>
                    <svg v-if="voiceId === v.id" class="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                    </svg>
                  </button>
                </div>
                <div class="border-t border-gray-100 dark:border-gray-700">
                  <button
                    type="button"
                    class="w-full text-left px-3 py-2 text-sm text-blue-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    @click="onSelectVoice('__custom__'); voiceDropdownOpen = false"
                  >手动输入音色 ID…</button>
                </div>
              </template>
            </div>
          </div>
        </Teleport>

        <p v-if="voiceId" class="mt-1 text-xs text-gray-400">已选：{{ voiceId }}</p>
      </template>

      <!-- 手动模式：文本输入 -->
      <template v-else>
        <input
          :value="voiceId"
          type="text"
          placeholder="输入音色 ID，如 zh_female_vv_uranus_bigtts"
          class="w-full text-sm border border-blue-300 dark:border-blue-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-blue-400"
          @input="voiceId = ($event.target as HTMLInputElement).value"
        />
        <div class="flex items-center justify-between mt-1">
          <p class="text-xs text-gray-400">音色 ID 可从豆包控制台或其他 TTS 提供商文档中获取</p>
          <button
            class="text-xs text-blue-500 hover:text-blue-400 shrink-0 ml-2"
            @click="showCustomInput = false"
          >← 选择预设</button>
        </div>
      </template>
    </div>

    <!-- Speed -->
    <div>
      <label class="block text-xs text-gray-500 mb-1.5">
        语速 — {{ speedLabel(voiceSpeed) }} ({{ voiceSpeed.toFixed(1) }}x)
      </label>
      <input
        v-model.number="voiceSpeed"
        type="range" min="0.5" max="2.0" step="0.1"
        class="w-full accent-blue-500"
      />
      <div class="flex justify-between text-xs text-gray-400 mt-0.5">
        <span>0.5x</span><span>1.0x</span><span>2.0x</span>
      </div>
    </div>

    <!-- Style -->
    <div>
      <label class="block text-xs text-gray-500 mb-1.5">语音风格</label>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="s in STYLES"
          :key="s.id"
          class="px-3 py-1 rounded-full text-xs border transition-colors"
          :class="voiceStyle === s.id
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 text-gray-600 dark:text-gray-400'"
          @click="voiceStyle = s.id"
        >
          {{ s.label }}
        </button>
      </div>
    </div>

    <!-- Preview text -->
    <div>
      <label class="block text-xs text-gray-500 mb-1.5">试听文本（留空使用默认）</label>
      <textarea
        v-model="previewText"
        rows="2"
        placeholder="输入要试听的台词，默认使用角色介绍台词…"
        class="w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 resize-none bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-blue-400"
      />
    </div>

    <!-- Audio player -->
    <div v-if="audioUrl" class="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
      <audio ref="audioEl" controls :src="audioUrl" class="w-full h-8" @error="onAudioError" />
    </div>

    <p v-if="errorMsg" class="text-xs text-red-500">{{ errorMsg }}</p>

    <!-- Actions -->
    <div class="space-y-2 pt-1">
      <!-- 自动保存状态 -->
      <div class="flex items-center justify-end h-4">
        <transition name="fade">
          <span v-if="saveStatus === 'saving'" class="flex items-center gap-1 text-xs text-gray-400">
            <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            保存中…
          </span>
          <span v-else-if="saveStatus === 'saved'" class="flex items-center gap-1 text-xs text-green-500">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
            </svg>
            已自动保存
          </span>
          <span v-else-if="saveStatus === 'error'" class="text-xs text-red-400">保存失败</span>
        </transition>
      </div>
      <button
        class="w-full py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-sm text-white transition-colors disabled:opacity-50"
        :disabled="previewing || saving"
        @click="preview"
      >
        {{ previewing ? '生成中…' : '试听声音' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
