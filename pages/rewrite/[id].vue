<template>
  <div class="min-h-screen bg-gray-950 text-white">
    <!-- Header -->
    <div class="border-b border-gray-800 bg-gray-900/50">
      <div class="max-w-7xl mx-auto px-6 py-4">
        <div class="flex items-center gap-4 mb-4">
          <NuxtLink to="/rewrite" class="text-gray-400 hover:text-white transition-colors text-sm">&larr; 改写列表</NuxtLink>
          <span class="text-gray-600">/</span>
          <h1 class="text-lg font-semibold text-white">{{ project?.name || '加载中...' }}</h1>
          <span v-if="project" :class="statusBadgeClass(project.status)" class="text-xs font-medium px-2.5 py-1 rounded-full">
            {{ statusLabel(project.status) }}
          </span>
        </div>

        <!-- Progress bar: analyzing or rewriting -->
        <div v-if="isRunning" class="mt-2">
          <div class="flex justify-between text-xs text-gray-400 mb-1">
            <span class="flex items-center gap-1.5">
              <span class="inline-block w-2 h-2 rounded-full bg-violet-400 animate-pulse"></span>
              {{ project?.status === 'analyzing' ? '文学分析 & 圣经生成中' : '章节改写中' }}
            </span>
            <span v-if="project?.status === 'rewriting'">
              {{ project.done_chapters }}/{{ project.total_chapters }} 章
            </span>
            <span>{{ displayProgress }}%</span>
          </div>
          <div class="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div class="h-full bg-gradient-to-r from-violet-600 to-violet-400 rounded-full transition-all duration-500"
              :style="{ width: displayProgress + '%' }"></div>
          </div>
        </div>

        <!-- Tabs -->
        <div class="flex gap-1 mt-4">
          <button v-for="tab in tabs" :key="tab.key"
            @click="activeTab = tab.key"
            :class="['px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              activeTab === tab.key ? 'bg-violet-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800']">
            {{ tab.label }}
          </button>
        </div>
      </div>
    </div>

    <div class="max-w-7xl mx-auto px-6 py-6">
      <!-- Loading -->
      <div v-if="loading" class="text-center py-20 text-gray-500">加载中...</div>

      <!-- Tab: 概览 -->
      <div v-else-if="activeTab === 'overview'">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div class="text-xs text-gray-500 mb-1">改写级别</div>
            <div class="text-lg font-bold" :class="levelColor(project?.level || 1)">
              Level {{ project?.level }} · {{ levelLabel(project?.level || 1) }}
            </div>
          </div>
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div class="text-xs text-gray-500 mb-1">总章数</div>
            <div class="text-2xl font-bold text-white">{{ project?.total_chapters || 0 }}</div>
          </div>
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div class="text-xs text-gray-500 mb-1">已完成</div>
            <div class="text-2xl font-bold text-emerald-400">{{ project?.done_chapters || 0 }}</div>
          </div>
        </div>

        <!-- Action buttons -->
        <div class="flex gap-3 flex-wrap">
          <!-- pending: start analysis -->
          <button v-if="project?.status === 'pending'" @click="doStartAnalysis" :disabled="actionLoading"
            class="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
            {{ actionLoading ? '提交中...' : '▶ 开始文学分析' }}
          </button>

          <!-- analyzing: in-progress indicator -->
          <div v-if="project?.status === 'analyzing'"
            class="flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 text-blue-300 px-5 py-2.5 rounded-lg text-sm">
            <span class="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></span>
            文学分析进行中...
          </div>

          <!-- bible_ready: start rewriting -->
          <button v-if="project?.status === 'bible_ready'" @click="doStartRewriting" :disabled="actionLoading"
            class="bg-violet-600 hover:bg-violet-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
            {{ actionLoading ? '提交中...' : '▶ 开始章节改写' }}
          </button>

          <!-- rewriting: in-progress indicator -->
          <div v-if="project?.status === 'rewriting'"
            class="flex items-center gap-2 bg-violet-500/10 border border-violet-500/30 text-violet-300 px-5 py-2.5 rounded-lg text-sm">
            <span class="w-3 h-3 border-2 border-violet-400 border-t-transparent rounded-full animate-spin"></span>
            章节改写进行中...
          </div>

          <!-- failed: retry buttons -->
          <template v-if="project?.status === 'failed'">
            <button v-if="(project.total_chapters || 0) > 0" @click="doStartRewriting" :disabled="actionLoading"
              class="bg-violet-700 hover:bg-violet-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              {{ actionLoading ? '提交中...' : '↺ 重新章节改写' }}
            </button>
            <button v-else @click="doStartAnalysis" :disabled="actionLoading"
              class="bg-blue-700 hover:bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50">
              {{ actionLoading ? '提交中...' : '↺ 重新文学分析' }}
            </button>
          </template>

          <!-- Task info badge when polling -->
          <div v-if="activeTaskId && isRunning"
            class="flex items-center gap-1.5 text-xs text-gray-500 self-center">
            <span>任务 {{ activeTaskId }}</span>
            <button @click="cancelActiveTask" class="text-red-400 hover:text-red-300 transition-colors">取消</button>
          </div>
        </div>

        <div v-if="project?.error_msg" class="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-300">
          错误：{{ project.error_msg }}
        </div>
      </div>

      <!-- Tab: 文学分析 -->
      <div v-else-if="activeTab === 'analysis'">
        <div v-if="!analysis" class="text-center py-20">
          <div class="text-gray-500 mb-4">暂无分析数据</div>
          <div v-if="project?.status === 'pending'" class="text-xs text-gray-600">请先开始文学分析</div>
        </div>
        <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <RewriteAnalysisCard title="叙事声音指纹" icon="🎙" :data="parseJSON(analysis.voice_fingerprint)" />
          <RewriteAnalysisCard title="场景架构" icon="🏗" :data="parseJSON(analysis.scene_architecture)" />
          <RewriteAnalysisCard title="角色心理图谱" icon="🧠" :data="parseJSON(analysis.char_psych)" />
          <RewriteAnalysisCard title="主题内核" icon="💡" :data="parseJSON(analysis.theme_core)" />
          <RewriteAnalysisCard title="世界逻辑" icon="🌍" :data="parseJSON(analysis.world_logic)" />
          <RewriteAnalysisCard title="高风险标志元素" icon="⚠️" :data="parseJSON(analysis.high_risk_markers)" :highlight="true" />
        </div>
      </div>

      <!-- Tab: 改写圣经 -->
      <div v-else-if="activeTab === 'bible'">
        <div v-if="!bible" class="text-center py-20 text-gray-500">暂无改写圣经</div>
        <div v-else class="space-y-4">
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 class="text-sm font-semibold text-gray-400 mb-2">新世界观名称</h3>
            <p class="text-xl font-bold text-violet-300">{{ bible.new_world_name || '（同原作）' }}</p>
          </div>
          <div class="bg-gray-900 border border-gray-800 rounded-xl p-6">
            <h3 class="text-sm font-semibold text-gray-400 mb-3">角色名称对照</h3>
            <div class="space-y-2">
              <div v-for="(newName, oldName) in parseJSON(bible.new_char_names)" :key="String(oldName)"
                class="flex items-center gap-3 text-sm">
                <span class="text-gray-300 font-medium">{{ oldName }}</span>
                <span class="text-gray-500">&rarr;</span>
                <span class="text-violet-300 font-medium">{{ String(newName) }}</span>
              </div>
            </div>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RewriteBibleCard title="情节转化规则" icon="🔄" :data="parseJSON(bible.plot_transform)" />
            <RewriteBibleCard title="叙事声音策略" icon="🎭" :data="parseJSON(bible.voice_strategy)" />
            <RewriteBibleCard title="文风指南" icon="✍️" :data="parseJSON(bible.style_guide)" />
            <RewriteBibleCard title="禁止元素" icon="🚫" :data="parseJSON(bible.forbidden_elems)" :danger="true" />
          </div>
        </div>
      </div>

      <!-- Tab: 章节改写 -->
      <div v-else-if="activeTab === 'chapters'">
        <div v-if="chapterTasks.length === 0" class="text-center py-20 text-gray-500">暂无章节改写任务</div>
        <div v-else>
          <div class="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <table class="w-full">
              <thead>
                <tr class="border-b border-gray-800">
                  <th class="text-left text-xs text-gray-500 font-medium px-4 py-3">章节</th>
                  <th class="text-left text-xs text-gray-500 font-medium px-4 py-3">状态</th>
                  <th class="text-left text-xs text-gray-500 font-medium px-4 py-3">相似度</th>
                  <th class="text-left text-xs text-gray-500 font-medium px-4 py-3">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="task in chapterTasks" :key="task.id" class="border-b border-gray-800/50 hover:bg-gray-800/30">
                  <td class="px-4 py-3 text-sm text-white">第 {{ task.chapter_no }} 章</td>
                  <td class="px-4 py-3">
                    <span :class="chapterStatusBadge(task.status)" class="text-xs px-2 py-0.5 rounded-full">
                      {{ chapterStatusLabel(task.status) }}
                    </span>
                  </td>
                  <td class="px-4 py-3">
                    <div v-if="task.status === 'completed'" class="flex items-center gap-2">
                      <div class="h-1.5 w-20 bg-gray-700 rounded-full overflow-hidden">
                        <div :class="['h-full rounded-full', task.similarity_score < 0.3 ? 'bg-emerald-500' : task.similarity_score < 0.5 ? 'bg-yellow-500' : 'bg-red-500']"
                          :style="{ width: (task.similarity_score * 100) + '%' }"></div>
                      </div>
                      <span :class="task.similarity_score < 0.3 ? 'text-emerald-400' : task.similarity_score < 0.5 ? 'text-yellow-400' : 'text-red-400'"
                        class="text-xs">{{ Math.round(task.similarity_score * 100) }}%</span>
                    </div>
                    <span v-else class="text-xs text-gray-500">—</span>
                  </td>
                  <td class="px-4 py-3">
                    <button v-if="task.status === 'completed'" @click="openComparison(task)"
                      class="text-xs text-violet-400 hover:text-violet-300 transition-colors">
                      查看对比
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Comparison Modal -->
    <div v-if="comparisonTask" class="fixed inset-0 bg-black/80 flex items-start justify-center z-50 overflow-y-auto py-8">
      <div class="bg-gray-900 border border-gray-700 rounded-xl max-w-6xl w-full mx-4">
        <div class="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h3 class="font-semibold text-white">第 {{ comparisonTask.chapter_no }} 章 对比</h3>
          <button @click="comparisonTask = null" class="text-gray-400 hover:text-white text-xl transition-colors">&times;</button>
        </div>
        <div class="grid grid-cols-2 gap-0 divide-x divide-gray-800">
          <div class="p-6">
            <div class="text-xs text-gray-500 mb-3 font-medium">原文</div>
            <div class="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">{{ comparisonTask.original_content }}</div>
          </div>
          <div class="p-6">
            <div class="flex items-center gap-2 mb-3">
              <span class="text-xs text-gray-500 font-medium">改写版</span>
              <span :class="comparisonTask.similarity_score < 0.3 ? 'text-emerald-400' : 'text-yellow-400'" class="text-xs">
                相似度 {{ Math.round(comparisonTask.similarity_score * 100) }}%
              </span>
              <span v-if="comparisonTask.passed" class="text-xs text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">&#10003; 通过</span>
            </div>
            <div class="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">{{ comparisonTask.rewritten_content }}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { RewriteProject, LiteraryAnalysis, RewriteBible, ChapterRewriteTask, AsyncTask } from '~/types'

