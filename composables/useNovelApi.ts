import type { Novel, ApiResponse } from '~/types'

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

  const updateNovel = (id: number, data: Partial<Novel>) =>
    request<ApiResponse<Novel>>(`/novels/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteNovel = (id: number) =>
    request<void>(`/novels/${id}`, { method: 'DELETE' })

  const publishNovel = (id: number, visibility?: 'private' | 'unlisted' | 'public') =>
    request<ApiResponse<Novel>>(`/novels/${id}/publish`, {
      method: 'POST',
      body: JSON.stringify({ visibility: visibility || 'public' }),
    })

  const unpublishNovel = (id: number) =>
    request<ApiResponse<{ unpublished: boolean }>>(`/novels/${id}/unpublish`, { method: 'POST' })

  const generateCoverImage = (id: number, suggestion?: string) =>
    request<ApiResponse<{ task_id: string }>>(`/novels/${id}/cover/generate`, {
      method: 'POST',
      body: suggestion ? JSON.stringify({ suggestion }) : undefined,
    })

  return {
    getNovels,
    getNovel,
    updateNovel,
    deleteNovel,
    publishNovel,
    unpublishNovel,
    generateCoverImage,
  }
}
