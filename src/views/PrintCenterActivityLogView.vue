<script setup>
import { ref } from 'vue'
import { ordersApi } from '@/api/endpoints'

const query    = ref('')
const results  = ref([])
const loading  = ref(false)
const error    = ref('')
const searched = ref(false)

const EVENT_STYLES = {
  imported:         { icon: '📥', color: 'text-text-secondary' },
  matched:          { icon: '🔗', color: 'text-blue-600' },
  design_uploaded:  { icon: '🎨', color: 'text-blue-600' },
  design_removed:   { icon: '🗑️', color: 'text-text-muted' },
  ready:            { icon: '✅', color: 'text-emerald-600' },
  sent_to_print:    { icon: '🖨️', color: 'text-purple-600' },
  recalled:         { icon: '↩️', color: 'text-amber-600' },
  label_attempt:    { icon: '⏳', color: 'text-text-secondary' },
  label_confirmed:  { icon: '🏷️', color: 'text-emerald-600' },
  label_failed:     { icon: '⚠️', color: 'text-red-600' },
  in_production:    { icon: '🏭', color: 'text-purple-600' },
  shipped:          { icon: '📦', color: 'text-emerald-600' },
  cancelled:        { icon: '✕', color: 'text-red-600' },
  status_synced:    { icon: '🔄', color: 'text-text-muted' },
  shipstation_notified:      { icon: '📣', color: 'text-emerald-600' },
  shipstation_notify_failed: { icon: '⚠️', color: 'text-red-600' },
  hidden:           { icon: '👁️', color: 'text-text-muted' },
}

function eventStyle(type) {
  return EVENT_STYLES[type] || { icon: '•', color: 'text-text-secondary' }
}

function formatTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

async function search() {
  const q = query.value.trim()
  if (!q) { results.value = []; searched.value = false; return }
  loading.value = true
  error.value   = ''
  searched.value = true
  try {
    const { data } = await ordersApi.activityLog(q)
    results.value = data
  } catch (e) {
    error.value = e?.response?.data?.detail ?? 'Search failed.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Activity Log</h1>
    <p class="text-sm text-text-muted -mt-4">
      Search by order number, customer name, or tracking number to see everything that happened to an order —
      from import through matching, design upload, send-to-print, and label purchase.
    </p>

    <div class="card p-4 flex gap-2">
      <input
        v-model="query"
        @keyup.enter="search"
        type="text"
        placeholder="Order #, customer name, or tracking number…"
        class="flex-1 rounded-lg border border-card-border px-3 py-2 text-sm"
      />
      <button @click="search" :disabled="loading" class="btn-primary text-sm px-4">
        {{ loading ? 'Searching…' : 'Search' }}
      </button>
    </div>

    <div v-if="error" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{{ error }}</div>

    <div v-if="searched && !loading && !error && results.length === 0" class="card p-6 text-center text-sm text-text-muted">
      No orders found matching "{{ query }}".
    </div>

    <div v-for="order in results" :key="order.id" class="card p-5">
      <div class="flex items-start justify-between mb-4 pb-3 border-b border-card-border">
        <div>
          <div class="font-semibold">
            #{{ order.shipstation_order_number || order.external_order_number }}
            <span class="text-text-muted font-normal">— {{ order.customer_name }}</span>
          </div>
          <div class="text-xs text-text-muted mt-0.5">
            {{ order.store_name }} · {{ order.sub_user_name || '—' }}
            <span v-if="order.tracking_number"> · Tracking: {{ order.tracking_number }}</span>
          </div>
        </div>
        <span class="text-xs font-medium px-2 py-1 rounded-full bg-sidebar-active/60 text-text-secondary capitalize">
          {{ order.status.replace('_', ' ') }}
        </span>
      </div>

      <div v-if="order.events.length === 0" class="text-sm text-text-muted italic">No activity recorded yet.</div>
      <ol v-else class="space-y-3">
        <li v-for="ev in order.events" :key="ev.id" class="flex gap-3 text-sm">
          <span class="shrink-0">{{ eventStyle(ev.event_type).icon }}</span>
          <div class="flex-1 min-w-0">
            <div :class="['font-medium', eventStyle(ev.event_type).color]">{{ ev.event_type_display }}</div>
            <div v-if="ev.description" class="text-text-secondary text-xs mt-0.5 break-words">{{ ev.description }}</div>
            <div class="text-text-muted text-xs mt-0.5">
              {{ formatTime(ev.created_at) }}<span v-if="ev.actor_name"> · {{ ev.actor_name }}</span>
            </div>
          </div>
        </li>
      </ol>
    </div>
  </div>
</template>
