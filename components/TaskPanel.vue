<template>
  <!-- Floating task panel — only visible when there are tasks -->
  <Transition name="slide-up">
    <div
      v-if="visible"
      class="fixed bottom-4 right-4 z-50 w-80 rounded-xl shadow-hard bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 overflow-hidden"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold text-gray-800 dark:text-gray-100">任务进度</span>
          <span
            v-if="activeCount > 0"
            class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-primary-500 text-white text-xs font-bold"
          >{{ activeCount }}</span>
        </div>
        <div class="flex items-center gap-2">
          <!-- Clear finished tasks -->
          <button
            v-if="doneCount > 0"
            class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="清除已完成"
            @click="taskStore.dismissAll()"
          >
            清除
          </button>
          <!-- Collapse / expand -->
          <button
            class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-lg leading-none"
            @click="collapsed = !collapsed"
          >
            {{ collapsed ? '▲' : '▼' }}
          </button>
        </div>
      </div>

      <!-- Task list -->
      <div v-if="!collapsed" class="max-h-72 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-800">
        <div
          v-for="task in taskStore.tasks"
          :key="task.task_id"
          class="px-4 py-3 flex items-start gap-3"
        >
          <!-- Status icon -->
          <div class="mt-0.5 flex-shrink-0">
            <span v-if="task.status === 'completed'" class="text-success-500 text-base">✓</span>
            <span v-else-if="task.status === 'failed'" class="text-error-500 text-base">✕</span>
            <span v-else-if="task.status === 'cancelled'" class="text-gray-400 text-base">⊘</span>
            <span v-else class="inline-block w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>

          <!-- Info -->
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{{ task.title }}</p>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              <span v-if="task.status === 'pending'">排队中…</span>
              <span v-else-if="task.status === 'running'">
                {{ task.progress > 0 ? task.progress + '%' : '处理中…' }}
              </span>
              <span v-else-if="task.status === 'completed'" class="text-success-600 dark:text-success-400">已完成</span>
              <span v-else-if="task.status === 'cancelled'" class="text-gray-400">已取消</span>
              <span v-else class="text-error-600 dark:text-error-400 truncate">{{ task.error || '失败' }}</span>
            </p>
            <!-- Progress bar for running tasks -->
            <div v-if="task.status === 'running'" class="mt-1.5 h-1 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                v-if="task.progress > 0"
                class="h-full bg-primary-500 rounded-full transition-all"
                :style="{ width: task.progress + '%' }"
              />
              <div v-else class="h-full bg-primary-500 rounded-full progress-indeterminate" />
            </div>
          </div>

          <!-- Type badge + action buttons -->
          <div class="flex-shrink-0 flex items-center gap-1">
            <span class="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
              {{ taskTypeLabel(task.type) }}
            </span>
            <!-- Stop button — for active tasks -->
            <button
              v-if="task.status === 'pending' || task.status === 'running'"
              class="w-5 h-5 flex items-center justify-center rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              title="停止任务"
              @click="taskStore.cancelTask(task.task_id)"
            >
              <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <rect x="5" y="5" width="14" height="14" rx="1"/>
              </svg>
            </button>
            <!-- Dismiss button — for finished tasks -->
            <button
              v-else-if="task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled'"
              class="text-gray-300 hover:text-gray-500 dark:hover:text-gray-300 text-sm leading-none p-0.5"
              title="关闭"
              @click="taskStore.dismiss(task.task_id)"
            >
              ×
            </button>
          </div>
        </div>

        <div v-if="taskStore.tasks.length === 0" class="px-4 py-6 text-center text-sm text-gray-400">
          暂无任务
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import type { AsyncTaskType } from '~/types'

const taskStore = useTaskStore()

const collapsed = ref(false)

const activeCount = computed(() => taskStore.activeTasks.length)
const doneCount = computed(() =>
  taskStore.tasks.filter(t => t.status === 'completed' || t.status === 'failed' || t.status === 'cancelled').length
)
const visible = computed(() => taskStore.tasks.length > 0)

const TYPE_LABELS: Record<string, string> = {
  storyboard_gen: '分镜',
  chapter_gen: '章节',
  voice_gen: '配音',
  image_gen: '图像',
  three_view: '三视图',
}

function taskTypeLabel(type: AsyncTaskType | string) {
  return TYPE_LABELS[type] ?? type
}

// Load active tasks when the panel mounts (restores after page refresh)
onMounted(() => {
  taskStore.loadActiveTasks()
})
</script>

<style scoped>
@keyframes indeterminate {
  0%   { transform: translateX(-100%) scaleX(0.4); }
  50%  { transform: translateX(80%)   scaleX(0.8); }
  100% { transform: translateX(300%)  scaleX(0.4); }
}
.progress-indeterminate { width: 40%; animation: indeterminate 1.4s ease-in-out infinite; }

.slide-up-enter-active, .slide-up-leave-active { transition: all 0.3s ease; }
.slide-up-enter-from, .slide-up-leave-to { opacity: 0; transform: translateY(16px); }
</style>
