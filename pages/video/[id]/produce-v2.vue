<script setup lang="ts">
import type { StoryboardShot, ScreenplayScene, EpisodeSummary, Item, Asset } from '~/types'

// 全屏编辑器页面：不套用全局导航栏/页脚（与截图设计一致），页面自带返回按钮承担导航职责。
definePageMeta({ layout: false })

const route = useRoute()
const router = useRouter()
const videoId = parseInt(route.params.id as string)
if (isNaN(videoId)) {
  await navigateTo('/')
}

const videoStore = useVideoStore()
const characterStore = useCharacterStore()
const sceneAnchorStore = useSceneAnchorStore()
const screenplayApi = useScreenplayApi()
const videoApi = useVideoApi()
const itemApi = useItemApi()
const toast = useToast()
const { confirm } = useConfirm()
const { guardAiProvider } = useAiProviderGuard()

const loading = ref(true)
const video = computed(() => videoStore.currentVideo)
const shots = computed(() => videoStore.storyboard)
const characters = computed(() => characterStore.characters)
const anchors = computed(() => sceneAnchorStore.anchors)
const items = ref<Item[]>([])

const screenplayScenes = ref<ScreenplayScene[]>([])
const selectedSceneId = ref<number | null>(null) // null 且存在于 tiles 中 = 未关联场次的旧分镜
const scriptCollapsed = ref(false)

const episodeSummaries = ref<EpisodeSummary[]>([])
const showEpisodePicker = ref(false)
const showScenePicker = ref(false)

// ── 左右分栏拖拽调整宽度（默认各占50%，可拖拽调整，记住上次的比例）───────────
const PANEL_WIDTH_KEY = 'inkframe_produce_v2_left_panel_width'
const MIN_PANEL_WIDTH_PERCENT = 20
const MAX_PANEL_WIDTH_PERCENT = 80
const mainAreaRef = ref<HTMLElement | null>(null)
const leftPanelWidthPercent = ref(50)
const isResizingPanels = ref(false)

onMounted(() => {
  const saved = Number(localStorage.getItem(PANEL_WIDTH_KEY))
  if (saved && saved >= MIN_PANEL_WIDTH_PERCENT && saved <= MAX_PANEL_WIDTH_PERCENT) {
    leftPanelWidthPercent.value = saved
  }
})

