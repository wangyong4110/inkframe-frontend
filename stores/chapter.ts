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
  }),

  getters: {
    completedChapters: (state) => {
      return state.chapters.filter(c => c.status === 'completed')
    },

    currentChapterProgress: (state) => {
      if (!state.currentChapter) return 0
      return Math.min(100, (state.currentChapter.word_count / state.wordCountGoal) * 100)
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

    async generateChapter(novelId: number, chapterNo: number, prompt?: string) {
      this.generating = true
      this.error = null

      try {
        const api = useChapterApi()
        const response = await api.generateChapter(novelId, {
          chapter_no: chapterNo,
          prompt,
        })

        const index = this.chapters.findIndex(c => c.chapter_no === chapterNo)
        if (index !== -1) {
          this.chapters[index] = response.data
        } else {
          this.chapters.push(response.data)
        }

        this.currentChapter = response.data
        return response.data
      } catch (e: any) {
        this.error = e.message || 'Failed to generate chapter'
        throw e
      } finally {
        this.generating = false
      }
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

    clearCurrentChapter() {
      this.currentChapter = null
      this.qualityReport = null
    },
  },
})
