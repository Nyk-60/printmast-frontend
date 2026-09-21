<script setup>
import { ref, computed, onMounted } from 'vue'
import { catalogApi } from '@/api/endpoints'

// ── State ─────────────────────────────────────────────────────────────────────
const products = ref([])
const loading  = ref(true)
const error    = ref('')

const search        = ref('')
const selectedCat   = ref(null)
const selectedBrand = ref('')

// ── Load ──────────────────────────────────────────────────────────────────────
async function load() {
  loading.value = true
  error.value   = ''
  try {
    const { data } = await catalogApi.subCatalog()
    products.value = data.results ?? data
  } catch {
    error.value = 'Failed to load catalog.'
  } finally {
    loading.value = false
  }
}

onMounted(load)

// ── Sidebar categories ────────────────────────────────────────────────────────
const sidebarCats = computed(() => {
  const map = {}
  for (const p of products.value) {
    if (!p.category) continue
    if (!map[p.category]) map[p.category] = { slug: p.category, name: p.category_name || p.category, count: 0 }
    map[p.category].count++
  }
  return Object.values(map).sort((a, b) => b.count - a.count)
})

// ── Brands ────────────────────────────────────────────────────────────────────
const brands = computed(() => {
  const s = new Set(products.value.map(p => p.brand).filter(Boolean))
  return [...s].sort()
})

// ── Filtered ──────────────────────────────────────────────────────────────────
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

