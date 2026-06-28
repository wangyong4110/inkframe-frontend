<script setup lang="ts">
import type { ModelUsageStat } from '~/types/sysadmin'

definePageMeta({ layout: 'sysadmin' })

const api = useSysAdminApi()
const stats = ref<ModelUsageStat[]>([])
const loading = ref(false)
const error = ref('')
const days = ref(30)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.getModelUsageStats(days.value)
    stats.value = (res as any)?.data ?? res
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(days, load)

function fmtTokens(n: number) {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n.toString()
}

function fmtLatency(s: number) {
  return s >= 1 ? s.toFixed(1) + 's' : (s * 1000).toFixed(0) + 'ms'
}

function rateClass(rate: number) {
  if (rate >= 95) return 'text-green-400'
  if (rate >= 80) return 'text-amber-400'
  return 'text-red-400'
}

const TASK_TYPE_NAMES: Record<string, string> = {
  chapter_generation: '章节生成',
  chapter_review: '章节审查',
  storyboard_generation: '分镜生成',
  image_generation: '图片生成',
  tts_generation: 'TTS',
  embedding: '向量嵌入',
  outline_generation: '大纲生成',
  refinement: '章节润色',
}

function taskLabel(t: string) {
  return TASK_TYPE_NAMES[t] ?? t
}

// Aggregate summary across all records
const totalCalls = computed(() => stats.value.reduce((s, r) => s + r.total_calls, 0))
const totalTokens = computed(() => stats.value.reduce((s, r) => s + r.total_tokens, 0))
const totalCost = computed(() => stats.value.reduce((s, r) => s + r.total_cost, 0))
const overallSuccess = computed(() => {
  const sc = stats.value.reduce((s, r) => s + r.success_calls, 0)
  return totalCalls.value > 0 ? (sc / totalCalls.value * 100).toFixed(1) : '100'
})

// Group by model for per-model summary
type ModelSummary = { modelName: string; providerName: string; totalCalls: number; totalTokens: number; totalCost: number; successRate: number }
const byModel = computed<ModelSummary[]>(() => {
  const map = new Map<string, ModelSummary>()
  for (const r of stats.value) {
    const key = `${r.model_id}`
    const ex = map.get(key)
    if (ex) {
      ex.totalCalls += r.total_calls
      ex.totalTokens += r.total_tokens
      ex.totalCost += r.total_cost
    } else {
      map.set(key, {
        modelName: r.model_name,
        providerName: r.provider_name,
        totalCalls: r.total_calls,
        totalTokens: r.total_tokens,
        totalCost: r.total_cost,
        successRate: r.success_rate,
      })
    }
  }
  return [...map.values()].sort((a, b) => b.totalCalls - a.totalCalls)
})
</script>

<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-xl font-bold text-white">AI 模型用量统计</h1>
      <div class="flex items-center gap-3">
        <select
          v-model="days"
          class="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1 focus:outline-none"
        >
          <option :value="7">近 7 天</option>
          <option :value="30">近 30 天</option>
          <option :value="90">近 90 天</option>
        </select>
        <button class="text-xs text-indigo-400 hover:text-indigo-300 transition-colors" @click="load">刷新</button>
      </div>
    </div>

    <div v-if="error" class="text-red-400 text-sm mb-4">{{ error }}</div>
    <div v-if="loading && !stats.length" class="text-gray-400 text-sm">加载中...</div>

    <div v-if="stats.length" class="space-y-6">
      <!-- 汇总 -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div class="text-xs text-gray-400 mb-1">总调用次数</div>
          <div class="text-xl font-semibold text-white">{{ totalCalls.toLocaleString() }}</div>
        </div>
        <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div class="text-xs text-gray-400 mb-1">总 Token 用量</div>
          <div class="text-xl font-semibold text-white">{{ fmtTokens(totalTokens) }}</div>
        </div>
        <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div class="text-xs text-gray-400 mb-1">整体成功率</div>
          <div class="text-xl font-semibold" :class="rateClass(Number(overallSuccess))">{{ overallSuccess }}%</div>
        </div>
        <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
          <div class="text-xs text-gray-400 mb-1">总费用</div>
          <div class="text-xl font-semibold text-white">${{ totalCost.toFixed(4) }}</div>
        </div>
      </div>

      <!-- 按模型汇总 -->
      <section>
        <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">按模型汇总</h2>
        <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          <div class="grid grid-cols-5 gap-2 px-4 py-2 text-xs text-gray-500 border-b border-gray-700">
            <div>模型</div>
            <div class="text-right">调用次数</div>
            <div class="text-right">Token 用量</div>
            <div class="text-right">成功率</div>
            <div class="text-right">费用</div>
          </div>
          <div
            v-for="m in byModel"
            :key="m.modelName"
            class="grid grid-cols-5 gap-2 px-4 py-2.5 border-b border-gray-700 last:border-b-0 hover:bg-gray-750"
          >
            <div>
              <div class="text-sm text-white truncate">{{ m.modelName || '未知' }}</div>
              <div class="text-xs text-gray-500 truncate">{{ m.providerName }}</div>
            </div>
            <div class="text-sm text-white text-right">{{ m.totalCalls.toLocaleString() }}</div>
            <div class="text-sm text-white text-right">{{ fmtTokens(m.totalTokens) }}</div>
            <div class="text-sm text-right" :class="rateClass(m.successRate)">{{ m.successRate.toFixed(1) }}%</div>
            <div class="text-sm text-white text-right">${{ m.totalCost.toFixed(4) }}</div>
          </div>
        </div>
      </section>

      <!-- 按任务类型明细 -->
      <section>
        <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">任务类型明细</h2>
        <div class="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
          <div class="grid grid-cols-6 gap-2 px-4 py-2 text-xs text-gray-500 border-b border-gray-700">
            <div>模型</div>
            <div>任务类型</div>
            <div class="text-right">调用</div>
            <div class="text-right">成功率</div>
            <div class="text-right">Token</div>
            <div class="text-right">平均延迟</div>
          </div>
          <div
            v-for="r in stats"
            :key="`${r.model_id}-${r.task_type}`"
            class="grid grid-cols-6 gap-2 px-4 py-2 border-b border-gray-700 last:border-b-0 text-sm hover:bg-gray-750"
          >
            <div class="text-white truncate">{{ r.model_name || '未知' }}</div>
            <div class="text-gray-400 truncate">{{ taskLabel(r.task_type) }}</div>
            <div class="text-white text-right">{{ r.total_calls.toLocaleString() }}</div>
            <div class="text-right" :class="rateClass(r.success_rate)">{{ r.success_rate.toFixed(1) }}%</div>
            <div class="text-white text-right">{{ fmtTokens(r.total_tokens) }}</div>
            <div class="text-gray-300 text-right">{{ fmtLatency(r.avg_latency) }}</div>
          </div>
        </div>
      </section>
    </div>

    <div v-else-if="!loading" class="text-gray-500 text-sm">该时间段内暂无 AI 用量数据</div>
  </div>
</template>
