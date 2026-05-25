<script setup lang="ts">
import type { AsyncTask, ApiResponse } from '~/types'
import { usePollWithBackoff } from '~/composables/usePollWithBackoff'

const props = defineProps<{
  videoId: number
}>()

const emit = defineEmits<{
  (e: 'open-publish'): void
  (e: 'task-started', taskId: string): void
}>()

const videoStore = useVideoStore()
const toast = useToast()

const video = computed(() => videoStore.currentVideo)
const finalVideoUrl = computed(() => video.value?.final_video_url ?? '')
const coverUrl = computed(() => video.value?.cover_url ?? '')
const isSynthesized = computed(() => !!finalVideoUrl.value)

const synthesizing = ref(false)
const synthesizeProgress = ref(0)
const synthesizeStep = ref('')
const synthesizeTaskId = ref('')

const STORAGE_KEY = () => `synthesize_task_${props.videoId}`

const { request } = useApi()

function updateStepFromProgress(p: number) {
  if (p <= 10) synthesizeStep.value = '正在拼接视频...'
  else if (p <= 40) synthesizeStep.value = '字幕处理中...'
  else if (p <= 60) synthesizeStep.value = '提取封面...'
  else if (p <= 70) synthesizeStep.value = '上传至云端...'
  else synthesizeStep.value = '即将完成...'
}

const pollController = usePollWithBackoff<AsyncTask | null>({
  fn: async () => {
    const res = await request<ApiResponse<AsyncTask>>(`/tasks/${synthesizeTaskId.value}`)
    return res?.data ?? null
  },
  isDone: (task) => {
    if (!task) return false
    return ['completed', 'failed', 'cancelled'].includes(task.status)
  },
  onResult: async (task) => {
    if (!task) return
    synthesizeProgress.value = task.progress ?? 0
    updateStepFromProgress(task.progress ?? 0)
    if (task.status === 'completed') {
      synthesizing.value = false
      synthesizeProgress.value = 100
      synthesizeStep.value = '合成完成'
      localStorage.removeItem(STORAGE_KEY())
      toast.success('视频合成成功！')
      await videoStore.fetchVideo(props.videoId)
    } else if (task.status === 'failed') {
      synthesizing.value = false
      localStorage.removeItem(STORAGE_KEY())
      toast.error('合成失败：' + (task.error || ''))
    } else if (task.status === 'cancelled') {
      synthesizing.value = false
      localStorage.removeItem(STORAGE_KEY())
      toast.info('合成任务已取消')
    }
  },
  onError: () => {
    // network jitter — polling continues automatically via backoff
  },
  initialDelay: 2000,
  maxDelay: 8000,
  maxElapsedMs: 15 * 60 * 1000,
})

function startPolling(taskId: string) {
  synthesizeTaskId.value = taskId
  pollController.start()
}

onMounted(() => {
  const savedTaskId = localStorage.getItem(STORAGE_KEY())
  if (savedTaskId) {
    synthesizing.value = true
    synthesizeStep.value = '恢复中...'
    startPolling(savedTaskId)
  }
})

async function handleSynthesize() {
  synthesizing.value = true
  synthesizeProgress.value = 0
  synthesizeStep.value = '提交任务...'
  try {
    const api = useVideoApi()
    const res = await api.synthesizeVideo(props.videoId)
    const taskId = res?.data?.task_id
    if (!taskId) throw new Error('未获取到任务 ID')
    localStorage.setItem(STORAGE_KEY(), taskId)
    emit('task-started', taskId)
    startPolling(taskId)
  } catch (e: any) {
    toast.error('合成失败：' + (e.message || ''))
    synthesizing.value = false
  }
}
</script>

<template>
  <div class="border-t border-gray-200 dark:border-gray-700 pt-3 space-y-2">
    <!-- Not synthesized -->
    <template v-if="!isSynthesized && !synthesizing">
      <button
        class="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        @click="handleSynthesize"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.069A1 1 0 0121 8.876V15.5a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" /></svg>
        合成视频
      </button>
    </template>

    <!-- Synthesizing -->
    <template v-else-if="synthesizing">
      <div class="space-y-1">
        <div class="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>{{ synthesizeStep || '合成中...' }}</span>
          <span>{{ synthesizeProgress }}%</span>
        </div>
        <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
          <div
            class="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
            :style="{ width: synthesizeProgress + '%' }"
          />
        </div>
      </div>
    </template>

    <!-- Synthesized -->
    <template v-else>
      <video
        :src="finalVideoUrl"
        :poster="coverUrl || undefined"
        controls
        class="w-full rounded-lg max-h-40 object-contain bg-black"
      />
      <div class="flex gap-2">
        <a
          :href="finalVideoUrl"
          target="_blank"
          download
          class="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
          下载
        </a>
        <button
          class="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium bg-green-600 hover:bg-green-700 text-white transition-colors"
          @click="emit('open-publish')"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
          发布
        </button>
        <button
          class="flex items-center justify-center p-1.5 rounded-lg text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-400 transition-colors"
          title="重新合成"
          @click="handleSynthesize"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
        </button>
      </div>
    </template>
  </div>
</template>
