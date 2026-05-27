<script setup lang="ts">
const props = defineProps<{ novelId: number }>()

const router = useRouter()
const toast = useToast()
const sceneAnchorStore = useSceneAnchorStore()
const chapterStore = useChapterStore()
const taskStore = useTaskStore()
const { url: lightboxUrl, openLightbox } = useImageLightbox()
const { editImage } = useImageEditApi()

const showAnchorModal = ref(false)
const showDeleteConfirm = ref(false)
const anchorToDelete = ref<any | null>(null)
const anchorForm = ref({
  name: '',
  type: 'exterior' as string,
  description: '',
  prompt_lock: '',
  variant: '',
  parent_anchor_id: undefined as number | undefined,
})
const savingAnchor = ref(false)
const extractingAnchors = ref(false)
const extractingAllAnchors = ref(false)
const selectedChapterForExtract = ref<number | 'all'>('all')
const batchGeneratingAnchorImages = ref(false)
const generatingRefImage = ref<Record<number, boolean>>({})

function openAnchorImage(anchor: any) {
  if (!anchor.ref_image_url) return
  openLightbox(
    anchor.ref_image_url,
    (instruction) => editImage(lightboxUrl.value, instruction, props.novelId),
    async (newUrl) => {
      await sceneAnchorStore.lockRefImage(anchor.id, newUrl)
    },
  )
}

function startAnchorCreate() {
  anchorForm.value = { name: '', type: 'exterior', description: '', prompt_lock: '', variant: '', parent_anchor_id: undefined }
  showAnchorModal.value = true
}

function startAnchorEdit(anchor: any) {
  router.push(`/scene-anchor/${anchor.id}?novelId=${props.novelId}`)
}

async function saveAnchor() {
  if (!anchorForm.value.name) { toast.error('请输入场景名称'); return }
  savingAnchor.value = true
  try {
    const created = await sceneAnchorStore.createAnchor(props.novelId, anchorForm.value)
    showAnchorModal.value = false
    toast.success('场景已创建，跳转到详情页编辑…')
    router.push(`/scene-anchor/${created.id}?novelId=${props.novelId}`)
  } catch (e: any) {
    toast.error(e.message || '创建失败')
  } finally {
    savingAnchor.value = false
  }
}

function handleDeleteAnchor(anchor: any, event: Event) {
  event.stopPropagation()
  anchorToDelete.value = anchor
  showDeleteConfirm.value = true
}

async function confirmDeleteAnchor() {
  if (!anchorToDelete.value) return
  try {
    await sceneAnchorStore.deleteAnchor(anchorToDelete.value.id)
    toast.success('已删除')
    anchorToDelete.value = null
  } catch (e: any) {
    toast.error(e.message || '删除失败')
  }
}

async function extractAnchors() {
  if (selectedChapterForExtract.value === 'all') {
    await extractAllAnchors()
    return
  }
  const chapter = chapterStore.chapters.find(c => c.id === selectedChapterForExtract.value)
  if (!chapter?.content) { toast.error('所选章节无内容'); return }
  extractingAnchors.value = true
  try {
    const novelTitle = useNovelStore().currentNovel?.title
    const added = await sceneAnchorStore.extractAnchors(props.novelId, chapter.content, novelTitle)
    toast.success(`已提取 ${added.length} 个新场景锚点`)
  } catch (e: any) {
    toast.error(e.message || '提取失败')
  } finally {
    extractingAnchors.value = false
  }
}

async function extractAllAnchors() {
  extractingAllAnchors.value = true
  try {
    const api = useSceneAnchorApi()
    const res = await api.aiExtractFromNovel(props.novelId)
    const taskId = (res as any)?.task_id ?? (res as any)?.data?.task_id
    taskStore.trackTask(taskId, async (task) => {
      extractingAllAnchors.value = false
      if (task?.status === 'failed') {
        toast.error('场景锚点提取失败：' + (task.error || '未知错误'))
        return
      }
      await sceneAnchorStore.fetchAnchors(props.novelId)
      toast.success('场景锚点提取完成')
    })
  } catch (e: any) {
    extractingAllAnchors.value = false
    toast.error('提取失败：' + (e.message || ''))
  }
}

