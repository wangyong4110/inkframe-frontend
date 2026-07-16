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
  const timer = setInterval(fetchUnreadCount, 60_000)
  onUnmounted(() => clearInterval(timer))
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocClick)
})

watch(() => route.path, () => { mobileMenuOpen.value = false })

const navItems = [
  { label: '小说', to: '/plaza' },
  { label: '视频', to: '/platform' },
  { label: '排行榜', to: '/plaza/ranking' },
]

function isActive(item: { to: string }) {
  if (item.to === '/plaza') {
    return route.path === '/plaza' || route.path.startsWith('/plaza/novel')
  }
  if (item.to === '/platform') {
    return route.path === '/platform' || route.path.startsWith('/platform/video')
  }
  return route.path === item.to || route.path.startsWith(item.to + '/')
}
</script>

<template>
  <NuxtLoadingIndicator color="#6366f1" :height="3" />
  <div class="min-h-screen bg-gray-950 text-white">
    <!-- Header -->
    <header class="sticky top-0 z-50 border-b border-gray-800/50 bg-gray-950/80 backdrop-blur-xl">
      <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">

        <!-- Logo + 广场 badge -->
        <NuxtLink to="/plaza" class="flex items-center gap-2.5">
          <AppLogo :size="32" />
          <div class="flex items-baseline gap-1.5">
            <span class="font-bold text-white text-base tracking-tight">简影</span>
            <span class="text-xs font-medium text-indigo-400 bg-indigo-500/15 border border-indigo-500/30 px-1.5 py-0.5 rounded-full leading-none">广场</span>
          </div>
        </NuxtLink>

        <!-- Navigation (desktop) -->
        <nav class="hidden md:flex items-center gap-1">
          <NuxtLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="px-3 py-1.5 rounded-lg text-sm transition-colors"
            :class="isActive(item)
              ? 'text-white font-medium bg-gray-800'
              : 'text-gray-400 hover:text-white hover:bg-gray-800/60'"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>

        <!-- Right Side -->
        <div class="flex items-center gap-2">
          <!-- Mobile hamburger -->
          <button
            class="md:hidden p-2 rounded-md text-gray-400 hover:text-white hover:bg-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
            aria-label="切换菜单"
            :aria-expanded="mobileMenuOpen"
            @click="mobileMenuOpen = !mobileMenuOpen"
          >
            <svg v-if="!mobileMenuOpen" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
            <svg v-else class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
              <div class="flex items-center justify-between px-4 pt-3 pb-0 border-b border-gray-700">
                <div class="flex gap-0">
                  <button
                    class="px-3 py-2 text-sm font-medium border-b-2 transition-colors"
                    :class="notifTab === 'unread' ? 'border-indigo-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'"
                    @click="notifTab = 'unread'"
                  >
                    未读
                    <span v-if="unreadNotifs.length > 0" class="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold">{{ unreadNotifs.length }}</span>
                  </button>
                  <button
                    class="px-3 py-2 text-sm font-medium border-b-2 transition-colors"
                    :class="notifTab === 'read' ? 'border-indigo-500 text-white' : 'border-transparent text-gray-400 hover:text-gray-200'"
                    @click="notifTab = 'read'"
                  >已读</button>
                </div>
                <button v-if="notifTab === 'unread' && unreadNotifs.length > 0" class="text-xs text-indigo-400 hover:text-indigo-300 transition-colors pb-2" @click="handleMarkAllRead">全部已读</button>
              </div>
              <div v-if="notifLoading" class="flex justify-center py-8">
                <div class="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/>
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
                    <span v-if="!n.is_read" class="mt-1.5 w-2 h-2 rounded-full bg-indigo-500 flex-shrink-0"/>
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

          <!-- 用户菜单 -->
          <div v-if="authStore.isLoggedIn" class="relative user-menu-wrapper">
            <button
              class="flex items-center gap-2 p-1.5 rounded-lg hover:bg-gray-800 transition-colors"
              aria-label="用户菜单"
              @click="showUserMenu = !showUserMenu"
            >
              <div class="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center overflow-hidden">
                <img v-if="authStore.user?.avatar" :src="authStore.user.avatar" class="w-full h-full object-cover" alt="avatar" />
                <span v-else class="text-white text-xs font-medium">
                  {{ (authStore.user?.nickname || authStore.user?.username || 'U')[0].toUpperCase() }}
                </span>
              </div>
              <span class="hidden sm:block text-sm text-gray-300 max-w-[80px] truncate">
                {{ authStore.user?.nickname || authStore.user?.username || '用户' }}
              </span>
            </button>
            <div v-if="showUserMenu" class="absolute right-0 mt-1 w-44 bg-gray-900 rounded-xl shadow-xl border border-gray-700 py-1 z-50">
              <NuxtLink to="/profile" class="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-800 hover:text-white transition-colors" @click="showUserMenu = false">
                个人资料
              </NuxtLink>
              <div class="border-t border-gray-800 my-1"/>
              <button class="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-800 transition-colors" @click="authStore.logout(); showUserMenu = false">
                退出登录
              </button>
            </div>
          </div>
          <div v-else class="hidden sm:flex items-center gap-2">
            <NuxtLink to="/auth/login" class="text-sm text-gray-400 hover:text-white transition-colors px-2 py-1">登录</NuxtLink>
          </div>

          <!-- 进入创作台 CTA -->
          <NuxtLink
            to="/novel"
            class="hidden sm:flex items-center gap-1.5 bg-violet-600 hover:bg-violet-500 text-white text-sm px-3.5 py-1.5 rounded-lg transition-colors font-medium whitespace-nowrap"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/>
            </svg>
            进入创作台
          </NuxtLink>
        </div>
      </div>

      <!-- Mobile Menu -->
      <div v-if="mobileMenuOpen" class="md:hidden border-t border-gray-800/50 bg-gray-950/95 backdrop-blur-xl">
        <nav class="max-w-7xl mx-auto px-6 py-4 flex flex-col gap-1">
          <NuxtLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="px-3 py-2.5 rounded-lg text-sm transition-colors"
            :class="isActive(item)
              ? 'bg-indigo-600/20 text-white font-medium'
              : 'text-gray-400 hover:text-white hover:bg-gray-800'"
            @click="mobileMenuOpen = false"
          >
            {{ item.label }}
          </NuxtLink>
          <div class="pt-2 border-t border-gray-800/50 mt-1">
            <NuxtLink
              to="/novel"
              class="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm bg-violet-600 hover:bg-violet-500 text-white font-medium transition-colors"
              @click="mobileMenuOpen = false"
            >
              进入创作台
            </NuxtLink>
          </div>
        </nav>
      </div>
    </header>

    <!-- Main Content (full-width, plaza pages handle own max-width) -->
    <main>
      <slot />
    </main>

    <AppToast />

    <!-- Footer -->
    <footer class="border-t border-gray-800 mt-auto">
      <div class="max-w-7xl mx-auto px-6 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div class="flex items-center gap-4 text-gray-500 text-sm">
          <div class="flex items-center gap-2">
            <AppLogo :size="18" />
            <span>简影 © 2026</span>
          </div>
        </div>
        <div class="flex items-center gap-6 text-sm text-gray-500">
          <NuxtLink to="/manual" class="hover:text-gray-300 transition-colors">功能介绍</NuxtLink>
          <NuxtLink to="/terms" class="hover:text-gray-300 transition-colors">使用条款</NuxtLink>
          <NuxtLink to="/privacy" class="hover:text-gray-300 transition-colors">隐私政策</NuxtLink>
        </div>
      </div>
    </footer>
  </div>

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
        <div class="flex items-start justify-between px-5 py-4 border-b border-gray-800">
          <div class="flex items-center gap-2.5 flex-1 min-w-0 pr-4">
            <span class="flex-shrink-0 w-2 h-2 rounded-full mt-1" :class="selectedNotif.is_read ? 'bg-gray-600' : 'bg-indigo-500'"/>
            <h3 class="text-base font-semibold text-white leading-snug">{{ selectedNotif.title }}</h3>
          </div>
          <button class="flex-shrink-0 p-1 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors" @click="showNotifDetail = false">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="px-5 py-4 max-h-72 overflow-y-auto">
          <p class="text-sm text-gray-300 whitespace-pre-wrap break-words leading-relaxed">{{ selectedNotif.body }}</p>
        </div>
        <div class="px-5 py-3 border-t border-gray-800 flex items-center justify-between">
          <span class="text-xs text-gray-500">{{ new Date(selectedNotif.created_at).toLocaleString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }}</span>
          <button v-if="selectedNotif.link_path" class="text-sm text-indigo-400 hover:text-indigo-300 font-medium transition-colors flex items-center gap-1" @click="handleNotifDetailNavigate">
            前往查看
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
          </button>
          <button v-else class="text-sm text-gray-500 hover:text-gray-300 transition-colors" @click="showNotifDetail = false">关闭</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
