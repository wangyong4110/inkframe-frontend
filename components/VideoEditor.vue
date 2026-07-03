<script setup lang="ts">
import type { VideoBGMSegment, ShotVoiceSegment, ShotSFXItem } from '~/types'
import ScriptTab from '~/components/video/ScriptTab.vue'
import VoiceTab from '~/components/video/VoiceTab.vue'
import VideoGenTab from '~/components/video/VideoGenTab.vue'
import BGMTab from '~/components/video/BGMTab.vue'
import SFXTab from '~/components/video/SFXTab.vue'
import TimelineTab from '~/components/video/TimelineTab.vue'

const props = defineProps<{ videoId: number; llmProvider?: string; standalone?: boolean }>()
const videoStore = useVideoStore()
const novelStore = useNovelStore()
const sceneAnchorStore = useSceneAnchorStore()
const characterStore = useCharacterStore()
const route = useRoute()
const router = useRouter()

const promptLanguage = computed(() => novelStore.currentNovel?.prompt_language ?? 'zh')
const toast = useToast()
const { confirm } = useConfirm()

// ──────── Tabs ────────
const VALID_TABS = ['script', 'voice', 'video_gen', 'sfx', 'bgm', 'timeline', 'export']
const _initTab = VALID_TABS.includes(String(route.query.vtab)) ? String(route.query.vtab) : 'script'
const activeTab = ref(_initTab)
const tabLoading = ref(false)
const PRODUCTION_TABS = ['voice', 'video_gen', 'sfx', 'bgm', 'timeline', 'export']
const isProductionTab = computed(() => PRODUCTION_TABS.includes(activeTab.value))

const shots = computed(() => videoStore.storyboard)
const productionEnabled = computed(() => shots.value.length > 0)

const TABS = computed(() => [
  { key: 'script',   label: '分镜脚本', locked: false },
  { key: 'voice',    label: '配音字幕', locked: false },
  { key: 'video_gen', label: '视频生成', locked: false },
  { key: 'sfx',      label: '音效',     locked: false },
  { key: 'bgm',      label: '背景音乐', locked: false },
  { key: 'timeline', label: '时间线',   locked: false },
  { key: 'export',   label: '导出',     locked: false },
])

const activeTabIndex = computed(() => TABS.value.findIndex(t => t.key === activeTab.value))

function stepState(idx: number): 'completed' | 'current' | 'future' {
  if (idx < activeTabIndex.value) return 'completed'
  if (idx === activeTabIndex.value) return 'current'
  return 'future'
}

// ──────── Tab component refs (for cross-tab data access) ────────
const scriptTabRef = ref<InstanceType<typeof ScriptTab> | null>(null)
const voiceTabRef  = ref<InstanceType<typeof VoiceTab>  | null>(null)
const bgmTabRef    = ref<InstanceType<typeof BGMTab>    | null>(null)
const sfxTabRef    = ref<InstanceType<typeof SFXTab>    | null>(null)
const videoGenTabRef = ref<InstanceType<typeof VideoGenTab> | null>(null)

// Cross-tab data — persisted at shell level so TimelineTab always has fresh data
// even when the originating tab is unmounted (v-if=false).
const _shotAudioUrls = ref<Record<number, string>>({})
const _shotSegments  = ref<Record<number, ShotVoiceSegment[]>>({})
const _bgmSegments   = ref<VideoBGMSegment[]>([])
const _bgmVolume     = ref<number>(60)
const _sfxItems      = ref<Record<number, ShotSFXItem[]>>({})

function snapshotCrossTabData() {
  if (voiceTabRef.value) {
    _shotAudioUrls.value = voiceTabRef.value.shotAudioUrls ?? {}
    _shotSegments.value  = voiceTabRef.value.shotSegments  ?? {}
  }
  if (bgmTabRef.value) {
    _bgmSegments.value = bgmTabRef.value.bgmSegments ?? []
    _bgmVolume.value   = bgmTabRef.value.bgmVolume   ?? 60
  }
  if (sfxTabRef.value) {
    _sfxItems.value = sfxTabRef.value.sfxItems ?? {}
  }
}

