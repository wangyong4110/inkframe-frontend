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

// Voice
const voiceStyle = ref('neutral')
const subtitleEnabled = ref(true)
const generatingVoice = ref<Record<number, boolean>>({})
const shotAudioUrls = ref<Record<number, string>>({})

// BGM
const selectedBgm = ref('')
const bgmVolume = ref(60)
const generatingBgm = ref(false)

// Export
const stitching = ref(false)
const exportingCapCut = ref(false)
const exportUrl = ref('')

// Scene anchors
const sceneAnchorStore = useSceneAnchorStore()
const anchors = computed(() => sceneAnchorStore.anchors)

// Characters
const characterStore = useCharacterStore()
const characters = computed(() => characterStore.characters)
const showAnchorForm = ref(false)
const editingAnchorId = ref<number | null>(null)
const anchorForm = ref({ name: '', type: 'interior', description: '', prompt_lock: '', style_tokens: '', notes: '' })
const savingAnchor = ref(false)
const extractingAnchors = ref(false)

async function extractAnchorsFromCurrentChapter() {
  const novelId = video.value?.novel_id
  if (!novelId) { toast.error('无法获取小说 ID'); return }
  // 使用 video 关联的章节内容（从第一个已生成 shot 的描述拼合）
  const chapterContent = shots.value.map(s => s.description || '').filter(Boolean).join('\n')
  if (!chapterContent) { toast.error('当前分镜无内容可提取'); return }
  extractingAnchors.value = true
  try {
    const added = await sceneAnchorStore.extractAnchors(novelId, chapterContent, undefined)
    toast.success(`已提取 ${added.length} 个新场景锚点`)
  } catch (e: any) {
    toast.error(e.message || '提取失败')
  } finally {
    extractingAnchors.value = false
  }
}

function startAnchorCreate() {
  editingAnchorId.value = null
  anchorForm.value = { name: '', type: 'interior', description: '', prompt_lock: '', style_tokens: '', notes: '' }
  showAnchorForm.value = true
}

function startAnchorEdit(anchor: any) {
  editingAnchorId.value = anchor.id
  anchorForm.value = { name: anchor.name, type: anchor.type || 'interior', description: anchor.description || '', prompt_lock: anchor.prompt_lock || '', style_tokens: anchor.style_tokens || '', notes: anchor.notes || '' }
  showAnchorForm.value = true
}

async function saveAnchor() {
  if (!anchorForm.value.name) { toast.error('请输入场景名称'); return }
  savingAnchor.value = true
  try {
    const novelId = video.value?.novel_id
    if (!novelId) return
    if (editingAnchorId.value) {
      await sceneAnchorStore.updateAnchor(editingAnchorId.value, anchorForm.value)
    } else {
      await sceneAnchorStore.createAnchor(novelId, anchorForm.value)
    }
    showAnchorForm.value = false
    toast.success(editingAnchorId.value ? '场景已更新' : '场景已创建')
  } catch (e: any) {
    toast.error(e.message || '保存失败')
  } finally {
    savingAnchor.value = false
  }
}

