# InkFrame Frontend

> **InkFrame** platform frontend — AI-powered novel-to-video creation platform built with Nuxt 3 + Vue 3

## Tech Stack

| Technology | Description |
|------------|-------------|
| Nuxt 3 | SSR framework, file-based routing |
| Vue 3 | Composition API + `<script setup>` |
| Pinia | State management |
| Tailwind CSS | Utility-first CSS (no third-party UI library) |
| TypeScript | Strict mode |
| VueUse (`@vueuse/nuxt`) | Utility composables |
| Fetch API + AbortController | HTTP client with built-in 120s timeout |

## Features

### Novel Creation
- Create novels: AI generation or import via file / URL / platform crawler (Qidian, Jjwxc, Zongheng)
- Novel detail: 7 tabs (Chapters / Characters / Items / Worldview / Plot Points / Scenes / Settings)
- Chapter editor: 5 modes (Outline / Writing / Characters / Scenes / Storyboard Script)
- AI deep review: diff-based suggestions, selective apply, issue ignore management
- Quality score display, chapter version history

### Characters & Worldview
- Character management: three-view / face close-up generation, voice preview, arc tracking
- Worldview management: entity CRUD (locations / organizations / artifacts / races / creatures)
- Scene anchors: AI extraction, reference image generation & locking, consistency score history
- Item management: chapter-level overrides

### Video Production
- Multi-tab video editor: Storyboard Script / Voice / SFX / BGM / Timeline
- Shot operations: image generation, motion effect generation, AI image refinement, insert / copy / delete shots
- Multi-segment voice: multiple segments per shot, insert / delete segments, batch generation
- SFX management: AI tag analysis, batch generation, enable/disable, manual add
- BGM: emotion analysis, Jamendo library search, volume control
- Multi-format export: JianyingPro draft / FCP / B-cut / ZIP / SRT / VTT / CSV / EDL / OTIO
- One-click publish to YouTube / Douyin / Bilibili
- Storyboard AI review (shared component logic with chapter review)

### Other Features
- Novel rewriting: AI-driven, source analysis + per-chapter rewrite + side-by-side comparison
- Asset library: upload / search / version management / share approval / batch crawl
- Community plaza: browse public novels/videos, likes/comments, leaderboard
- Prompt Builder: debug AI generation context
- AI model management: provider management, model config, task routing, MCP tool bindings
- Creative style configuration
- Multi-tenant management
- Platform account management (external publish account binding)

### UX
- Global toast notifications (success / error / warning / info)
- Two-step confirmation dialog for destructive actions
- Unsaved-changes warning on navigation (route guard + `beforeunload`)
- Chapter editor 2s debounced autosave, `Ctrl+S` shortcut save
- Image lightbox (click to zoom + AI refinement instructions)
- Task panel: real-time progress polling

## Quick Start

```bash
npm install
npm run dev       # Dev server at http://localhost:3000
npm run build     # Production build
npm run preview   # Preview production build
npm run lint      # ESLint
npm run typecheck # Type check via vue-tsc
```

### Environment Variables

```env
NUXT_PUBLIC_API_BASE=http://localhost:8080/api/v1
NUXT_PUBLIC_WS_BASE=ws://localhost:8080
```

---

## Deployment Guide

### 1. Local Development

**Prerequisites:** Node.js 18+ (LTS), npm 9+

```bash
git clone <repo-url>
cd inkframe-frontend
npm install

# Create .env file
cp .env.example .env
# Edit .env:
# NUXT_PUBLIC_API_BASE=http://localhost:8080/api/v1
# NUXT_PUBLIC_WS_BASE=ws://localhost:8080

npm run dev  # → http://localhost:3000
```

> The backend must be running on port 8080, or update `NUXT_PUBLIC_API_BASE` to point to the actual backend address.

---

### 2. Production Build (SSR Mode)

Nuxt 3 defaults to SSR (Node.js server-side rendering) mode:

```bash
npm run build
# Output directory: .output/

# Start the production server
node .output/server/index.mjs

# Or use PM2:
npm install -g pm2
pm2 start .output/server/index.mjs --name inkframe-frontend
pm2 save
pm2 startup
```

Production environment variables:

```bash
NUXT_PUBLIC_API_BASE=https://api.yourdomain.com/api/v1
NUXT_PUBLIC_WS_BASE=wss://api.yourdomain.com
PORT=3000
HOST=0.0.0.0
```

