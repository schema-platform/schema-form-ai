/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import AiMessage from '@/components/AiMessage.vue'

// Mock marked to return predictable HTML
vi.mock('marked', () => ({
  marked: {
    parse: vi.fn((content: string) => `<p>${content}</p>`),
  },
}))

vi.mock('dompurify', () => ({
  default: {
    sanitize: vi.fn((html: string) => html),
  },
}))

describe('AiMessage', () => {
  let rafCallbacks: Map<number, FrameRequestCallback>
  let rafIdCounter: number
  let rafSpy: ReturnType<typeof vi.spyOn>
  let cafSpy: ReturnType<typeof vi.spyOn>

  function setupRAFMock() {
    rafCallbacks = new Map()
    rafIdCounter = 1
    rafSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb: FrameRequestCallback) => {
      const id = rafIdCounter++
      rafCallbacks.set(id, cb)
      return id
    }) as ReturnType<typeof vi.spyOn>
    cafSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id: number) => {
      rafCallbacks.delete(id)
    }) as ReturnType<typeof vi.spyOn>
  }

  function flushAllRAF() {
    const cbs = [...rafCallbacks.entries()]
    rafCallbacks.clear()
    for (const [, cb] of cbs) {
      cb(0)
    }
  }

  afterEach(() => {
    rafSpy?.mockRestore()
    cafSpy?.mockRestore()
  })

  it('renders user message content directly', async () => {
    setupRAFMock()

    const wrapper = mount(AiMessage, {
      props: {
        role: 'user',
        label: 'You',
        content: 'Hello',
      },
    })

    await nextTick()
    expect(wrapper.text()).toContain('Hello')
  })

  it('renders loading dots when loading is true and no steps', () => {
    setupRAFMock()

    const wrapper = mount(AiMessage, {
      props: {
        role: 'assistant',
        label: 'AI',
        loading: true,
      },
    })
    // Loading placeholder contains AiLoadingDots
    expect(wrapper.findComponent({ name: 'AiLoadingDots' }).exists()).toBe(true)
  })

  describe('F2: rAF-batched content rendering for assistant text step', () => {
    it('buffers rapid content updates and renders only on animation frame', async () => {
      setupRAFMock()

      const wrapper = mount(AiMessage, {
        props: {
          role: 'assistant',
          label: 'AI',
          content: '',
        },
      })

      // Initial mount schedules one rAF
      const initialCallCount = rafSpy.mock.calls.length

      // Simulate rapid token updates
      await wrapper.setProps({ content: 'H' })
      await wrapper.setProps({ content: 'He' })
      await wrapper.setProps({ content: 'Hel' })
      await wrapper.setProps({ content: 'Hell' })
      await wrapper.setProps({ content: 'Hello' })

      // Only one additional rAF should have been scheduled
      expect(rafSpy.mock.calls.length).toBeLessThanOrEqual(initialCallCount + 1)

      // Flush the animation frame
      flushAllRAF()
      await nextTick()

      // Now the rendered content should reflect the latest value
      expect(wrapper.text()).toContain('Hello')
    })

    it('updates content immediately without rAF batching', async () => {
      setupRAFMock()

      const wrapper = mount(AiMessage, {
        props: {
          role: 'assistant',
          label: 'AI',
          content: '',
        },
      })

      // The component now updates content directly (no rAF batching)
      await wrapper.setProps({ content: 'Hello' })
      await nextTick()

      // Content should be immediately available
      expect(wrapper.text()).toContain('Hello')
    })

    it('renders updated content after prop change and rAF flush', async () => {
      setupRAFMock()

      const wrapper = mount(AiMessage, {
        props: {
          role: 'assistant',
          label: 'AI',
          content: 'First',
        },
      })

      flushAllRAF()
      await nextTick()
      expect(wrapper.text()).toContain('First')

      await wrapper.setProps({ content: 'Second' })

      flushAllRAF()
      await nextTick()
      expect(wrapper.text()).toContain('Second')
    })
  })

  describe('step card: thinking', () => {
    it('shows thinking step when thinking is provided', () => {
      setupRAFMock()

      const wrapper = mount(AiMessage, {
        props: {
          role: 'assistant',
          label: 'AI',
          thinking: 'Let me think...',
        },
      })
      // Step card title is always visible
      expect(wrapper.text()).toContain('思考过程')
    })

    it('thinking step is collapsed by default and expands on click', async () => {
      setupRAFMock()

      const wrapper = mount(AiMessage, {
        props: {
          role: 'assistant',
          label: 'AI',
          thinking: 'Let me think...',
        },
      })

      // Initially collapsed — thinking content not visible
      expect(wrapper.text()).not.toContain('Let me think...')

      // Click header to expand
      await wrapper.find('[class*="header"]').trigger('click')
      await nextTick()
      expect(wrapper.text()).toContain('Let me think...')

      // Click again to collapse
      await wrapper.find('[class*="header"]').trigger('click')
      await nextTick()
      expect(wrapper.text()).not.toContain('Let me think...')
    })
  })

  describe('step card: tool calls', () => {
    it('shows tool call step with display name', () => {
      setupRAFMock()

      const wrapper = mount(AiMessage, {
        props: {
          role: 'assistant',
          label: 'AI',
          toolCalls: [
            { name: 'search_schemas', arguments: { query: 'test' } },
          ],
        },
      })
      // Tool display name is shown as step title
      expect(wrapper.text()).toContain('搜索表单')
    })

    it('shows display name for all registered tools', () => {
      setupRAFMock()

      const toolNames: Array<[string, string]> = [
        ['update_schema', '更新表单'],
        ['update_flow', '更新流程'],
        ['bind_schema_to_flow_node', '绑定表单到流程节点'],
        ['query_widgets', '查询组件'],
        ['request_collaboration', '请求协作'],
        ['save_and_bind_schema', '保存并绑定表单'],
      ]

      for (const [name, label] of toolNames) {
        const wrapper = mount(AiMessage, {
          props: {
            role: 'assistant',
            label: 'AI',
            toolCalls: [{ name, arguments: {} }],
          },
        })
        expect(wrapper.text()).toContain(label)
        wrapper.unmount()
      }
    })

    it('renders error card for failed tool call (expanded by default)', () => {
      setupRAFMock()

      const wrapper = mount(AiMessage, {
        props: {
          role: 'assistant',
          label: 'AI',
          toolCalls: [
            {
              name: 'generate_schema',
              arguments: { prompt: 'test' },
              error: 'Schema validation failed: missing required field "type"',
            },
          ],
        },
      })

      // tool_error is NOT collapsed by default — no need to click header

      // Error content should be visible (tool_error type is NOT collapsed by default)
      const errorContent = wrapper.find('[class*="errorContent"]')
      expect(errorContent.exists()).toBe(true)
      expect(errorContent.text()).toContain('Schema validation failed: missing required field "type"')
    })

    it('renders normal result when no error', async () => {
      setupRAFMock()

      const wrapper = mount(AiMessage, {
        props: {
          role: 'assistant',
          label: 'AI',
          toolCalls: [
            {
              name: 'search_schemas',
              arguments: { query: 'user' },
              result: { count: 3 },
            },
          ],
        },
      })

      // Expand tool call step
      await wrapper.find('[class*="header"]').trigger('click')

      // No error card
      expect(wrapper.find('[class*="errorCard"]').exists()).toBe(false)

      // Arguments and result should be shown
      expect(wrapper.find('[class*="toolSection"]').exists()).toBe(true)
    })

    it('renders mixed successful and failed tool calls as separate steps', async () => {
      setupRAFMock()

      const wrapper = mount(AiMessage, {
        props: {
          role: 'assistant',
          label: 'AI',
          toolCalls: [
            { name: 'search_schemas', arguments: { query: 'test' }, result: { count: 1 } },
            { name: 'validate_schema', arguments: {}, error: 'Validation timeout' },
          ],
        },
      })

      // Each tool call is a separate step card
      // First step (tool_call): collapsed by default, expand it
      // Second step (tool_error): already expanded, don't click
      const headers = wrapper.findAll('[class*="header"]')
      if (headers.length > 0) {
        await headers[0].trigger('click')
      }

      // Error content exists in the DOM (from the second step, already expanded)
      expect(wrapper.find('[class*="errorContent"]').exists()).toBe(true)
      expect(wrapper.text()).toContain('Validation timeout')
    })
  })

  describe('step card: result', () => {
    it('renders schema card inside result step', () => {
      setupRAFMock()

      const wrapper = mount(AiMessage, {
        props: {
          role: 'assistant',
          label: 'AI',
          content: 'Done',
          cards: [{
            type: 'schema',
            title: 'Form Preview',
            fields: [
              { icon: 'T', name: 'username', type: 'input' },
            ],
            primaryAction: 'Publish',
            secondaryAction: 'Edit',
          }],
        },
      })

      expect(wrapper.text()).toContain('Form Preview')
      expect(wrapper.text()).toContain('username')
    })
  })
})
