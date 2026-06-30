<script setup lang="ts">
/**
 * AI 版本对比组件
 *
 * 并排显示两个版本的内容差异。
 * 支持 Schema (Widget[]) 和 Flow (FlowGraph) 的对比。
 */

import { computed } from 'vue'
import type { Widget, FlowGraph } from '@/types'

export interface AiVersionCompareProps {
  /** 当前版本内容 */
  current: Widget[] | FlowGraph | null
  /** 对比版本内容 */
  compare: Widget[] | FlowGraph | null
  /** 当前版本标签 */
  currentLabel?: string
  /** 对比版本标签 */
  compareLabel?: string
  /** 内容类型 */
  type: 'schema' | 'flow'
}

const props = withDefaults(defineProps<AiVersionCompareProps>(), {
  currentLabel: '当前版本',
  compareLabel: '对比版本',
})

const emit = defineEmits<{
  close: []
}>()

// ---- Schema 对比 ----

interface SchemaDiff {
  field: string
  current: string
  compare: string
  status: 'added' | 'removed' | 'changed' | 'same'
}

const schemaDiffs = computed<SchemaDiff[]>(() => {
  if (props.type !== 'schema') return []

  const currentWidgets = (props.current as Widget[]) ?? []
  const compareWidgets = (props.compare as Widget[]) ?? []

  const currentMap = new Map(currentWidgets.map((w) => [w.id, w]))
  const compareMap = new Map(compareWidgets.map((w) => [w.id, w]))

  const diffs: SchemaDiff[] = []

  // 检查新增和修改
  for (const [id, current] of currentMap) {
    const compare = compareMap.get(id)
    if (!compare) {
      diffs.push({
        field: current.label ?? current.field ?? current.type,
        current: current.type,
        compare: '-',
        status: 'added',
      })
    } else if (JSON.stringify(current) !== JSON.stringify(compare)) {
      diffs.push({
        field: current.label ?? current.field ?? current.type,
        current: current.type,
        compare: compare.type,
        status: 'changed',
      })
    } else {
      diffs.push({
        field: current.label ?? current.field ?? current.type,
        current: current.type,
        compare: compare.type,
        status: 'same',
      })
    }
  }

  // 检查删除
  for (const [id, compare] of compareMap) {
    if (!currentMap.has(id)) {
      diffs.push({
        field: compare.label ?? compare.field ?? compare.type,
        current: '-',
        compare: compare.type,
        status: 'removed',
      })
    }
  }

  return diffs
})

// ---- Flow 对比 ----

interface FlowDiff {
  element: string
  type: 'node' | 'edge'
  current: string
  compare: string
  status: 'added' | 'removed' | 'changed' | 'same'
}

const flowDiffs = computed<FlowDiff[]>(() => {
  if (props.type !== 'flow') return []

  const currentFlow = (props.current as FlowGraph) ?? { nodes: [], edges: [] }
  const compareFlow = (props.compare as FlowGraph) ?? { nodes: [], edges: [] }

  const diffs: FlowDiff[] = []

  // 对比节点
  const currentNodes = new Map(currentFlow.nodes.map((n) => [n.id, n]))
  const compareNodes = new Map(compareFlow.nodes.map((n) => [n.id, n]))

  for (const [id, node] of currentNodes) {
    const compare = compareNodes.get(id)
    if (!compare) {
      diffs.push({
        element: node.data.label ?? node.data.bpmnType ?? id,
        type: 'node',
        current: node.data.bpmnType,
        compare: '-',
        status: 'added',
      })
    } else if (JSON.stringify(node) !== JSON.stringify(compare)) {
      diffs.push({
        element: node.data.label ?? node.data.bpmnType ?? id,
        type: 'node',
        current: node.data.bpmnType,
        compare: compare.data.bpmnType,
        status: 'changed',
      })
    } else {
      diffs.push({
        element: node.data.label ?? node.data.bpmnType ?? id,
        type: 'node',
        current: node.data.bpmnType,
        compare: compare.data.bpmnType,
        status: 'same',
      })
    }
  }

  for (const [id, node] of compareNodes) {
    if (!currentNodes.has(id)) {
      diffs.push({
        element: node.data.label ?? node.data.bpmnType ?? id,
        type: 'node',
        current: '-',
        compare: node.data.bpmnType,
        status: 'removed',
      })
    }
  }

  // 对比边
  const currentEdges = new Map(currentFlow.edges.map((e) => [e.id, e]))
  const compareEdges = new Map(compareFlow.edges.map((e) => [e.id, e]))

  for (const [id, edge] of currentEdges) {
    const compare = compareEdges.get(id)
    if (!compare) {
      diffs.push({
        element: id,
        type: 'edge',
        current: `${edge.source.cell} → ${edge.target.cell}`,
        compare: '-',
        status: 'added',
      })
    } else if (JSON.stringify(edge) !== JSON.stringify(compare)) {
      diffs.push({
        element: id,
        type: 'edge',
        current: `${edge.source.cell} → ${edge.target.cell}`,
        compare: `${compare.source.cell} → ${compare.target.cell}`,
        status: 'changed',
      })
    }
  }

  for (const [id, edge] of compareEdges) {
    if (!currentEdges.has(id)) {
      diffs.push({
        element: id,
        type: 'edge',
        current: '-',
        compare: `${edge.source.cell} → ${edge.target.cell}`,
        status: 'removed',
      })
    }
  }

  return diffs
})

