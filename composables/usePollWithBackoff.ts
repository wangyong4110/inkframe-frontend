import { ref, onUnmounted } from 'vue'
import type { Ref } from 'vue'

export interface PollOptions<T> {
  /** The async function to call each poll cycle. */
  fn: () => Promise<T>
  /** Return true to stop polling and mark the task done. */
  isDone: (result: T) => boolean
  /** Called on every successful result (before isDone check stops the loop). */
  onResult?: (result: T) => void
  /** Called on each error; polling continues after an error. */
  onError?: (error: unknown) => void
  /** Initial delay in ms before the first poll. Default: 1000 */
  initialDelay?: number
  /** Maximum delay cap in ms for exponential backoff. Default: 8000 */
  maxDelay?: number
  /** Stop polling automatically after this many ms regardless of result. Default: 600000 (10 min) */
  maxElapsedMs?: number
  /** Multiply current delay by this factor after each successful poll. Default: 1.5 */
  backoffFactor?: number
}

export interface PollController {
  start: () => void
  stop: () => void
  isPolling: Ref<boolean>
}

/**
 * Reusable exponential-backoff polling composable.
 *
 * Usage:
 *   const { start, stop, isPolling } = usePollWithBackoff({
 *     fn: () => api.getTask(taskId),
 *     isDone: (res) => res.data.status === 'completed',
 *     onResult: (res) => store.task = res.data,
 *     onError: (err) => console.warn('poll error', err),
 *   })
 *   start()
 */
export function usePollWithBackoff<T>(options: PollOptions<T>): PollController {
  const {
    fn,
    isDone,
    onResult,
    onError,
    initialDelay = 1000,
    maxDelay = 8000,
    maxElapsedMs = 10 * 60 * 1000,
    backoffFactor = 1.5,
  } = options

  const isPolling = ref(false)
  let timer: ReturnType<typeof setTimeout> | null = null
  let startTime = 0
  let currentDelay = initialDelay

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  function stop() {
    isPolling.value = false
    clearTimer()
  }

  async function tick() {
    if (!isPolling.value) return

    if (Date.now() - startTime > maxElapsedMs) {
      stop()
      return
    }

    try {
      const result = await fn()

      if (!isPolling.value) return // stop() was called while fn() was in-flight

      onResult?.(result)

      if (isDone(result)) {
        stop()
        return
      }

      // successful poll — apply normal backoff
      currentDelay = Math.min(currentDelay * backoffFactor, maxDelay)
    } catch (err) {
      if (!isPolling.value) return

      onError?.(err)

      // error — apply doubled backoff (matches video.ts behaviour)
      currentDelay = Math.min(currentDelay * 2, maxDelay)
    }

    // schedule next tick
    if (isPolling.value) {
      timer = setTimeout(tick, currentDelay)
    }
  }

  function start() {
    if (isPolling.value) return // already running — no-op

    isPolling.value = true
    startTime = Date.now()
    currentDelay = initialDelay
    timer = setTimeout(tick, currentDelay)
  }

  onUnmounted(() => {
    stop()
  })

  return { start, stop, isPolling }
}
