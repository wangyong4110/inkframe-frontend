<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const novelId = parseInt(route.params.id as string)
const chapterNo = parseInt(route.params.chapterNo as string)
if (isNaN(novelId)) {
  router.replace('/novel')
}

const chapterStore = useChapterStore()
const novelStore = useNovelStore()
const characterStore = useCharacterStore()
const videoStore = useVideoStore()
const toast = useToast()

const saving = ref(false)
const generating = ref(false)

// ── 页面模式 ──────────────────────────────────────────────────────────────────
type PageMode = 'outline' | 'write' | 'character' | 'script'
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
})

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
    const video = await videoStore.createVideo(
      novelId,
      chapter.value.id,
      title,
      storyboardForm.value.art_style,
      storyboardForm.value.aspect_ratio,
      24,
      storyboardForm.value.quality_tier,
    )
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
const prompt = ref('')
const wordCountOverride = ref(0)

// LLM 模型
const llmProviders = ref<{ name: string; display_name: string }[]>([])
const selectedLLMProvider = ref('')
const selectedScriptProvider = ref('')

async function fetchLLMProviders() {
  try {
    const modelApi = useModelApi()
    const res = await modelApi.getLLMCapableProviders()
    llmProviders.value = res.data ?? []
  } catch {
    llmProviders.value = []
  }
}

onMounted(async () => {
  fetchLLMProviders()
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
  }
  // Restore tab from URL query
  const tabParam = route.query.tab as string | undefined
  if (tabParam === 'script') {
    await switchToScript()
  } else if (tabParam === 'character') {
    switchToCharacter()
  } else if (tabParam === 'write' || tabParam === 'outline') {
    pageMode.value = tabParam as PageMode
  }
})

// ── 大纲编辑（需在保存块之前声明，供 isDirty / doSave 引用）─────────────────
const outlineEditMode = ref(false)
const outlineEditText = ref('')

// ── 保存 & 自动保存 ───────────────────────────────────────────────────────────
const isDirty = computed(() =>
  content.value !== (chapter.value?.content || '') ||
  chapterTitle.value !== (chapter.value?.title || '') ||
  (outlineEditMode.value && outlineEditText.value !== (chapter.value?.outline || ''))
)

useUnsavedGuard(isDirty, '章节有未保存的修改，确认离开？')

const { lastSavedAt, autoSaving } = useAutosave(
  () => doSave(),
  [content, chapterTitle, outlineEditText],
)

const autoSaveLabel = computed(() => {
  if (autoSaving.value) return '保存中...'
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
})

async function doSave() {
  if (!chapter.value) return
  const updates: Record<string, any> = {
    title: chapterTitle.value,
    content: content.value,
    word_count: countWords(content.value),
  }
  if (outlineEditMode.value) {
    updates.outline = outlineEditText.value
  }
  await chapterStore.updateChapter(novelId, chapter.value.chapter_no, updates)
}

async function handleSave() {
  if (!chapter.value) return
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
  if (!chapter.value) return
  const currentChapterNo = chapter.value.chapter_no
  generating.value = true
  try {
    const maxTokens = wordCountOverride.value > 0 ? wordCountOverride.value * 2 : undefined
    const { task_id } = await chapterStore.generateChapter(novelId, currentChapterNo, prompt.value, maxTokens, selectedLLMProvider.value || undefined)
    toast.info('AI 正在生成，请稍候...')
    const result = await chapterStore.pollChapterGenTask(novelId, task_id)
    content.value = result.content || ''
    if (wordCountOverride.value > 0) chapterStore.wordCountGoal = wordCountOverride.value
    toast.success('内容生成完成')
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || '未知错误'))
  } finally {
    generating.value = false
  }
}

async function handleCheckQuality() {
  if (!chapter.value) return
  await chapterStore.checkQuality(chapter.value.id)
  // Reset selections when re-running check
  selectedSuggestions.value = new Set()
  refinedContent.value = ''
}

