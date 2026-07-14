<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
import type { Item } from '~/types'
import { useItemApi } from '~/composables/useItemApi'

const { openLightbox, previewLightbox, url: lightboxUrl } = useImageLightbox()
const { editImage } = useImageEditApi()
const route = useRoute()
const router = useRouter()
const toast = useToast()
const itemApi = useItemApi()
const novelStore = useNovelStore()
const { guardAiProvider } = useAiProviderGuard()

const itemId = parseInt(route.params.id as string)
if (isNaN(itemId)) {
  await navigateTo('/novel')
}
const novelId = parseInt(route.query.novelId as string)

const activeTab = ref('profile')
const loading = ref(true)
const saving = ref(false)
const saveStatus = ref<'' | 'saving' | 'saved' | 'error'>('')
const isDirty = ref(false)
const dataLoaded = ref(false)
const generatingImage = ref(false)
const updatingInfo = ref(false)

// 使用小说配置的图像生成模型
const selectedImageProvider = computed(() => novelStore.currentNovel?.image_model || '')

// 图像生成异步任务
const imageTaskId = ref('')
const imageTaskStatus = ref<'idle' | 'pending' | 'running' | 'completed' | 'failed'>('idle')
let imageTaskTimer: ReturnType<typeof setInterval> | null = null

function clearImageTaskTimer() {
  if (imageTaskTimer) {
    clearInterval(imageTaskTimer)
    imageTaskTimer = null
  }
}

async function pollImageTask() {
  if (!imageTaskId.value) return
  try {
    const res = await useTaskApi().getTask(imageTaskId.value)
    const task = res.data
    imageTaskStatus.value = task.status as any
    if (task.status === 'completed') {
      clearImageTaskTimer()
      generatingImage.value = false
      const item = task.data ?? task.item
      const newUrl = item?.image_url
      if (newUrl && newUrl !== imageUrl.value) {
        previewLightbox(newUrl, imageUrl.value, (confirmed) => {
          imageUrl.value = confirmed
        })
        toast.success('图片生成完成，请确认后保存')
      } else if (newUrl) {
        imageUrl.value = newUrl
        toast.success('图片生成成功')
      }
    } else if (task.status === 'failed') {
      clearImageTaskTimer()
      generatingImage.value = false
      toast.error('图片生成失败：' + (task.error || '未知错误'))
    }
  } catch {
    // ignore transient poll errors
  }
}

function revokeIfBlob(url: string) {
  if (url.startsWith('blob:')) URL.revokeObjectURL(url)
}

onUnmounted(() => {
  clearImageTaskTimer()
  revokeIfBlob(referenceImagePreview.value)
  revokeIfBlob(imageUrl.value)
})

// 参考图片
const referenceImageUrl = ref('')      // 服务端绝对 URL（OSS），用于 AI 调用
const referenceImagePreview = ref('')  // 预览用 URL（ObjectURL 或 OSS URL）
const uploadingRef = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

function clearReferenceImage() {
  revokeIfBlob(referenceImagePreview.value)
  referenceImageUrl.value = ''
  referenceImagePreview.value = ''
}

async function handleReferenceUpload(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  // 立即显示本地预览，不依赖服务端 URL
  const localPreview = URL.createObjectURL(file)
  referenceImagePreview.value = localPreview
  uploadingRef.value = true
  try {
    // 使用物品专属上传接口，将参考图 URL 存入 item.reference_image_url
    const data = await itemApi.uploadItemReference(itemId, file)
    referenceImageUrl.value = data.url
    // 若服务端返回了绝对 URL，用于更清晰的预览；否则保留 ObjectURL
    if (data.url.startsWith('http')) {
      URL.revokeObjectURL(localPreview)
      referenceImagePreview.value = data.url
    }
    toast.success('参考图片上传成功')
  } catch (err: any) {
    clearReferenceImage()
    toast.error('上传失败：' + (err.message || '未知错误'))
  } finally {
    uploadingRef.value = false
    if (fileInputRef.value) fileInputRef.value.value = ''
  }
}


// ── Form fields ───────────────────────────────────────────────────────────────
const form = ref({
  name: '',
  category: 'other' as Item['category'],
  status: 'active' as Item['status'],
  description: '',
  visual_prompt: '',
})

const imageUrl = ref('')

// ── Options ───────────────────────────────────────────────────────────────────
const categoryOptions = [
  { value: 'weapon',     label: '武器',   icon: '⚔️' },
  { value: 'armor',      label: '防具',   icon: '🛡️' },
  { value: 'treasure',   label: '宝物',   icon: '💎' },
  { value: 'artifact',   label: '法器',   icon: '🔮' },
  { value: 'tool',       label: '工具',   icon: '🔧' },
  { value: 'document',   label: '文书',   icon: '📜' },
  { value: 'consumable', label: '消耗品', icon: '🧪' },
  { value: 'other',      label: '其他',   icon: '📦' },
]

const statusOptions = [
  { value: 'active',    label: '持有中', color: 'text-green-600' },
  { value: 'lost',      label: '已遗失', color: 'text-yellow-600' },
  { value: 'destroyed', label: '已损毁', color: 'text-red-600' },
  { value: 'unknown',   label: '未知',   color: 'text-gray-500' },
]