// ──────── Lifecycle ────────
async function load() {
  try {
    await Promise.all([
      videoStore.fetchVideo(props.videoId),
      videoStore.fetchStoryboard(props.videoId),
    ])
    videoStore.resumeStoryboardTask(props.videoId)
    const novelId = videoStore.currentVideo?.novel_id
    if (novelId) {
      sceneAnchorStore.fetchAnchors(novelId)
      characterStore.fetchCharacters(novelId)
      novelStore.fetchNovel(novelId)
    }
  } catch (e: any) {
    toast.error('加载失败：' + (e.message || ''))
  }
}


onMounted(load)

onUnmounted(() => {
  videoStore.stopStoryboardPoll()
})

watch(() => props.videoId, () => {
  videoStore.stopStoryboardPoll()
  activeTab.value = 'script'
  load()
})

// Watch storyboard task completion
watch(() => videoStore.storyboardTaskStatus, (status) => {
  if (status === 'completed') {
    if (videoStore.storyboardTaskIsNew) {
      toast.success('分镜脚本生成完成')
    }
    videoStore.fetchStoryboard(props.videoId)
    // 刷新 video 以获取 final_video_url（AI 生成完成后后端自动上传 OSS）
    videoStore.fetchVideo(props.videoId)
  } else if (status === 'failed') {
    toast.error('分镜生成失败：' + (videoStore.error || ''))
  }
})

// Version counter used to detect stale tab-switch async operations.
// When the user switches tabs rapidly, only the latest switch should
// clear the loading spinner and run post-mount component calls.
let tabSwitchVersion = 0

// Sync active tab to URL query param so tabs are bookmarkable.
watch(activeTab, (tab) => {
  router.replace({ query: { ...route.query, vtab: tab } })
})

// Tab-change handler: snapshot cross-tab data before unmounting, then refresh
watch(activeTab, async (tab) => {
  // Capture exposed data from the departing tab before v-if destroys the instance
  snapshotCrossTabData()

  const version = ++tabSwitchVersion
  tabLoading.value = true
  try {
    if (['script', 'voice', 'video_gen', 'sfx', 'timeline', 'export'].includes(tab)) {
      await videoStore.fetchStoryboard(props.videoId)
    }
    if (['bgm', 'export'].includes(tab)) {
      await videoStore.fetchVideo(props.videoId)
    }
    // Timeline: load all cross-tab data before showing the component so audio URLs
    // are ready the moment the user clicks play (avoids a race where sfxItems
    // arrive after first render with stale/missing audio_url).
    if (tab === 'timeline' || tab === 'export') {
      if (version !== tabSwitchVersion) return
      const { listBGMSegments, listVoiceSegments, listShotSFXItems } = useVideoApi()
      const [bgmRes] = await Promise.allSettled([listBGMSegments(props.videoId)])
      if (version !== tabSwitchVersion) return
      if (bgmRes.status === 'fulfilled') _bgmSegments.value = bgmRes.value?.data ?? []

      const segMap: Record<number, ShotVoiceSegment[]> = { ..._shotSegments.value }
      const audioMap: Record<number, string> = { ..._shotAudioUrls.value }
      await Promise.allSettled(shots.value.map(async (shot) => {
        const res = await listVoiceSegments(props.videoId, shot.id).catch(() => null)
        if (res) segMap[shot.id] = res?.data ?? []
        if (shot.audio_url && !audioMap[shot.id]) audioMap[shot.id] = shot.audio_url
      }))
      if (version !== tabSwitchVersion) return
      _shotSegments.value  = segMap
      _shotAudioUrls.value = audioMap

      const sfxMap: Record<number, ShotSFXItem[]> = { ..._sfxItems.value }
      await Promise.allSettled(shots.value.map(async (shot) => {
        const res = await listShotSFXItems(props.videoId, shot.id).catch(() => null)
        if (res) sfxMap[shot.id] = res?.data ?? []
      }))
      if (version !== tabSwitchVersion) return
      _sfxItems.value = sfxMap
    }
  } finally {
    // Only clear the spinner if this is still the latest tab switch.
    if (version === tabSwitchVersion) {
      tabLoading.value = false
    }
  }

  // If a newer tab switch has started, skip post-mount component calls.
  if (version !== tabSwitchVersion) return

  // Now the tab is mounted; wait for DOM update then call component methods
  await nextTick()
  if (version !== tabSwitchVersion) return

  if (tab === 'bgm') {
    await bgmTabRef.value?.load()
    if (version !== tabSwitchVersion) return
    snapshotCrossTabData()
  }
  if (tab === 'sfx') {
    await sfxTabRef.value?.loadSFXItems()
    if (version !== tabSwitchVersion) return
    snapshotCrossTabData()
  }
  if (tab === 'voice' && voiceTabRef.value?.expandedSegmentShotId != null) {
    const shot = shots.value.find(s => s.id === voiceTabRef.value!.expandedSegmentShotId)
    if (shot) await voiceTabRef.value?.loadSegments(shot)
    if (version !== tabSwitchVersion) return
    snapshotCrossTabData()
  }
})

