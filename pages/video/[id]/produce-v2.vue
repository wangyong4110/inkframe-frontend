<script setup lang="ts">
import type { StoryboardShot, ScreenplayScene, EpisodeSummary, Item, Asset, ShotSummary, ShotSFXItem, StoryboardMode, ShotVoiceSegment } from '~/types'

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
const novelApi = useNovelApi()
const toast = useToast()
const { confirm } = useConfirm()
const { guardAiProvider } = useAiProviderGuard()

const loading = ref(true)
const video = computed(() => videoStore.currentVideo)
// 后端 Video 响应里宽高比嵌套在 render_config.aspect_ratio（无顶层 aspect_ratio 字段），
// 顶层 aspect_ratio 只在创建/更新请求体里存在——读取时必须走 render_config，否则永远拿到
// undefined，被 || '16:9' 兜底掩盖，导致修正后横幅和预览比例都不会刷新。
const videoAspectRatio = computed(() => video.value?.render_config?.aspect_ratio || video.value?.aspect_ratio || '16:9')
const previewAspectRatio = computed(() => videoAspectRatio.value.replace(':', '/'))
const novelVideoType = ref<string | null>(null) // 项目设置里的"视频类型"（animation/narration），用于与 Video.mode 比对是否一致
const novelVideoAspectRatio = ref<string | null>(null) // 项目设置里的"宽高比"，用于与 Video.aspect_ratio 比对是否一致
// Video.aspect_ratio 创建时从项目设置带入，但项目设置后续变更不会回溯更新已创建的视频；
// 与 Video.mode 同理，这里仅在检测到不一致时给出手动修正入口，不做静默覆盖。
const aspectRatioMismatch = computed(() => novelVideoAspectRatio.value !== null && novelVideoAspectRatio.value !== videoAspectRatio.value)
const fixingAspectRatio = ref(false)
async function fixAspectRatioToProjectSetting() {
  if (!aspectRatioMismatch.value || fixingAspectRatio.value || !novelVideoAspectRatio.value) return
  const ok = await confirm(`当前视频宽高比（${videoAspectRatio.value}）与项目设置（${novelVideoAspectRatio.value}）不一致，是否修正为项目设置？不会重新生成已有分镜，仅影响预览画布与后续生成的比例。`)
  if (!ok) return
  fixingAspectRatio.value = true
  try {
    await videoStore.updateVideo(videoId, { aspect_ratio: novelVideoAspectRatio.value })
    toast.success('已修正为项目设置的宽高比')
  } catch (e: any) {
    toast.error('修正失败：' + (e.message || '未知错误'))
  } finally {
    fixingAspectRatio.value = false
  }
}
// 分镜轻量汇总（全视频，供场次侧边栏/时间轴/头部统计用，不含 description 等大字段）；
// 当前选中场次的完整分镜详情单独按需拉取（见 selectedSceneShots），避免一次性加载
// 整个视频的全部分镜——description 现在是完整的 AI 生图提示词，体积明显变大。
const shotSummaries = ref<ShotSummary[]>([])
const selectedSceneShots = ref<StoryboardShot[]>([])
const loadingSceneShots = ref(false)
const characters = computed(() => characterStore.characters)
const anchors = computed(() => sceneAnchorStore.anchors)
const items = ref<Item[]>([])

const screenplayScenes = ref<ScreenplayScene[]>([])
const selectedSceneId = ref<number | null>(null) // null 且存在于 tiles 中 = 未关联场次的旧分镜
const scriptCollapsed = ref(false)

const episodeSummaries = ref<EpisodeSummary[]>([])
const showEpisodePicker = ref(false)
const showScenePicker = ref(false)
const episodePickerRef = ref<HTMLElement | null>(null)
const scenePickerRef = ref<HTMLElement | null>(null)
onClickOutside(episodePickerRef, () => { showEpisodePicker.value = false })
onClickOutside(scenePickerRef, () => { showScenePicker.value = false })

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

// ── 按分场剧本分组分镜汇总（轻量，仅用于侧边栏/时间轴的时长与缩略图聚合展示）───
const summariesBySceneId = computed(() => {
  const m = new Map<number | null, ShotSummary[]>()
  for (const s of shotSummaries.value) {
    const key = s.screenplay_scene_id ?? null
    if (!m.has(key)) m.set(key, [])
    m.get(key)!.push(s)
  }
  return m
})

interface SceneTile { scene: ScreenplayScene | null; summaries: ShotSummary[]; duration: number; thumbnail: string | null }

const sceneTiles = computed<SceneTile[]>(() => {
  const tiles: SceneTile[] = screenplayScenes.value.map(sc => {
    const sceneSummaries = summariesBySceneId.value.get(sc.id) ?? []
    return {
      scene: sc,
      summaries: sceneSummaries,
      duration: sceneSummaries.reduce((sum, s) => sum + (s.duration || 0), 0),
      thumbnail: sceneSummaries.find(s => s.image_url)?.image_url ?? null,
    }
  })
  const ungrouped = summariesBySceneId.value.get(null) ?? []
  if (ungrouped.length > 0) {
    tiles.push({
      scene: null,
      summaries: ungrouped,
      duration: ungrouped.reduce((sum, s) => sum + (s.duration || 0), 0),
      thumbnail: ungrouped.find(s => s.image_url)?.image_url ?? null,
    })
  }
  return tiles
})

const selectedTile = computed(() => {
  return sceneTiles.value.find(t => (t.scene?.id ?? null) === selectedSceneId.value) ?? sceneTiles.value[0] ?? null
})
// 当前选中场次的完整分镜详情（含 description 等大字段），按需拉取——见 loadSelectedSceneShots。
const selectedShots = computed(() => selectedSceneShots.value)

// 全视频总时长（头部统计），基于轻量汇总计算，无需拉取完整分镜。
const totalDuration = computed(() => shotSummaries.value.reduce((sum, s) => sum + (s.duration || 0), 0))

// 按场次拉取完整分镜详情（description/character_ids/scene_anchor_id 等）。
// scene 为 null（未分组的旧分镜）时没有 scene_id 可过滤，退回拉取全量后本地过滤——
// 这是遗留兼容路径，正常场次都已关联 screenplay_scene_id。
async function loadSelectedSceneShots() {
  const tile = selectedTile.value
  if (!tile) { selectedSceneShots.value = []; return }
  loadingSceneShots.value = true
  try {
    if (tile.scene) {
      const res = await videoApi.getStoryboard(videoId, tile.scene.id)
      selectedSceneShots.value = res.data ?? []
    } else {
      const res = await videoApi.getStoryboard(videoId)
      selectedSceneShots.value = (res.data ?? []).filter(s => !s.screenplay_scene_id)
    }
  } catch (e: any) {
    toast.error('加载分镜失败：' + (e.message || '未知错误'))
  } finally {
    loadingSceneShots.value = false
  }
}
watch(selectedSceneId, loadSelectedSceneShots)

// 供各处变更（生成图片/视频、绑定角色/道具/场景锚点、上传素材等）后统一刷新：
// 同时更新轻量汇总（侧边栏时长/缩略图可能变化）和当前场次的完整详情。
async function refreshShots() {
  await Promise.all([
    videoApi.getStoryboardSummary(videoId).then(res => { shotSummaries.value = res.data ?? [] }),
    loadSelectedSceneShots(),
  ])
}

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