function startPanelResize(e: MouseEvent) {
  const container = mainAreaRef.value
  if (!container) return
  e.preventDefault()
  isResizingPanels.value = true
  const containerWidth = container.getBoundingClientRect().width
  const startX = e.clientX
  const startPercent = leftPanelWidthPercent.value
  const prevCursor = document.body.style.cursor
  const prevUserSelect = document.body.style.userSelect
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  function onMove(mv: MouseEvent) {
    const deltaPercent = ((mv.clientX - startX) / containerWidth) * 100
    leftPanelWidthPercent.value = Math.min(
      MAX_PANEL_WIDTH_PERCENT,
      Math.max(MIN_PANEL_WIDTH_PERCENT, startPercent + deltaPercent),
    )
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = prevCursor
    document.body.style.userSelect = prevUserSelect
    isResizingPanels.value = false
    localStorage.setItem(PANEL_WIDTH_KEY, String(leftPanelWidthPercent.value))
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// ── 底部场次时间线条：支持鼠标拖拽左右滑动 + 滚轮转横向滚动 ──────────────────
const sceneTimelineRef = ref<HTMLElement | null>(null)
const DRAG_CLICK_THRESHOLD_PX = 4

function startSceneTimelineDrag(e: MouseEvent) {
  const el = sceneTimelineRef.value
  if (!el) return
  const startX = e.clientX
  const startScrollLeft = el.scrollLeft
  let dragged = false
  function onMove(mv: MouseEvent) {
    const dx = mv.clientX - startX
    if (Math.abs(dx) > DRAG_CLICK_THRESHOLD_PX) dragged = true
    el!.scrollLeft = startScrollLeft - dx
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    if (dragged) {
      // 真正发生了拖拽时，吞掉这次 mouseup 触发的 click，避免误触卡片选中/插入按钮——
      // 只拦截一次，且用捕获阶段确保先于卡片自身的 @click 执行。
      const blockClick = (ce: MouseEvent) => { ce.stopPropagation(); ce.preventDefault() }
      el!.addEventListener('click', blockClick, { capture: true, once: true })
      setTimeout(() => el!.removeEventListener('click', blockClick, { capture: true } as EventListenerOptions), 0)
    }
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function onSceneTimelineWheel(e: WheelEvent) {
  const el = sceneTimelineRef.value
  if (!el) return
  // 鼠标滚轮默认只产生纵向 deltaY，这里转换成横向滚动，让普通鼠标也能"滑动"这条时间线。
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    e.preventDefault()
    el.scrollLeft += e.deltaY
  }
}

// ── 按分场剧本分组分镜 ──────────────────────────────────────────────────────
const shotsBySceneId = computed(() => {
  const m = new Map<number | null, StoryboardShot[]>()
  for (const s of shots.value) {
    const key = s.screenplay_scene_id ?? null
    if (!m.has(key)) m.set(key, [])
    m.get(key)!.push(s)
  }
  return m
})

interface SceneTile { scene: ScreenplayScene | null; shots: StoryboardShot[]; duration: number; thumbnail: string | null }

const sceneTiles = computed<SceneTile[]>(() => {
  const tiles: SceneTile[] = screenplayScenes.value.map(sc => {
    const sceneShots = shotsBySceneId.value.get(sc.id) ?? []
    return {
      scene: sc,
      shots: sceneShots,
      duration: sceneShots.reduce((sum, s) => sum + (s.duration || 0), 0),
      thumbnail: sceneShots.find(s => s.image_url)?.image_url ?? null,
    }
  })
  const ungrouped = shotsBySceneId.value.get(null) ?? []
  if (ungrouped.length > 0) {
    tiles.push({
      scene: null,
      shots: ungrouped,
      duration: ungrouped.reduce((sum, s) => sum + (s.duration || 0), 0),
      thumbnail: ungrouped.find(s => s.image_url)?.image_url ?? null,
    })
  }
  return tiles
})

const selectedTile = computed(() => {
  return sceneTiles.value.find(t => (t.scene?.id ?? null) === selectedSceneId.value) ?? sceneTiles.value[0] ?? null
})
const selectedShots = computed(() => selectedTile.value?.shots ?? [])

const totalDuration = computed(() => shots.value.reduce((sum, s) => sum + (s.duration || 0), 0))

// ── 角色 / 场景锚点参考图 ────────────────────────────────────────────────────
const characterById = computed(() => {
  const m = new Map<number, any>()
  for (const c of characters.value) m.set(c.id, c)
  return m
})
const anchorById = computed(() => {
  const m = new Map<number, any>()
  for (const a of anchors.value) m.set(a.id, a)
  return m
})
const itemById = computed(() => {
  const m = new Map<number, Item>()
  for (const it of items.value) m.set(it.id, it)
  return m
})

const referenceItems = computed(() => {
  const refs: { key: string; label: string; imageUrl: string }[] = []
  const seen = new Set<string>()
  for (const shot of selectedShots.value) {
    if (shot.scene_anchor_id) {
      const a = anchorById.value.get(shot.scene_anchor_id)
      const key = `anchor-${shot.scene_anchor_id}`
      if (a?.ref_image_url && !seen.has(key)) {
        seen.add(key)
        refs.push({ key, label: a.name, imageUrl: a.ref_image_url })
      }
    }
    for (const cid of shot.character_ids ?? []) {
      const c = characterById.value.get(cid)
      const img = c?.default_look?.three_view_sheet
      const key = `char-${cid}`
      if (c && img && !seen.has(key)) {
        seen.add(key)
        refs.push({ key, label: c.name, imageUrl: img })
      }
    }
    for (const iid of shot.item_ids ?? []) {
      const it = itemById.value.get(iid)
      const key = `item-${iid}`
      if (it?.image_url && !seen.has(key)) {
        seen.add(key)
        refs.push({ key, label: it.name, imageUrl: it.image_url })
      }
    }
  }
  return refs
})

function characterName(id: number) {
  return characterById.value.get(id)?.name ?? `#${id}`
}

// ── 分镜描述内联参考图芯片：对当前镜头已绑定的角色/道具/场景名做纯前端文本匹配，
// 命中处渲染为小芯片（不改变 description 原文，仅展示态高亮）───────────────────
type ChipKind = 'scene' | 'character' | 'item'
const CHIP_ICON: Record<ChipKind, string> = { scene: '📍', character: '👤', item: '📦' }
const CHIP_CLASS: Record<ChipKind, string> = {
  scene: 'bg-emerald-900/30 text-emerald-300',
  character: 'bg-blue-900/30 text-blue-300',
  item: 'bg-amber-900/30 text-amber-300',
}
const boundEntityNames = computed(() => {
  const shot = previewShot.value
  const list: { name: string; kind: ChipKind }[] = []
  if (!shot) return list
  if (shot.scene_anchor_id) {
    const a = anchorById.value.get(shot.scene_anchor_id)
    if (a?.name) list.push({ name: a.name, kind: 'scene' })
  }
  for (const cid of shot.character_ids ?? []) {
    const c = characterById.value.get(cid)
    if (c?.name) list.push({ name: c.name, kind: 'character' })
  }
  for (const iid of shot.item_ids ?? []) {
    const it = itemById.value.get(iid)
    if (it?.name) list.push({ name: it.name, kind: 'item' })
  }
  // 按名称长度降序：避免短名称在同一位置抢先于更长的名称匹配
  return list.sort((a, b) => b.name.length - a.name.length)
})
function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
interface DescSegment { text: string; chip?: { kind: ChipKind; label: string } }
const descriptionSegments = computed<DescSegment[]>(() => {
  const text = previewShot.value?.description ?? ''
  const names = boundEntityNames.value
  if (!text || names.length === 0) return [{ text }]
  const pattern = new RegExp(names.map(n => escapeRegExp(n.name)).join('|'), 'g')
  const segments: DescSegment[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) segments.push({ text: text.slice(lastIndex, match.index) })
    const found = names.find(n => n.name === match![0])
    segments.push({ text: match[0], chip: found ? { kind: found.kind, label: found.name } : undefined })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex) })
  return segments
})
const editingDescription = ref(false)
const descriptionTextareaRef = ref<HTMLTextAreaElement | null>(null)
function startEditingDescription() {
  if (!previewShot.value) return
  editingDescription.value = true
  nextTick(() => descriptionTextareaRef.value?.focus())
}
function finishEditingDescription() {
  saveDescriptionDraft()
  editingDescription.value = false
}

// ── 分镜文字展示格式（纯前端视图态，不回传后端） ─────────────────────────────
const shotDisplayFormat = ref<'professional' | 'concise'>('professional')

const CAMERA_TYPE_LABEL: Record<string, string> = {
  static: '固定镜头', push: '推镜', pull: '拉镜', pan: '摇镜', track: '跟镜',
  crane_up: '升镜', crane_down: '降镜', follow: '跟随', arc: '环绕', tilt: '俯仰',
  whip_pan: '甩镜', zoom: '变焦', tracking: '跟踪', dolly: '轨道', crane: '升降',
}
function cameraTypeLabel(v?: string) { return v ? (CAMERA_TYPE_LABEL[v] ?? v) : '' }

// ── 加载 ────────────────────────────────────────────────────────────────────
const providers = ref<{ name: string; display_name: string }[]>([])
const selectedProvider = ref('')

