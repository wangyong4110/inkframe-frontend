<script setup lang="ts">
import type { SysUser } from '~/types/sysadmin'

definePageMeta({ layout: 'sysadmin' })

const api = useSysAdminApi()
const users = ref<SysUser[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const search = ref('')
const roleFilter = ref('')
const loading = ref(false)
const error = ref('')

// Reset password modal
const showResetModal = ref(false)
const resetTarget = ref<SysUser | null>(null)
const newPassword = ref('')
const resetMsg = ref('')
const resetLoading = ref(false)

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.listUsers(page.value, pageSize, search.value, roleFilter.value)
    const d = (res as any)?.data ?? res
    users.value = d.items ?? []
    total.value = d.total ?? 0
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch([page, roleFilter], load)

function handleSearch() {
  page.value = 1
  load()
}

const totalPages = computed(() => Math.ceil(total.value / pageSize))

async function toggleStatus(u: SysUser) {
  const newStatus = u.status === 'active' ? 'banned' : 'active'
  try {
    await api.updateUser(u.id, { status: newStatus })
    u.status = newStatus
  } catch (e: any) {
    alert(e.message)
  }
}

function openResetModal(u: SysUser) {
  resetTarget.value = u
  newPassword.value = ''
  resetMsg.value = ''
  showResetModal.value = true
}

async function doResetPassword() {
  if (!resetTarget.value || newPassword.value.length < 8) return
  resetLoading.value = true
  resetMsg.value = ''
  try {
    await api.resetUserPassword(resetTarget.value.id, newPassword.value)
    resetMsg.value = '重置成功'
    setTimeout(() => { showResetModal.value = false }, 1500)
  } catch (e: any) {
    resetMsg.value = '失败: ' + e.message
  } finally {
    resetLoading.value = false
  }
}

async function impersonate(u: SysUser) {
  try {
    const res = await api.impersonateUser(u.id)
    const token = (res as any)?.data?.token ?? (res as any)?.token
    if (token) {
      await navigator.clipboard.writeText(token)
      alert(`模拟令牌已复制到剪贴板（有效期1小时）`)
    }
  } catch (e: any) {
    alert('生成失败: ' + e.message)
  }
}
</script>

<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-xl font-bold text-white">用户管理</h1>
      <span class="text-sm text-gray-400">共 {{ total }} 名用户</span>
    </div>

    <div class="flex gap-3 mb-4">
      <input
        v-model="search"
        type="text"
        placeholder="搜索用户名或邮箱..."
        class="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white w-60"
        @keydown.enter="handleSearch"
      />
      <select
        v-model="roleFilter"
        class="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
        @change="page = 1; load()"
      >
        <option value="">全部角色</option>
        <option value="user">普通用户</option>
        <option value="admin">管理员</option>
        <option value="system_admin">系统管理员</option>
      </select>
      <button
        class="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-3 py-1.5 rounded"
        @click="handleSearch"
      >搜索</button>
    </div>

    <div v-if="loading" class="text-gray-400 text-sm">加载中...</div>
    <div v-else-if="error" class="text-red-400 text-sm">{{ error }}</div>
    <div v-else>
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-700 text-gray-400 text-left">
            <th class="pb-2 pr-4">ID</th>
            <th class="pb-2 pr-4">用户名</th>
            <th class="pb-2 pr-4">邮箱</th>
            <th class="pb-2 pr-4">角色</th>
            <th class="pb-2 pr-4">状态</th>
            <th class="pb-2 pr-4">最后登录</th>
            <th class="pb-2">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800">
          <tr v-for="u in users" :key="u.id" class="text-gray-300">
            <td class="py-2 pr-4 text-gray-500">{{ u.id }}</td>
            <td class="py-2 pr-4">{{ u.username }}</td>
            <td class="py-2 pr-4 text-xs text-gray-400">{{ u.email }}</td>
            <td class="py-2 pr-4">
              <span class="px-1.5 py-0.5 rounded text-xs" :class="u.role === 'system_admin' ? 'bg-indigo-900 text-indigo-300' : 'bg-gray-700 text-gray-300'">
                {{ u.role }}
              </span>
            </td>
            <td class="py-2 pr-4">
              <span :class="u.status === 'active' ? 'text-green-400' : 'text-red-400'">{{ u.status }}</span>
            </td>
            <td class="py-2 pr-4 text-xs text-gray-500">
              {{ u.last_login_at ? new Date(u.last_login_at).toLocaleString() : '从未' }}
            </td>
            <td class="py-2 flex gap-2">
              <button
                v-if="u.role !== 'system_admin'"
                class="text-xs text-yellow-400 hover:text-yellow-300"
                @click="toggleStatus(u)"
              >{{ u.status === 'active' ? '封禁' : '解封' }}</button>
              <button
                class="text-xs text-blue-400 hover:text-blue-300"
                @click="openResetModal(u)"
              >改密</button>
              <button
                v-if="u.role !== 'system_admin'"
                class="text-xs text-purple-400 hover:text-purple-300"
                @click="impersonate(u)"
              >模拟</button>
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="totalPages > 1" class="flex gap-2 mt-4 justify-end">
        <button :disabled="page <= 1" class="px-3 py-1 text-sm rounded bg-gray-800 disabled:opacity-40 hover:bg-gray-700" @click="page--">上一页</button>
        <span class="px-3 py-1 text-sm text-gray-400">{{ page }} / {{ totalPages }}</span>
        <button :disabled="page >= totalPages" class="px-3 py-1 text-sm rounded bg-gray-800 disabled:opacity-40 hover:bg-gray-700" @click="page++">下一页</button>
      </div>
    </div>

    <!-- Reset password modal -->
    <div v-if="showResetModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="showResetModal = false">
      <div class="bg-gray-800 rounded-lg p-6 w-80 border border-gray-700">
        <h2 class="text-sm font-semibold text-white mb-4">重置密码 — {{ resetTarget?.username }}</h2>
        <input
          v-model="newPassword"
          type="password"
          placeholder="新密码（最少8位）"
          class="w-full bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white mb-3"
        />
        <div class="flex gap-3">
          <button
            :disabled="resetLoading || newPassword.length < 8"
            class="flex-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm py-1.5 rounded"
            @click="doResetPassword"
          >确认重置</button>
          <button class="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm py-1.5 rounded" @click="showResetModal = false">取消</button>
        </div>
        <p v-if="resetMsg" class="mt-2 text-xs" :class="resetMsg.includes('失败') ? 'text-red-400' : 'text-green-400'">{{ resetMsg }}</p>
      </div>
    </div>
  </div>
</template>
