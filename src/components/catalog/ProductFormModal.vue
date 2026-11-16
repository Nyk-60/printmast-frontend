<script setup>
import { ref, reactive, computed, watch, onMounted } from 'vue'
import { superAdminApi, catalogApi } from '@/api/endpoints'
import { confirmDialog } from '@/composables/useConfirm'

const SIZE_ORDER = ['XS','S','SM','M','ML','L','XL','1XL','2XL','XXL','3XL','XXXL','4XL','5XL','6XL']
function sizeRank(s) {
  const norm = (s||'').toUpperCase().trim()
  const i = SIZE_ORDER.indexOf(norm)
  if (i !== -1) return i
  const m = norm.match(/-?\d+(?:[.,]\d+)?/)
  return m ? 1000 + parseFloat(m[0].replace(',', '.')) : 9999
}
const varSearch = ref('')
const sortedVariants = computed(() => {
  const q = varSearch.value.trim().toLowerCase()
  let list = localVariants.value
  if (q) {
    list = list.filter(v =>
      (v.size || '').toLowerCase().includes(q) ||
      (v.color || '').toLowerCase().includes(q)
    )
  }
  return [...list].sort((a,b) => {
    const sd = sizeRank(a.size) - sizeRank(b.size)
    return sd !== 0 ? sd : (a.color||'').localeCompare(b.color||'')
  })
})

const props = defineProps({
  mode:    { type: String, default: 'create' }, // 'create' | 'edit'
  role:    { type: String, default: 'superadmin' }, // 'superadmin' | 'print_center'
  product: { type: Object, default: null },
})
const emit = defineEmits(['saved', 'close'])

// ── Navigation ─────────────────────────────────────────────────────────────────

const step    = ref(1)         // create: 1=info 2=variant-setup 3=price-table
const editTab = ref('info')    // edit: 'info' | 'variants'

// ── Categories & Brands ────────────────────────────────────────────────────────

const cats        = ref([])
const brands      = ref([])
const catsLoading = ref(false)

const catModal    = ref(false); const catName    = ref(''); const catSaving   = ref(false)
const catEditId   = ref(null);  const catEditName = ref(''); const catSavingEdit = ref(false)
const catDeleting = ref(null);  const catError   = ref('')

const brandModal    = ref(false); const brandName    = ref(''); const brandSaving   = ref(false)
const brandEditId   = ref(null);  const brandEditName = ref(''); const brandSavingEdit = ref(false)
const brandDeleting = ref(null);  const brandError   = ref('')

async function loadCatsBrands() {
  catsLoading.value = true
  try {
    const [cr, br] = await Promise.all([catalogApi.categories(), catalogApi.brands()])
    cats.value   = cr.data.results ?? cr.data
    brands.value = br.data.results ?? br.data
  } finally {
    catsLoading.value = false
  }
}

const catParent = ref('') // optional — leave blank for a top-level category

async function saveCategory() {
  catSaving.value = true; catError.value = ''
  try {
    const { data } = await superAdminApi.createCategory({
      name: catName.value, parent: catParent.value || null,
    })
    cats.value.push(data)
    form.category   = data.id
    catName.value   = ''
    catParent.value = ''
  } catch (e) {
    catError.value = e?.response?.data?.name?.[0] ?? e?.response?.data?.detail ?? 'Failed to create.'
  } finally {
    catSaving.value = false
  }
}

function startEditCat(cat) { catEditId.value = cat.id; catEditName.value = cat.name; catError.value = '' }
function cancelEditCat()    { catEditId.value = null; catEditName.value = '' }

async function saveEditCat(cat) {
  catSavingEdit.value = true; catError.value = ''
  try {
    await superAdminApi.updateCategory(cat.id, { name: catEditName.value })
    const idx = cats.value.findIndex(c => c.id === cat.id)
    if (idx !== -1) cats.value[idx] = { ...cats.value[idx], name: catEditName.value }
    catEditId.value = null
  } catch (e) {
    catError.value = e?.response?.data?.name?.[0] ?? 'Failed to rename.'
  } finally { catSavingEdit.value = false }
}

async function deleteCat(cat) {
  if (!(await confirmDialog({ title: `Delete category "${cat.name}"?`, danger: true }))) return
  catDeleting.value = cat.id; catError.value = ''
  try {
    await superAdminApi.deleteCategory(cat.id)
    cats.value = cats.value.filter(c => c.id !== cat.id)
    if (form.category === cat.id) form.category = ''
  } catch (e) {
    catError.value = e?.response?.data?.detail ?? 'Cannot delete — category may be in use.'
  } finally { catDeleting.value = null }
}

async function saveBrand() {
  brandSaving.value = true; brandError.value = ''
  try {
    const { data } = await superAdminApi.createBrand({ name: brandName.value })
    brands.value.push(data)
    form.brand      = data.id
    brandName.value = ''
  } catch (e) {
    brandError.value = e?.response?.data?.name?.[0] ?? e?.response?.data?.detail ?? 'Failed to create.'
  } finally {
    brandSaving.value = false
  }
}

function startEditBrand(b)  { brandEditId.value = b.id; brandEditName.value = b.name; brandError.value = '' }
function cancelEditBrand()  { brandEditId.value = null; brandEditName.value = '' }

async function saveEditBrand(b) {
  brandSavingEdit.value = true; brandError.value = ''
  try {
    await superAdminApi.updateBrand(b.id, { name: brandEditName.value })
    const idx = brands.value.findIndex(br => br.id === b.id)
    if (idx !== -1) brands.value[idx] = { ...brands.value[idx], name: brandEditName.value }
    brandEditId.value = null
  } catch (e) {
    brandError.value = e?.response?.data?.name?.[0] ?? 'Failed to rename.'
  } finally { brandSavingEdit.value = false }
}

async function deleteBrand(b) {
  if (!(await confirmDialog({ title: `Delete brand "${b.name}"?`, danger: true }))) return
  brandDeleting.value = b.id; brandError.value = ''
  try {
    await superAdminApi.deleteBrand(b.id)
    brands.value = brands.value.filter(br => br.id !== b.id)
    if (form.brand === b.id) form.brand = ''
  } catch (e) {
    brandError.value = e?.response?.data?.detail ?? 'Cannot delete — brand may be in use.'
  } finally { brandDeleting.value = null }
}

// ── Step 1 / Edit Info: Product fields ────────────────────────────────────────

const form = reactive({
  name: '', sku: '', description: '',
  brand: '', category: '', age: '', subcategory: '', base_price: '',
  badge: '', is_active: true,
})

const imageFile    = ref(null)
const imagePreview = ref('')
const imageCleared = ref(false)  // user explicitly clicked ✕
const saving       = ref(false)
const saveErr      = ref('')

function loadProduct(p) {
  if (!p) {
    Object.assign(form, { name:'', sku:'', description:'', brand:'', category:'', age:'', subcategory:'',
      base_price:'', badge:'', is_active:true })
    imageFile.value    = null
    imagePreview.value = ''
    imageCleared.value = false
    dims.value[0].label = 'Size'
    dims.value[1].label = 'Color'
    return
  }
  Object.assign(form, {
    name:        p.name ?? '',
    sku:         p.sku  ?? '',
    description: p.description ?? '',
    brand:       p.brand?.id  ?? p.brand  ?? '',
    category:    p.category?.id ?? p.category ?? '',
    age:         p.age ?? '',
    subcategory: p.subcategory ?? '',
    base_price:  p.base_price ?? '',
    badge:       p.badge ?? '',
    is_active:   p.is_active ?? true,
  })
  imageFile.value    = null
  imagePreview.value = p.primary_image ?? ''
  imageCleared.value = false
  dims.value[0].label = p.variant1_label ?? 'Size'
  dims.value[1].label = p.variant2_label ?? 'Color'
}

function onImageChange(e) {
  const f = e.target.files[0]
  if (!f) return
  imageFile.value    = f
  imagePreview.value = URL.createObjectURL(f)
  imageCleared.value = false
}
function removeImage() {
  imageFile.value    = null
  imagePreview.value = ''
  imageCleared.value = true
}

// ── Step 2: Variant dimensions ─────────────────────────────────────────────────

const numDims = ref(2)
const dims    = ref([
  { label: 'Size',  options: [], input: '' },
  { label: 'Color', options: [], input: '' },
])

function addOption(di) {
  const d   = dims.value[di]
  const set = new Set(d.options)
  d.input.split(',').map(s => s.trim()).filter(Boolean).forEach(v => {
    if (!set.has(v) && d.options.length < 50) { d.options.push(v); set.add(v) }
  })
  d.input = ''
}
function removeOption(di, i) { dims.value[di].options.splice(i, 1) }

const comboCount = computed(() => {
  if (numDims.value === 0) return 1
  const n1 = dims.value[0].options.length || 1
  const n2 = numDims.value >= 2 ? (dims.value[1].options.length || 1) : 1
  return n1 * n2
})

// ── Step 3: Combination table ──────────────────────────────────────────────────

const rows = ref([])

function buildRows() {
  const prev = {}
  rows.value.forEach(r => { prev[`${r.opt1}|${r.opt2}`] = r })

  let combos = []
  if (numDims.value === 0) {
    combos = [{ opt1: '', opt2: '' }]
  } else if (numDims.value === 1) {
    const opts = dims.value[0].options.length ? dims.value[0].options : ['']
    combos = opts.map(o => ({ opt1: o, opt2: '' }))
  } else {
    const o1s = dims.value[0].options.length ? dims.value[0].options : ['']
    const o2s = dims.value[1].options.length ? dims.value[1].options : ['']
    o1s.forEach(o1 => o2s.forEach(o2 => combos.push({ opt1: o1, opt2: o2 })))
  }

  const defaultPrice = form.base_price || ''
  rows.value = combos.map(c => {
    const p = prev[`${c.opt1}|${c.opt2}`]
    return { ...c, price: p?.price ?? defaultPrice, weight: p?.weight ?? '', is_dark: p?.is_dark ?? false, selected: p?.selected ?? true }
  })
}

const bulkPrice  = ref('')
const bulkWeight = ref('')

function applyBulk() {
  rows.value.forEach(r => {
    if (!r.selected) return
    if (bulkPrice.value  !== '') r.price  = bulkPrice.value
    if (bulkWeight.value !== '') r.weight = bulkWeight.value
  })
  bulkPrice.value = ''; bulkWeight.value = ''
}

// Global package dimensions for create mode (applied to all new variants)
const globalDims = reactive({ l: '', w: '', h: '', h_per: '', h_step: 1, stackable: true })

const allSelected = computed(() => rows.value.length > 0 && rows.value.every(r => r.selected))
function toggleAll() { const v = !allSelected.value; rows.value.forEach(r => r.selected = v) }

function goStep3() { buildRows(); step.value = 3 }

// ── Edit: Existing variants ────────────────────────────────────────────────────

const existingVariants = ref([])   // server-committed state
const localVariants    = ref([])   // working draft — all edits go here
const varLoad          = ref(false)
const varErr           = ref('')
const editVid          = ref(null)
const editVData        = reactive({
  price: '', weight: '', is_dark: false,
  dim_l: '', dim_w: '', dim_h: '', dim_h_per: '', dim_h_step: 1, is_stackable: true,
})
const addingV    = ref(false)
const addVMode   = ref(null)
const newVData   = ref(null)
const showAddMenu = ref(false)

