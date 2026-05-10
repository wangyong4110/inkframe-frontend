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

        <!-- 模式切换 -->
        <div class="flex gap-2 mb-4">
          <button type="button"
            :class="['flex-1 py-2 text-sm font-medium rounded-lg border transition-colors',
              sourceMode === 'search'
                ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300']"
            @click="sourceMode = 'search'">
            &#128269; 从系统搜索
          </button>
          <button type="button"
            :class="['flex-1 py-2 text-sm font-medium rounded-lg border transition-colors',
              sourceMode === 'upload'
                ? 'border-violet-500 bg-violet-500/10 text-violet-300'
                : 'border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300']"
            @click="sourceMode = 'upload'">
            &#8679; 上传本地文件
          </button>
        </div>

        <!-- 搜索模式 -->
        <template v-if="sourceMode === 'search'">
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
        </template>

        <!-- 上传模式 -->
        <template v-else>
          <!-- 上传成功 -->
          <div v-if="uploadedNovelId" class="flex items-center gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
            <span class="text-emerald-400 text-xl flex-shrink-0">&#10003;</span>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-semibold text-emerald-300">上传成功，可继续配置改写</p>
              <p class="text-xs text-emerald-400/70 truncate">{{ selectedFile?.name }}</p>
            </div>
            <button type="button" class="text-xs text-gray-400 hover:text-white transition-colors"
              @click="selectedFile = null; uploadedNovelId = null; fileProgress = 0">
              重新选择
            </button>
          </div>

          <!-- 拖拽区 -->
          <div v-else>
            <div
              :class="['border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors',
                selectedFile
                  ? 'border-violet-500/60 bg-violet-500/5'
                  : 'border-gray-700 hover:border-violet-500/50']"
              @click="fileInputRef?.click()"
              @drop="handleFileDrop"
              @dragover.prevent>
              <input ref="fileInputRef" type="file" accept=".txt,.md,.epub,.docx" class="hidden" @change="handleFileSelect" />
              <div v-if="selectedFile" class="space-y-1.5">
                <div class="text-3xl">&#128196;</div>
                <p class="text-sm font-medium text-white">{{ selectedFile.name }}</p>
                <p class="text-xs text-gray-400">{{ (selectedFile.size / 1024).toFixed(1) }} KB · 点击更换</p>
              </div>
              <div v-else class="space-y-2">
                <div class="text-4xl text-gray-600">&#8679;</div>
                <p class="text-sm text-gray-400">拖拽文件到此处，或点击选择</p>
                <p class="text-xs text-gray-600">支持 TXT / MD / EPUB / DOCX，最大 50MB</p>
              </div>
            </div>

            <!-- 进度条 -->
            <div v-if="fileUploading" class="mt-3 space-y-1.5">
              <div class="flex justify-between text-xs text-gray-400">
                <span>{{ fileProgress < 50 ? '上传中...' : '解析导入中...' }}</span>
                <span>{{ fileProgress }}%</span>
              </div>
              <div class="w-full bg-gray-800 rounded-full h-1.5">
                <div class="bg-violet-500 h-1.5 rounded-full transition-all" :style="{ width: `${fileProgress}%` }" />
              </div>
            </div>

            <p v-if="fileError" class="mt-2 text-xs text-red-400">{{ fileError }}</p>

            <button v-if="selectedFile && !fileUploading" type="button"
              class="mt-3 w-full py-2 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors"
              @click="uploadFile">
              开始上传解析
            </button>
          </div>
        </template>
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
import { getAuthToken } from '~/utils/auth'

const router = useRouter()
const config = useRuntimeConfig()
const apiBase = config.public.apiBase
const { createProject, startAnalysis } = useRewriteApi()
const { getNovels } = useNovelApi()

// ── 来源模式 ────────────────────────────────────────────────────────────────
type SourceMode = 'search' | 'upload'
const sourceMode = ref<SourceMode>('search')

// ── 搜索 ─────────────────────────────────────────────────────────────────────
const novelSearch = ref('')
const novelResults = ref<Novel[]>([])
const selectedNovel = ref<Novel | null>(null)

// ── 上传本地文件 ─────────────────────────────────────────────────────────────
const fileInputRef = ref<HTMLInputElement | null>(null)
const selectedFile = ref<File | null>(null)
const fileUploading = ref(false)
const fileProgress = ref(0)
const fileError = ref('')
const uploadedNovelId = ref<number | null>(null)

const CHUNK_THRESHOLD = 5 * 1024 * 1024
const CHUNK_SIZE = 2 * 1024 * 1024

