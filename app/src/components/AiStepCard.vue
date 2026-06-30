<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { StepType, StepStatus } from '@/types'
import AppIcon from '@schema-platform/platform-shared/components/common/AppIcon.vue'

export interface AiStepCardProps {
  /** 步骤序号（从 1 开始） */
  index: number
  /** 步骤类型 */
  type: StepType
  /** 步骤标题 */
  title: string
  /** 步骤内容（thinking / text / tool 结果文本） */
  content?: string
  /** 步骤状态 */
  status?: StepStatus
  /** 工具名称（tool_call / tool_error） */
  toolName?: string
  /** 工具显示名称 */
  toolDisplayName?: string
  /** 工具调用结果 */
  toolResult?: unknown
  /** 工具调用参数 */
  toolArguments?: Record<string, unknown>
  /** 错误信息 */
  error?: string
  /** 工具调用在 toolCalls 数组中的索引（用于重试） */
  toolCallIndex?: number
  /** 嵌入卡片类型 */
  cardType?: 'schema' | 'flow'
  /** 嵌入卡片标题 */
  cardTitle?: string
  /** 主操作按钮文本 */
  primaryAction?: string
  /** 次操作按钮文本 */
  secondaryAction?: string
  /** 是否是最后一个步骤（隐藏连接线） */
  isLast?: boolean
  /** 步骤时间戳 */
  timestamp?: Date
  /** 智能体类型 */
  agent?: 'editor' | 'flow' | 'page' | 'auto' | 'general'
}

const props = withDefaults(defineProps<AiStepCardProps>(), {
  status: 'done',
  isLast: false,
})

defineEmits<{
  'primary-action': []
  'secondary-action': []
  'retry-tool': []
}>()

const SEARCH_TOOL_NAMES = new Set([
  'search_schemas', 'search_published_schemas', 'fuzzy_search_schemas',
  'search_flows', 'search_users', 'get_widget_catalogue',
  'query_widgets', 'search_industry_templates',
])

/** 错误类型到用户友好描述的映射 */
const ERROR_DESCRIPTION_MAP: Record<string, string> = {
  'timeout': '服务响应超时，请稍后重试',
  'database': '数据库操作失败，请稍后重试',
  'validation': '数据校验失败，请检查输入内容',
  'network': '网络连接异常，请检查网络后重试',
  'permission': '权限不足，无法执行此操作',
  'not_found': '请求的资源不存在',
  'conflict': '数据冲突，请刷新后重试',
  'rate_limit': '请求过于频繁，请稍后重试',
}

/** 根据错误信息返回用户友好的描述 */
const friendlyErrorDescription = computed(() => {
  const raw = props.error ?? ''
  const lower = raw.toLowerCase()
  for (const [keyword, description] of Object.entries(ERROR_DESCRIPTION_MAP)) {
    if (lower.includes(keyword)) return description
  }
  return raw || '工具执行失败，请重试'
})

const agentLabels: Record<string, string> = {
  editor: 'Editor 专家',
  flow: 'Flow 专家',
  page: 'Page 专家',
  general: '通用助手',
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// 默认展开逻辑：
// - thinking: 运行中展开，完成后折叠
// - tool_error: 始终展开（便于用户看到错误）
// - tool_call: 运行中展开，完成后折叠
// - 其他: 折叠
const collapsed = ref(true)
watch(() => [props.type, props.status], () => {
  if (props.type === 'tool_error') collapsed.value = false
  else if (props.status === 'running') collapsed.value = false
  else collapsed.value = true
}, { immediate: true })
const jsonCollapsed = ref(false)

const hasHeader = computed(() =>
  props.type === 'thinking' || props.type === 'tool_call' || props.type === 'tool_error',
)

/** 思考内容摘要（折叠时显示） */
const thinkingSummary = computed(() => {
  if (props.type !== 'thinking' || !props.content) return ''
  const text = props.content.replace(/<[^>]*>/g, '').trim()
  return text.length > 100 ? text.slice(0, 100) + '...' : text
})

const isRunning = computed(() => props.status === 'running')
const isError = computed(() => props.status === 'error' || props.type === 'tool_error')
const isDone = computed(() => props.status === 'done' && !isError.value)

const renderedContent = computed(() => {
  if (!props.content) return ''
  const rawHtml = marked.parse(props.content, { breaks: true }) as string
  return DOMPurify.sanitize(rawHtml)
})

const hasToolDetails = computed(() =>
  (props.type === 'tool_call' || props.type === 'tool_error') &&
  props.toolArguments && Object.keys(props.toolArguments).length > 0,
)

const hasToolResult = computed(() =>
  props.type === 'tool_call' && props.toolResult !== undefined,
)

/**
 * 将 toolResult 规范化为对象。
 * rag_search 等工具返回 JSON.stringify(result)，存入 MongoDB 后仍是字符串，
 * 历史回显时需要先解析。
 */
function normalizeToolResult(raw: unknown): Record<string, unknown> | null {
  if (!raw) return null
  if (typeof raw === 'object') return raw as Record<string, unknown>
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    } catch { /* not JSON */ }
  }
  return null
}

