import { defineStore } from 'pinia'
import type { Character, CharacterRole } from '~/types'

interface CharacterState {
  characters: Character[]
  currentCharacter: Character | null
  loading: boolean
  error: string | null
}

export const useCharacterStore = defineStore('character', {
  state: (): CharacterState => ({
    characters: [],
    currentCharacter: null,
    loading: false,
    error: null,
  }),

  getters: {
    protagonists: (state) => {
      return state.characters.filter(c => c.role === 'protagonist')
    },

    antagonists: (state) => {
      return state.characters.filter(c => c.role === 'antagonist')
    },

    supporting: (state) => {
      return state.characters.filter(c => c.role === 'supporting')
    },

    charactersByRole: (state) => (role: CharacterRole) => {
      return state.characters.filter(c => c.role === role)
    },

    activeCharacters: (state) => {
      return state.characters.filter(c => c.role !== 'minor')
    },
  },

  actions: {
    async fetchCharacters(novelId: number) {
      this.loading = true
      this.error = null

      try {
        const api = useCharacterApi()
        const response = await api.getCharacters(novelId)
        this.characters = response.data
      } catch (e: any) {
        this.error = e.message || 'Failed to fetch characters'
      } finally {
        this.loading = false
      }
    },

    async fetchCharacter(id: number) {
      this.loading = true
      this.error = null

      try {
        const api = useCharacterApi()
        const response = await api.getCharacter(id)
        this.currentCharacter = response.data
        return response.data
      } catch (e: any) {
        this.error = e.message || 'Failed to fetch character'
        throw e
      } finally {
        this.loading = false
      }
    },

    async createCharacter(novelId: number, data: {
      name: string
      role: CharacterRole
      description?: string
    }) {
      this.loading = true
      this.error = null

      try {
        const api = useCharacterApi()
        const response = await api.createCharacter(novelId, data)
        this.characters.push(response.data)
        return response.data
      } catch (e: any) {
        this.error = e.message || 'Failed to create character'
        throw e
      } finally {
        this.loading = false
      }
    },

    async updateCharacter(id: number, data: Partial<Character>) {
      this.loading = true
      this.error = null

      try {
        const api = useCharacterApi()
        const response = await api.updateCharacter(id, data)

        const index = this.characters.findIndex(c => c.id === id)
        if (index !== -1) {
          this.characters[index] = response.data
        }

        if (this.currentCharacter?.id === id) {
          this.currentCharacter = response.data
        }

        return response.data
      } catch (e: any) {
        this.error = e.message || 'Failed to update character'
        throw e
      } finally {
        this.loading = false
      }
    },

    async deleteCharacter(id: number) {
      this.loading = true
      this.error = null

      try {
        const api = useCharacterApi()
        await api.deleteCharacter(id)
        this.characters = this.characters.filter(c => c.id !== id)

        if (this.currentCharacter?.id === id) {
          this.currentCharacter = null
        }
      } catch (e: any) {
        this.error = e.message || 'Failed to delete character'
        throw e
      } finally {
        this.loading = false
      }
    },

    async generateCharacterProfile(novelId: number, description: string) {
      this.loading = true
      this.error = null

      try {
        const api = useCharacterApi()
        const response = await api.generateCharacterProfile(novelId, description)
        this.characters.push(response.data)
        return response.data
      } catch (e: any) {
        this.error = e.message || 'Failed to generate character profile'
        throw e
      } finally {
        this.loading = false
      }
    },

    setCurrentCharacter(character: Character | null) {
      this.currentCharacter = character
    },

    clearCharacters() {
      this.characters = []
      this.currentCharacter = null
    },
  },
})
