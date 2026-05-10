import { getAuthToken } from '~/utils/auth'

export const useAuthApi = () => {
  const { request } = useApi()

  const getAuthHeaders = () => {
    const token = getAuthToken()
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token || ''}`,
    }
  }

  const sendSmsCode = (phone: string) =>
    request('/auth/sms/send', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    })

  const phoneLogin = (phone: string, code: string) =>
    request('/auth/phone/login', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    })

  const phoneRegister = (phone: string, code: string, nickname?: string, tenantName?: string) =>
    request('/auth/phone/register', {
      method: 'POST',
      body: JSON.stringify({ phone, code, nickname, tenant_name: tenantName }),
    })

  const getOAuthUrl = (provider: string, state: string) =>
    request(`/auth/oauth/${provider}/url?state=${state}`)

  const getMe = () =>
    request('/auth/me', { headers: getAuthHeaders() })

  return {
    sendSmsCode,
    phoneLogin,
    phoneRegister,
    getOAuthUrl,
    getMe,
  }
}
