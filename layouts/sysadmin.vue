<script setup lang="ts">
const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

const menuItems = [
  { path: '/sysadmin', label: '系统概览', icon: '📊' },
  { path: '/sysadmin/tenants', label: '租户管理', icon: '🏢' },
  { path: '/sysadmin/users', label: '用户管理', icon: '👥' },
  { path: '/sysadmin/ai-infra', label: 'AI 基础设施', icon: '🤖' },
  { path: '/sysadmin/tasks', label: '任务监控', icon: '⚙️' },
  { path: '/sysadmin/audit-logs', label: '审计日志', icon: '📋' },
  { path: '/sysadmin/content-review', label: '内容审核', icon: '🔍' },
  { path: '/sysadmin/assets', label: '资产治理', icon: '🗂️' },
  { path: '/sysadmin/assets/crawl', label: '素材爬取', icon: '🕷️' },
  { path: '/sysadmin/notifications', label: '系统通知', icon: '🔔' },
  { path: '/sysadmin/experiments', label: 'AI 实验', icon: '🧪' },
  { path: '/sysadmin/feedback', label: '用户反馈', icon: '💬' },
  { path: '/sysadmin/settings', label: '系统设置', icon: '⚙️' },
]

const isActive = (path: string) => {
  if (path === '/sysadmin') return route.path === '/sysadmin'
  if (path === '/sysadmin/assets') return route.path === '/sysadmin/assets'
  return route.path.startsWith(path)
}

async function logout() {
  await authStore.logout()
}
</script>

<template>
  <div class="min-h-screen flex bg-gray-950 text-gray-100">
    <!-- Sidebar -->
    <aside class="w-56 flex-shrink-0 bg-gray-900 border-r border-gray-800 flex flex-col">
      <div class="px-4 py-4 border-b border-gray-800">
        <div class="text-sm font-bold text-indigo-400 tracking-wide">INKFRAME</div>
        <div class="text-xs text-gray-500 mt-0.5">系统管理控制台</div>
      </div>
      <nav class="flex-1 py-2 overflow-y-auto">
        <NuxtLink
          v-for="item in menuItems"
          :key="item.path"
          :to="item.path"
          class="flex items-center gap-2 px-4 py-2 text-sm transition-colors"
          :class="isActive(item.path)
            ? 'bg-indigo-900/50 text-indigo-300 font-medium'
            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'"
        >
          <span class="text-base leading-none">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </NuxtLink>
      </nav>
      <div class="px-4 py-3 border-t border-gray-800">
        <div class="text-xs text-gray-500 mb-2 truncate">{{ authStore.user?.email }}</div>
        <button
          class="w-full text-left text-xs text-gray-400 hover:text-red-400 transition-colors"
          @click="logout"
        >退出登录</button>
      </div>
    </aside>

    <!-- Main content -->
    <main class="flex-1 overflow-y-auto">
      <slot />
    </main>
  </div>
</template>
