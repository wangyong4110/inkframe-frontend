<script setup lang="ts">
definePageMeta({ layout: 'sysadmin' })

const api = useSysAdminApi()
const experiments = ref<Record<string, any>[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.listExperiments(page.value, pageSize)
    const d = (res as any)?.data ?? res
    experiments.value = d.items ?? []
    total.value = d.total ?? 0
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(page, load)

const totalPages = computed(() => Math.ceil(total.value / pageSize))
</script>

<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-xl font-bold text-white">AI 实验</h1>
      <span class="text-sm text-gray-400">共 {{ total }} 个实验</span>
    </div>

    <div v-if="loading" class="text-gray-400 text-sm">加载中...</div>
    <div v-else-if="error" class="text-red-400 text-sm">{{ error }}</div>
    <div v-else>
      <div v-if="experiments.length === 0" class="text-gray-500 text-sm">暂无实验记录</div>
      <table v-else class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-700 text-gray-400 text-left">
            <th class="pb-2 pr-4">ID</th>
            <th class="pb-2 pr-4">名称</th>
            <th class="pb-2 pr-4">状态</th>
            <th class="pb-2 pr-4">租户</th>
            <th class="pb-2">创建时间</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800">
          <tr v-for="exp in experiments" :key="exp.id" class="text-gray-300">
            <td class="py-2 pr-4 text-gray-500">{{ exp.id }}</td>
            <td class="py-2 pr-4">{{ exp.name || exp.title || '—' }}</td>
            <td class="py-2 pr-4 text-xs">{{ exp.status || '—' }}</td>
            <td class="py-2 pr-4 text-gray-400">{{ exp.tenant_id || '—' }}</td>
            <td class="py-2 text-xs text-gray-500">{{ exp.created_at ? new Date(exp.created_at).toLocaleDateString() : '—' }}</td>
          </tr>
        </tbody>
      </table>

      <div v-if="totalPages > 1" class="flex gap-2 mt-4 justify-end">
        <button :disabled="page <= 1" class="px-3 py-1 text-sm rounded bg-gray-800 disabled:opacity-40 hover:bg-gray-700" @click="page--">上一页</button>
        <span class="px-3 py-1 text-sm text-gray-400">{{ page }} / {{ totalPages }}</span>
        <button :disabled="page >= totalPages" class="px-3 py-1 text-sm rounded bg-gray-800 disabled:opacity-40 hover:bg-gray-700" @click="page++">下一页</button>
      </div>
    </div>
  </div>
</template>
