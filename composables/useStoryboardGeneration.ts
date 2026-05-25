/**
 * Shared storyboard generation wrapper used by both VideoEditor and ScriptTab.
 * Encapsulates the confirmation guard, store call, and toast feedback so neither
 * component duplicates that logic.
 */
export interface GenerateStoryboardParams {
  videoId: number
  provider?: string
  userPrompt?: string
  pacing?: string
  targetDuration?: number
  maxTokens?: number
  temperature?: number
  timeoutSeconds?: number
  voiceMode?: string
}

export function useStoryboardGeneration() {
  const videoStore = useVideoStore()
  const toast = useToast()
  const { confirm } = useConfirm()

  async function generateStoryboard(params: GenerateStoryboardParams): Promise<void> {
    const isConfirmed = videoStore.currentVideo?.script_status === 'confirmed'
    if (isConfirmed) {
      if (!confirm('重新生成将清空当前脚本，是否继续？')) return
    }
    try {
      await videoStore.generateStoryboard(params.videoId, {
        provider: params.provider,
        userPrompt: params.userPrompt,
        pacing: params.pacing !== 'normal' ? params.pacing : undefined,
        targetDuration: params.targetDuration || undefined,
        maxTokens: params.maxTokens || undefined,
        temperature: params.temperature || undefined,
        timeoutSeconds: params.timeoutSeconds || undefined,
        voiceMode: params.voiceMode !== 'both' ? params.voiceMode : undefined,
      })
      toast.success('脚本生成任务已提交，请稍候...')
    } catch (e: any) {
      toast.error('生成失败：' + (e.message || ''))
    }
  }

  return { generateStoryboard }
}
