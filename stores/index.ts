// Stores exports
export { useNovelStore } from './novel'
export { useChapterStore } from './chapter'
export { useCharacterStore } from './character'
export { useVideoStore } from './video'

// Re-export stores as default for convenience
import { useNovelStore } from './novel'
import { useChapterStore } from './chapter'
import { useCharacterStore } from './character'
import { useVideoStore } from './video'

export default {
  novel: useNovelStore,
  chapter: useChapterStore,
  character: useCharacterStore,
  video: useVideoStore,
}
