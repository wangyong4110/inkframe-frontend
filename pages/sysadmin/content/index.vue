<script setup lang="ts">
import type { ContentOverview } from '~/types/sysadmin'

definePageMeta({ layout: 'sysadmin' })

const api = useSysAdminApi()
const data = ref<ContentOverview | null>(null)
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.getContentOverview()
    data.value = (res as any)?.data ?? res
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(load)

function fmtNum(n: number) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n.toString()
}

const maxViews = computed(() =>
  Math.max(...(data.value?.top_novels?.map(n => n.view_count) ?? [1]), 1)
)
</script>

<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-xl font-bold text-white">内容数据概览</h1>
      <button class="text-xs text-indigo-400 hover:text-indigo-300 transition-colors" @click="load">刷新</button>
    </div>

    <div v-if="error" class="text-red-400 text-sm mb-4">{{ error }}</div>
    <div v-if="loading && !data" class="text-gray-400 text-sm">加载中...</div>

    <div v-if="data" class="space-y-6">
      <!-- 互动数据 -->
      <section>
        <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">用户互动</h2>
        <div class="grid grid-cols-3 gap-3">
          <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">总浏览量</div>
            <div class="text-2xl font-semibold text-white">{{ fmtNum(data.total_views) }}</div>
          </div>
          <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">总点赞数</div>
            <div class="text-2xl font-semibold text-pink-400">{{ fmtNum(data.total_likes) }}</div>
          </div>
          <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">总评论数</div>
            <div class="text-2xl font-semibold text-blue-400">{{ fmtNum(data.total_comments) }}</div>
          </div>
        </div>
      </section>

      <!-- 内容规模 -->
      <section>
        <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">内容规模</h2>
        <div class="grid grid-cols-3 gap-3">
          <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">小说总数</div>
            <div class="text-2xl font-semibold text-white">{{ fmtNum(data.novel_count) }}</div>
          </div>
          <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">章节总数</div>
            <div class="text-2xl font-semibold text-white">{{ fmtNum(data.chapter_count) }}</div>
          </div>
          <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">公开小说</div>
            <div class="text-2xl font-semibold text-indigo-300">{{ fmtNum(data.public_novels) }}</div>
          </div>
        </div>
      </section>

      <!-- 热门小说 -->
      <section v-if="data.top_novels?.length">
        <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">浏览量 TOP 10</h2>
        <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          <div
            v-for="(novel, i) in data.top_novels"
            :key="novel.novel_id"
            class="flex items-center gap-3 px-4 py-2.5 border-b border-gray-700 last:border-b-0 hover:bg-gray-750"
          >
            <span
              class="flex-shrink-0 w-6 h-6 rounded text-xs font-bold flex items-center justify-center"
              :class="i === 0 ? 'bg-yellow-500/20 text-yellow-400' : i === 1 ? 'bg-gray-500/20 text-gray-300' : i === 2 ? 'bg-amber-800/20 text-amber-600' : 'bg-gray-700 text-gray-500'"
            >{{ i + 1 }}</span>
            <div class="flex-1 min-w-0">
              <div class="text-sm text-white truncate">{{ novel.title || `小说 #${novel.novel_id}` }}</div>
              <div class="h-1.5 bg-gray-700 rounded-full mt-1 overflow-hidden">
                <div
                  class="h-full bg-indigo-500 rounded-full"
                  :style="{ width: (novel.view_count / maxViews * 100) + '%' }"
                />
              </div>
            </div>
            <div class="text-right flex-shrink-0">
              <div class="text-sm font-semibold text-white">{{ fmtNum(novel.view_count) }}</div>
              <div class="text-xs text-pink-400">♥ {{ fmtNum(novel.like_count) }}</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
