<script setup>
import { ref, reactive, onMounted } from 'vue'
import { shippingApi, subUsersApi } from '@/api/endpoints'
import { confirmDialog } from '@/composables/useConfirm'

// ── State ─────────────────────────────────────────────────────────────────────

const accounts    = ref([])
const stores      = ref([])
const subUsers    = ref([])
const loading     = ref(true)
const error       = ref('')
const success     = ref('')

// ── Load data ─────────────────────────────────────────────────────────────────

async function fetchAllStores() {
  let page = 1, results = []
  while (true) {
    const { data } = await shippingApi.stores({ page, page_size: 100 })
    const items = data.results ?? data
    results = results.concat(items)
    if (!data.next) break
    page++
  }
  return results
}

async function loadAll() {
  loading.value = true
  error.value   = ''
  try {
    const [accRes, suRes] = await Promise.all([
      shippingApi.accounts(),
      subUsersApi.list(),
    ])
    accounts.value = accRes.data.results ?? accRes.data
    subUsers.value = suRes.data.results ?? suRes.data
    stores.value   = await fetchAllStores()
  } catch {
    error.value = 'Failed to load data.'
  } finally {
    loading.value = false
  }
}

onMounted(loadAll)

// ── Add account modal ─────────────────────────────────────────────────────────

const addModal   = ref(false)
const addForm    = ref({ label: '', api_version: 'V1', api_key: '', api_secret: '' })
const addLoading = ref(false)
const addError   = ref('')

function openAddModal() {
  addForm.value  = { label: '', api_version: 'V1', api_key: '', api_secret: '' }
  addError.value = ''
  addModal.value = true
}

async function submitAdd() {
  addLoading.value = true
  addError.value   = ''
  try {
    await shippingApi.createAccount(addForm.value)
    success.value = 'Account added. Stores are being synced in the background.'
    addModal.value = false
    loadAll()
  } catch (e) {
    addError.value = e?.response?.data?.detail ?? 'Failed to add account.'
  } finally {
    addLoading.value = false
  }
}

// ── Edit credentials modal ────────────────────────────────────────────────────

const editModal   = ref(false)
const editTarget  = ref(null)
const editForm    = ref({ label: '', api_key: '', api_secret: '' })
const editLoading = ref(false)
const editError   = ref('')

function openEditModal(acc) {
  editTarget.value  = acc
  editForm.value    = { label: acc.label, api_key: '', api_secret: '' }
  editError.value   = ''
  editModal.value   = true
}

async function submitEdit() {
  editLoading.value = true
  editError.value   = ''
  try {
    const payload = {}
    if (editForm.value.label !== editTarget.value.label) payload.label = editForm.value.label
    if (editForm.value.api_key) {
      payload.api_key = editForm.value.api_key
      if (editForm.value.api_secret) payload.api_secret = editForm.value.api_secret
    }
    if (!Object.keys(payload).length) { editModal.value = false; return }
    await shippingApi.updateAccount(editTarget.value.id, payload)
    success.value   = 'Account credentials updated.'
    editModal.value = false
    loadAll()
  } catch (e) {
    editError.value = e?.response?.data?.detail ?? 'Update failed.'
  } finally {
    editLoading.value = false
  }
}

// ── Delete account ────────────────────────────────────────────────────────────

async function deleteAccount(acc) {
  if (!(await confirmDialog({
    title: `Delete "${acc.label}"?`,
    message: 'This will remove all its stores.',
    danger: true,
  }))) return
  error.value = ''
  try {
    await shippingApi.deleteAccount(acc.id)
    success.value = 'Account deleted.'
    loadAll()
  } catch {
    error.value = 'Delete failed.'
  }
}

// ── Sync account ──────────────────────────────────────────────────────────────

const syncingId = ref(null)

async function syncAccount(acc) {
  syncingId.value = acc.id
  error.value     = ''
  try {
    await shippingApi.syncAccount(acc.id)
    success.value = 'Store sync started. Refresh in a moment.'
  } catch {
    error.value = 'Sync failed.'
  } finally {
    syncingId.value = null
  }
}

// ── Register webhooks ─────────────────────────────────────────────────────────

const webhookRegId = ref(null)

async function registerWebhooks(acc) {
  webhookRegId.value = acc.id
  error.value        = ''
  try {
    await shippingApi.registerWebhooks(acc.id)
    success.value = 'Webhooks registered with ShipStation. Order status updates will now arrive in real-time.'
  } catch (e) {
    error.value = e?.response?.data?.detail ?? 'Webhook registration failed. Make sure SITE_URL is set to a public URL in .env'
  } finally {
    webhookRegId.value = null
  }
}

// ── Assign store modal ────────────────────────────────────────────────────────

const assignModal   = ref(false)
const assignStore   = ref(null)
const assignSelected = ref([])
const assignLoading  = ref(false)