const route = useRoute()
const {
  getProject,
  startAnalysis: apiStartAnalysis,
  startRewriting: apiStartRewriting,
  getAnalysis,
  getBible,
  listChapterTasks,
} = useRewriteApi()
const { getTask, cancelTask } = useTaskApi()

const projectId = Number(route.params.id)
const project = ref<RewriteProject | null>(null)
const analysis = ref<LiteraryAnalysis | null>(null)
const bible = ref<RewriteBible | null>(null)
const chapterTasks = ref<ChapterRewriteTask[]>([])
const loading = ref(true)
const activeTab = ref('overview')
const actionLoading = ref(false)
const comparisonTask = ref<ChapterRewriteTask | null>(null)

// ── Async task polling ────────────────────────────────────────────────────────
const activeTaskId = ref<string | null>(null)
const activeTask = ref<AsyncTask | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null

const TERMINAL = new Set(['completed', 'failed', 'cancelled'])

const isRunning = computed(() =>
  ['analyzing', 'rewriting'].includes(project.value?.status ?? ''),
)

// Progress: prefer live task progress, fall back to project.progress
const displayProgress = computed(() => {
  if (activeTask.value && !TERMINAL.has(activeTask.value.status)) {
    return activeTask.value.progress ?? 0
  }
  return project.value?.progress ?? 0
})

