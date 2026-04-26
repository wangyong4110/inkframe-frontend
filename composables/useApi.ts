import type {
  Novel,
  Chapter,
  Character,
  Worldview,
  WorldviewEntity,
  Video,
  StoryboardShot,
  AIModel,
  ModelProvider,
  McpTool,
  QualityReport,
  Item,
  EffectiveItem,
  CreateNovelForm,
  CreateChapterForm,
  CreateCharacterForm,
  CreateWorldviewForm,
  ApiResponse,
} from '~/types'

export const useApi = () => {
  const config = useRuntimeConfig()
  const apiBase = config.public.apiBase

  const getAuthHeader = (): Record<string, string> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : ''
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const request = async <T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> => {
    const url = `${apiBase}${endpoint}`

    const defaultOptions: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120_000)

    let response: Response
    try {
      response = await fetch(url, {
        ...defaultOptions,
        ...options,
        headers: {
          ...((defaultOptions.headers as Record<string, string>) || {}),
          ...((options.headers as Record<string, string>) || {}),
        },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }))
      throw new Error(error.message || `HTTP error ${response.status}`)
    }

    return response.json()
  }

  const requestBlob = async (endpoint: string, options: RequestInit = {}): Promise<Blob> => {
    const url = `${apiBase}${endpoint}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120_000)

    let response: Response
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          ...getAuthHeader(),
          ...((options.headers as Record<string, string>) || {}),
        },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`)
    }

    return response.blob()
  }

  // Upload a single file as multipart/form-data and return response.data.
  const requestMultipart = async <T>(endpoint: string, file: File): Promise<T> => {
    const form = new FormData()
    form.append('file', file)
    const res = await fetch(`${apiBase}${endpoint}`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: form,
    })
    const json = await res.json().catch(() => ({ message: 'Upload failed' }))
    if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`)
    return json.data
  }

  return {
    request,
    requestBlob,
    requestMultipart,
  }
}

// Novel API
export const useNovelApi = () => {
  const { request } = useApi()

  const getNovels = (params?: {
    page?: number
    page_size?: number
    status?: string
    genre?: string
  }) => {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.page_size) searchParams.set('page_size', params.page_size.toString())
    if (params?.status) searchParams.set('status', params.status)
    if (params?.genre) searchParams.set('genre', params.genre)

    const query = searchParams.toString()
    return request<ApiResponse<{ items: Novel[], total: number, page: number, page_size: number, total_page: number }>>(`/novels${query ? `?${query}` : ''}`)
  }

  const getNovel = (id: number) =>
    request<ApiResponse<Novel>>(`/novels/${id}`)

  const createNovel = (data: CreateNovelForm) =>
    request<ApiResponse<Novel>>('/novels', {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const updateNovel = (id: number, data: Partial<Novel>) =>
    request<ApiResponse<Novel>>(`/novels/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteNovel = (id: number) =>
    request<void>(`/novels/${id}`, { method: 'DELETE' })

  const generateOutline = (id: number, data: {
    chapter_num: number
    prompt?: string
    keywords?: string[]
  }) =>
    request<ApiResponse<{ title: string; chapters: any[] }>>(`/novels/${id}/outline`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

  return {
    getNovels,
    getNovel,
    createNovel,
    updateNovel,
    deleteNovel,
    generateOutline,
  }
}

