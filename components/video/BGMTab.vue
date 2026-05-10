<script setup lang="ts">
import type { VideoBGMSegment, JamendoTrack } from '~/types'

const props = defineProps<{ videoId: number }>()

const videoStore = useVideoStore()
const toast = useToast()

const shots = computed(() => videoStore.storyboard)
const bgmSegments = ref<VideoBGMSegment[]>([])
const bgmVolume = ref(60)
const generatingBgm = ref(false)
const analyzingBgm = ref(false)
const bgmAiContext = ref('')
const showBgmAiPanel = ref(true)

const bgmMoodPresets = [
  { label: '史诗宏大', value: '史诗宏大的战斗场面，需要磅礴的管弦乐和鼓点' },
  { label: '温馨感人', value: '温馨感人的情感场景，需要柔和的弦乐和钢琴' },
  { label: '紧张刺激', value: '紧张刺激的追逐/危机场景，需要快节奏配乐' },
  { label: '浪漫唯美', value: '浪漫唯美的爱情场景，需要抒情旋律' },
  { label: '悬疑神秘', value: '悬疑神秘氛围，需要低沉的弦乐和不和谐音效' },
  { label: '轻快活泼', value: '轻快活泼的日常场景，需要欢快的音乐' },
]

// Jamendo manual search
const bgmSearchTargetSeg = ref<VideoBGMSegment | null>(null)
const bgmSearchQuery = ref('')
const bgmSearchTags = ref('')
const bgmSearchSpeed = ref('')
const bgmSearchBpmMin = ref(0)
const bgmSearchBpmMax = ref(0)
const bgmSearchResults = ref<JamendoTrack[]>([])
const bgmSearchLoading = ref(false)
const bgmApplyingId = ref<string | null>(null)

function parseBGMSearchQueries(json: string): string[] {
  try { return JSON.parse(json) } catch { return [] }
}

