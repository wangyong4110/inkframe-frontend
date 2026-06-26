<script setup lang="ts">
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

const filterGender   = ref('')   // '' | 'male' | 'female' | 'neutral'
const filterAgeGroup = ref('')   // '' | 'child' | 'teen' | 'adult' | 'elder'

const GENDER_OPTIONS = [
  { value: '',        label: '全部性别' },
  { value: 'female',  label: '女声' },
  { value: 'male',    label: '男声' },
  { value: 'neutral', label: '中性' },
]

const AGE_OPTIONS = [
  { value: '',      label: '全部年龄' },
  { value: 'child', label: '儿童' },
  { value: 'teen',  label: '少年' },
  { value: 'adult', label: '成年' },
  { value: 'elder', label: '老年' },
]

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
    // If saved voice_id is not in the fetched list, show custom input
    checkCustom(voiceId.value)
  } catch (e: any) {
    voiceModelsLoadFailed.value = true
    toast.error('音色模型加载失败：' + (e?.message || ''))
  } finally {
    voiceModelsLoading.value = false
  }
})

watch(() => props.character, (c) => {
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
  saving.value = true
  errorMsg.value = ''
  suppressWatch.value = true
  try {
    await updateCharacter(props.character.id, {
      voice_id:       voiceId.value,
      voice_speed:    voiceSpeed.value,
      voice_style:    voiceStyle.value,
      voice_language: voiceLanguage.value,
    } as any)
    emit('update', { voice_id: voiceId.value, voice_speed: voiceSpeed.value, voice_style: voiceStyle.value, voice_language: voiceLanguage.value })
    toast.success('配音设置已保存')
  } catch (e: any) {
    errorMsg.value = e.message || '保存失败，请稍后重试'
    toast.error('保存失败：' + (e.message || '未知错误'))
  } finally {
    saving.value = false
    // 延迟恢复，让 patchCurrentCharacter 的 watch 触发先跳过
    setTimeout(() => { suppressWatch.value = false }, 200)
  }
}

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

      <!-- 筛选行（有音色数据时才显示） -->
      <div v-if="!noVoiceConfigured && !voiceModelsLoadFailed && voiceModels.length > 0" class="flex gap-2 mb-2">
        <div class="relative flex-1">
          <select
            v-model="filterGender"
            class="w-full appearance-none border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 pr-7 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:border-blue-400"
          >
            <option v-for="g in GENDER_OPTIONS" :key="g.value" :value="g.value">{{ g.label }}</option>
          </select>
          <svg class="absolute right-2 top-2 w-3 h-3 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
        <div class="relative flex-1">
          <select
            v-model="filterAgeGroup"
            class="w-full appearance-none border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5 pr-7 text-xs bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:border-blue-400"
          >
            <option v-for="a in AGE_OPTIONS" :key="a.value" :value="a.value">{{ a.label }}</option>
          </select>
          <svg class="absolute right-2 top-2 w-3 h-3 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
      </div>

      <!-- 未配置语音合成模型提示（替代下拉框） -->
      <div v-if="noVoiceConfigured" class="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 px-3 py-3 text-xs text-amber-700 dark:text-amber-300">
        <svg class="mt-0.5 shrink-0 w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/>
        </svg>
        <span>
          尚未配置任何语音合成模型，请先到模型管理中添加并填写 TTS 供应商的 API Key。
          <NuxtLink to="/model" class="font-medium underline hover:no-underline ml-1">前往模型管理 →</NuxtLink>
        </span>
      </div>

      <!-- 预设模式：下拉选择 -->
      <template v-else-if="!showCustomInput">
        <!-- 筛选后无结果提示 -->
        <p v-if="noFilteredVoices" class="text-xs text-gray-400 dark:text-gray-500 mb-1.5">
          当前筛选条件下无匹配音色，请调整筛选。
        </p>
        <div class="relative">
          <select
            :value="voiceId"
            class="w-full appearance-none border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2.5 pr-8 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-blue-400"
            @change="(e) => onSelectVoice((e.target as HTMLSelectElement).value)"
          >
            <option v-if="voiceModelsLoading" disabled value="">加载中…</option>
            <template v-else>
              <optgroup v-for="g in voiceGroups" :key="g.key" :label="g.label">
                <option v-for="v in g.voices" :key="v.id" :value="v.id">
                  {{ v.label }}
                </option>
              </optgroup>
              <optgroup label="其他">
                <option value="__custom__">手动输入音色 ID…</option>
              </optgroup>
            </template>
          </select>
          <svg class="absolute right-2.5 top-3 w-4 h-4 text-gray-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
          </svg>
        </div>
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
    <div class="flex gap-2 pt-1">
      <button
        class="flex-1 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-sm text-gray-700 dark:text-gray-200 transition-colors disabled:opacity-50"
        :disabled="saving"
        @click="save"
      >
        {{ saving ? '保存中…' : '保存设置' }}
      </button>
      <button
        class="flex-1 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-sm text-white transition-colors disabled:opacity-50"
        :disabled="previewing || saving"
        @click="preview"
      >
        {{ previewing ? '生成中…' : '试听声音' }}
      </button>
    </div>
  </div>
</template>
