<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ordersApi, financeApi, superAdminApi } from '@/api/endpoints'

const auth   = useAuthStore()
const router = useRouter()

// ── Sub-user dashboard ────────────────────────────────────────────────────────

const summary      = ref(null)
const recentOrders = ref([])
const suLoading    = ref(false)

async function loadSubUserData() {
  suLoading.value = true
  try {
    const [sumRes, ordRes] = await Promise.all([
      financeApi.mySummary(),
      ordersApi.list({ page_size: 5 }),
    ])
    summary.value      = sumRes.data
    recentOrders.value = ordRes.data.results ?? ordRes.data
  } catch { /* ignore */ }
  finally { suLoading.value = false }
}

// ── SuperAdmin dashboard ───────────────────────────────────────────────────────

const adminStats   = ref(null)
const adminPcs     = ref([])
const adminLoading = ref(false)

async function loadAdminData() {
  adminLoading.value = true
  try {
    const [statsRes, pcsRes] = await Promise.all([
      superAdminApi.dashboardStats(),
      superAdminApi.printCenters({ page_size: 50 }),
    ])
    adminStats.value = statsRes.data
    adminPcs.value   = pcsRes.data.results ?? pcsRes.data
  } catch { /* ignore */ }
  finally { adminLoading.value = false }
}

// ── Print Center dashboard ─────────────────────────────────────────────────────

const overview    = ref([])
const queueOrders = ref([])
const pcLoading   = ref(false)

async function loadPrintCenterData() {
  pcLoading.value = true
  try {
    const [ovRes, qRes] = await Promise.all([
      financeApi.overview(),
      ordersApi.productionQueue({ page_size: 10 }),
    ])
    overview.value    = ovRes.data
    queueOrders.value = qRes.data.results ?? qRes.data
  } catch { /* ignore */ }
  finally { pcLoading.value = false }
}

onMounted(() => {
  if (auth.isSuperAdmin)       loadAdminData()
  else if (auth.isSubUser)     loadSubUserData()
  else if (auth.isPrintCenter) loadPrintCenterData()
})

// ── Helpers ───────────────────────────────────────────────────────────────────

const totalBalance = computed(() =>
  overview.value.reduce((s, su) => s + Number(su.balance), 0)
)

const STATUS_BADGE = {
  new:           'bg-gray-100 text-gray-700',
  matching:      'bg-amber-100 text-amber-800',
  ready:         'bg-blue-100 text-blue-800',
  sent_to_print: 'bg-purple-100 text-purple-800',
  in_production: 'bg-indigo-100 text-indigo-800',
  shipped:       'bg-emerald-100 text-emerald-800',
}

