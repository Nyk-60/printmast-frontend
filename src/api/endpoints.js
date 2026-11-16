import api from './client'

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authApi = {
  login:         (payload) => api.post('/auth/login/', payload),
  logout:        ()        => api.post('/auth/logout/'),
  me:            ()        => api.get('/auth/me/'),
  updateProfile: (payload) => api.patch('/auth/me/', payload),
  refresh:       (refresh) => api.post('/auth/refresh/', { refresh }),
}

// ── SuperAdmin ────────────────────────────────────────────────────────────────

export const superAdminApi = {
  // Dashboard stats
  dashboardStats:     ()               => api.get('/auth/superadmin/dashboard-stats/'),

  // Print center management
  printCenters:       (params)         => api.get('/auth/superadmin/print-centers/', { params }),
  printCenter:        (pk)             => api.get(`/auth/superadmin/print-centers/${pk}/`),
  createPrintCenter:  (formData)       => api.post('/auth/superadmin/print-centers/create/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  updatePrintCenter:  (pk, formData)   => api.patch(`/auth/superadmin/print-centers/${pk}/`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  impersonatePrintCenter: (pk)         => api.post(`/auth/superadmin/print-centers/${pk}/impersonate/`),
  printCenterAnalytics:   (pk, params) => api.get(`/auth/superadmin/print-centers/${pk}/analytics/`, { params }),
  printCenterAnalyticsXlsx: (pk, params) => api.get(
    `/auth/superadmin/print-centers/${pk}/analytics/`,
    { params: { ...params, format: 'xlsx' }, responseType: 'blob' },
  ),

  // Pricing tiers
  pricingTiers:       (pk)             => api.get(`/auth/superadmin/print-centers/${pk}/tiers/`),
  createPricingTier:  (pk, payload)    => api.post(`/auth/superadmin/print-centers/${pk}/tiers/`, payload),
  updatePricingTier:  (pk, tpk, data)  => api.patch(`/auth/superadmin/print-centers/${pk}/tiers/${tpk}/`, data),
  deletePricingTier:  (pk, tpk)        => api.delete(`/auth/superadmin/print-centers/${pk}/tiers/${tpk}/`),

  // Invoices
  invoices:           (params)         => api.get('/auth/superadmin/invoices/', { params }),
  updateInvoice:      (pk, payload)    => api.patch(`/auth/superadmin/invoices/${pk}/`, payload),

  // Platform catalog — products
  products:           (params)         => api.get('/catalog/platform-products/', { params }),
  product:            (pk)             => api.get(`/catalog/platform-products/${pk}/`),
  createProduct:      (payload)        => api.post('/catalog/platform-products/', payload),
  updateProduct:      (pk, payload)    => api.patch(`/catalog/platform-products/${pk}/`, payload),
  deleteProduct:      (pk)             => api.delete(`/catalog/platform-products/${pk}/`),

  // Platform product variants
  productVariants:      (pk)               => api.get(`/catalog/platform-products/${pk}/variants/`),
  createVariant:        (pk, payload)      => api.post(`/catalog/platform-products/${pk}/variants/`, payload),
  updateVariant:        (pk, vpk, payload) => api.patch(`/catalog/platform-products/${pk}/variants/${vpk}/`, payload),
  deleteVariant:        (pk, vpk)          => api.delete(`/catalog/platform-products/${pk}/variants/${vpk}/`),

  // Excel template & bulk upload
  downloadTemplate:   ()               => api.get('/catalog/platform-products/template/', { responseType: 'blob' }),
  uploadProducts:     (formData)       => api.post('/catalog/platform-products/upload/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),

  // Platform catalog — categories & brands
  categories:         ()               => api.get('/catalog/categories/'),
  createCategory:     (payload)        => api.post('/catalog/categories/', payload),
  updateCategory:     (pk, payload)    => api.patch(`/catalog/categories/${pk}/`, payload),
  deleteCategory:     (pk)             => api.delete(`/catalog/categories/${pk}/`),
  brands:             ()               => api.get('/catalog/brands/'),
  createBrand:        (payload)        => api.post('/catalog/brands/', payload),
  updateBrand:        (pk, payload)    => api.patch(`/catalog/brands/${pk}/`, payload),
  deleteBrand:        (pk)             => api.delete(`/catalog/brands/${pk}/`),
}

// ── Sub-user management (Print Center) ───────────────────────────────────────

export const subUsersApi = {
  list:         (params)          => api.get('/auth/print-center/sub-users/', { params }),
  create:       (payload)         => api.post('/auth/print-center/sub-users/', payload),
  detail:       (pk)              => api.get(`/auth/print-center/sub-users/${pk}/`),
  update:       (pk, payload)     => api.patch(`/auth/print-center/sub-users/${pk}/`, payload),
  remove:       (pk)              => api.delete(`/auth/print-center/sub-users/${pk}/`),
  toggleActive: (pk)              => api.post(`/auth/print-center/sub-users/${pk}/toggle-active/`),
  addBalance:   (pk, payload)     => api.post(`/auth/print-center/sub-users/${pk}/add-balance/`, payload),
  transactions: (pk, params)      => api.get(`/auth/print-center/sub-users/${pk}/transactions/`, { params }),
}

// ── Team member management (Sub-user) ────────────────────────────────────────

export const teamMembersApi = {
  list:      (params)      => api.get('/auth/my/team-members/', { params }),
  create:    (payload)     => api.post('/auth/my/team-members/', payload),
  update:    (pk, payload) => api.patch(`/auth/my/team-members/${pk}/`, payload),
  setStores: (pk, storeIds) => api.patch(`/auth/my/team-members/${pk}/stores/`, { store_ids: storeIds }),
}

// ── Catalog ───────────────────────────────────────────────────────────────────

export const catalogApi = {
  // Platform catalog
  categories:   ()       => api.get('/catalog/categories/'),
  brands:       ()       => api.get('/catalog/brands/'),
  products:     (params) => api.get('/catalog/platform-products/', { params }),
  product:      (id)     => api.get(`/catalog/platform-products/${id}/`),
  adoptProduct: (id, payload) => api.post(`/catalog/platform-products/${id}/adopt/`, payload),

  // Print center catalog management
  myCatalog:        (params)           => api.get('/catalog/my-catalog/', { params }),
  myCatalogProduct: (pk)               => api.get(`/catalog/my-catalog/${pk}/`),
  createProduct:    (payload)          => api.post('/catalog/my-catalog/create/', payload),
  updateProduct:    (pk, payload)      => api.patch(`/catalog/my-catalog/${pk}/`, payload),
  deleteProduct:    (pk)               => api.delete(`/catalog/my-catalog/${pk}/`),
  createVariant:    (pk, payload)      => api.post(`/catalog/my-catalog/${pk}/variants/`, payload),
  updateVariant:    (pk, vpk, payload) => api.patch(`/catalog/my-catalog/${pk}/variants/${vpk}/`, payload),
  deleteVariant:    (pk, vpk)          => api.delete(`/catalog/my-catalog/${pk}/variants/${vpk}/`),

  // Variant dimension rules
  dimRules:         (pk, vpk)             => api.get(`/catalog/my-catalog/${pk}/variants/${vpk}/rules/`),
  createDimRule:    (pk, vpk, payload)    => api.post(`/catalog/my-catalog/${pk}/variants/${vpk}/rules/`, payload),
  deleteDimRule:    (pk, vpk, rulePk)     => api.delete(`/catalog/my-catalog/${pk}/variants/${vpk}/rules/${rulePk}/`),

  // Print areas
  createPrintArea:  (pk, payload)         => api.post(`/catalog/my-catalog/${pk}/print-areas/`, payload),
  updatePrintArea:  (pk, areaPk, payload) => api.patch(`/catalog/my-catalog/${pk}/print-areas/${areaPk}/`, payload),
  deletePrintArea:  (pk, areaPk)          => api.delete(`/catalog/my-catalog/${pk}/print-areas/${areaPk}/`),

  // Print area size specs (size × print area dimension grid)
  printAreaDims:    (pk)          => api.get(`/catalog/my-catalog/${pk}/print-area-dims/`),
  savePrintAreaDims:(pk, data)    => api.post(`/catalog/my-catalog/${pk}/print-area-dims/`, data),

  // Sub-user: read-only view of print center catalog
  subCatalog:              (params)        => api.get('/catalog/sub-catalog/', { params }),
  subCatalogProduct:       (pk)            => api.get(`/catalog/sub-catalog/${pk}/`),
  exportCatalog:           ()              => api.get('/catalog/sub-catalog/export/', { responseType: 'blob' }),
  exportQuoteCatalog:      ()              => api.get('/catalog/my-catalog/quote-export/', { responseType: 'blob' }),
  colorClassification:     (pk)            => api.get(`/catalog/sub-catalog/${pk}/color-classification/`),
  setColorClassification:  (pk, payload)   => api.put(`/catalog/sub-catalog/${pk}/color-classification/`, payload),
}

// ── Orders ────────────────────────────────────────────────────────────────────

export const ordersApi = {
  list:            (params)                  => api.get('/orders/', { params }),
  tabCounts:       (params)                  => api.get('/orders/tab-counts/', { params }),
  activityLog:     (search)                  => api.get('/orders/activity-log/', { params: { search } }),
  pcUpdateAddress: (id, payload)             => api.patch(`/orders/${id}/pc-address/`, payload),
  readyForPrintSummary: (params)             => api.get('/orders/ready-for-print-summary/', { params }),
  detail:          (id)                      => api.get(`/orders/${id}/`),
  updateAddress:   (id, payload)             => api.patch(`/orders/${id}/address/`, payload),
  match:           (id, items)               => api.post(`/orders/${id}/match/`, items),
  autoMatch:       (id)                      => api.post(`/orders/${id}/auto-match/`),
  updatePersonalization: (id, itemPk, text) => api.patch(
    `/orders/${id}/items/${itemPk}/personalization/`,
    { personalization: text },
  ),
  updateQuantity:  (id, itemPk, quantity)    => api.patch(
    `/orders/${id}/items/${itemPk}/quantity/`,
    { quantity },
  ),
  addItem:         (id, payload)             => api.post(`/orders/${id}/items/`, payload),
  cloneItem:       (id, itemPk)               => api.post(`/orders/${id}/items/${itemPk}/clone/`),
  deleteItem:      (id, itemPk)               => api.delete(`/orders/${id}/items/${itemPk}/`),
  updateSku:       (id, itemPk, sku)          => api.patch(`/orders/${id}/items/${itemPk}/sku/`, { sku }),
  uploadItemImage: (id, itemPk, formData)    => api.post(
    `/orders/${id}/items/${itemPk}/image/`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  ),
  uploadDesign:    (id, itemPk, formData)    => api.post(
    `/orders/${id}/items/${itemPk}/design/`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  ),
  listDesigns:     (id, itemPk)              => api.get(`/orders/${id}/items/${itemPk}/designs/`),
  deleteDesign:        (id, itemPk, designPk)     => api.delete(`/orders/${id}/items/${itemPk}/design/${designPk}/`),
  deleteLibraryDesign: (id, itemPk, skuDesignPk) => api.delete(`/orders/${id}/items/${itemPk}/library-design/${skuDesignPk}/`),
  uploadLabel:     (id, formData)            => api.post(
    `/orders/${id}/upload-label/`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  ),
  labelPreview:    (id)                      => api.get(`/orders/${id}/label-preview/`, { responseType: 'blob' }),
  removeLabel:     (id)                      => api.delete(`/orders/${id}/label/`),
  selectShipping:  (id, payload)             => api.post(`/orders/${id}/select-shipping/`, payload),
  sendToPrint:     (id)                      => api.post(`/orders/${id}/send-to-print/`),
  recall:          (id)                      => api.post(`/orders/${id}/recall/`),
  cancel:          (id)                      => api.post(`/orders/${id}/cancel/`),
  hide:            (id)                      => api.post(`/orders/${id}/hide/`),
  setShippingOverride: (id, payload)         => api.patch(`/orders/${id}/shipping-override/`, payload),
  setShippingCategory: (id, category)        => api.patch(`/orders/${id}/shipping-category/`, { category }),
  updateNotes:         (id, payload)         => api.patch(`/orders/${id}/notes/`, payload),
  resyncShipstation:   (id)                  => api.post(`/orders/${id}/resync-shipstation/`),
  setTag:              (id, tagId)           => api.patch(`/orders/${id}/tag/`, { tag_id: tagId }),

  // Order tags
  listTags:            ()                    => api.get('/orders/tags/'),
  createTag:           (payload)             => api.post('/orders/tags/', payload),
  updateTag:           (id, payload)         => api.patch(`/orders/tags/${id}/`, payload),
  deleteTag:           (id)                  => api.delete(`/orders/tags/${id}/`),

  // Product mappings
  mappings:        (params)                  => api.get('/orders/mappings/', { params }),
  mappingCount:    ()                        => api.get('/orders/mappings/count/'),
  deleteMapping:   (pk)                      => api.delete(`/orders/mappings/${pk}/`),
  downloadMappingTemplate:         ()        => api.get('/orders/mappings/template/', { responseType: 'blob' }),
  generateMappingTemplate:         ()        => api.get('/orders/mappings/generate-template/', { responseType: 'blob' }),
  exportSavedMappings:             ()        => api.get('/orders/mappings/export/', { responseType: 'blob' }),
  uploadMappings:  (formData)                => api.post(
    '/orders/mappings/upload/',
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } },
  ),

  autoMatchAll:    ()                         => api.post('/orders/auto-match-all/'),

  // Print center
  productionQueue:    (params)               => api.get('/orders/production-queue/', { params }),
  productBreakdown:   (params)               => api.get('/orders/product-breakdown/', { params }),
  productBreakdownPdf: (params)              => api.get('/orders/product-breakdown/pdf/', { params, responseType: 'blob' }),
}

