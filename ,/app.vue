<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">
// Global error handling
const error = useError()

watchEffect(() => {
  if (error.value) {
    console.error('Global error:', error.value)
  }
})
</script>
