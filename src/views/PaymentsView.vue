<script setup>
import { ref } from 'vue'

const balance = ref(587.12)
const transactions = ref([
  { id: 1, date: '2026-05-12', type: 'Top-up', amount: 200.00, status: 'Completed' },
  { id: 2, date: '2026-05-10', type: 'Label - EO-1015', amount: -8.45, status: 'Completed' },
  { id: 3, date: '2026-05-09', type: 'Order - EO-1014', amount: -12.30, status: 'Completed' }
])
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Payments</h1>

    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="card p-5 md:col-span-2">
        <div class="text-sm text-text-secondary">Current Balance</div>
        <div class="text-4xl font-extrabold text-accent-dark mt-2">${{ balance.toFixed(2) }}</div>
        <div class="mt-4 flex gap-2">
          <button class="btn-primary">Add Funds</button>
          <button class="btn-secondary">Download Statement</button>
        </div>
      </div>
      <div class="card p-5">
        <div class="text-sm text-text-secondary">This Month</div>
        <div class="text-2xl font-bold mt-2">$342.18</div>
        <div class="text-xs text-text-muted">Spent on orders & labels</div>
      </div>
    </div>

    <div class="card overflow-hidden">
      <h3 class="font-semibold px-5 py-3 border-b border-card-border">Transactions</h3>
      <table class="w-full text-sm">
        <thead class="bg-sidebar-bg text-text-secondary">
          <tr>
            <th class="text-left px-5 py-2">Date</th>
            <th class="text-left px-5 py-2">Type</th>
            <th class="text-right px-5 py-2">Amount</th>
            <th class="text-left px-5 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="t in transactions" :key="t.id" class="border-t border-card-border">
            <td class="px-5 py-2">{{ t.date }}</td>
            <td class="px-5 py-2">{{ t.type }}</td>
            <td class="px-5 py-2 text-right" :class="t.amount < 0 ? 'text-red-600' : 'text-emerald-600'">
              {{ t.amount < 0 ? '-' : '+' }}${{ Math.abs(t.amount).toFixed(2) }}
            </td>
            <td class="px-5 py-2">{{ t.status }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
