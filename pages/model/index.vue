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


const TYPE_LABELS: Record<string, string> = {
  llm: '大语言模型', embedding: '文本嵌入', image: '文生图', img2img: '图生图',
  video: '文生视频', voice: '语音合成', sfx: '音效', music: '背景音乐',
}

type ProviderGroup = {
  key: number           // canonical.id（作为 expandedModels/providerModels 的 key）
  isGroup: false
  canonical: ModelProvider
  members: ModelProvider[]
  typeBadges: string[]
}

const providerGroups = computed((): ProviderGroup[] =>
  filteredProviders.value.map(p => ({
    key: p.id,
    isGroup: false as const,
    canonical: p,
    members: [p],
    typeBadges: [],
  }))
)
const listLoading = ref(false)
const showProviderModal = ref(false)
const editingProvider = ref<ModelProvider | null>(null)
const providerLoading = ref(false)
const testingId = ref<number | null>(null)
const validationState = ref<{ status: 'idle' | 'testing' | 'ok' | 'error'; message: string }>({ status: 'idle', message: '' })
const hiddenKeys = ref<Set<number>>(new Set())

// 模型列表（优先 DB 已录入，其次云商接口）
const providerModelList = ref<string[]>([])
const fetchingModels = ref(false)

// 从 DB 加载指定提供商已录入的模型，有结果返回 true（此时跳过云商接口拉取）
async function loadDbModelsForProvider(providerName: string): Promise<boolean> {
  if (!providerName || providerName === 'custom') return false
  // 优先找系统提供商（tenant_id=0），其次任何同名提供商
  const match = providers.value.find(p => p.name === providerName && p.tenant_id === 0)
    ?? providers.value.find(p => p.name === providerName)
  if (!match) return false
  try {
    const res = await getModels({ provider_id: match.id })
    const names = ((res.data ?? []) as AIModel[]).map(m => m.name)
    if (names.length > 0) {
      providerModelList.value = names
      return true
    }
  } catch { /* 静默失败，回退后续逻辑 */ }
  return false
}

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
  name: '', display_name: '',
  api_endpoint: '', api_key: '', api_secret_key: '', api_version: '', is_active: true,
})

// 提供商模板列表 — 从后端 /model-providers/templates 动态加载，末尾追加"自定义"
type ProviderOption = {
  name: string; label: string; endpoint: string; needsSecretKey: boolean
  noApiKey?: boolean
  staticModels?: string[]
  staticModelsByType?: Record<string, string[]>
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
      ...templates
        .map((t: any) => ({
          name:               t.name,
          label:              t.display_name,
          endpoint:           t.api_endpoint,
          needsSecretKey:     t.needs_secret_key,
          noApiKey:           t.no_api_key ?? false,
          staticModels:       t.static_models,
          staticModelsByType: t.static_models_by_type,
          needsApiVersion:    t.needs_api_version ?? false,
          deploymentBased:    t.deployment_based ?? false,
          apiVersionHint:     t.api_version_hint ?? '',
          configHint:         t.config_hint ?? '',
        }))
        .sort((a: ProviderOption, b: ProviderOption) => a.label.localeCompare(b.label, 'zh')),
      { name: 'custom', label: '自定义', endpoint: '', needsSecretKey: false },
    ]
  } catch {
    // 加载失败时保留默认"自定义"选项，不影响其他功能
  }
}

function getModelsForType(opt: ProviderOption | undefined, type: string, alreadyAdded: Set<string>): string[] {
  const list = opt?.staticModelsByType
    ? (opt.staticModelsByType[type] ?? [])
    : (opt?.staticModels ?? [])
  return list.filter(n => !alreadyAdded.has(n))
}

const filteredProviderOptions = computed(() => {
  const added = new Set(providerGroups.value.map(g => g.canonical.name))
  return PROVIDER_OPTIONS.value.filter(o => !added.has(o.name))
})

