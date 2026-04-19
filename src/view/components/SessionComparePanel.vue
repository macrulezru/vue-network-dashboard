<script setup lang="ts">
import '../styles/debugger.scss'

import { ref, computed } from 'vue'
import type { UnifiedLogEntry } from '../../core/types'

// ── HAR parsing ────────────────────────────────────────────────────────────────
const toMap = (arr: any[]): Record<string, string> => {
  const m: Record<string, string> = {}
  for (const h of arr ?? []) m[String(h.name).toLowerCase()] = String(h.value)
  return m
}
const tryJSON = (text: string | undefined): any => {
  if (!text) return null
  try { return JSON.parse(text) } catch { return text }
}
const parseHAR = (har: any): UnifiedLogEntry[] =>
  (har?.log?.entries ?? []).map((e: any): UnifiedLogEntry => {
    const startTime = new Date(e.startedDateTime).getTime()
    const duration  = Math.round(e.time ?? 0)
    const status: number = e.response?.status ?? 0
    const isError = status === 0 || status >= 400
    return {
      id: Math.random().toString(36).slice(2),
      type: 'http', startTime, endTime: startTime + duration, duration,
      url: e.request?.url ?? '', method: e.request?.method ?? 'GET',
      http: { status, statusText: e.response?.statusText ?? '', protocol: e.response?.httpVersion ?? 'HTTP/1.1' },
      websocket: null, sse: null,
      requestHeaders: toMap(e.request?.headers), responseHeaders: toMap(e.response?.headers),
      request: {
        body: tryJSON(e.request?.postData?.text), bodyRaw: e.request?.postData?.text ?? null,
        bodySize: e.request?.bodySize ?? null, bodyType: e.request?.postData?.mimeType ?? null,
      },
      response: {
        body: tryJSON(e.response?.content?.text), bodyRaw: e.response?.content?.text ?? null,
        bodySize: e.response?.content?.size ?? null, bodyType: e.response?.content?.mimeType ?? null,
      },
      error: { occurred: isError, message: isError ? `HTTP ${status}` : null, name: null, stack: null },
      metadata: { clientType: 'fetch', redirected: false, retryCount: 0, timestamp: e.startedDateTime ?? '' },
    }
  })

// ── Types ──────────────────────────────────────────────────────────────────────
type DiffKind = 'added' | 'removed' | 'changed' | 'same'

interface DiffRow {
  kind:    DiffKind
  method:  string
  url:     string
  entryA:  UnifiedLogEntry | null
  entryB:  UnifiedLogEntry | null
  // which fields changed (for per-value highlights in B)
  statusChanged:   boolean
  durationChanged: boolean
  sizeChanged:     boolean
}

type Session = { name: string; entries: UnifiedLogEntry[] }
type Filter  = 'all' | 'added' | 'removed' | 'changed' | 'same'

// ── State ──────────────────────────────────────────────────────────────────────
const sessionA = ref<Session | null>(null)
const sessionB = ref<Session | null>(null)
const inputA   = ref<HTMLInputElement | null>(null)
const inputB   = ref<HTMLInputElement | null>(null)
const filter   = ref<Filter>('all')

const DURATION_THRESHOLD = 0.20

// ── File loading ───────────────────────────────────────────────────────────────
const loadFile = (file: File, slot: 'a' | 'b') => {
  const reader = new FileReader()
  reader.onload = (ev) => {
    try {
      const entries = parseHAR(JSON.parse(ev.target?.result as string))
      const s: Session = { name: file.name, entries }
      if (slot === 'a') sessionA.value = s
      else              sessionB.value = s
    } catch { alert('Failed to parse HAR file') }
  }
  reader.readAsText(file)
}
const onFileA = (e: Event) => {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) loadFile(f, 'a')
  ;(e.target as HTMLInputElement).value = ''
}
const onFileB = (e: Event) => {
  const f = (e.target as HTMLInputElement).files?.[0]
  if (f) loadFile(f, 'b')
  ;(e.target as HTMLInputElement).value = ''
}
const onDrop = (e: DragEvent, slot: 'a' | 'b') => {
  e.preventDefault()
  const f = e.dataTransfer?.files?.[0]
  if (f) loadFile(f, slot)
}

