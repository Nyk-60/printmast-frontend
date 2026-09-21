<script setup>
import { ref, onMounted } from 'vue'
import { ordersApi, catalogApi, shippingApi, authApi } from '@/api/endpoints'

// ── Stores (for optional store filter on upload) ──────────────────────────────
const stores  = ref([])
const storeId = ref('')

// ── Saved mapping count ───────────────────────────────────────────────────────
const savedCount = ref(null)

async function fetchSavedCount() {
  try {
    const { data } = await ordersApi.mappingCount()
    savedCount.value = data.count
  } catch { savedCount.value = null }
}

// ── Auto-matching toggle ──────────────────────────────────────────────────────
const autoMatchEnabled = ref(true)
const autoMatchSaving  = ref(false)

async function toggleAutoMatch() {
  autoMatchSaving.value = true
  try {
    await authApi.updateProfile({ auto_product_matching: autoMatchEnabled.value })
  } catch {
    autoMatchEnabled.value = !autoMatchEnabled.value // revert on error
  } finally {
    autoMatchSaving.value = false
  }
}

onMounted(async () => {
  try {
    const { data } = await shippingApi.stores()
    stores.value = data.results ?? data
  } catch { stores.value = [] }
  fetchSavedCount()
  try {
    const { data } = await authApi.me()
    if (data.profile?.auto_product_matching !== undefined)
      autoMatchEnabled.value = data.profile.auto_product_matching
  } catch { /* leave default */ }
})

// ── Download helpers ──────────────────────────────────────────────────────────
const downloading = ref('')

async function download(type) {
  downloading.value = type
  try {
    let res
    if (type === 'orders')   res = await ordersApi.generateMappingTemplate()
    if (type === 'blank')    res = await ordersApi.downloadMappingTemplate()
    if (type === 'catalog')  res = await catalogApi.exportCatalog()
    if (type === 'saved')    res = await ordersApi.exportSavedMappings()

    const names = {
      orders:  'mapping_template_catalog.xlsx',
      blank:   'mapping_template.xlsx',
      catalog: 'pc_catalog.xlsx',
      saved:   'saved_mappings.xlsx',
    }
    const url  = URL.createObjectURL(new Blob([res.data]))
    const link = document.createElement('a')
    link.href     = url
    link.download = names[type]
    link.click()
    URL.revokeObjectURL(url)
  } catch {
    error.value = 'Download failed.'
  } finally {
    downloading.value = ''
  }
}

// ── Upload ────────────────────────────────────────────────────────────────────
const uploading      = ref(false)
const uploadFile     = ref(null)
const applyToOrders  = ref(true)
const result         = ref(null)
const error          = ref('')

