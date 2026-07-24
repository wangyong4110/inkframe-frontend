<script setup lang="ts">
import type { StoryboardShot, ScreenplayScene, EpisodeSummary } from '~/types'

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
const toast = useToast()
const { guardAiProvider } = useAiProviderGuard()

const loading = ref(true)
const video = computed(() => videoStore.currentVideo)
const shots = computed(() => videoStore.storyboard)
const characters = computed(() => characterStore.characters)
const anchors = computed(() => sceneAnchorStore.anchors)

const screenplayScenes = ref<ScreenplayScene[]>([])
const selectedSceneId = ref<number | null>(null) // null 且存在于 tiles 中 = 未关联场次的旧分镜
const scriptCollapsed = ref(false)

const episodeSummaries = ref<EpisodeSummary[]>([])
const showEpisodePicker = ref(false)

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

interface SceneTile { scene: ScreenplayScene | null; shots: StoryboardShot[]; duration: number }

const sceneTiles = computed<SceneTile[]>(() => {
  const tiles: SceneTile[] = screenplayScenes.value.map(sc => {
    const sceneShots = shotsBySceneId.value.get(sc.id) ?? []
    return { scene: sc, shots: sceneShots, duration: sceneShots.reduce((sum, s) => sum + (s.duration || 0), 0) }
  })
  const ungrouped = shotsBySceneId.value.get(null) ?? []
  if (ungrouped.length > 0) {
    tiles.push({ scene: null, shots: ungrouped, duration: ungrouped.reduce((sum, s) => sum + (s.duration || 0), 0) })
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

const referenceItems = computed(() => {
  const items: { key: string; label: string; imageUrl: string }[] = []
  const seen = new Set<string>()
  for (const shot of selectedShots.value) {
    for (const cid of shot.character_ids ?? []) {
      const c = characterById.value.get(cid)
      const img = c?.default_look?.three_view_sheet
      const key = `char-${cid}`
      if (c && img && !seen.has(key)) {
        seen.add(key)
        items.push({ key, label: c.name, imageUrl: img })
      }
    }
    if (shot.scene_anchor_id) {
      const a = anchorById.value.get(shot.scene_anchor_id)
      const key = `anchor-${shot.scene_anchor_id}`
      if (a?.ref_image_url && !seen.has(key)) {
        seen.add(key)
        items.push({ key, label: a.name, imageUrl: a.ref_image_url })
      }
    }
  }
  return items
})

function characterName(id: number) {
  return characterById.value.get(id)?.name ?? `#${id}`
}

// ── 加载 ────────────────────────────────────────────────────────────────────
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
      selectedSceneId.value = sceneTiles.value[0].scene?.id ?? null
    }
  } catch (e: any) {
    toast.error('加载失败：' + (e.message || '未知错误'))
  } finally {
    loading.value = false
  }
}
onMounted(loadAll)

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
  router.push(`/video/${ep.video_id}/produce`)
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

// ── 视频预览（单段播放：仅播放选中分镜） ─────────────────────────────────────
const previewVideoRef = ref<HTMLVideoElement | null>(null)
const previewShotIdx = ref(0)
const previewShot = computed(() => selectedShots.value[previewShotIdx.value] ?? null)
const isPlaying = ref(false)

watch(selectedShots, () => { previewShotIdx.value = 0 })

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
</script>

