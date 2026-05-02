export interface PacingPoint {
  chapter_no: number
  tension_level: number
  act_no: number
  emotional_tone: string
  title: string
}

export interface PacingWarning {
  type: 'consecutive_low' | 'consecutive_high' | 'no_midpoint' | 'no_satisfaction'
  message: string
  chapters: number[]
}

export interface PacingHealth {
  status: 'healthy' | 'warning' | 'critical'
  warnings: PacingWarning[]
}

export function usePacingApi() {
  const { request } = useApi()

  async function getPacingCurve(novelId: number): Promise<{ points: PacingPoint[]; total: number }> {
    return request(`/novels/${novelId}/pacing-curve`)
  }

  async function getPacingHealth(novelId: number): Promise<PacingHealth> {
    return request(`/novels/${novelId}/pacing-health`)
  }

  return { getPacingCurve, getPacingHealth }
}
