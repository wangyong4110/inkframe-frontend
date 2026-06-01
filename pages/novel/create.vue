<script setup lang="ts">
import type { CrawlProgress } from '~/composables/useCrawlApi'
import { getAuthToken } from '~/utils/auth'
import type { Novel } from '~/types'

const { uploadImage, uploading: coverUploading } = useImageUpload()
const { generateCoverImage } = useNovelApi()
const toast = useToast()
const coverFileInput = ref<HTMLInputElement | null>(null)

async function onCoverFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const url = await uploadImage(file)
    aiForm.cover_image = url
  } catch (err: any) {
    aiError.value = err.message || '封面上传失败'
  } finally {
    if (coverFileInput.value) coverFileInput.value.value = ''
  }
}

function isCoverUrl(v: string) {
  return v.startsWith('http://') || v.startsWith('https://') || v.startsWith('/')
}

const router = useRouter()
const route = useRoute()
const config = useRuntimeConfig()
const apiBase = config.public.apiBase
const { request } = useApi()
const { getNovels } = useNovelApi()
const { createProject, startAnalysis } = useRewriteApi()

// ── LLM 配置前置检查 ──────────────────────────────────────────────────────────
const hasLLMProvider = ref<boolean | null>(null) // null = loading
const showNoLLMModal = ref(false)
const { getLLMCapableProviders } = useModelApi()

onMounted(async () => {
  if (route.query.tab === 'rewrite') {
    step.value = 'rewrite-form'
    rwStep.value = 1
  }

  try {
    const resp = await getLLMCapableProviders()
    const list = (resp as any).data ?? []
    hasLLMProvider.value = list.length > 0
  } catch {
    hasLLMProvider.value = null // 检查失败保持 null，不静默放行
  }
})

function selectAIGenerate() {
  if (hasLLMProvider.value === false) {
    showNoLLMModal.value = true
    return
  }
  // null = 仍在加载或检查失败，放行并让后端兜底
  step.value = 'ai-form'
}

// ── 步骤状态机 ────────────────────────────────────────────────────────────────
type Step = 'choose' | 'ai-form' | 'import-choose' | 'import-file' | 'import-crawl' | 'rewrite-form'
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
const genreOptions = [
  { label: '玄幻奇幻', value: 'fantasy' },
  { label: '仙侠修仙', value: 'xianxia' },
  { label: '都市现代', value: 'urban' },
  { label: '言情爱情', value: 'romance' },
  { label: '历史古代', value: 'historical' },
  { label: '科幻未来', value: 'scifi' },
  { label: '悬疑推理', value: 'mystery' },
  { label: '武侠江湖', value: 'wuxia' },
  { label: '灵异恐怖', value: 'horror' },
  { label: '游戏竞技', value: 'game' },
  { label: '军事战争', value: 'military' },
  { label: '体育竞技', value: 'sports' },
  { label: '青春校园', value: 'campus' },
  { label: '末世废土', value: 'apocalypse' },
  { label: '重生穿越', value: 'rebirth' },
  { label: '宫斗宅斗', value: 'palace' },
  { label: '系统流', value: 'system' },
  { label: '其他', value: 'other' },
]
const wordCountOptions = [
  { label: 'AI 自定', value: 0 },
  { label: '5万字', value: 50000 },
  { label: '10万字', value: 100000 },
  { label: '30万字', value: 300000 },
  { label: '50万字', value: 500000 },
  { label: '100万字', value: 1000000 },
]
const chapterCountOptions = [
  { label: 'AI 自定', value: 0 },
  { label: '30章', value: 30 },
  { label: '50章', value: 50 },
  { label: '100章', value: 100 },
  { label: '200章', value: 200 },
  { label: '300章', value: 300 },
]

const aiForm = reactive({
  title: '',
  genre: 'fantasy',
  description: '',
  target_word_count: 0,
  target_chapters: 0,
  cover_image: 'ai', // 默认使用 AI 生成封面
})
const aiLoading = ref(false)
const aiLoadingMsg = ref('创建中...')
const aiError = ref('')

async function submitAI() {
  if (!aiForm.title.trim()) { aiError.value = '请输入小说名称'; return }
  if (!aiForm.description.trim()) { aiError.value = '请填写作品概要'; return }
  aiError.value = ''
  aiLoading.value = true
  aiLoadingMsg.value = '创建中...'
  try {
    const body: Record<string, unknown> = {
      title: aiForm.title.trim(),
      description: aiForm.description.trim(),
      genre: aiForm.genre,
    }
    // 'ai' 特殊值：先不传 cover_image，创建后调用 AI 生成
    if (aiForm.cover_image !== 'ai') body.cover_image = aiForm.cover_image
    if (aiForm.target_word_count > 0) body.target_word_count = aiForm.target_word_count
    if (aiForm.target_chapters > 0) body.target_chapters = aiForm.target_chapters
    const data = await request<any>('/novels', {
      method: 'POST',
      body: JSON.stringify(body),
    })
    const novel = data.data ?? data
    if (!novel?.id) {
      aiError.value = '创建成功但未返回小说ID，请前往小说列表查看'
      return
    }
    // AI 生成封面（同步等待，失败不阻断导航）
    if (aiForm.cover_image === 'ai') {
      aiLoadingMsg.value = '生成封面中...'
      try {
        await generateCoverImage(novel.id)
      } catch (coverErr: any) {
        toast.error('封面生成失败，可在小说页面重新生成：' + (coverErr?.message || ''))
      }
    }
    router.push(`/novel/${novel.id}?analyze=1&source=ai`)
  } catch (e: any) {
    aiError.value = e.message || '创建失败'
  } finally {
    aiLoading.value = false
    aiLoadingMsg.value = '创建中...'
  }
}

