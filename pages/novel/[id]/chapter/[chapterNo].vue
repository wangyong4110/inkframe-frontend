<script setup lang="ts">
import type { PlotPoint } from '~/types'

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
const toast = useToast()
const { guardAiProvider } = useAiProviderGuard()

const saving = ref(false)
const isSaving = ref(false)
const generating = ref(false)

// ── 页面模式 ──────────────────────────────────────────────────────────────────
type PageMode = 'outline' | 'write' | 'character' | 'scenes' | 'script'
const pageMode = ref<PageMode>('outline')

function pageModeClass(mode: PageMode) {
  return pageMode.value === mode
    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
}

// ── 角色状态快照 ──────────────────────────────────────────────────────────────
const updateCharSnapshots = ref(false)
const snapshotMode = ref<'generate' | 'reuse'>('generate')
const selectedCharacterIds = ref<number[]>([])
const syncingSnapshots = ref(false)
const snapshotMsg = ref('')

function toggleAllCharacters(checked: boolean) {
  selectedCharacterIds.value = checked ? characters.value.map((c: any) => c.id) : []
}

async function handleSyncSnapshots() {
  if (!chapter.value) return
  syncingSnapshots.value = true
  snapshotMsg.value = ''
  try {
    const { request } = useApi()
    await request(`/novels/${novelId}/chapters/${chapter.value.chapter_no}/character-snapshots`, {
      method: 'POST',
      body: JSON.stringify({
        character_ids: selectedCharacterIds.value,
        reuse_previous: snapshotMode.value === 'reuse',
      }),
    })
    snapshotMsg.value = '角色状态已更新'
    toast.success('角色状态更新完成')
  } catch (e: any) {
    snapshotMsg.value = ''
    toast.error('更新失败：' + (e.message || ''))
  } finally {
    syncingSnapshots.value = false
  }
}

