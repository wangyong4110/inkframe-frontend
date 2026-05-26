<script setup lang="ts">
import type { StoryboardReview, ReviewRecord } from '~/types'

const props = defineProps<{ videoId: number; llmProvider?: string }>()
const emit = defineEmits<{ (e: 'close'): void }>()

const videoStore = useVideoStore()
const toast = useToast()
const { confirm } = useConfirm()

// 组件挂载：优先复用最新历史记录，避免每次打开都重新触发 AI 审查
onMounted(async () => {
  await loadReviewHistory()
  const latest = reviewHistory.value[0]
  if (latest?.review) {
    // 有历史记录 → 直接恢复，无需再次调用 AI
    reviewResult.value = { ...latest.review, record_id: latest.id }
  } else {
    // 无任何审查记录 → 首次打开，自动触发
    startReview()
  }
})

const shots = computed(() => videoStore.storyboard)

// ── Review state ──
type DiffItem = {
  shot_no: number
  orig_narration: string; suggested_narration: string; has_narration_diff: boolean
  orig_description: string; suggested_description: string; has_description_diff: boolean
  issues: string[]; severity: 'info' | 'warning' | 'error'
  suggestion?: string   // 结构性建议文本（无可应用文字改动时展示）
  selected: boolean
  record_id?: number
}

const reviewPanelTab = ref<'current' | 'history'>('current')
const reviewing = ref(false)
const reviewResult = ref<StoryboardReview | null>(null)
const reviewError = ref('')
const showDiffModal = ref(false)
const diffItems = ref<DiffItem[]>([])
const applyingDiffs = ref(false)
const applyResult = ref<{ count: number } | null>(null)

const reviewHistory = ref<ReviewRecord[]>([])
const loadingHistory = ref(false)
const rollingBackId = ref<number | null>(null)

// 是否存在可应用的文字改动（narration 或 description 有实际差异）
const hasApplicableDiffs = computed(() => {
  if (!reviewResult.value?.shot_feedback?.length) return false
  const shotMap = new Map(shots.value.map(s => [s.shot_no, s]))
  return reviewResult.value.shot_feedback.some(fb => {
    const shot = shotMap.get(fb.shot_no)
    const hasNarr = !!fb.suggested_narration && fb.suggested_narration !== (shot?.narration ?? '')
    const hasDesc = !!fb.suggested_description && fb.suggested_description !== (shot?.description ?? '')
    return hasNarr || hasDesc
  })
})

// ── Statistics ──
const SHOT_SIZE_LABEL: Record<string, string> = {
  extreme_wide: '极远景', wide: '远景', full: '全景',
  medium: '中景', close_up: '近景', extreme_close_up: '特写',
}

const shotSizeStats = computed(() => {
  const counts: Record<string, number> = {}
  for (const s of shots.value) {
    const k = s.shot_size || 'unknown'
    counts[k] = (counts[k] ?? 0) + 1
  }
  const total = shots.value.length || 1
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([key, count]) => ({ key, label: SHOT_SIZE_LABEL[key] || key, count, pct: Math.round(count / total * 100) }))
})

const durationBuckets = computed(() => {
  const bs = [
    { label: '<3s', count: 0 },
    { label: '3–6s', count: 0 },
    { label: '6–10s', count: 0 },
    { label: '>10s', count: 0 },
  ]
  for (const s of shots.value) {
    const d = s.duration ?? 0
    if (d < 3) bs[0].count++
    else if (d < 6) bs[1].count++
    else if (d < 10) bs[2].count++
    else bs[3].count++
  }
  const total = shots.value.length || 1
  return bs.map(b => ({ ...b, pct: Math.round(b.count / total * 100) }))
})

// ── Helpers ──
// Normalize legacy scores stored on 0-100 scale to 0-10
function normalizeScore(score: number): number {
  return score > 10 ? score / 10 : score
}

