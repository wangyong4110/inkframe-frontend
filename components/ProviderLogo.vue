<script setup lang="ts">
const props = defineProps<{
  name: string
  size?: string
  colorClass?: string
}>()

const LOGO_KEYS: Record<string, string> = {
  // LLM — 国际
  openai:              'openai',
  anthropic:           'anthropic',
  google:              'google',
  azure:               'azure',
  xai:                 'xai',
  mistral:             'mistral',
  meta:                'meta',
  ollama:              'ollama',
  // LLM — 国内
  doubao:              'doubao',
  deepseek:            'deepseek',
  qianwen:             'qianwen',
  zhipu:               'zhipu',
  moonshot:            'moonshot',
  baidu:               'baidu',
  tencent:             'tencent',
  yi:                  'yi',
  // 图像生成
  'openai-image':      'openai',
  'volcengine-visual': 'volcengine',
  'volcengine-i2i':    'volcengine',
  'jimeng-video':      'volcengine',
  'kling-image':       'kling',
  'kling-i2i':         'kling',
  // 视频生成
  kling:               'kling',
  seedance:            'seedance',
  happyhorse:          'aliyun',
  // 语音合成
  'doubao-speech':     'doubao',
  'doubao-speech-v1':  'doubao',
  'baidu-tts':         'baidu',
  'minimax-tts':       'minimax',
  'qwen-tts':          'qianwen',
  'aliyun-tts':        'aliyun',
  'tencent-tts':       'tencent',
  'kling-tts':         'kling',
  // 文生音效 / SFX
  'kling-sfx':         'kling',
  'elevenlabs-sfx':    'elevenlabs',
  freesound:           'freesound',
  'pixabay-sfx':       'pixabay',
  audioldm:            'ollama',   // 本地模型，用 ollama 图标兜底
  // 背景音乐
  jamendo:             'jamendo',
  'pixabay-bgm':       'pixabay',
  'fun-music':         'aliyun',
}

const logoFile = computed(() => {
  const key = LOGO_KEYS[props.name.toLowerCase()]
  return key ? `/images/providers/${key}.svg` : null
})

const showFallback = ref(false)
watch(() => props.name, () => { showFallback.value = false })
</script>

<template>
  <img
    v-if="logoFile && !showFallback"
    :src="logoFile"
    :alt="name"
    class="w-full h-full object-contain p-1.5"
    @error="showFallback = true"
  />
  <span v-else class="text-lg font-bold">
    {{ (name).charAt(0).toUpperCase() }}
  </span>
</template>
