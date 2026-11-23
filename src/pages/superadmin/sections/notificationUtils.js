/**
 * Unified Notifications Utility Functions
 * Aggregates multi-channel dealership alerts (Inventory Change Requests, Low Stock, Service Bookings, Customer Chats)
 */

export function buildNotificationItems({
  chatNotifications = [],
  inventoryChangeRequests = [],
  inventory = [],
  serviceRequests = [],
  dismissedNotificationIds = [],
  readAlertIds = [],
}) {
  const items = []

  // 1. Unread chat messages
  chatNotifications.forEach((msg) => {
    const id = `chat-${msg.id}`
    items.push({
      id,
      type: 'CHAT',
      title: `Message from ${msg.senderName || 'Customer'}`,
      description: msg.text || 'New message received in inquiry channel.',
      time: msg.timestamp || 'Just now',
      createdAt: msg.createdAt || new Date().toISOString(),
      read: readAlertIds.includes(id),
      targetSection: 'chat-inbox',
      data: msg,
    })
  })

  // 2. Pending inventory change requests
  inventoryChangeRequests.forEach((req) => {
    if (req.status === 'submitted' || req.status === 'reviewing') {
      const id = `req-${req.id}`
      const typeLabel = req.requestType === 'delete' ? 'Delete' : req.proposedName ? 'Rename' : 'Edit'

      items.push({
        id,
        type: 'INVENTORY_REQUEST',
        title: `${typeLabel} Request`,
        description: `Staff requested ${req.requestType || 'action'} for "${req.currentName || 'Product'}". Verification required.`,
        time: req.time || 'Recently',
        createdAt: req.createdAt || new Date().toISOString(),
        read: readAlertIds.includes(id),
        targetSection: 'inventory',
        data: req,
      })
    }
  })

  // 3. Low stock and out-of-stock items (stock <= 5)
  inventory.forEach((prod) => {
    const stock = Number(prod.stock ?? 0)
    if (stock <= 5) {
      const id = `low-stock-${prod.id}`
      const isOutOfStock = stock <= 0

      items.push({
        id,
        type: 'LOW_STOCK',
        title: isOutOfStock ? 'Out of Stock Alert' : 'Low Stock Warning',
        description: `"${prod.name || 'Product'}" has only ${stock} unit(s) remaining in inventory.`,
        time: prod.time || 'Recently',
        createdAt: prod.updatedAt || prod.createdAt || new Date().toISOString(),
        read: readAlertIds.includes(id),
        targetSection: 'inventory',
        data: prod,
      })
    }
  })

  // 4. Pending service requests
  serviceRequests.forEach((sr) => {
    if (sr.status === 'pending' || sr.status === 'requested') {
      const id = `srv-req-${sr.id}`

      items.push({
        id,
        type: 'SERVICE_BOOKING',
        title: 'New Service Booking',
        description: `${sr.customerName || sr.customerEmail || 'Customer'} requested ${sr.serviceType || sr.serviceName || 'service'}${sr.motorcycleModel ? ` for ${sr.motorcycleModel}` : ''}.`,
        time: sr.time || 'Recently',
        createdAt: sr.createdAt || new Date().toISOString(),
        read: readAlertIds.includes(id),
        targetSection: 'service-scheduling',
        data: sr,
      })
    }
  })

  // Filter out dismissed notifications
  const activeItems = items.filter((n) => !dismissedNotificationIds.includes(n.id))

  // Sort descending by date
  return activeItems.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
}

/**
 * Calculates total unread notification count
 */
export function calculateUnreadCount(notificationItems = []) {
  return notificationItems.filter((item) => !item.read).length
}

/**
 * Filters notification list by active category tab
 */
export function filterNotificationsByCategory(items = [], category = 'all') {
  if (category === 'all') return items
  if (category === 'inventory') return items.filter((n) => n.type === 'INVENTORY_REQUEST' || n.type === 'LOW_STOCK')
  if (category === 'service') return items.filter((n) => n.type === 'SERVICE_BOOKING')
  if (category === 'messages') return items.filter((n) => n.type === 'CHAT')
  return items
}
