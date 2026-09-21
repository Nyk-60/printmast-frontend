<script setup>
import { ref, reactive, onMounted, onUnmounted, computed, watch } from 'vue'
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

// Quietly refresh while something is running in the background (labels being bought,
// sheets being built) so progress and problems show up without reloading the page.
const RUNNING = ['pending', 'labeling', 'processing']
let pollTimer = null

async function refreshRunning() {
  if (!batches.value.some(b => RUNNING.includes(b.status)) && !(batchDetail.value && RUNNING.includes(batchDetail.value.status))) return
  try {
    const { data } = await productionApi.batches()
    batches.value = data
    if (expandedId.value) {
      const detail = await productionApi.batch(expandedId.value)
      batchDetail.value = detail.data
    }
    if (!data.some(b => RUNNING.includes(b.status))) {
      const queueRes = await ordersApi.productionQueue()
      queue.value = queueRes.data.results ?? queueRes.data
    }
  } catch { /* transient — try again on the next tick */ }
}

onMounted(() => {
  loadAll()
  pollTimer = setInterval(refreshRunning, 4000)
})
onUnmounted(() => clearInterval(pollTimer))

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
const preflightReport  = ref(null)
const preflightLoading = ref(false)

watch(selectedOrders, () => { preflightReport.value = null }, { deep: true })

function openCreate() {
  selectedOrders.value  = []
  createError.value     = ''
  preflightReport.value = null
  createModal.value     = true
}

const PROBLEM_STYLE = {
  error:   'bg-red-50 border-red-200 text-red-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
}

async function runPreflight() {
  if (!selectedOrders.value.length) { createError.value = 'Select at least one order.'; return }
  preflightLoading.value = true
  createError.value      = ''
  try {
    const { data } = await productionApi.preflight({
      order_ids: selectedOrders.value,
      sheet_length_inches: batchForm.sheet_length_inches,
      margin_inches: batchForm.margin_inches,
    })
    preflightReport.value = data
  } catch (e) {
    createError.value = e?.response?.data?.detail ?? 'Could not check the orders.'
  } finally {
    preflightLoading.value = false
  }
}

const blockedCount = computed(() => preflightReport.value?.blocked_ids?.length ?? 0)
const okCount      = computed(() => preflightReport.value?.ok_ids?.length ?? 0)

function toggleOrder(id) {
  const idx = selectedOrders.value.indexOf(id)
  if (idx === -1) selectedOrders.value.push(id)
  else selectedOrders.value.splice(idx, 1)
}

function selectAll() {
  selectedOrders.value = queue.value.map(o => o.id)
}

