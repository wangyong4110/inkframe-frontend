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
      const error = await response.json().catch(() => ({ message: 'Request failed' }))
      throw new Error(error.message || `HTTP error ${response.status}`)
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
    const res = await fetch(`${apiBase}${endpoint}`, {
      method: 'POST',
      headers: getAuthHeader(),
      body: form,
    })
    const json = await res.json().catch(() => ({ message: 'Upload failed' }))
    if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`)
    return json.data
  }

  return {
    request,
    requestBlob,
    requestMultipart,
  }
}
