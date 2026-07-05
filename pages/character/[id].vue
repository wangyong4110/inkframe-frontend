<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import type { CharacterLook, CreateCharacterLookForm } from '~/types'

const characterStore = useCharacterStore()
const novelStore = useNovelStore()
const taskStore = useTaskStore()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { guardAiProvider } = useAiProviderGuard()
const characterApi = useCharacterApi()
const { editImage } = useImageEditApi()

const novelId = parseInt(route.params.novelId as string)
const characterId = parseInt(route.params.id as string)
if (isNaN(characterId)) {
  await navigateTo('/novel')
}

const validTabs = ['profile', 'voice', 'looks']
const initialTab = validTabs.includes(route.query.tab as string) ? (route.query.tab as string) : 'profile'
const activeTab = ref(initialTab)
const saving = ref(false)
const saveStatus = ref<'' | 'saving' | 'saved' | 'error'>('')
const reanalyzing = ref(false)
const voicePanelRef = ref<{ getVoiceData: () => Record<string, unknown> } | null>(null)
const isDirty = ref(false)
const dataLoaded = ref(false)
const novelImageStyle = computed(() => novelStore.currentNovel?.image_style || 'anime')
const selectedImageProvider = computed(() => novelStore.currentNovel?.image_model || '')

const character = ref({
  name: '',
  role: 'protagonist' as string,
  gender: '' as string,
  age: '' as string,
  description: '',
  default_look_id: 0 as number | undefined,
})

const tabs = [
  { key: 'profile', label: '角色档案' },
  { key: 'voice', label: '配音设置' },
  { key: 'looks', label: '形象管理' },
]

// ── 形象管理状态 ────────────────────────────────────────────────────────────────
const looks = ref<CharacterLook[]>([])
const sortedLooks = computed(() => {
  const defaultId = character.value?.default_look_id
  if (!defaultId) return looks.value
  return [...looks.value].sort((a, b) => {
    if (a.id === defaultId) return -1
    if (b.id === defaultId) return 1
    return 0
  })
})
const loadingLooks = ref(false)
const showLookForm = ref(false)
const editingLook = ref<CharacterLook | null>(null)
const generatingLookPrompt = ref(false)
const generatingLookImage = ref<number | null>(null) // look id being generated
const generatingFormThreeView = ref(false)
const generatingFormPortrait = ref(false)
const lookForm = ref<CreateCharacterLookForm & { visual_prompt?: string; three_view_sheet?: string; portrait?: string }>({
  label: '',
  chapter_from: 1,
  chapter_to: 0,
  set_as_default: false,
  sort_order: 0,
  description: '',
  visual_prompt: '',
  three_view_sheet: '',
  portrait: '',
})

const showCropModal = ref(false)
const cropSourceUrl = computed(() => lookForm.value.three_view_sheet || '')

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
      set_as_default: false,
      sort_order: look.sort_order,
      description: look.description ?? '',
      visual_prompt: look.visual_prompt ?? '',
      three_view_sheet: look.three_view_sheet ?? '',
      portrait: look.portrait ?? '',
    }
  } else {
    editingLook.value = null
    lookForm.value = {
      label: '',
      chapter_from: 1,
      chapter_to: 0,
      set_as_default: false,
      sort_order: 0,
      description: character.value?.description ?? '',
      visual_prompt: '',
    }
  }
  showLookForm.value = true
}

async function handleGenerateLookPrompt() {
  if (!await guardAiProvider('LLM')) return
  generatingLookPrompt.value = true
  try {
    // look.description 通常为空；fallback 到角色基础描述，确保 AI 有足够输入
    const descriptionInput = lookForm.value.description || character.value?.description || ''
    const res = await characterApi.generateLookPrompt(characterId, descriptionInput)
    const taskId = (res as any)?.data?.task_id ?? ''
    if (!taskId) { toast.error('生成失败：未获取到任务ID'); generatingLookPrompt.value = false; return }
    taskStore.trackTask(taskId, (task) => {
      generatingLookPrompt.value = false
      if (task.status === 'completed') {
        lookForm.value.visual_prompt = (task.data?.visual_prompt as string) ?? ''
        toast.success('视觉提示词已生成')
      } else if (task.status === 'failed') {
        toast.error('生成失败：' + (task.error || '未知错误'))
      }
    })
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || ''))
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
        set_as_default: lookForm.value.set_as_default,
        sort_order: lookForm.value.sort_order,
        description: lookForm.value.description,
        visual_prompt: lookForm.value.visual_prompt,
        three_view_sheet: lookForm.value.three_view_sheet,
        portrait: lookForm.value.portrait,
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

