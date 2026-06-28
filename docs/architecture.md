# AI 架构文档

> packages/ai 项目的 Agent、MCP、Tool 架构说明

**文档版本**：
- v1 (2026-06-22) — 基础架构：Agent、Tool、MCP、事件协议
- v2 (2026-06-22) — 新增需求分析、任务规划、思考推理、质量检查
- v2.1 (2026-06-22) — 需求确认卡片组件、工具调用支持

---

## 一、整体架构

### 1.1 架构演进

```
┌─────────────────────────────────────────────────────────────────┐
│                        v1 架构（基础）                          │
├─────────────────────────────────────────────────────────────────┤
│  START ──► router ──► agent ──► allTools ──► afterTools ──► END │
└─────────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                        v2 架构（增强）                          │
├─────────────────────────────────────────────────────────────────┤
│  START ──► router ──► analyzer ──► confirm ──► planner ──►     │
│            thinker ──► taskChain ──► agent ──► tools ──►        │
│            qualityCheck ──► summarizer ──► END                  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 分层架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI 应用层                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │   App    │  │   SDK    │  │  Shared  │  │  Server  │       │
│  │ (前端)   │  │ (客户端) │  │ (共享)   │  │ (服务端) │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      LangGraph 层                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Router  │  │ Analyzer │  │ Planner  │  │ Thinker  │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │  Editor  │  │   Flow   │  │   Page   │  │ General  │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      工具层 (Tools)                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Schema   │  │   Flow   │  │   RAG    │  │ Widget   │       │
│  │  Tools   │  │  Tools   │  │  Tools   │  │  Tools   │       │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘       │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      MCP 层 (可选)                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                      │
│  │  Schema  │  │   Flow   │  │  Widget  │                      │
│  │  Server  │  │  Server  │  │  Server  │                      │
│  └──────────┘  └──────────┘  └──────────┘                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、v1 架构（基础）

### 2.1 Agent 类型

| Agent | 职责 | System Prompt 来源 |
|-------|------|-------------------|
| **Router** | 分析用户意图，路由到正确的 Agent | 固定 prompt |
| **Editor** | 生成/编辑表单 Schema | `@schema-platform/ai-shared/promptBuilder` |
| **Flow** | 生成/编辑流程 | `@schema-platform/ai-shared/promptBuilder` |
| **Page** | 生成页面布局 | `@schema-platform/ai-shared/promptBuilder` |
| **General** | 通用问答，不涉及具体业务 | 固定 prompt |

### 2.2 v1 Graph 结构

```
START ──► router ──┬──► editor/flow/page ──► allTools ──┐
                   │                                    │
                   ├──► taskChain ──► agent ──► allTools ┤
                   │                                    │
                   └──► general ──► END                  │
                                                        ▼
                                     afterTools ──► router
                                          │
                                          ▼
                                     summarizer ──► END
```

### 2.3 循环层级

| 循环 | 路径 | 作用 |
|------|------|------|
| **工具调用循环** | `agent → allTools → afterTools → router → agent` | Agent 调用工具后继续生成 |
| **任务链循环** | `taskChain → agent → allTools → afterTools → taskChain` | 多步骤任务依次执行 |
| **协作循环** | `afterTools → taskChain` (协作请求) | Agent 间协作 |

### 2.4 v1 问题分析

| 问题 | 表现 | 影响 |
|------|------|------|
| **Router 只做路由** | 关键词匹配 + 简单 LLM 分析 | 无法理解复杂需求 |
| **缺少需求分析** | 用户说"创建审批流程"直接开始生成 | 生成结果不符合预期 |
| **任务链是静态的** | Router 阶段确定，无法动态调整 | 复杂任务拆解不准确 |
| **缺少确认环节** | 直接执行，无用户确认 | 错误累积，需要重新对话 |
| **无思考推理** | 跳过分析直接执行 | 无法评估任务复杂度 |

---

## 三、v2 架构（增强）

### 3.1 核心理念

```
┌─────────────────────────────────────────────────────────────────┐
│                        v2 架构理念                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│   用户需求 ──► 需求分析 ──► 需求确认 ──► 任务规划 ──► 执行     │
│                    │            │            │          │       │
│                    ▼            ▼            ▼          ▼       │
│               理解意图      HITL 确认    动态拆解    工具调用   │
│               提取实体      补充细节     生成链      生成结果   │
│               评估复杂度    验证需求     优先排序     质量检查   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 新增节点

