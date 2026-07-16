<script setup lang="ts">
import type { Novel, Video } from '~/types'

definePageMeta({ layout: 'plaza', auth: false })

useHead({
  title: '作品广场 - 简影',
  meta: [
    { name: 'description', content: '探索 AI 生成的精彩视频内容' },
    { property: 'og:title', content: '作品广场 - 简影' },
  ],
})

const novelApi = usePublicNovelApi()
const platformApi = usePlatformApi()

// ── Tab ──────────────────────────────────────────────────────────────────────
type TabKey = 'novels' | 'videos'
const activeTab = ref<TabKey>('novels')

// ── 小说 Tab 状态 ─────────────────────────────────────────────────────────────
const novelSort = ref<'hot' | 'latest' | 'words' | 'favorites'>('hot')
const novelSearch = ref('')
const novelSearchQuery = ref('')
const novelChannel = ref('')
const novelGenre = ref('')
const novelWordRange = ref('')
const novelUpdatedDays = ref(0)
const novelIsCompleted = ref('')
const viewMode = ref<'cover' | 'text'>('cover')

const novels = ref<Novel[]>([])
const novelTotal = ref(0)
const novelPage = ref(1)
const novelLoading = ref(false)
const novelHasMore = computed(() => novels.value.length < novelTotal.value)

// ── 视频 Tab 状态 ─────────────────────────────────────────────────────────────
const videoSort = ref<'hot' | 'latest'>('hot')
const videoSearch = ref('')
const videoSearchQuery = ref('')
const videos = ref<Video[]>([])
const videoTotal = ref(0)
const videoPage = ref(1)
const videoLoading = ref(false)
const videoHasMore = computed(() => videos.value.length < videoTotal.value)

// ── 字数区间选项 ───────────────────────────────────────────────────────────────
const wordRangeOptions = [
  { label: '全部', value: '' },
  { label: '30万以下', value: '0-300000' },
  { label: '30~50万', value: '300000-500000' },
  { label: '50~100万', value: '500000-1000000' },
  { label: '100~200万', value: '1000000-2000000' },
  { label: '200万以上', value: '2000000-0' },
]
const wordMin = computed(() => {
  const [min] = (novelWordRange.value || '').split('-').map(Number)
  return min || 0
})
const wordMax = computed(() => {
  const parts = (novelWordRange.value || '').split('-').map(Number)
  return parts[1] || 0
})

// ── 筛选选项 ──────────────────────────────────────────────────────────────────
const channelOptions = [
  { label: '全部', value: '' },
  { label: '女生原创', value: 'female' },
  { label: '男生原创', value: 'male' },
  { label: '出版图书', value: 'publish' },
]

const genreOptions = [
  { label: '全部', value: '' },
  { label: '现代言情', value: 'romance' },
  { label: '古代言情', value: 'historical' },
  { label: '玄幻奇幻', value: 'fantasy' },
  { label: '都市', value: 'urban' },
  { label: '武侠仙侠', value: 'xianxia' },
  { label: '科幻', value: 'scifi' },
  { label: '悬疑', value: 'mystery' },
]

const updatedDaysOptions = [
  { label: '全部', value: 0 },
  { label: '3天内', value: 3 },
  { label: '7天内', value: 7 },
  { label: '30天内', value: 30 },
]

const completedOptions = [
  { label: '全部', value: '' },
  { label: '已完结', value: '1' },
  { label: '连载中', value: '0' },
]

const novelSortOptions = [
  { label: '点击量', value: 'hot' },
  { label: '总字数', value: 'words' },
  { label: '最近更新', value: 'latest' },
  { label: '收藏数', value: 'favorites' },
]

// ── 搜索防抖 ──────────────────────────────────────────────────────────────────
let novelSearchTimer: ReturnType<typeof setTimeout> | null = null
watch(novelSearch, (val) => {
  if (novelSearchTimer) clearTimeout(novelSearchTimer)
  novelSearchTimer = setTimeout(() => {
    novelSearchQuery.value = val
    resetAndLoadNovels()
  }, 400)
})

let videoSearchTimer: ReturnType<typeof setTimeout> | null = null
watch(videoSearch, (val) => {
  if (videoSearchTimer) clearTimeout(videoSearchTimer)
  videoSearchTimer = setTimeout(() => {
    videoSearchQuery.value = val
    resetAndLoadVideos()
  }, 400)
})

