<script setup lang="ts">
import type { StoryboardShot, ShotSFXItem, SFXTagItem, Asset } from '~/types'

const props = defineProps<{
  videoId: number
  promptLanguage?: string
}>()

const videoStore = useVideoStore()
const toast = useToast()

const shots = computed(() => videoStore.storyboard)
const { currentPage, totalPages, pagedShots, pageNumbers } = useShotsPagination(shots)

// ── 生成状态 ──────────────────────────────────────────────────────────────────
const generatingSFX = ref(false)
const analyzingTags = ref(false)
const generatingShotIds = ref<Record<number, boolean>>({})

const sfxAiContext = ref('')
const showSfxAiPanel = ref(true)
const sfxProvider = ref('')  // '' = 默认降级链；'kling-sfx' / 'elevenlabs-sfx' = 强制指定

const SFX_PROVIDER_OPTIONS = [
  { value: '',              label: '自动（降级链）' },
  { value: 'kling-sfx',    label: '可灵 SFX' },
  { value: 'elevenlabs-sfx', label: 'ElevenLabs' },
]

// ── 音频试听 ──────────────────────────────────────────────────────────────────
const sfxPlayingId = ref<number | null>(null)
const sfxLoadingId = ref<number | null>(null)
const sfxAudioRef = ref<HTMLAudioElement | null>(null)

// ── SFX 条目数据 ───────────────────────────────────────────────────────────────
const sfxItems = ref<Record<number, ShotSFXItem[]>>({})
const sfxItemsLoading = ref(false)

// 展开详情面板的 item id（start_offset / fade）
const expandedItemId = ref<number | null>(null)

// 音量防抖 timers
const volTimers = new Map<number, ReturnType<typeof setTimeout>>()
onUnmounted(() => volTimers.forEach(t => clearTimeout(t)))

// ── 场景预设 ──────────────────────────────────────────────────────────────────
const sfxScenePresets = [
  { label: '古风武侠', value: '古代中国武侠场景，刀剑交击、马蹄、古筝等音效' },
  { label: '仙侠玄幻', value: '修仙玄幻场景，灵气波动、法术、雷鸣等音效' },
  { label: '现代都市', value: '现代都市场景，车声、人群、室内环境音等' },
  { label: '科幻未来', value: '科幻未来场景，机械、能量、空间感等音效' },
  { label: '自然野外', value: '自然野外场景，风雨、鸟鸣、虫声、水流等' },
]

// ── 标签解析 ─────────────────────────────────────────────────────────────────
type SFXTagDisplay = { tag: string; type: 'action' | 'ambient' | 'emotion'; prompt?: string }

const sfxTagsMap = computed(() => {
  const map = new Map<number, SFXTagDisplay[]>()
  for (const shot of shots.value) {
    try {
      if (!shot.sfx_tags) { map.set(shot.id, []); continue }
      const parsed = JSON.parse(shot.sfx_tags)
      if (!Array.isArray(parsed) || parsed.length === 0) { map.set(shot.id, []); continue }
      if (typeof parsed[0] === 'string') {
        map.set(shot.id, (parsed as string[]).map(t => ({ tag: t, type: 'action' as const })))
      } else {
        map.set(shot.id, parsed as SFXTagDisplay[])
      }
    } catch {
      map.set(shot.id, [])
    }
  }
  return map
})

// 标签显示：始终显示英文 tag（Freesound 搜索词），中文 prompt 作为 tooltip
function displayLabel(t: SFXTagDisplay): string {
  return t.tag
}

// ── 场景分组辅助 ──────────────────────────────────────────────────────────────
function isNewScene(shot: StoryboardShot, idx: number): boolean {
  if (!shot.scene) return false
  if (idx === 0) return true
  return shot.scene !== pagedShots.value[idx - 1].scene
}

// ── source badge ───────────────────────────────────────────────────────────────
const SOURCE_LABELS: Record<string, string> = {
  'ai-sfx':    'AI生成',
  'freesound': 'Freesound',
  'elevenlabs': '11Labs',
  'local':     '本地',
  'audioldm':  'AudioLDM',
  'pixabay':   'Pixabay',
  'bbc-sfx':   'BBC',
  'aigei':     '爱给',
}
const SOURCE_CLASSES: Record<string, string> = {
  'ai-sfx':    'bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300',
  'freesound': 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  'elevenlabs':'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  'local':     'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  'audioldm':  'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  'pixabay':   'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  'bbc-sfx':   'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  'aigei':     'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300',
}
function sourceLabel(s: string) { return SOURCE_LABELS[s] ?? s }
function sourceClass(s: string) { return SOURCE_CLASSES[s] ?? 'bg-gray-100 dark:bg-gray-700 text-gray-500' }

