<script setup lang="ts">
import '../styles/debugger.scss'

import { computed } from 'vue'
import type { UnifiedLogEntry } from '../../core/types'

const props = defineProps<{
  logA: UnifiedLogEntry
  logB: UnifiedLogEntry
}>()

type DiffLine = { text: string; type: 'same' | 'add' | 'remove' }

const diffLines = (a: string, b: string): DiffLine[] => {
  const linesA = a.split('\n')
  const linesB = b.split('\n')
  const result: DiffLine[] = []

  // LCS-based diff
  const m = linesA.length, n = linesB.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = linesA[i - 1] === linesB[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])

  let i = m, j = n
  const seq: DiffLine[] = []
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      seq.push({ text: linesA[i - 1], type: 'same' }); i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      seq.push({ text: linesB[j - 1], type: 'add' }); j--
    } else {
      seq.push({ text: linesA[i - 1], type: 'remove' }); i--
    }
  }
  return seq.reverse()
}

const serialize = (v: unknown): string => {
  if (v == null) return ''
  if (typeof v === 'string') return v
  return JSON.stringify(v, null, 2)
}

const reqBodyDiff = computed(() => diffLines(serialize(props.logA.request.body), serialize(props.logB.request.body)))
const resBodyDiff = computed(() => diffLines(serialize(props.logA.response.body), serialize(props.logB.response.body)))

const headersDiff = (headersA: Record<string, string>, headersB: Record<string, string>) => {
  const keys = new Set([...Object.keys(headersA), ...Object.keys(headersB)])
  return Array.from(keys).map(k => {
    const vA = headersA[k], vB = headersB[k]
    if (vA === vB) return { key: k, a: vA, b: vB, type: 'same' as const }
    if (!vA) return { key: k, a: '', b: vB, type: 'add' as const }
    if (!vB) return { key: k, a: vA, b: '', type: 'remove' as const }
    return { key: k, a: vA, b: vB, type: 'changed' as const }
  }).filter(r => r.type !== 'same')
}

const reqHeadersDiff = computed(() => headersDiff(props.logA.requestHeaders, props.logB.requestHeaders))
const resHeadersDiff = computed(() => headersDiff(props.logA.responseHeaders, props.logB.responseHeaders))
</script>

<template>
  <div class="diff-panel">
    <!-- Titles -->
    <div class="diff-titles">
      <div class="diff-title-a">
        <span :class="['method', logA.method.toLowerCase()]">{{ logA.method }}</span>
        <span class="diff-title-url">{{ logA.url }}</span>
      </div>
      <div class="diff-sep">↔</div>
      <div class="diff-title-b">
        <span :class="['method', logB.method.toLowerCase()]">{{ logB.method }}</span>
        <span class="diff-title-url">{{ logB.url }}</span>
      </div>
    </div>

    <!-- Changed request headers -->
    <div v-if="reqHeadersDiff.length" class="diff-section">
      <div class="section-header"><span>Request Headers (changed)</span></div>
      <div class="diff-header-table">
        <div v-for="row in reqHeadersDiff" :key="row.key" :class="['diff-header-row', 'diff-' + row.type]">
          <span class="kv-key">{{ row.key }}</span>
          <span class="kv-val diff-val-a">{{ row.a || '—' }}</span>
          <span class="diff-arrow">→</span>
          <span class="kv-val diff-val-b">{{ row.b || '—' }}</span>
        </div>
      </div>
    </div>

    <!-- Changed response headers -->
    <div v-if="resHeadersDiff.length" class="diff-section">
      <div class="section-header"><span>Response Headers (changed)</span></div>
      <div class="diff-header-table">
        <div v-for="row in resHeadersDiff" :key="row.key" :class="['diff-header-row', 'diff-' + row.type]">
          <span class="kv-key">{{ row.key }}</span>
          <span class="kv-val diff-val-a">{{ row.a || '—' }}</span>
          <span class="diff-arrow">→</span>
          <span class="kv-val diff-val-b">{{ row.b || '—' }}</span>
        </div>
      </div>
    </div>

    <!-- Request body diff -->
    <div v-if="reqBodyDiff.some(l => l.type !== 'same')" class="diff-section">
      <div class="section-header"><span>Request Body</span></div>
      <pre class="diff-code">
        <div v-for="(line, i) in reqBodyDiff" :key="i" :class="['diff-line', 'diff-line-' + line.type]">
          <span class="diff-sign">{{ line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ' }}</span>{{ line.text }}
        </div>
      </pre>
    </div>

    <!-- Response body diff -->
    <div v-if="resBodyDiff.some(l => l.type !== 'same')" class="diff-section">
      <div class="section-header"><span>Response Body</span></div>
      <pre class="diff-code">
        <div v-for="(line, i) in resBodyDiff" :key="i" :class="['diff-line', 'diff-line-' + line.type]">
          <span class="diff-sign">{{ line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ' }}</span>{{ line.text }}
        </div>
      </pre>
    </div>

    <div v-if="!reqHeadersDiff.length && !resHeadersDiff.length && !reqBodyDiff.some(l=>l.type!=='same') && !resBodyDiff.some(l=>l.type!=='same')" class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="m9 12 2 2 4-4"/>
        <circle cx="12" cy="12" r="10"/>
      </svg>
      <p>Requests are identical</p>
    </div>
  </div>
</template>
