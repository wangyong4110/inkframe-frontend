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
