<script setup>
import { ref, watch } from 'vue'
import { useAuthStore } from '@/stores/auth'

const props = defineProps({
  request: { type: Object, default: null },
  canManage: { type: Boolean, default: false }, // PC only
  acting: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'approve', 'reject', 'retry-push'])

const auth = useAuthStore()
const ordersRouteName = auth.isPrintCenter ? 'pc-orders' : 'orders'

const showRejectNote = ref(false)
const rejectNote = ref('')

watch(() => props.request, () => {
  showRejectNote.value = false
  rejectNote.value = ''
})

function statusBadgeClass(status) {
  if (status === 'approved') return 'bg-emerald-100 text-emerald-800'
  if (status === 'rejected') return 'bg-red-100 text-red-700'
  return 'bg-amber-100 text-amber-800'
}

function confirmReject() {
  emit('reject', rejectNote.value)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="request" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" @click.self="$emit('close')">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

        <div class="px-6 py-4 border-b border-card-border flex items-start justify-between">
          <div>
            <h3 class="font-semibold text-lg">Order {{ request.order_number }}</h3>
            <div class="text-xs text-text-secondary mt-0.5">{{ request.sub_user_name }} · {{ request.customer_name }}</div>
          </div>
          <span class="badge text-xs" :class="statusBadgeClass(request.status)">{{ request.status }}</span>
        </div>

        <div class="px-6 py-4 space-y-4 text-sm">
          <div class="flex flex-wrap gap-2">
            <span class="badge text-xs" :class="request.request_type === 'refund' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'">
              {{ request.request_type_display }}
            </span>
            <span class="badge bg-sidebar-bg text-text-secondary text-xs">{{ request.fault_type_display }}</span>
            <span v-if="request.auto_approved" class="badge bg-sidebar-bg text-text-secondary text-xs">Auto-approved</span>
          </div>

          <div>
            <div class="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Items</div>
            <div class="space-y-2">
              <div v-for="item in request.items" :key="item.id" class="border border-card-border rounded-lg p-2.5">
                <div class="font-medium text-xs">{{ item.product_name }}</div>
                <div class="text-xs text-text-secondary mt-0.5">
                  {{ [item.size, item.color].filter(Boolean).join(' / ') }}
                  · Qty: {{ item.quantity }} of {{ item.original_quantity }}
                </div>
                <div v-if="item.reason_display" class="text-xs text-text-secondary mt-0.5">
                  Reason: {{ item.reason_display }}
                </div>
              </div>
            </div>
          </div>

          <div v-if="request.note">
            <div class="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-1">Note</div>
            <div class="text-sm">{{ request.note }}</div>
          </div>

          <div v-if="request.files?.length">
            <div class="text-xs font-semibold text-text-secondary uppercase tracking-wide mb-2">Evidence</div>
            <div class="flex flex-wrap gap-2">
              <a v-for="f in request.files" :key="f.id" :href="f.url" target="_blank">
                <img v-if="/\.(png|jpe?g)$/i.test(f.url)" :src="f.url"
                  class="w-20 h-20 rounded-lg object-cover border border-card-border hover:opacity-80 transition" />
                <div v-else class="w-20 h-20 rounded-lg border border-card-border flex items-center justify-center text-xs text-text-secondary hover:bg-sidebar-bg transition">
                  PDF
                </div>
              </a>
            </div>
          </div>

          <div v-if="request.request_type === 'refund'">
            <div v-if="request.status === 'approved'" class="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 font-medium">
              ${{ request.refund_amount }} credited to balance
            </div>
          </div>
          <template v-else>
            <div v-if="request.new_order_number" class="text-xs text-text-secondary">
              Reship order created: <span class="font-medium text-text-primary">{{ request.new_order_number }}</span>
            </div>
            <div v-if="request.status === 'approved' && request.shipstation_synced" class="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              ✓ Sent to ShipStation
            </div>
            <div v-else-if="request.status === 'approved' && !request.shipstation_synced" class="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 space-y-2">
              <div>⚠ Not sent to ShipStation{{ request.shipstation_sync_error ? ': ' + request.shipstation_sync_error : '' }}</div>
              <button v-if="canManage" @click="$emit('retry-push')" :disabled="acting"
                class="btn-secondary text-xs !py-1 !px-2">
                {{ acting ? '…' : 'Retry ShipStation push' }}
              </button>
            </div>
          </template>
          <div v-if="request.status === 'rejected' && request.rejection_note" class="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {{ request.rejection_note }}
          </div>

          <RouterLink :to="{ name: ordersRouteName, query: { search: request.order_number } }"
            class="text-xs text-accent hover:underline block">
            View original order →
          </RouterLink>
        </div>

        <div v-if="canManage" class="px-6 pb-6 pt-2 border-t border-card-border">
          <template v-if="request.status === 'pending'">
            <div v-if="!showRejectNote" class="flex gap-2">
              <button @click="showRejectNote = true" class="btn-secondary text-sm flex-1 !text-red-600">Reject</button>
              <button @click="$emit('approve')" :disabled="acting" class="btn-primary text-sm flex-1">
                {{ acting ? '…' : 'Approve' }}
              </button>
            </div>
            <template v-else>
              <label class="text-xs text-text-secondary block mb-1">Rejection note (optional)</label>
              <textarea v-model="rejectNote" rows="2" class="w-full rounded-lg border border-card-border px-3 py-2 text-sm"></textarea>
              <div class="flex gap-2 mt-2">
                <button @click="showRejectNote = false" class="btn-secondary text-sm flex-1">Cancel</button>
                <button @click="confirmReject" :disabled="acting" class="btn-primary text-sm flex-1 !bg-red-600 hover:!bg-red-700">
                  {{ acting ? '…' : 'Confirm Reject' }}
                </button>
              </div>
            </template>
          </template>
          <button v-else-if="request.status === 'rejected'" @click="$emit('approve')" :disabled="acting"
            class="btn-primary text-sm w-full">
            {{ acting ? '…' : 'Approve anyway' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
