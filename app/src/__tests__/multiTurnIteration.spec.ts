/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAiStore } from '@/stores/ai'
import { useConversationStore } from '@/stores/conversation'
import { useSchemaStore } from '@/stores/schema'
import { useStreamStore } from '@/stores/stream'

// Mock the API module (REST endpoints only — chat is now via WebSocket)
vi.mock('@/api/aiApi', () => ({
  getConversations: vi.fn(),
  deleteConversation: vi.fn(),
  publish: vi.fn(),
  getConversationDetail: vi.fn(),
}))

import { getConversations } from '@/api/aiApi'

// ---- WebSocket mock ----
// 模拟服务端 chat:event 推送
let chatEventHandler: ((event: Record<string, unknown>) => void) | null = null
vi.mock('@schema-form/platform-shared/socket', () => ({
  emitChatSend: vi.fn(),
  emitChatCancel: vi.fn(),
  emitChatResume: vi.fn(),
  onChatEvent: vi.fn((handler: (event: Record<string, unknown>) => void) => {
    chatEventHandler = handler
    return () => { chatEventHandler = null }
  }),
}))

import { emitChatSend } from '@schema-form/platform-shared/socket'

/** 模拟服务端推送事件到客户端 */
function pushChatEvent(event: Record<string, unknown>) {
  chatEventHandler?.(event)
}

