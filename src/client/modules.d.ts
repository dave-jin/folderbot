/** 형이 없는 모듈 — KaTeX 는 타입을 안 싣고, CSS 는 동적 import 로도 받는다(루프 10/10) */
declare module '*.css'
declare module 'katex' {
  export interface KatexOptions { displayMode?: boolean; throwOnError?: boolean; output?: 'html' | 'mathml' | 'htmlAndMathml'; strict?: boolean | string }
  export function renderToString(tex: string, options?: KatexOptions): string
  const katex: { renderToString: typeof renderToString }
  export default katex
}
