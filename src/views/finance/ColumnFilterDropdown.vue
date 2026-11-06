<script setup>
import { ref, computed, watch } from 'vue'

// Excel-style column filter: a funnel icon on a <th> that opens a checklist
// popover (search box + Select All/Clear + Apply/Cancel). `options` is an
// array of { key, label } — `key` is whatever opaque string identifies the
// value for filtering (the parent decides what it means); `modelValue` is
// the array of currently-applied keys.
const props = defineProps({
  options: { type: Array, default: () => [] }, // [{ key, label }]
  modelValue: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue'])

const open = ref(false)
const search = ref('')
const draft = ref([...props.modelValue])

watch(() => props.modelValue, (v) => { draft.value = [...v] })

const filteredOptions = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return props.options
  return props.options.filter((o) => o.label.toLowerCase().includes(q))
})

function toggle() {
  if (!open.value) { draft.value = [...props.modelValue]; search.value = '' }
  open.value = !open.value
}

function isChecked(key) {
  return draft.value.includes(key)
}

function toggleKey(key) {
  if (draft.value.includes(key)) draft.value = draft.value.filter((k) => k !== key)
  else draft.value = [...draft.value, key]
}

function selectAll() {
  draft.value = filteredOptions.value.map((o) => o.key)
}

function clearAll() {
  draft.value = []
}

function apply() {
  emit('update:modelValue', draft.value)
  open.value = false
}

function cancel() {
  open.value = false
}

const active = computed(() => props.modelValue.length > 0)
</script>

<template>
  <span class="relative inline-block">
    <button type="button" @click="toggle"
      class="ml-1 align-middle inline-flex items-center justify-center w-4 h-4 rounded"
      :class="active ? 'text-accent' : 'text-text-muted hover:text-text-secondary'">
      <svg viewBox="0 0 16 16" fill="currentColor" class="w-3 h-3">
        <path d="M1 2h14l-5.5 6.5v4.5l-3 2v-6.5L1 2z" />
      </svg>
    </button>

    <div v-if="open" class="fixed inset-0 z-40" @click="cancel"></div>

    <div v-if="open"
      class="absolute left-0 top-5 z-50 w-56 bg-white rounded-lg shadow-xl border border-card-border p-2 text-left normal-case font-normal">
      <input v-model="search" type="text" placeholder="Search…"
        class="w-full rounded border border-card-border px-2 py-1 text-xs mb-2" />
      <div class="flex gap-2 mb-2 text-[11px]">
        <button type="button" @click="selectAll" class="text-accent hover:underline">Select All</button>
        <button type="button" @click="clearAll" class="text-text-secondary hover:underline">Clear</button>
      </div>
      <div class="max-h-48 overflow-y-auto space-y-1">
        <label v-for="o in filteredOptions" :key="o.key" class="flex items-center gap-2 text-xs py-0.5 cursor-pointer">
          <input type="checkbox" class="accent-accent" :checked="isChecked(o.key)" @change="toggleKey(o.key)" />
          <span class="truncate">{{ o.label }}</span>
        </label>
        <div v-if="!filteredOptions.length" class="text-xs text-text-muted py-2 text-center">No values</div>
      </div>
      <div class="flex gap-2 mt-2 pt-2 border-t border-card-border">
        <button type="button" @click="apply" class="btn-primary text-xs py-1 px-2 flex-1">Apply</button>
        <button type="button" @click="cancel" class="btn-secondary text-xs py-1 px-2">Cancel</button>
      </div>
    </div>
  </span>
</template>