/** 模拟完整的 SSE 流式响应（通过 WebSocket mock 实现） */
function mockChatStream(events: Array<Record<string, unknown>>) {
  // 事件驱动：emitChatSend 触发时同步推送所有事件
  // 使用 queueMicrotask 让 Vue 的响应式更新先处理
  vi.mocked(emitChatSend).mockImplementation(() => {
    let i = 0
    const push = () => {
      if (i < events.length) {
        pushChatEvent(events[i])
        i++
        queueMicrotask(push)
      }
    }
    queueMicrotask(push)
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('Multi-turn iteration', () => {
  it('sends currentSchema in context on second message', async () => {
    const store = useAiStore()
    const schema = [{ id: 'form_a1b2c', type: 'form', label: '表单', children: [{ id: 'input_1', type: 'input', field: 'name', label: '姓名' }] }]

    // First message: AI generates schema
    mockChatStream([
      { type: 'schema_complete', schema: schema, description: '表单已生成' },
      { type: 'done', conversationId: 'conv-1' },
    ])

    await store.sendMessage('生成一个用户注册表单')
    expect(store.currentSchema).toEqual(schema)

    // Second message: user wants to modify
    mockChatStream([
      { type: 'text_delta', content: '已修改' },
      { type: 'done', conversationId: 'conv-1' },
    ])

    await store.sendMessage('把姓名改成用户名')

    // Verify the chat API was called with currentSchema in context
    expect(emitChatSend).toHaveBeenLastCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          currentSchema: schema,
        }),
      }),
    )
  })

  it('sends currentFlow in context on second message', async () => {
    const store = useAiStore()
    const flow = { nodes: [{ id: 'n1', data: { bpmnType: 'startEvent', label: '开始' } }], edges: [] }

    // First message: AI generates flow
    mockChatStream([
      { type: 'flow_complete', flow: flow, description: '流程已生成' },
      { type: 'done', conversationId: 'conv-1' },
    ])

    await store.sendMessage('创建一个审批流程')
    expect(store.currentFlow).toEqual(flow)

    // Second message: user wants to modify
    mockChatStream([
      { type: 'text_delta', content: '已修改' },
      { type: 'done', conversationId: 'conv-1' },
    ])

    await store.sendMessage('加一个审批节点')

    expect(emitChatSend).toHaveBeenLastCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          currentFlow: flow,
        }),
      }),
    )
  })

  it('sends both currentSchema and currentFlow when both exist', async () => {
    const store = useAiStore()
    const schema = [{ id: 's1', type: 'input', field: 'name' }]
    const flow = { nodes: [{ id: 'n1', data: {} }], edges: [] }

    store.setCurrentSchema(schema as any)
    store.setCurrentFlow(flow as any)

    mockChatStream([
      { type: 'text_delta', content: 'ok' },
      { type: 'done', conversationId: 'conv-1' },
    ])

    await store.sendMessage('修改一下')

    expect(emitChatSend).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          currentSchema: schema,
          currentFlow: flow,
        }),
      }),
    )
  })

  it('does not send currentSchema when no schema exists', async () => {
    const store = useAiStore()

    mockChatStream([
      { type: 'text_delta', content: 'ok' },
      { type: 'done', conversationId: 'conv-1' },
    ])

    await store.sendMessage('你好')

    expect(emitChatSend).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.not.objectContaining({
          currentSchema: expect.anything(),
        }),
      }),
    )
  })

  it('updates currentSchema after schema event in subsequent turn', async () => {
    const store = useAiStore()
    const schema1 = [{ id: 's1', type: 'input', field: 'name' }]
    const schema2 = [{ id: 's1', type: 'input', field: 'userName' }, { id: 's2', type: 'input', field: 'email' }]

    // Turn 1: generate
    mockChatStream([
      { type: 'schema_complete', schema: schema1, description: '初始表单' },
      { type: 'done', conversationId: 'conv-1' },
    ])
    await store.sendMessage('生成表单')
    expect(store.currentSchema).toEqual(schema1)

    // Turn 2: modify - AI sends updated schema
    mockChatStream([
      { type: 'schema_complete', schema: schema2, description: '已添加邮箱字段' },
      { type: 'done', conversationId: 'conv-1' },
    ])
    await store.sendMessage('添加邮箱字段')
    expect(store.currentSchema).toEqual(schema2)

    // Turn 3: verify schema2 is carried forward
    mockChatStream([
      { type: 'text_delta', content: 'ok' },
      { type: 'done', conversationId: 'conv-1' },
    ])
    await store.sendMessage('再改一下')

    expect(emitChatSend).toHaveBeenLastCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          currentSchema: schema2,
        }),
      }),
    )
  })

  it('passes conversationId on subsequent turns for context continuity', async () => {
    const store = useAiStore()

    // Turn 1
    mockChatStream([
      { type: 'text_delta', content: 'ok' },
      { type: 'done', conversationId: 'conv-1' },
    ])
    await store.sendMessage('生成表单')

    // Turn 2
    mockChatStream([
      { type: 'text_delta', content: 'sure' },
      { type: 'done', conversationId: 'conv-1' },
    ])
    await store.sendMessage('修改一下')

    // First call should have conversationId undefined (new conversation)
    expect(emitChatSend).toHaveBeenNthCalledWith(1,
      expect.objectContaining({ conversationId: undefined }),
    )
    // Second call should have conversationId from first turn's done event
    expect(emitChatSend).toHaveBeenNthCalledWith(2,
      expect.objectContaining({ conversationId: 'conv-1' }),
    )
  })

  it('conversation has correct message count after multi-turn', async () => {
    const store = useAiStore()

    mockChatStream([
      { type: 'text_delta', content: 'reply1' },
      { type: 'done', conversationId: 'conv-1' },
    ])
    await store.sendMessage('hello')

    mockChatStream([
      { type: 'text_delta', content: 'reply2' },
      { type: 'done', conversationId: 'conv-1' },
    ])
    await store.sendMessage('world')

    // 2 user + 2 assistant = 4 messages
    expect(store.messages).toHaveLength(4)
    expect(store.messages[0].role).toBe('user')
    expect(store.messages[0].content).toBe('hello')
    expect(store.messages[1].role).toBe('assistant')
    expect(store.messages[1].content).toBe('reply1')
    expect(store.messages[2].role).toBe('user')
    expect(store.messages[2].content).toBe('world')
    expect(store.messages[3].role).toBe('assistant')
    expect(store.messages[3].content).toBe('reply2')
  })
})
