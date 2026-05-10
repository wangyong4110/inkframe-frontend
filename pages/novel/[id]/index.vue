<script setup lang="ts">
import type { AnalysisStatus } from '~/composables/useAnalysisApi'

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
const sceneAnchorStore = useSceneAnchorStore()
const toast = useToast()

const validTabKeys = new Set(['chapters', 'characters', 'items', 'skills', 'worldview', 'plot_points', 'scene_anchors', 'settings'])
const initialTab = route.query.tab as string
const activeTab = ref(validTabKeys.has(initialTab) ? initialTab : 'chapters')
const tabSectionRef = ref<HTMLElement | null>(null)
const descExpanded = ref(false)

function switchTab(key: string) {
  activeTab.value = key
  router.replace({ query: { ...route.query, tab: key } })
  nextTick(() => {
    tabSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
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

const novel = computed(() => novelStore.currentNovel)
const chapters = computed(() => chapterStore.chapters)
const novelChapterCount = computed(() => chapters.value.length)
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
          await Promise.all([
            novelStore.fetchNovel(novelId),
            chapterStore.fetchChapters(novelId),
            characterStore.fetchCharacters(novelId),
          ])
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

onMounted(async () => {
  await Promise.all([
    novelStore.fetchNovel(novelId),
    chapterStore.fetchChapters(novelId),
    characterStore.fetchCharacters(novelId),
    videoStore.fetchVideos({ novel_id: novelId }),
    sceneAnchorStore.fetchAnchors(novelId),
  ])
  // Auto-trigger analysis when coming from the import/create page.
  if (route.query.analysis_task_id) {
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
          localStorage.removeItem(`analysis_task_${novelId}`)
        }
      } catch {
        localStorage.removeItem(`analysis_task_${novelId}`)
      }
    }
  }
})
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

    <!-- Tab Content -->
    <NovelChaptersTab v-if="activeTab === 'chapters'" :novel-id="novelId" />
    <NovelCharactersTab v-else-if="activeTab === 'characters'" :novel-id="novelId" />
    <NovelItemsTab v-else-if="activeTab === 'items'" :novel-id="novelId" />
    <NovelSkillsTab v-else-if="activeTab === 'skills'" :novel-id="novelId" />
    <NovelWorldviewTab v-else-if="activeTab === 'worldview'" :novel-id="novelId" />
    <NovelPlotPointsTab v-else-if="activeTab === 'plot_points'" :novel-id="novelId" />
    <NovelSceneAnchorsTab v-else-if="activeTab === 'scene_anchors'" :novel-id="novelId" />
    <NovelSettingsTab v-else-if="activeTab === 'settings'" :novel-id="novelId" />
  </div>
</template>
