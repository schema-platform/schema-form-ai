<script setup lang="ts">
/**
 * AiMentionInput — 支持 @引用 的输入组件
 *
 * 输入 @ 触发搜索面板，可搜索 Schema/Flow/Widget。
 * 选中后插入引用标记，引用列表通过 chips 展示。
 */

import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useAiStore } from '@/stores/ai'
import type { MentionReference } from '@/types'
import type { MentionSearchResult, MentionType } from '@/api/aiApi'

export interface AiMentionInputProps {
  disabled?: boolean
  loading?: boolean
  placeholder?: string
}

const props = withDefaults(defineProps<AiMentionInputProps>(), {
  placeholder: '描述你想要生成的内容...',
})

const emit = defineEmits<{
  send: [message: string, mentions: MentionReference[]]
}>()

const store = useAiStore()

// ---- Input state ----
const inputText = ref('')
const textareaRef = ref<HTMLTextAreaElement>()
const mentions = ref<MentionReference[]>([])

// ---- Auto resize textarea ----
function autoResize(): void {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

watch(inputText, () => {
  nextTick(autoResize)
})

// ---- Mention panel state ----
const panelVisible = ref(false)
const searchQuery = ref('')
const activeTab = ref<MentionType>('schema')
const results = ref<MentionSearchResult[]>([])
const searching = ref(false)
const highlightIndex = ref(-1)
const mentionStartPos = ref(-1)

const TABS: Array<{ key: MentionType; label: string }> = [
  { key: 'schema', label: 'Schema' },
  { key: 'flow', label: 'Flow' },
  { key: 'widget', label: 'Widget' },
]

// ---- Debounced search ----
let searchTimer: ReturnType<typeof setTimeout> | null = null

function debounceSearch(query: string, type: MentionType): void {
  if (searchTimer) clearTimeout(searchTimer)
  if (!query.trim()) {
    results.value = []
    return
  }
  searching.value = true
  searchTimer = setTimeout(async () => {
    try {
      results.value = await store.mentionSearchAction(query, type)
    } catch {
      results.value = []
    } finally {
      searching.value = false
    }
  }, 250)
}

watch([searchQuery, activeTab], ([q, tab]) => {
  highlightIndex.value = -1
  debounceSearch(q, tab)
})

// ---- Detect @ trigger ----
function handleInput(): void {
  const val = inputText.value
  // Use selectionStart if available; fall back to end of text
  const sel = textareaRef.value?.selectionStart
  const cursor = (sel != null && sel > 0) ? sel : val.length

  // Find the last @ before cursor
  const lastAt = val.lastIndexOf('@', cursor - 1)
  if (lastAt >= 0 && (lastAt === 0 || val[lastAt - 1] === ' ' || val[lastAt - 1] === '\n')) {
    const textAfterAt = val.slice(lastAt + 1, cursor)
    // Only trigger if no space in the mention query (single word)
    if (!textAfterAt.includes(' ') && textAfterAt.length <= 30) {
      mentionStartPos.value = lastAt
      searchQuery.value = textAfterAt
      panelVisible.value = true
      return
    }
  }
  closePanel()
}

function closePanel(): void {
  panelVisible.value = false
  searchQuery.value = ''
  mentionStartPos.value = -1
  highlightIndex.value = -1
}

// ---- Keyboard navigation ----
function handleKeydown(e: KeyboardEvent): void {
  if (panelVisible.value) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      highlightIndex.value = Math.min(highlightIndex.value + 1, results.value.length - 1)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      highlightIndex.value = Math.max(highlightIndex.value - 1, 0)
      return
    }
    if (e.key === 'Enter' && highlightIndex.value >= 0) {
      e.preventDefault()
      selectResult(results.value[highlightIndex.value])
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      closePanel()
      return
    }
  }

  // Send on Enter (no shift, no panel)
  if (e.key === 'Enter' && !e.shiftKey && !panelVisible.value) {
    e.preventDefault()
    handleSend()
  }
}

