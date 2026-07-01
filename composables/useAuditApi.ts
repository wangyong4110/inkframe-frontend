export interface AuditLog {
  id: number
  created_at: string
  tenant_id: number
  user_id: number
  username: string
  nickname: string
  novel_id: number
  action: string
  resource_type: string
  resource_id: number
  resource_name: string
  details?: string
  ip: string
  status: string
}

export interface AuditLogPage {
  data: AuditLog[]
  total: number
  page: number
  page_size: number
}

export function useAuditApi() {
  const { request } = useApi()

  function listNovelAuditLogs(novelId: number, params: { page?: number; page_size?: number } = {}) {
    const qs = new URLSearchParams()
    if (params.page) qs.set('page', String(params.page))
    if (params.page_size) qs.set('page_size', String(params.page_size))
    const query = qs.toString()
    return request<{ code: number; data: AuditLogPage }>(`/novels/${novelId}/audit-logs${query ? `?${query}` : ''}`)
  }

  function listMyAuditLogs(params: { page?: number; page_size?: number } = {}) {
    const qs = new URLSearchParams()
    if (params.page) qs.set('page', String(params.page))
    if (params.page_size) qs.set('page_size', String(params.page_size))
    const query = qs.toString()
    return request<{ code: number; data: AuditLogPage }>(`/users/me/audit-logs${query ? `?${query}` : ''}`)
  }

  return { listNovelAuditLogs, listMyAuditLogs }
}
