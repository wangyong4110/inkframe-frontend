<script setup lang="ts">
import type { CrawlProgress } from '~/composables/useApi'

const router = useRouter()
const config = useRuntimeConfig()
const apiBase = config.public.apiBase
const { request } = useApi()
const { getCrawlStatus } = useCrawlApi()

// ── 步骤状态机 ────────────────────────────────────────────────────────────────
type Step = 'choose' | 'ai-form' | 'import-choose' | 'import-file' | 'import-crawl'
const step = ref<Step>('choose')

// ── 颜色/图标选项 ─────────────────────────────────────────────────────────────
const iconOptions = [
  { value: 'purple',  gradient: 'linear-gradient(135deg,#8B5CF6,#3B82F6)' },
  { value: 'blue',    gradient: 'linear-gradient(135deg,#3B82F6,#06B6D4)' },
  { value: 'green',   gradient: 'linear-gradient(135deg,#10B981,#84CC16)' },
  { value: 'orange',  gradient: 'linear-gradient(135deg,#F59E0B,#EF4444)' },
  { value: 'red',     gradient: 'linear-gradient(135deg,#EF4444,#EC4899)' },
  { value: 'pink',    gradient: 'linear-gradient(135deg,#EC4899,#8B5CF6)' },
  { value: 'teal',    gradient: 'linear-gradient(135deg,#14B8A6,#3B82F6)' },
  { value: 'indigo',  gradient: 'linear-gradient(135deg,#6366F1,#8B5CF6)' },
  { value: 'amber',   gradient: 'linear-gradient(135deg,#F59E0B,#84CC16)' },
  { value: 'cyan',    gradient: 'linear-gradient(135deg,#06B6D4,#10B981)' },
]
function iconGradient(value: string) {
  return iconOptions.find(o => o.value === value)?.gradient
    ?? 'linear-gradient(135deg,#8B5CF6,#3B82F6)'
}

// ── Screen 2a: AI 生成表单 ─────────────────────────────────────────────────────
const channelOptions = [
  { label: '女生原创', value: 'female' },
  { label: '男生原创', value: 'male' },
  { label: '出版图书', value: 'publish' },
]
const genreOptions = [
  { label: '玄幻', value: 'fantasy' },
  { label: '仙侠', value: 'xianxia' },
  { label: '都市', value: 'urban' },
  { label: '科幻', value: 'scifi' },
  { label: '言情', value: 'romance' },
  { label: '悬疑', value: 'mystery' },
  { label: '历史', value: 'historical' },
]
const wordCountOptions = [
  { label: '5万字', value: 50000 },
  { label: '10万字', value: 100000 },
  { label: '30万字', value: 300000 },
  { label: '50万字', value: 500000 },
  { label: '100万字', value: 1000000 },
]
const chapterCountOptions = [
  { label: '30章', value: 30 },
  { label: '50章', value: 50 },
  { label: '100章', value: 100 },
  { label: '200章', value: 200 },
  { label: '300章', value: 300 },
]

const aiForm = reactive({
  title: '',
  channel: 'male',
  genre: 'fantasy',
  description: '',
  target_word_count: 100000,
  target_chapters: 100,
  cover_image: 'purple',
})
const aiLoading = ref(false)
const aiError = ref('')

async function submitAI() {
  if (!aiForm.title.trim()) { aiError.value = '请输入小说名称'; return }
  aiError.value = ''
  aiLoading.value = true
  try {
    const data = await request<any>('/novels', {
      method: 'POST',
      body: JSON.stringify({
        title: aiForm.title.trim(),
        description: aiForm.description.trim(),
        genre: aiForm.genre,
        cover_image: aiForm.cover_image,
        channel: aiForm.channel,
        target_word_count: aiForm.target_word_count,
        target_chapters: aiForm.target_chapters,
      }),
    })
    const novel = data.data ?? data
    if (!novel?.id) {
      aiError.value = '创建成功但未返回小说ID，请前往小说列表查看'
      return
    }
    router.push(`/novel/${novel.id}?analyze=1&source=ai`)
  } catch (e: any) {
    aiError.value = e.message || '创建失败'
  } finally {
    aiLoading.value = false
  }
}