| 节点 | 职责 | 输入 | 输出 | 状态 |
|------|------|------|------|------|
| **requirementAnalyzer** | 需求分析 | 用户消息 | 需求结构化数据 | ✅ 已实现 |
| **requirementConfirm** | 需求确认 | 需求数据 | 用户确认/补充 | ✅ 已实现（前端） |
| **taskPlanner** | 任务规划 | 确认后的需求 | 动态任务链 | ✅ 已实现 |
| **thinker** | 思考推理 | 任务上下文 | 执行策略 | 📋 待实现 |
| **qualityCheck** | 质量检查 | 执行结果 | 质量报告 | 📋 待实现 |

### 3.3 v2 Graph 结构

**重要**：所有模式（包括显式模式）都会进行需求分析。显式模式会将用户选择的 Agent 作为上下文传入 LLM，帮助更好地理解需求。

```
START ──► router
              │
              ▼
    ┌─────────────────┐
    │   requirement   │
    │    Analyzer     │ ◄─── 分析需求，提取关键信息（所有模式）
    └─────────────────┘
              │
              ▼
    ┌─────────────────┐
    │   requirement   │ ◄─── HITL：等待用户确认（可选）
    │     Confirm     │
    └─────────────────┘
              │
              ▼
    ┌─────────────────┐
    │   taskPlanner   │ ◄─── 生成动态任务链
    └─────────────────┘
              │
              ▼
    ┌─────────────────┐
    │     thinker     │ ◄─── 思考执行策略（可选）
    └─────────────────┘
              │
              ▼
    ┌─────────────────┐
    │  taskChain      │ ◄─── 任务链执行
    └─────────────────┘
              │
              ▼
    ┌─────────────────┐
    │  agent          │ ◄─── Agent 执行
    │ (editor/flow/   │
    │  page/general)  │
    └─────────────────┘
              │
              ▼
    ┌─────────────────┐
    │   allTools      │ ◄─── 工具调用
    └─────────────────┘
              │
              ▼
    ┌─────────────────┐
    │   afterTools    │ ◄─── 后处理
    └─────────────────┘
              │
              ▼
    ┌─────────────────┐
    │   qualityCheck  │ ◄─── 质量检查（可选）
    └─────────────────┘
              │
              ▼
         summarizer ──► END
```

---

## 四、节点详细设计

### 4.1 RequirementAnalyzer（需求分析器）✅ 已实现

**职责**：深度理解用户需求，提取结构化信息

**实现文件**：`packages/server/src/ai/graph/requirementAnalyzer.ts`

**输出接口**：
```typescript
interface RequirementAnalysis {
  // 意图分类
  intent: 'create' | 'modify' | 'query' | 'help'

  // 需求类型
  type: 'form' | 'flow' | 'page' | 'mixed' | 'general'

  // 复杂度评估
  complexity: 'simple' | 'medium' | 'complex'

  // 提取的实体
  entities: {
    forms?: Array<{
      name: string
      purpose: string
      fields: Array<{ name: string; type: string; required: boolean }>
    }>
    flows?: Array<{
      name: string
      nodes: Array<{ type: string; name: string; assignee?: string }>
      conditions?: Array<{ from: string; to: string; condition: string }>
    }>
    pages?: Array<{
      name: string
      type: 'list' | 'detail' | 'dashboard'
      components: string[]
    }>
  }

  // 需求完整性
  completeness: {
    score: number              // 0-100
    missing: string[]          // 缺失的信息
    assumptions: string[]      // AI 做出的假设
  }

  // 确认问题
  confirmQuestions: Array<{
    id: string
    question: string
    options?: string[]
    required: boolean
  }>

  // 建议的任务链
  suggestedChain: Array<{
    agent: 'editor' | 'flow' | 'page'
    description: string
    priority: number
    dependencies: string[]
  }>
}
```

**路由逻辑**：
- 完整性 >= 80 且复杂度为 simple → 直接进入 taskPlanner
- 完整性 < 80 或复杂度为 medium/complex → 进入 requirementConfirm

---

### 4.2 RequirementConfirm（需求确认器）📋 待实现

**职责**：与用户确认需求，支持 HITL

**流程**：
```
需求分析结果
    │
    ▼
┌─────────────────┐
│ 是否需要确认？  │
└─────────────────┘
    │
    ├── 否 ──► 直接进入 taskPlanner
    │
    └── 是 ──► 发送确认请求给用户
                  │
                  ▼
              等待用户响应
                  │
                  ├── 确认 ──► 进入 taskPlanner
                  │
                  └── 补充 ──► 重新分析
```