// ── Screen 3a: 文件上传 ────────────────────────────────────────────────────────
const fileInputRef = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const fileUploading = ref(false)
const fileProgress = ref(0)
const fileError = ref('')

function getAuthHeader(): Record<string, string> {
  const token = getAuthToken()
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

const CHUNK_THRESHOLD = 5 * 1024 * 1024  // 5 MB — 超过此大小走分片上传
const CHUNK_SIZE      = 2 * 1024 * 1024  // 2 MB / 片

// Visual upload delay indicator: show "上传中，请稍候..." after 10s
let fileUploadSlowTimer: ReturnType<typeof setTimeout> | null = null
const fileUploadSlow = ref(false)

async function uploadFile() {
  if (!selectedFile.value) { fileError.value = '请选择文件'; return }
  fileError.value = ''
  fileUploading.value = true
  fileUploadSlow.value = false
  fileProgress.value = 5

  // Show slow-upload indicator after 10 seconds
  fileUploadSlowTimer = setTimeout(() => { fileUploadSlow.value = true }, 10_000)

  try {
    let taskId: string

    if (selectedFile.value.size >= CHUNK_THRESHOLD) {
      // ── 分片上传 ──────────────────────────────────────────────────
      taskId = await chunkedUpload(selectedFile.value)
    } else {
      // ── 普通上传 ──────────────────────────────────────────────────
      const formData = new FormData()
      formData.append('file', selectedFile.value)
      fileProgress.value = 20
      const response = await fetch(`${apiBase}/import/novel/file`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: formData,
      })
      const result = await response.json()
      if (result.code !== 0) throw new Error(result.error || result.message || '导入失败')
      taskId = result.data?.task_id
      if (!taskId) throw new Error('未获取到导入任务ID')
    }

    fileProgress.value = 50
    await pollImportTask(taskId)
  } catch (e: any) {
    fileError.value = e.message || '上传失败'
  } finally {
    // ALWAYS reset uploading state, even on timeout/abort/error
    fileUploading.value = false
    fileUploadSlow.value = false
    if (fileUploadSlowTimer !== null) {
      clearTimeout(fileUploadSlowTimer)
      fileUploadSlowTimer = null
    }
  }
}

/** 分片上传：init → N×chunk → complete，返回 task_id */
async function chunkedUpload(file: File): Promise<string> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)

  // 1. 初始化会话
  const initRes = await fetch(`${apiBase}/import/novel/file/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ filename: file.name, total_chunks: totalChunks }),
  })
  const initData = await initRes.json()
  if (initData.code !== 0) throw new Error(initData.error || initData.message || '初始化分片上传失败')
  const uploadId: string = initData.data?.upload_id
  if (!uploadId) throw new Error('未获取到 upload_id')

  // 2. 逐片上传
  for (let i = 1; i <= totalChunks; i++) {
    const start = (i - 1) * CHUNK_SIZE
    const chunk = file.slice(start, start + CHUNK_SIZE)
    const fd = new FormData()
    fd.append('upload_id', uploadId)
    fd.append('chunk_no', String(i))
    fd.append('chunk', chunk, file.name)
    const r = await fetch(`${apiBase}/import/novel/file/chunk`, {
      method: 'PUT',
      headers: getAuthHeader(),
      body: fd,
    })
    const rd = await r.json()
    if (rd.code !== 0) throw new Error(rd.error || rd.message || `片段 ${i} 上传失败`)
    // 进度：5 → 45（分片上传阶段占 40%）
    fileProgress.value = 5 + Math.round((i / totalChunks) * 40)
  }

  // 3. 完成组装
  const completeRes = await fetch(`${apiBase}/import/novel/file/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ upload_id: uploadId }),
  })
  const completeData = await completeRes.json()
  if (completeData.code !== 0) throw new Error(completeData.error || completeData.message || '组装分片失败')
  const taskId: string = completeData.data?.task_id
  if (!taskId) throw new Error('未获取到 task_id')
  return taskId
}

async function pollImportTask(taskId: string) {
  const maxWait = 15 * 60 * 1000 // 15 分钟超时（大文件导入）
  const interval = 1500
  const start = Date.now()

  const tick = async () => {
    if (Date.now() - start > maxWait) {
      fileError.value = '导入超时，请检查文件是否过大'
      fileUploading.value = false
      return
    }
    try {
      const res = await fetch(`${apiBase}/tasks/${taskId}`, { headers: getAuthHeader() })
      const data = await res.json()
      const task = data.data
      if (!task) { setTimeout(tick, interval); return }
      const taskData = task.data ?? {}

      if (task.status === 'completed') {
        fileProgress.value = 100
        fileUploading.value = false
        if (taskData.novel_id) {
          // 若后端已启动分析，直接跟踪已有任务；否则让详情页触发分析
          const q = taskData.analysis_task_id
            ? `analysis_task_id=${taskData.analysis_task_id}`
            : 'analyze=1'
          router.push(`/novel/${taskData.novel_id}?${q}`)
        } else {
          fileError.value = '导入完成但未返回小说ID'
        }
      } else if (task.status === 'failed') {
        fileError.value = task.error || taskData.message || '导入失败'
        fileUploading.value = false
      } else {
        // running/pending — keep polling, animate progress 50→90
        fileProgress.value = Math.min(90, fileProgress.value + 2)
        setTimeout(tick, interval)
      }
    } catch {
      setTimeout(tick, interval)
    }
  }
  setTimeout(tick, interval)
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

const siteOptions = [
  { label: '自动检测', value: '' },
  { label: '起点中文网', value: 'qidian' },
  { label: '晋江文学城', value: 'jjwxc' },
  { label: '纵横中文网', value: 'zongheng' },
]


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

    // 后端已改为异步（202 + task_id），通过统一任务状态接口轮询
    const taskId = result.data?.task_id
    if (!taskId) throw new Error('未返回任务ID')
    crawlStatus.value = { novel_id: 0, status: 'running', total: 0, done: 0, failed: 0, current: '' }
    pollCrawlTask(taskId)
  } catch (e: any) {
    crawlError.value = e.message || '爬取失败'
    crawlLoading.value = false
  }
}