async function handleBatchAnchorImages(force = false) {
  batchGeneratingAnchorImages.value = true
  try {
    const anchorApi = useSceneAnchorApi()
    const res = await anchorApi.batchGenerateRefImages(props.novelId, undefined, force)
    const taskId = (res as any)?.data?.task_id ?? (res as any)?.task_id
    taskStore.trackTask(taskId, async (task) => {
      batchGeneratingAnchorImages.value = false
      if (task?.status === 'failed') {
        toast.error('批量生成参考图失败：' + (task.error || '未知错误'))
        return
      }
      const result = task?.result as any
      toast.success(`场景参考图生成完成：成功 ${result?.succeeded ?? 0} / 失败 ${result?.failed ?? 0}`)
      await sceneAnchorStore.fetchAnchors(props.novelId)
    })
  } catch (e: any) {
    batchGeneratingAnchorImages.value = false
    toast.error('批量生成失败：' + (e.message || ''))
  }
}

async function generateRefImage(anchor: any) {
  generatingRefImage.value[anchor.id] = true
  try {
    await sceneAnchorStore.generateRefImage(anchor.id)
    toast.success('参考图已生成')
  } catch (e: any) {
    toast.error(e.message || '生成失败')
  } finally {
    generatingRefImage.value[anchor.id] = false
  }
}

function getTypeColor(type: string): string {
  const colors: Record<string, string> = {
    interior:  'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    exterior:  'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    imaginary: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  }
  return colors[type] || 'bg-gray-100 text-gray-600'
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = { interior: '室内', exterior: '室外', imaginary: '虚幻' }
  return labels[type] || type
}
</script>

