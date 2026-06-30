<script setup lang="ts">
import { ref, nextTick, watch, computed } from 'vue'
import { message } from '@schema-platform/platform-shared/utils/message'
import AiMessage from './AiMessage.vue'
import TaskChainBar from './TaskChainBar.vue'
import AiRagSearch from './AiRagSearch.vue'
import AiMentionInput from './AiMentionInput.vue'
import { uploadFile } from '@/api/aiApi'
import type { AIMessage, AgentType, Attachment, TaskChainStep, StreamConnectionStatus, MentionReference, RagSearchResult } from '@/types'
import type { MessageEmbeddedCard } from './AiMessage.vue'

export interface AiChatPanelProps {
  title: string
  agent: AgentType
  messages: AIMessage[]
  loading?: boolean
  disabled?: boolean
  agentOptions?: Array<{ value: AgentType; label: string }>
  taskChain?: TaskChainStep[]
  taskChainIndex?: number
  /** 流式连接状态 */
  streamStatus?: StreamConnectionStatus
  /** @deprecated 使用 streamStatus 替代 */
  sseStatus?: StreamConnectionStatus
  /** 当前自动重试次数 */
  retryCount?: number
  /** 最大自动重试次数 */
  maxRetries?: number
  /** RAG 搜索结果 */
  ragSearchResults?: RagSearchResult[]
  /** RAG 搜索中 */
  ragSearching?: boolean
  /** 已选中的 RAG context */
  ragContext?: RagSearchResult[]
}

const props = withDefaults(defineProps<AiChatPanelProps>(), {
  agentOptions: () => [
    { value: 'auto', label: 'Auto' },
    { value: 'editor', label: 'Editor' },
    { value: 'flow', label: 'Flow' },
  ],
  streamStatus: 'idle',
  sseStatus: 'idle',
  retryCount: 0,
  maxRetries: 3,
  ragSearchResults: () => [],
  ragSearching: false,
  ragContext: () => [],
})

const emit = defineEmits<{
  send: [message: string, agent: AgentType, mentions?: MentionReference[]]
  stop: []
  retry: []
  'clear-messages': []
  'card-primary-action': [messageIndex: number, cardIndex: number]
  'card-secondary-action': [messageIndex: number, cardIndex: number]
  'open-settings': []
  'rag-search': [query: string]
  'rag-select': [item: RagSearchResult]
  'rag-remove': [id: string]
  'open-json-drawer': []
  'retry-tool': [messageIndex: number, toolCallIndex: number]
  'copy-message': [messageIndex: number]
  'regenerate-message': [messageIndex: number]
  'message-feedback': [messageIndex: number, type: 'positive' | 'negative']
}>()

const selectedAgent = ref<AgentType>('auto')
const messagesRef = ref<HTMLElement>()
const mentionInputRef = ref<InstanceType<typeof AiMentionInput>>()
const ragVisible = ref(false)

// 向后兼容：优先使用 streamStatus，fallback 到 sseStatus
const currentStreamStatus = computed(() => props.streamStatus ?? props.sseStatus ?? 'idle')

// ---- 多模态输入 ----
const fileInputRef = ref<HTMLInputElement>()
const fileUploading = ref(false)
const pendingAttachments = ref<Attachment[]>([])

const ALLOWED_FILE_TYPES = [
  'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]

function triggerFileUpload(): void {
  fileInputRef.value?.click()
}

function handleFileChange(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file) {
    processFile(file)
  }
  input.value = ''
}

