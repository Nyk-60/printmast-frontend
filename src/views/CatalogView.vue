<script setup>
import { ref, computed } from 'vue'

const categories = [
  { key: 'all', label: 'All Products', count: 47 },
  { key: 't-shirts', label: 'T-Shirts', count: 12 },
  { key: 'sweatshirts', label: 'Sweatshirts', count: 8 },
  { key: 'hoodies', label: 'Hoodies', count: 7 },
  { key: 'joggers', label: 'Joggers', count: 4 },
  { key: 'youth', label: 'Youth & Kids', count: 6 },
  { key: 'baby', label: 'Baby & Infant', count: 5 },
  { key: 'canvas', label: 'Canvas Prints', count: 3 },
  { key: 'drinkware', label: 'Drinkware', count: 2 }
]

const brands = ['Gildan', 'Bella+Canvas', 'Comfort Colors', 'Rabbit Skins', 'Next Level', 'Independent Trading']

const activeCategory = ref('all')
const activeBrand = ref('')
const search = ref('')

const products = ref([
  { id: 1, name: 'Unisex Heavy Cotton Tee', brand: 'Gildan', sku: 'G500', price: 8.50, badge: 'popular', category: 't-shirts' },
  { id: 2, name: 'Premium Unisex Tee', brand: 'Bella+Canvas', sku: 'BC3001', price: 9.75, badge: 'bestseller', category: 't-shirts' },
  { id: 3, name: 'Garment-Dyed Heavyweight', brand: 'Comfort Colors', sku: 'C1717', price: 11.20, badge: 'new', category: 't-shirts' },
  { id: 4, name: 'Crewneck Sweatshirt', brand: 'Gildan', sku: 'G180', price: 16.40, category: 'sweatshirts' },
  { id: 5, name: 'Pullover Hoodie', brand: 'Independent Trading', sku: 'SS4500', price: 24.90, badge: 'popular', category: 'hoodies' }
])

const filtered = computed(() =>
  products.value.filter((p) =>
    (activeCategory.value === 'all' || p.category === activeCategory.value) &&
    (!activeBrand.value || p.brand === activeBrand.value) &&
    (!search.value || p.name.toLowerCase().includes(search.value.toLowerCase()))
  )
)

const badgeClass = (b) => ({
  popular: 'badge-popular',
  new: 'badge-new',
  bestseller: 'badge-best'
}[b])
</script>

<template>
  <div class="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
    <aside class="card p-4 h-fit">
      <h3 class="font-semibold mb-3">Categories</h3>
      <ul class="space-y-1">
        <li v-for="c in categories" :key="c.key">
          <button @click="activeCategory = c.key"
            class="w-full text-left flex justify-between px-3 py-2 rounded-lg text-sm transition"
            :class="activeCategory === c.key ? 'bg-accent-light text-accent-dark font-medium' : 'hover:bg-sidebar-bg'">
            <span>{{ c.label }}</span>
            <span class="text-text-muted">{{ c.count }}</span>
          </button>
        </li>
      </ul>
    </aside>

    <div class="space-y-4">
      <div class="card p-3 flex flex-wrap items-center gap-3">
        <input v-model="search" placeholder="Search products…"
          class="flex-1 min-w-[200px] rounded-lg border border-card-border px-3 py-2 text-sm" />
        <select v-model="activeBrand" class="rounded-lg border border-card-border px-3 py-2 text-sm">
          <option value="">All Brands</option>
          <option v-for="b in brands" :key="b" :value="b">{{ b }}</option>
        </select>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        <article v-for="p in filtered" :key="p.id" class="card overflow-hidden hover:shadow-md transition">
          <div class="aspect-[6/5] bg-[#f8f8f8] flex items-center justify-center text-text-muted text-sm">
            Image 6:5
          </div>
          <div class="p-4">
            <div class="flex items-center justify-between">
              <span class="text-xs text-text-secondary">{{ p.brand }}</span>
              <span v-if="p.badge" :class="badgeClass(p.badge)">{{ p.badge }}</span>
            </div>
            <h3 class="font-semibold mt-1">{{ p.name }}</h3>
            <div class="text-xs text-text-muted">{{ p.sku }}</div>
            <div class="mt-3 flex items-center justify-between">
              <span class="font-bold">${{ p.price.toFixed(2) }}</span>
              <button class="btn-primary !py-1.5 text-xs">Select</button>
            </div>
          </div>
        </article>
      </div>
    </div>
  </div>
</template>
