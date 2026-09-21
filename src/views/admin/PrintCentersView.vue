<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { superAdminApi } from '@/api/endpoints'

const router = useRouter()
const auth   = useAuthStore()

// ── State ─────────────────────────────────────────────────────────────────────

const printCenters = ref([])
const loading      = ref(true)
const error        = ref('')
const success      = ref('')
const statusFilter = ref('')

// ── Timezone list (common options) ────────────────────────────────────────────

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Anchorage',
  'America/Honolulu',
  'Europe/London',
  'Europe/Istanbul',
  'Europe/Berlin',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Australia/Sydney',
]

async function load() {
  loading.value = true
  error.value   = ''
  try {
    const params = {}
    if (statusFilter.value) params.status = statusFilter.value
    const { data } = await superAdminApi.printCenters(params)
    printCenters.value = data.results ?? data
  } catch {
    error.value = 'Failed to load print centers.'
  } finally {
    loading.value = false
  }
}

onMounted(load)

// ── Status counts ─────────────────────────────────────────────────────────────

const counts = computed(() => {
  const all = printCenters.value
  return {
    all:       all.length,
    pending:   all.filter(p => p.status === 'pending').length,
    active:    all.filter(p => p.status === 'active').length,
    suspended: all.filter(p => p.status === 'suspended').length,
  }
})

// ── Quick status actions ───────────────────────────────────────────────────────

const actionLoading = ref(null)

async function setStatus(pc, newStatus) {
  actionLoading.value = pc.id
  error.value         = ''
  try {
    const fd = new FormData()
    fd.append('status', newStatus)
    await superAdminApi.updatePrintCenter(pc.id, fd)
    success.value = `${pc.company_name} → ${newStatus}`
    load()
  } catch (e) {
    error.value = e?.response?.data?.detail ?? 'Action failed.'
  } finally {
    actionLoading.value = null
  }
}

// ── Impersonation ─────────────────────────────────────────────────────────────

const impersonateLoading = ref(null)

async function impersonate(pc) {
  impersonateLoading.value = pc.id
  try {
    await auth.impersonate(pc.id)
    router.push({ name: 'dashboard' })
  } catch (e) {
    error.value = e?.response?.data?.detail ?? 'Impersonation failed.'
  } finally {
    impersonateLoading.value = null
  }
}

// ── Create modal ──────────────────────────────────────────────────────────────

const createModal   = ref(false)
const createLoading = ref(false)
const createError   = ref('')
const createForm    = ref({
  email:        '',
  password:     '',
  full_name:    '',
  company_name: '',
  timezone:     'UTC',
  monthly_fee:  '0',
  max_sub_users: '',
  logo:         null,
})
const logoPreview   = ref(null)

function openCreate() {
  createForm.value = {
    email: '', password: '', full_name: '', company_name: '',
    timezone: 'UTC', monthly_fee: '0', max_sub_users: '', logo: null,
  }
  logoPreview.value = null
  createError.value = ''
  createModal.value = true
}

function handleLogoChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  createForm.value.logo = file
  logoPreview.value = URL.createObjectURL(file)
}

async function saveCreate() {
  createLoading.value = true
  createError.value   = ''
  try {
    const fd = new FormData()
    fd.append('email',        createForm.value.email)
    fd.append('password',     createForm.value.password)
    fd.append('full_name',    createForm.value.full_name)
    fd.append('company_name', createForm.value.company_name)
    fd.append('timezone',     createForm.value.timezone)
    fd.append('monthly_fee',  createForm.value.monthly_fee || '0')
    if (createForm.value.max_sub_users)
      fd.append('max_sub_users', createForm.value.max_sub_users)
    if (createForm.value.logo)
      fd.append('logo', createForm.value.logo)

    await superAdminApi.createPrintCenter(fd)
    success.value     = `${createForm.value.company_name} created.`
    createModal.value = false
    load()
  } catch (e) {
    const d = e?.response?.data
    createError.value = d?.detail || Object.values(d || {}).flat().join(' ') || 'Create failed.'
  } finally {
    createLoading.value = false
  }
}

// ── Edit modal ────────────────────────────────────────────────────────────────

const editModal   = ref(false)
const editTarget  = ref(null)
const editLoading = ref(false)
const editError   = ref('')
const editForm    = ref({})
const editLogoPreview = ref(null)

