import type { ApiResponse } from '~/types'

interface ProfileUser {
  user_id: number
  username: string
  nickname: string
  avatar: string
  email: string
}

export const useProfileApi = () => {
  const { request } = useApi()

  const updateProfile = (data: { nickname?: string; email?: string; avatar?: string }) =>
    request<ApiResponse<ProfileUser>>('/auth/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const changePassword = (data: { old_password: string; new_password: string }) =>
    request<ApiResponse<{ changed: boolean }>>('/auth/me/password', {
      method: 'PUT',
      body: JSON.stringify(data),
    })

  const deleteAccount = (data: { password?: string }) =>
    request<ApiResponse<{ deleted: boolean }>>('/auth/me', {
      method: 'DELETE',
      body: JSON.stringify(data),
    })

  return { updateProfile, changePassword, deleteAccount }
}
