import { describe, it, expect, vi } from 'vitest'
import * as XLSX from 'xlsx'
import {
  buildExcelAoaData,
  exportProfessionalExcel,
} from '../src/services/reportExportService.js'

describe('reportExportService: Universal Reports Engine Suite', () => {
  const sampleKpis = [
    { label: 'Total Units Sold', value: '45 pcs' },
    { label: 'Gross Revenue', value: '₱ 125,400' },
  ]

  const sampleColumns = [
    { header: 'Item Name', key: 'name', wch: 25 },
    { header: 'SKU Code', key: 'sku', wch: 18 },
    { header: 'Units', key: 'qty', wch: 10 },
  ]

  const sampleData = [
    { name: 'Yamalube Engine Oil', sku: 'YAM-OIL-10W40', qty: 20 },
    { name: 'Nissin Brake Pads', sku: 'NIS-BRK-01', qty: 15 },
  ]

  describe('buildExcelAoaData', () => {
    it('generates official Bykelink header banner rows in Zone 1', () => {
      const { wsData } = buildExcelAoaData({
        reportTitle: 'SPARE PARTS VELOCITY AUDIT',
        subtitle: 'Dealership Performance Report',
        periodText: 'Nov 1 - Nov 21, 2026',
        generatedBy: 'Admin Michael',
        kpis: sampleKpis,
        columns: sampleColumns,
        data: sampleData,
      })

      // Row 0: Company Name
      expect(wsData[0][0]).toBe('BYKELINK MOTOR INC.')
      // Row 1: Subtitle
      expect(wsData[1][0]).toBe('Dealership Performance Report')
      // Row 2: Uppercase Report Title
      expect(wsData[2][0]).toBe('SPARE PARTS VELOCITY AUDIT')
      // Row 3: Metadata Line
      expect(wsData[3][0]).toContain('Reporting Period: Nov 1 - Nov 21, 2026')
      expect(wsData[3][0]).toContain('Admin Michael')
    })

    it('generates Executive Summary KPI Block in Zone 2', () => {
      const { wsData } = buildExcelAoaData({
        kpis: sampleKpis,
        columns: sampleColumns,
        data: sampleData,
      })

      // Zone 2 label
      const kpiHeaderIndex = wsData.findIndex((row) => row[0] === 'EXECUTIVE SUMMARY METRICS')
      expect(kpiHeaderIndex).toBeGreaterThan(0)

      const kpiLabelsRow = wsData[kpiHeaderIndex + 1]
      const kpiValuesRow = wsData[kpiHeaderIndex + 2]

      expect(kpiLabelsRow).toEqual(['TOTAL UNITS SOLD', 'GROSS REVENUE'])
      expect(kpiValuesRow).toEqual(['45 pcs', '₱ 125,400'])
    })

    it('generates structured data table headers and data rows in Zone 3', () => {
      const { wsData } = buildExcelAoaData({
        kpis: sampleKpis,
        columns: sampleColumns,
        data: sampleData,
      })

      const tableHeaderRow = wsData.find((row) => row[0] === 'Item Name')
      expect(tableHeaderRow).toEqual(['Item Name', 'SKU Code', 'Units'])

      const dataRow1 = wsData.find((row) => row[0] === 'Yamalube Engine Oil')
      expect(dataRow1).toEqual(['Yamalube Engine Oil', 'YAM-OIL-10W40', 20])
    })

    it('generates managerial audit sign-off lines in Zone 4', () => {
      const { wsData } = buildExcelAoaData({
        columns: sampleColumns,
        data: sampleData,
        generatedBy: 'Store Manager Alex',
      })

      const signOffHeader = wsData.find((row) => row[0] === 'MANAGERIAL AUDIT & VERIFICATION SIGN-OFF')
      expect(signOffHeader).toBeDefined()

      const preparedByRow = wsData.find((row) => String(row[0]).includes('Prepared By'))
      expect(preparedByRow).toBeDefined()

      const signatureRow = wsData.find((row) => String(row[0]).includes('Store Manager Alex'))
      expect(signatureRow).toBeDefined()
    })

    it('configures merged cell coordinates spanning across all columns', () => {
      const { merges } = buildExcelAoaData({
        columns: sampleColumns,
        kpis: sampleKpis,
      })

      // Merges should cover company banner, subtitle, title, metadata, and KPI title
      expect(merges.length).toBeGreaterThanOrEqual(5)
      expect(merges[0]).toEqual({ s: { r: 0, c: 0 }, e: { r: 0, c: 5 } })
    })

    it('sets column width specifications matching columns array', () => {
      const { cols } = buildExcelAoaData({
        columns: sampleColumns,
      })

      expect(cols).toEqual([
        { wch: 25 },
        { wch: 18 },
        { wch: 10 },
      ])
    })
  })

  describe('exportProfessionalExcel', () => {
    it('creates workbook, appends worksheet with sanitized name, and executes writer', () => {
      const mockWriter = vi.fn()

      const result = exportProfessionalExcel({
        filename: 'monthly-inventory-audit',
        sheetName: 'Audit [2026]*?',
        reportTitle: 'Inventory Stock Valuation',
        columns: sampleColumns,
        data: sampleData,
        writer: mockWriter,
      })

      expect(mockWriter).toHaveBeenCalledTimes(1)
      const callArgs = mockWriter.mock.calls[0]
      const workbookArg = callArgs[0]
      const filenameArg = callArgs[1]

      // Verify filename contains slug and date
      expect(filenameArg).toContain('monthly-inventory-audit-')
      expect(filenameArg).toContain('.xlsx')
      expect(result.finalFilename).toBe(filenameArg)

      // Verify sheet name was sanitized (removed invalid Excel chars [ ] * ?)
      expect(workbookArg.SheetNames[0]).toBe('Audit 2026')
    })
  })
})
