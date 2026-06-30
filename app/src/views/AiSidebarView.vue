<script setup lang="ts">
/**
 * AI 侧边抽屉视图
 *
 * 400px 宽单栏布局，嵌入 Editor / Flow 内使用。
 * 对齐 docs/designs/ui/ai/sidebar.html 设计。
 *
 * 特点：
 * - 无对话列表、无预览面板
 * - Agent 可切换（支持同项目多 Agent）
 * - 有上下文条（Schema / Node 信息）
 */

import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useAiStore } from '@/stores/ai'
import { bridge } from '@/utils/bridge'
import { useQiankun } from '@schema-platform/platform-shared/qiankun'
import { message } from '@schema-platform/platform-shared/utils/message'
import { connect as connectSocket, isConnected, emitAiApply, emitAiPublished } from '@schema-platform/platform-shared/socket'
import AiMessage from '@/components/AiMessage.vue'
import type { Widget, FlowGraph } from '@/types'
import type { MessageEmbeddedCard } from '@/components/AiMessage.vue'
import AppIcon from '@schema-platform/platform-shared/components/common/AppIcon.vue'
import { Clock } from '@element-plus/icons-vue'

const store = useAiStore()

// ---- WebSocket 状态 ----
const wsConnected = ref(isConnected())

// 定期检查连接状态
let statusTimer: ReturnType<typeof setInterval> | null = null

function startStatusCheck(): void {
  statusTimer = setInterval(() => {
    wsConnected.value = isConnected()
  }, 1000)
}

// ---- History Popover ----
const historyVisible = ref(false)

async function handleSelectHistory(id: string): Promise<void> {
  try {
    await store.loadConversation(id)
    historyVisible.value = false
  } catch (err) {
    const status = (err as { status?: number }).status
    if (status === 404) {
      message.error('对话不存在或已被删除')
      store.loadConversations()
    } else {
      message.error('加载对话失败：' + (err instanceof Error ? err.message : '未知错误'))
    }
  }
}

// 上下文标签（根据宿主传入的 source 自动判断）
const contextLabel = computed(() => {
  const ctx = store.context
  if (ctx.nodeId) return 'Node'
  if (ctx.flowId) return 'Flow'
  return 'Schema'
})

const contextTag = computed(() => {
  const ctx = store.context
  if (ctx.nodeId) return ctx.nodeId
  if (ctx.flowId) return ctx.flowId
  if (ctx.schemaId) return ctx.schemaId
  return null
})

// 输入
const inputText = ref('')
const messagesRef = ref<HTMLElement>()

function scrollToBottom() {
  setTimeout(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  }, 50)
}

// 监听消息数量变化（新消息）和最后一条消息内容长度变化（流式响应）
watch(
  () => {
    const last = store.messages[store.messages.length - 1]
    return `${store.messages.length}:${last?.content?.length ?? 0}`
  },
  scrollToBottom,
)

function getDisplayCards(msg: typeof store.messages[0]): MessageEmbeddedCard[] | undefined {
  if (msg.schema) {
    return [{
      type: 'schema',
      title: '表单预览',
      fields: msg.schema.map((w) => ({
        icon: 'T',
        name: w.label ?? w.field ?? w.type,
        type: w.type,
        required: false,
      })),
      primaryAction: '应用到画布',
      secondaryAction: '继续优化',
    }]
  }
  if (msg.flow) {
    return [{
      type: 'flow',
      title: '流程预览',
      nodes: msg.flow.nodes.map((n) => ({
        label: n.data.label ?? n.data.bpmnType ?? n.id,
        type: (n.data.bpmnType === 'startEvent' ? 'start' : n.data.bpmnType === 'endEvent' ? 'end' : 'task') as 'start' | 'task' | 'end',
      })),
      primaryAction: '应用到画布',
      secondaryAction: '继续优化',
    }]
  }
  return undefined
}

function getLabel(msg: typeof store.messages[0]): string {
  if (msg.role === 'user') return 'You'
  const source = store.context.source
  if (source === 'editor') return 'Editor'
  if (source === 'flow') return 'Flow'
  return 'AI'
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    handleSend()
  }
}

async function handleSend() {
  const text = inputText.value.trim()
  if (!text || store.loading) return
  await store.sendMessage(text)
  inputText.value = ''
}

function handleStop(): void {
  store.stopGeneration()
}

function handleCardAction(type: 'primary' | 'secondary') {
  if (type === 'primary') {
    handleApply()
  } else {
    handleOpenInEditor()
  }
}

