<script setup lang="ts">
import type { Novel, Chapter, Character, AIModel, Worldview, Item } from '~/types'
import { useItemApi } from '~/composables/useApi'
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
const toast = useToast()
const styleApi = useStyleApi()

const activeTab = ref('chapters')
const tabSectionRef = ref<HTMLElement | null>(null)

function switchTab(key: string) {
  activeTab.value = key
  nextTick(() => {
    tabSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
}
const showChapterModal = ref(false)
const showCharacterModal = ref(false)
const generatingOutline = ref(false)
const showDeleteNovelConfirm = ref(false)
const showDeleteChapterConfirm = ref(false)
const chapterToDelete = ref<Chapter | null>(null)

// ── 完善小说信息弹窗 ─────────────────────────────────────────────────────────
const showNovelInfoModal = ref(false)
const novelInfoForm = ref({
  title: '',
  channel: '',
  genre: '',
  description: '',
  target_word_count: 0,
  target_chapters: 0,
})
const savingNovelInfo = ref(false)

const channelOptions = [
  { value: 'female', label: '女生原创' },
  { value: 'male',   label: '男生原创' },
  { value: 'publish', label: '出版图书' },
]

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

function openNovelInfoModal() {
  const n = novel.value
  if (!n) return
  novelInfoForm.value = {
    title:            n.title ?? '',
    channel:          (n as any).channel ?? '',
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
      channel:           novelInfoForm.value.channel,
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

// 创建小说节点是否完成：需有描述 + 频道
const novelInfoComplete = computed(() => {
  const n = novel.value
  if (!n) return false
  return !!(n.description?.trim() && (n as any).channel)
})

// Style selection state
const selectedWritingPreset = ref('')
const applyingWritingPreset = ref(false)

// AI model list (loaded async; silently ignored if API unavailable)
const availableModels = ref<AIModel[]>([])

// Per-task-type model lists for the workflow panel
const nodeModels = ref<Record<string, AIModel[]>>({})
// Selected model per task type (stored as model.name / provider name for API calls)
const selectedNodeModel = ref<Record<string, string>>({
  outline: '', chapter: '', storyboard: '', image_gen: '',
})

// Worldview list for linking
const worldviewList = ref<{ id: number; name: string }[]>([])
const linkingWorldview = ref(false)

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
    if (preset) toast.success(`已应用图片风格「${preset.name}」`)
  }).catch((e: any) => {
    toast.error('保存图片风格失败：' + (e.message || ''))
  })
}

const novel = computed(() => novelStore.currentNovel)
const chapters = computed(() => chapterStore.chapters)
const characters = computed(() => characterStore.characters)

const tabs = [
  { key: 'chapters', label: '章节', icon: 'book-open' },
  { key: 'characters', label: '角色', icon: 'users' },
  { key: 'items', label: '物品', icon: 'archive' },
  { key: 'worldview', label: '世界观', icon: 'globe' },
  { key: 'settings', label: '设置', icon: 'settings' },
]

// Workflow node definitions (static metadata; reactive state computed in template)
const writingNodeDefs = [
  { step: 1, key: 'create',      label: '创建小说',    desc: '填写标题、简介、题材等基本信息',            optional: false, aiTask: '' },
  { step: 2, key: 'worldview',   label: '配置世界观',  desc: '设定世界规则、地理、历史与文化背景',        optional: true,  aiTask: '' },
  { step: 3, key: 'characters',  label: '设计角色',    desc: '创建主角、配角，定义性格、外貌与关系',      optional: true,  aiTask: '' },
  { step: 4, key: 'outline',     label: '生成大纲',    desc: 'AI 规划章节数量、情节走向与三幕结构',       optional: false, aiTask: 'outline' },
  { step: 5, key: 'chapters',    label: '生成章节',    desc: 'AI 逐章撰写正文，支持场景大纲与多轮精修',   optional: false, aiTask: 'chapter' },
] as const

const videoNodeDefs = [
  { step: 6, key: 'storyboard',  label: '生成分镜脚本', desc: 'AI 将章节内容拆解为镜头脚本与场景描述',    optional: false, aiTask: 'storyboard' },
  { step: 7, key: 'image_gen',   label: 'AI 配图',      desc: '为每个分镜镜头生成对应的场景配图素材',     optional: false, aiTask: 'image_gen' },
  { step: 8, key: 'export',      label: '合成 & 导出',  desc: '合成视频文件，或导出剪映草稿到本地',       optional: false, aiTask: '' },
] as const

onMounted(async () => {
  await Promise.all([
    novelStore.fetchNovel(novelId),
    chapterStore.fetchChapters(novelId),
    characterStore.fetchCharacters(novelId),
  ])
  // Auto-trigger analysis when coming from the import/create page.
  // Remove the query params immediately to prevent re-triggering on refresh.
  if (route.query.analyze === '1') {
    const sourceVal = route.query.source as string | undefined
    const { analyze: _a, source: _s, ...restQuery } = route.query
    router.replace({ query: restQuery })
    await triggerAnalysis(sourceVal)
  }
  // Load AI models and worldview list (non-critical, silent fail)
  try {
    const modelApi = useModelApi()
    const taskTypes = ['chapter', 'outline', 'storyboard', 'image_gen'] as const
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
        nodeModels.value[t] = models
        if (t === 'chapter') availableModels.value = models
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
      const resp = await analysisApi.getAnalysisStatus(novelId, analysisTaskId.value)
      analysisStatus.value = (resp as any).data as AnalysisStatus
      if (analysisStatus.value.status === 'completed' || analysisStatus.value.status === 'failed') {
        stopAnalysisPoll()
        if (analysisStatus.value.status === 'completed') {
          // 刷新所有数据后重新加载页面
          await Promise.all([
            novelStore.fetchNovel(novelId),
            characterStore.fetchCharacters(novelId),
          ])
          fetchItems()
          window.location.reload()
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
    weapon: '武器', treasure: '宝物', tool: '工具',
    document: '文书', artifact: '法器', other: '其他',
  }
  return labels[cat] || cat
}

function getItemCategoryColor(cat: string): string {
  const colors: Record<string, string> = {
    weapon: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    treasure: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    tool: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    document: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    artifact: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    other: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
  }
  return colors[cat] || 'bg-gray-100 text-gray-600'
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
            <p class="text-gray-500 dark:text-gray-400 mb-4">
              {{ novel.description || '暂无描述' }}
            </p>
            <div class="flex flex-wrap items-center gap-3">
              <span class="tag tag-primary">{{ novel.genre }}</span>
              <span class="text-sm text-gray-500 dark:text-gray-400">
                {{ novel.chapter_count }} 章
              </span>
              <span class="text-sm text-gray-500 dark:text-gray-400">
                {{ novel.total_words.toLocaleString() }} 字
              </span>
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
        从导入的章节中自动提取世界观、角色与大纲，将小说转化为可编辑的创作项目
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
          <span :class="analysisStatus.progress > 0 ? 'text-green-600' : 'text-gray-400'">
            {{ analysisStatus.progress > 0 ? '✓' : '○' }} 章节摘要
          </span>
          <span :class="analysisStatus.progress >= 30 ? 'text-green-600' : (analysisStatus.progress > 0 ? 'text-blue-500' : 'text-gray-400')">
            {{ analysisStatus.progress >= 30 ? '✓' : (analysisStatus.progress > 0 ? '⟳' : '○') }} 提取角色
          </span>
          <span :class="analysisStatus.progress >= 55 ? 'text-green-600' : (analysisStatus.progress >= 30 ? 'text-blue-500' : 'text-gray-400')">
            {{ analysisStatus.progress >= 55 ? '✓' : (analysisStatus.progress >= 30 ? '⟳' : '○') }} 世界观
          </span>
          <span :class="analysisStatus.progress >= 75 ? 'text-green-600' : (analysisStatus.progress >= 55 ? 'text-blue-500' : 'text-gray-400')">
            {{ analysisStatus.progress >= 75 ? '✓' : (analysisStatus.progress >= 55 ? '⟳' : '○') }} 生成大纲
          </span>
        </div>
      </div>

      <!-- 完成状态 -->
      <div v-else-if="analysisStatus.status === 'completed'" class="space-y-1">
        <div class="flex items-center gap-2 text-green-700 dark:text-green-400">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          分析完成！世界观、角色与大纲已更新。
        </div>
        <p v-if="analysisStatus.error" class="text-yellow-600 dark:text-yellow-400 text-xs">
          ⚠️ {{ analysisStatus.error }}
        </p>
      </div>

      <!-- 失败状态 -->
      <div v-else-if="analysisStatus.status === 'failed'" class="space-y-2">
        <p class="text-red-600 dark:text-red-400 text-sm">分析失败：{{ analysisStatus.error || '未知错误' }}</p>
        <button class="btn-secondary text-sm" @click="triggerAnalysis">重试</button>
      </div>
    </div>

    <!-- 创作流程 -->
    <div v-if="novel" class="card p-5 border border-gray-200 dark:border-gray-700">
      <!-- 标题 -->
      <div class="flex items-center gap-2 mb-5">
        <svg class="w-4 h-4 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <span class="text-sm font-semibold text-gray-800 dark:text-gray-100">创作流程</span>
      </div>

      <!-- ── 小说创作 ── -->
      <div class="mb-1">
        <div class="flex items-center gap-2 mb-3">
          <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
          <span class="text-xs font-medium text-gray-400 dark:text-gray-500 whitespace-nowrap">小说创作</span>
          <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
        </div>
        <div class="space-y-2">
          <template v-for="node in writingNodeDefs" :key="node.key">
            <!-- compute per-node state -->
            <div
              class="flex items-center gap-3 p-3 rounded-xl border transition-colors"
              :class="{
                'border-green-200 bg-green-50/60 dark:border-green-800/50 dark:bg-green-900/10':
                  (node.key === 'create' && novelInfoComplete) ||
                  (node.key === 'worldview' && novel.worldview_id) ||
                  (node.key === 'characters' && characters.length > 0) ||
                  (node.key === 'chapters' && chapters.length > 0),
                'border-amber-200 bg-amber-50/60 dark:border-amber-800/50 dark:bg-amber-900/10':
                  node.key === 'create' && !novelInfoComplete,
                'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:border-primary-200 dark:hover:border-primary-700':
                  node.key !== 'create' &&
                  !(node.key === 'worldview' && novel.worldview_id) &&
                  !(node.key === 'characters' && characters.length > 0) &&
                  !(node.key === 'chapters' && chapters.length > 0),
              }"
            >
              <!-- 步骤圆圈 -->
              <div
                class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold"
                :class="{
                  'bg-green-500 text-white':
                    (node.key === 'create' && novelInfoComplete) ||
                    (node.key === 'worldview' && novel.worldview_id) ||
                    (node.key === 'characters' && characters.length > 0) ||
                    (node.key === 'chapters' && chapters.length > 0),
                  'bg-amber-400 text-white':
                    node.key === 'create' && !novelInfoComplete,
                  'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400':
                    node.key !== 'create' &&
                    !(node.key === 'worldview' && novel.worldview_id) &&
                    !(node.key === 'characters' && characters.length > 0) &&
                    !(node.key === 'chapters' && chapters.length > 0),
                }"
              >
                <svg
                  v-if="(node.key === 'create' && novelInfoComplete) || (node.key === 'worldview' && novel.worldview_id) || (node.key === 'characters' && characters.length > 0) || (node.key === 'chapters' && chapters.length > 0)"
                  class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"
                ><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" /></svg>
                <span v-else>{{ node.step }}</span>
              </div>

              <!-- 标题 + 描述 -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-sm font-medium text-gray-800 dark:text-gray-100">{{ node.label }}</span>
                  <span v-if="node.aiTask" class="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                    <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>AI
                  </span>
                  <span v-if="node.optional" class="text-[10px] text-gray-400 dark:text-gray-500">可选</span>
                </div>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{{ node.desc }}</p>
                <!-- 模型选择器（AI 节点） -->
                <div v-if="node.aiTask && nodeModels[node.aiTask]?.length" class="mt-2">
                  <select
                    v-model="selectedNodeModel[node.aiTask]"
                    class="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400 max-w-[200px]"
                  >
                    <option value="">使用默认模型</option>
                    <option v-for="m in nodeModels[node.aiTask]" :key="m.id" :value="m.name">
                      {{ m.display_name || m.name }}
                    </option>
                  </select>
                </div>
                <p v-else-if="node.aiTask && !nodeModels[node.aiTask]?.length" class="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                  <NuxtLink to="/model" class="hover:underline">配置模型提供商</NuxtLink> 后方可使用 AI
                </p>
              </div>

              <!-- 操作按钮 -->
              <div class="flex-shrink-0">
                <!-- 创建小说 -->
                <template v-if="node.key === 'create'">
                  <button v-if="!novelInfoComplete" class="btn-primary !px-2.5 !py-1 text-xs" @click="openNovelInfoModal">完善信息</button>
                  <button v-else class="btn-secondary !px-2.5 !py-1 text-xs" @click="openNovelInfoModal">编辑</button>
                </template>

                <!-- 世界观 -->
                <button v-else-if="node.key === 'worldview'" class="btn-secondary !px-2.5 !py-1 text-xs" @click="switchTab('worldview')">
                  {{ novel.worldview_id ? '查看' : '配置' }}
                </button>

                <!-- 角色 -->
                <button v-else-if="node.key === 'characters'" class="btn-secondary !px-2.5 !py-1 text-xs" @click="switchTab('characters')">
                  {{ characters.length > 0 ? `管理 (${characters.length})` : '设计角色' }}
                </button>

                <!-- 生成大纲 -->
                <button
                  v-else-if="node.key === 'outline'"
                  class="btn-primary !px-2.5 !py-1 text-xs"
                  :disabled="generatingOutline"
                  @click="handleGenerateOutline"
                >
                  <svg v-if="generatingOutline" class="w-3 h-3 mr-1 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                  {{ generatingOutline ? '生成中…' : '生成大纲' }}
                </button>

                <!-- 章节 -->
                <button v-else-if="node.key === 'chapters'" class="btn-secondary !px-2.5 !py-1 text-xs" @click="activeTab = 'chapters'">
                  {{ chapters.length > 0 ? `查看章节 (${chapters.length})` : '新建章节' }}
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>

      <!-- ── 视频制作 ── -->
      <div class="mt-4">
        <div class="flex items-center gap-2 mb-3">
          <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
          <span class="text-xs font-medium text-gray-400 dark:text-gray-500 whitespace-nowrap">视频制作</span>
          <div class="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
        </div>
        <div class="space-y-2">
          <template v-for="node in videoNodeDefs" :key="node.key">
            <div class="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:border-primary-200 dark:hover:border-primary-700 transition-colors">
              <!-- 步骤圆圈 -->
              <div class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                {{ node.step }}
              </div>

              <!-- 标题 + 描述 -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-sm font-medium text-gray-800 dark:text-gray-100">{{ node.label }}</span>
                  <span v-if="node.aiTask" class="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                    <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>AI
                  </span>
                </div>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{{ node.desc }}</p>
                <!-- 模型选择器 -->
                <div v-if="node.aiTask && nodeModels[node.aiTask]?.length" class="mt-2">
                  <select
                    v-model="selectedNodeModel[node.aiTask]"
                    class="text-xs border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400 max-w-[200px]"
                  >
                    <option value="">使用默认模型</option>
                    <option v-for="m in nodeModels[node.aiTask]" :key="m.id" :value="m.name">
                      {{ m.display_name || m.name }}
                    </option>
                  </select>
                </div>
                <p v-else-if="node.aiTask && !nodeModels[node.aiTask]?.length" class="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                  <NuxtLink to="/model" class="hover:underline">配置模型提供商</NuxtLink> 后方可使用 AI
                </p>
              </div>

              <!-- 跳转按钮 -->
              <div class="flex-shrink-0">
                <NuxtLink :to="`/video/index?novel_id=${novelId}`" class="btn-secondary !px-2.5 !py-1 text-xs">
                  前往
                </NuxtLink>
              </div>
            </div>
          </template>
        </div>
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
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- Chapters Tab -->
    <div v-if="activeTab === 'chapters'" class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">章节列表</h2>
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
          v-for="chapter in chapters"
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
      </div>
    </div>

    <!-- Characters Tab -->
    <div v-if="activeTab === 'characters'" class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">角色列表</h2>
        <NuxtLink to="/character/create" class="btn-primary">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          新建角色
        </NuxtLink>
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
          class="card p-4 hover:shadow-soft transition-shadow cursor-pointer"
          @click="goToCharacter(character)"
        >
          <div class="flex items-start space-x-4">
            <div class="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span class="text-2xl font-bold text-primary-600">{{ character.name.charAt(0) }}</span>
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
        <button class="btn-primary" @click="showItemModal = true">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          添加物品
        </button>
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
          class="card p-4 group relative"
        >
          <!-- Image -->
          <div class="w-full h-32 rounded-lg mb-3 overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
            <img v-if="item.image_url" :src="item.image_url" class="w-full h-full object-cover" :alt="item.name" />
            <svg v-else class="w-10 h-10 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </div>
          <!-- Info -->
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <h3 class="font-medium text-gray-900 dark:text-white truncate">{{ item.name }}</h3>
              <span class="inline-block mt-1 text-xs px-2 py-0.5 rounded" :class="getItemCategoryColor(item.category)">
                {{ getItemCategoryLabel(item.category) }}
              </span>
              <p v-if="item.location" class="mt-1 text-xs text-gray-500 dark:text-gray-400 truncate">📍 {{ item.location }}</p>
              <p v-if="item.owner" class="text-xs text-gray-500 dark:text-gray-400 truncate">👤 {{ item.owner }}</p>
              <p v-if="item.description" class="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{{ item.description }}</p>
            </div>
            <!-- Delete -->
            <button
              class="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
              :disabled="deletingItemId === item.id"
              title="删除物品"
              @click="deleteItem(item.id, $event)"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Worldview Tab -->
    <div v-if="activeTab === 'worldview'" class="card p-6 space-y-6">
      <!-- Linked worldview -->
      <div v-if="novel?.worldview_id" class="flex items-center justify-between p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 bg-primary-500 rounded-lg flex items-center justify-center">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945" />
            </svg>
          </div>
          <div>
            <p class="text-sm font-medium text-gray-900 dark:text-white">
              {{ worldviewList.find(w => w.id === novel?.worldview_id)?.name || `世界观 #${novel.worldview_id}` }}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">已关联</p>
          </div>
        </div>
        <div class="flex items-center space-x-2">
          <NuxtLink :to="`/worldview/${novel.worldview_id}`" class="btn-outline text-sm">编辑</NuxtLink>
          <button class="btn-ghost text-sm text-red-500 hover:text-red-600" :disabled="linkingWorldview" @click="linkWorldview(null)">解除</button>
        </div>
      </div>

      <!-- Link existing worldview -->
      <div>
        <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          {{ novel?.worldview_id ? '更换世界观' : '关联已有世界观' }}
        </h4>
        <div class="flex gap-2">
          <select
            id="worldview-select"
            class="input flex-1"
            :value="novel?.worldview_id ?? ''"
            @change="(e) => { const v = parseInt((e.target as HTMLSelectElement).value); if (v) linkWorldview(v) }"
          >
            <option value="">— 选择世界观 —</option>
            <option v-for="wv in worldviewList" :key="wv.id" :value="wv.id">{{ wv.name }}</option>
          </select>
        </div>
      </div>

      <!-- Create new -->
      <div class="flex items-center space-x-3 pt-2 border-t border-gray-200 dark:border-gray-700">
        <NuxtLink :to="`/worldview/create?novel_id=${novelId}`" class="btn-outline text-sm">
          <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          新建世界观
        </NuxtLink>
        <span class="text-xs text-gray-400">创建新世界观并自动关联到此小说</span>
      </div>
    </div>

    <!-- Settings Tab -->
    <div v-if="activeTab === 'settings'" class="card p-6">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">项目设置</h3>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">项目名称</label>
          <input
            type="text"
            :value="novel?.title"
            class="input"
            @change="(e) => novelStore.updateNovel(novelId, { title: (e.target as HTMLInputElement).value })"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">项目描述</label>
          <textarea
            :value="novel?.description"
            rows="3"
            class="input"
            @change="(e) => novelStore.updateNovel(novelId, { description: (e.target as HTMLTextAreaElement).value })"
          ></textarea>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">题材类型</label>
            <select
              :value="novel?.genre"
              class="input"
              @change="(e) => novelStore.updateNovel(novelId, { genre: (e.target as HTMLSelectElement).value })"
            >
              <option value="fantasy">奇幻</option>
              <option value="xianxia">仙侠</option>
              <option value="urban">都市</option>
              <option value="scifi">科幻</option>
              <option value="romance">言情</option>
              <option value="mystery">悬疑</option>
              <option value="historical">历史</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">项目状态</label>
            <select
              :value="novel?.status"
              class="input"
              @change="(e) => novelStore.updateNovel(novelId, { status: (e.target as HTMLSelectElement).value })"
            >
              <option value="planning">规划中</option>
              <option value="writing">创作中</option>
              <option value="paused">暂停</option>
              <option value="completed">已完成</option>
              <option value="archived">已归档</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">封面图片 URL</label>
          <input
            type="text"
            :value="novel?.cover_image"
            class="input"
            placeholder="https://..."
            @change="(e) => novelStore.updateNovel(novelId, { cover_image: (e.target as HTMLInputElement).value })"
          />
          <img v-if="novel?.cover_image" :src="novel.cover_image" class="mt-2 h-32 rounded-lg object-cover" />
        </div>
        <!-- Writing Style -->
        <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300">写作风格</h4>
            <NuxtLink to="/style" class="text-xs text-primary-600 hover:underline">浏览风格库 →</NuxtLink>
          </div>
          <div class="relative">
            <div v-if="applyingWritingPreset" class="absolute inset-0 bg-white/60 dark:bg-gray-800/60 rounded-lg z-10 flex items-center justify-center">
              <svg class="w-5 h-5 animate-spin text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <StylePicker
              type="writing"
              :model-value="selectedWritingPreset"
              compact
              @update:model-value="handleWritingPresetSelect"
            />
          </div>
          <div class="mt-3">
            <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">当前风格提示词（可手动编辑）</label>
            <textarea
              :value="novel?.style_prompt"
              rows="2"
              class="input text-sm"
              placeholder="选择预设后自动填充，或手动输入..."
              @change="(e) => novelStore.updateNovel(novelId, { style_prompt: (e.target as HTMLTextAreaElement).value })"
            ></textarea>
          </div>
        </div>

        <!-- Image / Art Style -->
        <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">图片风格</h4>
          <StylePicker
            type="image"
            :model-value="novel?.image_style ?? ''"
            compact
            @update:model-value="handleImageStyleSelect"
          />
        </div>

        <!-- Reference Works -->
        <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">参考作品</h4>
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">
            输入参考小说的书名、URL 或风格描述，AI 将模仿其写作风格生成内容
          </p>
          <input
            type="text"
            :value="novel?.reference_style"
            class="input"
            placeholder="如：《斗破苍穹》的战斗描写风格，或粘贴章节 URL..."
            @change="(e) => novelStore.updateNovel(novelId, { reference_style: (e.target as HTMLInputElement).value })"
          />
          <p class="mt-1 text-xs text-gray-400">
            也可使用
            <NuxtLink :to="`/import?novel_id=${novel?.id}`" class="text-primary-600 hover:underline">导入章节</NuxtLink>
            功能，直接爬取起点、晋江等平台的作品作为参考
          </p>
        </div>

        <!-- AI Config -->
        <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">AI 配置</h4>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">AI 模型</label>
              <!-- Dynamic select when models available -->
              <select
                v-if="availableModels.length > 0"
                :value="novel?.ai_model ?? ''"
                class="input"
                @change="(e) => novelStore.updateNovel(novelId, { ai_model: (e.target as HTMLSelectElement).value || undefined })"
              >
                <option value="">使用默认模型</option>
                <option v-for="m in availableModels" :key="m.id" :value="m.name">
                  {{ m.display_name || m.name }}
                  <template v-if="m.description"> — {{ m.description }}</template>
                </option>
              </select>
              <!-- Fallback text input when no models configured -->
              <input
                v-else
                type="text"
                :value="novel?.ai_model"
                class="input"
                placeholder="留空使用默认模型"
                @change="(e) => novelStore.updateNovel(novelId, { ai_model: (e.target as HTMLInputElement).value || undefined })"
              />
              <p v-if="availableModels.length === 0" class="mt-1 text-xs text-gray-400">
                可在
                <NuxtLink to="/model" class="text-primary-600 hover:underline">模型管理</NuxtLink>
                中添加 AI 供应商
              </p>
            </div>
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-sm font-medium text-gray-700 dark:text-gray-300">
                  创意度 <span class="font-normal text-gray-400">({{ novel?.temperature ?? 0.7 }})</span>
                </label>
              </div>
              <input
                type="range"
                :value="novel?.temperature ?? 0.7"
                min="0" max="2" step="0.1"
                class="w-full accent-primary-500"
                @change="(e) => novelStore.updateNovel(novelId, { temperature: parseFloat((e.target as HTMLInputElement).value) })"
              />
              <div class="flex justify-between text-xs text-gray-400 mt-0.5">
                <span>确定（0）</span>
                <span>均衡（0.7）</span>
                <span>创意（2）</span>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                每章最大 Tokens
              </label>
              <input
                type="number"
                :value="novel?.max_tokens ?? 4096"
                class="input"
                min="512" max="32000" step="512"
                @change="(e) => novelStore.updateNovel(novelId, { max_tokens: parseInt((e.target as HTMLInputElement).value) })"
              />
              <p class="mt-1 text-xs text-gray-400">约 {{ Math.round((novel?.max_tokens ?? 4096) * 0.75) }} 中文字</p>
            </div>
          </div>
        </div>
        <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
          <button class="btn-error" @click="showDeleteNovelConfirm = true">删除项目</button>
        </div>
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

            <!-- 频道 -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">频道 <span class="text-red-500">*</span></label>
              <div class="flex gap-2 flex-wrap">
                <button
                  v-for="opt in channelOptions" :key="opt.value"
                  type="button"
                  class="px-4 py-1.5 text-sm rounded-full border transition-colors"
                  :class="novelInfoForm.channel === opt.value
                    ? 'bg-amber-400 border-amber-400 text-white font-medium'
                    : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-amber-300'"
                  @click="novelInfoForm.channel = opt.value"
                >{{ opt.label }}</button>
              </div>
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
              :disabled="savingNovelInfo || !novelInfoForm.title.trim() || !novelInfoForm.channel || !novelInfoForm.description.trim()"
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
