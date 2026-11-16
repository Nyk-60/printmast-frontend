<script setup>
import { ref, reactive, onMounted } from 'vue'
import { shippingApi } from '@/api/endpoints'
import { confirmDialog } from '@/composables/useConfirm'

const loading = ref(true)
const error   = ref('')

const PROVIDER_CHOICES = [
  { value: 'shipstation', label: 'ShipStation' },
  { value: 'byelabel',    label: 'ByeLabel' },
]

const CATEGORIES = [
  { key: 'standard', label: 'Standard Shipping' },
  { key: 'priority', label: 'Priority' },
  { key: 'express',  label: 'Express' },
]

const serviceOptions = ref([])
const newOptionForms = reactive({
  standard: { provider: 'shipstation', carrier_code: '', service_code: '', service_name: '' },
  priority: { provider: 'shipstation', carrier_code: '', service_code: '', service_name: '' },
  express:  { provider: 'shipstation', carrier_code: '', service_code: '', service_name: '' },
})
const addingOptionCategory = ref(null)

async function loadServiceOptions() {
  try {
    const { data } = await shippingApi.serviceOptions()
    serviceOptions.value = data.results ?? data
  } catch { /* non-fatal */ }
}

function optionsForCategory(category) {
  return serviceOptions.value.filter(o => o.category === category)
}

async function addServiceOption(category) {
  const form = newOptionForms[category]
  if (!form.carrier_code || !form.service_code) return
  addingOptionCategory.value = category
  try {
    const { data } = await shippingApi.createServiceOption({ category, ...form })
    serviceOptions.value.push(data)
    newOptionForms[category] = { provider: 'shipstation', carrier_code: '', service_code: '', service_name: '' }
  } catch (e) {
    error.value = e?.response?.data?.detail ?? 'Failed to add shipping option.'
  } finally {
    addingOptionCategory.value = null
  }
}

async function removeServiceOption(option) {
  if (!(await confirmDialog({ title: `Remove "${option.service_name || option.service_code}"?`, danger: true }))) return
  try {
    await shippingApi.deleteServiceOption(option.id)
    serviceOptions.value = serviceOptions.value.filter(o => o.id !== option.id)
  } catch {
    error.value = 'Failed to remove shipping option.'
  }
}

async function toggleServiceOptionActive(option) {
  try {
    const { data } = await shippingApi.updateServiceOption(option.id, { is_active: !option.is_active })
    const idx = serviceOptions.value.findIndex(o => o.id === option.id)
    if (idx !== -1) serviceOptions.value[idx] = data
  } catch {
    error.value = 'Failed to update shipping option.'
  }
}

// ── Inline edit of an existing service option ─────────────────────────────────

const editingOptionId = ref(null)
const editOptionForm  = reactive({ provider: 'shipstation', carrier_code: '', service_code: '', service_name: '' })
const savingOptionEdit = ref(false)

function startEditOption(option) {
  editingOptionId.value = option.id
  editOptionForm.provider = option.provider
  editOptionForm.carrier_code = option.carrier_code
  editOptionForm.service_code = option.service_code
  editOptionForm.service_name = option.service_name
}

function cancelEditOption() {
  editingOptionId.value = null
}

async function saveEditOption(option) {
  if (!editOptionForm.carrier_code || !editOptionForm.service_code) return
  savingOptionEdit.value = true
  try {
    const { data } = await shippingApi.updateServiceOption(option.id, { ...editOptionForm })
    const idx = serviceOptions.value.findIndex(o => o.id === option.id)
    if (idx !== -1) serviceOptions.value[idx] = data
    editingOptionId.value = null
  } catch (e) {
    error.value = e?.response?.data?.detail ?? 'Failed to update shipping option.'
  } finally {
    savingOptionEdit.value = false
  }
}

