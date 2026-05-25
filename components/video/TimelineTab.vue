<script setup lang="ts">
import type { StoryboardShot, ShotVoiceSegment, VideoBGMSegment, ShotSFXItem } from '~/types'
import { getAuthToken } from '~/utils/auth'
import { TRANSITION_OPTIONS } from '~/constants/status'

const props = defineProps<{
  videoId: number
  bgmSegments: VideoBGMSegment[]
  bgmVolume: number
  shotAudioUrls: Record<number, string>
  shotSegments: Record<number, ShotVoiceSegment[]>
  sfxItems: Record<number, ShotSFXItem[]>
  /** When true, renders the Export tab content instead of the Timeline grid */
  showExport?: boolean
  /** When true, disables Teleport and renders the sidebar panel inline (standalone page) */
  inlineSidebar?: boolean
}>()

const videoStore = useVideoStore()
const novelStore = useNovelStore()
const toast = useToast()

const shots = computed(() => videoStore.storyboard)
const { subtitleEnabled, subtitleConfig } = useSubtitleConfig()

const TL_PX_PER_SEC = 16
const DEFAULT_SHOT_DURATION_S = 5
const TIMELINE_TICK_INTERVAL_MS = 100

// Timeline state
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
const timelineDownloading = ref(false)

// Fix 1: Track active document listeners for cleanup on unmount
const activeDocListeners = ref<Array<{ event: string; fn: EventListenerOrEventListenerObject }>>([])

function addDocListener(event: string, fn: EventListenerOrEventListenerObject) {
  document.addEventListener(event, fn)
  activeDocListeners.value.push({ event, fn })
}

function removeDocListener(event: string, fn: EventListenerOrEventListenerObject) {
  document.removeEventListener(event, fn)
  activeDocListeners.value = activeDocListeners.value.filter(l => l.fn !== fn)
}

function effectiveSubtitle(shot: StoryboardShot): string {
  return shot.subtitle || shot.dialogue || shot.narration || shot.description || ''
}

const KB_ANIMATIONS = [
  'kb-zoom-in', 'kb-zoom-out', 'kb-pan-left', 'kb-pan-right',
  'kb-pan-up', 'kb-pan-down', 'kb-zoom-tl', 'kb-zoom-tr',
  'kb-zoom-bl', 'kb-zoom-br', 'kb-drift-diag', 'kb-slow-reveal',
] as const

function kenBurnsStyle(shot: StoryboardShot): string {
  const animName = KB_ANIMATIONS[shot.id % KB_ANIMATIONS.length]
  const dur = shot.duration || DEFAULT_SHOT_DURATION_S
  const state = timelinePlaying.value ? 'running' : 'paused'
  return `animation: ${animName} ${dur}s ease-in-out forwards; animation-play-state: ${state}`
}

// Pre-computed duration map: shot.id → effective duration in seconds.
// Memoizes results across all callers (template + other computeds) so the
// segment-sum reduction runs at most once per shot per reactive update.
const timelineEffectiveDurationMap = computed<Map<number, number>>(() => {
  const map = new Map<number, number>()
  for (const shot of shots.value) {
    if (timelineResizeDraft.value[shot.id] != null) {
      map.set(shot.id, timelineResizeDraft.value[shot.id])
      continue
    }
    const segs = props.shotSegments[shot.id]
    if (segs && segs.length > 0) {
      const segTotal = segs.reduce((s, seg) => s + (seg.duration_secs || 0), 0)
      if (segTotal > 0) { map.set(shot.id, Math.max(shot.duration || DEFAULT_SHOT_DURATION_S, segTotal)); continue }
    }
    map.set(shot.id, shot.duration || DEFAULT_SHOT_DURATION_S)
  }
  return map
})

function timelineEffectiveDuration(shot: StoryboardShot): number {
  return timelineEffectiveDurationMap.value.get(shot.id) ?? (shot.duration || DEFAULT_SHOT_DURATION_S)
}

const timelineOrderedShots = computed(() => {
  if (timelineShotsOrder.value.length === 0) return shots.value
  const map = Object.fromEntries(shots.value.map(s => [s.id, s]))
  return timelineShotsOrder.value.map(id => map[id]).filter(Boolean) as typeof shots.value
})

