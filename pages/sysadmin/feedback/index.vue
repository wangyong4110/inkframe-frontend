<script setup lang="ts">
import type { UserFeedback, FeedbackStats } from '~/composables/useFeedbackApi'

definePageMeta({ layout: 'sysadmin' })

const api = useFeedbackApi()

// ── List state ──────────────────────────────────────────────────────────────
const items = ref<UserFeedback[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)
const error = ref('')

const filterStatus = ref('')
const filterType = ref('')
const filterPriority = ref('')

const totalPages = computed(() => Math.ceil(total.value / pageSize))

// ── Stats ───────────────────────────────────────────────────────────────────
const stats = ref<FeedbackStats | null>(null)

async function loadStats() {
  try {
    const res = await api.adminGetStats()
    stats.value = (res as any)?.data ?? res
  } catch {}
}

// ── Load list ────────────────────────────────────────────────────────────────
async function load() {
  loading.value = true
  error.value = ''
  try {
    const res = await api.adminListFeedback({
      page: page.value,
      size: pageSize,
      status: filterStatus.value || undefined,
      type: filterType.value || undefined,
      priority: filterPriority.value || undefined,
    })
    const d = (res as any)?.data ?? res
    items.value = d.items ?? []
    total.value = d.total ?? 0
  } catch (e: any) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  loadStats()
  load()
})

watch([filterStatus, filterType, filterPriority], () => {
  page.value = 1
  load()
})

watch(page, load)

// ── Detail panel ─────────────────────────────────────────────────────────────
const selectedItem = ref<UserFeedback | null>(null)
const detailLoading = ref(false)

async function openDetail(item: UserFeedback) {
  detailLoading.value = true
  selectedItem.value = item
  try {
    const res = await api.adminGetFeedback(item.id)
    selectedItem.value = (res as any)?.data ?? res
  } catch {} finally {
    detailLoading.value = false
  }
}

function closeDetail() {
  selectedItem.value = null
  adminNote.value = ''
  replyText.value = ''
}

// ── Admin note ───────────────────────────────────────────────────────────────
const adminNote = ref('')
const savingNote = ref(false)

watch(selectedItem, (v) => {
  adminNote.value = v?.admin_note ?? ''
  replyText.value = ''
})

async function saveNote() {
  if (!selectedItem.value) return
  savingNote.value = true
  try {
    const res = await api.adminUpdateFeedback(selectedItem.value.id, { admin_note: adminNote.value })
    const updated = (res as any)?.data ?? res
    Object.assign(selectedItem.value, updated)
    // reflect in list
    const idx = items.value.findIndex(i => i.id === selectedItem.value!.id)
    if (idx >= 0) Object.assign(items.value[idx], updated)
  } catch {} finally {
    savingNote.value = false
  }
}

// ── Status / priority change ──────────────────────────────────────────────────
async function changeField(field: 'status' | 'priority', value: string) {
  if (!selectedItem.value) return
  try {
    const res = await api.adminUpdateFeedback(selectedItem.value.id, { [field]: value })
    const updated = (res as any)?.data ?? res
    Object.assign(selectedItem.value, updated)
    const idx = items.value.findIndex(i => i.id === selectedItem.value!.id)
    if (idx >= 0) Object.assign(items.value[idx], updated)
  } catch {}
}

// ── Reply ─────────────────────────────────────────────────────────────────────
const replyText = ref('')
const sendingReply = ref(false)

