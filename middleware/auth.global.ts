export default defineNuxtRouteMiddleware((to) => {
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
