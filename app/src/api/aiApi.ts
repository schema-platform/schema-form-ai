/**
 * AI API 客户端
 *
 * - 流式对话（fetch + ReadableStream）
 * - 对话管理 CRUD
 * - 发布接口
 */

import type {
  ChatRequest,
  StreamEvent,
  PublishRequest,
  PublishResponse,
  Conversation,
  RagSearchResponse,
} from '@/types'

// ---- 错误类型 ----

export class AiApiError extends Error {
  public readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'AiApiError'
    this.status = status
  }
}

// ---- 基础请求 ----

const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) ?? '/schema-platform/api'

/** Token 提供者，由 main.ts 注入，避免 apiClient 直接耦合微前端框架 */
let tokenProvider: (() => string | null) | null = null

export function setTokenProvider(provider: () => string | null): void {
  tokenProvider = provider
}

interface ApiResponse<T> {
  success: boolean
  data: T
  error?: { message: string }
}

/** 构建请求 headers，自动注入 Authorization */
function buildHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra }
  const token = tokenProvider?.()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const mergedInit: RequestInit = { ...init }
  mergedInit.headers = buildHeaders(init?.headers as Record<string, string>)

  const response = await fetch(`${BASE_URL}${path}`, mergedInit)

  if (!response.ok) {
    // 401: 通知调用方认证失败
    if (response.status === 401) {
      throw new AiApiError('Authentication required', 401)
    }
    const body = await response.json().catch(() => null)
    const msg = body?.error?.message ?? `${response.status} ${response.statusText}`
    throw new AiApiError(msg, response.status)
  }

  const body = (await response.json()) as ApiResponse<T>
  if (!body.success) {
    throw new AiApiError(body.error?.message ?? 'Request failed', response.status)
  }
  return body.data
}

// ---- 流式对话 ----

/**
 * 发送对话消息，返回可订阅的流式事件。
 *
 * 使用 fetch + ReadableStream 实现，支持流式文本和结构化事件。
 * 支持通过 AbortSignal 取消请求。
 *
 * 流式解析要点：
 * - 行分隔符为 `\n`，事件分隔符为 `\n\n`
 * - `data:` 和 `data: ` 均为合法格式（空格可选）
 * - 以 `:` 开头的行为注释（如心跳），跳过
 * - 流结束时必须刷新 TextDecoder 和 buffer，否则末尾事件丢失
 */
export function chat(request: ChatRequest, signal?: AbortSignal): ReadableStream<StreamEvent> {
  const body = JSON.stringify(request)

  const stream = new ReadableStream<StreamEvent>({
    async start(controller) {
      const response = await fetch(`${BASE_URL}/ai/chat`, {
        method: 'POST',
        headers: buildHeaders({ 'Content-Type': 'application/json' }),
        body,
        signal,
      })

      if (!response.ok) {
        controller.error(new AiApiError(`Chat request failed: ${response.status}`, response.status))
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        controller.error(new AiApiError('Response body is null', 0))
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let streamClosed = false

      /** Extract data value from a stream line. Returns null if not a data line. */
      function extractData(line: string): string | null {
        if (line.startsWith('data: ')) return line.slice(6)
        if (line.startsWith('data:')) return line.slice(5)
        return null
      }

      /** Parse stream data value: enqueue as event or close on [DONE]. */
      function handleData(data: string): void {
        if (data === '[DONE]') {
          controller.close()
          streamClosed = true
          return
        }
        try {
          const event = JSON.parse(data) as StreamEvent
          controller.enqueue(event)
        } catch {
          // Skip unparseable JSON
        }
      }

      /** Process all complete lines in buffer. Returns remaining incomplete line. */
      function processBuffer(buf: string): string {
        const lines = buf.split('\n')
        const remainder = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith(':')) continue
          const data = extractData(trimmed)
          if (data === null) continue
          handleData(data)
          if (streamClosed) return ''
        }
        return remainder
      }

      try {
        while (true) {
          if (signal?.aborted) {
            reader.cancel()
            if (!streamClosed) controller.close()
            return
          }

          const { done, value } = await reader.read()

          if (value) {
            buffer += decoder.decode(value, { stream: true })
          }

          if (done) {
            // Flush TextDecoder internal buffer (partial multi-byte characters).
            // Must happen BEFORE parsing — otherwise incomplete multi-byte
            // sequences produce replacement chars that break JSON parsing.
            buffer += decoder.decode()

            // Process all remaining lines. The trailing line (no \n) is also
            // a complete stream line — the stream has ended so there is nothing
            // more to wait for.
            for (const line of buffer.split('\n')) {
              const trimmed = line.trim()
              if (!trimmed || trimmed.startsWith(':')) continue
              const data = extractData(trimmed)
              if (data === null) continue
              handleData(data)
              if (streamClosed) return
            }

            if (!streamClosed) controller.close()
            return
          }

          // Stream not done — process complete lines, keep remainder
          buffer = processBuffer(buffer)
          if (streamClosed) return
        }
      } catch (err) {
        controller.error(err)
      }
    },
  })

  return stream
}