// ── 数据加载 ──────────────────────────────────────────────────────────────────
async function loadSFXItems() {
  if (sfxItemsLoading.value || shots.value.length === 0) return
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

onMounted(loadSFXItems)

// ── 批量操作 ──────────────────────────────────────────────────────────────────
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
          toast.success('AI 音效标签分析完成')
        } else {
          toast.error('AI 音效标签分析失败：' + ((task as any).error || ''))
        }
      }, () => videoStore.fetchStoryboard(props.videoId))
      toast.info('AI 正在分析分镜脚本，生成精准音效搜索词…')
    } else {
      analyzingTags.value = false
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
    const opts: { user_context?: string; provider?: string } = {}
    if (sfxAiContext.value) opts.user_context = sfxAiContext.value
    if (sfxProvider.value) opts.provider = sfxProvider.value
    const res = await api.batchGenerateSFX(props.videoId, Object.keys(opts).length ? opts : undefined)
    const taskId = (res as any)?.data?.task_id
    if (taskId) {
      useTaskStore().trackTask(taskId, async (task) => {
        generatingSFX.value = false
        await videoStore.fetchStoryboard(props.videoId)
        await loadSFXItems()
        if (task.status === 'failed') {
          toast.error('音效生成失败：' + ((task as any).error || '未知错误'))
          return
        }
        const { success = 0, fail = 0 } = (task.data as any) ?? {}
        if (fail > 0) {
          toast.warning(`音效生成完成：${success} 成功，${fail} 失败`)
        } else {
          toast.success(`音效生成完成：${success} 个镜头`)
        }
      }, async () => { await videoStore.fetchStoryboard(props.videoId); await loadSFXItems() })
      toast.success('音效生成任务已提交，请在右下角任务面板查看进度')
    } else {
      generatingSFX.value = false
    }
  } catch (e: any) {
    toast.error('音效生成失败：' + (e.message || ''))
    generatingSFX.value = false
  }
}

// ── 单镜头重新生成 ─────────────────────────────────────────────────────────────
async function regenerateShotSFX(shot: StoryboardShot) {
  generatingShotIds.value[shot.id] = true
  try {
    const api = useVideoApi()
    const res = await api.generateShotSFX(props.videoId, shot.id, sfxProvider.value || undefined)
    const taskId = (res as any)?.data?.task_id
    if (taskId) {
      useTaskStore().trackTask(taskId, async (task) => {
        generatingShotIds.value[shot.id] = false
        if (task.status === 'completed') {
          const r2 = await api.listShotSFXItems(props.videoId, shot.id)
          sfxItems.value[shot.id] = (r2 as any)?.data ?? []
          toast.success(`镜头 ${shot.shot_no} 音效已重新生成`)
        } else {
          toast.error(`镜头 ${shot.shot_no} 音效生成失败`)
        }
      })
    } else {
      generatingShotIds.value[shot.id] = false
    }
  } catch (e: any) {
    toast.error('重新生成失败：' + (e.message || ''))
    generatingShotIds.value[shot.id] = false
  }
}

// ── 音频试听 ──────────────────────────────────────────────────────────────────
function onAudioError() {
  if (sfxLoadingId.value !== null || sfxPlayingId.value !== null)
    toast.error('音效链接已失效，请点击 ↻ 重新生成该镜头音效')
  sfxPlayingId.value = null
  sfxLoadingId.value = null
}

function toggleSfxPreview(item: ShotSFXItem) {
  const audio = sfxAudioRef.value
  if (!audio) return
  if (sfxPlayingId.value === item.id) {
    audio.pause(); audio.currentTime = 0
    sfxPlayingId.value = null; sfxLoadingId.value = null
    return
  }
  if (sfxPlayingId.value !== null) {
    audio.pause(); audio.currentTime = 0
    sfxPlayingId.value = null
  }
  const playUrl = item.audio_url || item.url
  if (!playUrl) { toast.error('该音效暂无可用链接'); return }
  sfxLoadingId.value = item.id
  audio.loop = item.sfx_type === 'ambient' || !!item.loop_enabled
  audio.src = playUrl
  audio.load()
  audio.play()
    .then(() => { sfxPlayingId.value = item.id; sfxLoadingId.value = null })
    .catch((e) => {
      console.warn('[SFX Preview] play failed', playUrl, e)
      toast.error('音效预览失败，请检查音频链接是否有效')
      sfxPlayingId.value = null; sfxLoadingId.value = null
    })
}

// ── SFX 条目操作 ──────────────────────────────────────────────────────────────
async function deleteSFXItem(shot: StoryboardShot, item: ShotSFXItem) {
  const api = useVideoApi()
  await api.deleteShotSFXItem(props.videoId, shot.id, item.id)
  sfxItems.value[shot.id] = (sfxItems.value[shot.id] ?? []).filter(i => i.id !== item.id)
  if (sfxPlayingId.value === item.id) {
    sfxAudioRef.value?.pause(); sfxPlayingId.value = null
  }
  if (expandedItemId.value === item.id) expandedItemId.value = null
}

async function toggleSFXItemDisabled(shot: StoryboardShot, item: ShotSFXItem) {
  const api = useVideoApi()
  const disabled = !item.disabled
  await api.toggleShotSFXItem(props.videoId, shot.id, item.id, disabled)
  patchItem(shot.id, item.id, { disabled })
}

// 通用部分更新（乐观更新 + API 保存）
function patchItem(shotId: number, itemId: number, patch: Partial<ShotSFXItem>) {
  const list = sfxItems.value[shotId]
  if (!list) return
  const idx = list.findIndex(i => i.id === itemId)
  if (idx !== -1) list.splice(idx, 1, { ...list[idx], ...patch })
}

// 音量 – 实时拖动（@input），防抖 400ms 保存
function onVolumeInput(shot: StoryboardShot, item: ShotSFXItem, value: number) {
  patchItem(shot.id, item.id, { volume: value })
  const prev = volTimers.get(item.id)
  if (prev) clearTimeout(prev)
  volTimers.set(item.id, setTimeout(async () => {
    const api = useVideoApi()
    await api.updateShotSFXItem(props.videoId, shot.id, item.id, { volume: value })
    volTimers.delete(item.id)
  }, 400))
}

