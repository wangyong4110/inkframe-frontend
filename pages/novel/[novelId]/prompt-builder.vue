<script setup lang="ts">
const route = useRoute()
const router = useRouter()

const activeTab = ref('builder')
const generating = ref(false)

const novelId = parseInt(route.params.novelId as string)
const chapterNo = ref(parseInt(route.query.chapter as string) || 1)

// Style configurations
const styleConfig = ref({
  narrativeVoice: 'third_limited',
  narrativeDistance: 'medium',
  emotionalTone: 'neutral',
  sentenceComplexity: 'moderate',
  dialogueRatio: 0.3,
  descriptionDensity: 'moderate',
})

// Generation context
const context = ref({
  globalSummary: '',
  recentChapters: [] as any[],
  foreshadows: [] as any[],
  characterStates: [] as any[],
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
  // TODO: 调用 API 获取上下文
})

async function generatePrompt() {
  generating.value = true
  try {
    // TODO: 调用 API 构建提示词
    generatedPrompt.value = `
【故事概要】
这是一个修仙世界的故事，主角林风是一个普通少年...

【风格要求】
使用第三人称有限视角，深入角色内心描写。

【当前章节】
第${chapterNo.value}章

【前情提要】
第${chapterNo.value - 1}章中，主角林风刚刚突破到筑基境界...

【角色状态】
林风：当前处于成长期，心态积极向上

请根据以上信息，生成第${chapterNo.value}章的完整内容。
    `.trim()
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
    <div v-if="activeTab === 'preview'" class="grid gap-6 lg:grid-cols-3">
      <!-- Global Summary -->
      <div class="card p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">故事概要</h3>
        <div class="space-y-2">
          <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg text-sm">
            这是一个修仙世界的故事...
          </div>
          <button class="btn-ghost text-sm w-full">编辑概要</button>
        </div>
      </div>

      <!-- Foreshadows -->
      <div class="card p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">未解之谜</h3>
        <div class="space-y-3">
          <div class="flex items-start space-x-2">
            <div class="w-2 h-2 mt-2 rounded-full bg-warning-500"></div>
            <div class="text-sm">
              <p class="font-medium">神秘的玉佩</p>
              <p class="text-gray-500">第3章埋下</p>
            </div>
          </div>
          <div class="flex items-start space-x-2">
            <div class="w-2 h-2 mt-2 rounded-full bg-warning-500"></div>
            <div class="text-sm">
              <p class="font-medium">黑袍人的身份</p>
              <p class="text-gray-500">第5章出现</p>
            </div>
          </div>
          <div class="flex items-start space-x-2">
            <div class="w-2 h-2 mt-2 rounded-full bg-success-500"></div>
            <div class="text-sm">
              <p class="font-medium text-gray-500 line-through">主角的身世之谜</p>
              <p class="text-gray-500">已在第8章揭示 ✓</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Character States -->
      <div class="card p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">角色状态</h3>
        <div class="space-y-4">
          <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div class="flex items-center justify-between mb-2">
              <span class="font-medium">林风</span>
              <span class="tag tag-success">成长期</span>
            </div>
            <p class="text-sm text-gray-500">心态：积极向上，努力修炼</p>
            <div class="mt-2">
              <div class="text-xs text-gray-500 mb-1">能力等级</div>
              <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div class="h-full bg-primary-500 rounded-full" style="width: 45%"></div>
              </div>
            </div>
          </div>
          <div class="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div class="flex items-center justify-between mb-2">
              <span class="font-medium">小柔</span>
              <span class="tag tag-primary">觉醒期</span>
            </div>
            <p class="text-sm text-gray-500">心态：神秘莫测</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
