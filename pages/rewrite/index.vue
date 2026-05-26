<template>
  <div class="min-h-screen bg-gray-950 text-white">
    <!-- Header -->
    <div class="border-b border-gray-800 bg-gray-900/50 backdrop-blur">
      <div class="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white">小说改写</h1>
          <p class="text-sm text-gray-400 mt-0.5">AI驱动的专业改写，规避版权风险</p>
        </div>
        <NuxtLink to="/rewrite/create">
          <button class="bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors">
            <span class="text-lg leading-none">+</span>
            新建改写项目
          </button>
        </NuxtLink>
      </div>
    </div>

    <div class="max-w-7xl mx-auto px-6 py-8">
      <!-- Loading -->
      <div v-if="loading" class="text-center py-24 text-gray-500">加载中...</div>

      <!-- Empty state -->
      <div v-else-if="projects.length === 0" class="text-center py-24">
        <div class="w-16 h-16 bg-gray-800 rounded-2xl mx-auto mb-4 flex items-center justify-center text-3xl">&#x270D;</div>
        <h3 class="text-lg font-semibold text-white mb-2">还没有改写项目</h3>
        <p class="text-gray-400 text-sm mb-6">选择一部导入的小说，开始AI专业改写</p>
        <NuxtLink to="/rewrite/create">
          <button class="bg-violet-600 hover:bg-violet-500 text-white px-6 py-2.5 rounded-lg text-sm font-medium transition-colors">
            创建第一个项目
          </button>
        </NuxtLink>
      </div>

      <!-- Project grid -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div v-for="project in projects" :key="project.id"
          class="bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors cursor-pointer group"
          @click="$router.push(`/rewrite/${project.id}`)">
          <!-- Level badge -->
          <div class="flex items-start justify-between mb-3">
            <span :class="levelBadgeClass(project.level)" class="text-xs font-medium px-2.5 py-1 rounded-full">
              {{ levelLabel(project.level) }}
            </span>
            <span :class="statusBadgeClass(project.status)" class="text-xs font-medium px-2.5 py-1 rounded-full">
              {{ statusLabel(project.status) }}
            </span>
          </div>

          <h3 class="text-base font-semibold text-white mb-1 group-hover:text-violet-300 transition-colors">{{ project.name }}</h3>
          <p class="text-xs text-gray-500 mb-4">{{ formatDate(project.created_at) }}</p>

          <!-- Progress bar -->
          <div v-if="project.status === 'rewriting'" class="mb-3">
            <div class="flex justify-between text-xs text-gray-400 mb-1">
              <span>改写进度</span>
              <span>{{ project.done_chapters }}/{{ project.total_chapters }} 章</span>
            </div>
            <div class="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div class="h-full bg-violet-500 rounded-full transition-all" :style="{ width: project.progress + '%' }"></div>
            </div>
          </div>

          <!-- Status info -->
          <div v-if="project.status === 'completed'" class="text-xs text-emerald-400 flex items-center gap-1.5">
            <span>&#10003;</span>
            <span>{{ project.total_chapters }} 章全部完成</span>
          </div>
          <div v-else-if="project.status === 'failed'" class="text-xs text-red-400 truncate">
            {{ project.error_msg || '改写失败' }}
          </div>
          <div v-else-if="project.status === 'analyzing'" class="text-xs text-blue-400 flex items-center gap-1.5">
            <span class="animate-spin inline-block">&#8635;</span>
            <span>正在分析原著...</span>
          </div>
          <div v-else-if="project.status === 'bible_ready'" class="text-xs text-amber-400 flex items-center gap-1.5">
            <span>&#128218;</span>
            <span>改写圣经已就绪，待启动改写</span>
          </div>

          <!-- Delete button -->
          <div class="mt-4 pt-3 border-t border-gray-800 flex justify-end">
            <button @click.stop="confirmDelete(project)" class="text-xs text-gray-500 hover:text-red-400 transition-colors">
              删除
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Delete confirm modal -->
    <div v-if="deleteTarget" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div class="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full mx-4">
        <h3 class="text-lg font-semibold text-white mb-2">确认删除</h3>
        <p class="text-gray-400 text-sm mb-5">将永久删除项目「{{ deleteTarget.name }}」及所有改写内容，无法恢复。</p>
        <div class="flex gap-3 justify-end">
          <button @click="deleteTarget = null" class="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">取消</button>
          <button @click="doDelete" class="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors">确认删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { RewriteProject } from '~/types'

const { listProjects, deleteProject } = useRewriteApi()
const router = useRouter()

const projects = ref<RewriteProject[]>([])
const loading = ref(true)
const deleteTarget = ref<RewriteProject | null>(null)

onMounted(async () => {
  await fetchProjects()
})

async function fetchProjects() {
  loading.value = true
  try {
    const res = await listProjects()
    projects.value = res.data?.items || []
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

function confirmDelete(p: RewriteProject) {
  deleteTarget.value = p
}

async function doDelete() {
  if (!deleteTarget.value) return
  try {
    await deleteProject(deleteTarget.value.id)
    projects.value = projects.value.filter(p => p.id !== deleteTarget.value!.id)
  } catch (e) {
    console.error(e)
  }
  deleteTarget.value = null
}

function levelLabel(level: number) {
  return (['', '字词润色', '文学精炼', '情节调整', '结构重构', '精神蒸馏'] as const)[level] || '未知'
}

function levelBadgeClass(level: number) {
  const map: Record<number, string> = {
    1: 'bg-sky-500/20 text-sky-300',
    2: 'bg-blue-500/20 text-blue-300',
    3: 'bg-teal-500/20 text-teal-300',
    4: 'bg-violet-500/20 text-violet-300',
    5: 'bg-amber-500/20 text-amber-300',
  }
  return map[level] || 'bg-gray-700 text-gray-300'
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    pending: '待开始',
    analyzing: '分析中',
    bible_ready: '待改写',
    rewriting: '改写中',
    reviewing: '审核中',
    completed: '已完成',
    failed: '失败',
  }
  return map[status] || status
}

function statusBadgeClass(status: string) {
  const map: Record<string, string> = {
    pending: 'bg-gray-700 text-gray-300',
    analyzing: 'bg-blue-500/20 text-blue-300',
    bible_ready: 'bg-amber-500/20 text-amber-300',
    rewriting: 'bg-violet-500/20 text-violet-300',
    reviewing: 'bg-yellow-500/20 text-yellow-300',
    completed: 'bg-emerald-500/20 text-emerald-300',
    failed: 'bg-red-500/20 text-red-300',
  }
  return map[status] || 'bg-gray-700 text-gray-300'
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('zh-CN')
}
</script>