// ---- 对话管理 ----

export async function getConversations(): Promise<Conversation[]> {
  const response = await request<{ items: Conversation[]; total: number; page: number; pageSize: number; totalPages: number }>('/ai/conversations')
  return response.items
}

export async function getConversationDetail(id: string): Promise<Conversation & { messages: Array<{ role: string; content: string; thinking?: string; tip?: string; schema?: unknown[]; flow?: unknown; timestamp: string }> }> {
  return request(`/ai/conversations/${encodeURIComponent(id)}`)
}

export async function deleteConversation(id: string): Promise<void> {
  await request<void>(`/ai/conversations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

// ---- 发布 ----

export async function publish(payload: PublishRequest): Promise<PublishResponse> {
  return request<PublishResponse>('/ai/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

// ---- HITL Interrupt Resume ----

/**
 * 恢复被 interrupt 挂起的对话。返回流式响应。
 */
export function resumeInterrupt(
  threadId: string,
  confirmed: boolean,
  signal?: AbortSignal,
): ReadableStream<StreamEvent> {
  const body = JSON.stringify({ threadId, confirmed })

  const stream = new ReadableStream<StreamEvent>({
    async start(controller) {
      const response = await fetch(`${BASE_URL}/ai/chat/resume`, {
        method: 'POST',
        headers: buildHeaders({ 'Content-Type': 'application/json' }),
        body,
        signal,
      })

      if (!response.ok) {
        controller.error(new AiApiError(`Resume request failed: ${response.status}`, response.status))
        return
      }

      const reader = response.body?.getReader()
      if (!reader) {
        controller.error(new AiApiError('Response body is null', 0))
        return
      }

      const decoder = new TextDecoder()
      let buffer = ''
      let streamClosed = false

      function extractData(line: string): string | null {
        if (line.startsWith('data: ')) return line.slice(6)
        if (line.startsWith('data:')) return line.slice(5)
        return null
      }

      function handleData(data: string): void {
        if (data === '[DONE]') {
          controller.close()
          streamClosed = true
          return
        }
        try {
          const event = JSON.parse(data) as StreamEvent
          controller.enqueue(event)
        } catch {
          // Skip unparseable JSON
        }
      }

      function processBuffer(buf: string): string {
        const lines = buf.split('\n')
        const remainder = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith(':')) continue
          const data = extractData(trimmed)
          if (data === null) continue
          handleData(data)
          if (streamClosed) return ''
        }
        return remainder
      }

      try {
        while (true) {
          if (signal?.aborted) {
            reader.cancel()
            if (!streamClosed) controller.close()
            return
          }

          const { done, value } = await reader.read()

          if (value) {
            buffer += decoder.decode(value, { stream: true })
          }

          if (done) {
            buffer += decoder.decode()
            for (const line of buffer.split('\n')) {
              const trimmed = line.trim()
              if (!trimmed || trimmed.startsWith(':')) continue
              const data = extractData(trimmed)
              if (data === null) continue
              handleData(data)
              if (streamClosed) return
            }
            if (!streamClosed) controller.close()
            return
          }

          buffer = processBuffer(buffer)
          if (streamClosed) return
        }
      } catch (err) {
        controller.error(err)
      }
    },
  })

  return stream
}

// ---- 文件上传 ----

export interface UploadResult {
  filename: string
  mimetype: string
  size: number
  text: string
}

export async function uploadFile(file: File): Promise<UploadResult> {
  const form = new FormData()
  form.append('file', file)
  const response = await fetch(`${BASE_URL}/ai/upload`, {
    method: 'POST',
    headers: buildHeaders(),
    body: form,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const msg = body?.error?.message ?? `${response.status} ${response.statusText}`
    throw new AiApiError(msg, response.status)
  }
  const body = (await response.json()) as ApiResponse<UploadResult>
  if (!body.success) {
    throw new AiApiError(body.error?.message ?? 'Upload failed', response.status)
  }
  return body.data
}

// ---- 图片分析 ----

export interface AnalyzeImageResult {
  description: string
}

export async function analyzeImage(base64Image: string): Promise<AnalyzeImageResult> {
  return request<AnalyzeImageResult>('/ai/analyze-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: base64Image }),
  })
}

// ---- 对话导出 ----

export type ExportFormat = 'json' | 'markdown' | 'html'

export async function downloadConversation(id: string, format: ExportFormat): Promise<void> {
  const response = await fetch(`${BASE_URL}/ai/conversations/${encodeURIComponent(id)}/export?format=${format}`, {
    headers: buildHeaders(),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    const msg = body?.error?.message ?? `${response.status} ${response.statusText}`
    throw new AiApiError(msg, response.status)
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `conversation-${id}.${format === 'markdown' ? 'md' : format}`
  a.click()
  URL.revokeObjectURL(url)
}

// ---- 监控 ----

export interface MonitorSummary {
  totalCalls: number
  successRate: number
  avgDuration: number
  maxDuration: number
  totalTokens: number
  slowCalls: number
}

export interface AgentMetricStats {
  agentName: string
  operation: string
  totalCalls: number
  successRate: number
  avgDuration: number
  p95Duration: number
  maxDuration: number
  totalTokens: number
}

export interface AgentMetric {
  id: string
  agentName: string
  operation: string
  duration: number
  success: boolean
  error?: string
  tokenUsage?: { total?: number }
  createdAt: string
}

export interface AgentAlert {
  id: string
  agentName: string
  alertType: 'failure' | 'slow' | 'high_token'
  operation: string
  duration: number
  tokenUsage?: { total?: number }
  error?: string
  createdAt: string
}

export async function getMonitorSummary(hours?: number): Promise<MonitorSummary> {
  const query = hours ? `?hours=${hours}` : ''
  return request<MonitorSummary>(`/ai/monitor/summary${query}`)
}

export async function getMonitorStats(): Promise<AgentMetricStats[]> {
  return request<AgentMetricStats[]>('/ai/monitor/stats')
}

export async function getMonitorRecent(params?: { limit?: number }): Promise<AgentMetric[]> {
  const query = params?.limit ? `?limit=${params.limit}` : ''
  return request<AgentMetric[]>(`/ai/monitor/recent${query}`)
}

export async function getMonitorAlerts(params?: { limit?: number }): Promise<AgentAlert[]> {
  const query = params?.limit ? `?limit=${params.limit}` : ''
  return request<AgentAlert[]>(`/ai/monitor/alerts${query}`)
}

// ---- 搜索对话 ----

export interface SearchConversationsParams {
  keyword?: string
  startDate?: string
  endDate?: string
  source?: string
  page?: number
  pageSize?: number
}

export interface SearchResult {
  conversations: Conversation[]
  total: number
  page: number
  pageSize: number
}

export async function searchConversations(params: SearchConversationsParams): Promise<SearchResult> {
  const query = new URLSearchParams()
  if (params.keyword) query.set('keyword', params.keyword)
  if (params.startDate) query.set('startDate', params.startDate)
  if (params.endDate) query.set('endDate', params.endDate)
  if (params.source) query.set('source', params.source)
  if (params.page !== undefined) query.set('page', String(params.page))
  if (params.pageSize !== undefined) query.set('pageSize', String(params.pageSize))

  const qs = query.toString()
  return request<SearchResult>(`/ai/conversations/search${qs ? `?${qs}` : ''}`)
}

// ---- RAG Smart Match ----

export interface RagSearchParams {
  query: string
  limit?: number
  type?: 'form' | 'search_list'
}

export async function searchRag(params: RagSearchParams): Promise<RagSearchResponse> {
  const query = new URLSearchParams()
  query.set('query', params.query)
  if (params.limit !== undefined) query.set('limit', String(params.limit))
  if (params.type) query.set('type', params.type)

  return request<RagSearchResponse>(`/ai/rag/search?${query.toString()}`)
}

// ---- Mention Search ----

export type MentionType = 'schema' | 'flow' | 'widget'

export interface MentionSearchResult {
  id: string
  type: MentionType
  name: string
  description?: string
  updatedAt?: string
}

/**
 * Search schemas, flows, or widgets for @mention autocomplete.
 */
export async function mentionSearch(
  query: string,
  type: MentionType,
  limit = 10,
): Promise<MentionSearchResult[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) })
  return request<MentionSearchResult[]>(`/ai/mention/search/${type}?${params}`)
}

// ---- RAG Knowledge Base Management ----

export interface RagStatusData {
  totalSchemas: number
  totalEmbeddings: number
  indexed: number
  unindexed: number
  stale: number
  unindexedSchemas: Array<{ id: string; name: string; type: string }>
}

export interface RagReindexResult {
  total: number
  created: number
  updated: number
  skipped: number
  errors: number
}

export interface RagSingleReindexResult {
  schemaId: string
  action: 'created' | 'updated' | 'skipped'
}

export async function getRagStatus(): Promise<RagStatusData> {
  return request<RagStatusData>('/ai/rag/status')
}

export async function reindexAllRag(): Promise<RagReindexResult> {
  return request<RagReindexResult>('/ai/rag/reindex', {
    method: 'POST',
  })
}

export async function reindexSingleRag(schemaId: string): Promise<RagSingleReindexResult> {
  return request<RagSingleReindexResult>(`/ai/rag/reindex/${encodeURIComponent(schemaId)}`, {
    method: 'POST',
  })
}

export async function deleteRagEmbedding(schemaId: string): Promise<{ schemaId: string; deleted: boolean }> {
  return request<{ schemaId: string; deleted: boolean }>(`/ai/rag/${encodeURIComponent(schemaId)}`, {
    method: 'DELETE',
  })
}

// ---- LLM Provider Management ----

export interface LLMProviderInfo {
  name: string
  models: string[]
  defaultModel: string
  isDefault: boolean
  qualityScore: number
  speedScore: number
  costPer1kPromptTokens: number
  costPer1kCompletionTokens: number
}

export interface LLMProvidersResponse {
  providers: LLMProviderInfo[]
  default: string
  defaultStrategy: string | null
}

export async function getLLMProviders(): Promise<LLMProvidersResponse> {
  return request<LLMProvidersResponse>('/ai/llm-providers')
}

export async function switchLLMProvider(provider: string): Promise<{ provider: string; message: string }> {
  return request<{ provider: string; message: string }>('/ai/llm-provider', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider }),
  })
}

export interface UsageStats {
  totalTokens: number
  totalCost: number
  requestCount: number
  promptTokens: number
  completionTokens: number
}

export interface LLMAggregatedUsage {
  total: UsageStats
  byProvider: Array<{ name: string; usage: UsageStats }>
}

export async function getLLMUsage(provider?: string): Promise<LLMAggregatedUsage | { provider: string; usage: UsageStats }> {
  const query = provider ? `?provider=${encodeURIComponent(provider)}` : ''
  return request(`/ai/llm-usage${query}`)
}

export interface LLMStrategiesResponse {
  strategies: string[]
  default: string | null
}

export async function getLLMStrategies(): Promise<LLMStrategiesResponse> {
  return request<LLMStrategiesResponse>('/ai/llm-strategies')
}

export async function switchLLMStrategy(strategy: string | null): Promise<{ strategy: string | null; message: string }> {
  return request<{ strategy: string | null; message: string }>('/ai/llm-strategy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ strategy }),
  })
}

// ---- 版本历史 ----

export interface VersionEntry {
  id: string
  version: number
  type: 'schema' | 'flow'
  description?: string
  createdAt: string
}

export interface VersionDetail extends VersionEntry {
  conversationId: string
  content: Record<string, unknown>[] | Record<string, unknown>
}

export interface RollbackResult {
  id: string
  version: number
  type: 'schema' | 'flow'
  content: Record<string, unknown>[] | Record<string, unknown>
  description?: string
  rollbackFrom: string
}

/**
 * 获取对话的版本历史列表。
 */
export async function getVersions(conversationId: string): Promise<VersionEntry[]> {
  return request<VersionEntry[]>(`/ai/conversations/${encodeURIComponent(conversationId)}/versions`)
}

/**
 * 获取指定版本的详细内容。
 */
export async function getVersion(versionId: string): Promise<VersionDetail> {
  return request<VersionDetail>(`/ai/versions/${encodeURIComponent(versionId)}`)
}

/**
 * 回滚到指定版本。
 */
export async function rollbackVersion(conversationId: string, versionId: string): Promise<RollbackResult> {
  return request<RollbackResult>(`/ai/conversations/${encodeURIComponent(conversationId)}/rollback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ versionId }),
  })
}

