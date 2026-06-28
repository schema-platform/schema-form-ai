# @schema-form/ai-app

AI 智能助手 -- 对话式 Schema 生成、流程编排、版本管理。

## 项目简介

Schema Form Platform 的 AI 交互层，通过自然语言对话驱动表单 Schema 和流程图的生成。支持多 Agent 协作、RAG 知识库检索、WebSocket 流式响应，可独立使用或通过 qiankun 微前端嵌入 Editor/Flow 侧边栏。

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Vue 3.5 + TypeScript 5.7 |
| UI | Element Plus 2.9 |
| 通信 | WebSocket (Socket.IO) + REST API |
| 样式 | CSS Modules |
| 微前端 | qiankun |
| 构建 | Vite 6 |

## 端口配置

| 环境 | 端口 |
|---|---|
| 开发 | 5300 |

## 主要功能

### 多 Agent 对话

| Agent | 用途 | 生成内容 |
|---|---|---|
| Auto | 自动路由 | 根据意图自动选择 Editor/Flow Agent |
| Editor | 表单设计 | 生成表单 Schema JSON |
| Flow | 流程设计 | 生成 BPMN 流程图 |

### 对话面板

- Markdown 渲染 + 代码高亮
- WebSocket 流式输出
- 多模态输入（图片、PDF、Word、TXT）
- @ 提及 + RAG 检索引用
- 任务链进度展示
- 嵌入式 Schema 预览卡片

### 对话管理

- 对话列表（创建/切换/删除）
- 搜索过滤 + Agent 筛选
- 对话标题自动生成/手动编辑

### Schema 预览

- AI 生成 Schema 实时渲染
- 版本历史浏览 + JSON Diff 对比
- 版本回滚

### RAG 检索

- 语义搜索相关 Schema
- 上下文注入对话

### 图片上传

- 上传设计稿 AI 生成对应 Schema

## 常用命令

```bash
pnpm dev:ai               # 启动开发服务器
pnpm build:ai             # 构建
pnpm --filter @schema-form/ai-app test   # 运行测试
```
