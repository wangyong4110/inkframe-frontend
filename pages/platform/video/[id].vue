<script setup lang="ts">
import type { Video, VideoComment } from '~/types'

definePageMeta({ layout: 'plaza', auth: false })

const route = useRoute()
const platformApi = usePlatformApi()
const authStore = useAuthStore()

const videoId = computed(() => Number(route.params.id))
const video = ref<Video | null>(null)
const isLiked = ref(false)
const comments = ref<VideoComment[]>([])
const commentTotal = ref(0)
const commentPage = ref(1)
const loadingVideo = ref(true)
const loadingComments = ref(false)
const commentText = ref('')
const postingComment = ref(false)
const liking = ref(false)

useHead(() => ({
  title: video.value ? `${video.value.title} - 简影 视频广场` : '简影 视频广场',
  meta: [
    { name: 'description', content: video.value?.title ?? '' },
    { property: 'og:title', content: video.value?.title ?? '' },
    { property: 'og:image', content: video.value?.cover_url ?? '' },
    { property: 'og:type', content: 'video.other' },
  ],
}))

async function loadVideo() {
  loadingVideo.value = true
  try {
    const res = await platformApi.getPlatformVideo(videoId.value)
    video.value = res.data.video
    isLiked.value = res.data.is_liked
    platformApi.recordView(videoId.value)
  } catch {
    // 404
  } finally {
    loadingVideo.value = false
  }
}

async function loadComments(append = false) {
  loadingComments.value = true
  try {
    const res = await platformApi.listComments(videoId.value, commentPage.value, 20)
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
    const res = await platformApi.toggleLike(videoId.value)
    isLiked.value = res.data.liked
    if (video.value) {
      video.value.like_count = (video.value.like_count ?? 0) + (res.data.liked ? 1 : -1)
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
    const res = await platformApi.addComment(videoId.value, { content: text })
    comments.value.unshift(res.data)
    commentTotal.value++
    if (video.value) video.value.comment_count = (video.value.comment_count ?? 0) + 1
    commentText.value = ''
  } finally {
    postingComment.value = false
  }
}

async function deleteComment(cid: number) {
  await platformApi.deleteComment(videoId.value, cid)
  comments.value = comments.value.filter(c => c.id !== cid)
  commentTotal.value = Math.max(0, commentTotal.value - 1)
  if (video.value) video.value.comment_count = Math.max(0, (video.value.comment_count ?? 0) - 1)
}

function formatDuration(secs?: number) {
  if (!secs) return ''
  const m = Math.floor(secs / 60)
  const s = Math.floor(secs % 60)
  return `${m}:${String(s).padStart(2, '0')}`
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
  navigator.clipboard.writeText(window.location.href).then(() => {})
}

onMounted(async () => {
  await loadVideo()
  await loadComments()
})
</script>

<template>
  <div class="max-w-6xl mx-auto px-4 py-6">
    <NuxtLink to="/platform" class="text-sm text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mb-4 inline-flex items-center gap-1">
      ← 视频广场
    </NuxtLink>

    <div v-if="loadingVideo" class="mt-12 flex justify-center text-gray-400">加载中...</div>

    <div v-else-if="!video" class="mt-24 text-center text-gray-400">
      <p class="text-lg mb-4">视频不存在或已下架</p>
      <NuxtLink to="/platform" class="text-indigo-500 hover:underline">返回广场</NuxtLink>
    </div>

    <div v-else class="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Player + comments -->
      <div class="lg:col-span-2 space-y-4">
        <!-- Player -->
        <div class="bg-black rounded-xl overflow-hidden aspect-video relative">
          <video
            v-if="video.final_video_url"
            :src="video.final_video_url"
            :poster="video.cover_url"
            controls
            autoplay
            class="w-full h-full object-contain"
          />
          <img
            v-else-if="video.cover_url"
            :src="video.cover_url"
            :alt="video.title"
            class="w-full h-full object-contain"
          />
          <div v-else class="w-full h-full flex items-center justify-center text-gray-500">
            暂无视频
          </div>
          <!-- Duration badge -->
          <div v-if="video.duration && !video.final_video_url" class="absolute bottom-3 right-3 bg-black/70 text-white text-xs px-2 py-0.5 rounded">
            {{ formatDuration(video.duration) }}
          </div>
        </div>

        <!-- Title & actions -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4 space-y-3">
          <h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">{{ video.title }}</h1>

          <div class="flex flex-wrap items-center gap-4 text-sm text-gray-400">
            <span>{{ formatCount(video.view_count) }} 播放</span>
            <span v-if="video.duration">{{ formatDuration(video.duration) }}</span>
            <span>{{ formatDate(video.published_at ?? video.created_at) }}</span>
          </div>

          <!-- Tags -->
          <div v-if="video.tags?.length" class="flex flex-wrap gap-1.5">
            <span v-for="tag in video.tags" :key="tag"
              class="px-2.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs rounded-full">
              {{ tag }}
            </span>
          </div>

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
              <span class="text-xs opacity-70">{{ formatCount(video.like_count) }}</span>
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
                >
                  删除
                </button>
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
              <div class="text-2xl font-black text-gray-900 dark:text-gray-100">{{ formatCount(video.view_count) }}</div>
              <div class="text-xs text-gray-400 mt-0.5">播放</div>
            </div>
            <div class="text-center p-2">
              <div class="text-2xl font-black text-red-500">{{ formatCount(video.like_count) }}</div>
              <div class="text-xs text-gray-400 mt-0.5">点赞</div>
            </div>
            <div class="text-center p-2">
              <div class="text-2xl font-black text-gray-900 dark:text-gray-100">{{ formatCount(video.comment_count) }}</div>
              <div class="text-xs text-gray-400 mt-0.5">评论</div>
            </div>
            <div v-if="video.duration" class="text-center p-2">
              <div class="text-2xl font-black text-indigo-600 dark:text-indigo-400">{{ formatDuration(video.duration) }}</div>
              <div class="text-xs text-gray-400 mt-0.5">时长</div>
            </div>
          </div>
        </div>

        <!-- Video info -->
        <div class="bg-white dark:bg-gray-800 rounded-xl p-4">
          <h3 class="font-semibold text-gray-800 dark:text-gray-200 mb-3">视频信息</h3>
          <dl class="space-y-2.5 text-sm">
            <div v-if="video.novel" class="flex justify-between items-center">
              <dt class="text-gray-500 shrink-0">原著小说</dt>
              <dd>
                <NuxtLink :to="`/novel/${video.novel.id}`"
                  class="text-indigo-500 hover:underline text-right block truncate max-w-36">
                  {{ video.novel.title }}
                </NuxtLink>
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-gray-500">分辨率</dt>
              <dd class="text-gray-700 dark:text-gray-300">{{ video.resolution || '-' }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-gray-500">画幅比</dt>
              <dd class="text-gray-700 dark:text-gray-300">{{ video.aspect_ratio || '-' }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-gray-500">分镜数</dt>
              <dd class="text-gray-700 dark:text-gray-300">{{ video.total_shots }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-gray-500">画风</dt>
              <dd class="text-gray-700 dark:text-gray-300">{{ video.art_style || '-' }}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  </div>
</template>