<template>
  <div class="space-y-4">
    <!-- 工具栏 -->
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">场景列表</h2>
      <div class="flex flex-wrap items-center gap-2">
        <!-- 章节选择器（AI 提取范围） -->
        <select v-model="selectedChapterForExtract" class="input text-sm h-9 py-0 max-w-[180px]">
          <option value="all">全部章节</option>
          <option v-for="ch in chapterStore.chapters" :key="ch.id" :value="ch.id">
            第 {{ ch.chapter_no }} 章 {{ ch.title }}
          </option>
        </select>
        <button
          class="btn-secondary text-sm"
          :disabled="extractingAnchors || extractingAllAnchors"
          @click="extractAnchors"
        >
          <svg v-if="extractingAnchors || extractingAllAnchors" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          {{ (extractingAnchors || extractingAllAnchors) ? 'AI 提取中...' : (sceneAnchorStore.anchors.length > 0 ? 'AI 更新场景' : 'AI 提取场景') }}
        </button>
        <button
          class="btn-secondary text-sm"
          :disabled="batchGeneratingAnchorImages || sceneAnchorStore.anchors.length === 0"
          title="批量为所有锚点生成参考图（跳过已有参考图的锚点）"
          @click="handleBatchAnchorImages(false)"
        >
          <svg v-if="batchGeneratingAnchorImages" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
          </svg>
          {{ batchGeneratingAnchorImages ? '生成中...' : '批量生成参考图' }}
        </button>
        <button
          class="btn-secondary text-sm"
          :disabled="batchGeneratingAnchorImages || sceneAnchorStore.anchors.length === 0"
          title="按当前画面风格强制重新生成所有场景参考图（风格变更后使用）"
          @click="handleBatchAnchorImages(true)"
        >
          <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          按新风格重新生成
        </button>
        <button class="btn-primary text-sm" @click="startAnchorCreate">
          <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          新建场景
        </button>
      </div>
    </div>

    <!-- 骨架屏 -->
    <div v-if="sceneAnchorStore.loading" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div v-for="i in 4" :key="i" class="card overflow-hidden">
        <div class="skeleton h-32 w-full"></div>
        <div class="p-3 space-y-2">
          <div class="skeleton h-4 w-1/2"></div>
          <div class="skeleton h-3 w-3/4"></div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="sceneAnchorStore.anchors.length === 0" class="card p-8 text-center">
      <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
      </svg>
      <p class="text-gray-500 dark:text-gray-400 mb-1">暂无场景锚点</p>
      <p class="text-xs text-gray-400 dark:text-gray-500">可手动新建，或通过「AI 提取场景」从章节内容自动生成</p>
    </div>

    <!-- 场景网格 -->
    <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="anchor in sceneAnchorStore.anchors"
        :key="anchor.id"
        class="card overflow-hidden group cursor-pointer hover:shadow-medium transition-shadow"
        @click="startAnchorEdit(anchor)"
      >
        <!-- 图片区域 -->
        <div class="relative w-full h-32 overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
          <img
            v-if="anchor.ref_image_url"
            :src="anchor.ref_image_url"
            class="w-full h-full object-cover cursor-zoom-in"
            :alt="anchor.name"
            @click.stop="openAnchorImage(anchor)"
          />
          <div v-else class="flex flex-col items-center gap-1 text-gray-300 dark:text-gray-600">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span class="text-xs">暂无参考图</span>
          </div>
          <!-- 类型徽章 -->
          <span
            class="absolute top-2 left-2 text-xs px-1.5 py-0.5 rounded font-medium"
            :class="getTypeColor(anchor.type)"
          >{{ getTypeLabel(anchor.type) }}</span>
          <!-- 锁定状态 -->
          <span v-if="anchor.ref_image_locked_at" class="absolute top-2 right-2 flex items-center gap-1 bg-black/30 rounded-full px-1.5 py-0.5">
            <svg class="w-3 h-3 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </span>
          <!-- 生成参考图按钮（左下，hover 显示） -->
          <button
            class="absolute bottom-2 left-2 p-1 bg-white/90 dark:bg-gray-900/90 text-gray-500 hover:text-primary-600 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            :disabled="generatingRefImage[anchor.id]"
            :title="anchor.ref_image_url ? '重新生成参考图' : '生成参考图'"
            @click.stop="generateRefImage(anchor)"
          >
            <svg v-if="generatingRefImage[anchor.id]" class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
          </button>
          <!-- 删除按钮（右下，hover 显示） -->
          <button
            class="absolute bottom-2 right-2 p-1 bg-white/90 dark:bg-gray-900/90 text-gray-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            title="删除场景"
            @click.stop="handleDeleteAnchor(anchor, $event)"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>

        <!-- 信息区 -->
        <div class="p-3">
          <div class="flex items-start justify-between gap-2 mb-1">
            <h3 class="font-medium text-gray-900 dark:text-white truncate flex-1">{{ anchor.name }}</h3>
            <span v-if="anchor.variant" class="text-xs px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 flex-shrink-0">
              {{ anchor.variant }}
            </span>
          </div>
          <p v-if="anchor.description" class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-2">{{ anchor.description }}</p>
          <div class="flex items-center gap-3 text-xs text-gray-400 dark:text-gray-500">
            <span>引用 {{ anchor.usage_count }}</span>
            <span
              v-if="anchor.avg_cons_score > 0"
              :class="anchor.avg_cons_score >= 0.85 ? 'text-green-600' : anchor.avg_cons_score >= 0.70 ? 'text-amber-500' : 'text-red-500'"
            >均分 {{ anchor.avg_cons_score.toFixed(2) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 新建场景弹窗 -->
    <Teleport to="body">
      <div v-if="showAnchorModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="showAnchorModal = false" />
        <div class="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
          <div class="p-6">
            <div class="flex items-center justify-between mb-5">
              <h2 class="text-lg font-bold text-gray-900 dark:text-white">新建场景锚点</h2>
              <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" @click="showAnchorModal = false">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">名称 <span class="text-red-500">*</span></label>
                <input v-model="anchorForm.name" class="input" placeholder="如：皇宫正殿" maxlength="100" />
              </div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">类型</label>
                  <select v-model="anchorForm.type" class="input">
                    <option value="exterior">室外</option>
                    <option value="interior">室内</option>
                    <option value="imaginary">虚幻</option>
                  </select>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">变体</label>
                  <input v-model="anchorForm.variant" class="input" placeholder="day/night/winter" />
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">视觉描述</label>
                <textarea v-model="anchorForm.description" class="input resize-none" rows="2" placeholder="场景的视觉描述..."></textarea>
              </div>
            </div>
            <p class="mt-3 text-xs text-gray-400">创建后可在详情页完善提示词锁定等高级设置。</p>
            <div class="flex justify-end gap-3 mt-5 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button class="btn-secondary" @click="showAnchorModal = false">取消</button>
              <button class="btn-primary" :disabled="savingAnchor" @click="saveAnchor">
                <svg v-if="savingAnchor" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                {{ savingAnchor ? '创建中…' : '创建' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 删除确认弹窗 -->
    <ConfirmDialog
      v-model="showDeleteConfirm"
      title="删除场景锚点"
      :description="`确认删除场景「${anchorToDelete?.name || ''}」？此操作不可撤销。`"
      variant="danger"
      confirm-text="确认删除"
      @confirm="confirmDeleteAnchor"
    />
  </div>
</template>
