<script setup lang="ts">
import type { CrawlProgress, CrawlConfig } from '~/composables/useCrawlApi'
import { defaultCrawlConfig } from '~/composables/useCrawlApi'
import { getAuthToken } from '~/utils/auth'

const router = useRouter()
const route = useRoute()
const config = useRuntimeConfig()
const apiBase = config.public.apiBase
const { getCrawlStatus, resumeCrawl } = useCrawlApi()
const { getNovels, getNovel } = useNovelApi()

// 导入状态
const importing = ref(false)
const importProgress = ref(0)
const importResult = ref<any>(null)
const importError = ref('')

// 项目内追加模式：从 URL query ?novel_id=X 读取，锁定追加到该项目
const lockedNovelId = computed(() => {
  const v = route.query.novel_id
  return v ? Number(v) : null
})
const lockedNovelTitle = ref('')

// 手动追加模式（无 novel_id 时的可选功能）
const appendMode = ref(false)
const appendNovelId = ref<number | null>(null)
const novelList = ref<Array<{ id: number; title: string }>>([])

// 实际生效的 novel_id（锁定优先）
const effectiveNovelId = computed(() =>
  lockedNovelId.value ?? (appendMode.value ? appendNovelId.value : null)
)

async function loadNovels() {
  try {
    const res = await getNovels({ page_size: 100 })
    if (res.code === 0 && res.data) {
      novelList.value = res.data.items.map((n: any) => ({ id: n.id, title: n.title }))
    }
  } catch (_) {}
}

watch(appendMode, (val) => {
  if (val && novelList.value.length === 0) loadNovels()
  if (!val) appendNovelId.value = null
})

// 初始化：若有 novel_id，加载小说标题
onMounted(async () => {
  if (lockedNovelId.value) {
    try {
      const res = await getNovel(lockedNovelId.value)
      if (res.code === 0 && res.data) lockedNovelTitle.value = res.data.title
    } catch (_) {}
  }
})

// 爬取进度
const crawlStatus = ref<CrawlProgress | null>(null)
const crawlNovelId = ref<number | null>(null)
const crawlPollTimer = ref<ReturnType<typeof setInterval> | null>(null)

function startCrawlPoll(novelId: number) {
  crawlNovelId.value = novelId
  crawlPollTimer.value = setInterval(async () => {
    try {
      const res = await getCrawlStatus(novelId)
      if (res.code === 0 && res.data) {
        crawlStatus.value = res.data
        if (res.data.status === 'completed' || res.data.status === 'failed') {
          stopCrawlPoll()
        }
      }
    } catch (_) {
      // ignore poll errors
    }
  }, 2000)
}

function stopCrawlPoll() {
  if (crawlPollTimer.value) {
    clearInterval(crawlPollTimer.value)
    crawlPollTimer.value = null
  }
}

async function handlePauseCrawl() {
  if (!crawlNovelId.value) return
  try {
    // Resume/pause is a toggle — calling resume on a running crawl is a no-op server-side;
    // the UI treats the status returned from the next poll as the source of truth.
    await resumeCrawl(crawlNovelId.value)
  } catch (_) {}
}

// ETA in human-readable form
const crawlETA = computed(() => {
  const s = crawlStatus.value
  if (!s || s.elapsed_secs <= 0 || s.done <= 0 || s.total <= s.done) return null
  const secsPerChapter = s.elapsed_secs / s.done
  const remaining = (s.total - s.done) * secsPerChapter
  if (remaining < 60) return `约 ${Math.ceil(remaining)} 秒`
  if (remaining < 3600) return `约 ${Math.ceil(remaining / 60)} 分钟`
  return `约 ${(remaining / 3600).toFixed(1)} 小时`
})

const crawlSpeedLabel = computed(() => {
  const s = crawlStatus.value
  if (!s || s.speed_cps <= 0) return null
  const kb = s.speed_cps / 1024
  return kb >= 1 ? `${kb.toFixed(1)} KB/s` : `${Math.round(s.speed_cps)} B/s`
})

const crawlBytesLabel = computed(() => {
  const b = crawlStatus.value?.bytes_downloaded ?? 0
  if (b === 0) return null
  if (b < 1024) return `${b} B`
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
  return `${(b / 1024 / 1024).toFixed(2)} MB`
})

onUnmounted(() => stopCrawlPoll())

// 高级爬取配置
const showAdvancedConfig = ref(false)
const crawlConfig = ref<CrawlConfig>(defaultCrawlConfig())

const delayOptions = [
  { label: '500 ms', value: 500 },
  { label: '1 秒', value: 1000 },
  { label: '2 秒 (推荐)', value: 2000 },
  { label: '3 秒', value: 3000 },
  { label: '5 秒', value: 5000 },
]