// ── 台词说话人识别：镜头绑定角色（character_ids）代表画面在场角色，不等于说话角色，
// 与后端 resolveVoiceForShot 保持一致——从对话文本「角色名：」前缀解析说话人 ─────────
function parseDialogueSpeakerId(dialogue: string | undefined | null): number | null {
  if (!dialogue) return null
  let speakerName = ''
  for (const sep of ['：', ':']) {
    const idx = dialogue.indexOf(sep)
    if (idx > 0 && idx < 20) { speakerName = dialogue.slice(0, idx).trim(); break }
  }
  if (!speakerName) return null
  return characters.value.find(c => c.name.toLowerCase() === speakerName.toLowerCase())?.id ?? null
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
// 文本框按内容自动撑高，使编辑态（textarea）与只读态（div，随内容自动撑开无上限）
// 的可视高度保持一致——固定 rows 在 description 这类长文本下会显得比只读态矮很多，
// 内容被截断到需要内部滚动才能看全。
function autoGrowTextarea(el?: HTMLTextAreaElement | null) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

const editingDescription = ref(false)
const descriptionTextareaRef = ref<HTMLTextAreaElement | null>(null)
function startEditingDescription() {
  if (!previewShot.value) return
  editingDescription.value = true
  nextTick(() => {
    descriptionTextareaRef.value?.focus()
    autoGrowTextarea(descriptionTextareaRef.value)
  })
}
function finishEditingDescription() {
  saveDescriptionDraft()
  editingDescription.value = false
}

// ── 分镜生成模式（Video.storyboard_mode：专业分镜/忠于原文/简洁模式） ──────────
// 与 shotDisplayFormat 命名保持不变以少改模板；现在是真实的后端字段，切换后需要
// 重新生成提示词才能生效（旧分镜的 description 仍按切换前的模式生成，不会自动改写）。
const shotDisplayFormat = computed<StoryboardMode>({
  get: () => video.value?.storyboard_mode ?? 'professional',
  set: (v) => onStoryboardModeSelected(v),
})
const STORYBOARD_MODE_LABEL: Record<StoryboardMode, string> = {
  professional: '专业分镜',
  faithful: '忠于原文',
  concise: '简洁模式',
}
const showStoryboardModeDialog = ref(false)
const pendingStoryboardModeLabel = ref('')
const switchingStoryboardMode = ref(false)
async function onStoryboardModeSelected(mode: StoryboardMode) {
  if ((video.value?.storyboard_mode ?? 'professional') === mode || switchingStoryboardMode.value) return
  switchingStoryboardMode.value = true
  try {
    await videoStore.updateVideo(videoId, { storyboard_mode: mode })
    pendingStoryboardModeLabel.value = STORYBOARD_MODE_LABEL[mode]
    showStoryboardModeDialog.value = true
  } catch (e: any) {
    toast.error('切换失败：' + (e.message || '未知错误'))
  } finally {
    switchingStoryboardMode.value = false
  }
}
async function regenerateStoryboardSegment() {
  const sceneId = selectedTile.value?.scene?.id
  if (!sceneId) return
  try {
    const taskStore = useTaskStore()
    const taskId = await screenplayApi.regenerateSceneStoryboard(sceneId, selectedProvider.value)
    toast.info('本段分镜重新生成任务已提交')
    taskStore.trackTask(taskId, () => { refreshShots() })
  } catch (e: any) {
    toast.error('提交失败：' + (e.message || '未知错误'))
  }
}
async function regenerateStoryboardAll() {
  try {
    const taskStore = useTaskStore()
    const res = await videoApi.generateStoryboard(videoId, { provider: selectedProvider.value })
    toast.info('全集分镜重新生成任务已提交')
    if (res.data?.task_id) taskStore.trackTask(res.data.task_id, () => { refreshShots() })
  } catch (e: any) {
    toast.error('提交失败：' + (e.message || '未知错误'))
  }
}

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
      videoApi.getStoryboardSummary(videoId).then(res => { shotSummaries.value = res.data ?? [] }),
    ])
    const v = videoStore.currentVideo
    if (v?.novel_id) {
      await Promise.all([
        characterStore.fetchCharacters(v.novel_id),
        sceneAnchorStore.fetchAnchors(v.novel_id),
        itemApi.listItems(v.novel_id).then(res => { items.value = res.data?.items ?? [] }).catch(() => { items.value = [] }),
        novelApi.getNovel(v.novel_id).then(res => {
          novelVideoType.value = res.data?.video_type ?? 'animation'
          novelVideoAspectRatio.value = res.data?.video_aspect_ratio ?? '16:9'
        }).catch(() => { novelVideoType.value = null; novelVideoAspectRatio.value = null }),
      ])
      try {
        const res = await videoApi.getEpisodeSummaries(v.novel_id)
        episodeSummaries.value = res.data ?? []
      } catch (e) {
        console.warn('获取剧集列表失败，剧集切换将不可用', e) // 次要功能，不阻断页面，但仍需可排查
      }
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
      const firstWithShots = sceneTiles.value.find(t => t.summaries.length > 0)
      selectedSceneId.value = (queriedTile ?? firstWithShots ?? sceneTiles.value[0]).scene?.id ?? null
    }
    // watch(selectedSceneId, ...) 不会在 null→null（默认选中"未分组"场次）时触发，
    // 显式调用一次确保首次加载时详情一定会拉取。
    await loadSelectedSceneShots()
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
  if (ep.video_id === videoId) return
  if (!ep.video_id) {
    toast.error(`第${ep.chapter_no}集尚未生成视频，无法切换`)
    return
  }
  router.push(`/video/${ep.video_id}/produce-v2`)
}

// ── 生成 ────────────────────────────────────────────────────────────────────
const generatingImages = ref(false)
const generatingVideo = ref(false)
// 生成范围：默认只针对页面上正在展示/编辑的这一个镜头（previewShot）——用户在编辑框里
// 看到的是这一个镜头的提示词/参考图，按钮紧跟在它下方，点击应作用于当前这一个镜头。
// 也支持切换为"本场次全部"，批量生成时会覆盖该场次所有分镜已有的素材，故加确认弹窗。
const generateScope = ref<'current' | 'scene'>('current')
const canGenerate = computed(() => generateScope.value === 'scene' ? selectedShots.value.length > 0 : !!previewShot.value)
function shotsForGenerate(): StoryboardShot[] {
  if (generateScope.value === 'scene') return selectedShots.value
  return previewShot.value ? [previewShot.value] : []
}
async function confirmSceneBatch(action: string): Promise<boolean> {
  if (generateScope.value !== 'scene') return true
  const count = selectedShots.value.length
  if (!count) return false
  return confirm(`将为本场次全部 ${count} 个分镜批量${action}，已生成的素材会被覆盖，且可能耗时较长，确认继续？`)
}

async function generateShotImages() {
  if (!await guardAiProvider('IMAGE')) return
  const shots = shotsForGenerate()
  if (!shots.length) return
  if (!await confirmSceneBatch('生成预览图')) return
  generatingImages.value = true
  try {
    await videoApi.batchGenerateShotImages(videoId, shots.map(s => s.id))
    toast.info(shots.length > 1 ? `已提交 ${shots.length} 个分镜的预览图生成任务` : '分镜预览图生成任务已提交')
    await refreshShots()
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || '未知错误'))
  } finally {
    generatingImages.value = false
  }
}

// 图片解说模式：Ken Burns 画面 + 配音 + 音效需要分别调用对应的单镜生成接口，
// 全部完成后统一刷新，右侧播放器再按多轨（video 静音承载画面 + audio 配音 + audio 音效）
// 同步播放，模拟一次"合成"的观感，而不需要后端真正 ffmpeg 合并出一个文件。
async function generateSlideshowShotMedia(shot: StoryboardShot) {
  const taskStore = useTaskStore()
  const taskIds: string[] = []

  const kbRes = await videoApi.batchGenerateShots(videoId, [shot.id])
  if (kbRes.data?.task_id) taskIds.push(kbRes.data.task_id)
  if (shot.narration || shot.dialogue) {
    const voiceRes = await videoApi.generateVoice(videoId, shot.id)
    if (voiceRes.data?.task_id) taskIds.push(voiceRes.data.task_id)
  }
  if (shot.sfx_tags && shot.sfx_tags !== '[]') {
    const sfxRes = await videoApi.generateShotSFX(videoId, shot.id)
    if (sfxRes.data?.task_id) taskIds.push(sfxRes.data.task_id)
  }
  await Promise.all(taskIds.map(id => new Promise<void>((resolve) => {
    taskStore.trackTask(id, () => resolve())
  })))
}