onMounted(async () => {
  loading.value = true
  try {
    await loadServiceOptions()
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="space-y-4">
    <div v-if="error" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{{ error }}</div>

    <div v-if="loading" class="card p-4 h-24 animate-pulse bg-gray-100" />

    <div v-else class="card p-5">
      <div class="mb-4">
        <div class="font-semibold">Shipping Options</div>
        <div class="text-xs text-text-muted mt-0.5">
          Define which carrier/service combinations are available in each category, per provider.
          Sub-users will choose a default from these options and can only select among them.
        </div>
      </div>

      <div class="space-y-5">
        <div v-for="cat in CATEGORIES" :key="cat.key" class="rounded-lg border border-card-border p-3">
          <div class="text-sm font-semibold mb-2">{{ cat.label }}</div>

          <div v-if="optionsForCategory(cat.key).length" class="space-y-1.5 mb-3">
            <div v-for="opt in optionsForCategory(cat.key)" :key="opt.id"
              class="rounded-lg border border-card-border px-3 py-1.5">

              <!-- Edit mode -->
              <div v-if="editingOptionId === opt.id" class="flex flex-wrap gap-2 items-end">
                <div>
                  <label class="text-[10px] text-text-muted block mb-0.5">Provider</label>
                  <select v-model="editOptionForm.provider" class="rounded-lg border border-card-border px-2 py-1 text-xs w-28">
                    <option v-for="c in PROVIDER_CHOICES" :key="c.value" :value="c.value">{{ c.label }}</option>
                  </select>
                </div>
                <div>
                  <label class="text-[10px] text-text-muted block mb-0.5">Carrier Code</label>
                  <input v-model="editOptionForm.carrier_code" type="text"
                    class="rounded-lg border border-card-border px-2 py-1 text-xs w-28" />
                </div>
                <div>
                  <label class="text-[10px] text-text-muted block mb-0.5">Service Code</label>
                  <input v-model="editOptionForm.service_code" type="text"
                    class="rounded-lg border border-card-border px-2 py-1 text-xs w-40" />
                </div>
                <div>
                  <label class="text-[10px] text-text-muted block mb-0.5" title="Shown to sub-users as-is — never mention the provider (ShipStation, ByeLabel, ...), that stays internal.">Display Name (sub-user sees this)</label>
                  <input v-model="editOptionForm.service_name" type="text"
                    title="Shown to sub-users as-is — never mention the provider (ShipStation, ByeLabel, ...), that stays internal."
                    class="rounded-lg border border-card-border px-2 py-1 text-xs w-44" />
                </div>
                <button @click="saveEditOption(opt)"
                  :disabled="savingOptionEdit || !editOptionForm.carrier_code || !editOptionForm.service_code"
                  class="btn-primary text-xs py-1 px-3 disabled:opacity-50">
                  {{ savingOptionEdit ? '…' : 'Save' }}
                </button>
                <button @click="cancelEditOption" :disabled="savingOptionEdit"
                  class="btn-secondary text-xs py-1 px-3">Cancel</button>
              </div>

              <!-- View mode -->
              <div v-else class="flex items-center justify-between text-sm">
                <div>
                  <span class="font-medium">{{ opt.service_name || opt.service_code }}</span>
                  <span class="text-text-muted text-xs ml-2">{{ opt.carrier_code }} / {{ opt.service_code }}</span>
                  <span class="text-[10px] text-accent bg-accent/10 rounded-full px-1.5 py-0.5 ml-2">{{ opt.provider_display }}</span>
                </div>
                <div class="flex items-center gap-2 shrink-0 ml-2">
                  <button @click="toggleServiceOptionActive(opt)"
                    class="text-xs px-2 py-0.5 rounded-full"
                    :class="opt.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-text-muted'">
                    {{ opt.is_active ? 'Active' : 'Inactive' }}
                  </button>
                  <button @click="startEditOption(opt)" class="text-xs text-accent hover:underline">Edit</button>
                  <button @click="removeServiceOption(opt)" class="text-xs text-red-500 hover:underline">Remove</button>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="text-xs text-text-muted mb-3">No options configured for this category yet.</div>

          <!-- Add new option -->
          <div class="flex flex-wrap gap-2 items-end">
            <div>
              <label class="text-[10px] text-text-muted block mb-0.5">Provider</label>
              <select v-model="newOptionForms[cat.key].provider" class="rounded-lg border border-card-border px-2 py-1.5 text-xs w-28">
                <option v-for="c in PROVIDER_CHOICES" :key="c.value" :value="c.value">{{ c.label }}</option>
              </select>
            </div>
            <div>
              <label class="text-[10px] text-text-muted block mb-0.5">Carrier Code</label>
              <input v-model="newOptionForms[cat.key].carrier_code" type="text" placeholder="e.g. usps"
                class="rounded-lg border border-card-border px-2 py-1.5 text-xs w-28" />
            </div>
            <div>
              <label class="text-[10px] text-text-muted block mb-0.5">Service Code</label>
              <input v-model="newOptionForms[cat.key].service_code" type="text" placeholder="e.g. usps_priority"
                class="rounded-lg border border-card-border px-2 py-1.5 text-xs w-40" />
            </div>
            <div>
              <label class="text-[10px] text-text-muted block mb-0.5" title="Shown to sub-users as-is — never mention the provider (ShipStation, ByeLabel, ...), that stays internal.">Display Name (sub-user sees this)</label>
              <input v-model="newOptionForms[cat.key].service_name" type="text" placeholder="e.g. USPS Priority Mail (not: ByeLabel USPS)"
                title="Shown to sub-users as-is — never mention the provider (ShipStation, ByeLabel, ...), that stays internal."
                class="rounded-lg border border-card-border px-2 py-1.5 text-xs w-44" />
            </div>
            <button @click="addServiceOption(cat.key)"
              :disabled="addingOptionCategory === cat.key || !newOptionForms[cat.key].carrier_code || !newOptionForms[cat.key].service_code"
              class="btn-secondary text-xs py-1.5 px-3 disabled:opacity-50">
              {{ addingOptionCategory === cat.key ? '…' : '+ Add' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