/** 轮询爬取任务状态，更新 crawlStatus */
function pollCrawlTask(taskId: string) {
  const maxWait = 30 * 60 * 1000 // 30 分钟
  const start = Date.now()

  const tick = async () => {
    if (Date.now() - start > maxWait) {
      crawlError.value = '爬取超时'
      crawlLoading.value = false
      return
    }
    try {
      const res = await fetch(`${apiBase}/tasks/${taskId}`, { headers: getAuthHeader() })
      const data = await res.json()
      const task = data.data
      if (!task) { setTimeout(tick, 2000); return }
      const taskData = task.data ?? {}

      // 同步爬取进度到 crawlStatus
      if (taskData.novel_id) crawlNovelId.value = taskData.novel_id
      if (taskData.crawl_total > 0 || taskData.crawl_done > 0) {
        crawlStatus.value = {
          novel_id: taskData.novel_id || crawlNovelId.value || 0,
          status: task.status === 'completed' ? 'completed' : 'running',
          total: taskData.crawl_total || 0,
          done: taskData.crawl_done || 0,
          failed: 0,
          current: taskData.crawl_current || '',
        }
      }

      if (task.status === 'completed') {
        crawlLoading.value = false
        if (taskData.novel_id) {
          const q = taskData.analysis_task_id
            ? `analysis_task_id=${taskData.analysis_task_id}`
            : 'analyze=1'
          router.push(`/novel/${taskData.novel_id}?${q}`)
        } else {
          crawlError.value = '爬取完成但未返回小说ID'
        }
      } else if (task.status === 'failed') {
        crawlError.value = task.error || taskData.message || '爬取失败'
        crawlLoading.value = false
      } else {
        setTimeout(tick, 2000)
      }
    } catch {
      setTimeout(tick, 2000)
    }
  }
  setTimeout(tick, 2000)
}

const crawlPercent = computed(() => {
  const s = crawlStatus.value
  if (!s || s.total === 0) return 0
  return Math.round((s.done / s.total) * 100)
})

// ── Screen: rewrite-form ──────────────────────────────────────────────────────
const rwStep = ref<1 | 2>(1)

type RwSourceMode = 'search' | 'upload'
const rwSourceMode = ref<RwSourceMode>('search')

const rwNovelSearch = ref('')
const rwNovelResults = ref<Novel[]>([])
const rwSelectedNovel = ref<Novel | null>(null)

const rwFileInputRef = ref<HTMLInputElement | null>(null)
const rwSelectedFile = ref<File | null>(null)
const rwFileUploading = ref(false)
const rwFileProgress = ref(0)
const rwFileError = ref('')
const rwUploadedNovelId = ref<number | null>(null)

const rwForm = ref({ name: '', level: 3 })
const rwSubmitting = ref(false)
const rwError = ref('')

const rwLevels = [
  {
    emoji: '✏️', name: '字词润色', tag: '⚠️ 衍生作品·需授权',
    desc: '仅做词句级同义替换，情节、对话、结构完全保留。法律性质为衍生作品，需取得原著版权方书面授权。',
    activeClass: 'border-sky-500 bg-sky-500/10', tagClass: 'bg-red-500/20 text-red-300',
    barColor: 'bg-sky-400', retention: 5, retentionText: '90-95%', needsAuth: true,
  },
  {
    emoji: '✍️', name: '文学精炼', tag: '⚠️ 衍生作品·需授权',
    desc: '保留 80-90% 情节结构，用全新文学语言重新表达。仍属衍生作品范畴，商业使用前请确认版权授权。',
    activeClass: 'border-blue-500 bg-blue-500/10', tagClass: 'bg-red-500/20 text-red-300',
    barColor: 'bg-blue-400', retention: 4, retentionText: '80-90%', needsAuth: true,
  },
  {
    emoji: '🔀', name: '题材借鉴', tag: '🔶 灰色地带',
    desc: '保留故事核与情感逻辑，全面调整情节细节、场景顺序和对话语气，属于版权灰色地带。',
    activeClass: 'border-teal-500 bg-teal-500/10', tagClass: 'bg-amber-500/20 text-amber-300',
    barColor: 'bg-teal-400', retention: 3, retentionText: '60-75%', needsAuth: false,
  },
  {
    emoji: '🔄', name: '精神传承', tag: '✅ 独立作品（推荐）',
    desc: '仅保留母题与情感内核，彻底重构世界观、角色关系与情节形式。法律上构成独立作品，推荐用于商业出版。',
    activeClass: 'border-violet-500 bg-violet-500/10', tagClass: 'bg-emerald-500/20 text-emerald-300',
    barColor: 'bg-violet-400', retention: 2, retentionText: '30-50%', needsAuth: false,
  },
  {
    emoji: '🔥', name: '深度蒸馏', tag: '✅ 独立作品',
    desc: '只保留主题共鸣，全面重创世界观、人物与叙事形式。词汇相似度 < 18%，通过版权独创性检测。',
    activeClass: 'border-amber-500 bg-amber-500/10', tagClass: 'bg-emerald-500/20 text-emerald-300',
    barColor: 'bg-amber-400', retention: 1, retentionText: '5-20%', needsAuth: false,
  },
]

