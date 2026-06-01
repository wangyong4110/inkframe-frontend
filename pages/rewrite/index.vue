<script setup lang="ts">
import type { RewriteProject } from '~/types'

const router = useRouter()
const toast = useToast()
const { listProjects, createProject, deleteProject } = useRewriteApi()
const { request } = useApi()

const loading = ref(false)
const projects = ref<RewriteProject[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20

const showCreateModal = ref(false)
const creating = ref(false)
const novels = ref<{ id: number; title: string }[]>([])
const createForm = ref({ novel_id: 0, name: '', level: 3 as 1 | 2 | 3 | 4 | 5 })

const ACTIVE_STATUSES = new Set(['pending', 'analyzing', 'bible_ready', 'rewriting'])
let pollTimer: ReturnType<typeof setInterval> | null = null

function startPollingIfNeeded() {
  const hasActive = projects.value.some(p => ACTIVE_STATUSES.has(p.status))
  if (hasActive && !pollTimer) {
    pollTimer = setInterval(async () => {
      await fetchProjects()
      const stillActive = projects.value.some(p => ACTIVE_STATUSES.has(p.status))
      if (!stillActive && pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
    }, 5000)
  }
}

const LEVELS = [
  { value: 1, label: '微调', desc: '仅调整表述，保留原文95%以上内容' },
  { value: 2, label: '轻改', desc: '修改人名、地名，适度调整情节' },
  { value: 3, label: '中度改写', desc: '重构段落结构，保留核心剧情' },
  { value: 4, label: '深度改写', desc: '完全重写文笔，保留主要情节框架' },
  { value: 5, label: '全面重构', desc: '世界观、人物、情节全面重构' },
]

const STATUS_LABELS: Record<RewriteProject['status'], string> = {
  pending: '待处理',
  analyzing: '分析中',
  bible_ready: '圣经就绪',
  rewriting: '改写中',
  reviewing: '待审核',
  completed: '已完成',
  failed: '失败',
}

const STATUS_COLORS: Record<RewriteProject['status'], string> = {
  pending: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  analyzing: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  bible_ready: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  rewriting: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  reviewing: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
}

async function fetchProjects() {
  if (loading.value) return
  loading.value = true
  try {
    const res = await listProjects(page.value, pageSize)
    const data = (res as any)?.data ?? res
    projects.value = data?.items ?? []
    total.value = data?.total ?? 0
    startPollingIfNeeded()
  } catch (e: any) {
    toast.error('加载失败：' + (e.message || ''))
  } finally {
    loading.value = false
  }
}

async function fetchNovels() {
  try {
    const res = await request<{ novels: { id: number; title: string }[] }>('/novels?page=1&page_size=100')
    novels.value = (res as any)?.novels ?? []
    if (novels.value.length > 0 && createForm.value.novel_id === 0) {
      createForm.value.novel_id = novels.value[0].id
    }
  } catch {}
}

function openCreateModal() {
  createForm.value.name = ''
  createForm.value.level = 3
  showCreateModal.value = true
}

async function handleCreate() {
  if (!createForm.value.novel_id) return toast.error('请选择小说')
  if (!createForm.value.name.trim()) return toast.error('请输入改写项目名称')
  creating.value = true
  try {
    const res = await createProject({
      novel_id: createForm.value.novel_id,
      name: createForm.value.name.trim(),
      level: createForm.value.level,
    })
    const project = (res as any)?.data ?? res
    toast.success('改写项目已创建')
    showCreateModal.value = false
    router.push(`/rewrite/${project.id}`)
  } catch (e: any) {
    toast.error('创建失败：' + (e.message || ''))
  } finally {
    creating.value = false
  }
}

async function handleDelete(project: RewriteProject) {
  if (!window.confirm(`确认删除「${project.name}」？此操作不可恢复。`)) return
  try {
    await deleteProject(project.id)
    toast.success('已删除')
    projects.value = projects.value.filter(p => p.id !== project.id)
    total.value = Math.max(0, total.value - 1)
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || ''))
  }
}