// ---- 消息反馈 ----

export type FeedbackType = 'positive' | 'negative'

export interface MessageFeedback {
  feedback: FeedbackType
  comment?: string
}

/**
 * 为消息提交反馈（点赞/点踩）。
 */
export async function submitMessageFeedback(
  messageId: string,
  feedback: FeedbackType,
  comment?: string,
): Promise<void> {
  await request<void>(`/ai/messages/${encodeURIComponent(messageId)}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ feedback, comment }),
  })
}

// ---- 模型配置 ----

export interface ModelConfigItem {
  id: string
  name: string
  provider: string
  model: string
  isDefault: boolean
  parameters?: {
    temperature?: number
    maxTokens?: number
    topP?: number
  }
}

export async function getModelConfigs(): Promise<ModelConfigItem[]> {
  const res = await request<{ items: ModelConfigItem[]; total: number }>('/model-configs?pageSize=100')
  return res.items
}

// ---- AI 健康检查 ----

export interface AIProviderHealth {
  name: string
  hasApiKey: boolean
  model: string
  isDefault: boolean
}

export interface AIHealthResponse {
  status: 'ok' | 'unconfigured'
  defaultProvider: string
  providers: AIProviderHealth[]
  hasApiKey: boolean
}

/**
 * 检查 AI 服务健康状态（API Key 配置、Provider 可用性）。
 */
export async function checkAIHealth(): Promise<AIHealthResponse> {
  return request<AIHealthResponse>('/ai/health')
}