function scoreColor(score: number) {
  const s = normalizeScore(score)
  if (s >= 8) return 'text-green-600 dark:text-green-400'
  if (s >= 6) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

function severityClass(severity: string) {
  if (severity === 'error') return 'border-red-400 bg-red-50 dark:bg-red-900/20'
  if (severity === 'warning') return 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20'
  return 'border-blue-300 bg-blue-50 dark:bg-blue-900/20'
}

// ── History ──
async function loadReviewHistory() {
  loadingHistory.value = true
  try {
    const api = useVideoApi()
    const res = await api.listReviewRecords(props.videoId)
    reviewHistory.value = (res.data ?? []) as ReviewRecord[]
  } catch (e: any) {
    toast.error('加载审查历史失败：' + (e.message || ''))
  } finally {
    loadingHistory.value = false
  }
}

async function handleRollback(record: ReviewRecord) {
  if (!confirm(`确认将脚本回滚到本次审查（${record.created_at}）应用前的状态？此操作不可撤销。`)) return
  rollingBackId.value = record.id
  try {
    const api = useVideoApi()
    const res = await api.rollbackReview(props.videoId, record.id)
    const n = res.data?.restored_shots ?? 0
    toast.success(`已回滚 ${n} 个镜头`)
    await loadReviewHistory()
    await videoStore.fetchStoryboard(props.videoId)
  } catch (e: any) {
    toast.error(e.message || '回滚失败，请稍后重试')
  } finally {
    rollingBackId.value = null
  }
}

function openHistoryDiffModal(record: ReviewRecord) {
  if (!record.review) return
  const shotMap = new Map(shots.value.map(s => [s.shot_no, s]))
  const items: DiffItem[] = []
  for (const fb of (record.review.shot_feedback ?? [])) {
    const shot = shotMap.get(fb.shot_no)
    const hasNarr = !!fb.suggested_narration && fb.suggested_narration !== (shot?.narration ?? '')
    const hasDesc = !!fb.suggested_description && fb.suggested_description !== (shot?.description ?? '')
    if (!hasNarr && !hasDesc) continue
    items.push({
      shot_no: fb.shot_no,
      orig_narration: shot?.narration ?? '',
      suggested_narration: fb.suggested_narration ?? '',
      has_narration_diff: hasNarr,
      orig_description: shot?.description ?? '',
      suggested_description: fb.suggested_description ?? '',
      has_description_diff: hasDesc,
      issues: fb.issues,
      severity: fb.severity,
      selected: true,
      record_id: record.id,
    })
  }
  if (items.length === 0) { toast.info('该审查记录无可应用的建议'); return }
  diffItems.value = items
  showDiffModal.value = true
}

function openDiffModal() {
  if (!reviewResult.value) return
  const shotMap = new Map(shots.value.map(s => [s.shot_no, s]))
  const items: DiffItem[] = []
  for (const fb of reviewResult.value.shot_feedback) {
    const shot = shotMap.get(fb.shot_no)
    const hasNarr = !!fb.suggested_narration && fb.suggested_narration !== (shot?.narration ?? '')
    const hasDesc = !!fb.suggested_description && fb.suggested_description !== (shot?.description ?? '')
    items.push({
      shot_no: fb.shot_no,
      orig_narration: shot?.narration ?? '',
      suggested_narration: fb.suggested_narration ?? '',
      has_narration_diff: hasNarr,
      orig_description: shot?.description ?? '',
      suggested_description: fb.suggested_description ?? '',
      has_description_diff: hasDesc,
      issues: fb.issues,
      severity: fb.severity,
      suggestion: (!hasNarr && !hasDesc) ? ((fb as any).suggestion ?? '') : undefined,
      selected: hasNarr || hasDesc,
      record_id: reviewResult.value.record_id,
    })
  }
  if (items.length === 0) {
    toast.info('暂无审查建议')
    return
  }
  diffItems.value = items
  showDiffModal.value = true
}

async function handleApplyDiffs() {
  const selected = diffItems.value.filter(d => d.selected)
  if (selected.length === 0) {
    toast.info('请先选择要应用的修改')
    return
  }
  applyingDiffs.value = true
  try {
    const api = useVideoApi()
    const recordId = selected[0]?.record_id
    const res = await api.applyStoryboardDiffs(props.videoId, selected.map(d => ({
      shot_no: d.shot_no,
      ...(d.has_narration_diff ? { narration: d.suggested_narration } : {}),
      ...(d.has_description_diff ? { description: d.suggested_description } : {}),
    })), recordId)
    const count = res.data?.updated_shots ?? 0
    applyResult.value = { count }
    toast.success(`已应用 ${count} 处修改，正在重新评分…`)
    showDiffModal.value = false
    await videoStore.fetchStoryboard(props.videoId)
    if (recordId) loadReviewHistory()
    // 应用修改后自动重新审查，以获取更新后的评分
    startReview()
  } catch (e: any) {
    toast.error(e.message || '应用失败，请稍后重试')
  } finally {
    applyingDiffs.value = false
  }
}

// ── Review trigger (called from parent via startReview) ──
async function startReview() {
  const prevScore = normalizeScore(reviewResult.value?.overall_score ?? 0)
  reviewing.value = true
  reviewError.value = ''
  reviewResult.value = null
  applyResult.value = null
  reviewPanelTab.value = 'current'
  loadReviewHistory()
  try {
    await videoStore.reviewStoryboard(props.videoId, props.llmProvider || undefined, prevScore || undefined, (task) => {
      reviewing.value = false
      if (task.status === 'completed') {
        reviewResult.value = task.data as StoryboardReview
        loadReviewHistory()
      } else {
        reviewError.value = (task as any).error || '审查失败，请稍后重试'
      }
    })
  } catch (e: any) {
    reviewError.value = e.message || '审查失败，请稍后重试'
    reviewing.value = false
  }
}

defineExpose({ startReview, reviewing })
</script>

<template>
  <!-- AI Review Panel -->
  <Teleport to="body">
    <Transition name="slide-right" appear>
      <div class="fixed inset-0 z-50 flex justify-end">
        <div class="absolute inset-0 bg-black/30" @click="emit('close')" />
        <div class="relative w-full max-w-xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col overflow-hidden">
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-3">
              <svg class="w-5 h-5 text-primary-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <!-- Tab switcher -->
              <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                <button
                  class="px-3 py-1 text-xs font-medium transition-colors"
                  :class="reviewPanelTab === 'current'
                    ? 'bg-primary-500 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-750'"
                  @click="reviewPanelTab = 'current'"
                >当前审查</button>
                <button
                  class="px-3 py-1 text-xs font-medium transition-colors relative"
                  :class="reviewPanelTab === 'history'
                    ? 'bg-primary-500 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-750'"
                  @click="reviewPanelTab = 'history'; loadReviewHistory()"
                >
                  历史记录
                  <span v-if="reviewHistory.length > 0" class="ml-1 text-xs opacity-75">({{ reviewHistory.length }})</span>
                </button>
              </div>
            </div>
            <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" @click="emit('close')">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- History tab content -->
          <div v-if="reviewPanelTab === 'history'" class="flex-1 overflow-y-auto px-5 py-4">
            <div v-if="loadingHistory" class="flex items-center justify-center py-12 text-gray-400 gap-2 text-sm">
              <svg class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              加载中…
            </div>
            <div v-else-if="reviewHistory.length === 0" class="py-12 text-center text-sm text-gray-400 dark:text-gray-600">
              暂无审查历史
            </div>
            <div v-else class="space-y-3">
              <div
                v-for="rec in reviewHistory"
                :key="rec.id"
                class="rounded-xl border border-gray-200 dark:border-gray-700 p-4"
              >
                <div class="flex items-center gap-2 mb-2">
                  <span class="text-2xl font-bold" :class="scoreColor(rec.overall_score)">{{ normalizeScore(rec.overall_score).toFixed(1) }}</span>
                  <span class="text-xs text-gray-400">/ 10</span>
                  <span
                    class="ml-auto text-xs px-2 py-0.5 rounded-full font-medium"
                    :class="{
                      'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400': rec.status === 'pending',
                      'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400': rec.status === 'applied',
                      'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400': rec.status === 'rolled_back',
                    }"
                  >{{ rec.status === 'pending' ? '未应用' : rec.status === 'applied' ? '已应用' : '已回滚' }}</span>
                </div>
                <div class="text-xs text-gray-500 dark:text-gray-400 mb-2">{{ rec.created_at }}</div>
                <div v-if="rec.review?.summary" class="text-xs text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">{{ rec.review.summary }}</div>
                <div class="flex items-center gap-2">
                  <button
                    v-if="rec.status === 'pending' && rec.review?.shot_feedback?.length"
                    class="text-xs px-2.5 py-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-medium"
                    @click="openHistoryDiffModal(rec)"
                  >预览并应用</button>
                  <button
                    v-if="rec.status === 'applied'"
                    class="text-xs px-2.5 py-1 rounded-lg border border-amber-400 text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 font-medium flex items-center gap-1"
                    :disabled="rollingBackId === rec.id"
                    @click="handleRollback(rec)"
                  >
                    <svg v-if="rollingBackId === rec.id" class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <svg v-else class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                    {{ rollingBackId === rec.id ? '回滚中…' : '回滚' }}
                  </button>
                  <span v-if="rec.status === 'rolled_back'" class="text-xs text-gray-400">已回滚，可重新审查</span>
                  <span v-if="rec.applied_at" class="text-xs text-gray-400 ml-auto">应用于 {{ rec.applied_at }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Current review tab content -->
          <div v-else class="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            <!-- Shot statistics (always visible when shots exist) -->
            <div v-if="shots.length > 0" class="rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
              <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">镜头统计分析</h4>
              <div>
                <div class="text-xs text-gray-500 dark:text-gray-400 mb-1.5">景别分布</div>
                <div class="space-y-1">
                  <div v-for="item in shotSizeStats" :key="item.key" class="flex items-center gap-2 text-xs">
                    <span class="text-gray-600 dark:text-gray-400 w-12 shrink-0 text-right">{{ item.label }}</span>
                    <div class="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
                      <div class="h-full rounded-full bg-primary-400 transition-all" :style="`width:${item.pct}%`" />
                    </div>
                    <span class="text-gray-500 dark:text-gray-400 w-8 text-right">{{ item.pct }}%</span>
                    <span class="text-gray-400 dark:text-gray-600 w-5 text-right">({{ item.count }})</span>
                  </div>
                </div>
              </div>
              <div>
                <div class="text-xs text-gray-500 dark:text-gray-400 mb-1.5">时长分布（秒）</div>
                <div class="grid grid-cols-4 gap-2">
                  <div v-for="b in durationBuckets" :key="b.label" class="flex flex-col items-center gap-1">
                    <div class="w-full bg-gray-100 dark:bg-gray-800 rounded h-8 relative overflow-hidden">
                      <div class="absolute bottom-0 left-0 right-0 bg-blue-400 dark:bg-blue-500 transition-all rounded" :style="`height:${Math.max(b.pct, b.count > 0 ? 8 : 0)}%`" />
                    </div>
                    <span class="text-xs text-gray-500 dark:text-gray-400">{{ b.label }}</span>
                    <span class="text-xs font-medium text-gray-600 dark:text-gray-300">{{ b.count }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="reviewing" class="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
              <svg class="w-8 h-8 animate-spin text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span class="text-sm">AI 正在审查分镜脚本，请稍候…</span>
            </div>
            <div v-else-if="reviewError" class="rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
              {{ reviewError }}
            </div>
            <template v-else-if="reviewResult">
              <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div class="flex items-end gap-3 mb-4">
                  <div class="text-4xl font-bold" :class="scoreColor(reviewResult.overall_score)">
                    {{ normalizeScore(reviewResult.overall_score).toFixed(1) }}
                  </div>
                  <div class="text-sm text-gray-500 pb-1">/ 10</div>
                  <div class="flex-1" />
                  <span v-if="reviewHistory[0]?.review && !reviewing" class="text-[10px] text-gray-400 dark:text-gray-500">上次审查结果</span>
                  <button class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" :disabled="reviewing" @click="startReview">重新审查</button>
                  <button
                    class="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors bg-violet-600 hover:bg-violet-700 text-white"
                    @click="openDiffModal"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    预览改动方案
                  </button>
                </div>
                <div v-if="applyResult" class="mt-2 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                  <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                  </svg>
                  已应用 {{ applyResult.count }} 处修改
                </div>
                <div class="grid grid-cols-2 gap-2 text-xs">
                  <div v-for="item in [
                    { label: '叙事连贯性', score: reviewResult.narrative_score },
                    { label: '视觉多样性', score: reviewResult.visual_score },
                    { label: '节奏控制',   score: reviewResult.pacing_score },
                    { label: '旁白质量',   score: reviewResult.narration_score },
                  ]" :key="item.label" class="flex items-center gap-2">
                    <span class="text-gray-500 w-16 shrink-0">{{ item.label }}</span>
                    <div class="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
                      <div class="h-full rounded-full transition-all"
                        :class="item.score >= 8 ? 'bg-green-500' : item.score >= 6 ? 'bg-yellow-500' : 'bg-red-500'"
                        :style="`width:${item.score * 10}%`" />
                    </div>
                    <span class="font-medium" :class="scoreColor(item.score)">{{ normalizeScore(item.score).toFixed(1) }}</span>
                  </div>
                </div>
                <div class="mt-2 text-xs text-gray-400 dark:text-gray-500 text-right">分数波动 ±1.5 属正常范围 · 每次审查独立采样</div>
              </div>
              <div class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{{ reviewResult.summary }}</div>
              <div v-if="reviewResult.strengths?.length">
                <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">亮点</h4>
                <ul class="space-y-1">
                  <li v-for="s in reviewResult.strengths" :key="s" class="flex items-start gap-2 text-sm text-green-700 dark:text-green-400">
                    <svg class="w-4 h-4 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                    </svg>
                    {{ s }}
                  </li>
                </ul>
              </div>
              <div v-if="reviewResult.weaknesses?.length">
                <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">主要问题</h4>
                <ul class="space-y-1">
                  <li v-for="w in reviewResult.weaknesses" :key="w" class="flex items-start gap-2 text-sm text-red-700 dark:text-red-400">
                    <svg class="w-4 h-4 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                    </svg>
                    {{ w }}
                  </li>
                </ul>
              </div>
              <div v-if="reviewResult.global_suggestions?.length">
                <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">整体改进建议</h4>
                <ol class="space-y-1.5">
                  <li v-for="(sg, i) in reviewResult.global_suggestions" :key="i" class="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <span class="shrink-0 w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 text-xs flex items-center justify-center font-medium">{{ i + 1 }}</span>
                    {{ sg }}
                  </li>
                </ol>
              </div>
              <div v-if="reviewResult.shot_feedback?.length">
                <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  逐镜反馈 <span class="normal-case font-normal text-gray-400">（共 {{ reviewResult.shot_feedback.length }} 条）</span>
                </h4>
                <div class="space-y-2">
                  <div
                    v-for="fb in reviewResult.shot_feedback"
                    :key="fb.shot_no"
                    class="rounded-lg border-l-4 p-3 text-sm"
                    :class="severityClass(fb.severity)"
                  >
                    <div class="font-medium text-gray-800 dark:text-gray-200 mb-1">镜 {{ fb.shot_no }}</div>
                    <ul class="mb-1.5 space-y-0.5">
                      <li v-for="issue in fb.issues" :key="issue" class="text-gray-600 dark:text-gray-400">· {{ issue }}</li>
                    </ul>
                    <div v-if="fb.suggestion" class="text-gray-500 dark:text-gray-500 text-xs italic">{{ fb.suggestion }}</div>
                    <div v-if="fb.suggested_narration" class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                      <div class="text-xs font-medium text-green-600 dark:text-green-400 mb-0.5">建议旁白改为</div>
                      <div class="text-xs text-gray-700 dark:text-gray-300 bg-green-50 dark:bg-green-900/20 rounded p-1.5">{{ fb.suggested_narration }}</div>
                    </div>
                    <div v-if="fb.suggested_description" class="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
                      <div class="text-xs font-medium text-green-600 dark:text-green-400 mb-0.5">建议画面描述改为</div>
                      <div class="text-xs text-gray-700 dark:text-gray-300 bg-green-50 dark:bg-green-900/20 rounded p-1.5 font-mono">{{ fb.suggested_description }}</div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Diff preview modal -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showDiffModal" class="fixed inset-0 z-[60] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="showDiffModal = false" />
        <div class="relative w-full max-w-2xl max-h-[80vh] bg-white dark:bg-gray-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
            <div class="flex items-center gap-2">
              <svg class="w-5 h-5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <h3 class="font-semibold text-gray-900 dark:text-gray-100">预览改动方案</h3>
              <span class="text-xs text-gray-500 dark:text-gray-400 ml-1">共 {{ diffItems.length }} 处建议，可应用 {{ diffItems.filter(d => d.has_narration_diff || d.has_description_diff).length }} 处</span>
            </div>
            <div class="flex items-center gap-3">
              <button
                v-if="diffItems.some(d => d.has_narration_diff || d.has_description_diff)"
                class="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline"
                @click="diffItems.filter(d => d.has_narration_diff || d.has_description_diff).forEach(d => d.selected = !diffItems.filter(x => x.has_narration_diff || x.has_description_diff).every(x => x.selected))"
              >
                {{ diffItems.filter(d => d.has_narration_diff || d.has_description_diff).every(d => d.selected) ? '全不选' : '全选' }}
              </button>
              <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" @click="showDiffModal = false">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <!-- Diff list -->
          <div class="flex-1 overflow-y-auto px-5 py-4 space-y-3">
            <div
              v-for="item in diffItems"
              :key="item.shot_no"
              class="rounded-xl border transition-colors"
              :class="(item.has_narration_diff || item.has_description_diff)
                ? (item.selected ? 'border-violet-300 dark:border-violet-700 bg-violet-50/50 dark:bg-violet-900/10' : 'border-gray-200 dark:border-gray-700')
                : 'border-amber-200 dark:border-amber-800/50 bg-amber-50/30 dark:bg-amber-900/10'"
            >
              <!-- 有文字改动：可勾选应用 -->
              <template v-if="item.has_narration_diff || item.has_description_diff">
                <label class="flex items-center gap-3 px-4 py-2.5 cursor-pointer">
                  <input type="checkbox" v-model="item.selected" class="w-4 h-4 accent-violet-600 shrink-0" />
                  <span class="font-medium text-sm text-gray-800 dark:text-gray-200">镜头 #{{ item.shot_no }}</span>
                  <span
                    class="ml-auto text-xs px-1.5 py-0.5 rounded-full font-medium"
                    :class="{
                      'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400': item.severity === 'error',
                      'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400': item.severity === 'warning',
                      'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400': item.severity === 'info',
                    }"
                  >{{ item.severity === 'error' ? '严重' : item.severity === 'warning' ? '警告' : '建议' }}</span>
                </label>
                <div class="px-4 pb-3 space-y-3 text-xs">
                  <div v-if="item.has_narration_diff" class="space-y-1">
                    <div class="font-medium text-gray-600 dark:text-gray-400">旁白修改</div>
                    <div class="grid grid-cols-2 gap-2">
                      <div class="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-2 text-gray-600 dark:text-gray-400 line-through opacity-70 leading-relaxed">{{ item.orig_narration || '（空）' }}</div>
                      <div class="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-2 text-gray-700 dark:text-gray-300 leading-relaxed">{{ item.suggested_narration }}</div>
                    </div>
                  </div>
                  <div v-if="item.has_description_diff" class="space-y-1">
                    <div class="font-medium text-gray-600 dark:text-gray-400">画面描述修改</div>
                    <div class="grid grid-cols-2 gap-2">
                      <div class="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-2 text-gray-600 dark:text-gray-400 line-through opacity-70 font-mono leading-relaxed">{{ item.orig_description || '（空）' }}</div>
                      <div class="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-2 text-gray-700 dark:text-gray-300 font-mono leading-relaxed">{{ item.suggested_description }}</div>
                    </div>
                  </div>
                  <div v-if="item.issues.length" class="text-gray-500 dark:text-gray-500 pt-1">
                    <span v-for="(issue, i) in item.issues" :key="i">{{ issue }}{{ i < item.issues.length - 1 ? ' · ' : '' }}</span>
                  </div>
                </div>
              </template>
              <!-- 只有结构性建议：只读展示，不可应用 -->
              <template v-else>
                <div class="flex items-center gap-3 px-4 py-2.5">
                  <svg class="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span class="font-medium text-sm text-gray-800 dark:text-gray-200">镜头 #{{ item.shot_no }}</span>
                  <span class="ml-auto text-xs text-amber-600 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">需手动调整</span>
                </div>
                <div class="px-4 pb-3 space-y-1.5 text-xs">
                  <div v-if="item.issues.length" class="text-gray-600 dark:text-gray-400">
                    <span v-for="(issue, i) in item.issues" :key="i">{{ issue }}{{ i < item.issues.length - 1 ? ' · ' : '' }}</span>
                  </div>
                  <div v-if="item.suggestion" class="text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2 leading-relaxed">{{ item.suggestion }}</div>
                </div>
              </template>
            </div>
          </div>
          <!-- Footer -->
          <div class="flex items-center justify-between px-5 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <span class="text-sm text-gray-500 dark:text-gray-400">
              将修改 {{ diffItems.filter(d => d.selected).length }} 处内容，直接写入脚本
            </span>
            <div class="flex items-center gap-2">
              <button class="btn-outline text-sm" @click="showDiffModal = false">取消</button>
              <button
                class="btn-primary text-sm bg-violet-600 hover:bg-violet-700 border-violet-600"
                :disabled="applyingDiffs || diffItems.filter(d => d.selected).length === 0"
                @click="handleApplyDiffs"
              >
                <svg v-if="applyingDiffs" class="w-4 h-4 mr-1.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {{ applyingDiffs ? '应用中…' : `确认应用选中 (${diffItems.filter(d => d.selected).length} 处)` }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.slide-right-enter-from .relative,
.slide-right-leave-to .relative {
  transform: translateX(100%);
}
.slide-right-enter-from,
.slide-right-leave-to {
  opacity: 0;
}
</style>
