declare module '#app' {
  interface PageMeta {
    auth?: boolean
  }
}

export default defineNuxtRouteMiddleware((to) => {
  // SSR 阶段 localStorage 不可用，跳过鉴权检查（由客户端水合后执行）
  if (import.meta.server) return

  const auth = useAuthStore()

  // Pages with definePageMeta({ auth: false }) are public
  if (to.meta.auth === false) return

  if (!auth.isLoggedIn) {
    return navigateTo('/auth/login')
  }
})
