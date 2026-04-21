// ============================================
// Tenant & Project Store - 多租户多项目管理
// ============================================

import { defineStore } from 'pinia'
import type { 
  Tenant, 
  TenantUser, 
  TenantProject, 
  QuotaInfo, 
  ProjectStats,
  CreateTenantRequest,
  CreateProjectRequest 
} from '~/types/tenant'

interface TenantState {
  // 当前租户
  currentTenant: Tenant | null
  tenants: Tenant[]
  tenantsLoading: boolean
  
  // 当前项目
  currentProject: TenantProject | null
  projects: TenantProject[]
  projectsLoading: boolean
  
  // 配额信息
  quota: QuotaInfo | null
  
  // 成员列表
  members: TenantUser[]
  membersLoading: boolean
  
  // 分页
  totalTenants: number
  tenantPage: number
  tenantPageSize: number
}

export const useTenantStore = defineStore('tenant', {
  state: (): TenantState => ({
    currentTenant: null,
    tenants: [],
    tenantsLoading: false,
    currentProject: null,
    projects: [],
    projectsLoading: false,
    quota: null,
    members: [],
    membersLoading: false,
    totalTenants: 0,
    tenantPage: 1,
    tenantPageSize: 20,
  }),

  getters: {
    // 检查配额
    canCreateProject: (state) => {
      if (!state.quota) return true
      return state.quota.projects.used < state.quota.projects.limit
    },
    
    canAddMember: (state) => {
      if (!state.quota) return true
      return state.quota.users.used < state.quota.users.limit
    },
    
    // 配额使用百分比
    projectUsage: (state) => {
      if (!state.quota) return 0
      return (state.quota.projects.used / state.quota.projects.limit) * 100
    },
    
    userUsage: (state) => {
      if (!state.quota) return 0
      return (state.quota.users.used / state.quota.users.limit) * 100
    },
    
    storageUsage: (state) => {
      if (!state.quota) return 0
      return (state.quota.storage_mb.used / state.quota.storage_mb.limit) * 100
    },
  },

  actions: {
    // ================== 租户管理 ==================
    
    async fetchTenants(page = 1, pageSize = 20) {
      this.tenantsLoading = true
      try {
        const response = await fetch(`/api/v1/tenants?page=${page}&page_size=${pageSize}`)
        const result = await response.json()
        
        if (result.code === 0) {
          this.tenants = result.data.items
          this.totalTenants = result.data.total
          this.tenantPage = page
          this.tenantPageSize = pageSize
        }
      } finally {
        this.tenantsLoading = false
      }
    },
    
    async fetchTenant(id: number) {
      this.tenantsLoading = true
      try {
        const response = await fetch(`/api/v1/tenants/${id}`)
        const result = await response.json()
        
        if (result.code === 0) {
          this.currentTenant = result.data
        }
      } finally {
        this.tenantsLoading = false
      }
    },
    
    async fetchTenantByCode(code: string) {
      this.tenantsLoading = true
      try {
        const response = await fetch(`/api/v1/tenants/code/${code}`)
        const result = await response.json()
        
        if (result.code === 0) {
          this.currentTenant = result.data
        }
        return result.data
      } finally {
        this.tenantsLoading = false
      }
    },
    
    async createTenant(data: CreateTenantRequest) {
      const response = await fetch('/api/v1/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await response.json()
      
      if (result.code === 0) {
        this.tenants.unshift(result.data)
        return result.data
      }
      throw new Error(result.error || '创建失败')
    },
    
    async updateTenant(id: number, data: Partial<Tenant>) {
      const response = await fetch(`/api/v1/tenants/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await response.json()
      
      if (result.code === 0) {
        const index = this.tenants.findIndex(t => t.id === id)
        if (index !== -1) {
          this.tenants[index] = result.data
        }
        if (this.currentTenant?.id === id) {
          this.currentTenant = result.data
        }
        return result.data
      }
      throw new Error(result.error || '更新失败')
    },
    
    async deleteTenant(id: number) {
      const response = await fetch(`/api/v1/tenants/${id}`, {
        method: 'DELETE',
      })
      const result = await response.json()
      
      if (result.code === 0) {
        this.tenants = this.tenants.filter(t => t.id !== id)
        if (this.currentTenant?.id === id) {
          this.currentTenant = null
        }
      }
    },
    
    async fetchQuota(tenantId: number) {
      const response = await fetch(`/api/v1/tenants/${tenantId}/quota`)
      const result = await response.json()
      
      if (result.code === 0) {
        this.quota = result.data
      }
    },
    
    // ================== 成员管理 ==================
    
    async fetchMembers(tenantId: number) {
      this.membersLoading = true
      try {
        const response = await fetch(`/api/v1/tenants/${tenantId}/members`)
        const result = await response.json()
        
        if (result.code === 0) {
          this.members = result.data
        }
      } finally {
        this.membersLoading = false
      }
    },
    
    async addMember(tenantId: number, data: { user_id: number; role?: string; nickname?: string }) {
      const response = await fetch(`/api/v1/tenants/${tenantId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await response.json()
      
      if (result.code === 0) {
        await this.fetchMembers(tenantId)
        await this.fetchQuota(tenantId)
      }
    },
    
    async removeMember(tenantId: number, userId: number) {
      const response = await fetch(`/api/v1/tenants/${tenantId}/members/${userId}`, {
        method: 'DELETE',
      })
      const result = await response.json()
      
      if (result.code === 0) {
        this.members = this.members.filter(m => m.user_id !== userId)
        await this.fetchQuota(tenantId)
      }
    },
    
    async updateMemberRole(tenantId: number, userId: number, role: string) {
      const response = await fetch(`/api/v1/tenants/${tenantId}/members/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role }),
      })
      const result = await response.json()
      
      if (result.code === 0) {
        await this.fetchMembers(tenantId)
      }
    },
    
    // ================== 项目管理 ==================
    
    async fetchProjects(tenantId: number) {
      this.projectsLoading = true
      try {
        const response = await fetch(`/api/v1/tenants/${tenantId}/projects`)
        const result = await response.json()
        
        if (result.code === 0) {
          this.projects = result.data
        }
      } finally {
        this.projectsLoading = false
      }
    },
    
    async fetchProject(tenantId: number, projectId: number) {
      this.projectsLoading = true
      try {
        const response = await fetch(`/api/v1/tenants/${tenantId}/projects/${projectId}`)
        const result = await response.json()
        
        if (result.code === 0) {
          this.currentProject = result.data
          return result.data
        }
      } finally {
        this.projectsLoading = false
      }
    },
    
    async createProject(tenantId: number, data: CreateProjectRequest) {
      const response = await fetch(`/api/v1/tenants/${tenantId}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await response.json()
      
      if (result.code === 0) {
        this.projects.unshift(result.data)
        await this.fetchQuota(tenantId)
        return result.data
      }
      throw new Error(result.error || '创建项目失败')
    },
    
    async updateProject(tenantId: number, projectId: number, data: Partial<TenantProject>) {
      const response = await fetch(`/api/v1/tenants/${tenantId}/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      const result = await response.json()
      
      if (result.code === 0) {
        const index = this.projects.findIndex(p => p.id === projectId)
        if (index !== -1) {
          this.projects[index] = result.data
        }
        if (this.currentProject?.id === projectId) {
          this.currentProject = result.data
        }
        return result.data
      }
      throw new Error(result.error || '更新失败')
    },
    
    async deleteProject(tenantId: number, projectId: number) {
      const response = await fetch(`/api/v1/tenants/${tenantId}/projects/${projectId}`, {
        method: 'DELETE',
      })
      const result = await response.json()
      
      if (result.code === 0) {
        this.projects = this.projects.filter(p => p.id !== projectId)
        if (this.currentProject?.id === projectId) {
          this.currentProject = null
        }
        await this.fetchQuota(tenantId)
      }
    },
    
    async fetchProjectStats(tenantId: number, projectId: number) {
      const response = await fetch(`/api/v1/tenants/${tenantId}/projects/${projectId}/stats`)
      const result = await response.json()
      
      if (result.code === 0) {
        return result.data as ProjectStats
      }
    },
    
    // ================== 设置当前租户/项目 ==================
    
    setCurrentTenant(tenant: Tenant | null) {
      this.currentTenant = tenant
      if (tenant) {
        this.fetchQuota(tenant.id)
        this.fetchProjects(tenant.id)
        this.fetchMembers(tenant.id)
      }
    },
    
    setCurrentProject(project: TenantProject | null) {
      this.currentProject = project
    },
    
    clearTenant() {
      this.currentTenant = null
      this.projects = []
      this.members = []
      this.quota = null
    },
  },
})
