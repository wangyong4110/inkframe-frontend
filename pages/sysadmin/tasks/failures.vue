<script setup lang="ts">
import type { TaskFailureStat } from '~/types/sysadmin'

definePageMeta({ layout: 'sysadmin' })

const api = useSysAdminApi()
const stats = ref<TaskFailureStat[]>([])
const loading = ref(false)
const error = ref('')
const expanded = ref<string | null>(null)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.getTaskFailureStats()
    stats.value = (res as any)?.data ?? res
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(load)

const TASK_TYPE_NAMES: Record<string, string> = {
  chapter_generation: '章节生成',
  chapter_review: '章节审查',
  storyboard_generation: '分镜生成',
  video_generation: '视频生成',
  image_generation: '图片生成',
  tts_generation: 'TTS 生成',
  novel_crawl: '小说爬取',
  asset_crawl: '素材爬取',
}

function taskLabel(t: string) {
  return TASK_TYPE_NAMES[t] ?? t
}

function rateClass(rate: number) {
  if (rate >= 20) return 'text-red-400'
  if (rate >= 5) return 'text-amber-400'
  return 'text-green-400'
}

const total = computed(() => stats.value.reduce((s, r) => s + r.total, 0))
const totalFailed = computed(() => stats.value.reduce((s, r) => s + r.failed, 0))
const overallRate = computed(() => total.value > 0 ? (totalFailed.value / total.value * 100).toFixed(1) : '0')
</script>

<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-xl font-bold text-white">失败任务分析</h1>
      <button class="text-xs text-indigo-400 hover:text-indigo-300 transition-colors" @click="load">刷新</button>
    </div>

    <div v-if="error" class="text-red-400 text-sm mb-4">{{ error }}</div>

    <!-- 汇总卡片 -->
    <div class="grid grid-cols-3 gap-3 mb-6">
      <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div class="text-xs text-gray-400 mb-1">总任务数</div>
        <div class="text-2xl font-semibold text-white">{{ total }}</div>
      </div>
      <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div class="text-xs text-gray-400 mb-1">失败任务数</div>
        <div class="text-2xl font-semibold text-red-400">{{ totalFailed }}</div>
      </div>
      <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div class="text-xs text-gray-400 mb-1">整体失败率</div>
        <div class="text-2xl font-semibold" :class="rateClass(Number(overallRate))">{{ overallRate }}%</div>
      </div>
    </div>

    <div v-if="loading && !stats.length" class="text-gray-400 text-sm">加载中...</div>

    <div v-else-if="stats.length" class="space-y-2">
      <div
        v-for="stat in stats"
        :key="stat.type"
        class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden"
      >
        <!-- 行头 -->
        <button
          class="w-full flex items-center gap-4 px-4 py-3 text-left hover:bg-gray-750 transition-colors"
          @click="expanded = expanded === stat.type ? null : stat.type"
        >
          <div class="flex-1 min-w-0">
            <div class="text-sm font-medium text-white">{{ taskLabel(stat.type) }}</div>
            <div class="text-xs text-gray-500 font-mono">{{ stat.type }}</div>
          </div>
          <div class="text-right">
            <div class="text-xs text-gray-400">总数</div>
            <div class="text-sm font-semibold text-white">{{ stat.total }}</div>
          </div>
          <div class="text-right w-20">
            <div class="text-xs text-gray-400">失败</div>
            <div class="text-sm font-semibold text-red-400">{{ stat.failed }}</div>
          </div>
          <div class="text-right w-24">
            <div class="text-xs text-gray-400">失败率</div>
            <div class="text-sm font-semibold" :class="rateClass(stat.failure_rate)">
              {{ stat.failure_rate.toFixed(1) }}%
            </div>
          </div>
          <div class="text-right w-20">
            <div class="text-xs text-gray-400">平均重试</div>
            <div class="text-sm font-semibold text-white">{{ stat.avg_retries.toFixed(1) }}</div>
          </div>
          <!-- 进度条 -->
          <div class="w-32 hidden md:block">
            <div class="h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                class="h-full rounded-full transition-all"
                :class="stat.failure_rate >= 20 ? 'bg-red-500' : stat.failure_rate >= 5 ? 'bg-amber-500' : 'bg-green-500'"
                :style="{ width: Math.min(stat.failure_rate, 100) + '%' }"
              />
            </div>
          </div>
          <span class="text-gray-600 text-xs">{{ expanded === stat.type ? '▲' : '▼' }}</span>
        </button>

        <!-- 展开的错误详情 -->
        <div v-if="expanded === stat.type" class="border-t border-gray-700 px-4 py-3 bg-gray-900/50">
          <div class="text-xs text-gray-400 mb-2">最近错误信息（最多 3 条）</div>
          <div v-if="stat.top_errors.length === 0" class="text-xs text-gray-600 italic">暂无错误记录</div>
          <div
            v-for="(err, i) in stat.top_errors"
            :key="i"
            class="text-xs text-red-300 font-mono bg-gray-800 rounded px-3 py-2 mb-1 break-all"
          >
            {{ err }}
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="!loading" class="text-gray-500 text-sm">暂无任务数据</div>
  </div>
</template>
