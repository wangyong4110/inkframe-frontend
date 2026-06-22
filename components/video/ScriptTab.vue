<script setup lang="ts">
import type { StoryboardShot, VideoQualityTier, Character, SceneAnchor } from '~/types'
import { SHOT_STATUS_LABELS, SHOT_STATUS_COLORS, QUALITY_LABELS, QUALITY_COLORS, TRANSITION_OPTIONS } from '~/constants/status'
import { parseSfxTags } from '~/utils/video'
import StoryboardReviewPanel from '~/components/video/StoryboardReviewPanel.vue'

const props = defineProps<{ videoId: number; llmProvider?: string }>()

const { url: lightboxUrl, openLightbox } = useImageLightbox()
const { editImage } = useImageEditApi()
const videoStore = useVideoStore()
const novelStore = useNovelStore()
const sceneAnchorStore = useSceneAnchorStore()
const characterStore = useCharacterStore()
const chapterStore = useChapterStore()
const characterApi = useCharacterApi()
const sceneAnchorApi = useSceneAnchorApi()
const toast = useToast()
const { guardAiProvider } = useAiProviderGuard()
const { confirm } = useConfirm()
const videoApi = useVideoApi()

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
// Maps shot.id → in-flight task_id for cancellation support
const shotTaskIds = ref<Record<number, string>>({})
// Tracks per-shot image generation in-flight (no server task_id needed for image gen)
const generatingShotImageIds = ref<Record<number, boolean>>({})

const confirmingScript = ref(false)
const editingId = ref<number | null>(null)
const editForm = ref<Partial<StoryboardShot & { emotional_tone: string }>>({})
const savingEdit = ref(false)

const anchors = computed(() => sceneAnchorStore.anchors)
const characters = computed(() => characterStore.characters)
// Pre-computed map for O(1) character lookups by id in the template.
// Replaces repeated characters.find(c => c.id === charId) calls inside nested v-for loops.
const characterById = computed(() => {
  const map = new Map<number, (typeof characters.value)[0]>()
  for (const c of characters.value) map.set(c.id, c)
  return map
})
// Pre-computed map for O(1) anchor lookups by id in the template.
// Replaces repeated anchors.find(a => a.id === ...) calls in the production shot cards.
const anchorById = computed(() => {
  const map = new Map<number, (typeof anchors.value)[0]>()
  for (const a of anchors.value) map.set(a.id, a)
  return map
})
// Chapter-bound characters and anchors for dropdown filtering.
// When a video is bound to a chapter, dropdowns only show items bound to that chapter.
// Falls back to all novel-level items if no chapter bindings exist.
const chapterBoundCharacters = ref<Character[]>([])
const chapterBoundAnchors = ref<SceneAnchor[]>([])
const chapterBoundLoaded = ref(false)

async function fetchChapterBoundItems() {
  const v = video.value
  if (!v?.novel_id || !v?.chapter_id) {
    chapterBoundLoaded.value = true
    return
  }
  let no = chapterStore.chapters.find(c => c.id === v.chapter_id)?.chapter_no
  if (!no) {
    await chapterStore.fetchChapters(v.novel_id)
    no = chapterStore.chapters.find(c => c.id === v.chapter_id)?.chapter_no
  }
  if (!no) {
    chapterBoundLoaded.value = true
    return
  }
  try {
    const [charsRes, anchorsRes] = await Promise.all([
      characterApi.getEffectiveCharacters(v.novel_id, no),
      sceneAnchorApi.listChapterAnchors(v.novel_id, no),
    ])
    chapterBoundCharacters.value = (charsRes.data ?? []) as Character[]
    chapterBoundAnchors.value = (anchorsRes.data ?? []) as SceneAnchor[]
  } catch {
    // fall back to all novel-level items
  }
  chapterBoundLoaded.value = true
}

watch(video, fetchChapterBoundItems, { immediate: true })

// Dropdown-specific lists — chapter-filtered when bindings exist, full list otherwise.
const dropdownAnchors = computed(() =>
  chapterBoundLoaded.value && chapterBoundAnchors.value.length > 0
    ? chapterBoundAnchors.value
    : anchors.value
)

// Pre-computed map for O(1) unassigned-character lookups per shot.
// Uses chapter-bound characters when available so the dropdown stays scoped to the chapter.
const unassignedCharsMap = computed(() => {
  const allChars = chapterBoundLoaded.value && chapterBoundCharacters.value.length > 0
    ? chapterBoundCharacters.value
    : characters.value
  const result = new Map<number, (typeof allChars)[0][]>()
  for (const shot of shots.value) {
    const assignedIds = new Set(shot.character_ids ?? [])
    result.set(shot.id, allChars.filter(c => !assignedIds.has(c.id)))
  }
  return result
})
// Kept as fallback for any ad-hoc call outside the main v-for loop.
function unassignedCharacters(shot: StoryboardShot) {
  const assigned = new Set(shot.character_ids ?? [])
  const pool = chapterBoundLoaded.value && chapterBoundCharacters.value.length > 0
    ? chapterBoundCharacters.value
    : characters.value
  return pool.filter(c => !assigned.has(c.id))
}

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
  { value: 'slow' as const,   label: '慢',   hint: '≈8s/镜' },
  { value: 'normal' as const, label: '标准', hint: '≈5s/镜' },
  { value: 'fast' as const,   label: '快',   hint: '≈3s/镜' },
]
const durationPresets = [
  { value: 0,   label: '自动' },
  { value: 30,  label: '30秒' },
  { value: 60,  label: '1分' },
  { value: 120, label: '2分' },
  { value: 180, label: '3分' },
  { value: 300, label: '5分' },
  { value: 600, label: '10分' },
  { value: 900, label: '15分' },
]
const showCustomDuration = ref(false)
const customDurationMins = ref(5)

