<script setup lang="ts">
import type { AIModel } from '~/types'
import { WRITING_PRESETS, IMAGE_PRESETS, useStyleApi } from '~/composables/useStylePresets'

const props = defineProps<{ novelId: number }>()

const toast = useToast()
const router = useRouter()
const novelStore = useNovelStore()
const styleApi = useStyleApi()

const novel = computed(() => novelStore.currentNovel)

const showDeleteNovelConfirm = ref(false)
const deleteConfirmInput = ref('')
const deleteConfirmStep = ref(1)

function openDeleteConfirm() {
  deleteConfirmInput.value = ''
  deleteConfirmStep.value = 1
  showDeleteNovelConfirm.value = true
}

function closeDeleteConfirm() {
  showDeleteNovelConfirm.value = false
  deleteConfirmInput.value = ''
  deleteConfirmStep.value = 1
}

const deleteConfirmMatch = computed(() =>
  deleteConfirmInput.value.trim() === (novel.value?.title ?? '')
)

// AI model lists per task type (loaded async; silently ignored if API unavailable)
const availableModels = ref<AIModel[]>([])
const imageModels = ref<AIModel[]>([])
const videoModels = ref<AIModel[]>([])
const ttsModels = ref<AIModel[]>([])

const selectedWritingPreset = ref(WRITING_PRESETS[0]?.id ?? '')
const applyingWritingPreset = ref(false)

const iconOptions = [
  { value: 'purple', gradient: 'linear-gradient(135deg,#8B5CF6,#3B82F6)' },
  { value: 'blue',   gradient: 'linear-gradient(135deg,#3B82F6,#06B6D4)' },
  { value: 'green',  gradient: 'linear-gradient(135deg,#10B981,#84CC16)' },
  { value: 'orange', gradient: 'linear-gradient(135deg,#F59E0B,#EF4444)' },
  { value: 'red',    gradient: 'linear-gradient(135deg,#EF4444,#EC4899)' },
  { value: 'pink',   gradient: 'linear-gradient(135deg,#EC4899,#8B5CF6)' },
  { value: 'teal',   gradient: 'linear-gradient(135deg,#14B8A6,#3B82F6)' },
  { value: 'indigo', gradient: 'linear-gradient(135deg,#6366F1,#8B5CF6)' },
  { value: 'amber',  gradient: 'linear-gradient(135deg,#F59E0B,#84CC16)' },
  { value: 'cyan',   gradient: 'linear-gradient(135deg,#06B6D4,#10B981)' },
]

const genreOptions = [
  '玄幻奇幻','仙侠修仙','都市现代','言情爱情','历史古代','科幻未来',
  '悬疑推理','武侠江湖','灵异恐怖','游戏竞技','军事战争','体育竞技',
  '青春校园','末世废土','重生穿越','宫斗宅斗','系统流','其他',
]

const settingsWCOptions = [
  { label: '5万字',   value: 50000 },
  { label: '10万字',  value: 100000 },
  { label: '30万字',  value: 300000 },
  { label: '50万字',  value: 500000 },
  { label: '100万字', value: 1000000 },
]
const settingsCCOptions = [
  { label: '30章',  value: 30 },
  { label: '50章',  value: 50 },
  { label: '100章', value: 100 },
  { label: '200章', value: 200 },
  { label: '300章', value: 300 },
]

const videoTypes = [
  {
    value: 'narration',
    label: '图片解说',
    icon: '🖼️',
    desc: '静态图片 + 旁白/字幕，成本低、易批量生产',
  },
  {
    value: 'animation',
    label: '动画',
    icon: '🎬',
    desc: 'AI 生成连续动画帧，画面更生动',
  },
]

const ASPECT_RATIOS = [
  { value: '21:9', label: '21:9', iconW: 28, iconH: 12 },
  { value: '16:9', label: '16:9', iconW: 28, iconH: 16 },
  { value: '4:3',  label: '4:3',  iconW: 24, iconH: 18 },
  { value: '1:1',  label: '1:1',  iconW: 20, iconH: 20 },
  { value: '3:4',  label: '3:4',  iconW: 15, iconH: 20 },
  { value: '9:16', label: '9:16', iconW: 11, iconH: 20 },
]

