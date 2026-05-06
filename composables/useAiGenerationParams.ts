/**
 * useAiGenerationParams
 *
 * Persists AI generation parameters in a single cookie so they survive page
 * refreshes. Cookie values take priority over novel/video DB defaults.
 * undefined in the cookie means "user has not explicitly set this param yet";
 * in that case initFromNovel / initFromVideo may fill in project defaults.
 */

interface AiGenParamsCookie {
  pacing?: 'slow' | 'normal' | 'fast'
  targetDuration?: number
  maxTokens?: number
  temperature?: number
  timeoutSeconds?: number
  voiceMode?: 'both' | 'narration' | 'dialogue'
}

export const useAiGenerationParams = () => {
  const ONE_YEAR = 60 * 60 * 24 * 365

  const cookie = useCookie<AiGenParamsCookie>('ai_gen_params', {
    default: () => ({}),
    maxAge: ONE_YEAR,
  })

  // ── Working refs — initialized from cookie, fall back to sensible defaults ──
  const pacing            = ref<'slow' | 'normal' | 'fast'>(cookie.value?.pacing ?? 'normal')
  const targetDuration    = ref<number>(cookie.value?.targetDuration ?? 0)
  const advMaxTokens      = ref<number>(cookie.value?.maxTokens ?? 0)
  const advTemperature    = ref<number>(cookie.value?.temperature ?? 0)
  const advTimeoutSeconds = ref<number>(cookie.value?.timeoutSeconds ?? 0)
  const voiceMode         = ref<'both' | 'narration' | 'dialogue'>(cookie.value?.voiceMode ?? 'both')

  // ── Auto-save to cookie whenever any param changes ─────────────────────────
  watch(pacing,            (v) => { cookie.value = { ...cookie.value, pacing: v } })
  watch(targetDuration,    (v) => { cookie.value = { ...cookie.value, targetDuration: v } })
  watch(advMaxTokens,      (v) => { cookie.value = { ...cookie.value, maxTokens: v } })
  watch(advTemperature,    (v) => { cookie.value = { ...cookie.value, temperature: v } })
  watch(advTimeoutSeconds, (v) => { cookie.value = { ...cookie.value, timeoutSeconds: v } })
  watch(voiceMode,         (v) => { cookie.value = { ...cookie.value, voiceMode: v } })

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

  // ── Initialise from video DB record (skipped if user already set param) ────
  function initFromVideo(video: {
    pacing?: string
    target_duration?: number
  } | null | undefined) {
    if (!video) return
    if (cookie.value?.pacing === undefined)
      pacing.value = (video.pacing as 'slow' | 'normal' | 'fast') ?? 'normal'
    if (cookie.value?.targetDuration === undefined)
      targetDuration.value = video.target_duration ?? 0
  }

  return {
    pacing,
    targetDuration,
    advMaxTokens,
    advTemperature,
    advTimeoutSeconds,
    voiceMode,
    initFromNovel,
    initFromVideo,
  }
}
