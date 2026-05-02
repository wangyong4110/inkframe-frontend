import { defineStore } from 'pinia'
import type { HookChain, CreateHookPayload, UpdateHookPayload } from '~/composables/useHookChainApi'

interface HookChainState {
  hooks: HookChain[]
  loading: boolean
  error: string | null
}

export const useHookChainStore = defineStore('hookChain', {
  state: (): HookChainState => ({
    hooks: [],
    loading: false,
    error: null,
  }),

  getters: {
    pendingHooks: (state) => state.hooks.filter(h => !h.is_fulfilled),
    fulfilledHooks: (state) => state.hooks.filter(h => h.is_fulfilled),
  },

  actions: {
    async fetchHooks(novelId: number) {
      this.loading = true
      this.error = null
      try {
        const api = useHookChainApi()
        const res = await api.listHooks(novelId)
        this.hooks = res.hooks ?? []
      } catch (e: any) {
        this.error = e.message || 'Failed to fetch hooks'
      } finally {
        this.loading = false
      }
    },

    async createHook(novelId: number, payload: CreateHookPayload) {
      this.loading = true
      this.error = null
      try {
        const api = useHookChainApi()
        const hook = await api.createHook(novelId, payload)
        this.hooks.push(hook)
        return hook
      } catch (e: any) {
        this.error = e.message || 'Failed to create hook'
        throw e
      } finally {
        this.loading = false
      }
    },

    async updateHook(id: number, payload: UpdateHookPayload) {
      this.loading = true
      this.error = null
      try {
        const api = useHookChainApi()
        const updated = await api.updateHook(id, payload)
        const idx = this.hooks.findIndex(h => h.id === id)
        if (idx !== -1) this.hooks[idx] = updated
        return updated
      } catch (e: any) {
        this.error = e.message || 'Failed to update hook'
        throw e
      } finally {
        this.loading = false
      }
    },

    async deleteHook(id: number) {
      this.loading = true
      this.error = null
      try {
        const api = useHookChainApi()
        await api.deleteHook(id)
        this.hooks = this.hooks.filter(h => h.id !== id)
      } catch (e: any) {
        this.error = e.message || 'Failed to delete hook'
        throw e
      } finally {
        this.loading = false
      }
    },

    async fulfillHook(id: number, actualChapter: number) {
      this.loading = true
      this.error = null
      try {
        const api = useHookChainApi()
        const updated = await api.fulfillHook(id, actualChapter)
        const idx = this.hooks.findIndex(h => h.id === id)
        if (idx !== -1) this.hooks[idx] = updated
        return updated
      } catch (e: any) {
        this.error = e.message || 'Failed to fulfill hook'
        throw e
      } finally {
        this.loading = false
      }
    },
  },
})
