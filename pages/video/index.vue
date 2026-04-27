<script setup lang="ts">
import type { Chapter } from '~/types'
import { VIDEO_PRESETS } from '~/composables/useStylePresets'

const route = useRoute()
const router = useRouter()
const videoStore = useVideoStore()

const activeTab = ref('list')
const showCreateModal = ref(false)
const QUALITY_TIERS = [
  {
    id: 'draft' as const,
    name: '草稿',
    desc: '静图+动效，快速预览',
    costMult: 1,
    color: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300',
    border: 'border-gray-300 dark:border-gray-600',
  },
  {
    id: 'preview' as const,
    name: '预览',
    desc: '720p 短片段，验证效果',
    costMult: 5,
    color: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    border: 'border-blue-300 dark:border-blue-600',
  },
  {
    id: 'final' as const,
    name: '正式',
    desc: '1080p+ 完整高质量',
    costMult: 20,
    color: 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
    border: 'border-amber-300 dark:border-amber-600',
  },
]

const VIDEO_MODES = [
  {
    id: 'slideshow' as const,
    name: '图片解说',
    desc: '每镜一图+动效，低成本',
    icon: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
  },
  {
    id: 'video' as const,
    name: 'AI 视频',
    desc: '逐帧 AI 视频，效果最佳',
    icon: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
  },
]

const createForm = ref({
  title: '',
  chapter_id: 0,
  video_preset: 'cinematic',
  art_style: 'anime',
  aspect_ratio: '16:9',
  frame_rate: 24,
  quality_tier: 'draft' as 'draft' | 'preview' | 'final',
  mode: 'slideshow' as 'slideshow' | 'video',
})

// Estimated shots: roughly 6 per chapter (conservative)
const estShots = computed(() => {
  const tier = QUALITY_TIERS.find(t => t.id === createForm.value.quality_tier)!
  const baseShots = 6
  return { shots: baseShots, cost: baseShots * tier.costMult, tier }
})
const chapters = ref<Chapter[]>([])

const novelId = computed(() => route.query.novel_id ? parseInt(route.query.novel_id as string) : null)

watch(() => createForm.value.video_preset, (id) => {
  const preset = VIDEO_PRESETS.find(p => p.id === id)
  if (preset) {
    createForm.value.aspect_ratio = preset.aspect_ratio
    createForm.value.frame_rate = preset.frame_rate
  }
})

onMounted(async () => {
  videoStore.fetchVideos({ novel_id: novelId.value || undefined })
  if (novelId.value) {
    try {
      const { getChapters } = useChapterApi()
      const resp = await getChapters(novelId.value)
      chapters.value = resp.data
    } catch { /* no chapters available */ }
  }
})

const videos = computed(() => videoStore.videos)

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    planning: 'bg-blue-100 text-blue-800',
    generating: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    planning: '规划中',
    generating: '生成中',
    completed: '已完成',
    failed: '失败',
  }
  return labels[status] || status
}

function goToVideo(id: number) {
  router.push(`/video/${id}`)
}