// ── 质量改进 ──────────────────────────────────────────────────────────────────
const selectedSuggestions = ref<Set<string>>(new Set())
const refining = ref(false)
const refinedContent = ref('')

function toggleSuggestion(sg: string) {
  if (selectedSuggestions.value.has(sg)) {
    selectedSuggestions.value.delete(sg)
  } else {
    selectedSuggestions.value.add(sg)
  }
  selectedSuggestions.value = new Set(selectedSuggestions.value)
}

function selectAllSuggestions() {
  const all = qualityReport.value?.suggestions ?? []
  selectedSuggestions.value = new Set(all)
}

async function handleApplyImprovements() {
  if (!chapter.value || selectedSuggestions.value.size === 0) return
  refining.value = true
  refinedContent.value = ''
  try {
    const api = useQualityApi()
    const resp = await api.refineChapter(chapter.value.id, Array.from(selectedSuggestions.value))
    refinedContent.value = resp.data?.content ?? ''
  } catch (e: any) {
    alert('AI精修失败：' + (e.message ?? '未知错误'))
  } finally {
    refining.value = false
  }
}

async function acceptRefinement() {
  if (!chapter.value || !refinedContent.value) return
  await chapterStore.updateChapter(novelId, chapter.value.chapter_no, { content: refinedContent.value })
  refinedContent.value = ''
  selectedSuggestions.value = new Set()
}

function countWords(text: string): number {
  return text.length
}

function getActiveCharacters(): any[] {
  if (!chapter.value) return []
  return characters.value.filter((c: any) => c.role !== 'minor')
}

// ── 大纲编辑 ──────────────────────────────────────────────────────────────────
const generatingOutline = ref(false)
const savingOutline = ref(false)