// Per-variant dimension rules (lazy-loaded when editing)
const dimRulesMap = ref({})
const newRuleForm = ref(null)
const savingRule  = ref(false)

// Bulk dimension editing
const showBulkDims = ref(false)
const bulkDimBar   = reactive({ l: '', w: '', h: '', h_per: '', h_step: 1, stackable: true })
const varSel       = ref({})

const allVarsSelected = computed(() =>
  sortedVariants.value.length > 0 && sortedVariants.value.every(v => varSel.value[v.id])
)
function toggleAllVars() {
  const val = !allVarsSelected.value
  const map = { ...varSel.value }
  sortedVariants.value.forEach(v => { map[v.id] = val })
  varSel.value = map
}

const selectedCount  = computed(() => Object.values(varSel.value).filter(Boolean).length)
const bulkEditPrice  = ref('')
const bulkEditWeight = ref('')

function cloneVariants(list) { return list.map(v => ({ ...v })) }

// IDs of localVariants that differ from their server state
const changedVariantIds = computed(() => {
  const orig = {}
  existingVariants.value.forEach(v => { orig[v.id] = v })
  return localVariants.value
    .filter(lv => {
      const o = orig[lv.id]; if (!o) return false
      return (
        lv.is_active !== o.is_active        ||
        +lv.cost     !== +o.cost             ||
        +lv.price    !== +o.price            ||
        +lv.weight_oz !== +o.weight_oz       ||
        lv.is_dark   !== o.is_dark           ||
        +lv.dim_length_in          !== +o.dim_length_in          ||
        +lv.dim_width_in           !== +o.dim_width_in           ||
        +lv.dim_height_base_in     !== +o.dim_height_base_in     ||
        +lv.dim_height_per_unit_in !== +o.dim_height_per_unit_in ||
        +lv.dim_height_step        !== +o.dim_height_step        ||
        lv.is_stackable !== o.is_stackable
      )
    })
    .map(v => v.id)
})

const hasUnsavedVariants = computed(() => changedVariantIds.value.length > 0)
const savingAllVariants  = ref(false)

async function saveAllVariants() {
  if (!props.product) return
  savingAllVariants.value = true; varErr.value = ''
  try {
    for (const v of localVariants.value.filter(v => changedVariantIds.value.includes(v.id))) {
      const payload = props.role === 'superadmin'
        ? { price: v.price, weight_oz: v.weight_oz, is_dark: v.is_dark }
        : {
            cost: v.cost, weight_oz: v.weight_oz, is_dark: v.is_dark, is_active: v.is_active,
            dim_length_in: v.dim_length_in, dim_width_in: v.dim_width_in,
            dim_height_base_in: v.dim_height_base_in,
            dim_height_per_unit_in: v.dim_height_per_unit_in,
            dim_height_step: v.dim_height_step, is_stackable: v.is_stackable,
          }
      if (props.role === 'superadmin') await superAdminApi.updateVariant(props.product.id, v.id, payload)
      else                             await catalogApi.updateVariant(props.product.id, v.id, payload)
    }
    existingVariants.value = cloneVariants(localVariants.value)
  } catch { varErr.value = 'Failed to save changes.' }
  finally { savingAllVariants.value = false }
}

function discardVariantChanges() {
  localVariants.value = cloneVariants(existingVariants.value)
  editVid.value = null; cancelAddV()
}

// ── All mutations below are LOCAL only — no API until saveAllVariants() ─────────

function applyBulkPrice() {
  if (!bulkEditPrice.value) return
  const patch = props.role === 'superadmin' ? { price: +bulkEditPrice.value } : { cost: +bulkEditPrice.value }
  localVariants.value.filter(v => varSel.value[v.id]).forEach(v => Object.assign(v, patch))
  bulkEditPrice.value = ''
}

function applyBulkWeight() {
  if (!bulkEditWeight.value) return
  localVariants.value.filter(v => varSel.value[v.id]).forEach(v => { v.weight_oz = +bulkEditWeight.value })
  bulkEditWeight.value = ''
}

function applyBulkActive(val) {
  if (props.role === 'superadmin') return
  localVariants.value.filter(v => varSel.value[v.id]).forEach(v => { v.is_active = val })
}

function applyBulkDims() {
  const patch = {
    dim_length_in:          bulkDimBar.l     || 0,
    dim_width_in:           bulkDimBar.w     || 0,
    dim_height_base_in:     bulkDimBar.h     || 0,
    dim_height_per_unit_in: bulkDimBar.h_per || 0,
    dim_height_step:        bulkDimBar.h_step || 1,
    is_stackable:           bulkDimBar.stackable,
  }
  localVariants.value.filter(v => varSel.value[v.id]).forEach(v => Object.assign(v, patch))
}