// ──────── generateStoryboard (delegated from chapter page) ────────
// All parameters are supplied by the caller; shell forwards them to the store.
const { generateStoryboard: _generateStoryboard } = useStoryboardGeneration()

async function generateStoryboard(
  userPrompt?: string,
  pacing?: string,
  targetDuration?: number,
  maxTokens?: number,
  temperature?: number,
  timeoutSeconds?: number,
  voiceMode?: string,
) {
  await _generateStoryboard({
    videoId: props.videoId,
    provider: props.llmProvider || undefined,
    userPrompt,
    pacing,
    targetDuration,
    maxTokens,
    temperature,
    timeoutSeconds,
    voiceMode,
  })
}

function reviewStoryboard() {
  scriptTabRef.value?.handleReviewStoryboard()
}

async function generateAllImages() {
  // VideoGenTab 使用 v-if，未切到该 tab 时组件未挂载，ref 为 null。
  // 先切换 tab，等组件挂载后再调用。
  activeTab.value = 'video_gen'
  await nextTick()
  videoGenTabRef.value?.handleGenerateImages()
}

// Expose for parent pages (e.g. chapter page's AI panel)
defineExpose({ activeTab, generateStoryboard, reviewStoryboard, generateAllImages })
</script>

<template>
  <div class="space-y-4">
    <!-- ──────── Step navigation (步骤条) ──────── -->
    <div class="px-3 pt-3 pb-1 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div class="flex items-start">
        <template v-for="(tab, idx) in TABS" :key="tab.key">
          <!-- Step: circle + label -->
          <div
            class="flex flex-col items-center flex-1 min-w-0 transition-opacity"
            :class="tab.locked ? 'cursor-not-allowed' : 'cursor-pointer'"
            @click="!tab.locked && (activeTab = tab.key)"
          >
            <!-- Circle -->
            <div
              class="flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all"
              :class="[
                stepState(idx) === 'completed'
                  ? 'bg-primary-500 text-white'
                  : stepState(idx) === 'current'
                    ? 'bg-primary-500 text-white ring-2 ring-offset-1 ring-primary-300 dark:ring-primary-700 dark:ring-offset-gray-800'
                    : tab.locked
                      ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-300 dark:hover:bg-gray-600',
              ]"
            >
              <!-- Checkmark for completed steps -->
              <svg v-if="stepState(idx) === 'completed'" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
              </svg>
              <!-- Lock icon for locked steps -->
              <svg v-else-if="tab.locked" class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <!-- Step number for current/future -->
              <span v-else>{{ idx + 1 }}</span>
            </div>
            <!-- Label -->
            <span
              class="mt-1 text-center leading-tight w-full transition-colors"
              style="font-size: 10px;"
              :class="[
                activeTab === tab.key
                  ? 'text-primary-600 dark:text-primary-400 font-semibold'
                  : tab.locked
                    ? 'text-gray-300 dark:text-gray-600'
                    : stepState(idx) === 'completed'
                      ? 'text-gray-500 dark:text-gray-400'
                      : 'text-gray-400 dark:text-gray-500',
              ]"
            >{{ tab.label }}</span>
          </div>
          <!-- Connector line between steps (aligned to circle center) -->
          <div
            v-if="idx < TABS.length - 1"
            class="flex-none h-0.5 w-3 mt-3.5 transition-colors"
            :class="idx < activeTabIndex ? 'bg-primary-400' : 'bg-gray-200 dark:bg-gray-700'"
          />
        </template>
      </div>
    </div>

    <!-- Tab loading spinner -->
    <div v-if="tabLoading" class="flex items-center justify-center py-16">
      <svg class="w-6 h-6 animate-spin text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
      <span class="ml-2 text-sm text-gray-500 dark:text-gray-400">加载中…</span>
    </div>

    <!-- ══ Script Tab ══════════════════════════════════════════════════════ -->
    <!-- v-show keeps ScriptTab mounted to avoid re-initialization cost;
         it has no onMounted data fetches (parent controls loading via tabLoading). -->
    <ScriptTab
      v-show="activeTab === 'script' && !tabLoading"
      ref="scriptTabRef"
      :video-id="props.videoId"
      :llm-provider="props.llmProvider"
    />

    <!-- ══ Production Tabs (with optional sidebar in standalone mode) ══════ -->
    <!-- Placeholder shown when storyboard is not yet ready -->
    <div v-if="isProductionTab && !tabLoading && !productionEnabled" class="flex flex-col items-center justify-center py-16 text-center">
      <svg class="w-10 h-10 text-gray-300 dark:text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.882v6.236a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
      </svg>
      <p class="text-sm text-gray-500 dark:text-gray-400">请先在「分镜脚本」页生成分镜</p>
    </div>

    <div
      v-if="isProductionTab && !tabLoading && productionEnabled"
      :class="standalone ? 'flex min-h-0 -mt-4' : ''"
    >
      <!-- Standalone mode: sidebar slot divs — rendered FIRST in DOM so that Teleport targets
           (#voice-ai-slot, #bgm-ai-slot, #sfx-ai-slot) exist before child tab components mount.
           CSS order-2 keeps it visually on the right despite appearing first in the HTML. -->
      <aside
        v-if="standalone && activeTab !== 'timeline' && activeTab !== 'export'"
        class="w-80 flex-shrink-0 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 overflow-y-auto order-2"
      >
        <div v-if="activeTab === 'sfx'" id="sfx-ai-slot" />
        <div v-else-if="activeTab === 'bgm'" id="bgm-ai-slot" />
        <div v-else-if="activeTab === 'voice'" id="voice-ai-slot" />
        <div v-else-if="activeTab === 'video_gen'" id="video-gen-ai-slot" />
      </aside>

      <!-- Main content (order-1 keeps it visually on the left in standalone flex layout) -->
      <div :class="standalone ? 'flex-1 min-w-0 overflow-x-hidden order-1' : ''">
        <!-- ── Voice Tab ── -->
        <VoiceTab
          v-if="activeTab === 'voice'"
          ref="voiceTabRef"
          :video-id="props.videoId"
        />

        <!-- ── Video Gen Tab ── -->
        <VideoGenTab
          v-if="activeTab === 'video_gen'"
          ref="videoGenTabRef"
          :video-id="props.videoId"
        />

        <!-- ── BGM Tab ── -->
        <BGMTab
          v-if="activeTab === 'bgm'"
          ref="bgmTabRef"
          :video-id="props.videoId"
        />

        <!-- ── SFX Tab ── -->
        <SFXTab
          v-if="activeTab === 'sfx'"
          ref="sfxTabRef"
          :video-id="props.videoId"
          :prompt-language="promptLanguage"
        />

        <!-- ── Timeline Tab ── -->
        <TimelineTab
          v-if="activeTab === 'timeline'"
          :video-id="props.videoId"
          :bgm-segments="_bgmSegments"
          :bgm-volume="_bgmVolume"
          :shot-audio-urls="_shotAudioUrls"
          :shot-segments="_shotSegments"
          :sfx-items="_sfxItems"
          :show-export="false"
          :inline-sidebar="standalone"
        />

        <!-- ── Export Tab ── -->
        <TimelineTab
          v-if="activeTab === 'export'"
          :video-id="props.videoId"
          :bgm-segments="_bgmSegments"
          :bgm-volume="_bgmVolume"
          :shot-audio-urls="_shotAudioUrls"
          :shot-segments="_shotSegments"
          :sfx-items="_sfxItems"
          :show-export="true"
          :inline-sidebar="standalone"
        />
      </div>
    </div>
  </div>
</template>
