<script setup lang="ts">
import type { SysTask } from '~/types/sysadmin'

definePageMeta({ layout: 'sysadmin' })

const api = useSysAdminApi()
const tasks = ref<SysTask[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 30
const statusFilter = ref('')
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.listTasks(page.value, pageSize, statusFilter.value)
    const d = (res as any)?.data ?? res
    tasks.value = d.items ?? []
    total.value = d.total ?? 0
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch([page, statusFilter], load)

const totalPages = computed(() => Math.ceil(total.value / pageSize))

const statusColor: Record<string, string> = {
  pending: 'text-yellow-400',
  running: 'text-blue-400',
  completed: 'text-green-400',
  failed: 'text-red-400',
  cancelled: 'text-gray-400',
}

async function cancelTask(t: SysTask) {
  try {
    await api.cancelTask(t.id)
    t.status = 'cancelled'
  } catch (e: any) {
    alert(e.message)
  }
}
</script>

<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-xl font-bold text-white">任务监控</h1>
      <div class="flex gap-3">
        <select
          v-model="statusFilter"
          class="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
          @change="page = 1; load()"
        >
          <option value="">全部状态</option>
          <option value="pending">等待中</option>
          <option value="running">运行中</option>
          <option value="completed">已完成</option>
          <option value="failed">失败</option>
          <option value="cancelled">已取消</option>
        </select>
        <button class="text-sm text-gray-400 hover:text-white" @click="load">刷新</button>
      </div>
    </div>

    <div v-if="loading" class="text-gray-400 text-sm">加载中...</div>
    <div v-else-if="error" class="text-red-400 text-sm">{{ error }}</div>
    <div v-else>
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-700 text-gray-400 text-left">
            <th class="pb-2 pr-4">ID</th>
            <th class="pb-2 pr-4">类型</th>
            <th class="pb-2 pr-4">状态</th>
            <th class="pb-2 pr-4">错误</th>
            <th class="pb-2 pr-4">创建时间</th>
            <th class="pb-2">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800">
          <tr v-for="t in tasks" :key="t.id" class="text-gray-300">
            <td class="py-2 pr-4 text-gray-500">{{ t.id }}</td>
            <td class="py-2 pr-4 text-xs font-mono">{{ t.type }}</td>
            <td class="py-2 pr-4">
              <span :class="statusColor[t.status] || 'text-gray-400'">{{ t.status }}</span>
            </td>
            <td class="py-2 pr-4 text-xs text-red-400 max-w-xs truncate">{{ t.error || '—' }}</td>
            <td class="py-2 pr-4 text-xs text-gray-500">{{ new Date(t.created_at).toLocaleString() }}</td>
            <td class="py-2">
              <button
                v-if="t.status === 'pending' || t.status === 'running'"
                class="text-xs text-red-400 hover:text-red-300"
                @click="cancelTask(t)"
              >取消</button>
            </td>
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
