export function useImageEditApi() {
  async function editImage(imageUrl: string, instruction: string, novelId?: number): Promise<string> {
    if (!imageUrl) throw new Error('请先生成或上传一张图片，再进行 AI 修改')
    const { request } = useApi()
    const res: any = await request('/images/edit', {
      method: 'POST',
      body: JSON.stringify({ image_url: imageUrl, instruction, novel_id: novelId ?? 0 }),
    })
    const taskId: string = res?.data?.task_id ?? res?.task_id ?? ''
    if (!taskId) throw new Error('未获取到任务ID')
    // Poll until done
    const taskApi = useTaskApi()
    return new Promise((resolve, reject) => {
      let attempts = 0
      const maxAttempts = 60 // 2min max at 2s interval
      function poll() {
        attempts++
        if (attempts > maxAttempts) { reject(new Error('图片编辑超时')); return }
        taskApi.getTask(taskId).then(r => {
          const status = r.data?.status
          if (status === 'completed') {
            const url = (r.data?.data as any)?.image_url as string
            if (url) resolve(url)
            else reject(new Error('未获取到图片URL'))
          } else if (status === 'failed') {
            reject(new Error(r.data?.error || '图片编辑失败'))
          } else {
            setTimeout(poll, 2000)
          }
        }).catch(() => { setTimeout(poll, 2000) })
      }
      setTimeout(poll, 2000)
    })
  }

  return { editImage }
}
