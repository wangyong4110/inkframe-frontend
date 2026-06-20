<script setup lang="ts">
import type { TenantStorageInfo } from '~/types/sysadmin'

definePageMeta({ layout: 'sysadmin' })

const api = useSysAdminApi()
const data = ref<TenantStorageInfo[]>([])
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    const res = await api.getAssetGovernance()
    data.value = (res as any)?.data ?? res
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})

const totalMB = computed(() => data.value.reduce((s, d) => s + d.used_mb, 0))
const totalAssets = computed(() => data.value.reduce((s, d) => s + d.asset_count, 0))
</script>

<template>
  <div class="p-6">
    <h1 class="text-xl font-bold text-white mb-2">资产治理</h1>
    <p class="text-sm text-gray-400 mb-6">按租户统计存储占用</p>

    <div v-if="loading" class="text-gray-400 text-sm">加载中...</div>
    <div v-else-if="error" class="text-red-400 text-sm">{{ error }}</div>
    <div v-else>
      <div class="grid grid-cols-2 gap-4 max-w-md mb-6">
        <div class="bg-gray-800 rounded-lg p-4 border border-gray-700 text-center">
          <div class="text-2xl font-bold text-indigo-400">{{ totalMB.toFixed(1) }} MB</div>
          <div class="text-xs text-gray-400 mt-1">总存储用量</div>
        </div>
        <div class="bg-gray-800 rounded-lg p-4 border border-gray-700 text-center">
          <div class="text-2xl font-bold text-purple-400">{{ totalAssets }}</div>
          <div class="text-xs text-gray-400 mt-1">总资产数量</div>
        </div>
      </div>

      <table class="w-full text-sm max-w-2xl">
        <thead>
          <tr class="border-b border-gray-700 text-gray-400 text-left">
            <th class="pb-2 pr-4">租户</th>
            <th class="pb-2 pr-4">存储占用</th>
            <th class="pb-2">资产数量</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800">
          <tr v-for="row in data" :key="row.tenant_id" class="text-gray-300">
            <td class="py-2 pr-4">
              <span class="text-gray-400 text-xs mr-2">#{{ row.tenant_id }}</span>
              <NuxtLink :to="`/sysadmin/tenants/${row.tenant_id}`" class="text-indigo-400 hover:text-indigo-300">{{ row.tenant_name }}</NuxtLink>
            </td>
            <td class="py-2 pr-4">
              <div class="flex items-center gap-2">
                <div class="w-24 h-1.5 bg-gray-700 rounded">
                  <div
                    class="h-full bg-indigo-500 rounded"
                    :style="{ width: Math.min(100, (row.used_mb / (totalMB || 1)) * 100) + '%' }"
                  />
                </div>
                <span class="text-xs">{{ row.used_mb.toFixed(1) }} MB</span>
              </div>
            </td>
            <td class="py-2">{{ row.asset_count }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
