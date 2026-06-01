<script setup lang="ts">
import type { KnowledgeBase } from '~/types/index'

const props = defineProps<{ novelId: number }>()

const api = useApi()
const items = ref<KnowledgeBase[]>([])
const total = ref(0)
const searchQuery = ref('')
const page = ref(1)
const loading = ref(false)

// New entry form
const showAddForm = ref(false)
const newItem = reactive({ type: 'character', title: '', content: '', tags: '' })

const fetchItems = async () => {
  loading.value = true
  try {
    const params = new URLSearchParams()
    params.set('page', String(page.value))
    params.set('page_size', '20')
    if (searchQuery.value.trim()) {
      params.set('query', searchQuery.value.trim())
    }
    const res: any = await api.request(`/novels/${props.novelId}/knowledge?${params.toString()}`, {
      method: 'GET',
    })
    const data = res?.data ?? res
    items.value = data?.items || []
    total.value = data?.total || 0
  } catch {
    items.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

const addItem = async () => {
  if (!newItem.title || !newItem.content) return
  try {
    await api.request(`/novels/${props.novelId}/knowledge`, {
      method: 'POST',
      body: JSON.stringify({ ...newItem }),
    })
    Object.assign(newItem, { type: 'character', title: '', content: '', tags: '' })
    showAddForm.value = false
    fetchItems()
  } catch { /* ignore */ }
}

const deleteItem = async (id: number) => {
  try {
    await api.request(`/knowledge/${id}`, { method: 'DELETE' })
    fetchItems()
  } catch { /* ignore */ }
}

const typeLabels: Record<string, string> = {
  character: '角色', location: '地点', item: '物品', event: '事件',
  plot_point: '剧情', worldview: '世界观', other: '其他',
}

watch(searchQuery, useDebounceFn(() => {
  page.value = 1
  fetchItems()
}, 400))

onMounted(fetchItems)
</script>

<template>
  <div>
    <div class="flex items-center gap-3 mb-4">
      <input
        v-model="searchQuery"
        placeholder="搜索知识库..."
        aria-label="搜索知识库"
        class="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
      <button
        class="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors"
        aria-label="新增知识条目"
        @click="showAddForm = !showAddForm"
      >
        + 添加
      </button>
    </div>

    <!-- Add form -->
    <div v-if="showAddForm" class="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 mb-4 space-y-3 border border-gray-200 dark:border-gray-700">
      <div class="flex gap-3">
        <select v-model="newItem.type" class="border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white">
          <option v-for="(label, val) in typeLabels" :key="val" :value="val">{{ label }}</option>
        </select>
        <input
          v-model="newItem.title"
          placeholder="标题"
          class="flex-1 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>
      <textarea
        v-model="newItem.content"
        placeholder="内容"
        rows="3"
        class="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
      <input
        v-model="newItem.tags"
        placeholder="标签（逗号分隔）"
        class="w-full border border-gray-300 dark:border-gray-600 rounded px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
      />
      <div class="flex gap-2 justify-end">
        <button class="px-3 py-1 bg-primary-600 text-white rounded text-sm hover:bg-primary-700" @click="addItem">保存</button>
        <button class="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700" @click="showAddForm = false">取消</button>
      </div>
    </div>

    <!-- Items list -->
    <div v-if="loading" class="space-y-2">
      <div v-for="i in 5" :key="i" class="h-16 bg-gray-100 dark:bg-gray-700 rounded animate-pulse" />
    </div>
    <div v-else-if="items.length === 0" class="text-center py-12 text-gray-400 dark:text-gray-500">
      <div class="text-4xl mb-3">📚</div>
      <div>暂无知识条目</div>
      <div class="text-sm mt-1">点击"添加"手动录入，或通过 AI 分析自动提取</div>
    </div>
    <div v-else class="space-y-2">
      <div
        v-for="item in items"
        :key="item.id"
        class="flex items-start gap-3 p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-sm transition-shadow"
      >
        <span class="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 shrink-0 mt-0.5">
          {{ typeLabels[item.type] || item.type }}
        </span>
        <div class="flex-1 min-w-0">
          <div class="font-medium text-sm text-gray-900 dark:text-white">{{ item.title }}</div>
          <div class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{{ item.content }}</div>
        </div>
        <button class="text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 shrink-0 text-sm" aria-label="删除知识条目" @click="deleteItem(item.id)">✕</button>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="total > 20" class="flex justify-center gap-2 mt-4">
      <button
        :disabled="page <= 1"
        class="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-300 disabled:opacity-30"
        @click="page--; fetchItems()"
      >上一页</button>
      <span class="px-3 py-1 text-sm text-gray-500 dark:text-gray-400">第 {{ page }} 页，共 {{ Math.ceil(total / 20) }} 页</span>
      <button
        :disabled="page >= Math.ceil(total / 20)"
        class="px-3 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm text-gray-700 dark:text-gray-300 disabled:opacity-30"
        @click="page++; fetchItems()"
      >下一页</button>
    </div>
  </div>
</template>