async function loadAll() {
  loading.value = true
  try {
    await Promise.all([
      videoStore.fetchVideo(videoId),
      videoStore.fetchStoryboard(videoId),
    ])
    const v = videoStore.currentVideo
    if (v?.novel_id) {
      await Promise.all([
        characterStore.fetchCharacters(v.novel_id),
        sceneAnchorStore.fetchAnchors(v.novel_id),
        itemApi.listItems(v.novel_id).then(res => { items.value = res.data?.items ?? [] }).catch(() => { items.value = [] }),
      ])
      try {
        const res = await videoApi.getEpisodeSummaries(v.novel_id)
        episodeSummaries.value = res.data ?? []
      } catch { /* 剧集切换是次要功能，静默失败即可 */ }
    }
    if (v?.chapter_id) {
      screenplayScenes.value = await screenplayApi.listScreenplayScenes(v.chapter_id)
    }
    if (selectedSceneId.value === null && sceneTiles.value.length > 0) {
      const queriedSceneNo = Number(route.query.scene)
      const queriedTile = Number.isFinite(queriedSceneNo) && queriedSceneNo > 0
        ? sceneTiles.value.find(t => t.scene?.scene_no === queriedSceneNo)
        : undefined
      // 优先选中第一个"有分镜"的场次 —— 分镜生成流程不一定会写回 screenplay_scene_id，
      // 若第一个场次记录下没有实际绑定的分镜，直接默认选中它会让页面看起来空空如也。
      const firstWithShots = sceneTiles.value.find(t => t.shots.length > 0)
      selectedSceneId.value = (queriedTile ?? firstWithShots ?? sceneTiles.value[0]).scene?.id ?? null
    }
    try {
      const res = await videoApi.getVideoProviders()
      providers.value = res.data ?? []
      if (!selectedProvider.value && providers.value.length) selectedProvider.value = providers.value[0].name
    } catch { /* 模型列表是次要功能，静默失败即可 */ }
  } catch (e: any) {
    toast.error('加载失败：' + (e.message || '未知错误'))
  } finally {
    loading.value = false
  }
}
onMounted(() => {
  // 本页 layout: false，不经过 layouts/default.vue，需要自行激活 dark class
  document.documentElement.classList.add('dark')
  loadAll()
})

function selectScene(sceneId: number | null) {
  selectedSceneId.value = sceneId
  scriptCollapsed.value = false
}

function goBack() {
  router.back()
}

function switchEpisode(ep: EpisodeSummary) {
  showEpisodePicker.value = false
  if (!ep.video_id || ep.video_id === videoId) return
  router.push(`/video/${ep.video_id}/produce-v2`)
}

// ── 生成 ────────────────────────────────────────────────────────────────────
const generatingImages = ref(false)
const generatingVideo = ref(false)

async function generateShotImages() {
  if (!await guardAiProvider('IMAGE')) return
  if (!selectedShots.value.length) return
  generatingImages.value = true
  try {
    await videoApi.batchGenerateShotImages(videoId, selectedShots.value.map(s => s.id))
    toast.info('分镜预览图生成任务已提交')
    await videoStore.fetchStoryboard(videoId)
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || '未知错误'))
  } finally {
    generatingImages.value = false
  }
}

async function generateShotVideos() {
  if (!await guardAiProvider('VIDEO')) return
  if (!selectedShots.value.length) return
  generatingVideo.value = true
  try {
    await videoApi.batchGenerateShots(videoId, selectedShots.value.map(s => s.id))
    toast.info('视频生成任务已提交')
    await videoStore.fetchStoryboard(videoId)
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || '未知错误'))
  } finally {
    generatingVideo.value = false
  }
}

// 占位：按分镜数量/时长估算的示意数字，非真实计费（后端暂无成本字段）
const estimatedImageCost = computed(() => selectedShots.value.length)
const estimatedVideoCost = computed(() => Math.round(selectedShots.value.reduce((sum, s) => sum + (s.duration || 0), 0) * 2.5))

// ── 重新生成提示词 ────────────────────────────────────────────────────────
const regeneratingPrompts = ref(false)
async function regeneratePrompts() {
  if (!selectedShots.value.length || regeneratingPrompts.value) return
  regeneratingPrompts.value = true
  try {
    for (const shot of selectedShots.value) {
      await videoApi.regenerateShotPrompt(videoId, shot.id)
    }
    toast.success('提示词已重新生成')
    await videoStore.fetchStoryboard(videoId)
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || '未知错误'))
  } finally {
    regeneratingPrompts.value = false
  }
}

// ── 参考角色：新增 / 网格查看 ────────────────────────────────────────────────
const showReferencePicker = ref(false)
const showReferenceGrid = ref(false)
const addingReference = ref(false)

const availableCharactersToAdd = computed(() =>
  characters.value.filter(c => !referenceItems.value.some(r => r.key === `char-${c.id}`))
)

async function addReferenceCharacter(charId: number) {
  if (!selectedShots.value.length || addingReference.value) return
  addingReference.value = true
  try {
    await Promise.all(selectedShots.value.map(s =>
      videoApi.setShotCharacters(videoId, s.id, Array.from(new Set([...(s.character_ids ?? []), charId])))
    ))
    toast.success('已添加参考角色')
    await videoStore.fetchStoryboard(videoId)
    showReferencePicker.value = false
  } catch (e: any) {
    toast.error('添加失败：' + (e.message || '未知错误'))
  } finally {
    addingReference.value = false
  }
}

// ── 历史记录（复用已有的 StoryboardReviewPanel，其"历史记录"Tab 已支持回滚） ──
const showHistoryPanel = ref(false)

// ── 底部生成指令条：模型选择 / @提及（部分为本地占位） ──
const showModelPicker = ref(false)
const durationOption = ref('15s') // 占位：展示用，不回传后端
const resolutionOption = ref('480p') // 占位：展示用，不回传后端
const batchCountOption = ref(1) // 占位：展示用，不回传后端
const selectedProviderLabel = computed(() => providers.value.find(p => p.name === selectedProvider.value)?.display_name ?? '默认模型')

// ── 视频版本 tab（真实：映射到 Video.visual_mode） ──────────────────────────
const visualModeTabs: { key: 'standard' | 'hd'; label: string }[] = [
  { key: 'standard', label: '标准' },
  { key: 'hd', label: '高清' },
]
const switchingVisualMode = ref(false)
async function setVisualMode(mode: 'standard' | 'hd') {
  if ((video.value?.visual_mode ?? 'standard') === mode || switchingVisualMode.value) return
  switchingVisualMode.value = true
  try {
    await videoStore.updateVideo(videoId, { visual_mode: mode })
    toast.success('已切换视频版本')
  } catch (e: any) {
    toast.error('切换失败：' + (e.message || '未知错误'))
  } finally {
    switchingVisualMode.value = false
  }
}
// ── 视频预览：当前选中的分镜（需在下方"视频生成历史"之前声明，因为该区块的
// watch(..., { immediate: true }) 会立即读取 previewShot） ─────────────────
const previewShotIdx = ref(0)
const previewShot = computed(() => selectedShots.value[previewShotIdx.value] ?? null)

