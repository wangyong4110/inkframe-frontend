<script setup lang="ts">
import type { StoryboardShot, ShotGenerationMode, VideoQualityTier } from '~/types'

const route = useRoute()
const router = useRouter()
const videoStore = useVideoStore()
const toast = useToast()

const videoId = parseInt(route.params.id as string)

const activeTab = ref('storyboard')
const generatingStoryboard = computed(() => videoStore.generating)
const batchGenerating = ref(false)
const selectedShotIds = ref<Set<number>>(new Set())

// LLM provider for storyboard generation
const llmProviders = ref<{ name: string; display_name: string }[]>([])
const selectedLLMProvider = ref('')

// Video provider for shot generation
const videoProviders = ref<{ name: string; display_name: string }[]>([])
const selectedVideoProvider = ref('')

// 配音字幕状态
const generatingVoice = ref<Record<number, boolean>>({})
const voiceStyle = ref('neutral')
const subtitleEnabled = ref(true)

// BGM 状态
const selectedBgm = ref('')
const bgmVolume = ref(60)
const generatingBgm = ref(false)
const BGM_OPTIONS = [
  { id: 'epic', name: '史诗', desc: '大气磅礴，适合战斗/高潮', icon: '⚔️' },
  { id: 'romantic', name: '浪漫', desc: '柔情旋律，适合感情戏', icon: '💕' },
  { id: 'mysterious', name: '神秘', desc: '悬疑配乐，适合推理/惊悚', icon: '🌫️' },
  { id: 'peaceful', name: '舒缓', desc: '平静空灵，适合日常/旁白', icon: '🌿' },
  { id: 'tense', name: '紧张', desc: '节奏急促，适合追逐/危机', icon: '⚡' },
  { id: 'sad', name: '伤感', desc: '忧郁旋律，适合离别/失去', icon: '🌧️' },
]

// 导出状态
const exportFormat = ref('capcut')
const stitching = ref(false)
const exportingCapCut = ref(false)
const exportUrl = ref('')

const video = computed(() => videoStore.currentVideo)
const shots = computed(() => videoStore.storyboard)

const QUALITY_LABELS: Record<VideoQualityTier, string> = {
  draft: '草稿',
  preview: '预览',
  final: '正式',
}
const QUALITY_COLORS: Record<VideoQualityTier, string> = {
  draft: 'bg-gray-100 text-gray-700',
  preview: 'bg-blue-100 text-blue-700',
  final: 'bg-amber-100 text-amber-700',
}
const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600',
  generating: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}
const STATUS_LABELS: Record<string, string> = {
  pending: '待生成',
  generating: '生成中',
  completed: '已完成',
  failed: '失败',
}

const pendingShots = computed(() => shots.value.filter(s => s.status === 'pending'))
const completedShots = computed(() => shots.value.filter(s => s.status === 'completed'))

const allPendingSelected = computed(
  () => pendingShots.value.length > 0 && pendingShots.value.every(s => selectedShotIds.value.has(s.id))
)

const completionPercent = computed(() => {
  if (shots.value.length === 0) return 0
  return Math.round((completedShots.value.length / shots.value.length) * 100)
})

const TABS = [
  { key: 'storyboard', label: '分镜脚本', icon: 'M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4' },
  { key: 'voice', label: '配音字幕', icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z' },
  { key: 'bgm', label: '背景音乐', icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3' },
  { key: 'export', label: '导出', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4' },
]

onMounted(async () => {
  const { getLLMCapableProviders } = useModelApi()
  const { getVideoProviders } = useVideoApi()
  const [llmRes, videoRes] = await Promise.allSettled([
    getLLMCapableProviders(),
    getVideoProviders(),
  ])
  if (llmRes.status === 'fulfilled') llmProviders.value = (llmRes.value as any)?.data ?? []
  if (videoRes.status === 'fulfilled') videoProviders.value = (videoRes.value as any)?.data ?? []

  try {
    await videoStore.fetchVideo(videoId)
    await videoStore.fetchStoryboard(videoId)
  } catch (e: any) {
    toast.error('加载失败：' + (e.message || ''))
  }
})

async function handleGenerateStoryboard() {
  try {
    await videoStore.generateStoryboard(videoId, selectedLLMProvider.value || undefined)
    toast.success('分镜生成任务已提交，请稍候...')
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || ''))
  }
}

watch(() => videoStore.storyboardTaskStatus, (status) => {
  if (status === 'completed') {
    toast.success('分镜脚本生成完成')
    videoStore.fetchStoryboard(videoId)
  } else if (status === 'failed') {
    toast.error('分镜生成失败：' + (videoStore.error || ''))
  }
})

async function toggleShotMode(shot: StoryboardShot) {
  const newMode: ShotGenerationMode = shot.generation_mode === 'video' ? 'static' : 'video'
  try {
    await videoStore.updateShot(videoId, shot.id, { generation_mode: newMode })
  } catch (e: any) {
    toast.error('更新失败：' + (e.message || ''))
  }
}

async function handleGenerateShot(shot: StoryboardShot) {
  try {
    await videoStore.generateShot(videoId, shot.id, selectedVideoProvider.value || undefined)
    toast.success(`镜头 ${shot.shot_no} 已加入生成队列`)
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || ''))
  }
}

