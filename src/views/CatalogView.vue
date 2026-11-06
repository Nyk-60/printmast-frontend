<script setup>
import { ref, computed, onMounted } from 'vue'
import { catalogApi } from '@/api/endpoints'

// ── State ─────────────────────────────────────────────────────────────────────
const products = ref([])
const loading  = ref(true)
const error    = ref('')

const search         = ref('')
const selectedCat    = ref(null) // a top-level OR child category slug, from the sidebar tree
const selectedBrand  = ref('')
const selectedAge    = ref('')
const selectedSubcat = ref('') // free text — independent of the Category tree, same as Age

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

const allCategories = ref([])
async function loadCategories() {
  try {
    const { data } = await catalogApi.categories()
    allCategories.value = data.results ?? data
  } catch { allCategories.value = [] }
}

onMounted(() => { load(); loadCategories() })

// ── Sidebar categories (2-level tree: top-level + its subcategories) ──────────
const categoryTree = computed(() => {
  const countBySlug = {}
  for (const p of products.value) {
    if (p.category) countBySlug[p.category] = (countBySlug[p.category] || 0) + 1
  }
  const tops = allCategories.value.filter(c => !c.parent)
  return tops.map(top => {
    const children = allCategories.value
      .filter(c => c.parent === top.id)
      .map(ch => ({ ...ch, count: countBySlug[ch.slug] || 0 }))
      .filter(ch => ch.count > 0)
    const ownCount = countBySlug[top.slug] || 0
    return { ...top, ownCount, count: ownCount + children.reduce((s, c) => s + c.count, 0), children }
  }).filter(t => t.count > 0)
})

// Clicking a top-level category matches it AND every one of its subcategories;
// clicking a child (from the sidebar tree) matches just itself.
const selectedSlugSet = computed(() => {
  if (!selectedCat.value) return null
  const top = categoryTree.value.find(t => t.slug === selectedCat.value)
  return top ? new Set([top.slug, ...top.children.map(c => c.slug)]) : new Set([selectedCat.value])
})

// ── Brands ────────────────────────────────────────────────────────────────────
const brands = computed(() => {
  const s = new Set(products.value.map(p => p.brand).filter(Boolean))
  return [...s].sort()
})

const ages = computed(() => {
  const s = new Set(products.value.map(p => p.age).filter(Boolean))
  return [...s].sort()
})

const subcatOptions = computed(() => {
  const s = new Set(products.value.map(p => p.subcategory).filter(Boolean))
  return [...s].sort()
})

function clearAllFilters() {
  selectedCat.value = null; selectedBrand.value = ''; selectedAge.value = ''
  selectedSubcat.value = ''; search.value = ''
}