const copyingLookId = ref<number | null>(null)

async function handleCopyLook(look: CharacterLook) {
  copyingLookId.value = look.id
  try {
    await characterApi.createLook(characterId, {
      label: look.label + ' 副本',
      chapter_from: look.chapter_from,
      chapter_to: look.chapter_to,
      sort_order: look.sort_order,
      description: look.description ?? '',
      visual_prompt: look.visual_prompt ?? '',
      three_view_sheet: look.three_view_sheet ?? '',
      portrait: look.portrait ?? '',
    })
    toast.success('形象已复制')
    await fetchLooks()
  } catch (e: any) {
    toast.error('复制失败：' + (e.message || ''))
  } finally {
    copyingLookId.value = null
  }
}

async function handleDeleteLook(look: CharacterLook) {
  if (looks.value.length <= 1) {
    toast.error('角色至少需要保留一个形象')
    return
  }
  if (!confirm(`确认删除形象「${look.label}」？此操作不可撤销。`)) return
  try {
    await characterApi.deleteLook(characterId, look.id)
    toast.success('形象已删除')
    await fetchLooks()
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || ''))
  }
}

const settingDefaultLookId = ref<number | null>(null)

async function handleSetDefaultLook(look: CharacterLook) {
  if (character.value?.default_look_id === look.id) return
  settingDefaultLookId.value = look.id
  try {
    await characterApi.setDefaultLook(characterId, look.id)
    // 本地更新 character.default_look_id，避免重新拉取整个角色
    if (character.value) character.value.default_look_id = look.id
    toast.success(`「${look.label}」已设为默认形象`)
  } catch (e: any) {
    toast.error('设置失败：' + (e.message || ''))
  } finally {
    settingDefaultLookId.value = null
  }
}

async function handleDeleteLookFromForm() {
  if (!editingLook.value) return
  if (looks.value.length <= 1) {
    toast.error('角色至少需要保留一个形象')
    return
  }
  if (!confirm(`确认删除形象「${editingLook.value.label}」？此操作不可撤销。`)) return
  try {
    await characterApi.deleteLook(characterId, editingLook.value.id)
    toast.success('形象已删除')
    showLookForm.value = false
    await fetchLooks()
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || ''))
  }
}

async function handleFormGeneratePortrait() {
  if (!editingLook.value) return
  if (!await guardAiProvider('IMAGE')) return
  generatingFormPortrait.value = true
  try {
    const res = await characterApi.generateLookImages(characterId, editingLook.value.id, 'portrait', selectedImageProvider.value || undefined)
    const taskId = (res as any)?.data?.task_id ?? ''
    if (!taskId) { toast.error('生成失败：未获取到任务ID'); generatingFormPortrait.value = false; return }
    taskStore.trackTask(taskId, async (task) => {
      generatingFormPortrait.value = false
      if (task.status === 'completed') {
        await fetchLooks()
        const updated = looks.value.find(l => l.id === editingLook.value!.id)
        if (updated?.portrait) lookForm.value.portrait = updated.portrait
        toast.success('面部参考图已生成，可继续生成三视图')
      } else if (task.status === 'failed') {
        toast.error('生成失败：' + (task.error || '未知错误'))
      }
    })
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || ''))
    generatingFormPortrait.value = false
  }
}

async function handleFormGenerateThreeView() {
  if (!editingLook.value) return
  if (!await guardAiProvider('IMAGE')) return
  generatingFormThreeView.value = true
  try {
    const res = await characterApi.generateLookImages(characterId, editingLook.value.id, 'three_view', selectedImageProvider.value || undefined)
    const taskId = (res as any)?.data?.task_id ?? ''
    if (!taskId) { toast.error('生成失败：未获取到任务ID'); generatingFormThreeView.value = false; return }
    taskStore.trackTask(taskId, async (task) => {
      generatingFormThreeView.value = false
      if (task.status === 'completed') {
        await fetchLooks()
        const updated = looks.value.find(l => l.id === editingLook.value!.id)
        if (updated?.three_view_sheet) lookForm.value.three_view_sheet = updated.three_view_sheet
        toast.success('三视图已生成')
      } else if (task.status === 'failed') {
        toast.error('生成失败：' + (task.error || '未知错误'))
      }
    })
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || ''))
    generatingFormThreeView.value = false
  }
}

