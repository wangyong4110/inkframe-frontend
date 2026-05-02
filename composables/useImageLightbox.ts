const url = ref('')
const visible = ref(false)

export function useImageLightbox() {
  function openLightbox(src: string) {
    if (!src) return
    url.value = src
    visible.value = true
  }

  function closeLightbox() {
    visible.value = false
  }

  return { url: readonly(url), visible: readonly(visible), openLightbox, closeLightbox }
}
