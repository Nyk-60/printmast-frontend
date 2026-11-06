import { ref, computed } from 'vue'

// Shared "Month / Custom Range" period picker used by all 3 Finance tabs.
// Produces ISO `from`/`to` date strings either from a Year+Month pair
// (default) or from two explicit dates.
export function usePeriodFilter() {
  const now = new Date()
  const mode = ref('month') // 'month' | 'range'
  const year = ref(now.getFullYear())
  const month = ref(now.getMonth() + 1) // 1-12
  const rangeFrom = ref('')
  const rangeTo = ref('')

  const years = computed(() => {
    const y = now.getFullYear()
    return Array.from({ length: 6 }, (_, i) => y - i)
  })

  const months = [
    { value: 1, label: 'January' }, { value: 2, label: 'February' }, { value: 3, label: 'March' },
    { value: 4, label: 'April' }, { value: 5, label: 'May' }, { value: 6, label: 'June' },
    { value: 7, label: 'July' }, { value: 8, label: 'August' }, { value: 9, label: 'September' },
    { value: 10, label: 'October' }, { value: 11, label: 'November' }, { value: 12, label: 'December' },
  ]

  const from = computed(() => {
    if (mode.value === 'range') return rangeFrom.value
    return `${year.value}-${String(month.value).padStart(2, '0')}-01`
  })

  const to = computed(() => {
    if (mode.value === 'range') return rangeTo.value
    const lastDay = new Date(year.value, month.value, 0).getDate()
    return `${year.value}-${String(month.value).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
  })

  return { mode, year, month, years, months, rangeFrom, rangeTo, from, to }
}
