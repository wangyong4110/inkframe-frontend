<script setup lang="ts">
import type { OutlineReview, OutlineIssue, Chapter } from '~/types'

const props = defineProps<{
  novelId: number
  chapters: Chapter[]
  visible?: boolean
}>()

const emit = defineEmits<{
  close: []
  reviewed: []
}>()

const toast = useToast()
const { guardAiProvider } = useAiProviderGuard()
const outlineReviewApi = useOutlineReviewApi()
const taskStore = useTaskStore()

const reviewing = ref(false)
const loading = ref(false)
const taskError = ref('')
const loadError = ref('')
const reviews = ref<OutlineReview[]>([])
const expandedId = ref<number | null>(null)

// ── Computed helpers ──────────────────────────────────────────────────────────

const reviewMap = computed(() => {
  const m: Record<number, OutlineReview> = {}
  for (const r of reviews.value) m[r.chapter_id] = r
  return m
})

// Merge chapters + reviews, sort: failed → warning → passed → pending
const rows = computed(() => {
  return [...props.chapters]
    .map(ch => ({ chapter: ch, review: reviewMap.value[ch.id] ?? null }))
    .sort((a, b) => {
      const order = { failed: 0, warning: 1, passed: 2, reviewing: 3, pending: 4 }
      const sa = order[a.review?.status ?? 'pending'] ?? 4
      const sb = order[b.review?.status ?? 'pending'] ?? 4
      if (sa !== sb) return sa - sb
      return (a.chapter.chapter_no ?? 0) - (b.chapter.chapter_no ?? 0)
    })
})

const summary = computed(() => {
  const total = props.chapters.length
  const passed = reviews.value.filter(r => r.status === 'passed').length
  const warning = reviews.value.filter(r => r.status === 'warning').length
  const failed = reviews.value.filter(r => r.status === 'failed').length
  const pending = total - reviews.value.length
  return { total, passed, warning, failed, pending }
})

// ── Lifecycle ─────────────────────────────────────────────────────────────────

watch(() => props.visible, (v) => { if (v) init() }, { immediate: true })

async function init() {
  await loadReviews()
}

// ── API ───────────────────────────────────────────────────────────────────────

async function loadReviews() {
  loading.value = true
  loadError.value = ''
  try {
    const res = await outlineReviewApi.listNovelReviews(props.novelId)
    reviews.value = Array.isArray(res) ? res : ((res as any).data ?? [])
  } catch (e: any) {
    loadError.value = e.message || '加载审查结果失败'
  } finally {
    loading.value = false
  }
}

