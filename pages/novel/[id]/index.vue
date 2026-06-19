<script setup lang="ts">
import type { AnalysisStatus } from '~/composables/useAnalysisApi'
import { usePollWithBackoff } from '~/composables/usePollWithBackoff'

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

// Clear stale store data synchronously (before any child components mount)
// so children never see data from a previously-visited novel.
if (!isNaN(novelId)) {
  chapterStore.clearForNovel(novelId)
  characterStore.clearForNovel(novelId)
}

const validTabKeys = new Set(['chapters', 'characters', 'items', 'worldview', 'scene_anchors', 'knowledge', 'foreshadow', 'team', 'settings'])
const initialTab = route.query.tab as string
const activeTab = ref(validTabKeys.has(initialTab) ? initialTab : 'chapters')
const tabSectionRef = ref<HTMLElement | null>(null)
const descExpanded = ref(false)

// ── Tab staleness tracking ────────────────────────────────────────────────────
const tabLastFetchedAt: Record<string, number> = {}
const STALE_THRESHOLD = 5 * 60 * 1000 // 5 minutes

function fetchTabData(tab: string) {
  switch (tab) {
    case 'chapters': chapterStore.fetchChapters(novelId); break
    case 'characters': characterStore.fetchCharacters(novelId); break
    case 'scene_anchors': sceneAnchorStore.fetchAnchors(novelId); break
    // worldview, items, plot_points, dramatic, settings manage their own data
  }
  tabLastFetchedAt[tab] = Date.now()
}

function switchTab(key: string) {
  activeTab.value = key
  router.replace({ query: { ...route.query, tab: key } })
  nextTick(() => {
    tabSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  })
  // Background refresh if tab data is stale
  const lastFetch = tabLastFetchedAt[key]
  if (!lastFetch || Date.now() - lastFetch > STALE_THRESHOLD) {
    fetchTabData(key)
  }
}

// ── Visibility change: refetch active tab data when user returns to this tab ──
const onVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    const lastFetch = tabLastFetchedAt[activeTab.value]
    if (!lastFetch || Date.now() - lastFetch > STALE_THRESHOLD) {
      fetchTabData(activeTab.value)
    }
  }
}

const tabs = [
  { key: 'chapters', label: '章节', icon: 'book-open' },
  { key: 'characters', label: '角色', icon: 'users' },
  { key: 'items', label: '物品', icon: 'archive' },
  { key: 'worldview', label: '世界观', icon: 'globe' },
  { key: 'scene_anchors', label: '场景', icon: 'map-pin' },
  { key: 'knowledge', label: '知识库', icon: 'database' },
  { key: 'foreshadow', label: '伏笔', icon: 'bookmark' },
  { key: 'team', label: '团队', icon: 'users' },
  { key: 'settings', label: '设置', icon: 'settings' },
]

const loading = ref(true)
const novel = computed(() => novelStore.currentNovel)
const chapters = computed(() => chapterStore.chapters)
const novelChapterCount = computed(() => chapters.value.length)
const novelTotalWords = computed(() => chapters.value.reduce((sum, c) => sum + (c.word_count ?? 0), 0))
const completedChapterCount = computed(() => chapters.value.filter(c => c.status === 'completed').length)
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

// ── Cover Image ──────────────────────────────────────────────────────────────
const coverFileInput = ref<HTMLInputElement | null>(null)
const coverGenerating = ref(false)
const { uploadImage, uploading: coverUploading } = useImageUpload()
const { url: lightboxUrl, openLightbox } = useImageLightbox()
const { updateNovel, generateCoverImage } = useNovelApi()
const { editImage } = useImageEditApi()

function saveCoverImage(newUrl: string) {
  updateNovel(novelId, { cover_image: newUrl } as any).then(() => novelStore.fetchNovel(novelId))
}

function openCoverLightbox() {
  if (!novel.value?.cover_image || !isCoverUrl(novel.value.cover_image)) return
  openLightbox(
    novel.value.cover_image,
    (instruction) => editImage(lightboxUrl.value, instruction, novelId),
    saveCoverImage,
  )
}

