<template>
  <div class="min-h-screen bg-gray-950 text-white flex flex-col">
    <!-- Header -->
    <div class="border-b border-gray-800 bg-gray-900/50">
      <div class="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
        <NuxtLink to="/rewrite" class="text-gray-400 hover:text-white transition-colors">&larr; 返回</NuxtLink>
        <h1 class="text-lg font-semibold">新建改写项目</h1>
      </div>
    </div>

    <div class="flex-1 max-w-3xl mx-auto px-6 py-8 w-full">
      <!-- Legal Disclaimer -->
      <div class="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 mb-8">
        <div class="flex gap-3">
          <span class="text-amber-400 text-xl flex-shrink-0">&#9888;</span>
          <div>
            <h3 class="text-amber-300 font-semibold mb-1">版权声明</h3>
            <p class="text-amber-200/70 text-sm leading-relaxed">
              本功能仅供学习研究和创作练习使用。请确保您有权处理原始作品，或原作品已处于公共领域。
              AI改写不能完全规避版权风险，最终结果仍需人工审核。使用本功能即表示您同意承担相应法律责任。
            </p>
          </div>
        </div>
      </div>

      <!-- Step 1: Select Novel -->
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-4">
        <h2 class="text-base font-semibold text-white mb-4">① 选择原始小说</h2>
        <div class="relative">
          <input v-model="novelSearch" @input="searchNovels" placeholder="搜索小说名称..."
            class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500" />
        </div>
        <div v-if="novelResults.length > 0" class="mt-2 space-y-1">
          <div v-for="novel in novelResults" :key="novel.id"
            @click="selectNovel(novel)"
            :class="['flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors',
              selectedNovel?.id === novel.id ? 'bg-violet-600/20 border border-violet-500/50' : 'hover:bg-gray-800']">
            <div class="w-8 h-8 bg-gray-700 rounded flex-shrink-0 flex items-center justify-center text-sm">&#128214;</div>
            <div>
              <div class="text-sm font-medium text-white">{{ novel.title }}</div>
              <div class="text-xs text-gray-400">{{ novel.chapter_count || 0 }} 章</div>
            </div>
            <div v-if="selectedNovel?.id === novel.id" class="ml-auto text-violet-400">&#10003;</div>
          </div>
        </div>
        <div v-if="selectedNovel" class="mt-3 p-3 bg-violet-600/10 border border-violet-500/30 rounded-lg flex items-center gap-2">
          <span class="text-violet-400">&#10003;</span>
          <span class="text-sm text-violet-300">已选择：{{ selectedNovel.title }}</span>
        </div>
      </div>

      <!-- Step 2: Project Name -->
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-4">
        <h2 class="text-base font-semibold text-white mb-4">② 项目名称</h2>
        <input v-model="form.name" placeholder="例如：「剑道传说」改写版"
          class="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500" />
      </div>

      <!-- Step 3: Rewrite Level -->
      <div class="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-8">
        <h2 class="text-base font-semibold text-white mb-4">③ 改写级别</h2>
        <div class="grid grid-cols-1 gap-3">
          <div v-for="(level, idx) in levels" :key="idx + 1"
            @click="form.level = idx + 1"
            :class="['p-4 rounded-xl border-2 cursor-pointer transition-all',
              form.level === idx + 1 ? level.activeClass : 'border-gray-700 hover:border-gray-600']">
            <div class="flex items-start gap-3">
              <div :class="['text-2xl', form.level === idx + 1 ? '' : 'grayscale opacity-50']">{{ level.emoji }}</div>
              <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-semibold text-white text-sm">Level {{ idx + 1 }}: {{ level.name }}</span>
                  <span :class="level.tagClass" class="text-xs px-2 py-0.5 rounded-full">{{ level.tag }}</span>
                </div>
                <p class="text-xs text-gray-400 leading-relaxed">{{ level.desc }}</p>
                <div class="mt-2 flex items-center gap-1">
                  <span class="text-xs text-gray-500">情节保留度：</span>
                  <div class="flex gap-0.5">
                    <div v-for="i in 5" :key="i"
                      :class="['w-3 h-1.5 rounded-sm', i <= level.retention ? level.barColor : 'bg-gray-700']"></div>
                  </div>
                  <span class="text-xs text-gray-400 ml-1">{{ level.retentionText }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Submit -->
      <button :disabled="!canSubmit || submitting" @click="submit"
        :class="['w-full py-3 rounded-xl font-semibold text-sm transition-all',
          canSubmit && !submitting ? 'bg-violet-600 hover:bg-violet-500 text-white' : 'bg-gray-800 text-gray-500 cursor-not-allowed']">
        {{ submitting ? '创建中...' : '创建项目并开始分析' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Novel } from '~/types'

const router = useRouter()
const { createProject, startAnalysis } = useRewriteApi()
const { getNovels } = useNovelApi()

const novelSearch = ref('')
const novelResults = ref<Novel[]>([])
const selectedNovel = ref<Novel | null>(null)
const submitting = ref(false)

const form = ref({
  name: '',
  level: 1,
})

const levels = [
  {
    emoji: '✍️',
    name: '文学精炼',
    tag: '推荐',
    desc: '保留80-90%情节结构，用全新文学语言重新表达。适合希望保持故事框架同时降低文本相似度的场景。',
    activeClass: 'border-blue-500 bg-blue-500/10',
    tagClass: 'bg-blue-500/20 text-blue-300',
    barColor: 'bg-blue-400',
    retention: 4,
    retentionText: '80-90%',
  },
  {
    emoji: '🔄',
    name: '结构重构',
    tag: '深度',
    desc: '保留40-60%核心情节，重构世界观设定、角色关系和场景架构。大幅改变故事外在形式。',
    activeClass: 'border-violet-500 bg-violet-500/10',
    tagClass: 'bg-violet-500/20 text-violet-300',
    barColor: 'bg-violet-400',
    retention: 3,
    retentionText: '40-60%',
  },
  {
    emoji: '🔥',
    name: '精神蒸馏',
    tag: '彻底',
    desc: '只保留5-20%精神内核和情感逻辑，完全重创世界观、角色和情节。几乎是全新原创作品。',
    activeClass: 'border-amber-500 bg-amber-500/10',
    tagClass: 'bg-amber-500/20 text-amber-300',
    barColor: 'bg-amber-400',
    retention: 1,
    retentionText: '5-20%',
  },
]

async function searchNovels() {
  if (!novelSearch.value.trim()) {
    novelResults.value = []
    return
  }
  try {
    const res = await getNovels({ page: 1, page_size: 10 })
    novelResults.value = (res.data?.items || []).filter((n: Novel) =>
      n.title.includes(novelSearch.value)
    )
  } catch (e) {
    console.error(e)
  }
}

function selectNovel(novel: Novel) {
  selectedNovel.value = novel
  if (!form.value.name) {
    form.value.name = `「${novel.title}」改写版`
  }
}

const canSubmit = computed(() =>
  selectedNovel.value !== null && form.value.name.trim().length > 0
)

async function submit() {
  if (!canSubmit.value || !selectedNovel.value) return
  submitting.value = true
  try {
    const res = await createProject({
      novel_id: selectedNovel.value.id,
      name: form.value.name,
      level: form.value.level,
    })
    const project = res.data
    await startAnalysis(project.id)
    router.push(`/rewrite/${project.id}`)
  } catch (e) {
    console.error(e)
  } finally {
    submitting.value = false
  }
}
</script>
