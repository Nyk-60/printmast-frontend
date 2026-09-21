<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { superAdminApi } from '@/api/endpoints'

const route  = useRoute()
const router = useRouter()
const pcId   = route.params.id

const loading    = ref(false)
const error      = ref('')
const data       = ref(null)
const startDate  = ref('')
const endDate    = ref('')
const expanded   = ref({})

// Default: current month
function initDates() {
  const now   = new Date()
  const y     = now.getFullYear()
  const m     = String(now.getMonth() + 1).padStart(2, '0')
  const last  = new Date(y, now.getMonth() + 1, 0).getDate()
  startDate.value = `${y}-${m}-01`
  endDate.value   = `${y}-${m}-${String(last).padStart(2, '0')}`
}

async function load() {
  loading.value = true
  error.value   = ''
  data.value    = null
  try {
    const { data: d } = await superAdminApi.printCenterAnalytics(pcId, {
      start: startDate.value,
      end:   endDate.value,
    })
    data.value = d
  } catch {
    error.value = 'Failed to load analytics.'
  } finally {
    loading.value = false
  }
}

async function downloadXlsx() {
  try {
    const res = await superAdminApi.printCenterAnalyticsXlsx(pcId, {
      start: startDate.value,
      end:   endDate.value,
    })
    const url  = URL.createObjectURL(new Blob([res.data]))
    const link = document.createElement('a')
    link.href  = url
    link.download = `${data.value?.print_center || 'analytics'}_${startDate.value}_${endDate.value}.xlsx`
    link.click()
    URL.revokeObjectURL(url)
  } catch {
    error.value = 'Export failed.'
  }
}

function toggleExpand(name) {
  expanded.value[name] = !expanded.value[name]
}

onMounted(() => {
  initDates()
  load()
})
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center gap-3">
      <button @click="router.push({ name: 'print-centers' })"
        class="text-text-muted hover:text-text-primary transition">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 18l-6-6 6-6" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <h1 class="text-2xl font-bold">
        Analytics
        <span v-if="data" class="text-text-secondary font-normal text-lg ml-2">— {{ data.print_center }}</span>
      </h1>
    </div>

    <!-- Date range + controls -->
    <div class="card p-4 flex flex-wrap items-end gap-4">
      <div>
        <label class="text-xs text-text-secondary block mb-1">Start Date</label>
        <input v-model="startDate" type="date"
          class="rounded-lg border border-card-border px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="text-xs text-text-secondary block mb-1">End Date</label>
        <input v-model="endDate" type="date"
          class="rounded-lg border border-card-border px-3 py-2 text-sm" />
      </div>
      <div class="text-xs text-text-muted self-center">
        Based on: <strong>{{ data?.timezone || '—' }}</strong> timezone
      </div>
      <div class="flex gap-2 ml-auto">
        <button @click="load" :disabled="loading" class="btn-primary text-sm">
          {{ loading ? 'Loading…' : 'Apply' }}
        </button>
        <button @click="downloadXlsx" :disabled="!data" class="btn-secondary text-sm">
          Export Excel
        </button>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{{ error }}</div>

    <!-- Loading skeleton -->
    <div v-if="loading" class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div class="card p-5 h-24 animate-pulse bg-gray-100" />
        <div class="card p-5 h-24 animate-pulse bg-gray-100" />
      </div>
      <div v-for="i in 3" :key="i" class="card p-4 h-16 animate-pulse bg-gray-100" />
    </div>

    <template v-else-if="data">
      <!-- Summary cards -->
      <div class="grid grid-cols-2 gap-4">
        <div class="card p-5">
          <div class="text-xs text-text-secondary">Processed Orders</div>
          <div class="text-4xl font-bold text-accent-dark mt-1">{{ data.order_count.toLocaleString() }}</div>
        </div>
        <div class="card p-5">
          <div class="text-xs text-text-secondary">Processed Items</div>
          <div class="text-4xl font-bold text-purple-600 mt-1">{{ data.item_count.toLocaleString() }}</div>
        </div>
      </div>

      <!-- No data -->
      <div v-if="!data.products.length" class="card p-10 text-center text-text-muted text-sm">
        No processed orders in this period.
      </div>

      <!-- Product breakdown -->
      <div v-else class="card overflow-hidden">
        <div class="px-5 py-3 border-b border-card-border flex items-center justify-between">
          <h3 class="font-semibold text-sm">Product Breakdown</h3>
          <span class="text-xs text-text-muted">{{ data.products.length }} product(s)</span>
        </div>

        <div class="divide-y divide-card-border">
          <div v-for="product in data.products" :key="product.name">
            <!-- Product row -->
            <div class="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-sidebar-bg/40 transition"
              @click="toggleExpand(product.name)">
              <div class="flex items-center gap-3">
                <svg class="w-4 h-4 text-text-muted transition-transform"
                  :class="expanded[product.name] ? 'rotate-90' : ''"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <div>
                  <div class="font-medium text-sm">{{ product.name }}</div>
                  <div v-if="product.sku" class="text-xs text-text-muted">{{ product.sku }}</div>
                </div>
              </div>
              <div class="text-right">
                <div class="font-bold text-lg">{{ product.count.toLocaleString() }}</div>
                <div class="text-xs text-text-muted">items</div>
              </div>
            </div>

            <!-- Variant detail rows -->
            <div v-if="expanded[product.name]" class="bg-sidebar-bg/30">
              <table class="w-full text-sm">
                <thead>
                  <tr class="text-xs text-text-secondary border-b border-card-border">
                    <th class="text-left px-10 py-2">Color</th>
                    <th class="text-left px-4 py-2">Size</th>
                    <th class="text-right px-5 py-2">Count</th>
                    <th class="text-right px-5 py-2">% of product</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="v in product.variants" :key="`${v.color}|${v.size}`"
                    class="border-b border-card-border/50 last:border-0">
                    <td class="px-10 py-2">
                      <div class="flex items-center gap-2">
                        <span v-if="v.color" class="text-text-primary">{{ v.color }}</span>
                        <span v-else class="text-text-muted italic">—</span>
                      </div>
                    </td>
                    <td class="px-4 py-2">
                      <span v-if="v.size" class="badge bg-gray-100 text-gray-700 text-xs">{{ v.size }}</span>
                      <span v-else class="text-text-muted italic">—</span>
                    </td>
                    <td class="px-5 py-2 text-right font-semibold">{{ v.count.toLocaleString() }}</td>
                    <td class="px-5 py-2 text-right text-text-secondary text-xs">
                      {{ product.count > 0 ? Math.round(v.count / product.count * 100) : 0 }}%
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
