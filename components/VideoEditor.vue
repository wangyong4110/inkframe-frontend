<script setup lang="ts">
import type { StoryboardShot, VideoQualityTier } from '~/types'

const { openLightbox } = useImageLightbox()
const props = defineProps<{ videoId: number; llmProvider?: string }>()
const videoStore = useVideoStore()
const toast = useToast()

// ──────── Tabs ────────
const activeTab = ref('script')

// ──────── Data ────────
const video = computed(() => videoStore.currentVideo)
const shots = computed(() => videoStore.storyboard)
const isScriptConfirmed = computed(() => video.value?.script_status === 'confirmed')
const productionEnabled = computed(() => isScriptConfirmed.value && shots.value.length > 0)

// Script phase
const generatingStoryboard = computed(() => videoStore.generating)
const editingId = ref<number | null>(null)
const editForm = ref<Partial<StoryboardShot & { emotional_tone: string }>>({})
const savingEdit = ref(false)
const confirmingScript = ref(false)

// Production phase
const videoProviders = ref<{ name: string; display_name: string }[]>([])
const selectedVideoProvider = ref('')
const batchGenerating = ref(false)

// Voice/subtitle — all config read from novel project config (项目配置 > 视频配置)
const novelStore = useNovelStore()
const narrationVoice = computed(() => novelStore.currentNovel?.narration_voice ?? '')
// 字幕开关：初始值跟随项目配置；用户可在本会话中临时覆盖
const subtitleEnabled = ref(true)
watchEffect(() => { subtitleEnabled.value = novelStore.currentNovel?.subtitle_enabled ?? true })
const subtitleConfig = computed(() => ({
  position: novelStore.currentNovel?.subtitle_position ?? 'bottom',
  font_size: novelStore.currentNovel?.subtitle_font_size ?? 48,
  color: novelStore.currentNovel?.subtitle_color ?? '#FFFFFF',
  bg_style: novelStore.currentNovel?.subtitle_bg_style ?? 'shadow',
}))
const generatingVoice = ref<Record<number, boolean>>({})
const shotAudioUrls = ref<Record<number, string>>({})
const shotSubtitles = ref<Record<number, string>>({})

// 字幕编辑
const editingSubtitleId = ref<number | null>(null)
const subtitleDraft = ref('')
const savingSubtitle = ref(false)

function effectiveSubtitle(shot: StoryboardShot): string {
  return shot.subtitle || shot.dialogue || shot.narration || shot.description || ''
}

function startEditSubtitle(shot: StoryboardShot) {
  editingSubtitleId.value = shot.id
  subtitleDraft.value = effectiveSubtitle(shot)
}

function cancelEditSubtitle() {
  editingSubtitleId.value = null
  subtitleDraft.value = ''
}

async function saveSubtitle(shot: StoryboardShot) {
  savingSubtitle.value = true
  try {
    // 若用户输入与自动推导值相同，清除覆盖（让后端回落到 dialogue/narration）
    const effective = shot.dialogue || shot.narration || shot.description || ''
    const value = subtitleDraft.value.trim() === effective ? '' : subtitleDraft.value.trim()
    await videoStore.updateShot(props.videoId, shot.id, { subtitle: value } as any)
    editingSubtitleId.value = null
  } catch (e: any) {
    toast.error('保存字幕失败：' + (e.message || ''))
  } finally {
    savingSubtitle.value = false
  }
}

// 旁白/台词内联编辑
const editingVoiceTextId = ref<number | null>(null)
const editingVoiceTextType = ref<'narration' | 'dialogue'>('narration')
const voiceTextDraft = ref('')
const savingVoiceText = ref(false)

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

// BGM
const selectedBgm = ref('')
const bgmVolume = ref(60)
const generatingBgm = ref(false)

// SFX
const generatingSFX = ref(false)
const sfxTaskId = ref<string | null>(null)

// Export
const stitching = ref(false)
const exporting = ref<Record<string, boolean>>({})
const exportUrl = ref('')

