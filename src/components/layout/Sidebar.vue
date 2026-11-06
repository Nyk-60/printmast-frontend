<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { reshipApi } from '@/api/endpoints'

const auth = useAuthStore()

const pendingReshipCount = ref(0)
onMounted(async () => {
  if (auth.isPrintCenter || auth.isSubUser) {
    try {
      const { data } = await reshipApi.list({ status: 'pending', page_size: 1 })
      pendingReshipCount.value = data.count ?? 0
    } catch { /* badge just stays 0 */ }
  }
})

const subUserNav = [
  { name: 'dashboard',  label: 'Dashboard',     icon: 'M3 12l9-9 9 9M5 10v10h14V10' },
  { name: 'orders',     label: 'Orders',         icon: 'M9 5h6l1 2h3v12H5V7h3z' },
  { name: 'catalog',    label: 'Catalog',        icon: 'M4 6h16M4 12h16M4 18h16' },
  { name: 'designs',    label: 'Design Library', icon: 'M4 4h16v16H4zM8 8h8v8H8z' },
  { name: 'finance',      label: 'Finance',        icon: 'M3 7h18v10H3zM3 11h18' },
  { name: 'reship-requests', label: 'Reship Requests', icon: 'M4 4v6h6M20 20v-6h-6M4.5 15a8 8 0 0014.3 3.4M19.5 9A8 8 0 005.2 5.6' },
  { name: 'my-templates', label: 'My Templates',   icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { name: 'shipping-settings', label: 'Shipping Settings', icon: 'M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10M3 16l2 2m-2-2h14m0 0l2-2m-2 2v-4a1 1 0 00-1-1h-1' },
  { name: 'education',    label: 'Education',      icon: 'M12 14l9-5-9-5-9 5 9 5z' },
]

const superAdminNav = [
  { name: 'dashboard',        label: 'Dashboard',        icon: 'M3 12l9-9 9 9M5 10v10h14V10' },
  { name: 'print-centers',    label: 'Print Centers',    icon: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87M15 7a4 4 0 11-8 0 4 4 0 018 0zm6 4a3 3 0 11-6 0 3 3 0 016 0zM3 11a3 3 0 116 0 3 3 0 01-6 0z' },
  { name: 'platform-catalog', label: 'Platform Catalog', icon: 'M4 6h16M4 12h16M4 18h16' },
]

const printCenterNav = [
  { name: 'dashboard',        label: 'Dashboard',    icon: 'M3 12l9-9 9 9M5 10v10h14V10' },
  { name: 'pc-orders',        label: 'Orders',       icon: 'M9 5h6l1 2h3v12H5V7h3z' },
  { name: 'production',       label: 'Production',   icon: 'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18' },
  { name: 'pc-catalog',       label: 'Catalog',      icon: 'M4 6h16M4 12h16M4 18h16' },
  { name: 'sub-users',        label: 'Sub Users',    icon: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87M15 7a4 4 0 11-8 0 4 4 0 018 0zm6 4a3 3 0 11-6 0 3 3 0 016 0zM3 11a3 3 0 116 0 3 3 0 01-6 0z' },
  { name: 'shipping',         label: 'ShipStation',  icon: 'M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10M3 16l2 2m-2-2h14m0 0l2-2m-2 2v-4a1 1 0 00-1-1h-1' },
  { name: 'pc-shipping-settings', label: 'Shipping Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  { name: 'pc-finance',       label: 'Finance',      icon: 'M3 7h18v10H3zM3 11h18' },
  { name: 'reship-requests',  label: 'Reship Requests', icon: 'M4 4v6h6M20 20v-6h-6M4.5 15a8 8 0 0014.3 3.4M19.5 9A8 8 0 005.2 5.6' },
  { name: 'activity-log',     label: 'Activity Log', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
]

const navItems = computed(() => {
  if (auth.isSuperAdmin)   return superAdminNav
  if (auth.isPrintCenter)  return printCenterNav
  return subUserNav
})

// Logo: PC users → own logo, sub-users → their PC's logo
const logoUrl = computed(() => {
  if (auth.isPrintCenter) return auth.user?.profile?.logo_url || null
  if (auth.isSubUser)     return auth.user?.profile?.print_center_logo_url || null
  return null
})

const brandInitial = computed(() => {
  if (auth.isPrintCenter) return (auth.user?.profile?.company_name || '?').charAt(0).toUpperCase()
  if (auth.isSubUser)     return (auth.user?.profile?.print_center_name || '?').charAt(0).toUpperCase()
  return '?'
})
</script>

<template>
  <aside class="w-60 shrink-0 bg-sidebar-bg flex flex-col">

    <!-- Brand / Logo area -->
    <div class="px-5 py-4 border-b border-sidebar-active/40">

      <!-- Print center or sub-user: show PC logo -->
      <template v-if="auth.isPrintCenter || auth.isSubUser">
        <div class="flex items-start">
          <img v-if="logoUrl" :src="logoUrl" alt=""
            class="max-h-14 max-w-full object-contain" />
          <div v-else
            class="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center text-accent font-bold text-lg">
            {{ brandInitial }}
          </div>
        </div>
      </template>

      <!-- Super admin: platform branding -->
      <template v-else-if="auth.isSuperAdmin">
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 rounded-lg bg-accent flex items-center justify-center shrink-0">
            <svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div>
            <div class="text-sm font-bold text-accent-dark">Admin Panel</div>
            <div class="text-[10px] text-text-muted mt-0.5">Platform Management</div>
          </div>
        </div>
      </template>

      <!-- User name: only for SA (PC/sub-user logo already identifies the brand) -->
      <div v-if="auth.isSuperAdmin && auth.user" class="mt-2 text-xs text-text-muted truncate">
        {{ auth.user.full_name || auth.user.email }}
      </div>
    </div>

    <!-- Search -->
    <div class="p-4">
      <div class="relative">
        <input
          type="text"
          placeholder="Search…"
          class="w-full rounded-lg border border-sidebar-active/50 bg-white/60 px-3 py-2 text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30"
        />
      </div>
    </div>

    <!-- Nav -->
    <nav class="flex-1 px-3 space-y-1 overflow-y-auto">
      <RouterLink
        v-for="item in navItems"
        :key="item.name"
        :to="{ name: item.name }"
        class="group flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-text-primary hover:bg-sidebar-hover transition"
        active-class="bg-sidebar-active text-accent-dark"
      >
        <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path :d="item.icon" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="flex-1">{{ item.label }}</span>
        <span v-if="item.name === 'reship-requests' && pendingReshipCount"
          class="badge bg-red-500 text-white text-[10px] w-4 h-4 p-0 flex items-center justify-center rounded-full">
          {{ pendingReshipCount }}
        </span>
      </RouterLink>
    </nav>

    <!-- Sign out -->
    <div class="p-4 border-t border-sidebar-active/40">
      <button @click="auth.logout()"
        class="w-full text-left text-xs text-text-muted hover:text-red-500 transition flex items-center gap-2">
        <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        Sign out
      </button>
    </div>
  </aside>
</template>
