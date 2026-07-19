<script setup lang="ts">
const props = defineProps<{
  modelValue: boolean
  modeLabel: string        // 切换到的模式显示名，如"专业分镜"/"忠于原文"/"简洁模式"
  canRegenerateSegment: boolean // 当前是否有选中场次可供"重生成本段"
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  later: []
  'regenerate-segment': []
  'regenerate-all': []
}>()

function close() {
  emit('update:modelValue', false)
}

function pickLater() {
  close()
  emit('later')
}

function pickSegment() {
  if (!props.canRegenerateSegment) return
  close()
  emit('regenerate-segment')
}

function pickAll() {
  close()
  emit('regenerate-all')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.modelValue) pickLater()
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <Transition name="dialog">
      <div v-if="modelValue" class="fixed inset-0 z-[9998] flex items-center justify-center">
        <div class="fixed inset-0 bg-black/50" @click="pickLater" />
        <div class="relative bg-gray-900 border border-gray-700 rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
          <h3 class="text-base font-semibold text-white mb-3">切换提示词格式</h3>
          <p class="text-sm text-gray-400 mb-6">
            已切换为<span class="text-white font-medium">{{ modeLabel }}</span>，需重新生成提示词后生效。
          </p>
          <div class="flex justify-end gap-2">
            <button
              class="px-3 py-2 text-xs font-medium rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 transition-colors"
              @click="pickLater"
            >
              稍后手动
            </button>
            <button
              class="px-3 py-2 text-xs font-medium rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              :disabled="!canRegenerateSegment"
              :title="canRegenerateSegment ? '' : '请先在左侧选中一个场次'"
              @click="pickSegment"
            >
              重生成本段
            </button>
            <button
              class="px-3 py-2 text-xs font-medium rounded-lg bg-white text-gray-900 hover:bg-gray-100 transition-colors"
              @click="pickAll"
            >
              重生成全集
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
