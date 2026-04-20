<script setup lang="ts">
import '../styles/debugger.scss'
import { ref, computed, nextTick } from 'vue'
import type { MockRule, MockRulesGroup } from '../../core/types'
import { useNetworkDashboard } from '../../plugins/vuePlugin'
import { parseOpenApi } from '../../core/openApiParser'

const dashboard = useNetworkDashboard()

const groups = computed(() => dashboard.mockGroups.value)

// ── Форма редактирования мока (инлайн внутри группы) ──────────────────────────
const showForm = ref(false)
const editingGroupId = ref<string | null>(null)
const editingRuleId = ref<string | null>(null)

const emptyRule = () => ({
  name: '',
  urlPattern: '',
  method: '',
  enabled: true,
  mode: 'mock' as 'mock' | 'transform',
  response: {
    status: 200,
    statusText: 'OK',
    body: '',
    delay: 0,
    headers: {} as Record<string, string>
  },
  conditions: {
    queryParams:  [] as Array<{ key: string; value: string }>,
    headers:      [] as Array<{ key: string; value: string }>,
    bodyFields:   [] as Array<{ key: string; value: string }>,
  },
  transform: {
    status: null as number | null,
    headers:    [] as Array<{ key: string; value: string }>,
    bodyMerge:  [] as Array<{ key: string; value: string }>,
    bodyDelete: [] as string[],
  }
})

const form = ref(emptyRule())

const openAddToGroup = (groupId: string) => {
  form.value = emptyRule()
  editingGroupId.value = groupId
  editingRuleId.value = null
  showForm.value = true
  // Expand group so the form is visible
  const group = groups.value.find(g => g.id === groupId)
  if (group && !group.isOpened) dashboard.expandMockGroup(groupId, true)
}

const toKV = (obj?: Record<string, unknown>) =>
  Object.entries(obj ?? {}).map(([key, value]) => ({ key, value: String(value) }))

const openEditRule = (groupId: string, rule: MockRule) => {
  form.value = {
    name: rule.name ?? '',
    urlPattern: typeof rule.urlPattern === 'string' ? rule.urlPattern : rule.urlPattern.source,
    method: rule.method ?? '',
    enabled: rule.enabled,
    mode: rule.mode ?? 'mock',
    response: {
      status: rule.response.status,
      statusText: rule.response.statusText ?? 'OK',
      body: rule.response.body != null
        ? (typeof rule.response.body === 'string' ? rule.response.body : JSON.stringify(rule.response.body, null, 2))
        : '',
      delay: rule.response.delay ?? 0,
      headers: rule.response.headers ?? {}
    },
    conditions: {
      queryParams: toKV(rule.conditions?.queryParams as Record<string, unknown>),
      headers:     toKV(rule.conditions?.headers as Record<string, unknown>),
      bodyFields:  toKV(rule.conditions?.bodyFields as Record<string, unknown>),
    },
    transform: {
      status: rule.transform?.status ?? null,
      headers:    toKV(rule.transform?.headers as Record<string, unknown>),
      bodyMerge:  toKV(rule.transform?.bodyMerge as Record<string, unknown>),
      bodyDelete: rule.transform?.bodyDelete ?? [],
    }
  }
  editingGroupId.value = groupId
  editingRuleId.value = rule.id
  showForm.value = true
}

const cancelForm = () => {
  showForm.value = false
  editingGroupId.value = null
  editingRuleId.value = null
}

const kvToRecord = (arr: Array<{ key: string; value: string }>) => {
  const out: Record<string, string> = {}
  for (const { key, value } of arr) if (key.trim()) out[key.trim()] = value
  return Object.keys(out).length ? out : undefined
}

