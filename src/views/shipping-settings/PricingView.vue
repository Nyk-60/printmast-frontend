<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import { shippingApi } from '@/api/endpoints'
import { confirmDialog } from '@/composables/useConfirm'

const loading = ref(true)

const CATEGORIES = [
  { key: 'standard', label: 'Standard Shipping' },
  { key: 'priority', label: 'Priority' },
  { key: 'express',  label: 'Express' },
]

// ── Shipping pricing mode (dynamic live-rate vs. fixed weight-based table) ────
// Two-step: picking a radio only stages the choice — nothing is charged
// differently until "Save" is clicked, so browsing the Fixed table (which
// appears as soon as Fixed is picked, so it can be filled in before commit)
// never silently changes what live sub-users are being charged.

const savedPricingMode  = ref('dynamic')  // what's actually persisted / in effect
const pricingMode       = ref('dynamic')  // staged radio selection
const pricingModeSaving = ref(false)
const pricingModeError  = ref('')
const pricingModeSaved  = ref(false)

const pricingModeDirty = computed(() => pricingMode.value !== savedPricingMode.value)

function selectPricingMode(mode) {
  pricingMode.value = mode
  pricingModeSaved.value = false
}

function cancelPricingModeChange() {
  pricingMode.value = savedPricingMode.value
  pricingModeError.value = ''
}

async function savePricingMode() {
  pricingModeSaving.value = true
  pricingModeError.value  = ''
  try {
    await shippingApi.updatePcShippingSettings({ shipping_pricing_mode: pricingMode.value })
    savedPricingMode.value = pricingMode.value
    pricingModeSaved.value = true
    setTimeout(() => { pricingModeSaved.value = false }, 3000)
  } catch {
    pricingModeError.value = 'Failed to update pricing mode.'
  } finally {
    pricingModeSaving.value = false
  }
}

async function loadPricingMode() {
  try {
    const { data } = await shippingApi.pcShippingSettings()
    savedPricingMode.value = data.shipping_pricing_mode || 'dynamic'
    pricingMode.value      = savedPricingMode.value
  } catch { /* non-fatal */ }
}

// ── Fixed shipping rate table (weight brackets per category) ──────────────────

const fixedRates     = ref([])
const fixedRateError = ref('')
const newFixedRateForms = reactive({
  standard: { min_weight_oz: '', max_weight_oz: '', price: '' },
  priority: { min_weight_oz: '', max_weight_oz: '', price: '' },
  express:  { min_weight_oz: '', max_weight_oz: '', price: '' },
})
const addingFixedRateCategory = ref(null)

async function loadFixedRates() {
  try {
    const { data } = await shippingApi.fixedRates()
    fixedRates.value = data
  } catch { /* non-fatal */ }
}

function fixedRatesForCategory(category) {
  return fixedRates.value.filter(r => r.category === category)
}

async function addFixedRate(category) {
  const form = newFixedRateForms[category]
  if (form.min_weight_oz === '' || form.price === '') return
  fixedRateError.value = ''
  addingFixedRateCategory.value = category
  try {
    const { data } = await shippingApi.createFixedRate({
      category,
      min_weight_oz: form.min_weight_oz,
      max_weight_oz: form.max_weight_oz === '' ? null : form.max_weight_oz,
      price: form.price,
    })
    fixedRates.value.push(data)
    newFixedRateForms[category] = { min_weight_oz: '', max_weight_oz: '', price: '' }
  } catch (e) {
    const d = e?.response?.data
    fixedRateError.value = d?.non_field_errors?.[0] ?? d?.detail ?? Object.values(d ?? {})[0]?.[0] ?? 'Failed to add bracket.'
  } finally {
    addingFixedRateCategory.value = null
  }
}

async function removeFixedRate(rate) {
  const upper = rate.max_weight_oz ?? '∞'
  if (!(await confirmDialog({ title: `Remove the ${rate.min_weight_oz}–${upper} oz bracket ($${rate.price})?`, danger: true }))) return
  try {
    await shippingApi.deleteFixedRate(rate.id)
    fixedRates.value = fixedRates.value.filter(r => r.id !== rate.id)
  } catch {
    fixedRateError.value = 'Failed to remove bracket.'
  }
}

