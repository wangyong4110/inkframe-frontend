import { useApi } from './useApi'
import type { Foreshadow } from '~/types'

export function useForeshadowApi() {
  const { request } = useApi()

  return {
    list: (novelId: number) =>
      request<{ data: Foreshadow[] }>(`/novels/${novelId}/foreshadows`),

    listUnfulfilled: (novelId: number) =>
      request<{ data: Foreshadow[] }>(`/novels/${novelId}/foreshadows/unfulfilled`),

    create: (novelId: number, data: Partial<Foreshadow>) =>
      request<{ data: Foreshadow }>(`/novels/${novelId}/foreshadows`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),

    update: (novelId: number, id: number, data: Partial<Foreshadow>) =>
      request<{ data: Foreshadow }>(`/novels/${novelId}/foreshadows/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),

    remove: (novelId: number, id: number) =>
      request(`/novels/${novelId}/foreshadows/${id}`, { method: 'DELETE' }),
  }
}
