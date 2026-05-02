import { defineStore } from 'pinia'
import type { SatisfactionPoint, CreateSatisfactionPointPayload, UpdateSatisfactionPointPayload } from '~/composables/useSatisfactionPointApi'

interface SatisfactionPointState {
  points: SatisfactionPoint[]
  loading: boolean
  error: string | null
}

export const useSatisfactionPointStore = defineStore('satisfactionPoint', {
  state: (): SatisfactionPointState => ({
    points: [],
    loading: false,
    error: null,
  }),

  getters: {
    plannedPoints: (state) => state.points.filter(p => p.is_planned),
    triggeredPoints: (state) => state.points.filter(p => !p.is_planned),
  },

  actions: {
    async fetchPoints(novelId: number) {
      this.loading = true
      this.error = null
      try {
        const api = useSatisfactionPointApi()
        const res = await api.listSatisfactionPoints(novelId)
        this.points = res.satisfaction_points ?? []
      } catch (e: any) {
        this.error = e.message || 'Failed to fetch satisfaction points'
      } finally {
        this.loading = false
      }
    },

    async createPoint(novelId: number, payload: CreateSatisfactionPointPayload) {
      this.loading = true
      this.error = null
      try {
        const api = useSatisfactionPointApi()
        const point = await api.createSatisfactionPoint(novelId, payload)
        this.points.push(point)
        return point
      } catch (e: any) {
        this.error = e.message || 'Failed to create satisfaction point'
        throw e
      } finally {
        this.loading = false
      }
    },

    async updatePoint(id: number, payload: UpdateSatisfactionPointPayload) {
      this.loading = true
      this.error = null
      try {
        const api = useSatisfactionPointApi()
        const updated = await api.updateSatisfactionPoint(id, payload)
        const idx = this.points.findIndex(p => p.id === id)
        if (idx !== -1) this.points[idx] = updated
        return updated
      } catch (e: any) {
        this.error = e.message || 'Failed to update satisfaction point'
        throw e
      } finally {
        this.loading = false
      }
    },

    async deletePoint(id: number) {
      this.loading = true
      this.error = null
      try {
        const api = useSatisfactionPointApi()
        await api.deleteSatisfactionPoint(id)
        this.points = this.points.filter(p => p.id !== id)
      } catch (e: any) {
        this.error = e.message || 'Failed to delete satisfaction point'
        throw e
      } finally {
        this.loading = false
      }
    },
  },
})