// ── 当前镜头绑定：角色 / 道具 / 场景锚点（行内编辑，交互参考 ScriptTab） ────────
const sceneAnchorApi = useSceneAnchorApi()
const unassignedCharactersForPreviewShot = computed(() => {
  const assigned = new Set(previewShot.value?.character_ids ?? [])
  return characters.value.filter(c => !assigned.has(c.id))
})
const unassignedItemsForPreviewShot = computed(() => {
  const assigned = new Set(previewShot.value?.item_ids ?? [])
  return items.value.filter(it => !assigned.has(it.id))
})
async function setPreviewShotAnchor(anchorId: number | null) {
  if (!previewShot.value) return
  try {
    await sceneAnchorApi.setShotAnchor(videoId, previewShot.value.id, anchorId)
    await videoStore.fetchStoryboard(videoId)
  } catch (e: any) {
    toast.error('绑定失败：' + (e.message || ''))
  }
}
async function setPreviewShotCharacters(characterIds: number[]) {
  if (!previewShot.value) return
  try {
    await videoApi.setShotCharacters(videoId, previewShot.value.id, characterIds)
    await videoStore.fetchStoryboard(videoId)
  } catch (e: any) {
    toast.error('角色绑定失败：' + (e.message || ''))
  }
}
function addCharToPreviewShot(event: Event) {
  const select = event.target as HTMLSelectElement
  const id = Number(select.value)
  select.value = ''
  if (!id || !previewShot.value) return
  setPreviewShotCharacters([...(previewShot.value.character_ids || []), id])
}
function removeCharFromPreviewShot(charId: number) {
  if (!previewShot.value) return
  setPreviewShotCharacters((previewShot.value.character_ids || []).filter(id => id !== charId))
}
async function setPreviewShotItems(itemIds: number[]) {
  if (!previewShot.value) return
  try {
    await videoApi.setShotItems(videoId, previewShot.value.id, itemIds)
    await videoStore.fetchStoryboard(videoId)
  } catch (e: any) {
    toast.error('道具绑定失败：' + (e.message || ''))
  }
}
function addItemToPreviewShot(event: Event) {
  const select = event.target as HTMLSelectElement
  const id = Number(select.value)
  select.value = ''
  if (!id || !previewShot.value) return
  setPreviewShotItems([...(previewShot.value.item_ids || []), id])
}
function removeItemFromPreviewShot(itemId: number) {
  if (!previewShot.value) return
  setPreviewShotItems((previewShot.value.item_ids || []).filter(id => id !== itemId))
}

// ── 分镜描述（可编辑，失焦/停止输入后自动保存） ─────────────────────────────
const descriptionDraft = ref('')
const savingDescription = ref(false)
watch(previewShot, (shot) => { descriptionDraft.value = shot?.description ?? ''; editingDescription.value = false }, { immediate: true })
let descriptionSaveTimer: ReturnType<typeof setTimeout> | null = null
async function saveDescriptionDraft() {
  if (descriptionSaveTimer) { clearTimeout(descriptionSaveTimer); descriptionSaveTimer = null }
  const shot = previewShot.value
  if (!shot || descriptionDraft.value === shot.description) return
  savingDescription.value = true
  try {
    await videoStore.updateShot(videoId, shot.id, { description: descriptionDraft.value })
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || '未知错误'))
  } finally {
    savingDescription.value = false
  }
}
function onDescriptionInput() {
  if (descriptionSaveTimer) clearTimeout(descriptionSaveTimer)
  descriptionSaveTimer = setTimeout(saveDescriptionDraft, 1000)
}

// ── 视频生成历史：分镜历次生成的图片/视频，点击可恢复为当前版本 ────────────────
const shotHistory = ref<Asset[]>([])
const restoringAssetId = ref<number | null>(null)

async function loadShotHistory() {
  if (!previewShot.value) {
    shotHistory.value = []
    return
  }
  try {
    const res = await videoApi.listShotAssetHistory(videoId, previewShot.value.id)
    shotHistory.value = res.data ?? []
  } catch {
    shotHistory.value = []
  }
}
watch(() => previewShot.value?.id, loadShotHistory, { immediate: true })

async function handleRestoreAsset(asset: Asset) {
  if (!previewShot.value || restoringAssetId.value) return
  if (!await confirm('恢复到这个历史版本？当前版本会保留在历史记录中，可以再恢复回来。')) return
  restoringAssetId.value = asset.id
  try {
    await videoApi.restoreShotAsset(videoId, previewShot.value.id, asset.id)
    toast.success('已恢复历史版本')
    await videoStore.fetchStoryboard(videoId)
    await loadShotHistory()
  } catch (e: any) {
    toast.error('恢复失败：' + (e.message || '未知错误'))
  } finally {
    restoringAssetId.value = null
  }
}
function formatHistoryTime(iso: string) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ── 上传 / 清晰化 / 去字幕 / 下载 ────────────────────────────────────────────
const uploadingMedia = ref(false)
async function uploadMediaFile(file: File) {
  if (!previewShot.value) return
  uploadingMedia.value = true
  try {
    if (file.type.startsWith('video/')) {
      await videoApi.uploadShotVideo(videoId, previewShot.value.id, file)
    } else {
      await videoApi.uploadShotImage(videoId, previewShot.value.id, file)
    }
    toast.success('素材已上传')
    await videoStore.fetchStoryboard(videoId)
  } catch (e: any) {
    toast.error('上传失败：' + (e.message || '未知错误'))
  } finally {
    uploadingMedia.value = false
  }
}
function handleFileInputChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) uploadMediaFile(file)
  input.value = ''
}

const refining = ref(false)
async function handleRefineImage() {
  if (!previewShot.value || refining.value) return
  refining.value = true
  try {
    await videoApi.refineShotImage(videoId, previewShot.value.id, '提升清晰度，增强画面细节')
    toast.success('已提交清晰化处理')
    await videoStore.fetchStoryboard(videoId)
  } catch (e: any) {
    toast.error('处理失败：' + (e.message || '未知错误'))
  } finally {
    refining.value = false
  }
}

