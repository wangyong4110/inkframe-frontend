<script setup lang="ts">
import type { StoryboardShot } from '~/types'

const props = defineProps<{
  videoId: number
  shots: StoryboardShot[]
}>()
// refreshed：补全任务全部完成后触发，供不经过 videoStore.storyboard 响应式绑定的调用方
// （如 produce-v2.vue 自行维护的本地分镜副本）借机重新拉取，保持进度展示同步。
const emit = defineEmits<{ refreshed: [] }>()

const videoStore = useVideoStore()
const toast = useToast()

const video = computed(() => videoStore.currentVideo)
const finalVideoUrl = computed(() => video.value?.final_video_url ?? '')
const completedShots = computed(() => props.shots.filter(s => s.status === 'completed'))
const missingShots = computed(() => props.shots.filter(s => s.status !== 'completed'))
const readyPct = computed(() =>
  props.shots.length === 0 ? 0 : Math.round(completedShots.value.length / props.shots.length * 100)
)
const allReady = computed(() => props.shots.length > 0 && missingShots.value.length === 0)

// ── 批量生成缺失素材 ────────────────────────────────
const batchGenerating = ref(false)
async function handleBatchGenerate() {
  const shotsNeedingImages = props.shots.filter(s => !s.image_url)
  const shotsNeedingClips = props.shots.filter(s => s.image_url && !s.video_url)
  if (shotsNeedingImages.length === 0 && shotsNeedingClips.length === 0) {
    toast.error('没有需要补全的素材'); return
  }
  batchGenerating.value = true
  try {
    const taskStore = useTaskStore()
    const tasks: Promise<string>[] = []
    if (shotsNeedingImages.length > 0)
      tasks.push(videoStore.batchGenerateShotImages(props.videoId, shotsNeedingImages.map(s => s.id)))
    if (shotsNeedingClips.length > 0)
      tasks.push(videoStore.batchGenerateShotClips(props.videoId, shotsNeedingClips.map(s => s.id)))
    const taskIds = await Promise.all(tasks)
    toast.success(`补全任务已提交（${taskIds.length} 个任务），请稍后查看进度`)
    let doneCount = 0
    for (const taskId of taskIds) {
      if (!taskId) continue
      taskStore.trackTask(taskId, async (task) => {
        doneCount++
        if (task.status === 'completed' && doneCount >= taskIds.length) {
          await videoStore.fetchStoryboard(props.videoId)
          emit('refreshed')
          toast.success('素材补全完成')
        } else if (task.status === 'failed') {
          toast.error('部分素材生成失败，请检查')
        }
      })
    }
  } catch (e: any) {
    toast.error('提交失败：' + (e.message || ''))
  } finally {
    batchGenerating.value = false
  }
}

// ── 剪映草稿导出 ────────────────────────────────────
const exportingCapcut = ref(false)
async function handleCapcut() {
  exportingCapcut.value = true
  try {
    const api = useVideoApi()
    const blob = await api.exportVideo(props.videoId, 'capcut')
    triggerDownload(blob, `${video.value?.title || 'video'}_capcut.zip`)
    toast.success('剪映草稿导出成功，解压后在剪映中选择「本地草稿」导入')
  } catch (e: any) {
    toast.error('导出失败：' + (e.message || ''))
  } finally {
    exportingCapcut.value = false
  }
}

// ── B 剪草稿导出 ─────────────────────────────────────
const exportingBroll = ref(false)
async function handleBrollDraft() {
  exportingBroll.value = true
  try {
    const api = useVideoApi()
    const blob = await api.exportVideo(props.videoId, 'broll')
    triggerDownload(blob, `${video.value?.title || 'video'}_broll.zip`)
    toast.success('B 剪草稿导出成功，解压后在剪映中选择「本地草稿」导入')
  } catch (e: any) {
    toast.error('导出失败：' + (e.message || ''))
  } finally {
    exportingBroll.value = false
  }
}

