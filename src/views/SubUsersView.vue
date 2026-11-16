<script setup>
import { ref, onMounted } from 'vue'
import { subUsersApi } from '@/api/endpoints'

// ── State ─────────────────────────────────────────────────────────────────────

const subUsers = ref([])
const loading  = ref(true)
const error    = ref('')
const success  = ref('')

async function load() {
  loading.value = true
  error.value   = ''
  try {
    const { data } = await subUsersApi.list()
    subUsers.value = data.results ?? data
  } catch {
    error.value = 'Failed to load sub-users.'
  } finally {
    loading.value = false
  }
}

onMounted(load)

// ── Shared form defaults ──────────────────────────────────────────────────────

function blankForm(overrides = {}) {
  return {
    email:    '',
    full_name: '',
    password: '',
    // Shipping markup
    shipping_markup_type:  'fixed',
    shipping_markup_value: '0.00',
    // Extra print area
    extra_print_area_enabled: false,
    extra_print_area_price:   '0.00',
    // Permissions
    can_edit_orders:             true,
    can_upload_product_mapping:  true,
    can_reship_without_pc_approval: false,
    can_report_lost_shipment:      false,
    ...overrides,
  }
}

// ── Create modal ──────────────────────────────────────────────────────────────

const createModal   = ref(false)
const createForm    = ref(blankForm())
const createLoading = ref(false)
const createError   = ref('')

function openCreate() {
  createForm.value  = blankForm()
  createError.value = ''
  createModal.value = true
}

function cleanPayload(form) {
  return { ...form }
}

async function submitCreate() {
  createLoading.value = true
  createError.value   = ''
  try {
    await subUsersApi.create(cleanPayload(createForm.value))
    success.value     = 'Sub-user created.'
    createModal.value = false
    load()
  } catch (e) {
    createError.value = e?.response?.data?.detail
      ?? JSON.stringify(e?.response?.data)
      ?? 'Failed to create sub-user.'
  } finally {
    createLoading.value = false
  }
}

// ── Edit modal ────────────────────────────────────────────────────────────────

const editModal   = ref(false)
const editTarget  = ref(null)
const editForm    = ref({})
const editLoading = ref(false)
const editError   = ref('')

function openEdit(su) {
  editTarget.value = su
  editForm.value   = blankForm({
    email:    su.email ?? '',
    full_name: su.full_name ?? '',
    // no password field in edit — blank = no change
    password: '',
    shipping_markup_type:     su.shipping_markup_type ?? 'fixed',
    shipping_markup_value:    su.shipping_markup_value ?? '0.00',
    extra_print_area_enabled: su.extra_print_area_enabled ?? false,
    extra_print_area_price:   su.extra_print_area_price ?? '0.00',
    can_edit_orders:                su.can_edit_orders ?? true,
    can_upload_product_mapping:     su.can_upload_product_mapping ?? true,
    can_reship_without_pc_approval: su.can_reship_without_pc_approval ?? false,
    can_report_lost_shipment:       su.can_report_lost_shipment ?? false,
  })
  editError.value  = ''
  editModal.value  = true
}

async function saveEdit() {
  editLoading.value = true
  editError.value   = ''
  try {
    const payload = cleanPayload(editForm.value)
    if (!payload.password) delete payload.password
    await subUsersApi.update(editTarget.value.id, payload)
    success.value   = 'Sub-user updated.'
    editModal.value = false
    load()
  } catch {
    editError.value = 'Failed to save changes.'
  } finally {
    editLoading.value = false
  }
}

// ── Add balance modal ─────────────────────────────────────────────────────────

const balanceModal   = ref(false)
const balanceTarget  = ref(null)
const balanceAmount  = ref('')
const balanceNote    = ref('')
const balanceLoading = ref(false)
const balanceError   = ref('')

function openAddBalance(su) {
  balanceTarget.value = su
  balanceAmount.value = ''
  balanceNote.value   = ''
  balanceError.value  = ''
  balanceModal.value  = true
}

async function submitBalance() {
  const amt = parseFloat(balanceAmount.value)
  if (!amt || amt <= 0) { balanceError.value = 'Enter a valid amount.'; return }
  balanceLoading.value = true
  balanceError.value   = ''
  try {
    await subUsersApi.addBalance(balanceTarget.value.id, { amount: amt, description: balanceNote.value })
    success.value      = `$${amt.toFixed(2)} added to ${balanceTarget.value.email}.`
    balanceModal.value = false
    load()
  } catch (e) {
    balanceError.value = e?.response?.data?.detail ?? 'Failed to add balance.'
  } finally {
    balanceLoading.value = false
  }
}

// ── Toggle active ─────────────────────────────────────────────────────────────

const togglingId = ref(null)

