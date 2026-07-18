import type { ScreenplayScene, UpdateScreenplayScenePayload } from '~/types'

export type { ScreenplayScene, UpdateScreenplayScenePayload }

export function useScreenplayApi() {
  const { request } = useApi()

  async function generateScreenplay(chapterId: number, provider?: string): Promise<ScreenplayScene[]> {
    const res: { code: number; data: ScreenplayScene[] } = await request(
      `/chapters/${chapterId}/screenplay/generate`,
      { method: 'POST', body: JSON.stringify({ provider: provider ?? '' }) },
    )
    return res.data ?? []
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

  return {
    generateScreenplay,
    listScreenplayScenes,
    updateScreenplayScene,
    lockScreenplayScene,
    deleteScreenplayScene,
    regenerateSceneStoryboard,
  }
}
