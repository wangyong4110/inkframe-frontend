<script setup lang="ts">
import type { PlotPoint, ChapterVersion, CharacterLook, EpisodeSummary } from '~/types'
import { computeParaDiff, diffStats } from '~/composables/useTextDiff'
import { DiffView, DiffModeEnum } from '@git-diff-view/vue'
import { generateDiffFile } from '@git-diff-view/file'
import '@git-diff-view/vue/styles/diff-view.css'

definePageMeta({ key: (route) => route.path })

const route = useRoute()
const router = useRouter()
const novelId = parseInt(route.params.id as string)
const chapterNo = parseInt(route.params.chapterNo as string)
if (isNaN(novelId)) {
  router.replace('/novel')
}
if (isNaN(chapterNo)) {
  router.replace('/novel')
}

const chapterStore = useChapterStore()
const novelStore = useNovelStore()
const characterStore = useCharacterStore()
const videoStore = useVideoStore()
const sceneAnchorStore = useSceneAnchorStore()
const taskStore = useTaskStore()
const toast = useToast()
const { guardAiProvider } = useAiProviderGuard()
const { getLLMCapableProviders } = useModelApi()
const characterApi = useCharacterApi()
const itemApi = useItemApi()
const videoApi = useVideoApi()

// 内联模型选择
const llmProviders = ref<{ name: string; display_name: string }[]>([])
const chapterModelOverride = ref('')
const scriptProviderOverride = ref('')
async function loadLLMProviders() {
  try {
    const res = await getLLMCapableProviders()
    llmProviders.value = (res as any).data ?? []
  } catch { /* 静默失败，用户仍可生成 */ }
}

const saving = ref(false)
const isSaving = ref(false)
const generating = ref(false)

// ── 重新生成 ──────────────────────────────────────────────────────────────────
const showRegenModal = ref(false)
const regenPrompt = ref('')
const regenerating = ref(false)

// ── 页面模式 ──────────────────────────────────────────────────────────────────
type PageMode = 'outline' | 'write' | 'character' | 'items' | 'scenes' | 'episodes' | 'script'
const pageMode = ref<PageMode>('outline')

function pageModeClass(mode: PageMode) {
  return pageMode.value === mode
    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
}

const modeComplete = computed<Record<PageMode, boolean>>(() => ({
  outline:   !!(chapter.value?.outline || chapter.value?.summary),
  write:     !!(chapter.value?.content),
  character: characters.value.length > 0,
  scenes:    anchors.value.length > 0,
  episodes:  false,
  script:    chapterShots.value.length > 0 && chapterShots.value.every((s: any) => s.video_url),
}))

// ── 分镜弹窗 ──────────────────────────────────────────────────────────────────
const showStoryboardModal = ref(false)
const creatingStoryboard = ref(false)
const storyboardForm = ref({
  art_style: 'anime',
  aspect_ratio: '16:9',
  quality_tier: 'draft' as 'draft' | 'preview' | 'final',
  mode: 'slideshow' as 'slideshow' | 'video',
})

watch(() => novelStore.currentNovel?.image_style, (style) => {
  if (style) storyboardForm.value.art_style = style
}, { immediate: true })

const VIDEO_MODES = [
  { id: 'slideshow' as const, name: '图片解说', desc: '每镜一图+动效，低成本' },
  { id: 'video' as const, name: 'AI 视频', desc: '逐帧视频，需视频API' },
]

const QUALITY_TIERS = [
  { id: 'draft' as const, name: '草稿', desc: '快速预览，成本最低' },
  { id: 'preview' as const, name: '预览', desc: '720p 短片段' },
  { id: 'final' as const, name: '正式', desc: '1080p+ 高质量' },
]

const ART_STYLES = [
  { id: 'anime', name: '动漫' },
  { id: 'realistic', name: '写实' },
  { id: 'watercolor', name: '水彩' },
  { id: 'ink_painting', name: '水墨' },
]

async function handleCreateStoryboard() {
  if (!chapter.value) return
  creatingStoryboard.value = true
  try {
    const title = `${novel.value?.title || '小说'} 第${chapterNo}章`
    const video = await videoStore.createVideo({
      novelId,
      chapterId: chapter.value.id,
      title,
      artStyle: storyboardForm.value.art_style,
      aspectRatio: storyboardForm.value.aspect_ratio,
      frameRate: 24,
      qualityTier: storyboardForm.value.quality_tier,
      mode: storyboardForm.value.mode,
    })
    chapterVideos.value.unshift(video)
    showStoryboardModal.value = false
    pageMode.value = 'script'
    currentVideoId.value = video.id
    toast.success('视频项目已创建')
  } catch (e: any) {
    toast.error('创建失败：' + (e.message || '未知错误'))
  } finally {
    creatingStoryboard.value = false
  }
}

// ── 核心数据 ──────────────────────────────────────────────────────────────────
const chapter = computed(() => chapterStore.currentChapter)
const novel = computed(() => novelStore.currentNovel)
const characters = computed(() => characterStore.characters)

const autoReviewEnabled = computed(() => (novel.value?.auto_review_rounds ?? 0) > 0)
async function toggleAutoReview() {
  try {
    await novelStore.updateNovel(novelId, { auto_review_rounds: autoReviewEnabled.value ? 0 : 1 })
  } catch (e: any) {
    toast.error('保存失败：' + (e?.message || '请检查后端服务是否正常'))
  }
}
async function updateNovelField(data: Record<string, unknown>) {
  try {
    await novelStore.updateNovel(novelId, data as any)
  } catch (e: any) {
    toast.error('保存失败：' + (e?.message || ''))
  }
}
const qualityReport = computed(() => chapterStore.qualityReport)
const progress = computed(() => {
  const goal = chapterStore.wordCountGoal
  if (!goal) return 0
  return Math.min(100, (countWords(content.value) / goal) * 100)
})

const content = ref('')
const chapterTitle = ref('')
// Snapshot of the last successfully saved content/title, used to determine isDirty.
// Compared against content.value / chapterTitle.value rather than chapter.value?.content
// to avoid reactivity timing issues with the Pinia store.
const savedContent = ref('')
const savedTitle = ref('')
// Tracks the server-side updated_at timestamp for optimistic concurrency detection.
// TODO (backend): implement 409 conflict response when expected_updated_at mismatches.
const serverUpdatedAt = ref('')
const prompt = ref('')
const wordCountOverride = ref(0)

// 检测当前章是否为最终章（最大章节号 或 已达目标章节数）
const isLastChapter = computed(() => {
  const no = chapter.value?.chapter_no ?? 0
  if (!no) return false
  const target = novel.value?.target_chapters ?? 0
  if (target > 0 && no >= target) return true
  const maxNo = chapterStore.chapters.length > 0
    ? Math.max(...chapterStore.chapters.map(c => c.chapter_no))
    : 0
  return maxNo > 0 && no >= maxNo
})

// 根据小说设置推算单章字数目标（万字 → 字，除以章节数）
function computeDefaultWordCount(n: typeof novel.value): number {
  if (!n) return 0
  const totalWords = n.target_word_count ?? 0
  const chapters = n.target_chapters ?? 0
  if (totalWords > 0 && chapters > 0) return Math.round(totalWords / chapters)
  if (totalWords > 0) return Math.round(totalWords / 100) // 无章节数时按100章估算
  return 0
}

onMounted(async () => {
  try {
    await Promise.all([
      novelStore.fetchNovel(novelId),
      characterStore.fetchCharacters(novelId),
    ])
  } catch (e: any) {
    toast.error('数据加载失败：' + (e?.message || '请刷新重试'))
  }
  if (chapterNo && chapterNo > 0) {
    try {
      await chapterStore.fetchChapter(novelId, chapterNo)
    } catch {
      toast.error('章节加载失败，请刷新重试')
    }
    content.value = chapter.value?.content || ''
    chapterTitle.value = chapter.value?.title || ''
    savedContent.value = content.value
    savedTitle.value = chapterTitle.value
    // Record the server timestamp for optimistic concurrency detection on save.
    serverUpdatedAt.value = (chapter.value as any)?.updated_at || ''
    // 加载本章有效角色（不依赖文本字面量过滤）
    await fetchEffectiveCharacters()
  }
  // 仅在用户未手动设置时，用小说配置推算字数目标
  if (wordCountOverride.value === 0) {
    wordCountOverride.value = computeDefaultWordCount(novel.value)
  }
  // 从项目配置读取 AI 高级参数默认值（cookie 中已有值时跳过，保留用户手动设置）
  initAiParamsFromNovel(novel.value)
  loadLLMProviders()
  // Restore tab from URL query
  const tabParam = route.query.tab as string | undefined
  if (tabParam === 'items') {
    switchToItems()
  } else if (tabParam === 'script') {
    await switchToScript()
  } else if (tabParam === 'character') {
    switchToCharacter()
  } else if (tabParam === 'scenes') {
    await switchToScenes()
  } else if (tabParam === 'write' || tabParam === 'outline') {
    pageMode.value = tabParam as PageMode
  }
})

// ── 大纲编辑（需在保存块之前声明，供 isDirty / doSave 引用）─────────────────
const outlineEditMode = ref(false)
const outlineEditText = ref('')

// ── 保存 & 自动保存 ───────────────────────────────────────────────────────────
const isDirty = computed(() =>
  content.value !== savedContent.value ||
  chapterTitle.value !== savedTitle.value ||
  (outlineEditMode.value && outlineEditText.value !== (chapter.value?.outline || ''))
)

useUnsavedGuard(isDirty, '章节有未保存的修改，确认离开？')

const { lastSavedAt, autoSaving, saveFailed, flush: flushAutosave } = useAutosave(
  () => doSave(),
  [content, chapterTitle],
)

// 标题输入框失焦时立即落盘，不等 30 秒的自动保存防抖——
// 否则改完标题马上切走/离开页面会命中"未保存"确认框，看起来像没有自动保存。
function handleTitleBlur() {
  flushAutosave()
}

const autoSaveLabel = computed(() => {
  if (autoSaving.value) return '保存中...'
  if (saveFailed.value) return '保存失败'
  if (lastSavedAt.value) {
    const hh = String(lastSavedAt.value.getHours()).padStart(2, '0')
    const mm = String(lastSavedAt.value.getMinutes()).padStart(2, '0')
    return `已自动保存 ${hh}:${mm}`
  }
  return ''
})

useEventListener('keydown', (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    handleSave()
  }
  if (pageMode.value === 'write') {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault()
      openFind()
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
      e.preventDefault()
      showFindBar.value = true
      showReplaceBar.value = true
      nextTick(() => (document.getElementById('find-input') as HTMLInputElement | null)?.focus())
    }
    if (e.key === 'Escape' && showFindBar.value) {
      closeFind()
    }
  }
})

// ── 写作工具栏 ────────────────────────────────────────────────────────────────
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const editorFontSize = useCookie<number>('editor-font-size', { default: () => 16 })
const showFindBar = ref(false)
const showReplaceBar = ref(false)
const findText = ref('')
const replaceText = ref('')
const findMatchIdx = ref(-1)
const findMatches = ref<number[]>([])

function computeFindMatches() {
  if (!findText.value) {
    findMatches.value = []
    findMatchIdx.value = -1
    return
  }
  const text = content.value.toLowerCase()
  const q = findText.value.toLowerCase()
  const positions: number[] = []
  let i = 0
  while (i < text.length) {
    const idx = text.indexOf(q, i)
    if (idx === -1) break
    positions.push(idx)
    i = idx + 1
  }
  findMatches.value = positions
  findMatchIdx.value = positions.length > 0 ? 0 : -1
  if (positions.length > 0) jumpToMatch(0)
}

function jumpToMatch(idx: number) {
  if (!textareaRef.value || idx < 0 || idx >= findMatches.value.length) return
  const start = findMatches.value[idx]
  textareaRef.value.focus()
  textareaRef.value.setSelectionRange(start, start + findText.value.length)
}

function findNext() {
  if (!findMatches.value.length) return
  const next = (findMatchIdx.value + 1) % findMatches.value.length
  findMatchIdx.value = next
  jumpToMatch(next)
}

function findPrev() {
  if (!findMatches.value.length) return
  const prev = (findMatchIdx.value - 1 + findMatches.value.length) % findMatches.value.length
  findMatchIdx.value = prev
  jumpToMatch(prev)
}

function replaceCurrent() {
  if (findMatchIdx.value < 0 || !findMatches.value.length) return
  const start = findMatches.value[findMatchIdx.value]
  const end = start + findText.value.length
  content.value = content.value.slice(0, start) + replaceText.value + content.value.slice(end)
  nextTick(() => computeFindMatches())
}

function replaceAll() {
  if (!findText.value) return
  const escaped = findText.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  content.value = content.value.replace(new RegExp(escaped, 'gi'), replaceText.value)
  nextTick(() => { findMatches.value = []; findMatchIdx.value = -1 })
}

function insertSpecialChar(ch: string) {
  const ta = textareaRef.value
  if (!ta) { content.value += ch; return }
  const start = ta.selectionStart ?? content.value.length
  const end = ta.selectionEnd ?? start
  content.value = content.value.slice(0, start) + ch + content.value.slice(end)
  nextTick(() => { ta.focus(); ta.setSelectionRange(start + ch.length, start + ch.length) })
}

function openFind() {
  showFindBar.value = true
  nextTick(() => (document.getElementById('find-input') as HTMLInputElement | null)?.focus())
}

function closeFind() {
  showFindBar.value = false
  showReplaceBar.value = false
  findText.value = ''
  replaceText.value = ''
  findMatches.value = []
  findMatchIdx.value = -1
  textareaRef.value?.focus()
}

watch(findText, () => computeFindMatches())

async function doSave() {
  if (isSaving.value) return // prevent concurrent saves
  if (!chapter.value) throw new Error('章节未加载，请刷新后重试')
  isSaving.value = true
  try {
    // Snapshot values BEFORE the await so savedContent/savedTitle reflect what was
    // actually sent to the server, not what the user may have typed during the request.
    const snapshotContent = content.value
    const snapshotTitle = chapterTitle.value
    const updates: Record<string, any> = {
      title: snapshotTitle,
      content: snapshotContent,
      word_count: countWords(snapshotContent),
    }
    if (outlineEditMode.value) {
      updates.outline = outlineEditText.value
    }
    // Optimistic concurrency: include the last known server timestamp so the backend
    // can detect if another tab/session modified the chapter in the meantime.
    // TODO (backend): return HTTP 409 when expected_updated_at mismatches the DB value.
    if (serverUpdatedAt.value) {
      updates.expected_updated_at = serverUpdatedAt.value
    }
    let saved: any
    try {
      saved = await chapterStore.updateChapter(novelId, chapter.value.chapter_no, updates)
    } catch (e: any) {
      // Handle 409 conflict: another session modified this chapter.
      if (e?.message?.includes('409') || e?.status === 409) {
        const overwrite = window.confirm('该章节已被其他标签页修改，是否覆盖？（取消则丢弃当前修改）')
        if (!overwrite) return
        // Force save without the concurrency guard.
        const { expected_updated_at: _unused, ...forceUpdates } = updates
        saved = await chapterStore.updateChapter(novelId, chapter.value.chapter_no, forceUpdates)
      } else {
        throw e
      }
    }
    // Update saved baseline to what was actually persisted, not current (potentially
    // newer) content — this keeps isDirty accurate when user types during the request.
    savedContent.value = snapshotContent
    savedTitle.value = snapshotTitle
    // Keep the server timestamp in sync for the next save cycle.
    if (saved && (saved as any)?.updated_at) {
      serverUpdatedAt.value = (saved as any).updated_at
    }
  } finally {
    isSaving.value = false
  }
}

async function handleSave() {
  saving.value = true
  try {
    await doSave()
    toast.success('章节已保存')
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

// ── AI 生成 & 质量检查 ─────────────────────────────────────────────────────────
async function handleGenerate() {
  if (!await guardAiProvider('LLM')) return
  if (!chapter.value) return
  const currentChapterNo = chapter.value.chapter_no
  generating.value = true
  try {
    // max_tokens 仅作为 LLM 上下文限制；不再用于推算目标字数
    const maxTokens = advMaxTokens.value > 0 ? advMaxTokens.value : undefined
    const wordCount = wordCountOverride.value > 0 ? wordCountOverride.value : undefined
    const temperature = advTemperature.value > 0 ? advTemperature.value : undefined
    const timeoutSeconds = advTimeoutSeconds.value > 0 ? advTimeoutSeconds.value : undefined
    const chapterModel = chapterModelOverride.value || novel.value?.ai_model || undefined
    const { task_id } = await chapterStore.generateChapter(novelId, currentChapterNo, prompt.value, maxTokens, chapterModel, temperature, timeoutSeconds, wordCount, webSearchEnabled.value || undefined, wikiSearchEnabled.value || undefined, storyPatternEnabled.value || undefined, isLastChapter.value || undefined)
    currentTaskId.value = task_id
    toast.info('AI 正在生成，请稍候...')
    const result = await chapterStore.pollChapterGenTask(novelId, task_id)
    currentTaskId.value = null
    // Sync metadata returned from the generation task into the local chapter ref
    // and the chapter list so the sidebar word count / status reflects reality.
    const generatedWordCount = result.word_count ?? countWords(result.content || '')
    if (chapterStore.currentChapter) {
      chapterStore.currentChapter.word_count = generatedWordCount
      if (result.status) chapterStore.currentChapter.status = result.status
    }
    if (result.id) {
      chapterStore.updateChapterInList({
        id: result.id,
        word_count: generatedWordCount,
        ...(result.status ? { status: result.status } : {}),
      })
    }
    // Update server timestamp so the next save uses the correct concurrency guard.
    serverUpdatedAt.value = (result as any)?.updated_at || serverUpdatedAt.value
    if (wordCountOverride.value > 0) chapterStore.wordCountGoal = wordCountOverride.value
    // Show preview modal instead of directly applying
    previewModal.content = result.content || ''
    previewModal.originalContent = content.value
    previewModal.open = true
    toast.success('内容生成完成，请预览后选择是否应用')
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || '未知错误'))
  } finally {
    generating.value = false
  }
}