async function handleGenerateLookImage(look: CharacterLook, type: 'three_view') {
  if (!await guardAiProvider('IMAGE')) return
  generatingLookImage.value = look.id
  try {
    const res = await characterApi.generateLookImages(characterId, look.id, type, selectedImageProvider.value || undefined)
    const taskId = (res as any)?.data?.task_id ?? ''
    if (!taskId) { toast.error('生成失败：未获取到任务ID'); generatingLookImage.value = null; return }
    taskStore.trackTask(taskId, async (task) => {
      generatingLookImage.value = null
      if (task.status === 'completed') {
        await fetchLooks()
        toast.success('图像生成完成')
      } else if (task.status === 'failed') {
        toast.error('生成失败：' + (task.error || '未知错误'))
      }
    })
  } catch (e: any) {
    toast.error('生成失败：' + (e.message || ''))
    generatingLookImage.value = null
  }
}

const uploadingLookImage = ref<number | null>(null) // look id being uploaded
const lookImageFileInput = ref<HTMLInputElement | null>(null)
const pendingLookUpload = ref<{ look: CharacterLook; type: 'portrait' | 'three_view' } | null>(null)

function triggerLookUpload(look: CharacterLook, type: 'portrait' | 'three_view') {
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
  router.replace({ query: { ...route.query, tab: val } })
  if (val === 'looks' && looks.value.length === 0) fetchLooks()
})

useUnsavedGuard(isDirty, '角色信息有未保存的修改，确认离开？')

watch(character, () => {
  if (!dataLoaded.value) return
  isDirty.value = true
  debouncedSave()
}, { deep: true })

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
        default_look_id: c.default_look_id ?? 0,
      }
    }
    await nextTick()
    isDirty.value = false
    dataLoaded.value = true
    if (activeTab.value === 'looks') fetchLooks()
  } catch (e: any) {
    toast.error('角色加载失败：' + (e.message || '请检查网络或刷新页面'))
  }
})

async function handleSave() {
  if (saving.value) return
  saving.value = true
  saveStatus.value = 'saving'
  try {
    // 直接调用 API，再 patch 本地 store，避免服务端响应整体覆盖 voice_style 等其他字段
    await characterApi.updateCharacter(characterId, { ...character.value })
    characterStore.patchCurrentCharacter({ ...character.value })
    isDirty.value = false
    saveStatus.value = 'saved'
    setTimeout(() => { if (saveStatus.value === 'saved') saveStatus.value = '' }, 2000)
  } catch (e: any) {
    saveStatus.value = 'error'
    toast.error('自动保存失败：' + (e.message || '未知错误'))
  } finally {
    saving.value = false
  }
}

const debouncedSave = useDebounceFn(handleSave, 800)

