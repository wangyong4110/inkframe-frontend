import type { VideoQualityTier } from '~/types'

export const TRANSITION_OPTIONS = [
  { value: 'cut',       label: '硬切' },
  { value: 'j-cut',     label: 'J剪切（声音提前入）' },
  { value: 'l-cut',     label: 'L剪切（声音延续出）' },
  { value: 'fade',      label: '淡入淡出' },
  { value: 'dissolve',  label: '交叉溶解' },
  { value: 'dip-black', label: '切黑淡入' },
  { value: 'dip-white', label: '切白淡入' },
  { value: 'wipe',      label: '划像' },
  { value: 'push',      label: '推镜切换' },
  { value: 'slide',     label: '滑动切换' },
  { value: 'zoom',      label: '变焦切换' },
  { value: 'whip-pan',  label: '甩镜切换' },
  { value: 'spin',      label: '旋转切换' },
  { value: 'flash',     label: '闪白' },
  { value: 'glitch',    label: '故障闪烁' },
  { value: 'blur',      label: '模糊过渡' },
  { value: 'morph',     label: '形变融合' },
]

export const QUALITY_LABELS: Record<VideoQualityTier, string> = {
  draft: '草稿',
  preview: '预览',
  final: '正式',
}

export const QUALITY_COLORS: Record<VideoQualityTier, string> = {
  draft: 'bg-gray-100 text-gray-700',
  preview: 'bg-blue-100 text-blue-700',
  final: 'bg-amber-100 text-amber-700',
}

export const SHOT_STATUS_LABELS: Record<string, string> = {
  pending: '待生成',
  generating: '生成中',
  completed: '已完成',
  failed: '失败',
}

export const SHOT_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-500',
  generating: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}

export const VIDEO_STATUS_LABELS: Record<string, string> = {
  planning: '规划中',
  generating: '生成中',
  completed: '已完成',
  failed: '失败',
}

export const VIDEO_STATUS_COLORS: Record<string, string> = {
  planning: 'bg-blue-100 text-blue-700',
  generating: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}
