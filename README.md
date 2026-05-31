# InkFrame Frontend

> **简影**平台前端 — 基于 Nuxt 3 + Vue 3 的 AI 小说转视频创作平台

## 技术栈

| 技术 | 说明 |
|------|------|
| Nuxt 3 | SSR 框架，文件路由 |
| Vue 3 | Composition API + `<script setup>` |
| Pinia | 状态管理 |
| Tailwind CSS | 原子化样式（无第三方 UI 库） |
| TypeScript | 严格模式 |
| VueUse (`@vueuse/nuxt`) | 工具函数 |
| Fetch API + AbortController | HTTP 请求，内置 120s 超时 |

## 功能特性

### 小说创作
- 创建小说：AI 生成或文件/URL/平台爬取导入（起点/晋江/纵横）
- 小说详情：7 个标签页（章节/角色/物品/世界观/剧情点/场景/设置）
- 章节编辑器：5 种模式（大纲/写作/角色/场景/分镜脚本）
- AI 深度审查：差异化建议展示，选择性应用，问题忽略管理
- 质量评分显示、章节版本历史

### 角色 & 世界观
- 角色管理：三视图/面部特写生成、配音预览、弧线查看
- 世界观管理：实体（地点/组织/神器/种族/生物）CRUD
- 场景锚点：AI 提取、参考图生成与锁定、一致性评分历史
- 物品管理：章节级别覆盖

### 视频制作
- 视频编辑器多标签：分镜脚本 / 配音 / 音效 / BGM / 时间线
- 分镜操作：图片生成、动效生成、图片精修、插入/复制/删除镜头
- 多段配音：每镜头多段落、插入/删除段落、批量生成
- 音效管理：AI 标签分析、批量生成、启用/禁用、手动添加
- BGM：情绪分析、Jamendo 搜索、音量调节
- 多格式导出：剪映草稿 / FCP / B 剪 / ZIP / SRT / VTT / CSV / EDL / OTIO
- 一键发布到 YouTube / 抖音 / Bilibili
- 分镜 AI 审查（与章节审查共用统一组件逻辑）

### 其他功能
- 小说改写：AI 驱动，原著分析 + 逐章改写 + 对比查看
- 素材库：上传/搜索/版本管理/分享审批/批量爬取
- 作品广场：公开小说/视频浏览、点赞/评论、排行榜
- 提示词构建器（Prompt Builder）：调试 AI 生成上下文
- AI 模型配置：提供商管理、模型管理、任务配置、MCP 工具绑定
- 创作风格配置
- 多租户管理
- 平台账号管理（外部发布账号绑定）

### 通用 UX
- 全局 Toast 通知（成功/错误/警告/信息）
- 危险操作二次确认对话框
- 离开前未保存警告（路由守卫 + `beforeunload`）
- 章节编辑器防抖自动保存（2s）、`Ctrl+S` 快捷保存
- 图片灯箱（点击放大 + AI 指令精修）
- 任务面板：实时进度轮询

## 快速开始

```bash
npm install
npm run dev       # 开发服务器 http://localhost:3000
npm run build     # 生产构建
npm run preview   # 预览生产版本
npm run lint      # ESLint
npm run typecheck # vue-tsc 类型检查
```

### 环境变量

```env
NUXT_PUBLIC_API_BASE=http://localhost:8080/api/v1
NUXT_PUBLIC_WS_BASE=ws://localhost:8080
```

---

## 部署指南

### 一、本地开发环境

**前置要求：** Node.js 18+（LTS），npm 9+

```bash
git clone <repo-url>
cd inkframe-frontend
npm install

# 创建 .env 文件
cp .env.example .env
# 编辑 .env：
# NUXT_PUBLIC_API_BASE=http://localhost:8080/api/v1
# NUXT_PUBLIC_WS_BASE=ws://localhost:8080

npm run dev  # → http://localhost:3000
```

> 注意：需确保后端服务运行在 8080 端口，或修改 `NUXT_PUBLIC_API_BASE` 指向实际后端地址。

---

### 二、生产构建（SSR 模式）

Nuxt 3 默认使用 SSR（Node.js 服务端渲染）模式：

