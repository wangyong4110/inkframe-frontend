# InkFrame Frontend

InkFrame 前端项目 - 基于 Vue 3 + Nuxt 3 的智能小说创作平台

## 技术栈

- **框架**: Nuxt 3
- **UI**: Vue 3 + Tailwind CSS
- **状态管理**: Pinia
- **HTTP 客户端**: Fetch API
- **样式**: Tailwind CSS + 自定义CSS

## 功能特性

- 📚 **小说管理**: 创建、编辑、删除小说项目
- ✏️ **章节编辑**: 富文本章节编辑器，支持AI生成
- 👥 **角色管理**: 角色创建、关系图谱
- 🌍 **世界观设定**: 完整的世界观管理
- 🎬 **视频生成**: 从小说生成分镜和视频
- 🤖 **多模型支持**: 支持多种AI模型切换

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建生产版本

```bash
npm run build
```

### 预览生产版本

```bash
npm run preview
```

## 项目结构

```
inkframe-frontend/
├── assets/
│   └── css/
│       └── main.css          # 全局样式
├── components/                 # Vue 组件
├── composables/              # 组合式函数
│   └── useApi.ts             # API 调用
├── layouts/                  # 布局
│   └── default.vue           # 默认布局
├── pages/                    # 页面
│   ├── index.vue             # 首页
│   └── novel/               # 小说模块
├── stores/                   # Pinia 状态管理
│   ├── novel.ts             # 小说状态
│   ├── chapter.ts          # 章节状态
│   ├── character.ts        # 角色状态
│   └── video.ts            # 视频状态
├── types/                    # TypeScript 类型
│   └── index.ts             # 类型定义
├── nuxt.config.ts           # Nuxt 配置
├── tailwind.config.ts      # Tailwind 配置
└── package.json
```

## 页面路由

| 路径 | 页面 |
|------|------|
| `/` | 首页仪表板 |
| `/novel` | 小说列表 |
| `/novel/create` | 创建小说 |
| `/novel/:id` | 小说详情 |
| `/novel/:id/chapter/:chapterNo` | 章节编辑器 |
| `/character` | 角色管理 |
| `/worldview` | 世界观管理 |
| `/video` | 视频管理 |
| `/model` | 模型管理 |

## 环境变量

```env
NUXT_PUBLIC_API_BASE=http://localhost:8080/api/v1
NUXT_PUBLIC_WS_BASE=ws://localhost:8080
```

## 开发指南

### 添加新页面

在 `pages/` 目录下创建 `.vue` 文件，Nuxt 会自动生成路由。

### 添加新组件

在 `components/` 目录下创建组件，支持自动导入。

### 使用 API

通过 `composables/useApi.ts` 提供的 API 函数调用后端接口：

```typescript
const api = useNovelApi()
const response = await api.getNovels()
```

### 状态管理

使用 Pinia stores 管理状态：

```typescript
const novelStore = useNovelStore()
novelStore.fetchNovels()
```

## 许可证

MIT License - 详见 LICENSE 文件

---

**InkFrame** - 让每个人都能创作属于自己的故事 📚✨
