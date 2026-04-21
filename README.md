# InkFrame Frontend

InkFrame 前端 — 基于 Nuxt 3 + Vue 3 的 AI 智能小说创作平台

## 技术栈

| 技术 | 说明 |
|------|------|
| Nuxt 3 | SSR 框架，文件路由 |
| Vue 3 | Composition API + `<script setup>` |
| Pinia | 状态管理 |
| Tailwind CSS | 原子化样式（无第三方 UI 库） |
| TypeScript | 严格模式 |
| VueUse (`@vueuse/nuxt`) | 工具函数（useEventListener 等）|
| Fetch API + AbortController | HTTP 请求，内置 120s 超时 |

## 功能特性

- **小说管理** — 创建/编辑/删除，按状态 & 类型筛选，分页自动滚顶
- **章节编辑器** — 富文本编辑，AI 生成，Ctrl+S 快捷保存，2s 防抖自动保存，离开前未保存警告
- **角色管理** — 角色设定、AI 生成描述，编辑离开保护
- **世界观管理** — 世界观 + 实体（势力/地点/物品）CRUD，保存 Toast 反馈
- **分镜 & 视频** — 视频质量档位（草稿/预览/正式），单镜头 & 批量生成，静态/视频模式切换
- **AI 模型管理** — 模型提供商、模型配置、任务级分配，MCP 工具绑定
- **MCP 工具管理** — 注册 http/sse/stdio 工具，连通性测试，与模型绑定/解绑
- **全局 Toast 通知** — 成功/错误/警告/信息四类，自动消失，可手动关闭
- **确认对话框** — 危险操作（删除等）需二次确认，支持 danger/warning 变体
- **请求超时保护** — 所有 API 请求 120 秒自动中止（AbortController）

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

## 项目结构

```
inkframe-frontend/
├── assets/css/main.css          # 全局样式（Tailwind + 自定义工具类）
├── components/
│   ├── AppToast.vue             # 全局 Toast 容器（Teleport + TransitionGroup）
│   └── ConfirmDialog.vue        # 通用确认对话框（Teleport，支持 danger 变体）
├── composables/
│   ├── useApi.ts                # 所有 API 调用（AbortController 120s 超时）
│   ├── useToast.ts              # 全局 Toast 单例（模块级 ref，无需 Pinia）
│   ├── useUnsavedGuard.ts       # 离开前未保存警告（路由守卫 + beforeunload）
│   ├── useAutosave.ts           # 防抖自动保存（默认 2s）
│   └── use*Api.ts               # 各领域 API composable
├── layouts/
│   └── default.vue              # 默认布局（含 <AppToast />）
├── pages/
│   ├── index.vue                # 首页仪表板
│   ├── novel/
│   │   ├── index.vue            # 小说列表（筛选 + 分页）
│   │   ├── create.vue           # 新建小说
│   │   ├── [id].vue             # 小说详情 + 章节列表 + 删除确认
│   │   └── [id]/chapter/[chapterNo].vue  # 章节编辑器（自动保存 + 快捷键）
│   ├── character/
│   │   ├── index.vue            # 角色列表
│   │   └── [id].vue             # 角色详情（离开保护 + 保存 Toast）
│   ├── worldview/
│   │   ├── index.vue            # 世界观列表
│   │   └── [id].vue             # 世界观详情（保存 Toast）
│   ├── video/
│   │   ├── index.vue            # 视频列表
│   │   └── [id].vue             # 分镜详情（质量档位 + 镜头生成）
│   └── model/
│       └── index.vue            # 模型 + MCP 工具管理
├── stores/
│   ├── novel.ts                 # 小说状态（含 deleteNovel）
│   ├── chapter.ts               # 章节状态
│   ├── character.ts             # 角色状态
│   ├── worldview.ts             # 世界观状态
│   └── video.ts                 # 视频 & 分镜状态
├── types/
│   └── index.ts                 # 全局 TypeScript 类型定义
├── nuxt.config.ts
└── tailwind.config.ts
```

## 页面路由

| 路径 | 页面 |
|------|------|
| `/` | 首页仪表板 |
| `/novel` | 小说列表（筛选 + 分页） |
| `/novel/create` | 新建小说 |
| `/novel/:id` | 小说详情 + 章节管理 |
| `/novel/:id/chapter/:chapterNo` | 章节编辑器 |
| `/character` | 角色列表 |
| `/character/:id` | 角色详情 |
| `/worldview` | 世界观列表 |
| `/worldview/:id` | 世界观详情 |
| `/video` | 视频列表 |
| `/video/:id` | 分镜脚本 + 镜头生成 |
| `/model` | AI 模型 & MCP 工具管理 |

## 核心 Composable

### useToast

全局 Toast 通知，模块级 ref 单例：

```typescript
const toast = useToast()
toast.success('章节已保存')
toast.error('保存失败：' + e.message)
toast.warning('...')
toast.info('...')
```

### useUnsavedGuard

路由离开前警告，同时处理浏览器刷新/关闭：

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

### useApi（AbortController）

所有请求内置 120s 超时，超时后抛出 AbortError：

```typescript
const api = useNovelApi()
const novels = await api.getNovels()
```

## 开发指南

### 新建页面

在 `pages/` 下创建 `.vue` 文件，Nuxt 自动生成路由。

### 新建 API 方法

在 `composables/useApi.ts` 中对应领域的 composable 函数内添加方法。

### 状态管理

所有跨组件状态放在 `stores/` 的 Pinia store 中；页面局部状态直接用 `ref`。

## 许可证

MIT License — 详见 LICENSE 文件

---

**InkFrame** — 让每个人都能创作属于自己的故事