```bash
npm run build
# 输出目录：.output/

# 启动生产服务器
node .output/server/index.mjs
# 或使用 PM2：
npm install -g pm2
pm2 start .output/server/index.mjs --name inkframe-frontend
pm2 save
pm2 startup
```

生产环境变量配置：

```bash
NUXT_PUBLIC_API_BASE=https://api.yourdomain.com/api/v1
NUXT_PUBLIC_WS_BASE=wss://api.yourdomain.com
PORT=3000
HOST=0.0.0.0
```

---

### 三、静态生成（纯前端模式，推荐）

本项目为 SPA 风格应用，可生成纯静态文件：

```bash
npm run generate
# 输出目录：.output/public/（包含 HTML/JS/CSS 静态文件）
```

将 `.output/public/` 目录部署到任意静态托管服务（Nginx、CDN、Vercel、Netlify 等）即可。

---

### 四、Docker 部署

#### SSR 模式 Dockerfile

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

构建与运行命令：

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

### 五、Docker Compose 前后端联合部署（完整栈）

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

### 六、Nginx 配置（前后端同域反代）

`nginx.conf` — 将 `/api/v1/` 转发到后端，其余请求转发到前端：

```nginx
# HTTP → HTTPS 重定向
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

    # API 请求转发到后端
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

    # 健康检查
    location /health {
        proxy_pass http://backend:8080;
        access_log off;
    }

    # 前端页面
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

> 使用此方案时，将 `NUXT_PUBLIC_API_BASE` 设为 `https://yourdomain.com/api/v1`，前后端共用同一域名，可彻底避免 CORS 问题。

---

### 七、静态文件 + Nginx（纯前端模式）

若以静态文件方式部署：

```bash
npm run generate
# 将 .output/public/ 上传到服务器
```

对应的 Nginx 配置：

