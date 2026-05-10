<script setup lang="ts">
const props = defineProps<{ novelId: number }>()

const router = useRouter()
const toast = useToast()
const sceneAnchorStore = useSceneAnchorStore()
const chapterStore = useChapterStore()
const taskStore = useTaskStore()
const { openLightbox } = useImageLightbox()

const showAnchorModal = ref(false)
const anchorForm = ref({
  name: '',
  type: 'exterior' as string,
  description: '',
  prompt_lock: '',
  style_tokens: '',
  notes: '',
  variant: '',
  parent_anchor_id: undefined as number | undefined,
  lighting_keywords: '',
  time_of_day: '',
  weather: '',
})
const savingAnchor = ref(false)
const extractingAnchors = ref(false)
const extractingAllAnchors = ref(false)
const selectedChapterForExtract = ref<number | 'all'>('all')
const batchGeneratingAnchorImages = ref(false)
const generatingRefImage = ref<Record<number, boolean>>({})

function startAnchorCreate() {
  anchorForm.value = { name: '', type: 'exterior', description: '', prompt_lock: '', style_tokens: '', notes: '', variant: '', parent_anchor_id: undefined, lighting_keywords: '', time_of_day: '', weather: '' }
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

async function deleteAnchor(id: number) {
  if (!confirm('确定删除该场景锚点？')) return
  try {
    await sceneAnchorStore.deleteAnchor(id)
    toast.success('已删除')
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

async function handleBatchAnchorImages() {
  batchGeneratingAnchorImages.value = true
  try {
    const anchorApi = useSceneAnchorApi()
    const res = await anchorApi.batchGenerateRefImages(props.novelId)
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
</script>

<template>
  <div class="space-y-4">
    <!-- 工具栏 -->
    <div class="flex flex-wrap items-center gap-3">
      <select v-model="selectedChapterForExtract" class="input text-sm flex-1 min-w-0 max-w-xs">
        <option value="all">全部章节</option>
        <option v-for="ch in chapterStore.chapters" :key="ch.id" :value="ch.id">
          第 {{ ch.chapter_no }} 章 {{ ch.title }}
        </option>
      </select>
      <button class="btn btn-primary text-sm" :disabled="extractingAnchors || extractingAllAnchors" @click="extractAnchors">
        <span v-if="extractingAllAnchors || extractingAnchors">提取中…</span>
        <span v-else>AI 提取</span>
      </button>
      <button
        class="btn btn-secondary text-sm"
        :disabled="batchGeneratingAnchorImages || sceneAnchorStore.anchors.length === 0"
        title="批量为所有锚点生成参考图（跳过已有参考图的锚点）"
        @click="handleBatchAnchorImages"
      >
        <svg v-if="batchGeneratingAnchorImages" class="w-4 h-4 mr-1 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
        </svg>
        <span>{{ batchGeneratingAnchorImages ? '生成中...' : '批量生成参考图' }}</span>
      </button>
      <button class="btn btn-secondary text-sm ml-auto" @click="startAnchorCreate">+ 手动新建</button>
    </div>

    <!-- 锚点列表 -->
    <div v-if="sceneAnchorStore.loading" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div v-for="i in 4" :key="i" class="card p-4">
        <div class="skeleton h-28 w-full rounded-lg mb-3"></div>
        <div class="skeleton h-4 w-1/2 mb-2"></div>
        <div class="skeleton h-3 w-3/4"></div>
      </div>
    </div>

    <div v-else-if="sceneAnchorStore.anchors.length === 0" class="card p-8 text-center">
      <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/>
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/>
      </svg>
      <p class="text-gray-500 dark:text-gray-400 mb-1">暂无场景锚点</p>
      <p class="text-xs text-gray-400 dark:text-gray-500">可手动新建，或通过「AI 提取」从章节内容自动生成</p>
    </div>

    <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="anchor in sceneAnchorStore.anchors"
        :key="anchor.id"
        class="card overflow-hidden group cursor-pointer hover:shadow-medium transition-shadow"
        @click="startAnchorEdit(anchor)"
      >
        <!-- 参考图区域 -->
        <div class="relative w-full h-32 overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
          <img v-if="anchor.ref_image_url" :src="anchor.ref_image_url" class="w-full h-full object-cover cursor-zoom-in" :alt="anchor.name" @click.stop="openLightbox(anchor.ref_image_url)" />
          <div v-else class="flex flex-col items-center gap-1 text-gray-300 dark:text-gray-600">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span class="text-xs">暂无参考图</span>
          </div>
          <!-- 类型徽章 -->
          <span
            class="absolute top-2 left-2 text-xs px-1.5 py-0.5 rounded font-medium"
            :class="{
              'bg-blue-100 text-blue-700': anchor.type === 'interior',
              'bg-green-100 text-green-700': anchor.type === 'exterior',
              'bg-purple-100 text-purple-700': anchor.type === 'imaginary',
            }"
          >{{ anchor.type === 'interior' ? '室内' : anchor.type === 'exterior' ? '室外' : anchor.type === 'imaginary' ? '虚幻' : anchor.type }}</span>
          <!-- 锁定状态 -->
          <span v-if="anchor.ref_image_locked_at" class="absolute top-2 right-2 flex items-center gap-1 bg-black/30 rounded-full px-1.5 py-0.5">
            <svg class="w-3 h-3 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </span>
          <!-- 生成图按钮 (stop propagation) -->
          <button
            class="absolute bottom-2 right-2 p-1 bg-white/90 dark:bg-gray-900/90 text-gray-500 hover:text-primary-600 rounded opacity-0 group-hover:opacity-100 transition-opacity text-xs flex items-center gap-1"
            :disabled="generatingRefImage[anchor.id]"
            :title="anchor.ref_image_url ? '重新生成参考图' : '生成参考图'"
            @click.stop="generateRefImage(anchor)"
          >
            <svg v-if="generatingRefImage[anchor.id]" class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <svg v-else class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
          </button>
          <!-- 删除按钮 -->
          <button
            class="absolute bottom-2 left-2 p-1 bg-white/90 dark:bg-gray-900/90 text-gray-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            title="删除锚点"
            @click.stop="deleteAnchor(anchor.id)"
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
            <span v-if="anchor.avg_cons_score > 0" :class="anchor.avg_cons_score >= 0.85 ? 'text-green-600' : anchor.avg_cons_score >= 0.70 ? 'text-amber-500' : 'text-red-500'">
              均分 {{ anchor.avg_cons_score.toFixed(2) }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 新建 Modal（仅用于快速创建，编辑跳转到详情页） -->
    <div v-if="showAnchorModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div class="card w-full max-w-md p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <h3 class="text-base font-semibold">新建场景锚点</h3>
        <div class="space-y-3">
          <div>
            <label class="label">名称 <span class="text-red-500">*</span></label>
            <input v-model="anchorForm.name" class="input w-full" placeholder="如：皇宫正殿" maxlength="100" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="label">类型</label>
              <select v-model="anchorForm.type" class="input w-full">
                <option value="exterior">室外 (exterior)</option>
                <option value="interior">室内 (interior)</option>
                <option value="imaginary">虚幻 (imaginary)</option>
              </select>
            </div>
            <div>
              <label class="label">变体</label>
              <input v-model="anchorForm.variant" class="input w-full" placeholder="day/night/winter" />
            </div>
          </div>
          <div>
            <label class="label">视觉描述（英文）</label>
            <textarea v-model="anchorForm.description" class="input w-full resize-none" rows="2" placeholder="Brief English description..."></textarea>
          </div>
          <div>
            <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">光照关键词</label>
            <input
              v-model="anchorForm.lighting_keywords"
              type="text"
              class="w-full border rounded px-3 py-1.5 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              placeholder="如：golden hour, warm backlight, soft shadows"
            />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">时间段</label>
              <select v-model="anchorForm.time_of_day" class="w-full border rounded px-3 py-1.5 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <option value="">不限</option>
                <option value="morning">清晨</option>
                <option value="afternoon">白天</option>
                <option value="evening">黄昏</option>
                <option value="night">夜晚</option>
              </select>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">天气</label>
              <select v-model="anchorForm.weather" class="w-full border rounded px-3 py-1.5 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                <option value="">不限</option>
                <option value="clear">晴天</option>
                <option value="cloudy">阴天</option>
                <option value="rainy">雨天</option>
                <option value="foggy">雾天</option>
                <option value="snowy">雪天</option>
              </select>
            </div>
          </div>
        </div>
        <p class="text-xs text-gray-400">创建后可在详情页完善 Prompt Lock、Style Tokens 等高级设置。</p>
        <div class="flex gap-3 justify-end pt-2">
          <button class="btn btn-secondary" @click="showAnchorModal = false">取消</button>
          <button class="btn btn-primary" :disabled="savingAnchor" @click="saveAnchor">
            {{ savingAnchor ? '创建中…' : '创建' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
