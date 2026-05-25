<script setup lang="ts">
const { openLightbox, previewLightbox } = useImageLightbox()
const characterStore = useCharacterStore()
const novelStore = useNovelStore()
const route = useRoute()
const router = useRouter()
const toast = useToast()

const novelId = parseInt(route.params.novelId as string)
const characterId = parseInt(route.params.id as string)
if (isNaN(characterId)) {
  await navigateTo('/novel')
}

const activeTab = ref('profile')
const saving = ref(false)
const isDirty = ref(false)
const generatingThreeView = ref(false)
const generatingFaceCloseup = ref(false)

// 三视图任务状态
const threeViewTaskId = ref('')
const threeViewTaskStatus = ref<'idle' | 'pending' | 'running' | 'completed' | 'failed'>('idle')
let threeViewTaskTimer: ReturnType<typeof setInterval> | null = null

// 面部特写任务状态
const faceCloseupTaskId = ref('')
const faceCloseupTaskStatus = ref<'idle' | 'pending' | 'running' | 'completed' | 'failed'>('idle')
let faceCloseupTaskTimer: ReturnType<typeof setInterval> | null = null

function clearThreeViewTimer() {
  if (threeViewTaskTimer) { clearInterval(threeViewTaskTimer); threeViewTaskTimer = null }
}
function clearFaceCloseupTimer() {
  if (faceCloseupTaskTimer) { clearInterval(faceCloseupTaskTimer); faceCloseupTaskTimer = null }
}
onUnmounted(() => { clearThreeViewTimer(); clearFaceCloseupTimer() })
const novelImageStyle = computed(() => novelStore.currentNovel?.image_style || 'anime')
const selectedImageProvider = computed(() => novelStore.currentNovel?.image_model || '')

// 简化后的角色本地副本（对齐后端简化模型）
const character = ref({
  name: '',
  role: 'protagonist' as string,
  description: '',       // 统一描述：外貌、性格、背景、说话风格等
  visual_prompt: '',     // 英文图像生成提示词
  portrait: '',
  three_view_sheet: '',
  face_closeup: '',
})

const tabs = [
  { key: 'profile', label: '角色档案' },
  { key: 'images', label: '图像资产' },
  { key: 'voice', label: '配音设置' },
]

useUnsavedGuard(isDirty, '角色信息有未保存的修改，确认离开？')

watch(character, () => { isDirty.value = true }, { deep: true })

onMounted(async () => {
  if (characterId) {
    await characterStore.fetchCharacter(characterId)
    const c = characterStore.currentCharacter
    const novelIdToFetch = c?.novel_id ?? novelId
    if (novelIdToFetch && novelStore.currentNovel?.id !== novelIdToFetch) {
      novelStore.fetchNovel(novelIdToFetch).catch(() => {})
    }
    if (c) {
      character.value = {
        name: c.name ?? '',
        role: c.role ?? 'protagonist',
        description: c.description ?? '',
        visual_prompt: (c as any).visual_prompt ?? '',
        portrait: c.portrait ?? '',
        three_view_sheet: c.three_view_sheet ?? '',
        face_closeup: c.face_closeup ?? '',
      }
    }
    await nextTick()
    isDirty.value = false
  }
})

