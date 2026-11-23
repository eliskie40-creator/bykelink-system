import { describe, it, expect } from 'vitest'
import {
  formatCurrency,
  formatDate,
  getStatusTone,
  getStatusClasses,
  isServiceSaleItem,
  summarizeSaleItems,
  BULK_PURCHASE_THRESHOLD,
} from '../src/pages/superadmin/sections/superadminUtils.js'

describe('superadminUtils: Core Utilities Suite', () => {
  describe('formatCurrency', () => {
    it('formats valid numbers to Philippine Peso (PHP) format', () => {
      const formatted = formatCurrency(1500)
      expect(formatted).toMatch(/1,500/)
    })

    it('safely handles zero, null, undefined, and non-numeric inputs', () => {
      expect(formatCurrency(0)).toMatch(/0/)
      expect(formatCurrency(null)).toMatch(/0/)
      expect(formatCurrency(undefined)).toMatch(/0/)
      expect(formatCurrency('invalid-number')).toMatch(/0/)
    })

    it('formats large values with proper comma separation', () => {
      const formatted = formatCurrency(151900)
      expect(formatted).toMatch(/151,900/)
    })
  })

  describe('formatDate', () => {
    it('formats JS Date object into legible string', () => {
      const date = new Date('2026-11-20T10:30:00Z')
      const formatted = formatDate(date)
      expect(formatted).toContain('2026')
      expect(formatted).toContain('Nov')
    })

    it('formats Firestore-like Timestamp objects with toDate()', () => {
      const firestoreTimestamp = {
        toDate: () => new Date('2026-05-15T08:00:00Z'),
      }
      const formatted = formatDate(firestoreTimestamp)
      expect(formatted).toContain('2026')
      expect(formatted).toContain('May')
    })

    it('returns "No timestamp" for invalid or missing dates', () => {
      expect(formatDate(null)).toBe('No timestamp')
      expect(formatDate(undefined)).toBe('No timestamp')
      expect(formatDate('invalid-date')).toBe('No timestamp')
    })
  })

  describe('getStatusTone and getStatusClasses', () => {
    it('maps positive operational statuses to emerald tone', () => {
      expect(getStatusTone('completed')).toBe('emerald')
      expect(getStatusTone('online')).toBe('emerald')
      expect(getStatusTone('in stock')).toBe('emerald')
      expect(getStatusTone('approved')).toBe('emerald')

      const classes = getStatusClasses('in stock')
      expect(classes).toContain('emerald')
    })

    it('maps warning and review statuses to amber tone', () => {
      expect(getStatusTone('pending')).toBe('amber')
      expect(getStatusTone('low stock')).toBe('amber')
      expect(getStatusTone('submitted')).toBe('amber')
      expect(getStatusTone('reviewing')).toBe('amber')

      const classes = getStatusClasses('low stock')
      expect(classes).toContain('amber')
    })

    it('maps negative or urgent statuses to red tone', () => {
      expect(getStatusTone('out of stock')).toBe('red')
      expect(getStatusTone('in progress')).toBe('red')
      expect(getStatusTone('rejected')).toBe('red')

      const classes = getStatusClasses('out of stock')
      expect(classes).toContain('#e10100')
    })

    it('defaults unknown status to slate tone', () => {
      expect(getStatusTone('unknown-custom-state')).toBe('slate')
      expect(getStatusClasses('unknown-custom-state')).toContain('slate')
    })
  })

  describe('isServiceSaleItem', () => {
    it('identifies service items by explicit type attribute', () => {
      expect(isServiceSaleItem({ type: 'service', name: 'Tune Up' })).toBe(true)
    })

    it('identifies service items by service prefix in id', () => {
      expect(isServiceSaleItem({ id: 'service-engine-oil-change', name: 'Labor' })).toBe(true)
    })

    it('identifies service items by SKU === "SERVICE"', () => {
      expect(isServiceSaleItem({ sku: 'SERVICE', name: 'Brake Bleeding Labor' })).toBe(true)
    })

    it('returns false for physical product spare parts', () => {
      expect(isServiceSaleItem({ id: 'prod-yamalube', sku: 'YAM-OIL', type: 'product' })).toBe(false)
      expect(isServiceSaleItem({ name: 'Spark Plug' })).toBe(false)
    })
  })

  describe('summarizeSaleItems', () => {
    it('summarizes a transaction with only physical spare parts', () => {
      const items = [
        { id: 'part-1', name: 'Engine Oil', unitPrice: 285, qty: 2, subtotal: 570, type: 'product' },
        { id: 'part-2', name: 'Brake Pads', unitPrice: 650, qty: 1, subtotal: 650, type: 'product' },
      ]

      const summary = summarizeSaleItems(items)
      expect(summary.itemCount).toBe(2)
      expect(summary.totalQuantity).toBe(3)
      expect(summary.partsQuantity).toBe(3)
      expect(summary.serviceQuantity).toBe(0)
      expect(summary.partsSubtotal).toBe(1220)
      expect(summary.serviceSubtotal).toBe(0)
      expect(summary.hasParts).toBe(true)
      expect(summary.hasServices).toBe(false)
      expect(summary.isBulk).toBe(false)
      expect(summary.summaryLabel).toBe('Engine Oil (×2) + 1 more')
    })

    it('summarizes a transaction with mixed parts and services', () => {
      const items = [
        { id: 'part-1', name: 'Drive Belt', unitPrice: 1200, qty: 1, subtotal: 1200, type: 'product' },
        { id: 'service-1', name: 'CVT Cleaning Labor', unitPrice: 800, qty: 1, subtotal: 800, type: 'service' },
      ]

      const summary = summarizeSaleItems(items)
      expect(summary.itemCount).toBe(2)
      expect(summary.totalQuantity).toBe(2)
      expect(summary.partsSubtotal).toBe(1200)
      expect(summary.serviceSubtotal).toBe(800)
      expect(summary.hasParts).toBe(true)
      expect(summary.hasServices).toBe(true)
    })

    it('flags bulk purchase when parts quantity reaches or exceeds threshold (>= 5)', () => {
      const items = [
        { id: 'part-1', name: 'Engine Oil', unitPrice: 285, qty: BULK_PURCHASE_THRESHOLD, subtotal: 1425, type: 'product' },
      ]

      const summary = summarizeSaleItems(items)
      expect(summary.isBulk).toBe(true)
    })

    it('computes legacy unitemized service subtotal if recorded subtotal exceeds parts subtotal', () => {
      const items = [
        { id: 'part-1', name: 'Brake Shoe', unitPrice: 400, qty: 1, subtotal: 400, type: 'product' },
      ]
      // Transaction was charged 650 total, meaning 250 was unitemized service labor
      const summary = summarizeSaleItems(items, 1, 650)
      expect(summary.legacyUnitemizedService).toBe(250)
      expect(summary.serviceSubtotal).toBe(250)
      expect(summary.hasServices).toBe(true)
      expect(summary.summaryLabel).toContain('+ Service')
    })

    it('handles empty or null items array safely', () => {
      const summary = summarizeSaleItems(null, 0)
      expect(summary.itemCount).toBe(0)
      expect(summary.totalQuantity).toBe(0)
      expect(summary.partsSubtotal).toBe(0)
      expect(summary.serviceSubtotal).toBe(0)
      expect(summary.summaryLabel).toBe('No item details recorded')
    })
  })
})