// ── Filtered ──────────────────────────────────────────────────────────────────
const filtered = computed(() => {
  let list = products.value
  if (selectedSlugSet.value) list = list.filter(p => selectedSlugSet.value.has(p.category))
  if (selectedBrand.value)   list = list.filter(p => p.brand === selectedBrand.value)
  if (selectedAge.value)     list = list.filter(p => p.age === selectedAge.value)
  if (selectedSubcat.value)  list = list.filter(p => p.subcategory === selectedSubcat.value)
  if (search.value.trim()) {
    const q = search.value.toLowerCase()
    list = list.filter(p => p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
  }
  return list
})

// ── Grouped by category ───────────────────────────────────────────────────────
const grouped = computed(() => {
  if (selectedCat.value) {
    const cat = allCategories.value.find(c => c.slug === selectedCat.value)
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
function sizeRank(s) {
  const norm = (s || '').toUpperCase().trim()
  const i = SIZE_ORDER.indexOf(norm)
  if (i !== -1) return i
  const m = norm.match(/-?\d+(?:[.,]\d+)?/)
  return m ? 1000 + parseFloat(m[0].replace(',', '.')) : 9999
}
function sortedVariants(vs) {
  return [...(vs || [])].sort((a, b) => {
    const sd = sizeRank(a.size) - sizeRank(b.size)
    return sd !== 0 ? sd : (a.color || '').localeCompare(b.color || '')
  })
}

// Formats a print area's real per-size measurements (max_dim_in, or
// max_width_in x max_height_in for sleeves) as a single "9.00" – 10.00"" or
// "2.80" × 3.10"" summary — a single value when it doesn't vary by size.
function printAreaDims(area) {
  const specs = area.size_specs || []
  if (!specs.length) return null
  const fmt = (n) => Number(n).toFixed(2)
  const range = (vals) => {
    const uniq = [...new Set(vals.map(fmt))]
    return uniq.length === 1 ? uniq[0] : `${fmt(Math.min(...vals))}–${fmt(Math.max(...vals))}`
  }
  if (area.size_mode === 'box') {
    return `${range(specs.map(s => +s.max_width_in))}" × ${range(specs.map(s => +s.max_height_in))}"`
  }
  return `${range(specs.map(s => +s.max_dim_in))}"`
}
</script>

<template>
  <div class="flex gap-5 items-start">

    <!-- ── Sidebar ─────────────────────────────────────────────────────────── -->
    <aside class="w-48 shrink-0 sticky top-4">
      <div class="card p-4">
        <p class="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-3">Categories</p>
        <nav class="space-y-0.5">
          <button @click="selectedCat = null"
            class="flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm transition"
            :class="!selectedCat ? 'bg-accent text-white font-semibold' : 'text-text-primary hover:bg-sidebar-bg'">
            <span>All Products</span>
            <span class="text-xs opacity-75">{{ products.length }}</span>
          </button>
          <template v-for="cat in categoryTree" :key="cat.slug">
            <button @click="selectedCat = cat.slug"
              class="flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm transition"
              :class="selectedCat === cat.slug ? 'bg-accent text-white font-semibold' : 'text-text-primary hover:bg-sidebar-bg'">
              <span class="truncate text-left">{{ cat.name }}</span>
              <span class="text-xs opacity-70 ml-1 shrink-0">{{ cat.count }}</span>
            </button>
            <button v-for="child in cat.children" :key="child.slug"
              @click="selectedCat = child.slug"
              class="flex items-center justify-between w-full pl-6 pr-3 py-1.5 rounded-lg text-xs transition"
              :class="selectedCat === child.slug ? 'bg-accent text-white font-semibold' : 'text-text-secondary hover:bg-sidebar-bg'">
              <span class="truncate text-left">{{ child.name }}</span>
              <span class="opacity-70 ml-1 shrink-0">{{ child.count }}</span>
            </button>
          </template>
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

      <!-- Search + filters -->
      <div class="flex flex-wrap items-end gap-3">
        <input v-model="search" placeholder="Search products…"
          class="flex-1 min-w-[160px] rounded-lg border border-card-border px-3 py-2 text-sm" />
        <label class="flex flex-col gap-0.5">
          <span class="text-[11px] text-text-secondary px-0.5">Brand</span>
          <select v-model="selectedBrand"
            class="rounded-lg border border-card-border px-3 py-2 text-sm bg-white min-w-[110px]">
            <option value="">All</option>
            <option v-for="b in brands" :key="b" :value="b">{{ b }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-0.5">
          <span class="text-[11px] text-text-secondary px-0.5">Age</span>
          <select v-model="selectedAge"
            class="rounded-lg border border-card-border px-3 py-2 text-sm bg-white min-w-[110px]">
            <option value="">All</option>
            <option v-for="a in ages" :key="a" :value="a">{{ a }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-0.5">
          <span class="text-[11px] text-text-secondary px-0.5">Subcategory</span>
          <select v-model="selectedSubcat"
            class="rounded-lg border border-card-border px-3 py-2 text-sm bg-white min-w-[140px]">
            <option value="">All</option>
            <option v-for="s in subcatOptions" :key="s" :value="s">{{ s }}</option>
          </select>
        </label>
        <button v-if="selectedCat || selectedBrand || selectedAge || selectedSubcat || search"
          @click="clearAllFilters" class="text-sm text-accent hover:underline px-2">
          Clear All
        </button>
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
          <p v-if="detailProduct.description" class="text-sm text-text-secondary whitespace-pre-line">
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
                {{ a.name }}<template v-if="printAreaDims(a)"> · {{ printAreaDims(a) }}</template>
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
