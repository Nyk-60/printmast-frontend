<script setup>
import { computed } from 'vue'

const props = defineProps({
  request: { type: Object, required: true },
  now: { type: Number, required: true }, // Date.now(), ticked by the parent so every card re-renders together
})
defineEmits(['click'])

function statusBadgeClass(status) {
  if (status === 'approved') return 'bg-emerald-100 text-emerald-800'
  if (status === 'rejected') return 'bg-red-100 text-red-700'
  return 'bg-amber-100 text-amber-800'
}

const elapsed = computed(() => {
  const created = new Date(props.request.created_at).getTime()
  const mins = Math.max(0, Math.round((props.now - created) / 60000))
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60
  if (hours < 24) return `${hours}h ${remMins}m ago`
  const days = Math.floor(hours / 24)
  return `${days}d ${hours % 24}h ago`
})

// Flag long-pending requests so the PC notices before it drags on too long.
const isStale = computed(() => props.request.status === 'pending' && (props.now - new Date(props.request.created_at).getTime()) > 24 * 60 * 60 * 1000)
</script>

<template>
  <button type="button" @click="$emit('click')"
    class="card p-3 text-left w-full transition hover:shadow-md hover:-translate-y-0.5 text-xs">
    <div class="flex items-start justify-between gap-2">
      <div class="min-w-0">
        <div class="font-semibold truncate">Order {{ request.order_number }}</div>
        <div class="text-text-secondary truncate">{{ request.sub_user_name }} · {{ request.customer_name }}</div>
      </div>
      <span class="badge shrink-0" :class="statusBadgeClass(request.status)">{{ request.status }}</span>
    </div>

    <div class="mt-2 flex flex-wrap gap-1">
      <span class="badge shrink-0" :class="request.request_type === 'refund' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'">
        {{ request.request_type_display }}
      </span>
      <span class="badge bg-sidebar-bg text-text-secondary">{{ request.fault_type_display }}</span>
      <span v-if="request.reason_display" class="badge bg-sidebar-bg text-text-secondary">{{ request.reason_display }}</span>
    </div>

    <div v-if="request.request_type === 'refund' && request.status === 'approved'" class="mt-2 text-emerald-700 font-medium">
      ${{ request.refund_amount }} credited
    </div>
    <div v-else-if="request.status === 'approved' && !request.shipstation_synced" class="mt-2 text-red-600 font-medium">
      ⚠ Not sent to ShipStation
    </div>

    <div v-if="request.note" class="mt-2 text-text-secondary line-clamp-2">{{ request.note }}</div>

    <div v-if="request.files?.length" class="mt-2 flex gap-1">
      <img v-for="f in request.files.slice(0, 4)" :key="f.id" :src="f.url"
        class="w-8 h-8 rounded object-cover border border-card-border" />
    </div>

    <div class="mt-2 flex items-center justify-between">
      <span v-if="request.status === 'pending'" class="font-medium" :class="isStale ? 'text-red-600' : 'text-text-muted'">
        {{ isStale ? '⚠ ' : '' }}{{ elapsed }}
      </span>
      <span v-else class="text-text-muted">{{ request.resolved_at?.slice(0, 10) }}</span>
    </div>
  </button>
</template>
