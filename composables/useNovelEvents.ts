import type { CollabEvent } from '~/types'
import { getAuthToken } from '~/utils/auth'

export function useNovelEvents(novelId: MaybeRef<number | null>) {
  const events = ref<CollabEvent[]>([])
  const connected = ref(false)
  let es: EventSource | null = null
  const listeners: Array<(evt: CollabEvent) => void> = []

  function onEvent(fn: (evt: CollabEvent) => void) {
    listeners.push(fn)
    return () => {
      const i = listeners.indexOf(fn)
      if (i >= 0) listeners.splice(i, 1)
    }
  }

  function connect(id: number) {
    disconnect()
    const config = useRuntimeConfig()
    const baseURL = (config.public.apiBase as string) || '/api/v1'

    // EventSource does not support custom headers natively.
    // Pass the JWT token as a query parameter so the backend can authenticate.
    const token = getAuthToken()
    const url = `${baseURL}/novels/${id}/events${token ? `?token=${encodeURIComponent(token)}` : ''}`

    es = new EventSource(url, { withCredentials: true })

    es.onopen = () => {
      connected.value = true
    }

    es.onerror = () => {
      connected.value = false
      // Reconnect after 5 seconds
      setTimeout(() => {
        const currentId = unref(novelId)
        if (currentId) connect(currentId)
      }, 5000)
    }

    es.onmessage = (e: MessageEvent) => {
      if (!e.data || (e.data as string).startsWith(':')) return
      try {
        const evt: CollabEvent = JSON.parse(e.data as string)
        if (evt.type === 'connected') {
          connected.value = true
          return
        }
        events.value = [evt, ...events.value].slice(0, 50)
        listeners.forEach(fn => fn(evt))
      } catch {
        // Ignore parse errors for malformed events
      }
    }
  }

  function disconnect() {
    if (es) {
      es.close()
      es = null
    }
    connected.value = false
  }

  onMounted(() => {
    const id = unref(novelId)
    if (id) connect(id)
  })

  watch(
    () => unref(novelId),
    (id) => {
      if (id) connect(id)
      else disconnect()
    },
  )

  onUnmounted(disconnect)

  return { events, connected, onEvent, connect, disconnect }
}
