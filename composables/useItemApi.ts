import type { Item, EffectiveItem, ApiResponse } from '~/types'

export const useItemApi = () => {
  const { request, requestMultipart } = useApi()

  const listItems = (novelId: number) =>
    request<ApiResponse<Item[]>>(`/novels/${novelId}/items`)

  const createItem = (novelId: number, data: Partial<Item>) =>
    request<ApiResponse<Item>>(`/novels/${novelId}/items`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const getItem = (id: number) =>
    request<ApiResponse<Item>>(`/items/${id}`)

  const updateItem = (id: number, data: Partial<Item>) =>
    request<ApiResponse<Item>>(`/items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteItem = (id: number) =>
    request<void>(`/items/${id}`, { method: 'DELETE' })

  const uploadItemImage = (id: number, file: File) =>
    requestMultipart<{ url: string; item: Item }>(`/items/${id}/image/upload`, file)

  const uploadItemReference = (id: number, file: File) =>
    requestMultipart<{ url: string; item: Item }>(`/items/${id}/reference/upload`, file)

  const generateItemImage = (id: number, referenceImageUrl?: string, provider?: string) =>
    request<ApiResponse<{ task_id: string }>>(`/items/${id}/images`, {
      method: 'POST',
      body: JSON.stringify({ reference_image_url: referenceImageUrl ?? '', provider: provider ?? '' }),
    })

  const listEffectiveItems = (novelId: number, chapterNo: number) =>
    request<ApiResponse<EffectiveItem[]>>(`/novels/${novelId}/chapters/${chapterNo}/items`)

  const upsertChapterItem = (
    novelId: number,
    chapterNo: number,
    itemId: number,
    data: { location?: string; owner?: string; condition?: string; notes?: string },
  ) =>
    request<ApiResponse<EffectiveItem>>(`/novels/${novelId}/chapters/${chapterNo}/items/${itemId}`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const deleteChapterItem = (novelId: number, chapterNo: number, itemId: number) =>
    request<void>(`/novels/${novelId}/chapters/${chapterNo}/items/${itemId}`, { method: 'DELETE' })

  const aiExtract = (novelId: number) =>
    request<ApiResponse<{ task_id: string }>>(`/novels/${novelId}/items/ai-extract`, { method: 'POST' })

  const batchGenerateImages = (novelId: number, provider?: string) =>
    request<ApiResponse<{ task_id: string }>>(`/novels/${novelId}/items/batch-images`, {
      method: 'POST',
      body: JSON.stringify({ provider: provider ?? '' }),
    })

  return {
    listItems,
    createItem,
    getItem,
    updateItem,
    deleteItem,
    uploadItemImage,
    uploadItemReference,
    generateItemImage,
    listEffectiveItems,
    upsertChapterItem,
    deleteChapterItem,
    aiExtract,
    batchGenerateImages,
  }
}
