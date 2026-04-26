<script setup lang="ts">
import type { Novel, Chapter, Character } from '~/types'

const route = useRoute()
const router = useRouter()

const activeTab = ref('builder')
const generating = ref(false)

const novelId = parseInt(route.params.id as string)
const chapterNo = ref(parseInt(route.query.chapter as string) || 1)

// Loaded context
const novel = ref<Novel | null>(null)
const chapters = ref<Chapter[]>([])
const characters = ref<Character[]>([])

// Style configurations
const styleConfig = ref({
  narrativeVoice: 'third_limited',
  narrativeDistance: 'medium',
  emotionalTone: 'neutral',
  sentenceComplexity: 'moderate',
  dialogueRatio: 0.3,
  descriptionDensity: 'moderate',
})

// Generated prompt
const generatedPrompt = ref('')

// Options
const narrativeVoiceOptions = [
  { label: '第一人称（我）', value: 'first_person' },
  { label: '第三人称有限视角', value: 'third_limited' },
  { label: '全知视角', value: 'third_omniscient' },
]

const narrativeDistanceOptions = [
  { label: '近距离（深入内心）', value: 'close' },
  { label: '中等距离', value: 'medium' },
  { label: '远距离（偏叙述）', value: 'distant' },
]

const emotionalToneOptions = [
  { label: '温暖', value: 'warm' },
  { label: '中性', value: 'neutral' },
  { label: '冷淡', value: 'cold' },
]

const complexityOptions = [
  { label: '简单（短句为主）', value: 'simple' },
  { label: '中等（长短结合）', value: 'moderate' },
  { label: '复杂（复合句）', value: 'complex' },
]

const densityOptions = [
  { label: '简洁', value: 'minimal' },
  { label: '适度', value: 'moderate' },
  { label: '丰富', value: 'rich' },
]

// Load context
onMounted(async () => {
  try {
    const { getNovel } = useNovelApi()
    const { getChapters } = useChapterApi()
    const { getCharacters } = useCharacterApi()
    const [novelResp, chaptersResp, charsResp] = await Promise.all([
      getNovel(novelId),
      getChapters(novelId),
      getCharacters(novelId),
    ])
    novel.value = novelResp.data
    chapters.value = chaptersResp.data
    characters.value = charsResp.data
  } catch {
    // Context loading is best-effort
  }
})

const voiceLabels: Record<string, string> = {
  first_person: '第一人称',
  third_limited: '第三人称有限视角',
  third_omniscient: '全知视角',
}

const distanceLabels: Record<string, string> = {
  close: '近距离（深入内心）',
  medium: '中等距离',
  distant: '远距离（偏叙述）',
}

const toneLabels: Record<string, string> = {
  warm: '温暖',
  neutral: '中性',
  cold: '冷淡',
}

async function generatePrompt() {
  generating.value = true
  try {
    const cfg = styleConfig.value
    const prevChapters = chapters.value
      .filter(c => c.chapter_no < chapterNo.value && c.summary)
      .slice(-3)
      .map(c => `第${c.chapter_no}章（${c.title}）：${c.summary}`)
      .join('\n')

    const mainChars = characters.value
      .filter(c => c.role === 'protagonist' || c.role === 'antagonist')
      .map(c => `${c.name}（${c.role === 'protagonist' ? '主角' : '反派'}）：${c.personality || ''}`)
      .join('\n')

    const parts: string[] = []

    if (novel.value) {
      parts.push(`【作品信息】\n书名：${novel.value.title}\n类型：${novel.value.genre}\n简介：${novel.value.description || ''}`)
    }

    parts.push(`【叙事风格】\n视角：${voiceLabels[cfg.narrativeVoice] || cfg.narrativeVoice}\n距离：${distanceLabels[cfg.narrativeDistance] || cfg.narrativeDistance}\n情感：${toneLabels[cfg.emotionalTone] || cfg.emotionalTone}\n对话比例：${Math.round(cfg.dialogueRatio * 100)}%`)

    if (prevChapters) {
      parts.push(`【前情提要】\n${prevChapters}`)
    }

    if (mainChars) {
      parts.push(`【主要角色】\n${mainChars}`)
    }

    parts.push(`【生成要求】\n请根据以上信息，续写第${chapterNo.value}章内容。`)

    generatedPrompt.value = parts.join('\n\n')
  } finally {
    generating.value = false
  }
}

