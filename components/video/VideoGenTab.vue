<script setup lang="ts">
import type { StoryboardShot, Character, SceneAnchor } from '~/types'
import { TRANSITION_OPTIONS } from '~/constants/status'

const SHOT_SIZE_OPTIONS = [
  { value: 'extreme_wide', label: '极远景' },
  { value: 'wide',         label: '远景' },
  { value: 'full',         label: '全景' },
  { value: 'medium',       label: '中景' },
  { value: 'close_up',     label: '近景' },
  { value: 'extreme_close_up', label: '特写' },
]
const CAMERA_ANGLE_OPTIONS = [
  { value: 'eye_level', label: '平视' },
  { value: 'high',      label: '俯拍' },
  { value: 'low',       label: '仰拍' },
  { value: 'dutch',     label: '倾斜' },
  { value: 'overhead',  label: '顶拍' },
  { value: 'POV',       label: '主观' },
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


const props = defineProps<{ videoId: number }>()

const { url: lightboxUrl, openLightbox } = useImageLightbox()
const { editImage } = useImageEditApi()
const videoStore = useVideoStore()
const sceneAnchorStore = useSceneAnchorStore()
const characterStore = useCharacterStore()
const chapterStore = useChapterStore()
const characterApi = useCharacterApi()
const sceneAnchorApi = useSceneAnchorApi()
const toast = useToast()
const { guardAiProvider } = useAiProviderGuard()
const videoApi = useVideoApi()
const router = useRouter()

const video = computed(() => videoStore.currentVideo)
const shots = computed(() => videoStore.storyboard)
const generatingStoryboard = computed(() => videoStore.generating)

const imagesGenerated = computed(() => shots.value.filter(s => s.image_url).length)
const videosGenerated = computed(() => shots.value.filter(s => s.video_url).length)
const totalShots = computed(() => shots.value.length)

const videoProviders = ref<{ name: string; display_name: string }[]>([])
const selectedVideoProvider = ref('')
const batchGeneratingImages = ref(false)
const batchGeneratingClips = ref(false)
const uploadingShotId = ref<number | null>(null)
const shotImageInputRef = ref<HTMLInputElement | null>(null)
const shotImageTargetId = ref<number | null>(null)
const shotVideoInputRef = ref<HTMLInputElement | null>(null)
const shotVideoTargetId = ref<number | null>(null)
// Maps shot.id → in-flight task_id for cancellation support
const shotTaskIds = ref<Record<number, string>>({})
// Tracks per-shot image generation in-flight (no server task_id needed for image gen)
const generatingShotImageIds = ref<Record<number, boolean>>({})

const previewVideoUrl = ref<string | null>(null)
const previewVideoShotNo = ref<number | null>(null)

const showMissingThreeViewModal = ref(false)
const missingThreeViewChars = ref<{ id: number; name: string }[]>([])
let _pendingGenerateAction: (() => void) | null = null

const anchors = computed(() => sceneAnchorStore.anchors)
const characters = computed(() => characterStore.characters)

// Inline motion_prompt editing
const editingMotionPromptId = ref<number | null>(null)
const editingMetaShotId = ref<number | null>(null)

onMounted(() => { document.addEventListener('click', closeMetaEdit) })
onUnmounted(() => { document.removeEventListener('click', closeMetaEdit) })
function closeMetaEdit() { editingMetaShotId.value = null }
const motionPromptDraft = ref('')
const savingMotionPrompt = ref(false)

function startEditMotionPrompt(shot: StoryboardShot) {
  editingMotionPromptId.value = shot.id
  motionPromptDraft.value = shot.motion_prompt || ''
}

async function saveMotionPrompt(shot: StoryboardShot) {
  if (savingMotionPrompt.value) return
  savingMotionPrompt.value = true
  try {
    await videoStore.updateShot(props.videoId, shot.id, { motion_prompt: motionPromptDraft.value })
    editingMotionPromptId.value = null
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || ''))
  } finally {
    savingMotionPrompt.value = false
  }
}

// Pre-computed map for O(1) character lookups by id in the template.
const characterById = computed(() => {
  const map = new Map<number, (typeof characters.value)[0]>()
  for (const c of characters.value) map.set(c.id, c)
  return map
})

// Pre-computed map for O(1) anchor lookups by id in the template.
const anchorById = computed(() => {
  const map = new Map<number, (typeof anchors.value)[0]>()
  for (const a of anchors.value) map.set(a.id, a)
  return map
})

// Chapter-bound characters and anchors for dropdown filtering.
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

// ── Pagination ──
const { currentPage, totalPages, pagedShots, pageNumbers } = useShotsPagination(shots)

