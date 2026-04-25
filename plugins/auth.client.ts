export default defineNuxtPlugin(() => {
  const auth = useAuthStore()
  auth.initFromStorage()

  // 水合后检查：若未登录且不在公开页面，跳转到登录页
  const publicPaths = ['/auth/login', '/auth/register', '/auth/oauth-callback']
  const router = useRouter()
  const route = useRoute()
  if (!auth.isLoggedIn && !publicPaths.includes(route.path)) {
    router.replace('/auth/login')
  }
})