async function handleRegenerate() {
  if (!chapter.value) return
  showRegenModal.value = false
  regenerating.value = true
  try {
    const opts: Record<string, any> = {}
    if (regenPrompt.value.trim()) opts.prompt = regenPrompt.value.trim()
    if (wordCountOverride.value > 0) opts.word_count = wordCountOverride.value
    if (advMaxTokens.value > 0) opts.max_tokens = advMaxTokens.value
    const regenModel = chapterModelOverride.value || novel.value?.ai_model
    if (regenModel) opts.model = regenModel
    if (advTemperature.value > 0) opts.temperature = advTemperature.value
    if (webSearchEnabled.value) opts.web_search = true
    if (wikiSearchEnabled.value) opts.wiki_search = true
    if (storyPatternEnabled.value) opts.use_story_pattern = true

    const resp = await chapterApiForVersions.regenerateChapter(chapter.value.id, opts)
    const taskId = (resp as any)?.data?.task_id ?? (resp as any)?.task_id
    if (!taskId) {
      toast.error('重新生成失败：未获取到任务ID')
      regenerating.value = false
      return
    }
    currentTaskId.value = taskId
    toast.info('重新生成任务已提交，正在处理...')
    taskStore.trackTask(taskId, (task) => {
      currentTaskId.value = null
      if (task.status === 'completed') {
        const result = (task.data as any)?.chapter as Chapter | undefined
        previewModal.content = result?.content || ''
        previewModal.originalContent = content.value
        previewModal.open = true
        toast.success('重新生成完成，请预览后选择是否应用')
        regenPrompt.value = ''
      } else if (task.status === 'failed') {
        toast.error('重新生成失败：' + (task.error || '未知错误'))
      }
      regenerating.value = false
    })
  } catch (e: any) {
    toast.error('重新生成失败：' + (e.message || '未知错误'))
    regenerating.value = false
  }
}

async function handleCheckQuality() {
  if (!chapter.value) return
  checking.value = true
  try {
    await chapterStore.checkQuality(chapter.value.id)
    refinedContent.value = ''
    showRefinedPreview.value = false
  } finally {
    checking.value = false
  }
}

// ── 质量改进 ──────────────────────────────────────────────────────────────────
const checking = ref(false)
const refining = ref(false)
const refinedContent = ref('')
const showRefinedPreview = ref(false)
const showRightPanel = ref(true)

// ── 精修章节 ──────────────────────────────────────────────────────────────────
const writePanelTab = ref<'generate' | 'rewrite'>('generate')
const rewriteInstruction = ref('')
const rewriting = ref(false)
const rewriteError = ref('')
const { rewriteChapterByInstruction, refineSelection } = useChapterApi()

const REWRITE_HINTS = [
  '改写最后一段，增加悬念感',
  '这段对话太平淡，改得更有张力',
  '场景描写太少，加一些感官细节',
  '结尾太平，加一个反转或威胁',
  '主角内心独白太多，改为外化行为',
]

// ── 选段精修 ──────────────────────────────────────────────────────────────────
const viewContentRef = ref<HTMLElement | null>(null)
// mode: 'input' → 输入指令；'preview' → 展示改写前后对比
const selectionPopup = reactive({
  visible: false,
  mode: 'input' as 'input' | 'preview',
  selectedText: '',
  selectionStart: 0,
  selectionEnd: 0,
  top: 0,
  left: 0,
  refinedText: '',
})
const selectionInstruction = ref('')
const selectionRefining = ref(false)
const selectionError = ref('')
const selectionHints = [
  '增加画面感，补充动作细节',
  '对话太平，改得更有张力',
  '节奏太快，舒展一下',
  '加一个细节暗示角色情绪',
]

function getSelectionOffsets(containerEl: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null
  const range = sel.getRangeAt(0)
  if (!containerEl.contains(range.commonAncestorContainer)) return null
  const pre = range.cloneRange()
  pre.selectNodeContents(containerEl)
  pre.setEnd(range.startContainer, range.startOffset)
  const start = pre.toString().length
  return { start, end: start + range.toString().length }
}

// 弹窗 DOM ref，用于点击外部关闭检测
const selectionPopupRef = ref<HTMLElement | null>(null)

function openSelectionPopup(
  selectedText: string,
  start: number,
  end: number,
  anchorRect: { top: number; bottom: number; left: number; right: number },
) {
  const popupW = 300
  const popupH = 380
  const gap = 10

  // 水平：优先出现在选区右侧，空间不足时出现在左侧
  let left = anchorRect.right + gap
  if (left + popupW > window.innerWidth - 8) left = anchorRect.left - popupW - gap
  if (left < 8) left = 8

  // 垂直：顶部对齐选区顶端，超出视口底部时向上推
  let top = anchorRect.top
  if (top + popupH > window.innerHeight - 8) top = window.innerHeight - popupH - 8
  if (top < 8) top = 8

  selectionPopup.selectedText = selectedText
  selectionPopup.selectionStart = start
  selectionPopup.selectionEnd = end
  selectionPopup.mode = 'input'
  selectionPopup.refinedText = ''
  selectionError.value = ''
  selectionInstruction.value = ''
  nextTick(() => {
    selectionPopup.top = top
    selectionPopup.left = left
    selectionPopup.visible = true
  })
}

function onViewMouseUp(e: MouseEvent) {
  if (selectionPopup.visible && selectionPopup.mode === 'preview') return

  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return

  const selectedText = sel.toString().trim()
  if (!selectedText || selectedText.length < 5) return

  const containerEl = viewContentRef.value
  if (!containerEl) return
  const offsets = getSelectionOffsets(containerEl)
  if (!offsets) return

  // 用选区真实 bounding rect，确保弹窗不压住任何选中文字
  const rect = sel.getRangeAt(0).getBoundingClientRect()
  openSelectionPopup(selectedText, offsets.start, offsets.end, rect)
}

function onEditMouseUp(e: MouseEvent) {
  if (selectionPopup.visible && selectionPopup.mode === 'preview') return
  const ta = textareaRef.value
  if (!ta) return
  const start = ta.selectionStart
  const end = ta.selectionEnd
  if (start === end) return
  const selectedText = ta.value.substring(start, end).trim()
  if (!selectedText || selectedText.length < 5) return
  const rawSelected = ta.value.substring(start, end)
  const trimStart = rawSelected.indexOf(selectedText.charAt(0))
  const actualStart = start + trimStart
  const actualEnd = actualStart + selectedText.length
  // textarea 无 DOM Range，用鼠标释放位置构造锚点矩形
  openSelectionPopup(selectedText, actualStart, actualEnd, {
    top: e.clientY,
    bottom: e.clientY,
    left: e.clientX,
    right: e.clientX,
  })
}

function closeSelectionPopup() {
  selectionPopup.visible = false
  selectionPopup.mode = 'input'
  selectionPopup.refinedText = ''
  selectionInstruction.value = ''
  selectionError.value = ''
}

// document-level pointerdown：点到弹窗之外时关闭（不使用 inset-0 遮罩，避免阻挡内容区交互）
function onDocPointerDown(e: PointerEvent) {
  if (!selectionPopup.visible) return
  if (selectionRefining.value) return
  const popupEl = selectionPopupRef.value
  if (popupEl && popupEl.contains(e.target as Node)) return
  closeSelectionPopup()
}

onMounted(() => document.addEventListener('pointerdown', onDocPointerDown, true))
onUnmounted(() => document.removeEventListener('pointerdown', onDocPointerDown, true))

async function handleRefineSelection() {
  if (!chapter.value || !selectionInstruction.value.trim() || selectionRefining.value) return
  selectionRefining.value = true
  selectionError.value = ''
  try {
    const resp = await refineSelection(chapter.value.id, selectionPopup.selectedText, selectionInstruction.value.trim())
    const refined = (resp as any)?.data?.refined_text ?? (resp as any)?.refined_text ?? ''
    if (!refined) {
      selectionError.value = '未获取到改写结果'
      return
    }
    // 切换到预览模式，让用户对比后决定是否应用
    selectionPopup.refinedText = refined
    selectionPopup.mode = 'preview'
  } catch (e: any) {
    selectionError.value = e?.message ?? '改写失败'
  } finally {
    selectionRefining.value = false
  }
}

async function applySelectionRefine() {
  content.value = content.value.slice(0, selectionPopup.selectionStart) + selectionPopup.refinedText + content.value.slice(selectionPopup.selectionEnd)
  closeSelectionPopup()
  await doSave()
  toast.success('片段已应用')
}

function rejectSelectionRefine() {
  // 回到输入模式，保留指令让用户继续调整
  selectionPopup.mode = 'input'
  selectionPopup.refinedText = ''
}

const REWRITE_HISTORY_KEY = `rewrite-history-novel-${novelId}-chapter-${chapterNo}`
const MAX_HISTORY = 20

const rewriteHistory = ref<string[]>([])

function loadRewriteHistory() {
  try {
    const raw = localStorage.getItem(REWRITE_HISTORY_KEY)
    rewriteHistory.value = raw ? JSON.parse(raw) : []
  } catch {
    rewriteHistory.value = []
  }
}

function saveToRewriteHistory(instruction: string) {
  const trimmed = instruction.trim()
  if (!trimmed) return
  const list = rewriteHistory.value.filter(h => h !== trimmed)
  list.unshift(trimmed)
  rewriteHistory.value = list.slice(0, MAX_HISTORY)
  try {
    localStorage.setItem(REWRITE_HISTORY_KEY, JSON.stringify(rewriteHistory.value))
  } catch { /* ignore */ }
}

function deleteRewriteHistory(idx: number) {
  rewriteHistory.value.splice(idx, 1)
  try {
    localStorage.setItem(REWRITE_HISTORY_KEY, JSON.stringify(rewriteHistory.value))
  } catch { /* ignore */ }
}

onMounted(loadRewriteHistory)

async function handleRewriteByInstruction() {
  const text = rewriteInstruction.value.trim()
  if (!text || rewriting.value || !chapter.value) return
  rewriteError.value = ''
  rewriting.value = true
  saveToRewriteHistory(text)

  try {
    const resp = await rewriteChapterByInstruction(chapter.value.id, text)
    const taskId = (resp as any)?.data?.task_id ?? (resp as any)?.task_id
    if (!taskId) {
      rewriteError.value = '提交失败：未获取到任务ID'
      rewriting.value = false
      return
    }
    currentTaskId.value = taskId
    toast.info('精修任务已提交，AI 正在处理...')
    taskStore.trackTask(taskId, (task) => {
      currentTaskId.value = null
      if (task.status === 'completed') {
        const result = (task.data as any)?.chapter as any
        previewModal.content = result?.content || ''
        previewModal.originalContent = content.value
        previewModal.open = true
        toast.success('精修完成，请预览后决定是否应用')
        rewriteInstruction.value = ''
      } else if (task.status === 'failed') {
        rewriteError.value = task.error || '修改失败'
        toast.error('修改失败：' + (task.error || '未知错误'))
      }
      rewriting.value = false
    })
  } catch (e: any) {
    rewriteError.value = e.message || '提交失败'
    rewriting.value = false
  }
}

// ── AI 深度审查面板 ───────────────────────────────────────────────────────────
const showReviewPanel = ref(false)
const reviewPanelMounted = ref(false) // 懒挂载：首次打开后保持 alive，避免重复触发 AI 审查

function openReviewPanel() {
  reviewPanelMounted.value = true
  showReviewPanel.value = true
}

async function handleReviewContentUpdated() {
  await chapterStore.fetchChapter(novelId, chapterNo)
  // Sync local refs with the server-updated content (e.g., after applying review diffs).
  // Without this, the textarea would show stale pre-diff content and autosave would
  // overwrite the applied changes.
  content.value = chapter.value?.content || ''
  chapterTitle.value = chapter.value?.title || ''
  savedContent.value = content.value
  savedTitle.value = chapterTitle.value
}

function qualityTier(score: number): { label: string; color: string } {
  if (score >= 0.85) return { label: '优秀', color: 'text-green-600' }
  if (score >= 0.70) return { label: '良好', color: 'text-blue-600' }
  if (score >= 0.55) return { label: '中等', color: 'text-amber-500' }
  return { label: '较差', color: 'text-red-500' }
}

async function handleApplyImprovements() {
  if (!chapter.value) return
  const all = qualityReport.value?.suggestions ?? []
  if (all.length === 0) return
  refining.value = true
  refinedContent.value = ''
  showRefinedPreview.value = false
  try {
    const api = useQualityApi()
    const resp = await api.refineChapter(chapter.value.id, all)
    refinedContent.value = resp.data?.content ?? ''
    if (refinedContent.value) showRefinedPreview.value = true
  } catch (e: any) {
    toast.error('AI精修失败：' + (e.message ?? '未知错误'))
  } finally {
    refining.value = false
  }
}

async function acceptRefinement() {
  if (!chapter.value || !refinedContent.value) return
  content.value = refinedContent.value
  await chapterStore.updateChapter(novelId, chapter.value.chapter_no, { content: refinedContent.value })
  savedContent.value = content.value
  refinedContent.value = ''
  showRefinedPreview.value = false
  toast.success('已采纳精修内容')
  // Re-run quality check to reflect updated score
  await handleCheckQuality()
}

function discardRefinement() {
  refinedContent.value = ''
  showRefinedPreview.value = false
}

function countWords(text: string): number {
  return text.length
}

// Filter helpers: when chapter content exists, only show items whose name appears in the text.
// 章节有效角色：由后端 ListEffectiveCharacters 返回，包含所有小说角色及本章覆盖信息，
// 不依赖字面量文本搜索（避免代词/简称导致角色遗漏）。
const effectiveCharacters = ref<any[]>([])

async function fetchEffectiveCharacters() {
  if (!chapterNo || chapterNo <= 0) return
  try {
    const res = await characterApi.getEffectiveCharacters(novelId, chapterNo)
    effectiveCharacters.value = res.data ?? []
  } catch {
    // 降级：使用本地全量角色列表
    effectiveCharacters.value = characters.value
  }
}

const mainCharacters = computed(() =>
  effectiveCharacters.value.filter((c: any) => c.role !== 'minor'),
)
const minorCharacters = computed(() =>
  effectiveCharacters.value.filter((c: any) => c.role === 'minor'),
)

function getActiveCharacters(): any[] {
  return mainCharacters.value
}

// 手动绑定角色
const showBindCharModal = ref(false)
const bindingCharId = ref<number | null>(null)
const unbindingCharId = ref<number | null>(null)
const threeViewModal = ref<{ show: boolean; url: string; charName: string }>({ show: false, url: '', charName: '' })

const unboundCharacters = computed(() => {
  const boundIds = new Set(effectiveCharacters.value.map((c: any) => c.id))
  return characters.value.filter((c: any) => !boundIds.has(c.id))
})

async function handleBindCharacter(charId: number) {
  bindingCharId.value = charId
  try {
    await characterApi.bindChapterCharacter(novelId, chapterNo, charId)
    await fetchEffectiveCharacters()
    showBindCharModal.value = false
  } catch (e: any) {
    toast.error('绑定失败：' + (e.message || ''))
  } finally {
    bindingCharId.value = null
  }
}

async function handleUnbindCharacter(charId: number) {
  unbindingCharId.value = charId
  try {
    await characterApi.unbindChapterCharacter(novelId, chapterNo, charId)
    await fetchEffectiveCharacters()
  } catch (e: any) {
    toast.error('解绑失败：' + (e.message || ''))
  } finally {
    unbindingCharId.value = null
  }
}

// ── 角色形象切换 ──────────────────────────────────────────────────────────────
const charLooksMap = ref<Record<number, CharacterLook[]>>({})
const charLookIdxMap = ref<Record<number, number>>({})

async function fetchCharLooks(charId: number) {
  try {
    const res = await characterApi.listLooks(charId)
    charLooksMap.value[charId] = res.data?.looks ?? []
    // initialize index to the look active for this chapter
    const active = await characterApi.getActiveLook(charId, chapterNo)
    const activeLook = active.data?.look
    if (activeLook) {
      const idx = charLooksMap.value[charId].findIndex((l) => l.id === activeLook.id)
      charLookIdxMap.value[charId] = idx >= 0 ? idx : 0
    } else {
      charLookIdxMap.value[charId] = 0
    }
  } catch {
    charLooksMap.value[charId] = []
    charLookIdxMap.value[charId] = 0
  }
}

function getCharDisplayLook(charId: number): CharacterLook | null {
  const looks = charLooksMap.value[charId]
  if (!looks || looks.length === 0) return null
  return looks[charLookIdxMap.value[charId] ?? 0] ?? null
}

function cycleCharLook(charId: number, dir: 1 | -1, event: Event) {
  event.stopPropagation()
  const looks = charLooksMap.value[charId]
  if (!looks || looks.length <= 1) return
  const cur = charLookIdxMap.value[charId] ?? 0
  charLookIdxMap.value[charId] = (cur + dir + looks.length) % looks.length
}

watch(effectiveCharacters, async (chars) => {
  for (const char of chars) {
    if (!(char.id in charLooksMap.value)) {
      await fetchCharLooks(char.id)
    }
  }
}, { immediate: false })

// ── 大纲编辑 ──────────────────────────────────────────────────────────────────
const generatingOutline = ref(false)
const savingOutline = ref(false)

function startEditOutline() {
  outlineEditText.value = chapter.value?.outline || chapter.value?.summary || ''
  outlineEditMode.value = true
}

function cancelEditOutline() {
  outlineEditMode.value = false
  outlineEditText.value = ''
}

async function handleSaveOutline() {
  if (!chapter.value) return
  savingOutline.value = true
  try {
    await doSave()
    outlineEditMode.value = false
    toast.success('大纲已保存')
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || ''))
  } finally {
    savingOutline.value = false
  }
}

// ── 写作编辑模式 ──────────────────────────────────────────────────────────────
const writeEditMode = ref(false)
const savingWrite = ref(false)

function startEditWrite() {
  writeEditMode.value = true
  nextTick(() => textareaRef.value?.focus())
}

function cancelEditWrite() {
  writeEditMode.value = false
  content.value = savedContent.value
}

async function handleSaveWrite() {
  savingWrite.value = true
  try {
    await doSave()
    writeEditMode.value = false
    toast.success('章节已保存')
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || ''))
  } finally {
    savingWrite.value = false
  }
}

async function handleGenerateOutline() {
  if (!await guardAiProvider('LLM')) return
  if (!chapter.value) return
  generatingOutline.value = true
  try {
    const { request } = useApi()
    const res: any = await request(`/novels/${novelId}/chapters/${chapterNo}/outline`, {
      method: 'POST',
      body: JSON.stringify({}),
    })
    if (res?.data) {
      chapterStore.$patch({ currentChapter: res.data })
    }
    if (outlineEditMode.value) {
      outlineEditText.value = chapter.value?.outline || chapter.value?.summary || ''
    }
    toast.success('大纲生成完成')
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || ''))
  } finally {
    generatingOutline.value = false
  }
}

// ── 脚本 ──────────────────────────────────────────────────────────────────────
interface SceneOutlineItem {
  scene_no: number
  pov?: string
  goals?: string
  beats?: string[]
  tension?: string
  location?: string
}

