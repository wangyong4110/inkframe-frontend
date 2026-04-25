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
  CreateNovelForm,
  CreateChapterForm,
  CreateCharacterForm,
  CreateWorldviewForm,
  ApiResponse,
  PaginatedResponse,
} from '~/types'

export const useApi = () => {
  const config = useRuntimeConfig()
  const apiBase = config.public.apiBase

  const request = async <T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> => {
    const url = `${apiBase}${endpoint}`

    const defaultOptions: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
      },
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120_000)

    let response: Response
    try {
      response = await fetch(url, {
        ...defaultOptions,
        ...options,
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

  return {
    request,
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
    return request<PaginatedResponse<Novel>>(`/novels${query ? `?${query}` : ''}`)
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
  }) =>
    request<ApiResponse<Chapter>>(`/novels/${novelId}/chapters/generate`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

  return {
    getChapters,
    getChapter,
    createChapter,
    updateChapter,
    deleteChapter,
    generateChapter,
  }
}

// Character API
export const useCharacterApi = () => {
  const { request } = useApi()

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

  return {
    getCharacters,
    getCharacter,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    generateCharacterProfile,
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
    return request<PaginatedResponse<Worldview>>(`/worldviews${query ? `?${query}` : ''}`)
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
  const { request } = useApi()

  const getVideos = (params?: { novel_id?: number; page?: number; page_size?: number }) => {
    const searchParams = new URLSearchParams()
    if (params?.novel_id) searchParams.set('novel_id', params.novel_id.toString())
    if (params?.page) searchParams.set('page', params.page.toString())
    if (params?.page_size) searchParams.set('page_size', params.page_size.toString())

    const query = searchParams.toString()
    return request<PaginatedResponse<Video>>(`/videos${query ? `?${query}` : ''}`)
  }

  const getVideo = (id: number) =>
    request<ApiResponse<Video>>(`/videos/${id}`)

  const createVideo = (data: { novel_id: number; chapter_id?: number; title?: string; art_style?: string; aspect_ratio?: string; frame_rate?: number; quality_tier?: string }) =>
    request<ApiResponse<Video>>(`/novels/${data.novel_id}/videos`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const generateShot = (videoId: number, shotId: number) =>
    request<ApiResponse<StoryboardShot>>(`/videos/${videoId}/shots/${shotId}/generate`, {
      method: 'POST',
    })

  const batchGenerateShots = (videoId: number, shotIds: number[], qualityTier?: string) =>
    request<ApiResponse<StoryboardShot[]>>(`/videos/${videoId}/shots/batch-generate`, {
      method: 'POST',
      body: JSON.stringify({ shot_ids: shotIds, quality_tier: qualityTier }),
    })

  const updateVideo = (id: number, data: Partial<Video>) =>
    request<ApiResponse<Video>>(`/videos/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteVideo = (id: number) =>
    request<void>(`/videos/${id}`, { method: 'DELETE' })

  const generateStoryboard = (id: number) =>
    request<ApiResponse<StoryboardShot[]>>(`/videos/${id}/storyboard/generate`, {
      method: 'POST',
    })

  const getStoryboard = (id: number) =>
    request<ApiResponse<StoryboardShot[]>>(`/videos/${id}/storyboard`)

  const updateStoryboardShot = (videoId: number, shotId: number, data: Partial<StoryboardShot>) =>
    request<ApiResponse<StoryboardShot>>(`/videos/${videoId}/storyboard/${shotId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  return {
    getVideos,
    getVideo,
    createVideo,
    updateVideo,
    deleteVideo,
    generateStoryboard,
    getStoryboard,
    updateStoryboardShot,
    generateShot,
    batchGenerateShots,
  }
}

// Model API
export const useModelApi = () => {
  const { request } = useApi()

  const getProviders = () =>
    request<ApiResponse<ModelProvider[]>>('/model-providers')

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
    getModels,
    getAvailableModels,
    selectModel,
    createProvider,
    updateProvider,
    deleteProvider,
    testProvider,
  }
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
