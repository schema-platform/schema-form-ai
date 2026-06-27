<script setup lang="ts">
import { ref } from 'vue'
import type { RagSearchResult } from '@/types'

export interface AiRagSearchProps {
  searchResults: RagSearchResult[]
  selectedContext: RagSearchResult[]
  loading?: boolean
}

const props = withDefaults(defineProps<AiRagSearchProps>(), {
  loading: false,
})

const emit = defineEmits<{
  search: [query: string]
  select: [item: RagSearchResult]
  remove: [id: string]
  close: []
}>()

const searchQuery = ref('')
let debounceTimer: ReturnType<typeof setTimeout> | null = null

function handleInput(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    emit('search', searchQuery.value)
  }, 300)
}

function isSelected(item: RagSearchResult): boolean {
  return props.selectedContext.some((c) => c.id === item.id)
}

function handleSelect(item: RagSearchResult): void {
  if (!isSelected(item)) {
    emit('select', item)
  }
}

function handleRemove(id: string): void {
  emit('remove', id)
}

function getScoreClass(score: number): string {
  if (score >= 70) return 'scoreHigh'
  if (score >= 40) return 'scoreMedium'
  return 'scoreLow'
}
</script>

<template>
  <div :class="$style.overlay">
    <!-- Search input -->
    <div :class="$style.searchHeader">
      <svg
        :class="$style.searchIcon"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <el-input
        v-model="searchQuery"
        :class="$style.searchInput"
        placeholder="智能匹配 Schema，如：用户注册表单..."
        size="small"
        @input="handleInput"
      />
      <span v-if="loading" :class="$style.searchLoading" />
    </div>

    <!-- Selected context chips -->
    <div v-if="selectedContext.length > 0" :class="$style.contextChips">
      <span
        v-for="item in selectedContext"
        :key="item.id"
        :class="$style.contextChip"
      >
        <span :class="$style.chipName">{{ item.name }}</span>
        <el-button
          :class="$style.chipRemove"
          title="移除"
          link
          size="small"
          @click="handleRemove(item.id)"
        >
          &times;
        </el-button>
      </span>
    </div>

    <!-- Results list -->
    <div :class="$style.resultsList">
      <template v-if="searchResults.length > 0">
        <div
          v-for="item in searchResults"
          :key="item.id"
          :class="[$style.resultItem, { [$style.selected]: isSelected(item) }]"
          @click="handleSelect(item)"
        >
          <div :class="[$style.resultScore, $style[getScoreClass(item.score)]]">
            {{ item.score }}
          </div>
          <div :class="$style.resultInfo">
            <div :class="$style.resultName">{{ item.name }}</div>
            <div v-if="item.description" :class="$style.resultDesc">
              {{ item.description }}
            </div>
            <div :class="$style.resultTags">
              <span
                v-for="wt in item.widgetTypes.slice(0, 5)"
                :key="wt"
                :class="$style.resultTag"
              >
                {{ wt }}
              </span>
              <span v-if="item.widgetTypes.length > 5" :class="$style.resultTag">
                +{{ item.widgetTypes.length - 5 }}
              </span>
            </div>
          </div>
        </div>
      </template>
      <div v-else-if="!loading && searchQuery.trim()" :class="$style.emptyHint">
        <div :class="$style.emptyIcon">&#x1F50D;</div>
        <div>未找到匹配的 Schema</div>
      </div>
      <div v-else-if="!loading" :class="$style.emptyHint">
        <div :class="$style.emptyIcon">&#x2728;</div>
        <div>输入自然语言描述，智能匹配已有 Schema</div>
      </div>
    </div>

    <!-- Footer -->
    <div :class="$style.panelFooter">
      <span>{{ selectedContext.length > 0 ? `已选 ${selectedContext.length} 个 Schema 作为上下文` : '选择 Schema 注入对话上下文' }}</span>
      <el-button :class="$style.closeBtn" @click="emit('close')">关闭</el-button>
    </div>
  </div>
</template>

<style module src="./AiRagSearch.module.css" />
