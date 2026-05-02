<script setup lang="ts">
import type { ModelProvider, AIModel, McpTool } from '~/types'

// ── shared toast ────────────────────────────────────────────────────────────
const toast = useToast()

// ── tabs ────────────────────────────────────────────────────────────────────
const activeTab = ref<'providers' | 'mcp'>('providers')

// ═══════════════════════════════════════════════════════════════════════════
// TAB 1 — 模型提供商 (unchanged logic)
// ═══════════════════════════════════════════════════════════════════════════
const {
  getProviders,
  createProvider,
  updateProvider,
  deleteProvider,
  getModels,
  testProvider: apiTestProvider,
} = useModelApi()

const providers = ref<ModelProvider[]>([])
const showUnconfigured = ref(false)
const filteredProviders = computed(() =>
  showUnconfigured.value
    ? providers.value
    : providers.value.filter(p => p.has_key ?? (p.api_key?.trim() !== '' && p.api_key?.trim() !== '****'))
)
const listLoading = ref(false)
const showProviderModal = ref(false)
const editingProvider = ref<ModelProvider | null>(null)
const providerLoading = ref(false)
const testingId = ref<number | null>(null)
const revealedKeys = ref<Set<number>>(new Set())

const providerForm = ref({
  name: '', display_name: '', type: 'llm',
  api_endpoint: '', api_key: '', api_secret_key: '', api_version: '', is_active: true,
})