function selectDurationPreset(val: number) {
  targetDuration.value = val
  showCustomDuration.value = false
}
function applyCustomDuration() {
  const secs = Math.max(0, Math.round(customDurationMins.value * 60))
  targetDuration.value = secs
}
// Track if current value matches any preset
const durationIsCustom = computed(() =>
  !durationPresets.some(d => d.value === targetDuration.value)
)
// When user types in custom input, apply immediately
watch(customDurationMins, applyCustomDuration)

const avgShotDur = computed(() => ({ slow: 8, normal: 5, fast: 3 }[pacing.value] ?? 5))
const estimatedShots = computed(() =>
  targetDuration.value > 0
    ? Math.max(3, Math.round(targetDuration.value / avgShotDur.value))
    : null
)
const estimatedShotsSummary = computed(() => {
  if (!estimatedShots.value) return 'AI 自动决定镜头数'
  const mins = Math.floor(targetDuration.value / 60)
  const secs = targetDuration.value % 60
  const timeStr = mins > 0
    ? (secs > 0 ? `${mins}分${secs}秒` : `${mins}分钟`)
    : `${secs}秒`
  return `预计约 ${estimatedShots.value} 个镜头 · ${timeStr}`
})

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
  { value: 'static',     label: '固定' },
  { value: 'push',       label: '推镜' },
  { value: 'pull',       label: '拉镜' },
  { value: 'pan',        label: '摇镜' },
  { value: 'track',      label: '移镜' },
  { value: 'crane_up',   label: '升镜' },
  { value: 'crane_down', label: '降镜' },
  { value: 'follow',     label: '跟镜' },
  { value: 'arc',        label: '环绕' },
  { value: 'tilt',       label: '俯仰' },
  { value: 'whip_pan',   label: '甩镜' },
  { value: 'zoom',       label: '变焦' },
]
const SHOT_SIZE_LABEL: Record<string, string> = Object.fromEntries(SHOT_SIZE_OPTIONS.map(o => [o.value, o.label]))
const CAMERA_ANGLE_LABEL: Record<string, string> = Object.fromEntries(CAMERA_ANGLE_OPTIONS.map(o => [o.value, o.label]))
const CAMERA_TYPE_LABEL: Record<string, string> = Object.fromEntries(CAMERA_TYPE_OPTIONS.map(o => [o.value, o.label]))
const TRANSITION_LABEL: Record<string, string> = Object.fromEntries(TRANSITION_OPTIONS.map(o => [o.value, o.label]))

// ── Review panel ref ──
const reviewPanelRef = ref<{ startReview: () => void } | null>(null)
const showReviewPanel = ref(false)
const reviewPanelMounted = ref(false)
// reviewing = panel is open (disable the button while panel is visible)
const reviewing = computed(() => showReviewPanel.value)

function openReviewPanel() {
  reviewPanelMounted.value = true
  showReviewPanel.value = true
}

// ── Voice text inline edit (shared with voice tab context) ──
const editingVoiceTextId = ref<number | null>(null)
const editingVoiceTextType = ref<'narration' | 'dialogue'>('narration')
const voiceTextDraft = ref('')
const savingVoiceText = ref(false)

// ── Shot insert ──
const insertingShotAfter = ref<number | null>(null)
const insertShotForm = reactive({ narration: '', description: '', duration: 4 })
const insertingShotLoading = ref(false)

// ── Pagination ──
const { currentPage, totalPages, pagedShots, pageNumbers } = useShotsPagination(shots)
const PAGE_SIZE = 15 // kept for handleInsertShot page jump calculation

// ── Debounced storyboard refresh ──
// Replaces redundant per-mutation fetchStoryboard calls with a single
// debounced fetch so rapid mutations (insert/copy/delete) only trigger one request.
let _refreshTimer: ReturnType<typeof setTimeout> | null = null
function scheduleRefresh() {
  if (_refreshTimer) clearTimeout(_refreshTimer)
  _refreshTimer = setTimeout(() => {
    videoStore.fetchStoryboard(props.videoId)
    _refreshTimer = null
  }, 300)
}

// ── Drag-to-reorder (script mode only) ──
const dragShotId = ref<number | null>(null)

function onDragStart(e: DragEvent, shotId: number) {
  dragShotId.value = shotId
  e.dataTransfer?.setData('text/plain', String(shotId))
}

function onDragOver(e: DragEvent) {
  e.preventDefault()
}