async function processFile(file: File): Promise<void> {
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    message.error('支持的格式：PNG、JPG、GIF、WebP、PDF、DOC、DOCX、TXT')
    return
  }

  if (file.size > 10 * 1024 * 1024) {
    message.error('文件大小不能超过 10MB')
    return
  }

  const attachment: Attachment = {
    filename: file.name,
    mimetype: file.type,
    size: file.size,
    text: '',
    status: 'uploading',
  }
  pendingAttachments.value.push(attachment)
  const index = pendingAttachments.value.length - 1

  try {
    const result = await uploadFile(file)
    pendingAttachments.value[index] = {
      ...result,
      status: 'done',
    }
    message.success(`"${file.name}" 上传成功`)
  } catch (err) {
    pendingAttachments.value[index] = {
      ...attachment,
      status: 'error',
      error: err instanceof Error ? err.message : '上传失败',
    }
    message.error(`上传失败: ${err instanceof Error ? err.message : '未知错误'}`)
  } finally {
    nextTick(() => mentionInputRef.value?.focus())
  }
}

function removeAttachment(index: number): void {
  pendingAttachments.value.splice(index, 1)
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getFileIcon(mimetype: string): string {
  if (mimetype.startsWith('image/')) return '\u{1F5BC}'
  if (mimetype === 'application/pdf') return '\u{1F4D5}'
  if (mimetype.includes('word') || mimetype.includes('document')) return '\u{1F4D3}'
  return '\u{1F4C4}'
}

/** F3: 空状态引导 prompt 列表 */
const starterPrompts = [
  { icon: '&#x1F4DD;', text: '帮我生成一个用户注册表单', agent: 'editor' as AgentType },
  { icon: '&#x1F4CB;', text: '创建一个订单审批流程', agent: 'flow' as AgentType },
  { icon: '&#x1F50D;', text: '搜索已有的表单模板', agent: 'auto' as AgentType },
  { icon: '&#x2699;', text: '设计一个系统配置页面', agent: 'editor' as AgentType },
]

/** Transform store AIMessage into display-oriented props for AiMessage component */
function getDisplayCards(msg: AIMessage): MessageEmbeddedCard[] | undefined {
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
      primaryAction: '确认发布',
      secondaryAction: '在编辑器中打开',
    }]
  }
  if (msg.flow) {
    return [{
      type: 'flow' as const,
      title: '流程预览',
      nodes: msg.flow.nodes.map((n) => ({
        label: n.data.label ?? n.data.bpmnType ?? n.id,
        type: (n.data.bpmnType === 'startEvent' ? 'start' : n.data.bpmnType === 'endEvent' ? 'end' : 'task') as 'start' | 'task' | 'end',
      })),
      graph: msg.flow,
      primaryAction: '确认发布',
      secondaryAction: '在编辑器中打开',
    }]
  }
  return undefined
}

