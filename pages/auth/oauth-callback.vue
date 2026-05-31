<script setup lang="ts">
definePageMeta({ layout: false, auth: false })

const route = useRoute()
const authStore = useAuthStore()

onMounted(() => {
  // Backend sends token via hash fragment (#token=xxx&expires_at=yyy) to prevent
  // token leakage in server access logs and Referer headers.
  const hashParams = new URLSearchParams(window.location.hash.slice(1))
  const token = hashParams.get('token')
  const expiresAt = hashParams.get('expires_at')
  // Errors come via query string (e.g. ?error=oauth_failed)
  const error = route.query.error as string | undefined

  if (error || !token) {
    navigateTo('/auth/login?error=' + (error || 'oauth_failed'))
    return
  }

  authStore.setToken(token, expiresAt || '')
  authStore.fetchMe().then(() => {
    navigateTo('/')
  })
})
</script>

<template>
  <div class="min-h-screen bg-gray-50 flex items-center justify-center">
    <div class="text-center">
      <div class="w-10 h-10 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p class="text-gray-600 text-sm">正在处理登录...</p>
    </div>
  </div>
</template>
