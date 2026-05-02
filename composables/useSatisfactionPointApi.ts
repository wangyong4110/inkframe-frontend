export type SatisfactionType = 'face_slap' | 'breakthrough' | 'reveal' | 'reunion' | 'revenge' | 'recognition' | 'other'

export interface SatisfactionPoint {
  id: number
  tenant_id: number
  novel_id: number
  chapter_id: number | null
  planned_chapter: number
  type: SatisfactionType
  description: string
  buildup_start: number
  intensity_target: number
  is_planned: boolean
  notes: string
  created_at: string
  updated_at: string
}

export interface CreateSatisfactionPointPayload {
  type: SatisfactionType
  description: string
  planned_chapter: number
  buildup_start?: number
  intensity_target?: number
  notes?: string
}

export interface UpdateSatisfactionPointPayload {
  type?: SatisfactionType
  description?: string
  planned_chapter?: number
  buildup_start?: number
  intensity_target?: number
  chapter_id?: number
  notes?: string
}

export function useSatisfactionPointApi() {
  const { request } = useApi()

  async function listSatisfactionPoints(novelId: number): Promise<{ satisfaction_points: SatisfactionPoint[]; total: number }> {
    return request(`/novels/${novelId}/satisfaction-points`)
  }

  async function createSatisfactionPoint(novelId: number, payload: CreateSatisfactionPointPayload): Promise<SatisfactionPoint> {
    return request(`/novels/${novelId}/satisfaction-points`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async function updateSatisfactionPoint(id: number, payload: UpdateSatisfactionPointPayload): Promise<SatisfactionPoint> {
    return request(`/satisfaction-points/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  async function deleteSatisfactionPoint(id: number): Promise<void> {
    return request(`/satisfaction-points/${id}`, { method: 'DELETE' })
  }

  return { listSatisfactionPoints, createSatisfactionPoint, updateSatisfactionPoint, deleteSatisfactionPoint }
}
