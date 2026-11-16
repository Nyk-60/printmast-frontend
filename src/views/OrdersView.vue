<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { ordersApi, catalogApi, shippingApi } from '@/api/endpoints'
import ReshipRequestModal from './orders/ReshipRequestModal.vue'
import { confirmDialog } from '@/composables/useConfirm'
import { useAuthStore } from '@/stores/auth'
import iconBuyerNote from '@/assets/icons/buyer-note.png'
import iconInternalNote from '@/assets/icons/internal-note.png'
import iconGiftNote from '@/assets/icons/gift-note.png'

// ── Constants ─────────────────────────────────────────────────────────────────

const auth = useAuthStore()

const ACTIVE_STATUSES = ['new', 'matching', 'ready', 'sent_to_print', 'in_production']
const NEW_ORDER_STATUSES = ['new', 'matching', 'ready'] // not yet sent to print — gift/remove only make sense before this
const RESHIPPABLE_STATUSES = ['sent_to_print', 'in_production', 'shipped', 'delivered']
const reshipModalOrder = ref(null)

function openReshipModal(order) {
  reshipModalOrder.value = order
}

const STATUS_CLS = {
  new:           'bg-gray-100 text-gray-700',
  matching:      'bg-amber-100 text-amber-800',
  ready:         'bg-blue-100 text-blue-800',
  sent_to_print: 'bg-purple-100 text-purple-800',
  in_production: 'bg-indigo-100 text-indigo-800',
  shipped:       'bg-emerald-100 text-emerald-800',
  delivered:     'bg-emerald-100 text-emerald-800',
  cancelled:     'bg-red-100 text-red-700',
  refunded:      'bg-orange-100 text-orange-700',
}

const STATUS_LABEL = {
  new: 'New', matching: 'Matching', ready: 'Ready',
  sent_to_print: 'Sent to Print', in_production: 'In Production',
  shipped: 'Shipped', delivered: 'Delivered',
  cancelled: 'Cancelled', refunded: 'Refunded',
}

// Sub-filters for the New Orders tab
// key maps to backend params via buildSubFilterParams()
const NEW_ORDER_FILTERS = [
  { key: '',           label: 'All' },
  { key: 'unmatched',  label: 'Unmatched' },
  { key: 'matched',    label: 'Matched' },
  { key: 'no_design',  label: 'No Design' },
  { key: 'has_design', label: 'Has Design' },
  { key: 'ready',      label: 'Ready' },
]

// ── State ─────────────────────────────────────────────────────────────────────

const mainTab     = ref('new_orders')
const subFilter   = ref('')
const storeFilter = ref('')
const searchQ     = ref('')
const page        = ref(1)
const PAGE_SIZE   = 30

const orders      = ref([])
const totalCount  = ref(0)
const loading     = ref(true)
const actionError = ref('')

// Surfaces a failed ShipStation push (apps/orders/views.py::_sync_to_shipstation):
// stores the error on the order itself (persistent badge, survives a refresh since
// it's also on the list/detail serializers) AND shows it immediately via actionError —
// the local change always succeeded regardless, this is purely about the sync status.
function _applySyncResult(order, data) {
  order.shipstation_sync_error = data?.shipstation_sync_error || ''
  if (order.shipstation_sync_error) {
    actionError.value = `Saved, but failed to sync to ShipStation: ${order.shipstation_sync_error}`
  }
}

// "Retry Sync" — a full resync (not a replay of whichever edit failed), so it's
// safe to click regardless of what originally went wrong.
const resyncingOrderId = ref(null)

async function retrySync(order) {
  resyncingOrderId.value = order.id
  actionError.value = ''
  try {
    const { data } = await ordersApi.resyncShipstation(order.id)
    order.shipstation_sync_error = data.shipstation_sync_error || ''
    if (order.shipstation_sync_error) {
      actionError.value = `Still failing to sync to ShipStation: ${order.shipstation_sync_error}`
    }
  } catch (e) {
    actionError.value = e?.response?.data?.detail ?? 'Retry failed.'
  } finally {
    resyncingOrderId.value = null
  }
}

const stores      = ref([])

const tabCounts = ref({ new_orders: 0, ready_for_print: 0, in_production: 0, completed: 0 })

// expanded title state: { [itemId]: true }
const expandedTitles = ref({})

// ── Image lightbox ────────────────────────────────────────────────────────────
const zoomedImage = ref('')

// ── Personalization edit ──────────────────────────────────────────────────────
const editingPersonalizationId = ref(null)
const personalizationDraft     = ref('')
const personalizationSaving    = ref(false)

// ── Order cost breakdown popover ───────────────────────────────────────────────
const costBreakdownOrderId = ref(null)

function toggleCostBreakdown(order) {
  costBreakdownOrderId.value = costBreakdownOrderId.value === order.id ? null : order.id
}

function orderCostTotal(order) {
  return Number(order.item_cost || 0) + Number(order.shipping_cost || 0) + Number(order.extra_print_area_fee || 0)
}

// ── Order notes (buyer note / internal note / gift) ──────────────────────────
// Order-level, each its own compact inline edit — same icon+text+"Edit" link
// pattern as item personalization, not one big accordion panel. "Add Note"
// (order actions ⋮ menu) opens both buyer+internal at once for first entry;
// once a note has content it's always directly editable on the card itself.

