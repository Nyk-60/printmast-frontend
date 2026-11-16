import { defineStore } from 'pinia'
import { authApi, superAdminApi } from '@/api/endpoints'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    accessToken: localStorage.getItem('pm_access_token') || null,
    // Impersonation state
    impersonating: !!localStorage.getItem('pm_admin_token'),
    impersonatedPc: JSON.parse(localStorage.getItem('pm_impersonated_pc') || 'null'),
  }),

  getters: {
    isAuthenticated: (s) => !!s.accessToken,
    // A team member shares the sub-user panel (same menus/actions, just
    // store-restricted server-side) — isSubUser covers both on purpose.
    isSubUser:       (s) => s.user?.role === 'sub_user' || s.user?.role === 'team_member',
    isTeamMember:    (s) => s.user?.role === 'team_member',
    isPrintCenter:   (s) => s.user?.role === 'print_center',
    isSuperAdmin:    (s) => s.user?.role === 'superadmin',
  },

  actions: {
    async login(email, password) {
      const { data } = await authApi.login({ email, password })
      this.accessToken = data.access
      localStorage.setItem('pm_access_token', data.access)
      if (data.refresh) localStorage.setItem('pm_refresh_token', data.refresh)
      if (data.user) {
        this.user = data.user
      } else {
        await this.fetchMe()
      }
    },

    async fetchMe() {
      try {
        const { data } = await authApi.me()
        this.user = data
      } catch {
        this.clearSession()
      }
    },

    async logout() {
      try { await authApi.logout() } catch { /* ignore */ }
      this.clearSession()
    },

    clearSession() {
      this.user = null
      this.accessToken = null
      this.impersonating = false
      this.impersonatedPc = null
      localStorage.removeItem('pm_access_token')
      localStorage.removeItem('pm_refresh_token')
      localStorage.removeItem('pm_admin_token')
      localStorage.removeItem('pm_impersonated_pc')
    },

    async impersonate(pcId) {
      const { data } = await superAdminApi.impersonatePrintCenter(pcId)
      // Save original admin token
      localStorage.setItem('pm_admin_token', this.accessToken)
      localStorage.setItem('pm_impersonated_pc', JSON.stringify(data.print_center))
      // Switch to print center token
      this.accessToken = data.access
      localStorage.setItem('pm_access_token', data.access)
      this.impersonating = true
      this.impersonatedPc = data.print_center
      await this.fetchMe()
    },

    async exitImpersonation() {
      const adminToken = localStorage.getItem('pm_admin_token')
      if (!adminToken) return
      this.accessToken = adminToken
      localStorage.setItem('pm_access_token', adminToken)
      localStorage.removeItem('pm_admin_token')
      localStorage.removeItem('pm_impersonated_pc')
      this.impersonating = false
      this.impersonatedPc = null
      await this.fetchMe()
    },
  },
})
