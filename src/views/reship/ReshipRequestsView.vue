<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { reshipApi } from '@/api/endpoints'
import { useAuthStore } from '@/stores/auth'
import ReshipRequestCard from './ReshipRequestCard.vue'
import ReshipRequestDetailModal from './ReshipRequestDetailModal.vue'

const auth = useAuthStore()
const canManage = computed(() => auth.isPrintCenter)

const activeTab = ref('new') // 'new' | 'completed'
const statusFilter = ref('') // completed tab only: '' | 'approved' | 'rejected'
const typeFilter = ref('') // '' | 'reship' | 'refund'
const search = ref('')

const requests = ref([])
const loading = ref(false)
const error = ref('')
const success = ref('')
const pagination = reactive({ count: 0, page: 1, page_size: 24 })

const selected = ref(null)
const acting = ref(false)

const now = ref(Date.now())
let tickHandle = null

async function load() {
  loading.value = true
  try {
    const params = {
      search: search.value || undefined,
      request_type: typeFilter.value || undefined,
      page: pagination.page, page_size: pagination.page_size,
    }
    if (activeTab.value === 'new') {
      params.status = 'pending'
    } else {
      params.status = statusFilter.value || undefined
    }
    const { data } = await reshipApi.list(params)
    let results = data.results ?? data
    if (activeTab.value === 'completed') {
      results = results.filter((r) => r.status !== 'pending')
    }
    requests.value = results
    pagination.count = data.count ?? results.length
  } catch {
    error.value = 'Failed to load reship requests.'
  } finally {
    loading.value = false
  }
}

function openRequest(req) {
  selected.value = req
}

async function approve() {
  acting.value = true
  try {
    const { data } = await reshipApi.approve(selected.value.id)
    success.value = data.shipstation_synced
      ? `Reship for order ${data.order_number} approved — ${data.new_order_number} created and sent to ShipStation.`
      : `Reship for order ${data.order_number} approved — ${data.new_order_number} created, but ShipStation push failed: ${data.shipstation_sync_error}`
    selected.value = data
    await load()
  } catch {
    error.value = 'Failed to approve reship request.'
  } finally {
    acting.value = false
  }
}

async function reject(note) {
  acting.value = true
  try {
    const { data } = await reshipApi.reject(selected.value.id, note)
    success.value = `Reship for order ${data.order_number} rejected.`
    selected.value = data
    await load()
  } catch {
    error.value = 'Failed to reject reship request.'
  } finally {
    acting.value = false
  }
}

async function retryPush() {
  acting.value = true
  try {
    const { data } = await reshipApi.retryPush(selected.value.id)
    success.value = data.shipstation_synced
      ? `Reship for order ${data.order_number} was sent to ShipStation.`
      : `Still could not be sent to ShipStation: ${data.shipstation_sync_error}`
    selected.value = data
    await load()
  } catch (e) {
    error.value = e?.response?.data?.detail || 'Failed to retry the ShipStation push.'
  } finally {
    acting.value = false
  }
}

function goPage(p) {
  const totalPages = Math.ceil(pagination.count / pagination.page_size)
  if (p < 1 || p > totalPages) return
  pagination.page = p
  load()
}

watch([activeTab, statusFilter, typeFilter], () => {
  pagination.page = 1
  load()
})

let searchDebounce = null
watch(search, () => {
  clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => { pagination.page = 1; load() }, 400)
})

onMounted(() => {
  load()
  tickHandle = setInterval(() => { now.value = Date.now() }, 60000)
})
onUnmounted(() => {
  if (tickHandle) clearInterval(tickHandle)
})
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Reship Requests</h1>

    <div v-if="error" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex justify-between">
      {{ error }}
      <button @click="error = ''" class="text-red-500">✕</button>
    </div>
    <div v-if="success" class="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex justify-between">
      {{ success }}
      <button @click="success = ''" class="text-emerald-500">✕</button>
    </div>

    <div class="flex border-b border-card-border">
      <button @click="activeTab = 'new'"
        class="relative px-5 py-2.5 text-sm font-semibold border-b-2 transition"
        :class="activeTab === 'new' ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'">
        New
      </button>
      <button @click="activeTab = 'completed'"
        class="relative px-5 py-2.5 text-sm font-semibold border-b-2 transition"
        :class="activeTab === 'completed' ? 'border-accent text-accent' : 'border-transparent text-text-secondary hover:text-text-primary'">
        Completed
      </button>
    </div>

    <div class="card p-4 flex flex-wrap items-end gap-4">
      <div class="flex-1 min-w-[200px]">
        <label class="text-xs text-text-secondary block mb-1">Search</label>
        <input v-model="search" type="text" placeholder="Order no or customer name…"
          class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
      </div>
      <div v-if="activeTab === 'completed'">
        <label class="text-xs text-text-secondary block mb-1">Status</label>
        <select v-model="statusFilter" class="rounded-lg border border-card-border px-3 py-2 text-sm">
          <option value="">All</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>
      <div>
        <label class="text-xs text-text-secondary block mb-1">Type</label>
        <select v-model="typeFilter" class="rounded-lg border border-card-border px-3 py-2 text-sm">
          <option value="">All</option>
          <option value="reship">Reship</option>
          <option value="refund">Refund</option>
        </select>
      </div>
    </div>

    <div v-if="loading" class="px-5 py-10 text-center text-text-secondary text-sm">Loading…</div>
    <div v-else-if="!requests.length" class="px-5 py-10 text-center text-text-secondary text-sm">
      No {{ activeTab === 'new' ? 'new' : '' }} reship requests found.
    </div>
    <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      <ReshipRequestCard v-for="r in requests" :key="r.id" :request="r" :now="now" @click="openRequest(r)" />
    </div>

    <div v-if="Math.ceil(pagination.count / pagination.page_size) > 1"
      class="flex items-center justify-between text-sm">
      <span class="text-text-secondary">
        Page {{ pagination.page }} of {{ Math.ceil(pagination.count / pagination.page_size) }}
      </span>
      <div class="flex gap-1">
        <button @click="goPage(pagination.page - 1)" :disabled="pagination.page === 1"
          class="px-3 py-1 rounded border border-card-border disabled:opacity-40 hover:bg-sidebar-bg transition text-xs">
          ‹ Prev
        </button>
        <button @click="goPage(pagination.page + 1)"
          :disabled="pagination.page >= Math.ceil(pagination.count / pagination.page_size)"
          class="px-3 py-1 rounded border border-card-border disabled:opacity-40 hover:bg-sidebar-bg transition text-xs">
          Next ›
        </button>
      </div>
    </div>

    <ReshipRequestDetailModal :request="selected" :can-manage="canManage" :acting="acting"
      @close="selected = null" @approve="approve" @reject="reject" @retry-push="retryPush" />
  </div>
</template>