/** 解析后的 toolResult，历史回显时从 JSON 字符串还原为对象 */
const parsedToolResult = computed(() => normalizeToolResult(props.toolResult))

const toolResultSummary = computed(() => {
  const r = parsedToolResult.value
  if (!r) return null
  return typeof r.summary === 'string' ? r.summary : null
})

const compactResult = computed(() => {
  const r = parsedToolResult.value
  if (!r) return null
  if (!SEARCH_TOOL_NAMES.has(props.toolName ?? '')) return null
  if (r.error) return null

  const data = r.data as Record<string, unknown> | undefined
  if (!data) return null

  const items = (data.schemas ?? data.flows ?? data.users ?? data.widgets ?? []) as Array<Record<string, unknown>>
  const names = items
    .map(item => (item.name ?? item.displayName ?? item.username ?? item.id) as string)
    .filter(Boolean)
    .slice(0, 5)
  const total = (data.total as number) ?? items.length

  return { total, names, summary: r.summary as string | undefined }
})

const statusLabel = computed(() => {
  if (isRunning.value) return '调用中...'
  if (isDone.value) return '完成'
  if (isError.value) return '失败'
  return ''
})

function toggleCollapse(): void {
  collapsed.value = !collapsed.value
}

function formatJson(content: string): string {
  try {
    const parsed = JSON.parse(content)
    return JSON.stringify(parsed, null, 2)
  } catch {
    return content
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function highlightJsonSyntax(json: string): string {
  // Escape HTML first, then apply syntax highlighting
  const escaped = escapeHtml(json)
  // Highlight: strings (green), numbers (orange), booleans/null (purple), keys (blue)
  return escaped
    .replace(/"([^"\\]*(\\.[^"\\]*)*)"\s*:/g, '<span class="jsonKey">"$1"</span>:')
    .replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, '<span class="jsonString">"$1"</span>')
    .replace(/\b(-?\d+\.?\d*([eE][+-]?\d+)?)\b/g, '<span class="jsonNumber">$1</span>')
    .replace(/\b(true|false)\b/g, '<span class="jsonBool">$1</span>')
    .replace(/\bnull\b/g, '<span class="jsonNull">null</span>')
}

const highlightedJson = computed(() => {
  if (!props.content) return ''
  return highlightJsonSyntax(formatJson(props.content))
})
</script>

<template>
  <div :class="[$style.card, $style[`type_${type}`]]">
    <!-- Header -->
    <div
      v-if="hasHeader"
      :class="[$style.header, { [$style.headerError]: isError }]"
      @click="toggleCollapse"
    >
      <div :class="$style.headerLeft">
        <!-- Icon -->
        <div :class="[$style.icon, $style[`icon_${type}`]]">
          <!-- thinking icon -->
          <AppIcon name="info-filled" v-if="type === 'thinking'" :size="14" />
          <!-- tool_call icon -->
          <AppIcon name="edit" v-else-if="type === 'tool_call'" :size="14" />
          <!-- tool_error icon -->
          <AppIcon name="circle-close-filled" v-else-if="type === 'tool_error'" :size="14" />
        </div>
        <!-- Title + subtitle -->
        <div :class="$style.headerText">
          <div :class="$style.title">
            {{ type === 'tool_error' ? '工具调用失败' : title }}
            <span v-if="agent" :class="[$style.agentBadge, $style[`agent_${agent}`]]">
              {{ agentLabels[agent] }}
            </span>
          </div>
          <div v-if="toolName && (type === 'tool_call' || type === 'tool_error')" :class="$style.subtitle">
            {{ toolName }}
          </div>
          <div v-else-if="type === 'thinking'" :class="$style.subtitle">
            {{ isRunning ? '分析需求中...' : collapsed ? thinkingSummary : '已完成思考' }}
          </div>
        </div>
      </div>
      <div :class="$style.headerRight">
        <!-- Timestamp -->
        <div v-if="timestamp" :class="$style.timestamp">
          {{ formatTime(timestamp) }}
        </div>
        <!-- Status indicator for tool cards -->
        <div v-if="type === 'tool_call' || type === 'tool_error'" :class="$style.status">
          <span :class="[$style.statusDot, isRunning ? $style.statusDotLoading : isError ? $style.statusDotError : $style.statusDotSuccess]" />
          <span>{{ statusLabel }}</span>
        </div>
        <!-- Thinking badge -->
        <span v-if="type === 'thinking'" :class="$style.badgeThinking">
          {{ isRunning ? '思考中...' : '已完成' }}
        </span>
        <!-- Collapse toggle -->
        <div :class="[$style.toggle, { [$style.toggleExpanded]: !collapsed }]">
          <AppIcon name="arrow-down" :size="12" />
        </div>
      </div>
    </div>

    <!-- Body（展开时显示） -->
    <div v-if="!collapsed || !hasHeader" :class="$style.body">
        <!-- thinking / text content (skip markdown for JSON blocks) -->
        <div
          v-if="(type === 'thinking' || type === 'text') && title !== 'JSON 数据' && content"
          :class="type === 'text' ? $style.markdown : $style.thinkingContent"
          v-html="renderedContent"
        />

        <!-- JSON code block with syntax highlighting and collapse -->
        <div v-if="type === 'text' && title === 'JSON 数据' && content" :class="$style.jsonBlock">
          <div :class="$style.jsonBlockHeader" @click="jsonCollapsed = !jsonCollapsed">
            <div :class="$style.jsonBlockLabel">JSON 数据</div>
            <div :class="[$style.toggle, { [$style.toggleExpanded]: !jsonCollapsed }]">
              <AppIcon name="arrow-down" :size="12" />
            </div>
          </div>
          <div v-show="!jsonCollapsed" :class="$style.jsonBlockBody">
            <pre><code v-html="highlightedJson" /></pre>
          </div>
        </div>

      <!-- tool call / tool error content -->
      <template v-if="type === 'tool_call' || type === 'tool_error'">
        <!-- Error display -->
        <div v-if="isError" :class="$style.errorContent">
          <AppIcon name="circle-close-filled" :class="$style.errorIcon" :size="20" />
          <div :class="$style.errorBody">
            <div :class="$style.errorText">{{ friendlyErrorDescription }}</div>
            <div v-if="error && error !== friendlyErrorDescription" :class="$style.errorDetail">{{ error }}</div>
            <el-button
              v-if="type === 'tool_error'"
              :class="$style.retryBtn"
              text
              size="small"
              @click.stop="$emit('retry-tool')"
            >
              <AppIcon name="refresh" :size="12" />
              重试
            </el-button>
          </div>
        </div>

        <!-- Tool details (success) -->
        <template v-else>
          <div v-if="hasToolDetails" :class="$style.toolSection">
            <div :class="$style.toolSectionLabel">参数</div>
            <div :class="$style.toolJson">
              <pre>{{ JSON.stringify(toolArguments, null, 2) }}</pre>
            </div>
          </div>
          <!-- 搜索工具：精简显示 -->
          <div v-if="compactResult" :class="$style.toolSection">
            <div :class="$style.toolSectionLabel">结果</div>
            <div v-if="compactResult.summary" :class="$style.toolSummary">{{ compactResult.summary }}</div>
            <ul v-if="compactResult.names.length > 0" :class="$style.compactList">
              <li v-for="(name, i) in compactResult.names" :key="i">{{ name }}</li>
              <li v-if="compactResult.total > compactResult.names.length" :class="$style.moreItem">
                ...共 {{ compactResult.total }} 条
              </li>
            </ul>
            <details :class="$style.rawDetails">
              <summary>查看原始数据</summary>
              <div :class="$style.toolJson"><pre>{{ JSON.stringify(parsedToolResult ?? toolResult, null, 2) }}</pre></div>
            </details>
          </div>
          <!-- 非搜索工具：保持原样 -->
          <template v-else>
            <div v-if="hasToolResult" :class="$style.toolSection">
              <div :class="$style.toolSectionLabel">结果</div>
              <div v-if="toolResultSummary" :class="$style.toolSummary">{{ toolResultSummary }}</div>
              <div :class="$style.toolJson">
                <pre>{{ JSON.stringify(parsedToolResult ?? toolResult, null, 2) }}</pre>
              </div>
            </div>
          </template>
          <!-- Loading indicator for running tool calls -->
          <div v-if="isRunning" :class="$style.typingIndicator">
            <span :class="$style.typingDot" />
            <span :class="$style.typingDot" />
            <span :class="$style.typingDot" />
          </div>
        </template>
      </template>

      <!-- result embedded card slot -->
      <slot v-if="type === 'result'" />

      <!-- tool call extra slot -->
      <slot v-if="type === 'tool_call' && !isError" name="tool-extra" />
    </div>

    <!-- Footer for result cards (schema/flow) -->
    <div v-if="type === 'result' && (primaryAction || secondaryAction)" :class="$style.footer">
      <el-button
        v-if="secondaryAction"
        :class="$style.btnOutline"
        @click="$emit('secondary-action')"
      >
        <AppIcon name="edit" :size="12" />
        {{ secondaryAction }}
      </el-button>
      <el-button
        v-if="primaryAction"
        :class="$style.btnPrimary"
        type="primary"
        @click="$emit('primary-action')"
      >
        <AppIcon name="check" :size="12" />
        {{ primaryAction }}
      </el-button>
    </div>
  </div>
</template>

<style module src="./AiStepCard.module.scss" />