const saveRule = () => {
  let parsedBody: unknown = form.value.response.body
  try {
    if (form.value.response.body) parsedBody = JSON.parse(form.value.response.body)
  } catch { /* keep as string */ }

  const isTransform = form.value.mode === 'transform'

  const bodyMergeRaw = kvToRecord(form.value.transform.bodyMerge)
  const bodyMerge = bodyMergeRaw
    ? Object.fromEntries(Object.entries(bodyMergeRaw).map(([k, v]) => {
        try { return [k, JSON.parse(v)] } catch { return [k, v] }
      }))
    : undefined

  const rule: Omit<MockRule, 'id'> = {
    name: form.value.name || undefined,
    urlPattern: form.value.urlPattern,
    method: form.value.method || undefined,
    enabled: form.value.enabled,
    mode: isTransform ? 'transform' : 'mock',
    response: {
      status: form.value.response.status,
      statusText: form.value.response.statusText,
      body: isTransform ? undefined : (parsedBody || undefined),
      delay: form.value.response.delay || undefined,
      headers: Object.keys(form.value.response.headers).length ? form.value.response.headers : undefined
    },
    ...(isTransform ? {
      transform: {
        status: form.value.transform.status ?? undefined,
        headers: kvToRecord(form.value.transform.headers),
        bodyMerge,
        bodyDelete: form.value.transform.bodyDelete.filter(Boolean) || undefined,
      }
    } : {}),
    conditions: (() => {
      const qp = kvToRecord(form.value.conditions.queryParams)
      const hd = kvToRecord(form.value.conditions.headers)
      const bfRaw = kvToRecord(form.value.conditions.bodyFields)
      const bf = bfRaw
        ? Object.fromEntries(Object.entries(bfRaw).map(([k, v]) => {
            try { return [k, JSON.parse(v)] } catch { return [k, v] }
          }))
        : undefined
      return (qp || hd || bf) ? { queryParams: qp, headers: hd, bodyFields: bf } : undefined
    })()
  }

  if (editingRuleId.value && editingGroupId.value) {
    dashboard.updateMockInGroup(editingGroupId.value, editingRuleId.value, rule)
  } else if (editingGroupId.value) {
    dashboard.addMockToGroup(editingGroupId.value, rule)
  }
  cancelForm()
}

// ── Переименование группы (инлайн по двойному клику) ──────────────────────────
const renamingGroupId = ref<string | null>(null)
const renameValue = ref('')
const renameInputRef = ref<HTMLInputElement | null>(null)

const startRename = (group: MockRulesGroup) => {
  renamingGroupId.value = group.id
  renameValue.value = group.name
  nextTick(() => renameInputRef.value?.select())
}

const commitRename = (groupId: string) => {
  if (renamingGroupId.value !== groupId) return
  const name = renameValue.value.trim()
  if (name) dashboard.renameMockGroup(groupId, name)
  renamingGroupId.value = null
}

const cancelRename = () => {
  renamingGroupId.value = null
}

// ── Диалог новой группы ───────────────────────────────────────────────────────
const showNewGroupDialog = ref(false)
const newGroupName = ref('')
const newGroupInputRef = ref<HTMLInputElement | null>(null)

const openNewGroupDialog = () => {
  newGroupName.value = `Group ${groups.value.length + 1}`
  showNewGroupDialog.value = true
  nextTick(() => {
    newGroupInputRef.value?.select()
  })
}

const confirmNewGroup = () => {
  const name = newGroupName.value.trim()
  if (name) dashboard.addMockGroup(name)
  showNewGroupDialog.value = false
}

const cancelNewGroupDialog = () => {
  showNewGroupDialog.value = false
}

// ── Диалог удаления группы ────────────────────────────────────────────────────
const deleteGroupTarget = ref<MockRulesGroup | null>(null)

const removeGroup = (group: MockRulesGroup) => {
  deleteGroupTarget.value = group
}

const confirmDeleteGroup = () => {
  if (deleteGroupTarget.value) {
    dashboard.removeMockGroup(deleteGroupTarget.value.id)
    deleteGroupTarget.value = null
  }
}

const cancelDeleteGroup = () => {
  deleteGroupTarget.value = null
}

const toggleGroup = (groupId: string) => {
  const group = groups.value.find(g => g.id === groupId)
  if (group) dashboard.toggleMockGroup(groupId, !group.enabled)
}

const toggleExpand = (groupId: string) => {
  const group = groups.value.find(g => g.id === groupId)
  if (group) dashboard.expandMockGroup(groupId, !group.isOpened)
}

