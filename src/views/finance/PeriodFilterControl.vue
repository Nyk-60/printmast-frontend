<script setup>
defineProps({ filter: { type: Object, required: true } })
</script>

<template>
  <div class="card p-4 flex flex-wrap items-end gap-4">
    <div class="flex gap-1 bg-sidebar-bg rounded-lg p-1">
      <button type="button" @click="filter.mode.value = 'month'"
        :class="filter.mode.value === 'month' ? 'bg-white shadow text-accent-dark' : 'text-text-secondary'"
        class="px-3 py-1.5 rounded-md text-xs font-semibold transition">
        Month
      </button>
      <button type="button" @click="filter.mode.value = 'range'"
        :class="filter.mode.value === 'range' ? 'bg-white shadow text-accent-dark' : 'text-text-secondary'"
        class="px-3 py-1.5 rounded-md text-xs font-semibold transition">
        Custom Range
      </button>
    </div>

    <template v-if="filter.mode.value === 'month'">
      <div>
        <label class="text-xs text-text-secondary block mb-1">Year</label>
        <select v-model="filter.year.value" class="rounded-lg border border-card-border px-3 py-2 text-sm">
          <option v-for="y in filter.years.value" :key="y" :value="y">{{ y }}</option>
        </select>
      </div>
      <div>
        <label class="text-xs text-text-secondary block mb-1">Month</label>
        <select v-model="filter.month.value" class="rounded-lg border border-card-border px-3 py-2 text-sm">
          <option v-for="m in filter.months" :key="m.value" :value="m.value">{{ m.label }}</option>
        </select>
      </div>
    </template>
    <template v-else>
      <div>
        <label class="text-xs text-text-secondary block mb-1">From</label>
        <input v-model="filter.rangeFrom.value" type="date"
          class="rounded-lg border border-card-border px-3 py-2 text-sm" />
      </div>
      <div>
        <label class="text-xs text-text-secondary block mb-1">To</label>
        <input v-model="filter.rangeTo.value" type="date"
          class="rounded-lg border border-card-border px-3 py-2 text-sm" />
      </div>
    </template>

    <div class="flex-1"></div>
    <slot />
  </div>
</template>
