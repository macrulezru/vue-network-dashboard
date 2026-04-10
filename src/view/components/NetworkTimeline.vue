<script setup lang="ts">
import '../styles/debugger.scss'

import { computed } from 'vue'
import type { UnifiedLogEntry } from '../../core/types'

const props = defineProps<{ logs: UnifiedLogEntry[] }>()

const timeline = computed(() => {
  const visible = props.logs.filter(l => !l.metadata?.pending && l.startTime)
  if (visible.length === 0) return { entries: [], span: 0, minTime: 0 }

  const minTime = Math.min(...visible.map(l => l.startTime))
  const maxTime = Math.max(...visible.map(l => l.endTime ?? (l.startTime + (l.duration ?? 0))))
  const span = Math.max(maxTime - minTime, 1)

  const entries = visible.map(l => {
    const left = ((l.startTime - minTime) / span) * 100
    const width = Math.max(((l.duration ?? 0) / span) * 100, 0.3)
    return { log: l, left, width }
  })

  return { entries, span, minTime }
})

const getBarClass = (log: UnifiedLogEntry): string => {
  if (log.error.occurred) return 'bar-error'
  if (log.type === 'websocket') return 'bar-ws'
  if (log.type === 'sse') return 'bar-sse'
  const s = log.http?.status ?? 0
  if (s >= 500) return 'bar-server-error'
  if (s >= 400) return 'bar-client-error'
  if (s >= 200) return 'bar-success'
  return 'bar-default'
}

const formatMs = (ms: number): string => ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`

const tickLabels = computed(() => {
  const span = timeline.value.span
  if (span === 0) return []
  const steps = [0, 0.25, 0.5, 0.75, 1]
  return steps.map(p => ({ pct: p * 100, label: formatMs(Math.round(p * span)) }))
})
</script>

<template>
  <div class="timeline-panel">
    <div v-if="timeline.entries.length === 0" class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      <p>No completed requests to display</p>
    </div>

    <div v-else class="timeline-body">
      <!-- Tick axis -->
      <div class="timeline-axis">
        <div class="timeline-labels-col" />
        <div class="timeline-ticks">
          <div
            v-for="tick in tickLabels"
            :key="tick.pct"
            class="timeline-tick"
            :style="{
              left: tick.pct + '%',
              transform: tick.pct === 100 ? 'translateX(-100%)' : tick.pct === 0 ? 'translateX(0)' : 'translateX(-50%)'
            }"
          >
            {{ tick.label }}
          </div>
        </div>
      </div>

      <!-- Rows -->
      <div class="timeline-rows">
        <div
          v-for="{ log, left, width } in timeline.entries"
          :key="log.id"
          class="timeline-row"
        >
          <!-- Label -->
          <div class="timeline-label" :title="log.url">
            <span :class="['tl-method', log.type === 'websocket' ? 'websocket' : log.type === 'sse' ? 'sse' : (log.method?.toLowerCase() ?? 'default')]">
              {{ log.method }}
            </span>
            <span class="tl-url">{{ log.url }}</span>
          </div>
          <!-- Bar track -->
          <div class="timeline-track">
            <div
              :class="['timeline-bar', getBarClass(log)]"
              :style="{ left: left + '%', width: width + '%' }"
              :title="`${log.duration ?? '?'}ms`"
            />
          </div>
          <!-- Duration -->
          <span class="timeline-dur">
            {{ log.duration != null ? formatMs(log.duration) : '?' }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>
