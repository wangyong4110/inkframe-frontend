import { defineStore } from 'pinia'
import type { Chapter, ChapterStatus, QualityReport } from '~/types'

interface ChapterState {
  chapters: Chapter[]
  currentChapter: Chapter | null
  loading: boolean
  generating: boolean
  error: string | null
  qualityReport: QualityReport | null
  wordCountGoal: number
  _genPollStop: (() => void) | null
  _genPollTimer: ReturnType<typeof setTimeout> | null
  _currentNovelId: number | null
}

export const useChapterStore = defineStore('chapter', {
  state: (): ChapterState => ({
    chapters: [],
    currentChapter: null,
    loading: false,
    generating: false,
    error: null,
    qualityReport: null,
    wordCountGoal: 3000,
    _genPollStop: null,
    _genPollTimer: null,
    _currentNovelId: null,
  }),

  getters: {
    completedChapters: (state) => {
      return state.chapters.filter(c => c.status === 'completed')
    },

    currentChapterProgress: (state) => {
      if (!state.currentChapter || !state.wordCountGoal) return 0
      return Math.min(100, ((state.currentChapter.word_count ?? 0) / state.wordCountGoal) * 100)
    },

    chaptersByStatus: (state) => (status: ChapterStatus) => {
      return state.chapters.filter(c => c.status === status)
    },

    totalWordCount: (state) => {
      return state.chapters.reduce((sum, c) => sum + c.word_count, 0)
    },
  },

  actions: {
    async fetchChapters(novelId: number) {
      this.loading = true
      this.error = null

      try {
        const api = useChapterApi()
        const response = await api.getChapters(novelId)
        this.chapters = response.data
      } catch (e: any) {
        this.error = e.message || 'Failed to fetch chapters'
      } finally {
        this.loading = false
      }
    },

    async fetchChapter(novelId: number, chapterNo: number) {
      this.loading = true
      this.error = null

      try {
        const api = useChapterApi()
        const response = await api.getChapter(novelId, chapterNo)
        this.currentChapter = response.data
        return response.data
      } catch (e: any) {
        this.error = e.message || 'Failed to fetch chapter'
        throw e
      } finally {
        this.loading = false
      }
    },

    async createChapter(novelId: number, chapterNo: number, title?: string) {
      this.loading = true
      this.error = null

      try {
        const api = useChapterApi()
        const response = await api.createChapter(novelId, {
          chapter_no: chapterNo,
          title,
        })
        this.chapters.push(response.data)
        return response.data
      } catch (e: any) {
        this.error = e.message || 'Failed to create chapter'
        throw e
      } finally {
        this.loading = false
      }
    },

    async updateChapter(novelId: number, chapterNo: number, data: Partial<Chapter>) {
      this.loading = true
      this.error = null

      try {
        const api = useChapterApi()
        const response = await api.updateChapter(novelId, chapterNo, data)

        const index = this.chapters.findIndex(c => c.chapter_no === chapterNo)
        if (index !== -1) {
          this.chapters[index] = response.data
        }

        if (this.currentChapter?.chapter_no === chapterNo) {
          this.currentChapter = response.data
        }

        return response.data
      } catch (e: any) {
        this.error = e.message || 'Failed to update chapter'
        throw e
      } finally {
        this.loading = false
      }
    },

    async generateChapter(novelId: number, chapterNo: number, prompt?: string, maxTokens?: number, model?: string, temperature?: number, timeoutSeconds?: number, wordCount?: number, webSearch?: boolean, wikiSearch?: boolean, useStoryPattern?: boolean) {
      this.generating = true
      this.error = null

      try {
        const api = useChapterApi()
        const response = await api.generateChapter(novelId, {
          chapter_no: chapterNo,
          prompt,
          word_count: wordCount,
          max_tokens: maxTokens,
          model,
          temperature,
          timeout_seconds: timeoutSeconds,
          web_search: webSearch || undefined,
          wiki_search: wikiSearch || undefined,
          use_story_pattern: useStoryPattern || undefined,
        })
        // Backend returns 202 { data: { task_id } } — do NOT overwrite currentChapter
        const taskId: string = (response as any).data?.task_id
        return { task_id: taskId }
      } catch (e: any) {
        this.error = e.message || 'Failed to generate chapter'
        this.generating = false
        throw e
      }
      // generating stays true until pollChapterGenTask resolves
    },

    async pollChapterGenTask(novelId: number, taskId: string): Promise<Chapter> {
      const { request } = useApi()

      // Cancel any previous poll before starting a new one
      this.stopGenPoll()

      return new Promise((resolve, reject) => {
        const abortController = new AbortController()

        const cleanup = () => {
          this._genPollStop = null
          if (this._genPollTimer !== null) {
            clearTimeout(this._genPollTimer)
            this._genPollTimer = null
          }
        }

        this._genPollStop = () => {
          abortController.abort()
          cleanup()
        }

        const poll = async () => {
          if (abortController.signal.aborted) return
          this._genPollTimer = null
          try {
            const res: any = await request(`/tasks/${taskId}`, { signal: abortController.signal })
            if (abortController.signal.aborted) return
            const task = res?.data ?? res
            const chapter: Chapter = task.data?.chapter ?? task.chapter
            if (task.status === 'completed' && chapter) {
              this.generating = false
              cleanup()
              const index = this.chapters.findIndex(c => c.chapter_no === chapter.chapter_no)
              if (index !== -1) {
                this.chapters[index] = chapter
              }
              if (this.currentChapter?.chapter_no === chapter.chapter_no) {
                this.currentChapter = chapter
              }
              resolve(chapter)
            } else if (task.status === 'failed') {
              this.generating = false
              cleanup()
              this.error = task.error || 'Chapter generation failed'
              reject(new Error(this.error || 'Chapter generation failed'))
            } else {
              this._genPollTimer = setTimeout(poll, 3000)
            }
          } catch (e: any) {
            if (abortController.signal.aborted) return
            this.generating = false
            cleanup()
            reject(e)
          }
        }

        this._genPollTimer = setTimeout(poll, 2000)
      })
    },

    stopGenPoll() {
      if (this._genPollStop) {
        this._genPollStop()
        // _genPollStop clears itself via cleanup()
      } else if (this._genPollTimer !== null) {
        clearTimeout(this._genPollTimer)
        this._genPollTimer = null
      }
      this.generating = false
    },

    async deleteChapter(novelId: number, chapterNo: number) {
      this.loading = true
      this.error = null

      try {
        const api = useChapterApi()
        await api.deleteChapter(novelId, chapterNo)
        this.chapters = this.chapters.filter(c => c.chapter_no !== chapterNo)

        if (this.currentChapter?.chapter_no === chapterNo) {
          this.currentChapter = null
        }
      } catch (e: any) {
        this.error = e.message || 'Failed to delete chapter'
        throw e
      } finally {
        this.loading = false
      }
    },

    async checkQuality(chapterId: number) {
      this.loading = true
      this.error = null

      try {
        const api = useQualityApi()
        const response = await api.checkQuality(chapterId)
        this.qualityReport = response.data
        return response.data
      } catch (e: any) {
        this.error = e.message || 'Failed to check quality'
        throw e
      } finally {
        this.loading = false
      }
    },

    setWordCountGoal(goal: number) {
      this.wordCountGoal = goal
    },

    // Partially update a chapter in the chapters list by id (e.g. after generation
    // completes) without refetching the full list from the server.
    updateChapterInList(update: { id: number; [key: string]: any }) {
      const idx = this.chapters.findIndex(c => c.id === update.id)
      if (idx !== -1) {
        Object.assign(this.chapters[idx], update)
      }
    },

    clearCurrentChapter() {
      this.currentChapter = null
      this.qualityReport = null
    },

    // Clear store data when switching to a different novel to prevent stale content
    // from the previous novel being briefly visible on the next novel's page.
    clearForNovel(novelId: number) {
      if (this._currentNovelId !== novelId) {
        this.chapters = []
        this.currentChapter = null
        this.qualityReport = null
        this._currentNovelId = novelId
      }
    },
  },
})
