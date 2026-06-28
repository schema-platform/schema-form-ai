<script setup lang="ts">
/**
 * AI 对话主页面
 *
 * 单栏布局：聊天区(100%)
 * 简洁设计，专注于对话体验。
 */

import { ref, onMounted, onUnmounted, computed } from 'vue'
import { useAiStore } from '@/stores/ai'
import { bridge } from '@/utils/bridge'
import type { AgentType, ChatSettings, MentionReference, RagSearchResult } from '@/types'
import { storeToRefs } from 'pinia'
import { message } from '@schema-platform/platform-shared/utils/message'
import { HomeFilled, Plus, Clock } from '@element-plus/icons-vue'
import { getAppUrl } from '@schema-platform/platform-shared/qiankun/config'
import { connect as connectSocket, isConnected } from '@schema-platform/platform-shared/socket'
import AiChatPanel from '@/components/AiChatPanel.vue'
import AiChatSettings from '@/components/AiChatSettings.vue'
import ConversationDrawer from '@/components/ConversationDrawer.vue'

const store = useAiStore()
const { messages, loading, currentSchema, currentFlow, activeAgent, conversations, currentConversationId, taskChain, taskChainIndex, streamStatus, retryCount, MAX_AUTO_RETRIES, chatSettings, ragSearchResults, ragSearching, ragContext } =
  storeToRefs(store)

// ---- WebSocket 连接状态 ----
const wsConnected = ref(isConnected())
let statusTimer: ReturnType<typeof setInterval> | null = null

function startStatusCheck(): void {
  statusTimer = setInterval(() => {
    wsConnected.value = isConnected()
  }, 1000)
}

// ---- 防止发布按钮重复调用 ----
const isPublishing = ref(false)

// ---- 对话历史抽屉 ----
const conversationDrawerVisible = ref(false)

function handleOpenConversationDrawer(): void {
  conversationDrawerVisible.value = true
}

function handleSelectConversation(id: string): void {
  store.loadConversation(id)
  conversationDrawerVisible.value = false
}

function handleDeleteConversation(id: string): void {
  store.removeConversation(id)
}

// ---- Settings dialog ----
const settingsVisible = ref(false)

function handleOpenSettings(): void {
  settingsVisible.value = true
}

function handleUpdateSettingsVisible(val: boolean): void {
  settingsVisible.value = val
}

function handleSaveSettings(settings: ChatSettings): void {
  store.updateChatSettings(settings)
}

// ---- 新对话按钮文案 ----
const newConversationLabel = computed(() => {
  if (!currentConversationId.value) {
    return '新对话'
  }
  const currentConv = conversations.value.find(c => c.id === currentConversationId.value)
  if (!currentConv || !currentConv.title || currentConv.title === '新对话') {
    return '新对话'
  }
  // 截断标题
  const title = currentConv.title
  return title.length > 8 ? title.slice(0, 8) + '...' : title
})

// ---- Event handlers ----

async function handleSend(msg: string, agent: AgentType, mentions?: MentionReference[]): Promise<void> {
  if (agent !== activeAgent.value) {
    store.switchAgent(agent)
  }
  await store.sendMessage(msg, mentions)
}

function handleStop(): void {
  store.stopGeneration()
}

function handleRetry(): void {
  store.retryLastMessage()
}

function handleNewConversation(): void {
  store.clearConversation()
}

function handleClearMessages(): void {
  store.clearConversation()
}

function handlePrimaryAction(): void {
  handlePublish()
}

async function handleSecondaryAction(): Promise<void> {
  if (isPublishing.value) return
  isPublishing.value = true
  try {
    const result = await store.publishCurrent()
    if (!result) {
      message.warning('没有可发布的内容')
      return
    }

    // qiankun 嵌入模式：通过 bridge 通知宿主
    if (window.__POWERED_BY_QIANKUN__) {
      bridge.send('ai:open-in-editor', {
        schema: currentSchema.value,
        flow: currentFlow.value,
        id: result.id,
        type: result.type,
      })
      return
    }

    // standalone 模式：先发布再跳转到对应编辑器
    const url = result.type === 'flow'
      ? `/flow/?id=${result.id}`
      : `/editor/?id=${result.id}`
    window.open(url, '_blank')
  } catch {
    message.error('发布失败，请稍后重试')
  } finally {
    isPublishing.value = false
  }
}

async function handlePublish(): Promise<void> {
  if (isPublishing.value) return
  isPublishing.value = true
  try {
    const result = await store.publishCurrent()
    if (result) {
      message.success(result.type === 'schema' ? '表单发布成功' : '流程发布成功')
      bridge.send('ai:published', {
        id: result.id,
        publishId: result.publishId,
        type: result.type,
      })
    } else {
      message.warning('没有可发布的内容')
    }
  } catch {
    message.error('发布失败，请稍后重试')
  } finally {
    isPublishing.value = false
  }
}

