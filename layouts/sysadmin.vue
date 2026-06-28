<script setup lang="ts">
const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()

type MenuItem = { path: string; label: string; icon: string; children?: MenuItem[] }

const menuItems: MenuItem[] = [
  {
    path: '/sysadmin/_system', label: '系统管理', icon: '🖥️',
    children: [
      { path: '/sysadmin', label: '系统概览', icon: '📊' },
      { path: '/sysadmin/metrics', label: '系统指标', icon: '📈' },
      { path: '/sysadmin/tasks', label: '任务监控', icon: '⚙️' },
      { path: '/sysadmin/tasks/failures', label: '失败任务分析', icon: '⚠️' },
      { path: '/sysadmin/notifications', label: '系统通知', icon: '🔔' },
    ],
  },
  {
    path: '/sysadmin/_users', label: '用户管理', icon: '👥',
    children: [
      { path: '/sysadmin/users', label: '用户管理', icon: '👤' },
      { path: '/sysadmin/users/trend', label: '注册趋势', icon: '📉' },
      { path: '/sysadmin/tenants', label: '租户管理', icon: '🏢' },
      { path: '/sysadmin/audit-logs', label: '审计日志', icon: '📋' },
      { path: '/sysadmin/feedback', label: '用户反馈', icon: '💬' },
    ],
  },
  {
    path: '/sysadmin/_assets', label: '资产管理', icon: '🗂️',
    children: [
      { path: '/sysadmin/assets', label: '资产治理', icon: '📦' },
      { path: '/sysadmin/assets/crawl', label: '素材爬取', icon: '🕷️' },
      { path: '/sysadmin/content-review', label: '内容审核', icon: '🔍' },
      { path: '/sysadmin/content', label: '内容数据', icon: '📰' },
    ],
  },
  {
    path: '/sysadmin/_analytics', label: '数据分析', icon: '🤖',
    children: [
      { path: '/sysadmin/ai-usage', label: 'AI 用量统计', icon: '🔋' },
    ],
  },
  { path: '/sysadmin/settings', label: '系统设置', icon: '⚙️' },
]

// Exact-match paths that have children at the same level (avoid false positives from startsWith)
const EXACT_MATCH_PATHS = new Set(['/sysadmin/users', '/sysadmin/assets', '/sysadmin/tasks'])

const isActive = (path: string) => {
  if (path.includes('/_')) return false
  if (EXACT_MATCH_PATHS.has(path)) return route.path === path
  return route.path === path || route.path.startsWith(path + '/')
}

const isGroupActive = (item: MenuItem) =>
  item.children?.some(c => isActive(c.path)) ?? false

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
        <template v-for="item in menuItems" :key="item.path">
          <!-- 分组 -->
          <template v-if="item.children">
            <div
              class="flex items-center gap-2 px-4 py-2 text-sm font-medium"
              :class="isGroupActive(item) ? 'text-indigo-300' : 'text-gray-400'"
            >
              <span class="text-base leading-none">{{ item.icon }}</span>
              <span>{{ item.label }}</span>
            </div>
            <NuxtLink
              v-for="child in item.children"
              :key="child.path"
              :to="child.path"
              class="flex items-center gap-2 pl-8 pr-4 py-1.5 text-sm transition-colors"
              :class="isActive(child.path)
                ? 'bg-indigo-900/50 text-indigo-300 font-medium'
                : 'text-gray-500 hover:text-gray-200 hover:bg-gray-800'"
            >
              <span class="text-sm leading-none">{{ child.icon }}</span>
              <span>{{ child.label }}</span>
            </NuxtLink>
          </template>
          <!-- 普通项 -->
          <NuxtLink
            v-else
            :to="item.path"
            class="flex items-center gap-2 px-4 py-2 text-sm transition-colors"
            :class="isActive(item.path)
              ? 'bg-indigo-900/50 text-indigo-300 font-medium'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'"
          >
            <span class="text-base leading-none">{{ item.icon }}</span>
            <span>{{ item.label }}</span>
          </NuxtLink>
        </template>
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
