import { getAuthToken } from '~/utils/auth'

// Prevents multiple concurrent redirects to the login page
let redirectingToLogin = false

async function handle401() {
  if (redirectingToLogin) return
  redirectingToLogin = true
  try { localStorage.removeItem('auth_token'); localStorage.removeItem('auth_expires_at') } catch {}
  await navigateTo('/auth/login')
}

// ── Silent token refresh ──────────────────────────────────────────────────────
// Guards against concurrent refresh calls: only one refresh runs at a time;
// subsequent 401s while a refresh is in-flight are queued and replayed.
let isRefreshing = false
let refreshSubscribers: Array<(token: string) => void> = []

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb)
}

function onTokenRefreshed(token: string) {
  refreshSubscribers.forEach(cb => cb(token))
  refreshSubscribers = []
}

/**
 * Attempt to silently refresh the JWT by sending the current (possibly-expired)
 * token to POST /auth/refresh.  The backend issues a new token via token rotation
 * (old JTI is blacklisted).  Returns the new token on success, or null on failure.
 */
async function tryRefreshToken(apiBase: string): Promise<string | null> {
  const currentToken = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null
  if (!currentToken) return null

  try {
    const resp = await fetch(`${apiBase}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: currentToken }),
    })
    if (!resp.ok) return null
    const data = await resp.json()
    const payload = data.data ?? data
    // AuthResponse shape: { token, expires_at, user_id, tenant_id, ... }
    const newToken: string = payload.token
    if (!newToken) return null

    // Persist to localStorage and update auth store if available
    if (typeof window !== 'undefined') {
      localStorage.setItem('auth_token', newToken)
      if (payload.expires_at) {
        const ms = new Date(payload.expires_at).getTime()
        if (!isNaN(ms)) {
          localStorage.setItem('auth_expires_at', String(Math.floor(ms / 1000)))
        }
      }
    }

    // Update Pinia auth store without importing it at module scope (avoids SSR issues)
    try {
      const { useAuthStore } = await import('~/stores/auth')
      const authStore = useAuthStore()
      authStore.setToken(newToken, payload.expires_at ?? String(Date.now() / 1000 + 86400 * 7))
    } catch {
      // Store may not be available in all contexts; localStorage update above is enough
    }

    return newToken
  } catch {
    return null
  }
}

export const useApi = () => {
  const config = useRuntimeConfig()
  const apiBase = config.public.apiBase

  const getAuthHeader = (): Record<string, string> => {
    const token = getAuthToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  /** Execute one HTTP request, returning the raw Response. */
  const doFetch = async (url: string, opts: RequestInit): Promise<Response> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 120_000)
    try {
      return await fetch(url, { ...opts, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }

  const request = async <T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> => {
    const url = `${apiBase}${endpoint}`

    const buildHeaders = (token?: string | null): Record<string, string> => ({
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : getAuthHeader()),
      ...((options.headers as Record<string, string>) || {}),
    })

    let response = await doFetch(url, { ...options, headers: buildHeaders() })

    if (response.status === 401) {
      const errorBody = await response.json().catch(() => ({} as any))
      const msg: string = errorBody?.message || errorBody?.data?.message || ''

      // Auth endpoints: 401 means wrong credentials, not expired session
      if (endpoint.startsWith('/auth/')) {
        throw new Error(msg || 'Invalid credentials')
      }

      // Attempt silent refresh — only one refresh runs at a time
      if (!isRefreshing) {
        isRefreshing = true
        const newToken = await tryRefreshToken(apiBase as string)
        isRefreshing = false

        if (newToken) {
          onTokenRefreshed(newToken)
          // Retry the original request with the fresh token
          response = await doFetch(url, { ...options, headers: buildHeaders(newToken) })
        } else {
          // Refresh failed — log out
          await handle401()
          throw new Error(msg || 'Session expired')
        }
      } else {
        // Another refresh is already running — queue this request
        const newToken = await new Promise<string>((resolve) => {
          subscribeTokenRefresh(resolve)
        })
        response = await doFetch(url, { ...options, headers: buildHeaders(newToken) })
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
        // Refresh didn't help (e.g. new token also rejected)
        await handle401()
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
    const buildBlobOpts = (token?: string | null): RequestInit => ({
      ...options,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : getAuthHeader()),
        ...((options.headers as Record<string, string>) || {}),
      },
    })

    let response = await doFetch(url, buildBlobOpts())

    if (response.status === 401) {
      if (!isRefreshing) {
        isRefreshing = true
        const newToken = await tryRefreshToken(apiBase as string)
        isRefreshing = false
        if (newToken) {
          onTokenRefreshed(newToken)
          response = await doFetch(url, buildBlobOpts(newToken))
        } else {
          await handle401()
          throw new Error('Session expired')
        }
      } else {
        const newToken = await new Promise<string>((resolve) => { subscribeTokenRefresh(resolve) })
        response = await doFetch(url, buildBlobOpts(newToken))
      }
    }

    if (!response.ok) {
      if (response.status === 401) { await handle401(); throw new Error('Session expired') }
      throw new Error(`HTTP error ${response.status}`)
    }

    return response.blob()
  }

  // Upload a single file as multipart/form-data and return response.data.
  const requestMultipart = async <T>(endpoint: string, file: File): Promise<T> => {
    const form = new FormData()
    form.append('file', file)
    const url = `${apiBase}${endpoint}`
    const buildMultipartOpts = (token?: string | null): RequestInit => ({
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : getAuthHeader(),
      body: form,
    })

    let res = await doFetch(url, buildMultipartOpts())

    if (res.status === 401) {
      if (!isRefreshing) {
        isRefreshing = true
        const newToken = await tryRefreshToken(apiBase as string)
        isRefreshing = false
        if (newToken) {
          onTokenRefreshed(newToken)
          res = await doFetch(url, buildMultipartOpts(newToken))
        } else {
          await handle401()
          throw new Error('Session expired')
        }
      } else {
        const newToken = await new Promise<string>((resolve) => { subscribeTokenRefresh(resolve) })
        res = await doFetch(url, buildMultipartOpts(newToken))
      }
    }

    const json = await res.json().catch(() => ({ message: 'Upload failed' }))
    if (!res.ok) throw new Error(json.message || `HTTP ${res.status}`)
    return json.data
  }

  // Send a pre-built FormData (supports extra fields alongside the file).
  const requestForm = async <T>(endpoint: string, form: FormData): Promise<T> => {
    const url = `${apiBase}${endpoint}`
    const buildFormOpts = (token?: string | null): RequestInit => ({
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : getAuthHeader(),
      body: form,
    })

    let res = await doFetch(url, buildFormOpts())

    if (res.status === 401) {
      if (!isRefreshing) {
        isRefreshing = true
        const newToken = await tryRefreshToken(apiBase as string)
        isRefreshing = false
        if (newToken) {
          onTokenRefreshed(newToken)
          res = await doFetch(url, buildFormOpts(newToken))
        } else {
          await handle401()
          throw new Error('Session expired')
        }
      } else {
        const newToken = await new Promise<string>((resolve) => { subscribeTokenRefresh(resolve) })
        res = await doFetch(url, buildFormOpts(newToken))
      }
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
