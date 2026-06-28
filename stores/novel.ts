import { defineStore } from 'pinia'
import type { Novel, NovelGenre, NovelStatus } from '~/types'
import { useNovelApi } from '~/composables/useNovelApi'

interface NovelState {
  novels: Novel[]
  currentNovel: Novel | null
  loading: boolean
  error: string | null
  pagination: {
    page: number
    pageSize: number
    total: number
  }
  filters: {
    status?: NovelStatus
    genre?: NovelGenre
  }
  _updateSeq: number
}

export const useNovelStore = defineStore('novel', {
  state: (): NovelState => ({
    novels: [],
    currentNovel: null,
    loading: false,
    error: null,
    pagination: {
      page: 1,
      pageSize: 20,
      total: 0,
    },
    filters: {},
    _updateSeq: 0,
  }),

  getters: {
    novelsByStatus: (state) => (status: NovelStatus) => {
      return state.novels.filter(n => n.status === status)
    },

    totalWords: (state) => {
      return state.novels.reduce((sum, n) => sum + n.total_words, 0)
    },

    totalChapters: (state) => {
      return state.novels.reduce((sum, n) => sum + n.chapter_count, 0)
    },
  },

  actions: {
    async fetchNovels() {
      this.loading = true
      this.error = null

      try {
        const api = useNovelApi()
        const response = await api.getNovels({
          page: this.pagination.page,
          page_size: this.pagination.pageSize,
          ...this.filters,
        })

        this.novels = response.data.items
        this.pagination.total = response.data.total
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e)
      } finally {
        this.loading = false
      }
    },

    async fetchNovel(id: number) {
      this.loading = true
      this.error = null
      // Snapshot the update counter before the API call. If updateNovel runs
      // while we await, the counter will have changed and we must not overwrite
      // the more-recent state with stale server data.
      const seqBeforeFetch = this._updateSeq

      try {
        const api = useNovelApi()
        const response = await api.getNovel(id)
        if (this._updateSeq === seqBeforeFetch) {
          this.currentNovel = response.data
        }
        return response.data
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e)
        throw e
      } finally {
        this.loading = false
      }
    },

    async createNovel(data: {
      title: string
      description?: string
      genre: NovelGenre
      worldview_id?: number
    }) {
      this.loading = true
      this.error = null

      try {
        const api = useNovelApi()
        const response = await api.createNovel(data)
        this.novels.unshift(response.data)
        return response.data
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e)
        throw e
      } finally {
        this.loading = false
      }
    },

    async updateNovel(id: number, data: Partial<Novel>) {
      this.loading = true
      this.error = null
      // Increment so any in-flight fetchNovel knows not to overwrite our state.
      this._updateSeq++

      // Save original for rollback on failure.
      const original = this.currentNovel?.id === id ? { ...this.currentNovel } : null

      // Optimistic update: apply changes immediately so the UI reflects the new
      // value before the API round-trip completes (avoids visible empty flash).
      if (this.currentNovel?.id === id) {
        this.currentNovel = { ...this.currentNovel, ...data }
      }

      try {
        const api = useNovelApi()
        const response = await api.updateNovel(id, data)

        const index = this.novels.findIndex(n => n.id === id)
        if (index !== -1) {
          this.novels[index] = response.data
        }

        if (this.currentNovel?.id === id) {
          this.currentNovel = response.data
        }

        return response.data
      } catch (e) {
        // Rollback optimistic update so UI doesn't show unsaved state.
        if (original && this.currentNovel?.id === id) {
          this.currentNovel = original
        }
        this.error = e instanceof Error ? e.message : String(e)
        throw e
      } finally {
        this.loading = false
      }
    },

    async deleteNovel(id: number) {
      this.loading = true
      this.error = null

      try {
        const api = useNovelApi()
        await api.deleteNovel(id)
        this.novels = this.novels.filter(n => n.id !== id)

        if (this.currentNovel?.id === id) {
          this.currentNovel = null

          // Clear dependent store state so stale data from the deleted novel is not
          // visible if the user navigates to another novel page in the same session.
          // Imported inside the action to avoid circular module dependencies.
          const { useChapterStore } = await import('~/stores/chapter')
          const { useCharacterStore } = await import('~/stores/character')
          const chapterStore = useChapterStore()
          chapterStore.chapters = []
          chapterStore.currentChapter = null

          const characterStore = useCharacterStore()
          characterStore.characters = []
          characterStore.currentCharacter = null
        }
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e)
        throw e
      } finally {
        this.loading = false
      }
    },

    async generateOutline(id: number, chapterNum: number, prompt?: string, overrides?: { max_tokens?: number; temperature?: number; timeout_seconds?: number; drama_template_id?: number }): Promise<string> {
      this.loading = true
      this.error = null

      try {
        const api = useNovelApi()
        const response = await api.generateOutline(id, {
          chapter_num: chapterNum,
          prompt,
          ...overrides,
        })
        return response.data?.task_id ?? ''
      } catch (e) {
        this.error = e instanceof Error ? e.message : String(e)
        throw e
      } finally {
        this.loading = false
      }
    },

    setFilters(filters: { status?: NovelStatus; genre?: NovelGenre }) {
      this.filters = { ...this.filters, ...filters }
      this.pagination.page = 1
      this.fetchNovels()
    },

    setPage(page: number) {
      this.pagination.page = page
      this.fetchNovels()
    },

    clearCurrentNovel() {
      this.currentNovel = null
    },
  },
})
