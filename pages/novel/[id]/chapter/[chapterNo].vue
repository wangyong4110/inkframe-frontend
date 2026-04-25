<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const novelId = parseInt(route.params.id as string)
const chapterNo = parseInt(route.params.chapterNo as string)

const chapterStore = useChapterStore()
const novelStore = useNovelStore()
const characterStore = useCharacterStore()
const videoStore = useVideoStore()
const toast = useToast()

const saving = ref(false)
const generating = ref(false)
const showOutline = ref(true)
const showStoryboardModal = ref(false)
const creatingStoryboard = ref(false)

// ── 角色状态快照 ──────────────────────────────────────────────────────────────
const updateCharSnapshots = ref(false)
const snapshotMode = ref<'generate' | 'reuse'>('generate') // generate=重新生成, reuse=复用上章
const selectedCharacterIds = ref<number[]>([])
const syncingSnapshots = ref(false)
const snapshotMsg = ref('')

function toggleAllCharacters(checked: boolean) {
  if (checked) {
    selectedCharacterIds.value = characters.value.map((c: any) => c.id)
  } else {
    selectedCharacterIds.value = []
  }
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
    showStoryboardModal.value = false
    toast.success('视频项目已创建，正在跳转...')
    router.push(`/video/${video.id}`)
  } catch (e: any) {
    toast.error('创建失败：' + (e.message || '未知错误'))
  } finally {
    creatingStoryboard.value = false
  }
}

const chapter = computed(() => chapterStore.currentChapter)
const novel = computed(() => novelStore.currentNovel)
const characters = computed(() => characterStore.characters)
const qualityReport = computed(() => chapterStore.qualityReport)
const progress = computed(() => chapterStore.currentChapterProgress)

const content = ref('')
const chapterTitle = ref('')
const prompt = ref('')
const wordCountOverride = ref(0)  // 0 = use novel default

onMounted(async () => {
  await Promise.all([
    novelStore.fetchNovel(novelId),
    characterStore.fetchCharacters(novelId),
  ])

  if (chapterNo && chapterNo > 0) {
    await chapterStore.fetchChapter(novelId, chapterNo)
    content.value = chapter.value?.content || ''
    chapterTitle.value = chapter.value?.title || ''
  }
})

// Dirty detection
const isDirty = computed(() =>
  content.value !== (chapter.value?.content || '') ||
  chapterTitle.value !== (chapter.value?.title || '')
)

useUnsavedGuard(isDirty, '章节有未保存的修改，确认离开？')

// Autosave
const { lastSavedAt, autoSaving } = useAutosave(
  () => doSave(),
  [content, chapterTitle],
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

// Ctrl+S / Cmd+S
useEventListener('keydown', (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    handleSave()
  }
})

