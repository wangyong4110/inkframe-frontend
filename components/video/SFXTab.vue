<script setup lang="ts">
import type { StoryboardShot, ShotSFXItem, SFXTagItem } from '~/types'
import { parseSfxTags } from '~/utils/video'

const props = defineProps<{
  videoId: number
  promptLanguage?: string  // 'zh' | 'en', from novel.prompt_language
}>()

const isChineseLang = computed(() => (props.promptLanguage ?? 'zh') !== 'en')

const videoStore = useVideoStore()
const toast = useToast()

const shots = computed(() => videoStore.storyboard)
const { currentPage, totalPages, pagedShots, pageNumbers } = useShotsPagination(shots)
const generatingSFX = ref(false)
const analyzingTags = ref(false)
const sfxAiContext = ref('')
const showSfxAiPanel = ref(true)

const sfxPlayingId = ref<number | null>(null)
const sfxLoadingId = ref<number | null>(null)
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
      })
      toast.success('音效生成任务已提交（含 AI 标签分析），请在右下角任务面板查看进度')
    } else {
      generatingSFX.value = false
    }
  } catch (e: any) {
    toast.error('音效生成失败：' + (e.message || ''))
    generatingSFX.value = false
  }
}

function onAudioError() {
  if (sfxLoadingId.value !== null || sfxPlayingId.value !== null) {
    toast.error('音效播放出错，链接可能已失效')
  }
  sfxPlayingId.value = null
  sfxLoadingId.value = null
}

