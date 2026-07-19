import type { ScreenplayScene, ScreenplaySceneVersion, UpdateScreenplayScenePayload } from '~/types'

export type { ScreenplayScene, ScreenplaySceneVersion, UpdateScreenplayScenePayload }

export function useScreenplayApi() {
  const { request, requestBlob } = useApi()

  // 分场剧本生成/重新生成由异步任务统一管理，返回 task_id 交给 useTaskStore().trackTask() 轮询；
  // 任务完成后场次数据需要重新 listScreenplayScenes() 拉取（结果不再随 HTTP 响应直接返回）。
  async function generateScreenplay(chapterId: number, provider?: string): Promise<string> {
    const res: { code: number; data: { task_id: string } } = await request(
      `/chapters/${chapterId}/screenplay/generate`,
      { method: 'POST', body: JSON.stringify({ provider: provider ?? '' }) },
    )
    return res.data.task_id
  }

  // "生成剧本"按钮的一键管线：提取并绑定角色/道具/场景 → 重新生成分场剧本 → 提交异步分镜生成任务，
  // 全部由同一个异步任务驱动。任务完成后的 data 里带 video_id/storyboard_task_id（若管线走到了那一步），
  // 供接着追踪分镜生成任务；交给 useTaskStore().trackTask() 轮询，和其它分镜生成任务用同一套面板。
  async function generateScreenplayFull(chapterId: number, provider?: string): Promise<string> {
    const res: { code: number; data: { task_id: string } } = await request(
      `/chapters/${chapterId}/screenplay/generate-full`,
      { method: 'POST', body: JSON.stringify({ provider: provider ?? '' }) },
    )
    return res.data.task_id
  }

  async function listScreenplayScenes(chapterId: number): Promise<ScreenplayScene[]> {
    const res: { code: number; data: ScreenplayScene[] } = await request(`/chapters/${chapterId}/screenplay`)
    return res.data ?? []
  }

  async function updateScreenplayScene(id: number, payload: UpdateScreenplayScenePayload): Promise<ScreenplayScene> {
    const res: { code: number; data: ScreenplayScene } = await request(`/screenplay-scenes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
    return res.data
  }

  async function lockScreenplayScene(id: number, locked: boolean): Promise<ScreenplayScene> {
    const res: { code: number; data: ScreenplayScene } = await request(`/screenplay-scenes/${id}/lock`, {
      method: 'PUT',
      body: JSON.stringify({ locked }),
    })
    return res.data
  }

  async function deleteScreenplayScene(id: number): Promise<void> {
    await request(`/screenplay-scenes/${id}`, { method: 'DELETE' })
  }

  // 只重新生成本场次对应的分镜（不影响同一视频里其它场次），异步任务，返回 task_id 供
  // useTaskStore().trackTask() 轮询——与整视频的分镜生成走同一套全局任务面板。
  async function regenerateSceneStoryboard(sceneId: number, provider?: string): Promise<string> {
    const res: { code: number; data: { task_id: string } } = await request(`/screenplay-scenes/${sceneId}/regenerate-storyboard`, {
      method: 'POST',
      body: JSON.stringify({ provider: provider ?? '' }),
    })
    return res.data.task_id
  }

  async function getSceneVersions(sceneId: number): Promise<ScreenplaySceneVersion[]> {
    const res: { code: number; data: ScreenplaySceneVersion[] } = await request(`/screenplay-scenes/${sceneId}/versions`)
    return res.data ?? []
  }

  async function restoreSceneVersion(sceneId: number, versionNo: number): Promise<ScreenplayScene> {
    const res: { code: number; data: ScreenplayScene } = await request(
      `/screenplay-scenes/${sceneId}/versions/${versionNo}/restore`,
      { method: 'POST' },
    )
    return res.data
  }

  async function exportScreenplay(chapterId: number, format: 'txt' | 'markdown' | 'docx'): Promise<Blob> {
    return requestBlob(`/chapters/${chapterId}/screenplay/export?format=${format}`)
  }

  return {
    generateScreenplay,
    generateScreenplayFull,
    listScreenplayScenes,
    updateScreenplayScene,
    lockScreenplayScene,
    deleteScreenplayScene,
    regenerateSceneStoryboard,
    getSceneVersions,
    restoreSceneVersion,
    exportScreenplay,
  }
}
