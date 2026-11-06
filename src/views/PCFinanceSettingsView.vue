<script setup>
import { ref, onMounted } from 'vue'
import { financeApi } from '@/api/endpoints'

const TABS = [
  { name: 'pc-finance-balance-history', label: 'Balance History' },
  { name: 'pc-finance-invoices',        label: 'Invoices' },
  { name: 'pc-finance-item-reports',    label: 'Item Reports' },
]

const unpaidCount = ref(0)

onMounted(async () => {
  try {
    const { data } = await financeApi.pcSummary()
    unpaidCount.value = data.unpaid_invoice_count || 0
  } catch {
    unpaidCount.value = 0
  }
})
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Finance</h1>

    <div class="flex border-b border-card-border">
      <RouterLink v-for="tab in TABS" :key="tab.name" :to="{ name: tab.name }"
        class="relative px-5 py-2.5 text-sm font-semibold border-b-2 transition border-transparent text-text-secondary hover:text-text-primary"
        active-class="!border-accent !text-accent">
        {{ tab.label }}
        <span v-if="tab.name === 'pc-finance-invoices' && unpaidCount"
          class="ml-1 badge bg-red-500 text-white text-[10px] w-4 h-4 p-0 inline-flex items-center justify-center rounded-full align-top">
          {{ unpaidCount }}
        </span>
      </RouterLink>
    </div>

    <RouterView />
  </div>
</template>
