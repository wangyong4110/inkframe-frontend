<script setup lang="ts">
import type { Novel, NovelComment, Chapter, ChapterComment, ReadingProgress } from '~/types'

definePageMeta({ layout: 'plaza', auth: false })

const route = useRoute()
const novelApi = usePublicNovelApi()
const authStore = useAuthStore()

const novelId = computed(() => Number(route.params.id))
const novel = ref<Novel | null>(null)
const isLiked = ref(false)
const comments = ref<NovelComment[]>([])
const commentTotal = ref(0)
const commentPage = ref(1)
const loadingNovel = ref(true)
const loadingComments = ref(false)
const loadingChapters = ref(false)
const commentText = ref('')
const postingComment = ref(false)
const liking = ref(false)

// Chapter reader state
const chapters = ref<Chapter[]>([])
const selectedChapter = ref<Chapter | null>(null)
const readerOpen = ref(false)
const loadingChapterContent = ref(false)

// Chapter social state
const chapterLiked = ref(false)
const chapterLikeCount = ref(0)
const chapterLiking = ref(false)
const chapterComments = ref<ChapterComment[]>([])
const chapterCommentTotal = ref(0)
const chapterCommentPage = ref(1)
const loadingChapterComments = ref(false)
const chapterCommentText = ref('')
const postingChapterComment = ref(false)
const readerTab = ref<'content' | 'comments'>('content')

// Reading progress state
const readingProgress = ref<ReadingProgress | null>(null)
const readChapterIds = ref<Set<number>>(new Set())
let progressSaveTimer: ReturnType<typeof setTimeout> | null = null
const contentScrollEl = ref<HTMLElement | null>(null)

useHead(() => ({
  title: novel.value ? `${novel.value.title} - 简影 小说广场` : '简影 小说广场',
  meta: [
    { name: 'description', content: novel.value?.description ?? '' },
    { property: 'og:title', content: novel.value?.title ?? '' },
    { property: 'og:image', content: novel.value?.cover_image ?? '' },
  ],
}))

async function loadNovel() {
  loadingNovel.value = true
  try {
    const res = await novelApi.getNovel(novelId.value)
    novel.value = res.data.novel
    isLiked.value = res.data.is_liked
    novelApi.recordView(novelId.value)
  } catch {
    // 404
  } finally {
    loadingNovel.value = false
  }
}

async function loadChapters() {
  loadingChapters.value = true
  try {
    const res = await novelApi.listChapters(novelId.value)
    chapters.value = res.data.items ?? []
  } catch {
    // ignore
  } finally {
    loadingChapters.value = false
  }
}

async function loadComments(append = false) {
  loadingComments.value = true
  try {
    const res = await novelApi.listComments(novelId.value, commentPage.value, 20)
    if (append) {
      comments.value.push(...(res.data.items ?? []))
    } else {
      comments.value = res.data.items ?? []
    }
    commentTotal.value = res.data.total
  } finally {
    loadingComments.value = false
  }
}

async function loadMoreComments() {
  commentPage.value++
  await loadComments(true)
}

async function openChapter(ch: Chapter) {
  selectedChapter.value = ch
  readerOpen.value = true
  if (!ch.content) {
    loadingChapterContent.value = true
    try {
      const res = await novelApi.getChapter(novelId.value, ch.chapter_no)
      if (res.data) {
        selectedChapter.value = res.data
        // Update the chapter in the list so switching back is instant
        const idx = chapters.value.findIndex(c => c.id === ch.id)
        if (idx >= 0) chapters.value[idx] = res.data
      }
    } catch {
      // ignore — content will show empty
    } finally {
      loadingChapterContent.value = false
    }
  }
}

function closeReader() {
  readerOpen.value = false
}

function prevChapter() {
  if (!selectedChapter.value) return
  const idx = chapters.value.findIndex(c => c.id === selectedChapter.value!.id)
  if (idx > 0) openChapter(chapters.value[idx - 1])
}

function nextChapter() {
  if (!selectedChapter.value) return
  const idx = chapters.value.findIndex(c => c.id === selectedChapter.value!.id)
  if (idx < chapters.value.length - 1) openChapter(chapters.value[idx + 1])
}

