import { describe, it, expect } from 'vitest'
import {
  canPerformDirectAdminAction,
  validateDirectAuthorizationPayload,
  applyApprovedInventoryUpdates,
} from '../src/pages/superadmin/sections/staffAuthUtils.js'
import { mockProducts } from './fixtures/testData.js'

describe('staffAuthorization: Direct Verification & Inventory Changes Suite', () => {
  describe('canPerformDirectAdminAction', () => {
    it('grants autonomous administrative authority to admin and superadmin roles', () => {
      expect(canPerformDirectAdminAction('admin')).toBe(true)
      expect(canPerformDirectAdminAction('superadmin')).toBe(true)
      expect(canPerformDirectAdminAction('ADMIN')).toBe(true)
    })

    it('requires dual-custody verification for non-admin staff roles', () => {
      expect(canPerformDirectAdminAction('inventory personnel')).toBe(false)
      expect(canPerformDirectAdminAction('mechanics personnel')).toBe(false)
      expect(canPerformDirectAdminAction('cashier personnel')).toBe(false)
      expect(canPerformDirectAdminAction('front desk personnel')).toBe(false)
      expect(canPerformDirectAdminAction('customer')).toBe(false)
      expect(canPerformDirectAdminAction('')).toBe(false)
    })
  })

  describe('validateDirectAuthorizationPayload', () => {
    it('approves a well-formed staff direct override request', () => {
      const valid = {
        adminEmail: 'admin@bykelink.com',
        adminPassword: 'securePassword123',
        itemId: 'prod-yamaha-nmax',
        pendingUpdates: { price: 154900 },
      }

      const result = validateDirectAuthorizationPayload(valid)
      expect(result.isValid).toBe(true)
      expect(result.errors.length).toBe(0)
    })

    it('rejects invalid or missing admin email', () => {
      const invalid = {
        adminEmail: 'notanemail',
        adminPassword: 'securePassword123',
        itemId: 'prod-yamaha-nmax',
        pendingUpdates: { price: 154900 },
      }

      const result = validateDirectAuthorizationPayload(invalid)
      expect(result.isValid).toBe(false)
      expect(result.errors[0]).toContain('valid administrator email')
    })

    it('rejects passwords shorter than 6 characters', () => {
      const invalid = {
        adminEmail: 'admin@bykelink.com',
        adminPassword: '123',
        itemId: 'prod-yamaha-nmax',
        pendingUpdates: { price: 154900 },
      }

      const result = validateDirectAuthorizationPayload(invalid)
      expect(result.isValid).toBe(false)
      expect(result.errors[0]).toContain('at least 6 characters')
    })

    it('rejects empty target itemId or empty pending updates', () => {
      const emptyItem = validateDirectAuthorizationPayload({
        adminEmail: 'admin@bykelink.com',
        adminPassword: 'securePassword123',
        itemId: '',
        pendingUpdates: { price: 154900 },
      })
      expect(emptyItem.isValid).toBe(false)

      const emptyUpdates = validateDirectAuthorizationPayload({
        adminEmail: 'admin@bykelink.com',
        adminPassword: 'securePassword123',
        itemId: 'prod-yamaha-nmax',
        pendingUpdates: {},
      })
      expect(emptyUpdates.isValid).toBe(false)
    })
  })

  describe('applyApprovedInventoryUpdates', () => {
    it('applies verified updates to original product state', () => {
      const original = mockProducts[0] // NMAX
      const updates = {
        price: 155000,
        variant: 'Connected Special Edition',
      }

      const updated = applyApprovedInventoryUpdates(original, updates)
      expect(updated.price).toBe(155000)
      expect(updated.variant).toBe('Connected Special Edition')
      expect(updated.name).toBe(original.name) // Unchanged fields retained
    })

    it('recalculates total stock and adjusts status to "In Stock" when stock > 5', () => {
      const original = mockProducts[1] // Click (stock: 3, Low Stock)
      const updates = { stock: 15 }

      const updated = applyApprovedInventoryUpdates(original, updates)
      expect(updated.stock).toBe(15)
      expect(updated.status).toBe('In Stock')
    })

    it('adjusts status to "Low Stock" when stock is between 1 and 5', () => {
      const original = mockProducts[0]
      const updates = { stock: 4 }

      const updated = applyApprovedInventoryUpdates(original, updates)
      expect(updated.stock).toBe(4)
      expect(updated.status).toBe('Low Stock')
    })

    it('adjusts status to "Out of Stock" when stock is 0 or negative', () => {
      const original = mockProducts[0]
      const updates = { stock: 0 }

      const updated = applyApprovedInventoryUpdates(original, updates)
      expect(updated.stock).toBe(0)
      expect(updated.status).toBe('Out of Stock')
    })

    it('recalculates total stock from colorVariants sum if colorVariants are provided', () => {
      const original = mockProducts[0]
      const updates = {
        colorVariants: [
          { color: 'Red', stock: 10 },
          { color: 'Blue', stock: 5 },
        ],
      }

      const updated = applyApprovedInventoryUpdates(original, updates)
      expect(updated.stock).toBe(15) // 10 + 5
      expect(updated.status).toBe('In Stock')
    })
  })
})
