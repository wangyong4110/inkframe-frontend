<script setup lang="ts">
import type { StoryboardShot, VideoQualityTier, Character, SceneAnchor } from '~/types'
import { QUALITY_LABELS, QUALITY_COLORS, TRANSITION_OPTIONS } from '~/constants/status'
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
const generatingStoryboard = computed(() => videoStore.generating)

const uploadingShotId = ref<number | null>(null)
const shotImageInputRef = ref<HTMLInputElement | null>(null)
const shotImageTargetId = ref<number | null>(null)
const editingId = ref<number | null>(null)
const generatingImageShotIds = ref<Set<number>>(new Set())
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

// ── Description inline edit ──
const editingDescriptionId = ref<number | null>(null)
const descriptionDraft = ref('')
const savingDescription = ref(false)

function startEditDescription(shot: StoryboardShot) {
  editingDescriptionId.value = shot.id
  descriptionDraft.value = shot.description || ''
}
function cancelEditDescription() {
  editingDescriptionId.value = null
  descriptionDraft.value = ''
}
async function saveDescription(shot: StoryboardShot) {
  savingDescription.value = true
  try {
    await videoStore.updateShot(props.videoId, shot.id, { description: descriptionDraft.value.trim() } as any)
    editingDescriptionId.value = null
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || ''))
  } finally {
    savingDescription.value = false
  }
}

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