// ── Grouped by category ───────────────────────────────────────────────────────
const grouped = computed(() => {
  if (selectedCat.value) {
    const cat = sidebarCats.value.find(c => c.slug === selectedCat.value)
    return [{ key: selectedCat.value, name: cat?.name || selectedCat.value, items: filtered.value }]
  }
  const map = {}
  const order = []
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

// ── Detail modal ──────────────────────────────────────────────────────────────
const detailModal   = ref(false)
const detailProduct = ref(null)
const detailLoading = ref(false)

const colorClassDraft   = ref(null)   // {use_custom, colors: [{name, pc_is_dark, draft_is_dark}]}
const colorClassSaving  = ref(false)
const colorClassErr     = ref('')
const colorClassChanged = ref(false)

async function openDetail(product) {
  detailProduct.value  = null
  detailModal.value    = true
  detailLoading.value  = true
  colorClassDraft.value  = null
  colorClassChanged.value = false
  try {
    const [{ data }, { data: cc }] = await Promise.all([
      catalogApi.subCatalogProduct(product.id),
      catalogApi.colorClassification(product.id),
    ])
    detailProduct.value = data
    colorClassDraft.value = {
      use_custom: cc.use_custom,
      colors: cc.colors.map(c => ({
        ...c,
        draft_is_dark: c.custom_is_dark ?? c.pc_is_dark,
      })),
    }
  } catch {
    error.value       = 'Failed to load product.'
    detailModal.value = false
  } finally {
    detailLoading.value = false
  }
}

async function saveColorClassification() {
  colorClassSaving.value = true
  colorClassErr.value    = ''
  try {
    await catalogApi.setColorClassification(detailProduct.value.id, {
      use_custom: colorClassDraft.value.use_custom,
      entries: colorClassDraft.value.colors.map(c => ({
        color_name: c.name,
        is_dark:    c.draft_is_dark,
      })),
    })
    colorClassChanged.value = false
  } catch {
    colorClassErr.value = 'Save failed.'
  } finally {
    colorClassSaving.value = false
  }
}

// ── Catalog export ────────────────────────────────────────────────────────────
const exporting = ref(false)

async function downloadCatalog() {
  exporting.value = true
  try {
    const { data } = await catalogApi.exportCatalog()
    const url  = URL.createObjectURL(new Blob([data]))
    const link = document.createElement('a')
    link.href     = url
    link.download = 'pc_catalog.xlsx'
    link.click()
    URL.revokeObjectURL(url)
  } catch {
    error.value = 'Catalog export failed.'
  } finally {
    exporting.value = false
  }
}

// ── Size sort ─────────────────────────────────────────────────────────────────
const SIZE_ORDER = ['XS','S','SM','M','ML','L','XL','1X','1XL','2X','2XL','XXL','3X','3XL','XXXL','4XL','4X','5XL','5X','6XL']
function sizeRank(s) { const i = SIZE_ORDER.indexOf((s || '').toUpperCase().trim()); return i === -1 ? 999 : i }
function sortedVariants(vs) {
  return [...(vs || [])].sort((a, b) => {
    const sd = sizeRank(a.size) - sizeRank(b.size)
    return sd !== 0 ? sd : (a.color || '').localeCompare(b.color || '')
  })
}
</script>

<template>
  <div class="flex gap-5 items-start">

    <!-- ── Sidebar ─────────────────────────────────────────────────────────── -->
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

    <!-- ── Main content ───────────────────────────────────────────────────── -->
    <div class="flex-1 min-w-0 space-y-5">

      <div class="flex items-center justify-between gap-3">
        <h1 class="text-2xl font-bold">Product Catalog</h1>
        <div class="flex items-center gap-3">
          <span class="text-sm text-text-secondary">{{ filtered.length }} products available</span>
          <button @click="downloadCatalog" :disabled="exporting"
            class="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-card-border hover:bg-sidebar-bg transition disabled:opacity-50">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 15V3m0 12l-4-4m4 4l4-4M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {{ exporting ? 'Exporting…' : 'Download Catalog' }}
          </button>
        </div>
      </div>

      <!-- Search + Brand filter -->
      <div class="flex gap-3">
        <input v-model="search" placeholder="Search products…"
          class="flex-1 rounded-lg border border-card-border px-3 py-2 text-sm" />
        <select v-model="selectedBrand"
          class="rounded-lg border border-card-border px-3 py-2 text-sm bg-white min-w-[130px]">
          <option value="">Brands</option>
          <option v-for="b in brands" :key="b" :value="b">{{ b }}</option>
        </select>
      </div>

      <div v-if="error" class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{{ error }}</div>

      <!-- Loading skeleton -->
      <div v-if="loading" class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
        <div v-for="i in 8" :key="i" class="card overflow-hidden animate-pulse">
          <div class="aspect-square bg-gray-100" />
          <div class="p-3 space-y-2">
            <div class="h-4 bg-gray-100 rounded w-3/4" />
            <div class="h-3 bg-gray-100 rounded w-1/2" />
            <div class="h-3 bg-gray-100 rounded w-2/3" />
          </div>
        </div>
      </div>

      <!-- Empty -->
      <div v-else-if="!filtered.length" class="card p-12 text-center text-text-secondary">
        <div class="text-4xl mb-3">📦</div>
        <div class="font-semibold">No products found</div>
        <div class="text-sm mt-1">Try adjusting your search or filters.</div>
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
              class="card overflow-hidden flex flex-col hover:shadow-lg transition-shadow cursor-pointer"
              @click="openDetail(p)">

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

                <div class="text-xs text-text-secondary">
                  <template v-if="p.size_count">{{ p.size_count }} sizes · </template>
                  {{ p.color_count }} colors
                </div>

                <!-- Price + action -->
                <div class="mt-auto pt-2 flex items-end justify-between gap-2">
                  <div v-if="p.min_price != null" class="leading-none">
                    <div class="text-[10px] text-text-secondary">from</div>
                    <div class="text-base font-bold">${{ Number(p.min_price).toFixed(2) }}</div>
                  </div>
                  <button @click.stop="openDetail(p)"
                    class="btn-primary text-xs px-3 py-1.5 shrink-0 ml-auto">
                    + Select
                  </button>
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>
    </div>
  </div>

  <!-- ── Detail modal ─────────────────────────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="detailModal"
      class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div class="flex items-start justify-between gap-3">
          <div v-if="detailProduct">
            <h3 class="font-semibold text-lg">{{ detailProduct.name }}</h3>
            <div class="text-xs text-text-secondary font-mono mt-0.5">{{ detailProduct.sku }}</div>
          </div>
          <button @click="detailModal = false" class="text-text-muted hover:text-text-primary shrink-0">✕</button>
        </div>

        <div v-if="detailLoading" class="space-y-2">
          <div v-for="i in 4" :key="i" class="h-8 rounded-lg animate-pulse bg-gray-100" />
        </div>

        <div v-else-if="detailProduct" class="space-y-4">
          <p v-if="detailProduct.description" class="text-sm text-text-secondary">
            {{ detailProduct.description }}
          </p>

          <!-- Variants table -->
          <div v-if="detailProduct.variants?.length">
            <div class="text-xs font-medium text-text-secondary mb-2">
              Variants ({{ detailProduct.variants.length }})
            </div>
            <div class="rounded-lg border border-card-border overflow-hidden max-h-72 overflow-y-auto">
              <table class="w-full text-sm">
                <thead class="bg-sidebar-bg text-xs text-text-secondary sticky top-0">
                  <tr>
                    <th class="px-3 py-2 text-left">{{ detailProduct.variant1_label || 'Size' }}</th>
                    <th class="px-3 py-2 text-left">{{ detailProduct.variant2_label || 'Color' }}</th>
                    <th class="px-3 py-2 text-right">Price</th>
                    <th class="px-3 py-2 text-right">Weight</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-card-border">
                  <tr v-for="v in sortedVariants(detailProduct.variants)" :key="v.id"
                    class="hover:bg-sidebar-bg/40">
                    <td class="px-3 py-2 font-medium">{{ v.size || '—' }}</td>
                    <td class="px-3 py-2 text-text-secondary">{{ v.color || '—' }}</td>
                    <td class="px-3 py-2 text-right font-medium">${{ Number(v.cost ?? 0).toFixed(2) }}</td>
                    <td class="px-3 py-2 text-right text-text-secondary">{{ v.weight_oz ? v.weight_oz + ' oz' : '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div v-else class="text-sm text-text-muted">No variants listed.</div>

          <!-- Print areas -->
          <div v-if="detailProduct.print_areas?.length">
            <div class="text-xs font-medium text-text-secondary mb-2">Print Areas</div>
            <div class="flex flex-wrap gap-2">
              <span v-for="a in detailProduct.print_areas" :key="a.id"
                class="text-xs px-2.5 py-1 rounded-full border border-card-border text-text-secondary">
                {{ a.name }} · {{ a.width_inches }}" × {{ a.height_inches }}"
              </span>
            </div>
          </div>

          <!-- Renk Sınıflandırması -->
          <div v-if="colorClassDraft">
            <div class="text-xs font-medium text-text-secondary mb-2">Color Classification</div>

            <!-- Toggle: PC / Custom -->
            <div class="flex items-center gap-4 mb-3">
              <label class="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="radio" :value="false" v-model="colorClassDraft.use_custom"
                  @change="colorClassChanged = true" class="accent-accent" />
                <span class="text-sm">Use catalog classification</span>
              </label>
              <label class="flex items-center gap-1.5 cursor-pointer select-none">
                <input type="radio" :value="true" v-model="colorClassDraft.use_custom"
                  @change="colorClassChanged = true" class="accent-accent" />
                <span class="text-sm">Custom</span>
              </label>
            </div>

            <!-- Color table — only when custom -->
            <div v-if="colorClassDraft.use_custom"
              class="rounded-lg border border-card-border overflow-hidden max-h-56 overflow-y-auto mb-3">
              <table class="w-full text-sm">
                <thead class="bg-sidebar-bg text-xs text-text-secondary sticky top-0">
                  <tr>
                    <th class="px-3 py-2 text-left">Color</th>
                    <th class="px-3 py-2 text-center">PC Class</th>
                    <th class="px-3 py-2 text-center">Your Class</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-card-border">
                  <tr v-for="c in colorClassDraft.colors" :key="c.name"
                    class="hover:bg-sidebar-bg/40">
                    <td class="px-3 py-2 font-medium">{{ c.name }}</td>
                    <td class="px-3 py-2 text-center">
                      <span class="text-xs px-2 py-0.5 rounded-full"
                        :class="c.pc_is_dark ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600'">
                        {{ c.pc_is_dark ? 'Dark' : 'Light' }}
                      </span>
                    </td>
                    <td class="px-3 py-2 text-center">
                      <select v-model="c.draft_is_dark" @change="colorClassChanged = true"
                        class="text-xs rounded border px-2 py-0.5 bg-white transition"
                        :class="c.draft_is_dark !== c.pc_is_dark
                          ? 'border-accent text-accent font-semibold'
                          : 'border-card-border'">
                        <option :value="true">Dark</option>
                        <option :value="false">Light</option>
                      </select>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div v-if="colorClassErr" class="text-xs text-red-600 mb-2">{{ colorClassErr }}</div>

            <button v-if="colorClassChanged"
              @click="saveColorClassification" :disabled="colorClassSaving"
              class="text-xs px-3 py-1.5 rounded-lg bg-accent text-white font-semibold disabled:opacity-50 transition">
              {{ colorClassSaving ? 'Saving…' : 'Save' }}
            </button>
          </div>
        </div>

        <div class="flex justify-end pt-1">
          <button @click="detailModal = false" class="btn-secondary text-sm">Close</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
