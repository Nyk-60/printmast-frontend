<script setup>
const TABS = [
  { name: 'pc-shipping-ship-from', label: 'Ship-From Address' },
  { name: 'pc-shipping-pricing',   label: 'Pricing' },
  { name: 'pc-shipping-providers', label: 'Shipping Providers' },
  { name: 'pc-shipping-options',   label: 'Shipping Options' },
]
</script>

<template>
  <div class="space-y-6">
    <h1 class="text-2xl font-bold">Shipping Settings</h1>

    <div class="flex border-b border-card-border">
      <RouterLink v-for="tab in TABS" :key="tab.name" :to="{ name: tab.name }"
        class="px-5 py-2.5 text-sm font-semibold border-b-2 transition border-transparent text-text-secondary hover:text-text-primary"
        active-class="!border-accent !text-accent">
        {{ tab.label }}
      </RouterLink>
    </div>

    <RouterView />
  </div>
</template>
