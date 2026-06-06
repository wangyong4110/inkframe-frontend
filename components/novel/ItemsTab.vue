<script setup lang="ts">
import type { Item } from '~/types'
import { useItemApi } from '~/composables/useItemApi'

const props = defineProps<{ novelId: number }>()

const toast = useToast()
const taskStore = useTaskStore()
const { url: lightboxUrl, openLightbox } = useImageLightbox()
const { editImage } = useImageEditApi()

const itemApi = useItemApi()

const items = ref<Item[]>([])
const itemsLoading = ref(false)
const showItemModal = ref(false)
const showDeleteConfirm = ref(false)
const itemToDelete = ref<Item | null>(null)
const extractingItems = ref(false)
const batchGeneratingItemImages = ref(false)
const showBatchItemMenu = ref(false)
const newItemForm = ref({ name: '', description: '' })
const savingItem = ref(false)

async function fetchItems() {
  itemsLoading.value = true
  try {
    const resp = await itemApi.listItems(props.novelId)
    items.value = resp.data?.items ?? []
  } catch (e: any) {
    toast.error('加载道具失败：' + (e?.message || '未知错误'))
  } finally {
    itemsLoading.value = false
  }
}

onMounted(() => fetchItems())

function openItemImage(item: Item) {
  if (!item.image_url) return
  openLightbox(
    item.image_url,
    (instruction) => editImage(lightboxUrl.value, instruction, props.novelId),
    async (newUrl) => {
      try {
        await itemApi.updateItem(item.id, { image_url: newUrl })
        item.image_url = newUrl
      } catch { /* ignore */ }
    },
  )
}

function getItemStatusDot(status: string): string {
  const dots: Record<string, string> = {
    active: 'bg-green-400', lost: 'bg-yellow-400',
    destroyed: 'bg-red-400', unknown: 'bg-gray-400',
  }
  return dots[status] || 'bg-gray-400'
}

async function handleAIItems() {
  extractingItems.value = true
  try {
    const res = await itemApi.aiExtract(props.novelId)
    const taskId = (res as any)?.data?.task_id ?? (res as any)?.task_id
    taskStore.trackTask(taskId, async (task) => {
      extractingItems.value = false
      if (task?.status === 'failed') {
        toast.error('物品提取失败：' + (task.error || '未知错误'))
        return
      }
      await fetchItems()
      toast.success('物品已提取/更新')
    })
  } catch (e: any) {
    extractingItems.value = false
    toast.error('提取失败：' + (e.message || ''))
  }
}

async function handleBatchItemImages(force = false) {
  batchGeneratingItemImages.value = true
  try {
    const res = await itemApi.batchGenerateImages(props.novelId, undefined, force)
    const taskId = (res as any)?.data?.task_id ?? (res as any)?.task_id
    taskStore.trackTask(taskId, async (task) => {
      batchGeneratingItemImages.value = false
      if (task?.status === 'failed') {
        toast.error('批量生成图片失败：' + (task.error || '未知错误'))
        return
      }
      const result = task?.result as any
      toast.success(`物品图片生成完成：成功 ${result?.succeeded ?? 0} / 失败 ${result?.failed ?? 0}`)
      await fetchItems()
    }, fetchItems)
  } catch (e: any) {
    batchGeneratingItemImages.value = false
    toast.error('批量生成失败：' + (e.message || ''))
  }
}

async function createItem() {
  if (!newItemForm.value.name.trim()) return
  savingItem.value = true
  try {
    const resp = await itemApi.createItem(props.novelId, {
      name: newItemForm.value.name.trim(),
      description: newItemForm.value.description.trim(),
    })
    items.value.push((resp as any).data)
    newItemForm.value = { name: '', description: '' }
    showItemModal.value = false
    toast.success('物品已创建')
  } catch (e: any) {
    toast.error('创建失败：' + (e.message || ''))
  } finally {
    savingItem.value = false
  }
}

function handleDeleteItem(item: Item, event: Event) {
  event.stopPropagation()
  itemToDelete.value = item
  showDeleteConfirm.value = true
}

