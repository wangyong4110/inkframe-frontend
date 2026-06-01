<template>
  <div class="min-h-screen bg-gray-950 text-white flex items-center justify-center py-12 px-4">
    <div class="max-w-md w-full">
      <!-- Logo -->
      <div class="text-center mb-8">
        <NuxtLink to="/" class="inline-flex items-center gap-3 justify-center">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="36" height="36" rx="8" fill="url(#forgotLogoGrad)"/>
            <rect x="7" y="10" width="14" height="2" rx="1" fill="white" opacity="0.9"/>
            <rect x="7" y="14" width="11" height="2" rx="1" fill="white" opacity="0.7"/>
            <rect x="7" y="18" width="13" height="2" rx="1" fill="white" opacity="0.7"/>
            <rect x="7" y="22" width="9"  height="2" rx="1" fill="white" opacity="0.5"/>
            <path d="M23 18L29 22V14L23 18Z" fill="white"/>
            <defs>
              <linearGradient id="forgotLogoGrad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#6366f1"/>
                <stop offset="100%" stop-color="#8b5cf6"/>
              </linearGradient>
            </defs>
          </svg>
          <span class="text-2xl font-bold text-white tracking-tight">简影</span>
        </NuxtLink>
        <h2 class="mt-4 text-xl font-semibold text-gray-300">重置密码</h2>
        <p class="mt-1 text-sm text-gray-500">输入注册邮箱，我们将发送重置链接</p>
      </div>

      <div class="bg-gray-900 rounded-2xl border border-gray-700/50 p-8">
        <div v-if="!submitted" class="space-y-4">
          <div>
            <label for="email" class="block text-sm font-medium text-gray-400 mb-1">邮箱地址</label>
            <input
              id="email"
              v-model="email"
              type="email"
              autocomplete="email"
              required
              aria-label="邮箱地址"
              class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-violet-500 transition-colors"
              placeholder="your@email.com"
              @keydown.enter="submit"
            />
          </div>

          <div v-if="error" class="rounded-md border border-red-300 bg-red-50 p-4 text-sm text-red-700" role="alert">
            {{ error }}
          </div>

          <button
            @click="submit"
            :disabled="loading"
            aria-label="发送重置链接"
            class="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-xl transition-colors"
          >
            <span v-if="loading">发送中...</span>
            <span v-else>发送重置链接</span>
          </button>

          <div class="text-center">
            <NuxtLink to="/auth/login" class="text-sm text-violet-400 hover:text-violet-300 transition-colors">
              返回登录
            </NuxtLink>
          </div>
        </div>

        <div v-else class="text-center space-y-4 py-4">
          <div class="text-4xl">📬</div>
          <p class="text-white font-semibold">重置链接已发送</p>
          <p class="text-sm text-gray-400 leading-relaxed">
            请检查发送至 <span class="text-violet-400">{{ email }}</span> 的邮件，<br>
            点击邮件中的链接重置您的密码。
          </p>
          <NuxtLink to="/auth/login" class="inline-block mt-2 text-sm text-violet-400 hover:text-violet-300 transition-colors">
            返回登录
          </NuxtLink>
        </div>
      </div>
    </div>
  </div>
  <AppToast />
</template>

<script setup lang="ts">
definePageMeta({ layout: false, auth: false })

const { request } = useApi()

const email = ref('')
const loading = ref(false)
const error = ref('')
const submitted = ref(false)

async function submit() {
  error.value = ''
  if (!email.value) {
    error.value = '请输入邮箱地址'
    return
  }
  loading.value = true
  try {
    await request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email: email.value }),
    })
    submitted.value = true
  } catch (e: any) {
    error.value = e?.message || '发送失败，请稍后重试'
  } finally {
    loading.value = false
  }
}
</script>
