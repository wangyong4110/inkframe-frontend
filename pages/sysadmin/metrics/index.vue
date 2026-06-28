<script setup lang="ts">
import type { SysMetrics } from '~/types/sysadmin'

definePageMeta({ layout: 'sysadmin' })

const api = useSysAdminApi()
const metrics = ref<SysMetrics | null>(null)
const loading = ref(false)
const error = ref('')
let timer: ReturnType<typeof setInterval> | null = null

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.getMetrics()
    metrics.value = (res as any)?.data ?? res
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  load()
  timer = setInterval(load, 15000)
})
onUnmounted(() => { if (timer) clearInterval(timer) })

function fmtUptime(secs: number) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = Math.floor(secs % 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function fmtNum(n: number) {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return n.toFixed(0)
}

function errRate(total: number, errors: number) {
  if (!total) return '0%'
  return ((errors / total) * 100).toFixed(1) + '%'
}
</script>

<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-xl font-bold text-white">系统指标</h1>
      <div class="flex items-center gap-3">
        <span class="text-xs text-gray-500">每 15s 自动刷新</span>
        <button class="text-xs text-indigo-400 hover:text-indigo-300 transition-colors" @click="load">立即刷新</button>
      </div>
    </div>

    <div v-if="error" class="text-red-400 text-sm mb-4">{{ error }}</div>

    <div v-if="metrics" class="space-y-6">
      <!-- 运行时 -->
      <section>
        <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">运行时</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">运行时长</div>
            <div class="text-xl font-semibold text-white">{{ fmtUptime(metrics.uptime_seconds) }}</div>
          </div>
          <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">Goroutines</div>
            <div class="text-xl font-semibold text-white">{{ metrics.goroutines }}</div>
          </div>
          <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">堆内存</div>
            <div class="text-xl font-semibold text-white">{{ metrics.heap_mb.toFixed(1) }} <span class="text-sm text-gray-400">MB</span></div>
          </div>
          <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">GC 次数</div>
            <div class="text-xl font-semibold text-white">{{ metrics.gc_count }}</div>
          </div>
        </div>
      </section>

      <!-- HTTP -->
      <section>
        <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">HTTP</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">请求总数</div>
            <div class="text-xl font-semibold text-white">{{ fmtNum(metrics.http_requests_total) }}</div>
          </div>
          <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">错误率</div>
            <div class="text-xl font-semibold" :class="metrics.http_errors_total / (metrics.http_requests_total || 1) > 0.05 ? 'text-red-400' : 'text-white'">
              {{ errRate(metrics.http_requests_total, metrics.http_errors_total) }}
            </div>
          </div>
          <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">进行中请求</div>
            <div class="text-xl font-semibold text-white">{{ metrics.http_in_flight }}</div>
          </div>
          <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">限流拦截</div>
            <div class="text-xl font-semibold text-white">{{ fmtNum(metrics.http_rate_limited_total) }}</div>
          </div>
        </div>
      </section>

      <!-- 数据库 -->
      <section>
        <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">数据库连接池</h2>
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">连接总数</div>
            <div class="text-xl font-semibold text-white">{{ metrics.db_open_connections }}</div>
          </div>
          <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">使用中</div>
            <div class="text-xl font-semibold text-white">{{ metrics.db_in_use_connections }}</div>
          </div>
          <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">空闲</div>
            <div class="text-xl font-semibold text-white">{{ metrics.db_idle_connections }}</div>
          </div>
        </div>
      </section>

      <!-- AI & 生成 -->
      <section>
        <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">AI 生成</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">AI 调用总数</div>
            <div class="text-xl font-semibold text-white">{{ fmtNum(metrics.ai_requests_total) }}</div>
          </div>
          <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">AI 进行中</div>
            <div class="text-xl font-semibold text-white">{{ metrics.ai_requests_in_flight }}</div>
          </div>
          <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">章节生成总数</div>
            <div class="text-xl font-semibold text-white">{{ fmtNum(metrics.chapter_gen_total) }}</div>
          </div>
          <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">章节生成中</div>
            <div class="text-xl font-semibold text-white">{{ metrics.chapter_gen_in_flight }}</div>
          </div>
        </div>
      </section>

      <!-- 任务 -->
      <section>
        <h2 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">任务队列</h2>
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div class="text-xs text-gray-400 mb-1">活跃任务</div>
            <div class="text-xl font-semibold" :class="metrics.active_tasks > 20 ? 'text-amber-400' : 'text-white'">
              {{ metrics.active_tasks }}
            </div>
          </div>
        </div>
      </section>
    </div>

    <div v-else-if="loading" class="text-gray-400 text-sm">加载中...</div>
  </div>
</template>
