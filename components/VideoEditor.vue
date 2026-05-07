<script setup lang="ts">
import type { StoryboardShot, VideoQualityTier, ShotVoiceSegment, VideoBGMSegment, JamendoTrack } from '~/types'

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
const batchGeneratingImages = ref(false)
const batchGeneratingClips = ref(false)

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

function parseSfxTags(sfxTags?: string): string[] {
  if (!sfxTags) return []
  try { return JSON.parse(sfxTags) as string[] } catch { return [] }
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

// BGM (legacy, kept for timeline BGM playback ref)
const selectedBgm = ref('')
const bgmVolume = ref(60)

// SFX
const generatingSFX = ref(false)
const sfxTaskId = ref<string | null>(null)
const sfxPlayingId = ref<number | null>(null)   // 正在播放的 ShotSFXItem.id
const sfxAudioRef = ref<HTMLAudioElement | null>(null)
const sfxItems = ref<Record<number, import('~/types').ShotSFXItem[]>>({})   // shotId → items
const sfxItemsLoading = ref(false)

// ── Timeline tab ──────────────────────────────────────────
const timelinePlaying = ref(false)
const timelineCurrentShotIndex = ref(0)
const timelineShotElapsed = ref(0)
const timelineTotalElapsed = ref(0)
const timelineTimer = ref<ReturnType<typeof setInterval> | null>(null)
const timelineSelectedShotId = ref<number | null>(null)
const timelineVideoRef = ref<HTMLVideoElement | null>(null)
const timelinePreviewRef = ref<HTMLDivElement | null>(null)
const timelineVoiceRef = ref<HTMLAudioElement | null>(null)
const timelineSfxRef = ref<HTMLAudioElement | null>(null)
const timelineBgmRef = ref<HTMLAudioElement | null>(null)
const timelineDragShotId = ref<number | null>(null)
const timelineShotsOrder = ref<number[]>([])
const timelineEditDraft = ref<Record<number, { duration: number; transition: string; sfx_volume: number }>>({})
const timelineSaving = ref<Record<number, boolean>>({})
const timelineResizingShotId = ref<number | null>(null)
const timelineResizeDraft = ref<Record<number, number>>({})
const timelinePlaybackSpeed = ref(1.0)
const timelineMasterVolume = ref(80)
const timelineMuted = ref(false)
const timelineSfxMuted = ref(false)
const timelineBgmMuted = ref(false)
const timelineRecording = ref(false)
const timelineMediaRecorder = ref<MediaRecorder | null>(null)
const timelineCurrentBgmSegId = ref<number | null>(null)

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

const timelineOrderedShots = computed(() => {
  if (timelineShotsOrder.value.length === 0) return shots.value
  const map = Object.fromEntries(shots.value.map(s => [s.id, s]))
  return timelineShotsOrder.value.map(id => map[id]).filter(Boolean) as typeof shots.value
})
const timelineCurrentShot = computed(() => timelineOrderedShots.value[timelineCurrentShotIndex.value] ?? null)

const TL_PX_PER_SEC = 16   // pixels per second for vertical timeline scale

// Effective duration: max(shot.duration, sum of voice segment duration_secs)
// Falls back to shot.duration when segments not yet loaded
function timelineEffectiveDuration(shot: typeof shots.value[0]): number {
  // During row-resize drag, return the live draft value
  if (timelineResizeDraft.value[shot.id] != null) {
    return timelineResizeDraft.value[shot.id]
  }
  const segs = shotSegments.value[shot.id]
  if (segs && segs.length > 0) {
    const segTotal = segs.reduce((s, seg) => s + (seg.duration_secs || 0), 0)
    if (segTotal > 0) return Math.max(shot.duration || 5, segTotal)
  }
  return shot.duration || 5
}

const timelineTotalDuration = computed(() =>
  shots.value.reduce((sum, s) => sum + timelineEffectiveDuration(s), 0),
)
const timelineShotStartTimes = computed(() => {
  const times: number[] = []
  let cum = 0
  for (const shot of timelineOrderedShots.value) {
    times.push(cum)
    cum += timelineEffectiveDuration(shot)
  }
  return times
})

// Maps each BGM segment to its absolute top/height in the vertical timeline (px)
const timelineBgmBlocks = computed(() => {
  const shotsArr = timelineOrderedShots.value
  const shotNoToIdx = new Map(shotsArr.map((s, i) => [s.shot_no, i]))
  const startTimes = timelineShotStartTimes.value
  return bgmSegments.value.map(seg => {
    const startIdx = shotNoToIdx.get(seg.start_shot_no) ?? 0
    const endIdx = shotNoToIdx.get(seg.end_shot_no) ?? (shotsArr.length - 1)
    const top = (startTimes[startIdx] ?? 0) * TL_PX_PER_SEC
    const endShot = shotsArr[endIdx]
    const endShotDur = endShot ? timelineEffectiveDuration(endShot) : 0
    const height = Math.max(8, ((startTimes[endIdx] ?? 0) + endShotDur) * TL_PX_PER_SEC - top)
    return { seg, top, height }
  })
})

function tlFmtTime(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`
}

const TABS = computed(() => [
  { key: 'script', label: '分镜脚本', icon: 'M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4', locked: false },
  { key: 'voice', label: '配音字幕', icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z', locked: !productionEnabled.value },
  { key: 'bgm', label: '背景音乐', icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3', locked: !productionEnabled.value },
  { key: 'sfx', label: '音效', icon: 'M15.536 8.464a5 5 0 010 7.072M12 6a7 7 0 010 12M8.464 8.464a5 5 0 000 7.072M3 12a9 9 0 1018 0 9 9 0 00-18 0z', locked: !productionEnabled.value },
  { key: 'timeline', label: '时间线', icon: 'M4 6h16M4 10h16M4 14h16M4 18h16', locked: !productionEnabled.value },
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
    // Only show toast for tasks submitted in the current session, not for resumed localStorage tasks
    if (videoStore.storyboardTaskIsNew) {
      toast.success('分镜脚本生成完成，请检查并确认')
    }
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
// AI 参数从 cookie 恢复（刷新页面后保留用户手动设置的值）
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

const storyboardUserPrompt = ref('') // 额外要求（user_prompt）
const showAdvancedParams = ref(false)
const showScriptAiPanel = ref(true)   // script tab AI panel collapsed state

// ── Voice tab AI panel ──
const showVoiceAiPanel = ref(true)
const batchFillingSubtitles = ref(false)

// ── BGM tab AI panel ──
const bgmAiContext = ref('')   // 额外分析提示（会随 analyze/generate 请求发送）
const showBgmAiPanel = ref(true)
const bgmMoodPresets = [
  { label: '史诗宏大', value: '史诗宏大的战斗场面，需要磅礴的管弦乐和鼓点' },
  { label: '温馨感人', value: '温馨感人的情感场景，需要柔和的弦乐和钢琴' },
  { label: '紧张刺激', value: '紧张刺激的追逐/危机场景，需要快节奏配乐' },
  { label: '浪漫唯美', value: '浪漫唯美的爱情场景，需要抒情旋律' },
  { label: '悬疑神秘', value: '悬疑神秘氛围，需要低沉的弦乐和不和谐音效' },
  { label: '轻快活泼', value: '轻快活泼的日常场景，需要欢快的音乐' },
]

// ── SFX tab AI panel ──
const sfxAiContext = ref('')   // 额外场景背景提示
const showSfxAiPanel = ref(true)
const sfxScenePresets = [
  { label: '古风武侠', value: '古代中国武侠场景，刀剑交击、马蹄、古筝等音效' },
  { label: '仙侠玄幻', value: '修仙玄幻场景，灵气波动、法术、雷鸣等音效' },
  { label: '现代都市', value: '现代都市场景，车声、人群、室内环境音等' },
  { label: '科幻未来', value: '科幻未来场景，机械、能量、空间感等音效' },
  { label: '自然野外', value: '自然野外场景，风雨、鸟鸣、虫声、水流等' },
]

// 仅在 cookie 未记录时，从 DB 读取默认值（cookie 优先）
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

async function handleGenerateStoryboard(userPrompt?: string, overridePacing?: string, overrideTargetDuration?: number, overrideMaxTokens?: number, overrideTemperature?: number, overrideTimeoutSeconds?: number, overrideVoiceMode?: string) {
  if (isScriptConfirmed.value) {
    if (!confirm('重新生成将清空当前脚本，是否继续？')) return
  }
  const novel = novelStore.currentNovel
  const effectivePacing = overridePacing ?? pacing.value
  const effectiveDuration = overrideTargetDuration ?? targetDuration.value
  // adv 参数未设置时，fallback 到 novel 项目配置，确保请求体中始终携带实际生效的值
  const effectiveMaxTokens = overrideMaxTokens ?? (advMaxTokens.value || novel?.max_tokens || undefined)
  const effectiveTemperature = overrideTemperature ?? (advTemperature.value || novel?.temperature || undefined)
  const effectiveTimeout = overrideTimeoutSeconds ?? (advTimeoutSeconds.value || novel?.timeout_seconds || undefined)
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
      overrideVoiceMode || (voiceMode.value !== 'both' ? voiceMode.value : undefined),
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

async function refineShotImage(shot: StoryboardShot, suggestion: string): Promise<string> {
  const api = useVideoApi()
  const res = await api.refineShotImage(props.videoId, shot.id, suggestion)
  const newUrl = res.data?.image_url
  if (newUrl) {
    const idx = videoStore.storyboard.findIndex(s => s.id === shot.id)
    if (idx >= 0) videoStore.storyboard[idx].image_url = newUrl
  }
  return newUrl || ''
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
    taskStore.trackTask(taskId, async (task) => {
      generatingVoice.value[shot.id] = false
      if (task.status === 'completed') {
        const base = ((task.data as any)?.audio_url as string | undefined)
          || `/api/v1/videos/${props.videoId}/storyboard/${shot.id}/audio`
        // 追加时间戳强制浏览器跳过缓存重新加载音频
        const sep = base.includes('?') ? '&' : '?'
        shotAudioUrls.value[shot.id] = `${base}${sep}t=${Date.now()}`
        const srt = (task.data as any)?.subtitle_srt as string | undefined
        if (srt) shotSubtitles.value[shot.id] = srt
        // 刷新分镜列表，以获取后端更新后的 duration
        await videoStore.fetchStoryboard(props.videoId)
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

const batchVoiceTaskId = ref<string | null>(null)
const batchVoiceGenerating = ref(false)

async function handleGenerateAllVoice() {
  if (shots.value.length === 0) { toast.error('没有分镜，无法生成配音'); return }
  if (batchVoiceGenerating.value) { toast.info('配音批量任务进行中…'); return }
  batchVoiceGenerating.value = true
  try {
    const api = useVideoApi()
    const res = await api.batchGenerateVoice(props.videoId, {
      subtitle_enabled: subtitleEnabled.value,
      skip_existing: true,
      max_shots: 10,
    })
    const taskId = (res as any)?.data?.task_id
    const shotCount = (res as any)?.data?.shot_count ?? 0
    if (!taskId) {
      toast.success((res as any)?.message || '所有分镜已有配音')
      batchVoiceGenerating.value = false
      return
    }
    batchVoiceTaskId.value = taskId
    toast.info(`批量配音任务已提交（${shotCount} 个分镜），顺序处理中…`)
    const taskStore = useTaskStore()
    taskStore.trackTask(taskId, async (task) => {
      batchVoiceGenerating.value = false
      batchVoiceTaskId.value = null
      if (task.status === 'completed') {
        await videoStore.fetchStoryboard(props.videoId)
        const d = task.data as any
        toast.success(`批量配音完成：成功 ${d?.success ?? 0} 个，失败 ${d?.fail ?? 0} 个`)
      } else {
        toast.error('批量配音任务失败，请重试')
      }
    })
  } catch (e: any) {
    toast.error('批量配音提交失败：' + (e.message || ''))
    batchVoiceGenerating.value = false
  }
}

// ──────── BGM ────────
const bgmSegments = ref<VideoBGMSegment[]>([])
const generatingBgm = ref(false)
const analyzingBgm = ref(false)

async function loadBGMSegments() {
  const api = useVideoApi()
  try {
    const res = await api.listBGMSegments(props.videoId)
    bgmSegments.value = (res as any)?.data ?? []
  } catch (e) {
    console.error('[BGM] loadBGMSegments failed:', e)
  }
}

// 批量将旁白/台词复制到字幕字段（仅填充未自定义字幕的镜头）
async function batchFillSubtitles() {
  batchFillingSubtitles.value = true
  try {
    const toUpdate = shots.value.filter(s => !s.subtitle && (s.narration || s.dialogue))
    if (toUpdate.length === 0) { toast.info('所有镜头的字幕已填充'); return }
    await Promise.all(toUpdate.map(s =>
      videoStore.updateShot(props.videoId, s.id, {
        subtitle: (s.dialogue || s.narration || '').trim()
      } as any)
    ))
    toast.success(`已填充 ${toUpdate.length} 个镜头的字幕`)
  } catch (e: any) {
    toast.error('填充失败：' + (e.message || ''))
  } finally {
    batchFillingSubtitles.value = false
  }
}

async function handleAnalyzeBGM() {
  if (shots.value.length === 0) { toast.error('没有分镜，请先生成分镜脚本'); return }
  analyzingBgm.value = true
  try {
    const api = useVideoApi()
    const res = await api.analyzeBGMSegments(props.videoId, bgmAiContext.value ? { user_prompt: bgmAiContext.value } : undefined)
    const taskId = (res as any)?.data?.task_id
    if (!taskId) { analyzingBgm.value = false; return }
    const taskStore = useTaskStore()
    taskStore.trackTask(taskId, async (task) => {
      analyzingBgm.value = false
      if (task.status === 'completed') {
        await loadBGMSegments()
        toast.success('BGM分段分析完成，请查看分段列表')
      } else {
        toast.error('BGM分析失败，请重试')
      }
    })
  } catch (e: any) {
    toast.error('BGM分析失败：' + (e.message || ''))
    analyzingBgm.value = false
  }
}

async function handleGenerateBgm() {
  if (shots.value.length === 0) { toast.error('没有分镜，请先生成分镜脚本'); return }
  generatingBgm.value = true
  try {
    const api = useVideoApi()
    const res = await api.generateBGM(props.videoId, bgmAiContext.value ? { user_prompt: bgmAiContext.value } : undefined)
    const taskId = (res as any)?.data?.task_id
    if (!taskId) { generatingBgm.value = false; return }
    toast.info('BGM生成任务已提交（AI分析 + Jamendo搜索）…')
    const taskStore = useTaskStore()
    taskStore.trackTask(taskId, async (task) => {
      generatingBgm.value = false
      if (task.status === 'completed') {
        await loadBGMSegments()
        const d = task.data as any
        toast.success(`BGM生成完成：${d?.matched ?? 0}/${d?.total ?? 0} 个分段匹配到音乐`)
      } else {
        toast.error('BGM生成失败，请重试')
      }
    })
  } catch (e: any) {
    toast.error('BGM生成失败：' + (e.message || ''))
    generatingBgm.value = false
  }
}

function parseBGMSearchQueries(json: string): string[] {
  try { return JSON.parse(json) } catch { return [] }
}

function bgmStopPreview() { /* no-op: native audio elements stop themselves */ }

// ──────── Jamendo 手动搜索 ────────
const bgmSearchTargetSeg = ref<VideoBGMSegment | null>(null)
const bgmSearchQuery = ref('')
const bgmSearchTags = ref('')
const bgmSearchSpeed = ref('')
const bgmSearchBpmMin = ref(0)
const bgmSearchBpmMax = ref(0)
const bgmSearchResults = ref<JamendoTrack[]>([])
const bgmSearchLoading = ref(false)
const bgmApplyingId = ref<string | null>(null)

function openBGMSearch(seg: VideoBGMSegment) {
  bgmSearchTargetSeg.value = seg
  const queries = parseBGMSearchQueries(seg.search_queries)
  bgmSearchQuery.value = queries[0] ?? seg.mood ?? ''
  bgmSearchTags.value = ''
  bgmSearchSpeed.value = seg.tempo === 'fast' ? 'fast' : seg.tempo === 'slow' ? 'slow' : 'medium'
  bgmSearchResults.value = []
}

function closeBGMSearch() {
  bgmSearchTargetSeg.value = null
  bgmSearchResults.value = []
}

async function handleJamendoSearch() {
  if (!bgmSearchQuery.value && !bgmSearchTags.value) return
  bgmSearchLoading.value = true
  bgmSearchResults.value = []
  try {
    const api = useVideoApi()
    const res = await api.jamendoSearchBGM(props.videoId, {
      q: bgmSearchQuery.value || undefined,
      tags: bgmSearchTags.value || undefined,
      speed: bgmSearchSpeed.value || undefined,
      bpm_min: bgmSearchBpmMin.value || undefined,
      bpm_max: bgmSearchBpmMax.value || undefined,
      limit: 15,
    })
    bgmSearchResults.value = (res as any)?.data ?? []
  } catch (e: any) {
    toast.error('搜索失败：' + (e.message || ''))
  } finally {
    bgmSearchLoading.value = false
  }
}

function trackPlayURL(track: JamendoTrack): string {
  return track.audiodownload_allowed && track.audiodownload ? track.audiodownload : track.audio
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

async function applyBGMTrack(track: JamendoTrack) {
  if (!bgmSearchTargetSeg.value) return
  bgmApplyingId.value = track.id
  try {
    const api = useVideoApi()
    await api.applyBGMTrack(props.videoId, bgmSearchTargetSeg.value.id, {
      url: trackPlayURL(track),
      track_name: track.name,
      track_artist: track.artist_name,
      source: 'jamendo',
    })
    await loadBGMSegments()
    toast.success(`已应用：${track.name}`)
    closeBGMSearch()
  } catch (e: any) {
    toast.error('应用失败：' + (e.message || ''))
  } finally {
    bgmApplyingId.value = null
  }
}

// ──────── SFX ────────
const analyzingTags = ref(false)

async function handleAnalyzeSFXTags() {
  if (shots.value.length === 0) { toast.error('没有分镜，请先生成分镜脚本'); return }
  analyzingTags.value = true
  try {
    const api = useVideoApi()
    const res = await api.analyzeSFXTags(props.videoId, sfxAiContext.value ? { user_context: sfxAiContext.value } : undefined)
    const taskId = (res as any)?.data?.task_id
    if (taskId) {
      useTaskStore().trackTask(taskId, async (task) => {
        analyzingTags.value = false
        if (task.status === 'completed') {
          await videoStore.fetchStoryboard(props.videoId)
          toast.success('AI 音效标签分析完成，每个镜头已生成精准搜索词')
        } else {
          toast.error('AI 音效标签分析失败：' + ((task as any).error || ''))
        }
      })
      toast.info('AI 正在分析分镜脚本，生成精准音效搜索词…')
    }
  } catch (e: any) {
    toast.error('AI 分析失败：' + (e.message || ''))
    analyzingTags.value = false
  }
}

async function handleGenerateSFX() {
  if (shots.value.length === 0) { toast.error('没有分镜，请先生成分镜脚本'); return }
  generatingSFX.value = true
  try {
    const api = useVideoApi()
    const res = await api.batchGenerateSFX(props.videoId, sfxAiContext.value ? { user_context: sfxAiContext.value } : undefined)
    const taskId = (res as any)?.data?.task_id
    if (taskId) {
      sfxTaskId.value = taskId
      useTaskStore().trackTask(taskId, async (task) => {
        await videoStore.fetchStoryboard(props.videoId)
        await loadSFXItems()
        const { success = 0, fail = 0 } = (task.data as any) ?? {}
        if (fail > 0) {
          toast.warning(`音效生成完成：${success} 成功，${fail} 失败`)
        } else {
          toast.success(`音效生成完成：${success} 个镜头`)
        }
      })
      toast.success('音效生成任务已提交（含 AI 标签分析），请在右下角任务面板查看进度')
    }
  } catch (e: any) {
    toast.error('音效生成失败：' + (e.message || ''))
  } finally {
    generatingSFX.value = false
  }
}

async function loadSFXItems() {
  if (shots.value.length === 0) return
  sfxItemsLoading.value = true
  try {
    const api = useVideoApi()
    await Promise.all(shots.value.map(async (shot) => {
      const res = await api.listShotSFXItems(props.videoId, shot.id)
      sfxItems.value[shot.id] = (res as any)?.data ?? []
    }))
  } catch { /* silent */ } finally {
    sfxItemsLoading.value = false
  }
}

function toggleSfxPreview(item: import('~/types').ShotSFXItem) {
  const audio = sfxAudioRef.value
  if (!audio) return
  if (sfxPlayingId.value === item.id) {
    audio.pause()
    sfxPlayingId.value = null
    return
  }
  audio.src = item.url
  audio.currentTime = 0
  audio.play().catch(() => { sfxPlayingId.value = null })
  sfxPlayingId.value = item.id
}

async function deleteSFXItem(shot: StoryboardShot, item: import('~/types').ShotSFXItem) {
  const api = useVideoApi()
  await api.deleteShotSFXItem(props.videoId, shot.id, item.id)
  sfxItems.value[shot.id] = (sfxItems.value[shot.id] ?? []).filter(i => i.id !== item.id)
  if (sfxPlayingId.value === item.id) {
    sfxAudioRef.value?.pause()
    sfxPlayingId.value = null
  }
}

async function updateSFXItemVolume(shot: StoryboardShot, item: import('~/types').ShotSFXItem, volume: number) {
  const api = useVideoApi()
  await api.updateShotSFXItem(props.videoId, shot.id, item.id, { volume })
  const list = sfxItems.value[shot.id] ?? []
  const idx = list.findIndex(i => i.id === item.id)
  if (idx !== -1) list[idx] = { ...list[idx], volume }
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

// ──────── Shot insert / copy / delete ────────
const insertingShotAfter = ref<number | null>(null) // shot_no after which we're inserting
const insertShotForm = reactive({ narration: '', description: '', duration: 4 })
const insertingShotLoading = ref(false)

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

// ──────── Voice segments ────────
const shotSegments = ref<Record<number, ShotVoiceSegment[]>>({})
const loadingSegments = ref<Record<number, boolean>>({})
const expandedSegmentShotId = ref<number | null>(null)
const generatingSegmentVoice = ref<Record<number, boolean>>({})
const newSegmentText = ref<Record<number, string>>({})
const insertAfterSeqNo = ref<Record<number, number | null>>({}) // shotId → seqNo after which to insert

async function loadSegments(shot: StoryboardShot) {
  if (loadingSegments.value[shot.id]) return
  loadingSegments.value[shot.id] = true
  try {
    const api = useVideoApi()
    const res = await api.listVoiceSegments(props.videoId, shot.id)
    shotSegments.value[shot.id] = res.data ?? []
  } catch {
    shotSegments.value[shot.id] = []
  } finally {
    loadingSegments.value[shot.id] = false
  }
}

async function toggleSegmentExpand(shot: StoryboardShot) {
  if (expandedSegmentShotId.value === shot.id) {
    expandedSegmentShotId.value = null
    return
  }
  expandedSegmentShotId.value = shot.id
  await loadSegments(shot)
}

async function handleAppendSegment(shot: StoryboardShot) {
  const text = (newSegmentText.value[shot.id] || '').trim()
  if (!text) return
  try {
    const api = useVideoApi()
    const res = await api.appendVoiceSegment(props.videoId, shot.id, { text })
    shotSegments.value[shot.id] = [...(shotSegments.value[shot.id] || []), res.data!]
    newSegmentText.value[shot.id] = ''
  } catch (e: any) {
    toast.error('添加片段失败：' + (e.message || ''))
  }
}

async function handleInsertSegment(shot: StoryboardShot, afterSeqNo: number) {
  const text = (newSegmentText.value[`${shot.id}_ins_${afterSeqNo}`] as string || '').trim()
  if (!text) return
  try {
    const api = useVideoApi()
    await api.insertVoiceSegment(props.videoId, shot.id, afterSeqNo, { text })
    await loadSegments(shot)
    delete (newSegmentText.value as any)[`${shot.id}_ins_${afterSeqNo}`]
    insertAfterSeqNo.value[shot.id] = null
  } catch (e: any) {
    toast.error('插入片段失败：' + (e.message || ''))
  }
}

async function handleDeleteSegment(shot: StoryboardShot, seg: ShotVoiceSegment) {
  try {
    const api = useVideoApi()
    await api.deleteVoiceSegment(props.videoId, shot.id, seg.id)
    shotSegments.value[shot.id] = (shotSegments.value[shot.id] || []).filter(s => s.id !== seg.id)
  } catch (e: any) {
    toast.error('删除片段失败：' + (e.message || ''))
  }
}

async function handleGenerateSegmentVoice(shot: StoryboardShot, seg: ShotVoiceSegment) {
  generatingSegmentVoice.value[seg.id] = true
  try {
    const api = useVideoApi()
    const res = await api.generateSegmentVoice(props.videoId, shot.id, seg.id)
    const taskId = res.data?.task_id
    if (taskId) {
      toast.info(`片段 ${seg.seq_no} 配音生成中…`)
      useTaskStore().trackTask(taskId, async (task) => {
        generatingSegmentVoice.value[seg.id] = false
        if (task.status === 'completed') {
          await loadSegments(shot)
          // 刷新分镜列表，以获取后端更新后的 duration
          await videoStore.fetchStoryboard(props.videoId)
          toast.success(`片段 ${seg.seq_no} 配音已完成`)
        } else {
          toast.error(`片段 ${seg.seq_no} 配音失败`)
        }
      })
    }
  } catch (e: any) {
    toast.error('配音失败：' + (e.message || ''))
    generatingSegmentVoice.value[seg.id] = false
  }
}

// ──────── Ken Burns ────────
const KB_ANIMATIONS = [
  'kb-zoom-in',       // 中心放大
  'kb-zoom-out',      // 中心缩小
  'kb-pan-left',      // 向左平移
  'kb-pan-right',     // 向右平移
  'kb-pan-up',        // 向上平移
  'kb-pan-down',      // 向下平移
  'kb-zoom-tl',       // 左上角放大
  'kb-zoom-tr',       // 右上角放大
  'kb-zoom-bl',       // 左下角放大
  'kb-zoom-br',       // 右下角放大
  'kb-drift-diag',    // 对角漂移
  'kb-slow-reveal',   // 慢速全景展开
] as const

function kenBurnsStyle(shot: StoryboardShot): string {
  const animName = KB_ANIMATIONS[shot.id % KB_ANIMATIONS.length]
  const dur = shot.duration || 5
  const state = timelinePlaying.value ? 'running' : 'paused'
  return `animation: ${animName} ${dur}s ease-in-out forwards; animation-play-state: ${state}`
}

// ──────── Timeline ────────
function timelineFindCurrentBgmSeg() {
  const shot = timelineCurrentShot.value
  if (!shot) return null
  return bgmSegments.value.find(seg =>
    !!seg.url &&
    seg.start_shot_no <= shot.shot_no &&
    shot.shot_no <= seg.end_shot_no
  ) ?? null
}

function timelineSyncBgmAudio() {
  const seg = timelineFindCurrentBgmSeg()
  if (!timelineBgmRef.value) return
  if (seg?.url) {
    const vol = (timelineMasterVolume.value / 100) * ((seg.volume > 0 ? seg.volume : bgmVolume.value) / 100)
    timelineBgmRef.value.volume = vol
    timelineBgmRef.value.muted = timelineBgmMuted.value || timelineMuted.value
    if (timelineCurrentBgmSegId.value !== seg.id) {
      timelineCurrentBgmSegId.value = seg.id
      timelineBgmRef.value.src = seg.url
    }
    if (timelinePlaying.value) {
      timelineBgmRef.value.play().catch(() => {})
    }
  } else {
    timelineCurrentBgmSegId.value = null
    timelineBgmRef.value.pause()
    timelineBgmRef.value.src = ''
  }
}

function timelineSyncMedia() {
  const shot = timelineCurrentShot.value
  if (!shot) return
  const vol = timelineMasterVolume.value / 100
  const speed = timelinePlaybackSpeed.value
  nextTick(() => {
    if (timelineVideoRef.value) {
      if (shot.video_url) {
        timelineVideoRef.value.src = shot.video_url
        timelineVideoRef.value.volume = vol
        timelineVideoRef.value.playbackRate = speed
        timelineVideoRef.value.play().catch(() => {})
      } else {
        timelineVideoRef.value.src = ''
      }
    }
    if (timelineVoiceRef.value) {
      const voiceUrl = shotAudioUrls.value[shot.id] || shot.audio_url
      if (voiceUrl) {
        timelineVoiceRef.value.src = voiceUrl
        timelineVoiceRef.value.volume = vol
        timelineVoiceRef.value.playbackRate = speed
        timelineVoiceRef.value.play().catch(() => {})
      } else {
        timelineVoiceRef.value.src = ''
      }
    }
    if (timelineSfxRef.value) {
      if (shot.sfx_url) {
        timelineSfxRef.value.src = shot.sfx_url
        timelineSfxRef.value.volume = vol * (shot.sfx_volume ?? 1)
        timelineSfxRef.value.muted = timelineSfxMuted.value || timelineMuted.value
        timelineSfxRef.value.playbackRate = speed
        timelineSfxRef.value.play().catch(() => {})
      } else {
        timelineSfxRef.value.src = ''
      }
    }
    timelineSyncBgmAudio()
  })
}

function timelineTick() {
  const shot = timelineCurrentShot.value
  if (!shot) { timelineStop(); return }
  const inc = 0.1 * timelinePlaybackSpeed.value
  timelineShotElapsed.value += inc
  timelineTotalElapsed.value += inc
  if (timelineShotElapsed.value >= timelineEffectiveDuration(shot)) {
    if (timelineCurrentShotIndex.value < timelineOrderedShots.value.length - 1) {
      timelineCurrentShotIndex.value++
      timelineShotElapsed.value = 0
      timelineSyncMedia()
    } else {
      timelineStop()
    }
  }
}

function timelinePlay() {
  if (timelinePlaying.value) return
  timelinePlaying.value = true
  timelineSyncMedia()
  timelineTimer.value = setInterval(timelineTick, 100)
}

function timelinePause() {
  timelinePlaying.value = false
  if (timelineTimer.value) { clearInterval(timelineTimer.value); timelineTimer.value = null }
  timelineVideoRef.value?.pause()
  timelineVoiceRef.value?.pause()
  timelineSfxRef.value?.pause()
  timelineBgmRef.value?.pause()
}

function timelineStop() {
  timelinePause()
  timelineCurrentShotIndex.value = 0
  timelineShotElapsed.value = 0
  timelineTotalElapsed.value = 0
  timelineCurrentBgmSegId.value = null
}

function timelineSeekToShot(idx: number) {
  const wasPlaying = timelinePlaying.value
  timelinePause()
  timelineCurrentShotIndex.value = idx
  timelineShotElapsed.value = 0
  timelineTotalElapsed.value = timelineOrderedShots.value
    .slice(0, idx)
    .reduce((s, sh) => s + timelineEffectiveDuration(sh), 0)
  if (wasPlaying) timelinePlay()
}

function timelineDragStart(shotId: number) { timelineDragShotId.value = shotId }
function timelineDragOver(e: DragEvent, targetId: number) {
  e.preventDefault()
  if (timelineDragShotId.value == null || timelineDragShotId.value === targetId) return
  const order = [...timelineShotsOrder.value]
  const from = order.indexOf(timelineDragShotId.value)
  const to = order.indexOf(targetId)
  if (from === -1 || to === -1) return
  order.splice(from, 1)
  order.splice(to, 0, timelineDragShotId.value)
  timelineShotsOrder.value = order
}
function timelineDragEnd() { timelineDragShotId.value = null }

// 点击进度条跳转
function timelineSeekByClick(e: MouseEvent) {
  const bar = e.currentTarget as HTMLElement
  const ratio = Math.max(0, Math.min(1, e.offsetX / bar.clientWidth))
  const targetTime = ratio * timelineTotalDuration.value
  let elapsed = 0
  for (let i = 0; i < timelineOrderedShots.value.length; i++) {
    const dur = timelineEffectiveDuration(timelineOrderedShots.value[i])
    if (elapsed + dur >= targetTime) {
      const wasPlaying = timelinePlaying.value
      timelinePause()
      timelineCurrentShotIndex.value = i
      timelineShotElapsed.value = targetTime - elapsed
      timelineTotalElapsed.value = targetTime
      if (wasPlaying) timelinePlay()
      return
    }
    elapsed += dur
  }
}

// 下载完整 MP4（后端拼接所有分镜后直接流式下载）
const timelineDownloading = ref(false)

async function timelineDownloadCurrent() {
  if (timelineDownloading.value) return
  const config = useRuntimeConfig()
  const apiBase = config.public.apiBase
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : ''
  const url = `${apiBase}/api/v1/videos/${props.videoId}/download`
  const filename = `inkframe-video-${props.videoId}.mp4`
  timelineDownloading.value = true
  try {
    const resp = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const blob = await resp.blob()
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(objectUrl)
  } catch (e) {
    toast.error('下载失败，请先完成视频拼接')
  } finally {
    timelineDownloading.value = false
  }
}

// 实时更新正在播放的媒体的音量和速度
function timelineCycleSpeed() {
  const speeds = [0.5, 1.0, 1.5, 2.0]
  const idx = speeds.indexOf(timelinePlaybackSpeed.value)
  timelinePlaybackSpeed.value = speeds[(idx + 1) % speeds.length]
}

watch(timelineMuted, (m) => {
  if (timelineVideoRef.value) timelineVideoRef.value.muted = m
  if (timelineVoiceRef.value) timelineVoiceRef.value.muted = m
  if (timelineSfxRef.value) timelineSfxRef.value.muted = m || timelineSfxMuted.value
  timelineSyncBgmAudio()
})
watch(timelineSfxMuted, (m) => {
  if (timelineSfxRef.value) timelineSfxRef.value.muted = m || timelineMuted.value
})
watch(timelineBgmMuted, () => {
  timelineSyncBgmAudio()
})

async function timelineToggleRecording() {
  if (timelineRecording.value) {
    timelineMediaRecorder.value?.stop()
    return
  }
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 } as any, audio: true })
    const chunks: Blob[] = []
    const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9') ? 'video/webm; codecs=vp9' : 'video/webm'
    const recorder = new MediaRecorder(stream, { mimeType })
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop())
      const blob = new Blob(chunks, { type: recorder.mimeType })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `inkframe-preview-${props.videoId}.webm`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      timelineRecording.value = false
      timelineMediaRecorder.value = null
    }
    recorder.start(1000)
    timelineMediaRecorder.value = recorder
    timelineRecording.value = true
    // Stop when user ends screen share
    stream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (timelineMediaRecorder.value?.state === 'recording') timelineMediaRecorder.value.stop()
    })
    // Auto-start playback
    if (!timelinePlaying.value) timelinePlay()
  } catch (e: any) {
    if (e?.name !== 'NotAllowedError') toast.error('录制失败：' + (e?.message || '不支持'))
  }
}

watch(timelineMasterVolume, (v) => {
  const vol = v / 100
  if (timelineVideoRef.value) timelineVideoRef.value.volume = vol
  if (timelineVoiceRef.value) timelineVoiceRef.value.volume = vol
  if (timelineSfxRef.value) timelineSfxRef.value.volume = vol
  if (timelineBgmRef.value) timelineBgmRef.value.volume = vol * (bgmVolume.value / 100)
})
watch(timelinePlaybackSpeed, (speed) => {
  if (timelineVideoRef.value) timelineVideoRef.value.playbackRate = speed
  if (timelineVoiceRef.value) timelineVoiceRef.value.playbackRate = speed
  if (timelineSfxRef.value) timelineSfxRef.value.playbackRate = speed
})

async function timelineSaveShot(shotId: number) {
  const draft = timelineEditDraft.value[shotId]
  if (!draft) return
  timelineSaving.value[shotId] = true
  try {
    await videoStore.updateShot(props.videoId, shotId, {
      duration: draft.duration,
      transition: draft.transition as any,
      sfx_volume: draft.sfx_volume,
    })
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || ''))
  } finally {
    timelineSaving.value[shotId] = false
  }
}

// Drag-the-bottom-edge of a shot row to resize its duration
function timelineResizeStart(e: MouseEvent, shotId: number, currentDuration: number) {
  e.preventDefault()
  timelineResizingShotId.value = shotId
  timelineResizeDraft.value = { ...timelineResizeDraft.value, [shotId]: currentDuration }
  const startY = e.clientY
  const startDur = currentDuration

  function onMove(mv: MouseEvent) {
    const dy = mv.clientY - startY
    const newDur = Math.max(1, parseFloat((startDur + dy / TL_PX_PER_SEC).toFixed(1)))
    timelineResizeDraft.value = { ...timelineResizeDraft.value, [shotId]: newDur }
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    const finalDur = timelineResizeDraft.value[shotId]
    timelineResizingShotId.value = null
    if (finalDur != null && finalDur !== startDur) {
      videoStore.updateShot(props.videoId, shotId, { duration: finalDur }).catch(() => {})
    }
    nextTick(() => {
      const d = { ...timelineResizeDraft.value }
      delete d[shotId]
      timelineResizeDraft.value = d
    })
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

watch(() => shots.value, (newShots) => {
  if (timelineShotsOrder.value.length === 0 && newShots.length > 0) {
    timelineShotsOrder.value = newShots.map(s => s.id)
  }
}, { immediate: true })

watch(timelineSelectedShotId, (id) => {
  if (id == null) return
  const shot = shots.value.find(s => s.id === id)
  if (!shot) return
  if (!timelineEditDraft.value[id]) {
    timelineEditDraft.value[id] = {
      duration: shot.duration || 5,
      transition: shot.transition || 'cut',
      sfx_volume: shot.sfx_volume ?? 0,
    }
  }
})

// Auto-load voice segments for all shots when timeline tab opens
// so timelineEffectiveDuration() has real duration_secs data
const tabLoading = ref(false)

watch(activeTab, async (tab, prevTab) => {
  // Stop BGM preview when leaving the bgm tab
  if (prevTab === 'bgm') bgmStopPreview()
  tabLoading.value = true
  try {
    // Tabs that show shot-level data: always refresh storyboard on switch
    if (['script', 'voice', 'sfx', 'timeline'].includes(tab)) {
      await videoStore.fetchStoryboard(props.videoId)
    }
    // Tabs that show video-level data (bgm_url, status, etc.)
    if (['bgm', 'export'].includes(tab)) {
      await videoStore.fetchVideo(props.videoId)
    }
    if (tab === 'bgm' || tab === 'timeline') {
      await loadBGMSegments()
    }
    // SFX: load all sfx items for each shot
    if (tab === 'sfx') {
      await loadSFXItems()
    }
    // Voice: reload segments for the currently expanded shot (if any)
    if (tab === 'voice' && expandedSegmentShotId.value != null) {
      const shot = shots.value.find(s => s.id === expandedSegmentShotId.value)
      if (shot) await loadSegments(shot)
    }
    // Timeline: (re-)load segments for every shot so all tracks are visible
    if (tab === 'timeline') {
      for (const shot of shots.value) {
        await loadSegments(shot)
      }
    }
  } finally {
    tabLoading.value = false
  }
})

onUnmounted(() => {
  timelinePause()
  bgmStopPreview()
  if (timelineMediaRecorder.value?.state === 'recording') timelineMediaRecorder.value.stop()
})

defineExpose({ generateStoryboard: handleGenerateStoryboard, activeTab })
</script>

<template>
  <div class="space-y-4">

    <!-- Tabs -->
    <div class="border-b border-gray-200 dark:border-gray-700">
      <nav class="flex">
        <button
          v-for="tab in TABS"
          :key="tab.key"
          class="flex-1 flex items-center justify-center gap-1 py-2.5 border-b-2 font-medium text-xs transition-colors whitespace-nowrap"
          :class="[
            activeTab === tab.key
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : tab.locked
                ? 'border-transparent text-gray-300 dark:text-gray-600 cursor-not-allowed'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600',
          ]"
          :disabled="tab.locked"
          @click="!tab.locked && (activeTab = tab.key)"
        >
          {{ tab.label }}
          <svg v-if="tab.locked" class="w-2.5 h-2.5 opacity-40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </button>
      </nav>
    </div>

    <!-- Tab loading overlay -->
    <div v-if="tabLoading" class="flex items-center justify-center py-16">
      <svg class="w-6 h-6 animate-spin text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      <span class="ml-2 text-sm text-gray-500 dark:text-gray-400">加载中…</span>
    </div>

    <!-- ==============================
         分镜脚本 Tab
         ============================== -->
    <div v-if="activeTab === 'script' && !tabLoading">


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
        <!-- 额外要求 -->
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

        <!-- ── AI 助手面板（分镜脚本）── -->
        <div v-if="!isScriptConfirmed" class="card overflow-hidden">
          <button
            class="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            @click="showScriptAiPanel = !showScriptAiPanel"
          >
            <span class="flex items-center gap-2">
              <svg class="w-4 h-4 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              AI 助手 — 更新分镜脚本
            </span>
            <svg class="w-4 h-4 transition-transform" :class="showScriptAiPanel ? 'rotate-180' : ''" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div v-if="showScriptAiPanel" class="px-4 pb-4 pt-3 border-t border-gray-100 dark:border-gray-700/50 space-y-3">
            <!-- 节奏 + 时长 + 配音模式 -->
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <div class="flex items-center gap-1.5">
                <span class="text-xs text-gray-500 dark:text-gray-400">节奏</span>
                <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                  <button v-for="p in pacingOptions" :key="p.value"
                    class="px-2.5 py-1 text-xs transition-colors"
                    :class="pacing === p.value ? 'bg-primary-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-750'"
                    @click="pacing = p.value">{{ p.label }}</button>
                </div>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-xs text-gray-500 dark:text-gray-400">时长</span>
                <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                  <button v-for="d in durationOptions" :key="d.value"
                    class="px-2.5 py-1 text-xs transition-colors"
                    :class="targetDuration === d.value ? 'bg-primary-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-750'"
                    @click="targetDuration = d.value">{{ d.label }}</button>
                </div>
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-xs text-gray-500 dark:text-gray-400">配音</span>
                <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
                  <button
                    class="px-2.5 py-1 text-xs transition-colors"
                    :class="voiceMode === 'both' ? 'bg-primary-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-750'"
                    @click="voiceMode = 'both'">对白+旁白</button>
                  <button
                    class="px-2.5 py-1 text-xs transition-colors"
                    :class="voiceMode === 'narration' ? 'bg-primary-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-750'"
                    @click="voiceMode = 'narration'">仅旁白</button>
                  <button
                    class="px-2.5 py-1 text-xs transition-colors"
                    :class="voiceMode === 'dialogue' ? 'bg-primary-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-750'"
                    @click="voiceMode = 'dialogue'">仅对白</button>
                </div>
              </div>
            </div>
            <!-- 额外要求 -->
            <textarea
              v-model="storyboardUserPrompt"
              rows="2"
              placeholder="额外要求（可选）：如「强化战斗场面节奏」、「突出主角情绪变化」..."
              class="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary-400 resize-none"
            />
            <!-- 高级参数 -->
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
                  <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Max Tokens <span class="text-gray-400">（0=系统默认）</span></label>
                  <input v-model.number="advMaxTokens" type="number" min="0" max="32768" step="256" placeholder="0"
                    class="w-full px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400" />
                </div>
                <div>
                  <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">Temperature <span class="text-gray-400">（0=默认 0.1）</span></label>
                  <div class="flex items-center gap-2">
                    <input v-model.number="advTemperature" type="range" min="0" max="2.0" step="0.1" class="flex-1 accent-primary-500" />
                    <input v-model.number="advTemperature" type="number" min="0" max="2.0" step="0.1" placeholder="0"
                      class="w-14 px-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-primary-400" />
                  </div>
                </div>
              </div>
            </div>
            <!-- 更新按钮 -->
            <button
              class="btn-primary text-sm w-full"
              :disabled="generatingStoryboard"
              @click="handleGenerateStoryboard(storyboardUserPrompt)"
            >
              <svg v-if="generatingStoryboard" class="w-4 h-4 mr-1.5 animate-spin inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {{ generatingStoryboard ? '生成中…' : '更新分镜脚本' }}
            </button>
          </div>
        </div>

        <!-- ── Script mode (not confirmed): text-focused cards ── -->
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
                  音效标签
                  <span class="ml-1 text-gray-400 font-normal">（JSON 数组或逗号分隔，如 ["rain","thunder"]）</span>
                </label>
                <input v-model="editForm.sfx_tags" type="text" class="input text-sm font-mono" placeholder='["sword_clash","crowd_gasp"]' />
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
                    class="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    title="编辑"
                    @click="startEdit(shot)"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                    </svg>
                  </button>
                  <button
                    class="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                    title="复制此镜头（插入在其后）"
                    @click="handleCopyShot(shot)"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button
                    class="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                    title="删除此镜头"
                    @click="handleDeleteShot(shot)"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
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
                <!-- SFX tags from LLM -->
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

        <!-- ── Production mode (confirmed): asset-generation cards ── -->
        <template v-else>
          <div v-for="shot in shots" :key="shot.id" class="card p-3">
            <div class="flex gap-3">
              <!-- Thumbnail -->
              <div class="w-28 flex-shrink-0 rounded-lg overflow-hidden bg-gray-900 flex items-center justify-center" style="min-height: 72px;">
                <img v-if="shot.image_url" :src="shot.image_url" class="w-full h-full object-cover cursor-zoom-in" @click.stop="openLightbox(shot.image_url, (s) => refineShotImage(shot, s))" />
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
    <div v-if="activeTab === 'voice' && !tabLoading" class="space-y-4">
      <!-- AI 助手面板（配音字幕）→ Teleport 到侧边栏 #voice-ai-slot -->
      <Teleport to="#voice-ai-slot">
        <div class="p-4 space-y-4">
          <!-- 配音模式 -->
          <div>
            <p class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">配音模式</p>
            <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <button
                class="flex-1 px-2.5 py-1.5 text-xs transition-colors"
                :class="voiceMode === 'both' ? 'bg-green-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50'"
                @click="voiceMode = 'both'">对白+旁白</button>
              <button
                class="flex-1 px-2.5 py-1.5 text-xs transition-colors border-l border-gray-200 dark:border-gray-700"
                :class="voiceMode === 'narration' ? 'bg-green-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50'"
                @click="voiceMode = 'narration'">仅旁白</button>
              <button
                class="flex-1 px-2.5 py-1.5 text-xs transition-colors border-l border-gray-200 dark:border-gray-700"
                :class="voiceMode === 'dialogue' ? 'bg-green-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50'"
                @click="voiceMode = 'dialogue'">仅对白</button>
            </div>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">影响重新生成脚本时的旁白/台词分配</p>
          </div>
          <!-- 字幕设置 -->
          <div>
            <p class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">字幕</p>
            <label class="flex items-center gap-2 cursor-pointer mb-1.5">
              <input v-model="subtitleEnabled" type="checkbox" class="rounded accent-green-500" />
              <span class="text-xs text-gray-600 dark:text-gray-400">同步生成字幕</span>
            </label>
            <div v-if="subtitleEnabled" class="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500 pl-5">
              <span class="inline-block w-3 h-3 rounded-full border border-gray-300 flex-shrink-0" :style="{ background: subtitleConfig.color }" />
              {{ { bottom: '底部', center: '居中', top: '顶部' }[subtitleConfig.position] }}
              · {{ subtitleConfig.font_size }}px
              · {{ { none: '无背景', shadow: '阴影', box: '底框' }[subtitleConfig.bg_style] }}
              <NuxtLink to="/novel" class="text-green-500 hover:underline ml-1" title="在项目配置中修改字幕样式">编辑样式</NuxtLink>
            </div>
          </div>
          <!-- 字幕快速操作 -->
          <div>
            <div class="flex items-center justify-between mb-1.5">
              <p class="text-xs font-medium text-gray-700 dark:text-gray-300">字幕操作</p>
              <span class="text-xs text-gray-400 dark:text-gray-500">{{ shots.filter(s => !s.subtitle && (s.narration || s.dialogue)).length }} 个待填充</span>
            </div>
            <button
              class="w-full btn-secondary text-xs py-1.5"
              :disabled="batchFillingSubtitles"
              @click="batchFillSubtitles"
              title="将未自定义字幕的镜头的字幕字段批量填入旁白/台词内容"
            >
              <svg v-if="batchFillingSubtitles" class="w-3.5 h-3.5 mr-1 animate-spin inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {{ batchFillingSubtitles ? '填充中…' : '一键填充字幕' }}
            </button>
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">将旁白/台词批量填入未自定义字幕的镜头</p>
          </div>
          <!-- 进度统计 -->
          <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span class="text-gray-500 dark:text-gray-400">共 {{ shots.length }} 个镜头</span>
            <span class="text-green-600 dark:text-green-400 text-right">✓ {{ Object.keys(shotAudioUrls).length }} 已配音</span>
            <span class="text-gray-400 dark:text-gray-500">待生成 {{ shots.length - Object.keys(shotAudioUrls).length }} 个</span>
            <span class="text-blue-600 dark:text-blue-400 text-right">字幕 {{ shots.filter(s => s.subtitle).length }} 个</span>
          </div>
          <!-- 主操作按钮 -->
          <div class="pt-1">
            <button class="w-full btn-primary text-sm" :disabled="batchVoiceGenerating" @click="handleGenerateAllVoice">
              <svg v-if="batchVoiceGenerating" class="w-4 h-4 mr-1.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {{ batchVoiceGenerating ? '生成中（最多10个）…' : '一键生成全部配音' }}
            </button>
          </div>
        </div>
      </Teleport>

      <div class="space-y-2">
        <div v-for="shot in shots" :key="shot.id" class="card p-4">
          <div class="flex items-start gap-3">
            <!-- Thumbnail -->
            <div class="w-20 h-12 bg-gray-900 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center">
              <img v-if="shot.image_url" :src="shot.image_url" class="w-full h-full object-cover cursor-zoom-in" @click.stop="openLightbox(shot.image_url, (s) => refineShotImage(shot, s))" />
              <span v-else class="text-xs text-gray-500">#{{ shot.shot_no }}</span>
            </div>
            <!-- Header -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between gap-2 mb-1">
                <p class="text-sm font-medium text-gray-700 dark:text-gray-300">镜头 {{ shot.shot_no }}</p>
                <div class="flex items-center gap-1.5">
                  <!-- Legacy single-voice button -->
                  <button
                    class="text-xs py-0.5 px-2 rounded border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-primary-600 hover:border-primary-300 transition-colors"
                    :disabled="generatingVoice[shot.id]"
                    @click="handleGenerateVoice(shot)"
                  >
                    {{ generatingVoice[shot.id] ? '生成中…' : (shotAudioUrls[shot.id] ? '重新生成旁白' : '生成旁白配音') }}
                  </button>
                  <!-- Expand segments -->
                  <button
                    class="text-xs py-0.5 px-2 rounded border transition-colors"
                    :class="expandedSegmentShotId === shot.id
                      ? 'border-primary-400 text-primary-600 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:text-primary-600 hover:border-primary-300'"
                    @click="toggleSegmentExpand(shot)"
                  >
                    多段配音 {{ expandedSegmentShotId === shot.id ? '▲' : '▼' }}
                  </button>
                </div>
              </div>
              <!-- Narration text preview -->
              <p class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-2">
                {{ shot.narration || shot.dialogue || shot.description || '（无台词）' }}
              </p>
              <!-- Legacy audio -->
              <audio v-if="shotAudioUrls[shot.id]" :src="shotAudioUrls[shot.id]" controls class="mt-1.5 w-full h-8" />
            </div>
          </div>

          <!-- ── Multi-segment panel ── -->
          <div v-if="expandedSegmentShotId === shot.id" class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            <div v-if="loadingSegments[shot.id]" class="text-xs text-gray-400 py-2 text-center">加载中…</div>
            <div v-else class="space-y-2">
              <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">语音片段列表（按顺序播放）</p>

              <!-- Segment list -->
              <template v-for="seg in (shotSegments[shot.id] || [])" :key="seg.id">
                <div class="flex items-start gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-700/50">
                  <span class="flex-shrink-0 w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-600 text-xs flex items-center justify-center text-gray-500 font-bold mt-0.5">
                    {{ seg.seq_no }}
                  </span>
                  <div class="flex-1 min-w-0">
                    <p class="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{{ seg.text }}</p>
                    <p v-if="seg.speaker" class="text-xs text-gray-400 mt-0.5">角色：{{ seg.speaker }}</p>
                    <audio v-if="seg.audio_path" :src="`/api/v1/videos/${props.videoId}/shots/${shot.id}/segments/${seg.id}/audio`" controls class="mt-1 w-full h-7" />
                  </div>
                  <div class="flex-shrink-0 flex items-center gap-1">
                    <button
                      class="p-1 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
                      :disabled="generatingSegmentVoice[seg.id]"
                      title="生成配音"
                      @click="handleGenerateSegmentVoice(shot, seg)"
                    >
                      <svg v-if="generatingSegmentVoice[seg.id]" class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                      </svg>
                    </button>
                    <button
                      class="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                      title="删除此片段"
                      @click="handleDeleteSegment(shot, seg)"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
                <!-- Insert between segments -->
                <div class="relative flex items-center justify-center h-5 group">
                  <div class="absolute inset-x-4 top-1/2 -translate-y-1/2 h-px bg-gray-100 dark:bg-gray-700 group-hover:bg-primary-200 transition-colors" />
                  <button
                    class="relative z-10 text-[10px] text-gray-400 bg-white dark:bg-gray-800 px-1.5 py-0.5 rounded-full border border-gray-200 dark:border-gray-700 opacity-0 group-hover:opacity-100 transition-opacity hover:text-primary-600 hover:border-primary-300"
                    @click="insertAfterSeqNo[shot.id] = (insertAfterSeqNo[shot.id] === seg.seq_no ? null : seg.seq_no)"
                  >+ 在此插入</button>
                </div>
                <!-- Insert form -->
                <div v-if="insertAfterSeqNo[shot.id] === seg.seq_no" class="flex items-center gap-2 pl-7">
                  <input
                    :value="(newSegmentText as any)[`${shot.id}_ins_${seg.seq_no}`] || ''"
                    class="input text-sm flex-1"
                    placeholder="新片段文本…"
                    @input="(e) => { (newSegmentText as any)[`${shot.id}_ins_${seg.seq_no}`] = (e.target as HTMLInputElement).value }"
                    @keydown.enter="handleInsertSegment(shot, seg.seq_no)"
                  />
                  <button class="btn-primary text-xs py-1 px-2" @click="handleInsertSegment(shot, seg.seq_no)">插入</button>
                  <button class="btn-outline text-xs py-1 px-2" @click="insertAfterSeqNo[shot.id] = null">取消</button>
                </div>
              </template>

              <!-- Append new segment -->
              <div class="flex items-center gap-2 pt-1">
                <input
                  v-model="newSegmentText[shot.id]"
                  class="input text-sm flex-1"
                  placeholder="添加新片段文本…"
                  @keydown.enter="handleAppendSegment(shot)"
                />
                <button class="btn-primary text-xs py-1 px-2.5" @click="handleAppendSegment(shot)">追加</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ==============================
         背景音乐 Tab
         ============================== -->
    <div v-if="activeTab === 'bgm' && !tabLoading" class="space-y-4">
      <!-- Toolbar -->
      <div class="card p-4">
        <div class="mb-3">
          <h3 class="font-semibold text-gray-900 dark:text-white">AI 背景音乐</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            AI 分析全部分镜的情绪走向，将情绪相近的连续分镜归为一组，每组生成专属搜索词，在 Jamendo 免费音乐库匹配曲目
          </p>
        </div>
      </div>

      <!-- AI 助手面板（背景音乐）→ Teleport 到侧边栏 #bgm-ai-slot -->
      <Teleport to="#bgm-ai-slot">
        <div class="p-4 space-y-4">
          <!-- 情绪基调快选 -->
          <div>
            <p class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">情绪基调</p>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="preset in bgmMoodPresets"
                :key="preset.label"
                class="px-2.5 py-1 text-xs rounded-full border transition-colors"
                :class="bgmAiContext === preset.value
                  ? 'border-purple-400 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-purple-300'"
                @click="bgmAiContext = bgmAiContext === preset.value ? '' : preset.value"
              >{{ preset.label }}</button>
            </div>
          </div>
          <!-- 自定义分析提示 -->
          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">分析提示 <span class="font-normal text-gray-400">（可选）</span></label>
            <textarea
              v-model="bgmAiContext"
              rows="3"
              placeholder="例如：整体基调是古风仙侠，战斗场面需要激昂的管弦乐，感情戏需要温婉的琵琶曲..."
              class="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-purple-400 resize-none"
            />
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">AI 分析/生成 BGM 时优先参考此提示</p>
          </div>
          <!-- 工作流说明 -->
          <div class="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-xs text-purple-700 dark:text-purple-300 space-y-1">
            <p class="font-medium">推荐两步工作流</p>
            <p>① <span class="font-medium">AI 分析分段</span>：分析分镜情绪，规划 BGM 分组和搜索词</p>
            <p>② <span class="font-medium">一键生成BGM</span>：Jamendo 免费音乐库，每段独立情绪匹配</p>
            <p class="text-purple-500 dark:text-purple-400">注：一段 BGM 可跨越多个分镜</p>
          </div>
          <!-- 生成统计 -->
          <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span class="text-gray-500 dark:text-gray-400">共 {{ shots.length }} 个镜头</span>
            <span class="text-purple-600 dark:text-purple-400 text-right">{{ bgmSegments.length }} 个BGM段</span>
            <span class="text-green-600 dark:text-green-400">✓ {{ bgmSegments.filter(s => s.url).length }} 已生成</span>
            <span class="text-gray-400 dark:text-gray-500 text-right">待生成 {{ bgmSegments.filter(s => !s.url).length }} 个</span>
          </div>
          <!-- 操作按钮 -->
          <div class="space-y-2 pt-1">
            <button
              class="w-full btn-secondary text-sm"
              :disabled="analyzingBgm || generatingBgm || shots.length === 0"
              @click="handleAnalyzeBGM"
              title="AI分析分镜情绪，规划BGM分段（不下载音频）"
            >
              <svg v-if="analyzingBgm" class="w-4 h-4 mr-1.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              {{ analyzingBgm ? 'AI分析中…' : 'AI 分析分段' }}
            </button>
            <button
              class="w-full btn-primary text-sm"
              :disabled="generatingBgm || analyzingBgm || shots.length === 0"
              @click="handleGenerateBgm"
            >
              <svg v-if="generatingBgm" class="w-4 h-4 mr-1.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
              {{ generatingBgm ? '生成中…' : '一键生成BGM' }}
            </button>
          </div>
        </div>
      </Teleport>

      <!-- BGM Segments List -->
      <div v-if="bgmSegments.length > 0" class="space-y-3">
        <div
          v-for="seg in bgmSegments"
          :key="seg.id"
          class="card p-4"
        >
          <div class="flex items-start gap-3">
            <!-- Segment badge -->
            <div class="flex-shrink-0 w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center text-xs font-bold text-purple-600 dark:text-purple-400">
              {{ seg.seq_no }}
            </div>
            <div class="flex-1 min-w-0">
              <!-- Header row -->
              <div class="flex items-center flex-wrap gap-2 mb-1">
                <span class="text-sm font-medium text-gray-900 dark:text-white">镜头 {{ seg.start_shot_no }}–{{ seg.end_shot_no }}</span>
                <span class="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">{{ seg.mood }}</span>
                <span class="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                  {{ { fast: '快节奏', medium: '中节奏', slow: '慢节奏' }[seg.tempo] ?? seg.tempo }}
                </span>
              </div>
              <!-- Search queries chips -->
              <div v-if="parseBGMSearchQueries(seg.search_queries).length > 0" class="flex flex-wrap gap-1 mb-2">
                <span
                  v-for="q in parseBGMSearchQueries(seg.search_queries)"
                  :key="q"
                  class="text-xs px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
                >
                  {{ q }}
                </span>
              </div>
              <!-- Matched track -->
              <div v-if="seg.url" class="rounded-lg bg-green-50 dark:bg-green-900/20 px-3 py-2 space-y-2">
                <!-- Track info + action -->
                <div class="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                  <svg class="w-4 h-4 text-green-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                  </svg>
                  <div class="min-w-0 flex-1">
                    <p class="font-medium truncate">{{ seg.track_name || '已匹配曲目' }}</p>
                    <p v-if="seg.track_artist" class="text-gray-400 truncate">{{ seg.track_artist }} · {{ seg.source }}</p>
                  </div>
                  <button
                    class="btn-secondary text-xs flex-shrink-0"
                    @click="openBGMSearch(seg)"
                    title="在 Jamendo 搜索替换曲目"
                  >
                    <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    换曲
                  </button>
                </div>
                <!-- Native audio preview player -->
                <audio :src="seg.url" controls preload="none" class="w-full mt-1" style="height:32px" />
              </div>
              <div v-else class="flex items-center gap-2">
                <p class="text-xs text-gray-400 italic flex-1">暂无匹配曲目</p>
                <button
                  class="btn-secondary text-xs"
                  @click="openBGMSearch(seg)"
                  title="在 Jamendo 搜索曲目"
                >
                  <svg class="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  搜索曲目
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state -->
      <div v-else class="card p-8 text-center">
        <svg class="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
        <p class="text-sm text-gray-500 dark:text-gray-400">尚无BGM分段</p>
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">点击「AI 分析分段」或「一键生成BGM」开始</p>
      </div>

      <!-- ── Jamendo 手动搜索面板 ── -->
      <div v-if="bgmSearchTargetSeg" class="card p-4 border-2 border-purple-300 dark:border-purple-700">
        <!-- Panel header -->
        <div class="flex items-center justify-between mb-3">
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <h4 class="text-sm font-semibold text-gray-900 dark:text-white">
              Jamendo 搜索
              <span class="text-purple-500 ml-1">（第 {{ bgmSearchTargetSeg.seq_no }} 段 · {{ bgmSearchTargetSeg.mood }}）</span>
            </h4>
          </div>
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1" @click="closeBGMSearch">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- Search controls -->
        <div class="flex flex-wrap gap-2 mb-3">
          <input
            v-model="bgmSearchQuery"
            type="text"
            placeholder="搜索词，如 epic orchestral battle…"
            class="input flex-1 min-w-48 text-sm"
            @keyup.enter="handleJamendoSearch"
          />
          <input
            v-model="bgmSearchTags"
            type="text"
            placeholder="精确标签（空格分隔）"
            class="input w-44 text-sm"
            @keyup.enter="handleJamendoSearch"
          />
          <select v-model="bgmSearchSpeed" class="input w-28 text-sm">
            <option value="">任意节奏</option>
            <option value="veryslow">极慢</option>
            <option value="slow">慢</option>
            <option value="medium">中</option>
            <option value="fast">快</option>
            <option value="veryfast">极快</option>
          </select>
          <input v-model.number="bgmSearchBpmMin" type="number" min="0" max="300" placeholder="BPM 最低" class="input w-24 text-sm" />
          <input v-model.number="bgmSearchBpmMax" type="number" min="0" max="300" placeholder="BPM 最高" class="input w-24 text-sm" />
          <button
            class="btn-primary text-sm"
            :disabled="bgmSearchLoading || (!bgmSearchQuery && !bgmSearchTags)"
            @click="handleJamendoSearch"
          >
            <svg v-if="bgmSearchLoading" class="w-4 h-4 mr-1 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {{ bgmSearchLoading ? '搜索中…' : '搜索' }}
          </button>
        </div>

        <!-- Search results -->
        <div v-if="bgmSearchResults.length > 0" class="space-y-2 max-h-72 overflow-y-auto pr-1">
          <div
            v-for="track in bgmSearchResults"
            :key="track.id"
            class="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 border border-transparent hover:border-gray-200 dark:hover:border-gray-700"
          >
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium text-gray-900 dark:text-white truncate">{{ track.name }}</p>
              <div class="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                <span class="truncate">{{ track.artist_name }}</span>
                <span>·</span>
                <span class="flex-shrink-0">{{ formatDuration(track.duration) }}</span>
                <span v-if="track.tags?.length" class="hidden sm:flex gap-1">
                  <span v-for="tag in track.tags.slice(0, 3)" :key="tag"
                    class="px-1.5 py-0.5 rounded bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">{{ tag }}</span>
                </span>
              </div>
            </div>
            <audio :src="trackPlayURL(track)" controls class="h-7 w-36 flex-shrink-0" preload="none" />
            <button
              class="btn-primary text-xs flex-shrink-0"
              :disabled="bgmApplyingId === track.id"
              @click="applyBGMTrack(track)"
            >
              <svg v-if="bgmApplyingId === track.id" class="w-3 h-3 mr-1 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              应用
            </button>
          </div>
        </div>
        <div v-else-if="!bgmSearchLoading" class="text-center py-4 text-sm text-gray-400">
          {{ bgmSearchQuery || bgmSearchTags ? '无搜索结果，请换一个词试试' : '输入搜索词后点击「搜索」' }}
        </div>
      </div>
    </div>

    <!-- ==============================
         音效 Tab
         ============================== -->
    <div v-if="activeTab === 'sfx' && !tabLoading" class="space-y-4">
      <div class="card p-4">
        <div class="mb-3">
          <h3 class="font-semibold text-gray-900 dark:text-white">AI 智能音效</h3>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">AI 先分析全部分镜的场景/动作/情绪，生成精准自然语言搜索词，再从音效库匹配素材</p>
        </div>
      </div>

      <!-- AI 助手面板（音效）→ Teleport 到侧边栏 #sfx-ai-slot -->
      <Teleport to="#sfx-ai-slot">
        <div class="p-4 space-y-4">
          <!-- 场景风格快选 -->
          <div>
            <p class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">场景风格</p>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="preset in sfxScenePresets"
                :key="preset.label"
                class="px-2.5 py-1 text-xs rounded-full border transition-colors"
                :class="sfxAiContext === preset.value
                  ? 'border-orange-400 bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-orange-300'"
                @click="sfxAiContext = sfxAiContext === preset.value ? '' : preset.value"
              >{{ preset.label }}</button>
            </div>
          </div>
          <!-- 场景背景提示 -->
          <div>
            <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">场景背景 <span class="font-normal text-gray-400">（可选）</span></label>
            <textarea
              v-model="sfxAiContext"
              rows="3"
              placeholder="例如：故事发生在古代中国，主角修炼仙法，主要场景包括竹林、山洞、宫殿..."
              class="w-full px-2 py-1.5 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-orange-400 resize-none"
            />
            <p class="text-xs text-gray-400 dark:text-gray-500 mt-1">AI 分析音效标签时优先参考此背景</p>
          </div>
          <!-- 推荐工作流说明 -->
          <div class="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 text-xs text-orange-700 dark:text-orange-300 space-y-1">
            <p class="font-medium">推荐两步工作流</p>
            <p>① <span class="font-medium">AI 分析标签</span>：为每个镜头生成场景专属搜索词</p>
            <p>② <span class="font-medium">一键生成音效</span>：本地库 → Freesound CC0 → ElevenLabs AI 三层降级匹配</p>
          </div>
          <!-- 生成统计 -->
          <div class="bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <span class="text-gray-500 dark:text-gray-400">共 {{ shots.length }} 个镜头</span>
            <span class="text-orange-600 dark:text-orange-400 text-right">待生成 {{ shots.filter(s => !s.sfx_url).length }} 个</span>
            <span class="text-green-600 dark:text-green-400">✓ {{ shots.filter(s => s.sfx_url).length }} 已有音效</span>
            <span class="text-blue-600 dark:text-blue-400 text-right">🏷 {{ shots.filter(s => s.sfx_tags).length }} 已分析</span>
          </div>
          <!-- 操作按钮 -->
          <div class="space-y-2 pt-1">
            <button
              class="w-full btn-secondary text-sm"
              :disabled="analyzingTags || generatingSFX || shots.length === 0"
              @click="handleAnalyzeSFXTags"
              title="仅更新每个镜头的音效搜索词，不搜索/下载音频"
            >
              <svg v-if="analyzingTags" class="w-4 h-4 mr-1.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              {{ analyzingTags ? '分析中…' : 'AI 分析标签' }}
            </button>
            <button
              class="w-full btn-primary text-sm"
              :disabled="generatingSFX || analyzingTags || shots.length === 0"
              @click="handleGenerateSFX"
            >
              <svg v-if="generatingSFX" class="w-4 h-4 mr-1.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072M12 6a7 7 0 010 12M8.464 8.464a5 5 0 000 7.072" />
              </svg>
              {{ generatingSFX ? '提交中…' : '一键生成音效' }}
            </button>
          </div>
        </div>
      </Teleport>

      <!-- 隐藏音频元素，用于试听 -->
      <audio ref="sfxAudioRef" class="hidden" @ended="sfxPlayingId = null" @error="sfxPlayingId = null" />

      <!-- 分镜音效列表 -->
      <div class="space-y-2">
        <div v-for="shot in shots" :key="shot.id" class="card overflow-hidden">
          <!-- 镜头标题行 -->
          <div class="flex items-center gap-3 p-3 border-b border-gray-100 dark:border-gray-700/50">
            <div class="w-14 h-9 bg-gray-900 rounded flex-shrink-0 overflow-hidden flex items-center justify-center">
              <img v-if="shot.image_url" :src="shot.image_url" class="w-full h-full object-cover" />
              <span v-else class="text-xs text-gray-500">#{{ shot.shot_no }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">镜头 {{ shot.shot_no }}</span>
              <span v-if="(sfxItems[shot.id]?.length ?? 0) > 0"
                class="ml-2 text-xs text-green-600 dark:text-green-400">
                {{ sfxItems[shot.id].length }} 条音效
              </span>
              <span v-else-if="!sfxItemsLoading" class="ml-2 text-xs text-gray-400">待生成</span>
            </div>
          </div>
          <!-- AI 分析出的音效搜索词（sfx_tags）预览 -->
          <div v-if="parseSfxTags(shot.sfx_tags).length > 0" class="px-3 py-1.5 flex flex-wrap gap-1 border-b border-gray-100 dark:border-gray-700/50">
            <span
              v-for="tag in parseSfxTags(shot.sfx_tags)"
              :key="tag"
              class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
            >
              <svg class="w-2.5 h-2.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {{ tag }}
            </span>
          </div>
          <!-- 音效条目列表 -->
          <div v-if="(sfxItems[shot.id]?.length ?? 0) > 0" class="divide-y divide-gray-100 dark:divide-gray-700/50">
            <div
              v-for="item in sfxItems[shot.id]"
              :key="item.id"
              class="flex items-center gap-2 px-3 py-2"
            >
              <!-- 来源徽标 -->
              <span class="text-[10px] px-1.5 py-0.5 rounded font-mono flex-shrink-0"
                :class="{
                  'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300': item.source === 'freesound',
                  'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300': item.source === 'jamendo',
                  'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300': item.source === 'elevenlabs',
                  'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400': item.source === 'local',
                }">
                {{ item.source }}
              </span>
              <!-- 标签 -->
              <span class="text-xs text-orange-600 dark:text-orange-400 flex-1 truncate font-medium">
                {{ item.tag || '—' }}
              </span>
              <!-- 音量滑块 -->
              <input
                type="range" min="0.1" max="1" step="0.05"
                :value="item.volume"
                class="w-16 accent-orange-500 flex-shrink-0"
                @change="updateSFXItemVolume(shot, item, parseFloat(($event.target as HTMLInputElement).value))"
              />
              <span class="text-xs text-gray-400 w-7 text-right flex-shrink-0">{{ Math.round(item.volume * 100) }}%</span>
              <!-- 播放按钮 -->
              <button
                class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                :class="sfxPlayingId === item.id
                  ? 'bg-orange-500 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-orange-500'"
                @click="toggleSfxPreview(item)"
              >
                <svg v-if="sfxPlayingId !== item.id" class="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                <svg v-else class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              </button>
              <!-- 删除按钮 -->
              <button
                class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                @click="deleteSFXItem(shot, item)"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          <!-- 空状态占位 -->
          <div v-else-if="!sfxItemsLoading" class="px-3 py-2 text-xs text-gray-400 italic">
            {{ parseSfxTags(shot.sfx_tags).length > 0 ? '已分析搜索词，点击「一键生成音效」匹配音频' : '点击「AI 分析标签」或「一键生成音效」' }}
          </div>
        </div>
        <p v-if="shots.length === 0" class="text-sm text-gray-400 text-center py-8">
          请先在「分镜脚本」Tab 生成分镜
        </p>
      </div>
    </div>

    <!-- ==============================
         时间线 Tab
         ============================== -->
    <div v-if="activeTab === 'timeline' && !tabLoading" class="space-y-3">
      <!-- Hidden audio-only elements -->
      <audio ref="timelineVoiceRef" class="hidden" preload="auto" />
      <audio ref="timelineSfxRef" class="hidden" preload="auto" />
      <audio ref="timelineBgmRef" class="hidden" preload="auto" loop />

      <!-- Vertical timeline grid (full width) -->
      <div class="card overflow-hidden">
        <!-- Column headers (sticky) -->
        <div class="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 text-xs font-medium text-gray-500 dark:text-gray-400 sticky top-0 z-10">
          <div class="w-10 flex-shrink-0 border-r border-gray-200 dark:border-gray-700" />
          <div class="w-36 flex-shrink-0 px-3 py-2 border-r border-gray-200 dark:border-gray-700">镜头</div>
          <div class="flex-1 px-3 py-2 border-r border-gray-200 dark:border-gray-700">视频轨</div>
          <div class="w-24 flex-shrink-0 px-3 py-2 border-r border-gray-200 dark:border-gray-700 text-center">配音轨</div>
          <div class="w-24 flex-shrink-0 px-3 py-2 border-r border-gray-200 dark:border-gray-700 text-center">音效轨</div>
          <div class="w-20 flex-shrink-0 px-3 py-2 text-center">背景音乐</div>
        </div>

        <!-- Shot rows scroll area -->
        <div class="relative overflow-y-auto max-h-[560px]">
          <!-- Playhead (horizontal red line, moves at TL_PX_PER_SEC px/s) -->
          <div
            class="absolute left-0 right-0 h-0.5 bg-red-500 z-20 pointer-events-none"
            :style="`top:${timelineTotalElapsed * TL_PX_PER_SEC}px`"
          >
            <div class="absolute -top-1 left-10 w-2 h-2 bg-red-500 rounded-full -translate-x-1/2" />
          </div>

          <!-- Shot rows -->
          <div
            v-for="(shot, idx) in timelineOrderedShots"
            :key="shot.id"
            class="relative flex border-b border-gray-100 dark:border-gray-800 transition-colors duration-150"
            :class="[
              timelineCurrentShotIndex === idx ? 'bg-primary-50 dark:bg-primary-900/15' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40',
              timelineDragShotId === shot.id ? 'opacity-40' : '',
              timelineResizingShotId === shot.id ? 'select-none' : '',
            ]"
            :style="`height:${timelineEffectiveDuration(shot) * TL_PX_PER_SEC}px`"
            draggable="true"
            @dragstart="timelineDragStart(shot.id)"
            @dragover="timelineDragOver($event, shot.id)"
            @dragend="timelineDragEnd"
          >
            <!-- Time ruler cell -->
            <div class="w-10 flex-shrink-0 border-r border-gray-100 dark:border-gray-800 relative select-none">
              <!-- Start-time label at top of cell -->
              <span
                class="absolute top-0.5 left-0 right-0 text-center text-[9px] font-mono leading-none"
                :class="timelineCurrentShotIndex === idx ? 'text-primary-500' : 'text-gray-400 dark:text-gray-600'"
              >
                {{ tlFmtTime(timelineShotStartTimes[idx]) }}
              </span>
              <!-- Tick mark at top -->
              <div class="absolute top-0 right-0 w-2 h-px bg-gray-300 dark:bg-gray-600" />
              <!-- Tick mark at bottom (= end time of this shot) -->
              <div class="absolute bottom-0 right-0 w-2 h-px bg-gray-300 dark:bg-gray-600" />
            </div>

            <!-- Shot info cell: thumbnail + number -->
            <div
              class="w-36 flex-shrink-0 border-r border-gray-100 dark:border-gray-800 flex items-center gap-2 px-2 cursor-pointer select-none"
              :class="timelineCurrentShotIndex === idx ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'"
              @click="timelineSeekToShot(idx)"
            >
              <!-- Drag handle -->
              <svg class="w-3 h-3 text-gray-300 dark:text-gray-600 flex-shrink-0 cursor-grab" fill="currentColor" viewBox="0 0 24 24">
                <path d="M9 5a1 1 0 100 2 1 1 0 000-2zm6 0a1 1 0 100 2 1 1 0 000-2zM9 11a1 1 0 100 2 1 1 0 000-2zm6 0a1 1 0 100 2 1 1 0 000-2zM9 17a1 1 0 100 2 1 1 0 000-2zm6 0a1 1 0 100 2 1 1 0 000-2z" />
              </svg>
              <!-- Thumbnail -->
              <div class="w-16 flex-shrink-0 rounded overflow-hidden bg-gray-200 dark:bg-gray-700" style="aspect-ratio:16/9">
                <img v-if="shot.image_url" :src="shot.image_url" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full flex items-center justify-center">
                  <span class="text-xs text-gray-400">无图</span>
                </div>
              </div>
              <!-- Shot no + duration -->
              <div class="min-w-0">
                <div class="text-xs font-semibold leading-tight">#{{ shot.shot_no }}</div>
                <div class="text-xs text-gray-400 font-mono">{{ timelineEffectiveDuration(shot).toFixed(1) }}s</div>
              </div>
            </div>

            <!-- Video track cell -->
            <div
              class="flex-1 border-r border-gray-100 dark:border-gray-800 relative overflow-hidden cursor-pointer px-3 flex items-center"
              :class="timelineSelectedShotId === shot.id ? 'ring-2 ring-inset ring-primary-500' : ''"
              @click="timelineSelectedShotId = timelineSelectedShotId === shot.id ? null : shot.id"
            >
              <img
                v-if="shot.image_url"
                :src="shot.image_url"
                class="absolute inset-0 w-full h-full object-cover opacity-10 pointer-events-none"
              />
              <span class="relative text-xs text-gray-600 dark:text-gray-300 line-clamp-2 leading-snug">
                {{ shot.description || shot.narration || '—' }}
              </span>
              <!-- Playback progress fill (left→right, bottom edge) -->
              <div
                v-if="timelineCurrentShotIndex === idx"
                class="absolute bottom-0 left-0 h-0.5 bg-primary-500 transition-none"
                :style="`width:${(timelineShotElapsed / timelineEffectiveDuration(shot)) * 100}%`"
              />
            </div>

            <!-- Voice track cell (bar height proportional to duration) -->
            <div class="w-24 flex-shrink-0 border-r border-gray-100 dark:border-gray-800 flex items-center justify-center px-3">
              <div
                class="w-full rounded"
                :class="(shotAudioUrls[shot.id] || shot.audio_url) ? 'bg-green-400 dark:bg-green-500' : 'bg-gray-200 dark:bg-gray-700'"
                :style="`height:${Math.min(100, (timelineEffectiveDuration(shot) / (timelineTotalDuration || 1)) * 400)}%`"
              />
            </div>

            <!-- SFX track cell -->
            <div class="w-24 flex-shrink-0 border-r border-gray-100 dark:border-gray-800 flex items-center justify-center px-3">
              <div
                class="w-full rounded"
                :class="shot.sfx_url ? 'bg-orange-400 dark:bg-orange-500' : 'bg-gray-200 dark:bg-gray-700'"
                :style="`height:${Math.min(100, (timelineEffectiveDuration(shot) / (timelineTotalDuration || 1)) * 400)}%`"
              />
            </div>

            <!-- BGM column spacer — visual handled by absolute overlay below -->
            <div class="w-20 flex-shrink-0" />

            <!-- Resize handle (bottom edge) — drag to adjust shot duration -->
            <div
              class="absolute bottom-0 left-10 right-0 h-2 cursor-row-resize z-10 group/rh"
              draggable="false"
              @mousedown.stop.prevent="timelineResizeStart($event, shot.id, timelineEffectiveDuration(shot))"
            >
              <div class="absolute bottom-0 left-0 right-0 h-px bg-transparent group-hover/rh:bg-primary-400 dark:group-hover/rh:bg-primary-500 transition-colors" />
              <!-- Duration badge shown while resizing this row -->
              <div
                v-if="timelineResizingShotId === shot.id"
                class="absolute bottom-1 right-2 bg-primary-600 text-white text-[10px] font-mono px-1.5 py-0.5 rounded pointer-events-none"
              >
                {{ (timelineResizeDraft[shot.id] || 0).toFixed(1) }}s
              </div>
            </div>
          </div>

          <!-- BGM segment overlay — spans across multiple shot rows -->
          <div class="absolute top-0 right-0 w-20 pointer-events-none" :style="`height:${timelineTotalDuration * TL_PX_PER_SEC}px`">
            <div
              v-for="{ seg, top, height } in timelineBgmBlocks"
              :key="seg.id"
              class="absolute left-1 right-1 rounded overflow-hidden flex flex-col gap-0"
              :style="`top:${top}px; height:${height}px`"
              :class="seg.url ? 'bg-purple-500 dark:bg-purple-600' : 'bg-purple-200 dark:bg-purple-900/60 border border-dashed border-purple-400 dark:border-purple-600'"
            >
              <!-- Mood label -->
              <div class="px-1.5 pt-1 text-[9px] font-semibold leading-tight truncate flex-shrink-0"
                :class="seg.url ? 'text-white' : 'text-purple-600 dark:text-purple-300'">
                {{ seg.mood }}
              </div>
              <!-- Track name (if available and tall enough) -->
              <div v-if="seg.track_name && height > 32"
                class="px-1.5 text-[8px] leading-tight truncate flex-shrink-0"
                :class="seg.url ? 'text-white/70' : 'text-purple-400 dark:text-purple-400'">
                {{ seg.track_name }}
              </div>
              <!-- Music icon centered for tall segments -->
              <div v-if="height > 48" class="flex-1 flex items-center justify-center">
                <svg class="w-3 h-3" :class="seg.url ? 'text-white/30' : 'text-purple-300 dark:text-purple-600'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                </svg>
              </div>
            </div>
            <!-- Empty state hint when no segments -->
            <div v-if="bgmSegments.length === 0" class="absolute inset-0 flex items-start justify-center pt-4 px-1">
              <p class="text-[9px] text-gray-300 dark:text-gray-600 text-center leading-tight">去「背景音乐」生成BGM</p>
            </div>
          </div>

          <!-- Total duration end marker -->
          <div v-if="shots.length > 0" class="flex items-center h-6">
            <div class="w-10 flex-shrink-0 relative">
              <span class="absolute top-0.5 left-0 right-0 text-center text-[9px] font-mono leading-none text-gray-400 dark:text-gray-600">
                {{ tlFmtTime(timelineTotalDuration) }}
              </span>
              <div class="absolute top-0 right-0 w-2 h-px bg-gray-300 dark:bg-gray-600" />
            </div>
          </div>

          <p v-if="shots.length === 0" class="text-sm text-gray-400 text-center py-12">
            请先在「分镜脚本」Tab 生成分镜
          </p>
        </div>

        <!-- BGM footer bar -->
        <div class="flex items-center gap-2 px-3 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 text-xs">
          <svg class="w-3.5 h-3.5 text-purple-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          <span v-if="bgmSegments.some(s => s.url)" class="text-purple-600 dark:text-purple-400 font-medium">
            {{ bgmSegments.filter(s => s.url).length }}/{{ bgmSegments.length }} 段 BGM · {{ bgmVolume }}%
          </span>
          <span v-else class="text-gray-400">背景音乐：未设置（在「背景音乐」Tab 中生成）</span>
        </div>
      </div>

      <!-- Shot detail panel -->
      <div v-if="timelineSelectedShotId != null" class="card p-4">
        <div class="flex items-center justify-between mb-3">
          <h4 class="font-medium text-gray-900 dark:text-white text-sm">
            镜头 #{{ shots.find(s => s.id === timelineSelectedShotId)?.shot_no }} 参数
          </h4>
          <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" @click="timelineSelectedShotId = null">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <template v-if="timelineEditDraft[timelineSelectedShotId]">
          <div class="grid grid-cols-3 gap-3">
            <div>
              <label class="block text-xs text-gray-500 mb-1">时长（秒）</label>
              <input
                v-model.number="timelineEditDraft[timelineSelectedShotId].duration"
                type="number" min="1" max="60"
                class="input w-full text-sm"
              />
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">转场方式</label>
              <select v-model="timelineEditDraft[timelineSelectedShotId].transition" class="input w-full text-sm">
                <option v-for="opt in TRANSITION_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">音效音量 {{ Math.round((timelineEditDraft[timelineSelectedShotId].sfx_volume ?? 0) * 100) }}%</label>
              <input
                v-model.number="timelineEditDraft[timelineSelectedShotId].sfx_volume"
                type="range" min="0" max="1" step="0.05"
                class="w-full accent-primary-500"
              />
            </div>
          </div>
          <div class="mt-3 flex justify-end">
            <button
              class="btn-primary text-xs py-1.5 px-3"
              :disabled="timelineSaving[timelineSelectedShotId]"
              @click="timelineSaveShot(timelineSelectedShotId)"
            >
              {{ timelineSaving[timelineSelectedShotId] ? '保存中...' : '保存' }}
            </button>
          </div>
        </template>
      </div>

      <!-- Preview player — teleported into the aside panel via #timeline-player-slot -->
      <Teleport to="#timeline-player-slot">
        <div class="p-4 space-y-3">
          <!-- Video / Image preview -->
          <div
            ref="timelinePreviewRef"
            class="timeline-preview relative bg-black rounded-lg overflow-hidden group w-full"
            style="aspect-ratio:16/9"
          >
            <video
              ref="timelineVideoRef"
              class="absolute inset-0 w-full h-full object-contain"
              :class="timelineCurrentShot?.video_url ? 'opacity-100' : 'opacity-0'"
              preload="auto"
            />
            <img
              v-if="!timelineCurrentShot?.video_url && timelineCurrentShot?.image_url"
              :key="timelineCurrentShotIndex"
              :src="timelineCurrentShot.image_url"
              :style="kenBurnsStyle(timelineCurrentShot)"
              class="absolute inset-0 w-full h-full object-cover"
            />
            <div v-if="!timelineCurrentShot" class="absolute inset-0 flex flex-col items-center justify-center gap-2">
              <svg class="w-8 h-8 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4" />
              </svg>
              <span class="text-xs text-gray-600">点击播放预览</span>
            </div>
            <!-- Subtitle overlay -->
            <div v-if="timelineCurrentShot && effectiveSubtitle(timelineCurrentShot)" class="absolute bottom-2 left-2 right-2 text-center pointer-events-none">
              <span class="inline-block bg-black/75 text-white text-xs px-2 py-1 rounded leading-snug">
                {{ effectiveSubtitle(timelineCurrentShot) }}
              </span>
            </div>
            <!-- Shot badge -->
            <div v-if="timelineCurrentShot" class="absolute top-1.5 left-1.5 bg-black/60 text-white text-[10px] font-mono px-1.5 py-0.5 rounded">
              #{{ timelineCurrentShot.shot_no }}
            </div>
            <!-- Record button -->
            <button
              class="absolute top-1.5 right-8 w-6 h-6 text-white rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              :class="timelineRecording ? 'bg-red-600 hover:bg-red-700 opacity-100' : 'bg-black/60 hover:bg-black/80'"
              :title="timelineRecording ? '停止录制' : '录制屏幕'"
              @click="timelineToggleRecording"
            >
              <svg v-if="timelineRecording" class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
              <svg v-else class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="6" />
              </svg>
            </button>
            <!-- Fullscreen -->
            <button
              class="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 hover:bg-black/80 text-white rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              title="全屏"
              @click="timelinePreviewRef ? timelinePreviewRef.requestFullscreen().catch(() => {}) : null"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
            <!-- Hover overlay controls -->
            <div class="timeline-overlay absolute bottom-0 left-0 right-0 px-2.5 pt-6 pb-2 bg-gradient-to-t from-black/85 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 select-none">
              <div class="w-full bg-white/30 rounded-full h-1 mb-2 cursor-pointer" @click="timelineSeekByClick">
                <div class="h-full bg-white rounded-full transition-none" :style="`width:${timelineTotalDuration > 0 ? (timelineTotalElapsed / timelineTotalDuration) * 100 : 0}%`" />
              </div>
              <div class="flex items-center gap-1 text-white">
                <button class="w-6 h-6 flex items-center justify-center rounded hover:bg-white/20 disabled:opacity-30" title="上一镜头" :disabled="timelineCurrentShotIndex === 0" @click="timelineSeekToShot(timelineCurrentShotIndex - 1)">
                  <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
                </button>
                <button class="w-7 h-7 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30" @click="timelinePlaying ? timelinePause() : timelinePlay()">
                  <svg v-if="!timelinePlaying" class="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  <svg v-else class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                </button>
                <button class="w-6 h-6 flex items-center justify-center rounded hover:bg-white/20 disabled:opacity-30" title="下一镜头" :disabled="timelineCurrentShotIndex >= timelineOrderedShots.length - 1" @click="timelineSeekToShot(timelineCurrentShotIndex + 1)">
                  <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z"/></svg>
                </button>
                <span class="text-[10px] font-mono tabular-nums text-white/80 mx-1 flex-1 text-center">{{ tlFmtTime(Math.floor(timelineTotalElapsed)) }} / {{ tlFmtTime(timelineTotalDuration) }}</span>
                <button class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-white/20 hover:bg-white/30 tabular-nums" @click="timelineCycleSpeed">{{ timelinePlaybackSpeed }}×</button>
                <button class="w-6 h-6 flex items-center justify-center rounded hover:bg-white/20" :title="timelineMuted ? '取消静音' : '静音'" @click="timelineMuted = !timelineMuted">
                  <svg v-if="!timelineMuted" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14"/></svg>
                  <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6m0-6l6 6"/></svg>
                </button>
                <!-- SFX mute toggle -->
                <button
                  class="px-1 h-5 rounded text-[9px] font-bold transition-colors"
                  :class="timelineSfxMuted ? 'bg-white/15 text-white/40 line-through' : 'bg-white/20 hover:bg-white/30 text-white'"
                  :title="timelineSfxMuted ? '开启音效' : '关闭音效'"
                  @click="timelineSfxMuted = !timelineSfxMuted"
                >FX</button>
                <!-- BGM mute toggle -->
                <button
                  class="px-1 h-5 rounded text-[9px] font-bold transition-colors"
                  :class="timelineBgmMuted ? 'bg-white/15 text-white/40 line-through' : 'bg-white/20 hover:bg-white/30 text-white'"
                  :title="timelineBgmMuted ? '开启背景音乐' : '关闭背景音乐'"
                  @click="timelineBgmMuted = !timelineBgmMuted"
                >BGM</button>
                <button class="w-6 h-6 flex items-center justify-center rounded hover:bg-white/20 disabled:opacity-30" :disabled="timelineDownloading" @click="timelineDownloadCurrent" title="下载 MP4">
                  <svg v-if="timelineDownloading" class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a10 10 0 100 20v-4l-3 3 3 3v-4a8 8 0 01-8-8z"/></svg>
                  <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
                </button>
              </div>
            </div>
          </div>

          <!-- Description -->
          <p class="text-xs text-gray-400 dark:text-gray-500 line-clamp-2 leading-snug">
            {{ timelineCurrentShot?.description || timelineCurrentShot?.narration || '—' }}
          </p>

          <!-- Progress bar -->
          <div class="bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden cursor-pointer" @click="timelineSeekByClick">
            <div class="h-full bg-primary-500 rounded-full transition-none" :style="`width:${timelineTotalDuration > 0 ? (timelineTotalElapsed / timelineTotalDuration) * 100 : 0}%`" />
          </div>

          <!-- Transport row -->
          <div class="flex items-center gap-1.5">
            <button class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-300 flex items-center justify-center disabled:opacity-30" title="上一镜头" :disabled="timelineCurrentShotIndex === 0" @click="timelineSeekToShot(timelineCurrentShotIndex - 1)">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg>
            </button>
            <button class="w-10 h-10 rounded-full bg-primary-500 hover:bg-primary-600 text-white flex items-center justify-center shadow-sm" @click="timelinePlaying ? timelinePause() : timelinePlay()">
              <svg v-if="!timelinePlaying" class="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              <svg v-else class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            </button>
            <button class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-300 flex items-center justify-center disabled:opacity-30" title="下一镜头" :disabled="timelineCurrentShotIndex >= timelineOrderedShots.length - 1" @click="timelineSeekToShot(timelineCurrentShotIndex + 1)">
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z"/></svg>
            </button>
            <button class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-500 dark:text-gray-300 flex items-center justify-center disabled:opacity-30" title="下载 MP4" :disabled="timelineDownloading" @click="timelineDownloadCurrent">
              <svg v-if="timelineDownloading" class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a10 10 0 100 20v-4l-3 3 3 3v-4a8 8 0 01-8-8z"/></svg>
              <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            </button>
            <div class="flex-1" />
            <span class="text-[10px] font-mono text-gray-400 dark:text-gray-500 tabular-nums">{{ tlFmtTime(Math.floor(timelineTotalElapsed)) }} / {{ tlFmtTime(timelineTotalDuration) }}</span>
          </div>

          <!-- Speed + Volume -->
          <div class="flex items-center gap-3 flex-wrap">
            <div class="flex items-center gap-1">
              <span class="text-[10px] text-gray-400 dark:text-gray-500 mr-0.5">速度</span>
              <button v-for="s in [0.5, 1.0, 1.5, 2.0]" :key="s"
                class="px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors"
                :class="timelinePlaybackSpeed === s ? 'bg-primary-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600'"
                @click="timelinePlaybackSpeed = s"
              >{{ s }}x</button>
            </div>
            <div class="flex items-center gap-1.5 flex-1 min-w-0">
              <svg class="w-3.5 h-3.5 flex-shrink-0 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
              </svg>
              <input v-model.number="timelineMasterVolume" type="range" min="0" max="100" step="5" class="flex-1 accent-primary-500 h-1.5" />
              <span class="text-[10px] font-mono text-gray-400 dark:text-gray-500 w-7 text-right">{{ timelineMasterVolume }}%</span>
            </div>
          </div>

          <!-- Track status (with individual mute toggles) -->
          <div class="space-y-1">
            <div class="flex items-center gap-1.5 text-xs">
              <div class="w-2 h-2 rounded-full flex-shrink-0" :class="timelineCurrentShot?.video_url ? 'bg-blue-500' : timelineCurrentShot?.image_url ? 'bg-blue-300' : 'bg-gray-300 dark:bg-gray-600'" />
              <span class="text-gray-500 dark:text-gray-400 w-10 flex-shrink-0">视频轨</span>
              <span class="text-gray-400 dark:text-gray-500 truncate flex-1">{{ timelineCurrentShot?.video_url ? '已加载' : timelineCurrentShot?.image_url ? '静态图' : '—' }}</span>
            </div>
            <div class="flex items-center gap-1.5 text-xs">
              <div class="w-2 h-2 rounded-full flex-shrink-0" :class="(shotAudioUrls[timelineCurrentShot?.id ?? -1] || timelineCurrentShot?.audio_url) ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'" />
              <span class="text-gray-500 dark:text-gray-400 w-10 flex-shrink-0">配音轨</span>
              <span class="text-gray-400 dark:text-gray-500 truncate flex-1">{{ (shotAudioUrls[timelineCurrentShot?.id ?? -1] || timelineCurrentShot?.audio_url) ? '已加载' : '—' }}</span>
            </div>
            <!-- SFX track — clickable mute -->
            <div
              class="flex items-center gap-1.5 text-xs rounded px-1 -mx-1 cursor-pointer transition-colors"
              :class="timelineSfxMuted ? 'bg-orange-50 dark:bg-orange-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'"
              @click="timelineSfxMuted = !timelineSfxMuted"
              :title="timelineSfxMuted ? '点击开启音效' : '点击关闭音效'"
            >
              <div class="w-2 h-2 rounded-full flex-shrink-0 transition-colors" :class="timelineCurrentShot?.sfx_url && !timelineSfxMuted ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'" />
              <span class="w-10 flex-shrink-0 transition-colors" :class="timelineSfxMuted ? 'text-gray-300 dark:text-gray-600 line-through' : 'text-gray-500 dark:text-gray-400'">音效轨</span>
              <span class="truncate flex-1 transition-colors" :class="timelineSfxMuted ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400 dark:text-gray-500'">{{ timelineCurrentShot?.sfx_url ? (timelineSfxMuted ? '已静音' : '已加载') : '—' }}</span>
              <svg v-if="timelineSfxMuted" class="w-3 h-3 flex-shrink-0 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/></svg>
              <svg v-else class="w-3 h-3 flex-shrink-0 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5L6 9H2v6h4l5 4V5z"/></svg>
            </div>
            <!-- BGM track — clickable mute -->
            <div
              class="flex items-center gap-1.5 text-xs rounded px-1 -mx-1 cursor-pointer transition-colors"
              :class="timelineBgmMuted ? 'bg-purple-50 dark:bg-purple-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'"
              @click="timelineBgmMuted = !timelineBgmMuted"
              :title="timelineBgmMuted ? '点击开启背景音乐' : '点击关闭背景音乐'"
            >
              <div class="w-2 h-2 rounded-full flex-shrink-0 transition-colors" :class="bgmSegments.some(s => s.url) && !timelineBgmMuted ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600'" />
              <span class="w-10 flex-shrink-0 transition-colors" :class="timelineBgmMuted ? 'text-gray-300 dark:text-gray-600 line-through' : 'text-gray-500 dark:text-gray-400'">背景音乐</span>
              <span class="truncate flex-1 transition-colors" :class="timelineBgmMuted ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400 dark:text-gray-500'">{{ bgmSegments.length > 0 ? (timelineBgmMuted ? '已静音' : `${bgmSegments.filter(s => s.url).length}/${bgmSegments.length} 段`) : '—' }}</span>
              <svg v-if="timelineBgmMuted" class="w-3 h-3 flex-shrink-0 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15zM17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2"/></svg>
              <svg v-else class="w-3 h-3 flex-shrink-0 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"/></svg>
            </div>
          </div>

          <!-- Screen recording -->
          <button
            class="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors"
            :class="timelineRecording
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'"
            @click="timelineToggleRecording"
          >
            <svg v-if="timelineRecording" class="w-4 h-4 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
            <svg v-else class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="6" />
            </svg>
            {{ timelineRecording ? '停止录制 (保存 WebM)' : '录制屏幕' }}
          </button>

          <p class="text-[10px] text-gray-400 dark:text-gray-600">{{ timelineOrderedShots.length }} 个镜头 · 拖拽行调整顺序</p>
        </div>
      </Teleport>
    </div>

    <!-- ==============================
         导出 Tab
         ============================== -->
    <div v-if="activeTab === 'export' && !tabLoading" class="space-y-4">
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
/* ── 全屏时控制栏常驻显示（不依赖 scoped，class 选择器正常工作）─── */
.timeline-preview:fullscreen .timeline-overlay,
.timeline-preview:-webkit-full-screen .timeline-overlay,
.timeline-preview:-moz-full-screen .timeline-overlay {
  opacity: 1 !important;
}
/* 全屏时让 rounded 和 overflow 生效 */
.timeline-preview:fullscreen,
.timeline-preview:-webkit-full-screen {
  border-radius: 0;
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

<!-- Ken Burns keyframes must be in a non-scoped block:
     scoped CSS renames @keyframes (e.g. kb-zoom-in → kb-zoom-in-[hash]),
     but inline styles from JS still reference the original names. -->
<style>
/* ── 基础缩放 ─────────────────────────────────────── */
@keyframes kb-zoom-in {
  from { transform: scale(1.0); }
  to   { transform: scale(1.2); }
}
@keyframes kb-zoom-out {
  from { transform: scale(1.2); }
  to   { transform: scale(1.0); }
}

/* ── 纯平移（带轻微缩放以保证无黑边）──────────────── */
@keyframes kb-pan-left {
  from { transform: scale(1.12) translateX(5%); }
  to   { transform: scale(1.12) translateX(-5%); }
}
@keyframes kb-pan-right {
  from { transform: scale(1.12) translateX(-5%); }
  to   { transform: scale(1.12) translateX(5%); }
}
@keyframes kb-pan-up {
  from { transform: scale(1.12) translateY(5%); }
  to   { transform: scale(1.12) translateY(-5%); }
}
@keyframes kb-pan-down {
  from { transform: scale(1.12) translateY(-5%); }
  to   { transform: scale(1.12) translateY(5%); }
}

/* ── 四角放大（视觉焦点向角落移动）─────────────────── */
@keyframes kb-zoom-tl {
  from { transform: scale(1.0) translate(5%, 4%); }
  to   { transform: scale(1.2) translate(-2%, -2%); }
}
@keyframes kb-zoom-tr {
  from { transform: scale(1.0) translate(-5%, 4%); }
  to   { transform: scale(1.2) translate(2%, -2%); }
}
@keyframes kb-zoom-bl {
  from { transform: scale(1.0) translate(5%, -4%); }
  to   { transform: scale(1.2) translate(-2%, 2%); }
}
@keyframes kb-zoom-br {
  from { transform: scale(1.0) translate(-5%, -4%); }
  to   { transform: scale(1.2) translate(2%, 2%); }
}

/* ── 对角漂移（缩小+对角滑动，电影感强）────────────── */
@keyframes kb-drift-diag {
  from { transform: scale(1.15) translate(-4%, -3%); }
  to   { transform: scale(1.05) translate(4%, 3%); }
}

/* ── 慢速全景展开（从中心向外扩散）─────────────────── */
@keyframes kb-slow-reveal {
  0%   { transform: scale(1.3); }
  40%  { transform: scale(1.15) translateX(-3%); }
  100% { transform: scale(1.0) translateX(0); }
}
</style>
