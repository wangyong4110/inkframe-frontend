<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { Novel, Video } from '~/types'

definePageMeta({ layout: false, auth: false })

useHead({ title: '简影 - AI 小说转视频平台' })

const authStore = useAuthStore()
const router = useRouter()
const platformApi = usePlatformApi()
const userMenuOpen = ref(false)

async function logout() {
  await authStore.logout()
  userMenuOpen.value = false
  router.push('/')
}

function goProfile() {
  userMenuOpen.value = false
  router.push('/profile')
}

function onClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.user-menu-anchor')) userMenuOpen.value = false
}

onMounted(() => document.addEventListener('click', onClickOutside))
onUnmounted(() => document.removeEventListener('click', onClickOutside))
const publicNovelApi = usePublicNovelApi()
const hotVideos = ref<Video[]>([])
const hotNovels = ref<Novel[]>([])

onMounted(async () => {
  // 加载精选视频 + 精选小说（公开接口）
  try {
    const [videoRes, novelRes] = await Promise.allSettled([
      platformApi.getPlatformFeed({ sort: 'hot', page: 1, page_size: 6 }),
      publicNovelApi.getNovelFeed({ sort: 'hot', page: 1, page_size: 6 }),
    ])
    if (videoRes.status === 'fulfilled') hotVideos.value = videoRes.value?.data?.items ?? []
    if (novelRes.status === 'fulfilled') hotNovels.value = novelRes.value?.data?.items ?? []
  } catch {
    // non-fatal
  }
})


const pipeline = [
  {
    icon: '✍️',
    title: '构思创作',
    desc: '多 AI 提供商协同，生成完整世界观、角色体系和章节内容',
    bgClass: 'bg-blue-500/20 border border-blue-500/30',
  },
  {
    icon: '🎬',
    title: '分镜策划',
    desc: 'AI 自动将章节拆解为专业电影分镜，含镜头语言和情绪设计',
    bgClass: 'bg-violet-500/20 border border-violet-500/30',
  },
  {
    icon: '🎨',
    title: '视觉生成',
    desc: '基于场景的一致性图像生成，Ken Burns 动态镜头效果',
    bgClass: 'bg-purple-500/20 border border-purple-500/30',
  },
  {
    icon: '🎥',
    title: '视频合成',
    desc: 'BGM、配音、字幕、转场的专业后期合成，EBU R128 音频标准',
    bgClass: 'bg-indigo-500/20 border border-indigo-500/30',
  },
]

const features = [
  {
    icon: '🤖',
    title: '多 AI 提供商',
    desc: '支持 OpenAI、Claude、Deepseek、通义千问、豆包等，自动重试和失败切换',
    iconBg: 'bg-blue-500/20',
    tags: ['OpenAI', 'Claude', 'Deepseek', 'Doubao'],
  },
  {
    icon: '🧠',
    title: '分层记忆系统',
    desc: '全局摘要 + 弧线摘要 + 最近章节的层级上下文，支持 100+ 章长篇创作',
    iconBg: 'bg-violet-500/20',
    tags: ['长篇支持', '连贯性保障'],
  },
  {
    icon: '🎬',
    title: '电影级视频',
    desc: 'Kling Pro 模式、Ken Burns 动效、场景一致性、EBU R128 音频',
    iconBg: 'bg-amber-500/20',
    tags: ['Kling AI', '4K支持', 'BGM混音'],
  },
  {
    icon: '✍️',
    title: '专业小说改写',
    desc: '五级版权合规改写（字词润色→深度蒸馏），词法/结构/语义三维相似度检测，生成合规报告',
    iconBg: 'bg-emerald-500/20',
    tags: ['版权合规', '独立作品', 'AI辅助'],
  },
  {
    icon: '👤',
    title: '角色世界管理',
    desc: '角色状态快照、三视图生成、世界观词条体系、道具与技能系统',
    iconBg: 'bg-rose-500/20',
    tags: ['角色一致性', '世界观'],
  },
  {
    icon: '📊',
    title: '质量控制',
    desc: 'AI 评分（逻辑/一致性/质量/文风）+ 规则检测，自动优化章节内容',
    iconBg: 'bg-cyan-500/20',
    tags: ['自动评分', '精炼润色'],
  },
]