const timelineCurrentShot = computed(() => timelineOrderedShots.value[timelineCurrentShotIndex.value] ?? null)

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

const timelineBgmBlocks = computed(() => {
  const shotsArr = timelineOrderedShots.value
  const shotNoToIdx = new Map(shotsArr.map((s, i) => [s.shot_no, i]))
  const startTimes = timelineShotStartTimes.value
  return props.bgmSegments.map(seg => {
    const startIdx = shotNoToIdx.get(seg.start_shot_no) ?? 0
    const endIdx = shotNoToIdx.get(seg.end_shot_no) ?? (shotsArr.length - 1)
    const top = (startTimes[startIdx] ?? 0) * TL_PX_PER_SEC
    const endShot = shotsArr[endIdx]
    const endShotDur = endShot ? timelineEffectiveDuration(endShot) : 0
    const height = Math.max(8, ((startTimes[endIdx] ?? 0) + endShotDur) * TL_PX_PER_SEC - top)
    return { seg, top, height }
  })
})

// Computed map of SFX layout blocks keyed by shot ID.
// Replaces the per-render `timelineSfxBlocks(shotId, duration)` function call
// which was invoked twice per shot in the template (once for v-if, once for v-for).
const timelineSfxBlocksMap = computed(() => {
  const map = new Map<number, { item: (typeof props.sfxItems)[number][number]; top: number; height: number; left: number; width: number }[]>()
  for (const shot of shots.value) {
    const duration = timelineEffectiveDurationMap.value.get(shot.id) ?? DEFAULT_SHOT_DURATION_S
    const items = (props.sfxItems[shot.id] ?? []).filter(i => !i.disabled && i.url)
    if (items.length === 0) { map.set(shot.id, []); continue }
    const n = items.length
    const slotW = 100 / n
    map.set(shot.id, items.map((item, idx) => ({
      item,
      top: (item.start_offset || 0) * TL_PX_PER_SEC,
      height: Math.max(4, ((item.duration_secs || duration) * TL_PX_PER_SEC)),
      left: idx * slotW,
      width: slotW,
    })))
  }
  return map
})

function tlFmtTime(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return m > 0 ? `${m}:${s.toString().padStart(2, '0')}` : `${s}s`
}

// Subtitle styles
const timelineSubtitleTextStyle = computed(() => {
  const cfg = subtitleConfig.value
  const size = Math.max(10, Math.min(22, Math.round(cfg.font_size * 0.3)))
  const style: Record<string, string> = {
    fontSize: `${size}px`,
    color: cfg.color || '#FFFFFF',
    lineHeight: '1.4',
    display: 'inline-block',
    maxWidth: '90%',
    wordBreak: 'break-word',
    borderRadius: '3px',
    padding: '2px 8px',
  }
  if (cfg.bg_style === 'shadow') {
    style.textShadow = '1px 1px 3px rgba(0,0,0,1), -1px -1px 3px rgba(0,0,0,1), 0 0 6px rgba(0,0,0,0.8)'
  } else if (cfg.bg_style === 'box') {
    style.backgroundColor = 'rgba(0,0,0,0.72)'
  }
  return style
})

const timelineSubtitleContainerStyle = computed(() => {
  const pos = subtitleConfig.value.position
  const base: Record<string, string> = {
    position: 'absolute',
    left: '0',
    right: '0',
    textAlign: 'center',
    pointerEvents: 'none',
    zIndex: '10',
  }
  if (pos === 'top') { base.top = '8px' }
  else if (pos === 'middle') { base.top = '50%'; base.transform = 'translateY(-50%)' }
  else { base.bottom = '40px' }
  return base
})

// BGM sync
// Fix 2: Memoize BGM segment lookup as a computed instead of calling it on every tick
const timelineCurrentBgmSeg = computed(() => {
  const shot = timelineCurrentShot.value
  if (!shot) return null
  return props.bgmSegments.find(seg =>
    !!seg.url && (seg.url.startsWith('http://') || seg.url.startsWith('https://')) &&
    !seg.disabled &&
    seg.start_shot_no <= shot.shot_no &&
    shot.shot_no <= seg.end_shot_no
  ) ?? null
})

