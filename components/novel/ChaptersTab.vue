<script setup lang="ts">
import type { Chapter, OutlineReview } from '~/types'

const props = defineProps<{ novelId: number }>()

const router = useRouter()
const toast = useToast()
const novelStore = useNovelStore()
const chapterStore = useChapterStore()
const taskStore = useTaskStore()

const generatingOutline = ref(false)
const chapterPage = ref(1)
const CHAPTER_PAGE_SIZE = 20
const showDeleteChapterConfirm = ref(false)
const chapterToDelete = ref<Chapter | null>(null)
const publishingChapterId = ref<number | null>(null)

const { publishChapter, unpublishChapter, regenerateChapter, batchGenerateChapters, generateChapterOutline, insertChapterAfter, reorderChapters } = useChapterApi()

const { guardAiProvider } = useAiProviderGuard()

// ── 新建章节弹窗 ───────────────────────────────────────────────────────────────
const showCreateModal = ref(false)
const createDescription = ref('')
const createModalTextarea = ref<HTMLTextAreaElement | null>(null)

function openCreateModal() {
  createDescription.value = ''
  showCreateModal.value = true
  nextTick(() => createModalTextarea.value?.focus())
}

// ── 大纲审查 ──────────────────────────────────────────────────────────────────
const outlineReviewApi = useOutlineReviewApi()
const outlineReviews = ref<Record<number, OutlineReview>>({}) // keyed by chapter_id
const outlineReviewPanel = ref<{ open: boolean; review: OutlineReview | null; title: string }>({
  open: false,
  review: null,
  title: '',
})
const showBatchPanel = ref(false)
const batchPanelMounted = ref(false)
const reviewingChapterId = ref<number | null>(null)
const generatingChapterId = ref<number | null>(null)

// ── 批量生成章节正文 ────────────────────────────────────────────────────────────
const showBatchGenModal = ref(false)
const batchGenSkipExisting = ref(true)
const batchGenRunning = ref(false)
const batchGenProgress = ref(0)
const batchGenTitle = ref('')
const batchGenTotal = ref(0)

async function handleBatchGenerate() {
  if (!await guardAiProvider('LLM')) return
  showBatchGenModal.value = false
  batchGenRunning.value = true
  batchGenProgress.value = 0
  batchGenTitle.value = '正在准备...'
  try {
    const resp: any = await batchGenerateChapters(props.novelId, { skip_existing: batchGenSkipExisting.value })
    const taskId = resp?.task_id ?? resp?.data?.task_id
    batchGenTotal.value = resp?.total ?? resp?.data?.total ?? 0
    // Sync progress from task store into local progress bar
    const unwatch = watch(
      () => taskStore.tasks.find(t => t.task_id === taskId),
      (task) => {
        if (!task) return
        if (task.progress !== undefined) batchGenProgress.value = task.progress
        if (task.title) batchGenTitle.value = task.title
        if (['completed', 'failed', 'cancelled'].includes(task.status)) unwatch()
      },
    )
    taskStore.trackTask(taskId, async (task) => {
      batchGenRunning.value = false
      batchGenProgress.value = 0
      batchGenTitle.value = ''
      await chapterStore.fetchChapters(props.novelId)
      if (task.status === 'completed') {
        const generated = (task.data?.generated as number) ?? 0
        const failed = (task.data?.failed as number) ?? 0
        if (failed > 0) {
          toast.warning(`批量生成完成：成功 ${generated} 章，失败 ${failed} 章`)
        } else {
          toast.success(`批量生成完成，共生成 ${generated} 章`)
        }
      } else if (task.status === 'failed') {
        toast.error('批量生成失败：' + (task.error || '未知错误'))
      }
    })
  } catch (e: any) {
    toast.error('批量生成失败：' + (e.message || '未知错误'))
    batchGenRunning.value = false
    batchGenProgress.value = 0
    batchGenTitle.value = ''
  }
}

async function loadNovelReviews() {
  try {
    const reviews = await outlineReviewApi.listNovelReviews(props.novelId)
    if (Array.isArray(reviews)) {
      const map: Record<number, OutlineReview> = {}
      for (const r of reviews) map[r.chapter_id] = r
      outlineReviews.value = map
    }
  } catch { /* silent */ }
}