function toggleSfxPreview(item: ShotSFXItem) {
  const audio = sfxAudioRef.value
  if (!audio) return
  if (sfxPlayingId.value === item.id) {
    audio.pause()
    audio.currentTime = 0
    sfxPlayingId.value = null
    sfxLoadingId.value = null
    return
  }
  // 停止当前正在播放的音效
  if (sfxPlayingId.value !== null) {
    audio.pause()
    audio.currentTime = 0
    sfxPlayingId.value = null
  }
  if (!item.url) {
    toast.error('该音效暂无可用链接')
    return
  }
  sfxLoadingId.value = item.id
  audio.src = item.url
  audio.load()
  audio.play()
    .then(() => {
      sfxPlayingId.value = item.id
      sfxLoadingId.value = null
    })
    .catch((e) => {
      console.warn('[SFX Preview] play failed', item.url, e)
      toast.error('音效预览失败，请检查音频链接是否有效')
      sfxPlayingId.value = null
      sfxLoadingId.value = null
    })
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

// ── 内联 SFX 标签编辑 ────────────────────────────────────────────────────────

// editingTagsFor: currently open tag editor's shot id (null = closed)
const editingTagsFor = ref<number | null>(null)
// local copy of tags being edited (keyed by shot.id)
const editingTagsMap = ref<Record<number, SFXTagItem[]>>({})

function openTagEditor(shot: StoryboardShot) {
  editingTagsFor.value = shot.id
  const existing = sfxTagsMap.value.get(shot.id) ?? []
  editingTagsMap.value[shot.id] = existing.map(t => ({ ...t }))
}

function closeTagEditor() {
  editingTagsFor.value = null
}

function addTag(shotId: number) {
  if (!editingTagsMap.value[shotId]) editingTagsMap.value[shotId] = []
  editingTagsMap.value[shotId].push({ tag: '', type: 'action' })
}

function removeTag(shotId: number, idx: number) {
  editingTagsMap.value[shotId]?.splice(idx, 1)
}

// displayLabel: what to show as the primary tag text
function displayLabel(t: SFXTagItem): string {
  return isChineseLang.value ? (t.prompt || t.tag) : t.tag
}

const savingTagsFor = ref<number | null>(null)
async function saveTagsForShot(shot: StoryboardShot) {
  const tags = (editingTagsMap.value[shot.id] ?? []).filter(t => t.tag.trim() !== '')
  savingTagsFor.value = shot.id
  try {
    const api = useVideoApi()
    await api.updateShotSFXTags(props.videoId, shot.id, tags)
    // Update the shot's sfx_tags in the store
    const tagsJson = JSON.stringify(tags)
    await videoStore.fetchStoryboard(props.videoId)
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
    <!-- Hidden audio element for preview -->
    <audio
      ref="sfxAudioRef"
      class="hidden"
      @ended="sfxPlayingId = null; sfxLoadingId = null"
      @error="onAudioError"
    />

    <!-- AI Panel — teleported into the aside panel via #sfx-ai-slot -->
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
      <div v-for="shot in pagedShots" :key="shot.id" class="card overflow-hidden">
        <!-- Shot header -->
        <div class="flex items-start gap-3 p-3">
          <span class="text-xs font-bold text-gray-400 flex-shrink-0 mt-0.5">镜 {{ shot.shot_no }}</span>
          <div class="flex-1 min-w-0">
            <p class="text-sm text-gray-700 dark:text-gray-300 line-clamp-1">
              {{ shot.narration || shot.description || '（无描述）' }}
            </p>
            <!-- SFX tags：显示模式 + 编辑入口 -->
            <div class="mt-1">
              <!-- 展示模式 -->
              <div v-if="editingTagsFor !== shot.id" class="flex flex-wrap items-center gap-1">
                <span
                  v-for="t in sfxTagsMap.get(shot.id)"
                  :key="t.tag"
                  class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border cursor-default"
                  :class="{
                    'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-100 dark:border-red-800': t.type === 'action',
                    'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 border-green-100 dark:border-green-800': t.type === 'ambient',
                    'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-800': t.type === 'emotion',
                    'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400 border-orange-100 dark:border-orange-800': !t.type,
                  }"
                  :title="isChineseLang && t.tag !== displayLabel(t) ? `搜索词: ${t.tag}` : undefined"
                >
                  <span v-if="t.type" class="opacity-60 text-[9px] font-mono uppercase">{{ t.type[0] }}</span>
                  {{ displayLabel(t) }}
                </span>
                <!-- 编辑按钮 -->
                <button
                  class="text-[10px] text-gray-400 hover:text-orange-500 transition-colors px-1"
                  title="编辑标签"
                  @click.stop="openTagEditor(shot)"
                >✎</button>
              </div>

              <!-- 编辑模式 -->
              <div v-else class="mt-1 space-y-1.5 bg-gray-50 dark:bg-gray-800/60 rounded-lg p-2">
                <div v-for="(t, idx) in editingTagsMap[shot.id]" :key="idx" class="flex items-center gap-1.5">
                  <!-- type selector -->
                  <select
                    v-model="t.type"
                    class="text-[10px] border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 px-1 py-0.5 w-20 flex-shrink-0"
                  >
                    <option value="action">动作</option>
                    <option value="ambient">环境</option>
                    <option value="emotion">情绪</option>
                  </select>
                  <!-- tag input: in Chinese mode show prompt, in English mode show tag -->
                  <input
                    v-if="isChineseLang"
                    v-model="t.prompt"
                    type="text"
                    placeholder="中文描述（Kling SFX 用）"
                    class="flex-1 text-xs border border-gray-200 dark:border-gray-600 rounded px-2 py-0.5 bg-white dark:bg-gray-700 min-w-0"
                    @keyup.enter="saveTagsForShot(shot)"
                  />
                  <input
                    v-model="t.tag"
                    type="text"
                    :placeholder="isChineseLang ? 'English tag（Freesound 搜索）' : 'English SFX tag (Freesound format)'"
                    class="flex-1 text-xs border border-gray-200 dark:border-gray-600 rounded px-2 py-0.5 bg-white dark:bg-gray-700 min-w-0"
                    :class="isChineseLang ? 'text-gray-400 w-28 flex-none' : ''"
                    :style="isChineseLang ? 'flex: 0 0 9rem' : ''"
                    @keyup.enter="saveTagsForShot(shot)"
                  />
                  <!-- delete tag -->
                  <button
                    class="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                    @click="removeTag(shot.id, idx)"
                  >
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <!-- add + save/cancel row -->
                <div class="flex items-center gap-1.5 pt-0.5">
                  <button
                    class="text-[10px] text-orange-600 hover:text-orange-700 flex items-center gap-0.5"
                    @click="addTag(shot.id)"
                  >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                    添加
                  </button>
                  <span class="flex-1" />
                  <button
                    class="text-[10px] px-2 py-0.5 rounded text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    @click="closeTagEditor"
                  >取消</button>
                  <button
                    class="text-[10px] px-2 py-0.5 rounded bg-orange-500 text-white hover:bg-orange-600 transition-colors disabled:opacity-50"
                    :disabled="savingTagsFor === shot.id"
                    @click="saveTagsForShot(shot)"
                  >{{ savingTagsFor === shot.id ? '保存中…' : '保存' }}</button>
                </div>
              </div>
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
                'bg-fuchsia-100 dark:bg-fuchsia-900/30 text-fuchsia-700 dark:text-fuchsia-300': item.source === 'ai-sfx',
                'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300': item.source === 'freesound',
                'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300': item.source === 'elevenlabs',
                'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400': item.source === 'local',
              }">
              {{ item.source === 'ai-sfx' ? 'AI生成' : item.source }}
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
            <!-- Duration -->
            <span v-if="item.duration_secs && item.duration_secs > 0" class="text-[10px] text-gray-400 w-8 text-right flex-shrink-0">
              {{ item.duration_secs.toFixed(1) }}s
            </span>
            <!-- Play/Pause/Loading button -->
            <button
              class="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
              :class="sfxPlayingId === item.id
                ? 'bg-orange-500 text-white'
                : sfxLoadingId === item.id
                  ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-400'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-500 hover:text-orange-500'"
              :title="sfxPlayingId === item.id ? '点击停止' : sfxLoadingId === item.id ? '加载中…' : '试听'"
              :disabled="sfxLoadingId !== null && sfxLoadingId !== item.id"
              @click="toggleSfxPreview(item)"
            >
              <!-- Loading spinner -->
              <svg v-if="sfxLoadingId === item.id" class="w-3.5 h-3.5 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <!-- Pause icon -->
              <svg v-else-if="sfxPlayingId === item.id" class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
              <!-- Play icon -->
              <svg v-else class="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
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
