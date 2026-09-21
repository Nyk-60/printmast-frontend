<script setup>
import { reactive, ref, onMounted } from 'vue'
import { shippingApi } from '@/api/endpoints'

const error = ref('')

const shipFromForm    = reactive({
  ship_from_name: '', ship_from_phone: '',
  ship_from_street1: '', ship_from_street2: '',
  ship_from_city: '', ship_from_state: '',
  ship_from_postal_code: '', ship_from_country: 'US',
})
const shipFromSaving  = ref(false)
const shipFromSuccess = ref(false)
const shipFromEditing = ref(false)
const loading = ref(true)

function shipFromAddressLine() {
  const parts = [
    shipFromForm.ship_from_street1,
    shipFromForm.ship_from_street2,
    [shipFromForm.ship_from_city, shipFromForm.ship_from_state, shipFromForm.ship_from_postal_code].filter(Boolean).join(', '),
    shipFromForm.ship_from_country,
  ].filter(Boolean)
  return parts.join(' · ')
}

async function loadShipFrom() {
  loading.value = true
  try {
    const { data } = await shippingApi.pcShippingSettings()
    Object.assign(shipFromForm, {
      ship_from_name:        data.ship_from_name        || '',
      ship_from_phone:       data.ship_from_phone       || '',
      ship_from_street1:     data.ship_from_street1     || '',
      ship_from_street2:     data.ship_from_street2     || '',
      ship_from_city:        data.ship_from_city        || '',
      ship_from_state:       data.ship_from_state       || '',
      ship_from_postal_code: data.ship_from_postal_code || '',
      ship_from_country:     data.ship_from_country     || 'US',
    })
  } catch { /* non-fatal */ } finally {
    loading.value = false
  }
}

function startEditShipFrom() {
  shipFromEditing.value = true
}

async function cancelEditShipFrom() {
  shipFromEditing.value = false
  await loadShipFrom()
}

async function saveShipFrom() {
  shipFromSaving.value  = true
  shipFromSuccess.value = false
  try {
    await shippingApi.updatePcShippingSettings({ ...shipFromForm })
    shipFromSuccess.value = true
    shipFromEditing.value = false
    setTimeout(() => { shipFromSuccess.value = false }, 3000)
  } catch {
    error.value = 'Failed to save ship-from address.'
  } finally {
    shipFromSaving.value = false
  }
}

onMounted(loadShipFrom)
</script>

<template>
  <div class="space-y-4">
    <div v-if="error" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{{ error }}</div>

    <div v-if="loading" class="card p-4 h-24 animate-pulse bg-gray-100" />

    <div v-else class="card p-5">
      <div class="flex items-center justify-between mb-4">
        <div>
          <div class="font-semibold">Ship-From Address</div>
          <div class="text-xs text-text-muted mt-0.5">Physical location orders ship from. Used for rate calculation and shipping labels.</div>
        </div>
        <div class="flex items-center gap-2">
          <span v-if="shipFromSuccess" class="text-xs text-emerald-600 font-medium">✓ Saved</span>
          <button v-if="!shipFromEditing" @click="startEditShipFrom"
            class="btn-secondary text-xs py-1.5 px-3">Edit</button>
        </div>
      </div>

      <!-- Read-only summary -->
      <div v-if="!shipFromEditing" class="text-sm">
        <div v-if="shipFromForm.ship_from_name || shipFromForm.ship_from_street1" class="space-y-1">
          <div class="font-medium text-text-primary">{{ shipFromForm.ship_from_name || '—' }}</div>
          <div v-if="shipFromForm.ship_from_phone" class="text-text-secondary">{{ shipFromForm.ship_from_phone }}</div>
          <div class="text-text-secondary">{{ shipFromAddressLine() }}</div>
        </div>
        <div v-else class="text-text-muted italic">No ship-from address set yet.</div>
      </div>

      <!-- Edit form -->
      <template v-else>
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div>
            <label class="text-xs text-text-secondary block mb-1">Sender Name</label>
            <input v-model="shipFromForm.ship_from_name" type="text" placeholder="e.g. Acme Fulfillment"
              class="w-full rounded-lg border border-card-border px-3 py-2" />
          </div>
          <div>
            <label class="text-xs text-text-secondary block mb-1">Phone</label>
            <input v-model="shipFromForm.ship_from_phone" type="text" placeholder="+1 555 000 0000"
              class="w-full rounded-lg border border-card-border px-3 py-2" />
          </div>
          <div class="col-span-2">
            <label class="text-xs text-text-secondary block mb-1">Street Address</label>
            <input v-model="shipFromForm.ship_from_street1" type="text" placeholder="123 Warehouse St"
              class="w-full rounded-lg border border-card-border px-3 py-2" />
          </div>
          <div class="col-span-2">
            <label class="text-xs text-text-secondary block mb-1">Street Address 2 (optional)</label>
            <input v-model="shipFromForm.ship_from_street2" type="text" placeholder="Suite 100"
              class="w-full rounded-lg border border-card-border px-3 py-2" />
          </div>
          <div>
            <label class="text-xs text-text-secondary block mb-1">City</label>
            <input v-model="shipFromForm.ship_from_city" type="text" placeholder="Dallas"
              class="w-full rounded-lg border border-card-border px-3 py-2" />
          </div>
          <div>
            <label class="text-xs text-text-secondary block mb-1">State</label>
            <input v-model="shipFromForm.ship_from_state" type="text" placeholder="TX"
              class="w-full rounded-lg border border-card-border px-3 py-2" />
          </div>
          <div>
            <label class="text-xs text-text-secondary block mb-1">Postal Code</label>
            <input v-model="shipFromForm.ship_from_postal_code" type="text" placeholder="75048"
              class="w-full rounded-lg border border-card-border px-3 py-2" />
          </div>
          <div>
            <label class="text-xs text-text-secondary block mb-1">Country</label>
            <input v-model="shipFromForm.ship_from_country" type="text" placeholder="US"
              class="w-full rounded-lg border border-card-border px-3 py-2" />
          </div>
        </div>
        <div class="mt-4 flex justify-end gap-2">
          <button @click="cancelEditShipFrom" :disabled="shipFromSaving" class="btn-secondary text-sm">Cancel</button>
          <button @click="saveShipFrom" :disabled="shipFromSaving" class="btn-primary text-sm">
            {{ shipFromSaving ? 'Saving…' : 'Save Address' }}
          </button>
        </div>
      </template>
    </div>
  </div>
</template>
