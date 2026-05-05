const url = ref('')
const visible = ref(false)
const refineCallback = ref<((suggestion: string) => Promise<string>) | null>(null)

export function useImageLightbox() {
  function openLightbox(src: string, onRefine?: (suggestion: string) => Promise<string>) {
    if (!src) return
    url.value = src
    refineCallback.value = onRefine ?? null
    visible.value = true
  }

  function closeLightbox() {
    visible.value = false
    refineCallback.value = null
  }

  function updateLightboxUrl(newUrl: string) {
    url.value = newUrl
  }

  return {
    url: readonly(url),
    visible: readonly(visible),
    refineCallback: readonly(refineCallback),
    openLightbox,
    closeLightbox,
    updateLightboxUrl,
  }
}
