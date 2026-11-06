<script setup>
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { financeApi } from '@/api/endpoints'
import { usePeriodFilter } from './usePeriodFilter'
import PeriodFilterControl from './PeriodFilterControl.vue'
import ColumnFilterDropdown from './ColumnFilterDropdown.vue'

const route = useRoute()
const filter = usePeriodFilter()
const orderNoSearch = ref('')

// Deep-link from an Invoice card's "View in Balance History" button —
// ?year=&month= pre-selects that invoice's period.
if (route.query.year && route.query.month) {
  filter.mode.value = 'month'
  filter.year.value = Number(route.query.year)
  filter.month.value = Number(route.query.month)
}

const summary = ref(null)
const transactions = ref([])
const loading = ref(true)
const txLoading = ref(false)
const error = ref('')

const pagination = reactive({ count: 0, page: 1, page_size: 50 })

// ── Excel-style column filters ───────────────────────────────────────────
const filterOptions = ref({ shops: [], types: [], items: [], explanations: [], pc_dates: [], user_dates: [] })
const selectedShops = ref([])
const selectedTypes = ref([])
const selectedItems = ref([])        // each entry is a JSON-stringified {product_name,size,color}
const selectedExplanations = ref([])
const selectedPcDates = ref([])
const selectedUserDates = ref([])

const shopOptions = computed(() => filterOptions.value.shops.map((s) => ({ key: s, label: s })))
const typeOptions = computed(() => filterOptions.value.types.map((t) => ({ key: t.code, label: t.label })))
const itemOptions = computed(() => filterOptions.value.items.map((it) => ({ key: JSON.stringify(it.value), label: it.label })))
const explanationOptions = computed(() => filterOptions.value.explanations.map((e) => ({ key: e, label: e })))
const pcDateOptions = computed(() => filterOptions.value.pc_dates.map((d) => ({ key: d, label: d })))
const userDateOptions = computed(() => filterOptions.value.user_dates.map((d) => ({ key: d, label: d })))

function buildFilterParams() {
  const params = {}
  if (orderNoSearch.value) params.order_no = orderNoSearch.value
  if (selectedShops.value.length) params.shop_in = selectedShops.value.join(',')
  if (selectedTypes.value.length) params.type_in = selectedTypes.value.join(',')
  if (selectedItems.value.length) params.item_in = JSON.stringify(selectedItems.value.map((k) => JSON.parse(k)))
  if (selectedExplanations.value.length) params.explanation_in = JSON.stringify(selectedExplanations.value)
  if (selectedPcDates.value.length) params.pc_date_in = selectedPcDates.value.join(',')
  if (selectedUserDates.value.length) params.user_date_in = selectedUserDates.value.join(',')
  return params
}

async function loadFilterOptions() {
  try {
    const { data } = await financeApi.myFilterOptions({ from: filter.from.value, to: filter.to.value })
    filterOptions.value = data
  } catch {
    // leave previous options in place — not fatal
  }
}

async function loadSummary() {
  try {
    const { data } = await financeApi.mySummary({ from: filter.from.value, to: filter.to.value })
    summary.value = data
  } catch {
    error.value = 'Failed to load balance summary.'
  }
}

// The "spent this period" tile's heading follows whatever period is selected
// (a specific month, or a custom range) — it used to say "This Month" even
// while browsing a different month, which was misleading.
const periodLabel = computed(() => {
  if (filter.mode.value === 'month') {
    const m = filter.months.find((mo) => mo.value === filter.month.value)
    return m ? `${m.label} ${filter.year.value}` : 'Period'
  }
  return 'Period'
})

async function loadTransactions() {
  txLoading.value = true
  try {
    const { data } = await financeApi.myTransactions({
      from: filter.from.value, to: filter.to.value,
      page: pagination.page, page_size: pagination.page_size,
      ...buildFilterParams(),
    })
    transactions.value = data.results
    pagination.count = data.count
    pagination.page = data.page
    pagination.page_size = data.page_size
  } catch {
    error.value = 'Failed to load transactions.'
  } finally {
    txLoading.value = false
  }
}

