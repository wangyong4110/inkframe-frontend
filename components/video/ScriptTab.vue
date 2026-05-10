<script setup lang="ts">
import type { StoryboardShot, VideoQualityTier } from '~/types'
import { SHOT_STATUS_LABELS, SHOT_STATUS_COLORS, QUALITY_LABELS, QUALITY_COLORS, TRANSITION_OPTIONS } from '~/constants/status'

const props = defineProps<{ videoId: number; llmProvider?: string }>()

const { openLightbox } = useImageLightbox()
const videoStore = useVideoStore()
const novelStore = useNovelStore()
const sceneAnchorStore = useSceneAnchorStore()
const characterStore = useCharacterStore()
const toast = useToast()

const video = computed(() => videoStore.currentVideo)
const shots = computed(() => videoStore.storyboard)
const isScriptConfirmed = computed(() => video.value?.script_status === 'confirmed')
const generatingStoryboard = computed(() => videoStore.generating)

const videoProviders = ref<{ name: string; display_name: string }[]>([])
const selectedVideoProvider = ref('')
const batchGenerating = ref(false)
const batchGeneratingImages = ref(false)
const batchGeneratingClips = ref(false)
const uploadingShotId = ref<number | null>(null)
const shotImageInputRef = ref<HTMLInputElement | null>(null)
const shotImageTargetId = ref<number | null>(null)

const confirmingScript = ref(false)
const editingId = ref<number | null>(null)
const editForm = ref<Partial<StoryboardShot & { emotional_tone: string }>>({})
const savingEdit = ref(false)

const anchors = computed(() => sceneAnchorStore.anchors)
const characters = computed(() => characterStore.characters)

// ── AI params ──
const {
  pacing,
  targetDuration,
  advMaxTokens,
  advTemperature,
  advTimeoutSeconds,
  voiceMode,
  initFromNovel: initAiParamsFromNovel,
  initFromVideo: initAiParamsFromVideo,
} = useAiGenerationParams()

const storyboardUserPrompt = ref('')
const showAdvancedParams = ref(false)

let pacingInitialized = false
watch(video, (v) => {
  if (v && !pacingInitialized) {
    initAiParamsFromVideo(v)
    pacingInitialized = true
  }
}, { immediate: true })

watch(() => novelStore.currentNovel, (n) => {
  initAiParamsFromNovel(n)
}, { immediate: true })

const pacingOptions = [
  { value: 'slow' as const,   label: '慢' },
  { value: 'normal' as const, label: '标准' },
  { value: 'fast' as const,   label: '快' },
]
const durationOptions = [
  { value: 0,   label: '自动' },
  { value: 60,  label: '1分钟' },
  { value: 180, label: '3分钟' },
  { value: 300, label: '5分钟' },
]
const avgShotDur = computed(() => ({ slow: 8, normal: 5, fast: 3 }[pacing.value]))
const estimatedShots = computed(() =>
  targetDuration.value > 0
    ? Math.max(3, Math.round(targetDuration.value / avgShotDur.value))
    : '自动'
)

// ── Options ──
const SHOT_SIZE_OPTIONS = [
  { value: 'extreme_wide', label: '极远景' },
  { value: 'wide', label: '远景' },
  { value: 'full', label: '全景' },
  { value: 'medium', label: '中景' },
  { value: 'close_up', label: '近景' },
  { value: 'extreme_close_up', label: '特写' },
]
const CAMERA_ANGLE_OPTIONS = [
  { value: 'eye_level', label: '平视' },
  { value: 'high', label: '俯拍' },
  { value: 'low', label: '仰拍' },
  { value: 'dutch', label: '倾斜' },
  { value: 'overhead', label: '顶拍' },
  { value: 'POV', label: '主观' },
]
const CAMERA_TYPE_OPTIONS = [
  { value: 'static', label: '固定' },
  { value: 'pan', label: '摇镜' },
  { value: 'zoom', label: '推拉' },
  { value: 'tracking', label: '跟拍' },
  { value: 'dolly', label: '移镜' },
  { value: 'crane', label: '升降' },
]
const SHOT_SIZE_LABEL: Record<string, string> = Object.fromEntries(SHOT_SIZE_OPTIONS.map(o => [o.value, o.label]))
const CAMERA_ANGLE_LABEL: Record<string, string> = Object.fromEntries(CAMERA_ANGLE_OPTIONS.map(o => [o.value, o.label]))
const CAMERA_TYPE_LABEL: Record<string, string> = Object.fromEntries(CAMERA_TYPE_OPTIONS.map(o => [o.value, o.label]))
const TRANSITION_LABEL: Record<string, string> = Object.fromEntries(TRANSITION_OPTIONS.map(o => [o.value, o.label]))

// ── Review ──
type ShotFeedback = { shot_no: number; issues: string[]; suggestion: string; severity: 'info' | 'warning' | 'error' }
type StoryboardReview = {
  overall_score: number; narrative_score: number; visual_score: number
  pacing_score: number; narration_score: number
  summary: string; strengths: string[]; weaknesses: string[]
  global_suggestions: string[]; shot_feedback: ShotFeedback[]
}
const showReviewPanel = ref(false)
const reviewing = ref(false)
const reviewResult = ref<StoryboardReview | null>(null)
const reviewError = ref('')

// ── Voice text inline edit (shared with voice tab context) ──
const editingVoiceTextId = ref<number | null>(null)
const editingVoiceTextType = ref<'narration' | 'dialogue'>('narration')
const voiceTextDraft = ref('')
const savingVoiceText = ref(false)

// ── Shot insert ──
const insertingShotAfter = ref<number | null>(null)
const insertShotForm = reactive({ narration: '', description: '', duration: 4 })
const insertingShotLoading = ref(false)

function parseSfxTags(sfxTags?: string): string[] {
  if (!sfxTags) return []
  try { return JSON.parse(sfxTags) as string[] } catch { return [] }
}

