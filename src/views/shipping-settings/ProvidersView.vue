<script setup>
import { ref, reactive, onMounted } from 'vue'
import { shippingApi } from '@/api/endpoints'

const loading = ref(true)

const PROVIDER_CHOICES = [
  { value: 'shipstation', label: 'ShipStation' },
  { value: 'byelabel',    label: 'ByeLabel' },
]

const ssAccounts     = ref([])
const labelProviders = ref([])
const providerError  = ref('')
const addingProvider = ref(false)
const newProviderForm = reactive({
  provider: 'shipstation', label: '', shipstation_account: '',
  byelabel_client_id: '', byelabel_client_secret: '', byelabel_workspace_id: '',
})

async function loadSsAccounts() {
  try {
    const { data } = await shippingApi.accounts()
    ssAccounts.value = data.results ?? data
  } catch { /* non-fatal */ }
}

async function loadLabelProviders() {
  try {
    const { data } = await shippingApi.labelProviders()
    labelProviders.value = data
  } catch { /* non-fatal */ }
}

function resetNewProviderForm() {
  Object.assign(newProviderForm, {
    provider: 'shipstation', label: '', shipstation_account: '',
    byelabel_client_id: '', byelabel_client_secret: '', byelabel_workspace_id: '',
  })
}

async function addLabelProvider() {
  providerError.value = ''
  if (!newProviderForm.label.trim()) { providerError.value = 'Name is required.'; return }
  addingProvider.value = true
  try {
    const payload = { provider: newProviderForm.provider, label: newProviderForm.label }
    if (newProviderForm.provider === 'shipstation') {
      payload.shipstation_account = newProviderForm.shipstation_account
    } else {
      payload.byelabel_client_id     = newProviderForm.byelabel_client_id
      payload.byelabel_client_secret = newProviderForm.byelabel_client_secret
      payload.byelabel_workspace_id  = newProviderForm.byelabel_workspace_id
    }
    const { data } = await shippingApi.createLabelProvider(payload)
    labelProviders.value.push(data)
    resetNewProviderForm()
  } catch (e) {
    const d = e?.response?.data
    providerError.value = d?.detail ?? Object.values(d ?? {})[0]?.[0] ?? 'Failed to add provider.'
  } finally {
    addingProvider.value = false
  }
}

async function toggleProviderActive(p) {
  try {
    const { data } = await shippingApi.updateLabelProvider(p.id, { is_active: !p.is_active })
    const idx = labelProviders.value.findIndex(x => x.id === p.id)
    if (idx !== -1) labelProviders.value[idx] = data
  } catch {
    providerError.value = 'Failed to update provider.'
  }
}

async function removeLabelProvider(p) {
  if (!confirm(`Remove "${p.label}"? Any shipping options using this provider will stop being compared.`)) return
  try {
    await shippingApi.deleteLabelProvider(p.id)
    labelProviders.value = labelProviders.value.filter(x => x.id !== p.id)
  } catch {
    providerError.value = 'Failed to remove provider.'
  }
}

onMounted(async () => {
  loading.value = true
  try {
    await Promise.all([loadSsAccounts(), loadLabelProviders()])
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="space-y-4">
    <div v-if="loading" class="card p-4 h-24 animate-pulse bg-gray-100" />

    <div v-else class="card p-5">
      <div class="mb-4">
        <div class="font-semibold">Shipping Providers</div>
        <div class="text-xs text-text-muted mt-0.5">
          Connect one or more label-purchasing providers. When production buys a label, every
          active provider is rate-compared for the order's package and the cheapest valid option is used.
        </div>
      </div>

      <div v-if="providerError" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 mb-3">
        {{ providerError }}
      </div>

      <div v-if="labelProviders.length" class="space-y-1.5 mb-4">
        <div v-for="p in labelProviders" :key="p.id"
          class="rounded-lg border border-card-border px-3 py-2 flex items-center justify-between text-sm">
          <div>
            <span class="font-medium">{{ p.label }}</span>
            <span class="text-text-muted text-xs ml-2">{{ p.provider_display }}</span>
            <span v-if="p.provider === 'shipstation'" class="text-text-muted text-xs ml-2">
              ({{ ssAccounts.find(a => a.id === p.shipstation_account)?.label || 'account #' + p.shipstation_account }})
            </span>
          </div>
          <div class="flex items-center gap-2 shrink-0 ml-2">
            <button @click="toggleProviderActive(p)"
              class="text-xs px-2 py-0.5 rounded-full"
              :class="p.is_active ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-text-muted'">
              {{ p.is_active ? 'Active' : 'Inactive' }}
            </button>
            <button @click="removeLabelProvider(p)" class="text-xs text-red-500 hover:underline">Remove</button>
          </div>
        </div>
      </div>
      <div v-else class="text-xs text-text-muted mb-4">No label providers connected yet.</div>

      <!-- Add new provider -->
      <div class="rounded-lg border border-card-border p-3">
        <div class="flex flex-wrap gap-2 items-end mb-2">
          <div>
            <label class="text-[10px] text-text-muted block mb-0.5">Provider</label>
            <select v-model="newProviderForm.provider" class="rounded-lg border border-card-border px-2 py-1.5 text-xs w-32">
              <option v-for="c in PROVIDER_CHOICES" :key="c.value" :value="c.value">{{ c.label }}</option>
            </select>
          </div>
          <div>
            <label class="text-[10px] text-text-muted block mb-0.5">Name</label>
            <input v-model="newProviderForm.label" type="text" placeholder="e.g. ByeLabel Main"
              class="rounded-lg border border-card-border px-2 py-1.5 text-xs w-40" />
          </div>
        </div>

        <div v-if="newProviderForm.provider === 'shipstation'" class="flex flex-wrap gap-2 items-end mb-2">
          <div>
            <label class="text-[10px] text-text-muted block mb-0.5">ShipStation Account</label>
            <select v-model="newProviderForm.shipstation_account" class="rounded-lg border border-card-border px-2 py-1.5 text-xs w-52">
              <option value="">Select an account…</option>
              <option v-for="a in ssAccounts" :key="a.id" :value="a.id">{{ a.label }}</option>
            </select>
          </div>
        </div>
        <div v-else class="flex flex-wrap gap-2 items-end mb-2">
          <div>
            <label class="text-[10px] text-text-muted block mb-0.5">Client ID</label>
            <input v-model="newProviderForm.byelabel_client_id" type="text"
              class="rounded-lg border border-card-border px-2 py-1.5 text-xs w-52" />
          </div>
          <div>
            <label class="text-[10px] text-text-muted block mb-0.5">Client Secret</label>
            <input v-model="newProviderForm.byelabel_client_secret" type="password"
              class="rounded-lg border border-card-border px-2 py-1.5 text-xs w-52" />
          </div>
          <div>
            <label class="text-[10px] text-text-muted block mb-0.5">Workspace ID</label>
            <input v-model="newProviderForm.byelabel_workspace_id" type="text"
              class="rounded-lg border border-card-border px-2 py-1.5 text-xs w-52" />
          </div>
        </div>

        <button @click="addLabelProvider" :disabled="addingProvider"
          class="btn-secondary text-xs py-1.5 px-3 disabled:opacity-50">
          {{ addingProvider ? 'Connecting…' : '+ Add Provider' }}
        </button>
      </div>
    </div>
  </div>
</template>
