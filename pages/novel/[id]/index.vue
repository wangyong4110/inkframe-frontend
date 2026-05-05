<script setup lang="ts">
import type { Novel, Chapter, Character, AIModel, Worldview, Item } from '~/types'
const { openLightbox } = useImageLightbox()
import { useItemApi, useCharacterApi } from '~/composables/useApi'
import { useSkillApi, SKILL_CATEGORIES, SKILL_TYPES, type Skill } from '~/composables/useSkillApi'
import { WRITING_PRESETS, IMAGE_PRESETS, useStyleApi } from '~/composables/useStylePresets'
import type { AnalysisStatus } from '~/composables/useApi'

const route = useRoute()
const router = useRouter()
const novelId = parseInt(route.params.id as string)
if (isNaN(novelId)) {
  router.replace('/novel')
}

const novelStore = useNovelStore()
const chapterStore = useChapterStore()
const characterStore = useCharacterStore()
const videoStore = useVideoStore()
const toast = useToast()
const styleApi = useStyleApi()

const validTabKeys = new Set(['chapters', 'characters', 'items', 'skills', 'worldview', 'plot_points', 'scene_anchors', 'settings'])
const initialTab = route.query.tab as string
const activeTab = ref(validTabKeys.has(initialTab) ? initialTab : 'chapters')
const tabSectionRef = ref<HTMLElement | null>(null)

function switchTab(key: string) {
  activeTab.value = key
  if (key === 'chapters') chapterPage.value = 1
  router.replace({ query: { ...route.query, tab: key } })
  nextTick(() => {
    tabSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}
const showChapterModal = ref(false)
const showCharacterModal = ref(false)
const generatingOutline = ref(false)
const chapterPage = ref(1)
const CHAPTER_PAGE_SIZE = 20
const generatingCharacters = ref(false)
const batchGeneratingCharImages = ref(false)
const extractingItems = ref(false)
const batchGeneratingItemImages = ref(false)
const extractingPlotPoints = ref(false)
const batchGeneratingAnchorImages = ref(false)
const showDeleteNovelConfirm = ref(false)
const showDeleteChapterConfirm = ref(false)
const showDirPicker = ref(false)
const chapterToDelete = ref<Chapter | null>(null)
const showDeleteCharacterConfirm = ref(false)
const characterToDelete = ref<Character | null>(null)

// ── 完善小说信息弹窗 ─────────────────────────────────────────────────────────
const showNovelInfoModal = ref(false)
const descExpanded = ref(false)
const novelInfoForm = ref({
  title: '',
  genre: '',
  description: '',
  target_word_count: 0,
  target_chapters: 0,
})
const savingNovelInfo = ref(false)

const genreOptions = [
  '现代言情','古代言情','幻想言情','历史','军事','科幻','游戏','游戏竞技',
  '玄幻奇幻','都市','奇闻异事','武侠仙侠','体育','N次元','文学艺术',
  '人文社科','经管励志','经典文学','出版小说','少儿教育','衍生言情',
  '现实题材','现实主义',
]

const wordCountOptions = [
  { value: 0,   label: '不限' },
  { value: 30,  label: '30万以下' },
  { value: 50,  label: '30万-50万' },
  { value: 100, label: '50万-100万' },
  { value: 200, label: '100万-200万' },
  { value: 201, label: '200万以上' },
]

// Settings tab — icon, word count, chapter count options (create-form style)
const iconOptions = [
  { value: 'purple', gradient: 'linear-gradient(135deg,#8B5CF6,#3B82F6)' },
  { value: 'blue',   gradient: 'linear-gradient(135deg,#3B82F6,#06B6D4)' },
  { value: 'green',  gradient: 'linear-gradient(135deg,#10B981,#84CC16)' },
  { value: 'orange', gradient: 'linear-gradient(135deg,#F59E0B,#EF4444)' },
  { value: 'red',    gradient: 'linear-gradient(135deg,#EF4444,#EC4899)' },
  { value: 'pink',   gradient: 'linear-gradient(135deg,#EC4899,#8B5CF6)' },
  { value: 'teal',   gradient: 'linear-gradient(135deg,#14B8A6,#3B82F6)' },
  { value: 'indigo', gradient: 'linear-gradient(135deg,#6366F1,#8B5CF6)' },
  { value: 'amber',  gradient: 'linear-gradient(135deg,#F59E0B,#84CC16)' },
  { value: 'cyan',   gradient: 'linear-gradient(135deg,#06B6D4,#10B981)' },
]
function iconGradient(value: string | undefined) {
  return iconOptions.find(o => o.value === value)?.gradient ?? 'linear-gradient(135deg,#8B5CF6,#3B82F6)'
}
const settingsWCOptions = [
  { label: '5万字',   value: 50000 },
  { label: '10万字',  value: 100000 },
  { label: '30万字',  value: 300000 },
  { label: '50万字',  value: 500000 },
  { label: '100万字', value: 1000000 },
]
const settingsCCOptions = [
  { label: '30章',  value: 30 },
  { label: '50章',  value: 50 },
  { label: '100章', value: 100 },
  { label: '200章', value: 200 },
  { label: '300章', value: 300 },
]

function openNovelInfoModal() {
  const n = novel.value
  if (!n) return
  novelInfoForm.value = {
    title:            n.title ?? '',
    genre:            n.genre ?? '',
    description:      n.description ?? '',
    target_word_count:(n as any).target_word_count ?? 0,
    target_chapters:  (n as any).target_chapters ?? 0,
  }
  showNovelInfoModal.value = true
}

async function saveNovelInfo() {
  if (!novelInfoForm.value.title.trim()) {
    toast.error('小说名称不能为空')
    return
  }
  savingNovelInfo.value = true
  try {
    await novelStore.updateNovel(novelId, {
      title:             novelInfoForm.value.title.trim(),
      genre:             novelInfoForm.value.genre,
      description:       novelInfoForm.value.description.trim(),
      target_word_count: novelInfoForm.value.target_word_count,
      target_chapters:   novelInfoForm.value.target_chapters,
    } as any)
    toast.success('小说信息已保存')
    showNovelInfoModal.value = false
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || ''))
  } finally {
    savingNovelInfo.value = false
  }
}

// 创建小说节点是否完成：需有描述
const novelInfoComplete = computed(() => {
  const n = novel.value
  if (!n) return false
  return !!(n.description?.trim())
})

// Style selection state
const selectedWritingPreset = ref(WRITING_PRESETS[0]?.id ?? '')
const applyingWritingPreset = ref(false)

// AI model lists per task type (loaded async; silently ignored if API unavailable)
const availableModels = ref<AIModel[]>([])
const imageModels = ref<AIModel[]>([])
const videoModels = ref<AIModel[]>([])
const ttsModels = ref<AIModel[]>([])

const videoTypes = [
  {
    value: 'narration',
    label: '图片解说',
    icon: '🖼️',
    desc: '静态图片 + 旁白/字幕，成本低、易批量生产',
  },
  {
    value: 'animation',
    label: '动画',
    icon: '🎬',
    desc: 'AI 生成连续动画帧，画面更生动',
  },
]

const NARRATION_FALLBACK_VOICES = [
  { id: 'nova',    label: 'Nova — 女声·活泼' },
  { id: 'shimmer', label: 'Shimmer — 女声·温柔' },
  { id: 'echo',    label: 'Echo — 男声·磁性' },
  { id: 'onyx',    label: 'Onyx — 男声·低沉' },
  { id: 'fable',   label: 'Fable — 男声·权威' },
  { id: 'alloy',   label: 'Alloy — 中性·平衡' },
]
const narrationVoiceGroups = computed(() => {
  if (ttsModels.value.length === 0)
    return [{ key: 'openai', label: 'OpenAI', voices: NARRATION_FALLBACK_VOICES }]
  const map: Record<string, { key: string; label: string; voices: { id: string; label: string }[] }> = {}
  for (const m of ttsModels.value) {
    const key = m.provider?.name ?? 'unknown'
    const label = m.provider?.display_name ?? key
    if (!map[key]) map[key] = { key, label, voices: [] }
    map[key].voices.push({ id: m.name, label: m.display_name || m.name })
  }
  return Object.values(map)
})

const novel = computed(() => novelStore.currentNovel)
const chapters = computed(() => chapterStore.chapters)
const novelChapterCount = computed(() => chapters.value.length)
const chapterTotalPages = computed(() => Math.max(1, Math.ceil(chapters.value.length / CHAPTER_PAGE_SIZE)))
const pagedChapters = computed(() => {
  const start = (chapterPage.value - 1) * CHAPTER_PAGE_SIZE
  return chapters.value.slice(start, start + CHAPTER_PAGE_SIZE)
})
const novelTotalWords = computed(() => chapters.value.reduce((sum, c) => sum + (c.word_count ?? 0), 0))
const completedChapterCount = computed(() => chapters.value.filter(c => c.status === 'completed' || c.status === 'published').length)
const chapterProgress = computed(() => {
  const target = novel.value?.target_chapters ?? 0
  if (!target) return completedChapterCount.value > 0 ? 100 : 0
  return Math.min(100, Math.round((completedChapterCount.value / target) * 100))
})
const completedVideoCount = computed(() => videoStore.videos.filter(v => v.status === 'completed').length)
const videoProgress = computed(() => {
  const total = novelChapterCount.value
  if (!total) return 0
  return Math.min(100, Math.round((completedVideoCount.value / total) * 100))
})
const characters = computed(() => characterStore.characters)

// Worldview list for linking
const worldviewList = ref<{ id: number; name: string }[]>([])
const linkingWorldview = ref(false)
const generatingWorldview = ref(false)
const linkedWorldview = ref<Worldview | null>(null)
const linkedWorldviewLoading = ref(false)

async function fetchLinkedWorldview(wvId: number) {
  linkedWorldviewLoading.value = true
  try {
    const resp = await useWorldviewApi().getWorldview(wvId)
    linkedWorldview.value = resp.data
  } catch { /* ignore */ } finally {
    linkedWorldviewLoading.value = false
  }
}

// 切到世界观 Tab 时加载；worldview_id 变化时重新加载/清空
watch(activeTab, (tab) => {
  if (tab === 'worldview' && novel.value?.worldview_id && !linkedWorldview.value) {
    fetchLinkedWorldview(novel.value.worldview_id)
  }
})
watch(() => novel.value?.worldview_id, (id) => {
  if (id) {
    fetchLinkedWorldview(id)
  } else {
    linkedWorldview.value = null
  }
})

// Initialize selectedWritingPreset from novel data when available
watch(() => novelStore.currentNovel?.image_style, (v) => {
  if (v && !selectedWritingPreset.value) {
    // image_style drives the image picker directly
  }
}, { immediate: true })

async function handleWritingPresetSelect(presetId: string) {
  selectedWritingPreset.value = presetId
  const preset = WRITING_PRESETS.find(p => p.id === presetId)
  if (!preset) return
  applyingWritingPreset.value = true
  try {
    const prompt = await styleApi.buildWritingPrompt(preset.config)
    await novelStore.updateNovel(novelId, { style_prompt: prompt })
    toast.success(`已应用写作风格「${preset.name}」`)
  } catch {
    // silently fall back — style_prompt not updated, preset still visually selected
  } finally {
    applyingWritingPreset.value = false
  }
}

function handleImageStyleSelect(styleId: string) {
  novelStore.updateNovel(novelId, { image_style: styleId }).then(() => {
    const preset = IMAGE_PRESETS.find(p => p.id === styleId)
    if (preset) toast.success(`已应用画面风格「${preset.name}」`)
  }).catch((e: any) => {
    toast.error('保存画面风格失败：' + (e.message || ''))
  })
}

