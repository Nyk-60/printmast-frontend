<script setup>
import { ref, computed, watch } from 'vue'
import { reshipApi } from '@/api/endpoints'
import { useAuthStore } from '@/stores/auth'
import iconSelf from '@/assets/icons/reship-self.png'
import iconPc from '@/assets/icons/reship-pc.png'
import iconRefund from '@/assets/icons/refund.png'

const props = defineProps({
  order: { type: Object, default: null },
})
const emit = defineEmits(['close', 'created'])

const auth = useAuthStore()

const REASONS = [
  { value: 'wrong_product',  label: 'Wrong product/color/size sent' },
  { value: 'bad_print',      label: 'Wrong or missing print' },
  { value: 'package_mixup',  label: 'Package mix-up' },
  { value: 'defective',      label: 'Defective item' },
]
const LOST_SHIPMENT = { value: 'lost_shipment', label: 'Lost shipment' }
const reasonOptions = computed(() => {
  const canReportLost = auth.user?.profile?.can_report_lost_shipment
  return canReportLost ? [...REASONS, LOST_SHIPMENT] : REASONS
})

const ADDRESS_FIELDS = [
  'ship_to_name', 'ship_to_company', 'ship_to_address1', 'ship_to_address2',
  'ship_to_city', 'ship_to_state', 'ship_to_postal_code', 'ship_to_country', 'ship_to_phone',
]

const requestType = ref('') // '' | 'reship' | 'refund'
const faultType = ref('') // '' | 'self' | 'pc' — forced to 'pc' when requestType is 'refund'
const selected  = ref({}) // { [itemId]: { checked, quantity, reason, personalization } }
const note      = ref('')
const files     = ref([]) // [{ file, preview }]
const dragOver  = ref(false)
const submitting = ref(false)
const error     = ref('')
const result    = ref(null) // the created ReshipRequest, once submitted — shown instead of the form

const showAddressEdit = ref(false)
const addressEdit = ref({})

function chooseMode(mode) {
  requestType.value = mode === 'refund' ? 'refund' : 'reship'
  faultType.value = mode === 'self' ? 'self' : 'pc'
}

watch(() => props.order, () => {
  requestType.value = ''
  faultType.value = ''
  selected.value = {}
  note.value = ''
  files.value = []
  error.value = ''
  result.value = null
  showAddressEdit.value = false
  addressEdit.value = {}
  if (props.order) {
    for (const it of props.order.items) {
      selected.value[it.id] = { checked: false, quantity: it.quantity, reason: '', personalization: it.personalization || '' }
    }
    for (const f of ADDRESS_FIELDS) {
      addressEdit.value[f] = props.order[f] || ''
    }
  }
})

function toggleItem(item) {
  selected.value[item.id].checked = !selected.value[item.id].checked
}

function clampQuantity(item) {
  const s = selected.value[item.id]
  if (s.quantity < 1) s.quantity = 1
  if (s.quantity > item.quantity) s.quantity = item.quantity
}

const MAX_BYTES = 20 * 1024 * 1024
const ACCEPTED = ['image/jpeg', 'image/png', 'application/pdf']

function addFiles(fileList) {
  error.value = ''
  for (const f of Array.from(fileList || [])) {
    if (!ACCEPTED.includes(f.type) && !/\.(jpe?g|png|pdf)$/i.test(f.name)) {
      error.value = `"${f.name}" is not a JPG, PNG, or PDF file.`
      continue
    }
    if (f.size > MAX_BYTES) {
      error.value = `"${f.name}" is too large (${(f.size / 1024 / 1024).toFixed(1)} MB). Maximum is 20 MB.`
      continue
    }
    files.value.push({
      file: f,
      preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
    })
  }
}

function removeFile(idx) {
  files.value.splice(idx, 1)
}

// Discount/adjustment lines (negative price) aren't reshippable products — same filter OrdersView uses.
const reshippableItems = computed(() =>
  (props.order?.items || []).filter((it) => Number(it.unit_price) >= 0)
)

