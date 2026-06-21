<script setup lang="ts">
useHead({ title: '我的小说 - 简影' })

const novelStore = useNovelStore()

const filters = ref({
  status: '' as string,
  genre: '' as string,
})

const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '规划中', value: 'planning' },
  { label: '创作中', value: 'writing' },
  { label: '已暂停', value: 'paused' },
  { label: '已完成', value: 'completed' },
]

const genreOptions = [
  { label: '全部类型', value: '' },
  { label: '玄幻奇幻', value: '玄幻奇幻' },
  { label: '仙侠修仙', value: '仙侠修仙' },
  { label: '都市现代', value: '都市现代' },
  { label: '言情爱情', value: '言情爱情' },
  { label: '历史古代', value: '历史古代' },
  { label: '科幻未来', value: '科幻未来' },
  { label: '悬疑推理', value: '悬疑推理' },
  { label: '武侠江湖', value: '武侠江湖' },
  { label: '灵异恐怖', value: '灵异恐怖' },
  { label: '游戏竞技', value: '游戏竞技' },
  { label: '军事战争', value: '军事战争' },
  { label: '体育竞技', value: '体育竞技' },
  { label: '青春校园', value: '青春校园' },
  { label: '末世废土', value: '末世废土' },
  { label: '重生穿越', value: '重生穿越' },
  { label: '宫斗宅斗', value: '宫斗宅斗' },
  { label: '系统流', value: '系统流' },
  { label: '童话寓言', value: '童话寓言' },
  { label: '其他', value: '其他' },
]

onMounted(() => {
  novelStore.fetchNovels()
})

watch(() => novelStore.pagination.page, () => {
  window.scrollTo({ top: 0, behavior: 'smooth' })
})

function applyFilters() {
  novelStore.setFilters({
    status: filters.value.status as any || undefined,
    genre: filters.value.genre as any || undefined,
  })
}

function handleStatusChange(value: string) {
  filters.value.status = value
  applyFilters()
}

function handleGenreChange(value: string) {
  filters.value.genre = value
  applyFilters()
}


function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    planning: 'bg-blue-500/20 text-blue-300',
    writing: 'bg-yellow-500/20 text-yellow-300',
    paused: 'bg-gray-500/20 text-gray-400',
    completed: 'bg-green-500/20 text-green-300',
    archived: 'bg-gray-500/20 text-gray-500',
  }
  return colors[status] || 'bg-gray-500/20 text-gray-400'
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

function getGenreLabel(genre: string): string {
  const labels: Record<string, string> = {
    fantasy: '玄幻奇幻', xianxia: '仙侠修仙', urban: '都市现代',
    romance: '言情爱情', historical: '历史古代', scifi: '科幻未来',
    mystery: '悬疑推理', wuxia: '武侠江湖', horror: '灵异恐怖',
    game: '游戏竞技', military: '军事战争', sports: '体育竞技',
    campus: '青春校园', apocalypse: '末世废土', rebirth: '重生穿越',
    palace: '宫斗宅斗', system: '系统流', fairytale: '童话寓言', other: '其他',
  }
  return labels[genre] || genre
}

function formatNumber(num: number): string {
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + 'w'
  }
  return num.toLocaleString()
}

const iconGradients: Record<string, string> = {
  purple: 'linear-gradient(135deg,#8B5CF6,#3B82F6)',
  blue:   'linear-gradient(135deg,#3B82F6,#06B6D4)',
  green:  'linear-gradient(135deg,#10B981,#84CC16)',
  orange: 'linear-gradient(135deg,#F59E0B,#EF4444)',
  red:    'linear-gradient(135deg,#EF4444,#EC4899)',
  pink:   'linear-gradient(135deg,#EC4899,#8B5CF6)',
  teal:   'linear-gradient(135deg,#14B8A6,#3B82F6)',
  indigo: 'linear-gradient(135deg,#6366F1,#8B5CF6)',
  amber:  'linear-gradient(135deg,#F59E0B,#84CC16)',
  cyan:   'linear-gradient(135deg,#06B6D4,#10B981)',
}

function isImageUrl(v?: string): boolean {
  return !!v && (v.startsWith('http://') || v.startsWith('https://') || v.startsWith('/'))
}

