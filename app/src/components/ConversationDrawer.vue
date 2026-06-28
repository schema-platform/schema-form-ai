<script setup lang="ts">
import { computed } from 'vue'
import type { Conversation } from '@/types'

const props = defineProps<{
  visible: boolean
  conversations: Conversation[]
  activeId?: string
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  select: [id: string]
  delete: [id: string]
}>()

const sortedConversations = computed(() => {
  return [...props.conversations].sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
})

function formatTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - date.getTime()

  if (diff < 86400000 && date.getDate() === now.getDate()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.getDate() === yesterday.getDate() &&
      date.getMonth() === yesterday.getMonth() &&
      date.getFullYear() === yesterday.getFullYear()) {
    return '昨天'
  }

  return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
}

function getSourceLabel(source: string): string {
  const labels: Record<string, string> = {
    editor: 'Editor',
    flow: 'Flow',
    page: 'Page',
    standalone: '独立',
  }
  return labels[source] ?? source
}

function handleClose(): void {
  emit('update:visible', false)
}

function handleSelect(id: string): void {
  emit('select', id)
}

function handleDelete(id: string, event: Event): void {
  event.stopPropagation()
  emit('delete', id)
}
</script>

<template>
  <el-drawer
    :model-value="visible"
    title="对话历史"
    :size="280"
    direction="ltr"
    @update:model-value="handleClose"
  >
    <div class="conversation-list">
      <div v-if="sortedConversations.length === 0" class="empty">
        暂无对话记录
      </div>
      <div
        v-for="conv in sortedConversations"
        :key="conv.id"
        :class="['conversation-item', { active: conv.id === activeId }]"
        @click="handleSelect(conv.id)"
      >
        <div class="conversation-title">{{ conv.title || '新对话' }}</div>
        <div class="conversation-meta">
          <span class="source">{{ getSourceLabel(conv.source) }}</span>
          <span class="time">{{ formatTime(conv.updatedAt) }}</span>
        </div>
        <button class="delete-btn" @click="(e: Event) => handleDelete(conv.id, e)">×</button>
      </div>
    </div>
  </el-drawer>
</template>

<style scoped>
.conversation-list {
  padding: 4px 0;
}

.empty {
  text-align: center;
  color: #909399;
  font-size: 12px;
  padding: 20px 0;
}

.conversation-item {
  position: relative;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.conversation-item:hover {
  background: #f5f7fa;
}

.conversation-item.active {
  background: #ecf5ff;
}

.conversation-title {
  font-size: 13px;
  color: #303133;
  margin-bottom: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding-right: 20px;
}

.conversation-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: #909399;
}

.source {
  padding: 1px 4px;
  background: #f0f2f5;
  border-radius: 2px;
}

.delete-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: #909399;
  font-size: 16px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.conversation-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  color: #f56c6c;
}
</style>