async function createVideo() {
  if (!novelId.value) return
  const video = await videoStore.createVideo(
    novelId.value,
    createForm.value.chapter_id || undefined,
    createForm.value.title || undefined,
    createForm.value.art_style,
    createForm.value.aspect_ratio,
    createForm.value.frame_rate,
    createForm.value.quality_tier,
    createForm.value.mode,
  )
  showCreateModal.value = false
  router.push(`/video/${video.id}`)
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">视频管理</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          管理小说的视频内容
        </p>
      </div>
      <button
        class="btn-primary"
        @click="showCreateModal = true"
      >
        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        新建视频
      </button>
    </div>

    <!-- Tabs -->
    <div class="border-b border-gray-200 dark:border-gray-700">
      <nav class="flex space-x-8">
        <button
          class="py-4 px-1 border-b-2 font-medium text-sm"
          :class="[
            activeTab === 'list'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          ]"
          @click="activeTab = 'list'"
        >
          视频列表
        </button>
        <button
          class="py-4 px-1 border-b-2 font-medium text-sm"
          :class="[
            activeTab === 'templates'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          ]"
          @click="activeTab = 'templates'"
        >
          模板库
        </button>
        <button
          class="py-4 px-1 border-b-2 font-medium text-sm"
          :class="[
            activeTab === 'settings'
              ? 'border-primary-500 text-primary-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          ]"
          @click="activeTab = 'settings'"
        >
          默认设置
        </button>
      </nav>
    </div>

    <!-- Video List -->
    <div v-if="activeTab === 'list'">
      <div v-if="videoStore.loading" class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div v-for="i in 6" :key="i" class="card p-4">
          <div class="skeleton h-40 w-full mb-4"></div>
          <div class="skeleton h-5 w-2/3 mb-2"></div>
          <div class="skeleton h-4 w-1/2"></div>
        </div>
      </div>

      <div v-else-if="videos.length === 0" class="card p-12 text-center">
        <svg class="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">暂无视频</h3>
        <p class="text-gray-500 dark:text-gray-400 mb-6">创建你的第一个视频，开始创作之旅</p>
        <button class="btn-primary" @click="showCreateModal = true">
          创建视频
        </button>
      </div>

      <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="video in videos"
          :key="video.id"
          class="card overflow-hidden hover:shadow-medium transition-shadow cursor-pointer"
          @click="goToVideo(video.id)"
        >
          <div class="h-40 bg-gray-900 flex items-center justify-center relative">
            <svg class="w-12 h-12 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87V4a1 1 0 009.293 1.707l3.197 2.132a1 1 0 001.447-.894v-1.706A1 1 0 0014.752 11.168z M19 8v8a2 2 0 01-2 2H7a2 2 0 01-2-2V8a2 2 0 012-2h10a2 2 0 012 2z" />
            </svg>
            <div
              v-if="video.status === 'generating'"
              class="absolute inset-0 bg-black/50 flex items-center justify-center"
            >
              <div class="w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          </div>
          <div class="p-4">
            <div class="flex items-start justify-between mb-2">
              <h3 class="font-semibold text-gray-900 dark:text-white line-clamp-1">
                {{ video.title }}
              </h3>
              <span
                class="px-2 py-0.5 text-xs font-medium rounded-full"
                :class="getStatusColor(video.status)"
              >
                {{ getStatusLabel(video.status) }}
              </span>
            </div>
            <div class="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
              <span>{{ video.total_shots }} 个镜头</span>
              <span class="flex items-center gap-1.5">
                <span v-if="video.mode === 'slideshow'" class="px-1.5 py-0.5 text-xs rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">图片解说</span>
                {{ video.resolution }} {{ video.frame_rate }}fps
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Templates -->
    <div v-if="activeTab === 'templates'" class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <div v-for="template in [
        { name: '标准短视频', desc: '适用于社交媒体分享', icon: 'smartphone' },
        { name: '电影风格', desc: '16:9 宽屏电影效果', icon: 'film' },
        { name: '快速预览', desc: '快速生成预览版本', icon: 'eye' },
        { name: '高清长片', desc: '4K 高清长视频', icon: 'sparkles' },
      ]" :key="template.name" class="card p-6 hover:shadow-medium transition-shadow cursor-pointer">
        <div class="w-12 h-12 bg-primary-100 dark:bg-primary-900/50 rounded-lg flex items-center justify-center mb-4">
          <svg class="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 class="font-semibold text-gray-900 dark:text-white mb-1">{{ template.name }}</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400">{{ template.desc }}</p>
      </div>
    </div>

    <!-- Settings -->
    <div v-if="activeTab === 'settings'" class="card p-6">
      <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-6">默认设置</h3>
      <div class="grid gap-6 md:grid-cols-2">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            默认分辨率
          </label>
          <select class="input">
            <option value="720p">720p (1280x720)</option>
            <option value="1080p" selected>1080p (1920x1080)</option>
            <option value="4k">4K (3840x2160)</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            默认帧率
          </label>
          <select class="input">
            <option value="24">24 fps (电影)</option>
            <option value="30">30 fps (标准)</option>
            <option value="60" selected>60 fps (流畅)</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            默认宽高比
          </label>
          <select class="input">
            <option value="16:9" selected>16:9 (宽屏)</option>
            <option value="9:16">9:16 (竖屏)</option>
            <option value="1:1">1:1 (方形)</option>
            <option value="4:3">4:3 (传统)</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            角色一致性权重
          </label>
          <div class="flex items-center space-x-2">
            <input type="range" min="0" max="100" value="80" class="flex-1" />
            <span class="text-sm text-gray-500 w-12">80%</span>
          </div>
        </div>
      </div>
      <div class="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
        <button class="btn-primary">保存设置</button>
      </div>
    </div>

    <!-- Create Modal -->
    <Teleport to="body">
      <div v-if="showCreateModal" class="fixed inset-0 z-50 flex items-center justify-center">
        <div class="fixed inset-0 bg-black/50" @click="showCreateModal = false"></div>
        <div class="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-2xl w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">新建视频</h3>
          <div class="space-y-5">
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">视频标题</label>
                <input v-model="createForm.title" type="text" class="input" placeholder="输入视频标题" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">选择章节</label>
                <select v-model.number="createForm.chapter_id" class="input">
                  <option :value="0">不选择（从小说自动提取）</option>
                  <option v-for="ch in chapters" :key="ch.id" :value="ch.id">
                    第{{ ch.chapter_no }}章 {{ ch.title }}
                  </option>
                </select>
              </div>
            </div>

            <!-- Video Style (format preset) -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">视频格式</label>
              <StylePicker type="video" v-model="createForm.video_preset" compact />
              <p class="mt-1 text-xs text-gray-400">选择后自动设置宽高比和帧率</p>
            </div>

            <!-- Image / Art Style -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">图片风格</label>
              <StylePicker type="image" v-model="createForm.art_style" compact />
            </div>

            <!-- Generation Mode -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">生成模式</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="m in VIDEO_MODES"
                  :key="m.id"
                  type="button"
                  class="rounded-xl border-2 p-3 text-left transition-all"
                  :class="createForm.mode === m.id
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 shadow-sm'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'"
                  @click="createForm.mode = m.id"
                >
                  <div class="flex items-center gap-2 mb-1">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="m.icon" />
                    </svg>
                    <p class="text-sm font-semibold">{{ m.name }}</p>
                  </div>
                  <p class="text-xs opacity-75">{{ m.desc }}</p>
                </button>
              </div>
            </div>

            <!-- Quality Tier -->
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">生成质量</label>
              <div class="grid grid-cols-3 gap-2">
                <button
                  v-for="tier in QUALITY_TIERS"
                  :key="tier.id"
                  type="button"
                  class="rounded-xl border-2 p-3 text-left transition-all"
                  :class="[
                    createForm.quality_tier === tier.id
                      ? `${tier.border} ${tier.color} shadow-sm`
                      : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                  ]"
                  @click="createForm.quality_tier = tier.id"
                >
                  <p class="text-sm font-semibold">{{ tier.name }}</p>
                  <p class="text-xs mt-0.5 opacity-75">{{ tier.desc }}</p>
                </button>
              </div>
            </div>

            <!-- Cost Estimate -->
            <div class="rounded-lg bg-gray-50 dark:bg-gray-700/50 px-4 py-3 text-sm">
              <div class="flex items-center justify-between">
                <span class="text-gray-600 dark:text-gray-400">预估消耗</span>
                <span class="font-medium text-gray-900 dark:text-white">
                  ~{{ estShots.shots }} 镜头 × {{ estShots.tier.costMult }} = {{ estShots.cost }} 点
                </span>
              </div>
              <p v-if="createForm.quality_tier === 'draft'" class="mt-1 text-xs text-gray-400">
                草稿模式：静图+平移动效，成本最低，适合验证剧情
              </p>
              <p v-else-if="createForm.quality_tier === 'preview'" class="mt-1 text-xs text-gray-400">
                预览模式：短片段，适合确认镜头感后再升级
              </p>
              <p v-else class="mt-1 text-xs text-gray-400">
                正式模式：完整高质量输出，建议剧情确认后再选择
              </p>
            </div>
          </div>
          <div class="mt-6 flex justify-end space-x-2">
            <button class="btn-outline" @click="showCreateModal = false">取消</button>
            <button class="btn-primary" @click="createVideo">创建</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