const selectedIdx = computed(() =>
  selectedChapter.value ? chapters.value.findIndex(c => c.id === selectedChapter.value!.id) : -1,
)

async function toggleLike() {
  if (!authStore.isLoggedIn) { navigateTo('/auth/login'); return }
  if (liking.value) return
  liking.value = true
  try {
    const res = await novelApi.toggleLike(novelId.value)
    isLiked.value = res.data.liked
    if (novel.value) {
      novel.value.like_count = (novel.value.like_count ?? 0) + (res.data.liked ? 1 : -1)
    }
  } finally {
    liking.value = false
  }
}

async function postComment() {
  const text = commentText.value.trim()
  if (!text) return
  if (!authStore.isLoggedIn) { navigateTo('/auth/login'); return }
  postingComment.value = true
  try {
    const res = await novelApi.addComment(novelId.value, { content: text })
    comments.value.unshift(res.data)
    commentTotal.value++
    if (novel.value) novel.value.comment_count = (novel.value.comment_count ?? 0) + 1
    commentText.value = ''
  } finally {
    postingComment.value = false
  }
}

async function deleteComment(cid: number) {
  await novelApi.deleteComment(novelId.value, cid)
  comments.value = comments.value.filter(c => c.id !== cid)
  commentTotal.value = Math.max(0, commentTotal.value - 1)
  if (novel.value) novel.value.comment_count = Math.max(0, (novel.value.comment_count ?? 0) - 1)
}

// ── Chapter social ──────────────────────────────────────────────────────────

async function toggleChapterLike() {
  if (!authStore.isLoggedIn) { navigateTo('/auth/login'); return }
  if (!selectedChapter.value || chapterLiking.value) return
  chapterLiking.value = true
  try {
    const res = await novelApi.toggleChapterLike(novelId.value, selectedChapter.value.chapter_no)
    chapterLiked.value = res.data.liked
    chapterLikeCount.value = res.data.like_count
    if (selectedChapter.value) selectedChapter.value.like_count = res.data.like_count
  } finally {
    chapterLiking.value = false
  }
}

async function loadChapterComments(append = false) {
  if (!selectedChapter.value) return
  loadingChapterComments.value = true
  try {
    const res = await novelApi.listChapterComments(novelId.value, selectedChapter.value.chapter_no, chapterCommentPage.value, 20)
    if (append) {
      chapterComments.value.push(...(res.data.items ?? []))
    } else {
      chapterComments.value = res.data.items ?? []
    }
    chapterCommentTotal.value = res.data.total
  } finally {
    loadingChapterComments.value = false
  }
}

async function loadMoreChapterComments() {
  chapterCommentPage.value++
  await loadChapterComments(true)
}

async function postChapterComment() {
  const text = chapterCommentText.value.trim()
  if (!text || !selectedChapter.value) return
  if (!authStore.isLoggedIn) { navigateTo('/auth/login'); return }
  postingChapterComment.value = true
  try {
    const res = await novelApi.addChapterComment(novelId.value, selectedChapter.value.chapter_no, { content: text })
    chapterComments.value.unshift(res.data)
    chapterCommentTotal.value++
    chapterCommentText.value = ''
  } finally {
    postingChapterComment.value = false
  }
}

async function deleteChapterCommentFn(cid: number) {
  if (!selectedChapter.value) return
  await novelApi.deleteChapterComment(novelId.value, selectedChapter.value.chapter_no, cid)
  chapterComments.value = chapterComments.value.filter(c => c.id !== cid)
  chapterCommentTotal.value = Math.max(0, chapterCommentTotal.value - 1)
}

// ── Reading progress ─────────────────────────────────────────────────────────

async function loadReadingProgress() {
  if (!authStore.isLoggedIn) return
  try {
    const res = await novelApi.getReadingProgress(novelId.value)
    readingProgress.value = res.data ?? null
  } catch { /* ignore */ }
}

