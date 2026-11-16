<script setup>
import { useConfirmState, _resolveConfirm } from '@/composables/useConfirm'

const { isOpen, options } = useConfirmState()
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen"
      class="fixed inset-0 bg-black/40 flex items-center justify-center z-[100] p-4"
      @click.self="_resolveConfirm(false)">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <h3 class="font-bold text-lg text-text-primary">{{ options.title }}</h3>
        <p v-if="options.message" class="mt-2 text-sm text-text-secondary whitespace-pre-line leading-relaxed">
          {{ options.message }}
        </p>
        <div class="mt-6 flex justify-end gap-2">
          <button @click="_resolveConfirm(false)" class="btn-secondary text-sm">{{ options.cancelText }}</button>
          <button @click="_resolveConfirm(true)"
            class="text-sm font-semibold text-white rounded-lg px-4 py-2 transition"
            :class="options.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-accent hover:opacity-90'">
            {{ options.confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
