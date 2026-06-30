/**
 * AI 抽屉独立入口（iframe 专用）
 *
 * 直接挂载 AiSidebarView，不走 qiankun 生命周期。
 * 供 Editor / Flow 通过 iframe 嵌入。
 */

import 'element-plus/dist/index.css'
import '@schema-platform/platform-shared/styles/theme.scss'
import '@schema-platform/platform-shared/styles/css-variables.scss'
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { setupElementPlus } from '@schema-platform/platform-shared/config/element'
import './global.scss'
import './styles/ai-theme-bridge.scss'

import AiSidebarView from './views/AiSidebarView.vue'

const app = createApp(AiSidebarView)
app.use(createPinia())
setupElementPlus(app)
app.mount('#ai-app')

// 通知宿主：AI sidebar 已就绪，可以接收 postMessage
window.parent.postMessage({ type: 'ai:ready' }, '*')

// qiankun 生命周期 no-op 导出（避免 import 报错）
export async function bootstrap() {}
export async function mount() {}
export async function unmount() {}
