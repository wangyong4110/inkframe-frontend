/**
 * useAiGenerationParams
 *
 * Persists AI generation parameters in a single cookie so they survive page
 * refreshes. Cookie values take priority over novel DB defaults.
 * undefined in the cookie means "user has not explicitly set this param yet";
 * in that case initFromNovel may fill in project defaults.
 */

interface AiGenParamsCookie {
  maxTokens?: number
  temperature?: number
  timeoutSeconds?: number
}

export const useAiGenerationParams = () => {
  const ONE_YEAR = 60 * 60 * 24 * 365

  const cookie = useCookie<AiGenParamsCookie>('ai_gen_params', {
    default: () => ({}),
    maxAge: ONE_YEAR,
  })

  // ── Working refs — initialized from cookie, fall back to sensible defaults ──
  const advMaxTokens      = ref<number>(cookie.value?.maxTokens ?? 0)
  const advTemperature    = ref<number>(cookie.value?.temperature ?? 0)
  const advTimeoutSeconds = ref<number>(cookie.value?.timeoutSeconds ?? 0)

  // ── Auto-save to cookie whenever any param changes ─────────────────────────
  watch(advMaxTokens,      (v) => { cookie.value = { ...cookie.value, maxTokens: v } })
  watch(advTemperature,    (v) => { cookie.value = { ...cookie.value, temperature: v } })
  watch(advTimeoutSeconds, (v) => { cookie.value = { ...cookie.value, timeoutSeconds: v } })

  // ── Initialise from novel project config (skipped if user already set param) ─
  function initFromNovel(novel: {
    max_tokens?: number
    temperature?: number
    timeout_seconds?: number
  } | null | undefined) {
    if (!novel) return
    if (cookie.value?.maxTokens === undefined && novel.max_tokens)
      advMaxTokens.value = novel.max_tokens
    if (cookie.value?.temperature === undefined && novel.temperature)
      advTemperature.value = novel.temperature
    if (cookie.value?.timeoutSeconds === undefined && novel.timeout_seconds)
      advTimeoutSeconds.value = novel.timeout_seconds
  }

  return {
    advMaxTokens,
    advTemperature,
    advTimeoutSeconds,
    initFromNovel,
  }
}
