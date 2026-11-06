<script setup>
import { ref, computed, onMounted } from 'vue'
import { catalogApi } from '@/api/endpoints'
import ProductFormModal from '@/components/catalog/ProductFormModal.vue'

// ── Tab ───────────────────────────────────────────────────────────────────────
const tab = ref('my-catalog')

function switchTab(t) {
  tab.value = t
  if (t === 'platform' && !platformLoaded.value) loadPlatform()
}

// ── Feedback ──────────────────────────────────────────────────────────────────
const error   = ref('')
const success = ref('')

// ── Badge ─────────────────────────────────────────────────────────────────────
const badgeCls   = b => ({ popular: 'bg-blue-100 text-blue-700', new: 'bg-emerald-100 text-emerald-700', bestseller: 'bg-amber-100 text-amber-700' }[b] ?? '')
const badgeLabel = { popular: 'Popular', new: 'New', bestseller: 'Bestseller' }

// ── Categories (for the parent/subcategory tree + filters) ────────────────────
const allCategories = ref([])
async function loadCategories() {
  try {
    const { data } = await catalogApi.categories()
    allCategories.value = data.results ?? data
  } catch { allCategories.value = [] }
}

// Builds a 2-level { ...category, count, children: [...] } tree from a flat
// product list (product.category is the category SLUG, as the list serializer
// sends it) — shared by both tabs below.
function buildCategoryTree(products) {
  const countBySlug = {}
  for (const p of products) {
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
}

// ─────────────────────────────────────────────────────────────────────────────
// MY CATALOG
// ─────────────────────────────────────────────────────────────────────────────

const myProducts = ref([])
const myLoading  = ref(true)

async function loadMyCatalog() {
  myLoading.value = true; error.value = ''
  try {
    const { data } = await catalogApi.myCatalog()
    myProducts.value = data.results ?? data
  } catch { error.value = 'Failed to load catalog.' }
  finally   { myLoading.value = false }
}

async function toggleActive(product) {
  try {
    await catalogApi.updateProduct(product.id, { is_active: !product.is_active })
    product.is_active = !product.is_active
  } catch { error.value = 'Failed to update product.' }
}

async function deleteProduct(product) {
  if (!confirm(`Delete "${product.name}"?`)) return
  try {
    await catalogApi.deleteProduct(product.id)
    success.value    = 'Product deleted.'
    myProducts.value = myProducts.value.filter(p => p.id !== product.id)
  } catch { error.value = 'Delete failed.' }
}

// ── Drag-and-drop reorder (My Catalog only — manual display order) ────────────
const dragProductId = ref(null)

function onDropReorder(target) {
  const draggedId = dragProductId.value
  dragProductId.value = null
  if (!draggedId || draggedId === target.id) return
  const dragged = myProducts.value.find(p => p.id === draggedId)
  if (!dragged || dragged.category !== target.category) return // only reorder within the same category

  const siblings = myProducts.value
    .filter(p => p.category === target.category && p.id !== draggedId)
    .sort((a, b) => a.sort_order - b.sort_order)
  const idx  = siblings.findIndex(p => p.id === target.id)
  const prev = siblings[idx - 1]
  const newOrder = prev ? (prev.sort_order + target.sort_order) / 2 : target.sort_order - 1000

  dragged.sort_order = newOrder
  myProducts.value = [...myProducts.value].sort((a, b) => a.sort_order - b.sort_order)

  catalogApi.updateProduct(draggedId, { sort_order: newOrder }).catch(() => {
    error.value = 'Failed to save new order.'
    loadMyCatalog()
  })
}

// ── My catalog filters ────────────────────────────────────────────────────────
const mySelectedCat     = ref(null) // a top-level OR child category slug, from the sidebar tree
const mySelectedBrand   = ref('')
const mySelectedAge     = ref('')
const mySelectedSubcat  = ref('') // free text — independent of the Category tree, same as Age
const mySearch          = ref('')

const myCategoryTree = computed(() => buildCategoryTree(myProducts.value))

// Clicking a top-level category matches it AND every one of its subcategories;
// clicking a child (from the sidebar tree) matches just itself.
const mySelectedSlugSet = computed(() => {
  if (!mySelectedCat.value) return null
  const top = myCategoryTree.value.find(t => t.slug === mySelectedCat.value)
  return top ? new Set([top.slug, ...top.children.map(c => c.slug)]) : new Set([mySelectedCat.value])
})

const myBrands = computed(() => {
  const s = new Set(myProducts.value.map(p => p.brand).filter(Boolean))
  return [...s].sort()
})

const myAges = computed(() => {
  const s = new Set(myProducts.value.map(p => p.age).filter(Boolean))
  return [...s].sort()
})

const mySubcatOptions = computed(() => {
  const s = new Set(myProducts.value.map(p => p.subcategory).filter(Boolean))
  return [...s].sort()
})

function myClearAllFilters() {
  mySelectedCat.value = null; mySelectedBrand.value = ''; mySelectedAge.value = ''
  mySelectedSubcat.value = ''; mySearch.value = ''
}

const myFiltered = computed(() => {
  let list = myProducts.value
  if (mySelectedSlugSet.value)  list = list.filter(p => mySelectedSlugSet.value.has(p.category))
  if (mySelectedBrand.value)    list = list.filter(p => p.brand === mySelectedBrand.value)
  if (mySelectedAge.value)      list = list.filter(p => p.age === mySelectedAge.value)
  if (mySelectedSubcat.value)   list = list.filter(p => p.subcategory === mySelectedSubcat.value)
  if (mySearch.value.trim()) {
    const q = mySearch.value.toLowerCase()
    list = list.filter(p => p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
  }
  return list
})

const myGrouped = computed(() => {
  if (mySelectedCat.value) {
    const cat = allCategories.value.find(c => c.slug === mySelectedCat.value)
    return [{ key: mySelectedCat.value, name: cat?.name || mySelectedCat.value, items: myFiltered.value }]
  }
  const map = {}; const order = []
  for (const p of myFiltered.value) {
    const key  = p.category || '__other__'
    const name = p.category_name || p.category || 'Uncategorized'
    if (!map[key]) { map[key] = { key, name, items: [] }; order.push(key) }
    map[key].items.push(p)
  }
  return order.map(k => map[k])
})

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
    const { data } = await catalogApi.myCatalogProduct(product.id)
    modalTarget.value = data
  } catch { modalTarget.value = product }
  showModal.value = true
}

