import type { ApiResponse, Video, PlatformAccount } from '~/types'

export const usePlatformApi = () => {
  const { request } = useApi()

  const getPlatformFeed = (params?: { page?: number; page_size?: number }) => {
    const q = new URLSearchParams()
    if (params?.page) q.set('page', params.page.toString())
    if (params?.page_size) q.set('page_size', params.page_size.toString())
    const qs = q.toString()
    return request<ApiResponse<{ items: Video[]; total: number; page: number; page_size: number; total_page: number }>>(
      `/platform/videos${qs ? `?${qs}` : ''}`,
    )
  }

  const getPlatformVideo = (id: number) =>
    request<ApiResponse<Video>>(`/platform/videos/${id}`)

  const recordView = (id: number) =>
    request<ApiResponse<{ recorded: boolean }>>(`/platform/videos/${id}/view`, { method: 'POST' })

  const listAccounts = () =>
    request<ApiResponse<PlatformAccount[]>>('/platform/accounts')

  const getOAuthURL = (platform: string, redirectURI: string, state?: string) => {
    const q = new URLSearchParams({ redirect_uri: redirectURI })
    if (state) q.set('state', state)
    return request<ApiResponse<string>>(`/platform/accounts/oauth/${platform}?${q.toString()}`)
  }

  const disconnectAccount = (id: number) =>
    request<ApiResponse<{ disconnected: boolean }>>(`/platform/accounts/${id}`, { method: 'DELETE' })

  return {
    getPlatformFeed,
    getPlatformVideo,
    recordView,
    listAccounts,
    getOAuthURL,
    disconnectAccount,
  }
}