---

### 3. Static Generation (Recommended)

This is an SPA-style application that can be exported as static files:

```bash
npm run generate
# Output directory: .output/public/ (HTML/JS/CSS static files)
```

Deploy `.output/public/` to any static host (Nginx, CDN, Vercel, Netlify, etc.).

---

### 4. Docker Deployment

#### SSR Mode Dockerfile

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
ARG NUXT_PUBLIC_API_BASE=http://localhost:8080/api/v1
ARG NUXT_PUBLIC_WS_BASE=ws://localhost:8080
RUN npm run build

FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app/.output ./.output
ENV PORT=3000
ENV HOST=0.0.0.0
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
```

Build and run:

```bash
docker build \
  --build-arg NUXT_PUBLIC_API_BASE=https://api.yourdomain.com/api/v1 \
  --build-arg NUXT_PUBLIC_WS_BASE=wss://api.yourdomain.com \
  -t inkframe-frontend:latest .

docker run -d \
  --name inkframe-frontend \
  -p 3000:3000 \
  inkframe-frontend:latest
```

---

### 5. Docker Compose — Full Stack Deployment

```yaml
version: "3.9"

services:
  frontend:
    build:
      context: ./inkframe-frontend
      args:
        NUXT_PUBLIC_API_BASE: https://api.yourdomain.com/api/v1
        NUXT_PUBLIC_WS_BASE: wss://api.yourdomain.com
    ports:
      - "3000:3000"
    restart: unless-stopped
    depends_on:
      - backend

  backend:
    build: ./inkframe-backend
    ports:
      - "8080:8080"
    volumes:
      - ./inkframe-backend/config.yaml:/app/config.yaml
    depends_on:
      mysql:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: rootpassword
      MYSQL_DATABASE: inkframe
      MYSQL_USER: inkframe
      MYSQL_PASSWORD: inkframe123
    volumes:
      - mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - frontend
      - backend
    restart: unless-stopped

volumes:
  mysql_data:
  redis_data:
```

---

### 6. Nginx — Same-Domain Reverse Proxy (Recommended)

`nginx.conf` — routes `/api/` to the backend, everything else to the frontend:

```nginx
# HTTP → HTTPS redirect
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         HIGH:!aNULL:!MD5;

    client_max_body_size 100m;

    # API requests → backend
    location /api/ {
        proxy_pass         http://backend:8080;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    # Health check
    location /health {
        proxy_pass http://backend:8080;
        access_log off;
    }

    # Frontend
    location / {
        proxy_pass         http://frontend:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection "upgrade";
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_read_timeout 60s;
    }
}
```

> With this setup, set `NUXT_PUBLIC_API_BASE=https://yourdomain.com/api/v1` so the frontend and backend share the same domain, eliminating all CORS issues.

---

### 7. Static Files + Nginx

When deploying as static files:

```bash
npm run generate
# Upload .output/public/ to your server
```

Nginx config:

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    root /var/www/inkframe;
    index index.html;

    # SPA route fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API proxy
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Upload static files:

```bash
scp -r .output/public/* user@server:/var/www/inkframe/
```

---

### 8. Environment Variables Reference

| Variable | Default | Description |
|----------|---------|-------------|
| `NUXT_PUBLIC_API_BASE` | `http://localhost:8080/api/v1` | Backend API base URL (embedded in client bundle) |
| `NUXT_PUBLIC_WS_BASE` | `ws://localhost:8080` | WebSocket base URL |
| `PORT` | `3000` | SSR server listen port |
| `HOST` | `0.0.0.0` | SSR server listen address |
| `NODE_ENV` | `production` | Runtime environment |

> Variables prefixed with `NUXT_PUBLIC_` are inlined into the client bundle at build time and cannot be overridden at runtime (except for the server-side portion in SSR mode).

---

### 9. PM2 Process Management

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'inkframe-frontend',
    script: '.output/server/index.mjs',
    instances: 2,          // or 'max' to use all CPU cores
    exec_mode: 'cluster',
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      NUXT_PUBLIC_API_BASE: 'https://api.yourdomain.com/api/v1',
    }
  }]
}
```

```bash
pm2 start ecosystem.config.js --env production
pm2 save && pm2 startup
```

---

### 10. Upgrading

```bash
git pull
npm install
npm run build

