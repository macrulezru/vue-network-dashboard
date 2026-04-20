<script setup lang="ts">
import '../styles/debugger.scss'

import { ref, computed } from 'vue'
import type { UnifiedLogEntry } from '../../core/types'

const props = defineProps<{ log: UnifiedLogEntry }>()
const emit = defineEmits<{
  close: []
  replay: [req: { url: string; method: string; headers: Record<string, string>; body: string | null }]
}>()

const SKIP_HEADERS = new Set(['host', 'content-length', 'transfer-encoding', 'connection', 'keep-alive'])

const editUrl    = ref(props.log.url)
const editMethod = ref(props.log.method)
const editBody   = ref(
  props.log.request.body == null ? '' :
  typeof props.log.request.body === 'string'
    ? props.log.request.body
    : JSON.stringify(props.log.request.body, null, 2)
)

// Headers as editable list of [key, value] pairs
const editHeaders = ref<Array<{ key: string; value: string }>>(
  Object.entries(props.log.requestHeaders)
    .filter(([k]) => !SKIP_HEADERS.has(k.toLowerCase()))
    .map(([key, value]) => ({ key, value }))
)

const addHeader = () => editHeaders.value.push({ key: '', value: '' })
const removeHeader = (i: number) => editHeaders.value.splice(i, 1)

const headersMap = computed((): Record<string, string> => {
  const m: Record<string, string> = {}
  for (const { key, value } of editHeaders.value) {
    if (key.trim()) m[key.trim()] = value
  }
  return m
})

const isBodyValid = computed(() => {
  if (!editBody.value.trim()) return true
  try { JSON.parse(editBody.value); return true } catch { return false }
})

const send = () => {
  emit('replay', {
    url:     editUrl.value,
    method:  editMethod.value,
    headers: headersMap.value,
    body:    editBody.value.trim() || null,
  })
}
</script>

<template>
  <div class="modal-backdrop" @mousedown.self="emit('close')">
    <div class="replay-modal">
      <div class="modal-header">
        <span>Edit &amp; Replay</span>
        <button class="btn-icon" @click="emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="modal-body">
        <!-- URL + method row -->
        <div class="replay-url-row">
          <select v-model="editMethod" class="replay-method-select">
            <option v-for="m in ['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS']" :key="m">{{ m }}</option>
          </select>
          <input v-model="editUrl" class="replay-url-input" placeholder="URL" spellcheck="false" />
        </div>

        <!-- Headers -->
        <div class="replay-section-label">Headers</div>
        <div class="replay-headers">
          <div v-for="(h, i) in editHeaders" :key="i" class="replay-header-row">
            <input v-model="h.key"   class="replay-hdr-key"   placeholder="Name" spellcheck="false" />
            <input v-model="h.value" class="replay-hdr-val"   placeholder="Value" spellcheck="false" />
            <button class="btn-icon danger" @click="removeHeader(i)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <button class="replay-add-header" @click="addHeader">+ Add header</button>
        </div>

        <!-- Body -->
        <div class="replay-section-label">
          Body
          <span v-if="!isBodyValid" class="replay-json-warn">Invalid JSON</span>
        </div>
        <textarea
          v-model="editBody"
          class="replay-body-area"
          :class="{ 'json-invalid': !isBodyValid }"
          placeholder="Request body (JSON or plain text)"
          spellcheck="false"
        />
      </div>

      <div class="modal-footer">
        <button class="form-btn cancel" @click="emit('close')">Cancel</button>
        <button class="form-btn save" @click="send">Send</button>
      </div>
    </div>
  </div>
</template>
