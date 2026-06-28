import type { DramaTemplate, ApiResponse } from '~/types'

export const useDramaTemplateApi = () => {
  const { request } = useApi()

  const listTemplates = () =>
    request<ApiResponse<DramaTemplate[]>>('/drama-templates')

  const getTemplate = (id: number) =>
    request<ApiResponse<DramaTemplate>>(`/drama-templates/${id}`)

  const createTemplate = (data: Partial<DramaTemplate>) =>
    request<ApiResponse<DramaTemplate>>('/drama-templates', {
      method: 'POST',
      body: JSON.stringify(data),
    })

  const updateTemplate = (id: number, data: Partial<DramaTemplate>) =>
    request<ApiResponse<DramaTemplate>>(`/drama-templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteTemplate = (id: number) =>
    request<void>(`/drama-templates/${id}`, { method: 'DELETE' })

  return { listTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate }
}