function formatDuration(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function trackPlayURL(track: JamendoTrack): string {
  return track.audiodownload_allowed && track.audiodownload ? track.audiodownload : track.audio
}

async function load() {
  const api = useVideoApi()
  try {
    const res = await api.listBGMSegments(props.videoId)
    bgmSegments.value = (res as any)?.data ?? []
  } catch (e) {
    console.error('[BGM] load failed:', e)
  }
}

onMounted(load)

async function handleAnalyzeBGM() {
  if (shots.value.length === 0) { toast.error('没有分镜，请先生成分镜脚本'); return }
  analyzingBgm.value = true
  try {
    const api = useVideoApi()
    const res = await api.analyzeBGMSegments(props.videoId, bgmAiContext.value ? { user_prompt: bgmAiContext.value } : undefined)
    const taskId = (res as any)?.data?.task_id
    if (!taskId) { analyzingBgm.value = false; return }
    const taskStore = useTaskStore()
    taskStore.trackTask(taskId, async (task) => {
      analyzingBgm.value = false
      if (task.status === 'completed') {
        await load()
        toast.success('BGM分段分析完成，请查看分段列表')
      } else {
        toast.error('BGM分析失败，请重试')
      }
    })
  } catch (e: any) {
    toast.error('BGM分析失败：' + (e.message || ''))
    analyzingBgm.value = false
  }
}

async function handleGenerateBgm() {
  if (shots.value.length === 0) { toast.error('没有分镜，请先生成分镜脚本'); return }
  generatingBgm.value = true
  try {
    const api = useVideoApi()
    const res = await api.generateBGM(props.videoId, bgmAiContext.value ? { user_prompt: bgmAiContext.value } : undefined)
    const taskId = (res as any)?.data?.task_id
    if (!taskId) { generatingBgm.value = false; return }
    toast.info('BGM生成任务已提交（AI分析 + Jamendo搜索）…')
    const taskStore = useTaskStore()
    taskStore.trackTask(taskId, async (task) => {
      generatingBgm.value = false
      if (task.status === 'completed') {
        await load()
        const d = task.data as any
        toast.success(`BGM生成完成：${d?.matched ?? 0}/${d?.total ?? 0} 个分段匹配到音乐`)
      } else {
        toast.error('BGM生成失败，请重试')
      }
    })
  } catch (e: any) {
    toast.error('BGM生成失败：' + (e.message || ''))
    generatingBgm.value = false
  }
}

async function toggleBGMSegmentDisabled(seg: VideoBGMSegment) {
  const api = useVideoApi()
  const disabled = !seg.disabled
  await api.toggleBGMSegment(props.videoId, seg.id, disabled)
  const idx = bgmSegments.value.findIndex(s => s.id === seg.id)
  if (idx !== -1) bgmSegments.value[idx] = { ...bgmSegments.value[idx], disabled }
}

async function updateSegmentVolume(seg: VideoBGMSegment, volume: number) {
  try {
    const api = useVideoApi()
    await api.updateBGMSegment(props.videoId, seg.id, { volume })
    const idx = bgmSegments.value.findIndex(s => s.id === seg.id)
    if (idx !== -1) bgmSegments.value[idx] = { ...bgmSegments.value[idx], volume }
  } catch (e: any) {
    toast.error('保存音量失败：' + (e.message || '未知错误'))
  }
}

async function updateSegmentDucking(seg: VideoBGMSegment, duckingEnabled: boolean, duckingLevel: number) {
  try {
    const api = useVideoApi()
    await api.updateBGMSegment(props.videoId, seg.id, {
      ducking_enabled: duckingEnabled,
      ducking_level: duckingLevel,
    })
    const idx = bgmSegments.value.findIndex(s => s.id === seg.id)
    if (idx !== -1) bgmSegments.value[idx] = { ...bgmSegments.value[idx], ducking_enabled: duckingEnabled, ducking_level: duckingLevel }
  } catch (e: any) {
    toast.error('保存闪避配置失败：' + (e.message || '未知错误'))
  }
}

function openBGMSearch(seg: VideoBGMSegment) {
  bgmSearchTargetSeg.value = seg
  const queries = parseBGMSearchQueries(seg.search_queries)
  bgmSearchQuery.value = queries[0] ?? seg.mood ?? ''
  bgmSearchTags.value = ''
  bgmSearchSpeed.value = seg.tempo === 'fast' ? 'fast' : seg.tempo === 'slow' ? 'slow' : 'medium'
  bgmSearchResults.value = []
}

function closeBGMSearch() {
  bgmSearchTargetSeg.value = null
  bgmSearchResults.value = []
}

async function handleJamendoSearch() {
  if (!bgmSearchQuery.value && !bgmSearchTags.value) return
  bgmSearchLoading.value = true
  bgmSearchResults.value = []
  try {
    const api = useVideoApi()
    const res = await api.jamendoSearchBGM(props.videoId, {
      q: bgmSearchQuery.value || undefined,
      tags: bgmSearchTags.value || undefined,
      speed: bgmSearchSpeed.value || undefined,
      bpm_min: bgmSearchBpmMin.value || undefined,
      bpm_max: bgmSearchBpmMax.value || undefined,
      limit: 15,
    })
    bgmSearchResults.value = (res as any)?.data ?? []
  } catch (e: any) {
    toast.error('搜索失败：' + (e.message || ''))
  } finally {
    bgmSearchLoading.value = false
  }
}

async function applyBGMTrack(track: JamendoTrack) {
  if (!bgmSearchTargetSeg.value) return
  bgmApplyingId.value = track.id
  try {
    const api = useVideoApi()
    await api.applyBGMTrack(props.videoId, bgmSearchTargetSeg.value.id, {
      url: trackPlayURL(track),
      track_name: track.name,
      track_artist: track.artist_name,
      source: 'jamendo',
    })
    await load()
    toast.success(`已应用：${track.name}`)
    closeBGMSearch()
  } catch (e: any) {
    toast.error('应用失败：' + (e.message || ''))
  } finally {
    bgmApplyingId.value = null
  }
}

// Expose bgmSegments and bgmVolume for TimelineTab
defineExpose({ bgmSegments, bgmVolume, load })
</script>

<template>
  <div class="space-y-4">
    <!-- AI Panel — teleported into the aside panel via #bgm-ai-slot -->
    <Teleport to="#bgm-ai-slot" defer>
    <div class="card overflow-hidden">
      <button
        class="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
        @click="showBgmAiPanel = !showBgmAiPanel"
      >
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          <span class="text-sm font-medium text-gray-800 dark:text-gray-200">AI 背景音乐生成</span>
          <span v-if="bgmSegments.filter(s => s.url).length > 0" class="ml-2 text-xs text-purple-600 dark:text-purple-400 font-medium">
            {{ bgmSegments.filter(s => s.url).length }}/{{ bgmSegments.length }} 段已匹配
          </span>
        </div>
        <svg class="w-4 h-4 text-gray-400 transition-transform" :class="showBgmAiPanel ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div v-if="showBgmAiPanel" class="p-4 border-t border-gray-100 dark:border-gray-700 space-y-3">
        <!-- Mood presets -->
        <div>
          <p class="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">情绪预设（点击添加到上下文）</p>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="preset in bgmMoodPresets"
              :key="preset.label"
              class="px-2 py-0.5 rounded-full text-xs border border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors"
              @click="bgmAiContext = preset.value"
            >{{ preset.label }}</button>
          </div>
        </div>
        <!-- Context input -->
        <div>
          <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">额外分析上下文（可选）</label>
          <textarea
            v-model="bgmAiContext"
            rows="2"
            class="input text-sm resize-none w-full"
            placeholder="描述故事背景、情感氛围、特殊需求..."
          />
        </div>
        <!-- BGM Volume -->
        <div class="flex items-center gap-3">
          <label class="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">BGM 音量 {{ bgmVolume }}%</label>
          <input v-model.number="bgmVolume" type="range" min="0" max="100" step="5" class="flex-1 accent-purple-500" />
        </div>
        <!-- Action buttons -->
        <div class="flex gap-2">
          <button
            class="btn-secondary text-sm flex-1"
            :disabled="analyzingBgm || generatingBgm"
            @click="handleAnalyzeBGM"
          >
            <svg v-if="analyzingBgm" class="w-3.5 h-3.5 mr-1 animate-spin inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {{ analyzingBgm ? 'AI 分析中…' : 'AI 分析分段' }}
          </button>
          <button
            class="btn-primary text-sm flex-1"
            :disabled="analyzingBgm || generatingBgm"
            @click="handleGenerateBgm"
          >
            <svg v-if="generatingBgm" class="w-3.5 h-3.5 mr-1 animate-spin inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {{ generatingBgm ? 'BGM 生成中…' : '一键生成 BGM' }}
          </button>
        </div>
      </div>
    </div>
    </Teleport>

    <!-- BGM segment list -->
    <div v-if="bgmSegments.length > 0" class="space-y-3">
      <p class="text-xs text-gray-500 dark:text-gray-400">共 {{ bgmSegments.length }} 个分段</p>

      <div
        v-for="seg in bgmSegments"
        :key="seg.id"
        class="card p-4"
        :class="seg.disabled ? 'opacity-50' : ''"
      >
        <!-- Header row -->
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">
              {{ seg.mood }}
            </span>
            <span class="text-xs text-gray-500 dark:text-gray-400">
              镜头 {{ seg.start_shot_no }}–{{ seg.end_shot_no }}
            </span>
            <span class="text-xs text-gray-400 dark:text-gray-500">· {{ seg.tempo }}</span>
          </div>
          <!-- Disable toggle -->
          <button
            class="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            :title="seg.disabled ? '启用此分段' : '禁用此分段'"
            @click="toggleBGMSegmentDisabled(seg)"
          >
            <svg v-if="seg.disabled" class="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
            <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>

        <!-- Track info (if matched) -->
        <div v-if="seg.url" class="flex items-center gap-3 p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg mb-2">
          <svg class="w-6 h-6 text-purple-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
          </svg>
          <div class="flex-1 min-w-0">
            <p class="text-sm font-medium text-purple-800 dark:text-purple-200 truncate">{{ seg.track_name || '未知曲目' }}</p>
            <p class="text-xs text-purple-600 dark:text-purple-400 truncate">{{ seg.track_artist }}</p>
          </div>
          <audio :src="seg.url" controls class="w-32 h-7 flex-shrink-0" />
        </div>
        <div v-else class="text-xs text-gray-400 dark:text-gray-500 italic mb-2">尚未匹配到音乐</div>

        <!-- Search queries hint -->
        <div v-if="seg.search_queries" class="flex flex-wrap gap-1 mb-2">
          <span class="text-xs text-gray-400">搜索词：</span>
          <span
            v-for="q in parseBGMSearchQueries(seg.search_queries)"
            :key="q"
            class="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded"
          >{{ q }}</span>
        </div>

        <!-- Per-segment volume -->
        <div class="flex items-center gap-3 mt-2">
          <label class="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 w-12">音量 {{ Math.round(seg.volume * 100) }}%</label>
          <input
            type="range"
            :value="seg.volume"
            min="0"
            max="1"
            step="0.05"
            class="flex-1 h-1 accent-purple-500"
            @change="updateSegmentVolume(seg, parseFloat(($event.target as HTMLInputElement).value))"
          />
        </div>

        <!-- 人声闪避配置 -->
        <div class="flex items-center gap-3 mt-2">
          <label class="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              :checked="seg.ducking_enabled !== false"
              class="rounded"
              @change="updateSegmentDucking(seg, ($event.target as HTMLInputElement).checked, seg.ducking_level ?? 0.15)"
            />
            人声闪避
          </label>
          <template v-if="seg.ducking_enabled !== false">
            <input
              type="range"
              :value="seg.ducking_level ?? 0.15"
              min="0.05"
              max="0.5"
              step="0.05"
              class="flex-1 h-1 accent-blue-500"
              title="闪避后音量"
              @change="updateSegmentDucking(seg, seg.ducking_enabled !== false, parseFloat(($event.target as HTMLInputElement).value))"
            />
            <span class="text-xs text-gray-400 w-8">{{ Math.round((seg.ducking_level ?? 0.15) * 100) }}%</span>
          </template>
        </div>

        <!-- Manual search button -->
        <button
          class="text-xs text-purple-600 dark:text-purple-400 hover:underline mt-1"
          @click="openBGMSearch(seg)"
        >
          手动搜索 Jamendo...
        </button>
      </div>
    </div>

    <p v-else-if="!analyzingBgm && !generatingBgm" class="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
      点击「AI 分析分段」或「一键生成 BGM」开始
    </p>

    <!-- Jamendo Search Modal -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="bgmSearchTargetSeg" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
            <!-- Header -->
            <div class="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 class="font-semibold text-gray-900 dark:text-gray-100">Jamendo 音乐搜索</h3>
                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">为「{{ bgmSearchTargetSeg?.mood }}」分段选择背景音乐</p>
              </div>
              <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" @click="closeBGMSearch">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <!-- Search form -->
            <div class="px-5 py-3 border-b border-gray-100 dark:border-gray-800 space-y-2">
              <div class="flex gap-2">
                <input
                  v-model="bgmSearchQuery"
                  type="text"
                  class="input text-sm flex-1"
                  placeholder="关键词（如 epic orchestral, romantic piano）"
                  @keydown.enter="handleJamendoSearch"
                />
                <button class="btn-primary text-sm px-4" :disabled="bgmSearchLoading" @click="handleJamendoSearch">
                  {{ bgmSearchLoading ? '搜索中…' : '搜索' }}
                </button>
              </div>
              <div class="flex gap-2 flex-wrap items-center text-xs text-gray-500">
                <label class="flex items-center gap-1">
                  标签
                  <input v-model="bgmSearchTags" type="text" class="input text-xs py-0.5 h-6 w-28" placeholder="acoustic,piano" />
                </label>
                <label class="flex items-center gap-1">
                  速度
                  <select v-model="bgmSearchSpeed" class="input text-xs py-0.5 h-6">
                    <option value="">任意</option>
                    <option value="slow">慢</option>
                    <option value="medium">中</option>
                    <option value="fast">快</option>
                  </select>
                </label>
                <label class="flex items-center gap-1">
                  BPM
                  <input v-model.number="bgmSearchBpmMin" type="number" min="0" max="300" class="input text-xs py-0.5 h-6 w-14" placeholder="min" />
                  –
                  <input v-model.number="bgmSearchBpmMax" type="number" min="0" max="300" class="input text-xs py-0.5 h-6 w-14" placeholder="max" />
                </label>
              </div>
            </div>

            <!-- Results -->
            <div class="flex-1 overflow-y-auto p-5 space-y-2">
              <div v-if="bgmSearchLoading" class="flex items-center justify-center py-10 text-gray-400">
                <svg class="w-6 h-6 animate-spin mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                搜索中…
              </div>
              <div
                v-for="track in bgmSearchResults"
                :key="track.id"
                class="flex items-center gap-3 p-3 rounded-xl border border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors"
              >
                <img v-if="track.album_image" :src="track.album_image" class="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                <div v-else class="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center flex-shrink-0">
                  <svg class="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19V6l12-3v13" />
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{{ track.name }}</p>
                  <p class="text-xs text-gray-500 dark:text-gray-400 truncate">{{ track.artist_name }} · {{ formatDuration(track.duration) }}</p>
                </div>
                <audio :src="trackPlayURL(track)" controls class="w-32 h-7 flex-shrink-0" />
                <button
                  class="btn-primary text-xs py-1 px-2.5 flex-shrink-0"
                  :disabled="bgmApplyingId === track.id"
                  @click="applyBGMTrack(track)"
                >
                  {{ bgmApplyingId === track.id ? '应用中…' : '应用' }}
                </button>
              </div>
              <p v-if="!bgmSearchLoading && bgmSearchResults.length === 0" class="text-sm text-gray-400 text-center py-8">
                输入关键词或标签后点击搜索
              </p>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from, .fade-leave-to {
  opacity: 0;
}
</style>
