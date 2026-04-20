<script setup lang="ts">
import '../styles/debugger.scss'
import { ref } from 'vue'
import type { BreakpointEdits } from '../../core/types'
import { useNetworkDashboard } from '../../plugins/vuePlugin'

const dashboard = useNetworkDashboard()
const rules = dashboard.breakpointRules
const active = dashboard.activeBreakpoints

// ── Add / edit rule form ──────────────────────────────────────────────────────
const showForm    = ref(false)
const editingId   = ref<string | null>(null)
const formPattern = ref('')
const formMethod  = ref('')
const formName    = ref('')

const openAdd = () => {
  editingId.value   = null
  formPattern.value = ''
  formMethod.value  = ''
  formName.value    = ''
  showForm.value    = true
}

const openEdit = (rule: { id: string; urlPattern: string | RegExp; method?: string; name?: string }) => {
  editingId.value   = rule.id
  formPattern.value = typeof rule.urlPattern === 'string' ? rule.urlPattern : rule.urlPattern.source
  formMethod.value  = rule.method ?? ''
  formName.value    = rule.name ?? ''
  showForm.value    = true
}

const saveForm = () => {
  if (!formPattern.value.trim()) return
  const updates = {
    urlPattern: formPattern.value.trim(),
    method: formMethod.value.trim() || undefined,
    name: formName.value.trim() || undefined,
  }
  if (editingId.value) {
    dashboard.updateBreakpointRule(editingId.value, updates)
  } else {
    dashboard.addBreakpointRule({ ...updates, enabled: true })
  }
  showForm.value  = false
  editingId.value = null
}

const cancelForm = () => {
  showForm.value  = false
  editingId.value = null
}

// ── Per-breakpoint editable state ─────────────────────────────────────────────
const editState = ref<Record<string, {
  url: string
  method: string
  headersText: string
  body: string
}>>({})

const getEdit = (id: string, bp: { url: string; method: string; requestHeaders: Record<string, string>; requestBody: unknown }) => {
  if (!editState.value[id]) {
    editState.value[id] = {
      url: bp.url,
      method: bp.method,
      headersText: Object.entries(bp.requestHeaders).map(([k, v]) => `${k}: ${v}`).join('\n'),
      body: bp.requestBody == null ? '' : (typeof bp.requestBody === 'string' ? bp.requestBody : JSON.stringify(bp.requestBody, null, 2)),
    }
  }
  return editState.value[id]
}