async function deleteAnchor(id: number) {
  if (!confirm('确定删除该场景锚点？')) return
  try {
    await sceneAnchorStore.deleteAnchor(id)
    toast.success('已删除')
  } catch (e: any) {
    toast.error(e.message || '删除失败')
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
const SHOT_SIZE_LABEL: Record<string, string> = Object.fromEntries(SHOT_SIZE_OPTIONS.map(o => [o.value, o.label]))
const CAMERA_ANGLE_LABEL: Record<string, string> = Object.fromEntries(CAMERA_ANGLE_OPTIONS.map(o => [o.value, o.label]))
const CAMERA_TYPE_LABEL: Record<string, string> = Object.fromEntries(CAMERA_TYPE_OPTIONS.map(o => [o.value, o.label]))
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
  { key: 'scenes', label: '场景管理', icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z', locked: false },
  { key: 'voice', label: '配音字幕', icon: 'M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z', locked: !productionEnabled.value },
  { key: 'bgm', label: '背景音乐', icon: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3', locked: !productionEnabled.value },
  { key: 'export', label: '导出', icon: 'M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4', locked: !productionEnabled.value },
])

// ──────── Lifecycle ────────
async function load() {
  const { getVideoProviders } = useVideoApi()
  const videoRes = await Promise.allSettled([getVideoProviders()])
  if (videoRes[0].status === 'fulfilled') videoProviders.value = (videoRes[0].value as any)?.data ?? []
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

// 从 video 初始化节奏/时长（刷新后还原上次所选）
watch(video, (v) => {
  if (v) {
    pacing.value = v.pacing ?? 'normal'
    targetDuration.value = v.target_duration ?? 0
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

async function handleGenerateStoryboard(userPrompt?: string) {
  if (isScriptConfirmed.value) {
    if (!confirm('重新生成将清空当前脚本，是否继续？')) return
  }
  try {
    await videoStore.generateStoryboard(
      props.videoId,
      props.llmProvider || undefined,
      userPrompt,
      pacing.value !== 'normal' ? pacing.value : undefined,
      targetDuration.value || undefined,
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
    dialogue: shot.dialogue,
    emotional_tone: (shot as any).emotional_tone || '',
    shot_size: shot.shot_size,
    camera_angle: shot.camera_angle,
    camera_type: shot.camera_type,
    duration: shot.duration,
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
  if (!shot.dialogue) { toast.error('该镜头无对话文本，无法生成配音'); return }
  generatingVoice.value[shot.id] = true
  try {
    const api = useVideoApi()
    const res = await api.generateVoice(props.videoId, shot.id)
    const taskId = res.data?.task_id
    if (!taskId) { toast.error('配音生成失败：未获取到任务ID'); generatingVoice.value[shot.id] = false; return }
    toast.info(`镜头 #${shot.shot_no} 配音生成中…`)
    const taskStore = useTaskStore()
    taskStore.trackTask(taskId, (task) => {
      generatingVoice.value[shot.id] = false
      if (task.status === 'completed') {
        // 优先使用任务结果中的 audio_url（base64/HTTP），回退到 serve 端点
        const audioUrl = ((task.data as any)?.audio_url as string | undefined)
          || `/api/v1/videos/${props.videoId}/storyboard/${shot.id}/audio`
        shotAudioUrls.value[shot.id] = audioUrl
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
  const list = shots.value.filter(s => s.dialogue)
  if (list.length === 0) { toast.error('没有带对话的镜头，无法生成配音'); return }
  for (const shot of list) {
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

async function handleExportCapCut() {
  exportingCapCut.value = true
  try {
    const api = useVideoApi()
    const blob = await api.exportCapcut(props.videoId)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${video.value?.title || 'video_' + props.videoId}_capcut.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast.success('剪映草稿已导出')
  } catch (e: any) {
    toast.error('导出失败：' + (e.message || ''))
  } finally {
    exportingCapCut.value = false
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

      <!-- Generation progress bar -->
      <div
        v-if="videoStore.storyboardTaskStatus === 'pending' || videoStore.storyboardTaskStatus === 'running' || videoStore.storyboardTaskStatus === 'failed'"
        class="mb-4"
      >
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-xs font-medium" :class="videoStore.storyboardTaskStatus === 'failed' ? 'text-red-500' : 'text-primary-600 dark:text-primary-400'">
            <span v-if="videoStore.storyboardTaskStatus === 'pending'">排队中，等待 AI 处理…</span>
            <span v-else-if="videoStore.storyboardTaskStatus === 'running'">AI 正在生成分镜脚本…</span>
            <span v-else>生成失败：{{ videoStore.error || '未知错误' }}</span>
          </span>
          <span v-if="videoStore.storyboardTaskStatus !== 'failed'" class="text-[10px] text-gray-400 dark:text-gray-500">请稍候</span>
        </div>
        <div class="h-1 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            v-if="videoStore.storyboardTaskStatus === 'failed'"
            class="h-full w-full bg-red-500 rounded-full"
          />
          <div
            v-else
            class="h-full bg-primary-500 rounded-full progress-indeterminate"
          />
        </div>
      </div>

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

        <!-- Confirm script button (not confirmed) -->
        <button
          v-else-if="shots.length > 0"
          class="btn-primary text-sm bg-green-600 hover:bg-green-700 border-green-600"
          :disabled="confirmingScript"
          @click="handleConfirmScript"
        >
          <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
          </svg>
          确认脚本
        </button>
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
                <label class="block text-xs font-medium text-gray-500 mb-1">场景描述</label>
                <textarea v-model="editForm.description" rows="3" class="input text-sm resize-none" placeholder="描述这个镜头的画面内容..." />
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-500 mb-1">对白 / 旁白</label>
                <textarea v-model="editForm.dialogue" rows="2" class="input text-sm resize-none" placeholder="角色对话或画外音旁白（可留空）" />
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

              <p class="text-sm text-gray-800 dark:text-gray-200 leading-relaxed mb-1.5">
                {{ shot.description || '（无场景描述）' }}
              </p>
              <p v-if="shot.dialogue" class="text-sm text-gray-500 dark:text-gray-400 italic mb-2.5">
                「{{ shot.dialogue }}」
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
                      {{ shot.description || '（无描述）' }}
                    </p>
                    <p v-if="shot.dialogue" class="text-xs text-gray-400 italic mt-0.5 line-clamp-1">
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
        <div class="grid gap-4 sm:grid-cols-2">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">配音风格</label>
            <select v-model="voiceStyle" class="input">
              <option value="neutral">标准旁白</option>
              <option value="dramatic">戏剧化</option>
              <option value="soft">温柔</option>
              <option value="powerful">激昂</option>
            </select>
          </div>
          <div class="flex items-center gap-2 pt-6">
            <label class="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer">
              <input v-model="subtitleEnabled" type="checkbox" class="rounded accent-primary-500" />
              同步生成字幕
            </label>
          </div>
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
            <p class="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
              {{ shot.dialogue || shot.description || '（无台词）' }}
            </p>
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
         场景管理 Tab
         ============================== -->
    <div v-if="activeTab === 'scenes'" class="space-y-4">

      <!-- 场景锚点库 -->
      <div class="card p-5">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="font-semibold text-gray-900 dark:text-white">场景锚点库</h3>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">锁定场景视觉描述，确保跨镜头布景一致</p>
          </div>
          <div class="flex gap-2">
            <button class="btn-secondary text-sm" :disabled="extractingAnchors" @click="extractAnchorsFromCurrentChapter">
              {{ extractingAnchors ? 'AI 提取中…' : 'AI 提取' }}
            </button>
            <button class="btn-primary text-sm" @click="startAnchorCreate">+ 新建场景</button>
          </div>
        </div>

        <!-- 新建/编辑表单 -->
        <div v-if="showAnchorForm" class="mb-5 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 space-y-3">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">场景名称 *</label>
              <input v-model="anchorForm.name" type="text" placeholder="如：书院大厅" class="input w-full text-sm" />
            </div>
            <div>
              <label class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">类型</label>
              <select v-model="anchorForm.type" class="input w-full text-sm">
                <option value="interior">室内</option>
                <option value="exterior">室外</option>
                <option value="imaginary">虚构/幻境</option>
              </select>
            </div>
          </div>
          <div>
            <label class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">场景描述</label>
            <textarea v-model="anchorForm.description" rows="2" placeholder="用自然语言描述场景外观、氛围…" class="input w-full text-sm resize-none" />
          </div>
          <div>
            <label class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">锁定关键词（逗号分隔，生成时强制注入）</label>
            <input v-model="anchorForm.prompt_lock" type="text" placeholder="ancient wooden beams, paper lanterns, warm candlelight" class="input w-full text-sm" />
          </div>
          <div>
            <label class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">风格标签</label>
            <input v-model="anchorForm.style_tokens" type="text" placeholder="warm lighting, soft focus" class="input w-full text-sm" />
          </div>
          <div class="flex gap-2 pt-1">
            <button class="btn-primary text-sm" :disabled="savingAnchor" @click="saveAnchor">
              {{ savingAnchor ? '保存中…' : (editingAnchorId ? '更新' : '创建') }}
            </button>
            <button class="btn-outline text-sm" @click="showAnchorForm = false">取消</button>
          </div>
        </div>

        <!-- 锚点列表 -->
        <div v-if="anchors.length === 0 && !showAnchorForm" class="text-center py-8 text-gray-400 dark:text-gray-500 text-sm">
          暂无场景锚点，点击「新建场景」创建
        </div>
        <div class="space-y-3">
          <div
            v-for="anchor in anchors"
            :key="anchor.id"
            class="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
          >
            <!-- 参考图缩略图 -->
            <div class="w-16 h-12 rounded-md overflow-hidden bg-gray-100 dark:bg-gray-700 flex-shrink-0">
              <img v-if="anchor.ref_image_url" :src="anchor.ref_image_url" class="w-full h-full object-cover cursor-zoom-in" alt="" @click.stop="openLightbox(anchor.ref_image_url)" />
              <div v-else class="w-full h-full flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-md p-1">
                <span class="text-xs text-center text-gray-400 leading-tight">首次生成后<br>自动锁定</span>
              </div>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="font-medium text-sm text-gray-900 dark:text-white truncate">{{ anchor.name }}</span>
                <span class="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">{{ anchor.type || 'interior' }}</span>
                <span v-if="anchor.ref_image_url" class="text-xs text-amber-600 dark:text-amber-400" title="参考图已锁定">🔒</span>
              </div>
              <p v-if="anchor.description" class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{{ anchor.description }}</p>
              <p v-if="anchor.prompt_lock" class="text-xs text-blue-500 dark:text-blue-400 mt-0.5 truncate font-mono">{{ anchor.prompt_lock }}</p>
            </div>
            <div class="flex gap-1.5 flex-shrink-0">
              <button class="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" @click="startAnchorEdit(anchor)">编辑</button>
              <button class="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20" @click="deleteAnchor(anchor.id)">删除</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 分镜场景绑定 -->
      <div v-if="shots.length > 0" class="card p-5">
        <h3 class="font-semibold text-gray-900 dark:text-white mb-1">分镜场景绑定</h3>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">为每个镜头指定场景锚点，生成图像时自动注入一致的布景描述</p>
        <div class="space-y-2">
          <div v-for="shot in shots" :key="shot.id" class="flex items-center gap-3 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
            <span class="text-xs font-mono text-gray-500 w-12 flex-shrink-0">镜 #{{ shot.shot_no }}</span>
            <p class="flex-1 text-xs text-gray-600 dark:text-gray-400 truncate">{{ shot.description || '—' }}</p>
            <select
              :value="shot.scene_anchor_id || ''"
              class="input text-xs py-1 h-7 w-36 flex-shrink-0"
              @change="handleSetShotAnchor(shot, ($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null)"
            >
              <option value="">未绑定</option>
              <option v-for="anchor in anchors" :key="anchor.id" :value="anchor.id">{{ anchor.name }}</option>
            </select>
            <span v-if="shot.scene_anchor_id" class="text-xs text-amber-500" title="已绑定场景锚点">🔒</span>
          </div>
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
        <div class="flex gap-3">
          <button
            class="btn-primary"
            :disabled="completedShots.length === 0 || exportingCapCut"
            @click="handleExportCapCut"
          >
            <svg v-if="exportingCapCut" class="w-4 h-4 mr-2 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            导出剪映草稿
          </button>
          <button
            class="btn-outline"
            :disabled="completedShots.length === 0 || stitching"
            @click="handleStitch"
          >
            {{ stitching ? '合成中...' : '合成 MP4' }}
          </button>
          <a v-if="exportUrl" :href="exportUrl" target="_blank" class="btn-outline">下载文件</a>
        </div>
        <p v-if="completedShots.length === 0" class="mt-3 text-sm text-amber-600 dark:text-amber-400">
          请先在「分镜脚本」Tab 生成视频/图片素材
        </p>
      </div>
    </div>

  </div>
</template>

<style scoped>
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