function startEditOutline() {
  outlineEditText.value = chapter.value?.outline || ''
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

async function handleGenerateOutline() {
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
      outlineEditText.value = chapter.value?.outline || ''
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

function switchToCharacter() {
  pageMode.value = 'character'
  if (chapterItems.value.length === 0) fetchChapterItems()
}

// currentVideoId: null = empty state, number = show VideoEditor
const currentVideoId = ref<number | null>(null)
const videoEditorRef = ref<any>(null)
const generatingScript = ref(false)

async function switchToScript() {
  pageMode.value = 'script'
  if (chapterVideos.value.length === 0) await fetchChapterVideos()
  if (currentVideoId.value === null && chapterVideos.value.length > 0) {
    currentVideoId.value = chapterVideos.value[0].id
  }
}

async function handleGenerateScript() {
  if (!chapter.value) return
  if (!currentVideoId.value) {
    // Auto-create project with defaults, then generate
    generatingScript.value = true
    try {
      const title = `${novel.value?.title || '小说'} 第${chapterNo}章`
      const video = await videoStore.createVideo(novelId, chapter.value.id, title, 'anime', '16:9', 24, 'draft')
      chapterVideos.value.unshift(video)
      currentVideoId.value = video.id
      await nextTick()
      videoEditorRef.value?.generateStoryboard()
    } catch (e: any) {
      toast.error('创建失败：' + (e.message || '未知错误'))
    } finally {
      generatingScript.value = false
    }
  } else {
    videoEditorRef.value?.generateStoryboard()
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
import type { PlotPoint } from '~/types'
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
          <button class="px-3 py-1.5 text-sm font-medium rounded-md transition-all" :class="pageModeClass('script')" @click="switchToScript">脚本</button>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex items-center gap-2 flex-shrink-0">
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-lg transition-colors"
          :disabled="saving"
          @click="handleSave"
        >
          <svg v-if="saving" class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          <svg v-else-if="!isDirty" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
          </svg>
          <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"/>
          </svg>
          {{ saving ? '保存中' : '保存' }}
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
            <!-- Header row -->
            <div class="flex items-start justify-between mb-6">
              <div>
                <p class="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2">第 {{ chapterNo }} 章大纲</p>
                <h1 class="text-2xl font-bold text-gray-900 dark:text-white">{{ chapterTitle || `第${chapterNo}章` }}</h1>
              </div>
              <!-- Actions: view mode -->
              <div v-if="!outlineEditMode" class="flex items-center gap-2 flex-shrink-0 mt-1">
                <button
                  v-if="chapter?.outline"
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
                  class="flex items-center gap-1.5 px-3 py-1.5 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 border border-purple-200 dark:border-purple-700 rounded-lg transition-colors disabled:opacity-60"
                  :disabled="generatingOutline"
                  @click="handleGenerateOutline"
                >
                  <svg v-if="generatingOutline" class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                  </svg>
                  <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                  </svg>
                  {{ generatingOutline ? 'AI 生成中...' : '重新生成' }}
                </button>
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
                  {{ savingOutline ? '保存中' : '保存大纲' }}
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
              <!-- View: has outline -->
              <p v-else-if="chapter?.outline" class="text-base text-gray-700 dark:text-gray-300 leading-8 whitespace-pre-wrap">{{ chapter.outline }}</p>
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

            <!-- ─ 剧情点管理 ─ -->
            <div class="mt-8">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-widest">剧情点</h3>
                <div class="flex items-center gap-2">
                  <button
                    class="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-700 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-lg transition-colors disabled:opacity-50"
                    :disabled="extractingPlotPoints || !chapter?.content"
                    @click="handleExtractPlotPoints"
                  >
                    <svg v-if="extractingPlotPoints" class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                    </svg>
                    <svg v-else class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                    </svg>
                    {{ extractingPlotPoints ? 'AI 提取中...' : 'AI 提取' }}
                  </button>
                  <button
                    class="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    :disabled="loadingPlotPoints"
                    @click="loadPlotPoints"
                    title="刷新"
                  >
                    <svg class="w-3.5 h-3.5" :class="{ 'animate-spin': loadingPlotPoints }" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                    </svg>
                  </button>
                </div>
              </div>

              <!-- loading -->
              <div v-if="loadingPlotPoints" class="flex items-center justify-center py-6">
                <svg class="w-5 h-5 animate-spin text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
              </div>

              <!-- empty state -->
              <div v-else-if="plotPoints.length === 0" class="py-8 text-center border border-dashed border-gray-200 dark:border-gray-700 rounded-xl">
                <p class="text-sm text-gray-400 dark:text-gray-500 mb-3">暂无剧情点</p>
                <p class="text-xs text-gray-300 dark:text-gray-600">点击 <span class="font-medium text-purple-500">AI 提取</span> 自动识别</p>
              </div>

              <!-- list -->
              <div v-else class="space-y-2">
                <div
                  v-for="pp in plotPoints"
                  :key="pp.id"
                  class="flex items-start gap-3 bg-white dark:bg-gray-800 border rounded-lg px-3 py-2.5 transition-colors"
                  :class="pp.is_resolved ? 'border-gray-100 dark:border-gray-800 opacity-60' : 'border-gray-200 dark:border-gray-700'"
                >
                  <span
                    class="flex-shrink-0 mt-0.5 text-xs font-medium px-1.5 py-0.5 rounded"
                    :class="plotPointTypeBadgeClass[pp.type] ?? 'bg-gray-100 text-gray-600'"
                  >{{ plotPointTypeLabel[pp.type] ?? pp.type }}</span>
                  <p class="flex-1 text-sm text-gray-700 dark:text-gray-300 leading-relaxed" :class="{ 'line-through text-gray-400': pp.is_resolved }">
                    {{ pp.description }}
                  </p>
                  <div class="flex items-center gap-1 flex-shrink-0">
                    <button
                      v-if="!pp.is_resolved"
                      class="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                      title="标记为已解决"
                      @click="handleResolvePlotPoint(pp)"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
                      </svg>
                    </button>
                    <button
                      class="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      title="删除"
                      @click="handleDeletePlotPoint(pp.id)"
                    >
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div class="mt-10 pt-6 border-t border-gray-200 dark:border-gray-700">
              <button class="text-sm text-primary-600 dark:text-primary-400 hover:underline" @click="pageMode = 'write'">→ 开始写作</button>
            </div>
          </div>
        </div>

        <!-- ─ 写作模式 ─ -->
        <div v-else-if="pageMode === 'write'" class="h-full overflow-auto">
          <div class="max-w-2xl mx-auto px-8 py-10 min-h-full">
            <p class="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-8">
              第 {{ chapterNo }} 章
            </p>
            <textarea
              v-model="content"
              class="w-full min-h-[60vh] resize-none bg-transparent border-none outline-none text-gray-900 dark:text-white text-base leading-8 placeholder-gray-300 dark:placeholder-gray-600 focus:ring-0"
              placeholder="开始写作..."
            />
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
                    <img v-if="char.three_view_front || char.portrait" :src="char.three_view_front || char.portrait" class="w-full h-full object-cover" :alt="char.name" />
                    <span v-else class="text-base font-bold text-primary-600 dark:text-primary-400">{{ char.name.charAt(0) }}</span>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-semibold text-gray-900 dark:text-white truncate">{{ char.name }}</p>
                    <p class="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{{ char.three_view_front ? '有三视图' : '无三视图' }} · {{ char.role }}</p>
                  </div>
                  <svg class="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                  </svg>
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

        <!-- ─ 脚本模式 ─ -->
        <div v-else-if="pageMode === 'script'" class="h-full overflow-auto">
          <!-- Video editor -->
          <div v-if="currentVideoId" class="px-8 py-6">
            <VideoEditor ref="videoEditorRef" :video-id="currentVideoId" :llm-provider="selectedScriptProvider" />
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

      <!-- Right: tools panel -->
      <aside class="w-80 flex-shrink-0 flex flex-col min-h-0 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700">

        <!-- Panel header -->
        <div class="flex-shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <p class="text-xs font-semibold text-gray-900 dark:text-white">AI 助手</p>
          <p class="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
            {{ pageMode === 'outline' ? '大纲' : pageMode === 'write' ? '写作' : pageMode === 'character' ? '角色' : '脚本' }}
          </p>
        </div>

        <!-- Panel content -->
        <div class="flex-1 overflow-auto">

          <!-- ── 大纲 / 写作 AI ── -->
          <template v-if="pageMode === 'outline' || pageMode === 'write'">
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
                  <div>
                    <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">AI 模型</label>
                    <select v-model="selectedLLMProvider" class="input text-sm">
                      <option value="">默认</option>
                      <option v-for="p in llmProviders" :key="p.name" :value="p.name">
                        {{ p.display_name || p.name }}
                      </option>
                    </select>
                  </div>
                </div>
                <button
                  class="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-medium bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-lg transition-colors"
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

              <!-- Quality report -->
              <div v-if="qualityReport" class="pt-4 border-t border-gray-100 dark:border-gray-700 space-y-3">
                <!-- Score header -->
                <div class="flex items-center justify-between">
                  <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">质量报告</h4>
                  <div class="flex items-center gap-2">
                    <span class="text-sm font-bold" :class="qualityReport.overall_score >= 0.8 ? 'text-green-600' : qualityReport.overall_score >= 0.6 ? 'text-amber-500' : 'text-red-500'">
                      {{ (qualityReport.overall_score * 100).toFixed(0) }}分
                    </span>
                    <button class="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" @click="handleCheckQuality">重新检查</button>
                  </div>
                </div>
                <div class="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all"
                    :style="{ width: `${qualityReport.overall_score * 100}%` }"
                    :class="qualityReport.overall_score >= 0.8 ? 'bg-green-500' : qualityReport.overall_score >= 0.6 ? 'bg-amber-500' : 'bg-red-500'"
                  />
                </div>

                <!-- Issues -->
                <div v-if="qualityReport.issues.length > 0" class="space-y-1.5">
                  <div
                    v-for="issue in qualityReport.issues.slice(0, 4)"
                    :key="issue.description"
                    class="px-3 py-2 rounded-lg text-xs leading-relaxed"
                    :class="{
                      'bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300': issue.severity === 'high',
                      'bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300': issue.severity === 'medium',
                      'bg-gray-50 text-gray-700 dark:bg-gray-700/50 dark:text-gray-300': issue.severity === 'low',
                    }"
                  >{{ issue.description }}</div>
                </div>

                <!-- Suggestions with checkboxes -->
                <div v-if="qualityReport.suggestions && qualityReport.suggestions.length > 0" class="space-y-2">
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-semibold text-gray-500 dark:text-gray-400">改进建议</span>
                    <button class="text-[10px] text-blue-500 hover:text-blue-700" @click="selectAllSuggestions">全选</button>
                  </div>
                  <label
                    v-for="sg in qualityReport.suggestions"
                    :key="sg"
                    class="flex items-start gap-2 cursor-pointer group"
                  >
                    <input
                      type="checkbox"
                      :checked="selectedSuggestions.has(sg)"
                      class="mt-0.5 rounded border-gray-300 text-blue-600 shrink-0"
                      @change="toggleSuggestion(sg)"
                    />
                    <span class="text-xs text-gray-600 dark:text-gray-300 leading-relaxed group-hover:text-gray-900 dark:group-hover:text-gray-100">{{ sg }}</span>
                  </label>

                  <!-- Apply button -->
                  <button
                    :disabled="selectedSuggestions.size === 0 || refining"
                    class="w-full py-1.5 text-xs rounded-lg transition-colors disabled:opacity-40"
                    :class="selectedSuggestions.size > 0 && !refining ? 'bg-blue-600 text-white hover:bg-blue-700' : 'bg-gray-100 text-gray-400 dark:bg-gray-700'"
                    @click="handleApplyImprovements"
                  >
                    <span v-if="refining">AI精修中...</span>
                    <span v-else>应用所选建议 ({{ selectedSuggestions.size }})</span>
                  </button>
                </div>

                <!-- Refined content preview -->
                <div v-if="refinedContent" class="space-y-2 border border-blue-200 dark:border-blue-700 rounded-lg p-3 bg-blue-50 dark:bg-blue-900/20">
                  <div class="flex items-center justify-between">
                    <span class="text-xs font-semibold text-blue-700 dark:text-blue-300">AI精修预览</span>
                    <button class="text-[10px] text-gray-400 hover:text-gray-600" @click="refinedContent = ''">取消</button>
                  </div>
                  <div class="text-xs text-gray-700 dark:text-gray-300 leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap">{{ refinedContent.slice(0, 400) }}{{ refinedContent.length > 400 ? '...' : '' }}</div>
                  <button
                    class="w-full py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    @click="acceptRefinement"
                  >接受并替换原文</button>
                </div>
              </div>

              <!-- Quick check CTA -->
              <button
                v-if="!qualityReport"
                class="w-full py-2 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 border border-dashed border-gray-200 dark:border-gray-600 rounded-lg transition-colors hover:border-gray-300"
                @click="handleCheckQuality"
              >运行质量检查</button>
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

            </div>
          </template>

          <!-- ── 脚本 AI ── -->
          <template v-else-if="pageMode === 'script'">
            <div class="p-4 space-y-4">
              <!-- LLM model selector -->
              <div v-if="llmProviders.length > 0">
                <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">分镜模型</label>
                <select v-model="selectedScriptProvider" class="input text-sm">
                  <option value="">默认</option>
                  <option v-for="p in llmProviders" :key="p.name" :value="p.name">
                    {{ p.display_name || p.name }}
                  </option>
                </select>
                <p class="text-[10px] text-gray-400 dark:text-gray-500 mt-1">用于生成文字分镜脚本</p>
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
                {{ generatingScript ? '创建中…' : videoStore.generating ? '生成中…' : '生成分镜脚本' }}
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
      <span v-if="autoSaveLabel" class="text-xs text-gray-400 dark:text-gray-500 ml-auto flex-shrink-0">{{ autoSaveLabel }}</span>
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
</template>
