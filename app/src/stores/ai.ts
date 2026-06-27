/**
 * AI 对话状态管理（向后兼容层）
 *
 * 此文件保持向后兼容性，内部使用拆分后的 store。
 * 新代码应直接使用拆分后的 store：
 * - useConversationStore: 对话管理
 * - useStreamStore: 流式连接
 * - useSchemaStore: Schema 状态
 * - useLLMStore: LLM Provider
 * - useRAGStore: RAG 搜索
 * - useChatSettingsStore: 聊天设置
 * - useHITLStore: HITL 中断
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  AIMessage,
  AgentType,
  ChatContext,
  Widget,
  FlowGraph,
  TaskChainStep,
  MentionReference,
  SSEEvent,
} from '@/types'
import type {
  SearchResult,
  MentionType,
  MentionSearchResult,
  FeedbackType,
} from '@/api/aiApi'
import {
  searchConversations,
  mentionSearch,
  submitMessageFeedback,
} from '@/api/aiApi'

import { useConversationStore } from './conversation'
import { useStreamStore } from './stream'
import { useSchemaStore } from './schema'
import { useLLMStore } from './llm'
import { useRAGStore } from './rag'
import { useChatSettingsStore } from './chatSettings'
import { useHITLStore } from './hitl'

export const useAiStore = defineStore('ai', () => {
  // ---- 内部 store 引用 ----
  const conversationStore = useConversationStore()
  const streamStore = useStreamStore()
  const schemaStore = useSchemaStore()
  const llmStore = useLLMStore()
  const ragStore = useRAGStore()
  const chatSettingsStore = useChatSettingsStore()
  const hitlStore = useHITLStore()

  // ---- 本地状态 ----
  const activeAgent = ref<AgentType>('auto')
  const context = ref<ChatContext>({ source: 'standalone' })
  const taskChain = ref<TaskChainStep[]>([])
  const taskChainIndex = ref(0)

  // ---- 流式事件处理 ----

  function handleStreamEvent(event: SSEEvent, assistantIndex: number): void {
    const msg = conversationStore.messages[assistantIndex]
    if (!msg) {
      console.warn('[ai] handleStreamEvent: msg not found at index', assistantIndex)
      return
    }

    console.log('[ai] handleStreamEvent', event.type, event.content?.substring(0, 20))

    // 强制触发响应式更新的辅助函数
    function updateMessage(updates: Partial<AIMessage>): void {
      Object.assign(msg, updates)
      console.log('[ai] updateMessage', updates, 'messages length:', conversationStore.messages.length)
    }

    switch (event.type) {
      case 'agent_switch':
        if (event.agent) {
          const collaborationNote = event.collaboration && event.description
            ? `\n\n[协作] 请求 ${event.agent === 'editor' ? 'Editor' : 'Flow'} 专家协助：${event.description}`
            : ''
          updateMessage({
            agent: event.agent as 'editor' | 'flow' | 'general',
            thinking: (msg.thinking ?? '') + collaborationNote,
          })
        }
        break

      case 'thinking_delta':
        if (event.content) {
          updateMessage({ thinking: (msg.thinking ?? '') + event.content })
        }
        break

      case 'text_delta':
        if (event.content) {
          updateMessage({ content: (msg.content ?? '') + event.content })
        }
        break

      case 'schema_start':
        // Schema 开始生成
        break

      case 'schema_progress':
        if (event.step) {
          schemaStore.setBuildStep(event.step)
        }
        if (event.schema) {
          schemaStore.setCurrentSchema(event.schema as Widget[])
        }
        if (event.step && event.description) {
          const stepLabels: Record<string, string> = {
            layout: '布局结构',
            components: '表单组件',
            validation: '验证规则',
            styling: '样式配置',
          }
          const stepLabel = stepLabels[event.step] ?? event.step
          const progressNote = `\n\n[生成进度] ${stepLabel}: ${event.description}`
          updateMessage({ thinking: (msg.thinking ?? '') + progressNote })
        }
        break

      case 'schema_complete':
        schemaStore.setBuildStep(null)
        if (event.schema) {
          schemaStore.setCurrentSchema(event.schema as Widget[])
        }
        if (event.description) {
          updateMessage({
            schema: event.schema as Widget[],
            content: (msg.content ?? '') + event.description,
          })
        } else if (event.schema) {
          updateMessage({ schema: event.schema as Widget[] })
        }
        break

      case 'schema_diff':
        if (event.diff) {
          schemaStore.setSchemaDiff(event.diff as any, event.description)
        }
        break

      case 'flow_start':
        // Flow 开始生成
        break

      case 'flow_progress':
        if (event.step && event.description) {
          const progressNote = `\n\n[流程生成] ${event.step}: ${event.description}`
          updateMessage({ thinking: (msg.thinking ?? '') + progressNote })
        }
        break

      case 'flow_complete':
        if (event.flow) {
          schemaStore.setCurrentFlow(event.flow as FlowGraph)
        }
        if (event.description) {
          updateMessage({
            flow: event.flow as FlowGraph,
            content: (msg.content ?? '') + event.description,
          })
        } else if (event.flow) {
          updateMessage({ flow: event.flow as FlowGraph })
        }
        break

      case 'flow_diff':
        if (event.diff) {
          schemaStore.setFlowDiff(event.diff as any)
        }
        break

      case 'tool_call_start': {
        const newToolCalls = [...(msg.toolCalls ?? [])]
        if (event.tools) {
          for (const tool of event.tools) {
            newToolCalls.push({
              id: tool.id,
              name: tool.name,
              arguments: tool.arguments ?? {},
            })
          }
        }
        updateMessage({ toolCalls: newToolCalls })
        break
      }

      case 'tool_call_end': {
        const updatedToolCalls = [...(msg.toolCalls ?? [])]
        if (event.tools) {
          for (const tool of event.tools) {
            const existing = tool.id
              ? updatedToolCalls.find((t) => t.id === tool.id && !t.result)
              : updatedToolCalls.find((t) => t.name === tool.name && !t.result)
            if (existing) {
              existing.result = tool.result
            }
          }
        }
        updateMessage({ toolCalls: updatedToolCalls })
        break
      }

      case 'tool_error': {
        const errorToolCalls = [...(msg.toolCalls ?? [])]
        const errorMsg = event.content ?? '工具执行失败'
        const existing = event.runId
          ? errorToolCalls.find((t) => t.id === event.runId)
          : errorToolCalls.find((t) => t.name === (event.toolName ?? 'unknown') && !t.result)
        if (existing) {
          existing.error = errorMsg
          existing.result = { error: errorMsg }
        } else {
          errorToolCalls.push({
            name: event.toolName ?? 'unknown',
            arguments: {},
            result: { error: errorMsg },
            error: errorMsg,
          })
        }
        updateMessage({ toolCalls: errorToolCalls })
        break
      }

      case 'chain_start':
      case 'chain_step':
        if (event.steps) {
          taskChain.value = event.steps
          taskChainIndex.value = event.currentIndex ?? 0
        }
        break

      case 'chain_complete':
        taskChain.value = []
        taskChainIndex.value = 0
        break

      case 'done':
        if (event.conversationId) {
          conversationStore.currentConversationId = event.conversationId
          conversationStore.loadConversations()
        }
        break

      case 'interrupt': {
        hitlStore.setInterrupt({
          threadId: event.threadId ?? '',
          type: event.interruptType ?? 'unknown',
          message: event.message ?? '需要您的确认',
          data: event.data,
        })
        conversationStore.messages.push({
          role: 'assistant',
          type: 'interrupt',
          content: event.message ?? '需要您的确认',
          data: hitlStore.pendingInterrupt,
          timestamp: new Date(),
          status: 'received',
        })
        break
      }

      case 'error':
        streamStore.error = event.content ?? 'Unknown error'
        if (msg.status === 'streaming') {
          const agentLabel = event.agent ? ` [${event.agent}]` : ''
          updateMessage({
            content: (msg.content || msg.thinking || '')
              + `\n\n⚠️${agentLabel} ${event.content ?? '未知错误'}`,
            status: 'error',
          })
        }
        break

      // v2: 需求分析事件
      case 'requirement_analysis_start':
        updateMessage({
          thinking: (msg.thinking ?? '') + '\n\n🔍 正在分析需求...',
        })
        break

      case 'requirement_analysis_complete': {
        const analysis = event.analysis
        if (analysis) {
          // 如果需要确认，添加需求确认卡片
          if (event.needsConfirmation && analysis.confirmQuestions.length > 0) {
            const newToolCalls = [...(msg.toolCalls ?? [])]
            newToolCalls.push({
              name: 'requirement_confirm',
              arguments: {},
              result: {
                analysis: analysis,
                waitingConfirmation: true,
              },
            })

            updateMessage({
              thinking: (msg.thinking ?? '') + '\n\n📊 需求分析完成',
              toolCalls: newToolCalls,
            })
          } else {
            // 不需要确认，直接显示分析结果
            const complexityLabel = analysis.complexity === 'complex' ? '复杂' :
              analysis.complexity === 'medium' ? '中等' : '简单'

            updateMessage({
              thinking: (msg.thinking ?? '')
                + `\n\n📊 需求分析完成`
                + `\n- 意图：${analysis.intent}`
                + `\n- 类型：${analysis.type}`
                + `\n- 复杂度：${complexityLabel}`
                + `\n- 完整性：${analysis.completeness.score}%`,
            })
          }
        }
        break
      }

      case 'requirement_confirm_response': {
        // 用户确认了需求，更新消息状态
        const newToolCalls = [...(msg.toolCalls ?? [])]
        const confirmIndex = newToolCalls.findIndex(tc => tc.name === 'requirement_confirm')
        if (confirmIndex >= 0) {
          newToolCalls[confirmIndex] = {
            ...newToolCalls[confirmIndex],
            result: {
              ...newToolCalls[confirmIndex].result as Record<string, unknown>,
              waitingConfirmation: false,
              userAnswers: event.answers,
            },
          }
          updateMessage({ toolCalls: newToolCalls })
        }
        break
      }

      // v2: 任务规划事件
      case 'task_plan_start':
        updateMessage({
          thinking: (msg.thinking ?? '') + '\n\n📋 正在规划任务...',
        })
        break

      case 'task_plan_complete': {
        const plan = event.plan
        if (plan && plan.chain) {
          const stepsText = plan.chain
            .map((step, i) => `${i + 1}. [${step.agent}] ${step.description}`)
            .join('\n')

          updateMessage({
            thinking: (msg.thinking ?? '')
              + `\n\n📋 任务规划完成`
              + `\n- 执行模式：${plan.strategy.mode}`
              + `\n- 步骤数：${plan.chain.length}`
              + `\n\n执行计划：\n${stepsText}`,
          })
        }
        break
      }

      // v2: 思考推理事件
      case 'thinker_start':
        updateMessage({
          thinking: (msg.thinking ?? '') + '\n\n🤔 正在思考执行策略...',
        })
        break

      case 'thinker_complete': {
        const { adjustments, risks, suggestions } = event
        let thinkerText = '\n\n🤔 思考完成'

        if (risks && risks.length > 0) {
          thinkerText += `\n\n风险评估：${risks.map(r => `\n- ${r.description}`).join('')}`
        }

        if (suggestions && suggestions.length > 0) {
          thinkerText += `\n\n建议：${suggestions.map(s => `\n- ${s.description}`).join('')}`
        }

        if (adjustments?.skipSteps && adjustments.skipSteps.length > 0) {
          thinkerText += `\n\n调整：跳过步骤 ${adjustments.skipSteps.join(', ')}`
        }

        updateMessage({
          thinking: (msg.thinking ?? '') + thinkerText,
        })
        break
      }

      // v2: 质量检查事件
      case 'quality_check_start':
        updateMessage({
          thinking: (msg.thinking ?? '') + '\n\n✅ 正在检查质量...',
        })
        break

      case 'quality_check_complete': {
        const result = event.result
        if (result) {
          let qualityText = '\n\n✅ 质量检查完成'
          qualityText += `\n- 结构有效：${result.structure.valid ? '是' : '否'}`
          qualityText += `\n- 完整性：${result.completeness.score}%`
          qualityText += `\n- 一致性：${result.consistency.score}%`

          if (result.suggestions && result.suggestions.length > 0) {
            qualityText += `\n\n改进建议：${result.suggestions.map(s => `\n- ${s.description}`).join('')}`
          }

          updateMessage({
            thinking: (msg.thinking ?? '') + qualityText,
          })
        }
        break
      }
    }
  }

  // ---- Actions ----

  function switchAgent(agent: AgentType): void {
    activeAgent.value = agent
    context.value.source = agent === 'auto' ? 'standalone' : (agent as 'editor' | 'flow')
  }

  async function sendMessage(content: string, mentions?: MentionReference[]): Promise<void> {
    streamStore.cancelCurrent()
    streamStore.lastMessagePayload = { content, mentions }
    streamStore.retryCount = 0
    streamStore.loading = true
    streamStore.error = null

    // 将 RAG context 注入消息内容
    const ragPrefix = ragStore.getRagContextContent()
    const enrichedContent = ragPrefix + content

    // 追加用户消息
    conversationStore.messages.push({
      role: 'user',
      content: enrichedContent,
      timestamp: new Date(),
      status: 'sent',
    })

    // 准备 assistant 消息占位
    const assistantIndex = conversationStore.messages.length
    conversationStore.messages.push({
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      status: 'streaming',
    })

    await streamStore.executeStream(enrichedContent, mentions, assistantIndex, conversationStore.messages, {
      onStreamEvent: handleStreamEvent,
      onDone: (conversationId) => {
        if (conversationId) conversationStore.loadConversations()
      },
      getContext: () => ({
        context: context.value,
        chatSettings: chatSettingsStore.chatSettings,
        currentSchema: schemaStore.currentSchema,
        currentFlow: schemaStore.currentFlow,
        currentConversationId: conversationStore.currentConversationId,
      }),
    })
  }

  async function retryLastMessage(): Promise<void> {
    if (!streamStore.lastMessagePayload) return

    streamStore.cancelCurrent()
    streamStore.retryCount = 0
    streamStore.loading = true
    streamStore.error = null

    const lastIdx = conversationStore.messages.length - 1
    if (lastIdx >= 0 && conversationStore.messages[lastIdx].role === 'assistant') {
      conversationStore.messages[lastIdx].content = ''
      conversationStore.messages[lastIdx].status = 'streaming'
      await streamStore.executeStream(
        streamStore.lastMessagePayload.content,
        streamStore.lastMessagePayload.mentions,
        lastIdx,
        conversationStore.messages,
        {
          onStreamEvent: handleStreamEvent,
          onDone: (conversationId) => {
            if (conversationId) conversationStore.loadConversations()
          },
          getContext: () => ({
            context: context.value,
            chatSettings: chatSettingsStore.chatSettings,
            currentSchema: schemaStore.currentSchema,
            currentFlow: schemaStore.currentFlow,
            currentConversationId: conversationStore.currentConversationId,
          }),
        },
      )
    }
  }

  async function retryToolCall(messageIndex: number, toolCallIndex: number): Promise<void> {
    const msg = conversationStore.messages[messageIndex]
    if (!msg || msg.role !== 'assistant' || !msg.toolCalls) return

    const toolCall = msg.toolCalls[toolCallIndex]
    if (!toolCall || !toolCall.error) return

    toolCall.error = undefined
    toolCall.result = undefined

    let userContent = ''
    let userMentions: MentionReference[] | undefined
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (conversationStore.messages[i].role === 'user') {
        userContent = conversationStore.messages[i].content
        break
      }
    }
    if (!userContent) return

    streamStore.cancelCurrent()
    streamStore.loading = true
    streamStore.error = null
    msg.status = 'streaming'

    await streamStore.executeStream(userContent, userMentions, messageIndex, conversationStore.messages, {
      onStreamEvent: handleStreamEvent,
      onDone: (conversationId) => {
        if (conversationId) conversationStore.loadConversations()
      },
      getContext: () => ({
        context: context.value,
        chatSettings: chatSettingsStore.chatSettings,
        currentSchema: schemaStore.currentSchema,
        currentFlow: schemaStore.currentFlow,
        currentConversationId: conversationStore.currentConversationId,
      }),
    })
  }

  async function respondInterrupt(confirmed: boolean): Promise<void> {
    const interrupt = hitlStore.pendingInterrupt
    if (!interrupt) return

    streamStore.loading = true
    streamStore.error = null
    hitlStore.clearInterrupt()

    await streamStore.executeResume(interrupt.threadId, confirmed, conversationStore.messages, {
      onStreamEvent: handleStreamEvent,
      onDone: (conversationId) => {
        if (conversationId) conversationStore.loadConversations()
      },
      getContext: () => ({
        currentConversationId: conversationStore.currentConversationId,
      }),
    })
  }

  async function loadConversation(id: string): Promise<void> {
    conversationStore.clearConversation()
    schemaStore.clearSchemaState()
    hitlStore.clearInterrupt()

    const result = await conversationStore.loadConversation(id)
    if (result.schema) schemaStore.setCurrentSchema(result.schema)
    if (result.flow) schemaStore.setCurrentFlow(result.flow)
    streamStore.error = null
  }

  async function removeConversation(id: string): Promise<void> {
    await conversationStore.removeConversation(id)
    if (conversationStore.currentConversationId === id) {
      clearConversation()
    }
  }

  function clearConversation(): void {
    streamStore.cancelCurrent()
    conversationStore.clearConversation()
    schemaStore.clearSchemaState()
    hitlStore.clearInterrupt()
    streamStore.streamStatus = 'idle'
    streamStore.retryCount = 0
    streamStore.lastMessagePayload = null
    streamStore.error = null
  }

  async function loadConversations(): Promise<void> {
    await conversationStore.loadConversations()
  }

  async function publishCurrent(): Promise<{ id: string; publishId?: string; type: 'schema' | 'flow' } | null> {
    if (!conversationStore.currentConversationId) return null

    const type = schemaStore.currentSchema ? 'schema' : 'flow'
    const payload = schemaStore.currentSchema ?? schemaStore.currentFlow
    if (!payload) return null

    return conversationStore.publishCurrent({ type, data: payload as any })
  }

  function setContext(ctx: Partial<ChatContext>): void {
    context.value = { ...context.value, ...ctx }
  }

  // ---- 需求确认 ----

  async function confirmRequirement(answers: Record<string, string>): Promise<void> {
    // 更新消息中的需求确认状态
    const lastAssistantIdx = conversationStore.messages.findLastIndex(m => m.role === 'assistant')
    if (lastAssistantIdx < 0) return

    const msg = conversationStore.messages[lastAssistantIdx]
    if (!msg.toolCalls) return

    const confirmIndex = msg.toolCalls.findIndex(tc => tc.name === 'requirement_confirm')
    if (confirmIndex < 0) return

    // 更新 toolCalls 中的确认状态
    const newToolCalls = [...msg.toolCalls]
    newToolCalls[confirmIndex] = {
      ...newToolCalls[confirmIndex],
      result: {
        ...newToolCalls[confirmIndex].result as Record<string, unknown>,
        waitingConfirmation: false,
        userAnswers: answers,
      },
    }
    msg.toolCalls = newToolCalls

    // 发送确认响应到服务器
    // 通过 WebSocket 发送 requirement_confirm_response 事件
    const { emitChatSend } = await import('@schema-form/platform-shared/socket')
    emitChatSend({
      conversationId: conversationStore.currentConversationId ?? undefined,
      message: JSON.stringify({ type: 'requirement_confirm_response', answers }),
      context: {
        ...context.value,
        preferences: {
          ...context.value.preferences,
          replyLanguage: chatSettingsStore.chatSettings.preferences.replyLanguage,
          replyStyle: chatSettingsStore.chatSettings.preferences.replyStyle,
          codeComment: chatSettingsStore.chatSettings.preferences.codeComment,
        },
        historySummary: chatSettingsStore.chatSettings.historySummary.mode === 'manual'
          ? chatSettingsStore.chatSettings.historySummary.manualSummary
          : context.value.historySummary,
        currentSchema: schemaStore.currentSchema ?? undefined,
        currentFlow: schemaStore.currentFlow ?? undefined,
      },
    })
  }

  async function skipRequirement(): Promise<void> {
    // 跳过需求确认，直接执行
    const lastAssistantIdx = conversationStore.messages.findLastIndex(m => m.role === 'assistant')
    if (lastAssistantIdx < 0) return

    const msg = conversationStore.messages[lastAssistantIdx]
    if (!msg.toolCalls) return

    const confirmIndex = msg.toolCalls.findIndex(tc => tc.name === 'requirement_confirm')
    if (confirmIndex < 0) return

    // 更新 toolCalls 中的确认状态
    const newToolCalls = [...msg.toolCalls]
    newToolCalls[confirmIndex] = {
      ...newToolCalls[confirmIndex],
      result: {
        ...newToolCalls[confirmIndex].result as Record<string, unknown>,
        waitingConfirmation: false,
        skipped: true,
      },
    }
    msg.toolCalls = newToolCalls

    // 发送跳过确认到服务器
    const { emitChatSend } = await import('@schema-form/platform-shared/socket')
    emitChatSend({
      conversationId: conversationStore.currentConversationId ?? undefined,
      message: JSON.stringify({ type: 'requirement_confirm_response', skipped: true }),
      context: {
        ...context.value,
        preferences: {
          ...context.value.preferences,
          replyLanguage: chatSettingsStore.chatSettings.preferences.replyLanguage,
          replyStyle: chatSettingsStore.chatSettings.preferences.replyStyle,
          codeComment: chatSettingsStore.chatSettings.preferences.codeComment,
        },
        historySummary: chatSettingsStore.chatSettings.historySummary.mode === 'manual'
          ? chatSettingsStore.chatSettings.historySummary.manualSummary
          : context.value.historySummary,
        currentSchema: schemaStore.currentSchema ?? undefined,
        currentFlow: schemaStore.currentFlow ?? undefined,
      },
    })
  }

  // ---- 搜索 ----

  async function searchConversationsAction(
    params: string | import('@/api/aiApi').SearchConversationsParams,
  ): Promise<SearchResult> {
    const normalized = typeof params === 'string' ? { keyword: params } : params
    return searchConversations(normalized)
  }

  async function mentionSearchAction(
    query: string,
    type: MentionType,
    limit = 10,
  ): Promise<MentionSearchResult[]> {
    return mentionSearch(query, type, limit)
  }

  // ---- 消息操作 ----

  async function submitFeedback(messageIndex: number, type: FeedbackType): Promise<void> {
    const msg = conversationStore.messages[messageIndex]
    if (!msg) return

    const messageId = msg.id
    if (!messageId) return

    const newFeedback = msg.feedback === type ? null : type
    msg.feedback = newFeedback

    try {
      await submitMessageFeedback(messageId, type)
    } catch {
      msg.feedback = msg.feedback === type ? null : type
    }
  }

  async function regenerateMessage(messageIndex: number): Promise<void> {
    const msg = conversationStore.messages[messageIndex]
    if (!msg || msg.role !== 'assistant') return

    let userContent = ''
    let userMentions: MentionReference[] | undefined
    for (let i = messageIndex - 1; i >= 0; i--) {
      if (conversationStore.messages[i].role === 'user') {
        userContent = conversationStore.messages[i].content
        break
      }
    }
    if (!userContent) return

    streamStore.cancelCurrent()
    streamStore.loading = true
    streamStore.error = null

    msg.content = ''
    msg.thinking = undefined
    msg.tip = undefined
    msg.toolCalls = undefined
    msg.schema = undefined
    msg.flow = undefined
    msg.feedback = null
    msg.status = 'streaming'

    await streamStore.executeStream(userContent, userMentions, messageIndex, conversationStore.messages, {
      onStreamEvent: handleStreamEvent,
      onDone: (conversationId) => {
        if (conversationId) conversationStore.loadConversations()
      },
      getContext: () => ({
        context: context.value,
        chatSettings: chatSettingsStore.chatSettings,
        currentSchema: schemaStore.currentSchema,
        currentFlow: schemaStore.currentFlow,
        currentConversationId: conversationStore.currentConversationId,
      }),
    })
  }

  return {
    // state（从子 store 代理）
    conversations: computed(() => conversationStore.conversations),
    currentConversationId: computed(() => conversationStore.currentConversationId),
    messages: computed(() => conversationStore.messages),
    activeAgent,
    context,
    loading: computed(() => streamStore.loading),
    currentSchema: computed(() => schemaStore.currentSchema),
    currentFlow: computed(() => schemaStore.currentFlow),
    error: computed(() => streamStore.error),
    taskChain,
    taskChainIndex,
    schemaHistory: computed(() => schemaStore.schemaHistory),
    currentDiff: computed(() => schemaStore.currentDiff),
    currentFlowDiff: computed(() => schemaStore.currentFlowDiff),
    schemaUpdateDescription: computed(() => schemaStore.schemaUpdateDescription),
    versionHistory: computed(() => schemaStore.versionHistory),
    currentVersionIndex: computed(() => schemaStore.currentVersionIndex),
    sseStatus: computed(() => streamStore.streamStatus),
    retryCount: computed(() => streamStore.retryCount),
    llmProviders: computed(() => llmStore.llmProviders),
    llmDefaultProvider: computed(() => llmStore.llmDefaultProvider),
    llmDefaultStrategy: computed(() => llmStore.llmDefaultStrategy),
    llmStrategies: computed(() => llmStore.llmStrategies),
    llmUsage: computed(() => llmStore.llmUsage),
    llmLoading: computed(() => llmStore.llmLoading),
    chatSettings: computed(() => chatSettingsStore.chatSettings),
    ragSearchResults: computed(() => ragStore.ragSearchResults),
    ragSearching: computed(() => ragStore.ragSearching),
    ragContext: computed(() => ragStore.ragContext),
    pendingInterrupt: computed(() => hitlStore.pendingInterrupt),

    // getters
    currentConversation: computed(() => conversationStore.currentConversation),
    hasPreview: computed(() => schemaStore.hasPreview),
    canUndoSchema: computed(() => schemaStore.canUndoSchema),
    MAX_AUTO_RETRIES: computed(() => streamStore.MAX_AUTO_RETRIES),

    // actions
    sendMessage,
    retryLastMessage,
    retryToolCall,
    stopGeneration: () => streamStore.stopGeneration(),
    switchAgent,
    clearConversation,
    loadConversations,
    loadConversation,
    removeConversation,
    publishCurrent,
    setContext,
    setCurrentSchema: (schema: Widget[] | null) => schemaStore.setCurrentSchema(schema),
    setCurrentFlow: (flow: FlowGraph | null) => schemaStore.setCurrentFlow(flow),
    undoLastSchemaUpdate: () => schemaStore.undoLastSchemaUpdate(),
    clearDiff: () => schemaStore.clearDiff(),
    loadVersionHistory: (conversationId: string) => schemaStore.loadVersionHistory(conversationId),
    rollbackToVersion: (conversationId: string, versionId: string) => schemaStore.rollbackToVersion(conversationId, versionId),
    loadLLMProviders: () => llmStore.loadLLMProviders(),
    loadLLMStrategies: () => llmStore.loadLLMStrategies(),
    loadLLMUsage: () => llmStore.loadLLMUsage(),
    switchProvider: (provider: string) => llmStore.switchProvider(provider),
    switchStrategy: (strategy: string | null) => llmStore.switchStrategy(strategy),
    updateChatSettings: (settings: Parameters<typeof chatSettingsStore.updateChatSettings>[0]) => chatSettingsStore.updateChatSettings(settings),
    loadChatSettings: () => chatSettingsStore.chatSettings,
    searchRagAction: (query: string, limit?: number) => ragStore.searchRagAction(query, limit),
    addRagContext: (item: any) => ragStore.addRagContext(item),
    removeRagContext: (id: string) => ragStore.removeRagContext(id),
    clearRagContext: () => ragStore.clearRagContext(),
    searchConversationsAction,
    mentionSearchAction,
    clearInterrupt: () => hitlStore.clearInterrupt(),
    respondInterrupt,
    submitFeedback,
    regenerateMessage,
    confirmRequirement,
    skipRequirement,
  }
})