onMounted(async () => {
  loading.value = true
  try {
    await Promise.all([loadPricingMode(), loadFixedRates()])
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="space-y-4">
    <div v-if="loading" class="card p-4 h-24 animate-pulse bg-gray-100" />

    <template v-else>
      <!-- ── Shipping Pricing Mode ──────────────────────────────────────────────── -->
      <div class="card p-5">
        <div class="mb-4">
          <div class="font-semibold">Shipping Pricing Mode</div>
          <div class="text-xs text-text-muted mt-0.5">
            Controls the shipping price shown to and charged from sub-users. This is independent
            of which provider actually buys the label at production time — that always compares
            live to minimize real cost, regardless of this setting.
          </div>
        </div>

        <div v-if="pricingModeError" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 mb-3">
          {{ pricingModeError }}
        </div>

        <div class="grid grid-cols-2 gap-3">
          <button @click="selectPricingMode('dynamic')" :disabled="pricingModeSaving"
            class="text-left rounded-lg border p-3 transition"
            :class="pricingMode === 'dynamic' ? 'border-accent bg-accent/5' : 'border-card-border hover:bg-gray-50'">
            <div class="text-sm font-semibold flex items-center gap-2">
              <span class="w-3 h-3 rounded-full border-2" :class="pricingMode === 'dynamic' ? 'border-accent bg-accent' : 'border-card-border'"></span>
              Dynamic
            </div>
            <div class="text-xs text-text-muted mt-1 ml-5">Live rate + your sub-user markup. Reflects real-time carrier pricing.</div>
          </button>
          <button @click="selectPricingMode('fixed')" :disabled="pricingModeSaving"
            class="text-left rounded-lg border p-3 transition"
            :class="pricingMode === 'fixed' ? 'border-accent bg-accent/5' : 'border-card-border hover:bg-gray-50'">
            <div class="text-sm font-semibold flex items-center gap-2">
              <span class="w-3 h-3 rounded-full border-2" :class="pricingMode === 'fixed' ? 'border-accent bg-accent' : 'border-card-border'"></span>
              Fixed
            </div>
            <div class="text-xs text-text-muted mt-1 ml-5">Flat price by weight bracket (below), + your sub-user markup. Predictable, no live lookup.</div>
          </button>
        </div>

        <!-- Two-step commit: nothing changes for live sub-users until Save is clicked -->
        <div v-if="pricingModeDirty" class="flex items-center gap-2 mt-3 pt-3 border-t border-card-border">
          <button @click="savePricingMode" :disabled="pricingModeSaving"
            class="btn-primary text-xs py-1.5 px-4 disabled:opacity-50">
            {{ pricingModeSaving ? 'Saving…' : 'Save Pricing Mode' }}
          </button>
          <button @click="cancelPricingModeChange" :disabled="pricingModeSaving"
            class="btn-secondary text-xs py-1.5 px-3">Cancel</button>
          <span class="text-xs text-amber-600">Unsaved — still charging via {{ savedPricingMode }} until saved.</span>
        </div>
        <div v-else-if="pricingModeSaved" class="text-xs text-emerald-600 font-medium mt-3 pt-3 border-t border-card-border">
          ✓ Saved — now charging sub-users via {{ savedPricingMode }} pricing.
        </div>
      </div>

      <!-- ── Fixed Shipping Rates (weight brackets — only shown while Fixed is selected) ── -->
      <div v-if="pricingMode === 'fixed'" class="card p-5">
        <div class="mb-4">
          <div class="font-semibold">Fixed Shipping Rates</div>
          <div class="text-xs text-text-muted mt-0.5">
            One flat price per weight range, per category. Brackets can't overlap — leave the
            "up to" weight blank on your top bracket for "and heavier."
            <span v-if="pricingModeDirty" class="text-amber-600">Configure these, then click "Save Pricing Mode" above to go live.</span>
          </div>
        </div>

        <div v-if="fixedRateError" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 mb-3">
          {{ fixedRateError }}
        </div>

        <div class="space-y-5">
          <div v-for="cat in CATEGORIES" :key="cat.key" class="rounded-lg border border-card-border p-3">
            <div class="text-sm font-semibold mb-2">{{ cat.label }}</div>

            <div v-if="fixedRatesForCategory(cat.key).length" class="space-y-1.5 mb-3">
              <div v-for="rate in fixedRatesForCategory(cat.key)" :key="rate.id"
                class="rounded-lg border border-card-border px-3 py-1.5 flex items-center justify-between text-sm">
                <div>
                  <span class="font-medium">{{ rate.min_weight_oz }}–{{ rate.max_weight_oz ?? '∞' }} oz</span>
                  <span class="text-text-muted text-xs ml-2">${{ rate.price }}</span>
                </div>
                <button @click="removeFixedRate(rate)" class="text-xs text-red-500 hover:underline">Remove</button>
              </div>
            </div>
            <div v-else class="text-xs text-text-muted mb-3">No brackets configured for this category yet.</div>

            <!-- Add new bracket -->
            <div class="flex flex-wrap gap-2 items-end">
              <div>
                <label class="text-[10px] text-text-muted block mb-0.5">From (oz)</label>
                <input v-model="newFixedRateForms[cat.key].min_weight_oz" type="number" step="0.01" min="0" placeholder="0"
                  class="rounded-lg border border-card-border px-2 py-1.5 text-xs w-20" />
              </div>
              <div>
                <label class="text-[10px] text-text-muted block mb-0.5">Up to (oz, blank = ∞)</label>
                <input v-model="newFixedRateForms[cat.key].max_weight_oz" type="number" step="0.01" min="0" placeholder="∞"
                  class="rounded-lg border border-card-border px-2 py-1.5 text-xs w-28" />
              </div>
              <div>
                <label class="text-[10px] text-text-muted block mb-0.5">Price ($)</label>
                <input v-model="newFixedRateForms[cat.key].price" type="number" step="0.01" min="0" placeholder="5.00"
                  class="rounded-lg border border-card-border px-2 py-1.5 text-xs w-24" />
              </div>
              <button @click="addFixedRate(cat.key)"
                :disabled="addingFixedRateCategory === cat.key || newFixedRateForms[cat.key].min_weight_oz === '' || newFixedRateForms[cat.key].price === ''"
                class="btn-secondary text-xs py-1.5 px-3 disabled:opacity-50">
                {{ addingFixedRateCategory === cat.key ? '…' : '+ Add' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
