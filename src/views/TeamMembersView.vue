<script setup>
import { ref, onMounted } from 'vue'
import { teamMembersApi, shippingApi } from '@/api/endpoints'

// ── State ─────────────────────────────────────────────────────────────────────

const teamMembers = ref([])
const myStores    = ref([])
const loading      = ref(true)
const error        = ref('')
const success       = ref('')

async function load() {
  loading.value = true
  error.value   = ''
  try {
    const [tmRes, storesRes] = await Promise.all([
      teamMembersApi.list(),
      shippingApi.stores(),
    ])
    teamMembers.value = tmRes.data.results ?? tmRes.data
    myStores.value    = storesRes.data.results ?? storesRes.data
  } catch {
    error.value = 'Failed to load team members.'
  } finally {
    loading.value = false
  }
}

onMounted(load)

// ── Create modal ──────────────────────────────────────────────────────────────

const createModal   = ref(false)
const createForm    = ref({ email: '', full_name: '', password: '', store_ids: [] })
const createLoading = ref(false)
const createError   = ref('')

function openCreate() {
  createForm.value  = { email: '', full_name: '', password: '', store_ids: [] }
  createError.value = ''
  createModal.value = true
}

async function submitCreate() {
  createLoading.value = true
  createError.value   = ''
  try {
    await teamMembersApi.create(createForm.value)
    success.value     = 'Team member created.'
    createModal.value = false
    load()
  } catch (e) {
    createError.value = e?.response?.data?.detail
      ?? e?.response?.data?.email?.[0]
      ?? JSON.stringify(e?.response?.data)
      ?? 'Failed to create team member.'
  } finally {
    createLoading.value = false
  }
}

// ── Edit modal (email / name / password reset) ─────────────────────────────────

const editModal   = ref(false)
const editTarget  = ref(null)
const editForm    = ref({})
const editLoading = ref(false)
const editError   = ref('')

function openEdit(tm) {
  editTarget.value = tm
  editForm.value   = { email: tm.email ?? '', full_name: tm.full_name ?? '', password: '' }
  editError.value  = ''
  editModal.value  = true
}

async function saveEdit() {
  editLoading.value = true
  editError.value   = ''
  try {
    const payload = { ...editForm.value }
    if (!payload.password) delete payload.password
    await teamMembersApi.update(editTarget.value.id, payload)
    success.value   = 'Team member updated.'
    editModal.value = false
    load()
  } catch {
    editError.value = 'Failed to save changes.'
  } finally {
    editLoading.value = false
  }
}

// ── Toggle active ─────────────────────────────────────────────────────────────

const togglingId = ref(null)

async function toggleActive(tm) {
  togglingId.value = tm.id
  try {
    await teamMembersApi.update(tm.id, { is_active: !tm.is_active })
    success.value = `${tm.email} ${tm.is_active ? 'deactivated' : 'activated'}.`
    load()
  } catch {
    error.value = 'Toggle failed.'
  } finally {
    togglingId.value = null
  }
}

// ── Store assignment modal ──────────────────────────────────────────────────────

const storesModal   = ref(false)
const storesTarget  = ref(null)
const storesSelected = ref([])
const storesLoading  = ref(false)
const storesError    = ref('')

function openStores(tm) {
  storesTarget.value   = tm
  storesSelected.value = [...(tm.store_ids ?? [])]
  storesError.value    = ''
  storesModal.value    = true
}

function toggleStore(id) {
  const i = storesSelected.value.indexOf(id)
  if (i === -1) storesSelected.value.push(id)
  else storesSelected.value.splice(i, 1)
}

