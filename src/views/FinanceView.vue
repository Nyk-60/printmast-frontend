<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { financeApi } from '@/api/endpoints'

// ── State ─────────────────────────────────────────────────────────────────────

const summary = ref(null)
const transactions = ref([])
const loading = ref(true)
const txLoading = ref(false)
const error = ref('')

const filters = reactive({ from: '', to: '', type: '', page: 1, page_size: 50 })
const pagination = reactive({ count: 0, page: 1, page_size: 50 })

const TYPE_LABELS = { credit: 'Credit', debit: 'Debit', refund: 'Refund' }

// ── Data fetching ─────────────────────────────────────────────────────────────

async function loadSummary() {
  try {
    const { data } = await financeApi.mySummary()
    summary.value = data
  } catch {
    error.value = 'Failed to load balance summary.'
  }
}

async function loadTransactions() {
  txLoading.value = true
  try {
    const params = {}
    if (filters.from) params.from = filters.from
    if (filters.to)   params.to   = filters.to
    if (filters.type) params.type = filters.type
    params.page      = filters.page
    params.page_size = filters.page_size

    const { data } = await financeApi.myTransactions(params)
    transactions.value     = data.results
    pagination.count       = data.count
    pagination.page        = data.page
    pagination.page_size   = data.page_size
  } catch {
    error.value = 'Failed to load transactions.'
  } finally {
    txLoading.value = false
  }
}

onMounted(async () => {
  loading.value = true
  await Promise.all([loadSummary(), loadTransactions()])
  loading.value = false
})

// ── Filters ───────────────────────────────────────────────────────────────────

function applyFilters() {
  filters.page = 1
  loadTransactions()
}

function resetFilters() {
  filters.from = ''
  filters.to   = ''
  filters.type = ''
  filters.page = 1
  loadTransactions()
}

// ── Pagination ────────────────────────────────────────────────────────────────

const totalPages = () => Math.ceil(pagination.count / pagination.page_size)

function goPage(p) {
  if (p < 1 || p > totalPages()) return
  filters.page = p
  loadTransactions()
}

// ── Export ────────────────────────────────────────────────────────────────────

