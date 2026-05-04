import { defineStore } from 'pinia'
import type { Video, StoryboardShot } from '~/types'
import { useTaskStore } from '~/stores/task'

interface VideoState {
  videos: Video[]
  currentVideo: Video | null
  storyboard: StoryboardShot[]
  currentShot: StoryboardShot | null
  loading: boolean
  generating: boolean
  error: string | null
  storyboardTaskId: string | null
  storyboardTaskStatus: 'pending' | 'running' | 'completed' | 'failed' | null
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
    storyboardTaskId: null,
    storyboardTaskStatus: null,
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
      const p = state.generationProgress
      if (p.totalShots === 0) return 0
      return Math.round((p.currentShot / p.totalShots) * 100)
    },
  },

  actions: {
    async fetchVideos(params?: { novel_id?: number }) {
      this.loading = true
      this.error = null

      try {
        const api = useVideoApi()
        const response = await api.getVideos(params)
        this.videos = response.data.items
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

    async createVideo(novelId: number, chapterId?: number, title?: string, artStyle?: string, aspectRatio?: string, frameRate?: number, qualityTier?: string, mode?: string) {
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
          mode,
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

    async generateStoryboard(videoId: number, provider?: string, userPrompt?: string, pacing?: string, targetDuration?: number) {
      this.generating = true
      this.error = null
      this.storyboardTaskId = null
      this.storyboardTaskStatus = 'pending'

      try {
        const api = useVideoApi()
        const body: { provider?: string; user_prompt?: string; pacing?: string; target_duration?: number } = {}
        if (provider) body.provider = provider
        if (userPrompt?.trim()) body.user_prompt = userPrompt.trim()
        if (pacing) body.pacing = pacing
        if (targetDuration) body.target_duration = targetDuration
        const response = await api.generateStoryboard(videoId, Object.keys(body).length ? body : undefined)
        const taskId = response.data?.task_id
        if (!taskId) throw new Error('未获取到任务ID')
        this.storyboardTaskId = taskId
        this.storyboardTaskStatus = 'pending'
        localStorage.setItem(`storyboard_task_${videoId}`, taskId)
        this.pollStoryboardTask(videoId, taskId)
        // 同步注册到统一任务面板（右下角【任务进度】）
        useTaskStore().trackTask(taskId)
      } catch (e: any) {
        this.error = e.message || 'Failed to generate storyboard'
        this.generating = false
        this.storyboardTaskStatus = 'failed'
        throw e
      }
    },

    async pollStoryboardTask(videoId: number, taskId: string) {
      const api = useVideoApi()
      const poll = async () => {
        try {
          const res = await api.getStoryboardGenStatus(videoId, taskId)
          const task = res.data
          this.storyboardTaskStatus = task.status
          if (task.status === 'completed') {
            this.generating = false
            localStorage.removeItem(`storyboard_task_${videoId}`)
            const shots = task.data?.shots
            if (shots) this.storyboard = shots
            return
          }
          if (task.status === 'failed') {
            this.generating = false
            localStorage.removeItem(`storyboard_task_${videoId}`)
            this.error = task.error || '分镜生成失败'
            return
          }
          // still running/pending — poll again
          setTimeout(poll, 1000)
        } catch {
          this.generating = false
          this.storyboardTaskStatus = 'failed'
          localStorage.removeItem(`storyboard_task_${videoId}`)
        }
      }
      setTimeout(poll, 1000)
    },

    // Resume polling for a task that survived a page refresh
    resumeStoryboardTask(videoId: number) {
      const taskId = localStorage.getItem(`storyboard_task_${videoId}`)
      if (!taskId) return
      this.storyboardTaskId = taskId
      this.storyboardTaskStatus = 'running'
      this.generating = true
      this.pollStoryboardTask(videoId, taskId)
      // 刷新后恢复时，task store 的 loadActiveTasks 通常已经覆盖；
      // 此处兜底注册，保证面板可见
      useTaskStore().trackTask(taskId)
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

    async generateShot(videoId: number, shotId: number, provider?: string) {
      try {
        const api = useVideoApi()
        const response = await api.generateShot(videoId, shotId, provider)
        // Backend now returns {task_id}
        return response.data
      } catch (e: any) {
        this.error = e.message || 'Failed to generate shot'
        throw e
      }
    },

    async batchGenerateShots(videoId: number, shotIds: number[], qualityTier?: string, provider?: string): Promise<string> {
      this.generating = true
      this.error = null
      try {
        const api = useVideoApi()
        const response = await api.batchGenerateShots(videoId, shotIds, qualityTier, provider)
        // Backend now returns {task_id} instead of shot array
        return (response.data as any)?.task_id as string
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
