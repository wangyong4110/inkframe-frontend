<script setup lang="ts">
import type { OutlineReview, OutlineIssue, Chapter, NovelOutlineSynthesis, TensionPoint, ArcBalance, ChapterAdvice } from '~/types'

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

const activeTab = ref<'chapters' | 'report'>('report')
const reviewing = ref(false)
const loading = ref(false)
const taskError = ref('')
const loadError = ref('')
const reviews = ref<OutlineReview[]>([])
const synthesis = ref<NovelOutlineSynthesis | null>(null)
const expandedId = ref<number | null>(null)

// ── Computed helpers ──────────────────────────────────────────────────────────

const reviewMap = computed(() => {
  const m: Record<number, OutlineReview> = {}
  for (const r of reviews.value) m[r.chapter_id] = r
  return m
})

const rows = computed(() => {
  return [...props.chapters]
    .map(ch => ({ chapter: ch, review: reviewMap.value[ch.id] ?? null }))
    .filter(({ review }) => review !== null)
    .sort((a, b) => (a.review!.overall_score) - (b.review!.overall_score))
})

const summary = computed(() => {
  const total = props.chapters.length
  const passed = reviews.value.filter(r => r.status === 'passed').length
  const warning = reviews.value.filter(r => r.status === 'warning').length
  const failed = reviews.value.filter(r => r.status === 'failed').length
  const pending = total - reviews.value.length
  return { total, passed, warning, failed, pending }
})

// ── Synthesis parsers ─────────────────────────────────────────────────────────

const tensionCurve = computed<TensionPoint[]>(() => {
  if (!synthesis.value?.tension_curve_json) return []
  try { return JSON.parse(synthesis.value.tension_curve_json) } catch { return [] }
})

const arcBalance = computed<ArcBalance | null>(() => {
  if (!synthesis.value?.arc_balance_json) return null
  try { return JSON.parse(synthesis.value.arc_balance_json) } catch { return null }
})

const recurringIssues = computed<OutlineIssue[]>(() => {
  if (!synthesis.value?.recurring_issues_json) return []
  try { return JSON.parse(synthesis.value.recurring_issues_json) } catch { return [] }
})

const chapterAdvices = computed<ChapterAdvice[]>(() => {
  if (!synthesis.value?.chapter_advices_json) return []
  try { return JSON.parse(synthesis.value.chapter_advices_json) } catch { return [] }
})

const hasSynthesis = computed(() => synthesis.value !== null && synthesis.value.reviewed_count > 0)

const strategicSuggestions = computed<string[]>(() => {
  const raw = synthesis.value?.global_suggestion
  if (!raw) return []
  return raw.split('\n')
    .map(s => s.replace(/^\d+[.、．：:]\s*/, '').trim())
    .filter(s => s.length > 0)
})

// partial: some chapters reviewed but batch hasn't been run (no synthesis yet)
const isPartialState = computed(() =>
  reviews.value.length > 0 &&
  reviews.value.length < props.chapters.length &&
  !hasSynthesis.value
)

// ── Lifecycle ─────────────────────────────────────────────────────────────────

watch(() => props.visible, (v) => { if (v) init() }, { immediate: true })

