/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AiConversationSearch from '@/components/AiConversationSearch.vue'

// Stubs for Element Plus components used in AiConversationSearch
const ElInputStub = {
  template: '<input :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" @keyup.enter="$emit(\'keyup.enter\')" />',
  props: ['modelValue', 'placeholder', 'clearable', 'size', 'prefixIcon'],
  emits: ['update:modelValue', 'keyup.enter', 'clear'],
}
const ElSelectStub = {
  template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>',
  props: ['modelValue', 'placeholder', 'size'],
  emits: ['update:modelValue'],
}
const ElOptionStub = {
  template: '<option :value="value">{{ label }}</option>',
  props: ['label', 'value'],
}
const ElDatePickerStub = {
  template: '<input type="date" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  props: ['modelValue', 'type', 'placeholder', 'size', 'valueFormat', 'format'],
  emits: ['update:modelValue'],
}
const ElButtonStub = {
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
  props: ['type', 'size', 'link', 'disabled', 'title'],
  emits: ['click'],
}
const ElPopoverStub = {
  template: '<div class="el-popover"><slot name="reference" /><div v-if="visible" class="el-popover__content"><slot /></div></div>',
  props: ['visible', 'placement', 'width', 'trigger', 'showArrow', 'offset'],
  emits: ['update:visible'],
}
const ElTagStub = {
  template: '<span class="el-tag"><slot /></span>',
  props: ['type', 'size', 'effect'],
}
const ElIconStub = {
  template: '<span class="el-icon"><slot /></span>',
  props: ['size', 'color'],
}

const globalStubs = {
  ElInput: ElInputStub,
  ElSelect: ElSelectStub,
  ElOption: ElOptionStub,
  ElDatePicker: ElDatePickerStub,
  ElButton: ElButtonStub,
  ElPopover: ElPopoverStub,
  ElTag: ElTagStub,
  ElIcon: ElIconStub,
}

const mockSearchResult = {
  conversations: [
    {
      id: 'conv-1',
      title: '用户注册表单设计',
      source: 'editor' as const,
      activeAgent: 'editor' as const,
      createdAt: '2026-06-01T10:00:00Z',
      updatedAt: '2026-06-02T15:30:00Z',
    },
    {
      id: 'conv-2',
      title: '订单审批流程',
      source: 'flow' as const,
      activeAgent: 'flow' as const,
      createdAt: '2026-06-03T08:00:00Z',
      updatedAt: '2026-06-04T09:00:00Z',
    },
  ],
  total: 2,
  page: 1,
  pageSize: 20,
}

const mockSearchAction = vi.fn().mockResolvedValue(mockSearchResult)

vi.mock('@/stores/ai', () => ({
  useAiStore: () => ({
    searchConversationsAction: mockSearchAction,
  }),
}))