async function doSave() {
  if (!chapter.value) return
  await chapterStore.updateChapter(novelId, chapter.value.chapter_no, {
    title: chapterTitle.value,
    content: content.value,
    word_count: countWords(content.value),
  })
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

async function handleGenerate() {
  if (!chapter.value) return
  generating.value = true
  try {
    const maxTokens = wordCountOverride.value > 0 ? wordCountOverride.value * 2 : undefined
    const result = await chapterStore.generateChapter(novelId, chapter.value.chapter_no, prompt.value, maxTokens)
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
}

function countWords(text: string): number {
  return text.length
}

function getActiveCharacters(): any[] {
  if (!chapter.value) return []
  return characters.value.filter(c => c.role !== 'minor')
}
</script>

<template>
  <div class="h-[calc(100vh-8rem)] flex flex-col">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center space-x-4">
        <button
          class="btn-ghost"
          @click="router.push(`/novel/${novelId}`)"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <input
            v-model="chapterTitle"
            type="text"
            class="text-xl font-bold text-gray-900 dark:text-white bg-transparent border-b border-transparent hover:border-gray-300 focus:border-primary-500 focus:outline-none px-0 pb-0.5 w-full"
            :placeholder="`第${chapterNo}章`"
          />
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ novel?.title }}
          </p>
        </div>
      </div>
      <div class="flex items-center space-x-2">
        <button
          class="btn-outline"
          :disabled="generating"
          @click="handleGenerate"
        >
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          AI 生成
        </button>
        <button
          class="btn-outline"
          :disabled="!chapter || !content"
          @click="showStoryboardModal = true"
        >
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
          </svg>
          生成分镜
        </button>
        <button
          class="btn-primary"
          :disabled="saving"
          @click="handleSave"
        >
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          保存
        </button>
      </div>
    </div>

    <!-- Progress Bar -->
    <div class="mb-4">
      <div class="flex items-center justify-between mb-1">
        <span class="text-sm text-gray-500 dark:text-gray-400">
          字数: {{ countWords(content).toLocaleString() }} / {{ chapterStore.wordCountGoal }}
        </span>
        <div class="flex items-center gap-4">
          <span v-if="autoSaveLabel" class="text-xs text-gray-400 dark:text-gray-500">{{ autoSaveLabel }}</span>
          <span class="text-sm font-medium text-primary-600">
            {{ Math.round(progress) }}%
          </span>
        </div>
      </div>
      <div class="progress-bar">
        <div
          class="progress-bar-fill"
          :style="{ width: `${progress}%` }"
          :class="{
            'bg-success-500': progress >= 100,
            'bg-warning-500': progress >= 70 && progress < 100,
            'bg-primary-500': progress < 70,
          }"
        ></div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="flex-1 flex gap-4 min-h-0">
      <!-- Editor -->
      <div class="flex-1 flex flex-col bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div class="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <button
                class="px-3 py-1 text-sm rounded-lg"
                :class="showOutline ? 'bg-primary-100 text-primary-700' : 'hover:bg-gray-200'"
                @click="showOutline = true"
              >
                大纲
              </button>
              <button
                class="px-3 py-1 text-sm rounded-lg"
                :class="!showOutline ? 'bg-primary-100 text-primary-700' : 'hover:bg-gray-200'"
                @click="showOutline = false"
              >
                内容
              </button>
            </div>
            <button
              class="btn-ghost text-sm"
              @click="handleCheckQuality"
            >
              <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              质量检查
            </button>
          </div>
        </div>

        <div class="flex-1 overflow-hidden">
          <!-- Outline View -->
          <div v-if="showOutline" class="h-full p-6 overflow-auto">
            <div class="max-w-3xl mx-auto">
              <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                {{ chapterTitle || `第${chapterNo}章大纲` }}
              </h2>
              <div class="prose dark:prose-invert">
                <p class="text-gray-600 dark:text-gray-300">
                  {{ chapter?.outline || '暂无大纲' }}
                </p>
              </div>
              <div v-if="chapter?.plot_points" class="mt-6">
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">剧情点</h3>
                <ul class="space-y-2">
                  <li
                    v-for="(pp, index) in (chapter.plot_points || [])"
                    :key="index"
                    class="flex items-start space-x-2"
                  >
                    <span class="w-2 h-2 mt-2 rounded-full bg-primary-500"></span>
                    <span class="text-gray-700 dark:text-gray-300">{{ pp.description }}</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Content Editor -->
          <div v-else class="h-full p-6 overflow-auto">
            <textarea
              v-model="content"
              class="w-full h-full resize-none border-none outline-none bg-transparent text-gray-900 dark:text-white leading-relaxed"
              placeholder="开始写作..."
            ></textarea>
          </div>
        </div>
      </div>

      <!-- Sidebar -->
      <div class="w-80 flex-shrink-0 space-y-4 overflow-auto">
        <!-- Generate Options -->
        <div class="card p-4">
          <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">生成选项</h3>
          <div class="space-y-3">
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                创作提示（可选）
              </label>
              <textarea
                v-model="prompt"
                rows="3"
                class="input text-sm"
                placeholder="添加额外的创作指导..."
              ></textarea>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                本章字数目标
                <span class="font-normal text-gray-400">（0 = 使用默认 {{ chapterStore.wordCountGoal }} 字）</span>
              </label>
              <input
                v-model.number="wordCountOverride"
                type="number"
                min="0"
                step="500"
                class="input text-sm"
                placeholder="如 2000、5000..."
              />
            </div>
            <button
              class="btn-primary w-full"
              :disabled="generating"
              @click="handleGenerate"
            >
              <svg v-if="generating" class="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {{ generating ? '生成中...' : '继续生成' }}
            </button>
          </div>
        </div>

        <!-- Active Characters -->
        <div class="card p-4">
          <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">活跃角色</h3>
          <div v-if="getActiveCharacters().length === 0" class="text-sm text-gray-500 dark:text-gray-400">
            暂无角色
          </div>
          <div v-else class="space-y-2">
            <div
              v-for="char in getActiveCharacters()"
              :key="char.id"
              class="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
              @click="router.push(`/character/${char.id}`)"
            >
              <div class="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
                <span class="text-xs font-medium text-primary-600">{{ char.name.charAt(0) }}</span>
              </div>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ char.name }}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">{{ char.role }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- 角色状态更新 -->
        <div v-if="chapter" class="card p-4">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-white">角色状态</h3>
            <button
              type="button"
              class="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none"
              :class="updateCharSnapshots ? 'bg-purple-600' : 'bg-gray-200 dark:bg-gray-600'"
              @click="updateCharSnapshots = !updateCharSnapshots"
            >
              <span
                class="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                :class="updateCharSnapshots ? 'translate-x-4' : 'translate-x-0'"
              />
            </button>
          </div>

          <template v-if="updateCharSnapshots">
            <!-- 模式选择 -->
            <div class="flex gap-2 mb-3">
              <button
                type="button"
                class="flex-1 py-1.5 text-xs rounded-lg border transition-colors"
                :class="snapshotMode === 'generate'
                  ? 'bg-purple-600 border-purple-600 text-white'
                  : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-purple-400'"
                @click="snapshotMode = 'generate'"
              >重新生成</button>
              <button
                type="button"
                class="flex-1 py-1.5 text-xs rounded-lg border transition-colors"
                :class="snapshotMode === 'reuse'
                  ? 'bg-purple-600 border-purple-600 text-white'
                  : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-purple-400'"
                @click="snapshotMode = 'reuse'"
              >复用上章</button>
            </div>
            <p class="text-xs text-gray-400 dark:text-gray-500 mb-3">
              {{ snapshotMode === 'generate'
                ? '结合本章内容和上章状态，AI 重新生成角色状态'
                : '直接将上一章的角色状态复制到本章' }}
            </p>

            <!-- 角色全选 -->
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs text-gray-500 dark:text-gray-400">选择角色</span>
              <button
                type="button"
                class="text-xs text-purple-600 dark:text-purple-400 hover:underline"
                @click="toggleAllCharacters(selectedCharacterIds.length < characters.length)"
              >
                {{ selectedCharacterIds.length < characters.length ? '全选' : '取消' }}
              </button>
            </div>

            <!-- 角色列表 -->
            <div class="space-y-1 mb-3 max-h-40 overflow-y-auto">
              <label
                v-for="char in characters"
                :key="char.id"
                class="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
              >
                <input
                  type="checkbox"
                  :value="char.id"
                  v-model="selectedCharacterIds"
                  class="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                <div class="w-6 h-6 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center shrink-0">
                  <span class="text-xs font-medium text-purple-600 dark:text-purple-400">{{ char.name.charAt(0) }}</span>
                </div>
                <span class="text-xs text-gray-700 dark:text-gray-300 truncate">{{ char.name }}</span>
              </label>
              <p v-if="characters.length === 0" class="text-xs text-gray-400 text-center py-2">暂无角色</p>
            </div>

            <p v-if="snapshotMsg" class="text-xs text-green-600 dark:text-green-400 mb-2">{{ snapshotMsg }}</p>

            <button
              type="button"
              :disabled="syncingSnapshots || selectedCharacterIds.length === 0"
              class="w-full py-1.5 text-xs bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white rounded-lg transition-colors flex items-center justify-center gap-1"
              @click="handleSyncSnapshots"
            >
              <svg v-if="syncingSnapshots" class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              {{ syncingSnapshots ? '更新中...' : `更新 ${selectedCharacterIds.length} 个角色状态` }}
            </button>
          </template>
        </div>

        <!-- Quality Report -->
        <div v-if="qualityReport" class="card p-4">
          <h3 class="text-sm font-semibold text-gray-900 dark:text-white mb-3">质量报告</h3>
          <div class="space-y-3">
            <div>
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs text-gray-500 dark:text-gray-400">整体评分</span>
                <span class="text-sm font-medium text-primary-600">{{ (qualityReport.overall_score * 100).toFixed(0) }}%</span>
              </div>
              <div class="progress-bar">
                <div
                  class="progress-bar-fill bg-primary-500"
                  :style="{ width: `${qualityReport.overall_score * 100}%` }"
                ></div>
              </div>
            </div>
            <div v-if="qualityReport.issues.length > 0" class="space-y-2">
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400">
                发现 {{ qualityReport.issues.length }} 个问题
              </p>
              <div
                v-for="issue in qualityReport.issues.slice(0, 3)"
                :key="issue.id"
                class="p-2 rounded-lg text-xs"
                :class="{
                  'bg-error-50 text-error-800 dark:bg-error-900/50 dark:text-error-300': issue.severity === 'high',
                  'bg-warning-50 text-warning-800 dark:bg-warning-900/50 dark:text-warning-300': issue.severity === 'medium',
                  'bg-gray-50 text-gray-800 dark:bg-gray-800 dark:text-gray-300': issue.severity === 'low',
                }"
              >
                <p class="font-medium">{{ issue.description }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- 生成分镜弹窗 -->
  <Teleport to="body">
    <div v-if="showStoryboardModal" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="fixed inset-0 bg-black/50" @click="showStoryboardModal = false"></div>
      <div class="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">生成分镜脚本</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
          基于「{{ chapterTitle || `第${chapterNo}章` }}」的内容，AI 将自动分析并生成分镜脚本
        </p>
        <div class="space-y-4">
          <!-- Art Style -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">画面风格</label>
            <div class="grid grid-cols-4 gap-2">
              <button
                v-for="style in ART_STYLES"
                :key="style.id"
                type="button"
                class="py-2 text-sm rounded-lg border-2 transition-all"
                :class="storyboardForm.art_style === style.id
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-300'"
                @click="storyboardForm.art_style = style.id"
              >
                {{ style.name }}
              </button>
            </div>
          </div>
          <!-- Aspect Ratio -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">宽高比</label>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="ratio in ['16:9', '9:16', '1:1']"
                :key="ratio"
                type="button"
                class="py-2 text-sm rounded-lg border-2 transition-all"
                :class="storyboardForm.aspect_ratio === ratio
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 text-gray-700 dark:text-gray-300'"
                @click="storyboardForm.aspect_ratio = ratio"
              >
                {{ ratio }}
              </button>
            </div>
          </div>
          <!-- Quality Tier -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">生成质量</label>
            <div class="space-y-2">
              <button
                v-for="tier in QUALITY_TIERS"
                :key="tier.id"
                type="button"
                class="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border-2 text-left transition-all"
                :class="storyboardForm.quality_tier === tier.id
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'"
                @click="storyboardForm.quality_tier = tier.id"
              >
                <span class="font-medium text-sm text-gray-900 dark:text-white">{{ tier.name }}</span>
                <span class="text-xs text-gray-500 dark:text-gray-400">{{ tier.desc }}</span>
              </button>
            </div>
          </div>
        </div>
        <div class="mt-6 flex justify-end space-x-2">
          <button class="btn-outline" @click="showStoryboardModal = false">取消</button>
          <button class="btn-primary" :disabled="creatingStoryboard" @click="handleCreateStoryboard">
            <svg v-if="creatingStoryboard" class="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {{ creatingStoryboard ? '创建中...' : '创建分镜项目' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
