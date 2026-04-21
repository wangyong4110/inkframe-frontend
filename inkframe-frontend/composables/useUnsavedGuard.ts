import type { Ref } from 'vue'

export function useUnsavedGuard(isDirty: Ref<boolean>, message = '有未保存的修改，确认离开？') {
  onBeforeRouteLeave((_to, _from, next) => {
    if (isDirty.value) {
      if (confirm(message)) {
        next()
      } else {
        next(false)
      }
    } else {
      next()
    }
  })

  function beforeUnload(e: BeforeUnloadEvent) {
    if (isDirty.value) {
      e.preventDefault()
      e.returnValue = ''
    }
  }

  onMounted(() => {
    window.addEventListener('beforeunload', beforeUnload)
  })

  onUnmounted(() => {
    window.removeEventListener('beforeunload', beforeUnload)
  })
}
