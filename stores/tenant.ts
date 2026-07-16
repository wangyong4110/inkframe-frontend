// ============================================
// Tenant & Project Store - 多租户多项目管理
// ============================================

import { defineStore } from 'pinia'
import type {
  Tenant,
  TenantUser,
  QuotaInfo,
  CreateTenantRequest,
} from '~/types/tenant'

interface TenantState {
  // 当前租户
  currentTenant: Tenant | null
  tenants: Tenant[]
  tenantsLoading: boolean

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
    quota: null,
    members: [],
    membersLoading: false,
    totalTenants: 0,
    tenantPage: 1,
    tenantPageSize: 20,
  }),

  getters: {
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
      const { request } = useApi()
      try {
        const result: any = await request(`/tenants?page=${page}&page_size=${pageSize}`)
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

    async createTenant(data: CreateTenantRequest) {
      const { request } = useApi()
      const result: any = await request('/tenants', {
        method: 'POST',
        body: JSON.stringify(data),
      })
      if (result.code === 0) {
        this.tenants.unshift(result.data)
        return result.data
      }
      throw new Error(result.error || '创建失败')
    },

    async fetchQuota(tenantId: number) {
      const { request } = useApi()
      const result: any = await request(`/tenants/${tenantId}/quota`)
      if (result.code === 0) {
        this.quota = result.data
      }
    },

    // ================== 成员管理 ==================

    async fetchMembers(tenantId: number) {
      this.membersLoading = true
      const { request } = useApi()
      try {
        const result: any = await request(`/tenants/${tenantId}/members`)
        if (result.code === 0) {
          this.members = result.data
        }
      } finally {
        this.membersLoading = false
      }
    },

    async removeMember(tenantId: number, userId: number) {
      const { request } = useApi()
      const result: any = await request(`/tenants/${tenantId}/members/${userId}`, { method: 'DELETE' })
      if (result.code === 0) {
        this.members = this.members.filter(m => m.user_id !== userId)
        await this.fetchQuota(tenantId)
      }
    },

    async inviteMember(tenantId: number, email: string, role: string) {
      const { request } = useApi()
      const result: any = await request(`/tenants/${tenantId}/members/invite`, {
        method: 'POST',
        body: JSON.stringify({ email, role }),
      })
      if (result.code === 0) {
        await this.fetchMembers(tenantId)
        await this.fetchQuota(tenantId)
        return result.data
      }
      throw new Error(result.error || result.message || '邀请失败')
    },

  },
})
