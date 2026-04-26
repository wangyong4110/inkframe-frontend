<script setup lang="ts">
import type { CharacterAbility } from '~/types'
import { useCharacterArcApi } from '~/composables/useEnhancementApi'
import type { CharacterArcStage } from '~/composables/useEnhancementApi'

const characterStore = useCharacterStore()
const novelStore = useNovelStore()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { getCharacterArc } = useCharacterArcApi()

const novelId = parseInt(route.params.novelId as string)
const characterId = parseInt(route.params.id as string)

const activeTab = ref('profile')
const saving = ref(false)
const isDirty = ref(false)
const generatingThreeView = ref<Record<string, boolean>>({ front: false, side: false, back: false, all: false })

// 三视图任务状态
const threeViewTaskId = ref('')
const threeViewTaskStatus = ref<'idle' | 'pending' | 'running' | 'completed' | 'failed'>('idle')
let threeViewTaskTimer: ReturnType<typeof setInterval> | null = null

function clearThreeViewTimer() {
  if (threeViewTaskTimer) { clearInterval(threeViewTaskTimer); threeViewTaskTimer = null }
}
onUnmounted(clearThreeViewTimer)
const novelImageStyle = computed(() => novelStore.currentNovel?.image_style || 'anime')

// 图像生成提供者
const imageProviders = ref<{ name: string; display_name: string }[]>([])
const selectedImageProvider = ref('')

async function fetchImageProviders() {
  try {
    const modelApi = useModelApi()
    const res = await modelApi.getImageCapableProviders()
    imageProviders.value = res.data ?? []
    if (imageProviders.value.length > 0 && !selectedImageProvider.value) {
      selectedImageProvider.value = imageProviders.value[0].name
    }
  } catch {
    imageProviders.value = []
  }
}

// Mutable local copy of the character (so v-model works without mutating the store directly)
const character = ref({
  name: '',
  role: 'protagonist' as string,
  archetype: '',
  background: '',
  appearance: '',
  personality: '',
  character_arc: '',
  portrait: '',
  three_view_front: '',
  three_view_side: '',
  three_view_back: '',
  cover_image: '',
})

// Reactive personality tags array
const personalityTags = ref<string[]>([])
const newTag = ref('')

// Reactive abilities array
const abilities = ref<CharacterAbility[]>([])
const showAddAbility = ref(false)
const newAbility = ref({ name: '', level: '', description: '' })

const tabs = [
  { key: 'profile', label: '角色档案' },
  { key: 'appearance', label: '外貌设定' },
  { key: 'personality', label: '性格特点' },
  { key: 'arc', label: '角色弧光' },
  { key: 'visual', label: '视觉设计' },
]

useUnsavedGuard(isDirty, '角色信息有未保存的修改，确认离开？')

// Arc chart data
const arcStages = ref<CharacterArcStage[]>([])
const arcLoading = ref(false)

const arcBars = computed(() => {
  if (!arcStages.value.length) return []
  const max = Math.max(...arcStages.value.map(s => s.power_level ?? 0), 1)
  return arcStages.value.map(s => ({
    chapter: s.chapter_no,
    height: Math.round(((s.power_level ?? 0) / max) * 90) + 5, // 5%–95%
    mood: s.mood,
  }))
})

watch(character, () => { isDirty.value = true }, { deep: true })
watch(personalityTags, () => { isDirty.value = true }, { deep: true })
watch(abilities, () => { isDirty.value = true }, { deep: true })

