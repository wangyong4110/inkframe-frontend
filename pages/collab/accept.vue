<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const toast = useToast()
const collabApi = useCollabApi()

const token = route.query.token as string
const loading = ref(true)
const error = ref('')

onMounted(async () => {
  if (!token) {
    error.value = '邀请链接无效'
    loading.value = false
    return
  }
  try {
    const res = await collabApi.acceptInvite(token)
    const novelId = (res as any)?.data?.novel_id ?? (res as any)?.novel_id
    toast.success('已成功加入协作！')
    await router.push(`/novel/${novelId}`)
  } catch (e: any) {
    error.value = e?.message || '邀请链接无效或已过期'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
    <div class="card max-w-sm w-full mx-4 p-8 text-center">
      <div v-if="loading">
        <div class="w-10 h-10 border-[3px] border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p class="text-gray-600 dark:text-gray-400">正在处理邀请...</p>
      </div>
      <div v-else-if="error">
        <div class="text-4xl mb-4">😢</div>
        <p class="text-red-500 font-medium mb-4">{{ error }}</p>
        <button class="btn-primary" @click="router.push('/')">返回首页</button>
      </div>
    </div>
  </div>
</template>
