import { defineStore } from 'pinia'
import type { Novel, NovelGenre, NovelStatus } from '~/types'
import { useNovelApi } from '~/composables/useApi'

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
  }),

  getters: {
    filteredNovels: (state) => {
      let result = state.novels

      if (state.filters.status) {
        result = result.filter(n => n.status === state.filters.status)
      }

      if (state.filters.genre) {
        result = result.filter(n => n.genre === state.filters.genre)
      }

      return result
    },

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
      } catch (e: any) {
        this.error = e.message || 'Failed to fetch novels'
      } finally {
        this.loading = false
      }
    },

    async fetchNovel(id: number) {
      this.loading = true
      this.error = null

      try {
        const api = useNovelApi()
        const response = await api.getNovel(id)
        this.currentNovel = response.data
        return response.data
      } catch (e: any) {
        this.error = e.message || 'Failed to fetch novel'
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
      } catch (e: any) {
        this.error = e.message || 'Failed to create novel'
        throw e
      } finally {
        this.loading = false
      }
    },

    async updateNovel(id: number, data: Partial<Novel>) {
      this.loading = true
      this.error = null

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
      } catch (e: any) {
        this.error = e.message || 'Failed to update novel'
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
        }
      } catch (e: any) {
        this.error = e.message || 'Failed to delete novel'
        throw e
      } finally {
        this.loading = false
      }
    },

    async generateOutline(id: number, chapterNum: number, prompt?: string) {
      this.loading = true
      this.error = null

      try {
        const api = useNovelApi()
        const response = await api.generateOutline(id, {
          chapter_num: chapterNum,
          prompt,
        })
        return response.data
      } catch (e: any) {
        this.error = e.message || 'Failed to generate outline'
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
