<script setup>
import { ref, computed, onMounted } from 'vue'
import { superAdminApi } from '@/api/endpoints'
import ProductFormModal from '@/components/catalog/ProductFormModal.vue'
import { confirmDialog } from '@/composables/useConfirm'

// ── State ─────────────────────────────────────────────────────────────────────
const products = ref([])
const loading  = ref(true)
const error    = ref('')
const success  = ref('')

async function load() {
  loading.value = true; error.value = ''
  try {
    const { data } = await superAdminApi.products()
    products.value = data.results ?? data
  } catch { error.value = 'Failed to load catalog.' }
  finally   { loading.value = false }
}

onMounted(load)

// ── Sidebar filters ───────────────────────────────────────────────────────────
const selectedCat   = ref(null)
const selectedBrand = ref('')
const search        = ref('')

const sidebarCats = computed(() => {
  const map = {}
  for (const p of products.value) {
    if (!p.category) continue
    if (!map[p.category]) map[p.category] = { slug: p.category, name: p.category_name || p.category, count: 0 }
    map[p.category].count++
  }
  return Object.values(map).sort((a, b) => b.count - a.count)
})

const brands = computed(() => {
  const s = new Set(products.value.map(p => p.brand).filter(Boolean))
  return [...s].sort()
})

const filtered = computed(() => {
  let list = products.value
  if (selectedCat.value)   list = list.filter(p => p.category === selectedCat.value)
  if (selectedBrand.value) list = list.filter(p => p.brand === selectedBrand.value)
  if (search.value.trim()) {
    const q = search.value.toLowerCase()
    list = list.filter(p => p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
  }
  return list
})

const grouped = computed(() => {
  if (selectedCat.value) {
    const cat = sidebarCats.value.find(c => c.slug === selectedCat.value)
    return [{ key: selectedCat.value, name: cat?.name || selectedCat.value, items: filtered.value }]
  }
  const map = {}; const order = []
  for (const p of filtered.value) {
    const key  = p.category || '__other__'
    const name = p.category_name || p.category || 'Uncategorized'
    if (!map[key]) { map[key] = { key, name, items: [] }; order.push(key) }
    map[key].items.push(p)
  }
  return order.map(k => map[k])
})

// ── Badge ─────────────────────────────────────────────────────────────────────
const badgeCls   = b => ({ popular: 'bg-blue-100 text-blue-700', new: 'bg-emerald-100 text-emerald-700', bestseller: 'bg-amber-100 text-amber-700' }[b] ?? '')
const badgeLabel = { popular: 'Popular', new: 'New', bestseller: 'Bestseller' }

// ── Product modal ─────────────────────────────────────────────────────────────
const showModal   = ref(false)
const modalMode   = ref('create')
const modalTarget = ref(null)

function openCreate() {
  modalMode.value   = 'create'
  modalTarget.value = null
  showModal.value   = true
}

async function openEdit(product) {
  modalMode.value = 'edit'
  try {
    const { data } = await superAdminApi.product(product.id)
    modalTarget.value = data
  } catch { modalTarget.value = product }
  showModal.value = true
}

function onSaved() {
  showModal.value = false
  success.value   = modalMode.value === 'create' ? 'Product created.' : 'Product updated.'
  load()
}

// ── Delete ────────────────────────────────────────────────────────────────────
const deletingId = ref(null)

async function deleteProduct(product) {
  if (!(await confirmDialog({
    title: `Delete "${product.name}"?`,
    message: 'This cannot be undone.',
    danger: true,
  }))) return
  deletingId.value = product.id; error.value = ''
  try {
    await superAdminApi.deleteProduct(product.id)
    success.value = `"${product.name}" deleted.`
    load()
  } catch { error.value = 'Delete failed.' }
  finally   { deletingId.value = null }
}

// ── Excel upload ──────────────────────────────────────────────────────────────
const uploadModal  = ref(false)
const uploadFile   = ref(null)
const uploading    = ref(false)
const uploadError  = ref('')

function onFileChange(e) {
  uploadFile.value  = e.target.files[0] ?? null
  uploadError.value = ''
}

async function downloadTemplate() {
  try {
    const { data } = await superAdminApi.downloadTemplate()
    const url = URL.createObjectURL(new Blob([data]))
    const a   = document.createElement('a')
    a.href = url; a.download = 'product_template.xlsx'; a.click()
    URL.revokeObjectURL(url)
  } catch { error.value = 'Failed to download template.' }
}

async function submitUpload() {
  if (!uploadFile.value) return
  uploading.value = true; uploadError.value = ''
  try {
    const fd = new FormData()
    fd.append('file', uploadFile.value)
    const { data } = await superAdminApi.uploadProducts(fd)
    success.value    = `Upload complete: ${data.created_products} products, ${data.created_variants} variants created.`
    uploadModal.value = false
    load()
  } catch (e) {
    uploadError.value = e?.response?.data?.detail ?? 'Upload failed.'
  } finally { uploading.value = false }
}
</script>

<template>
  <div class="space-y-5">

    <!-- Header -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <h1 class="text-2xl font-bold">Platform Catalog</h1>
      <div class="flex gap-2 flex-wrap">
        <button @click="downloadTemplate"   class="btn-secondary text-sm">↓ Excel Template</button>
        <button @click="uploadModal = true" class="btn-secondary text-sm">↑ Upload Excel</button>
        <button @click="openCreate"         class="btn-primary  text-sm">+ Add Product</button>
      </div>
    </div>

    <!-- Feedback -->
    <div v-if="error"   class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex justify-between">
      {{ success }}<button @click="success=''" class="text-emerald-500 ml-4">✕</button>
    </div>

    <!-- Main layout -->
    <div class="flex gap-5 items-start">

      <!-- ── Sidebar ──────────────────────────────────────────────────────── -->
      <aside class="w-48 shrink-0 sticky top-4">
        <div class="card p-4">
          <p class="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-3">Categories</p>
          <nav class="space-y-0.5">
            <button @click="selectedCat = null; selectedBrand = ''"
              class="flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm transition"
              :class="!selectedCat ? 'bg-accent text-white font-semibold' : 'text-text-primary hover:bg-sidebar-bg'">
              <span>All Products</span>
              <span class="text-xs opacity-75">{{ products.length }}</span>
            </button>
            <button v-for="cat in sidebarCats" :key="cat.slug"
              @click="selectedCat = cat.slug"
              class="flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm transition"
              :class="selectedCat === cat.slug ? 'bg-accent text-white font-semibold' : 'text-text-primary hover:bg-sidebar-bg'">
              <span class="truncate text-left">{{ cat.name }}</span>
              <span class="text-xs opacity-70 ml-1 shrink-0">{{ cat.count }}</span>
            </button>
          </nav>
        </div>
      </aside>

      <!-- ── Main ────────────────────────────────────────────────────────── -->
      <div class="flex-1 min-w-0 space-y-5">

        <!-- Search + Brand filter -->
        <div class="flex gap-3">
          <input v-model="search" placeholder="Search products by name or code…"
            class="flex-1 rounded-lg border border-card-border px-3 py-2 text-sm" />
          <select v-model="selectedBrand"
            class="rounded-lg border border-card-border px-3 py-2 text-sm bg-white min-w-[130px]">
            <option value="">Brands</option>
            <option v-for="b in brands" :key="b" :value="b">{{ b }}</option>
          </select>
        </div>

        <div class="text-sm text-text-secondary">{{ filtered.length }} products</div>

        <!-- Loading skeleton -->
        <div v-if="loading" class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          <div v-for="i in 8" :key="i" class="card overflow-hidden animate-pulse">
            <div class="aspect-square bg-gray-100" />
            <div class="p-3 space-y-2">
              <div class="h-4 bg-gray-100 rounded w-3/4" />
              <div class="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          </div>
        </div>

        <!-- Empty -->
        <div v-else-if="!filtered.length" class="card p-10 text-center text-text-muted text-sm">
          No products yet. Click "+ Add Product" to get started.
        </div>

        <!-- Grouped sections -->
        <div v-else class="space-y-10">
          <section v-for="group in grouped" :key="group.key">
            <div class="flex items-baseline gap-2 mb-4">
              <h2 class="text-xl font-bold">{{ group.name }}</h2>
              <span class="text-sm text-text-muted">{{ group.items.length }}</span>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              <article v-for="p in group.items" :key="p.id"
                class="card overflow-hidden flex flex-col hover:shadow-lg transition-shadow">

                <!-- Square image -->
                <div class="relative bg-sidebar-bg overflow-hidden aspect-square shrink-0">
                  <img v-if="p.primary_image" :src="p.primary_image" :alt="p.name"
                    class="absolute inset-0 w-full h-full object-cover object-center" />
                  <div v-else
                    class="absolute inset-0 flex items-center justify-center text-text-muted text-xs">
                    No image
                  </div>
                  <span v-if="p.badge"
                    class="absolute top-2 left-2 text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wide"
                    :class="badgeCls(p.badge)">
                    {{ badgeLabel[p.badge] ?? p.badge }}
                  </span>
                </div>

                <!-- Card body -->
                <div class="p-3 flex flex-col gap-2 flex-1">
                  <div class="text-sm font-semibold leading-tight line-clamp-2">{{ p.name }}</div>
                  <div class="text-xs text-text-muted font-mono">{{ p.sku }}</div>

                  <div class="text-xs text-text-secondary">
                    <template v-if="p.size_count">{{ p.size_count }} sizes · </template>
                    {{ p.color_count }} colors
                  </div>

                  <!-- Base price + actions -->
                  <div class="mt-auto pt-2">
                    <div class="text-base font-bold mb-2">${{ Number(p.base_price).toFixed(2) }}</div>
                    <div class="flex gap-1.5">
                      <button @click="openEdit(p)" class="btn-secondary text-xs py-1.5 flex-1">Edit</button>
                      <button @click="deleteProduct(p)" :disabled="deletingId === p.id"
                        class="btn-secondary text-xs py-1.5 px-2 shrink-0 text-red-500 hover:bg-red-50 disabled:opacity-50">
                        ✕
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>

  <!-- Product Form Modal -->
  <ProductFormModal
    v-if="showModal"
    :mode="modalMode"
    role="superadmin"
    :product="modalTarget"
    @saved="onSaved"
    @close="showModal = false"
  />

  <!-- Excel upload modal -->
  <Teleport to="body">
    <div v-if="uploadModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-lg">Upload Products via Excel</h3>
          <button @click="uploadModal = false" class="text-text-muted hover:text-text-primary">✕</button>
        </div>
        <div class="rounded-lg bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-700">
          Don't have the template?
          <button @click="downloadTemplate" class="underline font-medium ml-1">Download Excel Template</button>
        </div>
        <div v-if="uploadError" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {{ uploadError }}
        </div>
        <div>
          <label class="text-xs text-text-secondary block mb-2">Select Excel file (.xlsx)</label>
          <input type="file" accept=".xlsx,.xls" @change="onFileChange"
            class="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0
                   file:text-sm file:font-medium file:bg-accent-light file:text-accent-dark
                   hover:file:bg-accent/20 cursor-pointer" />
        </div>
        <div class="flex gap-3 pt-1">
          <button @click="uploadModal = false" class="btn-secondary flex-1 text-sm">Cancel</button>
          <button @click="submitUpload" :disabled="uploading || !uploadFile"
            class="btn-primary flex-1 text-sm disabled:opacity-50">
            {{ uploading ? 'Uploading…' : 'Upload' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