function timelineSyncBgmAudio() {
  const seg = timelineCurrentBgmSeg.value
  if (!timelineBgmRef.value) return
  if (seg?.url) {
    const el = timelineBgmRef.value
    const segVol = seg.volume > 0 ? seg.volume : 1.0
    const vol = (timelineMasterVolume.value / 100) * (props.bgmVolume / 100) * segVol
    el.volume = Math.max(0, Math.min(1, vol))
    el.muted = timelineBgmMuted.value || timelineMuted.value
    if (timelineCurrentBgmSegId.value !== seg.id) {
      timelineCurrentBgmSegId.value = seg.id
      el.src = seg.url
      el.load()
      if (timelinePlaying.value) {
        el.addEventListener('canplay', () => { el.play().catch(() => {}) }, { once: true })
      }
    } else if (timelinePlaying.value && el.paused) {
      el.play().catch(() => {})
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
  const seekTo = timelineShotElapsed.value

  function syncMediaEl(
    el: HTMLMediaElement | null,
    url: string | undefined,
    options: { volume?: number; muted?: boolean; seekOverride?: number } = {},
  ) {
    if (!el) return
    const targetSrc = url ?? ''
    const targetSeek = options.seekOverride !== undefined ? options.seekOverride : seekTo
    el.playbackRate = speed
    if (options.volume != null) el.volume = options.volume
    if (options.muted != null) el.muted = options.muted
    if (!targetSrc) { el.dataset.inkframeSrc = ''; el.src = ''; return }
    if (el.dataset.inkframeSrc === targetSrc) {
      if (Math.abs(el.currentTime - targetSeek) > 0.2) el.currentTime = targetSeek
      if (timelinePlaying.value && el.paused) el.play().catch(() => {})
    } else {
      el.dataset.inkframeSrc = targetSrc
      el.src = targetSrc
      el.addEventListener('canplay', () => {
        if (targetSeek > 0.05) el.currentTime = targetSeek
        if (timelinePlaying.value) el.play().catch(() => {})
      }, { once: true })
    }
  }

  nextTick(() => {
    syncMediaEl(timelineVideoRef.value, shot.video_url, { volume: vol })
    syncMediaEl(timelineVoiceRef.value, props.shotAudioUrls[shot.id] || shot.audio_url, { volume: vol })
    const activeSfxItems = (props.sfxItems[shot.id] ?? []).filter(i => !i.disabled && i.url)
    const activeSfxItem = activeSfxItems.find(i =>
      seekTo >= (i.start_offset || 0) &&
      (!(i.duration_secs) || seekTo < (i.start_offset || 0) + i.duration_secs)
    ) ?? activeSfxItems[0]
    const sfxUrl = activeSfxItem?.url || shot.sfx_url
    const sfxStartOffset = activeSfxItem?.start_offset ?? 0
    const sfxSeekTo = Math.max(0, seekTo - sfxStartOffset)
    const sfxMuted = timelineSfxMuted.value || timelineMuted.value ||
      (activeSfxItem != null && seekTo < sfxStartOffset)
    syncMediaEl(timelineSfxRef.value, sfxUrl, {
      volume: vol * (shot.sfx_volume ?? activeSfxItem?.volume ?? 1),
      muted: sfxMuted,
      seekOverride: sfxSeekTo,
    })
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
  timelineTimer.value = setInterval(timelineTick, TIMELINE_TICK_INTERVAL_MS)
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

let _lastDragTarget = -1
function timelineDragStart(shotId: number) { timelineDragShotId.value = shotId }
function timelineDragOver(e: DragEvent, targetId: number) {
  e.preventDefault()
  if (targetId === _lastDragTarget) return  // skip if same target — avoids redundant reorder work
  _lastDragTarget = targetId
  if (timelineDragShotId.value == null || timelineDragShotId.value === targetId) return
  const order = [...timelineShotsOrder.value]
  const from = order.indexOf(timelineDragShotId.value)
  const to = order.indexOf(targetId)
  if (from === -1 || to === -1) return
  order.splice(from, 1)
  order.splice(to, 0, timelineDragShotId.value)
  timelineShotsOrder.value = order
}
async function timelineDragEnd() {
  _lastDragTarget = -1
  timelineDragShotId.value = null
  // Persist the new shot order to the backend
  const reorderPromises = timelineShotsOrder.value.map((shotId, index) =>
    videoStore.updateShot(props.videoId, shotId, { shot_no: index + 1 }).catch((e: unknown) => {
      console.warn('[Timeline] reorder shot failed:', e)
    }),
  )
  await Promise.all(reorderPromises)
}

function timelineCycleSpeed() {
  const speeds = [0.5, 1.0, 1.5, 2.0]
  const idx = speeds.indexOf(timelinePlaybackSpeed.value)
  timelinePlaybackSpeed.value = speeds[(idx + 1) % speeds.length]
}

async function timelineDownloadCurrent() {
  if (timelineDownloading.value) return
  const config = useRuntimeConfig()
  const apiBase = config.public.apiBase
  const token = getAuthToken()
  const url = `${apiBase}/videos/${props.videoId}/download`
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
  } catch {
    toast.error('下载失败，请先完成视频拼接')
  } finally {
    timelineDownloading.value = false
  }
}

async function timelineToggleRecording() {
  if (timelineRecording.value) {
    timelineMediaRecorder.value?.stop()
    return
  }
  try {
    if (!timelinePlaying.value) timelinePlay()
    let tabStream: MediaStream
    try {
      tabStream = await (navigator.mediaDevices as any).getDisplayMedia({
        video: { frameRate: 30 },
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
      })
    } catch (err) {
      if ((err as DOMException).name === 'NotAllowedError') return
      throw err
    }
    let audioCtx: AudioContext | null = null
    let mixedTrack: MediaStreamTrack | null = null
    const audioEls = [timelineVoiceRef.value, timelineSfxRef.value, timelineBgmRef.value]
      .filter((el): el is HTMLMediaElement => el != null)
    const capturable = audioEls.filter(el => typeof (el as any).captureStream === 'function')
    if (capturable.length > 0) {
      try {
        audioCtx = new AudioContext()
        await audioCtx.resume()
        const dest = audioCtx.createMediaStreamDestination()
        for (const el of capturable) {
          try {
            const elStream: MediaStream = (el as any).captureStream()
            if (elStream.getAudioTracks().length > 0) {
              audioCtx.createMediaStreamSource(elStream).connect(dest)
            }
          } catch { /* skip */ }
        }
        mixedTrack = dest.stream.getAudioTracks()[0] ?? null
      } catch { /* ignore */ }
    }
    const finalTracks: MediaStreamTrack[] = [...tabStream.getVideoTracks()]
    if (mixedTrack) finalTracks.push(mixedTrack)
    const stream = new MediaStream(finalTracks)
    const chunks: Blob[] = []
    const mimeType = MediaRecorder.isTypeSupported('video/webm; codecs=vp9')
      ? 'video/webm; codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm') ? 'video/webm' : ''
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data) }
    tabStream.getVideoTracks()[0]?.addEventListener('ended', () => {
      if (timelineMediaRecorder.value?.state === 'recording') timelineMediaRecorder.value.stop()
    }, { once: true })
    recorder.onstop = () => {
      audioCtx?.close()
      tabStream.getTracks().forEach(t => t.stop())
      timelineRecording.value = false
      timelineMediaRecorder.value = null
      if (chunks.length === 0) { toast.error('录制内容为空，请确认屏幕共享已正常开始后再试'); return }
      const blob = new Blob(chunks, { type: recorder.mimeType || 'video/webm' })
      const filename = `inkframe-preview-${props.videoId}-${Date.now()}.webm`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
      toast.success(`录制已保存：${filename}（查看浏览器下载栏）`)
    }
    recorder.start(500)
    timelineMediaRecorder.value = recorder
    timelineRecording.value = true
  } catch (e: any) {
    toast.error('录制失败：' + ((e as Error)?.message || '浏览器不支持'))
  }
}

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
    removeDocListener('mousemove', onMove)
    removeDocListener('mouseup', onUp)
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
  addDocListener('mousemove', onMove)
  addDocListener('mouseup', onUp)
}