// needsSecretKey: true 表示需要 AccessKey + SecretKey 双密钥（如火山引擎 AK/SK）
const PROVIDER_OPTIONS = [
  // LLM 提供商
  { name: 'openai',             label: 'OpenAI',                  endpoint: 'https://api.openai.com/v1',                                    type: 'llm',   needsSecretKey: false },
  { name: 'anthropic',          label: 'Anthropic',               endpoint: 'https://api.anthropic.com',                                    type: 'llm',   needsSecretKey: false },
  { name: 'google',             label: 'Google',                  endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',      type: 'llm',   needsSecretKey: false },
  { name: 'doubao',             label: '豆包 LLM（火山方舟）',    endpoint: 'https://ark.cn-beijing.volces.com/api/v3',                    type: 'llm',   needsSecretKey: false },
  { name: 'deepseek',           label: 'DeepSeek',                endpoint: 'https://api.deepseek.com/v1',                                  type: 'llm',   needsSecretKey: false },
  { name: 'qwen',               label: '通义千问（阿里云）',      endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',           type: 'llm',   needsSecretKey: false },
  { name: 'moonshot',           label: 'Moonshot（Kimi）',        endpoint: 'https://api.moonshot.cn/v1',                                   type: 'llm',   needsSecretKey: false },
  { name: 'zhipu',              label: '智谱 AI',                 endpoint: 'https://open.bigmodel.cn/api/paas/v4',                         type: 'llm',   needsSecretKey: false },
  { name: 'siliconflow',        label: '硅基流动',                endpoint: 'https://api.siliconflow.cn/v1',                               type: 'llm',   needsSecretKey: false },
  { name: 'stepfun',            label: '阶跃星辰',                endpoint: 'https://api.stepfun.com/v1',                                  type: 'llm',   needsSecretKey: false },
  { name: 'minimax',            label: 'MiniMax',                 endpoint: 'https://api.minimax.chat/v1',                                  type: 'llm',   needsSecretKey: false },
  { name: 'baidu',              label: '百度文心',                endpoint: 'https://qianfan.baidubce.com/v2',                             type: 'llm',   needsSecretKey: false },
  { name: 'azure',              label: 'Azure OpenAI',            endpoint: 'https://infra-okone-office-azure-llm-eu.cognitiveservices.azure.com/openai', type: 'llm', needsSecretKey: false },
  // 图像生成提供商
  { name: 'volcengine-visual',  label: '即梦AI Visual（火山引擎）', endpoint: '',                                                          type: 'image', needsSecretKey: true  },
  { name: 'volcengine-ark-img', label: 'Seedream 图像（火山方舟）', endpoint: 'https://ark.cn-beijing.volces.com/api/v3',                  type: 'image', needsSecretKey: false },
  // 视频生成提供商
  { name: 'seedance',           label: 'Seedance 视频（火山方舟）', endpoint: 'https://ark.cn-beijing.volces.com/api/v3',                  type: 'video', needsSecretKey: false },
  // 自定义
  { name: 'custom',             label: '自定义',                  endpoint: '',                                                            type: 'llm',   needsSecretKey: false },
]

// 当前选中提供商是否需要 AK/SK 双密钥
const selectedProviderNeedsSecretKey = computed(() => {
  const opt = PROVIDER_OPTIONS.find(o => o.name === providerForm.value.name)
  return opt?.needsSecretKey ?? false
})

function onProviderSelect() {
  const opt = PROVIDER_OPTIONS.find(o => o.name === providerForm.value.name)
  if (!opt || opt.name === 'custom') return
  if (!providerForm.value.display_name) providerForm.value.display_name = opt.label
  if (!providerForm.value.api_endpoint) providerForm.value.api_endpoint = opt.endpoint
  providerForm.value.type = opt.type
}

const PROVIDER_COLORS: Record<string, string> = {
  openai:             'bg-emerald-100 text-emerald-700',
  anthropic:          'bg-purple-100  text-purple-700',
  google:             'bg-blue-100    text-blue-700',
  doubao:             'bg-orange-100  text-orange-700',
  deepseek:           'bg-cyan-100    text-cyan-700',
  qianwen:            'bg-rose-100    text-rose-700',
  azure:              'bg-sky-100     text-sky-700',
  'volcengine-visual':'bg-amber-100   text-amber-700',
  seedance:           'bg-violet-100  text-violet-700',
}
function providerColor(name: string) {
  return PROVIDER_COLORS[name.toLowerCase()] ?? 'bg-gray-100 text-gray-600'
}

async function loadProviders() {
  listLoading.value = true
  try {
    const res = await getProviders()
    providers.value = ((res as any).data as ModelProvider[]) || []
  } catch (e: any) {
    toast.error('加载提供商失败：' + (e.message || ''))
  } finally {
    listLoading.value = false
  }
}

function openAddProvider() {
  editingProvider.value = null
  providerForm.value = { name: '', display_name: '', type: 'llm', api_endpoint: '', api_key: '', api_secret_key: '', api_version: '', is_active: true }
  showProviderModal.value = true
}
function openEditProvider(p: ModelProvider) {
  editingProvider.value = p
  providerForm.value = { name: p.name, display_name: p.display_name || '', type: p.type || 'llm',
    api_endpoint: p.api_endpoint || '', api_key: '', api_secret_key: '', api_version: p.api_version || '', is_active: p.is_active }
  showProviderModal.value = true
}
async function submitProviderForm() {
  if (!providerForm.value.name.trim()) { toast.error('标识名不能为空'); return }
  providerLoading.value = true
  try {
    if (editingProvider.value) {
      const payload: Record<string, unknown> = { ...providerForm.value }
      if (!payload.api_key) delete payload.api_key
      if (!payload.api_secret_key) delete payload.api_secret_key
      await updateProvider(editingProvider.value.id, payload as any)
      toast.success('提供商更新成功')
    } else {
      if (!providerForm.value.api_key.trim()) { toast.error('新增提供商时 API Key 不能为空'); providerLoading.value = false; return }
      if (selectedProviderNeedsSecretKey.value && !providerForm.value.api_secret_key.trim()) {
        toast.error('该提供商需要 Secret Key（SK）'); providerLoading.value = false; return
      }
      await createProvider(providerForm.value)
      toast.success('提供商创建成功')
    }
    showProviderModal.value = false
    await loadProviders()
  } catch (e: any) {
    toast.error(e.message || '操作失败')
  } finally {
    providerLoading.value = false
  }
}
async function handleDeleteProvider(id: number) {
  if (!confirm('确认删除该提供商？此操作不可撤销。')) return
  try { await deleteProvider(id); toast.success('提供商已删除'); await loadProviders() }
  catch (e: any) { toast.error(e.message || '删除失败') }
}
async function handleTestProvider(id: number) {
  testingId.value = id
  try {
    const res = await apiTestProvider(id)
    const d = (res as any).data
    d?.status === 'ok' ? toast.success('连接测试成功 ✓') : toast.error('连接失败：' + (d?.error || ''))
  } catch (e: any) { toast.error(e.message || '测试失败') }
  finally { testingId.value = null }
}
function toggleReveal(id: number) {
  const s = new Set(revealedKeys.value); s.has(id) ? s.delete(id) : s.add(id); revealedKeys.value = s
}
function maskKey(key?: string) {
  if (!key || key === '****') return '—'
  return key.length <= 8 ? '****' : key
}

// ═══════════════════════════════════════════════════════════════════════════
// Provider Models — inline model management per provider
// ═══════════════════════════════════════════════════════════════════════════
const { createModel, deleteModel } = useModelApi()
const providerModels = ref<Record<number, AIModel[]>>({})
const expandedModels = ref<Set<number>>(new Set())
const addModelForms = ref<Record<number, { name: string; tasks: string; saving: boolean }>>({})

const TASK_TYPE_OPTIONS = [
  { value: 'chapter',   label: 'LLM 生成' },
  { value: 'image_gen', label: '图像生成' },
  { value: 'video_gen', label: '视频生成' },
  { value: 'voice_gen', label: '语音合成' },
  { value: 'embedding', label: '向量嵌入' },
]

async function toggleProviderModels(providerId: number) {
  const s = new Set(expandedModels.value)
  if (s.has(providerId)) {
    s.delete(providerId)
  } else {
    s.add(providerId)
    if (!providerModels.value[providerId]) {
      await refreshProviderModels(providerId)
    }
  }
  expandedModels.value = s
}

async function refreshProviderModels(providerId: number) {
  try {
    const res = await getModels({ provider_id: providerId })
    providerModels.value = { ...providerModels.value, [providerId]: ((res as any).data as AIModel[]) || [] }
  } catch {}
}

function openAddModelForm(providerId: number, providerType: string) {
  const defaultTask = providerType === 'image' ? 'image_gen'
    : providerType === 'video' ? 'video_gen'
    : providerType === 'embedding' ? 'embedding'
    : 'chapter'
  addModelForms.value = { ...addModelForms.value, [providerId]: { name: '', tasks: defaultTask, saving: false } }
}

function closeAddModelForm(providerId: number) {
  const forms = { ...addModelForms.value }
  delete forms[providerId]
  addModelForms.value = forms
}

async function handleCreateModel(providerId: number) {
  const form = addModelForms.value[providerId]
  if (!form || !form.name.trim()) return
  form.saving = true
  try {
    const tasksJson = JSON.stringify([form.tasks])
    await createModel({ provider_id: providerId, model_id: form.name.trim(), name: form.name.trim(), task_types: tasksJson })
    toast.success('模型已添加')
    closeAddModelForm(providerId)
    await refreshProviderModels(providerId)
  } catch (e: any) {
    toast.error(e.message || '添加失败')
  } finally {
    if (form) form.saving = false
  }
}

async function handleDeleteModel(providerId: number, modelId: number) {
  if (!confirm('确认删除该模型？')) return
  try {
    await deleteModel(modelId)
    toast.success('模型已删除')
    await refreshProviderModels(providerId)
  } catch (e: any) {
    toast.error(e.message || '删除失败')
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 2 — MCP 工具
// ═══════════════════════════════════════════════════════════════════════════
const {
  getMcpTools, createMcpTool, updateMcpTool, deleteMcpTool,
  testMcpTool, getMcpToolModels, getModelMcpTools, bindMcpTool, unbindMcpTool,
} = useMcpApi()

const mcpTools = ref<McpTool[]>([])
const mcpLoading = ref(false)
const showMcpModal = ref(false)
const editingTool = ref<McpTool | null>(null)
const mcpSaving = ref(false)
const testingMcpId = ref<number | null>(null)

// Add/Edit form
const mcpForm = ref({
  name: '',
  display_name: '',
  description: '',
  transport_type: 'http' as 'http' | 'sse' | 'stdio',
  endpoint: '',
  timeout: 30000,
  is_active: true,
  // headers / env as raw JSON strings for the textarea
  headers_raw: '',
  env_raw: '',
})

// Model binding modal
const showBindModal = ref(false)
const bindingTool = ref<McpTool | null>(null)
const allModels = ref<AIModel[]>([])
const boundModelIds = ref<Set<number>>(new Set())
const bindLoading = ref(false)
const bindSaving = ref(false)

const TRANSPORT_COLORS: Record<string, string> = {
  http:  'bg-blue-100 text-blue-700',
  sse:   'bg-violet-100 text-violet-700',
  stdio: 'bg-orange-100 text-orange-700',
}
const TRANSPORT_LABELS: Record<string, string> = {
  http:  'HTTP',
  sse:   'SSE',
  stdio: 'Stdio',
}

async function loadMcpTools() {
  mcpLoading.value = true
  try {
    const res = await getMcpTools()
    mcpTools.value = ((res as any).data as McpTool[]) || []
  } catch (e: any) {
    toast.error('加载 MCP 工具失败：' + (e.message || ''))
  } finally {
    mcpLoading.value = false
  }
}

function openAddMcp() {
  editingTool.value = null
  mcpForm.value = { name: '', display_name: '', description: '', transport_type: 'http',
    endpoint: '', timeout: 30000, is_active: true, headers_raw: '', env_raw: '' }
  showMcpModal.value = true
}
function openEditMcp(t: McpTool) {
  editingTool.value = t
  mcpForm.value = {
    name: t.name, display_name: t.display_name, description: t.description || '',
    transport_type: t.transport_type, endpoint: t.endpoint,
    timeout: (t.timeout ?? 30) * 1000, // backend stores seconds, UI uses ms
    is_active: t.is_active,
    headers_raw: t.headers ? JSON.stringify(t.headers, null, 2) : '',
    env_raw: t.env ? JSON.stringify(t.env, null, 2) : '',
  }
  showMcpModal.value = true
}

function parseMcpForm() {
  let headers: Record<string, string> | undefined
  let env: Record<string, string> | undefined
  if (mcpForm.value.headers_raw.trim()) {
    try { headers = JSON.parse(mcpForm.value.headers_raw) } catch { toast.error('Headers JSON 格式错误'); return null }
  }
  if (mcpForm.value.env_raw.trim()) {
    try { env = JSON.parse(mcpForm.value.env_raw) } catch { toast.error('Env JSON 格式错误'); return null }
  }
  return {
    name: mcpForm.value.name.trim(),
    display_name: mcpForm.value.display_name.trim() || mcpForm.value.name.trim(),
    description: mcpForm.value.description.trim() || undefined,
    transport_type: mcpForm.value.transport_type,
    endpoint: mcpForm.value.endpoint.trim(),
    timeout: Math.floor(mcpForm.value.timeout / 1000), // convert ms → seconds for backend
    is_active: mcpForm.value.is_active,
    headers,
    env,
  }
}

async function submitMcpForm() {
  const data = parseMcpForm()
  if (!data) return
  if (!data.name) { toast.error('工具名称不能为空'); return }
  if (!data.endpoint) { toast.error('服务端点不能为空'); return }
  mcpSaving.value = true
  try {
    if (editingTool.value) {
      await updateMcpTool(editingTool.value.id, data)
      toast.success('MCP 工具更新成功')
    } else {
      await createMcpTool(data)
      toast.success('MCP 工具创建成功')
    }
    showMcpModal.value = false
    await loadMcpTools()
  } catch (e: any) {
    toast.error(e.message || '操作失败')
  } finally {
    mcpSaving.value = false
  }
}

async function handleDeleteMcp(id: number) {
  if (!confirm('确认删除该 MCP 工具？已绑定的模型将失去该工具能力。')) return
  try { await deleteMcpTool(id); toast.success('MCP 工具已删除'); await loadMcpTools() }
  catch (e: any) { toast.error(e.message || '删除失败') }
}

async function handleTestMcp(id: number) {
  testingMcpId.value = id
  try {
    const res = await testMcpTool(id)
    const d = (res as any).data
    if (d?.status === 'ok') {
      toast.success(`连接成功${d.latency_ms ? ` (${d.latency_ms}ms)` : ''}`)
    } else {
      toast.error('连接失败：' + (d?.error || ''))
    }
  } catch (e: any) { toast.error(e.message || '测试失败') }
  finally { testingMcpId.value = null }
}

// ── Model binding ────────────────────────────────────────────────────────────
async function openBindModal(tool: McpTool) {
  bindingTool.value = tool
  showBindModal.value = true
  bindLoading.value = true
  boundModelIds.value = new Set()
  allModels.value = []
  try {
    const [modelsRes, boundRes] = await Promise.allSettled([
      getModels(),
      getMcpToolModels(tool.id),
    ])
    if (modelsRes.status === 'fulfilled') {
      allModels.value = ((modelsRes.value as any).data as AIModel[]) || []
    }
    if (boundRes.status === 'fulfilled') {
      const bound = ((boundRes.value as any).data as AIModel[]) || []
      boundModelIds.value = new Set(bound.map(m => m.id))
    }
  } catch (e: any) { toast.error('加载失败：' + (e.message || '')) }
  finally { bindLoading.value = false }
}

async function toggleModelBinding(modelId: number) {
  if (!bindingTool.value) return
  bindSaving.value = true
  try {
    if (boundModelIds.value.has(modelId)) {
      await unbindMcpTool(modelId, bindingTool.value.id)
      boundModelIds.value.delete(modelId)
      toast.success('已解除绑定')
    } else {
      await bindMcpTool(modelId, bindingTool.value.id)
      boundModelIds.value.add(modelId)
      toast.success('绑定成功')
    }
    // force reactivity
    boundModelIds.value = new Set(boundModelIds.value)
  } catch (e: any) { toast.error(e.message || '操作失败') }
  finally { bindSaving.value = false }
}

// ── lifecycle ────────────────────────────────────────────────────────────────
onMounted(() => {
  loadProviders()
})

watch(activeTab, (tab) => {
  if (tab === 'mcp' && mcpTools.value.length === 0 && !mcpLoading.value) loadMcpTools()
})
</script>

<template>
  <div class="space-y-6">

    <!-- Page header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">模型管理</h1>
        <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
          配置 AI 供应商、管理 MCP 工具并绑定到对应模型
        </p>
      </div>
      <template v-if="activeTab === 'providers'">
        <button
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          @click="showUnconfigured = !showUnconfigured"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"/>
          </svg>
          {{ showUnconfigured ? '隐藏未配置' : '显示全部' }}
        </button>
        <button
          class="btn-primary flex items-center gap-1.5"
          @click="openAddProvider"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          添加提供商
        </button>
      </template>
      <button
        v-else
        class="btn-primary flex items-center gap-1.5"
        @click="openAddMcp"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
        </svg>
        添加 MCP 工具
      </button>
    </div>

    <!-- Tabs -->
    <div class="border-b border-gray-200 dark:border-gray-700">
      <nav class="flex space-x-8">
        <button
          class="py-3 px-1 border-b-2 font-medium text-sm transition-colors"
          :class="activeTab === 'providers'
            ? 'border-primary-500 text-primary-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
          @click="activeTab = 'providers'"
        >
          模型提供商
        </button>
        <button
          class="py-3 px-1 border-b-2 font-medium text-sm transition-colors flex items-center gap-1.5"
          :class="activeTab === 'mcp'
            ? 'border-primary-500 text-primary-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
          @click="activeTab = 'mcp'"
        >
          MCP 工具
          <span v-if="mcpTools.length > 0" class="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500">
            {{ mcpTools.length }}
          </span>
        </button>
      </nav>
    </div>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- TAB 1: Providers                                                    -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <template v-if="activeTab === 'providers'">
      <!-- Loading skeleton -->
      <div v-if="listLoading" class="space-y-3">
        <div v-for="i in 3" :key="i" class="card p-4 animate-pulse">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700"></div>
            <div class="flex-1 space-y-2">
              <div class="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded"></div>
              <div class="h-3 w-48 bg-gray-100 dark:bg-gray-800 rounded"></div>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="filteredProviders.length === 0" class="card p-12 text-center">
        <div class="mx-auto w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/>
          </svg>
        </div>
        <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-1">{{ showUnconfigured ? '暂无提供商配置' : '暂无已配置的提供商' }}</h3>
        <p class="text-sm text-gray-500 mb-6">{{ showUnconfigured ? '添加提供商后，AI 生成将优先使用您配置的密钥' : '点击「显示全部」查看未配置的提供商，或添加新提供商' }}</p>
        <button class="btn-primary mx-auto" @click="openAddProvider">立即添加</button>
      </div>

      <div v-else class="space-y-4">
        <div v-for="p in filteredProviders" :key="p.id" class="card overflow-hidden">
          <div class="px-5 py-4 flex items-center gap-4">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center text-lg font-bold shrink-0" :class="providerColor(p.name)">
              {{ (p.display_name || p.name).charAt(0).toUpperCase() }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-semibold text-gray-900 dark:text-white">{{ p.display_name || p.name }}</span>
                <span class="text-xs text-gray-400 font-mono">{{ p.name }}</span>
                <span v-if="p.tenant_id === 0" class="px-1.5 py-0.5 text-xs rounded bg-blue-50 text-blue-600 border border-blue-200">系统</span>
                <span v-else class="px-1.5 py-0.5 text-xs rounded bg-violet-50 text-violet-600 border border-violet-200">租户私有</span>
                <span class="px-1.5 py-0.5 text-xs rounded-full font-medium" :class="p.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'">
                  {{ p.is_active ? '已启用' : '已禁用' }}
                </span>
              </div>
              <div class="mt-1 flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                <span v-if="p.type" class="font-medium uppercase tracking-wide">{{ p.type }}</span>
                <span v-if="p.api_endpoint" class="font-mono truncate max-w-xs">{{ p.api_endpoint }}</span>
                <span v-if="p.api_version">模型：<span class="font-mono">{{ p.api_version }}</span></span>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <button class="btn-outline text-xs px-3 py-1.5" :disabled="testingId === p.id" @click="handleTestProvider(p.id)">
                <span v-if="testingId === p.id" class="flex items-center gap-1">
                  <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                  测试中
                </span>
                <span v-else>测试连接</span>
              </button>
              <button class="btn-ghost text-xs px-3 py-1.5" :disabled="p.tenant_id === 0" @click="openEditProvider(p)">编辑</button>
              <button class="btn-ghost text-xs px-3 py-1.5 text-red-500 hover:text-red-700 hover:bg-red-50" :disabled="p.tenant_id === 0" @click="handleDeleteProvider(p.id)">删除</button>
            </div>
          </div>
          <div class="px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700 flex items-center gap-3">
            <svg class="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
            </svg>
            <span class="text-xs text-gray-500 mr-1">API Key</span>
            <code class="text-xs font-mono flex-1 text-gray-700 dark:text-gray-300 tracking-wider">
              {{ revealedKeys.has(p.id) ? (p.api_key || '—') : maskKey(p.api_key) }}
            </code>
            <button v-if="p.api_key && p.api_key !== '—'" class="text-xs text-gray-400 hover:text-gray-600 underline" @click="toggleReveal(p.id)">
              {{ revealedKeys.has(p.id) ? '隐藏' : '显示' }}
            </button>
            <button class="text-xs text-primary-600 hover:text-primary-700 underline ml-2" :disabled="p.tenant_id === 0" @click="openEditProvider(p)">更改密钥</button>
          </div>

          <!-- Model list toggle -->
          <div class="px-5 py-2.5 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
            <button class="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300" @click="toggleProviderModels(p.id)">
              <svg class="w-3.5 h-3.5 transition-transform" :class="expandedModels.has(p.id) ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
              模型列表
              <span v-if="providerModels[p.id]?.length" class="px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500">{{ providerModels[p.id].length }}</span>
            </button>
            <button v-if="expandedModels.has(p.id) && !addModelForms[p.id]" class="text-xs text-primary-600 hover:text-primary-700" @click="openAddModelForm(p.id, p.type)">
              + 添加模型
            </button>
          </div>

          <!-- Model rows -->
          <div v-if="expandedModels.has(p.id)" class="border-t border-gray-100 dark:border-gray-700">
            <div v-if="!providerModels[p.id]?.length && !addModelForms[p.id]" class="px-5 py-3 text-xs text-gray-400 italic">
              暂无模型，点击「添加模型」后即可在小说设置中选择
            </div>
            <div v-for="m in (providerModels[p.id] || [])" :key="m.id" class="px-5 py-2.5 flex items-center gap-3 bg-gray-50/50 dark:bg-gray-800/30 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
              <span class="flex-1 text-sm font-mono text-gray-700 dark:text-gray-300">{{ m.name }}</span>
              <span class="text-xs text-gray-400">
                {{ Array.isArray(m.suitable_tasks) ? m.suitable_tasks.join(', ') : (m.suitable_tasks || '—') }}
              </span>
              <button class="text-xs text-red-400 hover:text-red-600" @click="handleDeleteModel(p.id, m.id)">删除</button>
            </div>

            <!-- Inline add form -->
            <div v-if="addModelForms[p.id]" class="px-5 py-3 bg-blue-50/50 dark:bg-blue-900/10 flex items-center gap-3">
              <input
                v-model="addModelForms[p.id].name"
                type="text"
                class="input text-sm flex-1"
                placeholder="模型名称，如 gpt-4o"
                @keydown.enter="handleCreateModel(p.id)"
              />
              <select v-model="addModelForms[p.id].tasks" class="input text-sm w-36">
                <option v-for="t in TASK_TYPE_OPTIONS" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
              <button class="btn-primary text-xs px-3 py-1.5" :disabled="addModelForms[p.id].saving" @click="handleCreateModel(p.id)">
                {{ addModelForms[p.id].saving ? '保存中...' : '确认' }}
              </button>
              <button class="btn-ghost text-xs px-3 py-1.5" @click="closeAddModelForm(p.id)">取消</button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- TAB 2: MCP 工具                                                     -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <template v-else>
      <!-- Loading -->
      <div v-if="mcpLoading" class="space-y-3">
        <div v-for="i in 3" :key="i" class="card p-4 animate-pulse">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700"></div>
            <div class="flex-1 space-y-2">
              <div class="h-4 w-40 bg-gray-200 dark:bg-gray-700 rounded"></div>
              <div class="h-3 w-64 bg-gray-100 dark:bg-gray-800 rounded"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty -->
      <div v-else-if="mcpTools.length === 0" class="card p-12 text-center">
        <div class="mx-auto w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
          </svg>
        </div>
        <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-1">还没有 MCP 工具</h3>
        <p class="text-sm text-gray-500 mb-6">添加 MCP 工具后可绑定到模型，赋予模型调用外部工具的能力</p>
        <button class="btn-primary mx-auto" @click="openAddMcp">添加第一个工具</button>
      </div>

      <!-- Tool cards -->
      <div v-else class="space-y-4">
        <div v-for="tool in mcpTools" :key="tool.id" class="card overflow-hidden">
          <div class="px-5 py-4 flex items-start gap-4">
            <!-- Icon -->
            <div class="w-11 h-11 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
              <svg class="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
              </svg>
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="font-semibold text-gray-900 dark:text-white">{{ tool.display_name }}</span>
                <span class="text-xs font-mono text-gray-400">{{ tool.name }}</span>
                <!-- transport badge -->
                <span class="px-1.5 py-0.5 text-xs rounded font-medium" :class="TRANSPORT_COLORS[tool.transport_type] ?? 'bg-gray-100 text-gray-600'">
                  {{ TRANSPORT_LABELS[tool.transport_type] || tool.transport_type }}
                </span>
                <!-- system badge -->
                <span v-if="tool.is_system" class="px-1.5 py-0.5 text-xs rounded bg-blue-50 text-blue-600 border border-blue-200">系统</span>
                <!-- active badge -->
                <span class="px-1.5 py-0.5 text-xs rounded-full font-medium" :class="tool.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'">
                  {{ tool.is_active ? '已启用' : '已禁用' }}
                </span>
              </div>
              <p v-if="tool.description" class="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-1">{{ tool.description }}</p>
              <div class="mt-1.5 flex items-center gap-4 text-xs text-gray-400 flex-wrap">
                <span class="font-mono truncate max-w-sm">{{ tool.endpoint }}</span>
                <span v-if="tool.timeout">超时 {{ tool.timeout }}s</span>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center gap-2 shrink-0">
              <button
                class="btn-outline text-xs px-3 py-1.5"
                :disabled="testingMcpId === tool.id"
                @click="handleTestMcp(tool.id)"
              >
                <span v-if="testingMcpId === tool.id" class="flex items-center gap-1">
                  <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                  测试中
                </span>
                <span v-else>测试连接</span>
              </button>
              <button class="btn-outline text-xs px-3 py-1.5" @click="openBindModal(tool)">
                绑定模型
              </button>
              <button class="btn-ghost text-xs px-3 py-1.5" :disabled="tool.is_system" @click="openEditMcp(tool)">编辑</button>
              <button class="btn-ghost text-xs px-3 py-1.5 text-red-500 hover:text-red-700 hover:bg-red-50" :disabled="tool.is_system" @click="handleDeleteMcp(tool.id)">删除</button>
            </div>
          </div>

          <!-- Headers / Env preview -->
          <div
            v-if="tool.headers && Object.keys(tool.headers).length > 0 || tool.env && Object.keys(tool.env).length > 0"
            class="px-5 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700 flex gap-4 text-xs text-gray-500"
          >
            <span v-if="tool.headers && Object.keys(tool.headers).length > 0">
              Headers: <span class="font-mono text-gray-600 dark:text-gray-400">{{ Object.keys(tool.headers).join(', ') }}</span>
            </span>
            <span v-if="tool.env && Object.keys(tool.env).length > 0">
              Env: <span class="font-mono text-gray-600 dark:text-gray-400">{{ Object.keys(tool.env).join(', ') }}</span>
            </span>
          </div>
        </div>
      </div>
    </template>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- MODAL: Add / Edit Provider                                          -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showProviderModal" class="fixed inset-0 z-50 flex items-center justify-center p-4" @keydown.esc="showProviderModal = false">
          <div class="fixed inset-0 bg-black/40 backdrop-blur-sm" @click="showProviderModal = false"/>
          <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg">
            <div class="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
              <div>
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ editingProvider ? '编辑提供商' : '添加 AI 提供商' }}</h3>
                <p class="text-sm text-gray-500 mt-0.5">{{ editingProvider ? '修改 API 密钥或端点配置' : '配置 API 密钥以使用该提供商' }}</p>
              </div>
              <button class="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" @click="showProviderModal = false">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div class="px-6 py-5 space-y-4">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  提供商标识 <span class="text-red-500">*</span>
                  <span class="ml-1 text-xs text-gray-400 font-normal">（唯一，创建后不可修改）</span>
                </label>
                <div v-if="editingProvider" class="input bg-gray-50 dark:bg-gray-900 text-gray-500 cursor-not-allowed">{{ editingProvider.name }}</div>
                <select v-else v-model="providerForm.name" class="input" @change="onProviderSelect">
                  <option value="" disabled>请选择提供商</option>
                  <option v-for="opt in PROVIDER_OPTIONS" :key="opt.name" :value="opt.name">{{ opt.label }}（{{ opt.name }}）</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">显示名称</label>
                <input v-model="providerForm.display_name" type="text" class="input" placeholder="如：OpenAI" />
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">类型</label>
                <select v-model="providerForm.type" class="input">
                  <option value="llm">LLM（语言模型）</option>
                  <option value="image">图像生成</option>
                  <option value="video">视频生成</option>
                  <option value="embedding">向量嵌入</option>
                </select>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">API 端点</label>
                <input v-model="providerForm.api_endpoint" type="url" class="input font-mono text-sm" placeholder="https://api.openai.com/v1" />
                <p class="mt-1 text-xs text-gray-400">留空则使用提供商默认端点</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {{ selectedProviderNeedsSecretKey ? 'Access Key（AK）' : 'API Key' }}
                  <span v-if="!editingProvider" class="text-red-500">*</span>
                </label>
                <input v-model="providerForm.api_key" type="password" class="input font-mono text-sm"
                  :placeholder="editingProvider ? '留空则保持当前密钥不变' : (selectedProviderNeedsSecretKey ? '火山引擎 AccessKey' : 'sk-…')"
                  autocomplete="new-password" />
                <p v-if="editingProvider" class="mt-1 text-xs text-gray-400">当前密钥：<span class="font-mono">{{ maskKey(editingProvider.api_key) }}</span></p>
              </div>
              <!-- AK/SK 双密钥提供商（如即梦AI Visual）额外展示 Secret Key 输入框 -->
              <div v-if="selectedProviderNeedsSecretKey || (editingProvider && editingProvider.name === 'volcengine-visual')">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Secret Key（SK）<span v-if="!editingProvider" class="text-red-500">*</span>
                </label>
                <input v-model="providerForm.api_secret_key" type="password" class="input font-mono text-sm"
                  :placeholder="editingProvider ? '留空则保持当前 SK 不变' : '火山引擎 SecretKey'"
                  autocomplete="new-password" />
                <p class="mt-1 text-xs text-gray-400">即梦AI Visual API 使用 AccessKey + SecretKey 进行 HMAC-SHA256 签名鉴权</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">默认模型</label>
                <input v-model="providerForm.api_version" type="text" class="input font-mono text-sm" placeholder="gpt-4o / claude-3-5-sonnet-20241022" />
                <p class="mt-1 text-xs text-gray-400">生成请求中未指定模型时使用此值</p>
              </div>
              <div class="flex items-center gap-3 py-1">
                <button type="button" role="switch" :aria-checked="providerForm.is_active"
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                  :class="providerForm.is_active ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'"
                  @click="providerForm.is_active = !providerForm.is_active">
                  <span class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform" :class="providerForm.is_active ? 'translate-x-6' : 'translate-x-1'" />
                </button>
                <span class="text-sm text-gray-700 dark:text-gray-300">启用该提供商</span>
              </div>
            </div>
            <div class="px-6 pb-6 pt-2 flex justify-end gap-3">
              <button class="btn-outline" @click="showProviderModal = false">取消</button>
              <button class="btn-primary min-w-[80px]" :disabled="providerLoading" @click="submitProviderForm">
                <span v-if="providerLoading" class="flex items-center gap-1.5">
                  <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                  保存中...
                </span>
                <span v-else>{{ editingProvider ? '保存更改' : '添加' }}</span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- MODAL: Add / Edit MCP Tool                                          -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showMcpModal" class="fixed inset-0 z-50 flex items-center justify-center p-4" @keydown.esc="showMcpModal = false">
          <div class="fixed inset-0 bg-black/40 backdrop-blur-sm" @click="showMcpModal = false"/>
          <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div class="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
              <div>
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ editingTool ? '编辑 MCP 工具' : '添加 MCP 工具' }}</h3>
                <p class="text-sm text-gray-500 mt-0.5">配置 MCP 服务端点，绑定后模型可调用该工具</p>
              </div>
              <button class="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" @click="showMcpModal = false">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <div class="px-6 py-5 space-y-4">
              <!-- Name / Display name -->
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                    工具标识 <span class="text-red-500">*</span>
                  </label>
                  <div v-if="editingTool" class="input bg-gray-50 dark:bg-gray-900 text-gray-500 cursor-not-allowed">{{ editingTool.name }}</div>
                  <input v-else v-model="mcpForm.name" type="text" class="input font-mono text-sm" placeholder="web-search" />
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">显示名称</label>
                  <input v-model="mcpForm.display_name" type="text" class="input" placeholder="网络搜索" />
                </div>
              </div>

              <!-- Description -->
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">功能描述</label>
                <input v-model="mcpForm.description" type="text" class="input" placeholder="允许模型搜索互联网获取最新信息" />
              </div>

              <!-- Transport type + Endpoint -->
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">传输协议</label>
                <div class="grid grid-cols-3 gap-2">
                  <button
                    v-for="t in ['http', 'sse', 'stdio']"
                    :key="t"
                    type="button"
                    class="py-2 rounded-lg border-2 text-sm font-medium transition-all"
                    :class="mcpForm.transport_type === t
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'"
                    @click="mcpForm.transport_type = t as any"
                  >
                    {{ t.toUpperCase() }}
                  </button>
                </div>
                <p class="mt-1 text-xs text-gray-400">
                  <template v-if="mcpForm.transport_type === 'http'">HTTP：请求/响应模式，最通用</template>
                  <template v-else-if="mcpForm.transport_type === 'sse'">SSE：服务端推送，适合流式输出</template>
                  <template v-else>Stdio：本地进程，通过标准输入输出通信</template>
                </p>
              </div>

              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  服务端点 <span class="text-red-500">*</span>
                </label>
                <input
                  v-model="mcpForm.endpoint"
                  type="text"
                  class="input font-mono text-sm"
                  :placeholder="mcpForm.transport_type === 'stdio' ? '/usr/local/bin/mcp-server' : 'https://mcp.example.com/tools'"
                />
                <p class="mt-1 text-xs text-gray-400">
                  {{ mcpForm.transport_type === 'stdio' ? '可执行文件路径' : 'MCP 服务的完整 URL' }}
                </p>
              </div>

              <!-- Timeout -->
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  超时时间（毫秒）
                </label>
                <input v-model.number="mcpForm.timeout" type="number" min="1000" step="1000" class="input" />
              </div>

              <!-- Headers -->
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  请求头（JSON，可选）
                </label>
                <textarea
                  v-model="mcpForm.headers_raw"
                  rows="3"
                  class="input font-mono text-xs"
                  placeholder='{"Authorization": "Bearer token", "X-API-Key": "key"}'
                ></textarea>
              </div>

              <!-- Env vars (for stdio) -->
              <div v-if="mcpForm.transport_type === 'stdio'">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  环境变量（JSON，可选）
                </label>
                <textarea
                  v-model="mcpForm.env_raw"
                  rows="3"
                  class="input font-mono text-xs"
                  placeholder='{"API_KEY": "xxx", "DEBUG": "false"}'
                ></textarea>
              </div>

              <!-- Active toggle -->
              <div class="flex items-center gap-3 py-1">
                <button type="button" role="switch" :aria-checked="mcpForm.is_active"
                  class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
                  :class="mcpForm.is_active ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'"
                  @click="mcpForm.is_active = !mcpForm.is_active">
                  <span class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform" :class="mcpForm.is_active ? 'translate-x-6' : 'translate-x-1'" />
                </button>
                <span class="text-sm text-gray-700 dark:text-gray-300">启用该工具</span>
              </div>
            </div>

            <div class="px-6 pb-6 pt-2 flex justify-end gap-3 sticky bottom-0 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700">
              <button class="btn-outline" @click="showMcpModal = false">取消</button>
              <button class="btn-primary min-w-[80px]" :disabled="mcpSaving" @click="submitMcpForm">
                <span v-if="mcpSaving" class="flex items-center gap-1.5">
                  <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                  保存中...
                </span>
                <span v-else>{{ editingTool ? '保存更改' : '添加工具' }}</span>
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- MODAL: Bind MCP Tool to Models                                      -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showBindModal" class="fixed inset-0 z-50 flex items-center justify-center p-4" @keydown.esc="showBindModal = false">
          <div class="fixed inset-0 bg-black/40 backdrop-blur-sm" @click="showBindModal = false"/>
          <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <!-- Header -->
            <div class="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between shrink-0">
              <div>
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">绑定模型</h3>
                <p class="text-sm text-gray-500 mt-0.5">
                  选择哪些模型可以使用
                  <span class="font-medium text-gray-700 dark:text-gray-300">{{ bindingTool?.display_name }}</span>
                </p>
              </div>
              <button class="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" @click="showBindModal = false">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <!-- Body -->
            <div class="flex-1 overflow-y-auto px-6 py-4">
              <!-- Loading -->
              <div v-if="bindLoading" class="space-y-3">
                <div v-for="i in 4" :key="i" class="h-12 bg-gray-100 dark:bg-gray-700 rounded-lg animate-pulse"></div>
              </div>

              <!-- No models -->
              <div v-else-if="allModels.length === 0" class="py-8 text-center text-sm text-gray-500">
                没有可用模型。请先在「模型提供商」中配置供应商。
              </div>

              <!-- Model list -->
              <div v-else class="space-y-2">
                <label
                  v-for="model in allModels"
                  :key="model.id"
                  class="flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all"
                  :class="boundModelIds.has(model.id)
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'"
                >
                  <input
                    type="checkbox"
                    :checked="boundModelIds.has(model.id)"
                    :disabled="bindSaving"
                    class="w-4 h-4 rounded accent-primary-500 shrink-0"
                    @change="toggleModelBinding(model.id)"
                  />
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {{ model.display_name || model.name }}
                    </p>
                    <p class="text-xs text-gray-400 font-mono truncate">{{ model.name }}</p>
                  </div>
                  <div class="flex items-center gap-1.5 shrink-0 text-xs text-gray-400">
                    <span v-if="model.suitable_tasks?.length" class="truncate max-w-[100px]">
                      {{ model.suitable_tasks.slice(0, 2).join(', ') }}
                    </span>
                    <span v-if="!model.is_available" class="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">不可用</span>
                  </div>
                </label>
              </div>
            </div>

            <!-- Footer -->
            <div class="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex justify-between items-center shrink-0">
              <span class="text-sm text-gray-500">已绑定 {{ boundModelIds.size }} 个模型</span>
              <button class="btn-primary" @click="showBindModal = false">完成</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<style scoped>
.modal-enter-active, .modal-leave-active { transition: all .2s ease; }
.modal-enter-from, .modal-leave-to       { opacity: 0; }
.modal-enter-from .relative, .modal-leave-to .relative { transform: scale(.96); }
</style>
