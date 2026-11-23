import { describe, it, expect } from 'vitest'
import {
  computeTopSoldSpareParts,
  calculateVolumeShare,
  calculateTotalSparePartsUnits,
  calculateTotalSparePartsRevenue,
} from '../src/pages/superadmin/sections/analyticsUtils.js'
import { mockTransactions } from './fixtures/testData.js'

describe('analyticsEngine: Most Sold Spare Parts Suite', () => {
  it('correctly aggregates spare parts sales and filters out service labor charges', () => {
    const topParts = computeTopSoldSpareParts(mockTransactions, 'units')

    // Expect Yamalube Oil and Brake Pads and Drive Belt
    expect(topParts.length).toBe(3)

    // Verify CVT Cleaning Labor was filtered out
    const serviceFound = topParts.some((p) => p.name.includes('Labor') || p.name.includes('Cleaning'))
    expect(serviceFound).toBe(false)
  })

  it('ranks items by units sold descending by default', () => {
    const topParts = computeTopSoldSpareParts(mockTransactions, 'units')

    // In mockTransactions:
    // Yamalube: 2 + 1 + 6 = 9 units
    // Nissin Brake Pads: 2 units
    // Gates Drive Belt: 1 unit
    expect(topParts[0].sku).toBe('YAM-OIL-10W40-AT')
    expect(topParts[0].totalQty).toBe(9)
    expect(topParts[1].sku).toBe('NIS-BRK-FRT-01')
    expect(topParts[1].totalQty).toBe(2)
    expect(topParts[2].sku).toBe('GAT-CVT-BELT-828')
    expect(topParts[2].totalQty).toBe(1)
  })

  it('ranks items by gross revenue descending when sortBy="revenue"', () => {
    const topParts = computeTopSoldSpareParts(mockTransactions, 'revenue')

    // Revenue calculations:
    // Yamalube: 9 units * 285 = 2,565
    // Nissin Brake Pads: 2 units * 650 = 1,300
    // Gates Drive Belt: 1 unit * 1200 = 1,200
    expect(topParts[0].sku).toBe('YAM-OIL-10W40-AT')
    expect(topParts[0].totalRevenue).toBe(2565)
    expect(topParts[1].sku).toBe('NIS-BRK-FRT-01')
    expect(topParts[1].totalRevenue).toBe(1300)
    expect(topParts[2].sku).toBe('GAT-CVT-BELT-828')
    expect(topParts[2].totalRevenue).toBe(1200)
  })

  it('calculates volume market share correctly relative to top seller', () => {
    const topParts = computeTopSoldSpareParts(mockTransactions, 'units')
    const maxQty = topParts[0].totalQty // 9

    // #1 seller: 9 / 9 = 100%
    expect(calculateVolumeShare(topParts[0].totalQty, maxQty)).toBe(100)

    // #2 seller: 2 / 9 = 22%
    expect(calculateVolumeShare(topParts[1].totalQty, maxQty)).toBe(22)

    // #3 seller: 1 / 9 = 11%
    expect(calculateVolumeShare(topParts[2].totalQty, maxQty)).toBe(11)

    // Invalid max quantity returns 0
    expect(calculateVolumeShare(5, 0)).toBe(0)
    expect(calculateVolumeShare(5, null)).toBe(0)
  })

  it('calculates total units and total gross revenue correctly', () => {
    const topParts = computeTopSoldSpareParts(mockTransactions, 'units')

    const totalUnits = calculateTotalSparePartsUnits(topParts)
    expect(totalUnits).toBe(12) // 9 + 2 + 1

    const totalRevenue = calculateTotalSparePartsRevenue(topParts)
    expect(totalRevenue).toBe(5065) // 2565 + 1300 + 1200
  })

  it('handles empty transaction logs gracefully', () => {
    const topParts = computeTopSoldSpareParts([], 'units')
    expect(topParts).toEqual([])
    expect(calculateTotalSparePartsUnits([])).toBe(0)
    expect(calculateTotalSparePartsRevenue([])).toBe(0)
  })
})