// The server now computes a real running Balance per row (anchored to the
// account's true current balance, see apps/payments/views.py _balance_seed),
// so we just read tx.balance_after rather than approximating client-side.
// Row striping mirrors the Excel export: one green/white stripe per Order No
// (rows with no order never group with each other), orange for an anomaly
// row (a refund/credit, or a $0 PC-covered reship).
const rowsWithMeta = computed(() => {
  let stripeGreen = true
  let lastGroupKey = Symbol('start')
  return transactions.value.map((tx) => {
    const signedAmount = tx.type === 'debit' ? -Number(tx.amount) : Number(tx.amount)
    const isAnomaly = tx.type === 'refund' || Number(tx.amount) === 0
    let rowClass
    if (isAnomaly) {
      rowClass = 'bg-orange-50'
    } else {
      const groupKey = tx.order_number || Symbol('single')
      if (groupKey !== lastGroupKey) stripeGreen = !stripeGreen
      lastGroupKey = groupKey
      rowClass = stripeGreen ? 'bg-emerald-50/50' : 'bg-white'
    }
    return { ...tx, signedAmount, rowClass }
  })
})

function itemCell(tx) {
  return [tx.product_name, tx.size, tx.color].filter(Boolean).join(' - ')
}

function typeBadgeClass(tx) {
  if (tx.type === 'credit')  return 'bg-emerald-100 text-emerald-800'
  if (tx.type === 'refund')  return 'bg-blue-100 text-blue-800'
  return 'bg-red-100 text-red-700'
}

