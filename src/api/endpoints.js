import api from './client'

export const authApi = {
  login: (payload) => api.post('/auth/login/', payload),
  logout: () => api.post('/auth/logout/'),
  me: () => api.get('/auth/me/')
}

export const catalogApi = {
  categories: () => api.get('/catalog/categories/'),
  products: (params) => api.get('/catalog/products/', { params }),
  product: (id) => api.get(`/catalog/products/${id}/`)
}

export const ordersApi = {
  list: (params) => api.get('/orders/', { params }),
  detail: (id) => api.get(`/orders/${id}/`),
  match: (id, payload) => api.post(`/orders/${id}/match/`, payload),
  updateAddress: (id, payload) => api.patch(`/orders/${id}/address/`, payload),
  sendToProduction: (id, payload) => api.post(`/orders/${id}/send-to-production/`, payload)
}

export const paymentsApi = {
  balance: () => api.get('/payments/balance/'),
  transactions: (params) => api.get('/payments/transactions/', { params }),
  addFunds: (payload) => api.post('/payments/add-funds/', payload)
}

export const designsApi = {
  list: (params) => api.get('/designs/', { params }),
  upload: (formData) =>
    api.post('/designs/', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  skuMappings: () => api.get('/designs/sku-mappings/')
}

export const shippingApi = {
  rates: (payload) => api.post('/shipping/rates/', payload),
  stores: () => api.get('/shipping/stores/')
}
