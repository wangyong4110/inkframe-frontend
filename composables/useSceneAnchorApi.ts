export type SceneAnchorType = 'interior' | 'exterior' | 'imaginary' | string

export interface SceneAnchor {
  id: number
  tenant_id: number
  novel_id: number
  name: string
  type: SceneAnchorType
  description: string
  prompt_lock: string
  style_tokens: string
  ref_image_url: string
  notes: string
  // 扩展字段
  ref_image_locked_at?: string
  ref_image_shot_id?: number
  usage_count: number
  avg_cons_score: number
  parent_anchor_id?: number
  variant?: string
  created_at: string
  updated_at: string
}

export interface CreateSceneAnchorPayload {
  name: string
  type?: SceneAnchorType
  description?: string
  prompt_lock?: string
  style_tokens?: string
  notes?: string
  variant?: string
  parent_anchor_id?: number
}

export type UpdateSceneAnchorPayload = Partial<CreateSceneAnchorPayload>

export interface ConsistencyLog {
  id: number
  shot_id: number
  anchor_id: number
  overall_score: number
  arch_score: number
  light_score: number
  atmo_score: number
  passed: boolean
  attempt: number
  created_at: string
}

export function useSceneAnchorApi() {
  const { request } = useApi()

  async function getSceneAnchor(id: number): Promise<SceneAnchor> {
    const res: { code: number; data: SceneAnchor } = await request(`/scene-anchors/${id}`)
    return res.data
  }

  async function listSceneAnchors(novelId: number): Promise<{ scene_anchors: SceneAnchor[]; total: number }> {
    const res: { code: number; data: { scene_anchors: SceneAnchor[]; total: number } } = await request(`/novels/${novelId}/scene-anchors`)
    return res.data ?? { scene_anchors: [], total: 0 }
  }

  async function createSceneAnchor(novelId: number, payload: CreateSceneAnchorPayload): Promise<SceneAnchor> {
    const res: { code: number; data: SceneAnchor } = await request(`/novels/${novelId}/scene-anchors`, {
      method: 'POST',
      body: JSON.stringify(payload),
    })
    return res.data
  }

  async function updateSceneAnchor(id: number, payload: UpdateSceneAnchorPayload): Promise<SceneAnchor> {
    const res: { code: number; data: SceneAnchor } = await request(`/scene-anchors/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
    return res.data
  }

  async function deleteSceneAnchor(id: number): Promise<void> {
    return request(`/scene-anchors/${id}`, { method: 'DELETE' })
  }

  async function setShotAnchor(videoId: number, shotId: number, anchorId: number | null): Promise<void> {
    return request(`/videos/${videoId}/shots/${shotId}/anchor`, {
      method: 'PUT',
      body: JSON.stringify({ anchor_id: anchorId }),
    })
  }

  async function extractSceneAnchors(
    novelId: number,
    payload: { chapter_content: string; novel_title?: string },
  ): Promise<SceneAnchor[]> {
    const res: { code: number; data: { scene_anchors: SceneAnchor[]; total: number } } = await request(
      `/novels/${novelId}/scene-anchors/extract`,
      { method: 'POST', body: JSON.stringify(payload) },
    )
    return res.data?.scene_anchors ?? []
  }

  async function generateRefImage(anchorId: number, provider?: string): Promise<SceneAnchor> {
    const res: { code: number; data: SceneAnchor } = await request(
      `/scene-anchors/${anchorId}/generate-ref-image`,
      { method: 'POST', body: JSON.stringify({ provider: provider ?? '' }) },
    )
    return res.data
  }

  async function lockRefImage(
    anchorId: number,
    payload: { image_url: string; shot_id?: number },
  ): Promise<SceneAnchor> {
    const res: { code: number; data: SceneAnchor } = await request(`/scene-anchors/${anchorId}/ref-image`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
    return res.data
  }

  async function getConsistencyLogs(anchorId: number): Promise<ConsistencyLog[]> {
    const res: { code: number; data: { logs: ConsistencyLog[]; total: number } } = await request(
      `/scene-anchors/${anchorId}/consistency-logs`,
    )
    return res.data?.logs ?? []
  }

  async function aiExtractFromNovel(novelId: number): Promise<{ task_id: string }> {
    const res: { code: number; data: { task_id: string } } = await request(
      `/novels/${novelId}/scene-anchors/ai-extract`,
      { method: 'POST' },
    )
    return res.data
  }

  async function batchGenerateRefImages(novelId: number, provider?: string): Promise<{ task_id: string }> {
    const res: { code: number; data: { task_id: string } } = await request(
      `/novels/${novelId}/scene-anchors/batch-ref-images`,
      { method: 'POST', body: JSON.stringify({ provider: provider ?? '' }) },
    )
    return res.data
  }

  return {
    getSceneAnchor,
    listSceneAnchors,
    createSceneAnchor,
    updateSceneAnchor,
    deleteSceneAnchor,
    setShotAnchor,
    extractSceneAnchors,
    aiExtractFromNovel,
    generateRefImage,
    lockRefImage,
    getConsistencyLogs,
    batchGenerateRefImages,
  }
}
