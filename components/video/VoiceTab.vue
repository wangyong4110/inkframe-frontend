<script setup lang="ts">
import type { StoryboardShot, ShotVoiceSegment } from '~/types'

const props = defineProps<{ videoId: number }>()

const videoStore = useVideoStore()
const novelStore = useNovelStore()
const characterStore = useCharacterStore()
const toast = useToast()
const { url: lightboxUrl, openLightbox } = useImageLightbox()
const { editImage } = useImageEditApi()
const videoApi = useVideoApi()

const characters = computed(() => characterStore.characters)

const shots = computed(() => videoStore.storyboard)
const { currentPage, totalPages, pagedShots, pageNumbers } = useShotsPagination(shots)
const narrationVoice = computed(() => novelStore.currentNovel?.narration_voice ?? '')
const { subtitleEnabled, subtitleConfig } = useSubtitleConfig()

const { guardAiProvider } = useAiProviderGuard()
const generatingVoice = ref<Record<number, boolean>>({})
const shotAudioUrls = ref<Record<number, string>>({})
const batchVoiceGenerating = ref(false)
const batchFillingSubtitles = ref(false)

// Multi-segment voice
const shotSegments = ref<Record<number, ShotVoiceSegment[]>>({})
const loadingSegments = ref<Record<number, boolean>>({})
const expandedSegmentShotId = ref<number | null>(null)
const generatingSegmentVoice = ref<Record<number, boolean>>({})
const newSegmentText = ref<Record<string | number, string>>({})
const newSegmentSpeaker = ref<Record<number, string>>({})
const newSegmentEmotion = ref<Record<number, string>>({})
const newSegmentLanguage = ref<Record<number, string>>({})
const appendFormShotId = ref<number | null>(null)
const segmentEmotions = ref<Record<number, string>>({})
const insertAfterSeqNo = ref<Record<number, number | null>>({})
const editingSegId = ref<number | null>(null)
const editingSegText = ref('')

// Track in-flight save promises to avoid race conditions between text edits and voice generation
let shotSaveInFlight: Promise<unknown> | null = null
let segmentSaveInFlight: Promise<unknown> | null = null

async function handleSegmentEmotionChange(shot: StoryboardShot, seg: ShotVoiceSegment, emotion: string) {
  const prev = seg.emotion || segmentEmotions.value[seg.id] || ''
  segmentEmotions.value[seg.id] = emotion
  try {
    await videoApi.updateVoiceSegment(props.videoId, shot.id, seg.id, { text: seg.text, speaker: seg.speaker, emotion, language: seg.language })
    const updated = (shotSegments.value[shot.id] || []).map(s => s.id === seg.id ? { ...s, emotion } : s)
    shotSegments.value[shot.id] = updated
    segmentCache.set(shot.id, updated)
  } catch (e: any) {
    toast.error('情绪保存失败：' + (e.message || ''))
    segmentEmotions.value[seg.id] = prev
  }
}

async function handleSegmentLanguageChange(shot: StoryboardShot, seg: ShotVoiceSegment, language: string) {
  const prev = seg.language || ''
  try {
    await videoApi.updateVoiceSegment(props.videoId, shot.id, seg.id, { text: seg.text, speaker: seg.speaker, emotion: seg.emotion, language })
    const updated = (shotSegments.value[shot.id] || []).map(s => s.id === seg.id ? { ...s, language } : s)
    shotSegments.value[shot.id] = updated
    segmentCache.set(shot.id, updated)
  } catch (e: any) {
    toast.error('方言保存失败：' + (e.message || ''))
    const reverted = (shotSegments.value[shot.id] || []).map(s => s.id === seg.id ? { ...s, language: prev } : s)
    shotSegments.value[shot.id] = reverted
    segmentCache.set(shot.id, reverted)
  }
}

async function saveSegmentText(shot: StoryboardShot, seg: ShotVoiceSegment) {
  if (editingSegId.value !== seg.id) return
  const text = editingSegText.value.trim()
  editingSegId.value = null  // 立即退出编辑态，不等 API
  if (!text || text === seg.text) return
  // 乐观更新本地
  const updated = (shotSegments.value[shot.id] || []).map(s => s.id === seg.id ? { ...s, text } : s)
  shotSegments.value[shot.id] = updated
  segmentCache.set(shot.id, updated)
  const p = (async () => {
    try {
      await videoApi.updateVoiceSegment(props.videoId, shot.id, seg.id, { text, speaker: seg.speaker, emotion: seg.emotion || segmentEmotions[seg.id], language: seg.language })
    } catch (e: any) {
      toast.error('保存失败：' + (e.message || ''))
      // 回滚本地
      const reverted = (shotSegments.value[shot.id] || []).map(s => s.id === seg.id ? { ...s, text: seg.text } : s)
      shotSegments.value[shot.id] = reverted
      segmentCache.set(shot.id, reverted)
    } finally {
      segmentSaveInFlight = null
    }
  })()
  segmentSaveInFlight = p
  await p
}

