<script setup lang="ts">
/**
 * RAG 知识库管理页面
 *
 * 简洁设计：
 * - 顶部状态概览
 * - 搜索测试区域
 * - 索引管理列表
 */

import { ref, onMounted, computed } from 'vue'
import { message, confirmDanger } from '@schema-platform/platform-shared/utils/message'
import { useDataLoading } from '@schema-platform/platform-shared/utils/useDataLoading'
import {
  getRagStatus,
  reindexAllRag,
  reindexSingleRag,
  deleteRagEmbedding,
  searchRag,
} from '@/api/aiApi'
import type {
  RagStatusData,
  RagReindexResult,
} from '@/api/aiApi'
import type { RagSearchResult } from '@/types'
import AppIcon from '@schema-platform/platform-shared/components/common/AppIcon.vue'

// ---- State ----

const { loading, withLoading: withStatusLoading } = useDataLoading({ timeout: 15000 })
const { loading: reindexing, withLoading: withReindexLoading } = useDataLoading({ timeout: 30000 })
const status = ref<RagStatusData | null>(null)
const lastReindexResult = ref<RagReindexResult | null>(null)

// ---- Bulk operations ----

const bulkMode = ref(false)
const selectedIds = ref<Set<string>>(new Set())
const bulkProcessing = ref(false)

function toggleBulkMode() {
  bulkMode.value = !bulkMode.value
  selectedIds.value.clear()
}

function toggleSelect(id: string) {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

async function handleBulkReindex() {
  if (selectedIds.value.size === 0) return
  bulkProcessing.value = true
  let success = 0
  let fail = 0
  for (const id of selectedIds.value) {
    try {
      await reindexSingleRag(id)
      success++
    } catch {
      fail++
    }
  }
  bulkProcessing.value = false
  if (fail === 0) message.success(`批量索引完成: ${success} 个`)
  else message.warning(`索引 ${success} 个成功，${fail} 个失败`)
  selectedIds.value.clear()
  bulkMode.value = false
  await loadStatus()
}

async function handleBulkDeleteEmbedding() {
  if (selectedIds.value.size === 0) return
  try {
    await confirmDanger('批量删除', `确认删除选中的 ${selectedIds.value.size} 个索引？`)
  } catch { return }

  bulkProcessing.value = true
  let success = 0
  let fail = 0
  for (const id of selectedIds.value) {
    try {
      await deleteRagEmbedding(id)
      success++
    } catch {
      fail++
    }
  }
  bulkProcessing.value = false
  if (fail === 0) message.success(`已删除 ${success} 个索引`)
  else message.warning(`删除 ${success} 个成功，${fail} 个失败`)
  selectedIds.value.clear()
  bulkMode.value = false
  await loadStatus()
}

// ---- Search test ----

const searchQuery = ref('')
const searchLoading = ref(false)
const searchResults = ref<RagSearchResult[]>([])
const searchPerformed = ref(false)

// ---- Computed ----

const healthPercent = computed(() => {
  if (!status.value || status.value.totalSchemas === 0) return 0
  return Math.round((status.value.indexed / status.value.totalSchemas) * 100)
})

const healthStatus = computed<'success' | 'warning' | 'danger'>(() => {
  if (healthPercent.value >= 90) return 'success'
  if (healthPercent.value >= 50) return 'warning'
  return 'danger'
})

// ---- Data Loading ----

async function loadStatus(): Promise<void> {
  await withStatusLoading(async () => {
    status.value = await getRagStatus()
  })
}

// ---- Reindex ----

async function handleReindexAll(): Promise<void> {
  await withReindexLoading(async () => {
    lastReindexResult.value = await reindexAllRag()
    message.success('批量重建索引完成')
    await loadStatus()
  })
}

async function handleReindexSingle(schemaId: string): Promise<void> {
  try {
    await reindexSingleRag(schemaId)
    message.success('索引重建成功')
    await loadStatus()
  } catch {
    message.error('索引重建失败')
  }
}

// ---- Search test ----

async function handleSearch(): Promise<void> {
  const query = searchQuery.value.trim()
  if (!query) return

  searchLoading.value = true
  searchPerformed.value = true
  try {
    const result = await searchRag({ query, limit: 10 })
    searchResults.value = result.schemas
  } catch {
    message.error('搜索失败')
    searchResults.value = []
  } finally {
    searchLoading.value = false
  }
}

function getScoreClass(score: number): string {
  if (score >= 70) return 'scoreHigh'
  if (score >= 40) return 'scoreMedium'
  return 'scoreLow'
}

// ---- Formatters ----

function getSchemaTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    form: '表单',
    search_list: '查询列表',
  }
  return labels[type] ?? type
}

