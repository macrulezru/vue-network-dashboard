<script setup lang="ts">
import '../styles/debugger.scss'

import { ref, computed } from 'vue'
import type { MockRule } from '../../core/types'
import { useNetworkDashboard } from '../../plugins/vuePlugin'

const dashboard = useNetworkDashboard()

const mocks = computed(() => dashboard.mocks.value)

// ── Form state ────────────────────────────────────────────────────────────────
const showForm = ref(false)
const editingId = ref<string | null>(null)

const emptyForm = () => ({
  name: '',
  urlPattern: '',
  method: '',
  enabled: true,
  response: {
    status: 200,
    statusText: 'OK',
    body: '',
    delay: 0,
    headers: {} as Record<string, string>
  }
})

const form = ref(emptyForm())

const openAdd = () => {
  form.value = emptyForm()
  editingId.value = null
  showForm.value = true
}

const openEdit = (rule: MockRule) => {
  form.value = {
    name: rule.name ?? '',
    urlPattern: typeof rule.urlPattern === 'string' ? rule.urlPattern : rule.urlPattern.source,
    method: rule.method ?? '',
    enabled: rule.enabled,
    response: {
      status: rule.response.status,
      statusText: rule.response.statusText ?? 'OK',
      body: rule.response.body != null
        ? (typeof rule.response.body === 'string' ? rule.response.body : JSON.stringify(rule.response.body, null, 2))
        : '',
      delay: rule.response.delay ?? 0,
      headers: rule.response.headers ?? {}
    }
  }
  editingId.value = rule.id
  showForm.value = true
}

const cancel = () => {
  showForm.value = false
  editingId.value = null
}

const save = () => {
  let parsedBody: unknown = form.value.response.body
  try {
    if (form.value.response.body) parsedBody = JSON.parse(form.value.response.body)
  } catch { /* keep as string */ }

  const rule: Omit<MockRule, 'id'> = {
    name: form.value.name || undefined,
    urlPattern: form.value.urlPattern,
    method: form.value.method || undefined,
    enabled: form.value.enabled,
    response: {
      status: form.value.response.status,
      statusText: form.value.response.statusText,
      body: parsedBody || undefined,
      delay: form.value.response.delay || undefined,
      headers: Object.keys(form.value.response.headers).length ? form.value.response.headers : undefined
    }
  }

  if (editingId.value) {
    dashboard.updateMock(editingId.value, rule)
  } else {
    dashboard.addMock(rule)
  }
  cancel()
}

const toggle = (rule: MockRule) => {
  dashboard.updateMock(rule.id, { enabled: !rule.enabled })
}

const remove = (id: string) => {
  dashboard.removeMock(id)
}
</script>

<template>
  <div class="mock-panel">
    <!-- Toolbar -->
    <div class="mock-toolbar">
      <span class="mock-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="14" height="14">
          <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
        {{ mocks.length }} mock{{ mocks.length !== 1 ? 's' : '' }}
      </span>
      <button class="btn-icon-label" @click="openAdd">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M12 5v14M5 12h14"/>
        </svg>
        Add rule
      </button>
    </div>

    <!-- Empty state -->
    <div v-if="mocks.length === 0 && !showForm" class="mock-empty">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
        <path d="m9 12 2 2 4-4"/>
      </svg>
      <p>No mock rules yet</p>
      <small>Create rules to intercept requests and return custom responses</small>
    </div>

    <!-- Rule list -->
    <div v-if="mocks.length > 0" class="mock-list">
      <div v-for="rule in mocks" :key="rule.id" :class="['mock-rule', { disabled: !rule.enabled }]">
        <div class="mock-rule-main">
          <button
            :class="['mock-toggle-btn', { active: rule.enabled }]"
            :title="rule.enabled ? 'Disable' : 'Enable'"
            @click="toggle(rule)"
          >
            <span class="mock-dot" />
          </button>
          <div class="mock-rule-info">
            <div class="mock-rule-name">{{ rule.name || (typeof rule.urlPattern === 'string' ? rule.urlPattern : rule.urlPattern.source) }}</div>
            <div class="mock-rule-meta">
              <span v-if="rule.method" class="mock-badge method-badge">{{ rule.method }}</span>
              <span class="mock-badge status-badge">{{ rule.response.status }}</span>
              <span class="mock-url">{{ typeof rule.urlPattern === 'string' ? rule.urlPattern : rule.urlPattern.source }}</span>
              <span v-if="rule.response.delay" class="mock-badge delay-badge">{{ rule.response.delay }}ms delay</span>
            </div>
          </div>
          <div class="mock-rule-actions">
            <button class="btn-icon" title="Edit" @click="openEdit(rule)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
              </svg>
            </button>
            <button class="btn-icon danger" title="Delete" @click="remove(rule.id)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6M14 11v6"/>
                <path d="M9 6V4h6v2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Add / Edit form -->
    <div v-if="showForm" class="mock-form">
      <div class="mock-form-header">
        <span>{{ editingId ? 'Edit rule' : 'New mock rule' }}</span>
        <button class="btn-icon" @click="cancel">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div class="mock-form-body">
        <div class="form-row">
          <label>Name (optional)</label>
          <input v-model="form.name" type="text" placeholder="e.g. Mock /api/users" class="form-input" />
        </div>
        <div class="form-row two-col">
          <div>
            <label>URL pattern <span class="form-hint">(substring or /regex/)</span></label>
            <input v-model="form.urlPattern" type="text" placeholder="/api/users" class="form-input" required />
          </div>
          <div>
            <label>Method <span class="form-hint">(leave empty = any)</span></label>
            <input v-model="form.method" type="text" placeholder="GET" class="form-input" style="text-transform:uppercase" />
          </div>
        </div>
        <div class="form-row two-col">
          <div>
            <label>Status code</label>
            <input v-model.number="form.response.status" type="number" class="form-input" min="100" max="599" />
          </div>
          <div>
            <label>Delay (ms)</label>
            <input v-model.number="form.response.delay" type="number" class="form-input" min="0" placeholder="0" />
          </div>
        </div>
        <div class="form-row">
          <label>Response body <span class="form-hint">(JSON or plain text)</span></label>
          <textarea v-model="form.response.body" class="form-textarea" rows="5" placeholder='{"message": "mocked"}' />
        </div>
      </div>

      <div class="mock-form-footer">
        <button class="form-btn cancel" @click="cancel">Cancel</button>
        <button class="form-btn save" :disabled="!form.urlPattern" @click="save">
          {{ editingId ? 'Update' : 'Create' }}
        </button>
      </div>
    </div>
  </div>
</template>