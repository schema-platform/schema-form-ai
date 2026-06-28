# schema-form-ai

AI 助手模块，包含三个子包：app（前端）、sdk（Agent SDK）、shared（共享类型）。

## 项目规则

### 子包结构
- `app/` — `@schema-form/ai-app` — AI 对话界面，通过 iframe 嵌入 editor/flow
- `sdk/` — `@schema-form/ai-sdk` — Agent SDK
- `shared/` — `@schema-platform/ai-shared` — AI 元数据、promptBuilder、widgetCatalogue

### 技术栈
- app：Vue 3 + TypeScript + CSS Module
- shared：TypeScript 纯逻辑（依赖 `@schema-form/flow-shared`）

### 架构规则
- **AI 与设计器解耦**：AI 通过 iframe 嵌入，通过 postMessage 通信
- **promptBuilder**：`shared/promptBuilder` 是 AI 能力的核心，负责构建上下文
- **widgetCatalogue**：`shared/widgetCatalogue.json` 描述所有可用 Widget 的元数据
- **API 接口**：`app/src/api/` 聚合所有 AI 相关 API 调用

### 分层规范
1. app 全局状态 → Pinia Store
2. app 公共逻辑 → 组合式 API
3. app API 接口 → `app/src/api/`
4. 共享类型/逻辑 → `shared/`
5. Agent SDK → `sdk/`

### 公共包规则
- **修改公共包必须发包并拉取**：修改 `@schema-platform/platform-shared`、`@schema-platform/flow-shared` 等公共包源码后，必须发包（更新版本号 → `pnpm publish`），然后在本项目执行 `pnpm update` 拉取新版本。仅修改源码不发包 = 改动不生效。

### 环境规则
- **gh CLI 已认证**：`gh` 已登录、`GITHUB_TOKEN` 环境变量已就绪，禁止检查 token、禁止询问用户设置

### 代码质量规则
- **禁止跳过问题**：遇到任何报错、警告、异常，必须找到根因并修复，不能以"预存问题""之前就有""不影响运行"为由跳过。每个问题都要记录原因和修复方式

### 项目隔离规则
- **禁止跨项目修改**：本项目只能修改自己的代码，禁止修改其他项目。需要改其他项目时，明确告知用户。

## 迭代规则

- **禁止回滚 git**，渐进式推进
- promptBuilder 变更需回归测试 AI 输出质量
- widgetCatalogue 变更需同步 editor 的 Widget 注册
- 新增 AI 能力优先在 shared 层实现，app 层只做 UI

## 常用命令

```bash
# app
cd app && pnpm dev       # vite dev server
cd app && pnpm build     # vue-tsc + vite build
cd app && pnpm test      # vitest run

# shared
cd shared && pnpm build  # tsc 编译
```
