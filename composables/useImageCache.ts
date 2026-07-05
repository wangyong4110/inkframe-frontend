interface CacheEntry {
  url: string
  expires: number
}

const STORAGE_KEY = 'inkframe:img_cache_v1'
const TTL_MS = 24 * 60 * 60 * 1000

// 模块级单例，页面生命周期内跨组件复用
const memCache = new Map<string, CacheEntry>()

function loadFromStorage(): void {
  if (typeof localStorage === 'undefined') return
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const entries = JSON.parse(raw) as Record<string, CacheEntry>
    const now = Date.now()
    for (const [k, v] of Object.entries(entries)) {
      if (v.expires > now) memCache.set(k, v)
    }
  } catch {}
}

function persistToStorage(): void {
  if (typeof localStorage === 'undefined') return
  try {
    const now = Date.now()
    const obj: Record<string, CacheEntry> = {}
    for (const [k, v] of memCache) {
      if (v.expires > now) obj[k] = v
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
  } catch {}
}

loadFromStorage()

/**
 * 为阿里云 OSS URL 附加图片处理参数，返回指定宽度的 WebP 缩略图 URL。
 * 结果缓存 24h（内存 + localStorage），非 OSS URL 原样返回。
 */
export function ossThumb(url: string, width = 400): string {
  if (!url) return url
  if (!url.includes('aliyuncs.com')) return url
  if (url.includes('x-oss-process')) return url

  const key = `${url}@${width}`
  const now = Date.now()
  const cached = memCache.get(key)
  if (cached && cached.expires > now) return cached.url

  const thumbUrl = `${url}?x-oss-process=image/resize,w_${width}/format,webp`
  memCache.set(key, { url: thumbUrl, expires: now + TTL_MS })
  persistToStorage()
  return thumbUrl
}

export function useImageCache() {
  return { ossThumb }
}
