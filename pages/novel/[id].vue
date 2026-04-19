<script setup lang="ts">
import type { Novel, Chapter, Character } from '~/types'

const route = useRoute()
const router = useRouter()
const novelId = parseInt(route.params.id as string)

const novelStore = useNovelStore()
const chapterStore = useChapterStore()
const characterStore = useCharacterStore()

const activeTab = ref('chapters')
const showChapterModal = ref(false)
const showCharacterModal = ref(false)
const generatingOutline = ref(false)

const novel = computed(() => novelStore.currentNovel)
const chapters = computed(() => chapterStore.chapters)
const characters = computed(() => characterStore.characters)

const tabs = [
  { key: 'chapters', label: '章节', icon: 'book-open' },
  { key: 'characters', label: '角色', icon: 'users' },
  { key: 'worldview', label: '世界观', icon: 'globe' },
  { key: 'settings', label: '设置', icon: 'settings' },
]

onMounted(async () => {
  await Promise.all([
    novelStore.fetchNovel(novelId),
    chapterStore.fetchChapters(novelId),
    characterStore.fetchCharacters(novelId),
  ])
})

function goToChapter(chapter: Chapter) {
  router.push(`/novel/${novelId}/chapter/${chapter.chapter_no}`)
}

function goToCharacter(character: Character) {
  router.push(`/character/${character.id}`)
}

async function handleGenerateOutline() {
  if (!novel.value) return
  generatingOutline.value = true
  try {
    const result = await novelStore.generateOutline(novelId, 10)
    // 处理大纲结果
    console.log('Outline generated:', result)
  } catch (e) {
    console.error('Failed to generate outline:', e)
  } finally {
    generatingOutline.value = false
  }
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    generating: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-green-100 text-green-800',
    published: 'bg-blue-100 text-blue-800',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: '草稿',
    generating: '生成中',
    completed: '已完成',
    published: '已发布',
  }
  return labels[status] || status
}

function getRoleColor(role: string): string {
  const colors: Record<string, string> = {
    protagonist: 'bg-red-100 text-red-800',
    antagonist: 'bg-purple-100 text-purple-800',
    supporting: 'bg-blue-100 text-blue-800',
    minor: 'bg-gray-100 text-gray-800',
  }
  return colors[role] || 'bg-gray-100 text-gray-800'
}

function getRoleLabel(role: string): string {
  const labels: Record<string, string> = {
    protagonist: '主角',
    antagonist: '反派',
    supporting: '配角',
    minor: '路人',
  }
  return labels[role] || role
}
</script>