async function confirmDeleteItem() {
  if (!itemToDelete.value) return
  try {
    await itemApi.deleteItem(itemToDelete.value.id)
    items.value = items.value.filter(i => i.id !== itemToDelete.value!.id)
    toast.success('物品已删除')
    itemToDelete.value = null
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || ''))
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- 工具栏 -->
    <div class="flex items-center justify-between gap-3 flex-wrap">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">物品列表</h2>
      <div class="flex items-center gap-2">
        <button class="btn-secondary text-sm" :disabled="extractingItems" @click="handleAIItems">
          <svg v-if="extractingItems" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          {{ extractingItems ? 'AI 提取中...' : (items.length > 0 ? 'AI 更新物品' : 'AI 提取物品') }}
        </button>
        <!-- 批量生成图片（分裂按钮） -->
        <div class="relative inline-flex">
          <button
            class="btn-secondary text-sm rounded-r-none border-r border-gray-300 dark:border-gray-600"
            :disabled="batchGeneratingItemImages || items.length === 0"
            title="批量为所有物品生成图片（跳过已有图片的物品）"
            @click="handleBatchItemImages(false)"
          >
            <svg v-if="batchGeneratingItemImages" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
            </svg>
            {{ batchGeneratingItemImages ? '生成中...' : '批量生成图片' }}
          </button>
          <button
            class="btn-secondary text-sm rounded-l-none px-2"
            :disabled="batchGeneratingItemImages || items.length === 0"
            title="更多选项"
            @click="showBatchItemMenu = !showBatchItemMenu"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
          <div v-if="showBatchItemMenu" class="fixed inset-0 z-10" @click="showBatchItemMenu = false" />
          <div v-if="showBatchItemMenu" class="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg min-w-max">
            <button
              class="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg"
              @click="showBatchItemMenu = false; handleBatchItemImages(true)"
            >
              <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
              </svg>
              全量重新生成
            </button>
          </div>
        </div>
        <button class="btn-primary text-sm" @click="showItemModal = true">
          <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          新建物品
        </button>
      </div>
    </div>

    <!-- 骨架屏 -->
    <div v-if="itemsLoading" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div v-for="i in 4" :key="i" class="card overflow-hidden">
        <div class="skeleton h-32 w-full"></div>
        <div class="p-3 space-y-2">
          <div class="skeleton h-4 w-1/2"></div>
          <div class="skeleton h-3 w-3/4"></div>
        </div>
      </div>
    </div>

    <!-- 空状态 -->
    <div v-else-if="items.length === 0" class="card p-8 text-center">
      <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
      </svg>
      <p class="text-gray-500 dark:text-gray-400 mb-1">暂无物品</p>
      <p class="text-xs text-gray-400 dark:text-gray-500">可手动添加，或通过「AI 分析」自动从章节内容中提取</p>
    </div>

    <!-- 物品网格 -->
    <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="item in items"
        :key="item.id"
        class="card overflow-hidden group cursor-pointer hover:shadow-medium transition-shadow"
        @click="$router.push(`/item/${item.id}?novelId=${novelId}`)"
      >
        <!-- 图片区域 -->
        <div class="relative w-full h-32 overflow-hidden bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
          <img
            v-if="item.image_url"
            :src="item.image_url"
            class="w-full h-full object-cover cursor-zoom-in"
            :alt="item.name"
            @click.stop="openItemImage(item)"
          />
          <div v-else class="flex flex-col items-center gap-1 text-gray-300 dark:text-gray-600">
            <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </div>
          <!-- 状态指示（右上） -->
          <span class="absolute top-2 right-2 flex items-center gap-1 bg-black/30 rounded-full px-1.5 py-0.5">
            <span class="w-1.5 h-1.5 rounded-full" :class="getItemStatusDot(item.status)" />
          </span>
          <!-- 删除按钮（右下，hover 显示） -->
          <button
            class="absolute bottom-2 right-2 p-1 bg-white/90 dark:bg-gray-900/90 text-gray-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            title="删除物品"
            @click.stop="handleDeleteItem(item, $event)"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>

        <!-- 信息区 -->
        <div class="p-3">
          <h3 class="font-medium text-gray-900 dark:text-white truncate mb-1">{{ item.name }}</h3>
          <p v-if="item.description" class="text-xs text-gray-500 dark:text-gray-400 line-clamp-2">{{ item.description }}</p>
        </div>
      </div>
    </div>

    <!-- 新建物品弹窗 -->
    <Teleport to="body">
      <div v-if="showItemModal" class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50" @click="showItemModal = false" />
        <div class="relative bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-md">
          <div class="p-6">
            <div class="flex items-center justify-between mb-5">
              <h2 class="text-lg font-bold text-gray-900 dark:text-white">添加物品</h2>
              <button class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" @click="showItemModal = false">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>
            <div class="space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">名称 <span class="text-red-500">*</span></label>
                <input v-model="newItemForm.name" type="text" class="input" placeholder="物品名称" maxlength="100" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">描述</label>
                <textarea v-model="newItemForm.description" rows="3" class="input resize-none" placeholder="物品的来历、用途、特殊属性..."></textarea>
              </div>
            </div>
            <div class="flex justify-end gap-3 mt-5 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button class="btn-secondary" @click="showItemModal = false">取消</button>
              <button class="btn-primary" :disabled="savingItem || !newItemForm.name.trim()" @click="createItem">
                <svg v-if="savingItem" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                </svg>
                {{ savingItem ? '创建中...' : '创建' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 删除确认弹窗 -->
    <ConfirmDialog
      v-model="showDeleteConfirm"
      title="删除物品"
      :description="`确认删除物品「${itemToDelete?.name || ''}」？此操作不可撤销。`"
      variant="danger"
      confirm-text="确认删除"
      @confirm="confirmDeleteItem"
    />
  </div>
</template>
