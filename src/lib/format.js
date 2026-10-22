// Display helpers for dates (India: day-first, IST).
const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })
const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
})

export const formatDate = (iso) => (iso ? dateFmt.format(new Date(iso)) : '')
export const formatDateTime = (iso) => (iso ? dateTimeFmt.format(new Date(iso)) : '')
