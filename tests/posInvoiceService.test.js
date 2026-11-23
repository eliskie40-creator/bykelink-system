import { describe, it, expect } from 'vitest'
import {
  isServiceItem,
  normalizeInvoiceItems,
  buildInvoiceData,
  VAT_RATE,
} from '../src/services/posInvoiceService.js'

describe('posInvoiceService: Unified POS Sales Invoice Suite', () => {
  describe('isServiceItem', () => {
    it('identifies service items by type, id, or SKU', () => {
      expect(isServiceItem({ type: 'service', name: 'PMS Inspection' })).toBe(true)
      expect(isServiceItem({ id: 'service-engine-cleaning', name: 'Engine Labor' })).toBe(true)
      expect(isServiceItem({ sku: 'SERVICE', name: 'Tire Installation' })).toBe(true)
    })

    it('identifies service items by labor/service keywords in the name', () => {
      expect(isServiceItem({ name: 'CVT Cleaning & Degreasing Labor' })).toBe(true)
      expect(isServiceItem({ name: 'Tune-up & Valve Clearance' })).toBe(true)
      expect(isServiceItem({ name: 'Brake Pad Installation' })).toBe(true)
    })

    it('identifies physical spare parts as non-service', () => {
      expect(isServiceItem({ name: 'Yamalube 4T 10W-40 AT Engine Oil', sku: 'YAM-OIL' })).toBe(false)
      expect(isServiceItem({ name: 'Nissin Front Ceramic Brake Pads', sku: 'NIS-BRK-01' })).toBe(false)
      expect(isServiceItem({ name: 'Gates Powerlink CVT Drive Belt', sku: 'GAT-BELT' })).toBe(false)
    })
  })

  describe('normalizeInvoiceItems', () => {
    it('standardizes mixed items with appropriate type and typeLabel', () => {
      const raw = [
        { name: 'Engine Oil', unitPrice: 285, qty: 2, subtotal: 570 },
        { name: 'Oil Filter Cleaning Labor', unitPrice: 150, qty: 1, subtotal: 150, type: 'service' },
      ]

      const normalized = normalizeInvoiceItems(raw)
      expect(normalized.length).toBe(2)
      expect(normalized[0].type).toBe('product')
      expect(normalized[0].typeLabel).toBe('PART')
      expect(normalized[1].type).toBe('service')
      expect(normalized[1].typeLabel).toBe('SERVICE')
    })

    it('safely handles empty or non-array inputs', () => {
      expect(normalizeInvoiceItems(null)).toEqual([])
      expect(normalizeInvoiceItems(undefined)).toEqual([])
      expect(normalizeInvoiceItems([])).toEqual([])
    })
  })

  describe('buildInvoiceData', () => {
    const mockTransaction = {
      id: 'TX-45072484',
      transactionId: 'TX-45072484',
      customer: 'Juan Dela Cruz',
      paymentMethod: 'Cash',
      amountTendered: 2000,
      items: [
        {
          id: 'part-1',
          name: 'Nissin Front Ceramic Brake Pads',
          sku: 'NIS-BRK-01',
          type: 'product',
          unitPrice: 500,
          qty: 2,
          subtotal: 1000,
        },
        {
          id: 'part-2',
          name: 'NGK Iridium Spark Plug',
          sku: 'NGK-SPK-01',
          type: 'product',
          unitPrice: 190,
          qty: 2,
          subtotal: 380,
        },
        {
          id: 'srv-1',
          name: 'Brake Caliper Cleaning & Labor',
          sku: 'SERVICE',
          type: 'service',
          unitPrice: 250,
          qty: 1,
          subtotal: 250,
        },
      ],
    }

    it('separates spare parts from service labor subtotal accurately', () => {
      const invoice = buildInvoiceData({
        transaction: mockTransaction,
        cashierUser: { displayName: 'Cashier Maria' },
        isReprint: false,
      })

      // Parts: 1000 + 380 = 1380
      expect(invoice.partsSubtotal).toBe(1380)
      expect(invoice.partsQuantity).toBe(4)

      // Service: 250
      expect(invoice.serviceSubtotal).toBe(250)
      expect(invoice.serviceQuantity).toBe(1)

      // Gross: 1380 + 250 = 1630
      expect(invoice.grossSubtotal).toBe(1630)
      expect(invoice.grandTotal).toBe(1630)
      expect(invoice.hasParts).toBe(true)
      expect(invoice.hasServices).toBe(true)
    })

    it('computes 12% VAT breakdown and Net VATable Sales correctly', () => {
      const invoice = buildInvoiceData({
        transaction: mockTransaction,
      })

      // VATable Sales = GrandTotal / 1.12 = 1630 / 1.12 = 1455.36
      expect(invoice.vatableSales).toBe(1455.36)

      // VAT Amount = 1630 - 1455.36 = 174.64
      expect(invoice.vatAmount).toBe(174.64)
      expect(Number((invoice.vatableSales + invoice.vatAmount).toFixed(2))).toBe(invoice.grandTotal)
    })

    it('calculates change correctly based on amount tendered', () => {
      const invoice = buildInvoiceData({
        transaction: mockTransaction,
      })

      // Tendered: 2000, Total: 1630, Change: 370
      expect(invoice.amountTendered).toBe(2000)
      expect(invoice.change).toBe(370)
    })

    it('sets official company branding and reprint flags', () => {
      const invoice = buildInvoiceData({
        transaction: mockTransaction,
        cashierUser: { email: 'cashier@bykelink.com' },
        isReprint: true,
      })

      expect(invoice.companyName).toBe('BYKELINK MOTOR INC.')
      expect(invoice.branchName).toContain('TAGUM CITY')
      expect(invoice.invoiceNumber).toBe('TX-45072484')
      expect(invoice.cashierName).toBe('cashier')
      expect(invoice.isReprint).toBe(true)
    })

    it('handles legacy transactions where labor was unitemized', () => {
      const legacyTransaction = {
        id: 'TX-LEGACY-001',
        subtotal: 1000,
        items: [
          { name: 'Engine Oil', unitPrice: 285, qty: 2, subtotal: 570, type: 'product' },
        ],
      }

      const invoice = buildInvoiceData({
        transaction: legacyTransaction,
      })

      // Parts subtotal: 570
      // Unitemized service difference: 1000 - 570 = 430
      expect(invoice.partsSubtotal).toBe(570)
      expect(invoice.serviceSubtotal).toBe(430)
      expect(invoice.hasServices).toBe(true)
      expect(invoice.grandTotal).toBe(1000)
    })

    it('manages customer name, contact phone, and vehicle plate details accurately', () => {
      const detailedTransaction = {
        id: 'TX-998877',
        customer: 'Pedro Penduko',
        customerPhone: '0917-123-4567',
        customerVehicle: 'Honda Click 125i (ABC-1234)',
        grandTotal: 500,
        items: [{ name: 'Brake Fluid', unitPrice: 500, qty: 1 }],
      }

      const invoice = buildInvoiceData({ transaction: detailedTransaction })
      expect(invoice.customer).toBe('Pedro Penduko')
      expect(invoice.customerPhone).toBe('0917-123-4567')
      expect(invoice.customerVehicle).toBe('Honda Click 125i (ABC-1234)')
    })

    it('falls back to Walk-in Customer and null details when customer info is omitted', () => {
      const invoice = buildInvoiceData({ transaction: {} })
      expect(invoice.customer).toBe('Walk-in Customer')
      expect(invoice.customerPhone).toBeNull()
      expect(invoice.customerVehicle).toBeNull()
    })
  })
})
