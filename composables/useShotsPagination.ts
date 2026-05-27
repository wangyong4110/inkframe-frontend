import type { ComputedRef } from 'vue'
import type { StoryboardShot } from '~/types'

export function useShotsPagination(shots: ComputedRef<StoryboardShot[]>, pageSize = 15) {
  const currentPage = ref(1)
  const totalPages = computed(() => Math.max(1, Math.ceil(shots.value.length / pageSize)))

  const pagedShots = computed(() => {
    const page = Math.min(currentPage.value, totalPages.value)
    return shots.value.slice((page - 1) * pageSize, page * pageSize)
  })

  // Clamp page when items are deleted
  watch(totalPages, (n) => { if (currentPage.value > n) currentPage.value = n })
  // Reset to page 1 on first load / full regeneration
  watch(() => shots.value.length, (newLen, oldLen) => {
    if (oldLen === 0 && newLen > 0) currentPage.value = 1
  })

  const pageNumbers = computed<(number | '…')[]>(() => {
    const total = totalPages.value
    const cur = Math.min(currentPage.value, total)
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
    const pages: (number | '…')[] = [1]
    if (cur > 3) pages.push('…')
    for (let p = Math.max(2, cur - 1); p <= Math.min(total - 1, cur + 1); p++) pages.push(p)
    if (cur < total - 2) pages.push('…')
    pages.push(total)
    return pages
  })

  return { currentPage, totalPages, pagedShots, pageNumbers }
}
