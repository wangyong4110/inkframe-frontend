<script setup lang="ts">
import type { Video } from '~/types'

definePageMeta({ auth: false })

const platformApi = usePlatformApi()
const page = ref(1)
const pageSize = 12
const loading = ref(false)
const videos = ref<Video[]>([])
const total = ref(0)
const totalPages = ref(1)

async function loadFeed() {
  loading.value = true
  try {
    const res = await platformApi.getPlatformFeed({ page: page.value, page_size: pageSize })
    if (res?.data) {
      videos.value = res.data.items
      total.value = res.data.total
      totalPages.value = res.data.total_page
    }
  } catch (e: any) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

watch(page, loadFeed)
onMounted(loadFeed)

function formatDuration(secs?: number) {
  if (!secs) return ''
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-6 space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">视频广场</h1>
      <NuxtLink
        to="/platform/accounts"
        class="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
      >管理平台账号</NuxtLink>
    </div>

    <!-- Loading -->
    <div v-if="loading && !videos.length" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      <div
        v-for="i in 8"
        :key="i"
        class="bg-gray-200 dark:bg-gray-700 rounded-xl aspect-video animate-pulse"
      />
    </div>

    <!-- Empty -->
    <div v-else-if="!loading && !videos.length" class="text-center py-20 text-gray-400">
      <svg class="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.876V15.5a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
      </svg>
      <p>暂无公开视频</p>
    </div>

    <!-- Grid -->
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      <NuxtLink
        v-for="v in videos"
        :key="v.id"
        :to="`/platform/video/${v.id}`"
        class="group block rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow hover:shadow-md transition-shadow"
      >
        <!-- Cover -->
        <div class="relative aspect-video bg-gray-100 dark:bg-gray-700">
          <img
            v-if="v.cover_url"
            :src="v.cover_url"
            :alt="v.title"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div v-else class="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600">
            <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.876V15.5a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
            </svg>
          </div>
          <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
            <div class="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
              <svg class="w-5 h-5 text-gray-900 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        </div>
        <!-- Info -->
        <div class="p-3 space-y-1">
          <p class="text-sm font-medium text-gray-900 dark:text-white line-clamp-2 leading-snug">{{ v.title }}</p>
          <div class="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
            <span v-if="v.view_count !== undefined" class="flex items-center gap-1">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              {{ v.view_count }}
            </span>
          </div>
        </div>
      </NuxtLink>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-center gap-2">
      <button
        :disabled="page <= 1"
        class="px-3 py-1.5 rounded-lg text-sm border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        @click="page--"
      >上一页</button>
      <span class="text-sm text-gray-500 dark:text-gray-400">{{ page }} / {{ totalPages }}</span>
      <button
        :disabled="page >= totalPages"
        class="px-3 py-1.5 rounded-lg text-sm border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        @click="page++"
      >下一页</button>
    </div>
  </div>
</template>
