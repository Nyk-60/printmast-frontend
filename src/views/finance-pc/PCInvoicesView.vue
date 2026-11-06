<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { financeApi, subUsersApi } from '@/api/endpoints'
import { usePeriodFilter } from '../finance/usePeriodFilter'
import InvoiceCard from '../finance/InvoiceCard.vue'
import InvoiceDetailModal from '../finance/InvoiceDetailModal.vue'

const router = useRouter()

// Invoices are strictly monthly records — only Year+Month from the shared
// filter are used, no range mode.
const filter = usePeriodFilter()
const anyPeriod = ref(true) // when true, ignore the year/month filter (show all periods)

const subUsers  = ref([])
const subUserId = ref('') // '' = all sub-users
const statusFilter = ref('') // '' = any status

const invoices = ref([])
const loading = ref(false)
const error = ref('')
const success = ref('')
const pagination = reactive({ count: 0, page: 1, page_size: 24 })

const selected = ref(null)
const acting = ref(false)

async function loadSubUsers() {
  try {
    const { data } = await subUsersApi.list()
    subUsers.value = data.results ?? data
  } catch {
    subUsers.value = []
  }
}

async function loadInvoices() {
  loading.value = true
  try {
    const params = {
      sub_user: subUserId.value || undefined,
      status: statusFilter.value || undefined,
      page: pagination.page, page_size: pagination.page_size,
    }
    if (!anyPeriod.value) {
      params.year = filter.year.value
      params.month = filter.month.value
    }
    const { data } = await financeApi.pcSubUserInvoices(params)
    invoices.value = data.results ?? data
    pagination.count = data.count ?? invoices.value.length
  } catch {
    error.value = 'Failed to load sub-user invoices.'
  } finally {
    loading.value = false
  }
}

function openInvoice(inv) {
  selected.value = inv
}

async function markPaid(note) {
  const inv = selected.value
  acting.value = true
  try {
    const { data } = await financeApi.updateSubUserInvoice(inv.sub_user, inv.id, { status: 'paid', note })
    success.value = `Marked ${inv.sub_user_name || inv.sub_user_email}'s ${inv.period_month}/${inv.period_year} invoice as paid.`
    selected.value = data
    await loadInvoices()
  } catch {
    error.value = 'Failed to mark invoice as paid.'
  } finally {
    acting.value = false
  }
}

async function revert() {
  const inv = selected.value
  acting.value = true
  try {
    const { data } = await financeApi.updateSubUserInvoice(inv.sub_user, inv.id, { status: 'pending' })
    success.value = `Reverted ${inv.sub_user_name || inv.sub_user_email}'s ${inv.period_month}/${inv.period_year} invoice to unpaid.`
    selected.value = data
    await loadInvoices()
  } catch {
    error.value = 'Failed to revert invoice.'
  } finally {
    acting.value = false
  }
}

function viewInBalanceHistory() {
  const inv = selected.value
  router.push({
    name: 'pc-finance-balance-history',
    query: { year: inv.period_year, month: inv.period_month, sub_user: inv.sub_user },
  })
}

function goPage(p) {
  const totalPages = Math.ceil(pagination.count / pagination.page_size)
  if (p < 1 || p > totalPages) return
  pagination.page = p
  loadInvoices()
}

watch([() => filter.year.value, () => filter.month.value, anyPeriod, subUserId, statusFilter], () => {
  pagination.page = 1
  loadInvoices()
})

onMounted(() => {
  loadSubUsers()
  loadInvoices()
})
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex justify-between">
      {{ error }}
      <button @click="error = ''" class="text-red-500">✕</button>
    </div>
    <div v-if="success" class="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex justify-between">
      {{ success }}
      <button @click="success = ''" class="text-emerald-500">✕</button>
    </div>

    <!-- Filters -->
    <div class="card p-4 flex flex-wrap items-end gap-4">
      <div>
        <label class="text-xs text-text-secondary block mb-1">Period</label>
        <div class="flex gap-1 bg-sidebar-bg rounded-lg p-1">
          <button type="button" @click="anyPeriod = false"
            :class="!anyPeriod ? 'bg-white shadow text-accent-dark' : 'text-text-secondary'"
            class="px-3 py-1.5 rounded-md text-xs font-semibold transition">Month</button>
          <button type="button" @click="anyPeriod = true"
            :class="anyPeriod ? 'bg-white shadow text-accent-dark' : 'text-text-secondary'"
            class="px-3 py-1.5 rounded-md text-xs font-semibold transition">All</button>
        </div>
      </div>
      <template v-if="!anyPeriod">
        <div>
          <label class="text-xs text-text-secondary block mb-1">Year</label>
          <select v-model="filter.year.value" class="rounded-lg border border-card-border px-3 py-2 text-sm">
            <option v-for="y in filter.years.value" :key="y" :value="y">{{ y }}</option>
          </select>
        </div>
        <div>
          <label class="text-xs text-text-secondary block mb-1">Month</label>
          <select v-model="filter.month.value" class="rounded-lg border border-card-border px-3 py-2 text-sm">
            <option v-for="m in filter.months" :key="m.value" :value="m.value">{{ m.label }}</option>
          </select>
        </div>
      </template>
      <div>
        <label class="text-xs text-text-secondary block mb-1">Sub-User</label>
        <select v-model="subUserId" class="rounded-lg border border-card-border px-3 py-2 text-sm">
          <option value="">All Sub-Users</option>
          <option v-for="su in subUsers" :key="su.id" :value="su.id">{{ su.full_name || su.email }}</option>
        </select>
      </div>
      <div>
        <label class="text-xs text-text-secondary block mb-1">Status</label>
        <select v-model="statusFilter" class="rounded-lg border border-card-border px-3 py-2 text-sm">
          <option value="">Any</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
          <option value="paid">Paid</option>
        </select>
      </div>
    </div>

    <!-- Invoice cards -->
    <div>
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold">Sub-User Invoices</h3>
        <span class="text-xs text-text-secondary">{{ pagination.count }} total</span>
      </div>

      <div v-if="loading" class="px-5 py-10 text-center text-text-secondary text-sm">Loading…</div>
      <div v-else-if="!invoices.length" class="px-5 py-10 text-center text-text-secondary text-sm">
        No invoices found.
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <InvoiceCard v-for="inv in invoices" :key="inv.id" :invoice="inv" show-sub-user @click="openInvoice(inv)" />
      </div>

      <div v-if="Math.ceil(pagination.count / pagination.page_size) > 1"
        class="flex items-center justify-between mt-4 text-sm">
        <span class="text-text-secondary">
          Page {{ pagination.page }} of {{ Math.ceil(pagination.count / pagination.page_size) }}
        </span>
        <div class="flex gap-1">
          <button @click="goPage(pagination.page - 1)" :disabled="pagination.page === 1"
            class="px-3 py-1 rounded border border-card-border disabled:opacity-40 hover:bg-sidebar-bg transition text-xs">
            ‹ Prev
          </button>
          <button @click="goPage(pagination.page + 1)"
            :disabled="pagination.page >= Math.ceil(pagination.count / pagination.page_size)"
            class="px-3 py-1 rounded border border-card-border disabled:opacity-40 hover:bg-sidebar-bg transition text-xs">
            Next ›
          </button>
        </div>
      </div>
    </div>

    <InvoiceDetailModal :invoice="selected" can-manage :acting="acting"
      @close="selected = null" @mark-paid="markPaid" @revert="revert"
      @view-balance-history="viewInBalanceHistory" />
  </div>
</template>