function onSaved() {
  showModal.value = false
  success.value   = modalMode.value === 'create' ? 'Product created.' : 'Product updated.'
  loadMyCatalog()
}

// ─────────────────────────────────────────────────────────────────────────────
// PLATFORM PRODUCTS
// ─────────────────────────────────────────────────────────────────────────────

const platformProducts = ref([])
const platformLoading  = ref(false)
const platformLoaded   = ref(false)

async function loadPlatform() {
  platformLoading.value = true
  try {
    const { data } = await catalogApi.products()
    platformProducts.value = data.results ?? data
    platformLoaded.value   = true
  } catch { error.value = 'Failed to load platform products.' }
  finally   { platformLoading.value = false }
}

// ── Platform filters ──────────────────────────────────────────────────────────
const platSelectedCat   = ref(null)
const platSelectedBrand = ref('')
const platSelectedAge   = ref('')
const platSearch        = ref('')

const platSelectedSubcat = ref('') // free text — independent of the Category tree, same as Age

const platCategoryTree = computed(() => buildCategoryTree(platformProducts.value))

const platSelectedSlugSet = computed(() => {
  if (!platSelectedCat.value) return null
  const top = platCategoryTree.value.find(t => t.slug === platSelectedCat.value)
  return top ? new Set([top.slug, ...top.children.map(c => c.slug)]) : new Set([platSelectedCat.value])
})

const platBrands = computed(() => {
  const s = new Set(platformProducts.value.map(p => p.brand).filter(Boolean))
  return [...s].sort()
})

const platAges = computed(() => {
  const s = new Set(platformProducts.value.map(p => p.age).filter(Boolean))
  return [...s].sort()
})

const platSubcatOptions = computed(() => {
  const s = new Set(platformProducts.value.map(p => p.subcategory).filter(Boolean))
  return [...s].sort()
})

function platClearAllFilters() {
  platSelectedCat.value = null; platSelectedBrand.value = ''; platSelectedAge.value = ''
  platSelectedSubcat.value = ''; platSearch.value = ''
}

