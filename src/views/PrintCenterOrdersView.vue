<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { ordersApi, shippingApi, subUsersApi, productionApi } from '@/api/endpoints'

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CLS = {
  new:           'bg-gray-100 text-gray-700',
  matching:      'bg-amber-100 text-amber-800',
  ready:         'bg-blue-100 text-blue-800',
  sent_to_print: 'bg-purple-100 text-purple-800',
  in_production: 'bg-indigo-100 text-indigo-800',
  shipped:       'bg-emerald-100 text-emerald-800',
  delivered:     'bg-emerald-100 text-emerald-800',
  cancelled:     'bg-red-100 text-red-700',
  refunded:      'bg-orange-100 text-orange-700',
}

const STATUS_LABEL = {
  new: 'New', matching: 'Matching', ready: 'Ready',
  sent_to_print: 'Sent to Print', in_production: 'In Production',
  shipped: 'Shipped', delivered: 'Delivered',
  cancelled: 'Cancelled', refunded: 'Refunded',
}

const CHECKER_BG = {
  backgroundColor: '#c0c0c0',
  backgroundImage: [
    'linear-gradient(45deg,#a0a0a0 25%,transparent 25%)',
    'linear-gradient(-45deg,#a0a0a0 25%,transparent 25%)',
    'linear-gradient(45deg,transparent 75%,#a0a0a0 75%)',
    'linear-gradient(-45deg,transparent 75%,#a0a0a0 75%)',
  ].join(','),
  backgroundSize: '12px 12px',
  backgroundPosition: '0 0,0 6px,6px -6px,-6px 0px',
}

// ── State ─────────────────────────────────────────────────────────────────────

const mainTab       = ref('new_orders')
const storeFilter   = ref('')
const subUserFilter = ref('')
const searchQ       = ref('')
const page          = ref(1)
const PAGE_SIZE      = 30

const orders     = ref([])
const totalCount = ref(0)
const loading    = ref(true)
const loadError  = ref('')

const stores   = ref([])
const subUsers = ref([])

const tabCounts = ref({ new_orders: 0, ready_for_print: 0, in_production: 0, completed: 0 })

const zoomedImage = ref('')

// ── Order cost breakdown popover ───────────────────────────────────────────────
const costBreakdownOrderId = ref(null)

function toggleCostBreakdown(order) {
  costBreakdownOrderId.value = costBreakdownOrderId.value === order.id ? null : order.id
}

function orderCostTotal(order) {
  return Number(order.item_cost || 0) + Number(order.shipping_cost || 0) + Number(order.extra_print_area_fee || 0)
}

async function loadFilters() {
  try {
    const { data } = await shippingApi.stores()
    stores.value = data.results ?? data
  } catch { stores.value = [] }
  try {
    const { data } = await subUsersApi.list()
    subUsers.value = data.results ?? data
  } catch { subUsers.value = [] }
}

async function loadOrders() {
  loading.value   = true
  loadError.value = ''
  try {
    const params = { tab: mainTab.value, page: page.value, page_size: PAGE_SIZE }
    if (storeFilter.value)   params.store    = storeFilter.value
    if (subUserFilter.value) params.sub_user = subUserFilter.value
    if (searchQ.value)       params.search   = searchQ.value
    const { data } = await ordersApi.list(params)
    orders.value     = data.results ?? data
    totalCount.value = data.count   ?? orders.value.length
  } catch (e) {
    const msg = e?.response?.data?.detail ?? e?.response?.statusText ?? e?.message ?? 'Unknown error'
    loadError.value = `Failed to load orders: ${msg}`
  } finally {
    loading.value = false
  }
}

const SHIPPING_CATEGORIES = [
  { value: 'standard', label: 'Standard' },
  { value: 'priority', label: 'Priority' },
  { value: 'express',  label: 'Express' },
]
const categoryChangingId = ref(null)

