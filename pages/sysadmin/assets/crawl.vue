<script setup lang="ts">
import type { CrawlJob } from '~/types'

definePageMeta({ layout: 'sysadmin' })

const assetApi = useAssetApi()

const jobs = ref<CrawlJob[]>([])
const loading = ref(true)
const creating = ref(false)
const cancellingId = ref<number | null>(null)
const retryingId = ref<number | null>(null)
const pollingId = ref<ReturnType<typeof setInterval> | null>(null)

const form = reactive({
  source: 'unsplash',
  query: '',
  asset_type: 'image',
  license: '',
  limit: 20,
  crawl_depth: 0,
  url_pattern: '',
})

const isWebpage = computed(() => form.source === 'webpage')

const sourceOptions = [
  { value: 'unsplash', label: 'Unsplash（图片）' },
  { value: 'pexels', label: 'Pexels（图片/视频）' },
  { value: 'pixabay', label: 'Pixabay（图片/视频/音频）' },
  { value: 'freesound', label: 'Freesound（音效，CC0）' },
  { value: 'bbc-sfx', label: 'BBC Sound Effects（音效，免费）' },
  { value: 'nasa', label: 'NASA Images（图片/视频）' },
  { value: 'wikimedia', label: 'Wikimedia Commons（图片）' },
  { value: 'webpage', label: '自定义网页（HTML 解析）' },
]

const licenseOptions = [
  { value: '', label: '全部' },
  { value: 'CC0', label: 'CC0（无需署名，可商用）' },
  { value: 'CC-BY', label: 'CC-BY（需署名，可商用）' },
]

const assetTypeOptions = [
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'audio', label: '音频' },
]

const hasRunningJob = computed(() => jobs.value.some(j => j.status === 'pending' || j.status === 'running'))

async function cancelJob(job: CrawlJob) {
  cancellingId.value = job.id
  try {
    await assetApi.cancelCrawlJob(job.id)
    job.status = 'cancelled'
  } finally {
    cancellingId.value = null
  }
}

async function retryJob(job: CrawlJob) {
  retryingId.value = job.id
  try {
    const res = await assetApi.retryCrawlJob(job.id)
    Object.assign(job, res.data)
  } finally {
    retryingId.value = null
  }
}

async function loadJobs() {
  const res = await assetApi.listCrawlJobs()
  jobs.value = res.data?.items ?? []
  loading.value = false
}

async function createJob() {
  if (!form.query.trim()) return
  creating.value = true
  try {
    const res = await assetApi.createCrawlJob({
      source: form.source,
      query: form.query,
      asset_type: form.asset_type,
      license: form.license || undefined,
      limit: form.limit,
      crawl_depth: form.crawl_depth,
      url_pattern: form.url_pattern || undefined,
    })
    jobs.value.unshift(res.data)
    form.query = ''
  } finally {
    creating.value = false
  }
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    pending: '等待中',
    running: '运行中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消',
  }
  return map[status] ?? status
}

function statusClass(status: string) {
  const map: Record<string, string> = {
    pending: 'bg-yellow-900/40 text-yellow-300',
    running: 'bg-blue-900/40 text-blue-300',
    completed: 'bg-green-900/40 text-green-300',
    failed: 'bg-red-900/40 text-red-300',
    cancelled: 'bg-gray-700 text-gray-400',
  }
  return map[status] ?? 'bg-gray-700 text-gray-400'
}

function formatDate(s?: string) {
  if (!s) return '-'
  return new Date(s).toLocaleString('zh-CN')
}

onMounted(async () => {
  await loadJobs()
  pollingId.value = setInterval(async () => {
    if (hasRunningJob.value) await loadJobs()
  }, 5000)
})

onUnmounted(() => {
  if (pollingId.value) clearInterval(pollingId.value)
})
</script>

