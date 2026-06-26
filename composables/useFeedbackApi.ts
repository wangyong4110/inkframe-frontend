export interface UserFeedback {
  id: number
  tenant_id: number
  user_id: number
  seq_no: number
  type: string
  title: string
  content: string
  rating: number
  page_url: string
  user_agent: string
  screenshots: string[]
  contact_email: string
  status: string
  priority: string
  admin_note: string
  reply_content: string
  replied_at: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
}

export interface FeedbackStats {
  this_week: number
  pending: number
  reviewing: number
  resolved: number
  total: number
}

export function useFeedbackApi() {
  const { request } = useApi()

  const submitFeedback = (data: {
    type: string
    title?: string
    content: string
    rating?: number
    page_url?: string
    user_agent?: string
    screenshots?: string[]
    contact_email?: string
  }) =>
    request<{ data: UserFeedback }>('/feedback', {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const listMyFeedback = (page = 1, size = 20) =>
    request<{ data: { items: UserFeedback[]; total: number } }>(
      `/feedback/my?page=${page}&size=${size}`,
    )

  const adminListFeedback = (params: {
    page?: number
    size?: number
    status?: string
    type?: string
    priority?: string
  }) => {
    const q = new URLSearchParams()
    if (params.page) q.set('page', String(params.page))
    if (params.size) q.set('size', String(params.size))
    if (params.status) q.set('status', params.status)
    if (params.type) q.set('type', params.type)
    if (params.priority) q.set('priority', params.priority)
    const qs = q.toString()
    return request<{ data: { items: UserFeedback[]; total: number } }>(
      `/sysadmin/feedback${qs ? `?${qs}` : ''}`,
    )
  }

  const adminGetFeedback = (id: number) =>
    request<{ data: UserFeedback }>(`/sysadmin/feedback/${id}`)

  const adminUpdateFeedback = (
    id: number,
    data: { status?: string; priority?: string; admin_note?: string },
  ) =>
    request<{ data: UserFeedback }>(`/sysadmin/feedback/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const adminReplyFeedback = (id: number, content: string) =>
    request<{ data: UserFeedback }>(`/sysadmin/feedback/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    })

  const adminGetStats = () =>
    request<{ data: FeedbackStats }>('/sysadmin/feedback/stats')

  return {
    submitFeedback,
    listMyFeedback,
    adminListFeedback,
    adminGetFeedback,
    adminUpdateFeedback,
    adminReplyFeedback,
    adminGetStats,
  }
}
