<script setup lang="ts">
const novelStore = useNovelStore()

// Fetch novels on mount
onMounted(() => {
  novelStore.fetchNovels()
})

const stats = computed(() => [
  {
    label: '进行中项目',
    value: novelStore.novelsByStatus('writing').length,
    icon: 'writing',
    color: 'primary',
  },
  {
    label: '已完成项目',
    value: novelStore.novelsByStatus('completed').length,
    icon: 'completed',
    color: 'success',
  },
  {
    label: '总章节数',
    value: novelStore.totalChapters,
    icon: 'chapters',
    color: 'warning',
  },
  {
    label: '总字数',
    value: formatNumber(novelStore.totalWords),
    icon: 'words',
    color: 'info',
  },
])

const recentNovels = computed(() => {
  return [...novelStore.novels]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5)
})

const features = [
  {
    title: '智能小说生成',
    description: '基于AI技术，自动生成高质量的中长篇小说，支持多种题材',
    icon: 'book-open',
    color: 'primary',
  },
  {
    title: '世界观管理',
    description: '完整的世界观设定系统，确保作品的一致性和连贯性',
    icon: 'globe',
    color: 'success',
  },
  {
    title: '角色追踪',
    description: '角色全生命周期管理，跟踪角色发展和关系变化',
    icon: 'users',
    color: 'warning',
  },
  {
    title: '视频生成',
    description: '从小说内容自动生成配套视频，一键成片',
    icon: 'video',
    color: 'error',
  },
  {
    title: '多模型支持',
    description: '支持多种AI模型，灵活选择最优方案',
    icon: 'cpu',
    color: 'info',
  },
  {
    title: '质量控制',
    description: '全方位的一致性检查，确保作品质量',
    icon: 'shield',
    color: 'primary',
  },
]

function formatNumber(num: number): string {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + 'w'
  }
  return num.toLocaleString()
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))

  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days}天前`
  if (days < 30) return `${Math.floor(days / 7)}周前`
  return `${Math.floor(days / 30)}月前`
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    planning: 'bg-blue-100 text-blue-800',
    writing: 'bg-yellow-100 text-yellow-800',
    paused: 'bg-gray-100 text-gray-800',
    completed: 'bg-green-100 text-green-800',
    archived: 'bg-gray-100 text-gray-600',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    planning: '规划中',
    writing: '创作中',
    paused: '已暂停',
    completed: '已完成',
    archived: '已归档',
  }
  return labels[status] || status
}
</script>

<template>
  <div class="space-y-8">
    <!-- Hero Section -->
    <section class="relative overflow-hidden rounded-2xl bg-gradient-primary p-8 md:p-12">
      <div class="relative z-10">
        <h1 class="text-3xl md:text-4xl font-bold text-white mb-4">
          欢迎使用 InkFrame
        </h1>
        <p class="text-lg text-primary-100 mb-6 max-w-2xl">
          基于AI的智能小说创作平台，帮助你从零开始创作高质量的中长篇小说，
          并自动生成配套的视频内容。
        </p>
        <div class="flex flex-wrap gap-4">
          <NuxtLink to="/novel/create" class="btn bg-white text-primary-600 hover:bg-primary-50">
            创建新项目
          </NuxtLink>
          <NuxtLink to="/import" class="btn bg-primary-700 text-white hover:bg-primary-800">
            导入小说
          </NuxtLink>
          <NuxtLink to="/novel" class="btn bg-primary-800/50 text-white hover:bg-primary-800">
            查看项目
          </NuxtLink>
        </div>
      </div>
      <div class="absolute right-0 bottom-0 opacity-10">
        <svg class="w-64 h-64" fill="currentColor" viewBox="0 0 24 24">
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
        </svg>
      </div>
    </section>

    <!-- Stats Section -->
    <section class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div
        v-for="stat in stats"
        :key="stat.label"
        class="card p-6"
      >
        <div class="flex items-center space-x-4">
          <div
            class="w-12 h-12 rounded-lg flex items-center justify-center"
            :class="{
              'bg-primary-100 text-primary-600': stat.color === 'primary',
              'bg-success-100 text-success-600': stat.color === 'success',
              'bg-warning-100 text-warning-600': stat.color === 'warning',
              'bg-blue-100 text-blue-600': stat.color === 'info',
            }"
          >
            <svg v-if="stat.icon === 'writing'" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            <svg v-else-if="stat.icon === 'completed'" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <svg v-else-if="stat.icon === 'chapters'" class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <svg v-else class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ stat.value }}</p>
            <p class="text-sm text-gray-500 dark:text-gray-400">{{ stat.label }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Recent Novels -->
    <section>
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold text-gray-900 dark:text-white">最近项目</h2>
        <NuxtLink to="/novel" class="text-primary-600 hover:text-primary-700 text-sm font-medium">
          查看全部
        </NuxtLink>
      </div>

      <div v-if="novelStore.loading" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div v-for="i in 3" :key="i" class="card p-6">
          <div class="skeleton h-6 w-3/4 mb-4"></div>
          <div class="skeleton h-4 w-full mb-2"></div>
          <div class="skeleton h-4 w-2/3"></div>
        </div>
      </div>

      <div v-else-if="recentNovels.length === 0" class="card p-8 text-center">
        <svg class="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">暂无项目</h3>
        <p class="text-gray-500 dark:text-gray-400 mb-4">创建你的第一个小说项目，开始创作之旅</p>
        <NuxtLink to="/novel/create" class="btn-primary">
          创建项目
        </NuxtLink>
      </div>

      <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <NuxtLink
          v-for="novel in recentNovels"
          :key="novel.id"
          :to="`/novel/${novel.id}`"
          class="card p-6 hover:shadow-medium transition-shadow"
        >
          <div class="flex items-start justify-between mb-3">
            <h3 class="text-lg font-semibold text-gray-900 dark:text-white line-clamp-1">
              {{ novel.title }}
            </h3>
            <span
              class="px-2 py-1 text-xs font-medium rounded-full"
              :class="getStatusColor(novel.status)"
            >
              {{ getStatusLabel(novel.status) }}
            </span>
          </div>
          <p class="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-4">
            {{ novel.description || '暂无描述' }}
          </p>
          <div class="flex items-center justify-between text-sm">
            <span class="text-gray-500 dark:text-gray-400">
              {{ novel.chapter_count }} 章 · {{ formatNumber(novel.total_words) }} 字
            </span>
            <span class="text-gray-400 dark:text-gray-500">
              {{ formatDate(novel.updated_at) }}
            </span>
          </div>
        </NuxtLink>
      </div>
    </section>

    <!-- Features -->
    <section>
      <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-4">核心功能</h2>
      <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="feature in features"
          :key="feature.title"
          class="card p-6"
        >
          <div
            class="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
            :class="{
              'bg-primary-100 text-primary-600': feature.color === 'primary',
              'bg-success-100 text-success-600': feature.color === 'success',
              'bg-warning-100 text-warning-600': feature.color === 'warning',
              'bg-error-100 text-error-600': feature.color === 'error',
              'bg-blue-100 text-blue-600': feature.color === 'info',
            }"
          >
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            {{ feature.title }}
          </h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            {{ feature.description }}
          </p>
        </div>
      </div>
    </section>
  </div>
</template>
