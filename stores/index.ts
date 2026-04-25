// Nuxt 自动扫描 stores 目录下的所有文件
// 此文件用于便捷访问，但 named exports 会导致重复导入警告
// 推荐直接在各组件中使用 import { useNovelStore } from '~/stores/novel'

import { useNovelStore } from './novel'
import { useChapterStore } from './chapter'
import { useCharacterStore } from './character'
import { useVideoStore } from './video'
import { useTenantStore } from './tenant'
import { useAuthStore } from './auth'

export {
  useNovelStore,
  useChapterStore,
  useCharacterStore,
  useVideoStore,
  useTenantStore,
  useAuthStore,
}

// 便捷的 default export（可选使用）
export default {
  novel: useNovelStore,
  chapter: useChapterStore,
  character: useCharacterStore,
  video: useVideoStore,
  tenant: useTenantStore,
  auth: useAuthStore,
}
