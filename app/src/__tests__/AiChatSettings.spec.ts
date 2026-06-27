/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import AiChatSettings from '@/components/AiChatSettings.vue'
import type { ChatSettings } from '@/types'

// Stub Element Plus components used by AiChatSettings
const ElRadioButtonStub = {
  template: '<button :class="{ active: modelValue === $attrs.value }" @click="$emit(\'update:modelValue\', $attrs.value)"><slot /></button>',
  props: ['value', 'modelValue'],
}
const ElRadioGroupStub = {
  template: '<div><slot /></div>',
  props: ['modelValue'],
}
const ElInputStub = {
  template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  props: ['modelValue', 'type', 'rows', 'placeholder'],
}

const defaultSettings: ChatSettings = {
  preferences: {
    replyLanguage: 'zh-CN',
    replyStyle: 'detailed',
    codeComment: 'yes',
  },
  historySummary: {
    mode: 'auto',
  },
}

const stubs = {
  ElRadioButton: ElRadioButtonStub,
  ElRadioGroup: ElRadioGroupStub,
  ElInput: ElInputStub,
}

/**
 * Helper: mount AiChatSettings and return the wrapper plus a function
 * to query the teleported content in document.body.
 *
 * The component uses <Teleport to="body">, so its visible content
 * lands in document.body, not in wrapper.text().
 */
function mountSettings(visible: boolean, settings: ChatSettings = defaultSettings) {
  const wrapper = mount(AiChatSettings, {
    props: { visible, settings },
    global: { stubs },
  })
  return {
    wrapper,
    /** Full text including teleported content */
    text: () => document.body.textContent ?? '',
    /** Query buttons in the teleported drawer */
    findButton: (label: string) =>
      [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === label),
  }
}

describe('AiChatSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
  })

  it('renders when visible is true', () => {
    const { wrapper, text } = mountSettings(true)
    expect(text()).toContain('对话设置')
    expect(text()).toContain('用户偏好')
    expect(text()).toContain('对话历史摘要')
    wrapper.unmount()
  })

  it('does not render content when visible is false', () => {
    const { wrapper, text } = mountSettings(false)
    expect(text()).not.toContain('用户偏好')
    wrapper.unmount()
  })

  it('displays all preference options', () => {
    const { wrapper, text } = mountSettings(true)
    // Language options
    expect(text()).toContain('回复语言')
    expect(text()).toContain('中文')
    expect(text()).toContain('English')

    // Style options
    expect(text()).toContain('回复风格')
    expect(text()).toContain('简洁')
    expect(text()).toContain('详细')

    // Code comment options
    expect(text()).toContain('代码注释')
    expect(text()).toContain('是')
    expect(text()).toContain('否')
    wrapper.unmount()
  })

  it('displays history summary mode options', () => {
    const { wrapper, text } = mountSettings(true)
    expect(text()).toContain('生成方式')
    expect(text()).toContain('自动生成')
    expect(text()).toContain('手动编辑')
    wrapper.unmount()
  })

  it('shows manual summary textarea when mode is manual', () => {
    const manualSettings: ChatSettings = {
      ...defaultSettings,
      historySummary: { mode: 'manual', manualSummary: 'test summary' },
    }
    const { wrapper, text } = mountSettings(true, manualSettings)
    expect(text()).toContain('手动摘要')
    // Textarea is inside Teleport, query from document.body
    expect(document.body.querySelector('textarea')).toBeTruthy()
    wrapper.unmount()
  })

  it('hides manual summary textarea when mode is auto', () => {
    const { wrapper, text } = mountSettings(true)
    expect(text()).not.toContain('手动摘要')
    wrapper.unmount()
  })

  it('emits update:settings on save', async () => {
    const { wrapper, findButton } = mountSettings(true)

    const saveBtn = findButton('保存')
    expect(saveBtn).toBeTruthy()
    saveBtn!.click()

    // Wait for Vue reactivity
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:settings')).toBeTruthy()
    expect(wrapper.emitted('update:settings')![0][0]).toEqual(defaultSettings)
    wrapper.unmount()
  })

  it('emits update:visible false on cancel', async () => {
    const { wrapper, findButton } = mountSettings(true)

    const cancelBtn = findButton('取消')
    expect(cancelBtn).toBeTruthy()
    cancelBtn!.click()

    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:visible')).toBeTruthy()
    expect(wrapper.emitted('update:visible')![0][0]).toBe(false)
    wrapper.unmount()
  })

  it('emits update:visible false on save', async () => {
    const { wrapper, findButton } = mountSettings(true)

    const saveBtn = findButton('保存')
    expect(saveBtn).toBeTruthy()
    saveBtn!.click()

    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:visible')).toBeTruthy()
    expect(wrapper.emitted('update:visible')![0][0]).toBe(false)
    wrapper.unmount()
  })
})