// ---- RAG ----

function handleRagSearch(query: string): void {
  store.searchRagAction(query).catch(() => {
    message.error('RAG 搜索失败，请稍后重试')
  })
}

function handleRagSelect(item: RagSearchResult): void {
  store.addRagContext(item)
}

function handleRagRemove(id: string): void {
  store.removeRagContext(id)
}

function goToPortal(): void {
  window.location.href = getAppUrl('shell', import.meta.env.DEV)
}

// ---- Message actions ----

function handleCopyMessage(messageIndex: number): void {
  const msg = messages.value[messageIndex]
  if (msg?.content) {
    navigator.clipboard.writeText(msg.content)
    message.success('已复制到剪贴板')
  }
}

function handleRegenerateMessage(messageIndex: number): void {
  store.regenerateMessage(messageIndex)
}

function handleMessageFeedback(messageIndex: number, type: 'positive' | 'negative'): void {
  store.submitFeedback(messageIndex, type)
}

// ---- Bridge ----

onMounted(() => {
  store.loadConversations()
  connectSocket({ path: import.meta.env.PROD ? '/schema-platform/ws' : '/ws' })
  startStatusCheck()

  bridge.on('ai:set-context', (payload) => {
    store.setContext(payload)
  })

  bridge.on('ai:current-schema', (payload) => {
    store.setCurrentSchema(payload)
  })
})

onUnmounted(() => {
  if (statusTimer) {
    clearInterval(statusTimer)
    statusTimer = null
  }
})
</script>

<template>
  <div :class="$style.page">
    <!-- 顶栏 -->
    <div :class="$style.topbar">
      <div :class="$style.topbarLeft">
        <el-tooltip content="返回主应用首页" placement="bottom">
          <button :class="$style.homeBtn" title="返回主应用" @click="goToPortal">
            <el-icon :size="14"><HomeFilled /></el-icon>
          </button>
        </el-tooltip>
        <div :class="$style.topbarDivider" />
        <div :class="$style.topbarLogo">
          <div :class="$style.topbarIcon">AI</div>
          <span :class="$style.topbarBrand">智能助手</span>
        </div>
      </div>
      <div :class="$style.topbarRight">
        <div :class="[$style.wsStatus, wsConnected ? $style.wsConnected : $style.wsDisconnected]">
          <span :class="$style.wsDot" />
          <span>{{ wsConnected ? '已连接' : '未连接' }}</span>
        </div>
        <div :class="$style.modelBadge">
          <span :class="$style.modelDot"></span>
          <span :class="$style.modelName">DeepSeek</span>
        </div>
        <el-tooltip content="对话历史" placement="bottom">
          <el-button :class="$style.iconBtn" @click="handleOpenConversationDrawer">
            <el-icon :size="16"><Clock /></el-icon>
          </el-button>
        </el-tooltip>
        <el-button type="primary" size="small" @click="handleNewConversation">
          <el-icon :size="14"><Plus /></el-icon>
          {{ newConversationLabel }}
        </el-button>
      </div>
    </div>

    <!-- 聊天区 -->
    <div :class="$style.chatContainer">
      <AiChatPanel
        :title="conversations.find((c) => c.id === currentConversationId)?.title ?? '新对话'"
        :agent="activeAgent"
        :messages="messages"
        :loading="loading"
        :task-chain="taskChain"
        :task-chain-index="taskChainIndex"
        :stream-status="streamStatus"
        :retry-count="retryCount"
        :max-retries="MAX_AUTO_RETRIES"
        :rag-search-results="ragSearchResults"
        :rag-searching="ragSearching"
        :rag-context="ragContext"
        @send="handleSend"
        @stop="handleStop"
        @retry="handleRetry"
        @clear-messages="handleClearMessages"
        @card-primary-action="handlePrimaryAction"
        @card-secondary-action="handleSecondaryAction"
        @open-settings="handleOpenSettings"
        @rag-search="handleRagSearch"
        @rag-select="handleRagSelect"
        @rag-remove="handleRagRemove"
        @retry-tool="(mi, tci) => store.retryToolCall(mi, tci)"
        @copy-message="handleCopyMessage"
        @regenerate-message="handleRegenerateMessage"
        @message-feedback="handleMessageFeedback"
      />
    </div>

    <!-- 对话历史抽屉 -->
    <ConversationDrawer
      v-model:visible="conversationDrawerVisible"
      :conversations="conversations"
      :active-id="currentConversationId ?? undefined"
      @select="handleSelectConversation"
      @delete="handleDeleteConversation"
      @new-conversation="handleNewConversation"
    />

    <!-- Settings Dialog -->
    <AiChatSettings
      :visible="settingsVisible"
      :settings="chatSettings"
      @update:visible="handleUpdateSettingsVisible"
      @update:settings="handleSaveSettings"
    />
  </div>
</template>

<style module src="./AiChatView.module.css" />