const debouncedSaveShot = useDebounceFn(async (shotId: number) => {
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
}, 600)

watch(timelineEditDraft, (drafts) => {
  for (const id of Object.keys(drafts)) {
    debouncedSaveShot(Number(id))
  }
}, { deep: true })

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
      duration: shot.duration || DEFAULT_SHOT_DURATION_S,
      transition: shot.transition || 'cut',
      sfx_volume: shot.sfx_volume ?? 0,
    }
  }
})

// Fix 3: Consolidate 5 separate media-property watchers into one
watch(
  [timelineMuted, timelineSfxMuted, timelineBgmMuted, timelineMasterVolume, timelinePlaybackSpeed],
  ([muted, sfxMuted, _bgmMuted, masterVolume, speed]) => {
    const vol = masterVolume / 100
    if (timelineVideoRef.value) {
      timelineVideoRef.value.muted = muted
      timelineVideoRef.value.volume = vol
      timelineVideoRef.value.playbackRate = speed
    }
    if (timelineVoiceRef.value) {
      timelineVoiceRef.value.muted = muted
      timelineVoiceRef.value.volume = vol
      timelineVoiceRef.value.playbackRate = speed
    }
    if (timelineSfxRef.value) {
      timelineSfxRef.value.muted = sfxMuted || muted
      timelineSfxRef.value.volume = vol
      timelineSfxRef.value.playbackRate = speed
    }
    timelineSyncBgmAudio()
  },
)

