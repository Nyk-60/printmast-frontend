<script setup>
import { ref, reactive, onMounted, computed } from 'vue'
import { productionApi, ordersApi } from '@/api/endpoints'

// ── State ─────────────────────────────────────────────────────────────────────

const batches      = ref([])
const queue        = ref([])
const loading      = ref(true)
const error        = ref('')
const success      = ref('')
const expandedId   = ref(null)

// ── Load data ─────────────────────────────────────────────────────────────────

async function loadAll() {
  loading.value = true
  error.value   = ''
  try {
    const [batchRes, queueRes] = await Promise.all([
      productionApi.batches(),
      ordersApi.productionQueue(),
    ])
    batches.value = batchRes.data
    queue.value   = queueRes.data.results ?? queueRes.data
  } catch {
    error.value = 'Failed to load production data.'
  } finally {
    loading.value = false
  }
}

onMounted(loadAll)

// ── Create batch modal ────────────────────────────────────────────────────────

const createModal   = ref(false)
const selectedOrders = ref([])
const batchForm      = reactive({
  sheet_length_inches: 200,
  gang_sheet_dpi:      300,
  margin_inches:       '0.20',
  note:                '',
})
const createLoading  = ref(false)
const createError    = ref('')

function openCreate() {
  selectedOrders.value = []
  createError.value    = ''
  createModal.value    = true
}

function toggleOrder(id) {
  const idx = selectedOrders.value.indexOf(id)
  if (idx === -1) selectedOrders.value.push(id)
  else selectedOrders.value.splice(idx, 1)
}

function selectAll() {
  selectedOrders.value = queue.value.map(o => o.id)
}

async function submitBatch() {
  if (!selectedOrders.value.length) {
    createError.value = 'Select at least one order.'
    return
  }
  createLoading.value = true
  createError.value   = ''
  try {
    await productionApi.createBatch({
      order_ids:           selectedOrders.value,
      sheet_length_inches: batchForm.sheet_length_inches,
      gang_sheet_dpi:      batchForm.gang_sheet_dpi,
      margin_inches:       batchForm.margin_inches,
      note:                batchForm.note,
    })
    success.value       = 'Batch created! Gang sheets are being generated in the background.'
    createModal.value   = false
    loadAll()
  } catch (e) {
    createError.value = e?.response?.data?.detail ?? 'Failed to create batch.'
  } finally {
    createLoading.value = false
  }
}

// ── Complete batch ────────────────────────────────────────────────────────────

const completingId = ref(null)

async function completeBatch(batch) {
  if (!confirm('Mark this batch as completed? Orders will be marked as Shipped.')) return
  completingId.value = batch.id
  error.value        = ''
  try {
    await productionApi.completeBatch(batch.id)
    success.value = 'Batch completed. Orders marked as Shipped.'
    loadAll()
  } catch {
    error.value = 'Failed to complete batch.'
  } finally {
    completingId.value = null
  }
}

// ── Expand batch ──────────────────────────────────────────────────────────────

const batchDetail = ref(null)
const batchDetailLoading = ref(false)

async function toggleExpand(batch) {
  if (expandedId.value === batch.id) {
    expandedId.value   = null
    batchDetail.value  = null
    return
  }
  expandedId.value       = batch.id
  batchDetail.value      = null
  batchDetailLoading.value = true
  try {
    const { data } = await productionApi.batch(batch.id)
    batchDetail.value = data
  } catch {
    error.value = 'Failed to load batch detail.'
  } finally {
    batchDetailLoading.value = false
  }
}

// ── Shipping override modal ───────────────────────────────────────────────────

const overrideModal  = ref(false)
const overrideOrder  = ref(null)
const overrideForm   = reactive({ weight_oz: '', length: '', width: '', height: '', note: '' })
const overrideSaving = ref(false)
const overrideError  = ref('')

function openOverride(order) {
  overrideOrder.value = order
  const ov = order.shipping_override || {}
  overrideForm.weight_oz = ov.weight_oz ?? ''
  overrideForm.length    = ov.length    ?? ''
  overrideForm.width     = ov.width     ?? ''
  overrideForm.height    = ov.height    ?? ''
  overrideForm.note      = ov.note      ?? ''
  overrideError.value    = ''
  overrideModal.value    = true
}

async function saveOverride() {
  overrideSaving.value = true
  overrideError.value  = ''
  try {
    const payload = {
      weight_oz: overrideForm.weight_oz !== '' ? Number(overrideForm.weight_oz) : null,
      length:    overrideForm.length    !== '' ? Number(overrideForm.length)    : null,
      width:     overrideForm.width     !== '' ? Number(overrideForm.width)     : null,
      height:    overrideForm.height    !== '' ? Number(overrideForm.height)    : null,
      note:      overrideForm.note,
    }
    const { data } = await ordersApi.setShippingOverride(overrideOrder.value.id, payload)
    // update queue item in place
    const idx = queue.value.findIndex(o => o.id === overrideOrder.value.id)
    if (idx !== -1) queue.value[idx] = { ...queue.value[idx], shipping_override: data.shipping_override }
    overrideModal.value = false
  } catch (e) {
    overrideError.value = e?.response?.data?.detail ?? 'Failed to save override.'
  } finally {
    overrideSaving.value = false
  }
}

