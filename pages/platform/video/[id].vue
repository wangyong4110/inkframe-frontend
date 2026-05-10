<script setup lang="ts">
import type { Video } from '~/types'

definePageMeta({ auth: false })

const route = useRoute()
const platformApi = usePlatformApi()
const videoId = computed(() => Number(route.params.id))

const video = ref<Video | null>(null)
const loading = ref(true)
const viewRecorded = ref(false)

async function loadVideo() {
  loading.value = true
  try {
    const res = await platformApi.getPlatformVideo(videoId.value)
    video.value = res?.data ?? null
  } catch (e: any) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function recordView() {
  if (viewRecorded.value) return
  viewRecorded.value = true
  try {
    await platformApi.recordView(videoId.value)
  } catch {
    // ignore
  }
}

onMounted(async () => {
  await loadVideo()
  recordView()
})

useHead({
  title: computed(() => video.value?.title ?? '视频广场'),
})
</script>

<template>
  <div class="max-w-4xl mx-auto px-4 py-6 space-y-6">
    <!-- Back -->
    <NuxtLink
      to="/platform"
      class="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
    >
      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" /></svg>
      视频广场
    </NuxtLink>

    <!-- Loading -->
    <div v-if="loading" class="space-y-4">
      <div class="w-full aspect-video bg-gray-200 dark:bg-gray-700 rounded-2xl animate-pulse" />
      <div class="h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-2/3" />
    </div>

    <!-- Not found -->
    <div v-else-if="!video" class="text-center py-20 text-gray-400">
      <p>视频不存在或未公开</p>
    </div>

    <!-- Video -->
    <template v-else>
      <!-- Player -->
      <div class="w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-lg">
        <video
          v-if="video.final_video_url"
          :src="video.final_video_url"
          :poster="video.cover_url || undefined"
          controls
          autoplay
          class="w-full h-full object-contain"
          @play="recordView"
        />
        <div v-else class="w-full h-full flex items-center justify-center text-gray-500">
          <p>视频处理中...</p>
        </div>
      </div>

      <!-- Meta -->
      <div class="space-y-2">
        <h1 class="text-xl font-bold text-gray-900 dark:text-white">{{ video.title }}</h1>
        <div class="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
          <span v-if="video.view_count !== undefined" class="flex items-center gap-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
            {{ video.view_count }} 次播放
          </span>
          <span v-if="video.published_at">{{ new Date(video.published_at).toLocaleDateString('zh-CN') }}</span>
        </div>
      </div>

      <!-- Description / source -->
      <div v-if="video.novel_id" class="p-4 bg-gray-50 dark:bg-gray-800 rounded-xl text-sm text-gray-600 dark:text-gray-400">
        <span>来源小说：</span>
        <NuxtLink :to="`/novel/${video.novel_id}`" class="text-blue-600 dark:text-blue-400 hover:underline">
          查看原著
        </NuxtLink>
      </div>
    </template>
  </div>
</template>