const platFiltered = computed(() => {
  let list = platformProducts.value
  if (platSelectedSlugSet.value) list = list.filter(p => platSelectedSlugSet.value.has(p.category))
  if (platSelectedBrand.value)   list = list.filter(p => p.brand === platSelectedBrand.value)
  if (platSelectedAge.value)     list = list.filter(p => p.age === platSelectedAge.value)
  if (platSelectedSubcat.value)  list = list.filter(p => p.subcategory === platSelectedSubcat.value)
  if (platSearch.value.trim()) {
    const q = platSearch.value.toLowerCase()
    list = list.filter(p => p.name.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q))
  }
  return list
})

const platGrouped = computed(() => {
  if (platSelectedCat.value) {
    const cat = allCategories.value.find(c => c.slug === platSelectedCat.value)
    return [{ key: platSelectedCat.value, name: cat?.name || platSelectedCat.value, items: platFiltered.value }]
  }
  const map = {}; const order = []
  for (const p of platFiltered.value) {
    const key  = p.category || '__other__'
    const name = p.category_name || p.category || 'Uncategorized'
    if (!map[key]) { map[key] = { key, name, items: [] }; order.push(key) }
    map[key].items.push(p)
  }
  return order.map(k => map[k])
})

// ── Adopt modal ───────────────────────────────────────────────────────────────
const SIZE_ORDER = ['XS','S','SM','M','ML','L','XL','1X','1XL','2X','2XL','XXL','3X','3XL','XXXL','4XL','4X','5XL','5X','6XL']
function sizeRank(s) {
  const norm = (s||'').toUpperCase().trim()
  const i = SIZE_ORDER.indexOf(norm)
  if (i !== -1) return i
  const m = norm.match(/-?\d+(?:[.,]\d+)?/)
  return m ? 1000 + parseFloat(m[0].replace(',', '.')) : 9999
}
function sortAdoptVariants(vs) {
  return [...(vs||[])].sort((a,b) => {
    const sd = sizeRank(a.size) - sizeRank(b.size)
    return sd !== 0 ? sd : (a.color||'').localeCompare(b.color||'')
  })
}

const adoptModal   = ref(false)
const adoptSrc     = ref(null)
const adoptDetail  = ref(null)
const adoptLoading = ref(false)
const adoptError   = ref('')
const adoptRows    = ref([])   // { id, size, color, cost, weight_oz, is_dark, selected }
const adoptNewForms = ref([])  // custom new variants
const adoptBulkPrice  = ref('')
const adoptBulkWeight = ref('')

async function openAdopt(product) {
  adoptSrc.value     = product
  adoptDetail.value  = null
  adoptError.value   = ''
  adoptRows.value    = []
  adoptNewForms.value = []
  adoptBulkPrice.value  = ''
  adoptBulkWeight.value = ''
  adoptModal.value   = true
  try {
    const { data } = await catalogApi.product(product.id)
    adoptDetail.value = data
    adoptRows.value = sortAdoptVariants(data.variants).map(v => ({
      id:        v.id,
      size:      v.size  || '',
      color:     v.color || '',
      cost:      Number(v.cost ?? v.price ?? 0).toFixed(2),
      weight_oz: v.weight_oz ? String(v.weight_oz) : '',
      is_dark:   v.is_dark ?? false,
      selected:  true,
    }))
  } catch { adoptError.value = 'Failed to load product details.' }
}

const adoptAllSelected = computed(() => adoptRows.value.length > 0 && adoptRows.value.every(r => r.selected))
function toggleAdoptAll() { const v = !adoptAllSelected.value; adoptRows.value.forEach(r => r.selected = v) }

function applyAdoptBulk() {
  adoptRows.value.forEach(r => {
    if (!r.selected) return
    if (adoptBulkPrice.value  !== '') r.cost      = adoptBulkPrice.value
    if (adoptBulkWeight.value !== '') r.weight_oz = adoptBulkWeight.value
  })
  adoptBulkPrice.value = ''; adoptBulkWeight.value = ''
}

function addAdoptRow() {
  adoptNewForms.value.push({ size: '', color: '', cost: '', weight_oz: '', is_dark: false })
}
function removeAdoptRow(i) { adoptNewForms.value.splice(i, 1) }

