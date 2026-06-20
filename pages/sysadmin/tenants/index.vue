<script setup lang="ts">
import type { SysTenant } from '~/types/sysadmin'

definePageMeta({ layout: 'sysadmin' })

const api = useSysAdminApi()
const tenants = ref<SysTenant[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const search = ref('')
const statusFilter = ref('')
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.listTenants(page.value, pageSize, search.value, statusFilter.value)
    const d = (res as any)?.data ?? res
    tenants.value = d.items ?? []
    total.value = d.total ?? 0
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch([page, statusFilter], load)

function handleSearch() {
  page.value = 1
  load()
}

const totalPages = computed(() => Math.ceil(total.value / pageSize))

const statusColor: Record<string, string> = {
  active: 'text-green-400',
  suspended: 'text-yellow-400',
  banned: 'text-red-400',
}

async function suspendTenant(t: SysTenant) {
  const newStatus = t.status === 'active' ? 'suspended' : 'active'
  try {
    await api.updateTenant(t.id, { status: newStatus })
    t.status = newStatus
  } catch (e: any) {
    alert(e.message)
  }
}
</script>

<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-xl font-bold text-white">租户管理</h1>
      <span class="text-sm text-gray-400">共 {{ total }} 个租户</span>
    </div>

    <!-- Filters -->
    <div class="flex gap-3 mb-4">
      <input
        v-model="search"
        type="text"
        placeholder="搜索名称或代码..."
        class="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white w-60"
        @keydown.enter="handleSearch"
      />
      <select
        v-model="statusFilter"
        class="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
        @change="page = 1; load()"
      >
        <option value="">全部状态</option>
        <option value="active">正常</option>
        <option value="suspended">已暂停</option>
        <option value="banned">已封禁</option>
      </select>
      <button
        class="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-3 py-1.5 rounded"
        @click="handleSearch"
      >搜索</button>
    </div>

    <div v-if="loading" class="text-gray-400 text-sm">加载中...</div>
    <div v-else-if="error" class="text-red-400 text-sm">{{ error }}</div>
    <div v-else>
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-700 text-gray-400 text-left">
            <th class="pb-2 pr-4">ID</th>
            <th class="pb-2 pr-4">名称</th>
            <th class="pb-2 pr-4">代码</th>
            <th class="pb-2 pr-4">套餐</th>
            <th class="pb-2 pr-4">状态</th>
            <th class="pb-2 pr-4">用户数</th>
            <th class="pb-2 pr-4">到期时间</th>
            <th class="pb-2">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800">
          <tr v-for="t in tenants" :key="t.id" class="text-gray-300">
            <td class="py-2 pr-4 text-gray-500">{{ t.id }}</td>
            <td class="py-2 pr-4">
              <NuxtLink :to="`/sysadmin/tenants/${t.id}`" class="text-indigo-400 hover:text-indigo-300">
                {{ t.name }}
              </NuxtLink>
            </td>
            <td class="py-2 pr-4 font-mono text-xs text-gray-400">{{ t.code }}</td>
            <td class="py-2 pr-4">
              <span class="px-1.5 py-0.5 rounded text-xs bg-gray-700">{{ t.plan }}</span>
            </td>
            <td class="py-2 pr-4">
              <span :class="statusColor[t.status] || 'text-gray-400'">{{ t.status }}</span>
            </td>
            <td class="py-2 pr-4">{{ t.used_users }}</td>
            <td class="py-2 pr-4 text-xs text-gray-500">
              {{ t.expires_at ? new Date(t.expires_at).toLocaleDateString() : '永久' }}
            </td>
            <td class="py-2">
              <button
                class="text-xs text-yellow-400 hover:text-yellow-300 mr-3"
                @click="suspendTenant(t)"
              >{{ t.status === 'active' ? '暂停' : '恢复' }}</button>
              <NuxtLink :to="`/sysadmin/tenants/${t.id}`" class="text-xs text-indigo-400 hover:text-indigo-300">
                详情
              </NuxtLink>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="flex gap-2 mt-4 justify-end">
        <button
          :disabled="page <= 1"
          class="px-3 py-1 text-sm rounded bg-gray-800 disabled:opacity-40 hover:bg-gray-700"
          @click="page--"
        >上一页</button>
        <span class="px-3 py-1 text-sm text-gray-400">{{ page }} / {{ totalPages }}</span>
        <button
          :disabled="page >= totalPages"
          class="px-3 py-1 text-sm rounded bg-gray-800 disabled:opacity-40 hover:bg-gray-700"
          @click="page++"
        >下一页</button>
      </div>
    </div>
  </div>
</template>