function formatDate(dateStr: string) {
  if (!dateStr) return ''
  return new Date(dateStr).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

onMounted(() => {
  fetchProjects()
  fetchNovels()
})

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<template>
  <div class="container mx-auto px-4 py-8 max-w-6xl">
    <div class="flex items-center justify-between mb-8">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">改写项目</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">对已有小说进行 AI 驱动的深度改写，规避版权风险</p>
      </div>
      <button class="btn-primary" @click="openCreateModal">
        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        新建项目
      </button>
    </div>

    <div v-if="loading" class="flex justify-center py-20">
      <div class="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
    </div>

    <div v-else-if="projects.length === 0" class="card p-16 text-center">
      <svg class="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">暂无改写项目</h3>
      <p class="text-gray-500 dark:text-gray-400 mb-6">选择一本已有小说开始 AI 改写流程</p>
      <button class="btn-primary" @click="openCreateModal">新建改写项目</button>
    </div>

    <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="project in projects"
        :key="project.id"
        class="card p-5 hover:shadow-medium transition-shadow cursor-pointer"
        @click="router.push(`/rewrite/${project.id}`)"
      >
        <div class="flex items-start justify-between mb-3">
          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-gray-900 dark:text-white truncate">{{ project.name }}</h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              改写强度 L{{ project.level }} · {{ LEVELS[project.level - 1]?.label }}
            </p>
          </div>
          <span class="ml-2 shrink-0 px-2 py-0.5 text-xs font-medium rounded-full" :class="STATUS_COLORS[project.status]">
            {{ STATUS_LABELS[project.status] }}
          </span>
        </div>

        <div v-if="project.total_chapters > 0" class="mb-3">
          <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
            <span>章节进度</span>
            <span>{{ project.done_chapters }} / {{ project.total_chapters }}</span>
          </div>
          <div class="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              class="h-full bg-primary-500 rounded-full transition-all"
              :style="{ width: `${project.total_chapters > 0 ? (project.done_chapters / project.total_chapters) * 100 : 0}%` }"
            />
          </div>
        </div>

        <div v-if="project.error_msg" class="mb-3 text-xs text-red-600 dark:text-red-400 truncate">
          {{ project.error_msg }}
        </div>

        <div class="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
          <span>{{ formatDate(project.created_at) }}</span>
          <button
            class="text-red-400 hover:text-red-600 dark:hover:text-red-300 p-1 rounded"
            title="删除"
            @click.stop="handleDelete(project)"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <div v-if="total > pageSize" class="mt-6 flex justify-center gap-2">
      <button class="btn-outline text-sm" :disabled="page <= 1 || loading" @click="page--; fetchProjects()">上一页</button>
      <span class="flex items-center text-sm text-gray-500 dark:text-gray-400 px-2">
        第 {{ page }} 页 / 共 {{ Math.ceil(total / pageSize) }} 页
      </span>
      <button class="btn-outline text-sm" :disabled="page * pageSize >= total || loading" @click="page++; fetchProjects()">下一页</button>
    </div>

    <!-- 创建对话框 -->
    <div v-if="showCreateModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="fixed inset-0 bg-black/50" @click="showCreateModal = false"></div>
      <div class="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">新建改写项目</h2>

        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">选择小说</label>
            <select v-model.number="createForm.novel_id" class="input">
              <option v-if="novels.length === 0" :value="0" disabled>暂无小说，请先创建小说</option>
              <option v-for="novel in novels" :key="novel.id" :value="novel.id">{{ novel.title }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">项目名称</label>
            <input v-model="createForm.name" type="text" class="input" placeholder="例如：《XX 新传》改写计划" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">改写强度</label>
            <div class="space-y-2">
              <label
                v-for="level in LEVELS"
                :key="level.value"
                class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors"
                :class="createForm.level === level.value
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'"
              >
                <input v-model.number="createForm.level" type="radio" :value="level.value" class="text-primary-600" />
                <div>
                  <span class="font-medium text-sm text-gray-900 dark:text-white">L{{ level.value }} {{ level.label }}</span>
                  <p class="text-xs text-gray-500 dark:text-gray-400">{{ level.desc }}</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-6">
          <button class="btn-outline" @click="showCreateModal = false">取消</button>
          <button class="btn-primary" :disabled="creating" @click="handleCreate">
            {{ creating ? '创建中…' : '创建' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
