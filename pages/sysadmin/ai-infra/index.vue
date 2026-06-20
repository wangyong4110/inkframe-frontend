<script setup lang="ts">
import type { AIInfraStats } from '~/types/sysadmin'

definePageMeta({ layout: 'sysadmin' })

const api = useSysAdminApi()
const stats = ref<AIInfraStats | null>(null)
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    const res = await api.getAIInfra()
    stats.value = (res as any)?.data ?? res
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="p-6">
    <h1 class="text-xl font-bold text-white mb-6">AI 基础设施</h1>

    <div v-if="loading" class="text-gray-400 text-sm">加载中...</div>
    <div v-else-if="error" class="text-red-400 text-sm">{{ error }}</div>
    <div v-else-if="stats" class="grid grid-cols-2 gap-4 max-w-md">
      <div class="bg-gray-800 rounded-lg p-5 border border-gray-700 text-center">
        <div class="text-3xl font-bold text-indigo-400 mb-1">{{ stats.provider_count }}</div>
        <div class="text-sm text-gray-400">AI 提供商</div>
      </div>
      <div class="bg-gray-800 rounded-lg p-5 border border-gray-700 text-center">
        <div class="text-3xl font-bold text-purple-400 mb-1">{{ stats.model_count }}</div>
        <div class="text-sm text-gray-400">AI 模型</div>
      </div>
    </div>

    <div class="mt-6">
      <p class="text-sm text-gray-400">AI 提供商和模型的详细配置可在租户的 <NuxtLink to="/model" class="text-indigo-400 hover:underline">模型管理</NuxtLink> 页面管理。</p>
    </div>
  </div>
</template>