async function submitAdopt() {
  adoptLoading.value = true; adoptError.value = ''
  try {
    const variants = [
      ...adoptRows.value.filter(r => r.selected).map(r => ({
        id:        r.id,
        cost:      r.cost || 0,
        weight_oz: r.weight_oz !== '' ? r.weight_oz : null,
        is_dark:   r.is_dark,
      })),
      ...adoptNewForms.value.map(f => ({
        size:      f.size,
        color:     f.color,
        cost:      f.cost || 0,
        weight_oz: f.weight_oz !== '' ? f.weight_oz : null,
        is_dark:   f.is_dark,
      })),
    ]
    await catalogApi.adoptProduct(adoptSrc.value.id, { variants })
    success.value    = `"${adoptSrc.value.name}" added to your catalog.`
    adoptModal.value = false
    tab.value        = 'my-catalog'
    loadMyCatalog()
  } catch (e) {
    adoptError.value = e?.response?.data?.detail ?? 'Failed to adopt product.'
  } finally { adoptLoading.value = false }
}

onMounted(() => { loadMyCatalog(); loadCategories() })
</script>

<template>
  <div class="space-y-5">

    <!-- Header -->
    <div class="flex items-center justify-between flex-wrap gap-3">
      <h1 class="text-2xl font-bold">Catalog</h1>
      <div class="flex gap-2">
        <button @click="switchTab('platform')" class="btn-secondary text-sm">Browse Platform</button>
        <button @click="openCreate"            class="btn-primary  text-sm">+ Add Custom Product</button>
      </div>
    </div>

    <!-- Feedback -->
    <div v-if="error"   class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{{ error }}</div>
    <div v-if="success" class="rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700 flex justify-between">
      {{ success }}<button @click="success = ''" class="text-emerald-500 ml-3">✕</button>
    </div>

    <!-- Tab bar -->
    <div class="flex gap-1 border-b border-card-border">
      <button v-for="t in [{ key: 'my-catalog', label: 'My Catalog' }, { key: 'platform', label: 'Platform Products' }]"
        :key="t.key" @click="switchTab(t.key)"
        class="px-4 py-2 text-sm font-medium border-b-2 -mb-px transition"
        :class="tab === t.key ? 'border-accent text-accent-dark' : 'border-transparent text-text-secondary hover:text-text-primary'">
        {{ t.label }}
        <span v-if="t.key === 'my-catalog' && myProducts.length"
          class="ml-1.5 text-xs bg-sidebar-bg text-text-muted rounded-full px-1.5 py-0.5">
          {{ myProducts.length }}
        </span>
      </button>
    </div>

    <!-- ══ MY CATALOG ════════════════════════════════════════════════════════ -->
    <div v-if="tab === 'my-catalog'" class="flex gap-5 items-start">

      <!-- Sidebar -->
      <aside class="w-48 shrink-0 sticky top-4">
        <div class="card p-4">
          <p class="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-3">Categories</p>
          <nav class="space-y-0.5">
            <button @click="mySelectedCat = null"
              class="flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm transition"
              :class="!mySelectedCat ? 'bg-accent text-white font-semibold' : 'text-text-primary hover:bg-sidebar-bg'">
              <span>All Products</span>
              <span class="text-xs opacity-75">{{ myProducts.length }}</span>
            </button>
            <template v-for="cat in myCategoryTree" :key="cat.slug">
              <button @click="mySelectedCat = cat.slug"
                class="flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm transition"
                :class="mySelectedCat === cat.slug ? 'bg-accent text-white font-semibold' : 'text-text-primary hover:bg-sidebar-bg'">
                <span class="truncate text-left">{{ cat.name }}</span>
                <span class="text-xs opacity-70 ml-1 shrink-0">{{ cat.count }}</span>
              </button>
              <button v-for="child in cat.children" :key="child.slug"
                @click="mySelectedCat = child.slug"
                class="flex items-center justify-between w-full pl-6 pr-3 py-1.5 rounded-lg text-xs transition"
                :class="mySelectedCat === child.slug ? 'bg-accent text-white font-semibold' : 'text-text-secondary hover:bg-sidebar-bg'">
                <span class="truncate text-left">{{ child.name }}</span>
                <span class="opacity-70 ml-1 shrink-0">{{ child.count }}</span>
              </button>
            </template>
          </nav>
        </div>
      </aside>

      <!-- Main -->
      <div class="flex-1 min-w-0 space-y-5">

        <!-- Search + filter -->
        <div class="flex flex-wrap items-end gap-3">
          <input v-model="mySearch" placeholder="Search my catalog…"
            class="flex-1 min-w-[160px] rounded-lg border border-card-border px-3 py-2 text-sm" />
          <label class="flex flex-col gap-0.5">
            <span class="text-[11px] text-text-secondary px-0.5">Brand</span>
            <select v-model="mySelectedBrand"
              class="rounded-lg border border-card-border px-3 py-2 text-sm bg-white min-w-[110px]">
              <option value="">All</option>
              <option v-for="b in myBrands" :key="b" :value="b">{{ b }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-0.5">
            <span class="text-[11px] text-text-secondary px-0.5">Age</span>
            <select v-model="mySelectedAge"
              class="rounded-lg border border-card-border px-3 py-2 text-sm bg-white min-w-[110px]">
              <option value="">All</option>
              <option v-for="a in myAges" :key="a" :value="a">{{ a }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-0.5">
            <span class="text-[11px] text-text-secondary px-0.5">Subcategory</span>
            <select v-model="mySelectedSubcat"
              class="rounded-lg border border-card-border px-3 py-2 text-sm bg-white min-w-[140px]">
              <option value="">All</option>
              <option v-for="s in mySubcatOptions" :key="s" :value="s">{{ s }}</option>
            </select>
          </label>
          <button v-if="mySelectedCat || mySelectedBrand || mySelectedAge || mySelectedSubcat || mySearch"
            @click="myClearAllFilters" class="text-sm text-accent hover:underline px-2">
            Clear All
          </button>
        </div>

        <!-- Loading -->
        <div v-if="myLoading" class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          <div v-for="i in 8" :key="i" class="card overflow-hidden animate-pulse">
            <div class="aspect-square bg-gray-100" />
            <div class="p-3 space-y-2">
              <div class="h-4 bg-gray-100 rounded w-3/4" />
              <div class="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          </div>
        </div>

        <!-- Empty -->
        <div v-else-if="!myProducts.length" class="card p-12 text-center text-text-secondary">
          <div class="text-4xl mb-3">📦</div>
          <div class="font-semibold">Your catalog is empty</div>
          <div class="text-sm mt-1">Add a custom product or browse the platform catalog.</div>
          <div class="flex gap-3 justify-center mt-4">
            <button @click="switchTab('platform')" class="btn-secondary text-sm">Browse Platform</button>
            <button @click="openCreate"            class="btn-primary  text-sm">+ Add Custom</button>
          </div>
        </div>

        <div v-else-if="myFiltered.length === 0" class="card p-8 text-center text-text-secondary text-sm">
          No products match the current filter.
        </div>

        <!-- Grouped sections -->
        <div v-else class="space-y-10">
          <section v-for="group in myGrouped" :key="group.key">
            <div class="flex items-baseline gap-2 mb-4">
              <h2 class="text-xl font-bold">{{ group.name }}</h2>
              <span class="text-sm text-text-muted">{{ group.items.length }}</span>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              <article v-for="p in group.items" :key="p.id"
                @dragover.prevent
                @drop="onDropReorder(p)"
                class="card overflow-hidden flex flex-col transition-shadow hover:shadow-lg"
                :class="[!p.is_active ? 'opacity-60' : '', dragProductId === p.id ? 'opacity-40' : '']">

                <!-- Square image -->
                <div class="relative bg-sidebar-bg overflow-hidden aspect-square shrink-0">
                  <img v-if="p.primary_image" :src="p.primary_image" :alt="p.name" draggable="false"
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
                  <span v-if="!p.is_active"
                    class="absolute top-2 right-2 text-[9px] font-semibold px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 uppercase">
                    Off
                  </span>
                  <span draggable="true" @dragstart="dragProductId = p.id"
                    class="absolute bottom-2 right-2 text-text-muted bg-white/80 rounded px-1 py-0.5 text-xs leading-none select-none cursor-grab active:cursor-grabbing"
                    title="Drag to reorder">⠿⠿</span>
                </div>

                <!-- Card body -->
                <div class="p-3 flex flex-col gap-2 flex-1">
                  <div class="text-sm font-semibold leading-tight line-clamp-2">{{ p.name }}</div>

                  <div class="text-xs text-text-secondary">
                    <template v-if="p.size_count">{{ p.size_count }} sizes · </template>
                    {{ p.color_count }} colors
                  </div>

                  <!-- Price -->
                  <div v-if="p.min_price != null" class="leading-none">
                    <div class="text-[10px] text-text-secondary">from</div>
                    <div class="text-base font-bold">${{ Number(p.min_price).toFixed(2) }}</div>
                  </div>

                  <!-- Actions -->
                  <div class="mt-auto pt-1 flex gap-1.5">
                    <button @click="openEdit(p)" class="btn-secondary text-xs py-1.5 flex-1">Edit</button>
                    <button @click="toggleActive(p)"
                      class="btn-secondary text-xs py-1.5 px-2 shrink-0"
                      :class="p.is_active ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'">
                      {{ p.is_active ? 'Off' : 'On' }}
                    </button>
                    <button @click="deleteProduct(p)"
                      class="btn-secondary text-xs py-1.5 px-2 shrink-0 text-red-500 hover:bg-red-50">
                      ✕
                    </button>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </div>
      </div>
    </div>

    <!-- ══ PLATFORM PRODUCTS ═════════════════════════════════════════════════ -->
    <div v-if="tab === 'platform'" class="flex gap-5 items-start">

      <!-- Sidebar -->
      <aside class="w-48 shrink-0 sticky top-4">
        <div class="card p-4">
          <p class="text-[10px] font-bold text-text-secondary uppercase tracking-widest mb-3">Categories</p>
          <nav class="space-y-0.5">
            <button @click="platSelectedCat = null"
              class="flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm transition"
              :class="!platSelectedCat ? 'bg-accent text-white font-semibold' : 'text-text-primary hover:bg-sidebar-bg'">
              <span>All Products</span>
              <span class="text-xs opacity-75">{{ platformProducts.length }}</span>
            </button>
            <template v-for="cat in platCategoryTree" :key="cat.slug">
              <button @click="platSelectedCat = cat.slug"
                class="flex items-center justify-between w-full px-3 py-2 rounded-lg text-sm transition"
                :class="platSelectedCat === cat.slug ? 'bg-accent text-white font-semibold' : 'text-text-primary hover:bg-sidebar-bg'">
                <span class="truncate text-left">{{ cat.name }}</span>
                <span class="text-xs opacity-70 ml-1 shrink-0">{{ cat.count }}</span>
              </button>
              <button v-for="child in cat.children" :key="child.slug"
                @click="platSelectedCat = child.slug"
                class="flex items-center justify-between w-full pl-6 pr-3 py-1.5 rounded-lg text-xs transition"
                :class="platSelectedCat === child.slug ? 'bg-accent text-white font-semibold' : 'text-text-secondary hover:bg-sidebar-bg'">
                <span class="truncate text-left">{{ child.name }}</span>
                <span class="opacity-70 ml-1 shrink-0">{{ child.count }}</span>
              </button>
            </template>
          </nav>
        </div>
      </aside>

      <!-- Main -->
      <div class="flex-1 min-w-0 space-y-5">

        <!-- Search + filter -->
        <div class="flex flex-wrap items-end gap-3">
          <input v-model="platSearch" placeholder="Search platform products…"
            class="flex-1 min-w-[160px] rounded-lg border border-card-border px-3 py-2 text-sm" />
          <label class="flex flex-col gap-0.5">
            <span class="text-[11px] text-text-secondary px-0.5">Brand</span>
            <select v-model="platSelectedBrand"
              class="rounded-lg border border-card-border px-3 py-2 text-sm bg-white min-w-[110px]">
              <option value="">All</option>
              <option v-for="b in platBrands" :key="b" :value="b">{{ b }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-0.5">
            <span class="text-[11px] text-text-secondary px-0.5">Age</span>
            <select v-model="platSelectedAge"
              class="rounded-lg border border-card-border px-3 py-2 text-sm bg-white min-w-[110px]">
              <option value="">All</option>
              <option v-for="a in platAges" :key="a" :value="a">{{ a }}</option>
            </select>
          </label>
          <label class="flex flex-col gap-0.5">
            <span class="text-[11px] text-text-secondary px-0.5">Subcategory</span>
            <select v-model="platSelectedSubcat"
              class="rounded-lg border border-card-border px-3 py-2 text-sm bg-white min-w-[140px]">
              <option value="">All</option>
              <option v-for="s in platSubcatOptions" :key="s" :value="s">{{ s }}</option>
            </select>
          </label>
          <button v-if="platSelectedCat || platSelectedBrand || platSelectedAge || platSelectedSubcat || platSearch"
            @click="platClearAllFilters" class="text-sm text-accent hover:underline px-2">
            Clear All
          </button>
        </div>

        <!-- Loading -->
        <div v-if="platformLoading" class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          <div v-for="i in 8" :key="i" class="card overflow-hidden animate-pulse">
            <div class="aspect-square bg-gray-100" />
            <div class="p-3 space-y-2">
              <div class="h-4 bg-gray-100 rounded w-3/4" />
              <div class="h-3 bg-gray-100 rounded w-1/2" />
            </div>
          </div>
        </div>

        <div v-else-if="!platformProducts.length" class="card p-12 text-center text-text-secondary text-sm">
          No platform products available.
        </div>

        <div v-else-if="platFiltered.length === 0" class="card p-8 text-center text-text-secondary text-sm">
          No products match the current filter.
        </div>

        <!-- Grouped sections -->
        <div v-else class="space-y-10">
          <section v-for="group in platGrouped" :key="group.key">
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

                  <div class="text-xs text-text-secondary">
                    <template v-if="p.size_count">{{ p.size_count }} sizes · </template>
                    {{ p.color_count }} colors
                  </div>

                  <!-- Base price + action -->
                  <div class="mt-auto pt-2 flex items-end justify-between gap-2">
                    <div class="leading-none">
                      <div class="text-[10px] text-text-secondary">from</div>
                      <div class="text-base font-bold">${{ Number(p.base_price).toFixed(2) }}</div>
                    </div>
                    <button @click="openAdopt(p)"
                      class="btn-primary text-xs px-3 py-1.5 shrink-0">
                      + Add to Catalog
                    </button>
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
    role="print_center"
    :product="modalTarget"
    @saved="onSaved"
    @close="showModal = false"
  />

  <!-- Adopt modal -->
  <Teleport to="body">
    <div v-if="adoptModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        <!-- Header -->
        <div class="px-6 py-4 border-b border-card-border shrink-0 flex items-center justify-between">
          <div>
            <h3 class="font-semibold text-lg">Add to My Catalog</h3>
            <div class="text-sm text-text-secondary mt-0.5">
              <span class="font-medium text-text-primary">{{ adoptSrc?.name }}</span>
              <span class="font-mono text-xs ml-2">{{ adoptSrc?.sku }}</span>
            </div>
          </div>
          <button @click="adoptModal = false" class="text-text-muted hover:text-text-primary text-xl leading-none">✕</button>
        </div>

        <!-- Body -->
        <div class="flex-1 overflow-y-auto p-6 space-y-4">
          <div v-if="adoptError" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{{ adoptError }}</div>

          <!-- Loading skeleton -->
          <div v-if="!adoptDetail" class="space-y-2">
            <div v-for="i in 5" :key="i" class="h-10 rounded-lg animate-pulse bg-gray-100" />
          </div>

          <template v-else>

            <!-- Bulk set bar -->
            <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-sidebar-bg rounded-xl border border-card-border">
              <span class="text-xs font-medium text-text-secondary shrink-0">Bulk set selected:</span>
              <div class="flex items-center gap-1.5">
                <span class="text-xs text-text-muted">Price $</span>
                <input v-model="adoptBulkPrice" type="number" step="0.01" min="0" placeholder="0.00"
                  class="w-24 rounded-lg border border-card-border px-2 py-1 text-sm" />
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-xs text-text-muted">Weight oz</span>
                <input v-model="adoptBulkWeight" type="number" step="0.01" min="0" placeholder="0"
                  class="w-20 rounded-lg border border-card-border px-2 py-1 text-sm" />
              </div>
              <button @click="applyAdoptBulk" class="btn-primary text-xs py-1.5 px-3 shrink-0">Apply</button>
            </div>

            <!-- Variants table -->
            <div v-if="adoptRows.length" class="rounded-xl border border-card-border overflow-hidden">
              <table class="w-full text-sm">
                <thead class="bg-sidebar-bg text-xs text-text-secondary">
                  <tr>
                    <th class="px-3 py-2 w-8">
                      <input type="checkbox" :checked="adoptAllSelected" @change="toggleAdoptAll" class="accent-accent" />
                    </th>
                    <th class="text-left px-3 py-2">{{ adoptDetail.variant1_label || 'Size' }}</th>
                    <th class="text-left px-3 py-2">{{ adoptDetail.variant2_label || 'Color' }}</th>
                    <th class="text-left px-3 py-2">Price ($) *</th>
                    <th class="text-left px-3 py-2">Weight (oz)</th>
                    <th class="text-center px-3 py-2">Dark?</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-card-border">
                  <tr v-for="(row, i) in adoptRows" :key="i"
                    :class="row.selected ? 'hover:bg-sidebar-bg/40' : 'opacity-40'">
                    <td class="px-3 py-1.5">
                      <input type="checkbox" v-model="row.selected" class="accent-accent" />
                    </td>
                    <td class="px-3 py-1.5 font-medium">{{ row.size || '—' }}</td>
                    <td class="px-3 py-1.5 text-text-secondary">{{ row.color || '—' }}</td>
                    <td class="px-2 py-1.5">
                      <input v-model="row.cost" type="number" step="0.01" min="0" placeholder="0.00"
                        class="w-24 rounded-lg border border-card-border px-2 py-1 text-sm" />
                    </td>
                    <td class="px-2 py-1.5">
                      <input v-model="row.weight_oz" type="number" step="0.01" min="0" placeholder="0"
                        class="w-20 rounded-lg border border-card-border px-2 py-1 text-sm" />
                    </td>
                    <td class="px-3 py-1.5 text-center">
                      <input type="checkbox" v-model="row.is_dark" class="accent-accent" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div v-else class="text-sm text-text-muted text-center py-4">No variants on this product yet.</div>

            <!-- Custom new variants -->
            <div v-if="adoptNewForms.length" class="space-y-2">
              <div class="text-xs font-medium text-text-secondary">Custom Variants</div>
              <div v-for="(f, i) in adoptNewForms" :key="i"
                class="grid grid-cols-2 gap-2 sm:grid-cols-5 items-end p-3 rounded-xl border border-card-border bg-sidebar-bg/40">
                <div>
                  <label class="text-xs text-text-muted block mb-1">{{ adoptDetail.variant1_label || 'Size' }}</label>
                  <input v-model="f.size" type="text" class="w-full rounded-lg border border-card-border px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label class="text-xs text-text-muted block mb-1">{{ adoptDetail.variant2_label || 'Color' }}</label>
                  <input v-model="f.color" type="text" class="w-full rounded-lg border border-card-border px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label class="text-xs text-text-muted block mb-1">Price ($) *</label>
                  <input v-model="f.cost" type="number" step="0.01" min="0" class="w-full rounded-lg border border-card-border px-2 py-1.5 text-sm" />
                </div>
                <div>
                  <label class="text-xs text-text-muted block mb-1">Weight (oz)</label>
                  <input v-model="f.weight_oz" type="number" step="0.01" min="0" class="w-full rounded-lg border border-card-border px-2 py-1.5 text-sm" />
                </div>
                <div class="flex items-center gap-2">
                  <label class="flex items-center gap-1 text-xs text-text-secondary cursor-pointer">
                    <input type="checkbox" v-model="f.is_dark" class="accent-accent" /> Dark
                  </label>
                  <button @click="removeAdoptRow(i)" class="text-red-400 hover:text-red-600 text-lg leading-none ml-auto">✕</button>
                </div>
              </div>
            </div>

            <button @click="addAdoptRow" class="btn-secondary text-sm w-full">+ Add Custom Variant</button>

            <div class="text-xs text-text-muted text-right">
              {{ adoptRows.filter(r => r.selected).length + adoptNewForms.length }} variants will be created
            </div>
          </template>
        </div>

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-card-border flex gap-3 shrink-0">
          <button @click="adoptModal = false" class="btn-secondary flex-1 text-sm">Cancel</button>
          <button @click="submitAdopt" :disabled="adoptLoading || !adoptDetail"
            class="btn-primary flex-1 text-sm disabled:opacity-50">
            {{ adoptLoading ? 'Adding…' : 'Add to My Catalog' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
