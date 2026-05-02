import { defineStore } from 'pinia'
import type { SceneAnchor, CreateSceneAnchorPayload, UpdateSceneAnchorPayload } from '~/composables/useSceneAnchorApi'

interface SceneAnchorState {
  anchors: SceneAnchor[]
  loading: boolean
  error: string | null
}

export const useSceneAnchorStore = defineStore('sceneAnchor', {
  state: (): SceneAnchorState => ({
    anchors: [],
    loading: false,
    error: null,
  }),

  getters: {
    lockedAnchors: (state) => state.anchors.filter(a => a.ref_image_url !== ''),
    unlockedAnchors: (state) => state.anchors.filter(a => !a.ref_image_url),
  },

  actions: {
    async fetchAnchors(novelId: number) {
      this.loading = true
      this.error = null
      try {
        const api = useSceneAnchorApi()
        const res = await api.listSceneAnchors(novelId)
        this.anchors = res.scene_anchors ?? []
      } catch (e: any) {
        this.error = e.message || 'Failed to fetch scene anchors'
      } finally {
        this.loading = false
      }
    },

    async createAnchor(novelId: number, payload: CreateSceneAnchorPayload) {
      this.loading = true
      this.error = null
      try {
        const api = useSceneAnchorApi()
        const anchor = await api.createSceneAnchor(novelId, payload)
        this.anchors.push(anchor)
        return anchor
      } catch (e: any) {
        this.error = e.message || 'Failed to create scene anchor'
        throw e
      } finally {
        this.loading = false
      }
    },

    async updateAnchor(id: number, payload: UpdateSceneAnchorPayload) {
      this.loading = true
      this.error = null
      try {
        const api = useSceneAnchorApi()
        const updated = await api.updateSceneAnchor(id, payload)
        const idx = this.anchors.findIndex(a => a.id === id)
        if (idx !== -1) this.anchors[idx] = updated
        return updated
      } catch (e: any) {
        this.error = e.message || 'Failed to update scene anchor'
        throw e
      } finally {
        this.loading = false
      }
    },

    async deleteAnchor(id: number) {
      this.loading = true
      this.error = null
      try {
        const api = useSceneAnchorApi()
        await api.deleteSceneAnchor(id)
        this.anchors = this.anchors.filter(a => a.id !== id)
      } catch (e: any) {
        this.error = e.message || 'Failed to delete scene anchor'
        throw e
      } finally {
        this.loading = false
      }
    },

    async extractAnchors(novelId: number, chapterContent: string, novelTitle?: string): Promise<SceneAnchor[]> {
      this.loading = true
      this.error = null
      try {
        const api = useSceneAnchorApi()
        const newAnchors = await api.extractSceneAnchors(novelId, { chapter_content: chapterContent, novel_title: novelTitle })
        // 追加到列表（去重）
        const existingIds = new Set(this.anchors.map(a => a.id))
        for (const a of newAnchors) {
          if (!existingIds.has(a.id)) this.anchors.push(a)
        }
        return newAnchors
      } catch (e: any) {
        this.error = e.message || 'Failed to extract scene anchors'
        throw e
      } finally {
        this.loading = false
      }
    },

    async generateRefImage(anchorId: number, provider?: string): Promise<void> {
      const api = useSceneAnchorApi()
      const updated = await api.generateRefImage(anchorId, provider)
      const idx = this.anchors.findIndex(a => a.id === anchorId)
      if (idx !== -1) this.anchors[idx] = updated
    },

    async lockRefImage(anchorId: number, imageUrl: string, shotId?: number): Promise<void> {
      try {
        const api = useSceneAnchorApi()
        await api.lockRefImage(anchorId, { image_url: imageUrl, shot_id: shotId })
        // 刷新本条锚点状态
        const idx = this.anchors.findIndex(a => a.id === anchorId)
        if (idx !== -1) {
          this.anchors[idx].ref_image_url = imageUrl
          this.anchors[idx].ref_image_locked_at = new Date().toISOString()
          if (shotId !== undefined) this.anchors[idx].ref_image_shot_id = shotId
        }
      } catch (e: any) {
        this.error = e.message || 'Failed to lock ref image'
        throw e
      }
    },
  },
})
