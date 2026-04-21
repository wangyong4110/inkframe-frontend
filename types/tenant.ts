// ============================================
// Tenant & Project Types - 多租户多项目类型
// ============================================

export interface Tenant {
  id: number
  name: string
  code: string
  logo?: string
  plan: 'free' | 'pro' | 'enterprise'
  status: 'active' | 'suspended' | 'banned'
  
  // Quotas
  max_projects: number
  max_users: number
  max_storage_mb: number
  used_projects: number
  used_users: number
  used_storage_mb: number
  
  // Billing
  billing_cycle: string
  expires_at?: string
  
  // Contact
  description?: string
  contact_email?: string
  contact_phone?: string
  
  // Timestamps
  created_at: string
  updated_at: string
}

export interface TenantUser {
  id: number
  tenant_id: number
  user_id: number
  role: 'owner' | 'admin' | 'member' | 'viewer'
  nickname?: string
  avatar?: string
  status: 'active' | 'inactive'
  permissions?: string
  created_at: string
  updated_at: string
  
  // Populated user info
  user?: User
}

export interface TenantProject {
  id: number
  tenant_id: number
  project_id: number
  project_type: 'novel' | 'custom'
  name: string
  status: 'active' | 'archived' | 'deleted'
  members?: string
  settings?: string
  tags?: string[]
  storage_used: number
  created_at: string
  updated_at: string
  
  // Stats
  novel_count?: number
  total_words?: number
}

export interface User {
  id: number
  uuid: string
  username: string
  email: string
  phone?: string
  nickname?: string
  avatar?: string
  status: 'active' | 'inactive' | 'banned'
  role: 'admin' | 'user'
  oauth_provider?: string
  settings?: Record<string, any>
  preferences?: Record<string, any>
  total_projects: number
  total_novels: number
  total_words: number
  created_at: string
  updated_at: string
  last_login_at?: string
}

export interface QuotaInfo {
  projects: {
    used: number
    limit: number
  }
  users: {
    used: number
    limit: number
  }
  storage_mb: {
    used: number
    limit: number
  }
}

export interface ProjectStats {
  project: TenantProject
  novel_count: number
  total_words: number
}

// Extended Novel with tenant info
export interface TenantNovel {
  tenant_id?: number
  project_id?: number
  is_public?: boolean
  access_code?: string
  storage_size?: number
}

// Create/Update Requests
export interface CreateTenantRequest {
  name: string
  code: string
  plan?: string
  max_projects?: number
  max_users?: number
  max_storage_mb?: number
  settings?: Record<string, any>
}

export interface UpdateTenantRequest {
  name?: string
  logo?: string
  description?: string
  contact_email?: string
  contact_phone?: string
}

export interface AddTenantMemberRequest {
  user_id: number
  role?: 'admin' | 'member' | 'viewer'
  nickname?: string
}

export interface CreateProjectRequest {
  name: string
  type?: 'novel' | 'custom'
  settings?: Record<string, any>
  tags?: string[]
}

export interface UpdateProjectRequest {
  name?: string
  status?: string
}
