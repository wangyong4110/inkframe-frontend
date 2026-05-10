<template>
  <div :class="['bg-gray-900 border rounded-xl p-5', highlight ? 'border-amber-500/30' : 'border-gray-800']">
    <div class="flex items-center gap-2 mb-3">
      <span>{{ icon }}</span>
      <h3 class="text-sm font-semibold text-white">{{ title }}</h3>
    </div>
    <div class="space-y-1.5">
      <div v-for="(value, key) in data" :key="String(key)" class="text-xs">
        <span class="text-gray-500">{{ key }}:</span>
        <span class="text-gray-300 ml-1">{{ Array.isArray(value) ? (value as unknown[]).join('、') : String(value) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  icon: string
  data: Record<string, unknown>
  highlight?: boolean
}>()
</script>
