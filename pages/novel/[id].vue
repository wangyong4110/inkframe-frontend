<script setup lang="ts">
import type { Novel, Chapter, Character, AIModel, Worldview } from '~/types'
import { WRITING_PRESETS, IMAGE_PRESETS, useStyleApi } from '~/composables/useStylePresets'

const route = useRoute()
const router = useRouter()
const novelId = parseInt(route.params.id as string)

const novelStore = useNovelStore()
const chapterStore = useChapterStore()
const characterStore = useCharacterStore()
const toast = useToast()
const styleApi = useStyleApi()

const activeTab = ref('chapters')
const showChapterModal = ref(false)
const showCharacterModal = ref(false)
const generatingOutline = ref(false)
const showDeleteNovelConfirm = ref(false)
const showDeleteChapterConfirm = ref(false)
const chapterToDelete = ref<Chapter | null>(null)

// Style selection state
const selectedWritingPreset = ref('')
const applyingWritingPreset = ref(false)

// AI model list (loaded async; silently ignored if API unavailable)
const availableModels = ref<AIModel[]>([])

// Worldview list for linking
const worldviewList = ref<{ id: number; name: string }[]>([])
const linkingWorldview = ref(false)

// Initialize selectedWritingPreset from novel data when available
watch(() => novelStore.currentNovel?.image_style, (v) => {
  if (v && !selectedWritingPreset.value) {
    // image_style drives the image picker directly
  }
}, { immediate: true })

async function handleWritingPresetSelect(presetId: string) {
  selectedWritingPreset.value = presetId
  const preset = WRITING_PRESETS.find(p => p.id === presetId)
  if (!preset) return
  applyingWritingPreset.value = true
  try {
    const prompt = await styleApi.buildWritingPrompt(preset.config)
    await novelStore.updateNovel(novelId, { style_prompt: prompt })
    toast.success(`已应用写作风格「${preset.name}」`)
  } catch {
    // silently fall back — style_prompt not updated, preset still visually selected
  } finally {
    applyingWritingPreset.value = false
  }
}

function handleImageStyleSelect(styleId: string) {
  novelStore.updateNovel(novelId, { image_style: styleId }).then(() => {
    const preset = IMAGE_PRESETS.find(p => p.id === styleId)
    if (preset) toast.success(`已应用图片风格「${preset.name}」`)
  }).catch((e: any) => {
    toast.error('保存图片风格失败：' + (e.message || ''))
  })
}

const novel = computed(() => novelStore.currentNovel)
const chapters = computed(() => chapterStore.chapters)
const characters = computed(() => characterStore.characters)

const tabs = [
  { key: 'chapters', label: '章节', icon: 'book-open' },
  { key: 'characters', label: '角色', icon: 'users' },
  { key: 'worldview', label: '世界观', icon: 'globe' },
  { key: 'settings', label: '设置', icon: 'settings' },
]

onMounted(async () => {
  await Promise.all([
    novelStore.fetchNovel(novelId),
    chapterStore.fetchChapters(novelId),
    characterStore.fetchCharacters(novelId),
  ])
  // Load AI models and worldview list (non-critical, silent fail)
  try {
    const modelApi = useModelApi()
    const [modelsResp, wvResp] = await Promise.allSettled([
      modelApi.getAvailableModels('chapter'),
      useWorldviewApi().getWorldviews({ page_size: 100 }),
    ])
    if (modelsResp.status === 'fulfilled') {
      availableModels.value = modelsResp.value.data.filter((m: AIModel) => m.is_active && m.is_available)
    }
    if (wvResp.status === 'fulfilled') {
      worldviewList.value = (wvResp.value.data as Worldview[]).map((w: Worldview) => ({ id: w.id, name: w.name }))
    }
  } catch { /* non-critical */ }
})

function goToChapter(chapter: Chapter) {
  router.push(`/novel/${novelId}/chapter/${chapter.chapter_no}`)
}

function goToCharacter(character: Character) {
  router.push(`/character/${character.id}`)
}

