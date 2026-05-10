<script setup lang="ts">
import type { Novel, NovelComment } from '~/types'

definePageMeta({ auth: false })

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
const commentText = ref('')
const postingComment = ref(false)
const liking = ref(false)

useHead(() => ({
  title: novel.value ? `${novel.value.title} - InkFrame 小说广场` : 'InkFrame 小说广场',
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

const genreLabels: Record<string, string> = {
  fantasy: '奇幻', xianxia: '仙侠', urban: '都市', scifi: '科幻',
  romance: '言情', mystery: '悬疑', historical: '历史',
}

onMounted(async () => {
  await loadNovel()
  await loadComments()
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
      </div>
    </div>
  </div>
</template>