// Rush/downgrade the shipping speed for an order — internal only, never changes
// what the marketplace was told the customer ordered. The backend re-picks a
// rate for the new category in the background; this view just reloads once
// that's had a moment to land, since it has no rate picker of its own.
async function changeShippingCategory(order, category) {
  categoryChangingId.value = order.id
  const oi = orders.value.findIndex(o => o.id === order.id)
  if (oi !== -1) Object.assign(orders.value[oi], { shipping_category: category, selected_service_name: '', shipping_cost: null })
  try {
    await ordersApi.setShippingCategory(order.id, category)
    setTimeout(async () => { await loadOrders(); categoryChangingId.value = null }, 1500)
  } catch (e) {
    loadError.value = e?.response?.data?.detail ?? 'Failed to change the shipping category.'
    await loadOrders()
    categoryChangingId.value = null
  }
}

// ── Batch creation from the Ready for Print queue ──────────────────────────────

const selectedOrders  = ref([])
const batchNameModal  = ref(false)
const batchName       = ref('')
const batchCreating   = ref(false)
const batchCreateError = ref('')
const successMsg      = ref('')

function toggleOrderSelected(id) {
  const i = selectedOrders.value.indexOf(id)
  if (i === -1) selectedOrders.value.push(id)
  else selectedOrders.value.splice(i, 1)
}

function selectAllOrders() {
  selectedOrders.value = selectedOrders.value.length === orders.value.length
    ? []
    : orders.value.map(o => o.id)
}

function openBatchNameModal() {
  if (!selectedOrders.value.length) return
  batchName.value       = ''
  batchCreateError.value = ''
  batchNameModal.value  = true
}

async function createBatchAndProcess() {
  batchCreating.value   = true
  batchCreateError.value = ''
  try {
    const { data } = await productionApi.createBatch({
      order_ids:           selectedOrders.value,
      name:                batchName.value,
      sheet_length_inches: 200,
      gang_sheet_dpi:      300,
      margin_inches:       '0.20',
      skip_invalid:        true,   // never block the whole run — problem orders stay queued for later
    })
    const left = data.left_out?.length ?? 0
    loadError.value = ''
    batchNameModal.value = false
    selectedOrders.value = []
    await Promise.all([loadOrders(), loadTabCounts(), loadReadyForPrintSummary()])
    successMsg.value =
      `Batch "${data.name || `#${data.id}`}" created — labels are being bought now.` +
      (left ? ` ${left} order(s) with problems were left out and stay in this queue.` : '') +
      ' See progress on the Production page.'
  } catch (e) {
    const d = e?.response?.data
    batchCreateError.value = d?.detail ?? 'Failed to create the batch.'
  } finally {
    batchCreating.value = false
  }
}

function tabCountParams() {
  const params = {}
  if (storeFilter.value)   params.store    = storeFilter.value
  if (subUserFilter.value) params.sub_user = subUserFilter.value
  if (searchQ.value)       params.search   = searchQ.value
  return params
}

async function loadTabCounts() {
  try {
    const { data } = await ordersApi.tabCounts(tabCountParams())
    tabCounts.value = data
  } catch { /* badges are non-critical — keep previous counts on failure */ }
}

const readyForPrintSummary = ref({ count: 0, total: 0 })

async function loadReadyForPrintSummary() {
  try {
    const { data } = await ordersApi.readyForPrintSummary(tabCountParams())
    readyForPrintSummary.value = data
  } catch { /* non-critical — keep previous total on failure */ }
}

function refreshSummaries() { loadTabCounts(); loadReadyForPrintSummary() }

onMounted(() => { loadFilters(); loadOrders(); refreshSummaries() })

function setMainTab(t)  { mainTab.value = t; page.value = 1; selectedOrders.value = []; loadOrders() }
function setStore(s)    { storeFilter.value = s; page.value = 1; loadOrders(); refreshSummaries() }
function setSubUser(s)  { subUserFilter.value = s; page.value = 1; loadOrders(); refreshSummaries() }
function doSearch()     { page.value = 1; loadOrders(); refreshSummaries() }

let searchDebounceTimer = null
watch(searchQ, () => {
  clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(doSearch, 400)
})

const totalPages = computed(() => Math.max(1, Math.ceil(totalCount.value / PAGE_SIZE)))
function goPage(p) { if (p >= 1 && p <= totalPages.value) { page.value = p; loadOrders() } }