async function sendReply() {
  if (!selectedItem.value || !replyText.value.trim()) return
  sendingReply.value = true
  try {
    const res = await api.adminReplyFeedback(selectedItem.value.id, replyText.value)
    const updated = (res as any)?.data ?? res
    Object.assign(selectedItem.value, updated)
    const idx = items.value.findIndex(i => i.id === selectedItem.value!.id)
    if (idx >= 0) Object.assign(items.value[idx], updated)
    replyText.value = ''
  } catch {} finally {
    sendingReply.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
const statusBadge: Record<string, string> = {
  pending: 'bg-yellow-900/50 text-yellow-400 border border-yellow-700/50',
  reviewing: 'bg-blue-900/50 text-blue-400 border border-blue-700/50',
  resolved: 'bg-green-900/50 text-green-400 border border-green-700/50',
  closed: 'bg-gray-700 text-gray-400 border border-gray-600',
}
const statusLabel: Record<string, string> = {
  pending: '待处理',
  reviewing: '处理中',
  resolved: '已解决',
  closed: '已关闭',
}
const priorityBadge: Record<string, string> = {
  low: 'bg-gray-700 text-gray-400 border border-gray-600',
  medium: 'bg-blue-900/50 text-blue-400 border border-blue-700/50',
  high: 'bg-orange-900/50 text-orange-400 border border-orange-700/50',
  critical: 'bg-red-900/50 text-red-400 border border-red-700/50',
}
const priorityLabel: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '紧急',
}
const typeEmoji: Record<string, string> = {
  bug: '🐛',
  feature: '💡',
  content: '😵',
  question: '💬',
  praise: '👍',
}
const typeLabel: Record<string, string> = {
  bug: 'Bug',
  feature: '建议',
  content: '内容',
  question: '咨询',
  praise: '表扬',
}

function fmtDate(s: string | null | undefined) {
  if (!s) return ''
  return new Date(s).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="p-6">
    <div class="flex items-center justify-between mb-6">
      <h1 class="text-xl font-bold text-white">用户反馈</h1>
      <span class="text-sm text-gray-400">共 {{ total }} 条</span>
    </div>

    <!-- Stats cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div class="text-xs text-gray-400 mb-1">本周新增</div>
        <div class="text-2xl font-bold text-white">{{ stats?.this_week ?? '--' }}</div>
      </div>
      <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div class="text-xs text-gray-400 mb-1">待处理</div>
        <div class="text-2xl font-bold text-yellow-400">{{ stats?.pending ?? '--' }}</div>
      </div>
      <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div class="text-xs text-gray-400 mb-1">处理中</div>
        <div class="text-2xl font-bold text-blue-400">{{ stats?.reviewing ?? '--' }}</div>
      </div>
      <div class="bg-gray-800 rounded-lg p-4 border border-gray-700">
        <div class="text-xs text-gray-400 mb-1">已解决</div>
        <div class="text-2xl font-bold text-green-400">{{ stats?.resolved ?? '--' }}</div>
      </div>
    </div>

    <!-- Filters -->
    <div class="flex flex-wrap gap-3 mb-4">
      <select
        v-model="filterStatus"
        class="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
      >
        <option value="">全部状态</option>
        <option value="pending">待处理</option>
        <option value="reviewing">处理中</option>
        <option value="resolved">已解决</option>
        <option value="closed">已关闭</option>
      </select>
      <select
        v-model="filterType"
        class="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
      >
        <option value="">全部类型</option>
        <option value="bug">Bug</option>
        <option value="feature">建议</option>
        <option value="content">内容</option>
        <option value="question">咨询</option>
        <option value="praise">表扬</option>
      </select>
      <select
        v-model="filterPriority"
        class="bg-gray-800 border border-gray-700 rounded px-3 py-1.5 text-sm text-white"
      >
        <option value="">全部优先级</option>
        <option value="low">低</option>
        <option value="medium">中</option>
        <option value="high">高</option>
        <option value="critical">紧急</option>
      </select>
    </div>

    <!-- Table -->
    <div v-if="loading" class="text-gray-400 text-sm">加载中...</div>
    <div v-else-if="error" class="text-red-400 text-sm">{{ error }}</div>
    <div v-else>
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-700 text-gray-400 text-left">
            <th class="pb-2 pr-3">#编号</th>
            <th class="pb-2 pr-3">类型</th>
            <th class="pb-2 pr-3">标题/摘要</th>
            <th class="pb-2 pr-3">用户ID</th>
            <th class="pb-2 pr-3">优先级</th>
            <th class="pb-2 pr-3">状态</th>
            <th class="pb-2 pr-3">时间</th>
            <th class="pb-2">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-800">
          <tr
            v-for="item in items"
            :key="item.id"
            class="text-gray-300 hover:bg-gray-800/50 cursor-pointer transition-colors"
            @click="openDetail(item)"
          >
            <td class="py-2 pr-3 text-gray-500 text-xs">{{ item.seq_no || item.id }}</td>
            <td class="py-2 pr-3 text-base" :title="typeLabel[item.type] || item.type">
              {{ typeEmoji[item.type] || '📝' }}
              <span class="text-xs text-gray-400">{{ typeLabel[item.type] || item.type }}</span>
            </td>
            <td class="py-2 pr-3 max-w-[200px]">
              <div class="truncate text-sm text-white">{{ item.title || item.content.slice(0, 40) }}</div>
              <div v-if="item.title" class="truncate text-xs text-gray-500">{{ item.content.slice(0, 40) }}</div>
            </td>
            <td class="py-2 pr-3 text-xs text-gray-400">{{ item.user_id }}</td>
            <td class="py-2 pr-3">
              <span
                v-if="item.priority"
                class="px-1.5 py-0.5 rounded text-xs"
                :class="priorityBadge[item.priority] || 'bg-gray-700 text-gray-400'"
              >{{ priorityLabel[item.priority] || item.priority }}</span>
            </td>
            <td class="py-2 pr-3">
              <span
                class="px-1.5 py-0.5 rounded text-xs"
                :class="statusBadge[item.status] || 'bg-gray-700 text-gray-400'"
              >{{ statusLabel[item.status] || item.status }}</span>
            </td>
            <td class="py-2 pr-3 text-xs text-gray-500">{{ fmtDate(item.created_at) }}</td>
            <td class="py-2">
              <button
                class="text-xs text-indigo-400 hover:text-indigo-300"
                @click.stop="openDetail(item)"
              >查看</button>
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div v-if="totalPages > 1" class="flex gap-2 mt-4 justify-end">
        <button :disabled="page <= 1" class="px-3 py-1 text-sm rounded bg-gray-800 disabled:opacity-40 hover:bg-gray-700" @click="page--">上一页</button>
        <span class="px-3 py-1 text-sm text-gray-400">{{ page }} / {{ totalPages }}</span>
        <button :disabled="page >= totalPages" class="px-3 py-1 text-sm rounded bg-gray-800 disabled:opacity-40 hover:bg-gray-700" @click="page++">下一页</button>
      </div>
    </div>

    <!-- Detail panel -->
    <div
      v-if="selectedItem"
      class="fixed right-0 top-0 h-full w-[480px] bg-gray-900 border-l border-gray-700 shadow-2xl z-40 flex flex-col overflow-hidden"
    >
      <!-- Panel header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-gray-700 flex-shrink-0">
        <div class="flex items-center gap-2">
          <span class="text-base">{{ typeEmoji[selectedItem.type] || '📝' }}</span>
          <span class="text-sm font-semibold text-white">
            {{ selectedItem.title || '反馈详情' }}
          </span>
        </div>
        <button class="text-gray-400 hover:text-white p-1 rounded" @click="closeDetail">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <div v-if="detailLoading" class="flex-1 flex items-center justify-center text-gray-400 text-sm">
        加载中...
      </div>
      <div v-else class="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <!-- Meta info -->
        <div class="grid grid-cols-2 gap-3 text-xs">
          <div>
            <span class="text-gray-500">类型：</span>
            <span class="text-gray-300">{{ typeLabel[selectedItem.type] || selectedItem.type }}</span>
          </div>
          <div>
            <span class="text-gray-500">用户ID：</span>
            <span class="text-gray-300">{{ selectedItem.user_id }}</span>
          </div>
          <div>
            <span class="text-gray-500">提交时间：</span>
            <span class="text-gray-300">{{ fmtDate(selectedItem.created_at) }}</span>
          </div>
          <div v-if="selectedItem.rating">
            <span class="text-gray-500">评分：</span>
            <span class="text-yellow-400">{{ '★'.repeat(selectedItem.rating) }}{{ '☆'.repeat(5 - selectedItem.rating) }}</span>
          </div>
          <div v-if="selectedItem.page_url" class="col-span-2">
            <span class="text-gray-500">来源页面：</span>
            <span class="text-gray-400 break-all">{{ selectedItem.page_url }}</span>
          </div>
          <div v-if="selectedItem.contact_email" class="col-span-2">
            <span class="text-gray-500">联系邮箱：</span>
            <span class="text-gray-300">{{ selectedItem.contact_email }}</span>
          </div>
          <div v-if="selectedItem.user_agent" class="col-span-2">
            <span class="text-gray-500">UA：</span>
            <span class="text-gray-500 text-[10px] break-all leading-snug">{{ selectedItem.user_agent }}</span>
          </div>
        </div>

        <!-- Content -->
        <div>
          <div class="text-xs text-gray-500 mb-1">反馈内容</div>
          <div class="bg-gray-800 rounded-lg p-3 text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{{ selectedItem.content }}</div>
        </div>

        <!-- Status + Priority -->
        <div class="flex gap-3">
          <div class="flex-1">
            <label class="block text-xs text-gray-500 mb-1">状态</label>
            <select
              :value="selectedItem.status"
              class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
              @change="changeField('status', ($event.target as HTMLSelectElement).value)"
            >
              <option value="pending">待处理</option>
              <option value="reviewing">处理中</option>
              <option value="resolved">已解决</option>
              <option value="closed">已关闭</option>
            </select>
          </div>
          <div class="flex-1">
            <label class="block text-xs text-gray-500 mb-1">优先级</label>
            <select
              :value="selectedItem.priority"
              class="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white"
              @change="changeField('priority', ($event.target as HTMLSelectElement).value)"
            >
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
              <option value="critical">紧急</option>
            </select>
          </div>
        </div>

        <!-- Admin note -->
        <div>
          <label class="block text-xs text-gray-500 mb-1">内部备注</label>
          <textarea
            v-model="adminNote"
            rows="3"
            placeholder="仅内部可见..."
            class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
          />
          <button
            :disabled="savingNote"
            class="mt-1.5 text-xs px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded transition-colors"
            @click="saveNote"
          >{{ savingNote ? '保存中...' : '保存备注' }}</button>
        </div>

        <!-- Existing reply -->
        <div v-if="selectedItem.replied_at" class="bg-indigo-950/40 border border-indigo-700/40 rounded-lg p-3">
          <div class="text-xs text-indigo-400 mb-1">已回复 · {{ fmtDate(selectedItem.replied_at) }}</div>
          <div class="text-sm text-gray-200 whitespace-pre-wrap">{{ selectedItem.reply_content }}</div>
        </div>

        <!-- Reply form -->
        <div>
          <label class="block text-xs text-gray-500 mb-1">{{ selectedItem.replied_at ? '更新回复' : '发送回复' }}</label>
          <textarea
            v-model="replyText"
            rows="3"
            placeholder="给用户的回复内容..."
            class="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
          />
          <button
            :disabled="sendingReply || !replyText.trim()"
            class="mt-1.5 text-xs px-3 py-1 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded transition-colors"
            @click="sendReply"
          >{{ sendingReply ? '发送中...' : '发送回复' }}</button>
        </div>
      </div>
    </div>

    <!-- Overlay behind detail panel -->
    <div
      v-if="selectedItem"
      class="fixed inset-0 z-30"
      @click="closeDetail"
    />
  </div>
</template>
