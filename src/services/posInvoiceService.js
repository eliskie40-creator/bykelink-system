/**
 * POS Unified Sales Invoice Service
 * Normalizes, calculates, and structures transactions into official Bykelink Sales Invoices
 * accommodating both physical spare parts and precision service labor.
 */

export const VAT_RATE = 0.12

/**
 * Checks whether an item entry represents a mechanic or service labor charge.
 */
export function isServiceItem(entry = {}) {
  const id = String(entry?.id || '').trim().toLowerCase()
  const sku = String(entry?.sku || '').trim().toUpperCase()
  const type = String(entry?.type || '').trim().toLowerCase()
  const name = String(entry?.name || entry?.item || '').trim().toLowerCase()

  return (
    type === 'service' ||
    id.startsWith('service-') ||
    sku === 'SERVICE' ||
    name.includes('labor') ||
    name.includes('cleaning') ||
    name.includes('tune-up') ||
    name.includes('tune up') ||
    name.includes('installation')
  )
}

/**
 * Normalizes raw transaction or cart items into standardized invoice line items.
 */
export function normalizeInvoiceItems(rawItems = []) {
  if (!Array.isArray(rawItems)) return []

  return rawItems
    .filter(Boolean)
    .map((entry, index) => {
      const isService = isServiceItem(entry)
      const qty = Math.max(1, Number(entry.qty || 1))
      const unitPrice = Number(entry.unitPrice || 0)
      const subtotal =
        entry.subtotal !== undefined && entry.subtotal !== null
          ? Number(entry.subtotal)
          : Number((qty * unitPrice).toFixed(2))

      return {
        id: String(entry.id || `item-${index + 1}`),
        sku: String(entry.sku || (isService ? 'SERVICE' : 'PART-GEN')),
        name: String(entry.name || entry.item || 'Item'),
        type: isService ? 'service' : 'product',
        typeLabel: isService ? 'SERVICE' : 'PART',
        qty,
        unitPrice,
        subtotal,
      }
    })
}

/**
 * Builds a structured, complete Bykelink Official Sales Invoice data model.
 */
export function buildInvoiceData({
  transaction = {},
  cartItems = [],
  cashierUser = null,
  isReprint = false,
} = {}) {
  const source = transaction || {}
  const rawItems =
    Array.isArray(source.items) && source.items.length > 0
      ? source.items
      : Array.isArray(cartItems) && cartItems.length > 0
        ? cartItems
        : []

  const items = normalizeInvoiceItems(rawItems)

  const productItems = items.filter((item) => item.type !== 'service')
  const serviceItems = items.filter((item) => item.type === 'service')

  const partsSubtotal = Number(
    productItems.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2),
  )
  const recordedServiceSubtotal = Number(
    serviceItems.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2),
  )

  const rawSubtotal = source.subtotal !== undefined && source.subtotal !== null
    ? Number(source.subtotal)
    : partsSubtotal + recordedServiceSubtotal

  // Handle legacy unitemized service fees if recorded subtotal > parts subtotal
  const legacyService =
    recordedServiceSubtotal === 0 && rawSubtotal > partsSubtotal
      ? Number((rawSubtotal - partsSubtotal).toFixed(2))
      : 0

  const serviceSubtotal = Number((recordedServiceSubtotal + legacyService).toFixed(2))
  const grossSubtotal = Number((partsSubtotal + serviceSubtotal).toFixed(2))

  const discount = Math.max(0, Number(source.discount || 0))
  const grandTotal = source.grandTotal !== undefined && source.grandTotal !== null
    ? Number(source.grandTotal)
    : Number((grossSubtotal - discount).toFixed(2))

  // VAT Breakdown (12% Included)
  const vatableSales = Number((grandTotal / (1 + VAT_RATE)).toFixed(2))
  const vatAmount = Number((grandTotal - vatableSales).toFixed(2))

  const amountTendered = Number(
    source.amountTendered !== undefined && source.amountTendered !== null
      ? source.amountTendered
      : grandTotal,
  )
  const change = Math.max(0, Number((amountTendered - grandTotal).toFixed(2)))

  const totalQuantity = items.reduce((sum, item) => sum + item.qty, 0)
  const partsQuantity = productItems.reduce((sum, item) => sum + item.qty, 0)
  const serviceQuantity = serviceItems.reduce((sum, item) => sum + item.qty, 0)

  const transactionId =
    source.transactionId || source.id || `TX-${Date.now()}`

  const timestamp =
    source.timestamp ||
    (source.createdAt
      ? (source.createdAt instanceof Date
          ? source.createdAt.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
          : new Date(source.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }))
      : new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }))

  const customer = String(source.customer || 'Walk-in Customer').trim() || 'Walk-in Customer'
  const customerPhone = source.customerPhone ? String(source.customerPhone).trim() : null
  const customerVehicle = source.customerVehicle ? String(source.customerVehicle).trim() : null
  const paymentMethod = String(source.paymentMethod || 'Cash')
  const notes = String(source.notes || '')

  const cashierName =
    cashierUser?.displayName ||
    cashierUser?.name ||
    (cashierUser?.email ? cashierUser.email.split('@')[0] : 'Cashier Personnel')

  return {
    id: transactionId,
    invoiceNumber: transactionId,
    companyName: 'BYKELINK MOTOR INC.',
    branchName: 'TAGUM CITY MAIN BRANCH',
    tagline: 'Dealership & Precision Motorcycle Service Center',
    timestamp,
    customer,
    customerPhone,
    customerVehicle,
    cashierName,
    paymentMethod,
    notes,
    isReprint: Boolean(isReprint || source.isReprint),
    hasParts: productItems.length > 0,
    hasServices: serviceItems.length > 0 || legacyService > 0,
    items,
    productItems,
    serviceItems,
    partsQuantity,
    serviceQuantity,
    totalQuantity,
    partsSubtotal,
    serviceSubtotal,
    grossSubtotal,
    discount,
    vatableSales,
    vatAmount,
    grandTotal,
    amountTendered,
    change,
  }
}
