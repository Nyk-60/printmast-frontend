<script setup>
import { ref } from 'vue'

const designs = ref([
  { id: 1, sku: 'BC3001-NAVY-L', printArea: 'Front', dark: true, light: true, updated: '2026-05-01' },
  { id: 2, sku: 'G500-WHT-M',   printArea: 'Front', dark: false, light: true, updated: '2026-04-22' }
])
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-2xl font-bold">Design Library</h1>
      <button class="btn-primary">Upload Design</button>
    </div>

    <div class="card overflow-hidden">
      <table class="w-full text-sm">
        <thead class="bg-sidebar-bg text-text-secondary">
          <tr>
            <th class="text-left px-5 py-2">SKU</th>
            <th class="text-left px-5 py-2">Print Area</th>
            <th class="text-left px-5 py-2">Dark Variant</th>
            <th class="text-left px-5 py-2">Light Variant</th>
            <th class="text-left px-5 py-2">Updated</th>
            <th class="px-5 py-2"></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="d in designs" :key="d.id" class="border-t border-card-border">
            <td class="px-5 py-2 font-medium">{{ d.sku }}</td>
            <td class="px-5 py-2">{{ d.printArea }}</td>
            <td class="px-5 py-2">
              <span :class="d.dark ? 'badge-matched' : 'badge-unmatched'">{{ d.dark ? 'Set' : 'Missing' }}</span>
            </td>
            <td class="px-5 py-2">
              <span :class="d.light ? 'badge-matched' : 'badge-unmatched'">{{ d.light ? 'Set' : 'Missing' }}</span>
            </td>
            <td class="px-5 py-2">{{ d.updated }}</td>
            <td class="px-5 py-2 text-right">
              <button class="btn-ghost text-xs">Edit</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
