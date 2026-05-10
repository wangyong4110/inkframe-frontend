import type { AIModel, ModelProvider, ProviderTemplate, ApiResponse } from '~/types'

export const useModelApi = () => {
  const { request } = useApi()

  const getProviders = () =>
    request<ApiResponse<ModelProvider[]>>('/model-providers')

  const getCapableProviders = (type: string) =>
    request<ApiResponse<{ name: string; display_name: string }[]>>(`/model-providers/capable?type=${type}`)

  const getImageCapableProviders = () => getCapableProviders('IMAGE')
  const getLLMCapableProviders = () => getCapableProviders('LLM')

  const getModels = (params?: { provider_id?: number }) => {
    const searchParams = new URLSearchParams()
    if (params?.provider_id) searchParams.set('provider_id', params.provider_id.toString())

    const query = searchParams.toString()
    return request<ApiResponse<AIModel[]>>(`/models${query ? `?${query}` : ''}`)
  }

  const getAvailableModels = (taskType: string) =>
    request<ApiResponse<AIModel[]>>(`/models/available/${taskType}`)

  const selectModel = (data: { task_type: string; strategy: string }) =>
    request<ApiResponse<AIModel>>('/models/select', {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const createModel = (data: {
    provider_id: number
    model_id: string
    name: string
    task_types: string
    max_tokens?: number
    is_default?: boolean
  }) =>
    request<ApiResponse<AIModel>>('/models', {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const deleteModel = (id: number) =>
    request<ApiResponse<null>>(`/models/${id}`, { method: 'DELETE' })

  const createProvider = (data: {
    name: string
    display_name?: string
    type: string
    api_endpoint: string
    api_key: string
    api_version?: string
    is_active: boolean
  }) =>
    request<ApiResponse<ModelProvider>>('/model-providers', {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const updateProvider = (id: number, data: Partial<{
    name: string
    display_name: string
    type: string
    api_endpoint: string
    api_key: string
    api_version: string
    is_active: boolean
  }>) =>
    request<ApiResponse<ModelProvider>>(`/model-providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteProvider = (id: number) =>
    request<ApiResponse<null>>(`/model-providers/${id}`, { method: 'DELETE' })

  const testProvider = (id: number) =>
    request<ApiResponse<{ status: string; error?: string }>>(`/model-providers/${id}/test`, {
      method: 'POST',
    })

  const fetchProviderModels = (data: { provider_id?: number; endpoint?: string; api_key?: string }) =>
    request<ApiResponse<{ models: string[] }>>('/model-providers/fetch-models', {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const getProviderTemplates = () =>
    request<ApiResponse<ProviderTemplate[]>>('/model-providers/templates')

  return {
    getProviders,
    getCapableProviders,
    getImageCapableProviders,
    getLLMCapableProviders,
    getModels,
    getAvailableModels,
    selectModel,
    createModel,
    deleteModel,
    createProvider,
    updateProvider,
    deleteProvider,
    testProvider,
    fetchProviderModels,
    getProviderTemplates,
  }
}
