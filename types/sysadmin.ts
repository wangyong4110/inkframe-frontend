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
  username: string
  tenant_id: number
  action: string
  entity_type: string
  entity_id: string
  details: string
  created_at: string
}

export interface SysMetrics {
  uptime_seconds: number
  goroutines: number
  heap_mb: number
  gc_count: number
  http_requests_total: number
  http_errors_total: number
  http_in_flight: number
  http_rate_limited_total: number
  ai_requests_total: number
  ai_requests_in_flight: number
  ai_errors_total: number
  chapter_gen_in_flight: number
  chapter_gen_total: number
  db_open_connections: number
  db_in_use_connections: number
  db_idle_connections: number
  active_tasks: number
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

export interface TaskFailureStat {
  type: string
  total: number
  failed: number
  failure_rate: number
  avg_retries: number
  top_errors: string[]
}

export interface DayCount {
  date: string
  count: number
}

export interface TopNovelStat {
  novel_id: number
  title: string
  view_count: number
  like_count: number
}

export interface ContentOverview {
  total_views: number
  total_likes: number
  total_comments: number
  novel_count: number
  chapter_count: number
  public_novels: number
  top_novels: TopNovelStat[]
}

export interface ModelUsageStat {
  model_id: number
  model_name: string
  provider_name: string
  task_type: string
  total_calls: number
  success_calls: number
  error_calls: number
  success_rate: number
  total_tokens: number
  avg_latency: number
  total_cost: number
}
