export const roleOptions = [
  'customer',
  'mechanics personnel',
  'inventory personnel',
  'cashier personnel',
  'front desk personnel',
  'admin',
  'superadmin',
]
export const serviceStatusOptions = ['Pending', 'In Progress', 'Completed', 'Cancelled']
export const technicianStatusOptions = ['Online', 'Busy', 'Offline']
export const inventoryStatusOptions = ['In Stock', 'Low Stock', 'Out of Stock']

export const fallbackTechnicians = [
  {
    id: 'fallback-marcus',
    name: 'Marcus Thorne',
    specialty: 'Master Specialist',
    activeJobs: 3,
    capacity: 4,
    status: 'Online',
  },
  {
    id: 'fallback-elena',
    name: 'Elena Vance',
    specialty: 'Engine Tuning',
    activeJobs: 2,
    capacity: 4,
    status: 'Online',
  },
  {
    id: 'fallback-jin',
    name: 'Jin Sakai',
    specialty: 'Systems Diagnostics',
    activeJobs: 4,
    capacity: 4,
    status: 'Busy',
  },
]

export const normalizeText = (value = '') => String(value).trim().toLowerCase()

export const formatCurrency = (value) => {
  const parsedValue = Number(value || 0)

  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(parsedValue) ? parsedValue : 0)
}

export const formatDate = (value) => {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null

  if (!date || Number.isNaN(date.getTime())) {
    return 'No timestamp'
  }

  return date.toLocaleString('en-PH', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export const getStatusTone = (status = '') => {
  const normalizedStatus = normalizeText(status)

  if (['completed', 'online', 'active', 'in stock', 'approved'].includes(normalizedStatus)) return 'emerald'
  if (['pending', 'busy', 'low stock', 'submitted', 'reviewing'].includes(normalizedStatus)) return 'amber'
  if (['in progress', 'out of stock', 'rejected'].includes(normalizedStatus)) return 'red'

  return 'slate'
}

export const getStatusClasses = (status = '') => {
  const tone = getStatusTone(status)

  if (tone === 'emerald') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
  if (tone === 'amber') return 'text-amber-400 bg-amber-500/10 border-amber-500/20'
  if (tone === 'red') return 'text-[#ff8d8d] bg-[#e10100]/10 border-[#e10100]/20'

  return 'text-slate-300 bg-slate-500/10 border-slate-500/20'
}

export const buildChartBars = (items) => {
  if (!items.length) return [20, 30, 45, 55, 40, 60, 80]

  const buckets = [0, 0, 0, 0, 0, 0, 0]

  items.slice(0, 21).forEach((_, index) => {
    buckets[index % buckets.length] += 1
  })

  const maxBucket = Math.max(...buckets, 1)

  return buckets.map((bucket) => Math.max(14, Math.round((bucket / maxBucket) * 100)))
}

export const BULK_PURCHASE_THRESHOLD = 5

export const isServiceSaleItem = (entry = {}) => {
  const id = String(entry?.id || '').trim().toLowerCase()
  const sku = String(entry?.sku || '').trim().toUpperCase()
  const type = String(entry?.type || '').trim().toLowerCase()
  return type === 'service' || id.startsWith('service-') || sku === 'SERVICE'
}

/**
 * Normalizes and summarizes purchased items (spare parts and services)
 * for a POS transaction log or audit entry.
 */
export const summarizeSaleItems = (rawItems = [], fallbackTotalQty = 0, recordedSubtotal = null) => {
  const items = Array.isArray(rawItems)
    ? rawItems
        .filter(Boolean)
        .map((entry) => {
          const qty = Number(entry.qty || 0)
          const unitPrice = Number(entry.unitPrice || 0)
          const subtotal =
            entry.subtotal !== undefined && entry.subtotal !== null
              ? Number(entry.subtotal)
              : Number((qty * unitPrice).toFixed(2))
          const type = isServiceSaleItem(entry) ? 'service' : 'product'
          return {
            id: String(entry.id || ''),
            name: String(entry.name || entry.item || 'Unnamed Item'),
            sku: String(entry.sku || ''),
            type,
            qty,
            unitPrice,
            subtotal,
          }
        })
    : []

  const productItems = items.filter((item) => item.type !== 'service')
  const serviceItems = items.filter((item) => item.type === 'service')

  const partsSubtotal = Number(
    productItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0).toFixed(2),
  )
  const recordedServiceSubtotal = Number(
    serviceItems.reduce((sum, item) => sum + Number(item.subtotal || 0), 0).toFixed(2),
  )
  const itemsSubtotal = Number((partsSubtotal + recordedServiceSubtotal).toFixed(2))
  const expectedSubtotal =
    recordedSubtotal !== null && recordedSubtotal !== undefined ? Number(recordedSubtotal) : null
  const legacyUnitemizedService =
    recordedServiceSubtotal === 0 &&
    itemsSubtotal > 0 &&
    expectedSubtotal !== null &&
    Number.isFinite(expectedSubtotal) &&
    expectedSubtotal - itemsSubtotal > 0.01
      ? Number((expectedSubtotal - itemsSubtotal).toFixed(2))
      : 0

  const serviceSubtotal = Number((recordedServiceSubtotal + legacyUnitemizedService).toFixed(2))

  const computedQty = items.reduce((sum, item) => sum + Number(item.qty || 0), 0)
  const partsQuantity = productItems.reduce((sum, item) => sum + Number(item.qty || 0), 0)
  const serviceQuantity = serviceItems.reduce((sum, item) => sum + Number(item.qty || 0), 0)
  const totalQuantity = computedQty > 0 ? computedQty : Number(fallbackTotalQty || 0)
  const isBulk =
    partsQuantity >= BULK_PURCHASE_THRESHOLD ||
    productItems.some((item) => Number(item.qty || 0) >= BULK_PURCHASE_THRESHOLD)

  const hasServices = serviceItems.length > 0 || legacyUnitemizedService > 0
  const hasParts = productItems.length > 0

  const primaryItem = items[0]
  const extraCount = Math.max(0, items.length - 1)
  let summaryLabel = primaryItem
    ? `${primaryItem.name} (×${primaryItem.qty})${extraCount > 0 ? ` + ${extraCount} more` : ''}`
    : 'No item details recorded'
  if (legacyUnitemizedService > 0 && primaryItem) {
    summaryLabel = `${summaryLabel} + Service`
  }

  const searchableText = items
    .map((item) => `${item.name} ${item.sku} ${item.type}`)
    .concat(legacyUnitemizedService > 0 ? ['service'] : [])
    .join(' ')

  return {
    items,
    itemCount: items.length,
    totalQuantity,
    partsQuantity,
    serviceQuantity,
    partsSubtotal,
    serviceSubtotal,
    legacyUnitemizedService,
    hasParts,
    hasServices,
    isBulk,
    summaryLabel,
    searchableText,
  }
}