async function toggleActive(su) {
  togglingId.value = su.id
  try {
    await subUsersApi.toggleActive(su.id)
    success.value = `${su.email} ${su.is_active ? 'deactivated' : 'activated'}.`
    load()
  } catch {
    error.value = 'Toggle failed.'
  } finally {
    togglingId.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Sub-Users</h1>
      <button @click="openCreate" class="btn-primary text-sm">+ Add Sub-User</button>
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
    <div v-else-if="!subUsers.length" class="card p-12 text-center text-text-secondary">
      <div class="text-4xl mb-3">👤</div>
      <div class="font-semibold">No sub-users yet</div>
      <div class="text-sm mt-1">Add store owners who will use your print center.</div>
      <button @click="openCreate" class="btn-primary mt-4 text-sm">Add Sub-User</button>
    </div>

    <!-- Table -->
    <div v-else class="card overflow-hidden">
      <table class="w-full text-base">
        <thead class="bg-sidebar-bg text-text-secondary text-sm">
          <tr>
            <th class="text-left px-5 py-3">Name / Email</th>
            <th class="text-left px-5 py-3">Status</th>
            <th class="text-right px-5 py-3">Current Balance</th>
            <th class="text-left px-5 py-3">Shipping Markup</th>
            <th class="text-right px-5 py-3">Total Processed</th>
            <th class="text-right px-5 py-3">Total Orders</th>
            <th class="text-right px-5 py-3">Total Items</th>
            <th class="text-right px-5 py-3">Team Members</th>
            <th class="text-right px-5 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="su in subUsers" :key="su.id"
            class="border-t border-card-border hover:bg-sidebar-bg/40 transition">
            <td class="px-5 py-3">
              <div class="font-medium">{{ su.full_name || '—' }}</div>
              <div class="text-xs text-text-secondary">{{ su.email }}</div>
            </td>
            <td class="px-5 py-3">
              <span class="badge text-xs"
                :class="su.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'">
                {{ su.is_active ? 'Active' : 'Inactive' }}
              </span>
            </td>
            <td class="px-5 py-3 text-right">
              <span :class="Number(su.balance) < 0 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'">
                ${{ Number(su.balance).toFixed(2) }}
              </span>
            </td>
            <td class="px-5 py-3 text-text-secondary">
              <span v-if="su.shipping_markup_type === 'percent'">{{ su.shipping_markup_value }}%</span>
              <span v-else>+${{ Number(su.shipping_markup_value).toFixed(2) }}</span>
            </td>
            <td class="px-5 py-3 text-right text-text-secondary">
              ${{ Number(su.processed_total ?? 0).toFixed(2) }}
            </td>
            <td class="px-5 py-3 text-right text-text-secondary">
              {{ su.total_orders ?? 0 }}
            </td>
            <td class="px-5 py-3 text-right text-text-secondary">
              {{ su.total_items ?? 0 }}
            </td>
            <td class="px-5 py-3 text-right text-text-secondary">
              {{ su.team_member_count ?? 0 }}
            </td>
            <td class="px-5 py-3">
              <div class="flex justify-end gap-1">
                <button @click="openAddBalance(su)" class="btn-secondary text-xs py-1 px-2">+ Balance</button>
                <button @click="openEdit(su)"        class="btn-secondary text-xs py-1 px-2">Edit</button>
                <button @click="toggleActive(su)" :disabled="togglingId === su.id"
                  class="btn-secondary text-xs py-1 px-2"
                  :class="su.is_active ? 'text-red-600' : 'text-emerald-600'">
                  {{ togglingId === su.id ? '…' : (su.is_active ? 'Deactivate' : 'Activate') }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- ── Create / Edit shared modal ─────────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="createModal || editModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-5">

        <h3 class="font-semibold text-lg">
          {{ createModal ? 'New Sub-User' : `Edit — ${editTarget?.email}` }}
        </h3>

        <div v-if="createError || editError"
          class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {{ createModal ? createError : editError }}
        </div>

        <!-- Computed shorthand so template stays clean -->
        <template v-if="createModal || editModal">
          <div :data-form="createModal ? 'create' : 'edit'">

            <!-- ── Account ─────────────────────────────────────────────────── -->
            <div class="space-y-3">
              <div class="text-xs font-semibold text-text-secondary uppercase tracking-wide">Account</div>
              <div>
                <label class="text-xs text-text-secondary block mb-1">Email</label>
                <input v-model="(createModal ? createForm : editForm).email" type="email"
                  autocomplete="off"
                  :disabled="!createModal"
                  class="w-full rounded-lg border border-card-border px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-text-muted" />
              </div>
              <div>
                <label class="text-xs text-text-secondary block mb-1">Full Name</label>
                <input v-model="(createModal ? createForm : editForm).full_name" type="text"
                  autocomplete="off"
                  class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
              </div>
              <div>
                <label class="text-xs text-text-secondary block mb-1">
                  Password{{ editModal ? ' (leave blank to keep current)' : '' }}
                </label>
                <input v-model="(createModal ? createForm : editForm).password" type="password"
                  autocomplete="new-password"
                  class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
              </div>
            </div>

            <!-- ── Shipping Markup ─────────────────────────────────────────── -->
            <div class="space-y-3 mt-5">
              <div class="text-xs font-semibold text-text-secondary uppercase tracking-wide">Shipping Markup</div>
              <div class="grid grid-cols-2 gap-3">
                <div>
                  <label class="text-xs text-text-secondary block mb-1">Type</label>
                  <select v-model="(createModal ? createForm : editForm).shipping_markup_type"
                    class="w-full rounded-lg border border-card-border px-3 py-2 text-sm">
                    <option value="fixed">Fixed ($)</option>
                    <option value="percent">Percent (%)</option>
                  </select>
                </div>
                <div>
                  <label class="text-xs text-text-secondary block mb-1">Value</label>
                  <input v-model="(createModal ? createForm : editForm).shipping_markup_value"
                    type="number" step="0.01" min="0"
                    class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
                </div>
              </div>
            </div>

            <!-- ── Extra Print Area ────────────────────────────────────────── -->
            <div class="space-y-3 mt-5">
              <div class="text-xs font-semibold text-text-secondary uppercase tracking-wide">Extra Print Area</div>
              <label class="flex items-center gap-2 text-sm">
                <input type="checkbox"
                  v-model="(createModal ? createForm : editForm).extra_print_area_enabled"
                  class="accent-accent" />
                Enabled
              </label>
              <div v-if="(createModal ? createForm : editForm).extra_print_area_enabled">
                <label class="text-xs text-text-secondary block mb-1">Price per area ($)</label>
                <input v-model="(createModal ? createForm : editForm).extra_print_area_price"
                  type="number" step="0.01" min="0"
                  class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
              </div>
            </div>

            <!-- ── Permissions ─────────────────────────────────────────────── -->
            <div class="space-y-2 mt-5">
              <div class="text-xs font-semibold text-text-secondary uppercase tracking-wide">Permissions</div>
              <div class="grid grid-cols-2 gap-y-2 gap-x-4">
                <label v-for="perm in [
                  { key: 'can_edit_orders',               label: 'Edit Orders' },
                  { key: 'can_upload_product_mapping',    label: 'Product Mapping' },
                  { key: 'can_reship_without_pc_approval', label: 'Auto-Approve Reships' },
                  { key: 'can_report_lost_shipment',       label: 'Report Lost Shipment' },
                ]" :key="perm.key" class="flex items-center gap-2 text-sm">
                  <input type="checkbox"
                    v-model="(createModal ? createForm : editForm)[perm.key]"
                    class="accent-accent" />
                  {{ perm.label }}
                </label>
              </div>
            </div>

          </div>
        </template>

        <div class="flex gap-3 pt-2">
          <button @click="createModal ? (createModal = false) : (editModal = false)"
            class="btn-secondary flex-1 text-sm">Cancel</button>
          <button
            @click="createModal ? submitCreate() : saveEdit()"
            :disabled="createLoading || editLoading"
            class="btn-primary flex-1 text-sm">
            {{ (createLoading || editLoading) ? '…' : (createModal ? 'Create' : 'Save') }}
          </button>
        </div>

      </div>
    </div>
  </Teleport>

  <!-- ── Add balance modal ───────────────────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="balanceModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 space-y-4">
        <h3 class="font-semibold">Add Balance</h3>
        <div class="text-sm text-text-secondary">{{ balanceTarget?.email }}</div>
        <div v-if="balanceError" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {{ balanceError }}
        </div>
        <div class="space-y-3">
          <div>
            <label class="text-xs text-text-secondary block mb-1">Amount ($)</label>
            <input v-model="balanceAmount" type="number" step="0.01" min="0.01"
              class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" placeholder="0.00" />
          </div>
          <div>
            <label class="text-xs text-text-secondary block mb-1">Note (optional)</label>
            <input v-model="balanceNote" type="text"
              class="w-full rounded-lg border border-card-border px-3 py-2 text-sm"
              placeholder="e.g. Manual top-up" />
          </div>
        </div>
        <div class="flex gap-3 pt-1">
          <button @click="balanceModal = false" class="btn-secondary flex-1 text-sm">Cancel</button>
          <button @click="submitBalance" :disabled="balanceLoading"
            class="btn-primary flex-1 text-sm">{{ balanceLoading ? '…' : 'Add' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
