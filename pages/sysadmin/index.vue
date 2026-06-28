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


  </div>
</template>