// ── 分镜弹窗 ──────────────────────────────────────────────────────────────────
const showStoryboardModal = ref(false)
const creatingStoryboard = ref(false)
const storyboardForm = ref({
  art_style: 'anime',
  aspect_ratio: '16:9',
  quality_tier: 'draft' as 'draft' | 'preview' | 'final',
  mode: 'slideshow' as 'slideshow' | 'video',
})

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
  { id: 'ink', name: '水墨' },
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
  await Promise.all([
    novelStore.fetchNovel(novelId),
    characterStore.fetchCharacters(novelId),
  ])
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
  }
  // 仅在用户未手动设置时，用小说配置推算字数目标
  if (wordCountOverride.value === 0) {
    wordCountOverride.value = computeDefaultWordCount(novel.value)
  }
  // 从项目配置读取 AI 高级参数默认值（cookie 中已有值时跳过，保留用户手动设置）
  initAiParamsFromNovel(novel.value)
  // Restore tab from URL query
  const tabParam = route.query.tab as string | undefined
  if (tabParam === 'script') {
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

const { lastSavedAt, autoSaving, saveFailed } = useAutosave(
  () => doSave(),
  [content, chapterTitle],
)

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
    const wordCount = wordCountOverride.value > 0 ? wordCountOverride.value : undefined
    // max_tokens 仅作为 LLM 上下文限制；不再用于推算目标字数
    const maxTokens = advMaxTokens.value > 0 ? advMaxTokens.value : undefined
    const temperature = advTemperature.value > 0 ? advTemperature.value : undefined
    const timeoutSeconds = advTimeoutSeconds.value > 0 ? advTimeoutSeconds.value : undefined
    const { task_id } = await chapterStore.generateChapter(novelId, currentChapterNo, prompt.value, maxTokens, novel.value?.ai_model || undefined, temperature, timeoutSeconds, wordCount, webSearchEnabled.value || undefined, wikiSearchEnabled.value || undefined, storyPatternEnabled.value || undefined)
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
    previewModal.open = true
    toast.success('内容生成完成，请预览后选择是否应用')
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || '未知错误'))
  } finally {
    generating.value = false
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

// ── 导入内容 ──────────────────────────────────────────────────────────────────
const showImportPanel = ref(false)
const importText = ref('')

function handleImportContent() {
  const text = importText.value.trim()
  if (!text) return
  if (content.value && !confirm('导入将替换当前编辑中的内容，确认继续？')) return
  const wordCount = countWords(text)
  content.value = text
  importText.value = ''
  showImportPanel.value = false
  toast.success(`已导入 ${wordCount.toLocaleString()} 字`)
}

// ── 质量改进 ──────────────────────────────────────────────────────────────────
const checking = ref(false)
const refining = ref(false)
const refinedContent = ref('')
const showRefinedPreview = ref(false)

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

// Fix 5: Replace inline filter calls with computed properties
const mainCharacters = computed(() => characters.value.filter((c: any) => c.role !== 'minor'))
const minorCharacters = computed(() => characters.value.filter((c: any) => c.role === 'minor'))

function getActiveCharacters(): any[] {
  return mainCharacters.value
}

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

// ── 全小说大纲生成 ─────────────────────────────────────────────────────────────
const generatingNovelOutline = ref(false)

async function handleGenerateNovelOutline() {
  if (!await guardAiProvider('LLM')) return
  generatingNovelOutline.value = true
  try {
    const overrides = {
      max_tokens: advMaxTokens.value || undefined,
      temperature: advTemperature.value || undefined,
      timeout_seconds: advTimeoutSeconds.value || undefined,
    }
    await novelStore.generateOutline(novelId, 10, prompt.value || undefined, overrides)
    toast.success('全小说大纲生成完成')
  } catch (e: any) {
    toast.error('大纲生成失败：' + (e.message || '未知错误'))
  } finally {
    generatingNovelOutline.value = false
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

function switchToCharacter() {
  pageMode.value = 'character'
  if (chapterItems.value.length === 0) fetchChapterItems()
}

async function switchToScenes() {
  pageMode.value = 'scenes'
  sceneAnchorStore.fetchAnchors(novelId)
  fetchShotsForChapter()
}

// ── 场景锚点管理（场景管理 Tab）──────────────────────────────────────────────
const anchors = computed(() => sceneAnchorStore.anchors)
const showAnchorForm = ref(false)
const editingAnchorId = ref<number | null>(null)
const anchorForm = ref({ name: '', type: 'interior', description: '', prompt_lock: '' })
const savingAnchor = ref(false)

function startAnchorCreate() {
  editingAnchorId.value = null
  anchorForm.value = { name: '', type: 'interior', description: '', prompt_lock: '' }
  showAnchorForm.value = true
}

function startAnchorEdit(anchor: any) {
  editingAnchorId.value = anchor.id
  anchorForm.value = {
    name: anchor.name, type: anchor.type || 'interior',
    description: anchor.description || '', prompt_lock: anchor.prompt_lock || '',
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
  if (!confirm('确定删除该场景锚点？')) return
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
  { value: 'slow' as const, label: '慢' },
  { value: 'normal' as const, label: '标准' },
  { value: 'fast' as const, label: '快' },
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
const scriptAvgShotDur = computed(() => ({ slow: 8, normal: 5, fast: 3 }[scriptPacing.value] ?? 5))
const scriptEstimatedShots = computed(() =>
  scriptTargetDuration.value > 0
    ? Math.max(3, Math.round(scriptTargetDuration.value / scriptAvgShotDur.value))
    : '自动'
)

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
  const pacing = scriptPacing.value !== 'normal' ? scriptPacing.value : undefined
  const duration = scriptTargetDuration.value || undefined
  const maxTokens = scriptMaxTokens.value || undefined
  const temperature = scriptTemperature.value || undefined
  const timeout = scriptTimeoutSeconds.value || undefined
  const voiceMode = (scriptVoiceMode.value && scriptVoiceMode.value !== 'auto' && scriptVoiceMode.value !== 'both') ? scriptVoiceMode.value : undefined
  if (!currentVideoId.value) {
    // Auto-create project with defaults, then generate
    generatingScript.value = true
    try {
      const title = `${novel.value?.title || '小说'} 第${chapterNo}章`
      const video = await videoStore.createVideo({ novelId, chapterId: chapter.value.id, title, artStyle: 'anime', aspectRatio: '16:9', frameRate: 24, qualityTier: 'draft', mode: 'slideshow' })
      chapterVideos.value.unshift(video)
      currentVideoId.value = video.id
      await nextTick()
      videoEditorRef.value?.generateStoryboard(prompt, pacing, duration, maxTokens, temperature, timeout, voiceMode)
    } catch (e: any) {
      toast.error('创建失败：' + (e.message || '未知错误'))
    } finally {
      generatingScript.value = false
    }
  } else {
    videoEditorRef.value?.generateStoryboard(prompt, pacing, duration, maxTokens, temperature, timeout, voiceMode)
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
    const { request } = useApi()
    const data: any = await request(`/novels/${novelId}/items?chapter_no=${chapterNo}`)
    chapterItems.value = Array.isArray(data) ? data : (data?.items ?? [])
  } catch {
    chapterItems.value = []
  } finally {
    loadingItems.value = false
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
const extractingMinorChars = ref(false)
const extractingChapterItems = ref(false)
const extractingChapterSkills = ref(false)
const extractingChapterAnchors = ref(false)

async function handleExtractMinorChars() {
  if (!chapter.value || extractingMinorChars.value) return
  extractingMinorChars.value = true
  try {
    const { request } = useApi()
    const data: any = await request(`/novels/${novelId}/chapters/${chapterNo}/characters/ai-extract`, { method: 'POST' })
    const count = data?.total ?? data?.count ?? (Array.isArray(data?.characters) ? data.characters.length : 0)
    toast.success(`提取次要角色 ${count} 个`)
    await characterStore.fetchCharacters(novelId)
  } catch (e: any) {
    toast.error('提取失败：' + (e.message || ''))
  } finally {
    extractingMinorChars.value = false
  }
}

async function handleExtractChapterItems() {
  if (!chapter.value || extractingChapterItems.value) return
  extractingChapterItems.value = true
  try {
    const { request } = useApi()
    const data: any = await request(`/novels/${novelId}/chapters/${chapterNo}/items/ai-extract`, { method: 'POST' })
    const count = data?.count ?? (Array.isArray(data?.items) ? data.items.length : 0)
    toast.success(`提取物品 ${count} 个`)
    fetchChapterItems()
  } catch (e: any) {
    toast.error('提取失败：' + (e.message || ''))
  } finally {
    extractingChapterItems.value = false
  }
}

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

async function handleExtractChapterAnchors() {
  if (!chapter.value || extractingChapterAnchors.value) return
  extractingChapterAnchors.value = true
  try {
    const { request } = useApi()
    const data: any = await request(`/novels/${novelId}/chapters/${chapterNo}/scene-anchors/ai-extract`, { method: 'POST' })
    const count = data?.total ?? (Array.isArray(data?.scene_anchors) ? data.scene_anchors.length : 0)
    toast.success(`提取场景锚点 ${count} 个`)
  } catch (e: any) {
    toast.error('提取失败：' + (e.message || ''))
  } finally {
    extractingChapterAnchors.value = false
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
})

const applyGenerated = () => {
  content.value = previewModal.content
  savedContent.value = savedContent.value // keep dirty
  previewModal.open = false
  toast.success('已应用生成内容')
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
const versions = ref<import('~/types').ChapterVersion[]>([])
const chapterApiForVersions = useChapterApi()

const loadVersions = async () => {
  if (!chapter.value) return
  try {
    const res = await chapterApiForVersions.getVersions(chapter.value.id)
    versions.value = (res as any)?.data?.versions || []
  } catch {
    versions.value = []
  }
}

const previewVersion = (v: import('~/types').ChapterVersion) => {
  previewModal.content = v.content
  previewModal.open = true
}

async function restoreVersion(version: import('~/types').ChapterVersion) {
  if (!confirm(`确认恢复到 "${version.change_type === 'pre_rewrite' ? '改写前备份' : ('版本 ' + version.id)}"？当前内容将被替换。`)) return
  try {
    let versionContent: string | undefined
    // Try dedicated version content endpoint; fall back to inline content
    try {
      const res = await chapterApiForVersions.getVersionContent(chapter.value!.id, version.id)
      versionContent = (res as any)?.data?.content ?? (res as any)?.content
    } catch {
      versionContent = version.content
    }
    if (versionContent) {
      // Push current content to undo stack before replacing
      pushToUndo(content.value)
      content.value = versionContent
      // Auto-save after restore
      await doSave()
      toast.success('版本已恢复')
    }
  } catch (e) {
    console.error('恢复版本失败', e)
    toast.error('恢复版本失败')
  }
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
        />
      </div>

      <!-- Mode toggle (centered) -->
      <div class="flex-1 flex justify-center">
        <div class="flex items-center bg-gray-100 dark:bg-gray-700/60 rounded-lg p-1 gap-1">
          <button class="px-3 py-1.5 text-sm font-medium rounded-md transition-all" :class="pageModeClass('outline')" @click="pageMode = 'outline'">大纲</button>
          <button class="px-3 py-1.5 text-sm font-medium rounded-md transition-all" :class="pageModeClass('write')" @click="pageMode = 'write'">写作</button>
          <button class="px-3 py-1.5 text-sm font-medium rounded-md transition-all" :class="pageModeClass('character')" @click="switchToCharacter">角色</button>
          <button class="px-3 py-1.5 text-sm font-medium rounded-md transition-all" :class="pageModeClass('scenes')" @click="switchToScenes">场景</button>
          <button class="px-3 py-1.5 text-sm font-medium rounded-md transition-all" :class="pageModeClass('script')" @click="switchToScript">脚本</button>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-2 flex-shrink-0">
        <span v-if="autoSaveLabel" :class="saveFailed ? 'text-xs text-red-500' : 'text-xs text-gray-400 dark:text-gray-500'">{{ autoSaveLabel }}</span>
      </div>
    </header>

    <!-- ── Body ──────────────────────────────────────────────────────────────── -->
    <div class="flex-1 flex min-h-0 overflow-hidden">

      <!-- Left: main editor / script view -->
      <main class="flex-1 min-w-0 flex flex-col overflow-hidden bg-gray-50 dark:bg-gray-900">

        <!-- ─ 大纲模式 ─ -->
        <div v-if="pageMode === 'outline'" class="h-full overflow-auto">
          <div class="max-w-2xl mx-auto px-8 py-10">
            <!-- Header row -->
            <div class="flex items-start justify-between mb-6">
              <div>
                <p class="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">第 {{ chapterNo }} 章大纲</p>
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ chapterTitle || `第${chapterNo}章` }}</h1>
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
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ chapterTitle || `第${chapterNo}章` }}</h1>
              </div>
              <!-- View mode: 编辑 button -->
              <div v-if="!writeEditMode" class="flex items-center gap-2 flex-shrink-0 mt-1">
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
                <!-- 历史版本 -->
                <button
                  class="px-1.5 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 text-xs transition-colors"
                  title="历史版本"
                  @click="showVersionHistory = !showVersionHistory"
                >📋 历史版本</button>
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
        </div>

        <!-- ─ 角色模式 ─ -->
        <div v-else-if="pageMode === 'character'" class="h-full overflow-auto">
          <div class="max-w-2xl mx-auto px-8 py-10 space-y-8">
            <!-- Active characters -->
            <div>
              <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">活跃角色</h4>
              <div v-if="getActiveCharacters().length === 0" class="text-center py-12 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                <p class="text-sm text-gray-400 dark:text-gray-500">暂无角色</p>
              </div>
              <div v-else class="grid gap-2">
                <div
                  v-for="char in getActiveCharacters()"
                  :key="char.id"
                  class="flex items-center gap-4 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors group"
                  @click="router.push(`/character/${char.id}`)"
                >
                  <div class="w-12 h-12 rounded-full flex-shrink-0 overflow-hidden bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                    <img v-if="char.three_view_sheet || char.portrait" :src="char.three_view_sheet || char.portrait" class="w-full h-full object-cover" :alt="char.name" />
                    <span v-else class="text-base font-bold text-primary-600 dark:text-primary-400">{{ char.name.charAt(0) }}</span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-gray-900 dark:text-white truncate">{{ char.name }}</p>
                    <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{{ char.three_view_sheet ? '有三视图' : '无三视图' }} · {{ char.role }}</p>
                  </div>
                  <svg class="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                  </svg>
                </div>
              </div>
            </div>
            <!-- Minor Characters -->
            <div v-if="minorCharacters.length > 0" class="border-t border-gray-200 dark:border-gray-700 pt-8">
              <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-4">次要角色</h4>
              <div class="grid gap-2">
                <div
                  v-for="char in minorCharacters"
                  :key="char.id"
                  class="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                  @click="router.push(`/character/${char.id}`)"
                >
                  <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <span class="text-xs font-bold text-gray-500 dark:text-gray-400">{{ char.name.charAt(0) }}</span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{{ char.name }}</p>
                    <p v-if="char.description" class="text-xs text-gray-400 dark:text-gray-500 truncate">{{ char.description }}</p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Items -->
            <div class="border-t border-gray-200 dark:border-gray-700 pt-8">
              <div class="flex items-center justify-between mb-4">
                <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">本章物品</h4>
                <button class="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" @click="fetchChapterItems">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                  </svg>
                </button>
              </div>
              <div v-if="loadingItems" class="flex justify-center py-8 text-gray-400">
                <svg class="w-5 h-5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
              </div>
              <div v-else-if="chapterItems.length === 0" class="text-center py-8 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                <p class="text-xs text-gray-400 dark:text-gray-500">暂无物品记录</p>
              </div>
              <div v-else class="grid gap-2">
                <div
                  v-for="item in chapterItems"
                  :key="item.id"
                  class="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                  @click="router.push(`/item/${item.id}?novelId=${novelId}`)"
                >
                  <div class="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    <img v-if="item.image_url" :src="item.image_url" class="w-full h-full object-cover" :alt="item.name" />
                    <svg v-else class="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"/>
                    </svg>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ item.name }}</p>
                    <p v-if="item.description" class="text-xs text-gray-500 dark:text-gray-400 truncate">{{ item.description }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ─ 场景管理模式 ─ -->
        <div v-else-if="pageMode === 'scenes'" class="h-full overflow-auto">
          <div class="max-w-3xl mx-auto px-8 py-10 space-y-6">

            <!-- 场景锚点库 -->
            <div class="card p-5">
              <div class="flex items-center justify-between mb-4">
                <div>
                  <h3 class="font-semibold text-gray-900 dark:text-white">场景锚点库</h3>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">锁定场景视觉描述，确保跨镜头布景一致</p>
                </div>
                <button class="btn-primary text-sm" @click="startAnchorCreate">+ 新建场景</button>
              </div>

              <!-- 新建/编辑表单 -->
              <div v-if="showAnchorForm" class="mb-5 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">场景名称 *</label>
                    <input v-model="anchorForm.name" type="text" placeholder="如：书院大厅" class="input w-full text-sm" />
                  </div>
                  <div>
                    <label class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">类型</label>
                    <select v-model="anchorForm.type" class="input w-full text-sm">
                      <option value="interior">室内</option>
                      <option value="exterior">室外</option>
                      <option value="imaginary">虚构/幻境</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">场景描述</label>
                  <textarea v-model="anchorForm.description" rows="2" placeholder="用自然语言描述场景外观、氛围…" class="input w-full text-sm resize-none" />
                </div>
                <div>
                  <label class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">锁定关键词（逗号分隔，生成时强制注入）</label>
                  <input v-model="anchorForm.prompt_lock" type="text" placeholder="ancient wooden beams, paper lanterns, warm candlelight" class="input w-full text-sm" />
                </div>
                <div class="flex gap-2 pt-1">
                  <button class="btn-primary text-sm" :disabled="savingAnchor" @click="saveAnchor">
                    {{ savingAnchor ? '保存中…' : (editingAnchorId ? '更新' : '创建') }}
                  </button>
                  <button class="btn-outline text-sm" @click="showAnchorForm = false">取消</button>
                </div>
              </div>

              <!-- 锚点列表 -->
              <div v-if="anchors.length === 0 && !showAnchorForm" class="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
                暂无场景锚点，点击「新建场景」创建，或从右侧 AI 助手中提取
              </div>
              <div class="space-y-3">
                <div
                  v-for="anchor in anchors"
                  :key="anchor.id"
                  class="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                >
                  <div class="w-16 h-12 rounded-md overflow-hidden bg-gray-100 dark:bg-gray-700 flex-shrink-0">
                    <img v-if="anchor.ref_image_url" :src="anchor.ref_image_url" class="w-full h-full object-cover" alt="" />
                    <div v-else class="w-full h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md p-1">
                      <span class="text-xs text-center text-gray-400 leading-tight">首次生成后<br>自动锁定</span>
                    </div>
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                      <span class="font-medium text-sm text-gray-900 dark:text-white truncate">{{ anchor.name }}</span>
                      <span class="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">{{ anchor.type || 'interior' }}</span>
                      <span v-if="anchor.ref_image_url" class="text-xs text-amber-600 dark:text-amber-400" title="参考图已锁定">🔒</span>
                    </div>
                    <p v-if="anchor.description" class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{{ anchor.description }}</p>
                    <p v-if="anchor.prompt_lock" class="text-xs text-blue-500 dark:text-blue-400 mt-0.5 truncate font-mono">{{ anchor.prompt_lock }}</p>
                  </div>
                  <div class="flex gap-1.5 flex-shrink-0">
                    <button class="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" @click="startAnchorEdit(anchor)">编辑</button>
                    <button class="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20" @click="deleteAnchor(anchor.id)">删除</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 分镜场景绑定（需要有分镜数据） -->
            <div v-if="chapterShots.length > 0" class="card p-5">
              <h3 class="font-semibold text-gray-900 dark:text-white mb-1">分镜场景绑定</h3>
              <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">为每个镜头指定场景锚点，生成图像时自动注入一致的布景描述</p>
              <div class="space-y-2">
                <div v-for="shot in chapterShots" :key="shot.id" class="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <span class="text-xs font-mono text-gray-500 w-12 flex-shrink-0">镜 #{{ shot.shot_no }}</span>
                  <p class="flex-1 text-xs text-gray-600 dark:text-gray-400 truncate">{{ shot.description || '—' }}</p>
                  <select
                    :value="shot.scene_anchor_id || ''"
                    class="input text-xs py-1 h-7 w-36 flex-shrink-0"
                    @change="handleSetShotAnchor(shot, ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null)"
                  >
                    <option value="">未绑定</option>
                    <option v-for="anchor in anchors" :key="anchor.id" :value="anchor.id">{{ anchor.name }}</option>
                  </select>
                  <span v-if="shot.scene_anchor_id" class="text-xs text-amber-500" title="已绑定场景锚点">🔒</span>
                </div>
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

      <!-- Right: tools panel (hidden on export tab) -->
      <aside
        v-if="!(pageMode === 'script' && videoEditorRef?.activeTab === 'export')"
        class="w-80 flex-shrink-0 flex flex-col min-h-0 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700"
      >

        <!-- Panel header -->
        <div class="flex-shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <p class="text-xs font-semibold text-gray-900 dark:text-white">
            {{
              pageMode === 'script' && videoEditorRef?.activeTab === 'timeline' ? '视频预览' :
              pageMode === 'script' && videoEditorRef?.activeTab === 'sfx' ? '音效助手' :
              pageMode === 'script' && videoEditorRef?.activeTab === 'bgm' ? '背景音乐助手' :
              pageMode === 'script' && videoEditorRef?.activeTab === 'voice' ? '配音字幕助手' :
              'AI 助手'
            }}
          </p>
          <p class="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
            {{
              pageMode === 'outline' ? '大纲' :
              pageMode === 'write' ? '写作' :
              pageMode === 'character' ? '角色' :
              pageMode === 'scenes' ? '场景' :
              videoEditorRef?.activeTab === 'timeline' ? '时间线预览' :
              videoEditorRef?.activeTab === 'sfx' ? '音效场景偏好' :
              videoEditorRef?.activeTab === 'bgm' ? '情绪偏好 & 生成' :
              videoEditorRef?.activeTab === 'voice' ? '配音模式 & 字幕' :
              '脚本'
            }}
          </p>
        </div>

        <!-- Panel content -->
        <div class="flex-1 overflow-auto">

          <!-- ── 大纲 AI ── -->
          <template v-if="pageMode === 'outline'">
            <div class="p-4 space-y-4">
              <div class="space-y-3">
                <p class="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">生成整部小说的章节大纲，包含所有章节标题和剧情提要。</p>
                <div>
                  <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">补充提示 <span class="font-normal text-gray-400">（可选）</span></label>
                  <textarea
                    v-model="prompt"
                    rows="3"
                    class="input text-sm resize-none"
                    placeholder="对大纲方向的额外要求..."
                  />
                </div>
                <!-- 高级参数 -->
                <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <button class="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" @click="showAdvancedParams = !showAdvancedParams">
                    <span>高级参数</span>
                    <svg class="w-3.5 h-3.5 transition-transform" :class="showAdvancedParams ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                  </button>
                  <div v-if="showAdvancedParams" class="px-3 pb-3 space-y-2.5 bg-gray-50 dark:bg-gray-800/50">
                    <div>
                      <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Max Tokens <span class="text-gray-400">（0 = 自动）</span></label>
                      <input v-model.number="advMaxTokens" type="number" min="0" max="32768" step="256" placeholder="0" class="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"/>
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Temperature <span class="text-gray-400">（0 = 自动）</span></label>
                      <div class="flex items-center gap-2">
                        <input v-model.number="advTemperature" type="range" min="0" max="2.0" step="0.1" class="flex-1 accent-primary-500"/>
                        <input v-model.number="advTemperature" type="number" min="0" max="2.0" step="0.1" placeholder="0" class="w-14 px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"/>
                      </div>
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">超时（秒）<span class="text-gray-400">（0 = 自动 300s）</span></label>
                      <input v-model.number="advTimeoutSeconds" type="number" min="0" max="600" step="30" placeholder="0" class="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"/>
                    </div>
                  </div>
                </div>
                <button
                  class="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-lg transition-colors"
                  :disabled="generatingNovelOutline"
                  @click="handleGenerateNovelOutline"
                >
                  <svg v-if="generatingNovelOutline" class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                  </svg>
                  <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                  </svg>
                  {{ generatingNovelOutline ? '生成中...' : '生成全小说大纲' }}
                </button>
              </div>
            </div>
          </template>

          <!-- ── 写作 AI ── -->
          <template v-else-if="pageMode === 'write'">
            <div class="p-4 space-y-4">
              <!-- Generation form -->
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
                <div class="grid grid-cols-2 gap-3">
                  <div>
                    <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
                      字数目标 <span class="font-normal text-gray-400">（0=默认）</span>
                    </label>
                    <input
                      v-model.number="wordCountOverride"
                      type="number"
                      min="0"
                      step="500"
                      class="input text-sm"
                      placeholder="3000"
                    />
                  </div>
                </div>
                <!-- 高级参数 -->
                <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <button class="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" @click="showAdvancedParams = !showAdvancedParams">
                    <span>高级参数</span>
                    <svg class="w-3.5 h-3.5 transition-transform" :class="showAdvancedParams ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                  </button>
                  <div v-if="showAdvancedParams" class="px-3 pb-3 space-y-2.5 bg-gray-50 dark:bg-gray-800/50">
                    <div>
                      <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Max Tokens <span class="text-gray-400">（0 = 自动；优先于字数目标）</span></label>
                      <input v-model.number="advMaxTokens" type="number" min="0" max="32768" step="256" placeholder="0" class="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"/>
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Temperature <span class="text-gray-400">（0 = 自动）</span></label>
                      <div class="flex items-center gap-2">
                        <input v-model.number="advTemperature" type="range" min="0" max="2.0" step="0.1" class="flex-1 accent-primary-500"/>
                        <input v-model.number="advTemperature" type="number" min="0" max="2.0" step="0.1" placeholder="0" class="w-14 px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"/>
                      </div>
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">超时（秒）<span class="text-gray-400">（0 = 自动 300s）</span></label>
                      <input v-model.number="advTimeoutSeconds" type="number" min="0" max="600" step="30" placeholder="0" class="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"/>
                    </div>
                    <div class="flex items-center justify-between pt-1">
                      <div>
                        <span class="text-xs text-gray-600 dark:text-gray-300">联网参考</span>
                        <p class="text-[10px] text-gray-400">搜索相关故事片段作为灵感（需启用 web_search 工具）</p>
                      </div>
                      <button
                        class="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
                        :class="webSearchEnabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'"
                        @click="webSearchEnabled = !webSearchEnabled"
                      >
                        <span
                          class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                          :class="webSearchEnabled ? 'translate-x-4' : ''"
                        />
                      </button>
                    </div>
                    <div class="flex items-center justify-between pt-1">
                      <div>
                        <span class="text-xs text-gray-600 dark:text-gray-300">百科知识</span>
                        <p class="text-[10px] text-gray-400">查询 Wikipedia 提升世界观准确性（需启用 wiki_search 工具）</p>
                      </div>
                      <button
                        class="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
                        :class="wikiSearchEnabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'"
                        @click="wikiSearchEnabled = !wikiSearchEnabled"
                      >
                        <span
                          class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                          :class="wikiSearchEnabled ? 'translate-x-4' : ''"
                        />
                      </button>
                    </div>
                    <div class="flex items-center justify-between pt-1">
                      <div>
                        <span class="text-xs text-gray-600 dark:text-gray-300">情节模板</span>
                        <p class="text-[10px] text-gray-400">注入逆袭/觉醒等叙事结构参考（需启用 story_pattern 工具）</p>
                      </div>
                      <button
                        class="relative w-9 h-5 rounded-full transition-colors flex-shrink-0"
                        :class="storyPatternEnabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'"
                        @click="storyPatternEnabled = !storyPatternEnabled"
                      >
                        <span
                          class="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                          :class="storyPatternEnabled ? 'translate-x-4' : ''"
                        />
                      </button>
                    </div>
                  </div>
                </div>
                <div class="flex gap-2">
                  <button
                    class="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-lg transition-colors"
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
                  <button
                    v-if="generating"
                    class="px-3 py-2.5 text-sm bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                    @click="cancelGeneration"
                  >
                    取消生成
                  </button>
                </div>
              </div>

              <!-- Quality report -->
              <div v-if="qualityReport" class="pt-4 border-t border-gray-100 dark:border-gray-700 space-y-3">
                <!-- Score card -->
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

                <!-- Issues -->
                <div v-if="qualityReport.issues.length > 0" class="space-y-1">
                  <div
                    v-for="issue in qualityReport.issues.slice(0, 4)"
                    :key="issue.description"
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

                <!-- Suggestions + one-click refine -->
                <div v-if="qualityReport.suggestions && qualityReport.suggestions.length > 0" class="space-y-2">
                  <div class="space-y-1">
                    <div
                      v-for="sg in qualityReport.suggestions"
                      :key="sg"
                      class="flex items-start gap-1.5 text-xs text-gray-600 dark:text-gray-300 leading-relaxed"
                    >
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

                <!-- Refined content preview panel -->
                <div v-if="showRefinedPreview && refinedContent" class="border border-blue-200 dark:border-blue-700 rounded-xl overflow-hidden">
                  <div class="flex items-center justify-between px-3 py-2 bg-blue-50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-700">
                    <span class="text-xs font-semibold text-blue-700 dark:text-blue-300">✨ AI精修预览</span>
                    <span class="text-[10px] text-blue-400">{{ refinedContent.length.toLocaleString() }} 字</span>
                  </div>
                  <div class="p-3 max-h-64 overflow-y-auto text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap bg-white dark:bg-gray-800">{{ refinedContent }}</div>
                  <div class="flex gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-600">
                    <button
                      class="flex-1 py-1.5 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                      @click="acceptRefinement"
                    >采纳</button>
                    <button
                      class="flex-1 py-1.5 text-xs font-medium bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:hover:bg-gray-500 text-gray-700 dark:text-gray-200 rounded-lg transition-colors"
                      @click="discardRefinement"
                    >丢弃</button>
                  </div>
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

              <!-- Import panel -->
              <div class="pt-3 border-t border-gray-100 dark:border-gray-700">
                <button
                  class="w-full flex items-center justify-between py-1 text-xs font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
                  @click="showImportPanel = !showImportPanel"
                >
                  <span>导入文本</span>
                  <svg class="w-3 h-3 transition-transform" :class="showImportPanel ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                  </svg>
                </button>
                <div v-if="showImportPanel" class="mt-2 space-y-2">
                  <textarea
                    v-model="importText"
                    rows="6"
                    class="input text-xs resize-none"
                    placeholder="粘贴章节正文，点击导入后将替换当前内容..."
                  />
                  <button
                    :disabled="!importText.trim()"
                    class="w-full py-1.5 text-xs font-medium bg-gray-600 hover:bg-gray-700 disabled:opacity-40 text-white rounded-lg transition-colors"
                    @click="handleImportContent"
                  >导入</button>
                </div>
              </div>
            </div>
          </template>

          <!-- ── 角色 AI ── -->
          <template v-else-if="pageMode === 'character'">
            <div class="p-4 space-y-4">
              <div v-if="chapter" class="space-y-3">
                <div class="flex items-center justify-between mb-3">
                  <div>
                    <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">角色状态快照</h4>
                    <p class="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">保存角色在本章的状态</p>
                  </div>
                  <button
                    type="button"
                    class="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
                    :class="updateCharSnapshots ? 'bg-purple-500' : 'bg-gray-200 dark:bg-gray-600'"
                    @click="updateCharSnapshots = !updateCharSnapshots"
                  >
                    <span
                      class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                      :class="updateCharSnapshots ? 'translate-x-4' : 'translate-x-0'"
                    />
                  </button>
                </div>
                <template v-if="updateCharSnapshots">
                  <div class="flex gap-2 mb-3">
                    <button type="button" class="flex-1 py-1.5 text-xs rounded-lg border-2 transition-colors"
                      :class="snapshotMode === 'generate' ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'"
                      @click="snapshotMode = 'generate'">重新生成</button>
                    <button type="button" class="flex-1 py-1.5 text-xs rounded-lg border-2 transition-colors"
                      :class="snapshotMode === 'reuse' ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300' : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300'"
                      @click="snapshotMode = 'reuse'">复用上章</button>
                  </div>
                  <p class="text-xs text-gray-400 dark:text-gray-500 mb-3 leading-relaxed">
                    {{ snapshotMode === 'generate' ? '结合本章内容和上章状态，AI 重新生成角色状态' : '直接将上一章的角色状态复制到本章' }}
                  </p>
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-xs text-gray-500 dark:text-gray-400">选择角色</span>
                    <button type="button" class="text-xs text-purple-600 dark:text-purple-400 hover:underline"
                      @click="toggleAllCharacters(selectedCharacterIds.length < characters.length)">
                      {{ selectedCharacterIds.length < characters.length ? '全选' : '取消全选' }}
                    </button>
                  </div>
                  <div class="space-y-1 mb-3 max-h-40 overflow-y-auto">
                    <label v-for="char in characters" :key="char.id"
                      class="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer">
                      <input type="checkbox" :value="char.id" v-model="selectedCharacterIds"
                        class="rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                      <div class="w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                        <span class="text-xs font-bold text-purple-600 dark:text-purple-400">{{ char.name.charAt(0) }}</span>
                      </div>
                      <span class="text-xs text-gray-700 dark:text-gray-300 truncate">{{ char.name }}</span>
                    </label>
                    <p v-if="characters.length === 0" class="text-xs text-gray-400 text-center py-2">暂无角色</p>
                  </div>
                  <p v-if="snapshotMsg" class="text-xs text-green-600 dark:text-green-400 mb-2">✓ {{ snapshotMsg }}</p>
                  <button type="button"
                    :disabled="syncingSnapshots || selectedCharacterIds.length === 0"
                    class="w-full py-2 text-xs font-medium bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg transition-colors flex items-center justify-center gap-1.5"
                    @click="handleSyncSnapshots">
                    <svg v-if="syncingSnapshots" class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                    </svg>
                    {{ syncingSnapshots ? '更新中...' : `更新 ${selectedCharacterIds.length} 个角色状态` }}
                  </button>
                </template>
              </div>

              <!-- 高级参数 -->
              <div class="pt-4 border-t border-gray-100 dark:border-gray-700">
                <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <button class="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" @click="showAdvancedParams = !showAdvancedParams">
                    <span>高级参数</span>
                    <svg class="w-3.5 h-3.5 transition-transform" :class="showAdvancedParams ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                  </button>
                  <div v-if="showAdvancedParams" class="px-3 pb-3 space-y-2.5 bg-gray-50 dark:bg-gray-800/50">
                    <div>
                      <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Max Tokens <span class="text-gray-400">（0 = 自动）</span></label>
                      <input v-model.number="advMaxTokens" type="number" min="0" max="32768" step="256" placeholder="0" class="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"/>
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Temperature <span class="text-gray-400">（0 = 自动）</span></label>
                      <div class="flex items-center gap-2">
                        <input v-model.number="advTemperature" type="range" min="0" max="2.0" step="0.1" class="flex-1 accent-primary-500"/>
                        <input v-model.number="advTemperature" type="number" min="0" max="2.0" step="0.1" placeholder="0" class="w-14 px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"/>
                      </div>
                    </div>
                    <div>
                      <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">超时（秒）<span class="text-gray-400">（0 = 自动 300s）</span></label>
                      <input v-model.number="advTimeoutSeconds" type="number" min="0" max="600" step="30" placeholder="0" class="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"/>
                    </div>
                  </div>
                </div>
              </div>

              <!-- AI 本章提取 -->
              <div class="pt-4 border-t border-gray-100 dark:border-gray-700 space-y-2">
                <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">AI 本章提取</h4>
                <button
                  :disabled="extractingMinorChars || !chapter?.content"
                  class="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors disabled:opacity-50"
                  @click="handleExtractMinorChars"
                >
                  <svg v-if="extractingMinorChars" class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                  <svg v-else class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                  {{ extractingMinorChars ? '提取中...' : '提取次要角色' }}
                </button>
                <button
                  :disabled="extractingChapterItems || !chapter?.content"
                  class="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-medium text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-colors disabled:opacity-50"
                  @click="handleExtractChapterItems"
                >
                  <svg v-if="extractingChapterItems" class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                  <svg v-else class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                  {{ extractingChapterItems ? '提取中...' : '提取物品' }}
                </button>
              </div>

            </div>
          </template>

          <!-- ── 场景管理 AI ── -->
          <template v-else-if="pageMode === 'scenes'">
            <div class="p-4 space-y-3">
              <p class="text-xs text-gray-400 dark:text-gray-500 leading-relaxed">从本章内容中 AI 提取场景，或手动创建场景锚点以确保视觉一致性。</p>
              <!-- 高级参数 -->
              <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <button class="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors" @click="showAdvancedParams = !showAdvancedParams">
                  <span>高级参数</span>
                  <svg class="w-3.5 h-3.5 transition-transform" :class="showAdvancedParams ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                </button>
                <div v-if="showAdvancedParams" class="px-3 pb-3 space-y-2.5 bg-gray-50 dark:bg-gray-800/50">
                  <div>
                    <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Max Tokens <span class="text-gray-400">（0 = 自动）</span></label>
                    <input v-model.number="advMaxTokens" type="number" min="0" max="32768" step="256" placeholder="0" class="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"/>
                  </div>
                  <div>
                    <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Temperature <span class="text-gray-400">（0 = 自动）</span></label>
                    <div class="flex items-center gap-2">
                      <input v-model.number="advTemperature" type="range" min="0" max="2.0" step="0.1" class="flex-1 accent-primary-500"/>
                      <input v-model.number="advTemperature" type="number" min="0" max="2.0" step="0.1" placeholder="0" class="w-14 px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"/>
                    </div>
                  </div>
                  <div>
                    <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">超时（秒）<span class="text-gray-400">（0 = 自动 300s）</span></label>
                    <input v-model.number="advTimeoutSeconds" type="number" min="0" max="600" step="30" placeholder="0" class="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"/>
                  </div>
                </div>
              </div>
              <button
                :disabled="extractingChapterAnchors || !chapter?.content"
                class="w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-teal-600 dark:text-teal-400 border border-teal-200 dark:border-teal-700 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg transition-colors disabled:opacity-50"
                @click="handleExtractChapterAnchors"
              >
                <svg v-if="extractingChapterAnchors" class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                {{ extractingChapterAnchors ? 'AI 提取中...' : 'AI 提取场景锚点' }}
              </button>
            </div>
          </template>

          <!-- ── 脚本 AI ── -->
          <template v-else-if="pageMode === 'script'">

            <!-- ── 视频预览（时间线 tab 激活时）：接收 VideoEditor 内 Teleport 传送的播放器 ── -->
            <div v-if="videoEditorRef?.activeTab === 'timeline'" id="timeline-player-slot" />

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
                  预计约 <span class="font-medium text-gray-600 dark:text-gray-300">{{ scriptEstimatedShots }}</span> 个镜头
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
              <!-- 高级参数（折叠） -->
              <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <button
                  class="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  @click="showScriptAdvancedParams = !showScriptAdvancedParams"
                >
                  <span>高级参数</span>
                  <svg class="w-3.5 h-3.5 transition-transform" :class="showScriptAdvancedParams ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div v-if="showScriptAdvancedParams" class="px-3 pb-3 space-y-2.5 bg-gray-50 dark:bg-gray-800/50">
                  <!-- Max Tokens -->
                  <div>
                    <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Max Tokens <span class="text-gray-400">（0 = 自动）</span>
                    </label>
                    <input
                      v-model.number="scriptMaxTokens"
                      type="number" min="0" max="32768" step="256"
                      placeholder="0"
                      class="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"
                    />
                  </div>
                  <!-- Temperature -->
                  <div>
                    <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Temperature <span class="text-gray-400">（0 = 自动 0.1）</span>
                    </label>
                    <div class="flex items-center gap-2">
                      <input
                        v-model.number="scriptTemperature"
                        type="range" min="0" max="2.0" step="0.1"
                        class="flex-1 accent-primary-500"
                      />
                      <input
                        v-model.number="scriptTemperature"
                        type="number" min="0" max="2.0" step="0.1"
                        placeholder="0"
                        class="w-14 px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"
                      />
                    </div>
                  </div>
                  <!-- Timeout -->
                  <div>
                    <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      超时（秒）<span class="text-gray-400">（0 = 自动 300s）</span>
                    </label>
                    <input
                      v-model.number="scriptTimeoutSeconds"
                      type="number" min="0" max="600" step="30"
                      placeholder="0"
                      class="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"
                    />
                  </div>
                </div>
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
        <div class="bg-white dark:bg-gray-800 rounded-xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl">
          <div class="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h3 class="font-semibold text-lg text-gray-900 dark:text-white">生成预览</h3>
            <div class="flex gap-2">
              <button
                class="px-4 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm transition-colors"
                @click="applyGenerated"
              >
                使用此内容
              </button>
              <button
                class="px-4 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                @click="previewModal.open = false"
              >
                放弃
              </button>
            </div>
          </div>
          <div class="overflow-y-auto p-6 text-sm leading-relaxed whitespace-pre-wrap flex-1 text-gray-800 dark:text-gray-200">
            {{ previewModal.content }}
          </div>
          <div class="px-6 py-3 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
            字数：{{ countWords(previewModal.content) }} 字
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- 历史版本侧边栏 -->
  <Teleport to="body">
    <Transition name="slide-right">
      <div v-if="showVersionHistory" class="fixed right-0 top-0 bottom-0 w-80 bg-white dark:bg-gray-800 shadow-xl z-40 flex flex-col border-l border-gray-200 dark:border-gray-700">
        <div class="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h3 class="font-semibold text-gray-900 dark:text-white">历史版本</h3>
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" @click="showVersionHistory = false">✕</button>
        </div>
        <div class="overflow-y-auto flex-1 p-4 space-y-2">
          <div v-if="versions.length === 0" class="text-sm text-gray-400 dark:text-gray-500 text-center py-8">暂无历史版本</div>
          <div
            v-for="v in versions"
            :key="v.id"
            class="p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <div class="cursor-pointer" @click="previewVersion(v)">
              <div class="text-xs text-gray-500 dark:text-gray-400">{{ formatDate(v.created_at) }}</div>
              <div class="text-sm mt-1 text-gray-800 dark:text-gray-200">{{ v.change_type === 'pre_rewrite' ? '改写前备份' : v.change_type }}</div>
              <div class="text-xs text-gray-400 dark:text-gray-500 mt-1">{{ countWords(v.content) }} 字</div>
            </div>
            <div class="flex gap-2 mt-2">
              <button
                @click="previewVersion(v)"
                class="text-xs px-2 py-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600 rounded"
              >预览</button>
              <button
                @click="restoreVersion(v)"
                aria-label="恢复此版本"
                class="text-xs px-2 py-1 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900 rounded"
              >恢复</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