```nginx
server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    root /var/www/inkframe;
    index index.html;

    # SPA 路由回退
    location / {
        try_files $uri $uri/ /index.html;
    }

    # API 代理
    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

上传静态文件：

```bash
scp -r .output/public/* user@server:/var/www/inkframe/
```

---

### 八、环境变量说明

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `NUXT_PUBLIC_API_BASE` | `http://localhost:8080/api/v1` | 后端 API 基础地址（客户端可见） |
| `NUXT_PUBLIC_WS_BASE` | `ws://localhost:8080` | WebSocket 基础地址 |
| `PORT` | `3000` | SSR 服务监听端口 |
| `HOST` | `0.0.0.0` | SSR 服务监听地址 |
| `NODE_ENV` | `production` | 运行环境 |

> `NUXT_PUBLIC_` 前缀的变量会在构建时内嵌到客户端代码中，构建后无法在运行时覆盖（SSR 模式下服务端部分除外）。

---

### 九、PM2 生产进程管理

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'inkframe-frontend',
    script: '.output/server/index.mjs',
    instances: 2,          // 或 'max'（按 CPU 核数自动设置）
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

### 十、升级部署

```bash
git pull
npm install
npm run build

# 重启 SSR 服务（PM2）
pm2 restart inkframe-frontend

# 或 Docker Compose 方式
docker compose pull frontend
docker compose up -d --no-deps --build frontend
```

---

### 十一、常见部署问题

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| API 请求报 CORS 错误 | 前后端域名不同 | 前后端同域部署（Nginx 反代），或后端 CORS 配置允许前端域名 |
| 页面刷新 404 | Nginx 未配置 SPA 路由回退 | 添加 `try_files $uri $uri/ /index.html` |
| 图片/视频无法加载 | OSS CDN 域名未配置 | 确认 `config.yaml` 中 `storage.oss.base_url` 已正确设置 |
| 构建时 `@volar/typescript` 报错 | Node.js 26 与 vue-tsc 兼容问题 | 改用 Node.js 20 LTS 进行构建 |
| SSR 页面空白 | API 地址在服务端不可达 | 确认服务端环境中后端地址可访问（容器内使用服务名而非 localhost） |

---

## 项目结构

```
inkframe-frontend/
├── assets/css/main.css
├── components/
│   ├── AppToast.vue              # 全局 Toast（Teleport + TransitionGroup）
│   ├── ConfirmDialog.vue         # 确认对话框（danger/warning 变体）
│   ├── ImageLightbox.vue         # 图片灯箱（放大 + AI 精修）
│   ├── ImageUploadBox.vue        # 图片上传组件
│   ├── TaskPanel.vue             # 异步任务进度面板
│   ├── VideoEditor.vue           # 视频编辑器主组件
│   ├── ChapterReviewPanel.vue    # 章节 AI 审查面板（3 标签）
│   ├── CharacterVoicePanel.vue   # 角色配音预览
│   ├── StylePicker.vue           # 风格选择器
│   ├── PacingCurveChart.vue      # 节奏曲线图
│   ├── ShotsPaginationBar.vue    # 分镜分页条
│   ├── AiProviderGuardModal.vue  # AI 提供商未配置拦截弹窗
│   ├── novel/
│   │   ├── ChaptersTab.vue       # 章节列表标签
│   │   ├── CharactersTab.vue     # 角色管理标签
│   │   ├── ItemsTab.vue          # 物品管理标签
│   │   ├── WorldviewTab.vue      # 世界观标签
│   │   ├── PlotPointsTab.vue     # 剧情点标签
│   │   ├── SceneAnchorsTab.vue   # 场景锚点标签
│   │   └── SettingsTab.vue       # 小说设置标签
│   ├── video/
│   │   ├── ScriptTab.vue         # 分镜脚本标签
│   │   ├── VoiceTab.vue          # 配音标签（多段配音）
│   │   ├── SFXTab.vue            # 音效标签
│   │   ├── BGMTab.vue            # BGM 标签
│   │   ├── TimelineTab.vue       # 时间线标签
│   │   ├── StoryboardReviewPanel.vue # 分镜审查面板
│   │   ├── ExportPanel.vue       # 导出面板（多格式）
│   │   ├── PublishDrawer.vue     # 外部发布抽屉
│   │   └── SynthesizePanel.vue   # 合成面板
│   └── rewrite/
│       ├── AnalysisCard.vue      # 改写分析卡
│       └── BibleCard.vue         # World Bible 卡
├── composables/
│   ├── useApi.ts                 # 基础请求（AbortController 120s 超时）
│   ├── useToast.ts               # 全局 Toast 单例
│   ├── useUnsavedGuard.ts        # 离开前未保存警告
│   ├── useAutosave.ts            # 防抖自动保存（默认 2s）
│   ├── useImageUpload.ts         # 图片上传
│   ├── useImageLightbox.ts       # 灯箱状态管理
│   ├── usePollWithBackoff.ts     # 指数退避轮询
│   ├── useNovelApi.ts / useChapterApi.ts / useVideoApi.ts / ...
│   ├── useChapterReviewApi.ts    # 章节审查 API
│   ├── useSceneAnchorApi.ts      # 场景锚点 API
│   └── useAiProviderGuard.ts     # AI 提供商配置前置检查
├── layouts/
│   └── default.vue               # 默认布局（含侧边导航 + AppToast）
├── pages/
│   ├── index.vue                 # 首页（热门视频/小说 + 最近创作）
│   ├── auth/login.vue / register.vue / oauth-callback.vue
│   ├── novel/
│   │   ├── index.vue             # 小说列表（状态/类型筛选 + 分页）
│   │   ├── create.vue            # 新建小说（AI生成 / 导入）
│   │   ├── [id]/index.vue        # 小说详情（7 标签）
│   │   ├── [id]/chapter/[chapterNo].vue  # 章节编辑器（5 模式）
│   │   └── [id]/prompt-builder.vue       # 提示词构建器（调试用）
│   ├── video/
│   │   ├── index.vue             # 视频列表
│   │   └── [id].vue              # 视频编辑器
│   ├── character/[id].vue        # 角色详情
│   ├── item/[id].vue             # 物品详情
│   ├── worldview/[id].vue        # 世界观详情
│   ├── scene-anchor/[id].vue     # 场景锚点详情
│   ├── rewrite/
│   │   ├── index.vue             # 改写项目列表
│   │   ├── create.vue            # 新建改写项目
│   │   └── [id].vue              # 改写项目详情
│   ├── assets/
│   │   ├── index.vue             # 素材库
│   │   ├── [id].vue              # 素材详情
│   │   └── crawl.vue             # 爬取任务
│   ├── plaza/
│   │   ├── index.vue             # 作品广场（小说/视频双标签）
│   │   ├── novel/[id].vue        # 公开小说详情
│   │   └── ranking.vue           # 排行榜
│   ├── platform/
│   │   ├── index.vue             # 发布管理
│   │   ├── accounts.vue          # 外部账号绑定
│   │   └── video/[id].vue        # 发布记录详情
│   ├── model/index.vue           # AI 模型 & 提供商管理
│   ├── style/index.vue           # 创作风格配置
│   ├── tenant/index.vue          # 租户管理
│   ├── profile.vue               # 个人资料
│   └── manual.vue                # 用户手册页
├── stores/
│   ├── novel.ts / chapter.ts / character.ts
│   ├── video.ts                  # 视频 & 分镜状态
│   ├── sceneAnchor.ts            # 场景锚点状态
│   └── auth.ts                   # 认证状态
├── types/index.ts                # 全局 TypeScript 类型
├── constants/status.ts           # 状态标签/颜色常量
├── nuxt.config.ts
└── tailwind.config.ts
```

## 页面路由

| 路径 | 页面 |
|------|------|
| `/` | 首页仪表板 |
| `/novel` | 小说列表 |
| `/novel/create` | 新建小说 |
| `/novel/:id` | 小说详情（7 标签） |
| `/novel/:id/chapter/:chapterNo` | 章节编辑器 |
| `/novel/:id/prompt-builder` | 提示词构建器 |
| `/video` | 视频列表 |
| `/video/:id` | 视频编辑器 |
| `/character/:id` | 角色详情 |
| `/item/:id` | 物品详情 |
| `/worldview/:id` | 世界观详情 |
| `/scene-anchor/:id` | 场景锚点详情 |
| `/rewrite` | 改写项目列表 |
| `/rewrite/create` | 新建改写项目 |
| `/rewrite/:id` | 改写项目详情 |
| `/assets` | 素材库 |
| `/assets/crawl` | 素材爬取任务 |
| `/plaza` | 作品广场 |
| `/plaza/ranking` | 排行榜 |
| `/plaza/novel/:id` | 公开小说详情 |
| `/platform` | 发布管理 |
| `/platform/accounts` | 外部账号绑定 |
| `/model` | AI 模型配置（管理员） |
| `/style` | 创作风格配置 |
| `/tenant` | 租户管理 |
| `/profile` | 个人资料 |
| `/manual` | 用户手册 |
| `/auth/login` | 登录 |
| `/auth/register` | 注册 |

## 核心 Composable

### useToast

模块级 ref 单例，无需 Pinia：

```typescript
const toast = useToast()
toast.success('章节已保存')
toast.error('保存失败：' + e.message)
```

### useUnsavedGuard

路由离开前 + 浏览器关闭警告：

```typescript
const isDirty = computed(() => content.value !== saved.value)
useUnsavedGuard(isDirty, '有未保存的修改，确认离开？')
```

### useAutosave

防抖自动保存（默认 2000ms）：

```typescript
const { lastSavedAt, autoSaving } = useAutosave(
  () => store.save(data),
  [content, title],
  2000
)
```

### usePollWithBackoff

指数退避轮询（用于任务状态轮询）：

```typescript
usePollWithBackoff(
  () => checkTaskStatus(taskId),
  (result) => result.status === 'completed',
)
```

### useAiProviderGuard

页面前置检查 AI 提供商是否已配置，未配置时弹出引导弹窗：

```typescript
const { guardAiProvider } = useAiProviderGuard()
await guardAiProvider()  // 未配置时 throw，阻止后续操作
```

## 开发指南

### 新建页面

在 `pages/` 下创建 `.vue` 文件，Nuxt 自动生成路由。

### 新建 API Composable

在 `composables/` 下创建 `use<Domain>Api.ts`，内部调用 `useApi().request()`。

### 状态管理

跨组件共享状态用 `stores/` 下的 Pinia store；页面局部状态直接用 `ref`。

### 类型定义

所有接口类型统一在 `types/index.ts` 中定义，状态常量（标签文本/颜色）放 `constants/status.ts`。

## 许可证

MIT License — 详见 LICENSE 文件

---

**简影 (InkFrame)** — 让每个人都能创作属于自己的故事