// ── Date grouping (newest first) — same presentation as the sub-user's Orders page ──
const grouped = computed(() => {
  const map = {}, keys = []
  for (const o of orders.value) {
    const key = o.ordered_at?.slice(0, 10) || '0000-00-00'
    if (!map[key]) { map[key] = []; keys.push(key) }
    map[key].push(o)
  }
  keys.sort().reverse()
  return keys.map(k => ({ key: k, orders: map[k] }))
})

function dateLabel(key) {
  if (key === '0000-00-00') return 'Unknown Date'
  return new Date(key + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function isOverdue(d) { return d && new Date(d) < new Date() }

function formatDate(d) {
  if (!d) return null
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatOptions(raw) {
  if (!raw || typeof raw !== 'object') return []
  return Object.entries(raw).filter(([k, v]) => v && v !== 'null' && k.toLowerCase() !== 'personalization')
}

function splitTitle(title) {
  if (!title || title.length <= 40) return { line1: title || '', line2: '' }
  const mid = Math.floor(title.length / 2)
  const before = title.lastIndexOf(' ', mid)
  const after  = title.indexOf(' ', mid)
  let breakAt
  if (before === -1 && after === -1) return { line1: title, line2: '' }
  if (before === -1) breakAt = after
  else if (after === -1) breakAt = before
  else breakAt = (mid - before <= after - mid) ? before : after
  return { line1: title.slice(0, breakAt).trim(), line2: title.slice(breakAt + 1).trim() }
}
</script>

<template>
  <div class="space-y-4">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold tracking-tight">Orders</h1>
      <span class="text-sm font-semibold text-text-primary">{{ totalCount }} orders</span>
    </div>

    <!-- Error -->
    <div v-if="loadError"
      class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex justify-between">
      {{ loadError }}
      <button @click="loadError = ''" class="text-red-400 hover:text-red-600">✕</button>
    </div>

    <!-- Success -->
    <div v-if="successMsg"
      class="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex justify-between">
      {{ successMsg }}
      <button @click="successMsg = ''" class="text-emerald-500 hover:text-emerald-700">✕</button>
    </div>

    <!-- Main tabs -->
    <div class="flex border-b border-card-border">
      <button @click="setMainTab('new_orders')"
        class="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition"
        :class="mainTab === 'new_orders'
          ? 'border-accent text-accent'
          : 'border-transparent text-text-secondary hover:text-text-primary'">
        New Orders
        <span v-if="tabCounts.new_orders" class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold leading-none"
          :class="mainTab === 'new_orders' ? 'bg-accent text-white' : 'bg-gray-200 text-text-secondary'">
          {{ tabCounts.new_orders }}
        </span>
      </button>
      <button @click="setMainTab('ready_for_print')"
        class="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition"
        :class="mainTab === 'ready_for_print'
          ? 'border-accent text-accent'
          : 'border-transparent text-text-secondary hover:text-text-primary'">
        Ready for Print
        <span v-if="tabCounts.ready_for_print" class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold leading-none"
          :class="mainTab === 'ready_for_print' ? 'bg-accent text-white' : 'bg-gray-200 text-text-secondary'">
          {{ tabCounts.ready_for_print }}
        </span>
      </button>
      <button @click="setMainTab('in_production')"
        class="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition"
        :class="mainTab === 'in_production'
          ? 'border-accent text-accent'
          : 'border-transparent text-text-secondary hover:text-text-primary'">
        In Production
        <span v-if="tabCounts.in_production" class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold leading-none"
          :class="mainTab === 'in_production' ? 'bg-accent text-white' : 'bg-gray-200 text-text-secondary'">
          {{ tabCounts.in_production }}
        </span>
      </button>
      <button @click="setMainTab('completed')"
        class="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition"
        :class="mainTab === 'completed'
          ? 'border-accent text-accent'
          : 'border-transparent text-text-secondary hover:text-text-primary'">
        Completed
        <span v-if="tabCounts.completed" class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold leading-none"
          :class="mainTab === 'completed' ? 'bg-accent text-white' : 'bg-gray-200 text-text-secondary'">
          {{ tabCounts.completed }}
        </span>
      </button>
    </div>

    <!-- Ready for Print running total + batch selection -->
    <div v-if="mainTab === 'ready_for_print'"
      class="card px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
      <div class="flex items-center gap-3">
        <label class="flex items-center gap-1.5 text-sm text-text-secondary cursor-pointer select-none"
          v-if="orders.length">
          <input type="checkbox" class="accent-accent"
            :checked="orders.length > 0 && selectedOrders.length === orders.length"
            @change="selectAllOrders" />
          Select all
        </label>
        <span class="text-sm text-text-secondary">
          {{ readyForPrintSummary.count }} order{{ readyForPrintSummary.count === 1 ? '' : 's' }} queued
        </span>
      </div>
      <div class="flex items-center gap-3">
        <span class="text-sm">
          <span class="text-text-muted font-semibold">Total</span>
          <span class="font-bold text-blue-600 tabular-nums ml-1.5">${{ Number(readyForPrintSummary.total || 0).toFixed(2) }}</span>
        </span>
        <button v-if="selectedOrders.length" @click="openBatchNameModal"
          class="btn-primary text-sm py-1.5 px-3">
          Create Batch &amp; Process ({{ selectedOrders.length }})
        </button>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="flex gap-2">
      <select :value="storeFilter" @change="setStore($event.target.value)"
        class="rounded-lg border border-card-border px-3 py-2 text-sm bg-white text-text-primary">
        <option value="">All Stores</option>
        <option v-for="s in stores" :key="s.id" :value="s.id">{{ s.name }}</option>
      </select>
      <select :value="subUserFilter" @change="setSubUser($event.target.value)"
        class="rounded-lg border border-card-border px-3 py-2 text-sm bg-white text-text-primary">
        <option value="">All Sellers</option>
        <option v-for="su in subUsers" :key="su.id" :value="su.id">{{ su.full_name || su.email }}</option>
      </select>
      <input v-model="searchQ" @keyup.enter="doSearch"
        placeholder="Search by order # or customer…"
        class="flex-1 rounded-lg border border-card-border px-3 py-2 text-sm" />
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading" class="space-y-3">
      <div v-for="i in 4" :key="i" class="card h-44 animate-pulse bg-gray-100" />
    </div>

    <!-- Empty -->
    <div v-else-if="!orders.length"
      class="card p-12 text-center text-text-secondary text-sm">
      <span v-if="mainTab === 'new_orders'">No new orders.</span>
      <span v-else-if="mainTab === 'ready_for_print'">No orders waiting to start production.</span>
      <span v-else-if="mainTab === 'in_production'">No orders in production.</span>
      <span v-else>No completed orders.</span>
    </div>

    <!-- Orders grouped by date -->
    <template v-else>
      <div v-for="group in grouped" :key="group.key" class="space-y-2">

        <!-- Date separator -->
        <div class="flex items-center gap-3 pt-2">
          <span class="text-[11px] font-bold text-text-muted uppercase tracking-widest shrink-0">
            Ordered {{ dateLabel(group.key) }}
          </span>
          <div class="flex-1 h-px bg-card-border" />
        </div>

        <!-- ── Order card (read-only — same layout as the seller's Orders page) ── -->
        <div v-for="order in group.orders" :key="order.id"
          class="rounded-xl overflow-hidden border-2 border-gray-900 bg-white shadow-sm"
          :class="mainTab === 'new_orders'
            ? (order.unmatched_count
                ? 'border-l-[5px] border-l-amber-400'
                : order.status === 'ready'
                  ? 'border-l-[5px] border-l-blue-400'
                  : 'border-l-[5px] border-l-emerald-400')
            : ''">

          <!-- Header bar — column widths mirror the body row below so "Order Cost"
               lands exactly on the items/design divider regardless of content -->
          <div class="relative flex items-center border-b border-gray-100 bg-white">

            <!-- Items-column-matching cell -->
            <div class="flex-1 min-w-0 max-w-[750px] flex items-center gap-2 px-4 py-2.5">
              <input v-if="mainTab === 'ready_for_print'" type="checkbox" class="accent-accent shrink-0"
                :checked="selectedOrders.includes(order.id)" @change="toggleOrderSelected(order.id)" />
              <span v-if="order.external_order_number"
                class="font-bold font-mono text-base text-text-primary shrink-0">
                {{ order.external_order_number }}
              </span>
              <span class="text-sm text-text-secondary">{{ order.ship_to_name || order.customer_name }}</span>
              <span v-if="order.store_name"
                class="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200 shrink-0">
                {{ order.store_name }}
              </span>
              <span v-if="order.sub_user_name"
                class="text-xs px-1.5 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200 shrink-0">
                {{ order.sub_user_name }}
              </span>
            </div>

            <!-- Design-column-matching cell: Order Cost — right-anchored so it sits
                 immediately left of the design/shipping divider below -->
            <div class="flex-1 min-w-0 flex items-center justify-end px-4 py-2.5">
              <div class="relative">
                <button @click="toggleCostBreakdown(order)"
                  class="flex items-center gap-1.5 text-sm hover:bg-sidebar-bg rounded-lg px-1.5 py-0.5 -mx-1.5 transition">
                  <span class="text-text-muted font-bold shrink-0">Order Cost</span>
                  <span class="font-bold text-blue-600 tabular-nums text-right inline-block" style="min-width: 6.5ch">
                    ${{ orderCostTotal(order).toFixed(2) }}
                  </span>
                  <span class="text-text-muted text-xs shrink-0">▾</span>
                </button>

                <!-- Breakdown popover -->
                <template v-if="costBreakdownOrderId === order.id">
                <div class="fixed inset-0 z-40" @click="costBreakdownOrderId = null"></div>
                <div @click.stop
                  class="absolute right-0 top-full mt-1 w-56 z-50 bg-white rounded-xl shadow-2xl border border-card-border p-3 space-y-1.5">
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-text-secondary">Item price</span>
                    <span class="font-semibold text-text-primary tabular-nums">${{ Number(order.item_cost || 0).toFixed(2) }}</span>
                  </div>
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-text-secondary">Shipping</span>
                    <span class="font-semibold text-text-primary tabular-nums">${{ Number(order.shipping_cost || 0).toFixed(2) }}</span>
                  </div>
                  <div v-if="Number(order.extra_print_area_fee) > 0" class="flex items-center justify-between text-xs">
                    <span class="text-text-secondary">Extra print area</span>
                    <span class="font-semibold text-text-primary tabular-nums">${{ Number(order.extra_print_area_fee).toFixed(2) }}</span>
                  </div>
                  <div class="border-t border-card-border pt-1.5 flex items-center justify-between text-xs">
                    <span class="font-bold text-text-primary">Total</span>
                    <span class="font-bold text-blue-600 tabular-nums">${{ orderCostTotal(order).toFixed(2) }}</span>
                  </div>
                </div>
                </template>
              </div>
            </div>

            <!-- Shipping-column-matching cell: status badge -->
            <div class="w-64 shrink-0 flex items-center justify-end gap-2 px-4 py-2.5">
              <span v-if="order.status !== 'new' && mainTab !== 'new_orders'"
                class="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                :class="STATUS_CLS[order.status] ?? 'bg-gray-100 text-gray-600'">
                {{ STATUS_LABEL[order.status] ?? order.status }}
              </span>
            </div>
          </div>

          <!-- Body: [items col] [design col] [shipping col] -->
          <div class="flex divide-x divide-card-border">

            <!-- ── Items column ───────────────────────────────────────────── -->
            <div class="flex-1 min-w-0 max-w-[750px]">

              <template v-for="(item, idx) in order.items" :key="item.id">
                <div v-if="Number(item.unit_price) >= 0"
                  class="flex gap-4 px-2 pt-2 pb-4"
                  :class="idx > 0 ? 'border-t border-dashed border-card-border' : ''">

                  <!-- Product image -->
                  <div class="shrink-0 w-40 h-48">
                    <img v-if="item.display_image_url || item.image_url"
                      :src="item.display_image_url || item.image_url" :alt="item.raw_product_name"
                      @click="zoomedImage = item.display_image_url || item.image_url"
                      class="w-40 h-48 rounded-lg object-cover border border-card-border cursor-zoom-in" />
                    <div v-else
                      class="w-40 h-48 rounded-lg bg-gray-100 flex items-center justify-center text-text-muted text-[10px]">
                      No image
                    </div>
                  </div>

                  <!-- Product details -->
                  <div class="flex-1 min-w-0 space-y-1 py-0.5">

                    <div class="font-bold text-sm text-text-primary leading-snug">
                      <span>{{ splitTitle(item.raw_product_name).line1 }}</span>
                      <template v-if="splitTitle(item.raw_product_name).line2">
                        <br>
                        <span>{{ splitTitle(item.raw_product_name).line2 }}</span>
                      </template>
                    </div>

                    <div class="text-sm text-text-secondary">
                      Qty: <strong class="text-text-primary">{{ item.quantity }}</strong>
                    </div>

                    <div v-if="item.pc_product_name" class="text-sm font-bold text-text-primary">
                      {{ item.pc_product_name }}
                    </div>

                    <div v-if="item.marketplace_sku" class="text-sm text-text-secondary">
                      SKU: <strong class="font-mono text-text-primary">{{ item.marketplace_sku }}</strong>
                    </div>

                    <div class="space-y-1">
                      <template v-if="item.is_matched">
                        <div v-if="item.pc_variant_size" class="text-sm text-text-secondary">
                          {{ item.pc_variant1_label || 'Size' }}: <strong class="text-text-primary">{{ item.pc_variant_size }}</strong>
                        </div>
                        <div v-if="item.pc_variant_color" class="text-sm text-text-secondary">
                          {{ item.pc_variant2_label || 'Color' }}: <strong class="text-text-primary">{{ item.pc_variant_color }}</strong>
                        </div>
                      </template>
                      <template v-else>
                        <div v-for="[k, v] in formatOptions(item.raw_options)" :key="k"
                          class="text-sm text-text-secondary">
                          {{ k }}: <strong class="text-text-primary">{{ v }}</strong>
                        </div>
                        <div class="text-xs font-semibold text-amber-600">Not matched yet</div>
                      </template>
                    </div>

                    <!-- Personalization (read-only) -->
                    <div v-if="item.personalization" class="text-sm text-text-secondary select-none line-clamp-2">
                      Personalization: <strong class="text-text-primary select-text">{{ item.personalization }}</strong>
                    </div>

                  </div>
                </div>
              </template>

              <!-- Buyer note / Internal note -->
              <div v-if="order.buyer_note || order.internal_note"
                class="border-t border-amber-100 divide-y divide-amber-100">
                <div v-if="order.buyer_note"
                  class="px-4 py-2 bg-amber-50 text-xs text-amber-800 leading-relaxed line-clamp-2">
                  💬 <span class="font-medium">Buyer note:</span> {{ order.buyer_note }}
                </div>
                <div v-if="order.internal_note"
                  class="px-4 py-2 bg-blue-50 text-xs text-blue-800 leading-relaxed line-clamp-2">
                  🔒 <span class="font-medium">Internal note:</span> {{ order.internal_note }}
                </div>
              </div>

              <!-- Completed: label download -->
              <div v-if="mainTab === 'completed' && order.label_url"
                class="px-4 py-3 border-t border-card-border">
                <a :href="order.label_url" target="_blank" class="btn-secondary text-xs py-1.5 px-3">
                  Download Label
                </a>
              </div>

            </div><!-- /items column -->

            <!-- ── Design column (read-only thumbnails) ─────────────────── -->
            <div class="flex-1 min-w-0 flex flex-col divide-y divide-card-border">
              <template v-for="item in order.items" :key="'design-' + item.id">
                <div v-if="Number(item.unit_price) >= 0 && item.is_matched && item.designs?.length"
                  class="flex-1 py-4">
                  <div class="overflow-x-auto px-4 pb-1" style="scrollbar-width:none; -ms-overflow-style:none">
                    <div class="flex gap-3 w-max">
                      <div v-for="design in item.designs" :key="design.id"
                        class="relative shrink-0 w-40 flex flex-col">
                        <div class="relative w-40 h-40 rounded-lg border border-card-border overflow-hidden" :style="CHECKER_BG">
                          <img :src="design.file" :alt="design.print_area_name"
                            class="w-full h-full object-contain cursor-zoom-in"
                            @click="zoomedImage = design.file" />
                        </div>
                        <div class="flex gap-1 mt-1.5">
                          <span class="flex-1 min-w-0 text-center text-[11px] font-semibold text-text-primary bg-gray-100 rounded px-1 py-0.5 truncate">{{ design.print_area_name }}</span>
                          <!-- color_scope only exists on the sub-user's reusable design library — this is the
                               one design actually attached to this order item, no scope concept applies -->
                          <span v-if="design.color_scope" class="flex-1 min-w-0 text-center text-[11px] font-semibold text-text-primary bg-gray-100 rounded px-1 py-0.5 truncate">{{ design.color_scope === 'all' ? 'All' : design.color_scope === 'dark' ? 'Dark' : design.color_scope === 'light' ? 'Light' : design.specific_color }}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </template>
            </div><!-- /design column -->

            <!-- ── Shipping / logistics column (read-only) ───────────────── -->
            <div class="w-64 shrink-0 flex flex-col gap-2 px-4 py-2.5 text-sm">

              <!-- Ship by date + gift icon -->
              <div class="flex items-start justify-between gap-2">
                <div>
                  <div v-if="order.ship_by_date"
                    class="font-bold leading-tight text-sm"
                    :class="isOverdue(order.ship_by_date) ? 'text-red-600' : 'text-text-primary'">
                    <span v-if="isOverdue(order.ship_by_date)" class="mr-0.5">⚠</span>
                    Ship by {{ formatDate(order.ship_by_date) }}
                  </div>
                  <div v-if="order.ordered_at" class="text-text-muted text-xs mt-0.5">
                    Ordered {{ formatDate(order.ordered_at?.slice(0,10)) }}
                  </div>
                </div>
                <span v-if="order.is_gift" title="Gift order" class="w-6 h-6 shrink-0">🎁</span>
              </div>

              <!-- Ship to -->
              <div class="border-t border-card-border pt-3">
                <div class="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-1">Ship to</div>
                <div class="space-y-0.5 text-xs">
                  <div class="font-bold text-text-primary text-[13px]">{{ order.ship_to_name }}</div>
                  <div v-if="order.ship_to_company" class="text-text-secondary">{{ order.ship_to_company }}</div>
                  <div class="text-text-secondary leading-snug">{{ order.ship_to_address1 }}</div>
                  <div v-if="order.ship_to_address2" class="text-text-secondary leading-snug">{{ order.ship_to_address2 }}</div>
                  <div class="text-text-secondary leading-snug">
                    {{ order.ship_to_city }}<span v-if="order.ship_to_state">, {{ order.ship_to_state }}</span>
                    <span v-if="order.ship_to_postal_code"> {{ order.ship_to_postal_code }}</span>
                  </div>
                  <div v-if="order.ship_to_country && order.ship_to_country !== 'US'"
                    class="text-text-muted">{{ order.ship_to_country }}</div>
                  <div v-if="order.address_status === 'validated'"
                    class="text-[11px] font-semibold text-emerald-600 mt-1">✓ Address validated</div>
                  <div v-else-if="order.address_status === 'warning'"
                    class="text-[11px] font-semibold text-amber-600 mt-1"
                    title="ShipStation flagged this address (e.g. apartment/suite not found). A label can still be created — worth a quick check.">
                    ⚠ Address warning — check apt/suite
                  </div>
                  <div v-else-if="order.address_status === 'failed'"
                    class="text-[11px] font-semibold text-red-600 mt-1"
                    title="ShipStation could not validate this address. Please review it before producing.">
                    ✕ Address validation failed
                  </div>
                </div>
              </div>

              <!-- Shipping (requested + selected service) -->
              <div v-if="order.requested_service || order.selected_service_name" class="border-t border-card-border pt-3">
                <div class="text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Shipping</div>
                <div v-if="order.requested_service" class="text-text-muted text-xs mb-0.5 truncate">
                  Requested: {{ order.requested_service }}
                </div>
                <div v-if="mainTab === 'new_orders'" class="flex gap-1 mb-1.5">
                  <button v-for="c in SHIPPING_CATEGORIES" :key="c.value"
                    @click="changeShippingCategory(order, c.value)"
                    :disabled="categoryChangingId === order.id || order.shipping_category === c.value"
                    class="text-[11px] px-2 py-0.5 rounded-full border transition disabled:cursor-default"
                    :class="order.shipping_category === c.value
                      ? 'border-accent bg-accent/10 text-accent font-semibold'
                      : 'border-card-border text-text-muted hover:border-gray-300 hover:text-text-primary'"
                    :title="order.shipping_category === c.value ? '' : `Rush to ${c.label} shipping`">
                    {{ c.label }}
                  </button>
                </div>
                <div v-if="order.selected_service_name" class="flex items-center justify-between gap-2 text-sm">
                  <span class="text-text-primary font-semibold leading-snug truncate">{{ order.selected_service_name }}</span>
                  <span v-if="order.shipping_cost" class="text-emerald-600 font-bold shrink-0">${{ Number(order.shipping_cost).toFixed(2) }}</span>
                </div>
                <div v-else-if="categoryChangingId === order.id" class="text-text-muted text-xs italic">Picking a new rate…</div>
              </div>

              <!-- Tracking (in_production / completed) -->
              <div v-if="(mainTab === 'completed' || mainTab === 'in_production') && order.tracking_number"
                class="border-t border-card-border pt-3">
                <div class="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-1">Tracking</div>
                <a v-if="order.label_url" :href="order.label_url" target="_blank" rel="noopener"
                  class="font-mono text-xs text-accent hover:underline break-all leading-relaxed">
                  {{ order.tracking_number }}
                </a>
                <div v-else class="font-mono text-xs text-text-primary break-all leading-relaxed">
                  {{ order.tracking_number }}
                </div>
              </div>

            </div><!-- /shipping column -->

          </div><!-- /body -->
        </div><!-- /order card -->
      </div><!-- /group -->
    </template>

    <!-- Pagination -->
    <div v-if="!loading && totalPages > 1" class="flex items-center justify-center gap-2 pt-2">
      <button @click="goPage(page - 1)" :disabled="page === 1"
        class="px-3 py-1.5 rounded border border-card-border text-sm disabled:opacity-40 hover:bg-sidebar-bg transition">
        ‹ Prev
      </button>
      <span class="text-sm text-text-secondary">{{ page }} / {{ totalPages }}</span>
      <button @click="goPage(page + 1)" :disabled="page >= totalPages"
        class="px-3 py-1.5 rounded border border-card-border text-sm disabled:opacity-40 hover:bg-sidebar-bg transition">
        Next ›
      </button>
    </div>

    <!-- Image lightbox -->
    <div v-if="zoomedImage" @click="zoomedImage = ''"
      class="fixed inset-0 z-50 bg-black/70 flex items-center justify-center cursor-zoom-out p-8">
      <img :src="zoomedImage" class="max-w-full max-h-full rounded-lg shadow-2xl" />
    </div>

    <!-- Name-the-batch modal -->
    <div v-if="batchNameModal" class="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      @click.self="batchCreating || (batchNameModal = false)">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5 space-y-4">
        <h2 class="font-semibold text-base">Create Batch &amp; Process</h2>
        <p class="text-sm text-text-secondary">
          {{ selectedOrders.length }} order{{ selectedOrders.length === 1 ? '' : 's' }} selected. Labels will be
          bought automatically; any order with a problem is left out and stays in this queue.
        </p>
        <div>
          <label class="text-xs text-text-secondary block mb-1">Batch name (optional)</label>
          <input v-model="batchName" type="text" placeholder="e.g. Oct 1 orders — Part 1"
            class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" autofocus
            @keyup.enter="createBatchAndProcess" />
        </div>
        <div v-if="batchCreateError" class="text-sm text-red-600">{{ batchCreateError }}</div>
        <div class="flex gap-2">
          <button @click="batchNameModal = false" :disabled="batchCreating" class="btn-secondary flex-1 text-sm">
            Cancel
          </button>
          <button @click="createBatchAndProcess" :disabled="batchCreating" class="btn-primary flex-1 text-sm">
            {{ batchCreating ? 'Creating…' : 'Create & Process' }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>