const PC_STATUS_BADGE = {
  active:    'bg-emerald-100 text-emerald-800',
  pending:   'bg-amber-100 text-amber-800',
  suspended: 'bg-red-100 text-red-700',
  rejected:  'bg-gray-100 text-gray-600',
}
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">
      Welcome, {{ auth.user?.full_name || auth.user?.email }}
    </h1>

    <!-- ── SuperAdmin dashboard ─────────────────────────────────────────────── -->
    <template v-if="auth.isSuperAdmin">

      <!-- Stats skeleton -->
      <div v-if="adminLoading" class="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div v-for="i in 5" :key="i" class="card p-5 h-24 animate-pulse bg-gray-100" />
      </div>

      <!-- Stats cards -->
      <div v-else class="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div class="card p-5">
          <div class="text-xs text-text-secondary">Active Print Centers</div>
          <div class="text-3xl font-bold text-accent-dark mt-1">{{ adminStats?.active_print_centers ?? '—' }}</div>
        </div>
        <div class="card p-5">
          <div class="text-xs text-text-secondary">Active Clients</div>
          <div class="text-3xl font-bold mt-1">{{ adminStats?.active_clients ?? '—' }}</div>
        </div>
        <div class="card p-5">
          <div class="text-xs text-text-secondary">Active Shops</div>
          <div class="text-3xl font-bold text-blue-600 mt-1">{{ adminStats?.active_shops ?? '—' }}</div>
        </div>
        <div class="card p-5">
          <div class="text-xs text-text-secondary">Processed Orders</div>
          <div class="text-3xl font-bold text-emerald-600 mt-1">{{ adminStats?.processed_orders?.toLocaleString() ?? '—' }}</div>
        </div>
        <div class="card p-5">
          <div class="text-xs text-text-secondary">Processed Items</div>
          <div class="text-3xl font-bold text-purple-600 mt-1">{{ adminStats?.processed_items?.toLocaleString() ?? '—' }}</div>
        </div>
      </div>

      <!-- Print center table -->
      <div class="card overflow-hidden">
        <div class="flex items-center justify-between px-5 py-3 border-b border-card-border">
          <h3 class="font-semibold text-sm">Print Centers</h3>
          <RouterLink :to="{ name: 'print-centers' }" class="text-xs text-accent hover:underline">Manage →</RouterLink>
        </div>

        <div v-if="adminLoading" class="space-y-2 p-4">
          <div v-for="i in 4" :key="i" class="h-10 animate-pulse bg-gray-100 rounded" />
        </div>

        <div v-else-if="!adminPcs.length" class="p-8 text-center text-text-muted text-sm">
          No print centers yet.
        </div>

        <table v-else class="w-full text-sm">
          <thead class="bg-sidebar-bg text-text-secondary text-xs">
            <tr>
              <th class="text-left px-5 py-3">Company</th>
              <th class="text-left px-5 py-3">Status</th>
              <th class="text-right px-5 py-3">Clients</th>
              <th class="text-right px-5 py-3">Active Shops</th>
              <th class="text-right px-5 py-3">Awaiting</th>
              <th class="text-right px-5 py-3">Completed</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="pc in adminPcs.slice(0, 10)" :key="pc.id"
              class="border-t border-card-border hover:bg-sidebar-bg/40 transition cursor-pointer"
              @click="router.push({ name: 'print-centers' })">
              <td class="px-5 py-3 font-medium">{{ pc.company_name }}</td>
              <td class="px-5 py-3">
                <span class="badge text-xs" :class="PC_STATUS_BADGE[pc.status] ?? 'bg-gray-100'">
                  {{ pc.status }}
                </span>
              </td>
              <td class="px-5 py-3 text-right text-text-secondary">{{ pc.sub_user_count }}</td>
              <td class="px-5 py-3 text-right text-blue-600">{{ pc.active_shop_count }}</td>
              <td class="px-5 py-3 text-right text-amber-600">{{ pc.awaiting_order_count }}</td>
              <td class="px-5 py-3 text-right text-emerald-600">{{ pc.completed_order_count }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- ── Sub-user dashboard ───────────────────────────────────────────────── -->
    <template v-if="auth.isSubUser">
      <div v-if="suLoading" class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div v-for="i in 4" :key="i" class="card p-5 h-24 animate-pulse bg-gray-100" />
      </div>

      <div v-else-if="summary" class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="card p-5">
          <div class="text-xs text-text-secondary">Balance</div>
          <div class="text-3xl font-extrabold mt-1"
            :class="Number(summary.current_balance) < 0 ? 'text-red-600' : 'text-accent-dark'">
            ${{ Number(summary.current_balance).toFixed(2) }}
          </div>
        </div>
        <div class="card p-5">
          <div class="text-xs text-text-secondary">This Month Spent</div>
          <div class="text-2xl font-bold text-red-600 mt-1">
            -${{ Number(summary.this_month_debited).toFixed(2) }}
          </div>
        </div>
        <div class="card p-5">
          <div class="text-xs text-text-secondary">This Month Credited</div>
          <div class="text-2xl font-bold text-emerald-600 mt-1">
            +${{ Number(summary.this_month_credited).toFixed(2) }}
          </div>
        </div>
        <div class="card p-5">
          <div class="text-xs text-text-secondary">Total Transactions</div>
          <div class="text-2xl font-bold mt-1">{{ summary.transaction_count }}</div>
        </div>
      </div>

      <div class="card overflow-hidden">
        <div class="flex items-center justify-between px-5 py-3 border-b border-card-border">
          <h3 class="font-semibold text-sm">Recent Orders</h3>
          <RouterLink :to="{ name: 'orders' }" class="text-xs text-accent hover:underline">View all →</RouterLink>
        </div>
        <div v-if="suLoading" class="p-6 text-center text-text-secondary text-sm">Loading…</div>
        <div v-else-if="!recentOrders.length" class="p-6 text-center text-text-muted text-sm">No orders yet.</div>
        <ul v-else class="divide-y divide-card-border">
          <li v-for="o in recentOrders" :key="o.id"
            class="flex items-center justify-between px-5 py-3 text-sm">
            <div>
              <span class="font-medium">{{ o.shipstation_order_number }}</span>
              <span class="text-text-secondary ml-2">{{ o.customer_name }}</span>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-xs text-text-muted">{{ o.store_name }}</span>
              <span class="badge text-xs" :class="STATUS_BADGE[o.status] ?? 'bg-gray-100'">
                {{ o.status?.replace('_', ' ') }}
              </span>
            </div>
          </li>
        </ul>
      </div>
    </template>

    <!-- ── Print Center dashboard ────────────────────────────────────────────── -->
    <template v-else-if="auth.isPrintCenter">
      <div v-if="pcLoading" class="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div v-for="i in 3" :key="i" class="card p-5 h-24 animate-pulse bg-gray-100" />
      </div>

      <div v-else class="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div class="card p-5">
          <div class="text-xs text-text-secondary">Total Sub-Users</div>
          <div class="text-3xl font-bold mt-1">{{ overview.length }}</div>
        </div>
        <div class="card p-5">
          <div class="text-xs text-text-secondary">Awaiting Production</div>
          <div class="text-3xl font-bold text-purple-700 mt-1">{{ queueOrders.length }}</div>
        </div>
        <div class="card p-5">
          <div class="text-xs text-text-secondary">Combined Sub-User Balance</div>
          <div class="text-3xl font-bold mt-1" :class="totalBalance < 0 ? 'text-red-600' : 'text-emerald-600'">
            ${{ totalBalance.toFixed(2) }}
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Production queue -->
        <div class="card overflow-hidden">
          <div class="flex items-center justify-between px-5 py-3 border-b border-card-border">
            <h3 class="font-semibold text-sm">Production Queue</h3>
            <RouterLink :to="{ name: 'production' }" class="text-xs text-accent hover:underline">Go to Production →</RouterLink>
          </div>
          <div v-if="pcLoading" class="p-6 text-center text-text-secondary text-sm">Loading…</div>
          <div v-else-if="!queueOrders.length" class="p-6 text-center text-text-muted text-sm">Queue is empty.</div>
          <ul v-else class="divide-y divide-card-border">
            <li v-for="o in queueOrders.slice(0, 8)" :key="o.id"
              class="flex items-center justify-between px-5 py-2.5 text-sm">
              <div>
                <span class="font-medium">{{ o.shipstation_order_number }}</span>
                <span class="text-text-secondary ml-2 text-xs">{{ o.customer_name }}</span>
              </div>
              <span class="text-xs text-text-secondary">{{ o.items_count }} item(s)</span>
            </li>
          </ul>
        </div>

        <!-- Sub-user balances -->
        <div class="card overflow-hidden">
          <div class="flex items-center justify-between px-5 py-3 border-b border-card-border">
            <h3 class="font-semibold text-sm">Sub-User Balances</h3>
            <RouterLink :to="{ name: 'finance-overview' }" class="text-xs text-accent hover:underline">Full Finance →</RouterLink>
          </div>
          <div v-if="pcLoading" class="p-6 text-center text-text-secondary text-sm">Loading…</div>
          <div v-else-if="!overview.length" class="p-6 text-center text-text-muted text-sm">No sub-users.</div>
          <ul v-else class="divide-y divide-card-border">
            <li v-for="su in overview.slice(0, 8)" :key="su.sub_user_id"
              class="flex items-center justify-between px-5 py-2.5 text-sm">
              <span class="font-medium">{{ su.full_name || su.email }}</span>
              <span :class="Number(su.balance) < 0 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'">
                ${{ Number(su.balance).toFixed(2) }}
              </span>
            </li>
          </ul>
        </div>
      </div>
    </template>

    <!-- Fallback -->
    <div v-else-if="!auth.isSuperAdmin && !auth.isSubUser && !auth.isPrintCenter"
      class="card p-10 text-center text-text-muted text-sm">Loading your dashboard…</div>
  </div>
</template>