// Auto-growing textarea: starts single-line height (looks like a plain field,
// same footprint as before) and grows downward only as typed/existing text
// actually wraps, instead of either scrolling text out of view (input) or
// always reserving 2 fixed rows (textarea).
function autoGrowTextarea(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

const buyerNoteTextarea = ref(null)
const editingBuyerNoteId = ref(null)
const buyerNoteDraft     = ref('')
const buyerNoteSaving    = ref(false)

function startBuyerNoteEdit(order) {
  editingBuyerNoteId.value = order.id
  buyerNoteDraft.value     = order.buyer_note || ''
  nextTick(() => autoGrowTextarea(buyerNoteTextarea.value))
}

async function saveBuyerNote(order) {
  buyerNoteSaving.value = true
  try {
    const { data } = await ordersApi.updateNotes(order.id, { buyer_note: buyerNoteDraft.value })
    order.buyer_note = data.buyer_note
    _applySyncResult(order, data)
    editingBuyerNoteId.value = null
  } catch {
    actionError.value = 'Failed to save buyer note.'
  } finally {
    buyerNoteSaving.value = false
  }
}

const internalNoteTextarea  = ref(null)
const editingInternalNoteId = ref(null)
const internalNoteDraft     = ref('')
const internalNoteSaving    = ref(false)

function startInternalNoteEdit(order) {
  editingInternalNoteId.value = order.id
  internalNoteDraft.value     = order.internal_note || ''
  nextTick(() => autoGrowTextarea(internalNoteTextarea.value))
}

async function saveInternalNote(order) {
  internalNoteSaving.value = true
  try {
    const { data } = await ordersApi.updateNotes(order.id, { internal_note: internalNoteDraft.value })
    order.internal_note = data.internal_note
    _applySyncResult(order, data)
    editingInternalNoteId.value = null
  } catch {
    actionError.value = 'Failed to save internal note.'
  } finally {
    internalNoteSaving.value = false
  }
}

function addNote(order) {
  startBuyerNoteEdit(order)
  startInternalNoteEdit(order)
}

const giftNoteTextarea = ref(null)
const editingGiftId    = ref(null)
const giftMessageDraft = ref('')
const giftSaving       = ref(false)

function startGiftEdit(order) {
  editingGiftId.value    = order.id
  giftMessageDraft.value = order.gift_message || ''
  nextTick(() => autoGrowTextarea(giftNoteTextarea.value))
}

async function saveGiftMessage(order) {
  giftSaving.value = true
  try {
    const { data } = await ordersApi.updateNotes(order.id, { is_gift: true, gift_message: giftMessageDraft.value })
    order.is_gift      = data.is_gift
    order.gift_message = data.gift_message
    _applySyncResult(order, data)
    editingGiftId.value = null
  } catch {
    actionError.value = 'Failed to save gift message.'
  } finally {
    giftSaving.value = false
  }
}

async function toggleGift(order) {
  const newVal = !order.is_gift
  try {
    const { data } = await ordersApi.updateNotes(order.id, {
      is_gift: newVal,
      gift_message: newVal ? order.gift_message : '',
    })
    order.is_gift      = data.is_gift
    order.gift_message = data.gift_message
    _applySyncResult(order, data)
    if (newVal) {
      startGiftEdit(order)
    } else {
      editingGiftId.value = null
    }
  } catch {
    actionError.value = 'Failed to update gift status.'
  }
}

const personalizationTextarea = ref(null)

function startPersonalizationEdit(item) {
  editingPersonalizationId.value = item.id
  personalizationDraft.value     = item.personalization || ''
  nextTick(() => autoGrowTextarea(personalizationTextarea.value))
}

async function savePersonalization(order, item) {
  personalizationSaving.value = true
  try {
    const { data } = await ordersApi.updatePersonalization(order.id, item.id, personalizationDraft.value)
    item.personalization = data.personalization
    _applySyncResult(order, data)
    editingPersonalizationId.value = null
  } catch {
    actionError.value = 'Failed to save personalization.'
  } finally {
    personalizationSaving.value = false
  }
}

// ── Order tags ────────────────────────────────────────────────────────────────
// Tag definitions (name+color) are sub-user-owned — only the sub-user (not a
// team member) can create/edit/delete them (apps/orders/views.py::OrderTag*).
// Applying/removing a tag on an order is open to both, platform-only (never
// pushed to ShipStation).

const availableTags = ref([])

async function loadTags() {
  try {
    const { data } = await ordersApi.listTags()
    availableTags.value = data.results ?? data
  } catch { /* non-critical */ }
}

// Fixed-position flyout (Teleport-to-body), not an absolute panel nested inside
// the order card: the card clips anything extending past its own bottom edge,
// same issue the ⋮ menu's "Add Tag" flyout had — see toggleTagSubmenu.
const tagMenuOrder = ref(null)
const tagMenuStyle = ref({})

function toggleTagMenu(order, event) {
  if (tagMenuOrder.value?.id === order.id) {
    tagMenuOrder.value = null
    return
  }
  const MENU_WIDTH = 190
  const rect = event.currentTarget.getBoundingClientRect()
  tagMenuStyle.value = {
    top:  `${rect.bottom + 4}px`,
    left: `${Math.max(8, Math.min(rect.left, window.innerWidth - MENU_WIDTH - 8))}px`,
    width: `${MENU_WIDTH}px`,
  }
  tagMenuOrder.value = order
}

async function setOrderTag(order, tagId) {
  tagMenuOrder.value = null
  try {
    const { data } = await ordersApi.setTag(order.id, tagId)
    order.tag = data || null
  } catch {
    actionError.value = 'Failed to update tag.'
  }
}

// Manage Tags modal (sub-user only)
const manageTagsModal = ref(false)
const newTagName  = ref('')
const newTagColor = ref('#6b7280')
const tagSaving    = ref(false)
const tagError     = ref('')

function openManageTags() {
  newTagName.value  = ''
  newTagColor.value = '#6b7280'
  tagError.value    = ''
  manageTagsModal.value = true
}

async function createTag() {
  if (!newTagName.value.trim()) return
  tagSaving.value = true
  tagError.value  = ''
  try {
    const { data } = await ordersApi.createTag({ name: newTagName.value.trim(), color: newTagColor.value })
    availableTags.value = [...availableTags.value, data]
    newTagName.value  = ''
    newTagColor.value = '#6b7280'
  } catch (e) {
    tagError.value = e?.response?.data?.detail ?? 'Failed to create tag.'
  } finally {
    tagSaving.value = false
  }
}

async function removeTag(tag) {
  if (!(await confirmDialog({
    title: `Delete tag "${tag.name}"?`,
    message: 'Any orders currently using this tag will have it cleared.',
    danger: true,
  }))) return
  try {
    await ordersApi.deleteTag(tag.id)
    availableTags.value = availableTags.value.filter(t => t.id !== tag.id)
    orders.value.forEach(o => { if (o.tag?.id === tag.id) o.tag = null })
  } catch {
    tagError.value = 'Failed to delete tag.'
  }
}

// Elapsed-since-ordered counter — ticks every minute so cards update live
const nowTick = ref(Date.now())
let nowTickInterval = null

function timeSinceOrder(order) {
  if (!order.ordered_at) return ''
  const diffMs = nowTick.value - new Date(order.ordered_at).getTime()
  if (diffMs < 0) return ''
  const mins  = Math.floor(diffMs / 60000)
  const hours = Math.floor(mins / 60)
  const days  = Math.floor(hours / 24)
  if (days > 0)  return `${days}d ${hours % 24}h`
  if (hours > 0) return `${hours}h ${mins % 60}m`
  return `${mins}m`
}

// ── Per-item editing ─────────────────────────────────────────────────────────
// Qty/SKU: their own always-available inline "Edit" link (same pattern as
// personalization), no menu needed. Qty still requires matched+rated (it
// affects weight/billing); SKU is purely descriptive, never gated.
// Size/Color + Clone live behind the ⋮ menu (top-left) — see itemMenuOpenId.
function canEditItemContent(order, item) {
  return !!item.pc_variant_id && order.shipping_cost != null
}

const itemMenuOpenId = ref(null)

function toggleItemMenu(item) {
  itemMenuOpenId.value = itemMenuOpenId.value === item.id ? null : item.id
}

// "Edit Item" — quick re-match shortcut: opens the same Match modal but
// jumps straight to the already-matched product's variant list instead of
// making the user search the catalog again (still just a re-match under
// the hood, so catalog-only values stay enforced).
async function openQuickVariantEdit(order, item) {
  itemMenuOpenId.value = null
  await openMatch(order, item)
  if (item.pc_product_id) {
    await selectProduct({ id: item.pc_product_id, name: item.pc_product_name })
  }
}

// "Clone Item" — a true duplicate (same product/variant/personalization/SKU/
// image, qty 1 as its own line), distinct from "+ Add Item" which opens the
// catalog picker for a genuinely different product.
const cloningItemId = ref(null)

async function cloneItem(order, item) {
  itemMenuOpenId.value = null
  cloningItemId.value = item.id
  try {
    const { data } = await ordersApi.cloneItem(order.id, item.id)
    const idx = order.items.findIndex(i => i.id === item.id)
    order.items.splice(idx === -1 ? order.items.length : idx + 1, 0, data)
    order.shipping_cost = null  // server clears it to force a fresh rate pick
    _applySyncResult(order, data)
  } catch (e) {
    actionError.value = e?.response?.data?.detail ?? 'Failed to clone item.'
  } finally {
    cloningItemId.value = null
  }
}

// "Delete Item" — an order must always keep at least one real (non-adjustment) item.
const deletingItemId = ref(null)

function canDeleteItem(order, item) {
  if (Number(item.unit_price) < 0) return true  // adjustment line, never the last "real" item
  return order.items.filter(i => Number(i.unit_price) >= 0).length > 1
}

async function deleteItem(order, item) {
  itemMenuOpenId.value = null
  if (!(await confirmDialog({
    title: `Remove "${item.raw_product_name}"?`,
    message: 'This also removes it from ShipStation.',
    danger: true,
  }))) return
  deletingItemId.value = item.id
  try {
    const { data } = await ordersApi.deleteItem(order.id, item.id)
    const idx = order.items.findIndex(i => i.id === item.id)
    if (idx !== -1) order.items.splice(idx, 1)
    order.shipping_cost = null  // server clears it to force a fresh rate pick
    _applySyncResult(order, data)
  } catch (e) {
    actionError.value = e?.response?.data?.detail ?? 'Failed to delete item.'
  } finally {
    deletingItemId.value = null
  }
}

const quantityDraft  = ref({})  // { [itemId]: number }
const quantitySaving = ref(null)

function startQuantityEdit(item) {
  quantityDraft.value = { ...quantityDraft.value, [item.id]: item.quantity }
}

const skuDraft  = ref({})  // { [itemId]: string }
const skuSaving = ref(null)

function startSkuEdit(item) {
  skuDraft.value = { ...skuDraft.value, [item.id]: item.marketplace_sku || '' }
}

async function saveSku(order, item) {
  skuSaving.value = item.id
  try {
    const { data } = await ordersApi.updateSku(order.id, item.id, skuDraft.value[item.id] || '')
    item.marketplace_sku = data.marketplace_sku
    _applySyncResult(order, data)
    delete skuDraft.value[item.id]
  } catch (e) {
    actionError.value = e?.response?.data?.detail || 'Failed to update SKU.'
  } finally {
    skuSaving.value = null
  }
}

async function saveQuantity(order, item) {
  const qty = Number(quantityDraft.value[item.id])
  if (!Number.isInteger(qty) || qty < 1) {
    actionError.value = 'Quantity must be a positive whole number.'
    return
  }
  quantitySaving.value = item.id
  try {
    const { data } = await ordersApi.updateQuantity(order.id, item.id, qty)
    item.quantity = data.quantity
    order.shipping_cost = null  // server clears it to force a fresh rate pick
    _applySyncResult(order, data)
    delete quantityDraft.value[item.id]
  } catch (e) {
    actionError.value = e?.response?.data?.detail || 'Failed to update quantity.'
  } finally {
    quantitySaving.value = null
  }
}

// ── Item image replace ────────────────────────────────────────────────────────
async function replaceItemImage(order, item, file) {
  if (!file) return
  const fd = new FormData()
  fd.append('image', file)
  try {
    const { data } = await ordersApi.uploadItemImage(order.id, item.id, fd)
    item.display_image_url = data.display_image_url
    item.image_url = data.image_url
  } catch {
    actionError.value = 'Image upload failed.'
  }
}

// ── Design upload (inline panel) ─────────────────────────────────────────────

const CHECKER_BG = {
  backgroundColor: '#c0c0c0',
  backgroundImage: [
    'linear-gradient(45deg,#a0a0a0 25%,transparent 25%)',
    'linear-gradient(-45deg,#a0a0a0 25%,transparent 25%)',
    'linear-gradient(45deg,transparent 75%,#a0a0a0 75%)',
    'linear-gradient(-45deg,transparent 75%,#a0a0a0 75%)',
  ].join(','),
  backgroundSize: '12px 12px',
  backgroundPosition: '0 0,0 6px,6px -6px,-6px 0px',
}

const COLOR_GROUPS = [
  { value: 'all',   label: 'All Shirts' },
  { value: 'dark',  label: 'Dark Shirts' },
  { value: 'light', label: 'Light Shirts' },
]

function sortedProductColors(item) {
  return [...(item.pc_product_colors || [])].sort((a, b) => a.name.localeCompare(b.name))
}

// Two independent picker popovers (print area / color) across all draft cards.
// Rendered via Teleport, absolutely positioned in document coordinates (so they
// scroll naturally with the page) — the draft card sits inside a horizontally
// scrolling strip (overflow-x-auto) which would otherwise clip them.

// Smart dropdown positioning — opens above the trigger if there's not enough
// space below. All dropdowns are position:fixed so coords are viewport-relative;
// window.scrollY must NOT be added.
function dropdownTop(rect, estimatedHeight) {
  return window.innerHeight - rect.bottom >= estimatedHeight + 8
    ? `${rect.bottom + 4}px`
    : `${Math.max(4, rect.top - estimatedHeight - 4)}px`
}

const draftPickerOpenId    = ref(null)
const draftPickerKind      = ref(null)  // 'area' | 'color'
const draftPickerStyle     = ref({})
const colorPickerExpanded  = ref(false)
function toggleDraftPicker(draft, kind, event) {
  if (_stripDraggedRecently) return
  if (draftPickerOpenId.value === draft._id && draftPickerKind.value === kind) {
    draftPickerOpenId.value = null
    return
  }
  colorPickerExpanded.value = kind === 'color' && draft.color_scope === 'specific'
  const rect = event.currentTarget.getBoundingClientRect()
  const estH = kind === 'area' ? 130 : 140  // color: 3 group rows ~140px; area: 2-3 areas ~130px
  draftPickerStyle.value = {
    top:  dropdownTop(rect, estH),
    left: `${rect.left}px`,
  }
  draftPickerOpenId.value = draft._id
  draftPickerKind.value   = kind
}

const activeDraftForPicker = computed(() =>
  Object.values(itemDrafts.value).flatMap(b => b.drafts).find(d => d._id === draftPickerOpenId.value)
)
const activeItemForPicker = computed(() => {
  if (!draftPickerOpenId.value) return null
  for (const [itemId, bucket] of Object.entries(itemDrafts.value)) {
    if (bucket.drafts.some(d => d._id === draftPickerOpenId.value)) {
      for (const o of orders.value) {
        const it = o.items.find(i => i.id === Number(itemId))
        if (it) return it
      }
    }
  }
  return null
})

function colorSummaryLabel(draft) {
  if (draft.color_scope === 'all')   return 'All'
  if (draft.color_scope === 'dark')  return 'Dark'
  if (draft.color_scope === 'light') return 'Light'
  if (draft.specific_colors.length === 1) return draft.specific_colors[0]
  if (draft.specific_colors.length > 1)   return `${draft.specific_colors.length} colors`
  return 'Select colors'
}

function isColorChecked(item, draft, colorName) {
  if (draft.color_scope === 'all') return true
  const c = (item.pc_product_colors || []).find(c => c.name === colorName)
  if (draft.color_scope === 'dark')  return !!c?.is_dark
  if (draft.color_scope === 'light') return !!c && !c.is_dark
  return draft.specific_colors.includes(colorName)
}

// Collect which scopes/colors are already claimed for a print area
// (from both saved item.designs and other pending drafts, excluding excludeDraftId)
function getClaimedForArea(item, areaName, excludeDraftId = null) {
  const claimed = { all: false, dark: false, light: false, specific: new Set() }
  for (const d of (item.designs || [])) {
    if (d.print_area_name !== areaName) continue
    if (d.color_scope === 'all')   { claimed.all = true; continue }
    if (d.color_scope === 'dark')  { claimed.dark = true; continue }
    if (d.color_scope === 'light') { claimed.light = true; continue }
    if (d.color_scope === 'specific' && d.specific_color)
      d.specific_color.split(',').map(s => s.trim()).filter(Boolean).forEach(c => claimed.specific.add(c))
  }
  for (const d of _getDrafts(item.id)) {
    if (d._id === excludeDraftId || d.print_area_name !== areaName) continue
    if (d.color_scope === 'all')   { claimed.all = true; continue }
    if (d.color_scope === 'dark')  { claimed.dark = true; continue }
    if (d.color_scope === 'light') { claimed.light = true; continue }
    if (d.color_scope === 'specific') d.specific_colors.forEach(c => claimed.specific.add(c))
  }
  return claimed
}

// True when no more designs can be added for this print area
function isPrintAreaFull(item, areaName) {
  const c = getClaimedForArea(item, areaName)
  return c.all || (c.dark && c.light)
}

// True when choosing this scope for the draft's print area would create a conflict
function isScopeBlocked(item, draft, scope) {
  const c = getClaimedForArea(item, draft.print_area_name, draft._id)
  if (c.all) return true
  const colors = item.pc_product_colors || []
  // If any claimed specific color belongs to dark/light group, that group is blocked too
  const specificClaimsDark  = [...c.specific].some(n => colors.find(col => col.name === n)?.is_dark)
  const specificClaimsLight = [...c.specific].some(n => { const col = colors.find(col => col.name === n); return col && !col.is_dark })
  if (scope === 'all')   return c.dark || c.light || c.specific.size > 0
  if (scope === 'dark')  return c.dark  || specificClaimsDark
  if (scope === 'light') return c.light || specificClaimsLight
  return false
}

// Select a print area for a draft; reset color scope if it conflicts with the new area
function selectPrintArea(draft, item, areaName) {
  draft.print_area_name = areaName
  if (isScopeBlocked(item, draft, draft.color_scope)) {
    const safe = ['all', 'dark', 'light'].find(s => !isScopeBlocked(item, draft, s))
    draft.color_scope     = safe ?? 'specific'
    draft.specific_colors = []
  }
  draftPickerOpenId.value = null
}

// True when a specific color checkbox is already claimed by another design/draft
function isColorBlockedByOthers(item, draft, colorName, colorIsDark) {
  const c = getClaimedForArea(item, draft.print_area_name, draft._id)
  if (c.all) return true
  if (colorIsDark && c.dark) return true
  if (!colorIsDark && c.light) return true
  return c.specific.has(colorName)
}

function selectColorGroup(draft, value) {
  if (draft.color_scope === value) {
    // clicking the active group again clears the selection
    draft.color_scope     = 'specific'
    draft.specific_colors = []
  } else {
    draft.color_scope     = value
    draft.specific_colors = []
  }
}

function toggleColorCheckbox(item, draft, colorName) {
  const colors = item.pc_product_colors || []
  let current
  if (draft.color_scope === 'all')        current = colors.map(c => c.name)
  else if (draft.color_scope === 'dark')  current = colors.filter(c => c.is_dark).map(c => c.name)
  else if (draft.color_scope === 'light') current = colors.filter(c => !c.is_dark).map(c => c.name)
  else                                    current = [...draft.specific_colors]

  const idx = current.indexOf(colorName)
  if (idx >= 0) current.splice(idx, 1)
  else current.push(colorName)

  draft.color_scope     = 'specific'
  draft.specific_colors = current
}

// ── Multi-draft design upload ─────────────────────────────────────────────────
// Keyed by item.id so multiple items can have pending drafts simultaneously.
const itemDrafts     = ref({})  // { [itemId]: { drafts: [], saving: false } }
const dragOverTarget = ref(null) // 'add-{itemId}' | 'draft-{_id}'
let   _draftSeq      = 0

function _getDrafts(itemId) { return itemDrafts.value[itemId]?.drafts || [] }
function _getSaving(itemId) { return itemDrafts.value[itemId]?.saving || false }
function _ensureBucket(itemId) {
  if (!itemDrafts.value[itemId]) itemDrafts.value[itemId] = { drafts: [], saving: false }
  return itemDrafts.value[itemId]
}

// Determine the best (area, scope) default for the next draft, based on what's already
// claimed by saved designs and other pending drafts. Uses isScopeBlocked so all conflict
// rules (specific-color dark/light classification, etc.) are respected.
function _nextSmartDefault(item) {
  const areas = item.available_print_areas || []
  if (!areas.length) return { areaName: 'Front', scope: 'all' }

  for (const area of areas) {
    if (isPrintAreaFull(item, area.name)) continue
    // Probe with a temporary draft id that won't match any real draft
    const probe = { _id: -1, print_area_name: area.name, color_scope: 'all', specific_colors: [] }
    if (!isScopeBlocked(item, probe, 'all'))   return { areaName: area.name, scope: 'all' }
    if (!isScopeBlocked(item, probe, 'dark'))  return { areaName: area.name, scope: 'dark' }
    if (!isScopeBlocked(item, probe, 'light')) return { areaName: area.name, scope: 'light' }
  }
  // All areas full — return first area (user will see conflict indicators)
  return { areaName: areas[0]?.name || 'Front', scope: 'all' }
}

function _makeDraft(item, file) {
  const isFirstUpload = !(item.designs?.length) && !_getDrafts(item.id).length
  const defaultArea   = (item.available_print_areas?.find(a => a.is_default) || item.available_print_areas?.[0])?.name || 'Front'
  const { areaName, scope } = isFirstUpload
    ? { areaName: defaultArea, scope: 'all' }
    : _nextSmartDefault(item)
  return {
    _id:             ++_draftSeq,
    file,
    preview:         URL.createObjectURL(file),
    print_area_name: areaName,
    color_scope:     scope,
    specific_colors: [],
    error:           '',
  }
}

const MAX_DESIGN_BYTES = 20 * 1024 * 1024  // 20 MB

function _checkDesignFile(file) {
  if (!file.name.toLowerCase().endsWith('.png') && file.type !== 'image/png') {
    actionError.value = `"${file.name}" is not a PNG file. Only PNG files are accepted.`
    return false
  }
  if (file.size > MAX_DESIGN_BYTES) {
    actionError.value = `"${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum is 20 MB.`
    return false
  }
  return true
}

function addDesignFiles(item, files) {
  if (!files?.length) return
  actionError.value = ''
  const valid = Array.from(files).filter(f => _checkDesignFile(f))
  if (!valid.length) return
  const bucket = _ensureBucket(item.id)
  for (const f of valid) bucket.drafts.push(_makeDraft(item, f))
}

function replaceDraftFile(item, draftId, files) {
  const bucket = _ensureBucket(item.id)
  const idx = bucket.drafts.findIndex(d => d._id === draftId)
  if (idx < 0) return
  actionError.value = ''
  const valid = Array.from(files).filter(f => _checkDesignFile(f))
  if (!valid.length) return
  const draft = bucket.drafts[idx]
  URL.revokeObjectURL(draft.preview)
  draft.file    = valid[0]
  draft.preview = URL.createObjectURL(valid[0])
  draft.error   = ''
  for (let i = 1; i < valid.length; i++) bucket.drafts.push(_makeDraft(item, valid[i]))
}

function cancelDraft(itemId, draftId) {
  const bucket = itemDrafts.value[itemId]
  if (!bucket) return
  const idx = bucket.drafts.findIndex(d => d._id === draftId)
  if (idx < 0) return
  URL.revokeObjectURL(bucket.drafts[idx].preview)
  bucket.drafts.splice(idx, 1)
  if (!bucket.drafts.length) delete itemDrafts.value[itemId]
  if (draftPickerOpenId.value === draftId) draftPickerOpenId.value = null
}

function cancelAllDrafts(itemId = null) {
  if (itemId) {
    const bucket = itemDrafts.value[itemId]
    if (bucket) {
      bucket.drafts.forEach(d => URL.revokeObjectURL(d.preview))
      delete itemDrafts.value[itemId]
    }
  } else {
    for (const bucket of Object.values(itemDrafts.value)) {
      bucket.drafts.forEach(d => URL.revokeObjectURL(d.preview))
    }
    itemDrafts.value = {}
  }
}

async function _saveSingleDraft(order, item, draftId) {
  const draft = itemDrafts.value[item.id]?.drafts.find(d => d._id === draftId)
  if (!draft) return true  // already removed — treat as success
  draft.error = ''
  const fd = new FormData()
  fd.append('file',                  draft.file)
  fd.append('print_area_name',       draft.print_area_name)
  fd.append('color_scope',           draft.color_scope)
  fd.append('specific_colors',       draft.color_scope === 'specific' ? draft.specific_colors.join(',') : '')
  fd.append('personalization_match', item.personalization || '')
  fd.append('save_to_library',       'true')
  try {
    const { data } = await ordersApi.uploadDesign(order.id, item.id, fd)
    const entry = {
      id:              data.sku_design,
      print_area_name: draft.print_area_name,
      file:            data.file,
      file_name:       data.file_name,
      color_scope:     draft.color_scope,
      specific_color:  draft.color_scope === 'specific' ? draft.specific_colors.join(', ') : '',
      is_matched:      _isDesignMatchedForItem(item, draft.color_scope, draft.specific_colors),
    }
    if (!item.designs) item.designs = []
    if (entry.id) {
      const ei = item.designs.findIndex(d => d.id === entry.id)
      if (ei >= 0) item.designs.splice(ei, 1, entry)
      else {
        const insertAt = item.designs.findIndex(
          d => d.print_area_name === entry.print_area_name && !d.is_matched && entry.is_matched,
        )
        if (insertAt >= 0) item.designs.splice(insertAt, 0, entry)
        else item.designs.push(entry)
      }
    }
    cancelDraft(item.id, draftId)
    const oi = orders.value.findIndex(o => o.id === order.id)
    if (oi >= 0) orders.value[oi].has_design = true
    return true
  } catch (e) {
    draft.error = e?.response?.data?.detail
      ?? e?.response?.data?.non_field_errors?.[0]
      ?? (e?.response?.status ? `Server error ${e.response.status}` : 'Upload failed.')
    return false
  }
}

async function saveAllDrafts(order, item) {
  const bucket = _ensureBucket(item.id)
  let hasError = false
  for (const draft of bucket.drafts) {
    if (draft.color_scope === 'specific' && draft.specific_colors.length === 0) {
      draft.error = 'Please select at least one color.'
      hasError = true
    }
  }
  if (hasError) return

  bucket.saving = true
  // Snapshot the ids — cancelDraft() mutates the array as each succeeds
  for (const id of bucket.drafts.map(d => d._id)) {
    await _saveSingleDraft(order, item, id)
  }
  bucket.saving = false
}

// ── Drag-to-scroll for design strip ──────────────────────────────────────────
let _scroll = { active: false, startX: 0, left: 0, el: null, dragged: false }
let _stripDraggedRecently = false  // suppresses the click that fires right after a drag ends

function onStripMouseDown(e) {
  _scroll = { active: true, startX: e.pageX, left: e.currentTarget.scrollLeft, el: e.currentTarget, dragged: false }
  e.currentTarget.style.cursor = 'grabbing'
  e.currentTarget.style.userSelect = 'none'
}
function onStripMouseMove(e) {
  if (!_scroll.active || _scroll.el !== e.currentTarget) return
  if (Math.abs(e.pageX - _scroll.startX) > 3) _scroll.dragged = true
  e.preventDefault()
  e.currentTarget.scrollLeft = _scroll.left - (e.pageX - _scroll.startX)
}
function onStripMouseUp(e) {
  if (_scroll.dragged) {
    _stripDraggedRecently = true
    // Close any open picker — strip scrolled so the picker position is stale
    draftPickerOpenId.value = null
    setTimeout(() => { _stripDraggedRecently = false }, 100)
  }
  _scroll.active = false
  e.currentTarget.style.cursor = 'grab'
  e.currentTarget.style.userSelect = ''
}
function onStripMouseLeave(e) {
  _scroll.active = false
  e.currentTarget.style.cursor = 'grab'
  e.currentTarget.style.userSelect = ''
}

function _isDesignMatchedForItem(item, colorScope, specificColors = []) {
  if (colorScope === 'all') return true
  const isDark = item.pc_variant_is_dark
  if (isDark === null || isDark === undefined) return false
  if (colorScope === 'dark')  return isDark === true
  if (colorScope === 'light') return isDark === false
  if (colorScope === 'specific') {
    const itemColor = (item.pc_variant_color || '').toLowerCase()
    return specificColors.some(c => c.toLowerCase() === itemColor)
  }
  return false
}

function scrollStrip(event, direction) {
  const strip = event.currentTarget.parentElement.querySelector('[data-scroll-strip]')
  if (strip) strip.scrollBy({ left: direction === 'left' ? -220 : 220, behavior: 'smooth' })
}

// Estimate whether a strip will overflow: each card is ~172px wide (160 + gap).
// +1 for the always-present add slot. If total estimated width > 600px, assume overflow.
function stripHasOverflow(item) {
  const savedCount = item.designs?.length || 0
  const draftCount = _getDrafts(item.id).length
  const total = savedCount + draftCount + 1  // +1 for add slot
  return total * 172 > 600
}

async function deleteDesign(order, item, design) {
  try {
    await ordersApi.deleteLibraryDesign(order.id, item.id, design.id)
    item.designs = item.designs.filter(d => d.id !== design.id)
  } catch {
    actionError.value = 'Failed to delete design.'
  }
}

function toggleTitle(itemId) {
  expandedTitles.value = {
    ...expandedTitles.value,
    [itemId]: !expandedTitles.value[itemId],
  }
}

// ── Load stores ───────────────────────────────────────────────────────────────

async function loadStores() {
  try {
    const { data } = await shippingApi.stores()
    stores.value = data.results ?? data
  } catch { stores.value = [] }
}

// ── Load orders ───────────────────────────────────────────────────────────────

function buildSubFilterParams() {
  switch (subFilter.value) {
    case 'unmatched':  return { matched: 'false' }
    case 'matched':    return { matched: 'true' }
    case 'no_design':  return { has_design: 'false' }
    case 'has_design': return { has_design: 'true' }
    case 'ready':      return { status: 'ready' }
    default:           return {}
  }
}

async function loadOrders() {
  loading.value     = true
  actionError.value = ''
  selectedIds.value = new Set()
  try {
    const params = { tab: mainTab.value, page: page.value, page_size: PAGE_SIZE }
    if (mainTab.value === 'new_orders') Object.assign(params, buildSubFilterParams())
    if (storeFilter.value) params.store  = storeFilter.value
    if (searchQ.value)     params.search = searchQ.value
    const { data } = await ordersApi.list(params)
    orders.value     = data.results ?? data
    totalCount.value = data.count   ?? orders.value.length
    // Auto-fetch rates for matched orders that don't have one yet
    if (mainTab.value === 'new_orders') {
      orders.value
        .filter(o => o.unmatched_count === 0 && !o.selected_carrier_code)
        .forEach(o => fetchRates(o))
    }
  } catch (e) {
    const msg = e?.response?.data?.detail ?? e?.response?.statusText ?? e?.message ?? 'Unknown error'
    actionError.value = `Failed to load orders: ${msg}`
  } finally {
    loading.value = false
  }
}

function closeAllDropdowns() {
  // All of these are position:fixed, anchored to a rect captured at open time —
  // scrolling detaches them from their trigger, so close them on scroll.
  actionsMenuOrder.value  = null
  tagSubmenuOpen.value    = false
  tagMenuOrder.value      = null
  originTooltipItem.value = null
  selectMenuOpen.value    = false
  moreActionsOpen.value   = false
  sortMenuOpen.value      = false
  draftPickerOpenId.value = null
  ratesModalOrder.value   = null
}

async function loadTabCounts() {
  try {
    const params = {}
    if (storeFilter.value) params.store  = storeFilter.value
    if (searchQ.value)     params.search = searchQ.value
    const { data } = await ordersApi.tabCounts(params)
    tabCounts.value = data
  } catch { /* badges are non-critical — keep previous counts on failure */ }
}

const readyForPrintSummary = ref({ count: 0, total: 0 })

async function loadReadyForPrintSummary() {
  try {
    const params = {}
    if (storeFilter.value) params.store  = storeFilter.value
    if (searchQ.value)     params.search = searchQ.value
    const { data } = await ordersApi.readyForPrintSummary(params)
    readyForPrintSummary.value = data
  } catch { /* non-critical — keep previous total on failure */ }
}

function refreshSummaries() { loadTabCounts(); loadReadyForPrintSummary() }

onMounted(() => {
  loadStores()
  loadOrders()
  refreshSummaries()
  loadTags()
  window.addEventListener('scroll', closeAllDropdowns, { passive: true })
  nowTickInterval = setInterval(() => { nowTick.value = Date.now() }, 60000)
})
onUnmounted(() => {
  window.removeEventListener('scroll', closeAllDropdowns)
  if (nowTickInterval) clearInterval(nowTickInterval)
})

function setMainTab(t)   { mainTab.value = t; subFilter.value = ''; page.value = 1; loadOrders() }
function setSubFilter(f) { subFilter.value = f; page.value = 1; loadOrders() }
function setStore(s)     { storeFilter.value = s; page.value = 1; loadOrders(); refreshSummaries() }
function doSearch()     { page.value = 1; loadOrders(); refreshSummaries() }

let searchDebounceTimer = null
watch(searchQ, () => {
  clearTimeout(searchDebounceTimer)
  searchDebounceTimer = setTimeout(doSearch, 400)
})

// ── Sorting ──────────────────────────────────────────────────────────────────

const SORT_OPTIONS = [
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
  { key: 'status', label: 'Status' },
]

const sortBy = ref('newest')

function statusPriority(o) {
  if (o.unmatched_count) return 0
  if (!o.has_design) return 1
  return 2
}

const sortedOrders = computed(() => {
  const arr = [...orders.value]
  if (sortBy.value === 'oldest') {
    arr.sort((a, b) => new Date(a.ordered_at || 0) - new Date(b.ordered_at || 0))
  } else if (sortBy.value === 'status') {
    arr.sort((a, b) => statusPriority(a) - statusPriority(b))
  } else {
    arr.sort((a, b) => new Date(b.ordered_at || 0) - new Date(a.ordered_at || 0))
  }
  return arr
})

// ── Group by ordered_at date ──────────────────────────────────────────────────

const grouped = computed(() => {
  if (sortBy.value === 'status') {
    return [{ key: 'status', orders: sortedOrders.value }]
  }
  const map = {}, keys = []
  for (const o of sortedOrders.value) {
    const key = o.ordered_at?.slice(0, 10) || '0000-00-00'
    if (!map[key]) { map[key] = []; keys.push(key) }
    map[key].push(o)
  }
  keys.sort()
  if (sortBy.value !== 'oldest') keys.reverse()
  return keys.map(k => ({ key: k, orders: map[k] }))
})

function dateLabel(key) {
  if (key === '0000-00-00') return 'Unknown Date'
  return new Date(key + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

function isOverdue(d)    { return d && new Date(d) < new Date() }

function formatDate(d) {
  if (!d) return null
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatOptions(raw) {
  if (!raw || typeof raw !== 'object') return []
  return Object.entries(raw).filter(([, v]) => v && v !== 'null')
}

function splitTitle(title) {
  if (!title || title.length <= 40) return { line1: title || '', line2: '' }
  const mid = Math.floor(title.length / 2)
  const before = title.lastIndexOf(' ', mid)
  const after  = title.indexOf(' ', mid)
  let breakAt
  if (before === -1 && after === -1) return { line1: title, line2: '' }
  if (before === -1) breakAt = after
  else if (after === -1) breakAt = before
  else breakAt = (mid - before <= after - mid) ? before : after
  return { line1: title.slice(0, breakAt).trim(), line2: title.slice(breakAt + 1).trim() }
}

// ── Carrier display (logo + name) ────────────────────────────────────────────

const CARRIER_META = {
  stamps_com:     { name: 'USPS',  logo: '/carriers/usps.png' },
  usps:           { name: 'USPS',  logo: '/carriers/usps.png' },
  endicia:        { name: 'USPS',  logo: '/carriers/usps.png' },
  ups:            { name: 'UPS',   logo: '/carriers/ups.png' },
  ups_walleted:   { name: 'UPS',   logo: '/carriers/ups.png' },
  fedex:          { name: 'FedEx', logo: '/carriers/fedex.png' },
  fedex_walleted: { name: 'FedEx', logo: '/carriers/fedex.png' },
  dhl_express:    { name: 'DHL',   logo: '/carriers/dhl.png' },
}

function carrierMeta(code) {
  return CARRIER_META[(code || '').toLowerCase()] || null
}

// ── Original listing tooltip ─────────────────────────────────────────────────

const originTooltipItem  = ref(null)
const originTooltipStyle = ref({})

function showOriginTooltip(item, event) {
  const rect = event.currentTarget.getBoundingClientRect()
  originTooltipStyle.value = {
    top:  dropdownTop(rect, 120),
    left: `${rect.left}px`,
  }
  originTooltipItem.value = item
}

function hideOriginTooltip() {
  originTooltipItem.value = null
}

// ── Shipping rates ────────────────────────────────────────────────────────────

const ratesMap        = ref({})   // { [orderId]: { loading, rates, error } }
const ratesModalOrder = ref(null) // order with the floating rates panel open
const ratesModalStyle = ref({})

function orderRateState(orderId) {
  return ratesMap.value[orderId] || { loading: false, rates: [], error: '' }
}

// ── Per-order actions menu (⋮) ───────────────────────────────────────────────

const actionsMenuOrder = ref(null)
const actionsMenuStyle = ref({})
const tagSubmenuOpen   = ref(false)
const tagSubmenuStyle  = ref({})

// ── Shipping label upload (seller already bought it elsewhere) ─────────────────
const labelUploadTarget = ref(null)
const labelFileInputEl  = ref(null)
const labelPreviewUrls  = ref({})   // order id -> object URL | '' (failed) | undefined (not fetched)
const labelPanelIndex   = ref({})   // order id -> 0 (label) | 1 (address)

function openActionsMenu(order, event) {
  tagSubmenuOpen.value = false
  if (actionsMenuOrder.value?.id === order.id) {
    actionsMenuOrder.value = null
    return
  }
  const MENU_WIDTH = 190
  const rect = event.currentTarget.getBoundingClientRect()
  actionsMenuStyle.value = {
    top:   dropdownTop(rect, 180),
    left:  `${Math.max(8, rect.right - MENU_WIDTH)}px`,
    width: `${MENU_WIDTH}px`,
  }
  actionsMenuOrder.value = order
}

// Flyout to the LEFT of the actions menu (which is itself right-anchored near
// the ⋮ button) — own fixed position computed from the "Add Tag" row's rect,
// not nested inside the actions menu panel (its overflow-hidden would clip it).
function toggleTagSubmenu(event) {
  if (tagSubmenuOpen.value) {
    tagSubmenuOpen.value = false
    return
  }
  const SUBMENU_WIDTH = 190
  const rect = event.currentTarget.getBoundingClientRect()
  tagSubmenuStyle.value = {
    top:   `${rect.top}px`,
    left:  `${Math.max(8, rect.left - SUBMENU_WIDTH - 4)}px`,
    width: `${SUBMENU_WIDTH}px`,
  }
  tagSubmenuOpen.value = true
}

// Floating (Teleport-to-body, position:fixed) like the other menus in this file —
// an in-card absolute panel got clipped by the card's own `overflow-hidden`
// (needed to round its corners), which made a multi-rate list unusable.
function openRatesModal(order, event) {
  if (ratesModalOrder.value?.id === order.id) {
    ratesModalOrder.value = null
    return
  }
  const rect = event.currentTarget.getBoundingClientRect()
  ratesModalStyle.value = {
    top:   dropdownTop(rect, 320),
    left:  `${rect.left}px`,
    width: `${rect.width}px`,
  }
  ratesModalOrder.value = order
  if (!orderRateState(order.id).rates.length && !orderRateState(order.id).loading)
    fetchRates(order)
}

async function fetchRates(order) {
  const billableItems = order.items.filter(i => i.unit_price >= 0 && i.is_matched)
  const totalWeight   = billableItems.reduce((s, i) => s + (i.pc_variant_weight_oz || 0) * i.quantity, 0)

  if (!totalWeight) {
    ratesMap.value[order.id] = { loading: false, rates: [], error: 'Product weights are not configured.' }
    return
  }

  ratesMap.value[order.id] = { loading: true, rates: [], error: '' }
  try {
    const { data } = await shippingApi.rates({
      ship_to_country:     order.ship_to_country     || 'US',
      ship_to_postal_code: order.ship_to_postal_code || '',
      weight_oz:           totalWeight,
      order_id:            order.id,
    })
    ratesMap.value[order.id] = { loading: false, rates: data.rates || [], error: '' }

    if (!order.selected_carrier_code) {
      // Auto-apply the sub-user's configured default if nothing is selected yet —
      // falling back to the cheapest rate (already sorted ascending by the API) when
      // no default is configured for this category, so switching to a category with
      // no configured default (e.g. after a Standard/Priority/Express change) never
      // leaves the order sitting unselected.
      const rates = data.rates || []
      const defaultRate = rates.find(r => r.is_default) || rates[0]
      if (defaultRate) await selectShipping(order, defaultRate)
    } else {
      // Sync stored shipping_cost with the freshly fetched rate for the
      // already-selected service, in case it changed (e.g. weight updated since selection)
      const currentRate = (data.rates || []).find(
        r => r.carrier_code === order.selected_carrier_code && r.service_code === order.selected_service_code
      )
      if (currentRate && Number(currentRate.displayed_rate) !== Number(order.shipping_cost)) {
        await selectShipping(order, currentRate)
      }
    }
  } catch (e) {
    ratesMap.value[order.id] = {
      loading: false, rates: [],
      error: e?.response?.data?.detail ?? 'Failed to fetch rates.',
    }
  }
}

function titleCase(s) {
  return (s || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

const SHIPPING_CATEGORIES = [
  { value: 'standard', label: 'Standard' },
  { value: 'priority', label: 'Priority' },
  { value: 'express',  label: 'Express' },
]
const categoryChangingId = ref(null)

// Rush/downgrade the shipping speed for this order (Standard/Priority/Express).
// Internal only — never changes what the marketplace was told the customer
// ordered. The backend clears the current selection and re-picks a rate for
// the new category in its own background pass; fetchRates() below re-shops it
// immediately too (and applies the new default) so the UI doesn't sit on a
// stale price waiting for that background pass to land.
async function changeShippingCategory(order, category) {
  categoryChangingId.value = order.id
  try {
    const { data } = await ordersApi.setShippingCategory(order.id, category)
    const oi = orders.value.findIndex(o => o.id === order.id)
    if (oi !== -1) {
      Object.assign(orders.value[oi], {
        shipping_category_override: data.shipping_category_override,
        shipping_category:          data.shipping_category ?? category,
        selected_carrier_code:      '',
        selected_service_code:      '',
        selected_service_name:      '',
        shipping_cost:              null,
      })
      ratesMap.value[order.id] = { loading: false, rates: [], error: '' }
      await fetchRates(orders.value[oi])
    }
  } catch (e) {
    error.value = e?.response?.data?.detail ?? 'Failed to change the shipping category.'
  } finally {
    categoryChangingId.value = null
  }
}

const selectingShippingId = ref(null)

async function selectShipping(order, rate) {
  selectingShippingId.value = order.id
  try {
    await ordersApi.selectShipping(order.id, {
      carrier_code:   rate.carrier_code,
      service_code:   rate.service_code,
      displayed_rate: rate.displayed_rate,
    })
    const oi = orders.value.findIndex(o => o.id === order.id)
    if (oi !== -1) {
      orders.value[oi].selected_carrier_code = rate.carrier_code
      orders.value[oi].selected_service_code = rate.service_code
      orders.value[oi].selected_service_name = titleCase(rate.service_name || rate.service_code)
      orders.value[oi].shipping_cost         = rate.displayed_rate
    }
  } catch {
    actionError.value = 'Failed to select shipping.'
  } finally {
    selectingShippingId.value = null
  }
}

// ── Auto-match ────────────────────────────────────────────────────────────────

const autoMatchLoadingId  = ref(null)
const autoMatchAllLoading = ref(false)

async function matchAll() {
  autoMatchAllLoading.value = true
  actionError.value = ''
  try {
    await ordersApi.autoMatchAll()
    await loadOrders()
    // Auto-fetch rates for newly-matched orders that don't have a rate yet
    orders.value
      .filter(o => o.unmatched_count === 0 && !o.selected_carrier_code)
      .forEach(o => fetchRates(o))
  } catch { actionError.value = 'Auto-match failed.' }
  finally { autoMatchAllLoading.value = false }
}

async function runAutoMatch(order) {
  autoMatchLoadingId.value = order.id
  actionError.value = ''
  try {
    await ordersApi.autoMatch(order.id)
    const { data } = await ordersApi.detail(order.id)
    const idx = orders.value.findIndex(o => o.id === order.id)
    if (idx !== -1) {
      orders.value[idx].status     = data.status
      orders.value[idx].buyer_note = data.buyer_note
      orders.value[idx].unmatched_count = data.items.filter(i => !i.is_matched && i.unit_price >= 0).length
      orders.value[idx].item_cost            = data.item_cost
      orders.value[idx].extra_print_area_fee = data.extra_print_area_fee
      data.items.forEach(di => {
        const ii = orders.value[idx].items.findIndex(i => i.id === di.id)
        if (ii !== -1) {
          Object.assign(orders.value[idx].items[ii], {
            is_matched:            di.is_matched,
            pc_product_name:       di.pc_product_name,
            pc_variant_size:       di.pc_variant_size,
            pc_variant_color:      di.pc_variant_color,
            pc_variant1_label:     di.pc_variant1_label,
            pc_variant2_label:     di.pc_variant2_label,
            pc_variant_weight_oz:  di.pc_variant_weight_oz,
            display_image_url:     di.display_image_url,
            personalization:       di.personalization,
          })
        }
      })
    }
    if (idx !== -1 && orders.value[idx].unmatched_count === 0)
      fetchRates(orders.value[idx])
  } catch { actionError.value = 'Auto-match failed.' }
  finally { autoMatchLoadingId.value = null }
}

// ── Send to print ─────────────────────────────────────────────────────────────

async function sendToPrint(order) {
  actionError.value = ''
  try {
    const { data } = await ordersApi.sendToPrint(order.id)
    const idx = orders.value.findIndex(o => o.id === order.id)
    if (idx !== -1) orders.value[idx].status = data.status
    order.sendError = ''
    refreshSummaries()
    return true
  } catch (e) {
    const msg = e?.response?.data?.detail ?? 'Failed to send to print.'
    actionError.value = msg
    order.sendError = msg
    return false
  }
}

// Scrolls a specific order card into view and flashes it — same idea as a form
// jumping to its first invalid field — so one failure among many selected
// orders (e.g. a 50-order bulk send) isn't lost in the list.
const flashOrderId = ref(null)

function scrollToOrder(orderId) {
  const el = document.getElementById(`order-card-${orderId}`)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  flashOrderId.value = orderId
  setTimeout(() => {
    if (flashOrderId.value === orderId) flashOrderId.value = null
  }, 2500)
}

// ── Send to Print confirmation ──────────────────────────────────────────────────

const sendConfirmOrders  = ref([])
const sendConfirmLoading = ref(false)

const sendConfirmTotal = computed(() =>
  sendConfirmOrders.value.reduce((sum, o) => sum + orderCostTotal(o), 0)
)

function openSendConfirm(order) {
  sendConfirmOrders.value = [order]
}

function closeSendConfirm() {
  if (sendConfirmLoading.value) return
  sendConfirmOrders.value = []
}

async function confirmSendToPrint() {
  sendConfirmLoading.value = true
  bulkSending.value        = true
  const failed = []
  for (const order of sendConfirmOrders.value) {
    const ok = await sendToPrint(order)
    if (!ok) failed.push(order)
  }
  sendConfirmLoading.value = false
  bulkSending.value        = false
  // Keep failed orders selected (and visible) instead of clearing everything —
  // only the ones that actually sent drop out of the selection.
  selectedIds.value        = new Set(failed.map(o => o.id))
  sendConfirmOrders.value  = []
  if (failed.length) {
    actionError.value = failed.length === 1
      ? `Failed to send "${failed[0].external_order_number || failed[0].shipstation_order_number}" to print — see highlighted order below.`
      : `${failed.length} order(s) could not be sent to print — see highlighted order below.`
    scrollToOrder(failed[0].id)
  }
}

// ── Recall (pull back to New Orders before the PC has started production) ──────

const recallLoadingId = ref(null)

async function recallOrder(order) {
  recallLoadingId.value = order.id
  actionError.value     = ''
  try {
    const { data } = await ordersApi.recall(order.id)
    const idx = orders.value.findIndex(o => o.id === order.id)
    if (idx !== -1) orders.value[idx].status = data.status
    refreshSummaries()
  } catch (e) {
    actionError.value = e?.response?.data?.detail ?? 'Failed to recall order.'
  } finally { recallLoadingId.value = null }
}

function triggerLabelUpload(order) {
  labelUploadTarget.value = order
  labelFileInputEl.value?.click()
}

async function onLabelFileChosen(event) {
  const file = event.target.files[0]
  event.target.value = ''
  const order = labelUploadTarget.value
  if (!file || !order) return
  if (!(await confirmDialog({
    title: 'Use this shipping label?',
    message: 'This label will be used for this order and it will ship with it.\n\n'
      + 'Upload a file with only the shipping label on it — not a combined page with '
      + 'order or buyer info, and if it\'s a multi-page file, only the first page is used.\n\n'
      + 'If you already bought this label directly on Etsy, this order may drop off '
      + 'this panel on its own shortly after — only use this upload for labels bought elsewhere.',
    confirmText: 'Yes, Use This Label',
  }))) return
  const fd = new FormData()
  fd.append('label', file)
  try {
    const { data } = await ordersApi.uploadLabel(order.id, fd)
    Object.assign(order, data)
  } catch (e) {
    actionError.value = e?.response?.data?.detail || 'Label upload failed.'
  }
}

async function removeLabel(order) {
  if (!(await confirmDialog({
    title: 'Remove this shipping label?',
    message: 'This order will go back to needing a shipping rate/label picked for it.',
    danger: true,
  }))) return
  try {
    const { data } = await ordersApi.removeLabel(order.id)
    Object.assign(order, data)
    delete labelPreviewUrls.value[order.id]
    delete labelPanelIndex.value[order.id]
  } catch (e) {
    actionError.value = e?.response?.data?.detail || 'Failed to remove label.'
  }
}

// Fires the preview fetch the first time an uploaded-label order's panel renders,
// then lets the :src binding pick up labelPreviewUrls once it resolves — see the
// "hidden span" call site in the template below.
function ensureLabelPreview(order) {
  if (labelPreviewUrls.value[order.id] !== undefined) return true
  labelPreviewUrls.value[order.id] = null
  ordersApi.labelPreview(order.id)
    .then(({ data }) => { labelPreviewUrls.value[order.id] = URL.createObjectURL(data) })
    .catch(() => { labelPreviewUrls.value[order.id] = '' })
  return true
}

function flipLabelPanel(order) {
  const cur = labelPanelIndex.value[order.id] || 0
  labelPanelIndex.value[order.id] = cur === 0 ? 1 : 0
}

// ── Bulk selection / bulk send to print ────────────────────────────────────────

const selectedIds = ref(new Set())
const bulkSending = ref(false)

const readyOrders = computed(() => orders.value.filter(o => o.status === 'ready'))

const allSelectedReady = computed(() => {
  const ids = [...selectedIds.value]
  if (!ids.length) return false
  return ids.every(id => orders.value.find(o => o.id === id)?.status === 'ready')
})

function toggleSelect(order) {
  const s = new Set(selectedIds.value)
  if (s.has(order.id)) s.delete(order.id)
  else s.add(order.id)
  selectedIds.value = s
}

function deselectAll() {
  selectedIds.value = new Set()
}

const pageAllSelected = computed(() =>
  orders.value.length > 0 && orders.value.every(o => selectedIds.value.has(o.id))
)

function toggleSelectAllOnPage() {
  if (pageAllSelected.value) deselectAll()
  else selectedIds.value = new Set(orders.value.map(o => o.id))
}

async function selectAllAcrossPages() {
  try {
    const params = { tab: mainTab.value, page: 1, page_size: Math.max(totalCount.value, PAGE_SIZE) }
    if (mainTab.value === 'new_orders') Object.assign(params, buildSubFilterParams())
    if (storeFilter.value) params.store  = storeFilter.value
    if (searchQ.value)     params.search = searchQ.value
    const { data } = await ordersApi.list(params)
    const all = data.results ?? data
    selectedIds.value = new Set(all.map(o => o.id))
  } catch { actionError.value = 'Failed to select all orders.' }
}

// ── Selection / More-actions dropdowns ──────────────────────────────────────────

const selectMenuOpen   = ref(false)
const selectMenuStyle  = ref({})
const moreActionsOpen  = ref(false)
const moreActionsStyle = ref({})

function toggleSelectMenu(event) {
  if (selectMenuOpen.value) { selectMenuOpen.value = false; return }
  const rect = event.currentTarget.getBoundingClientRect()
  selectMenuStyle.value = {
    top:  dropdownTop(rect, 120),
    left: `${rect.left}px`,
    width: '220px',
  }
  selectMenuOpen.value = true
  moreActionsOpen.value = false
}

function toggleMoreActionsMenu(event) {
  if (moreActionsOpen.value) { moreActionsOpen.value = false; return }
  const rect = event.currentTarget.getBoundingClientRect()
  moreActionsStyle.value = {
    top:  dropdownTop(rect, 140),
    left: `${rect.left}px`,
    width: '200px',
  }
  moreActionsOpen.value = true
  selectMenuOpen.value = false
}

const sortMenuOpen  = ref(false)
const sortMenuStyle = ref({})

function toggleSortMenu(event) {
  if (sortMenuOpen.value) { sortMenuOpen.value = false; return }
  const rect = event.currentTarget.getBoundingClientRect()
  sortMenuStyle.value = {
    top:   dropdownTop(rect, 180),
    right: `${document.documentElement.clientWidth - rect.right}px`,
    width: '200px',
  }
  sortMenuOpen.value = true
  selectMenuOpen.value = false
  moreActionsOpen.value = false
}

function setSortBy(key) {
  sortBy.value = key
  sortMenuOpen.value = false
}

function openBulkSendConfirm() {
  const ids = [...selectedIds.value]
  const list = ids
    .map(id => orders.value.find(o => o.id === id))
    .filter(o => o && o.status === 'ready')
  if (!list.length) return
  sendConfirmOrders.value = list
}

// ── Remove from platform ──────────────────────────────────────────────────────

const hideLoadingId = ref(null)

async function _removeOrder(order) {
  hideLoadingId.value = order.id
  try {
    await ordersApi.hide(order.id)
    orders.value = orders.value.filter(o => o.id !== order.id)
    totalCount.value = Math.max(0, totalCount.value - 1)
    if (selectedIds.value.has(order.id)) {
      const s = new Set(selectedIds.value)
      s.delete(order.id)
      selectedIds.value = s
    }
  } catch { actionError.value = 'Failed to remove order.' }
  finally { hideLoadingId.value = null }
}

async function hideOrder(order) {
  if (!(await confirmDialog({
    title: `Remove order #${order.shipstation_order_number} from the platform?`,
    message: 'Once confirmed, this order will only be removed from this platform — it will not affect the order\'s status in your store.',
  }))) return
  await _removeOrder(order)
}

async function bulkRemoveFromPlatform() {
  const ids = [...selectedIds.value]
  if (!ids.length) return
  if (!(await confirmDialog({
    title: `Remove ${ids.length} order(s) from the platform?`,
    message: 'Once confirmed, these orders will only be removed from this platform — it will not affect their status in your store.',
  }))) return
  bulkSending.value = true
  for (const id of ids) {
    const order = orders.value.find(o => o.id === id)
    if (order) await _removeOrder(order)
  }
  selectedIds.value = new Set(selectedIds.value)
  bulkSending.value = false
}

// ── Match modal ───────────────────────────────────────────────────────────────

const matchModal        = ref(false)
const matchOrderId      = ref(null)
const matchingItem      = ref(null)
const matchSearch       = ref('')
const matchProducts     = ref([])
const matchProductLoad  = ref(false)
const matchSelectedProd = ref(null)
const matchVariants     = ref([])
const matchVariantLoad  = ref(false)
const matchSelectedVar  = ref(null)
const matchRemember     = ref(true)
const matchSaving       = ref(false)

const REMATCH_WARNING_DISMISS_KEY = 'rematch_warning_dismissed'
const showRematchWarning = ref(false)
const dontShowRematchWarningAgain = ref(false)

function dismissRematchWarning() {
  showRematchWarning.value = false
  if (dontShowRematchWarningAgain.value) {
    localStorage.setItem(REMATCH_WARNING_DISMISS_KEY, '1')
  }
}

async function openMatch(order, item) {
  matchOrderId.value      = order.id
  matchingItem.value      = item
  matchSearch.value       = ''
  matchSelectedProd.value = null
  matchVariants.value     = []
  matchSelectedVar.value  = null
  matchRemember.value     = false
  matchModal.value        = true
  dontShowRematchWarningAgain.value = false
  showRematchWarning.value = item.is_matched && localStorage.getItem(REMATCH_WARNING_DISMISS_KEY) !== '1'
  await loadMatchProducts()
}

async function loadMatchProducts() {
  matchProductLoad.value = true
  try {
    const params = {}
    if (matchSearch.value) params.search = matchSearch.value
    const { data } = await catalogApi.subCatalog(params)
    matchProducts.value = data.results ?? data
  } catch { matchProducts.value = [] }
  finally { matchProductLoad.value = false }
}

async function selectProduct(product) {
  matchSelectedProd.value = product
  matchSelectedVar.value  = null
  matchVariants.value     = []
  matchVariantLoad.value  = true
  try {
    const { data } = await catalogApi.subCatalogProduct(product.id)
    matchVariants.value = data.variants ?? []
  } catch { matchVariants.value = [] }
  finally { matchVariantLoad.value = false }
}

const SIZE_ORDER = ['XS','S','SM','M','ML','L','XL','1X','1XL','2X','2XL','XXL','3X','3XL','XXXL','4XL','4X','5XL','5X','6XL']
function sizeRank(s) {
  const norm = (s||'').toUpperCase().trim()
  const i = SIZE_ORDER.indexOf(norm)
  if (i !== -1) return i
  const m = norm.match(/-?\d+(?:[.,]\d+)?/)
  return m ? 1000 + parseFloat(m[0].replace(',', '.')) : 9999
}
const sortedVariants = computed(() =>
  [...matchVariants.value].sort((a, b) => {
    const d = sizeRank(a.size) - sizeRank(b.size)
    return d !== 0 ? d : (a.color||'').localeCompare(b.color||'')
  })
)

async function saveMatch() {
  if (!matchSelectedVar.value || !matchingItem.value) return
  matchSaving.value = true
  actionError.value = ''
  try {
    await ordersApi.match(matchOrderId.value, [{
      item_id:       matchingItem.value.id,
      pc_variant_id: matchSelectedVar.value.id,
      remember:      matchRemember.value,
    }])
    matchModal.value = false
    // Fetch fresh order data so all related fields (pc_product_name, labels, etc.) are fully loaded
    const { data } = await ordersApi.detail(matchOrderId.value)
    const oi = orders.value.findIndex(o => o.id === matchOrderId.value)
    if (oi !== -1) {
      orders.value[oi].status        = data.status
      orders.value[oi].buyer_note    = data.buyer_note
      orders.value[oi].unmatched_count = data.items.filter(i => !i.is_matched && i.unit_price >= 0).length
      orders.value[oi].item_cost            = data.item_cost
      orders.value[oi].extra_print_area_fee = data.extra_print_area_fee
      data.items.forEach(di => {
        const ii = orders.value[oi].items.findIndex(i => i.id === di.id)
        if (ii !== -1) {
          Object.assign(orders.value[oi].items[ii], {
            is_matched:           di.is_matched,
            pc_product_name:      di.pc_product_name,
            pc_variant_size:      di.pc_variant_size,
            pc_variant_color:     di.pc_variant_color,
            pc_variant1_label:    di.pc_variant1_label,
            pc_variant2_label:    di.pc_variant2_label,
            pc_variant_weight_oz: di.pc_variant_weight_oz,
            pc_variant_is_dark:   di.pc_variant_is_dark,
            display_image_url:    di.display_image_url,
            personalization:      di.personalization,
            available_print_areas: di.available_print_areas ?? [],
            pc_product_colors:    di.pc_product_colors ?? [],
            designs:              di.designs ?? [],
          })
        }
      })
      if (orders.value[oi].unmatched_count === 0)
        fetchRates(orders.value[oi])
    }
  } catch (e) {
    actionError.value = e?.response?.data?.detail ?? 'Match failed.'
  } finally { matchSaving.value = false }
}

// ── Add Item modal (covers both "clone this item" and "+ Add Item" — same
// mechanism: pick a catalog product, its image becomes the item image, and a
// generic editable placeholder stands in for a marketplace title) ──────────────

const addItemModal        = ref(false)
const addItemOrderId      = ref(null)
const addItemSearch       = ref('')
const addItemProducts     = ref([])
const addItemProductLoad  = ref(false)
const addItemSelectedProd = ref(null)
const addItemVariants     = ref([])
const addItemVariantLoad  = ref(false)
const addItemSelectedVar  = ref(null)
const addItemName         = ref('Manually Added Item')
const addItemSku          = ref('')
const addItemQty          = ref(1)
const addItemSaving       = ref(false)

function openAddItem(order) {
  addItemOrderId.value      = order.id
  addItemSearch.value       = ''
  addItemSelectedProd.value = null
  addItemVariants.value     = []
  addItemSelectedVar.value  = null
  addItemName.value         = 'Manually Added Item'
  addItemSku.value          = ''
  addItemQty.value          = 1
  addItemModal.value        = true
  loadAddItemProducts()
}

async function loadAddItemProducts() {
  addItemProductLoad.value = true
  try {
    const params = {}
    if (addItemSearch.value) params.search = addItemSearch.value
    const { data } = await catalogApi.subCatalog(params)
    addItemProducts.value = data.results ?? data
  } catch { addItemProducts.value = [] }
  finally { addItemProductLoad.value = false }
}

async function selectAddItemProduct(product) {
  addItemSelectedProd.value = product
  addItemSelectedVar.value  = null
  addItemVariants.value     = []
  addItemVariantLoad.value  = true
  try {
    const { data } = await catalogApi.subCatalogProduct(product.id)
    addItemVariants.value = data.variants ?? []
  } catch { addItemVariants.value = [] }
  finally { addItemVariantLoad.value = false }
}

const addItemSortedVariants = computed(() =>
  [...addItemVariants.value].sort((a, b) => {
    const d = sizeRank(a.size) - sizeRank(b.size)
    return d !== 0 ? d : (a.color||'').localeCompare(b.color||'')
  })
)

async function saveAddItem() {
  if (!addItemSelectedVar.value || !addItemOrderId.value) return
  addItemSaving.value = true
  actionError.value = ''
  try {
    const { data } = await ordersApi.addItem(addItemOrderId.value, {
      pc_variant_id: addItemSelectedVar.value.id,
      quantity:      Number(addItemQty.value) || 1,
      name:          addItemName.value || 'Manually Added Item',
      sku:           addItemSku.value || '',
    })
    const oi = orders.value.findIndex(o => o.id === addItemOrderId.value)
    if (oi !== -1) {
      orders.value[oi].items.push(data)
      orders.value[oi].shipping_cost = null  // server clears it to force a fresh rate pick
      _applySyncResult(orders.value[oi], data)
    }
    addItemModal.value = false
  } catch (e) {
    actionError.value = e?.response?.data?.detail ?? 'Failed to add item.'
  } finally { addItemSaving.value = false }
}

// ── Address edit ─────────────────────────────────────────────────────────────

const editingAddressId = ref(null)
const addressDraft     = ref({})
const addressSaving    = ref(false)
const addressEditMeta  = ref({ name: '', orderNo: '' })

function startAddressEdit(order) {
  editingAddressId.value = order.id
  addressEditMeta.value  = {
    name:    order.ship_to_name || order.customer_name || '',
    orderNo: order.external_order_number || order.shipstation_order_number || '',
  }
  addressDraft.value = {
    ship_to_name:        order.ship_to_name        || '',
    ship_to_company:     order.ship_to_company     || '',
    ship_to_address1:    order.ship_to_address1    || '',
    ship_to_address2:    order.ship_to_address2    || '',
    ship_to_city:        order.ship_to_city        || '',
    ship_to_state:       order.ship_to_state       || '',
    ship_to_postal_code: order.ship_to_postal_code || '',
    ship_to_country:     order.ship_to_country     || 'US',
  }
}

function cancelAddressEdit() {
  editingAddressId.value = null
  addressDraft.value = {}
  addressPasteText.value = ''
}

const addressPasteText = ref('')

function parseAndFillAddress(text) {
  const raw = (text || '').trim()
  if (!raw) return

  // Normalise line endings
  const normalised = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  // Detect single-line format: "Name, Street, City, ST ZIP" or "Street, City, ST ZIP, USA"
  const isSingleLine = !normalised.includes('\n')

  let lines
  if (isSingleLine) {
    // Split by comma and clean up
    lines = normalised.split(',').map(l => l.trim()).filter(Boolean)
    // Remove trailing country token like "USA" or "United States"
    if (/^(usa|united states)$/i.test(lines[lines.length - 1])) lines.pop()
    // Last segment might be "ST ZIP" — keep as-is for the regex below
    // Rejoin city+state+zip if they got split: ["Paducah", "KY 42001"] → ["Paducah, KY 42001"]
    // Detect if last item is just "ST ZIP" and second-to-last is a city
    const lastTwo = lines.slice(-2).join(', ')
    const cszTest = lastTwo.match(/^(.+?),?\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/)
    if (cszTest) {
      lines = [...lines.slice(0, -2), lastTwo]
    }
  } else {
    lines = normalised.split('\n').map(l => l.trim()).filter(Boolean)
  }

  if (lines.length < 2) return

  // Find the line containing "City, ST ZIP"
  const CSZ_RE = /^(.+?),?\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/
  const cszIdx = lines.findIndex(l => CSZ_RE.test(l))
  if (cszIdx === -1) return

  const csz   = lines[cszIdx].match(CSZ_RE)
  const city  = csz[1].trim()
  const state = csz[2].toUpperCase()
  const zip   = csz[3]

  addressDraft.value.ship_to_city        = city
  addressDraft.value.ship_to_state       = state
  addressDraft.value.ship_to_postal_code = zip
  if (!addressDraft.value.ship_to_country) addressDraft.value.ship_to_country = 'US'

  const before = lines.slice(0, cszIdx)
  const firstIsStreet = /^\d/.test(before[0] || '')

  if (!firstIsStreet && before.length >= 2) {
    addressDraft.value.ship_to_name     = before[0]
    addressDraft.value.ship_to_address1 = before[1]
    addressDraft.value.ship_to_address2 = before[2] || ''
  } else if (!firstIsStreet && before.length === 1) {
    addressDraft.value.ship_to_name     = before[0]
    addressDraft.value.ship_to_address1 = ''
  } else {
    addressDraft.value.ship_to_address1 = before[0] || ''
    addressDraft.value.ship_to_address2 = before[1] || ''
  }

  addressPasteText.value = ''
}

async function saveAddress() {
  addressSaving.value = true
  actionError.value   = ''
  try {
    await ordersApi.updateAddress(editingAddressId.value, addressDraft.value)
    const idx = orders.value.findIndex(o => o.id === editingAddressId.value)
    if (idx !== -1) Object.assign(orders.value[idx], addressDraft.value)
    editingAddressId.value = null
  } catch (e) {
    actionError.value = e?.response?.data?.detail ?? 'Address update failed.'
  } finally {
    addressSaving.value = false
  }
}

// ── Sync from ShipStation ─────────────────────────────────────────────────────

const syncing = ref(false)

async function syncNow() {
  syncing.value = true
  actionError.value = ''
  try {
    await shippingApi.syncMyStores()
    // Give Celery a moment to process, then reload
    await new Promise(r => setTimeout(r, 2500))
    await loadOrders()
  } catch (e) {
    const detail = e?.response?.data?.detail ?? e?.message ?? `HTTP ${e?.response?.status}`
    actionError.value = `Sync failed: ${detail}`
  } finally {
    syncing.value = false
  }
}

const totalItemCount = computed(() =>
  orders.value.reduce((sum, o) => sum + (o.items || [])
    .filter(i => Number(i.unit_price) >= 0)
    .reduce((s, i) => s + (i.quantity || 0), 0), 0)
)

// ── Pagination ────────────────────────────────────────────────────────────────

const totalPages = computed(() => Math.ceil(totalCount.value / PAGE_SIZE))

function goPage(p) {
  if (p < 1 || p > totalPages.value) return
  page.value = p
  loadOrders()
}
</script>

<template>
  <div class="space-y-4">

    <!-- Header -->
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold tracking-tight">Orders</h1>
      <div class="flex items-center gap-3">
        <span class="text-sm font-semibold text-text-primary">{{ totalCount }} orders</span>
        <span class="text-sm text-text-muted">· {{ totalItemCount }} items</span>
        <button @click="syncNow" :disabled="syncing"
          class="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-card-border hover:bg-sidebar-bg transition disabled:opacity-50">
          <svg :class="['w-4 h-4 transition-transform', syncing && 'animate-spin']"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ syncing ? 'Syncing…' : 'Sync' }}
        </button>
      </div>
    </div>

    <!-- Error -->
    <div v-if="actionError"
      class="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 flex justify-between">
      {{ actionError }}
      <button @click="actionError = ''" class="text-red-400 hover:text-red-600">✕</button>
    </div>

    <!-- Main tabs -->
    <div class="flex border-b border-card-border">
      <button @click="setMainTab('new_orders')"
        class="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition"
        :class="mainTab === 'new_orders'
          ? 'border-accent text-accent'
          : 'border-transparent text-text-secondary hover:text-text-primary'">
        New Orders
        <span v-if="tabCounts.new_orders" class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold leading-none"
          :class="mainTab === 'new_orders' ? 'bg-accent text-white' : 'bg-gray-200 text-text-secondary'">
          {{ tabCounts.new_orders }}
        </span>
      </button>
      <button @click="setMainTab('ready_for_print')"
        class="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition"
        :class="mainTab === 'ready_for_print'
          ? 'border-accent text-accent'
          : 'border-transparent text-text-secondary hover:text-text-primary'">
        Ready for Print
        <span v-if="tabCounts.ready_for_print" class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold leading-none"
          :class="mainTab === 'ready_for_print' ? 'bg-accent text-white' : 'bg-gray-200 text-text-secondary'">
          {{ tabCounts.ready_for_print }}
        </span>
      </button>
      <button @click="setMainTab('in_production')"
        class="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition"
        :class="mainTab === 'in_production'
          ? 'border-accent text-accent'
          : 'border-transparent text-text-secondary hover:text-text-primary'">
        In Production
        <span v-if="tabCounts.in_production" class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold leading-none"
          :class="mainTab === 'in_production' ? 'bg-accent text-white' : 'bg-gray-200 text-text-secondary'">
          {{ tabCounts.in_production }}
        </span>
      </button>
      <button @click="setMainTab('completed')"
        class="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold border-b-2 transition"
        :class="mainTab === 'completed'
          ? 'border-accent text-accent'
          : 'border-transparent text-text-secondary hover:text-text-primary'">
        Completed
        <span v-if="tabCounts.completed" class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold leading-none"
          :class="mainTab === 'completed' ? 'bg-accent text-white' : 'bg-gray-200 text-text-secondary'">
          {{ tabCounts.completed }}
        </span>
      </button>
    </div>

    <!-- Ready for Print running total -->
    <div v-if="mainTab === 'ready_for_print'"
      class="card px-4 py-2.5 flex items-center justify-between">
      <span class="text-sm text-text-secondary">
        {{ readyForPrintSummary.count }} order{{ readyForPrintSummary.count === 1 ? '' : 's' }} queued
      </span>
      <span class="text-sm">
        <span class="text-text-muted font-semibold">Total</span>
        <span class="font-bold text-blue-600 tabular-nums ml-1.5">${{ Number(readyForPrintSummary.total || 0).toFixed(2) }}</span>
      </span>
    </div>

    <!-- Toolbar -->
    <div class="space-y-2">
      <!-- Sub-filters (New Orders tab only) -->
      <div v-if="mainTab === 'new_orders'" class="card px-3 py-2 flex gap-1 overflow-x-auto">
        <button v-for="f in NEW_ORDER_FILTERS" :key="f.key" @click="setSubFilter(f.key)"
          class="shrink-0 py-1.5 px-3 rounded-lg text-sm font-medium transition"
          :class="subFilter === f.key
            ? 'bg-accent text-white'
            : 'hover:bg-sidebar-bg text-text-secondary'">
          {{ f.label }}
        </button>
      </div>

      <!-- Search + store filter -->
      <div class="flex gap-2">
        <select v-if="stores.length > 1"
          :value="storeFilter"
          @change="setStore($event.target.value)"
          class="rounded-lg border border-card-border px-3 py-2 text-sm bg-white text-text-primary">
          <option value="">All Stores</option>
          <option v-for="s in stores" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
        <input v-model="searchQ" @keyup.enter="doSearch"
          placeholder="Search by order # or customer…"
          class="flex-1 rounded-lg border border-card-border px-3 py-2 text-sm" />
        <button v-if="!auth.isTeamMember" @click="openManageTags"
          class="shrink-0 rounded-lg border border-card-border bg-white px-3 py-2 text-sm font-medium text-text-primary hover:bg-sidebar-bg transition">
          🏷 Manage Tags
        </button>
      </div>

      <!-- Bulk selection toolbar + sort -->
      <div class="flex items-center justify-between gap-2">
        <div v-if="mainTab === 'new_orders'" class="flex items-center gap-2">
          <div class="flex items-center gap-2 rounded-lg border border-card-border bg-white px-3 py-1.5">
            <input type="checkbox" class="accent-accent scale-[2]"
              :checked="pageAllSelected" @change="toggleSelectAllOnPage" />
            <span class="text-base text-text-primary min-w-[1ch] text-center ml-1">{{ selectedIds.size }}</span>
            <button @click="toggleSelectMenu($event)" class="text-text-muted hover:text-text-primary text-sm px-0.5">▾</button>
          </div>

          <div class="rounded-lg border border-card-border bg-white px-4 py-1.5">
            <button @click="toggleMoreActionsMenu($event)" class="flex items-center gap-1.5 text-base text-text-primary">
              More actions <span class="text-text-muted text-sm">▾</span>
            </button>
          </div>

          <button @click="matchAll" :disabled="autoMatchAllLoading"
            class="flex items-center gap-1.5 rounded-lg border border-card-border bg-white px-4 py-1.5 text-sm font-medium text-text-primary hover:bg-sidebar-bg transition disabled:opacity-50">
            <span v-if="autoMatchAllLoading" class="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span v-else>✨</span>
            Match All
          </button>
        </div>
        <div v-else></div>

        <div class="rounded-lg border border-card-border bg-white px-4 py-1.5">
          <button @click="toggleSortMenu($event)" class="flex items-center gap-1.5 text-base text-text-primary">
            Sort: {{ SORT_OPTIONS.find(o => o.key === sortBy)?.label }} <span class="text-text-muted text-sm">▾</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Loading skeleton -->
    <div v-if="loading" class="space-y-3">
      <div v-for="i in 4" :key="i" class="card h-44 animate-pulse bg-gray-100" />
    </div>

    <!-- Empty -->
    <div v-else-if="!orders.length"
      class="card p-12 text-center text-text-secondary text-sm">
      <span v-if="mainTab === 'new_orders'">No new orders.</span>
      <span v-else-if="mainTab === 'ready_for_print'">No orders waiting for the print center.</span>
      <span v-else-if="mainTab === 'in_production'">No orders in production.</span>
      <span v-else>No completed orders.</span>
    </div>

    <!-- Orders grouped by date -->
    <template v-else>
      <div v-for="group in grouped" :key="group.key" class="space-y-2">

        <!-- Date separator -->
        <div v-if="group.key !== 'status'" class="flex items-center gap-3 pt-2">
          <span class="text-[11px] font-bold text-text-muted uppercase tracking-widest shrink-0">
            Ordered {{ dateLabel(group.key) }}
          </span>
          <div class="flex-1 h-px bg-card-border" />
        </div>

        <!-- ── Order card ──────────────────────────────────────────────────── -->
        <div v-for="order in group.orders" :key="order.id" :id="`order-card-${order.id}`"
          class="rounded-xl overflow-hidden border-2 bg-white shadow-sm transition-shadow"
          :class="[
            flashOrderId === order.id ? 'border-red-500 ring-4 ring-red-200' : 'border-gray-900',
            mainTab === 'new_orders'
              ? (order.unmatched_count
                  ? 'border-l-[5px] border-l-amber-400'
                  : order.status === 'ready'
                    ? 'border-l-[5px] border-l-blue-400'
                    : 'border-l-[5px] border-l-emerald-400')
              : '',
          ]">

          <!-- Header bar — column widths mirror the body row below so "Order Cost"
               lands exactly on the items/design divider regardless of tab or content -->
          <div class="relative flex items-center border-b border-gray-100 bg-white">

            <!-- Tracking tag + elapsed-since-ordered counter — centered over the whole header.
                 Only shown once a tag is applied; adding one happens from the ⋮ menu. -->
            <div v-if="order.tag" class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 z-10">
              <button @click="toggleTagMenu(order, $event)"
                class="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition"
                :style="{ backgroundColor: order.tag.color + '22', borderColor: order.tag.color, color: order.tag.color }">
                <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: order.tag.color }"></span>
                {{ order.tag.name }}
              </button>

              <span v-if="order.ordered_at" class="text-xs text-text-muted whitespace-nowrap">
                {{ timeSinceOrder(order) }}
              </span>
            </div>

            <!-- Checkbox-width spacer (mirrors body's checkbox column) -->
            <div v-if="mainTab === 'new_orders'" class="w-8 shrink-0" />

            <!-- Main-content cell: mirrors per-item row structure in body -->
            <div class="flex-1 min-w-0 flex">
            <!-- Items sub-cell -->
            <div class="flex-1 min-w-0 max-w-[750px] flex items-center gap-2 px-4 py-2.5">
              <!-- Marketplace order# — bold, prominent -->
              <span v-if="order.external_order_number"
                class="font-bold font-mono text-base text-text-primary shrink-0">
                {{ order.external_order_number }}
              </span>
              <!-- Buyer / recipient name — smaller -->
              <span class="text-sm text-text-secondary">{{ order.ship_to_name || order.customer_name }}</span>
              <span v-if="order.store_name"
                class="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 border border-gray-200 shrink-0">
                {{ order.store_name }}
              </span>
              <span v-if="order.shipstation_sync_error"
                :title="order.shipstation_sync_error"
                class="inline-flex items-center gap-1.5 text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 shrink-0 font-semibold">
                ⚠ Not synced to ShipStation
                <button @click="retrySync(order)" :disabled="resyncingOrderId === order.id"
                  class="underline hover:no-underline disabled:opacity-50">
                  {{ resyncingOrderId === order.id ? 'Retrying…' : 'Retry Sync' }}
                </button>
              </span>
              <span v-if="order.sendError"
                :title="order.sendError"
                class="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 border border-red-200 shrink-0 font-semibold">
                ⚠ Not sent to print
              </span>
            </div>

            <!-- Order Cost sub-cell -->
            <div class="flex-1 min-w-0 flex items-center justify-end px-4 py-2.5">
              <div class="relative">
                <button @click="toggleCostBreakdown(order)"
                  class="flex items-center gap-1.5 text-sm hover:bg-sidebar-bg rounded-lg px-1.5 py-0.5 -mx-1.5 transition">
                  <span class="text-text-muted font-bold shrink-0">Order Cost</span>
                  <span class="font-bold text-blue-600 tabular-nums text-right inline-block" style="min-width: 6.5ch">
                    ${{ orderCostTotal(order).toFixed(2) }}
                  </span>
                  <span class="text-text-muted text-xs shrink-0">▾</span>
                </button>

                <!-- Breakdown popover -->
                <template v-if="costBreakdownOrderId === order.id">
                <div class="fixed inset-0 z-40" @click="costBreakdownOrderId = null"></div>
                <div @click.stop
                  class="absolute right-0 top-full mt-1 w-56 z-50 bg-white rounded-xl shadow-2xl border border-card-border p-3 space-y-1.5">
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-text-secondary">Item price</span>
                    <span class="font-semibold text-text-primary tabular-nums">${{ Number(order.item_cost || 0).toFixed(2) }}</span>
                  </div>
                  <div class="flex items-center justify-between text-xs">
                    <span class="text-text-secondary">Shipping</span>
                    <span class="font-semibold text-text-primary tabular-nums">${{ Number(order.shipping_cost || 0).toFixed(2) }}</span>
                  </div>
                  <div v-if="Number(order.extra_print_area_fee) > 0" class="flex items-center justify-between text-xs">
                    <span class="text-text-secondary">Extra print area</span>
                    <span class="font-semibold text-text-primary tabular-nums">${{ Number(order.extra_print_area_fee).toFixed(2) }}</span>
                  </div>
                  <div class="border-t border-card-border pt-1.5 flex items-center justify-between text-xs">
                    <span class="font-bold text-text-primary">Total</span>
                    <span class="font-bold text-blue-600 tabular-nums">${{ orderCostTotal(order).toFixed(2) }}</span>
                  </div>
                </div>
                </template>
              </div>
            </div>
            </div><!-- /main-content header cell -->

            <!-- Shipping-column-matching cell: status badge + ⋮ menu -->
            <div class="w-64 shrink-0 flex items-center justify-end gap-2 px-4 py-2.5">
              <!-- Status badge — hide "new" label since the tab already communicates this;
                   New Orders tab uses the left-border color as the status indicator instead -->
              <span v-if="order.status !== 'new' && mainTab !== 'new_orders'"
                class="text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0"
                :class="STATUS_CLS[order.status] ?? 'bg-gray-100 text-gray-600'">
                {{ STATUS_LABEL[order.status] ?? order.status }}
              </span>

              <!-- ⋮ Order actions menu -->
              <button @click="openActionsMenu(order, $event)"
                title="Order actions"
                class="w-7 h-7 rounded-full bg-white/90 border border-card-border shadow flex items-center justify-center hover:bg-sidebar-bg transition shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-gray-700" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Body: [checkbox col] [items col] [shipping col] -->
          <div class="flex divide-x divide-card-border">

            <!-- Checkbox column -->
            <div v-if="mainTab === 'new_orders'" class="w-8 shrink-0 flex items-start justify-center pt-5">
              <input type="checkbox" class="accent-accent scale-[2]"
                :checked="selectedIds.has(order.id)" @change="toggleSelect(order)" />
            </div>

            <!-- ── Main content: per-item rows (item info + design side by side) ── -->
            <div class="flex-1 min-w-0 flex flex-col">

              <template v-for="(item, idx) in order.items" :key="item.id">
                <!-- Skip discount/adjustment items (negative price) -->
                <div v-if="Number(item.unit_price) >= 0"
                  class="flex rounded-lg border border-card-border"
                  :class="idx > 0 ? 'mt-2' : ''">

                  <div class="relative flex gap-4 px-2 pt-2 pb-4 min-w-0"
                    :class="mainTab === 'new_orders' && item.is_matched ? 'flex-1 max-w-[750px]' : 'flex-1'">

                  <!-- Per-item ⋮ menu — sits at the right edge of the item-info column,
                       i.e. right against the divider with the design area, not the image -->
                  <div v-if="mainTab === 'new_orders' && ['new','matching','ready'].includes(order.status)"
                    class="absolute top-1.5 right-1.5 z-10">
                    <button @click="toggleItemMenu(item)"
                      title="Item actions"
                      class="w-7 h-7 rounded-full bg-white/90 border border-card-border shadow flex items-center justify-center hover:bg-sidebar-bg transition">
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-gray-700" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/>
                      </svg>
                    </button>
                    <div v-if="itemMenuOpenId === item.id" class="fixed inset-0 z-10" @click="itemMenuOpenId = null"></div>
                    <div v-if="itemMenuOpenId === item.id"
                      class="absolute right-0 top-full mt-1 w-48 z-20 bg-white rounded-lg shadow-xl border border-card-border py-1">
                      <button v-if="item.is_matched" @click="openQuickVariantEdit(order, item)"
                        class="w-full text-left px-3 py-2 text-sm font-medium text-text-primary hover:bg-sidebar-bg">
                        Edit Item
                      </button>
                      <button v-if="!item.personalization" @click="itemMenuOpenId = null; startPersonalizationEdit(item)"
                        class="w-full text-left px-3 py-2 text-sm font-medium text-text-primary hover:bg-sidebar-bg">
                        Add Personalization
                      </button>
                      <button @click="cloneItem(order, item)"
                        :disabled="!canEditItemContent(order, item) || cloningItemId === item.id"
                        :title="canEditItemContent(order, item) ? '' : 'Match this item and get a rate first'"
                        class="w-full text-left px-3 py-2 text-sm font-medium text-text-primary hover:bg-sidebar-bg disabled:opacity-40 disabled:cursor-not-allowed">
                        {{ cloningItemId === item.id ? 'Cloning…' : 'Clone Item' }}
                      </button>
                      <button @click="itemMenuOpenId = null; openAddItem(order)"
                        :disabled="order.shipping_cost == null"
                        :title="order.shipping_cost == null ? 'Get a shipping rate first' : ''"
                        class="w-full text-left px-3 py-2 text-sm font-medium text-text-primary hover:bg-sidebar-bg disabled:opacity-40 disabled:cursor-not-allowed">
                        Add Item
                      </button>
                      <button @click="deleteItem(order, item)"
                        :disabled="!canDeleteItem(order, item) || deletingItemId === item.id"
                        :title="canDeleteItem(order, item) ? '' : 'An order must have at least one item'"
                        class="w-full text-left px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent">
                        {{ deletingItemId === item.id ? 'Removing…' : 'Delete Item' }}
                      </button>
                    </div>
                  </div>

                  <!-- Product image -->
                  <div class="shrink-0 relative group w-44 h-52">
                    <img v-if="item.display_image_url || item.image_url"
                      :src="item.display_image_url || item.image_url" :alt="item.raw_product_name"
                      @click="zoomedImage = item.display_image_url || item.image_url"
                      class="w-44 h-52 rounded-lg object-cover border border-card-border cursor-zoom-in" />
                    <div v-else
                      class="w-44 h-52 rounded-lg bg-gray-100 flex items-center justify-center text-text-muted text-[10px]">
                      No image
                    </div>
                    <!-- Replace image button -->
                    <label class="absolute bottom-1.5 left-1.5 w-6 h-6 rounded-full bg-white/90 shadow flex items-center justify-center cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity" title="Replace image">
                      <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-gray-700" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/>
                      </svg>
                      <input type="file" accept=".png,image/png" class="hidden"
                        @change="e => replaceItemImage(order, item, e.target.files[0])" />
                    </label>
                  </div>

                  <!-- Product details -->
                  <div class="flex-1 min-w-0 space-y-1 py-0.5">

                    <!-- Title: split at midpoint word into 2 lines -->
                    <div class="font-bold text-sm text-text-primary leading-snug">
                      <span>{{ splitTitle(item.raw_product_name).line1 }}</span>
                      <template v-if="splitTitle(item.raw_product_name).line2">
                        <br>
                        <span>{{ splitTitle(item.raw_product_name).line2 }}</span>
                      </template>
                    </div>

                    <!-- Qty -->
                    <div class="text-sm text-text-secondary flex items-center gap-1.5">
                      <template v-if="quantityDraft[item.id] !== undefined">
                        <span class="shrink-0">Qty:</span>
                        <input type="number" min="1" v-model.number="quantityDraft[item.id]"
                          @keyup.enter="saveQuantity(order, item)"
                          class="w-16 border border-gray-300 rounded px-1.5 py-0.5 text-sm text-text-primary focus:outline-none focus:border-accent" />
                        <button @click="saveQuantity(order, item)" :disabled="quantitySaving === item.id"
                          class="shrink-0 text-xs font-semibold text-accent hover:underline disabled:opacity-50">
                          {{ quantitySaving === item.id ? 'Saving…' : 'Save' }}
                        </button>
                        <button @click="delete quantityDraft[item.id]"
                          class="shrink-0 text-xs text-text-muted hover:underline">Cancel</button>
                      </template>
                      <template v-else>
                        Qty: <strong class="text-text-primary">{{ item.quantity }}</strong>
                        <button @click="startQuantityEdit(item)"
                          :disabled="!canEditItemContent(order, item)"
                          :title="canEditItemContent(order, item) ? '' : 'Match this item and get a rate first'"
                          class="text-xs font-semibold text-accent hover:underline disabled:opacity-40 disabled:no-underline disabled:cursor-not-allowed">
                          Edit
                        </button>
                      </template>
                      <span v-if="item.is_manual" class="badge bg-sky-100 text-sky-800 text-[10px]">Manually Added</span>
                    </div>

                    <!-- PC product name (matched only) -->
                    <div v-if="item.pc_product_name" class="text-sm font-bold text-text-primary">
                      {{ item.pc_product_name }}
                    </div>

                    <!-- SKU -->
                    <div v-if="item.marketplace_sku || skuDraft[item.id] !== undefined" class="text-sm text-text-secondary flex items-center gap-1.5">
                      <template v-if="skuDraft[item.id] !== undefined">
                        <span class="shrink-0">SKU:</span>
                        <input v-model="skuDraft[item.id]" @keyup.enter="saveSku(order, item)"
                          class="flex-1 min-w-0 border border-gray-300 rounded px-1.5 py-0.5 text-sm font-mono text-text-primary focus:outline-none focus:border-accent" />
                        <button @click="saveSku(order, item)" :disabled="skuSaving === item.id"
                          class="shrink-0 text-xs font-semibold text-accent hover:underline disabled:opacity-50">
                          {{ skuSaving === item.id ? 'Saving…' : 'Save' }}
                        </button>
                        <button @click="delete skuDraft[item.id]"
                          class="shrink-0 text-xs text-text-muted hover:underline">Cancel</button>
                      </template>
                      <template v-else>
                        SKU: <strong class="font-mono text-text-primary">{{ item.marketplace_sku }}</strong>
                        <button @click="startSkuEdit(item)"
                          class="text-xs font-semibold text-accent hover:underline">Edit</button>
                      </template>
                    </div>

                    <!-- Variant info + Match button -->
                    <div class="flex items-start gap-2">
                      <div class="space-y-1">
                        <template v-if="item.is_matched">
                          <div class="relative inline-block"
                            @mouseenter="formatOptions(item.raw_options).length && showOriginTooltip(item, $event)"
                            @mouseleave="hideOriginTooltip">
                            <div v-if="item.pc_variant_size" class="text-sm text-text-secondary">
                              {{ item.pc_variant1_label || 'Size' }}: <strong class="text-text-primary">{{ item.pc_variant_size }}</strong>
                            </div>
                            <div v-if="item.pc_variant_color" class="text-sm text-text-secondary">
                              {{ item.pc_variant2_label || 'Color' }}: <strong class="text-text-primary">{{ item.pc_variant_color }}</strong>
                            </div>
                          </div>
                        </template>
                        <template v-else>
                          <div v-for="[k, v] in formatOptions(item.raw_options).filter(([k]) => k.toLowerCase() !== 'personalization')" :key="k"
                            class="text-sm text-text-secondary">
                            {{ k }}: <strong class="text-text-primary">{{ v }}</strong>
                          </div>
                        </template>
                      </div>

                      <!-- Match button -->
                      <button
                        v-if="mainTab === 'new_orders' && ['new','matching','ready'].includes(order.status)"
                        @click="openMatch(order, item)"
                        :title="item.is_matched ? 'Re-match product' : 'Match product'"
                        :class="[
                          'shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg border text-xs font-semibold transition',
                          item.is_matched
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                            : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                        ]">
                        <svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M16 17H5v-3l-4 4 4 4v-3h13v-6h-2v4zM3 7h11v3l4-4-4-4v3H3v6h2V7z"/>
                        </svg>
                        {{ item.is_matched ? 'Re-match' : 'Match' }}
                      </button>
                    </div>

                    <!-- Personalization — separate block, full width -->
                    <div v-if="item.personalization || editingPersonalizationId === item.id" class="text-sm text-text-secondary select-none">
                      <template v-if="editingPersonalizationId === item.id">
                        <div class="flex items-start gap-1.5">
                          <span class="shrink-0 mt-0.5">Personalization:</span>
                          <textarea ref="personalizationTextarea" v-model="personalizationDraft" rows="1"
                            @input="autoGrowTextarea($event.target)"
                            class="flex-1 min-w-0 border border-gray-300 rounded px-2 py-0.5 text-sm text-text-primary focus:outline-none focus:border-accent resize-none overflow-hidden"></textarea>
                          <button @click="savePersonalization(order, item)" :disabled="personalizationSaving"
                            class="shrink-0 text-xs font-semibold text-accent hover:underline disabled:opacity-50 mt-0.5">
                            {{ personalizationSaving ? 'Saving…' : 'Save' }}
                          </button>
                          <button @click="editingPersonalizationId = null"
                            class="shrink-0 text-xs text-text-muted hover:underline mt-0.5">Cancel</button>
                        </div>
                      </template>
                      <template v-else>
                        <div class="flex items-start gap-1.5">
                          <span class="min-w-0">Personalization: <strong class="text-text-primary select-text">{{ item.personalization }}</strong></span>
                          <button @click="startPersonalizationEdit(item)"
                            class="shrink-0 text-xs font-semibold text-accent hover:underline">Edit</button>
                        </div>
                      </template>
                    </div>

                  </div>
                </div>
                <!-- Design area: in same flex row as item info — heights auto-match via flexbox -->
                <div v-if="mainTab === 'new_orders' && item.is_matched"
                  class="flex-1 min-w-0 border-l border-card-border pt-1 pb-4">

                  <!-- Horizontal scroll strip — drag to scroll, also accepts file drops on empty space -->
                  <div class="relative">
                    <!-- Scroll buttons: appear when strip content overflows -->
                    <button type="button" @mousedown.stop @click="scrollStrip($event, 'left')"
                      class="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-6 h-12 bg-white/90 border border-card-border rounded-r shadow flex items-center justify-center text-text-muted text-lg leading-none hover:text-text-primary transition"
                      :class="stripHasOverflow(item) ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'">‹</button>
                    <button type="button" @mousedown.stop @click="scrollStrip($event, 'right')"
                      class="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-6 h-12 bg-white/90 border border-card-border rounded-l shadow flex items-center justify-center text-text-muted text-lg leading-none hover:text-text-primary transition"
                      :class="stripHasOverflow(item) ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'">›</button>
                  <div data-scroll-strip class="px-4 pt-3 pb-1 select-none"
                    style="cursor:grab; scrollbar-width:none; -ms-overflow-style:none; overflow-x:auto;"
                    @mousedown="onStripMouseDown"
                    @mousemove="onStripMouseMove"
                    @mouseup="onStripMouseUp"
                    @mouseleave="onStripMouseLeave"
                    @dragover.prevent
                    @drop.prevent="e => { dragOverTarget = null; addDesignFiles(item, e.dataTransfer.files) }">
                    <div class="flex gap-3 w-max">

                      <!-- Saved cards (SkuDesign library entries) -->
                      <div v-for="design in item.designs" :key="design.id"
                        class="relative group shrink-0 w-40 flex flex-col">
                        <!-- Matched badge: sits on the top border of the card (half above, half below).
                             Visible because the strip has pt-3 padding that is not clipped by overflow-x-auto. -->
                        <span v-if="design.is_matched"
                          class="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 text-xs font-bold bg-accent text-white rounded px-2 py-0.5 leading-tight whitespace-nowrap ring-2 ring-white">
                          Matched
                        </span>
                        <div class="relative w-40 h-40 rounded-lg border overflow-hidden"
                          :class="design.is_matched ? 'border-accent' : 'border-card-border'"
                          :style="CHECKER_BG">
                          <img :src="design.file" :alt="design.print_area_name"
                            class="w-full h-full object-contain cursor-zoom-in"
                            @mousedown.stop @click="zoomedImage = design.file" />
                          <button @mousedown.stop @click="zoomedImage = design.file"
                            class="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-white/80 shadow flex items-center justify-center text-gray-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity">🔍</button>
                          <button @mousedown.stop @click.stop="deleteDesign(order, item, design)"
                            class="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-500 shadow flex items-center justify-center text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                        </div>
                        <div class="flex gap-1 mt-1.5">
                          <span class="flex-1 min-w-0 text-center text-sm font-semibold text-text-primary bg-gray-100 rounded px-1 py-0.5 truncate">{{ design.print_area_name }}</span>
                          <span class="flex-1 min-w-0 text-center text-sm font-semibold rounded px-1 py-0.5 truncate"
                            :class="design.color_scope === 'dark' ? 'bg-gray-800 text-white' : design.color_scope === 'light' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-text-primary'">
                            {{ design.color_scope === 'all' ? 'All' : design.color_scope === 'dark' ? 'Dark' : design.color_scope === 'light' ? 'Light' : design.specific_color }}
                          </span>
                        </div>
                      </div>

                      <!-- Draft cards -->
                      <template v-if="_getDrafts(item.id).length">
                        <div v-for="draft in _getDrafts(item.id)" :key="draft._id"
                          class="relative shrink-0 w-40 flex flex-col">
                          <label class="relative w-40 h-40 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer overflow-hidden transition group"
                            :style="CHECKER_BG"
                            :class="dragOverTarget === 'draft-' + draft._id ? 'border-accent bg-accent/5' : 'border-card-border hover:border-accent'"
                            @mousedown.stop
                            @dragover.prevent.stop="dragOverTarget = 'draft-' + draft._id"
                            @dragleave.prevent="dragOverTarget = null"
                            @drop.prevent.stop="e => { dragOverTarget = null; replaceDraftFile(item, draft._id, e.dataTransfer.files) }">
                            <img :src="draft.preview" class="w-full h-full object-contain" />
                            <div class="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <span class="text-white text-xs font-semibold">Change</span>
                            </div>
                            <input type="file" accept=".png,image/png" class="hidden"
                              @change="e => replaceDraftFile(item, draft._id, e.target.files)" />
                            <!-- Magnifier top-left -->
                            <button @mousedown.stop @click.stop="zoomedImage = draft.preview"
                              class="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-white/80 shadow flex items-center justify-center text-gray-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity">🔍</button>
                            <!-- Remove draft top-right -->
                            <button @mousedown.stop @click.stop="cancelDraft(item.id, draft._id)"
                              class="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-red-500 shadow flex items-center justify-center text-white text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                          </label>

                          <!-- Two independent triggers — print area / color — each opens its own
                               popover (Teleported to body, see below, since this card sits inside an
                               overflow-x-auto strip that would otherwise clip them) -->
                          <div class="mt-1.5 flex gap-1">
                            <button type="button" @mousedown.stop @click.stop="toggleDraftPicker(draft, 'area', $event)"
                              class="flex-1 min-w-0 flex items-center justify-between gap-0.5 text-sm font-semibold text-text-primary bg-gray-100 rounded px-1.5 py-1 hover:bg-gray-200 transition">
                              <span class="truncate">{{ draft.print_area_name }}</span>
                              <span class="text-text-muted shrink-0 text-sm">▾</span>
                            </button>
                            <button type="button" @mousedown.stop @click.stop="toggleDraftPicker(draft, 'color', $event)"
                              class="flex-1 min-w-0 flex items-center justify-between gap-0.5 text-sm font-semibold text-text-primary bg-gray-100 rounded px-1.5 py-1 hover:bg-gray-200 transition">
                              <span class="truncate">{{ colorSummaryLabel(draft) }}</span>
                              <span class="text-text-muted shrink-0 text-sm">▾</span>
                            </button>
                          </div>

                          <div v-if="draft.error" class="mt-1 text-[10px] text-red-600">{{ draft.error }}</div>
                        </div>
                      </template>

                      <!-- Add slot -->
                      <div class="shrink-0 w-40 flex flex-col">
                        <label class="w-40 h-40 rounded-lg border-2 border-dashed bg-gray-50 flex items-center justify-center text-3xl transition cursor-pointer"
                          :class="dragOverTarget === 'add-' + item.id
                            ? 'border-accent text-accent bg-accent/5 scale-[1.02]'
                            : 'border-card-border text-text-muted hover:border-accent hover:text-accent'"
                          @mousedown.stop
                          @dragover.prevent.stop="dragOverTarget = 'add-' + item.id"
                          @dragleave.prevent="dragOverTarget = null"
                          @drop.prevent.stop="e => { dragOverTarget = null; addDesignFiles(item, e.dataTransfer.files) }">
                          +
                          <input type="file" accept=".png,image/png" multiple class="hidden"
                            @change="e => addDesignFiles(item, e.target.files)" />
                        </label>
                        <div class="mt-1.5 h-[22px]"></div>
                      </div>

                      <!-- Save/Update — a slot inside the horizontal strip itself, not a separate
                           row below it: the strip just scrolls further right when it appears, so the
                           card's height never changes (no layout shift, no permanently reserved gap). -->
                      <div v-if="_getDrafts(item.id).length" class="shrink-0 w-32 flex flex-col items-start">
                        <button @mousedown.stop @click="saveAllDrafts(order, item)"
                          :disabled="_getSaving(item.id)"
                          class="rounded-lg text-sm font-bold text-white disabled:opacity-50 transition px-6 py-2.5"
                          style="background-color:#3EB489">
                          {{ _getSaving(item.id) ? 'Saving…' : item.designs?.length ? 'Update' : 'Save' }}
                        </button>
                        <div class="mt-1 h-[20px] flex items-center">
                          <span v-if="_getDrafts(item.id).some(d => d.error)"
                            title="Some designs failed. Fix errors and try again."
                            class="text-[10px] text-red-600 truncate">Fix errors</span>
                        </div>
                      </div>

                    </div>
                  </div><!-- /data-scroll-strip -->
                  </div><!-- /relative scroll wrapper -->
                </div>

                <!-- Design area (read-only) — order already committed, editing is locked -->
                <div v-else-if="item.is_matched && item.designs?.length"
                  class="flex-1 min-w-0 border-l border-card-border pt-1 pb-4">
                  <div class="overflow-x-auto px-4 pt-3 pb-1" style="scrollbar-width:none; -ms-overflow-style:none">
                    <div class="flex gap-3 w-max">
                      <div v-for="design in item.designs" :key="design.id" class="relative shrink-0 w-40 flex flex-col">
                        <div class="relative w-40 h-40 rounded-lg border border-card-border overflow-hidden" :style="CHECKER_BG">
                          <img :src="design.file" :alt="design.print_area_name"
                            class="w-full h-full object-contain cursor-zoom-in"
                            @click="zoomedImage = design.file" />
                        </div>
                        <div class="flex gap-1 mt-1.5">
                          <span class="flex-1 min-w-0 text-center text-sm font-semibold text-text-primary bg-gray-100 rounded px-1 py-0.5 truncate">{{ design.print_area_name }}</span>
                          <span class="flex-1 min-w-0 text-center text-sm font-semibold rounded px-1 py-0.5 truncate"
                            :class="design.color_scope === 'dark' ? 'bg-gray-800 text-white' : design.color_scope === 'light' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-text-primary'">
                            {{ design.color_scope === 'all' ? 'All' : design.color_scope === 'dark' ? 'Dark' : design.color_scope === 'light' ? 'Light' : design.specific_color }}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                </div><!-- /per-item row -->
              </template>

              <!-- Buyer note / Internal note / Gift — each its own compact inline row,
                   same icon+text+"Edit" pattern as item personalization -->
              <div v-if="order.buyer_note || editingBuyerNoteId === order.id"
                class="border-t border-amber-100 px-4 py-2 bg-amber-50 text-[12.5px] text-amber-800 flex items-start gap-1.5">
                <img :src="iconBuyerNote" class="w-5 h-5 shrink-0 mt-0.5" alt="" />
                <template v-if="editingBuyerNoteId === order.id">
                  <span class="font-semibold shrink-0 mt-0.5">Buyer Note:</span>
                  <textarea ref="buyerNoteTextarea" v-model="buyerNoteDraft" rows="1" maxlength="350"
                    @input="autoGrowTextarea($event.target)"
                    class="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1 text-[12.5px] text-text-primary focus:outline-none focus:border-accent resize-none overflow-hidden"></textarea>
                  <button @click="saveBuyerNote(order)" :disabled="buyerNoteSaving"
                    class="shrink-0 text-sm font-semibold text-accent hover:underline disabled:opacity-50 mt-0.5">
                    {{ buyerNoteSaving ? 'Saving…' : 'Save' }}
                  </button>
                  <button @click="editingBuyerNoteId = null" class="shrink-0 text-sm text-text-muted hover:underline mt-0.5">Cancel</button>
                </template>
                <template v-else>
                  <span class="flex-1 min-w-0 break-words"><span class="font-semibold">Buyer Note:</span> {{ order.buyer_note }}</span>
                  <button v-if="['new','matching','ready'].includes(order.status)" @click="startBuyerNoteEdit(order)"
                    class="shrink-0 font-semibold text-accent hover:underline mt-0.5">Edit</button>
                </template>
              </div>

              <div v-if="order.internal_note || editingInternalNoteId === order.id"
                class="border-t border-blue-100 px-4 py-2 bg-blue-50 text-[12.5px] text-blue-800 flex items-start gap-1.5">
                <img :src="iconInternalNote" class="w-5 h-5 shrink-0 mt-0.5" alt="" />
                <template v-if="editingInternalNoteId === order.id">
                  <span class="font-semibold shrink-0 mt-0.5">Internal Note:</span>
                  <textarea ref="internalNoteTextarea" v-model="internalNoteDraft" rows="1" maxlength="350"
                    @input="autoGrowTextarea($event.target)"
                    class="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1 text-[12.5px] text-text-primary focus:outline-none focus:border-accent resize-none overflow-hidden"></textarea>
                  <button @click="saveInternalNote(order)" :disabled="internalNoteSaving"
                    class="shrink-0 text-sm font-semibold text-accent hover:underline disabled:opacity-50 mt-0.5">
                    {{ internalNoteSaving ? 'Saving…' : 'Save' }}
                  </button>
                  <button @click="editingInternalNoteId = null" class="shrink-0 text-sm text-text-muted hover:underline mt-0.5">Cancel</button>
                </template>
                <template v-else>
                  <span class="flex-1 min-w-0 break-words"><span class="font-semibold">Internal Note:</span> {{ order.internal_note }}</span>
                  <button v-if="['new','matching','ready'].includes(order.status)" @click="startInternalNoteEdit(order)"
                    class="shrink-0 font-semibold text-accent hover:underline mt-0.5">Edit</button>
                </template>
              </div>

              <div v-if="order.is_gift"
                class="border-t border-pink-100 pl-6 pr-4 py-2 bg-pink-50 text-[12.5px] text-pink-800 flex items-start gap-1.5">
                <img :src="iconGiftNote" class="w-5 h-5 shrink-0 mt-0.5" alt="" />
                <template v-if="editingGiftId === order.id">
                  <span class="font-semibold shrink-0 mt-0.5">Gift Note:</span>
                  <textarea ref="giftNoteTextarea" v-model="giftMessageDraft" rows="1" maxlength="350"
                    @input="autoGrowTextarea($event.target)"
                    class="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1 text-[12.5px] text-text-primary focus:outline-none focus:border-accent resize-none overflow-hidden"></textarea>
                  <button @click="saveGiftMessage(order)" :disabled="giftSaving"
                    class="shrink-0 text-sm font-semibold text-accent hover:underline disabled:opacity-50 mt-0.5">
                    {{ giftSaving ? 'Saving…' : 'Save' }}
                  </button>
                  <button @click="editingGiftId = null" class="shrink-0 text-sm text-text-muted hover:underline mt-0.5">Cancel</button>
                </template>
                <template v-else>
                  <span class="min-w-0 break-words" :class="order.gift_message ? 'flex-1' : 'shrink-0'">
                    <span class="font-semibold">Gift Order</span><template v-if="order.gift_message"> — {{ order.gift_message }}</template>
                  </span>
                  <button v-if="['new','matching','ready'].includes(order.status)" @click="startGiftEdit(order)"
                    class="shrink-0 font-semibold text-accent hover:underline mt-0.5">
                    {{ order.gift_message ? 'Edit' : '+ Add Gift Note' }}
                  </button>
                </template>
              </div>

              <!-- Reship / Refund badge -->
              <div v-if="order.reship_info" class="border-t border-purple-100 px-4 py-2 bg-purple-50 text-xs text-purple-800">
                <span class="font-medium">
                  {{ order.reship_info.role === 'reship'
                      ? '↩ This is a reship'
                      : (order.reship_info.request_type === 'refund' ? '↩ Refund ' : '↩ Reship ') + order.reship_info.status }}
                </span>
                <span v-if="order.reship_info.request_type === 'refund' && order.reship_info.refund_amount != null">
                  — ${{ order.reship_info.refund_amount }} credited
                </span>
                <span v-if="order.reship_info.reason_display"> — {{ order.reship_info.reason_display }}</span>
                <span v-if="order.reship_info.note"> · {{ order.reship_info.note }}</span>
              </div>

              <!-- Completed: label download -->
              <div v-if="mainTab === 'completed' && order.label_url"
                class="px-4 py-3 border-t border-card-border">
                <a :href="order.label_url" target="_blank" class="btn-secondary text-xs py-1.5 px-3">
                  Download Label
                </a>
              </div>

            </div><!-- /main content column -->

            <!-- ── RIGHT: shipping / logistics info ──────────────────────── -->
            <div class="w-64 shrink-0 flex flex-col gap-2 px-4 py-2.5 text-sm">

              <!-- Ship by date -->
              <div class="flex items-start justify-between gap-2 relative">
                <div>
                  <div v-if="order.ship_by_date"
                    class="font-bold leading-tight text-sm"
                    :class="isOverdue(order.ship_by_date) ? 'text-red-600' : 'text-text-primary'">
                    <span v-if="isOverdue(order.ship_by_date)" class="mr-0.5">⚠</span>
                    Ship by {{ formatDate(order.ship_by_date) }}
                  </div>
                  <div v-if="order.ordered_at" class="text-text-primary text-xs mt-0.5">
                    Ordered {{ formatDate(order.ordered_at?.slice(0,10)) }}
                  </div>
                </div>
              </div>

              <template v-if="order.label_source !== 'uploaded'">
              <!-- Ship to -->
              <div class="border-t border-card-border pt-3">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-[11px] font-semibold text-text-muted uppercase tracking-wide">Ship to</span>
                  <button @click="startAddressEdit(order)" class="text-[11px] text-accent hover:underline">✏ Edit</button>
                </div>
                <div class="space-y-0 text-sm leading-tight">
                  <div class="font-bold text-text-primary text-[14px] leading-tight">{{ order.ship_to_name }}</div>
                  <div v-if="order.ship_to_company" class="text-text-secondary leading-tight">{{ order.ship_to_company }}</div>
                  <div class="text-text-secondary leading-tight">{{ order.ship_to_address1 }}</div>
                  <div v-if="order.ship_to_address2" class="text-text-secondary leading-tight">{{ order.ship_to_address2 }}</div>
                  <div class="text-text-secondary leading-tight">
                    {{ order.ship_to_city }}<span v-if="order.ship_to_state">, {{ order.ship_to_state }}</span>
                    <span v-if="order.ship_to_postal_code"> {{ order.ship_to_postal_code }}</span>
                  </div>
                  <div v-if="order.ship_to_country && order.ship_to_country !== 'US'"
                    class="text-text-muted leading-tight">{{ order.ship_to_country }}</div>
                  <div v-if="order.address_status === 'validated'"
                    class="flex items-center gap-1 text-[12px] font-semibold text-emerald-600 mt-1">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3.5 h-3.5 shrink-0">
                      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.567a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clip-rule="evenodd" />
                    </svg>
                    Address validated
                  </div>
                  <div v-else-if="order.address_status === 'warning'"
                    class="text-[11px] font-semibold text-amber-600 mt-1"
                    title="ShipStation flagged this address (e.g. apartment/suite not found). A label can still be created — worth a quick check.">
                    ⚠ Address warning — check apt/suite
                  </div>
                  <div v-else-if="order.address_status === 'failed'"
                    class="text-[11px] font-semibold text-red-600 mt-1"
                    title="ShipStation could not validate this address. Please review it before sending to print.">
                    ✕ Address validation failed
                  </div>
                </div>
              </div>

              <!-- ── Shipping (requested service + selected carrier/rate) ─── -->
              <div v-if="order.requested_service || mainTab === 'new_orders'" class="border-t border-card-border pt-3">
                <div class="flex items-center justify-between mb-1">
                  <span class="text-xs font-semibold text-text-muted uppercase tracking-wide">Shipping</span>
                  <button v-if="mainTab === 'new_orders' && order.unmatched_count === 0 && !orderRateState(order.id).loading && !order.selected_carrier_code"
                    @click="openRatesModal(order, $event)"
                    class="text-xs text-accent hover:underline">
                    Select
                  </button>
                </div>

                <div v-if="order.requested_service" class="text-text-muted text-xs mb-0.5 truncate">
                  Requested: {{ order.requested_service }}
                </div>

                <div v-if="mainTab === 'new_orders' && order.unmatched_count === 0" class="flex gap-1 mb-1.5">
                  <button v-for="c in SHIPPING_CATEGORIES" :key="c.value"
                    @click="changeShippingCategory(order, c.value)"
                    :disabled="categoryChangingId === order.id || order.shipping_category === c.value"
                    class="text-[11px] px-2 py-0.5 rounded-full border transition disabled:cursor-default"
                    :class="order.shipping_category === c.value
                      ? 'border-accent bg-accent/10 text-accent font-semibold'
                      : 'border-card-border text-text-muted hover:border-gray-300 hover:text-text-primary'"
                    :title="order.shipping_category === c.value ? '' : `Rush to ${c.label} shipping`">
                    {{ c.label }}
                  </button>
                </div>

                <div v-if="mainTab === 'new_orders' && order.unmatched_count === 0" class="relative">
                  <button v-if="order.selected_carrier_code"
                    @click="openRatesModal(order, $event)"
                    class="w-full flex items-center justify-between gap-2 text-sm rounded-lg border px-2 py-1.5 transition"
                    :class="ratesModalOrder?.id === order.id
                      ? 'border-accent bg-accent/5'
                      : 'border-card-border hover:border-gray-300 hover:bg-sidebar-bg'">
                    <span class="flex items-center gap-1.5 min-w-0">
                      <img v-if="carrierMeta(order.selected_carrier_code)" :src="carrierMeta(order.selected_carrier_code).logo"
                        @error="e => e.target.style.display='none'" class="w-7 h-7 object-contain shrink-0" />
                      <span class="text-text-primary font-semibold leading-snug truncate">
                        {{ order.selected_service_name || titleCase(order.selected_service_code) }}
                      </span>
                    </span>
                    <span class="flex items-center gap-1 shrink-0">
                      <span class="text-emerald-600 font-bold">${{ Number(order.shipping_cost).toFixed(2) }}</span>
                      <span class="text-text-muted text-xs">{{ ratesModalOrder?.id === order.id ? '▴' : '▾' }}</span>
                    </span>
                  </button>
                  <div v-else-if="orderRateState(order.id).loading" class="text-text-muted text-sm">Fetching rates…</div>
                  <button v-else-if="order.default_shipping_option"
                    @click="openRatesModal(order, $event)"
                    class="w-full flex items-center justify-between gap-2 text-sm rounded-lg border px-2 py-1.5 transition"
                    :class="ratesModalOrder?.id === order.id
                      ? 'border-accent bg-accent/5'
                      : 'border-card-border hover:border-gray-300 hover:bg-sidebar-bg'">
                    <span class="flex items-center gap-1.5 min-w-0">
                      <img v-if="carrierMeta(order.default_shipping_option.carrier_code)" :src="carrierMeta(order.default_shipping_option.carrier_code).logo"
                        @error="e => e.target.style.display='none'" class="w-7 h-7 object-contain shrink-0" />
                      <span class="text-text-primary font-semibold leading-snug truncate">
                        {{ order.default_shipping_option.service_name || titleCase(order.default_shipping_option.service_code) }}
                      </span>
                    </span>
                    <span class="text-text-muted text-xs italic shrink-0">{{ ratesModalOrder?.id === order.id ? '▴' : '▾' }} Select</span>
                  </button>
                  <div v-else class="text-text-muted text-sm italic">Not selected</div>
                </div>
                <div v-else-if="mainTab === 'new_orders'" class="text-text-muted text-sm italic">
                  Match items to enable
                </div>
              </div>
              <!-- /shipping -->
              </template>

              <!-- ── Uploaded shipping label — flippable label/address panel ── -->
              <div v-else class="border-t border-card-border pt-3">
                <span class="hidden">{{ ensureLabelPreview(order) }}</span>
                <div class="flex items-center justify-between mb-1.5">
                  <span class="text-[11px] font-semibold text-text-muted uppercase tracking-wide">
                    {{ (labelPanelIndex[order.id] || 0) === 0 ? 'Shipping Label' : 'Ship to' }}
                  </span>
                  <div class="flex items-center gap-1.5">
                    <button @click="removeLabel(order)" title="Remove label"
                      class="text-text-muted hover:text-red-600 p-0.5 leading-none">
                      <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 7h16M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3m3 0-1 13a2 2 0 01-2 2H8a2 2 0 01-2-2L5 7h14z"
                          stroke-linecap="round" stroke-linejoin="round" />
                      </svg>
                    </button>
                    <button @click="flipLabelPanel(order)" title="Previous"
                      class="text-text-muted hover:text-text-primary px-1 text-xl leading-none font-bold">‹</button>
                    <button @click="flipLabelPanel(order)" title="Next"
                      class="text-text-muted hover:text-text-primary px-1 text-xl leading-none font-bold">›</button>
                  </div>
                </div>

                <div v-if="(labelPanelIndex[order.id] || 0) === 0"
                  class="rounded-lg border border-card-border bg-sidebar-bg p-2 flex items-center justify-center min-h-[110px]">
                  <img v-if="labelPreviewUrls[order.id]" :src="labelPreviewUrls[order.id]"
                    @click="zoomedImage = labelPreviewUrls[order.id]"
                    class="max-w-full max-h-56 object-contain cursor-zoom-in" />
                  <div v-else class="text-text-muted text-xs italic">Loading label…</div>
                </div>

                <div v-else class="space-y-0 text-sm leading-tight">
                  <div class="font-bold text-text-primary text-[14px] leading-tight">{{ order.ship_to_name }}</div>
                  <div v-if="order.ship_to_company" class="text-text-secondary leading-tight">{{ order.ship_to_company }}</div>
                  <div class="text-text-secondary leading-tight">{{ order.ship_to_address1 }}</div>
                  <div v-if="order.ship_to_address2" class="text-text-secondary leading-tight">{{ order.ship_to_address2 }}</div>
                  <div class="text-text-secondary leading-tight">
                    {{ order.ship_to_city }}<span v-if="order.ship_to_state">, {{ order.ship_to_state }}</span>
                    <span v-if="order.ship_to_postal_code"> {{ order.ship_to_postal_code }}</span>
                  </div>
                  <div v-if="order.ship_to_country && order.ship_to_country !== 'US'"
                    class="text-text-muted leading-tight">{{ order.ship_to_country }}</div>
                </div>
              </div>

              <!-- Tracking (completed / in_production) -->
              <div v-if="(mainTab === 'completed' || mainTab === 'in_production') && order.tracking_number"
                class="border-t border-card-border pt-3">
                <div class="text-[11px] font-semibold text-text-muted uppercase tracking-wide mb-1">Tracking</div>
                <div class="font-mono text-xs text-text-primary break-all leading-relaxed">
                  {{ order.tracking_number }}
                </div>
              </div>

            </div><!-- /shipping panel -->

          </div><!-- /body -->

        </div><!-- /order card -->
      </div><!-- /group -->
    </template>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-center gap-2 pt-2">
      <button @click="goPage(page - 1)" :disabled="page === 1"
        class="px-3 py-1.5 rounded border border-card-border text-sm disabled:opacity-40 hover:bg-sidebar-bg transition">
        ‹ Prev
      </button>
      <span class="text-sm text-text-secondary">{{ page }} / {{ totalPages }}</span>
      <button @click="goPage(page + 1)" :disabled="page >= totalPages"
        class="px-3 py-1.5 rounded border border-card-border text-sm disabled:opacity-40 hover:bg-sidebar-bg transition">
        Next ›
      </button>
    </div>

  </div>

  <!-- ── Match modal ──────────────────────────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="matchModal"
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 pl-[28%] pr-4">
      <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">

        <!-- Header -->
        <div class="flex items-start justify-between px-5 py-4 border-b border-card-border shrink-0">
          <div class="min-w-0 flex-1 pr-4">
            <h3 class="font-bold">Match Item</h3>
            <div class="text-xs text-text-secondary mt-0.5 leading-snug line-clamp-2">
              {{ matchingItem?.raw_product_name }}
            </div>
            <div class="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <span v-if="matchingItem?.marketplace_sku" class="text-xs font-mono text-text-muted">
                SKU: {{ matchingItem.marketplace_sku }}
              </span>
              <template v-for="[k, v] in formatOptions(matchingItem?.raw_options || {}).filter(([k]) => k.toLowerCase() !== 'personalization')" :key="k">
                <span class="text-xs text-text-secondary">
                  {{ k }}: <strong class="text-text-primary">{{ v }}</strong>
                </span>
              </template>
              <span v-if="matchingItem?.personalization" class="text-xs text-text-secondary">
                Personalization: <strong class="text-text-primary">{{ matchingItem.personalization }}</strong>
              </span>
            </div>
          </div>
          <button @click="matchModal = false"
            class="text-text-muted hover:text-text-primary text-xl leading-none shrink-0">✕</button>
        </div>

        <!-- Search -->
        <div class="px-4 py-3 border-b border-card-border shrink-0 flex gap-2">
          <input v-model="matchSearch" @keyup.enter="loadMatchProducts"
            placeholder="Search catalog by product name or SKU…"
            class="flex-1 rounded-lg border border-card-border px-3 py-2 text-sm" />
          <button @click="loadMatchProducts" class="btn-secondary text-sm px-4">Search</button>
        </div>

        <!-- Body: products | variants -->
        <div class="relative flex flex-1 overflow-hidden">

          <!-- Products -->
          <div class="w-1/2 border-r border-card-border overflow-y-auto">
            <div v-if="matchProductLoad" class="p-4 text-center text-sm text-text-secondary">Loading…</div>
            <div v-else-if="!matchProducts.length" class="p-4 text-center text-sm text-text-muted">No products found</div>
            <button v-else v-for="p in matchProducts" :key="p.id"
              @click="selectProduct(p)"
              class="w-full flex items-stretch gap-3 text-left pr-4 border-b border-card-border text-sm transition hover:bg-sidebar-bg"
              :class="matchSelectedProd?.id === p.id ? 'bg-accent-light' : ''">
              <div class="w-16 self-stretch shrink-0">
                <img v-if="p.primary_image" :src="p.primary_image" :alt="p.name" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full bg-gray-100" />
              </div>
              <div class="min-w-0 py-3">
                <div class="font-semibold leading-tight">{{ p.name }}</div>
                <div class="text-xs text-text-secondary font-mono mt-0.5">{{ p.sku }}</div>
                <div class="text-xs text-text-muted mt-0.5">{{ p.size_count }} sizes · {{ p.color_count }} colors</div>
              </div>
            </button>
          </div>

          <!-- Variants -->
          <div class="flex-1 overflow-y-auto">
            <div v-if="!matchSelectedProd" class="p-6 text-center text-sm text-text-muted">← Select a product</div>
            <div v-else-if="matchVariantLoad" class="p-6 text-center text-sm text-text-secondary">Loading variants…</div>
            <div v-else-if="!sortedVariants.length" class="p-6 text-center text-sm text-text-muted">No variants</div>
            <template v-else>
              <div class="px-4 py-2 text-xs font-semibold text-text-secondary border-b border-card-border bg-sidebar-bg/50 sticky top-0">
                {{ matchSelectedProd.name }}
              </div>
              <button v-for="v in sortedVariants" :key="v.id"
                @click="matchSelectedVar = v"
                class="w-full text-left flex items-center gap-3 px-4 py-3 border-b border-card-border transition hover:bg-sidebar-bg"
                :class="matchSelectedVar?.id === v.id ? 'bg-accent-light' : ''">
                <span v-if="v.size"
                  class="shrink-0 min-w-[36px] text-center text-xs font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                  {{ v.size }}
                </span>
                <span v-else class="shrink-0 min-w-[36px] text-center text-xs text-text-muted">—</span>
                <span class="flex-1 text-sm">{{ v.color || '—' }}</span>
                <span v-if="v.is_dark" title="Dark garment"
                  class="w-3.5 h-3.5 rounded-full bg-gray-800 border border-gray-400 shrink-0"></span>
                <span class="text-xs text-text-secondary font-medium shrink-0">
                  ${{ Number(v.cost).toFixed(2) }}
                </span>
                <span v-if="matchSelectedVar?.id === v.id" class="text-accent shrink-0">✓</span>
              </button>
            </template>
          </div>

          <!-- One-time-change warning (re-match only) -->
          <div v-if="showRematchWarning" class="absolute inset-0 z-20 bg-white/70 backdrop-blur-[1px] flex items-center justify-center p-6">
            <div class="bg-amber-50 border border-amber-200 rounded-xl shadow-xl p-4 max-w-sm text-sm text-amber-900">
              <p>
                Is this a <strong>one-time fix</strong> for this customer's request (e.g. wrong size/color ordered)?
                Leave the <strong>"Remember for future orders"</strong> checkbox
                <span class="whitespace-nowrap">(↙ bottom-left)</span> <strong>unchecked</strong> when saving —
                checking it will also change matching for future orders.
              </p>
              <label class="flex items-center gap-2 mt-3 text-xs text-amber-800 cursor-pointer">
                <input type="checkbox" v-model="dontShowRematchWarningAgain" class="accent-accent" />
                Don't show this again
              </label>
              <div class="mt-3 flex justify-end">
                <button @click="dismissRematchWarning" class="btn-primary text-xs px-3 py-1.5">Got it</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-4 border-t border-card-border shrink-0 flex items-center justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <label class="flex items-center gap-2 text-sm cursor-pointer shrink-0 transition"
              :class="showRematchWarning ? 'ring-2 ring-amber-400 ring-offset-2 rounded-lg px-1 -mx-1' : ''">
              <input type="checkbox" v-model="matchRemember" class="accent-accent" />
              <span>Remember for future orders</span>
            </label>
          </div>
          <div class="flex gap-2">
            <button @click="matchModal = false" class="btn-secondary text-sm">Cancel</button>
            <button @click="saveMatch"
              :disabled="!matchSelectedVar || matchSaving"
              class="btn-primary text-sm disabled:opacity-50">
              {{ matchSaving ? 'Saving…' : 'Confirm Match' }}
            </button>
          </div>
        </div>

      </div>
    </div>
  </Teleport>

  <!-- ── Add Item modal (covers both "clone this item" and "+ Add Item") ──────── -->
  <Teleport to="body">
    <div v-if="addItemModal"
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-50 pl-[28%] pr-4">
      <div class="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden">

        <!-- Header -->
        <div class="flex items-start justify-between px-5 py-4 border-b border-card-border shrink-0">
          <div class="min-w-0 flex-1 pr-4">
            <h3 class="font-bold">Add Item</h3>
            <div class="text-xs text-text-secondary mt-0.5">
              Pick a product from the catalog — its image is used for the new item.
            </div>
          </div>
          <button @click="addItemModal = false"
            class="text-text-muted hover:text-text-primary text-xl leading-none shrink-0">✕</button>
        </div>

        <!-- Search -->
        <div class="px-4 py-3 border-b border-card-border shrink-0 flex gap-2">
          <input v-model="addItemSearch" @keyup.enter="loadAddItemProducts"
            placeholder="Search catalog by product name or SKU…"
            class="flex-1 rounded-lg border border-card-border px-3 py-2 text-sm" />
          <button @click="loadAddItemProducts" class="btn-secondary text-sm px-4">Search</button>
        </div>

        <!-- Body: products | variants -->
        <div class="relative flex flex-1 overflow-hidden">

          <!-- Products -->
          <div class="w-1/2 border-r border-card-border overflow-y-auto">
            <div v-if="addItemProductLoad" class="p-4 text-center text-sm text-text-secondary">Loading…</div>
            <div v-else-if="!addItemProducts.length" class="p-4 text-center text-sm text-text-muted">No products found</div>
            <button v-else v-for="p in addItemProducts" :key="p.id"
              @click="selectAddItemProduct(p)"
              class="w-full flex items-stretch gap-3 text-left pr-4 border-b border-card-border text-sm transition hover:bg-sidebar-bg"
              :class="addItemSelectedProd?.id === p.id ? 'bg-accent-light' : ''">
              <div class="w-16 self-stretch shrink-0">
                <img v-if="p.primary_image" :src="p.primary_image" :alt="p.name" class="w-full h-full object-cover" />
                <div v-else class="w-full h-full bg-gray-100" />
              </div>
              <div class="min-w-0 py-3">
                <div class="font-semibold leading-tight">{{ p.name }}</div>
                <div class="text-xs text-text-secondary font-mono mt-0.5">{{ p.sku }}</div>
                <div class="text-xs text-text-muted mt-0.5">{{ p.size_count }} sizes · {{ p.color_count }} colors</div>
              </div>
            </button>
          </div>

          <!-- Variants -->
          <div class="flex-1 overflow-y-auto">
            <div v-if="!addItemSelectedProd" class="p-6 text-center text-sm text-text-muted">← Select a product</div>
            <div v-else-if="addItemVariantLoad" class="p-6 text-center text-sm text-text-secondary">Loading variants…</div>
            <div v-else-if="!addItemSortedVariants.length" class="p-6 text-center text-sm text-text-muted">No variants</div>
            <template v-else>
              <div class="px-4 py-2 text-xs font-semibold text-text-secondary border-b border-card-border bg-sidebar-bg/50 sticky top-0">
                {{ addItemSelectedProd.name }}
              </div>
              <button v-for="v in addItemSortedVariants" :key="v.id"
                @click="addItemSelectedVar = v"
                class="w-full text-left flex items-center gap-3 px-4 py-3 border-b border-card-border transition hover:bg-sidebar-bg"
                :class="addItemSelectedVar?.id === v.id ? 'bg-accent-light' : ''">
                <span v-if="v.size"
                  class="shrink-0 min-w-[36px] text-center text-xs font-bold px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                  {{ v.size }}
                </span>
                <span v-else class="shrink-0 min-w-[36px] text-center text-xs text-text-muted">—</span>
                <span class="flex-1 text-sm">{{ v.color || '—' }}</span>
                <span v-if="v.is_dark" title="Dark garment"
                  class="w-3.5 h-3.5 rounded-full bg-gray-800 border border-gray-400 shrink-0"></span>
                <span class="text-xs text-text-secondary font-medium shrink-0">
                  ${{ Number(v.cost).toFixed(2) }}
                </span>
                <span v-if="addItemSelectedVar?.id === v.id" class="text-accent shrink-0">✓</span>
              </button>
            </template>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-4 border-t border-card-border shrink-0 space-y-3">
          <div class="flex gap-3">
            <div class="flex-1">
              <label class="text-xs text-text-secondary block mb-1">Item name (shown on the slip, editable)</label>
              <input v-model="addItemName" class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
            </div>
            <div class="w-32">
              <label class="text-xs text-text-secondary block mb-1">SKU</label>
              <input v-model="addItemSku" class="w-full rounded-lg border border-card-border px-3 py-2 text-sm font-mono" />
            </div>
            <div class="w-20">
              <label class="text-xs text-text-secondary block mb-1">Qty</label>
              <input type="number" min="1" v-model.number="addItemQty"
                class="w-full rounded-lg border border-card-border px-3 py-2 text-sm" />
            </div>
          </div>
          <div class="flex justify-end gap-2">
            <button @click="addItemModal = false" class="btn-secondary text-sm">Cancel</button>
            <button @click="saveAddItem"
              :disabled="!addItemSelectedVar || addItemSaving"
              class="btn-primary text-sm disabled:opacity-50">
              {{ addItemSaving ? 'Adding…' : 'Add Item' }}
            </button>
          </div>
        </div>

      </div>
    </div>
  </Teleport>

  <!-- ── Address Edit Modal ──────────────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="editingAddressId" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="cancelAddressEdit">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm">

        <!-- Header -->
        <div class="flex items-center justify-between px-5 py-4 border-b border-card-border">
          <div>
            <h3 class="font-bold text-base leading-tight">Edit Address</h3>
            <p v-if="addressEditMeta.name" class="text-xs text-text-secondary mt-0.5">
              {{ addressEditMeta.name }}
              <span v-if="addressEditMeta.orderNo" class="text-text-muted">({{ addressEditMeta.orderNo }})</span>
            </p>
          </div>
          <button @click="cancelAddressEdit" class="text-text-muted hover:text-text-primary text-xl leading-none">✕</button>
        </div>

        <!-- Fields -->
        <div class="px-5 py-4 space-y-2">
          <div>
            <label class="text-[11px] text-text-muted font-semibold uppercase tracking-wide">Name</label>
            <input v-model="addressDraft.ship_to_name" class="addr-input mt-0.5" placeholder="Full name" />
          </div>
          <div>
            <label class="text-[11px] text-text-muted font-semibold uppercase tracking-wide">Company</label>
            <input v-model="addressDraft.ship_to_company" class="addr-input mt-0.5" placeholder="Optional" />
          </div>
          <div>
            <label class="text-[11px] text-text-muted font-semibold uppercase tracking-wide">Address 1</label>
            <input v-model="addressDraft.ship_to_address1" class="addr-input mt-0.5" />
          </div>
          <div>
            <label class="text-[11px] text-text-muted font-semibold uppercase tracking-wide">Address 2</label>
            <input v-model="addressDraft.ship_to_address2" class="addr-input mt-0.5" placeholder="Apt, suite, etc." />
          </div>
          <div>
            <label class="text-[11px] text-text-muted font-semibold uppercase tracking-wide">City</label>
            <input v-model="addressDraft.ship_to_city" class="addr-input mt-0.5" />
          </div>
          <div class="flex gap-2">
            <div class="w-24">
              <label class="text-[11px] text-text-muted font-semibold uppercase tracking-wide">State</label>
              <input v-model="addressDraft.ship_to_state" class="addr-input mt-0.5" placeholder="KY" />
            </div>
            <div class="flex-1">
              <label class="text-[11px] text-text-muted font-semibold uppercase tracking-wide">ZIP</label>
              <input v-model="addressDraft.ship_to_postal_code" class="addr-input mt-0.5" />
            </div>
            <div class="w-16">
              <label class="text-[11px] text-text-muted font-semibold uppercase tracking-wide">Country</label>
              <input v-model="addressDraft.ship_to_country" class="addr-input mt-0.5" placeholder="US" />
            </div>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-4 border-t border-card-border flex gap-2 justify-end">
          <button @click="cancelAddressEdit" class="btn-secondary text-sm">Cancel</button>
          <button @click="saveAddress()" :disabled="addressSaving"
            class="btn-primary text-sm disabled:opacity-50">
            {{ addressSaving ? 'Saving…' : 'Save' }}
          </button>
        </div>

      </div>
    </div>
  </Teleport>

  <!-- ── Send to Print confirmation ───────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="sendConfirmOrders.length" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      @click.self="closeSendConfirm">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col">

        <!-- Header -->
        <div class="px-5 py-4 border-b border-card-border shrink-0">
          <h3 class="font-bold text-base leading-tight">
            Send {{ sendConfirmOrders.length > 1 ? `${sendConfirmOrders.length} Orders` : 'Order' }} to Print
          </h3>
          <p class="text-xs text-text-secondary mt-1">
            Your balance will be charged immediately. Review before confirming.
          </p>
        </div>

        <!-- Order / item breakdown -->
        <div class="px-5 py-4 space-y-4 overflow-y-auto">
          <div v-for="order in sendConfirmOrders" :key="order.id" class="space-y-1.5">
            <div class="flex items-center justify-between text-sm">
              <span class="font-mono font-semibold text-text-primary">{{ order.external_order_number }}</span>
              <span class="font-bold text-blue-600 tabular-nums">${{ orderCostTotal(order).toFixed(2) }}</span>
            </div>
            <div class="space-y-1 pl-3 border-l-2 border-card-border">
              <div v-for="item in order.items.filter(i => Number(i.unit_price) >= 0)" :key="item.id"
                class="flex items-center justify-between text-xs text-text-secondary gap-2">
                <span class="truncate">{{ item.pc_product_name || item.raw_product_name }}</span>
                <span class="shrink-0">× {{ item.quantity }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Cost breakdown -->
        <div class="px-5 py-3 border-t border-card-border bg-sidebar-bg space-y-1 shrink-0">
          <div class="flex items-center justify-between text-xs text-text-secondary">
            <span>Item cost</span>
            <span class="tabular-nums">${{ sendConfirmOrders.reduce((s, o) => s + Number(o.item_cost || 0), 0).toFixed(2) }}</span>
          </div>
          <div class="flex items-center justify-between text-xs text-text-secondary">
            <span>Shipping</span>
            <span class="tabular-nums">${{ sendConfirmOrders.reduce((s, o) => s + Number(o.shipping_cost || 0), 0).toFixed(2) }}</span>
          </div>
          <div v-if="sendConfirmOrders.some(o => Number(o.extra_print_area_fee) > 0)"
            class="flex items-center justify-between text-xs text-text-secondary">
            <span>Extra print area</span>
            <span class="tabular-nums">${{ sendConfirmOrders.reduce((s, o) => s + Number(o.extra_print_area_fee || 0), 0).toFixed(2) }}</span>
          </div>
          <div class="flex items-center justify-between font-bold text-sm pt-1.5 border-t border-card-border">
            <span>Total</span>
            <span class="text-blue-600 tabular-nums">${{ sendConfirmTotal.toFixed(2) }}</span>
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-4 border-t border-card-border flex gap-2 justify-end shrink-0">
          <button @click="closeSendConfirm" :disabled="sendConfirmLoading" class="btn-secondary text-sm">Cancel</button>
          <button @click="confirmSendToPrint" :disabled="sendConfirmLoading"
            class="btn-primary text-sm disabled:opacity-50">
            {{ sendConfirmLoading ? 'Sending…' : 'Confirm & Send to Print' }}
          </button>
        </div>

      </div>
    </div>
  </Teleport>

  <!-- ── Manage Tags modal (sub-user only) ───────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="manageTagsModal" class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="font-semibold text-lg">Manage Tags</h3>
          <button @click="manageTagsModal = false" class="text-text-muted hover:text-text-primary text-xl leading-none">✕</button>
        </div>

        <div v-if="tagError" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{{ tagError }}</div>

        <div class="space-y-1.5 max-h-56 overflow-y-auto">
          <div v-for="t in availableTags" :key="t.id"
            class="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-card-border">
            <span class="w-3 h-3 rounded-full shrink-0" :style="{ backgroundColor: t.color }"></span>
            <span class="flex-1 min-w-0 text-sm truncate">{{ t.name }}</span>
            <button @click="removeTag(t)" class="text-xs text-red-600 hover:underline shrink-0">Delete</button>
          </div>
          <div v-if="!availableTags.length" class="text-sm text-text-muted text-center py-3">No tags yet.</div>
        </div>

        <div class="border-t border-card-border pt-4 space-y-2">
          <label class="text-xs text-text-secondary block mb-1">New tag</label>
          <div class="flex gap-2">
            <input v-model="newTagColor" type="color" class="w-10 h-10 rounded-lg border border-card-border shrink-0 cursor-pointer p-0.5" />
            <input v-model="newTagName" @keyup.enter="createTag" placeholder="e.g. Waiting on customer"
              class="flex-1 min-w-0 rounded-lg border border-card-border px-3 py-2 text-sm" />
            <button @click="createTag" :disabled="tagSaving || !newTagName.trim()"
              class="btn-primary text-sm px-3 shrink-0 disabled:opacity-50">
              {{ tagSaving ? '…' : 'Add' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ── Original Listing Tooltip ─────────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="originTooltipItem && formatOptions(originTooltipItem.raw_options).length"
      class="fixed pointer-events-none whitespace-nowrap text-xs bg-gray-900 text-white px-2.5 py-1.5 rounded shadow-lg z-50 space-y-0.5"
      :style="originTooltipStyle">
      <div class="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-0.5">Original listing</div>
      <div v-for="[k, v] in formatOptions(originTooltipItem.raw_options).filter(([k]) => k.toLowerCase() !== 'personalization')" :key="k">
        {{ k }}: <strong>{{ v }}</strong>
      </div>
    </div>
  </Teleport>

  <!-- ── Order Actions Menu (⋮) ───────────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="actionsMenuOrder">
      <!-- backdrop (click to close) -->
      <div class="fixed inset-0 z-40" @click="actionsMenuOrder = null"></div>

      <div class="fixed z-50 bg-white rounded-xl shadow-2xl border border-card-border overflow-hidden py-1"
        :style="actionsMenuStyle">
        <button v-if="NEW_ORDER_STATUSES.includes(actionsMenuOrder.status) && !actionsMenuOrder.buyer_note && !actionsMenuOrder.internal_note"
          @click="addNote(actionsMenuOrder); actionsMenuOrder = null"
          class="w-full flex items-center gap-2 px-3 py-2 text-base text-left hover:bg-sidebar-bg transition">
          Add Note
        </button>
        <button v-if="NEW_ORDER_STATUSES.includes(actionsMenuOrder.status) && !actionsMenuOrder.is_gift"
          @click="toggleGift(actionsMenuOrder); actionsMenuOrder = null"
          class="w-full flex items-center gap-2 px-3 py-2 text-base text-left hover:bg-sidebar-bg transition">
          Mark as Gift
        </button>
        <button v-else-if="NEW_ORDER_STATUSES.includes(actionsMenuOrder.status)"
          @click="toggleGift(actionsMenuOrder); actionsMenuOrder = null"
          class="w-full flex items-center gap-2 px-3 py-2 text-base text-left text-text-secondary hover:bg-sidebar-bg transition">
          Remove Gift Mark
        </button>
        <button v-if="!actionsMenuOrder.tag" @click.stop="toggleTagSubmenu($event)"
          class="w-full flex items-center justify-between px-3 py-2 text-base text-left transition"
          :class="tagSubmenuOpen ? 'bg-sidebar-bg' : 'hover:bg-sidebar-bg'">
          <span>Add Tag</span>
          <span class="text-text-muted text-sm">▸</span>
        </button>
        <button v-if="actionsMenuOrder.status === 'ready'"
          @click="openSendConfirm(actionsMenuOrder); actionsMenuOrder = null"
          class="w-full flex items-center gap-2 px-3 py-2 text-base text-left hover:bg-sidebar-bg transition disabled:opacity-50">
          Send to Print
        </button>
        <button v-if="actionsMenuOrder.status === 'sent_to_print'"
          @click="recallOrder(actionsMenuOrder); actionsMenuOrder = null"
          :disabled="recallLoadingId === actionsMenuOrder.id"
          class="w-full flex items-center gap-2 px-3 py-2 text-base text-left hover:bg-sidebar-bg transition disabled:opacity-50">
          Move back to New Orders
        </button>
        <button v-if="RESHIPPABLE_STATUSES.includes(actionsMenuOrder.status) &&
            (!actionsMenuOrder.reship_info || actionsMenuOrder.reship_info.can_reship_again)"
          @click="openReshipModal(actionsMenuOrder); actionsMenuOrder = null"
          class="w-full flex items-center gap-2 px-3 py-2 text-base text-left hover:bg-sidebar-bg transition">
          Reship / Refund Request
        </button>
        <button v-if="actionsMenuOrder.label_source !== 'uploaded' && !actionsMenuOrder.tracking_number"
          @click="triggerLabelUpload(actionsMenuOrder); actionsMenuOrder = null"
          class="w-full flex items-center gap-2 px-3 py-2 text-base text-left hover:bg-sidebar-bg transition">
          Upload Shipping Label
        </button>
        <button v-if="NEW_ORDER_STATUSES.includes(actionsMenuOrder.status)"
          @click="hideOrder(actionsMenuOrder); actionsMenuOrder = null"
          :disabled="hideLoadingId === actionsMenuOrder.id"
          class="w-full flex items-center gap-2 px-3 py-2 text-base text-left text-red-600 hover:bg-red-50 transition disabled:opacity-50">
          Remove
        </button>
      </div>
    </div>
  </Teleport>

  <input ref="labelFileInputEl" type="file"
    accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
    class="hidden" @change="onLabelFileChosen" />

  <!-- ── Add Tag flyout — own fixed-position Teleport, not nested inside the
       actions menu panel above: that panel has overflow-hidden (to keep hover
       backgrounds inside its rounded corners), which clips anything positioned
       outside its own box, same issue the rates modal comment below describes. -->
  <Teleport to="body">
    <div v-if="tagSubmenuOpen">
      <div class="fixed inset-0 z-40" @click="tagSubmenuOpen = false"></div>
      <div class="fixed z-50 bg-white rounded-xl shadow-2xl border border-card-border overflow-hidden py-1"
        :style="tagSubmenuStyle">
        <button v-for="t in availableTags" :key="t.id"
          @click="setOrderTag(actionsMenuOrder, t.id); tagSubmenuOpen = false; actionsMenuOrder = null"
          class="w-full flex items-center gap-2 text-left px-3 py-2 text-base hover:bg-sidebar-bg transition">
          <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: t.color }"></span>
          {{ t.name }}
        </button>
        <div v-if="!availableTags.length" class="px-3 py-2 text-sm text-text-muted">
          No tags yet{{ auth.isTeamMember ? '' : ' — create one' }}
        </div>
        <button v-if="!auth.isTeamMember"
          @click="tagSubmenuOpen = false; actionsMenuOrder = null; openManageTags()"
          class="w-full text-left px-3 py-2 text-base text-accent font-medium border-t border-card-border hover:bg-sidebar-bg transition">
          + Manage Tags
        </button>
      </div>
    </div>
  </Teleport>

  <!-- ── Change Tag flyout (click the applied-tag pill in a card's header) ──── -->
  <Teleport to="body">
    <div v-if="tagMenuOrder">
      <div class="fixed inset-0 z-40" @click="tagMenuOrder = null"></div>
      <div class="fixed z-50 bg-white rounded-xl shadow-2xl border border-card-border overflow-hidden py-1"
        :style="tagMenuStyle">
        <button @click="setOrderTag(tagMenuOrder, null)"
          class="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-sidebar-bg">
          No tag
        </button>
        <button v-for="t in availableTags" :key="t.id" @click="setOrderTag(tagMenuOrder, t.id)"
          class="w-full flex items-center gap-2 text-left px-3 py-2 text-sm text-text-primary hover:bg-sidebar-bg">
          <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: t.color }"></span>
          {{ t.name }}
        </button>
        <button v-if="!auth.isTeamMember" @click="tagMenuOrder = null; openManageTags()"
          class="w-full text-left px-3 py-2 text-sm text-accent font-medium border-t border-card-border hover:bg-sidebar-bg">
          + Manage Tags
        </button>
      </div>
    </div>
  </Teleport>

  <!-- ── Shipping rates panel ─────────────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="ratesModalOrder">
      <div class="fixed inset-0 z-40" @click="ratesModalOrder = null"></div>

      <div class="fixed z-50 bg-white border border-card-border rounded-xl shadow-2xl overflow-hidden"
        :style="ratesModalStyle">
        <div class="px-3 py-2.5 space-y-1.5 max-h-72 overflow-y-auto">
          <div v-if="orderRateState(ratesModalOrder.id).loading"
            class="text-center text-text-muted text-sm py-4">Fetching rates…</div>
          <div v-else-if="orderRateState(ratesModalOrder.id).error"
            class="text-red-500 text-sm text-center py-3">
            {{ orderRateState(ratesModalOrder.id).error }}
            <button @click="fetchRates(ratesModalOrder)" class="block mx-auto mt-1 text-xs text-accent hover:underline">Try again</button>
          </div>
          <template v-else-if="orderRateState(ratesModalOrder.id).rates.length">
            <button
              v-for="rate in orderRateState(ratesModalOrder.id).rates"
              :key="rate.service_code"
              @click="selectShipping(ratesModalOrder, rate); ratesModalOrder = null"
              :disabled="selectingShippingId === ratesModalOrder.id"
              class="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border-2 transition text-left"
              :class="(ratesModalOrder.selected_service_code === rate.service_code || (!ratesModalOrder.selected_service_code && rate.is_default))
                ? 'border-emerald-400 bg-emerald-50'
                : 'border-card-border hover:border-gray-300 hover:bg-sidebar-bg'">
              <div class="flex items-center gap-2 min-w-0">
                <img v-if="carrierMeta(rate.carrier_code)" :src="carrierMeta(rate.carrier_code).logo"
                  @error="e => e.target.style.display='none'" class="w-6 h-6 object-contain shrink-0" />
                <div class="min-w-0">
                  <div class="font-semibold text-text-primary text-xs leading-snug">
                    {{ rate.service_name }}
                    <span v-if="rate.is_default" class="text-[10px] text-emerald-600 font-semibold ml-1">Default</span>
                  </div>
                  <div class="text-[10px] text-text-muted">{{ carrierMeta(rate.carrier_code)?.name || rate.carrier_code?.toUpperCase() }}</div>
                </div>
              </div>
              <div class="shrink-0 text-right">
                <div class="font-bold text-sm"
                  :class="(ratesModalOrder.selected_service_code === rate.service_code || (!ratesModalOrder.selected_service_code && rate.is_default)) ? 'text-emerald-600' : 'text-text-primary'">
                  ${{ rate.displayed_rate.toFixed(2) }}
                </div>
                <div v-if="ratesModalOrder.selected_service_code === rate.service_code"
                  class="text-[10px] text-emerald-600 font-semibold">Selected</div>
              </div>
            </button>
          </template>
          <button @click="fetchRates(ratesModalOrder)"
            :disabled="orderRateState(ratesModalOrder.id).loading"
            class="w-full text-[11px] text-text-muted hover:text-text-primary text-center py-1 disabled:opacity-50">
            ↻ Refresh rates
          </button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ── Design draft pickers — print area / color, two independent popovers ─ -->
  <Teleport to="body">
    <div v-if="activeDraftForPicker">
      <div class="fixed inset-0 z-40" @click="draftPickerOpenId = null"></div>

      <!-- Print area popover -->
      <div v-if="draftPickerKind === 'area'"
        class="fixed z-50 bg-white rounded-xl shadow-2xl border border-card-border overflow-hidden p-2"
        :style="[draftPickerStyle, { minWidth: '220px', maxWidth: '380px' }]">
        <template v-if="activeItemForPicker?.available_print_areas?.length">
          <!-- Visual grid when any area has an icon -->
          <div v-if="activeItemForPicker.available_print_areas.some(a => a.icon)"
            class="grid gap-1.5"
            :style="`grid-template-columns: repeat(${Math.min(3, activeItemForPicker.available_print_areas.length)}, minmax(0, 1fr))`">
            <button v-for="area in activeItemForPicker.available_print_areas" :key="area.name" type="button"
              @click="!isPrintAreaFull(activeItemForPicker, area.name) && selectPrintArea(activeDraftForPicker, activeItemForPicker, area.name)"
              :disabled="isPrintAreaFull(activeItemForPicker, area.name)"
              class="flex flex-col items-center gap-1 p-1.5 rounded-lg border-2 transition w-20"
              :class="[
                activeDraftForPicker.print_area_name === area.name ? 'border-accent bg-accent/5' : 'border-transparent hover:border-gray-200 hover:bg-gray-50',
                isPrintAreaFull(activeItemForPicker, area.name) ? 'opacity-40 cursor-not-allowed' : '',
              ]">
              <div class="w-[60px] h-[60px] flex items-center justify-center shrink-0">
                <img v-if="area.icon" :src="area.icon" :alt="area.name"
                  class="max-w-full max-h-full object-contain" />
                <div v-else
                  class="w-full h-full rounded-lg bg-gray-100 flex items-center justify-center text-text-muted text-xs font-semibold text-center leading-tight px-1">
                  {{ area.name }}
                </div>
              </div>
              <span class="text-xs font-semibold text-text-primary text-center leading-tight">{{ area.name }}</span>
              <span v-if="isPrintAreaFull(activeItemForPicker, area.name)" class="text-[10px] text-text-muted leading-none">taken</span>
            </button>
          </div>
          <!-- Text list fallback (no icons uploaded yet) -->
          <template v-else>
            <button v-for="area in activeItemForPicker.available_print_areas" :key="area.name" type="button"
              @click="!isPrintAreaFull(activeItemForPicker, area.name) && selectPrintArea(activeDraftForPicker, activeItemForPicker, area.name)"
              :disabled="isPrintAreaFull(activeItemForPicker, area.name)"
              class="w-full text-left px-2 py-1.5 text-sm font-semibold leading-tight transition rounded-lg"
              :class="[
                activeDraftForPicker.print_area_name === area.name ? 'bg-accent text-white' : 'text-text-primary hover:bg-sidebar-bg',
                isPrintAreaFull(activeItemForPicker, area.name) ? 'opacity-40 cursor-not-allowed' : '',
              ]">
              {{ area.name }}
              <span v-if="isPrintAreaFull(activeItemForPicker, area.name)" class="ml-1 text-xs text-text-muted font-normal">(taken)</span>
            </button>
          </template>
        </template>
        <input v-else v-model="activeDraftForPicker.print_area_name"
          placeholder="Print area (e.g. Front)"
          class="w-full text-sm font-semibold px-2 py-1.5 focus:outline-none focus:border-accent" />
      </div>

      <!-- Color / color-group popover -->
      <div v-else-if="draftPickerKind === 'color'"
        class="fixed z-50 w-56 bg-white rounded-lg shadow-2xl border border-card-border overflow-hidden"
        :style="draftPickerStyle">
        <!-- Group rows: All / Dark / Light -->
        <label v-for="grp in COLOR_GROUPS" :key="grp.value"
          class="flex items-center gap-1.5 px-2 py-1.5 text-sm font-semibold leading-tight transition"
          :class="isScopeBlocked(activeItemForPicker, activeDraftForPicker, grp.value) ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-sidebar-bg'">
          <input type="checkbox" class="accent-accent shrink-0"
            :checked="activeDraftForPicker.color_scope === grp.value"
            :disabled="isScopeBlocked(activeItemForPicker, activeDraftForPicker, grp.value)"
            @click="!isScopeBlocked(activeItemForPicker, activeDraftForPicker, grp.value) && selectColorGroup(activeDraftForPicker, grp.value)" />
          <span class="truncate">{{ grp.label }}</span>
        </label>

        <!-- Individual colors — expand/collapse with chevron -->
        <template v-if="activeItemForPicker?.pc_product_colors?.length">
          <button type="button" @mousedown.stop @click.stop="colorPickerExpanded = !colorPickerExpanded"
            class="w-full flex items-center justify-center py-1.5 border-t border-card-border text-text-muted hover:bg-sidebar-bg transition text-sm leading-none">
            {{ colorPickerExpanded ? '▴' : '▾' }}
          </button>
          <template v-if="colorPickerExpanded">
            <label v-for="c in sortedProductColors(activeItemForPicker)" :key="c.name"
              class="flex items-center gap-1.5 px-2 py-1.5 text-sm leading-tight transition"
              :class="isColorBlockedByOthers(activeItemForPicker, activeDraftForPicker, c.name, c.is_dark) ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer hover:bg-sidebar-bg'">
              <input type="checkbox" class="accent-accent shrink-0"
                :checked="isColorChecked(activeItemForPicker, activeDraftForPicker, c.name)"
                :disabled="isColorBlockedByOthers(activeItemForPicker, activeDraftForPicker, c.name, c.is_dark)"
                @click="!isColorBlockedByOthers(activeItemForPicker, activeDraftForPicker, c.name, c.is_dark) && toggleColorCheckbox(activeItemForPicker, activeDraftForPicker, c.name)" />
              <span class="truncate">{{ c.name }}</span>
            </label>
          </template>
        </template>

        <input v-else-if="activeDraftForPicker.color_scope === 'specific'"
          :value="activeDraftForPicker.specific_colors[0] || ''"
          @input="e => activeDraftForPicker.specific_colors = e.target.value ? [e.target.value] : []"
          placeholder="Color name"
          class="w-full text-sm border-t border-card-border px-2 py-1.5 focus:outline-none focus:border-accent" />
      </div>
    </div>
  </Teleport>

  <!-- ── Selection Menu (select-all-on-page / all-pages / deselect) ───────── -->
  <Teleport to="body">
    <div v-if="selectMenuOpen">
      <div class="fixed inset-0 z-40" @click="selectMenuOpen = false"></div>

      <div class="fixed z-50 bg-white rounded-xl shadow-2xl border border-card-border overflow-hidden py-1"
        :style="selectMenuStyle">
        <button @click="selectedIds = new Set(orders.map(o => o.id)); selectMenuOpen = false"
          class="w-full flex items-center px-3 py-2 text-sm text-left hover:bg-sidebar-bg transition">
          Select all on this page ({{ orders.length }})
        </button>
        <button @click="selectAllAcrossPages(); selectMenuOpen = false"
          class="w-full flex items-center px-3 py-2 text-sm text-left hover:bg-sidebar-bg transition">
          Select all pages ({{ totalCount }})
        </button>
        <button @click="deselectAll(); selectMenuOpen = false"
          class="w-full flex items-center px-3 py-2 text-sm text-left hover:bg-sidebar-bg transition">
          Deselect all
        </button>
      </div>
    </div>
  </Teleport>

  <!-- ── More Actions Menu (bulk) ──────────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="moreActionsOpen">
      <div class="fixed inset-0 z-40" @click="moreActionsOpen = false"></div>

      <div class="fixed z-50 bg-white rounded-xl shadow-2xl border border-card-border overflow-hidden py-1"
        :style="moreActionsStyle">
        <button @click="bulkRemoveFromPlatform(); moreActionsOpen = false"
          :disabled="!selectedIds.size || bulkSending"
          class="w-full flex items-center gap-2 px-3 py-2 text-sm text-left text-red-600 hover:bg-red-50 transition disabled:opacity-40 disabled:cursor-not-allowed">
          ✕ Remove
        </button>
        <button @click="openBulkSendConfirm(); moreActionsOpen = false"
          :disabled="!allSelectedReady || bulkSending"
          class="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-sidebar-bg transition disabled:opacity-40 disabled:cursor-not-allowed">
          Send to Print
        </button>
      </div>
    </div>
  </Teleport>

  <!-- ── Sort Menu ─────────────────────────────────────────────────────────── -->
  <Teleport to="body">
    <div v-if="sortMenuOpen">
      <div class="fixed inset-0 z-40" @click="sortMenuOpen = false"></div>

      <div class="fixed z-50 bg-white rounded-xl shadow-2xl border border-card-border overflow-hidden py-1"
        :style="sortMenuStyle">
        <button v-for="opt in SORT_OPTIONS" :key="opt.key" @click="setSortBy(opt.key)"
          class="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-sidebar-bg transition"
          :class="sortBy === opt.key ? 'font-semibold text-accent' : ''">
          {{ opt.label }}
          <span v-if="sortBy === opt.key">✓</span>
        </button>
      </div>
    </div>
  </Teleport>


  <!-- Image lightbox -->
  <Teleport to="body">
    <div v-if="zoomedImage"
      @click="zoomedImage = ''"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 cursor-zoom-out">
      <img :src="zoomedImage" class="max-w-[90vw] max-h-[90vh] rounded-xl shadow-2xl object-contain" />
    </div>
  </Teleport>

  <ReshipRequestModal :order="reshipModalOrder" @close="reshipModalOrder = null" @created="loadOrders()" />
</template>