async function handleGenerateOutline() {
  if (!novel.value) return
  generatingOutline.value = true
  try {
    await novelStore.generateOutline(novelId, 10)
    toast.success('大纲生成完成')
  } catch (e: any) {
    toast.error('大纲生成失败：' + (e.message || '未知错误'))
  } finally {
    generatingOutline.value = false
  }
}

async function confirmDeleteNovel() {
  try {
    await novelStore.deleteNovel(novelId)
    toast.success('项目已删除')
    router.push('/novel')
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || '未知错误'))
  }
}

function requestDeleteChapter(chapter: Chapter, event: Event) {
  event.stopPropagation()
  chapterToDelete.value = chapter
  showDeleteChapterConfirm.value = true
}

async function confirmDeleteChapter() {
  if (!chapterToDelete.value) return
  try {
    await chapterStore.deleteChapter(novelId, chapterToDelete.value.chapter_no)
    toast.success('章节已删除')
    chapterToDelete.value = null
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || '未知错误'))
  }
}

async function linkWorldview(worldviewId: number | null) {
  linkingWorldview.value = true
  try {
    await novelStore.updateNovel(novelId, { worldview_id: worldviewId ?? undefined })
    toast.success(worldviewId ? '世界观已关联' : '世界观已解除关联')
  } catch (e: any) {
    toast.error('操作失败：' + (e.message || ''))
  } finally {
    linkingWorldview.value = false
  }
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    generating: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-green-100 text-green-800',
    published: 'bg-blue-100 text-blue-800',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: '草稿',
    generating: '生成中',
    completed: '已完成',
    published: '已发布',
  }
  return labels[status] || status
}

function getRoleColor(role: string): string {
  const colors: Record<string, string> = {
    protagonist: 'bg-red-100 text-red-800',
    antagonist: 'bg-purple-100 text-purple-800',
    supporting: 'bg-blue-100 text-blue-800',
    minor: 'bg-gray-100 text-gray-800',
  }
  return colors[role] || 'bg-gray-100 text-gray-800'
}

function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    protagonist: '主角',
    antagonist: '反派',
    supporting: '配角',
    minor: '路人',
  }
  return labels[role] || role
}
</script>

