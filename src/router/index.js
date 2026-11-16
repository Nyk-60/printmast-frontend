import { createRouter, createWebHistory } from 'vue-router'
import AppLayout from '@/components/layout/AppLayout.vue'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { public: true },
  },

  {
    path: '/',
    component: AppLayout,
    children: [
      { path: '', redirect: { name: 'dashboard' } },

      // ── Shared ──────────────────────────────────────────────────────────────
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/views/DashboardView.vue'),
      },

      // ── Sub-user routes ──────────────────────────────────────────────────────
      {
        path: 'orders',
        name: 'orders',
        component: () => import('@/views/OrdersView.vue'),
        meta: { roles: ['sub_user'] },
      },
      {
        path: 'catalog',
        name: 'catalog',
        component: () => import('@/views/CatalogView.vue'),
        meta: { roles: ['sub_user'] },
      },
      {
        path: 'designs',
        name: 'designs',
        component: () => import('@/views/DesignLibraryView.vue'),
        meta: { roles: ['sub_user'] },
      },
      {
        path: 'finance',
        name: 'finance',
        component: () => import('@/views/FinanceSettingsView.vue'),
        redirect: { name: 'finance-balance-history' },
        // Account-level finance (balance/debt/invoices) — a Team Member
        // never sees this, only the real sub-user does.
        meta: { roles: ['sub_user'], subUserOnly: true },
        children: [
          {
            path: 'balance-history',
            name: 'finance-balance-history',
            component: () => import('@/views/finance/BalanceHistoryView.vue'),
            meta: { roles: ['sub_user'], subUserOnly: true },
          },
          {
            path: 'invoices',
            name: 'finance-invoices',
            component: () => import('@/views/finance/InvoicesView.vue'),
            meta: { roles: ['sub_user'], subUserOnly: true },
          },
          {
            path: 'item-reports',
            name: 'finance-item-reports',
            component: () => import('@/views/finance/ItemReportsView.vue'),
            meta: { roles: ['sub_user'], subUserOnly: true },
          },
        ],
      },
      {
        path: 'my-templates',
        name: 'my-templates',
        component: () => import('@/views/MyTemplatesView.vue'),
        meta: { roles: ['sub_user'] },
      },
      {
        path: 'shipping-settings',
        name: 'shipping-settings',
        component: () => import('@/views/SubUserShippingSettingsView.vue'),
        meta: { roles: ['sub_user'] },
      },
      {
        path: 'team-members',
        name: 'team-members',
        component: () => import('@/views/TeamMembersView.vue'),
        // Only a real sub-user manages their own team — a team member doesn't
        // get this page even though it's otherwise a 'sub_user' route.
        meta: { roles: ['sub_user'], subUserOnly: true },
      },

      // ── Print Center routes ──────────────────────────────────────────────────
      {
        path: 'pc-orders',
        name: 'pc-orders',
        component: () => import('@/views/PrintCenterOrdersView.vue'),
        meta: { roles: ['print_center'] },
      },
      {
        path: 'production',
        name: 'production',
        component: () => import('@/views/ProductionView.vue'),
        meta: { roles: ['print_center'] },
      },
      {
        path: 'pc-catalog',
        name: 'pc-catalog',
        component: () => import('@/views/PrintCenterCatalogView.vue'),
        meta: { roles: ['print_center'] },
      },
      {
        path: 'shipping',
        name: 'shipping',
        component: () => import('@/views/ShippingView.vue'),
        meta: { roles: ['print_center'] },
      },
      {
        path: 'pc-shipping-settings',
        name: 'pc-shipping-settings',
        component: () => import('@/views/PrintCenterShippingSettingsView.vue'),
        redirect: { name: 'pc-shipping-ship-from' },
        meta: { roles: ['print_center'] },
        children: [
          {
            path: 'ship-from',
            name: 'pc-shipping-ship-from',
            component: () => import('@/views/shipping-settings/ShipFromView.vue'),
            meta: { roles: ['print_center'] },
          },
          {
            path: 'pricing',
            name: 'pc-shipping-pricing',
            component: () => import('@/views/shipping-settings/PricingView.vue'),
            meta: { roles: ['print_center'] },
          },
          {
            path: 'providers',
            name: 'pc-shipping-providers',
            component: () => import('@/views/shipping-settings/ProvidersView.vue'),
            meta: { roles: ['print_center'] },
          },
          {
            path: 'options',
            name: 'pc-shipping-options',
            component: () => import('@/views/shipping-settings/OptionsView.vue'),
            meta: { roles: ['print_center'] },
          },
        ],
      },
      {
        path: 'sub-users',
        name: 'sub-users',
        component: () => import('@/views/SubUsersView.vue'),
        meta: { roles: ['print_center'] },
      },
      {
        path: 'finance',
        name: 'pc-finance',
        component: () => import('@/views/PCFinanceSettingsView.vue'),
        redirect: { name: 'pc-finance-balance-history' },
        meta: { roles: ['print_center'] },
        children: [
          {
            path: 'balance-history',
            name: 'pc-finance-balance-history',
            component: () => import('@/views/finance-pc/PCBalanceHistoryView.vue'),
            meta: { roles: ['print_center'] },
          },
          {
            path: 'invoices',
            name: 'pc-finance-invoices',
            component: () => import('@/views/finance-pc/PCInvoicesView.vue'),
            meta: { roles: ['print_center'] },
          },
          {
            path: 'item-reports',
            name: 'pc-finance-item-reports',
            component: () => import('@/views/finance-pc/PCItemReportsView.vue'),
            meta: { roles: ['print_center'] },
          },
        ],
      },
      {
        path: 'reship-requests',
        name: 'reship-requests',
        component: () => import('@/views/reship/ReshipRequestsView.vue'),
        meta: { roles: ['print_center', 'sub_user'] },
      },
      {
        path: 'activity-log',
        name: 'activity-log',
        component: () => import('@/views/PrintCenterActivityLogView.vue'),
        meta: { roles: ['print_center'] },
      },

      // ── SuperAdmin routes ────────────────────────────────────────────────────
      {
        path: 'print-centers',
        name: 'print-centers',
        component: () => import('@/views/admin/PrintCentersView.vue'),
        meta: { roles: ['superadmin'] },
      },
      {
        path: 'platform-catalog',
        name: 'platform-catalog',
        component: () => import('@/views/admin/PlatformCatalogView.vue'),
        meta: { roles: ['superadmin'] },
      },
      {
        path: 'print-centers/:id/analytics',
        name: 'pc-analytics',
        component: () => import('@/views/admin/PrintCenterAnalyticsView.vue'),
        meta: { roles: ['superadmin'] },
      },

      // ── Legacy redirect ──────────────────────────────────────────────────────
      { path: 'payments', redirect: { name: 'finance' } },

      // ── Other ────────────────────────────────────────────────────────────────
      {
        path: 'education',
        name: 'education',
        component: () => import('@/views/EducationView.vue'),
      },
      {
        path: 'analysis',
        name: 'analysis',
        component: () => import('@/views/AnalysisView.vue'),
      },
    ],
  },

  { path: '/:pathMatch(.*)*', redirect: { name: 'dashboard' } },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (!to.meta.public && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'dashboard' }
  }

  // Ensure user profile is loaded before role check
  if (auth.isAuthenticated && !auth.user) {
    await auth.fetchMe()
  }

  // Role-based access guard — a team member shares every 'sub_user' route
  // (same panel, store-restricted server-side), so it's treated as one here,
  // except the few routes explicitly marked subUserOnly (e.g. managing the
  // team itself).
  if (to.meta.roles && auth.user) {
    if (to.meta.subUserOnly && auth.isTeamMember) {
      return { name: 'dashboard' }
    }
    const role = auth.user.role === 'team_member' ? 'sub_user' : auth.user.role
    if (!to.meta.roles.includes(role)) {
      return { name: 'dashboard' }
    }
  }
})

export default router
