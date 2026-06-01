<script setup lang="ts">
definePageMeta({ layout: false, auth: false })

const route = useRoute()
const { request } = useApi()

type VerifyState = 'loading' | 'success' | 'error'
const state = ref<VerifyState>('loading')
const errorMsg = ref('')

onMounted(async () => {
  const token = route.query.token as string
  if (!token) {
    state.value = 'error'
    errorMsg.value = '无效的验证链接'
    return
  }
  try {
    await request(`/auth/email-verification/verify?token=${encodeURIComponent(token)}`)
    state.value = 'success'
  } catch (e: any) {
    state.value = 'error'
    errorMsg.value = e.message || '验证失败，链接可能已过期'
  }
})
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white flex items-center justify-center py-12 px-4">
    <div class="max-w-md w-full text-center space-y-6">
      <NuxtLink to="/" class="inline-flex items-center gap-3 justify-center">
        <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
          <rect width="36" height="36" rx="8" fill="url(#vLogoGrad)"/>
          <rect x="7" y="10" width="14" height="2" rx="1" fill="white" opacity="0.9"/>
          <rect x="7" y="14" width="11" height="2" rx="1" fill="white" opacity="0.7"/>
          <rect x="7" y="18" width="13" height="2" rx="1" fill="white" opacity="0.7"/>
          <rect x="7" y="22" width="9"  height="2" rx="1" fill="white" opacity="0.5"/>
          <path d="M23 18L29 22V14L23 18Z" fill="white"/>
          <defs>
            <linearGradient id="vLogoGrad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#6366f1"/>
              <stop offset="100%" stop-color="#8b5cf6"/>
            </linearGradient>
          </defs>
        </svg>
        <span class="text-2xl font-bold text-white tracking-tight">简影</span>
      </NuxtLink>

      <div class="bg-gray-900 rounded-2xl border border-gray-700/50 p-10 space-y-4">
        <!-- Loading -->
        <template v-if="state === 'loading'">
          <div class="text-3xl animate-pulse">⏳</div>
          <p class="text-gray-400">正在验证邮箱...</p>
        </template>

        <!-- Success -->
        <template v-else-if="state === 'success'">
          <div class="text-4xl">✅</div>
          <p class="text-white font-semibold text-lg">邮箱验证成功</p>
          <p class="text-sm text-gray-400">您的账号已激活，现在可以登录了。</p>
          <NuxtLink
            to="/auth/login"
            class="inline-block mt-2 bg-violet-600 hover:bg-violet-500 text-white font-medium px-8 py-2.5 rounded-xl transition-colors"
          >
            前往登录
          </NuxtLink>
        </template>

        <!-- Error -->
        <template v-else>
          <div class="text-4xl">❌</div>
          <p class="text-white font-semibold">验证失败</p>
          <p class="text-sm text-red-400">{{ errorMsg }}</p>
          <NuxtLink
            to="/auth/register"
            class="inline-block mt-2 text-sm text-violet-400 hover:text-violet-300 transition-colors"
          >
            重新注册
          </NuxtLink>
        </template>
      </div>
    </div>
  </div>
</template>
