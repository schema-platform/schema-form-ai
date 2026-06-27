/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AiFieldEditor from '@/components/AiFieldEditor.vue'
import type { EditContext } from '@/composables/usePreviewInteraction'

// Stub Element Plus components
const ElInputStub = { template: '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />', props: ['modelValue', 'placeholder'], emits: ['update:modelValue'] }
const ElSelectStub = { template: '<select><slot /></select>', props: ['modelValue', 'placeholder'], emits: ['update:modelValue'] }
const ElOptionStub = { template: '<option />', props: ['label', 'value'] }
const ElButtonStub = { template: '<button><slot /></button>', props: ['type'] }

const globalStubs = {
  ElInput: ElInputStub,
  ElSelect: ElSelectStub,
  ElOption: ElOptionStub,
  ElButton: ElButtonStub,
  // t-dialog, t-form, t-form-item, t-switch are stubbed globally in setup.ts
}

describe('AiFieldEditor', () => {
  const mockFieldContext: EditContext = {
    type: 'field',
    id: 'w1',
    data: {
      type: 'input',
      label: '用户名',
      field: 'username',
      placeholder: '请输入用户名',
      required: true,
    },
  }

  const mockNodeContext: EditContext = {
    type: 'node',
    id: 'n1',
    data: {
      bpmnType: 'userTask',
      label: '审批任务',
      description: '处理审批请求',
    },
  }

  it('renders dialog when visible is true', () => {
    const wrapper = mount(AiFieldEditor, {
      props: {
        visible: true,
        context: mockFieldContext,
      },
      global: { stubs: globalStubs },
    })

    expect(wrapper.text()).toContain('编辑属性')
  })

  it('does not render dialog when visible is false', () => {
    const wrapper = mount(AiFieldEditor, {
      props: {
        visible: false,
        context: mockFieldContext,
      },
      global: { stubs: globalStubs },
    })

    // t-dialog stub uses v-if="visible", so content should not render
    expect(wrapper.text()).not.toContain('编辑属性')
  })

  it('renders field form fields for field context', () => {
    const wrapper = mount(AiFieldEditor, {
      props: {
        visible: true,
        context: mockFieldContext,
      },
      global: { stubs: globalStubs },
    })

    expect(wrapper.text()).toContain('标签')
    expect(wrapper.text()).toContain('字段名')
    expect(wrapper.text()).toContain('占位符')
    expect(wrapper.text()).toContain('必填')
  })

  it('renders node form fields for node context', () => {
    const wrapper = mount(AiFieldEditor, {
      props: {
        visible: true,
        context: mockNodeContext,
      },
      global: { stubs: globalStubs },
    })

    expect(wrapper.text()).toContain('标签')
    expect(wrapper.text()).toContain('描述')
  })

  it('shows type info', () => {
    const wrapper = mount(AiFieldEditor, {
      props: {
        visible: true,
        context: mockFieldContext,
      },
      global: { stubs: globalStubs },
    })

    expect(wrapper.text()).toContain('类型：')
    expect(wrapper.text()).toContain('input')
  })

  it('emits save when save button is clicked', async () => {
    const wrapper = mount(AiFieldEditor, {
      props: {
        visible: true,
        context: mockFieldContext,
      },
      global: { stubs: globalStubs },
    })

    const saveBtn = wrapper.findAll('button').find((b) => b.text() === '保存')
    expect(saveBtn).toBeTruthy()
    await saveBtn!.trigger('click')

    expect(wrapper.emitted('save')).toBeTruthy()
    expect(wrapper.emitted('save')![0][0]).toBe('w1')
  })

  it('emits cancel when cancel button is clicked', async () => {
    const wrapper = mount(AiFieldEditor, {
      props: {
        visible: true,
        context: mockFieldContext,
      },
      global: { stubs: globalStubs },
    })

    const cancelBtn = wrapper.findAll('button').find((b) => b.text() === '取消')
    expect(cancelBtn).toBeTruthy()
    await cancelBtn!.trigger('click')

    expect(wrapper.emitted('cancel')).toBeTruthy()
  })

  it('emits update:visible when dialog is closed', async () => {
    const wrapper = mount(AiFieldEditor, {
      props: {
        visible: true,
        context: mockFieldContext,
      },
      global: { stubs: globalStubs },
    })

    // Find the t-dialog component and trigger close event
    const tDialog = wrapper.findComponent({ name: 't-dialog' })
    expect(tDialog.exists()).toBe(true)
    await tDialog.vm.$emit('close')

    expect(wrapper.emitted('update:visible')).toBeTruthy()
    expect(wrapper.emitted('update:visible')![0]).toEqual([false])
  })
})
