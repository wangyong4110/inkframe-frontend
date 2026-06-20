export interface SysOverview {
  tenant_count: number
  user_count: number
  novel_count: number
  chapter_count: number
  video_count: number
  active_tasks: number
}

export interface SysTenant {
  id: number
  name: string
  code: string
  status: string
  plan: string
  expires_at: string | null
  used_users: number
  quota: string
  profile: string
  created_at: string
  updated_at: string
}

export interface SysUser {
  id: number
  uuid: string
  username: string
  email: string
  phone: string
  nickname: string
  avatar: string
  status: string
  role: string
  created_at: string
  last_login_at: string | null
}

export interface SysTask {
  id: number
  type: string
  status: string
  payload: string
  result: string
  error: string
  created_at: string
  updated_at: string
}

export interface SysAuditLog {
  id: number
  user_id: number
  tenant_id: number
  action: string
  entity_type: string
  entity_id: string
  details: string
  created_at: string
}

export interface AIInfraStats {
  provider_count: number
  model_count: number
}

export interface TenantStorageInfo {
  tenant_id: number
  tenant_name: string
  used_mb: number
  asset_count: number
}

export interface PagedResponse<T> {
  items: T[]
  total: number
  page: number
  size: number
}