async function loadReadChapters() {
  if (!authStore.isLoggedIn) return
  try {
    const res = await novelApi.getReadChapters(novelId.value)
    readChapterIds.value = new Set(res.data.chapter_ids ?? [])
  } catch { /* ignore */ }
}

function scheduleProgressSave() {
  if (!selectedChapter.value || !authStore.isLoggedIn) return
  const el = contentScrollEl.value
  if (!el) return
  const pct = Math.round((el.scrollTop / (el.scrollHeight - el.clientHeight || 1)) * 100)
  if (progressSaveTimer) clearTimeout(progressSaveTimer)
  progressSaveTimer = setTimeout(async () => {
    if (!selectedChapter.value) return
    try {
      await novelApi.saveReadingProgress(novelId.value, {
        chapter_no: selectedChapter.value.chapter_no,
        chapter_id: selectedChapter.value.id,
        scroll_pct: Math.min(100, pct),
      })
      readingProgress.value = {
        chapter_no: selectedChapter.value.chapter_no,
        chapter_id: selectedChapter.value.id,
        scroll_pct: Math.min(100, pct),
        novel_id: novelId.value,
        user_id: authStore.user?.id ?? 0,
        updated_at: new Date().toISOString(),
        created_at: readingProgress.value?.created_at ?? new Date().toISOString(),
      }
      if (pct >= 50) readChapterIds.value.add(selectedChapter.value.id)
    } catch { /* ignore */ }
  }, 1500)
}

watch(selectedChapter, async (ch) => {
  if (!ch) return
  chapterLiked.value = false
  chapterLikeCount.value = ch.like_count ?? 0
  chapterComments.value = []
  chapterCommentPage.value = 1
  chapterCommentTotal.value = 0
  readerTab.value = 'content'
  if (authStore.isLoggedIn) {
    try {
      const res = await novelApi.getChapterIsLiked(novelId.value, ch.chapter_no)
      chapterLiked.value = res.data.liked
    } catch { /* ignore */ }
  }
  loadChapterComments()
})

onBeforeUnmount(() => {
  if (progressSaveTimer) clearTimeout(progressSaveTimer)
})

function formatDate(s?: string) {
  if (!s) return ''
  return new Date(s).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })
}