function openEdit(pc) {
  editTarget.value = pc
  editForm.value   = {
    company_name:  pc.company_name,
    email:         pc.email,
    timezone:      pc.timezone || 'UTC',
    monthly_fee:   pc.monthly_fee ?? '0',
    max_sub_users: pc.max_sub_users ?? '',
    status:        pc.status,
    password:      '',
    logo:          null,
  }
  editLogoPreview.value = pc.logo_url || null
  editError.value       = ''
  editModal.value       = true
}

function handleEditLogoChange(e) {
  const file = e.target.files?.[0]
  if (!file) return
  editForm.value.logo = file
  editLogoPreview.value = URL.createObjectURL(file)
}

async function saveEdit() {
  editLoading.value = true
  editError.value   = ''
  try {
    const fd = new FormData()
    fd.append('company_name', editForm.value.company_name)
    fd.append('email',        editForm.value.email)
    fd.append('timezone',     editForm.value.timezone)
    fd.append('monthly_fee',  editForm.value.monthly_fee || '0')
    fd.append('status',       editForm.value.status)
    if (editForm.value.max_sub_users !== '')
      fd.append('max_sub_users', editForm.value.max_sub_users)
    if (editForm.value.password)
      fd.append('password', editForm.value.password)
    if (editForm.value.logo)
      fd.append('logo', editForm.value.logo)

    await superAdminApi.updatePrintCenter(editTarget.value.id, fd)
    success.value   = `${editForm.value.company_name} saved.`
    editModal.value = false
    load()
  } catch (e) {
    const d = e?.response?.data
    editError.value = d?.detail || Object.values(d || {}).flat().join(' ') || 'Save failed.'
  } finally {
    editLoading.value = false
  }
}

// ── Pricing tiers modal ───────────────────────────────────────────────────────

const tiersModal   = ref(false)
const tiersTarget  = ref(null)
const tiers        = ref([])
const tiersLoading = ref(false)
const tiersError   = ref('')
const newTier      = ref({ min_items: '', max_items: '', extra_fee: '' })

async function openTiers(pc) {
  tiersTarget.value  = pc
  tiersModal.value   = true
  tiersLoading.value = true
  tiersError.value   = ''
  newTier.value      = { min_items: '', max_items: '', extra_fee: '' }
  try {
    const { data } = await superAdminApi.pricingTiers(pc.id)
    tiers.value = data
  } catch {
    tiersError.value = 'Failed to load tiers.'
  } finally {
    tiersLoading.value = false
  }
}

async function addTier() {
  tiersError.value = ''
  try {
    const payload = {
      min_items: Number(newTier.value.min_items),
      max_items: newTier.value.max_items !== '' ? Number(newTier.value.max_items) : null,
      extra_fee: newTier.value.extra_fee,
    }
    const { data } = await superAdminApi.createPricingTier(tiersTarget.value.id, payload)
    tiers.value = [...tiers.value, data].sort((a, b) => a.min_items - b.min_items)
    newTier.value = { min_items: '', max_items: '', extra_fee: '' }
  } catch (e) {
    tiersError.value = e?.response?.data?.detail ?? 'Failed to add tier.'
  }
}