async function onDrop(e: DragEvent, targetShotId: number) {
  e.preventDefault()
  if (!dragShotId.value || dragShotId.value === targetShotId) {
    dragShotId.value = null
    return
  }
  const fromId = dragShotId.value
  dragShotId.value = null
  try {
    await videoApi.reorderShot(props.videoId, fromId, targetShotId)
    scheduleRefresh()
  } catch (e: any) {
    toast.error('排序失败：' + (e?.message || ''))
  }
}

function startEdit(shot: StoryboardShot) {
  editingId.value = shot.id
  editForm.value = {
    description: shot.description,
    prompt: shot.prompt || '',
    narration: shot.narration,
    dialogue: shot.dialogue,
    shot_size: shot.shot_size,
    camera_angle: shot.camera_angle,
    camera_type: shot.camera_type,
    duration: shot.duration,
    transition: shot.transition || 'cut',
    sfx_tags: shot.sfx_tags || '',
    sfx_volume: shot.sfx_volume ?? 0,
    motion_prompt: shot.motion_prompt || '',
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

const modeUpdating = ref(false)
async function handleToggleMode(newMode: string) {
  modeUpdating.value = true
  try {
    await videoStore.updateVideo(props.videoId, { mode: newMode })
    await videoStore.fetchVideo(props.videoId)
  } catch (e: any) {
    toast.error(e.message || '切换模式失败')
  } finally {
    modeUpdating.value = false
  }
}

const { generateStoryboard: _generateStoryboard } = useStoryboardGeneration()

async function handleGenerateStoryboard(userPrompt?: string) {
  if (!await guardAiProvider('LLM')) return
  const novel = novelStore.currentNovel
  const effectiveMaxTokens = advMaxTokens.value || novel?.max_tokens || undefined
  const effectiveTemperature = advTemperature.value || novel?.temperature || undefined
  const effectiveTimeout = advTimeoutSeconds.value || novel?.timeout_seconds || undefined
  await _generateStoryboard({
    videoId: props.videoId,
    provider: props.llmProvider || undefined,
    userPrompt,
    pacing: pacing.value,
    targetDuration: targetDuration.value,
    maxTokens: effectiveMaxTokens,
    temperature: effectiveTemperature,
    timeoutSeconds: effectiveTimeout,
    voiceMode: voiceMode.value,
  })
}

function handleReviewStoryboard() {
  openReviewPanel()
}

async function doGenerateShot(shot: StoryboardShot) {
  try {
    const res = await videoStore.generateShot(props.videoId, shot.id, selectedVideoProvider.value || undefined)
    const taskId = res?.task_id
    if (!taskId) { toast.error('生成失败：未获取到任务ID'); return }
    shotTaskIds.value[shot.id] = taskId
    toast.info(`镜头 #${shot.shot_no} 素材生成中…`)
    const taskStore = useTaskStore()
    taskStore.trackTask(taskId, async (task) => {
      delete shotTaskIds.value[shot.id]
      if (task.status === 'completed') {
        await videoStore.fetchStoryboard(props.videoId)
        toast.success(`镜头 #${shot.shot_no} 素材已生成`)
      } else if (task.status !== 'cancelled') {
        toast.error(`镜头 #${shot.shot_no} 生成失败`)
      }
    })
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || ''))
  }
}

async function handleGenerateShot(shot: StoryboardShot) {
  if (!await guardAiProvider('VIDEO')) return
  if (confirmMissingThreeView(() => doGenerateShot(shot), [shot.id])) return
  await doGenerateShot(shot)
}

async function doGenerateShotImage(shot: StoryboardShot) {
  generatingShotImageIds.value[shot.id] = true
  try {
    const taskId = await videoStore.batchGenerateShotImages(props.videoId, [shot.id], !!shot.image_url)
    if (!taskId) {
      delete generatingShotImageIds.value[shot.id]
      toast.error('生成失败：未获取到任务ID')
      return
    }
    toast.info(`镜头 #${shot.shot_no} 图片生成中…`)
    const taskStore = useTaskStore()
    taskStore.trackTask(taskId, async (task) => {
      delete generatingShotImageIds.value[shot.id]
      if (task.status === 'completed') {
        await videoStore.fetchStoryboard(props.videoId)
        toast.success(`镜头 #${shot.shot_no} 图片已生成`)
      } else if (task.status !== 'cancelled') {
        toast.error(`镜头 #${shot.shot_no} 图片生成失败`)
      }
    })
  } catch (e: any) {
    delete generatingShotImageIds.value[shot.id]
    toast.error('图片生成失败：' + (e.message || ''))
  }
}

async function handleGenerateShotImage(shot: StoryboardShot) {
  if (!await guardAiProvider('IMAGE')) return
  if (confirmMissingThreeView(() => doGenerateShotImage(shot), [shot.id])) return
  await doGenerateShotImage(shot)
}

