# AI 文档

`@schema-form/ai-app` — AI 对话式 Schema/Flow 生成微应用

## 快速开始

```bash
pnpm dev:ai        # 启动开发服务器（端口 5300）
pnpm --filter @schema-form/ai-app build  # 构建
```

## 外部集成

参见 [平台集成指南](../../docs/integration-guide.md#三ai智能助手)：
- qiankun 微前端接入
- WebSocket 流式 API (Socket.IO)
- MCP 协议（3 个 MCP Server）
- SDK 独立使用
- 事件协议（12 种事件类型）

## 文档目录

- [架构总览](./architecture.md) — 分层架构、LangGraph 节点、数据流
- [Agent 系统](./agent.md) — 5 种 Agent 类型、执行流程、协作机制
- [工具系统](./tool.md) — 15+ 工具分类、ToolRegistry、工具创建
- [MCP 协议](./mcp.md) — 3 个 MCP Server、工具命名空间
- [事件协议](./events.md) — 12 大类事件、客户端请求事件
