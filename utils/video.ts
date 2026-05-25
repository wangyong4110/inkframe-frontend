export function parseSfxTags(sfxTags?: string): string[] {
  if (!sfxTags) return []
  try { return JSON.parse(sfxTags) as string[] } catch { return [] }
}
