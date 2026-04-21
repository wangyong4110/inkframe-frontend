import { ref, watch } from 'vue'

export function useAutosave(saveFn: () => Promise<void>, watchSources: any[], debounceMs = 2000) {
  const lastSavedAt = ref<Date | null>(null)
  const autoSaving = ref(false)

  let timer: ReturnType<typeof setTimeout> | null = null

  watch(watchSources, () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(async () => {
      autoSaving.value = true
      try {
        await saveFn()
        lastSavedAt.value = new Date()
      } catch {
        // silent — errors are handled by the caller's toast
      } finally {
        autoSaving.value = false
      }
    }, debounceMs)
  }, { immediate: false, deep: true })

  onUnmounted(() => {
    if (timer) clearTimeout(timer)
  })

  return { lastSavedAt, autoSaving }
}