const exportFormats = [
  { key: 'capcut', label: '剪映草稿',    desc: '.zip · 剪映 / CapCut',         ext: '.zip'  },
  { key: 'fcpxml', label: 'FCPXML',      desc: '.zip · DaVinci / Final Cut Pro', ext: '.zip'  },
  { key: 'zip',    label: '素材包',      desc: '.zip · 任意剪辑软件',           ext: '.zip'  },
  { key: 'edl',    label: 'EDL',         desc: '.edl · Avid / Premiere / Vegas', ext: '.edl'  },
  { key: 'otio',   label: 'OpenTimelineIO', desc: '.otio · Premiere / FCP / DaVinci', ext: '.otio' },
  { key: 'srt',    label: 'SRT 字幕',    desc: '.srt · 通用字幕',               ext: '.srt'  },
  { key: 'vtt',    label: 'WebVTT',      desc: '.vtt · 浏览器 / 网络视频',      ext: '.vtt'  },
  { key: 'csv',    label: '分镜表',      desc: '.csv · Excel / Notion',          ext: '.csv'  },
] as const

// Scene anchors
const sceneAnchorStore = useSceneAnchorStore()
const anchors = computed(() => sceneAnchorStore.anchors)

// Characters
const characterStore = useCharacterStore()
const characters = computed(() => characterStore.characters)

async function handleSetShotAnchor(shot: StoryboardShot, anchorId: number | null) {
  try {
    const api = useSceneAnchorApi()
    await api.setShotAnchor(props.videoId, shot.id, anchorId)
    await videoStore.fetchStoryboard(props.videoId)
  } catch (e: any) {
    toast.error('绑定失败：' + (e.message || ''))
  }
}

// ──────── Shot character binding ────────
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

// ──────── Labels ────────
const QUALITY_LABELS: Record<VideoQualityTier, string> = { draft: '草稿', preview: '预览', final: '正式' }
const QUALITY_COLORS: Record<VideoQualityTier, string> = {
  draft: 'bg-gray-100 text-gray-700',
  preview: 'bg-blue-100 text-blue-700',
  final: 'bg-amber-100 text-amber-700',
}
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
const TRANSITION_OPTIONS = [
  { value: 'cut',      label: '硬切' },
  { value: 'fade',     label: '淡入淡出' },
  { value: 'dissolve', label: '溶解' },
  { value: 'wipe',     label: '划像' },
]
const SHOT_SIZE_LABEL: Record<string, string> = Object.fromEntries(SHOT_SIZE_OPTIONS.map(o => [o.value, o.label]))
const CAMERA_ANGLE_LABEL: Record<string, string> = Object.fromEntries(CAMERA_ANGLE_OPTIONS.map(o => [o.value, o.label]))
const CAMERA_TYPE_LABEL: Record<string, string> = Object.fromEntries(CAMERA_TYPE_OPTIONS.map(o => [o.value, o.label]))
const TRANSITION_LABEL: Record<string, string> = Object.fromEntries(TRANSITION_OPTIONS.map(o => [o.value, o.label]))
const SHOT_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-500',
  generating: 'bg-yellow-100 text-yellow-700',
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
}
const SHOT_STATUS_LABELS: Record<string, string> = {
  pending: '待生成', generating: '生成中', completed: '已完成', failed: '失败',
}
const BGM_OPTIONS = [
  { id: 'epic', name: '史诗', desc: '大气磅礴，适合战斗/高潮' },
  { id: 'romantic', name: '浪漫', desc: '柔情旋律，适合感情戏' },
  { id: 'mysterious', name: '神秘', desc: '悬疑配乐，适合推理/惊悚' },
  { id: 'peaceful', name: '舒缓', desc: '平静空灵，适合日常/旁白' },
  { id: 'tense', name: '紧张', desc: '节奏急促，适合追逐/危机' },
  { id: 'sad', name: '伤感', desc: '忧郁旋律，适合离别/失去' },
]

const completedShots = computed(() => shots.value.filter(s => s.status === 'completed'))

