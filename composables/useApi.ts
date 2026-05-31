import { getAuthToken } from '~/utils/auth'

export const useApi = () => {
  const config = useRuntimeConfig()
  const apiBase = config.public.apiBase

  const getAuthHeader = (): Record<string, string> => {
    const token = getAuthToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const request = async <T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> => {
    const url = `${apiBase}${endpoint}`

    const defaultOptions: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120_000)

    let response: Response
    try {
      response = await fetch(url, {
        ...defaultOptions,
        ...options,
        headers: {
          ...((defaultOptions.headers as Record<string, string>) || {}),
          ...((options.headers as Record<string, string>) || {}),
        },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      if (response.status === 401) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('auth_token')
          localStorage.removeItem('auth_expires_at')
        }
        await navigateTo('/auth/login')
        throw new Error('Session expired')
      }
      const error = await response.json().catch(() => ({ message: 'Request failed' }))
      throw new Error(error.message || `HTTP error ${response.status}`)
    }

    if (response.status === 204) {
      return undefined as T
    }

    return response.json()
  }

  const requestBlob = async (endpoint: string, options: RequestInit = {}): Promise<Blob> => {
    const url = `${apiBase}${endpoint}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120_000)

    let response: Response
    try {
      response = await fetch(url, {
        ...options,
        headers: {
          ...getAuthHeader(),
          ...((options.headers as Record<string, string>) || {}),
        },
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timer)
    }

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`)
    }

    return response.blob()
  }

  // Upload a single file as multipart/form-data and return response.data.
  const requestMultipart = async <T>(endpoint: string, file: File): Promise<T> => {
    const form = new FormData()
    form.append('file', file)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120_000) // 120s for uploads
    let res: Response
    try {
      res = await fetch(`${apiBase}${endpoint}`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: form,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }
    const json = await res.json().catch(() => ({ message: 'Upload failed' }))
    if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`)
    return json.data
  }

  // Send a pre-built FormData (supports extra fields alongside the file).
  const requestForm = async <T>(endpoint: string, form: FormData): Promise<T> => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 120_000)
    let res: Response
    try {
      res = await fetch(`${apiBase}${endpoint}`, {
        method: 'POST',
        headers: getAuthHeader(),
        body: form,
        signal: controller.signal,
      })
    } finally {
      clearTimeout(timeoutId)
    }
    const json = await res.json().catch(() => ({ message: 'Upload failed' }))
    if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`)
    return json
  }

  return {
    request,
    requestBlob,
    requestMultipart,
    requestForm,
  }
}
