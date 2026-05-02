<script setup lang="ts">
/**
 * ImageUploadBox — 通用图片上传框
 *
 * Props:
 *   modelValue  当前图片 URL（v-model）
 *   accept      接受的文件类型，默认 image/jpeg,image/png,image/webp
 *   placeholder 无图时的提示文字
 *   aspectRatio CSS aspect-ratio，如 "1/1"、"16/9"，默认 "1/1"
 *   disabled    禁用上传
 *
 * Emits:
 *   update:modelValue(url: string)
 *   error(message: string)
 */
const props = withDefaults(defineProps<{
  modelValue?: string
  accept?: string
  placeholder?: string
  aspectRatio?: string
  disabled?: boolean
}>(), {
  modelValue: '',
  accept: 'image/jpeg,image/png,image/webp',
  placeholder: '点击上传',
  aspectRatio: '1/1',
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [url: string]
  'error': [message: string]
}>()

const { uploading, uploadImage } = useImageUpload()
const { openLightbox } = useImageLightbox()
const fileInput = ref<HTMLInputElement | null>(null)

async function handleFileChange(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  try {
    const url = await uploadImage(file)
    emit('update:modelValue', url)
  } catch (e: any) {
    emit('error', e.message || '上传失败')
  } finally {
    if (fileInput.value) fileInput.value.value = ''
  }
}

function remove() {
  emit('update:modelValue', '')
}
</script>

<template>
  <div class="space-y-2">
    <!-- Upload box -->
    <div
      class="relative rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800 overflow-hidden flex items-center justify-center cursor-pointer hover:border-primary-400 transition-colors"
      :style="{ aspectRatio: props.aspectRatio }"
      :class="{ 'opacity-60 pointer-events-none': props.disabled }"
      @click="fileInput?.click()"
    >
      <!-- Preview -->
      <img
        v-if="props.modelValue"
        :src="props.modelValue"
        alt="preview"
        class="w-full h-full object-cover"
      />
      <!-- Zoom button -->
      <button
        v-if="props.modelValue && !uploading"
        type="button"
        class="absolute bottom-1 right-1 bg-black/50 hover:bg-black/75 text-white rounded p-0.5 transition-colors z-10"
        title="放大查看"
        @click.stop="openLightbox(props.modelValue!)"
      >
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
        </svg>
      </button>
      <!-- Empty state -->
      <div v-else class="text-center p-3 select-none">
        <svg class="w-8 h-8 mx-auto text-gray-400 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <span class="text-xs text-gray-400">{{ props.placeholder }}</span>
      </div>
      <!-- Uploading overlay -->
      <div
        v-if="uploading"
        class="absolute inset-0 bg-black/50 flex items-center justify-center"
      >
        <div class="w-7 h-7 border-3 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    </div>

    <!-- Actions row -->
    <div class="flex items-center gap-3 text-xs text-gray-500">
      <button
        type="button"
        class="text-primary-600 hover:text-primary-800 disabled:opacity-40"
        :disabled="props.disabled || uploading"
        @click="fileInput?.click()"
      >
        {{ uploading ? '上传中...' : (props.modelValue ? '重新上传' : '选择图片') }}
      </button>
      <button
        v-if="props.modelValue"
        type="button"
        class="text-red-500 hover:text-red-700"
        :disabled="uploading"
        @click="remove"
      >
        移除
      </button>
      <span class="ml-auto">JPG / PNG / WebP</span>
    </div>

    <!-- Hidden file input -->
    <input
      ref="fileInput"
      type="file"
      :accept="props.accept"
      class="hidden"
      @change="handleFileChange"
    />
  </div>
</template>
