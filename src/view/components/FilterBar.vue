<script setup lang="ts">
import { computed } from 'vue'
import type { UnifiedLogEntry } from '../../core/types'
import type { FilterOptions } from '../composables/useLogFilter'
import FilterSelect from './FilterSelect.vue'

const props = defineProps<{
  filters: FilterOptions
  logs: UnifiedLogEntry[]
}>()

const emit = defineEmits<{ 'update:filters': [filters: FilterOptions] }>()

const methodOptions = computed(() => {
  const methods = new Set<string>()
  const source = props.filters.status
    ? props.logs.filter(log => log.http?.status?.toString() === props.filters.status)
    : props.logs
  for (const log of source) {
    if (log.method) methods.add(log.method.toUpperCase())
  }
  return [...methods].sort()
})

const statusOptions = computed(() => {
  const codes = new Set<string>()
  const source = props.filters.method
    ? props.logs.filter(log => log.method.toUpperCase() === props.filters.method.toUpperCase())
    : props.logs
  for (const log of source) {
    if (log.http?.status) codes.add(log.http.status.toString())
  }
  return [...codes].sort((a, b) => Number(a) - Number(b))
})

const setType = (type: FilterOptions['type']) => {
  emit('update:filters', { ...props.filters, type })
}

const setUrl = (e: Event) => {
  emit('update:filters', { ...props.filters, url: (e.target as HTMLInputElement).value })
}

const setBody = (e: Event) => {
  emit('update:filters', { ...props.filters, body: (e.target as HTMLInputElement).value })
}

const setMethod = (value: string) => {
  emit('update:filters', { ...props.filters, method: value })
}

const setStatus = (value: string) => {
  emit('update:filters', { ...props.filters, status: value })
}

const setMinDuration = (e: Event) => {
  const val = (e.target as HTMLInputElement).value
  emit('update:filters', { ...props.filters, minDuration: val ? Number(val) : null })
}

const toggleErrors = () => {
  emit('update:filters', { ...props.filters, hasError: !props.filters.hasError })
}

const resetFilters = () => {
  emit('update:filters', { type: 'all', method: '', url: '', body: '', status: '', minDuration: null, hasError: false })
}
</script>

<template>
  <div class="filter-bar">
    <!-- Type tabs -->
    <div class="filter-type-tabs">
      <button
        :class="['', filters.type === 'all' ? 'active' : '']"
        @click="setType('all')"
      >All</button>
      <button
        :class="[filters.type === 'http' ? 'active active-http' : '']"
        @click="setType('http')"
      >HTTP</button>
      <button
        :class="[filters.type === 'websocket' ? 'active active-ws' : '']"
        @click="setType('websocket')"
      >WS</button>
      <button
        :class="[filters.type === 'sse' ? 'active active-sse' : '']"
        @click="setType('sse')"
      >SSE</button>
    </div>

    <!-- URL search -->
    <div class="filter-search-wrap">
      <svg class="filter-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.35-4.35"/>
      </svg>
      <input
        :value="filters.url"
        type="text"
        placeholder="Filter by URL..."
        class="filter-input"
        @input="setUrl"
      />
    </div>

    <!-- Body search -->
    <input
      :value="filters.body"
      type="text"
      placeholder="Body..."
      class="filter-input-plain"
      @input="setBody"
    />

    <!-- Method select -->
    <FilterSelect
      :model-value="filters.method"
      :options="methodOptions"
      placeholder="Method"
      @update:model-value="setMethod"
    />

    <!-- Status select -->
    <FilterSelect
      :model-value="filters.status"
      :options="statusOptions"
      placeholder="Status"
      class="filter-select-sm"
      @update:model-value="setStatus"
    />

    <!-- Min duration -->
    <input
      :value="filters.minDuration ?? ''"
      type="number"
      placeholder="≥ ms"
      class="filter-input-plain filter-input-sm"
      @input="setMinDuration"
    />

    <!-- Errors toggle -->
    <button :class="['filter-toggle', { active: filters.hasError }]" @click="toggleErrors">
      <span class="toggle-dot" />
      Errors
    </button>

    <!-- Reset -->
    <button class="filter-reset" @click="resetFilters">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
        <path d="M3 3v5h5"/>
      </svg>
      Reset
    </button>
  </div>
</template>