// ---- Lifecycle ----

onMounted(() => {
  loadStatus()
})
</script>

<template>
  <div :class="$style.page">
    <!-- Topbar -->
    <div :class="$style.topbar">
      <div :class="$style.topbarLeft">
        <div :class="$style.topbarLogo">
          <div :class="$style.topbarIcon">
            <AppIcon name="notebook" :size="18" />
          </div>
          <span :class="$style.topbarBrand">RAG 知识库</span>
        </div>
      </div>
      <div :class="$style.topbarRight">
        <el-button
          type="primary"
          size="small"
          :loading="reindexing"
          @click="handleReindexAll"
        >
          <AppIcon name="refresh" :size="14" />
          {{ reindexing ? '索引中...' : '重建索引' }}
        </el-button>
        <el-button
          size="small"
          :loading="loading"
          @click="loadStatus"
        >
          <AppIcon name="refresh" :size="14" />
          刷新
        </el-button>
      </div>
    </div>

    <!-- Body -->
    <div :class="$style.body">
      <!-- 状态概览 -->
      <div :class="$style.statusOverview">
        <div :class="$style.statusCard">
          <div :class="$style.statusIcon">
            <AppIcon name="document" :size="20" />
          </div>
          <div :class="$style.statusInfo">
            <div :class="$style.statusValue">{{ status?.totalSchemas ?? 0 }}</div>
            <div :class="$style.statusLabel">Schema 总数</div>
          </div>
        </div>
        <div :class="$style.statusCard">
          <div :class="[$style.statusIcon, $style.statusIconSuccess]">
            <AppIcon name="check" :size="20" />
          </div>
          <div :class="$style.statusInfo">
            <div :class="$style.statusValue">{{ status?.indexed ?? 0 }}</div>
            <div :class="$style.statusLabel">已索引</div>
          </div>
        </div>
        <div :class="$style.statusCard">
          <div :class="[$style.statusIcon, $style.statusIconWarning]">
            <AppIcon name="warning" :size="20" />
          </div>
          <div :class="$style.statusInfo">
            <div :class="$style.statusValue">{{ status?.unindexed ?? 0 }}</div>
            <div :class="$style.statusLabel">待索引</div>
          </div>
        </div>
        <div :class="$style.statusCard">
          <div :class="[$style.statusIcon, $style[`statusIcon${healthStatus.charAt(0).toUpperCase() + healthStatus.slice(1)}`]]">
            <AppIcon name="chart-bar" :size="20" />
          </div>
          <div :class="$style.statusInfo">
            <div :class="$style.statusValue">{{ healthPercent }}%</div>
            <div :class="$style.statusLabel">覆盖率</div>
          </div>
        </div>
      </div>

      <!-- 搜索测试 -->
      <div :class="$style.searchSection">
        <div :class="$style.searchHeader">
          <h3 :class="$style.sectionTitle">语义搜索测试</h3>
          <p :class="$style.sectionDesc">输入自然语言描述，测试 RAG 语义搜索效果</p>
        </div>
        <div :class="$style.searchBox">
          <el-input
            v-model="searchQuery"
            :class="$style.searchInput"
            placeholder="例如：用户注册表单、请假审批流程..."
            clearable
            @keyup.enter="handleSearch"
          >
            <template #prefix>
              <AppIcon name="search" :size="16" />
            </template>
          </el-input>
          <el-button
            type="primary"
            :loading="searchLoading"
            @click="handleSearch"
          >
            搜索
          </el-button>
        </div>

        <!-- 搜索结果 -->
        <div v-if="searchPerformed" :class="$style.searchResults">
          <div v-if="searchResults.length === 0 && !searchLoading" :class="$style.emptyState">
            <AppIcon name="search" :size="32" />
            <p>未找到匹配的 Schema</p>
          </div>
          <div v-else :class="$style.resultList">
            <div
              v-for="item in searchResults"
              :key="item.id"
              :class="$style.resultItem"
            >
              <div :class="[$style.resultScore, $style[getScoreClass(item.score)]]">
                {{ item.score }}
              </div>
              <div :class="$style.resultContent">
                <div :class="$style.resultName">{{ item.name }}</div>
                <div v-if="item.description" :class="$style.resultDesc">
                  {{ item.description }}
                </div>
                <div :class="$style.resultMeta">
                  <el-tag size="small" :type="item.type === 'form' ? 'primary' : 'success'">
                    {{ getSchemaTypeLabel(item.type) }}
                  </el-tag>
                  <span :class="$style.resultWidgets">
                    {{ item.widgetTypes.slice(0, 3).join(', ') }}
                    {{ item.widgetTypes.length > 3 ? `+${item.widgetTypes.length - 3}` : '' }}
                  </span>
                </div>
              </div>
              <el-button
                type="primary"
                link
                size="small"
                @click="handleReindexSingle(item.id)"
              >
                重建索引
              </el-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 索引管理 -->
      <div :class="$style.manageSection">
        <div :class="$style.manageHeader">
          <h3 :class="$style.sectionTitle">索引管理</h3>
          <div :class="$style.manageActions">
            <el-button
              size="small"
              :type="bulkMode ? 'danger' : 'default'"
              @click="toggleBulkMode"
            >
              {{ bulkMode ? '取消' : '批量操作' }}
            </el-button>
            <template v-if="bulkMode">
              <el-button
                size="small"
                type="primary"
                :disabled="selectedIds.size === 0"
                :loading="bulkProcessing"
                @click="handleBulkReindex"
              >
                批量索引 ({{ selectedIds.size }})
              </el-button>
              <el-button
                size="small"
                type="danger"
                :disabled="selectedIds.size === 0"
                :loading="bulkProcessing"
                @click="handleBulkDeleteEmbedding"
              >
                批量删除 ({{ selectedIds.size }})
              </el-button>
            </template>
          </div>
        </div>

        <!-- 上次索引结果 -->
        <div v-if="lastReindexResult" :class="$style.reindexResult">
          <AppIcon name="info-filled" :size="16" />
          <span>
            上次批量索引：总计 {{ lastReindexResult.total }}，
            新建 {{ lastReindexResult.created }}，
            更新 {{ lastReindexResult.updated }}，
            跳过 {{ lastReindexResult.skipped }}，
            失败 {{ lastReindexResult.errors }}
          </span>
        </div>

        <!-- Schema 列表 -->
        <el-table
          :data="status?.unindexedSchemas ?? []"
          :class="$style.table"
          stripe
          size="small"
          empty-text="所有 Schema 均已索引 ✓"
        >
          <el-table-column v-if="bulkMode" label="" width="48">
            <template #default="{ row }">
              <el-checkbox
                :model-value="selectedIds.has(row.id)"
                @change="toggleSelect(row.id)"
              />
            </template>
          </el-table-column>
          <el-table-column prop="name" label="名称" min-width="200" />
          <el-table-column prop="type" label="类型" width="120">
            <template #default="{ row }">
              <el-tag size="small" :type="row.type === 'form' ? 'primary' : 'success'">
                {{ getSchemaTypeLabel(row.type) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120" fixed="right">
            <template #default="{ row }">
              <el-button
                type="primary"
                link
                size="small"
                @click="handleReindexSingle(row.id)"
              >
                <AppIcon name="refresh" :size="12" />
                建立索引
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>
  </div>
</template>

<style module src="./RagKnowledgeBase.module.css" />
