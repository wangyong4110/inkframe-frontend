export function useImageUpscaleApi() {
  // method: "bicubic" = 算法放大（秒级），"ai" = AI 增强（较慢，质量更好）
  async function upscaleImage(imageUrl: string, scale = 2, method: 'bicubic' | 'ai' = 'bicubic', novelId?: number): Promise<string> {
    if (!imageUrl) throw new Error('请先生成或上传一张图片，再进行高清处理')
    const { request } = useApi()
    const res: any = await request('/images/upscale', {
      method: 'POST',
      body: JSON.stringify({ image_url: imageUrl, scale, method, novel_id: novelId ?? 0 }),
    })
    const taskId: string = res?.data?.task_id ?? res?.task_id ?? ''
    if (!taskId) throw new Error('未获取到任务ID')
    const taskApi = useTaskApi()
    return new Promise((resolve, reject) => {
      let attempts = 0
      const maxAttempts = 90 // 3min max at 2s interval
      function poll() {
        attempts++
        if (attempts > maxAttempts) { reject(new Error('高清处理超时')); return }
        taskApi.getTask(taskId).then(r => {
          const status = r.data?.status
          if (status === 'completed') {
            const url = (r.data?.data as any)?.image_url as string
            if (url) resolve(url)
            else reject(new Error('未获取到图片URL'))
          } else if (status === 'failed') {
            reject(new Error(r.data?.error || '高清处理失败'))
          } else {
            setTimeout(poll, 2000)
          }
        }).catch(() => { setTimeout(poll, 2000) })
      }
      setTimeout(poll, 2000)
    })
  }

  return { upscaleImage }
}
