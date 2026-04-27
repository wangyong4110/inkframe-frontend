<script setup lang="ts">
import type { VideoQualityTier } from '~/types'

const route = useRoute()
const router = useRouter()
const videoStore = useVideoStore()

const videoId = parseInt(route.params.id as string)

const QUALITY_LABELS: Record<VideoQualityTier, string> = { draft: '草稿', preview: '预览', final: '正式' }
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
  pending: '待生成', generating: '生成中', completed: '已完成', failed: '失败',
}

const video = computed(() => videoStore.currentVideo)
const shots = computed(() => videoStore.storyboard)
const completedShots = computed(() => shots.value.filter(s => s.status === 'completed'))
const completionPercent = computed(() => {
  if (shots.value.length === 0) return 0
  return Math.round((completedShots.value.length / shots.value.length) * 100)
})
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
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ video?.title || '加载中...' }}</h1>
            <span v-if="video?.quality_tier" class="px-2 py-0.5 text-xs font-medium rounded-full" :class="QUALITY_COLORS[video.quality_tier]">
              {{ QUALITY_LABELS[video.quality_tier] }}
            </span>
            <span v-if="video?.status" class="px-2 py-0.5 text-xs font-medium rounded-full" :class="STATUS_COLORS[video.status]">
              {{ STATUS_LABELS[video.status] || video.status }}
            </span>
          </div>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {{ video?.resolution }} · {{ video?.aspect_ratio }} · {{ video?.frame_rate }}fps
            <span v-if="shots.length > 0"> · {{ shots.length }} 个镜头（{{ completedShots.length }} 已完成）</span>
          </p>
        </div>
      </div>
      <div v-if="shots.length > 0" class="flex items-center gap-3">
        <div class="text-right">
          <p class="text-sm font-medium text-gray-900 dark:text-white">{{ completionPercent }}%</p>
          <p class="text-xs text-gray-500 dark:text-gray-400">分镜完成</p>
        </div>
        <div class="w-20 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div class="h-full bg-primary-500 transition-all" :style="{ width: `${completionPercent}%` }"></div>
        </div>
      </div>
    </div>

    <VideoEditor :video-id="videoId" />
  </div>
</template>