onMounted(async () => {
  fetchImageProviders()
  if (novelId && novelStore.currentNovel?.id !== novelId) {
    novelStore.fetchNovel(novelId).catch(() => {})
  }
  if (characterId) {
    await characterStore.fetchCharacter(characterId)
    const c = characterStore.currentCharacter
    if (c) {
      character.value = {
        name: c.name ?? '',
        role: c.role ?? 'protagonist',
        archetype: c.archetype ?? '',
        background: c.background ?? '',
        appearance: c.appearance ?? '',
        personality: c.personality ?? '',
        character_arc: c.character_arc ?? '',
        portrait: c.portrait ?? '',
        three_view_front: c.three_view_front ?? '',
        three_view_side: c.three_view_side ?? '',
        three_view_back: c.three_view_back ?? '',
        cover_image: c.cover_image ?? '',
      }
      personalityTags.value = c.personality_tags ? [...c.personality_tags] : []
      abilities.value = c.abilities ? [...c.abilities] : []
    }
    // Reset dirty after loading
    await nextTick()
    isDirty.value = false

    // Load character arc data
    const nid = c?.novel_id ?? novelId
    if (nid && characterId) {
      arcLoading.value = true
      try {
        const res = await getCharacterArc(nid, characterId)
        arcStages.value = res.data?.stages ?? []
      } catch {
        arcStages.value = []
      } finally {
        arcLoading.value = false
      }
    }
  }
})

