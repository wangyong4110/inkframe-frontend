const url = ref('')
const origUrl = ref('')     // URL when lightbox opened (for discard)
const pendingUrl = ref('')  // URL after regeneration, not yet saved
const visible = ref(false)
const refineCallback = ref<((suggestion: string) => Promise<string>) | null>(null)
const saveCallback = ref<((newUrl: string) => void) | null>(null)

export function useImageLightbox() {
  // Open for view / refine (storyboard shots etc.)
  function openLightbox(
    src: string,
    onRefine?: (suggestion: string) => Promise<string>,
    onSave?: (newUrl: string) => void,
  ) {
    if (!src) return
    url.value = src
    origUrl.value = src
    pendingUrl.value = ''
    refineCallback.value = onRefine ?? null
    saveCallback.value = onSave ?? null
    visible.value = true
  }

  // Open to preview a newly generated image — 保存/放弃 shown immediately
  function previewLightbox(
    newUrl: string,
    originalUrl: string,
    onSave: (newUrl: string) => void,
    onRefine?: (suggestion: string) => Promise<string>,
  ) {
    if (!newUrl) return
    url.value = newUrl
    origUrl.value = originalUrl
    pendingUrl.value = newUrl
    refineCallback.value = onRefine ?? null
    saveCallback.value = onSave
    visible.value = true
  }

  function closeLightbox() {
    visible.value = false
    refineCallback.value = null
    saveCallback.value = null
    pendingUrl.value = ''
  }

  // Called after regeneration inside lightbox
  function updateLightboxUrl(newUrl: string) {
    pendingUrl.value = newUrl
    url.value = newUrl
  }

  // Discard pending and revert to original
  function discardPending() {
    url.value = origUrl.value
    pendingUrl.value = ''
  }

  // Commit pending to store and close
  function savePending() {
    if (pendingUrl.value && saveCallback.value) {
      saveCallback.value(pendingUrl.value)
    }
    closeLightbox()
  }

  return {
    url: readonly(url),
    visible: readonly(visible),
    pendingUrl: readonly(pendingUrl),
    refineCallback: readonly(refineCallback),
    openLightbox,
    previewLightbox,
    closeLightbox,
    updateLightboxUrl,
    discardPending,
    savePending,
  }
}
