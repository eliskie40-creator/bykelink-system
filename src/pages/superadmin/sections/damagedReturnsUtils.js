/**
 * Damaged and Returned Products Utility Functions
 * Handles status validation, lifecycle transitions, restock rules, and loss valuation.
 */

export const VALID_DISPOSITIONS = [
  'pending_inspection',
  'returned_to_supplier',
  'written_off',
  'repaired_restocked',
  'disposed',
]

export const VALID_RETURN_CONDITIONS = [
  'defective_box',
  'scratched_dented',
  'factory_defect',
  'damaged_transit',
  'customer_return',
]

/**
 * Validates the intake payload for a damaged/returned product incident.
 */
export function validateDamagedReturnPayload(payload = {}) {
  const errors = []

  if (!payload.itemName || String(payload.itemName).trim() === '') {
    errors.push('Item name is required.')
  }

  const quantity = Number(payload.quantity)
  if (!Number.isFinite(quantity) || quantity <= 0) {
    errors.push('Quantity must be a positive integer greater than zero.')
  }

  if (payload.condition && !VALID_RETURN_CONDITIONS.includes(payload.condition)) {
    errors.push(`Invalid return condition: ${payload.condition}`)
  }

  if (payload.dispositionStatus && !VALID_DISPOSITIONS.includes(payload.dispositionStatus)) {
    errors.push(`Invalid disposition status: ${payload.dispositionStatus}`)
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Determines whether inventory stock should be restored based on disposition transition.
 * Only triggers if the new disposition is 'repaired_restocked', the item was originally deducted,
 * and it has not already been restored.
 */
export function shouldRestoreStockOnDispositionChange({
  previousDisposition,
  newDisposition,
  deductedFromStock,
  alreadyRestocked = false,
}) {
  if (alreadyRestocked) return false
  if (!deductedFromStock) return false
  if (previousDisposition === 'repaired_restocked') return false
  return newDisposition === 'repaired_restocked'
}

/**
 * Computes new inventory stock quantity after restocking a repaired returned item.
 */
export function calculateRestoredStock(currentStock, quantityToRestore) {
  const base = Math.max(0, Number(currentStock || 0))
  const add = Math.max(0, Number(quantityToRestore || 0))
  return base + add
}

/**
 * Computes financial loss value for damaged or scrapped inventory.
 */
export function calculateDamagedFinancialLoss(records = []) {
  return records
    .filter((r) => r.dispositionStatus === 'written_off' || r.dispositionStatus === 'disposed')
    .reduce((sum, r) => {
      const qty = Number(r.quantity || 0)
      const cost = Number(r.unitCost || r.unitPrice || r.price || 0)
      return sum + qty * cost
    }, 0)
}

/**
 * Resolves active inventory from either `inventory` or `inventoryItems` props.
 */
export function resolveActiveInventory(inventory, inventoryItems) {
  if (Array.isArray(inventory) && inventory.length > 0) return inventory
  if (Array.isArray(inventoryItems) && inventoryItems.length > 0) return inventoryItems
  return []
}

/**
 * Filters inventory items based on text search query and category filter.
 * Supports token matching and whitespace/punctuation-insensitive fuzzy matching
 * (e.g. "yamahalube" matches "Yamaha Lube", "brakepad" matches "Brake Pad").
 */
export function filterInventoryForReturn(items = [], query = '', category = 'ALL') {
  const q = String(query || '').trim().toLowerCase()
  const catFilter = String(category || 'ALL').trim().toLowerCase()

  const qNormalized = q.replace(/[\s\-_]/g, '')
  const tokens = q.split(/\s+/).filter(Boolean)

  return (Array.isArray(items) ? items : []).filter((item) => {
    if (catFilter !== 'all') {
      const itemCat = String(item.category || item.type || '').trim().toLowerCase()
      if (itemCat !== catFilter) return false
    }
    if (!q) return true

    const name = String(item.name || item.productName || item.model || '').toLowerCase()
    const sku = String(item.sku || item.code || '').toLowerCase()
    const brand = String(item.brand || '').toLowerCase()
    const itemCat = String(item.category || item.type || '').toLowerCase()

    const combined = `${name} ${sku} ${brand} ${itemCat}`
    const combinedNormalized = combined.replace(/[\s\-_]/g, '')

    const matchesTokens = tokens.length > 0 && tokens.every((t) => combined.includes(t))
    const matchesNormalized = qNormalized.length > 0 && combinedNormalized.includes(qNormalized)

    return matchesTokens || matchesNormalized
  })
}