const stats = [
  { value: '6+', label: 'AI 模型提供商' },
  { value: '100+', label: '章长篇支持' },
  { value: '4K', label: '视频输出质量' },
  { value: '5', label: '级版权合规改写' },
]
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white">

    <!-- Navigation -->
    <nav class="fixed top-0 left-0 right-0 z-50 border-b border-gray-800/50 bg-gray-950/80 backdrop-blur-xl">
      <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <!-- Logo -->
        <NuxtLink to="/" class="flex items-center gap-3">
          <AppLogo :size="36" />
          <span class="font-bold text-white text-lg tracking-tight">简影</span>
        </NuxtLink>

        <!-- Auth -->
        <div class="flex items-center gap-3">
          <template v-if="!authStore.isLoggedIn">
            <NuxtLink to="/auth/login" class="text-gray-400 hover:text-white text-sm transition-colors">登录</NuxtLink>
            <NuxtLink
              to="/auth/register"
              class="bg-violet-600 hover:bg-violet-500 text-white text-sm px-4 py-2 rounded-lg transition-colors font-medium"
            >
              注册
            </NuxtLink>
          </template>
          <template v-else>
            <div class="relative hidden sm:block user-menu-anchor">
              <button
                class="text-sm text-gray-400 hover:text-white transition-colors px-2 py-1 rounded-lg hover:bg-gray-800"
                @click="userMenuOpen = !userMenuOpen"
              >
                {{ authStore.user?.nickname || authStore.user?.username || '用户' }}
                <span class="ml-1 text-xs opacity-60">▾</span>
              </button>
              <div
                v-if="userMenuOpen"
                class="absolute right-0 mt-1 w-36 bg-gray-800 border border-gray-700 rounded-xl shadow-xl py-1 z-50"
              >
                <button
                  class="w-full text-left px-4 py-2 text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                  @click="goProfile"
                >个人资料</button>
                <button
                  class="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-700 hover:text-red-300 transition-colors"
                  @click="logout"
                >退出登录</button>
              </div>
            </div>
            <NuxtLink
              to="/novel"
              class="bg-violet-600 hover:bg-violet-500 text-white text-sm px-4 py-2 rounded-lg transition-colors font-medium"
            >
              进入创作台
            </NuxtLink>
          </template>
        </div>
      </div>
    </nav>

    <!-- Hero Section -->
    <section class="relative pt-32 pb-24 px-6 overflow-hidden">
      <!-- Background gradient orbs -->
      <div class="absolute inset-0 overflow-hidden pointer-events-none">
        <div class="absolute -top-40 -right-40 w-96 h-96 bg-violet-600/20 rounded-full blur-3xl"></div>
        <div class="absolute -bottom-20 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl"></div>
        <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-purple-900/10 rounded-full blur-3xl"></div>
      </div>

      <div class="relative max-w-5xl mx-auto text-center">
        <!-- Badge -->
        <div class="inline-flex items-center gap-2 bg-violet-500/10 border border-violet-500/30 rounded-full px-4 py-1.5 mb-6">
          <span class="w-2 h-2 bg-violet-400 rounded-full animate-pulse"></span>
          <span class="text-violet-300 text-xs font-medium">AI 驱动 · 小说到视频全链路创作</span>
        </div>

        <!-- Headline -->
        <h1 class="text-5xl md:text-6xl lg:text-7xl font-black text-white leading-tight mb-6 tracking-tight">
          让故事<span class="bg-gradient-to-r from-violet-400 via-purple-300 to-indigo-400 bg-clip-text text-transparent">鲜活起来</span>
        </h1>

        <!-- Subtext -->
        <p class="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          简影 将 AI 创作、专业分镜、电影级视频生成融为一体。
          从一个想法出发，全自动生成完整小说，一键转化为视觉盛宴。
        </p>

        <!-- CTA Buttons -->
        <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
          <NuxtLink
            to="/novel/create"
            class="w-full sm:w-auto bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-all shadow-lg shadow-violet-900/40 text-center"
          >
            立即创作 →
          </NuxtLink>
          <NuxtLink
            to="/plaza"
            class="w-full sm:w-auto bg-gray-800 hover:bg-gray-700 text-gray-200 font-medium px-8 py-3.5 rounded-xl transition-colors border border-gray-700 text-center"
          >
            作品集
          </NuxtLink>
        </div>

        <!-- Mini stats -->
        <div class="flex flex-wrap items-center justify-center gap-6 mt-12 text-sm text-gray-500">
          <div class="flex items-center gap-1.5">
            <span class="text-emerald-400">✓</span>
            <span>6+ AI 提供商</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-emerald-400">✓</span>
            <span>电影级视频输出</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-emerald-400">✓</span>
            <span>专业版权改写</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Pipeline Visualization -->
    <section class="py-20 px-6 border-t border-gray-800/50">
      <div class="max-w-5xl mx-auto">
        <div class="text-center mb-12">
          <h2 class="text-2xl md:text-3xl font-bold text-white mb-3">从想象到银幕，四步完成</h2>
          <p class="text-gray-400">完整的 AI 创作流水线，每一步都有专业工具支持</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-4 gap-8 md:gap-0 relative">
          <!-- Connecting line (desktop only) -->
          <div class="hidden md:block absolute top-8 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-violet-500/0 via-violet-500/40 to-violet-500/0"></div>

          <div v-for="(step, i) in pipeline" :key="i" class="flex flex-col items-center text-center px-4">
            <div :class="['w-16 h-16 rounded-2xl flex items-center justify-center text-2xl mb-4 relative z-10', step.bgClass]">
              {{ step.icon }}
            </div>
            <div class="text-xs font-semibold text-violet-400 mb-1 tracking-wider">STEP {{ i + 1 }}</div>
            <h3 class="font-bold text-white mb-2">{{ step.title }}</h3>
            <p class="text-xs text-gray-400 leading-relaxed">{{ step.desc }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Feature Cards -->
    <section class="py-20 px-6" style="background: rgba(17, 24, 39, 0.3);">
      <div class="max-w-7xl mx-auto">
        <div class="text-center mb-12">
          <h2 class="text-2xl md:text-3xl font-bold text-white mb-3">专业功能，开箱即用</h2>
          <p class="text-gray-400">每个功能都经过专业创作者打磨</p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div
            v-for="feature in features"
            :key="feature.title"
            class="bg-gray-900 border border-gray-800 rounded-xl p-6 hover:border-gray-700 transition-colors group"
          >
            <div :class="['w-10 h-10 rounded-xl flex items-center justify-center text-lg mb-4', feature.iconBg]">
              {{ feature.icon }}
            </div>
            <h3 class="font-semibold text-white mb-2 group-hover:text-violet-300 transition-colors">{{ feature.title }}</h3>
            <p class="text-sm text-gray-400 leading-relaxed">{{ feature.desc }}</p>
            <div v-if="feature.tags" class="flex flex-wrap gap-1.5 mt-3">
              <span
                v-for="tag in feature.tags"
                :key="tag"
                class="text-xs bg-gray-800 text-gray-400 px-2 py-0.5 rounded"
              >{{ tag }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Stats Bar -->
    <section class="py-16 px-6 border-t border-b border-gray-800/50">
      <div class="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
        <div v-for="stat in stats" :key="stat.label" class="text-center">
          <div class="text-3xl font-black text-white mb-1">{{ stat.value }}</div>
          <div class="text-sm text-gray-500">{{ stat.label }}</div>
        </div>
      </div>
    </section>

    <!-- Hot Videos Section -->
    <section v-if="hotVideos.length > 0" class="py-16 px-6" style="background: rgba(17, 24, 39, 0.5);">
      <div class="max-w-7xl mx-auto">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h2 class="text-xl font-bold text-white">精选视频</h2>
            <p class="text-sm text-gray-500 mt-0.5">AI 小说改编视频作品</p>
          </div>
          <NuxtLink to="/platform" class="text-sm text-violet-400 hover:text-violet-300 transition-colors">
            查看全部 →
          </NuxtLink>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <NuxtLink
            v-for="v in hotVideos"
            :key="v.id"
            :to="`/platform/video/${v.id}`"
            class="group block rounded-xl overflow-hidden bg-gray-900 border border-gray-800 hover:border-gray-700 transition-all hover:shadow-lg hover:shadow-violet-900/10"
          >
            <!-- Cover -->
            <div class="relative aspect-video bg-gray-800 overflow-hidden">
              <img
                v-if="v.cover_url"
                :src="v.cover_url"
                :alt="v.title"
                loading="lazy"
                decoding="async"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div v-else class="w-full h-full flex items-center justify-center">
                <svg class="w-8 h-8 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.069A1 1 0 0121 8.876V15.5a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z"/>
                </svg>
              </div>

              <!-- Play overlay -->
              <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                <div class="w-9 h-9 rounded-full bg-white/90 flex items-center justify-center shadow">
                  <svg class="w-4 h-4 text-gray-900 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </div>
              </div>

              <!-- Duration badge -->
              <div v-if="v.duration" class="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded font-mono">
                {{ Math.floor(v.duration / 60) }}:{{ String(Math.floor(v.duration % 60)).padStart(2, '0') }}
              </div>
            </div>

            <!-- Info -->
            <div class="p-2.5">
              <p class="text-xs font-medium text-gray-200 line-clamp-2 leading-snug mb-1">{{ v.title }}</p>
              <div class="flex items-center justify-between text-xs text-gray-500">
                <span class="flex items-center gap-1">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                  </svg>
                  {{ (v.view_count ?? 0) >= 10000 ? `${((v.view_count ?? 0) / 10000).toFixed(1)}w` : (v.view_count ?? 0) }}
                </span>
              </div>
            </div>
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Hot Novels Section -->
    <section v-if="hotNovels.length > 0" class="py-16 px-6 border-t border-gray-800/50">
      <div class="max-w-7xl mx-auto">
        <div class="flex items-center justify-between mb-8">
          <div>
            <h2 class="text-xl font-bold text-white">精选小说</h2>
            <p class="text-sm text-gray-500 mt-0.5">AI 创作小说精品推荐</p>
          </div>
          <NuxtLink to="/plaza" class="text-sm text-violet-400 hover:text-violet-300 transition-colors">
            查看全部 →
          </NuxtLink>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <NuxtLink
            v-for="n in hotNovels"
            :key="n.id"
            :to="`/plaza/novel/${n.id}`"
            class="group block rounded-xl overflow-hidden bg-gray-900 border border-gray-800 hover:border-gray-700 transition-all hover:shadow-lg hover:shadow-violet-900/10"
          >
            <!-- Cover -->
            <div class="relative aspect-[3/4] bg-gray-800 overflow-hidden">
              <img
                v-if="n.cover_image"
                :src="n.cover_image"
                :alt="n.title"
                loading="lazy"
                decoding="async"
                class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div v-else class="w-full h-full flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-indigo-900/40 to-purple-900/40">
                <svg class="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/>
                </svg>
              </div>

              <!-- Words badge -->
              <div v-if="n.total_words" class="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-xs px-1.5 py-0.5 rounded">
                {{ n.total_words >= 10000 ? `${(n.total_words / 10000).toFixed(0)}万字` : `${n.total_words}字` }}
              </div>
            </div>

            <!-- Info -->
            <div class="p-2.5">
              <p class="text-xs font-medium text-gray-200 line-clamp-2 leading-snug mb-1">{{ n.title }}</p>
              <div class="flex items-center justify-between text-xs text-gray-500">
                <span class="flex items-center gap-1">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                  </svg>
                  {{ (n.view_count ?? 0) >= 10000 ? `${((n.view_count ?? 0) / 10000).toFixed(1)}w` : (n.view_count ?? 0) }}
                </span>
                <span v-if="n.genre" class="text-indigo-500">{{ ({ fantasy:'奇幻', xianxia:'仙侠', urban:'都市', scifi:'科幻', romance:'言情', mystery:'悬疑', historical:'历史' } as Record<string,string>)[n.genre] ?? n.genre }}</span>
              </div>
            </div>
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="border-t border-gray-800 py-10 px-6">
      <div class="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div class="flex items-center gap-2 text-gray-500 text-sm">
          <AppLogo :size="20" />
          <span>简影 &copy; 2026</span>
        </div>
        <div class="flex gap-6 text-sm text-gray-500">
          <NuxtLink to="/manual" class="hover:text-gray-300 transition-colors">功能介绍</NuxtLink>
          <NuxtLink to="/terms" class="hover:text-gray-300 transition-colors">使用条款</NuxtLink>
          <NuxtLink to="/privacy" class="hover:text-gray-300 transition-colors">隐私政策</NuxtLink>
        </div>
      </div>
    </footer>

  </div>
</template>
