// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  ssr: false,
  devtools: { enabled: true },

  modules: [
    '@nuxtjs/tailwindcss',
    '@pinia/nuxt',
    '@vueuse/nuxt',
  ],

  css: ['~/assets/css/main.css'],

  typescript: {
    strict: true,
    typeCheck: false,
  },

  app: {
    head: {
      title: 'InkFrame - 智能小说创作平台',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: '基于AI的智能小说创作平台，支持小说生成、视频制作、多模型管理' },
      ],
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      ],
    },
  },

  runtimeConfig: {
    public: {
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:8080/api/v1',
      wsBase: process.env.NUXT_PUBLIC_WS_BASE || 'ws://localhost:8080',
    },
  },

  routeRules: {
    '/api/**':     { proxy: { to: 'http://localhost:8080/api/**' } },
    '/uploads/**': { proxy: { to: 'http://localhost:8080/uploads/**' } },
  },

  nitro: {
    preset: 'node-server',
  },

  vite: {
    build: {
      target: 'es2022',
    },
  },

  postcss: {
    plugins: {
      // autoprefixer reads browserslist from package.json and adds
      // -webkit-backdrop-filter and other vendor prefixes for Safari 14
      autoprefixer: {},
      // Polyfill CSS @layer — Tailwind v3 outputs @layer rules which
      // Safari 14 does not recognise (supported only from Safari 15.4)
      '@csstools/postcss-cascade-layers': {},
    },
  },

  compatibilityDate: '2024-01-01',
})