// ── Diff computation ───────────────────────────────────────────────────────────
const diffRows = computed((): DiffRow[] => {
  if (!sessionA.value || !sessionB.value) return []

  const rowKey = (e: UnifiedLogEntry) => `${e.method.toUpperCase()} ${e.url}`

  const mapA = new Map<string, UnifiedLogEntry>()
  for (const e of sessionA.value.entries) mapA.set(rowKey(e), e)

  const mapB = new Map<string, UnifiedLogEntry>()
  for (const e of sessionB.value.entries) mapB.set(rowKey(e), e)

  const rows: DiffRow[] = []

  // Entries in B (added or changed/same)
  for (const [k, b] of mapB) {
    const a = mapA.get(k)
    if (!a) {
      rows.push({ kind: 'added', method: b.method, url: b.url, entryA: null, entryB: b,
        statusChanged: false, durationChanged: false, sizeChanged: false })
    } else {
      const statusChanged   = a.http?.status !== b.http?.status
      const durA = a.duration ?? 0, durB = b.duration ?? 0
      const durationChanged = durA > 0 && Math.abs(durB - durA) / durA > DURATION_THRESHOLD
      const sizeA = a.response.bodySize ?? 0, sizeB = b.response.bodySize ?? 0
      const sizeChanged = sizeA > 0 && Math.abs(sizeB - sizeA) / sizeA > DURATION_THRESHOLD
      const kind: DiffKind = (statusChanged || durationChanged || sizeChanged) ? 'changed' : 'same'
      rows.push({ kind, method: b.method, url: b.url, entryA: a, entryB: b,
        statusChanged, durationChanged, sizeChanged })
    }
  }

  // Entries only in A (removed)
  for (const [k, a] of mapA) {
    if (!mapB.has(k)) {
      rows.push({ kind: 'removed', method: a.method, url: a.url, entryA: a, entryB: null,
        statusChanged: false, durationChanged: false, sizeChanged: false })
    }
  }

  const order: Record<DiffKind, number> = { added: 0, removed: 1, changed: 2, same: 3 }
  rows.sort((a, b) => order[a.kind] - order[b.kind])
  return rows
})

const filteredRows = computed(() =>
  filter.value === 'all'
    ? diffRows.value.filter(r => r.kind !== 'same')
    : diffRows.value.filter(r => r.kind === filter.value)
)

const counts = computed(() => ({
  added:   diffRows.value.filter(r => r.kind === 'added').length,
  removed: diffRows.value.filter(r => r.kind === 'removed').length,
  changed: diffRows.value.filter(r => r.kind === 'changed').length,
  same:    diffRows.value.filter(r => r.kind === 'same').length,
}))

// ── Formatting ─────────────────────────────────────────────────────────────────
const fmtDur  = (ms: number | null) => ms == null ? '—' : `${ms}ms`
const fmtSize = (b: number | null): string => {
  if (b == null || b === 0) return b == null ? '—' : '0 B'
  const k = 1024, sizes = ['B', 'KB', 'MB']
  const i = Math.floor(Math.log(b) / Math.log(k))
  return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}
const durDelta = (row: DiffRow): string => {
  const a = row.entryA?.duration, b = row.entryB?.duration
  if (a == null || b == null) return ''
  const d = b - a
  return (d >= 0 ? '+' : '') + d + 'ms'
}
const getMethodClass = (m: string) => {
  const u = m.toUpperCase()
  if (u === 'GET')    return 'get'
  if (u === 'POST')   return 'post'
  if (u === 'PUT')    return 'put'
  if (u === 'DELETE') return 'delete'
  if (u === 'PATCH')  return 'patch'
  return 'default'
}
const statusClass = (s: number | null): string => {
  if (!s) return 'sc-none'
  if (s < 300) return 'sc-ok'
  if (s < 400) return 'sc-redirect'
  if (s < 500) return 'sc-client'
  return 'sc-server'
}
const truncateUrl = (url: string, max = 55) =>
  url.length <= max ? url : '…' + url.slice(-(max - 1))
</script>