function getAuthHeader(): Record<string, string> {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function handleFileSelect(e: Event) {
  const t = e.target as HTMLInputElement
  if (t.files?.[0]) { selectedFile.value = t.files[0]; uploadedNovelId.value = null; fileError.value = ''; fileProgress.value = 0 }
}

function handleFileDrop(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer?.files?.[0]) { selectedFile.value = e.dataTransfer.files[0]; uploadedNovelId.value = null; fileError.value = ''; fileProgress.value = 0 }
}

async function uploadFile() {
  if (!selectedFile.value) return
  fileError.value = ''
  fileUploading.value = true
  fileProgress.value = 5
  uploadedNovelId.value = null
  try {
    let taskId: string
    if (selectedFile.value.size >= CHUNK_THRESHOLD) {
      taskId = await chunkedUpload(selectedFile.value)
    } else {
      const formData = new FormData()
      formData.append('file', selectedFile.value)
      fileProgress.value = 20
      const response = await fetch(`${apiBase}/import/novel/file`, { method: 'POST', headers: getAuthHeader(), body: formData })
      const result = await response.json()
      if (result.code !== 0) throw new Error(result.error || result.message || '导入失败')
      taskId = result.data?.task_id
      if (!taskId) throw new Error('未获取到导入任务ID')
    }
    fileProgress.value = 50
    await pollUploadTask(taskId)
  } catch (e: any) {
    fileError.value = e.message || '上传失败'
    fileUploading.value = false
  }
}

async function chunkedUpload(file: File): Promise<string> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
  const initRes = await fetch(`${apiBase}/import/novel/file/init`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ filename: file.name, total_chunks: totalChunks }),
  })
  const initData = await initRes.json()
  if (initData.code !== 0) throw new Error(initData.error || initData.message || '初始化分片上传失败')
  const uploadId: string = initData.data?.upload_id
  if (!uploadId) throw new Error('未获取到 upload_id')
  for (let i = 1; i <= totalChunks; i++) {
    const fd = new FormData()
    fd.append('upload_id', uploadId); fd.append('chunk_no', String(i))
    fd.append('chunk', file.slice((i - 1) * CHUNK_SIZE, i * CHUNK_SIZE), file.name)
    const rd = await (await fetch(`${apiBase}/import/novel/file/chunk`, { method: 'PUT', headers: getAuthHeader(), body: fd })).json()
    if (rd.code !== 0) throw new Error(rd.error || rd.message || `片段 ${i} 上传失败`)
    fileProgress.value = 5 + Math.round((i / totalChunks) * 40)
  }
  const completeData = await (await fetch(`${apiBase}/import/novel/file/complete`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify({ upload_id: uploadId }),
  })).json()
  if (completeData.code !== 0) throw new Error(completeData.error || completeData.message || '组装分片失败')
  const taskId: string = completeData.data?.task_id
  if (!taskId) throw new Error('未获取到 task_id')
  return taskId
}

async function pollUploadTask(taskId: string) {
  const maxWait = 5 * 60 * 1000
  const interval = 1500
  const start = Date.now()
  const tick = async () => {
    if (Date.now() - start > maxWait) { fileError.value = '导入超时'; fileUploading.value = false; return }
    try {
      const data = await (await fetch(`${apiBase}/tasks/${taskId}`, { headers: getAuthHeader() })).json()
      const task = data.data
      if (!task) { setTimeout(tick, interval); return }
      const td = task.data ?? {}
      if (task.status === 'completed') {
        fileProgress.value = 100; fileUploading.value = false
        if (td.novel_id) {
          uploadedNovelId.value = td.novel_id
          const name = selectedFile.value?.name.replace(/\.(txt|epub|docx|md)$/i, '') ?? '小说'
          if (!form.value.name) form.value.name = `「${name}」改写版`
        } else { fileError.value = '导入完成但未返回小说ID' }
      } else if (task.status === 'failed') {
        fileError.value = task.error || td.message || '导入失败'; fileUploading.value = false
      } else { fileProgress.value = Math.min(90, fileProgress.value + 2); setTimeout(tick, interval) }
    } catch { setTimeout(tick, interval) }
  }
  setTimeout(tick, interval)
}

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

const sourceNovelId = computed(() =>
  sourceMode.value === 'search' ? (selectedNovel.value?.id ?? null) : uploadedNovelId.value
)

const canSubmit = computed(() =>
  !!sourceNovelId.value && form.value.name.trim().length > 0 && !submitting.value && !fileUploading.value
)

async function submit() {
  if (!canSubmit.value || !sourceNovelId.value) return
  submitting.value = true
  try {
    const res = await createProject({
      novel_id: sourceNovelId.value,
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