// Dark/Light is governed per color, not per size — toggling one color applies
// it to every size-variant sharing that color name in one go.
const uniqueColors = computed(() => {
  const map = new Map()
  for (const v of localVariants.value) {
    if (!v.color) continue
    if (!map.has(v.color)) map.set(v.color, { name: v.color, hex: v.color_hex || '', count: 0, darkCount: 0 })
    const entry = map.get(v.color)
    entry.count++
    if (v.is_dark) entry.darkCount++
  }
  return [...map.values()]
    .map(c => ({ ...c, is_dark: c.darkCount === c.count }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

function setColorDark(colorName, value) {
  localVariants.value.filter(v => v.color === colorName).forEach(v => { v.is_dark = value })
}

async function loadVariants() {
  if (!props.product) return
  varLoad.value = true; varErr.value = ''
  try {
    if (props.role === 'superadmin') {
      const { data } = await superAdminApi.productVariants(props.product.id)
      existingVariants.value = data.results ?? data
    } else {
      const [prodRes, dimsRes] = await Promise.all([
        catalogApi.myCatalogProduct(props.product.id),
        catalogApi.printAreaDims(props.product.id),
      ])
      existingVariants.value = prodRes.data.variants ?? []
      printAreas.value       = prodRes.data.print_areas ?? []
      dimsRes.data.forEach(s => {
        const k = `${s.print_area}_${s.size}`
        dimSpecs[k]          = String(Number(s.max_dim_in) || '')
        dimSpecs[k + '_w']   = String(Number(s.max_width_in) || '')
        dimSpecs[k + '_h']   = String(Number(s.max_height_in) || '')
      })
    }
    localVariants.value = cloneVariants(existingVariants.value)
  } catch { varErr.value = 'Failed to load variants.' }
  finally { varLoad.value = false }
}

function startEditV(v) {
  editVid.value          = v.id
  editVData.price        = props.role === 'superadmin' ? (v.price ?? v.cost) : v.cost
  editVData.weight       = v.weight_oz ?? ''
  editVData.is_dark      = v.is_dark ?? false
  editVData.dim_l        = +v.dim_length_in > 0          ? String(v.dim_length_in)          : ''
  editVData.dim_w        = +v.dim_width_in > 0           ? String(v.dim_width_in)           : ''
  editVData.dim_h        = +v.dim_height_base_in > 0     ? String(v.dim_height_base_in)     : ''
  editVData.dim_h_per    = +v.dim_height_per_unit_in > 0 ? String(v.dim_height_per_unit_in) : ''
  editVData.dim_h_step   = v.dim_height_step ?? 1
  editVData.is_stackable = v.is_stackable ?? true
  newRuleForm.value      = null
  if (props.role !== 'superadmin' && dimRulesMap.value[v.id] === undefined) {
    loadDimRules(v.id)
  }
}
function cancelEditV() { editVid.value = null; newRuleForm.value = null }

async function loadDimRules(variantId) {
  if (!props.product) return
  try {
    const { data } = await catalogApi.dimRules(props.product.id, variantId)
    dimRulesMap.value = { ...dimRulesMap.value, [variantId]: data }
  } catch { dimRulesMap.value = { ...dimRulesMap.value, [variantId]: [] } }
}

async function addDimRule(variantId) {
  if (!newRuleForm.value || !props.product) return
  savingRule.value = true
  try {
    const payload = {
      qty_min:   newRuleForm.value.qty_min   || 1,
      qty_max:   newRuleForm.value.qty_max   || null,
      length_in: newRuleForm.value.length_in || 0,
      width_in:  newRuleForm.value.width_in  || 0,
      height_in: newRuleForm.value.height_in || 0,
    }
    const { data } = await catalogApi.createDimRule(props.product.id, variantId, payload)
    dimRulesMap.value = {
      ...dimRulesMap.value,
      [variantId]: [...(dimRulesMap.value[variantId] || []), data],
    }
    newRuleForm.value = null
  } catch { varErr.value = 'Failed to add rule.' }
  finally { savingRule.value = false }
}

async function deleteDimRule(variantId, ruleId) {
  if (!props.product) return
  try {
    await catalogApi.deleteDimRule(props.product.id, variantId, ruleId)
    dimRulesMap.value = {
      ...dimRulesMap.value,
      [variantId]: (dimRulesMap.value[variantId] || []).filter(r => r.id !== ruleId),
    }
  } catch { varErr.value = 'Failed to delete rule.' }
}

function copyDimsToAll(sourceId) {
  const patch = {
    dim_length_in:          editVData.dim_l     || 0,
    dim_width_in:           editVData.dim_w     || 0,
    dim_height_base_in:     editVData.dim_h     || 0,
    dim_height_per_unit_in: editVData.dim_h_per || 0,
    dim_height_step:        editVData.dim_h_step || 1,
    is_stackable:           editVData.is_stackable,
  }
  localVariants.value.filter(v => v.id !== sourceId).forEach(v => Object.assign(v, patch))
}

function saveEditV(v) {
  const dimFields = props.role !== 'superadmin' ? {
    dim_length_in:          editVData.dim_l     || 0,
    dim_width_in:           editVData.dim_w     || 0,
    dim_height_base_in:     editVData.dim_h     || 0,
    dim_height_per_unit_in: editVData.dim_h_per || 0,
    dim_height_step:        editVData.dim_h_step || 1,
    is_stackable:           editVData.is_stackable,
  } : {}
  const patch = props.role === 'superadmin'
    ? { price: editVData.price, weight_oz: editVData.weight, is_dark: editVData.is_dark }
    : { cost:  editVData.price, weight_oz: editVData.weight, is_dark: editVData.is_dark, ...dimFields }
  const idx = localVariants.value.findIndex(e => e.id === v.id)
  if (idx !== -1) Object.assign(localVariants.value[idx], patch)
  editVid.value = null
}

async function deleteV(v) {
  varErr.value = ''
  try {
    if (props.role === 'superadmin') await superAdminApi.deleteVariant(props.product.id, v.id)
    else                             await catalogApi.deleteVariant(props.product.id, v.id)
    existingVariants.value = existingVariants.value.filter(e => e.id !== v.id)
    localVariants.value    = localVariants.value.filter(e => e.id !== v.id)
  } catch { varErr.value = 'Failed to delete.' }
}

function startAddV() { showAddMenu.value = true }

function selectAddMode(mode) {
  addVMode.value    = mode
  showAddMenu.value = false
  newVData.value    = {
    value: '', price: '', weight: '', is_dark: false,
    dim_l: '', dim_w: '', dim_h: '', dim_h_per: '', dim_h_step: 1, is_stackable: true,
  }
}

function cancelAddV() {
  addVMode.value    = null
  newVData.value    = null
  showAddMenu.value = false
}

function toggleActive(v) {
  if (props.role === 'superadmin') return
  const found = localVariants.value.find(e => e.id === v.id)
  if (found) found.is_active = !found.is_active
}

async function submitNewV() {
  if (!newVData.value || !addVMode.value) return
  addingV.value = true; varErr.value = ''
  try {
    // addVMode 'v2' = adding a new Color → create one variant per existing unique Size
    // addVMode 'v1' = adding a new Size  → create one variant per existing unique Color
    const { value: newVal, ...rest } = newVData.value
    let payloads
    if (addVMode.value === 'v2') {
      const v1s = [...new Set(existingVariants.value.map(v => v.size))]
      if (!v1s.length) v1s.push('')
      payloads = v1s.map(s => buildVPayload({ ...rest, opt1: s, opt2: newVal }))
    } else {
      const v2s = [...new Set(existingVariants.value.map(v => v.color))]
      if (!v2s.length) v2s.push('')
      payloads = v2s.map(c => buildVPayload({ ...rest, opt1: newVal, opt2: c }))
    }
    const apiCreate = props.role === 'superadmin' ? superAdminApi.createVariant : catalogApi.createVariant
    const created = []
    for (const payload of payloads) {
      const { data } = await apiCreate(props.product.id, payload)
      created.push(data)
    }
    existingVariants.value.push(...cloneVariants(created))
    localVariants.value.push(...cloneVariants(created))
    cancelAddV()
  } catch (e) {
    const d = e?.response?.data
    varErr.value = d?.detail ?? (typeof d === 'object' ? JSON.stringify(d) : 'Failed.')
  } finally { addingV.value = false }
}

// ── Saving ─────────────────────────────────────────────────────────────────────

function buildVPayload(row) {
  // row from Step 3 (create) uses globalDims; row from newVForm (edit) has own dim fields
  const dimFields = props.role !== 'superadmin' ? {
    dim_length_in:          'dim_l' in row ? (row.dim_l     || 0) : (globalDims.l     || 0),
    dim_width_in:           'dim_l' in row ? (row.dim_w     || 0) : (globalDims.w     || 0),
    dim_height_base_in:     'dim_l' in row ? (row.dim_h     || 0) : (globalDims.h     || 0),
    dim_height_per_unit_in: 'dim_l' in row ? (row.dim_h_per || 0) : (globalDims.h_per || 0),
    dim_height_step:        'dim_l' in row ? (row.dim_h_step || 1) : (globalDims.h_step || 1),
    is_stackable:           'dim_l' in row ? row.is_stackable : globalDims.stackable,
  } : {}
  const base = {
    size: row.opt1 ?? '', color: row.opt2 ?? '',
    weight_oz: row.weight || 0, is_dark: row.is_dark || false,
    ...dimFields,
  }
  return props.role === 'superadmin'
    ? { ...base, price: row.price || 0, cost: 0 }
    : { ...base, cost: row.price || 0 }
}

function buildFd() {
  const fd = new FormData()
  fd.append('name', form.name)
  if (form.sku)         fd.append('sku', form.sku)
  if (form.description) fd.append('description', form.description)
  if (form.brand)       fd.append('brand', form.brand)
  if (form.category)    fd.append('category', form.category)
  if (form.age)         fd.append('age', form.age)
  if (form.subcategory) fd.append('subcategory', form.subcategory)
  if (form.badge)       fd.append('badge', form.badge)
  fd.append('is_active', form.is_active ? 'true' : 'false')
  if (props.role === 'superadmin' && form.base_price) fd.append('base_price', form.base_price)
  fd.append('variant1_label', dims.value[0].label || 'Size')
  fd.append('variant2_label', dims.value[1].label || 'Color')
  if (imageFile.value) fd.append('primary_image', imageFile.value)
  // Empty string is NOT appended — Django rejects it as "not a file".
  // Explicit clears are handled separately with a JSON PATCH after the multipart save.
  return fd
}

async function saveInfo() {
  saving.value = true; saveErr.value = ''
  try {
    const fd = buildFd()
    if (props.role === 'superadmin') await superAdminApi.updateProduct(props.product.id, fd)
    else                             await catalogApi.updateProduct(props.product.id, fd)

    // If image was explicitly removed, send a separate JSON PATCH to null it
    if (imageCleared.value) {
      if (props.role === 'superadmin') await superAdminApi.updateProduct(props.product.id, { primary_image: null })
      else                             await catalogApi.updateProduct(props.product.id, { primary_image: null })
    }
    emit('saved')
  } catch (e) {
    saveErr.value = e?.response?.data
      ? Object.entries(e.response.data).map(([k, v]) => `${k}: ${v}`).join(' | ')
      : 'Save failed.'
  } finally { saving.value = false }
}

async function saveCreate() {
  saving.value = true; saveErr.value = ''
  try {
    const fd = buildFd()
    let productId
    if (props.role === 'superadmin') {
      const { data } = await superAdminApi.createProduct(fd)
      productId = data.id
    } else {
      const { data } = await catalogApi.createProduct(fd)
      productId = data.id
    }

    const selected = rows.value.filter(r => r.selected)
    if (selected.length) {
      const payloads = selected.map(buildVPayload)
      if (props.role === 'superadmin') await superAdminApi.createVariant(productId, payloads)
      else                             await catalogApi.createVariant(productId, payloads)
    }
    emit('saved')
  } catch (e) {
    saveErr.value = e?.response?.data
      ? Object.entries(e.response.data).map(([k, v]) => `${k}: ${v}`).join(' | ')
      : 'Save failed.'
  } finally { saving.value = false }
}

// ── Print areas (PC, edit mode only) ──────────────────────────────────────────

const printAreas   = ref([])
const printAreaErr = ref('')
const newAreaForm  = ref(null)
const savingArea   = ref(false)

// Size × print area dimension grid
const dimSpecs    = reactive({})   // key: `${areaId}_${size}` (+ `_w` / `_h` for box areas), value: string (inches)
const dimsSaving  = ref(false)
const dimsErr     = ref('')

const productSizes = computed(() => {
  const seen = new Set()
  const out  = []
  for (const v of existingVariants.value) {
    if (v.size && !seen.has(v.size)) { seen.add(v.size); out.push(v.size) }
  }
  return out.sort((a, b) => sizeRank(a) - sizeRank(b))
})

async function saveDimSpecs() {
  if (!props.product) return
  dimsSaving.value = true; dimsErr.value = ''
  try {
    const items = []
    for (const area of gridAreas.value) {
      for (const size of productSizes.value) {
        items.push({
          print_area: area.id,
          size,
          max_dim_in:    dimSpecs[`${area.id}_${size}`] || 0,
          max_width_in:  dimSpecs[`${area.id}_${size}_w`] || 0,
          max_height_in: dimSpecs[`${area.id}_${size}_h`] || 0,
        })
      }
    }
    await catalogApi.savePrintAreaDims(props.product.id, items)
  } catch (e) {
    dimsErr.value = e?.response?.data?.detail ?? 'Failed to save.'
  } finally { dimsSaving.value = false }
}

const isBox = area => area.size_mode === 'box'

// Areas that take their sizes from another one (right sleeve) have no column of their own.
const gridAreas   = computed(() => printAreas.value.filter(a => !a.size_from))
const followersOf = area => printAreas.value.filter(a => a.size_from === area.id)
const areaById    = id => printAreas.value.find(a => a.id === id)
const groupLabel  = area => [area.name, ...followersOf(area).map(a => a.name)].join(' + ')

async function reloadAreas() {
  const { data } = await catalogApi.myCatalogProduct(props.product.id)
  printAreas.value = data.print_areas ?? []
}

async function toggleSizeMode(area) {
  if (!props.product) return
  printAreaErr.value = ''
  const next = isBox(area) ? 'longest' : 'box'
  try {
    await catalogApi.updatePrintArea(props.product.id, area.id, { size_mode: next })
    area.size_mode = next
    followersOf(area).forEach(a => { a.size_mode = next })
  } catch (e) {
    printAreaErr.value = e?.response?.data?.detail ?? 'Failed to change the size type.'
  }
}

async function detachSizes(area) {
  if (!props.product) return
  printAreaErr.value = ''
  try {
    await catalogApi.updatePrintArea(props.product.id, area.id, { size_from: null })
    area.size_from = null
  } catch (e) {
    printAreaErr.value = e?.response?.data?.detail ?? 'Failed to change the sizes.'
  }
}

async function addPrintArea() {
  if (!newAreaForm.value || !props.product) return
  savingArea.value = true; printAreaErr.value = ''
  try {
    await catalogApi.createPrintArea(props.product.id, {
      name: newAreaForm.value.name,
      ...(newAreaForm.value.size_from ? { size_from: newAreaForm.value.size_from } : {}),
    })
    await reloadAreas()          // a left/right twin may have been linked to this one
    newAreaForm.value = null
  } catch (e) {
    printAreaErr.value = e?.response?.data?.detail ?? e?.response?.data?.name?.[0] ?? 'Failed to add.'
  } finally { savingArea.value = false }
}

async function removePrintArea(area) {
  if (!props.product) return
  if (!(await confirmDialog({
    title: `Remove "${area.name}"?`,
    message: 'Its size specs for this product will be deleted too.',
    danger: true,
  }))) return
  printAreaErr.value = ''
  try {
    await catalogApi.deletePrintArea(props.product.id, area.id)
    printAreas.value = printAreas.value.filter(a => a.id !== area.id)
  } catch (e) {
    printAreaErr.value = e?.response?.data?.detail ?? 'Failed to delete.'
  }
}

async function uploadPrintAreaIcon(area, file) {
  if (!file || !props.product) return
  const fd = new FormData()
  fd.append('icon', file)
  try {
    const { data } = await catalogApi.updatePrintArea(props.product.id, area.id, fd)
    area.icon = data.icon
  } catch (e) {
    printAreaErr.value = e?.response?.data?.detail ?? 'Icon upload failed.'
  }
}

// ── Lifecycle ──────────────────────────────────────────────────────────────────

onMounted(() => {
  loadCatsBrands()
  loadProduct(props.product)
  if (props.mode === 'edit') loadVariants()
})

// Label for "price" column — SA calls it price, PC calls the field cost but we show "Price"
const priceLabel = computed(() => 'Price ($)')
const v1Label    = computed(() => dims.value[0].label || 'Var 1')
const v2Label    = computed(() => dims.value[1].label || 'Var 2')
</script>

<template>
  <!-- Category manage modal -->
  <Teleport to="body">
    <div v-if="catModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[80vh] overflow-hidden">
        <div class="px-5 py-4 border-b border-card-border flex items-center justify-between shrink-0">
          <h3 class="font-semibold">Manage Categories</h3>
          <button @click="catModal = false; catEditId = null; catError = ''"
            class="text-text-muted hover:text-text-primary text-xl leading-none">✕</button>
        </div>

        <!-- Existing list -->
        <div class="flex-1 overflow-y-auto p-4 space-y-1">
          <div v-if="catError" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 mb-2">{{ catError }}</div>

          <div v-for="cat in cats" :key="cat.id"
            class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sidebar-bg group"
            :class="{ 'ml-4': cat.parent }">
            <!-- View mode -->
            <template v-if="catEditId !== cat.id">
              <span class="flex-1 text-sm truncate">{{ cat.parent ? '— ' : '' }}{{ cat.name }}</span>
              <button @click="startEditCat(cat)"
                class="text-xs text-accent opacity-0 group-hover:opacity-100 hover:underline shrink-0">Rename</button>
              <button v-if="role === 'superadmin' || role === 'print_center'" @click="deleteCat(cat)"
                :disabled="catDeleting === cat.id"
                class="text-xs text-red-400 opacity-0 group-hover:opacity-100 hover:text-red-600 shrink-0 disabled:opacity-30">✕</button>
            </template>
            <!-- Edit mode -->
            <template v-else>
              <input v-model="catEditName" type="text" @keyup.enter="saveEditCat(cat)" @keyup.escape="cancelEditCat"
                class="flex-1 rounded border border-accent px-2 py-1 text-sm" autofocus />
              <button @click="saveEditCat(cat)" :disabled="catSavingEdit || !catEditName"
                class="text-xs text-emerald-600 hover:underline shrink-0 disabled:opacity-40">Save</button>
              <button @click="cancelEditCat" class="text-xs text-text-muted hover:text-text-primary shrink-0">✕</button>
            </template>
          </div>

          <div v-if="!cats.length" class="text-xs text-text-muted text-center py-3">No categories yet.</div>
        </div>

        <!-- Add new -->
        <div class="px-4 py-3 border-t border-card-border shrink-0 space-y-2">
          <div class="text-xs font-medium text-text-secondary">Add New Category</div>
          <select v-model="catParent" class="w-full rounded-lg border border-card-border px-3 py-1.5 text-sm">
            <option value="">Top-level category</option>
            <option v-for="c in cats.filter(c => !c.parent)" :key="c.id" :value="c.id">
              Subcategory of {{ c.name }}
            </option>
          </select>
          <div class="flex gap-2">
            <input v-model="catName" type="text" placeholder="Category name" @keyup.enter="saveCategory"
              class="flex-1 rounded-lg border border-card-border px-3 py-1.5 text-sm" />
            <button @click="saveCategory" :disabled="catSaving || !catName"
              class="btn-primary text-sm px-4 disabled:opacity-50">{{ catSaving ? '…' : 'Add' }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Brand manage modal -->
  <Teleport to="body">
    <div v-if="brandModal" class="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col max-h-[80vh] overflow-hidden">
        <div class="px-5 py-4 border-b border-card-border flex items-center justify-between shrink-0">
          <h3 class="font-semibold">Manage Brands</h3>
          <button @click="brandModal = false; brandEditId = null; brandError = ''"
            class="text-text-muted hover:text-text-primary text-xl leading-none">✕</button>
        </div>

        <!-- Existing list -->
        <div class="flex-1 overflow-y-auto p-4 space-y-1">
          <div v-if="brandError" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700 mb-2">{{ brandError }}</div>

          <div v-for="b in brands" :key="b.id"
            class="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-sidebar-bg group">
            <!-- View mode -->
            <template v-if="brandEditId !== b.id">
              <span class="flex-1 text-sm truncate">{{ b.name }}</span>
              <button @click="startEditBrand(b)"
                class="text-xs text-accent opacity-0 group-hover:opacity-100 hover:underline shrink-0">Rename</button>
              <button v-if="role === 'superadmin'" @click="deleteBrand(b)"
                :disabled="brandDeleting === b.id"
                class="text-xs text-red-400 opacity-0 group-hover:opacity-100 hover:text-red-600 shrink-0 disabled:opacity-30">✕</button>
            </template>
            <!-- Edit mode -->
            <template v-else>
              <input v-model="brandEditName" type="text" @keyup.enter="saveEditBrand(b)" @keyup.escape="cancelEditBrand"
                class="flex-1 rounded border border-accent px-2 py-1 text-sm" autofocus />
              <button @click="saveEditBrand(b)" :disabled="brandSavingEdit || !brandEditName"
                class="text-xs text-emerald-600 hover:underline shrink-0 disabled:opacity-40">Save</button>
              <button @click="cancelEditBrand" class="text-xs text-text-muted hover:text-text-primary shrink-0">✕</button>
            </template>
          </div>

          <div v-if="!brands.length" class="text-xs text-text-muted text-center py-3">No brands yet.</div>
        </div>

        <!-- Add new -->
        <div class="px-4 py-3 border-t border-card-border shrink-0 space-y-2">
          <div class="text-xs font-medium text-text-secondary">Add New Brand</div>
          <div class="flex gap-2">
            <input v-model="brandName" type="text" placeholder="Brand name" @keyup.enter="saveBrand"
              class="flex-1 rounded-lg border border-card-border px-3 py-1.5 text-sm" />
            <button @click="saveBrand" :disabled="brandSaving || !brandName"
              class="btn-primary text-sm px-4 disabled:opacity-50">{{ brandSaving ? '…' : 'Add' }}</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Main modal -->
  <Teleport to="body">
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        <!-- Header -->
        <div class="px-6 py-4 border-b border-card-border shrink-0">
          <div class="flex items-center justify-between">
            <h3 class="font-semibold text-lg">
              {{ mode === 'create' ? 'New Product' : 'Edit Product' }}
            </h3>
            <button @click="emit('close')" class="text-text-muted hover:text-text-primary text-xl leading-none">✕</button>
          </div>

          <!-- Step indicator (create) -->
          <div v-if="mode === 'create'" class="flex items-center gap-1 mt-3">
            <template v-for="(label, i) in ['Product Info', 'Variant Options', 'Set Prices']" :key="i">
              <div class="flex items-center gap-1.5">
                <div class="w-6 h-6 rounded-full text-xs flex items-center justify-center font-semibold shrink-0"
                  :class="step === i+1 ? 'bg-accent text-white'
                        : step > i+1  ? 'bg-emerald-500 text-white'
                        :               'bg-gray-100 text-text-muted'">
                  {{ step > i+1 ? '✓' : i+1 }}
                </div>
                <span class="text-sm hidden sm:inline"
                  :class="step === i+1 ? 'font-medium text-text-primary' : 'text-text-muted'">
                  {{ label }}
                </span>
              </div>
              <div v-if="i < 2" class="flex-1 h-px bg-gray-200 mx-1 max-w-8" />
            </template>
          </div>

          <!-- Tab switcher (edit) -->
          <div v-else class="flex gap-1 mt-3">
            <button v-for="t in [
              { key: 'info',        label: 'Product Info' },
              { key: 'variants',    label: `Variants (${localVariants.length})` },
              ...(role !== 'superadmin' ? [{ key: 'print_areas', label: `Print Areas (${printAreas.length})` }] : []),
            ]" :key="t.key"
              @click="editTab = t.key"
              class="px-3 py-1.5 text-base rounded-lg transition"
              :class="editTab === t.key
                ? 'bg-accent-light text-accent-dark font-medium'
                : 'text-text-secondary hover:text-text-primary hover:bg-sidebar-bg'">
              {{ t.label }}
            </button>
          </div>
        </div>

        <!-- Scrollable body -->
        <div class="flex-1 overflow-y-auto">

          <!-- ── CREATE: Step 1 ─────────────────────────────────────────────── -->
          <div v-if="mode === 'create' && step === 1" class="p-6 space-y-4">
            <div v-if="saveErr" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{{ saveErr }}</div>

            <div class="grid grid-cols-2 gap-4">
              <div class="col-span-2">
                <label class="text-sm text-text-secondary block mb-1">Product Name *</label>
                <input v-model="form.name" type="text" class="input" />
              </div>

              <div>
                <label class="text-sm text-text-secondary block mb-1">Product Code (optional)</label>
                <input v-model="form.sku" type="text" placeholder="e.g. G18000" class="input font-mono" />
              </div>

              <div>
                <label class="text-sm text-text-secondary block mb-1">Badge</label>
                <select v-model="form.badge" class="input">
                  <option value="">None</option>
                  <option value="popular">Popular</option>
                  <option value="new">New</option>
                  <option value="bestseller">Bestseller</option>
                </select>
              </div>

              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="text-sm text-text-secondary">Category</label>
                  <button @click="catModal = true" class="text-xs text-accent hover:underline">Manage</button>
                </div>
                <select v-model="form.category" class="input">
                  <option value="">— None —</option>
                  <option v-for="c in cats" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </div>

              <div>
                <label class="text-sm text-text-secondary block mb-1">Subcategory (optional)</label>
                <input v-model="form.subcategory" type="text" placeholder="e.g. T-Shirts, Sweatshirts" class="input" />
              </div>

              <div>
                <label class="text-sm text-text-secondary block mb-1">Age (optional)</label>
                <input v-model="form.age" type="text" placeholder="e.g. Adult, Youth, Kids" class="input" />
              </div>

              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="text-sm text-text-secondary">Brand</label>
                  <button @click="brandModal = true" class="text-xs text-accent hover:underline">Manage</button>
                </div>
                <select v-model="form.brand" class="input">
                  <option value="">— None —</option>
                  <option v-for="b in brands" :key="b.id" :value="b.id">{{ b.name }}</option>
                </select>
              </div>

              <div v-if="role === 'superadmin'">
                <label class="text-sm text-text-secondary block mb-1">Base Price ($)</label>
                <input v-model="form.base_price" type="number" step="0.01" min="0" class="input" />
              </div>

              <div class="col-span-2">
                <label class="text-sm text-text-secondary block mb-1">Description</label>
                <textarea v-model="form.description" rows="2" class="input resize-none" />
              </div>

              <div class="col-span-2">
                <label class="text-sm text-text-secondary block mb-1">Product Image</label>
                <div v-if="imagePreview" class="relative inline-block mb-2">
                  <img :src="imagePreview" alt="preview" class="h-24 w-24 object-cover rounded-lg border border-card-border" />
                  <button @click="removeImage"
                    class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center hover:bg-red-600">✕</button>
                </div>
                <label class="flex cursor-pointer">
                  <div class="flex-1 rounded-lg border border-dashed border-card-border px-3 py-2.5 text-sm text-text-muted hover:border-accent hover:text-accent transition text-center">
                    {{ imageFile ? imageFile.name : (imagePreview ? 'Change image…' : 'Click to upload image') }}
                  </div>
                  <input type="file" accept="image/*" class="hidden" @change="onImageChange" />
                </label>
              </div>

              <div class="col-span-2">
                <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" v-model="form.is_active" class="accent-accent" />
                  Active
                </label>
              </div>
            </div>
          </div>

          <!-- ── CREATE: Step 2 — Variant dimensions ────────────────────────── -->
          <div v-if="mode === 'create' && step === 2" class="p-6 space-y-5">

            <div>
              <label class="text-sm text-text-secondary block mb-2">Number of variation types</label>
              <div class="flex flex-wrap gap-4">
                <label v-for="n in [0, 1, 2]" :key="n" class="flex items-center gap-2 cursor-pointer">
                  <input type="radio" v-model="numDims" :value="n" class="accent-accent" />
                  <span class="text-sm">
                    {{ n === 0 ? 'None — single variant' : n === 1 ? '1 type (e.g. Size only)' : '2 types (e.g. Size + Color)' }}
                  </span>
                </label>
              </div>
            </div>

            <!-- Dimension 1 -->
            <div v-if="numDims >= 1" class="p-4 rounded-xl border border-card-border space-y-3">
              <div class="flex items-center gap-3">
                <span class="text-xs text-text-secondary w-28 shrink-0">Variation 1 name</span>
                <input v-model="dims[0].label" type="text" placeholder="e.g. Size"
                  class="w-40 rounded-lg border border-card-border px-3 py-1.5 text-sm" />
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-text-secondary w-28 shrink-0">Add options</span>
                <input v-model="dims[0].input" type="text" placeholder="S, M, L, XL — Enter to add"
                  @keydown.enter.prevent="addOption(0)"
                  class="flex-1 rounded-lg border border-card-border px-3 py-1.5 text-sm" />
                <button @click="addOption(0)" class="btn-secondary text-xs py-1.5 px-3">Add</button>
              </div>
              <div class="flex flex-wrap gap-1.5 min-h-[28px]">
                <span v-for="(opt, i) in dims[0].options" :key="i"
                  class="flex items-center gap-1 bg-accent-light text-accent-dark text-xs rounded-full px-2.5 py-1 font-medium">
                  {{ opt }}
                  <button @click="removeOption(0, i)" class="hover:text-red-600 ml-0.5 leading-none">×</button>
                </span>
                <span v-if="!dims[0].options.length" class="text-xs text-text-muted self-center">No options added yet</span>
              </div>
              <div class="text-xs text-text-muted">{{ dims[0].options.length }} / 50</div>
            </div>

            <!-- Dimension 2 -->
            <div v-if="numDims >= 2" class="p-4 rounded-xl border border-card-border space-y-3">
              <div class="flex items-center gap-3">
                <span class="text-xs text-text-secondary w-28 shrink-0">Variation 2 name</span>
                <input v-model="dims[1].label" type="text" placeholder="e.g. Color"
                  class="w-40 rounded-lg border border-card-border px-3 py-1.5 text-sm" />
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs text-text-secondary w-28 shrink-0">Add options</span>
                <input v-model="dims[1].input" type="text" placeholder="Black, White, Navy — Enter to add"
                  @keydown.enter.prevent="addOption(1)"
                  class="flex-1 rounded-lg border border-card-border px-3 py-1.5 text-sm" />
                <button @click="addOption(1)" class="btn-secondary text-xs py-1.5 px-3">Add</button>
              </div>
              <div class="flex flex-wrap gap-1.5 min-h-[28px]">
                <span v-for="(opt, i) in dims[1].options" :key="i"
                  class="flex items-center gap-1 bg-accent-light text-accent-dark text-xs rounded-full px-2.5 py-1 font-medium">
                  {{ opt }}
                  <button @click="removeOption(1, i)" class="hover:text-red-600 ml-0.5 leading-none">×</button>
                </span>
                <span v-if="!dims[1].options.length" class="text-xs text-text-muted self-center">No options added yet</span>
              </div>
              <div class="text-xs text-text-muted">{{ dims[1].options.length }} / 50</div>
            </div>

            <div class="text-sm text-center text-text-secondary">
              <span class="font-semibold text-text-primary">{{ comboCount }}</span>
              variant{{ comboCount !== 1 ? 's' : '' }} will be generated
            </div>
          </div>

          <!-- ── CREATE: Step 3 — Price table ───────────────────────────────── -->
          <div v-if="mode === 'create' && step === 3" class="p-6 space-y-4">
            <div v-if="saveErr" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{{ saveErr }}</div>

            <!-- Package Dimensions (PC role only) -->
            <div v-if="role !== 'superadmin'"
              class="flex flex-wrap items-center gap-3 px-4 py-3 bg-blue-50 rounded-xl border border-blue-100">
              <span class="text-xs font-medium text-text-secondary shrink-0">Package Dims (inches):</span>
              <div class="flex items-center gap-1">
                <span class="text-[11px] text-text-muted">L</span>
                <input v-model="globalDims.l" type="number" step="0.1" min="0" placeholder="12"
                  class="w-14 rounded-lg border border-card-border px-2 py-1 text-sm" />
              </div>
              <div class="flex items-center gap-1">
                <span class="text-[11px] text-text-muted">W</span>
                <input v-model="globalDims.w" type="number" step="0.1" min="0" placeholder="10"
                  class="w-14 rounded-lg border border-card-border px-2 py-1 text-sm" />
              </div>
              <div class="flex items-center gap-1">
                <span class="text-[11px] text-text-muted">H</span>
                <input v-model="globalDims.h" type="number" step="0.1" min="0" placeholder="2"
                  class="w-14 rounded-lg border border-card-border px-2 py-1 text-sm" />
              </div>
              <div class="flex items-center gap-1">
                <span class="text-[11px] text-text-muted">+H"</span>
                <input v-model="globalDims.h_per" type="number" step="0.1" min="0" placeholder="0"
                  class="w-14 rounded-lg border border-card-border px-2 py-1 text-sm" />
              </div>
              <div class="flex items-center gap-1">
                <span class="text-[11px] text-text-muted">per</span>
                <input v-model.number="globalDims.h_step" type="number" step="1" min="1" placeholder="1"
                  class="w-12 rounded-lg border border-card-border px-2 py-1 text-sm" />
                <span class="text-[11px] text-text-muted">items</span>
              </div>
              <label class="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                <input type="checkbox" v-model="globalDims.stackable" class="accent-accent" />
                Stackable
              </label>
              <span class="text-[11px] text-text-muted ml-auto">Applied to all variants</span>
            </div>

            <!-- Bulk bar -->
            <div class="flex flex-wrap items-center gap-3 px-4 py-3 bg-sidebar-bg rounded-xl border border-card-border">
              <span class="text-xs font-medium text-text-secondary shrink-0">Bulk set selected:</span>
              <div class="flex items-center gap-1.5">
                <span class="text-xs text-text-muted">Price $</span>
                <input v-model="bulkPrice" type="number" step="0.01" min="0" placeholder="0.00"
                  class="w-24 rounded-lg border border-card-border px-2 py-1 text-sm" />
              </div>
              <div class="flex items-center gap-1.5">
                <span class="text-xs text-text-muted">Weight oz</span>
                <input v-model="bulkWeight" type="number" step="0.01" min="0" placeholder="0"
                  class="w-20 rounded-lg border border-card-border px-2 py-1 text-sm" />
              </div>
              <button @click="applyBulk" class="btn-primary text-xs py-1.5 px-3 shrink-0">Apply</button>
            </div>

            <!-- Table -->
            <div class="rounded-xl border border-card-border overflow-hidden">
              <table class="w-full text-sm">
                <thead class="bg-sidebar-bg text-xs text-text-secondary">
                  <tr>
                    <th class="px-3 py-2 w-8">
                      <input type="checkbox" :checked="allSelected" @change="toggleAll" class="accent-accent" />
                    </th>
                    <th v-if="numDims >= 1" class="text-left px-3 py-2">{{ v1Label }}</th>
                    <th v-if="numDims >= 2" class="text-left px-3 py-2">{{ v2Label }}</th>
                    <th class="text-left px-3 py-2">{{ priceLabel }} *</th>
                    <th class="text-left px-3 py-2">Weight (oz)</th>
                    <th class="text-center px-3 py-2">Dark?</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-card-border">
                  <tr v-for="(row, i) in rows" :key="i"
                    class="transition"
                    :class="row.selected ? 'hover:bg-sidebar-bg/40' : 'opacity-40'">
                    <td class="px-3 py-1.5">
                      <input type="checkbox" v-model="row.selected" class="accent-accent" />
                    </td>
                    <td v-if="numDims >= 1" class="px-3 py-1.5 font-medium">{{ row.opt1 || '—' }}</td>
                    <td v-if="numDims >= 2" class="px-3 py-1.5">{{ row.opt2 || '—' }}</td>
                    <td class="px-2 py-1.5">
                      <input v-model="row.price" type="number" step="0.01" min="0" placeholder="0.00"
                        class="w-24 rounded-lg border border-card-border px-2 py-1 text-sm" />
                    </td>
                    <td class="px-2 py-1.5">
                      <input v-model="row.weight" type="number" step="0.01" min="0" placeholder="0"
                        class="w-20 rounded-lg border border-card-border px-2 py-1 text-sm" />
                    </td>
                    <td class="px-3 py-1.5 text-center">
                      <input type="checkbox" v-model="row.is_dark" class="accent-accent" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="text-xs text-text-muted text-right">
              {{ rows.filter(r => r.selected).length }} / {{ rows.length }} variants selected
            </div>
          </div>

          <!-- ── EDIT: Info tab ──────────────────────────────────────────────── -->
          <div v-if="mode === 'edit' && editTab === 'info'" class="p-6 space-y-4">
            <div v-if="saveErr" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{{ saveErr }}</div>

            <div class="grid grid-cols-2 gap-4">
              <div class="col-span-2">
                <label class="text-sm text-text-secondary block mb-1">Product Name *</label>
                <input v-model="form.name" type="text" class="input" />
              </div>
              <div>
                <label class="text-sm text-text-secondary block mb-1">Product Code (optional)</label>
                <input v-model="form.sku" type="text" placeholder="e.g. G18000" class="input font-mono" />
              </div>
              <div>
                <label class="text-sm text-text-secondary block mb-1">Badge</label>
                <select v-model="form.badge" class="input">
                  <option value="">None</option>
                  <option value="popular">Popular</option>
                  <option value="new">New</option>
                  <option value="bestseller">Bestseller</option>
                </select>
              </div>
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="text-sm text-text-secondary">Category</label>
                  <button @click="catModal = true" class="text-xs text-accent hover:underline">Manage</button>
                </div>
                <select v-model="form.category" class="input">
                  <option value="">— None —</option>
                  <option v-for="c in cats" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </div>
              <div>
                <label class="text-sm text-text-secondary block mb-1">Subcategory (optional)</label>
                <input v-model="form.subcategory" type="text" placeholder="e.g. T-Shirts, Sweatshirts" class="input" />
              </div>
              <div>
                <label class="text-sm text-text-secondary block mb-1">Age (optional)</label>
                <input v-model="form.age" type="text" placeholder="e.g. Adult, Youth, Kids" class="input" />
              </div>
              <div>
                <div class="flex items-center justify-between mb-1">
                  <label class="text-sm text-text-secondary">Brand</label>
                  <button @click="brandModal = true" class="text-xs text-accent hover:underline">Manage</button>
                </div>
                <select v-model="form.brand" class="input">
                  <option value="">— None —</option>
                  <option v-for="b in brands" :key="b.id" :value="b.id">{{ b.name }}</option>
                </select>
              </div>
              <div v-if="role === 'superadmin'">
                <label class="text-sm text-text-secondary block mb-1">Base Price ($)</label>
                <input v-model="form.base_price" type="number" step="0.01" min="0" class="input" />
              </div>
              <div class="col-span-2">
                <label class="text-sm text-text-secondary block mb-1">Variant type labels</label>
                <div class="flex gap-3">
                  <input v-model="dims[0].label" type="text" placeholder="Variation 1 (e.g. Size)"
                    class="flex-1 rounded-lg border border-card-border px-3 py-2 text-sm" />
                  <input v-model="dims[1].label" type="text" placeholder="Variation 2 (e.g. Color)"
                    class="flex-1 rounded-lg border border-card-border px-3 py-2 text-sm" />
                </div>
              </div>
              <div class="col-span-2">
                <label class="text-sm text-text-secondary block mb-1">Description</label>
                <textarea v-model="form.description" rows="2" class="input resize-none" />
              </div>
              <div class="col-span-2">
                <label class="text-sm text-text-secondary block mb-1">Product Image</label>
                <div v-if="imagePreview" class="relative inline-block mb-2">
                  <img :src="imagePreview" alt="preview" class="h-24 w-24 object-cover rounded-lg border border-card-border" />
                  <button @click="removeImage"
                    class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center hover:bg-red-600">✕</button>
                </div>
                <label class="flex cursor-pointer">
                  <div class="flex-1 rounded-lg border border-dashed border-card-border px-3 py-2.5 text-sm text-text-muted hover:border-accent hover:text-accent transition text-center">
                    {{ imageFile ? imageFile.name : (imagePreview ? 'Change image…' : 'Click to upload image') }}
                  </div>
                  <input type="file" accept="image/*" class="hidden" @change="onImageChange" />
                </label>
              </div>
              <div class="col-span-2">
                <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" v-model="form.is_active" class="accent-accent" />
                  Active
                </label>
              </div>
            </div>
          </div>

          <!-- ── EDIT: Variants tab ──────────────────────────────────────────── -->
          <div v-if="mode === 'edit' && editTab === 'variants'" class="p-6 space-y-4">
            <div v-if="varErr" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{{ varErr }}</div>

            <!-- Bulk action bar (PC only) — appears when rows are selected -->
            <template v-if="role !== 'superadmin' && selectedCount > 0">
              <div class="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 bg-sidebar-bg rounded-xl border border-card-border">
                <span class="text-xs font-medium text-text-secondary shrink-0">{{ selectedCount }} selected:</span>

                <div class="flex items-center gap-1.5">
                  <span class="text-xs text-text-muted">Price $</span>
                  <input v-model="bulkEditPrice" type="number" step="0.01" min="0" placeholder="0.00"
                    class="w-20 rounded-lg border border-card-border px-2 py-1 text-sm bg-white" />
                  <button @click="applyBulkPrice" :disabled="!bulkEditPrice"
                    class="text-xs text-accent hover:underline disabled:opacity-40">Set</button>
                </div>

                <div class="flex items-center gap-1.5">
                  <span class="text-xs text-text-muted">Weight oz</span>
                  <input v-model="bulkEditWeight" type="number" step="0.01" min="0" placeholder="0"
                    class="w-16 rounded-lg border border-card-border px-2 py-1 text-sm bg-white" />
                  <button @click="applyBulkWeight" :disabled="!bulkEditWeight"
                    class="text-xs text-accent hover:underline disabled:opacity-40">Set</button>
                </div>

                <div class="flex items-center gap-1.5">
                  <span class="text-xs text-text-muted">Visibility:</span>
                  <button @click="applyBulkActive(true)"
                    class="text-xs px-2 py-0.5 rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition">Show</button>
                  <button @click="applyBulkActive(false)"
                    class="text-xs px-2 py-0.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition">Hide</button>
                </div>

                <button @click="showBulkDims = !showBulkDims"
                  class="text-xs flex items-center gap-1 ml-auto px-2.5 py-1 rounded-lg border transition"
                  :class="showBulkDims ? 'bg-blue-50 border-blue-200 text-blue-700' : 'border-card-border text-text-secondary hover:border-accent hover:text-accent'">
                  <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" stroke-linecap="round" stroke-linejoin="round"/>
                  </svg>
                  Dims
                </button>
              </div>

              <div v-if="showBulkDims"
                class="flex flex-wrap items-end gap-3 px-4 py-3 bg-blue-50 rounded-xl border border-blue-100">
                <div class="flex items-center gap-1">
                  <span class="text-[11px] text-text-muted">L"</span>
                  <input v-model="bulkDimBar.l" type="number" step="0.1" min="0" placeholder="12"
                    class="w-16 rounded-lg border border-card-border px-2 py-1 text-sm bg-white" />
                </div>
                <div class="flex items-center gap-1">
                  <span class="text-[11px] text-text-muted">W"</span>
                  <input v-model="bulkDimBar.w" type="number" step="0.1" min="0" placeholder="10"
                    class="w-16 rounded-lg border border-card-border px-2 py-1 text-sm bg-white" />
                </div>
                <div class="flex items-center gap-1">
                  <span class="text-[11px] text-text-muted">H"</span>
                  <input v-model="bulkDimBar.h" type="number" step="0.1" min="0" placeholder="2"
                    class="w-16 rounded-lg border border-card-border px-2 py-1 text-sm bg-white" />
                </div>
                <div class="flex items-center gap-1">
                  <span class="text-[11px] text-text-muted">+H"</span>
                  <input v-model="bulkDimBar.h_per" type="number" step="0.05" min="0" placeholder="0"
                    class="w-16 rounded-lg border border-card-border px-2 py-1 text-sm bg-white" />
                </div>
                <div class="flex items-center gap-1">
                  <span class="text-[11px] text-text-muted">per</span>
                  <input v-model.number="bulkDimBar.h_step" type="number" step="1" min="1" placeholder="1"
                    class="w-12 rounded-lg border border-card-border px-2 py-1 text-sm bg-white" />
                  <span class="text-[11px] text-text-muted">items</span>
                </div>
                <label class="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                  <input type="checkbox" v-model="bulkDimBar.stackable" class="accent-accent" />
                  Stackable
                </label>
                <button @click="applyBulkDims"
                  class="btn-primary text-xs py-1.5 px-4 ml-auto shrink-0">
                  Apply dims
                </button>
              </div>
            </template>

            <!-- Color Settings — two-card layout: Dark | Light.
                 Clicking a color chip moves it to the other card. -->
            <div v-if="uniqueColors.length" class="rounded-xl border border-card-border overflow-hidden">
              <div class="px-4 py-2 bg-sidebar-bg border-b border-card-border flex items-center justify-between">
                <span class="text-xs font-semibold text-text-muted uppercase tracking-wide">Color Settings — Dark / Light</span>
                <span class="text-xs text-text-muted">Click a color to move it</span>
              </div>
              <div class="grid grid-cols-2 divide-x divide-card-border">

                <!-- Dark Colors card -->
                <div class="p-3 space-y-2">
                  <div class="flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full bg-gray-800 border border-gray-600 shrink-0"></span>
                    <span class="text-xs font-semibold text-text-secondary">Dark Colors</span>
                    <span class="ml-auto text-xs text-text-muted tabular-nums">{{ uniqueColors.filter(c => c.is_dark).length }}</span>
                  </div>
                  <div class="flex flex-wrap gap-1.5 min-h-[32px]">
                    <button v-for="c in uniqueColors.filter(c => c.is_dark)" :key="c.name"
                      type="button"
                      @click="setColorDark(c.name, false)"
                      title="Move to Light Colors"
                      class="group flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full border border-card-border bg-white hover:border-orange-300 hover:bg-orange-50 transition-colors text-xs cursor-pointer">
                      <span class="w-3 h-3 rounded-full border border-gray-300 shrink-0"
                        :style="c.hex ? `background-color:${c.hex}` : 'background:#9ca3af'"></span>
                      <span class="text-text-primary">{{ c.name }}</span>
                      <span class="text-gray-300 group-hover:text-orange-400 transition-colors text-[9px] leading-none">→</span>
                    </button>
                    <span v-if="!uniqueColors.filter(c => c.is_dark).length"
                      class="text-xs text-text-muted italic self-center">None assigned</span>
                  </div>
                </div>

                <!-- Light Colors card -->
                <div class="p-3 space-y-2">
                  <div class="flex items-center gap-2">
                    <span class="w-3 h-3 rounded-full bg-white border border-gray-300 shrink-0"></span>
                    <span class="text-xs font-semibold text-text-secondary">Light Colors</span>
                    <span class="ml-auto text-xs text-text-muted tabular-nums">{{ uniqueColors.filter(c => !c.is_dark).length }}</span>
                  </div>
                  <div class="flex flex-wrap gap-1.5 min-h-[32px]">
                    <button v-for="c in uniqueColors.filter(c => !c.is_dark)" :key="c.name"
                      type="button"
                      @click="setColorDark(c.name, true)"
                      title="Move to Dark Colors"
                      class="group flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-full border border-card-border bg-white hover:border-blue-300 hover:bg-blue-50 transition-colors text-xs cursor-pointer">
                      <span class="text-gray-300 group-hover:text-blue-400 transition-colors text-[9px] leading-none">←</span>
                      <span class="w-3 h-3 rounded-full border border-gray-300 shrink-0"
                        :style="c.hex ? `background-color:${c.hex}` : 'background:#9ca3af'"></span>
                      <span class="text-text-primary">{{ c.name }}</span>
                    </button>
                    <span v-if="!uniqueColors.filter(c => !c.is_dark).length"
                      class="text-xs text-text-muted italic self-center">None assigned</span>
                  </div>
                </div>

              </div>
            </div>

            <!-- Search / filter -->
            <div class="flex items-center gap-2">
              <div class="relative flex-1">
                <svg class="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-muted pointer-events-none"
                  viewBox="0 0 20 20" fill="currentColor">
                  <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/>
                </svg>
                <input v-model="varSearch" type="text" placeholder="Filter by size or color…"
                  class="w-full rounded-lg border border-card-border pl-8 pr-3 py-1.5 text-sm" />
              </div>
              <button v-if="varSearch" @click="varSearch = ''"
                class="text-xs text-text-muted hover:text-text-primary px-2 py-1.5 rounded-lg border border-card-border">
                Clear
              </button>
              <span v-if="varSearch" class="text-xs text-text-muted shrink-0">
                {{ sortedVariants.length }} / {{ existingVariants.length }}
              </span>
            </div>

            <div v-if="varLoad" class="space-y-2">
              <div v-for="i in 5" :key="i" class="h-10 rounded-lg animate-pulse bg-gray-100" />
            </div>

            <div v-else>
              <!-- Existing variants table -->
              <div v-if="localVariants.length" class="rounded-xl border border-card-border overflow-hidden">
                <table class="w-full text-sm">
                  <thead class="bg-sidebar-bg text-xs text-text-secondary">
                    <tr>
                      <th v-if="role !== 'superadmin'" class="px-3 py-2 w-8">
                        <input type="checkbox" :checked="allVarsSelected" @change="toggleAllVars" class="accent-accent" />
                      </th>
                      <th class="text-left px-3 py-2">{{ v1Label }}</th>
                      <th class="text-left px-3 py-2">{{ v2Label }}</th>
                      <th class="text-right px-3 py-2">Price</th>
                      <th class="text-right px-3 py-2">Weight / Dims</th>
                      <th class="text-center px-3 py-2">Dark</th>
                      <th class="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-card-border">
                    <template v-for="v in sortedVariants" :key="v.id">
                      <!-- View row -->
                      <tr v-if="editVid !== v.id"
                        :class="[
                          showBulkDims && varSel[v.id] ? 'bg-blue-50/40' : 'hover:bg-sidebar-bg/40',
                          !v.is_active && role !== 'superadmin' ? 'opacity-50' : '',
                        ]">
                        <td v-if="role !== 'superadmin'" class="px-3 py-2">
                          <input type="checkbox" :checked="varSel[v.id]"
                            @change="varSel = { ...varSel, [v.id]: !varSel[v.id] }" class="accent-accent" />
                        </td>
                        <td class="px-3 py-2 font-medium">{{ v.size || '—' }}</td>
                        <td class="px-3 py-2 text-text-secondary">{{ v.color || '—' }}</td>
                        <td class="px-3 py-2 text-right">${{ Number(role === 'superadmin' ? (v.price ?? v.cost) : v.cost).toFixed(2) }}</td>
                        <td class="px-3 py-2 text-right text-text-secondary">
                          {{ v.weight_oz ? v.weight_oz + ' oz' : '—' }}
                          <div v-if="+v.dim_length_in > 0" class="text-[10px] text-text-muted leading-tight">
                            {{ v.dim_length_in }}×{{ v.dim_width_in }}×{{ v.dim_height_base_in }}"
                          </div>
                        </td>
                        <td class="px-3 py-2 text-center text-xs" :class="v.color ? (v.is_dark ? 'text-text-primary' : 'text-text-muted') : 'text-text-muted'">{{ v.color ? (v.is_dark ? 'Dark' : 'Light') : '—' }}</td>
                        <td class="px-3 py-2">
                          <div class="flex gap-2 justify-end items-center">
                            <button v-if="role !== 'superadmin'" @click="toggleActive(v)"
                              class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none"
                              :class="v.is_active ? 'bg-emerald-500' : 'bg-gray-200'">
                              <span class="pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transition duration-200 ease-in-out"
                                :class="v.is_active ? 'translate-x-4' : 'translate-x-0'" />
                            </button>
                            <button @click="startEditV(v)" class="text-xs text-accent hover:underline">Edit</button>
                            <button @click="deleteV(v)" class="text-xs text-red-500 hover:text-red-700">Remove</button>
                          </div>
                        </td>
                      </tr>
                      <!-- Inline edit row -->
                      <tr v-else class="bg-accent-light/20">
                        <td v-if="role !== 'superadmin'" class="px-3 py-1.5"></td>
                        <td class="px-3 py-1.5 font-medium text-text-muted">{{ v.size || '—' }}</td>
                        <td class="px-3 py-1.5 text-text-muted">{{ v.color || '—' }}</td>
                        <td class="px-2 py-1.5">
                          <input v-model="editVData.price" type="number" step="0.01" min="0"
                            class="w-24 rounded border border-card-border px-2 py-1 text-sm" />
                        </td>
                        <td class="px-2 py-1.5">
                          <input v-model="editVData.weight" type="number" step="0.01" min="0"
                            class="w-20 rounded border border-card-border px-2 py-1 text-sm" />
                        </td>
                        <td class="px-3 py-1.5 text-center text-xs" :class="v.color ? (v.is_dark ? 'text-text-primary' : 'text-text-muted') : 'text-text-muted'">
                          {{ v.color ? (v.is_dark ? 'Dark' : 'Light') : '—' }}
                        </td>
                        <td class="px-3 py-1.5">
                          <div class="flex gap-2 justify-end">
                            <button @click="saveEditV(v)"
                              class="text-xs text-emerald-600 hover:underline">Save</button>
                            <button @click="cancelEditV" class="text-xs text-text-muted hover:text-text-primary">Cancel</button>
                          </div>
                        </td>
                      </tr>
                      <!-- Dimension sub-row (PC only) -->
                      <tr v-if="editVid === v.id && role !== 'superadmin'" class="bg-blue-50/60">
                        <td :colspan="role !== 'superadmin' ? 7 : 6" class="px-4 py-3 space-y-3">
                          <!-- Dims fields -->
                          <div class="flex flex-wrap gap-3 items-end">
                            <span class="text-xs font-medium text-text-secondary">Package Dimensions (in)</span>
                            <div>
                              <label class="text-[10px] text-text-muted block mb-0.5">L</label>
                              <input v-model="editVData.dim_l" type="number" step="0.1" min="0" placeholder="12"
                                class="w-16 rounded border border-card-border px-2 py-1 text-sm bg-white" />
                            </div>
                            <div>
                              <label class="text-[10px] text-text-muted block mb-0.5">W</label>
                              <input v-model="editVData.dim_w" type="number" step="0.1" min="0" placeholder="10"
                                class="w-16 rounded border border-card-border px-2 py-1 text-sm bg-white" />
                            </div>
                            <div>
                              <label class="text-[10px] text-text-muted block mb-0.5">H (1 unit)</label>
                              <input v-model="editVData.dim_h" type="number" step="0.1" min="0" placeholder="2"
                                class="w-16 rounded border border-card-border px-2 py-1 text-sm bg-white" />
                            </div>
                            <div>
                              <label class="text-[10px] text-text-muted block mb-0.5">+H"</label>
                              <input v-model="editVData.dim_h_per" type="number" step="0.05" min="0" placeholder="0"
                                class="w-16 rounded border border-card-border px-2 py-1 text-sm bg-white" />
                            </div>
                            <div class="flex items-end gap-1">
                              <div>
                                <label class="text-[10px] text-text-muted block mb-0.5">per</label>
                                <input v-model.number="editVData.dim_h_step" type="number" step="1" min="1" placeholder="1"
                                  class="w-12 rounded border border-card-border px-2 py-1 text-sm bg-white" />
                              </div>
                              <span class="text-[11px] text-text-muted pb-1.5">items</span>
                            </div>
                            <label class="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                              <input type="checkbox" v-model="editVData.is_stackable" class="accent-accent" />
                              Stackable
                            </label>
                            <button @click="copyDimsToAll(v.id)"
                              class="text-xs text-accent hover:underline ml-auto">
                              Copy to all variants
                            </button>
                          </div>

                          <!-- Quantity-based rules -->
                          <div class="border-t border-blue-100 pt-2">
                            <div class="flex items-center justify-between mb-2">
                              <span class="text-xs font-medium text-text-secondary">Qty-Based Dimension Rules</span>
                              <button
                                @click="newRuleForm = newRuleForm ? null : { qty_min: 1, qty_max: '', length_in: '', width_in: '', height_in: '' }"
                                class="text-xs text-accent hover:underline">
                                {{ newRuleForm ? 'Cancel' : '+ Add Rule' }}
                              </button>
                            </div>

                            <!-- Existing rules -->
                            <div v-if="dimRulesMap[v.id]?.length" class="flex flex-wrap gap-1.5 mb-2">
                              <div v-for="rule in dimRulesMap[v.id]" :key="rule.id"
                                class="flex items-center gap-2 text-xs bg-white rounded-lg border border-blue-100 px-2.5 py-1">
                                <span class="text-text-muted">qty {{ rule.qty_min }}–{{ rule.qty_max ?? '∞' }}:</span>
                                <span class="font-medium">{{ rule.length_in }}×{{ rule.width_in }}×{{ rule.height_in }}"</span>
                                <button @click="deleteDimRule(v.id, rule.id)" class="text-red-400 hover:text-red-600 leading-none">✕</button>
                              </div>
                            </div>
                            <div v-else-if="dimRulesMap[v.id] !== undefined"
                              class="text-xs text-text-muted mb-2">No quantity rules — formula will be used.</div>
                            <div v-else class="text-xs text-text-muted mb-2 animate-pulse">Loading…</div>

                            <!-- New rule form -->
                            <div v-if="newRuleForm" class="flex flex-wrap gap-2 items-end p-2 bg-white rounded-lg border border-card-border">
                              <div>
                                <label class="text-[10px] text-text-muted block mb-0.5">Qty min</label>
                                <input v-model.number="newRuleForm.qty_min" type="number" min="1"
                                  class="w-14 rounded border border-card-border px-2 py-1 text-sm" />
                              </div>
                              <div>
                                <label class="text-[10px] text-text-muted block mb-0.5">Qty max (blank=∞)</label>
                                <input v-model.number="newRuleForm.qty_max" type="number" min="1" placeholder="∞"
                                  class="w-20 rounded border border-card-border px-2 py-1 text-sm" />
                              </div>
                              <div>
                                <label class="text-[10px] text-text-muted block mb-0.5">L"</label>
                                <input v-model="newRuleForm.length_in" type="number" step="0.1" min="0"
                                  class="w-14 rounded border border-card-border px-2 py-1 text-sm" />
                              </div>
                              <div>
                                <label class="text-[10px] text-text-muted block mb-0.5">W"</label>
                                <input v-model="newRuleForm.width_in" type="number" step="0.1" min="0"
                                  class="w-14 rounded border border-card-border px-2 py-1 text-sm" />
                              </div>
                              <div>
                                <label class="text-[10px] text-text-muted block mb-0.5">H"</label>
                                <input v-model="newRuleForm.height_in" type="number" step="0.1" min="0"
                                  class="w-14 rounded border border-card-border px-2 py-1 text-sm" />
                              </div>
                              <button @click="addDimRule(v.id)" :disabled="savingRule"
                                class="btn-primary text-xs py-1 px-3 disabled:opacity-50">
                                {{ savingRule ? '…' : 'Add' }}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </template>
                  </tbody>
                </table>
              </div>
              <div v-else-if="!varLoad" class="text-sm text-center text-text-muted py-8">No variants yet.</div>

              <!-- Add variant section -->
              <div class="mt-3 space-y-2">
                <!-- Step 1: mode menu -->
                <template v-if="!addVMode">
                  <div v-if="showAddMenu" class="p-3 rounded-xl border border-card-border space-y-2">
                    <div class="text-xs text-text-muted">
                      Adding a <strong>{{ v2Label }}</strong> creates one variant per existing {{ v1Label }}.
                      Adding a <strong>{{ v1Label }}</strong> creates one variant per existing {{ v2Label }}.
                    </div>
                    <div class="flex gap-2">
                      <button @click="selectAddMode('v2')" class="flex-1 btn-secondary text-sm py-2">
                        + New {{ v2Label }}
                      </button>
                      <button @click="selectAddMode('v1')" class="flex-1 btn-secondary text-sm py-2">
                        + New {{ v1Label }}
                      </button>
                      <button @click="showAddMenu = false"
                        class="text-xs text-text-muted hover:text-text-primary px-3">Cancel</button>
                    </div>
                  </div>
                  <button v-else @click="startAddV" class="btn-secondary text-sm w-full">+ Add Variant</button>
                </template>

                <!-- Step 2: add form -->
                <div v-if="addVMode && newVData" class="p-4 rounded-xl border border-card-border space-y-3">
                  <div class="text-xs font-medium text-text-secondary">
                    Add New {{ addVMode === 'v2' ? v2Label : v1Label }}
                    <span class="text-text-muted font-normal ml-1">
                      — will create
                      {{ addVMode === 'v2'
                        ? ([...new Set(localVariants.map(v => v.size))].length || 1)
                        : ([...new Set(localVariants.map(v => v.color))].length || 1)
                      }}
                      variant(s)
                    </span>
                  </div>
                  <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div class="col-span-2 sm:col-span-1">
                      <label class="text-sm text-text-muted block mb-1">{{ addVMode === 'v2' ? v2Label : v1Label }} *</label>
                      <input v-model="newVData.value" type="text"
                        :placeholder="addVMode === 'v2' ? v2Label : v1Label"
                        class="w-full rounded-lg border border-card-border px-2 py-1.5 text-sm" autofocus />
                    </div>
                    <div>
                      <label class="text-sm text-text-muted block mb-1">Price ($) *</label>
                      <input v-model="newVData.price" type="number" step="0.01" min="0"
                        class="w-full rounded-lg border border-card-border px-2 py-1.5 text-sm" />
                    </div>
                    <div>
                      <label class="text-sm text-text-muted block mb-1">Weight (oz)</label>
                      <input v-model="newVData.weight" type="number" step="0.01" min="0"
                        class="w-full rounded-lg border border-card-border px-2 py-1.5 text-sm" />
                    </div>
                  </div>
                  <label class="flex items-center gap-2 text-sm cursor-pointer select-none">
                    <input type="checkbox" v-model="newVData.is_dark" class="accent-accent" />
                    <span class="text-xs text-text-secondary">Dark garment</span>
                  </label>
                  <div v-if="role !== 'superadmin'" class="flex flex-wrap gap-3 items-end pt-1 border-t border-card-border">
                    <span class="text-xs text-text-muted w-full">Package Dims (in)</span>
                    <div v-for="(lbl, key) in { dim_l: 'L', dim_w: 'W', dim_h: 'H', dim_h_per: '+H/unit' }" :key="key">
                      <label class="text-[10px] text-text-muted block mb-0.5">{{ lbl }}</label>
                      <input v-model="newVData[key]" type="number" step="0.1" min="0"
                        class="w-16 rounded-lg border border-card-border px-2 py-1 text-sm" />
                    </div>
                    <label class="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                      <input type="checkbox" v-model="newVData.is_stackable" class="accent-accent" />
                      Stackable
                    </label>
                  </div>
                  <div class="flex gap-2">
                    <button @click="cancelAddV" class="btn-secondary text-xs flex-1">Cancel</button>
                    <button @click="submitNewV" :disabled="addingV || !newVData.price || !newVData.value"
                      class="btn-primary text-xs flex-1 disabled:opacity-50">
                      {{ addingV ? 'Adding…' : `Add ${addVMode === 'v2' ? v2Label : v1Label}` }}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ── EDIT: Print Areas tab ────────────────────────────────────── -->
          <div v-if="mode === 'edit' && editTab === 'print_areas' && role !== 'superadmin'" class="p-6 space-y-4">
            <div v-if="printAreaErr" class="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{{ printAreaErr }}</div>

            <!-- Existing list -->
            <div v-if="printAreas.length" class="flex flex-wrap gap-3">
              <div v-for="area in printAreas" :key="area.id"
                class="flex flex-col items-center gap-1.5 rounded-xl border border-card-border bg-sidebar-bg p-2 w-24 relative group">
                <!-- Icon preview / upload trigger -->
                <label class="relative cursor-pointer w-16 h-16 shrink-0" :title="area.icon ? 'Change icon' : 'Upload icon'">
                  <img v-if="area.icon" :src="area.icon" :alt="area.name"
                    class="w-16 h-16 object-contain rounded-lg" />
                  <div v-else
                    class="w-16 h-16 rounded-lg bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-accent hover:text-accent transition">
                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 5v14M5 12h14" stroke-linecap="round"/>
                    </svg>
                  </div>
                  <!-- Hover overlay on existing icon -->
                  <div v-if="area.icon"
                    class="absolute inset-0 rounded-lg bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg class="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M12 5v14M5 12h14" stroke-linecap="round"/>
                    </svg>
                  </div>
                  <input type="file" accept="image/*" class="hidden"
                    @change="e => uploadPrintAreaIcon(area, e.target.files[0])" />
                </label>
                <span class="text-xs font-semibold text-text-primary text-center leading-tight w-full truncate px-0.5">{{ area.name }}</span>
                <button v-if="area.size_from" type="button" @click="detachSizes(area)"
                  :title="'Uses the sizes of ' + areaById(area.size_from)?.name + ' — click to give it its own sizes'"
                  class="text-[10px] leading-none rounded-full px-2 py-1 border border-card-border text-text-secondary hover:border-accent hover:text-accent transition truncate max-w-full">
                  = {{ areaById(area.size_from)?.name }}
                </button>
                <button v-else type="button" @click="toggleSizeMode(area)"
                  :title="isBox(area) ? 'Sized by width and height — click to use one max dimension' : 'Sized by one max dimension — click to use width and height'"
                  class="text-[10px] leading-none rounded-full px-2 py-1 border border-card-border text-text-secondary hover:border-accent hover:text-accent transition">
                  {{ isBox(area) ? 'W × H' : 'Max dim' }}
                </button>
                <button @click="removePrintArea(area)" title="Remove this print area"
                  class="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center opacity-70 hover:opacity-100 transition-opacity shadow">✕</button>
              </div>
            </div>
            <div v-else class="text-sm text-text-muted text-center py-4">No print areas defined yet.</div>

            <!-- Size × Print Area dimension grid -->
            <template v-if="printAreas.length && productSizes.length">
              <div class="flex items-center justify-between">
                <div class="text-xs font-medium text-text-secondary">
                  Print size per garment size (inches)
                  <span class="block font-normal text-text-muted">Max dim: the design's longer side. W × H: the design grows until it reaches the width or the height.</span>
                </div>
                <button @click="saveDimSpecs" :disabled="dimsSaving"
                  class="btn-primary text-xs py-1 px-3 disabled:opacity-50">
                  {{ dimsSaving ? 'Saving…' : 'Save' }}
                </button>
              </div>
              <div v-if="dimsErr" class="text-xs text-red-600">{{ dimsErr }}</div>
              <div class="overflow-x-auto rounded-xl border border-card-border">
                <table class="text-sm w-full">
                  <thead class="bg-sidebar-bg text-xs text-text-secondary">
                    <tr>
                      <th class="text-left px-3 py-2 sticky left-0 bg-sidebar-bg z-10 min-w-[56px]">Size</th>
                      <th v-for="area in gridAreas" :key="area.id"
                        :colspan="isBox(area) ? 2 : 1"
                        class="text-center px-2 py-2" :class="isBox(area) ? 'min-w-[150px]' : 'min-w-[72px]'">
                        {{ groupLabel(area) }}
                        <span v-if="isBox(area)" class="block font-normal text-text-muted">width × height</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-card-border">
                    <tr v-for="size in productSizes" :key="size" class="hover:bg-sidebar-bg/30">
                      <td class="px-3 py-1.5 font-medium sticky left-0 bg-white z-10 text-text-secondary text-xs">{{ size }}</td>
                      <template v-for="area in gridAreas" :key="area.id">
                        <template v-if="isBox(area)">
                          <td class="px-1.5 py-1">
                            <input v-model="dimSpecs[`${area.id}_${size}_w`]"
                              type="number" step="0.1" min="0" placeholder="W"
                              class="w-16 rounded border border-card-border px-2 py-1 text-xs text-center focus:outline-none focus:border-accent" />
                          </td>
                          <td class="px-1.5 py-1">
                            <input v-model="dimSpecs[`${area.id}_${size}_h`]"
                              type="number" step="0.1" min="0" placeholder="H"
                              class="w-16 rounded border border-card-border px-2 py-1 text-xs text-center focus:outline-none focus:border-accent" />
                          </td>
                        </template>
                        <td v-else class="px-1.5 py-1">
                          <input v-model="dimSpecs[`${area.id}_${size}`]"
                            type="number" step="0.1" min="0" placeholder="—"
                            class="w-16 rounded border border-card-border px-2 py-1 text-xs text-center focus:outline-none focus:border-accent" />
                        </td>
                      </template>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>

            <!-- Add form -->
            <div v-if="newAreaForm" class="flex gap-2 items-center">
              <input v-model="newAreaForm.name" type="text" placeholder="e.g. Front, Back, Left Sleeve"
                class="flex-1 rounded-lg border border-card-border px-3 py-2 text-sm" autofocus
                @keyup.enter="addPrintArea" @keyup.escape="newAreaForm = null" />
              <select v-if="gridAreas.length" v-model="newAreaForm.size_from"
                class="rounded-lg border border-card-border px-2 py-2 text-sm text-text-secondary"
                title="Optional: use the same sizes as another area (e.g. right sleeve = left sleeve)">
                <option :value="null">Own sizes</option>
                <option v-for="a in gridAreas" :key="a.id" :value="a.id">Same sizes as {{ a.name }}</option>
              </select>
              <button @click="addPrintArea" :disabled="savingArea || !newAreaForm.name"
                class="btn-primary text-sm px-4 disabled:opacity-50">
                {{ savingArea ? '…' : 'Add' }}
              </button>
              <button @click="newAreaForm = null" class="btn-secondary text-sm px-3">Cancel</button>
            </div>
            <button v-else @click="newAreaForm = { name: '', size_from: null }"
              class="btn-secondary text-sm w-full">+ Add Print Area</button>
          </div>

        </div><!-- /body -->

        <!-- Footer -->
        <div class="px-6 py-4 border-t border-card-border flex gap-3 shrink-0">

          <!-- Create mode -->
          <template v-if="mode === 'create'">
            <button @click="step > 1 ? step-- : emit('close')" class="btn-secondary flex-1 text-sm">
              {{ step > 1 ? '← Back' : 'Cancel' }}
            </button>
            <button v-if="step < 3"
              @click="step === 2 ? goStep3() : step++"
              :disabled="step === 1 && !form.name"
              class="btn-primary flex-1 text-sm disabled:opacity-50">
              Next →
            </button>
            <button v-else
              @click="saveCreate"
              :disabled="saving"
              class="btn-primary flex-1 text-sm disabled:opacity-50">
              {{ saving ? 'Saving…' : 'Save Product' }}
            </button>
          </template>

          <!-- Edit mode -->
          <template v-else>
            <button @click="emit('close')" class="btn-secondary flex-1 text-sm">Close</button>
            <button v-if="editTab === 'info'"
              @click="saveInfo" :disabled="saving || !form.name"
              class="btn-primary flex-1 text-sm disabled:opacity-50">
              {{ saving ? 'Saving…' : 'Save Changes' }}
            </button>
            <template v-if="editTab === 'variants' && hasUnsavedVariants">
              <button @click="discardVariantChanges"
                class="btn-secondary text-sm px-4 text-red-500 hover:text-red-600 border-red-200">
                Discard
              </button>
              <button @click="saveAllVariants" :disabled="savingAllVariants"
                class="btn-primary flex-1 text-sm disabled:opacity-50">
                {{ savingAllVariants ? 'Saving…' : `Save Changes (${changedVariantIds.length})` }}
              </button>
            </template>
          </template>

        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.input {
  @apply w-full rounded-lg border border-card-border px-3 py-2 text-sm;
}
</style>
