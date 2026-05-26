<script setup lang="ts">
import type { VideoBGMSegment, ShotVoiceSegment, ShotSFXItem } from '~/types'
import ScriptTab from '~/components/video/ScriptTab.vue'
import VoiceTab from '~/components/video/VoiceTab.vue'
import BGMTab from '~/components/video/BGMTab.vue'
import SFXTab from '~/components/video/SFXTab.vue'
import TimelineTab from '~/components/video/TimelineTab.vue'

const props = defineProps<{ videoId: number; llmProvider?: string; standalone?: boolean }>()
const videoStore = useVideoStore()
const sceneAnchorStore = useSceneAnchorStore()
const characterStore = useCharacterStore()
const toast = useToast()
const { confirm } = useConfirm()

// ──────── Tabs ────────
const activeTab = ref('script')
const tabLoading = ref(false)
const PRODUCTION_TABS = ['voice', 'bgm', 'sfx', 'timeline', 'export']
const isProductionTab = computed(() => PRODUCTION_TABS.includes(activeTab.value))

const isScriptConfirmed = computed(() => videoStore.currentVideo?.script_status === 'confirmed')
const shots = computed(() => videoStore.storyboard)
const productionEnabled = computed(() => isScriptConfirmed.value && shots.value.length > 0)

const TABS = computed(() => [
  { key: 'script',   label: '分镜脚本', locked: false },
  { key: 'voice',    label: '配音字幕', locked: !productionEnabled.value },
  { key: 'bgm',      label: '背景音乐', locked: !productionEnabled.value },
  { key: 'sfx',      label: '音效',     locked: !productionEnabled.value },
  { key: 'timeline', label: '时间线',   locked: !productionEnabled.value },
  { key: 'export',   label: '导出',     locked: !productionEnabled.value },
])

// ──────── Tab component refs (for cross-tab data access) ────────
const scriptTabRef = ref<InstanceType<typeof ScriptTab> | null>(null)
const voiceTabRef  = ref<InstanceType<typeof VoiceTab>  | null>(null)
const bgmTabRef    = ref<InstanceType<typeof BGMTab>    | null>(null)
const sfxTabRef    = ref<InstanceType<typeof SFXTab>    | null>(null)

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
    if (novelId) sceneAnchorStore.fetchAnchors(novelId)
    if (novelId) characterStore.fetchCharacters(novelId)
  } catch (e: any) {
    toast.error('加载失败：' + (e.message || ''))
  }
}

// Trigger ScriptTab.loadVideoProviders() as soon as the ref becomes available
watch(scriptTabRef, (ref) => {
  if (ref) ref.loadVideoProviders()
}, { immediate: true })

onMounted(load)

onUnmounted(() => {
  videoStore.stopStoryboardPoll()
})

watch(() => props.videoId, () => {
  activeTab.value = 'script'
  load()
})

// Watch storyboard task completion
watch(() => videoStore.storyboardTaskStatus, (status) => {
  if (status === 'completed') {
    if (videoStore.storyboardTaskIsNew) {
      toast.success('分镜脚本生成完成，请检查并确认')
    }
    videoStore.fetchStoryboard(props.videoId)
  } else if (status === 'failed') {
    toast.error('分镜生成失败：' + (videoStore.error || ''))
  }
})

// Version counter used to detect stale tab-switch async operations.
// When the user switches tabs rapidly, only the latest switch should
// clear the loading spinner and run post-mount component calls.
let tabSwitchVersion = 0

// Tab-change handler: snapshot cross-tab data before unmounting, then refresh
watch(activeTab, async (tab) => {
  // Capture exposed data from the departing tab before v-if destroys the instance
  snapshotCrossTabData()

  const version = ++tabSwitchVersion
  tabLoading.value = true
  try {
    if (['script', 'voice', 'sfx', 'timeline', 'export'].includes(tab)) {
      await videoStore.fetchStoryboard(props.videoId)
    }
    if (['bgm', 'export'].includes(tab)) {
      await videoStore.fetchVideo(props.videoId)
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
  // Timeline: load all cross-tab data directly via API (source tabs are unmounted)
  if (tab === 'timeline') {
    const { listBGMSegments, listVoiceSegments, listShotSFXItems } = useVideoApi()
    const [bgmRes] = await Promise.allSettled([listBGMSegments(props.videoId)])
    if (version !== tabSwitchVersion) return
    if (bgmRes.status === 'fulfilled') _bgmSegments.value = bgmRes.value?.data ?? []

    // Voice segments + audio URL map
    const segMap: Record<number, ShotVoiceSegment[]> = { ..._shotSegments.value }
    const audioMap: Record<number, string> = { ..._shotAudioUrls.value }
    await Promise.all(shots.value.map(async (shot) => {
      const res = await listVoiceSegments(props.videoId, shot.id).catch(() => null)
      if (res) segMap[shot.id] = res?.data ?? []
      if (shot.audio_url && !audioMap[shot.id]) audioMap[shot.id] = shot.audio_url
    }))
    if (version !== tabSwitchVersion) return
    _shotSegments.value  = segMap
    _shotAudioUrls.value = audioMap

    // SFX items
    const sfxMap: Record<number, ShotSFXItem[]> = { ..._sfxItems.value }
    await Promise.all(shots.value.map(async (shot) => {
      const res = await listShotSFXItems(props.videoId, shot.id).catch(() => null)
      if (res) sfxMap[shot.id] = res?.data ?? []
    }))
    if (version !== tabSwitchVersion) return
    _sfxItems.value = sfxMap
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

// Expose for parent pages (e.g. chapter page's AI panel)
defineExpose({ activeTab, generateStoryboard })
</script>

<template>
  <div class="space-y-4">
    <!-- ──────── Tabs navigation ──────── -->
    <div class="border-b border-gray-200 dark:border-gray-700">
      <nav class="flex">
        <button
          v-for="tab in TABS"
          :key="tab.key"
          class="flex-1 flex items-center justify-center gap-1 py-2.5 border-b-2 font-medium text-xs transition-colors whitespace-nowrap"
          :class="[
            activeTab === tab.key
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : tab.locked
                ? 'border-transparent text-gray-300 dark:text-gray-600 cursor-not-allowed'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-600',
          ]"
          :disabled="tab.locked"
          @click="!tab.locked && (activeTab = tab.key)"
        >
          {{ tab.label }}
          <svg v-if="tab.locked" class="w-2.5 h-2.5 opacity-40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </button>
      </nav>
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
    <div
      v-if="isProductionTab && !tabLoading"
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
      </aside>

      <!-- Main content (order-1 keeps it visually on the left in standalone flex layout) -->
      <div :class="standalone ? 'flex-1 min-w-0 overflow-x-hidden order-1' : ''">
        <!-- ── Voice Tab ── -->
        <VoiceTab
          v-if="activeTab === 'voice'"
          ref="voiceTabRef"
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