// ---- Select a mention result ----
function selectResult(item: MentionSearchResult): void {
  const ref: MentionReference = { id: item.id, type: item.type, label: item.name }

  // Avoid duplicates
  if (!mentions.value.some((m) => m.id === ref.id && m.type === ref.type)) {
    mentions.value.push(ref)
  }

  // Replace the @query in the textarea with @label
  const val = inputText.value
  const start = mentionStartPos.value
  const cursor = textareaRef.value?.selectionStart ?? val.length
  if (start >= 0) {
    inputText.value = val.slice(0, start) + `@${item.name} ` + val.slice(cursor)
  }

  closePanel()
  nextTick(() => textareaRef.value?.focus())
}

function removeMention(index: number): void {
  mentions.value.splice(index, 1)
}

// ---- Send ----
function handleSend(): void {
  const text = inputText.value.trim()
  if (!text && mentions.value.length === 0) return
  if (props.disabled) return

  emit('send', text, [...mentions.value])
  inputText.value = ''
  mentions.value = []
}

// ---- Click outside to close ----
const wrapperRef = ref<HTMLElement>()

function handleClickOutside(e: MouseEvent): void {
  if (wrapperRef.value && !wrapperRef.value.contains(e.target as Node)) {
    closePanel()
  }
}

function focus(): void {
  textareaRef.value?.focus()
}

defineExpose({ focus })

onMounted(() => {
  document.addEventListener('mousedown', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', handleClickOutside)
  if (searchTimer) clearTimeout(searchTimer)
})

// ---- Type badge helpers ----
function typeIcon(type: string): string {
  if (type === 'schema') return 'S'
  if (type === 'flow') return 'F'
  return 'W'
}

</script>

<template>
  <div ref="wrapperRef" :class="$style.wrapper">
    <!-- Mention panel -->
    <div v-if="panelVisible" :class="$style.panel">
      <!-- Search input -->
      <div :class="$style.panelSearch">
        <el-input
          v-model:value="searchQuery"
          :class="$style.panelInput"
          placeholder="搜索引用..."
          autofocus
          size="small"
        />
      </div>

      <!-- Category tabs -->
      <div :class="$style.tabs">
        <el-button
          v-for="tab in TABS"
          :key="tab.key"
          :class="[$style.tab, { [$style.active]: activeTab === tab.key }]"
          size="small"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </el-button>
      </div>

      <!-- Results -->
      <div :class="$style.results">
        <div v-if="searching" :class="$style.loading">
          <span :class="$style.loadingDot" />
          <span :class="$style.loadingDot" />
          <span :class="$style.loadingDot" />
        </div>
        <template v-else-if="results.length > 0">
          <div
            v-for="(item, idx) in results"
            :key="item.id"
            :class="[$style.resultItem, { [$style.highlighted]: idx === highlightIndex }]"
            @click="selectResult(item)"
            @mouseenter="highlightIndex = idx"
          >
            <div :class="[$style.typeBadge, $style[item.type]]">
              {{ typeIcon(item.type) }}
            </div>
            <div :class="$style.resultInfo">
              <div :class="$style.resultName">{{ item.name }}</div>
              <div v-if="item.description" :class="$style.resultMeta">{{ item.description }}</div>
            </div>
          </div>
        </template>
        <div v-else-if="searchQuery.trim()" :class="$style.empty">
          无匹配结果
        </div>
      </div>
    </div>

    <!-- Mention chips -->
    <div v-if="mentions.length > 0" :class="$style.mentionChips">
      <div
        v-for="(m, idx) in mentions"
        :key="`${m.type}-${m.id}`"
        :class="$style.mentionChip"
      >
        <span :class="$style.chipIcon">{{ typeIcon(m.type) }}</span>
        <span>{{ m.label }}</span>
        <el-button :class="$style.chipRemove" link size="small" @click="removeMention(idx)">&times;</el-button>
      </div>
    </div>

    <!-- Textarea -->
    <textarea
      ref="textareaRef"
      v-model="inputText"
      :class="$style.textarea"
      :placeholder="placeholder"
      :disabled="disabled || loading"
      rows="1"
      @input="handleInput"
      @keydown="handleKeydown"
    />
  </div>
</template>

<style module src="./AiMentionInput.module.scss" />
