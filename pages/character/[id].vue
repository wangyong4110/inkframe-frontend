<script setup lang="ts">
import type { CharacterLook, CreateCharacterLookForm } from '~/types'

const characterStore = useCharacterStore()
const novelStore = useNovelStore()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { url: lightboxUrl } = useImageLightbox()
const { editImage } = useImageEditApi()
const { guardAiProvider } = useAiProviderGuard()
const characterApi = useCharacterApi()

const novelId = parseInt(route.params.novelId as string)
const characterId = parseInt(route.params.id as string)
if (isNaN(characterId)) {
  await navigateTo('/novel')
}

const activeTab = ref('profile')
const saving = ref(false)
const reanalyzing = ref(false)
const voicePanelRef = ref<{ getVoiceData: () => Record<string, unknown> } | null>(null)
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
  gender: '' as string,
  age: '' as string,
  description: '',       // 统一描述：外貌、性格、背景、说话风格等
  visual_prompt: '',     // 英文图像生成提示词
  portrait: '',
  three_view_sheet: '',
  face_closeup: '',
})

const tabs = [
  { key: 'profile', label: '角色档案' },
  { key: 'images', label: '视觉设计' },
  { key: 'voice', label: '配音设置' },
  { key: 'looks', label: '形象管理' },
]

// ── 形象管理状态 ────────────────────────────────────────────────────────────────
const looks = ref<CharacterLook[]>([])
const loadingLooks = ref(false)
const showLookForm = ref(false)
const editingLook = ref<CharacterLook | null>(null)
const generatingLookPrompt = ref(false)
const generatingLookImage = ref<number | null>(null) // look id being generated
const lookForm = ref<CreateCharacterLookForm & { visual_prompt?: string }>({
  label: '',
  chapter_from: 1,
  chapter_to: 0,
  is_default: false,
  sort_order: 0,
  description: '',
  visual_prompt: '',
})

async function fetchLooks() {
  if (!characterId) return
  loadingLooks.value = true
  try {
    const res = await characterApi.listLooks(characterId)
    looks.value = (res as any)?.data?.looks ?? (res as any)?.looks ?? []
  } catch (e: any) {
    toast.error('加载形象列表失败：' + (e.message || ''))
  } finally {
    loadingLooks.value = false
  }
}

function openLookForm(look?: CharacterLook) {
  if (look) {
    editingLook.value = look
    lookForm.value = {
      label: look.label,
      chapter_from: look.chapter_from,
      chapter_to: look.chapter_to,
      is_default: look.is_default,
      sort_order: look.sort_order,
      description: look.description ?? '',
      visual_prompt: look.visual_prompt ?? '',
    }
  } else {
    editingLook.value = null
    lookForm.value = { label: '', chapter_from: 1, chapter_to: 0, is_default: false, sort_order: 0, description: '', visual_prompt: '' }
  }
  showLookForm.value = true
}

async function handleGenerateLookPrompt() {
  if (!lookForm.value.description) {
    toast.error('请先填写外观描述')
    return
  }
  if (!await guardAiProvider('LLM')) return
  generatingLookPrompt.value = true
  try {
    const res = await characterApi.generateLookPrompt(characterId, lookForm.value.description)
    const prompt = (res as any)?.data?.visual_prompt ?? (res as any)?.visual_prompt ?? ''
    lookForm.value.visual_prompt = prompt
    toast.success('视觉提示词已生成')
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || ''))
  } finally {
    generatingLookPrompt.value = false
  }
}

async function handleSaveLook() {
  if (!lookForm.value.label) {
    toast.error('请填写形象名称')
    return
  }
  try {
    if (editingLook.value) {
      const updateData: Record<string, unknown> = {
        label: lookForm.value.label,
        chapter_from: lookForm.value.chapter_from,
        chapter_to: lookForm.value.chapter_to,
        is_default: lookForm.value.is_default,
        sort_order: lookForm.value.sort_order,
        description: lookForm.value.description,
        visual_prompt: lookForm.value.visual_prompt,
      }
      await characterApi.updateLook(characterId, editingLook.value.id, updateData)
      toast.success('形象已更新')
    } else {
      await characterApi.createLook(characterId, lookForm.value)
      toast.success('形象已创建')
    }
    showLookForm.value = false
    await fetchLooks()
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || ''))
  }
}

