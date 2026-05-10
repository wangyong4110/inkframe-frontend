import type { McpTool, AIModel, ApiResponse } from '~/types'

export const useMcpApi = () => {
  const { request } = useApi()

  const getMcpTools = () =>
    request<ApiResponse<McpTool[]>>('/mcp-tools')

  const createMcpTool = (data: {
    name: string
    display_name: string
    description?: string
    transport_type: string
    endpoint: string
    headers?: Record<string, string>
    env?: Record<string, string>
    timeout?: number
    is_active: boolean
  }) =>
    request<ApiResponse<McpTool>>('/mcp-tools', {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const updateMcpTool = (id: number, data: Partial<McpTool>) =>
    request<ApiResponse<McpTool>>(`/mcp-tools/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteMcpTool = (id: number) =>
    request<void>(`/mcp-tools/${id}`, { method: 'DELETE' })

  const testMcpTool = (id: number) =>
    request<ApiResponse<{ status: string; latency_ms?: number; error?: string }>>(`/mcp-tools/${id}/test`, {
      method: 'POST',
    })

  const getModelMcpTools = (modelId: number) =>
    request<ApiResponse<McpTool[]>>(`/models/${modelId}/mcp-tools`)

  const bindMcpTool = (modelId: number, toolId: number) =>
    request<ApiResponse<null>>(`/models/${modelId}/mcp-tools`, {
      method: 'POST',
      body: JSON.stringify({ tool_id: toolId }),
    })

  const unbindMcpTool = (modelId: number, toolId: number) =>
    request<void>(`/models/${modelId}/mcp-tools/${toolId}`, { method: 'DELETE' })

  const getMcpToolModels = (toolId: number) =>
    request<ApiResponse<AIModel[]>>(`/mcp-tools/${toolId}/models`)

  return {
    getMcpTools,
    createMcpTool,
    updateMcpTool,
    deleteMcpTool,
    testMcpTool,
    getModelMcpTools,
    bindMcpTool,
    unbindMcpTool,
    getMcpToolModels,
  }
}
