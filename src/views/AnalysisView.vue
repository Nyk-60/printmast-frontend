<script setup>
const cards = [
  { label: 'Revenue (30d)', value: '$4,820.40' },
  { label: 'Avg Order Value', value: '$18.32' },
  { label: 'Fulfillment Avg', value: '2.4 days' },
  { label: 'Return Rate', value: '0.6%' }
]
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-bold">Analysis</h1>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div v-for="c in cards" :key="c.label" class="card p-5">
        <div class="text-sm text-text-secondary">{{ c.label }}</div>
        <div class="text-2xl font-bold mt-2">{{ c.value }}</div>
      </div>
    </div>
    <div class="card p-5 h-80 flex items-center justify-center text-text-muted">
      Chart placeholder
    </div>
  </div>
</template>