async function rwSearchNovels() {
  if (!rwNovelSearch.value.trim()) { rwNovelResults.value = []; return }
  try {
    const res = await getNovels({ page: 1, page_size: 100 })
    const keyword = rwNovelSearch.value.trim().toLowerCase()
    rwNovelResults.value = (res.data?.items || []).filter((n: Novel) =>
      n.title.toLowerCase().includes(keyword)
    )
  } catch {}
}

function rwSelectNovel(novel: Novel) {
  rwSelectedNovel.value = novel
  if (!rwForm.value.name) rwForm.value.name = `「${novel.title}」改写版`
}

function rwHandleFileSelect(e: Event) {
  const t = e.target as HTMLInputElement
  if (t.files?.[0]) { rwSelectedFile.value = t.files[0]; rwUploadedNovelId.value = null; rwFileError.value = ''; rwFileProgress.value = 0; rwUploadFile() }
}

function rwHandleFileDrop(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer?.files?.[0]) { rwSelectedFile.value = e.dataTransfer.files[0]; rwUploadedNovelId.value = null; rwFileError.value = ''; rwFileProgress.value = 0; rwUploadFile() }
}

async function rwUploadFile() {
  if (!rwSelectedFile.value) return
  rwFileError.value = ''; rwFileUploading.value = true; rwFileProgress.value = 5; rwUploadedNovelId.value = null
  try {
    let taskId: string
    if (rwSelectedFile.value.size >= CHUNK_THRESHOLD) {
      taskId = await rwChunkedUpload(rwSelectedFile.value)
    } else {
      const formData = new FormData()
      formData.append('file', rwSelectedFile.value)
      rwFileProgress.value = 20
      const response = await fetch(`${apiBase}/import/novel/file`, { method: 'POST', headers: getAuthHeader(), body: formData })
      const result = await response.json()
      if (result.code !== 0) throw new Error(result.error || result.message || '导入失败')
      taskId = result.data?.task_id
      if (!taskId) throw new Error('未获取到导入任务ID')
    }
    rwFileProgress.value = 50
    await rwPollUploadTask(taskId)
  } catch (e: any) {
    rwFileError.value = e.message || '上传失败'; rwFileUploading.value = false
  }
}