**确认消息格式**：
```typescript
interface ConfirmRequest {
  type: 'requirement_confirm'
  analysis: RequirementAnalysis
  questions: Array<{
    id: string
    question: string
    options?: string[]
    required: boolean
  }>
  preview: {
    summary: string
    estimatedSteps: number
    estimatedTime: string
  }
}
```

**实现状态**：✅ 已实现（前端组件）

**前端实现**：
- `RequirementConfirmCard.vue` — 需求确认卡片组件
- 展示需求分析结果（意图、类型、复杂度、完整性）
- 显示缺失信息和 AI 假设
- 展示执行计划
- 支持用户回答确认问题
- 提供"确认"和"跳过"按钮

**事件流**：
```
requirement_analysis_complete 事件
    │
    ▼
创建 requirement_confirm 卡片
    │
    ▼
RequirementConfirmCard 渲染
    │
    ├── 用户点击"确认"
    │   └── emit('requirement-confirm', answers)
    │       └── store.confirmRequirement(answers)
    │           └── 发送 requirement_confirm_response 事件
    │
    └── 用户点击"跳过"
        └── emit('requirement-skip')
            └── store.skipRequirement()
                └── 发送 requirement_confirm_response 事件（skipped: true）
```

---

### 4.3 TaskPlanner（任务规划器）✅ 已实现

**职责**：根据确认后的需求生成动态任务链

**实现文件**：`packages/server/src/ai/graph/taskPlanner.ts`

**输出接口**：
```typescript
interface TaskPlan {
  // 任务链
  chain: Array<{
    id: string
    agent: 'editor' | 'flow' | 'page'
    description: string
    inputs: Record<string, unknown>
    outputs: Record<string, unknown>
    dependencies: string[]
    priority: number
    status: 'pending' | 'running' | 'done' | 'error'
  }>

  // 执行策略
  strategy: {
    mode: 'sequential' | 'parallel' | 'mixed'
    retryPolicy: 'none' | 'simple' | 'exponential'
    timeout: number
  }

  // 上下文传递
  contextFlow: Array<{
    from: string
    to: string
    data: string[]
  }>
}
```

---

### 4.4 Thinker（思考推理器）📋 待实现

**职责**：在执行前进行推理，评估和调整执行策略

**触发条件**：
- 任务开始前
- 工具调用失败后
- 检测到需求变化时

**输出接口**：
```typescript
interface ThinkerOutput {
  // 执行策略调整
  adjustments: {
    skipSteps?: string[]
    addSteps?: TaskStep[]
    reorderSteps?: string[]
    changeAgent?: { stepId: string; newAgent: string }
  }

  // 风险评估
  risks: Array<{
    type: 'complexity' | 'ambiguity' | 'dependency'
    description: string
    mitigation: string
  }>

  // 执行建议
  suggestions: Array<{
    type: 'optimize' | 'simplify' | 'split'
    description: string
    impact: 'low' | 'medium' | 'high'
  }>
}
```

---

### 4.5 QualityCheck（质量检查器）📋 待实现

**职责**：检查执行结果的质量

**输出接口**：
```typescript
interface QualityCheckResult {
  // 结构检查
  structure: {
    valid: boolean
    errors: string[]
    warnings: string[]
  }

  // 完整性检查
  completeness: {
    score: number
    missing: string[]
  }

  // 一致性检查
  consistency: {
    score: number
    conflicts: string[]
  }

  // 建议
  suggestions: Array<{
    type: 'fix' | 'improve' | 'add'
    description: string
    priority: 'low' | 'medium' | 'high'
  }>

  // 是否需要重新执行
  needsRetry: boolean
  retryReason?: string
}
```

---

## 五、Tool（工具）

### 5.1 工具分类

| 分类 | 工具名 | 功能 |
|------|--------|------|
| **Schema** | `search_schemas` | 搜索表单 Schema 列表 |
| | `get_schema_detail` | 获取 Schema 完整信息 |
| | `validate_schema` | 验证 Schema 结构 |
| | `update_schema` | 更新 Schema |
| | `search_published_schemas` | 搜索已发布版本 |
| **Flow** | `search_flows` | 搜索流程列表 |
| | `get_flow_detail` | 获取流程详情 |
| | `validate_flow` | 验证流程结构 |
| | `update_flow` | 更新流程 |
| | `save_and_bind_schema` | 保存并绑定 Schema 到流程节点 |
| **Widget** | `get_widget_catalogue` | 查询组件目录 |
| | `query_widgets` | 查询组件 |
| **RAG** | `rag_search` | 智能匹配 |
| | `rag_index` | RAG 索引 |
| **协作** | `request_collaboration` | 请求其他 Agent 协作 |