// ── 筛选变化 → 重置 ───────────────────────────────────────────────────────────
watch([novelSort, novelChannel, novelGenre, novelWordRange, novelUpdatedDays, novelIsCompleted], () => {
  resetAndLoadNovels()
})
watch(videoSort, () => resetAndLoadVideos())

// ── 小说加载 ──────────────────────────────────────────────────────────────────
function resetAndLoadNovels() {
  novels.value = []
  novelTotal.value = 0
  novelPage.value = 1
  loadNovels()
}

async function loadNovels() {
  if (novelLoading.value) return
  novelLoading.value = true
  try {
    const res = await novelApi.getNovelFeed({
      sort: novelSort.value,
      q: novelSearchQuery.value || undefined,
      page: novelPage.value,
      page_size: 12,
      channel: novelChannel.value || undefined,
      genre: novelGenre.value || undefined,
      word_min: wordMin.value || undefined,
      word_max: wordMax.value || undefined,
      updated_days: novelUpdatedDays.value || undefined,
      is_completed: novelIsCompleted.value || undefined,
    })
    if (res?.data) {
      novels.value.push(...res.data.items)
      novelTotal.value = res.data.total
    }
  } catch (e) {
    console.error(e)
  } finally {
    novelLoading.value = false
  }
}

async function loadMoreNovels() {
  if (!novelHasMore.value || novelLoading.value) return
  novelPage.value++
  await loadNovels()
}

// ── 视频加载 ──────────────────────────────────────────────────────────────────
function resetAndLoadVideos() {
  videos.value = []
  videoTotal.value = 0
  videoPage.value = 1
  loadVideos()
}

async function loadVideos() {
  if (videoLoading.value) return
  videoLoading.value = true
  try {
    const res = await platformApi.getPlatformFeed({
      sort: videoSort.value,
      q: videoSearchQuery.value || undefined,
      page: videoPage.value,
      page_size: 12,
    })
    if (res?.data) {
      videos.value.push(...res.data.items)
      videoTotal.value = res.data.total
    }
  } catch (e) {
    console.error(e)
  } finally {
    videoLoading.value = false
  }
}

async function loadMoreVideos() {
  if (!videoHasMore.value || videoLoading.value) return
  videoPage.value++
  await loadVideos()
}

// ── IntersectionObserver ──────────────────────────────────────────────────────
const novelSentinel = ref<HTMLElement | null>(null)
const videoSentinel = ref<HTMLElement | null>(null)
let novelObserver: IntersectionObserver | null = null
let videoObserver: IntersectionObserver | null = null

onMounted(() => {
  loadNovels()
  novelObserver = new IntersectionObserver(
    (e) => { if (e[0].isIntersecting) loadMoreNovels() },
    { threshold: 0.1 },
  )
  videoObserver = new IntersectionObserver(
    (e) => { if (e[0].isIntersecting) loadMoreVideos() },
    { threshold: 0.1 },
  )
  if (novelSentinel.value) novelObserver.observe(novelSentinel.value)
})

onUnmounted(() => {
  novelObserver?.disconnect()
  videoObserver?.disconnect()
})

watch(novelSentinel, (el) => { if (el && novelObserver) novelObserver.observe(el) })
watch(videoSentinel, (el) => { if (el && videoObserver) videoObserver.observe(el) })

watch(activeTab, (tab) => {
  if (tab === 'videos' && !videos.value.length && !videoLoading.value) {
    loadVideos()
  }
})

// ── 工具函数 ──────────────────────────────────────────────────────────────────
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

function formatWords(n?: number) {
  if (!n) return '0字'
  if (n >= 10000) return `${(n / 10000).toFixed(0)}万字`
  return `${n}字`
}

const genreLabels: Record<string, string> = {
  fantasy: '玄幻',
  xianxia: '仙侠',
  urban: '都市',
  scifi: '科幻',
  romance: '言情',
  mystery: '悬疑',
  historical: '历史',
}
</script>

