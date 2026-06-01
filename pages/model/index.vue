<script setup lang="ts">
import type { ModelProvider, AIModel, McpTool } from '~/types'

// ── shared toast ────────────────────────────────────────────────────────────
const toast = useToast()

// ── tabs ────────────────────────────────────────────────────────────────────
const activeTab = ref<'providers' | 'mcp' | 'test' | 'mapping'>('providers')

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
  fetchProviderModels,
  getProviderTemplates,
} = useModelApi()

const providers = ref<ModelProvider[]>([])
const filteredProviders = computed(() =>
  providers.value.filter(p =>
    p.name === 'ollama' ||
    (p.has_key ?? (p.api_key?.trim() !== '' && p.api_key?.trim() !== '****'))
  )
)
const listLoading = ref(false)
const showProviderModal = ref(false)
const editingProvider = ref<ModelProvider | null>(null)
const providerLoading = ref(false)
const testingId = ref<number | null>(null)
const revealedKeys = ref<Set<number>>(new Set())

// 从云商接口获取模型列表
const providerModelList = ref<string[]>([])
const fetchingModels = ref(false)

// Ollama 无需 API Key
const isNoKeyProvider = computed(() => {
  const name = editingProvider.value?.name ?? providerForm.value.name
  return name === 'ollama'
})

async function doFetchProviderModels() {
  const endpoint = providerForm.value.api_endpoint
  const apiKey = providerForm.value.api_key
  const providerId = editingProvider.value?.id

  if (!endpoint) { toast.error('请先填写 API 端点'); return }
  if (!apiKey && !providerId && !isNoKeyProvider.value) { toast.error('请先填写 API Key'); return }

  fetchingModels.value = true
  providerModelList.value = []
  try {
    const payload: Record<string, unknown> = { endpoint }
    if (providerId) payload.provider_id = providerId
    if (apiKey) payload.api_key = apiKey
    const res = await fetchProviderModels(payload as { provider_id?: number; endpoint?: string; api_key?: string })
    providerModelList.value = res.data?.models ?? []
    if (providerModelList.value.length === 0) toast.warning('未获取到模型列表，请检查端点和密钥')
  } catch (e: any) {
    toast.error(e?.message || '获取模型列表失败')
  } finally {
    fetchingModels.value = false
  }
}

const providerForm = ref({
  name: '', display_name: '', type: 'llm',
  api_endpoint: '', api_key: '', api_secret_key: '', api_version: '', is_active: true,
  timeout: 0,      // 秒，0 = 使用默认值 300s
  concurrency: 0,  // 最大并发数，0 = 不限制
  rate_limit: 0,   // 请求/分钟，0 = 不限制
})

// 提供商模板列表 — 从后端 /model-providers/templates 动态加载，末尾追加"自定义"
type ProviderOption = {
  name: string; label: string; endpoint: string; needsSecretKey: boolean
  noApiKey?: boolean; staticModels?: string[]; type?: string
  needsApiVersion?: boolean; deploymentBased?: boolean
  apiVersionHint?: string; configHint?: string
}
const PROVIDER_OPTIONS = ref<ProviderOption[]>([
  { name: 'custom', label: '自定义', endpoint: '', needsSecretKey: false },
])

async function loadProviderTemplates() {
  try {
    const res = await getProviderTemplates()
    const templates = res.data ?? []
    PROVIDER_OPTIONS.value = [
      ...templates.map((t: any) => ({
        name:             t.name,
        label:            t.display_name,
        endpoint:         t.api_endpoint,
        needsSecretKey:   t.needs_secret_key,
        noApiKey:         t.no_api_key ?? false,
        staticModels:     t.static_models,
        type:             t.type,
        needsApiVersion:  t.needs_api_version ?? false,
        deploymentBased:  t.deployment_based ?? false,
        apiVersionHint:   t.api_version_hint ?? '',
        configHint:       t.config_hint ?? '',
      })),
      { name: 'custom', label: '自定义', endpoint: '', needsSecretKey: false },
    ]
  } catch {
    // 加载失败时保留默认"自定义"选项，不影响其他功能
  }
}

// 按当前选中类型过滤的供应商选项（类型未设置或为 custom 时显示全部）
const filteredProviderOptions = computed(() => {
  const type = providerForm.value.type
  if (!type) return PROVIDER_OPTIONS.value
  return PROVIDER_OPTIONS.value.filter(opt => opt.name === 'custom' || !opt.type || opt.type === type)
})

// 始终需要 AK/SK 双密钥的提供商（不依赖后端 DB 中的 needs_secret_key 字段）
const HARDCODED_NEEDS_SECRET_KEY = new Set([
  'volcengine-visual', 'volcengine-i2i', 'doubao-speech-v1',
  'kling', 'kling-sfx', 'kling-tts', 'kling-image', 'kling-i2i',
])

// 当前选中提供商是否需要 AK/SK 双密钥
const selectedProviderNeedsSecretKey = computed(() => {
  const name = editingProvider.value?.name ?? providerForm.value.name
  if (HARDCODED_NEEDS_SECRET_KEY.has(name)) return true
  const opt = PROVIDER_OPTIONS.value.find(o => o.name === name)
  return opt?.needsSecretKey ?? false
})