function startEdit(shot: StoryboardShot) {
  editingId.value = shot.id
  editForm.value = {
    description: shot.description,
    narration: shot.narration,
    dialogue: shot.dialogue,
    subtitle: shot.subtitle,
    emotional_tone: (shot as any).emotional_tone || '',
    shot_size: shot.shot_size,
    camera_angle: shot.camera_angle,
    camera_type: shot.camera_type,
    duration: shot.duration,
    transition: shot.transition || 'cut',
    sfx_tags: shot.sfx_tags || '',
    sfx_volume: shot.sfx_volume ?? 0,
  }
}

function cancelEdit() {
  editingId.value = null
  editForm.value = {}
}

async function saveEdit(shotId: number) {
  savingEdit.value = true
  try {
    await videoStore.updateShot(props.videoId, shotId, editForm.value as any)
    editingId.value = null
    editForm.value = {}
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || ''))
  } finally {
    savingEdit.value = false
  }
}

function startEditVoiceText(shot: StoryboardShot, type: 'narration' | 'dialogue') {
  editingVoiceTextId.value = shot.id
  editingVoiceTextType.value = type
  voiceTextDraft.value = type === 'narration' ? (shot.narration || '') : (shot.dialogue || '')
}

function cancelEditVoiceText() {
  editingVoiceTextId.value = null
  voiceTextDraft.value = ''
}

async function saveVoiceText(shot: StoryboardShot) {
  savingVoiceText.value = true
  try {
    await videoStore.updateShot(props.videoId, shot.id, { [editingVoiceTextType.value]: voiceTextDraft.value.trim() } as any)
    editingVoiceTextId.value = null
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || ''))
  } finally {
    savingVoiceText.value = false
  }
}

async function handleConfirmScript() {
  if (shots.value.length === 0) {
    toast.error('请先生成分镜脚本')
    return
  }
  confirmingScript.value = true
  try {
    await videoStore.updateVideo(props.videoId, { script_status: 'confirmed' })
    toast.success('脚本已确认，现在可以生成素材')
  } catch (e: any) {
    toast.error('确认失败：' + (e.message || ''))
  } finally {
    confirmingScript.value = false
  }
}

async function handleUnconfirmScript() {
  try {
    await videoStore.updateVideo(props.videoId, { script_status: 'draft' })
  } catch (e: any) {
    toast.error('操作失败：' + (e.message || ''))
  }
}

async function handleGenerateStoryboard(userPrompt?: string) {
  if (isScriptConfirmed.value) {
    if (!confirm('重新生成将清空当前脚本，是否继续？')) return
  }
  const novel = novelStore.currentNovel
  const effectiveMaxTokens = advMaxTokens.value || novel?.max_tokens || undefined
  const effectiveTemperature = advTemperature.value || novel?.temperature || undefined
  const effectiveTimeout = advTimeoutSeconds.value || novel?.timeout_seconds || undefined
  try {
    await videoStore.generateStoryboard(
      props.videoId,
      props.llmProvider || undefined,
      userPrompt,
      pacing.value !== 'normal' ? pacing.value : undefined,
      targetDuration.value || undefined,
      effectiveMaxTokens || undefined,
      effectiveTemperature || undefined,
      effectiveTimeout || undefined,
      voiceMode.value !== 'both' ? voiceMode.value : undefined,
    )
    toast.success('脚本生成任务已提交，请稍候...')
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || ''))
  }
}

async function handleReviewStoryboard() {
  reviewing.value = true
  reviewError.value = ''
  reviewResult.value = null
  showReviewPanel.value = true
  try {
    await videoStore.reviewStoryboard(props.videoId, props.llmProvider || undefined, (task) => {
      reviewing.value = false
      if (task.status === 'completed') {
        reviewResult.value = task.data as StoryboardReview
      } else {
        reviewError.value = (task as any).error || '审查失败，请稍后重试'
      }
    })
  } catch (e: any) {
    reviewError.value = e.message || '审查失败，请稍后重试'
    reviewing.value = false
  }
}

function scoreColor(score: number) {
  if (score >= 8) return 'text-green-600 dark:text-green-400'
  if (score >= 6) return 'text-yellow-600 dark:text-yellow-400'
  return 'text-red-600 dark:text-red-400'
}

function severityClass(severity: string) {
  if (severity === 'error') return 'border-red-400 bg-red-50 dark:bg-red-900/20'
  if (severity === 'warning') return 'border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20'
  return 'border-blue-300 bg-blue-50 dark:bg-blue-900/20'
}

async function handleGenerateShot(shot: StoryboardShot) {
  try {
    const res = await videoStore.generateShot(props.videoId, shot.id, selectedVideoProvider.value || undefined)
    const taskId = (res as any)?.task_id as string | undefined
    if (!taskId) { toast.error('生成失败：未获取到任务ID'); return }
    toast.info(`镜头 #${shot.shot_no} 素材生成中…`)
    const taskStore = useTaskStore()
    taskStore.trackTask(taskId, async (task) => {
      if (task.status === 'completed') {
        await videoStore.fetchStoryboard(props.videoId)
        toast.success(`镜头 #${shot.shot_no} 素材已生成`)
      } else {
        toast.error(`镜头 #${shot.shot_no} 生成失败`)
      }
    })
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || ''))
  }
}

async function handleGenerateAll() {
  const pending = shots.value.filter(s => s.status === 'pending' || s.status === 'failed')
  if (pending.length === 0) { toast.error('没有待生成的镜头'); return }
  batchGenerating.value = true
  try {
    const taskId = await videoStore.batchGenerateShots(props.videoId, pending.map(s => s.id), video.value?.quality_tier, selectedVideoProvider.value || undefined)
    if (!taskId) { toast.error('批量生成失败：未获取到任务ID'); batchGenerating.value = false; return }
    toast.info(`${pending.length} 个镜头素材生成中…`)
    const taskStore = useTaskStore()
    taskStore.trackTask(taskId, async (task) => {
      batchGenerating.value = false
      if (task.status === 'completed') {
        await videoStore.fetchStoryboard(props.videoId)
        toast.success('全部镜头素材生成完成')
      } else {
        toast.error('批量生成失败，请重试')
      }
    })
  } catch (e: any) {
    toast.error('批量生成失败：' + (e.message || ''))
    batchGenerating.value = false
  }
}

