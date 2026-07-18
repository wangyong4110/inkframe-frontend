import type { ImageStylePresetRecord, ApiResponse } from '~/types'

export const useImageStylePresetApi = () => {
  const { request } = useApi()

  const listPresets = () =>
    request<ApiResponse<ImageStylePresetRecord[]>>('/image-style-presets')

  const getPreset = (id: number) =>
    request<ApiResponse<ImageStylePresetRecord>>(`/image-style-presets/${id}`)

  const createPreset = (data: Partial<ImageStylePresetRecord>) =>
    request<ApiResponse<ImageStylePresetRecord>>('/image-style-presets', {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const updatePreset = (id: number, data: Partial<ImageStylePresetRecord>) =>
    request<ApiResponse<ImageStylePresetRecord>>(`/image-style-presets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deletePreset = (id: number) =>
    request<void>(`/image-style-presets/${id}`, { method: 'DELETE' })

  return { listPresets, getPreset, createPreset, updatePreset, deletePreset }
}