// ── Debounced storyboard refresh ──
let _refreshTimer: ReturnType<typeof setTimeout> | null = null
function scheduleRefresh() {
  if (_refreshTimer) clearTimeout(_refreshTimer)
  _refreshTimer = setTimeout(() => {
    videoStore.fetchStoryboard(props.videoId)
    _refreshTimer = null
  }, 300)
}

onBeforeUnmount(() => {
  if (_refreshTimer) {
    clearTimeout(_refreshTimer)
    _refreshTimer = null
  }
})

// ── Load video providers on mount ──
onMounted(async () => {
  const res = await videoApi.getVideoProviders()
  videoProviders.value = res?.data ?? []
})

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
  try {
    const taskId = await videoStore.batchGenerateShots(props.videoId, pending.map(s => s.id), video.value?.quality_tier, selectedVideoProvider.value || undefined)
    if (!taskId) { toast.error('批量生成失败：未获取到任务ID'); return }
    toast.info(`${pending.length} 个镜头素材生成中…`)
    const taskStore = useTaskStore()
    taskStore.trackTask(taskId, async (task) => {
      if (task.status === 'completed') {
        await videoStore.fetchStoryboard(props.videoId)
        toast.success('全部镜头素材生成完成')
      } else {
        toast.error('批量生成失败，请重试')
      }
    }, () => videoStore.fetchStoryboard(props.videoId))
  } catch (e: any) {
    toast.error('批量生成失败：' + (e.message || ''))
  }
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

function triggerShotVideoUpload(shotId: number) {
  shotVideoTargetId.value = shotId
  shotVideoInputRef.value?.click()
}

async function onShotVideoFileSelected(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file || shotVideoTargetId.value == null) return
  const shotId = shotVideoTargetId.value
  uploadingShotId.value = shotId
  ;(e.target as HTMLInputElement).value = ''
  try {
    const res = await videoApi.uploadShotVideo(props.videoId, shotId, file)
    const idx = videoStore.storyboard.findIndex(s => s.id === shotId)
    if (idx >= 0) videoStore.storyboard[idx] = { ...videoStore.storyboard[idx], ...res?.data }
    toast.success('视频上传成功')
  } catch (e: any) {
    toast.error('视频上传失败：' + (e?.message || ''))
  } finally {
    uploadingShotId.value = null
  }
}

function saveShotImage(shot: StoryboardShot, newUrl: string) {
  const idx = videoStore.storyboard.findIndex(s => s.id === shot.id)
  if (idx >= 0) videoStore.storyboard[idx].image_url = newUrl
  videoApi.updateShotImageUrl(props.videoId, shot.id, newUrl).catch(() => {})
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

// ── 三视图缺失检查 ──
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
function openVideoPreview(shot: StoryboardShot) {
  previewVideoUrl.value = shot.video_url || null
  previewVideoShotNo.value = shot.shot_no
}

function closeVideoPreview() {
  previewVideoUrl.value = null
  previewVideoShotNo.value = null
}


const SHOT_SIZE_LABEL: Record<string, string> = Object.fromEntries(SHOT_SIZE_OPTIONS.map(o => [o.value, o.label]))
const CAMERA_ANGLE_LABEL: Record<string, string> = Object.fromEntries(CAMERA_ANGLE_OPTIONS.map(o => [o.value, o.label]))
const CAMERA_TYPE_LABEL: Record<string, string> = Object.fromEntries(CAMERA_TYPE_OPTIONS.map(o => [o.value, o.label]))
const TRANSITION_LABEL: Record<string, string> = Object.fromEntries(TRANSITION_OPTIONS.map(o => [o.value, o.label]))

// Inline save single shot metadata field
async function saveShotMeta(shot: StoryboardShot, field: keyof StoryboardShot, value: any) {
  try {
    await videoStore.updateShot(props.videoId, shot.id, { [field]: value } as Partial<StoryboardShot>)
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || ''))
  }
}

// Expose for parent (e.g. reload providers from outside)
defineExpose({
  loadVideoProviders: async () => {
    const res = await videoApi.getVideoProviders()
    videoProviders.value = res?.data ?? []
  },
})
</script>