<template>
  <div class="space-y-6">
    <!-- Novel Header -->
    <div v-if="novel" class="card">
      <div class="p-6">
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {{ novel.title }}
            </h1>
            <p class="text-gray-500 dark:text-gray-400 mb-4">
              {{ novel.description || '暂无描述' }}
            </p>
            <div class="flex flex-wrap items-center gap-3">
              <span class="tag tag-primary">{{ novel.genre }}</span>
              <span class="text-sm text-gray-500 dark:text-gray-400">
                {{ novel.chapter_count }} 章
              </span>
              <span class="text-sm text-gray-500 dark:text-gray-400">
                {{ novel.total_words.toLocaleString() }} 字
              </span>
            </div>
          </div>
          <div class="flex items-center space-x-2">
            <NuxtLink
              :to="`/video/create?novel_id=${novelId}`"
              class="btn-outline"
            >
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              生成视频
            </NuxtLink>
            <button class="btn-primary" @click="handleGenerateOutline">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              生成大纲
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="border-b border-gray-200 dark:border-gray-700">
      <nav class="flex space-x-8">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="py-4 px-1 border-b-2 font-medium text-sm transition-colors"
          :class="[
            activeTab === tab.key
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          ]"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </nav>
    </div>

    <!-- Chapters Tab -->
    <div v-if="activeTab === 'chapters'" class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">章节列表</h2>
        <NuxtLink
          :to="`/novel/${novelId}/chapter/new`"
          class="btn-primary"
        >
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          新建章节
        </NuxtLink>
      </div>

      <div v-if="chapterStore.loading" class="space-y-3">
        <div v-for="i in 5" :key="i" class="card p-4">
          <div class="skeleton h-5 w-1/3 mb-2"></div>
          <div class="skeleton h-4 w-2/3"></div>
        </div>
      </div>

      <div v-else-if="chapters.length === 0" class="card p-8 text-center">
        <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <p class="text-gray-500 dark:text-gray-400">还没有章节，创建你的第一章</p>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="chapter in chapters"
          :key="chapter.id"
          class="card p-4 hover:shadow-soft transition-shadow cursor-pointer group"
          @click="goToChapter(chapter)"
        >
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <div class="flex items-center space-x-3">
                <span class="text-lg font-medium text-gray-900 dark:text-white">
                  第{{ chapter.chapter_no }}章
                </span>
                <span class="text-gray-500 dark:text-gray-400">{{ chapter.title }}</span>
              </div>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-1">
                {{ chapter.summary || '暂无摘要' }}
              </p>
            </div>
            <div class="flex items-center space-x-4">
              <span class="text-sm text-gray-500 dark:text-gray-400">
                {{ chapter.word_count.toLocaleString() }} 字
              </span>
              <span
                class="px-2 py-0.5 text-xs font-medium rounded"
                :class="getStatusColor(chapter.status)"
              >
                {{ getStatusLabel(chapter.status) }}
              </span>
              <button
                class="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                title="删除章节"
                @click="requestDeleteChapter(chapter, $event)"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Characters Tab -->
    <div v-if="activeTab === 'characters'" class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">角色列表</h2>
        <NuxtLink to="/character/create" class="btn-primary">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          新建角色
        </NuxtLink>
      </div>

      <div v-if="characterStore.loading" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div v-for="i in 4" :key="i" class="card p-4">
          <div class="skeleton h-20 w-20 rounded-full mb-3"></div>
          <div class="skeleton h-5 w-1/2 mb-2"></div>
          <div class="skeleton h-4 w-3/4"></div>
        </div>
      </div>

      <div v-else-if="characters.length === 0" class="card p-8 text-center">
        <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <p class="text-gray-500 dark:text-gray-400">还没有角色，创建你的第一个角色</p>
      </div>

      <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="character in characters"
          :key="character.id"
          class="card p-4 hover:shadow-soft transition-shadow cursor-pointer"
          @click="goToCharacter(character)"
        >
          <div class="flex items-start space-x-4">
            <div class="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span class="text-2xl font-bold text-primary-600">{{ character.name.charAt(0) }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center space-x-2">
                <h3 class="text-lg font-medium text-gray-900 dark:text-white truncate">
                  {{ character.name }}
                </h3>
                <span
                  class="px-2 py-0.5 text-xs font-medium rounded"
                  :class="getRoleColor(character.role)"
                >
                  {{ getRoleLabel(character.role) }}
                </span>
              </div>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                {{ character.personality || '暂无性格描述' }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Worldview Tab -->
    <div v-if="activeTab === 'worldview'" class="card p-6 space-y-6">
      <!-- Linked worldview -->
      <div v-if="novel?.worldview_id" class="flex items-center justify-between p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
        <div class="flex items-center space-x-3">
          <div class="w-10 h-10 bg-primary-500 rounded-lg flex items-center justify-center">
            <svg class="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945" />
            </svg>
          </div>
          <div>
            <p class="text-sm font-medium text-gray-900 dark:text-white">
              {{ worldviewList.find(w => w.id === novel?.worldview_id)?.name || `世界观 #${novel.worldview_id}` }}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">已关联</p>
          </div>
        </div>
        <div class="flex items-center space-x-2">
          <NuxtLink :to="`/worldview/${novel.worldview_id}`" class="btn-outline text-sm">编辑</NuxtLink>
          <button class="btn-ghost text-sm text-red-500 hover:text-red-600" :disabled="linkingWorldview" @click="linkWorldview(null)">解除</button>
        </div>
      </div>

      <!-- Link existing worldview -->
      <div>
        <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
          {{ novel?.worldview_id ? '更换世界观' : '关联已有世界观' }}
        </h4>
        <div class="flex gap-2">
          <select
            id="worldview-select"
            class="input flex-1"
            :value="novel?.worldview_id ?? ''"
            @change="(e) => { const v = parseInt((e.target as HTMLSelectElement).value); if (v) linkWorldview(v) }"
          >
            <option value="">— 选择世界观 —</option>
            <option v-for="wv in worldviewList" :key="wv.id" :value="wv.id">{{ wv.name }}</option>
          </select>
        </div>
      </div>

      <!-- Create new -->
      <div class="flex items-center space-x-3 pt-2 border-t border-gray-200 dark:border-gray-700">
        <NuxtLink :to="`/worldview/create?novel_id=${novelId}`" class="btn-outline text-sm">
          <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          新建世界观
        </NuxtLink>
        <span class="text-xs text-gray-400">创建新世界观并自动关联到此小说</span>
      </div>
    </div>

    <!-- Settings Tab -->
    <div v-if="activeTab === 'settings'" class="card p-6">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">项目设置</h3>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">项目名称</label>
          <input
            type="text"
            :value="novel?.title"
            class="input"
            @change="(e) => novelStore.updateNovel(novelId, { title: (e.target as HTMLInputElement).value })"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">项目描述</label>
          <textarea
            :value="novel?.description"
            rows="3"
            class="input"
            @change="(e) => novelStore.updateNovel(novelId, { description: (e.target as HTMLTextAreaElement).value })"
          ></textarea>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">题材类型</label>
            <select
              :value="novel?.genre"
              class="input"
              @change="(e) => novelStore.updateNovel(novelId, { genre: (e.target as HTMLSelectElement).value })"
            >
              <option value="fantasy">奇幻</option>
              <option value="xianxia">仙侠</option>
              <option value="urban">都市</option>
              <option value="scifi">科幻</option>
              <option value="romance">言情</option>
              <option value="mystery">悬疑</option>
              <option value="historical">历史</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">项目状态</label>
            <select
              :value="novel?.status"
              class="input"
              @change="(e) => novelStore.updateNovel(novelId, { status: (e.target as HTMLSelectElement).value })"
            >
              <option value="planning">规划中</option>
              <option value="writing">创作中</option>
              <option value="paused">暂停</option>
              <option value="completed">已完成</option>
              <option value="archived">已归档</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">封面图片 URL</label>
          <input
            type="text"
            :value="novel?.cover_image"
            class="input"
            placeholder="https://..."
            @change="(e) => novelStore.updateNovel(novelId, { cover_image: (e.target as HTMLInputElement).value })"
          />
          <img v-if="novel?.cover_image" :src="novel.cover_image" class="mt-2 h-32 rounded-lg object-cover" />
        </div>
        <!-- Writing Style -->
        <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
          <div class="flex items-center justify-between mb-3">
            <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300">写作风格</h4>
            <NuxtLink to="/style" class="text-xs text-primary-600 hover:underline">浏览风格库 →</NuxtLink>
          </div>
          <div class="relative">
            <div v-if="applyingWritingPreset" class="absolute inset-0 bg-white/60 dark:bg-gray-800/60 rounded-lg z-10 flex items-center justify-center">
              <svg class="w-5 h-5 animate-spin text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </div>
            <StylePicker
              type="writing"
              :model-value="selectedWritingPreset"
              compact
              @update:model-value="handleWritingPresetSelect"
            />
          </div>
          <div class="mt-3">
            <label class="block text-xs text-gray-500 dark:text-gray-400 mb-1">当前风格提示词（可手动编辑）</label>
            <textarea
              :value="novel?.style_prompt"
              rows="2"
              class="input text-sm"
              placeholder="选择预设后自动填充，或手动输入..."
              @change="(e) => novelStore.updateNovel(novelId, { style_prompt: (e.target as HTMLTextAreaElement).value })"
            ></textarea>
          </div>
        </div>

        <!-- Image / Art Style -->
        <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">图片风格</h4>
          <StylePicker
            type="image"
            :model-value="novel?.image_style ?? ''"
            compact
            @update:model-value="handleImageStyleSelect"
          />
        </div>

        <!-- Reference Works -->
        <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">参考作品</h4>
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-2">
            输入参考小说的书名、URL 或风格描述，AI 将模仿其写作风格生成内容
          </p>
          <input
            type="text"
            :value="novel?.reference_style"
            class="input"
            placeholder="如：《斗破苍穹》的战斗描写风格，或粘贴章节 URL..."
            @change="(e) => novelStore.updateNovel(novelId, { reference_style: (e.target as HTMLInputElement).value })"
          />
          <p class="mt-1 text-xs text-gray-400">
            也可使用
            <NuxtLink to="/import" class="text-primary-600 hover:underline">导入小说</NuxtLink>
            功能，直接爬取起点、晋江等平台的作品作为参考
          </p>
        </div>

        <!-- AI Config -->
        <div class="border-t border-gray-200 dark:border-gray-700 pt-4">
          <h4 class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">AI 配置</h4>
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">AI 模型</label>
              <!-- Dynamic select when models available -->
              <select
                v-if="availableModels.length > 0"
                :value="novel?.ai_model ?? ''"
                class="input"
                @change="(e) => novelStore.updateNovel(novelId, { ai_model: (e.target as HTMLSelectElement).value || undefined })"
              >
                <option value="">使用默认模型</option>
                <option v-for="m in availableModels" :key="m.id" :value="m.name">
                  {{ m.display_name || m.name }}
                  <template v-if="m.description"> — {{ m.description }}</template>
                </option>
              </select>
              <!-- Fallback text input when no models configured -->
              <input
                v-else
                type="text"
                :value="novel?.ai_model"
                class="input"
                placeholder="留空使用默认模型"
                @change="(e) => novelStore.updateNovel(novelId, { ai_model: (e.target as HTMLInputElement).value || undefined })"
              />
              <p v-if="availableModels.length === 0" class="mt-1 text-xs text-gray-400">
                可在
                <NuxtLink to="/model" class="text-primary-600 hover:underline">模型管理</NuxtLink>
                中添加 AI 供应商
              </p>
            </div>
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-sm font-medium text-gray-700 dark:text-gray-300">
                  创意度 <span class="font-normal text-gray-400">({{ novel?.temperature ?? 0.7 }})</span>
                </label>
              </div>
              <input
                type="range"
                :value="novel?.temperature ?? 0.7"
                min="0" max="2" step="0.1"
                class="w-full accent-primary-500"
                @change="(e) => novelStore.updateNovel(novelId, { temperature: parseFloat((e.target as HTMLInputElement).value) })"
              />
              <div class="flex justify-between text-xs text-gray-400 mt-0.5">
                <span>确定（0）</span>
                <span>均衡（0.7）</span>
                <span>创意（2）</span>
              </div>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                每章最大 Tokens
              </label>
              <input
                type="number"
                :value="novel?.max_tokens ?? 4096"
                class="input"
                min="512" max="32000" step="512"
                @change="(e) => novelStore.updateNovel(novelId, { max_tokens: parseInt((e.target as HTMLInputElement).value) })"
              />
              <p class="mt-1 text-xs text-gray-400">约 {{ Math.round((novel?.max_tokens ?? 4096) * 0.75) }} 中文字</p>
            </div>
          </div>
        </div>
        <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
          <button class="btn-error" @click="showDeleteNovelConfirm = true">删除项目</button>
        </div>
      </div>
    </div>
  </div>

  <!-- Delete novel confirm -->
  <ConfirmDialog
    v-model="showDeleteNovelConfirm"
    title="删除项目"
    description="此操作不可撤销，将删除所有章节和角色数据。"
    variant="danger"
    confirm-text="确认删除"
    @confirm="confirmDeleteNovel"
  />

  <!-- Delete chapter confirm -->
  <ConfirmDialog
    v-model="showDeleteChapterConfirm"
    title="删除章节"
    :description="`确认删除第${chapterToDelete?.chapter_no}章「${chapterToDelete?.title || ''}」？此操作不可撤销。`"
    variant="danger"
    confirm-text="确认删除"
    @confirm="confirmDeleteChapter"
  />
</template>