<template>
  <div class="space-y-6">
    <!-- Novel Header -->
    <div v-if="novel" class="card">
      <div class="p-6">
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">
              {{ novel.title }}
            </h1>
            <p class="text-gray-500 dark:text-gray-400 mb-4">
              {{ novel.description || '暂无描述' }}
            </p>
            <div class="flex flex-wrap items-center gap-3">
              <span class="tag tag-primary">{{ novel.genre }}</span>
              <span class="text-sm text-gray-500 dark:text-gray-400">
                {{ novel.chapter_count }} 章
              </span>
              <span class="text-sm text-gray-500 dark:text-gray-400">
                {{ novel.total_words.toLocaleString() }} 字
              </span>
            </div>
          </div>
          <div class="flex items-center space-x-2">
            <NuxtLink
              :to="`/video/create?novel_id=${novelId}`"
              class="btn-outline"
            >
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              生成视频
            </NuxtLink>
            <button class="btn-primary" @click="handleGenerateOutline">
              <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              生成大纲
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Tabs -->
    <div class="border-b border-gray-200 dark:border-gray-700">
      <nav class="flex space-x-8">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="py-4 px-1 border-b-2 font-medium text-sm transition-colors"
          :class="[
            activeTab === tab.key
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          ]"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </nav>
    </div>

    <!-- Chapters Tab -->
    <div v-if="activeTab === 'chapters'" class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">章节列表</h2>
        <NuxtLink
          :to="`/novel/${novelId}/chapter/new`"
          class="btn-primary"
        >
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          新建章节
        </NuxtLink>
      </div>

      <div v-if="chapterStore.loading" class="space-y-3">
        <div v-for="i in 5" :key="i" class="card p-4">
          <div class="skeleton h-5 w-1/3 mb-2"></div>
          <div class="skeleton h-4 w-2/3"></div>
        </div>
      </div>

      <div v-else-if="chapters.length === 0" class="card p-8 text-center">
        <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
        <p class="text-gray-500 dark:text-gray-400">还没有章节，创建你的第一章</p>
      </div>

      <div v-else class="space-y-3">
        <div
          v-for="chapter in chapters"
          :key="chapter.id"
          class="card p-4 hover:shadow-soft transition-shadow cursor-pointer"
          @click="goToChapter(chapter)"
        >
          <div class="flex items-center justify-between">
            <div class="flex-1">
              <div class="flex items-center space-x-3">
                <span class="text-lg font-medium text-gray-900 dark:text-white">
                  第{{ chapter.chapter_no }}章
                </span>
                <span class="text-gray-500 dark:text-gray-400">{{ chapter.title }}</span>
              </div>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-1">
                {{ chapter.summary || '暂无摘要' }}
              </p>
            </div>
            <div class="flex items-center space-x-4">
              <span class="text-sm text-gray-500 dark:text-gray-400">
                {{ chapter.word_count.toLocaleString() }} 字
              </span>
              <span
                class="px-2 py-0.5 text-xs font-medium rounded"
                :class="getStatusColor(chapter.status)"
              >
                {{ getStatusLabel(chapter.status) }}
              </span>
              <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Characters Tab -->
    <div v-if="activeTab === 'characters'" class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white">角色列表</h2>
        <NuxtLink to="/character/create" class="btn-primary">
          <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          新建角色
        </NuxtLink>
      </div>

      <div v-if="characterStore.loading" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div v-for="i in 4" :key="i" class="card p-4">
          <div class="skeleton h-20 w-20 rounded-full mb-3"></div>
          <div class="skeleton h-5 w-1/2 mb-2"></div>
          <div class="skeleton h-4 w-3/4"></div>
        </div>
      </div>

      <div v-else-if="characters.length === 0" class="card p-8 text-center">
        <svg class="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <p class="text-gray-500 dark:text-gray-400">还没有角色，创建你的第一个角色</p>
      </div>

      <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="character in characters"
          :key="character.id"
          class="card p-4 hover:shadow-soft transition-shadow cursor-pointer"
          @click="goToCharacter(character)"
        >
          <div class="flex items-start space-x-4">
            <div class="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span class="text-2xl font-bold text-primary-600">{{ character.name.charAt(0) }}</span>
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center space-x-2">
                <h3 class="text-lg font-medium text-gray-900 dark:text-white truncate">
                  {{ character.name }}
                </h3>
                <span
                  class="px-2 py-0.5 text-xs font-medium rounded"
                  :class="getRoleColor(character.role)"
                >
                  {{ getRoleLabel(character.role) }}
                </span>
              </div>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
                {{ character.personality || '暂无性格描述' }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Worldview Tab -->
    <div v-if="activeTab === 'worldview'" class="card p-6">
      <div class="text-center py-12">
        <svg class="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">世界观设定</h3>
        <p class="text-gray-500 dark:text-gray-400 mb-4">
          {{ novel?.worldview_id ? '查看和编辑世界观设定' : '为此小说创建世界观设定' }}
        </p>
        <NuxtLink
          :to="novel?.worldview_id ? `/worldview/${novel.worldview_id}` : `/worldview/create?novel_id=${novelId}`"
          class="btn-primary"
        >
          {{ novel?.worldview_id ? '查看世界观' : '创建世界观' }}
        </NuxtLink>
      </div>
    </div>

    <!-- Settings Tab -->
    <div v-if="activeTab === 'settings'" class="card p-6">
      <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-4">项目设置</h3>
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            项目名称
          </label>
          <input
            type="text"
            :value="novel?.title"
            class="input"
            @change="(e) => novelStore.updateNovel(novelId, { title: (e.target as HTMLInputElement).value })"
          />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            项目描述
          </label>
          <textarea
            :value="novel?.description"
            rows="3"
            class="input"
            @change="(e) => novelStore.updateNovel(novelId, { description: (e.target as HTMLTextAreaElement).value })"
          ></textarea>
        </div>
        <div class="pt-4 border-t border-gray-200 dark:border-gray-700">
          <button class="btn-error">删除项目</button>
        </div>
      </div>
    </div>
  </div>
</template>
