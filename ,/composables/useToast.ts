import { ref } from 'vue'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface Toast {
  id: number
  type: ToastType
  message: string
}

const toasts = ref<Toast[]>([])
let nextId = 0

export function useToast() {
  function show(type: ToastType, message: string, duration = type === 'error' ? 5000 : 3000) {
    const id = nextId++
    toasts.value.push({ id, type, message })
    if (duration > 0) setTimeout(() => dismiss(id), duration)
  }

  const success = (msg: string) => show('success', msg)
  const error = (msg: string) => show('error', msg)
  const warning = (msg: string) => show('warning', msg)
  const info = (msg: string) => show('info', msg)

  function dismiss(id: number) {
    toasts.value = toasts.value.filter(t => t.id !== id)
  }

  return { toasts, success, error, warning, info, dismiss }
}