async function handleOpenInEditor(): Promise<void> {
  try {
    const result = await store.publishCurrent()
    if (!result) {
      message.warning('没有可发布的内容')
      return
    }

    const payload = {
      schema: store.currentSchema,
      flow: store.currentFlow,
      id: result.id,
      type: result.type,
    }

    emitAiApply({
      type: result.type,
      payload: (result.type === 'schema' ? store.currentSchema : store.currentFlow)!,
      conversationId: store.currentConversationId ?? undefined,
    })
    bridge.send('ai:open-in-editor', payload)
  } catch {
    message.error('发布失败，请稍后重试')
  }
}

async function handleApply() {
  const isSchema = !!store.currentSchema
  const type = isSchema ? 'schema' : 'flow'

  try {
    // 通过 Socket 推送到宿主
    emitAiApply({
      type,
      payload: (isSchema ? store.currentSchema : store.currentFlow)!,
      conversationId: store.currentConversationId ?? undefined,
    })

    // 同时发布到服务端
    const result = await store.publishCurrent()
    if (result) {
      message.success(isSchema ? '表单已应用到画布并发布成功' : '流程已应用到画布并发布成功')
      if (result.publishId) {
        emitAiPublished({
          type: result.type,
          id: result.id,
          publishId: result.publishId,
          conversationId: store.currentConversationId ?? undefined,
        })
      }
      bridge.send('ai:published', {
        id: result.id,
        publishId: result.publishId,
        type: result.type,
      })
    } else {
      message.warning('没有可发布的内容')
    }
  } catch {
    message.error('应用失败，请稍后重试')
  }
}

onMounted(() => {
  // 连接 Socket
  connectSocket()
  startStatusCheck()

  // 监听宿主上下文（standalone 模式 postMessage）
  bridge.on('ai:set-context', (payload) => {
    store.setContext(payload)
  })

  bridge.on('ai:current-schema', (payload) => {
    store.setCurrentSchema(payload)
  })

  bridge.on('ai:current-flow', (payload) => {
    store.setCurrentFlow(payload)
  })

  // qiankun 模式：从全局状态读取初始数据
  if (window.__POWERED_BY_QIANKUN__) {
    const { getGlobalState, onGlobalStateChange } = useQiankun()
    const state = getGlobalState()
    if (Object.keys(state).length > 0) {
      handleHostData(state)
    }
    onGlobalStateChange((newState) => {
      handleHostData(newState)
    })
  }
})

onUnmounted(() => {
  if (statusTimer) {
    clearInterval(statusTimer)
    statusTimer = null
  }
})

function handleHostData(data: Record<string, unknown>) {
  if (data.source) {
    store.setContext({ source: data.source as 'editor' | 'flow' | 'standalone' })
  }
  if (data.currentSchema && Array.isArray(data.currentSchema)) {
    store.setCurrentSchema(data.currentSchema as Widget[])
  }
  if (data.currentFlow && typeof data.currentFlow === 'object') {
    store.setCurrentFlow(data.currentFlow as FlowGraph)
  }
  if (data.schemaId) {
    store.setContext({ schemaId: data.schemaId as string })
  }
  if (data.flowId) {
    store.setContext({ flowId: data.flowId as string })
  }
  if (data.nodeId) {
    store.setContext({ nodeId: data.nodeId as string })
  }
  if (data.version) {
    store.setContext({ version: data.version as string })
  }
  if (data.selectedWidget && typeof data.selectedWidget === 'object') {
    store.setContext({ selectedWidget: data.selectedWidget as import('@/types').SelectedWidgetInfo })
  }
  if (data.editorMode && (data.editorMode === 'edit' || data.editorMode === 'preview')) {
    store.setContext({ editorMode: data.editorMode as 'edit' | 'preview' })
  }
}
</script>