// Loop 开关
async function toggleLoop(shot: StoryboardShot, item: ShotSFXItem) {
  const api = useVideoApi()
  const loop_enabled = !item.loop_enabled
  patchItem(shot.id, item.id, { loop_enabled })
  await api.updateShotSFXItem(props.videoId, shot.id, item.id, { loop_enabled })
}

// 展开详情保存（blur 触发）
async function saveItemDetail(shot: StoryboardShot, item: ShotSFXItem, field: 'start_offset' | 'fade_in_ms' | 'fade_out_ms' | 'play_count', raw: string) {
  const value = parseFloat(raw)
  if (isNaN(value) || value < 0) return
  const api = useVideoApi()
  const patch = { [field]: field === 'start_offset' ? value : Math.round(value) } as Partial<ShotSFXItem>
  patchItem(shot.id, item.id, patch)
  await api.updateShotSFXItem(props.videoId, shot.id, item.id, patch)
}

// ── 音效上传 ──────────────────────────────────────────────────────────────────
const uploadPanelFor  = ref<number | null>(null)
const uploadMode      = ref<'file' | 'url' | 'library'>('file')
const uploadTag       = ref('')
const uploadUrl       = ref('')
const uploadSfxType   = ref<'action' | 'ambient' | 'emotion'>('action')
const uploadVolume    = ref(0.4)
const uploadingFor    = ref<number | null>(null)
const fileInputRef    = ref<HTMLInputElement | HTMLInputElement[] | null>(null)
const uploadPresetTag = ref<SFXTagDisplay | null>(null)

// ── 素材库搜索 ─────────────────────────────────────────────────────────────────
const librarySearchQ   = ref('')
const libraryResults   = ref<Asset[]>([])
const librarySearching = ref(false)
const librarySelected  = ref<Asset | null>(null)
const libraryPlayingUrl = ref<string | null>(null)

function formatAssetDuration(s: number): string {
  if (s < 60) return `${Math.round(s)}s`
  return `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`
}

async function searchLibrary() {
  const q = librarySearchQ.value.trim()
  if (!q) return
  librarySearching.value = true
  libraryResults.value = []
  librarySelected.value = null
  try {
    const api = useAssetApi()
    const res = await api.searchAssets({ type: 'audio', q, page_size: 8 })
    libraryResults.value = (res as any)?.data?.items ?? []
  } catch {
    libraryResults.value = []
  } finally {
    librarySearching.value = false
  }
}

function selectLibraryAsset(asset: Asset) {
  librarySelected.value = asset
  if (!uploadTag.value) uploadTag.value = asset.title
  uploadSfxType.value = (asset.sub_type === 'ambient' ? 'ambient' : 'action') as 'action' | 'ambient' | 'emotion'
}

function toggleLibraryPreview(url: string) {
  const audio = sfxAudioRef.value
  if (!audio) return
  if (libraryPlayingUrl.value === url) {
    audio.pause(); audio.currentTime = 0
    libraryPlayingUrl.value = null
    return
  }
  if (sfxPlayingId.value !== null) { audio.pause(); sfxPlayingId.value = null }
  libraryPlayingUrl.value = url
  audio.loop = false
  audio.src = url
  audio.load()
  audio.play().catch(() => { libraryPlayingUrl.value = null })
}

watch(uploadMode, (mode) => {
  if (mode === 'library' && libraryResults.value.length === 0 && uploadPresetTag.value?.tag) {
    librarySearchQ.value = uploadPresetTag.value.tag
    searchLibrary()
  }
})

function openUploadPanel(shotId: number, tag?: SFXTagDisplay) {
  uploadPanelFor.value = shotId
  uploadMode.value = 'file'
  uploadPresetTag.value = tag ?? null
  uploadTag.value = tag?.tag ?? ''
  uploadUrl.value = ''
  uploadSfxType.value = (tag?.type as 'action' | 'ambient' | 'emotion') ?? 'action'
  uploadVolume.value = 0.4
  librarySearchQ.value = ''
  libraryResults.value = []
  librarySelected.value = null
  libraryPlayingUrl.value = null
}
function closeUploadPanel() {
  uploadPanelFor.value = null
  uploadPresetTag.value = null
  libraryPlayingUrl.value = null
  const audio = sfxAudioRef.value
  if (audio && libraryPlayingUrl.value) { audio.pause() }
}

async function doImportFile(shot: StoryboardShot) {
  const inputEl = Array.isArray(fileInputRef.value) ? fileInputRef.value[0] : fileInputRef.value
  const file = inputEl?.files?.[0]
  if (!file) { toast.error('请先选择音频文件'); return }
  const api = useVideoApi()
  uploadingFor.value = shot.id
  try {
    const res = await api.importShotSFXItemByFile(props.videoId, shot.id, file, {
      tag: uploadTag.value || file.name.replace(/\.[^.]+$/, ''),
      sfxType: uploadSfxType.value,
      volume: uploadVolume.value,
    })
    const item = (res as any).data ?? res
    sfxItems.value[shot.id] = [...(sfxItems.value[shot.id] ?? []), item]
    closeUploadPanel()
    toast.success('音效已上传')
  } catch (e: any) {
    toast.error('上传失败：' + (e.message ?? '未知错误'))
  } finally {
    uploadingFor.value = null
  }
}

