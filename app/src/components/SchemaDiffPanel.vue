<script setup lang="ts">
import { computed } from 'vue'
import type { SchemaDiff } from '@/types'

export interface SchemaDiffPanelProps {
  diff: SchemaDiff
  description?: string | null
}

const props = defineProps<SchemaDiffPanelProps>()

const emit = defineEmits<{
  undo: []
  dismiss: []
}>()

const addedItems = computed(() => props.diff.changes.filter((c) => c.type === 'add'))
const removedItems = computed(() => props.diff.changes.filter((c) => c.type === 'remove'))
const modifiedItems = computed(() => props.diff.changes.filter((c) => c.type === 'modify'))

const hasChanges = computed(() =>
  props.diff.added > 0 ||
  props.diff.removed > 0 ||
  props.diff.modified > 0,
)

const changeCount = computed(() =>
  props.diff.added + props.diff.removed + props.diff.modified,
)
</script>

<template>
  <div v-if="hasChanges" :class="$style.panel">
    <!-- Header -->
    <div :class="$style.header">
      <span :class="$style.title">Schema 已更新</span>
      <span :class="$style.count">{{ changeCount }} 处变更</span>
      <div :class="$style.actions">
        <el-button :class="$style.undoBtn" link @click="emit('undo')">
          撤销
        </el-button>
        <el-button :class="$style.dismissBtn" theme="primary" @click="emit('dismiss')">
          确认
        </el-button>
      </div>
    </div>

    <!-- Description -->
    <div v-if="description" :class="$style.description">
      {{ description }}
    </div>

    <!-- Diff details -->
    <div :class="$style.diffList">
      <!-- Added -->
      <div
        v-for="item in addedItems"
        :key="'add-' + item.widgetId"
        :class="[$style.diffItem, $style.added]"
      >
        <span :class="$style.badge">+ 新增</span>
        <span :class="$style.itemType">{{ item.widgetType }}</span>
        <span :class="$style.itemLabel">{{ item.summary }}</span>
      </div>

      <!-- Modified -->
      <div
        v-for="item in modifiedItems"
        :key="'mod-' + item.widgetId"
        :class="[$style.diffItem, $style.modified]"
      >
        <span :class="$style.badge">~ 修改</span>
        <span :class="$style.itemType">{{ item.widgetType }}</span>
        <span :class="$style.itemLabel">{{ item.summary }}</span>
      </div>

      <!-- Removed -->
      <div
        v-for="item in removedItems"
        :key="'rem-' + item.widgetId"
        :class="[$style.diffItem, $style.removed]"
      >
        <span :class="$style.badge">- 删除</span>
        <span :class="$style.itemType">{{ item.widgetType }}</span>
        <span :class="$style.itemLabel">{{ item.summary }}</span>
      </div>
    </div>
  </div>
</template>

<style module src="./SchemaDiffPanel.module.scss" />
