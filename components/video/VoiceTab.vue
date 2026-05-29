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
const insertAfterSeqNo = ref<Record<number, number | null>>({})

// Sync audio URLs from storyboard
watch(shots, (list) => {
  for (const shot of list) {
    if (shot.audio_url && !shotAudioUrls.value[shot.id]) {
      shotAudioUrls.value[shot.id] = shot.audio_url
    }
  }
}, { immediate: true })

async function handleGenerateVoice(shot: StoryboardShot) {
  if (generatingVoice.value[shot.id]) return
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
          const base = ((task.data as any)?.audio_url as string | undefined)
            || `/api/v1/videos/${props.videoId}/storyboard/${shot.id}/audio`
          const sep = base.includes('?') ? '&' : '?'
          shotAudioUrls.value[shot.id] = `${base}${sep}t=${Date.now()}`
          await videoStore.fetchStoryboard(props.videoId)
        } else {
          toast.error(`镜头 #${shot.shot_no} 主配音生成失败`)
        }
      })
    }

    // 2. 加载并重新生成所有语音片段
    await loadSegments(shot)
    const segs = shotSegments.value[shot.id] || []
    for (const seg of segs) {
      try {
        generatingSegmentVoice.value[seg.id] = true
        const segRes = await api.generateSegmentVoice(props.videoId, shot.id, seg.id)
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
  if (shots.value.length === 0) { toast.error('没有分镜，无法生成配音'); return }
  if (batchVoiceGenerating.value) { toast.info('配音批量任务进行中…'); return }
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
  const key = `${shot.id}_ins_${afterSeqNo}`
  const text = ((newSegmentText.value[key]) || '').trim()
  if (!text) return
  try {
    const api = useVideoApi()
    await api.insertVoiceSegment(props.videoId, shot.id, afterSeqNo, { text })
    await loadSegments(shot)
    delete newSegmentText.value[key]
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
          await videoStore.fetchStoryboard(props.videoId)
          toast.success(`片段 ${seg.seq_no} 配音已完成`)
        } else {
          toast.error(`片段 ${seg.seq_no} 配音失败`)
        }
      })
    } else {
      generatingSegmentVoice.value[seg.id] = false
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

// Expose shotAudioUrls & shotSegments for parent (TimelineTab needs them)
defineExpose({ shotAudioUrls, shotSegments, loadSegments, expandedSegmentShotId })
</script>

<template>
  <div class="space-y-4">
    <!-- AI assistant sidebar teleport slot -->
    <Teleport to="#voice-ai-slot">
      <div class="p-4 space-y-4">
        <!-- 配音模式 -->
        <div>
          <p class="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">配音模式</p>
          <div class="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <!-- TODO: 对白+旁白 mode not yet implemented; button disabled until feature is ready -->
            <button class="flex-1 px-2.5 py-1.5 text-xs transition-colors bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 opacity-50 cursor-not-allowed" disabled>对白+旁白</button>
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
            <NuxtLink :to="`/novel/${videoStore.currentVideo?.novel_id}?tab=settings`" class="text-green-500 hover:underline ml-1" title="在项目配置中修改字幕样式">编辑样式</NuxtLink>
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
            {{ batchVoiceGenerating ? '生成中…' : '生成全部配音' }}
          </button>
        </div>
      </div>
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
      <div v-for="shot in pagedShots" :key="shot.id" class="card p-4">
        <div class="flex items-start gap-3">
          <!-- Thumbnail -->
          <div class="w-20 h-12 bg-gray-900 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center">
            <img v-if="shot.image_url" :src="shot.image_url" class="w-full h-full object-cover cursor-zoom-in" @click.stop="openLightbox(shot.image_url, (s) => editImage(lightboxUrl.value, s, novelStore.currentNovel?.id), (u) => saveShotImage(shot, u))" />
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
                  {{ generatingVoice[shot.id] ? '生成中…' : '生成配音' }}
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
            <!-- Dialogue shot: character badge + text -->
            <div v-if="shot.dialogue && !shot.narration" class="flex items-start gap-1.5">
              <div class="flex-shrink-0">
                <button
                  class="text-xs px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors font-medium whitespace-nowrap"
                  @click.stop="openSpeakerDropdown($event, shot)"
                >
                  {{ parseDialogue(shot.dialogue).speaker || '未知角色' }} ▾
                </button>
              </div>
              <p class="text-sm italic text-blue-500 dark:text-blue-400 leading-relaxed line-clamp-2 flex-1">
                {{ parseDialogue(shot.dialogue).text }}
              </p>
            </div>
            <!-- Narration / description shot -->
            <p v-else class="text-sm text-gray-600 dark:text-gray-400 leading-relaxed line-clamp-2">
              {{ shot.narration || shot.description || '（无台词）' }}
            </p>
            <audio v-if="shotAudioUrls[shot.id]" :src="shotAudioUrls[shot.id]" controls class="mt-1.5 w-full h-8" />
          </div>
        </div>

        <!-- Multi-segment panel -->
        <div v-if="expandedSegmentShotId === shot.id" class="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <div v-if="loadingSegments[shot.id]" class="text-xs text-gray-400 py-2 text-center">加载中…</div>
          <div v-else class="space-y-2">
            <p class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">语音片段列表（按顺序播放）</p>

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
