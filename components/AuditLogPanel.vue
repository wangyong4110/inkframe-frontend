<script setup lang="ts">
import type { AuditLog } from '~/composables/useAuditApi'

const props = defineProps<{
  mode: 'novel' | 'user'
  novelId?: number
}>()

const auditApi = useAuditApi()

const logs = ref<AuditLog[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const error = ref('')

const ACTION_LABELS: Record<string, string> = {
  'auth.login': '用户登录',
  'auth.register': '用户注册',
  'auth.change_password': '修改密码',
  'auth.delete_account': '注销账号',
  'auth.reset_password': '重置密码',
  'novel.create': '创建小说',
  'novel.update': '更新小说',
  'novel.delete': '删除小说',
  'novel.import': '导入小说',
  'chapter.generate': 'AI 生成章节',
  'chapter.create': '创建章节',
  'chapter.delete': '删除章节',
  'chapter.publish': '发布章节',
  'chapter.unpublish': '取消发布章节',
  'video.create': '创建视频',
  'video.delete': '删除视频',
  'video.publish': '发布视频',
  'video.unpublish': '取消发布视频',
  'storyboard.generate': '生成分镜',
  'tenant.create': '创建租户',
  'tenant.delete': '删除租户',
  'tenant.member_role_update': '更新成员角色',
  'character.delete': '删除角色',
  'character.batch_delete': '批量删除角色',
  'character.ai_batch_generate': 'AI 批量生成角色',
  'worldview.create': '创建世界观',
  'worldview.delete': '删除世界观',
  'worldview.entity_delete': '删除世界观实体',
  'collab.invite': '邀请协作成员',
  'collab.remove_member': '移除协作成员',
  'collab.update_role': '更新协作角色',
  'webhook.create': '创建 Webhook',
  'webhook.delete': '删除 Webhook',
  'mcp.tool_create': '创建 MCP 工具',
  'mcp.tool_delete': '删除 MCP 工具',
  'mcp.tool_bind': '绑定 MCP 工具',
  'mcp.tool_unbind': '解绑 MCP 工具',
  'sysadmin.tenant_update': '[管理员] 更新租户',
  'sysadmin.tenant_delete': '[管理员] 删除租户',
  'sysadmin.user_update': '[管理员] 更新用户',
  'sysadmin.impersonate': '[管理员] 模拟用户登录',
  'sysadmin.user_reset_password': '[管理员] 重置用户密码',
  'sysadmin.settings_update': '[管理员] 更新系统设置',
  'sysadmin.broadcast': '[管理员] 全局广播通知',
  'sysadmin.change_password': '[管理员] 修改管理员密码',
  'provider.create': '添加供应商',
  'provider.update': '更新供应商',
  'provider.delete': '删除供应商',
  'model.create': '添加模型',
  'model.update': '更新模型',
  'model.delete': '删除模型',
}

function actionLabel(action: string): string {
  return ACTION_LABELS[action] || action
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

async function fetchLogs() {
  loading.value = true
  error.value = ''
  try {
    let resp: any
    if (props.mode === 'novel' && props.novelId) {
      resp = await auditApi.listNovelAuditLogs(props.novelId, { page: page.value, page_size: pageSize })
    } else {
      resp = await auditApi.listMyAuditLogs({ page: page.value, page_size: pageSize })
    }
    const data = resp?.data ?? resp
    logs.value = data?.data ?? []
    total.value = data?.total ?? 0
  } catch (e: any) {
    error.value = e?.message || '加载失败'
    logs.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function goPage(p: number) {
  if (p < 1 || p > totalPages.value) return
  page.value = p
  fetchLogs()
}

onMounted(fetchLogs)

watch(() => props.novelId, () => {
  page.value = 1
  fetchLogs()
})
</script>

<template>
  <div class="space-y-4">
    <!-- Error state -->
    <div v-if="error" class="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4 text-sm text-red-600 dark:text-red-400">
      {{ error }}
    </div>

    <!-- Loading state -->
    <div v-else-if="loading && logs.length === 0" class="flex items-center justify-center py-16 text-gray-400">
      <svg class="animate-spin w-6 h-6 mr-2" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      加载中…
    </div>

    <!-- Empty state -->
    <div v-else-if="!loading && logs.length === 0" class="flex flex-col items-center justify-center py-16 text-gray-400">
      <svg class="w-12 h-12 mb-3 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      <p class="text-sm">暂无操作记录</p>
    </div>

    <!-- Log table -->
    <div v-else class="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 dark:bg-gray-800/60">
          <tr>
            <th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">时间</th>
            <th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">操作人</th>
            <th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">操作</th>
            <th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">资源名称</th>
            <th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">状态</th>
            <th class="px-4 py-3 text-left font-medium text-gray-500 dark:text-gray-400 whitespace-nowrap">IP</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-gray-700">
          <tr
            v-for="log in logs"
            :key="log.id"
            class="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors"
          >
            <td class="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap font-mono text-xs">
              {{ formatDate(log.created_at) }}
            </td>
            <td class="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
              <span class="inline-flex items-center gap-1.5">
                <span class="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400 text-xs font-bold shrink-0">
                  {{ (log.username || String(log.user_id)).charAt(0).toUpperCase() }}
                </span>
                <span class="text-sm">{{ log.nickname || log.username || String(log.user_id) }}</span>
              </span>
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
              <span class="inline-block px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                {{ actionLabel(log.action) }}
              </span>
            </td>
            <td class="px-4 py-3 text-gray-700 dark:text-gray-200 max-w-[200px] truncate">
              {{ log.resource_name || '-' }}
            </td>
            <td class="px-4 py-3 whitespace-nowrap">
              <span
                v-if="log.status === 'ok'"
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300"
              >
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
                </svg>
                成功
              </span>
              <span
                v-else
                class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300"
              >
                <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                  <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" />
                </svg>
                失败
              </span>
            </td>
            <td class="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs whitespace-nowrap">
              {{ log.ip || '-' }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-between">
      <p class="text-sm text-gray-500 dark:text-gray-400">
        共 <span class="font-semibold text-gray-700 dark:text-gray-200">{{ total }}</span> 条记录
      </p>
      <div class="flex items-center gap-1">
        <button
          :disabled="page <= 1"
          class="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          @click="goPage(page - 1)"
        >上一页</button>
        <span class="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300">
          {{ page }} / {{ totalPages }}
        </span>
        <button
          :disabled="page >= totalPages"
          class="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          @click="goPage(page + 1)"
        >下一页</button>
      </div>
    </div>
  </div>
</template>
