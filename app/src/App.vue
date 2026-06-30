<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, RouterView } from 'vue-router'
import { ElConfigProvider } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import '@schema-platform/platform-shared/styles/css-variables.scss'
import AiLayout from './components/AiLayout.vue'

const route = useRoute()

// 不使用布局的路由
const noLayoutRoutes = ['/sidebar', '/auth/callback']
const useLayout = computed(() => !noLayoutRoutes.includes(route.path))
</script>

<template>
  <ElConfigProvider
    :locale="zhCn"
    :size="'default'"
    :z-index="2000"
  >
    <AiLayout v-if="useLayout">
      <RouterView />
    </AiLayout>
    <RouterView v-else />
  </ElConfigProvider>
</template>

<style>
/* qiankun 模式下撑满容器 */
#ai-app,
#ai-app > div,
#ai-app > div > div {
  width: 100%;
  height: 100%;
}
</style>