async function download(fmt) {
  try {
    const params = { format: fmt }
    if (filters.from) params.from = filters.from
    if (filters.to)   params.to   = filters.to
    const { data, headers } = await financeApi.myDownload(params)
    const ext  = fmt === 'xlsx' ? 'xlsx' : 'csv'
    const mime = fmt === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv'
    const url  = URL.createObjectURL(new Blob([data], { type: mime }))
    const a    = document.createElement('a')
    a.href     = url
    a.download = `transactions.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    error.value = 'Download failed. Please try again.'
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAmount(type, amount) {
  const sign = type === 'credit' || type === 'refund' ? '+' : '-'
  return `${sign}$${Number(amount).toFixed(2)}`
}

function amountClass(type) {
  if (type === 'credit' || type === 'refund') return 'text-emerald-600 font-medium'
  return 'text-red-600 font-medium'
}

function typeBadgeClass(type) {
  if (type === 'credit')  return 'bg-emerald-100 text-emerald-800'
  if (type === 'refund')  return 'bg-blue-100 text-blue-800'
  return 'bg-red-100 text-red-700'
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Finance</h1>
      <div class="flex gap-2">
        <button @click="download('csv')"  class="btn-secondary text-sm">↓ CSV</button>
        <button @click="download('xlsx')" class="btn-secondary text-sm">↓ Excel</button>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </div>

    <!-- Summary cards -->
    <div v-if="loading" class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div v-for="i in 4" :key="i" class="card p-5 animate-pulse h-24 bg-gray-100" />
    </div>

    <div v-else-if="summary" class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="card p-5 md:col-span-1">
        <div class="text-xs text-text-secondary">Current Balance</div>
        <div class="text-3xl font-extrabold text-accent-dark mt-1">
          ${{ Number(summary.current_balance).toFixed(2) }}
        </div>
      </div>
      <div class="card p-5">
        <div class="text-xs text-text-secondary">Total Credited</div>
        <div class="text-2xl font-bold text-emerald-600 mt-1">
          +${{ Number(summary.total_credited).toFixed(2) }}
        </div>
      </div>
      <div class="card p-5">
        <div class="text-xs text-text-secondary">Total Debited</div>
        <div class="text-2xl font-bold text-red-600 mt-1">
          -${{ Number(summary.total_debited).toFixed(2) }}
        </div>
      </div>
      <div class="card p-5">
        <div class="text-xs text-text-secondary">This Month Spent</div>
        <div class="text-2xl font-bold text-red-500 mt-1">
          -${{ Number(summary.this_month_debited).toFixed(2) }}
        </div>
        <div class="text-xs text-text-muted mt-1">
          +${{ Number(summary.this_month_credited).toFixed(2) }} added
        </div>
      </div>
    </div>

    <!-- Filters -->
    <div class="card p-4 flex flex-wrap gap-3 items-end">
      <div>
        <label class="text-xs text-text-secondary block mb-1">From</label>
        <input v-model="filters.from" type="date"
          class="rounded-lg border border-card-border px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="text-xs text-text-secondary block mb-1">To</label>
        <input v-model="filters.to" type="date"
          class="rounded-lg border border-card-border px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="text-xs text-text-secondary block mb-1">Type</label>
        <select v-model="filters.type" class="rounded-lg border border-card-border px-3 py-2 text-sm">
          <option value="">All Types</option>
          <option value="credit">Credit</option>
          <option value="debit">Debit</option>
          <option value="refund">Refund</option>
        </select>
      </div>
      <button @click="applyFilters" class="btn-primary text-sm">Apply</button>
      <button @click="resetFilters" class="btn-secondary text-sm">Reset</button>
    </div>

    <!-- Transaction table -->
    <div class="card overflow-hidden">
      <div class="flex items-center justify-between px-5 py-3 border-b border-card-border">
        <h3 class="font-semibold">Transactions</h3>
        <span class="text-xs text-text-secondary">{{ pagination.count }} total</span>
      </div>

      <div v-if="txLoading" class="px-5 py-10 text-center text-text-secondary text-sm">
        Loading…
      </div>

      <div v-else-if="!transactions.length" class="px-5 py-10 text-center text-text-secondary text-sm">
        No transactions found.
      </div>

      <table v-else class="w-full text-sm">
        <thead class="bg-sidebar-bg text-text-secondary text-xs">
          <tr>
            <th class="text-left px-5 py-2">Date</th>
            <th class="text-left px-5 py-2">Type</th>
            <th class="text-left px-5 py-2">Description</th>
            <th class="text-left px-5 py-2">Order Ref</th>
            <th class="text-right px-5 py-2">Amount</th>
            <th class="text-right px-5 py-2">Shipping</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tx in transactions" :key="tx.id"
            class="border-t border-card-border hover:bg-sidebar-bg/50 transition">
            <td class="px-5 py-2 text-text-secondary">
              {{ tx.created_at?.slice(0, 10) }}
            </td>
            <td class="px-5 py-2">
              <span class="badge text-xs" :class="typeBadgeClass(tx.type)">
                {{ TYPE_LABELS[tx.type] ?? tx.type }}
              </span>
            </td>
            <td class="px-5 py-2 text-text-secondary max-w-xs truncate">{{ tx.description }}</td>
            <td class="px-5 py-2 text-text-secondary font-mono text-xs">{{ tx.order_reference }}</td>
            <td class="px-5 py-2 text-right" :class="amountClass(tx.type)">
              {{ fmtAmount(tx.type, tx.amount) }}
            </td>
            <td class="px-5 py-2 text-right text-text-secondary">
              ${{ Number(tx.shipping_amount).toFixed(2) }}
            </td>
          </tr>
        </tbody>
      </table>

      <!-- Pagination -->
      <div v-if="totalPages() > 1"
        class="flex items-center justify-between px-5 py-3 border-t border-card-border text-sm">
        <span class="text-text-secondary">
          Page {{ pagination.page }} of {{ totalPages() }}
        </span>
        <div class="flex gap-1">
          <button @click="goPage(pagination.page - 1)" :disabled="pagination.page === 1"
            class="px-3 py-1 rounded border border-card-border disabled:opacity-40 hover:bg-sidebar-bg transition text-xs">
            ‹ Prev
          </button>
          <button @click="goPage(pagination.page + 1)" :disabled="pagination.page >= totalPages()"
            class="px-3 py-1 rounded border border-card-border disabled:opacity-40 hover:bg-sidebar-bg transition text-xs">
            Next ›
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
