import { defineStore } from 'pinia'
import { authApi } from '@/api/endpoints'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null,
    accessToken: localStorage.getItem('pm_access_token') || null
  }),
  getters: {
    isAuthenticated: (s) => !!s.accessToken
  },
  actions: {
    async login(email, password) {
      const { data } = await authApi.login({ email, password })
      this.accessToken = data.access
      localStorage.setItem('pm_access_token', data.access)
      if (data.user) this.user = data.user
    },
    async fetchMe() {
      const { data } = await authApi.me()
      this.user = data
    },
    async logout() {
      try { await authApi.logout() } catch (_) { /* ignore */ }
      this.user = null
      this.accessToken = null
      localStorage.removeItem('pm_access_token')
    }
  }
})
