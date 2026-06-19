export type ConflictArcType = 'internal' | 'interpersonal' | 'social' | 'philosophical'
export type ConflictPhase = 'setup' | 'ignition' | 'escalation' | 'turning_point' | 'climax' | 'aftershock' | 'resolution'

export interface ConflictArc {
  id: number
  tenant_id: number
  novel_id: number
  title: string
  type: ConflictArcType
  description: string
  antagonist: string
  start_chapter: number
  peak_chapter: number
  end_chapter: number
  current_phase: ConflictPhase
  is_resolved: boolean
  notes: string
  tension_levels?: string
  created_at: string
  updated_at: string
}

export interface CreateConflictArcPayload {
  title: string
  type: ConflictArcType
  description?: string
  antagonist?: string
  start_chapter?: number
  peak_chapter?: number
  end_chapter?: number
  notes?: string
}

export interface UpdateConflictArcPayload {
  title?: string
  type?: ConflictArcType
  description?: string
  antagonist?: string
  start_chapter?: number
  peak_chapter?: number
  end_chapter?: number
  notes?: string
}

export function useConflictArcApi() {
  const { request } = useApi()

  async function listConflictArcs(novelId: number): Promise<{ conflict_arcs: ConflictArc[]; total: number }> {
    return request(`/novels/${novelId}/conflict-arcs`)
  }

  async function createConflictArc(novelId: number, payload: CreateConflictArcPayload): Promise<ConflictArc> {
    return request(`/novels/${novelId}/conflict-arcs`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async function updateConflictArc(id: number, payload: UpdateConflictArcPayload): Promise<ConflictArc> {
    return request(`/conflict-arcs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  async function deleteConflictArc(id: number): Promise<void> {
    return request(`/conflict-arcs/${id}`, { method: 'DELETE' })
  }

  async function advancePhase(id: number): Promise<ConflictArc> {
    return request(`/conflict-arcs/${id}/advance-phase`, { method: 'PUT' })
  }

  async function updateTension(id: number, phase: string, level: number): Promise<ConflictArc> {
    return request(`/conflict-arcs/${id}/tension`, {
      method: 'PUT',
      body: JSON.stringify({ phase, tension_level: level }),
    })
  }

  return { listConflictArcs, createConflictArc, updateConflictArc, deleteConflictArc, advancePhase, updateTension }
}