// ── Управление моками ────────────────────────────────────────────────────────
const toggleRule = (groupId: string, rule: MockRule) => {
  dashboard.updateMockInGroup(groupId, rule.id, { enabled: !rule.enabled })
}

const removeRule = (groupId: string, ruleId: string) => {
  dashboard.removeMockFromGroup(groupId, ruleId)
}

// ── OpenAPI import ────────────────────────────────────────────────────────────
const openApiInputRef = ref<HTMLInputElement | null>(null)

const importOpenApi = () => openApiInputRef.value?.click()

const onOpenApiFileChange = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    try {
      const raw = JSON.parse(ev.target?.result as string)
      const { title, rules } = parseOpenApi(raw)
      if (!rules.length) {
        alert('No operations found in this OpenAPI spec.')
        return
      }
      const group = dashboard.addMockGroup(title)
      for (const rule of rules) {
        dashboard.addMockToGroup(group.id, rule)
      }
      dashboard.expandMockGroup(group.id, true)
    } catch {
      alert('Failed to parse OpenAPI spec. Make sure the file is valid JSON (OpenAPI 3.x or Swagger 2.x).')
    }
    if (openApiInputRef.value) openApiInputRef.value.value = ''
  }
  reader.readAsText(file)
}

// ── Импорт / экспорт конфигурации ─────────────────────────────────────────────
const fileInputRef = ref<HTMLInputElement | null>(null)

const exportConfig = () => {
  const config = {
    version: 1,
    groups: groups.value.map(g => ({
      id: g.id,
      name: g.name,
      enabled: g.enabled,
      isOpened: g.isOpened,
      rules: g.rules ?? []
    }))
  }
  const json = JSON.stringify(config, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'mock-config.json'
  a.click()
  URL.revokeObjectURL(url)
}

const importConfig = () => {
  fileInputRef.value?.click()
}

const onFileChange = (e: Event) => {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    try {
      const config = JSON.parse(ev.target?.result as string)
      if (!config.groups || !Array.isArray(config.groups)) {
        alert('Invalid mock config: expected { groups: [...] }')
        return
      }
      dashboard.replaceMockGroups(config.groups as MockRulesGroup[])
    } catch {
      alert('Failed to parse mock config file')
    }
    if (fileInputRef.value) fileInputRef.value.value = ''
  }
  reader.readAsText(file)
}
</script>