async function handleReanalyze() {
  reanalyzing.value = true
  try {
    const res = await characterApi.reanalyzeCharacter(characterId)
    const taskId = res.data?.task_id
    if (!taskId) {
      toast.error('重新分析失败：未获取到任务ID')
      reanalyzing.value = false
      return
    }
    toast.info('重新分析任务已提交，正在处理...')
    taskStore.trackTask(taskId, async (task) => {
      reanalyzing.value = false
      if (task.status === 'completed') {
        await characterStore.fetchCharacter(characterId)
        const updated = characterStore.currentCharacter
        if (updated) {
          character.value.description = updated.description ?? character.value.description
          character.value.gender = updated.gender ?? character.value.gender
          character.value.age = updated.age ?? character.value.age
          characterStore.patchCurrentCharacter({
            voice_id: updated.voice_id,
            voice_style: updated.voice_style,
            voice_language: updated.voice_language,
            voice_speed: updated.voice_speed,
          })
        }
        isDirty.value = false
        toast.success('角色信息已重新分析')
      } else if (task.status === 'failed') {
        toast.error('重新分析失败：' + (task.error || '未知错误'))
      }
    })
  } catch (e: any) {
    toast.error('重新分析失败：' + (e.message || ''))
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
      <div class="flex items-center gap-3">
        <!-- 自动保存状态 -->
        <transition name="fade">
          <span v-if="saveStatus === 'saving'" class="flex items-center gap-1 text-xs text-gray-400">
            <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            保存中…
          </span>
          <span v-else-if="saveStatus === 'saved'" class="flex items-center gap-1 text-xs text-green-500">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
            </svg>
            已自动保存
          </span>
          <span v-else-if="saveStatus === 'error'" class="text-xs text-red-400">保存失败</span>
        </transition>
        <button class="btn-secondary" :disabled="reanalyzing || saving" @click="handleReanalyze">
          {{ reanalyzing ? '分析中...' : '重新分析' }}
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
        <p class="text-xs text-gray-400 dark:text-gray-500 mb-2">角色的出身来历、成长经历、关键转折、动机与目标</p>
        <textarea v-model="character.description" rows="10" class="input" placeholder="描述角色的出身来历、成长经历、关键转折、动机与目标…"></textarea>
      </div>

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

      <!-- 形象列表（卡片网格） -->
      <div v-else class="grid grid-cols-3 gap-3">
        <div
          v-for="look in sortedLooks"
          :key="look.id"
          class="group relative flex flex-col rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden hover:border-violet-400 dark:hover:border-violet-500 transition-colors"
        >
          <!-- 三视图图片区（只读） -->
          <div class="relative w-full aspect-[2/1] bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center overflow-hidden">
            <img v-if="look.three_view_sheet" :src="look.three_view_sheet" class="w-full h-full object-cover" />
            <span v-else class="text-2xl font-bold text-gray-300 dark:text-gray-600 select-none">{{ look.label.charAt(0) }}</span>
            <!-- 默认 badge -->
            <span v-if="character?.default_look_id === look.id" class="absolute top-1.5 left-1.5 text-[10px] bg-blue-500/90 text-white px-1.5 py-0.5 rounded-full leading-none">默认</span>
          </div>

          <!-- 底部信息区 -->
          <div class="px-2.5 py-2">
            <p class="text-xs font-semibold text-gray-800 dark:text-gray-100 truncate">{{ look.label }}</p>
            <p class="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
              第 {{ look.chapter_from }} 章{{ look.chapter_to > 0 ? ` — 第 ${look.chapter_to} 章` : ' 起（无限延伸）' }}
            </p>
            <div class="flex gap-2 mt-1.5 flex-wrap">
              <button class="text-[10px] text-violet-600 dark:text-violet-400 hover:underline" @click.stop="openLookForm(look)">编辑</button>
              <button
                class="text-[10px] text-gray-500 dark:text-gray-400 hover:underline disabled:opacity-50"
                :disabled="copyingLookId === look.id"
                @click.stop="handleCopyLook(look)"
              >{{ copyingLookId === look.id ? '复制中…' : '复制' }}</button>
              <button
                v-if="character?.default_look_id !== look.id"
                class="text-[10px] text-amber-500 dark:text-amber-400 hover:underline disabled:opacity-50"
                :disabled="settingDefaultLookId === look.id"
                @click.stop="handleSetDefaultLook(look)"
              >{{ settingDefaultLookId === look.id ? '设置中…' : '设为默认' }}</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 新建/编辑形象弹窗 -->
      <div v-if="showLookForm" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="showLookForm = false" />
        <div class="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
          <!-- 弹窗标题（固定） -->
          <div class="px-6 pt-6 pb-4 flex-shrink-0">
            <h3 class="font-semibold text-gray-800 dark:text-gray-100 text-lg">
              {{ editingLook ? '编辑形象' : '新建形象' }}
            </h3>
          </div>
          <!-- 滚动内容区 -->
          <div class="px-6 pb-2 overflow-y-auto flex-1 space-y-3">

          <!-- 形象名称 + 章节范围（同行） -->
          <div class="grid grid-cols-3 gap-3">
            <div class="col-span-1">
              <label class="label">形象名称 <span class="text-red-500">*</span></label>
              <input v-model="lookForm.label" class="input" placeholder="如：少年时期、觉醒后" />
            </div>
            <div>
              <label class="label">起始章节</label>
              <input v-model.number="lookForm.chapter_from" type="number" min="1" class="input" placeholder="1" />
            </div>
            <div>
              <label class="label">结束章节（0=无限）</label>
              <input v-model.number="lookForm.chapter_to" type="number" min="0" class="input" placeholder="0" />
            </div>
          </div>

          <!-- 视觉提示词 -->
          <div>
            <div class="flex items-center justify-between mb-1">
              <label class="label mb-0">图像提示词</label>
              <button
                class="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                :disabled="generatingLookPrompt"
                @click="handleGenerateLookPrompt"
              >
                {{ generatingLookPrompt ? '生成中…' : '✨ AI 更新' }}
              </button>
            </div>
            <textarea
              v-model="lookForm.visual_prompt"
              class="input h-28 resize-none font-mono text-xs"
              placeholder="English visual prompt for AI image generation…"
            />
          </div>

          <!-- 图片区：左侧面部参考图（第一步）+ 右侧三视图（第二步） -->
          <div class="grid grid-cols-3 gap-3 items-start">
            <!-- 面部参考图（1 col）— 第一步 -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <div class="flex items-center gap-1.5">
                  <span class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-violet-500 text-white text-[10px] font-bold flex-shrink-0">1</span>
                  <p class="text-sm font-medium text-gray-700 dark:text-gray-300">面部参考图</p>
                </div>
                <div class="flex items-center gap-2">
                  <button
                    v-if="editingLook"
                    class="text-xs text-violet-600 hover:text-violet-700 dark:text-violet-400 disabled:opacity-40"
                    :disabled="generatingFormPortrait"
                    @click="handleFormGeneratePortrait"
                  >
                    <span v-if="generatingFormPortrait" class="flex items-center gap-1">
                      <svg class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      生成中…
                    </span>
                    <span v-else>✨ AI 生成</span>
                  </button>
                  <button
                    v-if="lookForm.three_view_sheet"
                    class="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    @click="showCropModal = true"
                  >✂ 裁剪</button>
                </div>
              </div>
              <p class="text-xs text-gray-400 mb-1">正面半身像，用作三视图的面部锚点</p>
              <ImageUploadBox
                v-model="lookForm.portrait"
                aspect-ratio="3/4"
                placeholder="面部参考图（正面半身像）"
                :on-refine="(currentUrl: string, instruction: string) => editImage(currentUrl, instruction, novelStore.currentNovel?.id)"
                :on-save="(url: string) => { lookForm.portrait = url }"
                @error="toast.error"
              />
            </div>

            <!-- 三视图参考图（2 col）— 第二步 -->
            <div class="col-span-2">
              <div class="flex items-center justify-between mb-1">
                <div class="flex items-center gap-1.5">
                  <span class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-violet-500 text-white text-[10px] font-bold flex-shrink-0">2</span>
                  <div>
                    <p class="text-sm font-medium text-gray-700 dark:text-gray-300">三视图参考图</p>
                    <p class="text-xs text-gray-400">正视 / 侧视 / 背视合为一张图{{ lookForm.portrait ? '，将以面部图为参考' : '' }}</p>
                  </div>
                </div>
                <button
                  class="btn-primary text-xs px-3 h-8 flex items-center gap-1"
                  :disabled="generatingFormThreeView || !editingLook"
                  :title="!editingLook ? '保存形象后再生成' : !lookForm.portrait ? '建议先生成面部参考图（步骤 1），可提升一致性' : ''"
                  @click="handleFormGenerateThreeView"
                >
                  <svg v-if="generatingFormThreeView" class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {{ generatingFormThreeView ? '生成中...' : 'AI 生成' }}
                </button>
              </div>
              <!-- 未生成面部图时的提示条 -->
              <div v-if="!lookForm.portrait && editingLook" class="mb-1 px-2 py-1 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 text-xs text-amber-700 dark:text-amber-400">
                建议先完成步骤 1（生成面部参考图），以提高三视图的面部一致性
              </div>
              <ImageUploadBox
                v-model="lookForm.three_view_sheet"
                aspect-ratio="16/9"
                placeholder="三视图参考图（正面+侧面+背面合图）"
                :on-refine="(currentUrl: string, instruction: string) => editImage(currentUrl, instruction, novelStore.currentNovel?.id)"
                :on-save="(url: string) => { lookForm.three_view_sheet = url }"
                @error="toast.error"
              />
            </div>
          </div>

          </div><!-- end 滚动内容区 -->

          <!-- 操作按钮（固定底部） -->
          <div class="px-6 py-4 flex-shrink-0 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between gap-3">
            <!-- 删除（仅编辑模式） -->
            <button
              v-if="editingLook"
              class="text-sm text-red-500 hover:text-red-600 transition-colors"
              @click="handleDeleteLookFromForm"
            >删除形象</button>
            <div v-else />
            <div class="flex gap-3">
              <button class="btn-secondary" @click="showLookForm = false">取消</button>
              <button class="btn-primary" @click="handleSaveLook">保存</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 面部裁剪弹窗 -->
      <ImageCropModal
        v-if="showCropModal && cropSourceUrl"
        :image-url="cropSourceUrl"
        @done="(url) => { lookForm.portrait = url; showCropModal = false }"
        @cancel="showCropModal = false"
      />

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

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