async function generateShotVideos() {
  if (!await guardAiProvider('VIDEO')) return
  const shots = shotsForGenerate()
  if (!shots.length) return
  if (!await confirmSceneBatch(isSlideshowMode.value ? '生成素材' : '生成视频')) return
  generatingVideo.value = true
  try {
    if (isSlideshowMode.value) {
      toast.info(shots.length > 1 ? `已提交 ${shots.length} 个分镜的素材生成任务（Ken Burns / 配音 / 音效）` : '图片解说素材生成任务已提交（Ken Burns / 配音 / 音效）')
      for (const shot of shots) {
        await generateSlideshowShotMedia(shot)
      }
      await refreshShots()
      await loadShotSfxItems()
      toast.success('素材已生成')
    } else {
      await videoApi.batchGenerateShots(videoId, shots.map(s => s.id))
      toast.info(shots.length > 1 ? `已提交 ${shots.length} 个分镜的视频生成任务` : '视频生成任务已提交')
      await refreshShots()
    }
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || '未知错误'))
  } finally {
    generatingVideo.value = false
  }
}

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
    await refreshShots()
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
    await refreshShots()
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

// ── 视频类型：Video.mode（video=AI 视频 / slideshow=图片解说）───────────────
// 创建时写死的快照，页面上仅展示当前类型，不支持随意切换；但若与项目设置（Novel.video_type）
// 不一致（例如项目设置是视频创建后才修改的），提供一个仅在不一致时出现的手动修正入口。
const videoModeLabels: Record<'video' | 'slideshow', string> = {
  video: '视频动画',
  slideshow: '图片解说',
}
const currentVideoModeLabel = computed(() => videoModeLabels[video.value?.mode ?? 'video'])
const expectedVideoMode = computed<'video' | 'slideshow'>(() => (novelVideoType.value === 'narration' ? 'slideshow' : 'video'))
const videoModeMismatch = computed(() => novelVideoType.value !== null && expectedVideoMode.value !== (video.value?.mode ?? 'video'))
const fixingVideoMode = ref(false)
async function fixVideoModeToProjectSetting() {
  if (!videoModeMismatch.value || fixingVideoMode.value) return
  const ok = await confirm(`当前视频类型（${currentVideoModeLabel.value}）与项目设置（${videoModeLabels[expectedVideoMode.value]}）不一致，是否修正为项目设置？不会重新生成已有分镜，仅影响后续生成方式（Ken Burns 静态图 vs. AI 视频）和旁白/台词编辑入口。`)
  if (!ok) return
  fixingVideoMode.value = true
  try {
    await videoStore.updateVideo(videoId, { mode: expectedVideoMode.value })
    toast.success('已修正为项目设置的视频类型')
  } catch (e: any) {
    toast.error('修正失败：' + (e.message || '未知错误'))
  } finally {
    fixingVideoMode.value = false
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
    await refreshShots()
  } catch (e: any) {
    toast.error('绑定失败：' + (e.message || ''))
  }
}
async function setPreviewShotCharacters(characterIds: number[]) {
  if (!previewShot.value) return
  try {
    await videoApi.setShotCharacters(videoId, previewShot.value.id, characterIds)
    await refreshShots()
  } catch (e: any) {
    toast.error('角色绑定失败：' + (e.message || ''))
  }
}
const showCharPicker = ref(false)
const charPickerRef = ref<HTMLElement | null>(null)
onClickOutside(charPickerRef, () => { showCharPicker.value = false })
function addCharIdToPreviewShot(id: number) {
  showCharPicker.value = false
  if (!previewShot.value) return
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
    await refreshShots()
  } catch (e: any) {
    toast.error('道具绑定失败：' + (e.message || ''))
  }
}
const showItemPicker = ref(false)
const itemPickerRef = ref<HTMLElement | null>(null)
onClickOutside(itemPickerRef, () => { showItemPicker.value = false })
function addItemIdToPreviewShot(id: number) {
  showItemPicker.value = false
  if (!previewShot.value) return
  setPreviewShotItems([...(previewShot.value.item_ids || []), id])
}
function removeItemFromPreviewShot(itemId: number) {
  if (!previewShot.value) return
  setPreviewShotItems((previewShot.value.item_ids || []).filter(id => id !== itemId))
}

// selectedSceneShots 是本页独立维护的场次详情副本（不再经过 videoStore.storyboard），
// 单镜头字段更新后需要手动把响应写回这份本地副本，否则切走再切回会显示编辑前的旧值。
function patchSelectedShot(updated: StoryboardShot) {
  const idx = selectedSceneShots.value.findIndex(s => s.id === updated.id)
  if (idx !== -1) selectedSceneShots.value[idx] = updated
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
    const res = await videoApi.updateStoryboardShot(videoId, shot.id, { description: descriptionDraft.value })
    patchSelectedShot(res.data)
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || '未知错误'))
  } finally {
    savingDescription.value = false
  }
}
function onDescriptionInput() {
  autoGrowTextarea(descriptionTextareaRef.value)
  if (descriptionSaveTimer) clearTimeout(descriptionSaveTimer)
  descriptionSaveTimer = setTimeout(saveDescriptionDraft, 1000)
}

// ── 图片解说模式：旁白/台词可编辑（增删改）──────────────────────────────────
// 图片解说没有连续 AI 视频，画面纯静态，旁白/台词文案才是驱动这类视频叙事的主要内容，
// 因此在此模式下把原本只读展示的台词，连同旁白一起，改为与 description 一致的
// 自动保存文本框——留空即视为删除，非空即视为新增/修改。
const isSlideshowMode = computed(() => video.value?.mode === 'slideshow')

// 图片解说模式下该镜头已生成的音效条目（配音走 shot.audio_url，这里只需单独拉音效列表）
const shotSfxItems = ref<ShotSFXItem[]>([])
async function loadShotSfxItems() {
  if (!previewShot.value) { shotSfxItems.value = []; return }
  try {
    const res = await videoApi.listShotSFXItems(videoId, previewShot.value.id)
    shotSfxItems.value = (res.data ?? []).filter(i => !i.disabled && (i.audio_url || i.url))
  } catch {
    shotSfxItems.value = []
  }
}
watch(previewShot, () => { loadShotSfxItems() }, { immediate: true })

// ── 图片解说模式：Ken Burns 效果选择 ─────────────────────────────────────────
// 图片解说的静态图转视频（generateKenBurnsPureGo）直接复用 camera_type 字段驱动缩放/平移
// 动画。与后端 kbCrop（kenburns_go.go）保持一致——只暴露后端真正实现的运镜效果，
// 避免出现预览与生成的 Ken Burns 视频不一致（未识别的 camera_type 会静默退化为默认缓推）。
const KEN_BURNS_OPTIONS: { value: string; label: string }[] = [
  { value: 'static', label: '经典缓推（轻微放大）' },
  { value: 'zoom', label: '放大（推近）' },
  { value: 'zoom_out', label: '缩小（拉远）' },
  { value: 'pan', label: '横向平移（左→右）' },
  { value: 'pan_reverse', label: '横向平移（右→左）' },
  { value: 'tilt', label: '纵向平移（上→下）' },
  { value: 'tilt_reverse', label: '纵向平移（下→上）' },
]
const savingKenBurns = ref(false)
async function setKenBurnsEffect(value: string) {
  const shot = previewShot.value
  if (!shot || savingKenBurns.value || shot.camera_type === value) return
  savingKenBurns.value = true
  try {
    const res = await videoApi.updateStoryboardShot(videoId, shot.id, { camera_type: value })
    patchSelectedShot(res.data)
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || '未知错误'))
  } finally {
    savingKenBurns.value = false
  }
}

const narrationDraft = ref('')
const dialogueDraft = ref('')
const previewShotSpeakerId = computed(() => parseDialogueSpeakerId(previewShot.value?.dialogue))
const dialogueDraftSpeakerId = computed(() => parseDialogueSpeakerId(dialogueDraft.value))
const editingNarration = ref(false)
const editingDialogue = ref(false)
const narrationInputRef = ref<HTMLInputElement | null>(null)
const dialogueInputRef = ref<HTMLInputElement | null>(null)
watch(previewShot, (shot) => {
  narrationDraft.value = shot?.narration ?? ''
  dialogueDraft.value = shot?.dialogue ?? ''
  editingNarration.value = false
  editingDialogue.value = false
}, { immediate: true })