const EMOTION_OPTIONS = ['', '平静', '温馨', '激动', '悲伤', '开心', '愤怒', '神秘']

const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: '',       label: '普通话' },
  { value: 'zh-yue', label: '粤语' },
  { value: 'zh-scu', label: '四川话' },
  { value: 'zh-nan', label: '闽南语' },
  { value: 'zh-wu',  label: '吴语' },
  { value: 'en',     label: 'English' },
]

// Sync audio URLs from storyboard
watch(shots, (list) => {
  for (const shot of list) {
    if (shot.audio_url && !shotAudioUrls.value[shot.id]) {
      shotAudioUrls.value[shot.id] = shot.audio_url
    }
  }
}, { immediate: true })

async function handleGenerateVoice(shot: StoryboardShot) {
  if (!await guardAiProvider('TTS')) return
  if (generatingVoice.value[shot.id]) return
  // 等待正在进行的文本保存完成，避免配音生成读到旧文本（blur save 与 click generate 竞态）
  if (shotSaveInFlight) await shotSaveInFlight
  generatingVoice.value[shot.id] = true
  const api = useVideoApi()
  const taskStore = useTaskStore()
  try {
    // 1. 生成主配音（旁白或对白整句）
    const mainRes = await api.generateVoice(
      props.videoId, shot.id,
      narrationVoice.value || undefined,
      subtitleEnabled.value,
      subtitleEnabled.value ? subtitleConfig.value : undefined,
    )
    const mainTaskId = mainRes.data?.task_id
    if (mainTaskId) {
      taskStore.trackTask(mainTaskId, async (task) => {
        if (task.status === 'completed') {
          await videoStore.fetchStoryboard(props.videoId)
          // Sync audio URL from fresh storyboard data (only set when audio actually exists)
          const freshShot = shots.value.find(s => s.id === shot.id)
          if (freshShot?.audio_url) {
            const sep = freshShot.audio_url.includes('?') ? '&' : '?'
            shotAudioUrls.value[shot.id] = `${freshShot.audio_url}${sep}t=${Date.now()}`
          } else {
            delete shotAudioUrls.value[shot.id]
          }
          // Reload segments — GenerateShotAudio may have created a new segment
          invalidateSegmentCache(shot.id)
          await loadSegments(shot)
        } else {
          toast.error(`镜头 #${shot.shot_no} 主配音生成失败`)
        }
      })
    }

    // 2. 加载并重新生成所有语音片段
    invalidateSegmentCache(shot.id)
    await loadSegments(shot)
    const segs = shotSegments.value[shot.id] || []
    for (const seg of segs) {
      try {
        generatingSegmentVoice.value[seg.id] = true
        const segRes = await api.generateSegmentVoice(props.videoId, shot.id, seg.id, narrationVoice.value || undefined)
        const segTaskId = segRes.data?.task_id
        if (segTaskId) {
          taskStore.trackTask(segTaskId, async (task) => {
            generatingSegmentVoice.value[seg.id] = false
            if (task.status === 'completed') await loadSegments(shot)
          })
        } else {
          generatingSegmentVoice.value[seg.id] = false
          await loadSegments(shot)
        }
      } catch {
        generatingSegmentVoice.value[seg.id] = false
      }
    }

    toast.info(`镜头 #${shot.shot_no} 配音生成中${segs.length ? `（共 ${1 + segs.length} 段）` : '…'}`)
  } catch (e: any) {
    toast.error('配音生成失败：' + (e.message || ''))
  } finally {
    generatingVoice.value[shot.id] = false
  }
}

