/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import AiChatSettings from '@/components/AiChatSettings.vue'
import type { ChatSettings } from '@/types'

const ElDrawerStub = {
  template: '<div v-if="modelValue"><slot /><slot name="footer" /></div>',
  props: ['modelValue', 'title', 'size'],
}

const ElRadioButtonStub = {
  template: '<button @click="$emit(\'update:modelValue\', $attrs.value)"><slot /></button>',
  props: ['value', 'modelValue'],
}

const ElRadioGroupStub = {
  template: '<div><slot /></div>',
  props: ['modelValue', 'size'],
}

const ElInputStub = {
  template: '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  props: ['modelValue', 'type', 'rows', 'size'],
}

const ElSelectStub = {
  template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>',
  props: ['modelValue', 'size'],
}

const ElOptionStub = {
  template: '<option :value="value">{{ label }}</option>',
  props: ['value', 'label'],
}

const ElSwitchStub = {
  template: '<input type="checkbox" :checked="modelValue" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
  props: ['modelValue', 'size'],
}

const ElInputNumberStub = {
  template: '<input type="number" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />',
  props: ['modelValue', 'min', 'max', 'step', 'size', 'controls-position'],
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
  ElDrawer: ElDrawerStub,
  ElRadioButton: ElRadioButtonStub,
  ElRadioGroup: ElRadioGroupStub,
  ElInput: ElInputStub,
  ElSelect: ElSelectStub,
  ElOption: ElOptionStub,
  ElSwitch: ElSwitchStub,
  ElInputNumber: ElInputNumberStub,
}

function mountSettings(visible: boolean, settings: ChatSettings = defaultSettings) {
  const wrapper = mount(AiChatSettings, {
    props: { visible, settings },
    global: { stubs },
  })
  return {
    wrapper,
    text: () => wrapper.text(),
    findButton: (label: string) =>
      wrapper.findAll('button').find((b) => b.text().trim() === label)?.element,
  }
}

describe('AiChatSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders when visible is true', () => {
    const { wrapper, text } = mountSettings(true)
    expect(text()).toContain('连接状态')
    expect(text()).toContain('用户偏好')
    expect(text()).toContain('对话历史摘要')
    wrapper.unmount()
  })

  it('does not render content when visible is false', () => {
    const { wrapper, text } = mountSettings(false)
    expect(text()).not.toContain('用户偏好')
    wrapper.unmount()
  })

  it('emits update:settings on save', async () => {
    const { wrapper, findButton } = mountSettings(true)
    const saveBtn = findButton('保存')
    expect(saveBtn).toBeTruthy()
    saveBtn!.click()
    await wrapper.vm.$nextTick()
    expect(wrapper.emitted('update:settings')).toBeTruthy()
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
})