function novelIconStyle(coverImage?: string): string {
  if (isImageUrl(coverImage)) {
    return `background-image:url(${coverImage});background-size:cover;background-position:center`
  }
  if (coverImage && iconGradients[coverImage]) {
    return `background:${iconGradients[coverImage]}`
  }
  return 'background:linear-gradient(135deg,#8B5CF6,#3B82F6)'
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

</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-white">项目</h1>
        <p class="mt-1 text-sm text-gray-400">
          管理你的所有小说创作项目
        </p>
      </div>
      <div class="flex items-center gap-2">
        <NuxtLink to="/novel/create" class="btn-primary">
          <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          新建项目
        </NuxtLink>
      </div>
    </div>

    <!-- Filters -->
    <div class="card p-4">
      <div class="flex flex-wrap gap-4">
        <div class="flex items-center space-x-2">
          <label class="text-sm font-medium text-gray-400">状态:</label>
          <select
            :value="filters.status"
            @change="handleStatusChange(($event.target as HTMLSelectElement).value)"
            class="input w-40"
          >
            <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
        <div class="flex items-center space-x-2">
          <label class="text-sm font-medium text-gray-400">类型:</label>
          <select
            :value="filters.genre"
            @change="handleGenreChange(($event.target as HTMLSelectElement).value)"
            class="input w-40"
          >
            <option v-for="opt in genreOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </option>
          </select>
        </div>
      </div>
    </div>

    <!-- Novel List -->
    <div v-if="novelStore.loading" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <div v-for="i in 6" :key="i" class="card p-6">
        <div class="skeleton h-6 w-3/4 mb-4"></div>
        <div class="skeleton h-4 w-full mb-2"></div>
        <div class="skeleton h-4 w-2/3 mb-4"></div>
        <div class="skeleton h-8 w-full"></div>
      </div>
    </div>

    <div v-else-if="novelStore.novels.length === 0" class="card p-12 text-center">
      <svg class="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
      <h3 class="text-lg font-medium text-white mb-2">暂无项目</h3>
      <p class="text-gray-400 mb-6">创建你的第一个小说项目，开始创作之旅</p>
      <NuxtLink to="/novel/create" class="btn-primary">
        创建项目
      </NuxtLink>
    </div>

    <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      <NuxtLink
        v-for="novel in novelStore.novels"
        :key="novel.id"
        :to="`/novel/${novel.id}`"
        class="card overflow-hidden hover:shadow-medium transition-shadow block"
      >
        <!-- Cover / icon -->
        <div
          class="h-32 flex items-center justify-center"
          :style="novelIconStyle(novel.cover_image)"
        >
          <span v-if="!isImageUrl(novel.cover_image)" class="text-sm font-semibold text-white opacity-70 text-center px-4 leading-snug line-clamp-4">{{ novel.title }}</span>
        </div>
        <div class="p-4">
          <div class="flex items-start justify-between mb-2">
            <h3 class="text-lg font-semibold text-white line-clamp-1 flex-1 min-w-0 mr-2">
              {{ novel.title }}
            </h3>
            <span
              class="px-2 py-0.5 text-xs font-medium rounded-full flex-shrink-0"
              :class="getStatusColor(novel.status)"
            >
              {{ getStatusLabel(novel.status) }}
            </span>
          </div>
          <p class="text-sm text-gray-400 line-clamp-2 mb-4">
            {{ novel.description || '暂无描述' }}
          </p>
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-3 text-sm text-gray-400">
              <span class="tag tag-primary">{{ getGenreLabel(novel.genre) }}</span>
            </div>
            <span class="text-sm text-gray-500">
              {{ novel.chapter_count }} 章
            </span>
          </div>
          <div class="mt-3 pt-3 border-t border-gray-800">
            <div class="flex items-center justify-between text-sm">
              <span class="text-gray-400">
                {{ formatNumber(novel.total_words) }} 字
              </span>
              <span class="text-gray-500">
                {{ formatDate(novel.updated_at) }}
              </span>
            </div>
          </div>
        </div>
      </NuxtLink>
    </div>

    <!-- Pagination -->
    <div v-if="novelStore.pagination.total > novelStore.pagination.pageSize" class="flex justify-center">
      <nav class="flex items-center space-x-2">
        <button
          :disabled="novelStore.pagination.page === 1"
          class="btn-ghost"
          @click="novelStore.setPage(novelStore.pagination.page - 1)"
        >
          上一页
        </button>
        <span class="px-4 py-2 text-sm text-gray-400">
          第 {{ novelStore.pagination.page }} / {{ Math.ceil(novelStore.pagination.total / novelStore.pagination.pageSize) }} 页
        </span>
        <button
          :disabled="novelStore.pagination.page >= Math.ceil(novelStore.pagination.total / novelStore.pagination.pageSize)"
          class="btn-ghost"
          @click="novelStore.setPage(novelStore.pagination.page + 1)"
        >
          下一页
        </button>
      </nav>
    </div>
  </div>
</template>

