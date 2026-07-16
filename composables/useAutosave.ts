import { ref, watch } from 'vue'

export function useAutosave(saveFn: () => Promise<void>, watchSources: any[], debounceMs = 30000) {
  const lastSavedAt = ref<Date | null>(null)
  const autoSaving = ref(false)
  const saveFailed = ref(false)

  let timer: ReturnType<typeof setTimeout> | null = null

  async function runSave() {
    // Skip if a manual save is already in progress (saveFn itself is a no-op when
    // isSaving is true, but checking autoSaving avoids stacking autosave attempts)
    if (autoSaving.value) return
    autoSaving.value = true
    saveFailed.value = false
    try {
      await saveFn()
      lastSavedAt.value = new Date()
    } catch {
      saveFailed.value = true
    } finally {
      autoSaving.value = false
    }
  }

  watch(watchSources, () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(runSave, debounceMs)
  }, { immediate: false, deep: true })

  // Immediately run a pending save (e.g. on input blur), instead of waiting out the
  // idle debounce. No-op if nothing changed since the last save (no timer pending).
  function flush() {
    if (timer) {
      clearTimeout(timer)
      timer = null
      void runSave()
    }
  }

  onUnmounted(() => {
    if (timer) clearTimeout(timer)
  })

  return { lastSavedAt, autoSaving, saveFailed, flush }
}
