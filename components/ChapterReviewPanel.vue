<script setup lang="ts">
import type { ChapterReview, ChapterReviewRecord, ChapterIgnoredIssue, ParagraphFeedback } from '~/types'

const props = defineProps<{ chapterId: number; llmProvider?: string }>()
const emit = defineEmits<{ (e: 'close'): void; (e: 'content-updated'): void }>()

const toast = useToast()
const { confirm } = useConfirm()
const api = useChapterReviewApi()

// ── Tab state ──
const tab = ref<'current' | 'history' | 'ignored'>('current')

// ── Review state ──
const reviewing = ref(false)
const reviewResult = ref<ChapterReview | null>(null)
const reviewError = ref('')

// ── History ──
const reviewHistory = ref<ChapterReviewRecord[]>([])
const loadingHistory = ref(false)
const rollingBackId = ref<number | null>(null)

// ── Ignored issues ──
const ignoredIssues = ref<ChapterIgnoredIssue[]>([])
const ignoringKey = ref<string | null>(null)

// ── Apply state ──
type DiffItem = {
  index: number
  orig_text: string
  suggested_rewrite: string
  issues: string[]
  suggestion: string
  severity: 'info' | 'warning' | 'error'
  selected: boolean
}
const diffItems = ref<DiffItem[]>([])
const applyingDiffs = ref(false)

const ignoredHashSet = computed(() => {
  const s = new Set<string>()
  for (const ig of ignoredIssues.value) s.add(ig.issue_hash)
  return s
})

