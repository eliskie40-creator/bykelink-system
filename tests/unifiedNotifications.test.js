import { describe, it, expect } from 'vitest'
import {
  buildNotificationItems,
  calculateUnreadCount,
  filterNotificationsByCategory,
} from '../src/pages/superadmin/sections/notificationUtils.js'
import { mockProducts, mockChangeRequests } from './fixtures/testData.js'

describe('unifiedNotifications: Multi-Channel Alert Hub Suite', () => {
  const sampleChats = [
    {
      id: 'chat-001',
      senderName: 'Maria Santos',
      text: 'Good morning, do you have available NMAX in Phantom Black?',
      createdAt: '2026-11-21T09:15:00.000Z',
    },
  ]

  const sampleServices = [
    {
      id: 'srv-001',
      customerName: 'Robert Cruz',
      serviceType: '10,000km PMS Overhaul',
      motorcycleModel: 'Yamaha Aerox 155',
      status: 'pending',
      createdAt: '2026-11-21T09:30:00.000Z',
    },
  ]

  it('aggregates all 4 distinct notification alert streams', () => {
    const notifications = buildNotificationItems({
      chatNotifications: sampleChats,
      inventoryChangeRequests: mockChangeRequests,
      inventory: mockProducts,
      serviceRequests: sampleServices,
      dismissedNotificationIds: [],
      readAlertIds: [],
    })

    // Should include:
    // 1 chat notification
    // 1 inventory request (req-001)
    // 2 low-stock/out-of-stock items (Click has 3, Raider has 0)
    // 1 service booking (srv-001)
    expect(notifications.length).toBe(5)

    const types = notifications.map((n) => n.type)
    expect(types).toContain('CHAT')
    expect(types).toContain('INVENTORY_REQUEST')
    expect(types).toContain('LOW_STOCK')
    expect(types).toContain('SERVICE_BOOKING')
  })

  it('correctly tracks read vs unread notification states and calculates badge count', () => {
    const readIds = ['chat-chat-001', 'req-req-001']

    const notifications = buildNotificationItems({
      chatNotifications: sampleChats,
      inventoryChangeRequests: mockChangeRequests,
      inventory: mockProducts,
      serviceRequests: sampleServices,
      dismissedNotificationIds: [],
      readAlertIds: readIds,
    })

    const unreadCount = calculateUnreadCount(notifications)
    // Out of 5 total, 2 are read -> 3 should be unread
    expect(unreadCount).toBe(3)
  })

  it('excludes dismissed notification IDs from the active list', () => {
    const dismissedIds = ['chat-chat-001']

    const notifications = buildNotificationItems({
      chatNotifications: sampleChats,
      inventoryChangeRequests: mockChangeRequests,
      inventory: mockProducts,
      serviceRequests: sampleServices,
      dismissedNotificationIds: dismissedIds,
      readAlertIds: [],
    })

    expect(notifications.some((n) => n.id === 'chat-chat-001')).toBe(false)
    expect(notifications.length).toBe(4)
  })

  it('filters notifications by category tab accurately', () => {
    const notifications = buildNotificationItems({
      chatNotifications: sampleChats,
      inventoryChangeRequests: mockChangeRequests,
      inventory: mockProducts,
      serviceRequests: sampleServices,
      dismissedNotificationIds: [],
      readAlertIds: [],
    })

    const inventoryOnly = filterNotificationsByCategory(notifications, 'inventory')
    expect(inventoryOnly.every((n) => n.type === 'INVENTORY_REQUEST' || n.type === 'LOW_STOCK')).toBe(true)

    const servicesOnly = filterNotificationsByCategory(notifications, 'service')
    expect(servicesOnly.every((n) => n.type === 'SERVICE_BOOKING')).toBe(true)

    const messagesOnly = filterNotificationsByCategory(notifications, 'messages')
    expect(messagesOnly.every((n) => n.type === 'CHAT')).toBe(true)

    const all = filterNotificationsByCategory(notifications, 'all')
    expect(all.length).toBe(notifications.length)
  })
})
