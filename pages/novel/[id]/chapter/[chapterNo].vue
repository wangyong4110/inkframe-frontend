<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const novelId = parseInt(route.params.id as string)
const chapterNo = parseInt(route.params.chapterNo as string)

const chapterStore = useChapterStore()
const novelStore = useNovelStore()
const characterStore = useCharacterStore()

const saving = ref(false)
const generating = ref(false)
const showOutline = ref(true)

const chapter = computed(() => chapterStore.currentChapter)
const novel = computed(() => novelStore.currentNovel)
const characters = computed(() => characterStore.characters)
const qualityReport = computed(() => chapterStore.qualityReport)
const progress = computed(() => chapterStore.currentChapterProgress)

const content = ref('')
const prompt = ref('')

onMounted(async () => {
  await Promise.all([
    novelStore.fetchNovel(novelId),
    characterStore.fetchCharacters(novelId),
  ])

  if (chapterNo && chapterNo > 0) {
    await chapterStore.fetchChapter(novelId, chapterNo)
    content.value = chapter.value?.content || ''
  }
})

async function handleSave() {
  if (!chapter.value) return
  saving.value = true
  try {
    await chapterStore.updateChapter(novelId, chapter.value.chapter_no, {
      content: content.value,
      word_count: countWords(content.value),
    })
  } finally {
    saving.value = false
  }
}

async function handleGenerate() {
  if (!chapter.value) return
  generating.value = true
  try {
    const result = await chapterStore.generateChapter(novelId, chapter.value.chapter_no, prompt.value)
    content.value = result.content || ''
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
          <h1 class="text-xl font-bold text-gray-900 dark:text-white">
            {{ chapter?.title || `第${chapterNo}章` }}
          </h1>
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
        <span class="text-sm font-medium text-primary-600">
          {{ Math.round(progress) }}%
        </span>
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
                {{ chapter?.title || `第${chapterNo}章大纲` }}
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
</template>