async function handleDeleteLook(look: CharacterLook) {
  if (!confirm(`确认删除形象「${look.label}」？`)) return
  try {
    await characterApi.deleteLook(characterId, look.id)
    toast.success('形象已删除')
    await fetchLooks()
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || ''))
  }
}

async function handleGenerateLookImage(look: CharacterLook, type: 'three_view' | 'face_closeup') {
  if (!await guardAiProvider('IMAGE')) return
  generatingLookImage.value = look.id
  try {
    await characterApi.generateLookImages(characterId, look.id, type, selectedImageProvider.value || undefined)
    toast.success('图像生成完成')
    await fetchLooks()
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || ''))
  } finally {
    generatingLookImage.value = null
  }
}

const uploadingLookImage = ref<number | null>(null) // look id being uploaded
const lookImageFileInput = ref<HTMLInputElement | null>(null)
const pendingLookUpload = ref<{ look: CharacterLook; type: 'portrait' | 'three_view' | 'face_closeup' } | null>(null)

function triggerLookUpload(look: CharacterLook, type: 'portrait' | 'three_view' | 'face_closeup') {
  pendingLookUpload.value = { look, type }
  lookImageFileInput.value?.click()
}

async function handleLookImageUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file || !pendingLookUpload.value) return
  const { look, type } = pendingLookUpload.value
  uploadingLookImage.value = look.id
  try {
    await characterApi.uploadLookImage(characterId, look.id, file, type)
    toast.success('图片已上传')
    await fetchLooks()
  } catch (err: any) {
    toast.error('上传失败：' + (err.message || ''))
  } finally {
    uploadingLookImage.value = null
    pendingLookUpload.value = null
    if (lookImageFileInput.value) lookImageFileInput.value.value = ''
  }
}

watch(activeTab, (val) => {
  if (val === 'looks' && looks.value.length === 0) fetchLooks()
})

useUnsavedGuard(isDirty, '角色信息有未保存的修改，确认离开？')

watch(character, () => { isDirty.value = true }, { deep: true })

onMounted(async () => {
  if (!characterId) return
  try {
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
        gender: (c as any).gender ?? '',
        age: (c as any).age ?? '',
        description: c.description ?? '',
        visual_prompt: (c as any).visual_prompt ?? '',
        portrait: c.portrait ?? '',
        three_view_sheet: c.three_view_sheet ?? '',
        face_closeup: c.face_closeup ?? '',
      }
    }
    await nextTick()
    isDirty.value = false
  } catch (e: any) {
    toast.error('角色加载失败：' + (e.message || '请检查网络或刷新页面'))
  }
})

