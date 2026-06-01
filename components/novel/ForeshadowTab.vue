<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">伏笔管理</h3>
      <div class="flex gap-2">
        <button
          @click="showUnfulfilledOnly = !showUnfulfilledOnly"
          :class="['btn btn-sm', showUnfulfilledOnly ? 'btn-warning' : 'btn-ghost']"
          aria-label="只显示未兑现"
        >
          {{ showUnfulfilledOnly ? '只看未兑现' : '全部' }}
        </button>
        <button @click="openCreate" aria-label="添加伏笔" class="btn btn-sm btn-primary">
          + 添加伏笔
        </button>
      </div>
    </div>

    <div v-if="loading" class="text-center py-8 text-gray-400">加载中...</div>
    <div v-else-if="displayList.length === 0" class="text-center py-8 text-gray-400">
      暂无伏笔记录
    </div>
    <div v-else class="space-y-2">
      <div
        v-for="item in displayList"
        :key="item.id"
        class="flex items-start justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-medium text-gray-900 dark:text-white truncate">{{ item.title }}</span>
            <span
              :class="['text-xs px-2 py-0.5 rounded-full', statusClass(item.status)]"
            >{{ statusLabel(item.status) }}</span>
          </div>
          <p v-if="item.description" class="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
            {{ item.description }}
          </p>
        </div>
        <div class="flex gap-1 ml-2 flex-shrink-0">
          <button
            v-if="item.status === 'planted'"
            @click="markPaidOff(item)"
            aria-label="标记已兑现"
            class="text-xs px-2 py-1 text-green-600 hover:bg-green-50 dark:hover:bg-green-900 rounded"
          >✓ 兑现</button>
          <button
            @click="editItem(item)"
            aria-label="编辑"
            class="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900 rounded"
          >编辑</button>
          <button
            @click="deleteItem(item.id)"
            aria-label="删除"
            class="text-xs px-2 py-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900 rounded"
          >删除</button>
        </div>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <div v-if="showModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div class="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
        <h4 class="text-lg font-semibold text-gray-900 dark:text-white">
          {{ editingItem ? '编辑伏笔' : '添加伏笔' }}
        </h4>
        <div>
          <label class="block text-sm font-medium mb-1" for="f-title">标题 *</label>
          <input id="f-title" v-model="form.title" class="input input-bordered w-full" aria-label="伏笔标题" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1" for="f-desc">描述</label>
          <textarea id="f-desc" v-model="form.description" rows="3" class="textarea textarea-bordered w-full" aria-label="伏笔描述" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">状态</label>
          <select v-model="form.status" class="select select-bordered w-full" aria-label="伏笔状态">
            <option value="planted">已埋设</option>
            <option value="paid_off">已兑现</option>
            <option value="abandoned">已放弃</option>
          </select>
        </div>
        <div v-if="modalError" class="text-red-500 text-sm" role="alert">{{ modalError }}</div>
        <div class="flex justify-end gap-3">
          <button @click="showModal = false" class="btn btn-ghost" aria-label="取消">取消</button>
          <button @click="saveItem" :disabled="saving" class="btn btn-primary" aria-label="保存">
            {{ saving ? '保存中...' : '保存' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Foreshadow } from '~/types'
import { useForeshadowApi } from '~/composables/useForeshadowApi'

const props = defineProps<{ novelId: number }>()
const foreshadowApi = useForeshadowApi()

const loading = ref(false)
const items = ref<Foreshadow[]>([])
const showUnfulfilledOnly = ref(false)
const showModal = ref(false)
const editingItem = ref<Foreshadow | null>(null)
const saving = ref(false)
const modalError = ref('')

const form = reactive({ title: '', description: '', status: 'planted' as Foreshadow['status'] })

const displayList = computed(() =>
  showUnfulfilledOnly.value ? items.value.filter(i => i.status === 'planted') : items.value
)

function statusLabel(s: string) {
  return s === 'planted' ? '未兑现' : s === 'paid_off' ? '已兑现' : '已放弃'
}
function statusClass(s: string) {
  return s === 'planted' ? 'bg-yellow-100 text-yellow-800' :
         s === 'paid_off' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
}

async function load() {
  loading.value = true
  try {
    const res = await foreshadowApi.list(props.novelId)
    items.value = res?.data ?? []
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editingItem.value = null
  form.title = ''; form.description = ''; form.status = 'planted'
  modalError.value = ''
  showModal.value = true
}

function editItem(item: Foreshadow) {
  editingItem.value = item
  form.title = item.title
  form.description = item.description ?? ''
  form.status = item.status
  modalError.value = ''
  showModal.value = true
}

async function saveItem() {
  if (!form.title.trim()) { modalError.value = '请输入标题'; return }
  saving.value = true
  try {
    if (editingItem.value) {
      await foreshadowApi.update(props.novelId, editingItem.value.id, { ...form })
    } else {
      await foreshadowApi.create(props.novelId, { ...form })
    }
    showModal.value = false
    await load()
  } catch (e: any) {
    modalError.value = e?.message ?? '保存失败'
  } finally {
    saving.value = false
  }
}

async function markPaidOff(item: Foreshadow) {
  await foreshadowApi.update(props.novelId, item.id, { status: 'paid_off' })
  await load()
}

async function deleteItem(id: number) {
  if (!confirm('确认删除此伏笔？')) return
  await foreshadowApi.remove(props.novelId, id)
  await load()
}

onMounted(load)
</script>