// ── 合成 MP4 ─────────────────────────────────────────
const synthesizing = ref(false)
async function handleSynthesize() {
  synthesizing.value = true
  try {
    const { request } = useApi()
    await request(`/videos/${props.videoId}/synthesize`, { method: 'POST' })
    toast.success('合成任务已提交，请在「时间线」Tab 查看进度')
  } catch (e: any) {
    toast.error('合成失败：' + (e.message || ''))
  } finally {
    synthesizing.value = false
  }
}

// ── 其他格式 ─────────────────────────────────────────
const moreOpen = ref(false)
const exporting = ref<Record<string, boolean>>({})

// needsMedia: true 表示导出内容打包了图片/视频素材，必须先生成完成才有意义
// （素材包/FCPXML/EDL/OTIO 都会写入 image_url/video_url 或依赖实际生成的时长）。
// false 表示纯文本导出（字幕/分镜表/分镜脚本），只依赖分镜的文案字段，
// 分镜一旦创建即可导出，不必等图片/视频生成完成。
const otherFormats = [
  { key: 'zip',    label: '素材包',         desc: '.zip · 任意剪辑软件',               ext: '.zip',  needsMedia: true  },
  { key: 'srt',    label: 'SRT 字幕',       desc: '.srt · 通用字幕',                   ext: '.srt',  needsMedia: false },
  { key: 'vtt',    label: 'WebVTT',         desc: '.vtt · 浏览器 / 网络视频',          ext: '.vtt',  needsMedia: false },
  { key: 'fcpxml', label: 'FCPXML',         desc: '.zip · Final Cut / DaVinci',        ext: '.zip',  needsMedia: true  },
  { key: 'edl',    label: 'EDL',            desc: '.edl · Avid / Premiere / Vegas',    ext: '.edl',  needsMedia: true  },
  { key: 'otio',   label: 'OpenTimelineIO', desc: '.otio · Premiere / FCP / DaVinci',  ext: '.otio', needsMedia: true  },
  { key: 'csv',    label: '分镜表',         desc: '.csv · Excel / Notion',             ext: '.csv',  needsMedia: false },
  { key: 'xlsx',   label: '分镜脚本',       desc: '.xlsx · 制片/审片查阅',             ext: '.xlsx', needsMedia: false },
] as const

function isFormatDisabled(fmt: typeof otherFormats[number]) {
  if (exporting.value[fmt.key]) return true
  return fmt.needsMedia ? completedShots.value.length === 0 : props.shots.length === 0
}