async function handleReviewChapter(chapter: Chapter, event: Event) {
  event.stopPropagation()
  if (!await guardAiProvider('LLM')) return
  reviewingChapterId.value = chapter.id
  try {
    const resp: any = await outlineReviewApi.reviewChapter(chapter.id)
    const taskId = resp?.task_id ?? resp?.data?.task_id
    toast.info('大纲审查中，请稍候...')
    taskStore.trackTask(taskId, async (task) => {
      reviewingChapterId.value = null
      if (task.status === 'completed') {
        const r: any = await outlineReviewApi.getChapterReview(chapter.id)
        if (r) outlineReviews.value[chapter.id] = r
        toast.success(`第${chapter.chapter_no}章审查完成`)
      } else if (task.status === 'failed') {
        toast.error('审查失败：' + (task.error || '未知错误'))
      }
    })
  } catch (e: any) {
    toast.error('审查失败：' + (e.message || '未知错误'))
    reviewingChapterId.value = null
  }
}

function handleBatchReview(event: Event) {
  event.stopPropagation()
  batchPanelMounted.value = true
  showBatchPanel.value = true
}

function openReviewPanel(chapter: Chapter, event: Event) {
  event.stopPropagation()
  const review = outlineReviews.value[chapter.id]
  if (review) {
    outlineReviewPanel.value = { open: true, review, title: `第${chapter.chapter_no}章 ${chapter.title}` }
  }
}

function reviewStatusBadge(chapterId: number) {
  const r = outlineReviews.value[chapterId]
  if (!r) return null
  return {
    passed: { label: '大纲通过', cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
    warning: { label: '需改进', cls: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400' },
    failed: { label: '问题较多', cls: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
    reviewing: { label: '审查中...', cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
  }[r.status] ?? null
}

// ── 生成 / 重新生成章节 ────────────────────────────────────────────────────────
async function handleGenerateOrRegenerate(chapter: Chapter, event: Event) {
  event.stopPropagation()
  if (!await guardAiProvider('LLM')) return
  if (generatingChapterId.value !== null) return
  generatingChapterId.value = chapter.id
  try {
    const resp: any = await regenerateChapter(chapter.id)
    const taskId = resp?.task_id ?? resp?.data?.task_id
    const verb = chapter.word_count > 0 ? '重新生成' : '生成'
    toast.info(`${verb}中，请稍候...`)
    taskStore.trackTask(taskId, async (task) => {
      generatingChapterId.value = null
      if (task.status === 'completed') {
        await chapterStore.fetchChapters(props.novelId)
        toast.success(`第${chapter.chapter_no}章${verb}完成`)
      } else if (task.status === 'failed') {
        toast.error('生成失败：' + (task.error || '未知错误'))
      }
    })
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || '未知错误'))
    generatingChapterId.value = null
  }
}


onMounted(() => {
  loadNovelReviews()
})

const chapters = computed(() => chapterStore.chapters)
const chapterTotalPages = computed(() => Math.max(1, Math.ceil(chapters.value.length / CHAPTER_PAGE_SIZE)))

const creatingChapter = ref(false)
const createStep = ref<'idle' | 'creating' | 'generating'>('idle')

// ── 拖拽排序 ────────────────────────────────────────────────────────────────────
const dragSrcIndex = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
const reordering = ref(false)

function onDragStart(idx: number, event: DragEvent) {
  dragSrcIndex.value = idx
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(idx))
  }
}

function onDragOver(idx: number, event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dragOverIndex.value = idx
}

function onDragLeave() {
  dragOverIndex.value = null
}

function onDragEnd() {
  dragSrcIndex.value = null
  dragOverIndex.value = null
}

async function onDrop(toIdx: number, event: DragEvent) {
  event.preventDefault()
  const fromIdx = dragSrcIndex.value
  dragSrcIndex.value = null
  dragOverIndex.value = null
  if (fromIdx === null || fromIdx === toIdx) return

  // Build the new order by moving the item
  const allChapters = [...chapters.value]
  const pageOffset = (chapterPage.value - 1) * CHAPTER_PAGE_SIZE
  const fromGlobal = pageOffset + fromIdx
  const toGlobal = pageOffset + toIdx

  const reordered = [...allChapters]
  const [moved] = reordered.splice(fromGlobal, 1)
  reordered.splice(toGlobal, 0, moved)

  // Optimistic update
  chapterStore.chapters = reordered

  reordering.value = true
  try {
    const orders = reordered.map((c, i) => ({ chapter_id: c.id, chapter_no: i + 1 }))
    await reorderChapters(props.novelId, orders)
    await chapterStore.fetchChapters(props.novelId)
  } catch (e: any) {
    toast.error('排序失败：' + (e.message || ''))
    await chapterStore.fetchChapters(props.novelId)
  } finally {
    reordering.value = false
  }
}

