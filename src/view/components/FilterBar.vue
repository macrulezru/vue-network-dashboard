<script setup lang="ts">
import { computed } from 'vue'
import type { FilterOptions } from '../composables/useLogFilter'

const props = defineProps<{
  filters: FilterOptions
}>()

const emit = defineEmits<{
  'update:filters': [filters: FilterOptions]
}>()

const localFilters = computed({
  get: () => props.filters,
  set: (value) => emit('update:filters', value)
})

const resetFilters = () => {
  emit('update:filters', {
    type: 'all',
    method: '',
    url: '',
    status: '',
    minDuration: null,
    hasError: false
  })
}
</script>

<template>
  <div class="filter-bar">
    <select v-model="localFilters.type" class="filter-select">
      <option value="all">All Types</option>
      <option value="http">HTTP</option>
      <option value="websocket">WebSocket</option>
      <option value="sse">Server-Sent Events</option>
    </select>
    
    <input
      v-model="localFilters.method"
      type="text"
      placeholder="Method (GET, POST, WS, SSE...)"
      class="filter-input"
    />
    
    <input
      v-model="localFilters.url"
      type="text"
      placeholder="URL filter..."
      class="filter-input"
    />
    
    <input
      v-model="localFilters.status"
      type="text"
      placeholder="Status code..."
      class="filter-input small"
    />
    
    <input
      v-model.number="localFilters.minDuration"
      type="number"
      placeholder="Min duration (ms)"
      class="filter-input small"
    />
    
    <label class="filter-checkbox">
      <input v-model="localFilters.hasError" type="checkbox" />
      <span>Only errors</span>
    </label>
    
    <button class="filter-reset" @click="resetFilters">Reset</button>
  </div>
</template>