<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const balance = ref(587.12)
const lang = ref('EN')
const notifications = ref(3)

async function handleLogout() {
  await auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <header class="h-16 bg-white border-b border-card-border flex items-center justify-end gap-3 px-6">
    <div class="flex items-center gap-2 bg-accent-light text-accent-dark rounded-full pl-3 pr-1 py-1">
      <span class="text-sm font-semibold">${{ balance.toFixed(2) }}</span>
      <button class="btn-primary !py-1 !px-3 text-xs">Add</button>
    </div>

    <button class="relative p-2 rounded-lg hover:bg-sidebar-bg" aria-label="Notifications">
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0"/>
      </svg>
      <span v-if="notifications" class="absolute -top-0.5 -right-0.5 badge bg-red-500 text-white text-[10px] w-4 h-4 p-0 flex items-center justify-center">{{ notifications }}</span>
    </button>

    <button class="p-2 rounded-lg hover:bg-sidebar-bg" aria-label="Support">
      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/>
      </svg>
    </button>

    <select v-model="lang" class="text-sm bg-transparent rounded-lg hover:bg-sidebar-bg px-2 py-1">
      <option value="EN">🇺🇸 EN</option>
      <option value="TR">🇹🇷 TR</option>
    </select>

    <div class="relative group">
      <button class="flex items-center gap-2 p-1 rounded-full hover:bg-sidebar-bg">
        <div class="w-8 h-8 rounded-full bg-accent text-white flex items-center justify-center text-sm font-semibold">
          {{ (auth.user?.email || 'U').charAt(0).toUpperCase() }}
        </div>
      </button>
      <div class="hidden group-hover:block absolute right-0 top-full mt-1 w-48 card shadow-lg py-1 z-50">
        <a class="block px-3 py-2 text-sm hover:bg-sidebar-bg cursor-pointer">My Account</a>
        <a class="block px-3 py-2 text-sm hover:bg-sidebar-bg cursor-pointer">Settings</a>
        <a class="block px-3 py-2 text-sm hover:bg-sidebar-bg cursor-pointer">Sub-users</a>
        <button @click="handleLogout" class="w-full text-left px-3 py-2 text-sm hover:bg-sidebar-bg">Log Out</button>
      </div>
    </div>
  </header>
</template>
