<script setup>
const guides = [
  { title: 'Getting Started with Printmast', minutes: 5 },
  { title: 'Matching Etsy Variants to Catalog', minutes: 8 },
  { title: 'Designing for Dark vs Light Garments', minutes: 12 },
  { title: 'Shipping Labels & ShipStation Integration', minutes: 7 }
]
</script>

<template>
  <div class="space-y-4">
    <h1 class="text-2xl font-bold">Education Portal</h1>
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      <article v-for="g in guides" :key="g.title" class="card p-5 hover:shadow-md transition cursor-pointer">
        <div class="text-xs text-accent-dark">Guide • {{ g.minutes }} min</div>
        <h3 class="mt-2 font-semibold">{{ g.title }}</h3>
      </article>
    </div>
  </div>
</template>
