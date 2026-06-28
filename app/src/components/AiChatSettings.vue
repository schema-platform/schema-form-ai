<script setup lang="ts">
import { ref, watch } from 'vue'
import type { ChatSettings } from '@/types'
import { checkAIHealth, type AIHealthResponse } from '@/api/aiApi'

const props = defineProps<{
  visible: boolean
  settings: ChatSettings
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'update:settings': [settings: ChatSettings]
}>()

const localSettings = ref<ChatSettings>(JSON.parse(JSON.stringify(props.settings)))
const healthData = ref<AIHealthResponse | null>(null)
const healthLoading = ref(false)

async function fetchHealth(): Promise<void> {
  healthLoading.value = true
  try {
    healthData.value = await checkAIHealth()
  } catch {
    healthData.value = null
  } finally {
    healthLoading.value = false
  }
}

watch(() => props.visible, (val) => {
  if (val) {
    localSettings.value = JSON.parse(JSON.stringify(props.settings))
    fetchHealth()
  }
})

function handleClose(): void {
  emit('update:visible', false)
}

function handleSave(): void {
  emit('update:settings', JSON.parse(JSON.stringify(localSettings.value)))
  emit('update:visible', false)
}
</script>

<template>
  <el-drawer
    :model-value="visible"
    title="对话设置"
    :size="320"
    @update:model-value="handleClose"
  >
    <!-- 连接状态 -->
    <div class="prop-section">
      <div class="prop-section__title">连接状态</div>
      <div class="prop-section__body">
        <div v-if="healthLoading" class="status-row">
          <span class="status-dot status-checking"></span>
          <span>检测中...</span>
        </div>
        <div v-else-if="healthData">
          <div class="status-row">
            <span :class="['status-dot', healthData.status === 'ok' ? 'status-ok' : 'status-error']"></span>
            <span>{{ healthData.status === 'ok' ? 'API Key 已配置' : '未配置 API Key' }}</span>
          </div>
          <div v-if="healthData.providers.length > 0" class="provider-list">
            <div v-for="p in healthData.providers" :key="p.name" class="provider-item">
              <span>{{ p.name }} <span v-if="p.isDefault" class="badge">默认</span></span>
              <span class="provider-model">{{ p.model }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 用户偏好 -->
    <div class="prop-section">
      <div class="prop-section__title">用户偏好</div>
      <div class="prop-section__body">
        <div class="form-item">
          <label>回复语言</label>
          <el-radio-group v-model="localSettings.preferences.replyLanguage" size="small">
            <el-radio-button value="zh-CN">中文</el-radio-button>
            <el-radio-button value="en-US">English</el-radio-button>
          </el-radio-group>
        </div>
        <div class="form-item">
          <label>回复风格</label>
          <el-radio-group v-model="localSettings.preferences.replyStyle" size="small">
            <el-radio-button value="concise">简洁</el-radio-button>
            <el-radio-button value="detailed">详细</el-radio-button>
          </el-radio-group>
        </div>
        <div class="form-item">
          <label>代码注释</label>
          <el-radio-group v-model="localSettings.preferences.codeComment" size="small">
            <el-radio-button value="yes">是</el-radio-button>
            <el-radio-button value="no">否</el-radio-button>
          </el-radio-group>
        </div>
      </div>
    </div>

    <!-- 对话历史摘要 -->
    <div class="prop-section">
      <div class="prop-section__title">对话历史摘要</div>
      <div class="prop-section__body">
        <div class="form-item">
          <label>生成方式</label>
          <el-radio-group v-model="localSettings.historySummary.mode" size="small">
            <el-radio-button value="auto">自动</el-radio-button>
            <el-radio-button value="manual">手动</el-radio-button>
          </el-radio-group>
        </div>
        <div v-if="localSettings.historySummary.mode === 'manual'" class="form-item">
          <label>手动摘要</label>
          <el-input
            v-model="localSettings.historySummary.manualSummary"
            type="textarea"
            :rows="3"
            size="small"
            resize="vertical"
            placeholder="输入对话历史摘要..."
          />
        </div>
      </div>
    </div>

    <template #footer>
      <el-button size="small" @click="handleClose">取消</el-button>
      <el-button type="primary" size="small" @click="handleSave">保存</el-button>
    </template>
  </el-drawer>
</template>

<style scoped>
:deep(.el-drawer__header) {
  height: 50px;
  padding: 0 16px;
  margin-bottom: 0;
}

.prop-section {
  margin-bottom: 2px;
  border-radius: 6px;
}

.prop-section__title {
  font-size: 11px;
  font-weight: 600;
  color: #606266;
  padding: 0 12px;
  height: 32px;
  line-height: 32px;
  background: #f5f7fa;
  border-bottom: 1px solid #f0f2f5;
}

.prop-section__body {
  padding: 8px 12px;
}

.form-item {
  margin-bottom: 8px;
}

.form-item:last-child {
  margin-bottom: 0;
}

.form-item label {
  display: block;
  font-size: 11px;
  color: #909399;
  margin-bottom: 4px;
}

.form-item :deep(.el-textarea__inner) {
  min-height: 60px !important;
  height: auto !important;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.status-ok {
  background: #67c23a;
}

.status-error {
  background: #f56c6c;
}

.status-checking {
  background: #e6a23c;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.provider-list {
  margin-top: 8px;
}

.provider-item {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 4px 0;
}

.provider-model {
  color: #909399;
}

.badge {
  font-size: 10px;
  padding: 1px 4px;
  background: #ecf5ff;
  color: #409eff;
  border-radius: 2px;
}
</style>
