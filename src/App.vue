<script setup>
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()

onMounted(async () => {
  if (auth.accessToken && !auth.user) {
    await auth.fetchMe()
  }
})
</script>

<template>
  <RouterView />
</template>