function toggleSelectShot(id: number) {
  if (selectedShotIds.value.has(id)) {
    selectedShotIds.value.delete(id)
  } else {
    selectedShotIds.value.add(id)
  }
}

function toggleSelectAllPending() {
  if (allPendingSelected.value) {
    for (const s of pendingShots.value) selectedShotIds.value.delete(s.id)
  } else {
    for (const s of pendingShots.value) selectedShotIds.value.add(s.id)
  }
}

async function handleBatchGenerate() {
  if (selectedShotIds.value.size === 0) return
  batchGenerating.value = true
  try {
    const ids = [...selectedShotIds.value]
    await videoStore.batchGenerateShots(videoId, ids, video.value?.quality_tier, selectedVideoProvider.value || undefined)
    selectedShotIds.value.clear()
    toast.success(`${ids.length} 个镜头已加入生成队列`)
  } catch (e: any) {
    toast.error('批量生成失败：' + (e.message || ''))
  } finally {
    batchGenerating.value = false
  }
}

// 配音生成（占位，后端 TTS 路由开发中）
async function handleGenerateVoice(shot: StoryboardShot) {
  generatingVoice.value[shot.id] = true
  try {
    // TODO: POST /videos/:id/shots/:shot_id/tts
    await new Promise(resolve => setTimeout(resolve, 1500))
    toast.success(`镜头 #${shot.shot_no} 配音已生成`)
  } catch (e: any) {
    toast.error('配音生成失败：' + (e.message || ''))
  } finally {
    generatingVoice.value[shot.id] = false
  }
}

async function handleGenerateAllVoice() {
  const shotList = shots.value.filter(s => s.dialogue || s.description)
  if (shotList.length === 0) {
    toast.error('没有可生成配音的镜头')
    return
  }
  toast.success(`已提交 ${shotList.length} 个镜头配音任务`)
}

// BGM 生成
async function handleGenerateBgm() {
  if (!selectedBgm.value) {
    toast.error('请先选择 BGM 风格')
    return
  }
  generatingBgm.value = true
  try {
    // TODO: POST /videos/:id/bgm/generate
    await new Promise(resolve => setTimeout(resolve, 2000))
    toast.success('背景音乐已生成')
  } catch (e: any) {
    toast.error('BGM 生成失败：' + (e.message || ''))
  } finally {
    generatingBgm.value = false
  }
}

// 导出
async function handleStitch() {
  stitching.value = true
  try {
    const { request } = useApi()
    await request(`/videos/${videoId}/stitch`, { method: 'POST' })
    toast.success('视频合成任务已提交，完成后可下载')
  } catch (e: any) {
    toast.error('合成失败：' + (e.message || ''))
  } finally {
    stitching.value = false
  }
}

async function handleExportCapCut() {
  exportingCapCut.value = true
  try {
    const api = useVideoApi()
    const blob = await api.exportCapcut(videoId)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${video.value?.title || 'video_' + videoId}_capcut.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('剪映草稿已导出，请在剪映中导入 ZIP 中的草稿文件夹')
  } catch (e: any) {
    toast.error('导出失败：' + (e.message || ''))
  } finally {
    exportingCapCut.value = false
  }
}

