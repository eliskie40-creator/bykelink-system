import { describe, it, expect } from 'vitest'
import {
  VALID_DISPOSITIONS,
  VALID_RETURN_CONDITIONS,
  validateDamagedReturnPayload,
  shouldRestoreStockOnDispositionChange,
  calculateRestoredStock,
  calculateDamagedFinancialLoss,
  resolveActiveInventory,
  filterInventoryForReturn,
} from '../src/pages/superadmin/sections/damagedReturnsUtils.js'
import { mockDamagedReturns } from './fixtures/testData.js'

describe('damagedReturns: Intake, Disposition Lifecycle & Restocking Suite', () => {
  describe('validateDamagedReturnPayload', () => {
    it('validates a correct damaged return intake payload', () => {
      const validPayload = {
        itemId: 'prod-brake-pads',
        itemName: 'Nissin Front Ceramic Brake Pads',
        quantity: 2,
        condition: 'defective_box',
        dispositionStatus: 'pending_inspection',
      }

      const result = validateDamagedReturnPayload(validPayload)
      expect(result.isValid).toBe(true)
      expect(result.errors.length).toBe(0)
    })

    it('rejects payloads missing item name', () => {
      const invalid = {
        itemId: 'prod-brake-pads',
        itemName: '',
        quantity: 1,
      }
      const result = validateDamagedReturnPayload(invalid)
      expect(result.isValid).toBe(false)
      expect(result.errors).toContain('Item name is required.')
    })

    it('rejects non-positive quantities (zero, negative, non-number)', () => {
      const zeroQty = validateDamagedReturnPayload({ itemName: 'Belt', quantity: 0 })
      expect(zeroQty.isValid).toBe(false)

      const negativeQty = validateDamagedReturnPayload({ itemName: 'Belt', quantity: -3 })
      expect(negativeQty.isValid).toBe(false)

      const nanQty = validateDamagedReturnPayload({ itemName: 'Belt', quantity: 'abc' })
      expect(nanQty.isValid).toBe(false)
    })

    it('rejects invalid return condition codes', () => {
      const result = validateDamagedReturnPayload({
        itemName: 'Belt',
        quantity: 1,
        condition: 'alien_abduction',
      })
      expect(result.isValid).toBe(false)
      expect(result.errors[0]).toContain('Invalid return condition')
    })

    it('rejects invalid disposition statuses', () => {
      const result = validateDamagedReturnPayload({
        itemName: 'Belt',
        quantity: 1,
        dispositionStatus: 'flying_away',
      })
      expect(result.isValid).toBe(false)
      expect(result.errors[0]).toContain('Invalid disposition status')
    })
  })

  describe('shouldRestoreStockOnDispositionChange: Auto-Restock Trigger', () => {
    it('approves restocking when changing to repaired_restocked and item was deducted from stock', () => {
      const shouldRestore = shouldRestoreStockOnDispositionChange({
        previousDisposition: 'pending_inspection',
        newDisposition: 'repaired_restocked',
        deductedFromStock: true,
        alreadyRestocked: false,
      })
      expect(shouldRestore).toBe(true)
    })

    it('refuses restocking if item was not originally deducted from stock', () => {
      const shouldRestore = shouldRestoreStockOnDispositionChange({
        previousDisposition: 'pending_inspection',
        newDisposition: 'repaired_restocked',
        deductedFromStock: false,
      })
      expect(shouldRestore).toBe(false)
    })

    it('refuses restocking if already restored previously (idempotency guard)', () => {
      const shouldRestore = shouldRestoreStockOnDispositionChange({
        previousDisposition: 'repaired_restocked',
        newDisposition: 'repaired_restocked',
        deductedFromStock: true,
        alreadyRestocked: true,
      })
      expect(shouldRestore).toBe(false)
    })

    it('does not trigger restock for other disposition changes (written off, returned to supplier, scrapped)', () => {
      expect(
        shouldRestoreStockOnDispositionChange({
          previousDisposition: 'pending_inspection',
          newDisposition: 'written_off',
          deductedFromStock: true,
        }),
      ).toBe(false)

      expect(
        shouldRestoreStockOnDispositionChange({
          previousDisposition: 'pending_inspection',
          newDisposition: 'disposed',
          deductedFromStock: true,
        }),
      ).toBe(false)

      expect(
        shouldRestoreStockOnDispositionChange({
          previousDisposition: 'pending_inspection',
          newDisposition: 'returned_to_supplier',
          deductedFromStock: true,
        }),
      ).toBe(false)
    })
  })

  describe('calculateRestoredStock', () => {
    it('restores stock accurately by adding returned quantity to active stock', () => {
      expect(calculateRestoredStock(10, 2)).toBe(12)
      expect(calculateRestoredStock(0, 5)).toBe(5)
    })

    it('safely handles missing or null current stock', () => {
      expect(calculateRestoredStock(null, 3)).toBe(3)
      expect(calculateRestoredStock(undefined, 4)).toBe(4)
    })
  })

  describe('calculateDamagedFinancialLoss', () => {
    it('computes total financial loss only for written off or disposed inventory', () => {
      // In mockDamagedReturns:
      // ret-001 is pending_inspection (not written off)
      // ret-002 is written_off: 1 unit * 850 unitCost = 850 loss
      const totalLoss = calculateDamagedFinancialLoss(mockDamagedReturns)
      expect(totalLoss).toBe(850)
    })

    it('returns zero when there are no written off or disposed items', () => {
      const records = [
        { dispositionStatus: 'pending_inspection', quantity: 5, unitCost: 100 },
        { dispositionStatus: 'repaired_restocked', quantity: 2, unitCost: 100 },
      ]
      expect(calculateDamagedFinancialLoss(records)).toBe(0)
    })
  })

  describe('resolveActiveInventory: Prop Name Fallback', () => {
    it('prefers inventory prop when provided and non-empty', () => {
      const inv = [{ id: '1', name: 'Item 1' }]
      const items = [{ id: '2', name: 'Item 2' }]
      expect(resolveActiveInventory(inv, items)).toBe(inv)
    })

    it('falls back to inventoryItems prop when inventory is empty or undefined', () => {
      const items = [{ id: '2', name: 'Yamaha Lube' }]
      expect(resolveActiveInventory([], items)).toBe(items)
      expect(resolveActiveInventory(undefined, items)).toBe(items)
      expect(resolveActiveInventory(null, items)).toBe(items)
    })

    it('returns empty array when neither are provided or arrays', () => {
      expect(resolveActiveInventory(null, null)).toEqual([])
      expect(resolveActiveInventory([], [])).toEqual([])
    })
  })

  describe('filterInventoryForReturn: Search and Category Filtering', () => {
    const mockItems = [
      { id: '1', name: 'Yamaha Lube 4T 800ml', sku: 'SKU-YAM-001', category: 'Oils & Fluids', stock: 24, price: 280 },
      { id: '2', name: 'Nissin Brake Pad Front', sku: 'SKU-DHWT4Q', category: 'Spare Parts', stock: 12, price: 500 },
      { id: '3', name: 'Spark Plug NGK', sku: 'SKU-GVUAWI', category: 'Spare Parts', stock: 0, price: 190 },
      { id: '4', name: 'Yamaha NMAX 155', sku: 'SKU-MC-001', category: 'Motorcycles', stock: 3, price: 151900 },
    ]

    it('matches product by name case-insensitively (e.g. "yamahalube" matches "Yamaha Lube")', () => {
      const result = filterInventoryForReturn(mockItems, 'yamahalube')
      expect(result.length).toBe(1)
      expect(result[0].name).toBe('Yamaha Lube 4T 800ml')
    })

    it('matches product by SKU', () => {
      const result = filterInventoryForReturn(mockItems, 'DHWT4Q')
      expect(result.length).toBe(1)
      expect(result[0].sku).toBe('SKU-DHWT4Q')
    })

    it('filters by category chip', () => {
      const spareParts = filterInventoryForReturn(mockItems, '', 'Spare Parts')
      expect(spareParts.length).toBe(2)

      const motorcycles = filterInventoryForReturn(mockItems, '', 'Motorcycles')
      expect(motorcycles.length).toBe(1)
      expect(motorcycles[0].name).toBe('Yamaha NMAX 155')
    })

    it('combines category filter and text query', () => {
      const filtered = filterInventoryForReturn(mockItems, 'spark', 'Spare Parts')
      expect(filtered.length).toBe(1)
      expect(filtered[0].name).toBe('Spark Plug NGK')

      const noMatch = filterInventoryForReturn(mockItems, 'yamaha', 'Spare Parts')
      expect(noMatch.length).toBe(0)
    })

    it('returns all items when query is empty and category is ALL', () => {
      const result = filterInventoryForReturn(mockItems, '', 'ALL')
      expect(result.length).toBe(mockItems.length)
    })
  })
})