<template>
  <div class="compare-panel">

    <!-- ── No sessions loaded ── -->
    <div v-if="!sessionA || !sessionB" class="compare-setup">
      <p class="compare-hint">Load two HAR files to compare sessions side by side.</p>
      <div class="compare-slots">

        <div :class="['compare-slot', { loaded: !!sessionA }]"
          @dragover.prevent @drop="onDrop($event, 'a')" @click="inputA?.click()">
          <input ref="inputA" type="file" accept=".har,.json" style="display:none" @change="onFileA" />
          <div v-if="!sessionA" class="slot-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span>Session A</span>
            <small>Drop .har or click to load</small>
          </div>
          <div v-else class="slot-loaded">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="slot-ok-icon">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <div class="slot-info">
              <span class="slot-name">{{ sessionA.name }}</span>
              <span class="slot-count">{{ sessionA.entries.length }} requests</span>
            </div>
            <button class="slot-clear" @click.stop="sessionA = null">×</button>
          </div>
        </div>

        <div class="compare-vs">vs</div>

        <div :class="['compare-slot', { loaded: !!sessionB }]"
          @dragover.prevent @drop="onDrop($event, 'b')" @click="inputB?.click()">
          <input ref="inputB" type="file" accept=".har,.json" style="display:none" @change="onFileB" />
          <div v-if="!sessionB" class="slot-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            <span>Session B</span>
            <small>Drop .har or click to load</small>
          </div>
          <div v-else class="slot-loaded">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" class="slot-ok-icon">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            <div class="slot-info">
              <span class="slot-name">{{ sessionB.name }}</span>
              <span class="slot-count">{{ sessionB.entries.length }} requests</span>
            </div>
            <button class="slot-clear" @click.stop="sessionB = null">×</button>
          </div>
        </div>

      </div>
    </div>

    <!-- ── Diff view ── -->
    <template v-else>

      <!-- Summary + filter bar -->
      <div class="compare-toolbar">
        <button :class="['cmp-filter', { active: filter === 'all' }]" @click="filter = 'all'">
          All <span class="cmp-badge">{{ counts.added + counts.removed + counts.changed }}</span>
        </button>
        <button :class="['cmp-filter added', { active: filter === 'added' }]" @click="filter = 'added'">
          Added <span class="cmp-badge">{{ counts.added }}</span>
        </button>
        <button :class="['cmp-filter removed', { active: filter === 'removed' }]" @click="filter = 'removed'">
          Removed <span class="cmp-badge">{{ counts.removed }}</span>
        </button>
        <button :class="['cmp-filter changed', { active: filter === 'changed' }]" @click="filter = 'changed'">
          Changed <span class="cmp-badge">{{ counts.changed }}</span>
        </button>
        <button :class="['cmp-filter', { active: filter === 'same' }]" @click="filter = 'same'">
          Unchanged <span class="cmp-badge">{{ counts.same }}</span>
        </button>
        <div style="flex:1" />
        <button class="cmp-reload" @click="sessionA = null; sessionB = null">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
            <path d="M3 3v5h5"/>
          </svg>
          Reset
        </button>
      </div>

      <!-- Column headers -->
      <div class="cmp-cols-header">
        <div class="cmp-col-label">
          <span class="cmp-session-badge a">A</span>
          {{ sessionA.name }}
          <span class="cmp-session-count">{{ sessionA.entries.length }} req</span>
        </div>
        <div class="cmp-col-label">
          <span class="cmp-session-badge b">B</span>
          {{ sessionB.name }}
          <span class="cmp-session-count">{{ sessionB.entries.length }} req</span>
        </div>
      </div>

      <!-- Diff rows -->
      <div class="cmp-rows-wrap">
        <div v-if="filteredRows.length === 0" class="compare-empty">
          No entries match the current filter
        </div>

        <div v-for="(row, i) in filteredRows" :key="i" :class="['cmp-row', `kind-${row.kind}`]">

          <!-- Side A -->
          <div :class="['cmp-side', 'side-a', row.kind === 'added' ? 'side-absent' : '']">
            <template v-if="row.entryA">
              <span :class="['kind-badge', row.kind === 'removed' ? 'removed' : 'same']">
                {{ row.kind === 'removed' ? '−' : ' ' }}
              </span>
              <span :class="['dist-badge', getMethodClass(row.method)]">{{ row.method }}</span>
              <span class="cmp-url" :title="row.entryA.url">{{ truncateUrl(row.entryA.url) }}</span>
              <span :class="['status-chip', statusClass(row.entryA.http?.status ?? null)]">
                {{ row.entryA.http?.status ?? '—' }}
              </span>
              <span class="cmp-dur">{{ fmtDur(row.entryA.duration) }}</span>
              <span class="cmp-size">{{ fmtSize(row.entryA.response.bodySize) }}</span>
            </template>
            <span v-else class="side-empty-label">not present</span>
          </div>

          <!-- Divider -->
          <div class="cmp-divider" />

          <!-- Side B -->
          <div :class="['cmp-side', 'side-b', row.kind === 'removed' ? 'side-absent' : `side-${row.kind}`]">
            <template v-if="row.entryB">
              <span :class="['kind-badge', row.kind]">
                {{ row.kind === 'added' ? '+' : row.kind === 'changed' ? '~' : '=' }}
              </span>
              <span :class="['dist-badge', getMethodClass(row.method)]">{{ row.method }}</span>
              <span class="cmp-url" :title="row.entryB.url">{{ truncateUrl(row.entryB.url) }}</span>
              <span :class="['status-chip', statusClass(row.entryB.http?.status ?? null), { 'val-changed': row.statusChanged }]">
                {{ row.entryB.http?.status ?? '—' }}
              </span>
              <span :class="['cmp-dur', { 'val-changed': row.durationChanged }]">
                {{ fmtDur(row.entryB.duration) }}
              </span>
              <span v-if="row.kind === 'changed' && (row.durationChanged || row.statusChanged || row.sizeChanged)"
                :class="['cmp-delta', (row.entryB.duration ?? 0) > (row.entryA?.duration ?? 0) ? 'delta-worse' : 'delta-better']">
                {{ durDelta(row) }}
              </span>
              <span :class="['cmp-size', { 'val-changed': row.sizeChanged }]">
                {{ fmtSize(row.entryB.response.bodySize) }}
              </span>
            </template>
            <span v-else class="side-empty-label">not present</span>
          </div>

        </div>
      </div>

    </template>
  </div>
</template>
