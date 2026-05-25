<script setup lang="ts">
import type { StoryboardShot } from '~/types'

const props = defineProps<{
  videoId: number
  shots: StoryboardShot[]
}>()

const videoStore = useVideoStore()
const toast = useToast()

const video = computed(() => videoStore.currentVideo)
const completedShots = computed(() => props.shots.filter(s => s.status === 'completed'))

const stitching = ref(false)
const exporting = ref<Record<string, boolean>>({})

const exportFormats = [
  { key: 'capcut', label: '剪映草稿',       desc: '.zip · 剪映 / CapCut',              ext: '.zip'  },
  { key: 'fcpxml', label: 'FCPXML',         desc: '.zip · DaVinci / Final Cut Pro',    ext: '.zip'  },
  { key: 'zip',    label: '素材包',         desc: '.zip · 任意剪辑软件',               ext: '.zip'  },
  { key: 'edl',    label: 'EDL',            desc: '.edl · Avid / Premiere / Vegas',    ext: '.edl'  },
  { key: 'otio',   label: 'OpenTimelineIO', desc: '.otio · Premiere / FCP / DaVinci',  ext: '.otio' },
  { key: 'srt',    label: 'SRT 字幕',       desc: '.srt · 通用字幕',                   ext: '.srt'  },
  { key: 'vtt',    label: 'WebVTT',         desc: '.vtt · 浏览器 / 网络视频',          ext: '.vtt'  },
  { key: 'csv',    label: '分镜表',         desc: '.csv · Excel / Notion',             ext: '.csv'  },
] as const

async function handleStitch() {
  stitching.value = true
  try {
    const { request } = useApi()
    await request(`/videos/${props.videoId}/stitch`, { method: 'POST' })
    toast.success('视频合成任务已提交')
  } catch (e: any) {
    toast.error('合成失败：' + (e.message || ''))
  } finally {
    stitching.value = false
  }
}

async function handleExport(format: string) {
  exporting.value = { ...exporting.value, [format]: true }
  try {
    const api = useVideoApi()
    const blob = await api.exportVideo(props.videoId, format)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const fmtInfo = exportFormats.find(f => f.key === format)
    const ext = fmtInfo?.ext ?? '.zip'
    a.download = `${video.value?.title || 'video_' + props.videoId}_${format}${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('导出成功')
  } catch (e: any) {
    toast.error('导出失败：' + (e.message || ''))
  } finally {
    exporting.value = { ...exporting.value, [format]: false }
  }
}
</script>

<template>
  <div class="space-y-3">
    <!-- Progress summary -->
    <div class="card p-4">
      <h3 class="font-semibold text-gray-900 dark:text-white mb-3">制作进度</h3>
      <div class="space-y-2.5">
        <div class="flex items-center gap-3">
          <div class="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 bg-green-100 text-green-600">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span class="text-sm text-gray-900 dark:text-white">
            分镜脚本已确认
            <span class="text-xs text-gray-400 ml-1">（{{ shots.length }} 个镜头）</span>
          </span>
        </div>
        <div class="flex items-center gap-3">
          <div class="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
            :class="completedShots.length > 0 ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <span class="text-sm" :class="completedShots.length > 0 ? 'text-gray-900 dark:text-white' : 'text-gray-400'">
            视频/图片素材
            <span class="text-xs text-gray-400 ml-1">（{{ completedShots.length }}/{{ shots.length }} 已生成）</span>
          </span>
        </div>
        <div class="flex items-center gap-3">
          <div class="w-6 h-6 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center flex-shrink-0">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span class="text-sm text-gray-400">配音字幕（可选）</span>
        </div>
        <div class="flex items-center gap-3">
          <div class="w-6 h-6 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center flex-shrink-0">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <span class="text-sm text-gray-400">背景音乐（可选）</span>
        </div>
      </div>
    </div>

    <!-- Export formats -->
    <div class="card p-5">
      <h3 class="font-semibold text-gray-900 dark:text-white mb-4">导出格式</h3>
      <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <template v-for="fmt in exportFormats" :key="fmt.key">
          <div class="border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex flex-col gap-2">
            <div class="text-sm font-medium text-gray-900 dark:text-white">{{ fmt.label }}</div>
            <div class="text-xs text-gray-400">{{ fmt.desc }}</div>
            <button
              class="btn-primary mt-auto text-xs py-1.5"
              :disabled="completedShots.length === 0 || exporting[fmt.key]"
              @click="handleExport(fmt.key)"
            >
              <svg v-if="exporting[fmt.key]" class="w-3 h-3 mr-1 animate-spin inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {{ exporting[fmt.key] ? '导出中...' : '导出' }}
            </button>
          </div>
        </template>
      </div>
      <p v-if="completedShots.length === 0" class="mt-3 text-sm text-amber-600 dark:text-amber-400">
        请先在「分镜脚本」Tab 生成视频/图片素材
      </p>
      <!-- 合成 MP4 -->
      <div class="mt-3 flex gap-3">
        <button
          class="btn-outline"
          :disabled="completedShots.length === 0 || stitching"
          @click="handleStitch"
        >
          {{ stitching ? '合成中...' : '合成 MP4' }}
        </button>
      </div>
    </div>
  </div>
</template>