// Chapter API
export const useChapterApi = () => {
  const { request } = useApi()

  const getChapters = (novelId: number) =>
    request<ApiResponse<Chapter[]>>(`/novels/${novelId}/chapters`)

  const getChapter = (novelId: number, chapterNo: number) =>
    request<ApiResponse<Chapter>>(`/novels/${novelId}/chapters/${chapterNo}`)

  const createChapter = (novelId: number, data: CreateChapterForm) =>
    request<ApiResponse<Chapter>>(`/novels/${novelId}/chapters`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const updateChapter = (novelId: number, chapterNo: number, data: Partial<Chapter>) =>
    request<ApiResponse<Chapter>>(`/novels/${novelId}/chapters/${chapterNo}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteChapter = (novelId: number, chapterNo: number) =>
    request<void>(`/novels/${novelId}/chapters/${chapterNo}`, { method: 'DELETE' })

  const generateChapter = (novelId: number, data: {
    chapter_no: number
    prompt?: string
    max_tokens?: number
    model?: string
  }) =>
    request<ApiResponse<{ task_id: string }>>(`/novels/${novelId}/chapters/generate`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const getChapterGenStatus = (novelId: number, taskId: string) =>
    request<ApiResponse<{
      task_id: string
      status: 'pending' | 'running' | 'completed' | 'failed'
      chapter?: Chapter
      model_used?: string
      error?: string
    }>>(`/novels/${novelId}/chapters/generate/${taskId}`)

  return {
    getChapters,
    getChapter,
    createChapter,
    updateChapter,
    deleteChapter,
    generateChapter,
    getChapterGenStatus,
  }
}

// Character API
export const useCharacterApi = () => {
  const { request, requestMultipart } = useApi()

  const getCharacters = (novelId: number) =>
    request<ApiResponse<Character[]>>(`/novels/${novelId}/characters`)

  const getCharacter = (id: number) =>
    request<ApiResponse<Character>>(`/characters/${id}`)

  const createCharacter = (novelId: number, data: CreateCharacterForm) =>
    request<ApiResponse<Character>>(`/novels/${novelId}/characters`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const updateCharacter = (id: number, data: Partial<Character>) =>
    request<ApiResponse<Character>>(`/characters/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteCharacter = (id: number) =>
    request<void>(`/characters/${id}`, { method: 'DELETE' })

  const generateCharacterProfile = (novelId: number, description: string) =>
    request<ApiResponse<Character>>(`/novels/${novelId}/characters/generate`, {
      method: 'POST',
      body: JSON.stringify({ description }),
    })

  const generateThreeView = (id: number, viewType: 'front' | 'side' | 'back' | 'all', style?: string, provider?: string) =>
    request<ApiResponse<{ task_id: string }>>(`/characters/${id}/three-view`, {
      method: 'POST',
      body: JSON.stringify({ view_type: viewType, style: style ?? '', provider: provider ?? '' }),
    })

  const getThreeViewTaskStatus = (id: number, taskId: string) =>
    request<ApiResponse<{
      task_id: string
      status: 'pending' | 'running' | 'completed' | 'failed'
      character?: Character
      generated?: Record<string, string>
      error?: string
    }>>(`/characters/${id}/three-view/${taskId}`)

  const uploadPortrait = (id: number, file: File) =>
    requestMultipart<{ url: string; character: Character }>(`/characters/${id}/portrait/upload`, file)

  return {
    getCharacters,
    getCharacter,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    generateCharacterProfile,
    generateThreeView,
    getThreeViewTaskStatus,
    uploadPortrait,
  }
}

// Worldview API
export const useWorldviewApi = () => {
  const { request } = useApi()

  const getWorldviews = (params?: { page?: number; page_size?: number; genre?: string }) => {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.page_size) searchParams.set('page_size', params.page_size.toString())
    if (params?.genre) searchParams.set('genre', params.genre)

    const query = searchParams.toString()
    return request<ApiResponse<{ items: Worldview[], total: number, page: number, page_size: number, total_page: number }>>(`/worldviews${query ? `?${query}` : ''}`)
  }

  const getWorldview = (id: number) =>
    request<ApiResponse<Worldview>>(`/worldviews/${id}`)

  const createWorldview = (data: CreateWorldviewForm) =>
    request<ApiResponse<Worldview>>('/worldviews', {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const updateWorldview = (id: number, data: Partial<Worldview>) =>
    request<ApiResponse<Worldview>>(`/worldviews/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteWorldview = (id: number) =>
    request<void>(`/worldviews/${id}`, { method: 'DELETE' })

  const generateWorldview = (data: { genre: string; hints?: string[] }) =>
    request<ApiResponse<Worldview>>('/worldviews/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const listEntities = (worldviewId: number) =>
    request<ApiResponse<WorldviewEntity[]>>(`/worldviews/${worldviewId}/entities`)

  const createEntity = (worldviewId: number, data: { type: string; name: string; description?: string; image_url?: string }) =>
    request<ApiResponse<WorldviewEntity>>(`/worldviews/${worldviewId}/entities`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const updateEntity = (worldviewId: number, entityId: number, data: Partial<WorldviewEntity>) =>
    request<ApiResponse<WorldviewEntity>>(`/worldviews/${worldviewId}/entities/${entityId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteEntity = (worldviewId: number, entityId: number) =>
    request<void>(`/worldviews/${worldviewId}/entities/${entityId}`, { method: 'DELETE' })

  return {
    getWorldviews,
    getWorldview,
    createWorldview,
    updateWorldview,
    deleteWorldview,
    generateWorldview,
    listEntities,
    createEntity,
    updateEntity,
    deleteEntity,
  }
}

// Video API
export const useVideoApi = () => {
  const { request, requestBlob } = useApi()

  const getVideos = (params?: { novel_id?: number; page?: number; page_size?: number }) => {
    const searchParams = new URLSearchParams()
    if (params?.novel_id) searchParams.set('novel_id', params.novel_id.toString())
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.page_size) searchParams.set('page_size', params.page_size.toString())

    const query = searchParams.toString()
    return request<ApiResponse<{ items: Video[], total: number, page: number, page_size: number, total_page: number }>>(`/videos${query ? `?${query}` : ''}`)
  }

  const getVideo = (id: number) =>
    request<ApiResponse<Video>>(`/videos/${id}`)

  const createVideo = (data: { novel_id: number; chapter_id?: number; title?: string; art_style?: string; aspect_ratio?: string; frame_rate?: number; quality_tier?: string }) =>
    request<ApiResponse<Video>>(`/novels/${data.novel_id}/videos`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const generateShot = (videoId: number, shotId: number, provider?: string) =>
    request<ApiResponse<StoryboardShot>>(`/videos/${videoId}/shots/${shotId}/generate`, {
      method: 'POST',
      body: JSON.stringify(provider ? { provider } : {}),
    })

  const batchGenerateShots = (videoId: number, shotIds: number[], qualityTier?: string, provider?: string) =>
    request<ApiResponse<StoryboardShot[]>>(`/videos/${videoId}/shots/batch-generate`, {
      method: 'POST',
      body: JSON.stringify({ shot_ids: shotIds, quality_tier: qualityTier, provider }),
    })

  const updateVideo = (id: number, data: Partial<Video>) =>
    request<ApiResponse<Video>>(`/videos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteVideo = (id: number) =>
    request<void>(`/videos/${id}`, { method: 'DELETE' })

  const generateStoryboard = (id: number, data?: { chapter_id?: number; provider?: string }) =>
    request<{ task_id: string; message: string; data: { task_id: string } }>(`/videos/${id}/storyboard/generate`, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    })

  const getVideoProviders = () =>
    request<ApiResponse<{ name: string; display_name: string }[]>>('/videos/providers')

  const getStoryboardGenStatus = (id: number, taskId: string) =>
    request<{
      task_id: string
      status: 'pending' | 'running' | 'completed' | 'failed'
      data?: { shots?: StoryboardShot[]; total?: number; [key: string]: unknown }
      error?: string
    }>(`/videos/${id}/storyboard/generate/${taskId}`)

  const getStoryboard = (id: number) =>
    request<ApiResponse<StoryboardShot[]>>(`/videos/${id}/storyboard`)

  const updateStoryboardShot = (videoId: number, shotId: number, data: Partial<StoryboardShot>) =>
    request<ApiResponse<StoryboardShot>>(`/videos/${videoId}/storyboard/${shotId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const exportCapcut = (id: number) =>
    requestBlob(`/videos/${id}/export/capcut`)

  return {
    getVideos,
    getVideo,
    createVideo,
    updateVideo,
    deleteVideo,
    generateStoryboard,
    getStoryboardGenStatus,
    getStoryboard,
    updateStoryboardShot,
    generateShot,
    batchGenerateShots,
    exportCapcut,
    getVideoProviders,
  }
}

// Model API
export const useModelApi = () => {
  const { request } = useApi()

  const getProviders = () =>
    request<ApiResponse<ModelProvider[]>>('/model-providers')

  const getImageCapableProviders = () =>
    request<ApiResponse<{ name: string; display_name: string }[]>>('/model-providers/image-capable')

  const getLLMCapableProviders = () =>
    request<ApiResponse<{ name: string; display_name: string }[]>>('/model-providers/llm-capable')

  const getModels = (params?: { provider_id?: number }) => {
    const searchParams = new URLSearchParams()
    if (params?.provider_id) searchParams.set('provider_id', params.provider_id.toString())

    const query = searchParams.toString()
    return request<ApiResponse<AIModel[]>>(`/models${query ? `?${query}` : ''}`)
  }

  const getAvailableModels = (taskType: string) =>
    request<ApiResponse<AIModel[]>>(`/models/available/${taskType}`)

  const selectModel = (data: { task_type: string; strategy: string }) =>
    request<ApiResponse<AIModel>>('/models/select', {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const createProvider = (data: {
    name: string
    display_name?: string
    type: string
    api_endpoint: string
    api_key: string
    api_version?: string
    is_active: boolean
  }) =>
    request<ApiResponse<ModelProvider>>('/model-providers', {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const updateProvider = (id: number, data: Partial<{
    name: string
    display_name: string
    type: string
    api_endpoint: string
    api_key: string
    api_version: string
    is_active: boolean
  }>) =>
    request<ApiResponse<ModelProvider>>(`/model-providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteProvider = (id: number) =>
    request<ApiResponse<null>>(`/model-providers/${id}`, { method: 'DELETE' })

  const testProvider = (id: number) =>
    request<ApiResponse<{ status: string; error?: string }>>(`/model-providers/${id}/test`, {
      method: 'POST',
    })

  return {
    getProviders,
    getImageCapableProviders,
    getLLMCapableProviders,
    getModels,
    getAvailableModels,
    selectModel,
    createProvider,
    updateProvider,
    deleteProvider,
    testProvider,
  }
}

// Auth API
export const useAuthApi = () => {
  const { request } = useApi()

  const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : ''
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token || ''}`,
    }
  }

  const sendSmsCode = (phone: string) =>
    request('/auth/sms/send', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    })

  const phoneLogin = (phone: string, code: string) =>
    request('/auth/phone/login', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    })

  const phoneRegister = (phone: string, code: string, nickname?: string, tenantName?: string) =>
    request('/auth/phone/register', {
      method: 'POST',
      body: JSON.stringify({ phone, code, nickname, tenant_name: tenantName }),
    })

  const getOAuthUrl = (provider: string, state: string) =>
    request(`/auth/oauth/${provider}/url?state=${state}`)

  const getMe = () =>
    request('/auth/me', { headers: getAuthHeaders() })

  return {
    sendSmsCode,
    phoneLogin,
    phoneRegister,
    getOAuthUrl,
    getMe,
  }
}

// Analysis API
export interface AnalysisStatus {
  status: 'pending' | 'running' | 'completed' | 'failed'
  progress: number
  step: string
  error?: string
}

export const useAnalysisApi = () => {
  const { request } = useApi()

  const startAnalysis = (novelId: number, body?: { create_chapter_outlines?: boolean }) =>
    request<ApiResponse<{ task_id: string }>>(`/novels/${novelId}/analyze`, {
      method: 'POST',
      ...(body ? { body: JSON.stringify(body) } : {}),
    })

  const getAnalysisStatus = (novelId: number, taskId: string) =>
    request<ApiResponse<AnalysisStatus>>(`/novels/${novelId}/analyze/status?task_id=${taskId}`)

  return { startAnalysis, getAnalysisStatus }
}

// Crawl API
export interface CrawlProgress {
  novel_id: number
  status: 'running' | 'paused' | 'completed' | 'failed'
  total: number
  done: number
  failed: number
  current: string
}

export const useCrawlApi = () => {
  const { request } = useApi()

  const getCrawlStatus = (novelId: number) =>
    request<ApiResponse<CrawlProgress>>(`/novels/${novelId}/crawl/status`)

  const resumeCrawl = (novelId: number) =>
    request<ApiResponse<{ message: string }>>(`/novels/${novelId}/crawl/resume`, { method: 'POST' })

  return { getCrawlStatus, resumeCrawl }
}

// Quality API
export const useQualityApi = () => {
  const { request } = useApi()

  const checkQuality = (chapterId: number) =>
    request<ApiResponse<QualityReport>>(`/chapters/${chapterId}/quality-check`, {
      method: 'POST',
    })

  const getQualityReport = (chapterId: number) =>
    request<ApiResponse<QualityReport>>(`/chapters/${chapterId}/quality-report`)

  return {
    checkQuality,
    getQualityReport,
  }
}

// MCP Tools API
export const useMcpApi = () => {
  const { request } = useApi()

  // ── MCP tool CRUD ─────────────────────────────────────────────────────────
  const getMcpTools = () =>
    request<ApiResponse<McpTool[]>>('/mcp-tools')

  const createMcpTool = (data: {
    name: string
    display_name: string
    description?: string
    transport_type: string
    endpoint: string
    headers?: Record<string, string>
    env?: Record<string, string>
    timeout?: number
    is_active: boolean
  }) =>
    request<ApiResponse<McpTool>>('/mcp-tools', {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const updateMcpTool = (id: number, data: Partial<McpTool>) =>
    request<ApiResponse<McpTool>>(`/mcp-tools/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteMcpTool = (id: number) =>
    request<void>(`/mcp-tools/${id}`, { method: 'DELETE' })

  const testMcpTool = (id: number) =>
    request<ApiResponse<{ status: string; latency_ms?: number; error?: string }>>(`/mcp-tools/${id}/test`, {
      method: 'POST',
    })

  // ── Model ↔ MCP bindings ─────────────────────────────────────────────────
  const getModelMcpTools = (modelId: number) =>
    request<ApiResponse<McpTool[]>>(`/models/${modelId}/mcp-tools`)

  const bindMcpTool = (modelId: number, toolId: number) =>
    request<ApiResponse<null>>(`/models/${modelId}/mcp-tools`, {
      method: 'POST',
      body: JSON.stringify({ tool_id: toolId }),
    })

  const unbindMcpTool = (modelId: number, toolId: number) =>
    request<void>(`/models/${modelId}/mcp-tools/${toolId}`, { method: 'DELETE' })

  // Get all models bound to a specific MCP tool
  const getMcpToolModels = (toolId: number) =>
    request<ApiResponse<AIModel[]>>(`/mcp-tools/${toolId}/models`)

  return {
    getMcpTools,
    createMcpTool,
    updateMcpTool,
    deleteMcpTool,
    testMcpTool,
    getModelMcpTools,
    bindMcpTool,
    unbindMcpTool,
    getMcpToolModels,
  }
}

// Item API
export const useItemApi = () => {
  const { request, requestMultipart } = useApi()

  const listItems = (novelId: number) =>
    request<ApiResponse<Item[]>>(`/novels/${novelId}/items`)

  const createItem = (novelId: number, data: Partial<Item>) =>
    request<ApiResponse<Item>>(`/novels/${novelId}/items`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const getItem = (id: number) =>
    request<ApiResponse<Item>>(`/items/${id}`)

  const updateItem = (id: number, data: Partial<Item>) =>
    request<ApiResponse<Item>>(`/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteItem = (id: number) =>
    request<void>(`/items/${id}`, { method: 'DELETE' })

  const uploadItemImage = (id: number, file: File) =>
    requestMultipart<{ url: string; item: Item }>(`/items/${id}/image/upload`, file)

  const uploadItemReference = (id: number, file: File) =>
    requestMultipart<{ url: string; item: Item }>(`/items/${id}/reference/upload`, file)

  const generateItemImage = (id: number, referenceImageUrl?: string, provider?: string) =>
    request<ApiResponse<{ task_id: string }>>(`/items/${id}/images`, {
      method: 'POST',
      body: JSON.stringify({ reference_image_url: referenceImageUrl ?? '', provider: provider ?? '' }),
    })

  const getItemImageTaskStatus = (id: number, taskId: string) =>
    request<ApiResponse<{
      task_id: string
      status: 'pending' | 'running' | 'completed' | 'failed'
      item?: Item
      error?: string
    }>>(`/items/${id}/images/${taskId}`)

  const listEffectiveItems = (novelId: number, chapterNo: number) =>
    request<ApiResponse<EffectiveItem[]>>(`/novels/${novelId}/chapters/${chapterNo}/items`)

  const upsertChapterItem = (
    novelId: number,
    chapterNo: number,
    itemId: number,
    data: { location?: string; owner?: string; condition?: string; notes?: string },
  ) =>
    request<ApiResponse<EffectiveItem>>(`/novels/${novelId}/chapters/${chapterNo}/items/${itemId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const deleteChapterItem = (novelId: number, chapterNo: number, itemId: number) =>
    request<void>(`/novels/${novelId}/chapters/${chapterNo}/items/${itemId}`, { method: 'DELETE' })

  return {
    listItems,
    createItem,
    getItem,
    updateItem,
    deleteItem,
    uploadItemImage,
    uploadItemReference,
    generateItemImage,
    getItemImageTaskStatus,
    listEffectiveItems,
    upsertChapterItem,
    deleteChapterItem,
  }
}