async function handleGenerateAllVoice() {
  if (!await guardAiProvider('TTS')) return
  if (shots.value.length === 0) { toast.error('没有分镜，无法生成配音'); return }
  if (batchVoiceGenerating.value) { toast.info('配音批量任务进行中…'); return }
  const missing = findCharsWithoutVoice()
  const needsNarration = shots.value.some(s => s.narration)
  const narrationMissing = needsNarration && !narrationVoice.value
  if (missing.length > 0 || narrationMissing) {
    missingVoiceChars.value = missing
    narrationVoiceMissing.value = narrationMissing
    showVoiceWarningModal.value = true
    return
  }
  await doGenerateAllVoice()
}

async function batchFillSubtitles() {
  batchFillingSubtitles.value = true
  try {
    const toUpdate = shots.value.filter(s => !s.subtitle && (s.narration || s.dialogue))
    if (toUpdate.length === 0) { toast.info('所有镜头的字幕已填充'); return }
    await Promise.all(toUpdate.map(s =>
      videoStore.updateShot(props.videoId, s.id, { subtitle: (s.dialogue || s.narration || '').trim() } as any)
    ))
    toast.success(`已填充 ${toUpdate.length} 个镜头的字幕`)
  } catch (e: any) {
    toast.error('填充失败：' + (e.message || ''))
  } finally {
    batchFillingSubtitles.value = false
  }
}

// Cache for voice segments: key = shotId, value = segments array.
// Avoids re-fetching every time the user opens the segment panel or switches tabs.
const segmentCache = reactive(new Map<number, ShotVoiceSegment[]>())

function invalidateSegmentCache(shotId: number) {
  segmentCache.delete(shotId)
}

async function loadSegments(shot: StoryboardShot) {
  if (loadingSegments.value[shot.id]) return
  if (segmentCache.has(shot.id)) {
    shotSegments.value[shot.id] = segmentCache.get(shot.id)!
    return
  }
  loadingSegments.value[shot.id] = true
  try {
    const api = useVideoApi()
    const res = await api.listVoiceSegments(props.videoId, shot.id)
    const data = res.data ?? []
    shotSegments.value[shot.id] = data
    segmentCache.set(shot.id, data)
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
    const speaker = newSegmentSpeaker.value[shot.id] || undefined
    const emotion = newSegmentEmotion.value[shot.id] || undefined
    const language = newSegmentLanguage.value[shot.id] || undefined
    const res = await api.appendVoiceSegment(props.videoId, shot.id, { text, speaker, emotion, language })
    const updated = [...(shotSegments.value[shot.id] || []), res.data!]
    shotSegments.value[shot.id] = updated
    segmentCache.set(shot.id, updated)
    newSegmentText.value[shot.id] = ''
    newSegmentLanguage.value[shot.id] = ''
    appendFormShotId.value = null
    expandedSegmentShotId.value = shot.id
  } catch (e: any) {
    toast.error('添加片段失败：' + (e.message || ''))
  }
}

async function handleInsertSegment(shot: StoryboardShot, afterSeqNo: number) {
  const key = `${shot.id}_ins_${afterSeqNo}`
  const text = ((newSegmentText.value[key]) || '').trim()
  if (!text) return
  try {
    const api = useVideoApi()
    await api.insertVoiceSegment(props.videoId, shot.id, afterSeqNo, { text })
    invalidateSegmentCache(shot.id)
    await loadSegments(shot)
    delete newSegmentText.value[key]
    insertAfterSeqNo.value[shot.id] = null
  } catch (e: any) {
    toast.error('插入片段失败：' + (e.message || ''))
  }
}

async function handleDeleteSegment(shot: StoryboardShot, seg: ShotVoiceSegment) {
  if (!confirm(`确认删除第 ${seg.seq_no} 段配音？`)) return
  try {
    const api = useVideoApi()
    await api.deleteVoiceSegment(props.videoId, shot.id, seg.id)
    shotSegments.value[shot.id] = (shotSegments.value[shot.id] || []).filter(s => s.id !== seg.id)
    invalidateSegmentCache(shot.id)
  } catch (e: any) {
    toast.error('删除片段失败：' + (e.message || ''))
  }
}

