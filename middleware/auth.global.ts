export default defineNuxtRouteMiddleware((to) => {
  // SSR 阶段 localStorage 不可用，跳过鉴权检查（由客户端水合后执行）
  if (import.meta.server) return

  const auth = useAuthStore()

  const publicPaths = [
    '/auth/login',
    '/auth/register',
    '/auth/oauth-callback',
  ]

  if (!auth.isLoggedIn && !publicPaths.includes(to.path)) {
    return navigateTo('/auth/login')
  }
})
