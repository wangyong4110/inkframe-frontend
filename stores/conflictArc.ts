import { defineStore } from 'pinia'
import type { ConflictArc, CreateConflictArcPayload, UpdateConflictArcPayload } from '~/composables/useConflictArcApi'

interface ConflictArcState {
  arcs: ConflictArc[]
  loading: boolean
  error: string | null
}

export const useConflictArcStore = defineStore('conflictArc', {
  state: (): ConflictArcState => ({
    arcs: [],
    loading: false,
    error: null,
  }),

  getters: {
    activeArcs: (state) => state.arcs.filter(a => !a.is_resolved),
    resolvedArcs: (state) => state.arcs.filter(a => a.is_resolved),
  },

  actions: {
    async fetchArcs(novelId: number) {
      this.loading = true
      this.error = null
      try {
        const api = useConflictArcApi()
        const res = await api.listConflictArcs(novelId)
        this.arcs = res.conflict_arcs ?? []
      } catch (e: any) {
        this.error = e.message || 'Failed to fetch conflict arcs'
      } finally {
        this.loading = false
      }
    },

    async createArc(novelId: number, payload: CreateConflictArcPayload) {
      this.loading = true
      this.error = null
      try {
        const api = useConflictArcApi()
        const arc = await api.createConflictArc(novelId, payload)
        this.arcs.push(arc)
        return arc
      } catch (e: any) {
        this.error = e.message || 'Failed to create conflict arc'
        throw e
      } finally {
        this.loading = false
      }
    },

    async updateArc(id: number, payload: UpdateConflictArcPayload) {
      this.loading = true
      this.error = null
      try {
        const api = useConflictArcApi()
        const updated = await api.updateConflictArc(id, payload)
        const idx = this.arcs.findIndex(a => a.id === id)
        if (idx !== -1) this.arcs[idx] = updated
        return updated
      } catch (e: any) {
        this.error = e.message || 'Failed to update conflict arc'
        throw e
      } finally {
        this.loading = false
      }
    },

    async deleteArc(id: number) {
      this.loading = true
      this.error = null
      try {
        const api = useConflictArcApi()
        await api.deleteConflictArc(id)
        this.arcs = this.arcs.filter(a => a.id !== id)
      } catch (e: any) {
        this.error = e.message || 'Failed to delete conflict arc'
        throw e
      } finally {
        this.loading = false
      }
    },

    async advancePhase(id: number) {
      this.loading = true
      this.error = null
      try {
        const api = useConflictArcApi()
        const updated = await api.advancePhase(id)
        const idx = this.arcs.findIndex(a => a.id === id)
        if (idx !== -1) this.arcs[idx] = updated
        return updated
      } catch (e: any) {
        this.error = e.message || 'Failed to advance phase'
        throw e
      } finally {
        this.loading = false
      }
    },
  },
})