function copyPrompt() {
  navigator.clipboard.writeText(generatedPrompt.value)
}

function applyPrompt() {
  router.push(`/novel/${novelId}/chapter/${chapterNo.value}?prompt=${encodeURIComponent(generatedPrompt.value)}`)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">提示词构建器</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          构建智能生成所需的完整提示词
        </p>
      </div>
    </div>

    <!-- Tabs -->
    <div class="border-b border-gray-200 dark:border-gray-700">
      <nav class="flex space-x-8">
        <button
          class="py-4 px-1 border-b-2 font-medium text-sm"
          :class="[
            activeTab === 'builder'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          ]"
          @click="activeTab = 'builder'"
        >
          提示词构建
        </button>
        <button
          class="py-4 px-1 border-b-2 font-medium text-sm"
          :class="[
            activeTab === 'preview'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          ]"
          @click="activeTab = 'preview'"
        >
          预览上下文
        </button>
      </nav>
    </div>

    <!-- Builder Tab -->
    <div v-if="activeTab === 'builder'" class="grid gap-6 lg:grid-cols-2">
      <!-- Left: Style Config -->
      <div class="space-y-6">
        <!-- Chapter Info -->
        <div class="card p-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">章节信息</h3>
          <div class="grid gap-4 md:grid-cols-2">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                小说ID
              </label>
              <input v-model="novelId" type="number" class="input" disabled />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                章节号
              </label>
              <input v-model="chapterNo" type="number" class="input" min="1" />
            </div>
          </div>
        </div>

        <!-- Narrative Voice -->
        <div class="card p-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">叙事设置</h3>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                叙事视角
              </label>
              <div class="grid gap-2 md:grid-cols-3">
                <label
                  v-for="opt in narrativeVoiceOptions"
                  :key="opt.value"
                  class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  :class="styleConfig.narrativeVoice === opt.value ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : ''"
                >
                  <input
                    v-model="styleConfig.narrativeVoice"
                    type="radio"
                    :value="opt.value"
                    class="hidden"
                  />
                  <span class="text-sm">{{ opt.label }}</span>
                </label>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                叙事距离
              </label>
              <div class="grid gap-2 md:grid-cols-3">
                <label
                  v-for="opt in narrativeDistanceOptions"
                  :key="opt.value"
                  class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  :class="styleConfig.narrativeDistance === opt.value ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : ''"
                >
                  <input
                    v-model="styleConfig.narrativeDistance"
                    type="radio"
                    :value="opt.value"
                    class="hidden"
                  />
                  <span class="text-sm">{{ opt.label }}</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Emotional & Style -->
        <div class="card p-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">情感与风格</h3>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                情感温度
              </label>
              <div class="grid gap-2 md:grid-cols-3">
                <label
                  v-for="opt in emotionalToneOptions"
                  :key="opt.value"
                  class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  :class="styleConfig.emotionalTone === opt.value ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : ''"
                >
                  <input
                    v-model="styleConfig.emotionalTone"
                    type="radio"
                    :value="opt.value"
                    class="hidden"
                  />
                  <span class="text-sm">{{ opt.label }}</span>
                </label>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                句式复杂度
              </label>
              <div class="grid gap-2 md:grid-cols-3">
                <label
                  v-for="opt in complexityOptions"
                  :key="opt.value"
                  class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  :class="styleConfig.sentenceComplexity === opt.value ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : ''"
                >
                  <input
                    v-model="styleConfig.sentenceComplexity"
                    type="radio"
                    :value="opt.value"
                    class="hidden"
                  />
                  <span class="text-sm">{{ opt.label }}</span>
                </label>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                描写密度
              </label>
              <div class="grid gap-2 md:grid-cols-3">
                <label
                  v-for="opt in densityOptions"
                  :key="opt.value"
                  class="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                  :class="styleConfig.descriptionDensity === opt.value ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : ''"
                >
                  <input
                    v-model="styleConfig.descriptionDensity"
                    type="radio"
                    :value="opt.value"
                    class="hidden"
                  />
                  <span class="text-sm">{{ opt.label }}</span>
                </label>
              </div>
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                对话比例：{{ Math.round(styleConfig.dialogueRatio * 100) }}%
              </label>
              <input
                v-model="styleConfig.dialogueRatio"
                type="range"
                min="0"
                max="1"
                step="0.1"
                class="w-full"
              />
              <div class="flex justify-between text-xs text-gray-500 mt-1">
                <span>叙述为主</span>
                <span>对话为主</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Generate Button -->
        <button
          class="btn-primary w-full"
          :disabled="generating"
          @click="generatePrompt"
        >
          <svg v-if="generating" class="w-5 h-5 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {{ generating ? '生成中...' : '生成提示词' }}
        </button>
      </div>

      <!-- Right: Generated Prompt -->
      <div class="card">
        <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h3 class="font-semibold text-gray-900 dark:text-white">生成的提示词</h3>
          <div class="flex space-x-2">
            <button class="btn-ghost text-sm" @click="copyPrompt">
              <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              复制
            </button>
            <button class="btn-primary text-sm" @click="applyPrompt">
              应用到章节
            </button>
          </div>
        </div>
        <div class="p-6 max-h-[600px] overflow-auto">
          <pre v-if="generatedPrompt" class="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-mono">{{ generatedPrompt }}</pre>
          <div v-else class="text-center py-12 text-gray-500">
            <svg class="w-12 h-12 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p>点击「生成提示词」查看结果</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Preview Tab -->
    <div v-if="activeTab === 'preview'" class="grid gap-6 lg:grid-cols-2">
      <!-- Novel Summary -->
      <div class="card p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">故事概要</h3>
        <div v-if="novel" class="space-y-2">
          <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
            <p class="font-medium">{{ novel.title }}</p>
            <p class="text-gray-600 dark:text-gray-400 mt-1">{{ novel.description || '暂无描述' }}</p>
          </div>
          <div class="text-sm text-gray-500">共 {{ chapters.length }} 章 · {{ novel.total_words.toLocaleString() }} 字</div>
        </div>
        <div v-else class="text-sm text-gray-500">加载中...</div>
      </div>

      <!-- Characters -->
      <div class="card p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">角色状态</h3>
        <div v-if="characters.length === 0" class="text-sm text-gray-500">暂无角色</div>
        <div v-else class="space-y-3">
          <div
            v-for="char in characters.filter(c => c.role === 'protagonist' || c.role === 'antagonist')"
            :key="char.id"
            class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
          >
            <div class="flex items-center justify-between mb-1">
              <span class="font-medium">{{ char.name }}</span>
              <span class="text-xs text-gray-500">{{ char.role === 'protagonist' ? '主角' : '反派' }}</span>
            </div>
            <p class="text-sm text-gray-500 line-clamp-2">{{ char.personality || char.background || '暂无信息' }}</p>
          </div>
        </div>
      </div>

      <!-- Recent Chapters -->
      <div class="card p-6 lg:col-span-2">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">最近章节</h3>
        <div v-if="chapters.length === 0" class="text-sm text-gray-500">暂无章节</div>
        <div v-else class="space-y-2">
          <div
            v-for="ch in chapters.filter(c => c.chapter_no < chapterNo).slice(-5)"
            :key="ch.id"
            class="flex items-start space-x-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <span class="text-sm font-medium text-gray-500 w-12 flex-shrink-0">第{{ ch.chapter_no }}章</span>
            <div>
              <p class="text-sm font-medium text-gray-900 dark:text-white">{{ ch.title }}</p>
              <p v-if="ch.summary" class="text-xs text-gray-500 line-clamp-1">{{ ch.summary }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
