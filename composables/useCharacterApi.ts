import type { Character, ApiResponse, CreateCharacterForm } from '~/types'

export const useCharacterApi = () => {
  const { request, requestMultipart } = useApi()

  const getCharacters = (novelId: number) =>
    request<ApiResponse<Character[]>>(`/novels/${novelId}/characters`)

  const getCharacter = (id: number) =>
    request<ApiResponse<Character>>(`/characters/${id}`)

  const createCharacter = (novelId: number, data: CreateCharacterForm) =>
    request<ApiResponse<Character>>(`/novels/${novelId}/characters`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const updateCharacter = (id: number, data: Partial<Character>) =>
    request<ApiResponse<Character>>(`/characters/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteCharacter = (id: number) =>
    request<void>(`/characters/${id}`, { method: 'DELETE' })

  const generateCharacterProfile = (novelId: number, description: string) =>
    request<ApiResponse<Character>>(`/novels/${novelId}/characters/generate`, {
      method: 'POST',
      body: JSON.stringify({ description }),
    })

  const generateThreeView = (id: number, style?: string, provider?: string) =>
    request<ApiResponse<{ task_id: string }>>(`/characters/${id}/three-view`, {
      method: 'POST',
      body: JSON.stringify({ style: style ?? '', provider: provider ?? '' }),
    })

  const generateFaceCloseup = (id: number, style?: string, provider?: string) =>
    request<ApiResponse<{ task_id: string }>>(`/characters/${id}/face-closeup`, {
      method: 'POST',
      body: JSON.stringify({ style: style ?? '', provider: provider ?? '' }),
    })

  const uploadPortrait = (id: number, file: File) =>
    requestMultipart<{ url: string; character: Character }>(`/characters/${id}/portrait/upload`, file)

  const previewVoice = (id: number, params?: {
    text?: string
    voice_id?: string
    voice_speed?: number
    voice_style?: string
    voice_language?: string
  }) =>
    request<ApiResponse<{ audio_url: string; voice_id: string; voice_speed: number }>>(`/characters/${id}/voice/preview`, {
      method: 'POST',
      body: JSON.stringify({
        text: params?.text ?? '',
        voice_id: params?.voice_id ?? '',
        voice_speed: params?.voice_speed,
        voice_style: params?.voice_style ?? '',
        voice_language: params?.voice_language ?? '',
      }),
    })

  const aiBatchGenerate = (novelId: number) =>
    request<ApiResponse<{ task_id: string }>>(`/novels/${novelId}/characters/ai-batch`, { method: 'POST' })

  const batchGenerateImages = (novelId: number, provider?: string, force = false) =>
    request<ApiResponse<{ task_id: string }>>(`/novels/${novelId}/characters/batch-images`, {
      method: 'POST',
      body: JSON.stringify({ provider: provider ?? '', force }),
    })

  return {
    getCharacters,
    getCharacter,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    generateCharacterProfile,
    generateThreeView,
    generateFaceCloseup,
    uploadPortrait,
    previewVoice,
    aiBatchGenerate,
    batchGenerateImages,
  }
}