async function clearOverride() {
  overrideSaving.value = true
  overrideError.value  = ''
  try {
    await ordersApi.setShippingOverride(overrideOrder.value.id, { clear: true })
    const idx = queue.value.findIndex(o => o.id === overrideOrder.value.id)
    if (idx !== -1) queue.value[idx] = { ...queue.value[idx], shipping_override: null }
    overrideModal.value = false
  } catch {
    overrideError.value = 'Failed to clear override.'
  } finally {
    overrideSaving.value = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_BADGE = {
  pending:    'bg-amber-100 text-amber-800',
  processing: 'bg-blue-100 text-blue-800',
  ready:      'bg-emerald-100 text-emerald-800',
  completed:  'bg-gray-100 text-gray-600',
  error:      'bg-red-100 text-red-700',
}

function mediaUrl(path) {
  if (!path) return null
  if (path.startsWith('http')) return path
  return `${import.meta.env.VITE_MEDIA_URL || 'http://localhost:8000'}${path}`
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Production</h1>
      <button @click="openCreate" :disabled="!queue.length"
        class="btn-primary text-sm disabled:opacity-50">
        + New Batch ({{ queue.length }} ready)
      </button>
    </div>

    <!-- Feedback -->
    <div v-if="error"   class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex justify-between">
      {{ success }}
      <button @click="success = ''" class="text-emerald-500">✕</button>
    </div>

    <!-- Production queue -->
    <div class="card p-4">
      <h2 class="font-semibold text-sm mb-3">Awaiting Production ({{ queue.length }})</h2>
      <div v-if="loading" class="space-y-2">
        <div v-for="i in 3" :key="i" class="h-10 bg-gray-100 rounded animate-pulse" />
      </div>
      <div v-else-if="!queue.length" class="text-sm text-text-muted text-center py-6">
        No orders waiting for production. Orders will appear here after sub-users send them to print.
      </div>
      <div v-else class="space-y-2">
        <div v-for="o in queue" :key="o.id"
          class="flex items-center justify-between p-3 rounded-lg border border-card-border text-sm">
          <div>
            <span class="font-medium">{{ o.shipstation_order_number }}</span>
            <span class="text-text-secondary ml-2">{{ o.customer_name }}</span>
            <span v-if="o.shipping_override"
              class="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">
              Override ✓
            </span>
          </div>
          <div class="flex items-center gap-3 text-xs text-text-secondary">
            <span>{{ o.store_name }}</span>
            <span>{{ o.items_count }} item(s)</span>
            <button @click.stop="openOverride(o)"
              class="text-[11px] font-medium px-2 py-1 rounded border border-card-border hover:bg-sidebar-bg transition text-text-secondary hover:text-text-primary">
              ⚙ Shipping
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Batches list -->
    <div>
      <h2 class="font-semibold mb-3">Production Batches</h2>
      <div v-if="loading" class="space-y-3">
        <div v-for="i in 2" :key="i" class="card p-4 h-16 animate-pulse bg-gray-100" />
      </div>
      <div v-else-if="!batches.length" class="card p-8 text-center text-text-muted text-sm">
        No batches yet. Create one from the orders above.
      </div>
      <div v-else class="space-y-3">
        <div v-for="batch in batches" :key="batch.id" class="card overflow-hidden">
          <!-- Batch header -->
          <div class="flex items-center justify-between p-4 cursor-pointer hover:bg-sidebar-bg/40 transition"
            @click="toggleExpand(batch)">
            <div class="flex items-center gap-3">
              <span class="font-semibold text-sm">Batch #{{ batch.id }}</span>
              <span class="badge text-xs" :class="STATUS_BADGE[batch.status] ?? 'bg-gray-100'">
                {{ batch.status }}
              </span>
              <span class="text-xs text-text-secondary">{{ batch.batch_orders?.length ?? '?' }} orders</span>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-xs text-text-secondary">{{ batch.created_at?.slice(0, 10) }}</span>
              <button v-if="batch.status === 'ready'" @click.stop="completeBatch(batch)"
                :disabled="completingId === batch.id"
                class="btn-primary text-xs py-1 px-3">
                {{ completingId === batch.id ? '…' : '✓ Complete' }}
              </button>
              <svg class="w-4 h-4 text-text-muted transition-transform"
                :class="expandedId === batch.id ? 'rotate-180' : ''"
                viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M19 9l-7 7-7-7" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            </div>
          </div>

          <!-- Batch detail -->
          <div v-if="expandedId === batch.id" class="border-t border-card-border">
            <div v-if="batchDetailLoading" class="p-6 text-center text-text-secondary text-sm">Loading…</div>
            <div v-else-if="batchDetail" class="p-4 space-y-5">

              <!-- Error message -->
              <div v-if="batchDetail.error_message"
                class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                Error: {{ batchDetail.error_message }}
              </div>

              <!-- Settings row -->
              <div class="grid grid-cols-3 gap-3 text-xs text-text-secondary">
                <div>Sheet length: <b class="text-text-primary">{{ batchDetail.sheet_length_inches }}"</b></div>
                <div>DPI: <b class="text-text-primary">{{ batchDetail.gang_sheet_dpi }}</b></div>
                <div>Margin: <b class="text-text-primary">{{ batchDetail.margin_inches }}"</b></div>
              </div>

              <!-- Gang sheets -->
              <div v-if="batchDetail.gang_sheets?.length">
                <div class="text-sm font-medium mb-2">Gang Sheets ({{ batchDetail.gang_sheets.length }})</div>
                <div class="flex flex-wrap gap-3">
                  <a v-for="sheet in batchDetail.gang_sheets" :key="sheet.id"
                    :href="mediaUrl(sheet.file)" target="_blank"
                    class="flex flex-col items-center gap-1 p-3 rounded-lg border border-card-border hover:border-accent/50 transition text-xs">
                    <div class="text-2xl">🖼</div>
                    <div class="font-medium">Sheet {{ sheet.sheet_number }}</div>
                    <div class="text-text-secondary">{{ sheet.width_inches }}" × {{ sheet.length_inches }}"</div>
                    <span class="badge bg-accent-light text-accent-dark">Download PNG</span>
                  </a>
                </div>
              </div>

              <!-- Order slips -->
              <div v-if="batchDetail.slip_pdfs?.length">
                <div class="text-sm font-medium mb-2">Order Slips ({{ batchDetail.slip_pdfs.length }})</div>
                <div class="flex flex-wrap gap-2">
                  <a v-for="slip in batchDetail.slip_pdfs" :key="slip.id"
                    :href="mediaUrl(slip.file)" target="_blank"
                    class="flex items-center gap-2 px-3 py-2 rounded-lg border border-card-border hover:border-accent/50 transition text-xs">
                    <span>📄</span>
                    <span>Sheet {{ slip.sheet_number }} — Order Slip PDF</span>
                  </a>
                </div>
              </div>

              <!-- Orders in batch -->
              <div>
                <div class="text-sm font-medium mb-2">Orders ({{ batchDetail.batch_orders?.length }})</div>
                <table class="w-full text-xs">
                  <thead>
                    <tr class="text-text-secondary bg-sidebar-bg">
                      <th class="text-left px-3 py-2">#</th>
                      <th class="text-left px-3 py-2">Order</th>
                      <th class="text-left px-3 py-2">Customer</th>
                      <th class="text-left px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="bo in batchDetail.batch_orders" :key="bo.id"
                      class="border-t border-card-border">
                      <td class="px-3 py-2 text-text-muted">{{ bo.sequence_number }}</td>
                      <td class="px-3 py-2 font-mono font-medium">{{ bo.order_number }}</td>
                      <td class="px-3 py-2 text-text-secondary">{{ bo.customer }}</td>
                      <td class="px-3 py-2">
                        <span class="badge text-xs" :class="STATUS_BADGE[bo.status] ?? 'bg-gray-100'">{{ bo.status }}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Create batch modal -->
  <Teleport to="body">
    <div v-if="createModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      >
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div class="flex items-center justify-between px-5 py-4 border-b border-card-border">
          <h3 class="font-semibold">Create Production Batch</h3>
          <button @click="createModal = false" class="text-text-muted hover:text-text-primary">✕</button>
        </div>

        <div class="flex-1 overflow-y-auto p-5 space-y-5">
          <div v-if="createError"
            class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {{ createError }}
          </div>

          <!-- Select orders -->
          <div>
            <div class="flex items-center justify-between mb-2">
              <label class="text-sm font-medium">Select Orders ({{ selectedOrders.length }} selected)</label>
              <button @click="selectAll" class="text-xs text-accent hover:underline">Select All</button>
            </div>
            <div class="space-y-1 max-h-48 overflow-y-auto rounded-lg border border-card-border p-2">
              <label v-for="o in queue" :key="o.id"
                class="flex items-center gap-3 p-2 rounded hover:bg-sidebar-bg cursor-pointer">
                <input type="checkbox"
                  :checked="selectedOrders.includes(o.id)"
                  @change="toggleOrder(o.id)"
                  class="accent-accent" />
                <div class="text-sm">
                  <span class="font-medium">{{ o.shipstation_order_number }}</span>
                  <span class="text-text-secondary ml-2">{{ o.customer_name }}</span>
                  <span class="text-text-muted ml-2 text-xs">{{ o.items_count }} item(s)</span>
                </div>
              </label>
            </div>
          </div>

          <!-- Batch settings -->
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="text-xs text-text-secondary block mb-1">Sheet Length (inches)</label>
              <select v-model="batchForm.sheet_length_inches"
                class="w-full rounded-lg border border-card-border px-3 py-2 text-sm">
                <option v-for="l in [100, 200, 250, 300, 350, 400]" :key="l" :value="l">{{ l }}"</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-text-secondary block mb-1">DPI</label>
              <select v-model="batchForm.gang_sheet_dpi"
                class="w-full rounded-lg border border-card-border px-3 py-2 text-sm">
                <option value="150">150 dpi</option>
                <option value="300">300 dpi (recommended)</option>
                <option value="600">600 dpi</option>
              </select>
            </div>
            <div>
              <label class="text-xs text-text-secondary block mb-1">Margin (inches)</label>
              <input v-model="batchForm.margin_inches" type="number" step="0.05" min="0" max="1"
                class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label class="text-xs text-text-secondary block mb-1">Note (optional)</label>
              <input v-model="batchForm.note" type="text" placeholder="Internal note…"
                class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
            </div>
          </div>
        </div>

        <div class="px-5 py-4 border-t border-card-border flex gap-3">
          <button @click="createModal = false" class="btn-secondary flex-1 text-sm">Cancel</button>
          <button @click="submitBatch" :disabled="createLoading"
            class="btn-primary flex-1 text-sm">
            {{ createLoading ? 'Creating…' : `Generate Gang Sheets (${selectedOrders.length} orders)` }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ── Shipping Override Modal ─────────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="overrideModal"
      class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      @click.self="overrideModal = false">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-card-border">
          <div>
            <div class="font-bold text-text-primary">Shipping Override</div>
            <div class="text-xs text-text-muted mt-0.5">{{ overrideOrder?.shipstation_order_number }} — {{ overrideOrder?.customer_name }}</div>
          </div>
          <button @click="overrideModal = false" class="text-text-muted hover:text-text-primary text-lg">✕</button>
        </div>

        <!-- Auto-calculated reference -->
        <div v-if="overrideOrder?.shipping_dims_auto"
          class="mx-5 mt-4 px-4 py-3 rounded-lg bg-blue-50 border border-blue-100 text-xs text-blue-800 space-y-1">
          <div class="font-semibold mb-1">Auto-calculated (reference)</div>
          <div>Weight: <span class="font-mono">{{ overrideOrder.shipping_dims_auto.weight_oz }} oz</span></div>
          <div>Dims: <span class="font-mono">{{ overrideOrder.shipping_dims_auto.length }}" × {{ overrideOrder.shipping_dims_auto.width }}" × {{ overrideOrder.shipping_dims_auto.height }}"</span></div>
        </div>

        <!-- Override form -->
        <div class="px-5 py-4 space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs text-text-secondary block mb-1">Weight (oz)</label>
              <input v-model="overrideForm.weight_oz" type="number" step="0.01" placeholder="e.g. 36"
                class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
            </div>
            <div />
            <div>
              <label class="text-xs text-text-secondary block mb-1">Length (in)</label>
              <input v-model="overrideForm.length" type="number" step="0.01" placeholder="e.g. 12"
                class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label class="text-xs text-text-secondary block mb-1">Width (in)</label>
              <input v-model="overrideForm.width" type="number" step="0.01" placeholder="e.g. 10"
                class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
            </div>
            <div>
              <label class="text-xs text-text-secondary block mb-1">Height (in)</label>
              <input v-model="overrideForm.height" type="number" step="0.01" placeholder="e.g. 2"
                class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label class="text-xs text-text-secondary block mb-1">Note (optional)</label>
            <input v-model="overrideForm.note" type="text" placeholder="e.g. includes external item +18oz"
              class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
          </div>
          <div v-if="overrideError" class="text-xs text-red-600">{{ overrideError }}</div>
        </div>

        <!-- Actions -->
        <div class="px-5 py-4 border-t border-card-border flex gap-3">
          <button v-if="overrideOrder?.shipping_override"
            @click="clearOverride" :disabled="overrideSaving"
            class="text-xs font-medium px-3 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition disabled:opacity-50">
            Clear Override
          </button>
          <div class="flex-1" />
          <button @click="overrideModal = false" class="btn-secondary text-sm">Cancel</button>
          <button @click="saveOverride" :disabled="overrideSaving" class="btn-primary text-sm">
            {{ overrideSaving ? 'Saving…' : 'Save Override' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
