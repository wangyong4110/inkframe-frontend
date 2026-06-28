<script setup lang="ts">
import type { DayCount } from '~/types/sysadmin'

definePageMeta({ layout: 'sysadmin' })

const api = useSysAdminApi()
const trend = ref<DayCount[]>([])
const loading = ref(false)
const error = ref('')
const days = ref(30)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.getUserRegistrationTrend(days.value)
    trend.value = (res as any)?.data ?? res
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(days, load)

const total = computed(() => trend.value.reduce((s, d) => s + d.count, 0))
const maxCount = computed(() => Math.max(...trend.value.map(d => d.count), 1))
const avgPerDay = computed(() => trend.value.length > 0 ? (total.value / trend.value.length).toFixed(1) : '0')

function barHeight(count: number) {
  return Math.max((count / maxCount.value) * 100, 2)
}

function fmtDate(d: string) {
  return d.slice(5) // MM-DD
}
</script>

<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-xl font-bold text-white">用户注册趋势</h1>
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

    <!-- 汇总 -->
    <div class="grid grid-cols-3 gap-3 mb-6">
      <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div class="text-xs text-gray-400 mb-1">新增用户总数</div>
        <div class="text-2xl font-semibold text-white">{{ total }}</div>
      </div>
      <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div class="text-xs text-gray-400 mb-1">日均注册</div>
        <div class="text-2xl font-semibold text-indigo-300">{{ avgPerDay }}</div>
      </div>
      <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div class="text-xs text-gray-400 mb-1">峰值单日</div>
        <div class="text-2xl font-semibold text-white">{{ maxCount }}</div>
      </div>
    </div>

    <div v-if="loading && !trend.length" class="text-gray-400 text-sm">加载中...</div>

    <div v-else-if="trend.length" class="bg-gray-800 border border-gray-700 rounded-lg p-4">
      <!-- 柱状图 -->
      <div class="flex items-end gap-1 h-40 mb-2 overflow-x-auto">
        <div
          v-for="d in trend"
          :key="d.date"
          class="flex flex-col items-center flex-shrink-0 group"
          :style="{ minWidth: days <= 7 ? '48px' : days <= 30 ? '20px' : '10px' }"
        >
          <div class="relative w-full">
            <!-- Tooltip -->
            <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10
                        bg-gray-900 border border-gray-600 text-xs text-white px-2 py-1 rounded whitespace-nowrap">
              {{ d.date }}: {{ d.count }} 人
            </div>
            <div
              class="w-full bg-indigo-500 hover:bg-indigo-400 rounded-t transition-colors cursor-default"
              :style="{ height: barHeight(d.count) + '%', minHeight: '2px' }"
            />
          </div>
        </div>
      </div>
      <!-- X 轴标签 -->
      <div class="flex gap-1 overflow-x-auto">
        <div
          v-for="d in trend"
          :key="d.date"
          class="flex-shrink-0 text-center text-gray-600 overflow-hidden"
          :style="{ minWidth: days <= 7 ? '48px' : days <= 30 ? '20px' : '10px', fontSize: '9px' }"
        >
          {{ days <= 30 ? fmtDate(d.date) : '' }}
        </div>
      </div>

      <!-- 数据表 -->
      <div class="mt-4 border-t border-gray-700 pt-4">
        <div class="text-xs text-gray-400 mb-2">每日明细</div>
        <div class="max-h-48 overflow-y-auto space-y-1">
          <div
            v-for="d in [...trend].reverse()"
            :key="d.date"
            class="flex items-center justify-between text-xs"
          >
            <span class="text-gray-400 font-mono">{{ d.date }}</span>
            <div class="flex items-center gap-2">
              <div class="w-32 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <div
                  class="h-full bg-indigo-500 rounded-full"
                  :style="{ width: (d.count / maxCount * 100) + '%' }"
                />
              </div>
              <span class="text-white w-8 text-right">{{ d.count }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else-if="!loading" class="text-gray-500 text-sm">该时间段内暂无注册数据</div>
  </div>
</template>
