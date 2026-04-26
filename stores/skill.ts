import { defineStore } from 'pinia'
import type { Skill, CreateSkillPayload, UpdateSkillPayload, GenerateSkillsPayload } from '~/composables/useSkillApi'

interface SkillState {
  skills: Skill[]
  currentSkill: Skill | null
  loading: boolean
  generating: boolean
  error: string | null
}

export const useSkillStore = defineStore('skill', {
  state: (): SkillState => ({
    skills: [],
    currentSkill: null,
    loading: false,
    generating: false,
    error: null,
  }),

  getters: {
    skillsByCharacter: (state) => (characterId: number | null) => {
      if (characterId == null) return state.skills.filter(s => !s.character_id)
      return state.skills.filter(s => s.character_id === characterId)
    },

    skillsByCategory: (state) => (category: string) => {
      return state.skills.filter(s => s.category === category)
    },

    activeSkills: (state) => {
      return state.skills.filter(s => s.status === 'active')
    },

    groupedByCharacter: (state) => {
      const groups = new Map<number | null, Skill[]>()
      for (const skill of state.skills) {
        const key = skill.character_id ?? null
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(skill)
      }
      return groups
    },
  },

  actions: {
    async fetchSkills(novelId: number, opts: { characterId?: number; category?: string; status?: string } = {}) {
      this.loading = true
      this.error = null
      try {
        const api = useSkillApi()
        const res = await api.listSkills(novelId, opts)
        this.skills = res.skills ?? []
      } catch (e: any) {
        this.error = e.message || 'Failed to fetch skills'
      } finally {
        this.loading = false
      }
    },

    async createSkill(novelId: number, payload: CreateSkillPayload) {
      this.loading = true
      this.error = null
      try {
        const api = useSkillApi()
        const skill = await api.createSkill(novelId, payload)
        this.skills.push(skill)
        return skill
      } catch (e: any) {
        this.error = e.message || 'Failed to create skill'
        throw e
      } finally {
        this.loading = false
      }
    },

    async updateSkill(skillId: number, payload: UpdateSkillPayload) {
      this.loading = true
      this.error = null
      try {
        const api = useSkillApi()
        const updated = await api.updateSkill(skillId, payload)
        const idx = this.skills.findIndex(s => s.id === skillId)
        if (idx !== -1) this.skills[idx] = updated
        if (this.currentSkill?.id === skillId) this.currentSkill = updated
        return updated
      } catch (e: any) {
        this.error = e.message || 'Failed to update skill'
        throw e
      } finally {
        this.loading = false
      }
    },

    async deleteSkill(skillId: number) {
      this.loading = true
      this.error = null
      try {
        const api = useSkillApi()
        await api.deleteSkill(skillId)
        this.skills = this.skills.filter(s => s.id !== skillId)
        if (this.currentSkill?.id === skillId) this.currentSkill = null
      } catch (e: any) {
        this.error = e.message || 'Failed to delete skill'
        throw e
      } finally {
        this.loading = false
      }
    },

    async generateSkills(novelId: number, payload: GenerateSkillsPayload) {
      this.generating = true
      this.error = null
      try {
        const api = useSkillApi()
        const res = await api.generateSkills(novelId, payload)
        this.skills.push(...(res.skills ?? []))
        return res.skills ?? []
      } catch (e: any) {
        this.error = e.message || 'Failed to generate skills'
        throw e
      } finally {
        this.generating = false
      }
    },

    setCurrentSkill(skill: Skill | null) {
      this.currentSkill = skill
    },

    clearSkills() {
      this.skills = []
      this.currentSkill = null
    },
  },
})
