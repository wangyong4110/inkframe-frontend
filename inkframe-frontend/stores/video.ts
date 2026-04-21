import { defineStore } from 'pinia'
import type { Video, StoryboardShot } from '~/types'

interface VideoState {
  videos: Video[]
  currentVideo: Video | null
  storyboard: StoryboardShot[]
  currentShot: StoryboardShot | null
  loading: boolean
  generating: boolean
  error: string | null
  generationProgress: {
    currentShot: number
    totalShots: number
    currentFrame: number
    totalFrames: number
  }
}

export const useVideoStore = defineStore('video', {
  state: (): VideoState => ({
    videos: [],
    currentVideo: null,
    storyboard: [],
    currentShot: null,
    loading: false,
    generating: false,
    error: null,
    generationProgress: {
      currentShot: 0,
      totalShots: 0,
      currentFrame: 0,
      totalFrames: 0,
    },
  }),

  getters: {
    completedVideos: (state) => {
      return state.videos.filter(v => v.status === 'completed')
    },

    pendingVideos: (state) => {
      return state.videos.filter(v => v.status === 'planning')
    },

    generationProgressPercent: (state) => {
      const { currentShot, totalShots } = state.generationProgress
      if (totalShots === 0) return 0
      return Math.round((currentShot / totalShots) * 100)
    },
  },

  actions: {
    async fetchVideos(params?: { novel_id?: number }) {
      this.loading = true
      this.error = null

      try {
        const api = useVideoApi()
        const response = await api.getVideos(params)
        this.videos = response.data
      } catch (e: any) {
        this.error = e.message || 'Failed to fetch videos'
      } finally {
        this.loading = false
      }
    },

    async fetchVideo(id: number) {
      this.loading = true
      this.error = null

      try {
        const api = useVideoApi()
        const response = await api.getVideo(id)
        this.currentVideo = response.data
        return response.data
      } catch (e: any) {
        this.error = e.message || 'Failed to fetch video'
        throw e
      } finally {
        this.loading = false
      }
    },

    async createVideo(novelId: number, chapterId?: number, title?: string, artStyle?: string, aspectRatio?: string, frameRate?: number, qualityTier?: string) {
      this.loading = true
      this.error = null

      try {
        const api = useVideoApi()
        const response = await api.createVideo({
          novel_id: novelId,
          chapter_id: chapterId,
          title,
          art_style: artStyle,
          aspect_ratio: aspectRatio,
          frame_rate: frameRate,
          quality_tier: qualityTier,
        })
        this.videos.unshift(response.data)
        return response.data
      } catch (e: any) {
        this.error = e.message || 'Failed to create video'
        throw e
      } finally {
        this.loading = false
      }
    },

    async updateVideo(id: number, data: Partial<Video>) {
      this.loading = true
      this.error = null

      try {
        const api = useVideoApi()
        const response = await api.updateVideo(id, data)

        const index = this.videos.findIndex(v => v.id === id)
        if (index !== -1) {
          this.videos[index] = response.data
        }

        if (this.currentVideo?.id === id) {
          this.currentVideo = response.data
        }

        return response.data
      } catch (e: any) {
        this.error = e.message || 'Failed to update video'
        throw e
      } finally {
        this.loading = false
      }
    },

    async deleteVideo(id: number) {
      this.loading = true
      this.error = null

      try {
        const api = useVideoApi()
        await api.deleteVideo(id)
        this.videos = this.videos.filter(v => v.id !== id)

        if (this.currentVideo?.id === id) {
          this.currentVideo = null
        }
      } catch (e: any) {
        this.error = e.message || 'Failed to delete video'
        throw e
      } finally {
        this.loading = false
      }
    },

    async fetchStoryboard(videoId: number) {
      this.loading = true
      this.error = null

      try {
        const api = useVideoApi()
        const response = await api.getStoryboard(videoId)
        this.storyboard = response.data
        return response.data
      } catch (e: any) {
        this.error = e.message || 'Failed to fetch storyboard'
        throw e
      } finally {
        this.loading = false
      }
    },

    async generateStoryboard(videoId: number) {
      this.generating = true
      this.error = null

      try {
        const api = useVideoApi()
        const response = await api.generateStoryboard(videoId)
        this.storyboard = response.data
        return response.data
      } catch (e: any) {
        this.error = e.message || 'Failed to generate storyboard'
        throw e
      } finally {
        this.generating = false
      }
    },

    async updateShot(videoId: number, shotId: number, data: Partial<StoryboardShot>) {
      this.loading = true
      this.error = null

      try {
        const api = useVideoApi()
        const response = await api.updateStoryboardShot(videoId, shotId, data)

        const index = this.storyboard.findIndex(s => s.id === shotId)
        if (index !== -1) {
          this.storyboard[index] = response.data
        }

        if (this.currentShot?.id === shotId) {
          this.currentShot = response.data
        }

        return response.data
      } catch (e: any) {
        this.error = e.message || 'Failed to update shot'
        throw e
      } finally {
        this.loading = false
      }
    },

    async generateShot(videoId: number, shotId: number) {
      try {
        const api = useVideoApi()
        const response = await api.generateShot(videoId, shotId)
        const index = this.storyboard.findIndex(s => s.id === shotId)
        if (index !== -1) this.storyboard[index] = response.data
        return response.data
      } catch (e: any) {
        this.error = e.message || 'Failed to generate shot'
        throw e
      }
    },

    async batchGenerateShots(videoId: number, shotIds: number[], qualityTier?: string) {
      this.generating = true
      this.error = null
      try {
        const api = useVideoApi()
        const response = await api.batchGenerateShots(videoId, shotIds, qualityTier)
        for (const updated of response.data) {
          const index = this.storyboard.findIndex(s => s.id === updated.id)
          if (index !== -1) this.storyboard[index] = updated
        }
        return response.data
      } catch (e: any) {
        this.error = e.message || 'Failed to batch generate shots'
        throw e
      } finally {
        this.generating = false
      }
    },

    setCurrentShot(shot: StoryboardShot | null) {
      this.currentShot = shot
    },

    updateGenerationProgress(progress: Partial<VideoState['generationProgress']>) {
      this.generationProgress = { ...this.generationProgress, ...progress }
    },

    clearCurrentVideo() {
      this.currentVideo = null
      this.storyboard = []
      this.currentShot = null
    },
  },
})
