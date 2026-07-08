import type { McpTool, FeatureBindingDTO, SystemFeature, ApiResponse } from '~/types'

const BASE = '/sysadmin/mcp'

export const useSysAdminMcpApi = () => {
  const { request } = useApi()

  // ── Tool CRUD ────────────────────────────────────────────────────────────────

  const listTools = () =>
    request<ApiResponse<McpTool[]>>(`${BASE}/tools`)

  const getTool = (id: number) =>
    request<ApiResponse<McpTool>>(`${BASE}/tools/${id}`)

  const createTool = (data: {
    name: string
    display_name?: string
    description?: string
    transport_type: string
    endpoint: string
    headers?: Record<string, string>
    env?: Record<string, string>
    timeout?: number
    is_active?: boolean
    is_system?: boolean
  }) =>
    request<ApiResponse<McpTool>>(`${BASE}/tools`, {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const updateTool = (id: number, data: {
    display_name?: string
    description?: string
    transport_type?: string
    endpoint?: string
    headers?: Record<string, string>
    env?: Record<string, string>
    timeout?: number
    is_active?: boolean
    is_system?: boolean
  }) =>
    request<ApiResponse<McpTool>>(`${BASE}/tools/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteTool = (id: number) =>
    request<ApiResponse<null>>(`${BASE}/tools/${id}`, { method: 'DELETE' })

  const testTool = (id: number) =>
    request<ApiResponse<{ status: string; latency_ms?: number; error?: string }>>(`${BASE}/tools/${id}/test`, {
      method: 'POST',
    })

  // ── Feature Binding ──────────────────────────────────────────────────────────

  const listSystemFeatures = () =>
    request<ApiResponse<SystemFeature[]>>(`${BASE}/system-features`)

  const listFeatureBindings = () =>
    request<ApiResponse<FeatureBindingDTO[]>>(`${BASE}/features`)

  const upsertFeatureBinding = (featureKey: string, data: {
    mcp_tool_id?: number | null
    enabled: boolean
    note?: string
  }) =>
    request<ApiResponse<FeatureBindingDTO>>(`${BASE}/features/${featureKey}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteFeatureBinding = (featureKey: string) =>
    request<ApiResponse<FeatureBindingDTO>>(`${BASE}/features/${featureKey}`, {
      method: 'DELETE',
    })

  return {
    listTools,
    getTool,
    createTool,
    updateTool,
    deleteTool,
    testTool,
    listSystemFeatures,
    listFeatureBindings,
    upsertFeatureBinding,
    deleteFeatureBinding,
  }
}
