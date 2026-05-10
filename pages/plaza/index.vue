<script setup lang="ts">
import type { Novel } from '~/types'

definePageMeta({ auth: false })

useHead({
  title: 'InkFrame 小说广场',
  meta: [
    { name: 'description', content: 'InkFrame AI 小说广场 — 发现精彩 AI 创作作品' },
    { property: 'og:title', content: 'InkFrame 小说广场' },
  ],
})

const novelApi = usePublicNovelApi()

const sort = ref<'hot' | 'latest'>('hot')
const searchInput = ref('')
const searchQuery = ref('')
const novels = ref<Novel[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 12
const loading = ref(false)
const hasMore = computed(() => novels.value.length < total.value)

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
  novels.value = []
  total.value = 0
  page.value = 1
  loadNovels()
}

async function loadNovels() {
  if (loading.value) return
  loading.value = true
  try {
    const res = await novelApi.getNovelFeed({
      sort: sort.value,
      q: searchQuery.value || undefined,
      page: page.value,
      page_size: pageSize,
    })
    if (res?.data) {
      novels.value.push(...res.data.items)
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
  await loadNovels()
}

// Infinite scroll
const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

onMounted(() => {
  loadNovels()
  observer = new IntersectionObserver(
    (entries) => { if (entries[0].isIntersecting) loadMore() },
    { threshold: 0.1 },
  )
  if (sentinel.value) observer.observe(sentinel.value)
})

onUnmounted(() => observer?.disconnect())

watch(sentinel, (el) => {
  if (el && observer) observer.observe(el)
})

function timeAgo(s: string) {
  const diff = Date.now() - new Date(s).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return '今天'
  if (days < 7) return `${days}天前`
  if (days < 30) return `${Math.floor(days / 7)}周前`
  return `${Math.floor(days / 30)}月前`
}

function formatCount(n?: number) {
  if (!n) return '0'
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`
  return String(n)
}

const genreLabels: Record<string, string> = {
  fantasy: '奇幻',
  xianxia: '仙侠',
  urban: '都市',
  scifi: '科幻',
  romance: '言情',
  mystery: '悬疑',
  historical: '历史',
}
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 py-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
      <div>
        <h1 class="text-2xl font-bold text-white">小说广场</h1>
        <p class="text-sm text-gray-400 mt-0.5">AI 创作小说展示与发现</p>
      </div>
      <NuxtLink
        to="/platform"
        class="text-sm text-violet-400 hover:underline shrink-0"
      >视频广场</NuxtLink>
    </div>

    <!-- Search + Sort -->
    <div class="flex flex-col sm:flex-row gap-3 mb-6">
      <div class="relative flex-1">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
        </svg>
        <input
          v-model="searchInput"
          type="text"
          placeholder="搜索小说..."
          class="w-full pl-10 pr-4 py-2.5 border border-gray-700 rounded-xl bg-gray-900 text-sm focus:outline-none focus:border-indigo-400"
        />
      </div>
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

    <!-- Skeleton -->
    <div v-if="loading && !novels.length" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      <div v-for="i in 8" :key="i" class="rounded-xl overflow-hidden bg-gray-800 animate-pulse">
        <div class="aspect-[3/4] bg-gray-200 dark:bg-gray-700" />
        <div class="p-3 space-y-2">
          <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-4/5" />
          <div class="h-2.5 bg-gray-200 dark:bg-gray-700 rounded w-2/5" />
        </div>
      </div>
    </div>

    <!-- Empty -->
    <div v-else-if="!loading && !novels.length" class="text-center py-24 text-gray-400">
      <svg class="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
      </svg>
      <p class="text-lg">{{ searchQuery ? '没有找到相关小说' : '暂无公开小说' }}</p>
      <p v-if="searchQuery" class="text-sm mt-2">
        <button @click="searchInput = ''" class="text-indigo-500 hover:underline">清除搜索</button>
      </p>
    </div>

    <!-- Grid -->
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
      <NuxtLink
        v-for="n in novels"
        :key="n.id"
        :to="`/plaza/novel/${n.id}`"
        class="group block rounded-xl overflow-hidden bg-gray-900 shadow-sm hover:shadow-md transition-shadow"
      >
        <!-- Cover -->
        <div class="relative aspect-[3/4] bg-gray-800 overflow-hidden">
          <img
            v-if="n.cover_image"
            :src="n.cover_image"
            :alt="n.title"
            loading="lazy"
            decoding="async"
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
          <div v-else class="w-full h-full flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-indigo-900/40 to-purple-900/40">
            <svg class="w-10 h-10 text-indigo-300 dark:text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
            </svg>
            <span class="text-xs text-indigo-400 dark:text-indigo-500 font-medium px-2 text-center line-clamp-2">{{ n.title }}</span>
          </div>

          <!-- Genre badge -->
          <div v-if="n.genre" class="absolute top-2 left-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded-full">
            {{ genreLabels[n.genre] ?? n.genre }}
          </div>

          <!-- Hot badge -->
          <div v-if="sort === 'hot' && (n.hot_score ?? 0) > 10" class="absolute top-2 right-2 bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full">
            🔥
          </div>

          <!-- Words badge -->
          <div v-if="n.total_words" class="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
            {{ n.total_words >= 10000 ? `${(n.total_words / 10000).toFixed(0)}万字` : `${n.total_words}字` }}
          </div>
        </div>

        <!-- Info -->
        <div class="p-3 space-y-1">
          <p class="text-sm font-semibold text-white line-clamp-2 leading-snug">{{ n.title }}</p>
          <p v-if="n.description" class="text-xs text-gray-400 line-clamp-2">{{ n.description }}</p>
          <div class="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500 pt-0.5">
            <div class="flex items-center gap-2">
              <span class="flex items-center gap-1">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                {{ formatCount(n.view_count) }}
              </span>
              <span v-if="n.like_count" class="flex items-center gap-1">
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                </svg>
                {{ formatCount(n.like_count) }}
              </span>
            </div>
            <span>{{ timeAgo(n.published_at ?? n.created_at) }}</span>
          </div>
        </div>
      </NuxtLink>
    </div>

    <!-- Infinite scroll sentinel -->
    <div ref="sentinel" class="h-10 mt-4 flex items-center justify-center">
      <div v-if="loading && novels.length > 0" class="flex items-center gap-2 text-sm text-gray-400">
        <div class="w-4 h-4 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
        加载中...
      </div>
      <p v-else-if="!hasMore && novels.length > 0" class="text-xs text-gray-400">
        已显示全部 {{ total }} 部小说
      </p>
    </div>
  </div>
</template>
