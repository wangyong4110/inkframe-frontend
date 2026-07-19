/**
 * Shared storyboard generation wrapper used by both VideoEditor and ScriptTab.
 * Encapsulates the confirmation guard, store call, and toast feedback so neither
 * component duplicates that logic.
 */
export interface GenerateStoryboardParams {
  videoId: number
  provider?: string
  maxTokens?: number
  temperature?: number
  timeoutSeconds?: number
}

export function useStoryboardGeneration() {
  const videoStore = useVideoStore()
  const toast = useToast()
  const { confirm } = useConfirm()

  async function generateStoryboard(params: GenerateStoryboardParams): Promise<void> {
    const hasShots = videoStore.storyboard.length > 0
    if (hasShots) {
      if (!confirm('重新生成将清空当前脚本，是否继续？')) return
    }
    try {
      await videoStore.generateStoryboard(params.videoId, {
        provider: params.provider,
        maxTokens: params.maxTokens || undefined,
        temperature: params.temperature || undefined,
        timeoutSeconds: params.timeoutSeconds || undefined,
      })
      toast.success('脚本生成任务已提交，请稍候...')
    } catch (e: any) {
      toast.error('生成失败：' + (e.message || ''))
    }
  }

  return { generateStoryboard }
}
