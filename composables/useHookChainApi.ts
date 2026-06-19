export type HookType = 'chapter_end' | 'emotional' | 'mystery' | 'threat' | 'promise' | 'revelation' | 'decision' | 'action'

export interface HookChain {
  id: number
  tenant_id: number
  novel_id: number
  type: HookType
  description: string
  planted_at: number
  planned_payoff_at: number
  actual_payoff_at: number
  intensity: number
  is_fulfilled: boolean
  notes: string
  foreshadow_id?: number
  payoff_quality?: number
  payoff_notes?: string
  created_at: string
  updated_at: string
}

export interface CreateHookPayload {
  type: HookType
  description: string
  planted_at: number
  planned_payoff_at?: number
  intensity: number
  notes?: string
}

export interface UpdateHookPayload {
  type?: HookType
  description?: string
  planted_at?: number
  planned_payoff_at?: number
  intensity?: number
  notes?: string
}

export function useHookChainApi() {
  const { request } = useApi()

  async function listHooks(novelId: number): Promise<{ hooks: HookChain[]; total: number }> {
    return request(`/novels/${novelId}/hooks`)
  }

  async function createHook(novelId: number, payload: CreateHookPayload): Promise<HookChain> {
    return request(`/novels/${novelId}/hooks`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  }

  async function updateHook(id: number, payload: UpdateHookPayload): Promise<HookChain> {
    return request(`/hooks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  }

  async function deleteHook(id: number): Promise<void> {
    return request(`/hooks/${id}`, { method: 'DELETE' })
  }

  async function fulfillHook(id: number, actualChapter: number): Promise<HookChain> {
    return request(`/hooks/${id}/fulfill`, {
      method: 'PUT',
      body: JSON.stringify({ actual_chapter: actualChapter }),
    })
  }

  async function ratePayoff(id: number, quality: number, notes = ''): Promise<HookChain> {
    return request(`/hooks/${id}/payoff-quality`, {
      method: 'PUT',
      body: JSON.stringify({ payoff_quality: quality, payoff_notes: notes }),
    })
  }

  return { listHooks, createHook, updateHook, deleteHook, fulfillHook, ratePayoff }
}
