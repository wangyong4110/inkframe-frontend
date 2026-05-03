<script setup lang="ts">
import type { Character, AIModel } from '~/types'
import { useCharacterApi, useModelApi } from '~/composables/useApi'

const props = defineProps<{ character: Character }>()
const emit = defineEmits<{ update: [data: Partial<Character>] }>()

const { updateCharacter, previewVoice } = useCharacterApi()
const { getAvailableModels } = useModelApi()

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

// Fallback voices (OpenAI) — shown when no voice_gen models are configured
const FALLBACK_VOICES = [
  { id: 'nova',    label: 'Nova — 女声·活泼' },
  { id: 'shimmer', label: 'Shimmer — 女声·温柔' },
  { id: 'echo',    label: 'Echo — 男声·磁性' },
  { id: 'onyx',    label: 'Onyx — 男声·低沉' },
  { id: 'fable',   label: 'Fable — 男声·权威' },
  { id: 'alloy',   label: 'Alloy — 中性·平衡' },
]

const FALLBACK_GROUP = [{ key: 'openai', label: 'OpenAI', voices: FALLBACK_VOICES }]

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

// Groups: [{ key, label, voices: [{id, label}] }]
const voiceGroups = computed(() => {
  if (voiceModels.value.length === 0) return FALLBACK_GROUP
  const map: Record<string, { key: string; label: string; voices: { id: string; label: string }[] }> = {}
  for (const m of voiceModels.value) {
    const key = m.provider?.name ?? 'unknown'
    const label = m.provider?.display_name ?? key
    if (!map[key]) map[key] = { key, label, voices: [] }
    map[key].voices.push({ id: m.name, label: m.display_name || m.name })
  }
  return Object.values(map)
})

const allKnownIds = computed(() =>
  voiceModels.value.length === 0
    ? FALLBACK_VOICES.map(v => v.id)
    : voiceModels.value.map(m => m.name)
)

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
  if (char.voice_id) return char.voice_id
  const g = char.gender
  if (g === 'male')    return 'echo'
  if (g === 'female')  return 'nova'
  if (g === 'neutral') return 'alloy'
  return 'nova'
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
  } catch {
    // silent fail; FALLBACK_GROUP is used
  } finally {
    voiceModelsLoading.value = false
  }
})

watch(() => props.character, (c) => {
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
  try {
    await updateCharacter(props.character.id, {
      voice_id:       voiceId.value,
      voice_speed:    voiceSpeed.value,
      voice_style:    voiceStyle.value,
      voice_language: voiceLanguage.value,
    } as any)
    emit('update', { voice_id: voiceId.value, voice_speed: voiceSpeed.value, voice_style: voiceStyle.value })
  } catch (e: any) {
    errorMsg.value = e.message
  } finally {
    saving.value = false
  }
}

async function preview() {
  previewing.value = true
  errorMsg.value = ''
  await save()
  try {
    const res = await previewVoice(props.character.id, previewText.value || undefined)
    audioUrl.value = res.data.audio_url
    await nextTick()
    audioEl.value?.load()
    audioEl.value?.play()
  } catch (e: any) {
    errorMsg.value = e.message
  } finally {
    previewing.value = false
  }
}

function speedLabel(v: number) {
  if (v <= 0.5) return '很慢'
  if (v <= 0.8) return '较慢'
  if (v <= 1.2) return '正常'
  if (v <= 1.8) return '较快'
  return '很快'
}
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

    <!-- Voice dropdown -->
    <div>
      <label class="block text-xs text-gray-500 mb-1.5">声音音色</label>
      <div class="relative">
        <select
          :value="showCustomInput ? '__custom__' : voiceId"
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

      <!-- Custom voice ID text input -->
      <div v-if="showCustomInput" class="mt-2">
        <input
          :value="voiceId"
          type="text"
          placeholder="输入音色 ID，如 zh_female_vv_uranus_bigtts"
          class="w-full text-sm border border-blue-300 dark:border-blue-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:border-blue-400"
          @input="voiceId = ($event.target as HTMLInputElement).value"
        />
        <p class="mt-1 text-xs text-gray-400">音色 ID 可从豆包控制台或其他 TTS 提供商文档中获取</p>
      </div>
      <p v-else-if="voiceId" class="mt-1 text-xs text-gray-400">已选：{{ voiceId }}</p>
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
      <audio ref="audioEl" controls :src="audioUrl" class="w-full h-8" />
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
