import { useSyncExternalStore } from 'react'
import { presentOn, subscribePresent } from '../core/present'

/** 보여 주기 보기가 켜져 있는가 — 어느 부품에서든 읽는다(파일 칩 · 승인 카드 · 머리줄). 켜고 끄는 것은 `core/present` 의 `setPresent` */
export function usePresent(): boolean { return useSyncExternalStore(subscribePresent, presentOn, presentOn) }