// ── 场景锚点 tab ──────────────────────────────────────────────────────────────
const sceneAnchorStore = useSceneAnchorStore()
const showAnchorModal = ref(false)
const editingAnchor = ref<any | null>(null)
const anchorForm = ref({
  name: '',
  type: 'exterior' as string,
  description: '',
  prompt_lock: '',
  style_tokens: '',
  notes: '',
  variant: '',
  parent_anchor_id: undefined as number | undefined,
})
const savingAnchor = ref(false)
const extractingAnchors = ref(false)
const extractingAllAnchors = ref(false)
const extractAllProgress = ref({ current: 0, total: 0 })
const selectedChapterForExtract = ref<number | 'all'>('all')
const expandedAnchorId = ref<number | null>(null)
const anchorConsistencyLogs = ref<Record<number, any[]>>({})
const generatingRefImage = ref<Record<number, boolean>>({})

function startAnchorCreate() {
  editingAnchor.value = null
  anchorForm.value = { name: '', type: 'exterior', description: '', prompt_lock: '', style_tokens: '', notes: '', variant: '', parent_anchor_id: undefined }
  showAnchorModal.value = true
}

function startAnchorEdit(anchor: any) {
  router.push(`/scene-anchor/${anchor.id}?novelId=${novelId}`)
}

async function saveAnchor() {
  if (!anchorForm.value.name) { toast.error('请输入场景名称'); return }
  savingAnchor.value = true
  try {
    const created = await sceneAnchorStore.createAnchor(novelId, anchorForm.value)
    showAnchorModal.value = false
    toast.success('场景已创建，跳转到详情页编辑…')
    router.push(`/scene-anchor/${created.id}?novelId=${novelId}`)
  } catch (e: any) {
    toast.error(e.message || '创建失败')
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

async function extractAnchors() {
  if (selectedChapterForExtract.value === 'all') {
    await extractAllAnchors()
    return
  }
  const chapter = chapterStore.chapters.find(c => c.id === selectedChapterForExtract.value)
  if (!chapter?.content) { toast.error('所选章节无内容'); return }
  extractingAnchors.value = true
  try {
    const novel = novelStore.currentNovel
    const added = await sceneAnchorStore.extractAnchors(novelId, chapter.content, novel?.title)
    toast.success(`已提取 ${added.length} 个新场景锚点`)
  } catch (e: any) {
    toast.error(e.message || '提取失败')
  } finally {
    extractingAnchors.value = false
  }
}

// AI 批量提取全部章节的场景锚点（后端异步任务，自动去重）
async function extractAllAnchors() {
  extractingAllAnchors.value = true
  try {
    const api = useSceneAnchorApi()
    const res = await api.aiExtractFromNovel(novelId)
    const taskId = (res as any)?.task_id ?? (res as any)?.data?.task_id
    taskStore.trackTask(taskId, async (task) => {
      extractingAllAnchors.value = false
      if (task?.status === 'failed') {
        toast.error('场景锚点提取失败：' + (task.error || '未知错误'))
        return
      }
      await sceneAnchorStore.fetchAnchors(novelId)
      toast.success('场景锚点提取完成')
    })
  } catch (e: any) {
    extractingAllAnchors.value = false
    toast.error('提取失败：' + (e.message || ''))
  }
}

async function toggleAnchorExpand(anchor: any) {
  if (expandedAnchorId.value === anchor.id) {
    expandedAnchorId.value = null
    return
  }
  expandedAnchorId.value = anchor.id
  if (!anchorConsistencyLogs.value[anchor.id]) {
    try {
      const api = useSceneAnchorApi()
      const logs = await api.getConsistencyLogs(anchor.id)
      anchorConsistencyLogs.value[anchor.id] = logs
    } catch {
      anchorConsistencyLogs.value[anchor.id] = []
    }
  }
}

async function generateRefImage(anchor: any) {
  generatingRefImage.value[anchor.id] = true
  try {
    await sceneAnchorStore.generateRefImage(anchor.id)
    toast.success('参考图已生成')
  } catch (e: any) {
    toast.error(e.message || '生成失败')
  } finally {
    generatingRefImage.value[anchor.id] = false
  }
}

function anchorScoreColor(score: number) {
  if (score >= 0.85) return 'text-green-600'
  if (score >= 0.70) return 'text-amber-500'
  return 'text-red-500'
}

const tabs = [
  { key: 'chapters', label: '章节', icon: 'book-open' },
  { key: 'characters', label: '角色', icon: 'users' },
  { key: 'items', label: '物品', icon: 'archive' },
  { key: 'skills', label: '技能', icon: 'zap' },
  { key: 'worldview', label: '世界观', icon: 'globe' },
  { key: 'plot_points', label: '剧情点', icon: 'flag' },
  { key: 'scene_anchors', label: '场景', icon: 'map-pin' },
  { key: 'settings', label: '设置', icon: 'settings' },
]


onMounted(async () => {
  await Promise.all([
    novelStore.fetchNovel(novelId),
    chapterStore.fetchChapters(novelId),
    characterStore.fetchCharacters(novelId),
    videoStore.fetchVideos({ novel_id: novelId }),
    sceneAnchorStore.fetchAnchors(novelId),
  ])
  // Auto-trigger analysis when coming from the import/create page.
  // Remove the query params immediately to prevent re-triggering on refresh.
  if (route.query.analysis_task_id) {
    // Backend already started analysis — just resume polling, don't start a new one
    const existingTaskId = route.query.analysis_task_id as string
    const { analysis_task_id: _tid, ...restQuery } = route.query
    router.replace({ query: restQuery })
    analysisTaskId.value = existingTaskId
    localStorage.setItem(`analysis_task_${novelId}`, existingTaskId)
    analysisStatus.value = { status: 'running', progress: 0, step: '分析中...' }
    startAnalysisPoll()
  } else if (route.query.analyze === '1') {
    const sourceVal = route.query.source as string | undefined
    const { analyze: _a, source: _s, ...restQuery } = route.query
    router.replace({ query: restQuery })
    await triggerAnalysis(sourceVal)
  } else {
    // 页面刷新后从 localStorage 恢复进行中的分析任务
    const storedTaskId = localStorage.getItem(`analysis_task_${novelId}`)
    if (storedTaskId) {
      try {
        const resp = await useTaskApi().getTask(storedTaskId)
        const task = (resp as any).data
        const status: AnalysisStatus = { status: task.status, progress: task.progress, step: task.data?.step || '', error: task.error || '', warnings: task.data?.warnings || [] }
        if (status.status === 'running' || status.status === 'pending') {
          analysisTaskId.value = storedTaskId
          analysisStatus.value = status
          startAnalysisPoll()
        } else {
          // 已结束，清除记录（completed 时自动 reload 会清掉，这里兜底）
          localStorage.removeItem(`analysis_task_${novelId}`)
        }
      } catch {
        localStorage.removeItem(`analysis_task_${novelId}`)
      }
    }
  }
  // Load AI models and worldview list (non-critical, silent fail)
  try {
    const modelApi = useModelApi()
    const taskTypes = ['chapter', 'image_gen', 'video_gen', 'voice_gen'] as const
    const [wvResp, ...modelResps] = await Promise.allSettled([
      useWorldviewApi().getWorldviews({ page_size: 100 }),
      ...taskTypes.map(t => modelApi.getAvailableModels(t)),
    ])
    if (wvResp.status === 'fulfilled') {
      worldviewList.value = ((wvResp.value as any).data?.items ?? []).map((w: Worldview) => ({ id: w.id, name: w.name }))
    }
    taskTypes.forEach((t, i) => {
      const r = modelResps[i]
      if (r.status === 'fulfilled') {
        const models = ((r.value as any).data as AIModel[]).filter((m: AIModel) => m.is_active && m.is_available)
        if (t === 'chapter') availableModels.value = models
        else if (t === 'image_gen') imageModels.value = models
        else if (t === 'video_gen') videoModels.value = models
        else if (t === 'voice_gen') ttsModels.value = models
      }
    })
  } catch { /* non-critical */ }
})

function goToChapter(chapter: Chapter) {
  router.push(`/novel/${novelId}/chapter/${chapter.chapter_no}`)
}

function goToCharacter(character: Character) {
  router.push(`/character/${character.id}`)
}

async function handleGenerateOutline() {
  if (!novel.value) return
  generatingOutline.value = true
  try {
    await novelStore.generateOutline(novelId, 10)
    toast.success('大纲生成完成')
  } catch (e: any) {
    toast.error('大纲生成失败：' + (e.message || '未知错误'))
  } finally {
    generatingOutline.value = false
  }
}

const characterApi = useCharacterApi()
const itemApiForAI = useItemApi()
const taskStore = useTaskStore()

async function handleAICharacters() {
  generatingCharacters.value = true
  try {
    const res = await characterApi.aiBatchGenerate(novelId)
    const taskId = (res as any)?.data?.task_id ?? (res as any)?.task_id
    taskStore.trackTask(taskId, async (task) => {
      generatingCharacters.value = false
      if (task?.status === 'failed') {
        toast.error('角色生成失败：' + (task.error || '未知错误'))
        return
      }
      await characterStore.fetchCharacters(novelId)
      toast.success('角色已生成/更新')
    })
  } catch (e: any) {
    generatingCharacters.value = false
    toast.error('生成失败：' + (e.message || ''))
  }
}

async function handleAIItems() {
  extractingItems.value = true
  try {
    const res = await itemApiForAI.aiExtract(novelId)
    const taskId = (res as any)?.data?.task_id ?? (res as any)?.task_id
    taskStore.trackTask(taskId, async (task) => {
      extractingItems.value = false
      if (task?.status === 'failed') {
        toast.error('物品提取失败：' + (task.error || '未知错误'))
        return
      }
      await fetchItems()
      toast.success('物品已提取/更新')
    })
  } catch (e: any) {
    extractingItems.value = false
    toast.error('提取失败：' + (e.message || ''))
  }
}

async function handleBatchCharacterImages() {
  batchGeneratingCharImages.value = true
  try {
    const res = await characterApi.batchGenerateImages(novelId)
    const taskId = (res as any)?.data?.task_id ?? (res as any)?.task_id
    taskStore.trackTask(taskId, async (task) => {
      batchGeneratingCharImages.value = false
      if (task?.status === 'failed') {
        toast.error('批量生成图片失败：' + (task.error || '未知错误'))
        return
      }
      const result = task?.result as any
      toast.success(`角色图片生成完成：成功 ${result?.succeeded ?? 0} / 失败 ${result?.failed ?? 0}`)
      await characterStore.fetchCharacters(novelId)
    })
  } catch (e: any) {
    batchGeneratingCharImages.value = false
    toast.error('批量生成失败：' + (e.message || ''))
  }
}

async function handleBatchItemImages() {
  batchGeneratingItemImages.value = true
  try {
    const res = await itemApiForAI.batchGenerateImages(novelId)
    const taskId = (res as any)?.data?.task_id ?? (res as any)?.task_id
    taskStore.trackTask(taskId, async (task) => {
      batchGeneratingItemImages.value = false
      if (task?.status === 'failed') {
        toast.error('批量生成图片失败：' + (task.error || '未知错误'))
        return
      }
      const result = task?.result as any
      toast.success(`物品图片生成完成：成功 ${result?.succeeded ?? 0} / 失败 ${result?.failed ?? 0}`)
      await fetchItems()
    })
  } catch (e: any) {
    batchGeneratingItemImages.value = false
    toast.error('批量生成失败：' + (e.message || ''))
  }
}

async function handleBatchAnchorImages() {
  batchGeneratingAnchorImages.value = true
  try {
    const anchorApi = useSceneAnchorApi()
    const res = await anchorApi.batchGenerateRefImages(novelId)
    const taskId = (res as any)?.data?.task_id ?? (res as any)?.task_id
    taskStore.trackTask(taskId, async (task) => {
      batchGeneratingAnchorImages.value = false
      if (task?.status === 'failed') {
        toast.error('批量生成参考图失败：' + (task.error || '未知错误'))
        return
      }
      const result = task?.result as any
      toast.success(`场景参考图生成完成：成功 ${result?.succeeded ?? 0} / 失败 ${result?.failed ?? 0}`)
      await sceneAnchorStore.fetchAnchors(novelId)
    })
  } catch (e: any) {
    batchGeneratingAnchorImages.value = false
    toast.error('批量生成失败：' + (e.message || ''))
  }
}

async function handleAIPlotPoints() {
  extractingPlotPoints.value = true
  try {
    const res = await plotPointApi.aiExtractFromNovel(novelId)
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

async function confirmDeleteNovel() {
  try {
    await novelStore.deleteNovel(novelId)
    toast.success('项目已删除')
    router.push('/novel')
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || '未知错误'))
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
    await chapterStore.deleteChapter(novelId, chapterToDelete.value.chapter_no)
    toast.success('章节已删除')
    chapterToDelete.value = null
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || '未知错误'))
  }
}

