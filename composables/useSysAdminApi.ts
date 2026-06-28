import type {
  SysOverview,
  SysTenant,
  SysUser,
  SysTask,
  SysAuditLog,
  SysMetrics,
  AIInfraStats,
  TenantStorageInfo,
  PagedResponse,
  TaskFailureStat,
  DayCount,
  ContentOverview,
  ModelUsageStat,
} from '~/types/sysadmin'

export function useSysAdminApi() {
  const { request } = useApi()
  const BASE = '/sysadmin'

  const getOverview = () =>
    request<{ data: SysOverview }>(`${BASE}/overview`)

  const getMetrics = () =>
    request<{ data: SysMetrics }>(`${BASE}/metrics`)

  // Tenants
  const listTenants = (page = 1, size = 20, search = '', status = '') =>
    request<{ data: PagedResponse<SysTenant> }>(
      `${BASE}/tenants?page=${page}&page_size=${size}&search=${encodeURIComponent(search)}&status=${status}`
    )

  const getTenant = (id: number) =>
    request<{ data: SysTenant }>(`${BASE}/tenants/${id}`)

  const updateTenant = (id: number, data: Partial<{ status: string; plan: string; expires_at: string | null; quota: string; profile: string }>) =>
    request<{ data: SysTenant }>(`${BASE}/tenants/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteTenant = (id: number) =>
    request<{ message: string }>(`${BASE}/tenants/${id}`, { method: 'DELETE' })

  // Users
  const listUsers = (page = 1, size = 20, search = '', role = '') =>
    request<{ data: PagedResponse<SysUser> }>(
      `${BASE}/users?page=${page}&page_size=${size}&search=${encodeURIComponent(search)}&role=${role}`
    )

  const getUser = (id: number) =>
    request<{ data: SysUser }>(`${BASE}/users/${id}`)

  const updateUser = (id: number, data: { role?: string; status?: string }) =>
    request<{ data: SysUser }>(`${BASE}/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const impersonateUser = (id: number) =>
    request<{ data: { token: string; expires_in: string } }>(`${BASE}/users/${id}/impersonate`, { method: 'POST' })

  const resetUserPassword = (id: number, password: string) =>
    request<{ message: string }>(`${BASE}/users/${id}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    })

  // Tasks
  const listTasks = (page = 1, size = 20, status = '') =>
    request<{ data: PagedResponse<SysTask> }>(
      `${BASE}/tasks?page=${page}&page_size=${size}&status=${status}`
    )

  const cancelTask = (id: number) =>
    request<{ message: string }>(`${BASE}/tasks/${id}/cancel`, { method: 'POST' })

  // Audit logs
  const listAuditLogs = (page = 1, size = 20, entityType = '', userId = 0) =>
    request<{ data: PagedResponse<SysAuditLog> }>(
      `${BASE}/audit-logs?page=${page}&page_size=${size}&entity_type=${entityType}&user_id=${userId || ''}`
    )

  // Settings
  const listSettings = () =>
    request<{ data: Record<string, string> }>(`${BASE}/settings`)

  const updateSettings = (settings: Record<string, string>) =>
    request<{ message: string }>(`${BASE}/settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    })

  // Content review
  const listNovels = (page = 1, size = 20, search = '') =>
    request<{ data: PagedResponse<Record<string, any>> }>(
      `${BASE}/content-review/novels?page=${page}&page_size=${size}&search=${encodeURIComponent(search)}`
    )

  // Asset governance
  const getAssetGovernance = () =>
    request<{ data: TenantStorageInfo[] }>(`${BASE}/asset-governance`)

  // AI infra
  const getAIInfra = () =>
    request<{ data: AIInfraStats }>(`${BASE}/ai-infra`)

  // Notifications
  const broadcastNotification = (title: string, content: string) =>
    request<{ message: string }>(`${BASE}/notifications/broadcast`, {
      method: 'POST',
      body: JSON.stringify({ title, content }),
    })

  const notifyTenant = (tenantId: number, title: string, content: string) =>
    request<{ message: string }>(`${BASE}/notifications/tenant/${tenantId}`, {
      method: 'POST',
      body: JSON.stringify({ title, content }),
    })

  // Experiments
  const listExperiments = (page = 1, size = 20) =>
    request<{ data: PagedResponse<Record<string, any>> }>(
      `${BASE}/experiments?page=${page}&page_size=${size}`
    )

  // Change admin password
  const changePassword = (password: string) =>
    request<{ message: string }>(`${BASE}/change-password`, {
      method: 'POST',
      body: JSON.stringify({ password }),
    })

  // Analytics
  const getTaskFailureStats = () =>
    request<{ data: TaskFailureStat[] }>(`${BASE}/tasks/failure-stats`)

  const getUserRegistrationTrend = (days = 30) =>
    request<{ data: DayCount[] }>(`${BASE}/users/registration-trend?days=${days}`)

  const getContentOverview = () =>
    request<{ data: ContentOverview }>(`${BASE}/content/overview`)

  const getModelUsageStats = (days = 30) =>
    request<{ data: ModelUsageStat[] }>(`${BASE}/ai-usage/stats?days=${days}`)

  return {
    getOverview,
    getMetrics,
    listTenants, getTenant, updateTenant, deleteTenant,
    listUsers, getUser, updateUser, impersonateUser, resetUserPassword,
    listTasks, cancelTask,
    listAuditLogs,
    listSettings, updateSettings,
    listNovels,
    getAssetGovernance,
    getAIInfra,
    broadcastNotification, notifyTenant,
    listExperiments,
    changePassword,
    getTaskFailureStats, getUserRegistrationTrend, getContentOverview, getModelUsageStats,
  }
}
