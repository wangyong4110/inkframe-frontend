export interface Notification {
  id: number
  event_type: string
  title: string
  body: string
  entity_type: string
  entity_id: number
  link_path: string
  is_read: boolean
  created_at: string
}

export function useNotificationApi() {
  const { request } = useApi()

  const list = (unread = false, page = 1, pageSize = 20) =>
    request<{ items: Notification[]; total: number; unread_count?: number }>(
      `/notifications?unread=${unread}&page=${page}&page_size=${pageSize}`,
    )

  const unreadCount = () =>
    request<{ count: number }>('/notifications/unread-count')

  const markRead = (id: number) =>
    request<void>(`/notifications/${id}/read`, { method: 'PUT' })

  const markAllRead = () =>
    request<void>('/notifications/read-all', { method: 'PUT' })

  const remove = (id: number) =>
    request<void>(`/notifications/${id}`, { method: 'DELETE' })

  return { list, unreadCount, markRead, markAllRead, remove }
}
