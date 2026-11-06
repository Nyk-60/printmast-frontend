<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { financeApi } from '@/api/endpoints'
import InvoiceCard from './InvoiceCard.vue'
import InvoiceDetailModal from './InvoiceDetailModal.vue'

const router = useRouter()

const statusFilter = ref('') // '' = any status
const invoices = ref([])
const loading = ref(false)
const error = ref('')
const pagination = reactive({ count: 0, page: 1, page_size: 24 })

const selected = ref(null)
const unpaidCount = ref(0)

async function loadInvoices() {
  loading.value = true
  try {
    const { data } = await financeApi.myInvoices({
      status: statusFilter.value || undefined,
      page: pagination.page, page_size: pagination.page_size,
    })
    invoices.value = data.results ?? data
    pagination.count = data.count ?? invoices.value.length
  } catch {
    error.value = 'Failed to load invoices.'
  } finally {
    loading.value = false
  }
}

async function loadUnpaidCount() {
  try {
    const { data } = await financeApi.myInvoices()
    const all = data.results || data || []
    unpaidCount.value = all.filter((i) => i.status === 'pending' || i.status === 'overdue').length
  } catch {
    unpaidCount.value = 0
  }
}

function openInvoice(inv) {
  selected.value = inv
}

function viewInBalanceHistory() {
  const inv = selected.value
  router.push({
    name: 'finance-balance-history',
    query: { year: inv.period_year, month: inv.period_month },
  })
}

function goPage(p) {
  const totalPages = Math.ceil(pagination.count / pagination.page_size)
  if (p < 1 || p > totalPages) return
  pagination.page = p
  loadInvoices()
}

watch(statusFilter, () => {
  pagination.page = 1
  loadInvoices()
})

onMounted(() => {
  loadInvoices()
  loadUnpaidCount()
})
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </div>

    <!-- Unpaid banner -->
    <div v-if="unpaidCount"
      class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      You have <strong>{{ unpaidCount }}</strong> unpaid invoice(s).
    </div>
    <div v-else class="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
      No unpaid invoices.
    </div>

    <!-- Filter -->
    <div class="card p-4 flex flex-wrap items-end gap-4">
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
        <h3 class="font-semibold">Invoices</h3>
        <span class="text-xs text-text-secondary">{{ pagination.count }} total</span>
      </div>

      <div v-if="loading" class="px-5 py-10 text-center text-text-secondary text-sm">Loading…</div>
      <div v-else-if="!invoices.length" class="px-5 py-10 text-center text-text-secondary text-sm">
        No invoices found.
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <InvoiceCard v-for="inv in invoices" :key="inv.id" :invoice="inv" @click="openInvoice(inv)" />
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

    <InvoiceDetailModal :invoice="selected" @close="selected = null" @view-balance-history="viewInBalanceHistory" />
  </div>
</template>