const TABS = computed(() => [
  { key: 'script', label: '分镜脚本', icon: 'M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4', locked: false },
  { key: 'voice', label: '配音字幕', icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z', locked: !productionEnabled.value },
  { key: 'bgm', label: '背景音乐', icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3', locked: !productionEnabled.value },
  { key: 'sfx', label: '音效', icon: 'M15.536 8.464a5 5 0 010 7.072M12 6a7 7 0 010 12M8.464 8.464a5 5 0 000 7.072M3 12a9 9 0 1018 0 9 9 0 00-18 0z', locked: !productionEnabled.value },
  { key: 'export', label: '导出', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4', locked: !productionEnabled.value },
])

// ──────── Lifecycle ────────
async function load() {
  const { getVideoProviders } = useVideoApi()
  const [videoRes] = await Promise.allSettled([getVideoProviders()])
  if (videoRes.status === 'fulfilled') videoProviders.value = (videoRes.value as any)?.data ?? []
  try {
    await videoStore.fetchVideo(props.videoId)
    await videoStore.fetchStoryboard(props.videoId)
    videoStore.resumeStoryboardTask(props.videoId)
    const novelId = videoStore.currentVideo?.novel_id
    if (novelId) sceneAnchorStore.fetchAnchors(novelId)
    if (novelId) characterStore.fetchCharacters(novelId)
  } catch (e: any) {
    toast.error('加载失败：' + (e.message || ''))
  }
}

onMounted(load)

watch(() => props.videoId, () => {
  activeTab.value = 'script'
  editingId.value = null
  load()
})

watch(() => videoStore.storyboardTaskStatus, (status) => {
  if (status === 'completed') {
    toast.success('分镜脚本生成完成，请检查并确认')
    videoStore.fetchStoryboard(props.videoId)
  } else if (status === 'failed') {
    toast.error('分镜生成失败：' + (videoStore.error || ''))
  }
})

// 分镜加载/刷新后，将已生成的配音 URL 同步到本地状态
watch(shots, (list) => {
  for (const shot of list) {
    if (shot.audio_url && !shotAudioUrls.value[shot.id]) {
      shotAudioUrls.value[shot.id] = shot.audio_url
    }
  }
}, { immediate: true })

// ──────── Script phase ────────
const pacing = ref<'slow' | 'normal' | 'fast'>('normal')
const targetDuration = ref<number>(0) // 0 = 自动

// 高级 AI 参数（0 = 使用系统默认，不覆盖）
const showAdvancedParams = ref(false)
const advMaxTokens = ref(0)
const advTemperature = ref(0)
const advTimeoutSeconds = ref(0)

// 从 video 初始化节奏/时长（刷新后还原上次所选）
watch(video, (v) => {
  if (v) {
    pacing.value = v.pacing ?? 'normal'
    targetDuration.value = v.target_duration ?? 0
  }
}, { immediate: true })

// 从项目配置（novel）读取 AI 高级参数默认值
watch(() => novelStore.currentNovel, (n) => {
  if (n) {
    if (advMaxTokens.value === 0 && n.max_tokens) advMaxTokens.value = n.max_tokens
    if (advTemperature.value === 0 && n.temperature) advTemperature.value = n.temperature
    if (advTimeoutSeconds.value === 0 && n.timeout_seconds) advTimeoutSeconds.value = n.timeout_seconds
  }
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

// ── 分镜审查 ─────────────────────────────────────────────────────────────
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

async function handleGenerateStoryboard(userPrompt?: string, overridePacing?: string, overrideTargetDuration?: number, overrideMaxTokens?: number, overrideTemperature?: number, overrideTimeoutSeconds?: number) {
  if (isScriptConfirmed.value) {
    if (!confirm('重新生成将清空当前脚本，是否继续？')) return
  }
  const novel = novelStore.currentNovel
  const effectivePacing = overridePacing ?? pacing.value
  const effectiveDuration = overrideTargetDuration ?? targetDuration.value
  // adv 参数未设置时，fallback 到 novel 项目配置，确保请求体中始终携带实际生效的值
  const effectiveMaxTokens = overrideMaxTokens ?? advMaxTokens.value || novel?.max_tokens || undefined
  const effectiveTemperature = overrideTemperature ?? advTemperature.value || novel?.temperature || undefined
  const effectiveTimeout = overrideTimeoutSeconds ?? advTimeoutSeconds.value || novel?.timeout_seconds || undefined
  try {
    await videoStore.generateStoryboard(
      props.videoId,
      props.llmProvider || undefined,
      userPrompt,
      effectivePacing !== 'normal' ? effectivePacing : undefined,
      effectiveDuration || undefined,
      effectiveMaxTokens || undefined,
      effectiveTemperature || undefined,
      effectiveTimeout || undefined,
    )
    toast.success('脚本生成任务已提交，请稍候...')
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || ''))
  }
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

// ──────── Production phase ────────
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

// ──────── Voice ────────
async function handleGenerateVoice(shot: StoryboardShot) {
  generatingVoice.value[shot.id] = true
  try {
    const api = useVideoApi()
    const res = await api.generateVoice(
      props.videoId, shot.id,
      narrationVoice.value || undefined,
      subtitleEnabled.value,
      subtitleEnabled.value ? subtitleConfig.value : undefined,
    )
    const taskId = res.data?.task_id
    if (!taskId) { toast.error('配音生成失败：未获取到任务ID'); generatingVoice.value[shot.id] = false; return }
    toast.info(`镜头 #${shot.shot_no} 配音生成中…`)
    const taskStore = useTaskStore()
    taskStore.trackTask(taskId, (task) => {
      generatingVoice.value[shot.id] = false
      if (task.status === 'completed') {
        const base = ((task.data as any)?.audio_url as string | undefined)
          || `/api/v1/videos/${props.videoId}/storyboard/${shot.id}/audio`
        // 追加时间戳强制浏览器跳过缓存重新加载音频
        const sep = base.includes('?') ? '&' : '?'
        shotAudioUrls.value[shot.id] = `${base}${sep}t=${Date.now()}`
        const srt = (task.data as any)?.subtitle_srt as string | undefined
        if (srt) shotSubtitles.value[shot.id] = srt
        toast.success(`镜头 #${shot.shot_no} 配音已生成`)
      } else {
        toast.error(`镜头 #${shot.shot_no} 配音生成失败`)
      }
    })
  } catch (e: any) {
    toast.error('配音生成失败：' + (e.message || ''))
    generatingVoice.value[shot.id] = false
  }
}

async function handleGenerateAllVoice() {
  if (shots.value.length === 0) { toast.error('没有分镜，无法生成配音'); return }
  for (const shot of shots.value) {
    await handleGenerateVoice(shot)
  }
}

// ──────── BGM ────────
async function handleGenerateBgm() {
  if (!selectedBgm.value) { toast.error('请先选择 BGM 风格'); return }
  generatingBgm.value = true
  try {
    await new Promise(resolve => setTimeout(resolve, 1800))
    toast.success('背景音乐已生成')
  } catch (e: any) {
    toast.error('BGM 生成失败：' + (e.message || ''))
  } finally {
    generatingBgm.value = false
  }
}

// ──────── SFX ────────
async function handleGenerateSFX() {
  if (shots.value.length === 0) { toast.error('没有分镜，请先生成分镜脚本'); return }
  generatingSFX.value = true
  try {
    const api = useVideoApi()
    const res = await api.batchGenerateSFX(props.videoId)
    const taskId = (res as any)?.data?.task_id
    if (taskId) {
      sfxTaskId.value = taskId
      useTaskStore().trackTask(taskId)
      toast.success('音效生成任务已提交，请在右下角任务面板查看进度')
    }
  } catch (e: any) {
    toast.error('音效生成失败：' + (e.message || ''))
  } finally {
    generatingSFX.value = false
  }
}

// ──────── Export ────────
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

defineExpose({ generateStoryboard: handleGenerateStoryboard })
</script>

<template>
  <div class="space-y-4">

    <!-- Tabs -->
    <div class="border-b border-gray-200 dark:border-gray-700">
      <nav class="flex space-x-1">
        <button
          v-for="tab in TABS"
          :key="tab.key"
          class="flex items-center gap-2 py-3 px-4 border-b-2 font-medium text-sm transition-colors"
          :class="[
            activeTab === tab.key
              ? 'border-primary-500 text-primary-600'
              : tab.locked
                ? 'border-transparent text-gray-300 dark:text-gray-600 cursor-not-allowed'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300',
          ]"
          :disabled="tab.locked"
          @click="!tab.locked && (activeTab = tab.key)"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="tab.icon" />
          </svg>
          {{ tab.label }}
          <svg v-if="tab.locked" class="w-3 h-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </button>
      </nav>
    </div>

    <!-- ==============================
         分镜脚本 Tab
         ============================== -->
    <div v-if="activeTab === 'script'">


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
          <button class="btn-primary text-sm" :disabled="batchGenerating" @click="handleGenerateAll">
            <svg v-if="batchGenerating" class="w-4 h-4 mr-1.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            生成全部素材
          </button>
        </template>

        <!-- Script toolbar (not confirmed, shots exist) -->
        <template v-else-if="shots.length > 0">
          <!-- AI 审查按钮 -->
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
          <!-- 确认脚本按钮 -->
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
          <!-- 节奏 -->
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
          <!-- 时长 -->
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
          <!-- 预计镜头数提示 -->
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
            <!-- Max Tokens -->
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
            <!-- Temperature -->
            <div>
              <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                Temperature <span class="text-gray-400">（0 = 系统默认 0.1；范围 0.1-2.0）</span>
              </label>
              <div class="flex items-center gap-2">
                <input
                  v-model.number="advTemperature"
                  type="range" min="0" max="2.0" step="0.1"
                  class="flex-1 accent-primary-500"
                />
                <input
                  v-model.number="advTemperature"
                  type="number" min="0" max="2.0" step="0.1"
                  placeholder="0"
                  class="w-14 px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400"
                />
              </div>
            </div>
            <!-- Timeout -->
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
        <button class="btn-primary" :disabled="generatingStoryboard" @click="handleGenerateStoryboard">
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

        <!-- ── Script mode (not confirmed): text-focused cards ── -->
        <template v-if="!isScriptConfirmed">
          <div v-for="shot in shots" :key="shot.id" class="card overflow-hidden">

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
            </div>

            <!-- View mode -->
            <div v-else class="p-4">
              <div class="flex items-start justify-between gap-3 mb-2">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 tabular-nums flex-shrink-0">
                  Shot {{ String(shot.shot_no).padStart(2, '0') }}
                </span>
                <div class="flex items-center gap-1 flex-shrink-0">
                  <button
                    class="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="编辑"
                    @click="startEdit(shot)"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </div>
              </div>

              <!-- 旁白/台词内联编辑区（复用配音 tab 的编辑状态） -->
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
                <!-- 旁白文案 -->
                <p v-if="shot.narration" class="text-sm text-gray-800 dark:text-gray-200 leading-relaxed mb-1.5">
                  {{ shot.narration }}
                  <button
                    class="inline-flex items-center ml-1 p-0.5 rounded text-gray-300 hover:text-gray-500 dark:hover:text-gray-300 transition-colors align-middle"
                    title="编辑旁白"
                    @click="startEditVoiceText(shot, 'narration')"
                  >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </p>
                <!-- 角色台词 -->
                <p v-if="shot.dialogue" class="text-sm text-primary-600 dark:text-primary-400 italic mb-1.5">
                  「{{ shot.dialogue }}」
                  <button
                    class="inline-flex items-center ml-1 p-0.5 rounded text-primary-300 hover:text-primary-500 dark:hover:text-primary-300 transition-colors align-middle not-italic"
                    title="编辑台词"
                    @click="startEditVoiceText(shot, 'dialogue')"
                  >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                </p>
                <!-- 英文画面描述（折叠显示，仅在无旁白时展示兜底） -->
                <p v-if="!shot.narration && !shot.dialogue" class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-1.5 font-mono text-xs">
                  {{ shot.description || '（无场景描述）' }}
                </p>
              </template>
              <!-- 有旁白时，画面描述收折为小标签 -->
              <p v-if="shot.narration && shot.description" class="text-xs text-gray-400 dark:text-gray-500 mb-1.5 truncate" :title="shot.description">
                <span class="text-gray-300 dark:text-gray-600 mr-1">img:</span>{{ shot.description }}
              </p>

              <!-- Metadata tags -->
              <div class="flex flex-wrap gap-1.5">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                  {{ SHOT_SIZE_LABEL[shot.shot_size] || shot.shot_size }}
                </span>
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                  {{ CAMERA_ANGLE_LABEL[shot.camera_angle] || shot.camera_angle }}
                </span>
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                  {{ CAMERA_TYPE_LABEL[shot.camera_type] || shot.camera_type }}
                </span>
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                  {{ shot.duration }}s
                </span>
                <span
                  v-if="(shot as any).emotional_tone"
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300"
                >
                  {{ (shot as any).emotional_tone }}
                </span>
                <span
                  v-if="shot.transition && shot.transition !== 'cut'"
                  class="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                >
                  → {{ TRANSITION_LABEL[shot.transition] || shot.transition }}
                </span>
              </div>
            </div>
          </div>
        </template>

        <!-- ── Production mode (confirmed): asset-generation cards ── -->
        <template v-else>
          <div v-for="shot in shots" :key="shot.id" class="card p-3">
            <div class="flex gap-3">
              <!-- Thumbnail -->
              <div class="w-28 flex-shrink-0 rounded-lg overflow-hidden bg-gray-900 flex items-center justify-center" style="min-height: 72px;">
                <img v-if="shot.image_url" :src="shot.image_url" class="w-full h-full object-cover cursor-zoom-in" @click.stop="openLightbox(shot.image_url)" />
                <div v-else-if="shot.status === 'generating'" class="p-2 flex items-center justify-center w-full h-full">
                  <div class="w-6 h-6 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                </div>
                <span v-else class="text-xs text-gray-600 font-bold">#{{ shot.shot_no }}</span>
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

                  <!-- Status + action -->
                  <div class="flex-shrink-0 flex flex-col items-end gap-2">
                    <span class="px-2 py-0.5 text-xs font-medium rounded-full" :class="SHOT_STATUS_COLORS[shot.status]">
                      {{ SHOT_STATUS_LABELS[shot.status] }}
                    </span>
                    <!-- 失败原因提示 -->
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
              <!-- Score bar -->
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

      </div><!-- end shot list -->
    </div><!-- end script tab -->

    <!-- ==============================
         配音字幕 Tab
         ============================== -->
    <div v-if="activeTab === 'voice'" class="space-y-4">
      <div class="card p-4">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="font-semibold text-gray-900 dark:text-white">配音设置</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">为每个镜头的对白和旁白生成语音</p>
          </div>
          <button class="btn-primary" @click="handleGenerateAllVoice">一键生成全部配音</button>
        </div>
        <div class="flex items-center justify-between">
          <label class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
            <input v-model="subtitleEnabled" type="checkbox" class="rounded accent-primary-500" />
            同步生成字幕
          </label>
          <span v-if="subtitleEnabled" class="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
            <span
              class="inline-block w-3 h-3 rounded-full border border-gray-300"
              :style="{ background: subtitleConfig.color }"
            />
            {{ { bottom: '底部', center: '居中', top: '顶部' }[subtitleConfig.position] }}
            · {{ subtitleConfig.font_size }}px
            · {{ { none: '无背景', shadow: '阴影', box: '底框' }[subtitleConfig.bg_style] }}
            <NuxtLink to="/novel" class="text-primary-500 hover:underline" title="在项目配置中修改字幕样式">编辑</NuxtLink>
          </span>
        </div>
      </div>

      <div class="space-y-2">
        <div v-for="shot in shots" :key="shot.id" class="card p-4 flex items-start gap-3">
          <div class="w-20 h-12 bg-gray-900 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center">
            <img v-if="shot.image_url" :src="shot.image_url" class="w-full h-full object-cover cursor-zoom-in" @click.stop="openLightbox(shot.image_url)" />
            <span v-else class="text-xs text-gray-500">#{{ shot.shot_no }}</span>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-0.5">镜头 {{ shot.shot_no }}</p>

            <!-- 旁白/台词内联编辑区 -->
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
                <button
                  class="btn-primary text-xs py-0.5 px-2"
                  :disabled="savingVoiceText"
                  @click="saveVoiceText(shot)"
                >{{ savingVoiceText ? '保存中…' : '保存' }}</button>
                <button class="btn-outline text-xs py-0.5 px-2" @click="cancelEditVoiceText">取消</button>
                <span class="text-xs text-gray-400 ml-auto">Ctrl+Enter 保存</span>
              </div>
            </div>
            <div v-else class="mb-1.5 space-y-0.5">
              <!-- 旁白文本 + 内联编辑图标 -->
              <p v-if="shot.narration" class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                {{ shot.narration }}
                <button
                  class="inline-flex items-center ml-1 p-0.5 rounded text-gray-300 hover:text-gray-500 dark:hover:text-gray-300 transition-colors align-middle"
                  title="编辑旁白"
                  @click="startEditVoiceText(shot, 'narration')"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </p>
              <!-- 台词文本 + 内联编辑图标 -->
              <p v-if="shot.dialogue" class="text-sm text-primary-600 dark:text-primary-400 italic leading-relaxed">
                「{{ shot.dialogue }}」
                <button
                  class="inline-flex items-center ml-1 p-0.5 rounded text-primary-300 hover:text-primary-500 dark:hover:text-primary-300 transition-colors align-middle not-italic"
                  title="编辑台词"
                  @click="startEditVoiceText(shot, 'dialogue')"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              </p>
              <p v-if="!shot.narration && !shot.dialogue" class="text-sm text-gray-400 dark:text-gray-500">（无台词）</p>
            </div>

            <audio
              v-if="shotAudioUrls[shot.id]"
              :src="shotAudioUrls[shot.id]"
              controls
              class="mt-1.5 w-full h-8"
            />
          </div>
          <button
            class="btn-outline text-sm flex-shrink-0"
            :disabled="generatingVoice[shot.id]"
            @click="handleGenerateVoice(shot)"
          >
            {{ generatingVoice[shot.id] ? '生成中...' : (shotAudioUrls[shot.id] ? '重新生成' : '生成配音') }}
          </button>
        </div>
      </div>
    </div>

    <!-- ==============================
         背景音乐 Tab
         ============================== -->
    <div v-if="activeTab === 'bgm'" class="space-y-4">
      <div class="card p-6">
        <h3 class="font-semibold text-gray-900 dark:text-white mb-1">背景音乐</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 mb-5">选择情绪风格，AI 将根据情节节奏智能匹配音乐</p>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-5">
          <button
            v-for="bgm in BGM_OPTIONS"
            :key="bgm.id"
            type="button"
            class="flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all"
            :class="selectedBgm === bgm.id
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30'
              : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'"
            @click="selectedBgm = bgm.id"
          >
            <div>
              <p class="font-medium text-sm text-gray-900 dark:text-white">{{ bgm.name }}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{{ bgm.desc }}</p>
            </div>
          </button>
        </div>
        <div class="mb-5">
          <div class="flex items-center justify-between mb-2">
            <label class="text-sm font-medium text-gray-700 dark:text-gray-300">音量</label>
            <span class="text-sm text-gray-500">{{ bgmVolume }}%</span>
          </div>
          <input v-model.number="bgmVolume" type="range" min="0" max="100" step="5" class="w-full accent-primary-500" />
        </div>
        <button class="btn-primary" :disabled="generatingBgm || !selectedBgm" @click="handleGenerateBgm">
          <svg v-if="generatingBgm" class="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {{ generatingBgm ? '生成中...' : '生成背景音乐' }}
        </button>
      </div>
    </div>

    <!-- ==============================
         音效 Tab
         ============================== -->
    <div v-if="activeTab === 'sfx'" class="space-y-4">
      <div class="card p-4">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h3 class="font-semibold text-gray-900 dark:text-white">自动音效</h3>
            <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">AI 根据镜头内容自动匹配或生成场景音效，导出剪映时自动附加独立音效轨道</p>
          </div>
          <button
            class="btn-primary"
            :disabled="generatingSFX || shots.length === 0"
            @click="handleGenerateSFX"
          >
            <svg v-if="generatingSFX" class="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {{ generatingSFX ? '提交中...' : '一键生成音效' }}
          </button>
        </div>
        <!-- 生成流程说明 -->
        <div class="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-xs text-blue-700 dark:text-blue-300 space-y-1">
          <p class="font-medium">三层降级策略（按优先级自动选择）</p>
          <p>① 本地音效库 — 从服务器预设音效库精确匹配（0延迟）</p>
          <p>② Freesound CC0 — 从开放音效平台搜索授权素材</p>
          <p>③ ElevenLabs AI — 按镜头描述实时生成定制音效（最高质量）</p>
        </div>
      </div>

      <!-- 分镜音效列表 -->
      <div class="space-y-2">
        <div
          v-for="shot in shots"
          :key="shot.id"
          class="card p-3 flex items-center gap-3"
        >
          <div class="w-16 h-10 bg-gray-900 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center">
            <img v-if="shot.image_url" :src="shot.image_url" class="w-full h-full object-cover" />
            <span v-else class="text-xs text-gray-500">#{{ shot.shot_no }}</span>
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-0.5">
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">镜头 {{ shot.shot_no }}</span>
              <span
                v-if="shot.sfx_url"
                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                </svg>
                已生成
              </span>
              <span v-else class="text-xs text-gray-400">待生成</span>
            </div>
            <p class="text-xs text-gray-400 truncate">
              {{ shot.sfx_tags ? JSON.parse(shot.sfx_tags).join('、') : (shot.description || '—') }}
            </p>
          </div>
          <!-- 音量标签 -->
          <span v-if="shot.sfx_volume && shot.sfx_volume > 0" class="text-xs text-gray-400 flex-shrink-0">
            {{ Math.round(shot.sfx_volume * 100) }}%
          </span>
        </div>
        <p v-if="shots.length === 0" class="text-sm text-gray-400 text-center py-8">
          请先在「分镜脚本」Tab 生成分镜
        </p>
      </div>
    </div>

    <!-- ==============================
         导出 Tab
         ============================== -->
    <div v-if="activeTab === 'export'" class="space-y-4">
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
          <a v-if="exportUrl" :href="exportUrl" target="_blank" class="btn-outline">下载文件</a>
        </div>
      </div>
    </div>

  </div>

  <!-- ── 分镜 AI 审查面板 ────────────────────────────────────────────────── -->
  <Teleport to="body">
    <Transition name="slide-right">
      <div v-if="showReviewPanel" class="fixed inset-0 z-50 flex justify-end">
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/30" @click="showReviewPanel = false" />
        <!-- Panel -->
        <div class="relative w-full max-w-xl bg-white dark:bg-gray-900 shadow-2xl flex flex-col overflow-hidden">
          <!-- Header -->
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

          <!-- Content -->
          <div class="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            <!-- Loading -->
            <div v-if="reviewing" class="flex flex-col items-center justify-center py-16 gap-3 text-gray-500">
              <svg class="w-8 h-8 animate-spin text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span class="text-sm">AI 正在审查分镜脚本，请稍候…</span>
            </div>

            <!-- Error -->
            <div v-else-if="reviewError" class="rounded-lg border border-red-300 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
              {{ reviewError }}
            </div>

            <!-- Result -->
            <template v-else-if="reviewResult">
              <!-- Score Overview -->
              <div class="rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <div class="flex items-end gap-3 mb-4">
                  <div class="text-4xl font-bold" :class="scoreColor(reviewResult.overall_score)">
                    {{ reviewResult.overall_score.toFixed(1) }}
                  </div>
                  <div class="text-sm text-gray-500 pb-1">/ 10</div>
                  <div class="flex-1" />
                  <button class="text-xs text-primary-500 hover:text-primary-600" @click="handleReviewStoryboard">
                    重新审查
                  </button>
                </div>
                <!-- Sub scores -->
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

              <!-- Summary -->
              <div class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{{ reviewResult.summary }}</div>

              <!-- Strengths -->
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

              <!-- Weaknesses -->
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

              <!-- Global suggestions -->
              <div v-if="reviewResult.global_suggestions?.length">
                <h4 class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">整体改进建议</h4>
                <ol class="space-y-1.5">
                  <li v-for="(sg, i) in reviewResult.global_suggestions" :key="i" class="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                    <span class="shrink-0 w-5 h-5 rounded-full bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400 text-xs flex items-center justify-center font-medium">{{ i + 1 }}</span>
                    {{ sg }}
                  </li>
                </ol>
              </div>

              <!-- Shot-level feedback -->
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
@keyframes indeterminate {
  0%   { transform: translateX(-100%) scaleX(0.4); }
  50%  { transform: translateX(80%)   scaleX(0.8); }
  100% { transform: translateX(300%)  scaleX(0.4); }
}
.progress-indeterminate {
  width: 40%;
  animation: indeterminate 1.4s ease-in-out infinite;
}
</style>