<template>
  <div class="p-6 max-w-5xl">
    <div class="mb-6">
      <h1 class="text-xl font-bold text-white">素材爬取</h1>
      <p class="text-sm text-gray-400 mt-1">从授权来源爬取素材，导入公共素材库</p>
    </div>

    <!-- Create job form -->
    <div class="bg-gray-800 rounded-xl border border-gray-700 p-6 mb-6">
      <h2 class="font-semibold text-gray-200 mb-4">新建爬取任务</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-400 mb-1">来源平台</label>
          <select v-model="form.source"
            class="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-700 text-gray-200">
            <option v-for="opt in sourceOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-400 mb-1">素材类型</label>
          <select v-model="form.asset_type"
            class="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-700 text-gray-200">
            <option v-for="opt in assetTypeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
          </select>
        </div>
        <div class="md:col-span-2">
          <label class="block text-sm font-medium text-gray-400 mb-1">
            {{ isWebpage ? '目标页面 URL' : '搜索关键词' }}
          </label>
          <input v-model="form.query" type="text"
            :placeholder="isWebpage ? 'https://example.com/gallery' : '例如：古风建筑、战斗场面、史诗配乐...'"
            @keyup.enter="createJob"
            class="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-700 text-gray-200 placeholder-gray-500" />
        </div>

        <template v-if="isWebpage">
          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">爬取深度</label>
            <select v-model.number="form.crawl_depth"
              class="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-700 text-gray-200">
              <option :value="0">单页（仅爬取目标 URL）</option>
              <option :value="1">跟随链接（同域名的子页面）</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">链接过滤（正则，可选）</label>
            <input v-model="form.url_pattern" type="text" placeholder="例如：/gallery/|/photos/"
              class="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-700 text-gray-200 placeholder-gray-500" />
          </div>
        </template>

        <template v-else>
          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">授权过滤</label>
            <select v-model="form.license"
              class="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-700 text-gray-200">
              <option v-for="opt in licenseOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
        </template>

        <div>
          <label class="block text-sm font-medium text-gray-400 mb-1">最大数量</label>
          <input v-model.number="form.limit" type="number" min="1" max="500"
            class="w-full border border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-700 text-gray-200" />
        </div>
      </div>

      <div v-if="isWebpage" class="mt-3 p-3 bg-amber-900/20 border border-amber-700/40 rounded-lg text-xs text-amber-300">
        <p class="font-medium mb-1">网页爬取说明</p>
        <p>从指定 HTML 页面提取 <code>img</code>/<code>video</code>/<code>audio</code> 标签及媒体链接，导入公共素材库。</p>
        <p class="mt-1">爬取的素材版权未知（标记为 unknown），请自行确认使用权限后再商用。</p>
        <p class="mt-1">深度=1 时最多跟随 30 个同域链接，总计不超过设定数量上限。</p>
      </div>
      <div v-else class="mt-3 p-3 bg-blue-900/20 border border-blue-700/40 rounded-lg text-xs text-blue-300">
        <p class="font-medium mb-1">版权合规说明</p>
        <p>所有爬取素材均来自版权安全来源（CC0/CC-BY/Unsplash/Pexels License），可免费用于商业用途。
          需要署名的素材在使用时会自动附带 attribution 信息。</p>
      </div>

      <div class="mt-4 flex justify-end">
        <button :disabled="!form.query.trim() || creating" @click="createJob"
          class="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm disabled:opacity-50 transition-colors">
          {{ creating ? '提交中...' : '开始爬取' }}
        </button>
      </div>
    </div>

    <!-- Jobs list -->
    <div class="bg-gray-800 rounded-xl border border-gray-700">
      <div class="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
        <h2 class="font-semibold text-gray-200">爬取记录</h2>
        <span v-if="hasRunningJob" class="text-xs text-blue-400 animate-pulse">● 自动刷新中</span>
      </div>

      <div v-if="loading" class="p-10 text-center text-gray-400 text-sm">加载中...</div>
      <div v-else-if="!jobs.length" class="p-10 text-center text-gray-500 text-sm">暂无爬取记录</div>

      <div v-else class="divide-y divide-gray-700">
        <div v-for="job in jobs" :key="job.id" class="px-6 py-4">
          <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-medium text-gray-200 truncate">{{ job.query }}</span>
                <span :class="statusClass(job.status)" class="text-xs px-2 py-0.5 rounded-full shrink-0">
                  {{ statusLabel(job.status) }}
                </span>
                <button
                  v-if="job.status === 'pending' || job.status === 'running'"
                  :disabled="cancellingId === job.id"
                  @click="cancelJob(job)"
                  class="text-xs px-2 py-0.5 rounded border border-red-700 text-red-400 hover:bg-red-900/30 disabled:opacity-50"
                >
                  {{ cancellingId === job.id ? '停止中...' : '停止' }}
                </button>
                <button
                  v-if="job.status === 'failed' || job.status === 'cancelled'"
                  :disabled="retryingId === job.id"
                  @click="retryJob(job)"
                  class="text-xs px-2 py-0.5 rounded border border-indigo-700 text-indigo-400 hover:bg-indigo-900/30 disabled:opacity-50"
                >
                  {{ retryingId === job.id ? '重试中...' : '重试' }}
                </button>
              </div>
              <div class="mt-1 flex flex-wrap gap-3 text-xs text-gray-500">
                <span>来源：{{ job.source }}</span>
                <span v-if="job.asset_type">类型：{{ job.asset_type }}</span>
                <span v-if="job.license">授权：{{ job.license }}</span>
                <span v-if="job.source === 'webpage'">深度：{{ job.crawl_depth === 1 ? '跟随链接' : '单页' }}</span>
                <span>上限：{{ job.limit }}</span>
              </div>
            </div>
            <div class="text-xs text-gray-500 text-right ml-4 shrink-0">
              <p>{{ formatDate(job.created_at) }}</p>
              <p v-if="job.completed_at" class="mt-0.5">完成：{{ formatDate(job.completed_at) }}</p>
            </div>
          </div>

          <div v-if="job.status === 'completed' || job.status === 'running' || job.total_found > 0"
            class="mt-3 flex gap-4 text-xs">
            <span class="text-gray-400">找到 <strong class="text-gray-200">{{ job.total_found }}</strong> 个</span>
            <span class="text-green-400">导入 <strong>{{ job.imported }}</strong></span>
            <span class="text-yellow-400">跳过 <strong>{{ job.skipped }}</strong></span>
            <span v-if="job.failed > 0" class="text-red-400">失败 <strong>{{ job.failed }}</strong></span>
          </div>

          <div v-if="job.status === 'running' && job.total_found > 0" class="mt-2">
            <div class="h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div class="h-full bg-indigo-500 rounded-full transition-all"
                :style="{ width: `${Math.round((job.imported + job.skipped + job.failed) / job.total_found * 100)}%` }" />
            </div>
          </div>

          <div v-if="job.error_msg" class="mt-2 text-xs text-red-400">{{ job.error_msg }}</div>
        </div>
      </div>
    </div>
  </div>
</template>