<template>
  <div class="mock-panel">
    <!-- Toolbar -->
    <div class="mock-toolbar">
      <div class="mock-toolbar-left">
        <button class="btn-icon-label" title="Import OpenAPI / Swagger JSON spec and generate mocks" @click="importOpenApi">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="12" y1="11" x2="12" y2="17"/>
            <line x1="9" y1="14" x2="15" y2="14"/>
          </svg>
          OpenAPI
        </button>
        <input ref="openApiInputRef" type="file" accept=".json" style="display:none" @change="onOpenApiFileChange" />
        <button class="btn-icon-label" title="Import config from JSON file" @click="importConfig">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          Import
        </button>
        <button class="btn-icon-label" title="Export config to JSON file" @click="exportConfig">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Export
        </button>
        <button class="btn-icon-label" @click="openNewGroupDialog">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M12 5v14M5 12h14"/>
            <path d="M4 4h16v16H4z"/>
          </svg>
          New group
        </button>
        <input ref="fileInputRef" type="file" accept=".json" style="display:none" @change="onFileChange" />
      </div>
      <span class="mock-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="14" height="14">
          <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
          <path d="m9 12 2 2 4-4"/>
        </svg>
        {{ groups.flatMap(g => g.rules?.length || 0).reduce((a,b) => a+b, 0) }} mocks in {{ groups.length }} groups
      </span>
    </div>

    <!-- Список групп -->
    <div class="mock-groups">
      <!-- Инлайн-форма создания группы -->
      <div v-if="showNewGroupDialog" class="mock-group new-group-card">
        <div class="new-group-card-inner">
          <input
            ref="newGroupInputRef"
            v-model="newGroupName"
            class="form-input"
            placeholder="Group name"
            @keyup.enter="confirmNewGroup"
            @keyup.escape="cancelNewGroupDialog"
          />
          <div class="new-group-card-actions">
            <button class="form-btn cancel" @click="cancelNewGroupDialog">Cancel</button>
            <button class="form-btn save" :disabled="!newGroupName.trim()" @click="confirmNewGroup">Create</button>
          </div>
        </div>
      </div>

      <div v-for="group in groups" :key="group.id" class="mock-group">
        <!-- Заголовок группы -->
        <!-- Режим подтверждения удаления: заменяет шапку группы -->
        <div v-if="deleteGroupTarget?.id === group.id" class="mock-group-header mock-group-delete-confirm">
          <span class="mp-confirm-text">
            Delete <strong>{{ group.name }}</strong> and {{ group.rules?.length || 0 }} mock(s)?
          </span>
          <div class="mock-group-header-right">
            <button class="form-btn cancel" @click="cancelDeleteGroup">Cancel</button>
            <button class="form-btn save danger" @click="confirmDeleteGroup">Delete</button>
          </div>
        </div>

        <!-- Обычная шапка группы -->
        <div v-else :class="['mock-group-header', { disabled: !group.enabled }]">
          <div class="mock-group-header-left">
            <button class="btn-icon expand-btn" @click="toggleExpand(group.id)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" :style="{ transform: group.isOpened ? 'rotate(90deg)' : 'none' }">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </button>
            <button
              :class="['mock-group-toggle-btn', { active: group.enabled }]"
              :title="group.enabled ? 'Disable group' : 'Enable group'"
              @click="toggleGroup(group.id)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 22 24">
                <path :class="['mock-group-toggle-icon', { active: group.enabled }]" fill-rule="evenodd" d="M5.077 10.286a5 5 0 0 0 1.943-.392A5.1 5.1 0 0 0 8.667 8.78a5.2 5.2 0 0 0 1.1-1.668 5.2 5.2 0 0 0 0-3.936 5.2 5.2 0 0 0-1.1-1.669A5.1 5.1 0 0 0 7.02.391 5 5 0 0 0 5.077 0a5.04 5.04 0 0 0-3.59 1.506A5.18 5.18 0 0 0 0 5.143c0 1.364.535 2.672 1.487 3.636a5.04 5.04 0 0 0 3.59 1.507m0-3.429c.449 0 .88-.18 1.197-.502.317-.321.495-.757.495-1.212s-.178-.89-.495-1.212a1.68 1.68 0 0 0-1.197-.502c-.449 0-.88.18-1.197.502a1.73 1.73 0 0 0-.495 1.212c0 .455.178.89.495 1.212a1.68 1.68 0 0 0 1.197.502m0 17.143a5.04 5.04 0 0 0 3.59-1.506 5.18 5.18 0 0 0 1.487-3.637 5.18 5.18 0 0 0-1.487-3.636 5.04 5.04 0 0 0-3.59-1.507 5.04 5.04 0 0 0-3.59 1.507A5.18 5.18 0 0 0 0 18.857a5.18 5.18 0 0 0 1.487 3.637A5.04 5.04 0 0 0 5.077 24m0-3.429c.449 0 .88-.18 1.197-.502a1.726 1.726 0 0 0 0-2.424 1.68 1.68 0 0 0-1.197-.502c-.449 0-.88.18-1.197.502a1.73 1.73 0 0 0-.495 1.212c0 .455.178.89.495 1.212a1.68 1.68 0 0 0 1.197.502M22 12a5.2 5.2 0 0 1-.387 1.968 5.2 5.2 0 0 1-1.1 1.668 5.1 5.1 0 0 1-1.647 1.115 5.02 5.02 0 0 1-5.533-1.115 5.2 5.2 0 0 1-1.1-1.668A5.2 5.2 0 0 1 11.846 12a5.18 5.18 0 0 1 1.487-3.637 5.04 5.04 0 0 1 3.59-1.506c1.347 0 2.638.542 3.59 1.506A5.18 5.18 0 0 1 22 12m-3.385 0c0 .455-.178.89-.495 1.212a1.68 1.68 0 0 1-1.197.502c-.449 0-.88-.18-1.197-.502A1.73 1.73 0 0 1 15.231 12c0-.455.178-.89.495-1.212a1.68 1.68 0 0 1 1.197-.502c.449 0 .88.18 1.197.502.317.321.495.757.495 1.212" clip-rule="evenodd"/>
              </svg>
            </button>
            <!-- Инлайн-переименование по двойному клику -->
            <input
              v-if="renamingGroupId === group.id"
              ref="renameInputRef"
              v-model="renameValue"
              class="mock-group-name-input"
              @keyup.enter="commitRename(group.id)"
              @keyup.escape="cancelRename"
              @blur="commitRename(group.id)"
              @click.stop
            />
            <span v-else class="mock-group-name" title="Double-click to rename" @dblclick="startRename(group)">{{ group.name }}</span>
            <span class="mock-group-count">({{ group.rules?.length || 0 }})</span>
          </div>
          <div class="mock-group-header-right">
            <button class="btn-icon" title="Add mock to group" @click="openAddToGroup(group.id)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
            <button v-if="group.name !== 'default'" class="btn-icon danger" title="Delete group" @click="removeGroup(group)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14H6L5 6"/>
                <path d="M10 11v6M14 11v6"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Список моков в группе -->
        <div v-if="group.isOpened" class="mock-group-rules">
          <div v-for="rule in (group.rules || [])" :key="rule.id" :class="['mock-rule', { disabled: !rule.enabled }]">
            <div class="mock-rule-main">
              <button
                :class="['mock-toggle-btn', { active: rule.enabled && group.enabled }]"
                :title="rule.enabled ? 'Disable' : 'Enable'"
                @click="toggleRule(group.id, rule)"
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
                <button class="btn-icon" title="Edit" @click="openEditRule(group.id, rule)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                  </svg>
                </button>
                <button class="btn-icon danger" title="Delete" @click="removeRule(group.id, rule.id)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14H6L5 6"/>
                    <path d="M10 11v6M14 11v6"/>
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div v-if="!group.rules?.length" class="mock-empty-small">
            No mocks in this group
          </div>
        </div>

        <!-- Инлайн-форма добавления/редактирования для этой группы -->
        <div v-if="showForm && editingGroupId === group.id" class="mock-form mock-form-inline">
          <div class="mock-form-header">
            <span>{{ editingRuleId ? 'Edit mock' : 'New mock' }} in "{{ group.name }}"</span>
            <button class="btn-icon" @click="cancelForm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div class="mock-form-body">
            <div class="form-row">
              <label>Name <span class="form-hint">(optional)</span></label>
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

            <!-- Mode toggle -->
            <div class="form-row">
              <label>Mode</label>
              <div class="mode-toggle">
                <button :class="['mode-btn', { active: form.mode === 'mock' }]" @click="form.mode = 'mock'">Mock</button>
                <button :class="['mode-btn', { active: form.mode === 'transform' }]" @click="form.mode = 'transform'">Transform</button>
              </div>
              <span class="form-hint" style="margin-top:4px;display:block">
                {{ form.mode === 'mock' ? 'Replace response entirely' : 'Modify the real response on the fly' }}
              </span>
            </div>

            <!-- Mock mode fields -->
            <template v-if="form.mode === 'mock'">
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
                <textarea v-model="form.response.body" class="form-textarea" rows="6" placeholder='{"message": "mocked"}' />
              </div>
            </template>

            <!-- Transform mode fields -->
            <template v-else>
              <div class="form-row">
                <label>Status override <span class="form-hint">(leave empty = keep real status)</span></label>
                <input v-model.number="form.transform.status" type="number" class="form-input" min="100" max="599" placeholder="e.g. 200" />
              </div>

              <div class="form-row">
                <label>Add / override headers</label>
                <div class="kv-list">
                  <div v-for="(h, i) in form.transform.headers" :key="i" class="kv-row">
                    <input v-model="h.key" class="form-input" placeholder="Header name" />
                    <input v-model="h.value" class="form-input" placeholder="Value" />
                    <button class="btn-icon danger" @click="form.transform.headers.splice(i, 1)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                  <button class="replay-add-header" @click="form.transform.headers.push({ key: '', value: '' })">+ Add header</button>
                </div>
              </div>

              <div class="form-row">
                <label>Merge into body <span class="form-hint">(JSON fields to add / override)</span></label>
                <div class="kv-list">
                  <div v-for="(f, i) in form.transform.bodyMerge" :key="i" class="kv-row">
                    <input v-model="f.key" class="form-input" placeholder="Field name" />
                    <input v-model="f.value" class="form-input" placeholder="Value (JSON or string)" />
                    <button class="btn-icon danger" @click="form.transform.bodyMerge.splice(i, 1)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                  <button class="replay-add-header" @click="form.transform.bodyMerge.push({ key: '', value: '' })">+ Add field</button>
                </div>
              </div>

              <div class="form-row">
                <label>Remove from body <span class="form-hint">(field names to delete)</span></label>
                <div class="kv-list">
                  <div v-for="(_, i) in form.transform.bodyDelete" :key="i" class="kv-row">
                    <input v-model="form.transform.bodyDelete[i]" class="form-input" placeholder="Field name" />
                    <button class="btn-icon danger" @click="form.transform.bodyDelete.splice(i, 1)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                  <button class="replay-add-header" @click="form.transform.bodyDelete.push('')">+ Add field</button>
                </div>
              </div>
            </template>
          </div>

          <!-- Conditions (always shown, for both mock and transform modes) -->
          <div class="mock-form-conditions">
            <div class="conditions-label">
              Match conditions
              <span class="form-hint">(all must pass, leave empty to skip)</span>
            </div>

            <div class="conditions-group">
              <div class="conditions-group-title">Query params</div>
              <div class="kv-list">
                <div v-for="(p, i) in form.conditions.queryParams" :key="i" class="kv-row">
                  <input v-model="p.key"   class="form-input" placeholder="name" spellcheck="false" />
                  <input v-model="p.value" class="form-input" placeholder="value" spellcheck="false" />
                  <button class="btn-icon danger" @click="form.conditions.queryParams.splice(i, 1)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <button class="replay-add-header" @click="form.conditions.queryParams.push({ key: '', value: '' })">+ Add param</button>
              </div>
            </div>

            <div class="conditions-group">
              <div class="conditions-group-title">Request headers</div>
              <div class="kv-list">
                <div v-for="(h, i) in form.conditions.headers" :key="i" class="kv-row">
                  <input v-model="h.key"   class="form-input" placeholder="Header-Name" spellcheck="false" />
                  <input v-model="h.value" class="form-input" placeholder="value" spellcheck="false" />
                  <button class="btn-icon danger" @click="form.conditions.headers.splice(i, 1)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <button class="replay-add-header" @click="form.conditions.headers.push({ key: '', value: '' })">+ Add header</button>
              </div>
            </div>

            <div class="conditions-group">
              <div class="conditions-group-title">Body fields <span class="form-hint">(top-level JSON, value supports JSON)</span></div>
              <div class="kv-list">
                <div v-for="(f, i) in form.conditions.bodyFields" :key="i" class="kv-row">
                  <input v-model="f.key"   class="form-input" placeholder="field" spellcheck="false" />
                  <input v-model="f.value" class="form-input" placeholder="value" spellcheck="false" />
                  <button class="btn-icon danger" @click="form.conditions.bodyFields.splice(i, 1)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <button class="replay-add-header" @click="form.conditions.bodyFields.push({ key: '', value: '' })">+ Add field</button>
              </div>
            </div>
          </div>

          <div class="mock-form-footer">
            <button class="form-btn cancel" @click="cancelForm">Cancel</button>
            <button class="form-btn save" :disabled="!form.urlPattern" @click="saveRule">
              {{ editingRuleId ? 'Update' : 'Create' }}
            </button>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>
