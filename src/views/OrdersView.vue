<script setup>
import { ref } from 'vue'

const tab = ref('new')
const tabs = [
  { key: 'new', label: 'New Orders', count: 14 },
  { key: 'completed', label: 'Completed Orders', count: 142 }
]

const orders = ref([
  {
    id: 'EO-1029',
    customer: 'Sarah Mitchell',
    shop: 'CozyPrints',
    product: 'Personalized Family Tee',
    quantity: 2,
    sku: 'BC3001-NAVY-L',
    size: 'L',
    color: 'Navy',
    style: 'Unisex Tee',
    personalization: 'The Mitchell Family • Est. 2014',
    note: 'Please ship by Friday, it\'s a gift.',
    address: '742 Evergreen Terrace, Springfield, IL 62704',
    shipBy: '2026-05-20',
    ordered: '2026-05-12',
    requested: 'Standard',
    matched: false
  },
  {
    id: 'EO-1028',
    customer: 'James Cooper',
    shop: 'Hometown Tees',
    product: 'Vintage Logo Sweatshirt',
    quantity: 1,
    sku: 'G180-BLK-XL',
    size: 'XL',
    color: 'Black',
    style: 'Crewneck',
    personalization: '',
    note: '',
    address: '1100 Congress Ave, Austin, TX 78701',
    shipBy: '2026-05-10',
    ordered: '2026-05-08',
    requested: 'Priority',
    matched: false
  }
])

const isOverdue = (d) => new Date(d) < new Date()
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Orders</h1>
    </div>

    <div class="card p-2 flex gap-1">
      <button v-for="t in tabs" :key="t.key" @click="tab = t.key"
        class="flex-1 py-2 px-3 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
        :class="tab === t.key ? 'bg-accent text-white' : 'hover:bg-sidebar-bg text-text-secondary'">
        {{ t.label }}
        <span class="badge"
          :class="tab === t.key ? 'bg-white text-accent-dark' : 'bg-accent-light text-accent-dark'">
          {{ t.count }}
        </span>
      </button>
    </div>

    <div class="card p-3 flex flex-wrap items-center gap-3">
      <input placeholder="Search orders…" class="flex-1 min-w-[200px] rounded-lg border border-card-border px-3 py-2 text-sm" />
      <select class="rounded-lg border border-card-border px-3 py-2 text-sm">
        <option>All Stores</option>
      </select>
      <select class="rounded-lg border border-card-border px-3 py-2 text-sm">
        <option>All Statuses</option>
      </select>
    </div>

    <div class="space-y-3">
      <article v-for="o in orders" :key="o.id" class="card p-4 grid grid-cols-12 gap-4 items-start">
        <input type="checkbox" class="col-span-1 mt-2" />

        <div class="col-span-3">
          <div class="font-semibold">{{ o.customer }}</div>
          <div class="text-xs text-text-muted">{{ o.id }}</div>
          <div class="mt-2 w-32 h-32 rounded-lg bg-[#f8f8f8] flex items-center justify-center text-text-muted text-xs">
            Mockup
          </div>
          <div class="text-xs text-text-secondary mt-2">{{ o.shop }}</div>
        </div>

        <div class="col-span-4">
          <div class="flex items-center gap-2">
            <span class="font-semibold">{{ o.product }}</span>
            <span v-if="!o.matched" class="badge-unmatched">Unmatched</span>
            <span v-else class="badge-matched">Matched</span>
          </div>
          <div class="text-xs text-text-secondary mt-2 space-y-0.5">
            <div>Qty: <b>{{ o.quantity }}</b></div>
            <div>SKU: {{ o.sku }}</div>
            <div>{{ o.size }} • {{ o.color }} • {{ o.style }}</div>
            <div v-if="o.personalization">Personalization: <i>{{ o.personalization }}</i></div>
          </div>
          <div v-if="o.note" class="mt-2 text-xs p-2 rounded bg-amber-50 text-amber-900 border border-amber-100">
            ✏️ {{ o.note }}
          </div>
        </div>

        <div class="col-span-2 text-xs space-y-1">
          <div :class="isOverdue(o.shipBy) ? 'text-red-600 font-semibold' : 'text-text-primary'">
            <span v-if="isOverdue(o.shipBy)">⚠ </span>Ship by: {{ o.shipBy }}
          </div>
          <div class="text-text-secondary">Ordered: {{ o.ordered }}</div>
          <div class="text-text-secondary">{{ o.address }}</div>
          <span class="badge bg-emerald-100 text-emerald-800">USPS Verified</span>
        </div>

        <div class="col-span-2 text-xs space-y-2">
          <div>
            <div class="text-text-secondary">Requested</div>
            <div class="font-medium">{{ o.requested }}</div>
          </div>
          <select class="w-full rounded border border-card-border px-2 py-1.5 text-xs" :disabled="!o.matched">
            <option>Select Service</option>
          </select>
          <div class="text-sm font-semibold text-text-muted">$ —</div>
        </div>
      </article>
    </div>
  </div>
</template>
