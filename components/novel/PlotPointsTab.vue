<script setup lang="ts">
import type { PlotPoint } from '~/types'

const props = defineProps<{ novelId: number }>()

const toast = useToast()
const taskStore = useTaskStore()
const plotPointApi = usePlotPointApi()

const plotPoints = ref<PlotPoint[]>([])
const plotPointsLoading = ref(false)
const extractingPlotPoints = ref(false)
const plotPointsPage = ref(1)
const plotPointsPageSize = 20
const plotPointsTotal = ref(0)
const plotPointsTotalPages = computed(() => Math.ceil(plotPointsTotal.value / plotPointsPageSize))

const plotPointTypeLabel: Record<string, string> = {
  conflict: '冲突', climax: '高潮', resolution: '解决', twist: '转折', foreshadow: '伏笔',
}
const plotPointTypeBadgeClass: Record<string, string> = {
  conflict: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  climax: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  resolution: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  twist: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  foreshadow: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
}

async function fetchPlotPoints(page = plotPointsPage.value) {
  plotPointsLoading.value = true
  plotPointsPage.value = page
  try {
    const data = await plotPointApi.listByNovel(props.novelId, { page, page_size: plotPointsPageSize })
    plotPoints.value = data.data?.plot_points ?? []
    plotPointsTotal.value = data.data?.total ?? 0
  } catch { /* ignore */ } finally {
    plotPointsLoading.value = false
  }
}

onMounted(() => fetchPlotPoints())

async function handleAIPlotPoints() {
  extractingPlotPoints.value = true
  try {
    const res = await plotPointApi.aiExtractFromNovel(props.novelId)
    const taskId = (res as any)?.data?.task_id ?? (res as any)?.task_id
    taskStore.trackTask(taskId, async (task) => {
      extractingPlotPoints.value = false
      if (task?.status === 'failed') {
        toast.error('剧情点提取失败：' + (task.error || '未知错误'))
        return
      }
      await fetchPlotPoints(1)
      toast.success('剧情点已提取/更新')
    })
  } catch (e: any) {
    extractingPlotPoints.value = false
    toast.error('提取失败：' + (e.message || ''))
  }
}

async function handleDeletePlotPoint(id: number) {
  if (!confirm('确认删除该剧情点？')) return
  try {
    await plotPointApi.remove(id)
    plotPoints.value = plotPoints.value.filter(p => p.id !== id)
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || ''))
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="text-base font-semibold text-gray-900 dark:text-white">全部剧情点</h3>
      <div class="flex items-center gap-2">
        <button class="btn-secondary text-sm" :disabled="extractingPlotPoints" @click="handleAIPlotPoints">
          <svg v-if="extractingPlotPoints" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          {{ extractingPlotPoints ? 'AI 提取中...' : (plotPoints.length > 0 ? 'AI 更新剧情点' : 'AI 提取剧情点') }}
        </button>
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          :disabled="plotPointsLoading"
          @click="fetchPlotPoints()"
        >
          <svg class="w-3.5 h-3.5" :class="{ 'animate-spin': plotPointsLoading }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          刷新
        </button>
      </div>
    </div>

    <div v-if="plotPointsLoading" class="flex justify-center py-12">
      <svg class="w-6 h-6 animate-spin text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
      </svg>
    </div>

    <div v-else-if="plotPoints.length === 0" class="card p-12 text-center">
      <svg class="w-12 h-12 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9"/>
      </svg>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-1">暂无剧情点</p>
      <p class="text-xs text-gray-400 dark:text-gray-500">在章节编辑页的「大纲」模式中提取或手动添加剧情点</p>
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="pp in plotPoints"
        :key="pp.id"
        class="card px-4 py-3 flex items-start gap-3 transition-colors"
        :class="pp.is_resolved ? 'opacity-50' : ''"
      >
        <span
          class="flex-shrink-0 mt-0.5 text-xs font-medium px-1.5 py-0.5 rounded"
          :class="plotPointTypeBadgeClass[pp.type] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'"
        >{{ plotPointTypeLabel[pp.type] ?? pp.type }}</span>
        <div class="flex-1 min-w-0">
          <p class="text-sm text-gray-800 dark:text-gray-200 leading-relaxed" :class="{ 'line-through text-gray-400': pp.is_resolved }">
            {{ pp.description }}
          </p>
          <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">
            第 {{ pp.chapter_id }} 章
            <span v-if="pp.is_resolved" class="ml-2 text-green-600 dark:text-green-400">✓ 已解决</span>
          </p>
        </div>
        <button
          class="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          title="删除"
          @click="handleDeletePlotPoint(pp.id)"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <!-- 分页 -->
      <div v-if="plotPointsTotalPages > 1" class="flex items-center justify-center gap-1 pt-2">
        <button
          class="px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="plotPointsPage <= 1"
          @click="fetchPlotPoints(plotPointsPage - 1)"
        >‹</button>
        <template v-for="p in plotPointsTotalPages" :key="p">
          <button
            v-if="p === 1 || p === plotPointsTotalPages || Math.abs(p - plotPointsPage) <= 1"
            class="px-2.5 py-1 text-xs rounded border transition-colors"
            :class="p === plotPointsPage
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 font-medium'
              : 'border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800'"
            @click="fetchPlotPoints(p)"
          >{{ p }}</button>
          <span
            v-else-if="p === 2 && plotPointsPage > 3"
            class="px-1 text-xs text-gray-400"
          >…</span>
          <span
            v-else-if="p === plotPointsTotalPages - 1 && plotPointsPage < plotPointsTotalPages - 2"
            class="px-1 text-xs text-gray-400"
          >…</span>
        </template>
        <button
          class="px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="plotPointsPage >= plotPointsTotalPages"
          @click="fetchPlotPoints(plotPointsPage + 1)"
        >›</button>
        <span class="ml-2 text-xs text-gray-400">共 {{ plotPointsTotal }} 条</span>
      </div>
    </div>
  </div>
</template>