function sha256Hex(str: string): string {
  // Simple hash approximation for UI dedup; backend does real SHA256
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(31, h) + str.charCodeAt(i) | 0
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

// ── Lifecycle ──
onMounted(async () => {
  await Promise.all([loadHistory(), loadIgnoredIssues()])
  const latest = reviewHistory.value[0]
  if (latest?.review) {
    reviewResult.value = { ...latest.review, record_id: latest.id }
    buildDiffItems(reviewResult.value)
  } else {
    startReview()
  }
})

// ── API helpers ──
async function loadHistory() {
  loadingHistory.value = true
  try {
    const res = await api.listReviewRecords(props.chapterId)
    reviewHistory.value = (res.data ?? []) as ChapterReviewRecord[]
  } catch (e: any) {
    toast.error('加载审查历史失败：' + (e.message || ''))
  } finally {
    loadingHistory.value = false
  }
}

async function loadIgnoredIssues() {
  try {
    const res = await api.listIgnoredIssues(props.chapterId)
    ignoredIssues.value = (res.data ?? []) as ChapterIgnoredIssue[]
  } catch { /* non-critical */ }
}

function buildDiffItems(review: ChapterReview) {
  diffItems.value = (review.paragraph_feedback ?? []).map(fb => ({
    index: fb.index,
    orig_text: fb.orig_text,
    suggested_rewrite: fb.suggested_rewrite,
    issues: fb.issues,
    suggestion: fb.suggestion,
    severity: fb.severity,
    selected: !!fb.suggested_rewrite,
  }))
}

async function startReview() {
  reviewing.value = true
  reviewError.value = ''
  reviewResult.value = null
  diffItems.value = []
  tab.value = 'current'
  loadHistory()
  try {
    const res = await api.reviewChapter(props.chapterId, props.llmProvider)
    const taskId = res.data?.task_id
    if (!taskId) throw new Error('未获取到审查任务 ID')
    useTaskStore().trackTask(taskId, (task) => {
      reviewing.value = false
      if (task.status === 'completed') {
        reviewResult.value = task.data as ChapterReview
        buildDiffItems(reviewResult.value)
        loadHistory()
      } else {
        reviewError.value = (task as any).error || '审查失败，请稍后重试'
      }
    })
  } catch (e: any) {
    reviewError.value = e.message || '审查失败'
    reviewing.value = false
  }
}

async function handleRollback(record: ChapterReviewRecord) {
  if (!confirm(`确认将章节内容回滚到本次审查（${record.created_at}）应用前的状态？此操作不可撤销。`)) return
  rollingBackId.value = record.id
  try {
    await api.rollbackReview(props.chapterId, record.id)
    toast.success('已成功回滚章节内容')
    await loadHistory()
    emit('content-updated')
  } catch (e: any) {
    toast.error(e.message || '回滚失败')
  } finally {
    rollingBackId.value = null
  }
}

async function handleApplySelected() {
  const selected = diffItems.value.filter(d => d.selected && d.suggested_rewrite)
  if (selected.length === 0) {
    toast.info('请先勾选要应用的改写')
    return
  }
  applyingDiffs.value = true
  try {
    const diffs = selected.map(d => ({ index: d.index, new_content: d.suggested_rewrite }))
    const recordId = reviewResult.value?.record_id
    const res = await api.applyDiffs(props.chapterId, diffs, recordId)
    const count = res.data?.updated_paragraphs ?? 0
    toast.success(`已应用 ${count} 处段落改写`)
    await loadHistory()
    emit('content-updated')
  } catch (e: any) {
    toast.error(e.message || '应用失败')
  } finally {
    applyingDiffs.value = false
  }
}

async function handleIgnore(fb: ParagraphFeedback | DiffItem) {
  const key = sha256Hex(fb.issues.join('|'))
  if (ignoringKey.value === key) return
  ignoringKey.value = key
  try {
    await api.ignoreIssue(props.chapterId, fb.issues.join('; '))
    await loadIgnoredIssues()
    toast.success('已忽略该建议')
  } catch (e: any) {
    toast.error(e.message || '忽略失败')
  } finally {
    ignoringKey.value = null
  }
}

async function handleUnignore(item: ChapterIgnoredIssue) {
  try {
    await api.unignoreIssue(props.chapterId, item.id)
    await loadIgnoredIssues()
    toast.success('已取消忽略')
  } catch (e: any) {
    toast.error(e.message || '操作失败')
  }
}

// ── Helpers ──
function scoreColor(score: number) {
  if (score >= 0.85) return 'text-green-600 dark:text-green-400'
  if (score >= 0.7) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

function scoreBar(score: number) {
  if (score >= 0.85) return 'bg-green-500'
  if (score >= 0.7) return 'bg-yellow-500'
  return 'bg-red-500'
}

function severityClass(s: string) {
  if (s === 'error') return 'border-red-400 bg-red-50 dark:bg-red-900/20'
  if (s === 'warning') return 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20'
  return 'border-blue-300 bg-blue-50 dark:bg-blue-900/20'
}

const expandedIdx = ref<number | null>(null)
function toggleExpand(idx: number) {
  expandedIdx.value = expandedIdx.value === idx ? null : idx
}

defineExpose({ startReview, reviewing })
</script>

<template>
  <Teleport to="body">
    <Transition name="slide-right" appear>
      <div class="fixed inset-0 z-50 flex justify-end">
        <div class="absolute inset-0 bg-black/30" @click="emit('close')" />
        <div class="relative w-full max-w-xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col overflow-hidden">

          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700 shrink-0">
            <div class="flex items-center gap-3">
              <svg class="w-5 h-5 text-primary-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <!-- Tabs -->
              <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                <button
                  v-for="t in [{ id: 'current', label: '当前审查' }, { id: 'history', label: '历史记录' }, { id: 'ignored', label: '已忽略' }]"
                  :key="t.id"
                  class="px-3 py-1 text-xs font-medium transition-colors"
                  :class="tab === t.id
                    ? 'bg-primary-500 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50'"
                  @click="tab = t.id as any"
                >{{ t.label }}</button>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button
                v-if="!reviewing"
                class="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                @click="startReview"
              >重新审查</button>
              <button class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="emit('close')">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-y-auto">

            <!-- ── 当前审查 Tab ── -->
            <div v-if="tab === 'current'" class="p-5 space-y-5">

              <!-- Loading -->
              <div v-if="reviewing" class="flex flex-col items-center py-12 gap-3">
                <svg class="w-8 h-8 text-primary-500 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
                <p class="text-sm text-gray-500">AI 正在审查章节内容，请稍候…</p>
              </div>

              <!-- Error -->
              <div v-else-if="reviewError" class="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
                <p class="text-sm text-red-700 dark:text-red-300">{{ reviewError }}</p>
                <button class="mt-3 px-4 py-1.5 text-xs bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors" @click="startReview">重试</button>
              </div>

              <!-- Results -->
              <template v-else-if="reviewResult">

                <!-- Score overview -->
                <div class="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                  <div class="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <span class="text-sm font-semibold text-gray-700 dark:text-gray-200">综合评分</span>
                    <span class="text-2xl font-bold tabular-nums" :class="scoreColor(reviewResult.overall_score)">
                      {{ (reviewResult.overall_score * 100).toFixed(0) }}
                    </span>
                  </div>
                  <div class="p-4 space-y-2.5">
                    <div v-for="dim in [
                      { key: 'narrative_score', label: '叙事连贯' },
                      { key: 'character_score', label: '角色一致' },
                      { key: 'writing_score', label: '文笔质量' },
                      { key: 'pacing_score', label: '节奏把控' },
                    ]" :key="dim.key" class="flex items-center gap-2">
                      <span class="text-xs text-gray-500 w-16 shrink-0">{{ dim.label }}</span>
                      <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          class="h-full rounded-full transition-all duration-500"
                          :class="scoreBar((reviewResult as any)[dim.key])"
                          :style="{ width: `${((reviewResult as any)[dim.key] ?? 0) * 100}%` }"
                        />
                      </div>
                      <span class="text-xs tabular-nums w-10 text-right" :class="scoreColor((reviewResult as any)[dim.key])">
                        {{ ((reviewResult as any)[dim.key] * 100).toFixed(0) }}
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Summary -->
                <div v-if="reviewResult.summary" class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed px-1">
                  {{ reviewResult.summary }}
                </div>

                <!-- Strengths / Weaknesses -->
                <div v-if="reviewResult.strengths?.length || reviewResult.weaknesses?.length" class="grid grid-cols-2 gap-3">
                  <div v-if="reviewResult.strengths?.length" class="rounded-xl p-3 bg-green-50 dark:bg-green-900/20 space-y-1">
                    <p class="text-xs font-semibold text-green-700 dark:text-green-400">亮点</p>
                    <ul class="space-y-0.5">
                      <li v-for="s in reviewResult.strengths" :key="s" class="text-xs text-green-700 dark:text-green-300 leading-snug">• {{ s }}</li>
                    </ul>
                  </div>
                  <div v-if="reviewResult.weaknesses?.length" class="rounded-xl p-3 bg-amber-50 dark:bg-amber-900/20 space-y-1">
                    <p class="text-xs font-semibold text-amber-700 dark:text-amber-400">不足</p>
                    <ul class="space-y-0.5">
                      <li v-for="w in reviewResult.weaknesses" :key="w" class="text-xs text-amber-700 dark:text-amber-300 leading-snug">• {{ w }}</li>
                    </ul>
                  </div>
                </div>

                <!-- Global suggestions -->
                <div v-if="reviewResult.global_suggestions?.length" class="space-y-1">
                  <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">整体建议</p>
                  <ul class="space-y-1">
                    <li v-for="sg in reviewResult.global_suggestions" :key="sg" class="flex gap-1.5 text-xs text-gray-600 dark:text-gray-300">
                      <span class="text-blue-400 shrink-0">›</span>{{ sg }}
                    </li>
                  </ul>
                </div>

                <!-- Paragraph feedback -->
                <div v-if="diffItems.length > 0" class="space-y-2">
                  <div class="flex items-center justify-between">
                    <p class="text-xs font-semibold text-gray-500 uppercase tracking-wide">段落反馈（{{ diffItems.length }}）</p>
                    <button
                      v-if="diffItems.some(d => d.suggested_rewrite)"
                      class="text-xs px-3 py-1 rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors disabled:opacity-40"
                      :disabled="applyingDiffs"
                      @click="handleApplySelected"
                    >
                      <svg v-if="applyingDiffs" class="w-3 h-3 animate-spin inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                      </svg>
                      应用选中改写
                    </button>
                  </div>

                  <div
                    v-for="(item, i) in diffItems"
                    :key="item.index"
                    class="rounded-xl border overflow-hidden"
                    :class="severityClass(item.severity)"
                  >
                    <!-- Item header -->
                    <div class="flex items-start gap-2 px-3 py-2.5 cursor-pointer" @click="toggleExpand(i)">
                      <input
                        v-if="item.suggested_rewrite"
                        type="checkbox"
                        class="mt-0.5 shrink-0 rounded text-primary-600"
                        :checked="item.selected"
                        @click.stop
                        @change="item.selected = ($event.target as HTMLInputElement).checked"
                      />
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-1.5 mb-1">
                          <span class="text-xs font-semibold text-gray-600 dark:text-gray-300">段落 {{ item.index }}</span>
                          <span
                            class="text-[10px] px-1.5 py-0.5 rounded font-medium"
                            :class="item.severity === 'error' ? 'bg-red-100 text-red-700' : item.severity === 'warning' ? 'bg-yellow-100 text-yellow-700' : 'bg-blue-100 text-blue-700'"
                          >{{ item.severity }}</span>
                        </div>
                        <p class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{{ item.orig_text }}</p>
                        <ul class="mt-1 space-y-0.5">
                          <li v-for="iss in item.issues" :key="iss" class="text-xs text-gray-700 dark:text-gray-300">• {{ iss }}</li>
                        </ul>
                      </div>
                      <svg
                        class="w-4 h-4 text-gray-400 shrink-0 transition-transform"
                        :class="expandedIdx === i ? 'rotate-180' : ''"
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                      </svg>
                    </div>

                    <!-- Expanded: suggested rewrite + ignore -->
                    <div v-if="expandedIdx === i" class="px-3 pb-3 space-y-2 border-t border-gray-200 dark:border-gray-600 pt-2">
                      <div v-if="item.suggestion" class="text-xs text-gray-600 dark:text-gray-300 italic">
                        建议：{{ item.suggestion }}
                      </div>
                      <div v-if="item.suggested_rewrite" class="bg-white dark:bg-gray-800 rounded-lg p-2.5 text-xs text-gray-700 dark:text-gray-300 leading-relaxed border border-gray-200 dark:border-gray-600 whitespace-pre-wrap">
                        {{ item.suggested_rewrite }}
                      </div>
                      <button
                        class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                        @click="handleIgnore(item)"
                      >忽略此建议</button>
                    </div>
                  </div>
                </div>
              </template>

              <!-- Empty state (no review yet) -->
              <div v-else class="flex flex-col items-center py-12 gap-3 text-gray-400">
                <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <p class="text-sm">暂无审查结果</p>
                <button class="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors" @click="startReview">开始审查</button>
              </div>
            </div>

            <!-- ── 历史记录 Tab ── -->
            <div v-if="tab === 'history'" class="p-5 space-y-3">
              <div v-if="loadingHistory" class="text-center py-8 text-sm text-gray-400">加载中…</div>
              <div v-else-if="reviewHistory.length === 0" class="text-center py-8 text-sm text-gray-400">暂无审查记录</div>
              <div
                v-for="rec in reviewHistory"
                :key="rec.id"
                class="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
              >
                <div class="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800">
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-semibold tabular-nums" :class="scoreColor(rec.overall_score)">
                      {{ (rec.overall_score * 100).toFixed(0) }}
                    </span>
                    <span class="text-xs text-gray-400">{{ rec.created_at }}</span>
                    <span
                      class="text-[10px] px-1.5 py-0.5 rounded font-medium"
                      :class="rec.status === 'applied' ? 'bg-green-100 text-green-700' : rec.status === 'rolled_back' ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-700'"
                    >{{ rec.status === 'applied' ? '已应用' : rec.status === 'rolled_back' ? '已回滚' : '待处理' }}</span>
                  </div>
                  <button
                    v-if="rec.status === 'applied'"
                    class="text-xs px-2.5 py-1 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
                    :disabled="rollingBackId === rec.id"
                    @click="handleRollback(rec)"
                  >
                    <svg v-if="rollingBackId === rec.id" class="w-3 h-3 animate-spin inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                    </svg>
                    <span v-else>回滚</span>
                  </button>
                </div>
                <div v-if="rec.review?.summary" class="px-4 py-2.5 text-xs text-gray-600 dark:text-gray-300 border-t border-gray-100 dark:border-gray-700">
                  {{ rec.review.summary }}
                </div>
              </div>
            </div>

            <!-- ── 已忽略 Tab ── -->
            <div v-if="tab === 'ignored'" class="p-5 space-y-3">
              <div v-if="ignoredIssues.length === 0" class="text-center py-8 text-sm text-gray-400">暂无已忽略的建议</div>
              <div
                v-for="item in ignoredIssues"
                :key="item.id"
                class="flex items-start justify-between gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-4 py-3"
              >
                <div class="flex-1 min-w-0">
                  <p class="text-sm text-gray-700 dark:text-gray-300 line-clamp-3">{{ item.issue_text }}</p>
                  <p v-if="item.note" class="mt-1 text-xs text-gray-400">{{ item.note }}</p>
                  <p class="mt-1 text-[10px] text-gray-400">{{ item.created_at }}</p>
                </div>
                <button
                  class="shrink-0 text-xs px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
                  @click="handleUnignore(item)"
                >取消忽略</button>
              </div>
            </div>

          </div><!-- /Body -->
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