### 5.2 统一工具集

`packages/server/src/ai/tools/allTools.ts` 合并了所有工具：

```typescript
export const allTools = [
  // Schema 工具
  searchSchemasTool,
  getSchemaDetailTool,
  validateSchemaTool,
  updateSchemaTool,

  // Flow 工具
  searchFlowsTool,
  getFlowDetailTool,
  validateFlowTool,
  updateFlowTool,

  // Widget 工具
  ...widgetTools,

  // RAG 工具
  ...ragTools,

  // 协作工具
  requestCollaborationTool,
]
```

---

## 六、MCP（Model Context Protocol）

### 6.1 MCP Server 实现

`packages/server/src/ai/mcp/` 目录下有 3 个 MCP Server：

| Server | 功能 | 工具前缀 |
|--------|------|----------|
| `schemaServer.ts` | Schema 相关工具 | `schema__` |
| `flowServer.ts` | Flow 相关工具 | `flow__` |
| `widgetServer.ts` | Widget 相关工具 | `widget__` |

### 6.2 MCP 与 LangGraph 工具的关系

```
┌─────────────────────────────────────────────────────────┐
│                    共享业务逻辑层                        │
│              (toolHandlers.ts)                          │
└─────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  LangGraph 工具 │  │   MCP Server    │  │   HTTP API      │
│  (直接调用)     │  │  (MCP 协议)     │  │   (REST)        │
└─────────────────┘  └─────────────────┘  └─────────────────┘
```

---

## 七、数据流

### 7.1 v2 数据流（当前实现）

```
用户输入
    │
    ▼
AiChatView.vue
    │
    ▼
useAiStore.sendMessage()
    │
    ▼
useStreamStore.executeStream()
    │
    ▼
emitChatSend() ── Socket.IO ──► Server
    │
    ▼
chatStreamHandler.ts
    │
    ▼
graph.streamEvents()
    │
    ├── Router ──► 路由决策
    │
    ├── RequirementAnalyzer ──► 分析需求（所有模式）
    │       │
    │       └── 发送 requirement_analysis_complete 事件
    │
    ├── TaskPlanner ──► 生成任务链
    │       │
    │       └── 发送 task_plan_complete 事件
    │
    ├── TaskChain ──► 执行任务
    │
    ├── Agent (editor/flow/page/general) ──► 调用 LLM
    │       │
    │       └── 工具调用 ──► ToolNode ──► toolHandlers.ts
    │
    └── 流式事件 ──► sendEvent() ──► Socket.IO ──► Client
```

### 7.2 前端事件处理

```
onChatEvent()  (Socket.IO)
    │
    ▼
handleStreamEvent()
    │
    ├── text_delta ──► 更新消息内容
    ├── thinking_delta ──► 更新思考过程
    ├── tool_call_start ──► 显示工具调用
    ├── tool_call_end ──► 显示工具结果
    ├── schema_complete ──► 显示 Schema 预览
    ├── flow_complete ──► 显示 Flow 预览
    │
    ├── requirement_analysis_start ──► 显示"正在分析需求"
    ├── requirement_analysis_complete ──► 显示需求分析结果
    ├── task_plan_start ──► 显示"正在规划任务"
    ├── task_plan_complete ──► 显示任务计划
    │
    └── done ──► 完成
```

---

## 八、事件协议

### 8.1 基础事件类型

```typescript
type AgentEventType =
  // 文本流
  | 'text_delta'
  | 'thinking_delta'
  // Schema 生成
  | 'schema_start'
  | 'schema_progress'
  | 'schema_complete'
  | 'schema_diff'
  // Flow 生成
  | 'flow_start'
  | 'flow_progress'
  | 'flow_complete'
  | 'flow_diff'
  // 工具调用
  | 'tool_call_start'
  | 'tool_call_end'
  | 'tool_error'
  // Agent 协作
  | 'agent_switch'
  | 'agent_collaboration'
  // 任务链
  | 'chain_start'
  | 'chain_step'
  | 'chain_complete'
  // 人工介入
  | 'interrupt'
  | 'resume'
  // 状态
  | 'done'
  | 'error'
  // v2: 需求分析
  | 'requirement_analysis_start'
  | 'requirement_analysis_complete'
  | 'requirement_confirm_request'
  | 'requirement_confirm_response'
  // v2: 任务规划
  | 'task_plan_start'
  | 'task_plan_complete'
  // v2: 思考推理
  | 'thinker_start'
  | 'thinker_complete'
  // v2: 质量检查
  | 'quality_check_start'
  | 'quality_check_complete'
```