async function download(fmt) {
  try {
    const { data } = await financeApi.myDownload({
      format: fmt, report: 'balance', from: filter.from.value, to: filter.to.value,
      ...buildFilterParams(),
    })
    const ext  = fmt === 'xlsx' ? 'xlsx' : 'csv'
    const mime = fmt === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv'
    const url  = URL.createObjectURL(new Blob([data], { type: mime }))
    const a    = document.createElement('a')
    a.href     = url
    a.download = `balance_history.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    error.value = 'Download failed. Please try again.'
  }
}

function goPage(p) {
  const totalPages = Math.ceil(pagination.count / pagination.page_size)
  if (p < 1 || p > totalPages) return
  pagination.page = p
  loadTransactions()
}

let orderNoDebounce = null
watch(orderNoSearch, () => {
  clearTimeout(orderNoDebounce)
  orderNoDebounce = setTimeout(() => {
    pagination.page = 1
    loadTransactions()
  }, 400)
})

watch([selectedShops, selectedTypes, selectedItems, selectedExplanations, selectedPcDates, selectedUserDates], () => {
  pagination.page = 1
  loadTransactions()
})

watch([() => filter.from.value, () => filter.to.value], () => {
  pagination.page = 1
  loadSummary()
  loadFilterOptions()
  loadTransactions()
})

onMounted(async () => {
  loading.value = true
  await Promise.all([loadFilterOptions(), loadSummary(), loadTransactions()])
  loading.value = false
})
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </div>

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
        <div class="text-xs text-text-secondary">{{ periodLabel }} Spent</div>
        <div class="text-2xl font-bold text-red-500 mt-1">
          -${{ Number(summary.this_month_debited).toFixed(2) }}
        </div>
        <div class="text-xs text-text-muted mt-1">
          +${{ Number(summary.this_month_credited).toFixed(2) }} added
        </div>
      </div>
    </div>

    <PeriodFilterControl :filter="filter">
      <div>
        <label class="text-xs text-text-secondary block mb-1">Order No</label>
        <div class="relative">
          <input v-model="orderNoSearch" type="text" placeholder="Search order no…"
            class="rounded-lg border border-card-border pl-3 pr-7 py-2 text-sm w-36" />
          <button v-if="orderNoSearch" type="button" @click="orderNoSearch = ''"
            class="absolute right-1.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary w-4 h-4 flex items-center justify-center">
            ✕
          </button>
        </div>
      </div>
      <button @click="download('csv')"  class="btn-secondary text-sm">↓ CSV</button>
      <button @click="download('xlsx')" class="btn-secondary text-sm">↓ Excel</button>
    </PeriodFilterControl>

    <div class="card overflow-hidden">
      <div class="flex items-center justify-between px-5 py-3 border-b border-card-border">
        <h3 class="font-semibold">Transactions</h3>
        <span class="text-xs text-text-secondary">{{ pagination.count }} total</span>
      </div>

      <div v-if="txLoading" class="px-5 py-10 text-center text-text-secondary text-sm">Loading…</div>
      <div v-else-if="!transactions.length" class="px-5 py-10 text-center text-text-secondary text-sm">
        No transactions found.
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead class="bg-sidebar-bg text-text-secondary">
            <tr>
              <th class="text-left px-3 py-2 whitespace-nowrap">Transaction ID</th>
              <th class="text-left px-3 py-2 whitespace-nowrap">User</th>
              <th class="text-left px-3 py-2 whitespace-nowrap">
                PC Local Time
                <ColumnFilterDropdown :options="pcDateOptions" v-model="selectedPcDates" />
              </th>
              <th class="text-left px-3 py-2 whitespace-nowrap">
                User Local Time
                <ColumnFilterDropdown :options="userDateOptions" v-model="selectedUserDates" />
              </th>
              <th class="text-left px-3 py-2 whitespace-nowrap">
                Shop
                <ColumnFilterDropdown :options="shopOptions" v-model="selectedShops" />
              </th>
              <th class="text-left px-3 py-2 whitespace-nowrap">Order No</th>
              <th class="text-left px-3 py-2 whitespace-nowrap">
                Type
                <ColumnFilterDropdown :options="typeOptions" v-model="selectedTypes" />
              </th>
              <th class="text-left px-3 py-2">
                Item
                <ColumnFilterDropdown :options="itemOptions" v-model="selectedItems" />
              </th>
              <th class="text-right px-3 py-2 whitespace-nowrap">Amount</th>
              <th class="text-right px-3 py-2 whitespace-nowrap">Balance</th>
              <th class="text-left px-3 py-2">
                Explanations
                <ColumnFilterDropdown :options="explanationOptions" v-model="selectedExplanations" />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="tx in rowsWithMeta" :key="tx.id"
              class="border-t border-card-border hover:brightness-95 transition" :class="tx.rowClass">
              <td class="px-3 py-2 font-mono text-text-secondary whitespace-nowrap">{{ tx.display_id }}</td>
              <td class="px-3 py-2 text-text-secondary whitespace-nowrap">{{ tx.user_label }}</td>
              <td class="px-3 py-2 text-text-secondary whitespace-nowrap">{{ tx.pc_local_time }}</td>
              <td class="px-3 py-2 text-text-secondary whitespace-nowrap">{{ tx.user_local_time }}</td>
              <td class="px-3 py-2 text-text-secondary whitespace-nowrap">{{ tx.shop }}</td>
              <td class="px-3 py-2 text-text-secondary font-mono whitespace-nowrap">{{ tx.order_number }}</td>
              <td class="px-3 py-2 whitespace-nowrap">
                <span class="badge text-xs" :class="typeBadgeClass(tx)">{{ tx.category_display || tx.type }}</span>
              </td>
              <td class="px-3 py-2 text-text-secondary">{{ itemCell(tx) }}</td>
              <td class="px-3 py-2 text-right font-semibold whitespace-nowrap"
                :class="tx.signedAmount < 0 ? 'text-red-600' : 'text-emerald-600'">
                {{ tx.signedAmount >= 0 ? '+' : '' }}${{ tx.signedAmount.toFixed(2) }}
              </td>
              <td class="px-3 py-2 text-right font-mono whitespace-nowrap text-text-secondary">
                {{ tx.balance_after != null ? `$${Number(tx.balance_after).toFixed(2)}` : '—' }}
              </td>
              <td class="px-3 py-2 text-text-secondary max-w-[220px] truncate" :title="tx.description">
                {{ tx.description }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="Math.ceil(pagination.count / pagination.page_size) > 1"
        class="flex items-center justify-between px-5 py-3 border-t border-card-border text-sm">
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
  </div>
</template>
