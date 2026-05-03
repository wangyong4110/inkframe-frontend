import { useApi } from './useApi'

export interface SystemSetting {
  key: string
  value: string
  description: string
}

export const useSystemSettingsApi = () => {
  const { request } = useApi()

  const listSettings = () =>
    request<{ data: SystemSetting[] }>('/system/settings')

  const updateSetting = (key: string, value: string, description?: string) =>
    request<void>(`/system/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value, description }),
    })

  return { listSettings, updateSetting }
}