function formatCount(n?: number) {
  if (!n) return '0'
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`
  return String(n)
}

function copyLink() {
  navigator.clipboard.writeText(window.location.href)
}

// Format chapter content: split by newline, render paragraphs
function formatContent(text?: string): string[] {
  if (!text) return []
  return text.split('\n').map(l => l.trim()).filter(l => l.length > 0)
}

const genreLabels: Record<string, string> = {
  fantasy: '奇幻', xianxia: '仙侠', urban: '都市', scifi: '科幻',
  romance: '言情', mystery: '悬疑', historical: '历史',
}

onMounted(async () => {
  await loadNovel()
  await Promise.all([loadChapters(), loadComments(), loadReadingProgress(), loadReadChapters()])
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-6">
    <NuxtLink to="/plaza" class="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-4 inline-flex items-center gap-1">
      ← 小说广场
    </NuxtLink>

    <div v-if="loadingNovel" class="mt-12 flex justify-center text-gray-400">加载中...</div>

    <div v-else-if="!novel" class="mt-24 text-center text-gray-400">
      <p class="text-lg mb-4">小说不存在或已下架</p>
      <NuxtLink to="/plaza" class="text-indigo-500 hover:underline">返回广场</NuxtLink>
    </div>

    <div v-else class="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Main content -->
      <div class="lg:col-span-2 space-y-4">
        <!-- Novel header card -->
        <div class="bg-white dark:bg-gray-800 rounded-xl overflow-hidden">
          <div class="flex gap-4 p-5">
            <!-- Cover -->
            <div class="w-28 shrink-0">
              <div class="aspect-[3/4] rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-700">
                <img
                  v-if="novel.cover_image"
                  :src="novel.cover_image"
                  :alt="novel.title"
                  class="w-full h-full object-cover"
                />
                <div v-else class="w-full h-full flex items-center justify-center">
                  <svg class="w-8 h-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                  </svg>
                </div>
              </div>
            </div>

            <!-- Meta -->
            <div class="flex-1 min-w-0 space-y-2">
              <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100 leading-tight">{{ novel.title }}</h1>

              <div class="flex flex-wrap items-center gap-2 text-sm text-gray-400">
                <span v-if="novel.genre" class="px-2 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 rounded-full text-xs">
                  {{ genreLabels[novel.genre] ?? novel.genre }}
                </span>
                <span>{{ novel.chapter_count }} 章</span>
                <span v-if="novel.total_words">{{ novel.total_words >= 10000 ? `${(novel.total_words / 10000).toFixed(0)}万字` : `${novel.total_words}字` }}</span>
                <span>{{ formatDate(novel.published_at ?? novel.created_at) }}</span>
              </div>

              <p v-if="novel.description" class="text-sm text-gray-600 dark:text-gray-400 line-clamp-3 leading-relaxed">
                {{ novel.description }}
              </p>

              <!-- Actions -->
              <div class="flex items-center gap-2 pt-1">
                <button
                  @click="toggleLike"
                  :disabled="liking"
                  :class="[
                    'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                    isLiked
                      ? 'bg-red-50 dark:bg-red-900/20 text-red-600 border border-red-200 dark:border-red-800'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-red-50 hover:text-red-600'
                  ]"
                >
                  <svg class="w-4 h-4" :fill="isLiked ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                  </svg>
                  {{ isLiked ? '已点赞' : '点赞' }}
                  <span class="text-xs opacity-70">{{ formatCount(novel.like_count) }}</span>
                </button>

                <button
                  @click="copyLink"
                  class="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                  </svg>
                  复制链接
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Chapter list -->
        <div class="bg-white dark:bg-gray-800 rounded-xl overflow-hidden">
          <div class="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <h2 class="font-semibold text-gray-800 dark:text-gray-200">
              章节目录
              <span class="ml-1.5 text-sm font-normal text-gray-400">({{ chapters.length }} 章)</span>
            </h2>
          </div>

          <div v-if="loadingChapters" class="py-8 text-center text-gray-400 text-sm">加载中...</div>

          <div v-else-if="chapters.length === 0" class="py-8 text-center text-gray-400 text-sm">
            暂无公开章节
          </div>

          <div v-else class="divide-y divide-gray-50 dark:divide-gray-700/50 max-h-80 overflow-y-auto">
            <button
              v-for="ch in chapters"
              :key="ch.id"
              :class="[
                'w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group',
                readChapterIds.has(ch.id) ? 'bg-green-50/40 dark:bg-green-900/10' : '',
              ]"
              @click="openChapter(ch)"
            >
              <span class="text-xs text-gray-400 w-8 shrink-0 text-right">{{ ch.chapter_no }}</span>
              <span :class="[
                'flex-1 text-sm truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400',
                readChapterIds.has(ch.id) ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300',
              ]">
                {{ ch.title || `第${ch.chapter_no}章` }}
              </span>
              <span v-if="ch.word_count" class="text-xs text-gray-400 shrink-0">{{ ch.word_count >= 1000 ? `${(ch.word_count / 1000).toFixed(1)}k` : ch.word_count }}字</span>
              <svg v-if="readChapterIds.has(ch.id)" class="w-3.5 h-3.5 text-green-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
              </svg>
              <svg v-else class="w-4 h-4 text-gray-300 group-hover:text-indigo-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Comments -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4">
          <h2 class="font-semibold text-gray-800 dark:text-gray-200 mb-4">
            评论 <span class="text-gray-400 font-normal text-sm">({{ commentTotal }})</span>
          </h2>

          <!-- Input -->
          <div class="flex gap-3 mb-5">
            <div class="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-sm font-bold text-indigo-600 dark:text-indigo-300 shrink-0">
              {{ authStore.user?.nickname?.charAt(0)?.toUpperCase() ?? '?' }}
            </div>
            <div class="flex-1">
              <textarea
                v-model="commentText"
                rows="2"
                :placeholder="authStore.isLoggedIn ? '发表你的看法...' : '登录后发表评论'"
                :disabled="!authStore.isLoggedIn"
                class="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 resize-none focus:outline-none focus:border-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <div class="flex justify-end mt-2">
                <button
                  :disabled="!commentText.trim() || postingComment || !authStore.isLoggedIn"
                  @click="postComment"
                  class="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm disabled:opacity-40 transition-colors"
                >
                  {{ postingComment ? '发送中...' : '发送' }}
                </button>
              </div>
            </div>
          </div>

          <!-- Comment list -->
          <div class="space-y-4">
            <div v-for="c in comments" :key="c.id" class="flex gap-3">
              <div class="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                {{ (c.nickname || String(c.user_id)).charAt(0).toUpperCase() }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-2">
                  <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ c.nickname || `用户${c.user_id}` }}</span>
                  <span class="text-xs text-gray-400">{{ formatDate(c.created_at) }}</span>
                </div>
                <p class="text-sm text-gray-700 dark:text-gray-300 mt-1 leading-relaxed">{{ c.content }}</p>
                <button
                  v-if="authStore.user?.id === c.user_id"
                  @click="deleteComment(c.id)"
                  class="text-xs text-gray-400 hover:text-red-500 mt-1 transition-colors"
                >删除</button>
              </div>
            </div>

            <p v-if="!comments.length && !loadingComments" class="text-center text-sm text-gray-400 py-6">
              暂无评论，来发表第一条吧
            </p>

            <div v-if="comments.length < commentTotal" class="text-center pt-2">
              <button
                :disabled="loadingComments"
                @click="loadMoreComments"
                class="px-5 py-1.5 border border-gray-200 dark:border-gray-600 rounded-full text-sm text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                {{ loadingComments ? '加载中...' : '加载更多' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Right sidebar -->
      <div class="space-y-4">
        <!-- Stats -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4">
          <div class="grid grid-cols-2 gap-3">
            <div class="text-center p-2">
              <div class="text-2xl font-black text-gray-900 dark:text-gray-100">{{ formatCount(novel.view_count) }}</div>
              <div class="text-xs text-gray-400 mt-0.5">浏览</div>
            </div>
            <div class="text-center p-2">
              <div class="text-2xl font-black text-red-500">{{ formatCount(novel.like_count) }}</div>
              <div class="text-xs text-gray-400 mt-0.5">点赞</div>
            </div>
            <div class="text-center p-2">
              <div class="text-2xl font-black text-gray-900 dark:text-gray-100">{{ formatCount(novel.comment_count) }}</div>
              <div class="text-xs text-gray-400 mt-0.5">评论</div>
            </div>
            <div class="text-center p-2">
              <div class="text-2xl font-black text-indigo-600 dark:text-indigo-400">{{ novel.chapter_count }}</div>
              <div class="text-xs text-gray-400 mt-0.5">章节</div>
            </div>
          </div>
        </div>

        <!-- Novel info -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4">
          <h3 class="font-semibold text-gray-800 dark:text-gray-200 mb-3">小说信息</h3>
          <dl class="space-y-2.5 text-sm">
            <div v-if="novel.genre" class="flex justify-between">
              <dt class="text-gray-500">类型</dt>
              <dd class="text-gray-700 dark:text-gray-300">{{ genreLabels[novel.genre] ?? novel.genre }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-gray-500">章节数</dt>
              <dd class="text-gray-700 dark:text-gray-300">{{ novel.chapter_count }} 章</dd>
            </div>
            <div v-if="novel.total_words" class="flex justify-between">
              <dt class="text-gray-500">总字数</dt>
              <dd class="text-gray-700 dark:text-gray-300">{{ novel.total_words >= 10000 ? `${(novel.total_words / 10000).toFixed(1)}万字` : `${novel.total_words}字` }}</dd>
            </div>
            <div v-if="novel.ai_model" class="flex justify-between">
              <dt class="text-gray-500">AI 模型</dt>
              <dd class="text-gray-700 dark:text-gray-300 text-right truncate max-w-28">{{ novel.ai_model }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-gray-500">发布时间</dt>
              <dd class="text-gray-700 dark:text-gray-300">{{ formatDate(novel.published_at ?? novel.created_at) }}</dd>
            </div>
          </dl>
        </div>

        <!-- Plaza tags -->
        <div v-if="novel.plaza_tags?.length" class="bg-white dark:bg-gray-800 rounded-xl p-4">
          <h3 class="font-semibold text-gray-800 dark:text-gray-200 mb-3">标签</h3>
          <div class="flex flex-wrap gap-1.5">
            <span
              v-for="tag in novel.plaza_tags"
              :key="tag"
              class="px-2.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs rounded-full"
            >{{ tag }}</span>
          </div>
        </div>

        <!-- Continue / start reading button -->
        <template v-if="chapters.length > 0">
          <button
            v-if="readingProgress"
            @click="openChapter(chapters.find(c => c.chapter_no === readingProgress!.chapter_no) ?? chapters[readingProgress!.chapter_no - 1] ?? chapters[0])"
            class="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium text-sm transition-colors"
          >
            续读第{{ readingProgress.chapter_no }}章
          </button>
          <button
            v-else
            @click="openChapter(chapters[0])"
            class="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium text-sm transition-colors"
          >
            开始阅读
          </button>
        </template>
      </div>
    </div>

    <!-- Chapter reader drawer -->
    <Teleport to="body">
      <Transition name="reader">
        <div v-if="readerOpen" class="fixed inset-0 z-50 flex">
          <!-- Backdrop -->
          <div class="absolute inset-0 bg-black/50" @click="closeReader" />

          <!-- Panel -->
          <div class="relative ml-auto w-full max-w-2xl bg-white dark:bg-gray-900 h-full flex flex-col shadow-2xl">
            <!-- Reader header -->
            <div class="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
              <button @click="closeReader" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
              <div class="flex-1 min-w-0">
                <p class="text-xs text-gray-400 truncate">{{ novel?.title }}</p>
                <h3 class="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
                  第{{ selectedChapter?.chapter_no }}章 {{ selectedChapter?.title || '' }}
                </h3>
              </div>
              <div class="flex items-center gap-1">
                <button
                  :disabled="selectedIdx <= 0"
                  @click="prevChapter"
                  class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors"
                  title="上一章"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                  </svg>
                </button>
                <button
                  :disabled="selectedIdx >= chapters.length - 1"
                  @click="nextChapter"
                  class="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 transition-colors"
                  title="下一章"
                >
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                  </svg>
                </button>
              </div>
            </div>

            <!-- Tab bar -->
            <div class="flex border-b border-gray-100 dark:border-gray-700 shrink-0">
              <button
                @click="readerTab = 'content'"
                :class="[
                  'flex-1 py-2.5 text-sm font-medium transition-colors',
                  readerTab === 'content'
                    ? 'text-indigo-600 border-b-2 border-indigo-600'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
                ]"
              >内容</button>
              <button
                @click="readerTab = 'comments'"
                :class="[
                  'flex-1 py-2.5 text-sm font-medium transition-colors',
                  readerTab === 'comments'
                    ? 'text-indigo-600 border-b-2 border-indigo-600'
                    : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300',
                ]"
              >评论{{ chapterCommentTotal > 0 ? ` (${chapterCommentTotal})` : '' }}</button>
            </div>

            <!-- Content tab -->
            <div
              v-if="readerTab === 'content'"
              ref="contentScrollEl"
              class="flex-1 overflow-y-auto px-8 py-6"
              @scroll="scheduleProgressSave"
            >
              <div v-if="loadingChapterContent" class="flex justify-center items-center py-16">
                <span class="inline-block w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              </div>
              <div v-else-if="selectedChapter?.content" class="prose prose-gray dark:prose-invert max-w-none">
                <p
                  v-for="(para, i) in formatContent(selectedChapter.content)"
                  :key="i"
                  class="text-base leading-8 text-gray-800 dark:text-gray-200 mb-4 indent-8"
                >{{ para }}</p>
              </div>
              <p v-else class="text-center text-gray-400 py-16 text-sm">暂无内容</p>
            </div>

            <!-- Comments tab -->
            <div v-else class="flex-1 overflow-y-auto flex flex-col">
              <!-- Input -->
              <div class="px-5 py-4 border-b border-gray-100 dark:border-gray-700 shrink-0">
                <div class="flex gap-3">
                  <div class="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-xs font-bold text-indigo-600 dark:text-indigo-300 shrink-0">
                    {{ authStore.user?.nickname?.charAt(0)?.toUpperCase() ?? '?' }}
                  </div>
                  <div class="flex-1">
                    <textarea
                      v-model="chapterCommentText"
                      rows="2"
                      :placeholder="authStore.isLoggedIn ? '对本章发表看法...' : '登录后发表评论'"
                      :disabled="!authStore.isLoggedIn"
                      class="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 resize-none focus:outline-none focus:border-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <div class="flex justify-end mt-2">
                      <button
                        :disabled="!chapterCommentText.trim() || postingChapterComment || !authStore.isLoggedIn"
                        @click="postChapterComment"
                        class="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm disabled:opacity-40 transition-colors"
                      >{{ postingChapterComment ? '发送中...' : '发送' }}</button>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Comment list -->
              <div class="flex-1 overflow-y-auto px-5 py-3 space-y-4">
                <div v-if="loadingChapterComments && !chapterComments.length" class="py-8 text-center text-gray-400 text-sm">加载中...</div>
                <p v-else-if="!chapterComments.length" class="text-center text-sm text-gray-400 py-8">暂无评论，来发表第一条吧</p>
                <div v-for="c in chapterComments" :key="c.id" class="flex gap-3">
                  <div class="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                    {{ (c.nickname || String(c.user_id)).charAt(0).toUpperCase() }}
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="flex items-baseline gap-2">
                      <span class="text-sm font-medium text-gray-700 dark:text-gray-300">{{ c.nickname || `用户${c.user_id}` }}</span>
                      <span class="text-xs text-gray-400">{{ formatDate(c.created_at) }}</span>
                    </div>
                    <p class="text-sm text-gray-700 dark:text-gray-300 mt-1 leading-relaxed">{{ c.content }}</p>
                    <button
                      v-if="authStore.user?.id === c.user_id"
                      @click="deleteChapterCommentFn(c.id)"
                      class="text-xs text-gray-400 hover:text-red-500 mt-1 transition-colors"
                    >删除</button>
                  </div>
                </div>
                <div v-if="chapterComments.length < chapterCommentTotal" class="text-center pt-2 pb-4">
                  <button
                    :disabled="loadingChapterComments"
                    @click="loadMoreChapterComments"
                    class="px-5 py-1.5 border border-gray-200 dark:border-gray-600 rounded-full text-sm text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                  >{{ loadingChapterComments ? '加载中...' : '加载更多' }}</button>
                </div>
              </div>
            </div>

            <!-- Reader footer -->
            <div class="border-t border-gray-100 dark:border-gray-700 px-5 py-3 flex items-center justify-between shrink-0">
              <button
                :disabled="selectedIdx <= 0"
                @click="prevChapter"
                class="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 disabled:opacity-30 transition-colors"
              >
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
                </svg>
                上一章
              </button>

              <!-- Like button -->
              <button
                @click="toggleChapterLike"
                :disabled="chapterLiking"
                :class="[
                  'flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition-all',
                  chapterLiked
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-500'
                    : 'text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20',
                ]"
              >
                <svg class="w-4 h-4" :fill="chapterLiked ? 'currentColor' : 'none'" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/>
                </svg>
                <span>{{ chapterLikeCount || '' }}</span>
              </button>

              <button
                :disabled="selectedIdx >= chapters.length - 1"
                @click="nextChapter"
                class="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 disabled:opacity-30 transition-colors"
              >
                下一章
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.reader-enter-active,
.reader-leave-active {
  transition: opacity 0.2s ease;
}
.reader-enter-active .relative,
.reader-leave-active .relative {
  transition: transform 0.25s ease;
}
.reader-enter-from {
  opacity: 0;
}
.reader-enter-from .relative {
  transform: translateX(100%);
}
.reader-leave-to {
  opacity: 0;
}
.reader-leave-to .relative {
  transform: translateX(100%);
}
</style>