<template>
  <div class="max-w-7xl mx-auto px-4 py-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-white">作品集</h1>
        <p class="text-sm text-gray-400 mt-0.5">发现精彩 AI 创作作品</p>
      </div>
      <NuxtLink
        to="/plaza/ranking"
        class="flex items-center gap-1 text-sm text-violet-400 hover:text-violet-300 transition-colors"
      >
        排行榜
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
      </NuxtLink>
    </div>

    <!-- Content Type Tab -->
    <div class="flex gap-1 bg-gray-800 rounded-xl p-1 w-fit mb-6">
      <button
        v-for="tab in [{ key: 'novels', label: '小说' }, { key: 'videos', label: '视频' }]"
        :key="tab.key"
        @click="activeTab = tab.key as TabKey"
        :class="[
          'px-6 py-2 rounded-lg text-sm font-medium transition-all',
          activeTab === tab.key
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'text-gray-400 hover:text-gray-200',
        ]"
      >{{ tab.label }}</button>
    </div>

    <!-- ══ 小说 Tab ════════════════════════════════════════════════════════════ -->
    <div v-show="activeTab === 'novels'">
      <!-- 筛选栏 -->
      <div class="space-y-2 mb-4 p-4 bg-gray-900 rounded-xl border border-gray-800">
        <!-- 频道 -->
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs text-gray-500 w-14 shrink-0">频道</span>
          <button
            v-for="opt in channelOptions"
            :key="opt.value"
            @click="novelChannel = opt.value"
            :class="[
              'px-3 py-1 rounded-full text-xs transition-all',
              novelChannel === opt.value
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700',
            ]"
          >{{ opt.label }}</button>
        </div>
        <!-- 分类 -->
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs text-gray-500 w-14 shrink-0">分类</span>
          <button
            v-for="opt in genreOptions"
            :key="opt.value"
            @click="novelGenre = opt.value"
            :class="[
              'px-3 py-1 rounded-full text-xs transition-all',
              novelGenre === opt.value
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700',
            ]"
          >{{ opt.label }}</button>
        </div>
        <!-- 字数 -->
        <div class="flex items-center gap-2 flex-wrap">
          <span class="text-xs text-gray-500 w-14 shrink-0">字数</span>
          <button
            v-for="opt in wordRangeOptions"
            :key="opt.value"
            @click="novelWordRange = opt.value"
            :class="[
              'px-3 py-1 rounded-full text-xs transition-all',
              novelWordRange === opt.value
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700',
            ]"
          >{{ opt.label }}</button>
        </div>
        <!-- 更新时间 + 完结 -->
        <div class="flex items-center gap-6 flex-wrap">
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-500 w-14 shrink-0">更新</span>
            <button
              v-for="opt in updatedDaysOptions"
              :key="opt.value"
              @click="novelUpdatedDays = opt.value"
              :class="[
                'px-3 py-1 rounded-full text-xs transition-all',
                novelUpdatedDays === opt.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700',
              ]"
            >{{ opt.label }}</button>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-gray-500 shrink-0">完结</span>
            <button
              v-for="opt in completedOptions"
              :key="opt.value"
              @click="novelIsCompleted = opt.value"
              :class="[
                'px-3 py-1 rounded-full text-xs transition-all',
                novelIsCompleted === opt.value
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700',
              ]"
            >{{ opt.label }}</button>
          </div>
        </div>
      </div>

      <!-- 排序 + 视图 + 搜索 -->
      <div class="flex flex-col sm:flex-row gap-3 mb-5">
        <!-- 排序 -->
        <div class="flex bg-gray-800 rounded-xl p-1 gap-1">
          <button
            v-for="opt in novelSortOptions"
            :key="opt.value"
            @click="novelSort = opt.value as typeof novelSort.value"
            :class="[
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap',
              novelSort === opt.value
                ? 'bg-gray-700 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300',
            ]"
          >{{ opt.label }}</button>
        </div>
        <!-- 视图切换 -->
        <div class="flex bg-gray-800 rounded-xl p-1 gap-1 shrink-0">
          <button
            @click="viewMode = 'cover'"
            :class="['px-3 py-1.5 rounded-lg transition-all', viewMode === 'cover' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300']"
            title="图文视图"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/>
            </svg>
          </button>
          <button
            @click="viewMode = 'text'"
            :class="['px-3 py-1.5 rounded-lg transition-all', viewMode === 'text' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300']"
            title="文字视图"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7"/>
            </svg>
          </button>
        </div>
        <!-- 搜索 -->
        <div class="relative flex-1">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
          </svg>
          <input
            v-model="novelSearch"
            type="text"
            placeholder="搜索小说..."
            class="w-full pl-10 pr-4 py-2 border border-gray-700 rounded-xl bg-gray-900 text-sm focus:outline-none focus:border-indigo-400"
          />
        </div>
      </div>

      <!-- 结果数 -->
      <div v-if="novelSearchQuery && !novelLoading" class="text-sm text-gray-400 mb-4">
        搜索「{{ novelSearchQuery }}」 共 {{ novelTotal }} 个结果
      </div>

      <!-- Skeleton -->
      <div v-if="novelLoading && !novels.length">
        <div v-if="viewMode === 'cover'" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <div v-for="i in 8" :key="i" class="rounded-xl overflow-hidden bg-gray-800 animate-pulse">
            <div class="aspect-[3/4] bg-gray-700" />
            <div class="p-3 space-y-2">
              <div class="h-3 bg-gray-700 rounded w-4/5" />
              <div class="h-2.5 bg-gray-700 rounded w-2/5" />
            </div>
          </div>
        </div>
        <div v-else class="space-y-2">
          <div v-for="i in 8" :key="i" class="h-16 bg-gray-800 rounded-xl animate-pulse" />
        </div>
      </div>

      <!-- Empty -->
      <div v-else-if="!novelLoading && !novels.length" class="text-center py-24 text-gray-400">
        <svg class="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
        </svg>
        <p class="text-lg">{{ novelSearchQuery ? '没有找到相关小说' : '暂无公开小说' }}</p>
        <button v-if="novelSearchQuery" @click="novelSearch = ''" class="text-sm mt-2 text-indigo-500 hover:underline">清除搜索</button>
      </div>

      <!-- 图文视图 -->
      <div v-else-if="viewMode === 'cover'" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <NuxtLink
          v-for="n in novels"
          :key="n.id"
          :to="`/plaza/novel/${n.id}`"
          class="group block rounded-xl overflow-hidden bg-gray-900 shadow-sm hover:shadow-md transition-shadow"
        >
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
              <svg class="w-10 h-10 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
              </svg>
              <span class="text-xs text-indigo-400 font-medium px-2 text-center line-clamp-2">{{ n.title }}</span>
            </div>
            <div v-if="n.genre" class="absolute top-2 left-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded-full">
              {{ genreLabels[n.genre] ?? n.genre }}
            </div>
            <div v-if="n.status === 'completed'" class="absolute top-2 right-2 bg-emerald-600/80 text-white text-xs px-1.5 py-0.5 rounded-full">完结</div>
            <div v-if="n.total_words" class="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
              {{ formatWords(n.total_words) }}
            </div>
          </div>
          <div class="p-3 space-y-1">
            <p class="text-sm font-semibold text-white line-clamp-2 leading-snug">{{ n.title }}</p>
            <p v-if="n.description" class="text-xs text-gray-400 line-clamp-2">{{ n.description }}</p>
            <div class="flex items-center justify-between text-xs text-gray-500 pt-0.5">
              <span class="flex items-center gap-1">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                {{ formatCount(n.view_count) }}
              </span>
              <span>{{ timeAgo(n.published_at ?? n.created_at) }}</span>
            </div>
          </div>
        </NuxtLink>
      </div>

      <!-- 文字视图 -->
      <div v-else class="space-y-2">
        <NuxtLink
          v-for="n in novels"
          :key="n.id"
          :to="`/plaza/novel/${n.id}`"
          class="flex items-center gap-4 p-4 rounded-xl bg-gray-900 hover:bg-gray-800 transition-colors"
        >
          <div class="w-10 h-10 rounded-lg bg-gray-800 overflow-hidden shrink-0">
            <img v-if="n.cover_image" :src="n.cover_image" :alt="n.title" class="w-full h-full object-cover" />
            <div v-else class="w-full h-full flex items-center justify-center">
              <svg class="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
              </svg>
            </div>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              <p class="text-sm font-semibold text-white truncate">{{ n.title }}</p>
              <span v-if="n.genre" class="shrink-0 text-xs bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">{{ genreLabels[n.genre] ?? n.genre }}</span>
              <span v-if="n.status === 'completed'" class="shrink-0 text-xs bg-emerald-900/50 text-emerald-400 px-1.5 py-0.5 rounded">完结</span>
            </div>
            <p v-if="n.description" class="text-xs text-gray-400 truncate">{{ n.description }}</p>
          </div>
          <div class="text-right text-xs text-gray-500 shrink-0">
            <p>{{ formatWords(n.total_words) }}</p>
            <p>{{ timeAgo(n.published_at ?? n.created_at) }}</p>
          </div>
        </NuxtLink>
      </div>

      <!-- Novel sentinel -->
      <div ref="novelSentinel" class="h-10 mt-4 flex items-center justify-center">
        <div v-if="novelLoading && novels.length > 0" class="flex items-center gap-2 text-sm text-gray-400">
          <div class="w-4 h-4 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
          加载中...
        </div>
        <p v-else-if="!novelHasMore && novels.length > 0" class="text-xs text-gray-500">
          已显示全部 {{ novelTotal }} 部小说
        </p>
      </div>
    </div>

    <!-- ══ 视频 Tab ════════════════════════════════════════════════════════════ -->
    <div v-show="activeTab === 'videos'">
      <!-- 排序 + 搜索 -->
      <div class="flex flex-col sm:flex-row gap-3 mb-5">
        <div class="flex bg-gray-800 rounded-xl p-1 gap-1 shrink-0">
          <button
            v-for="tab in [{ key: 'hot', label: '🔥 最热' }, { key: 'latest', label: '🕒 最新' }]"
            :key="tab.key"
            @click="videoSort = tab.key as 'hot' | 'latest'"
            :class="[
              'px-4 py-1.5 rounded-lg text-sm font-medium transition-all',
              videoSort === tab.key
                ? 'bg-gray-700 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-300',
            ]"
          >{{ tab.label }}</button>
        </div>
        <div class="relative flex-1">
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z"/>
          </svg>
          <input
            v-model="videoSearch"
            type="text"
            placeholder="搜索视频..."
            class="w-full pl-10 pr-4 py-2 border border-gray-700 rounded-xl bg-gray-900 text-sm focus:outline-none focus:border-indigo-400"
          />
        </div>
      </div>

      <!-- Video Skeleton -->
      <div v-if="videoLoading && !videos.length" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <div v-for="i in 8" :key="i" class="rounded-xl overflow-hidden bg-gray-800 animate-pulse">
          <div class="aspect-video bg-gray-700" />
          <div class="p-3 space-y-2">
            <div class="h-3 bg-gray-700 rounded w-4/5" />
            <div class="h-2.5 bg-gray-700 rounded w-2/5" />
          </div>
        </div>
      </div>

      <!-- Video Empty -->
      <div v-else-if="!videoLoading && !videos.length" class="text-center py-24 text-gray-400">
        <svg class="w-16 h-16 mx-auto mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
        </svg>
        <p class="text-lg">暂无公开视频</p>
      </div>

      <!-- Video Grid -->
      <div v-else class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
        <NuxtLink
          v-for="v in videos"
          :key="v.id"
          :to="`/platform/video/${v.id}`"
          class="group block rounded-xl overflow-hidden bg-gray-900 shadow-sm hover:shadow-md transition-shadow"
        >
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
              <svg class="w-10 h-10 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
              </svg>
            </div>
            <div v-if="v.duration" class="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
              {{ Math.floor(v.duration / 60) }}:{{ String(v.duration % 60).padStart(2, '0') }}
            </div>
          </div>
          <div class="p-3 space-y-1">
            <p class="text-sm font-semibold text-white line-clamp-2 leading-snug">{{ v.title }}</p>
            <div class="flex items-center justify-between text-xs text-gray-500">
              <span class="flex items-center gap-1">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                </svg>
                {{ formatCount(v.view_count) }}
              </span>
              <span>{{ timeAgo(v.published_at ?? v.created_at) }}</span>
            </div>
          </div>
        </NuxtLink>
      </div>

      <!-- Video sentinel -->
      <div ref="videoSentinel" class="h-10 mt-4 flex items-center justify-center">
        <div v-if="videoLoading && videos.length > 0" class="flex items-center gap-2 text-sm text-gray-400">
          <div class="w-4 h-4 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
          加载中...
        </div>
        <p v-else-if="!videoHasMore && videos.length > 0" class="text-xs text-gray-500">
          已显示全部 {{ videoTotal }} 个视频
        </p>
      </div>
    </div>
  </div>
</template>
