import 'element-plus/dist/index.css'
import '@schema-platform/platform-shared/styles/theme.scss'
import '@schema-platform/platform-shared/styles/css-variables.scss'
import './styles/ai-theme-bridge.scss'

import { createApp, type App } from 'vue'
import { createPinia } from 'pinia'
import { setupElementPlus } from '@schema-platform/platform-shared/config/element'
import { initQiankunProps } from '@schema-platform/platform-shared/qiankun'
import { aiLog } from '@schema-platform/platform-shared/utils/logger'
import AppRoot from './App.vue'
import { createAiRouter } from './router'
import { setTokenProvider } from './api/aiApi'

let app: App | null = null
let router: ReturnType<typeof createAiRouter> | null = null

let currentRouteBase: string | undefined
let tokenProviderSet = false

function render() {
  if (!tokenProviderSet) {
    setTokenProvider(() => localStorage.getItem('sfp_access_token') || '')
    tokenProviderSet = true
  }

  router = createAiRouter(currentRouteBase)
  app = createApp(AppRoot)
  app.use(createPinia())
  app.use(router)
  setupElementPlus(app)

  const mountEl = document.getElementById('ai-app')
  if (!mountEl) throw new Error('[ai] #ai-app not found')
  app.mount(mountEl)
}

// ── Qiankun 生命周期（vite-plugin-qiankun 要求通过 ES module 导出）──

export async function bootstrap() {
  aiLog.lifecycle('bootstrap')
}

export async function mount(props: Record<string, unknown>) {
  aiLog.lifecycle('mount start')

  // 二次 mount 时先清理旧实例
  if (app) {
    try { app.unmount() } catch { /* ignore */ }
    app = null
    router = null
  }

  document.getElementById('loading')?.remove()

  // 注入 shell props → globalState 事件通道
  if (typeof props.onGlobalStateChange === 'function' && typeof props.setGlobalState === 'function') {
    initQiankunProps(props as any)
  }

  // token
  const getToken = props.getToken as (() => string) | undefined
  const token = getToken ? getToken() : (props.token as string)
  if (token) localStorage.setItem('sfp_access_token', token)

  // sidebar 模式
  const mode = props.mode as string | undefined
  if (mode === 'sidebar') {
    currentRouteBase = '/sidebar'
  } else {
    // routeBase：shell 下发优先，否则用环境变量
    const getRouteBase = props.getRouteBase as (() => string) | undefined
    if (getRouteBase) {
      currentRouteBase = getRouteBase()
    }
  }

  render()

  const emitEvent = props.emitEvent as ((event: string, data: unknown) => void) | undefined
  emitEvent?.('shell:sub-app-mounted', { app: 'ai' })
  aiLog.lifecycle('mount done')
}

export async function unmount() {
  aiLog.lifecycle('unmount')
  if (app) {
    app.unmount()
    app = null
    router = null
  }
}

// 独立模式：仅开发环境且非 qiankun 子应用时渲染
if (import.meta.env.DEV && !window.__POWERED_BY_QIANKUN__) {
  render()
}
