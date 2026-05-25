<script setup lang="ts">
definePageMeta({ layout: false, auth: false })

const authStore = useAuthStore()
const router = useRouter()
const { request } = useApi()

const activeTab = ref<'email' | 'phone'>('email')

// 邮箱注册
const emailForm = reactive({
  username: '',
  email: '',
  password: '',
  nickname: '',
})
const emailLoading = ref(false)
const emailError = ref('')

async function registerWithEmail() {
  emailError.value = ''
  emailLoading.value = true
  try {
    const data = await request<any>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(emailForm),
    })
    const resp = data.data ?? data
    authStore.setFromAuthResponse(resp)
    router.push('/')
  } catch (e: any) {
    emailError.value = e.message || '注册失败'
  } finally {
    emailLoading.value = false
  }
}

// 手机号注册
const phoneForm = reactive({ phone: '', code: '', nickname: '' })
const phoneLoading = ref(false)
const phoneError = ref('')
const sendCooldown = ref(0)
let cooldownTimer: ReturnType<typeof setInterval> | null = null

async function sendPhoneCode() {
  if (sendCooldown.value > 0) return
  phoneError.value = ''
  try {
    await request('/auth/sms/send', {
      method: 'POST',
      body: JSON.stringify({ phone: phoneForm.phone }),
    })
    sendCooldown.value = 60
    cooldownTimer = setInterval(() => {
      sendCooldown.value--
      if (sendCooldown.value <= 0 && cooldownTimer) {
        clearInterval(cooldownTimer)
        cooldownTimer = null
      }
    }, 1000)
  } catch (e: any) {
    phoneError.value = e.message || '发送失败'
  }
}

async function registerWithPhone() {
  phoneError.value = ''
  phoneLoading.value = true
  try {
    const data = await request<any>('/auth/phone/register', {
      method: 'POST',
      body: JSON.stringify(phoneForm),
    })
    const resp = data.data ?? data
    authStore.setFromAuthResponse(resp)
    router.push('/')
  } catch (e: any) {
    phoneError.value = e.message || '注册失败'
  } finally {
    phoneLoading.value = false
  }
}

onUnmounted(() => { if (cooldownTimer) clearInterval(cooldownTimer) })
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-white flex items-center justify-center py-12 px-4">
    <div class="max-w-md w-full">
      <div class="text-center mb-8">
        <NuxtLink to="/" class="inline-flex items-center gap-3 justify-center">
          <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect width="36" height="36" rx="8" fill="url(#regLogoGrad)"/>
            <rect x="7" y="10" width="14" height="2" rx="1" fill="white" opacity="0.9"/>
            <rect x="7" y="14" width="11" height="2" rx="1" fill="white" opacity="0.7"/>
            <rect x="7" y="18" width="13" height="2" rx="1" fill="white" opacity="0.7"/>
            <rect x="7" y="22" width="9"  height="2" rx="1" fill="white" opacity="0.5"/>
            <path d="M23 18L29 22V14L23 18Z" fill="white"/>
            <defs>
              <linearGradient id="regLogoGrad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stop-color="#6366f1"/>
                <stop offset="100%" stop-color="#8b5cf6"/>
              </linearGradient>
            </defs>
          </svg>
          <span class="text-2xl font-bold text-white tracking-tight">InkFrame</span>
        </NuxtLink>
        <h2 class="mt-4 text-xl font-semibold text-gray-300">创建账号</h2>
      </div>

      <div class="bg-gray-900 rounded-2xl border border-gray-700/50 p-8">
        <!-- Tabs -->
        <div class="flex border-b border-gray-700/50 mb-6">
          <button
            class="flex-1 py-2 text-sm font-medium transition-colors"
            :class="activeTab === 'email' ? 'border-b-2 border-violet-500 text-violet-400' : 'text-gray-500 hover:text-gray-300'"
            @click="activeTab = 'email'"
          >邮箱注册</button>
          <button
            class="flex-1 py-2 text-sm font-medium transition-colors"
            :class="activeTab === 'phone' ? 'border-b-2 border-violet-500 text-violet-400' : 'text-gray-500 hover:text-gray-300'"
            @click="activeTab = 'phone'"
          >手机号注册</button>
        </div>

        <!-- 邮箱注册 Tab -->
        <form v-if="activeTab === 'email'" @submit.prevent="registerWithEmail" class="space-y-4">
          <div v-for="field in [
            { label: '用户名', model: 'username', type: 'text', placeholder: '请输入用户名', required: true },
            { label: '邮箱',   model: 'email',    type: 'email', placeholder: '请输入邮箱', required: true },
            { label: '密码',   model: 'password', type: 'password', placeholder: '至少8位密码', required: true },
            { label: '昵称',   model: 'nickname', type: 'text', placeholder: '请输入昵称（选填）', required: false },
          ]" :key="field.model">
            <label class="block text-sm font-medium text-gray-400 mb-1">{{ field.label }}</label>
            <input v-model="(emailForm as any)[field.model]" :type="field.type" :required="field.required"
              :placeholder="field.placeholder" :minlength="field.model === 'password' ? 8 : undefined"
              class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-violet-500 transition-colors" />
          </div>
          <p v-if="emailError" class="text-red-400 text-xs">{{ emailError }}</p>
          <button type="submit" :disabled="emailLoading"
            class="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-colors">
            {{ emailLoading ? '注册中...' : '注 册' }}
          </button>
        </form>

        <!-- 手机号注册 Tab -->
        <form v-else @submit.prevent="registerWithPhone" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">昵称</label>
            <input v-model="phoneForm.nickname" type="text" placeholder="请输入昵称（选填）"
              class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-violet-500 transition-colors" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">手机号</label>
            <input v-model="phoneForm.phone" type="tel" required placeholder="请输入手机号"
              class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-violet-500 transition-colors" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">验证码</label>
            <div class="flex gap-2">
              <input v-model="phoneForm.code" type="text" required placeholder="请输入验证码"
                class="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-violet-500 transition-colors" />
              <button type="button" :disabled="sendCooldown > 0" @click="sendPhoneCode"
                class="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-gray-300 text-sm px-4 rounded-xl transition-colors whitespace-nowrap">
                {{ sendCooldown > 0 ? `${sendCooldown}s` : '发送' }}
              </button>
            </div>
          </div>
          <p v-if="phoneError" class="text-red-400 text-xs">{{ phoneError }}</p>
          <button type="submit" :disabled="phoneLoading"
            class="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-colors">
            {{ phoneLoading ? '注册中...' : '注 册' }}
          </button>
        </form>

        <p class="mt-6 text-center text-sm text-gray-500">
          已有账号？
          <NuxtLink to="/auth/login" class="text-violet-400 hover:text-violet-300 font-medium transition-colors">登录</NuxtLink>
        </p>
      </div>
    </div>
  </div>
</template>
