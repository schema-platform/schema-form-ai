<script setup lang="ts">
/**
 * AI 版本列表组件
 *
 * 显示当前对话的所有生成物版本，支持：
 * - 版本列表查看
 * - 版本恢复
 * - 版本对比
 */

import { computed } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import type { AIVersion } from '@/types'

export interface AiVersionListProps {
  versions: AIVersion[]
  loading?: boolean
  currentVersionId?: string
}

const props = withDefaults(defineProps<AiVersionListProps>(), {
  loading: false,
})

const emit = defineEmits<{
  restore: [versionId: string]
  compare: [versionId: string]
}>()

const isEmpty = computed(() => props.versions.length === 0 && !props.loading)

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getTypeLabel(type: AIVersion['type']): string {
  return type === 'schema' ? 'Schema' : 'Flow'
}

function getTypeColor(type: AIVersion['type']): string {
  return type === 'schema' ? '#409eff' : '#67c23a'
}
</script>

<template>
  <div :class="$style.versionList">
    <div :class="$style.header">
      <span :class="$style.title">版本历史</span>
      <span :class="$style.count">{{ versions.length }} 个版本</span>
    </div>

    <!-- Loading state -->
    <div v-if="loading" :class="$style.loading" data-testid="loading">
      <el-icon :class="$style.loadingIcon"><Loading /></el-icon>
      <span>加载中...</span>
    </div>

    <!-- Empty state -->
    <div v-else-if="isEmpty" :class="$style.empty" data-testid="empty">
      <div :class="$style.emptyIcon">&#x1F4E6;</div>
      <div :class="$style.emptyText">暂无版本记录</div>
      <div :class="$style.emptyHint">生成内容后将自动保存版本</div>
    </div>

    <!-- Version list -->
    <el-scrollbar v-else :class="$style.scrollbar">
      <div :class="$style.items">
        <div
          v-for="version in versions"
          :key="version.id"
          :class="[
            $style.item,
            { [$style.itemActive]: version.id === currentVersionId },
          ]"
          :data-testid="`version-${version.id}`"
        >
          <div :class="$style.itemHeader">
            <span :class="$style.versionNumber" data-testid="version-number">v{{ version.version }}</span>
            <el-tag
              :color="getTypeColor(version.type)"
              size="small"
              :class="$style.typeTag"
              data-testid="version-type"
            >
              {{ getTypeLabel(version.type) }}
            </el-tag>
            <span :class="$style.time">{{ formatDate(version.createdAt) }}</span>
          </div>

          <div v-if="version.description" :class="$style.description" data-testid="version-description">
            {{ version.description }}
          </div>

          <div :class="$style.actions">
            <el-button
              size="small"
              :class="$style.btnRestore"
              data-testid="btn-restore"
              @click="emit('restore', version.id)"
            >
              恢复此版本
            </el-button>
            <el-button
              size="small"
              :class="$style.btnCompare"
              data-testid="btn-compare"
              @click="emit('compare', version.id)"
            >
              对比
            </el-button>
          </div>
        </div>
      </div>
    </el-scrollbar>
  </div>
</template>

<style module src="./AiVersionList.module.scss" />