async function handleSave() {
  saving.value = true
  try {
    const voiceData = voicePanelRef.value?.getVoiceData?.() ?? {}
    await characterStore.updateCharacter(characterId, { ...character.value, ...voiceData })
    isDirty.value = false
    toast.success('角色信息已保存')
  } catch (e: any) {
    toast.error('保存失败：' + (e.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

async function handleReanalyze() {
  reanalyzing.value = true
  try {
    const res = await characterApi.reanalyzeCharacter(characterId)
    if (res.data) {
      const d = res.data as any
      character.value.description = d.description ?? character.value.description
      character.value.visual_prompt = d.visual_prompt ?? character.value.visual_prompt
      character.value.gender = d.gender ?? character.value.gender
      character.value.age = d.age ?? character.value.age
      // 同步配音字段到 store，让配音设置 tab 实时反映 AI 推荐结果
      characterStore.patchCurrentCharacter({
        voice_id: d.voice_id,
        voice_style: d.voice_style,
        voice_language: d.voice_language,
        voice_speed: d.voice_speed,
      })
      isDirty.value = false
      toast.success('角色信息已重新分析')
    }
  } catch (e: any) {
    toast.error('重新分析失败：' + (e.message || ''))
  } finally {
    reanalyzing.value = false
  }
}

function goBack() {
  const from = route.query.from as string | undefined
  if (from) { router.push(decodeURIComponent(from)); return }
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
  if (!await guardAiProvider('IMAGE')) return
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
          if (newUrl) {
            character.value.three_view_sheet = newUrl
            await nextTick()
            isDirty.value = false
          }
          toast.success('三视图生成完成')
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
  if (!await guardAiProvider('IMAGE')) return
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
          if (newUrl) {
            character.value.face_closeup = newUrl
            character.value.portrait = newUrl
            await nextTick()
            isDirty.value = false
          }
          toast.success('面部特写生成完成')
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
          <div class="flex items-center gap-2">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ character.name || '加载中...' }}
            </h1>
            <span class="px-2 py-0.5 text-xs font-medium rounded-full" :class="getRoleColor(character.role)">
              {{ getRoleLabel(character.role) }}
            </span>
          </div>
          <p class="text-sm text-gray-500 dark:text-gray-400">角色编辑器</p>
        </div>
      </div>
      <div class="flex items-center space-x-2">
        <button class="btn-secondary" :disabled="reanalyzing || saving" @click="handleReanalyze">
          {{ reanalyzing ? '分析中...' : '重新分析' }}
        </button>
        <button class="btn-primary" :disabled="saving || reanalyzing" @click="handleSave">
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
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">性别</label>
          <select v-model="character.gender" class="input">
            <option value="">未设置</option>
            <option value="male">男</option>
            <option value="female">女</option>
            <option value="neutral">中性</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">年龄</label>
          <input v-model="character.age" type="text" class="input" placeholder="如：16 / 约25岁 / 少年 / 中年" />
        </div>
      </div>

      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">角色描述</label>
        <p class="text-xs text-gray-400 dark:text-gray-500 mb-2">包含外貌、性格、背景故事、说话风格等所有描述性信息</p>
        <textarea v-model="character.description" rows="10" class="input" placeholder="描述角色的外貌特征、性格特点、背景故事、说话方式…"></textarea>
      </div>

    </div>

    <!-- 视觉设计 Tab -->
    <div v-if="activeTab === 'images'" class="card p-6 space-y-6">
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">视觉提示词</label>
        <p class="text-xs text-gray-400 dark:text-gray-500 mb-2">供 AI 图像生成使用的提示词，由 AI 分析自动填写，也可手动编辑</p>
        <textarea v-model="character.visual_prompt" rows="4" class="input font-mono text-xs" placeholder="e.g. young woman, long silver hair, blue eyes, traditional hanfu, elegant posture..."></textarea>
      </div>
      <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">图像资产</h3>
      <!-- column ratio 24:76 so that 9:16 and 16:9 boxes share the same row height -->
      <div class="grid gap-6" style="grid-template-columns: 24fr 76fr">
        <!-- Face closeup (LEFT, 9:16) — also used as portrait/avatar -->
        <div>
          <div class="flex items-center justify-between mb-3">
            <div>
              <h4 class="text-sm font-medium text-gray-900 dark:text-white">面部特写</h4>
              <p class="text-xs text-gray-500 mt-0.5">头部特写，同时用作角色头像</p>
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
              :on-refine="(s: string) => editImage(lightboxUrl.value, s, novelStore.currentNovel?.id)"
              :on-save="(url: string) => { character.face_closeup = url; character.portrait = url; isDirty = true }"
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

        <!-- Three-view sheet (RIGHT, 16:9) -->
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
              :on-refine="(s: string) => editImage(lightboxUrl.value, s, novelStore.currentNovel?.id)"
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
      </div>
      <p class="text-xs text-gray-500 mt-4">需填写「角色描述」或「视觉提示词」，AI 才能生成准确的图像。</p>
    </div>

    <!-- 配音设置 Tab -->
    <div v-if="activeTab === 'voice'" class="card p-6">
      <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">配音设置</h3>
      <p class="text-sm text-gray-500 mb-4">为角色选择专属声音，生成分镜配音时将自动使用此配置。</p>
      <CharacterVoicePanel
        v-if="characterStore.currentCharacter"
        ref="voicePanelRef"
        :character="characterStore.currentCharacter"
        @update="(data) => characterStore.patchCurrentCharacter(data)"
      />
    </div>

    <!-- 形象管理 Tab -->
    <div v-if="activeTab === 'looks'" class="space-y-4">
      <!-- 顶部操作栏 -->
      <div class="flex items-center justify-between">
        <div>
          <h3 class="text-base font-semibold text-gray-800 dark:text-gray-100">角色形象时间线</h3>
          <p class="text-sm text-gray-500 mt-0.5">管理角色在不同章节区间的外观形象，生成分镜图像时自动匹配当前章节对应的形象。</p>
        </div>
        <button class="btn-primary text-sm" @click="openLookForm()">+ 新建形象</button>
      </div>

      <!-- 空状态 -->
      <div v-if="loadingLooks" class="text-center text-gray-400 py-12">加载中…</div>
      <div v-else-if="looks.length === 0" class="card p-8 text-center text-gray-400">
        <p class="text-4xl mb-3">🎭</p>
        <p class="font-medium">暂无形象</p>
        <p class="text-sm mt-1">点击「新建形象」为角色创建不同时期的外观版本</p>
      </div>

      <!-- 形象列表（时间线视图） -->
      <div v-else class="space-y-3">
        <div
          v-for="look in looks"
          :key="look.id"
          class="card p-4"
        >
          <div class="flex gap-4 items-start">
            <!-- 头像上传区（点击上传 portrait） -->
            <div
              class="w-24 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center cursor-pointer relative group border-2 border-dashed border-transparent hover:border-primary-400 transition-colors"
              title="点击上传头像"
              @click="triggerLookUpload(look, 'portrait')"
            >
              <img
                v-if="look.portrait || look.face_closeup"
                :src="look.portrait || look.face_closeup"
                class="w-full h-full object-cover"
              />
              <div v-else class="flex flex-col items-center gap-1 text-gray-300">
                <svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4" />
                </svg>
                <span class="text-xs">头像</span>
              </div>
              <!-- hover overlay -->
              <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-lg">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <!-- uploading spinner -->
              <div v-if="uploadingLookImage === look.id && pendingLookUpload?.type === 'portrait'" class="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg">
                <div class="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              </div>
            </div>

            <!-- 信息区 -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-semibold text-gray-800 dark:text-gray-100">{{ look.label }}</span>
                <span v-if="look.is_default" class="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-0.5 rounded-full">默认</span>
                <span class="text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full">
                  第 {{ look.chapter_from }} 章
                  {{ look.chapter_to > 0 ? `— 第 ${look.chapter_to} 章` : '起（无限延伸）' }}
                </span>
              </div>
              <p v-if="look.description" class="text-sm text-gray-500 mt-1 line-clamp-2">{{ look.description }}</p>
              <p v-if="look.visual_prompt" class="text-xs text-gray-400 mt-1 line-clamp-1 font-mono">{{ look.visual_prompt }}</p>

              <!-- 操作按钮 -->
              <div class="flex gap-2 mt-2 flex-wrap">
                <button
                  class="btn-secondary text-xs py-1 px-2"
                  :disabled="generatingLookImage === look.id || uploadingLookImage === look.id"
                  @click="handleGenerateLookImage(look, 'face_closeup')"
                >
                  {{ generatingLookImage === look.id ? '生成中…' : 'AI 生成头像' }}
                </button>
                <button
                  class="btn-secondary text-xs py-1 px-2"
                  :disabled="generatingLookImage === look.id || uploadingLookImage === look.id"
                  @click="handleGenerateLookImage(look, 'three_view')"
                >
                  {{ generatingLookImage === look.id ? '生成中…' : 'AI 三视图' }}
                </button>
                <button class="btn-secondary text-xs py-1 px-2" @click="openLookForm(look)">编辑</button>
                <button class="text-xs text-red-500 hover:text-red-700 py-1 px-2" @click="handleDeleteLook(look)">删除</button>
              </div>
            </div>

            <!-- 三视图上传区（点击上传 three_view） -->
            <div
              class="w-36 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700 cursor-pointer relative group border-2 border-dashed border-transparent hover:border-primary-400 transition-colors"
              style="aspect-ratio: 16/9"
              title="点击上传三视图"
              @click="triggerLookUpload(look, 'three_view')"
            >
              <img v-if="look.three_view_sheet" :src="look.three_view_sheet" class="w-full h-full object-cover" />
              <div v-else class="absolute inset-0 flex flex-col items-center justify-center gap-1 text-gray-300">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 4v16m8-8H4" />
                </svg>
                <span class="text-xs">三视图</span>
              </div>
              <!-- hover overlay -->
              <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <svg class="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <!-- uploading spinner -->
              <div v-if="uploadingLookImage === look.id && pendingLookUpload?.type === 'three_view'" class="absolute inset-0 bg-black/50 flex items-center justify-center">
                <div class="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 新建/编辑形象弹窗 -->
      <div v-if="showLookForm" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="showLookForm = false" />
        <div class="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4">
          <h3 class="font-semibold text-gray-800 dark:text-gray-100 text-lg">
            {{ editingLook ? '编辑形象' : '新建形象' }}
          </h3>

          <!-- 形象名称 -->
          <div>
            <label class="label">形象名称 <span class="text-red-500">*</span></label>
            <input v-model="lookForm.label" class="input" placeholder="如：少年时期、伪装成书生、觉醒后" />
          </div>

          <!-- 章节范围 -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">起始章节</label>
              <input v-model.number="lookForm.chapter_from" type="number" min="1" class="input" placeholder="1" />
            </div>
            <div>
              <label class="label">结束章节（0=无限）</label>
              <input v-model.number="lookForm.chapter_to" type="number" min="0" class="input" placeholder="0" />
            </div>
          </div>

          <!-- 默认形象 -->
          <label class="flex items-center gap-2 cursor-pointer">
            <input v-model="lookForm.is_default" type="checkbox" class="rounded" />
            <span class="text-sm text-gray-700 dark:text-gray-300">设为默认形象（无章节匹配时使用）</span>
          </label>

          <!-- 外观描述 -->
          <div>
            <label class="label">外观描述（中文）</label>
            <textarea
              v-model="lookForm.description"
              class="input h-20 resize-none"
              placeholder="描述该时期的外貌特征，如服装、发型、特殊标志等"
            />
          </div>

          <!-- 视觉提示词 -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="label mb-0">AI 图像提示词（英文）</label>
              <button
                class="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                :disabled="generatingLookPrompt || !lookForm.description"
                @click="handleGenerateLookPrompt"
              >
                {{ generatingLookPrompt ? '生成中…' : '✨ AI 生成' }}
              </button>
            </div>
            <textarea
              v-model="lookForm.visual_prompt"
              class="input h-20 resize-none font-mono text-xs"
              placeholder="English visual prompt for AI image generation…"
            />
          </div>

          <!-- 操作按钮 -->
          <div class="flex justify-end gap-3 pt-2">
            <button class="btn-secondary" @click="showLookForm = false">取消</button>
            <button class="btn-primary" @click="handleSaveLook">保存</button>
          </div>
        </div>
      </div>

      <!-- 隐藏文件输入（形象图片上传） -->
      <input
        ref="lookImageFileInput"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        class="hidden"
        @change="handleLookImageUpload"
      />
    </div>
  </div>
</template>
