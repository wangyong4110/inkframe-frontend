import { useApi } from './useApi'
import type { Foreshadow, ForeshadowStats } from '~/types'

export interface ForeshadowTreeNode extends Foreshadow {
  children?: ForeshadowTreeNode[]
}

export function useForeshadowApi() {
  const { request } = useApi()

  return {
    list: (novelId: number) =>
      request<{ foreshadows: Foreshadow[]; total: number }>(`/novels/${novelId}/foreshadows`),

    listUnfulfilled: (novelId: number) =>
      request<{ foreshadows: Foreshadow[]; total: number }>(`/novels/${novelId}/foreshadows/unfulfilled`),

    getStats: (novelId: number, currentChapter = 0) =>
      request<ForeshadowStats>(`/novels/${novelId}/foreshadows/stats?current_chapter=${currentChapter}`),

    getTree: (novelId: number) =>
      request<{ tree: ForeshadowTreeNode[]; total: number }>(`/novels/${novelId}/foreshadows/tree`),

    create: (novelId: number, data: Partial<Foreshadow>) =>
      request<Foreshadow>(`/novels/${novelId}/foreshadows`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (novelId: number, id: number, data: Partial<Foreshadow> & Record<string, unknown>) =>
      request<Foreshadow>(`/novels/${novelId}/foreshadows/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    remove: (novelId: number, id: number) =>
      request(`/novels/${novelId}/foreshadows/${id}`, { method: 'DELETE' }),

    aiExtract: (novelId: number) =>
      request<{ foreshadows: Foreshadow[]; total: number }>(`/novels/${novelId}/foreshadows/extract`, {
        method: 'POST',
      }),

    addReinforcement: (novelId: number, foreshadowId: number, chapterNo: number, note: string) =>
      request<Foreshadow>(`/novels/${novelId}/foreshadows/${foreshadowId}/reinforce`, {
        method: 'POST',
        body: JSON.stringify({ chapter_no: chapterNo, note }),
      }),
  }
}
