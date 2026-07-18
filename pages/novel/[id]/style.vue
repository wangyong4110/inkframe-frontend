<script setup lang="ts">
import type { ImageStylePreset } from '~/types'

// 全屏画风库页面：不套用全局导航栏，页面自带返回按钮承担导航职责（与其他全屏编辑页一致）。
definePageMeta({ layout: false })

const route = useRoute()
const router = useRouter()
const novelId = parseInt(route.params.id as string)
if (isNaN(novelId)) {
  await navigateTo('/')
}

const novelStore = useNovelStore()
const imageStylePresetApi = useImageStylePresetApi()
const toast = useToast()

const loading = ref(true)
const novel = computed(() => novelStore.currentNovel)

// 画风预设列表：从后端 /image-style-presets 拉取（管理员上传的示例图/编辑的 prompt 都来自这里），
// 不再读前端硬编码的 IMAGE_PRESETS 常量。tags/preview_colors 后端存的是 JSON 字符串，这里解析成数组。
const presets = ref<ImageStylePreset[]>([])
async function loadPresets() {
  try {
    const res = await imageStylePresetApi.listPresets()
    presets.value = (res.data ?? []).map(r => {
      let tags: string[] = []
      let previewColors: string[] = ['#374151', '#1f2937']
      try { const t = JSON.parse(r.tags || '[]'); if (Array.isArray(t)) tags = t } catch { /* ignore malformed JSON */ }
      try { const c = JSON.parse(r.preview_colors || '[]'); if (Array.isArray(c) && c.length >= 2) previewColors = c } catch { /* ignore malformed JSON */ }
      return {
        id: r.style_id,
        name: r.name,
        description: r.description,
        tags,
        art_style: r.style_id,
        preview_colors: previewColors,
        category: r.category || undefined,
        preview_image_url: r.preview_image_url || undefined,
      } as ImageStylePreset
    })
  } catch (e: any) {
    toast.error('加载画风列表失败：' + (e.message || '未知错误'))
  }
}

onMounted(async () => {
  try {
    await Promise.all([
      novelStore.currentNovel?.id !== novelId ? novelStore.fetchNovel(novelId) : Promise.resolve(),
      loadPresets(),
    ])
  } finally {
    loading.value = false
  }
})

function goBack() {
  router.back()
}

type TabKey = 'live_action' | 'anime' | 'custom'
const TABS: { key: TabKey; label: string }[] = [
  { key: 'live_action', label: 'AI真人剧' },
  { key: 'anime', label: 'AI漫剧' },
  { key: 'custom', label: '自定义' },
]

const liveActionPresets = computed(() => presets.value.filter(p => p.category === 'live_action'))
const animePresets = computed(() => presets.value.filter(p => p.category === 'anime'))

// 当前项目已选的预设（若 image_style 命中某个预设 id）；命中不了则视为自定义描述文本。
const currentPreset = computed(() => presets.value.find(p => p.id === novel.value?.image_style))
const isCustomStyle = computed(() => !!novel.value?.image_style && !currentPreset.value)
const currentStyleLabel = computed(() => currentPreset.value?.name ?? (isCustomStyle.value ? novel.value!.image_style : ''))

const activeTab = ref<TabKey>('live_action')
watch(currentPreset, (p) => {
  if (p) activeTab.value = p.category ?? 'live_action'
  else if (isCustomStyle.value) activeTab.value = 'custom'
}, { immediate: true })

function jumpToCurrentSelection() {
  if (currentPreset.value) activeTab.value = currentPreset.value.category ?? 'live_action'
  else if (isCustomStyle.value) activeTab.value = 'custom'
}

const savingStyle = ref(false)
async function selectPreset(preset: ImageStylePreset) {
  if (savingStyle.value || preset.id === novel.value?.image_style) return
  savingStyle.value = true
  try {
    await novelStore.updateNovel(novelId, { image_style: preset.id })
    toast.success(`已切换画风：${preset.name}`)
  } catch (e: any) {
    toast.error('切换失败：' + (e.message || '未知错误'))
  } finally {
    savingStyle.value = false
  }
}

