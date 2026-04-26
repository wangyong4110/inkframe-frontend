export interface Skill {
  id: number
  novel_id: number
  character_id?: number | null
  parent_id?: number | null
  name: string
  category: string   // 武技/法术/身法/心法/阵法/神通/秘法/特性
  skill_type: string // active/passive/toggle/ultimate
  level: number
  max_level: number
  realm: string
  description: string
  effect: string
  flavor_text: string
  cost: string
  cooldown: string
  tags: string
  acquired_chapter_no?: number | null
  acquired_desc: string
  status: string     // active/sealed/lost/disabled
  notes: string
  effect_image_url: string
  effect_visual_prompt: string
  created_at: string
  updated_at: string
}

export interface CreateSkillPayload {
  character_id?: number | null
  parent_id?: number | null
  name: string
  category?: string
  skill_type?: string
  level?: number
  max_level?: number
  realm?: string
  description?: string
  effect?: string
  flavor_text?: string
  cost?: string
  cooldown?: string
  tags?: string
  acquired_chapter_no?: number | null
  acquired_desc?: string
  notes?: string
}

export interface UpdateSkillPayload extends Partial<CreateSkillPayload> {
  status?: string
  effect_visual_prompt?: string
}

export interface GenerateSkillsPayload {
  character_id?: number | null
  count?: number
  hints?: string
}

export const SKILL_CATEGORIES = [
  '武技', '法术', '身法', '心法', '阵法', '神通', '秘法', '特性',
] as const

export const SKILL_TYPES = [
  { id: 'active', label: '主动' },
  { id: 'passive', label: '被动' },
  { id: 'toggle', label: '切换' },
  { id: 'ultimate', label: '绝技' },
] as const

export const SKILL_STATUSES = [
  { id: 'active', label: '正常' },
  { id: 'sealed', label: '封印' },
  { id: 'lost', label: '失传' },
  { id: 'disabled', label: '禁用' },
] as const

export function useSkillApi() {
  const { request } = useApi()

  async function listSkills(
    novelId: number,
    opts: { characterId?: number; category?: string; status?: string } = {},
  ): Promise<{ skills: Skill[]; total: number }> {
    const params = new URLSearchParams()
    if (opts.characterId != null) params.set('character_id', String(opts.characterId))
    if (opts.category) params.set('category', opts.category)
    if (opts.status) params.set('status', opts.status)
    const qs = params.toString()
    return request(`/novels/${novelId}/skills${qs ? '?' + qs : ''}`)
  }

  async function createSkill(novelId: number, payload: CreateSkillPayload): Promise<Skill> {
    return request(`/novels/${novelId}/skills`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async function getSkill(skillId: number): Promise<Skill> {
    return request(`/skills/${skillId}`)
  }

  async function updateSkill(skillId: number, payload: UpdateSkillPayload): Promise<Skill> {
    return request(`/skills/${skillId}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  async function deleteSkill(skillId: number): Promise<void> {
    return request(`/skills/${skillId}`, { method: 'DELETE' })
  }

  async function generateSkills(
    novelId: number,
    payload: GenerateSkillsPayload,
  ): Promise<{ skills: Skill[]; count: number }> {
    return request(`/novels/${novelId}/skills/generate`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async function generateSkillEffect(skillId: number): Promise<Skill> {
    return request(`/skills/${skillId}/effect-image`, { method: 'POST' })
  }

  return { listSkills, createSkill, getSkill, updateSkill, deleteSkill, generateSkills, generateSkillEffect }
}