const currentCategory = computed(() => categoryOptions.find(o => o.value === form.value.category))

const tabs = [
  { key: 'profile', label: '基本档案' },
  { key: 'image',   label: '视觉设计' },
]

// ── Lifecycle ─────────────────────────────────────────────────────────────────
useUnsavedGuard(isDirty, '物品信息有未保存的修改，确认离开？')

onMounted(async () => {
  if (novelId && novelStore.currentNovel?.id !== novelId) {
    novelStore.fetchNovel(novelId).catch(() => {})
  }
  if (!itemId) { loading.value = false; return }
  try {
    const res = await itemApi.getItem(itemId)
    const item: Item = (res as any).data ?? res
    form.value = {
      name: item.name ?? '',
      category: (item.category as any) ?? 'other',
      status: item.status ?? 'active',
      description: item.description ?? '',
      visual_prompt: item.visual_prompt ?? '',
    }
    imageUrl.value = item.image_url ?? ''
    // 恢复已存的参考图（仅绝对 URL 可用于预览和 AI 调用）
    if (item.reference_image_url?.startsWith('http')) {
      referenceImageUrl.value = item.reference_image_url
      referenceImagePreview.value = item.reference_image_url
    }
  } catch (e: any) {
    toast.error('加载物品失败：' + (e.message || '未知错误'))
  }
  loading.value = false
  await nextTick()
  isDirty.value = false
  dataLoaded.value = true
})

