/**
 * Vitest setup — 全局注册 Element Plus 组件 & TDesign 组件 stub
 *
 * 测试环境中 Element Plus 组件未自动注册，
 * 需要在此手动注册常用组件或 mock。
 */
import { config } from '@vue/test-utils'
import { ElButton, ElInput, ElDialog, ElForm, ElFormItem, ElSelect, ElOption, ElSwitch, ElCheckbox, ElRadioGroup, ElRadioButton, ElTag, ElIcon, ElEmpty, ElTooltip, ElPopover, ElLoading, ElCheckboxGroup, ElDatePicker } from 'element-plus'

// TDesign 组件 mock（全局 stubs）
// 使用 object 形式以确保 Vue Test Utils 正确合并
config.global.stubs = {
  ...config.global.stubs,
  // TDesign 组件 mock
  't-button': { template: '<button><slot /></button>' },
  't-dialog': {
    name: 't-dialog',
    template: '<div v-if="visible"><div class="t-dialog__header">{{ header }}</div><slot /><slot name="footer" /></div>',
    props: ['visible', 'header', 'width', 'closeOnClickModal', 'closeBtn', 'destroyOnClose', 'zIndex'],
    emits: ['close', 'update:visible'],
  },
  't-form': { template: '<form><slot /></form>' },
  't-form-item': {
    template: '<div class="t-form-item"><label v-if="label" class="t-form-item__label">{{ label }}</label><slot /></div>',
    props: ['label', 'labelAlign', 'labelWidth', 'name', 'requiredMark'],
  },
  't-switch': {
    template: '<input type="checkbox" :checked="modelValue || value" @change="$emit(\'update:modelValue\', $event.target.checked); $emit(\'update:value\', $event.target.checked)" />',
    props: ['modelValue', 'value', 'disabled', 'size', 'label'],
    emits: ['update:modelValue', 'update:value', 'change'],
  },
  't-radio-button': {
    template: '<button :class="{ active: value === parentValue }" @click="$emit(\'click\')"><slot /></button>',
    props: ['value', 'disabled'],
    inject: {
      parentValue: { from: 't-radio-group-modelValue', default: undefined },
    },
  },
  't-radio-group': {
    template: '<div class="t-radio-group"><slot /></div>',
    props: ['modelValue', 'value', 'disabled', 'variant', 'size'],
    emits: ['update:modelValue', 'update:value', 'change'],
    provide() {
      return { 't-radio-group-modelValue': this.modelValue ?? this.value }
    },
  },
  't-radio': {
    template: '<label><input type="radio" :value="value" /><slot /></label>',
    props: ['value', 'disabled'],
  },
  't-select': { template: '<select><slot /></select>' },
  't-option': { template: '<option :value="value">{{ label }}</option>', props: ['label', 'value'] },
  't-date-range-picker': { template: '<div><slot /></div>' },
  't-input': { template: '<input />' },
  't-textarea': {
    template: '<textarea :value="modelValue || value" @input="$emit(\'update:modelValue\', $event.target.value); $emit(\'update:value\', $event.target.value)"></textarea>',
    props: ['modelValue', 'value', 'rows', 'placeholder', 'disabled', 'maxlength', 'autosize'],
    emits: ['update:modelValue', 'update:value'],
  },
  't-tag': { template: '<span class="t-tag"><slot /></span>', props: ['theme', 'variant', 'closable', 'size'] },
  't-loading': { template: '<div><slot /></div>' },
  't-slider': { template: '<input type="range" />', props: ['modelValue', 'value', 'disabled', 'min', 'max', 'step'] },
  't-rate': { template: '<div class="t-rate" />', props: ['modelValue', 'value', 'disabled'] },
  't-checkbox': {
    template: '<label class="t-checkbox"><input type="checkbox" :checked="modelValue || value" /><slot /></label>',
    props: ['modelValue', 'value', 'disabled'],
    emits: ['update:modelValue', 'update:value'],
  },
  't-checkbox-group': {
    template: '<div class="t-checkbox-group"><slot /></div>',
    props: ['modelValue', 'value', 'disabled'],
    emits: ['update:modelValue', 'update:value'],
  },
  't-popconfirm': { template: '<div><slot /><slot name="content" /></div>' },
  't-tooltip': { template: '<span><slot /></span>' },
}

// 全局注册 Element Plus 组件
config.global.components = {
  ...config.global.components,
  ElButton,
  ElInput,
  ElDialog,
  ElForm,
  ElFormItem,
  ElSelect,
  ElOption,
  ElSwitch,
  ElCheckbox,
  ElCheckboxGroup,
  ElRadioGroup,
  ElRadioButton,
  ElTag,
  ElIcon,
  ElEmpty,
  ElTooltip,
  ElPopover,
  ElDatePicker,
}

// 全局注册 Element Plus 指令
config.global.directives = {
  ...config.global.directives,
  loading: ElLoading,
}
