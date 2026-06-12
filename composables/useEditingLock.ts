import type { EditingLock } from '~/types'

export function useEditingLock(
  entityType: string,
  entityId: MaybeRef<number | null>,
  novelId?: MaybeRef<number | null>,
) {
  const collabApi = useCollabApi()
  const currentLock = ref<EditingLock | null>(null)
  const hasLock = ref(false)
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null

  async function acquire(): Promise<boolean> {
    const id = unref(entityId)
    if (!id) return false
    try {
      const res = await collabApi.acquireLock(entityType, id, unref(novelId) ?? undefined)
      // request() returns the raw JSON body; handle both { data: { lock } } and { lock }
      currentLock.value = (res as any)?.data?.lock ?? (res as any)?.lock ?? null
      hasLock.value = true
      startHeartbeat()
      return true
    } catch (e: any) {
      const status: number = e?.response?.status ?? e?.status ?? 0
      if (status === 409) {
        // Locked by someone else — fetch current lock info
        try {
          const lockRes = await collabApi.getLock(entityType, id)
          currentLock.value = (lockRes as any)?.data?.lock ?? (lockRes as any)?.lock ?? null
        } catch {
          // Ignore errors fetching lock details
        }
      }
      hasLock.value = false
      return false
    }
  }

  async function release() {
    const id = unref(entityId)
    if (!id || !hasLock.value) return
    stopHeartbeat()
    hasLock.value = false
    try {
      await collabApi.releaseLock(entityType, id, unref(novelId) ?? undefined)
    } catch {
      // Best-effort release; ignore errors
    }
    currentLock.value = null
  }

  function startHeartbeat() {
    stopHeartbeat()
    heartbeatTimer = setInterval(async () => {
      const id = unref(entityId)
      if (!id || !hasLock.value) return
      try {
        await collabApi.heartbeatLock(entityType, id)
      } catch {
        // Lock expired or revoked
        hasLock.value = false
        stopHeartbeat()
      }
    }, 60_000) // every 60 seconds
  }

  function stopHeartbeat() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
  }

  onUnmounted(release)

  const lockedByOther = computed(() => currentLock.value !== null && !hasLock.value)
  const lockedByName = computed(() => currentLock.value?.locked_by_name ?? '')

  return { currentLock, hasLock, lockedByOther, lockedByName, acquire, release }
}