<template>
  <div>
    <!-- Hidden file input for shot image upload -->
    <input
      ref="shotImageInputRef"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      class="hidden"
      @change="onShotImageFileSelected"
    />
    <!-- Hidden file input for shot video upload -->
    <input
      ref="shotVideoInputRef"
      type="file"
      accept="video/mp4,video/quicktime,video/webm,video/avi"
      class="hidden"
      @change="onShotVideoFileSelected"
    />

    <!-- 生成进度 -->
    <div v-if="shots.length > 0" class="flex items-center gap-4 mb-3 text-xs text-gray-400 dark:text-gray-500">
      <span>生成进度 {{ videosGenerated }} / {{ totalShots }}</span>
    </div>

    <!-- Empty state -->
    <div v-if="shots.length === 0" class="card p-14 text-center">
      <svg class="w-14 h-14 mx-auto text-gray-300 dark:text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
      </svg>
      <h3 class="text-base font-semibold text-gray-700 dark:text-gray-300 mb-1.5">还没有分镜脚本</h3>
      <p class="text-sm text-gray-400 dark:text-gray-500">
        请先在「分镜脚本」页生成分镜脚本
      </p>
    </div>

    <!-- Production shot cards -->
    <div v-else class="space-y-3">
      <!-- Pagination at top -->
      <ShotsPaginationBar
        v-if="totalPages > 1"
        :current-page="currentPage"
        :total-pages="totalPages"
        :total-items="shots.length"
        :page-numbers="pageNumbers"
        @update:current-page="currentPage = $event"
      />

      <div v-for="(shot, shotIdx) in pagedShots" :key="shot.id">
        <div class="card p-3" :class="shotIdx % 2 === 1 ? 'shot-card-alt' : ''">
          <div class="flex gap-3">
            <!-- Thumbnail -->
            <div class="group/thumb w-28 flex-shrink-0 rounded-lg overflow-hidden bg-gray-900 flex items-center justify-center relative" style="min-height: 72px;">
              <div v-if="uploadingShotId === shot.id" class="absolute inset-0 flex items-center justify-center bg-black/60 z-10">
                <div class="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
              <!-- 有视频时优先显示视频缩略图（hover 自动播放），点击打开预览 -->
              <template v-if="shot.video_url && uploadingShotId !== shot.id">
                <video
                  :key="shot.video_url"
                  :src="shot.video_url"
                  :poster="shot.image_url || undefined"
                  muted
                  loop
                  preload="metadata"
                  class="w-full h-full object-cover cursor-pointer"
                  title="点击预览视频"
                  @mouseenter="($event.target as HTMLVideoElement).play().catch(() => {})"
                  @mouseleave="($event.target as HTMLVideoElement).pause(); ($event.target as HTMLVideoElement).currentTime = 0"
                  @click.stop="openVideoPreview(shot)"
                />
                <!-- 视频标记角标 -->
                <div class="absolute bottom-1 left-1 flex items-center gap-0.5 bg-black/60 rounded px-1 py-0.5 pointer-events-none">
                  <svg class="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                  <span class="text-[9px] text-white leading-none">视频</span>
                </div>
              </template>
              <template v-else-if="shot.image_url">
                <img :src="shot.image_url" loading="lazy" class="w-full h-full object-cover cursor-zoom-in" @click.stop="openLightbox(shot.image_url, (currentUrl, s) => editImage(currentUrl, s, video?.novel_id), (u) => saveShotImage(shot, u))" />
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
                v-else
                class="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-500 hover:text-primary-400 hover:bg-gray-800 transition-colors"
                title="上传视频"
                @click.stop="triggerShotVideoUpload(shot.id)"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                <span class="text-[10px] leading-none">上传视频</span>
              </button>
            </div>

            <!-- Content -->
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-2">
                <div class="min-w-0 flex-1">
                  <div class="flex items-baseline gap-1.5 min-w-0">
                    <span class="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">#{{ shot.shot_no }}</span>
                    <p class="text-sm text-gray-800 dark:text-gray-200 line-clamp-3 leading-snug min-w-0">
                      {{ shot.narration || shot.description || '（无描述）' }}
                    </p>
                  </div>
                  <!-- 视频提示词（只读，点击进入编辑） -->
                  <p
                    v-if="editingMotionPromptId !== shot.id"
                    class="text-xs text-gray-400 dark:text-gray-500 italic line-clamp-1 cursor-pointer hover:text-primary-500 transition-colors mt-0.5"
                    :title="shot.motion_prompt || '点击添加视频提示词'"
                    @click.stop="startEditMotionPrompt(shot)"
                  >{{ shot.motion_prompt || '+ 视频提示词' }}</p>
                </div>
                <div class="flex-shrink-0 flex flex-col items-end gap-1">
                  <div class="flex items-center gap-1">
                    <!-- 预览视频 -->
                    <button
                      v-if="shot.video_url"
                      class="p-1.5 rounded-lg text-green-500 hover:bg-green-50 dark:hover:bg-green-900/30 transition-colors"
                      title="预览视频"
                      @click.stop="openVideoPreview(shot)"
                    >
                      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                    </button>
                    <!-- 生成视频图标按钮 -->
                    <button
                      v-if="shot.status !== 'generating'"
                      class="p-1.5 rounded-lg transition-colors"
                      :class="shotTaskIds[shot.id]
                        ? 'text-primary-400 bg-primary-50 dark:bg-primary-900/30'
                        : 'text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30'"
                      :disabled="!!shotTaskIds[shot.id]"
                      :title="shotTaskIds[shot.id] ? '生成中…' : (shot.video_url ? '重新生成视频' : '生成视频')"
                      @click.stop="handleGenerateShot(shot)"
                    >
                      <svg v-if="shotTaskIds[shot.id]" class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                  <span
                    v-if="shotKlingMode(shot) === 'pro'"
                    class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                    title="此镜头将使用 Kling Pro 模式"
                  >PRO</span>
                  <span
                    v-if="shot.status === 'failed' && shot.error_message"
                    class="text-[10px] text-red-400 dark:text-red-500 max-w-[160px] text-right leading-snug"
                    :title="shot.error_message"
                  >{{ shot.error_message.length > 60 ? shot.error_message.slice(0, 60) + '…' : shot.error_message }}</span>
                </div>
              </div>
              <!-- 视频提示词内联编辑（全宽） -->
              <div v-if="editingMotionPromptId === shot.id" class="flex items-start gap-1 mt-1">
                <textarea
                  v-model="motionPromptDraft"
                  rows="2"
                  class="input text-xs resize-none flex-1 font-mono"
                  placeholder="视频提示词（motion prompt）"
                  @keydown.enter.ctrl="saveMotionPrompt(shot)"
                  @keydown.esc="editingMotionPromptId = null"
                />
                <div class="flex flex-col gap-1 flex-shrink-0">
                  <button class="btn-primary text-[10px] py-0.5 px-1.5" :disabled="savingMotionPrompt" @click="saveMotionPrompt(shot)">保存</button>
                  <button class="btn-outline text-[10px] py-0.5 px-1.5" @click="editingMotionPromptId = null">取消</button>
                </div>
              </div>
              <!-- 景别 / 角度 / 运动 / 时长 / 过渡 — 只读态点击进入编辑 -->
              <div class="mt-1.5">
                <!-- 只读 -->
                <div
                  v-if="editingMetaShotId !== shot.id"
                  class="flex items-center gap-1.5 flex-wrap cursor-pointer group"
                  title="点击编辑参数"
                  @click.stop="editingMetaShotId = shot.id"
                >
                  <span class="text-xs text-gray-500 dark:text-gray-400 group-hover:text-primary-500 transition-colors">{{ SHOT_SIZE_LABEL[shot.shot_size] || shot.shot_size }}</span>
                  <span class="text-xs text-gray-300 dark:text-gray-600">·</span>
                  <span class="text-xs text-gray-500 dark:text-gray-400 group-hover:text-primary-500 transition-colors">{{ CAMERA_ANGLE_LABEL[(shot as any).camera_angle] || (shot as any).camera_angle || '—' }}</span>
                  <span class="text-xs text-gray-300 dark:text-gray-600">·</span>
                  <span class="text-xs text-gray-500 dark:text-gray-400 group-hover:text-primary-500 transition-colors">{{ CAMERA_TYPE_LABEL[shot.camera_type] || shot.camera_type }}</span>
                  <span class="text-xs text-gray-300 dark:text-gray-600">·</span>
                  <span class="text-xs text-gray-500 dark:text-gray-400 group-hover:text-primary-500 transition-colors">{{ shot.duration }}s</span>
                  <span class="text-xs text-gray-300 dark:text-gray-600">·</span>
                  <span class="text-xs text-gray-500 dark:text-gray-400 group-hover:text-primary-500 transition-colors">{{ TRANSITION_LABEL[shot.transition || ''] || shot.transition }}</span>
                </div>
                <!-- 编辑态 -->
                <div v-else class="flex items-center gap-1 flex-wrap" @click.stop>
                  <select
                    :value="shot.shot_size"
                    class="input text-[11px] py-0.5 h-6 w-20 flex-shrink-0"
                    title="景别"
                    @change="saveShotMeta(shot, 'shot_size', ($event.target as HTMLSelectElement).value)"
                  >
                    <option v-for="o in SHOT_SIZE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                  </select>
                  <select
                    :value="(shot as any).camera_angle"
                    class="input text-[11px] py-0.5 h-6 w-20 flex-shrink-0"
                    title="角度"
                    @change="saveShotMeta(shot, 'camera_angle' as any, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">角度</option>
                    <option v-for="o in CAMERA_ANGLE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                  </select>
                  <select
                    :value="shot.camera_type"
                    class="input text-[11px] py-0.5 h-6 w-20 flex-shrink-0"
                    title="运动"
                    @change="saveShotMeta(shot, 'camera_type', ($event.target as HTMLSelectElement).value)"
                  >
                    <option v-for="o in CAMERA_TYPE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                  </select>
                  <input
                    :value="shot.duration"
                    type="number" min="1" max="30" step="0.5"
                    class="input text-[11px] py-0.5 h-6 w-14 flex-shrink-0"
                    title="时长(s)"
                    @change="saveShotMeta(shot, 'duration', Number(($event.target as HTMLInputElement).value))"
                  />
                  <span class="text-[11px] text-gray-400 flex-shrink-0">s</span>
                  <select
                    :value="shot.transition"
                    class="input text-[11px] py-0.5 h-6 w-24 flex-shrink-0"
                    title="过渡方式"
                    @change="saveShotMeta(shot, 'transition', ($event.target as HTMLSelectElement).value)"
                  >
                    <option v-for="o in TRANSITION_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
                  </select>
                  <button
                    class="text-[10px] text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 px-1"
                    title="完成编辑"
                    @click.stop="editingMetaShotId = null"
                  >✓</button>
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- Pagination at bottom -->
      <ShotsPaginationBar
        :current-page="currentPage"
        :total-pages="totalPages"
        :total-items="shots.length"
        :page-numbers="pageNumbers"
        @update:current-page="currentPage = $event"
      />
    </div>

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

    <!-- ── 视频生成 AI 助手面板（Teleport 到右侧 slot）── -->
    <Teleport to="#video-gen-ai-slot">
      <div class="p-4 space-y-4">
        <!-- 进度统计 -->
        <div v-if="totalShots > 0" class="space-y-2">
          <p class="text-xs font-medium text-gray-500 dark:text-gray-400">生成进度</p>
          <div class="space-y-1.5">
            <div>
              <div class="flex justify-between text-xs mb-0.5">
                <span class="text-gray-500 dark:text-gray-400">图片</span>
                <span class="text-gray-700 dark:text-gray-300 font-medium">{{ imagesGenerated }} / {{ totalShots }}</span>
              </div>
              <div class="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  class="h-full bg-blue-400 rounded-full transition-all duration-500"
                  :style="{ width: totalShots > 0 ? `${(imagesGenerated / totalShots) * 100}%` : '0%' }"
                />
              </div>
            </div>
            <div>
              <div class="flex justify-between text-xs mb-0.5">
                <span class="text-gray-500 dark:text-gray-400">视频</span>
                <span class="text-gray-700 dark:text-gray-300 font-medium">{{ videosGenerated }} / {{ totalShots }}</span>
              </div>
              <div class="h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  class="h-full bg-primary-500 rounded-full transition-all duration-500"
                  :style="{ width: totalShots > 0 ? `${(videosGenerated / totalShots) * 100}%` : '0%' }"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- 视频供应商 -->
        <div v-if="video?.mode !== 'slideshow' && videoProviders.length > 0">
          <label class="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">视频供应商</label>
          <select v-model="selectedVideoProvider" class="input text-sm w-full">
            <option value="">默认</option>
            <option v-for="p in videoProviders" :key="p.name" :value="p.name">{{ p.display_name || p.name }}</option>
          </select>
        </div>

        <!-- 操作按钮 -->
        <div class="space-y-2">
          <button
            class="w-full px-4 py-2.5 text-sm font-medium btn-secondary rounded-lg transition-colors flex items-center justify-center gap-2"
            :disabled="batchGeneratingImages || batchGeneratingClips || generatingStoryboard"
            @click="handleGenerateImages"
          >
            <svg v-if="batchGeneratingImages" class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {{ batchGeneratingImages ? '图片生成中…' : '生成全部图片' }}
          </button>
          <button
            class="w-full px-4 py-2.5 text-sm font-medium bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center justify-center gap-2"
            :disabled="batchGeneratingImages || batchGeneratingClips || generatingStoryboard"
            @click="handleGenerateClips"
          >
            <svg v-if="batchGeneratingClips" class="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.069A1 1 0 0121 8.82v6.36a1 1 0 01-1.447.89L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            {{ batchGeneratingClips ? '视频生成中…' : '生成全部视频' }}
          </button>
        </div>
      </div>
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
