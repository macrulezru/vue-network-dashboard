<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps<{
  modelValue: string
  options: string[]
  placeholder?: string
}>()

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const isOpen = ref(false)
const rootRef = ref<HTMLElement | null>(null)

const toggle = () => {
  if (props.options.length > 0) isOpen.value = !isOpen.value
}

const select = (val: string) => {
  emit('update:modelValue', val)
  isOpen.value = false
}

const clear = (e: MouseEvent) => {
  e.stopPropagation()
  emit('update:modelValue', '')
  isOpen.value = false
}

const onDocClick = (e: MouseEvent) => {
  if (rootRef.value && !rootRef.value.contains(e.target as Node))
    isOpen.value = false
}

onMounted(() => document.addEventListener('click', onDocClick, true))
onUnmounted(() => document.removeEventListener('click', onDocClick, true))
</script>

<template>
  <div ref="rootRef" :class="['filter-select', { open: isOpen, 'has-value': !!modelValue }]">
    <div class="filter-select-trigger" @click="toggle">
      <span :class="['filter-select-value', { placeholder: !modelValue }]">
        {{ modelValue || placeholder }}
      </span>
      <button v-if="modelValue" class="filter-select-clear" @click="clear">&times;</button>
      <svg v-else class="filter-select-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </div>
    <div v-if="isOpen" class="filter-select-dropdown">
      <button
        v-for="opt in options"
        :key="opt"
        :class="['filter-select-option', { active: opt === modelValue }]"
        @click="select(opt)"
      >{{ opt }}</button>
    </div>
  </div>
</template>
