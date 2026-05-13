<script setup>
import { RouterLink } from 'vue-router'

const navItems = [
  { name: 'dashboard', label: 'Dashboard', icon: 'M3 12l9-9 9 9M5 10v10h14V10' },
  { name: 'catalog', label: 'Catalog', icon: 'M4 6h16M4 12h16M4 18h16' },
  { name: 'orders', label: 'Orders', icon: 'M9 5h6l1 2h3v12H5V7h3z', badge: 14 },
  { name: 'payments', label: 'Payments', icon: 'M3 7h18v10H3zM3 11h18' },
  { name: 'designs', label: 'Design Library', icon: 'M4 4h16v16H4zM8 8h8v8H8z' },
  { name: 'education', label: 'Education Portal', icon: 'M12 14l9-5-9-5-9 5 9 5z' },
  { name: 'analysis', label: 'Analysis', icon: 'M3 3v18h18M7 15l4-4 4 4 5-5' }
]
</script>

<template>
  <aside class="w-60 shrink-0 bg-sidebar-bg flex flex-col">
    <div class="px-5 py-5 border-b border-sidebar-active/40">
      <div class="text-2xl font-extrabold text-accent-dark">printmast</div>
      <div class="text-[10px] tracking-[0.3em] text-text-secondary mt-1">COLORS OF US</div>
    </div>

    <div class="p-4">
      <div class="relative">
        <input
          type="text"
          placeholder="Search…"
          class="w-full rounded-lg border border-sidebar-active/50 bg-white/60 px-3 py-2 text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
      </div>
    </div>

    <nav class="flex-1 px-3 space-y-1">
      <RouterLink
        v-for="item in navItems"
        :key="item.name"
        :to="{ name: item.name }"
        class="group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-text-primary hover:bg-sidebar-hover transition"
        active-class="bg-sidebar-active text-accent-dark"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path :d="item.icon" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="flex-1">{{ item.label }}</span>
        <span v-if="item.badge" class="badge bg-accent text-white">{{ item.badge }}</span>
      </RouterLink>
    </nav>

    <div class="p-4 text-[11px] text-text-muted border-t border-sidebar-active/40">
      by Asya Trading LLC
    </div>
  </aside>
</template>