const savingNarration = ref(false)
let narrationSaveTimer: ReturnType<typeof setTimeout> | null = null
async function saveNarrationDraft() {
  if (narrationSaveTimer) { clearTimeout(narrationSaveTimer); narrationSaveTimer = null }
  const shot = previewShot.value
  if (!shot || narrationDraft.value === (shot.narration ?? '')) return
  savingNarration.value = true
  try {
    const res = await videoApi.updateStoryboardShot(videoId, shot.id, { narration: narrationDraft.value })
    patchSelectedShot(res.data)
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || '未知错误'))
  } finally {
    savingNarration.value = false
  }
}
function onNarrationInput() {
  if (narrationSaveTimer) clearTimeout(narrationSaveTimer)
  narrationSaveTimer = setTimeout(saveNarrationDraft, 1000)
}
function startEditingNarration() {
  editingNarration.value = true
  nextTick(() => narrationInputRef.value?.focus())
}
function finishEditingNarration() {
  saveNarrationDraft()
  editingNarration.value = false
}
async function clearNarration() {
  narrationDraft.value = ''
  await saveNarrationDraft()
}

const savingDialogue = ref(false)
let dialogueSaveTimer: ReturnType<typeof setTimeout> | null = null
async function saveDialogueDraft() {
  if (dialogueSaveTimer) { clearTimeout(dialogueSaveTimer); dialogueSaveTimer = null }
  const shot = previewShot.value
  if (!shot || dialogueDraft.value === (shot.dialogue ?? '')) return
  savingDialogue.value = true
  try {
    const res = await videoApi.updateStoryboardShot(videoId, shot.id, { dialogue: dialogueDraft.value })
    patchSelectedShot(res.data)
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || '未知错误'))
  } finally {
    savingDialogue.value = false
  }
}
function onDialogueInput() {
  if (dialogueSaveTimer) clearTimeout(dialogueSaveTimer)
  dialogueSaveTimer = setTimeout(saveDialogueDraft, 1000)
}
function startEditingDialogue() {
  editingDialogue.value = true
  nextTick(() => dialogueInputRef.value?.focus())
}
function finishEditingDialogue() {
  saveDialogueDraft()
  editingDialogue.value = false
}
async function clearDialogue() {
  dialogueDraft.value = ''
  await saveDialogueDraft()
}

const generatingShotVoice = ref(false)
async function handleGenerateShotVoice() {
  const shot = previewShot.value
  if (!shot || generatingShotVoice.value) return
  generatingShotVoice.value = true
  try {
    const res = await videoApi.generateVoice(videoId, shot.id)
    if (res.data?.task_id) {
      const taskStore = useTaskStore()
      taskStore.trackTask(res.data.task_id, () => {})
    }
  } catch (e: any) {
    toast.error('生成配音失败：' + (e.message || '未知错误'))
  } finally {
    generatingShotVoice.value = false
  }
}

// ── 分镜语音片段（ShotVoiceSegment）：一个分镜可拆成多段旁白/台词，每段可单独设置
// 说话人/情绪/语言（复用 VoiceTab.vue 已有的 API 与交互逻辑，这里做当前单镜头的紧凑版）。
// 迁移策略与 VoiceTab.vue 保持一致：一旦某镜头存在任意 segment，上面旧的单一
// 旁白/台词编辑框整体隐藏，避免同一份内容出现两套编辑入口。
const EMOTION_OPTIONS = ['平静', '温馨', '激动', '悲伤', '开心', '愤怒', '神秘']
const LANGUAGE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: '普通话' },
  { value: 'zh-yue', label: '粤语' },
  { value: 'zh-scu', label: '四川话' },
  { value: 'zh-nan', label: '闽南语' },
  { value: 'zh-wu', label: '吴语' },
  { value: 'en', label: 'English' },
]
const EMOTION_COLOR_MAP: Record<string, string> = {
  平静: 'bg-gray-700 text-gray-300',
  温馨: 'bg-pink-900/40 text-pink-300',
  激动: 'bg-amber-900/40 text-amber-300',
  悲伤: 'bg-blue-900/40 text-blue-300',
  开心: 'bg-green-900/40 text-green-300',
  愤怒: 'bg-red-900/40 text-red-300',
  神秘: 'bg-purple-900/40 text-purple-300',
}
function emotionClass(tone: string | undefined): string {
  return tone ? (EMOTION_COLOR_MAP[tone] ?? 'bg-gray-800 text-gray-400') : 'bg-gray-800 text-gray-500'
}

const shotSegments = ref<ShotVoiceSegment[]>([])
const loadingSegments = ref(false)
const segmentCache = new Map<number, ShotVoiceSegment[]>()
async function loadShotSegments(shot: StoryboardShot | null) {
  if (!shot) { shotSegments.value = []; return }
  if (segmentCache.has(shot.id)) { shotSegments.value = segmentCache.get(shot.id)!; return }
  loadingSegments.value = true
  try {
    const res = await videoApi.listVoiceSegments(videoId, shot.id)
    const data = res.data ?? []
    shotSegments.value = data
    segmentCache.set(shot.id, data)
  } catch {
    shotSegments.value = []
  } finally {
    loadingSegments.value = false
  }
}
function invalidateSegmentCache(shotId: number) {
  segmentCache.delete(shotId)
}
watch(previewShot, (shot) => { loadShotSegments(shot) }, { immediate: true })

const showAppendSegmentForm = ref(false)
const newSegmentSpeaker = ref('')
const newSegmentEmotion = ref('')
const newSegmentLanguage = ref('')
const newSegmentText = ref('')
const newSegmentInputRef = ref<HTMLInputElement | null>(null)
function openAppendSegmentForm() {
  showAppendSegmentForm.value = true
  newSegmentSpeaker.value = ''
  newSegmentEmotion.value = ''
  newSegmentLanguage.value = ''
  newSegmentText.value = ''
  nextTick(() => newSegmentInputRef.value?.focus())
}
async function handleAppendSegment() {
  const shot = previewShot.value
  const text = newSegmentText.value.trim()
  if (!shot || !text) return
  try {
    const res = await videoApi.appendVoiceSegment(videoId, shot.id, {
      text,
      speaker: newSegmentSpeaker.value || undefined,
      emotion: newSegmentEmotion.value || undefined,
      language: newSegmentLanguage.value || undefined,
    })
    const updated = [...shotSegments.value, res.data!]
    shotSegments.value = updated
    segmentCache.set(shot.id, updated)
    showAppendSegmentForm.value = false
  } catch (e: any) {
    toast.error('添加片段失败：' + (e.message || '未知错误'))
  }
}

