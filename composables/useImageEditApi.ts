export function useImageEditApi() {
  const { request } = useApi()

  async function editImage(imageUrl: string, instruction: string, novelId?: number): Promise<string> {
    if (!imageUrl) throw new Error('请先生成或上传一张图片，再进行 AI 修改')
    const res: { code: number; data: { image_url: string } } = await request('/images/edit', {
      method: 'POST',
      body: JSON.stringify({ image_url: imageUrl, instruction, novel_id: novelId ?? 0 }),
    })
    return res.data.image_url
  }

  return { editImage }
}