// ── Designs ───────────────────────────────────────────────────────────────────

export const designsApi = {
  skuList:      (params)    => api.get('/designs/sku/', { params }),
  skuCreate:    (formData)  => api.post('/designs/sku/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  skuDetail:    (pk)        => api.get(`/designs/sku/${pk}/`),
  skuUpdate:    (pk, data)  => api.patch(`/designs/sku/${pk}/`, data),
  skuDelete:    (pk)        => api.delete(`/designs/sku/${pk}/`),

}

// ── Core ──────────────────────────────────────────────────────────────────────

export const coreApi = {
  banner: () => api.get('/core/banner/'),
}

// ── Finance ───────────────────────────────────────────────────────────────────

export const financeApi = {
  // Sub-user (own)
  mySummary:      ()        => api.get('/finance/my/summary/'),
  myTransactions: (params)  => api.get('/finance/my/transactions/', { params }),
  myDownload:     (params)  => api.get('/finance/my/download/', { params, responseType: 'blob' }),
  myInvoices:     (params)  => api.get('/finance/my/invoices/', { params }),
  myFilterOptions: (params) => api.get('/finance/my/transactions/filter-options/', { params }),

  // Print center (all sub-users)
  overview:              ()            => api.get('/finance/overview/'),
  subUserSummary:        (pk)          => api.get(`/finance/sub-users/${pk}/summary/`),
  subUserTransactions:   (pk, params)  => api.get(`/finance/sub-users/${pk}/transactions/`, { params }),
  subUserDownload:       (pk, params)  => api.get(`/finance/sub-users/${pk}/download/`, { params, responseType: 'blob' }),

  // Print center (own finance — combined across all sub-users, or ?sub_user=)
  pcSummary:       (params) => api.get('/finance/pc/summary/', { params }),
  pcTransactions:  (params) => api.get('/finance/pc/transactions/', { params }),
  pcDownload:      (params) => api.get('/finance/pc/download/', { params, responseType: 'blob' }),
  pcFilterOptions: (params) => api.get('/finance/pc/transactions/filter-options/', { params }),
  pcInvoices:     (params) => api.get('/auth/print-center/invoices/', { params }),

  // Print center — its sub-users' invoices (view + act)
  pcSubUserInvoices:      (params)                 => api.get('/finance/pc/sub-user-invoices/', { params }),
  updateSubUserInvoice:   (subUserId, invoiceId, payload) =>
    api.patch(`/finance/sub-users/${subUserId}/invoices/${invoiceId}/`, payload),
}

// ── Shipping ──────────────────────────────────────────────────────────────────

export const shippingApi = {
  // ShipStation accounts (print center)
  accounts:       ()          => api.get('/shipping/accounts/'),
  createAccount:  (payload)   => api.post('/shipping/accounts/', payload),
  updateAccount:  (pk, data)  => api.patch(`/shipping/accounts/${pk}/`, data),
  deleteAccount:  (pk)        => api.delete(`/shipping/accounts/${pk}/`),
  syncAccount:        (pk) => api.post(`/shipping/accounts/${pk}/sync/`),
  registerWebhooks:   (pk) => api.post(`/shipping/accounts/${pk}/register-webhooks/`),

  // Stores (print center + sub-user)
  stores:         (params)           => api.get('/shipping/stores/', { params }),
  updateStore:    (pk, payload)      => api.patch(`/shipping/stores/${pk}/`, payload),
  assignStore:    (pk, subUserIds)   => api.post(`/shipping/stores/${pk}/assign/`, { sub_user_ids: subUserIds }),
  syncStore:      (pk)               => api.post(`/shipping/stores/${pk}/sync/`),
  syncStoreShipFrom: (pk)            => api.post(`/shipping/stores/${pk}/sync-ship-from/`),
  syncMyStores:   ()                 => api.post('/shipping/stores/sync-mine/'),

  // PC shipping settings (ship-from address)
  pcShippingSettings:       ()        => api.get('/auth/print-center/shipping-settings/'),
  updatePcShippingSettings: (payload) => api.patch('/auth/print-center/shipping-settings/', payload),

  // Rates (sub-user)
  rates:          (payload)          => api.post('/shipping/rates/', payload),

  // Label provider accounts (print center enables/disables label-purchase sources)
  labelProviders:        ()          => api.get('/shipping/label-providers/'),
  createLabelProvider:   (payload)   => api.post('/shipping/label-providers/', payload),
  updateLabelProvider:   (pk, data)  => api.patch(`/shipping/label-providers/${pk}/`, data),
  deleteLabelProvider:   (pk)        => api.delete(`/shipping/label-providers/${pk}/`),

  // Shipping service options (print center configures per category)
  serviceOptions:        ()          => api.get('/shipping/service-options/'),
  createServiceOption:   (payload)   => api.post('/shipping/service-options/', payload),
  updateServiceOption:   (pk, data)  => api.patch(`/shipping/service-options/${pk}/`, data),
  deleteServiceOption:   (pk)        => api.delete(`/shipping/service-options/${pk}/`),

  // Fixed shipping rates (flat price table, used when pricing_mode === 'fixed')
  fixedRates:            ()          => api.get('/shipping/fixed-rates/'),
  createFixedRate:       (payload)   => api.post('/shipping/fixed-rates/', payload),
  updateFixedRate:       (pk, data)  => api.patch(`/shipping/fixed-rates/${pk}/`, data),
  deleteFixedRate:       (pk)        => api.delete(`/shipping/fixed-rates/${pk}/`),

  // Shipping service defaults (sub-user picks default per category)
  myServiceOptions:      ()          => api.get('/shipping/service-options/mine/'),
  myServiceDefaults:     ()          => api.get('/shipping/service-defaults/'),
  setMyServiceDefault:   (payload)   => api.put('/shipping/service-defaults/', payload),
}

// ── Production ────────────────────────────────────────────────────────────────

export const productionApi = {
  batches:      ()          => api.get('/production/batches/'),
  createBatch:  (payload)   => api.post('/production/batches/', payload),
  batch:        (pk)        => api.get(`/production/batches/${pk}/`),
  completeBatch:(pk)        => api.patch(`/production/batches/${pk}/`, { status: 'completed' }),
  preflight:    (payload)   => api.post('/production/batches/preflight/', payload),
  batchAction:  (pk, action)            => api.post(`/production/batches/${pk}/${action}/`),
  orderAction:  (pk, orderId, action)   => api.post(`/production/batches/${pk}/orders/${orderId}/${action}/`),
}

// ── Reship Requests ──────────────────────────────────────────────────────────

export const reshipApi = {
  list:    (params)   => api.get('/reship/', { params }),
  create:  (formData)  => api.post('/reship/create/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  approve: (pk)         => api.post(`/reship/${pk}/approve/`),
  reject:  (pk, note)   => api.post(`/reship/${pk}/reject/`, { note }),
  retryPush: (pk)       => api.post(`/reship/${pk}/retry-push/`),
}

// ── Notifications ────────────────────────────────────────────────────────────

export const notificationsApi = {
  list:         (params) => api.get('/auth/notifications/', { params }),
  unreadCount:  ()        => api.get('/auth/notifications/unread-count/'),
  markRead:     (pk)      => api.patch(`/auth/notifications/${pk}/`, { is_read: true }),
  markAllRead:  ()        => api.post('/auth/notifications/mark-all-read/'),
}
