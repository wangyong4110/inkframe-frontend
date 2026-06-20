<script setup lang="ts">
definePageMeta({ layout: 'sysadmin' })

const api = useSysAdminApi()
const overview = ref<import('~/types/sysadmin').SysOverview | null>(null)
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  try {
    const res = await api.getOverview()
    overview.value = (res as any)?.data ?? res
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})

const cards = computed(() => {
  if (!overview.value) return []
  return [
    { label: '租户总数', value: overview.value.tenant_count, icon: '🏢', color: 'indigo' },
    { label: '用户总数', value: overview.value.user_count, icon: '👥', color: 'blue' },
    { label: '小说总数', value: overview.value.novel_count, icon: '📖', color: 'purple' },
    { label: '章节总数', value: overview.value.chapter_count, icon: '📝', color: 'green' },
    { label: '视频总数', value: overview.value.video_count, icon: '🎬', color: 'orange' },
    { label: '活跃任务', value: overview.value.active_tasks, icon: '⚡', color: 'yellow' },
  ]
})
</script>

<template>
  <div class="p-6">
    <h1 class="text-xl font-bold text-white mb-6">系统概览</h1>

    <div v-if="loading" class="text-gray-400">加载中...</div>
    <div v-else-if="error" class="text-red-400">{{ error }}</div>
    <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-4">
      <div
        v-for="card in cards"
        :key="card.label"
        class="bg-gray-800 rounded-lg p-4 border border-gray-700"
      >
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xl">{{ card.icon }}</span>
          <span class="text-sm text-gray-400">{{ card.label }}</span>
        </div>
        <div class="text-2xl font-bold text-white">{{ card.value.toLocaleString() }}</div>
      </div>
    </div>

    <div class="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <h2 class="text-sm font-semibold text-gray-300 mb-3">快速导航</h2>
        <div class="space-y-2">
          <NuxtLink to="/sysadmin/tenants" class="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300">
            → 管理租户
          </NuxtLink>
          <NuxtLink to="/sysadmin/users" class="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300">
            → 管理用户
          </NuxtLink>
          <NuxtLink to="/sysadmin/tasks" class="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300">
            → 监控任务
          </NuxtLink>
          <NuxtLink to="/sysadmin/settings" class="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300">
            → 系统设置
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