const removingSubtitle = ref(false)
async function handleRemoveSubtitle() {
  if (!previewShot.value || removingSubtitle.value) return
  removingSubtitle.value = true
  try {
    await videoStore.updateShot(videoId, previewShot.value.id, { subtitle: '' })
    toast.success('已去除字幕覆盖')
  } catch (e: any) {
    toast.error('操作失败：' + (e.message || '未知错误'))
  } finally {
    removingSubtitle.value = false
  }
}

const downloadUrl = computed(() => previewShot.value?.video_url || previewShot.value?.image_url || '')

// ── 导出（真实：复用已有的 ExportPanel 组件） ───────────────────────────────
const showExportModal = ref(false)

// ── 视频预览（单段播放 / 整场连续播放） ──────────────────────────────────────
const previewVideoRef = ref<HTMLVideoElement | null>(null)
const isPlaying = ref(false)
const singleSegmentPlay = ref(true)
const currentTime = ref(0)

watch(selectedShots, () => { previewShotIdx.value = 0 })
watch(previewShot, () => { currentTime.value = 0 })

function playPause() {
  const el = previewVideoRef.value
  if (!el) return
  if (el.paused) { el.play().catch(() => {}); isPlaying.value = true }
  else { el.pause(); isPlaying.value = false }
}
function prevShot() {
  if (previewShotIdx.value > 0) previewShotIdx.value--
}
function nextShot() {
  if (previewShotIdx.value < selectedShots.value.length - 1) previewShotIdx.value++
}
function onTimeUpdate() {
  currentTime.value = previewVideoRef.value?.currentTime ?? 0
}
function handleEnded() {
  isPlaying.value = false
  if (!singleSegmentPlay.value && previewShotIdx.value < selectedShots.value.length - 1) {
    nextShot()
    nextTick(() => { previewVideoRef.value?.play().catch(() => {}) })
  }
}
function formatTime(t: number) {
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
const formattedCurrentTime = computed(() => formatTime(currentTime.value))
const formattedShotDuration = computed(() => formatTime(previewShot.value?.duration ?? 0))
</script>

<template>
  <div class="h-screen flex flex-col bg-gray-950 text-gray-100">
    <!-- 顶部栏 -->
    <header class="flex-shrink-0 h-14 px-4 flex items-center justify-between border-b border-gray-800">
      <button class="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200" @click="goBack">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        返回筹备工作台
      </button>

      <div class="flex items-center gap-3">
        <div class="relative">
          <button class="flex items-center gap-1.5 text-sm font-medium hover:text-gray-300" @click="showEpisodePicker = !showEpisodePicker">
            第 {{ episodeSummaries.find(e => e.video_id === videoId)?.chapter_no ?? '?' }} 集 {{ video?.title }}
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div v-if="showEpisodePicker" class="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-56 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-20 py-1 max-h-80 overflow-auto">
            <button
              v-for="ep in episodeSummaries" :key="ep.chapter_id"
              class="w-full text-left px-3 py-2 text-sm hover:bg-gray-800"
              :class="ep.video_id === videoId ? 'text-primary-400' : 'text-gray-300'"
              @click="switchEpisode(ep)"
            >第 {{ ep.chapter_no }} 集 {{ ep.title }}</button>
          </div>
        </div>

        <div v-if="selectedTile?.scene" class="relative">
          <button class="flex items-center gap-1.5 text-sm font-medium hover:text-gray-300" @click="showScenePicker = !showScenePicker">
            场{{ selectedTile.scene.scene_no }} {{ selectedTile.scene.heading }}
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div v-if="showScenePicker" class="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-56 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-20 py-1 max-h-80 overflow-auto">
            <button
              v-for="tile in sceneTiles" :key="tile.scene?.id ?? 'ungrouped'"
              class="w-full text-left px-3 py-2 text-sm hover:bg-gray-800"
              :class="(tile.scene?.id ?? null) === selectedSceneId ? 'text-primary-400' : 'text-gray-300'"
              @click="selectScene(tile.scene?.id ?? null); showScenePicker = false"
            >{{ tile.scene ? `场${tile.scene.scene_no} ${tile.scene.heading}` : '自定义' }}</button>
          </div>
        </div>

        <span class="text-xs text-gray-500">{{ shots.length }} 个分镜 · {{ Math.round(totalDuration) }}s</span>
      </div>

      <div class="flex items-center gap-3">
        <button class="text-sm text-gray-400 hover:text-gray-200 flex items-center gap-1.5" @click="showExportModal = true">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
          导出
        </button>
      </div>
    </header>

    <div v-if="loading" class="flex-1 flex items-center justify-center text-gray-500 text-sm">加载中…</div>

    <div v-else ref="mainAreaRef" class="flex-1 flex min-h-0">
      <!-- 左侧：剧本 + 分镜 -->
      <div class="min-w-0 flex flex-col border-r border-gray-800" :style="{ width: leftPanelWidthPercent + '%' }">
        <div class="flex-1 min-h-0 overflow-auto px-6 py-4">
          <!-- 原始剧本折叠标题 + 格式 / 重新生成提示词 -->
          <div class="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <button v-if="selectedTile?.scene" class="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200" @click="scriptCollapsed = !scriptCollapsed">
              <svg class="w-3.5 h-3.5 transition-transform" :class="scriptCollapsed ? '' : 'rotate-90'" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
              原始剧本 场{{ selectedTile.scene.scene_no }} · {{ selectedTile.scene.heading }}
            </button>
            <span v-else />
            <div class="flex items-center gap-2">
              <select v-model="shotDisplayFormat" class="bg-gray-900 border border-gray-700 rounded-lg text-xs px-2 py-1.5 text-gray-300 focus:outline-none">
                <option value="professional">格式：专业分镜</option>
                <option value="concise">格式：简洁模式</option>
              </select>
              <button
                class="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 disabled:opacity-50"
                :disabled="regeneratingPrompts || !selectedShots.length"
                @click="regeneratePrompts"
              >
                <svg class="w-3.5 h-3.5" :class="regeneratingPrompts ? 'animate-spin' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                {{ regeneratingPrompts ? '生成中…' : '重新生成提示词' }}
              </button>
            </div>
          </div>
          <p v-if="selectedTile?.scene && !scriptCollapsed" class="text-sm text-gray-500 mb-4 leading-relaxed">{{ selectedTile.scene.synopsis }}</p>

          <!-- 当前镜头绑定：场景锚点 / 角色 / 道具（行内编辑）+ 场景级参考图/历史入口 -->
          <div v-if="previewShot" class="flex items-center gap-x-3 gap-y-1.5 flex-wrap mb-4 pb-3 border-b border-gray-800">
            <div class="flex items-center gap-1 flex-shrink-0">
              <span class="text-xs text-gray-500">📍</span>
              <select
                :value="previewShot.scene_anchor_id || ''"
                class="bg-gray-900 border border-gray-700 rounded text-xs px-1.5 py-1 text-gray-300 max-w-[110px] focus:outline-none"
                @change="setPreviewShotAnchor(($event.target as HTMLSelectElement).value ? Number(($event.target as HTMLSelectElement).value) : null)"
              >
                <option value="">不绑定场景</option>
                <option v-for="a in anchors" :key="a.id" :value="a.id">{{ a.name }}</option>
              </select>
            </div>

            <div class="w-px h-4 bg-gray-800 flex-shrink-0" />

            <div class="flex items-center gap-1 flex-wrap flex-shrink-0">
              <span class="text-xs text-gray-500">👤</span>
              <span
                v-for="cid in (previewShot.character_ids ?? [])" :key="cid"
                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-blue-900/30 text-blue-300"
              >
                {{ characterName(cid) }}
                <button class="text-blue-500 hover:text-red-400 ml-0.5 leading-none" @click="removeCharFromPreviewShot(cid)">×</button>
              </span>
              <select class="bg-gray-900 border border-gray-700 rounded text-xs px-1.5 py-1 text-gray-300 max-w-[90px] focus:outline-none" @change="addCharToPreviewShot($event)">
                <option value="">+ 绑定角色</option>
                <option v-for="c in unassignedCharactersForPreviewShot" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
            </div>

            <template v-if="items.length > 0 || (previewShot.item_ids?.length ?? 0) > 0">
              <div class="w-px h-4 bg-gray-800 flex-shrink-0" />
              <div class="flex items-center gap-1 flex-wrap flex-shrink-0">
                <span class="text-xs text-gray-500">📦</span>
                <span
                  v-for="iid in (previewShot.item_ids ?? [])" :key="iid"
                  class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-amber-900/30 text-amber-300"
                >
                  {{ itemById.get(iid)?.name || iid }}
                  <button class="text-amber-500 hover:text-red-400 ml-0.5 leading-none" @click="removeItemFromPreviewShot(iid)">×</button>
                </span>
                <select class="bg-gray-900 border border-gray-700 rounded text-xs px-1.5 py-1 text-gray-300 max-w-[90px] focus:outline-none" @change="addItemToPreviewShot($event)">
                  <option value="">+ 绑定道具</option>
                  <option v-for="it in unassignedItemsForPreviewShot" :key="it.id" :value="it.id">{{ it.name }}</option>
                </select>
              </div>
            </template>

            <div class="flex items-center gap-2 ml-auto flex-shrink-0">
              <button class="text-gray-500 hover:text-gray-300" title="添加场景参考角色" @click="showReferencePicker = true">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              </button>
              <button class="text-gray-500 hover:text-gray-300" title="查看全部参考" @click="showReferenceGrid = true">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h7v7H4V6zm9 0h7v7h-7V6zM4 15h7v3H4v-3zm9 0h7v3h-7v-3z"/></svg>
              </button>
              <button class="text-gray-500 hover:text-gray-300" title="审查历史" @click="showHistoryPanel = true">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              </button>
            </div>
          </div>

          <!-- 单个分镜详情：与右侧预览面板共享 previewShot/previewShotIdx，底部分镜条负责切换 -->
          <div v-if="!selectedShots.length" class="text-center py-16 text-gray-500 text-sm">该场次暂无分镜</div>
          <div v-else-if="previewShot" class="text-sm leading-relaxed">
            <p class="text-gray-300 font-medium mb-1">
              镜头 {{ previewShot.shot_no }} ({{ previewShot.duration }}s)<template v-if="shotDisplayFormat === 'professional' && previewShot.camera_type">：{{ cameraTypeLabel(previewShot.camera_type) }}</template>
            </p>
            <div
              v-if="!editingDescription"
              class="w-full min-h-[4.5rem] bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 whitespace-pre-wrap cursor-text mb-2"
              @click="startEditingDescription"
            >
              <template v-if="previewShot.description">
                <template v-for="(seg, i) in descriptionSegments" :key="i">
                  <span
                    v-if="seg.chip"
                    class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs align-middle"
                    :class="CHIP_CLASS[seg.chip.kind]"
                  >{{ CHIP_ICON[seg.chip.kind] }} {{ seg.chip.label }}</span>
                  <template v-else>{{ seg.text }}</template>
                </template>
              </template>
              <span v-else class="text-gray-600">分镜描述</span>
            </div>
            <textarea
              v-else
              ref="descriptionTextareaRef"
              v-model="descriptionDraft"
              rows="3"
              placeholder="分镜描述"
              class="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-primary-600 mb-2"
              @input="onDescriptionInput"
              @blur="finishEditingDescription"
            />
            <p v-if="previewShot.dialogue" class="text-gray-300">
              <span
                v-for="cid in (previewShot.character_ids ?? [])" :key="cid"
                class="inline-flex items-center px-1.5 py-0.5 mr-1 rounded bg-indigo-900/40 text-indigo-300 text-xs"
              >{{ characterName(cid) }}</span>
              {{ previewShot.dialogue }}
            </p>
          </div>
        </div>

        <!-- 底部生成指令条 -->
        <div class="flex-shrink-0 border-t border-gray-800 px-6 py-3 space-y-2">
          <div class="flex items-center gap-2 flex-wrap">
            <div class="relative">
              <button class="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs bg-gray-800 text-gray-300 hover:bg-gray-700" @click="showModelPicker = !showModelPicker">
                {{ selectedProviderLabel }} · {{ durationOption }} · {{ resolutionOption }} · ×{{ batchCountOption }}
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
              </button>
              <div v-if="showModelPicker" class="absolute bottom-full mb-2 left-0 w-56 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-20 p-3 space-y-2">
                <div>
                  <p class="text-[10px] text-gray-500 mb-1">生成模型</p>
                  <select v-model="selectedProvider" class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none">
                    <option v-for="p in providers" :key="p.name" :value="p.name">{{ p.display_name }}</option>
                  </select>
                </div>
                <div class="grid grid-cols-3 gap-1">
                  <select v-model="durationOption" class="bg-gray-800 border border-gray-700 rounded px-1 py-1 text-xs text-gray-200 focus:outline-none">
                    <option v-for="d in ['5s', '10s', '15s']" :key="d" :value="d">{{ d }}</option>
                  </select>
                  <select v-model="resolutionOption" class="bg-gray-800 border border-gray-700 rounded px-1 py-1 text-xs text-gray-200 focus:outline-none">
                    <option v-for="r in ['480p', '720p', '1080p']" :key="r" :value="r">{{ r }}</option>
                  </select>
                  <select v-model.number="batchCountOption" class="bg-gray-800 border border-gray-700 rounded px-1 py-1 text-xs text-gray-200 focus:outline-none">
                    <option v-for="n in [1, 2, 3, 4]" :key="n" :value="n">×{{ n }}</option>
                  </select>
                </div>
                <p class="text-[10px] text-gray-600">时长 / 分辨率 / 张数暂为展示，不影响实际生成参数</p>
              </div>
            </div>
          </div>

          <div class="flex gap-3">
            <button
              class="flex-1 py-2 rounded-lg border border-gray-700 text-sm font-medium text-gray-200 hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-1.5"
              :disabled="generatingImages || !selectedShots.length"
              @click="generateShotImages"
            >
              {{ generatingImages ? '生成中…' : '生成分镜预览图' }}
              <span class="text-amber-400">✦{{ estimatedImageCost }}</span>
            </button>
            <button
              class="flex-1 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-sm font-medium text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
              :disabled="generatingVideo || !selectedShots.length"
              @click="generateShotVideos"
            >
              {{ generatingVideo ? '生成中…' : '生成视频' }}
              <span class="text-amber-200">✦{{ estimatedVideoCost }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 拖拽调整左右分栏宽度的手柄 -->
      <div
        class="flex-shrink-0 w-1.5 cursor-col-resize bg-gray-800 hover:bg-primary-500/60 transition-colors"
        :class="{ 'bg-primary-500/60': isResizingPanels }"
        @mousedown="startPanelResize"
      />

      <!-- 右侧：视频预览 -->
      <aside class="flex-1 min-w-0 flex flex-col">
        <div class="flex-shrink-0 px-4 py-3 flex items-center justify-between border-b border-gray-800">
          <div class="flex items-center gap-1 rounded-lg overflow-hidden border border-gray-700">
            <button
              v-for="tab in visualModeTabs" :key="tab.key"
              class="px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50"
              :class="(video?.visual_mode ?? 'standard') === tab.key ? 'bg-primary-600 text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-800'"
              :disabled="switchingVisualMode"
              @click="setVisualMode(tab.key)"
            >{{ tab.label }}</button>
          </div>
          <div class="flex items-center gap-3">
            <label class="text-xs text-gray-400 hover:text-gray-200 cursor-pointer flex items-center gap-1" :class="uploadingMedia ? 'opacity-50 pointer-events-none' : ''">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3-3m0 0l3 3m-3-3v9"/></svg>
              上传
              <input type="file" accept="image/*,video/*" class="hidden" @change="handleFileInputChange" />
            </label>
          </div>
        </div>

        <div class="flex-shrink-0 px-4 py-2 flex items-center gap-3 border-b border-gray-800">
          <button class="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1 disabled:opacity-50" :disabled="refining || !previewShot" @click="handleRefineImage">
            <svg class="w-3.5 h-3.5" :class="refining ? 'animate-spin' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>
            {{ refining ? '处理中…' : '清晰化' }}
          </button>
          <button class="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1 disabled:opacity-50" :disabled="removingSubtitle || !previewShot" @click="handleRemoveSubtitle">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3l18 18M9 9h.01M4 4h16v12a2 2 0 01-2 2H6l-2 2V4z"/></svg>
            去字幕
          </button>
          <button class="text-xs text-gray-600 cursor-not-allowed flex items-center gap-1" disabled title="暂不支持">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          </button>
          <a
            v-if="downloadUrl"
            :href="downloadUrl" download target="_blank"
            class="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1 ml-auto"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          </a>
        </div>

        <div class="flex-1 flex items-center justify-center bg-black relative">
          <span class="absolute top-2 left-2 text-[10px] px-1.5 py-0.5 rounded bg-black/60 text-gray-300 border border-gray-700">
            {{ visualModeTabs.find(t => t.key === (video?.visual_mode ?? 'standard'))?.label ?? '标准' }}
          </span>
          <video
            v-if="previewShot?.video_url"
            ref="previewVideoRef"
            :key="previewShot.id"
            :src="previewShot.video_url"
            class="max-w-full max-h-full"
            @play="isPlaying = true"
            @pause="isPlaying = false"
            @ended="handleEnded"
            @timeupdate="onTimeUpdate"
          />
          <img v-else-if="previewShot?.image_url" :src="previewShot.image_url" class="max-w-full max-h-full" />
          <p v-else class="text-gray-600 text-sm">该分镜暂无素材</p>
        </div>

        <div class="flex-shrink-0 px-4 py-3 flex items-center justify-between border-t border-gray-800">
          <span class="text-xs text-gray-500 tabular-nums w-16">{{ formattedCurrentTime }} / {{ formattedShotDuration }}</span>
          <div class="flex items-center gap-4">
            <button class="text-gray-400 hover:text-gray-200" @click="prevShot"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg></button>
            <button class="text-gray-200 hover:text-white" @click="playPause">
              <svg v-if="!isPlaying" class="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              <svg v-else class="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
            </button>
            <button class="text-gray-400 hover:text-gray-200" @click="nextShot"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg></button>
          </div>
          <button
            class="text-xs px-2 py-1 rounded-lg border w-16 text-center"
            :class="singleSegmentPlay ? 'border-primary-500 text-primary-400' : 'border-gray-700 text-gray-400'"
            @click="singleSegmentPlay = !singleSegmentPlay"
          >单段播放</button>
        </div>
      </aside>

      <!-- 视频生成历史：分镜历次生成的图片/视频，点击可恢复为当前版本 -->
      <div v-if="previewShot" class="w-24 flex-shrink-0 border-l border-gray-800 overflow-y-auto p-2 space-y-2">
        <p class="text-[10px] text-gray-500 text-center mb-1">生成历史</p>
        <p v-if="!shotHistory.length" class="text-[10px] text-gray-600 text-center">暂无历史版本</p>
        <button
          v-for="asset in shotHistory" :key="asset.id"
          class="relative block w-full aspect-video rounded border border-gray-700 hover:border-primary-500 overflow-hidden bg-gray-900 bg-cover bg-center disabled:opacity-50"
          :style="{ backgroundImage: `url(${asset.thumbnail_url || asset.storage_url})` }"
          :disabled="restoringAssetId === asset.id"
          :title="`${asset.type === 'video' ? '视频' : '图片'} · ${formatHistoryTime(asset.created_at)} · 点击恢复`"
          @click="handleRestoreAsset(asset)"
        >
          <span v-if="restoringAssetId === asset.id" class="absolute inset-0 flex items-center justify-center text-[10px] text-white bg-black/60">恢复中…</span>
          <span class="absolute bottom-0 inset-x-0 text-[9px] text-gray-200 bg-black/60 px-1 truncate">{{ formatHistoryTime(asset.created_at) }}</span>
        </button>
      </div>
    </div>

    <!-- 底部分镜时间线条：展示当前场次（由头部"场N"下拉切换）下的分镜，点击切换 previewShotIdx -->
    <div
      ref="sceneTimelineRef"
      class="flex-shrink-0 h-40 border-t border-gray-800 px-4 py-2 flex items-center gap-2 overflow-x-auto cursor-grab active:cursor-grabbing"
      @mousedown="startSceneTimelineDrag"
      @wheel="onSceneTimelineWheel"
    >
      <div v-if="!selectedShots.length" class="text-sm text-gray-500 px-2">该场次暂无分镜</div>
      <button
        v-for="(shot, idx) in selectedShots"
        :key="shot.id"
        class="flex-shrink-0 w-64 h-32 rounded-lg border-2 flex flex-col items-center justify-center gap-0.5 overflow-hidden bg-cover bg-center"
        :style="shot.image_url ? { backgroundImage: `linear-gradient(rgba(0,0,0,0.45),rgba(0,0,0,0.45)), url(${shot.image_url})` } : {}"
        :class="idx === previewShotIdx ? 'border-primary-500 bg-gray-800' : 'border-gray-800 bg-gray-900 hover:border-gray-700'"
        @click="previewShotIdx = idx"
      >
        <span class="text-xs font-medium text-gray-100">镜头 {{ shot.shot_no }}</span>
        <span class="text-[10px] text-gray-300">{{ Math.round((shot.duration || 0) * 10) / 10 }}s</span>
      </button>
    </div>

    <!-- 添加参考角色弹层 -->
    <Teleport to="body">
      <div v-if="showReferencePicker" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="showReferencePicker = false" />
        <div class="relative w-full max-w-sm bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-4 max-h-[70vh] overflow-auto">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold text-gray-100">添加参考角色</h3>
            <button class="text-gray-500 hover:text-gray-300" @click="showReferencePicker = false">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div v-if="!availableCharactersToAdd.length" class="text-xs text-gray-500 py-6 text-center">暂无可添加的角色</div>
          <div v-else class="grid grid-cols-3 gap-3">
            <button v-for="c in availableCharactersToAdd" :key="c.id" class="text-center disabled:opacity-50" :disabled="addingReference" @click="addReferenceCharacter(c.id)">
              <img v-if="c.default_look?.three_view_sheet" :src="c.default_look.three_view_sheet" class="w-14 h-14 rounded-full object-cover border border-gray-700 mx-auto" />
              <div v-else class="w-14 h-14 rounded-full bg-gray-800 flex items-center justify-center text-gray-500 mx-auto">{{ c.name?.[0] }}</div>
              <p class="text-[10px] text-gray-400 mt-1 truncate">{{ c.name }}</p>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 全部参考网格弹层 -->
    <Teleport to="body">
      <div v-if="showReferenceGrid" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="showReferenceGrid = false" />
        <div class="relative w-full max-w-lg bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-4 max-h-[70vh] overflow-auto">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold text-gray-100">全部参考</h3>
            <button class="text-gray-500 hover:text-gray-300" @click="showReferenceGrid = false">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div v-if="!referenceItems.length" class="text-xs text-gray-500 py-6 text-center">当前场次暂无参考图</div>
          <div v-else class="grid grid-cols-4 gap-3">
            <div v-for="ref in referenceItems" :key="ref.key" class="text-center">
              <img :src="ref.imageUrl" class="w-full aspect-square rounded-lg object-cover border border-gray-700" />
              <p class="text-[10px] text-gray-400 mt-1 truncate">{{ ref.label }}</p>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 导出弹层：复用已有 ExportPanel -->
    <Teleport to="body">
      <div v-if="showExportModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="showExportModal = false" />
        <div class="relative w-full max-w-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl max-h-[85vh] overflow-auto">
          <div class="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800">
            <h3 class="text-sm font-semibold text-gray-900 dark:text-gray-100">导出</h3>
            <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" @click="showExportModal = false">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            </button>
          </div>
          <div class="p-4">
            <ExportPanel :video-id="videoId" :shots="shots" />
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 历史记录：复用已有 StoryboardReviewPanel（内含审查历史 + 回滚） -->
    <StoryboardReviewPanel v-if="showHistoryPanel" :video-id="videoId" :visible="true" @close="showHistoryPanel = false" />
  </div>
</template>