async function doImportUrl(shot: StoryboardShot) {
  if (!uploadUrl.value.trim()) { toast.error('请输入音频 URL'); return }
  const api = useVideoApi()
  uploadingFor.value = shot.id
  try {
    const res = await api.importShotSFXItemByURL(props.videoId, shot.id, uploadUrl.value.trim(), {
      tag: uploadTag.value || uploadUrl.value.split('/').pop() || 'sfx',
      sfxType: uploadSfxType.value,
      volume: uploadVolume.value,
    })
    const item = (res as any).data ?? res
    sfxItems.value[shot.id] = [...(sfxItems.value[shot.id] ?? []), item]
    closeUploadPanel()
    toast.success('音效已导入')
  } catch (e: any) {
    toast.error('导入失败：' + (e.message ?? '未知错误'))
  } finally {
    uploadingFor.value = null
  }
}

async function doImportLibrary(shot: StoryboardShot) {
  if (!librarySelected.value) { toast.error('请先从素材库中选择一个音效'); return }
  const videoApi = useVideoApi()
  uploadingFor.value = shot.id
  try {
    const res = await videoApi.importShotSFXItemByURL(props.videoId, shot.id, librarySelected.value.storage_url, {
      tag: uploadTag.value || librarySelected.value.title,
      sfxType: uploadSfxType.value,
      volume: uploadVolume.value,
    })
    const item = (res as any).data ?? res
    sfxItems.value[shot.id] = [...(sfxItems.value[shot.id] ?? []), item]
    closeUploadPanel()
    toast.success('音效已从素材库导入')
  } catch (e: any) {
    toast.error('导入失败：' + (e.message ?? '未知错误'))
  } finally {
    uploadingFor.value = null
  }
}

// ── 标签编辑 ──────────────────────────────────────────────────────────────────
const editingTagsFor = ref<number | null>(null)
const editingTagsMap = ref<Record<number, SFXTagItem[]>>({})
const savingTagsFor = ref<number | null>(null)

function openTagEditor(shot: StoryboardShot) {
  editingTagsFor.value = shot.id
  const existing = sfxTagsMap.value.get(shot.id) ?? []
  editingTagsMap.value[shot.id] = existing.map(t => ({ ...t }))
}
function closeTagEditor() { editingTagsFor.value = null }
function addTag(shotId: number) {
  if (!editingTagsMap.value[shotId]) editingTagsMap.value[shotId] = []
  editingTagsMap.value[shotId].push({ tag: '', type: 'action', prompt: '' })
}
function removeTag(shotId: number, idx: number) {
  editingTagsMap.value[shotId]?.splice(idx, 1)
}

async function saveTagsForShot(shot: StoryboardShot) {
  const tags = (editingTagsMap.value[shot.id] ?? []).filter(t => t.tag.trim() !== '')
  savingTagsFor.value = shot.id
  try {
    const api = useVideoApi()
    await api.updateShotSFXTags(props.videoId, shot.id, tags)
    // 直接更新 store 中对应镜头的 sfx_tags，避免全量拉取
    const storeShots = videoStore.storyboard
    const idx = storeShots.findIndex(s => s.id === shot.id)
    if (idx !== -1) (storeShots[idx] as any).sfx_tags = JSON.stringify(tags)
    closeTagEditor()
    toast.success('音效标签已保存')
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || ''))
  } finally {
    savingTagsFor.value = null
  }
}

// Expose sfxItems for TimelineTab
defineExpose({ sfxItems, loadSFXItems })
</script>

