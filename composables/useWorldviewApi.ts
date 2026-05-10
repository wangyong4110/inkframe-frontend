import type { Worldview, WorldviewEntity, ApiResponse, CreateWorldviewForm } from '~/types'

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

  const generateWorldview = (data: { genre?: string; hints?: string[]; novel_id?: number }) =>
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
