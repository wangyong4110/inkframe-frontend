/**
 * 通用图片上传 composable
 * 调用 POST /api/v1/upload/image，返回存储后的公开 URL
 */
export function useImageUpload() {
  const config = useRuntimeConfig()
  const apiBase = config.public.apiBase
  const uploading = ref(false)

  async function uploadImage(file: File): Promise<string> {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    const allowed = ['jpg', 'jpeg', 'png', 'webp', 'gif']
    if (!allowed.includes(ext)) {
      throw new Error('只支持 JPG / PNG / WebP / GIF 格式')
    }

    uploading.value = true
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : ''
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(`${apiBase}/upload/image`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: form,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: 'Upload failed' }))
        throw new Error(err.message || `HTTP ${res.status}`)
      }
      const json = await res.json()
      return json.data.url as string
    } finally {
      uploading.value = false
    }
  }

  return { uploading, uploadImage }
}
