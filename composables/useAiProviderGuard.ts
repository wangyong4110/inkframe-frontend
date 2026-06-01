type ProviderType = 'LLM' | 'IMAGE' | 'VIDEO' | 'TTS'

interface GuardState {
  show: boolean
  type: ProviderType
}

// Module-level cache shared across all composable instances
const checkCache = new Map<ProviderType, { result: boolean; ts: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export function useAiProviderGuard() {
  const state = useState<GuardState>('ai-provider-guard', () => ({ show: false, type: 'LLM' }))
  const modelApi = useModelApi()
  const toast = useToast()

  async function checkProvider(type: ProviderType): Promise<boolean> {
    const now = Date.now()
    const cached = checkCache.get(type)
    if (cached && now - cached.ts < CACHE_TTL) return cached.result

    try {
      const typeParam = type === 'TTS' ? 'tts' : type.toLowerCase()
      const resp = await modelApi.getCapableProviders(typeParam)
      const list: any[] = (resp as any).data ?? []
      const result = list.length > 0
      checkCache.set(type, { result, ts: now })
      return result
    } catch {
      // fail-closed on network/API error — cannot confirm provider is configured
      toast.error('无法验证 AI 配置，操作已取消')
      return false
    }
  }

  async function guardAiProvider(type: ProviderType): Promise<boolean> {
    const ok = await checkProvider(type)
    if (!ok) {
      state.value = { show: true, type }
      return false
    }
    return true
  }

  function invalidateCache(type?: ProviderType) {
    if (type) checkCache.delete(type)
    else checkCache.clear()
  }

  return { guardAiProvider, invalidateCache, guardState: state }
}
