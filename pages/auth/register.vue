<script setup lang="ts">
definePageMeta({ layout: false, auth: false })

const authStore = useAuthStore()
const router = useRouter()
const { request } = useApi()
const toast = useToast()

const activeTab = ref<'email' | 'phone'>('email')
const agreed = ref(false)

// 邮箱注册
const emailForm = reactive({
  username: '',
  email: '',
  password: '',
  nickname: '',
})
const emailLoading = ref(false)
const emailError = ref('')
const emailPendingVerify = ref(false) // 注册成功，等待邮箱验证
const emailVerifyExpiresIn = ref('') // 验证链接有效时长，来自服务端
const usernameSuggestions = ref<string[]>([])

async function registerWithEmail() {
  if (!agreed.value) { emailError.value = '请先阅读并同意使用条款和隐私政策'; return }
  emailError.value = ''
  usernameSuggestions.value = []
  emailLoading.value = true
  try {
    const data = await request<any>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(emailForm),
    })
    const resp = data.data ?? data
    if (resp.token) {
      // 未开启邮箱验证，直接登录
      authStore.setFromAuthResponse(resp)
      router.push('/')
    } else {
      // 开启了邮箱验证，等待用户点击验证邮件
      emailVerifyExpiresIn.value = resp.expires_in || ''
      emailPendingVerify.value = true
      toast.success(`验证邮件已发送至 ${emailForm.email}，请查收邮箱并点击链接完成验证`)
    }
  } catch (e: any) {
    if (e.suggestions?.length) {
      emailError.value = '用户名已被使用，请换一个或选择下方推荐'
      usernameSuggestions.value = e.suggestions
    } else {
      emailError.value = e.message || '注册失败'
    }
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
  if (!agreed.value) { phoneError.value = '请先阅读并同意使用条款和隐私政策'; return }
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
          <AppLogo :size="36" />
          <span class="text-2xl font-bold text-white tracking-tight">简影</span>
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

        <!-- 邮箱注册：等待验证提示 -->
        <div v-if="activeTab === 'email' && emailPendingVerify" class="py-6 text-center space-y-4">
          <div class="text-4xl">📬</div>
          <p class="text-white font-semibold">验证邮件已发送</p>
          <p class="text-sm text-gray-400 leading-relaxed">
            请查收发送至 <span class="text-violet-400">{{ emailForm.email }}</span> 的验证邮件，<br>
            点击邮件中的链接完成验证后即可登录。
          </p>
          <p v-if="emailVerifyExpiresIn" class="text-xs text-gray-500">
            链接 <span class="text-amber-400">{{ emailVerifyExpiresIn }}</span>内有效
          </p>
          <NuxtLink to="/auth/login" class="inline-block mt-2 text-sm text-violet-400 hover:text-violet-300 transition-colors">
            前往登录
          </NuxtLink>
        </div>

        <!-- 邮箱注册 Tab -->
        <form v-else-if="activeTab === 'email'" @submit.prevent="registerWithEmail" class="space-y-4">
          <div v-for="field in [
            { label: '用户名', model: 'username', type: 'text', placeholder: '请输入用户名', required: true },
            { label: '邮箱',   model: 'email',    type: 'email', placeholder: '请输入邮箱', required: true },
            { label: '密码',   model: 'password', type: 'password', placeholder: '至少8位密码', required: true },
            { label: '昵称',   model: 'nickname', type: 'text', placeholder: '请输入昵称（选填）', required: false },
          ]" :key="field.model">
            <label class="block text-sm font-medium text-gray-400 mb-1">{{ field.label }}</label>
            <input v-model="(emailForm as any)[field.model]" :type="field.type" :required="field.required"
              :placeholder="field.placeholder" :minlength="field.model === 'password' ? 8 : undefined"
              :aria-label="field.label"
              class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-violet-500 transition-colors"
              @input="field.model === 'username' && (usernameSuggestions = [])" />
            <div v-if="field.model === 'username' && usernameSuggestions.length" class="mt-1.5 flex flex-wrap gap-1.5">
              <span class="text-xs text-gray-500">推荐：</span>
              <button v-for="s in usernameSuggestions" :key="s" type="button"
                class="text-xs px-2 py-0.5 rounded-full bg-gray-700 hover:bg-violet-600 text-gray-300 hover:text-white transition-colors"
                @click="emailForm.username = s; usernameSuggestions = []">{{ s }}</button>
            </div>
          </div>
          <label class="flex items-start gap-2 cursor-pointer select-none">
            <input type="checkbox" v-model="agreed"
              class="mt-0.5 w-4 h-4 rounded border-gray-600 bg-gray-800 accent-violet-500 cursor-pointer flex-shrink-0" />
            <span class="text-xs text-gray-500 leading-relaxed">
              我已阅读并同意
              <NuxtLink to="/terms" target="_blank" class="text-violet-400 hover:text-violet-300 transition-colors">《用户服务协议》</NuxtLink>
              和
              <NuxtLink to="/privacy" target="_blank" class="text-violet-400 hover:text-violet-300 transition-colors">《隐私政策》</NuxtLink>
            </span>
          </label>
          <p v-if="emailError" class="text-red-400 text-xs" role="alert">{{ emailError }}</p>
          <button type="submit" :disabled="emailLoading || !agreed" aria-label="注册"
            class="w-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white font-medium py-2.5 rounded-xl transition-colors">
            {{ emailLoading ? '注册中...' : '注 册' }}
          </button>
        </form>

        <!-- 手机号注册 Tab -->
        <form v-else @submit.prevent="registerWithPhone" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">昵称</label>
            <input v-model="phoneForm.nickname" type="text" placeholder="请输入昵称（选填）"
              aria-label="昵称"
              class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-violet-500 transition-colors" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">手机号</label>
            <input v-model="phoneForm.phone" type="tel" required placeholder="请输入手机号"
              aria-label="手机号"
              class="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-violet-500 transition-colors" />
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">验证码</label>
            <div class="flex gap-2">
              <input v-model="phoneForm.code" type="text" required placeholder="请输入验证码"
                aria-label="验证码"
                class="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2.5 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-violet-500 transition-colors" />
              <button type="button" :disabled="sendCooldown > 0" @click="sendPhoneCode"
                aria-label="发送验证码"
                class="bg-gray-800 hover:bg-gray-700 disabled:opacity-50 border border-gray-700 text-gray-300 text-sm px-4 rounded-xl transition-colors whitespace-nowrap">
                {{ sendCooldown > 0 ? `${sendCooldown}s` : '发送' }}
              </button>
            </div>
          </div>
          <label class="flex items-start gap-2 cursor-pointer select-none">
            <input type="checkbox" v-model="agreed"
              class="mt-0.5 w-4 h-4 rounded border-gray-600 bg-gray-800 accent-violet-500 cursor-pointer flex-shrink-0" />
            <span class="text-xs text-gray-500 leading-relaxed">
              我已阅读并同意
              <NuxtLink to="/terms" target="_blank" class="text-violet-400 hover:text-violet-300 transition-colors">《用户服务协议》</NuxtLink>
              和
              <NuxtLink to="/privacy" target="_blank" class="text-violet-400 hover:text-violet-300 transition-colors">《隐私政策》</NuxtLink>
            </span>
          </label>
          <p v-if="phoneError" class="text-red-400 text-xs" role="alert">{{ phoneError }}</p>
          <button type="submit" :disabled="phoneLoading || !agreed" aria-label="注册"
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
  <AppToast />
</template>