async function handleStopShot(shot: StoryboardShot) {
  const taskId = shotTaskIds.value[shot.id] || shot.shot_task_id
  if (!taskId) {
    // No task ID — just reset status directly
    await videoStore.updateShot(props.videoId, shot.id, { status: 'pending' })
    toast.info(`镜头 #${shot.shot_no} 已停止`)
    return
  }
  try {
    const taskStore = useTaskStore()
    await taskStore.cancelTask(taskId)
    delete shotTaskIds.value[shot.id]
    await videoStore.updateShot(props.videoId, shot.id, { status: 'pending' })
    toast.info(`镜头 #${shot.shot_no} 已停止，可重新生成`)
  } catch (e: any) {
    toast.error('停止失败：' + (e.message || ''))
  }
}

async function handleGenerateAll() {
  if (!await guardAiProvider('VIDEO')) return
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
    }, () => videoStore.fetchStoryboard(props.videoId))
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
    const res = await videoApi.uploadShotImage(props.videoId, shotId, file)
    const ossUrl = res?.data?.image_url || localUrl
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

function saveShotImage(shot: StoryboardShot, newUrl: string) {
  const idx = videoStore.storyboard.findIndex(s => s.id === shot.id)
  if (idx >= 0) videoStore.storyboard[idx].image_url = newUrl
  videoApi.updateShotImageUrl(props.videoId, shot.id, newUrl).catch(() => {})
}

async function doGenerateImages(pending: StoryboardShot[]) {
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
    }, () => videoStore.fetchStoryboard(props.videoId))
  } catch (e: any) {
    toast.error('图片生成失败：' + (e.message || ''))
    batchGeneratingImages.value = false
  }
}

async function handleGenerateImages() {
  if (batchGeneratingImages.value) return
  if (!await guardAiProvider('IMAGE')) return
  if (generatingStoryboard.value) {
    toast.error('分镜脚本正在生成中，请等待完成后再生成图片')
    return
  }
  const pending = shots.value.filter(s => !s.image_url && s.status !== 'generating' && (s.status === 'pending' || s.status === 'failed' || s.status === 'completed'))
  if (pending.length === 0) { toast.error('没有需要生成图片的镜头'); return }
  if (confirmMissingThreeView(() => doGenerateImages(pending), pending.map(s => s.id))) return
  await doGenerateImages(pending)
}

async function handleGenerateClips() {
  if (!await guardAiProvider('VIDEO')) return
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
    }, () => videoStore.fetchStoryboard(props.videoId))
  } catch (e: any) {
    toast.error('视频生成失败：' + (e.message || ''))
    batchGeneratingClips.value = false
  }
}

async function handleSetShotAnchor(shot: StoryboardShot, anchorId: number | null) {
  try {
    const api = useSceneAnchorApi()
    await api.setShotAnchor(props.videoId, shot.id, anchorId)
    scheduleRefresh()
  } catch (e: any) {
    toast.error('绑定失败：' + (e.message || ''))
  }
}

async function handleSetShotCharacters(shot: StoryboardShot, characterIds: number[]) {
  try {
    await videoApi.setShotCharacters(props.videoId, shot.id, characterIds)
    scheduleRefresh()
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
    await videoApi.insertShot(props.videoId, afterShotNo, insertShotForm.narration, insertShotForm.description, insertShotForm.duration)
    insertingShotAfter.value = null
    insertShotForm.narration = ''
    insertShotForm.description = ''
    insertShotForm.duration = 4
    // Navigate to the page that will contain the new shot
    currentPage.value = Math.ceil((afterShotNo + 1) / PAGE_SIZE)
    scheduleRefresh()
    toast.success('镜头已插入')
  } catch (e: any) {
    toast.error('插入失败：' + (e.message || ''))
  } finally {
    insertingShotLoading.value = false
  }
}

async function handleCopyShot(shot: StoryboardShot) {
  try {
    await videoApi.copyShot(props.videoId, shot.id, -1)
    scheduleRefresh()
    toast.success('镜头已复制')
  } catch (e: any) {
    toast.error('复制失败：' + (e.message || ''))
  }
}

async function handleDeleteShot(shot: StoryboardShot) {
  if (!confirm(`确认删除镜头 #${shot.shot_no}？此操作不可撤销。`)) return
  try {
    await videoApi.deleteShot(props.videoId, shot.id)
    scheduleRefresh()
    toast.success('镜头已删除')
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || ''))
  }
}

function shotKlingMode(shot: StoryboardShot): 'pro' | 'std' {
  const emotion = ((shot as any).emotional_tone || '').toLowerCase()
  const camera = (shot.camera_type || '').toLowerCase()
  if (
    emotion.includes('battle') || emotion.includes('战斗') || emotion.includes('打斗') ||
    emotion.includes('action') || emotion.includes('fight') ||
    emotion.includes('epic') || emotion.includes('史诗') ||
    emotion.includes('宏大') || emotion.includes('壮观') ||
    emotion.includes('climax') || emotion.includes('高潮')
  ) {
    return 'pro'
  }
  return 'std'
}

