<script setup lang="ts">
import type { StoryboardShot, ShotGenerationMode, VideoQualityTier } from '~/types'

const route = useRoute()
const router = useRouter()
const videoStore = useVideoStore()
const toast = useToast()

const videoId = parseInt(route.params.id as string)

const generatingStoryboard = ref(false)
const batchGenerating = ref(false)
const selectedShotIds = ref<Set<number>>(new Set())

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

onMounted(async () => {
  try {
    await videoStore.fetchVideo(videoId)
    await videoStore.fetchStoryboard(videoId)
  } catch (e: any) {
    toast.error('加载失败：' + (e.message || ''))
  }
})

async function handleGenerateStoryboard() {
  generatingStoryboard.value = true
  try {
    await videoStore.generateStoryboard(videoId)
    toast.success('分镜脚本生成完成')
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || ''))
  } finally {
    generatingStoryboard.value = false
  }
}

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
    await videoStore.generateShot(videoId, shot.id)
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
    await videoStore.batchGenerateShots(videoId, ids, video.value?.quality_tier)
    selectedShotIds.value.clear()
    toast.success(`${ids.length} 个镜头已加入生成队列`)
  } catch (e: any) {
    toast.error('批量生成失败：' + (e.message || ''))
  } finally {
    batchGenerating.value = false
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

      <!-- Actions -->
      <div class="flex items-center gap-2">
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
        <span class="text-xs text-gray-400">点击镜头卡片左上角复选框选择；点击 ⚡/🖼 切换生成模式</span>
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
</template>