// 表单数据
const importForm = ref({
  source: 'file',
  url: '',
  file: null as File | null,
  format: 'auto',
  siteName: '',
})

const sources = [
  { value: 'file', label: '本地文件', icon: 'folder', formats: 'TXT, MD, JSON, HTML' },
  { value: 'url', label: '网络链接', icon: 'link', formats: '支持大多数小说网站' },
  { value: 'crawl', label: '爬取小说', icon: 'globe', formats: '支持任意小说网站' },
]

// 文件上传
const fileInput = ref<HTMLInputElement | null>(null)

function handleFileSelect(event: Event) {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    importForm.value.file = target.files[0]
    importForm.value.format = detectFormat(target.files[0].name)
  }
}

function detectFormat(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'txt': return 'txt'
    case 'md':
    case 'markdown': return 'md'
    case 'json': return 'json'
    case 'html':
    case 'htm': return 'html'
    case 'epub': return 'epub'
    default: return 'auto'
  }
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
    importForm.value.file = event.dataTransfer.files[0]
    importForm.value.format = detectFormat(event.dataTransfer.files[0].name)
  }
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
}

// 获取 auth header
function getAuthHeader(): Record<string, string> {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// 开始导入
async function handleImport() {
  importing.value = true
  importProgress.value = 0
  importResult.value = null
  importError.value = ''

  try {
    importProgress.value = 20

    let result: any

    const novelId = effectiveNovelId.value

    if (importForm.value.source === 'file') {
      const formData = new FormData()
      if (importForm.value.file) formData.append('file', importForm.value.file)
      formData.append('format', importForm.value.format)
      if (novelId) formData.append('novel_id', String(novelId))

      const response = await fetch(`${apiBase}/import/novel/file`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: formData,
      })
      result = await response.json()
    } else if (importForm.value.source === 'url') {
      const body: Record<string, unknown> = { url: importForm.value.url }
      if (novelId) body.novel_id = novelId
      const response = await fetch(`${apiBase}/import/novel/url`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(body),
      })
      result = await response.json()
    } else {
      const body: Record<string, unknown> = {
        url: importForm.value.url,
        site_name: importForm.value.siteName,
        config: crawlConfig.value,
      }
      if (novelId) body.novel_id = novelId
      const response = await fetch(`${apiBase}/import/novel/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(body),
      })
      result = await response.json()
    }

    if (result.code !== 0) throw new Error(result.error || '导入失败')

    importProgress.value = 100
    importResult.value = result.data

    // 爬取模式：后台异步爬取，启动进度轮询
    if (importForm.value.source === 'crawl' && result.data?.novel_id) {
      crawlStatus.value = null
      startCrawlPoll(result.data.novel_id)
    }
  } catch (error: any) {
    importError.value = error.message || '导入失败'
  } finally {
    importing.value = false
  }
}

function viewNovel() {
  if (importResult.value?.novel_id) {
    router.push(`/novel/${importResult.value.novel_id}`)
  }
}

function startAnalyze() {
  if (importResult.value?.novel_id) {
    router.push(`/novel/${importResult.value.novel_id}?analyze=1`)
  }
}

function reset() {
  stopCrawlPoll()
  importForm.value = { source: 'file', url: '', file: null, format: 'auto', siteName: '' }
  importResult.value = null
  importProgress.value = 0
  importError.value = ''
  crawlStatus.value = null
  crawlNovelId.value = null
  crawlConfig.value = defaultCrawlConfig()
  showAdvancedConfig.value = false
  // 非锁定模式才清空手动追加状态
  if (!lockedNovelId.value) {
    appendMode.value = false
    appendNovelId.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div>
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">导入小说</h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        从文件、链接或网站导入小说内容
      </p>
    </div>

    <!-- 锁定追加模式 Banner -->
    <div v-if="lockedNovelId" class="card p-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700 flex items-center gap-3">
      <svg class="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <p class="text-sm text-blue-700 dark:text-blue-300">
        导入内容将自动追加到项目
        <span class="font-semibold">「{{ lockedNovelTitle || `#${lockedNovelId}` }}」</span>
        中，不会新建项目
      </p>
    </div>

    <!-- Progress Bar -->
    <div v-if="importing" class="card p-4">
      <div class="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          class="h-full bg-primary-500 transition-all duration-300"
          :style="{ width: `${importProgress}%` }"
        />
      </div>
      <p class="mt-2 text-sm text-gray-500 text-center">
        {{ importProgress < 100 ? '正在导入小说...' : '完成！' }}
      </p>
    </div>

    <!-- Source Selection -->
    <div class="grid gap-4 md:grid-cols-3">
      <div
        v-for="source in sources"
        :key="source.value"
        class="card p-6 cursor-pointer transition-all"
        :class="importForm.source === source.value
          ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
          : 'hover:border-gray-300 dark:hover:border-gray-600'"
        @click="importForm.source = source.value"
      >
        <div class="flex items-center space-x-4">
          <div
            class="w-12 h-12 rounded-lg flex items-center justify-center"
            :class="importForm.source === source.value ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-gray-800'"
          >
            <svg v-if="source.icon === 'folder'" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <svg v-else-if="source.icon === 'link'" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
          </div>
          <div>
            <h3 class="font-medium text-gray-900 dark:text-white">{{ source.label }}</h3>
            <p class="text-sm text-gray-500">{{ source.formats }}</p>
          </div>
        </div>
        <div v-if="importForm.source === source.value" class="mt-4 flex items-center text-primary-600">
          <svg class="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          已选择
        </div>
      </div>
    </div>

    <!-- Import Options -->
    <div class="card p-6">
      <!-- File Upload -->
      <div v-if="importForm.source === 'file'" class="space-y-4">
        <h3 class="font-semibold text-gray-900 dark:text-white">上传文件</h3>
        <div
          class="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer"
          :class="importForm.file ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-primary-400'"
          @drop="handleDrop"
          @dragover="handleDragOver"
          @click="fileInput?.click()"
        >
          <input ref="fileInput" type="file" class="hidden" accept=".txt,.md,.json,.html,.htm" @change="handleFileSelect" />
          <div v-if="importForm.file" class="space-y-2">
            <svg class="w-12 h-12 mx-auto text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p class="font-medium text-gray-900 dark:text-white">{{ importForm.file.name }}</p>
            <p class="text-sm text-gray-500">点击或拖拽重新选择</p>
          </div>
          <div v-else class="space-y-2">
            <svg class="w-12 h-12 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p class="text-gray-600 dark:text-gray-400">点击或拖拽文件到此处</p>
            <p class="text-sm text-gray-500">支持 TXT, MD, JSON, HTML 格式</p>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">文件格式</label>
          <select v-model="importForm.format" class="input w-48">
            <option value="auto">自动检测</option>
            <option value="txt">TXT</option>
            <option value="md">Markdown</option>
            <option value="json">JSON</option>
            <option value="html">HTML</option>
          </select>
        </div>

        <!-- 手动追加模式（项目内锁定时隐藏） -->
        <div v-if="!lockedNovelId" class="border-t border-gray-200 dark:border-gray-700 pt-4">
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <input v-model="appendMode" type="checkbox" class="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">追加章节到已有小说</span>
          </label>
          <div v-if="appendMode" class="mt-3">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">选择目标小说</label>
            <select v-model="appendNovelId" class="input">
              <option :value="null">-- 请选择 --</option>
              <option v-for="n in novelList" :key="n.id" :value="n.id">{{ n.title }}</option>
            </select>
            <p v-if="novelList.length === 0" class="mt-1 text-sm text-gray-500">正在加载小说列表...</p>
          </div>
        </div>
      </div>

      <!-- URL Import -->
      <div v-else-if="importForm.source === 'url'" class="space-y-4">
        <h3 class="font-semibold text-gray-900 dark:text-white">网络链接</h3>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">小说 URL</label>
          <input v-model="importForm.url" type="url" class="input" placeholder="https://example.com/novel/xxx" />
          <p class="mt-1 text-sm text-gray-500">支持大多数小说网站的 URL</p>
        </div>
      </div>

      <!-- Crawl -->
      <div v-else class="space-y-4">
        <h3 class="font-semibold text-gray-900 dark:text-white">爬取小说</h3>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">小说页面 URL</label>
          <input v-model="importForm.url" type="url" class="input" placeholder="https://www.example.com/read/novel-id/" />
          <p class="mt-1 text-xs text-gray-500">支持任意小说站点；起点/晋江/纵横/七猫/红袖使用专用解析器，其他站点自动通用解析。请填写书目/目录页 URL，不支持搜索页。</p>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">站点（可选，留空自动检测）</label>
          <select v-model="importForm.siteName" class="input">
            <option value="">自动检测 / 通用解析</option>
            <option value="qidian">起点中文网</option>
            <option value="jjwxc">晋江文学城</option>
            <option value="zongheng">纵横中文网</option>
            <option value="qimao">七猫小说</option>
            <option value="hongxiu">红袖添香</option>
          </select>
        </div>

        <!-- 追加模式（项目内锁定时隐藏） -->
        <div v-if="!lockedNovelId" class="border-t border-gray-200 dark:border-gray-700 pt-4">
          <label class="flex items-center gap-2 cursor-pointer select-none">
            <input v-model="appendMode" type="checkbox" class="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
            <span class="text-sm font-medium text-gray-700 dark:text-gray-300">追加章节到已有小说</span>
          </label>
          <div v-if="appendMode" class="mt-3">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">选择目标小说</label>
            <select v-model="appendNovelId" class="input">
              <option :value="null">-- 请选择 --</option>
              <option v-for="n in novelList" :key="n.id" :value="n.id">{{ n.title }}</option>
            </select>
          </div>
        </div>

        <!-- 高级配置（可折叠） -->
        <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <button
            type="button"
            class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            @click="showAdvancedConfig = !showAdvancedConfig"
          >
            <span class="flex items-center gap-2">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              高级爬取配置
            </span>
            <svg class="w-4 h-4 transition-transform" :class="showAdvancedConfig ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          <div v-if="showAdvancedConfig" class="px-4 pb-4 pt-2 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-200 dark:border-gray-700">
            <!-- 并发数 -->
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                并发章节数：{{ crawlConfig.concurrency }}
              </label>
              <input
                v-model.number="crawlConfig.concurrency"
                type="range" min="1" max="5" step="1"
                class="w-full accent-primary-500"
              />
              <div class="flex justify-between text-xs text-gray-400 mt-0.5">
                <span>1（稳定）</span><span>3</span><span>5（快速）</span>
              </div>
            </div>

            <!-- 请求间隔 -->
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">请求间隔</label>
              <select v-model.number="crawlConfig.delay_ms" class="input text-sm">
                <option v-for="o in delayOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </div>

            <!-- UA 轮换 -->
            <label class="flex items-center gap-3 cursor-pointer select-none">
              <div
                class="relative w-10 h-5 rounded-full transition-colors"
                :class="crawlConfig.ua_rotation ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'"
                @click="crawlConfig.ua_rotation = !crawlConfig.ua_rotation"
              >
                <div class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                  :class="crawlConfig.ua_rotation ? 'left-5' : 'left-0.5'" />
              </div>
              <span class="text-sm text-gray-700 dark:text-gray-300">User-Agent 轮换</span>
            </label>

            <!-- 自动识别编码 -->
            <label class="flex items-center gap-3 cursor-pointer select-none">
              <div
                class="relative w-10 h-5 rounded-full transition-colors"
                :class="crawlConfig.detect_charset ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'"
                @click="crawlConfig.detect_charset = !crawlConfig.detect_charset"
              >
                <div class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                  :class="crawlConfig.detect_charset ? 'left-5' : 'left-0.5'" />
              </div>
              <span class="text-sm text-gray-700 dark:text-gray-300">自动识别编码（GBK等）</span>
            </label>

            <!-- 跳过付费章节 -->
            <label class="flex items-center gap-3 cursor-pointer select-none">
              <div
                class="relative w-10 h-5 rounded-full transition-colors"
                :class="crawlConfig.skip_vip_chaps ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'"
                @click="crawlConfig.skip_vip_chaps = !crawlConfig.skip_vip_chaps"
              >
                <div class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                  :class="crawlConfig.skip_vip_chaps ? 'left-5' : 'left-0.5'" />
              </div>
              <span class="text-sm text-gray-700 dark:text-gray-300">跳过付费章节</span>
            </label>

            <!-- 响应缓存 -->
            <label class="flex items-center gap-3 cursor-pointer select-none">
              <div
                class="relative w-10 h-5 rounded-full transition-colors"
                :class="crawlConfig.cache_enabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'"
                @click="crawlConfig.cache_enabled = !crawlConfig.cache_enabled"
              >
                <div class="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all"
                  :class="crawlConfig.cache_enabled ? 'left-5' : 'left-0.5'" />
              </div>
              <span class="text-sm text-gray-700 dark:text-gray-300">磁盘缓存（断点续爬更快）</span>
            </label>

            <!-- 代理 -->
            <div class="md:col-span-2">
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">代理地址（可选）</label>
              <input
                v-model="crawlConfig.proxy_url"
                type="url"
                class="input text-sm"
                placeholder="http://127.0.0.1:7890 或 socks5://..."
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex justify-between">
      <button class="btn-secondary" @click="reset">重置</button>
      <button
        class="btn-primary"
        :disabled="importing || (!importForm.url && !importForm.file) || (appendMode && !appendNovelId)"
        @click="handleImport"
      >
        <svg v-if="importing" class="w-5 h-5 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        {{ importing ? '导入中...' : '开始导入' }}
      </button>
    </div>

    <!-- Error -->
    <div v-if="importError" class="card p-4 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400">
      导入失败：{{ importError }}
    </div>

    <!-- Result -->
    <div v-if="importResult" class="card p-6 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
      <div class="flex items-center space-x-4 mb-4">
        <div class="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
          <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div>
          <h3 class="font-semibold text-gray-900 dark:text-white">导入成功！</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400">
            已导入「{{ importResult.title }}」，共 {{ importResult.total_chapters }} 章
          </p>
        </div>
      </div>
      <div class="flex gap-3">
        <button class="btn-secondary" @click="viewNovel">查看项目</button>
        <button class="btn-primary" @click="startAnalyze">开始 AI 分析 →</button>
      </div>
    </div>

    <!-- Crawl Progress Panel -->
    <div v-if="crawlStatus" class="card p-6 space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-semibold text-gray-900 dark:text-white">后台爬取进度</h3>
        <button
          v-if="crawlStatus.status === 'running'"
          class="btn-secondary text-xs py-1 px-3"
          @click="handlePauseCrawl"
        >
          暂停
        </button>
        <button
          v-else-if="crawlStatus.status === 'paused' && crawlNovelId"
          class="btn-primary text-xs py-1 px-3"
          @click="resumeCrawl(crawlNovelId!)"
        >
          继续
        </button>
      </div>

      <!-- 当前章节 -->
      <div class="text-sm text-gray-600 dark:text-gray-400 truncate">
        {{ crawlStatus.current || '准备中...' }}
      </div>

      <!-- 进度条 -->
      <div>
        <div class="mb-1 flex justify-between text-sm">
          <span class="font-medium text-gray-700 dark:text-gray-200">
            {{ crawlStatus.done }} / {{ crawlStatus.total }} 章
          </span>
          <span class="text-gray-500">
            {{ crawlStatus.total > 0 ? Math.round((crawlStatus.done / crawlStatus.total) * 100) : 0 }}%
          </span>
        </div>
        <div class="h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            class="h-full rounded-full transition-all duration-500"
            :class="{
              'bg-red-500': crawlStatus.status === 'failed',
              'bg-green-500': crawlStatus.status === 'completed',
              'bg-yellow-400': crawlStatus.status === 'paused',
              'bg-primary-500': crawlStatus.status === 'running',
            }"
            :style="{ width: `${crawlStatus.total > 0 ? Math.round((crawlStatus.done / crawlStatus.total) * 100) : 0}%` }"
          />
        </div>
      </div>

      <!-- 统计数据行 -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
          <div class="text-xs text-gray-500 mb-0.5">失败</div>
          <div class="text-sm font-semibold" :class="crawlStatus.failed > 0 ? 'text-red-500' : 'text-gray-700 dark:text-gray-200'">
            {{ crawlStatus.failed }}
          </div>
        </div>
        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
          <div class="text-xs text-gray-500 mb-0.5">已下载</div>
          <div class="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {{ crawlBytesLabel ?? '—' }}
          </div>
        </div>
        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
          <div class="text-xs text-gray-500 mb-0.5">速度</div>
          <div class="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {{ crawlSpeedLabel ?? '—' }}
          </div>
        </div>
        <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
          <div class="text-xs text-gray-500 mb-0.5">预计剩余</div>
          <div class="text-sm font-semibold text-gray-700 dark:text-gray-200">
            {{ crawlETA ?? '—' }}
          </div>
        </div>
      </div>

      <!-- 状态 + 提示 -->
      <div class="flex justify-between items-center text-xs">
        <span
          :class="{
            'text-yellow-600 dark:text-yellow-400': crawlStatus.status === 'running',
            'text-green-600 dark:text-green-400': crawlStatus.status === 'completed',
            'text-red-500': crawlStatus.status === 'failed',
            'text-gray-500': crawlStatus.status === 'paused',
          }"
        >
          <template v-if="crawlStatus.status === 'completed' && crawlStatus.failed > 0">
            爬取完成（{{ crawlStatus.failed }} 章内容为空，可能为 JS 渲染页面）
          </template>
          <template v-else>
            {{ { running: '爬取中', paused: '已暂停', completed: '爬取完成', failed: '全部章节获取失败' }[crawlStatus.status] }}
          </template>
          <template v-if="crawlStatus.pages_visited > 0">· {{ crawlStatus.pages_visited }} 页已访问</template>
        </span>
        <span class="text-gray-400">完成后自动生成 AI 摘要</span>
      </div>
    </div>
  </div>
</template>