async function handleGenerateSegmentVoice(shot: StoryboardShot, seg: ShotVoiceSegment) {
  if (!await guardAiProvider('TTS')) return
  // 等待正在进行的片段文本保存完成，避免竞态
  if (segmentSaveInFlight) await segmentSaveInFlight
  generatingSegmentVoice.value[seg.id] = true
  try {
    const api = useVideoApi()
    const res = await api.generateSegmentVoice(props.videoId, shot.id, seg.id, narrationVoice.value || undefined)
    const taskId = res.data?.task_id
    if (taskId) {
      toast.info(`片段 ${seg.seq_no} 配音生成中…`)
      useTaskStore().trackTask(taskId, async (task) => {
        generatingSegmentVoice.value[seg.id] = false
        if (task.status === 'completed') {
          invalidateSegmentCache(shot.id)
          await loadSegments(shot)
          await videoStore.fetchStoryboard(props.videoId)
          toast.success(`片段 ${seg.seq_no} 配音已完成`)
        } else {
          toast.error(`片段 ${seg.seq_no} 配音失败`)
        }
      })
    } else {
      generatingSegmentVoice.value[seg.id] = false
      invalidateSegmentCache(shot.id)
      await loadSegments(shot)
      await videoStore.fetchStoryboard(props.videoId)
      toast.success(`片段 ${seg.seq_no} 配音已完成`)
    }
  } catch (e: any) {
    toast.error('配音失败：' + (e.message || ''))
    generatingSegmentVoice.value[seg.id] = false
  }
}

function saveShotImage(shot: StoryboardShot, newUrl: string) {
  const idx = videoStore.storyboard.findIndex(s => s.id === shot.id)
  if (idx >= 0) videoStore.storyboard[idx].image_url = newUrl
  videoApi.updateShotImageUrl(props.videoId, shot.id, newUrl).catch(() => {})
}

// ── 缺失音色警告弹窗 ──────────────────────────────────────────────────────────
import type { Character } from '~/types'

const showVoiceWarningModal = ref(false)
const missingVoiceChars = ref<Character[]>([])
const narrationVoiceMissing = ref(false)

function findCharsWithoutVoice(): Character[] {
  const speakerNames = new Set<string>()
  for (const shot of shots.value) {
    if (shot.dialogue) {
      const { speaker } = parseDialogue(shot.dialogue)
      if (speaker) speakerNames.add(speaker.trim())
    }
  }
  if (speakerNames.size === 0) return []
  return characters.value.filter(c => speakerNames.has(c.name) && !c.voice_id)
}

async function doGenerateAllVoice() {
  batchVoiceGenerating.value = true
  try {
    const api = useVideoApi()
    const res = await api.batchGenerateVoice(props.videoId, {
      subtitle_enabled: subtitleEnabled.value,
      skip_existing: true,
    })
    const taskId = (res as any)?.data?.task_id
    const shotCount = (res as any)?.data?.shot_count ?? 0
    if (!taskId) {
      toast.success((res as any)?.message || '所有分镜已有配音')
      batchVoiceGenerating.value = false
      return
    }
    toast.info(`批量配音任务已提交（${shotCount} 个分镜）`)
    const taskStore = useTaskStore()
    taskStore.trackTask(taskId, async (task) => {
      batchVoiceGenerating.value = false
      if (task.status === 'completed') {
        await videoStore.fetchStoryboard(props.videoId)
        const d = task.data as any
        toast.success(`批量配音完成：成功 ${d?.success ?? 0} 个，失败 ${d?.fail ?? 0} 个`)
      } else {
        toast.error('批量配音任务失败，请重试')
      }
    }, () => videoStore.fetchStoryboard(props.videoId))
  } catch (e: any) {
    toast.error('批量配音提交失败：' + (e.message || ''))
    batchVoiceGenerating.value = false
  }
}

// Dialogue character replacement
const speakerDropdownShotId = ref<number | null>(null)
const dropdownShot = ref<StoryboardShot | null>(null)
const dropdownPos = ref({ top: 0, left: 0 })

function parseDialogue(dialogue: string): { speaker: string; text: string } {
  const idx = dialogue.indexOf('：')
  if (idx > 0) return { speaker: dialogue.slice(0, idx), text: dialogue.slice(idx + 1) }
  const asciiIdx = dialogue.indexOf(':')
  if (asciiIdx > 0 && asciiIdx < 15) return { speaker: dialogue.slice(0, asciiIdx), text: dialogue.slice(asciiIdx + 1).trimStart() }
  return { speaker: '', text: dialogue }
}

function openSpeakerDropdown(event: MouseEvent, shot: StoryboardShot) {
  const btn = event.currentTarget as HTMLElement
  const rect = btn.getBoundingClientRect()
  dropdownPos.value = { top: rect.bottom + 4, left: rect.left }
  if (speakerDropdownShotId.value === shot.id) {
    speakerDropdownShotId.value = null
    dropdownShot.value = null
  } else {
    speakerDropdownShotId.value = shot.id
    dropdownShot.value = shot
  }
}