const parsedSceneOutline = computed<SceneOutlineItem[]>(() => {
  if (!chapter.value?.scene_outline) return []
  try {
    const parsed = JSON.parse(chapter.value.scene_outline)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
})

interface ChapterEndStateChar { name: string; location: string; state: string; last_action: string }
interface ChapterEndState { characters: ChapterEndStateChar[]; scene_end: string; pending_action: string; opening_hint: string }

const parsedEndState = computed<ChapterEndState | null>(() => {
  if (!chapter.value?.chapter_end_state) return null
  try { return JSON.parse(chapter.value.chapter_end_state) } catch { return null }
})

const parsedReaderExpectations = computed<string[]>(() => {
  if (!chapter.value?.reader_expectations) return []
  try {
    const parsed = JSON.parse(chapter.value.reader_expectations)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
})

function switchToCharacter() {
  pageMode.value = 'character'
}

function switchToItems() {
  pageMode.value = 'items'
  if (chapterItems.value.length === 0) fetchChapterItems()
}

const chapterAnchors = ref<any[]>([])
const showBindAnchorModal = ref(false)
const bindingAnchorId = ref<number | null>(null)
const unbindingAnchorId = ref<number | null>(null)
const sceneAnchorApi = useSceneAnchorApi()

const unboundAnchors = computed(() => {
  const boundIds = new Set(chapterAnchors.value.map((a: any) => a.id))
  return sceneAnchorStore.anchors.filter((a: any) => !boundIds.has(a.id))
})

async function fetchChapterAnchors() {
  try {
    const res = await sceneAnchorApi.listChapterAnchors(novelId, chapterNo)
    chapterAnchors.value = res.data ?? []
  } catch {
    chapterAnchors.value = []
  }
}

async function handleBindAnchor(anchorId: number) {
  bindingAnchorId.value = anchorId
  try {
    await sceneAnchorApi.bindChapterAnchor(novelId, chapterNo, anchorId)
    await fetchChapterAnchors()
    showBindAnchorModal.value = false
  } catch (e: any) {
    toast.error('绑定失败：' + (e.message || ''))
  } finally {
    bindingAnchorId.value = null
  }
}

async function handleUnbindAnchor(anchorId: number) {
  unbindingAnchorId.value = anchorId
  try {
    await sceneAnchorApi.unbindChapterAnchor(novelId, chapterNo, anchorId)
    await fetchChapterAnchors()
  } catch (e: any) {
    toast.error('解绑失败：' + (e.message || ''))
  } finally {
    unbindingAnchorId.value = null
  }
}

async function switchToScenes() {
  pageMode.value = 'scenes'
  sceneAnchorStore.fetchAnchors(novelId)
  fetchChapterAnchors()
  fetchShotsForChapter()
}

// ── 剧集列表（剧本 Tab）──────────────────────────────────────────────────────
const episodeSummaries = ref<EpisodeSummary[]>([])
const loadingEpisodes = ref(false)

async function switchToEpisodes() {
  pageMode.value = 'episodes'
  loadingEpisodes.value = true
  try {
    const res = await videoApi.getEpisodeSummaries(novelId)
    episodeSummaries.value = res.data ?? []
  } catch (e: any) {
    toast.error('加载剧集列表失败：' + (e.message || '未知错误'))
  } finally {
    loadingEpisodes.value = false
  }
}

function episodeTargetUrl(ep: EpisodeSummary, sceneNo?: number) {
  // "进入视频生成环节"跳到独立的视频制作工作台（有视频项目时）；
  // 还没有视频项目时，退回章节页内的分镜脚本 tab（vtab=script）作为兜底。
  const sceneQuery = sceneNo ? `?scene=${sceneNo}` : ''
  if (ep.video_id) {
    return `/video/${ep.video_id}/produce-v2${sceneQuery}`
  }
  const legacySceneQuery = sceneNo ? `&scene=${sceneNo}` : ''
  return `/novel/${novelId}/chapter/${ep.chapter_no}?tab=script&vtab=script${legacySceneQuery}`
}

async function openEpisode(ep: EpisodeSummary, sceneNo?: number) {
  const url = episodeTargetUrl(ep, sceneNo)
  if (ep.chapter_no === chapterNo && !url.startsWith('/video/')) {
    // 目标就是当前已加载的章节页，只是切换 tab/scene 查询参数：路由不会重新挂载组件
    // （definePageMeta key 只跟路径走），onMounted 里"从 URL 恢复 tab"的逻辑不会重新执行，
    // 需要在这里手动切到目标 tab，否则点击会看起来毫无反应。
    await router.replace(url)
    await switchToScript()
  } else {
    router.push(url)
  }
}

// ── 场次剧本预览弹窗（"剧本"列表卡片里"查看完整剧本"按钮）────────────────────
const showScenePreview = ref(false)
const previewChapterId = ref<number | null>(null)
const previewSceneNo = ref<number | null>(null)
function openScenePreview(chapterId: number, sceneNo: number) {
  previewChapterId.value = chapterId
  previewSceneNo.value = sceneNo
  showScenePreview.value = true
}

// ── 场景管理（场景管理 Tab）──────────────────────────────────────────────
const anchors = computed(() => sceneAnchorStore.anchors)
const showAnchorForm = ref(false)
const editingAnchorId = ref<number | null>(null)
const anchorForm = ref({ name: '', description: '' })
const savingAnchor = ref(false)

function startAnchorCreate() {
  editingAnchorId.value = null
  anchorForm.value = { name: '', description: '' }
  showAnchorForm.value = true
}

function startAnchorEdit(anchor: any) {
  editingAnchorId.value = anchor.id
  anchorForm.value = {
    name: anchor.name,
    description: anchor.description || '',
  }
  showAnchorForm.value = true
}

async function saveAnchor() {
  if (!anchorForm.value.name) { toast.error('请输入场景名称'); return }
  savingAnchor.value = true
  try {
    if (editingAnchorId.value) {
      await sceneAnchorStore.updateAnchor(editingAnchorId.value, anchorForm.value)
    } else {
      await sceneAnchorStore.createAnchor(novelId, anchorForm.value)
    }
    showAnchorForm.value = false
    toast.success(editingAnchorId.value ? '场景已更新' : '场景已创建')
  } catch (e: any) {
    toast.error(e.message || '保存失败')
  } finally {
    savingAnchor.value = false
  }
}

async function deleteAnchor(id: number) {
  if (!confirm('确定删除该场景？')) return
  try {
    await sceneAnchorStore.deleteAnchor(id)
    toast.success('已删除')
  } catch (e: any) {
    toast.error(e.message || '删除失败')
  }
}

async function handleSetShotAnchor(shot: any, anchorId: number | null) {
  if (!shotsVideoId.value) return
  try {
    const api = useSceneAnchorApi()
    await api.setShotAnchor(shotsVideoId.value, shot.id, anchorId)
    fetchShotsForChapter()
  } catch (e: any) {
    toast.error('绑定失败：' + (e.message || ''))
  }
}

// currentVideoId: null = empty state, number = show VideoEditor
const currentVideoId = ref<number | null>(null)
const videoEditorRef = ref<any>(null)
const generatingScript = ref(false)
const scriptUserPrompt = ref('')
// AI 参数从 cookie 恢复（刷新页面后保留用户手动设置的值）
const {
  pacing: scriptPacing,
  targetDuration: scriptTargetDuration,
  voiceMode: scriptVoiceMode,
  advMaxTokens,
  advTemperature,
  advTimeoutSeconds,
  initFromNovel: initAiParamsFromNovel,
} = useAiGenerationParams()
// 高级 AI 参数（各面板共享，0 = 使用系统默认，不覆盖）
const showAdvancedParams = ref(false)
// 联网参考开关（需要后端 web_search MCP 工具已启用）
const webSearchEnabled = ref(false)
// 百科知识开关（调用 wiki_search MCP 工具，无需 API Key）
const wikiSearchEnabled = ref(false)
// 情节模板开关（调用 story_pattern MCP 工具，本地数据库）
const storyPatternEnabled = ref(false)

// 脚本面板保留独立别名，方便模板区分（实际指向同一组 ref）
const showScriptAdvancedParams = showAdvancedParams
const scriptMaxTokens = advMaxTokens
const scriptTemperature = advTemperature
const scriptTimeoutSeconds = advTimeoutSeconds
const pacingOptions = [
  { value: 'auto'   as const, label: '自动' },
  { value: 'slow'   as const, label: '慢' },
  { value: 'normal' as const, label: '标准' },
  { value: 'fast'   as const, label: '快' },
]
const durationOptions = [
  { value: 0,   label: '自动' },
  { value: 30,  label: '30秒' },
  { value: 60,  label: '1分' },
  { value: 120, label: '2分' },
  { value: 180, label: '3分' },
  { value: 300, label: '5分' },
  { value: 600, label: '10分' },
  { value: 900, label: '15分' },
]
const scriptDurationIsCustom = computed(() => !durationOptions.some(d => d.value === scriptTargetDuration.value))
const showScriptCustomDuration = ref(false)
const scriptCustomDurationMins = ref(5)
watch(scriptCustomDurationMins, (v) => {
  scriptTargetDuration.value = Math.max(0, Math.round(v * 60))
})
const scriptAvgShotDur = computed(() => ({ auto: 5, slow: 8, normal: 5, fast: 3 }[scriptPacing.value] ?? 5))
const scriptEstimatedShots = computed(() => {
  const avgSec = scriptAvgShotDur.value
  if (scriptTargetDuration.value > 0) {
    return Math.max(3, Math.round(scriptTargetDuration.value / avgSec))
  }
  // 自动模式：与后端 calcTotalShots 逻辑对齐
  // 估算视频时长(秒) = 字数 * 2 / 25（约 300字/分阅读速度 × 0.4 精炼比）
  const totalChars = chapter.value?.content?.length ?? 0
  if (totalChars <= 0) return '自动'
  const estimatedSecs = Math.round(totalChars * 2 / 25)
  return Math.min(200, Math.max(5, Math.round(estimatedSecs / avgSec)))
})

async function switchToScript() {
  pageMode.value = 'script'
  if (chapterVideos.value.length === 0) await fetchChapterVideos()
  if (currentVideoId.value === null && chapterVideos.value.length > 0) {
    currentVideoId.value = chapterVideos.value[0].id
  }
}

async function handleGenerateScript() {
  if (!await guardAiProvider('LLM')) return
  if (!chapter.value) return
  const prompt = scriptUserPrompt.value || undefined
  const pacing = (scriptPacing.value !== 'normal' && scriptPacing.value !== 'auto') ? scriptPacing.value : undefined
  const duration = scriptTargetDuration.value || undefined
  const maxTokens = scriptMaxTokens.value || undefined
  const temperature = scriptTemperature.value || undefined
  const timeout = scriptTimeoutSeconds.value || undefined
  const voiceMode = (scriptVoiceMode.value && scriptVoiceMode.value !== 'auto' && scriptVoiceMode.value !== 'both') ? scriptVoiceMode.value : undefined
  const scriptProvider = scriptProviderOverride.value || undefined
  if (!currentVideoId.value) {
    // Auto-create project with defaults, then generate
    generatingScript.value = true
    try {
      const title = `${novel.value?.title || '小说'} 第${chapterNo}章`
      const video = await videoStore.createVideo({ novelId, chapterId: chapter.value.id, title, artStyle: novel.value?.image_style || 'anime', aspectRatio: '16:9', frameRate: 24, qualityTier: 'draft', mode: 'slideshow' })
      chapterVideos.value.unshift(video)
      currentVideoId.value = video.id
      await nextTick()
      videoEditorRef.value?.generateStoryboard(prompt, pacing, duration, maxTokens, temperature, timeout, voiceMode, scriptProvider)
    } catch (e: any) {
      toast.error('创建失败：' + (e.message || '未知错误'))
    } finally {
      generatingScript.value = false
    }
  } else {
    videoEditorRef.value?.generateStoryboard(prompt, pacing, duration, maxTokens, temperature, timeout, voiceMode, scriptProvider)
  }
}

function genStatusClass(status: string | undefined) {
  if (status === 'completed') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
  if (status === 'generating') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
  return 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
}

// ── 懒加载数据 ────────────────────────────────────────────────────────────────
const chapterItems = ref<any[]>([])
const loadingItems = ref(false)
async function fetchChapterItems() {
  loadingItems.value = true
  try {
    const data: any = await itemApi.listEffectiveItems(novelId, chapterNo)
    chapterItems.value = Array.isArray(data?.data) ? data.data : (data?.items ?? [])
  } catch {
    chapterItems.value = []
  } finally {
    loadingItems.value = false
  }
}

// ── 道具手动绑定 ──────────────────────────────────────────────────────────────
const showBindItemModal = ref(false)
const bindingItemId = ref<number | null>(null)
const unbindingItemId = ref<number | null>(null)
const novelItems = ref<any[]>([])
const loadingNovelItems = ref(false)

const unboundItems = computed(() => {
  const boundIds = new Set(chapterItems.value.map((i: any) => i.id))
  return novelItems.value.filter((i: any) => !boundIds.has(i.id))
})

async function fetchNovelItems() {
  if (novelItems.value.length > 0) return
  loadingNovelItems.value = true
  try {
    const data: any = await itemApi.listItems(novelId)
    novelItems.value = data?.data?.items ?? data?.items ?? []
  } catch {
    novelItems.value = []
  } finally {
    loadingNovelItems.value = false
  }
}

async function handleBindItem(itemId: number) {
  bindingItemId.value = itemId
  try {
    await itemApi.upsertChapterItem(novelId, chapterNo, itemId, {})
    await fetchChapterItems()
    showBindItemModal.value = false
  } catch (e: any) {
    toast.error('绑定失败：' + (e.message || ''))
  } finally {
    bindingItemId.value = null
  }
}

async function handleUnbindItem(itemId: number) {
  unbindingItemId.value = itemId
  try {
    await itemApi.deleteChapterItem(novelId, chapterNo, itemId)
    await fetchChapterItems()
  } catch (e: any) {
    toast.error('解绑失败：' + (e.message || ''))
  } finally {
    unbindingItemId.value = null
  }
}

const chapterScenes = ref<any[]>([])
const loadingScenes = ref(false)
async function fetchChapterScenes() {
  loadingScenes.value = true
  try {
    const { request } = useApi()
    const data: any = await request(`/novels/${novelId}/chapters/${chapterNo}/scenes`)
    chapterScenes.value = Array.isArray(data) ? data : (data?.scenes ?? [])
  } catch {
    chapterScenes.value = []
  } finally {
    loadingScenes.value = false
  }
}

const chapterVideos = ref<any[]>([])
const loadingVideos = ref(false)
async function fetchChapterVideos() {
  if (!chapter.value) return
  loadingVideos.value = true
  try {
    const { request } = useApi()
    const data: any = await request(`/novels/${novelId}/videos?chapter_id=${chapter.value.id}`)
    chapterVideos.value = Array.isArray(data?.data?.items) ? data.data.items : (Array.isArray(data?.data) ? data.data : [])
  } catch {
    chapterVideos.value = []
  } finally {
    loadingVideos.value = false
  }
}

// ── 剧情点 ────────────────────────────────────────────────────────────────────
const plotPoints = ref<PlotPoint[]>([])
const loadingPlotPoints = ref(false)
const extractingPlotPoints = ref(false)
const plotPointApi = usePlotPointApi()

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

async function loadPlotPoints() {
  if (!chapter.value) return
  loadingPlotPoints.value = true
  try {
    const data = await plotPointApi.listByChapter(chapter.value.id)
    plotPoints.value = data.plot_points ?? []
  } catch {
    plotPoints.value = []
  } finally {
    loadingPlotPoints.value = false
  }
}

async function handleExtractPlotPoints() {
  if (!chapter.value || extractingPlotPoints.value) return
  extractingPlotPoints.value = true
  try {
    const data = await plotPointApi.extract(chapter.value.id)
    plotPoints.value = data.plot_points ?? []
    toast.success('剧情点提取成功')
  } catch (e: any) {
    toast.error(e?.message || '提取失败')
  } finally {
    extractingPlotPoints.value = false
  }
}

async function handleDeletePlotPoint(id: number) {
  if (!confirm('确认删除该剧情点？')) return
  try {
    await plotPointApi.remove(id)
    plotPoints.value = plotPoints.value.filter(p => p.id !== id)
  } catch {
    toast.error('删除失败')
  }
}

async function handleResolvePlotPoint(pp: PlotPoint) {
  if (!chapter.value) return
  try {
    const updated = await plotPointApi.resolve(pp.id, chapter.value.id)
    const idx = plotPoints.value.findIndex(p => p.id === pp.id)
    if (idx !== -1) plotPoints.value[idx] = updated
  } catch {
    toast.error('操作失败')
  }
}

// Refresh plot points each time the user enters outline mode
watch(pageMode, (mode) => {
  if (mode === 'outline' && chapter.value && !loadingPlotPoints.value) {
    loadPlotPoints()
  }
  // Sync tab to URL so refresh restores the same view
  router.replace({ query: { ...route.query, tab: mode === 'outline' ? undefined : mode } })
})

const chapterShots = ref<any[]>([])
const loadingShots = ref(false)
const shotsVideoId = ref<number | null>(null)

// ── 章节级 AI 提取 ─────────────────────────────────────────────────────────────
const extractingChapterSkills = ref(false)

async function handleExtractChapterSkills() {
  if (!chapter.value || extractingChapterSkills.value) return
  extractingChapterSkills.value = true
  try {
    const { request } = useApi()
    const data: any = await request(`/novels/${novelId}/chapters/${chapterNo}/skills/ai-extract`, { method: 'POST' })
    const count = data?.count ?? (Array.isArray(data?.skills) ? data.skills.length : 0)
    toast.success(`提取技能 ${count} 个`)
  } catch (e: any) {
    toast.error('提取失败：' + (e.message || ''))
  } finally {
    extractingChapterSkills.value = false
  }
}

async function fetchShotsForChapter() {
  if (loadingShots.value) return
  if (chapterVideos.value.length === 0) {
    await fetchChapterVideos()
  }
  const firstVideo = chapterVideos.value[0]
  if (!firstVideo) return
  if (shotsVideoId.value === firstVideo.id) return
  loadingShots.value = true
  try {
    const { request } = useApi()
    const data: any = await request(`/videos/${firstVideo.id}/storyboard`)
    chapterShots.value = Array.isArray(data) ? data : (data?.shots ?? data?.data ?? [])
    shotsVideoId.value = firstVideo.id
  } catch {
    chapterShots.value = []
  } finally {
    loadingShots.value = false
  }
}

// ── 生成预览弹窗 ──────────────────────────────────────────────────────────────
const previewModal = reactive({
  open: false,
  content: '',
  originalContent: '',
})
const previewDiffMode = ref(false)

const previewDiffFile = computed(() => {
  if (!previewDiffMode.value) return null
  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const file = generateDiffFile(
    '原文', previewModal.originalContent,
    '新版本', previewModal.content,
    'plaintext', 'plaintext',
  )
  file.initTheme(dark ? 'dark' : 'light')
  file.init()
  file.buildSplitDiffLines()
  file.buildUnifiedDiffLines()
  return file
})

const applyingGenerated = ref(false)

const applyGenerated = async () => {
  content.value = previewModal.content
  previewModal.open = false
  previewDiffMode.value = false
  applyingGenerated.value = true
  try {
    await doSave()
    toast.success('已应用并保存生成内容')
  } catch (e: any) {
    // Content is already applied locally; only the persist step failed. Leave it dirty
    // (doSave didn't update savedContent on failure) so autosave/manual save can retry.
    toast.error('内容已应用，但保存失败，请手动保存：' + (e?.message || '未知错误'))
  } finally {
    applyingGenerated.value = false
  }
}

// ── 取消生成 ──────────────────────────────────────────────────────────────────
const currentTaskId = ref<string | null>(null)

const cancelGeneration = async () => {
  chapterStore.stopGenPoll()
  if (currentTaskId.value) {
    try {
      const { request } = useApi()
      await request(`/tasks/${currentTaskId.value}`, { method: 'DELETE' })
    } catch { /* best-effort */ }
    currentTaskId.value = null
  }
  generating.value = false
  toast.info('已取消生成')
}

// ── 撤销/重做 ─────────────────────────────────────────────────────────────────
const undoStack = ref<string[]>([])
const redoStack = ref<string[]>([])
const maxUndoSteps = 50
const _undoPrevContent = ref('')

const pushToUndo = (contentSnapshot: string) => {
  undoStack.value.push(contentSnapshot)
  if (undoStack.value.length > maxUndoSteps) {
    undoStack.value.shift()
  }
  redoStack.value = []
}

const handleUndo = () => {
  if (undoStack.value.length === 0) return
  redoStack.value.push(content.value)
  content.value = undoStack.value.pop()!
}

const handleRedo = () => {
  if (redoStack.value.length === 0) return
  undoStack.value.push(content.value)
  content.value = redoStack.value.pop()!
}

let _undoTimer: ReturnType<typeof setTimeout> | null = null
watch(content, (newVal, oldVal) => {
  if (_undoTimer !== null) clearTimeout(_undoTimer)
  _undoTimer = setTimeout(() => {
    if (oldVal !== newVal) {
      pushToUndo(oldVal)
      _undoPrevContent.value = newVal
    }
    _undoTimer = null
  }, 2000)
})

// ── 历史版本面板 ──────────────────────────────────────────────────────────────
const showVersionHistory = ref(false)
const versions = ref<ChapterVersion[]>([])
const chapterApiForVersions = useChapterApi()

const changeTypeLabel: Record<string, string> = {
  generation: 'AI 生成',
  manual_edit: '手动编辑',
  ai_revision: 'AI 修改',
  rollback: '回滚',
  pre_rewrite: '改写前备份',
  chapter_review: '审查后改进',
}

const loadVersions = async () => {
  if (!chapter.value) return
  try {
    const res = await chapterApiForVersions.getVersions(chapter.value.id)
    versions.value = (res as any)?.data?.versions || []
  } catch {
    versions.value = []
  }
}

const previewVersion = (v: ChapterVersion) => {
  previewModal.content = v.content
  previewModal.originalContent = content.value
  previewModal.open = true
}

async function fetchVersionContent(v: ChapterVersion): Promise<string> {
  if (v.content) return v.content
  try {
    const res = await chapterApiForVersions.getVersionContent(chapter.value!.id, v.id)
    return (res as any)?.data?.content ?? (res as any)?.content ?? ''
  } catch {
    return ''
  }
}

async function restoreVersion(version: ChapterVersion) {
  const label = changeTypeLabel[version.change_type] ?? version.change_type
  const no = version.version_no ? `v${version.version_no}` : `#${version.id}`
  if (!confirm(`确认恢复到 "${label} ${no}"？当前内容将被替换。`)) return
  try {
    const versionContent = await fetchVersionContent(version)
    if (versionContent) {
      pushToUndo(content.value)
      content.value = versionContent
      await doSave()
      toast.success('版本已恢复')
    }
  } catch (e) {
    console.error('恢复版本失败', e)
    toast.error('恢复版本失败')
  }
}

// ── 版本对比 ───────────────────────────────────────────────────────────────
interface DiffVersion { id: number | 'current'; label: string; content: string }

const showDiffModal = ref(false)
const diffLeftId = ref<number | 'current'>('current')
const diffRightId = ref<number | 'current'>('current')
const diffLoading = ref(false)
const diffLeftContent = ref('')
const diffRightContent = ref('')

const diffVersionOptions = computed((): DiffVersion[] => {
  const opts: DiffVersion[] = [{ id: 'current', label: '当前版本', content: content.value }]
  for (const v of versions.value) {
    const no = v.version_no ? `v${v.version_no}` : `#${v.id}`
    const lbl = changeTypeLabel[v.change_type] ?? v.change_type
    opts.push({ id: v.id, label: `${no} ${lbl} · ${formatDate(v.created_at)}`, content: v.content })
  }
  return opts
})

const diffFile = computed(() => {
  if (!diffLeftContent.value && !diffRightContent.value) return null
  const dark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const leftLabel = diffVersionOptions.value.find(o => o.id === diffLeftId.value)?.label ?? '左侧'
  const rightLabel = diffVersionOptions.value.find(o => o.id === diffRightId.value)?.label ?? '右侧'
  const file = generateDiffFile(
    leftLabel, diffLeftContent.value,
    rightLabel, diffRightContent.value,
    'plaintext', 'plaintext',
  )
  file.initTheme(dark ? 'dark' : 'light')
  file.init()
  file.buildSplitDiffLines()
  file.buildUnifiedDiffLines()
  return file
})

async function resolveVersionContent(id: number | 'current'): Promise<string> {
  if (id === 'current') return content.value
  const v = versions.value.find(ver => ver.id === id)
  return v ? await fetchVersionContent(v) : ''
}

async function openDiff(v: ChapterVersion) {
  showDiffModal.value = true
  diffLeftId.value = 'current'
  diffRightId.value = v.id
  diffLoading.value = true
  diffLeftContent.value = content.value
  diffRightContent.value = await fetchVersionContent(v)
  diffLoading.value = false
}

async function refreshDiff() {
  diffLoading.value = true
  const [l, r] = await Promise.all([
    resolveVersionContent(diffLeftId.value),
    resolveVersionContent(diffRightId.value),
  ])
  diffLeftContent.value = l
  diffRightContent.value = r
  diffLoading.value = false
}

watch([diffLeftId, diffRightId], () => { if (showDiffModal.value) refreshDiff() })

async function applyDiffVersion(side: 'left' | 'right') {
  const c = side === 'left' ? diffLeftContent.value : diffRightContent.value
  const id = side === 'left' ? diffLeftId.value : diffRightId.value
  const ver = diffVersionOptions.value.find(o => o.id === id)
  if (!c || !confirm(`确认应用"${ver?.label ?? '选中版本'}"的内容？当前内容将被替换。`)) return
  pushToUndo(content.value)
  content.value = c
  await doSave()
  showDiffModal.value = false
  toast.success('已应用版本内容')
}

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  } catch {
    return dateStr
  }
}