// 按提供商定制凭证字段的标签 / placeholder / 说明
type CredentialMeta = {
  akLabel: string; akPlaceholder: string
  skLabel: string; skPlaceholder: string; skHint: string
  versionLabel?: string; versionPlaceholder?: string; versionHint?: string
}
const CREDENTIAL_META: Record<string, CredentialMeta> = {
  azure: {
    akLabel: 'API Key', akPlaceholder: 'Azure OpenAI API 密钥（Azure 门户 → 密钥和端点）',
    skLabel: '', skPlaceholder: '', skHint: '',
    versionLabel: 'API Version',
    versionPlaceholder: '2025-01-01-preview',
    versionHint: 'Azure REST API 版本，如 2025-01-01-preview；端点格式：https://<资源名>.openai.azure.com/openai；下方模型名需与 Azure 门户中的「部署名」完全一致',
  },
  'volcengine-visual': {
    akLabel: 'Access Key（AK）', akPlaceholder: '火山引擎 AccessKey',
    skLabel: 'Secret Key（SK）', skPlaceholder: '火山引擎 SecretKey',
    skHint: '即梦AI Visual API 使用 AccessKey + SecretKey 进行 HMAC-SHA256 签名鉴权',
  },
  'doubao-speech-v1': {
    akLabel: 'App ID', akPlaceholder: '火山引擎应用 App ID（如 6762154031）',
    skLabel: 'Access Token', skPlaceholder: '火山引擎 Access Token',
    skHint: '豆包语音合成 V1 使用 App ID + Access Token 鉴权，在火山引擎方舟控制台「语音技术」页面获取',
    versionLabel: 'Cluster（集群）',
    versionPlaceholder: 'volcano_mega',
    versionHint: 'volcano_mega：豆包2.0大模型音色（_uranus_bigtts / _tob）；volcano_tts：经典音色（BV001_streaming 等）',
  },
  kling: {
    akLabel: 'Access Key（AK）', akPlaceholder: '可灵 Access Key',
    skLabel: 'Secret Key（SK）', skPlaceholder: '可灵 Secret Key',
    skHint: '可灵四个提供商（视频/音效/语音/图像）使用同一对 AK/SK，通过 JWT（HS256）鉴权，端点统一为 https://api.klingai.com',
  },
  'kling-sfx': {
    akLabel: 'Access Key（AK）', akPlaceholder: '可灵 Access Key（与 kling / kling-tts / kling-image 共用）',
    skLabel: 'Secret Key（SK）', skPlaceholder: '可灵 Secret Key',
    skHint: '可灵文生音效（kling-sfx）与其他可灵提供商共用同一对 AK/SK，通过 JWT（HS256）鉴权',
  },
  'kling-tts': {
    akLabel: 'Access Key（AK）', akPlaceholder: '可灵 Access Key（与 kling / kling-sfx / kling-image 共用）',
    skLabel: 'Secret Key（SK）', skPlaceholder: '可灵 Secret Key',
    skHint: '可灵语音合成（kling-tts）与其他可灵提供商共用同一对 AK/SK，通过 JWT（HS256）鉴权',
  },
  'kling-image': {
    akLabel: 'Access Key（AK）', akPlaceholder: '可灵 Access Key（与 kling / kling-sfx / kling-tts 共用）',
    skLabel: 'Secret Key（SK）', skPlaceholder: '可灵 Secret Key',
    skHint: '可灵图像生成（kling-image）与其他可灵提供商共用同一对 AK/SK，通过 JWT（HS256）鉴权',
  },
  'volcengine-i2i': {
    akLabel: 'Access Key（AK）', akPlaceholder: '火山引擎 AccessKey（与 volcengine-visual 共用）',
    skLabel: 'Secret Key（SK）', skPlaceholder: '火山引擎 SecretKey',
    skHint: '即梦AI 图生图与文生图使用相同的 AK/SK，均通过 HMAC-SHA256 签名鉴权',
  },
  'kling-i2i': {
    akLabel: 'Access Key（AK）', akPlaceholder: '可灵 Access Key（与 kling / kling-sfx / kling-tts / kling-image 共用）',
    skLabel: 'Secret Key（SK）', skPlaceholder: '可灵 Secret Key',
    skHint: '可灵图生图（kling-i2i）与其他可灵提供商共用同一对 AK/SK，通过 JWT（HS256）鉴权',
  },
  'elevenlabs-sfx': {
    akLabel: 'API Key', akPlaceholder: 'ElevenLabs API Key（xi-api-key 鉴权，0.5~22 秒音效生成）',
    skLabel: '', skPlaceholder: '', skHint: '',
  },
}
const credentialMeta = computed<CredentialMeta>(() => {
  const name = editingProvider.value?.name ?? providerForm.value.name
  return CREDENTIAL_META[name] ?? {
    akLabel: 'Access Key（AK）', akPlaceholder: '火山引擎 AccessKey',
    skLabel: 'Secret Key（SK）', skPlaceholder: '火山引擎 SecretKey',
    skHint: '',
  }
})

// 当前选中供应商的默认端点（用于 placeholder 和自动填充）
const selectedProviderEndpoint = computed(() => {
  const opt = PROVIDER_OPTIONS.value.find(o => o.name === providerForm.value.name)
  return opt?.endpoint ?? ''
})

// 根据"提供商标识-类型"规则生成显示名称（仅新建时自动填充）
function autoDisplayName() {
  if (editingProvider.value) return  // 编辑已有提供商时不覆盖
  const name = providerForm.value.name
  const type = providerForm.value.type
  if (name) providerForm.value.display_name = type ? `${name}-${type}` : name
}

function onProviderSelect() {
  const opt = PROVIDER_OPTIONS.value.find(o => o.name === providerForm.value.name)
  if (!opt || opt.name === 'custom') return
  // 切换供应商时始终更新端点为该供应商的默认值，用户可在下方输入框中覆盖
  providerForm.value.api_endpoint = opt.endpoint
  // 若有 apiVersionHint（如 Azure），自动填充 api_version 默认值
  if (opt.apiVersionHint && !providerForm.value.api_version) {
    providerForm.value.api_version = opt.apiVersionHint
  }
  // 若提供商有静态模型列表，直接填充（无需再请求 /models 接口）
  if (opt.staticModels && opt.staticModels.length > 0) {
    providerModelList.value = opt.staticModels
  } else {
    providerModelList.value = []
  }
  // 自动生成显示名称
  autoDisplayName()
}

// 类型变化时：若当前已选供应商与新类型不符则清空，并同步更新显示名称
watch(() => providerForm.value.type, (newType) => {
  if (!editingProvider.value) {
    const opt = PROVIDER_OPTIONS.value.find(o => o.name === providerForm.value.name)
    if (opt && opt.type && opt.type !== newType) {
      providerForm.value.name = ''
      providerForm.value.api_endpoint = ''
      providerModelList.value = []
    }
  }
  autoDisplayName()
})