// 始终需要 AK/SK 双密钥的提供商（不依赖后端 DB 中的 needs_secret_key 字段）
const HARDCODED_NEEDS_SECRET_KEY = new Set([
  'volcengine-visual', 'doubao-speech-v1', 'kling',
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
    skHint: '豆包语音合成 V1 使用 App ID + Access Token 鉴权，在火山引擎控制台「语音技术」页面获取。注意：_uranus_bigtts 系列音色需使用豆包语音 V3，V1 不支持',
    versionLabel: 'Cluster（集群）',
    versionPlaceholder: 'volcano_tts',
    versionHint: 'volcano_tts：经典音色（BV001_streaming 等）；volcano_mega：月亮系列大模型音色（_moon_bigtts）',
  },
  kling: {
    akLabel: 'Access Key（AK）', akPlaceholder: '可灵 Access Key',
    skLabel: 'Secret Key（SK）', skPlaceholder: '可灵 Secret Key',
    skHint: '可灵一个供应商同时支持视频/音效/语音/图像，使用同一对 AK/SK，通过 JWT（HS256）鉴权',
  },
  'volcengine-i2i': {
    akLabel: 'Access Key（AK）', akPlaceholder: '火山引擎 AccessKey（与 volcengine-visual 共用）',
    skLabel: 'Secret Key（SK）', skPlaceholder: '火山引擎 SecretKey',
    skHint: '即梦AI 图生图与文生图使用相同的 AK/SK，均通过 HMAC-SHA256 签名鉴权',
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

function autoDisplayName() {
  if (editingProvider.value) return
  const name = providerForm.value.name
  if (name) providerForm.value.display_name = name
}

function onProviderSelect() {
  const opt = PROVIDER_OPTIONS.value.find(o => o.name === providerForm.value.name)
  if (!opt || opt.name === 'custom') return
  providerForm.value.api_endpoint = opt.endpoint
  if (opt.apiVersionHint && !providerForm.value.api_version) {
    providerForm.value.api_version = opt.apiVersionHint
  }
  if (opt.staticModels && opt.staticModels.length > 0) {
    providerModelList.value = opt.staticModels
  } else {
    providerModelList.value = []
  }
  autoDisplayName()
}

// 填完端点和 Key 后自动获取模型列表（静默，失败则回退手动输入）
// 优先级：① DB 已录入模型  ② staticModels  ③ 云商 /models 接口
// Ollama：只需端点即可触发（无需 Key）
let _autoFetchTimer: ReturnType<typeof setTimeout> | null = null
watch(
  [() => providerForm.value.api_endpoint, () => providerForm.value.api_key, () => providerForm.value.name],
  async ([endpoint, apiKey, name]) => {
    if (_autoFetchTimer) { clearTimeout(_autoFetchTimer); _autoFetchTimer = null }
    providerModelList.value = []

    // ① DB 优先
    if (await loadDbModelsForProvider(name as string)) return

    // ② 静态模型列表（如 kling、volcengine 等写死在模板里的）
    const opt = PROVIDER_OPTIONS.value.find(o => o.name === name)
    if (opt?.staticModels?.length) {
      providerModelList.value = opt.staticModels
      return
    }

    // ③ 云商接口（需要端点 + Key）
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

const MODEL_TYPE_FILTER: Record<string, { include?: RegExp; exclude?: RegExp }> = {
  llm:       { exclude: /tts|whisper|dall-e|embedding|text-embedding|image-gen|video|audio-gen/i },
  image:     { include: /dall|image|img|draw|flux|stable|wanx|seedream|visual|t2i|text.to.image/i },
  img2img:   { include: /i2i|img2img|seededit|dreamo|seed3l|portrait|inpaint|edit|style|refine/i },
  voice:     { include: /tts|whisper|voice|audio|speech/i },
  video:     { include: /video|sora|kling/i },
  embedding: { include: /embed/i },
  sfx:       { include: /sfx|sound|audio|effect|elevenlabs|\d+s$/i },
}
const filteredProviderModelList = computed(() => providerModelList.value)

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
  'doubao-speech':    'bg-teal-100    text-teal-700',
  'doubao-speech-v1': 'bg-teal-100    text-teal-700',
  kling:              'bg-fuchsia-100 text-fuchsia-700',
  'elevenlabs-sfx':   'bg-green-100   text-green-700',
}
function providerColor(name: string) {
  return PROVIDER_COLORS[name.toLowerCase()] ?? 'bg-gray-100 text-gray-600'
}

// 从模板列表中查找官方展示名（如 "azure" → "Azure OpenAI"）
const providerTemplateNameMap = computed(() => {
  const map: Record<string, string> = {}
  for (const opt of PROVIDER_OPTIONS.value) {
    if (opt.name !== 'custom') map[opt.name] = opt.label
  }
  return map
})
function providerTemplateName(name: string) {
  return providerTemplateNameMap.value[name] ?? name
}

const PROVIDER_CONSOLE_URL: Record<string, string> = {
  // LLM — 国际
  openai:              'https://platform.openai.com/api-keys',
  anthropic:           'https://console.anthropic.com/settings/keys',
  google:              'https://aistudio.google.com/app/apikey',
  xai:                 'https://console.x.ai',
  mistral:             'https://console.mistral.ai/api-keys',
  meta:                'https://llama.meta.com/docs/getting_started',
  // LLM — 国内（doubao 含 Seedance 视频；qianwen 含 CosyVoice/QwenTTS/HappyHorse）
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
  // 可灵（视频/音效/语音/图像共用同一 AK/SK）
  kling:               'https://klingai.com/dev-platform/personal-info',
  // 豆包语音（独立凭证，与 doubao LLM 不同）
  'doubao-speech':     'https://console.volcengine.com/speech/new/overview?projectName=default',
  'doubao-speech-v1':  'https://console.volcengine.com/speech/new/overview?projectName=default',
  'baidu-tts':         'https://ai.baidu.com/tech/speech',
  'minimax-tts':       'https://platform.minimax.chat/user-center/basic-information/interface-key',
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
    // Keep selection if still valid, else auto-select first
    const groups = providerGroups.value
    if (!groups.find(g => g.key === selectedGroupKey.value))
      selectedGroupKey.value = groups[0]?.key ?? null
    // Fire parallel model loads for all groups (non-blocking)
    groups.forEach(g => loadGroupModels(g))
  } catch (e: any) {
    toast.error('加载提供商失败：' + (e.message || ''))
  } finally {
    listLoading.value = false
  }
}

function openAddProvider() {
  editingProvider.value = null
  providerForm.value = { name: '', display_name: '', api_endpoint: '', api_key: '', api_secret_key: '', api_version: '', is_active: true }
  providerModelList.value = []
  validationState.value = { status: 'idle', message: '' }
  showProviderModal.value = true
}
async function openEditProvider(group: ProviderGroup) {
  const p = group.canonical
  editingProvider.value = p
  providerForm.value = {
    name: p.name, display_name: p.display_name || '',
    api_endpoint: p.api_endpoint || '', api_key: '', api_secret_key: '', api_version: p.api_version || '',
    is_active: p.is_active,
  }
  providerModelList.value = []
  validationState.value = { status: 'idle', message: '' }
  showProviderModal.value = true
  await loadDbModelsForProvider(p.name)
}
async function submitProviderForm() {
  if (!providerForm.value.name.trim()) { toast.error('标识名不能为空'); return }
  providerLoading.value = true
  validationState.value = { status: 'idle', message: '' }
  let savedId: number | null = null
  try {
    if (editingProvider.value) {
      const payload: Record<string, unknown> = { ...providerForm.value }
      if (!payload.api_key) delete payload.api_key
      if (!payload.api_secret_key) delete payload.api_secret_key
      const res = await updateProvider(editingProvider.value.id, payload as any)
      savedId = editingProvider.value.id
    } else {
      if (!isNoKeyProvider.value && !providerForm.value.api_key.trim()) { toast.error('新增提供商时 API Key 不能为空'); providerLoading.value = false; return }
      if (selectedProviderNeedsSecretKey.value && !providerForm.value.api_secret_key.trim()) {
        toast.error('该提供商需要 Secret Key（SK）'); providerLoading.value = false; return
      }
      const res = await createProvider(providerForm.value)
      savedId = (res as any)?.data?.id ?? null
    }
    await loadProviders()
  } catch (e: any) {
    providerLoading.value = false
    // 409 冲突：提供商已存在，直接跳转编辑已有记录
    if (e.code === 409 && e.existing_id) {
      await loadProviders()
      const existing = providers.value.find(p => p.id === e.existing_id)
      if (existing) {
        toast.error('该名称的提供商已存在，已自动切换为编辑模式')
        editingProvider.value = existing
        providerForm.value = {
          name: existing.name, display_name: existing.display_name || '',
          api_endpoint: existing.api_endpoint || '', api_key: '', api_secret_key: '',
          api_version: existing.api_version || '', is_active: existing.is_active,
        }
      } else {
        toast.error(e.message || '该名称的提供商已存在，请在列表中找到并编辑')
      }
      return
    }
    toast.error(e.message || '操作失败')
    return
  }
  providerLoading.value = false

  // 自动校验授权信息
  if (savedId && !isNoKeyProvider.value) {
    validationState.value = { status: 'testing', message: '' }
    try {
      const res = await apiTestProvider(savedId)
      const d = (res as any)?.data
      if (d?.status === 'ok') {
        validationState.value = { status: 'ok', message: '授权有效' }
        setTimeout(() => { showProviderModal.value = false }, 1500)
      } else {
        validationState.value = { status: 'error', message: d?.error || '校验失败' }
      }
    } catch (e: any) {
      validationState.value = { status: 'error', message: e.message || '校验请求失败' }
    }
  } else {
    showProviderModal.value = false
  }
}
async function handleDeleteGroup(group: ProviderGroup) {
  const label = providerTemplateName(group.canonical.name)
  if (!confirm(`确认删除 ${label}？此操作不可撤销。`)) return
  try {
    for (const p of group.members) {
      if (p.tenant_id !== 0) await deleteProvider(p.id)
    }
    toast.success('提供商已删除')
    await loadProviders()
  } catch (e: any) { toast.error(e.message || '删除失败') }
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
  const s = new Set(hiddenKeys.value); s.has(id) ? s.delete(id) : s.add(id); hiddenKeys.value = s
}
function maskKey(key?: string) {
  if (!key || key === '****') return '—'
  // Fixed-length mask — does not reveal actual key length
  return '••••••••••••••••'
}

// ═══════════════════════════════════════════════════════════════════════════
// Provider Models — inline model management per provider
// ═══════════════════════════════════════════════════════════════════════════
const { createModel, updateModel, deleteModel } = useModelApi()
const providerModels = ref<Record<number, AIModel[]>>({})
const selectedGroupKey = ref<number | null>(null)
const selectedGroup = computed(() =>
  providerGroups.value.find(g => g.key === selectedGroupKey.value) ?? null
)

const modelFilter = ref<{ type: string; status: 'all' | 'enabled' | 'disabled' }>({ type: '', status: 'all' })

const availableModelTypes = computed(() => {
  if (!selectedGroup.value) return []
  const models = providerModels.value[selectedGroup.value.key] ?? []
  const seen = new Set<string>()
  models.forEach(m => { if (m.type) seen.add(m.type) })
  return [...seen]
})

const filteredGroupModels = computed(() => {
  if (!selectedGroup.value) return []
  const models = providerModels.value[selectedGroup.value.key] ?? []
  return models
    .filter(m => {
      if (modelFilter.value.type && m.type !== modelFilter.value.type) return false
      if (modelFilter.value.status === 'enabled' && !m.is_active) return false
      if (modelFilter.value.status === 'disabled' && m.is_active) return false
      return true
    })
    .sort((a, b) => (b.is_active ? 1 : 0) - (a.is_active ? 1 : 0))
})

function selectGroup(key: number) {
  selectedGroupKey.value = key
  modelFilter.value = { type: '', status: 'all' }
}
function modelTypeSummary(groupKey: number): Record<string, number> {
  const models = (providerModels.value[groupKey] ?? []).filter(m => m.is_active)
  const order = ['llm', 'embedding', 'image', 'img2img', 'video', 'voice', 'sfx', 'music']
  const raw: Record<string, number> = {}
  for (const m of models) { const t = m.type || 'llm'; raw[t] = (raw[t] || 0) + 1 }
  const sorted: Record<string, number> = {}
  for (const t of order) if (raw[t]) sorted[t] = raw[t]
  for (const t of Object.keys(raw)) if (!sorted[t]) sorted[t] = raw[t]
  return sorted
}

const MODEL_TYPE_OPTIONS = [
  { value: 'llm',        label: 'LLM — 大语言模型' },
  { value: 'embedding',  label: 'Embedding — 文本嵌入' },
  { value: 'image',      label: 'Text-to-Image — 文生图' },
  { value: 'img2img',    label: 'Image-to-Image — 图生图' },
  { value: 'video',      label: 'Text-to-Video — 视频生成' },
  { value: 'voice',      label: 'TTS — 语音合成' },
  { value: 'sfx',        label: 'SFX — 文生音效' },
  { value: 'music',      label: 'BGM — 背景音乐' },
]

// Helpers
function fmtCtx(n: number): string {
  if (!n) return ''
  if (n >= 1000) return Math.round(n / 1000) + 'K'
  return String(n)
}
function qualityDots(q: number): boolean[] {
  const filled = Math.round(q * 5)
  return Array.from({ length: 5 }, (_, i) => i < filled)
}
function groupModelsByType(models: AIModel[]): Record<string, AIModel[]> {
  const order = ['llm', 'embedding', 'image', 'img2img', 'video', 'voice', 'sfx', 'music']
  const map: Record<string, AIModel[]> = {}
  for (const m of models) {
    const t = m.type || 'llm'
    if (!map[t]) map[t] = []
    map[t].push(m)
  }
  // Sort by canonical order, unknown types at end
  const sorted: Record<string, AIModel[]> = {}
  for (const t of order) if (map[t]) sorted[t] = map[t]
  for (const t of Object.keys(map)) if (!sorted[t]) sorted[t] = map[t]
  return sorted
}
const TYPE_BADGE_COLORS: Record<string, string> = {
  llm:       'bg-blue-50  dark:bg-blue-900/30  text-blue-600  dark:text-blue-400',
  embedding: 'bg-cyan-50  dark:bg-cyan-900/30  text-cyan-600  dark:text-cyan-400',
  image:     'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
  img2img:   'bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400',
  video:     'bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
  voice:     'bg-teal-50  dark:bg-teal-900/30  text-teal-600  dark:text-teal-400',
  sfx:       'bg-pink-50  dark:bg-pink-900/30  text-pink-600  dark:text-pink-400',
  music:     'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
}
function typeBadgeColor(t: string) {
  return TYPE_BADGE_COLORS[t] ?? 'bg-gray-100 dark:bg-gray-700/60 text-gray-500 dark:text-gray-400'
}

// Per-group model loading state
const modelsLoading = ref<Set<number>>(new Set())
async function loadGroupModels(group: ProviderGroup) {
  modelsLoading.value = new Set([...modelsLoading.value, group.key])
  try {
    const allModels: AIModel[] = []
    for (const p of group.members) {
      const res = await getModels({ provider_id: p.id })
      allModels.push(...(((res as any).data as AIModel[]) || []))
    }
    providerModels.value = { ...providerModels.value, [group.key]: allModels }
  } catch { /* silent - background load */ } finally {
    const s = new Set(modelsLoading.value); s.delete(group.key); modelsLoading.value = s
  }
}

// Edit-model modal state
const editModelModal = ref<{
  show: boolean
  saving: boolean
  groupKey: number
  modelId: number
  name: string
  availableModels: string[]
  displayName: string
  type: string
  maxTokens: number
  quality: number
  timeout: number
  concurrency: number
  rateLimit: number
}>({ show: false, saving: false, groupKey: 0, modelId: 0, name: '', availableModels: [], displayName: '', type: '', maxTokens: 0, quality: 0.8, timeout: 0, concurrency: 0, rateLimit: 0 })

function openEditModel(groupKey: number, m: AIModel) {
  const group = providerGroups.value.find(g => g.key === groupKey)
  const opt = group ? PROVIDER_OPTIONS.value.find(o => o.name === group.canonical.name) : null
  const loadedModels = providerModels.value[groupKey] ?? []
  const otherNames = new Set(loadedModels.filter(lm => lm.id !== m.id).map(lm => lm.name))
  const available = getModelsForType(opt, m.type ?? 'llm', otherNames)
  editModelModal.value = {
    show: true, saving: false, groupKey, modelId: m.id,
    name: m.name ?? '',
    availableModels: available,
    displayName: m.display_name ?? '',
    type: m.type ?? 'llm',
    maxTokens: m.max_tokens ?? 0,
    quality: m.quality ?? 0.8,
    timeout: (m as any).timeout ?? 0,
    concurrency: (m as any).concurrency ?? 0,
    rateLimit: (m as any).rate_limit ?? 0,
  }
}
function closeEditModel() { editModelModal.value.show = false }
async function handleEditModel() {
  const e = editModelModal.value
  e.saving = true
  try {
    const updated = await updateModel(e.modelId, {
      name: e.name.trim() || undefined,
      display_name: e.displayName,
      type: e.type,
      max_tokens: e.maxTokens || undefined,
      quality: e.quality > 0 ? e.quality : undefined,
      timeout: e.timeout || undefined,
      concurrency: e.concurrency || undefined,
      rate_limit: e.rateLimit || undefined,
    })
    const models = providerModels.value[e.groupKey]
    if (models) {
      const idx = models.findIndex(m => m.id === e.modelId)
      if (idx !== -1 && updated?.data) models[idx] = updated.data
    }
    toast.success('模型已更新')
    closeEditModel()
  } catch (err: any) {
    toast.error(err.message || '保存失败')
  } finally {
    e.saving = false
  }
}

// Add-model modal state
const addModelModal = ref<{
  show: boolean
  providerId: number
  groupKey: number
  providerName: string
  name: string
  displayName: string
  type: string
  quality: number
  maxTokens: number
  timeout: number
  concurrency: number
  rateLimit: number
  saving: boolean
  loadingModels: boolean
  availableModels: string[]
}>({ show: false, providerId: 0, groupKey: 0, providerName: '', name: '', displayName: '', type: '', quality: 0.8, maxTokens: 0, timeout: 0, concurrency: 0, rateLimit: 0, saving: false, loadingModels: false, availableModels: [] })

async function refreshGroupModels(group: ProviderGroup) {
  try {
    const allModels: AIModel[] = []
    for (const p of group.members) {
      const res = await getModels({ provider_id: p.id })
      allModels.push(...(((res as any).data as AIModel[]) || []))
    }
    providerModels.value = { ...providerModels.value, [group.key]: allModels }
  } catch (e: any) {
    toast.error('操作失败：' + (e?.message || '未知错误'))
  }
}

async function openAddModelForm(group: ProviderGroup) {
  const loadedModels = providerModels.value[group.key] ?? []
  const existingType = loadedModels.find(m => m.type)?.type ?? 'llm'
  const opt = PROVIDER_OPTIONS.value.find(o => o.name === group.canonical.name)
  const alreadyAdded = new Set(loadedModels.map(m => m.name))
  const initialModels = getModelsForType(opt, existingType, alreadyAdded)

  // ollama 支持实时拉取，openai 有静态列表（不需要再调 live API）
  const supportsLiveModels = group.canonical.name === 'ollama'

  addModelModal.value = {
    show: true, providerId: group.canonical.id, groupKey: group.key,
    providerName: group.canonical.name,
    name: '', displayName: '', type: existingType,
    quality: 0.8, maxTokens: 0, timeout: 0, concurrency: 0, rateLimit: 0, saving: false,
    loadingModels: supportsLiveModels,
    availableModels: initialModels,
  }

  if (supportsLiveModels) {
    try {
      const res = await fetchProviderModels({ provider_id: group.canonical.id })
      const fetched = res.data?.models ?? []
      const merged = [...new Set([...initialModels, ...fetched])].filter(n => !alreadyAdded.has(n))
      if (addModelModal.value.show) addModelModal.value.availableModels = merged
    } catch { /* 静默失败，保留静态列表 */ } finally {
      if (addModelModal.value.show) addModelModal.value.loadingModels = false
    }
  }
}

watch(() => addModelModal.value.type, (newType) => {
  if (!addModelModal.value.show) return
  const loadedModels = providerModels.value[addModelModal.value.groupKey] ?? []
  const alreadyAdded = new Set(loadedModels.map(m => m.name))
  const opt = PROVIDER_OPTIONS.value.find(o => o.name === addModelModal.value.providerName)
  addModelModal.value.availableModels = getModelsForType(opt, newType, alreadyAdded)
  addModelModal.value.name = ''
})

function closeAddModelModal() {
  addModelModal.value.show = false
}

async function handleCreateModelModal() {
  const m = addModelModal.value
  if (!m.name.trim()) return
  m.saving = true
  const typeToTask: Record<string, string> = {
    llm: 'chapter', embedding: 'embedding', image: 'image_gen', img2img: 'img2img_gen',
    video: 'video_gen', voice: 'voice_gen', sfx: 'sfx_gen', music: 'music_gen',
  }
  try {
    const tasksJson = JSON.stringify([typeToTask[m.type] || 'chapter'])
    await createModel({
      provider_id: m.providerId,
      model_id: m.name.trim(),
      name: m.name.trim(),
      display_name: m.name.trim(),
      task_types: tasksJson,
      type: m.type || undefined,
      quality: m.quality || undefined,
      max_tokens: m.maxTokens || undefined,
      timeout: m.timeout || undefined,
      concurrency: m.concurrency || undefined,
      rate_limit: m.rateLimit || undefined,
    })
    toast.success('模型已添加')
    closeAddModelModal()
    const group = providerGroups.value.find(g => g.key === m.groupKey)
    if (group) await refreshGroupModels(group)
  } catch (e: any) {
    toast.error(e.message || '添加失败')
  } finally {
    m.saving = false
  }
}

async function handleDeleteModel(groupKey: number, modelId: number) {
  if (!confirm('确认删除该模型？')) return
  try {
    await deleteModel(modelId)
    toast.success('模型已删除')
    const group = providerGroups.value.find(g => g.key === groupKey)
    if (group) await refreshGroupModels(group)
  } catch (e: any) {
    toast.error(e.message || '删除失败')
  }
}

async function handleToggleModel(groupKey: number, model: AIModel) {
  const newActive = !model.is_active
  try {
    await updateModel(model.id, { is_active: newActive })
    // Optimistically update local state
    const models = providerModels.value[groupKey]
    if (models) {
      const m = models.find(m => m.id === model.id)
      if (m) m.is_active = newActive
    }
  } catch (e: any) {
    toast.error(e.message || '操作失败')
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
// ── lifecycle ────────────────────────────────────────────────────────────────
onMounted(() => {
  loadProviderTemplates()
  loadProviders()
  if (activeTab.value === 'mcp') loadMcpTools()
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
      <button
        v-if="activeTab === 'mcp'"
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

      <div v-else-if="providerGroups.length === 0" class="card p-12 text-center">
        <div class="mx-auto w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18"/>
          </svg>
        </div>
        <h3 class="text-base font-semibold text-gray-900 dark:text-white mb-1">暂无已配置的提供商</h3>
        <p class="text-sm text-gray-500 mb-6">添加提供商后，AI 生成将优先使用您配置的密钥</p>
        <button class="btn-primary mx-auto" @click="openAddProvider">立即添加</button>
      </div>

      <div v-else class="flex gap-0 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden" style="min-height:540px">

        <!-- ═══ LEFT: Provider list ═══ -->
        <div class="w-64 shrink-0 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden bg-white dark:bg-gray-900">
          <!-- Column header -->
          <div class="px-3 py-2.5 border-b border-gray-100 dark:border-gray-700/60 flex items-center justify-between bg-gray-50/80 dark:bg-gray-800/60">
            <span class="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
              供应商
              <span class="ml-1 font-mono font-normal normal-case text-gray-400">{{ providerGroups.length }}</span>
            </span>
            <button class="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white transition-colors shadow ring-1 ring-primary-500"
                    @click="openAddProvider">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
              </svg>
              添加供应商
            </button>
          </div>
          <!-- List -->
          <div class="flex-1 overflow-y-auto">
            <button v-for="group in providerGroups" :key="group.key"
                    class="w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors relative border-b border-gray-100 dark:border-gray-700/40 last:border-b-0"
                    :class="selectedGroupKey === group.key
                      ? 'bg-blue-50 dark:bg-blue-900/20'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/40'"
                    @click="selectGroup(group.key)">
              <!-- Active indicator bar -->
              <span v-if="selectedGroupKey === group.key"
                    class="absolute left-0 top-0 bottom-0 w-0.5 bg-blue-500"></span>
              <!-- Logo -->
              <div class="w-7 h-7 rounded-md flex items-center justify-center shrink-0 overflow-hidden"
                   :class="providerColor(group.canonical.name)">
                <ProviderLogo :name="group.canonical.name" class="w-4 h-4" />
              </div>
              <!-- Info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 min-w-0">
                  <span class="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                    {{ providerTemplateName(group.canonical.name) }}
                  </span>
                </div>
                <!-- Type summary badges -->
                <div class="mt-0.5 flex flex-wrap gap-1">
                  <template v-if="modelsLoading.has(group.key)">
                    <div class="h-3.5 w-14 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
                  </template>
                  <template v-else-if="Object.keys(modelTypeSummary(group.key)).length">
                    <span v-for="(cnt, mtype) in modelTypeSummary(group.key)" :key="mtype"
                          class="px-1 py-0 text-xs font-mono font-semibold rounded leading-5"
                          :class="typeBadgeColor(String(mtype))">
                      {{ TYPE_LABELS[String(mtype)] || mtype }}×{{ cnt }}
                    </span>
                  </template>
                  <span v-else class="text-xs text-gray-400">暂无模型</span>
                </div>
              </div>
            </button>
          </div>
        </div>

        <!-- ═══ RIGHT: Provider detail ═══ -->
        <div class="flex-1 overflow-y-auto bg-white dark:bg-gray-900">

          <!-- No selection -->
          <div v-if="!selectedGroup" class="h-full flex items-center justify-center">
            <div class="text-center text-gray-400">
              <svg class="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M4 7v10c0 2 1 3 3 3h10c2 0 3-1 3-3V7c0-2-1-3-3-3H7C5 4 4 5 4 7z"/>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1" d="M9 12h6M12 9v6"/>
              </svg>
              <p class="text-sm">从左侧选择提供商</p>
            </div>
          </div>

          <template v-else>
            <!-- ── 供应商 header ── -->
            <div class="px-6 py-4 flex items-center gap-4 border-b border-gray-100 dark:border-gray-700/50">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden"
                   :class="providerColor(selectedGroup.canonical.name)">
                <ProviderLogo :name="selectedGroup.canonical.name" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                  <h2 class="font-semibold text-base text-gray-900 dark:text-white">
                    {{ providerTemplateName(selectedGroup.canonical.name) }}
                  </h2>
                  <span v-if="selectedGroup.canonical.tenant_id === 0"
                        class="px-1.5 py-0.5 text-xs rounded bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-700">系统</span>
                </div>
                <div class="mt-0.5 flex items-center gap-1.5 text-xs text-gray-400">
                  <svg class="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9"/>
                  </svg>
                  <code class="truncate">{{ selectedGroup.canonical.api_endpoint || '—' }}</code>
                </div>
              </div>
              <!-- Actions -->
              <div class="flex items-center gap-1 shrink-0">
                <a v-if="providerConsoleUrl(selectedGroup.canonical.name)"
                   :href="providerConsoleUrl(selectedGroup.canonical.name)" target="_blank" rel="noopener noreferrer"
                   class="p-1.5 rounded text-gray-400 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="官方控制台">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                  </svg>
                </a>
                <button class="p-1.5 rounded text-gray-400 hover:text-green-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        :disabled="testingId === selectedGroup.canonical.id"
                        title="测试连接"
                        @click="handleTestProvider(selectedGroup.canonical.id)">
                  <svg v-if="testingId === selectedGroup.canonical.id" class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                  </svg>
                </button>
                <button class="p-1.5 rounded text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="编辑"
                        @click="openEditProvider(selectedGroup)">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                  </svg>
                </button>
                <button class="p-1.5 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="删除"
                        :disabled="selectedGroup.members.every(m => m.tenant_id === 0)"
                        @click="handleDeleteGroup(selectedGroup)">
                  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                  </svg>
                </button>
              </div>
            </div>

            <!-- ── 凭证行 ── -->
            <div v-if="selectedGroup.canonical.name === 'ollama'"
                 class="px-6 py-2.5 border-b border-gray-100 dark:border-gray-700/50 bg-emerald-50/60 dark:bg-emerald-900/10 flex items-center gap-2">
              <svg class="w-3.5 h-3.5 text-emerald-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
              <span class="text-xs text-emerald-700 dark:text-emerald-300">本地服务 · 无需 API Key</span>
            </div>
            <div v-else class="px-6 py-2.5 border-b border-gray-100 dark:border-gray-700/50 bg-gray-50/40 dark:bg-gray-800/20 flex items-center gap-3">
              <svg class="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"/>
              </svg>
              <span class="text-xs text-gray-500 shrink-0">API Key</span>
              <code class="text-xs font-mono flex-1 text-gray-600 dark:text-gray-400 tracking-wider truncate">
                {{ maskKey(selectedGroup.canonical.api_key) }}
              </code>
              <button class="text-xs text-primary-600 hover:text-primary-700 shrink-0"
                      @click="openEditProvider(selectedGroup)">更改密钥</button>
            </div>


            <!-- ── 模型区域 header ── -->
            <div class="px-6 py-3 border-b border-gray-100 dark:border-gray-700/50 flex items-center justify-between">
              <h3 class="text-sm font-semibold text-gray-700 dark:text-gray-300">
                模型
                <span v-if="providerModels[selectedGroup.key]?.length"
                      class="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 font-mono">
                  {{ filteredGroupModels.length }}<template v-if="filteredGroupModels.length !== (providerModels[selectedGroup.key]?.length ?? 0)">/{{ providerModels[selectedGroup.key]?.length }}</template>
                </span>
              </h3>
              <button class="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white transition-colors shadow-sm"
                      @click="openAddModelForm(selectedGroup)">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                </svg>
                添加模型
              </button>
            </div>

            <!-- 模型加载骨架 -->
            <div v-if="modelsLoading.has(selectedGroup.key)" class="px-6 py-5 space-y-3">
              <div v-for="i in 4" :key="i" class="flex items-center gap-4 animate-pulse">
                <div class="w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700"></div>
                <div class="h-4 rounded bg-gray-200 dark:bg-gray-700" :style="{ width: i % 2 === 0 ? '40%' : '55%' }"></div>
                <div class="h-4 w-12 rounded bg-gray-200 dark:bg-gray-700 ml-auto"></div>
                <div class="h-4 w-8 rounded bg-gray-200 dark:bg-gray-700"></div>
              </div>
            </div>

            <!-- 模型空状态 -->
            <div v-else-if="!providerModels[selectedGroup.key]?.length"
                 class="px-6 py-16 text-center">
              <p class="text-sm text-gray-400 italic mb-4">暂无模型 · 添加后可在任务配置中选用</p>
              <button class="btn-primary text-sm px-5 py-2" @click="openAddModelForm(selectedGroup)">
                + 添加第一个模型
              </button>
            </div>

            <!-- 模型表格 -->
            <table v-else class="w-full text-sm">
              <thead>
                <tr class="border-b border-gray-100 dark:border-gray-700/50 text-xs text-gray-500 dark:text-gray-400 bg-gray-50/60 dark:bg-gray-800/30">
                  <th class="px-6 py-2 text-left font-medium w-8"></th>
                  <th class="px-3 py-2 text-left font-medium">模型名称</th>
                  <!-- 类型列：含下拉筛选 -->
                  <th class="px-3 py-2 text-left font-medium w-36">
                    <select v-model="modelFilter.type"
                            class="w-full text-xs font-medium bg-transparent border-0 cursor-pointer focus:outline-none focus:ring-0 text-gray-500 dark:text-gray-400"
                            :class="modelFilter.type ? 'text-primary-600 dark:text-primary-400' : ''">
                      <option value="">类型</option>
                      <option v-for="t in availableModelTypes" :key="t" :value="t">{{ TYPE_LABELS[t] || t }}</option>
                    </select>
                  </th>
                  <th class="px-3 py-2 text-right font-medium w-24">上下文</th>
                  <th class="px-3 py-2 text-left font-medium w-28">质量</th>
                  <!-- 启用列：含状态筛选 -->
                  <th class="px-3 py-2 text-center font-medium w-28">
                    <select v-model="modelFilter.status"
                            class="w-full text-xs font-medium bg-transparent border-0 cursor-pointer focus:outline-none focus:ring-0 text-gray-500 dark:text-gray-400 text-center"
                            :class="modelFilter.status !== 'all' ? 'text-primary-600 dark:text-primary-400' : ''">
                      <option value="all">全部</option>
                      <option value="enabled">已启用</option>
                      <option value="disabled">已禁用</option>
                    </select>
                  </th>
                  <th class="px-3 py-2 text-right font-medium w-20"></th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 dark:divide-gray-700/30">
                <tr v-for="m in filteredGroupModels" :key="m.id || ('v-' + m.name)"
                    class="group/row transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/30"
                    :class="!m.is_active ? 'opacity-50' : ''">
                  <!-- 状态点 -->
                  <td class="px-6 py-3">
                    <span class="block w-1.5 h-1.5 rounded-full mx-auto"
                          :class="m.is_active ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'"></span>
                  </td>
                  <!-- 模型名 + 显示名 -->
                  <td class="px-3 py-3">
                    <code class="font-mono text-gray-800 dark:text-gray-200">{{ m.name }}</code>
                    <div v-if="m.display_name && m.display_name !== m.name"
                         class="text-gray-400 dark:text-gray-500 text-xs mt-0.5 truncate max-w-xs">
                      {{ m.display_name }}
                    </div>
                  </td>
                  <!-- 类型 -->
                  <td class="px-3 py-3">
                    <span v-if="m.type" class="px-2 py-0.5 rounded text-xs font-mono font-semibold"
                          :class="typeBadgeColor(m.type)">
                      {{ TYPE_LABELS[m.type] || m.type }}
                    </span>
                  </td>
                  <!-- 上下文 -->
                  <td class="px-3 py-3 text-right">
                    <span v-if="m.max_tokens" class="font-mono text-xs text-gray-500 dark:text-gray-400">{{ fmtCtx(m.max_tokens) }}</span>
                    <span v-else class="text-gray-300 dark:text-gray-600 text-xs">—</span>
                  </td>
                  <!-- 质量 -->
                  <td class="px-3 py-3">
                    <span v-if="m.quality > 0" class="inline-flex gap-0.5 items-center">
                      <span v-for="(filled, qi) in qualityDots(m.quality)" :key="qi"
                            class="w-1.5 h-1.5 rounded-full"
                            :class="filled ? 'bg-emerald-400' : 'bg-gray-200 dark:bg-gray-700'" />
                    </span>
                    <span v-else class="text-gray-300 dark:text-gray-600 text-xs">—</span>
                  </td>
                  <!-- 启用 -->
                  <td class="px-3 py-3 text-center">
                    <template v-if="m.id">
                      <button type="button" role="switch" :aria-checked="m.is_active"
                              class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-150 focus:outline-none"
                              :class="m.is_active ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'"
                              @click="handleToggleModel(selectedGroup.key, m)">
                        <span class="inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform duration-150"
                              :class="m.is_active ? 'translate-x-4' : 'translate-x-0'"></span>
                      </button>
                    </template>
                    <span v-else class="text-xs text-gray-400 dark:text-gray-600">—</span>
                  </td>
                  <!-- 操作 -->
                  <td class="px-3 py-3 text-right">
                    <template v-if="m.id">
                      <span class="inline-flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity">
                        <button class="p-1 rounded text-gray-400 hover:text-blue-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                aria-label="编辑" @click="openEditModel(selectedGroup.key, m)">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
                          </svg>
                        </button>
                        <button class="p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                aria-label="删除" @click="handleDeleteModel(selectedGroup.key, m.id)">
                          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
                          </svg>
                        </button>
                      </span>
                    </template>
                    <span v-else class="text-xs text-gray-400 dark:text-gray-600 opacity-0 group-hover/row:opacity-100">音色</span>
                  </td>
                </tr>
              </tbody>
            </table>

          </template>
        </div>

      </div>

      <!-- Add Model Modal (inside providers template to keep v-else-if chain intact) -->
      <Teleport to="body">
        <div v-if="addModelModal.show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="closeAddModelModal">
          <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">添加模型</h3>

            <!-- 模型类型 -->
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">模型类型</label>
              <select v-model="addModelModal.type" class="input text-sm w-full">
                <option v-for="t in MODEL_TYPE_OPTIONS" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
            </div>

            <!-- 模型名 -->
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                模型名称 <span class="text-red-500">*</span>
                <span v-if="addModelModal.loadingModels" class="ml-1 text-gray-400 font-normal">（加载中…）</span>
                <span v-else-if="addModelModal.availableModels.length" class="ml-1 text-gray-400 font-normal">（{{ addModelModal.availableModels.length }} 个可选）</span>
              </label>
              <!-- 有模型列表：下拉选择 -->
              <select
                v-if="!addModelModal.loadingModels && addModelModal.availableModels.length"
                v-model="addModelModal.name"
                class="input text-sm w-full"
                @keydown.enter="handleCreateModelModal"
              >
                <option value="">请选择模型…</option>
                <option v-for="m in addModelModal.availableModels" :key="m" :value="m">{{ m }}</option>
              </select>
              <!-- 无列表或加载中：手动输入 -->
              <input
                v-else
                v-model="addModelModal.name"
                type="text"
                class="input text-sm w-full"
                placeholder="如 gpt-4o、claude-3-5-sonnet-20241022"
                autocomplete="off"
                @keydown.enter="handleCreateModelModal"
              />
            </div>

            <!-- 2-column grid -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">质量评分</label>
                <input v-model.number="addModelModal.quality" type="number" min="0" max="1" step="0.01" class="input text-sm w-full" placeholder="0" />
                <p class="mt-0.5 text-xs text-gray-400">0–1，选模优先级</p>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">请求超时（秒）</label>
                <input v-model.number="addModelModal.timeout" type="number" min="0" class="input text-sm w-full" placeholder="0" />
                <p class="mt-0.5 text-xs text-gray-400">0 = 默认 300s</p>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">最大并发数</label>
                <input v-model.number="addModelModal.concurrency" type="number" min="0" class="input text-sm w-full" placeholder="0" />
                <p class="mt-0.5 text-xs text-gray-400">0 = 不限制</p>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">限速（次/分）</label>
                <input v-model.number="addModelModal.rateLimit" type="number" min="0" class="input text-sm w-full" placeholder="0" />
                <p class="mt-0.5 text-xs text-gray-400">0 = 不限制</p>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">最大 Tokens</label>
                <input v-model.number="addModelModal.maxTokens" type="number" min="0" class="input text-sm w-full" placeholder="0" />
                <p class="mt-0.5 text-xs text-gray-400">0 = 模型默认</p>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex justify-end gap-2 pt-1">
              <button class="btn-ghost text-sm px-4 py-2" @click="closeAddModelModal">取消</button>
              <button class="btn-primary text-sm px-4 py-2" :disabled="addModelModal.saving || !addModelModal.name.trim()" @click="handleCreateModelModal">
                {{ addModelModal.saving ? '保存中...' : '添加' }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- Edit Model Modal -->
      <Teleport to="body">
        <div v-if="editModelModal.show" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" @click.self="closeEditModel">
          <div class="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4">
            <h3 class="text-base font-semibold text-gray-900 dark:text-white">编辑模型</h3>

            <!-- 模型名称 -->
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">模型名称 <span class="text-red-500">*</span></label>
              <input
                v-model="editModelModal.name"
                list="edit-model-datalist"
                type="text"
                class="input text-sm w-full"
                placeholder="如 gpt-4o、claude-3-5-sonnet-20241022"
                autocomplete="off"
              />
              <datalist id="edit-model-datalist">
                <option v-for="m in editModelModal.availableModels" :key="m" :value="m" />
              </datalist>
            </div>

            <!-- 显示名称 -->
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">显示名称</label>
              <input v-model="editModelModal.displayName" type="text" class="input text-sm w-full" placeholder="用户友好的名称，如 GPT-4o" />
            </div>

            <!-- 模型类型 -->
            <div>
              <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">模型类型</label>
              <select v-model="editModelModal.type" class="input text-sm w-full">
                <option v-for="t in MODEL_TYPE_OPTIONS" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
            </div>

            <!-- 参数网格 (2列) -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">质量评分</label>
                <input v-model.number="editModelModal.quality" type="number" min="0" max="1" step="0.01" class="input text-sm w-full" placeholder="0" />
                <p class="mt-0.5 text-xs text-gray-400">0–1，选模优先级</p>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">请求超时（秒）</label>
                <input v-model.number="editModelModal.timeout" type="number" min="0" class="input text-sm w-full" placeholder="0" />
                <p class="mt-0.5 text-xs text-gray-400">0 = 默认 300s</p>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">最大并发数</label>
                <input v-model.number="editModelModal.concurrency" type="number" min="0" class="input text-sm w-full" placeholder="0" />
                <p class="mt-0.5 text-xs text-gray-400">0 = 不限制</p>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">限速（次/分）</label>
                <input v-model.number="editModelModal.rateLimit" type="number" min="0" class="input text-sm w-full" placeholder="0" />
                <p class="mt-0.5 text-xs text-gray-400">0 = 不限制</p>
              </div>
              <div>
                <label class="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">最大 Tokens</label>
                <input v-model.number="editModelModal.maxTokens" type="number" min="0" class="input text-sm w-full" placeholder="0" />
                <p class="mt-0.5 text-xs text-gray-400">0 = 模型默认</p>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex justify-end gap-2 pt-1">
              <button class="btn-ghost text-sm px-4 py-2" @click="closeEditModel">取消</button>
              <button class="btn-primary text-sm px-4 py-2" :disabled="editModelModal.saving" @click="handleEditModel">
                {{ editModelModal.saving ? '保存中...' : '保存' }}
              </button>
            </div>
          </div>
        </div>
      </Teleport>

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
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  提供商 <span class="text-red-500">*</span>
                  <span class="text-xs text-gray-400 font-normal ml-1">（唯一标识，创建后不可修改）</span>
                </label>
                <div v-if="editingProvider" class="input bg-gray-50 dark:bg-gray-900 text-gray-500 cursor-not-allowed">
                  {{ providerTemplateName(editingProvider.name) }}
                  <span class="ml-2 text-xs font-mono opacity-60">{{ editingProvider.name }}</span>
                </div>
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
              <div v-if="credentialMeta.versionLabel">
                <div class="flex items-center justify-between mb-1.5">
                  <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">{{ credentialMeta.versionLabel }}</label>
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
            </div>
            <div class="px-6 py-4 flex items-center justify-between gap-3 border-t border-gray-100 dark:border-gray-700 shrink-0">
              <!-- 校验状态 -->
              <div class="flex-1 min-w-0">
                <div v-if="validationState.status === 'testing'" class="flex items-center gap-1.5 text-sm text-gray-500">
                  <svg class="w-4 h-4 animate-spin shrink-0" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                  校验授权中...
                </div>
                <div v-else-if="validationState.status === 'ok'" class="flex items-center gap-1.5 text-sm text-green-600 dark:text-green-400">
                  <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/></svg>
                  授权有效，即将关闭
                </div>
                <div v-else-if="validationState.status === 'error'" class="flex items-start gap-1.5 text-sm text-red-600 dark:text-red-400">
                  <svg class="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                  <span class="truncate">{{ validationState.message }}</span>
                </div>
              </div>
              <div class="flex gap-3 shrink-0">
                <button class="btn-outline" @click="showProviderModal = false">取消</button>
                <button class="btn-primary min-w-[80px]" :disabled="providerLoading || validationState.status === 'testing'" @click="submitProviderForm">
                  <span v-if="providerLoading" class="flex items-center gap-1.5">
                    <svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"/><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                    保存中...
                  </span>
                  <span v-else>{{ editingProvider ? '保存更改' : '添加' }}</span>
                </button>
              </div>
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
                    <span v-if="model.type" class="truncate max-w-[100px]">
                      {{ model.type }}
                    </span>
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