const editingSegId = ref<number | null>(null)
const editingSegText = ref('')
function startEditingSegment(seg: ShotVoiceSegment) {
  editingSegId.value = seg.id
  editingSegText.value = seg.text
}
async function saveSegmentText(seg: ShotVoiceSegment) {
  if (editingSegId.value !== seg.id) return
  const shot = previewShot.value
  const text = editingSegText.value.trim()
  editingSegId.value = null
  if (!shot || !text || text === seg.text) return
  const updated = shotSegments.value.map(s => s.id === seg.id ? { ...s, text } : s)
  shotSegments.value = updated
  segmentCache.set(shot.id, updated)
  try {
    await videoApi.updateVoiceSegment(videoId, shot.id, seg.id, { text, speaker: seg.speaker, emotion: seg.emotion, language: seg.language })
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || '未知错误'))
    const reverted = shotSegments.value.map(s => s.id === seg.id ? { ...s, text: seg.text } : s)
    shotSegments.value = reverted
    segmentCache.set(shot.id, reverted)
  }
}
async function handleSegmentEmotionChange(seg: ShotVoiceSegment, emotion: string) {
  const shot = previewShot.value
  if (!shot) return
  const prevEmotion = seg.emotion ?? ''
  const updated = shotSegments.value.map(s => s.id === seg.id ? { ...s, emotion } : s)
  shotSegments.value = updated
  segmentCache.set(shot.id, updated)
  try {
    await videoApi.updateVoiceSegment(videoId, shot.id, seg.id, { text: seg.text, speaker: seg.speaker, emotion, language: seg.language })
  } catch (e: any) {
    toast.error('情绪保存失败：' + (e.message || '未知错误'))
    const reverted = shotSegments.value.map(s => s.id === seg.id ? { ...s, emotion: prevEmotion } : s)
    shotSegments.value = reverted
    segmentCache.set(shot.id, reverted)
  }
}
async function handleSegmentLanguageChange(seg: ShotVoiceSegment, language: string) {
  const shot = previewShot.value
  if (!shot) return
  const prevLanguage = seg.language ?? ''
  const updated = shotSegments.value.map(s => s.id === seg.id ? { ...s, language } : s)
  shotSegments.value = updated
  segmentCache.set(shot.id, updated)
  try {
    await videoApi.updateVoiceSegment(videoId, shot.id, seg.id, { text: seg.text, speaker: seg.speaker, emotion: seg.emotion, language })
  } catch (e: any) {
    toast.error('方言保存失败：' + (e.message || '未知错误'))
    const reverted = shotSegments.value.map(s => s.id === seg.id ? { ...s, language: prevLanguage } : s)
    shotSegments.value = reverted
    segmentCache.set(shot.id, reverted)
  }
}
async function deleteSegment(seg: ShotVoiceSegment) {
  const shot = previewShot.value
  if (!shot) return
  if (!await confirm(`确认删除第 ${seg.seq_no} 段？`)) return
  try {
    await videoApi.deleteVoiceSegment(videoId, shot.id, seg.id)
    const updated = shotSegments.value.filter(s => s.id !== seg.id)
    shotSegments.value = updated
    segmentCache.set(shot.id, updated)
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || '未知错误'))
  }
}
const generatingSegmentVoice = ref<Record<number, boolean>>({})
async function generateSegmentVoiceForSeg(seg: ShotVoiceSegment) {
  const shot = previewShot.value
  if (!shot || generatingSegmentVoice.value[seg.id]) return
  if (!await guardAiProvider('TTS')) return
  generatingSegmentVoice.value[seg.id] = true
  try {
    const res = await videoApi.generateSegmentVoice(videoId, shot.id, seg.id)
    const taskId = res.data?.task_id
    if (taskId) {
      toast.info(`片段 ${seg.seq_no} 配音生成中…`)
      useTaskStore().trackTask(taskId, async (task) => {
        generatingSegmentVoice.value[seg.id] = false
        if (task.status === 'completed') {
          invalidateSegmentCache(shot.id)
          await loadShotSegments(shot)
          toast.success(`片段 ${seg.seq_no} 配音已完成`)
        } else {
          toast.error(`片段 ${seg.seq_no} 配音失败`)
        }
      })
    } else {
      generatingSegmentVoice.value[seg.id] = false
    }
  } catch (e: any) {
    toast.error('配音失败：' + (e.message || '未知错误'))
    generatingSegmentVoice.value[seg.id] = false
  }
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
    await refreshShots()
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

// ── 上传 / 下载 ──────────────────────────────────────────────────────────
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
    await refreshShots()
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

const downloadUrl = computed(() => previewShot.value?.video_url || previewShot.value?.image_url || '')

// ── 导出：紧凑下拉（只保留"导出模式"三选一 + 确认按钮，不弹整块 ExportPanel 面板）───
// 三种模式各自直接调用对应导出接口，不需要像 ExportPanel 那样预先拉取全视频分镜判断
// 就绪度——merged/shots/assets 三个接口本身都是按 videoId 服务端处理，不依赖前端传分镜。
const showExportDropdown = ref(false)
const exportDropdownRef = ref<HTMLElement | null>(null)
onClickOutside(exportDropdownRef, () => { showExportDropdown.value = false })

const EXPORT_MODES = [
  {
    key: 'merged' as const,
    label: '合并视频',
    desc: '将所有分镜合并为一个视频',
    icon: 'M15 10l4.553-2.069A1 1 0 0121 8.876V15.5a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z',
  },
  {
    key: 'shots' as const,
    label: '分镜切片',
    desc: '将每个分镜独立导出（.zip）',
    icon: 'M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z',
  },
  {
    key: 'assets' as const,
    label: '素材',
    desc: '导出全部素材文件（视频/图片/配音/音效/BGM）',
    icon: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8M10 12h4',
  },
]
type ExportModeKey = typeof EXPORT_MODES[number]['key']
const exportMode = ref<ExportModeKey>('merged')
const exportingMode = ref(false)

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function confirmExport() {
  if (exportingMode.value) return
  exportingMode.value = true
  try {
    if (exportMode.value === 'merged') {
      const { request } = useApi()
      await request(`/videos/${videoId}/synthesize`, { method: 'POST' })
      toast.success('合成任务已提交，请稍后在生成历史/时间线中查看进度')
    } else {
      const format = exportMode.value === 'shots' ? 'shots' : 'zip'
      const blob = await videoApi.exportVideo(videoId, format)
      triggerDownload(blob, `${video.value?.title || 'video'}_${format}.zip`)
      toast.success('导出成功')
    }
    showExportDropdown.value = false
  } catch (e: any) {
    toast.error('导出失败：' + (e.message || '未知错误'))
  } finally {
    exportingMode.value = false
  }
}

// ── 视频预览（单段播放 / 整场连续播放） ──────────────────────────────────────
const previewVideoRef = ref<HTMLVideoElement | null>(null)
const isPlaying = ref(false)
const singleSegmentPlay = ref(true)
const currentTime = ref(0)

// 图片解说模式下，画面（Ken Burns 视频，静音）与配音/音效是各自独立的媒体文件，
// 没有做服务端合成，靠这里手动同步 play/pause/seek 模拟"合成播放"的效果。
const previewVoiceRef = ref<HTMLAudioElement | null>(null)
const previewSfxRefs = ref<Record<number, HTMLAudioElement | null>>({})
function setSfxRef(el: Element | null, id: number) {
  previewSfxRefs.value[id] = el as HTMLAudioElement | null
}
function syncPreviewAudio(action: 'play' | 'pause', seek?: number) {
  const els: (HTMLAudioElement | null)[] = [previewVoiceRef.value, ...Object.values(previewSfxRefs.value)]
  for (const el of els) {
    if (!el || !el.src) continue
    if (seek != null) el.currentTime = seek
    if (action === 'play') el.play().catch(() => {})
    else el.pause()
  }
}

// 图片解说模式下，若该镜头还没有生成 Ken Burns 视频（无 video_url，只有静态 image_url），
// 没有 <video> 元素可控制，靠本地计时器模拟播放进度/结束事件，驱动 CSS 运镜动画
// （kenBurnsPreviewStyle）作为生成视频前的即时预览。
let imagePlaybackTimer: ReturnType<typeof setInterval> | null = null
function stopImagePlaybackTimer() {
  if (imagePlaybackTimer) { clearInterval(imagePlaybackTimer); imagePlaybackTimer = null }
}
onUnmounted(() => stopImagePlaybackTimer())

// 切换场次时才回到该场次第一个分镜；场次不变、仅数据刷新（如生成图片/视频后 refreshShots）
// 不应打断用户正在查看/编辑的分镜——之前误绑定在 selectedShots 上，导致每次刷新都跳回镜头1。
watch(selectedSceneId, () => { previewShotIdx.value = 0 })
watch(selectedShots, (shots) => {
  if (previewShotIdx.value >= shots.length) previewShotIdx.value = Math.max(0, shots.length - 1)
})
watch(previewShot, () => {
  currentTime.value = 0
  isPlaying.value = false
  stopImagePlaybackTimer()
  syncPreviewAudio('pause', 0)
})

function startPreviewPlayback() {
  const el = previewVideoRef.value
  if (el) {
    syncPreviewAudio('play', el.currentTime)
    el.play().catch(() => {})
    isPlaying.value = true
    return
  }
  if (!previewShot.value?.image_url) return
  syncPreviewAudio('play', currentTime.value)
  isPlaying.value = true
  const duration = previewShot.value.duration || 5
  stopImagePlaybackTimer()
  imagePlaybackTimer = setInterval(() => {
    currentTime.value += 0.1
    if (currentTime.value >= duration) {
      currentTime.value = duration
      stopImagePlaybackTimer()
      handleEnded()
    }
  }, 100)
}
function stopPreviewPlayback() {
  previewVideoRef.value?.pause()
  stopImagePlaybackTimer()
  syncPreviewAudio('pause')
  isPlaying.value = false
}
function playPause() {
  if (isPlaying.value) stopPreviewPlayback()
  else startPreviewPlayback()
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
  stopImagePlaybackTimer()
  syncPreviewAudio('pause')
  if (!singleSegmentPlay.value && previewShotIdx.value < selectedShots.value.length - 1) {
    nextShot()
    nextTick(() => { startPreviewPlayback() })
  }
}

// 运镜（Ken Burns）客户端预览动画：镜头尚未生成服务端视频时，直接在静态图上用 CSS
// 动画模拟对应 camera_type 的推拉/平移效果，与 generateKenBurnsPureGo（kbCrop）保持
// 同一套效果名称，但只是近似预览，不追求像素级一致。
const KEN_BURNS_ANIMATION_NAMES: Record<string, string> = {
  static: 'kb-static',
  zoom: 'kb-zoom',
  zoom_out: 'kb-zoom-out',
  pan: 'kb-pan',
  pan_reverse: 'kb-pan-reverse',
  tilt: 'kb-tilt',
  tilt_reverse: 'kb-tilt-reverse',
}
const kenBurnsPreviewStyle = computed(() => {
  if (!previewShot.value) return {}
  const duration = previewShot.value.duration || 5
  return {
    animationName: KEN_BURNS_ANIMATION_NAMES[previewShot.value.camera_type || 'static'] || 'kb-static',
    animationDuration: `${duration}s`,
    animationTimingFunction: 'ease-in-out',
    animationFillMode: 'forwards',
    animationPlayState: isPlaying.value ? 'running' : 'paused',
  }
})
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
        <div ref="episodePickerRef" class="relative">
          <button class="flex items-center gap-1.5 text-sm font-medium hover:text-gray-300" @click="showEpisodePicker = !showEpisodePicker">
            第 {{ episodeSummaries.find(e => e.video_id === videoId)?.chapter_no ?? '?' }} 集 {{ video?.title }}
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </button>
          <div v-if="showEpisodePicker" class="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-56 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-20 py-1 max-h-80 overflow-auto">
            <button
              v-for="ep in episodeSummaries" :key="ep.chapter_id"
              :disabled="!ep.video_id"
              class="w-full text-left px-3 py-2 text-sm hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              :class="ep.video_id === videoId ? 'text-primary-400' : 'text-gray-300'"
              @click="switchEpisode(ep)"
            >第 {{ ep.chapter_no }} 集 {{ ep.title }}{{ !ep.video_id ? '（未生成）' : '' }}</button>
          </div>
        </div>

        <div v-if="selectedTile?.scene" ref="scenePickerRef" class="relative">
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

        <span class="text-xs text-gray-500">{{ shotSummaries.length }} 个分镜 · {{ Math.round(totalDuration) }}s</span>
      </div>

      <div class="flex items-center gap-3">
        <span class="px-2.5 py-1 text-xs font-medium rounded-lg bg-primary-600 text-white">{{ currentVideoModeLabel }}</span>
        <button
          v-if="videoModeMismatch"
          class="text-xs px-2 py-1 rounded-lg border border-amber-500 text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
          :disabled="fixingVideoMode"
          :title="`与项目设置（${videoModeLabels[expectedVideoMode]}）不一致，点击修正`"
          @click="fixVideoModeToProjectSetting"
        >⚠️ 与项目设置不一致</button>
        <button
          v-if="aspectRatioMismatch"
          class="text-xs px-2 py-1 rounded-lg border border-amber-500 text-amber-400 hover:bg-amber-500/10 disabled:opacity-50"
          :disabled="fixingAspectRatio"
          :title="`宽高比与项目设置（${novelVideoAspectRatio}）不一致，点击修正`"
          @click="fixAspectRatioToProjectSetting"
        >⚠️ 宽高比与项目设置不一致</button>
        <div ref="exportDropdownRef" class="relative">
          <button class="text-sm text-gray-400 hover:text-gray-200 flex items-center gap-1.5" @click="showExportDropdown = !showExportDropdown">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
            导出
          </button>
          <div
            v-if="showExportDropdown"
            class="absolute top-full mt-2 right-0 w-72 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-20 p-3 space-y-2"
          >
            <p class="text-xs text-gray-500 px-1">导出模式</p>
            <button
              v-for="mode in EXPORT_MODES" :key="mode.key"
              class="w-full flex items-center gap-2.5 p-2 rounded-lg border transition-colors text-left"
              :class="exportMode === mode.key
                ? 'border-primary-500 bg-primary-900/20'
                : 'border-gray-800 hover:border-gray-700 hover:bg-gray-800'"
              @click="exportMode = mode.key"
            >
              <div class="w-7 h-7 rounded-lg bg-gray-800 flex items-center justify-center flex-shrink-0">
                <svg class="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="mode.icon" />
                </svg>
              </div>
              <div class="flex-1 min-w-0">
                <span class="text-sm font-medium text-gray-100">{{ mode.label }}</span>
                <p class="text-[11px] text-gray-500 truncate">{{ mode.desc }}</p>
              </div>
              <svg v-if="exportMode === mode.key" class="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </button>
            <button
              class="w-full py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-sm font-medium text-white disabled:opacity-50 transition-colors"
              :disabled="exportingMode"
              @click="confirmExport"
            >
              {{ exportingMode ? '导出中...' : '导出' }}
            </button>
          </div>
        </div>
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
              <select v-model="shotDisplayFormat" :disabled="switchingStoryboardMode" class="bg-gray-900 border border-gray-700 rounded-lg text-xs px-2 py-1.5 text-gray-300 focus:outline-none disabled:opacity-50">
                <option value="professional">格式：专业分镜</option>
                <option value="faithful">格式：忠于原文</option>
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
              <div ref="charPickerRef" class="relative flex-shrink-0">
                <button
                  class="bg-gray-900 border border-gray-700 rounded text-xs px-1.5 py-1 text-gray-300 hover:bg-gray-800"
                  @click="showCharPicker = !showCharPicker"
                >+ 绑定角色</button>
                <div
                  v-if="showCharPicker"
                  class="absolute left-0 top-full mt-1 z-20 w-56 max-h-60 overflow-auto bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-2"
                >
                  <div v-if="!unassignedCharactersForPreviewShot.length" class="text-xs text-gray-500 text-center py-4">暂无可绑定角色</div>
                  <div v-else class="grid grid-cols-3 gap-2">
                    <button
                      v-for="c in unassignedCharactersForPreviewShot" :key="c.id"
                      class="text-center"
                      @click="addCharIdToPreviewShot(c.id)"
                    >
                      <img v-if="c.default_look?.three_view_sheet" :src="c.default_look.three_view_sheet" class="w-12 h-12 rounded-lg object-cover border border-gray-700 mx-auto" />
                      <div v-else class="w-12 h-12 rounded-lg bg-gray-800 flex items-center justify-center text-gray-500 mx-auto text-sm">{{ c.name?.[0] }}</div>
                      <p class="text-[10px] text-gray-400 mt-1 truncate">{{ c.name }}</p>
                    </button>
                  </div>
                </div>
              </div>
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
                <div ref="itemPickerRef" class="relative flex-shrink-0">
                  <button
                    class="bg-gray-900 border border-gray-700 rounded text-xs px-1.5 py-1 text-gray-300 hover:bg-gray-800"
                    @click="showItemPicker = !showItemPicker"
                  >+ 绑定道具</button>
                  <div
                    v-if="showItemPicker"
                    class="absolute left-0 top-full mt-1 z-20 w-56 max-h-60 overflow-auto bg-gray-900 border border-gray-700 rounded-lg shadow-2xl p-2"
                  >
                    <div v-if="!unassignedItemsForPreviewShot.length" class="text-xs text-gray-500 text-center py-4">暂无可绑定道具</div>
                    <div v-else class="grid grid-cols-3 gap-2">
                      <button
                        v-for="it in unassignedItemsForPreviewShot" :key="it.id"
                        class="text-center"
                        @click="addItemIdToPreviewShot(it.id)"
                      >
                        <img v-if="it.image_url || it.reference_image_url" :src="it.image_url || it.reference_image_url" class="w-12 h-12 rounded-lg object-cover border border-gray-700 mx-auto" />
                        <div v-else class="w-12 h-12 rounded-lg bg-gray-800 flex items-center justify-center text-gray-500 mx-auto text-sm">{{ it.name?.[0] }}</div>
                        <p class="text-[10px] text-gray-400 mt-1 truncate">{{ it.name }}</p>
                      </button>
                    </div>
                  </div>
                </div>
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
              镜头 {{ previewShot.shot_no }} ({{ previewShot.duration }}s)<template v-if="shotDisplayFormat !== 'concise' && previewShot.camera_type">：{{ cameraTypeLabel(previewShot.camera_type) }}</template>
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
              class="w-full min-h-[4.5rem] bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 resize-none overflow-hidden focus:outline-none focus:border-primary-600 mb-2"
              @input="onDescriptionInput"
              @blur="finishEditingDescription"
            />
            <template v-if="isSlideshowMode">
              <div class="flex items-center justify-between mb-1">
                <span class="text-xs text-gray-500">旁白 / 台词</span>
                <button
                  class="p-1 rounded text-gray-500 hover:text-primary-400 hover:bg-gray-800 transition-colors"
                  title="添加语音片段"
                  @click="openAppendSegmentForm"
                >
                  <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                </button>
              </div>
              <!-- 旧版单一旁白/台词编辑框：仅在该镜头还没有任何语音片段时展示，一旦有片段则改由下方片段列表编辑 -->
              <template v-if="!shotSegments.length">
              <div v-if="narrationDraft || editingNarration" class="mb-1.5 flex items-center gap-1.5">
                <span class="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-medium whitespace-nowrap flex-shrink-0">旁白</span>
                <span
                  v-if="previewShot.emotional_tone"
                  class="text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0 bg-gray-800 text-gray-400"
                >{{ previewShot.emotional_tone }}</span>
                <p
                  v-if="!editingNarration"
                  class="flex-1 min-w-0 text-sm italic text-primary-400 line-clamp-1 cursor-text"
                  @click="startEditingNarration"
                >{{ narrationDraft }}</p>
                <input
                  v-else
                  ref="narrationInputRef"
                  v-model="narrationDraft"
                  placeholder="旁白文案（无旁白留空）"
                  class="flex-1 min-w-0 text-sm italic text-primary-400 bg-transparent border-b border-primary-600 focus:outline-none py-0.5"
                  @input="onNarrationInput"
                  @keydown.enter="($event.target as HTMLInputElement).blur()"
                  @blur="finishEditingNarration"
                />
                <div class="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    class="p-1 rounded text-gray-500 hover:text-primary-400 hover:bg-gray-800 transition-colors disabled:opacity-50"
                    :disabled="generatingShotVoice"
                    title="生成配音"
                    @click="handleGenerateShotVoice"
                  >
                    <svg v-if="generatingShotVoice" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" /><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  </button>
                  <button
                    class="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors"
                    title="清空旁白"
                    @click="clearNarration"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
              <button
                v-else
                class="mb-1.5 flex items-center gap-1 text-xs text-gray-500 hover:text-primary-400 transition-colors"
                @click="startEditingNarration"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
                添加旁白
              </button>

              <div v-if="dialogueDraft || editingDialogue" class="flex items-center gap-1.5">
                <span
                  class="text-xs px-1.5 py-0.5 rounded font-medium whitespace-nowrap flex-shrink-0"
                  :class="dialogueDraftSpeakerId ? 'bg-blue-900/20 text-blue-400 border border-blue-700' : 'bg-gray-800 text-gray-400'"
                >{{ dialogueDraftSpeakerId ? characterName(dialogueDraftSpeakerId) : '台词' }}</span>
                <span
                  v-if="previewShot.emotional_tone"
                  class="text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0 bg-gray-800 text-gray-400"
                >{{ previewShot.emotional_tone }}</span>
                <p
                  v-if="!editingDialogue"
                  class="flex-1 min-w-0 text-sm italic text-primary-400 line-clamp-1 cursor-text"
                  @click="startEditingDialogue"
                >{{ dialogueDraft }}</p>
                <input
                  v-else
                  ref="dialogueInputRef"
                  v-model="dialogueDraft"
                  placeholder="角色名：台词内容（无台词留空）"
                  class="flex-1 min-w-0 text-sm italic text-primary-400 bg-transparent border-b border-primary-600 focus:outline-none py-0.5"
                  @input="onDialogueInput"
                  @keydown.enter="($event.target as HTMLInputElement).blur()"
                  @blur="finishEditingDialogue"
                />
                <div class="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    class="p-1 rounded text-gray-500 hover:text-primary-400 hover:bg-gray-800 transition-colors disabled:opacity-50"
                    :disabled="generatingShotVoice"
                    title="生成配音"
                    @click="handleGenerateShotVoice"
                  >
                    <svg v-if="generatingShotVoice" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" /><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  </button>
                  <button
                    class="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors"
                    title="清空台词"
                    @click="clearDialogue"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
              </template>

              <!-- 分镜语音片段列表：一旦存在任意片段，取代上面的单一旁白/台词编辑框 -->
              <div v-if="loadingSegments" class="text-xs text-gray-500 py-1">加载中…</div>
              <div v-else class="space-y-1.5">
                <div v-for="seg in shotSegments" :key="seg.id" class="flex items-center gap-1.5">
                  <span class="text-xs px-1.5 py-0.5 rounded bg-blue-900/20 text-blue-400 border border-blue-700 font-medium whitespace-nowrap flex-shrink-0">{{ seg.speaker || '旁白' }}</span>
                  <select
                    :value="seg.emotion || ''"
                    class="text-[10px] px-1 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0 border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary-500"
                    :class="emotionClass(seg.emotion)"
                    @change="handleSegmentEmotionChange(seg, ($event.target as HTMLSelectElement).value)"
                  >
                    <option value="">情绪</option>
                    <option v-for="e in EMOTION_OPTIONS" :key="e" :value="e">{{ e }}</option>
                  </select>
                  <select
                    :value="seg.language || ''"
                    class="text-[10px] px-1 py-0.5 rounded-full font-medium whitespace-nowrap flex-shrink-0 border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary-500"
                    :class="seg.language ? 'bg-indigo-900/30 text-indigo-300' : 'bg-gray-800 text-gray-500'"
                    @change="handleSegmentLanguageChange(seg, ($event.target as HTMLSelectElement).value)"
                  >
                    <option v-for="opt in LANGUAGE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                  <p
                    v-if="editingSegId !== seg.id"
                    class="flex-1 min-w-0 text-sm italic text-primary-400 line-clamp-1 cursor-text"
                    @click="startEditingSegment(seg)"
                  >{{ seg.text }}</p>
                  <input
                    v-else
                    v-model="editingSegText"
                    class="flex-1 min-w-0 text-sm italic text-primary-400 bg-transparent border-b border-primary-600 focus:outline-none py-0.5"
                    @keydown.enter="($event.target as HTMLInputElement).blur()"
                    @blur="saveSegmentText(seg)"
                  />
                  <div class="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      class="p-1 rounded text-gray-500 hover:text-primary-400 hover:bg-gray-800 transition-colors disabled:opacity-50"
                      :disabled="generatingSegmentVoice[seg.id]"
                      title="生成配音"
                      @click="generateSegmentVoiceForSeg(seg)"
                    >
                      <svg v-if="generatingSegmentVoice[seg.id]" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" /><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                    </button>
                    <button
                      class="p-1 rounded text-gray-500 hover:text-red-400 hover:bg-gray-800 transition-colors"
                      title="删除此片段"
                      @click="deleteSegment(seg)"
                    >
                      <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>

                <div v-if="showAppendSegmentForm" class="flex items-center gap-1.5">
                  <select v-model="newSegmentSpeaker" class="text-xs px-1.5 py-0.5 rounded bg-blue-900/20 text-blue-400 border border-blue-700 font-medium flex-shrink-0 focus:outline-none">
                    <option value="">旁白</option>
                    <option v-for="c in characters" :key="c.id" :value="c.name">{{ c.name }}</option>
                  </select>
                  <select v-model="newSegmentEmotion" class="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-medium flex-shrink-0 focus:outline-none">
                    <option value="">情绪</option>
                    <option v-for="e in EMOTION_OPTIONS" :key="e" :value="e">{{ e }}</option>
                  </select>
                  <select v-model="newSegmentLanguage" class="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 font-medium flex-shrink-0 focus:outline-none">
                    <option v-for="opt in LANGUAGE_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                  </select>
                  <input
                    ref="newSegmentInputRef"
                    v-model="newSegmentText"
                    class="flex-1 min-w-0 text-sm italic text-primary-400 bg-transparent border-b border-gray-700 focus:border-primary-600 focus:outline-none py-0.5 placeholder-gray-600"
                    placeholder="输入台词，按 Enter 追加…"
                    @keydown.enter="handleAppendSegment"
                  />
                  <button v-if="newSegmentText.trim()" class="text-xs text-primary-400 hover:text-primary-300 flex-shrink-0 font-medium" @click="handleAppendSegment">追加</button>
                  <button class="text-xs text-gray-500 hover:text-gray-300 flex-shrink-0" @click="showAppendSegmentForm = false">✕</button>
                </div>
              </div>
            </template>
            <p v-else-if="previewShot.dialogue" class="text-gray-300">
              <span
                v-if="previewShotSpeakerId"
                class="inline-flex items-center px-1.5 py-0.5 mr-1 rounded bg-indigo-900/40 text-indigo-300 text-xs"
              >{{ characterName(previewShotSpeakerId) }}</span>
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
            <div v-if="isSlideshowMode" class="flex items-center gap-1.5 ml-auto">
              <span class="text-xs text-gray-500">运镜</span>
              <select
                :value="previewShot?.camera_type"
                :disabled="savingKenBurns || !previewShot"
                class="bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-xs text-gray-200 focus:outline-none disabled:opacity-50"
                @change="setKenBurnsEffect(($event.target as HTMLSelectElement).value)"
              >
                <option v-for="opt in KEN_BURNS_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>
          </div>

          <div class="flex gap-3">
            <select
              v-model="generateScope"
              class="shrink-0 px-2.5 py-2 rounded-lg border border-gray-700 bg-gray-900 text-gray-200 text-xs font-medium focus:outline-none focus:border-primary-600"
            >
              <option value="current">当前镜头</option>
              <option value="scene">本场次全部（{{ selectedShots.length }}）</option>
            </select>
            <button
              class="flex-1 py-2 rounded-lg border border-gray-700 text-sm font-medium text-gray-200 hover:bg-gray-800 disabled:opacity-50 flex items-center justify-center gap-1.5"
              :disabled="generatingImages || !canGenerate"
              @click="generateShotImages"
            >
              {{ generatingImages ? '生成中…' : '生成分镜预览图' }}
            </button>
            <button
              class="flex-1 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-sm font-medium text-white disabled:opacity-50 flex items-center justify-center gap-1.5"
              :disabled="generatingVideo || !canGenerate"
              @click="generateShotVideos"
            >
              {{ generatingVideo ? '生成中…' : '生成视频' }}
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
        <div class="flex-shrink-0 px-4 py-3 flex items-center justify-end border-b border-gray-800">
          <label class="text-xs text-gray-400 hover:text-gray-200 cursor-pointer flex items-center gap-1" :class="uploadingMedia ? 'opacity-50 pointer-events-none' : ''">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3-3m0 0l3 3m-3-3v9"/></svg>
            上传
            <input type="file" accept="image/*,video/*" class="hidden" @change="handleFileInputChange" />
          </label>
        </div>

        <div v-if="downloadUrl" class="flex-shrink-0 px-4 py-2 flex items-center justify-end border-b border-gray-800">
          <a
            :href="downloadUrl" download target="_blank"
            class="text-xs text-gray-400 hover:text-gray-200 flex items-center gap-1"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
          </a>
        </div>

        <div class="flex-1 flex items-center justify-center bg-gray-900">
          <div class="relative flex items-center justify-center overflow-hidden" :style="{ aspectRatio: previewAspectRatio, maxWidth: '100%', maxHeight: '100%' }">
            <video
              v-if="previewShot?.video_url"
              ref="previewVideoRef"
              :key="previewShot.id"
              :src="previewShot.video_url"
              :muted="isSlideshowMode"
              class="max-w-full max-h-full object-contain"
              @play="isPlaying = true"
              @pause="isPlaying = false"
              @ended="handleEnded"
              @timeupdate="onTimeUpdate"
            />
            <img
              v-else-if="previewShot?.image_url"
              :key="previewShot.id"
              :src="previewShot.image_url"
              class="max-w-full max-h-full object-contain"
              :style="kenBurnsPreviewStyle"
            />
            <p v-else class="text-gray-600 text-sm">该分镜暂无素材</p>
            <!-- 图片解说模式：Ken Burns 画面本身静音，配音/音效各自独立音轨，跟随播放/暂停同步 -->
            <audio v-if="isSlideshowMode && previewShot?.audio_url" ref="previewVoiceRef" :key="`voice-${previewShot.id}`" :src="previewShot.audio_url" />
            <audio
              v-for="item in (isSlideshowMode ? shotSfxItems : [])"
              :key="`sfx-${item.id}`"
              :ref="(el) => setSfxRef(el as Element | null, item.id)"
              :src="item.audio_url || item.url"
            />
          </div>
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
            class="text-xs px-2 py-1 rounded-lg border w-16 text-center whitespace-nowrap"
            :class="singleSegmentPlay ? 'border-primary-500 text-primary-400' : 'border-gray-700 text-gray-400'"
            @click="singleSegmentPlay = !singleSegmentPlay"
          >{{ singleSegmentPlay ? '单段播放' : '连续播放' }}</button>
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
        class="flex-shrink-0 h-32 rounded-lg border-2 flex flex-col items-center justify-center gap-0.5 overflow-hidden bg-cover bg-center"
        :style="[{ aspectRatio: previewAspectRatio }, shot.image_url ? { backgroundImage: `linear-gradient(rgba(0,0,0,0.45),rgba(0,0,0,0.45)), url(${shot.image_url})` } : {}]"
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

    <!-- 历史记录：复用已有 StoryboardReviewPanel（内含审查历史 + 回滚） -->
    <VideoStoryboardReviewPanel v-if="showHistoryPanel" :video-id="videoId" :visible="true" @close="showHistoryPanel = false" />

    <!-- 切换分镜生成模式（专业分镜/忠于原文/简洁模式）后询问是否立即重新生成提示词 -->
    <StoryboardModeSwitchDialog
      v-model="showStoryboardModeDialog"
      :mode-label="pendingStoryboardModeLabel"
      :can-regenerate-segment="!!selectedTile?.scene"
      @regenerate-segment="regenerateStoryboardSegment"
      @regenerate-all="regenerateStoryboardAll"
    />

    <!-- 本页 layout: false，不经过 layouts/default.vue，AppToast/AiProviderGuardModal 平时都是
         挂在默认 layout 里的，这里必须自己补一份，否则 toast.success/error 和"未配置 AI 模型"
         的引导弹窗全部会静默丢失——用户点按钮后完全看不到任何反馈，误以为"没反应"。 -->
    <AppToast />
    <AiProviderGuardModal />
  </div>
</template>

<style scoped>
/* 图片解说模式下静态图的运镜客户端预览，效果名称/方向与后端 kbCrop（kenburns_go.go）对应，
   仅做近似预览——真正的运镜视频仍由服务端 generateKenBurnsPureGo 生成。 */
@keyframes kb-static     { from { transform: scale(1.0); } to { transform: scale(1.2); } }
@keyframes kb-zoom       { from { transform: scale(1.0); } to { transform: scale(1.5); } }
@keyframes kb-zoom-out   { from { transform: scale(1.5); } to { transform: scale(1.0); } }
@keyframes kb-pan        { from { transform: scale(1.3) translateX(-8%); } to { transform: scale(1.3) translateX(8%); } }
@keyframes kb-pan-reverse  { from { transform: scale(1.3) translateX(8%); } to { transform: scale(1.3) translateX(-8%); } }
@keyframes kb-tilt         { from { transform: scale(1.3) translateY(-8%); } to { transform: scale(1.3) translateY(8%); } }
@keyframes kb-tilt-reverse { from { transform: scale(1.3) translateY(8%); } to { transform: scale(1.3) translateY(-8%); } }
</style>
