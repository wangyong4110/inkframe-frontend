<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const showUserMenu = ref(false)
const mobileMenuOpen = ref(false)
const showNotifPanel = ref(false)
const showNotifDetail = ref(false)
const selectedNotif = ref<import('~/composables/useNotificationApi').Notification | null>(null)

// 通知
const notifApi = useNotificationApi()
const unreadCount = ref(0)
const notifications = ref<import('~/composables/useNotificationApi').Notification[]>([])
const notifLoading = ref(false)
const notifTab = ref<'unread' | 'read'>('unread')

const unreadNotifs = computed(() => notifications.value.filter(n => !n.is_read))
const readNotifs = computed(() => notifications.value.filter(n => n.is_read))
const currentTabNotifs = computed(() => notifTab.value === 'unread' ? unreadNotifs.value : readNotifs.value)

async function fetchUnreadCount() {
  if (!authStore.isLoggedIn) return
  try {
    const res = await notifApi.unreadCount()
    unreadCount.value = (res as any)?.data?.count ?? (res as any)?.count ?? 0
  } catch {}
}

async function openNotifPanel() {
  showNotifPanel.value = !showNotifPanel.value
  if (!showNotifPanel.value) return
  notifTab.value = 'unread'
  notifLoading.value = true
  try {
    const res = await notifApi.list(false, 1, 50)
    notifications.value = (res as any)?.data?.items ?? (res as any)?.items ?? []
    unreadCount.value = unreadNotifs.value.length
  } catch {} finally {
    notifLoading.value = false
  }
}

async function handleMarkRead(n: import('~/composables/useNotificationApi').Notification) {
  if (!n.is_read) {
    await notifApi.markRead(n.id).catch(() => {})
    n.is_read = true
    unreadCount.value = Math.max(0, unreadCount.value - 1)
  }
  selectedNotif.value = n
  showNotifDetail.value = true
}

function handleNotifDetailNavigate() {
  if (selectedNotif.value?.link_path) {
    showNotifDetail.value = false
    showNotifPanel.value = false
    router.push(selectedNotif.value.link_path)
  }
}

async function handleMarkAllRead() {
  await notifApi.markAllRead().catch(() => {})
  notifications.value.forEach(n => { n.is_read = true })
  unreadCount.value = 0
}

const handleDocClick = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (!target.closest('.user-menu-wrapper')) showUserMenu.value = false
  if (!target.closest('.notif-wrapper')) showNotifPanel.value = false
}

onMounted(() => {
  document.documentElement.classList.add('dark')
  document.addEventListener('click', handleDocClick)
  fetchUnreadCount()
  // 每 60 秒轮询一次未读数
  const timer = setInterval(fetchUnreadCount, 60_000)
  onUnmounted(() => clearInterval(timer))
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocClick)
})

watch(() => route.path, () => { mobileMenuOpen.value = false })

const navItems = [
  { label: '项目', to: '/novel' },
  { label: '素材', to: '/assets' },
  { label: '模型', to: '/model' },
]

const breadcrumbs = computed(() => {
  const items = []
  const paths = route.path.split('/').filter(Boolean)
  let currentPath = ''
  for (const path of paths) {
    currentPath += `/${path}`
    const item = navItems.find(i => i.to === currentPath)
    if (item) items.push({ label: item.label, to: item.to })
  }
  return items
})
</script>