# Restart SSR server (PM2)
pm2 restart inkframe-frontend

# Or with Docker Compose
docker compose pull frontend
docker compose up -d --no-deps --build frontend
```

---

### 11. Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| CORS errors on API requests | Frontend and backend on different domains | Deploy same-domain via Nginx reverse proxy, or configure backend CORS to allow frontend origin |
| 404 on page refresh | Nginx missing SPA fallback | Add `try_files $uri $uri/ /index.html` |
| Images/videos fail to load | OSS CDN base URL not configured | Set `storage.oss.base_url` in backend `config.yaml` |
| `@volar/typescript` error during build | Node.js 26 incompatible with vue-tsc | Use Node.js 20 LTS for building |
| SSR page blank | Backend unreachable from server side | Use service name (not `localhost`) inside containers; verify network connectivity |

---

## Project Structure

```
inkframe-frontend/
├── assets/css/main.css
├── components/
│   ├── AppToast.vue              # Global toast (Teleport + TransitionGroup)
│   ├── ConfirmDialog.vue         # Confirm dialog (danger/warning variants)
│   ├── ImageLightbox.vue         # Image lightbox (zoom + AI refinement)
│   ├── ImageUploadBox.vue        # Image upload component
│   ├── TaskPanel.vue             # Async task progress panel
│   ├── VideoEditor.vue           # Main video editor component
│   ├── ChapterReviewPanel.vue    # Chapter AI review panel (3 tabs)
│   ├── CharacterVoicePanel.vue   # Character voice preview
│   ├── StylePicker.vue           # Style picker
│   ├── PacingCurveChart.vue      # Pacing curve chart
│   ├── ShotsPaginationBar.vue    # Shot pagination bar
│   ├── AiProviderGuardModal.vue  # AI provider not-configured guard modal
│   ├── novel/
│   │   ├── ChaptersTab.vue       # Chapters list tab
│   │   ├── CharactersTab.vue     # Characters management tab
│   │   ├── ItemsTab.vue          # Items management tab
│   │   ├── WorldviewTab.vue      # Worldview tab
│   │   ├── PlotPointsTab.vue     # Plot points tab
│   │   ├── SceneAnchorsTab.vue   # Scene anchors tab
│   │   └── SettingsTab.vue       # Novel settings tab
│   ├── video/
│   │   ├── ScriptTab.vue         # Storyboard script tab
│   │   ├── VoiceTab.vue          # Voice tab (multi-segment)
│   │   ├── SFXTab.vue            # Sound effects tab
│   │   ├── BGMTab.vue            # BGM tab
│   │   ├── TimelineTab.vue       # Timeline tab
│   │   ├── StoryboardReviewPanel.vue # Storyboard review panel
│   │   ├── ExportPanel.vue       # Export panel (multi-format)
│   │   ├── PublishDrawer.vue     # External publish drawer
│   │   └── SynthesizePanel.vue   # Synthesis panel
│   └── rewrite/
│       ├── AnalysisCard.vue      # Rewrite analysis card
│       └── BibleCard.vue         # World Bible card
├── composables/
│   ├── useApi.ts                 # Base request util (AbortController 120s timeout)
│   ├── useToast.ts               # Global toast singleton
│   ├── useUnsavedGuard.ts        # Before-leave unsaved warning
│   ├── useAutosave.ts            # Debounced autosave (default 2s)
│   ├── useImageUpload.ts         # Image upload
│   ├── useImageLightbox.ts       # Lightbox state
│   ├── usePollWithBackoff.ts     # Exponential backoff polling
│   ├── useNovelApi.ts / useChapterApi.ts / useVideoApi.ts / ...
│   ├── useChapterReviewApi.ts    # Chapter review API
│   ├── useSceneAnchorApi.ts      # Scene anchor API
│   └── useAiProviderGuard.ts     # AI provider config guard
├── layouts/
│   └── default.vue               # Default layout (nav + AppToast)
├── pages/
│   ├── index.vue                 # Dashboard (trending videos/novels + recent)
│   ├── auth/login.vue / register.vue / oauth-callback.vue
│   ├── novel/
│   │   ├── index.vue             # Novel list (status/genre filter + pagination)
│   │   ├── create.vue            # Create novel (AI generate / import)
│   │   ├── [id]/index.vue        # Novel detail (7 tabs)
│   │   ├── [id]/chapter/[chapterNo].vue  # Chapter editor (5 modes)
│   │   └── [id]/prompt-builder.vue       # Prompt builder (debug)
│   ├── video/
│   │   ├── index.vue             # Video list
│   │   └── [id].vue              # Video editor
│   ├── character/[id].vue        # Character detail
│   ├── item/[id].vue             # Item detail
│   ├── worldview/[id].vue        # Worldview detail
│   ├── scene-anchor/[id].vue     # Scene anchor detail
│   ├── rewrite/
│   │   ├── index.vue             # Rewrite project list
│   │   ├── create.vue            # Create rewrite project
│   │   └── [id].vue              # Rewrite project detail
│   ├── assets/
│   │   ├── index.vue             # Asset library
│   │   ├── [id].vue              # Asset detail
│   │   └── crawl.vue             # Crawl tasks
│   ├── plaza/
│   │   ├── index.vue             # Community plaza (novels/videos tabs)
│   │   ├── novel/[id].vue        # Public novel detail
│   │   └── ranking.vue           # Leaderboard
│   ├── platform/
│   │   ├── index.vue             # Publish management
│   │   ├── accounts.vue          # External account binding
│   │   └── video/[id].vue        # Publish record detail
│   ├── model/index.vue           # AI model & provider management
│   ├── style/index.vue           # Creative style config
│   ├── tenant/index.vue          # Tenant management
│   ├── profile.vue               # User profile
│   └── manual.vue                # User manual page
├── stores/
│   ├── novel.ts / chapter.ts / character.ts
│   ├── video.ts                  # Video & storyboard state
│   ├── sceneAnchor.ts            # Scene anchor state
│   └── auth.ts                   # Auth state
├── types/index.ts                # Global TypeScript types
├── constants/status.ts           # Status label/color constants
├── nuxt.config.ts
└── tailwind.config.ts
```

## Page Routes

| Path | Page |
|------|------|
| `/` | Dashboard |
| `/novel` | Novel list |
| `/novel/create` | Create novel |
| `/novel/:id` | Novel detail (7 tabs) |
| `/novel/:id/chapter/:chapterNo` | Chapter editor |
| `/novel/:id/prompt-builder` | Prompt builder |
| `/video` | Video list |
| `/video/:id` | Video editor |
| `/character/:id` | Character detail |
| `/item/:id` | Item detail |
| `/worldview/:id` | Worldview detail |
| `/scene-anchor/:id` | Scene anchor detail |
| `/rewrite` | Rewrite project list |
| `/rewrite/create` | Create rewrite project |
| `/rewrite/:id` | Rewrite project detail |
| `/assets` | Asset library |
| `/assets/crawl` | Asset crawl tasks |
| `/plaza` | Community plaza |
| `/plaza/ranking` | Leaderboard |
| `/plaza/novel/:id` | Public novel detail |
| `/platform` | Publish management |
| `/platform/accounts` | External account binding |
| `/model` | AI model config (admin) |
| `/style` | Creative style config |
| `/tenant` | Tenant management |
| `/profile` | User profile |
| `/manual` | User manual |
| `/auth/login` | Login |
| `/auth/register` | Register |

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

### usePollWithBackoff

Exponential backoff polling for async task status:

```typescript
usePollWithBackoff(
  () => checkTaskStatus(taskId),
  (result) => result.status === 'completed',
)
```

### useAiProviderGuard

Checks whether an AI provider is configured before allowing AI operations; shows a setup guide modal if not:

```typescript
const { guardAiProvider } = useAiProviderGuard()
await guardAiProvider()  // throws if not configured, blocking the operation
```

## Development Guide

### Adding a New Page

Create a `.vue` file under `pages/` — Nuxt generates the route automatically.

### Adding an API Composable

Create `use<Domain>Api.ts` under `composables/`, calling `useApi().request()` internally.

### State Management

Use Pinia stores under `stores/` for shared cross-component state; use `ref` directly for local page state.

### Type Definitions

All API interface types go in `types/index.ts`. Status label/color constants go in `constants/status.ts`.

## License

MIT License — see LICENSE file for details.

---

**InkFrame** — Empowering everyone to create their own story
