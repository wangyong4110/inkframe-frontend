<script setup lang="ts">
import type { Novel, Chapter } from '~/types'

const toast = useToast()
const { request } = useApi()
const novelStore = useNovelStore()

// ── Stats state ──────────────────────────────────────────────────────────────
interface ProviderUsage {
  name: string
  tokens: number
}

interface DashboardStats {
  novel_count: number
  chapter_count: number
  novel_count_this_month: number
  chapter_count_this_month: number
  token_usage: {
    total: number
    by_provider: ProviderUsage[]
  }
  recent_chapters: Chapter[]
  provider_health: Array<{ name: string; status: string; latency_ms?: number }>
}

const stats = ref<DashboardStats>({
  novel_count: 0,
  chapter_count: 0,
  novel_count_this_month: 0,
  chapter_count_this_month: 0,
  token_usage: { total: 0, by_provider: [] },
  recent_chapters: [],
  provider_health: [],
})
const loading = ref(false)
const usingFallback = ref(false)

const loadStats = async () => {
  loading.value = true
  usingFallback.value = false
  try {
    const res = await request<any>('/dashboard/stats')
    stats.value = { ...stats.value, ...(res?.data || res) }
  } catch {
    // Graceful fallback: compute from local stores
    if (novelStore.novels.length === 0) {
      try { await novelStore.fetchNovels() } catch {}
    }
    stats.value.novel_count = novelStore.pagination.total || novelStore.novels.length
    stats.value.chapter_count = novelStore.totalChapters
    usingFallback.value = true
  } finally {
    loading.value = false
  }
}

// ── Provider health ──────────────────────────────────────────────────────────
const { getProviders } = useModelApi()
const providers = ref<any[]>([])
const healthLoading = ref(false)

const loadProviders = async () => {
  healthLoading.value = true
  try {
    const res = await getProviders()
    providers.value = (res as any).data || []
  } catch {} finally {
    healthLoading.value = false
  }
}

// ── Token bar chart ──────────────────────────────────────────────────────────
const maxProviderTokens = computed(() => {
  const list = stats.value.token_usage.by_provider
  if (!list.length) return 1
  return Math.max(...list.map(p => p.tokens), 1)
})

function barWidth(tokens: number): string {
  return `${Math.round((tokens / maxProviderTokens.value) * 100)}%`
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(n)
}

function chapterStatusLabel(status: string): string {
  const m: Record<string, string> = {
    pending: '待生成',
    script: '已生成',
    asset: '素材生成',
    done: '已完成',
    retry: '重试中',
  }
  return m[status] || status
}

function chapterStatusColor(status: string): string {
  const m: Record<string, string> = {
    done: 'bg-green-100 text-green-700',
    script: 'bg-blue-100 text-blue-700',
    asset: 'bg-yellow-100 text-yellow-700',
    pending: 'bg-gray-100 text-gray-500',
    retry: 'bg-red-100 text-red-600',
  }
  return m[status] || 'bg-gray-100 text-gray-500'
}

function providerHealthColor(status: string): string {
  if (status === 'ok' || status === 'healthy') return 'bg-green-100 text-green-700'
  if (status === 'degraded') return 'bg-yellow-100 text-yellow-600'
  return 'bg-red-100 text-red-600'
}

function providerHealthLabel(status: string): string {
  if (status === 'ok' || status === 'healthy') return '正常'
  if (status === 'degraded') return '降级'
  return '异常'
}

