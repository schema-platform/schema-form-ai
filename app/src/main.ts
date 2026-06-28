import 'element-plus/dist/index.css'
import '@schema-platform/platform-shared/styles/theme.scss'
import '@schema-platform/platform-shared/styles/css-variables.scss'
import './styles/ai-theme-bridge.css'

import { createApp, type App } from 'vue'
import { createPinia } from 'pinia'
import { setupElementPlus } from '@schema-platform/platform-shared/config/element'
import { initQiankunLifecycle } from '@schema-platform/platform-shared/qiankun'
import AppRoot from './App.vue'
import { createAiRouter } from './router'
import { setTokenProvider } from './api/aiApi'

setTokenProvider(() => localStorage.getItem('sfp_access_token') || '')

let app: App | null = null
let router: ReturnType<typeof createAiRouter> | null = null

let currentRouteBase = '/'

function render(container?: HTMLElement) {
  router = createAiRouter(currentRouteBase)
  app = createApp(AppRoot)
  app.use(createPinia())
  app.use(router)
  setupElementPlus(app)

  const mountEl = container?.querySelector('#app') || container || document.getElementById('app')
  if (mountEl) {
    app.mount(mountEl)
  }
}

// ── Qiankun 生命周期（vite-plugin-qiankun 要求通过 ES module 导出）──

export async function bootstrap() {
  console.log('[ai] bootstrap')
}

export async function mount(props: { container?: HTMLElement; mode?: string; getRouteBase?: () => string; emitEvent?: (event: string, data: unknown) => void }) {
  console.log('[ai] mount start')
  // 立即移除 index.html 中的 #loading（position: fixed 会覆盖整个视口）
  document.getElementById('loading')?.remove()

  // 初始化 qiankun 生命周期（globalState 事件通道）
  initQiankunLifecycle(props as Parameters<typeof initQiankunLifecycle>[0])

  // 优先使用 getToken（动态获取），回退到 token（静态值）
  const p = props as Record<string, unknown>
  const token = (typeof p.getToken === 'function' ? (p.getToken as () => string)() : p.token as string) || undefined
  if (token) localStorage.setItem('sfp_access_token', token)

  // sidebar 模式：由 editor 内嵌时使用
  if (props.mode === 'sidebar') {
    currentRouteBase = '/sidebar'
  } else if (props.getRouteBase) {
    const routeBase = props.getRouteBase()
    const browserPath = window.location.pathname
    const subPath = browserPath.slice(routeBase.length) || '/'
    const search = window.location.search
    currentRouteBase = subPath + search
  }

  render(props.container)

  // 通知 shell 子应用已挂载
  props.emitEvent?.('shell:sub-app-mounted', { app: 'ai' })
  console.log('[ai] mount done')
}

export async function unmount() {
  console.log('[ai] unmount')
  if (app) {
    app.unmount()
    app = null
    router = null
  }
}

// 独立模式
if (!window.__POWERED_BY_QIANKUN__) {
  render()
}