// ── Actions ───────────────────────────────────────────────────────────────────
async function handleSave() {
  if (!form.value.name.trim()) return
  if (saving.value) return
  saving.value = true
  saveStatus.value = 'saving'
  try {
    await itemApi.updateItem(itemId, { ...form.value, image_url: imageUrl.value })
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

watch(form, () => {
  if (!dataLoaded.value) return
  isDirty.value = true
  debouncedSave()
}, { deep: true })

watch(imageUrl, () => {
  if (!dataLoaded.value) return
  isDirty.value = true
  debouncedSave()
})

async function generateImage() {
  if (!await guardAiProvider('IMAGE')) return
  // 先同步保存最新 visual_prompt
  await handleSave()
  generatingImage.value = true
  imageTaskStatus.value = 'pending'
  clearImageTaskTimer()
  try {
    const res = await itemApi.generateItemImage(itemId, referenceImageUrl.value || undefined, selectedImageProvider.value || undefined)
    const taskId = (res as any).data?.task_id ?? ''
    if (!taskId) throw new Error('未获取到任务 ID')
    imageTaskId.value = taskId
    toast.info('图片生成任务已提交，AI 正在生成中…')
    imageTaskTimer = setInterval(pollImageTask, 3000)
  } catch (e: any) {
    generatingImage.value = false
    imageTaskStatus.value = 'failed'
    toast.error('图片生成失败：' + (e.message || '未知错误'))
  }
}

async function handleAIUpdate() {
  if (!form.value.name.trim()) return
  if (!await guardAiProvider('LLM')) return
  updatingInfo.value = true
  try {
    const resp = await itemApi.generateItemInfo(novelId, form.value.name.trim(), form.value.description.trim())
    const data = (resp as any)?.data ?? resp
    if (data?.description) form.value.description = data.description
    if (data?.visual_prompt) form.value.visual_prompt = data.visual_prompt
    toast.success('物品信息已更新')
  } catch (e: any) {
    toast.error('AI 更新失败：' + (e.message || '未知错误'))
  } finally {
    updatingInfo.value = false
  }
}

function goBack() {
  const from = route.query.from as string | undefined
  if (from) { router.push(decodeURIComponent(from)); return }
  novelId ? router.push(`/novel/${novelId}?tab=items`) : router.back()
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between gap-4">
      <div class="flex items-center gap-3 min-w-0">
        <button class="btn-ghost p-2 flex-shrink-0" @click="goBack">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
        </button>
        <div class="min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <h1 class="text-xl font-bold text-gray-900 dark:text-white truncate">{{ form.name || '物品详情' }}</h1>
            <span v-if="currentCategory" class="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex-shrink-0">
              {{ currentCategory.icon }} {{ currentCategory.label }}
            </span>
          </div>
          <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">物品编辑器</p>
        </div>
      </div>
      <div class="flex items-center gap-3 flex-shrink-0">
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
        <!-- AI 更新物品信息 -->
        <button
          type="button"
          class="inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 hover:bg-violet-100 dark:hover:bg-violet-900/40 px-3 h-8 rounded-md transition-colors disabled:opacity-40"
          :disabled="updatingInfo || !form.name.trim()"
          title="基于当前名称/描述由 AI 重新分析并更新物品信息"
          @click="handleAIUpdate"
        >
          <svg v-if="updatingInfo" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          {{ updatingInfo ? '更新中…' : 'AI 更新' }}
        </button>
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="card p-8 flex items-center justify-center">
      <svg class="w-6 h-6 animate-spin text-primary-500" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
      </svg>
      <span class="ml-2 text-gray-500">加载中…</span>
    </div>

    <template v-else>
    <!-- Tabs -->
    <div class="border-b border-gray-200 dark:border-gray-700">
      <nav class="flex space-x-8">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="py-3 px-1 border-b-2 font-medium text-sm transition-colors"
          :class="activeTab === tab.key
            ? 'border-primary-500 text-primary-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </nav>
    </div>

    <!-- ── Tab: 基本档案 ───────────────────────────────────────────────────── -->
    <div v-if="activeTab === 'profile'" class="space-y-4">
      <div class="card p-6 space-y-5">
        <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider">基础信息</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <!-- Name -->
          <div class="sm:col-span-2">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">名称 <span class="text-red-500">*</span></label>
            <input v-model="form.name" type="text" class="input" placeholder="物品名称" maxlength="100" />
          </div>
          <!-- Category -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">类别</label>
            <select v-model="form.category" class="input">
              <option v-for="opt in categoryOptions" :key="opt.value" :value="opt.value">
                {{ opt.icon }} {{ opt.label }}
              </option>
            </select>
          </div>
          <!-- Status -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">当前状态</label>
            <select v-model="form.status" class="input">
              <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
          </div>
        </div>
      </div>

      <div class="card p-6 space-y-5">
        <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wider">物品描述</h3>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">描述</label>
          <p class="text-xs text-gray-400 dark:text-gray-500 mb-2">包含外观（材质、颜色、形态、纹路等）、功能、特殊能力及故事背景</p>
          <textarea v-model="form.description" rows="8" class="input resize-none" placeholder="【外观】材质、颜色、形态、纹路、散发气息等视觉细节…&#10;功能、使用方式、特殊能力、象征意义、故事背景…" />
        </div>
      </div>
    </div>

    <!-- ── Tab: 视觉设计 ───────────────────────────────────────────────────── -->
    <div v-if="activeTab === 'image'" class="card p-6 space-y-6">
      <!-- Visual prompt -->
      <div>
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">视觉提示词</label>
        <p class="text-xs text-gray-400 dark:text-gray-500 mb-2">供 AI 图像生成使用的提示词，由 AI 分析自动填写，也可手动编辑</p>
        <textarea
          v-model="form.visual_prompt"
          rows="4"
          class="input font-mono text-xs"
          placeholder="e.g. tall black wooden tower with shining crossbow on top, gears visible, stone slot at base..."
        />
      </div>

      <h3 class="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">图像资产</h3>

      <!-- Item image -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <div>
            <h4 class="text-sm font-medium text-gray-900 dark:text-white">物品图片</h4>
            <p class="text-xs text-gray-500 mt-0.5">
              参考图（可选）：
              <span v-if="referenceImagePreview" class="text-primary-500 cursor-pointer" @click="openLightbox(referenceImagePreview, (currentUrl, s) => editImage(currentUrl, s, novelId), (url) => { referenceImageUrl = url; referenceImagePreview = url })">已上传</span>
              <span v-else class="cursor-pointer hover:text-gray-700" @click="fileInputRef?.click()">上传参考图</span>
              <span v-if="referenceImagePreview" class="ml-1 text-gray-400 cursor-pointer hover:text-red-500" @click="clearReferenceImage">（清除）</span>
            </p>
          </div>
          <div class="flex items-center gap-2">
            <input
              ref="fileInputRef"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              class="hidden"
              @change="handleReferenceUpload"
            />
            <button
              class="btn-primary text-xs px-3 h-8 flex items-center gap-1"
              :disabled="generatingImage || saving"
              @click="generateImage"
            >
              <svg v-if="generatingImage" class="w-3 h-3 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {{ generatingImage ? '生成中...' : 'AI 生成' }}
            </button>
          </div>
        </div>
        <div class="relative max-w-xs">
          <ImageUploadBox
            v-model="imageUrl"
            aspect-ratio="1/1"
            placeholder="物品图片"
            :on-refine="(currentUrl: string, s: string) => editImage(currentUrl, s, novelId)"
            :on-save="(url: string) => { imageUrl = url }"
            @error="toast.error"
          />
          <div v-if="generatingImage" class="absolute inset-0 bg-black/50 flex items-center justify-center rounded-lg z-10">
            <div class="w-8 h-8 border-4 border-primary-400 border-t-transparent rounded-full animate-spin"></div>
          </div>
        </div>
        <div v-if="imageTaskStatus !== 'idle'" class="mt-2 text-xs">
          <span v-if="imageTaskStatus === 'pending' || imageTaskStatus === 'running'" class="text-blue-500 flex items-center gap-1">
            <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
            AI 正在生成，请稍候…
          </span>
          <span v-else-if="imageTaskStatus === 'completed'" class="text-green-500">生成完成</span>
          <span v-else-if="imageTaskStatus === 'failed'" class="text-red-500">生成失败，请重试</span>
        </div>
      </div>

      <p class="text-xs text-gray-500">需填写「物品描述」或「视觉提示词」，AI 才能生成准确的图像。</p>
    </div>
    </template>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity 0.3s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
