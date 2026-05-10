import type { AsyncTask, ApiResponse } from '~/types'

export const useTaskApi = () => {
  const { request } = useApi()

  const getTask = (taskId: string) =>
    request<ApiResponse<AsyncTask>>(`/tasks/${taskId}`)

  const listTasks = (params?: { type?: string; status?: string; page?: number; page_size?: number }) => {
    const q = new URLSearchParams()
    if (params?.type) q.set('type', params.type)
    if (params?.status) q.set('status', params.status)
    if (params?.page) q.set('page', String(params.page))
    if (params?.page_size) q.set('page_size', String(params.page_size))
    const qs = q.toString()
    return request<ApiResponse<{ items: AsyncTask[]; total: number; page: number; page_size: number }>>(
      `/tasks${qs ? '?' + qs : ''}`,
    )
  }

  const cancelTask = (taskId: string) =>
    request(`/tasks/${taskId}/cancel`, { method: 'POST' })

  return { getTask, listTasks, cancelTask }
}