watch(showVersionHistory, (open) => {
  if (open) loadVersions()
  else { showDiffModal.value = false }
})

// ── 键盘快捷键（撤销/重做） ─────────────────────────────────────────────────
const handleUndoRedoKeydown = (e: KeyboardEvent) => {
  if (pageMode.value !== 'write') return
  if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault()
    handleUndo()
  } else if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault()
    handleRedo()
  }
}

// ── 离开页面守卫（生成进行中时提示） ─────────────────────────────────────────
function setupUnloadGuard() {
  const handler = (e: BeforeUnloadEvent) => {
    if (currentTaskId.value) {
      e.preventDefault()
      e.returnValue = '正在生成章节内容，关闭页面将中断生成。确定要离开吗？'
      return e.returnValue
    }
  }
  window.addEventListener('beforeunload', handler)
  onUnmounted(() => window.removeEventListener('beforeunload', handler))
}

setupUnloadGuard()

onMounted(() => window.addEventListener('keydown', handleUndoRedoKeydown))

onUnmounted(() => {
  chapterStore.stopGenPoll()
  window.removeEventListener('keydown', handleUndoRedoKeydown)
})
</script>

<template>
  <div class="flex flex-col" style="height: calc(100vh - 57px)">

    <!-- ── Topbar ─────────────────────────────────────────────────────────── -->
    <header class="flex-shrink-0 h-14 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center px-4 gap-3">
      <!-- Back + breadcrumb -->
      <button
        class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex-shrink-0"
        @click="router.push(`/novel/${novelId}`)"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
        </svg>
      </button>
      <div class="flex items-center gap-1.5 min-w-0 flex-shrink-0">
        <span class="text-sm text-gray-400 dark:text-gray-500 truncate max-w-28 hidden sm:block">{{ novel?.title }}</span>
        <svg class="w-3 h-3 text-gray-300 dark:text-gray-600 hidden sm:block flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
        </svg>
        <input
          v-model="chapterTitle"
          type="text"
          class="text-sm font-semibold text-gray-900 dark:text-white bg-transparent border-none outline-none focus:ring-0 min-w-0 w-36 truncate"
          :placeholder="`第${chapterNo}章`"
          @blur="handleTitleBlur"
        />
      </div>

      <!-- Mode toggle (centered) -->
      <div class="flex-1 flex justify-center">
        <div class="flex items-center bg-gray-100 dark:bg-gray-700/60 rounded-lg p-1 gap-1">
          <button class="relative px-3 py-1.5 text-sm font-medium rounded-md transition-all" :class="pageModeClass('outline')" @click="pageMode = 'outline'">大纲</button>
          <button class="relative px-3 py-1.5 text-sm font-medium rounded-md transition-all" :class="pageModeClass('write')" @click="pageMode = 'write'">写作</button>
          <button class="relative px-3 py-1.5 text-sm font-medium rounded-md transition-all" :class="pageModeClass('episodes')" @click="switchToEpisodes">剧本</button>
          <button class="relative px-3 py-1.5 text-sm font-medium rounded-md transition-all" :class="pageModeClass('character')" @click="switchToCharacter">角色</button>
          <button class="relative px-3 py-1.5 text-sm font-medium rounded-md transition-all" :class="pageModeClass('items')" @click="switchToItems">道具</button>
          <button class="relative px-3 py-1.5 text-sm font-medium rounded-md transition-all" :class="pageModeClass('scenes')" @click="switchToScenes">场景</button>
          <button class="relative px-3 py-1.5 text-sm font-medium rounded-md transition-all" :class="pageModeClass('script')" @click="switchToScript">视频</button>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-2 flex-shrink-0">
        <span v-if="autoSaveLabel" :class="saveFailed ? 'text-xs text-red-500' : 'text-xs text-gray-400 dark:text-gray-500'">{{ autoSaveLabel }}</span>
        <button
          v-if="!showRightPanel && !['character', 'items', 'scenes', 'episodes', 'outline'].includes(pageMode)"
          class="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title="显示 AI 助手"
          @click="showRightPanel = true"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19l-7-7m0 0l7-7m-7 7h18"/>
          </svg>
        </button>
      </div>
    </header>

    <!-- ── Body ──────────────────────────────────────────────────────────────── -->
    <div class="flex-1 flex min-h-0 overflow-hidden">

      <!-- Left: main editor / script view -->
      <main class="flex-1 min-w-0 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">

        <!-- ─ 大纲模式 ─ -->
        <div v-if="pageMode === 'outline'" class="h-full overflow-auto">
          <div class="max-w-2xl mx-auto px-8 py-10">

            <!-- ⚠️ 连贯性异常警告 -->
            <div
              v-if="chapter?.continuity_blocked"
              class="mb-6 flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800"
            >
              <svg class="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
              </svg>
              <div>
                <p class="text-sm font-medium text-red-700 dark:text-red-400">连贯性检查发现严重问题</p>
                <p class="text-xs text-red-600 dark:text-red-500 mt-1">本章角色状态、位置或世界观与前章存在冲突，AI 连贯性检查已标记。建议进行深度审查或重新生成。</p>
              </div>
            </div>

            <!-- Header row -->
            <div class="flex items-start justify-between mb-6">
              <div>
                <p class="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">第 {{ chapterNo }} 章大纲</p>
                <input
                  v-model="chapterTitle"
                  type="text"
                  class="text-2xl font-bold text-gray-900 dark:text-white bg-transparent border-none outline-none rounded-lg px-1 -mx-1 w-full max-w-md hover:bg-gray-100 dark:hover:bg-gray-800/50 focus:bg-gray-50 dark:focus:bg-gray-800 focus:ring-2 focus:ring-primary-500 transition-colors"
                  :placeholder="`第${chapterNo}章`"
                  @blur="handleTitleBlur"
                >
              </div>
              <!-- Actions: view mode -->
              <div v-if="!outlineEditMode" class="flex items-center gap-2 flex-shrink-0 mt-1">
                <button
                  v-if="chapter?.outline || chapter?.summary"
                  class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg transition-colors"
                  @click="startEditOutline"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                  编辑
                </button>
              </div>
              <!-- Edit mode actions -->
              <div v-else class="flex items-center gap-2 flex-shrink-0 mt-1">
                <button
                  class="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  @click="cancelEditOutline"
                >取消</button>
                <button
                  class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-lg transition-colors"
                  :disabled="savingOutline"
                  @click="handleSaveOutline"
                >
                  <svg v-if="savingOutline" class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                  </svg>
                  {{ savingOutline ? '保存中' : '保存' }}
                </button>
              </div>
            </div>

            <!-- Outline content -->
            <div class="mb-8">
              <!-- Edit textarea -->
              <textarea
                v-if="outlineEditMode"
                v-model="outlineEditText"
                rows="8"
                class="w-full resize-none bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-3 text-base text-gray-800 dark:text-gray-200 leading-8 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500"
                placeholder="输入本章大纲，描述核心情节、人物行动与转折点..."
              />
              <!-- View: has outline or summary -->
              <p v-else-if="chapter?.outline || chapter?.summary" class="text-base text-gray-700 dark:text-gray-300 leading-8 whitespace-pre-wrap">{{ chapter.outline || chapter.summary }}</p>
              <!-- View: empty state -->
              <div v-else class="py-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                <svg class="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <p class="text-sm text-gray-400 dark:text-gray-500 mb-4">暂无大纲</p>
                <button
                  class="px-4 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-lg transition-colors"
                  :disabled="generatingOutline"
                  @click="handleGenerateOutline"
                >
                  {{ generatingOutline ? 'AI 生成中...' : '立即生成' }}
                </button>
              </div>
            </div>

            <!-- 章末衔接锚点（chapter_end_state）独立成篇模式无需衔接下章，不显示 -->
            <div v-if="parsedEndState && novel?.chapter_mode !== 'independent'" class="mt-8 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div class="px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                <svg class="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">章末衔接锚点</span>
                <span class="text-xs text-gray-400 dark:text-gray-500 ml-1">· 下章将从此状态直接接续</span>
              </div>
              <div class="px-4 py-3 space-y-2">
                <p v-if="parsedEndState.scene_end" class="text-xs text-gray-500 dark:text-gray-400">
                  <span class="font-medium text-gray-600 dark:text-gray-300">场景：</span>{{ parsedEndState.scene_end }}
                </p>
                <div v-if="parsedEndState.characters?.length" class="space-y-1">
                  <div
                    v-for="c in parsedEndState.characters"
                    :key="c.name"
                    class="flex flex-wrap gap-x-3 gap-y-0.5 text-xs"
                  >
                    <span class="font-medium text-gray-700 dark:text-gray-300">{{ c.name }}</span>
                    <span class="text-gray-500 dark:text-gray-400">📍 {{ c.location }}</span>
                    <span class="text-gray-500 dark:text-gray-400">💭 {{ c.state }}</span>
                    <span class="text-gray-500 dark:text-gray-400 italic">「{{ c.last_action }}」</span>
                  </div>
                </div>
                <p v-if="parsedEndState.pending_action" class="text-xs text-amber-600 dark:text-amber-400">
                  <span class="font-medium">⚡ 未完成动作：</span>{{ parsedEndState.pending_action }}
                </p>
                <p v-if="parsedEndState.opening_hint" class="text-xs text-indigo-600 dark:text-indigo-400">
                  <span class="font-medium">➤ 下章接续建议：</span>{{ parsedEndState.opening_hint }}
                </p>
              </div>
            </div>

            <!-- 读者悬念（reader_expectations）独立成篇模式章章独立，不显示 -->
            <div v-if="parsedReaderExpectations.length && novel?.chapter_mode !== 'independent'" class="mt-4 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <div class="px-4 py-3 bg-gray-50 dark:bg-gray-800/60 border-b border-gray-200 dark:border-gray-700 flex items-center gap-2">
                <svg class="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span class="text-sm font-medium text-gray-700 dark:text-gray-300">读者悬念</span>
                <span class="text-xs text-gray-400 dark:text-gray-500 ml-1">· 下章生成时优先回应</span>
              </div>
              <ol class="px-4 py-3 space-y-1">
                <li
                  v-for="(exp, i) in parsedReaderExpectations"
                  :key="i"
                  class="text-xs text-gray-600 dark:text-gray-400 flex gap-2"
                >
                  <span class="font-medium text-violet-500 flex-shrink-0">{{ i + 1 }}.</span>
                  <span>{{ exp }}</span>
                </li>
              </ol>
            </div>

            <div class="mt-10 pt-6 border-t border-gray-200 dark:border-gray-700">
              <button class="text-sm text-primary-600 dark:text-primary-400 hover:underline" @click="pageMode = 'write'">→ 开始写作</button>
            </div>
          </div>
        </div>

        <!-- ─ 写作模式 ─ -->
        <div v-else-if="pageMode === 'write'" class="h-full flex flex-col overflow-hidden">
          <!-- Header row (mirrors outline mode) -->
          <div class="flex-none">
            <div class="max-w-2xl mx-auto px-8 pt-10 pb-4 flex items-start justify-between">
              <div>
                <p class="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">第 {{ chapterNo }} 章</p>
                <input
                  v-model="chapterTitle"
                  type="text"
                  class="text-2xl font-bold text-gray-900 dark:text-white bg-transparent border-none outline-none rounded-lg px-1 -mx-1 w-full max-w-md hover:bg-gray-100 dark:hover:bg-gray-800/50 focus:bg-gray-50 dark:focus:bg-gray-800 focus:ring-2 focus:ring-primary-500 transition-colors"
                  :placeholder="`第${chapterNo}章`"
                  @blur="handleTitleBlur"
                >
              </div>
              <!-- View mode: 历史版本 + 编辑 buttons -->
              <div v-if="!writeEditMode" class="flex items-center gap-2 flex-shrink-0 mt-1">
                <button
                  class="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  title="历史版本"
                  @click="showVersionHistory = !showVersionHistory"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                  历史版本
                </button>
                <button
                  v-if="content"
                  class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg transition-colors"
                  @click="startEditWrite"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                  编辑
                </button>
              </div>
              <!-- Edit mode: 取消 + 保存 buttons -->
              <div v-else class="flex items-center gap-2 flex-shrink-0 mt-1">
                <button
                  class="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                  @click="cancelEditWrite"
                >取消</button>
                <button
                  class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-lg transition-colors"
                  :disabled="savingWrite"
                  @click="handleSaveWrite"
                >
                  <svg v-if="savingWrite" class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                  </svg>
                  {{ savingWrite ? '保存中' : '保存' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Edit mode: toolbar + find/replace + textarea -->
          <template v-if="writeEditMode">
            <!-- 工具栏 -->
            <div class="flex-none border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
              <div class="max-w-2xl mx-auto px-8 py-1.5 flex items-center flex-wrap gap-0.5">
                <!-- 撤销/重做 -->
                <button
                  :disabled="undoStack.length === 0"
                  class="p-1.5 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-30"
                  title="撤销 (⌘Z)"
                  @click="handleUndo"
                >↩</button>
                <button
                  :disabled="redoStack.length === 0"
                  class="p-1.5 rounded text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-30"
                  title="重做 (⌘⇧Z)"
                  @click="handleRedo"
                >↪</button>
                <div class="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
                <!-- 查找 -->
                <button
                  :class="['p-1.5 rounded text-gray-500 dark:text-gray-400 transition-colors', showFindBar ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'hover:bg-gray-100 dark:hover:bg-gray-800']"
                  title="查找 (Ctrl+F)"
                  @click="openFind"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35"/></svg>
                </button>
                <div class="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
                <!-- 字号 -->
                <button class="px-1.5 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs font-bold leading-none" title="减小字号" @click="editorFontSize = Math.max(12, (editorFontSize as number) - 1)">A-</button>
                <span class="text-xs text-gray-400 dark:text-gray-500 w-6 text-center select-none">{{ editorFontSize }}</span>
                <button class="px-1.5 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs font-bold leading-none" title="增大字号" @click="editorFontSize = Math.min(28, (editorFontSize as number) + 1)">A+</button>
                <div class="w-px h-4 bg-gray-200 dark:bg-gray-700 mx-1" />
                <!-- 中文特殊符号 -->
                <button
                  v-for="ch in ['「', '」', '『', '』', '……', '——', '·', '《', '》']"
                  :key="ch"
                  class="px-1 py-0.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm font-mono leading-none"
                  :title="ch"
                  @click="insertSpecialChar(ch)"
                >{{ ch }}</button>
              </div>
            </div>

            <!-- 查找/替换栏 -->
            <div v-if="showFindBar" class="flex-none bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
              <div class="max-w-2xl mx-auto px-8 py-2 flex items-center gap-2 flex-wrap">
              <!-- 查找行 -->
              <div class="flex items-center gap-1 min-w-0">
                <input
                  id="find-input"
                  v-model="findText"
                  type="text"
                  placeholder="查找..."
                  class="w-48 text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                  @keydown.enter.exact.prevent="findNext"
                  @keydown.shift.enter.prevent="findPrev"
                  @keydown.escape.prevent="closeFind"
                />
                <span class="text-xs text-gray-400 whitespace-nowrap w-14 text-center">
                  <template v-if="findText">{{ findMatches.length ? `${findMatchIdx + 1}/${findMatches.length}` : '无匹配' }}</template>
                </span>
                <button class="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 text-xs leading-none" title="上一个 (Shift+Enter)" @click="findPrev">↑</button>
                <button class="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500 text-xs leading-none" title="下一个 (Enter)" @click="findNext">↓</button>
                <button
                  :class="['px-2 py-0.5 rounded text-xs transition-colors', showReplaceBar ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-500']"
                  @click="showReplaceBar = !showReplaceBar"
                >替换</button>
                <button class="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 text-xs leading-none" @click="closeFind">✕</button>
              </div>
              <!-- 替换行 -->
              <div v-if="showReplaceBar" class="flex items-center gap-1">
                <input
                  v-model="replaceText"
                  type="text"
                  placeholder="替换为..."
                  class="w-48 text-sm px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                  @keydown.escape.prevent="closeFind"
                />
                <button class="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300" @click="replaceCurrent">替换</button>
                <button class="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300" @click="replaceAll">全部替换</button>
              </div>
              </div>
            </div>

            <!-- 编辑区 -->
            <div class="flex-1 overflow-auto">
              <div class="max-w-2xl mx-auto px-8 pb-10 min-h-full">
                <textarea
                  ref="textareaRef"
                  v-model="content"
                  :style="{ fontSize: (editorFontSize as number) + 'px', lineHeight: '2' }"
                  class="w-full min-h-[60vh] resize-none bg-transparent border-none outline-none text-gray-900 dark:text-white leading-8 placeholder-gray-300 dark:placeholder-gray-600 focus:ring-0"
                  placeholder="开始写作..."
                  @mouseup="onEditMouseUp"
                />
              </div>
            </div>
          </template>

          <!-- View mode: read-only content -->
          <div v-else class="flex-1 overflow-auto">
            <div class="max-w-2xl mx-auto px-8 pb-10">
              <!-- Empty state -->
              <div v-if="!content" class="py-12 text-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                <svg class="w-10 h-10 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
                <p class="text-sm text-gray-400 dark:text-gray-500 mb-4">暂无内容</p>
                <button
                  class="px-4 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
                  @click="startEditWrite"
                >开始写作</button>
              </div>
              <!-- Content display -->
              <p
                v-else
                class="text-base text-gray-700 dark:text-gray-300 leading-8 whitespace-pre-wrap"
                :style="{ fontSize: (editorFontSize as number) + 'px', lineHeight: '2' }"
              >{{ content }}</p>
            </div>
          </div>

          <!-- Selection refine popup -->
          <Teleport to="body">
            <div
              v-if="selectionPopup.visible"
              ref="selectionPopupRef"
              class="fixed z-[200] bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden transition-all duration-200"
              :class="selectionPopup.mode === 'preview' ? 'w-[520px]' : 'w-[300px]'"
              :style="{ top: selectionPopup.top + 'px', left: selectionPopup.left + 'px', maxHeight: 'calc(100vh - 24px)' }"
            >
              <!-- Header -->
              <div class="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
                <div class="flex items-center gap-2">
                  <span class="text-xs font-semibold text-gray-700 dark:text-gray-200">
                    {{ selectionPopup.mode === 'preview' ? '改写对比' : '改写选段' }}
                  </span>
                  <span v-if="selectionPopup.mode === 'preview'" class="text-[10px] text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">确认后应用</span>
                </div>
                <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors" @click="closeSelectionPopup">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                </button>
              </div>

              <!-- ── 输入模式 ── -->
              <template v-if="selectionPopup.mode === 'input'">
                <div class="p-3 space-y-2.5 flex-1 overflow-y-auto">
                  <!-- Selected text preview -->
                  <div class="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed italic border-l-2 border-indigo-300 pl-2 line-clamp-3">
                    {{ selectionPopup.selectedText.slice(0, 100) }}{{ selectionPopup.selectedText.length > 100 ? '…' : '' }}
                  </div>

                  <!-- Quick hints -->
                  <div class="flex flex-wrap gap-1">
                    <button
                      v-for="hint in selectionHints" :key="hint"
                      class="text-[10px] px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-indigo-300 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      :disabled="selectionRefining"
                      @click="selectionInstruction = hint"
                    >{{ hint }}</button>
                  </div>

                  <!-- Instruction textarea -->
                  <textarea
                    v-model="selectionInstruction"
                    rows="3"
                    class="w-full text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-2 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 placeholder-gray-400 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-400"
                    placeholder="描述改写要求..."
                    :disabled="selectionRefining"
                    @keydown.ctrl.enter.prevent="handleRefineSelection"
                    @keydown.meta.enter.prevent="handleRefineSelection"
                  />
                  <p class="text-[10px] text-gray-400">Ctrl+Enter 提交</p>
                  <p v-if="selectionError" class="text-[10px] text-red-500">{{ selectionError }}</p>
                </div>

                <div class="px-3 pb-3 flex-shrink-0">
                  <button
                    class="w-full py-2 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                    :class="selectionRefining ? 'bg-gray-100 dark:bg-gray-700 text-gray-400' : 'bg-indigo-600 hover:bg-indigo-700 text-white'"
                    :disabled="selectionRefining || !selectionInstruction.trim()"
                    @click="handleRefineSelection"
                  >
                    <span v-if="selectionRefining" class="flex items-center justify-center gap-1.5">
                      <svg class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                      </svg>
                      AI 改写中...
                    </span>
                    <span v-else>开始改写</span>
                  </button>
                </div>
              </template>

              <!-- ── 预览模式：前后对比 ── -->
              <template v-else-if="selectionPopup.mode === 'preview'">
                <div class="flex-1 overflow-y-auto min-h-0">
                  <!-- 两栏标题 -->
                  <div class="grid grid-cols-2 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
                    <div class="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-950/30 border-r border-gray-100 dark:border-gray-700">
                      <span class="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0"/>
                      <span class="text-[10px] font-semibold text-red-600 dark:text-red-400">原文</span>
                      <span class="ml-auto text-[10px] text-gray-400">{{ selectionPopup.selectedText.length }} 字</span>
                    </div>
                    <div class="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 dark:bg-green-950/30">
                      <span class="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0"/>
                      <span class="text-[10px] font-semibold text-green-600 dark:text-green-400">改写后</span>
                      <span class="ml-auto text-[10px]" :class="selectionPopup.refinedText.length > selectionPopup.selectedText.length ? 'text-green-500' : selectionPopup.refinedText.length < selectionPopup.selectedText.length ? 'text-red-400' : 'text-gray-400'">
                        {{ selectionPopup.refinedText.length }} 字
                        <template v-if="selectionPopup.refinedText.length !== selectionPopup.selectedText.length">
                          ({{ selectionPopup.refinedText.length > selectionPopup.selectedText.length ? '+' : '' }}{{ selectionPopup.refinedText.length - selectionPopup.selectedText.length }})
                        </template>
                      </span>
                    </div>
                  </div>

                  <!-- 两栏内容 -->
                  <div class="grid grid-cols-2 divide-x divide-gray-100 dark:divide-gray-700 max-h-60 overflow-y-auto">
                    <div class="p-3 text-[11px] leading-relaxed text-gray-600 dark:text-gray-300 whitespace-pre-wrap bg-red-50/40 dark:bg-red-950/10">{{ selectionPopup.selectedText }}</div>
                    <div class="p-3 text-[11px] leading-relaxed text-gray-800 dark:text-gray-100 whitespace-pre-wrap bg-green-50/40 dark:bg-green-950/10">{{ selectionPopup.refinedText }}</div>
                  </div>
                </div>

                <!-- 操作按钮 -->
                <div class="px-3 py-2.5 border-t border-gray-100 dark:border-gray-700 flex gap-2 flex-shrink-0">
                  <button
                    class="flex-1 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    @click="rejectSelectionRefine"
                  >重新输入</button>
                  <button
                    class="flex-1 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                    @click="applySelectionRefine"
                  >应用</button>
                </div>
              </template>
            </div>

          </Teleport>
        </div>

        <!-- ─ 角色模式 ─ -->
        <div v-else-if="pageMode === 'character'" class="h-full overflow-auto">
          <div class="max-w-2xl mx-auto px-8 py-10 space-y-8">
            <!-- Active characters -->
            <div>
              <div class="flex items-center justify-between mb-4">
                <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">活跃角色</h4>
                <button
                  class="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
                  @click="showBindCharModal = true"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                  </svg>
                  手动绑定
                </button>
              </div>
              <div v-if="getActiveCharacters().length === 0" class="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                <p class="text-sm text-gray-400 dark:text-gray-500">暂无角色</p>
              </div>
              <div v-else class="grid grid-cols-3 gap-2">
                <div
                  v-for="char in getActiveCharacters()"
                  :key="char.id"
                  class="group relative flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-violet-400 dark:hover:border-violet-500 transition-colors overflow-hidden"
                >
                  <!-- image area: click to zoom three_view if available -->
                  <div
                    class="relative w-full aspect-[2/1] bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center overflow-hidden"
                    :class="getCharDisplayLook(char.id)?.three_view_sheet ? 'cursor-zoom-in' : 'cursor-default'"
                    @click="getCharDisplayLook(char.id)?.three_view_sheet && (threeViewModal = { show: true, url: getCharDisplayLook(char.id)!.three_view_sheet!, charName: char.name })"
                  >
                    <template v-if="getCharDisplayLook(char.id)?.three_view_sheet">
                      <img :src="getCharDisplayLook(char.id)!.three_view_sheet" class="w-full h-full object-cover" :alt="char.name" />
                      <!-- zoom hint on hover -->
                      <div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <svg class="w-5 h-5 text-white opacity-0 group-hover:opacity-80 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/>
                        </svg>
                      </div>
                    </template>
                    <!-- no image: show full name -->
                    <span v-else class="text-xs font-semibold text-gray-400 dark:text-gray-500 select-none px-2 text-center leading-snug">{{ char.name }}</span>
                    <!-- look switch arrows -->
                    <template v-if="charLooksMap[char.id]?.length > 1">
                      <button
                        class="absolute left-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
                        @click.stop="cycleCharLook(char.id, -1, $event)"
                      >
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/>
                        </svg>
                      </button>
                      <button
                        class="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
                        @click.stop="cycleCharLook(char.id, 1, $event)"
                      >
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
                        </svg>
                      </button>
                      <!-- look index dots -->
                      <div class="absolute bottom-1 left-0 right-0 flex justify-center gap-0.5">
                        <span
                          v-for="(_, i) in charLooksMap[char.id]"
                          :key="i"
                          class="w-1 h-1 rounded-full transition-colors"
                          :class="i === (charLookIdxMap[char.id] ?? 0) ? 'bg-white' : 'bg-white/40'"
                        />
                      </div>
                    </template>
                    <!-- unbind button -->
                    <button
                      class="absolute top-1 right-1 w-4 h-4 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-red-500/80 transition-colors opacity-0 group-hover:opacity-100"
                      title="解除绑定"
                      :disabled="unbindingCharId === char.id"
                      @click.stop="handleUnbindCharacter(char.id)"
                    >
                      <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                  <!-- name + look label + edit button -->
                  <div class="px-2 py-1.5 flex items-center gap-1">
                    <div class="flex-1 min-w-0">
                      <p class="text-xs font-medium text-gray-800 dark:text-gray-200 truncate text-center">{{ char.name }}</p>
                      <p v-if="charLooksMap[char.id]?.length > 0" class="text-[10px] text-violet-500 dark:text-violet-400 truncate text-center leading-tight">
                        {{ getCharDisplayLook(char.id)?.label || '默认形象' }}
                      </p>
                    </div>
                    <!-- edit button -->
                    <button
                      class="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors"
                      title="编辑角色"
                      @click.stop="router.push(`/character/${char.id}?from=${encodeURIComponent(route.fullPath)}`)"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <!-- Three-view zoom modal -->
            <Teleport to="body">
              <div
                v-if="threeViewModal.show"
                class="fixed inset-0 z-[200] flex items-center justify-center bg-black/75 backdrop-blur-sm"
                @click.self="threeViewModal.show = false"
              >
                <div class="relative max-w-5xl w-full mx-4">
                  <p class="text-white/90 text-sm font-semibold mb-2 text-center">{{ threeViewModal.charName }} &mdash; 三视图</p>
                  <img :src="threeViewModal.url" class="w-full h-auto max-h-[85vh] object-contain rounded-xl shadow-2xl" :alt="threeViewModal.charName" />
                  <button
                    class="absolute -top-8 right-0 text-white/70 hover:text-white transition-colors"
                    @click="threeViewModal.show = false"
                  >
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
              </div>
            </Teleport>

            <!-- Minor Characters -->
            <div v-if="minorCharacters.length > 0" class="border-t border-gray-200 dark:border-gray-700 pt-8">
              <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">次要角色</h4>
              <div class="grid grid-cols-3 gap-2">
                <div
                  v-for="char in minorCharacters"
                  :key="char.id"
                  class="group relative flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-violet-400 dark:hover:border-violet-500 transition-colors overflow-hidden"
                >
                  <div
                    class="relative w-full aspect-[2/1] bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center overflow-hidden"
                    :class="getCharDisplayLook(char.id)?.three_view_sheet ? 'cursor-zoom-in' : 'cursor-default'"
                    @click="getCharDisplayLook(char.id)?.three_view_sheet && (threeViewModal = { show: true, url: getCharDisplayLook(char.id)!.three_view_sheet!, charName: char.name })"
                  >
                    <template v-if="getCharDisplayLook(char.id)?.three_view_sheet">
                      <img :src="getCharDisplayLook(char.id)!.three_view_sheet" class="w-full h-full object-cover" :alt="char.name" />
                      <div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <svg class="w-5 h-5 text-white opacity-0 group-hover:opacity-80 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/>
                        </svg>
                      </div>
                    </template>
                    <!-- no image: show full name -->
                    <span v-else class="text-xs font-semibold text-gray-400 dark:text-gray-500 select-none px-2 text-center leading-snug">{{ char.name }}</span>
                    <template v-if="charLooksMap[char.id]?.length > 1">
                      <button
                        class="absolute left-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
                        @click.stop="cycleCharLook(char.id, -1, $event)"
                      >
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/>
                        </svg>
                      </button>
                      <button
                        class="absolute right-1 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
                        @click.stop="cycleCharLook(char.id, 1, $event)"
                      >
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/>
                        </svg>
                      </button>
                      <div class="absolute bottom-1 left-0 right-0 flex justify-center gap-0.5">
                        <span
                          v-for="(_, i) in charLooksMap[char.id]"
                          :key="i"
                          class="w-1 h-1 rounded-full transition-colors"
                          :class="i === (charLookIdxMap[char.id] ?? 0) ? 'bg-white' : 'bg-white/40'"
                        />
                      </div>
                    </template>
                    <button
                      class="absolute top-1 right-1 w-4 h-4 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-red-500/80 transition-colors opacity-0 group-hover:opacity-100"
                      title="解除绑定"
                      :disabled="unbindingCharId === char.id"
                      @click.stop="handleUnbindCharacter(char.id)"
                    >
                      <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                  <div class="px-2 py-1.5 flex items-center gap-1">
                    <div class="flex-1 min-w-0">
                      <p class="text-xs font-medium text-gray-800 dark:text-gray-200 truncate text-center">{{ char.name }}</p>
                      <p v-if="charLooksMap[char.id]?.length > 0" class="text-[10px] text-violet-500 dark:text-violet-400 truncate text-center leading-tight">
                        {{ getCharDisplayLook(char.id)?.label || '默认形象' }}
                      </p>
                    </div>
                    <button
                      class="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors"
                      title="编辑角色"
                      @click.stop="router.push(`/character/${char.id}?from=${encodeURIComponent(route.fullPath)}`)"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>

        <!-- ─ 道具模式 ─ -->
        <div v-else-if="pageMode === 'items'" class="h-full overflow-auto">
          <div class="max-w-2xl mx-auto px-8 py-10 space-y-8">
            <div>
              <div class="flex items-center justify-between mb-4">
                <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">本章道具</h4>
                <button
                  class="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
                  @click="fetchNovelItems(); showBindItemModal = true"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                  </svg>
                  手动绑定
                </button>
              </div>
              <div v-if="loadingItems" class="flex justify-center py-8 text-gray-400">
                <svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
              </div>
              <div v-else-if="chapterItems.length === 0" class="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                <svg class="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
                </svg>
                <p class="text-xs text-gray-400 dark:text-gray-500">暂无道具记录</p>
                <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">点击右侧「提取道具」自动识别，或「手动绑定」从道具库添加</p>
              </div>
              <!-- 网格卡片 -->
              <div v-else class="grid grid-cols-3 gap-2">
                <div
                  v-for="item in chapterItems"
                  :key="item.id"
                  class="group relative flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-amber-400 dark:hover:border-amber-500 transition-colors overflow-hidden"
                >
                  <!-- 图片区 -->
                  <div
                    class="relative w-full aspect-[2/1] bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center overflow-hidden"
                    :class="item.image_url ? 'cursor-zoom-in' : 'cursor-default'"
                    @click="item.image_url && (threeViewModal = { show: true, url: item.image_url, charName: item.name })"
                  >
                    <template v-if="item.image_url">
                      <img :src="item.image_url" class="w-full h-full object-cover" :alt="item.name" />
                      <div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <svg class="w-5 h-5 text-white opacity-0 group-hover:opacity-80 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/>
                        </svg>
                      </div>
                    </template>
                    <!-- 无图片：显示完整名称 -->
                    <span v-else class="text-xs font-semibold text-amber-300 dark:text-amber-700 select-none px-2 text-center leading-snug">{{ item.name }}</span>
                    <!-- 解绑按钮 -->
                    <button
                      class="absolute top-1 right-1 w-4 h-4 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-red-500/80 transition-colors opacity-0 group-hover:opacity-100"
                      title="解除绑定"
                      :disabled="unbindingItemId === item.id"
                      @click.stop="handleUnbindItem(item.id)"
                    >
                      <svg v-if="unbindingItemId === item.id" class="w-2.5 h-2.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                      </svg>
                      <svg v-else class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                  <!-- 名称 + 状态 + 编辑按钮 -->
                  <div class="px-2 py-1.5 flex items-center gap-1">
                    <div class="flex-1 min-w-0">
                      <p class="text-xs font-medium text-gray-800 dark:text-gray-200 truncate text-center">{{ item.name }}</p>
                      <p class="text-[10px] text-amber-500 dark:text-amber-400 truncate text-center leading-tight">
                        {{ item.effective_location || '本章道具' }}
                      </p>
                    </div>
                    <button
                      class="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
                      title="编辑道具"
                      @click.stop="router.push(`/item/${item.id}?novelId=${novelId}&from=${encodeURIComponent(route.fullPath)}`)"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ─ 场景管理模式 ─ -->
        <div v-else-if="pageMode === 'scenes'" class="h-full overflow-auto">
          <div class="max-w-2xl mx-auto px-8 py-10 space-y-8">

            <!-- 本章场景 九宫格 -->
            <div>
              <div class="flex items-center justify-between mb-4">
                <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">本章场景</h4>
                <button
                  class="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors"
                  @click="showBindAnchorModal = true"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                  </svg>
                  手动绑定
                </button>
              </div>
              <div v-if="chapterAnchors.length === 0" class="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                <p class="text-sm text-gray-400 dark:text-gray-500">暂无场景，点击右侧「场景分析」或「手动绑定」</p>
              </div>
              <div v-else class="grid grid-cols-3 gap-2">
                <div
                  v-for="anchor in chapterAnchors"
                  :key="anchor.id"
                  class="group relative flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-violet-400 dark:hover:border-violet-500 transition-colors overflow-hidden"
                >
                  <!-- 参考图 -->
                  <div
                    class="relative aspect-video bg-gray-100 dark:bg-gray-700 flex-shrink-0 flex items-center justify-center overflow-hidden"
                    :class="anchor.ref_image_url ? 'cursor-zoom-in' : 'cursor-default'"
                    @click="anchor.ref_image_url && (threeViewModal = { show: true, url: anchor.ref_image_url, charName: anchor.name })"
                  >
                    <template v-if="anchor.ref_image_url">
                      <img :src="anchor.ref_image_url" class="w-full h-full object-cover" :alt="anchor.name" />
                      <div class="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <svg class="w-5 h-5 text-white opacity-0 group-hover:opacity-80 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"/>
                        </svg>
                      </div>
                    </template>
                    <!-- 无图片：显示完整名称 -->
                    <span v-else class="text-xs font-semibold text-gray-400 dark:text-gray-500 select-none px-2 text-center leading-snug">{{ anchor.name }}</span>
                    <!-- 锁定标记 -->
                    <span v-if="anchor.ref_image_url" class="absolute top-1 left-1 text-[10px] bg-amber-500/90 text-white rounded px-1">已锁定</span>
                    <!-- 解绑按钮 -->
                    <button
                      class="absolute top-1 right-1 w-5 h-5 flex items-center justify-center rounded-full bg-gray-900/60 text-white hover:bg-red-500/90 transition-colors opacity-0 group-hover:opacity-100"
                      title="解除绑定"
                      :disabled="unbindingAnchorId === anchor.id"
                      @click.stop="handleUnbindAnchor(anchor.id)"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                  <!-- 名称 + 编辑按钮 -->
                  <div class="px-2 py-1.5 flex items-center gap-1">
                    <div class="flex-1 min-w-0">
                      <p class="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{{ anchor.name }}</p>
                    </div>
                    <button
                      class="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/30 transition-colors"
                      title="编辑场景"
                      @click.stop="router.push(`/scene-anchor/${anchor.id}?novelId=${novelId}&chapterNo=${chapterNo}&from=${encodeURIComponent(route.fullPath)}`)"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 编辑表单（点击场景卡片弹出） -->
            <div v-if="showAnchorForm" class="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
              <div class="flex items-center justify-between">
                <h4 class="text-sm font-medium text-gray-900 dark:text-white">{{ editingAnchorId ? '编辑场景' : '新建场景' }}</h4>
                <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" @click="showAnchorForm = false">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
              </div>
              <div>
                <label class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">场景名称 *</label>
                <input v-model="anchorForm.name" type="text" placeholder="如：书院大厅" class="input w-full text-sm" />
              </div>
              <div>
                <label class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">场景描述</label>
                <textarea v-model="anchorForm.description" rows="2" placeholder="用自然语言描述场景外观、氛围…" class="input w-full text-sm resize-none" />
              </div>
              <div class="flex gap-2 pt-1">
                <button class="btn-primary text-sm" :disabled="savingAnchor" @click="saveAnchor">
                  {{ savingAnchor ? '保存中…' : (editingAnchorId ? '更新' : '创建') }}
                </button>
                <button v-if="editingAnchorId" class="text-xs text-red-400 hover:text-red-600 px-3 py-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20" @click="deleteAnchor(editingAnchorId); showAnchorForm = false">删除场景</button>
                <button class="btn-outline text-sm" @click="showAnchorForm = false">取消</button>
              </div>
            </div>


          </div>
        </div>

        <!-- ─ 剧本（剧集列表）模式 ─ -->
        <div v-else-if="pageMode === 'episodes'" class="h-full overflow-auto p-6 space-y-4">
          <div v-if="loadingEpisodes" class="text-center py-16 text-gray-400 text-sm">加载中…</div>
          <div v-else-if="!episodeSummaries.length" class="text-center py-16 text-gray-400 text-sm">暂无剧集</div>

          <div
            v-for="ep in episodeSummaries"
            :key="ep.chapter_id"
            class="card p-5 border-l-4 transition-colors"
            :class="ep.video_id ? 'border-l-primary-500' : 'border-l-gray-200 dark:border-l-gray-700'"
          >
            <!-- 卡片头：章节标题 + 状态徽标 -->
            <div class="flex items-start justify-between gap-3 mb-4 pb-4 border-b border-gray-100 dark:border-gray-800">
              <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">
                第{{ ep.chapter_no }}章 {{ ep.title }}
              </h3>
              <div class="flex items-center gap-2 flex-shrink-0">
                <span v-if="ep.duration" class="tag bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">{{ Math.round(ep.duration) }}s</span>
                <span
                  class="tag"
                  :class="ep.scenes.length > 0 ? 'tag-success' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'"
                >{{ ep.scenes.length > 0 ? `剧本完成（${ep.scenes.length}场）` : '剧本未生成' }}</span>
                <div v-if="ep.shots_total > 0" class="flex items-center gap-1.5">
                  <span class="tag bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 whitespace-nowrap">视频 {{ ep.shots_with_video }}/{{ ep.shots_total }}</span>
                  <div class="progress-bar w-12 dark:bg-gray-700">
                    <div class="progress-bar-fill" :style="{ width: `${Math.round((ep.shots_with_video / ep.shots_total) * 100)}%` }" />
                  </div>
                </div>
              </div>
            </div>

            <div v-if="ep.scenes.length" class="space-y-2.5">
              <div
                v-for="scene in ep.scenes" :key="scene.scene_no"
                class="rounded-lg bg-gray-50 dark:bg-gray-800/60 p-4 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <div class="flex items-start gap-2.5">
                  <span class="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 text-xs font-semibold flex items-center justify-center mt-0.5">
                    {{ scene.scene_no }}
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center justify-between gap-2">
                      <p class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{{ scene.heading }}</p>
                      <div class="flex items-center gap-1 flex-shrink-0">
                        <button
                          class="p-1.5 rounded-md text-gray-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                          title="查看完整剧本"
                          @click="openScenePreview(ep.chapter_id, scene.scene_no)"
                        >
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>
                        </button>
                        <button
                          class="p-1.5 rounded-md text-gray-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                          title="进入视频生成环节"
                          @click="openEpisode(ep, scene.scene_no)"
                        >
                          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                        </button>
                      </div>
                    </div>
                    <p class="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mt-0.5">{{ scene.synopsis }}</p>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 p-6 text-center">
              <p class="text-sm text-gray-400 mb-3">暂无剧本内容</p>
              <div class="flex items-center gap-2 max-w-sm mx-auto">
                <button class="btn-primary flex-1 text-sm flex items-center justify-center gap-1.5 px-4" @click="openEpisode(ep)">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"/></svg>
                  进入视频生成环节
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- ─ 脚本模式 ─ -->
        <div v-else-if="pageMode === 'script'" class="h-full overflow-auto">
          <!-- Video editor -->
          <div v-if="currentVideoId" class="px-8 py-6">
            <VideoEditor ref="videoEditorRef" :video-id="(currentVideoId as number)" :llm-provider="novel?.ai_model || ''" />
          </div>

          <!-- Empty state -->
          <div v-else class="flex flex-col items-center justify-center h-full text-center text-gray-400 dark:text-gray-500 select-none">
            <svg class="w-12 h-12 mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
            </svg>
            <p class="text-sm">点击右侧「生成分镜脚本」开始</p>
          </div>
        </div>
      </main>

      <!-- Right: tools panel (hidden on export tab; character/items/scenes/episodes have no AI assistant panel) -->
      <aside
        v-if="showRightPanel && !['character', 'items', 'scenes', 'episodes', 'outline'].includes(pageMode) && !(pageMode === 'script' && videoEditorRef?.activeTab === 'export')"
        class="w-80 flex-shrink-0 flex flex-col min-h-0 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700"
      >

        <!-- Panel header -->
        <div class="relative flex-shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <div>
            <p class="text-xs font-semibold text-gray-900 dark:text-white">
              {{
                pageMode === 'script' && videoEditorRef?.activeTab === 'timeline' ? '视频预览' :
                pageMode === 'script' && videoEditorRef?.activeTab === 'sfx' ? '音效助手' :
                pageMode === 'script' && videoEditorRef?.activeTab === 'bgm' ? '背景音乐助手' :
                pageMode === 'script' && videoEditorRef?.activeTab === 'voice' ? '配音字幕助手' :
                pageMode === 'script' && videoEditorRef?.activeTab === 'video_gen' ? '视频生成助手' :
                'AI 助手'
              }}
            </p>
            <p class="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
              {{
                pageMode === 'write' ? '写作' :
                videoEditorRef?.activeTab === 'timeline' ? '时间线预览' :
                videoEditorRef?.activeTab === 'sfx' ? '音效场景偏好' :
                videoEditorRef?.activeTab === 'bgm' ? '情绪偏好 & 生成' :
                videoEditorRef?.activeTab === 'voice' ? '配音统计 & 操作' :
                videoEditorRef?.activeTab === 'video_gen' ? '生成进度 & 操作' :
                '脚本'
              }}
            </p>
          </div>
          <div class="flex items-center gap-0.5 flex-shrink-0 mt-0.5">
            <!-- 高级参数 trigger（视频子 tab 时隐藏） -->
            <button
              v-if="!(pageMode === 'script' && ['timeline','sfx','bgm','voice','video_gen'].includes(videoEditorRef?.activeTab ?? ''))"
              class="w-6 h-6 flex items-center justify-center rounded transition-colors"
              :class="showAdvancedParams ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'"
              title="高级参数"
              @click.stop="showAdvancedParams = !showAdvancedParams"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"/>
              </svg>
            </button>
            <button
              class="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title="关闭面板"
              @click="showRightPanel = false"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
              </svg>
            </button>
          </div>

          <!-- 高级参数 下拉浮层 -->
          <div
            v-if="showAdvancedParams"
            class="absolute top-full right-0 w-72 mt-0.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-50 p-4 space-y-3"
            @click.stop
          >
            <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">高级参数</h4>
            <div>
              <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Max Tokens <span class="text-gray-400">（0 = 自动）</span></label>
              <input v-model.number="advMaxTokens" type="number" min="0" step="256" placeholder="0"
                class="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"/>
            </div>
            <div>
              <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Temperature <span class="text-gray-400">（0 = 自动）</span></label>
              <div class="flex items-center gap-2">
                <input v-model.number="advTemperature" type="range" min="0" max="2.0" step="0.1" class="flex-1 accent-primary-500"/>
                <input v-model.number="advTemperature" type="number" min="0" max="2.0" step="0.1" placeholder="0"
                  class="w-14 px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"/>
              </div>
            </div>
            <div>
              <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">超时（秒）<span class="text-gray-400">（0 = 自动 300s）</span></label>
              <input v-model.number="advTimeoutSeconds" type="number" min="0" max="600" step="30" placeholder="0"
                class="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"/>
            </div>
            <!-- 写作模式专属 -->
            <template v-if="pageMode === 'write'">
              <div class="border-t border-gray-100 dark:border-gray-700 pt-2 space-y-2.5">
                <div class="flex items-center justify-between">
                  <div>
                    <span class="text-xs text-gray-600 dark:text-gray-300">联网参考</span>
                    <p class="text-[10px] text-gray-400">搜索相关故事片段作为灵感</p>
                  </div>
                  <button class="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
                    :class="webSearchEnabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'"
                    @click="webSearchEnabled = !webSearchEnabled">
                    <span class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                      :class="webSearchEnabled ? 'translate-x-4' : ''"/>
                  </button>
                </div>
                <div class="flex items-center justify-between">
                  <div>
                    <span class="text-xs text-gray-600 dark:text-gray-300">百科知识</span>
                    <p class="text-[10px] text-gray-400">查询 Wikipedia 提升世界观准确性</p>
                  </div>
                  <button class="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
                    :class="wikiSearchEnabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'"
                    @click="wikiSearchEnabled = !wikiSearchEnabled">
                    <span class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                      :class="wikiSearchEnabled ? 'translate-x-4' : ''"/>
                  </button>
                </div>
                <div class="flex items-center justify-between">
                  <div>
                    <span class="text-xs text-gray-600 dark:text-gray-300">情节模板</span>
                    <p class="text-[10px] text-gray-400">注入逆袭/觉醒等叙事结构参考</p>
                  </div>
                  <button class="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
                    :class="storyPatternEnabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'"
                    @click="storyPatternEnabled = !storyPatternEnabled">
                    <span class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                      :class="storyPatternEnabled ? 'translate-x-4' : ''"/>
                  </button>
                </div>
              </div>
            </template>
          </div>
          <!-- 点击其他区域关闭浮层 -->
          <div v-if="showAdvancedParams" class="fixed inset-0 z-40" @click="showAdvancedParams = false"/>
        </div>

        <!-- Panel content -->
        <div class="flex-1 overflow-auto">

          <!-- ── 写作 AI ── -->
          <template v-if="pageMode === 'write'">

            <!-- Tab header：左右等宽 -->
            <div class="flex-shrink-0 flex border-b border-gray-200 dark:border-gray-700">
              <button
                class="flex-1 py-2 text-xs font-medium transition-colors"
                :class="writePanelTab === 'generate' ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-500' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
                @click="writePanelTab = 'generate'"
              >生成</button>
              <button
                class="flex-1 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1"
                :class="writePanelTab === 'rewrite' ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-500' : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'"
                @click="writePanelTab = 'rewrite'"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                </svg>
                精修
              </button>
            </div>

            <!-- 生成 tab -->
            <div v-if="writePanelTab === 'generate'" class="p-4 space-y-4">
              <div class="space-y-3">
                <div>
                  <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">创作提示 <span class="font-normal text-gray-400">（可选）</span></label>
                  <textarea
                    v-model="prompt"
                    rows="3"
                    class="input text-sm resize-none"
                    placeholder="添加额外的创作指导..."
                  />
                </div>
                <!-- 字数目标 -->
                <div>
                  <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                    字数目标 <span class="font-normal text-gray-400">（0=默认，单章）</span>
                  </label>
                  <input
                    v-model.number="wordCountOverride"
                    type="number" min="0" step="500"
                    class="input text-sm"
                    placeholder="3000"
                  />
                  <p v-if="wordCountOverride > 0" class="mt-1 text-xs text-gray-400">
                    <template v-if="advMaxTokens > 0">
                      Max Tokens={{ advMaxTokens }} 时可生成约 {{ Math.floor(advMaxTokens / 1.3 * 0.8).toLocaleString() }} 字
                    </template>
                    <template v-else>
                      建议范围 500–8000；更长需同步调高 Max Tokens
                    </template>
                  </p>
                </div>
                <!-- 自动审查优化 -->
                <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div class="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-800/50">
                    <span class="text-xs font-medium text-gray-600 dark:text-gray-300">自动审查优化</span>
                    <button
                      type="button"
                      class="relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none"
                      :class="autoReviewEnabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'"
                      @click="toggleAutoReview"
                    >
                      <span
                        class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
                        :class="autoReviewEnabled ? 'translate-x-4' : 'translate-x-1'"
                      />
                    </button>
                  </div>
                  <div v-if="autoReviewEnabled" class="px-3 py-2.5 space-y-2.5 border-t border-gray-100 dark:border-gray-700">
                    <div class="grid grid-cols-2 gap-3 items-end">
                      <div>
                        <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">轮数上限</label>
                        <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 h-[32px]">
                          <button
                            v-for="n in [1, 2, 3]" :key="n" type="button"
                            class="flex-1 text-xs transition-colors"
                            :class="(novel?.auto_review_rounds ?? 1) === n
                              ? 'bg-primary-500 text-white font-medium'
                              : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'"
                            :title="`生成后自动执行 ${n} 轮 AI 审查优化`"
                            @click="updateNovelField({ auto_review_rounds: n })"
                          >{{ n }}</button>
                        </div>
                      </div>
                      <div>
                        <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">质量阈值 <span class="text-gray-400">（0=不限）</span></label>
                        <input
                          type="number" min="0" max="100" step="1"
                          :value="novel?.auto_review_min_score ?? 80"
                          class="input text-xs h-[32px]"
                          placeholder="80"
                          @change="(e) => updateNovelField({ auto_review_min_score: parseInt((e.target as HTMLInputElement).value) || 0 })"
                        />
                      </div>
                    </div>
                  </div>
                </div>
                <div class="flex gap-2">
                  <template v-if="chapter?.word_count">
                    <button
                      class="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-60"
                      :disabled="generating || regenerating"
                      title="重新生成当前章节内容（会保存当前版本）"
                      @click="showRegenModal = true"
                    >
                      <svg :class="['w-4 h-4', regenerating && 'animate-spin']" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                      </svg>
                      {{ regenerating ? '重新生成中...' : '重新生成' }}
                    </button>
                  </template>
                  <template v-else>
                    <div class="flex-1 flex flex-col gap-1">
                      <!-- 内联模型选择 -->
                      <div v-if="llmProviders.length > 0" class="flex items-center gap-1.5">
                        <span class="text-xs text-gray-400 flex-shrink-0">模型</span>
                        <select
                          v-model="chapterModelOverride"
                          class="flex-1 px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"
                        >
                          <option value="">自动</option>
                          <option v-for="p in llmProviders" :key="p.name" :value="p.name">{{ p.display_name || p.name }}</option>
                        </select>
                      </div>
                      <span v-if="isLastChapter" class="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium">
                        <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M5 2a1 1 0 011 1v1h1a1 1 0 010 2H6v1a1 1 0 01-2 0V6H3a1 1 0 010-2h1V3a1 1 0 011-1zm0 10a1 1 0 011 1v1h1a1 1 0 110 2H6v1a1 1 0 11-2 0v-1H3a1 1 0 110-2h1v-1a1 1 0 011-1zm7-10a1 1 0 01.707.293l4 4a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414l8-8A1 1 0 0112 2z" clip-rule="evenodd"/></svg>
                        最终章模式 — 将自动收束全部故事线
                      </span>
                      <button
                        class="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium disabled:opacity-60 text-white rounded-lg transition-colors"
                        :class="isLastChapter ? 'bg-amber-600 hover:bg-amber-700' : 'bg-primary-600 hover:bg-primary-700'"
                        :disabled="generating"
                        @click="handleGenerate"
                      >
                        <svg v-if="generating" class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                        </svg>
                        <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                        </svg>
                        {{ generating ? '生成中...' : '立即生成' }}
                      </button>
                    </div>
                  </template>
                  <button
                    v-if="generating"
                    class="px-3 py-2.5 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                    @click="cancelGeneration"
                  >取消生成</button>
                </div>
              </div>

              <!-- Quality report -->
              <div v-if="qualityReport" class="pt-4 border-t border-gray-100 dark:border-gray-700 space-y-3">
                <div class="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-700/50">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-baseline gap-1.5">
                      <span class="text-2xl font-bold tabular-nums" :class="qualityTier(qualityReport.overall_score).color">
                        {{ (qualityReport.overall_score * 100).toFixed(0) }}
                      </span>
                      <span class="text-xs text-gray-400">/ 100</span>
                      <span class="ml-1 text-xs font-semibold" :class="qualityTier(qualityReport.overall_score).color">
                        {{ qualityTier(qualityReport.overall_score).label }}
                      </span>
                    </div>
                    <div class="mt-1.5 h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
                      <div
                        class="h-full rounded-full transition-all duration-500"
                        :style="{ width: `${qualityReport.overall_score * 100}%` }"
                        :class="qualityReport.overall_score >= 0.85 ? 'bg-green-500' : qualityReport.overall_score >= 0.70 ? 'bg-blue-500' : qualityReport.overall_score >= 0.55 ? 'bg-amber-500' : 'bg-red-500'"
                      />
                    </div>
                  </div>
                  <button
                    class="shrink-0 px-2.5 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-lg hover:border-gray-300 transition-colors disabled:opacity-40"
                    :disabled="checking"
                    @click="handleCheckQuality"
                  >
                    <svg v-if="checking" class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                    </svg>
                    <span v-else>重检</span>
                  </button>
                </div>
                <div v-if="qualityReport.issues.length > 0" class="space-y-1">
                  <div
                    v-for="issue in qualityReport.issues.slice(0, 4)" :key="issue.description"
                    class="flex items-start gap-1.5 px-2.5 py-1.5 rounded-lg text-xs leading-relaxed"
                    :class="{
                      'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300': issue.severity === 'high',
                      'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300': issue.severity === 'medium',
                      'bg-gray-50 text-gray-700 dark:bg-gray-700/50 dark:text-gray-300': issue.severity === 'low',
                    }"
                  >
                    <span class="shrink-0 mt-0.5 font-bold" :class="{ 'text-red-500': issue.severity === 'high', 'text-amber-500': issue.severity === 'medium', 'text-gray-400': issue.severity === 'low' }">
                      {{ issue.severity === 'high' ? '●' : issue.severity === 'medium' ? '◐' : '○' }}
                    </span>
                    {{ issue.description }}
                  </div>
                </div>
                <div v-if="qualityReport.suggestions && qualityReport.suggestions.length > 0" class="space-y-2">
                  <div class="space-y-1">
                    <div v-for="sg in qualityReport.suggestions" :key="sg" class="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                      <span class="shrink-0 text-blue-400 mt-0.5">›</span>
                      {{ sg }}
                    </div>
                  </div>
                  <button
                    :disabled="refining"
                    class="w-full py-2 text-xs font-medium rounded-lg transition-colors disabled:opacity-40 bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center gap-1.5"
                    @click="handleApplyImprovements"
                  >
                    <svg v-if="refining" class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                    </svg>
                    <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                    </svg>
                    {{ refining ? 'AI精修中...' : '✨ AI一键精修' }}
                  </button>
                </div>
                <div v-if="showRefinedPreview && refinedContent" class="border border-blue-200 dark:border-blue-700 rounded-xl overflow-hidden">
                  <div class="flex items-center justify-between px-3 py-2 bg-blue-50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-700">
                    <span class="text-xs font-semibold text-blue-700 dark:text-blue-300">✨ AI精修预览</span>
                    <span class="text-[10px] text-blue-400">{{ refinedContent.length.toLocaleString() }} 字</span>
                  </div>
                  <div class="p-3 max-h-64 overflow-y-auto text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap bg-white dark:bg-gray-800">{{ refinedContent }}</div>
                  <div class="flex gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-600">
                    <button class="flex-1 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors" @click="acceptRefinement">采纳</button>
                    <button class="flex-1 py-1.5 text-xs font-medium bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-lg transition-colors" @click="discardRefinement">丢弃</button>
                  </div>
                </div>
              </div>

              <!-- 自动审查状态提示 -->
              <div
                v-if="chapter?.quality_status === 'low'"
                class="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700"
              >
                <svg class="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
                <div class="flex-1 min-w-0">
                  <p class="text-xs font-medium text-amber-700 dark:text-amber-300">自动审查：质量偏低</p>
                  <p class="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">经过自动优化后仍未达到评分阈值，建议手动深度审查</p>
                </div>
              </div>

              <!-- AI 深度审查入口 -->
              <button
                class="w-full py-2 text-xs font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 border border-dashed border-primary-300 dark:border-primary-600 rounded-lg transition-colors hover:border-primary-400 flex items-center justify-center gap-1.5"
                @click="openReviewPanel"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                AI 深度审查
              </button>

            </div>

            <!-- 精修 tab -->
            <div v-else-if="writePanelTab === 'rewrite'" class="p-4 space-y-4">

              <div class="space-y-1.5">
                <p class="text-xs font-medium text-gray-600 dark:text-gray-300">用自然语言描述精修需求</p>
                <p class="text-[10px] text-gray-400 dark:text-gray-500 leading-relaxed">描述你的修改需求，AI 会在保留原有情节的基础上进行精准改写，完成后生成新版本供预览。</p>
              </div>

              <!-- Quick hints -->
              <div class="space-y-1.5">
                <p class="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest">快速填入</p>
                <div class="flex flex-wrap gap-1.5">
                  <button
                    v-for="hint in REWRITE_HINTS" :key="hint"
                    class="text-[10px] px-2 py-1 rounded-md border border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-primary-300 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
                    :disabled="rewriting"
                    @click="rewriteInstruction = hint"
                  >{{ hint }}</button>
                </div>
              </div>

              <!-- Instruction input -->
              <div class="space-y-2">
                <textarea
                  v-model="rewriteInstruction"
                  rows="5"
                  class="input text-sm resize-none"
                  placeholder="例如：把结尾两段改得更有张力，制造悬念..."
                  :disabled="rewriting"
                  @keydown.ctrl.enter.prevent="handleRewriteByInstruction"
                  @keydown.meta.enter.prevent="handleRewriteByInstruction"
                />
                <p class="text-[10px] text-gray-400">Ctrl+Enter 提交 · 精修完成后会弹出预览，可选择应用</p>
              </div>

              <!-- Error -->
              <p v-if="rewriteError" class="text-xs text-red-500">{{ rewriteError }}</p>

              <!-- Instruction history -->
              <div v-if="rewriteHistory.length > 0" class="space-y-1.5">
                <p class="text-[10px] text-gray-400 dark:text-gray-500 uppercase tracking-widest">历史指令</p>
                <div class="space-y-1 max-h-48 overflow-y-auto pr-0.5">
                  <div
                    v-for="(h, idx) in rewriteHistory" :key="idx"
                    class="group flex items-start gap-1.5 px-2.5 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary-300 dark:hover:border-primary-600 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors cursor-pointer"
                    @click="rewriteInstruction = h"
                  >
                    <svg class="w-3 h-3 text-gray-300 dark:text-gray-600 group-hover:text-primary-400 mt-0.5 flex-shrink-0 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                    </svg>
                    <span class="flex-1 text-[11px] text-gray-600 dark:text-gray-300 leading-relaxed line-clamp-2">{{ h }}</span>
                    <button
                      class="flex-shrink-0 opacity-0 group-hover:opacity-100 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-red-500 transition-all"
                      title="删除"
                      @click.stop="deleteRewriteHistory(idx)"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>

              <!-- Submit button -->
              <button
                class="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-60"
                :class="rewriting ? 'bg-gray-200 dark:bg-gray-700 text-gray-400' : 'bg-primary-600 hover:bg-primary-700 text-white'"
                :disabled="rewriting || !rewriteInstruction.trim() || !chapter?.content"
                @click="handleRewriteByInstruction"
              >
                <svg v-if="rewriting" class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
                <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
                </svg>
                {{ rewriting ? 'AI 精修中...' : '开始精修' }}
              </button>

              <!-- Progress hint when task running -->
              <div v-if="rewriting" class="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700">
                <div class="flex gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style="animation-delay:0ms"/>
                  <span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style="animation-delay:150ms"/>
                  <span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-bounce" style="animation-delay:300ms"/>
                </div>
                <p class="text-xs text-blue-600 dark:text-blue-400">AI 正在精修，通常需要 30-60 秒...</p>
              </div>

            </div>

          </template>

          <!-- ── 角色 AI ── -->
          <!-- ── 脚本 AI ── -->
          <template v-else-if="pageMode === 'script'">

            <!-- ── 视频预览（时间线 tab 激活时）：接收 VideoEditor 内 Teleport 传送的播放器 ── -->
            <div v-if="videoEditorRef?.activeTab === 'timeline'" id="timeline-player-slot" />

            <!-- ── 视频生成 AI 助手（video_gen tab 激活时）── -->
            <div v-else-if="videoEditorRef?.activeTab === 'video_gen'" id="video-gen-ai-slot" />

            <!-- ── 音效 AI 助手（sfx tab 激活时）：接收 VideoEditor 内 Teleport 传送的音效助手 ── -->
            <div v-else-if="videoEditorRef?.activeTab === 'sfx'" id="sfx-ai-slot" />

            <!-- ── 背景音乐 AI 助手（bgm tab 激活时）：接收 VideoEditor 内 Teleport 传送的BGM助手 ── -->
            <div v-else-if="videoEditorRef?.activeTab === 'bgm'" id="bgm-ai-slot" />

            <!-- ── 配音字幕 AI 助手（voice tab 激活时）：接收 VideoEditor 内 Teleport 传送的配音助手 ── -->
            <div v-else-if="videoEditorRef?.activeTab === 'voice'" id="voice-ai-slot" />

            <!-- ── 脚本 AI 助手（其余 tab）── -->
            <div v-else class="p-4 space-y-4">
              <!-- 节奏 -->
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">节奏</label>
                <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                  <button
                    v-for="p in pacingOptions" :key="p.value"
                    class="flex-1 py-1.5 text-xs transition-colors"
                    :class="scriptPacing === p.value ? 'bg-primary-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-750'"
                    @click="scriptPacing = p.value"
                  >{{ p.label }}</button>
                </div>
              </div>
              <!-- 时长 -->
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">目标时长</label>
                <div class="flex flex-wrap gap-1">
                  <button
                    v-for="d in durationOptions" :key="d.value"
                    class="px-2.5 py-1 text-xs rounded-md border transition-colors"
                    :class="scriptTargetDuration === d.value && !scriptDurationIsCustom
                      ? 'bg-primary-500 border-primary-500 text-white'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-primary-300'"
                    @click="scriptTargetDuration = d.value; showScriptCustomDuration = false"
                  >{{ d.label }}</button>
                  <button
                    class="px-2.5 py-1 text-xs rounded-md border transition-colors"
                    :class="scriptDurationIsCustom || showScriptCustomDuration
                      ? 'bg-primary-500 text-white border-primary-500'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:border-primary-300'"
                    @click="showScriptCustomDuration = !showScriptCustomDuration; if (scriptDurationIsCustom) scriptCustomDurationMins = scriptTargetDuration / 60"
                  >自定义</button>
                </div>
                <div v-if="showScriptCustomDuration" class="flex items-center gap-2 mt-1.5">
                  <input
                    v-model.number="scriptCustomDurationMins"
                    type="number" min="0.5" max="120" step="0.5"
                    class="w-20 px-2 py-1 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"
                  />
                  <span class="text-xs text-gray-400">分钟</span>
                  <span v-if="scriptTargetDuration > 0" class="text-xs text-primary-500">= {{ scriptTargetDuration }}秒</span>
                </div>
                <p class="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                  预计约 <span class="font-medium text-gray-600 dark:text-gray-300">{{ scriptEstimatedShots }}</span> 个镜头<span v-if="scriptTargetDuration === 0 && typeof scriptEstimatedShots === 'number'" class="ml-1 text-gray-400">（按字数估算）</span>
                </p>
              </div>
              <!-- 配音模式 -->
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">配音模式</label>
                <select
                  v-model="scriptVoiceMode"
                  class="w-full px-2.5 py-1.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="auto">自动</option>
                  <option value="narration">仅旁白</option>
                  <option value="dialogue">仅对白</option>
                  <option value="narration_primary">旁白为主</option>
                  <option value="dialogue_primary">对白为主</option>
                </select>
              </div>
              <!-- 用户提示词 -->
              <div>
                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">额外要求（可选）</label>
                <textarea
                  v-model="scriptUserPrompt"
                  rows="3"
                  placeholder="例如：镜头以第一视角为主，多用近景特写，风格写实…"
                  class="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-600 resize-none focus:outline-none focus:ring-1 focus:ring-primary-500"
                />
              </div>
              <!-- 内联模型选择 -->
              <div v-if="llmProviders.length > 0" class="flex items-center gap-1.5">
                <span class="text-xs text-gray-400 flex-shrink-0">模型</span>
                <select
                  v-model="scriptProviderOverride"
                  class="flex-1 px-2 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-500"
                >
                  <option value="">自动</option>
                  <option v-for="p in llmProviders" :key="p.name" :value="p.name">{{ p.display_name || p.name }}</option>
                </select>
              </div>
              <button
                class="w-full px-4 py-2.5 text-sm font-medium bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
                :disabled="generatingScript || videoStore.generating || videoStore.storyboardTaskStatus === 'pending' || videoStore.storyboardTaskStatus === 'running'"
                @click="handleGenerateScript"
              >
                <svg v-if="generatingScript || videoStore.generating" class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
                <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
                {{ generatingScript ? '创建中…' : videoStore.generating ? '生成中…' : videoStore.storyboard.length > 0 ? '更新分镜脚本' : '生成分镜脚本' }}
              </button>
              <button
                v-if="videoStore.storyboard.length > 0"
                class="w-full px-4 py-2.5 text-sm font-medium btn-secondary rounded-lg transition-colors flex items-center justify-center gap-2"
                @click="videoEditorRef?.reviewStoryboard()"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                AI 审查
              </button>
              <button
                v-if="videoStore.storyboard.length > 0"
                class="w-full px-4 py-2.5 text-sm font-medium btn-secondary rounded-lg transition-colors flex items-center justify-center gap-2"
                @click="videoEditorRef?.generateAllImages()"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                生成全部图片
              </button>
            </div>
          </template>

        </div>
      </aside>
    </div>

    <!-- ── Status bar ─────────────────────────────────────────────────────────── -->
    <footer class="flex-shrink-0 h-9 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex items-center px-5 gap-4">
      <span class="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
        {{ countWords(content).toLocaleString() }} 字
        <span class="text-gray-300 dark:text-gray-600 mx-1">/</span>
        {{ chapterStore.wordCountGoal.toLocaleString() }}
      </span>
      <div class="flex items-center gap-2 flex-1 max-w-40">
        <div class="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-300"
            :style="{ width: `${progress}%` }"
            :class="{
              'bg-green-500': progress >= 100,
              'bg-amber-400': progress >= 70 && progress < 100,
              'bg-primary-500': progress < 70,
            }"
          />
        </div>
        <span class="text-xs font-semibold flex-shrink-0"
          :class="progress >= 100 ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'"
        >{{ Math.round(progress) }}%</span>
      </div>
      <span v-if="autoSaveLabel" :class="saveFailed ? 'text-xs text-red-500 ml-auto flex-shrink-0' : 'text-xs text-gray-400 dark:text-gray-500 ml-auto flex-shrink-0'">{{ autoSaveLabel }}</span>
    </footer>

  </div>

  <!-- ── 生成分镜弹窗 ──────────────────────────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="showStoryboardModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="fixed inset-0 bg-black/50 backdrop-blur-sm" @click="showStoryboardModal = false"></div>
      <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6">
        <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-1">创建视频项目</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-6">
          基于「{{ chapterTitle || `第${chapterNo}章` }}」创建视频项目，完成后自动跳转到分镜编辑器
        </p>
        <div class="space-y-5">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2.5">画面风格</label>
            <div class="grid grid-cols-4 gap-2">
              <button
                v-for="style in ART_STYLES"
                :key="style.id"
                type="button"
                class="py-2.5 text-sm font-medium rounded-xl border-2 transition-all"
                :class="storyboardForm.art_style === style.id
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'"
                @click="storyboardForm.art_style = style.id"
              >{{ style.name }}</button>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2.5">宽高比</label>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="ratio in ['16:9', '9:16', '1:1']"
                :key="ratio"
                type="button"
                class="py-2.5 text-sm font-medium rounded-xl border-2 transition-all"
                :class="storyboardForm.aspect_ratio === ratio
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'"
                @click="storyboardForm.aspect_ratio = ratio"
              >{{ ratio }}</button>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2.5">生成质量</label>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="tier in QUALITY_TIERS"
                :key="tier.id"
                type="button"
                class="flex flex-col items-center py-3 px-2 rounded-xl border-2 transition-all"
                :class="storyboardForm.quality_tier === tier.id
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'"
                @click="storyboardForm.quality_tier = tier.id"
              >
                <span class="text-sm font-semibold">{{ tier.name }}</span>
                <span class="text-[10px] mt-0.5 opacity-70 text-center leading-tight">{{ tier.desc }}</span>
              </button>
            </div>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2.5">视频模式</label>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="m in VIDEO_MODES"
                :key="m.id"
                type="button"
                class="flex flex-col items-center py-3 px-2 rounded-xl border-2 transition-all"
                :class="storyboardForm.mode === m.id
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'"
                @click="storyboardForm.mode = m.id"
              >
                <span class="text-sm font-semibold">{{ m.name }}</span>
                <span class="text-[10px] mt-0.5 opacity-70 text-center leading-tight">{{ m.desc }}</span>
              </button>
            </div>
          </div>
        </div>
        <div class="mt-6 flex gap-3">
          <button class="flex-1 py-2.5 text-sm font-medium border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-xl transition-colors" @click="showStoryboardModal = false">取消</button>
          <button
            class="flex-1 py-2.5 text-sm font-medium bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-xl transition-colors flex items-center justify-center gap-2"
            :disabled="creatingStoryboard"
            @click="handleCreateStoryboard"
          >
            <svg v-if="creatingStoryboard" class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            {{ creatingStoryboard ? '创建中...' : '创建分镜项目' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- AI 深度审查面板（懒挂载：首次打开后保持 alive，通过 visible prop 控制显隐） -->
  <ChapterReviewPanel
    v-if="reviewPanelMounted && chapter"
    :chapter-id="chapter.id"
    :visible="showReviewPanel"
    @close="showReviewPanel = false"
    @content-updated="handleReviewContentUpdated"
  />

  <!-- 生成预览弹窗 -->
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="previewModal.open" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div
          class="bg-white dark:bg-gray-800 rounded-xl flex flex-col shadow-2xl max-h-[85vh] transition-all duration-300"
          :class="previewDiffMode ? 'w-full max-w-6xl' : 'w-full max-w-4xl'"
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
            <div class="flex items-center gap-3">
              <h3 class="font-semibold text-lg text-gray-900 dark:text-white">生成预览</h3>
              <!-- 对比切换 -->
              <button
                class="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                :class="previewDiffMode
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 border border-primary-300 dark:border-primary-600'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600'"
                @click="previewDiffMode = !previewDiffMode"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/>
                </svg>
                对比
              </button>
            </div>
            <div class="flex gap-2">
              <button
                class="px-4 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                :disabled="applyingGenerated"
                @click="applyGenerated"
              >
                {{ applyingGenerated ? '保存中...' : '使用此内容' }}
              </button>
              <button
                class="px-4 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                :disabled="applyingGenerated"
                @click="previewModal.open = false; previewDiffMode = false"
              >
                放弃
              </button>
            </div>
          </div>

          <!-- Body -->
          <div class="flex-1 overflow-hidden flex min-h-0">
            <!-- 对比模式：DiffView 组件 -->
            <div v-if="previewDiffMode && previewDiffFile" class="flex-1 flex flex-col overflow-hidden">
              <!-- 列标题 -->
              <div class="flex-shrink-0 grid grid-cols-2 border-b border-gray-200 dark:border-gray-700">
                <div class="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-950/30 border-r border-gray-200 dark:border-gray-700">
                  <span class="w-2 h-2 rounded-full bg-red-400 flex-shrink-0"/>
                  <span class="text-xs font-semibold text-red-700 dark:text-red-400">原文</span>
                  <span class="ml-auto text-[10px] text-gray-400">{{ countWords(previewModal.originalContent) }} 字</span>
                </div>
                <div class="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-950/30">
                  <span class="w-2 h-2 rounded-full bg-green-400 flex-shrink-0"/>
                  <span class="text-xs font-semibold text-green-700 dark:text-green-400">新版本</span>
                  <span class="ml-auto text-[10px] text-gray-400">{{ countWords(previewModal.content) }} 字</span>
                </div>
              </div>
              <div class="flex-1 overflow-auto">
                <DiffView
                  :diff-file="previewDiffFile"
                  :diff-view-mode="DiffModeEnum.Split"
                  :diff-view-wrap="true"
                  :diff-view-highlight="false"
                  :diff-view-font-size="13"
                />
              </div>
            </div>

            <!-- 普通模式：单列 -->
            <div v-else class="flex-1 overflow-y-auto p-6 text-sm leading-relaxed whitespace-pre-wrap text-gray-800 dark:text-gray-200">
              {{ previewModal.content }}
            </div>
          </div>

          <!-- Footer -->
          <div class="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 flex items-center justify-between">
            <span class="text-xs text-gray-500 dark:text-gray-400">
              新版本：{{ countWords(previewModal.content) }} 字
              <template v-if="previewModal.originalContent">
                <span class="mx-1.5 text-gray-300 dark:text-gray-600">·</span>
                <span
                  :class="countWords(previewModal.content) > countWords(previewModal.originalContent)
                    ? 'text-green-500' : countWords(previewModal.content) < countWords(previewModal.originalContent)
                    ? 'text-red-400' : 'text-gray-400'"
                >
                  {{ countWords(previewModal.content) > countWords(previewModal.originalContent) ? '+' : '' }}{{ countWords(previewModal.content) - countWords(previewModal.originalContent) }} 字
                </span>
              </template>
            </span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- 历史版本侧边栏 -->
  <Teleport to="body">
    <Transition name="slide-right">
      <div v-if="showVersionHistory" class="fixed right-0 bottom-0 w-80 bg-white dark:bg-gray-800 shadow-xl z-40 flex flex-col border-l border-gray-200 dark:border-gray-700" style="top: 57px">
        <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 class="font-semibold text-gray-900 dark:text-white">历史版本</h3>
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" @click="showVersionHistory = false">✕</button>
        </div>
        <div class="overflow-y-auto flex-1 p-3 space-y-2">
          <div v-if="versions.length === 0" class="text-sm text-gray-400 dark:text-gray-500 text-center py-8">暂无历史版本</div>
          <!-- 当前版本卡片 -->
          <div v-if="versions.length > 0" class="p-3 border-2 border-primary-400 dark:border-primary-500 rounded-lg bg-primary-50 dark:bg-primary-900/20">
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-bold text-primary-600 dark:text-primary-400 px-1.5 py-0.5 bg-primary-100 dark:bg-primary-800 rounded">当前</span>
              <span class="text-xs text-gray-500 dark:text-gray-400">{{ countWords(content) }} 字</span>
            </div>
            <div class="text-xs text-gray-400 dark:text-gray-500">编辑中</div>
          </div>
          <!-- 历史版本列表 -->
          <div
            v-for="v in versions"
            :key="v.id"
            class="p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
          >
            <div class="flex items-center gap-2 mb-1">
              <span class="text-xs font-mono font-semibold text-gray-500 dark:text-gray-400 px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                {{ v.version_no ? `v${v.version_no}` : `#${v.id}` }}
              </span>
              <span class="text-xs font-medium text-gray-700 dark:text-gray-300">{{ changeTypeLabel[v.change_type] ?? v.change_type }}</span>
            </div>
            <div v-if="v.change_description" class="text-xs text-gray-500 dark:text-gray-400 mb-1 line-clamp-2">{{ v.change_description }}</div>
            <div class="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
              <span>{{ countWords(v.content) }} 字</span>
              <span>{{ formatDate(v.created_at) }}</span>
            </div>
            <div class="flex gap-1 mt-2">
              <button
                @click="previewVersion(v)"
                class="flex-1 text-xs px-2 py-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded transition-colors"
              >预览</button>
              <button
                @click="openDiff(v)"
                class="flex-1 text-xs px-2 py-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded transition-colors"
              >对比</button>
              <button
                @click="restoreVersion(v)"
                class="flex-1 text-xs px-2 py-1 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-700 rounded transition-colors"
              >恢复</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- 版本对比弹窗 -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="showDiffModal" class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div class="bg-white dark:bg-gray-800 rounded-xl flex flex-col shadow-2xl max-h-[85vh] w-full max-w-6xl overflow-hidden">
          <!-- 顶部工具栏 -->
          <div class="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0 flex-wrap">
            <h2 class="font-semibold text-gray-900 dark:text-white mr-2">版本对比</h2>
            <!-- 左侧选择 -->
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-500 dark:text-gray-400 shrink-0">左侧</span>
              <select
                v-model="diffLeftId"
                class="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 max-w-xs"
              >
                <option v-for="o in diffVersionOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
              </select>
            </div>
            <span class="text-gray-400 dark:text-gray-600">→</span>
            <!-- 右侧选择 -->
            <div class="flex items-center gap-2">
              <span class="text-xs text-gray-500 dark:text-gray-400 shrink-0">右侧</span>
              <select
                v-model="diffRightId"
                class="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 max-w-xs"
              >
                <option v-for="o in diffVersionOptions" :key="o.id" :value="o.id">{{ o.label }}</option>
              </select>
            </div>
            <!-- 应用按钮 -->
            <div class="flex items-center gap-2 ml-auto">
              <button
                class="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                @click="applyDiffVersion('right')"
              >应用右侧版本</button>
              <button
                class="text-xs px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg transition-colors"
                @click="applyDiffVersion('left')"
              >应用左侧版本</button>
              <button
                class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 ml-1 text-lg leading-none"
                @click="showDiffModal = false"
              >✕</button>
            </div>
          </div>
          <!-- 加载中 -->
          <div v-if="diffLoading" class="flex-1 flex items-center justify-center">
            <span class="text-sm text-gray-400 dark:text-gray-500">加载中…</span>
          </div>
          <!-- DiffView -->
          <template v-else-if="diffFile">
            <!-- 列标题 -->
            <div class="flex-shrink-0 grid grid-cols-2 border-b border-gray-200 dark:border-gray-700">
              <div class="flex items-center gap-2 px-4 py-2 bg-red-50 dark:bg-red-950/30 border-r border-gray-200 dark:border-gray-700">
                <span class="w-2 h-2 rounded-full bg-red-400 flex-shrink-0"/>
                <span class="text-xs font-semibold text-red-700 dark:text-red-400">
                  {{ diffVersionOptions.find(o => o.id === diffLeftId)?.label ?? '左侧' }}
                </span>
                <span class="ml-auto text-[10px] text-gray-400">{{ countWords(diffLeftContent) }} 字</span>
              </div>
              <div class="flex items-center gap-2 px-4 py-2 bg-green-50 dark:bg-green-950/30">
                <span class="w-2 h-2 rounded-full bg-green-400 flex-shrink-0"/>
                <span class="text-xs font-semibold text-green-700 dark:text-green-400">
                  {{ diffVersionOptions.find(o => o.id === diffRightId)?.label ?? '右侧' }}
                </span>
                <span class="ml-auto text-[10px] text-gray-400">{{ countWords(diffRightContent) }} 字</span>
              </div>
            </div>
            <div class="flex-1 overflow-auto">
              <DiffView
                :diff-file="diffFile"
                :diff-view-mode="DiffModeEnum.Split"
                :diff-view-wrap="true"
                :diff-view-highlight="false"
                :diff-view-font-size="13"
              />
            </div>
          </template>
          <div v-else class="flex-1 flex items-center justify-center text-sm text-gray-400 dark:text-gray-500">
            两个版本内容完全相同
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- 重新生成确认弹窗 -->
  <div v-if="showRegenModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50" @click.self="showRegenModal = false">
    <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">重新生成章节内容</h3>
      <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
        当前内容将自动保存为版本历史，AI 将重新运行完整生成流程（场景大纲 → 正文 → 润色）。生成完成后可预览再决定是否应用。
      </p>
      <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">额外指引（可选）</label>
      <textarea
        v-model="regenPrompt"
        rows="3"
        placeholder="例如：这一章要侧重冲突升级，结尾需要悬念..."
        class="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 mb-4"
      />
      <div class="flex gap-3 justify-end">
        <button
          class="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          @click="showRegenModal = false"
        >取消</button>
        <button
          class="px-4 py-2 text-sm font-medium bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
          @click="handleRegenerate"
        >确认重新生成</button>
      </div>
    </div>
  </div>

  <!-- 手动绑定场景弹窗 -->
  <div v-if="showBindAnchorModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="showBindAnchorModal = false" />
    <div class="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[70vh] flex flex-col">
      <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-white">绑定场景到本章</h3>
        <button class="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="showBindAnchorModal = false">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="overflow-y-auto flex-1 p-4">
        <p v-if="unboundAnchors.length === 0" class="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
          所有场景已绑定到本章
        </p>
        <div v-else class="space-y-2">
          <button
            v-for="anchor in unboundAnchors"
            :key="anchor.id"
            class="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:border-violet-300 dark:hover:border-violet-600 transition-colors text-left disabled:opacity-50"
            :disabled="bindingAnchorId === anchor.id"
            @click="handleBindAnchor(anchor.id)"
          >
            <div class="w-12 h-9 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 flex-shrink-0">
              <img v-if="anchor.ref_image_url" :src="anchor.ref_image_url" class="w-full h-full object-cover" alt="" />
              <div v-else class="w-full h-full flex items-center justify-center">
                <svg class="w-4 h-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ anchor.name }}</p>
            </div>
            <svg v-if="bindingAnchorId === anchor.id" class="w-4 h-4 animate-spin text-violet-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
            <svg v-else class="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- 手动绑定角色弹窗 -->
  <div v-if="showBindCharModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="showBindCharModal = false" />
    <div class="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[70vh] flex flex-col">
      <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-white">绑定角色到本章</h3>
        <button class="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="showBindCharModal = false">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="overflow-y-auto flex-1 p-4">
        <p v-if="unboundCharacters.length === 0" class="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
          所有角色已绑定到本章
        </p>
        <div v-else class="space-y-2">
          <button
            v-for="char in unboundCharacters"
            :key="char.id"
            class="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:border-violet-300 dark:hover:border-violet-600 transition-colors text-left disabled:opacity-50"
            :disabled="bindingCharId === char.id"
            @click="handleBindCharacter(char.id)"
          >
            <div class="w-9 h-9 rounded-full flex-shrink-0 overflow-hidden bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
              <img v-if="char.default_look?.three_view_sheet" :src="char.default_look?.three_view_sheet" class="w-full h-full object-cover" :alt="char.name" />
              <span v-else class="text-sm font-bold text-primary-600 dark:text-primary-400">{{ char.name.charAt(0) }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ char.name }}</p>
              <p class="text-xs text-gray-400 dark:text-gray-500">{{ { protagonist: '主角', antagonist: '反派', supporting: '配角', minor: '次要角色' }[char.role] || char.role }}</p>
            </div>
            <svg v-if="bindingCharId === char.id" class="w-4 h-4 animate-spin text-violet-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            <svg v-else class="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- 手动绑定道具弹窗 -->
  <div v-if="showBindItemModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
    <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="showBindItemModal = false" />
    <div class="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md max-h-[70vh] flex flex-col">
      <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 class="text-sm font-semibold text-gray-900 dark:text-white">绑定道具到本章</h3>
        <button class="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" @click="showBindItemModal = false">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="overflow-y-auto flex-1 p-4">
        <div v-if="loadingNovelItems" class="flex items-center justify-center py-8">
          <svg class="w-5 h-5 animate-spin text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
        </div>
        <p v-else-if="unboundItems.length === 0" class="text-center text-sm text-gray-400 dark:text-gray-500 py-8">
          所有道具已绑定到本章
        </p>
        <div v-else class="space-y-2">
          <button
            v-for="item in unboundItems"
            :key="item.id"
            class="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:border-amber-300 dark:hover:border-amber-600 transition-colors text-left disabled:opacity-50"
            :disabled="bindingItemId === item.id"
            @click="handleBindItem(item.id)"
          >
            <div class="w-9 h-9 rounded-lg flex-shrink-0 overflow-hidden bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <img v-if="item.image_url" :src="item.image_url" class="w-full h-full object-cover" :alt="item.name" />
              <svg v-else class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
              </svg>
            </div>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ item.name }}</p>
            </div>
            <svg v-if="bindingItemId === item.id" class="w-4 h-4 animate-spin text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
            <svg v-else class="w-4 h-4 text-gray-300 dark:text-gray-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- 场次剧本预览弹窗（"剧本"列表卡片"查看完整剧本"按钮） -->
  <Teleport to="body">
    <div v-if="showScenePreview" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="fixed inset-0 bg-black/50 backdrop-blur-sm" @click="showScenePreview = false"></div>
      <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        <button class="absolute top-3 right-3 z-10 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" @click="showScenePreview = false">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
        <VideoScreenplayTab
          v-if="previewChapterId"
          :chapter-id="previewChapterId"
          :focus-scene-no="previewSceneNo ?? undefined"
          :llm-provider="novel?.ai_model || ''"
          @saved="showScenePreview = false"
        />
      </div>
    </div>
  </Teleport>
</template>
