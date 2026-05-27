import type {
  SceneAnchor,
  SceneAnchorType,
  CreateSceneAnchorPayload,
  UpdateSceneAnchorPayload,
  ConsistencyLog,
} from '~/types'

export type { SceneAnchor, SceneAnchorType, CreateSceneAnchorPayload, UpdateSceneAnchorPayload, ConsistencyLog }

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

  async function editRefImage(anchorId: number, instruction: string): Promise<SceneAnchor> {
    const res: { code: number; data: SceneAnchor } = await request(
      `/scene-anchors/${anchorId}/edit-ref-image`,
      { method: 'POST', body: JSON.stringify({ instruction }) },
    )
    return res.data
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

  async function batchGenerateRefImages(novelId: number, provider?: string, force = false): Promise<{ task_id: string }> {
    const res: { code: number; data: { task_id: string } } = await request(
      `/novels/${novelId}/scene-anchors/batch-ref-images`,
      { method: 'POST', body: JSON.stringify({ provider: provider ?? '', force }) },
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
    editRefImage,
    lockRefImage,
    getConsistencyLogs,
    batchGenerateRefImages,
  }
}
