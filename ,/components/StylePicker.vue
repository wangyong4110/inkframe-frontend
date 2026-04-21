<script setup lang="ts">
import type { WritingStylePreset, ImageStylePreset, VideoStylePreset } from '~/types'
import { WRITING_PRESETS, IMAGE_PRESETS, VIDEO_PRESETS } from '~/composables/useStylePresets'

type PickerType = 'writing' | 'image' | 'video'

const props = withDefaults(defineProps<{
  type: PickerType
  modelValue: string
  compact?: boolean
}>(), {
  compact: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const presets = computed(() => {
  if (props.type === 'writing') return WRITING_PRESETS as any[]
  if (props.type === 'image')   return IMAGE_PRESETS as any[]
  return VIDEO_PRESETS as any[]
})

function select(id: string) {
  emit('update:modelValue', id === props.modelValue ? '' : id)
}

function gradientStyle(colors: string[]): string {
  if (!colors?.length) return 'background: #e5e7eb'
  if (colors.length === 1) return `background: ${colors[0]}`
  return `background: linear-gradient(135deg, ${colors.join(', ')})`
}
</script>

<template>
  <div
    class="grid gap-3"
    :class="compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4'"
  >
    <button
      v-for="preset in presets"
      :key="preset.id"
      type="button"
      class="group relative rounded-xl border-2 text-left transition-all overflow-hidden focus:outline-none"
      :class="[
        modelValue === preset.id
          ? 'border-primary-500 shadow-md'
          : 'border-gray-200 dark:border-gray-700 hover:border-primary-300',
      ]"
      @click="select(preset.id)"
    >
      <!-- Color swatch (image presets) or gradient header (others) -->
      <div
        class="h-10 w-full"
        :style="type === 'image'
          ? gradientStyle(preset.preview_colors)
          : type === 'video'
            ? 'background: linear-gradient(135deg, #1e3a5f, #2d6a9f)'
            : 'background: linear-gradient(135deg, #4f46e5, #7c3aed)'"
      >
        <!-- Video: show aspect ratio badge -->
        <span
          v-if="type === 'video'"
          class="absolute top-1.5 left-2 text-[10px] font-bold text-white bg-black/40 rounded px-1.5 py-0.5"
        >
          {{ preset.aspect_ratio }}
        </span>
        <!-- Selected tick -->
        <span
          v-if="modelValue === preset.id"
          class="absolute top-1.5 right-2 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center"
        >
          <svg class="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
          </svg>
        </span>
      </div>

      <!-- Card body -->
      <div class="p-2.5">
        <p class="text-sm font-semibold text-gray-900 dark:text-white leading-tight">{{ preset.name }}</p>
        <p
          v-if="!compact"
          class="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-2"
        >
          {{ preset.description }}
        </p>
        <!-- Tags -->
        <div v-if="!compact" class="mt-1.5 flex flex-wrap gap-1">
          <span
            v-for="tag in preset.tags.slice(0, 2)"
            :key="tag"
            class="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
          >
            {{ tag }}
          </span>
        </div>
        <!-- Video: fps badge -->
        <p v-if="type === 'video' && !compact" class="mt-1 text-xs text-gray-400">
          {{ preset.frame_rate }} fps
        </p>
      </div>
    </button>
  </div>
</template>