async function startBatchReview() {
  if (!await guardAiProvider('LLM')) return
  reviewing.value = true
  taskError.value = ''
  try {
    const resp: any = await outlineReviewApi.batchReviewNovel(props.novelId)
    const taskId = resp?.task_id ?? resp?.data?.task_id
    taskStore.trackTask(taskId, async (task) => {
      reviewing.value = false
      if (task?.status === 'failed') {
        taskError.value = task.error || '批量审查失败，请稍后重试'
        return
      }
      await loadReviews()
      emit('reviewed')
      toast.success(`批量审查完成，共 ${summary.value.total} 章`)
    })
  } catch (e: any) {
    reviewing.value = false
    taskError.value = e.message || '提交失败'
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const dimensions = [
  { key: 'structure_score', label: '结构' },
  { key: 'pacing_score', label: '节奏' },
  { key: 'continuity_score', label: '连贯' },
  { key: 'character_score', label: '人物' },
  { key: 'conflict_score', label: '冲突' },
  { key: 'hook_score', label: '钩子' },
] as const

function scoreColor(s: number) {
  if (s >= 80) return 'text-green-600 dark:text-green-400'
  if (s >= 60) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}
function scoreBarColor(s: number) {
  if (s >= 80) return 'bg-green-500'
  if (s >= 60) return 'bg-yellow-500'
  return 'bg-red-500'
}
function statusBadge(status: string) {
  const map: Record<string, { label: string; cls: string }> = {
    passed:    { label: '通过',   cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
    warning:   { label: '需改进', cls: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' },
    failed:    { label: '问题较多', cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
    reviewing: { label: '审查中', cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
    pending:   { label: '待审查', cls: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400' },
  }
  return map[status] ?? map.pending
}
function severityIcon(s: string) {
  return { error: '🔴', warning: '🟡', info: '🔵' }[s] ?? '⚪'
}
function issueList(r: OutlineReview): OutlineIssue[] {
  try { return JSON.parse(r.issues_json || '[]') } catch { return [] }
}
function highlightList(r: OutlineReview): string[] {
  try { return JSON.parse(r.highlights_json || '[]') } catch { return [] }
}
function toggleExpand(id: number) {
  expandedId.value = expandedId.value === id ? null : id
}
</script>

<template>
  <Teleport to="body">
    <Transition name="slide-right">
      <div v-if="props.visible !== false" class="fixed inset-0 z-50 flex justify-end">
        <div class="absolute inset-0 bg-black/30" @click="emit('close')" />
        <div class="relative w-full max-w-xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col overflow-hidden">

          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
            <div class="flex items-center gap-2">
              <svg class="w-5 h-5 text-primary-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
              </svg>
              <h2 class="font-semibold text-gray-900 dark:text-white">批量审查大纲</h2>
              <!-- Summary badges -->
              <template v-if="!reviewing && reviews.length > 0">
                <span v-if="summary.failed > 0" class="text-xs px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">{{ summary.failed }} 问题</span>
                <span v-if="summary.warning > 0" class="text-xs px-1.5 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">{{ summary.warning }} 改进</span>
                <span v-if="summary.passed > 0" class="text-xs px-1.5 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">{{ summary.passed }} 通过</span>
              </template>
            </div>
            <div class="flex items-center gap-2">
              <button
                v-if="!reviewing"
                class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                @click="startBatchReview"
              >{{ reviews.length > 0 ? '重新审查' : '开始审查' }}</button>
              <button class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="emit('close')">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto">

            <!-- Reviewing -->
            <div v-if="reviewing" class="flex flex-col items-center py-16 gap-3">
              <svg class="w-8 h-8 text-primary-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              <p class="text-sm text-gray-500 dark:text-gray-400">AI 正在审查所有章节大纲，请稍候…</p>
              <p class="text-xs text-gray-400 dark:text-gray-500">完成后结果将自动更新</p>
            </div>

            <!-- Loading results -->
            <div v-else-if="loading" class="flex flex-col items-center py-16 gap-3">
              <svg class="w-6 h-6 text-gray-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              <p class="text-sm text-gray-400">加载审查结果中…</p>
            </div>

            <!-- Task Error -->
            <div v-else-if="taskError" class="p-5">
              <div class="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
                <p class="text-sm text-red-700 dark:text-red-300">{{ taskError }}</p>
                <button class="mt-3 px-4 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors" @click="startBatchReview">重试</button>
              </div>
            </div>

            <!-- Load Error -->
            <div v-else-if="loadError" class="p-5">
              <div class="rounded-xl border border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-900/20 p-4">
                <p class="text-sm text-orange-700 dark:text-orange-300">{{ loadError }}</p>
                <button class="mt-3 px-4 py-1.5 text-xs bg-orange-600 hover:bg-orange-700 text-white rounded-lg transition-colors" @click="loadReviews">重新加载</button>
              </div>
            </div>

            <!-- Empty — no reviews yet -->
            <div v-else-if="reviews.length === 0" class="flex flex-col items-center py-16 gap-3 text-gray-400">
              <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>
              </svg>
              <p class="text-sm">暂无审查结果</p>
              <button class="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors" @click="startBatchReview">开始批量审查</button>
            </div>

            <!-- Results list -->
            <div v-else class="divide-y divide-gray-100 dark:divide-gray-800">
              <div v-for="{ chapter, review } in rows" :key="chapter.id">
                <!-- Row header -->
                <div
                  class="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  @click="review && toggleExpand(chapter.id)"
                >
                  <span class="text-xs text-gray-400 dark:text-gray-500 w-10 shrink-0">第{{ chapter.chapter_no }}章</span>
                  <span class="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">{{ chapter.title || '（无标题）' }}</span>
                  <template v-if="review">
                    <span class="text-sm font-semibold tabular-nums shrink-0" :class="scoreColor(review.overall_score)">{{ Math.round(review.overall_score) }}</span>
                    <span class="text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0" :class="statusBadge(review.status).cls">{{ statusBadge(review.status).label }}</span>
                    <svg class="w-4 h-4 text-gray-400 shrink-0 transition-transform" :class="expandedId === chapter.id ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                    </svg>
                  </template>
                  <span v-else class="text-xs text-gray-400 shrink-0">待审查</span>
                </div>

                <!-- Expanded detail -->
                <div v-if="review && expandedId === chapter.id" class="px-5 pb-5 pt-1 space-y-4 bg-gray-50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-800">
                  <!-- Dimension bars -->
                  <div class="space-y-2">
                    <div v-for="dim in dimensions" :key="dim.key" class="flex items-center gap-2">
                      <span class="text-xs text-gray-500 dark:text-gray-400 w-10 shrink-0">{{ dim.label }}</span>
                      <div class="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div class="h-full rounded-full transition-all duration-500" :class="scoreBarColor((review as any)[dim.key])" :style="`width:${(review as any)[dim.key]}%`"/>
                      </div>
                      <span class="text-xs tabular-nums w-8 text-right" :class="scoreColor((review as any)[dim.key])">{{ Math.round((review as any)[dim.key]) }}</span>
                    </div>
                  </div>

                  <!-- Highlights -->
                  <div v-if="highlightList(review).length > 0" class="space-y-1">
                    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">亮点</p>
                    <ul class="space-y-0.5">
                      <li v-for="(h, i) in highlightList(review)" :key="i" class="flex items-start gap-1.5 text-xs text-green-700 dark:text-green-400">
                        <span class="shrink-0 mt-0.5">✓</span><span>{{ h }}</span>
                      </li>
                    </ul>
                  </div>

                  <!-- Issues -->
                  <div v-if="issueList(review).length > 0" class="space-y-2">
                    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">问题（{{ issueList(review).length }}）</p>
                    <div
                      v-for="(issue, i) in issueList(review)" :key="i"
                      class="rounded-lg border p-2.5 text-xs"
                      :class="{
                        'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20': issue.severity === 'error',
                        'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20': issue.severity === 'warning',
                        'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20': issue.severity === 'info',
                      }"
                    >
                      <div class="flex items-center gap-1.5 mb-1">
                        <span>{{ severityIcon(issue.severity) }}</span>
                        <span class="font-medium text-gray-800 dark:text-gray-200">{{ issue.description }}</span>
                      </div>
                      <p class="text-gray-500 dark:text-gray-400">💡 {{ issue.suggestion }}</p>
                    </div>
                  </div>

                  <!-- Suggestion -->
                  <div v-if="review.suggestion">
                    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">综合建议</p>
                    <p class="text-xs text-gray-600 dark:text-gray-400 leading-relaxed bg-white dark:bg-gray-800 rounded-lg p-2.5 border border-gray-200 dark:border-gray-700">{{ review.suggestion }}</p>
                  </div>
                </div>
              </div>
            </div>

          </div><!-- /Body -->

          <!-- Footer -->
          <div v-if="!reviewing && reviews.length > 0" class="px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 shrink-0">
            <button
              class="w-full py-2 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 border border-dashed border-primary-300 dark:border-primary-600 rounded-lg transition-colors hover:border-primary-400 flex items-center justify-center gap-1.5"
              @click="startBatchReview"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              重新审查全部章节
            </button>
          </div>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
.slide-right-enter-from,
.slide-right-leave-to {
  transform: translateX(100%);
}
</style>