async function submitBatch(skipInvalid = false) {
  if (!selectedOrders.value.length) {
    createError.value = 'Select at least one order.'
    return
  }
  createLoading.value = true
  createError.value   = ''
  try {
    const { data } = await productionApi.createBatch({
      order_ids:           selectedOrders.value,
      sheet_length_inches: batchForm.sheet_length_inches,
      gang_sheet_dpi:      batchForm.gang_sheet_dpi,
      margin_inches:       batchForm.margin_inches,
      note:                batchForm.note,
      skip_invalid:        skipInvalid,
    })
    const left = data.left_out?.length ?? 0
    success.value = 'Batch created — labels are being bought now' +
      (left ? `; ${left} order(s) with problems were left out and stay in the queue.` : '.')
    createModal.value = false
    await loadAll()
    const created = batches.value.find(b => b.id === data.id)
    if (created) toggleExpand(created)
  } catch (e) {
    const d = e?.response?.data
    if (d?.preflight) preflightReport.value = d.preflight
    createError.value = d?.detail ?? 'Failed to create batch.'
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

// ── Recovery actions ──────────────────────────────────────────────────────────

const actionBusy = ref('')

async function refreshList() {
  const { data } = await productionApi.batches()
  batches.value = data
}

async function runBatchAction(batch, action, confirmText) {
  if (confirmText && !confirm(confirmText)) return
  actionBusy.value = action
  error.value      = ''
  try {
    const { data } = await productionApi.batchAction(batch.id, action)
    batchDetail.value = data
    await refreshList()
  } catch (e) {
    error.value = e?.response?.data?.detail ?? 'Action failed.'
  } finally {
    actionBusy.value = ''
  }
}

async function runOrderAction(batch, bo, action, confirmText) {
  if (confirmText && !confirm(confirmText)) return
  actionBusy.value = `${action}-${bo.order}`
  error.value      = ''
  try {
    const { data } = await productionApi.orderAction(batch.id, bo.order, action)
    batchDetail.value = data
    await refreshList()
  } catch (e) {
    error.value = e?.response?.data?.detail ?? 'Action failed.'
  } finally {
    actionBusy.value = ''
  }
}

const LABEL_BADGE = {
  pending:      'bg-gray-100 text-gray-600',
  labeled:      'bg-emerald-100 text-emerald-800',
  failed:       'bg-red-100 text-red-700',
  needs_review: 'bg-amber-100 text-amber-800',
  removed:      'bg-gray-100 text-gray-400 line-through',
}
const LABEL_TEXT = {
  pending: 'Waiting', labeled: 'Labeled', failed: 'Failed', needs_review: 'Needs review', removed: 'Removed',
}
const KIND_HINT = {
  data:      'Fix the order (address, weight, products), then Retry.',
  account:   'Provider account problem — fix it (balance / credentials), then Retry.',
  transient: 'Temporary problem — Retry.',
  ambiguous: 'Outcome unknown. Use "Check with provider" — nothing is bought again until this is settled.',
  other:     'Review the message, then Retry or Remove.',
}

const unresolved = computed(() =>
  (batchDetail.value?.batch_orders ?? []).filter(bo => ['failed', 'needs_review'].includes(bo.label_status)))

// ── Address fix modal ─────────────────────────────────────────────────────────

const addrModal  = ref(false)
const addrTarget = ref(null)
const addrForm   = reactive({
  ship_to_name: '', ship_to_company: '', ship_to_address1: '', ship_to_address2: '',
  ship_to_city: '', ship_to_state: '', ship_to_postal_code: '', ship_to_country: 'US',
})
const addrSaving = ref(false)
const addrError  = ref('')

function openAddress(bo) {
  addrTarget.value = bo
  Object.assign(addrForm, bo.ship_to)
  addrError.value = ''
  addrModal.value = true
}

async function saveAddress(retryAfter) {
  addrSaving.value = true
  addrError.value  = ''
  try {
    await ordersApi.pcUpdateAddress(addrTarget.value.order, { ...addrForm })
    addrModal.value = false
    const batch = batches.value.find(b => b.id === expandedId.value)
    if (retryAfter && addrTarget.value.label_status === 'failed' && batch) {
      await runOrderAction(batch, addrTarget.value, 'retry')
    } else {
      const { data } = await productionApi.batch(expandedId.value)
      batchDetail.value = data
    }
  } catch (e) {
    const d = e?.response?.data
    addrError.value = d?.detail ?? Object.values(d ?? {})[0]?.[0] ?? 'Failed to save the address.'
  } finally {
    addrSaving.value = false
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
  pending:         'bg-amber-100 text-amber-800',
  labeling:        'bg-blue-100 text-blue-800',
  needs_attention: 'bg-red-100 text-red-700',
  processing:      'bg-blue-100 text-blue-800',
  ready:           'bg-emerald-100 text-emerald-800',
  completed:       'bg-gray-100 text-gray-600',
  failed:          'bg-red-100 text-red-700',
  error:           'bg-red-100 text-red-700',
}
const STATUS_LABEL = {
  pending: 'Queued', labeling: 'Buying labels', needs_attention: 'Needs attention',
  processing: 'Building sheets', ready: 'Ready', completed: 'Completed', failed: 'Failed',
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
            <span v-if="o.address_status === 'warning'" class="ml-2 text-[11px] text-amber-600" title="ShipStation flagged this address">⚠</span>
            <span v-else-if="o.address_status === 'failed'" class="ml-2 text-[11px] text-red-600" title="Address validation failed">✕</span>
          </div>
          <div class="flex items-center gap-3 text-xs text-text-secondary">
            <span>{{ o.store_name }}</span>
            <span>{{ o.items?.length ?? 0 }} item(s)</span>
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
                {{ STATUS_LABEL[batch.status] ?? batch.status }}
              </span>
              <span class="text-xs text-text-secondary">
                {{ batch.counts?.labeled ?? 0 }}/{{ batch.counts?.total ?? 0 }} labeled
                <template v-if="batch.counts?.failed"> · <b class="text-red-600">{{ batch.counts.failed }} failed</b></template>
                <template v-if="batch.counts?.needs_review"> · <b class="text-amber-600">{{ batch.counts.needs_review }} to review</b></template>
              </span>
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
                <button v-if="batchDetail.status === 'failed' && batchDetail.counts?.labeled"
                  @click="runBatchAction(batchDetail, 'rebuild')" :disabled="!!actionBusy"
                  class="ml-3 underline font-medium">Rebuild sheets (free)</button>
              </div>

              <!-- Progress while labels are being bought -->
              <div v-if="['pending', 'labeling', 'processing'].includes(batchDetail.status)"
                class="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-sm text-blue-800">
                <template v-if="batchDetail.status === 'processing'">Building gang sheets and slips…</template>
                <template v-else>
                  Buying labels — {{ batchDetail.counts.labeled }} of {{ batchDetail.counts.total }} done.
                  An order that fails never holds the others up.
                </template>
                <div class="h-1.5 bg-blue-100 rounded mt-2 overflow-hidden">
                  <div class="h-full bg-blue-500 transition-all"
                    :style="{ width: (batchDetail.counts.total ? (batchDetail.counts.labeled / batchDetail.counts.total) * 100 : 0) + '%' }" />
                </div>
              </div>

              <!-- Paused / needs attention -->
              <div v-if="batchDetail.status === 'needs_attention'"
                class="rounded-lg bg-amber-50 border border-amber-200 px-3 py-3 text-sm text-amber-900 space-y-2">
                <div class="font-semibold">
                  {{ batchDetail.counts.labeled }} labeled · {{ batchDetail.counts.failed }} failed
                  <template v-if="batchDetail.counts.needs_review"> · {{ batchDetail.counts.needs_review }} to review</template>
                  <template v-if="batchDetail.counts.pending"> · {{ batchDetail.counts.pending }} waiting</template>
                </div>
                <div v-if="batchDetail.paused_reason">{{ batchDetail.paused_reason }}</div>
                <div class="text-xs">
                  Gang sheets are built once every order is settled. Only orders with a label are ever printed —
                  fix the problems below, or continue without them.
                </div>
                <div class="flex flex-wrap gap-2 pt-1">
                  <button @click="runBatchAction(batchDetail, 'retry-failed')"
                    :disabled="!!actionBusy || (!batchDetail.counts.failed && !batchDetail.counts.pending)"
                    class="btn-primary text-xs py-1.5 px-3 disabled:opacity-50">↻ Retry failed</button>
                  <button v-if="batchDetail.counts.labeled"
                    @click="runBatchAction(batchDetail, 'continue', 'Leave the unresolved orders out and build the sheets from the orders that have a label? The left-out orders return to the Awaiting Production queue for a later batch.')"
                    :disabled="!!actionBusy"
                    class="btn-secondary text-xs py-1.5 px-3 disabled:opacity-50">Continue without the rest</button>
                </div>
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
                <div class="text-sm font-medium mb-2">
                  Orders ({{ batchDetail.counts?.total }})
                  <span v-if="unresolved.length" class="text-red-600 font-normal">— {{ unresolved.length }} need attention</span>
                </div>
                <div class="overflow-x-auto">
                <table class="w-full text-xs">
                  <thead>
                    <tr class="text-text-secondary bg-sidebar-bg">
                      <th class="text-left px-3 py-2">#</th>
                      <th class="text-left px-3 py-2">Order</th>
                      <th class="text-left px-3 py-2">Customer</th>
                      <th class="text-left px-3 py-2">Store</th>
                      <th class="text-left px-3 py-2">Label</th>
                      <th class="text-left px-3 py-2">Details / actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <template v-for="bo in batchDetail.batch_orders" :key="bo.id">
                    <tr class="border-t border-card-border align-top">
                      <td class="px-3 py-2 text-text-muted">{{ bo.sequence_number || '—' }}</td>
                      <td class="px-3 py-2 font-mono font-medium">{{ bo.order_number }}</td>
                      <td class="px-3 py-2 text-text-secondary">{{ bo.customer }}</td>
                      <td class="px-3 py-2 text-text-secondary">{{ bo.store_name }}</td>
                      <td class="px-3 py-2">
                        <span class="badge text-xs" :class="LABEL_BADGE[bo.label_status] ?? 'bg-gray-100'">
                          {{ LABEL_TEXT[bo.label_status] ?? bo.label_status }}
                        </span>
                      </td>
                      <td class="px-3 py-2 space-y-1.5">
                        <div v-if="bo.label_status === 'labeled'" class="text-text-secondary">
                          <span class="font-mono">{{ bo.tracking_number }}</span>
                          <span v-if="bo.label_cost" class="ml-2">${{ bo.label_cost }}</span>
                        </div>
                        <template v-else-if="bo.label_status === 'failed' || bo.label_status === 'needs_review'">
                          <div class="text-red-700 break-words">{{ bo.error_message }}</div>
                          <div class="text-text-muted">{{ KIND_HINT[bo.error_kind] ?? KIND_HINT.other }}</div>
                          <div v-if="bo.address_status !== 'validated'" class="text-amber-600">
                            Address status: {{ bo.address_status }}
                          </div>
                        </template>
                        <div v-if="['failed', 'needs_review', 'pending'].includes(bo.label_status) && ['needs_attention', 'failed'].includes(batchDetail.status)"
                          class="flex flex-wrap gap-1.5">
                          <button v-if="bo.label_status !== 'needs_review'" @click="openAddress(bo)"
                            class="px-2 py-1 rounded border border-card-border hover:bg-sidebar-bg">Fix address</button>
                          <button v-if="bo.label_status === 'failed'"
                            @click="runOrderAction(batchDetail, bo, 'retry')" :disabled="!!actionBusy"
                            class="px-2 py-1 rounded bg-accent text-white disabled:opacity-50">Retry</button>
                          <button v-if="bo.label_status === 'needs_review'"
                            @click="runOrderAction(batchDetail, bo, 'reconcile')" :disabled="!!actionBusy"
                            class="px-2 py-1 rounded bg-amber-500 text-white disabled:opacity-50">Check with provider</button>
                          <button
                            @click="runOrderAction(batchDetail, bo, 'remove', 'Remove this order from the batch? It goes back to the Awaiting Production queue.')"
                            :disabled="!!actionBusy"
                            class="px-2 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50">Remove</button>
                        </div>
                      </td>
                    </tr>
                    </template>
                  </tbody>
                </table>
                </div>
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
                  <span class="text-text-muted ml-2 text-xs">{{ o.items?.length ?? 0 }} item(s)</span>
                </div>
              </label>
            </div>
          </div>

          <!-- Pre-flight report -->
          <div v-if="preflightReport" class="space-y-2">
            <div class="text-sm font-medium">
              Check result:
              <span class="text-emerald-700">{{ okCount }} ready</span>
              <span v-if="blockedCount" class="text-red-600"> · {{ blockedCount }} with problems</span>
            </div>
            <div v-for="n in preflightReport.batch" :key="n.code"
              class="rounded-lg border px-3 py-2 text-xs" :class="PROBLEM_STYLE[n.severity]">{{ n.message }}</div>
            <div v-for="r in preflightReport.orders" :key="r.order_id"
              class="rounded-lg border border-card-border px-3 py-2 text-xs space-y-1">
              <div class="font-medium">{{ r.order_number }} <span class="text-text-muted font-normal">— {{ r.customer }} · {{ r.store }}</span></div>
              <div v-for="p in r.problems" :key="p.code + p.message"
                class="rounded border px-2 py-1" :class="PROBLEM_STYLE[p.severity]">{{ p.message }}</div>
            </div>
            <div v-if="!preflightReport.orders.length && !preflightReport.batch.length"
              class="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-700">
              Everything looks good — nothing was bought or changed by this check.
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
          <button @click="createModal = false" class="btn-secondary text-sm">Cancel</button>
          <button @click="runPreflight" :disabled="preflightLoading || !selectedOrders.length"
            class="btn-secondary flex-1 text-sm disabled:opacity-50">
            {{ preflightLoading ? 'Checking…' : 'Check orders' }}
          </button>
          <button v-if="blockedCount && okCount" @click="submitBatch(true)" :disabled="createLoading"
            class="btn-primary flex-1 text-sm">
            {{ createLoading ? 'Creating…' : `Create without the ${blockedCount} problem order(s)` }}
          </button>
          <button v-else-if="!blockedCount" @click="submitBatch(false)" :disabled="createLoading || !selectedOrders.length"
            class="btn-primary flex-1 text-sm disabled:opacity-50">
            {{ createLoading ? 'Creating…' : `Create batch (${selectedOrders.length} orders)` }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ── Fix delivery address ───────────────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="addrModal" class="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      @click.self="addrModal = false">
      <div class="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div class="flex items-center justify-between px-5 py-4 border-b border-card-border">
          <div>
            <div class="font-bold text-text-primary">Fix delivery address</div>
            <div class="text-xs text-text-muted mt-0.5">{{ addrTarget?.order_number }} — {{ addrTarget?.customer }}</div>
          </div>
          <button @click="addrModal = false" class="text-text-muted hover:text-text-primary text-lg">✕</button>
        </div>
        <div class="px-5 py-4 space-y-3 text-sm">
          <div v-if="addrTarget?.error_message" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {{ addrTarget.error_message }}
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div class="col-span-2">
              <label class="text-xs text-text-secondary block mb-1">Name</label>
              <input v-model="addrForm.ship_to_name" type="text" class="w-full rounded-lg border border-card-border px-3 py-2" />
            </div>
            <div class="col-span-2">
              <label class="text-xs text-text-secondary block mb-1">Street</label>
              <input v-model="addrForm.ship_to_address1" type="text" class="w-full rounded-lg border border-card-border px-3 py-2" />
            </div>
            <div class="col-span-2">
              <label class="text-xs text-text-secondary block mb-1">Apt / Suite</label>
              <input v-model="addrForm.ship_to_address2" type="text" class="w-full rounded-lg border border-card-border px-3 py-2" />
            </div>
            <div>
              <label class="text-xs text-text-secondary block mb-1">City</label>
              <input v-model="addrForm.ship_to_city" type="text" class="w-full rounded-lg border border-card-border px-3 py-2" />
            </div>
            <div>
              <label class="text-xs text-text-secondary block mb-1">State</label>
              <input v-model="addrForm.ship_to_state" type="text" class="w-full rounded-lg border border-card-border px-3 py-2" />
            </div>
            <div>
              <label class="text-xs text-text-secondary block mb-1">ZIP</label>
              <input v-model="addrForm.ship_to_postal_code" type="text" class="w-full rounded-lg border border-card-border px-3 py-2" />
            </div>
            <div>
              <label class="text-xs text-text-secondary block mb-1">Country</label>
              <input v-model="addrForm.ship_to_country" type="text" maxlength="2" class="w-full rounded-lg border border-card-border px-3 py-2" />
            </div>
          </div>
          <div class="text-[11px] text-text-muted">The change is also sent to ShipStation. Only possible before the label is bought.</div>
          <div v-if="addrError" class="text-xs text-red-600">{{ addrError }}</div>
        </div>
        <div class="px-5 py-4 border-t border-card-border flex gap-3">
          <div class="flex-1" />
          <button @click="addrModal = false" class="btn-secondary text-sm">Cancel</button>
          <button @click="saveAddress(false)" :disabled="addrSaving" class="btn-secondary text-sm">Save</button>
          <button v-if="addrTarget?.label_status === 'failed'" @click="saveAddress(true)" :disabled="addrSaving"
            class="btn-primary text-sm">{{ addrSaving ? 'Saving…' : 'Save & retry label' }}</button>
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