// 填完端点和 Key 后自动获取模型列表（静默，失败则回退手动输入）
// Ollama：只需端点即可触发（无需 Key）
let _autoFetchTimer: ReturnType<typeof setTimeout> | null = null
watch(
  [() => providerForm.value.api_endpoint, () => providerForm.value.api_key, () => providerForm.value.name],
  ([endpoint, apiKey]) => {
    if (_autoFetchTimer) { clearTimeout(_autoFetchTimer); _autoFetchTimer = null }
    providerModelList.value = []
    const providerId = editingProvider.value?.id
    const noKey = isNoKeyProvider.value
    if (!endpoint || (!apiKey && !providerId && !noKey)) return
    _autoFetchTimer = setTimeout(async () => {
      fetchingModels.value = true
      try {
        const payload: Record<string, unknown> = { endpoint }
        if (providerId) payload.provider_id = providerId
        if (apiKey) payload.api_key = apiKey
        const res = await fetchProviderModels(payload as { provider_id?: number; endpoint?: string; api_key?: string })
        providerModelList.value = res.data?.models ?? []
      } catch {
        // 静默失败，回退手动输入
      } finally {
        fetchingModels.value = false
      }
    }, 800)
  }
)

// 按提供商类型过滤模型列表（基于名称模式，外部 API 不返回类型元数据）
const MODEL_TYPE_FILTER: Record<string, { include?: RegExp; exclude?: RegExp }> = {
  llm:       { exclude: /tts|whisper|dall-e|embedding|text-embedding|image-gen|video|audio-gen/i },
  image:     { include: /dall|image|img|draw|flux|stable|wanx|seedream|visual|t2i|text.to.image/i },
  img2img:   { include: /i2i|img2img|seededit|dreamo|seed3l|portrait|inpaint|edit|style|refine/i },
  voice:     { include: /tts|whisper|voice|audio|speech/i },
  video:     { include: /video|sora|kling|seedance/i },
  embedding: { include: /embed/i },
  sfx:       { include: /sfx|sound|audio|effect|elevenlabs|\d+s$/i },
}
const filteredProviderModelList = computed(() => {
  const f = MODEL_TYPE_FILTER[providerForm.value.type]
  if (!f) return providerModelList.value
  const list = providerModelList.value.filter(m => {
    if (f.include && !f.include.test(m)) return false
    if (f.exclude && f.exclude.test(m)) return false
    return true
  })
  // 若过滤后为空则回退到完整列表（避免全部被过滤掉）
  return list.length > 0 ? list : providerModelList.value
})

// 下拉搜索状态
const showModelDropdown = ref(false)
const modelDropdownList = computed(() => {
  const q = (providerForm.value.api_version || '').toLowerCase()
  return filteredProviderModelList.value.filter(m => !q || m.toLowerCase().includes(q))
})

const PROVIDER_COLORS: Record<string, string> = {
  openai:             'bg-emerald-100 text-emerald-700',
  anthropic:          'bg-purple-100  text-purple-700',
  google:             'bg-blue-100    text-blue-700',
  doubao:             'bg-orange-100  text-orange-700',
  deepseek:           'bg-cyan-100    text-cyan-700',
  qianwen:            'bg-rose-100    text-rose-700',
  azure:              'bg-sky-100     text-sky-700',
  ollama:             'bg-lime-100    text-lime-700',
  'volcengine-visual':'bg-amber-100   text-amber-700',
  'volcengine-i2i':   'bg-amber-100   text-amber-700',
  seedance:           'bg-violet-100  text-violet-700',
  'doubao-speech':    'bg-teal-100    text-teal-700',
  'doubao-speech-v1': 'bg-teal-100    text-teal-700',
  kling:              'bg-fuchsia-100 text-fuchsia-700',
  'kling-sfx':        'bg-fuchsia-100 text-fuchsia-700',
  'kling-tts':        'bg-fuchsia-100 text-fuchsia-700',
  'kling-image':      'bg-fuchsia-100 text-fuchsia-700',
  'kling-i2i':        'bg-fuchsia-100 text-fuchsia-700',
  'elevenlabs-sfx':   'bg-green-100   text-green-700',
}
function providerColor(name: string) {
  return PROVIDER_COLORS[name.toLowerCase()] ?? 'bg-gray-100 text-gray-600'
}

const PROVIDER_CONSOLE_URL: Record<string, string> = {
  // LLM — 国际
  openai:              'https://platform.openai.com/api-keys',
  anthropic:           'https://console.anthropic.com/settings/keys',
  google:              'https://aistudio.google.com/app/apikey',
  xai:                 'https://console.x.ai',
  mistral:             'https://console.mistral.ai/api-keys',
  meta:                'https://llama.meta.com/docs/getting_started',
  // LLM — 国内
  doubao:              'https://console.volcengine.com/ark',
  deepseek:            'https://platform.deepseek.com/api_keys',
  qianwen:             'https://dashscope.console.aliyun.com/apiKey',
  zhipu:               'https://open.bigmodel.cn/usercenter/apikeys',
  moonshot:            'https://platform.moonshot.cn/console/api-keys',
  baidu:               'https://qianfan.baidubce.com/qianfandev',
  tencent:             'https://console.cloud.tencent.com/hunyuan',
  yi:                  'https://platform.lingyiwanwu.com/apikeys',
  // 图像生成
  'volcengine-visual': 'https://console.volcengine.com/visual-intelligence',
  'volcengine-i2i':    'https://console.volcengine.com/visual-intelligence',
  // 视频 & 图像（可灵）
  kling:               'https://klingai.com/dev-platform/personal-info',
  'kling-sfx':         'https://klingai.com/dev-platform/personal-info',
  'kling-tts':         'https://klingai.com/dev-platform/personal-info',
  'kling-image':       'https://klingai.com/dev-platform/personal-info',
  'kling-i2i':         'https://klingai.com/dev-platform/personal-info',
  // 视频（Seedance/豆包）
  seedance:            'https://console.volcengine.com/ark',
  // 语音合成
  'doubao-speech':     'https://console.volcengine.com/speech',
  'doubao-speech-v1':  'https://console.volcengine.com/speech',
  'baidu-tts':         'https://ai.baidu.com/tech/speech',
  'minimax-tts':       'https://platform.minimax.chat/user-center/basic-information/interface-key',
  'aliyun-tts':        'https://dashscope.console.aliyun.com/apiKey',
  'tencent-tts':       'https://console.cloud.tencent.com/tts',
  // 音效
  'elevenlabs-sfx':    'https://elevenlabs.io/app/settings/api-keys',
  freesound:           'https://freesound.org/api/apply',
  'pixabay-sfx':       'https://pixabay.com/service/about/api',
  'pixabay-bgm':       'https://pixabay.com/service/about/api',
  jamendo:             'https://developer.jamendo.com/v3.0',
}
function providerConsoleUrl(name: string): string {
  return PROVIDER_CONSOLE_URL[name.toLowerCase()] ?? ''
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
  providerForm.value = { name: '', display_name: '', type: 'llm', api_endpoint: '', api_key: '', api_secret_key: '', api_version: '', is_active: true, timeout: 0, concurrency: 0, rate_limit: 0 }
  providerModelList.value = []
  showProviderModal.value = true
}
function openEditProvider(p: ModelProvider) {
  editingProvider.value = p
  const knownTypes = ['llm', 'image', 'img2img', 'video', 'voice', 'embedding', 'sfx']
  const pType = knownTypes.includes(p.type || '') ? (p.type as string) : 'llm'
  providerForm.value = { name: p.name, display_name: p.display_name || '', type: pType,
    api_endpoint: p.api_endpoint || '', api_key: '', api_secret_key: '', api_version: p.api_version || '', is_active: p.is_active, timeout: p.timeout ?? 0, concurrency: p.concurrency ?? 0, rate_limit: p.rate_limit ?? 0 }
  providerModelList.value = []
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
      if (!isNoKeyProvider.value && !providerForm.value.api_key.trim()) { toast.error('新增提供商时 API Key 不能为空'); providerLoading.value = false; return }
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
  // Fixed-length mask — does not reveal actual key length
  return '••••••••••••••••'
}