const cameraSizeLabel: Record<string, string> = {
  extreme_wide: '极远',
  wide: '远景',
  full: '全景',
  medium: '中景',
  close_up: '近景',
  extreme_close_up: '特写',
}
const cameraTypeLabel: Record<string, string> = {
  static: '固定',
  pan: '摇镜',
  zoom: '推拉',
  tracking: '跟拍',
  dolly: '移镜',
  crane: '升降',
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-4">
        <button class="btn-ghost" @click="router.push('/video')">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <div class="flex items-center gap-3">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ video?.title || '加载中...' }}
            </h1>
            <span
              v-if="video?.quality_tier"
              class="px-2 py-0.5 text-xs font-medium rounded-full"
              :class="QUALITY_COLORS[video.quality_tier]"
            >
              {{ QUALITY_LABELS[video.quality_tier] }}
            </span>
            <span
              v-if="video?.status"
              class="px-2 py-0.5 text-xs font-medium rounded-full"
              :class="STATUS_COLORS[video.status]"
            >
              {{ STATUS_LABELS[video.status] || video.status }}
            </span>
          </div>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {{ video?.resolution }} · {{ video?.aspect_ratio }} · {{ video?.frame_rate }}fps
            <span v-if="shots.length > 0">
              · {{ shots.length }} 个镜头（{{ completedShots.length }} 已完成）
            </span>
          </p>
        </div>
      </div>

      <!-- 整体进度 -->
      <div v-if="shots.length > 0" class="flex items-center gap-3">
        <div class="text-right">
          <p class="text-sm font-medium text-gray-900 dark:text-white">{{ completionPercent }}%</p>
          <p class="text-xs text-gray-500 dark:text-gray-400">分镜完成</p>
        </div>
        <div class="w-20 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            class="h-full bg-primary-500 transition-all"
            :style="{ width: `${completionPercent}%` }"
          ></div>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="border-b border-gray-200 dark:border-gray-700">
      <nav class="flex space-x-1">
        <button
          v-for="tab in TABS"
          :key="tab.key"
          class="flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors"
          :class="[
            activeTab === tab.key
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          ]"
          @click="activeTab = tab.key"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="tab.icon" />
          </svg>
          {{ tab.label }}
        </button>
      </nav>
    </div>

    <!-- Task status banner -->
    <div
      v-if="videoStore.storyboardTaskStatus && videoStore.storyboardTaskStatus !== 'completed'"
      class="flex items-center gap-3 px-4 py-3 rounded-lg text-sm"
      :class="{
        'bg-yellow-50 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200': videoStore.storyboardTaskStatus === 'pending' || videoStore.storyboardTaskStatus === 'running',
        'bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200': videoStore.storyboardTaskStatus === 'failed',
      }"
    >
      <svg v-if="videoStore.storyboardTaskStatus !== 'failed'" class="w-4 h-4 animate-spin flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      <svg v-else class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>
        <span v-if="videoStore.storyboardTaskStatus === 'pending'">分镜生成任务排队中...</span>
        <span v-else-if="videoStore.storyboardTaskStatus === 'running'">AI 正在生成分镜脚本，请稍候...</span>
        <span v-else-if="videoStore.storyboardTaskStatus === 'failed'">分镜生成失败：{{ videoStore.error }}</span>
      </span>
      <span v-if="videoStore.storyboardTaskId" class="ml-auto text-xs opacity-60 font-mono">
        任务 {{ videoStore.storyboardTaskId.slice(0, 8) }}
      </span>
    </div>

    <!-- ============ 分镜脚本 Tab ============ -->
    <div v-if="activeTab === 'storyboard'">
      <!-- Actions -->
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <!-- LLM model selector for storyboard -->
        <div v-if="llmProviders.length > 0" class="flex items-center gap-1.5">
          <label class="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">分镜模型</label>
          <select v-model="selectedLLMProvider" class="input text-sm py-1 h-8">
            <option value="">默认</option>
            <option v-for="p in llmProviders" :key="p.name" :value="p.name">
              {{ p.display_name || p.name }}
            </option>
          </select>
        </div>

        <!-- Video provider selector for shot generation -->
        <div v-if="videoProviders.length > 0" class="flex items-center gap-1.5">
          <label class="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">视频提供商</label>
          <select v-model="selectedVideoProvider" class="input text-sm py-1 h-8">
            <option value="">默认</option>
            <option v-for="p in videoProviders" :key="p.name" :value="p.name">
              {{ p.display_name || p.name }}
            </option>
          </select>
        </div>

        <button
          class="btn-outline"
          :disabled="generatingStoryboard"
          @click="handleGenerateStoryboard"
        >
          <svg v-if="generatingStoryboard" class="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {{ shots.length > 0 ? '重新生成分镜' : '生成分镜脚本' }}
        </button>

        <button
          v-if="shots.length > 0 && selectedShotIds.size > 0"
          class="btn-primary"
          :disabled="batchGenerating"
          @click="handleBatchGenerate"
        >
          <svg v-if="batchGenerating" class="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          生成选中 ({{ selectedShotIds.size }})
        </button>

        <div v-if="shots.length > 0" class="ml-auto flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          完成后可切换到「配音字幕」和「背景音乐」Tab 继续制作
        </div>
      </div>

      <!-- Empty storyboard -->
      <div v-if="shots.length === 0 && !videoStore.loading" class="card p-12 text-center">
        <svg class="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
        </svg>
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">还没有分镜脚本</h3>
        <p class="text-gray-500 dark:text-gray-400 mb-6">点击「生成分镜脚本」，AI 将自动从章节内容提取镜头</p>
        <button class="btn-primary" :disabled="generatingStoryboard" @click="handleGenerateStoryboard">
          生成分镜脚本
        </button>
      </div>

      <!-- Storyboard shots -->
      <div v-else-if="shots.length > 0">
        <!-- Batch select bar -->
        <div class="flex items-center gap-3 mb-3">
          <label class="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              :checked="allPendingSelected"
              :indeterminate="!allPendingSelected && selectedShotIds.size > 0"
              class="rounded"
              @change="toggleSelectAllPending"
            />
            全选待生成镜头（{{ pendingShots.length }}）
          </label>
          <span class="text-xs text-gray-400">点击镜头卡片左上角复选框选择；点击 ▶/🖼 切换生成模式</span>
        </div>

        <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div
            v-for="shot in shots"
            :key="shot.id"
            class="card overflow-hidden transition-shadow"
            :class="selectedShotIds.has(shot.id) ? 'ring-2 ring-primary-500' : ''"
          >
            <!-- Image / Video preview area -->
            <div class="relative h-36 bg-gray-900 flex items-center justify-center">
              <img
                v-if="shot.image_url"
                :src="shot.image_url"
                class="absolute inset-0 w-full h-full object-cover"
              />
              <svg v-else class="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>

              <!-- Generating overlay -->
              <div v-if="shot.status === 'generating'" class="absolute inset-0 bg-black/60 flex items-center justify-center">
                <div class="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin"></div>
              </div>

              <!-- Select checkbox -->
              <div class="absolute top-2 left-2" @click.stop>
                <input
                  type="checkbox"
                  :checked="selectedShotIds.has(shot.id)"
                  class="w-4 h-4 rounded cursor-pointer accent-primary-500"
                  @change="toggleSelectShot(shot.id)"
                />
              </div>

              <!-- Shot number -->
              <span class="absolute top-2 left-8 bg-black/60 text-white text-xs font-bold px-1.5 py-0.5 rounded">
                #{{ shot.shot_no }}
              </span>

              <!-- Mode toggle button -->
              <button
                class="absolute top-2 right-2 w-7 h-7 rounded-lg flex items-center justify-center transition-colors text-white text-xs font-bold"
                :class="shot.generation_mode === 'video' ? 'bg-primary-500 hover:bg-primary-600' : 'bg-black/50 hover:bg-black/70'"
                :title="shot.generation_mode === 'video' ? '当前：视频模式（点击切换为静图）' : '当前：静图模式（点击切换为视频）'"
                @click.stop="toggleShotMode(shot)"
              >
                <span v-if="shot.generation_mode === 'video'">▶</span>
                <span v-else>🖼</span>
              </button>
            </div>

            <!-- Shot info -->
            <div class="p-3 space-y-2">
              <div class="flex items-start justify-between gap-2">
                <p class="text-sm text-gray-700 dark:text-gray-300 line-clamp-2 flex-1">
                  {{ shot.description || '无描述' }}
                </p>
                <span
                  class="flex-shrink-0 px-1.5 py-0.5 text-[10px] font-medium rounded"
                  :class="STATUS_COLORS[shot.status]"
                >
                  {{ STATUS_LABELS[shot.status] }}
                </span>
              </div>

              <div class="flex items-center gap-2 text-xs text-gray-400">
                <span>{{ cameraSizeLabel[shot.shot_size] || shot.shot_size }}</span>
                <span>·</span>
                <span>{{ cameraTypeLabel[shot.camera_type] || shot.camera_type }}</span>
                <span>·</span>
                <span>{{ shot.duration }}s</span>
              </div>

              <div v-if="shot.dialogue" class="text-xs text-gray-500 dark:text-gray-400 italic line-clamp-1">
                「{{ shot.dialogue }}」
              </div>

              <!-- Generate button for pending shots -->
              <button
                v-if="shot.status === 'pending' || shot.status === 'failed'"
                class="w-full mt-1 py-1.5 text-xs font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-primary-50 hover:text-primary-700 dark:hover:bg-primary-900/30 dark:hover:text-primary-300 transition-colors"
                @click="handleGenerateShot(shot)"
              >
                {{ shot.status === 'failed' ? '重新生成' : '单独生成' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading skeleton -->
      <div v-else-if="videoStore.loading" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div v-for="i in 6" :key="i" class="card overflow-hidden">
          <div class="skeleton h-36 w-full"></div>
          <div class="p-3 space-y-2">
            <div class="skeleton h-4 w-3/4"></div>
            <div class="skeleton h-3 w-1/2"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ 配音字幕 Tab ============ -->
    <div v-if="activeTab === 'voice'" class="space-y-4">
      <div class="card p-4">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="font-semibold text-gray-900 dark:text-white">配音设置</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">为每个镜头的台词和旁白生成语音配音</p>
          </div>
          <button
            class="btn-primary"
            :disabled="shots.length === 0"
            @click="handleGenerateAllVoice"
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
            一键生成全部配音
          </button>
        </div>

        <div class="grid gap-4 sm:grid-cols-2 mb-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">配音风格</label>
            <select v-model="voiceStyle" class="input">
              <option value="neutral">标准旁白</option>
              <option value="dramatic">戏剧化</option>
              <option value="soft">温柔</option>
              <option value="powerful">激昂</option>
            </select>
          </div>
          <div class="flex items-center gap-3 pt-6">
            <label class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
              <input v-model="subtitleEnabled" type="checkbox" class="rounded accent-primary-500" />
              同步生成字幕
            </label>
            <span class="text-xs text-gray-400">（根据配音内容自动生成 SRT 字幕文件）</span>
          </div>
        </div>
      </div>

      <!-- Shot voice list -->
      <div v-if="shots.length === 0" class="card p-8 text-center text-gray-500 dark:text-gray-400">
        请先在「分镜脚本」Tab 生成分镜
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="shot in shots"
          :key="shot.id"
          class="card p-4"
        >
          <div class="flex items-start gap-4">
            <!-- Thumbnail -->
            <div class="w-20 h-14 bg-gray-900 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center">
              <img v-if="shot.image_url" :src="shot.image_url" class="w-full h-full object-cover" />
              <span v-else class="text-xs text-gray-500">#{{ shot.shot_no }}</span>
            </div>
            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <span class="text-sm font-medium text-gray-900 dark:text-white">镜头 #{{ shot.shot_no }}</span>
                <span class="text-xs text-gray-400">{{ shot.duration }}s</span>
              </div>
              <p class="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                {{ shot.dialogue || shot.description || '（无台词）' }}
              </p>
              <!-- Voice audio player placeholder -->
              <div class="mt-2 flex items-center gap-2">
                <div class="flex-1 h-6 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div class="h-full w-1/3 bg-primary-200 dark:bg-primary-900/50 rounded-full"></div>
                </div>
                <span class="text-xs text-gray-400">未生成</span>
              </div>
            </div>
            <!-- Actions -->
            <button
              class="btn-outline text-sm flex-shrink-0"
              :disabled="generatingVoice[shot.id]"
              @click="handleGenerateVoice(shot)"
            >
              <svg v-if="generatingVoice[shot.id]" class="w-3 h-3 mr-1 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {{ generatingVoice[shot.id] ? '生成中' : '生成配音' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ 背景音乐 Tab ============ -->
    <div v-if="activeTab === 'bgm'" class="space-y-4">
      <div class="card p-6">
        <h3 class="font-semibold text-gray-900 dark:text-white mb-1">背景音乐</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">为视频选择或生成背景音乐，AI 将根据情节情绪智能匹配</p>

        <!-- BGM Style Options -->
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-6">
          <button
            v-for="bgm in BGM_OPTIONS"
            :key="bgm.id"
            type="button"
            class="flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all"
            :class="selectedBgm === bgm.id
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'"
            @click="selectedBgm = bgm.id"
          >
            <span class="text-2xl">{{ bgm.icon }}</span>
            <div>
              <p class="font-medium text-sm text-gray-900 dark:text-white">{{ bgm.name }}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{{ bgm.desc }}</p>
            </div>
          </button>
        </div>

        <!-- Volume -->
        <div class="mb-6">
          <div class="flex items-center justify-between mb-2">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300">音量</label>
            <span class="text-sm text-gray-500 dark:text-gray-400">{{ bgmVolume }}%</span>
          </div>
          <input
            v-model.number="bgmVolume"
            type="range"
            min="0"
            max="100"
            step="5"
            class="w-full accent-primary-500"
          />
        </div>

        <button
          class="btn-primary"
          :disabled="generatingBgm || !selectedBgm"
          @click="handleGenerateBgm"
        >
          <svg v-if="generatingBgm" class="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {{ generatingBgm ? '生成中...' : '生成背景音乐' }}
        </button>
      </div>

      <!-- BGM Preview placeholder -->
      <div class="card p-4">
        <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">音乐预览</h4>
        <div class="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
          <button class="w-10 h-10 rounded-full bg-primary-100 dark:bg-primary-900/50 flex items-center justify-center text-primary-600">
            <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </button>
          <div class="flex-1">
            <div class="h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full">
              <div class="h-full w-0 bg-primary-500 rounded-full"></div>
            </div>
            <div class="flex justify-between text-xs text-gray-400 mt-1">
              <span>0:00</span>
              <span>{{ selectedBgm ? '已选：' + BGM_OPTIONS.find(b => b.id === selectedBgm)?.name : '未选择' }}</span>
              <span>-:--</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ============ 导出 Tab ============ -->
    <div v-if="activeTab === 'export'" class="space-y-4">
      <!-- Progress overview -->
      <div class="card p-4">
        <h3 class="font-semibold text-gray-900 dark:text-white mb-4">制作进度</h3>
        <div class="space-y-3">
          <div class="flex items-center gap-3">
            <div class="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
              :class="shots.length > 0 ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span class="text-sm" :class="shots.length > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-400'">
              分镜脚本
              <span v-if="shots.length > 0" class="text-xs text-gray-400 ml-1">（{{ completedShots.length }}/{{ shots.length }} 张图片已生成）</span>
            </span>
          </div>
          <div class="flex items-center gap-3">
            <div class="w-6 h-6 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center flex-shrink-0">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span class="text-sm text-gray-400">配音字幕（可选）</span>
          </div>
          <div class="flex items-center gap-3">
            <div class="w-6 h-6 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center flex-shrink-0">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span class="text-sm text-gray-400">背景音乐（可选）</span>
          </div>
        </div>
      </div>

      <!-- Export options -->
      <div class="card p-6">
        <h3 class="font-semibold text-gray-900 dark:text-white mb-4">导出格式</h3>
        <div class="grid gap-3 sm:grid-cols-2 mb-6">
          <button
            type="button"
            class="flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all"
            :class="exportFormat === 'capcut'
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'"
            @click="exportFormat = 'capcut'"
          >
            <span class="text-2xl">✂️</span>
            <div>
              <p class="font-medium text-sm text-gray-900 dark:text-white">剪映草稿</p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">导出为剪映项目文件，可直接在剪映中打开编辑</p>
            </div>
          </button>
          <button
            type="button"
            class="flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all"
            :class="exportFormat === 'ffmpeg'
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'"
            @click="exportFormat = 'ffmpeg'"
          >
            <span class="text-2xl">🎬</span>
            <div>
              <p class="font-medium text-sm text-gray-900 dark:text-white">FFmpeg 脚本</p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">生成 FFmpeg 拼接脚本，本地直接渲染 MP4</p>
            </div>
          </button>
        </div>

        <div class="flex gap-3">
          <!-- 剪映导出 -->
          <button
            v-if="exportFormat === 'capcut'"
            class="btn-primary"
            :disabled="shots.length === 0 || exportingCapCut"
            @click="handleExportCapCut"
          >
            <svg v-if="exportingCapCut" class="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <svg v-else class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {{ exportingCapCut ? '导出中...' : '导出剪映草稿' }}
          </button>

          <!-- FFmpeg 视频合成 -->
          <button
            v-if="exportFormat === 'ffmpeg'"
            class="btn-primary"
            :disabled="completedShots.length === 0 || stitching"
            @click="handleStitch"
          >
            <svg v-if="stitching" class="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {{ stitching ? '合成中...' : '合成视频' }}
          </button>

          <button
            v-if="exportUrl"
            class="btn-outline"
            @click="() => window.open(exportUrl, '_blank')"
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            下载文件
          </button>
        </div>

        <div v-if="shots.length === 0" class="mt-3 text-sm text-amber-600 dark:text-amber-400">
          请先生成分镜脚本和图片素材，再导出
        </div>
      </div>
    </div>
  </div>
</template>