function triggerShotImageUpload(shotId: number) {
  shotImageTargetId.value = shotId
  shotImageInputRef.value?.click()
}

async function onShotImageFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file || shotImageTargetId.value == null) return
  const shotId = shotImageTargetId.value
  uploadingShotId.value = shotId
  ;(e.target as HTMLInputElement).value = ''
  const localUrl = URL.createObjectURL(file)
  const idx = videoStore.storyboard.findIndex(s => s.id === shotId)
  if (idx >= 0) videoStore.storyboard[idx] = { ...videoStore.storyboard[idx], image_url: localUrl }
  try {
    const api = useVideoApi()
    const res = await api.uploadShotImage(props.videoId, shotId, file)
    const ossUrl = (res as any)?.data?.image_url || localUrl
    if (idx >= 0) videoStore.storyboard[idx] = { ...videoStore.storyboard[idx], image_url: ossUrl, status: 'completed' }
    toast.success('图片上传成功')
  } catch (e: any) {
    if (idx >= 0) videoStore.storyboard[idx] = { ...videoStore.storyboard[idx], image_url: '' }
    URL.revokeObjectURL(localUrl)
    toast.error('图片上传失败：' + (e?.message || ''))
  } finally {
    uploadingShotId.value = null
  }
}

async function refineShotImage(shot: StoryboardShot, suggestion: string): Promise<string> {
  const api = useVideoApi()
  const res = await api.refineShotImage(props.videoId, shot.id, suggestion)
  return res.data?.image_url || ''
}

function saveShotImage(shot: StoryboardShot, newUrl: string) {
  const idx = videoStore.storyboard.findIndex(s => s.id === shot.id)
  if (idx >= 0) videoStore.storyboard[idx].image_url = newUrl
}

async function handleGenerateImages() {
  if (generatingStoryboard.value) {
    toast.error('分镜脚本正在生成中，请等待完成后再生成图片')
    return
  }
  const pending = shots.value.filter(s => !s.image_url && (s.status === 'pending' || s.status === 'failed' || s.status === 'completed'))
  if (pending.length === 0) { toast.error('没有需要生成图片的镜头'); return }
  batchGeneratingImages.value = true
  try {
    const taskId = await videoStore.batchGenerateShotImages(props.videoId, pending.map(s => s.id))
    if (!taskId) { toast.error('图片生成失败：未获取到任务ID'); batchGeneratingImages.value = false; return }
    toast.info(`${pending.length} 个镜头图片生成中…`)
    const taskStore = useTaskStore()
    taskStore.trackTask(taskId, async (task) => {
      batchGeneratingImages.value = false
      if (task.status === 'completed') {
        await videoStore.fetchStoryboard(props.videoId)
        toast.success('全部镜头图片生成完成')
      } else {
        toast.error('图片生成失败，请重试')
      }
    })
  } catch (e: any) {
    toast.error('图片生成失败：' + (e.message || ''))
    batchGeneratingImages.value = false
  }
}

async function handleGenerateClips() {
  if (generatingStoryboard.value) {
    toast.error('分镜脚本正在生成中，请等待完成后再生成视频')
    return
  }
  const pending = shots.value.filter(s => s.image_url && !s.video_url)
  if (pending.length === 0) { toast.error('没有需要生成视频的镜头（请先生成图片）'); return }
  batchGeneratingClips.value = true
  try {
    const taskId = await videoStore.batchGenerateShotClips(props.videoId, pending.map(s => s.id))
    if (!taskId) { toast.error('视频生成失败：未获取到任务ID'); batchGeneratingClips.value = false; return }
    toast.info(`${pending.length} 个镜头视频生成中…`)
    const taskStore = useTaskStore()
    taskStore.trackTask(taskId, async (task) => {
      batchGeneratingClips.value = false
      if (task.status === 'completed') {
        await videoStore.fetchStoryboard(props.videoId)
        toast.success('全部镜头视频生成完成')
      } else {
        toast.error('视频生成失败，请重试')
      }
    })
  } catch (e: any) {
    toast.error('视频生成失败：' + (e.message || ''))
    batchGeneratingClips.value = false
  }
}

async function handleSetShotAnchor(shot: StoryboardShot, anchorId: number | null) {
  try {
    const api = useSceneAnchorApi()
    await api.setShotAnchor(props.videoId, shot.id, anchorId)
    await videoStore.fetchStoryboard(props.videoId)
  } catch (e: any) {
    toast.error('绑定失败：' + (e.message || ''))
  }
}

async function handleSetShotCharacters(shot: StoryboardShot, characterIds: number[]) {
  try {
    const { request } = useApi()
    await request(`/videos/${props.videoId}/shots/${shot.id}/characters`, {
      method: 'PUT',
      body: JSON.stringify({ character_ids: characterIds }),
    })
    await videoStore.fetchStoryboard(props.videoId)
  } catch (e: any) {
    toast.error('角色绑定失败：' + (e.message || ''))
  }
}

function addCharToShot(shot: StoryboardShot, event: Event) {
  const id = Number((event.target as HTMLSelectElement).value)
  if (!id) return
  ;(event.target as HTMLSelectElement).value = ''
  handleSetShotCharacters(shot, [...(shot.character_ids || []), id])
}

function removeCharFromShot(shot: StoryboardShot, charId: number) {
  handleSetShotCharacters(shot, (shot.character_ids || []).filter(id => id !== charId))
}

async function handleInsertShot(afterShotNo: number) {
  insertingShotLoading.value = true
  try {
    const api = useVideoApi()
    await api.insertShot(props.videoId, afterShotNo, insertShotForm.narration, insertShotForm.description, insertShotForm.duration)
    insertingShotAfter.value = null
    insertShotForm.narration = ''
    insertShotForm.description = ''
    insertShotForm.duration = 4
    await videoStore.fetchStoryboard(props.videoId)
    toast.success('镜头已插入')
  } catch (e: any) {
    toast.error('插入失败：' + (e.message || ''))
  } finally {
    insertingShotLoading.value = false
  }
}

