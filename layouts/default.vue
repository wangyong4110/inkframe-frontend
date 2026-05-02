<script setup lang="ts">
const route = useRoute()
const authStore = useAuthStore()
const isDark = ref(false)
const showUserMenu = ref(false)

// Close dropdown on click outside + restore dark mode preference
onMounted(() => {
  const saved = localStorage.getItem('color-scheme')
  if (saved === 'dark') {
    isDark.value = true
    document.documentElement.classList.add('dark')
  }
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement
    if (!target.closest('.user-menu-wrapper')) showUserMenu.value = false
  })
})

const toggleDark = () => {
  isDark.value = !isDark.value
  if (isDark.value) {
    document.documentElement.classList.add('dark')
    localStorage.setItem('color-scheme', 'dark')
  } else {
    document.documentElement.classList.remove('dark')
    localStorage.setItem('color-scheme', 'light')
  }
}

const navItems = [
  { label: '首页', to: '/', icon: 'home' },
  { label: '项目', to: '/novel', icon: 'book-open' },
  { label: '视频', to: '/video', icon: 'video' },
  { label: '模型', to: '/model', icon: 'cpu' },
]

const breadcrumbs = computed(() => {
  const items = []
  const paths = route.path.split('/').filter(Boolean)

  let currentPath = ''
  for (const path of paths) {
    currentPath += `/${path}`
    const item = navItems.find(i => i.to === currentPath)
    if (item) {
      items.push({ label: item.label, to: item.to })
    }
  }

  return items
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-gray-900">
    <!-- Header -->
    <header class="sticky top-0 z-50 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <!-- Logo -->
          <NuxtLink to="/" class="flex items-center space-x-2">
            <div class="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
              <span class="text-white font-bold text-lg">I</span>
            </div>
            <span class="text-xl font-bold text-gray-900 dark:text-white">InkFrame</span>
          </NuxtLink>

          <!-- Navigation -->
          <nav class="hidden md:flex items-center space-x-1">
            <NuxtLink
              v-for="item in navItems"
              :key="item.to"
              :to="item.to"
              class="px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              :class="[
                route.path === item.to || route.path.startsWith(item.to + '/')
                  ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/50 dark:text-primary-300'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700'
              ]"
            >
              {{ item.label }}
            </NuxtLink>
          </nav>

          <!-- Right Side -->
          <div class="flex items-center space-x-4">
            <!-- Dark Mode Toggle -->
            <button
              @click="toggleDark"
              class="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-700"
            >
              <svg v-if="!isDark" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
              <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </button>

            <!-- User Menu -->
            <div v-if="authStore.isLoggedIn" class="relative user-menu-wrapper">
              <button
                @click="showUserMenu = !showUserMenu"
                class="flex items-center space-x-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <div class="w-8 h-8 bg-primary-500 rounded-full flex items-center justify-center overflow-hidden">
                  <img
                    v-if="authStore.user?.avatar"
                    :src="authStore.user.avatar"
                    class="w-full h-full object-cover"
                    alt="avatar"
                  />
                  <span v-else class="text-white text-sm font-medium">
                    {{ (authStore.user?.nickname || authStore.user?.username || 'U')[0].toUpperCase() }}
                  </span>
                </div>
                <span class="hidden sm:block text-sm text-gray-700 dark:text-gray-300">
                  {{ authStore.user?.nickname || authStore.user?.username || '用户' }}
                </span>
              </button>
              <!-- Dropdown -->
              <div
                v-if="showUserMenu"
                class="absolute right-0 mt-1 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50"
              >
                <NuxtLink
                  to="/profile"
                  class="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  @click="showUserMenu = false"
                >
                  个人资料
                </NuxtLink>
                <button
                  class="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                  @click="authStore.logout(); showUserMenu = false"
                >
                  退出登录
                </button>
              </div>
            </div>
            <div v-else class="flex items-center space-x-2">
              <NuxtLink
                to="/auth/login"
                class="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
              >
                登录
              </NuxtLink>
              <NuxtLink
                to="/auth/register"
                class="px-3 py-1.5 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors"
              >
                注册
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </header>

    <!-- Breadcrumbs -->
    <div v-if="breadcrumbs.length > 0" class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <nav class="flex" aria-label="Breadcrumb">
          <ol class="flex items-center space-x-2">
            <li>
              <NuxtLink to="/" class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                首页
              </NuxtLink>
            </li>
            <li v-for="(crumb, index) in breadcrumbs" :key="crumb.to">
              <div class="flex items-center">
                <svg class="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
                </svg>
                <NuxtLink
                  v-if="index < breadcrumbs.length - 1"
                  :to="crumb.to"
                  class="ml-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                >
                  {{ crumb.label }}
                </NuxtLink>
                <span v-else class="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                  {{ crumb.label }}
                </span>
              </div>
            </li>
          </ol>
        </nav>
      </div>
    </div>

    <!-- Main Content -->
    <main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <slot />
    </main>

    <!-- Toast notifications -->
    <AppToast />

    <!-- Footer -->
    <footer class="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 mt-auto">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div class="flex flex-col md:flex-row items-center justify-between">
          <div class="flex items-center space-x-2">
            <div class="w-6 h-6 bg-gradient-primary rounded flex items-center justify-center">
              <span class="text-white font-bold text-xs">I</span>
            </div>
            <span class="text-sm text-gray-500 dark:text-gray-400">
              © 2024 InkFrame. All rights reserved.
            </span>
          </div>
          <div class="mt-4 md:mt-0 flex items-center space-x-6 text-sm text-gray-500 dark:text-gray-400">
            <a href="#" class="hover:text-primary-600">文档</a>
            <a href="#" class="hover:text-primary-600">关于</a>
            <a href="#" class="hover:text-primary-600">联系</a>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>