// ── 自定义画风：自然语言描述，失焦/停止输入后自动保存（与分镜描述编辑保持一致的交互）──
const customDraft = ref('')
watch(isCustomStyle, (v) => { if (v) customDraft.value = novel.value?.image_style ?? '' }, { immediate: true })
watch(activeTab, (tab) => {
  if (tab === 'custom' && !isCustomStyle.value) customDraft.value = ''
})
let customSaveTimer: ReturnType<typeof setTimeout> | null = null
async function saveCustomStyle() {
  if (customSaveTimer) { clearTimeout(customSaveTimer); customSaveTimer = null }
  const text = customDraft.value.trim()
  if (!text || text === novel.value?.image_style) return
  savingStyle.value = true
  try {
    await novelStore.updateNovel(novelId, { image_style: text })
    toast.success('已应用自定义画风')
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || '未知错误'))
  } finally {
    savingStyle.value = false
  }
}
function onCustomInput() {
  if (customSaveTimer) clearTimeout(customSaveTimer)
  customSaveTimer = setTimeout(saveCustomStyle, 1200)
}
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-gray-100">
    <header class="h-14 px-4 flex items-center gap-3 border-b border-gray-800">
      <button class="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-200" @click="goBack">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"/></svg>
        返回
      </button>
      <span class="text-sm font-medium text-gray-100">画风{{ novel?.title ? ' · ' + novel.title : '' }}</span>
    </header>

    <div v-if="loading" class="flex items-center justify-center py-24 text-gray-500 text-sm">加载中…</div>

    <div v-else class="max-w-6xl mx-auto px-6 py-6">
      <h1 class="text-lg font-semibold mb-4">画风</h1>

      <!-- Tab bar -->
      <div class="flex items-center rounded-xl bg-gray-900 border border-gray-800 p-1 mb-4">
        <button
          v-for="tab in TABS" :key="tab.key"
          class="flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
          :class="activeTab === tab.key ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-gray-200'"
          @click="activeTab = tab.key"
        >
          <span
            v-if="(tab.key === 'live_action' && currentPreset?.category === 'live_action') || (tab.key === 'anime' && currentPreset?.category === 'anime') || (tab.key === 'custom' && isCustomStyle)"
            class="w-1.5 h-1.5 rounded-full bg-emerald-400"
          />
          {{ tab.label }}
        </button>
      </div>

      <!-- 当前已选 banner -->
      <div v-if="currentStyleLabel" class="flex items-center justify-between px-4 py-2.5 rounded-lg bg-emerald-900/20 border border-emerald-800/40 mb-4">
        <span class="text-sm text-emerald-300 flex items-center gap-2">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
          当前已选: {{ currentStyleLabel }}
        </span>
        <button class="text-sm text-emerald-400 hover:text-emerald-300 flex-shrink-0" @click="jumpToCurrentSelection">查看</button>
      </div>

      <!-- 真人剧 / 漫剧：预设网格 -->
      <div v-if="activeTab !== 'custom'" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <button
          v-for="p in (activeTab === 'live_action' ? liveActionPresets : animePresets)"
          :key="p.id"
          type="button"
          class="rounded-xl overflow-hidden border-2 text-left transition-colors disabled:opacity-60"
          :class="novel?.image_style === p.id ? 'border-primary-500' : 'border-transparent hover:border-gray-700'"
          :disabled="savingStyle"
          @click="selectPreset(p)"
        >
          <div
            class="aspect-square relative flex items-end p-3"
            :style="{ background: `linear-gradient(135deg, ${p.preview_colors[0]}66, ${p.preview_colors[1]}33)` }"
          >
            <img v-if="p.preview_image_url" :src="p.preview_image_url" class="absolute inset-0 w-full h-full object-cover" />
            <div v-else class="absolute inset-0 flex items-center justify-center text-white/20">
              <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 8h.01M4 4h16a1 1 0 011 1v14a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z"/></svg>
            </div>
            <span v-if="novel?.image_style === p.id" class="absolute top-2 right-2 w-6 h-6 rounded-full bg-white text-gray-900 flex items-center justify-center">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
            </span>
            <p class="relative text-base font-semibold text-white drop-shadow z-10">{{ p.name }}</p>
          </div>
          <p class="px-3 py-1.5 text-xs text-gray-500 bg-gray-900 truncate">{{ p.tags.join('·') }}</p>
        </button>
      </div>

      <!-- 自定义 -->
      <div v-else>
        <label class="block text-sm text-gray-300 mb-2">画风描述</label>
        <textarea
          v-model="customDraft"
          rows="6"
          placeholder="例如：赛博朋克风格，但色调偏暖，带有东方元素…"
          class="w-full bg-gray-900 border border-gray-800 rounded-lg px-3 py-2.5 text-sm text-gray-200 placeholder-gray-600 resize-none focus:outline-none focus:border-primary-600"
          @input="onCustomInput"
          @blur="saveCustomStyle"
        />
        <p class="text-xs text-gray-600 mt-2">描述会作为画风提示词，自动补充到之后新生成分镜的画面描述中，不会修改已有分镜。</p>
      </div>
    </div>
  </div>
</template>