<template>
  <NuxtLoadingIndicator color="#6366f1" :height="3" />
  <div class="min-h-screen bg-gray-950 text-white">
    <!-- Header -->
    <header class="sticky top-0 z-50 border-b border-gray-800/50 bg-gray-950/80 backdrop-blur-xl">
      <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <!-- Logo -->
        <NuxtLink to="/novel" class="flex items-center gap-2.5">
          <AppLogo :size="36" />
          <div class="flex items-baseline gap-1.5">
            <span class="font-bold text-white text-lg tracking-tight">简影</span>
            <span class="text-xs font-medium text-violet-400 bg-violet-500/15 border border-violet-500/30 px-1.5 py-0.5 rounded-full leading-none">创作台</span>
          </div>
        </NuxtLink>

        <!-- Navigation (desktop) -->
        <nav class="hidden md:flex items-center gap-6">
          <NuxtLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="text-sm transition-colors"
            :class="route.path === item.to || route.path.startsWith(item.to + '/')
              ? 'text-white font-medium'
              : 'text-gray-400 hover:text-white'"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>

        <!-- Right Side -->
        <div class="flex items-center gap-3">
          <!-- 广场入口 -->
          <NuxtLink
            to="/plaza"
            class="hidden md:flex items-center gap-1 text-sm text-gray-500 hover:text-gray-300 transition-colors mr-1"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
            </svg>
            广场
          </NuxtLink>
          <!-- Mobile hamburger button -->
          <button
            class="md:hidden p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500"
            aria-label="切换菜单"
            :aria-expanded="mobileMenuOpen"
            @click="mobileMenuOpen = !mobileMenuOpen"
          >
            <svg v-if="!mobileMenuOpen" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <svg v-else class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <!-- 通知铃铛 -->
          <div v-if="authStore.isLoggedIn" class="relative notif-wrapper">
            <button
              class="relative p-2 rounded-lg hover:bg-gray-800 transition-colors"
              aria-label="通知"
              @click.stop="openNotifPanel"
            >
              <svg class="w-5 h-5 text-gray-400 hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
              </svg>
              <span
                v-if="unreadCount > 0"
                class="absolute top-1 right-1 min-w-[16px] h-4 px-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center"
              >{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
            </button>
            <!-- 通知面板 -->
            <div
              v-if="showNotifPanel"
              class="absolute right-0 mt-1 w-80 bg-gray-900 rounded-xl shadow-2xl border border-gray-700 z-50 overflow-hidden"
              @click.stop
            >
              <!-- Header -->
              <div class="flex items-center justify-between px-4 pt-3 pb-0 border-b border-gray-700">
                <div class="flex gap-0">
                  <button
                    class="px-3 py-2 text-sm font-medium border-b-2 transition-colors"
                    :class="notifTab === 'unread'
                      ? 'border-violet-500 text-white'
                      : 'border-transparent text-gray-400 hover:text-gray-200'"
                    @click="notifTab = 'unread'"
                  >
                    未读
                    <span
                      v-if="unreadNotifs.length > 0"
                      class="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-violet-600 text-white text-[10px] font-bold"
                    >{{ unreadNotifs.length }}</span>
                  </button>
                  <button
                    class="px-3 py-2 text-sm font-medium border-b-2 transition-colors"
                    :class="notifTab === 'read'
                      ? 'border-violet-500 text-white'
                      : 'border-transparent text-gray-400 hover:text-gray-200'"
                    @click="notifTab = 'read'"
                  >
                    已读
                  </button>
                </div>
                <button
                  v-if="notifTab === 'unread' && unreadNotifs.length > 0"
                  class="text-xs text-violet-400 hover:text-violet-300 transition-colors pb-2"
                  @click="handleMarkAllRead"
                >全部已读</button>
              </div>
              <!-- Body -->
              <div v-if="notifLoading" class="flex justify-center py-8">
                <div class="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin"/>
              </div>
              <ul v-else-if="currentTabNotifs.length > 0" class="max-h-96 overflow-y-auto divide-y divide-gray-800">
                <li
                  v-for="n in currentTabNotifs"
                  :key="n.id"
                  class="px-4 py-3 hover:bg-gray-800 cursor-pointer transition-colors"
                  :class="{ 'opacity-60': n.is_read }"
                  @click="handleMarkRead(n)"
                >
                  <div class="flex items-start gap-2">
                    <span
                      v-if="!n.is_read"
                      class="mt-1.5 w-2 h-2 rounded-full bg-violet-500 flex-shrink-0"
                    />
                    <span v-else class="mt-1.5 w-2 h-2 flex-shrink-0"/>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm text-white font-medium leading-snug truncate">{{ n.title }}</p>
                      <p class="text-xs text-gray-400 mt-0.5 line-clamp-2">{{ n.body }}</p>
                      <p class="text-xs text-gray-600 mt-1">{{ new Date(n.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</p>
                    </div>
                  </div>
                </li>
              </ul>
              <div v-else class="text-center py-10 text-sm text-gray-500">
                {{ notifTab === 'unread' ? '暂无未读通知' : '暂无已读通知' }}
              </div>
            </div>
          </div>

          <div v-if="authStore.isLoggedIn" class="relative user-menu-wrapper">
            <button
              @click="showUserMenu = !showUserMenu"
              aria-label="用户菜单"
              class="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
            >
              <div class="w-8 h-8 bg-violet-600 rounded-full flex items-center justify-center overflow-hidden">
                <img v-if="authStore.user?.avatar" :src="authStore.user.avatar" class="w-full h-full object-cover" alt="avatar" />
                <span v-else class="text-white text-sm font-medium">
                  {{ (authStore.user?.nickname || authStore.user?.username || 'U')[0].toUpperCase() }}
                </span>
              </div>
              <span class="hidden sm:block text-sm text-gray-300">
                {{ authStore.user?.nickname || authStore.user?.username || '用户' }}
              </span>
            </button>
            <!-- Dropdown -->
            <div
              v-if="showUserMenu"
              class="absolute right-0 mt-1 w-40 bg-gray-900 rounded-xl shadow-xl border border-gray-700 py-1 z-50"
            >
              <NuxtLink
                to="/profile"
                class="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors"
                @click="showUserMenu = false"
              >
                个人资料
              </NuxtLink>
              <button
                class="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-800 transition-colors"
                @click="authStore.logout(); showUserMenu = false"
              >
                退出登录
              </button>
            </div>
          </div>
          <div v-else class="flex items-center gap-3">
            <NuxtLink to="/auth/login" class="text-sm text-gray-400 hover:text-white transition-colors">
              登录
            </NuxtLink>
            <NuxtLink
              to="/auth/register"
              class="bg-violet-600 hover:bg-violet-500 text-white text-sm px-4 py-2 rounded-lg transition-colors font-medium"
            >
              注册
            </NuxtLink>
          </div>
        </div>
      </div>

      <!-- Mobile Navigation Menu -->
      <div
        v-if="mobileMenuOpen"
        class="md:hidden border-t border-gray-800/50 bg-gray-950/95 backdrop-blur-xl"
      >
        <nav class="max-w-7xl mx-auto px-6 py-4 flex flex-col gap-1">
          <NuxtLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="px-3 py-2.5 rounded-lg text-sm transition-colors"
            :class="route.path === item.to || route.path.startsWith(item.to + '/')
              ? 'bg-violet-600/20 text-white font-medium'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'"
            @click="mobileMenuOpen = false"
          >
            {{ item.label }}
          </NuxtLink>
          <div v-if="!authStore.isLoggedIn" class="pt-2 flex flex-col gap-2 border-t border-gray-800/50 mt-1">
            <NuxtLink to="/auth/login" class="px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
              登录
            </NuxtLink>
            <NuxtLink to="/auth/register" class="px-3 py-2.5 rounded-lg text-sm bg-violet-600 hover:bg-violet-500 text-white transition-colors text-center font-medium">
              注册
            </NuxtLink>
          </div>
        </nav>
      </div>
    </header>

    <!-- Breadcrumbs -->
    <div v-if="breadcrumbs.length > 0" class="border-b border-gray-800/50">
      <div class="max-w-7xl mx-auto px-6 py-3">
        <ol class="flex items-center gap-2 text-sm">
          <li>
            <NuxtLink to="/" class="text-gray-500 hover:text-gray-300 transition-colors">首页</NuxtLink>
          </li>
          <li v-for="(crumb, index) in breadcrumbs" :key="crumb.to" class="flex items-center gap-2">
            <svg class="w-3.5 h-3.5 text-gray-600" fill="currentColor" viewBox="0 0 20 20">
              <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
            </svg>
            <NuxtLink v-if="index < breadcrumbs.length - 1" :to="crumb.to" class="text-gray-500 hover:text-gray-300 transition-colors">
              {{ crumb.label }}
            </NuxtLink>
            <span v-else class="text-gray-300 font-medium">{{ crumb.label }}</span>
          </li>
        </ol>
      </div>
    </div>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-6 py-8">
      <slot />
    </main>

    <!-- Toast notifications -->
    <AppToast />

    <!-- Footer -->
    <footer class="border-t border-gray-800 mt-auto">
      <div class="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div class="flex items-center gap-2 text-gray-500 text-sm">
          <AppLogo :size="20" />
          <span>简影 © 2025</span>
        </div>
        <div class="flex items-center gap-6 text-sm text-gray-500">
          <NuxtLink to="/plaza" class="hover:text-gray-300 transition-colors">作品广场</NuxtLink>
          <NuxtLink to="/manual" class="hover:text-gray-300 transition-colors">功能介绍</NuxtLink>
          <NuxtLink to="/terms" class="hover:text-gray-300 transition-colors">使用条款</NuxtLink>
          <NuxtLink to="/privacy" class="hover:text-gray-300 transition-colors">隐私政策</NuxtLink>
        </div>
      </div>
    </footer>
  </div>

  <!-- AI Provider Guard Modal -->
  <AiProviderGuardModal />

  <!-- Feedback Widget -->
  <FeedbackWidget />

  <!-- 站内信详情弹窗 -->
  <Teleport to="body">
    <div
      v-if="showNotifDetail && selectedNotif"
      class="fixed inset-0 z-[200] flex items-center justify-center p-4"
      @click.self="showNotifDetail = false"
    >
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="showNotifDetail = false"/>
      <div class="relative w-full max-w-md bg-gray-900 rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
        <!-- Header -->
        <div class="flex items-start justify-between px-5 py-4 border-b border-gray-800">
          <div class="flex items-center gap-2.5 flex-1 min-w-0 pr-4">
            <span
              class="flex-shrink-0 w-2 h-2 rounded-full mt-1"
              :class="selectedNotif.is_read ? 'bg-gray-600' : 'bg-violet-500'"
            />
            <h3 class="text-base font-semibold text-white leading-snug">{{ selectedNotif.title }}</h3>
          </div>
          <button
            class="flex-shrink-0 p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
            @click="showNotifDetail = false"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <!-- Body -->
        <div class="px-5 py-4 max-h-72 overflow-y-auto">
          <p class="text-sm text-gray-300 whitespace-pre-wrap break-words leading-relaxed">{{ selectedNotif.body }}</p>
        </div>
        <!-- Footer -->
        <div class="px-5 py-3 border-t border-gray-800 flex items-center justify-between">
          <span class="text-xs text-gray-500">
            {{ new Date(selectedNotif.created_at).toLocaleString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}
          </span>
          <button
            v-if="selectedNotif.link_path"
            class="text-sm text-violet-400 hover:text-violet-300 font-medium transition-colors flex items-center gap-1"
            @click="handleNotifDetailNavigate"
          >
            前往查看
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
          <button
            v-else
            class="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            @click="showNotifDetail = false"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