// ═══════════════════════════════════════════════════════════════════════════
// Provider Models — inline model management per provider
// ═══════════════════════════════════════════════════════════════════════════
const { createModel, deleteModel } = useModelApi()
const providerModels = ref<Record<number, AIModel[]>>({})
const expandedModels = ref<Set<number>>(new Set())
const addModelForms = ref<Record<number, { name: string; tasks: string; saving: boolean }>>({})

const TASK_TYPE_OPTIONS = [
  { value: 'chapter',    label: 'LLM 生成' },
  { value: 'image_gen',  label: '图像生成' },
  { value: 'img2img_gen',label: '图生图' },
  { value: 'video_gen',  label: '视频生成' },
  { value: 'voice_gen',  label: '语音合成' },
  { value: 'sfx_gen',    label: '文生音效' },
  { value: 'embedding',  label: '向量嵌入' },
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
  } catch (e: any) {
    toast.error('操作失败：' + (e?.message || '未知错误'))
  }
}

function openAddModelForm(providerId: number, providerType: string) {
  const defaultTask = providerType === 'image' ? 'image_gen'
    : providerType === 'img2img' ? 'img2img_gen'
    : providerType === 'video' ? 'video_gen'
    : providerType === 'voice' ? 'voice_gen'
    : providerType === 'sfx' ? 'sfx_gen'
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

// ═══════════════════════════════════════════════════════════════════════════
// TAB 3 — 模型测试 & A/B 对比
// ═══════════════════════════════════════════════════════════════════════════
const { testModelPrompt, getTaskMappings, updateTaskMapping } = useModelApi()

// ── Single model test panel ──────────────────────────────────────────────────
const testPanel = reactive({
  open: false,
  provider: null as ModelProvider | null,
  prompt: '写一句话介绍人工智能。',
  loading: false,
  result: '',
  error: '',
  stats: null as { latency_ms: number; tokens: number } | null,
})

function openTestPanel(p: ModelProvider) {
  testPanel.provider = p
  testPanel.open = true
  testPanel.result = ''
  testPanel.error = ''
  testPanel.stats = null
}

async function runModelTest() {
  if (!testPanel.provider) return
  testPanel.loading = true
  testPanel.result = ''
  testPanel.error = ''
  testPanel.stats = null
  try {
    const res = await testModelPrompt({
      provider_id: testPanel.provider.id,
      prompt: testPanel.prompt,
    })
    const d = (res as any).data
    testPanel.result = d?.content || ''
    testPanel.stats = { latency_ms: d?.latency_ms || 0, tokens: d?.tokens || 0 }
  } catch (err: any) {
    testPanel.error = err?.message || '测试失败'
  } finally {
    testPanel.loading = false
  }
}

// ── A/B comparison ────────────────────────────────────────────────────────────
const abTest = reactive({
  modelA: null as number | null,
  modelB: null as number | null,
  prompt: '写一段300字的武侠小说开篇。',
  loading: false,
  resultA: '',
  resultB: '',
  errorA: '',
  errorB: '',
  statsA: null as { latency_ms: number; tokens: number } | null,
  statsB: null as { latency_ms: number; tokens: number } | null,
})

async function runABTest() {
  if (!abTest.modelA || !abTest.modelB) {
    toast.error('请选择两个模型')
    return
  }
  abTest.loading = true
  abTest.resultA = ''
  abTest.resultB = ''
  abTest.errorA = ''
  abTest.errorB = ''
  abTest.statsA = null
  abTest.statsB = null

  const [resA, resB] = await Promise.allSettled([
    testModelPrompt({ provider_id: abTest.modelA, prompt: abTest.prompt }),
    testModelPrompt({ provider_id: abTest.modelB, prompt: abTest.prompt }),
  ])

  if (resA.status === 'fulfilled') {
    const d = (resA.value as any).data
    abTest.resultA = d?.content || ''
    abTest.statsA = { latency_ms: d?.latency_ms || 0, tokens: d?.tokens || 0 }
  } else {
    abTest.errorA = (resA as any).reason?.message || '失败'
  }
  if (resB.status === 'fulfilled') {
    const d = (resB.value as any).data
    abTest.resultB = d?.content || ''
    abTest.statsB = { latency_ms: d?.latency_ms || 0, tokens: d?.tokens || 0 }
  } else {
    abTest.errorB = (resB as any).reason?.message || '失败'
  }
  abTest.loading = false
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB 4 — 任务-模型映射
// ═══════════════════════════════════════════════════════════════════════════
const taskTypeLabels: Record<string, string> = {
  chapter_generation:    '章节生成',
  character_extraction:  '角色提取',
  storyboard_generation: '分镜生成',
  image_generation:      '图像生成',
  tts:                   'TTS语音',
  translation:           '翻译',
}

const taskMappings = ref<Record<string, number | null>>({})
const taskMappingLoading = ref(false)
const taskMappingSaving = ref<Record<string, boolean>>({})

const loadTaskMappings = async () => {
  taskMappingLoading.value = true
  try {
    const res = await getTaskMappings()
    taskMappings.value = (res as any).data || {}
  } catch {
    // ignore — backend may not have this endpoint yet
  } finally {
    taskMappingLoading.value = false
  }
}

async function saveTaskMapping(taskType: string, providerId: number | null) {
  taskMappingSaving.value = { ...taskMappingSaving.value, [taskType]: true }
  try {
    await updateTaskMapping({ task_type: taskType, provider_id: providerId || null })
    toast.success('映射已更新')
  } catch {
    toast.error('保存失败')
  } finally {
    taskMappingSaving.value = { ...taskMappingSaving.value, [taskType]: false }
  }
}

// ── lifecycle ────────────────────────────────────────────────────────────────
onMounted(() => {
  loadProviderTemplates()
  loadProviders()
  if (activeTab.value === 'mcp') loadMcpTools()
})

watch(activeTab, (tab) => {
  if (tab === 'mcp' && mcpTools.value.length === 0 && !mcpLoading.value) loadMcpTools()
  if (tab === 'mapping') loadTaskMappings()
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
        v-else-if="activeTab === 'mcp'"
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
        <button
          class="py-3 px-1 border-b-2 font-medium text-sm transition-colors"
          :class="activeTab === 'test'
            ? 'border-primary-500 text-primary-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
          @click="activeTab = 'test'"
        >
          生成测试
        </button>
        <button
          class="py-3 px-1 border-b-2 font-medium text-sm transition-colors"
          :class="activeTab === 'mapping'
            ? 'border-primary-500 text-primary-600'
            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'"
          @click="activeTab = 'mapping'"
        >
          任务映射
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
        <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-1">暂无已配置的提供商</h3>
        <p class="text-sm text-gray-500 mb-6">添加提供商后，AI 生成将优先使用您配置的密钥</p>
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
                <span v-if="p.type" class="font-medium">{{
                  p.type === 'llm' ? 'LLM'
                  : p.type === 'image' ? '文生图'
                  : p.type === 'img2img' ? '图生图'
                  : p.type === 'video' ? '视频生成'
                  : p.type === 'voice' ? '语音合成'
                  : p.type === 'sfx' ? '文生音效'
                  : p.type === 'embedding' ? '向量嵌入'
                  : p.type
                }}</span>
                <span v-if="p.api_endpoint" class="font-mono truncate max-w-xs">{{ p.api_endpoint }}</span>
                <span v-if="p.api_version">模型：<span class="font-mono">{{ p.api_version }}</span></span>
                <span v-if="p.timeout" class="font-mono">超时 {{ p.timeout }}s</span>
                <span v-if="p.concurrency" class="font-mono">并发 {{ p.concurrency }}</span>
                <span v-if="p.rate_limit" class="font-mono">限速 {{ p.rate_limit }}/min</span>
              </div>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <a
                v-if="providerConsoleUrl(p.name)"
                :href="providerConsoleUrl(p.name)"
                target="_blank"
                rel="noopener noreferrer"
                class="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1 text-gray-500 hover:text-primary-600"
                title="前往官方控制台"
              >
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                </svg>
                控制台
              </a>
              <button class="btn-outline text-xs px-3 py-1.5" :disabled="testingId === p.id" @click="handleTestProvider(p.id)">
                <span v-if="testingId === p.id" class="flex items-center gap-1">
                  <svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                  测试中
                </span>
                <span v-else>测试连接</span>
              </button>
              <button class="btn-ghost text-xs px-3 py-1.5 text-blue-600 hover:text-blue-700" @click="openTestPanel(p); activeTab = 'test'">生成测试</button>
              <button class="btn-ghost text-xs px-3 py-1.5" @click="openEditProvider(p)">编辑</button>
              <button class="btn-ghost text-xs px-3 py-1.5 text-red-500 hover:text-red-700 hover:bg-red-50" :disabled="p.tenant_id === 0" @click="handleDeleteProvider(p.id)">删除</button>
            </div>
          </div>
          <!-- Ollama 无需 API Key，显示本地服务提示 -->
          <div v-if="p.name === 'ollama'" class="px-5 py-3 bg-lime-50 dark:bg-lime-900/10 border-t border-lime-100 dark:border-lime-800 flex items-center gap-2">
            <svg class="w-3.5 h-3.5 text-lime-600 dark:text-lime-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
            <span class="text-xs text-lime-700 dark:text-lime-300">本地服务 · 无需 API Key</span>
            <code class="text-xs font-mono text-lime-600 dark:text-lime-400">{{ p.api_endpoint || 'http://localhost:11434/v1' }}</code>
          </div>
          <div v-else class="px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700 flex items-center gap-3">
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
            <button class="text-xs text-primary-600 hover:text-primary-700 underline ml-2" @click="openEditProvider(p)">更改密钥</button>
          </div>
          <!-- 可灵系列：共用 API Key 提示 -->
          <div v-if="['kling','kling-sfx','kling-tts','kling-image','kling-i2i'].includes(p.name)" class="px-5 py-2 bg-fuchsia-50 dark:bg-fuchsia-900/10 border-t border-fuchsia-100 dark:border-fuchsia-800 flex items-center gap-2">
            <svg class="w-3.5 h-3.5 text-fuchsia-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            <span class="text-xs text-fuchsia-700 dark:text-fuchsia-300">可灵四能力（视频/音效/语音/图像）共用同一对 Access Key + Secret Key · JWT（HS256）鉴权 · 端点 <code class="font-mono">https://api.klingai.com</code></span>
          </div>

          <!-- Model section header -->
          <div class="px-5 py-2.5 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gray-50/30 dark:bg-gray-800/20">
            <button class="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors" @click="toggleProviderModels(p.id)">
              <svg class="w-3.5 h-3.5 transition-transform duration-150" :class="expandedModels.has(p.id) ? 'rotate-90' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
              <span class="font-medium">模型</span>
              <span v-if="providerModels[p.id]?.length" class="px-1.5 py-0.5 rounded-full bg-gray-200 dark:bg-gray-600 text-gray-600 dark:text-gray-300 font-mono">{{ providerModels[p.id].length }}</span>
              <span v-else-if="providerModels[p.id]?.length === 0" class="text-gray-400 italic">暂无</span>
            </button>
            <button v-if="expandedModels.has(p.id) && !addModelForms[p.id]" class="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1" @click="openAddModelForm(p.id, p.type)">
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
              添加模型
            </button>
          </div>

          <!-- Model rows -->
          <div v-if="expandedModels.has(p.id)" class="divide-y divide-gray-100 dark:divide-gray-700/50">
            <div v-if="!providerModels[p.id]?.length && !addModelForms[p.id]" class="px-5 py-4 text-xs text-gray-400 text-center italic">
              暂无模型 · 点击「添加模型」后即可在项目设置中选用
            </div>

            <div v-for="m in (providerModels[p.id] || [])" :key="m.id"
                 class="px-5 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
              <span class="flex-1 text-sm font-mono text-gray-800 dark:text-gray-200 truncate">{{ m.name }}</span>
              <span v-if="m.suitable_tasks" class="text-xs text-gray-400 font-mono">{{ m.suitable_tasks }}</span>
              <button class="text-xs text-gray-400 hover:text-red-500 transition-colors ml-1" aria-label="删除模型" @click="handleDeleteModel(p.id, m.id)">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>

            <!-- Inline add form -->
            <div v-if="addModelForms[p.id]" class="px-5 py-3 bg-primary-50/50 dark:bg-primary-900/10 flex items-center gap-3">
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
    <template v-else-if="activeTab === 'mcp'">
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
    <!-- TAB 3: 生成测试 & A/B 对比                                           -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <template v-else-if="activeTab === 'test'">
      <!-- Single model test panel -->
      <div class="card p-6 mb-6">
        <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-4">模型生成测试</h3>
        <div class="mb-4">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">选择提供商</label>
          <select
            v-model="testPanel.provider"
            class="input"
          >
            <option :value="null" disabled>请选择提供商</option>
            <option v-for="p in filteredProviders" :key="p.id" :value="p">
              {{ p.display_name || p.name }}
            </option>
          </select>
        </div>
        <div class="mb-3">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">测试提示词</label>
          <textarea
            v-model="testPanel.prompt"
            class="input h-24 resize-none"
            placeholder="输入测试提示词..."
          />
        </div>
        <div class="flex gap-2 mb-4">
          <button
            class="btn-primary"
            :disabled="testPanel.loading || !testPanel.provider"
            @click="runModelTest"
          >
            <svg v-if="testPanel.loading" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
            {{ testPanel.loading ? '生成中...' : '发送' }}
          </button>
          <button
            v-if="testPanel.result || testPanel.error"
            class="btn-ghost"
            @click="testPanel.result = ''; testPanel.error = ''; testPanel.stats = null"
          >
            清除
          </button>
        </div>
        <div v-if="testPanel.result" class="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{{ testPanel.result }}</div>
        <div v-if="testPanel.error" class="mt-3 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg px-4 py-3">{{ testPanel.error }}</div>
        <div v-if="testPanel.stats" class="mt-2 flex items-center gap-4 text-xs text-gray-400">
          <span>耗时: <span class="font-mono text-gray-600 dark:text-gray-300">{{ testPanel.stats.latency_ms }}ms</span></span>
          <span>Tokens: <span class="font-mono text-gray-600 dark:text-gray-300">{{ testPanel.stats.tokens }}</span></span>
        </div>
      </div>

      <!-- A/B Test Panel -->
      <div class="card p-6">
        <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-4">A/B 模型对比</h3>
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">模型 A</label>
            <select v-model="abTest.modelA" class="input">
              <option :value="null" disabled>请选择</option>
              <option v-for="p in filteredProviders" :key="p.id" :value="p.id">{{ p.display_name || p.name }}</option>
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">模型 B</label>
            <select v-model="abTest.modelB" class="input">
              <option :value="null" disabled>请选择</option>
              <option v-for="p in filteredProviders" :key="p.id" :value="p.id">{{ p.display_name || p.name }}</option>
            </select>
          </div>
        </div>
        <div class="mb-3">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">对比提示词</label>
          <textarea v-model="abTest.prompt" class="input h-20 resize-none" placeholder="测试提示词..." />
        </div>
        <button
          class="btn-primary mb-6"
          :disabled="abTest.loading || !abTest.modelA || !abTest.modelB"
          @click="runABTest"
        >
          <svg v-if="abTest.loading" class="w-4 h-4 mr-1.5 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          {{ abTest.loading ? '对比中...' : '开始对比' }}
        </button>

        <div v-if="abTest.resultA || abTest.resultB || abTest.errorA || abTest.errorB" class="grid grid-cols-2 gap-4">
          <!-- Model A result -->
          <div class="bg-blue-50 dark:bg-blue-900/10 rounded-xl border border-blue-100 dark:border-blue-800 p-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-semibold text-blue-700 dark:text-blue-300">
                模型 A — {{ filteredProviders.find(p => p.id === abTest.modelA)?.display_name || '—' }}
              </span>
              <span v-if="abTest.statsA" class="text-xs text-blue-500 font-mono">{{ abTest.statsA.latency_ms }}ms · {{ abTest.statsA.tokens }}tok</span>
            </div>
            <div v-if="abTest.resultA" class="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{{ abTest.resultA }}</div>
            <div v-if="abTest.errorA" class="text-sm text-red-500">{{ abTest.errorA }}</div>
          </div>
          <!-- Model B result -->
          <div class="bg-emerald-50 dark:bg-emerald-900/10 rounded-xl border border-emerald-100 dark:border-emerald-800 p-4">
            <div class="flex items-center justify-between mb-2">
              <span class="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                模型 B — {{ filteredProviders.find(p => p.id === abTest.modelB)?.display_name || '—' }}
              </span>
              <span v-if="abTest.statsB" class="text-xs text-emerald-500 font-mono">{{ abTest.statsB.latency_ms }}ms · {{ abTest.statsB.tokens }}tok</span>
            </div>
            <div v-if="abTest.resultB" class="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap leading-relaxed">{{ abTest.resultB }}</div>
            <div v-if="abTest.errorB" class="text-sm text-red-500">{{ abTest.errorB }}</div>
          </div>
        </div>
      </div>
    </template>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- TAB 4: 任务-模型映射                                                  -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <template v-else-if="activeTab === 'mapping'">
      <div class="card p-6">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h3 class="font-semibold text-gray-900 dark:text-white">任务-模型映射</h3>
            <p class="text-xs text-gray-400 mt-1">为每种任务类型指定默认提供商，更改后立即生效</p>
          </div>
          <button class="btn-ghost text-sm" :disabled="taskMappingLoading" @click="loadTaskMappings">
            <svg class="w-4 h-4" :class="taskMappingLoading ? 'animate-spin' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
            </svg>
          </button>
        </div>

        <div v-if="taskMappingLoading" class="space-y-4">
          <div v-for="i in 6" :key="i" class="animate-pulse flex items-center gap-4">
            <div class="h-4 w-28 bg-gray-200 dark:bg-gray-700 rounded"></div>
            <div class="h-9 flex-1 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
          </div>
        </div>

        <div v-else class="space-y-4">
          <div
            v-for="(label, taskType) in taskTypeLabels"
            :key="taskType"
            class="flex items-center gap-4"
          >
            <span class="w-36 text-sm font-medium text-gray-700 dark:text-gray-300 shrink-0">{{ label }}</span>
            <select
              v-model="taskMappings[taskType as string]"
              class="flex-1 input text-sm"
              :disabled="taskMappingSaving[taskType as string]"
              @change="saveTaskMapping(taskType as string, taskMappings[taskType as string] ?? null)"
            >
              <option :value="null">使用默认</option>
              <option v-for="p in filteredProviders" :key="p.id" :value="p.id">
                {{ p.display_name || p.name }}
              </option>
            </select>
            <svg
              v-if="taskMappingSaving[taskType as string]"
              class="w-4 h-4 animate-spin text-primary-500 shrink-0"
              fill="none" viewBox="0 0 24 24"
            >
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
            </svg>
          </div>
        </div>

        <p class="text-xs text-gray-400 mt-6 border-t border-gray-100 dark:border-gray-700 pt-4">
          "使用默认"表示由系统自动选择优先级最高的可用提供商。映射仅影响对应任务类型的后续生成请求。
        </p>
      </div>
    </template>

    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <!-- MODAL: Add / Edit Provider                                          -->
    <!-- ═══════════════════════════════════════════════════════════════════ -->
    <Teleport to="body">
      <Transition name="modal">
        <div v-if="showProviderModal" class="fixed inset-0 z-50 flex items-center justify-center p-4" @keydown.esc="showProviderModal = false">
          <div class="fixed inset-0 bg-black/40 backdrop-blur-sm" @click="showProviderModal = false"/>
          <div class="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div class="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between shrink-0">
              <div>
                <h3 class="text-lg font-semibold text-gray-900 dark:text-white">{{ editingProvider ? '编辑提供商' : '添加 AI 提供商' }}</h3>
                <p class="text-sm text-gray-500 mt-0.5">{{ editingProvider ? '修改凭证、端点或限流配置' : '配置凭证与端点，保存后在卡片中管理具体模型' }}</p>
              </div>
              <button class="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="关闭" @click="showProviderModal = false">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
              </button>
            </div>
            <div class="px-6 py-5 space-y-4 overflow-y-auto flex-1">
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">模型类型</label>
                <select v-if="!editingProvider" v-model="providerForm.type" class="input">
                  <option value="llm">LLM（语言模型）</option>
                  <option value="image">图像生成（文生图）</option>
                  <option value="img2img">图生图</option>
                  <option value="video">视频生成</option>
                  <option value="voice">语音合成</option>
                  <option value="sfx">文生音效</option>
                  <option value="embedding">向量嵌入</option>
                </select>
                <div v-else class="input bg-gray-50 dark:bg-gray-900 text-gray-500 cursor-not-allowed">{{ providerForm.type }}</div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  提供商 <span class="text-red-500">*</span>
                  <span class="text-xs text-gray-400 font-normal ml-1">（唯一标识，创建后不可修改）</span>
                </label>
                <div v-if="editingProvider" class="input bg-gray-50 dark:bg-gray-900 text-gray-500 cursor-not-allowed">{{ editingProvider.name }}</div>
                <select v-else v-model="providerForm.name" class="input" @change="onProviderSelect">
                  <option value="" disabled>请选择供应商</option>
                  <option v-for="opt in filteredProviderOptions" :key="opt.name" :value="opt.name">{{ opt.label }}</option>
                </select>
                <div v-if="providerForm.name" class="mt-1 flex items-center justify-between">
                  <p class="text-xs text-gray-400 font-mono">标识：{{ providerForm.name }}</p>
                  <a
                    v-if="providerConsoleUrl(providerForm.name)"
                    :href="providerConsoleUrl(providerForm.name)"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="text-xs text-primary-600 hover:text-primary-500 flex items-center gap-1"
                  >
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                    </svg>
                    前往官网获取 API Key
                  </a>
                </div>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">显示名称</label>
                <input v-model="providerForm.display_name" type="text" class="input" placeholder="如：doubao-voice" />
                <p class="mt-1 text-xs text-gray-400">默认按「提供商标识-类型」生成，可自定义</p>
              </div>
              <div>
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">API 端点</label>
                <input v-model="providerForm.api_endpoint" type="url" class="input font-mono text-sm"
                  :placeholder="selectedProviderEndpoint || 'https://api.example.com/v1'" />
                <p class="mt-1 text-xs text-gray-400">已预填供应商默认端点，如需使用代理或自定义地址可直接修改</p>
              </div>
              <!-- Azure OpenAI 配置说明 -->
              <div v-if="providerForm.name === 'azure'" class="rounded-lg bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-700 px-3 py-2.5 flex items-start gap-2">
                <svg class="w-4 h-4 text-sky-600 dark:text-sky-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <div class="text-xs text-sky-700 dark:text-sky-300 space-y-1">
                  <div><span class="font-medium">端点：</span><code class="font-mono bg-sky-100 dark:bg-sky-800 px-1 rounded">https://&lt;资源名&gt;.openai.azure.com/openai</code></div>
                  <div><span class="font-medium">API Version：</span>填写 Azure REST API 版本，如 <code class="font-mono bg-sky-100 dark:bg-sky-800 px-1 rounded">2025-01-01-preview</code></div>
                  <div><span class="font-medium">模型名：</span>在下方模型列表中填写 Azure 门户「Deployments」中的<span class="font-medium">部署名</span>（如 <code class="font-mono bg-sky-100 dark:bg-sky-800 px-1 rounded">gpt-4o</code>），需与 Azure 控制台完全一致</div>
                </div>
              </div>
              <!-- Ollama 无 Key 提示 -->
              <div v-if="isNoKeyProvider" class="rounded-lg bg-lime-50 dark:bg-lime-900/20 border border-lime-200 dark:border-lime-700 px-3 py-2.5 flex items-start gap-2">
                <svg class="w-4 h-4 text-lime-600 dark:text-lime-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <div class="text-xs text-lime-700 dark:text-lime-300">
                  <span class="font-medium">Ollama 本地服务无需 API Key。</span>
                  请确保已运行 <code class="font-mono bg-lime-100 dark:bg-lime-800 px-1 rounded">ollama serve</code>，端点默认为 <code class="font-mono bg-lime-100 dark:bg-lime-800 px-1 rounded">http://localhost:11434/v1</code>。
                </div>
              </div>
              <div v-if="!isNoKeyProvider">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {{ selectedProviderNeedsSecretKey ? credentialMeta.akLabel : 'API Key' }}
                  <span v-if="!editingProvider" class="text-red-500">*</span>
                </label>
                <input v-model="providerForm.api_key" type="password" class="input font-mono text-sm"
                  :placeholder="editingProvider ? '留空则保持当前密钥不变' : (selectedProviderNeedsSecretKey ? credentialMeta.akPlaceholder : 'sk-…')"
                  autocomplete="new-password" />
                <p v-if="editingProvider" class="mt-1 text-xs text-gray-400">当前密钥：<span class="font-mono">{{ maskKey(editingProvider.api_key) }}</span></p>
              </div>
              <!-- AK/SK 双密钥提供商额外展示第二密钥输入框 -->
              <div v-if="selectedProviderNeedsSecretKey">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {{ credentialMeta.skLabel }}<span v-if="!editingProvider" class="text-red-500">*</span>
                </label>
                <input v-model="providerForm.api_secret_key" type="password" class="input font-mono text-sm"
                  :placeholder="editingProvider ? '留空则保持当前值不变' : credentialMeta.skPlaceholder"
                  autocomplete="new-password" />
                <p v-if="credentialMeta.skHint" class="mt-1 text-xs text-gray-400">{{ credentialMeta.skHint }}</p>
              </div>
              <div>
                <div class="flex items-center justify-between mb-1.5">
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">{{ credentialMeta.versionLabel || '默认模型名' }}</label>
                  <span v-if="fetchingModels" class="flex items-center gap-1 text-xs text-gray-400">
                    <svg class="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                    </svg>
                    获取中...
                  </span>
                </div>
                <!-- 已获取到模型列表时：可搜索下拉 combobox -->
                <div v-if="providerModelList.length > 0" class="space-y-1.5">
                  <div class="relative">
                    <input
                      v-model="providerForm.api_version"
                      type="text"
                      class="input font-mono text-sm w-full pr-7"
                      placeholder="搜索或直接输入模型名..."
                      autocomplete="off"
                      @focus="showModelDropdown = true"
                      @blur="showModelDropdown = false"
                    />
                    <svg class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7"/>
                    </svg>
                    <ul
                      v-if="showModelDropdown && modelDropdownList.length > 0"
                      class="absolute z-20 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:bg-gray-800 dark:border-gray-700"
                    >
                      <li
                        v-for="m in modelDropdownList" :key="m"
                        class="cursor-pointer px-3 py-1.5 text-sm font-mono hover:bg-gray-100 dark:hover:bg-gray-700"
                        @mousedown.prevent="providerForm.api_version = m; showModelDropdown = false"
                      >{{ m }}</li>
                    </ul>
                  </div>
                  <p class="text-xs text-gray-400">
                    显示 {{ filteredProviderModelList.length }} / {{ providerModelList.length }} 个模型，或
                    <button type="button" class="underline text-primary-600" @click="providerModelList = []">切换纯手动</button>
                  </p>
                </div>
                <!-- 默认：文本框手动输入 -->
                <div v-else>
                  <input v-model="providerForm.api_version" type="text" class="input font-mono text-sm"
                    :placeholder="credentialMeta.versionPlaceholder || 'gpt-4o / claude-3-5-sonnet-20241022'" />
                  <p class="mt-1 text-xs text-gray-400">
                    {{ credentialMeta.versionHint || '未指定模型时的兜底默认值，不影响下方模型列表；填写端点和 Key 后自动获取' }}
                  </p>
                </div>
              </div>
              <!-- 超时 + 并发度 + 限速 -->
              <div class="grid grid-cols-3 gap-3">
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">请求超时（秒）</label>
                  <input
                    v-model.number="providerForm.timeout"
                    type="number" min="0" step="30"
                    class="input font-mono text-sm"
                    placeholder="0" />
                  <p class="mt-0.5 text-xs text-gray-400">0 = 默认 300s</p>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">最大并发数</label>
                  <input
                    v-model.number="providerForm.concurrency"
                    type="number" min="0" step="1"
                    class="input font-mono text-sm"
                    placeholder="0" />
                  <p class="mt-0.5 text-xs text-gray-400">0 = 不限制</p>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">限速（次/分）</label>
                  <input
                    v-model.number="providerForm.rate_limit"
                    type="number" min="0" step="10"
                    class="input font-mono text-sm"
                    placeholder="0" />
                  <p class="mt-0.5 text-xs text-gray-400">0 = 不限制</p>
                </div>
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
            <div v-if="!editingProvider" class="mx-6 mb-0 mt-1 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 flex items-start gap-2 text-xs text-blue-700 dark:text-blue-300 shrink-0">
              <svg class="w-3.5 h-3.5 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
              保存后，点击供应商卡片底部「模型」展开区域，可添加该提供商支持的具体模型
            </div>
            <div class="px-6 py-4 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-700 shrink-0">
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
              <button class="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="关闭" @click="showMcpModal = false">
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
              <button class="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="关闭" @click="showBindModal = false">
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
                    <span v-if="model.suitable_tasks" class="truncate max-w-[100px]">
                      {{ model.suitable_tasks }}
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