function handleDeleteCharacter(event: MouseEvent, character: Character) {
  event.stopPropagation()
  characterToDelete.value = character
  showDeleteCharacterConfirm.value = true
}

async function confirmDeleteCharacter() {
  if (!characterToDelete.value) return
  try {
    await characterStore.deleteCharacter(characterToDelete.value.id)
    toast.success('角色已删除')
    characterToDelete.value = null
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || '未知错误'))
  }
}

async function handleGenerateWorldview() {
  if (!novel.value || generatingWorldview.value) return
  generatingWorldview.value = true
  try {
    const worldviewApi = useWorldviewApi()
    const resp = await worldviewApi.generateWorldview({ novel_id: novelId, genre: novel.value.genre || 'fantasy' })
    const newWv = (resp as any).data as Worldview
    await novelStore.updateNovel(novelId, { worldview_id: newWv.id })
    // 更新下拉列表
    const wvResp = await worldviewApi.getWorldviews({ page_size: 100 })
    worldviewList.value = ((wvResp as any).data?.items ?? []).map((w: Worldview) => ({ id: w.id, name: w.name }))
    toast.success(novel.value.worldview_id ? '世界观已 AI 更新' : 'AI 世界观生成成功')
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || ''))
  } finally {
    generatingWorldview.value = false
  }
}

async function linkWorldview(worldviewId: number | null) {
  linkingWorldview.value = true
  try {
    await novelStore.updateNovel(novelId, { worldview_id: worldviewId ?? undefined })
    toast.success(worldviewId ? '世界观已关联' : '世界观已解除关联')
  } catch (e: any) {
    toast.error('操作失败：' + (e.message || ''))
  } finally {
    linkingWorldview.value = false
  }
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    generating: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-green-100 text-green-800',
    published: 'bg-blue-100 text-blue-800',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: '草稿',
    generating: '生成中',
    completed: '已完成',
    published: '已发布',
  }
  return labels[status] || status
}

function getRoleColor(role: string): string {
  const colors: Record<string, string> = {
    protagonist: 'bg-red-100 text-red-800',
    antagonist: 'bg-purple-100 text-purple-800',
    supporting: 'bg-blue-100 text-blue-800',
    minor: 'bg-gray-100 text-gray-800',
  }
  return colors[role] || 'bg-gray-100 text-gray-800'
}

function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    protagonist: '主角',
    antagonist: '反派',
    supporting: '配角',
    minor: '路人',
  }
  return labels[role] || role
}

// ── Analysis Panel ──────────────────────────────────────────────────────────
const analysisApi = useAnalysisApi()
const analysisTaskId = ref('')
const analysisStatus = ref<AnalysisStatus | null>(null)
let analysisPollTimer: ReturnType<typeof setInterval> | null = null

const showAnalysisPanel = computed(() => {
  if (analysisStatus.value) return true
  const n = novel.value
  return !!(n && !n.worldview_id && n.chapter_count > 0)
})

async function triggerAnalysis(source?: string) {
  try {
    const createOutlines = (source ?? route.query.source) === 'ai'
    const resp = await analysisApi.startAnalysis(novelId, createOutlines ? { create_chapter_outlines: true } : undefined)
    analysisTaskId.value = (resp as any).data?.task_id ?? ''
    if (analysisTaskId.value) {
      localStorage.setItem(`analysis_task_${novelId}`, analysisTaskId.value)
    }
    analysisStatus.value = { status: 'running', progress: 0, step: '准备中...' }
    startAnalysisPoll()
  } catch (e: any) {
    toast.error('启动分析失败：' + (e.message || ''))
  }
}

function startAnalysisPoll() {
  if (analysisPollTimer) return
  analysisPollTimer = setInterval(async () => {
    if (!analysisTaskId.value) return
    try {
      const resp = await useTaskApi().getTask(analysisTaskId.value)
      const task = (resp as any).data
      analysisStatus.value = { status: task.status, progress: task.progress, step: task.data?.step || '', error: task.error || '', warnings: task.data?.warnings || [] }
      if (analysisStatus.value.status === 'completed' || analysisStatus.value.status === 'failed') {
        stopAnalysisPoll()
        localStorage.removeItem(`analysis_task_${novelId}`)
        if (analysisStatus.value.status === 'completed') {
          // 刷新所有数据后重新加载页面
          await Promise.all([
            novelStore.fetchNovel(novelId),
            characterStore.fetchCharacters(novelId),
          ])
          fetchItems()
          window.location.reload()
        } else {
          toast.error('AI 分析失败：' + (analysisStatus.value.error || '未知错误'))
        }
      }
    } catch { /* ignore transient errors */ }
  }, 2000)
}

function stopAnalysisPoll() {
  if (analysisPollTimer) {
    clearInterval(analysisPollTimer)
    analysisPollTimer = null
  }
}

onUnmounted(() => stopAnalysisPoll())

// ── Items Tab ────────────────────────────────────────────────────────────────
const itemApi = useItemApi()
const items = ref<Item[]>([])
const itemsLoading = ref(false)
const showItemModal = ref(false)
const deletingItemId = ref<number | null>(null)
const newItemForm = ref({ name: '', category: 'other' as Item['category'], description: '' })
const savingItem = ref(false)

async function fetchItems() {
  itemsLoading.value = true
  try {
    const resp = await itemApi.listItems(novelId)
    items.value = (resp as any).data ?? []
  } catch { /* ignore */ } finally {
    itemsLoading.value = false
  }
}

watch(activeTab, (tab) => {
  if (tab === 'items' && items.value.length === 0 && !itemsLoading.value) {
    fetchItems()
  }
})

async function createItem() {
  if (!newItemForm.value.name.trim()) return
  savingItem.value = true
  try {
    const resp = await itemApi.createItem(novelId, {
      name: newItemForm.value.name.trim(),
      category: newItemForm.value.category,
      description: newItemForm.value.description.trim(),
    })
    items.value.push((resp as any).data)
    newItemForm.value = { name: '', category: 'other', description: '' }
    showItemModal.value = false
    toast.success('物品已创建')
  } catch (e: any) {
    toast.error('创建失败：' + (e.message || ''))
  } finally {
    savingItem.value = false
  }
}

async function deleteItem(id: number, event: Event) {
  event.stopPropagation()
  deletingItemId.value = id
  try {
    await itemApi.deleteItem(id)
    items.value = items.value.filter(i => i.id !== id)
    toast.success('物品已删除')
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || ''))
  } finally {
    deletingItemId.value = null
  }
}

function getItemCategoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    weapon: '武器', armor: '防具', treasure: '宝物', artifact: '法器',
    tool: '工具', document: '文书', consumable: '消耗品', other: '其他',
  }
  return labels[cat] || cat
}

function getItemCategoryIcon(cat: string): string {
  const icons: Record<string, string> = {
    weapon: '⚔️', armor: '🛡️', treasure: '💎', artifact: '🔮',
    tool: '🔧', document: '📜', consumable: '🧪', other: '📦',
  }
  return icons[cat] || '📦'
}

function getItemCategoryColor(cat: string): string {
  const colors: Record<string, string> = {
    weapon:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    armor:     'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    treasure:  'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    artifact:  'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    tool:      'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    document:  'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    consumable:'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    other:     'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  }
  return colors[cat] || 'bg-gray-100 text-gray-600'
}

function getItemRarity(item: Item): { label: string; color: string } | null {
  try {
    const data = JSON.parse(item.abilities || '{}')
    const map: Record<string, { label: string; color: string }> = {
      common:    { label: '普通', color: 'bg-gray-100 text-gray-600' },
      uncommon:  { label: '优良', color: 'bg-green-100 text-green-700' },
      rare:      { label: '稀有', color: 'bg-blue-100 text-blue-700' },
      epic:      { label: '史诗', color: 'bg-purple-100 text-purple-700' },
      legendary: { label: '传说', color: 'bg-yellow-100 text-yellow-700' },
    }
    return data.rarity ? (map[data.rarity] ?? null) : null
  } catch { return null }
}

function getItemStatusDot(status: string): string {
  const dots: Record<string, string> = {
    active: 'bg-green-400', lost: 'bg-yellow-400',
    destroyed: 'bg-red-400', unknown: 'bg-gray-400',
  }
  return dots[status] || 'bg-gray-400'
}

// ── Skills Tab ────────────────────────────────────────────────────────────────
const skillApi = useSkillApi()
const skills = ref<Skill[]>([])
const skillsLoading = ref(false)
const showSkillModal = ref(false)
const showAdvancedAI = ref(false)
const showVideoConfig = ref(false)
const deletingSkillId = ref<number | null>(null)
const generatingSkills = ref(false)
const savingSkill = ref(false)
const newSkillForm = ref({
  name: '',
  category: '武技',
  skill_type: 'active',
  realm: '',
  description: '',
})

async function fetchSkills() {
  skillsLoading.value = true
  try {
    const resp = await skillApi.listSkills(novelId)
    skills.value = resp.skills ?? []
  } catch { /* ignore */ } finally {
    skillsLoading.value = false
  }
}

watch(activeTab, (tab) => {
  if (tab === 'skills' && skills.value.length === 0 && !skillsLoading.value) {
    fetchSkills()
  }
})

// ── 剧情点 ─────────────────────────────────────────────────────────────────────
import type { PlotPoint } from '~/types'
const plotPoints = ref<PlotPoint[]>([])
const plotPointsLoading = ref(false)
const plotPointApi = usePlotPointApi()
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
    const data = await plotPointApi.listByNovel(novelId, { page, page_size: plotPointsPageSize })
    plotPoints.value = data.data?.plot_points ?? []
    plotPointsTotal.value = data.data?.total ?? 0
  } catch { /* ignore */ } finally {
    plotPointsLoading.value = false
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

watch(activeTab, (tab) => {
  if (tab === 'plot_points' && plotPoints.value.length === 0 && !plotPointsLoading.value) {
    fetchPlotPoints()
  }
})


async function createSkill() {
  if (!newSkillForm.value.name.trim()) return
  savingSkill.value = true
  try {
    const skill = await skillApi.createSkill(novelId, {
      name: newSkillForm.value.name.trim(),
      category: newSkillForm.value.category,
      skill_type: newSkillForm.value.skill_type,
      realm: newSkillForm.value.realm.trim(),
      description: newSkillForm.value.description.trim(),
    })
    skills.value.push(skill)
    newSkillForm.value = { name: '', category: '武技', skill_type: 'active', realm: '', description: '' }
    showSkillModal.value = false
    toast.success('技能已创建')
  } catch (e: any) {
    toast.error('创建失败：' + (e.message || ''))
  } finally {
    savingSkill.value = false
  }
}

async function deleteSkill(id: number, event: Event) {
  event.stopPropagation()
  deletingSkillId.value = id
  try {
    await skillApi.deleteSkill(id)
    skills.value = skills.value.filter(s => s.id !== id)
    toast.success('技能已删除')
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || ''))
  } finally {
    deletingSkillId.value = null
  }
}

async function generateSkills() {
  generatingSkills.value = true
  try {
    const resp = await skillApi.generateSkills(novelId, { count: 5 })
    const generated = resp.skills ?? []
    skills.value.push(...generated)
    toast.success(`已生成 ${generated.length} 个技能`)
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || ''))
  } finally {
    generatingSkills.value = false
  }
}