async function upload() {
  if (!uploadFile.value) return
  uploading.value = true
  error.value     = ''
  result.value    = null
  try {
    const fd = new FormData()
    fd.append('file', uploadFile.value)
    if (storeId.value) fd.append('store_id', storeId.value)
    fd.append('apply_to_orders', applyToOrders.value ? 'true' : 'false')
    const { data } = await ordersApi.uploadMappings(fd)
    result.value = data
    uploadFile.value = null
    fetchSavedCount()
  } catch (e) {
    error.value = e?.response?.data?.detail ?? 'Upload failed.'
  } finally {
    uploading.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl space-y-6">

    <h1 class="text-2xl font-bold tracking-tight">My Templates</h1>

    <!-- ── Auto-matching setting ──────────────────────────────────────────────── -->
    <div class="card p-5">
      <div class="flex items-center justify-between gap-4">
        <div>
          <div class="font-semibold text-sm">Auto Product Matching</div>
          <div class="text-xs text-text-secondary mt-0.5">
            When enabled, new orders are automatically matched to your catalog as soon as they arrive.
          </div>
        </div>
        <button @click="autoMatchEnabled = !autoMatchEnabled; toggleAutoMatch()"
          :disabled="autoMatchSaving"
          class="relative shrink-0 w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50"
          :class="autoMatchEnabled ? 'bg-accent' : 'bg-gray-300'">
          <span class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform duration-200"
            :class="autoMatchEnabled ? 'translate-x-5' : 'translate-x-0'" />
        </button>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error"
      class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex justify-between">
      {{ error }}
      <button @click="error = ''" class="text-red-400 hover:text-red-600">✕</button>
    </div>

    <!-- ── Download section ─────────────────────────────────────────────────── -->
    <div class="card p-5 space-y-4">
      <h2 class="text-sm font-bold text-text-primary uppercase tracking-wide">Download</h2>

      <!-- Generate from orders -->
      <div class="flex items-start gap-4 py-3 border-b border-card-border">
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-sm">Mapping Template — from Orders</div>
          <div class="text-xs text-text-secondary mt-0.5">
            Pre-filled with your unmatched orders' exact option values. Just fill in the catalog columns (A–C) and upload.
          </div>
        </div>
        <button @click="download('orders')" :disabled="downloading === 'orders'"
          class="shrink-0 flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-card-border hover:bg-sidebar-bg transition disabled:opacity-50">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ downloading === 'orders' ? 'Downloading…' : 'Download' }}
        </button>
      </div>

      <!-- Blank template -->
      <div class="flex items-start gap-4 py-3 border-b border-card-border">
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-sm">Mapping Template — Blank</div>
          <div class="text-xs text-text-secondary mt-0.5">
            Empty template with example rows. Rename Option columns to match your marketplace option names.
          </div>
        </div>
        <button @click="download('blank')" :disabled="downloading === 'blank'"
          class="shrink-0 flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-card-border hover:bg-sidebar-bg transition disabled:opacity-50">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ downloading === 'blank' ? 'Downloading…' : 'Download' }}
        </button>
      </div>

      <!-- Catalog -->
      <div class="flex items-start gap-4 py-3 border-b border-card-border">
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-sm">Catalog Reference</div>
          <div class="text-xs text-text-secondary mt-0.5">
            All catalog products with sizes and colors. Use as reference when filling the mapping template.
          </div>
        </div>
        <button @click="download('catalog')" :disabled="downloading === 'catalog'"
          class="shrink-0 flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-card-border hover:bg-sidebar-bg transition disabled:opacity-50">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ downloading === 'catalog' ? 'Downloading…' : 'Download' }}
        </button>
      </div>

      <!-- Saved Mappings -->
      <div class="flex items-start gap-4 py-3">
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-sm flex items-center gap-2">
            Saved Mappings
            <span v-if="savedCount !== null"
              class="text-xs font-normal px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
              {{ savedCount }} mapping{{ savedCount !== 1 ? 's' : '' }}
            </span>
          </div>
          <div class="text-xs text-text-secondary mt-0.5">
            All your remembered matches — both catalog and marketplace columns filled. Edit and re-upload to correct mappings.
          </div>
        </div>
        <button @click="download('saved')" :disabled="downloading === 'saved' || savedCount === 0"
          class="shrink-0 flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-card-border hover:bg-sidebar-bg transition disabled:opacity-50">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ downloading === 'saved' ? 'Downloading…' : 'Download' }}
        </button>
      </div>
    </div>

    <!-- ── Upload section ───────────────────────────────────────────────────── -->
    <div class="card p-5 space-y-4">
      <h2 class="text-sm font-bold text-text-primary uppercase tracking-wide">Upload Mappings</h2>

      <div class="text-xs text-text-secondary">
        Upload a completed mapping template to save product matches for future orders.
      </div>

      <!-- Store selector (optional) -->
      <div v-if="stores.length > 1">
        <label class="text-xs font-semibold text-text-muted uppercase tracking-wide">Store (optional)</label>
        <select v-model="storeId"
          class="mt-1 w-full rounded-lg border border-card-border px-3 py-2 text-sm bg-white">
          <option value="">All Stores</option>
          <option v-for="s in stores" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>

      <!-- File input -->
      <div>
        <label class="text-xs font-semibold text-text-muted uppercase tracking-wide">Excel File</label>
        <input type="file" accept=".xlsx,.xls"
          @change="e => uploadFile = e.target.files[0]"
          class="mt-1 block w-full text-sm text-text-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-card-border file:text-xs file:font-medium file:bg-sidebar-bg file:text-text-primary hover:file:bg-gray-100 cursor-pointer" />
      </div>

      <!-- Apply to orders checkbox -->
      <label class="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" v-model="applyToOrders"
          class="w-4 h-4 rounded border-card-border text-primary accent-teal-600 cursor-pointer" />
        <span class="text-sm text-text-primary">Apply to pending orders immediately</span>
      </label>

      <button @click="upload" :disabled="!uploadFile || uploading"
        class="btn-primary text-sm disabled:opacity-50">
        {{ uploading ? 'Uploading…' : 'Upload Mappings' }}
      </button>

      <!-- Result -->
      <div v-if="result" class="rounded-lg border text-sm p-4 space-y-2"
        :class="result.errors?.length ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'">
        <div class="font-semibold"
          :class="result.errors?.length ? 'text-amber-800' : 'text-emerald-700'">
          <span v-if="result.created">{{ result.created }} new mapping{{ result.created !== 1 ? 's' : '' }} added</span>
          <span v-if="result.created && result.updated"> · </span>
          <span v-if="result.updated">{{ result.updated }} updated</span>
          <span v-if="!result.created && !result.updated">No changes</span>
          <span v-if="result.skipped" class="font-normal text-text-secondary ml-1">· {{ result.skipped }} skipped</span>
          <span v-if="result.auto_matched" class="font-normal text-text-secondary ml-1">· {{ result.auto_matched }} order item{{ result.auto_matched !== 1 ? 's' : '' }} auto-matched</span>
        </div>
        <ul v-if="result.errors?.length" class="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
          <li v-for="(e, i) in result.errors" :key="i">{{ e }}</li>
        </ul>
      </div>
    </div>

  </div>
</template>
