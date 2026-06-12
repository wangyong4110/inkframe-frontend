import type { Character, CharacterLook, CreateCharacterLookForm, ApiResponse, CreateCharacterForm } from '~/types'

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
    request<ApiResponse<{ task_id: string }>>(`/novels/${novelId}/characters/generate`, {
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

  const uploadCharacterImage = (id: number, file: File, type: 'portrait' | 'three_view' | 'face_closeup') =>
    requestMultipart<{ url: string; character: Character }>(`/characters/${id}/image/upload?type=${type}`, file)

  const uploadLookImage = (characterId: number, lookId: number, file: File, type: 'portrait' | 'three_view' | 'face_closeup') =>
    requestMultipart<{ url: string; look: CharacterLook }>(`/characters/${characterId}/looks/${lookId}/upload?type=${type}`, file)

  const previewVoice = (id: number, params?: {
    text?: string
    voice_id?: string
    voice_speed?: number
    voice_style?: string
    voice_language?: string
  }) =>
    request<ApiResponse<{ task_id: string }>>(`/characters/${id}/voice/preview`, {
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

  // ── CharacterLook ─────────────────────────────────────────────────────────
  const listLooks = (characterId: number) =>
    request<ApiResponse<{ looks: CharacterLook[]; total: number }>>(`/characters/${characterId}/looks`)

  const createLook = (characterId: number, data: CreateCharacterLookForm) =>
    request<ApiResponse<CharacterLook>>(`/characters/${characterId}/looks`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const updateLook = (characterId: number, lookId: number, data: Partial<CharacterLook>) =>
    request<ApiResponse<CharacterLook>>(`/characters/${characterId}/looks/${lookId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteLook = (characterId: number, lookId: number) =>
    request<void>(`/characters/${characterId}/looks/${lookId}`, { method: 'DELETE' })

  const getActiveLook = (characterId: number, chapterNo: number) =>
    request<ApiResponse<{ look: CharacterLook | null }>>(`/characters/${characterId}/looks/active?chapter_no=${chapterNo}`)

  const generateLookPrompt = (characterId: number, description: string) =>
    request<ApiResponse<{ task_id: string }>>(`/characters/${characterId}/looks/generate-prompt`, {
      method: 'POST',
      body: JSON.stringify({ description }),
    })

  const generateLookImages = (characterId: number, lookId: number, type: 'three_view' | 'face_closeup' | 'portrait', provider?: string) =>
    request<ApiResponse<{ task_id: string }>>(`/characters/${characterId}/looks/${lookId}/images`, {
      method: 'POST',
      body: JSON.stringify({ type, provider: provider ?? '' }),
    })

  const reanalyzeCharacter = (id: number) =>
    request<ApiResponse<{ task_id: string }>>(`/characters/${id}/reanalyze`, { method: 'POST' })

  const getEffectiveCharacters = (novelId: number, chapterNo: number) =>
    request<ApiResponse<any[]>>(`/novels/${novelId}/chapters/${chapterNo}/characters`)

  const bindChapterCharacter = (novelId: number, chapterNo: number, characterId: number) =>
    request<ApiResponse<any>>(`/novels/${novelId}/chapters/${chapterNo}/characters/${characterId}`, { method: 'POST', body: JSON.stringify({}) })

  const unbindChapterCharacter = (novelId: number, chapterNo: number, characterId: number) =>
    request<ApiResponse<any>>(`/novels/${novelId}/chapters/${chapterNo}/characters/${characterId}`, { method: 'DELETE' })

  const generateChapterCharacterImages = (novelId: number, chapterNo: number, characterIds: number[], provider?: string) =>
    request<ApiResponse<{ task_id: string }>>(`/novels/${novelId}/chapters/${chapterNo}/characters/generate-images`, {
      method: 'POST',
      body: JSON.stringify({ character_ids: characterIds, provider: provider ?? '' }),
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
    uploadCharacterImage,
    uploadLookImage,
    previewVoice,
    aiBatchGenerate,
    batchGenerateImages,
    listLooks,
    createLook,
    updateLook,
    deleteLook,
    getActiveLook,
    generateLookPrompt,
    generateLookImages,
    reanalyzeCharacter,
    getEffectiveCharacters,
    bindChapterCharacter,
    unbindChapterCharacter,
    generateChapterCharacterImages,
  }
}
