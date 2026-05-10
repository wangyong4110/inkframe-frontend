<script setup lang="ts">
import type { Novel } from '~/types'

definePageMeta({ auth: false })

useHead({
  title: 'InkFrame 排行榜',
  meta: [{ name: 'description', content: 'InkFrame 小说排行榜' }],
})

const novelApi = usePublicNovelApi()

type Gender = 'male' | 'female'
type RankType = 'hot' | 'new' | 'completed' | 'favorites' | 'updated'

const gender = ref<Gender>('male')
const rankType = ref<RankType>('hot')
const items = ref<Novel[]>([])
const loading = ref(false)

const rankOptions: { key: RankType; label: string }[] = [
  { key: 'hot', label: '大热榜' },
  { key: 'new', label: '新书榜' },
  { key: 'completed', label: '完结榜' },
  { key: 'favorites', label: '收藏榜' },
  { key: 'updated', label: '更新榜' },
]

async function loadRanking() {
  if (loading.value) return
  loading.value = true
  items.value = []
  try {
    const res = await novelApi.getNovelRanking(rankType.value, gender.value)
    items.value = res?.data?.items ?? []
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

watch([gender, rankType], () => loadRanking())
onMounted(() => loadRanking())

const genreLabels: Record<string, string> = {
  fantasy: '玄幻',
  xianxia: '仙侠',
  urban: '都市',
  scifi: '科幻',
  romance: '言情',
  mystery: '悬疑',
  historical: '历史',
}

function formatWords(n?: number) {
  if (!n) return '0字'
  if (n >= 10000) return `${(n / 10000).toFixed(0)}万字`
  return `${n}字`
}

function formatScore(n?: number) {
  if (!n) return '0'
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`
  return String(n)
}

function rankBg(idx: number) {
  if (idx === 0) return 'bg-yellow-500/20 border border-yellow-500/30'
  if (idx === 1) return 'bg-gray-400/10 border border-gray-400/20'
  if (idx === 2) return 'bg-amber-700/10 border border-amber-700/20'
  return 'bg-gray-900 border border-gray-800'
}

function rankNumColor(idx: number) {
  if (idx === 0) return 'text-yellow-400 font-bold'
  if (idx === 1) return 'text-gray-300 font-bold'
  if (idx === 2) return 'text-amber-600 font-bold'
  return 'text-gray-500'
}
</script>

<template>
  <div class="max-w-5xl mx-auto px-4 py-6">
    <!-- Header -->
    <div class="flex items-center gap-3 mb-6">
      <NuxtLink to="/plaza" class="text-gray-400 hover:text-white transition-colors">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
        </svg>
      </NuxtLink>
      <h1 class="text-2xl font-bold text-white">排行榜</h1>
    </div>

    <!-- 性别 Tab -->
    <div class="flex gap-1 bg-gray-800 rounded-xl p-1 w-fit mb-6">
      <button
        v-for="g in [{ key: 'male', label: '男生榜' }, { key: 'female', label: '女生榜' }]"
        :key="g.key"
        @click="gender = g.key as Gender"
        :class="[
          'px-6 py-2 rounded-lg text-sm font-medium transition-all',
          gender === g.key
            ? 'bg-indigo-600 text-white shadow-sm'
            : 'text-gray-400 hover:text-gray-200',
        ]"
      >{{ g.label }}</button>
    </div>

    <div class="flex gap-4">
      <!-- 左侧榜单类型 -->
      <div class="w-32 shrink-0 space-y-1">
        <button
          v-for="opt in rankOptions"
          :key="opt.key"
          @click="rankType = opt.key"
          :class="[
            'w-full text-left px-4 py-3 rounded-xl text-sm font-medium transition-all',
            rankType === opt.key
              ? 'bg-indigo-600 text-white'
              : 'text-gray-400 hover:bg-gray-800 hover:text-white',
          ]"
        >{{ opt.label }}</button>
      </div>

      <!-- 右侧排名列表 -->
      <div class="flex-1 min-w-0">
        <!-- Skeleton -->
        <div v-if="loading" class="space-y-2">
          <div v-for="i in 10" :key="i" class="h-20 bg-gray-800 rounded-xl animate-pulse" />
        </div>

        <!-- Empty -->
        <div v-else-if="!items.length" class="text-center py-16 text-gray-500">
          <p>暂无数据</p>
        </div>

        <!-- List -->
        <div v-else class="space-y-2">
          <NuxtLink
            v-for="(n, idx) in items"
            :key="n.id"
            :to="`/plaza/novel/${n.id}`"
            :class="['flex items-center gap-4 p-4 rounded-xl transition-all hover:opacity-90', rankBg(idx)]"
          >
            <!-- 排名 -->
            <span :class="['w-7 text-center text-base shrink-0', rankNumColor(idx)]">
              {{ idx + 1 }}
            </span>

            <!-- 封面 -->
            <div class="w-12 h-16 rounded-lg overflow-hidden bg-gray-800 shrink-0">
              <img
                v-if="n.cover_image"
                :src="n.cover_image"
                :alt="n.title"
                class="w-full h-full object-cover"
              />
              <div v-else class="w-full h-full flex items-center justify-center">
                <svg class="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                </svg>
              </div>
            </div>

            <!-- 信息 -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 mb-1">
                <p class="text-sm font-semibold text-white truncate">{{ n.title }}</p>
                <span v-if="n.genre" class="shrink-0 text-xs bg-gray-700/80 text-gray-300 px-1.5 py-0.5 rounded">
                  {{ genreLabels[n.genre] ?? n.genre }}
                </span>
                <span v-if="n.status === 'completed'" class="shrink-0 text-xs bg-emerald-900/50 text-emerald-400 px-1.5 py-0.5 rounded">完结</span>
              </div>
              <p v-if="n.description" class="text-xs text-gray-400 truncate">{{ n.description }}</p>
              <p class="text-xs text-gray-500 mt-0.5">{{ formatWords(n.total_words) }}</p>
            </div>

            <!-- 热度 + 阅读 -->
            <div class="text-right shrink-0 flex flex-col items-end gap-1">
              <span class="text-sm font-semibold text-orange-400">{{ formatScore(n.hot_score) }}</span>
              <span class="text-xs bg-indigo-600/20 text-indigo-400 border border-indigo-600/30 px-2 py-0.5 rounded-full">去阅读</span>
            </div>
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