function openAssign(store) {
  assignStore.value    = store
  assignSelected.value = store.assigned_sub_user_ids ?? []
  assignModal.value    = true
}

function toggleSub(id) {
  const idx = assignSelected.value.indexOf(id)
  if (idx === -1) assignSelected.value.push(id)
  else assignSelected.value.splice(idx, 1)
}

async function saveAssign() {
  assignLoading.value = true
  error.value         = ''
  try {
    await shippingApi.assignStore(assignStore.value.id, assignSelected.value)
    success.value     = 'Store assignment saved.'
    assignModal.value = false
    loadAll()
  } catch {
    error.value = 'Failed to save assignment.'
  } finally {
    assignLoading.value = false
  }
}

// ── Sync store orders ─────────────────────────────────────────────────────────

const syncingStoreId = ref(null)

async function syncStoreOrders(store) {
  syncingStoreId.value = store.id
  error.value          = ''
  try {
    await shippingApi.syncStore(store.id)
    success.value = `Order sync started for "${store.name}". Statuses will update in a moment.`
  } catch {
    error.value = 'Order sync failed.'
  } finally {
    syncingStoreId.value = null
  }
}

// ── Store sender name inline edit ─────────────────────────────────────────────

const editingSenderStoreId = ref(null)
const senderForm = reactive({ ship_from_name: '', ship_from_company: '' })
const senderSaving = ref(false)

function openSenderEdit(store) {
  editingSenderStoreId.value  = store.id
  senderForm.ship_from_name    = store.ship_from_name    || ''
  senderForm.ship_from_company = store.ship_from_company || ''
}

async function saveSender(store) {
  senderSaving.value = true
  try {
    const { data } = await shippingApi.updateStore(store.id, { ...senderForm })
    const idx = stores.value.findIndex(s => s.id === store.id)
    if (idx !== -1) stores.value[idx] = data
    editingSenderStoreId.value = null
  } catch {
    error.value = 'Failed to save sender name.'
  } finally {
    senderSaving.value = false
  }
}

// ── Ship-from address sync (read from ShipStation, per store) ────────────────

const syncingShipFromId = ref(null)

async function syncStoreShipFrom(store) {
  syncingShipFromId.value = store.id
  error.value             = ''
  try {
    const { data } = await shippingApi.syncStoreShipFrom(store.id)
    const idx = stores.value.findIndex(s => s.id === store.id)
    if (idx !== -1) stores.value[idx] = data
    success.value = `Ship-from address synced for "${store.name}".`
  } catch (e) {
    error.value = e?.response?.data?.detail ?? 'Failed to sync ship-from address.'
  } finally {
    syncingShipFromId.value = null
  }
}

