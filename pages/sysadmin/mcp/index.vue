<script setup lang="ts">
import type { McpTool, FeatureBindingDTO } from '~/types'

definePageMeta({ layout: 'sysadmin' })

const toast = useToast()
const api = useSysAdminMcpApi()

// ── Tab ────────────────────────────────────────────────────────────────────────
const activeTab = ref<'tools' | 'features'>('tools')

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1: 工具管理
// ══════════════════════════════════════════════════════════════════════════════

const tools = ref<McpTool[]>([])
const toolsLoading = ref(false)

async function loadTools() {
  toolsLoading.value = true
  try {
    const res = await api.listTools()
    tools.value = ((res as any).data ?? []) as McpTool[]
  } catch (e: any) {
    toast.error('加载工具失败：' + e.message)
  } finally {
    toolsLoading.value = false
  }
}

// ── Tool Form ─────────────────────────────────────────────────────────────────
const showToolModal = ref(false)
const editingTool = ref<McpTool | null>(null)
const toolSaving = ref(false)
const testingId = ref<number | null>(null)

const toolForm = ref({
  name: '',
  display_name: '',
  description: '',
  transport_type: 'http' as 'http' | 'sse' | 'stdio',
  endpoint: '',
  timeout: 30,
  is_active: true,
  is_system: false,
  headers_raw: '',
  env_raw: '',
})

function openAddTool() {
  editingTool.value = null
  toolForm.value = {
    name: '', display_name: '', description: '',
    transport_type: 'http', endpoint: '', timeout: 30,
    is_active: true, is_system: false, headers_raw: '', env_raw: '',
  }
  showToolModal.value = true
}

function openEditTool(tool: McpTool) {
  editingTool.value = tool
  toolForm.value = {
    name: tool.name,
    display_name: tool.display_name,
    description: tool.description || '',
    transport_type: tool.transport_type as any,
    endpoint: tool.endpoint,
    timeout: tool.timeout || 30,
    is_active: tool.is_active,
    is_system: tool.is_system,
    headers_raw: tool.headers ? JSON.stringify(tool.headers, null, 2) : '',
    env_raw: tool.env ? JSON.stringify(tool.env, null, 2) : '',
  }
  showToolModal.value = true
}

function parseRawJSON(raw: string): Record<string, string> | undefined {
  const s = raw.trim()
  if (!s) return undefined
  try { return JSON.parse(s) } catch { return undefined }
}

async function submitToolForm() {
  if (!toolForm.value.name || !toolForm.value.endpoint) {
    toast.error('工具名称和端点为必填项')
    return
  }
  toolSaving.value = true
  try {
    const payload = {
      name: toolForm.value.name,
      display_name: toolForm.value.display_name,
      description: toolForm.value.description,
      transport_type: toolForm.value.transport_type,
      endpoint: toolForm.value.endpoint,
      timeout: toolForm.value.timeout,
      is_active: toolForm.value.is_active,
      is_system: toolForm.value.is_system,
      headers: parseRawJSON(toolForm.value.headers_raw),
      env: parseRawJSON(toolForm.value.env_raw),
    }
    if (editingTool.value) {
      await api.updateTool(editingTool.value.id, payload)
      toast.success('工具已更新')
    } else {
      await api.createTool(payload as any)
      toast.success('工具已创建')
    }
    showToolModal.value = false
    await loadTools()
  } catch (e: any) {
    toast.error((e.message || '操作失败'))
  } finally {
    toolSaving.value = false
  }
}

async function deleteTool(tool: McpTool) {
  if (!confirm(`确定要删除工具「${tool.display_name || tool.name}」吗？此操作不可逆。`)) return
  try {
    await api.deleteTool(tool.id)
    toast.success('工具已删除')
    await loadTools()
  } catch (e: any) {
    toast.error('删除失败：' + e.message)
  }
}

async function testTool(tool: McpTool) {
  testingId.value = tool.id
  try {
    const res = await api.testTool(tool.id)
    const data = (res as any).data ?? res
    if (data?.status === 'ok') {
      toast.success(`连通测试通过 (${data.latency_ms}ms)`)
    } else {
      toast.error('测试失败：' + (data?.error || '未知错误'))
    }
  } catch (e: any) {
    toast.error('测试异常：' + e.message)
  } finally {
    testingId.value = null
  }
}

