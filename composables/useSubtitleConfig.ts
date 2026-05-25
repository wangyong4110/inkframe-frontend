import { ref, computed, watchEffect } from 'vue'

export function useSubtitleConfig() {
  const novelStore = useNovelStore()
  const subtitleEnabled = ref(true)
  watchEffect(() => { subtitleEnabled.value = novelStore.currentNovel?.subtitle_enabled ?? true })
  const subtitleConfig = computed(() => ({
    position: novelStore.currentNovel?.subtitle_position ?? 'bottom',
    font_size: novelStore.currentNovel?.subtitle_font_size ?? 48,
    color: novelStore.currentNovel?.subtitle_color ?? '#FFFFFF',
    bg_style: novelStore.currentNovel?.subtitle_bg_style ?? 'shadow',
  }))
  return { subtitleEnabled, subtitleConfig }
}
