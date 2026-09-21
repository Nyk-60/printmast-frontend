<script setup>
import { ref, onMounted } from 'vue'
import { shippingApi } from '@/api/endpoints'

const CATEGORIES = [
  { key: 'standard', label: 'Standard Shipping', hint: 'Used when the marketplace requests standard/ground shipping.' },
  { key: 'priority', label: 'Priority', hint: 'Used when the marketplace requests priority/expedited shipping.' },
  { key: 'express',  label: 'Express', hint: 'Used when the marketplace requests express/overnight shipping.' },
]

const options  = ref([])   // print center's active service options
const defaults = ref([])   // current default per category
const loading  = ref(true)
const error    = ref('')
const success  = ref('')
const savingCategory = ref(null)

function optionsForCategory(category) {
  return options.value.filter(o => o.category === category)
}

function defaultFor(category) {
  return defaults.value.find(d => d.category === category)
}

async function loadAll() {
  loading.value = true
  error.value   = ''
  try {
    const [optRes, defRes] = await Promise.all([
      shippingApi.myServiceOptions(),
      shippingApi.myServiceDefaults(),
    ])
    options.value  = optRes.data.results ?? optRes.data
    defaults.value = defRes.data.results ?? defRes.data
  } catch {
    error.value = 'Failed to load shipping settings.'
  } finally {
    loading.value = false
  }
}

onMounted(loadAll)

async function setDefault(category, serviceOptionId) {
  savingCategory.value = category
  error.value = ''
  try {
    const { data } = await shippingApi.setMyServiceDefault({
      category,
      service_option: serviceOptionId,
    })
    const idx = defaults.value.findIndex(d => d.category === category)
    if (idx !== -1) defaults.value[idx] = data
    else defaults.value.push(data)
    success.value = 'Default updated.'
    setTimeout(() => { success.value = '' }, 2000)
  } catch {
    error.value = 'Failed to save default.'
  } finally {
    savingCategory.value = null
  }
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Shipping Settings</h1>

    <div v-if="error" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">{{ success }}</div>

    <div v-if="loading" class="space-y-3">
      <div v-for="i in 3" :key="i" class="card p-4 h-24 animate-pulse bg-gray-100" />
    </div>

    <template v-else>
      <div v-if="!options.length" class="card p-8 text-center text-text-secondary">
        <div class="text-4xl mb-3">📦</div>
        <div class="font-semibold">No shipping options available yet</div>
        <div class="text-sm mt-1">Your print center hasn't configured any shipping options. Contact them to set this up.</div>
      </div>

      <div v-else class="space-y-5">
        <div v-for="cat in CATEGORIES" :key="cat.key" class="card p-5">
          <div class="mb-3">
            <div class="font-semibold">{{ cat.label }}</div>
            <div class="text-xs text-text-muted mt-0.5">{{ cat.hint }}</div>
          </div>

          <div v-if="!optionsForCategory(cat.key).length" class="text-sm text-text-muted">
            Your print center hasn't configured any options for this category.
          </div>

          <div v-else class="space-y-2">
            <!-- Cheapest option -->
            <label class="flex items-center gap-3 p-2.5 rounded-lg border border-card-border cursor-pointer hover:bg-sidebar-bg">
              <input type="radio"
                :name="`default-${cat.key}`"
                :checked="!defaultFor(cat.key)?.service_option"
                @change="setDefault(cat.key, null)"
                :disabled="savingCategory === cat.key"
                class="accent-accent" />
              <div class="text-sm">
                <div class="font-medium">Cheapest available</div>
                <div class="text-xs text-text-muted">Automatically picks the lowest-cost option among the choices below.</div>
              </div>
            </label>

            <!-- PC-configured options -->
            <label v-for="opt in optionsForCategory(cat.key)" :key="opt.id"
              class="flex items-center gap-3 p-2.5 rounded-lg border border-card-border cursor-pointer hover:bg-sidebar-bg">
              <input type="radio"
                :name="`default-${cat.key}`"
                :checked="defaultFor(cat.key)?.service_option === opt.id"
                @change="setDefault(cat.key, opt.id)"
                :disabled="savingCategory === cat.key"
                class="accent-accent" />
              <div class="text-sm">
                <div class="font-medium">{{ opt.service_name || opt.service_code }}</div>
                <div class="text-xs text-text-muted">{{ opt.carrier_code }} / {{ opt.service_code }}</div>
              </div>
            </label>
          </div>
        </div>
      </div>

      <div class="text-xs text-text-muted">
        When an order is matched, the platform automatically applies your default for the requested
        service category. You can always click "Change" on an order to compare rates and pick a
        different option from the ones your print center offers.
      </div>
    </template>
  </div>
</template>