describe('AiConversationSearch', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('renders a search input', () => {
    const wrapper = mount(AiConversationSearch, { global: { stubs: globalStubs } })
    expect(wrapper.find('input').exists()).toBe(true)
    expect(wrapper.find('input').attributes('placeholder')).toBe('搜索对话...')
  })

  it('shows results after typing and debounce', async () => {
    const wrapper = mount(AiConversationSearch, { global: { stubs: globalStubs } })
    const input = wrapper.find('input')

    await input.setValue('表单')

    await vi.waitFor(() => {
      expect(wrapper.findAll('[class*="resultItem"]').length).toBe(2)
    }, { timeout: 3000 })
  })

  it('displays conversation title in results', async () => {
    const wrapper = mount(AiConversationSearch, { global: { stubs: globalStubs } })
    const input = wrapper.find('input')

    await input.setValue('表单')

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('用户注册表单设计')
    }, { timeout: 3000 })

    expect(wrapper.text()).toContain('订单审批流程')
  })

  it('displays source tags', async () => {
    const wrapper = mount(AiConversationSearch, { global: { stubs: globalStubs } })
    const input = wrapper.find('input')

    await input.setValue('表单')

    await vi.waitFor(() => {
      // Source tags are rendered as el-tag elements
      const tags = wrapper.findAll('.el-tag')
      expect(tags.length).toBe(2)
    }, { timeout: 3000 })
  })

  it('emits select event when clicking a result', async () => {
    const wrapper = mount(AiConversationSearch, { global: { stubs: globalStubs } })
    const input = wrapper.find('input')

    await input.setValue('表单')

    await vi.waitFor(() => {
      expect(wrapper.findAll('[class*="resultItem"]').length).toBe(2)
    }, { timeout: 3000 })

    await wrapper.find('[class*="resultItem"]').trigger('click')

    expect(wrapper.emitted('select')).toBeTruthy()
    expect(wrapper.emitted('select')![0][0]).toBe('conv-1')
  })

  it('clears search after selecting a result', async () => {
    const wrapper = mount(AiConversationSearch, { global: { stubs: globalStubs } })
    const input = wrapper.find('input')

    await input.setValue('表单')

    await vi.waitFor(() => {
      expect(wrapper.findAll('[class*="resultItem"]').length).toBe(2)
    }, { timeout: 3000 })

    await wrapper.find('[class*="resultItem"]').trigger('click')

    expect(wrapper.find('input').element.value).toBe('')
    expect(wrapper.find('[class*="results"]').exists()).toBe(false)
  })

  it('hides panel when search query is cleared', async () => {
    const wrapper = mount(AiConversationSearch, { global: { stubs: globalStubs } })
    const input = wrapper.find('input')

    await input.setValue('test')

    await vi.waitFor(() => {
      expect(wrapper.find('[class*="results"]').exists()).toBe(true)
    }, { timeout: 3000 })

    await input.setValue('')

    // After clearing, panel should hide immediately (empty query = no search)
    await flushPromises()
    expect(wrapper.find('[class*="results"]').exists()).toBe(false)
  })

  it('shows result count', async () => {
    const wrapper = mount(AiConversationSearch, { global: { stubs: globalStubs } })
    const input = wrapper.find('input')

    await input.setValue('表单')

    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('找到 2 条结果')
    }, { timeout: 3000 })
  })

  it('clears search when input is cleared', async () => {
    const wrapper = mount(AiConversationSearch, { global: { stubs: globalStubs } })
    const input = wrapper.find('input')

    await input.setValue('test')

    await vi.waitFor(() => {
      expect(wrapper.find('[class*="results"]').exists()).toBe(true)
    }, { timeout: 3000 })

    await input.setValue('')

    await flushPromises()
    expect(wrapper.find('[class*="results"]').exists()).toBe(false)
  })

  it('calls searchConversationsAction with keyword params', async () => {
    const wrapper = mount(AiConversationSearch, { global: { stubs: globalStubs } })
    const input = wrapper.find('input')

    await input.setValue('审批')

    await vi.waitFor(() => {
      expect(mockSearchAction).toHaveBeenCalledWith({ keyword: '审批' })
    }, { timeout: 3000 })
  })

  // ---- Filter tests ----

  it('renders filter toggle button', () => {
    const wrapper = mount(AiConversationSearch, { global: { stubs: globalStubs } })
    // The filter toggle is a button inside el-popover's #reference slot
    const buttons = wrapper.findAll('button')
    expect(buttons.length).toBeGreaterThan(0)
    // The filter toggle is the button inside the el-popover reference
    expect(wrapper.find('.el-popover').exists()).toBe(true)
  })

  it('shows filter panel when toggle is clicked', async () => {
    const wrapper = mount(AiConversationSearch, { global: { stubs: globalStubs } })

    // Click the button inside el-popover reference slot
    const popoverButton = wrapper.find('.el-popover button')
    await popoverButton.trigger('click')

    // After click, filtersExpanded toggles to true, which passes to el-popover :visible
    // The filter panel (inside el-popover default slot) should render
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[class*="filterPanel"]').exists()).toBe(true)
  })

  it('hides filter panel when toggle is clicked again', async () => {
    const wrapper = mount(AiConversationSearch, { global: { stubs: globalStubs } })

    const popoverButton = wrapper.find('.el-popover button')

    // Click to open
    await popoverButton.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[class*="filterPanel"]').exists()).toBe(true)

    // Click to close
    await popoverButton.trigger('click')
    await wrapper.vm.$nextTick()
    expect(wrapper.find('[class*="filterPanel"]').exists()).toBe(false)
  })

  it('renders source filter select with all options', async () => {
    const wrapper = mount(AiConversationSearch, { global: { stubs: globalStubs } })

    // Open filter panel
    const popoverButton = wrapper.find('.el-popover button')
    await popoverButton.trigger('click')
    await wrapper.vm.$nextTick()

    const select = wrapper.find('select')
    expect(select.exists()).toBe(true)
    const options = select.findAll('option')
    expect(options.length).toBe(4)
    expect(options[0].text()).toBe('全部来源')
    expect(options[1].text()).toBe('Editor')
    expect(options[2].text()).toBe('Flow')
    expect(options[3].text()).toBe('AI')
  })

  it('renders date range inputs', async () => {
    const wrapper = mount(AiConversationSearch, { global: { stubs: globalStubs } })

    // Open filter panel
    const popoverButton = wrapper.find('.el-popover button')
    await popoverButton.trigger('click')
    await wrapper.vm.$nextTick()

    const dateInputs = wrapper.findAll('input[type="date"]')
    expect(dateInputs.length).toBe(2)
  })

  it('searches with source filter', async () => {
    vi.useFakeTimers()
    const wrapper = mount(AiConversationSearch, { global: { stubs: globalStubs } })

    // Open filter panel
    const popoverButton = wrapper.find('.el-popover button')
    await popoverButton.trigger('click')
    await wrapper.vm.$nextTick()

    const select = wrapper.find('select')
    await select.setValue('editor')
    vi.advanceTimersByTime(400)
    await flushPromises()

    expect(mockSearchAction).toHaveBeenCalledWith({ source: 'editor' })
    vi.useRealTimers()
  })

  it('searches with date range filter', async () => {
    vi.useFakeTimers()
    const wrapper = mount(AiConversationSearch, { global: { stubs: globalStubs } })

    // Open filter panel
    const popoverButton = wrapper.find('.el-popover button')
    await popoverButton.trigger('click')
    await wrapper.vm.$nextTick()

    const dateInputs = wrapper.findAll('input[type="date"]')
    await dateInputs[0].setValue('2026-06-01')
    await dateInputs[1].setValue('2026-06-30')
    vi.advanceTimersByTime(400)
    await flushPromises()

    expect(mockSearchAction).toHaveBeenCalledWith({
      startDate: '2026-06-01',
      endDate: '2026-06-30',
    })
    vi.useRealTimers()
  })

  it('searches with keyword + source + date combined', async () => {
    vi.useFakeTimers()
    const wrapper = mount(AiConversationSearch, { global: { stubs: globalStubs } })
    const input = wrapper.find('input')

    await input.setValue('表单')

    // Open filter panel
    const popoverButton = wrapper.find('.el-popover button')
    await popoverButton.trigger('click')
    await wrapper.vm.$nextTick()

    const select = wrapper.find('select')
    await select.setValue('flow')

    const dateInputs = wrapper.findAll('input[type="date"]')
    await dateInputs[0].setValue('2026-06-01')

    vi.advanceTimersByTime(400)
    await flushPromises()

    expect(mockSearchAction).toHaveBeenCalledWith({
      keyword: '表单',
      source: 'flow',
      startDate: '2026-06-01',
    })
    vi.useRealTimers()
  })

  it('shows results when only filters are active (no keyword)', async () => {
    vi.useFakeTimers()
    const wrapper = mount(AiConversationSearch, { global: { stubs: globalStubs } })

    // Open filter panel
    const popoverButton = wrapper.find('.el-popover button')
    await popoverButton.trigger('click')
    await wrapper.vm.$nextTick()

    const select = wrapper.find('select')
    await select.setValue('editor')
    vi.advanceTimersByTime(400)
    await flushPromises()

    expect(wrapper.find('[class*="results"]').exists()).toBe(true)
    expect(wrapper.findAll('[class*="resultItem"]').length).toBe(2)
    vi.useRealTimers()
  })

  it('clears filters when source is reset to empty', async () => {
    vi.useFakeTimers()
    const wrapper = mount(AiConversationSearch, { global: { stubs: globalStubs } })

    // Open filter panel
    const popoverButton = wrapper.find('.el-popover button')
    await popoverButton.trigger('click')
    await wrapper.vm.$nextTick()

    const select = wrapper.find('select')
    await select.setValue('editor')
    vi.advanceTimersByTime(400)
    await flushPromises()

    expect(wrapper.find('[class*="results"]').exists()).toBe(true)

    // 清除 source 筛选
    await select.setValue('')
    vi.advanceTimersByTime(400)
    await flushPromises()

    // 无 keyword 且无 filter，panel 应隐藏
    expect(wrapper.find('[class*="results"]').exists()).toBe(false)
    vi.useRealTimers()
  })
})