async function saveStores() {
  storesLoading.value = true
  storesError.value   = ''
  try {
    await teamMembersApi.setStores(storesTarget.value.id, storesSelected.value)
    success.value    = `Stores updated for ${storesTarget.value.email}.`
    storesModal.value = false
    load()
  } catch {
    storesError.value = 'Failed to update stores.'
  } finally {
    storesLoading.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Team Members</h1>
      <button @click="openCreate" class="btn-primary text-sm">+ Add Team Member</button>
    </div>

    <!-- Feedback -->
    <div v-if="error" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex justify-between">
      {{ success }}
      <button @click="success = ''" class="text-emerald-500">✕</button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-3">
      <div v-for="i in 3" :key="i" class="card p-4 h-20 animate-pulse bg-gray-100" />
    </div>

    <!-- Empty -->
    <div v-else-if="!teamMembers.length" class="card p-12 text-center text-text-secondary">
      <div class="text-4xl mb-3">🧑‍🤝‍🧑</div>
      <div class="font-semibold">No team members yet</div>
      <div class="text-sm mt-1">Give helpers their own login, scoped to only the stores they work on.</div>
      <button @click="openCreate" class="btn-primary mt-4 text-sm">Add Team Member</button>
    </div>

    <!-- Table -->
    <div v-else class="card overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-sidebar-bg text-text-secondary text-xs">
          <tr>
            <th class="text-left px-5 py-3">Name / Email</th>
            <th class="text-left px-5 py-3">Assigned Stores</th>
            <th class="text-left px-5 py-3">Status</th>
            <th class="text-right px-5 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tm in teamMembers" :key="tm.id"
            class="border-t border-card-border hover:bg-sidebar-bg/40 transition">
            <td class="px-5 py-3">
              <div class="font-medium">{{ tm.full_name || '—' }}</div>
              <div class="text-xs text-text-secondary">{{ tm.email }}</div>
            </td>
            <td class="px-5 py-3 text-xs text-text-secondary">
              {{ tm.store_count }} store{{ tm.store_count === 1 ? '' : 's' }}
            </td>
            <td class="px-5 py-3">
              <span class="badge text-xs"
                :class="tm.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'">
                {{ tm.is_active ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td class="px-5 py-3">
              <div class="flex justify-end gap-1">
                <button @click="openStores(tm)" class="btn-secondary text-xs py-1 px-2">Stores</button>
                <button @click="openEdit(tm)"   class="btn-secondary text-xs py-1 px-2">Edit</button>
                <button @click="toggleActive(tm)" :disabled="togglingId === tm.id"
                  class="btn-secondary text-xs py-1 px-2"
                  :class="tm.is_active ? 'text-red-600' : 'text-emerald-600'">
                  {{ togglingId === tm.id ? '…' : (tm.is_active ? 'Deactivate' : 'Activate') }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- ── Create / Edit modal ─────────────────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="createModal || editModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
        <h3 class="font-semibold text-lg">
          {{ createModal ? 'New Team Member' : `Edit — ${editTarget?.email}` }}
        </h3>

        <div v-if="createError || editError"
          class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {{ createModal ? createError : editError }}
        </div>

        <div class="space-y-3">
          <div>
            <label class="text-xs text-text-secondary block mb-1">Email</label>
            <input v-model="(createModal ? createForm : editForm).email" type="email"
              autocomplete="off"
              class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="text-xs text-text-secondary block mb-1">Full Name</label>
            <input v-model="(createModal ? createForm : editForm).full_name" type="text"
              class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="text-xs text-text-secondary block mb-1">
              {{ createModal ? 'Password' : 'New Password (leave blank to keep current)' }}
            </label>
            <input v-model="(createModal ? createForm : editForm).password" type="password"
              autocomplete="new-password"
              class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
          </div>

          <div v-if="createModal">
            <label class="text-xs text-text-secondary block mb-1">Assign Stores (optional, can change later)</label>
            <div class="max-h-40 overflow-y-auto rounded-lg border border-card-border p-2 space-y-1">
              <label v-for="s in myStores" :key="s.id" class="flex items-center gap-2 text-sm px-1 py-1">
                <input type="checkbox" :value="s.id" v-model="createForm.store_ids" />
                {{ s.name }}
              </label>
              <div v-if="!myStores.length" class="text-xs text-text-muted px-1 py-1">No stores assigned to your account yet.</div>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2">
          <button @click="createModal = false; editModal = false" class="btn-secondary text-sm">Cancel</button>
          <button v-if="createModal" @click="submitCreate" :disabled="createLoading" class="btn-primary text-sm">
            {{ createLoading ? 'Creating…' : 'Create' }}
          </button>
          <button v-else @click="saveEdit" :disabled="editLoading" class="btn-primary text-sm">
            {{ editLoading ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ── Store assignment modal ─────────────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="storesModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-5">
        <h3 class="font-semibold text-lg">Stores — {{ storesTarget?.email }}</h3>

        <div v-if="storesError" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {{ storesError }}
        </div>

        <div class="max-h-64 overflow-y-auto rounded-lg border border-card-border p-2 space-y-1">
          <label v-for="s in myStores" :key="s.id" class="flex items-center gap-2 text-sm px-1 py-1">
            <input type="checkbox" :checked="storesSelected.includes(s.id)" @change="toggleStore(s.id)" />
            {{ s.name }}
          </label>
          <div v-if="!myStores.length" class="text-xs text-text-muted px-1 py-1">No stores assigned to your account yet.</div>
        </div>

        <div class="flex justify-end gap-2">
          <button @click="storesModal = false" class="btn-secondary text-sm">Cancel</button>
          <button @click="saveStores" :disabled="storesLoading" class="btn-primary text-sm">
            {{ storesLoading ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
