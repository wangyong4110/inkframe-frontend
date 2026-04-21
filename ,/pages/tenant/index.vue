<script setup lang="ts">
import type { Tenant } from '~/types/tenant'

const tenantStore = useTenantStore()

// Fetch tenants on mount
onMounted(() => {
  tenantStore.fetchTenants()
})

const showCreateModal = ref(false)
const showQuotaModal = ref(false)
const selectedTenant = ref<Tenant | null>(null)
const createError = ref('')

const createForm = ref({
  name: '',
  code: '',
  plan: 'free',
  max_projects: 5,
  max_users: 3,
  max_storage_mb: 1000,
})

const planOptions = [
  { value: 'free', label: '免费版', projects: 5, users: 3, storage: '1GB' },
  { value: 'pro', label: '专业版', projects: 50, users: 20, storage: '50GB' },
  { value: 'enterprise', label: '企业版', projects: 999, users: 999, storage: '无限' },
]

function getPlanColor(plan: string): string {
  const colors: Record<string, string> = {
    free: 'bg-gray-100 text-gray-800',
    pro: 'bg-blue-100 text-blue-800',
    enterprise: 'bg-purple-100 text-purple-800',
  }
  return colors[plan] || 'bg-gray-100 text-gray-800'
}

function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-800',
    suspended: 'bg-yellow-100 text-yellow-800',
    banned: 'bg-red-100 text-red-800',
  }
  return colors[status] || 'bg-gray-100 text-gray-800'
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: '正常',
    suspended: '暂停',
    banned: '封禁',
  }
  return labels[status] || status
}

function viewQuota(tenant: Tenant) {
  selectedTenant.value = tenant
  tenantStore.fetchQuota(tenant.id)
  showQuotaModal.value = true
}

async function handleCreate() {
  createError.value = ''
  try {
    await tenantStore.createTenant(createForm.value)
    showCreateModal.value = false
    createForm.value = {
      name: '',
      code: '',
      plan: 'free',
      max_projects: 5,
      max_users: 3,
      max_storage_mb: 1000,
    }
  } catch (error: any) {
    createError.value = error.message || '创建失败'
  }
}

const planStorageMb: Record<string, number> = {
  free: 1024,
  pro: 51200,
  enterprise: 0,
}

function selectPlan(plan: string) {
  createForm.value.plan = plan
  const option = planOptions.find(p => p.value === plan)
  if (option) {
    createForm.value.max_projects = option.projects
    createForm.value.max_users = option.users
    createForm.value.max_storage_mb = planStorageMb[plan] ?? 0
  }
}