function isCoverUrl(v?: string): boolean {
  return !!v && (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('/'))
}


function coverStyle(coverImage?: string): Record<string, string> {
  if (isCoverUrl(coverImage)) {
    // Wrap in quotes and escape embedded quotes/backslashes to prevent CSS injection
    const safeUrl = coverImage!.replace(/['"\\]/g, encodeURIComponent)
    return {
      backgroundImage: `url("${safeUrl}")`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    }
  }
  const gradients: Record<string, string> = {
    purple: 'linear-gradient(135deg,#8B5CF6,#3B82F6)',
    blue:   'linear-gradient(135deg,#3B82F6,#06B6D4)',
    green:  'linear-gradient(135deg,#10B981,#84CC16)',
    orange: 'linear-gradient(135deg,#F59E0B,#EF4444)',
    red:    'linear-gradient(135deg,#EF4444,#EC4899)',
    pink:   'linear-gradient(135deg,#EC4899,#8B5CF6)',
    teal:   'linear-gradient(135deg,#14B8A6,#3B82F6)',
    indigo: 'linear-gradient(135deg,#6366F1,#8B5CF6)',
    amber:  'linear-gradient(135deg,#F59E0B,#84CC16)',
    cyan:   'linear-gradient(135deg,#06B6D4,#10B981)',
  }
  const grad = (coverImage && gradients[coverImage]) ? gradients[coverImage] : 'linear-gradient(135deg,#8B5CF6,#3B82F6)'
  return { background: grad }
}

async function onCoverFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const url = await uploadImage(file)
    await updateNovel(novelId, { cover_image: url } as any)
    await novelStore.fetchNovel(novelId)
    toast.success('封面已更新')
  } catch (err: any) {
    toast.error('封面上传失败：' + (err.message || ''))
  } finally {
    if (coverFileInput.value) coverFileInput.value.value = ''
  }
}

async function doGenerateCover() {
  coverGenerating.value = true
  try {
    const res = await generateCoverImage(novelId)
    const taskId = (res as any)?.data?.task_id ?? ''
    if (!taskId) { toast.error('封面生成失败：未获取到任务ID'); coverGenerating.value = false; return }
    toast.info('封面生成任务已提交，正在处理...')
    const { getTask } = useTaskApi()
    const poll = usePollWithBackoff({
      fn: () => getTask(taskId),
      isDone: (r) => r.data?.status === 'completed' || r.data?.status === 'failed',
      onResult: async (r) => {
        if (r.data?.status === 'completed') {
          await novelStore.fetchNovel(novelId)
          toast.success('AI 封面生成成功')
          coverGenerating.value = false
        } else if (r.data?.status === 'failed') {
          toast.error('AI 封面生成失败：' + (r.data?.error || '未知错误'))
          coverGenerating.value = false
        }
      },
      onError: () => {},
      initialDelay: 3000, maxDelay: 10000,
    })
    poll.start()
  } catch (err: any) {
    toast.error('AI 封面生成失败：' + (err.message || ''))
    coverGenerating.value = false
  }
}

// ── Collaboration ────────────────────────────────────────────────────────────
const novelEvents = useNovelEvents(computed(() => (isNaN(novelId) ? null : novelId)))
novelEvents.onEvent((evt) => {
  if (evt.type === 'member.joined') toast.info(evt.summary || `${evt.user ?? '新成员'} 已加入协作`)
  else if (evt.summary && evt.type.includes('.updated')) toast.info(evt.summary)
})

