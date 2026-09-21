<script setup>
import { ref, onMounted } from 'vue'
import { financeApi } from '@/api/endpoints'

const subUsers  = ref([])
const loading   = ref(true)
const error     = ref('')
const selected  = ref(null)
const txs       = ref([])
const txLoading = ref(false)
const txPagination = ref({ count: 0, page: 1 })

async function load() {
  loading.value = true
  error.value   = ''
  try {
    const { data } = await financeApi.overview()
    subUsers.value = data
  } catch {
    error.value = 'Failed to load finance overview.'
  } finally {
    loading.value = false
  }
}

onMounted(load)

async function openTx(su) {
  selected.value  = su
  txLoading.value = true
  txs.value       = []
  try {
    const { data } = await financeApi.subUserTransactions(su.sub_user_id, { page_size: 50 })
    txs.value           = data.results
    txPagination.value  = { count: data.count, page: data.page }
  } catch {
    error.value = 'Failed to load transactions.'
  } finally {
    txLoading.value = false
  }
}

async function downloadSub(su, fmt) {
  try {
    const { data } = await financeApi.subUserDownload(su.sub_user_id, { format: fmt })
    const ext  = fmt === 'xlsx' ? 'xlsx' : 'csv'
    const mime = fmt === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv'
    const url = URL.createObjectURL(new Blob([data], { type: mime }))
    const a   = document.createElement('a')
    a.href    = url
    a.download = `${su.email}-transactions.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    error.value = 'Download failed.'
  }
}

function typeBadge(type) {
  if (type === 'credit')  return 'bg-emerald-100 text-emerald-800'
  if (type === 'refund')  return 'bg-blue-100 text-blue-800'
  return 'bg-red-100 text-red-700'
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Finance Overview</h1>

    <div v-if="error" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{{ error }}</div>

    <div v-if="loading" class="space-y-3">
      <div v-for="i in 4" :key="i" class="card p-4 h-16 animate-pulse bg-gray-100" />
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Sub-user list -->
      <div class="space-y-3">
        <div v-for="su in subUsers" :key="su.sub_user_id"
          class="card p-4 cursor-pointer hover:border-accent/40 transition"
          :class="selected?.sub_user_id === su.sub_user_id ? 'border-accent' : ''"
          @click="openTx(su)">
          <div class="flex items-start justify-between">
            <div>
              <div class="font-medium">{{ su.full_name || su.email }}</div>
              <div class="text-xs text-text-secondary">{{ su.email }}</div>
            </div>
            <div class="text-right">
              <div :class="Number(su.balance) < 0 ? 'text-red-600 font-bold' : 'text-emerald-600 font-bold'">
                ${{ Number(su.balance).toFixed(2) }}
              </div>
              <span class="badge text-xs" :class="su.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'">
                {{ su.is_active ? 'Active' : 'Inactive' }}
              </span>
            </div>
          </div>
          <div class="mt-2 flex gap-4 text-xs text-text-secondary">
            <span>↑ +${{ Number(su.total_credited).toFixed(2) }}</span>
            <span>↓ -${{ Number(su.total_debited).toFixed(2) }}</span>
            <span class="ml-auto">Limit: -${{ Number(su.negative_balance_limit).toFixed(2) }}</span>
          </div>
          <div class="mt-2 flex gap-2" @click.stop>
            <button @click="downloadSub(su, 'csv')"  class="btn-secondary text-xs py-1 px-2">↓ CSV</button>
            <button @click="downloadSub(su, 'xlsx')" class="btn-secondary text-xs py-1 px-2">↓ Excel</button>
          </div>
        </div>
        <div v-if="!subUsers.length" class="card p-8 text-center text-text-muted text-sm">No sub-users.</div>
      </div>

      <!-- Transaction panel -->
      <div class="card overflow-hidden h-fit sticky top-6">
        <div class="px-5 py-3 border-b border-card-border flex items-center justify-between">
          <h3 class="font-semibold text-sm">
            {{ selected ? selected.email + ' — Transactions' : 'Select a sub-user' }}
          </h3>
          <span v-if="selected" class="text-xs text-text-secondary">{{ txPagination.count }} total</span>
        </div>
        <div v-if="!selected" class="p-8 text-center text-text-muted text-sm">
          Click a sub-user to view their transactions.
        </div>
        <div v-else-if="txLoading" class="p-8 text-center text-text-secondary text-sm">Loading…</div>
        <div v-else-if="!txs.length" class="p-8 text-center text-text-muted text-sm">No transactions.</div>
        <div v-else class="overflow-y-auto max-h-[60vh]">
          <table class="w-full text-xs">
            <thead class="bg-sidebar-bg text-text-secondary sticky top-0">
              <tr>
                <th class="text-left px-4 py-2">Date</th>
                <th class="text-left px-4 py-2">Type</th>
                <th class="text-right px-4 py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="tx in txs" :key="tx.id" class="border-t border-card-border">
                <td class="px-4 py-2 text-text-secondary">{{ tx.created_at?.slice(0, 10) }}</td>
                <td class="px-4 py-2">
                  <span class="badge" :class="typeBadge(tx.type)">{{ tx.type }}</span>
                </td>
                <td class="px-4 py-2 text-right"
                  :class="tx.type === 'credit' || tx.type === 'refund' ? 'text-emerald-600' : 'text-red-600'">
                  {{ tx.type === 'debit' ? '-' : '+' }}${{ Number(tx.amount).toFixed(2) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>
