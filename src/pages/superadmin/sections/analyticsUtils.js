/**
 * Analytics Utility Functions
 * Powers spare parts sales velocity, volume share, and ranking calculations.
 */

/**
 * Normalizes and aggregates most sold spare parts from transaction records,
 * excluding service and labor fees.
 */
export function computeTopSoldSpareParts(transactions = [], sortBy = 'units') {
  const partsMap = new Map()

  transactions.forEach((log) => {
    const items = Array.isArray(log.items) ? log.items : []
    items.forEach((entry) => {
      if (!entry) return
      const id = String(entry.id || entry.sku || entry.name || '').trim()
      const sku = String(entry.sku || '').trim()
      const name = String(entry.name || entry.item || 'Spare Part').trim()
      const isService =
        entry.type === 'service' ||
        id.startsWith('service-') ||
        sku.toUpperCase() === 'SERVICE'
      if (isService) return

      const qty = Number(entry.qty || 0)
      const unitPrice = Number(entry.unitPrice || 0)
      const subtotal =
        entry.subtotal !== undefined && entry.subtotal !== null
          ? Number(entry.subtotal)
          : Number((qty * unitPrice).toFixed(2))

      const key = (sku && sku !== '—' ? sku : id) || name
      const existing = partsMap.get(key) || {
        key,
        name,
        sku: sku && sku !== '—' ? sku : 'N/A',
        totalQty: 0,
        totalRevenue: 0,
        transactionCount: 0,
        unitPrice,
      }
      existing.totalQty += qty
      existing.totalRevenue += subtotal
      existing.transactionCount += 1
      if (unitPrice > 0) existing.unitPrice = unitPrice
      partsMap.set(key, existing)
    })
  })

  const list = Array.from(partsMap.values())
  return list.sort((a, b) => {
    if (sortBy === 'revenue') {
      return b.totalRevenue - a.totalRevenue
    }
    return b.totalQty - a.totalQty
  })
}

/**
 * Calculates volume market share relative to #1 best seller (0-100%)
 */
export function calculateVolumeShare(partQty, maxPartQty) {
  if (!maxPartQty || maxPartQty <= 0) return 0
  return Math.round((Number(partQty || 0) / Number(maxPartQty)) * 100)
}

/**
 * Calculates total units sold across all spare parts
 */
export function calculateTotalSparePartsUnits(partsList = []) {
  return partsList.reduce((sum, p) => sum + Number(p.totalQty || 0), 0)
}

/**
 * Calculates total gross revenue across all spare parts
 */
export function calculateTotalSparePartsRevenue(partsList = []) {
  return Number(partsList.reduce((sum, p) => sum + Number(p.totalRevenue || 0), 0).toFixed(2))
}