function formatStorage(mb: number): string {
  if (mb === 0) return '无限'
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${mb} MB`
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">租户管理</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          管理所有租户/组织和项目配额
        </p>
      </div>
      <button class="btn-primary" @click="showCreateModal = true">
        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
        </svg>
        创建租户
      </button>
    </div>

    <!-- Stats -->
    <div class="grid gap-4 md:grid-cols-4">
      <div class="card p-6">
        <div class="flex items-center space-x-4">
          <div class="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14-2v-2a2 2 0 00-2-2h-2a2 2 0 00-2 2m14-2v-2a2 2 0 00-2-2h-2a2 2 0 00-2 2m14 2v2a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2h2" />
            </svg>
          </div>
          <div>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">{{ tenantStore.tenants.length }}</p>
            <p class="text-sm text-gray-500">总租户数</p>
          </div>
        </div>
      </div>
      <div class="card p-6">
        <div class="flex items-center space-x-4">
          <div class="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ tenantStore.tenants.filter(t => t.status === 'active').length }}
            </p>
            <p class="text-sm text-gray-500">正常运营</p>
          </div>
        </div>
      </div>
      <div class="card p-6">
        <div class="flex items-center space-x-4">
          <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ tenantStore.tenants.reduce((sum, t) => sum + t.used_projects, 0) }}
            </p>
            <p class="text-sm text-gray-500">总项目数</p>
          </div>
        </div>
      </div>
      <div class="card p-6">
        <div class="flex items-center space-x-4">
          <div class="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
            <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">
              {{ tenantStore.tenants.reduce((sum, t) => sum + t.used_users, 0) }}
            </p>
            <p class="text-sm text-gray-500">总用户数</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Tenant List -->
    <div class="card">
      <div class="p-4 border-b border-gray-200 dark:border-gray-700">
        <h3 class="font-semibold text-gray-900 dark:text-white">租户列表</h3>
      </div>

      <div v-if="tenantStore.tenantsLoading" class="p-8 text-center">
        <div class="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p class="mt-2 text-gray-500">加载中...</p>
      </div>

      <div v-else-if="tenantStore.tenants.length === 0" class="p-8 text-center">
        <svg class="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14-2v-2a2 2 0 00-2-2h-2a2 2 0 00-2 2m14-2v-2a2 2 0 00-2-2h-2a2 2 0 00-2 2m14 2v2a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2h2" />
        </svg>
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">暂无租户</h3>
        <p class="text-gray-500 mb-4">创建一个租户开始使用</p>
        <button class="btn-primary" @click="showCreateModal = true">创建租户</button>
      </div>

      <div v-else class="divide-y divide-gray-200 dark:divide-gray-700">
        <div
          v-for="tenant in tenantStore.tenants"
          :key="tenant.id"
          class="p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-4">
              <div class="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
                <span class="text-lg font-bold text-primary-600">{{ tenant.name.charAt(0) }}</span>
              </div>
              <div>
                <h4 class="font-semibold text-gray-900 dark:text-white">{{ tenant.name }}</h4>
                <p class="text-sm text-gray-500">{{ tenant.code }}</p>
              </div>
            </div>
            <div class="flex items-center space-x-4">
              <span class="px-2 py-1 text-xs font-medium rounded-full" :class="getPlanColor(tenant.plan)">
                {{ tenant.plan.toUpperCase() }}
              </span>
              <span class="px-2 py-1 text-xs font-medium rounded-full" :class="getStatusColor(tenant.status)">
                {{ getStatusLabel(tenant.status) }}
              </span>
              <button class="btn-ghost text-sm" @click="viewQuota(tenant)">
                查看配额
              </button>
              <NuxtLink :to="`/tenant/${tenant.id}`" class="btn-outline text-sm">
                管理
              </NuxtLink>
            </div>
          </div>
          <div class="mt-3 grid grid-cols-3 gap-4 text-sm">
            <div class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
              <span class="text-gray-500">项目数</span>
              <span class="font-medium">{{ tenant.used_projects }}/{{ tenant.max_projects }}</span>
            </div>
            <div class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
              <span class="text-gray-500">用户数</span>
              <span class="font-medium">{{ tenant.used_users }}/{{ tenant.max_users }}</span>
            </div>
            <div class="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
              <span class="text-gray-500">存储</span>
              <span class="font-medium">{{ formatStorage(tenant.used_storage_mb) }}/{{ formatStorage(tenant.max_storage_mb) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Create Modal -->
    <div v-if="showCreateModal" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="fixed inset-0 bg-black/50" @click="showCreateModal = false"></div>
      <div class="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">创建租户</h3>
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">租户名称 *</label>
            <input v-model="createForm.name" type="text" class="input" placeholder="如：我的工作室" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">租户代码 *</label>
            <input v-model="createForm.code" type="text" class="input" placeholder="如：my-studio" />
            <p class="mt-1 text-xs text-gray-500">唯一标识，用于URL访问</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">选择套餐</label>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="plan in planOptions"
                :key="plan.value"
                class="p-3 border rounded-lg text-center transition-all"
                :class="createForm.plan === plan.value ? 'border-primary-500 bg-primary-50' : 'border-gray-200'"
                @click="selectPlan(plan.value)"
              >
                <div class="font-medium">{{ plan.label }}</div>
                <div class="text-xs text-gray-500">{{ plan.projects }}项目</div>
              </button>
            </div>
          </div>
        </div>
        <p v-if="createError" class="mt-2 text-sm text-red-600 dark:text-red-400">{{ createError }}</p>
        <div class="mt-6 flex justify-end space-x-2">
          <button class="btn-outline" @click="showCreateModal = false; createError = ''">取消</button>
          <button class="btn-primary" @click="handleCreate">创建</button>
        </div>
      </div>
    </div>

    <!-- Quota Modal -->
    <div v-if="showQuotaModal" class="fixed inset-0 z-50 flex items-center justify-center">
      <div class="fixed inset-0 bg-black/50" @click="showQuotaModal = false"></div>
      <div class="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-lg w-full mx-4 p-6">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          {{ selectedTenant?.name }} - 配额详情
        </h3>
        <div v-if="tenantStore.quota" class="space-y-4">
          <!-- Projects -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">项目数</span>
              <span class="text-sm text-gray-500">
                {{ tenantStore.quota.projects.used }} / {{ tenantStore.quota.projects.limit }}
              </span>
            </div>
            <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                class="h-full bg-primary-500 rounded-full"
                :style="{ width: `${Math.min(100, tenantStore.projectUsage)}%` }"
              ></div>
            </div>
          </div>
          <!-- Users -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">用户数</span>
              <span class="text-sm text-gray-500">
                {{ tenantStore.quota.users.used }} / {{ tenantStore.quota.users.limit }}
              </span>
            </div>
            <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                class="h-full bg-blue-500 rounded-full"
                :style="{ width: `${Math.min(100, tenantStore.userUsage)}%` }"
              ></div>
            </div>
          </div>
          <!-- Storage -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">存储空间</span>
              <span class="text-sm text-gray-500">
                {{ tenantStore.quota.storage_mb.used }} MB / {{ tenantStore.quota.storage_mb.limit === 0 ? '无限' : tenantStore.quota.storage_mb.limit + ' MB' }}
              </span>
            </div>
            <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                class="h-full bg-purple-500 rounded-full"
                :style="{ width: `${Math.min(100, tenantStore.storageUsage)}%` }"
              ></div>
            </div>
          </div>
        </div>
        <div class="mt-6 flex justify-end">
          <button class="btn-outline" @click="showQuotaModal = false">关闭</button>
        </div>
      </div>
    </div>
  </div>
</template>
