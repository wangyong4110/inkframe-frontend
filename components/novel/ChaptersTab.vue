<script setup lang="ts">
import type { Chapter } from '~/types'

const props = defineProps<{ novelId: number }>()

const router = useRouter()
const toast = useToast()
const novelStore = useNovelStore()
const chapterStore = useChapterStore()

const generatingOutline = ref(false)
const chapterPage = ref(1)
const CHAPTER_PAGE_SIZE = 20
const showDeleteChapterConfirm = ref(false)
const chapterToDelete = ref<Chapter | null>(null)
const publishingChapterId = ref<number | null>(null)

const { publishChapter, unpublishChapter } = useChapterApi()
const { guardAiProvider } = useAiProviderGuard()

const chapters = computed(() => chapterStore.chapters)
const chapterTotalPages = computed(() => Math.max(1, Math.ceil(chapters.value.length / CHAPTER_PAGE_SIZE)))
const pagedChapters = computed(() => {
  const start = (chapterPage.value - 1) * CHAPTER_PAGE_SIZE
  return chapters.value.slice(start, start + CHAPTER_PAGE_SIZE)
})

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    generating: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  }
  return colors[status] || 'bg-gray-100 text-gray-600'
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    draft: '草稿',
    generating: '生成中',
    completed: '已完成',
  }
  return labels[status] || status
}

function goToChapter(chapter: Chapter) {
  router.push(`/novel/${props.novelId}/chapter/${chapter.chapter_no}`)
}

async function handleGenerateOutline() {
  if (!await guardAiProvider('LLM')) return
  if (!novelStore.currentNovel) return
  generatingOutline.value = true
  try {
    await novelStore.generateOutline(props.novelId, 10)
    toast.success('大纲生成完成')
  } catch (e: any) {
    toast.error('大纲生成失败：' + (e.message || '未知错误'))
  } finally {
    generatingOutline.value = false
  }
}

async function handlePublishChapter(chapter: Chapter, event: Event) {
  event.stopPropagation()
  if (publishingChapterId.value !== null) return
  publishingChapterId.value = chapter.id
  try {
    if (chapter.is_published) {
      const res = await unpublishChapter(props.novelId, chapter.chapter_no)
      chapter.is_published = (res as any).data?.is_published ?? false
      toast.success(`第${chapter.chapter_no}章已取消发布`)
    } else {
      const res = await publishChapter(props.novelId, chapter.chapter_no)
      chapter.is_published = (res as any).data?.is_published ?? true
      toast.success(`第${chapter.chapter_no}章已发布到作品集`)
    }
  } catch (e: any) {
    toast.error('操作失败：' + (e.message || '未知错误'))
  } finally {
    publishingChapterId.value = null
  }
}

function requestDeleteChapter(chapter: Chapter, event: Event) {
  event.stopPropagation()
  chapterToDelete.value = chapter
  showDeleteChapterConfirm.value = true
}

async function confirmDeleteChapter() {
  if (!chapterToDelete.value) return
  try {
    await chapterStore.deleteChapter(props.novelId, chapterToDelete.value.chapter_no)
    toast.success('章节已删除')
    chapterToDelete.value = null
  } catch (e: any) {
    toast.error('删除失败：' + (e.message || '未知错误'))
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-white">章节列表</h2>
      <div class="flex items-center gap-2">
        <button class="btn-secondary text-sm" :disabled="generatingOutline" @click="handleGenerateOutline">
          <svg v-if="generatingOutline" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          <svg v-else class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
          </svg>
          {{ generatingOutline ? 'AI 生成中...' : (chapters.length > 0 ? 'AI 更新大纲' : 'AI 生成大纲') }}
        </button>
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
        v-for="chapter in pagedChapters"
        :key="chapter.id"
        class="card p-4 hover:shadow-soft transition-shadow cursor-pointer group"
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
              {{ chapter.outline || chapter.summary || '暂无摘要' }}
            </p>
          </div>
          <div class="flex items-center space-x-3">
            <span class="text-sm text-gray-500 dark:text-gray-400">
              {{ (chapter.word_count ?? 0).toLocaleString() }} 字
            </span>
            <!-- 内容状态 -->
            <span
              class="px-2 py-0.5 text-xs font-medium rounded"
              :class="getStatusColor(chapter.status)"
            >
              {{ getStatusLabel(chapter.status) }}
            </span>
            <!-- 广场发布状态（独立于内容状态） -->
            <span
              v-if="chapter.is_published"
              class="px-2 py-0.5 text-xs font-medium rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 flex items-center gap-1"
            >
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
              </svg>
              已发布
            </span>
            <!-- 发布/取消发布按钮（仅 completed 状态可用） -->
            <button
              v-if="chapter.status === 'completed'"
              class="p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              :class="chapter.is_published ? 'text-blue-400 hover:text-gray-400' : 'text-gray-300 hover:text-blue-500'"
              :disabled="publishingChapterId === chapter.id"
              :title="chapter.is_published ? '取消发布' : '发布到作品集'"
              @click="handlePublishChapter(chapter, $event)"
            >
              <svg v-if="publishingChapterId === chapter.id" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              <svg v-else-if="chapter.is_published" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"/>
              </svg>
              <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
              </svg>
            </button>
            <button
              class="p-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              title="删除章节"
              @click="requestDeleteChapter(chapter, $event)"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
            <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </div>

      <!-- 分页控件 -->
      <div v-if="chapterTotalPages > 1" class="flex items-center justify-between pt-2">
        <span class="text-sm text-gray-500 dark:text-gray-400">
          第 {{ chapterPage }} / {{ chapterTotalPages }} 页，共 {{ chapters.length }} 章
        </span>
        <div class="flex items-center gap-1">
          <button
            class="px-2 py-1 rounded text-sm border border-gray-300 dark:border-gray-600 disabled:opacity-40"
            :disabled="chapterPage === 1"
            @click="chapterPage = 1"
          >«</button>
          <button
            class="px-2 py-1 rounded text-sm border border-gray-300 dark:border-gray-600 disabled:opacity-40"
            :disabled="chapterPage === 1"
            @click="chapterPage--"
          >‹</button>
          <template v-for="p in chapterTotalPages" :key="p">
            <button
              v-if="Math.abs(p - chapterPage) <= 2"
              class="px-2.5 py-1 rounded text-sm border"
              :class="p === chapterPage
                ? 'bg-primary-600 text-white border-primary-600'
                : 'border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700'"
              @click="chapterPage = p"
            >{{ p }}</button>
          </template>
          <button
            class="px-2 py-1 rounded text-sm border border-gray-300 dark:border-gray-600 disabled:opacity-40"
            :disabled="chapterPage === chapterTotalPages"
            @click="chapterPage++"
          >›</button>
          <button
            class="px-2 py-1 rounded text-sm border border-gray-300 dark:border-gray-600 disabled:opacity-40"
            :disabled="chapterPage === chapterTotalPages"
            @click="chapterPage = chapterTotalPages"
          >»</button>
        </div>
      </div>
    </div>

    <!-- Delete chapter confirm -->
    <ConfirmDialog
      v-model="showDeleteChapterConfirm"
      title="删除章节"
      :description="`确认删除第${chapterToDelete?.chapter_no}章「${chapterToDelete?.title || ''}」？此操作不可撤销。`"
      variant="danger"
      confirm-text="确认删除"
      @confirm="confirmDeleteChapter"
    />
  </div>
</template>
