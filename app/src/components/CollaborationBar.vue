<script setup lang="ts">
/**
 * 协作状态栏
 *
 * 显示当前会话的参与者列表和连接状态。
 * 支持邀请链接复制和离开协作。
 */

import { computed } from 'vue'

interface Props {
  /** 参与者 ID 列表 */
  participants: string[]
  /** 当前用户 ID */
  currentUserId: string
  /** Socket 连接状态 */
  connected: boolean
  /** 会话 ID（用于生成邀请链接） */
  conversationId?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  leave: []
  copyInvite: [conversationId: string]
}>()

const participantCount = computed(() => props.participants.length)
const isCollaborating = computed(() => participantCount.value > 1)

function handleCopyInvite(): void {
  if (props.conversationId) {
    emit('copyInvite', props.conversationId)
  }
}

function handleLeave(): void {
  emit('leave')
}
</script>

<template>
  <div :class="$style.bar">
    <!-- 连接状态指示器 -->
    <div :class="$style.status">
      <span :class="[$style.dot, connected ? $style.dotOnline : $style.dotOffline]" />
      <span :class="$style.statusText">
        {{ connected ? '已连接' : '未连接' }}
      </span>
    </div>

    <!-- 参与者列表 -->
    <div v-if="isCollaborating" :class="$style.participants">
      <span :class="$style.label">协作者:</span>
      <div :class="$style.avatarGroup">
        <div
          v-for="p in participants.slice(0, 5)"
          :key="p"
          :class="[$style.avatar, p === currentUserId ? $style.avatarSelf : '']"
          :title="p === currentUserId ? `${p} (我)` : p"
        >
          {{ p.charAt(0).toUpperCase() }}
        </div>
        <div v-if="participants.length > 5" :class="$style.avatarMore">
          +{{ participants.length - 5 }}
        </div>
      </div>
      <span :class="$style.count">{{ participantCount }} 人</span>
    </div>

    <!-- 操作按钮 -->
    <div :class="$style.actions">
      <el-button
        v-if="conversationId"
        :class="$style.btn"
        title="复制邀请链接"
        link
        @click="handleCopyInvite"
      >
        <svg :class="$style.icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </el-button>
      <el-button
        v-if="isCollaborating"
        :class="[$style.btn, $style.btnLeave]"
        title="离开协作"
        link
        @click="handleLeave"
      >
        <svg :class="$style.icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </el-button>
    </div>
  </div>
</template>

<style module src="./CollaborationBar.module.scss" />
