import type { ApiResponse, Video, PlatformAccount, VideoComment } from '~/types'

interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_page: number
}

export const usePlatformApi = () => {
  const { request } = useApi()

  const buildQ = (p: Record<string, unknown>): string => {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(p)) {
      if (v == null || v === '') continue
      params.set(k, String(v))
    }
    return params.toString()
  }

  // ─── Feed ───────────────────────────────────────────────────────────────────

  const getPlatformFeed = (params?: {
    sort?: 'latest' | 'hot'
    q?: string
    page?: number
    page_size?: number
  }) => {
    const q = buildQ({ sort: 'hot', page: 1, page_size: 12, ...params })
    return request<ApiResponse<PaginatedResponse<Video>>>(`/platform/videos?${q}`)
  }

  const getPlatformVideo = (id: number) =>
    request<ApiResponse<{ video: Video; is_liked: boolean }>>(`/platform/videos/${id}`)

  const recordView = (id: number) =>
    request<ApiResponse<{ recorded: boolean }>>(`/platform/videos/${id}/view`, { method: 'POST' })

  // ─── Interactions ────────────────────────────────────────────────────────────

  const toggleLike = (id: number) =>
    request<ApiResponse<{ liked: boolean }>>(`/platform/videos/${id}/like`, { method: 'POST' })

  const listComments = (id: number, page = 1, pageSize = 20) => {
    const q = buildQ({ page, page_size: pageSize })
    return request<ApiResponse<PaginatedResponse<VideoComment>>>(`/platform/videos/${id}/comments?${q}`)
  }

  const addComment = (id: number, data: { content: string; parent_id?: number }) =>
    request<ApiResponse<VideoComment>>(`/platform/videos/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const deleteComment = (id: number, cid: number) =>
    request<void>(`/platform/videos/${id}/comments/${cid}`, { method: 'DELETE' })

  // ─── Platform Accounts ───────────────────────────────────────────────────────

  const listAccounts = () =>
    request<ApiResponse<PlatformAccount[]>>('/platform/accounts')

  const getOAuthURL = (platform: string, redirectURI: string, state?: string) => {
    const q = buildQ({ redirect_uri: redirectURI, state })
    return request<ApiResponse<string>>(`/platform/accounts/oauth/${platform}?${q}`)
  }

  const disconnectAccount = (id: number) =>
    request<ApiResponse<{ disconnected: boolean }>>(`/platform/accounts/${id}`, { method: 'DELETE' })

  return {
    getPlatformFeed,
    getPlatformVideo,
    recordView,
    toggleLike,
    listComments,
    addComment,
    deleteComment,
    listAccounts,
    getOAuthURL,
    disconnectAccount,
  }
}