const aspectRatioDropdownOpen = ref(false)
const aspectRatioDropdownRef = ref<HTMLElement | null>(null)
onClickOutside(aspectRatioDropdownRef, () => { aspectRatioDropdownOpen.value = false })
const selectedAspectRatio = computed(() =>
  ASPECT_RATIOS.find(r => r.value === (novel.value?.video_aspect_ratio ?? '16:9')) ?? ASPECT_RATIOS[1]
)

const NARRATION_FALLBACK_VOICES = [
  { id: 'nova',    label: 'Nova — 女声·活泼' },
  { id: 'shimmer', label: 'Shimmer — 女声·温柔' },
  { id: 'echo',    label: 'Echo — 男声·磁性' },
  { id: 'onyx',    label: 'Onyx — 男声·低沉' },
  { id: 'fable',   label: 'Fable — 男声·权威' },
  { id: 'alloy',   label: 'Alloy — 中性·平衡' },
]
const narrationVoiceGroups = computed(() => {
  if (ttsModels.value.length === 0)
    return [{ key: 'openai', label: 'OpenAI', voices: NARRATION_FALLBACK_VOICES }]
  const map: Record<string, { key: string; label: string; voices: { id: string; label: string }[] }> = {}
  for (const m of ttsModels.value) {
    const key = m.provider?.name ?? 'unknown'
    const label = m.provider?.display_name ?? key
    if (!map[key]) map[key] = { key, label, voices: [] }
    map[key].voices.push({ id: m.name, label: m.display_name || m.name })
  }
  return Object.values(map)
})

function iconGradient(value: string | undefined) {
  return iconOptions.find(o => o.value === value)?.gradient ?? 'linear-gradient(135deg,#8B5CF6,#3B82F6)'
}

onMounted(async () => {
  try {
    const modelApi = useModelApi()
    const taskTypes = ['chapter', 'image_gen', 'video_gen', 'voice_gen'] as const
    const modelResps = await Promise.allSettled(taskTypes.map(t => modelApi.getAvailableModels(t)))
    taskTypes.forEach((t, i) => {
      const r = modelResps[i]
      if (r.status === 'fulfilled') {
        const models = ((r.value as any).data as AIModel[]).filter((m: AIModel) => m.is_active && m.is_available)
        if (t === 'chapter') availableModels.value = models
        else if (t === 'image_gen') imageModels.value = models
        else if (t === 'video_gen') videoModels.value = models
        else if (t === 'voice_gen') ttsModels.value = models
      }
    })
  } catch { /* non-critical */ }
})

async function handleWritingPresetSelect(presetId: string) {
  selectedWritingPreset.value = presetId
  const preset = WRITING_PRESETS.find(p => p.id === presetId)
  if (!preset) return
  applyingWritingPreset.value = true
  try {
    const prompt = await styleApi.buildWritingPrompt(preset.config)
    await novelStore.updateNovel(props.novelId, { style_prompt: prompt })
    toast.success(`已应用写作风格「${preset.name}」`)
  } catch {
    // silently fall back
  } finally {
    applyingWritingPreset.value = false
  }
}

type ModelField = 'ai_model' | 'image_model' | 'video_model' | 'tts_model'

const modelConfigs = computed(() => [
  { label: 'LLM 模型',  field: 'ai_model'    as ModelField, models: availableModels.value },
  { label: '图片模型', field: 'image_model'  as ModelField, models: imageModels.value },
  { label: '视频模型', field: 'video_model'  as ModelField, models: videoModels.value },
  { label: '语音模型', field: 'tts_model'    as ModelField, models: ttsModels.value },
])

function handleModelChange(field: ModelField, value: string) {
  novelStore.updateNovel(props.novelId, { [field]: value || undefined })
}

function handleImageStyleSelect(styleId: string) {
  novelStore.updateNovel(props.novelId, { image_style: styleId }).then(() => {
    const preset = IMAGE_PRESETS.find(p => p.id === styleId)
    if (preset) toast.success(`已应用画面风格「${preset.name}」`)
  }).catch((e: any) => {
    toast.error('保存画面风格失败：' + (e.message || ''))
  })
}

