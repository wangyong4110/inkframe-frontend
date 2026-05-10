<script setup lang="ts">
import type { StoryboardShot, ShotSFXItem } from '~/types'

const props = defineProps<{ videoId: number }>()

const videoStore = useVideoStore()
const toast = useToast()

const shots = computed(() => videoStore.storyboard)
const generatingSFX = ref(false)
const analyzingTags = ref(false)
const sfxAiContext = ref('')
const showSfxAiPanel = ref(true)

const sfxPlayingId = ref<number | null>(null)
const sfxAudioRef = ref<HTMLAudioElement | null>(null)
const sfxItems = ref<Record<number, ShotSFXItem[]>>({})
const sfxItemsLoading = ref(false)

const sfxScenePresets = [
  { label: '古风武侠', value: '古代中国武侠场景，刀剑交击、马蹄、古筝等音效' },
  { label: '仙侠玄幻', value: '修仙玄幻场景，灵气波动、法术、雷鸣等音效' },
  { label: '现代都市', value: '现代都市场景，车声、人群、室内环境音等' },
  { label: '科幻未来', value: '科幻未来场景，机械、能量、空间感等音效' },
  { label: '自然野外', value: '自然野外场景，风雨、鸟鸣、虫声、水流等' },
]

function parseSfxTags(sfxTags?: string): string[] {
  if (!sfxTags) return []
  try { return JSON.parse(sfxTags) as string[] } catch { return [] }
}

// sfxTagsMap: 兼容旧版 string[] 和新版 {tag,type}[] 两种格式，统一转为 {tag, type} 列表
type SFXTagDisplay = { tag: string; type: 'action' | 'ambient' | 'emotion' }
const sfxTagsMap = computed(() => {
  const map = new Map<number, SFXTagDisplay[]>()
  for (const shot of shots.value) {
    try {
      if (!shot.sfx_tags) { map.set(shot.id, []); continue }
      const parsed = JSON.parse(shot.sfx_tags)
      if (Array.isArray(parsed) && parsed.length > 0) {
        if (typeof parsed[0] === 'string') {
          // 旧格式：string[]
          map.set(shot.id, (parsed as string[]).map(t => ({ tag: t, type: 'action' as const })))
        } else {
          // 新格式：{tag, type}[]
          map.set(shot.id, parsed as SFXTagDisplay[])
        }
      } else {
        map.set(shot.id, [])
      }
    } catch {
      map.set(shot.id, [])
    }
  }
  return map
})

async function loadSFXItems() {
  if (sfxItemsLoading.value) return // Fix 4: guard against concurrent loads
  if (shots.value.length === 0) return
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
          toast.success('AI 音效标签分析完成，每个镜头已生成精准搜索词')
        } else {
          toast.error('AI 音效标签分析失败：' + ((task as any).error || ''))
        }
      })
      toast.info('AI 正在分析分镜脚本，生成精准音效搜索词…')
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
    const res = await api.batchGenerateSFX(props.videoId, sfxAiContext.value ? { user_context: sfxAiContext.value } : undefined)
    const taskId = (res as any)?.data?.task_id
    if (taskId) {
      useTaskStore().trackTask(taskId, async (task) => {
        await videoStore.fetchStoryboard(props.videoId)
        await loadSFXItems()
        const { success = 0, fail = 0 } = (task.data as any) ?? {}
        if (fail > 0) {
          toast.warning(`音效生成完成：${success} 成功，${fail} 失败`)
        } else {
          toast.success(`音效生成完成：${success} 个镜头`)
        }
      })
      toast.success('音效生成任务已提交（含 AI 标签分析），请在右下角任务面板查看进度')
    }
  } catch (e: any) {
    toast.error('音效生成失败：' + (e.message || ''))
  } finally {
    generatingSFX.value = false
  }
}

function toggleSfxPreview(item: ShotSFXItem) {
  const audio = sfxAudioRef.value
  if (!audio) return
  if (sfxPlayingId.value === item.id) {
    audio.pause()
    sfxPlayingId.value = null
    return
  }
  audio.src = item.url
  audio.currentTime = 0
  audio.play().catch(() => { sfxPlayingId.value = null })
  sfxPlayingId.value = item.id
}

async function deleteSFXItem(shot: StoryboardShot, item: ShotSFXItem) {
  const api = useVideoApi()
  await api.deleteShotSFXItem(props.videoId, shot.id, item.id)
  sfxItems.value[shot.id] = (sfxItems.value[shot.id] ?? []).filter(i => i.id !== item.id)
  if (sfxPlayingId.value === item.id) {
    sfxAudioRef.value?.pause()
    sfxPlayingId.value = null
  }
}

async function updateSFXItemVolume(shot: StoryboardShot, item: ShotSFXItem, volume: number) {
  const api = useVideoApi()
  await api.updateShotSFXItem(props.videoId, shot.id, item.id, { volume })
  const list = sfxItems.value[shot.id] ?? []
  const idx = list.findIndex(i => i.id === item.id)
  if (idx !== -1) list[idx] = { ...list[idx], volume }
}

async function toggleSFXItemDisabled(shot: StoryboardShot, item: ShotSFXItem) {
  const api = useVideoApi()
  const disabled = !item.disabled
  await api.toggleShotSFXItem(props.videoId, shot.id, item.id, disabled)
  const list = sfxItems.value[shot.id] ?? []
  const idx = list.findIndex(i => i.id === item.id)
  if (idx !== -1) list[idx] = { ...list[idx], disabled }
}

// Expose sfxItems for TimelineTab
defineExpose({ sfxItems, loadSFXItems })
</script>