<template>
  <div class="space-y-4">
    <!-- 隐藏音频元素 -->
    <audio
      ref="sfxAudioRef"
      class="hidden"
      @ended="sfxPlayingId = null; sfxLoadingId = null; libraryPlayingUrl = null"
      @error="onAudioError"
    />

    <!-- AI 面板 – teleport 到侧栏 -->
    <Teleport to="#sfx-ai-slot">
      <div class="card overflow-hidden">
        <button
          class="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
          @click="showSfxAiPanel = !showSfxAiPanel"
        >
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072M12 6a7 7 0 010 12M8.464 8.464a5 5 0 000 7.072" />
            </svg>
            <span class="text-sm font-medium text-gray-800 dark:text-gray-200">AI 音效生成</span>
          </div>
          <svg class="w-4 h-4 text-gray-400 transition-transform" :class="showSfxAiPanel ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        <div v-if="showSfxAiPanel" class="p-4 border-t border-gray-100 dark:border-gray-700 space-y-3">
          <!-- 场景预设 -->
          <div>
            <p class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">场景预设</p>
            <div class="flex flex-wrap gap-1.5">
              <button
                v-for="preset in sfxScenePresets"
                :key="preset.label"
                class="px-2 py-0.5 rounded-full text-xs border border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-900/30 transition-colors"
                @click="sfxAiContext = preset.value"
              >{{ preset.label }}</button>
            </div>
          </div>
          <!-- 音效提供商选择 -->
          <div>
            <p class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">音效提供商</p>
            <div class="flex gap-1.5">
              <button
                v-for="opt in SFX_PROVIDER_OPTIONS"
                :key="opt.value"
                class="px-2.5 py-1 rounded-full text-xs border transition-colors"
                :class="sfxProvider === opt.value
                  ? 'bg-orange-500 border-orange-500 text-white'
                  : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:border-orange-300 hover:text-orange-600 dark:hover:text-orange-400'"
                @click="sfxProvider = opt.value"
              >{{ opt.label }}</button>
            </div>
          </div>
          <!-- 上下文输入 -->
          <div>
            <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">额外场景背景提示（可选）</label>
            <textarea
              v-model="sfxAiContext"
              rows="2"
              class="input text-sm resize-none w-full"
              placeholder="描述场景背景，帮助 AI 生成更精准的音效搜索词..."
            />
          </div>
          <!-- 操作按钮 -->
          <div class="flex gap-2">
            <button
              class="btn-secondary text-sm flex-1"
              :disabled="analyzingTags || generatingSFX"
              @click="handleAnalyzeSFXTags"
            >
              <svg v-if="analyzingTags" class="w-3.5 h-3.5 mr-1 animate-spin inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {{ analyzingTags ? 'AI 分析中…' : 'AI 分析标签' }}
            </button>
            <button
              class="btn-primary text-sm flex-1"
              :disabled="analyzingTags || generatingSFX"
              @click="handleGenerateSFX"
            >
              <svg v-if="generatingSFX" class="w-3.5 h-3.5 mr-1 animate-spin inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {{ generatingSFX ? '生成中…' : '生成全部音效' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 镜头列表 -->
    <div class="space-y-2">
      <template v-if="shots.length === 0">
        <p class="text-sm text-gray-400 text-center py-8">请先在「分镜脚本」Tab 生成分镜</p>
      </template>

      <template v-for="(shot, shotIdx) in pagedShots" :key="shot.id">
        <!-- 场景分组标题（场景切换时显示）-->
        <div
          v-if="isNewScene(shot, shotIdx)"
          class="flex items-center gap-2 px-1 pt-2"
        >
          <span class="text-[10px] font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide">场景</span>
          <span class="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">{{ shot.scene }}</span>
          <span class="flex-1 h-px bg-gray-100 dark:bg-gray-700" />
        </div>

        <!-- 镜头卡片 -->
        <div class="card overflow-hidden" :class="shotIdx % 2 === 1 ? 'shot-card-alt' : ''">
          <!-- 镜头头部 -->
          <div class="flex items-start gap-3 p-3">
            <!-- 镜号 + 时长 -->
            <div class="flex-shrink-0 text-right mt-0.5">
              <span class="text-xs font-bold text-gray-400 block">镜 {{ shot.shot_no }}</span>
              <span
                v-if="shot.duration"
                class="text-[10px] text-gray-300 dark:text-gray-600 block"
                title="镜头时长"
              >{{ shot.duration.toFixed(1) }}s</span>
            </div>

            <div class="flex-1 min-w-0">
              <!-- 旁白预览 -->
              <p class="text-sm text-gray-700 dark:text-gray-300 line-clamp-1">
                {{ shot.narration || shot.description || '（无描述）' }}
              </p>

              <!-- 音效标签 -->
              <div class="mt-1">
                <!-- 展示模式 -->
                <div v-if="editingTagsFor !== shot.id" class="flex flex-wrap items-center gap-1">
                  <span
                    v-for="t in sfxTagsMap.get(shot.id)"
                    :key="t.tag"
                    class="group inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] border cursor-default"
                    :class="{
                      'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-800': t.type === 'action',
                      'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-100 dark:border-green-800': t.type === 'ambient',
                      'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-800': t.type === 'emotion',
                      'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-100 dark:border-orange-800': !t.type,
                    }"
                    :title="t.prompt || undefined"
                  >
                    <span v-if="t.type" class="opacity-50 text-[9px] font-mono uppercase">{{ t.type[0] }}</span>
                    {{ displayLabel(t) }}
                    <button
                      class="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 hover:text-orange-600 dark:hover:text-orange-400 flex-shrink-0"
                      title="上传此标签的音效文件"
                      @click.stop="openUploadPanel(shot.id, t)"
                    >
                      <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                    </button>
                  </span>
                  <button
                    class="text-[10px] text-gray-400 hover:text-orange-500 transition-colors px-1"
                    title="编辑标签"
                    @click.stop="openTagEditor(shot)"
                  >✎</button>
                </div>

                <!-- 编辑模式 -->
                <div v-else class="mt-1 space-y-1.5 bg-gray-50 dark:bg-gray-800/60 rounded-lg p-2">
                  <div v-for="(t, idx) in editingTagsMap[shot.id]" :key="idx" class="space-y-1">
                    <div class="flex items-center gap-1.5">
                      <!-- type selector -->
                      <select
                        v-model="t.type"
                        class="text-[10px] border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 px-1 py-0.5 w-16 flex-shrink-0"
                      >
                        <option value="action">动作</option>
                        <option value="ambient">环境</option>
                        <option value="emotion">情绪</option>
                      </select>
                      <!-- English tag -->
                      <input
                        v-model="t.tag"
                        type="text"
                        placeholder="English tag (Freesound)"
                        class="flex-1 text-xs border border-gray-200 dark:border-gray-600 rounded px-2 py-0.5 bg-white dark:bg-gray-700 min-w-0 font-mono"
                        @keyup.enter="saveTagsForShot(shot)"
                      />
                      <!-- delete -->
                      <button
                        class="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                        @click="removeTag(shot.id, idx)"
                      >
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                    <!-- Chinese prompt (always shown) -->
                    <input
                      v-model="t.prompt"
                      type="text"
                      placeholder="中文描述（供 AI 文生音效使用，可留空）"
                      class="w-full text-xs border border-gray-200 dark:border-gray-600 rounded px-2 py-0.5 bg-white dark:bg-gray-700 text-gray-500 ml-[4.5rem]"
                      @keyup.enter="saveTagsForShot(shot)"
                    />
                  </div>

                  <!-- add + save/cancel -->
                  <div class="flex items-center gap-1.5 pt-0.5">
                    <button class="text-[10px] text-orange-600 hover:text-orange-700 flex items-center gap-0.5" @click="addTag(shot.id)">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                      </svg>
                      添加
                    </button>
                    <span class="flex-1" />
                    <button class="text-[10px] px-2 py-0.5 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" @click="closeTagEditor">取消</button>
                    <button
                      class="text-[10px] px-2 py-0.5 rounded bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50"
                      :disabled="savingTagsFor === shot.id"
                      @click="saveTagsForShot(shot)"
                    >{{ savingTagsFor === shot.id ? '保存中…' : '保存' }}</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- 上传音效按钮 -->
            <button
              class="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
              :class="{ 'text-orange-500 bg-orange-50 dark:bg-orange-900/20': uploadPanelFor === shot.id }"
              title="上传音效（本地文件或 URL）"
              @click="uploadPanelFor === shot.id ? closeUploadPanel() : openUploadPanel(shot.id)"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </button>

            <!-- 单镜头重新生成按钮 -->
            <button
              class="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-gray-400 hover:text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
              :class="{ 'text-orange-400': generatingShotIds[shot.id] }"
              :disabled="generatingShotIds[shot.id] || generatingSFX"
              :title="generatingShotIds[shot.id] ? '生成中…' : '重新生成本镜头音效'"
              @click="regenerateShotSFX(shot)"
            >
              <svg
                class="w-3.5 h-3.5"
                :class="{ 'animate-spin': generatingShotIds[shot.id] }"
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>

          <!-- SFX 条目列表 -->
          <div v-if="(sfxItems[shot.id] ?? []).length > 0" class="border-t border-gray-100 dark:border-gray-700">
            <template v-for="item in sfxItems[shot.id]" :key="item.id">
              <!-- 主行 -->
              <div
                class="flex items-center gap-1.5 px-3 py-1.5 border-b border-gray-50 dark:border-gray-800/80 last:border-b-0 text-xs"
                :class="item.disabled ? 'opacity-40' : ''"
              >
                <!-- 启用/禁用开关 -->
                <button
                  class="relative w-7 h-4 rounded-full flex-shrink-0 transition-colors"
                  :class="item.disabled ? 'bg-gray-200 dark:bg-gray-600' : 'bg-orange-400 dark:bg-orange-500'"
                  :title="item.disabled ? '点击启用' : '点击禁用'"
                  @click="toggleSFXItemDisabled(shot, item)"
                >
                  <span class="absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform" :class="item.disabled ? 'left-0.5' : 'left-3.5'" />
                </button>

                <!-- 来源 badge -->
                <span class="text-[10px] px-1.5 py-0.5 rounded font-mono flex-shrink-0" :class="sourceClass(item.source)">
                  {{ sourceLabel(item.source) }}
                </span>

                <!-- 标签/描述（优先显示中文 prompt） -->
                <span
                  class="flex-1 text-xs text-gray-700 dark:text-gray-300 truncate min-w-0"
                  :title="item.tag"
                >{{ item.tag }}</span>

                <!-- 音量滑块（实时 @input + 防抖保存） -->
                <input
                  type="range" min="0.05" max="1" step="0.05"
                  :value="item.volume"
                  class="w-16 accent-orange-500 flex-shrink-0 cursor-pointer"
                  @input="onVolumeInput(shot, item, parseFloat(($event.target as HTMLInputElement).value))"
                />
                <span class="text-[10px] text-gray-400 w-7 text-right flex-shrink-0">{{ Math.round((item.volume ?? 0.4) * 100) }}%</span>

                <!-- 音效时长（超出镜头时长时标黄警告） -->
                <span
                  v-if="item.duration_secs && item.duration_secs > 0"
                  class="text-[10px] w-9 text-right flex-shrink-0"
                  :class="shot.duration && item.duration_secs > shot.duration * 1.1
                    ? 'text-amber-500 dark:text-amber-400 font-medium'
                    : 'text-gray-400'"
                  :title="shot.duration && item.duration_secs > shot.duration * 1.1
                    ? `音效 ${item.duration_secs.toFixed(1)}s 超出镜头时长 ${shot.duration.toFixed(1)}s`
                    : `时长 ${item.duration_secs.toFixed(1)}s`"
                >{{ item.duration_secs.toFixed(1) }}s</span>

                <!-- 试听按钮 -->
                <button
                  class="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
                  :class="sfxPlayingId === item.id
                    ? 'bg-orange-500 text-white'
                    : sfxLoadingId === item.id
                      ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-400'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-orange-500'"
                  :title="sfxPlayingId === item.id ? '停止' : sfxLoadingId === item.id ? '加载中…' : '试听'"
                  :disabled="sfxLoadingId !== null && sfxLoadingId !== item.id"
                  @click="toggleSfxPreview(item)"
                >
                  <svg v-if="sfxLoadingId === item.id" class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <svg v-else-if="sfxPlayingId === item.id" class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                  <svg v-else class="w-3 h-3 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </button>

                <!-- 展开/收起详情 -->
                <button
                  class="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-colors text-gray-400"
                  :class="expandedItemId === item.id ? 'bg-gray-200 dark:bg-gray-600 text-gray-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'"
                  :title="expandedItemId === item.id ? '收起详情' : '展开：触发时间 / 淡入淡出'"
                  @click="expandedItemId = expandedItemId === item.id ? null : item.id"
                >
                  <svg class="w-3 h-3 transition-transform" :class="expandedItemId === item.id ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                <!-- 删除 -->
                <button
                  class="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  @click="deleteSFXItem(shot, item)"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <!-- 详情展开行：触发时间 + 淡入淡出 -->
              <div
                v-if="expandedItemId === item.id"
                class="flex items-center gap-4 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700 text-xs"
              >
                <!-- 触发时间 -->
                <label class="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                  <span class="text-[10px] whitespace-nowrap">触发</span>
                  <input
                    type="number" step="0.1" min="0"
                    :max="shot.duration || undefined"
                    :value="item.start_offset ?? 0"
                    class="w-14 text-xs border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 bg-white dark:bg-gray-700 text-center"
                    :title="`触发时间（秒），0=镜头起始，最大 ${shot.duration?.toFixed(1) ?? '∞'}s`"
                    @blur="saveItemDetail(shot, item, 'start_offset', ($event.target as HTMLInputElement).value)"
                    @keyup.enter="($event.target as HTMLInputElement).blur()"
                  />
                  <span class="text-[10px] text-gray-400">s</span>
                </label>

                <!-- 淡入 -->
                <label class="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                  <span class="text-[10px] whitespace-nowrap">淡入</span>
                  <input
                    type="number" step="10" min="0" max="5000"
                    :value="item.fade_in_ms ?? 0"
                    class="w-14 text-xs border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 bg-white dark:bg-gray-700 text-center"
                    @blur="saveItemDetail(shot, item, 'fade_in_ms', ($event.target as HTMLInputElement).value)"
                    @keyup.enter="($event.target as HTMLInputElement).blur()"
                  />
                  <span class="text-[10px] text-gray-400">ms</span>
                </label>

                <!-- 淡出 -->
                <label class="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                  <span class="text-[10px] whitespace-nowrap">淡出</span>
                  <input
                    type="number" step="10" min="0" max="5000"
                    :value="item.fade_out_ms ?? 0"
                    class="w-14 text-xs border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 bg-white dark:bg-gray-700 text-center"
                    @blur="saveItemDetail(shot, item, 'fade_out_ms', ($event.target as HTMLInputElement).value)"
                    @keyup.enter="($event.target as HTMLInputElement).blur()"
                  />
                  <span class="text-[10px] text-gray-400">ms</span>
                </label>

                <!-- 播放次数 -->
                <label class="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
                  <span class="text-[10px] whitespace-nowrap">播放次数</span>
                  <input
                    type="number" step="1" min="0" max="99"
                    :value="item.play_count ?? 1"
                    class="w-12 text-xs border border-gray-200 dark:border-gray-600 rounded px-1.5 py-0.5 bg-white dark:bg-gray-700 text-center"
                    title="循环播放次数（1=播放一次，0=无限循环）"
                    @blur="saveItemDetail(shot, item, 'play_count', ($event.target as HTMLInputElement).value)"
                    @keyup.enter="($event.target as HTMLInputElement).blur()"
                  />
                  <span class="text-[10px] text-gray-400">次</span>
                </label>

                <!-- 时长超出提示 -->
                <span
                  v-if="shot.duration && item.duration_secs && item.duration_secs > shot.duration * 1.1"
                  class="ml-auto text-[10px] text-amber-500 dark:text-amber-400 flex items-center gap-0.5"
                >
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                  </svg>
                  音效 {{ item.duration_secs.toFixed(1) }}s 超出镜头 {{ shot.duration.toFixed(1) }}s
                </span>
              </div>
            </template>
          </div>

          <!-- 空状态 -->
          <div v-else-if="!sfxItemsLoading" class="px-3 py-2 text-xs text-gray-400 italic">
            {{ (sfxTagsMap.get(shot.id) ?? []).length > 0 ? '已分析搜索词，点击「生成全部音效」匹配音频' : '点击「AI 分析标签」或「生成全部音效」' }}
          </div>

          <!-- 上传面板 -->
          <div
            v-if="uploadPanelFor === shot.id"
            class="border-t border-orange-100 dark:border-orange-900/30 bg-orange-50/50 dark:bg-orange-900/10 px-3 py-3 space-y-2.5"
          >
            <!-- 标签来源提示 -->
            <div v-if="uploadPresetTag" class="flex items-center gap-1.5 text-[10px] text-orange-600 dark:text-orange-400">
              <svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-5 5a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 10V5a2 2 0 012-2z" />
              </svg>
              <span>为标签 <strong>{{ displayLabel(uploadPresetTag) }}</strong> 上传音效</span>
              <button class="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" @click="uploadPresetTag = null; uploadTag = ''; uploadSfxType = 'action'">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- 模式切换 -->
            <div class="flex gap-1">
              <button
                class="flex-1 py-1 text-xs rounded border transition-colors"
                :class="uploadMode === 'file'
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:border-orange-300'"
                @click="uploadMode = 'file'"
              >本地文件</button>
              <button
                class="flex-1 py-1 text-xs rounded border transition-colors"
                :class="uploadMode === 'url'
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:border-orange-300'"
                @click="uploadMode = 'url'"
              >音频 URL</button>
              <button
                class="flex-1 py-1 text-xs rounded border transition-colors"
                :class="uploadMode === 'library'
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'border-gray-200 dark:border-gray-600 text-gray-500 hover:border-orange-300'"
                @click="uploadMode = 'library'"
              >素材库</button>
            </div>

            <!-- 文件选择 -->
            <div v-if="uploadMode === 'file'">
              <input
                ref="fileInputRef"
                type="file"
                accept=".mp3,.wav,.ogg,.m4a,.flac"
                class="w-full text-xs text-gray-600 dark:text-gray-300 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-orange-100 dark:file:bg-orange-900/30 file:text-orange-700 dark:file:text-orange-300 hover:file:bg-orange-200 cursor-pointer"
              />
              <p class="mt-0.5 text-[10px] text-gray-400">支持 mp3 / wav / ogg / m4a / flac</p>
            </div>

            <!-- URL 输入 -->
            <div v-else-if="uploadMode === 'url'">
              <input
                v-model="uploadUrl"
                type="url"
                placeholder="https://example.com/sound.mp3"
                class="w-full text-xs border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-orange-400"
              />
            </div>

            <!-- 素材库搜索 -->
            <div v-else class="space-y-1.5">
              <div class="flex gap-1">
                <input
                  v-model="librarySearchQ"
                  type="text"
                  placeholder="搜索音效素材…"
                  class="flex-1 text-xs border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-orange-400"
                  @keyup.enter="searchLibrary"
                />
                <button
                  class="text-xs px-2.5 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors disabled:opacity-50 flex items-center gap-1"
                  :disabled="librarySearching || !librarySearchQ.trim()"
                  @click="searchLibrary"
                >
                  <svg v-if="librarySearching" class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <svg v-else class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </button>
              </div>

              <!-- 搜索结果 -->
              <div v-if="libraryResults.length > 0" class="max-h-44 overflow-y-auto space-y-0.5 rounded border border-gray-100 dark:border-gray-700">
                <div
                  v-for="asset in libraryResults"
                  :key="asset.id"
                  class="flex items-center gap-1.5 px-2 py-1.5 cursor-pointer transition-colors"
                  :class="librarySelected?.id === asset.id
                    ? 'bg-orange-100 dark:bg-orange-900/30'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-800/60'"
                  @click="selectLibraryAsset(asset)"
                >
                  <!-- 预览播放按钮 -->
                  <button
                    class="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full transition-colors"
                    :class="libraryPlayingUrl === asset.storage_url
                      ? 'bg-orange-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:bg-orange-100 dark:hover:bg-orange-900/30 hover:text-orange-600'"
                    :title="libraryPlayingUrl === asset.storage_url ? '暂停' : '试听'"
                    @click.stop="toggleLibraryPreview(asset.storage_url)"
                  >
                    <svg v-if="libraryPlayingUrl === asset.storage_url" class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                    </svg>
                    <svg v-else class="w-2.5 h-2.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>

                  <!-- 标题 -->
                  <span class="flex-1 text-xs truncate text-gray-700 dark:text-gray-300">{{ asset.title }}</span>

                  <!-- 时长 -->
                  <span v-if="asset.duration" class="text-[10px] text-gray-400 flex-shrink-0">
                    {{ formatAssetDuration(asset.duration) }}
                  </span>

                  <!-- 选中标记 -->
                  <svg v-if="librarySelected?.id === asset.id" class="w-3.5 h-3.5 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              </div>

              <!-- 空状态 -->
              <p v-else-if="librarySearching" class="text-[10px] text-gray-400 text-center py-1.5">搜索中…</p>
              <p v-else-if="librarySearchQ && !librarySearching" class="text-[10px] text-gray-400 text-center py-1.5">没有找到相关音效</p>
              <p v-else class="text-[10px] text-gray-400 text-center py-1.5">输入关键词搜索素材库中的音效</p>

              <!-- 已选提示 -->
              <div v-if="librarySelected" class="flex items-center gap-1 text-[10px] text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 rounded px-2 py-1">
                <svg class="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span class="truncate">已选：{{ librarySelected.title }}</span>
              </div>
            </div>

            <!-- 标签 + 类型 + 音量 -->
            <div class="grid grid-cols-2 gap-2">
              <div>
                <label class="text-[10px] text-gray-500 mb-0.5 block">标签（可选）</label>
                <input
                  v-model="uploadTag"
                  type="text"
                  placeholder="如 wind_howling"
                  class="w-full text-xs border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-orange-400"
                />
              </div>
              <div>
                <label class="text-[10px] text-gray-500 mb-0.5 block">类型</label>
                <select
                  v-model="uploadSfxType"
                  class="w-full text-xs border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-orange-400"
                >
                  <option value="action">动作音</option>
                  <option value="ambient">环境音</option>
                  <option value="emotion">情绪音</option>
                </select>
              </div>
            </div>

            <!-- 音量 -->
            <div class="flex items-center gap-2">
              <label class="text-[10px] text-gray-500 whitespace-nowrap">音量</label>
              <input
                v-model.number="uploadVolume"
                type="range" min="0.05" max="1" step="0.05"
                class="flex-1 accent-orange-500"
              />
              <span class="text-[10px] text-gray-400 w-7 text-right">{{ Math.round(uploadVolume * 100) }}%</span>
            </div>

            <!-- 操作按钮 -->
            <div class="flex justify-end gap-2 pt-0.5">
              <button
                class="text-xs px-2.5 py-1 rounded text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                @click="closeUploadPanel"
              >取消</button>
              <button
                class="text-xs px-3 py-1 rounded transition-colors flex items-center gap-1 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:text-gray-400 dark:disabled:text-gray-500 enabled:bg-orange-500 enabled:text-white enabled:hover:bg-orange-600"
                :disabled="uploadingFor === shot.id || (uploadMode === 'library' && !librarySelected)"
                @click="uploadMode === 'file' ? doImportFile(shot) : uploadMode === 'url' ? doImportUrl(shot) : doImportLibrary(shot)"
              >
                <svg v-if="uploadingFor === shot.id" class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {{ uploadingFor === shot.id ? '导入中…' : uploadMode === 'file' ? '上传' : '导入' }}
              </button>
            </div>
          </div>
        </div>
      </template>

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
