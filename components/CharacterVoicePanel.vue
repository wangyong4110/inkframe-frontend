<script setup lang="ts">
import type { Character } from '~/types'
import { useCharacterApi } from '~/composables/useApi'

const props = defineProps<{
  character: Character
}>()

const emit = defineEmits<{
  update: [data: Partial<Character>]
}>()

const { updateCharacter, previewVoice } = useCharacterApi()

// OpenAI TTS voices with Chinese descriptions
const VOICES = [
  { id: 'alloy',   label: 'Alloy',   desc: '中性平衡' },
  { id: 'echo',    label: 'Echo',    desc: '男性磁性' },
  { id: 'fable',   label: 'Fable',   desc: '英式权威' },
  { id: 'onyx',    label: 'Onyx',    desc: '深沉低沉' },
  { id: 'nova',    label: 'Nova',    desc: '女性活泼' },
  { id: 'shimmer', label: 'Shimmer', desc: '女性温柔' },
]

const STYLES = [
  { id: '',          label: '默认' },
  { id: 'calm',      label: '平静' },
  { id: 'excited',   label: '兴奋' },
  { id: 'sad',       label: '悲伤' },
  { id: 'angry',     label: '愤怒' },
  { id: 'cheerful',  label: '欢快' },
  { id: 'serious',   label: '严肃' },
]

const voiceId    = ref(props.character.voice_id    ?? 'alloy')
const voiceSpeed = ref(props.character.voice_speed ?? 1.0)
const voiceStyle = ref(props.character.voice_style ?? '')
const previewText = ref('')
const audioUrl   = ref(props.character.voice_sample ?? '')
const audioEl    = ref<HTMLAudioElement | null>(null)
const saving     = ref(false)
const previewing = ref(false)
const errorMsg   = ref('')

watch(() => props.character, (c) => {
  voiceId.value    = c.voice_id    ?? 'alloy'
  voiceSpeed.value = c.voice_speed ?? 1.0
  voiceStyle.value = c.voice_style ?? ''
  audioUrl.value   = c.voice_sample ?? ''
}, { deep: true })

async function save() {
  saving.value = true
  errorMsg.value = ''
  try {
    await updateCharacter(props.character.id, {
      voice_id:    voiceId.value,
      voice_speed: voiceSpeed.value,
      voice_style: voiceStyle.value,
    })
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
  // Save current settings first so the backend uses them
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
  <div class="space-y-4">
    <!-- Voice selection -->
    <div>
      <label class="block text-xs text-gray-500 mb-1">声音音色</label>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="v in VOICES"
          :key="v.id"
          class="p-2 rounded border text-center transition-colors"
          :class="voiceId === v.id
            ? 'border-blue-500 bg-blue-50 text-blue-700'
            : 'border-gray-200 hover:border-gray-300 text-gray-700'"
          @click="voiceId = v.id"
        >
          <div class="font-medium text-sm">{{ v.label }}</div>
          <div class="text-xs text-gray-500">{{ v.desc }}</div>
        </button>
      </div>
    </div>

    <!-- Speed -->
    <div>
      <label class="block text-xs text-gray-500 mb-1">
        语速 — {{ speedLabel(voiceSpeed) }} ({{ voiceSpeed.toFixed(1) }}x)
      </label>
      <input
        v-model.number="voiceSpeed"
        type="range"
        min="0.5"
        max="2.0"
        step="0.1"
        class="w-full accent-blue-500"
      />
      <div class="flex justify-between text-xs text-gray-400 mt-0.5">
        <span>0.5x</span><span>1.0x</span><span>2.0x</span>
      </div>
    </div>

    <!-- Style -->
    <div>
      <label class="block text-xs text-gray-500 mb-1">语音风格</label>
      <div class="flex flex-wrap gap-2">
        <button
          v-for="s in STYLES"
          :key="s.id"
          class="px-3 py-1 rounded-full text-xs border transition-colors"
          :class="voiceStyle === s.id
            ? 'border-blue-500 bg-blue-50 text-blue-700'
            : 'border-gray-200 hover:border-gray-300 text-gray-600'"
          @click="voiceStyle = s.id"
        >
          {{ s.label }}
        </button>
      </div>
    </div>

    <!-- Preview text -->
    <div>
      <label class="block text-xs text-gray-500 mb-1">试听文本（留空使用默认）</label>
      <textarea
        v-model="previewText"
        rows="2"
        placeholder="输入要试听的台词，默认使用角色介绍台词…"
        class="w-full text-sm border border-gray-200 rounded p-2 resize-none focus:outline-none focus:border-blue-400"
      />
    </div>

    <!-- Audio player -->
    <div v-if="audioUrl" class="bg-gray-50 rounded p-2">
      <audio ref="audioEl" controls :src="audioUrl" class="w-full h-8" />
    </div>

    <!-- Error -->
    <p v-if="errorMsg" class="text-xs text-red-500">{{ errorMsg }}</p>

    <!-- Actions -->
    <div class="flex gap-2">
      <button
        class="flex-1 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-sm text-gray-700 transition-colors disabled:opacity-50"
        :disabled="saving"
        @click="save"
      >
        {{ saving ? '保存中…' : '保存设置' }}
      </button>
      <button
        class="flex-1 py-1.5 rounded bg-blue-500 hover:bg-blue-600 text-sm text-white transition-colors disabled:opacity-50"
        :disabled="previewing || saving"
        @click="preview"
      >
        {{ previewing ? '生成中…' : '试听声音' }}
      </button>
    </div>
  </div>
</template>
