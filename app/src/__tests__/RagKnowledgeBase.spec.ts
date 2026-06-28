/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import RagKnowledgeBase from '@/views/RagKnowledgeBase.vue'

// Mock API module
vi.mock('@/api/aiApi', () => ({
  getRagStatus: vi.fn(),
  reindexAllRag: vi.fn(),
  reindexSingleRag: vi.fn(),
  deleteRagEmbedding: vi.fn(),
  searchRag: vi.fn(),
}))

import {
  getRagStatus,
  reindexAllRag,
  reindexSingleRag,
  searchRag,
} from '@/api/aiApi'

const mockGetRagStatus = vi.mocked(getRagStatus)
const mockReindexAllRag = vi.mocked(reindexAllRag)
vi.mocked(reindexSingleRag)
const mockSearchRag = vi.mocked(searchRag)

// Stub Element Plus components
const ElButtonStub = { template: '<button :disabled="loading" @click="$emit(\'click\')"><slot /></button>', props: ['type', 'size', 'loading'], emits: ['click'] }
const ElInputStub = { template: '<input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" @keyup.enter="$emit(\'keyup.enter\')" />', props: ['modelValue', 'placeholder', 'clearable'], emits: ['update:modelValue', 'keyup.enter'] }
const ElTagStub = { template: '<span><slot /></span>', props: ['size', 'type'] }
const ElTableStub = {
  template: '<div><slot /><div v-if="!data || data.length === 0">{{ emptyText }}</div></div>',
  props: { data: { default: () => [] }, emptyText: { default: '' } },
}
const ElTableColumnStub = { template: '<div><slot name="default" :row="{}" /></div>', props: ['prop', 'label', 'width', 'minWidth', 'fixed'] }

const globalStubs = {
  'el-button': ElButtonStub,
  'el-input': ElInputStub,
  'el-tag': ElTagStub,
  'el-table': ElTableStub,
  'el-table-column': ElTableColumnStub,
}

function createStatus(overrides: Record<string, unknown> = {}) {
  return {
    totalSchemas: 10,
    totalEmbeddings: 7,
    indexed: 7,
    unindexed: 3,
    stale: 1,
    unindexedSchemas: [] as Array<{ id: string; name: string; type: string }>,
    ...overrides,
  }
}

function mountComponent() {
  return mount(RagKnowledgeBase, { global: { stubs: globalStubs } })
}