onUnmounted(() => {
  timelinePause()
  if (timelineMediaRecorder.value?.state === 'recording') timelineMediaRecorder.value.stop()
  // Fix 1: Remove all tracked document listeners
  for (const { event, fn } of activeDocListeners.value) {
    document.removeEventListener(event, fn)
  }
  activeDocListeners.value = []
  // Also stop any active playback timer
  if (timelineTimer.value) { clearInterval(timelineTimer.value); timelineTimer.value = null }
})

// ──────── Publish drawer open state (managed here, drawer rendered by PublishDrawer child) ────────
const publishDrawerOpen = ref(false)
</script>

<template>
  <div class="space-y-3">
    <!-- Hidden audio elements -->
    <audio ref="timelineVoiceRef" class="hidden" preload="auto" />
    <audio ref="timelineSfxRef" class="hidden" preload="auto" />
    <audio ref="timelineBgmRef" class="hidden" preload="auto" loop />

    <!-- ══ Export Tab ══════════════════════════════════════════════════════ -->
    <ExportPanel v-if="showExport" :video-id="videoId" :shots="shots" />

    <!-- ══ Timeline Grid (shown when showExport is false) ════════════════════ -->
    <!-- Vertical timeline grid (full width) -->
    <div v-if="!showExport" class="card overflow-hidden">
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
        <!-- Playhead -->
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
            <span
              class="absolute top-0.5 left-0 right-0 text-center text-[9px] font-mono leading-none"
              :class="timelineCurrentShotIndex === idx ? 'text-primary-500' : 'text-gray-400 dark:text-gray-600'"
            >
              {{ tlFmtTime(timelineShotStartTimes[idx]) }}
            </span>
            <div class="absolute top-0 right-0 w-2 h-px bg-gray-300 dark:bg-gray-600" />
            <div class="absolute bottom-0 right-0 w-2 h-px bg-gray-300 dark:bg-gray-600" />
          </div>

          <!-- Shot info cell -->
          <div
            class="w-36 flex-shrink-0 border-r border-gray-100 dark:border-gray-800 flex items-center gap-2 px-2 cursor-pointer select-none"
            :class="timelineCurrentShotIndex === idx ? 'text-primary-600 dark:text-primary-400' : 'text-gray-600 dark:text-gray-400'"
            @click="timelineSeekToShot(idx)"
          >
            <svg class="w-3 h-3 text-gray-300 dark:text-gray-600 flex-shrink-0 cursor-grab" fill="currentColor" viewBox="0 0 24 24">
              <path d="M9 5a1 1 0 100 2 1 1 0 000-2zm6 0a1 1 0 100 2 1 1 0 000-2zM9 11a1 1 0 100 2 1 1 0 000-2zm6 0a1 1 0 100 2 1 1 0 000-2zM9 17a1 1 0 100 2 1 1 0 000-2zm6 0a1 1 0 100 2 1 1 0 000-2z" />
            </svg>
            <div class="w-16 flex-shrink-0 rounded overflow-hidden bg-gray-200 dark:bg-gray-700" style="aspect-ratio:16/9">
              <img v-if="shot.image_url" :src="shot.image_url" class="w-full h-full object-cover" />
              <div v-else class="w-full h-full flex items-center justify-center">
                <span class="text-xs text-gray-400">无图</span>
              </div>
            </div>
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
            <img v-if="shot.image_url" :src="shot.image_url" class="absolute inset-0 w-full h-full object-cover opacity-10 pointer-events-none" />
            <span class="relative text-xs text-gray-600 dark:text-gray-300 line-clamp-2 leading-snug">
              {{ shot.description || shot.narration || '—' }}
            </span>
            <div
              v-if="timelineCurrentShotIndex === idx"
              class="absolute bottom-0 left-0 h-0.5 bg-primary-500 transition-none"
              :style="`width:${(timelineShotElapsed / timelineEffectiveDuration(shot)) * 100}%`"
            />
          </div>

          <!-- Voice track cell -->
          <div class="w-24 flex-shrink-0 border-r border-gray-100 dark:border-gray-800 flex items-center justify-center px-3">
            <div
              class="w-full rounded"
              :class="(shotAudioUrls[shot.id] || shot.audio_url) ? 'bg-green-400 dark:bg-green-500' : 'bg-gray-200 dark:bg-gray-700'"
              :style="`height:${Math.min(100, (timelineEffectiveDuration(shot) / (timelineTotalDuration || 1)) * 400)}%`"
            />
          </div>

          <!-- SFX track cell -->
          <div class="w-24 flex-shrink-0 border-r border-gray-100 dark:border-gray-800 relative overflow-hidden">
            <template v-if="(timelineSfxBlocksMap.get(shot.id) ?? []).length > 0">
              <div
                v-for="{ item, top, height, left, width } in timelineSfxBlocksMap.get(shot.id)"
                :key="item.id"
                class="absolute rounded-sm transition-opacity"
                :class="item.disabled ? 'opacity-20 bg-gray-400' : 'bg-orange-400 dark:bg-orange-500'"
                :style="`top:${top}px; height:${height}px; left:${left}%; width:${width}%; padding:0 1px`"
                :title="`${item.tag} · ${item.source}${item.duration_secs ? ' · ' + item.duration_secs.toFixed(1) + 's' : ''}`"
              />
            </template>
            <div
              v-else-if="shot.sfx_url"
              class="absolute inset-x-1.5 top-0 rounded-sm bg-orange-300 dark:bg-orange-700"
              :style="`height:${timelineEffectiveDuration(shot) * TL_PX_PER_SEC}px`"
              title="音效（旧格式）"
            />
            <div v-else class="absolute inset-x-1.5 top-0 bottom-0 rounded-sm bg-gray-200 dark:bg-gray-700 opacity-40" />
          </div>

          <!-- BGM spacer -->
          <div class="w-20 flex-shrink-0" />

          <!-- Resize handle -->
          <div
            class="absolute bottom-0 left-10 right-0 h-2 cursor-row-resize z-10 group/rh"
            draggable="false"
            @mousedown.stop.prevent="timelineResizeStart($event, shot.id, timelineEffectiveDuration(shot))"
          >
            <div class="absolute bottom-0 left-0 right-0 h-px bg-transparent group-hover/rh:bg-primary-400 dark:group-hover/rh:bg-primary-500 transition-colors" />
            <div
              v-if="timelineResizingShotId === shot.id"
              class="absolute bottom-1 right-2 bg-primary-600 text-white text-[10px] font-mono px-1.5 py-0.5 rounded pointer-events-none"
            >
              {{ (timelineResizeDraft[shot.id] || 0).toFixed(1) }}s
            </div>
          </div>
        </div>

        <!-- BGM segment overlay -->
        <div class="absolute top-0 right-0 w-20 pointer-events-none" :style="`height:${timelineTotalDuration * TL_PX_PER_SEC}px`">
          <div
            v-for="{ seg, top, height } in timelineBgmBlocks"
            :key="seg.id"
            class="absolute left-1 right-1 rounded overflow-hidden flex flex-col gap-0"
            :style="`top:${top}px; height:${height}px`"
            :class="seg.url ? 'bg-purple-500 dark:bg-purple-600' : 'bg-purple-200 dark:bg-purple-900/60 border border-dashed border-purple-400 dark:border-purple-600'"
          >
            <div class="px-1.5 pt-1 text-[9px] font-semibold leading-tight truncate flex-shrink-0"
              :class="seg.url ? 'text-white' : 'text-purple-600 dark:text-purple-300'">
              {{ seg.mood }}
            </div>
            <div v-if="seg.track_name && height > 32"
              class="px-1.5 text-[8px] leading-tight truncate flex-shrink-0"
              :class="seg.url ? 'text-white/70' : 'text-purple-400 dark:text-purple-400'">
              {{ seg.track_name }}
            </div>
            <div v-if="height > 48" class="flex-1 flex items-center justify-center">
              <svg class="w-3 h-3" :class="seg.url ? 'text-white/30' : 'text-purple-300 dark:text-purple-600'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
              </svg>
            </div>
          </div>
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
        <div v-if="timelineSaving[timelineSelectedShotId]" class="mt-2 flex justify-end">
          <span class="text-[10px] text-gray-400 dark:text-gray-500">保存中…</span>
        </div>
      </template>
    </div>

    <!-- Preview player — teleported into the aside panel, or rendered inline when inlineSidebar=true.
         Disabled when showExport=true because #timeline-player-slot is not available in that mode. -->
    <Teleport to="#timeline-player-slot" :disabled="inlineSidebar || showExport">
      <div v-if="!showExport" class="p-4 space-y-3">
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
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 4v16M17 4v16M3 8h4m10 0h4" />
            </svg>
            <span class="text-xs text-gray-600">点击播放预览</span>
          </div>
          <!-- Subtitle overlay -->
          <div
            v-if="subtitleEnabled && timelineCurrentShot && effectiveSubtitle(timelineCurrentShot)"
            :style="timelineSubtitleContainerStyle"
          >
            <span :style="timelineSubtitleTextStyle">
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
              <button
                class="px-1 h-5 rounded text-[9px] font-bold transition-colors"
                :class="timelineSfxMuted ? 'bg-white/15 text-white/40 line-through' : 'bg-white/20 hover:bg-white/30 text-white'"
                :title="timelineSfxMuted ? '开启音效' : '关闭音效'"
                @click="timelineSfxMuted = !timelineSfxMuted"
              >FX</button>
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

        <!-- ── Synthesize block ── -->
        <VideoSynthesizePanel :video-id="videoId" @open-publish="publishDrawerOpen = true" />

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

        <!-- Track status -->
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
          <!-- SFX mute toggle -->
          <div
            class="flex items-center gap-1.5 text-xs rounded px-1 -mx-1 cursor-pointer transition-colors"
            :class="timelineSfxMuted ? 'bg-orange-50 dark:bg-orange-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'"
            :title="timelineSfxMuted ? '点击开启音效' : '点击关闭音效'"
            @click="timelineSfxMuted = !timelineSfxMuted"
          >
            <div class="w-2 h-2 rounded-full flex-shrink-0 transition-colors" :class="timelineCurrentShot?.sfx_url && !timelineSfxMuted ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'" />
            <span class="w-10 flex-shrink-0 transition-colors" :class="timelineSfxMuted ? 'text-gray-300 dark:text-gray-600 line-through' : 'text-gray-500 dark:text-gray-400'">音效轨</span>
            <span class="truncate flex-1 transition-colors" :class="timelineSfxMuted ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400 dark:text-gray-500'">{{ timelineCurrentShot?.sfx_url ? (timelineSfxMuted ? '已静音' : '已加载') : '—' }}</span>
          </div>
          <!-- BGM mute toggle -->
          <div
            class="flex items-center gap-1.5 text-xs rounded px-1 -mx-1 cursor-pointer transition-colors"
            :class="timelineBgmMuted ? 'bg-purple-50 dark:bg-purple-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'"
            :title="timelineBgmMuted ? '点击开启背景音乐' : '点击关闭背景音乐'"
            @click="timelineBgmMuted = !timelineBgmMuted"
          >
            <div class="w-2 h-2 rounded-full flex-shrink-0 transition-colors" :class="bgmSegments.some(s => s.url) && !timelineBgmMuted ? 'bg-purple-500' : 'bg-gray-300 dark:bg-gray-600'" />
            <span class="flex-shrink-0 transition-colors whitespace-nowrap" :class="timelineBgmMuted ? 'text-gray-300 dark:text-gray-600 line-through' : 'text-gray-500 dark:text-gray-400'">背景音乐</span>
            <span class="truncate flex-1 transition-colors" :class="timelineBgmMuted ? 'text-gray-300 dark:text-gray-600' : 'text-gray-400 dark:text-gray-500'">{{ bgmSegments.length > 0 ? (timelineBgmMuted ? '已静音' : `${bgmSegments.filter(s => s.url).length}/${bgmSegments.length} 段`) : '—' }}</span>
          </div>
        </div>

        <!-- Screen recording -->
        <button
          class="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors"
          :class="timelineRecording ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300'"
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

        <!-- ── Publish drawer ── -->
        <VideoPublishDrawer :video-id="videoId" :open="publishDrawerOpen" @update:open="publishDrawerOpen = $event" />

        <p class="text-[10px] text-gray-400 dark:text-gray-600">{{ timelineOrderedShots.length }} 个镜头 · 拖拽行调整顺序</p>
      </div>
    </Teleport>
  </div>