function getSkillCategoryColor(cat: string): string {
  const colors: Record<string, string> = {
    武技: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    法术: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    身法: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    心法: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    阵法: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    神通: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    秘法: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
    特性: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  }
  return colors[cat] || 'bg-gray-100 text-gray-600'
}

function getSkillCategoryGradient(cat: string): string {
  const g: Record<string, string> = {
    武技: 'from-red-500 to-orange-500',
    法术: 'from-blue-500 to-indigo-500',
    身法: 'from-green-500 to-teal-500',
    心法: 'from-purple-500 to-violet-500',
    阵法: 'from-yellow-500 to-amber-500',
    神通: 'from-indigo-500 to-blue-600',
    秘法: 'from-pink-500 to-rose-500',
    特性: 'from-gray-500 to-slate-600',
  }
  return g[cat] || 'from-gray-400 to-gray-500'
}

function getSkillCategoryIcon(cat: string): string {
  const icons: Record<string, string> = {
    武技: '⚔️', 法术: '✨', 身法: '💨', 心法: '🧘',
    阵法: '⬡', 神通: '🌟', 秘法: '🔮', 特性: '🔑',
  }
  return icons[cat] || '⚡'
}

function getSkillTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    active: '主动', passive: '被动', toggle: '切换', ultimate: '绝技',
  }
  return labels[type] || type
}

function getSkillTypeColor(type: string): string {
  const colors: Record<string, string> = {
    active: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    passive: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',
    toggle: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
    ultimate: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  }
  return colors[type] || 'bg-gray-100 text-gray-600'
}

function getSkillStatusColor(status: string): string {
  const colors: Record<string, string> = {
    sealed: 'bg-purple-100 text-purple-700', lost: 'bg-yellow-100 text-yellow-700',
    disabled: 'bg-gray-100 text-gray-500',
  }
  return colors[status] || ''
}

function getSkillStatusLabel(status: string): string {
  const labels: Record<string, string> = { sealed: '封印', lost: '失传', disabled: '禁用' }
  return labels[status] || status
}
</script>