async function exportSubtitles() {
  const { requestBlob } = useApi()
  try {
    const blob = await requestBlob(`/videos/${props.videoId}/subtitles/export`, { method: 'POST' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `video_${props.videoId}_subtitles.ass`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('字幕已导出')
  } catch (e: any) {
    toast.error('字幕导出失败：' + (e.message || '未知错误'))
  }
}

onBeforeUnmount(() => {
  if (_refreshTimer) {
    clearTimeout(_refreshTimer)
    _refreshTimer = null
  }
})

// ── 三视图缺失检查 ────────────────────────────────────────────────────────────
const router = useRouter()
const showMissingThreeViewModal = ref(false)
const missingThreeViewChars = ref<{ id: number; name: string }[]>([])
let _pendingGenerateAction: (() => void) | null = null

function collectMissingThreeView(shotIds: number[]): { id: number; name: string }[] {
  const targetShots = shots.value.filter(s => shotIds.includes(s.id))
  const seen = new Set<number>()
  const missing: { id: number; name: string }[] = []
  for (const shot of targetShots) {
    for (const charId of (shot.character_ids ?? [])) {
      if (seen.has(charId)) continue
      seen.add(charId)
      const char = characterById.value.get(charId)
      if (char && !char.default_look?.three_view_sheet) {
        missing.push({ id: charId, name: char.name })
      }
    }
  }
  return missing
}

function confirmMissingThreeView(action: () => void, shotIds: number[]): boolean {
  const missing = collectMissingThreeView(shotIds)
  if (missing.length === 0) return false
  missingThreeViewChars.value = missing
  _pendingGenerateAction = action
  showMissingThreeViewModal.value = true
  return true
}

function proceedGenerateAnyway() {
  showMissingThreeViewModal.value = false
  _pendingGenerateAction?.()
  _pendingGenerateAction = null
}

function goToCharacterLooks(charId: number) {
  const novelId = video.value?.novel_id
  router.push(`/character/${charId}?tab=looks${novelId ? `&novelId=${novelId}` : ''}`)
}

// ── Video preview modal ──
const previewVideoUrl = ref<string | null>(null)
const previewVideoShotNo = ref<number | null>(null)

function openVideoPreview(shot: StoryboardShot) {
  previewVideoUrl.value = shot.video_url || null
  previewVideoShotNo.value = shot.shot_no
}

function closeVideoPreview() {
  previewVideoUrl.value = null
  previewVideoShotNo.value = null
}

// Expose for parent
defineExpose({ loadVideoProviders: async () => {
  const res = await videoApi.getVideoProviders()
  videoProviders.value = res?.data ?? []
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
        :disabled="modeUpdating"
        @click="handleToggleMode(video?.mode === 'slideshow' ? 'video' : 'slideshow')"
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
        <button
          class="btn-secondary text-sm"
          title="导出 ASS 字幕文件"
          @click="exportSubtitles"
        >
          <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
          导出字幕
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
      <p class="text-sm text-gray-400 dark:text-gray-500">
        点击右侧「生成分镜脚本」，AI 将自动从章节内容提取镜头<br>
        生成后可逐条编辑，确认无误再生成素材
      </p>
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
        <template v-for="(shot, shotIdx) in pagedShots" :key="shot.id">
        <div class="flex items-start gap-2">
          <span class="w-7 text-right text-xs font-medium text-gray-400 dark:text-gray-500 flex-shrink-0 select-none pt-3">#{{ shot.shot_no }}</span>
          <div
            class="card overflow-hidden flex-1"
            :class="[dragShotId === shot.id ? 'opacity-40' : '', shotIdx % 2 === 1 ? 'shot-card-alt' : '']"
            :draggable="editingId !== shot.id"
            @dragstart="onDragStart($event, shot.id)"
            @dragover="onDragOver"
            @drop="onDrop($event, shot.id)"
            @dragend="dragShotId = null"
          >
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
              <label class="block text-xs font-medium text-gray-500 mb-1">图片生成提示词<span class="ml-1 text-blue-500 font-normal">（实际用于AI生图）</span></label>
              <textarea v-model="editForm.prompt" rows="3" class="input text-sm resize-none font-mono" placeholder="English structured image prompt — leave empty to use auto-generated prompt from storyboard AI..." />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">画面描述<span class="ml-1 text-gray-400 font-normal">（叙事参考）</span></label>
              <textarea v-model="editForm.description" rows="2" class="input text-sm resize-none font-mono" placeholder="场景画面描述（供参考，不直接用于生图）" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">视频提示词</label>
              <textarea
                v-model="editForm.motion_prompt"
                rows="2"
                class="input text-sm resize-none font-mono"
                placeholder="视频生成提示词（Kling/Seedance），留空则自动生成"
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">旁白文案（用于TTS和字幕）</label>
              <textarea v-model="editForm.narration" rows="2" class="input text-sm resize-none" placeholder="观众听到的旁白内容，不含镜头语言..." />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">角色台词（格式：角色名：台词内容）</label>
              <textarea v-model="editForm.dialogue" rows="2" class="input text-sm resize-none" placeholder="凌云：你敢再说一遍！（无对话可留空）" />
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
              <div class="flex items-center gap-1.5 flex-shrink-0">
                <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 tabular-nums">
                  Shot {{ String(shot.shot_no).padStart(2, '0') }}
                </span>
                <!-- Kling 模式徽标 -->
                <span
                  v-if="shotKlingMode(shot) === 'pro'"
                  class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                  title="此镜头将使用 Kling Pro 模式（更高画质）"
                >
                  PRO
                </span>
              </div>
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
            <p v-if="shot.prompt" class="text-xs text-gray-400 dark:text-gray-500 mb-1.5 truncate" :title="shot.prompt">
              <span class="text-blue-400 dark:text-blue-500 mr-1">img:</span>{{ shot.prompt }}
            </p>
            <p v-else-if="shot.narration && shot.description" class="text-xs text-gray-400 dark:text-gray-500 mb-1.5 truncate" :title="shot.description">
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
            <!-- Failed status: error detail + retry button -->
            <div v-if="shot.status === 'failed'" class="mt-2 flex items-start gap-2">
              <p v-if="shot.error_message" class="text-xs text-red-500 mt-1 truncate flex-1" :title="shot.error_message">
                {{ shot.error_message }}
              </p>
              <button
                class="text-xs py-0.5 px-2 rounded border border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
                @click="handleGenerateShot(shot)"
              >
                重试
              </button>
            </div>

            <!-- Scene anchor row -->
            <div class="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex items-center gap-3 flex-wrap">
              <span class="text-xs text-gray-400 flex-shrink-0">📍 场景</span>
              <select
                :value="shot.scene_anchor_id || ''"
                class="input text-xs py-0.5 h-6 flex-1 min-w-0 max-w-[180px]"
                @change="handleSetShotAnchor(shot, ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null)"
              >
                <option value="">不绑定</option>
                <option v-for="anchor in dropdownAnchors" :key="anchor.id" :value="anchor.id">{{ anchor.name }}</option>
              </select>
              <template v-if="shot.scene_anchor_id">
                <div class="flex-1 flex items-center gap-1.5 min-w-0">
                  <div class="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all"
                      :class="{
                        'bg-green-400': (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) >= 0.85,
                        'bg-amber-400': (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) >= 0.70 && (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) < 0.85,
                        'bg-red-400': (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) > 0 && (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) < 0.70,
                        'bg-gray-300': (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) === 0,
                      }"
                      :style="{ width: `${Math.min(100, ((anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) * 100))}%` }"
                    />
                  </div>
                  <span class="text-xs flex-shrink-0"
                    :class="{
                      'text-green-500': (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) >= 0.85,
                      'text-amber-500': (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) >= 0.70 && (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) < 0.85,
                      'text-red-500': (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) > 0 && (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) < 0.70,
                      'text-gray-400': (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) === 0,
                    }"
                  >
                    {{ (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) > 0
                      ? (anchorById.get(shot.scene_anchor_id!)!.avg_cons_score).toFixed(2)
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
                <span
                  class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs"
                  :class="characterById.get(charId)?.default_look?.three_view_sheet
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'"
                  :title="characterById.get(charId)?.default_look?.three_view_sheet ? '' : '该角色缺少三视图，生成图片时将不包含角色形象'"
                >
                  <img
                    v-if="characterById.get(charId)?.default_look?.portrait"
                    :src="characterById.get(charId)!.default_look!.portrait"
                    loading="lazy"
                    class="w-3 h-3 rounded-full object-cover"
                  />
                  <svg v-else-if="!characterById.get(charId)?.default_look?.three_view_sheet" class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  {{ characterById.get(charId)?.name || charId }}
                  <button class="hover:text-red-400 ml-0.5 leading-none" :class="characterById.get(charId)?.default_look?.three_view_sheet ? 'text-blue-400' : 'text-orange-400'" @click="removeCharFromShot(shot, charId)">×</button>
                </span>
              </template>
              <select class="input text-xs py-0.5 h-6 max-w-[140px]" @change="addCharToShot(shot, $event)">
                <option value="">+ 绑定角色</option>
                <option
                  v-for="c in (unassignedCharsMap.get(shot.id) ?? [])"
                  :key="c.id"
                  :value="c.id"
                >{{ c.name }}</option>
              </select>
            </div>
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
          <textarea v-model="insertShotForm.description" rows="2" class="input text-sm resize-none font-mono" placeholder="画面描述（用于 AI 生图）" />
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
        <div v-for="(shot, shotIdx) in pagedShots" :key="shot.id" class="flex items-start gap-2">
          <span class="w-7 text-right text-xs font-medium text-gray-400 dark:text-gray-500 flex-shrink-0 select-none pt-3">#{{ shot.shot_no }}</span>
          <div class="card p-3 flex-1" :class="shotIdx % 2 === 1 ? 'shot-card-alt' : ''">
          <div class="flex gap-3">
            <!-- Thumbnail -->
            <div class="group/thumb w-28 flex-shrink-0 rounded-lg overflow-hidden bg-gray-900 flex items-center justify-center relative" style="min-height: 72px;">
              <div v-if="uploadingShotId === shot.id" class="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
                <div class="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
              <template v-if="shot.image_url">
                <img :src="shot.image_url" loading="lazy" class="w-full h-full object-cover cursor-zoom-in" @click.stop="openLightbox(shot.image_url, (currentUrl, s) => editImage(currentUrl, s, video?.novel_id), (u) => saveShotImage(shot, u))" />
                <!-- Video preview button overlay -->
                <button
                  v-if="shot.video_url && uploadingShotId !== shot.id"
                  class="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover/thumb:opacity-100 transition-opacity z-10"
                  title="预览视频"
                  @click.stop="openVideoPreview(shot)"
                >
                  <div class="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-md">
                    <svg class="w-4 h-4 text-gray-800 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </button>
                <button
                  v-else-if="uploadingShotId !== shot.id"
                  class="absolute bottom-1 right-1 p-1 rounded bg-black/40 text-white opacity-0 group-hover/thumb:opacity-100 hover:bg-black/70 transition-all z-10"
                  title="重新上传图片"
                  @click.stop="triggerShotImageUpload(shot.id)"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </button>
              </template>
              <div v-else-if="shot.status === 'generating'" class="p-2 flex flex-col items-center justify-center gap-1.5 w-full h-full">
                <div class="w-6 h-6 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
                <button
                  class="text-[10px] px-2 py-0.5 rounded border border-red-400 text-red-400 hover:bg-red-500/10 transition-colors leading-none"
                  title="停止生成"
                  @click.stop="handleStopShot(shot)"
                >
                  停止
                </button>
              </div>
              <button
                v-else-if="shot.video_url"
                class="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                title="预览视频"
                @click.stop="openVideoPreview(shot)"
              >
                <div class="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                  <svg class="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
                <span class="text-[10px] leading-none">预览视频</span>
              </button>
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
                  <div class="flex items-center gap-1.5">
                    <button
                      v-if="shot.video_url"
                      class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800/60 transition-colors"
                      title="点击预览视频"
                      @click.stop="openVideoPreview(shot)"
                    >
                      <svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      视频
                    </button>
                    <span class="px-2 py-0.5 text-xs font-medium rounded-full" :class="SHOT_STATUS_COLORS[shot.status]">
                      {{ SHOT_STATUS_LABELS[shot.status] }}
                    </span>
                  </div>
                  <!-- Kling 模式徽标 -->
                  <span
                    v-if="shotKlingMode(shot) === 'pro'"
                    class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                    title="此镜头将使用 Kling Pro 模式（更高画质）"
                  >
                    PRO
                  </span>
                  <span
                    v-if="shot.status === 'failed' && shot.error_message"
                    class="text-[10px] text-red-400 dark:text-red-500 max-w-[160px] text-right leading-snug"
                    :title="shot.error_message"
                  >
                    {{ shot.error_message.length > 60 ? shot.error_message.slice(0, 60) + '…' : shot.error_message }}
                  </span>
                </div>
              </div>
            </div>
          </div>
          <!-- Scene + Character rows -->
          <div class="mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex flex-col gap-1">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xs text-gray-400 flex-shrink-0">📍 场景</span>
              <select
                :value="shot.scene_anchor_id || ''"
                class="input text-xs py-0.5 h-6 min-w-0 max-w-[180px]"
                @change="handleSetShotAnchor(shot, ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null)"
              >
                <option value="">不绑定</option>
                <option v-for="anchor in dropdownAnchors" :key="anchor.id" :value="anchor.id">{{ anchor.name }}</option>
              </select>
              <template v-if="shot.scene_anchor_id">
                <div class="flex items-center gap-1.5 min-w-0">
                  <div class="w-16 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all"
                      :class="{
                        'bg-green-400': (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) >= 0.85,
                        'bg-amber-400': (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) >= 0.70 && (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) < 0.85,
                        'bg-red-400': (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) > 0 && (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) < 0.70,
                        'bg-gray-300': (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) === 0,
                      }"
                      :style="{ width: `${Math.min(100, ((anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) * 100))}%` }"
                    />
                  </div>
                  <span class="text-xs flex-shrink-0"
                    :class="{
                      'text-green-500': (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) >= 0.85,
                      'text-amber-500': (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) >= 0.70 && (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) < 0.85,
                      'text-red-500': (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) > 0 && (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) < 0.70,
                      'text-gray-400': (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) === 0,
                    }"
                  >
                    {{ (anchorById.get(shot.scene_anchor_id!)?.avg_cons_score ?? 0) > 0
                      ? (anchorById.get(shot.scene_anchor_id!)!.avg_cons_score).toFixed(2)
                      : '待评分'
                    }}
                  </span>
                </div>
              </template>
              <template v-if="shot.status !== 'generating'">
                <div class="ml-auto flex items-center gap-1.5 flex-shrink-0">
                  <button
                    class="text-[11px] py-0.5 px-2 rounded border border-blue-300 dark:border-blue-700 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors inline-flex items-center gap-1"
                    :class="{ 'opacity-50 cursor-not-allowed': generatingShotImageIds[shot.id] }"
                    :disabled="!!generatingShotImageIds[shot.id]"
                    @click="handleGenerateShotImage(shot)"
                  >
                    <svg v-if="generatingShotImageIds[shot.id]" class="w-3 h-3 animate-spin flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {{ generatingShotImageIds[shot.id] ? '生成中…' : (shot.image_url ? '重新生成图片' : '生成图片') }}
                  </button>
                  <button
                    class="text-[11px] py-0.5 px-2 rounded bg-primary-600 hover:bg-primary-700 text-white transition-colors inline-flex items-center gap-1"
                    :class="{ 'opacity-50 cursor-not-allowed': shotTaskIds[shot.id] }"
                    :disabled="!!shotTaskIds[shot.id]"
                    @click="handleGenerateShot(shot)"
                  >
                    <svg v-if="shotTaskIds[shot.id]" class="w-3 h-3 animate-spin flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    {{ shotTaskIds[shot.id] ? '生成中…' : (shot.video_url ? '重新生成视频' : '生成视频') }}
                  </button>
                </div>
              </template>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xs text-gray-400 flex-shrink-0">👤 角色</span>
              <template v-for="charId in (shot.character_ids || [])" :key="charId">
                <span
                  class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs"
                  :class="characterById.get(charId)?.default_look?.three_view_sheet
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300'"
                  :title="characterById.get(charId)?.default_look?.three_view_sheet ? '' : '该角色缺少三视图，生成图片时将不包含角色形象'"
                >
                  <img
                    v-if="characterById.get(charId)?.default_look?.portrait"
                    :src="characterById.get(charId)!.default_look!.portrait"
                    loading="lazy"
                    class="w-3 h-3 rounded-full object-cover"
                  />
                  <svg v-else-if="!characterById.get(charId)?.default_look?.three_view_sheet" class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  {{ characterById.get(charId)?.name || charId }}
                  <button class="hover:text-red-400 ml-0.5 leading-none" :class="characterById.get(charId)?.default_look?.three_view_sheet ? 'text-blue-400' : 'text-orange-400'" @click="removeCharFromShot(shot, charId)">×</button>
                </span>
              </template>
              <select class="input text-xs py-0.5 h-6 max-w-[140px]" @change="addCharToShot(shot, $event)">
                <option value="">+ 绑定角色</option>
                <option
                  v-for="c in (unassignedCharsMap.get(shot.id) ?? [])"
                  :key="c.id"
                  :value="c.id"
                >{{ c.name }}</option>
              </select>
            </div>
          </div>
          </div>
        </div>
      </template>

      <!-- ── Pagination ── -->
      <ShotsPaginationBar
        :current-page="currentPage"
        :total-pages="totalPages"
        :total-items="shots.length"
        :page-numbers="pageNumbers"
        @update:current-page="currentPage = $event"
      />
    </div>


    <!-- AI Review Panel (extracted component) -->
    <StoryboardReviewPanel
      v-if="reviewPanelMounted"
      ref="reviewPanelRef"
      :video-id="props.videoId"
      :llm-provider="props.llmProvider"
      :visible="showReviewPanel"
      @close="showReviewPanel = false"
    />

    <!-- 三视图缺失提示 Modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showMissingThreeViewModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-black/50" @click="showMissingThreeViewModal = false" />
          <div class="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6">
            <!-- Header -->
            <div class="flex items-start gap-3 mb-4">
              <div class="flex-shrink-0 w-9 h-9 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
                <svg class="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">部分角色缺少三视图</h3>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">以下角色没有生成三视图，图片生成时将无法使用角色参考图，人物形象可能不一致。</p>
              </div>
            </div>

            <!-- Character list -->
            <ul class="mb-5 space-y-2">
              <li
                v-for="char in missingThreeViewChars"
                :key="char.id"
                class="flex items-center justify-between px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800"
              >
                <span class="text-sm font-medium text-gray-800 dark:text-gray-200">{{ char.name }}</span>
                <button
                  class="text-xs text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-200 font-medium underline underline-offset-2"
                  @click="goToCharacterLooks(char.id)"
                >
                  去生成三视图 →
                </button>
              </li>
            </ul>

            <!-- Actions -->
            <div class="flex gap-3 justify-end">
              <button class="btn-secondary text-sm" @click="showMissingThreeViewModal = false">取消</button>
              <button class="btn-primary text-sm" @click="proceedGenerateAnyway">仍然生成</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Video preview modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="previewVideoUrl" class="fixed inset-0 z-50 flex items-center justify-center p-4" @click.self="closeVideoPreview">
          <div class="absolute inset-0 bg-black/75" @click="closeVideoPreview" />
          <div class="relative bg-black rounded-xl shadow-2xl overflow-hidden w-full max-w-2xl">
            <div class="flex items-center justify-between px-3 py-2 bg-gray-900/80">
              <span class="text-sm font-medium text-gray-300">镜头 #{{ previewVideoShotNo }} 视频预览</span>
              <button class="p-1 rounded hover:bg-gray-700 text-gray-400 hover:text-white transition-colors" @click="closeVideoPreview">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <video
              :key="previewVideoUrl"
              :src="previewVideoUrl"
              controls
              autoplay
              loop
              class="w-full max-h-[70vh] bg-black"
            />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.shot-card-alt {
  background-color: #e8edf5;
}
.dark .shot-card-alt {
  background-color: #1a2640;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
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
