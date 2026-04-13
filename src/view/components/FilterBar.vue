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

const hasRoutes = computed(() => props.logs.some(log => log.route !== undefined))

const setType = (type: FilterOptions['type']) => {
  emit('update:filters', { ...props.filters, type })
}

const setUrl = (e: Event) => {
  emit('update:filters', { ...props.filters, url: (e.target as HTMLInputElement).value })
}

const setBody = (e: Event) => {
  emit('update:filters', { ...props.filters, body: (e.target as HTMLInputElement).value })
}

const setRoute = (e: Event) => {
  emit('update:filters', { ...props.filters, route: (e.target as HTMLInputElement).value })
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

const toggleWsMessages = () => {
  emit('update:filters', { ...props.filters, wsMessagesOnly: !props.filters.wsMessagesOnly })
}

const resetFilters = () => {
  emit('update:filters', { type: 'all', method: '', url: '', body: '', route: '', status: '', minDuration: null, hasError: false, wsMessagesOnly: false })
}
</script>

<template>
  <div class="filter-bar">

    <!-- Левая колонка: переключатели протоколов -->
    <div class="filter-type-tabs">
      <button :class="{ active: filters.type === 'all' }"            @click="setType('all')"      >All</button>
      <button :class="{ active: filters.type === 'http',      'active-http': filters.type === 'http' }"      @click="setType('http')"      >HTTP</button>
      <button :class="{ active: filters.type === 'websocket', 'active-ws':   filters.type === 'websocket' }" @click="setType('websocket')" >WS</button>
      <button :class="{ active: filters.type === 'sse',       'active-sse':  filters.type === 'sse' }"       @click="setType('sse')"       >SSE</button>
    </div>

    <!-- Центральная колонка: два ряда фильтров -->
    <div class="filter-center">
      <!-- Ряд 1: поиск по URL + маршрут (если есть хотя бы один лог с route) -->
      <div :class="['filter-search-wrap', { 'is-regex': filters.url.startsWith('regex:') }]">
        <svg class="filter-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          :value="filters.url"
          type="text"
          placeholder="URL... or regex:pattern"
          class="filter-input"
          @input="setUrl"
        />
        <span v-if="filters.url.startsWith('regex:')" class="filter-regex-badge" title="Regex mode">RX</span>
      </div>

      <!-- Ряд 1б: поиск по маршруту (показывается только если роутер передан) -->
      <div v-if="hasRoutes" :class="['filter-search-wrap', { 'is-regex': filters.route.startsWith('regex:') }]">
        <svg class="filter-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M3 12h18M3 6l9-3 9 3M3 18l9 3 9-3"/>
        </svg>
        <input
          :value="filters.route"
          type="text"
          placeholder="Route... or regex:pattern"
          class="filter-input"
          @input="setRoute"
        />
        <span v-if="filters.route.startsWith('regex:')" class="filter-regex-badge" title="Regex mode">RX</span>
      </div>

      <!-- Ряд 2: детальные фильтры -->
      <div class="filter-row-secondary">
        <div :class="['filter-body-wrap', { 'is-regex': filters.body.startsWith('regex:') }]">
          <input
            :value="filters.body"
            type="text"
            placeholder="Body... or regex:pattern"
            class="filter-input-plain filter-body-input"
            @input="setBody"
          />
          <span v-if="filters.body.startsWith('regex:')" class="filter-regex-badge" title="Regex mode">RX</span>
        </div>

        <FilterSelect
          :model-value="filters.method"
          :options="methodOptions"
          placeholder="Method"
          @update:model-value="setMethod"
        />

        <FilterSelect
          :model-value="filters.status"
          :options="statusOptions"
          placeholder="Status"
          class="filter-select-sm"
          @update:model-value="setStatus"
        />

        <input
          :value="filters.minDuration ?? ''"
          type="number"
          placeholder="≥ ms"
          class="filter-input-plain filter-input-sm"
          @input="setMinDuration"
        />

        <button :class="['filter-toggle', { active: filters.hasError }]" @click="toggleErrors">
          <span class="toggle-dot" />
          Errors
        </button>

        <button
          v-if="filters.type === 'websocket'"
          :class="['filter-toggle', { active: filters.wsMessagesOnly }]"
          @click="toggleWsMessages"
        >
          <span class="toggle-dot" />
          Messages only
        </button>
      </div>
    </div>

    <!-- Правая колонка: кнопка Reset -->
    <button class="filter-reset" @click="resetFilters">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
        <path d="M3 3v5h5"/>
      </svg>
      Reset
    </button>

  </div>
</template>