async function handleSave() {
  saving.value = true
  try {
    await characterStore.updateCharacter(characterId, {
      ...character.value,
      personality_tags: personalityTags.value,
      abilities: abilities.value,
    } as any)
    isDirty.value = false
    toast.success('角色信息已保存')
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

function goBack() {
  router.push(`/novel/${novelId}?tab=characters`)
}

// Personality tags
function addTag() {
  const tag = newTag.value.trim()
  if (tag && !personalityTags.value.includes(tag)) {
    personalityTags.value.push(tag)
  }
  newTag.value = ''
}
function removeTag(idx: number) {
  personalityTags.value.splice(idx, 1)
}

// Abilities
function addAbility() {
  if (!newAbility.value.name.trim()) return
  abilities.value.push({ ...newAbility.value })
  newAbility.value = { name: '', level: '', description: '' }
  showAddAbility.value = false
}
function removeAbility(idx: number) {
  abilities.value.splice(idx, 1)
}

async function handleGenerateThreeView(viewType: 'front' | 'side' | 'back' | 'all') {
  if (!character.value.appearance) {
    toast.error('请先填写外貌描述，再生成三视图')
    return
  }
  generatingThreeView.value[viewType] = true
  threeViewTaskStatus.value = 'pending'
  clearThreeViewTimer()
  try {
    const api = useCharacterApi()
    const res = await api.generateThreeView(characterId, viewType, novelImageStyle.value, selectedImageProvider.value || undefined)
    const taskId = (res as any).data?.task_id ?? ''
    if (!taskId) throw new Error('未获取到任务 ID')
    threeViewTaskId.value = taskId
    toast.info('三视图生成任务已提交，AI 正在生成中…')
    threeViewTaskTimer = setInterval(async () => {
      try {
        const pollRes = await api.getThreeViewTaskStatus(characterId, threeViewTaskId.value)
        const task = pollRes.data
        threeViewTaskStatus.value = task.status as any
        if (task.status === 'completed') {
          clearThreeViewTimer()
          generatingThreeView.value[viewType] = false
          const updatedChar = (task.data?.character ?? task.character) as any
          if (updatedChar) {
            character.value.three_view_front = updatedChar.three_view_front ?? character.value.three_view_front
            character.value.three_view_side = updatedChar.three_view_side ?? character.value.three_view_side
            character.value.three_view_back = updatedChar.three_view_back ?? character.value.three_view_back
          }
          isDirty.value = false
          toast.success(viewType === 'all' ? '三视图生成完成' : '视图生成完成')
        } else if (task.status === 'failed') {
          clearThreeViewTimer()
          generatingThreeView.value[viewType] = false
          toast.error('生成失败：' + (task.error || '未知错误'))
        }
      } catch { /* ignore */ }
    }, 3000)
  } catch (e: any) {
    clearThreeViewTimer()
    generatingThreeView.value[viewType] = false
    threeViewTaskStatus.value = 'failed'
    toast.error('生成失败：' + (e.message || ''))
  }
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
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center space-x-4">
        <button class="btn-ghost p-2" @click="goBack">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            {{ character.name || '加载中...' }}
          </h1>
          <p class="text-sm text-gray-500 dark:text-gray-400">角色编辑器</p>
        </div>
      </div>
      <div class="flex items-center space-x-2">
        <span class="px-3 py-1 text-sm font-medium rounded-full" :class="getRoleColor(character.role)">
          {{ getRoleLabel(character.role) }}
        </span>
        <button class="btn-primary" :disabled="saving" @click="handleSave">
          {{ saving ? '保存中...' : '保存' }}
        </button>
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

    <!-- Profile Tab -->
    <div v-if="activeTab === 'profile'" class="card p-6">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">基本信息</h3>
      <div class="grid gap-6 md:grid-cols-2">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">角色名称</label>
          <input v-model="character.name" type="text" class="input" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">角色类型</label>
          <select v-model="character.role" class="input">
            <option value="protagonist">主角</option>
            <option value="antagonist">反派</option>
            <option value="supporting">配角</option>
            <option value="minor">路人</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">角色原型</label>
          <input v-model="character.archetype" type="text" class="input" placeholder="如：英雄、智者、反抗者" />
        </div>
      </div>

      <div class="mt-6">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">背景故事</label>
        <textarea v-model="character.background" rows="4" class="input" placeholder="描述角色的背景故事..."></textarea>
      </div>

      <div class="mt-6">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">角色弧光（简述成长轨迹）</label>
        <textarea v-model="character.character_arc" rows="3" class="input" placeholder="描述角色的成长轨迹和变化..."></textarea>
      </div>
    </div>

    <!-- Appearance Tab -->
    <div v-if="activeTab === 'appearance'" class="card p-6">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">外貌设定</h3>
      <div class="space-y-6">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">外貌描述</label>
          <textarea v-model="character.appearance" rows="4" class="input" placeholder="详细描述角色的外貌特征..."></textarea>
          <p class="mt-1 text-sm text-gray-500">建议包含：身高、体型、发色、眼睛、服装等特征</p>
        </div>

        <!-- Portrait upload -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">头像 / 肖像参考图片</label>
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">上传后将作为 AI 生成三视图时的参考，保持人物面部一致性</p>
          <div class="w-32">
            <ImageUploadBox
              v-model="character.portrait"
              placeholder="点击上传"
              @error="(msg) => toast.error('上传失败：' + msg)"
            />
          </div>
        </div>

        <!-- Image provider selector -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">图像生成模型</label>
          <select v-model="selectedImageProvider" class="input w-48">
            <option v-for="p in imageProviders" :key="p.name" :value="p.name">
              {{ p.display_name || p.name }}
            </option>
          </select>
        </div>

        <!-- Three-view images -->
        <div class="border-t border-gray-200 dark:border-gray-700 pt-6">
          <div class="flex items-center justify-between mb-4">
            <h4 class="text-sm font-medium text-gray-900 dark:text-white">三视图（正视图 / 侧视图 / 背视图）</h4>
            <div class="flex items-center gap-2">
              <button
                class="btn-primary text-xs px-3 h-8 flex items-center gap-1"
                :disabled="generatingThreeView.all || !character.appearance"
                @click="handleGenerateThreeView('all')"
              >
                <svg v-if="generatingThreeView.all" class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {{ generatingThreeView.all ? '生成中...' : 'AI 一键生成' }}
              </button>
            </div>
          </div>
          <div class="grid gap-4 md:grid-cols-3">
            <div v-for="view in [
              { key: 'three_view_front' as const, label: '正视图', vt: 'front' as const },
              { key: 'three_view_side'  as const, label: '侧视图', vt: 'side'  as const },
              { key: 'three_view_back'  as const, label: '背视图', vt: 'back'  as const },
            ]" :key="view.key" class="space-y-2">
              <div class="flex items-center justify-between">
                <label class="text-xs font-medium text-gray-500 dark:text-gray-400">{{ view.label }}</label>
                <button
                  class="text-xs text-primary-600 hover:text-primary-800 flex items-center gap-1 disabled:opacity-40"
                  :disabled="generatingThreeView[view.vt] || generatingThreeView.all || !character.appearance"
                  @click="handleGenerateThreeView(view.vt)"
                >
                  <svg v-if="generatingThreeView[view.vt]" class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <svg v-else class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3l14 9-14 9V3z" />
                  </svg>
                  {{ generatingThreeView[view.vt] ? '生成中' : 'AI 生成' }}
                </button>
              </div>
              <!-- Generating overlay when AI is running -->
              <div class="relative">
                <ImageUploadBox
                  v-model="character[view.key]"
                  aspect-ratio="3/4"
                  :placeholder="view.label"
                  @error="toast.error"
                />
                <div v-if="generatingThreeView[view.vt] || generatingThreeView.all" class="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg z-10">
                  <div class="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin"></div>
                </div>
              </div>
            </div>
          </div>
          <p class="mt-2 text-xs text-gray-500">需先填写「外貌描述」，AI 才能生成准确的三视图。填入或生成后点击「保存」即可保留。</p>
          <!-- 任务状态 -->
          <div v-if="threeViewTaskStatus !== 'idle'" class="mt-2 text-xs">
            <span v-if="threeViewTaskStatus === 'pending' || threeViewTaskStatus === 'running'" class="text-blue-500 flex items-center gap-1">
              <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
              AI 正在生成三视图，请稍候（通常需要 30-90 秒）…
            </span>
            <span v-else-if="threeViewTaskStatus === 'completed'" class="text-green-500">三视图生成完成</span>
            <span v-else-if="threeViewTaskStatus === 'failed'" class="text-red-500">生成失败，请重试</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Personality Tab -->
    <div v-if="activeTab === 'personality'" class="card p-6">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">性格特点</h3>

      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">性格描述</label>
        <textarea v-model="character.personality" rows="6" class="input" placeholder="详细描述角色的性格特点..."></textarea>
      </div>

      <!-- Personality tags -->
      <div class="mt-6">
        <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-3">性格标签</h4>
        <div class="flex flex-wrap gap-2 mb-2">
          <span
            v-for="(tag, idx) in personalityTags"
            :key="idx"
            class="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm bg-primary-100 text-primary-800"
          >
            {{ tag }}
            <button class="ml-1 text-primary-500 hover:text-primary-700" @click="removeTag(idx)">×</button>
          </span>
        </div>
        <div class="flex gap-2">
          <input
            v-model="newTag"
            type="text"
            class="input flex-1"
            placeholder="输入标签，回车添加"
            @keyup.enter="addTag"
          />
          <button class="btn-outline" @click="addTag">添加</button>
        </div>
      </div>

      <!-- Abilities -->
      <div class="mt-6">
        <div class="flex items-center justify-between mb-3">
          <h4 class="text-sm font-medium text-gray-900 dark:text-white">能力设定</h4>
          <button class="btn-outline text-sm" @click="showAddAbility = true">
            <svg class="w-4 h-4 mr-1 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
            </svg>
            添加能力
          </button>
        </div>

        <div class="space-y-2">
          <div
            v-for="(ab, idx) in abilities"
            :key="idx"
            class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
          >
            <div>
              <span class="font-medium text-gray-900 dark:text-white">{{ ab.name }}</span>
              <span v-if="ab.level" class="ml-2 text-sm text-gray-500">{{ ab.level }}</span>
              <p v-if="ab.description" class="text-xs text-gray-400 mt-0.5">{{ ab.description }}</p>
            </div>
            <button class="text-red-400 hover:text-red-600" @click="removeAbility(idx)">
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
          <p v-if="abilities.length === 0" class="text-sm text-gray-400">暂无能力设定</p>
        </div>

        <!-- Add ability form -->
        <div v-if="showAddAbility" class="mt-3 p-4 border border-gray-200 dark:border-gray-700 rounded-lg space-y-3">
          <div class="grid gap-3 md:grid-cols-2">
            <div>
              <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">能力名称 *</label>
              <input v-model="newAbility.name" type="text" class="input" placeholder="如：雷电诀" />
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">等级/阶段</label>
              <input v-model="newAbility.level" type="text" class="input" placeholder="如：3阶" />
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">描述</label>
            <input v-model="newAbility.description" type="text" class="input" placeholder="简要描述能力效果" />
          </div>
          <div class="flex gap-2">
            <button class="btn-primary text-sm" @click="addAbility">确认添加</button>
            <button class="btn-outline text-sm" @click="showAddAbility = false; newAbility = { name: '', level: '', description: '' }">取消</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Character Arc Tab -->
    <div v-if="activeTab === 'arc'" class="card p-6">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">角色弧光</h3>
      <p class="text-sm text-gray-500 mb-4">在「角色档案」标签页可编辑弧光文字描述。以下图示根据已完成章节自动生成。</p>

      <!-- Loading -->
      <div v-if="arcLoading" class="h-32 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-center justify-center">
        <p class="text-sm text-gray-400">加载中…</p>
      </div>

      <!-- No data -->
      <div v-else-if="!arcBars.length" class="h-32 bg-gray-50 dark:bg-gray-800 rounded-lg flex flex-col items-center justify-center gap-2">
        <svg class="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p class="text-sm text-gray-400">暂无章节数据，完成章节后自动生成</p>
      </div>

      <!-- Real chart -->
      <div v-else class="mt-4">
        <h4 class="text-sm font-medium text-gray-900 dark:text-white mb-4">情感曲线（基于章节内容）</h4>
        <div class="h-32 bg-gray-50 dark:bg-gray-800 rounded-lg flex items-end gap-1 px-4 pb-2 overflow-x-auto">
          <div
            v-for="bar in arcBars"
            :key="bar.chapter"
            class="flex-shrink-0 w-6 bg-primary-500 rounded-t transition-all"
            :style="{ height: `${bar.height}%` }"
            :title="`第${bar.chapter}章 · ${bar.mood ?? ''}`"
          />
        </div>
        <div class="flex justify-between mt-2 text-xs text-gray-500">
          <span>第{{ arcBars[0].chapter }}章</span>
          <span>第{{ arcBars[Math.floor(arcBars.length / 2)].chapter }}章</span>
          <span>第{{ arcBars[arcBars.length - 1].chapter }}章</span>
        </div>
      </div>
    </div>

    <!-- Visual Design Tab -->
    <div v-if="activeTab === 'visual'" class="card p-6">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">视觉设计</h3>
      <p class="text-sm text-gray-500 mb-6">三视图参考图请在「外貌设定」标签页填写 URL。此处管理艺术风格和导出选项。</p>

      <div class="space-y-6">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">艺术风格</label>
          <select class="input">
            <option value="realistic">写实风格</option>
            <option value="anime">动漫风格</option>
            <option value="cartoon">卡通风格</option>
            <option value="ink">水墨风格</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">封面图片 URL</label>
          <input v-model="character.cover_image" type="text" class="input" placeholder="https://..." />
          <div v-if="character.cover_image" class="mt-2">
            <img :src="character.cover_image" alt="cover" class="h-32 object-cover rounded-lg border" />
          </div>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">LoRA 训练</label>
          <div class="card bg-gray-50 dark:bg-gray-800 p-4">
            <div class="flex items-center justify-between">
              <div>
                <p class="font-medium">角色 LoRA 模型</p>
                <p class="text-sm text-gray-500">用于保持角色一致性</p>
              </div>
              <div class="flex items-center space-x-2">
                <span class="tag tag-success">已训练</span>
                <button class="btn-outline text-sm">重新训练</button>
              </div>
            </div>
          </div>
        </div>

        <div>
          <button class="btn-primary w-full">
            <svg class="w-4 h-4 mr-2 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            导出角色视觉资源包
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