// ── Export ──────────────────────────────────────────────────────────────────
const { requestBlob } = useApi()
async function exportNovel() {
  try {
    const blob = await requestBlob(`/novels/${novelId}/export?format=txt`)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${novel.value?.title ?? 'novel'}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (e: any) {
    toast.error('导出失败：' + (e.message || ''))
  }
}

// ── Publish ──────────────────────────────────────────────────────────────────
const publishLoading = ref(false)
const showPublishConfirm = ref(false)
const showUnpublishConfirm = ref(false)
const { publishNovel, unpublishNovel } = useNovelApi()
const { batchPublishChapters } = useChapterApi()

async function confirmPublish() {
  if (!novel.value) return
  publishLoading.value = true
  showPublishConfirm.value = false
  try {
    await publishNovel(novel.value.id, 'public')
    await batchPublishChapters(novel.value.id)
    await Promise.all([novelStore.fetchNovel(novelId), chapterStore.fetchChapters(novelId)])
    toast.success(`已发布到小说广场（${novelChapterCount.value} 章）`)
  } catch {
    toast.error('发布失败')
  } finally {
    publishLoading.value = false
  }
}

async function confirmUnpublish() {
  if (!novel.value) return
  publishLoading.value = true
  showUnpublishConfirm.value = false
  try {
    await unpublishNovel(novel.value.id)
    await novelStore.fetchNovel(novelId)
    toast.success('已取消发布')
  } catch {
    toast.error('操作失败')
  } finally {
    publishLoading.value = false
  }
}

// ── Analysis Panel ──────────────────────────────────────────────────────────
const analysisApi = useAnalysisApi()
const analysisTaskId = ref('')
const analysisStatus = ref<AnalysisStatus | null>(null)

const showAnalysisPanel = computed(() => {
  if (analysisStatus.value) return true
  const n = novel.value
  return !!(n && n.chapter_count > 0)
})

const analysisPoll = usePollWithBackoff({
  fn: async () => {
    const resp = await useTaskApi().getTask(analysisTaskId.value)
    return (resp as any).data
  },
  isDone: (task) => !task || task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled',
  onResult: async (task) => {
    if (!task) return
    analysisStatus.value = {
      status: task.status,
      progress: task.progress,
      step: task.data?.step || '',
      error: task.error || '',
      warnings: task.data?.warnings || [],
    }
    if (task.status === 'completed') {
      localStorage.removeItem(`analysis_task_${novelId}`)
      await Promise.all([
        novelStore.fetchNovel(novelId),
        chapterStore.fetchChapters(novelId),
        characterStore.fetchCharacters(novelId),
        sceneAnchorStore.fetchAnchors(novelId),
      ])
    } else if (task.status === 'failed' || task.status === 'cancelled') {
      localStorage.removeItem(`analysis_task_${novelId}`)
      toast.error('AI 分析失败：' + (task.error || '未知错误'))
    }
  },
  onError: () => {
    // If polling stops due to timeout (maxElapsedMs reached), notify the user.
  },
  initialDelay: 2000,
  maxDelay: 15000,
  maxElapsedMs: 10 * 60 * 1000,
})

onUnmounted(() => {
  document.removeEventListener('visibilitychange', onVisibilityChange)
  analysisPoll.stop()
})

// Notify user when analysis polling stops without completing.
watch(analysisPoll.isPolling, (nowPolling) => {
  if (!nowPolling && analysisStatus.value && analysisStatus.value.status !== 'completed' && analysisStatus.value.status !== 'failed' && analysisStatus.value.status !== 'cancelled') {
    toast.warning('AI 分析轮询已停止，请手动刷新查看最新状态')
  }
})

async function triggerAnalysis(source?: string) {
  try {
    const src = source ?? route.query.source
    const createOutlines = src === 'ai' || src === 'ai-chat'
    const resp = await analysisApi.startAnalysis(novelId, createOutlines ? { create_chapter_outlines: true } : undefined)
    analysisTaskId.value = (resp as any).data?.task_id ?? ''
    if (analysisTaskId.value) {
      localStorage.setItem(`analysis_task_${novelId}`, analysisTaskId.value)
      useTaskStore().trackTask(analysisTaskId.value)
    }
    analysisStatus.value = { status: 'running', progress: 0, step: '准备中...' }
    analysisPoll.start()
  } catch (e: any) {
    toast.error('启动分析失败：' + (e.message || ''))
  }
}

async function loadNovelData(id: number) {
  loading.value = true
  try {
    await Promise.all([
      novelStore.fetchNovel(id),
      chapterStore.fetchChapters(id),
      characterStore.fetchCharacters(id),
      videoStore.fetchVideos({ novel_id: id }),
      sceneAnchorStore.fetchAnchors(id),
    ])
  } finally {
    loading.value = false
  }
}

// Clean up novel-specific store state when navigating between different novels
// (e.g. via browser back/forward or sidebar links) without a full page reload.
watch(() => route.params.id, async (newId, oldId) => {
  if (newId === oldId) return
  const parsed = parseInt(newId as string)
  if (isNaN(parsed)) return
  // Stop any in-progress analysis poll for the previous novel.
  analysisPoll.stop()
  analysisTaskId.value = ''
  analysisStatus.value = null
  // Reset novel-specific store data so stale content from the old novel is not shown.
  chapterStore.clearForNovel(parsed)
  characterStore.clearForNovel(parsed)
  videoStore.videos = []
  novelStore.currentNovel = null
  await loadNovelData(parsed)
}, { immediate: false })

onMounted(async () => {
  document.addEventListener('visibilitychange', onVisibilityChange)
  await loadNovelData(novelId)
  // Mark initial tab as fetched so it won't immediately re-fetch on first switchTab
  tabLastFetchedAt[activeTab.value] = Date.now()
  // Auto-trigger analysis when coming from the import/create page.
  if (route.query.analysis_task_id) {
    const existingTaskId = route.query.analysis_task_id as string
    const { analysis_task_id: _tid, ...restQuery } = route.query
    router.replace({ query: restQuery })
    analysisTaskId.value = existingTaskId
    localStorage.setItem(`analysis_task_${novelId}`, existingTaskId)
    analysisStatus.value = { status: 'running', progress: 0, step: '分析中...' }
    useTaskStore().trackTask(existingTaskId)
    analysisPoll.start()
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
          useTaskStore().trackTask(storedTaskId)
          analysisPoll.start()
        } else if (status.status === 'failed') {
          // Keep the failed status visible so user can retry; clear localStorage
          analysisTaskId.value = ''
          analysisStatus.value = status
          localStorage.removeItem(`analysis_task_${novelId}`)
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
    <!-- Loading skeleton -->
    <div v-if="loading && !novel" class="space-y-4 p-6">
      <div class="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-1/3"></div>
      <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-2/3"></div>
      <div class="grid grid-cols-4 gap-4 mt-6">
        <div v-for="i in 4" :key="i" class="h-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
      </div>
    </div>
    <!-- Novel Header -->
    <div v-else-if="novel" class="card">
      <div class="p-6">
        <div class="flex items-start gap-4 justify-between">
          <!-- 封面缩略图 -->
          <div class="shrink-0">
            <div
              class="relative w-20 h-24 rounded-xl overflow-hidden shadow-sm flex items-center justify-center"
              :class="isCoverUrl(novel.cover_image) ? 'cursor-zoom-in' : 'cursor-pointer'"
              :style="coverStyle(novel.cover_image)"
              @click="isCoverUrl(novel.cover_image) ? openCoverLightbox() : coverFileInput?.click()"
            >
              <span v-if="!isCoverUrl(novel.cover_image)" class="text-xs font-semibold text-white opacity-80 text-center px-2 leading-snug line-clamp-4 select-none">
                {{ novel.title }}
              </span>
              <!-- 右下角更换图标 -->
              <button
                class="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-black/50 hover:bg-black/75 flex items-center justify-center transition"
                title="更换封面"
                @click.stop="coverFileInput?.click()"
              >
                <div v-if="coverUploading" class="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" />
                <svg v-else class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                </svg>
              </button>
            </div>
            <input ref="coverFileInput" type="file" accept="image/*" class="hidden" @change="onCoverFileChange" />
            <!-- AI 生成封面按钮 -->
            <button
              type="button"
              :disabled="coverGenerating || coverUploading"
              class="mt-1 w-full text-xs text-center text-purple-500 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 disabled:opacity-50"
              @click="doGenerateCover"
            >
              {{ coverGenerating ? '生成中...' : 'AI 封面' }}
            </button>
          </div>
          <div class="flex-1 min-w-0">
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
              <span class="tag tag-primary">{{ ({ fantasy:'玄幻奇幻', xianxia:'仙侠修仙', urban:'都市现代', romance:'言情爱情', historical:'历史古代', scifi:'科幻未来', mystery:'悬疑推理', wuxia:'武侠江湖', horror:'灵异恐怖', game:'游戏竞技', military:'军事战争', sports:'体育竞技', campus:'青春校园', apocalypse:'末世废土', rebirth:'重生穿越', palace:'宫斗宅斗', system:'系统流', other:'其他' } as Record<string,string>)[novel.genre] ?? novel.genre }}</span>
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
            <!-- 已发布：显示"取消发布"+ 广场链接 -->
            <template v-if="novel.is_published">
              <NuxtLink :to="`/plaza/novel/${novel.id}`" class="text-xs text-green-600 dark:text-green-400 hover:underline whitespace-nowrap">
                已发布 →
              </NuxtLink>
              <button class="btn-secondary" :disabled="publishLoading" @click="showUnpublishConfirm = true">
                <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
                取消发布
              </button>
            </template>
            <!-- 未发布：显示"发布"按钮 -->
            <button v-else class="btn-primary" :disabled="publishLoading" @click="showPublishConfirm = true">
              <svg v-if="publishLoading" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
              </svg>
              <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              发布
            </button>
            <NuxtLink :to="`/import?novel_id=${novel?.id}`" class="btn-secondary">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              导入章节
            </NuxtLink>
            <button
              @click="exportNovel"
              aria-label="导出小说"
              class="btn-secondary"
            >
              <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              导出TXT
            </button>
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
          class="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-blue-400 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-800/40 disabled:opacity-50 disabled:cursor-not-allowed"
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
        从导入的章节中自动提取角色、物品、世界观、剧情点、场景，并生成故事大纲、项目设置和章节大纲，将小说转化为可编辑的创作项目
      </p>

      <!-- 运行中 / 进行状态 -->
      <div v-if="analysisStatus && (analysisStatus.status === 'pending' || analysisStatus.status === 'running')" class="space-y-3">
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
            {{ analysisStatus.progress >= 70 ? '✓' : (analysisStatus.progress >= 20 ? '⟳' : '○') }} 场景
          </span>
          <span :class="analysisStatus.progress >= 78 ? 'text-green-600' : (analysisStatus.progress >= 70 ? 'text-blue-500' : 'text-gray-400')">
            {{ analysisStatus.progress >= 78 ? '✓' : (analysisStatus.progress >= 70 ? '⟳' : '○') }} 项目设置
          </span>
          <span :class="analysisStatus.progress >= 88 ? 'text-green-600' : (analysisStatus.progress >= 78 ? 'text-blue-500' : 'text-gray-400')">
            {{ analysisStatus.progress >= 88 ? '✓' : (analysisStatus.progress >= 78 ? '⟳' : '○') }} 故事大纲
          </span>
          <span :class="analysisStatus.progress >= 95 ? 'text-green-600' : (analysisStatus.progress >= 88 ? 'text-blue-500' : 'text-gray-400')">
            {{ analysisStatus.progress >= 95 ? '✓' : (analysisStatus.progress >= 88 ? '⟳' : '○') }} 章节大纲
          </span>
        </div>
      </div>

      <!-- 完成状态 -->
      <div v-else-if="analysisStatus?.status === 'completed'" class="space-y-1">
        <div class="flex items-center gap-2 text-green-700 dark:text-green-400">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          分析完成！角色、物品、世界观、剧情点、场景、项目设置、故事大纲和章节大纲已全部更新。
        </div>
        <p v-if="analysisStatus.error" class="text-yellow-600 dark:text-yellow-400 text-xs">
          ⚠️ {{ analysisStatus.error }}
        </p>
        <div v-if="analysisStatus.warnings?.length" class="mt-1 space-y-0.5">
          <p v-for="w in analysisStatus.warnings" :key="w" class="text-yellow-600 dark:text-yellow-400 text-xs">⚠️ {{ w }}</p>
        </div>
      </div>

      <!-- 失败状态 -->
      <div v-else-if="analysisStatus?.status === 'failed'" class="space-y-2">
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
    <NovelWorldviewTab v-else-if="activeTab === 'worldview'" :novel-id="novelId" />
    <NovelSceneAnchorsTab v-else-if="activeTab === 'scene_anchors'" :novel-id="novelId" />
    <NovelKnowledgeTab v-else-if="activeTab === 'knowledge'" :novel-id="novelId" />
    <NovelForeshadowTab v-else-if="activeTab === 'foreshadow'" :novel-id="novelId" :total-chapters="novel?.chapter_count ?? 0" />
    <NovelTeamTab v-else-if="activeTab === 'team'" :novel-id="novelId" />
    <NovelSettingsTab v-else-if="activeTab === 'settings'" :novel-id="novelId" />
  </div>

  <!-- Publish confirmation modal -->
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="showPublishConfirm" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="showPublishConfirm = false" />
        <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6">
          <!-- Icon -->
          <div class="flex items-center justify-center w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/40 mx-auto mb-4">
            <svg class="w-6 h-6 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>
          <h3 class="text-lg font-bold text-gray-900 dark:text-white text-center mb-1">发布到小说广场</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 text-center mb-5">
            确认后将发布《{{ novel?.title }}》及其全部
            <span class="font-semibold text-gray-700 dark:text-gray-200">{{ novelChapterCount }}</span>
            个章节，所有人可公开阅读。
          </p>
          <!-- Stats -->
          <div class="grid grid-cols-3 gap-3 mb-6 text-center">
            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl py-2.5">
              <div class="text-lg font-bold text-gray-800 dark:text-gray-100">{{ novelChapterCount }}</div>
              <div class="text-xs text-gray-500 mt-0.5">章节</div>
            </div>
            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl py-2.5">
              <div class="text-lg font-bold text-gray-800 dark:text-gray-100">{{ completedChapterCount }}</div>
              <div class="text-xs text-gray-500 mt-0.5">已完成</div>
            </div>
            <div class="bg-gray-50 dark:bg-gray-700/50 rounded-xl py-2.5">
              <div class="text-lg font-bold text-gray-800 dark:text-gray-100">
                {{ novelTotalWords >= 10000 ? `${(novelTotalWords / 10000).toFixed(1)}w` : novelTotalWords }}
              </div>
              <div class="text-xs text-gray-500 mt-0.5">总字数</div>
            </div>
          </div>
          <div class="flex gap-3">
            <button
              class="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              @click="showPublishConfirm = false"
            >取消</button>
            <button
              class="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
              @click="confirmPublish"
            >确认发布</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Unpublish confirmation modal -->
  <Teleport to="body">
    <Transition name="modal-fade">
      <div v-if="showUnpublishConfirm" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="showUnpublishConfirm = false" />
        <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm p-6">
          <div class="flex items-center justify-center w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/40 mx-auto mb-4">
            <svg class="w-6 h-6 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <h3 class="text-lg font-bold text-gray-900 dark:text-white text-center mb-1">取消发布</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 text-center mb-6">
            《{{ novel?.title }}》将从小说广场下架，读者将无法继续访问。
          </p>
          <div class="flex gap-3">
            <button
              class="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              @click="showUnpublishConfirm = false"
            >取消</button>
            <button
              class="flex-1 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-sm font-medium transition-colors"
              @click="confirmUnpublish"
            >确认下架</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.15s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
.modal-fade-enter-active .relative,
.modal-fade-leave-active .relative {
  transition: transform 0.15s ease, opacity 0.15s ease;
}
.modal-fade-enter-from .relative,
.modal-fade-leave-to .relative {
  transform: scale(0.95);
  opacity: 0;
}
</style>