<template>
  <div :class="$style.panel">
    <!-- Header -->
    <div :class="$style.header">
      <div :class="$style.headerLeft">
        <div :class="$style.headerIcon">AI</div>
        <span :class="$style.headerTitle">智能助手</span>
        <el-popover
          v-model:visible="historyVisible"
          placement="bottom-start"
          :width="320"
          trigger="click"
          :show-arrow="false"
          :offset="4"
          :popper-style="{ padding: '0' }"
          @show="store.loadConversations()"
        >
          <template #reference>
            <el-button
              :class="$style.historyBtn"
              title="历史记录"
              link
            >
              <el-icon :size="14"><Clock /></el-icon>
            </el-button>
          </template>
          <div :class="$style.historyPopover">
            <div :class="$style.historyPopoverHeader">对话历史</div>
            <div :class="$style.historyList">
              <div
                v-for="conv in store.conversations"
                :key="conv.id"
                :class="[$style.historyItem, { [$style.historyActive]: conv.id === store.currentConversationId }]"
                @click="handleSelectHistory(conv.id)"
              >
                <div :class="$style.historyTitle">{{ conv.title }}</div>
                <div :class="$style.historyMeta">
                  <span :class="$style.historyAgent">{{ conv.activeAgent }}</span>
                  <span :class="$style.historyTime">{{ new Date(conv.updatedAt).toLocaleString('zh-CN') }}</span>
                </div>
              </div>
              <div v-if="store.conversations.length === 0" :class="$style.historyEmpty">
                暂无对话记录
              </div>
            </div>
          </div>
        </el-popover>
        <el-button
          :class="$style.historyBtn"
          title="新对话"
          link
          @click="store.clearConversation()"
        >
          <AppIcon name="plus" :size="14" />
        </el-button>
      </div>
      <div :class="$style.headerRight">
        <!-- WebSocket 状态 -->
        <div :class="[$style.wsStatus, wsConnected ? $style.wsConnected : $style.wsDisconnected]">
          <span :class="$style.wsDot" />
          <span>{{ wsConnected ? '已连接' : '未连接' }}</span>
        </div>
        <div :class="$style.modelBadge">
          <span :class="$style.modelDot"></span>
          <span>DeepSeek</span>
        </div>
      </div>
    </div>

    <!-- Context bar -->
    <div v-if="contextTag" :class="$style.contextBar">
      <span>{{ contextLabel }}:</span>
      <span :class="$style.contextTag">{{ contextTag }}</span>
    </div>

    <!-- Messages -->
    <div ref="messagesRef" :class="$style.messages">
      <!-- Empty state -->
      <div v-if="store.messages.length === 0 && !store.loading" :class="$style.emptyState">
        <div :class="$style.emptyIcon">&#x2726;</div>
        <div :class="$style.emptyTitle">描述你想生成的内容</div>
        <div :class="$style.emptySub">表单、列表页、页面...</div>
      </div>

      <!-- Message list -->
      <AiMessage
        v-for="(msg, idx) in store.messages"
        :key="`${idx}-${msg.content?.length ?? 0}-${msg.toolCalls?.length ?? 0}`"
        :role="msg.role === 'system' ? 'assistant' : msg.role"
        :label="getLabel(msg)"
        :content="msg.content"
        :thinking="msg.thinking"
        :tip="msg.tip"
        :tool-calls="msg.toolCalls"
        :loading="store.loading && msg.role === 'assistant' && !msg.content && idx === store.messages.length - 1"
        :cards="getDisplayCards(msg)"
        :schema-widgets="msg.schema"
        @card-primary-action="handleCardAction('primary')"
        @card-secondary-action="handleCardAction('secondary')"
        @retry-tool="(tci) => store.retryToolCall(idx, tci)"
        @requirement-confirm="(answers) => store.confirmRequirement(answers)"
        @requirement-skip="store.skipRequirement()"
      />
    </div>

    <!-- Floating Input Panel -->
    <div :class="$style.inputArea">
      <div :class="[$style.inputBox, { [$style.inputDisabled]: store.loading }]">
        <textarea
          v-model="inputText"
          :class="$style.inputField"
          :placeholder="store.messages.length === 0 ? '描述你想要生成的内容...' : '继续描述...'"
          :disabled="store.loading"
          rows="1"
          @keydown="handleKeydown"
        />
        <div :class="$style.inputFooter">
          <div :class="$style.inputHint">
            <template v-if="store.loading">
              <span :class="$style.runningIndicator">
                <span :class="$style.runningDot"></span>
                <span :class="$style.runningDot"></span>
                <span :class="$style.runningDot"></span>
                运行中...
              </span>
            </template>
            <template v-else>
              <kbd>Enter</kbd>&nbsp;发送&nbsp;&middot;&nbsp;<kbd>Shift+Enter</kbd>&nbsp;换行
            </template>
          </div>
          <div :class="$style.inputActions">
            <el-tooltip v-if="store.loading" content="停止生成" placement="top">
              <el-button
                :class="$style.stopBtn"
                type="danger"
                link
                @click="handleStop"
              >
                <AppIcon name="video-pause" :size="14" />
              </el-button>
            </el-tooltip>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style module src="./AiSidebarView.module.scss" />