const TRANSPORT_LABELS: Record<string, string> = { http: 'HTTP', sse: 'SSE', stdio: 'Stdio' }
const TRANSPORT_COLORS: Record<string, string> = {
  http: 'bg-blue-100 text-blue-700',
  sse:  'bg-violet-100 text-violet-700',
  stdio: 'bg-orange-100 text-orange-700',
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2: 功能绑定
// ══════════════════════════════════════════════════════════════════════════════

const features = ref<FeatureBindingDTO[]>([])
const featuresLoading = ref(false)

async function loadFeatures() {
  featuresLoading.value = true
  try {
    const res = await api.listFeatureBindings()
    features.value = ((res as any).data ?? []) as FeatureBindingDTO[]
  } catch (e: any) {
    toast.error('加载功能绑定失败：' + e.message)
  } finally {
    featuresLoading.value = false
  }
}

// Feature binding modal
const showBindModal = ref(false)
const editingFeature = ref<FeatureBindingDTO | null>(null)
const bindForm = ref({ mcp_tool_id: null as number | null, enabled: true, note: '' })
const bindSaving = ref(false)

function openBindModal(feat: FeatureBindingDTO) {
  editingFeature.value = feat
  bindForm.value = {
    mcp_tool_id: feat.binding?.mcp_tool_id ?? null,
    enabled: feat.binding?.enabled ?? true,
    note: feat.binding?.note ?? '',
  }
  showBindModal.value = true
}

async function submitBind() {
  if (!editingFeature.value) return
  bindSaving.value = true
  try {
    await api.upsertFeatureBinding(editingFeature.value.key, {
      mcp_tool_id: bindForm.value.mcp_tool_id ?? undefined,
      enabled: bindForm.value.enabled,
      note: bindForm.value.note,
    })
    toast.success('绑定已保存')
    showBindModal.value = false
    await loadFeatures()
  } catch (e: any) {
    toast.error('保存失败：' + e.message)
  } finally {
    bindSaving.value = false
  }
}

async function resetBind(feat: FeatureBindingDTO) {
  if (!feat.binding) return
  if (!confirm(`恢复「${feat.name}」使用内置默认实现？`)) return
  try {
    await api.deleteFeatureBinding(feat.key)
    toast.success('已恢复默认')
    await loadFeatures()
  } catch (e: any) {
    toast.error('操作失败：' + e.message)
  }
}

const CATEGORY_LABELS: Record<string, string> = {
  chapter: '章节生成', image: '图片生成', video: '视频生成', other: '其他',
}
const CATEGORY_COLORS: Record<string, string> = {
  chapter: 'bg-blue-100 text-blue-700',
  image: 'bg-purple-100 text-purple-700',
  video: 'bg-green-100 text-green-700',
  other: 'bg-gray-100 text-gray-600',
}

const groupedFeatures = computed(() => {
  const map: Record<string, FeatureBindingDTO[]> = {}
  for (const f of features.value) {
    if (!map[f.category]) map[f.category] = []
    map[f.category].push(f)
  }
  return map
})

// ── Init ──────────────────────────────────────────────────────────────────────
onMounted(() => {
  loadTools()
  loadFeatures()
})

watch(activeTab, (tab) => {
  if (tab === 'tools' && tools.value.length === 0) loadTools()
  if (tab === 'features' && features.value.length === 0) loadFeatures()
})
</script>

<template>
  <div class="p-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">MCP 工具管理</h1>
        <p class="text-sm text-gray-500 mt-1">管理所有 MCP 工具（含系统内置），配置授权凭据，绑定功能实现</p>
      </div>
      <button v-if="activeTab === 'tools'" class="btn-primary" @click="openAddTool">
        <svg class="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        新增工具
      </button>
    </div>

    <!-- Tabs -->
    <div class="border-b border-gray-200 dark:border-gray-700">
      <nav class="flex gap-6">
        <button
          v-for="tab in ([{ key: 'tools', label: '工具管理' }, { key: 'features', label: '功能绑定' }] as const)"
          :key="tab.key"
          class="py-3 px-1 border-b-2 font-medium text-sm transition-colors"
          :class="activeTab === tab.key
            ? 'border-primary-500 text-primary-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
          <span v-if="tab.key === 'tools' && tools.length > 0" class="ml-1.5 text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
            {{ tools.length }}
          </span>
        </button>
      </nav>
    </div>

    <!-- ════════════════════════════════════════════════════════════════════════ -->
    <!-- TAB 1: 工具管理                                                         -->
    <!-- ════════════════════════════════════════════════════════════════════════ -->
    <template v-if="activeTab === 'tools'">
      <div v-if="toolsLoading" class="space-y-3">
        <div v-for="i in 4" :key="i" class="h-20 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"/>
      </div>

      <div v-else-if="tools.length === 0" class="card p-12 text-center">
        <div class="mx-auto w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
        </div>
        <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-1">暂无 MCP 工具</h3>
        <button class="btn-primary mx-auto" @click="openAddTool">添加第一个工具</button>
      </div>

      <div v-else class="space-y-3">
        <div v-for="tool in tools" :key="tool.id" class="card overflow-hidden">
          <div class="px-5 py-4 flex items-center gap-4">
            <!-- Status dot -->
            <div class="w-2.5 h-2.5 rounded-full flex-shrink-0" :class="tool.is_active ? 'bg-green-500' : 'bg-gray-400'"/>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-semibold text-gray-900 dark:text-white text-sm">{{ tool.display_name || tool.name }}</span>
                <span class="font-mono text-xs text-gray-400">{{ tool.name }}</span>
                <span class="px-1.5 py-0.5 rounded text-xs font-medium" :class="TRANSPORT_COLORS[tool.transport_type] || 'bg-gray-100 text-gray-600'">
                  {{ TRANSPORT_LABELS[tool.transport_type] || tool.transport_type }}
                </span>
                <span v-if="tool.is_system" class="px-1.5 py-0.5 text-xs rounded bg-amber-50 text-amber-700 border border-amber-200">系统</span>
                <span v-else class="px-1.5 py-0.5 text-xs rounded bg-gray-50 text-gray-600 border border-gray-200">用户</span>
              </div>
              <p class="text-xs text-gray-500 mt-0.5 truncate">{{ tool.endpoint }}</p>
              <p v-if="tool.description" class="text-xs text-gray-400 mt-0.5 truncate">{{ tool.description }}</p>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2 flex-shrink-0">
              <button
                class="btn-ghost text-xs px-2.5 py-1.5 text-blue-600 hover:bg-blue-50"
                :disabled="testingId === tool.id"
                @click="testTool(tool)"
              >
                <span v-if="testingId === tool.id">测试中…</span>
                <span v-else>测试</span>
              </button>
              <button class="btn-ghost text-xs px-2.5 py-1.5" @click="openEditTool(tool)">编辑</button>
              <button class="btn-ghost text-xs px-2.5 py-1.5 text-red-500 hover:text-red-700 hover:bg-red-50" @click="deleteTool(tool)">删除</button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ════════════════════════════════════════════════════════════════════════ -->
    <!-- TAB 2: 功能绑定                                                         -->
    <!-- ════════════════════════════════════════════════════════════════════════ -->
    <template v-else-if="activeTab === 'features'">
      <div class="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
        <strong>说明：</strong>系统功能默认使用内置实现（built-in）。为某功能指定外部 MCP 工具后，该功能的调用将路由到该工具；禁用后该功能在生成时不会被调用。
      </div>

      <div v-if="featuresLoading" class="space-y-4">
        <div v-for="i in 3" :key="i" class="h-24 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse"/>
      </div>

      <div v-else class="space-y-6">
        <div v-for="(cats, category) in groupedFeatures" :key="category">
          <h3 class="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            {{ CATEGORY_LABELS[category] || category }}
          </h3>
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <div
              v-for="feat in cats"
              :key="feat.key"
              class="card px-4 py-4 flex flex-col gap-3"
            >
              <!-- Feature header -->
              <div class="flex items-start justify-between gap-2">
                <div>
                  <div class="flex items-center gap-2">
                    <span class="font-semibold text-sm text-gray-900 dark:text-white">{{ feat.name }}</span>
                    <span class="px-1.5 py-0.5 rounded text-xs font-mono" :class="CATEGORY_COLORS[feat.category] || 'bg-gray-100 text-gray-600'">
                      {{ feat.key }}
                    </span>
                  </div>
                  <p class="text-xs text-gray-500 mt-0.5">{{ feat.description }}</p>
                </div>
                <!-- Enabled badge -->
                <span
                  class="flex-shrink-0 text-xs px-1.5 py-0.5 rounded-full font-medium"
                  :class="feat.binding?.enabled === false ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'"
                >
                  {{ feat.binding?.enabled === false ? '已禁用' : '启用' }}
                </span>
              </div>

              <!-- Current tool -->
              <div class="border border-gray-100 dark:border-gray-700 rounded-lg px-3 py-2">
                <div class="flex items-center gap-2">
                  <svg class="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                  </svg>
                  <template v-if="feat.tool">
                    <span class="text-xs text-gray-700 dark:text-gray-300 font-medium truncate">{{ feat.tool.display_name || feat.tool.name }}</span>
                    <span class="text-xs text-gray-400 truncate flex-1">{{ feat.tool.endpoint }}</span>
                  </template>
                  <span v-else class="text-xs text-gray-400 italic">内置默认实现</span>
                </div>
                <p v-if="feat.binding?.note" class="text-xs text-gray-400 mt-1 italic">{{ feat.binding.note }}</p>
              </div>

              <!-- Actions -->
              <div class="flex gap-2">
                <button class="btn-ghost text-xs px-2.5 py-1.5 flex-1" @click="openBindModal(feat)">
                  {{ feat.binding ? '修改绑定' : '配置工具' }}
                </button>
                <button
                  v-if="feat.binding"
                  class="btn-ghost text-xs px-2.5 py-1.5 text-orange-600 hover:bg-orange-50"
                  @click="resetBind(feat)"
                >
                  恢复默认
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>

  <!-- ══════════════════════════════════════════════════════════════════════════ -->
  <!-- Modal: 工具编辑                                                            -->
  <!-- ══════════════════════════════════════════════════════════════════════════ -->
  <Teleport to="body">
    <div
      v-if="showToolModal"
      class="fixed inset-0 z-50 flex items-start justify-center bg-black/60 overflow-y-auto py-8"
      @click.self="showToolModal = false"
    >
      <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden">
        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
            {{ editingTool ? '编辑 MCP 工具' : '新增 MCP 工具' }}
          </h2>
          <button class="text-gray-400 hover:text-gray-600" @click="showToolModal = false">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <!-- Body -->
        <div class="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">
          <!-- Name + DisplayName -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">工具名称 <span class="text-red-500">*</span></label>
              <input v-model="toolForm.name" type="text" class="input" placeholder="web_search" :disabled="!!editingTool"/>
              <p class="text-xs text-gray-400 mt-1">唯一标识，创建后不可修改</p>
            </div>
            <div>
              <label class="block text-xs font-medium text-gray-600 mb-1">显示名称</label>
              <input v-model="toolForm.display_name" type="text" class="input" placeholder="联网搜索"/>
            </div>
          </div>

          <!-- Description -->
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">描述</label>
            <input v-model="toolForm.description" type="text" class="input" placeholder="工具功能描述"/>
          </div>

          <!-- Transport Type -->
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-2">传输协议 <span class="text-red-500">*</span></label>
            <div class="flex gap-2">
              <button
                v-for="t in ['http', 'sse', 'stdio']"
                :key="t"
                class="flex-1 py-2 rounded-lg border text-sm font-medium transition-colors"
                :class="toolForm.transport_type === t
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'"
                @click="toolForm.transport_type = t as any"
              >
                {{ TRANSPORT_LABELS[t] }}
              </button>
            </div>
          </div>

          <!-- Endpoint -->
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">
              {{ toolForm.transport_type === 'stdio' ? '命令路径' : '端点 URL' }}
              <span class="text-red-500">*</span>
            </label>
            <input v-model="toolForm.endpoint" type="text" class="input font-mono text-sm" :placeholder="toolForm.transport_type === 'stdio' ? '/usr/bin/my-tool' : 'https://api.example.com/tool'"/>
          </div>

          <!-- Timeout -->
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">超时时间（秒）</label>
            <input v-model.number="toolForm.timeout" type="number" min="1" max="300" class="input w-32"/>
          </div>

          <!-- Headers -->
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">
              HTTP 请求头
              <span class="text-gray-400 font-normal">（JSON，用于传入 Authorization 等凭据）</span>
            </label>
            <textarea
              v-model="toolForm.headers_raw"
              class="input font-mono text-xs resize-none h-24"
              placeholder='{"Authorization": "Bearer sk-xxx"}'
            />
          </div>

          <!-- Env (stdio only) -->
          <div v-if="toolForm.transport_type === 'stdio'">
            <label class="block text-xs font-medium text-gray-600 mb-1">
              环境变量 <span class="text-gray-400 font-normal">（JSON，stdio 专用）</span>
            </label>
            <textarea
              v-model="toolForm.env_raw"
              class="input font-mono text-xs resize-none h-20"
              placeholder='{"API_KEY": "sk-xxx"}'
            />
          </div>

          <!-- Flags -->
          <div class="flex gap-6">
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="toolForm.is_active" type="checkbox" class="w-4 h-4 rounded border-gray-300"/>
              <span class="text-sm text-gray-700">启用</span>
            </label>
            <label class="flex items-center gap-2 cursor-pointer">
              <input v-model="toolForm.is_system" type="checkbox" class="w-4 h-4 rounded border-gray-300"/>
              <span class="text-sm text-gray-700">标记为系统工具</span>
              <span class="text-xs text-gray-400">（系统工具用户不可见）</span>
            </label>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button class="btn-outline" @click="showToolModal = false">取消</button>
          <button class="btn-primary min-w-[80px]" :disabled="toolSaving" @click="submitToolForm">
            <svg v-if="toolSaving" class="animate-spin w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            {{ toolSaving ? '保存中…' : (editingTool ? '保存修改' : '创建工具') }}
          </button>
        </div>
      </div>
    </div>

    <!-- ══════════════════════════════════════════════════════════════════════════ -->
    <!-- Modal: 功能绑定编辑                                                        -->
    <!-- ══════════════════════════════════════════════════════════════════════════ -->
    <div
      v-if="showBindModal && editingFeature"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      @click.self="showBindModal = false"
    >
      <div class="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 class="text-lg font-semibold text-gray-900 dark:text-white">
            配置功能实现 · <span class="text-primary-600">{{ editingFeature.name }}</span>
          </h2>
          <p class="text-xs text-gray-500 mt-0.5">{{ editingFeature.description }}</p>
        </div>

        <div class="px-6 py-5 space-y-4">
          <!-- Tool selector -->
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">指定 MCP 工具（留空=内置默认）</label>
            <select v-model="bindForm.mcp_tool_id" class="input">
              <option :value="null">— 内置默认实现 —</option>
              <option v-for="t in tools" :key="t.id" :value="t.id">
                {{ t.display_name || t.name }}（{{ t.name }}）
              </option>
            </select>
          </div>

          <!-- Enabled -->
          <label class="flex items-center gap-3 cursor-pointer">
            <input v-model="bindForm.enabled" type="checkbox" class="w-4 h-4 rounded border-gray-300"/>
            <div>
              <span class="text-sm font-medium text-gray-700">功能启用</span>
              <p class="text-xs text-gray-400">取消勾选后该功能在生成时完全不调用（包括内置实现）</p>
            </div>
          </label>

          <!-- Note -->
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">备注</label>
            <input v-model="bindForm.note" type="text" class="input" placeholder="可选：记录修改原因"/>
          </div>
        </div>

        <div class="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <button class="btn-outline" @click="showBindModal = false">取消</button>
          <button class="btn-primary min-w-[80px]" :disabled="bindSaving" @click="submitBind">
            {{ bindSaving ? '保存中…' : '保存绑定' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
