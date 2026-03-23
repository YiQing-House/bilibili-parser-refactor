/// <reference types="vite/client" />

// [P3] Vue SFC 类型声明 shim，消除 IDE "找不到模块" 报错
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}
