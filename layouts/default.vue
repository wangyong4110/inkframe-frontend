<script setup lang="ts">
const route = useRoute()
const authStore = useAuthStore()
const showUserMenu = ref(false)

onMounted(() => {
  document.documentElement.classList.add('dark')
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (!target.closest('.user-menu-wrapper')) showUserMenu.value = false
  })
})

const navItems = [
  { label: '首页', to: '/' },
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
  <div class="min-h-screen bg-gray-950 text-white">
    <!-- Header -->
    <header class="sticky top-0 z-50 border-b border-gray-800/50 bg-gray-950/80 backdrop-blur-xl">
      <div class="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <!-- Logo -->
        <NuxtLink to="/" class="flex items-center gap-3">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="36" height="36" rx="8" fill="url(#layoutLogoGrad)"/>
            <rect x="7" y="10" width="14" height="2" rx="1" fill="white" opacity="0.9"/>
            <rect x="7" y="14" width="11" height="2" rx="1" fill="white" opacity="0.7"/>
            <rect x="7" y="18" width="13" height="2" rx="1" fill="white" opacity="0.7"/>
            <rect x="7" y="22" width="9"  height="2" rx="1" fill="white" opacity="0.5"/>
            <path d="M23 18L29 22V14L23 18Z" fill="white"/>
            <defs>
              <linearGradient id="layoutLogoGrad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#6366f1"/>
                <stop offset="100%" stop-color="#8b5cf6"/>
              </linearGradient>
            </defs>
          </svg>
          <span class="font-bold text-white text-lg tracking-tight">简影</span>
        </NuxtLink>

        <!-- Navigation -->
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
          <div v-if="authStore.isLoggedIn" class="relative user-menu-wrapper">
            <button
              @click="showUserMenu = !showUserMenu"
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
              免费开始
            </NuxtLink>
          </div>
        </div>
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
          <svg width="20" height="20" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="36" height="36" rx="8" fill="url(#layoutFooterGrad)"/>
            <rect x="7" y="10" width="14" height="2" rx="1" fill="white" opacity="0.9"/>
            <rect x="7" y="14" width="11" height="2" rx="1" fill="white" opacity="0.7"/>
            <rect x="7" y="18" width="13" height="2" rx="1" fill="white" opacity="0.7"/>
            <rect x="7" y="22" width="9"  height="2" rx="1" fill="white" opacity="0.5"/>
            <path d="M23 18L29 22V14L23 18Z" fill="white"/>
            <defs>
              <linearGradient id="layoutFooterGrad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#6366f1"/>
                <stop offset="100%" stop-color="#8b5cf6"/>
              </linearGradient>
            </defs>
          </svg>
          <span>简影 © 2025</span>
        </div>
        <div class="flex items-center gap-6 text-sm text-gray-500">
          <NuxtLink to="/manual" class="hover:text-gray-300 transition-colors">功能介绍</NuxtLink>
          <NuxtLink to="/terms" class="hover:text-gray-300 transition-colors">使用条款</NuxtLink>
          <NuxtLink to="/privacy" class="hover:text-gray-300 transition-colors">隐私政策</NuxtLink>
        </div>
      </div>
    </footer>
  </div>

  <!-- AI Provider Guard Modal -->
  <AiProviderGuardModal />
</template>
