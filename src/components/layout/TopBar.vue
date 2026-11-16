<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { notificationsApi } from '@/api/endpoints'

const router = useRouter()
const auth   = useAuthStore()

const balance       = computed(() => Number(auth.user?.profile?.balance ?? 0))
const lang          = ref('EN')
const showProfile   = ref(false)

// ── Notifications ─────────────────────────────────────────────────────────
const unreadCount    = ref(0)
const notifOpen      = ref(false)
const notifications  = ref([])
const notifLoading    = ref(false)
let pollHandle = null

async function loadUnreadCount() {
  try {
    const { data } = await notificationsApi.unreadCount()
    unreadCount.value = data.count
  } catch {
    // silent — this just controls a badge
  }
}

async function toggleNotifications() {
  notifOpen.value = !notifOpen.value
  if (notifOpen.value) {
    notifLoading.value = true
    try {
      const { data } = await notificationsApi.list({ page_size: 10 })
      notifications.value = data.results ?? data
    } catch {
      notifications.value = []
    } finally {
      notifLoading.value = false
    }
  }
}

async function openNotification(notif) {
  notifOpen.value = false
  if (!notif.is_read) {
    try { await notificationsApi.markRead(notif.id) } catch { /* non-fatal */ }
    loadUnreadCount()
  }
  if (notif.link) router.push(notif.link)
}

onMounted(() => {
  loadUnreadCount()
  pollHandle = setInterval(loadUnreadCount, 30000)
})
onUnmounted(() => {
  if (pollHandle) clearInterval(pollHandle)
})

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

    <!-- Balance (real sub-user only — a Team Member never sees account balance).
         No "Add" button: there's no card top-up flow yet, so it had no function. -->
    <div v-if="auth.isSubUser && !auth.isTeamMember"
      class="flex items-center bg-accent-light text-accent-dark rounded-full px-3 py-1">
      <span class="text-sm font-semibold">${{ balance.toFixed(2) }}</span>
    </div>

    <!-- Notifications (non-super-admin) -->
    <div v-if="!auth.isSuperAdmin" class="relative">
      <button @click="toggleNotifications"
        class="relative p-2 rounded-lg hover:bg-sidebar-bg" aria-label="Notifications">
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0"/>
        </svg>
        <span v-if="unreadCount" class="absolute -top-0.5 -right-0.5 badge bg-red-500 text-white text-[10px] w-4 h-4 p-0 flex items-center justify-center">{{ unreadCount }}</span>
      </button>

      <div v-if="notifOpen" class="fixed inset-0 z-40" @click="notifOpen = false"></div>

      <div v-if="notifOpen" class="absolute right-0 top-full mt-1 w-80 card shadow-lg py-1 z-50 max-h-96 overflow-y-auto">
        <div class="px-3 py-2 border-b border-card-border text-xs font-semibold text-text-secondary">
          Notifications
        </div>
        <div v-if="notifLoading" class="px-3 py-6 text-center text-xs text-text-secondary">Loading…</div>
        <div v-else-if="!notifications.length" class="px-3 py-6 text-center text-xs text-text-secondary">
          No notifications yet.
        </div>
        <button v-for="n in notifications" :key="n.id" @click="openNotification(n)"
          class="w-full text-left px-3 py-2.5 border-b border-card-border last:border-0 hover:bg-sidebar-bg transition"
          :class="!n.is_read ? 'bg-accent-light/30' : ''">
          <div class="flex items-start gap-2">
            <span v-if="!n.is_read" class="w-1.5 h-1.5 rounded-full bg-accent mt-1.5 shrink-0"></span>
            <div class="min-w-0">
              <div class="text-xs font-semibold text-text-primary truncate">{{ n.title }}</div>
              <div v-if="n.body" class="text-xs text-text-secondary mt-0.5 line-clamp-2">{{ n.body }}</div>
              <div class="text-[10px] text-text-muted mt-1">{{ n.created_at?.slice(0, 16).replace('T', ' ') }}</div>
            </div>
          </div>
        </button>
      </div>
    </div>

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
