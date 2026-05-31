<script setup lang="ts">
import type { Video } from '~/types'

definePageMeta({ auth: false })

useHead({
  title: '简影 视频广场',
  meta: [
    { name: 'description', content: '简影 AI 小说视频广场 — 发现精彩视频作品' },
    { property: 'og:title', content: '简影 视频广场' },
  ],
})

const platformApi = usePlatformApi()

const sort = ref<'hot' | 'latest'>('hot')
const searchInput = ref('')
const searchQuery = ref('')
const videos = ref<Video[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 12
const loading = ref(false)
const hasMore = computed(() => videos.value.length < total.value)

// Debounce search
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(searchInput, (val) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    searchQuery.value = val
    resetAndLoad()
  }, 400)
})

watch(sort, () => resetAndLoad())

function resetAndLoad() {
  videos.value = []
  total.value = 0
  page.value = 1
  loadVideos()
}

async function loadVideos() {
  if (loading.value) return
  loading.value = true
  try {
    const res = await platformApi.getPlatformFeed({
      sort: sort.value,
      q: searchQuery.value || undefined,
      page: page.value,
      page_size: pageSize,
    })
    if (res?.data) {
      videos.value.push(...res.data.items)
      total.value = res.data.total
    }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

async function loadMore() {
  if (!hasMore.value || loading.value) return
  page.value++
  await loadVideos()
}

// Intersection Observer for infinite scroll
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

onMounted(() => {
  loadVideos()
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0].isIntersecting) loadMore()
    },
    { threshold: 0.1 },
  )
  if (sentinel.value) observer.observe(sentinel.value)
})

onUnmounted(() => observer?.disconnect())

watch(sentinel, (el) => {
  if (el && observer) observer.observe(el)
})

function formatDuration(secs?: number) {
  if (!secs) return ''
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

function formatCount(n?: number) {
  if (!n) return '0'
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`
  return String(n)
}

function timeAgo(s: string) {
  const diff = Date.now() - new Date(s).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return '今天'
  if (days < 7) return `${days}天前`
  if (days < 30) return `${Math.floor(days / 7)}周前`
  return `${Math.floor(days / 30)}月前`
}
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 py-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-bold text-white">视频广场</h1>
        <p class="text-sm text-gray-400 mt-0.5">AI 小说视频作品展示与发现</p>
      </div>
      <NuxtLink
        to="/platform/accounts"
        class="text-sm text-violet-400 hover:underline shrink-0"
      >管理平台账号</NuxtLink>
    </div>

    <!-- Search + Sort bar -->
    <div class="flex flex-col sm:flex-row gap-3 mb-6">
      <!-- Search -->
      <div class="relative flex-1">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
        </svg>
        <input
          v-model="searchInput"
          type="text"
          placeholder="搜索视频..."
          class="w-full pl-10 pr-4 py-2.5 border border-gray-700 rounded-xl bg-gray-900 text-sm focus:outline-none focus:border-indigo-400"
        />
      </div>

      <!-- Sort tabs -->
      <div class="flex bg-gray-800 rounded-xl p-1 gap-1 shrink-0">
        <button
          v-for="tab in [{ key: 'hot', label: '🔥 最热' }, { key: 'latest', label: '🕒 最新' }]"
          :key="tab.key"
          @click="sort = tab.key as 'hot' | 'latest'"
          :class="[
            'px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
            sort === tab.key
              ? 'bg-gray-700 text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
          ]"
        >{{ tab.label }}</button>
      </div>
    </div>

    <!-- Result count -->
    <div v-if="searchQuery && !loading" class="text-sm text-gray-400 mb-4">
      搜索「{{ searchQuery }}」 共 {{ total }} 个结果
    </div>

    <!-- Skeleton (first load) -->
    <div v-if="loading && !videos.length" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      <div v-for="i in 8" :key="i" class="rounded-xl overflow-hidden bg-gray-800 animate-pulse">
        <div class="aspect-video bg-gray-200 dark:bg-gray-700" />
        <div class="p-3 space-y-2">
          <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-4/5" />
          <div class="h-2.5 bg-gray-200 dark:bg-gray-700 rounded w-2/5" />
        </div>
      </div>
    </div>

    <!-- Empty -->
    <div v-else-if="!loading && !videos.length" class="text-center py-24 text-gray-400">
      <svg class="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.876V15.5a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
      </svg>
      <p class="text-lg">{{ searchQuery ? '没有找到相关视频' : '暂无公开视频' }}</p>
      <p v-if="searchQuery" class="text-sm mt-2">
        <button @click="searchInput = ''" class="text-indigo-500 hover:underline">清除搜索</button>
      </p>
    </div>

    <!-- Grid -->
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      <NuxtLink
        v-for="v in videos"
        :key="v.id"
        :to="`/platform/video/${v.id}`"
        class="group block rounded-xl overflow-hidden bg-gray-900 shadow-sm hover:shadow-md transition-shadow"
      >
        <!-- Cover with lazy loading -->
        <div class="relative aspect-video bg-gray-800 overflow-hidden">
          <img
            v-if="v.cover_url"
            :src="v.cover_url"
            :alt="v.title"
            loading="lazy"
            decoding="async"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div v-else class="w-full h-full flex items-center justify-center">
            <svg class="w-10 h-10 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.876V15.5a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
            </svg>
          </div>

          <!-- Play overlay -->
          <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/20">
            <div class="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              <svg class="w-5 h-5 text-gray-900 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>

          <!-- Duration badge -->
          <div v-if="v.duration" class="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded font-mono">
            {{ formatDuration(v.duration) }}
          </div>

          <!-- Hot badge -->
          <div v-if="sort === 'hot' && (v.hot_score ?? 0) > 10" class="absolute top-2 left-2 bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full">
            🔥
          </div>
        </div>

        <!-- Info -->
        <div class="p-3 space-y-1">
          <p class="text-sm font-semibold text-white line-clamp-2 leading-snug">{{ v.title }}</p>
          <p v-if="v.novel?.title" class="text-xs text-violet-400 truncate">{{ v.novel.title }}</p>
          <div class="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
            <div class="flex items-center gap-2.5">
              <span class="flex items-center gap-1">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                {{ formatCount(v.view_count) }}
              </span>
              <span v-if="v.like_count" class="flex items-center gap-1">
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                </svg>
                {{ formatCount(v.like_count) }}
              </span>
            </div>
            <span>{{ timeAgo(v.published_at ?? v.created_at) }}</span>
          </div>
        </div>
      </NuxtLink>
    </div>

    <!-- Infinite scroll sentinel -->
    <div ref="sentinel" class="h-10 mt-4 flex items-center justify-center">
      <div v-if="loading && videos.length > 0" class="flex items-center gap-2 text-sm text-gray-400">
        <div class="w-4 h-4 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
        加载中...
      </div>
      <p v-else-if="!hasMore && videos.length > 0" class="text-xs text-gray-400">
        已显示全部 {{ total }} 个视频
      </p>
    </div>
  </div>
</template>