async function confirmDeleteNovel() {
  deleteConfirmStep.value = 3
  try {
    await novelStore.deleteNovel(props.novelId)
    router.push('/novel')
  } catch (e: any) {
    closeDeleteConfirm()
    toast.error('删除失败：' + (e.message || '未知错误'))
  }
}


</script>

<template>
  <div class="space-y-4">

    <!-- ① 基本信息 -->
    <div class="card p-6 space-y-5">
      <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">基本信息</h3>

      <!-- 图标 + 名称 (同行) -->
      <div class="flex items-start gap-4">
        <div class="flex-shrink-0">
          <div
            class="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-sm"
            :style="{ background: iconGradient(novel?.cover_image) }"
          >{{ novel?.title?.[0]?.toUpperCase() ?? 'I' }}</div>
          <div class="flex gap-1.5 flex-wrap mt-2 max-w-[9rem]">
            <button
              v-for="opt in iconOptions" :key="opt.value"
              type="button"
              class="w-6 h-6 rounded-lg transition-all hover:scale-110 focus:outline-none"
              :class="novel?.cover_image === opt.value ? 'ring-2 ring-offset-1 ring-primary-500 scale-110' : ''"
              :style="{ background: opt.gradient }"
              @click="novelStore.updateNovel(novelId, { cover_image: opt.value })"
            />
          </div>
        </div>
        <div class="flex-1 min-w-0 space-y-3">
          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">小说名称</label>
            <input
              type="text" :value="novel?.title" class="input" maxlength="100"
              @change="(e) => { const v = (e.target as HTMLInputElement).value.trim(); if (v) novelStore.updateNovel(novelId, { title: v }) }"
            />
          </div>
        </div>
      </div>

      <!-- 小说类型 -->
      <div>
        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">小说类型</label>
        <div class="flex gap-1.5 flex-wrap">
          <button
            v-for="g in genreOptions" :key="g" type="button"
            class="px-2.5 py-1 text-xs rounded-full border transition-colors"
            :class="novel?.genre === g
              ? 'bg-amber-400 border-amber-400 text-white font-medium'
              : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-amber-300'"
            @click="novelStore.updateNovel(novelId, { genre: g as any })"
          >{{ g }}</button>
        </div>
      </div>

      <!-- 作品概要 -->
      <div>
        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">作品概要</label>
        <textarea
          :value="novel?.description" rows="3" maxlength="1000"
          class="input resize-none text-sm"
          placeholder="简要描述故事背景、主角、核心冲突，AI 会根据此生成大纲…"
          @change="(e) => novelStore.updateNovel(novelId, { description: (e.target as HTMLTextAreaElement).value })"
        ></textarea>
        <p class="mt-0.5 text-xs text-gray-400 text-right">{{ novel?.description?.length ?? 0 }}/1000</p>
      </div>

      <!-- 目标规模 (双列) -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">目标字数</label>
          <div class="flex gap-1.5 flex-wrap mb-2">
            <button
              v-for="opt in settingsWCOptions" :key="opt.value" type="button"
              class="px-2.5 py-1 text-xs rounded-full border transition-colors"
              :class="novel?.target_word_count === opt.value
                ? 'bg-primary-500 border-primary-500 text-white font-medium'
                : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-primary-300'"
              @click="novelStore.updateNovel(novelId, { target_word_count: opt.value })"
            >{{ opt.label }}</button>
          </div>
          <div class="flex items-center gap-1.5">
            <input
              type="number" :value="novel?.target_word_count ?? 0"
              class="input w-28 text-sm" min="0" step="10000"
              @change="(e) => novelStore.updateNovel(novelId, { target_word_count: parseInt((e.target as HTMLInputElement).value) || 0 })"
            />
            <span class="text-xs text-gray-400">字</span>
          </div>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">期望章节数</label>
          <div class="flex gap-1.5 flex-wrap mb-2">
            <button
              v-for="opt in settingsCCOptions" :key="opt.value" type="button"
              class="px-2.5 py-1 text-xs rounded-full border transition-colors"
              :class="novel?.target_chapters === opt.value
                ? 'bg-primary-500 border-primary-500 text-white font-medium'
                : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-primary-300'"
              @click="novelStore.updateNovel(novelId, { target_chapters: opt.value })"
            >{{ opt.label }}</button>
          </div>
          <div class="flex items-center gap-1.5">
            <input
              type="number" :value="novel?.target_chapters ?? 0"
              class="input w-28 text-sm" min="0" max="10000"
              @change="(e) => novelStore.updateNovel(novelId, { target_chapters: parseInt((e.target as HTMLInputElement).value) || 0 })"
            />
            <span class="text-xs text-gray-400">章</span>
          </div>
        </div>
      </div>
    </div>

    <!-- ② 创作风格 -->
    <div class="card p-6 space-y-4">
      <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">创作风格</h3>

      <div>
        <div class="flex items-center justify-between mb-1.5">
          <label class="text-xs font-medium text-gray-500 dark:text-gray-400">写作风格预设</label>
          <NuxtLink to="/style" class="text-xs text-primary-600 hover:underline">浏览风格库 →</NuxtLink>
        </div>
        <div class="flex items-center gap-2">
          <select
            :value="selectedWritingPreset" :disabled="applyingWritingPreset"
            class="input flex-1"
            @change="handleWritingPresetSelect(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="p in WRITING_PRESETS" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
          <svg v-if="applyingWritingPreset" class="w-4 h-4 animate-spin text-primary-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </div>
        <textarea
          :value="novel?.style_prompt" rows="2"
          class="input text-sm mt-2 resize-none"
          placeholder="风格提示词，选择预设后自动填充，或手动输入…"
          @change="(e) => novelStore.updateNovel(novelId, { style_prompt: (e.target as HTMLTextAreaElement).value })"
        ></textarea>
      </div>

      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">画面风格</label>
          <select
            :value="novel?.image_style || IMAGE_PRESETS[0]?.id || ''"
            class="input"
            @change="handleImageStyleSelect(($event.target as HTMLSelectElement).value)"
          >
            <option value="">-- 不使用预设 --</option>
            <option v-for="p in IMAGE_PRESETS" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">参考作品</label>
          <input
            type="text" :value="novel?.reference_style" class="input"
            placeholder="书名、URL 或风格描述…"
            @change="(e) => novelStore.updateNovel(novelId, { reference_style: (e.target as HTMLInputElement).value })"
          />
          <p class="mt-1 text-xs text-gray-400">
            或
            <NuxtLink :to="`/import?novel_id=${novel?.id}`" class="text-primary-600 hover:underline">导入章节</NuxtLink>
            直接爬取参考作品
          </p>
        </div>
      </div>

      <!-- 章节模式 -->
      <div>
        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">章节模式</label>
        <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          <button
            v-for="mode in [{ value: 'sequential', label: '连贯剧情', desc: '各章节情节相互衔接' }, { value: 'independent', label: '独立成篇', desc: '每章都是完整故事' }]"
            :key="mode.value"
            type="button"
            class="flex-1 py-1.5 text-xs flex flex-col items-center gap-0.5 transition-colors"
            :class="(novel?.chapter_mode ?? 'sequential') === mode.value
              ? 'bg-primary-500 text-white'
              : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'"
            @click="novelStore.updateNovel(novelId, { chapter_mode: mode.value })"
          >
            <span>{{ mode.label }}</span>
            <span class="opacity-70">{{ mode.desc }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ③ 模型配置 -->
    <div class="card p-6 space-y-4">
      <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">模型配置</h3>
      <div class="grid grid-cols-2 gap-4">
        <div v-for="mc in modelConfigs" :key="mc.field">
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{{ mc.label }}</label>
          <select :value="novel?.[mc.field] ?? ''" class="input"
            @change="handleModelChange(mc.field, ($event.target as HTMLSelectElement).value)">
            <option value="">使用默认</option>
            <option v-for="m in mc.models" :key="m.id" :value="m.name">{{ m.display_name || m.name }}</option>
          </select>
          <p v-if="mc.models.length === 0" class="mt-1 text-xs text-gray-400">
            可在 <NuxtLink to="/model" class="text-primary-600 hover:underline">模型管理</NuxtLink> 中添加
          </p>
        </div>
      </div>
      <div class="pt-2 border-t border-gray-100 dark:border-gray-700">
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">AI 提示词</label>
          <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <button
              v-for="lang in [{ value: 'zh', label: '中文' }, { value: 'en', label: 'English' }]"
              :key="lang.value"
              type="button"
              class="flex-1 py-1.5 text-xs transition-colors"
              :class="(novel?.prompt_language ?? 'zh') === lang.value
                ? 'bg-primary-500 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'"
              @click="novelStore.updateNovel(novelId, { prompt_language: lang.value })"
            >{{ lang.label }}</button>
          </div>
          <p class="mt-1 text-xs text-gray-400">角色/物品/场景描述的生成语言</p>
        </div>
      </div>
    </div>


    <!-- ④ 视频配置 -->
    <div class="card p-6 space-y-4">
      <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">视频配置</h3>

      <!-- 视频类型 -->
      <div>
        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">视频类型</label>
        <div class="grid grid-cols-2 gap-3">
          <button
            v-for="vt in videoTypes"
            :key="vt.value"
            type="button"
            class="relative flex flex-col gap-1 rounded-lg border-2 p-4 text-left transition-colors"
            :class="(novel?.video_type ?? 'animation') === vt.value
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'"
            @click="novelStore.updateNovel(novelId, { video_type: vt.value })"
          >
            <span class="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-100">
              <span class="text-base">{{ vt.icon }}</span>
              {{ vt.label }}
            </span>
            <span class="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{{ vt.desc }}</span>
            <span v-if="(novel?.video_type ?? 'animation') === vt.value"
              class="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary-500" />
          </button>
        </div>
      </div>


      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">默认分辨率</label>
          <select :value="novel?.video_resolution ?? '1080p'" class="input"
            @change="(e) => novelStore.updateNovel(novelId, { video_resolution: (e.target as HTMLSelectElement).value })">
            <option value="720p">720p (1280×720)</option>
            <option value="1080p">1080p (1920×1080)</option>
            <option value="4K">4K (3840×2160)</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">默认宽高比</label>
          <div ref="aspectRatioDropdownRef" class="relative">
            <button
              type="button"
              class="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:border-gray-400 dark:hover:border-gray-500 transition-colors text-sm"
              @click="aspectRatioDropdownOpen = !aspectRatioDropdownOpen"
            >
              <svg width="26" height="18" viewBox="0 0 32 24" fill="none" class="flex-shrink-0 text-primary-500">
                <rect
                  :x="(32 - selectedAspectRatio.iconW) / 2"
                  :y="(24 - selectedAspectRatio.iconH) / 2"
                  :width="selectedAspectRatio.iconW"
                  :height="selectedAspectRatio.iconH"
                  rx="1.5"
                  fill="currentColor"
                />
              </svg>
              <span class="flex-1 text-left font-medium">{{ selectedAspectRatio.label }}</span>
              <svg class="w-4 h-4 text-gray-400 transition-transform" :class="aspectRatioDropdownOpen ? 'rotate-180' : ''" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
              </svg>
            </button>
            <div
              v-show="aspectRatioDropdownOpen"
              class="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg overflow-hidden"
            >
              <button
                v-for="r in ASPECT_RATIOS"
                :key="r.value"
                type="button"
                class="w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors"
                :class="(novel?.video_aspect_ratio ?? '16:9') === r.value
                  ? 'bg-primary-50 dark:bg-primary-900/40 text-primary-600 dark:text-primary-300'
                  : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'"
                @click="novelStore.updateNovel(novelId, { video_aspect_ratio: r.value }); aspectRatioDropdownOpen = false"
              >
                <svg width="26" height="18" viewBox="0 0 32 24" fill="none" class="flex-shrink-0">
                  <rect
                    :x="(32 - r.iconW) / 2"
                    :y="(24 - r.iconH) / 2"
                    :width="r.iconW"
                    :height="r.iconH"
                    rx="1.5"
                    fill="currentColor"
                  />
                </svg>
                <span class="font-medium">{{ r.label }}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- 旁白音色 -->
      <div>
        <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">旁白音色</label>
        <select :value="novel?.narration_voice ?? ''" class="input"
          @change="(e) => novelStore.updateNovel(novelId, { narration_voice: (e.target as HTMLSelectElement).value })">
          <option value="">自动（alloy）</option>
          <template v-for="group in narrationVoiceGroups" :key="group.key">
            <optgroup :label="group.label">
              <option v-for="v in group.voices" :key="v.id" :value="v.id">{{ v.label }}</option>
            </optgroup>
          </template>
        </select>
        <p class="text-xs text-gray-400 mt-1">无角色专属配音时用此音色朗读旁白，选项与角色配音设置一致</p>
      </div>

      <!-- 字幕配置 -->
      <div class="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-700">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-gray-500 dark:text-gray-400">字幕配置</span>
          <label class="flex items-center gap-2 cursor-pointer">
            <span class="text-xs text-gray-500 dark:text-gray-400">启用字幕</span>
            <div
              class="relative w-9 h-5 rounded-full transition-colors cursor-pointer"
              :class="(novel?.subtitle_enabled ?? true) ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'"
              @click="novelStore.updateNovel(novelId, { subtitle_enabled: !(novel?.subtitle_enabled ?? true) })"
            >
              <span
                class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                :class="(novel?.subtitle_enabled ?? true) ? 'translate-x-4' : 'translate-x-0.5'"
              />
            </div>
          </label>
        </div>

        <div v-if="novel?.subtitle_enabled ?? true" class="grid grid-cols-2 gap-3">
          <!-- 字幕位置 -->
          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">位置</label>
            <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <button
                v-for="pos in [{ value: 'top', label: '顶部' }, { value: 'center', label: '居中' }, { value: 'bottom', label: '底部' }]"
                :key="pos.value"
                type="button"
                class="flex-1 py-1.5 text-xs transition-colors"
                :class="(novel?.subtitle_position ?? 'bottom') === pos.value
                  ? 'bg-primary-500 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'"
                @click="novelStore.updateNovel(novelId, { subtitle_position: pos.value as any })"
              >{{ pos.label }}</button>
            </div>
          </div>

          <!-- 字体大小 -->
          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">字体大小</label>
            <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <button
                v-for="sz in [{ value: 36, label: '小' }, { value: 48, label: '中' }, { value: 60, label: '大' }, { value: 72, label: '特大' }]"
                :key="sz.value"
                type="button"
                class="flex-1 py-1.5 text-xs transition-colors"
                :class="(novel?.subtitle_font_size ?? 48) === sz.value
                  ? 'bg-primary-500 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'"
                @click="novelStore.updateNovel(novelId, { subtitle_font_size: sz.value })"
              >{{ sz.label }}</button>
            </div>
          </div>

          <!-- 字体颜色 -->
          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">字体颜色</label>
            <div class="flex items-center gap-2">
              <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                <button
                  v-for="clr in [{ value: '#FFFFFF', label: '白', bg: 'bg-white' }, { value: '#FFFF00', label: '黄', bg: 'bg-yellow-300' }, { value: '#000000', label: '黑', bg: 'bg-gray-900' }]"
                  :key="clr.value"
                  type="button"
                  class="w-8 h-8 flex items-center justify-center text-xs transition-all"
                  :class="[clr.bg, (novel?.subtitle_color ?? '#FFFFFF') === clr.value ? 'ring-2 ring-primary-500 ring-offset-1' : '']"
                  @click="novelStore.updateNovel(novelId, { subtitle_color: clr.value })"
                >
                  <span :class="clr.value === '#FFFFFF' ? 'text-gray-400' : 'text-white'">{{ clr.label }}</span>
                </button>
              </div>
              <input
                type="color"
                class="w-8 h-8 rounded cursor-pointer border border-gray-200 dark:border-gray-700 p-0.5"
                :value="novel?.subtitle_color ?? '#FFFFFF'"
                @change="(e) => novelStore.updateNovel(novelId, { subtitle_color: (e.target as HTMLInputElement).value })"
              />
            </div>
          </div>

          <!-- 背景样式 -->
          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">背景样式</label>
            <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <button
                v-for="bg in [{ value: 'none', label: '无' }, { value: 'shadow', label: '阴影' }, { value: 'box', label: '底框' }]"
                :key="bg.value"
                type="button"
                class="flex-1 py-1.5 text-xs transition-colors"
                :class="(novel?.subtitle_bg_style ?? 'shadow') === bg.value
                  ? 'bg-primary-500 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'"
                @click="novelStore.updateNovel(novelId, { subtitle_bg_style: bg.value as any })"
              >{{ bg.label }}</button>
            </div>
          </div>

          <!-- 字体 -->
          <div class="col-span-2">
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">字体</label>
            <select
              class="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-1.5 text-xs"
              :value="novel?.subtitle_font || 'Noto Sans CJK SC'"
              @change="(e) => novelStore.updateNovel(novelId, { subtitle_font: (e.target as HTMLSelectElement).value })"
            >
              <option value="Noto Sans CJK SC">Noto Sans CJK（推荐）</option>
              <option value="Source Han Sans CN">思源黑体</option>
              <option value="PingFang SC">苹方（macOS）</option>
              <option value="Microsoft YaHei">微软雅黑（Windows）</option>
            </select>
          </div>
        </div>
      </div>



    </div>

    <!-- ⑤ 危险区 -->
    <div class="card p-6 border border-red-100 dark:border-red-900/40">
      <h3 class="text-sm font-semibold text-red-500 uppercase tracking-wider mb-3">危险区</h3>
      <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">删除项目将永久移除所有章节、角色和相关数据，此操作不可撤销。</p>
      <button class="btn-error" @click="openDeleteConfirm">删除项目</button>
    </div>

    <!-- Delete novel confirm (two-step) -->
    <Teleport to="body">
      <Transition name="dialog">
        <div v-if="showDeleteNovelConfirm" class="fixed inset-0 z-[9998] flex items-center justify-center">
          <div class="fixed inset-0 bg-black/50" @click="deleteConfirmStep < 3 && closeDeleteConfirm()" />
          <div class="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6">

            <!-- Step 1: risk warning -->
            <template v-if="deleteConfirmStep === 1">
              <div class="flex items-center gap-3 mb-4">
                <div class="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                  <svg class="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                </div>
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">删除项目「{{ novel?.title }}」？</h3>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-300 mb-3">此操作 <strong class="text-red-600">不可撤销</strong>，以下所有数据将被永久删除：</p>
              <ul class="space-y-1.5 mb-5">
                <li v-for="item in [
                  '全部章节内容及版本历史',
                  '角色、物品、世界观设定',
                  '故事板与视频镜头',
                  '审查记录与弧线摘要',
                  '场景与参考图',
                ]" :key="item" class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                  <svg class="w-3.5 h-3.5 text-red-400 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                  </svg>
                  {{ item }}
                </li>
              </ul>
              <div class="flex justify-end gap-3">
                <button
                  class="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  @click="closeDeleteConfirm"
                >取消</button>
                <button
                  class="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
                  @click="deleteConfirmStep = 2"
                >我已了解风险，继续</button>
              </div>
            </template>

            <!-- Step 3: deleting in progress -->
            <template v-else-if="deleteConfirmStep === 3">
              <div class="flex flex-col items-center justify-center py-6 gap-4">
                <div class="relative w-16 h-16">
                  <svg class="w-16 h-16 animate-spin text-red-200 dark:text-red-900" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                  </svg>
                  <div class="absolute inset-0 flex items-center justify-center">
                    <svg class="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </div>
                </div>
                <div class="text-center">
                  <p class="text-base font-medium text-gray-800 dark:text-gray-100">正在删除项目…</p>
                  <p class="text-sm text-gray-400 mt-1">请勿关闭页面</p>
                </div>
              </div>
            </template>

            <!-- Step 2: type name to confirm -->
            <template v-else>
              <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">最终确认</h3>
              <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
                请输入项目名称 <strong class="text-gray-800 dark:text-gray-200">{{ novel?.title }}</strong> 以确认删除：
              </p>
              <input
                v-model="deleteConfirmInput"
                type="text"
                class="input w-full mb-5"
                placeholder="输入项目名称"
                autofocus
                @keydown.enter="deleteConfirmMatch && confirmDeleteNovel()"
              />
              <div class="flex justify-end gap-3">
                <button
                  class="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                  @click="closeDeleteConfirm"
                >取消</button>
                <button
                  class="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
                  :class="deleteConfirmMatch
                    ? 'bg-red-600 hover:bg-red-700 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'"
                  :disabled="!deleteConfirmMatch"
                  @click="deleteConfirmMatch && confirmDeleteNovel()"
                >确认删除</button>
              </div>
            </template>

          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.2s ease;
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
</style>
