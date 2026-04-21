<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue: boolean
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  variant?: 'danger' | 'warning' | 'default'
}>(), {
  confirmText: '确认',
  cancelText: '取消',
  variant: 'default',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  confirm: []
  cancel: []
}>()

function close() {
  emit('update:modelValue', false)
  emit('cancel')
}

function confirm() {
  emit('update:modelValue', false)
  emit('confirm')
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) close()
}

const confirmBtnClass = computed(() => {
  if (props.variant === 'danger') return 'bg-red-600 hover:bg-red-700 text-white'
  if (props.variant === 'warning') return 'bg-yellow-500 hover:bg-yellow-600 text-white'
  return 'bg-primary-600 hover:bg-primary-700 text-white'
})
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="modelValue" class="fixed inset-0 z-[9998] flex items-center justify-center">
        <div class="fixed inset-0 bg-black/50" @click="close" />
        <div class="relative bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
          <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-2">{{ title }}</h3>
          <p v-if="description" class="text-sm text-gray-500 dark:text-gray-400 mb-6">{{ description }}</p>
          <div v-else class="mb-6" />
          <div class="flex justify-end gap-3">
            <button
              class="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              @click="close"
            >
              {{ cancelText }}
            </button>
            <button
              class="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
              :class="confirmBtnClass"
              @click="confirm"
            >
              {{ confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.dialog-enter-active,
.dialog-leave-active {
  transition: opacity 0.2s ease;
}
.dialog-enter-from,
.dialog-leave-to {
  opacity: 0;
}
</style>