// ── Screen 3a: 文件上传 ────────────────────────────────────────────────────────
const fileInputRef = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const fileUploading = ref(false)
const fileProgress = ref(0)
const fileError = ref('')

function getAuthHeader(): Record<string, string> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function handleFileSelect(e: Event) {
  const t = e.target as HTMLInputElement
  if (t.files?.[0]) selectedFile.value = t.files[0]
}

function handleFileDrop(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer?.files?.[0]) selectedFile.value = e.dataTransfer.files[0]
}

async function uploadFile() {
  if (!selectedFile.value) { fileError.value = '请选择文件'; return }
  fileError.value = ''
  fileUploading.value = true
  fileProgress.value = 10

  try {
    const formData = new FormData()
    formData.append('file', selectedFile.value)

    fileProgress.value = 30
    const response = await fetch(`${apiBase}/import/novel/file`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: formData,
    })
    fileProgress.value = 80
    const result = await response.json()
    if (result.code !== 0) throw new Error(result.error || result.message || '导入失败')
    fileProgress.value = 100
    const novelId = result.data?.novel_id
    if (novelId) {
      router.push(`/novel/${novelId}?analyze=1`)
    } else {
      fileError.value = '导入完成但未返回小说ID'
    }
  } catch (e: any) {
    fileError.value = e.message || '上传失败'
  } finally {
    fileUploading.value = false
  }
}

// ── Screen 3b: 爬取小说 ────────────────────────────────────────────────────────
const crawlForm = reactive({
  url: '',
  site_name: '',
})
const crawlLoading = ref(false)
const crawlError = ref('')
const crawlNovelId = ref<number | null>(null)
const crawlStatus = ref<CrawlProgress | null>(null)
const crawlPollTimer = ref<ReturnType<typeof setInterval> | null>(null)

const siteOptions = [
  { label: '自动检测', value: '' },
  { label: '起点中文网', value: 'qidian' },
  { label: '晋江文学城', value: 'jjwxc' },
  { label: '纵横中文网', value: 'zongheng' },
]

function stopCrawlPoll() {
  if (crawlPollTimer.value) {
    clearInterval(crawlPollTimer.value)
    crawlPollTimer.value = null
  }
}

function startCrawlPoll(novelId: number) {
  crawlPollTimer.value = setInterval(async () => {
    try {
      const res = await getCrawlStatus(novelId)
      if (res.code === 0 && res.data) {
        crawlStatus.value = res.data
        if (res.data.status === 'completed') {
          stopCrawlPoll()
          router.push(`/novel/${novelId}?analyze=1`)
        } else if (res.data.status === 'failed') {
          stopCrawlPoll()
          crawlError.value = '爬取失败'
        }
      }
    } catch { /* ignore */ }
  }, 2000)
}

async function startCrawl() {
  if (!crawlForm.url.trim()) { crawlError.value = '请输入小说URL'; return }
  crawlError.value = ''
  crawlLoading.value = true
  crawlStatus.value = null
  try {
    const body: Record<string, unknown> = { url: crawlForm.url.trim() }
    if (crawlForm.site_name) body.site_name = crawlForm.site_name

    const response = await fetch(`${apiBase}/import/novel/crawl`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(body),
    })
    const result = await response.json()
    if (result.code !== 0) throw new Error(result.error || result.message || '爬取启动失败')
    const novelId = result.data?.novel_id
    if (novelId) {
      crawlNovelId.value = novelId
      crawlStatus.value = { novel_id: novelId, status: 'running', total: 0, done: 0, failed: 0, current: '' }
      startCrawlPoll(novelId)
    } else {
      crawlError.value = '未返回小说ID'
    }
  } catch (e: any) {
    crawlError.value = e.message || '爬取失败'
  } finally {
    crawlLoading.value = false
  }
}

const crawlPercent = computed(() => {
  const s = crawlStatus.value
  if (!s || s.total === 0) return 0
  return Math.round((s.done / s.total) * 100)
})

onUnmounted(() => stopCrawlPoll())
</script>

