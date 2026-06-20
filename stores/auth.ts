import { defineStore } from 'pinia'
import { useVideoStore } from '~/stores/video'
import { useNovelStore } from '~/stores/novel'
import { useTaskStore } from '~/stores/task'

interface AuthUser {
  id: number
  username: string
  nickname: string
  avatar: string
  email: string
  role: string
}

interface AuthState {
  token: string | null
  expiresAt: number | null   // Unix timestamp in seconds
  user: AuthUser | null
  tenantId: number | null
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    token: null,
    expiresAt: null,
    user: null,
    tenantId: null,
  }),

  getters: {
    isLoggedIn: (state): boolean =>
      !!state.token &&
      !!state.expiresAt &&
      Date.now() / 1000 < state.expiresAt,
    isSystemAdmin: (state): boolean =>
      state.user?.role === 'system_admin',
  },

  actions: {
    setToken(token: string, expiresAt: string | number) {
      this.token = token
      if (typeof expiresAt === 'number') {
        this.expiresAt = expiresAt
      } else {
        const ms = new Date(expiresAt).getTime()
        // Fall back to 7-day expiry if the timestamp is invalid
        this.expiresAt = isNaN(ms) ? Date.now() / 1000 + 86400 * 7 : ms / 1000
      }
      if (typeof window !== 'undefined') {
        localStorage.setItem('auth_token', token)
        localStorage.setItem('auth_expires_at', String(this.expiresAt))
      }
    },

    setFromAuthResponse(resp: {
      token: string
      user_id: number
      tenant_id: number
      username: string
      nickname?: string
      email?: string
      role: string
      expires_at: string
    }) {
      this.token = resp.token
      const _ms = new Date(resp.expires_at).getTime()
      this.expiresAt = isNaN(_ms) ? Math.floor(Date.now() / 1000) + 86400 * 7 : Math.floor(_ms / 1000)
      this.user = {
        id: resp.user_id,
        username: resp.username,
        nickname: resp.nickname || resp.username,
        avatar: '',
        email: resp.email || '',
        role: resp.role,
      }
      this.tenantId = resp.tenant_id
      if (typeof window !== 'undefined') {
        localStorage.setItem('auth_token', resp.token)
        localStorage.setItem('auth_expires_at', String(this.expiresAt))
      }
    },

    async fetchMe() {
      if (!this.token) return
      try {
        const config = useRuntimeConfig()
        const apiBase = config.public.apiBase as string
        const resp = await fetch(`${apiBase}/auth/me`, {
          headers: { Authorization: `Bearer ${this.token}` },
        })
        if (resp.ok) {
          const data = await resp.json()
          const d = data.data ?? data
          this.user = {
            id: d.user_id,
            username: d.username || '',
            nickname: d.nickname || d.username || '',
            avatar: d.avatar || '',
            email: d.email || '',
            role: d.role || 'user',
          }
          this.tenantId = d.tenant_id
        } else if (resp.status === 401) {
          this.logout()
        }
      } catch {
        // network error — keep current state
      }
    },

    async logout() {
      // Reset other stores first to clear tenant-scoped data
      const videoStore = useVideoStore()
      const novelStore = useNovelStore()
      const taskStore = useTaskStore()

      // Stop any active storyboard polling before resetting
      videoStore.stopStoryboardPoll()
      videoStore.$reset()
      novelStore.$reset()
      taskStore.$reset()

      // Then clear auth state
      this.token = null
      this.expiresAt = null
      this.user = null
      this.tenantId = null
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth_token')
        localStorage.removeItem('auth_expires_at')
      }
      await navigateTo('/auth/login')
    },

    mockLogin() {
      if (!import.meta.dev) {
        console.warn('mockLogin is only available in development')
        return
      }
      // 仅用于开发调试，绕过后端直接设置假用户状态
      const fakeExp = Math.floor(Date.now() / 1000) + 86400 * 7 // 7天
      this.token = 'dev-mock-token'
      this.expiresAt = fakeExp
      this.user = {
        id: 1,
        username: 'devuser',
        nickname: '开发测试用户',
        avatar: '',
        email: 'dev@inkframe.dev',
        role: 'user',
      }
      this.tenantId = 1
      if (typeof window !== 'undefined') {
        localStorage.setItem('auth_token', this.token)
        localStorage.setItem('auth_expires_at', String(fakeExp))
      }
    },

    initFromStorage() {
      if (typeof window === 'undefined') return
      const token = localStorage.getItem('auth_token')
      const expiresAt = localStorage.getItem('auth_expires_at')
      if (token && expiresAt) {
        const exp = Number(expiresAt)
        if (Date.now() / 1000 < exp) {
          this.token = token
          this.expiresAt = exp
          // 从 JWT payload 同步解析 role，确保中间件在 fetchMe 返回前也能正确判断权限
          try {
            const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
            if (payload.role) {
              this.user = this.user ?? { id: payload.user_id || 0, username: '', nickname: '', avatar: '', email: '', role: payload.role }
              this.user.role = payload.role
            }
          } catch { /* 解析失败时等 fetchMe 填充 */ }
          this.fetchMe()
        } else {
          localStorage.removeItem('auth_token')
          localStorage.removeItem('auth_expires_at')
        }
      }
    },
  },
})