// ── 插入章节 ───────────────────────────────────────────────────────────────────
const showInsertModal = ref(false)
const insertAfterNo = ref(0)
const insertDescription = ref('')
const insertModalTextarea = ref<HTMLTextAreaElement | null>(null)
const insertingAfterNo = ref<number | null>(null)
const insertStep = ref<'idle' | 'creating' | 'generating'>('idle')

function openInsertModal(afterChapterNo: number, event: Event) {
  event.stopPropagation()
  insertAfterNo.value = afterChapterNo
  insertDescription.value = ''
  showInsertModal.value = true
  nextTick(() => insertModalTextarea.value?.focus())
}

async function handleInsertChapter() {
  if (!await guardAiProvider('LLM')) return
  if (insertingAfterNo.value !== null) return
  showInsertModal.value = false
  insertingAfterNo.value = insertAfterNo.value
  const desc = insertDescription.value.trim()
  try {
    insertStep.value = 'creating'
    const res: any = await insertChapterAfter(props.novelId, insertAfterNo.value)
    const chapter = res?.data ?? res

    insertStep.value = 'generating'
    await generateChapterOutline(props.novelId, chapter.chapter_no, desc || undefined)

    await chapterStore.fetchChapters(props.novelId)
    router.push(`/novel/${props.novelId}/chapter/${chapter.chapter_no}`)
  } catch (e: any) {
    toast.error('插入章节失败：' + (e.message || ''))
    await chapterStore.fetchChapters(props.novelId)
  } finally {
    insertingAfterNo.value = null
    insertStep.value = 'idle'
  }
}

async function handleCreateChapter() {
  if (!await guardAiProvider('LLM')) return
  if (creatingChapter.value) return
  showCreateModal.value = false
  creatingChapter.value = true
  const desc = createDescription.value.trim()
  try {
    const nextNo = chapters.value.length > 0
      ? Math.max(...chapters.value.map((c: any) => c.chapter_no)) + 1
      : 1

    createStep.value = 'creating'
    const chapter = await chapterStore.createChapter(props.novelId, nextNo)

    createStep.value = 'generating'
    await generateChapterOutline(props.novelId, chapter.chapter_no, desc || undefined)

    router.push(`/novel/${props.novelId}/chapter/${chapter.chapter_no}`)
  } catch (e: any) {
    toast.error('新建章节失败：' + (e.message || ''))
  } finally {
    creatingChapter.value = false
    createStep.value = 'idle'
  }
}
const pagedChapters = computed(() => {
  const start = (chapterPage.value - 1) * CHAPTER_PAGE_SIZE
  return chapters.value.slice(start, start + CHAPTER_PAGE_SIZE)
})

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    generating: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  }
  return colors[status] || 'bg-gray-100 text-gray-600'
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: '草稿',
    generating: '生成中',
    completed: '已完成',
  }
  return labels[status] || status
}

function goToChapter(chapter: Chapter) {
  router.push(`/novel/${props.novelId}/chapter/${chapter.chapter_no}`)
}

async function handleGenerateOutline() {
  if (!await guardAiProvider('LLM')) return
  if (!novelStore.currentNovel) return
  generatingOutline.value = true
  try {
    const chapterNum = chapters.value.length > 0 ? chapters.value.length : (novelStore.currentNovel?.target_chapters || 10)
    const taskId = await novelStore.generateOutline(props.novelId, chapterNum)
    if (!taskId) {
      toast.error('大纲生成失败：未获取到任务ID')
      generatingOutline.value = false
      return
    }
    toast.info('大纲生成任务已提交，正在处理...')
    taskStore.trackTask(taskId, async (task) => {
      generatingOutline.value = false
      if (task.status === 'completed') {
        await chapterStore.fetchChapters(props.novelId)
        toast.success('大纲生成完成')
      } else if (task.status === 'failed') {
        toast.error('大纲生成失败：' + (task.error || '未知错误'))
      }
    })
  } catch (e: any) {
    toast.error('大纲生成失败：' + (e.message || '未知错误'))
    generatingOutline.value = false
  }
}