function startPolling(taskId: string) {
  activeTaskId.value = taskId
  stopPolling()
  pollTimer = setInterval(async () => {
    try {
      const res = await getTask(taskId)
      activeTask.value = res.data
      if (TERMINAL.has(res.data.status)) {
        stopPolling()
        await refreshProject()
        // Reload chapter tasks if rewriting just finished
        if (['completed', 'failed'].includes(res.data.status) && project.value?.status !== 'analyzing') {
          await reloadChapterTasks()
        }
      }
    } catch { /* network blip — keep polling */ }
  }, 2500)
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

async function cancelActiveTask() {
  if (!activeTaskId.value) return
  try {
    await cancelTask(activeTaskId.value)
    stopPolling()
    await refreshProject()
  } catch (e) {
    console.error(e)
  }
}

// ── Data loading ──────────────────────────────────────────────────────────────
const tabs = [
  { key: 'overview', label: '概览' },
  { key: 'analysis', label: '文学分析' },
  { key: 'bible', label: '改写圣经' },
  { key: 'chapters', label: '章节改写' },
]

onMounted(async () => {
  await refreshProject()
  loading.value = false
  // If already running on page load, start project-level auto-refresh
  // (we don't have task_id from a previous session, so poll the project)
  if (isRunning.value) {
    startProjectPoll()
  }
})

onUnmounted(() => {
  stopPolling()
  stopProjectPoll()
})

// Project-level poll: used when page loads mid-run (no task_id available)
let projectPollTimer: ReturnType<typeof setInterval> | null = null

function startProjectPoll() {
  stopProjectPoll()
  projectPollTimer = setInterval(async () => {
    await refreshProject()
    if (!isRunning.value) stopProjectPoll()
  }, 3000)
}

function stopProjectPoll() {
  if (projectPollTimer) {
    clearInterval(projectPollTimer)
    projectPollTimer = null
  }
}

async function refreshProject() {
  try {
    const res = await getProject(projectId)
    project.value = res.data

    if (['analyzing', 'bible_ready', 'rewriting', 'completed'].includes(project.value.status)) {
      try {
        const aRes = await getAnalysis(projectId)
        analysis.value = aRes.data
      } catch {}
    }
    if (['bible_ready', 'rewriting', 'completed'].includes(project.value.status)) {
      try {
        const bRes = await getBible(projectId)
        bible.value = bRes.data
      } catch {}
      await reloadChapterTasks()
    }
  } catch (e) {
    console.error(e)
  }
}

async function reloadChapterTasks() {
  try {
    const cRes = await listChapterTasks(projectId)
    chapterTasks.value = cRes.data?.items || []
  } catch {}
}

// ── Actions ───────────────────────────────────────────────────────────────────
async function doStartAnalysis() {
  actionLoading.value = true
  try {
    const res = await apiStartAnalysis(projectId)
    const taskId = res.data?.task_id
    if (taskId) {
      stopProjectPoll() // task polling takes over
      startPolling(taskId)
    }
    await refreshProject()
  } catch (e) {
    console.error(e)
  } finally {
    actionLoading.value = false
  }
}

async function doStartRewriting() {
  actionLoading.value = true
  try {
    const res = await apiStartRewriting(projectId)
    const taskId = res.data?.task_id
    if (taskId) {
      stopProjectPoll()
      startPolling(taskId)
    }
    await refreshProject()
  } catch (e) {
    console.error(e)
  } finally {
    actionLoading.value = false
  }
}

function openComparison(task: ChapterRewriteTask) {
  comparisonTask.value = task
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseJSON(str: string): Record<string, unknown> {
  try { return JSON.parse(str) || {} } catch { return {} }
}

function levelLabel(level: number) {
  return (['', '文学精炼', '结构重构', '精神蒸馏'] as const)[level] || '未知'
}

function levelColor(level: number) {
  const map: Record<number, string> = { 1: 'text-blue-300', 2: 'text-violet-300', 3: 'text-amber-300' }
  return map[level] || 'text-gray-300'
}

function statusLabel(status: string) {
  const map: Record<string, string> = {
    pending: '待开始', analyzing: '分析中', bible_ready: '待改写',
    rewriting: '改写中', reviewing: '审核中', completed: '已完成', failed: '失败',
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

function chapterStatusLabel(status: string) {
  const map: Record<string, string> = {
    pending: '待改写', rewriting: '改写中', reviewing: '审核中', completed: '完成', failed: '失败',
  }
  return map[status] || status
}

function chapterStatusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'bg-gray-700 text-gray-400',
    rewriting: 'bg-violet-500/20 text-violet-300',
    reviewing: 'bg-yellow-500/20 text-yellow-300',
    completed: 'bg-emerald-500/20 text-emerald-300',
    failed: 'bg-red-500/20 text-red-300',
  }
  return map[status] || 'bg-gray-700 text-gray-400'
}
</script>
