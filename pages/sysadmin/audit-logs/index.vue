<script setup lang="ts">
import type { SysAuditLog } from '~/types/sysadmin'

definePageMeta({ layout: 'sysadmin' })

const api = useSysAdminApi()
const logs = ref<SysAuditLog[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 30
const entityTypeFilter = ref('')
const userIdFilter = ref('')
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.listAuditLogs(page.value, pageSize, entityTypeFilter.value, Number(userIdFilter.value) || 0)
    const d = (res as any)?.data ?? res
    logs.value = d.items ?? []
    total.value = d.total ?? 0
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(load)
watch(page, load)

const totalPages = computed(() => Math.ceil(total.value / pageSize))

function handleFilter() {
  page.value = 1
  load()
}

const ACTION_NAMES: Record<string, string> = {
  'auth.login': '登录',
  'auth.logout': '登出',
  'auth.register': '注册',
  'auth.delete_account': '注销账号',
  'auth.change_password': '修改密码',
  'auth.reset_password': '重置密码',
  'novel.create': '创建小说',
  'novel.update': '编辑小说',
  'novel.delete': '删除小说',
  'chapter.create': '创建章节',
  'chapter.update': '编辑章节',
  'chapter.delete': '删除章节',
  'chapter.generate': '生成章节',
  'video.create': '创建视频',
  'video.delete': '删除视频',
  'sysadmin.settings_update': '更新系统设置',
  'sysadmin.tenant_update': '编辑租户',
  'sysadmin.tenant_delete': '删除租户',
  'sysadmin.user_update': '编辑用户',
  'sysadmin.reset_user_password': '重置用户密码',
  'sysadmin.impersonate': '代入用户',
}

function actionLabel(action: string): string {
  return ACTION_NAMES[action] ?? action
}
</script>

<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-xl font-bold text-white">审计日志</h1>
      <span class="text-sm text-gray-400">共 {{ total }} 条记录</span>
    </div>

    <div class="flex gap-3 mb-4">
      <input
        v-model="entityTypeFilter"
        type="text"
        placeholder="实体类型（如 novel, chapter）"
        class="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white w-48"
      />
      <input
        v-model="userIdFilter"
        type="number"
        placeholder="用户ID"
        class="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white w-28"
      />
      <button class="bg-indigo-600 hover:bg-indigo-500 text-white text-sm px-3 py-1.5 rounded" @click="handleFilter">筛选</button>
    </div>

    <div v-if="loading" class="text-gray-400 text-sm">加载中...</div>
    <div v-else-if="error" class="text-red-400 text-sm">{{ error }}</div>
    <div v-else>
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-700 text-gray-400 text-left">
            <th class="pb-2 pr-4">ID</th>
            <th class="pb-2 pr-4">用户</th>
            <th class="pb-2 pr-4">租户</th>
            <th class="pb-2 pr-4">操作</th>
            <th class="pb-2 pr-4">实体类型</th>
            <th class="pb-2 pr-4">实体ID</th>
            <th class="pb-2">时间</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800">
          <tr v-for="log in logs" :key="log.id" class="text-gray-300">
            <td class="py-2 pr-4 text-gray-500">{{ log.id }}</td>
            <td class="py-2 pr-4">
              <span v-if="log.username">{{ log.username }}</span>
              <span v-else class="text-gray-500">{{ log.user_id || '-' }}</span>
            </td>
            <td class="py-2 pr-4">{{ log.tenant_id }}</td>
            <td class="py-2 pr-4">
              <span>{{ actionLabel(log.action) }}</span>
              <span v-if="ACTION_NAMES[log.action] == null" class="ml-1 text-xs text-gray-500 font-mono">({{ log.action }})</span>
            </td>
            <td class="py-2 pr-4 text-xs text-gray-400">{{ log.entity_type }}</td>
            <td class="py-2 pr-4 text-xs text-gray-400">{{ log.entity_id }}</td>
            <td class="py-2 text-xs text-gray-500">{{ new Date(log.created_at).toLocaleString() }}</td>
          </tr>
        </tbody>
      </table>

      <div v-if="totalPages > 1" class="flex gap-2 mt-4 justify-end">
        <button :disabled="page <= 1" class="px-3 py-1 text-sm rounded bg-gray-800 disabled:opacity-40 hover:bg-gray-700" @click="page--">上一页</button>
        <span class="px-3 py-1 text-sm text-gray-400">{{ page }} / {{ totalPages }}</span>
        <button :disabled="page >= totalPages" class="px-3 py-1 text-sm rounded bg-gray-800 disabled:opacity-40 hover:bg-gray-700" @click="page++">下一页</button>
      </div>
    </div>
  </div>
</template>