describe('RagKnowledgeBase', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRagStatus.mockResolvedValue(createStatus())
  })

  it('loads status on mount', async () => {
    mountComponent()
    await flushPromises()
    expect(mockGetRagStatus).toHaveBeenCalledOnce()
  })

  it('renders summary cards with status data', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.text()).toContain('10')
    expect(wrapper.text()).toContain('7')
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('1')
    expect(wrapper.text()).toContain('70%')
  })

  it('renders summary card labels', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.text()).toContain('Schema 总数')
    expect(wrapper.text()).toContain('已索引')
    expect(wrapper.text()).toContain('待索引')
    expect(wrapper.text()).toContain('覆盖率')
    expect(wrapper.text()).toContain('覆盖率')
  })

  it('triggers batch reindex when button is clicked', async () => {
    mockReindexAllRag.mockResolvedValue({
      total: 10, created: 3, updated: 2, skipped: 5, errors: 0,
    })

    const wrapper = mountComponent()
    await flushPromises()

    const reindexBtn = wrapper.findAll('button').find((b) => b.text().includes('重建索引'))
    await reindexBtn!.trigger('click')
    await flushPromises()

    expect(mockReindexAllRag).toHaveBeenCalledOnce()
    expect(mockGetRagStatus).toHaveBeenCalledTimes(2)
  })

  it('shows reindex result after batch reindex', async () => {
    mockReindexAllRag.mockResolvedValue({
      total: 10, created: 3, updated: 2, skipped: 4, errors: 1,
    })

    const wrapper = mountComponent()
    await flushPromises()

    const reindexBtn = wrapper.findAll('button').find((b) => b.text().includes('重建索引'))
    await reindexBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('上次批量索引')
    expect(wrapper.text()).toContain('新建 3')
    expect(wrapper.text()).toContain('更新 2')
    expect(wrapper.text()).toContain('跳过 4')
    expect(wrapper.text()).toContain('失败 1')
  })

  it('shows empty hint before search', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    expect(wrapper.text()).toContain('测试 RAG 语义搜索效果')
  })

  it('performs semantic search and renders results', async () => {
    mockSearchRag.mockResolvedValue({
      total: 2,
      schemas: [
        {
          id: 'r1', editId: 'e1', name: 'User Registration', type: 'form', score: 85,
          widgetTypes: ['input', 'select'], fieldNames: ['name', 'email'],
          labels: ['Name', 'Email'], description: 'User registration form',
        },
        {
          id: 'r2', editId: 'e2', name: 'Login Form', type: 'form', score: 62,
          widgetTypes: ['input'], fieldNames: ['username', 'password'],
          labels: ['Username', 'Password'], description: 'Login form',
        },
      ],
    })

    const wrapper = mountComponent()
    await flushPromises()

    await wrapper.find('input').setValue('user registration')
    const searchBtn = wrapper.findAll('button').find((b) => b.text().includes('搜索'))
    await searchBtn!.trigger('click')
    await flushPromises()

    expect(mockSearchRag).toHaveBeenCalledWith({ query: 'user registration', limit: 10 })
    expect(wrapper.text()).toContain('User Registration')
    expect(wrapper.text()).toContain('Login Form')
    expect(wrapper.text()).toContain('85')
    expect(wrapper.text()).toContain('62')
  })

  it('shows no results message when search returns empty', async () => {
    mockSearchRag.mockResolvedValue({ total: 0, schemas: [] })

    const wrapper = mountComponent()
    await flushPromises()

    await wrapper.find('input').setValue('nonexistent')
    const searchBtn = wrapper.findAll('button').find((b) => b.text().includes('搜索'))
    await searchBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('未找到匹配的 Schema')
  })

  it('renders widget type tags in search results', async () => {
    mockSearchRag.mockResolvedValue({
      total: 1,
      schemas: [{
        id: 'r1', editId: 'e1', name: 'Complex Form', type: 'form', score: 90,
        widgetTypes: ['input', 'select', 'table', 'button', 'form', 'chart'],
        fieldNames: [], labels: [], description: '',
      }],
    })

    const wrapper = mountComponent()
    await flushPromises()

    await wrapper.find('input').setValue('complex')
    const searchBtn = wrapper.findAll('button').find((b) => b.text().includes('搜索'))
    await searchBtn!.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('+3')
  })

  it('handles search via Enter key', async () => {
    mockSearchRag.mockResolvedValue({ total: 0, schemas: [] })

    const wrapper = mountComponent()
    await flushPromises()

    const input = wrapper.find('input')
    await input.setValue('test query')
    await input.trigger('keyup.enter')
    await flushPromises()

    expect(mockSearchRag).toHaveBeenCalledWith({ query: 'test query', limit: 10 })
  })

  it('applies score class based on score value', async () => {
    mockSearchRag.mockResolvedValue({
      total: 3,
      schemas: [
        { id: '1', editId: 'e1', name: 'High', type: 'form', score: 80, widgetTypes: [], fieldNames: [], labels: [], description: '' },
        { id: '2', editId: 'e2', name: 'Medium', type: 'form', score: 50, widgetTypes: [], fieldNames: [], labels: [], description: '' },
        { id: '3', editId: 'e3', name: 'Low', type: 'form', score: 20, widgetTypes: [], fieldNames: [], labels: [], description: '' },
      ],
    })

    const wrapper = mountComponent()
    await flushPromises()

    await wrapper.find('input').setValue('test')
    const searchBtn = wrapper.findAll('button').find((b) => b.text().includes('搜索'))
    await searchBtn!.trigger('click')
    await flushPromises()

    const scoreElements = wrapper.findAll('[class*="resultScore"]')
    expect(scoreElements[0].classes().some((c: string) => c.includes('scoreHigh'))).toBe(true)
    expect(scoreElements[1].classes().some((c: string) => c.includes('scoreMedium'))).toBe(true)
    expect(scoreElements[2].classes().some((c: string) => c.includes('scoreLow'))).toBe(true)
  })

  it('shows empty table text when no unindexed schemas', async () => {
    mockGetRagStatus.mockResolvedValue(createStatus({ unindexed: 0, unindexedSchemas: [] }))

    const wrapper = mountComponent()
    await flushPromises()

    expect(wrapper.text()).toContain('所有 Schema 均已索引')
  })

  it('refreshes status when refresh button is clicked', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    expect(mockGetRagStatus).toHaveBeenCalledTimes(1)

    const refreshBtn = wrapper.findAll('button').find((b) => b.text().includes('刷新'))
    await refreshBtn!.trigger('click')
    await flushPromises()

    expect(mockGetRagStatus).toHaveBeenCalledTimes(2)
  })

  it('renders topbar with correct title', async () => {
    const wrapper = mountComponent()
    await flushPromises()
    expect(wrapper.text()).toContain('RAG 知识库')
  })

  it('renders search input with correct placeholder', async () => {
    const wrapper = mountComponent()
    await flushPromises()

    const input = wrapper.find('input')
    expect(input.attributes('placeholder')).toContain('用户注册表单')
  })
})