async function handleChangeDialogueSpeaker(shot: StoryboardShot, newSpeaker: string) {
  const { text } = parseDialogue(shot.dialogue || '')
  const newDialogue = `${newSpeaker}：${text}`
  try {
    await videoStore.updateShot(props.videoId, shot.id, { dialogue: newDialogue })
  } catch (e: any) {
    toast.error('更新角色失败：' + (e.message || ''))
  }
}

async function clearShotField(shot: StoryboardShot, field: 'dialogue' | 'narration') {
  try {
    await videoStore.updateShot(props.videoId, shot.id, { [field]: '' } as any)
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || ''))
  }
}

onMounted(async () => {
  await Promise.allSettled(shots.value.map(s => loadSegments(s)))
})

onUnmounted(() => {})

// ── 内联编辑旁白 / 对白 ──────────────────────────────────────────────────────
const editingShotId = ref<number | null>(null)
const editingField  = ref<'narration' | 'dialogue' | null>(null)
const editingText   = ref('')

function startEditNarration(shot: StoryboardShot) {
  editingShotId.value = shot.id
  editingField.value  = 'narration'
  editingText.value   = shot.narration || ''
}

function startEditDialogueText(shot: StoryboardShot) {
  editingShotId.value = shot.id
  editingField.value  = 'dialogue'
  editingText.value   = parseDialogue(shot.dialogue || '').text
}

async function saveEdit(shot: StoryboardShot) {
  if (editingShotId.value !== shot.id) return
  const text = editingText.value.trim()
  const field = editingField.value
  cancelEdit()
  if (!field) return
  const p = (async () => {
    try {
      if (field === 'narration') {
        await videoStore.updateShot(props.videoId, shot.id, { narration: text })
      } else if (field === 'dialogue') {
        const { speaker } = parseDialogue(shot.dialogue || '')
        const newDialogue = speaker ? `${speaker}：${text}` : text
        await videoStore.updateShot(props.videoId, shot.id, { dialogue: newDialogue })
      }
    } catch (e: any) {
      toast.error('保存失败：' + (e.message || ''))
    } finally {
      shotSaveInFlight = null
    }
  })()
  shotSaveInFlight = p
  await p
}

function cancelEdit() {
  editingShotId.value = null
  editingField.value  = null
  editingText.value   = ''
}

const emotionColorMap: Record<string, string> = {
  平静: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400',
  悲伤: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  哀愁: 'bg-blue-100 dark:bg-blue-900/30 text-blue-500 dark:text-blue-400',
  紧张: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
  悬疑: 'bg-amber-100 dark:bg-amber-900/30 text-amber-500 dark:text-amber-400',
  愤怒: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  惊恐: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
  压抑: 'bg-purple-100 dark:bg-purple-900/30 text-purple-500 dark:text-purple-400',
  喜悦: 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400',
  振奋: 'bg-green-100 dark:bg-green-900/30 text-green-500 dark:text-green-400',
  浪漫: 'bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400',
  释怀: 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400',
}

function emotionClass(tone: string | undefined): string {
  if (!tone) return ''
  return emotionColorMap[tone] ?? 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
}

// Expose shotAudioUrls & shotSegments for parent (TimelineTab needs them)
defineExpose({ shotAudioUrls, shotSegments, loadSegments, expandedSegmentShotId })
</script>