function getLabel(msg: AIMessage): string {
  if (msg.role === 'user') return 'You'
  if (msg.agent) {
    const labels: Record<string, string> = {
      editor: 'Editor',
      flow: 'Flow',
      general: 'AI',
    }
    return labels[msg.agent] ?? 'AI'
  }
  if (props.agent === 'auto') return 'AI'
  return props.agent === 'editor' ? 'Editor' : 'Flow'
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

// 监听消息数量变化（新消息）和最后一条消息内容长度变化（流式响应）
watch(
  () => {
    const last = props.messages[props.messages.length - 1]
    return `${props.messages.length}:${last?.content?.length ?? 0}`
  },
  scrollToBottom,
)

function handleMentionSend(text: string, mentions?: MentionReference[]): void {
  // 允许只发送附件（无文本）
  if ((!text && pendingAttachments.value.length === 0) || props.disabled) return

  // 构建包含附件上下文的消息
  let messageContent = text
  if (pendingAttachments.value.length > 0) {
    const attachmentTexts = pendingAttachments.value
      .filter((a) => a.text && a.status === 'done')
      .map((a) => `[附件: ${a.filename}]\n${a.text}`)
      .join('\n\n')
    if (attachmentTexts) {
      messageContent = text
        ? `${attachmentTexts}\n\n${text}`
        : attachmentTexts
    }
  }

  emit('send', messageContent, selectedAgent.value, mentions)
  pendingAttachments.value = []
}

function handleCardAction(
  type: 'primary' | 'secondary',
  msgIdx: number,
  cardIdx: number,
) {
  if (type === 'primary') {
    emit('card-primary-action', msgIdx, cardIdx)
  } else {
    emit('card-secondary-action', msgIdx, cardIdx)
  }
}
</script>

<template>
  <div :class="$style.chat">
    <!-- Header -->
    <div :class="$style.header">
      <div :class="$style.headerLeft">
        <span :class="$style.title">{{ title }}</span>
        <span :class="[$style.roleBadge, $style[agent]]">
          {{ agent === 'auto' ? 'Auto' : agent === 'editor' ? 'Editor' : 'Flow' }}
        </span>
        <!-- 流式连接状态指示器 -->
        <span
          v-if="currentStreamStatus === 'connecting'"
          :class="[$style.connStatus, $style.connConnecting]"
        >
          <span :class="$style.connDot" />
          连接中
        </span>
        <span
          v-else-if="currentStreamStatus === 'reconnecting'"
          :class="[$style.connStatus, $style.connReconnecting]"
        >
          <span :class="$style.connDot" />
          重连中 {{ retryCount }}/{{ maxRetries }}
        </span>
        <span
          v-else-if="currentStreamStatus === 'disconnected'"
          :class="[$style.connStatus, $style.connDisconnected]"
        >
          <span :class="$style.connDot" />
          已断开
        </span>
      </div>
      <div :class="$style.headerActions">
        <el-tooltip content="对话设置" placement="bottom" :show-after="300">
          <el-button
            :class="$style.actionBtn"
            link
            @click="emit('open-settings')"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </el-button>
        </el-tooltip>
        <el-tooltip content="清空对话" placement="bottom" :show-after="300">
          <el-button
            :class="$style.actionBtn"
            link
            @click="emit('clear-messages')"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </el-button>
        </el-tooltip>
      </div>
    </div>

    <!-- Task Chain Bar -->
    <TaskChainBar
      v-if="taskChain && taskChain.length > 1"
      :steps="taskChain"
      :current-index="taskChainIndex ?? 0"
    />

    <!-- Messages -->
    <div ref="messagesRef" :class="$style.messages">
      <!-- Empty state with starter prompts -->
      <div v-if="messages.length === 0 && !loading" :class="$style.emptyState">
        <div :class="$style.emptyIcon">&#x2726;</div>
        <div :class="$style.emptyTitle">开始一段新对话</div>
        <div :class="$style.emptySub">描述你想生成的表单、页面或流程</div>
        <div :class="$style.promptGrid">
          <el-button
            v-for="(prompt, idx) in starterPrompts"
            :key="idx"
            :class="$style.promptCard"
            @click="selectedAgent = prompt.agent; emit('send', prompt.text, prompt.agent)"
          >
            <span :class="$style.promptIcon" v-html="prompt.icon" />
            <span :class="$style.promptText">{{ prompt.text }}</span>
          </el-button>
        </div>
      </div>

      <!-- Message list -->
      <AiMessage
        v-for="(msg, idx) in messages"
        :key="idx"
        :role="msg.role === 'system' ? 'assistant' : msg.role"
        :label="getLabel(msg)"
        :agent="agent"
        :content="msg.content"
        :thinking="msg.thinking"
        :tip="msg.tip"
        :tool-calls="msg.toolCalls"
        :loading="loading && msg.role === 'assistant' && !msg.content && idx === messages.length - 1"
        :cards="getDisplayCards(msg)"
        :schema-widgets="msg.schema"
        :message-id="msg.id"
        :feedback="msg.feedback"
        @card-primary-action="(ci) => handleCardAction('primary', idx, ci)"
        @card-secondary-action="(ci) => handleCardAction('secondary', idx, ci)"
        @open-json-drawer="emit('open-json-drawer')"
        @retry-tool="(tci) => emit('retry-tool', idx, tci)"
        @copy="emit('copy-message', idx)"
        @regenerate="emit('regenerate-message', idx)"
        @feedback="(type) => emit('message-feedback', idx, type)"
      />
    </div>

    <!-- Retry Banner (Stream disconnected) -->
    <div v-if="currentStreamStatus === 'disconnected'" :class="$style.retryBanner">
      <span :class="$style.retryBannerText">连接已断开，请重新发送</span>
      <el-button :class="$style.retryBannerBtn" @click="emit('retry')">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
        重试
      </el-button>
    </div>

    <!-- Floating Input Panel -->
    <div :class="$style.inputArea">
      <!-- RAG Search Panel -->
      <AiRagSearch
        v-if="ragVisible"
        :search-results="ragSearchResults"
        :selected-context="ragContext"
        :loading="ragSearching"
        @search="(q) => emit('rag-search', q)"
        @select="(item) => emit('rag-select', item)"
        @remove="(id) => emit('rag-remove', id)"
        @close="ragVisible = false"
      />
      <div :class="[$style.inputBox, { [$style.inputDisabled]: disabled }]">
        <!-- 附件预览 -->
        <div v-if="pendingAttachments.length > 0" :class="$style.attachmentList">
          <div
            v-for="(att, idx) in pendingAttachments"
            :key="idx"
            :class="[$style.attachmentItem, { [$style.attachmentError]: att.status === 'error' }]"
          >
            <span :class="$style.attachmentIcon">{{ getFileIcon(att.mimetype) }}</span>
            <div :class="$style.attachmentInfo">
              <span :class="$style.attachmentName">{{ att.filename }}</span>
              <span :class="$style.attachmentSize">{{ formatFileSize(att.size) }}</span>
            </div>
            <span v-if="att.status === 'uploading'" :class="$style.attachmentLoading" />
            <span v-else-if="att.status === 'error'" :class="$style.attachmentErrorText">
              {{ att.error ?? '失败' }}
            </span>
            <el-button
              :class="$style.attachmentRemove"
              title="移除"
              link
              @click="removeAttachment(idx)"
            >
              &times;
            </el-button>
          </div>
        </div>

        <AiMentionInput
          ref="mentionInputRef"
          :disabled="disabled"
          :loading="loading"
          :placeholder="messages.length === 0 ? '描述你想要生成的内容...' : '继续描述...'"
          @send="handleMentionSend"
        />
        <div :class="$style.inputFooter">
          <div :class="$style.inputHint">
            <template v-if="loading">
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
            <!-- RAG context indicator -->
            <span
              v-if="ragContext.length > 0"
              :class="$style.ragIndicator"
              :title="`已引用 ${ragContext.length} 个 Schema`"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
              </svg>
              <span :class="$style.ragCount">{{ ragContext.length }}</span>
            </span>
            <!-- RAG search toggle button -->
            <el-tooltip content="引用 Schema（智能匹配）" placement="top">
              <el-button
                :class="[$style.ragBtn, { [$style.ragBtnActive]: ragVisible }]"
                :disabled="disabled || loading"
                link
                @click="ragVisible = !ragVisible"
              >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
              </el-button>
            </el-tooltip>
            <!-- Hidden file input -->
            <input
              ref="fileInputRef"
              type="file"
              :accept="ALLOWED_FILE_TYPES.join(',')"
              :class="$style.hiddenInput"
              @change="handleFileChange"
            />
            <!-- File upload button -->
            <el-tooltip content="上传文件（图片/PDF/文档）" placement="top">
              <el-button
                :class="$style.fileBtn"
                :disabled="disabled || loading || fileUploading"
                link
                @click="triggerFileUpload"
              >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
              </svg>
              </el-button>
            </el-tooltip>
            <el-select
              v-model="selectedAgent"
              :class="$style.agentSelect"
              :disabled="disabled || loading"
              size="small"
            >
              <el-option
                v-for="opt in agentOptions"
                :key="opt.value"
                :label="opt.label"
                :value="opt.value"
              />
            </el-select>
            <el-tooltip v-if="loading" content="停止生成" placement="top">
              <el-button
                :class="$style.stopBtn"
                link
                @click="emit('stop')"
              >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
              </el-button>
            </el-tooltip>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style module src="./AiChatPanel.module.scss" />