async function handleCopyShot(shot: StoryboardShot) {
  try {
    const api = useVideoApi()
    await api.copyShot(props.videoId, shot.id, -1)
    await videoStore.fetchStoryboard(props.videoId)
    toast.success('镜头已复制')
  } catch (e: any) {
    toast.error('复制失败：' + (e.message || ''))
  }
}

async function handleDeleteShot(shot: StoryboardShot) {
  if (!confirm(`确认删除镜头 #${shot.shot_no}？此操作不可撤销。`)) return
  try {
    const api = useVideoApi()
    await api.deleteShot(props.videoId, shot.id)
    await videoStore.fetchStoryboard(props.videoId)
    toast.success('镜头已删除')
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || ''))
  }
}

// Expose for parent
defineExpose({ loadVideoProviders: async () => {
  const { getVideoProviders } = useVideoApi()
  const res = await getVideoProviders()
  videoProviders.value = (res as any)?.data ?? []
} })
</script>

<template>
  <div>
    <!-- Script confirmed banner -->
    <div v-if="isScriptConfirmed" class="flex items-center gap-3 px-4 py-2.5 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg mb-4">
      <svg class="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span class="text-sm font-medium text-green-800 dark:text-green-300">
        脚本已确认 · {{ shots.length }} 个镜头 · 可在其他 Tab 生成素材
      </span>
      <div class="flex-1" />
      <button class="text-xs text-green-600 dark:text-green-400 hover:underline" @click="handleUnconfirmScript">
        解除确认
      </button>
    </div>

    <!-- Toolbar -->
    <div class="flex items-center gap-2 mb-4">
      <!-- Mode toggle badge -->
      <button
        class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
        :class="video?.mode === 'slideshow'
          ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700'
          : 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700'"
        :title="video?.mode === 'slideshow' ? '点击切换为 AI 视频模式' : '点击切换为图片解说模式'"
        @click="videoStore.updateVideo(props.videoId, { mode: video?.mode === 'slideshow' ? 'video' : 'slideshow' }).then(() => videoStore.fetchVideo(props.videoId))"
      >
        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path v-if="video?.mode === 'slideshow'" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          <path v-else stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        {{ video?.mode === 'slideshow' ? '图片解说' : 'AI 视频' }}
      </button>

      <div class="flex-1" />

      <!-- Production toolbar (confirmed) -->
      <template v-if="isScriptConfirmed">
        <div v-if="video?.mode !== 'slideshow' && videoProviders.length > 0" class="flex items-center gap-1.5">
          <label class="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">视频提供商</label>
          <select v-model="selectedVideoProvider" class="input text-sm py-1 h-8">
            <option value="">默认</option>
            <option v-for="p in videoProviders" :key="p.name" :value="p.name">{{ p.display_name || p.name }}</option>
          </select>
        </div>
        <button class="btn-secondary text-sm" :disabled="batchGeneratingImages || batchGeneratingClips || generatingStoryboard" @click="handleGenerateImages">
          <svg v-if="batchGeneratingImages" class="w-4 h-4 mr-1.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {{ batchGeneratingImages ? '图片生成中…' : '生成图片' }}
        </button>
        <button class="btn-primary text-sm" :disabled="batchGeneratingImages || batchGeneratingClips || generatingStoryboard" @click="handleGenerateClips">
          <svg v-if="batchGeneratingClips" class="w-4 h-4 mr-1.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          {{ batchGeneratingClips ? '视频生成中…' : '生成视频' }}
        </button>
      </template>

      <!-- Script toolbar (not confirmed, shots exist) -->
      <template v-else-if="shots.length > 0">
        <button
          class="btn-secondary text-sm flex items-center gap-1.5"
          :disabled="reviewing"
          @click="handleReviewStoryboard"
        >
          <svg v-if="reviewing" class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          {{ reviewing ? 'AI 审查中…' : 'AI 审查' }}
        </button>
        <button
          class="btn-primary text-sm bg-green-600 hover:bg-green-700 border-green-600"
          :disabled="confirmingScript"
          @click="handleConfirmScript"
        >
          <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          确认脚本
        </button>
      </template>
    </div>

    <!-- Hidden file input for shot image upload -->
    <input
      ref="shotImageInputRef"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      class="hidden"
      @change="onShotImageFileSelected"
    />

    <!-- Empty state -->
    <div v-if="shots.length === 0 && !videoStore.loading && videoStore.storyboardTaskStatus !== 'running'" class="card p-14 text-center">
      <svg class="w-14 h-14 mx-auto text-gray-300 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
      </svg>
      <h3 class="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1.5">还没有分镜脚本</h3>
      <p class="text-sm text-gray-400 dark:text-gray-500 mb-4">
        点击「生成分镜脚本」，AI 将自动从章节内容提取镜头<br>
        生成后可逐条编辑，确认无误再生成素材
      </p>
      <!-- 分镜生成控制 -->
      <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 mb-4 text-sm">
        <div class="flex items-center gap-1.5">
          <span class="text-gray-500 dark:text-gray-400 text-xs">节奏</span>
          <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <button v-for="p in pacingOptions" :key="p.value"
              class="px-2.5 py-1 text-xs transition-colors"
              :class="pacing === p.value
                ? 'bg-primary-500 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-750'"
              @click="pacing = p.value">
              {{ p.label }}
            </button>
          </div>
        </div>
        <div class="flex items-center gap-1.5">
          <span class="text-gray-500 dark:text-gray-400 text-xs">时长</span>
          <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <button v-for="d in durationOptions" :key="d.value"
              class="px-2.5 py-1 text-xs transition-colors"
              :class="targetDuration === d.value
                ? 'bg-primary-500 text-white'
                : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-750'"
              @click="targetDuration = d.value">
              {{ d.label }}
            </button>
          </div>
        </div>
        <span class="text-xs text-gray-400 dark:text-gray-500">
          预计约 <span class="font-medium text-gray-600 dark:text-gray-300">{{ estimatedShots }}</span> 个镜头
        </span>
      </div>
      <!-- 高级 AI 参数（折叠） -->
      <div class="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        <button
          class="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          @click="showAdvancedParams = !showAdvancedParams"
        >
          <span>高级参数</span>
          <svg class="w-3.5 h-3.5 transition-transform" :class="showAdvancedParams ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div v-if="showAdvancedParams" class="px-3 pb-3 space-y-2.5 bg-gray-50 dark:bg-gray-800/50">
          <div>
            <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Max Tokens <span class="text-gray-400">（0 = 系统默认）</span>
            </label>
            <input
              v-model.number="advMaxTokens"
              type="number" min="0" max="32768" step="256"
              placeholder="0"
              class="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"
            />
          </div>
          <div>
            <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              Temperature <span class="text-gray-400">（0 = 系统默认 0.1；范围 0.1-2.0）</span>
            </label>
            <div class="flex items-center gap-2">
              <input v-model.number="advTemperature" type="range" min="0" max="2.0" step="0.1" class="flex-1 accent-primary-500" />
              <input v-model.number="advTemperature" type="number" min="0" max="2.0" step="0.1" placeholder="0"
                class="w-14 px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400" />
            </div>
          </div>
          <div>
            <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">
              超时时间（秒）<span class="text-gray-400">（0 = 系统默认 300s；范围 30-600）</span>
            </label>
            <input
              v-model.number="advTimeoutSeconds"
              type="number" min="0" max="600" step="30"
              placeholder="0"
              class="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"
            />
          </div>
        </div>
      </div>
      <textarea
        v-model="storyboardUserPrompt"
        rows="2"
        placeholder="额外要求（可选）：如「加强战斗场面节奏」、「突出主角情绪变化」..."
        class="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-400 resize-none mb-2"
      />
      <button class="btn-primary" :disabled="generatingStoryboard" @click="handleGenerateStoryboard(storyboardUserPrompt)">
        生成分镜脚本
      </button>
    </div>

    <!-- Loading skeleton -->
    <div v-else-if="videoStore.loading" class="space-y-3">
      <div v-for="i in 4" :key="i" class="card p-4">
        <div class="skeleton h-4 w-1/4 mb-3" />
        <div class="skeleton h-3 w-full mb-2" />
        <div class="skeleton h-3 w-2/3 mb-3" />
        <div class="flex gap-2">
          <div class="skeleton h-5 w-12 rounded-full" />
          <div class="skeleton h-5 w-10 rounded-full" />
          <div class="skeleton h-5 w-10 rounded-full" />
        </div>
      </div>
    </div>

    <!-- Shot list -->
    <div v-else-if="shots.length > 0" class="space-y-3">

      <!-- Script mode (not confirmed): text-focused cards -->
      <template v-if="!isScriptConfirmed">
        <template v-for="shot in shots" :key="shot.id">
        <div class="card overflow-hidden">
          <!-- Editing mode -->
          <div v-if="editingId === shot.id" class="p-4 space-y-3">
            <div class="flex items-center justify-between mb-1">
              <span class="text-xs font-bold text-gray-400 uppercase tracking-wide">Shot {{ shot.shot_no }} — 编辑中</span>
              <div class="flex gap-2">
                <button class="btn-outline text-xs py-1 px-2.5" @click="cancelEdit">取消</button>
                <button class="btn-primary text-xs py-1 px-2.5" :disabled="savingEdit" @click="saveEdit(shot.id)">
                  {{ savingEdit ? '保存中...' : '保存' }}
                </button>
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">画面描述（英文，用于AI图片生成）</label>
              <textarea v-model="editForm.description" rows="2" class="input text-sm resize-none font-mono" placeholder="English visual prompt for image generation..." />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">旁白文案（中文，用于TTS和字幕）</label>
              <textarea v-model="editForm.narration" rows="2" class="input text-sm resize-none" placeholder="观众听到的旁白内容，不含镜头语言..." />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">角色台词（格式：角色名：台词内容）</label>
              <textarea v-model="editForm.dialogue" rows="2" class="input text-sm resize-none" placeholder="凌云：你敢再说一遍！（无对话可留空）" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">
                字幕覆盖
                <span class="ml-1 text-gray-400 font-normal">（留空则自动使用台词/旁白）</span>
              </label>
              <textarea v-model="editForm.subtitle" rows="2" class="input text-sm resize-none" placeholder="自定义字幕文本，可与旁白不同..." />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">情绪基调</label>
              <input v-model="editForm.emotional_tone" type="text" class="input text-sm" placeholder="如：紧张、浪漫史诗、压抑→释怀" />
            </div>
            <div class="grid grid-cols-4 gap-2">
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">景别</label>
                <select v-model="editForm.shot_size" class="input text-sm py-1">
                  <option v-for="o in SHOT_SIZE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">角度</label>
                <select v-model="editForm.camera_angle" class="input text-sm py-1">
                  <option v-for="o in CAMERA_ANGLE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">运动</label>
                <select v-model="editForm.camera_type" class="input text-sm py-1">
                  <option v-for="o in CAMERA_TYPE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">时长 (s)</label>
                <input v-model.number="editForm.duration" type="number" min="1" max="30" step="0.5" class="input text-sm py-1" />
              </div>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">过渡方式（接下一镜）</label>
              <select v-model="editForm.transition" class="input text-sm py-1">
                <option v-for="o in TRANSITION_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">
                音效音量
                <span class="ml-1 text-gray-400 font-normal">（0 = 自动，0.1–1.0 = 手动指定）</span>
                <span v-if="editForm.sfx_volume" class="ml-1 font-semibold text-blue-500">{{ Math.round((editForm.sfx_volume as number) * 100) }}%</span>
              </label>
              <input v-model.number="editForm.sfx_volume" type="range" min="0" max="1" step="0.05" class="w-full accent-blue-500" />
            </div>
          </div>

          <!-- View mode -->
          <div v-else class="p-4">
            <div class="flex items-start justify-between gap-3 mb-2">
              <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 tabular-nums flex-shrink-0">
                Shot {{ String(shot.shot_no).padStart(2, '0') }}
              </span>
              <div class="flex items-center gap-1 flex-shrink-0">
                <button
                  class="p-1.5 rounded-lg transition-colors"
                  :class="uploadingShotId === shot.id ? 'text-primary-400 bg-primary-50 dark:bg-primary-900/30' : shot.image_url ? 'text-green-500 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30' : 'text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30'"
                  :title="shot.image_url ? '重新上传图片' : '上传分镜图片'"
                  :disabled="uploadingShotId === shot.id"
                  @click="triggerShotImageUpload(shot.id)"
                >
                  <svg v-if="uploadingShotId === shot.id" class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </button>
                <button class="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="编辑" @click="startEdit(shot)">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button class="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" title="复制此镜头（插入在其后）" @click="handleCopyShot(shot)">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
                <button class="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" title="删除此镜头" @click="handleDeleteShot(shot)">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Inline voice text edit -->
            <div v-if="editingVoiceTextId === shot.id" class="mb-1.5">
              <p class="text-xs text-gray-400 mb-0.5">{{ editingVoiceTextType === 'narration' ? '旁白' : '台词' }}</p>
              <textarea
                v-model="voiceTextDraft"
                rows="3"
                class="input text-sm resize-none w-full"
                :placeholder="editingVoiceTextType === 'narration' ? '观众听到的旁白内容…' : '角色名：台词内容'"
                @keydown.enter.ctrl="saveVoiceText(shot)"
                @keydown.esc="cancelEditVoiceText"
              />
              <div class="flex items-center gap-1.5 mt-1">
                <button class="btn-primary text-xs py-0.5 px-2" :disabled="savingVoiceText" @click="saveVoiceText(shot)">
                  {{ savingVoiceText ? '保存中…' : '保存' }}
                </button>
                <button class="btn-outline text-xs py-0.5 px-2" @click="cancelEditVoiceText">取消</button>
                <span class="text-xs text-gray-400 ml-auto">Ctrl+Enter 保存</span>
              </div>
            </div>
            <template v-else>
              <p v-if="shot.narration" class="text-sm text-gray-800 dark:text-gray-200 leading-relaxed mb-1.5">
                {{ shot.narration }}
                <button class="inline-flex items-center ml-1 p-0.5 rounded text-gray-300 hover:text-gray-500 dark:hover:text-gray-300 transition-colors align-middle" title="编辑旁白" @click="startEditVoiceText(shot, 'narration')">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </p>
              <p v-if="shot.dialogue" class="text-sm text-primary-600 dark:text-primary-400 italic mb-1.5">
                「{{ shot.dialogue }}」
                <button class="inline-flex items-center ml-1 p-0.5 rounded text-primary-300 hover:text-primary-500 dark:hover:text-primary-300 transition-colors align-middle not-italic" title="编辑台词" @click="startEditVoiceText(shot, 'dialogue')">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </p>
              <p v-if="!shot.narration && !shot.dialogue" class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-1.5 font-mono text-xs">
                {{ shot.description || '（无场景描述）' }}
              </p>
            </template>
            <p v-if="shot.narration && shot.description" class="text-xs text-gray-400 dark:text-gray-500 mb-1.5 truncate" :title="shot.description">
              <span class="text-gray-300 dark:text-gray-600 mr-1">img:</span>{{ shot.description }}
            </p>

            <!-- Metadata tags -->
            <div class="flex flex-wrap gap-1.5">
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">{{ SHOT_SIZE_LABEL[shot.shot_size] || shot.shot_size }}</span>
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">{{ CAMERA_ANGLE_LABEL[shot.camera_angle] || shot.camera_angle }}</span>
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">{{ CAMERA_TYPE_LABEL[shot.camera_type] || shot.camera_type }}</span>
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">{{ shot.duration }}s</span>
              <span v-if="(shot as any).emotional_tone" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
                {{ (shot as any).emotional_tone }}
              </span>
              <span v-if="shot.transition && shot.transition !== 'cut'" class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                → {{ TRANSITION_LABEL[shot.transition] || shot.transition }}
              </span>
              <span
                v-for="tag in parseSfxTags(shot.sfx_tags)"
                :key="tag"
                class="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300"
                title="音效标签"
              >
                <svg class="w-2.5 h-2.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072M12 6v12m0 0l-3-3m3 3l3-3M6.343 17.657a8 8 0 010-11.314" />
                </svg>
                {{ tag }}
              </span>
            </div>
          </div>
        </div>

        <!-- Insert shot between cards -->
        <div class="relative flex items-center justify-center h-6 group">
          <div class="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-gray-100 dark:bg-gray-700 group-hover:bg-primary-200 dark:group-hover:bg-primary-800 transition-colors" />
          <button
            class="relative z-10 flex items-center gap-1 px-2 py-0.5 text-xs text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:text-primary-600 hover:border-primary-300"
            @click="insertingShotAfter = shot.shot_no; insertShotForm.narration = ''; insertShotForm.description = ''; insertShotForm.duration = 4"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            插入镜头
          </button>
        </div>

        <!-- Insert form -->
        <div v-if="insertingShotAfter === shot.shot_no" class="card p-3 border-2 border-primary-300 dark:border-primary-700 bg-primary-50 dark:bg-primary-900/20 space-y-2">
          <p class="text-xs font-medium text-primary-700 dark:text-primary-300">在镜头 #{{ shot.shot_no }} 之后插入新镜头</p>
          <textarea v-model="insertShotForm.narration" rows="2" class="input text-sm resize-none" placeholder="旁白/台词（中文）" />
          <textarea v-model="insertShotForm.description" rows="2" class="input text-sm resize-none font-mono" placeholder="画面描述（英文，用于 AI 生图）" />
          <div class="flex items-center gap-2">
            <label class="text-xs text-gray-500">时长</label>
            <input v-model.number="insertShotForm.duration" type="number" min="1" max="30" step="0.5" class="input text-sm py-1 w-20" />
            <span class="text-xs text-gray-400">秒</span>
            <div class="flex-1" />
            <button class="btn-outline text-xs py-1 px-2.5" @click="insertingShotAfter = null">取消</button>
            <button class="btn-primary text-xs py-1 px-2.5" :disabled="insertingShotLoading" @click="handleInsertShot(shot.shot_no)">
              {{ insertingShotLoading ? '插入中…' : '确认插入' }}
            </button>
          </div>
        </div>
        </template>
      </template>

      <!-- Production mode (confirmed): asset-generation cards -->
      <template v-else>
        <div v-for="shot in shots" :key="shot.id" class="card p-3">
          <div class="flex gap-3">
            <!-- Thumbnail -->
            <div class="group/thumb w-28 flex-shrink-0 rounded-lg overflow-hidden bg-gray-900 flex items-center justify-center relative" style="min-height: 72px;">
              <div v-if="uploadingShotId === shot.id" class="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
                <div class="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
              <template v-if="shot.image_url">
                <img :src="shot.image_url" class="w-full h-full object-cover cursor-zoom-in" @click.stop="openLightbox(shot.image_url, (s) => refineShotImage(shot, s), (u) => saveShotImage(shot, u))" />
                <button
                  v-if="uploadingShotId !== shot.id"
                  class="absolute bottom-1 right-1 p-1 rounded bg-black/40 text-white opacity-0 group-hover/thumb:opacity-100 hover:bg-black/70 transition-all z-10"
                  title="重新上传图片"
                  @click.stop="triggerShotImageUpload(shot.id)"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </button>
              </template>
              <div v-else-if="shot.status === 'generating'" class="p-2 flex items-center justify-center w-full h-full">
                <div class="w-6 h-6 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
              </div>
              <button
                v-else
                class="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-500 hover:text-primary-400 hover:bg-gray-800 transition-colors"
                title="上传分镜图片"
                @click.stop="triggerShotImageUpload(shot.id)"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span class="text-[10px] leading-none">上传图片</span>
              </button>
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0">
                  <p class="text-sm text-gray-800 dark:text-gray-200 line-clamp-2 leading-snug">
                    {{ shot.narration || shot.description || '（无描述）' }}
                  </p>
                  <p v-if="shot.dialogue" class="text-xs text-primary-500 dark:text-primary-400 italic mt-0.5 line-clamp-1">
                    「{{ shot.dialogue }}」
                  </p>
                  <div class="flex items-center gap-1.5 mt-1.5 text-xs text-gray-400 flex-wrap">
                    <span>{{ SHOT_SIZE_LABEL[shot.shot_size] || shot.shot_size }}</span>
                    <span>·</span>
                    <span>{{ CAMERA_TYPE_LABEL[shot.camera_type] || shot.camera_type }}</span>
                    <span>·</span>
                    <span>{{ shot.duration }}s</span>
                    <span v-if="(shot as any).emotional_tone" class="text-purple-500">· {{ (shot as any).emotional_tone }}</span>
                  </div>
                </div>
                <div class="flex-shrink-0 flex flex-col items-end gap-2">
                  <span class="px-2 py-0.5 text-xs font-medium rounded-full" :class="SHOT_STATUS_COLORS[shot.status]">
                    {{ SHOT_STATUS_LABELS[shot.status] }}
                  </span>
                  <span
                    v-if="shot.status === 'failed' && shot.error_message"
                    class="text-[10px] text-red-400 dark:text-red-500 max-w-[160px] text-right leading-snug"
                    :title="shot.error_message"
                  >
                    {{ shot.error_message.length > 60 ? shot.error_message.slice(0, 60) + '…' : shot.error_message }}
                  </span>
                  <button
                    v-if="shot.status !== 'generating'"
                    class="text-xs py-1 px-2.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600 transition-colors"
                    @click="handleGenerateShot(shot)"
                  >
                    {{ shot.status === 'completed' ? '重新生成' : '生成' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <!-- Anchor selector + score bar -->
          <div class="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center gap-3 flex-wrap">
            <span class="text-xs text-gray-400 flex-shrink-0">📍 场景锚点</span>
            <select
              :value="shot.scene_anchor_id || ''"
              class="input text-xs py-0.5 h-6 flex-1 min-w-0 max-w-[180px]"
              @change="handleSetShotAnchor(shot, ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null)"
            >
              <option value="">不绑定</option>
              <option v-for="anchor in anchors" :key="anchor.id" :value="anchor.id">{{ anchor.name }}</option>
            </select>
            <template v-if="shot.scene_anchor_id">
              <div class="flex-1 flex items-center gap-1.5 min-w-0">
                <div class="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all"
                    :class="{
                      'bg-green-400': (anchors.find(a => a.id === shot.scene_anchor_id)?.avg_cons_score ?? 0) >= 0.85,
                      'bg-amber-400': (anchors.find(a => a.id === shot.scene_anchor_id)?.avg_cons_score ?? 0) >= 0.70 && (anchors.find(a => a.id === shot.scene_anchor_id)?.avg_cons_score ?? 0) < 0.85,
                      'bg-red-400': (anchors.find(a => a.id === shot.scene_anchor_id)?.avg_cons_score ?? 0) > 0 && (anchors.find(a => a.id === shot.scene_anchor_id)?.avg_cons_score ?? 0) < 0.70,
                      'bg-gray-300': (anchors.find(a => a.id === shot.scene_anchor_id)?.avg_cons_score ?? 0) === 0,
                    }"
                    :style="{ width: `${Math.min(100, ((anchors.find(a => a.id === shot.scene_anchor_id)?.avg_cons_score ?? 0) * 100))}%` }"
                  />
                </div>
                <span class="text-xs flex-shrink-0"
                  :class="{
                    'text-green-500': (anchors.find(a => a.id === shot.scene_anchor_id)?.avg_cons_score ?? 0) >= 0.85,
                    'text-amber-500': (anchors.find(a => a.id === shot.scene_anchor_id)?.avg_cons_score ?? 0) >= 0.70 && (anchors.find(a => a.id === shot.scene_anchor_id)?.avg_cons_score ?? 0) < 0.85,
                    'text-red-500': (anchors.find(a => a.id === shot.scene_anchor_id)?.avg_cons_score ?? 0) > 0 && (anchors.find(a => a.id === shot.scene_anchor_id)?.avg_cons_score ?? 0) < 0.70,
                    'text-gray-400': (anchors.find(a => a.id === shot.scene_anchor_id)?.avg_cons_score ?? 0) === 0,
                  }"
                >
                  {{ (anchors.find(a => a.id === shot.scene_anchor_id)?.avg_cons_score ?? 0) > 0
                    ? (anchors.find(a => a.id === shot.scene_anchor_id)!.avg_cons_score).toFixed(2)
                    : '待评分'
                  }}
                </span>
              </div>
            </template>
          </div>
          <!-- Character binding row -->
          <div class="mt-1 flex items-center gap-2 flex-wrap">
            <span class="text-xs text-gray-400 flex-shrink-0">👤 角色</span>
            <template v-for="charId in (shot.character_ids || [])" :key="charId">
              <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                <img
                  v-if="characters.find(c => c.id === charId)?.portrait"
                  :src="characters.find(c => c.id === charId)!.portrait"
                  class="w-3 h-3 rounded-full object-cover"
                />
                {{ characters.find(c => c.id === charId)?.name || charId }}
                <button class="text-blue-400 hover:text-red-400 ml-0.5 leading-none" @click="removeCharFromShot(shot, charId)">×</button>
              </span>
            </template>
            <select class="input text-xs py-0.5 h-6 max-w-[140px]" @change="addCharToShot(shot, $event)">
              <option value="">+ 绑定角色</option>
              <option
                v-for="c in characters.filter(c => !(shot.character_ids || []).includes(c.id))"
                :key="c.id"
                :value="c.id"
              >{{ c.name }}</option>
            </select>
          </div>
        </div>
      </template>
    </div>

    <!-- AI Review Panel -->
    <Teleport to="body">
      <Transition name="slide-right">
        <div v-if="showReviewPanel" class="fixed inset-0 z-50 flex justify-end">
          <div class="absolute inset-0 bg-black/30" @click="showReviewPanel = false" />
          <div class="relative w-full max-w-xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col overflow-hidden">
            <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
              <div class="flex items-center gap-2">
                <svg class="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 class="font-semibold text-gray-900 dark:text-gray-100">AI 分镜脚本审查报告</h3>
              </div>
              <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" @click="showReviewPanel = false">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div class="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              <div v-if="reviewing" class="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
                <svg class="w-8 h-8 animate-spin text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span class="text-sm">AI 正在审查分镜脚本，请稍候…</span>
              </div>
              <div v-else-if="reviewError" class="rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
                {{ reviewError }}
              </div>
              <template v-else-if="reviewResult">
                <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                  <div class="flex items-end gap-3 mb-4">
                    <div class="text-4xl font-bold" :class="scoreColor(reviewResult.overall_score)">
                      {{ reviewResult.overall_score.toFixed(1) }}
                    </div>
                    <div class="text-sm text-gray-500 pb-1">/ 10</div>
                    <div class="flex-1" />
                    <button class="text-xs text-primary-500 hover:text-primary-600" @click="handleReviewStoryboard">重新审查</button>
                  </div>
                  <div class="grid grid-cols-2 gap-2 text-xs">
                    <div v-for="item in [
                      { label: '叙事连贯性', score: reviewResult.narrative_score },
                      { label: '视觉多样性', score: reviewResult.visual_score },
                      { label: '节奏控制',   score: reviewResult.pacing_score },
                      { label: '旁白质量',   score: reviewResult.narration_score },
                    ]" :key="item.label" class="flex items-center gap-2">
                      <span class="text-gray-500 w-16 shrink-0">{{ item.label }}</span>
                      <div class="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-1.5 overflow-hidden">
                        <div class="h-full rounded-full transition-all"
                          :class="item.score >= 8 ? 'bg-green-500' : item.score >= 6 ? 'bg-yellow-500' : 'bg-red-500'"
                          :style="`width:${item.score * 10}%`" />
                      </div>
                      <span class="font-medium" :class="scoreColor(item.score)">{{ item.score.toFixed(1) }}</span>
                    </div>
                  </div>
                </div>
                <div class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{{ reviewResult.summary }}</div>
                <div v-if="reviewResult.strengths?.length">
                  <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">亮点</h4>
                  <ul class="space-y-1">
                    <li v-for="s in reviewResult.strengths" :key="s" class="flex items-start gap-2 text-sm text-green-700 dark:text-green-400">
                      <svg class="w-4 h-4 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
                      </svg>
                      {{ s }}
                    </li>
                  </ul>
                </div>
                <div v-if="reviewResult.weaknesses?.length">
                  <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">主要问题</h4>
                  <ul class="space-y-1">
                    <li v-for="w in reviewResult.weaknesses" :key="w" class="flex items-start gap-2 text-sm text-red-700 dark:text-red-400">
                      <svg class="w-4 h-4 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
                      </svg>
                      {{ w }}
                    </li>
                  </ul>
                </div>
                <div v-if="reviewResult.global_suggestions?.length">
                  <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">整体改进建议</h4>
                  <ol class="space-y-1.5">
                    <li v-for="(sg, i) in reviewResult.global_suggestions" :key="i" class="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <span class="shrink-0 w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 text-xs flex items-center justify-center font-medium">{{ i + 1 }}</span>
                      {{ sg }}
                    </li>
                  </ol>
                </div>
                <div v-if="reviewResult.shot_feedback?.length">
                  <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    逐镜反馈 <span class="normal-case font-normal text-gray-400">（共 {{ reviewResult.shot_feedback.length }} 条）</span>
                  </h4>
                  <div class="space-y-2">
                    <div
                      v-for="fb in reviewResult.shot_feedback"
                      :key="fb.shot_no"
                      class="rounded-lg border-l-4 p-3 text-sm"
                      :class="severityClass(fb.severity)"
                    >
                      <div class="font-medium text-gray-800 dark:text-gray-200 mb-1">镜 {{ fb.shot_no }}</div>
                      <ul class="mb-1.5 space-y-0.5">
                        <li v-for="issue in fb.issues" :key="issue" class="text-gray-600 dark:text-gray-400">· {{ issue }}</li>
                      </ul>
                      <div v-if="fb.suggestion" class="text-gray-500 dark:text-gray-500 text-xs italic">💡 {{ fb.suggestion }}</div>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.slide-right-enter-active,
.slide-right-leave-active {
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.slide-right-enter-from .relative,
.slide-right-leave-to .relative {
  transform: translateX(100%);
}
.slide-right-enter-from,
.slide-right-leave-to {
  opacity: 0;
}
</style>
