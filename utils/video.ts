export function parseSfxTags(sfxTags?: string): string[] {
  if (!sfxTags) return []
  try {
    const parsed = JSON.parse(sfxTags)
    if (!Array.isArray(parsed) || parsed.length === 0) return []
    // New format: [{tag: string, type: string}]
    if (typeof parsed[0] === 'object' && parsed[0] !== null && 'tag' in parsed[0]) {
      return (parsed as Array<{ tag: string }>).map(t => t.tag).filter(Boolean)
    }
    // Old format: string[]
    return parsed as string[]
  } catch {
    return []
  }
}
