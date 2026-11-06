<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  invoice: { type: Object, default: null },
  canManage: { type: Boolean, default: false }, // PC only — mark paid / revert
  acting: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'mark-paid', 'revert', 'view-balance-history'])

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

const showNoteInput = ref(false)
const note = ref('')
const confirmRevert = ref(false)

watch(() => props.invoice, () => {
  showNoteInput.value = false
  note.value = ''
  confirmRevert.value = false
})

const periodLabel = computed(() => {
  if (!props.invoice) return ''
  return `${MONTHS[props.invoice.period_month - 1]} ${props.invoice.period_year}`
})

function statusBadgeClass(status) {
  if (status === 'paid')    return 'bg-emerald-100 text-emerald-800'
  if (status === 'overdue') return 'bg-red-100 text-red-700'
  return 'bg-amber-100 text-amber-800'
}

function confirmMarkPaid() {
  emit('mark-paid', note.value)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="invoice" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" @click.self="$emit('close')">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        :class="invoice.status === 'overdue' ? 'ring-1 ring-red-200' : ''">
        <div class="px-6 py-4 border-b border-card-border flex items-start justify-between"
          :class="invoice.status === 'overdue' ? 'bg-red-50/40' : ''">
          <div>
            <h3 class="font-semibold text-lg">{{ periodLabel }}</h3>
            <div v-if="invoice.sub_user_name" class="text-xs text-text-secondary mt-0.5">
              {{ invoice.sub_user_name }}
            </div>
          </div>
          <span class="badge text-xs" :class="statusBadgeClass(invoice.status)">{{ invoice.status }}</span>
        </div>

        <div class="px-6 py-4 space-y-1 text-sm">
          <div class="flex justify-between py-1.5">
            <span class="text-text-secondary">Orders</span>
            <span class="font-medium">{{ invoice.order_count }}</span>
          </div>
          <div class="flex justify-between py-1.5 border-t border-card-border">
            <span class="text-text-secondary">Items processed</span>
            <span class="font-medium">{{ invoice.item_count }} — ${{ Number(invoice.item_charged).toFixed(2) }}</span>
          </div>
          <div class="flex justify-between py-1.5 border-t border-card-border">
            <span class="text-text-secondary">Labels purchased</span>
            <span class="font-medium">{{ invoice.label_count }} — ${{ Number(invoice.shipping_charged).toFixed(2) }}</span>
          </div>
          <div class="flex justify-between py-1.5 border-t border-card-border">
            <span class="text-text-secondary">Extra print areas</span>
            <span class="font-medium">{{ invoice.extra_print_count }} — ${{ Number(invoice.extra_print_charged).toFixed(2) }}</span>
          </div>
          <div class="flex justify-between py-1.5 border-t border-card-border">
            <span class="text-text-secondary">Gross charged</span>
            <span class="font-medium">${{ Number(invoice.gross_charged).toFixed(2) }}</span>
          </div>
          <div class="flex justify-between py-1.5 border-t border-card-border">
            <span class="text-text-secondary">Credits / Refunds</span>
            <span class="font-medium text-emerald-600">-${{ Number(invoice.credits_total).toFixed(2) }}</span>
          </div>
          <div class="flex justify-between py-2 border-t border-card-border bg-sidebar-bg/50 -mx-6 px-6">
            <span class="font-semibold">Amount due</span>
            <span class="font-bold text-accent-dark">${{ Number(invoice.amount).toFixed(2) }}</span>
          </div>
          <div class="flex justify-between py-1.5 border-t border-card-border">
            <span class="text-text-secondary">Due date</span>
            <span>{{ invoice.due_date }}</span>
          </div>
          <div v-if="invoice.paid_at" class="flex justify-between py-1.5 border-t border-card-border">
            <span class="text-text-secondary">Paid at</span>
            <span>{{ invoice.paid_at.slice(0, 10) }}</span>
          </div>
          <div v-if="invoice.note" class="py-1.5 border-t border-card-border">
            <span class="text-text-secondary block mb-1">Note</span>
            <span class="text-text-primary">{{ invoice.note }}</span>
          </div>
        </div>

        <div class="px-6 pb-4">
          <button @click="$emit('view-balance-history')" class="btn-secondary text-sm w-full">
            View in Balance History →
          </button>
        </div>

        <div v-if="canManage" class="px-6 pb-6 pt-2 border-t border-card-border space-y-3">
          <template v-if="invoice.status !== 'paid'">
            <template v-if="!showNoteInput">
              <button @click="showNoteInput = true" class="btn-primary text-sm w-full">Mark Paid</button>
            </template>
            <template v-else>
              <label class="text-xs text-text-secondary block mb-1">Note (optional) — e.g. "Paid by bank transfer"</label>
              <textarea v-model="note" rows="2"
                class="w-full rounded-lg border border-card-border px-3 py-2 text-sm"
                placeholder="How was this paid?"></textarea>
              <div class="flex gap-2 mt-2">
                <button @click="showNoteInput = false" class="btn-secondary text-sm flex-1">Cancel</button>
                <button @click="confirmMarkPaid" :disabled="acting" class="btn-primary text-sm flex-1">
                  {{ acting ? '…' : 'Confirm Paid' }}
                </button>
              </div>
            </template>
          </template>

          <template v-else>
            <template v-if="!confirmRevert">
              <button @click="confirmRevert = true" class="text-xs text-red-600 hover:underline w-full text-center">
                Revert to unpaid
              </button>
            </template>
            <template v-else>
              <div class="text-xs text-text-secondary text-center">
                This reverses the balance credit this payment applied. Are you sure?
              </div>
              <div class="flex gap-2 mt-2">
                <button @click="confirmRevert = false" class="btn-secondary text-sm flex-1">Cancel</button>
                <button @click="$emit('revert')" :disabled="acting" class="btn-primary text-sm flex-1 !bg-red-600 hover:!bg-red-700">
                  {{ acting ? '…' : 'Yes, revert' }}
                </button>
              </div>
            </template>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>
