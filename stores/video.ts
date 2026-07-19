import { defineStore } from 'pinia'
import type { Video, StoryboardShot, VideoBGMSegment, AsyncTask } from '~/types'
import { useTaskStore } from '~/stores/task'

export interface GenerateStoryboardOptions {
  provider?: string
  maxTokens?: number
  temperature?: number
  timeoutSeconds?: number
}

export interface CreateVideoOptions {
  novelId: number
  chapterId?: number
  title?: string
  artStyle?: string
  aspectRatio?: string
  frameRate?: number
  qualityTier?: string
  mode?: string
  visualMode?: string
  threeDStyle?: string
}

interface VideoState {
  videos: Video[]
  currentVideo: Video | null
  storyboard: StoryboardShot[]
  currentShot: StoryboardShot | null
  loading: boolean
  generating: boolean
  /** true only when the current storyboard task was submitted in the current browser session (not resumed from localStorage) */
  storyboardTaskIsNew: boolean
  error: string | null
  storyboardTaskId: string | null
  storyboardTaskStatus: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | null
  synthesizeTaskId: string | null
  synthesizeStatus: string | null
}

export const useVideoStore = defineStore('video', {
  state: (): VideoState => ({
    videos: [],
    currentVideo: null,
    storyboard: [],
    currentShot: null,
    loading: false,
    generating: false,
    storyboardTaskIsNew: false,
    error: null,
    storyboardTaskId: null,
    storyboardTaskStatus: null,
    synthesizeTaskId: null,
    synthesizeStatus: null,
  }),

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

    async createVideo(opts: CreateVideoOptions) {
      const { novelId, chapterId, title, artStyle, aspectRatio, frameRate, qualityTier, mode, visualMode, threeDStyle } = opts
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
          visual_mode: visualMode || undefined,
          three_d_style: threeDStyle || undefined,
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

    async fetchStoryboard(videoId: number) {
      // Show skeleton only on initial load; silent background refresh when list already populated
      const isInitial = this.storyboard.length === 0
      if (isInitial) this.loading = true
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
        if (isInitial) this.loading = false
      }
    },

    async generateStoryboard(videoId: number, opts: GenerateStoryboardOptions = {}) {
      const { provider, maxTokens, temperature, timeoutSeconds } = opts
      this.generating = true
      this.storyboardTaskIsNew = true
      this.error = null
      this.storyboardTaskId = null
      this.storyboardTaskStatus = 'pending'

      try {
        const api = useVideoApi()
        const body: { provider?: string; max_tokens?: number; temperature?: number; timeout_seconds?: number } = {}
        if (provider) body.provider = provider
        if (maxTokens && maxTokens > 0) body.max_tokens = maxTokens
        if (temperature && temperature > 0) body.temperature = temperature
        if (timeoutSeconds && timeoutSeconds > 0) body.timeout_seconds = timeoutSeconds
        const response = await api.generateStoryboard(videoId, Object.keys(body).length ? body : undefined)
        const taskId = response.data?.task_id
        if (!taskId) throw new Error('未获取到任务ID')
        this.storyboardTaskId = taskId
        this.storyboardTaskStatus = 'pending'
        localStorage.setItem(`storyboard_task_${videoId}`, taskId)
        // 统一走全局任务轮询（同时挂到右下角【任务进度】面板），不再自建一套轮询逻辑
        useTaskStore().trackTask(taskId, (task) => this._onStoryboardTaskDone(videoId, task))
      } catch (e: any) {
        this.error = e.message || 'Failed to generate storyboard'
        this.generating = false
        this.storyboardTaskStatus = 'failed'
        throw e
      }
    },

    // 分镜任务结束（completed/failed/cancelled/dead）时的公共收尾逻辑，由 useTaskStore 的
    // onDone 回调触发。Complete() 只在 result 里存 shot_count，不存完整分镜数组，所以
    // completed 时需要重新拉取一次列表，而不是尝试读一个从未写入过的字段。
    _onStoryboardTaskDone(videoId: number, task: AsyncTask) {
      this.generating = false
      this.storyboardTaskStatus = task.status as VideoState['storyboardTaskStatus']
      localStorage.removeItem(`storyboard_task_${videoId}`)
      if (task.status === 'completed') {
        this.fetchStoryboard(videoId)
        if (task.error) this.error = task.error // 部分完成的警告文案，非硬失败
      } else if (task.status === 'failed' || task.status === 'dead') {
        this.error = task.error || '分镜生成失败'
      }
    },

    stopStoryboardPoll() {
      if (this.storyboardTaskId) {
        useTaskStore().stopPolling(this.storyboardTaskId)
      }
    },

    // Resume polling for a task that survived a page refresh
    resumeStoryboardTask(videoId: number) {
      const taskId = localStorage.getItem(`storyboard_task_${videoId}`)
      if (!taskId) return
      this.storyboardTaskId = taskId
      this.storyboardTaskStatus = 'running'
      this.generating = true
      this.storyboardTaskIsNew = false  // resumed task — don't show "generated" toast
      useTaskStore().trackTask(taskId, (task) => this._onStoryboardTaskDone(videoId, task))
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

    async regenerateShotPrompt(videoId: number, shotId: number) {
      // 不设置 this.loading —— 这个全局标记会让 ScriptTab 的分镜列表整个换成骨架屏占位
      // （v-else-if="videoStore.loading"）。这个操作是单个分镜的 LLM 调用，耗时数秒到数十秒，
      // 之前误用 this.loading 会导致点击按钮后整个列表（含正在编辑的表单）被骨架屏替换掉，
      // 看起来就像"页面变空白"。单分镜级别的 loading 反馈由调用方组件自己的本地状态处理。
      this.error = null
      try {
        const api = useVideoApi()
        const response = await api.regenerateShotPrompt(videoId, shotId)

        const index = this.storyboard.findIndex(s => s.id === shotId)
        if (index !== -1) {
          this.storyboard[index] = response.data
        }
        if (this.currentShot?.id === shotId) {
          this.currentShot = response.data
        }
        return response.data
      } catch (e: any) {
        this.error = e.message || 'Failed to regenerate shot prompt'
        throw e
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
        // Backend returns {task_id}
        return response.data?.task_id as string
      } catch (e: any) {
        this.error = e.message || 'Failed to batch generate shots'
        throw e
      } finally {
        this.generating = false
      }
    },

    async batchGenerateShotImages(videoId: number, shotIds: number[], force = false): Promise<string> {
      this.error = null
      try {
        const api = useVideoApi()
        const response = await api.batchGenerateShotImages(videoId, shotIds, force)
        return response.data?.task_id as string
      } catch (e: any) {
        this.error = e.message || 'Failed to batch generate images'
        throw e
      }
    },

    async batchGenerateShotClips(videoId: number, shotIds: number[]): Promise<string> {
      this.error = null
      try {
        const api = useVideoApi()
        const response = await api.batchGenerateShotClips(videoId, shotIds)
        return response.data?.task_id as string
      } catch (e: any) {
        this.error = e.message || 'Failed to batch generate clips'
        throw e
      }
    },

    async reviewStoryboard(videoId: number, provider?: string, previousScore?: number, onDone?: (task: import('~/types').AsyncTask) => void) {
      const api = useVideoApi()
      const response = await api.reviewStoryboard(videoId, provider, previousScore)
      const taskId = response.data?.task_id
      if (!taskId) throw new Error('未获取到审查任务 ID')
      useTaskStore().trackTask(taskId, onDone)
      return taskId
    },

  },
})