<template>
  <div class="h-screen flex flex-col bg-gray-950 text-gray-100">
    <!-- 顶部栏 -->
    <header class="flex-shrink-0 h-14 px-4 flex items-center justify-between border-b border-gray-800">
      <button class="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200" @click="goBack">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        返回筹备工作台
      </button>

      <div class="relative flex items-center gap-3">
        <button class="flex items-center gap-1.5 text-sm font-medium hover:text-gray-300" @click="showEpisodePicker = !showEpisodePicker">
          第 {{ episodeSummaries.find(e => e.video_id === videoId)?.chapter_no ?? '?' }} 集 {{ episodeSummaries.find(e => e.video_id === videoId)?.title }}
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
        </button>
        <span class="text-xs text-gray-500">{{ shots.length }} 个分镜 · {{ Math.round(totalDuration) }}s</span>

        <div v-if="showEpisodePicker" class="absolute top-full mt-2 left-1/2 -translate-x-1/2 w-56 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-20 py-1 max-h-80 overflow-auto">
          <button
            v-for="ep in episodeSummaries" :key="ep.chapter_id"
            class="w-full text-left px-3 py-2 text-sm hover:bg-gray-800"
            :class="ep.video_id === videoId ? 'text-primary-400' : 'text-gray-300'"
            @click="switchEpisode(ep)"
          >第 {{ ep.chapter_no }} 集 {{ ep.title }}</button>
        </div>
      </div>

      <button class="text-sm text-gray-400 hover:text-gray-200 flex items-center gap-1.5">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>
        导出
      </button>
    </header>

    <div v-if="loading" class="flex-1 flex items-center justify-center text-gray-500 text-sm">加载中…</div>

    <div v-else class="flex-1 flex min-h-0">
      <!-- 左侧：剧本 + 分镜 -->
      <div class="flex-1 min-w-0 flex flex-col border-r border-gray-800">
        <div class="flex-1 min-h-0 overflow-auto px-6 py-4">
          <!-- 原始剧本折叠标题 -->
          <button v-if="selectedTile?.scene" class="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200 mb-3" @click="scriptCollapsed = !scriptCollapsed">
            <svg class="w-3.5 h-3.5 transition-transform" :class="scriptCollapsed ? '' : 'rotate-90'" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            原始剧本 场{{ selectedTile.scene.scene_no }} · {{ selectedTile.scene.heading }}
          </button>
          <p v-if="selectedTile?.scene && !scriptCollapsed" class="text-sm text-gray-500 mb-4 leading-relaxed">{{ selectedTile.scene.synopsis }}</p>

          <!-- 参考图条 -->
          <div v-if="referenceItems.length" class="flex items-center gap-3 mb-4 overflow-x-auto pb-1">
            <div v-for="ref in referenceItems" :key="ref.key" class="flex-shrink-0 text-center">
              <img :src="ref.imageUrl" class="w-14 h-14 rounded-lg object-cover border border-gray-700" />
              <p class="text-[10px] text-gray-500 mt-1 w-14 truncate">{{ ref.label }}</p>
            </div>
          </div>

          <!-- 分镜文本列表 -->
          <div v-if="!selectedShots.length" class="text-center py-16 text-gray-500 text-sm">该场次暂无分镜</div>
          <div v-else class="space-y-4">
            <div v-for="shot in selectedShots" :key="shot.id" class="text-sm leading-relaxed">
              <p class="text-gray-300 font-medium mb-1">镜头 {{ shot.shot_no }} ({{ shot.duration }}s)</p>
              <p class="text-gray-400 mb-1">{{ shot.description }}</p>
              <p v-if="shot.dialogue" class="text-gray-300">
                <span
                  v-for="cid in (shot.character_ids ?? [])" :key="cid"
                  class="inline-flex items-center px-1.5 py-0.5 mr-1 rounded bg-indigo-900/40 text-indigo-300 text-xs"
                >{{ characterName(cid) }}</span>
                {{ shot.dialogue }}
              </p>
            </div>
          </div>
        </div>

        <!-- 底部生成操作条 -->
        <div class="flex-shrink-0 border-t border-gray-800 px-6 py-3 flex gap-3">
          <button
            class="flex-1 py-2 rounded-lg border border-gray-700 text-sm font-medium text-gray-200 hover:bg-gray-800 disabled:opacity-50"
            :disabled="generatingImages || !selectedShots.length"
            @click="generateShotImages"
          >{{ generatingImages ? '生成中…' : '生成分镜预览图' }}</button>
          <button
            class="flex-1 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-sm font-medium text-white disabled:opacity-50"
            :disabled="generatingVideo || !selectedShots.length"
            @click="generateShotVideos"
          >{{ generatingVideo ? '生成中…' : '生成视频' }}</button>
        </div>
      </div>

      <!-- 右侧：视频预览 -->
      <aside class="w-96 flex-shrink-0 flex flex-col">
        <div class="flex-shrink-0 px-4 py-3 text-xs text-gray-500 border-b border-gray-800">视频预览</div>
        <div class="flex-1 flex items-center justify-center bg-black">
          <video
            v-if="previewShot?.video_url"
            ref="previewVideoRef"
            :key="previewShot.id"
            :src="previewShot.video_url"
            class="max-w-full max-h-full"
            @play="isPlaying = true"
            @pause="isPlaying = false"
            @ended="isPlaying = false"
          />
          <p v-else class="text-gray-600 text-sm">该分镜暂无视频</p>
        </div>
        <div class="flex-shrink-0 px-4 py-3 flex items-center justify-center gap-4 border-t border-gray-800">
          <button class="text-gray-400 hover:text-gray-200" @click="prevShot"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 19l-7-7 7-7m8 14l-7-7 7-7"/></svg></button>
          <button class="text-gray-200 hover:text-white" @click="playPause">
            <svg v-if="!isPlaying" class="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            <svg v-else class="w-7 h-7" fill="currentColor" viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>
          </button>
          <button class="text-gray-400 hover:text-gray-200" @click="nextShot"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg></button>
        </div>
      </aside>
    </div>

    <!-- 底部场次时间线条 -->
    <div class="flex-shrink-0 h-24 border-t border-gray-800 px-4 py-2 flex items-center gap-2 overflow-x-auto">
      <template v-for="(tile, idx) in sceneTiles" :key="tile.scene?.id ?? 'ungrouped'">
        <button
          class="flex-shrink-0 w-32 h-16 rounded-lg border-2 flex flex-col items-center justify-center gap-0.5 overflow-hidden"
          :class="(tile.scene?.id ?? null) === selectedSceneId ? 'border-primary-500 bg-gray-800' : 'border-gray-800 bg-gray-900 hover:border-gray-700'"
          @click="selectScene(tile.scene?.id ?? null)"
        >
          <span class="text-xs font-medium text-gray-200">{{ tile.scene ? `场${tile.scene.scene_no}` : '自定义' }}</span>
          <span class="text-[10px] text-gray-500">{{ Math.round(tile.duration * 10) / 10 }}s</span>
        </button>
        <span v-if="idx < sceneTiles.length - 1" class="flex-shrink-0 text-gray-700">+</span>
      </template>
    </div>
  </div>
</template>