async function handleExport(format: string, ext: string) {
  exporting.value = { ...exporting.value, [format]: true }
  try {
    const api = useVideoApi()
    const blob = await api.exportVideo(props.videoId, format)
    triggerDownload(blob, `${video.value?.title || 'video'}_${format}${ext}`)
    toast.success('导出成功')
  } catch (e: any) {
    toast.error('导出失败：' + (e.message || ''))
  } finally {
    exporting.value = { ...exporting.value, [format]: false }
  }
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="space-y-4">

    <!-- ① 素材就绪度 -->
    <div class="card p-4 space-y-3">
      <div class="flex items-center justify-between">
        <h3 class="font-semibold text-gray-900 dark:text-white">素材就绪度</h3>
        <span class="text-sm font-medium" :class="allReady ? 'text-green-500' : 'text-amber-500'">
          {{ completedShots.length }} / {{ shots.length }} 已生成
        </span>
      </div>

      <!-- 进度条 -->
      <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          class="h-2 rounded-full transition-all duration-500"
          :class="allReady ? 'bg-green-500' : 'bg-amber-500'"
          :style="{ width: readyPct + '%' }"
        />
      </div>

      <!-- 缺失镜头提示 + 补全按钮 -->
      <div v-if="!allReady" class="flex items-center justify-between gap-3">
        <p class="text-sm text-amber-600 dark:text-amber-400">
          还有 {{ missingShots.length }} 个镜头缺少图片/视频，建议先补全再导出
        </p>
        <button
          class="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors disabled:opacity-50"
          :disabled="batchGenerating"
          @click="handleBatchGenerate"
        >
          <svg v-if="batchGenerating" class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <svg v-else class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {{ batchGenerating ? '提交中...' : '一键补全素材' }}
        </button>
      </div>
      <p v-else class="text-sm text-green-600 dark:text-green-400">所有素材已就绪，可以导出</p>
    </div>

    <!-- ② 主要导出动作 -->
    <div class="card p-4 space-y-3">
      <h3 class="font-semibold text-gray-900 dark:text-white">快速导出</h3>

      <!-- 剪映草稿（首选） -->
      <button
        class="w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all"
        :class="completedShots.length === 0 || exportingCapcut
          ? 'border-gray-200 dark:border-gray-700 opacity-50 cursor-not-allowed'
          : 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30'"
        :disabled="completedShots.length === 0 || exportingCapcut"
        @click="handleCapcut"
      >
        <div class="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center flex-shrink-0">
          <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.069A1 1 0 0121 8.876V15.5a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z" />
          </svg>
        </div>
        <div class="flex-1 text-left">
          <div class="flex items-center gap-2">
            <span class="font-semibold text-gray-900 dark:text-white">导入剪映草稿</span>
            <span class="text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400 font-medium">推荐</span>
          </div>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            含视频轨 · 配音轨 · BGM 轨 · 字幕轨 · Ken Burns 运镜，在剪映中直接精修
          </p>
        </div>
        <div class="flex-shrink-0">
          <svg v-if="exportingCapcut" class="w-5 h-5 animate-spin text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <svg v-else class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </div>
      </button>

      <!-- B 剪草稿 -->
      <button
        class="w-full flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 transition-all"
        :class="completedShots.length === 0 || exportingBroll
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'"
        :disabled="completedShots.length === 0 || exportingBroll"
        @click="handleBrollDraft"
      >
        <div class="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center flex-shrink-0">
          <svg class="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <div class="flex-1 text-left">
          <span class="font-medium text-gray-900 dark:text-white">{{ exportingBroll ? '导出中...' : 'B 剪草稿' }}</span>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">静态图 · 配音轨 · 分镜注释，供剪辑师二剪参考</p>
        </div>
        <svg v-if="exportingBroll" class="w-5 h-5 animate-spin text-purple-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <svg v-else class="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      </button>

      <!-- 合成 MP4 -->
      <button
        class="w-full flex items-center gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 transition-all"
        :class="completedShots.length === 0 || synthesizing
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800'"
        :disabled="completedShots.length === 0 || synthesizing"
        @click="handleSynthesize"
      >
        <div class="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
          <svg class="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div class="flex-1 text-left">
          <span class="font-medium text-gray-900 dark:text-white">{{ synthesizing ? '合成中...' : '合成 MP4' }}</span>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">服务器渲染，完成后可直接下载成品视频</p>
        </div>
        <a
          v-if="finalVideoUrl"
          :href="finalVideoUrl"
          target="_blank"
          download
          class="flex-shrink-0 flex items-center gap-1 text-xs text-blue-500 hover:text-blue-600"
          @click.stop
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          下载成品
        </a>
      </button>
    </div>

    <!-- ③ 更多格式（折叠） -->
    <div class="card overflow-hidden">
      <button
        class="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
        @click="moreOpen = !moreOpen"
      >
        <span>更多导出格式</span>
        <svg
          class="w-4 h-4 transition-transform"
          :class="moreOpen ? 'rotate-180' : ''"
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div v-if="moreOpen" class="border-t border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/50">
        <div
          v-for="fmt in otherFormats"
          :key="fmt.key"
          class="flex items-center justify-between px-4 py-2.5"
        >
          <div>
            <span class="text-sm font-medium text-gray-900 dark:text-white">{{ fmt.label }}</span>
            <span class="text-xs text-gray-400 ml-2">{{ fmt.desc }}</span>
          </div>
          <button
            class="text-xs px-3 py-1 rounded-lg font-medium border transition-colors"
            :class="isFormatDisabled(fmt)
              ? 'bg-transparent border-transparent text-gray-400 dark:text-gray-600 opacity-60 cursor-not-allowed'
              : 'bg-blue-50 dark:bg-blue-500/15 border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/25'"
            :disabled="isFormatDisabled(fmt)"
            @click="handleExport(fmt.key, fmt.ext)"
          >
            {{ exporting[fmt.key] ? '导出中...' : '导出' }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>