</template>

<style>
/* Ken Burns keyframes must be non-scoped so inline animation-name references work */
@keyframes kb-zoom-in  { from { transform: scale(1.0); } to { transform: scale(1.2); } }
@keyframes kb-zoom-out { from { transform: scale(1.2); } to { transform: scale(1.0); } }
@keyframes kb-pan-left  { from { transform: scale(1.12) translateX(5%); } to { transform: scale(1.12) translateX(-5%); } }
@keyframes kb-pan-right { from { transform: scale(1.12) translateX(-5%); } to { transform: scale(1.12) translateX(5%); } }
@keyframes kb-pan-up    { from { transform: scale(1.12) translateY(5%); } to { transform: scale(1.12) translateY(-5%); } }
@keyframes kb-pan-down  { from { transform: scale(1.12) translateY(-5%); } to { transform: scale(1.12) translateY(5%); } }
@keyframes kb-zoom-tl   { from { transform: scale(1.0) translate(5%, 4%); } to { transform: scale(1.2) translate(-2%, -2%); } }
@keyframes kb-zoom-tr   { from { transform: scale(1.0) translate(-5%, 4%); } to { transform: scale(1.2) translate(2%, -2%); } }
@keyframes kb-zoom-bl   { from { transform: scale(1.0) translate(5%, -4%); } to { transform: scale(1.2) translate(-2%, 2%); } }
@keyframes kb-zoom-br   { from { transform: scale(1.0) translate(-5%, -4%); } to { transform: scale(1.2) translate(2%, 2%); } }
@keyframes kb-drift-diag { from { transform: scale(1.15) translate(-4%, -3%); } to { transform: scale(1.05) translate(4%, 3%); } }
@keyframes kb-slow-reveal {
  0%   { transform: scale(1.3); }
  40%  { transform: scale(1.15) translateX(-3%); }
  100% { transform: scale(1.0) translateX(0); }
}
</style>

<style scoped>
.timeline-preview:fullscreen .timeline-overlay,
.timeline-preview:-webkit-full-screen .timeline-overlay,
.timeline-preview:-moz-full-screen .timeline-overlay {
  opacity: 1 !important;
}
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
