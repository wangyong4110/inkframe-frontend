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
 *   onRefine    交互式编辑回调：传入指令，返回新图片 URL（启用后 lightbox 显示重新生成面板）
 *   onSave      点击放大 → 用户保存新 URL 时的回调（用于 previewLightbox / refine 场景）
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
  onRefine?: (currentUrl: string, instruction: string) => Promise<string>
  onSave?: (newUrl: string) => void
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

function triggerUpload() {
  fileInput.value?.click()
}

function remove() {
  emit('update:modelValue', '')
}
</script>

<template>
  <div class="space-y-2">
    <!-- Image box -->
    <div
      class="group/imgbox relative rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex items-center justify-center"
      :style="{ aspectRatio: props.aspectRatio }"
      :class="{ 'opacity-60 pointer-events-none': props.disabled }"
    >
      <!-- Has image -->
      <template v-if="props.modelValue">
        <!-- Click image → zoom -->
        <img
          :src="props.modelValue"
          alt="preview"
          class="w-full h-full object-cover cursor-zoom-in"
          @click="openLightbox(props.modelValue, props.onRefine, props.onSave)"
        />
        <!-- Corner upload button (hover) -->
        <button
          v-if="!uploading"
          type="button"
          class="absolute bottom-1.5 right-1.5 p-1.5 rounded bg-black/40 text-white opacity-0 group-hover/imgbox:opacity-100 hover:bg-black/70 transition-all z-10"
          title="重新上传"
          @click.stop="triggerUpload"
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
          </svg>
        </button>
      </template>

      <!-- No image: click to upload -->
      <button
        v-else
        type="button"
        class="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-400 hover:text-primary-500 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        @click="triggerUpload"
      >
        <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
        </svg>
        <span class="text-xs select-none">{{ props.placeholder }}</span>
      </button>

      <!-- Uploading overlay -->
      <div
        v-if="uploading"
        class="absolute inset-0 bg-black/50 flex items-center justify-center z-20"
      >
        <div class="w-7 h-7 border-[3px] border-white border-t-transparent rounded-full animate-spin" />
      </div>
    </div>

    <!-- Actions row -->
    <div class="flex items-center gap-3 text-xs text-gray-500">
      <button
        type="button"
        class="text-primary-600 hover:text-primary-800 disabled:opacity-40"
        :disabled="props.disabled || uploading"
        @click="triggerUpload"
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
