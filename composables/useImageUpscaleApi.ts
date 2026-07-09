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
    const maxElapsedMs = 180000 // 3min max, matches the previous 90-attempt * 2s cap
    return new Promise((resolve, reject) => {
      let settled = false
      const finish = (fn: () => void) => {
        if (settled) return
        settled = true
        clearTimeout(timeoutTimer)
        fn()
      }
      const { start, stop } = usePollWithBackoff({
        fn: () => taskApi.getTask(taskId),
        isDone: (r) => r.data?.status === 'completed' || r.data?.status === 'failed',
        onResult: (r) => {
          const status = r.data?.status
          if (status === 'completed') {
            const url = (r.data?.data as any)?.image_url as string
            if (url) finish(() => resolve(url))
            else finish(() => reject(new Error('未获取到图片URL')))
          } else if (status === 'failed') {
            finish(() => reject(new Error(r.data?.error || '高清处理失败')))
          }
        },
        // 与原实现保持一致：固定 2s 间隔
        initialDelay: 2000,
        maxDelay: 2000,
        maxElapsedMs,
      })
      // usePollWithBackoff 超过 maxElapsedMs 只会静默 stop()，不会拒绝 Promise——
      // 用独立计时器补上超时报错，保持与原实现相同的行为。
      const timeoutTimer = setTimeout(() => {
        stop()
        finish(() => reject(new Error('高清处理超时')))
      }, maxElapsedMs)
      start()
    })
  }

  return { upscaleImage }
}
