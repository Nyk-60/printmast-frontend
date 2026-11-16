import { ref } from 'vue'

const isOpen = ref(false)
const options = ref({ title: '', message: '', confirmText: 'Confirm', cancelText: 'Cancel', danger: false })
let resolver = null

export function useConfirmState() {
  return { isOpen, options }
}

/**
 * Promise-based replacement for window.confirm() — styled like the app's own
 * modals instead of the browser's native dialog. Usage:
 *   if (!(await confirmDialog({ title: '...', message: '...', danger: true }))) return
 * A plain string is treated as { message: string }.
 */
export function confirmDialog(opts) {
  if (typeof opts === 'string') opts = { message: opts }
  options.value = {
    title: opts.title || 'Please confirm',
    message: opts.message || '',
    confirmText: opts.confirmText || (opts.danger ? 'Delete' : 'Confirm'),
    cancelText: opts.cancelText || 'Cancel',
    danger: opts.danger ?? false,
  }
  isOpen.value = true
  return new Promise((resolve) => {
    resolver = resolve
  })
}

export function _resolveConfirm(result) {
  isOpen.value = false
  if (resolver) {
    resolver(result)
    resolver = null
  }
}