async function init() {
  await Promise.all([loadReviews(), loadSynthesis()])
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

async function loadSynthesis() {
  try {
    const res = await outlineReviewApi.getSynthesis(props.novelId)
    synthesis.value = (res as any)?.data ?? res ?? null
  } catch {
    // synthesis may not exist yet — silently ignore
    synthesis.value = null
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
      await Promise.all([loadReviews(), loadSynthesis()])
      emit('reviewed')
      toast.success(`批量审查完成，共 ${summary.value.total} 章`)
      if (hasSynthesis.value) activeTab.value = 'report'
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

// tension curve helpers
function tensionBarHeight(pt: TensionPoint): number {
  // 优先用规划张力（1-10 scale），无规划则用审查分（0-100 scale 转换）
  if (pt.planned_level > 0) return pt.planned_level * 10
  if (pt.score > 0) return pt.score
  return 10
}
function tensionBarColor(pt: TensionPoint): string {
  if (pt.status === 'failed') return 'bg-red-400'
  if (pt.status === 'warning') return 'bg-yellow-400'
  if (pt.status === 'passed') return 'bg-green-400'
  return 'bg-gray-300 dark:bg-gray-600'
}
function dimensionLabel(dim: string): string {
  const map: Record<string, string> = {
    structure: '结构', pacing: '节奏', continuity: '连贯',
    character: '人物', conflict: '冲突', hook: '钩子',
  }
  return map[dim] ?? dim
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

          <!-- Tabs: 章节详情 only shown when there are reviewed chapters -->
          <div v-if="!reviewing && !loading && rows.length > 0" class="flex border-b border-gray-200 dark:border-gray-700 shrink-0">
            <button
              class="flex-1 py-2.5 text-xs font-medium transition-colors"
              :class="activeTab === 'report'
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-500'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
              @click="activeTab = 'report'"
            >全局报告</button>
            <button
              class="flex-1 py-2.5 text-xs font-medium transition-colors"
              :class="activeTab === 'chapters'
                ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-500'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'"
              @click="activeTab = 'chapters'"
            >章节详情 <span class="ml-1 tabular-nums">({{ rows.length }})</span></button>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto">

            <!-- Reviewing state -->
            <div v-if="reviewing" class="flex flex-col items-center py-16 gap-3">
              <svg class="w-8 h-8 text-primary-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              <p class="text-sm text-gray-500 dark:text-gray-400">AI 正在审查所有章节大纲，请稍候…</p>
              <p class="text-xs text-gray-400 dark:text-gray-500">完成后将自动生成全局报告</p>
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

            <!-- Empty — no reviews yet, show directly into global report empty state -->
            <div v-else-if="reviews.length === 0" class="p-5 space-y-4">
              <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">批量审查将生成</p>
                <ul class="space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
                  <li class="flex items-start gap-2"><span class="text-primary-400 shrink-0 mt-0.5">●</span><span><strong class="text-gray-700 dark:text-gray-300">张力曲线</strong> — 全书每章张力走势，直观显示平台期与断崖</span></li>
                  <li class="flex items-start gap-2"><span class="text-primary-400 shrink-0 mt-0.5">●</span><span><strong class="text-gray-700 dark:text-gray-300">三幕结构分析</strong> — 各幕平均分与叙事使命完成情况</span></li>
                  <li class="flex items-start gap-2"><span class="text-primary-400 shrink-0 mt-0.5">●</span><span><strong class="text-gray-700 dark:text-gray-300">全书共性问题</strong> — 跨章节重复出现的结构性缺陷</span></li>
                  <li class="flex items-start gap-2"><span class="text-primary-400 shrink-0 mt-0.5">●</span><span><strong class="text-gray-700 dark:text-gray-300">重点改进章节</strong> — 分数最低的章节及具体改进方向</span></li>
                  <li class="flex items-start gap-2"><span class="text-primary-400 shrink-0 mt-0.5">●</span><span><strong class="text-gray-700 dark:text-gray-300">全局战略建议</strong> — 全书最需改进的核心问题与可执行方案</span></li>
                </ul>
              </div>
              <button class="w-full py-2.5 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors" @click="startBatchReview">
                开始批量审查（共 {{ chapters.length }} 章）
              </button>
            </div>

            <!-- ══ CHAPTER LIST TAB ══ -->
            <div v-else-if="activeTab === 'chapters'" class="divide-y divide-gray-100 dark:divide-gray-800">
              <!-- Partial state banner -->
              <div v-if="isPartialState" class="px-5 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 flex items-start gap-3">
                <svg class="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-medium text-amber-700 dark:text-amber-400">仅 {{ rows.length }}/{{ chapters.length }} 章有结果</p>
                  <p class="text-xs text-amber-600 dark:text-amber-500 mt-0.5">这些是单章独立审查的结果。点击下方按钮批量审查全部章节，完成后将自动生成包含张力曲线、三幕分析等内容的全局报告。</p>
                </div>
                <button class="shrink-0 text-xs px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors" @click="startBatchReview">批量审查</button>
              </div>
              <div v-for="{ chapter, review } in rows" :key="chapter.id">
                <div
                  class="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  @click="toggleExpand(chapter.id)"
                >
                  <span class="text-xs text-gray-400 dark:text-gray-500 w-10 shrink-0">第{{ chapter.chapter_no }}章</span>
                  <span class="flex-1 text-sm text-gray-800 dark:text-gray-200 truncate">{{ chapter.title || '（无标题）' }}</span>
                  <span class="text-sm font-semibold tabular-nums shrink-0" :class="scoreColor(review!.overall_score)">{{ Math.round(review!.overall_score) }}</span>
                  <span class="text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0" :class="statusBadge(review!.status).cls">{{ statusBadge(review!.status).label }}</span>
                  <svg class="w-4 h-4 text-gray-400 shrink-0 transition-transform" :class="expandedId === chapter.id ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                  </svg>
                </div>

                <div v-if="expandedId === chapter.id" class="px-5 pb-5 pt-1 space-y-4 bg-gray-50 dark:bg-gray-800/30 border-t border-gray-100 dark:border-gray-800">
                  <!-- Dimension bars -->
                  <div class="space-y-2">
                    <div v-for="dim in dimensions" :key="dim.key" class="flex items-center gap-2">
                      <span class="text-xs text-gray-500 dark:text-gray-400 w-10 shrink-0">{{ dim.label }}</span>
                      <div class="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div class="h-full rounded-full transition-all duration-500" :class="scoreBarColor((review! as any)[dim.key])" :style="`width:${(review! as any)[dim.key]}%`"/>
                      </div>
                      <span class="text-xs tabular-nums w-8 text-right" :class="scoreColor((review! as any)[dim.key])">{{ Math.round((review! as any)[dim.key]) }}</span>
                    </div>
                  </div>

                  <!-- Highlights -->
                  <div v-if="highlightList(review!).length > 0" class="space-y-1">
                    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">亮点</p>
                    <ul class="space-y-0.5">
                      <li v-for="(h, i) in highlightList(review!)" :key="i" class="flex items-start gap-1.5 text-xs text-green-700 dark:text-green-400">
                        <span class="shrink-0 mt-0.5">✓</span><span>{{ h }}</span>
                      </li>
                    </ul>
                  </div>

                  <!-- Issues -->
                  <div v-if="issueList(review!).length > 0" class="space-y-2">
                    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">问题（{{ issueList(review!).length }}）</p>
                    <div
                      v-for="(issue, i) in issueList(review!)" :key="i"
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
                  <div v-if="review!.suggestion">
                    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">综合建议</p>
                    <p class="text-xs text-gray-600 dark:text-gray-400 leading-relaxed bg-white dark:bg-gray-800 rounded-lg p-2.5 border border-gray-200 dark:border-gray-700">{{ review!.suggestion }}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- ══ GLOBAL REPORT TAB ══ -->
            <div v-else-if="activeTab === 'report'" class="p-5 space-y-6">

              <!-- No synthesis yet -->
              <div v-if="!hasSynthesis" class="space-y-4">
                <!-- Explain what the report will contain -->
                <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                  <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">全局报告包含以下内容</p>
                  <ul class="space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <li class="flex items-start gap-2"><span class="text-primary-400 shrink-0 mt-0.5">●</span><span><strong class="text-gray-700 dark:text-gray-300">张力曲线</strong> — 全书每章张力走势图，直观显示平台期与断崖</span></li>
                    <li class="flex items-start gap-2"><span class="text-primary-400 shrink-0 mt-0.5">●</span><span><strong class="text-gray-700 dark:text-gray-300">三幕结构分析</strong> — 各幕平均分与叙事使命完成情况评估</span></li>
                    <li class="flex items-start gap-2"><span class="text-primary-400 shrink-0 mt-0.5">●</span><span><strong class="text-gray-700 dark:text-gray-300">全书共性问题</strong> — 跨章节重复出现的结构性缺陷（如"全书70%章节钩子不足"）</span></li>
                    <li class="flex items-start gap-2"><span class="text-primary-400 shrink-0 mt-0.5">●</span><span><strong class="text-gray-700 dark:text-gray-300">重点改进章节</strong> — 分数最低的章节及具体改进方向</span></li>
                    <li class="flex items-start gap-2"><span class="text-primary-400 shrink-0 mt-0.5">●</span><span><strong class="text-gray-700 dark:text-gray-300">全局战略建议</strong> — 全书最需改进的3个核心问题与可执行方案</span></li>
                  </ul>
                </div>
                <div class="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 flex items-start gap-3">
                  <svg class="w-4 h-4 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  <div class="flex-1">
                    <p class="text-xs font-medium text-amber-700 dark:text-amber-400">
                      {{ isPartialState ? `仅 ${reviews.length}/${chapters.length} 章已审查，全局报告需要全部章节完成后生成` : '尚未开始批量审查' }}
                    </p>
                    <p class="text-xs text-amber-600 dark:text-amber-500 mt-1">批量审查分两阶段：① 逐章分析（并发处理）② 全局综合分析（生成报告），完成后自动切换到此页。</p>
                  </div>
                </div>
                <button class="w-full py-2.5 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors" @click="startBatchReview; activeTab = 'chapters'">
                  {{ isPartialState ? '重新批量审查全部章节（生成全局报告）' : '开始批量审查' }}
                </button>
              </div>

              <template v-else>

                <!-- ① 总览统计 -->
                <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
                  <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">审查总览</p>
                  <div class="flex items-center gap-3">
                    <div class="flex-1 text-center">
                      <p class="text-2xl font-bold tabular-nums" :class="scoreColor(synthesis!.avg_score)">{{ synthesis!.avg_score.toFixed(1) }}</p>
                      <p class="text-xs text-gray-400 mt-0.5">平均分</p>
                    </div>
                    <div class="w-px h-12 bg-gray-200 dark:bg-gray-700"/>
                    <div class="flex-1 grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p class="text-lg font-semibold text-green-600 dark:text-green-400 tabular-nums">{{ synthesis!.passed_count }}</p>
                        <p class="text-xs text-gray-400">通过</p>
                      </div>
                      <div>
                        <p class="text-lg font-semibold text-yellow-600 dark:text-yellow-400 tabular-nums">{{ synthesis!.warning_count }}</p>
                        <p class="text-xs text-gray-400">改进</p>
                      </div>
                      <div>
                        <p class="text-lg font-semibold text-red-600 dark:text-red-400 tabular-nums">{{ synthesis!.failed_count }}</p>
                        <p class="text-xs text-gray-400">问题</p>
                      </div>
                    </div>
                  </div>
                  <div class="flex h-2 rounded-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                    <div class="bg-green-500 transition-all" :style="`width:${synthesis!.reviewed_count > 0 ? synthesis!.passed_count / synthesis!.reviewed_count * 100 : 0}%`"/>
                    <div class="bg-yellow-400 transition-all" :style="`width:${synthesis!.reviewed_count > 0 ? synthesis!.warning_count / synthesis!.reviewed_count * 100 : 0}%`"/>
                    <div class="bg-red-400 transition-all" :style="`width:${synthesis!.reviewed_count > 0 ? synthesis!.failed_count / synthesis!.reviewed_count * 100 : 0}%`"/>
                  </div>
                </div>

                <!-- ② 张力曲线 -->
                <div v-if="tensionCurve.length > 0" class="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">全书张力曲线</p>
                  <div class="flex items-end gap-px h-16 overflow-x-auto">
                    <div
                      v-for="pt in tensionCurve" :key="pt.chapter_no"
                      class="flex-shrink-0 rounded-t-sm transition-all cursor-default"
                      :class="tensionBarColor(pt)"
                      :style="`width:${Math.max(4, Math.floor(480 / tensionCurve.length))}px; height:${tensionBarHeight(pt)}%`"
                      :title="`第${pt.chapter_no}章 张力:${pt.planned_level}/10 分:${pt.score > 0 ? Math.round(pt.score) : '待审'}`"
                    />
                  </div>
                  <div class="flex justify-between mt-1.5 text-xs text-gray-400">
                    <span>第1章</span>
                    <span class="flex items-center gap-2">
                      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-green-400 inline-block"/>通过</span>
                      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-yellow-400 inline-block"/>改进</span>
                      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-red-400 inline-block"/>问题</span>
                      <span class="flex items-center gap-1"><span class="w-2 h-2 rounded-sm bg-gray-300 dark:bg-gray-600 inline-block"/>待审</span>
                    </span>
                    <span>第{{ tensionCurve[tensionCurve.length - 1]?.chapter_no }}章</span>
                  </div>
                </div>

                <!-- ③ 三幕结构分析 -->
                <div v-if="arcBalance" class="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div class="px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">三幕结构分析</p>
                  </div>
                  <div class="p-4 space-y-3">
                    <div v-for="(act, i) in [
                      { label: '第一幕', count: arcBalance.act1_count, score: arcBalance.act1_avg_score },
                      { label: '第二幕', count: arcBalance.act2_count, score: arcBalance.act2_avg_score },
                      { label: '第三幕', count: arcBalance.act3_count, score: arcBalance.act3_avg_score },
                    ]" :key="i" class="flex items-center gap-3 text-xs">
                      <span class="w-12 shrink-0 text-gray-500 dark:text-gray-400">{{ act.label }}</span>
                      <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          class="h-full rounded-full transition-all duration-500"
                          :class="act.score >= 80 ? 'bg-green-500' : act.score >= 60 ? 'bg-yellow-400' : act.score > 0 ? 'bg-red-400' : 'bg-gray-300 dark:bg-gray-600'"
                          :style="`width:${act.score > 0 ? act.score : 0}%`"
                        />
                      </div>
                      <span class="font-semibold tabular-nums w-8 text-right shrink-0" :class="act.score > 0 ? scoreColor(act.score) : 'text-gray-400'">
                        {{ act.score > 0 ? Math.round(act.score) : '—' }}
                      </span>
                      <span class="text-gray-400 shrink-0 w-8">{{ act.count }}章</span>
                    </div>
                    <p v-if="arcBalance.assessment" class="text-xs text-gray-600 dark:text-gray-400 leading-relaxed bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2.5 border border-blue-100 dark:border-blue-800">{{ arcBalance.assessment }}</p>
                    <p v-if="arcBalance.suggestion" class="text-xs text-gray-400 dark:text-gray-500 leading-relaxed pl-1">
                      <span class="mr-1 text-gray-300 dark:text-gray-600">└</span>{{ arcBalance.suggestion }}
                    </p>
                  </div>
                </div>

                <!-- ④ 共性问题 — 图一"不足"卡片样式：左边框色条 + 问题/└建议 分层 -->
                <div v-if="recurringIssues.length > 0" class="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div class="px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">全书共性问题</p>
                  </div>
                  <div class="divide-y divide-gray-100 dark:divide-gray-800">
                    <div
                      v-for="(issue, i) in recurringIssues" :key="i"
                      class="flex gap-0 text-xs"
                    >
                      <!-- severity color bar -->
                      <div class="w-1 shrink-0 rounded-l-none"
                        :class="{
                          'bg-red-400': issue.severity === 'error',
                          'bg-yellow-400': issue.severity === 'warning',
                          'bg-blue-400': issue.severity === 'info',
                        }"
                      />
                      <div class="flex-1 px-3 py-2.5 space-y-1">
                        <div class="flex items-center gap-1.5">
                          <span class="px-1 py-0.5 rounded text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700">{{ dimensionLabel(issue.dimension) }}</span>
                          <span class="font-medium text-gray-800 dark:text-gray-100">{{ issue.description }}</span>
                        </div>
                        <p class="text-gray-400 dark:text-gray-500 pl-1 leading-relaxed">
                          <span class="mr-1 text-gray-300 dark:text-gray-600">└</span>{{ issue.suggestion }}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- ⑤ 重点改进章节 — 图一段落反馈卡片样式：大分数 + 左边框 + └建议 -->
                <div v-if="chapterAdvices.length > 0" class="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div class="px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">重点改进章节（{{ chapterAdvices.length }}）</p>
                  </div>
                  <div class="divide-y divide-gray-100 dark:divide-gray-800">
                    <div v-for="(advice, i) in chapterAdvices" :key="i" class="flex gap-0 text-xs">
                      <!-- left border accent -->
                      <div class="w-1 shrink-0"
                        :class="{
                          'bg-red-400': advice.status === 'failed',
                          'bg-yellow-400': advice.status === 'warning',
                          'bg-green-400': advice.status === 'passed',
                        }"
                      />
                      <div class="flex-1 px-3 py-3 space-y-1.5">
                        <!-- chapter header -->
                        <div class="flex items-center gap-2">
                          <span class="text-gray-400 shrink-0">第{{ advice.chapter_no }}章</span>
                          <span class="flex-1 font-medium text-gray-800 dark:text-gray-100 truncate">{{ advice.title }}</span>
                          <span class="text-lg font-bold tabular-nums shrink-0 leading-none" :class="scoreColor(advice.score)">{{ advice.score }}</span>
                          <span class="text-xs px-1.5 py-0.5 rounded-full shrink-0 font-medium" :class="statusBadge(advice.status).cls">{{ statusBadge(advice.status).label }}</span>
                        </div>
                        <!-- key issue -->
                        <p class="font-medium text-red-600 dark:text-red-400 leading-relaxed">{{ advice.key_issue }}</p>
                        <!-- suggestion with └ indent -->
                        <p class="text-gray-400 dark:text-gray-500 leading-relaxed pl-1">
                          <span class="mr-1 text-gray-300 dark:text-gray-600">└</span>{{ advice.suggestion }}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- ⑥ 全局战略建议 — 图一整体建议样式：逐条 › 图标行 -->
                <div v-if="strategicSuggestions.length > 0" class="rounded-xl border border-primary-200 dark:border-primary-800 overflow-hidden">
                  <div class="px-4 py-2.5 border-b border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/30">
                    <p class="text-xs font-semibold text-primary-600 dark:text-primary-400 uppercase tracking-wide">全局战略建议</p>
                  </div>
                  <div class="divide-y divide-primary-100 dark:divide-primary-900/40">
                    <div
                      v-for="(s, i) in strategicSuggestions" :key="i"
                      class="flex items-start gap-2 px-4 py-2.5 text-xs text-gray-700 dark:text-gray-300 leading-relaxed"
                    >
                      <svg class="w-3 h-3 text-primary-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                      </svg>
                      <span>{{ s }}</span>
                    </div>
                  </div>
                </div>

              </template>
            </div>

          </div><!-- /Body -->

          <!-- Footer -->
          <div v-if="!reviewing" class="px-5 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 shrink-0">
            <button
              class="w-full py-2 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 border border-dashed border-primary-300 dark:border-primary-600 rounded-lg transition-colors hover:border-primary-400 flex items-center justify-center gap-1.5"
              :class="isPartialState ? 'border-amber-300 dark:border-amber-600 text-amber-600 dark:text-amber-400 hover:border-amber-400' : ''"
              @click="startBatchReview"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              {{ isPartialState ? `批量审查全部 ${chapters.length} 章（生成全局报告）` : hasSynthesis ? '重新审查全部章节' : '开始批量审查' }}
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
