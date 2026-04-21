# InkFrame Frontend

AI-powered novel creation platform — built with Nuxt 3 + Vue 3.

## Tech Stack

| Technology | Description |
|------------|-------------|
| Nuxt 3 | SSR framework, file-based routing |
| Vue 3 | Composition API + `<script setup>` |
| Pinia | State management |
| Tailwind CSS | Utility-first CSS (no third-party UI library) |
| TypeScript | Strict mode |
| VueUse (`@vueuse/nuxt`) | Utility composables (useEventListener, etc.) |
| Fetch API + AbortController | HTTP client with built-in 120s timeout |

## Features

- **Novel Management** — Create/edit/delete novels; filter by status & genre; paginated list with auto scroll-to-top
- **Chapter Editor** — Rich-text editing, AI generation, Ctrl+S shortcut, 2s debounced autosave, unsaved-changes warning on navigation
- **Character Management** — Character profiles, AI-generated descriptions, unsaved guard
- **Worldview Management** — Worldview + entity (faction/location/item) CRUD, save toast feedback
- **Storyboard & Video** — Quality tiers (draft/preview/final), single & batch shot generation, static/video mode toggle per shot
- **AI Model Management** — Providers, model config, task-level routing, MCP tool bindings
- **MCP Tool Management** — Register http/sse/stdio tools, connectivity test, bind/unbind with models
- **Global Toast Notifications** — success/error/warning/info variants with auto-dismiss and manual close
- **Confirm Dialog** — Two-step confirmation for destructive actions with danger/warning variants
- **Request Timeout Protection** — All API calls abort after 120 seconds via AbortController

## Getting Started

```bash
npm install
npm run dev       # Dev server at http://localhost:3000
npm run build     # Production build
npm run preview   # Preview production build
npm run lint      # ESLint
npm run typecheck # Type checking via vue-tsc
```

### Environment Variables

```env
NUXT_PUBLIC_API_BASE=http://localhost:8080/api/v1
NUXT_PUBLIC_WS_BASE=ws://localhost:8080
```

## Project Structure

```
inkframe-frontend/
├── assets/css/main.css          # Global styles (Tailwind + custom utilities)
├── components/
│   ├── AppToast.vue             # Global toast container (Teleport + TransitionGroup)
│   └── ConfirmDialog.vue        # Reusable confirm dialog (Teleport, danger variant)
├── composables/
│   ├── useApi.ts                # All API calls (AbortController 120s timeout)
│   ├── useToast.ts              # Global toast singleton (module-level ref)
│   ├── useUnsavedGuard.ts       # Before-leave unsaved warning (route guard + beforeunload)
│   ├── useAutosave.ts           # Debounced autosave (default 2s)
│   └── use*Api.ts               # Domain-specific API composables
├── layouts/
│   └── default.vue              # Default layout (includes <AppToast />)
├── pages/
│   ├── index.vue                # Dashboard
│   ├── novel/
│   │   ├── index.vue            # Novel list (filters + pagination)
│   │   ├── create.vue           # Create novel
│   │   ├── [id].vue             # Novel detail + chapter list + delete confirm
│   │   └── [id]/chapter/[chapterNo].vue  # Chapter editor (autosave + shortcuts)
│   ├── character/
│   │   ├── index.vue            # Character list
│   │   └── [id].vue             # Character detail (unsaved guard + save toast)
│   ├── worldview/
│   │   ├── index.vue            # Worldview list
│   │   └── [id].vue             # Worldview detail (save toast)
│   ├── video/
│   │   ├── index.vue            # Video list
│   │   └── [id].vue             # Storyboard (quality tier + shot generation)
│   └── model/
│       └── index.vue            # AI models + MCP tools management
├── stores/
│   ├── novel.ts                 # Novel state (includes deleteNovel)
│   ├── chapter.ts               # Chapter state
│   ├── character.ts             # Character state
│   ├── worldview.ts             # Worldview state
│   └── video.ts                 # Video & storyboard state
├── types/
│   └── index.ts                 # Global TypeScript types
├── nuxt.config.ts
└── tailwind.config.ts
```

## Page Routes

| Path | Page |
|------|------|
| `/` | Dashboard |
| `/novel` | Novel list (filters + pagination) |
| `/novel/create` | Create novel |
| `/novel/:id` | Novel detail + chapter management |
| `/novel/:id/chapter/:chapterNo` | Chapter editor |
| `/character` | Character list |
| `/character/:id` | Character detail |
| `/worldview` | Worldview list |
| `/worldview/:id` | Worldview detail |
| `/video` | Video list |
| `/video/:id` | Storyboard + shot generation |
| `/model` | AI model & MCP tool management |

## Key Composables

### useToast

Module-level singleton — no Pinia required:

```typescript
const toast = useToast()
toast.success('Chapter saved')
toast.error('Save failed: ' + e.message)
```

### useUnsavedGuard

Warns before route navigation and browser close/refresh:

```typescript
const isDirty = computed(() => content.value !== saved.value)
useUnsavedGuard(isDirty, 'You have unsaved changes. Leave anyway?')
```

### useAutosave

Debounced save triggered by reactive sources (default 2000ms):

```typescript
const { lastSavedAt, autoSaving } = useAutosave(
  () => store.save(data),
  [content, title],
  2000
)
```

## License

MIT License — see LICENSE file for details.

---

**InkFrame** — Empowering everyone to create their own story