function shipFromAddressLine(store) {
  const parts = [
    store.ship_from_street1,
    store.ship_from_street2,
    [store.ship_from_city, store.ship_from_state, store.ship_from_postal_code].filter(Boolean).join(', '),
    store.ship_from_country,
  ].filter(Boolean)
  return parts.join(' · ')
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function accountStores(accountId) {
  return stores.value.filter(s => s.shipstation_account_id === accountId)
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">ShipStation Integration</h1>
      <button @click="openAddModal" class="btn-primary text-sm">+ Add Account</button>
    </div>

    <!-- Feedback -->
    <div v-if="error"   class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex justify-between">
      {{ success }}
      <button @click="success = ''" class="text-emerald-500">✕</button>
    </div>

    <div v-if="loading" class="space-y-3">
      <div v-for="i in 2" :key="i" class="card p-4 h-24 animate-pulse bg-gray-100" />
    </div>

    <!-- Empty state -->
    <div v-else-if="!accounts.length"
      class="card p-12 text-center text-text-secondary">
      <div class="text-4xl mb-3">🔌</div>
      <div class="font-semibold">No ShipStation accounts connected</div>
      <div class="text-sm mt-1">Add your API key to start syncing orders automatically.</div>
      <button @click="openAddModal" class="btn-primary mt-4 text-sm">Connect ShipStation</button>
    </div>

    <!-- Account cards -->
    <div v-else class="space-y-6">
      <div v-for="acc in accounts" :key="acc.id" class="card overflow-hidden">
        <!-- Account header -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-card-border">
          <div>
            <div class="font-semibold">{{ acc.label }}</div>
            <div class="text-xs text-text-secondary mt-0.5">
              API {{ acc.api_version }} ·
              <span :class="acc.is_active ? 'text-emerald-600' : 'text-red-500'">
                {{ acc.is_active ? 'Active' : 'Inactive' }}
              </span>
            </div>
          </div>
          <div class="flex gap-2">
            <button @click="registerWebhooks(acc)" :disabled="webhookRegId === acc.id"
              class="btn-secondary text-xs py-1.5 px-3"
              title="Register real-time order status webhooks with ShipStation (requires public SITE_URL)">
              {{ webhookRegId === acc.id ? '…' : '⚡ Webhooks' }}
            </button>
            <button @click="syncAccount(acc)" :disabled="syncingId === acc.id"
              class="btn-secondary text-xs py-1.5 px-3">
              {{ syncingId === acc.id ? 'Syncing…' : '↻ Sync Stores' }}
            </button>
            <button @click="openEditModal(acc)"
              class="btn-secondary text-xs py-1.5 px-3">
              Edit Credentials
            </button>
            <button @click="deleteAccount(acc)"
              class="btn-secondary text-xs py-1.5 px-3 text-red-600 hover:bg-red-50">
              Delete
            </button>
          </div>
        </div>

        <!-- Stores under this account -->
        <div class="p-4">
          <div class="text-xs font-medium text-text-secondary mb-3">
            Stores ({{ accountStores(acc.id).length }})
          </div>
          <div v-if="!accountStores(acc.id).length" class="text-sm text-text-muted">
            No stores yet. Click "Sync Stores" to fetch from ShipStation.
          </div>
          <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div v-for="store in accountStores(acc.id)" :key="store.id"
              class="p-3 rounded-lg border border-card-border space-y-2">
              <!-- Store header row -->
              <div class="flex items-center justify-between">
                <div>
                  <div class="font-medium text-sm">{{ store.name }}</div>
                  <div class="text-xs text-text-secondary">
                    {{ store.marketplace }} ·
                    {{ store.assigned_sub_user_ids?.length ?? 0 }} sub-user(s) assigned
                  </div>
                </div>
                <div class="flex gap-1.5 shrink-0 ml-2">
                  <button @click="syncStoreOrders(store)" :disabled="syncingStoreId === store.id"
                    class="btn-secondary text-xs py-1 px-2.5 disabled:opacity-50"
                    title="Re-fetch orders from ShipStation and update statuses">
                    {{ syncingStoreId === store.id ? '…' : '↻ Sync' }}
                  </button>
                  <button @click="openAssign(store)"
                    class="btn-secondary text-xs py-1 px-3">
                    Assign
                  </button>
                </div>
              </div>
              <!-- Sender name (inline edit) -->
              <div v-if="editingSenderStoreId === store.id" class="flex gap-2 items-end pt-1">
                <div class="flex-1">
                  <label class="text-[10px] text-text-muted block mb-0.5">Sender Name on Label</label>
                  <input v-model="senderForm.ship_from_name" type="text"
                    placeholder="e.g. MyStore Brand"
                    class="w-full rounded border border-card-border px-2 py-1 text-xs" />
                </div>
                <div class="flex-1">
                  <label class="text-[10px] text-text-muted block mb-0.5">Company (optional)</label>
                  <input v-model="senderForm.ship_from_company" type="text"
                    placeholder="LLC / Inc."
                    class="w-full rounded border border-card-border px-2 py-1 text-xs" />
                </div>
                <button @click="saveSender(store)" :disabled="senderSaving"
                  class="btn-primary text-xs py-1 px-3 shrink-0 disabled:opacity-50">
                  {{ senderSaving ? '…' : 'Save' }}
                </button>
                <button @click="editingSenderStoreId = null"
                  class="text-xs text-text-muted hover:text-text-primary px-1">✕</button>
              </div>
              <div v-else class="flex items-center gap-2 text-xs text-text-secondary">
                <span v-if="store.ship_from_name" class="font-medium text-text-primary">
                  "{{ store.ship_from_name }}"
                </span>
                <span v-else class="italic">No custom sender name — uses PC company name</span>
                <button @click="openSenderEdit(store)"
                  class="text-accent hover:underline ml-auto">Edit sender</button>
              </div>

              <!-- Ship-from address — read-only, synced from this store's ShipStation warehouse -->
              <div class="pt-2 border-t border-card-border/60 text-xs">
                <div class="flex items-start justify-between gap-2">
                  <div>
                    <div class="text-text-muted mb-0.5">Ship-From Address (from ShipStation)</div>
                    <div v-if="store.ship_from_configured" class="text-text-secondary">
                      {{ shipFromAddressLine(store) }}
                      <span v-if="store.ship_from_phone" class="text-text-muted"> · {{ store.ship_from_phone }}</span>
                    </div>
                    <div v-else class="text-amber-600 italic">
                      ⚠ Not configured — orders from this store can't be rated or labeled until synced.
                    </div>
                  </div>
                  <button @click="syncStoreShipFrom(store)" :disabled="syncingShipFromId === store.id"
                    class="btn-secondary text-xs py-1 px-2.5 shrink-0 disabled:opacity-50"
                    title="Re-fetch the ship-from address from this store's ShipStation warehouse">
                    {{ syncingShipFromId === store.id ? '…' : '↻ Sync Address' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Edit credentials modal -->
  <Teleport to="body">
    <div v-if="editModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h3 class="font-semibold text-lg">Edit Account Credentials</h3>
        <div class="text-sm text-text-secondary">{{ editTarget?.label }}</div>

        <div v-if="editError" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {{ editError }}
        </div>

        <div class="space-y-3">
          <div>
            <label class="text-xs text-text-secondary block mb-1">Label</label>
            <input v-model="editForm.label" type="text"
              class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
          </div>
          <div class="border-t border-card-border pt-3">
            <div class="text-xs text-text-muted mb-2">Leave blank to keep existing API credentials</div>
            <div>
              <label class="text-xs text-text-secondary block mb-1">New API Key</label>
              <input v-model="editForm.api_key" type="password"
                placeholder="Enter new key to replace"
                class="w-full rounded-lg border border-card-border px-3 py-2 text-sm font-mono" />
            </div>
          </div>
          <div v-if="editTarget?.api_version === 'V1'">
            <label class="text-xs text-text-secondary block mb-1">New API Secret</label>
            <input v-model="editForm.api_secret" type="password"
              placeholder="Enter new secret to replace"
              class="w-full rounded-lg border border-card-border px-3 py-2 text-sm font-mono" />
          </div>
        </div>

        <div v-if="editForm.api_key" class="text-xs text-text-muted bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          New credentials will be verified against ShipStation before saving.
        </div>

        <div class="flex gap-3 pt-1">
          <button @click="editModal = false" class="btn-secondary flex-1 text-sm">Cancel</button>
          <button @click="submitEdit" :disabled="editLoading"
            class="btn-primary flex-1 text-sm disabled:opacity-50">
            {{ editLoading ? 'Verifying…' : 'Save Changes' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Add account modal -->
  <Teleport to="body">
    <div v-if="addModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      >
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h3 class="font-semibold text-lg">Connect ShipStation Account</h3>

        <div v-if="addError" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {{ addError }}
        </div>

        <div class="space-y-3">
          <div>
            <label class="text-xs text-text-secondary block mb-1">Label (e.g. "Main Store")</label>
            <input v-model="addForm.label" type="text"
              class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
          </div>
          <div>
            <label class="text-xs text-text-secondary block mb-1">API Version</label>
            <select v-model="addForm.api_version"
              class="w-full rounded-lg border border-card-border px-3 py-2 text-sm">
              <option value="V1">V1 (API Key + Secret)</option>
              <option value="V2">V2 (API Key only)</option>
            </select>
          </div>
          <div>
            <label class="text-xs text-text-secondary block mb-1">API Key</label>
            <input v-model="addForm.api_key" type="password"
              class="w-full rounded-lg border border-card-border px-3 py-2 text-sm font-mono" />
          </div>
          <div v-if="addForm.api_version === 'V1'">
            <label class="text-xs text-text-secondary block mb-1">API Secret</label>
            <input v-model="addForm.api_secret" type="password"
              class="w-full rounded-lg border border-card-border px-3 py-2 text-sm font-mono" />
          </div>
        </div>

        <div class="text-xs text-text-muted bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Credentials are verified against ShipStation before saving and stored encrypted.
        </div>

        <div class="flex gap-3 pt-1">
          <button @click="addModal = false" class="btn-secondary flex-1 text-sm">Cancel</button>
          <button @click="submitAdd" :disabled="addLoading || !addForm.api_key || !addForm.label"
            class="btn-primary flex-1 text-sm disabled:opacity-50">
            {{ addLoading ? 'Verifying…' : 'Connect' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Assign sub-users modal -->
  <Teleport to="body">
    <div v-if="assignModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      >
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <h3 class="font-semibold">Assign Sub-users</h3>
        <div class="text-sm text-text-secondary">Store: <b>{{ assignStore?.name }}</b></div>

        <div class="space-y-2 max-h-60 overflow-y-auto">
          <label v-for="su in subUsers" :key="su.id"
            class="flex items-center gap-3 p-2 rounded-lg hover:bg-sidebar-bg cursor-pointer">
            <input type="checkbox"
              :checked="assignSelected.includes(su.id)"
              @change="toggleSub(su.id)"
              class="accent-accent" />
            <div class="text-sm">
              <div class="font-medium">{{ su.full_name || su.email }}</div>
              <div class="text-xs text-text-secondary">{{ su.email }}</div>
            </div>
          </label>
          <div v-if="!subUsers.length" class="text-sm text-text-muted text-center py-4">
            No sub-users yet.
          </div>
        </div>

        <div class="flex gap-3">
          <button @click="assignModal = false" class="btn-secondary flex-1 text-sm">Cancel</button>
          <button @click="saveAssign" :disabled="assignLoading"
            class="btn-primary flex-1 text-sm">
            {{ assignLoading ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