function openShotLightbox(shot: StoryboardShot) {
  if (!shot.image_url) return
  openLightbox(shot.image_url)
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

async function handleGenerateShotImage(shot: StoryboardShot) {
  if (generatingImageShotIds.value.has(shot.id)) return
  if (!await guardAiProvider('IMAGE')) return
  generatingImageShotIds.value = new Set([...generatingImageShotIds.value, shot.id])
  try {
    const taskId = await videoStore.batchGenerateShotImages(props.videoId, [shot.id], !!shot.image_url)
    if (taskId) {
      useTaskStore().trackTask(taskId, async (task) => {
        generatingImageShotIds.value = new Set([...generatingImageShotIds.value].filter(id => id !== shot.id))
        if (task.status === 'completed') {
          await videoStore.fetchStoryboard(props.videoId)
          toast.success(`镜头 #${shot.shot_no} 图片已${shot.image_url ? '重新' : ''}生成`)
        } else if (task.status !== 'cancelled') {
          toast.error(`镜头 #${shot.shot_no} 图片生成失败`)
        }
      })
    } else {
      generatingImageShotIds.value = new Set([...generatingImageShotIds.value].filter(id => id !== shot.id))
      scheduleRefresh()
    }
  } catch (e: any) {
    toast.error('图片生成失败：' + (e?.message || ''))
    generatingImageShotIds.value = new Set([...generatingImageShotIds.value].filter(id => id !== shot.id))
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


onBeforeUnmount(() => {
  if (_refreshTimer) {
    clearTimeout(_refreshTimer)
    _refreshTimer = null
  }
})

defineExpose({ handleReviewStoryboard })
</script>

<template>
  <div>
    <!-- Toolbar -->
    <div class="flex items-center gap-2 mb-4">
      <!-- 生成进度 -->
      <span v-if="shots.length > 0" class="text-xs text-gray-400 dark:text-gray-500">
        生成进度 {{ shots.filter(s => s.image_url).length }} / {{ shots.length }}
      </span>
      <div class="flex-1" />
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

      <template v-for="(shot, shotIdx) in pagedShots" :key="shot.id">
          <div
            class="card overflow-hidden"
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
              <label class="block text-xs font-medium text-gray-500 mb-1">画面描述<span class="ml-1 text-gray-400 font-normal">（叙事参考）</span></label>
              <textarea v-model="editForm.description" rows="2" class="input text-sm resize-none font-mono" placeholder="场景画面描述（供参考，不直接用于生图）" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-500 mb-1">图片生成提示词<span class="ml-1 text-blue-500 font-normal">（实际用于AI生图）</span></label>
              <textarea v-model="editForm.prompt" rows="3" class="input text-sm resize-none font-mono" placeholder="English structured image prompt — leave empty to use auto-generated prompt from storyboard AI..." />
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
            <div class="grid grid-cols-5 gap-2">
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
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">过渡方式</label>
                <select v-model="editForm.transition" class="input text-sm py-1">
                  <option v-for="o in TRANSITION_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
              </div>
            </div>
          </div>

          <!-- View mode -->
          <div v-else class="p-3">
            <div class="flex gap-3">
              <!-- Thumbnail / upload -->
              <div class="group/thumb w-28 flex-shrink-0 rounded-lg overflow-hidden bg-gray-900 flex items-center justify-center relative" style="min-height: 72px;">
                <div v-if="uploadingShotId === shot.id" class="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
                  <div class="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
                <template v-if="shot.image_url && uploadingShotId !== shot.id">
                  <img
                    :src="shot.image_url"
                    loading="lazy"
                    class="w-full h-full object-cover cursor-zoom-in"
                    title="点击查看大图"
                    @click.stop="openShotLightbox(shot)"
                  />
                  <button
                    class="absolute bottom-1 right-1 p-1 rounded bg-black/40 text-white opacity-0 group-hover/thumb:opacity-100 hover:bg-black/70 transition-all z-10"
                    title="重新上传图片"
                    @click.stop="triggerShotImageUpload(shot.id)"
                  >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                  </button>
                </template>
                <button
                  v-else-if="uploadingShotId !== shot.id"
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
                <div class="flex items-start justify-between gap-2 mb-1">
                  <!-- Description inline edit (primary display) -->
                  <div class="min-w-0 flex-1">
                    <div v-if="editingDescriptionId === shot.id">
                      <textarea
                        v-model="descriptionDraft"
                        rows="3"
                        class="input text-sm resize-none w-full font-mono"
                        placeholder="画面描述（用于 AI 生图）…"
                        autofocus
                        @keydown.enter.ctrl="saveDescription(shot)"
                        @keydown.esc="cancelEditDescription"
                      />
                      <div class="flex items-center gap-1.5 mt-1">
                        <button class="btn-primary text-xs py-0.5 px-2" :disabled="savingDescription" @click="saveDescription(shot)">
                          {{ savingDescription ? '保存中…' : '保存' }}
                        </button>
                        <button class="btn-outline text-xs py-0.5 px-2" @click="cancelEditDescription">取消</button>
                        <span class="text-xs text-gray-400 ml-auto">Ctrl+Enter 保存</span>
                      </div>
                    </div>
                    <div v-else class="flex items-start gap-1.5 group cursor-pointer" @click="startEditDescription(shot)">
                      <span class="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 mt-0.5">#{{ shot.shot_no }}</span>
                      <p class="text-sm text-gray-900 dark:text-white leading-snug line-clamp-3 flex-1 font-mono">
                        {{ shot.description || '（无画面描述）' }}
                      </p>
                      <button class="flex-shrink-0 p-0.5 rounded text-gray-300 dark:text-gray-600 opacity-0 group-hover:opacity-100 hover:text-gray-600 dark:hover:text-gray-300 transition-all" title="编辑画面描述" @click.stop="startEditDescription(shot)">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Metadata tags -->
                <div class="flex flex-wrap gap-1.5 mt-1">
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
            <div v-if="shot.status === 'failed' && shot.error_message" class="mt-2">
              <p class="text-xs text-red-500 mt-1 line-clamp-2" :title="shot.error_message">
                {{ shot.error_message }}
              </p>
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
              <!-- Action buttons -->
              <div class="ml-auto flex items-center gap-0.5 flex-shrink-0">
                <span
                  v-if="shotKlingMode(shot) === 'pro'"
                  class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 mr-1"
                  title="此镜头将使用 Kling Pro 模式"
                >PRO</span>
                <button
                  class="p-1.5 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  :title="shot.image_url ? '重新生成图片' : '生成图片'"
                  :disabled="generatingImageShotIds.has(shot.id) || uploadingShotId === shot.id"
                  @click="handleGenerateShotImage(shot)"
                >
                  <svg v-if="generatingImageShotIds.has(shot.id)" class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </button>
                <button class="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="编辑" @click="startEdit(shot)">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                </button>
                <button class="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors" title="复制此镜头" @click="handleCopyShot(shot)">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                </button>
                <button class="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" title="删除此镜头" @click="handleDeleteShot(shot)">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
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