async function handlePublishChapter(chapter: Chapter, event: Event) {
  event.stopPropagation()
  if (publishingChapterId.value !== null) return
  publishingChapterId.value = chapter.id
  try {
    if (chapter.is_published) {
      const res = await unpublishChapter(props.novelId, chapter.chapter_no)
      chapter.is_published = (res as any).data?.is_published ?? false
      toast.success(`第${chapter.chapter_no}章已取消发布`)
    } else {
      const res = await publishChapter(props.novelId, chapter.chapter_no)
      chapter.is_published = (res as any).data?.is_published ?? true
      toast.success(`第${chapter.chapter_no}章已发布到作品集`)
    }
  } catch (e: any) {
    toast.error('操作失败：' + (e.message || '未知错误'))
  } finally {
    publishingChapterId.value = null
  }
}

function requestDeleteChapter(chapter: Chapter, event: Event) {
  event.stopPropagation()
  chapterToDelete.value = chapter
  showDeleteChapterConfirm.value = true
}

async function confirmDeleteChapter() {
  if (!chapterToDelete.value) return
  try {
    await chapterStore.deleteChapter(props.novelId, chapterToDelete.value.chapter_no)
    toast.success('章节已删除')
    chapterToDelete.value = null
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || '未知错误'))
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">章节列表</h2>
        <div class="flex items-center gap-2">
          <button class="btn-secondary text-sm" :disabled="generatingOutline" @click="handleGenerateOutline">
            <svg v-if="generatingOutline" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            {{ generatingOutline ? 'AI 生成中...' : (chapters.length > 0 ? 'AI 更新大纲' : 'AI 生成大纲') }}
          </button>
          <button class="btn-secondary text-sm" @click="handleBatchReview">
            <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/>
            </svg>
            AI 审查
          </button>
        </div>
      </div>
    </div>

    <div v-if="chapterStore.loading && chapters.length === 0" class="space-y-3">
      <div v-for="i in 5" :key="i" class="card p-4">
        <div class="skeleton h-5 w-1/3 mb-2"></div>
        <div class="skeleton h-4 w-2/3"></div>
      </div>
    </div>

    <div v-else-if="chapters.length === 0" class="card p-8 text-center">
      <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
      <p class="text-gray-500 dark:text-gray-400">还没有章节，创建你的第一章</p>
    </div>

    <div v-else class="space-y-0">
      <template v-for="(chapter, idx) in pagedChapters" :key="chapter.id">
      <!-- 插入分隔线（章节之间，以及第一章前面） -->
      <div
        v-if="idx === 0"
        class="group/ins flex items-center gap-2 h-5 my-0.5"
      >
        <div class="flex-1 border-t border-dashed border-transparent group-hover/ins:border-gray-300 dark:group-hover/ins:border-gray-600 transition-colors"/>
        <button
          class="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 hover:text-indigo-600 dark:hover:text-indigo-400 opacity-0 group-hover/ins:opacity-100 transition-all flex items-center justify-center text-sm leading-none"
          :disabled="insertingAfterNo !== null"
          :title="`在第${chapter.chapter_no}章前插入`"
          @click.stop="openInsertModal(chapter.chapter_no - 1, $event)"
        >+</button>
        <div class="flex-1 border-t border-dashed border-transparent group-hover/ins:border-gray-300 dark:group-hover/ins:border-gray-600 transition-colors"/>
      </div>
      <div
        draggable="true"
        class="card p-4 hover:shadow-soft transition-all cursor-pointer group mt-1.5 mb-0 select-none"
        :class="{
          'opacity-40 scale-[0.98]': dragSrcIndex === idx,
          'ring-2 ring-indigo-400 ring-offset-1': dragOverIndex === idx && dragSrcIndex !== idx,
          'chapter-row-alt': idx % 2 === 1,
        }"
        @dragstart="onDragStart(idx, $event)"
        @dragover="onDragOver(idx, $event)"
        @dragleave="onDragLeave"
        @dragend="onDragEnd"
        @drop="onDrop(idx, $event)"
        @click="goToChapter(chapter)"
      >
        <div class="flex items-center justify-between">
          <!-- 拖拽把手 -->
          <svg class="w-4 h-4 text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 mr-2 cursor-grab active:cursor-grabbing" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 6a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 6a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 6a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm8-12a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 6a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 6a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"/>
          </svg>
          <div class="flex-1">
            <div class="flex items-center space-x-3">
              <span class="text-lg font-medium text-gray-900 dark:text-white">
                第{{ chapter.chapter_no }}章
              </span>
              <span class="text-gray-500 dark:text-gray-400">{{ chapter.title }}</span>
            </div>
            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-1">
              {{ chapter.outline || chapter.summary || '暂无摘要' }}
            </p>
          </div>
          <div class="flex items-center space-x-3">
            <span class="text-sm text-gray-500 dark:text-gray-400">
              {{ (chapter.word_count ?? 0).toLocaleString() }} 字
            </span>
            <!-- 内容状态 -->
            <span
              class="px-2 py-0.5 text-xs font-medium rounded"
              :class="getStatusColor(chapter.status)"
            >
              {{ getStatusLabel(chapter.status) }}
            </span>
            <!-- 连贯性问题警告 -->
            <span
              v-if="chapter.continuity_blocked"
              class="px-2 py-0.5 text-xs font-medium rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
              title="连贯性检查发现严重问题：角色状态、位置或世界观与前章存在冲突，建议进入章节详情页审查"
            >连贯性异常</span>
            <!-- 自动审查质量状态 -->
            <span
              v-if="chapter.quality_status === 'low'"
              class="px-2 py-0.5 text-xs font-medium rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              title="自动审查后质量偏低，建议手动深度审查"
            >质量偏低</span>
            <!-- 大纲审查状态 -->
            <button
              v-if="reviewStatusBadge(chapter.id)"
              class="text-xs px-2 py-0.5 rounded-full font-medium cursor-pointer"
              :class="reviewStatusBadge(chapter.id)!.cls"
              :title="`综合评分 ${Math.round(outlineReviews[chapter.id]?.overall_score ?? 0)}`"
              @click.stop="openReviewPanel(chapter, $event)"
            >
              {{ reviewStatusBadge(chapter.id)!.label }}
            </button>
            <!-- 广场发布状态（独立于内容状态） -->
            <span
              v-if="chapter.is_published"
              class="px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 flex items-center gap-1"
            >
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
              </svg>
              已发布
            </span>
            <!-- 发布/取消发布按钮（仅 completed 状态可用） -->
            <button
              v-if="chapter.status === 'completed'"
              class="p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              :class="chapter.is_published ? 'text-blue-400 hover:text-gray-400' : 'text-gray-300 hover:text-blue-500'"
              :disabled="publishingChapterId === chapter.id"
              :title="chapter.is_published ? '取消发布' : '发布到作品集'"
              @click="handlePublishChapter(chapter, $event)"
            >
              <svg v-if="publishingChapterId === chapter.id" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              <svg v-else-if="chapter.is_published" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
              </svg>
              <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
              </svg>
            </button>
            <!-- 删除章节按钮 -->
            <button
              class="p-1 opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400"
              title="删除章节"
              @click.stop="requestDeleteChapter(chapter, $event)"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
              </svg>
            </button>
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>
      <!-- 章节后的插入分隔线 -->
      <div class="group/ins flex items-center gap-2 h-5 my-0.5">
        <div class="flex-1 border-t border-dashed border-transparent group-hover/ins:border-gray-300 dark:group-hover/ins:border-gray-600 transition-colors"/>
        <button
          class="flex-shrink-0 w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 hover:text-indigo-600 dark:hover:text-indigo-400 opacity-0 group-hover/ins:opacity-100 transition-all flex items-center justify-center text-sm leading-none"
          :disabled="insertingAfterNo !== null"
          :title="`在第${chapter.chapter_no}章后插入`"
          @click.stop="openInsertModal(chapter.chapter_no, $event)"
        >
          <svg v-if="insertingAfterNo === chapter.chapter_no" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <span v-else>+</span>
        </button>
        <div class="flex-1 border-t border-dashed border-transparent group-hover/ins:border-gray-300 dark:group-hover/ins:border-gray-600 transition-colors"/>
      </div>
      </template>

      <!-- 分页控件 -->
      <div v-if="chapterTotalPages > 1" class="flex items-center justify-between pt-2">
        <span class="text-sm text-gray-500 dark:text-gray-400">
          第 {{ chapterPage }} / {{ chapterTotalPages }} 页，共 {{ chapters.length }} 章
        </span>
        <div class="flex items-center gap-1">
          <button
            class="px-2 py-1 rounded text-sm border border-gray-300 dark:border-gray-600 disabled:opacity-40"
            :disabled="chapterPage === 1"
            @click="chapterPage = 1"
          >«</button>
          <button
            class="px-2 py-1 rounded text-sm border border-gray-300 dark:border-gray-600 disabled:opacity-40"
            :disabled="chapterPage === 1"
            @click="chapterPage--"
          >‹</button>
          <template v-for="p in chapterTotalPages" :key="p">
            <button
              v-if="Math.abs(p - chapterPage) <= 2"
              class="px-2.5 py-1 rounded text-sm border"
              :class="p === chapterPage
                ? 'bg-primary-600 text-white border-primary-600'
                : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'"
              @click="chapterPage = p"
            >{{ p }}</button>
          </template>
          <button
            class="px-2 py-1 rounded text-sm border border-gray-300 dark:border-gray-600 disabled:opacity-40"
            :disabled="chapterPage === chapterTotalPages"
            @click="chapterPage++"
          >›</button>
          <button
            class="px-2 py-1 rounded text-sm border border-gray-300 dark:border-gray-600 disabled:opacity-40"
            :disabled="chapterPage === chapterTotalPages"
            @click="chapterPage = chapterTotalPages"
          >»</button>
        </div>
      </div>
    </div>

    <!-- Delete chapter confirm -->
    <ConfirmDialog
      v-model="showDeleteChapterConfirm"
      title="删除章节"
      :description="`确认删除第${chapterToDelete?.chapter_no}章「${chapterToDelete?.title || ''}」？此操作不可撤销。`"
      variant="danger"
      confirm-text="确认删除"
      @confirm="confirmDeleteChapter"
    />
  </div>

  <!-- 单章大纲审查详情面板 -->
  <Teleport to="body">
    <NovelOutlineReviewPanel
      v-if="outlineReviewPanel.open"
      :review="outlineReviewPanel.review"
      :chapter-title="outlineReviewPanel.title"
      @close="outlineReviewPanel.open = false"
    />
  </Teleport>

  <!-- 批量大纲审查面板（懒挂载，首次打开后保持 alive） -->
  <NovelBatchOutlineReviewPanel
    v-if="batchPanelMounted"
    :novel-id="novelId"
    :chapters="chapters"
    :visible="showBatchPanel"
    @close="showBatchPanel = false"
    @reviewed="loadNovelReviews"
  />

  <!-- 批量生成章节内容：配置弹窗 -->
  <Teleport to="body">
    <div
      v-if="showBatchGenModal"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      @click.self="showBatchGenModal = false"
    >
      <div class="bg-[#1a1f2e] border border-white/10 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6">
        <h3 class="text-lg font-semibold text-white mb-1">生成小说内容</h3>
        <p class="text-sm text-gray-400 mb-5">
          将严格参照章节大纲、角色、世界观及伏笔信息，顺序生成所有章节正文。每章完成后再开始下一章，保证叙事连贯性。
        </p>

        <div class="space-y-4">
          <label class="flex items-start gap-3 cursor-pointer group">
            <input
              v-model="batchGenSkipExisting"
              type="checkbox"
              class="mt-0.5 w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-500 focus:ring-blue-500 focus:ring-offset-gray-800"
            />
            <div>
              <span class="text-sm font-medium text-gray-200">跳过已有内容的章节</span>
              <p class="text-xs text-gray-500 mt-0.5">只生成空白章节；取消勾选将重新生成所有章节</p>
            </div>
          </label>

          <div class="bg-amber-900/20 border border-amber-700/30 rounded-lg px-4 py-3 text-xs text-amber-300 leading-relaxed">
            <strong>注意：</strong>批量生成为顺序执行，章节较多时耗时较长。生成过程中可关闭此对话框，任务将在后台继续运行，完成后页面自动刷新。
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-6">
          <button class="btn-ghost text-sm" @click="showBatchGenModal = false">取消</button>
          <button class="btn-primary text-sm" @click="handleBatchGenerate">
            <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            开始生成
          </button>
        </div>
      </div>
    </div>

    <!-- 批量生成进度悬浮条 -->
    <Transition name="slide-up">
      <div
        v-if="batchGenRunning"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#1a1f2e] border border-white/10 rounded-xl shadow-2xl px-5 py-4 flex items-center gap-4 min-w-[360px] max-w-lg"
      >
        <svg class="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        <div class="flex-1 min-w-0">
          <div class="flex justify-between items-center mb-1.5">
            <span class="text-sm text-gray-200 truncate">{{ batchGenTitle || '批量生成中...' }}</span>
            <span class="text-xs text-gray-400 ml-2 flex-shrink-0">{{ batchGenProgress }}%</span>
          </div>
          <div class="w-full bg-gray-700 rounded-full h-1.5">
            <div
              class="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
              :style="{ width: batchGenProgress + '%' }"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- 新建章节弹窗 -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showCreateModal" class="fixed inset-0 z-[300] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="showCreateModal = false" />
        <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5">
          <!-- 标题 -->
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center flex-shrink-0">
              <svg class="w-4 h-4 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <h3 class="text-base font-semibold text-gray-900 dark:text-white">新建章节</h3>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">AI 将根据你的描述和前续章节大纲自动生成本章大纲</p>
            </div>
          </div>

          <!-- 章节描述输入 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              章节描述
              <span class="text-gray-400 dark:text-gray-500 font-normal ml-1">（可选，留空由 AI 自主延续剧情）</span>
            </label>
            <textarea
              ref="createModalTextarea"
              v-model="createDescription"
              rows="5"
              class="w-full text-sm rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500"
              placeholder="例如：凌云在废墟中发现了师父留下的遗物，触发了沉睡已久的阵法，与潜伏在遗址中的魔修正面交锋……"
              @keydown.esc="showCreateModal = false"
            />
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">AI 会结合前 5 章大纲和你的描述生成本章情节规划</p>
          </div>

          <!-- 操作按钮 -->
          <div class="flex gap-3 pt-1">
            <button
              class="flex-1 btn-secondary text-sm"
              @click="showCreateModal = false"
            >取消</button>
            <button
              class="flex-1 btn-primary text-sm"
              @click="handleCreateChapter"
            >
              <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.316A4 4 0 0112 17.97a4 4 0 01-2.772-1.11l-.347-.315z" />
              </svg>
              AI 生成大纲
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- 插入章节弹窗 -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showInsertModal" class="fixed inset-0 z-[300] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="showInsertModal = false" />
        <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center flex-shrink-0">
              <svg class="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <div>
              <h3 class="text-base font-semibold text-gray-900 dark:text-white">插入章节</h3>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                将在第 {{ insertAfterNo }} 章后插入新章节，AI 自动生成大纲
              </p>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              章节描述
              <span class="text-gray-400 dark:text-gray-500 font-normal ml-1">（可选，留空由 AI 自主延续剧情）</span>
            </label>
            <textarea
              ref="insertModalTextarea"
              v-model="insertDescription"
              rows="5"
              class="w-full text-sm rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder-gray-400 dark:placeholder-gray-500"
              placeholder="例如：凌云在废墟中发现了师父留下的遗物，触发了沉睡已久的阵法，与潜伏在遗址中的魔修正面交锋……"
              @keydown.esc="showInsertModal = false"
            />
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">AI 会结合前后章节大纲和你的描述生成本章情节规划</p>
          </div>

          <div class="flex gap-3 pt-1">
            <button class="flex-1 btn-secondary text-sm" @click="showInsertModal = false">取消</button>
            <button class="flex-1 btn-primary text-sm" @click="handleInsertChapter">
              <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.316A4 4 0 0112 17.97a4 4 0 01-2.772-1.11l-.347-.315z" />
              </svg>
              AI 生成大纲
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>


<style scoped>
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.slide-up-enter-from,
.slide-up-leave-to {
  transform: translateX(-50%) translateY(20px);
  opacity: 0;
}
.chapter-row-alt {
  background-color: #e8edf5;
}
.dark .chapter-row-alt {
  background-color: #1a2640;
}
</style>