<template>
  <div class="space-y-6">
    <!-- Novel Header -->
    <div v-if="novel" class="card">
      <div class="p-6">
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {{ novel.title }}
            </h1>
            <div class="mb-4">
              <p class="text-gray-500 dark:text-gray-400"
                 :class="{ 'line-clamp-3': !descExpanded }">
                {{ novel.description || '暂无描述' }}
              </p>
              <button v-if="novel.description && novel.description.length > 80"
                      class="text-xs text-primary-500 hover:text-primary-600 mt-1"
                      @click="descExpanded = !descExpanded">
                {{ descExpanded ? '收起' : '展开' }}
              </button>
            </div>
            <div class="flex flex-wrap items-center gap-3 mb-3">
              <span class="tag tag-primary">{{ novel.genre }}</span>
              <span class="text-sm text-gray-500 dark:text-gray-400">
                {{ novelChapterCount }} 章
              </span>
              <span class="text-sm text-gray-500 dark:text-gray-400">
                {{ novelTotalWords.toLocaleString() }} 字
              </span>
            </div>

            <!-- 整体进度 -->
            <div class="space-y-2">
              <!-- 章节进度 -->
              <div>
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs text-gray-500 dark:text-gray-400">章节进度</span>
                  <span class="text-xs text-gray-500 dark:text-gray-400">
                    {{ completedChapterCount }} / {{ novel.target_chapters || novelChapterCount }} 章
                    <span class="ml-1 font-medium text-gray-700 dark:text-gray-300">{{ chapterProgress }}%</span>
                  </span>
                </div>
                <div class="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all duration-500"
                    :class="chapterProgress >= 100 ? 'bg-green-500' : 'bg-purple-500'"
                    :style="{ width: `${chapterProgress}%` }"
                  />
                </div>
              </div>
              <!-- 视频进度 -->
              <div>
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs text-gray-500 dark:text-gray-400">视频进度</span>
                  <span class="text-xs text-gray-500 dark:text-gray-400">
                    {{ completedVideoCount }} / {{ novelChapterCount }} 章
                    <span class="ml-1 font-medium text-gray-700 dark:text-gray-300">{{ videoProgress }}%</span>
                  </span>
                </div>
                <div class="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all duration-500"
                    :class="videoProgress >= 100 ? 'bg-green-500' : 'bg-orange-500'"
                    :style="{ width: `${videoProgress}%` }"
                  />
                </div>
              </div>
            </div>
          </div>
          <div class="flex items-center space-x-2">
            <NuxtLink :to="`/import?novel_id=${novel?.id}`" class="btn-secondary">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              导入章节
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>

    <!-- AI 分析面板 -->
    <div v-if="novel && showAnalysisPanel" class="card p-5 border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20">
      <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <span class="font-semibold text-blue-800 dark:text-blue-200">AI 分析小说内容</span>
        </div>
        <button
          class="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-blue-300 dark:border-blue-600 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800/40 transition-colors disabled:opacity-50"
          :disabled="analysisStatus?.status === 'pending' || analysisStatus?.status === 'running'"
          @click="triggerAnalysis()"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          重新分析
        </button>
      </div>
      <p class="text-sm text-blue-700 dark:text-blue-300 mb-4">
        从导入的章节中自动提取角色、物品、技能、世界观、剧情点、场景锚点，并生成故事大纲、项目设置和章节大纲，将小说转化为可编辑的创作项目
      </p>

      <!-- 空闲状态：显示启动按钮 -->
      <div v-if="!analysisStatus">
        <button class="btn-primary" @click="triggerAnalysis">开始 AI 分析</button>
      </div>

      <!-- 运行中 / 进行状态 -->
      <div v-else-if="analysisStatus.status === 'pending' || analysisStatus.status === 'running'" class="space-y-3">
        <div>
          <div class="flex justify-between text-sm mb-1">
            <span class="text-blue-700 dark:text-blue-300">{{ analysisStatus.step }}</span>
            <span class="text-blue-600 dark:text-blue-400">{{ analysisStatus.progress }}%</span>
          </div>
          <div class="h-2 bg-blue-200 dark:bg-blue-800 rounded-full overflow-hidden">
            <div
              class="h-full bg-blue-500 transition-all duration-500"
              :style="{ width: `${analysisStatus.progress}%` }"
            />
          </div>
        </div>
        <div class="flex flex-wrap gap-2 text-xs">
          <span :class="analysisStatus.progress >= 20 ? 'text-green-600' : (analysisStatus.progress > 0 ? 'text-blue-500' : 'text-gray-400')">
            {{ analysisStatus.progress >= 20 ? '✓' : (analysisStatus.progress > 0 ? '⟳' : '○') }} 章节摘要
          </span>
          <span :class="analysisStatus.progress >= 30 ? 'text-green-600' : (analysisStatus.progress >= 20 ? 'text-blue-500' : 'text-gray-400')">
            {{ analysisStatus.progress >= 30 ? '✓' : (analysisStatus.progress >= 20 ? '⟳' : '○') }} 角色
          </span>
          <span :class="analysisStatus.progress >= 78 ? 'text-green-600' : (analysisStatus.progress >= 70 ? 'text-blue-500' : 'text-gray-400')">
            {{ analysisStatus.progress >= 78 ? '✓' : (analysisStatus.progress >= 70 ? '⟳' : '○') }} 技能
          </span>
          <span :class="analysisStatus.progress >= 40 ? 'text-green-600' : (analysisStatus.progress >= 20 ? 'text-blue-500' : 'text-gray-400')">
            {{ analysisStatus.progress >= 40 ? '✓' : (analysisStatus.progress >= 20 ? '⟳' : '○') }} 物品
          </span>
          <span :class="analysisStatus.progress >= 50 ? 'text-green-600' : (analysisStatus.progress >= 20 ? 'text-blue-500' : 'text-gray-400')">
            {{ analysisStatus.progress >= 50 ? '✓' : (analysisStatus.progress >= 20 ? '⟳' : '○') }} 世界观
          </span>
          <span :class="analysisStatus.progress >= 60 ? 'text-green-600' : (analysisStatus.progress >= 20 ? 'text-blue-500' : 'text-gray-400')">
            {{ analysisStatus.progress >= 60 ? '✓' : (analysisStatus.progress >= 20 ? '⟳' : '○') }} 剧情点
          </span>
          <span :class="analysisStatus.progress >= 70 ? 'text-green-600' : (analysisStatus.progress >= 20 ? 'text-blue-500' : 'text-gray-400')">
            {{ analysisStatus.progress >= 70 ? '✓' : (analysisStatus.progress >= 20 ? '⟳' : '○') }} 场景锚点
          </span>
          <span :class="analysisStatus.progress >= 90 ? 'text-green-600' : (analysisStatus.progress >= 78 ? 'text-blue-500' : 'text-gray-400')">
            {{ analysisStatus.progress >= 90 ? '✓' : (analysisStatus.progress >= 78 ? '⟳' : '○') }} 故事大纲
          </span>
          <span :class="analysisStatus.progress >= 90 ? 'text-green-600' : (analysisStatus.progress >= 78 ? 'text-blue-500' : 'text-gray-400')">
            {{ analysisStatus.progress >= 90 ? '✓' : (analysisStatus.progress >= 78 ? '⟳' : '○') }} 项目设置
          </span>
          <span :class="analysisStatus.progress >= 95 ? 'text-green-600' : (analysisStatus.progress >= 90 ? 'text-blue-500' : 'text-gray-400')">
            {{ analysisStatus.progress >= 95 ? '✓' : (analysisStatus.progress >= 90 ? '⟳' : '○') }} 章节大纲
          </span>
        </div>
      </div>

      <!-- 完成状态 -->
      <div v-else-if="analysisStatus.status === 'completed'" class="space-y-1">
        <div class="flex items-center gap-2 text-green-700 dark:text-green-400">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          分析完成！角色、物品、技能、世界观、剧情点、场景锚点、故事大纲、项目设置和章节大纲已全部更新。
        </div>
        <p v-if="analysisStatus.error" class="text-yellow-600 dark:text-yellow-400 text-xs">
          ⚠️ {{ analysisStatus.error }}
        </p>
        <div v-if="analysisStatus.warnings?.length" class="mt-1 space-y-0.5">
          <p v-for="w in analysisStatus.warnings" :key="w" class="text-yellow-600 dark:text-yellow-400 text-xs">⚠️ {{ w }}</p>
        </div>
      </div>

      <!-- 失败状态 -->
      <div v-else-if="analysisStatus.status === 'failed'" class="space-y-2">
        <p class="text-red-600 dark:text-red-400 text-sm">分析失败：{{ analysisStatus.error || '未知错误' }}</p>
        <button class="btn-secondary text-sm" @click="triggerAnalysis">重试</button>
      </div>
    </div>


    <!-- Tab Bar -->
    <div ref="tabSectionRef" class="card overflow-hidden">
      <div class="flex border-b border-gray-200 dark:border-gray-700">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="px-5 py-3 text-sm font-medium transition-colors whitespace-nowrap"
          :class="activeTab === tab.key
            ? 'border-b-2 border-primary-500 text-primary-600 dark:text-primary-400 -mb-px'
            : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'"
          @click="switchTab(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- Chapters Tab -->
    <div v-if="activeTab === 'chapters'" class="space-y-4">
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
          <NuxtLink
            :to="`/novel/${novelId}/chapter/new`"
            class="btn-primary"
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            新建章节
          </NuxtLink>
        </div>
      </div>

      <div v-if="chapterStore.loading" class="space-y-3">
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

      <div v-else class="space-y-3">
        <div
          v-for="chapter in pagedChapters"
          :key="chapter.id"
          class="card p-4 hover:shadow-soft transition-shadow cursor-pointer group"
          @click="goToChapter(chapter)"
        >
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <div class="flex items-center space-x-3">
                <span class="text-lg font-medium text-gray-900 dark:text-white">
                  第{{ chapter.chapter_no }}章
                </span>
                <span class="text-gray-500 dark:text-gray-400">{{ chapter.title }}</span>
              </div>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-1">
                {{ chapter.summary || '暂无摘要' }}
              </p>
            </div>
            <div class="flex items-center space-x-4">
              <span class="text-sm text-gray-500 dark:text-gray-400">
                {{ chapter.word_count.toLocaleString() }} 字
              </span>
              <span
                class="px-2 py-0.5 text-xs font-medium rounded"
                :class="getStatusColor(chapter.status)"
              >
                {{ getStatusLabel(chapter.status) }}
              </span>
              <button
                class="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                title="删除章节"
                @click="requestDeleteChapter(chapter, $event)"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>

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
    </div>

    <!-- Characters Tab -->
    <div v-if="activeTab === 'characters'" class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">角色列表</h2>
        <div class="flex items-center gap-2">
          <button class="btn-secondary text-sm" :disabled="generatingCharacters" @click="handleAICharacters">
            <svg v-if="generatingCharacters" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            {{ generatingCharacters ? 'AI 生成中...' : (characters.length > 0 ? 'AI 更新角色' : 'AI 生成角色') }}
          </button>
          <button class="btn-secondary text-sm" :disabled="batchGeneratingCharImages || characters.length === 0" @click="handleBatchCharacterImages" title="批量为所有角色生成正面图（跳过已有图片的角色）">
            <svg v-if="batchGeneratingCharImages" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            {{ batchGeneratingCharImages ? '生成中...' : '批量生成图片' }}
          </button>
          <NuxtLink to="/character/create" class="btn-primary">
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            新建角色
          </NuxtLink>
        </div>
      </div>

      <div v-if="characterStore.loading" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div v-for="i in 4" :key="i" class="card p-4">
          <div class="skeleton h-20 w-20 rounded-full mb-3"></div>
          <div class="skeleton h-5 w-1/2 mb-2"></div>
          <div class="skeleton h-4 w-3/4"></div>
        </div>
      </div>

      <div v-else-if="characters.length === 0" class="card p-8 text-center">
        <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <p class="text-gray-500 dark:text-gray-400">还没有角色，创建你的第一个角色</p>
      </div>

      <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="character in characters"
          :key="character.id"
          class="card p-4 hover:shadow-soft transition-shadow cursor-pointer group relative"
          @click="goToCharacter(character)"
        >
          <!-- 删除按钮：hover 时出现 -->
          <button
            class="absolute top-2 right-2 p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-opacity z-10"
            title="删除角色"
            @click="handleDeleteCharacter($event, character)"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
          <div class="flex items-start space-x-4">
            <div class="w-16 h-16 rounded-full flex-shrink-0 overflow-hidden bg-primary-100 flex items-center justify-center">
              <img
                v-if="character.three_view_front || character.portrait"
                :src="character.three_view_front || character.portrait"
                class="w-full h-full object-cover cursor-zoom-in"
                :alt="character.name"
                @click.stop="openLightbox(character.three_view_front || character.portrait)"
              />
              <span v-else class="text-2xl font-bold text-primary-600">{{ character.name.charAt(0) }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center space-x-2">
                <h3 class="text-lg font-medium text-gray-900 dark:text-white truncate">
                  {{ character.name }}
                </h3>
                <span
                  class="px-2 py-0.5 text-xs font-medium rounded"
                  :class="getRoleColor(character.role)"
                >
                  {{ getRoleLabel(character.role) }}
                </span>
              </div>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                {{ character.personality || '暂无性格描述' }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Items Tab -->
    <div v-if="activeTab === 'items'" class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">物品管理</h2>
        <div class="flex items-center gap-2">
          <button class="btn-secondary text-sm" :disabled="extractingItems" @click="handleAIItems">
            <svg v-if="extractingItems" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            {{ extractingItems ? 'AI 提取中...' : (items.length > 0 ? 'AI 更新物品' : 'AI 提取物品') }}
          </button>
          <button class="btn-secondary text-sm" :disabled="batchGeneratingItemImages || items.length === 0" @click="handleBatchItemImages" title="批量为所有物品生成图片（跳过已有图片的物品）">
            <svg v-if="batchGeneratingItemImages" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            {{ batchGeneratingItemImages ? '生成中...' : '批量生成图片' }}
          </button>
          <button class="btn-primary" @click="showItemModal = true">
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            添加物品
          </button>
        </div>
      </div>

      <div v-if="itemsLoading" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div v-for="i in 4" :key="i" class="card p-4">
          <div class="skeleton h-32 w-full rounded-lg mb-3"></div>
          <div class="skeleton h-5 w-1/2 mb-2"></div>
          <div class="skeleton h-4 w-3/4"></div>
        </div>
      </div>

      <div v-else-if="items.length === 0" class="card p-8 text-center">
        <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
        </svg>
        <p class="text-gray-500 dark:text-gray-400 mb-1">暂无物品</p>
        <p class="text-xs text-gray-400 dark:text-gray-500">可手动添加，或通过「AI 分析」自动从章节内容中提取</p>
      </div>

      <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="item in items"
          :key="item.id"
          class="card overflow-hidden group cursor-pointer hover:shadow-medium transition-shadow"
          @click="$router.push(`/item/${item.id}?novelId=${novelId}`)"
        >
          <!-- Image area -->
          <div class="relative w-full h-36 overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
            <img v-if="item.image_url" :src="item.image_url" class="w-full h-full object-cover cursor-zoom-in" :alt="item.name" @click.stop="openLightbox(item.image_url)" />
            <div v-else class="flex flex-col items-center gap-1 text-gray-300 dark:text-gray-600">
              <span class="text-3xl">{{ getItemCategoryIcon(item.category) }}</span>
            </div>
            <!-- Rarity badge top-left -->
            <span
              v-if="getItemRarity(item)"
              class="absolute top-2 left-2 text-xs px-1.5 py-0.5 rounded font-medium"
              :class="getItemRarity(item)!.color"
            >{{ getItemRarity(item)!.label }}</span>
            <!-- Status dot top-right -->
            <span class="absolute top-2 right-2 flex items-center gap-1 bg-black/30 rounded-full px-1.5 py-0.5">
              <span class="w-1.5 h-1.5 rounded-full" :class="getItemStatusDot(item.status)" />
            </span>
            <!-- Delete on hover -->
            <button
              class="absolute bottom-2 right-2 p-1 bg-white/90 dark:bg-gray-900/90 text-gray-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              :disabled="deletingItemId === item.id"
              title="删除物品"
              @click.stop="deleteItem(item.id, $event)"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>

          <!-- Info -->
          <div class="p-3">
            <div class="flex items-start justify-between gap-2 mb-1.5">
              <h3 class="font-medium text-gray-900 dark:text-white truncate flex-1">{{ item.name }}</h3>
              <span class="text-xs px-1.5 py-0.5 rounded flex-shrink-0" :class="getItemCategoryColor(item.category)">
                {{ getItemCategoryLabel(item.category) }}
              </span>
            </div>
            <p v-if="item.description" class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">{{ item.description }}</p>
            <div class="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
              <span v-if="item.location" class="truncate flex items-center gap-0.5">
                <svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                {{ item.location }}
              </span>
              <span v-if="item.owner" class="truncate flex items-center gap-0.5">
                <svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                {{ item.owner }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Skills Tab -->
    <div v-if="activeTab === 'skills'" class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">技能管理</h2>
        <div class="flex items-center gap-2">
          <button class="btn-secondary text-sm" :disabled="generatingSkills" @click="generateSkills">
            <svg v-if="generatingSkills" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            {{ generatingSkills ? 'AI 生成中...' : (skills.length > 0 ? 'AI 更新' : 'AI 生成') }}
          </button>
          <button class="btn-primary" @click="showSkillModal = true">
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            新建技能
          </button>
        </div>
      </div>

      <div v-if="skillsLoading" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div v-for="i in 4" :key="i" class="card p-4">
          <div class="skeleton h-5 w-1/2 mb-2"></div>
          <div class="skeleton h-4 w-1/4 mb-3"></div>
          <div class="skeleton h-4 w-3/4"></div>
        </div>
      </div>

      <div v-else-if="skills.length === 0" class="card p-8 text-center">
        <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
        </svg>
        <p class="text-gray-500 dark:text-gray-400 mb-1">暂无技能</p>
        <p class="text-xs text-gray-400 dark:text-gray-500">可手动新建，或点击「AI 生成」自动创建技能体系</p>
      </div>

      <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="skill in skills"
          :key="skill.id"
          class="card overflow-hidden group cursor-pointer hover:shadow-medium transition-shadow"
          @click="$router.push(`/skill/${skill.id}?novelId=${novelId}`)"
        >
          <!-- Gradient header -->
          <div
            class="h-12 flex items-center justify-between px-4 bg-gradient-to-r"
            :class="getSkillCategoryGradient(skill.category)"
          >
            <div class="flex items-center gap-2">
              <span class="text-base">{{ getSkillCategoryIcon(skill.category) }}</span>
              <span class="text-xs font-bold text-white/90">{{ skill.category }}</span>
              <span class="text-xs text-white/70">·</span>
              <span class="text-xs text-white/80">{{ getSkillTypeLabel(skill.skill_type) }}</span>
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-white/80 font-mono">Lv.{{ skill.level }}<span class="opacity-50">/{{ skill.max_level }}</span></span>
              <button
                class="p-1 text-white/50 hover:text-red-300 opacity-0 group-hover:opacity-100 transition-opacity"
                :disabled="deletingSkillId === skill.id"
                title="删除技能"
                @click.stop="deleteSkill(skill.id, $event)"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Level bar -->
          <div class="h-0.5 bg-gray-100 dark:bg-gray-700">
            <div
              class="h-full bg-gradient-to-r opacity-60"
              :class="getSkillCategoryGradient(skill.category)"
              :style="{ width: `${Math.min((skill.level / Math.max(skill.max_level || 1, 1)) * 100, 100)}%` }"
            />
          </div>

          <!-- Body -->
          <div class="p-3 space-y-2">
            <div class="flex items-start justify-between gap-2">
              <h3 class="font-semibold text-gray-900 dark:text-white truncate flex-1">{{ skill.name }}</h3>
              <div class="flex items-center gap-1 flex-shrink-0">
                <span v-if="skill.status !== 'active'" class="text-xs px-1.5 py-0.5 rounded" :class="getSkillStatusColor(skill.status)">
                  {{ getSkillStatusLabel(skill.status) }}
                </span>
              </div>
            </div>
            <p v-if="skill.realm" class="text-xs text-gray-400">要求：{{ skill.realm }}</p>
            <p v-if="skill.description" class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 leading-relaxed">{{ skill.description }}</p>
            <div v-if="skill.cost || skill.cooldown" class="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500 pt-1 border-t border-gray-100 dark:border-gray-700">
              <span v-if="skill.cost" class="flex items-center gap-1">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                {{ skill.cost }}
              </span>
              <span v-if="skill.cooldown" class="flex items-center gap-1">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                {{ skill.cooldown }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Worldview Tab -->
    <div v-if="activeTab === 'worldview'" class="space-y-4">

      <!-- 已关联世界观 Header -->
      <div v-if="novel?.worldview_id" class="card p-4">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-3">
            <div class="w-9 h-9 bg-primary-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945" />
              </svg>
            </div>
            <div>
              <p class="text-sm font-semibold text-gray-900 dark:text-white">
                {{ linkedWorldview?.name || worldviewList.find(w => w.id === novel?.worldview_id)?.name || `世界观 #${novel.worldview_id}` }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">已关联</p>
            </div>
          </div>
          <div class="flex items-center space-x-2">
            <button
              class="btn-primary text-sm flex items-center gap-1.5"
              :disabled="generatingWorldview"
              @click="handleGenerateWorldview"
            >
              <svg v-if="generatingWorldview" class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span>{{ generatingWorldview ? 'AI 生成中...' : 'AI 更新' }}</span>
            </button>
            <NuxtLink :to="`/worldview/${novel.worldview_id}`" class="btn-outline text-sm">编辑</NuxtLink>
            <button class="btn-ghost text-sm text-red-500 hover:text-red-600" :disabled="linkingWorldview" @click="linkWorldview(null)">解除</button>
          </div>
        </div>
      </div>

      <!-- 世界观内容摘要 -->
      <template v-if="novel?.worldview_id">
        <!-- Loading -->
        <div v-if="linkedWorldviewLoading" class="card p-6 space-y-3">
          <div class="skeleton h-4 w-3/4"></div>
          <div class="skeleton h-4 w-full"></div>
          <div class="skeleton h-4 w-2/3"></div>
        </div>

        <template v-else-if="linkedWorldview">
          <!-- 概述 -->
          <div v-if="linkedWorldview.description" class="card p-4">
            <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">概述</h4>
            <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-4">{{ linkedWorldview.description }}</p>
          </div>

          <!-- 核心设定 2列 -->
          <div class="grid gap-4 md:grid-cols-2">
            <div v-if="linkedWorldview.magic_system" class="card p-4">
              <h4 class="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-2">修炼/魔法体系</h4>
              <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-5">{{ linkedWorldview.magic_system }}</p>
            </div>
            <div v-if="linkedWorldview.geography" class="card p-4">
              <h4 class="text-xs font-semibold text-green-600 dark:text-green-400 uppercase tracking-wider mb-2">地理环境</h4>
              <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-5">{{ linkedWorldview.geography }}</p>
            </div>
            <div v-if="linkedWorldview.history" class="card p-4">
              <h4 class="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-2">历史背景</h4>
              <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-5">{{ linkedWorldview.history }}</p>
            </div>
            <div v-if="linkedWorldview.culture" class="card p-4">
              <h4 class="text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider mb-2">文化风俗</h4>
              <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-5">{{ linkedWorldview.culture }}</p>
            </div>
            <div v-if="linkedWorldview.technology" class="card p-4">
              <h4 class="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-2">科技水平</h4>
              <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-5">{{ linkedWorldview.technology }}</p>
            </div>
            <div v-if="linkedWorldview.rules" class="card p-4">
              <h4 class="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">世界规则</h4>
              <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed line-clamp-5">{{ linkedWorldview.rules }}</p>
            </div>
          </div>
        </template>
      </template>

      <!-- 控制区（关联/新建） -->
      <div class="card p-4 space-y-4">
        <div>
          <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            {{ novel?.worldview_id ? '更换世界观' : '关联已有世界观' }}
          </h4>
          <select
            id="worldview-select"
            class="input w-full"
            :value="novel?.worldview_id ?? ''"
            @change="(e) => { const v = parseInt((e.target as HTMLSelectElement).value); if (v) linkWorldview(v) }"
          >
            <option value="">— 选择世界观 —</option>
            <option v-for="wv in worldviewList" :key="wv.id" :value="wv.id">{{ wv.name }}</option>
          </select>
        </div>

        <div class="flex items-center gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
          <button
            class="btn-primary text-sm flex items-center gap-1.5"
            :disabled="generatingWorldview"
            @click="handleGenerateWorldview"
          >
            <svg v-if="generatingWorldview" class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            {{ generatingWorldview ? 'AI 生成中...' : 'AI 生成世界观' }}
          </button>
          <NuxtLink :to="`/worldview/create?novel_id=${novelId}`" class="btn-outline text-sm flex items-center">
            <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            手动新建
          </NuxtLink>
        </div>
      </div>
    </div>

    <!-- Plot Points Tab -->
    <div v-if="activeTab === 'plot_points'" class="space-y-4">
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
            @click="fetchPlotPoints"
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

    <!-- Scene Anchors Tab -->
    <div v-if="activeTab === 'scene_anchors'" class="space-y-4">
      <!-- 工具栏 -->
      <div class="flex flex-wrap items-center gap-3">
        <select v-model="selectedChapterForExtract" class="input text-sm flex-1 min-w-0 max-w-xs">
          <option value="all">全部章节</option>
          <option v-for="ch in chapterStore.chapters" :key="ch.id" :value="ch.id">
            第 {{ ch.chapter_no }} 章 {{ ch.title }}
          </option>
        </select>
        <button class="btn btn-primary text-sm" :disabled="extractingAnchors || extractingAllAnchors" @click="extractAnchors">
          <span v-if="extractingAllAnchors || extractingAnchors">提取中…</span>
          <span v-else>AI 提取</span>
        </button>
        <button class="btn btn-secondary text-sm" :disabled="batchGeneratingAnchorImages || sceneAnchorStore.anchors.length === 0" @click="handleBatchAnchorImages" title="批量为所有锚点生成参考图（跳过已有参考图的锚点）">
          <svg v-if="batchGeneratingAnchorImages" class="w-4 h-4 mr-1 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <span>{{ batchGeneratingAnchorImages ? '生成中...' : '批量生成参考图' }}</span>
        </button>
        <button class="btn btn-secondary text-sm ml-auto" @click="startAnchorCreate">+ 手动新建</button>
      </div>

      <!-- 锚点列表 -->
      <div v-if="sceneAnchorStore.loading" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div v-for="i in 4" :key="i" class="card p-4">
          <div class="skeleton h-28 w-full rounded-lg mb-3"></div>
          <div class="skeleton h-4 w-1/2 mb-2"></div>
          <div class="skeleton h-3 w-3/4"></div>
        </div>
      </div>

      <div v-else-if="sceneAnchorStore.anchors.length === 0" class="card p-8 text-center">
        <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
        </svg>
        <p class="text-gray-500 dark:text-gray-400 mb-1">暂无场景锚点</p>
        <p class="text-xs text-gray-400 dark:text-gray-500">可手动新建，或通过「AI 提取」从章节内容自动生成</p>
      </div>

      <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="anchor in sceneAnchorStore.anchors"
          :key="anchor.id"
          class="card overflow-hidden group cursor-pointer hover:shadow-medium transition-shadow"
          @click="startAnchorEdit(anchor)"
        >
          <!-- 参考图区域 -->
          <div class="relative w-full h-32 overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
            <img v-if="anchor.ref_image_url" :src="anchor.ref_image_url" class="w-full h-full object-cover cursor-zoom-in" :alt="anchor.name" @click.stop="openLightbox(anchor.ref_image_url)" />
            <div v-else class="flex flex-col items-center gap-1 text-gray-300 dark:text-gray-600">
              <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span class="text-xs">暂无参考图</span>
            </div>
            <!-- 类型徽章 -->
            <span
              class="absolute top-2 left-2 text-xs px-1.5 py-0.5 rounded font-medium"
              :class="{
                'bg-blue-100 text-blue-700': anchor.type === 'interior',
                'bg-green-100 text-green-700': anchor.type === 'exterior',
                'bg-purple-100 text-purple-700': anchor.type === 'imaginary',
              }"
            >{{ anchor.type === 'interior' ? '室内' : anchor.type === 'exterior' ? '室外' : anchor.type === 'imaginary' ? '虚幻' : anchor.type }}</span>
            <!-- 锁定状态 -->
            <span v-if="anchor.ref_image_locked_at" class="absolute top-2 right-2 flex items-center gap-1 bg-black/30 rounded-full px-1.5 py-0.5">
              <svg class="w-3 h-3 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </span>
            <!-- 生成图按钮 (stop propagation) -->
            <button
              class="absolute bottom-2 right-2 p-1 bg-white/90 dark:bg-gray-900/90 text-gray-500 hover:text-primary-600 rounded opacity-0 group-hover:opacity-100 transition-opacity text-xs flex items-center gap-1"
              :disabled="generatingRefImage[anchor.id]"
              :title="anchor.ref_image_url ? '重新生成参考图' : '生成参考图'"
              @click.stop="generateRefImage(anchor)"
            >
              <svg v-if="generatingRefImage[anchor.id]" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              <svg v-else class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
            </button>
            <!-- 删除按钮 -->
            <button
              class="absolute bottom-2 left-2 p-1 bg-white/90 dark:bg-gray-900/90 text-gray-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              title="删除锚点"
              @click.stop="deleteAnchor(anchor.id)"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>

          <!-- 信息区 -->
          <div class="p-3">
            <div class="flex items-start justify-between gap-2 mb-1">
              <h3 class="font-medium text-gray-900 dark:text-white truncate flex-1">{{ anchor.name }}</h3>
              <span v-if="anchor.variant" class="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex-shrink-0">
                {{ anchor.variant }}
              </span>
            </div>
            <p v-if="anchor.description" class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">{{ anchor.description }}</p>
            <div class="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
              <span>引用 {{ anchor.usage_count }}</span>
              <span v-if="anchor.avg_cons_score > 0" :class="anchorScoreColor(anchor.avg_cons_score)">
                均分 {{ anchor.avg_cons_score.toFixed(2) }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 新建 Modal（仅用于快速创建，编辑跳转到详情页） -->
      <div v-if="showAnchorModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div class="card w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
          <h3 class="text-base font-semibold">新建场景锚点</h3>
          <div class="space-y-3">
            <div>
              <label class="label">名称 <span class="text-red-500">*</span></label>
              <input v-model="anchorForm.name" class="input w-full" placeholder="如：皇宫正殿" maxlength="100" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="label">类型</label>
                <select v-model="anchorForm.type" class="input w-full">
                  <option value="exterior">室外 (exterior)</option>
                  <option value="interior">室内 (interior)</option>
                  <option value="imaginary">虚幻 (imaginary)</option>
                </select>
              </div>
              <div>
                <label class="label">变体</label>
                <input v-model="anchorForm.variant" class="input w-full" placeholder="day/night/winter" />
              </div>
            </div>
            <div>
              <label class="label">视觉描述（英文）</label>
              <textarea v-model="anchorForm.description" class="input w-full resize-none" rows="2" placeholder="Brief English description..."></textarea>
            </div>
          </div>
          <p class="text-xs text-gray-400">创建后可在详情页完善 Prompt Lock、Style Tokens 等高级设置。</p>
          <div class="flex gap-3 justify-end pt-2">
            <button class="btn btn-secondary" @click="showAnchorModal = false">取消</button>
            <button class="btn btn-primary" :disabled="savingAnchor" @click="saveAnchor">
              {{ savingAnchor ? '创建中…' : '创建' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Settings Tab -->
    <div v-if="activeTab === 'settings'" class="space-y-4">

      <!-- ① 基本信息 -->
      <div class="card p-6 space-y-5">
        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">基本信息</h3>

        <!-- 图标 + 名称 (同行) -->
        <div class="flex items-start gap-4">
          <div class="flex-shrink-0">
            <div
              class="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold shadow-sm"
              :style="{ background: iconGradient(novel?.cover_image) }"
            >{{ novel?.title?.[0]?.toUpperCase() ?? 'I' }}</div>
            <div class="flex gap-1.5 flex-wrap mt-2 max-w-[9rem]">
              <button
                v-for="opt in iconOptions" :key="opt.value"
                type="button"
                class="w-6 h-6 rounded-lg transition-all hover:scale-110 focus:outline-none"
                :class="novel?.cover_image === opt.value ? 'ring-2 ring-offset-1 ring-primary-500 scale-110' : ''"
                :style="{ background: opt.gradient }"
                @click="novelStore.updateNovel(novelId, { cover_image: opt.value })"
              />
            </div>
          </div>
          <div class="flex-1 min-w-0 space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">小说名称</label>
              <input
                type="text" :value="novel?.title" class="input" maxlength="100"
                @change="(e) => { const v = (e.target as HTMLInputElement).value.trim(); if (v) novelStore.updateNovel(novelId, { title: v }) }"
              />
            </div>
          </div>
        </div>

        <!-- 小说类型 -->
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">小说类型</label>
          <div class="flex gap-1.5 flex-wrap">
            <button
              v-for="g in genreOptions" :key="g" type="button"
              class="px-2.5 py-1 text-xs rounded-full border transition-colors"
              :class="novel?.genre === g
                ? 'bg-amber-400 border-amber-400 text-white font-medium'
                : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-amber-300'"
              @click="novelStore.updateNovel(novelId, { genre: g as any })"
            >{{ g }}</button>
          </div>
        </div>

        <!-- 作品概要 -->
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">作品概要</label>
          <textarea
            :value="novel?.description" rows="3" maxlength="1000"
            class="input resize-none text-sm"
            placeholder="简要描述故事背景、主角、核心冲突，AI 会根据此生成大纲…"
            @change="(e) => novelStore.updateNovel(novelId, { description: (e.target as HTMLTextAreaElement).value })"
          ></textarea>
          <p class="mt-0.5 text-xs text-gray-400 text-right">{{ novel?.description?.length ?? 0 }}/1000</p>
        </div>

        <!-- 目标规模 (双列) -->
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">目标字数</label>
            <div class="flex gap-1.5 flex-wrap mb-2">
              <button
                v-for="opt in settingsWCOptions" :key="opt.value" type="button"
                class="px-2.5 py-1 text-xs rounded-full border transition-colors"
                :class="novel?.target_word_count === opt.value
                  ? 'bg-primary-500 border-primary-500 text-white font-medium'
                  : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-primary-300'"
                @click="novelStore.updateNovel(novelId, { target_word_count: opt.value })"
              >{{ opt.label }}</button>
            </div>
            <div class="flex items-center gap-1.5">
              <input
                type="number" :value="novel?.target_word_count ?? 0"
                class="input w-28 text-sm" min="0" step="10000"
                @change="(e) => novelStore.updateNovel(novelId, { target_word_count: parseInt((e.target as HTMLInputElement).value) || 0 })"
              />
              <span class="text-xs text-gray-400">字</span>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">期望章节数</label>
            <div class="flex gap-1.5 flex-wrap mb-2">
              <button
                v-for="opt in settingsCCOptions" :key="opt.value" type="button"
                class="px-2.5 py-1 text-xs rounded-full border transition-colors"
                :class="novel?.target_chapters === opt.value
                  ? 'bg-primary-500 border-primary-500 text-white font-medium'
                  : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-primary-300'"
                @click="novelStore.updateNovel(novelId, { target_chapters: opt.value })"
              >{{ opt.label }}</button>
            </div>
            <div class="flex items-center gap-1.5">
              <input
                type="number" :value="novel?.target_chapters ?? 0"
                class="input w-28 text-sm" min="0" max="10000"
                @change="(e) => novelStore.updateNovel(novelId, { target_chapters: parseInt((e.target as HTMLInputElement).value) || 0 })"
              />
              <span class="text-xs text-gray-400">章</span>
            </div>
          </div>
        </div>
      </div>

      <!-- ② 创作风格 -->
      <div class="card p-6 space-y-4">
        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">创作风格</h3>

        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="text-xs font-medium text-gray-500 dark:text-gray-400">写作风格预设</label>
            <NuxtLink to="/style" class="text-xs text-primary-600 hover:underline">浏览风格库 →</NuxtLink>
          </div>
          <div class="flex items-center gap-2">
            <select
              :value="selectedWritingPreset" :disabled="applyingWritingPreset"
              class="input flex-1"
              @change="handleWritingPresetSelect(($event.target as HTMLSelectElement).value)"
            >
              <option v-for="p in WRITING_PRESETS" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <svg v-if="applyingWritingPreset" class="w-4 h-4 animate-spin text-primary-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <textarea
            :value="novel?.style_prompt" rows="2"
            class="input text-sm mt-2 resize-none"
            placeholder="风格提示词，选择预设后自动填充，或手动输入…"
            @change="(e) => novelStore.updateNovel(novelId, { style_prompt: (e.target as HTMLTextAreaElement).value })"
          ></textarea>
        </div>

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">画面风格</label>
            <select
              :value="novel?.image_style || IMAGE_PRESETS[0]?.id || ''"
              class="input"
              @change="handleImageStyleSelect(($event.target as HTMLSelectElement).value)"
            >
              <option value="">-- 不使用预设 --</option>
              <option v-for="p in IMAGE_PRESETS" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">参考作品</label>
            <input
              type="text" :value="novel?.reference_style" class="input"
              placeholder="书名、URL 或风格描述…"
              @change="(e) => novelStore.updateNovel(novelId, { reference_style: (e.target as HTMLInputElement).value })"
            />
            <p class="mt-1 text-xs text-gray-400">
              或
              <NuxtLink :to="`/import?novel_id=${novel?.id}`" class="text-primary-600 hover:underline">导入章节</NuxtLink>
              直接爬取参考作品
            </p>
          </div>
        </div>
      </div>

      <!-- ③ 模型配置 -->
      <div class="card p-6 space-y-4">
        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">模型配置</h3>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">LLM 模型</label>
            <select :value="novel?.ai_model ?? ''" class="input"
              @change="(e) => novelStore.updateNovel(novelId, { ai_model: (e.target as HTMLSelectElement).value || undefined })">
              <option value="">使用默认</option>
              <option v-for="m in availableModels" :key="m.id" :value="m.name">{{ m.display_name || m.name }}</option>
            </select>
            <p v-if="availableModels.length === 0" class="mt-1 text-xs text-gray-400">
              可在 <NuxtLink to="/model" class="text-primary-600 hover:underline">模型管理</NuxtLink> 中添加
            </p>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">图片模型</label>
            <select :value="novel?.image_model ?? ''" class="input"
              @change="(e) => novelStore.updateNovel(novelId, { image_model: (e.target as HTMLSelectElement).value || undefined })">
              <option value="">使用默认</option>
              <option v-for="m in imageModels" :key="m.id" :value="m.name">{{ m.display_name || m.name }}</option>
            </select>
            <p v-if="imageModels.length === 0" class="mt-1 text-xs text-gray-400">
              可在 <NuxtLink to="/model" class="text-primary-600 hover:underline">模型管理</NuxtLink> 中添加
            </p>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">视频模型</label>
            <select :value="novel?.video_model ?? ''" class="input"
              @change="(e) => novelStore.updateNovel(novelId, { video_model: (e.target as HTMLSelectElement).value || undefined })">
              <option value="">使用默认</option>
              <option v-for="m in videoModels" :key="m.id" :value="m.name">{{ m.display_name || m.name }}</option>
            </select>
            <p v-if="videoModels.length === 0" class="mt-1 text-xs text-gray-400">
              可在 <NuxtLink to="/model" class="text-primary-600 hover:underline">模型管理</NuxtLink> 中添加
            </p>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">语音模型</label>
            <select :value="novel?.tts_model ?? ''" class="input"
              @change="(e) => novelStore.updateNovel(novelId, { tts_model: (e.target as HTMLSelectElement).value || undefined })">
              <option value="">使用默认</option>
              <option v-for="m in ttsModels" :key="m.id" :value="m.name">{{ m.display_name || m.name }}</option>
            </select>
            <p v-if="ttsModels.length === 0" class="mt-1 text-xs text-gray-400">
              可在 <NuxtLink to="/model" class="text-primary-600 hover:underline">模型管理</NuxtLink> 中添加
            </p>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100 dark:border-gray-700">
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label class="text-xs font-medium text-gray-500 dark:text-gray-400">创意度</label>
              <span class="text-xs text-gray-400">{{ novel?.temperature ?? 0.7 }}</span>
            </div>
            <input type="range" :value="novel?.temperature ?? 0.7" min="0" max="2" step="0.1"
              class="w-full accent-primary-500"
              @change="(e) => novelStore.updateNovel(novelId, { temperature: parseFloat((e.target as HTMLInputElement).value) })" />
            <div class="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>确定</span><span>均衡</span><span>创意</span>
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">每章最大 Tokens</label>
            <input type="number" :value="novel?.max_tokens ?? 4096" class="input" min="512" max="32000" step="512"
              @change="(e) => novelStore.updateNovel(novelId, { max_tokens: parseInt((e.target as HTMLInputElement).value) })" />
            <p class="mt-1 text-xs text-gray-400">≈ {{ Math.round((novel?.max_tokens ?? 4096) * 0.75) }} 中文字</p>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">超时时间（秒）</label>
            <input type="number" :value="novel?.timeout_seconds ?? 0" class="input" min="0" max="600" step="30"
              @change="(e) => novelStore.updateNovel(novelId, { timeout_seconds: parseInt((e.target as HTMLInputElement).value) })" />
            <p class="mt-1 text-xs text-gray-400">0 = 系统默认（300秒）</p>
          </div>
        </div>
      </div>

      <!-- ④ 视频配置 -->
      <div class="card p-6 space-y-4">
        <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">视频配置</h3>

        <!-- 视频类型 -->
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">视频类型</label>
          <div class="grid grid-cols-2 gap-3">
            <button
              v-for="vt in videoTypes"
              :key="vt.value"
              type="button"
              class="relative flex flex-col gap-1 rounded-lg border-2 p-4 text-left transition-colors"
              :class="(novel?.video_type ?? 'animation') === vt.value
                ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'"
              @click="novelStore.updateNovel(novelId, { video_type: vt.value })"
            >
              <span class="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-100">
                <span class="text-base">{{ vt.icon }}</span>
                {{ vt.label }}
              </span>
              <span class="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{{ vt.desc }}</span>
              <span v-if="(novel?.video_type ?? 'animation') === vt.value"
                class="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary-500" />
            </button>
          </div>
        </div>

        <!-- 素材导出路径 -->
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">素材导出路径</label>
          <div class="flex gap-2">
            <input
              type="text"
              class="input flex-1"
              placeholder="如 /output/assets 或留空使用默认路径"
              :value="novel?.asset_export_path ?? ''"
              @change="(e) => novelStore.updateNovel(novelId, { asset_export_path: (e.target as HTMLInputElement).value })"
            />
            <button
              type="button"
              class="shrink-0 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center gap-1.5 text-sm"
              @click="showDirPicker = true"
            >
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>
              浏览
            </button>
          </div>
          <p class="text-xs text-gray-400 mt-1">生成的图片、音频等素材文件的保存位置</p>
        </div>

        <DirPicker
          v-model="showDirPicker"
          :initial-path="novel?.asset_export_path || '/'"
          @select="(path) => novelStore.updateNovel(novelId, { asset_export_path: path })"
        />

        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">默认分辨率</label>
            <select :value="novel?.video_resolution ?? '1080p'" class="input"
              @change="(e) => novelStore.updateNovel(novelId, { video_resolution: (e.target as HTMLSelectElement).value })">
              <option value="720p">720p (1280×720)</option>
              <option value="1080p">1080p (1920×1080)</option>
              <option value="4K">4K (3840×2160)</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">默认帧率</label>
            <select :value="novel?.video_fps ?? 30" class="input"
              @change="(e) => novelStore.updateNovel(novelId, { video_fps: parseInt((e.target as HTMLSelectElement).value) })">
              <option :value="24">24 fps（电影）</option>
              <option :value="30">30 fps（标准）</option>
              <option :value="60">60 fps（流畅）</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">默认宽高比</label>
            <select :value="novel?.video_aspect_ratio ?? '16:9'" class="input"
              @change="(e) => novelStore.updateNovel(novelId, { video_aspect_ratio: (e.target as HTMLSelectElement).value })">
              <option value="16:9">16:9（宽屏）</option>
              <option value="9:16">9:16（竖屏）</option>
              <option value="1:1">1:1（方形）</option>
              <option value="4:3">4:3（传统）</option>
            </select>
          </div>
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <label class="text-xs font-medium text-gray-500 dark:text-gray-400">角色一致性权重</label>
              <span class="text-xs text-gray-400">{{ Math.round((novel?.char_consistency_weight ?? 1) * 100) }}%</span>
            </div>
            <input type="range" :value="novel?.char_consistency_weight ?? 1" min="0" max="1" step="0.05"
              class="w-full accent-primary-500"
              @change="(e) => novelStore.updateNovel(novelId, { char_consistency_weight: parseFloat((e.target as HTMLInputElement).value) })" />
            <div class="flex justify-between text-xs text-gray-400 mt-0.5">
              <span>自由</span><span>平衡</span><span>严格</span>
            </div>
          </div>
        </div>

        <!-- 旁白音色 -->
        <div>
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">旁白音色</label>
          <select :value="novel?.narration_voice ?? ''" class="input"
            @change="(e) => novelStore.updateNovel(novelId, { narration_voice: (e.target as HTMLSelectElement).value })">
            <option value="">自动（alloy）</option>
            <template v-for="group in narrationVoiceGroups" :key="group.key">
              <optgroup :label="group.label">
                <option v-for="v in group.voices" :key="v.id" :value="v.id">{{ v.label }}</option>
              </optgroup>
            </template>
          </select>
          <p class="text-xs text-gray-400 mt-1">无角色专属配音时用此音色朗读旁白，选项与角色配音设置一致</p>
        </div>

        <!-- 字幕配置 -->
        <div class="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-700">
          <div class="flex items-center justify-between">
            <span class="text-xs font-medium text-gray-500 dark:text-gray-400">字幕配置</span>
            <label class="flex items-center gap-2 cursor-pointer">
              <span class="text-xs text-gray-500 dark:text-gray-400">启用字幕</span>
              <div
                class="relative w-9 h-5 rounded-full transition-colors cursor-pointer"
                :class="(novel?.subtitle_enabled ?? true) ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'"
                @click="novelStore.updateNovel(novelId, { subtitle_enabled: !(novel?.subtitle_enabled ?? true) })"
              >
                <span
                  class="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                  :class="(novel?.subtitle_enabled ?? true) ? 'translate-x-4' : 'translate-x-0.5'"
                />
              </div>
            </label>
          </div>

          <div v-if="novel?.subtitle_enabled ?? true" class="grid grid-cols-2 gap-3">
            <!-- 字幕位置 -->
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">位置</label>
              <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                <button
                  v-for="pos in [{ value: 'top', label: '顶部' }, { value: 'center', label: '居中' }, { value: 'bottom', label: '底部' }]"
                  :key="pos.value"
                  type="button"
                  class="flex-1 py-1.5 text-xs transition-colors"
                  :class="(novel?.subtitle_position ?? 'bottom') === pos.value
                    ? 'bg-primary-500 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'"
                  @click="novelStore.updateNovel(novelId, { subtitle_position: pos.value as any })"
                >{{ pos.label }}</button>
              </div>
            </div>

            <!-- 字体大小 -->
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">字体大小</label>
              <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                <button
                  v-for="sz in [{ value: 36, label: '小' }, { value: 48, label: '中' }, { value: 60, label: '大' }, { value: 72, label: '特大' }]"
                  :key="sz.value"
                  type="button"
                  class="flex-1 py-1.5 text-xs transition-colors"
                  :class="(novel?.subtitle_font_size ?? 48) === sz.value
                    ? 'bg-primary-500 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'"
                  @click="novelStore.updateNovel(novelId, { subtitle_font_size: sz.value })"
                >{{ sz.label }}</button>
              </div>
            </div>

            <!-- 字体颜色 -->
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">字体颜色</label>
              <div class="flex items-center gap-2">
                <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                  <button
                    v-for="clr in [{ value: '#FFFFFF', label: '白', bg: 'bg-white' }, { value: '#FFFF00', label: '黄', bg: 'bg-yellow-300' }, { value: '#000000', label: '黑', bg: 'bg-gray-900' }]"
                    :key="clr.value"
                    type="button"
                    class="w-8 h-8 flex items-center justify-center text-xs transition-all"
                    :class="[clr.bg, (novel?.subtitle_color ?? '#FFFFFF') === clr.value ? 'ring-2 ring-primary-500 ring-offset-1' : '']"
                    @click="novelStore.updateNovel(novelId, { subtitle_color: clr.value })"
                  >
                    <span :class="clr.value === '#FFFFFF' ? 'text-gray-400' : 'text-white'">{{ clr.label }}</span>
                  </button>
                </div>
                <input
                  type="color"
                  class="w-8 h-8 rounded cursor-pointer border border-gray-200 dark:border-gray-700 p-0.5"
                  :value="novel?.subtitle_color ?? '#FFFFFF'"
                  @change="(e) => novelStore.updateNovel(novelId, { subtitle_color: (e.target as HTMLInputElement).value })"
                />
              </div>
            </div>

            <!-- 背景样式 -->
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">背景样式</label>
              <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                <button
                  v-for="bg in [{ value: 'none', label: '无' }, { value: 'shadow', label: '阴影' }, { value: 'box', label: '底框' }]"
                  :key="bg.value"
                  type="button"
                  class="flex-1 py-1.5 text-xs transition-colors"
                  :class="(novel?.subtitle_bg_style ?? 'shadow') === bg.value
                    ? 'bg-primary-500 text-white'
                    : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'"
                  @click="novelStore.updateNovel(novelId, { subtitle_bg_style: bg.value as any })"
                >{{ bg.label }}</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ⑤ 危险区 -->
      <div class="card p-6 border border-red-100 dark:border-red-900/40">
        <h3 class="text-sm font-semibold text-red-500 uppercase tracking-wider mb-3">危险区</h3>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">删除项目将永久移除所有章节、角色和相关数据，此操作不可撤销。</p>
        <button class="btn-error" @click="showDeleteNovelConfirm = true">删除项目</button>
      </div>

    </div>
  </div>

  <!-- Delete novel confirm -->
  <ConfirmDialog
    v-model="showDeleteNovelConfirm"
    title="删除项目"
    description="此操作不可撤销，将删除所有章节和角色数据。"
    variant="danger"
    confirm-text="确认删除"
    @confirm="confirmDeleteNovel"
  />

  <!-- Delete chapter confirm -->
  <ConfirmDialog
    v-model="showDeleteChapterConfirm"
    title="删除章节"
    :description="`确认删除第${chapterToDelete?.chapter_no}章「${chapterToDelete?.title || ''}」？此操作不可撤销。`"
    variant="danger"
    confirm-text="确认删除"
    @confirm="confirmDeleteChapter"
  />

  <!-- Delete character confirm -->
  <ConfirmDialog
    v-model="showDeleteCharacterConfirm"
    title="删除角色"
    :description="`确认删除角色「${characterToDelete?.name || ''}」？此操作不可撤销。`"
    variant="danger"
    confirm-text="确认删除"
    @confirm="confirmDeleteCharacter"
  />

  <!-- 新建物品弹窗 -->
  <Teleport to="body">
    <div v-if="showItemModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/50" @click="showItemModal = false" />
      <div class="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md">
        <div class="p-6">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold text-gray-900 dark:text-white">添加物品</h2>
            <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" @click="showItemModal = false">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">名称 <span class="text-red-500">*</span></label>
              <input v-model="newItemForm.name" type="text" class="input" placeholder="物品名称" maxlength="100" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">类别</label>
              <select v-model="newItemForm.category" class="input">
                <option value="weapon">武器</option>
                <option value="treasure">宝物</option>
                <option value="tool">工具</option>
                <option value="document">文书</option>
                <option value="artifact">法器</option>
                <option value="other">其他</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">描述</label>
              <textarea v-model="newItemForm.description" rows="3" class="input resize-none" placeholder="物品的来历、用途、特殊属性..."></textarea>
            </div>
          </div>
          <div class="flex justify-end gap-3 mt-5 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button class="btn-secondary" @click="showItemModal = false">取消</button>
            <button class="btn-primary" :disabled="savingItem || !newItemForm.name.trim()" @click="createItem">
              <svg v-if="savingItem" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
              {{ savingItem ? '创建中...' : '创建' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 新建技能弹窗 -->
  <Teleport to="body">
    <div v-if="showSkillModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/50" @click="showSkillModal = false" />
      <div class="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md">
        <div class="p-6">
          <div class="flex items-center justify-between mb-5">
            <h2 class="text-lg font-bold text-gray-900 dark:text-white">新建技能</h2>
            <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" @click="showSkillModal = false">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">技能名称 <span class="text-red-500">*</span></label>
              <input v-model="newSkillForm.name" type="text" class="input" placeholder="如：天罡剑法、御风术" maxlength="100" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">类别</label>
                <select v-model="newSkillForm.category" class="input">
                  <option v-for="cat in SKILL_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">类型</label>
                <select v-model="newSkillForm.skill_type" class="input">
                  <option v-for="t in SKILL_TYPES" :key="t.id" :value="t.id">{{ t.label }}</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">境界要求</label>
              <input v-model="newSkillForm.realm" type="text" class="input" placeholder="如：筑基期、金丹期" maxlength="50" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">技能描述</label>
              <textarea v-model="newSkillForm.description" rows="3" class="input resize-none" placeholder="技能的来源、特点、使用场景..."></textarea>
            </div>
          </div>
          <div class="flex justify-end gap-3 mt-5 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button class="btn-secondary" @click="showSkillModal = false">取消</button>
            <button class="btn-primary" :disabled="savingSkill || !newSkillForm.name.trim()" @click="createSkill">
              <svg v-if="savingSkill" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
              {{ savingSkill ? '创建中...' : '创建' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- 完善小说信息弹窗 -->
  <Teleport to="body">
    <div v-if="showNovelInfoModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 bg-black/50" @click="showNovelInfoModal = false" />
      <div class="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div class="p-6">
          <!-- Header -->
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-lg font-bold text-gray-900 dark:text-white">完善小说信息</h2>
            <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" @click="showNovelInfoModal = false">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>

          <div class="space-y-5">
            <!-- 小说名称 -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">小说名称 <span class="text-red-500">*</span></label>
              <input v-model="novelInfoForm.title" type="text" maxlength="100" class="input" placeholder="小说名称" />
            </div>

            <!-- 作品分类 -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">作品分类</label>
              <div class="flex gap-2 flex-wrap">
                <button
                  v-for="g in genreOptions" :key="g"
                  type="button"
                  class="px-3 py-1 text-sm rounded-full border transition-colors"
                  :class="novelInfoForm.genre === g
                    ? 'bg-amber-400 border-amber-400 text-white font-medium'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-amber-300'"
                  @click="novelInfoForm.genre = g"
                >{{ g }}</button>
              </div>
            </div>

            <!-- 作品概要 -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">作品概要 <span class="text-red-500">*</span></label>
              <textarea
                v-model="novelInfoForm.description"
                rows="4"
                maxlength="1000"
                class="input resize-none"
                placeholder="介绍故事背景、主要情节和核心冲突，AI 将根据此信息生成大纲与世界观..."
              />
              <p class="mt-1 text-xs text-gray-400 text-right">{{ novelInfoForm.description.length }}/1000</p>
            </div>

            <!-- 目标字数 -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">作品字数</label>
              <div class="flex gap-2 flex-wrap">
                <button
                  v-for="opt in wordCountOptions" :key="opt.value"
                  type="button"
                  class="px-3 py-1.5 text-sm rounded-full border transition-colors"
                  :class="novelInfoForm.target_word_count === opt.value
                    ? 'bg-amber-400 border-amber-400 text-white font-medium'
                    : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-amber-300'"
                  @click="novelInfoForm.target_word_count = opt.value"
                >{{ opt.label }}</button>
              </div>
            </div>

            <!-- 目标章节数 -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">期望章节数</label>
              <input
                v-model.number="novelInfoForm.target_chapters"
                type="number" min="0" max="10000"
                class="input w-36"
                placeholder="如 100"
              />
              <p class="mt-1 text-xs text-gray-400">留 0 表示不限制</p>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button class="btn-secondary" @click="showNovelInfoModal = false">取消</button>
            <button
              class="btn-primary"
              :disabled="savingNovelInfo || !novelInfoForm.title.trim() || !novelInfoForm.description.trim()"
              @click="saveNovelInfo"
            >
              <svg v-if="savingNovelInfo" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
              {{ savingNovelInfo ? '保存中...' : '保存' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