async function rwChunkedUpload(file: File): Promise<string> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
  const initData = await (await fetch(`${apiBase}/import/novel/file/init`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ filename: file.name, total_chunks: totalChunks }),
  })).json()
  if (initData.code !== 0) throw new Error(initData.error || '初始化分片上传失败')
  const uploadId: string = initData.data?.upload_id
  if (!uploadId) throw new Error('未获取到 upload_id')
  for (let i = 1; i <= totalChunks; i++) {
    const fd = new FormData()
    fd.append('upload_id', uploadId); fd.append('chunk_no', String(i))
    fd.append('chunk', file.slice((i - 1) * CHUNK_SIZE, i * CHUNK_SIZE), file.name)
    const rd = await (await fetch(`${apiBase}/import/novel/file/chunk`, { method: 'PUT', headers: getAuthHeader(), body: fd })).json()
    if (rd.code !== 0) throw new Error(rd.error || `片段 ${i} 上传失败`)
    rwFileProgress.value = 5 + Math.round((i / totalChunks) * 40)
  }
  const completeData = await (await fetch(`${apiBase}/import/novel/file/complete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ upload_id: uploadId }),
  })).json()
  if (completeData.code !== 0) throw new Error(completeData.error || '组装分片失败')
  const taskId: string = completeData.data?.task_id
  if (!taskId) throw new Error('未获取到 task_id')
  return taskId
}

async function rwPollUploadTask(taskId: string) {
  const maxWait = 5 * 60 * 1000; const interval = 1500; const start = Date.now()
  const tick = async () => {
    if (Date.now() - start > maxWait) { rwFileError.value = '导入超时'; rwFileUploading.value = false; return }
    try {
      const data = await (await fetch(`${apiBase}/tasks/${taskId}`, { headers: getAuthHeader() })).json()
      const task = data.data; if (!task) { setTimeout(tick, interval); return }
      const td = task.data ?? {}
      if (task.status === 'completed') {
        rwFileProgress.value = 100; rwFileUploading.value = false
        if (td.novel_id) {
          rwUploadedNovelId.value = td.novel_id
          if (!rwForm.value.name) rwForm.value.name = `「${rwSelectedFile.value?.name.replace(/\.(txt|epub|docx|md)$/i, '') ?? '小说'}」改写版`
        } else { rwFileError.value = '导入完成但未返回小说ID' }
      } else if (task.status === 'failed') {
        rwFileError.value = task.error || td.message || '导入失败'; rwFileUploading.value = false
      } else { rwFileProgress.value = Math.min(90, rwFileProgress.value + 2); setTimeout(tick, interval) }
    } catch { setTimeout(tick, interval) }
  }
  setTimeout(tick, interval)
}

const rwSourceNovelId = computed(() =>
  rwSourceMode.value === 'search' ? (rwSelectedNovel.value?.id ?? null) : rwUploadedNovelId.value
)
const rwCanSubmit = computed(() =>
  !!rwSourceNovelId.value && rwForm.value.name.trim().length > 0 && !rwSubmitting.value && !rwFileUploading.value
)

async function rwSubmit() {
  if (!rwCanSubmit.value || !rwSourceNovelId.value) return
  rwSubmitting.value = true; rwError.value = ''
  try {
    const res = await createProject({ novel_id: rwSourceNovelId.value, name: rwForm.value.name, level: rwForm.value.level })
    const project = res.data
    await startAnalysis(project.id)
    router.push(`/rewrite/${project.id}`)
  } catch (e: any) {
    rwError.value = e.message || '创建失败'
  } finally {
    rwSubmitting.value = false
  }
}

</script>

<template>
  <div class="max-w-2xl mx-auto py-8 px-4">
    <!-- 标题 -->
    <div class="mb-6">
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
        {{ step === 'rewrite-form' ? 'AI 改写' : '创建小说项目' }}
      </h1>
      <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {{ step === 'rewrite-form' ? '基于已有小说进行 AI 改写，规避版权风险，保留故事精髓' : '选择创建方式开始你的创作' }}
      </p>
    </div>

    <!-- 未配置 LLM 拦截模态框 -->
    <Teleport to="body">
      <Transition name="modal-fade">
        <div
          v-if="showNoLLMModal"
          class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          @click.self="showNoLLMModal = false"
        >
          <div class="w-full max-w-sm mx-4 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 space-y-4">
            <!-- 图标 -->
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                <svg class="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                </svg>
              </div>
              <h3 class="text-base font-semibold text-gray-900 dark:text-white">尚未配置 AI 模型</h3>
            </div>
            <!-- 说明 -->
            <p class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">
              使用 AI 生成功能需要至少配置一个文本生成（LLM）提供商并填写有效的 API Key。
            </p>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              前往 <span class="font-medium text-gray-700 dark:text-gray-200">模型 → 模型提供商</span>，添加并配置你的 AI 服务商（如 OpenAI、DeepSeek、Claude 等）。
            </p>
            <!-- 操作 -->
            <div class="flex gap-3 pt-1">
              <button
                class="flex-1 px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                @click="showNoLLMModal = false"
              >稍后再说</button>
              <NuxtLink
                to="/model"
                class="flex-1 px-4 py-2 text-sm rounded-lg bg-purple-600 text-white text-center hover:bg-purple-700 transition-colors font-medium"
                @click="showNoLLMModal = false"
              >去配置模型 →</NuxtLink>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ═══ Screen 1: choose ════════════════════════════════════════════════════ -->
    <template v-if="step === 'choose'">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <!-- AI 生成 -->
        <button
          type="button"
          class="flex flex-col items-start p-6 bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 hover:border-purple-400 dark:hover:border-purple-500 transition-all shadow-sm text-left group"
          @click="selectAIGenerate"
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

        <!-- 导入小说 -->
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
          <h3 class="font-semibold text-gray-900 dark:text-white mb-1">导入小说</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">上传本地文件或爬取小说网站，支持 TXT / EPUB / 爬虫</p>
          <span class="mt-4 text-sm font-medium text-blue-600 dark:text-blue-400">选择导入 →</span>
        </button>

        <!-- AI 改写 -->
        <button
          type="button"
          class="flex flex-col items-start p-6 bg-white dark:bg-gray-800 rounded-2xl border-2 border-gray-200 dark:border-gray-700 hover:border-amber-400 dark:hover:border-amber-500 transition-all shadow-sm text-left group"
          @click="step = 'rewrite-form'; rwStep = 1"
        >
          <div class="w-12 h-12 bg-amber-100 dark:bg-amber-900/30 rounded-xl flex items-center justify-center mb-4 group-hover:bg-amber-200 dark:group-hover:bg-amber-800/40 transition-colors">
            <svg class="w-6 h-6 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
            </svg>
          </div>
          <h3 class="font-semibold text-gray-900 dark:text-white mb-1">AI 改写</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">基于已有小说进行 AI 改写，规避版权风险，保留故事精髓</p>
          <span class="mt-4 text-sm font-medium text-amber-600 dark:text-amber-400">选择改写 →</span>
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
      <div class="card p-6 space-y-5">

        <!-- 图标 + 名称 同行 -->
        <div class="flex items-start gap-4">
          <!-- 封面预览 + 上传触发 -->
          <div class="shrink-0">
            <div
              class="w-16 h-16 rounded-xl flex items-center justify-center shadow-sm overflow-hidden cursor-pointer group relative"
              :style="isCoverUrl(aiForm.cover_image)
                ? `background-image:url(${aiForm.cover_image});background-size:cover;background-position:center`
                : `background:${iconGradient(aiForm.cover_image)}`"
              @click="coverFileInput?.click()"
            >
              <!-- AI 生成封面：显示魔法棒图标 -->
              <template v-if="aiForm.cover_image === 'ai'">
                <svg class="w-7 h-7 text-white drop-shadow" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456Z"/>
                </svg>
              </template>
              <span v-else-if="!isCoverUrl(aiForm.cover_image)" class="text-2xl font-bold text-white opacity-80 select-none">
                {{ aiForm.title.charAt(0) || 'I' }}
              </span>
              <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center rounded-xl">
                <svg v-if="!coverUploading" class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
                </svg>
                <div v-else class="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            </div>
            <input ref="coverFileInput" type="file" accept="image/*" class="hidden" @change="onCoverFileChange" />
          </div>
          <div class="flex-1 min-w-0">
            <input
              v-model="aiForm.title"
              type="text"
              maxlength="100"
              placeholder="给小说起个名字"
              class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm bg-white dark:bg-gray-700 dark:text-white mb-2"
            />
            <div class="flex gap-1.5 flex-wrap items-center">
              <!-- AI 生成封面按钮 -->
              <button
                type="button"
                class="px-2 py-0.5 text-xs rounded-md border transition-colors flex items-center gap-1"
                :class="aiForm.cover_image === 'ai'
                  ? 'bg-purple-600 border-purple-600 text-white'
                  : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-purple-400'"
                @click="aiForm.cover_image = 'ai'"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z"/>
                </svg>
                AI 生成
              </button>
              <button
                v-for="opt in iconOptions"
                :key="opt.value"
                type="button"
                class="w-6 h-6 rounded-md transition-all"
                :class="aiForm.cover_image === opt.value
                  ? 'ring-2 ring-offset-1 ring-gray-400 scale-110'
                  : 'hover:scale-110'"
                :style="{ background: opt.gradient }"
                @click="aiForm.cover_image = opt.value"
              />
              <span class="text-xs text-gray-400 ml-1">或</span>
              <button type="button" class="text-xs text-purple-500 hover:text-purple-700 underline" @click="coverFileInput?.click()">
                上传封面
              </button>
            </div>
          </div>
        </div>

        <!-- 小说类型 -->
        <div>
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">小说类型</p>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="opt in genreOptions"
              :key="opt.value"
              type="button"
              class="px-2.5 py-1 text-xs rounded-lg border transition-colors"
              :class="aiForm.genre === opt.value
                ? 'bg-purple-600 border-purple-600 text-white'
                : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-purple-400'"
              @click="aiForm.genre = opt.value"
            >{{ opt.label }}</button>
          </div>
        </div>

        <!-- 作品概要 -->
        <div>
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
            作品概要 <span class="text-red-500 normal-case font-normal">*</span>
          </p>
          <div class="relative">
            <textarea
              v-model="aiForm.description"
              rows="3"
              placeholder="简要描述故事背景、主角、核心冲突，AI 会根据此生成大纲"
              class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm resize-none bg-white dark:bg-gray-700 dark:text-white"
            />
            <span class="absolute bottom-2.5 right-3 text-xs text-gray-400 pointer-events-none">{{ aiForm.description.length }} 字</span>
          </div>
        </div>

        <!-- 目标规模 2 列 -->
        <div class="grid grid-cols-2 gap-4">
          <!-- 目标字数 -->
          <div>
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">目标字数</p>
            <div class="flex flex-wrap gap-1.5 mb-2">
              <button
                v-for="opt in wordCountOptions"
                :key="opt.value"
                type="button"
                class="px-2.5 py-1 text-xs rounded-lg border transition-colors"
                :class="aiForm.target_word_count === opt.value
                  ? 'bg-purple-600 border-purple-600 text-white'
                  : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-purple-400'"
                @click="aiForm.target_word_count = opt.value"
              >{{ opt.label }}</button>
            </div>
            <input
              v-if="aiForm.target_word_count > 0"
              v-model.number="aiForm.target_word_count"
              type="number"
              min="1000"
              step="10000"
              class="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:border-purple-400"
            />
          </div>

          <!-- 期望章节数 -->
          <div>
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">期望章节数</p>
            <div class="flex flex-wrap gap-1.5 mb-2">
              <button
                v-for="opt in chapterCountOptions"
                :key="opt.value"
                type="button"
                class="px-2.5 py-1 text-xs rounded-lg border transition-colors"
                :class="aiForm.target_chapters === opt.value
                  ? 'bg-purple-600 border-purple-600 text-white'
                  : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-purple-400'"
                @click="aiForm.target_chapters = opt.value"
              >{{ opt.label }}</button>
            </div>
            <input
              v-if="aiForm.target_chapters > 0"
              v-model.number="aiForm.target_chapters"
              type="number"
              min="1"
              step="10"
              class="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:border-purple-400"
            />
          </div>
        </div>

        <p v-if="aiError" class="text-red-500 text-sm">{{ aiError }}</p>

        <div class="flex items-center justify-between pt-1">
          <button
            type="button"
            class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            @click="step = 'choose'"
          >← 返回</button>
          <button
            type="button"
            :disabled="aiLoading || !aiForm.title.trim() || !aiForm.description.trim()"
            class="btn-primary"
            @click="submitAI"
          >{{ aiLoading ? aiLoadingMsg : '创建并开始分析' }}</button>
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
      <div class="card p-6 space-y-6">
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
            <span class="flex items-center gap-1.5">
              <span v-if="fileUploadSlow" class="inline-block w-3 h-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
              {{ fileProgress < 50 ? (fileUploadSlow ? '上传中，请稍候...' : '上传中...') : '解析导入中...' }}
            </span>
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
            class="btn-primary"
            @click="uploadFile"
          >{{ fileUploading ? '上传中...' : '开始导入' }}</button>
        </div>
      </div>
    </template>

    <!-- ═══ Screen 3b: import-crawl ═════════════════════════════════════════════ -->
    <template v-else-if="step === 'import-crawl'">
      <div class="card p-6 space-y-6">
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
            class="btn-primary"
            @click="startCrawl"
          >{{ crawlLoading ? '启动中...' : crawlStatus ? '爬取中...' : '开始爬取' }}</button>
        </div>
      </div>
    </template>

    <!-- ═══ Screen: rewrite-form ════════════════════════════════════════════════ -->
    <template v-else-if="step === 'rewrite-form'">
      <!-- 步骤指示器 -->
      <div class="flex items-center gap-3 mb-6">
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors"
            :class="rwStep >= 1 ? 'bg-amber-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'">1</div>
          <span class="text-sm font-medium" :class="rwStep === 1 ? 'text-amber-400' : 'text-gray-400'">选择原始小说</span>
        </div>
        <div class="flex-1 h-px" :class="rwStep >= 2 ? 'bg-amber-500/50' : 'bg-gray-700'" />
        <div class="flex items-center gap-2">
          <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors"
            :class="rwStep >= 2 ? 'bg-amber-500 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-500'">2</div>
          <span class="text-sm font-medium" :class="rwStep === 2 ? 'text-amber-400' : 'text-gray-400'">改写配置</span>
        </div>
      </div>

      <!-- ─── Step 1: 选择原始小说 ──────────────────────────────────────────── -->
      <template v-if="rwStep === 1">
        <div class="card p-6 space-y-4">
          <div class="flex gap-2">
            <button
              type="button"
              class="flex-1 py-2 text-sm font-medium rounded-lg border transition-colors"
              :class="rwSourceMode === 'search' ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-gray-300 dark:border-gray-600 text-gray-500 hover:border-gray-400'"
              @click="rwSourceMode = 'search'"
            >从系统小说选择</button>
            <button
              type="button"
              class="flex-1 py-2 text-sm font-medium rounded-lg border transition-colors"
              :class="rwSourceMode === 'upload' ? 'border-amber-500 bg-amber-500/10 text-amber-400' : 'border-gray-300 dark:border-gray-600 text-gray-500 hover:border-gray-400'"
              @click="rwSourceMode = 'upload'"
            >上传本地文件</button>
          </div>

          <!-- 搜索模式 -->
          <template v-if="rwSourceMode === 'search'">
            <input
              v-model="rwNovelSearch"
              placeholder="搜索小说名称..."
              class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
              @input="rwSearchNovels"
            />
            <!-- 搜索结果列表 -->
            <div v-if="rwNovelResults.length > 0" class="space-y-1 max-h-60 overflow-y-auto">
              <div
                v-for="novel in rwNovelResults"
                :key="novel.id"
                class="flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors"
                :class="rwSelectedNovel?.id === novel.id ? 'bg-amber-500/10 border border-amber-500/40' : 'hover:bg-gray-100 dark:hover:bg-gray-700'"
                @click="rwSelectNovel(novel)"
              >
                <div class="w-8 h-8 bg-gray-200 dark:bg-gray-600 rounded flex-shrink-0 flex items-center justify-center text-sm">📖</div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ novel.title }}</p>
                  <p class="text-xs text-gray-500">{{ novel.chapter_count || 0 }} 章</p>
                </div>
                <svg v-if="rwSelectedNovel?.id === novel.id" class="w-4 h-4 text-amber-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                </svg>
              </div>
            </div>
            <!-- 未找到结果 -->
            <div v-else-if="rwNovelSearch.trim() && !rwSelectedNovel" class="rounded-lg border border-dashed border-gray-700 p-4 text-center space-y-1">
              <p class="text-sm text-gray-400">未找到「{{ rwNovelSearch }}」</p>
              <p class="text-xs text-gray-600">该小说尚未导入系统，可切换为「上传本地文件」</p>
              <button type="button" class="text-xs text-amber-400 hover:text-amber-300 transition-colors mt-1" @click="rwSourceMode = 'upload'">
                切换到上传文件 →
              </button>
            </div>
            <div v-if="rwSelectedNovel" class="flex items-center gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <svg class="w-4 h-4 text-amber-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
              <span class="text-sm text-amber-300">已选择：{{ rwSelectedNovel.title }}</span>
              <button type="button" class="ml-auto text-xs text-gray-500 hover:text-gray-300" @click="rwSelectedNovel = null; rwNovelSearch = ''; rwNovelResults = []">更换</button>
            </div>
          </template>

          <!-- 上传模式 -->
          <template v-else>
            <div v-if="rwUploadedNovelId" class="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
              <svg class="w-5 h-5 text-emerald-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
              </svg>
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-emerald-300">上传成功</p>
                <p class="text-xs text-emerald-400/70 truncate">{{ rwSelectedFile?.name }}</p>
              </div>
              <button type="button" class="text-xs text-gray-500 hover:text-gray-300" @click="rwSelectedFile = null; rwUploadedNovelId = null; rwFileProgress = 0">重新选择</button>
            </div>
            <div v-else>
              <div
                class="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors"
                :class="rwSelectedFile ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/10' : 'border-gray-300 dark:border-gray-600 hover:border-amber-400'"
                @click="rwFileInputRef?.click()"
                @drop="rwHandleFileDrop"
                @dragover.prevent
              >
                <input ref="rwFileInputRef" type="file" accept=".txt,.md,.epub,.docx" class="hidden" @change="rwHandleFileSelect" />
                <div v-if="rwSelectedFile" class="space-y-1">
                  <p class="font-medium text-gray-900 dark:text-white">{{ rwSelectedFile.name }}</p>
                  <p class="text-xs text-gray-500">{{ (rwSelectedFile.size / 1024).toFixed(1) }} KB · 点击更换</p>
                </div>
                <div v-else class="space-y-2 text-gray-400">
                  <svg class="w-10 h-10 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/>
                  </svg>
                  <p class="text-sm">拖拽文件到此处，或点击选择</p>
                  <p class="text-xs">支持 TXT / MD / EPUB / DOCX，最大 50MB</p>
                </div>
              </div>
              <div v-if="rwFileUploading" class="mt-3 space-y-1.5">
                <div class="flex justify-between text-xs text-gray-500">
                  <span>{{ rwFileProgress < 50 ? '上传中...' : '解析导入中...' }}</span>
                  <span>{{ rwFileProgress }}%</span>
                </div>
                <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                  <div class="bg-amber-500 h-1.5 rounded-full transition-all" :style="{ width: `${rwFileProgress}%` }" />
                </div>
              </div>
              <p v-if="rwFileError" class="mt-2 text-xs text-red-500">{{ rwFileError }}</p>
            </div>
          </template>
        </div>

        <div class="flex items-center justify-between mt-4">
          <button type="button" class="text-sm text-gray-500 hover:text-gray-300 transition-colors" @click="step = 'choose'">← 返回</button>
          <div class="flex items-center gap-3">
            <p v-if="rwSourceMode === 'search' && rwNovelSearch.trim() && !rwSelectedNovel"
              class="text-xs text-amber-500/80">请从上方列表中点击选择小说</p>
            <button
              type="button"
              class="btn-primary"
              :class="{ 'opacity-50 cursor-not-allowed': !rwSourceNovelId }"
              :disabled="!rwSourceNovelId"
              @click="rwStep = 2"
            >下一步 →</button>
          </div>
        </div>
      </template>

      <!-- ─── Step 2: 改写配置 ──────────────────────────────────────────────── -->
      <template v-else-if="rwStep === 2">
        <div class="space-y-4">
          <!-- 选中来源摘要 -->
          <div class="flex items-center gap-3 p-3 rounded-xl bg-gray-800/60 border border-gray-700">
            <span class="text-base">📖</span>
            <div class="flex-1 min-w-0">
              <p class="text-xs text-gray-500 mb-0.5">原始小说</p>
              <p class="text-sm font-medium text-gray-200 truncate">
                {{ rwSelectedNovel?.title ?? rwSelectedFile?.name ?? '已上传文件' }}
              </p>
            </div>
            <button type="button" class="text-xs text-amber-400 hover:text-amber-300 shrink-0" @click="rwStep = 1">更换</button>
          </div>

          <!-- 项目名称 -->
          <div class="card p-5 space-y-3">
            <h2 class="text-sm font-semibold text-gray-900 dark:text-white">项目名称</h2>
            <input
              v-model="rwForm.name"
              placeholder="例如：「剑道传说」改写版"
              class="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
            />
          </div>

          <!-- 改写级别 -->
          <div class="card p-5 space-y-3">
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold text-gray-900 dark:text-white">改写级别</h2>
              <span class="text-xs text-gray-500">依据版权法「实质性相似」标准</span>
            </div>
            <div class="space-y-2">
              <div
                v-for="(level, idx) in rwLevels"
                :key="idx"
                class="p-4 rounded-xl border-2 cursor-pointer transition-all"
                :class="rwForm.level === idx + 1 ? level.activeClass : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'"
                @click="rwForm.level = idx + 1"
              >
                <div class="flex items-center gap-3">
                  <span class="text-xl shrink-0">{{ level.emoji }}</span>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span class="text-sm font-semibold text-gray-900 dark:text-white">{{ level.name }}</span>
                      <span class="text-xs px-2 py-0.5 rounded-full" :class="level.tagClass">{{ level.tag }}</span>
                    </div>
                    <p class="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{{ level.desc }}</p>
                    <div class="mt-1.5 flex items-center gap-1">
                      <span class="text-xs text-gray-400">原著保留：</span>
                      <div class="flex gap-0.5">
                        <div v-for="i in 5" :key="i" class="w-3 h-1.5 rounded-sm" :class="i <= level.retention ? level.barColor : 'bg-gray-200 dark:bg-gray-600'" />
                      </div>
                      <span class="text-xs text-gray-400 ml-1">{{ level.retentionText }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div v-if="rwForm.level <= 2" class="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-300">
              <span class="shrink-0 mt-0.5">⚠️</span>
              <span>此级别改写成果法律性质为<strong>衍生作品</strong>，商业使用前请确保已取得原著版权方书面授权。</span>
            </div>
          </div>

          <!-- 版权声明 -->
          <div class="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex gap-3">
            <svg class="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            </svg>
            <p class="text-xs text-amber-200/70 leading-relaxed">本功能仅供学习研究和创作练习使用。请确保您有权处理原始作品，或原作品已处于公共领域。AI 改写不能完全规避版权风险，最终结果仍需人工审核。</p>
          </div>

          <p v-if="rwError" class="text-red-500 text-sm">{{ rwError }}</p>

          <div class="flex items-center justify-between pt-1">
            <button type="button" class="text-sm text-gray-500 hover:text-gray-300 transition-colors" @click="rwStep = 1">← 上一步</button>
            <button
              type="button"
              :disabled="!rwCanSubmit"
              class="btn-primary"
              :class="{ 'opacity-50 cursor-not-allowed': !rwCanSubmit }"
              @click="rwSubmit"
            >{{ rwSubmitting ? '创建中...' : '创建改写项目 →' }}</button>
          </div>
        </div>
      </template>
    </template>
  </div>
</template>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.2s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
.modal-fade-enter-active .max-w-sm,
.modal-fade-leave-active .max-w-sm {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.modal-fade-enter-from .max-w-sm,
.modal-fade-leave-to .max-w-sm {
  transform: scale(0.95);
  opacity: 0;
}
</style>