const hasDiffs = computed(() => {
  if (props.type === 'schema') {
    return schemaDiffs.value.some((d) => d.status !== 'same')
  }
  return flowDiffs.value.some((d) => d.status !== 'same')
})

const summary = computed(() => {
  if (props.type === 'schema') {
    const added = schemaDiffs.value.filter((d) => d.status === 'added').length
    const removed = schemaDiffs.value.filter((d) => d.status === 'removed').length
    const changed = schemaDiffs.value.filter((d) => d.status === 'changed').length
    return { added, removed, changed }
  }
  const added = flowDiffs.value.filter((d) => d.status === 'added').length
  const removed = flowDiffs.value.filter((d) => d.status === 'removed').length
  const changed = flowDiffs.value.filter((d) => d.status === 'changed').length
  return { added, removed, changed }
})

function getStatusColor(status: string): string {
  switch (status) {
    case 'added': return '#67c23a'
    case 'removed': return '#f56c6c'
    case 'changed': return '#e6a23c'
    default: return '#909399'
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'added': return '新增'
    case 'removed': return '删除'
    case 'changed': return '修改'
    default: return '相同'
  }
}
</script>

<template>
  <div :class="$style.compare">
    <div :class="$style.header">
      <span :class="$style.title">版本对比</span>
      <el-button :class="$style.closeBtn" @click="emit('close')">
        &times;
      </el-button>
    </div>

    <!-- Summary -->
    <div :class="$style.summary" data-testid="summary">
      <span :class="$style.summaryItem" data-testid="summary-added">
        <span :class="$style.dot" :style="{ background: '#67c23a' }" />
        新增 {{ summary.added }}
      </span>
      <span :class="$style.summaryItem" data-testid="summary-removed">
        <span :class="$style.dot" :style="{ background: '#f56c6c' }" />
        删除 {{ summary.removed }}
      </span>
      <span :class="$style.summaryItem" data-testid="summary-changed">
        <span :class="$style.dot" :style="{ background: '#e6a23c' }" />
        修改 {{ summary.changed }}
      </span>
    </div>

    <!-- Diff table -->
    <t-scrollbar :class="$style.scrollbar">
      <div v-if="!hasDiffs" :class="$style.noDiff" data-testid="no-diff">
        <span>两个版本完全相同</span>
      </div>

      <table v-else :class="$style.table">
        <thead>
          <tr>
            <th :class="$style.th">{{ type === 'schema' ? '字段' : '元素' }}</th>
            <th :class="$style.th">{{ currentLabel }}</th>
            <th :class="$style.th">{{ compareLabel }}</th>
            <th :class="$style.th">状态</th>
          </tr>
        </thead>
        <tbody>
          <!-- Schema diffs -->
          <template v-if="type === 'schema'">
            <tr
              v-for="(diff, idx) in schemaDiffs"
              :key="idx"
              :class="[$style.tr, $style[`tr${diff.status}`]]"
            >
              <td :class="$style.td">{{ diff.field }}</td>
              <td :class="$style.td">{{ diff.current }}</td>
              <td :class="$style.td">{{ diff.compare }}</td>
              <td :class="$style.td">
                <span
                  :class="$style.statusBadge"
                  :style="{ background: getStatusColor(diff.status) }"
                >
                  {{ getStatusLabel(diff.status) }}
                </span>
              </td>
            </tr>
          </template>

          <!-- Flow diffs -->
          <template v-if="type === 'flow'">
            <tr
              v-for="(diff, idx) in flowDiffs"
              :key="idx"
              :class="[$style.tr, $style[`tr${diff.status}`]]"
            >
              <td :class="$style.td">
                <span :class="$style.elementType">{{ diff.type === 'node' ? 'N' : 'E' }}</span>
                {{ diff.element }}
              </td>
              <td :class="$style.td">{{ diff.current }}</td>
              <td :class="$style.td">{{ diff.compare }}</td>
              <td :class="$style.td">
                <span
                  :class="$style.statusBadge"
                  :style="{ background: getStatusColor(diff.status) }"
                >
                  {{ getStatusLabel(diff.status) }}
                </span>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </t-scrollbar>
  </div>
</template>

<style module src="./AiVersionCompare.module.scss" />