### 8.2 v2 事件示例

**需求分析完成事件**：
```json
{
  "type": "requirement_analysis_complete",
  "analysis": {
    "intent": "create",
    "type": "mixed",
    "complexity": "complex",
    "entities": {
      "forms": [{ "name": "订单表单", "fields": [...] }],
      "flows": [{ "name": "审批流程", "nodes": [...] }]
    },
    "completeness": {
      "score": 60,
      "missing": ["审批人", "列表列配置"],
      "assumptions": ["使用默认样式"]
    },
    "confirmQuestions": [
      {
        "id": "q1",
        "question": "审批流程有几个节点？",
        "options": ["2个", "3个", "4个"],
        "required": true
      }
    ]
  },
  "needsConfirmation": true
}
```

**任务规划完成事件**：
```json
{
  "type": "task_plan_complete",
  "plan": {
    "chain": [
      {
        "id": "step-1",
        "agent": "editor",
        "description": "生成订单录入表单",
        "dependencies": [],
        "priority": 1
      },
      {
        "id": "step-2",
        "agent": "flow",
        "description": "生成订单审批流程",
        "dependencies": ["step-1"],
        "priority": 2
      }
    ],
    "strategy": {
      "mode": "sequential",
      "retryPolicy": "simple",
      "timeout": 300000
    }
  }
}
```

---

## 九、完整流程示例

### 9.1 示例：创建订单管理系统

**用户输入**：
```
创建一个订单管理系统，包含订单录入、审批流程和订单列表
```

**流程**：

```
1. Router（路由决策）
   │
   ▼
   检测到自动模式 → 进入 requirementAnalyzer

2. RequirementAnalyzer（需求分析）
   │
   ▼
   分析结果：
   - 意图：create
   - 类型：mixed（表单 + 流程 + 页面）
   - 复杂度：complex
   - 实体：
     - 表单：订单录入表单（订单号、客户、金额、日期）
     - 流程：订单审批流程（提交 → 审批 → 完成）
     - 页面：订单列表页（搜索、列表、详情）
   - 完整性：60%（缺少字段细节、审批人、列表列配置）
   - 确认问题：
     1. 订单表单需要哪些字段？
     2. 审批流程有几个节点？审批人是谁？
     3. 订单列表需要显示哪些列？

3. TaskPlanner（任务规划）
   │
   ▼
   生成任务链：
   Step 1: editor - 生成订单录入表单
   Step 2: flow - 生成订单审批流程（绑定表单）
   Step 3: page - 生成订单列表页面

4. 执行任务链
   │
   ▼
   Step 1: editor 生成表单 → allTools 执行 → 获得 schemaId
   Step 2: flow 生成流程 → allTools 执行 → 绑定 schemaId
   Step 3: page 生成列表 → allTools 执行 → 关联流程

5. Summarizer（总结）
   │
   ▼
   输出：已创建订单管理系统，包含：
   - 订单录入表单（5 个字段）
   - 订单审批流程（4 个节点）
   - 订单列表页面（5 列）
```

---

## 十、State 扩展

### 10.1 v2 新增 State 字段

```typescript
const AgentStateAnnotation = Annotation.Root({
  // ... 原有字段

  // 需求分析 (v2)
  requirement: Annotation({
    analysis: RequirementAnalysis | null
    userConfirmations: Record<string, string>
    needsConfirmation: boolean
    status: 'pending' | 'analyzed' | 'confirmed' | 'rejected'
  }),

  // 任务计划 (v2)
  taskPlan: Annotation({
    plan: TaskPlan | null
    currentStepId: string | null
    executionLog: Array<{
      stepId: string
      startTime: Date
      endTime?: Date
      status: 'running' | 'done' | 'error'
      result?: unknown
    }>
  }),

  // 思考推理 (v2)
  thinking: Annotation({
    lastThinkTime: Date | null
    adjustments: ThinkerOutput['adjustments']
    risks: ThinkerOutput['risks']
  }),

  // 质量检查 (v2)
  quality: Annotation({
    lastCheckTime: Date | null
    result: QualityCheckResult | null
    retryCount: number
  }),
})
```