<template>
  <div class="max-w-2xl mx-auto py-8 px-4">
    <!-- 标题 -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">创建小说项目</h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">选择创建方式开始你的创作</p>
    </div>

    <!-- ═══ Screen 1: choose ════════════════════════════════════════════════════ -->
    <template v-if="step === 'choose'">
      <div class="grid grid-cols-2 gap-4">
        <!-- AI 生成 -->
        <button
          type="button"
          class="flex flex-col items-start p-6 bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 hover:border-purple-400 dark:hover:border-purple-500 transition-all shadow-sm text-left group"
          @click="step = 'ai-form'"
        >
          <div class="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-xl flex items-center justify-center mb-4 group-hover:bg-purple-200 dark:group-hover:bg-purple-800/40 transition-colors">
            <svg class="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.347.35A5.003 5.003 0 0012 17a5 5 0 01-4.546-2.916l-.346-.349z"/>
            </svg>
          </div>
          <h3 class="font-semibold text-gray-900 dark:text-white mb-1">AI 生成</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">配置小说基本信息，AI 自动生成世界观、角色、大纲、概要</p>
          <span class="mt-4 text-sm font-medium text-purple-600 dark:text-purple-400">选择 AI 生成 →</span>
        </button>

        <!-- 通过导入创建 -->
        <button
          type="button"
          class="flex flex-col items-start p-6 bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 transition-all shadow-sm text-left group"
          @click="step = 'import-choose'"
        >
          <div class="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center mb-4 group-hover:bg-blue-200 dark:group-hover:bg-blue-800/40 transition-colors">
            <svg class="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
            </svg>
          </div>
          <h3 class="font-semibold text-gray-900 dark:text-white mb-1">通过导入创建</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">上传本地文件或爬取小说网站，支持 TXT / EPUB / 爬虫</p>
          <span class="mt-4 text-sm font-medium text-blue-600 dark:text-blue-400">选择导入 →</span>
        </button>
      </div>
      <div class="mt-4 text-center">
        <NuxtLink to="/novel" class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
          取消
        </NuxtLink>
      </div>
    </template>

    <!-- ═══ Screen 2a: ai-form ══════════════════════════════════════════════════ -->
    <template v-else-if="step === 'ai-form'">
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">

        <!-- 封面颜色 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">项目图标</label>
          <div class="flex items-center gap-4">
            <div
              class="w-16 h-16 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
              :style="{ background: iconGradient(aiForm.cover_image) }"
            >
              <span class="text-2xl font-bold text-white opacity-80 select-none">
                {{ aiForm.title.charAt(0) || 'I' }}
              </span>
            </div>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="opt in iconOptions"
                :key="opt.value"
                type="button"
                class="w-8 h-8 rounded-lg transition-all"
                :class="aiForm.cover_image === opt.value
                  ? 'ring-2 ring-offset-2 ring-gray-400 scale-110'
                  : 'hover:scale-105'"
                :style="{ background: opt.gradient }"
                @click="aiForm.cover_image = opt.value"
              />
            </div>
          </div>
        </div>

        <!-- 小说名称 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            小说名称 <span class="text-red-500">*</span>
          </label>
          <input
            v-model="aiForm.title"
            type="text"
            maxlength="100"
            placeholder="给小说起个名字"
            class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm bg-white dark:bg-gray-700 dark:text-white"
          />
        </div>

        <!-- 频道 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">频道</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="opt in channelOptions"
              :key="opt.value"
              type="button"
              class="px-3 py-1.5 text-sm rounded-lg border transition-colors"
              :class="aiForm.channel === opt.value
                ? 'bg-purple-600 border-purple-600 text-white'
                : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-purple-400'"
              @click="aiForm.channel = opt.value"
            >{{ opt.label }}</button>
          </div>
        </div>

        <!-- 小说类型 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">小说类型</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="opt in genreOptions"
              :key="opt.value"
              type="button"
              class="px-3 py-1.5 text-sm rounded-lg border transition-colors"
              :class="aiForm.genre === opt.value
                ? 'bg-purple-600 border-purple-600 text-white'
                : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-purple-400'"
              @click="aiForm.genre = opt.value"
            >{{ opt.label }}</button>
          </div>
        </div>

        <!-- 作品概要 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">作品概要</label>
          <textarea
            v-model="aiForm.description"
            rows="3"
            maxlength="500"
            placeholder="简要描述故事背景、主角、核心冲突（可选，AI 会根据此生成大纲）"
            class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm resize-none bg-white dark:bg-gray-700 dark:text-white"
          />
          <p class="mt-1 text-xs text-gray-400 text-right">{{ aiForm.description.length }}/500</p>
        </div>

        <!-- 目标字数 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">目标字数</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="opt in wordCountOptions"
              :key="opt.value"
              type="button"
              class="px-3 py-1.5 text-sm rounded-lg border transition-colors"
              :class="aiForm.target_word_count === opt.value
                ? 'bg-purple-600 border-purple-600 text-white'
                : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-purple-400'"
              @click="aiForm.target_word_count = opt.value"
            >{{ opt.label }}</button>
          </div>
        </div>

        <!-- 期望章节数 -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">期望章节数</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="opt in chapterCountOptions"
              :key="opt.value"
              type="button"
              class="px-3 py-1.5 text-sm rounded-lg border transition-colors"
              :class="aiForm.target_chapters === opt.value
                ? 'bg-purple-600 border-purple-600 text-white'
                : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-purple-400'"
              @click="aiForm.target_chapters = opt.value"
            >{{ opt.label }}</button>
          </div>
        </div>

        <p v-if="aiError" class="text-red-500 text-sm">{{ aiError }}</p>

        <div class="flex items-center justify-between pt-2">
          <button
            type="button"
            class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            @click="step = 'choose'"
          >← 返回</button>
          <button
            type="button"
            :disabled="aiLoading || !aiForm.title.trim()"
            class="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white text-sm font-medium rounded-lg transition-colors"
            @click="submitAI"
          >{{ aiLoading ? '创建中...' : '创建并开始分析' }}</button>
        </div>
      </div>
    </template>

    <!-- ═══ Screen 2b: import-choose ═══════════════════════════════════════════ -->
    <template v-else-if="step === 'import-choose'">
      <div class="grid grid-cols-2 gap-4">
        <button
          type="button"
          class="flex flex-col items-start p-6 bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 hover:border-green-400 dark:hover:border-green-500 transition-all shadow-sm text-left group"
          @click="step = 'import-file'"
        >
          <div class="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-xl flex items-center justify-center mb-4 group-hover:bg-green-200 transition-colors">
            <svg class="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
            </svg>
          </div>
          <h3 class="font-semibold text-gray-900 dark:text-white mb-1">本地文件</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">上传 TXT / MD / EPUB / DOCX 格式的小说文件</p>
          <span class="mt-4 text-sm font-medium text-green-600 dark:text-green-400">选择文件 →</span>
        </button>

        <button
          type="button"
          class="flex flex-col items-start p-6 bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 hover:border-orange-400 dark:hover:border-orange-500 transition-all shadow-sm text-left group"
          @click="step = 'import-crawl'"
        >
          <div class="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-xl flex items-center justify-center mb-4 group-hover:bg-orange-200 transition-colors">
            <svg class="w-6 h-6 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
          </div>
          <h3 class="font-semibold text-gray-900 dark:text-white mb-1">爬取小说</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">输入小说网站 URL，支持起点、晋江、纵横等平台</p>
          <span class="mt-4 text-sm font-medium text-orange-600 dark:text-orange-400">开始爬取 →</span>
        </button>
      </div>
      <div class="mt-4">
        <button
          type="button"
          class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          @click="step = 'choose'"
        >← 返回</button>
      </div>
    </template>

    <!-- ═══ Screen 3a: import-file ══════════════════════════════════════════════ -->
    <template v-else-if="step === 'import-file'">
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">上传本地文件</h2>

        <!-- 拖拽上传区 -->
        <div
          class="border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer"
          :class="selectedFile
            ? 'border-green-400 bg-green-50 dark:bg-green-900/10'
            : 'border-gray-300 dark:border-gray-600 hover:border-purple-400 dark:hover:border-purple-500'"
          @click="fileInputRef?.click()"
          @drop="handleFileDrop"
          @dragover.prevent
        >
          <input
            ref="fileInputRef"
            type="file"
            accept=".txt,.md,.epub,.docx"
            class="hidden"
            @change="handleFileSelect"
          />
          <div v-if="selectedFile" class="space-y-2">
            <div class="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
              </svg>
            </div>
            <p class="font-medium text-gray-900 dark:text-white">{{ selectedFile.name }}</p>
            <p class="text-sm text-gray-500">{{ (selectedFile.size / 1024).toFixed(1) }} KB</p>
            <p class="text-xs text-gray-400">点击更换文件</p>
          </div>
          <div v-else class="space-y-2">
            <svg class="w-12 h-12 text-gray-400 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
            </svg>
            <p class="text-gray-600 dark:text-gray-300">拖拽文件到此处，或点击选择</p>
            <p class="text-sm text-gray-400">支持 TXT / MD / EPUB / DOCX，最大 50MB</p>
          </div>
        </div>

        <!-- 上传进度 -->
        <div v-if="fileUploading" class="space-y-2">
          <div class="flex justify-between text-sm text-gray-600 dark:text-gray-300">
            <span>上传中...</span>
            <span>{{ fileProgress }}%</span>
          </div>
          <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div class="bg-purple-600 h-2 rounded-full transition-all" :style="{ width: `${fileProgress}%` }" />
          </div>
        </div>

        <p v-if="fileError" class="text-red-500 text-sm">{{ fileError }}</p>

        <div class="flex items-center justify-between pt-2">
          <button
            type="button"
            class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            @click="step = 'import-choose'"
          >← 返回</button>
          <button
            type="button"
            :disabled="fileUploading || !selectedFile"
            class="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white text-sm font-medium rounded-lg transition-colors"
            @click="uploadFile"
          >{{ fileUploading ? '上传中...' : '开始导入' }}</button>
        </div>
      </div>
    </template>

    <!-- ═══ Screen 3b: import-crawl ═════════════════════════════════════════════ -->
    <template v-else-if="step === 'import-crawl'">
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-6">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">爬取小说</h2>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            小说 URL <span class="text-red-500">*</span>
          </label>
          <input
            v-model="crawlForm.url"
            type="url"
            placeholder="https://www.qidian.com/book/..."
            :disabled="crawlLoading || !!crawlStatus"
            class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm bg-white dark:bg-gray-700 dark:text-white disabled:opacity-60"
          />
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">站点（可选）</label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="opt in siteOptions"
              :key="opt.value"
              type="button"
              :disabled="crawlLoading || !!crawlStatus"
              class="px-3 py-1.5 text-sm rounded-lg border transition-colors disabled:opacity-60"
              :class="crawlForm.site_name === opt.value
                ? 'bg-purple-600 border-purple-600 text-white'
                : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:border-purple-400'"
              @click="crawlForm.site_name = opt.value"
            >{{ opt.label }}</button>
          </div>
        </div>

        <!-- 爬取进度 -->
        <div v-if="crawlStatus" class="space-y-2">
          <div class="flex justify-between text-sm text-gray-600 dark:text-gray-300">
            <span>{{ crawlStatus.status === 'completed' ? '爬取完成！正在跳转...' : `正在爬取：${crawlStatus.current || '初始化...'}` }}</span>
            <span>{{ crawlStatus.done }} / {{ crawlStatus.total || '?' }}</span>
          </div>
          <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              class="h-2 rounded-full transition-all"
              :class="crawlStatus.status === 'completed' ? 'bg-green-500' : 'bg-purple-600'"
              :style="{ width: `${crawlStatus.total > 0 ? crawlPercent : 20}%` }"
            />
          </div>
        </div>

        <p v-if="crawlError" class="text-red-500 text-sm">{{ crawlError }}</p>

        <div class="flex items-center justify-between pt-2">
          <button
            type="button"
            :disabled="crawlLoading || !!crawlStatus"
            class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-40"
            @click="step = 'import-choose'"
          >← 返回</button>
          <button
            type="button"
            :disabled="crawlLoading || !!crawlStatus || !crawlForm.url.trim()"
            class="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white text-sm font-medium rounded-lg transition-colors"
            @click="startCrawl"
          >{{ crawlLoading ? '启动中...' : crawlStatus ? '爬取中...' : '开始爬取' }}</button>
        </div>
      </div>
    </template>
  </div>
</template>
