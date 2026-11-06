<script setup>
const props = defineProps({
  invoice: { type: Object, required: true },
  showSubUser: { type: Boolean, default: false },
})
defineEmits(['click'])

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']

function periodLabel(inv) {
  return `${MONTHS[inv.period_month - 1]} ${inv.period_year}`
}

function statusBadgeClass(status) {
  if (status === 'paid')    return 'bg-emerald-100 text-emerald-800'
  if (status === 'overdue') return 'bg-red-100 text-red-700'
  return 'bg-amber-100 text-amber-800'
}
</script>

<template>
  <button type="button" @click="$emit('click')"
    class="card p-4 text-left w-full transition hover:shadow-md hover:-translate-y-0.5"
    :class="invoice.status === 'overdue' ? 'bg-red-50/40 border-red-200' : ''">
    <div class="flex items-start justify-between gap-2">
      <div>
        <div class="font-semibold text-sm">{{ periodLabel(invoice) }}</div>
        <div v-if="showSubUser" class="text-xs text-text-secondary mt-0.5">
          {{ invoice.sub_user_name || invoice.sub_user_email }}
        </div>
      </div>
      <span class="badge text-xs shrink-0" :class="statusBadgeClass(invoice.status)">{{ invoice.status }}</span>
    </div>

    <div class="text-2xl font-extrabold text-accent-dark mt-3">
      ${{ Number(invoice.amount).toFixed(2) }}
    </div>

    <div class="flex items-center justify-between mt-2 text-xs text-text-secondary">
      <span>{{ invoice.order_count }} order(s)</span>
      <span>Due {{ invoice.due_date }}</span>
    </div>
  </button>
</template>
