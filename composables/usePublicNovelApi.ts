import type { ApiResponse, Novel, NovelComment, Chapter } from '~/types'

interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_page: number
}

export const usePublicNovelApi = () => {
  const { request } = useApi()

  const buildQ = (p: Record<string, unknown>): string => {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(p)) {
      if (v == null || v === '') continue
      params.set(k, String(v))
    }
    return params.toString()
  }

  const getNovelFeed = (params?: {
    sort?: 'hot' | 'latest' | 'words' | 'favorites'
    q?: string
    page?: number
    page_size?: number
    channel?: string
    genre?: string
    word_min?: number
    word_max?: number
    updated_days?: number
    is_completed?: string
  }) => {
    const q = buildQ({ sort: 'hot', page: 1, page_size: 12, ...params })
    return request<ApiResponse<PaginatedResponse<Novel>>>(`/platform/novels?${q}`)
  }

  const getNovelRanking = (type: string, gender: string) =>
    request<ApiResponse<{ items: Novel[]; total: number }>>(`/platform/novels/ranking?type=${type}&gender=${gender}`)

  const getNovel = (id: number) =>
    request<ApiResponse<{ novel: Novel; is_liked: boolean }>>(`/platform/novels/${id}`)

  const recordView = (id: number) =>
    request<ApiResponse<{ recorded: boolean }>>(`/platform/novels/${id}/view`, { method: 'POST' })

  const toggleLike = (id: number) =>
    request<ApiResponse<{ liked: boolean }>>(`/platform/novels/${id}/like`, { method: 'POST' })

  const listComments = (id: number, page = 1, pageSize = 20) => {
    const q = buildQ({ page, page_size: pageSize })
    return request<ApiResponse<PaginatedResponse<NovelComment>>>(`/platform/novels/${id}/comments?${q}`)
  }

  const addComment = (id: number, data: { content: string; parent_id?: number }) =>
    request<ApiResponse<NovelComment>>(`/platform/novels/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const listChapters = (id: number) =>
    request<ApiResponse<{ items: Chapter[]; total: number }>>(`/platform/novels/${id}/chapters`)

  const deleteComment = (id: number, cid: number) =>
    request<void>(`/platform/novels/${id}/comments/${cid}`, { method: 'DELETE' })

  return {
    getNovelFeed,
    getNovelRanking,
    getNovel,
    recordView,
    toggleLike,
    listChapters,
    listComments,
    addComment,
    deleteComment,
  }
}