const selectedItems = computed(() =>
  reshippableItems.value.filter((it) => selected.value[it.id]?.checked)
)

// Only the fields the sub-user actually changed — an untouched address never
// resets the order's "validated" indicator.
const addressOverride = computed(() => {
  if (!showAddressEdit.value || !props.order) return null
  const out = {}
  for (const f of ADDRESS_FIELDS) {
    const v = (addressEdit.value[f] || '').trim()
    if (v && v !== (props.order[f] || '')) out[f] = v
  }
  return Object.keys(out).length ? out : null
})

const submitLabel = computed(() => (faultType.value === 'self' ? 'Create' : 'Send'))

async function submit() {
  error.value = ''
  if (!selectedItems.value.length) {
    error.value = `Select at least one item to ${requestType.value === 'refund' ? 'refund' : 'reship'}.`
    return
  }
  if (faultType.value === 'pc') {
    for (const it of selectedItems.value) {
      if (!selected.value[it.id].reason) {
        error.value = 'Select a reason for every checked item.'
        return
      }
    }
  }

  const items = selectedItems.value.map((it) => {
    const s = selected.value[it.id]
    const personalization = (s.personalization || '').trim()
    return {
      order_item_id: it.id,
      quantity: s.quantity,
      reason: faultType.value === 'pc' ? s.reason : undefined,
      // Only override when it actually differs — otherwise keep the original as-is.
      personalization_override: personalization !== (it.personalization || '') ? personalization : undefined,
    }
  })

  const formData = new FormData()
  formData.append('original_order', props.order.id)
  formData.append('request_type', requestType.value)
  formData.append('fault_type', faultType.value)
  formData.append('items', JSON.stringify(items))
  if (note.value) formData.append('note', note.value)
  if (addressOverride.value) formData.append('address_override', JSON.stringify(addressOverride.value))
  files.value.forEach((f) => formData.append('files', f.file))

  submitting.value = true
  try {
    const { data } = await reshipApi.create(formData)
    emit('created', data)
    result.value = data
  } catch (e) {
    error.value = e?.response?.data?.detail
      || e?.response?.data?.items
      || e?.response?.data?.fault_type
      || e?.response?.data?.address_override
      || 'Failed to create reship request.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="order" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" @click.self="result ? $emit('close') : undefined">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5">

        <!-- Result screen — shown after a successful submit, in place of the form -->
        <template v-if="result">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-xl">Reship request submitted</h3>
            <button @click="$emit('close')" class="text-text-muted hover:text-text-secondary">✕</button>
          </div>

          <div v-if="result.status === 'pending'" class="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-base text-amber-800">
            Sent to the print center for approval. You'll be notified once it's resolved.
          </div>

          <template v-else>
            <div class="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-base text-emerald-800">
              Reship order <span class="font-medium">{{ result.new_order_number }}</span> created — it's in New Orders.
            </div>
            <div v-if="result.shipstation_synced" class="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-base text-emerald-800">
              ✓ Sent to ShipStation.
            </div>
            <div v-else class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-base text-red-700">
              ⚠ Could not be sent to ShipStation ({{ result.shipstation_sync_error }}). The order itself was created and can
              still be sent to print — you (or the print center) can retry the ShipStation push from Reship Requests.
            </div>
          </template>

          <button @click="$emit('close')" class="btn-primary w-full text-lg">Done</button>
        </template>

        <template v-else>
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-xl">Create Reship Request</h3>
          <button @click="$emit('close')" class="text-text-muted hover:text-text-secondary">✕</button>
        </div>
        <div class="text-base text-text-secondary -mt-3">Order {{ order.shipstation_order_number }}</div>

        <div v-if="error" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-base text-red-700">
          {{ error }}
        </div>

        <!-- Step 1: fault type -->
        <div v-if="!requestType" class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button @click="chooseMode('self')"
            class="card p-5 flex flex-col items-center text-center hover:border-accent/50 transition">
            <img :src="iconSelf" class="w-14 h-14 mb-2" />
            <div class="font-semibold text-lg">My mistake</div>
            <div class="text-base text-text-secondary mt-1">No approval needed — charged normally, new rate.</div>
          </button>
          <button @click="chooseMode('pc')"
            class="card p-5 flex flex-col items-center text-center hover:border-accent/50 transition">
            <img :src="iconPc" class="w-14 h-14 mb-2" />
            <div class="font-semibold text-lg">Print center's mistake</div>
            <div class="text-base text-text-secondary mt-1">Sent for approval, free of charge once approved.</div>
          </button>
          <button @click="chooseMode('refund')"
            class="card p-5 flex flex-col items-center text-center hover:border-accent/50 transition">
            <img :src="iconRefund" class="w-14 h-14 mb-2" />
            <div class="font-semibold text-lg">Refund request</div>
            <div class="text-base text-text-secondary mt-1">Customer wants a refund, not a reship — sent for approval, credited to your balance.</div>
          </button>
        </div>

        <!-- Step 2: items + details -->
        <template v-else>
          <button @click="requestType = ''; faultType = ''" class="text-base text-accent hover:underline">‹ Back</button>

          <div class="text-base text-text-secondary">Select the item(s) to {{ requestType === 'refund' ? 'refund' : 'reship' }}</div>

          <div class="space-y-2">
            <div v-for="it in reshippableItems" :key="it.id"
              class="border border-card-border rounded-lg p-3">
              <label class="flex items-center gap-4 cursor-pointer">
                <input type="checkbox" class="accent-accent w-4 h-4 shrink-0" :checked="selected[it.id]?.checked" @change="toggleItem(it)" />
                <img v-if="it.display_image_url" :src="it.display_image_url" class="w-20 h-20 rounded-lg object-cover shrink-0" />
                <div class="min-w-0 flex-1">
                  <div class="text-lg font-medium leading-snug line-clamp-2">{{ it.raw_product_name }}</div>
                  <div v-if="it.pc_product_name" class="text-base text-accent font-medium mt-0.5">{{ it.pc_product_name }}</div>
                  <div class="text-base text-text-secondary mt-1">
                    {{ [it.pc_variant_size, it.pc_variant_color].filter(Boolean).join(' / ') }}
                    · Qty on order: {{ it.quantity }}
                  </div>
                </div>
              </label>

              <div v-if="selected[it.id]?.checked" class="mt-3 pl-9 space-y-2">
                <div class="flex items-center gap-2">
                  <label class="text-base text-text-secondary">{{ requestType === 'refund' ? 'Qty to refund' : 'Qty to reship' }}</label>
                  <input type="number" min="1" :max="it.quantity" v-model.number="selected[it.id].quantity"
                    @change="clampQuantity(it)"
                    class="w-20 rounded-lg border border-card-border px-2 py-1.5 text-base" />
                </div>
                <div v-if="faultType === 'pc'">
                  <select v-model="selected[it.id].reason"
                    class="w-full rounded-lg border border-card-border px-3 py-2 text-base">
                    <option value="">Select a reason…</option>
                    <option v-for="r in reasonOptions" :key="r.value" :value="r.value">{{ r.label }}</option>
                  </select>
                </div>
                <div v-if="requestType !== 'refund'">
                  <label class="text-base text-text-secondary block mb-1">Personalization (optional — edit only if it needs to change)</label>
                  <input type="text" v-model="selected[it.id].personalization"
                    class="w-full rounded-lg border border-card-border px-2 py-1.5 text-base" />
                </div>
              </div>
            </div>
          </div>

          <div>
            <label class="text-base text-text-secondary block mb-1">Note (optional)</label>
            <textarea v-model="note" rows="2"
              class="w-full rounded-lg border border-card-border px-3 py-2 text-base"
              placeholder="Anything else to add…"></textarea>
          </div>

          <div v-if="requestType !== 'refund'" class="border border-card-border rounded-lg">
            <button type="button" @click="showAddressEdit = !showAddressEdit"
              class="w-full flex items-center justify-between px-3 py-2 text-base text-text-secondary">
              <span>Ship to a different / corrected address (optional)</span>
              <span>{{ showAddressEdit ? '▲' : '▼' }}</span>
            </button>
            <div v-if="showAddressEdit" class="px-3 pb-3 space-y-2">
              <input v-model="addressEdit.ship_to_name" placeholder="Full name"
                class="w-full rounded-lg border border-card-border px-2 py-1.5 text-base" />
              <input v-model="addressEdit.ship_to_company" placeholder="Company (optional)"
                class="w-full rounded-lg border border-card-border px-2 py-1.5 text-base" />
              <input v-model="addressEdit.ship_to_address1" placeholder="Address line 1"
                class="w-full rounded-lg border border-card-border px-2 py-1.5 text-base" />
              <input v-model="addressEdit.ship_to_address2" placeholder="Address line 2 (optional)"
                class="w-full rounded-lg border border-card-border px-2 py-1.5 text-base" />
              <div class="grid grid-cols-2 gap-2">
                <input v-model="addressEdit.ship_to_city" placeholder="City"
                  class="rounded-lg border border-card-border px-2 py-1.5 text-base" />
                <input v-model="addressEdit.ship_to_state" placeholder="State"
                  class="rounded-lg border border-card-border px-2 py-1.5 text-base" />
              </div>
              <div class="grid grid-cols-2 gap-2">
                <input v-model="addressEdit.ship_to_postal_code" placeholder="Postal code"
                  class="rounded-lg border border-card-border px-2 py-1.5 text-base" />
                <input v-model="addressEdit.ship_to_country" placeholder="Country (e.g. US)"
                  class="rounded-lg border border-card-border px-2 py-1.5 text-base" />
              </div>
              <input v-model="addressEdit.ship_to_phone" placeholder="Phone (optional)"
                class="w-full rounded-lg border border-card-border px-2 py-1.5 text-base" />
            </div>
          </div>

          <div>
            <label class="text-base text-text-secondary block mb-1">Photos / evidence (optional)</label>
            <div @dragover.prevent="dragOver = true" @dragleave.prevent="dragOver = false"
              @drop.prevent="dragOver = false; addFiles($event.dataTransfer.files)"
              class="border-2 border-dashed rounded-lg p-4 text-center text-base text-text-secondary cursor-pointer transition"
              :class="dragOver ? 'border-accent bg-accent-light/20' : 'border-card-border'"
              @click="$refs.fileInput.click()">
              Drag & drop JPG, PNG, or PDF files here, or click to choose
              <input ref="fileInput" type="file" multiple accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
                class="hidden" @change="addFiles($event.target.files); $event.target.value = ''" />
            </div>
            <div v-if="files.length" class="flex flex-wrap gap-2 mt-2">
              <div v-for="(f, idx) in files" :key="idx" class="relative">
                <img v-if="f.preview" :src="f.preview" class="w-14 h-14 rounded object-cover border border-card-border" />
                <div v-else class="w-14 h-14 rounded border border-card-border flex items-center justify-center text-xs text-text-secondary px-1 text-center">
                  {{ f.file.name }}
                </div>
                <button @click="removeFile(idx)"
                  class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">✕</button>
              </div>
            </div>
          </div>

          <div class="flex gap-3 pt-2">
            <button @click="$emit('close')" class="btn-secondary flex-1 text-lg">Cancel</button>
            <button @click="submit" :disabled="submitting" class="btn-primary flex-1 text-lg">
              {{ submitting ? '…' : submitLabel }}
            </button>
          </div>
        </template>
        </template>

      </div>
    </div>
  </Teleport>
</template>
