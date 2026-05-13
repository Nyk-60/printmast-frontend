<script setup>
import { ref } from 'vue'

const dateRange = ref('last7')
const dateRanges = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7', label: 'Last 7 Days' },
  { value: 'last30', label: 'Last 30 Days' },
  { value: 'thisYear', label: 'This Year' },
  { value: 'custom', label: 'Custom Range' }
]

const metrics = ref([
  { label: 'Orders Processed', value: 248, delta: '+12%' },
  { label: 'Orders Delivered', value: 192, delta: '+8%' },
  { label: 'In Production', value: 34, delta: '-3%' }
])

const openOrders = ref([
  { store: 'CozyPrints', count: 8 },
  { store: 'ColorBurst Co.', count: 5 },
  { store: 'Hometown Tees', count: 3 }
])
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-4 gap-6">
    <div class="lg:col-span-3 space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-2xl font-bold">Dashboard</h1>
        <select v-model="dateRange" class="card px-3 py-2 text-sm">
          <option v-for="r in dateRanges" :key="r.value" :value="r.value">{{ r.label }}</option>
        </select>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div v-for="m in metrics" :key="m.label" class="card p-5">
          <div class="text-sm text-text-secondary">{{ m.label }}</div>
          <div class="mt-2 flex items-baseline gap-2">
            <span class="text-3xl font-bold">{{ m.value }}</span>
            <span class="text-xs text-emerald-600">{{ m.delta }}</span>
          </div>
        </div>
      </div>

      <div class="card p-5">
        <h2 class="font-semibold mb-4">Categories</h2>
        <div class="flex gap-3 overflow-x-auto">
          <div v-for="c in ['T-Shirts','Sweatshirts','Hoodies','Joggers','Youth','Canvas','Drinkware']" :key="c"
            class="shrink-0 w-32 h-24 rounded-lg bg-accent-light flex items-center justify-center text-sm font-medium text-accent-dark">
            {{ c }}
          </div>
        </div>
      </div>

      <div class="card p-5">
        <h2 class="font-semibold mb-4">Recent Activity</h2>
        <p class="text-sm text-text-secondary">No recent activity to display.</p>
      </div>
    </div>

    <aside class="card p-5 h-fit lg:sticky lg:top-6">
      <div class="flex items-center justify-between mb-3">
        <h3 class="font-semibold">Open Orders</h3>
        <span class="badge bg-red-500 text-white">LIVE</span>
      </div>
      <ul class="space-y-2">
        <li v-for="o in openOrders" :key="o.store" class="flex justify-between text-sm">
          <span>{{ o.store }}</span>
          <span class="font-semibold">{{ o.count }}</span>
        </li>
      </ul>
    </aside>
  </div>
</template>