async function handleSave() {
  saving.value = true
  try {
    await characterStore.updateCharacter(characterId, { ...character.value })
    isDirty.value = false
    toast.success('角色信息已保存')
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

function goBack() {
  const nid = characterStore.currentCharacter?.novel_id
  nid ? router.push(`/novel/${nid}?tab=characters`) : router.back()
}

async function autoSaveIfDirty() {
  if (!isDirty.value) return
  await characterStore.updateCharacter(characterId, { ...character.value })
  isDirty.value = false
}

async function handleGenerateThreeView() {
  if (!character.value.description && !character.value.visual_prompt) {
    toast.error('请先填写角色描述或视觉提示词，再生成三视图')
    return
  }
  try { await autoSaveIfDirty() } catch (e: any) {
    toast.error('自动保存失败，请手动保存后再生成：' + (e.message || ''))
    return
  }
  generatingThreeView.value = true
  threeViewTaskStatus.value = 'pending'
  clearThreeViewTimer()
  try {
    const api = useCharacterApi()
    const res = await api.generateThreeView(characterId, novelImageStyle.value, selectedImageProvider.value || undefined)
    const taskId = (res as any).data?.task_id ?? ''
    if (!taskId) throw new Error('未获取到任务 ID')
    threeViewTaskId.value = taskId
    toast.info('三视图生成任务已提交，AI 正在生成中…')
    threeViewTaskTimer = setInterval(async () => {
      try {
        const pollRes = await useTaskApi().getTask(threeViewTaskId.value)
        const task = pollRes.data
        threeViewTaskStatus.value = task.status as any
        if (task.status === 'completed') {
          clearThreeViewTimer()
          generatingThreeView.value = false
          const updatedChar = (task.data?.character ?? task.character) as any
          const newUrl = updatedChar?.three_view_sheet
          if (newUrl && newUrl !== character.value.three_view_sheet) {
            previewLightbox(newUrl, character.value.three_view_sheet, (confirmed) => {
              character.value.three_view_sheet = confirmed
              isDirty.value = true
            })
          } else if (newUrl) {
            character.value.three_view_sheet = newUrl
          }
          isDirty.value = false
          toast.success('三视图生成完成，请确认后保存')
        } else if (task.status === 'failed') {
          clearThreeViewTimer()
          generatingThreeView.value = false
          toast.error('生成失败：' + (task.error || '未知错误'))
        }
      } catch { /* ignore */ }
    }, 3000)
  } catch (e: any) {
    clearThreeViewTimer()
    generatingThreeView.value = false
    threeViewTaskStatus.value = 'failed'
    toast.error('生成失败：' + (e.message || ''))
  }
}

async function handleGenerateFaceCloseup() {
  if (!character.value.description && !character.value.visual_prompt) {
    toast.error('请先填写角色描述或视觉提示词，再生成面部特写')
    return
  }
  try { await autoSaveIfDirty() } catch (e: any) {
    toast.error('自动保存失败，请手动保存后再生成：' + (e.message || ''))
    return
  }
  generatingFaceCloseup.value = true
  faceCloseupTaskStatus.value = 'pending'
  clearFaceCloseupTimer()
  try {
    const api = useCharacterApi()
    const res = await api.generateFaceCloseup(characterId, novelImageStyle.value, selectedImageProvider.value || undefined)
    const taskId = (res as any).data?.task_id ?? ''
    if (!taskId) throw new Error('未获取到任务 ID')
    faceCloseupTaskId.value = taskId
    toast.info('面部特写生成任务已提交，AI 正在生成中…')
    faceCloseupTaskTimer = setInterval(async () => {
      try {
        const pollRes = await useTaskApi().getTask(faceCloseupTaskId.value)
        const task = pollRes.data
        faceCloseupTaskStatus.value = task.status as any
        if (task.status === 'completed') {
          clearFaceCloseupTimer()
          generatingFaceCloseup.value = false
          const updatedChar = (task.data?.character ?? task.character) as any
          const newUrl = updatedChar?.face_closeup
          if (newUrl && newUrl !== character.value.face_closeup) {
            previewLightbox(newUrl, character.value.face_closeup, (confirmed) => {
              character.value.face_closeup = confirmed
              isDirty.value = true
            })
          } else if (newUrl) {
            character.value.face_closeup = newUrl
          }
          isDirty.value = false
          toast.success('面部特写生成完成，请确认后保存')
        } else if (task.status === 'failed') {
          clearFaceCloseupTimer()
          generatingFaceCloseup.value = false
          toast.error('生成失败：' + (task.error || '未知错误'))
        }
      } catch { /* ignore */ }
    }, 3000)
  } catch (e: any) {
    clearFaceCloseupTimer()
    generatingFaceCloseup.value = false
    faceCloseupTaskStatus.value = 'failed'
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

    <!-- 角色档案 Tab -->
    <div v-if="activeTab === 'profile'" class="card p-6 space-y-6">
      <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">基本信息</h3>
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
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">角色描述</label>
        <p class="text-xs text-gray-400 dark:text-gray-500 mb-2">包含外貌、性格、背景故事、说话风格等所有描述性信息</p>
        <textarea v-model="character.description" rows="10" class="input" placeholder="描述角色的外貌特征、性格特点、背景故事、说话方式…"></textarea>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">视觉提示词（英文）</label>
        <p class="text-xs text-gray-400 dark:text-gray-500 mb-2">供 AI 图像生成使用的英文提示词，由 AI 分析自动填写，也可手动编辑</p>
        <textarea v-model="character.visual_prompt" rows="4" class="input font-mono text-xs" placeholder="e.g. young woman, long silver hair, blue eyes, traditional hanfu, elegant posture..."></textarea>
      </div>
    </div>

    <!-- 图像资产 Tab -->
    <div v-if="activeTab === 'images'" class="card p-6">
      <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-6">图像资产</h3>
      <div class="space-y-8">
        <!-- Portrait -->
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">头像 / 肖像参考图片</label>
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-3">上传后将作为 AI 生成三视图时的参考，保持人物面部一致性</p>
          <div class="w-32">
            <ImageUploadBox
              v-model="character.portrait"
              placeholder="点击上传"
              @error="(msg) => toast.error('上传失败：' + msg)"
            />
          </div>
        </div>

        <!-- Three-view + Face closeup side by side -->
        <div class="border-t border-gray-200 dark:border-gray-700 pt-6">
          <!-- column ratio 76:24 ≈ 256:81 so that 16:9 and 9:16 boxes share the same row height -->
          <div class="grid gap-6" style="grid-template-columns: 76fr 24fr">
            <!-- Three-view sheet -->
            <div>
              <div class="flex items-center justify-between mb-3">
                <div>
                  <h4 class="text-sm font-medium text-gray-900 dark:text-white">三视图参考图</h4>
                  <p class="text-xs text-gray-500 mt-0.5">正视 / 侧视 / 背视合为一张图</p>
                </div>
                <button
                  class="btn-primary text-xs px-3 h-8 flex items-center gap-1"
                  :disabled="generatingThreeView"
                  @click="handleGenerateThreeView"
                >
                  <svg v-if="generatingThreeView" class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {{ generatingThreeView ? '生成中...' : 'AI 生成' }}
                </button>
              </div>
              <div class="relative">
                <ImageUploadBox
                  v-model="character.three_view_sheet"
                  aspect-ratio="16/9"
                  placeholder="三视图参考图（正面+侧面+背面合图）"
                  :on-save="(url: string) => { character.three_view_sheet = url; isDirty = true }"
                  @error="toast.error"
                />
                <div v-if="generatingThreeView" class="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg z-10">
                  <div class="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin"></div>
                </div>
              </div>
              <div v-if="threeViewTaskStatus !== 'idle'" class="mt-2 text-xs">
                <span v-if="threeViewTaskStatus === 'pending' || threeViewTaskStatus === 'running'" class="text-blue-500 flex items-center gap-1">
                  <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                  AI 正在生成，请稍候…
                </span>
                <span v-else-if="threeViewTaskStatus === 'completed'" class="text-green-500">生成完成</span>
                <span v-else-if="threeViewTaskStatus === 'failed'" class="text-red-500">生成失败，请重试</span>
              </div>
            </div>

            <!-- Face closeup -->
            <div>
              <div class="flex items-center justify-between mb-3">
                <div>
                  <h4 class="text-sm font-medium text-gray-900 dark:text-white">面部特写</h4>
                  <p class="text-xs text-gray-500 mt-0.5">头部特写，展示五官细节</p>
                </div>
                <button
                  class="btn-primary text-xs px-3 h-8 flex items-center gap-1"
                  :disabled="generatingFaceCloseup"
                  @click="handleGenerateFaceCloseup"
                >
                  <svg v-if="generatingFaceCloseup" class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {{ generatingFaceCloseup ? '生成中...' : 'AI 生成' }}
                </button>
              </div>
              <div class="relative">
                <ImageUploadBox
                  v-model="character.face_closeup"
                  aspect-ratio="9/16"
                  placeholder="面部特写图"
                  :on-save="(url: string) => { character.face_closeup = url; isDirty = true }"
                  @error="toast.error"
                />
                <div v-if="generatingFaceCloseup" class="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg z-10">
                  <div class="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin"></div>
                </div>
              </div>
              <div v-if="faceCloseupTaskStatus !== 'idle'" class="mt-2 text-xs">
                <span v-if="faceCloseupTaskStatus === 'pending' || faceCloseupTaskStatus === 'running'" class="text-blue-500 flex items-center gap-1">
                  <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                  AI 正在生成，请稍候…
                </span>
                <span v-else-if="faceCloseupTaskStatus === 'completed'" class="text-green-500">生成完成</span>
                <span v-else-if="faceCloseupTaskStatus === 'failed'" class="text-red-500">生成失败，请重试</span>
              </div>
            </div>
          </div>
        </div>
        <p class="text-xs text-gray-500">需填写「角色描述」或「视觉提示词」，AI 才能生成准确的图像。生成后点击「保存」即可保留。</p>
      </div>
    </div>

    <!-- 配音设置 Tab -->
    <div v-if="activeTab === 'voice'" class="card p-6">
      <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">配音设置</h3>
      <p class="text-sm text-gray-500 mb-4">为角色选择专属声音，生成分镜配音时将自动使用此配置。</p>
      <CharacterVoicePanel
        v-if="characterStore.currentCharacter"
        :character="characterStore.currentCharacter"
        @update="(data) => characterStore.patchCurrentCharacter(data)"
      />
    </div>
  </div>
</template>
