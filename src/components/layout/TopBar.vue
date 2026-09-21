<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth   = useAuthStore()

const balance       = computed(() => Number(auth.user?.profile?.balance ?? 0))
const lang          = ref('EN')
const notifications = ref(3)
const showProfile   = ref(false)

async function handleLogout() {
  await auth.logout()
  router.push({ name: 'login' })
}

async function handleExitImpersonation() {
  await auth.exitImpersonation()
  router.push({ name: 'print-centers' })
}
</script>

<template>
  <header class="h-16 bg-white border-b border-card-border flex items-center justify-end gap-3 px-6">

    <!-- Impersonation banner (shown when super admin is impersonating a PC) -->
    <div v-if="auth.impersonating"
      class="flex-1 flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-1.5 mr-4">
      <svg class="w-4 h-4 text-amber-600 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" stroke-linecap="round"/>
        <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" stroke-linecap="round"/>
      </svg>
      <span class="text-xs text-amber-800 font-medium">
        Viewing as: <strong>{{ auth.impersonatedPc?.company_name }}</strong>
      </span>
      <button @click="handleExitImpersonation"
        class="ml-auto text-xs font-semibold text-amber-700 hover:text-amber-900 border border-amber-300 rounded px-2 py-0.5 hover:bg-amber-100 transition">
        Exit
      </button>
    </div>

    <!-- Balance + Add (sub-user only) -->
    <div v-if="auth.isSubUser"
      class="flex items-center gap-2 bg-accent-light text-accent-dark rounded-full pl-3 pr-1 py-1">
      <span class="text-sm font-semibold">${{ balance.toFixed(2) }}</span>
      <button class="btn-primary !py-1 !px-3 text-xs">Add</button>
    </div>

    <!-- Notifications (non-super-admin) -->
    <button v-if="!auth.isSuperAdmin"
      class="relative p-2 rounded-lg hover:bg-sidebar-bg" aria-label="Notifications">
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0"/>
      </svg>
      <span v-if="notifications" class="absolute -top-0.5 -right-0.5 badge bg-red-500 text-white text-[10px] w-4 h-4 p-0 flex items-center justify-center">{{ notifications }}</span>
    </button>

    <!-- Support (non-super-admin) -->
    <button v-if="!auth.isSuperAdmin"
      class="p-2 rounded-lg hover:bg-sidebar-bg" aria-label="Support">
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>
      </svg>
    </button>

    <!-- Language (always visible) -->
    <select v-model="lang" class="text-sm bg-transparent rounded-lg hover:bg-sidebar-bg px-2 py-1">
      <option value="EN">🇺🇸 EN</option>
      <option value="TR">🇹🇷 TR</option>
    </select>

    <!-- Profile dropdown -->
    <div class="relative group">
      <button class="flex items-center gap-2 p-1 rounded-full hover:bg-sidebar-bg">
        <div class="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-sm font-semibold">
          {{ (auth.user?.email || 'U').charAt(0).toUpperCase() }}
        </div>
      </button>
      <div class="hidden group-hover:block absolute right-0 top-full mt-1 w-52 card shadow-lg py-1 z-50">
        <div class="px-3 py-2 border-b border-card-border">
          <div class="text-xs font-semibold text-text-primary truncate">{{ auth.user?.email }}</div>
          <div class="text-[11px] text-text-muted mt-0.5 capitalize">{{ auth.user?.role?.replace('_', ' ') }}</div>
        </div>
        <a class="block px-3 py-2 text-sm hover:bg-sidebar-bg cursor-pointer">Email Settings</a>
        <a class="block px-3 py-2 text-sm hover:bg-sidebar-bg cursor-pointer">Change Password</a>
        <div class="border-t border-card-border mt-1 pt-1">
          <button @click="handleLogout" class="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50">
            Sign Out
          </button>
        </div>
      </div>
    </div>

  </header>
</template>
