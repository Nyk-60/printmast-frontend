<script setup>
import { ref, reactive, onMounted, watch } from 'vue'
import { financeApi } from '@/api/endpoints'
import { usePeriodFilter } from './usePeriodFilter'
import PeriodFilterControl from './PeriodFilterControl.vue'

const filter = usePeriodFilter()

const transactions = ref([])
const loading = ref(false)
const error = ref('')
const pagination = reactive({ count: 0, page: 1, page_size: 50 })

async function load() {
  loading.value = true
  try {
    const { data } = await financeApi.myTransactions({
      report: 'items',
      from: filter.from.value, to: filter.to.value,
      page: pagination.page, page_size: pagination.page_size,
    })
    transactions.value = data.results
    pagination.count = data.count
    pagination.page = data.page
    pagination.page_size = data.page_size
  } catch {
    error.value = 'Failed to load item report.'
  } finally {
    loading.value = false
  }
}

function signedAmount(tx) {
  return tx.type === 'debit' ? -Number(tx.amount) : Number(tx.amount)
}

async function download(fmt) {
  try {
    const { data } = await financeApi.myDownload({
      format: fmt, report: 'items', from: filter.from.value, to: filter.to.value,
    })
    const ext  = fmt === 'xlsx' ? 'xlsx' : 'csv'
    const mime = fmt === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv'
    const url  = URL.createObjectURL(new Blob([data], { type: mime }))
    const a    = document.createElement('a')
    a.href     = url
    a.download = `item_report.${ext}`
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
  load()
}

watch([() => filter.from.value, () => filter.to.value], () => {
  pagination.page = 1
  load()
})

onMounted(load)
</script>

<template>
  <div class="space-y-6">
    <div v-if="error" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
      {{ error }}
    </div>

    <PeriodFilterControl :filter="filter">
      <button @click="download('csv')"  class="btn-secondary text-sm">↓ CSV</button>
      <button @click="download('xlsx')" class="btn-secondary text-sm">↓ Excel</button>
    </PeriodFilterControl>

    <div class="card overflow-hidden">
      <div class="flex items-center justify-between px-5 py-3 border-b border-card-border">
        <h3 class="font-semibold">Item Report</h3>
        <span class="text-xs text-text-secondary">{{ pagination.count }} total</span>
      </div>

      <div v-if="loading" class="px-5 py-10 text-center text-text-secondary text-sm">Loading…</div>
      <div v-else-if="!transactions.length" class="px-5 py-10 text-center text-text-secondary text-sm">
        No records found.
      </div>

      <div v-else class="overflow-x-auto">
      <table class="w-full text-xs">
        <thead class="bg-sidebar-bg text-text-secondary">
          <tr>
            <th class="text-left px-3 py-2 whitespace-nowrap">Transaction ID</th>
            <th class="text-left px-3 py-2 whitespace-nowrap">Order No</th>
            <th class="text-left px-3 py-2 whitespace-nowrap">Shop</th>
            <th class="text-left px-3 py-2 whitespace-nowrap">PC Local Time</th>
            <th class="text-left px-3 py-2 whitespace-nowrap">User Local Time</th>
            <th class="text-left px-3 py-2 whitespace-nowrap">Type</th>
            <th class="text-left px-3 py-2">Product/Service</th>
            <th class="text-right px-3 py-2 whitespace-nowrap">Qty</th>
            <th class="text-left px-3 py-2">Size</th>
            <th class="text-left px-3 py-2">Color</th>
            <th class="text-right px-3 py-2 whitespace-nowrap">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="tx in transactions" :key="tx.id" class="border-t border-card-border hover:bg-sidebar-bg/50">
            <td class="px-3 py-2 font-mono text-text-secondary whitespace-nowrap">{{ tx.display_id }}</td>
            <td class="px-3 py-2 text-text-secondary font-mono whitespace-nowrap">{{ tx.order_number }}</td>
            <td class="px-3 py-2 text-text-secondary whitespace-nowrap">{{ tx.shop }}</td>
            <td class="px-3 py-2 text-text-secondary whitespace-nowrap">{{ tx.pc_local_time }}</td>
            <td class="px-3 py-2 text-text-secondary whitespace-nowrap">{{ tx.user_local_time }}</td>
            <td class="px-3 py-2 text-text-secondary whitespace-nowrap">{{ tx.category_display || tx.type }}</td>
            <td class="px-3 py-2 text-text-secondary">{{ tx.product_name }}</td>
            <td class="px-3 py-2 text-right text-text-secondary">{{ tx.quantity }}</td>
            <td class="px-3 py-2 text-text-secondary">{{ tx.size }}</td>
            <td class="px-3 py-2 text-text-secondary">{{ tx.color }}</td>
            <td class="px-3 py-2 text-right font-semibold whitespace-nowrap" :class="signedAmount(tx) < 0 ? 'text-red-600' : 'text-emerald-600'">
              {{ signedAmount(tx) >= 0 ? '+' : '' }}${{ signedAmount(tx).toFixed(2) }}
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