<template>
  <div class="space-y-4">
    <!-- AI assistant sidebar teleport slot -->
    <Teleport to="#voice-ai-slot">
      <div class="p-4 space-y-4">
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
            {{ batchVoiceGenerating ? '生成中…' : '生成全部配音' }}
          </button>
        </div>
      </div>
    </Teleport>

    <!-- 缺失音色警告弹窗 -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="showVoiceWarningModal" class="fixed inset-0 z-[300] flex items-center justify-center p-4">
          <div class="absolute inset-0 bg-black/50" @click="showVoiceWarningModal = false" />
          <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
            <!-- 标题 -->
            <div class="flex items-start gap-3">
              <div class="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <svg class="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <h3 class="text-base font-semibold text-gray-900 dark:text-white">音色未配置</h3>
                <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  以下配音项尚未设置音色，请前往对应页面配置后再生成。
                </p>
              </div>
            </div>

            <!-- 未配置列表 -->
            <div class="space-y-2 max-h-52 overflow-y-auto">
              <!-- 旁白音色 -->
              <div
                v-if="narrationVoiceMissing"
                class="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <div class="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                    <svg class="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </div>
                  <span class="text-sm font-medium text-gray-800 dark:text-gray-200">旁白</span>
                  <span class="text-xs text-amber-500 dark:text-amber-400 flex-shrink-0">未设置音色</span>
                </div>
                <NuxtLink
                  :to="`/novel/${videoStore.currentVideo?.novel_id}?tab=settings`"
                  class="text-xs text-primary-600 dark:text-primary-400 hover:underline flex-shrink-0 ml-2"
                  @click="showVoiceWarningModal = false"
                >前往配置 →</NuxtLink>
              </div>
              <!-- 角色音色 -->
              <div
                v-for="char in missingVoiceChars"
                :key="char.id"
                class="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/50"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <img v-if="char.default_look?.three_view_sheet" :src="char.default_look.three_view_sheet" class="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                  <div v-else class="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center flex-shrink-0">
                    <span class="text-xs font-medium text-gray-500 dark:text-gray-400">{{ char.name[0] }}</span>
                  </div>
                  <span class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{{ char.name }}</span>
                  <span class="text-xs text-amber-500 dark:text-amber-400 flex-shrink-0">未设置音色</span>
                </div>
                <NuxtLink
                  :to="`/character/${char.id}?novelId=${videoStore.currentVideo?.novel_id}&tab=voice`"
                  class="text-xs text-primary-600 dark:text-primary-400 hover:underline flex-shrink-0 ml-2"
                  @click="showVoiceWarningModal = false"
                >前往配置 →</NuxtLink>
              </div>
            </div>

            <!-- 操作按钮 -->
            <div class="flex gap-2 pt-1">
              <button
                class="flex-1 btn-secondary text-sm"
                @click="showVoiceWarningModal = false"
              >取消</button>
              <button
                class="flex-1 btn-primary text-sm"
                @click="showVoiceWarningModal = false; doGenerateAllVoice()"
              >仍然继续生成</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Speaker dropdown — teleported to body to escape overflow:hidden clipping -->
    <Teleport to="body">
      <template v-if="dropdownShot !== null">
        <div class="fixed inset-0 z-[199]" @click="speakerDropdownShotId = null; dropdownShot = null" />
        <div
          class="fixed z-[200] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-xl min-w-[120px] max-h-52 overflow-y-auto"
          :style="{ top: dropdownPos.top + 'px', left: dropdownPos.left + 'px' }"
        >
          <button
            v-for="char in characters"
            :key="char.id"
            class="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
            :class="{ 'text-blue-600 dark:text-blue-400 font-medium': char.name === parseDialogue(dropdownShot.dialogue || '').speaker }"
            @click="handleChangeDialogueSpeaker(dropdownShot, char.name); speakerDropdownShotId = null; dropdownShot = null"
          >
            {{ char.name }}
          </button>
          <p v-if="!characters.length" class="px-3 py-2 text-xs text-gray-400">暂无角色</p>
        </div>
      </template>
    </Teleport>

    <div class="space-y-2">
      <div v-for="(shot, shotIdx) in pagedShots" :key="shot.id" class="card p-4" :class="shotIdx % 2 === 1 ? 'shot-card-alt' : ''">
        <div class="flex items-start gap-3">
          <!-- Thumbnail -->
          <div class="w-20 h-12 bg-gray-900 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center">
            <img v-if="shot.image_url" :src="shot.image_url" loading="lazy" class="w-full h-full object-cover cursor-zoom-in" @click.stop="openLightbox(shot.image_url, (currentUrl, s) => editImage(currentUrl, s, novelStore.currentNovel?.id), (u) => saveShotImage(shot, u))" />
            <span v-else class="text-xs text-gray-500">#{{ shot.shot_no }}</span>
          </div>
          <!-- Content -->
          <div class="flex-1 min-w-0">
            <!-- Top row: #N + description + mic + blue + -->
            <div class="flex items-start justify-between gap-2 mb-2">
              <div class="flex items-baseline gap-1.5 min-w-0">
                <span class="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0">#{{ shot.shot_no }}</span>
                <p class="text-xs text-gray-600 dark:text-gray-300 truncate" :title="shot.description">{{ shot.description }}</p>
              </div>
              <div class="flex items-center gap-1 flex-shrink-0">
                <!-- 添加片段 -->
                <button
                  class="p-1 rounded text-gray-400 hover:text-primary-500 dark:hover:text-primary-400 transition-colors"
                  title="添加语音片段"
                  @click="appendFormShotId = (appendFormShotId === shot.id ? null : shot.id)"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Shot built-in dialogue / narration — hidden once segments exist -->
            <div v-if="shot.dialogue && !(shotSegments[shot.id]?.length)" class="flex items-center gap-1.5 mb-1.5">
              <button
                class="text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 font-medium whitespace-nowrap flex-shrink-0"
                @click="openSpeakerDropdown($event, shot)"
              >{{ parseDialogue(shot.dialogue).speaker || '旁白' }} ▾</button>
              <span v-if="shot.emotional_tone" class="text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0" :class="emotionClass(shot.emotional_tone)">{{ shot.emotional_tone }}</span>
              <p
                v-if="editingShotId !== shot.id || editingField !== 'dialogue'"
                class="text-sm italic text-primary-500 dark:text-primary-400 flex-1 line-clamp-1 cursor-text"
                @click="startEditDialogueText(shot)"
              >{{ parseDialogue(shot.dialogue).text }}</p>
              <input
                v-else
                v-model="editingText"
                class="flex-1 text-sm italic text-primary-500 dark:text-primary-400 bg-transparent border-b border-primary-300 focus:outline-none py-0.5 px-1"
                :ref="(el) => el && (el as HTMLInputElement).focus()"
                @keydown.enter="saveEdit(shot)"
                @keydown.esc="cancelEdit"
                @blur="saveEdit(shot)"
              />
              <div class="flex items-center gap-0.5 flex-shrink-0">
                <button class="p-1 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors" :disabled="generatingVoice[shot.id]" title="生成配音" @click="handleGenerateVoice(shot)">
                  <svg v-if="generatingVoice[shot.id]" class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                </button>
                <button class="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" title="清除对白" @click="clearShotField(shot, 'dialogue')">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
            <div v-if="(shot.narration || (!shot.dialogue && shot.description)) && !(shotSegments[shot.id]?.length)" class="flex items-center gap-1.5 mb-1.5">
              <span class="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-gray-600 font-medium whitespace-nowrap flex-shrink-0">旁白</span>
              <span v-if="shot.emotional_tone" class="text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0" :class="emotionClass(shot.emotional_tone)">{{ shot.emotional_tone }}</span>
              <p
                v-if="editingShotId !== shot.id || editingField !== 'narration'"
                class="text-sm italic text-primary-500 dark:text-primary-400 flex-1 line-clamp-1 cursor-text"
                @click="startEditNarration(shot)"
              >{{ shot.narration || shot.description }}</p>
              <input
                v-else
                v-model="editingText"
                class="flex-1 text-sm italic text-primary-500 dark:text-primary-400 bg-transparent border-b border-primary-300 focus:outline-none py-0.5 px-1"
                :ref="(el) => el && (el as HTMLInputElement).focus()"
                @keydown.enter="saveEdit(shot)"
                @keydown.esc="cancelEdit"
                @blur="saveEdit(shot)"
              />
              <div class="flex items-center gap-0.5 flex-shrink-0">
                <button class="p-1 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors" :disabled="generatingVoice[shot.id]" title="生成配音" @click="handleGenerateVoice(shot)">
                  <svg v-if="generatingVoice[shot.id]" class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                </button>
                <button class="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors" title="清除旁白" @click="clearShotField(shot, 'narration')">
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>

            <!-- Segment rows (inline, no collapsible panel) -->
            <div v-if="loadingSegments[shot.id]" class="text-xs text-gray-400 py-1">加载中…</div>
            <div v-else class="space-y-1.5">
              <div
                v-for="seg in (shotSegments[shot.id] || [])"
                :key="seg.id"
                class="flex items-center gap-1.5"
              >
                <!-- Character dropdown -->
                <button
                  class="text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 font-medium whitespace-nowrap flex-shrink-0"
                >{{ seg.speaker || '旁白' }} ▾</button>
                <!-- Emotion -->
                <select
                  :value="seg.emotion || segmentEmotions[seg.id] || ''"
                  class="text-[10px] px-1 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0 border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary-400"
                  :class="(seg.emotion || segmentEmotions[seg.id]) ? emotionClass(seg.emotion || segmentEmotions[seg.id]) : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'"
                  @change="handleSegmentEmotionChange(shot, seg, ($event.target as HTMLSelectElement).value)"
                >
                  <option value="">情绪</option>
                  <option v-for="e in EMOTION_OPTIONS.filter(Boolean)" :key="e" :value="e">{{ e }}</option>
                </select>
                <!-- Language / Dialect -->
                <select
                  :value="seg.language || ''"
                  class="text-[10px] px-1 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0 border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary-400"
                  :class="seg.language ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'"
                  @change="handleSegmentLanguageChange(shot, seg, ($event.target as HTMLSelectElement).value)"
                >
                  <option v-for="opt in LANGUAGE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
                <!-- Text -->
                <p
                  v-if="editingSegId !== seg.id"
                  class="text-sm italic text-primary-500 dark:text-primary-400 flex-1 line-clamp-1 cursor-text"
                  @click="editingSegId = seg.id; editingSegText = seg.text"
                >{{ seg.text }}</p>
                <input
                  v-else
                  :ref="(el) => el && (el as HTMLInputElement).focus()"
                  v-model="editingSegText"
                  class="flex-1 text-sm italic text-primary-500 dark:text-primary-400 bg-transparent border-b border-primary-300 focus:outline-none py-0.5 px-1"
                  @keydown.enter="saveSegmentText(shot, seg)"
                  @keydown.esc="editingSegId = null"
                  @blur="saveSegmentText(shot, seg)"
                />
                <!-- Audio preview -->
                <audio
                  v-if="seg.audio_url"
                  :key="seg.audio_url"
                  :src="seg.audio_url"
                  controls
                  class="h-6 flex-shrink-0"
                  style="max-width: 160px"
                />
                <!-- Actions -->
                <div class="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    class="p-1 rounded text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
                    :disabled="generatingSegmentVoice[seg.id]"
                    title="生成配音"
                    @click="handleGenerateSegmentVoice(shot, seg)"
                  >
                    <svg v-if="generatingSegmentVoice[seg.id]" class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  </button>
                  <button
                    class="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                    title="删除此片段"
                    @click="handleDeleteSegment(shot, seg)"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>

              <!-- Append form (shown when + clicked) -->
              <div v-if="appendFormShotId === shot.id" class="flex items-center gap-1.5">
                <select
                  v-model="newSegmentSpeaker[shot.id]"
                  class="text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 font-medium flex-shrink-0 focus:outline-none"
                >
                  <option value="">旁白</option>
                  <option v-for="c in characters" :key="c.id" :value="c.name">{{ c.name }}</option>
                </select>
                <select
                  v-model="newSegmentEmotion[shot.id]"
                  class="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium flex-shrink-0 focus:outline-none"
                >
                  <option value="">情绪</option>
                  <option v-for="e in EMOTION_OPTIONS.filter(Boolean)" :key="e" :value="e">{{ e }}</option>
                </select>
                <select
                  v-model="newSegmentLanguage[shot.id]"
                  class="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 font-medium flex-shrink-0 focus:outline-none"
                >
                  <option v-for="opt in LANGUAGE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
                <input
                  v-model="newSegmentText[shot.id]"
                  class="flex-1 text-sm italic text-primary-500 dark:text-primary-400 bg-transparent border-b border-gray-200 dark:border-gray-600 focus:border-primary-400 focus:outline-none py-0.5 px-1 placeholder-gray-400"
                  placeholder="输入台词，按 Enter 追加…"
                  autofocus
                  @keydown.enter="handleAppendSegment(shot)"
                />
                <button
                  v-if="(newSegmentText[shot.id] || '').trim()"
                  class="text-xs text-primary-500 hover:text-primary-600 flex-shrink-0 font-medium"
                  @click="handleAppendSegment(shot)"
                >追加</button>
                <button class="text-xs text-gray-400 hover:text-gray-600 flex-shrink-0" @click="appendFormShotId = null">✕</button>
              </div>
            </div>

            <audio v-if="shotAudioUrls[shot.id]" :key="shotAudioUrls[shot.id]" :src="shotAudioUrls[shot.id]" controls class="mt-2 w-full h-8" />
          </div>
        </div>
      </div>
      <ShotsPaginationBar
        :current-page="currentPage"
        :total-pages="totalPages"
        :total-items="shots.length"
        :page-numbers="pageNumbers"
        @update:current-page="currentPage = $event"
      />
    </div>
  </div>
</template>

<style scoped>
.shot-card-alt {
  background-color: #e8edf5;
}
.dark .shot-card-alt {
  background-color: #1a2640;
}
</style>
