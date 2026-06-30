<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import type { TaskChainStep } from '@/types'

const props = defineProps<{
  steps: TaskChainStep[]
  currentIndex: number
}>()

const scrollbarRef = ref<HTMLElement>()

function getStepIcon(status: TaskChainStep['status']): string {
  switch (status) {
    case 'done': return '✓'
    case 'running': return '●'
    case 'skipped': return '○'
    default: return '○'
  }
}

function getAgentLabel(agent: 'editor' | 'flow' | 'page'): string {
  if (agent === 'editor') return '表单'
  if (agent === 'flow') return '流程'
  return '页面'
}

// 自动滚动到当前步骤
watch(() => props.currentIndex, () => {
  nextTick(() => {
    const wrap = scrollbarRef.value
    if (!wrap) return
    const stepEls = wrap.querySelectorAll<HTMLElement>('[data-step]')
    const current = stepEls[props.currentIndex]
    if (current) {
      current.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  })
})
</script>

<template>
  <div :class="$style.bar">
    <div :class="$style.label">任务链</div>
    <div ref="scrollbarRef" :class="$style.scrollWrap">
      <div :class="$style.steps">
        <template v-for="(step, idx) in steps" :key="idx">
          <div
            :data-step="idx"
            :class="[
              $style.step,
              $style[step.status],
              idx === currentIndex ? $style.current : '',
            ]"
          >
            <span :class="$style.stepIcon">{{ getStepIcon(step.status) }}</span>
            <span :class="$style.stepAgent">{{ getAgentLabel(step.agent) }}</span>
            <span :class="$style.stepDesc">{{ step.description }}</span>
          </div>
          <div v-if="idx < steps.length - 1" :class="$style.arrow">→</div>
        </template>
      </div>
    </div>
  </div>
</template>

<style module src="./TaskChainBar.module.scss" />