<template>
  <div class="space-y-4">
    <!-- Hidden audio element for preview -->
    <audio ref="sfxAudioRef" class="hidden" @ended="sfxPlayingId = null" />

    <!-- AI Panel — teleported into the aside panel via #sfx-ai-slot -->
    <Teleport to="#sfx-ai-slot" defer>
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
        <!-- Scene presets -->
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
        <!-- Context input -->
        <div>
          <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">额外场景背景提示（可选）</label>
          <textarea
            v-model="sfxAiContext"
            rows="2"
            class="input text-sm resize-none w-full"
            placeholder="描述场景背景，帮助 AI 生成更精准的音效搜索词..."
          />
        </div>
        <!-- Action buttons -->
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
            {{ generatingSFX ? '生成中…' : '一键生成音效' }}
          </button>
        </div>
      </div>
    </div>
    </Teleport>

    <!-- Shot SFX list -->
    <div class="space-y-3">
      <div v-for="shot in shots" :key="shot.id" class="card overflow-hidden">
        <!-- Shot header -->
        <div class="flex items-start gap-3 p-3">
          <span class="text-xs font-bold text-gray-400 flex-shrink-0 mt-0.5">镜 {{ shot.shot_no }}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-gray-700 dark:text-gray-300 line-clamp-1">
              {{ shot.narration || shot.description || '（无描述）' }}
            </p>
            <!-- SFX tags（新格式带类型色标，旧格式兼容显示） -->
            <div v-if="(sfxTagsMap.get(shot.id) ?? []).length > 0" class="flex flex-wrap gap-1 mt-1">
              <span
                v-for="t in sfxTagsMap.get(shot.id)"
                :key="t.tag"
                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border"
                :class="{
                  'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-800': t.type === 'action',
                  'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-100 dark:border-green-800': t.type === 'ambient',
                  'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-800': t.type === 'emotion',
                  'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-100 dark:border-orange-800': !t.type,
                }"
              >
                <span v-if="t.type" class="opacity-60 text-[9px] font-mono uppercase">{{ t.type[0] }}</span>
                {{ t.tag }}
              </span>
            </div>
          </div>
        </div>

        <!-- SFX items -->
        <div v-if="(sfxItems[shot.id] ?? []).length > 0" class="border-t border-gray-100 dark:border-gray-700">
          <div
            v-for="item in sfxItems[shot.id]"
            :key="item.id"
            class="flex items-center gap-2 px-3 py-2 border-b border-gray-50 dark:border-gray-800/80 last:border-b-0 text-xs"
            :class="item.disabled ? 'opacity-40' : ''"
          >
            <!-- Enable/disable toggle -->
            <button
              class="relative w-7 h-4 rounded-full flex-shrink-0 transition-colors"
              :class="item.disabled ? 'bg-gray-200 dark:bg-gray-600' : 'bg-orange-400 dark:bg-orange-500'"
              :title="item.disabled ? '点击启用' : '点击禁用'"
              @click="toggleSFXItemDisabled(shot, item)"
            >
              <span class="w-3 h-3 rounded-full bg-white shadow transition-transform" :class="item.disabled ? 'translate-x-0' : 'translate-x-3'" />
            </button>
            <!-- Source badge -->
            <span class="text-[10px] px-1.5 py-0.5 rounded font-mono flex-shrink-0"
              :class="{
                'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300': item.source === 'freesound',
                'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300': item.source === 'elevenlabs',
                'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400': item.source === 'local',
              }">
              {{ item.source }}
            </span>
            <!-- SFX type badge -->
            <span
              v-if="item.sfx_type"
              class="text-[9px] px-1 py-0.5 rounded font-mono uppercase flex-shrink-0"
              :class="{
                'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400': item.sfx_type === 'action',
                'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400': item.sfx_type === 'ambient',
                'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400': item.sfx_type === 'emotion',
              }"
              :title="{ action: '动作音（单次触发）', ambient: '环境底层音（循环）', emotion: '情绪点缀音' }[item.sfx_type]"
            >{{ item.sfx_type }}</span>
            <!-- Loop indicator -->
            <span v-if="item.loop_enabled" class="text-[10px] text-green-500 flex-shrink-0" title="循环播放">⟳</span>
            <!-- Tag -->
            <span class="text-xs text-orange-600 dark:text-orange-400 flex-1 truncate font-medium">
              {{ item.tag || '—' }}
            </span>
            <!-- Volume slider -->
            <input
              type="range" min="0.1" max="1" step="0.05"
              :value="item.volume"
              class="w-16 accent-orange-500 flex-shrink-0"
              @change="updateSFXItemVolume(shot, item, parseFloat(($event.target as HTMLInputElement).value))"
            />
            <span class="text-xs text-gray-400 w-7 text-right flex-shrink-0">{{ Math.round(item.volume * 100) }}%</span>
            <!-- Play button -->
            <button
              class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
              :class="sfxPlayingId === item.id
                ? 'bg-orange-500 text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-orange-500'"
              @click="toggleSfxPreview(item)"
            >
              <svg v-if="sfxPlayingId !== item.id" class="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <svg v-else class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            </button>
            <!-- Delete button -->
            <button
              class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              @click="deleteSFXItem(shot, item)"
            >
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <!-- Empty state -->
        <div v-else-if="!sfxItemsLoading" class="px-3 py-2 text-xs text-gray-400 italic">
          {{ (sfxTagsMap.get(shot.id) ?? []).length > 0 ? '已分析搜索词，点击「一键生成音效」匹配音频' : '点击「AI 分析标签」或「一键生成音效」' }}
        </div>
      </div>
      <p v-if="shots.length === 0" class="text-sm text-gray-400 text-center py-8">
        请先在「分镜脚本」Tab 生成分镜
      </p>
    </div>
  </div>
</template>