onMounted(() => {
  loadStats()
  loadProviders()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Fallback warning banner -->
    <div v-if="usingFallback"
         class="mb-4 px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-sm text-yellow-700 dark:text-yellow-400"
         role="alert">
      统计数据可能不是最新的（无法连接服务器）
    </div>

    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">使用概览</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          查看小说、章节、Token 消耗及服务状态
        </p>
      </div>
      <button class="btn-outline flex items-center gap-1.5 text-sm" :disabled="loading" @click="loadStats">
        <svg class="w-4 h-4" :class="loading ? 'animate-spin' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
        </svg>
        刷新
      </button>
    </div>

    <!-- Stats Cards -->
    <div v-if="loading" class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div v-for="i in 3" :key="i" class="card p-6 animate-pulse">
        <div class="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
        <div class="h-8 w-16 bg-gray-300 dark:bg-gray-600 rounded"></div>
      </div>
    </div>
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      <!-- Novel count -->
      <div class="card p-6">
        <div class="flex items-center justify-between mb-3">
          <p class="text-sm font-medium text-gray-500 dark:text-gray-400">小说总数</p>
          <div class="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-lg flex items-center justify-center">
            <svg class="w-5 h-5 text-violet-600 dark:text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
            </svg>
          </div>
        </div>
        <p class="text-3xl font-bold text-gray-900 dark:text-white">{{ stats.novel_count }}</p>
        <p v-if="stats.novel_count_this_month > 0" class="mt-1 text-xs text-gray-400">
          本月新增 <span class="text-violet-600 font-medium">+{{ stats.novel_count_this_month }}</span>
        </p>
      </div>

      <!-- Chapter count -->
      <div class="card p-6">
        <div class="flex items-center justify-between mb-3">
          <p class="text-sm font-medium text-gray-500 dark:text-gray-400">章节总数</p>
          <div class="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
            <svg class="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>
        </div>
        <p class="text-3xl font-bold text-gray-900 dark:text-white">{{ stats.chapter_count }}</p>
        <p v-if="stats.chapter_count_this_month > 0" class="mt-1 text-xs text-gray-400">
          本月生成 <span class="text-blue-600 font-medium">+{{ stats.chapter_count_this_month }}</span>
        </p>
      </div>

      <!-- Token usage -->
      <div class="card p-6">
        <div class="flex items-center justify-between mb-3">
          <p class="text-sm font-medium text-gray-500 dark:text-gray-400">Token 消耗</p>
          <div class="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center">
            <svg class="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2"/>
            </svg>
          </div>
        </div>
        <p class="text-3xl font-bold text-gray-900 dark:text-white">{{ formatTokens(stats.token_usage.total) }}</p>
        <p class="mt-1 text-xs text-gray-400">累计 Token 用量</p>
      </div>
    </div>

    <!-- Token by Provider + Recent Chapters -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Provider Token Usage Bar Chart -->
      <div class="card p-6">
        <h3 class="font-semibold text-gray-900 dark:text-white mb-4">各提供商 Token 消耗</h3>
        <div v-if="stats.token_usage.by_provider.length === 0" class="py-8 text-center text-gray-400 text-sm">
          暂无 Token 消耗数据
        </div>
        <div v-else class="space-y-3">
          <div v-for="p in stats.token_usage.by_provider" :key="p.name" class="space-y-1">
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-700 dark:text-gray-300 font-medium">{{ p.name }}</span>
              <span class="text-gray-500 font-mono text-xs">{{ formatTokens(p.tokens) }}</span>
            </div>
            <div class="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                class="h-full bg-violet-500 rounded-full transition-all duration-500"
                :style="{ width: barWidth(p.tokens) }"
              ></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Activity -->
      <div class="card p-6">
        <h3 class="font-semibold text-gray-900 dark:text-white mb-4">最近生成章节</h3>
        <div v-if="stats.recent_chapters.length === 0" class="py-8 text-center text-gray-400 text-sm">
          暂无最近生成的章节
        </div>
        <div v-else class="divide-y divide-gray-100 dark:divide-gray-700">
          <div
            v-for="ch in stats.recent_chapters"
            :key="ch.id"
            class="py-3 flex items-center gap-3"
          >
            <div class="w-8 h-8 bg-gray-100 dark:bg-gray-700 rounded-lg flex items-center justify-center shrink-0">
              <span class="text-xs font-mono text-gray-500">#{{ ch.chapter_no }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                {{ ch.title || `第 ${ch.chapter_no} 章` }}
              </p>
              <p class="text-xs text-gray-400">
                {{ new Date(ch.updated_at).toLocaleDateString('zh-CN') }}
              </p>
            </div>
            <span class="px-2 py-0.5 text-xs rounded-full font-medium shrink-0" :class="chapterStatusColor(ch.status)">
              {{ chapterStatusLabel(ch.status) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Provider Health Status -->
    <div class="card p-6">
      <div class="flex items-center justify-between mb-4">
        <h3 class="font-semibold text-gray-900 dark:text-white">服务提供商状态</h3>
        <span class="text-xs text-gray-400">{{ providers.length }} 个已配置</span>
      </div>
      <div v-if="healthLoading" class="flex items-center gap-3 py-4 text-gray-400 text-sm">
        <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        加载中...
      </div>
      <div v-else-if="providers.length === 0" class="py-4 text-center text-gray-400 text-sm">
        暂无已配置的提供商。
        <NuxtLink to="/model" class="text-primary-600 hover:underline ml-1">前往模型管理</NuxtLink>
        添加提供商
      </div>
      <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div
          v-for="p in providers"
          :key="p.id"
          class="flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        >
          <div
            class="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold"
            :class="p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'"
          >
            {{ (p.display_name || p.name || '?').charAt(0).toUpperCase() }}
          </div>
          <span class="text-xs font-medium text-gray-700 dark:text-gray-300 text-center leading-tight line-clamp-1">
            {{ p.display_name || p.name }}
          </span>
          <span
            class="px-1.5 py-0.5 text-xs rounded-full font-medium"
            :class="p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'"
          >
            {{ p.is_active ? '已启用' : '已禁用' }}
          </span>
        </div>
      </div>
    </div>

    <!-- Quick Links -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <NuxtLink
        to="/novel"
        class="card p-5 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
      >
        <div class="w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
          <svg class="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
          </svg>
        </div>
        <div>
          <p class="font-medium text-gray-900 dark:text-white">小说管理</p>
          <p class="text-xs text-gray-500 mt-0.5">管理所有小说项目</p>
        </div>
      </NuxtLink>
      <NuxtLink
        to="/model"
        class="card p-5 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
      >
        <div class="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
          <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2h-2"/>
          </svg>
        </div>
        <div>
          <p class="font-medium text-gray-900 dark:text-white">模型管理</p>
          <p class="text-xs text-gray-500 mt-0.5">配置 AI 提供商和模型</p>
        </div>
      </NuxtLink>
      <NuxtLink
        to="/tenant"
        class="card p-5 flex items-center gap-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors group"
      >
        <div class="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
          <svg class="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
        </div>
        <div>
          <p class="font-medium text-gray-900 dark:text-white">租户管理</p>
          <p class="text-xs text-gray-500 mt-0.5">管理组织和配额</p>
        </div>
      </NuxtLink>
    </div>
  </div>
</template>