---

## 十一、配置开关

### 11.1 环境变量

```bash
# 启用需求分析（默认 true）
AI_ENABLE_REQUIREMENT_ANALYSIS=true

# 启用任务规划（默认 true）
AI_ENABLE_TASK_PLANNER=true
```

### 11.2 配置说明

```typescript
// packages/server/src/ai/graph/graph.ts
const V2_CONFIG = {
  enableRequirementAnalysis: process.env.AI_ENABLE_REQUIREMENT_ANALYSIS !== 'false',
  enableTaskPlanner: process.env.AI_ENABLE_TASK_PLANNER !== 'false',
}
```

**行为说明**：
- `enableRequirementAnalysis=true`：所有模式都进行需求分析
- `enableRequirementAnalysis=false`：跳过需求分析，使用 v1 路由
- 显式模式会将用户选择的 Agent 作为上下文传入 LLM

---

## 十二、实现状态

| Phase | 内容 | 复杂度 | 预计工时 | 状态 |
|-------|------|--------|----------|------|
| **P0** | RequirementAnalyzer 节点 | 中 | 4h | ✅ 已实现 |
| **P0** | RequirementAnalyzer 工具调用 | 中 | 3h | ✅ 已实现 |
| **P0** | TaskPlanner 节点 | 高 | 6h | ✅ 已实现 |
| **P0** | State 扩展 | 中 | 2h | ✅ 已实现 |
| **P0** | 事件协议扩展 | 低 | 1h | ✅ 已实现 |
| **P0** | 前端事件处理 | 中 | 2h | ✅ 已实现 |
| **P1** | RequirementConfirm 前端组件 | 中 | 4h | ✅ 已实现 |
| **P1** | 需求确认交互逻辑 | 中 | 2h | ✅ 已实现 |
| **P1** | Thinker 节点 | 中 | 4h | 📋 待实现 |
| **P2** | QualityCheck 节点 | 中 | 4h | 📋 待实现 |
| **P2** | 动态任务链执行 | 高 | 6h | 📋 待实现 |
| **P3** | 并行任务执行 | 高 | 8h | 📋 待实现 |

**已完成**：约 24h
**待实现**：约 22h

---

## 十三、目录结构

```
packages/ai/
├── app/                    # AI 前端应用
│   ├── src/
│   │   ├── components/     # UI 组件
│   │   │   ├── AiMessage.vue
│   │   │   ├── AiStepCard.vue
│   │   │   └── RequirementConfirmCard.vue  # 需求确认卡片
│   │   ├── stores/         # Pinia Store
│   │   │   ├── ai.ts       # 主 Store（处理 v2 事件）
│   │   │   └── stream.ts
│   │   ├── types/          # 类型定义
│   │   │   └── index.ts    # 含 RequirementAnalysis、StreamEvent 类型
│   │   └── views/
│   │       └── AiSidebarView.vue
│
├── sdk/                    # AI SDK
│   ├── src/
│   │   ├── agent.ts        # Agent 基类
│   │   ├── tool.ts         # 工具构建器
│   │   └── types.ts        # 类型定义
│
├── shared/                 # 共享代码
│   ├── events.ts           # 事件协议定义（含 v2 事件）
│   ├── promptBuilder.ts    # System Prompt 构建
│   └── metadata.json       # Widget 元数据
│
└── docs/                   # 文档
    ├── architecture.md     # 架构文档（本文件）
    ├── agent.md            # Agent 详细说明
    ├── tool.md             # Tool 详细说明
    ├── mcp.md              # MCP 详细说明
    └── events.md           # 事件协议

packages/server/
└── src/ai/
    └── graph/
        ├── state.ts                # State 定义（含 v2 字段）
        ├── graph.ts                # Graph 构建（含 v2 节点）
        ├── requirementAnalyzer.ts  # 需求分析器（v2）
        ├── taskPlanner.ts          # 任务规划器（v2）
        ├── editorAgent.ts          # Editor Agent
        ├── flowAgent.ts            # Flow Agent
        ├── pageAgent.ts            # Page Agent
        └── ...
```

---

## 十四、相关文档

- [Agent 详细说明](./agent.md) — Agent 类型、职责、执行流程
- [Tool 详细说明](./tool.md) — 工具定义、注册、执行和扩展
- [MCP 详细说明](./mcp.md) — Model Context Protocol 概念和实现
- [事件协议](./events.md) — 流式通信的事件类型和数据格式