const release = (id: string, bp: { url: string; method: string; requestHeaders: Record<string, string>; requestBody: unknown }) => {
  const e = getEdit(id, bp)
  const headers: Record<string, string> = {}
  for (const line of e.headersText.split('\n')) {
    const colon = line.indexOf(':')
    if (colon > 0) headers[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
  }
  const edits: BreakpointEdits = {
    url: e.url,
    method: e.method,
    headers,
    body: e.body.trim() || null,
  }
  delete editState.value[id]
  dashboard.releaseBreakpoint(id, edits)
}

const cancel = (id: string) => {
  delete editState.value[id]
  dashboard.cancelBreakpoint(id)
}
</script>

<template>
  <div class="bp-panel">
    <!-- Toolbar -->
    <div class="mock-toolbar">
      <div class="mock-toolbar-left">
        <button class="btn-icon-label" @click="openAdd">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          Add breakpoint
        </button>
      </div>
      <span class="mock-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="14" height="14">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        {{ rules.length }} rule{{ rules.length !== 1 ? 's' : '' }}
        <span v-if="active.length" class="bp-active-count">{{ active.length }} paused</span>
      </span>
    </div>

    <!-- Add rule form (only when adding, not editing) -->
    <div v-if="showForm && !editingId" class="bp-add-form">
      <div class="form-row">
        <label>Name <span class="form-hint">(optional)</span></label>
        <input v-model="formName" class="form-input" placeholder="e.g. Pause user requests" @keyup.escape="cancelForm" />
      </div>
      <div class="form-row two-col">
        <div>
          <label>URL pattern <span class="form-hint">(substring or /regex/)</span></label>
          <input v-model="formPattern" class="form-input" placeholder="/api/users" @keyup.enter="saveForm" @keyup.escape="cancelForm" />
        </div>
        <div>
          <label>Method <span class="form-hint">(leave empty = any)</span></label>
          <input v-model="formMethod" class="form-input" placeholder="GET" style="text-transform:uppercase" @keyup.enter="saveForm" @keyup.escape="cancelForm" />
        </div>
      </div>
      <div class="bp-add-form-actions">
        <button class="form-btn cancel" @click="cancelForm">Cancel</button>
        <button class="form-btn save" :disabled="!formPattern.trim()" @click="saveForm">Add</button>
      </div>
    </div>

    <!-- Rules list -->
    <div class="bp-rules">
      <div v-if="!rules.length" class="mock-empty-small" style="padding:12px 16px">
        No breakpoints. Add one to pause matching requests before they are sent.
      </div>
      <template v-for="rule in rules" :key="rule.id">
        <!-- Inline edit form replacing the row -->
        <div v-if="editingId === rule.id" class="bp-add-form bp-inline-form">
          <div class="form-row">
            <label>Name <span class="form-hint">(optional)</span></label>
            <input v-model="formName" class="form-input" placeholder="e.g. Pause user requests" @keyup.escape="cancelForm" />
          </div>
          <div class="form-row two-col">
            <div>
              <label>URL pattern <span class="form-hint">(substring or /regex/)</span></label>
              <input v-model="formPattern" class="form-input" placeholder="/api/users" @keyup.enter="saveForm" @keyup.escape="cancelForm" />
            </div>
            <div>
              <label>Method <span class="form-hint">(leave empty = any)</span></label>
              <input v-model="formMethod" class="form-input" placeholder="GET" style="text-transform:uppercase" @keyup.enter="saveForm" @keyup.escape="cancelForm" />
            </div>
          </div>
          <div class="bp-add-form-actions">
            <button class="form-btn cancel" @click="cancelForm">Cancel</button>
            <button class="form-btn save" :disabled="!formPattern.trim()" @click="saveForm">Update</button>
          </div>
        </div>

        <!-- Normal rule row -->
        <div v-else class="bp-rule">
          <button
            :class="['mock-toggle-btn', { active: rule.enabled }]"
            @click="dashboard.updateBreakpointRule(rule.id, { enabled: !rule.enabled })"
          >
            <span class="mock-dot" />
          </button>
          <div class="bp-rule-info">
            <span v-if="rule.method" class="mock-badge method-badge">{{ rule.method }}</span>
            <span class="bp-rule-pattern">{{ typeof rule.urlPattern === 'string' ? rule.urlPattern : rule.urlPattern.source }}</span>
            <span v-if="rule.name" class="form-hint" style="margin-left:6px">{{ rule.name }}</span>
          </div>
          <button class="btn-icon" title="Edit" @click="openEdit(rule)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
            </svg>
          </button>
          <button class="btn-icon danger" @click="dashboard.removeBreakpointRule(rule.id)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
              <path d="M10 11v6M14 11v6"/>
            </svg>
          </button>
        </div>
      </template>
    </div>

    <!-- Active (paused) breakpoints -->
    <template v-if="active.length">
      <div class="bp-section-label">
        <span class="bp-pulse" />
        Paused requests
      </div>

      <div v-for="bp in active" :key="bp.id" class="bp-card">
        <div class="bp-card-header">
          <span class="mock-badge method-badge">{{ bp.method }}</span>
          <span class="bp-card-url">{{ bp.url }}</span>
          <span class="form-hint" style="margin-left:auto;white-space:nowrap">
            {{ new Date(bp.timestamp).toLocaleTimeString() }}
          </span>
        </div>

        <div class="bp-card-fields">
          <label>URL</label>
          <input v-model="getEdit(bp.id, bp).url" class="form-input" spellcheck="false" />

          <label>Method</label>
          <input v-model="getEdit(bp.id, bp).method" class="form-input" style="text-transform:uppercase;width:100px" spellcheck="false" />

          <label>Headers <span class="form-hint">(one per line, Name: Value)</span></label>
          <textarea v-model="getEdit(bp.id, bp).headersText" class="form-textarea bp-headers-area" rows="3" spellcheck="false" />

          <label>Body</label>
          <textarea v-model="getEdit(bp.id, bp).body" class="form-textarea" rows="4" spellcheck="false" placeholder="(empty)" />
        </div>

        <div class="bp-card-actions">
          <button class="form-btn cancel" @click="cancel(bp.id)">Cancel request</button>
          <button class="form-btn save" @click="release(bp.id, bp)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="14" height="14" style="margin-right:4px">
              <polygon points="5 3 19 12 5 21 5 3"/>
            </svg>
            Release
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