async function deleteTier(tier) {
  try {
    await superAdminApi.deletePricingTier(tiersTarget.value.id, tier.id)
    tiers.value = tiers.value.filter(t => t.id !== tier.id)
  } catch {
    tiersError.value = 'Failed to delete tier.'
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  pending:   'bg-amber-100 text-amber-800',
  active:    'bg-emerald-100 text-emerald-800',
  suspended: 'bg-red-100 text-red-700',
  rejected:  'bg-gray-100 text-gray-600',
}

const STATUS_OPTIONS = [
  { value: 'pending',   label: 'Pending' },
  { value: 'active',    label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'rejected',  label: 'Rejected' },
]
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Print Centers</h1>
      <button @click="openCreate" class="btn-primary text-sm">+ Create Print Center</button>
    </div>

    <!-- Feedback -->
    <div v-if="error"   class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex justify-between">
      {{ success }}<button @click="success=''" class="text-emerald-500 ml-4">✕</button>
    </div>

    <!-- Stat filter cards -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div v-for="(count, key) in counts" :key="key"
        class="card p-4 cursor-pointer transition hover:border-accent/50"
        :class="statusFilter === (key === 'all' ? '' : key) ? 'border-accent' : ''"
        @click="statusFilter = key === 'all' ? '' : key; load()">
        <div class="text-xs text-text-secondary capitalize">{{ key }}</div>
        <div class="text-3xl font-bold mt-1">{{ count }}</div>
      </div>
    </div>

    <!-- Loading skeletons -->
    <div v-if="loading" class="space-y-3">
      <div v-for="i in 4" :key="i" class="card p-4 h-20 animate-pulse bg-gray-100" />
    </div>

    <!-- Empty -->
    <div v-else-if="!printCenters.length" class="card p-10 text-center text-text-muted text-sm">
      No print centers found.
    </div>

    <!-- Table -->
    <div v-else class="card overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-sidebar-bg text-text-secondary text-xs">
          <tr>
            <th class="text-left px-4 py-3 w-10"></th><!-- eye icon -->
            <th class="text-left px-4 py-3">Company</th>
            <th class="text-left px-4 py-3">Email</th>
            <th class="text-left px-4 py-3">Status</th>
            <th class="text-right px-4 py-3">Clients</th>
            <th class="text-right px-4 py-3">Active Shops</th>
            <th class="text-right px-4 py-3">Awaiting</th>
            <th class="text-right px-4 py-3">Completed</th>
            <th class="text-left px-4 py-3">Registered</th>
            <th class="text-right px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="pc in printCenters" :key="pc.id"
            class="border-t border-card-border hover:bg-sidebar-bg/40 transition">

            <!-- Eye (impersonate) -->
            <td class="px-4 py-3">
              <button @click="impersonate(pc)"
                :disabled="impersonateLoading === pc.id"
                class="p-1.5 rounded-lg hover:bg-accent/10 text-text-muted hover:text-accent transition"
                title="View as this print center">
                <svg v-if="impersonateLoading !== pc.id" class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke-linecap="round"/>
                  <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" stroke-linecap="round"/>
                </svg>
                <span v-else class="text-xs">…</span>
              </button>
            </td>

            <td class="px-4 py-3 font-medium">
              <div class="flex items-center gap-2">
                <img v-if="pc.logo_url" :src="pc.logo_url" class="w-6 h-6 rounded object-cover" />
                {{ pc.company_name }}
              </div>
            </td>
            <td class="px-4 py-3 text-text-secondary">{{ pc.email }}</td>
            <td class="px-4 py-3">
              <span class="badge text-xs" :class="STATUS_BADGE[pc.status] ?? 'bg-gray-100'">{{ pc.status }}</span>
            </td>
            <td class="px-4 py-3 text-right text-text-secondary">{{ pc.sub_user_count }}</td>
            <td class="px-4 py-3 text-right text-blue-600">{{ pc.active_shop_count }}</td>
            <td class="px-4 py-3 text-right text-amber-600">{{ pc.awaiting_order_count }}</td>
            <td class="px-4 py-3 text-right text-emerald-600">{{ pc.completed_order_count }}</td>
            <td class="px-4 py-3 text-text-secondary text-xs">{{ pc.created_at?.slice(0, 10) }}</td>

            <td class="px-4 py-3">
              <div class="flex justify-end gap-1">
                <!-- Quick approve -->
                <button v-if="pc.status === 'pending'"
                  @click="setStatus(pc, 'active')" :disabled="actionLoading === pc.id"
                  class="btn-primary text-xs py-1 px-2">
                  {{ actionLoading === pc.id ? '…' : '✓ Approve' }}
                </button>
                <!-- Quick reject -->
                <button v-if="pc.status === 'pending'"
                  @click="setStatus(pc, 'rejected')" :disabled="actionLoading === pc.id"
                  class="btn-secondary text-xs py-1 px-2 text-red-600 hover:bg-red-50">Reject</button>
                <!-- Suspend -->
                <button v-if="pc.status === 'active'"
                  @click="setStatus(pc, 'suspended')" :disabled="actionLoading === pc.id"
                  class="btn-secondary text-xs py-1 px-2 text-amber-600 hover:bg-amber-50">
                  {{ actionLoading === pc.id ? '…' : 'Suspend' }}
                </button>
                <!-- Reactivate -->
                <button v-if="['suspended','rejected'].includes(pc.status)"
                  @click="setStatus(pc, 'active')" :disabled="actionLoading === pc.id"
                  class="btn-secondary text-xs py-1 px-2 text-emerald-600 hover:bg-emerald-50">
                  {{ actionLoading === pc.id ? '…' : 'Activate' }}
                </button>
                <!-- Tiers -->
                <button @click="openTiers(pc)"
                  class="btn-secondary text-xs py-1 px-2" title="Pricing tiers">$</button>
                <!-- Analytics -->
                <button @click="router.push({ name: 'pc-analytics', params: { id: pc.id } })"
                  class="btn-secondary text-xs py-1 px-2">Analytics</button>
                <!-- Edit -->
                <button @click="openEdit(pc)"
                  class="btn-secondary text-xs py-1 px-2">Edit</button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <!-- ── Create modal ──────────────────────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="createModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto"
      >
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 my-8">
        <h3 class="font-semibold text-lg">Create Print Center</h3>

        <div v-if="createError" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {{ createError }}
        </div>

        <div class="space-y-3">
          <!-- Logo upload -->
          <div class="flex items-center gap-4">
            <div class="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
              <img v-if="logoPreview" :src="logoPreview" class="w-full h-full object-cover" />
              <span v-else class="text-2xl text-gray-400">🖼</span>
            </div>
            <div>
              <label class="text-xs text-text-secondary block mb-1">Logo (optional)</label>
              <input type="file" accept="image/*" @change="handleLogoChange" class="text-xs" />
            </div>
          </div>

          <div>
            <label class="text-xs text-text-secondary block mb-1">Company Name *</label>
            <input v-model="createForm.company_name" type="text"
              class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-text-secondary block mb-1">Email *</label>
              <input v-model="createForm.email" type="email"
                class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label class="text-xs text-text-secondary block mb-1">Password *</label>
              <input v-model="createForm.password" type="password"
                class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label class="text-xs text-text-secondary block mb-1">Full Name</label>
            <input v-model="createForm.full_name" type="text"
              class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-text-secondary block mb-1">Monthly Fee ($)</label>
              <input v-model="createForm.monthly_fee" type="number" min="0" step="0.01"
                class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label class="text-xs text-text-secondary block mb-1">Max Sub-Users (blank = unlimited)</label>
              <input v-model="createForm.max_sub_users" type="number" min="1"
                placeholder="Unlimited"
                class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label class="text-xs text-text-secondary block mb-1">Timezone</label>
            <select v-model="createForm.timezone"
              class="w-full rounded-lg border border-card-border px-3 py-2 text-sm">
              <option v-for="tz in TIMEZONES" :key="tz" :value="tz">{{ tz }}</option>
            </select>
          </div>
        </div>

        <div class="flex gap-3 pt-1">
          <button @click="createModal = false" class="btn-secondary flex-1 text-sm">Cancel</button>
          <button @click="saveCreate" :disabled="createLoading" class="btn-primary flex-1 text-sm">
            {{ createLoading ? 'Creating…' : 'Create' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ── Edit modal ────────────────────────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="editModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto"
      >
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 my-8">
        <h3 class="font-semibold text-lg">Edit Print Center</h3>
        <div class="text-sm text-text-secondary">{{ editTarget?.email }}</div>

        <div v-if="editError" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {{ editError }}
        </div>

        <div class="space-y-3">
          <!-- Logo -->
          <div class="flex items-center gap-4">
            <div class="w-16 h-16 rounded-xl bg-gray-100 flex items-center justify-center overflow-hidden shrink-0">
              <img v-if="editLogoPreview" :src="editLogoPreview" class="w-full h-full object-cover" />
              <span v-else class="text-2xl text-gray-400">🖼</span>
            </div>
            <div>
              <label class="text-xs text-text-secondary block mb-1">Logo</label>
              <input type="file" accept="image/*" @change="handleEditLogoChange" class="text-xs" />
            </div>
          </div>

          <div>
            <label class="text-xs text-text-secondary block mb-1">Company Name</label>
            <input v-model="editForm.company_name" type="text"
              class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-text-secondary block mb-1">Email</label>
              <input v-model="editForm.email" type="email"
                class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label class="text-xs text-text-secondary block mb-1">New Password (blank = unchanged)</label>
              <input v-model="editForm.password" type="password" placeholder="Leave blank to keep"
                class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label class="text-xs text-text-secondary block mb-1">Status</label>
            <select v-model="editForm.status"
              class="w-full rounded-lg border border-card-border px-3 py-2 text-sm">
              <option v-for="s in STATUS_OPTIONS" :key="s.value" :value="s.value">{{ s.label }}</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-text-secondary block mb-1">Monthly Fee ($)</label>
              <input v-model="editForm.monthly_fee" type="number" min="0" step="0.01"
                class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label class="text-xs text-text-secondary block mb-1">Max Sub-Users</label>
              <input v-model="editForm.max_sub_users" type="number" min="1" placeholder="Unlimited"
                class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label class="text-xs text-text-secondary block mb-1">Timezone</label>
            <select v-model="editForm.timezone"
              class="w-full rounded-lg border border-card-border px-3 py-2 text-sm">
              <option v-for="tz in TIMEZONES" :key="tz" :value="tz">{{ tz }}</option>
            </select>
          </div>
        </div>

        <div class="flex gap-3 pt-1">
          <button @click="editModal = false" class="btn-secondary flex-1 text-sm">Cancel</button>
          <button @click="saveEdit" :disabled="editLoading" class="btn-primary flex-1 text-sm">
            {{ editLoading ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ── Pricing Tiers modal ───────────────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="tiersModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      >
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-lg">Pricing Tiers</h3>
          <div class="text-sm text-text-secondary">{{ tiersTarget?.company_name }}</div>
        </div>
        <p class="text-xs text-text-muted">
          Base monthly fee: <strong>${{ tiersTarget?.monthly_fee }}</strong>.
          These tiers add extra fees based on processed items per month.
        </p>

        <div v-if="tiersError" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {{ tiersError }}
        </div>

        <!-- Existing tiers -->
        <div v-if="tiersLoading" class="text-center text-text-muted text-sm py-4">Loading…</div>
        <div v-else-if="!tiers.length" class="text-center text-text-muted text-sm py-2">No tiers defined.</div>
        <table v-else class="w-full text-sm">
          <thead class="text-xs text-text-secondary border-b border-card-border">
            <tr>
              <th class="text-left py-2">Min Items</th>
              <th class="text-left py-2">Max Items</th>
              <th class="text-left py-2">Extra Fee</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tier in tiers" :key="tier.id" class="border-b border-card-border">
              <td class="py-2">{{ tier.min_items.toLocaleString() }}</td>
              <td class="py-2">{{ tier.max_items ? tier.max_items.toLocaleString() : '∞' }}</td>
              <td class="py-2 font-semibold text-accent-dark">+${{ tier.extra_fee }}</td>
              <td class="py-2 text-right">
                <button @click="deleteTier(tier)" class="text-red-500 hover:text-red-700 text-xs">✕</button>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- Add new tier -->
        <div class="border-t border-card-border pt-4">
          <div class="text-xs font-medium text-text-secondary mb-2">Add Tier</div>
          <div class="grid grid-cols-3 gap-2">
            <div>
              <label class="text-xs text-text-muted block mb-1">Min Items</label>
              <input v-model="newTier.min_items" type="number" min="0" placeholder="0"
                class="w-full rounded-lg border border-card-border px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label class="text-xs text-text-muted block mb-1">Max Items (blank=∞)</label>
              <input v-model="newTier.max_items" type="number" min="1" placeholder="∞"
                class="w-full rounded-lg border border-card-border px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label class="text-xs text-text-muted block mb-1">Extra Fee ($)</label>
              <input v-model="newTier.extra_fee" type="number" min="0" step="0.01" placeholder="20"
                class="w-full rounded-lg border border-card-border px-2 py-1.5 text-sm" />
            </div>
          </div>
          <button @click="addTier" class="btn-primary text-xs mt-3 py-1.5 px-4">+ Add Tier</button>
        </div>

        <div class="flex justify-end pt-1">
          <button @click="tiersModal = false" class="btn-secondary text-sm">Close</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
