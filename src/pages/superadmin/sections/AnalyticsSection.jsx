import { useMemo, useState } from 'react'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import EmojiEventsRoundedIcon from '@mui/icons-material/EmojiEventsRounded'
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded'
import ConstructionRoundedIcon from '@mui/icons-material/ConstructionRounded'
import FileDownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded'
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded'
import { summarizeSaleItems } from './superadminUtils'
import { computeTopSoldSpareParts } from './analyticsUtils'
import { exportProfessionalExcel, exportBrandedPdf } from '../../../services/reportExportService'
import './AnalyticsSection.css'

export default function AnalyticsSection({
  transactionLogs = [],
  isDarkMode = true,
  currentUser = null,
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [paymentFilter, setPaymentFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [partsSearchTerm, setPartsSearchTerm] = useState('')
  const [partsSortBy, setPartsSortBy] = useState('qty') // 'qty' | 'revenue'
  const [partsPage, setPartsPage] = useState(1)
  const partsPageSize = 8
  const [fromDateFilter, setFromDateFilter] = useState(() => {
    const initialDate = new Date()
    return `${initialDate.getFullYear()}-${String(initialDate.getMonth() + 1).padStart(2, '0')}-${String(initialDate.getDate()).padStart(2, '0')}`
  })
  const [toDateFilter, setToDateFilter] = useState(() => {
    const initialDate = new Date()
    return `${initialDate.getFullYear()}-${String(initialDate.getMonth() + 1).padStart(2, '0')}-${String(initialDate.getDate()).padStart(2, '0')}`
  })
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedTransaction, setSelectedTransaction] = useState(null)
  const pageSize = 6

  const getLogDate = (log) => {
    const rawValue = log?.createdAt || log?.timestamp

    if (rawValue && typeof rawValue.toDate === 'function') {
      return rawValue.toDate()
    }

    if (rawValue instanceof Date) {
      return rawValue
    }

    if (typeof rawValue === 'string') {
      const parsed = new Date(rawValue)
      if (!Number.isNaN(parsed.getTime())) {
        return parsed
      }
    }

    if (typeof rawValue === 'number') {
      return new Date(rawValue)
    }

    return null
  }

  const today = new Date()
  const todayDateValue = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const fromDate = fromDateFilter ? new Date(`${fromDateFilter}T00:00:00`) : null
  const toDate = toDateFilter ? new Date(`${toDateFilter}T00:00:00`) : null
  const hasValidDateRange = (!fromDate || !Number.isNaN(fromDate.getTime()))
    && (!toDate || !Number.isNaN(toDate.getTime()))
    && (!fromDate || !toDate || fromDate <= toDate)
  const toDateExclusive = toDate && !Number.isNaN(toDate.getTime()) ? new Date(toDate) : null
  toDateExclusive?.setDate(toDateExclusive.getDate() + 1)

  const selectedDateTransactions = transactionLogs.filter((log) => {
    const createdAt = getLogDate(log)
    return hasValidDateRange
      && createdAt
      && (!fromDate || createdAt >= fromDate)
      && (!toDateExclusive || createdAt < toDateExclusive)
  })

  const totalSales = selectedDateTransactions.reduce((sum, log) => sum + Number(log.grandTotal || 0), 0)
  const {
    sparePartsSales,
    serviceSales,
    serviceTransactionCount,
  } = selectedDateTransactions.reduce(
    (acc, log) => {
      const grandTotal = Number(log.grandTotal || 0)
      const summary = summarizeSaleItems(log.items, log.totalQuantity, log.subtotal)
      const partsRaw =
        log.partsSubtotal !== undefined && log.partsSubtotal !== null && summary.serviceSubtotal === 0
          ? Number(log.partsSubtotal || 0)
          : summary.partsSubtotal
      const serviceRaw =
        log.serviceSubtotal !== undefined && log.serviceSubtotal !== null && Number(log.serviceSubtotal) > 0
          ? Number(log.serviceSubtotal || 0)
          : summary.serviceSubtotal
      const combinedRaw = partsRaw + serviceRaw

      let serviceShare = 0
      if (combinedRaw > 0 && serviceRaw > 0) {
        serviceShare = Number(((grandTotal * serviceRaw) / combinedRaw).toFixed(2))
      } else if (summary.hasServices && grandTotal > 0 && partsRaw === 0) {
        serviceShare = grandTotal
      }
      const partsShare = Number((grandTotal - serviceShare).toFixed(2))

      return {
        sparePartsSales: Number((acc.sparePartsSales + partsShare).toFixed(2)),
        serviceSales: Number((acc.serviceSales + serviceShare).toFixed(2)),
        serviceTransactionCount: acc.serviceTransactionCount + (serviceRaw > 0 || summary.hasServices ? 1 : 0),
      }
    },
    { sparePartsSales: 0, serviceSales: 0, serviceTransactionCount: 0 },
  )

  const cashSales = selectedDateTransactions
    .filter((log) => String(log.paymentMethodKey || log.paymentMethod || '').toLowerCase() === 'cash')
    .reduce((sum, log) => sum + Number(log.grandTotal || 0), 0)
  const onlineSales = selectedDateTransactions
    .filter((log) => {
      const method = String(log.paymentMethodKey || log.paymentMethod || '').toLowerCase()
      return ['gcash', 'card', 'bank', 'bank transfer'].includes(method)
    })
    .reduce((sum, log) => sum + Number(log.grandTotal || 0), 0)
  const transactionCount = selectedDateTransactions.length

  const sortedSales = [...selectedDateTransactions].sort((a, b) => {
    const aTime = getLogDate(a)?.getTime?.() ?? 0
    const bTime = getLogDate(b)?.getTime?.() ?? 0
    return bTime - aTime
  })

  const filteredSales = sortedSales.filter((log) => {
    const normalizedSearch = searchTerm.trim().toLowerCase()
    const method = String(log.paymentMethodKey || log.paymentMethod || '').toLowerCase()
    const itemSummary = summarizeSaleItems(log.items, log.totalQuantity, log.subtotal)
    const searchableText = `${log.transactionId || log.id} ${log.customer || ''} ${log.paymentMethod || ''} ${itemSummary.searchableText}`.toLowerCase()

    const matchesSearch = !normalizedSearch || searchableText.includes(normalizedSearch)
    const matchesPayment = paymentFilter === 'all' || method === paymentFilter
    const matchesType =
      typeFilter === 'all' ||
      (typeFilter === 'with-service' && itemSummary.hasServices) ||
      (typeFilter === 'parts-only' && !itemSummary.hasServices)

    return matchesSearch && matchesPayment && matchesType
  })

  const totalPages = Math.max(1, Math.ceil(filteredSales.length / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const paginatedSales = filteredSales.slice(
    (safeCurrentPage - 1) * pageSize,
    safeCurrentPage * pageSize,
  )

  const formatLogDate = (log) => {
    const date = getLogDate(log)
    return date
      ? date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
      : 'Date unavailable'
  }

  const formatPeso = (value) =>
    `₱ ${Number(value || 0).toLocaleString('en-PH', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    })}`

  const formatReportDate = (dateValue) => {
    if (!dateValue) {
      return 'Any date'
    }

    return new Date(`${dateValue}T00:00:00`).toLocaleDateString('en-PH', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const topSoldSpareParts = useMemo(() => {
    return computeTopSoldSpareParts(selectedDateTransactions, partsSortBy)
  }, [selectedDateTransactions, partsSortBy])

  const filteredSpareParts = useMemo(() => {
    if (!partsSearchTerm.trim()) return topSoldSpareParts
    const q = partsSearchTerm.trim().toLowerCase()
    return topSoldSpareParts.filter(
      (part) =>
        part.name.toLowerCase().includes(q) ||
        part.sku.toLowerCase().includes(q),
    )
  }, [topSoldSpareParts, partsSearchTerm])

  const maxPartQty = useMemo(() => {
    return Math.max(...topSoldSpareParts.map((p) => p.totalQty), 1)
  }, [topSoldSpareParts])

  const totalSparePartsUnits = useMemo(() => {
    return topSoldSpareParts.reduce((sum, p) => sum + p.totalQty, 0)
  }, [topSoldSpareParts])

  const paginatedSpareParts = useMemo(() => {
    const startIndex = (partsPage - 1) * partsPageSize
    return filteredSpareParts.slice(startIndex, startIndex + partsPageSize)
  }, [filteredSpareParts, partsPage, partsPageSize])

  const totalPartsPages = Math.max(1, Math.ceil(filteredSpareParts.length / partsPageSize))

  const selectedSummary = selectedTransaction
    ? summarizeSaleItems(
        selectedTransaction.items,
        selectedTransaction.totalQuantity,
        selectedTransaction.subtotal,
      )
    : null

  const handleExportTopPartsExcel = () => {
    const kpis = [
      { label: 'Top Seller', value: topSoldSpareParts[0]?.name || 'N/A' },
      { label: 'Total Units Sold', value: `${totalSparePartsUnits} pcs` },
      { label: 'Total Parts Revenue', value: formatPeso(sparePartsSales) },
      { label: 'Distinct Parts Sold', value: topSoldSpareParts.length },
    ]

    const columns = [
      { header: 'Rank', key: 'rank', wch: 8 },
      { header: 'Spare Part Name', key: 'name', wch: 32 },
      { header: 'SKU / Code', key: 'sku', wch: 18 },
      { header: 'Units Sold', key: 'totalQty', wch: 14 },
      { header: 'Order Count', key: 'transactionCount', wch: 14 },
      { header: 'Unit Price', key: 'unitPriceFormatted', wch: 18 },
      { header: 'Total Revenue', key: 'totalRevenueFormatted', wch: 20 },
      { header: 'Volume Share', key: 'volumeShare', wch: 16 },
    ]

    const exportRows = filteredSpareParts.map((part, idx) => {
      const pct = Math.round((part.totalQty / maxPartQty) * 100)
      return {
        rank: `#${idx + 1}`,
        name: part.name,
        sku: part.sku,
        totalQty: `${part.totalQty} pcs`,
        transactionCount: `${part.transactionCount} order(s)`,
        unitPriceFormatted: formatPeso(part.unitPrice),
        totalRevenueFormatted: formatPeso(part.totalRevenue),
        volumeShare: `${pct}% of #1`,
      }
    })

    exportProfessionalExcel({
      filename: 'bykelink-top-spare-parts-report',
      sheetName: 'Top Spare Parts',
      reportTitle: 'MOST SOLD SPARE PARTS PERFORMANCE REPORT',
      subtitle: 'Motorcycle Dealership Product Velocity & Revenue Tracking',
      periodText: `${formatReportDate(fromDateFilter)} to ${formatReportDate(toDateFilter)}`,
      generatedBy: currentUser?.displayName || currentUser?.email || 'Administrator',
      kpis,
      columns,
      data: exportRows,
    })
  }

  const handleExportTopPartsPdf = () => {
    const kpis = [
      { label: 'Top Seller', value: topSoldSpareParts[0]?.name || 'N/A' },
      { label: 'Total Units Sold', value: `${totalSparePartsUnits} pcs` },
      { label: 'Total Parts Revenue', value: formatPeso(sparePartsSales) },
      { label: 'Distinct Parts Sold', value: topSoldSpareParts.length },
    ]

    const columns = [
      { header: 'Rank', key: 'rank' },
      { header: 'Spare Part Name', key: 'name' },
      { header: 'SKU', key: 'sku' },
      { header: 'Units Sold', key: 'totalQty' },
      { header: 'Orders', key: 'transactionCount' },
      { header: 'Unit Price', key: 'unitPriceFormatted' },
      { header: 'Total Revenue', key: 'totalRevenueFormatted' },
    ]

    const exportRows = filteredSpareParts.map((part, idx) => ({
      rank: `#${idx + 1}`,
      name: part.name,
      sku: part.sku,
      totalQty: `${part.totalQty} pcs`,
      transactionCount: `${part.transactionCount}`,
      unitPriceFormatted: formatPeso(part.unitPrice),
      totalRevenueFormatted: formatPeso(part.totalRevenue),
    }))

    exportBrandedPdf({
      filename: 'bykelink-top-spare-parts-report',
      title: 'MOST SOLD SPARE PARTS PERFORMANCE REPORT',
      subtitle: 'Motorcycle Dealership Product Velocity & Revenue Tracking',
      periodText: `${formatReportDate(fromDateFilter)} to ${formatReportDate(toDateFilter)}`,
      generatedBy: currentUser?.displayName || currentUser?.email || 'Administrator',
      kpis,
      columns,
      data: exportRows,
      orientation: 'portrait',
    })
  }

  const handleExportSalesFinancialExcel = () => {
    const kpis = [
      { label: 'Total Sales', value: formatPeso(totalSales) },
      { label: 'Spare Parts Revenue', value: formatPeso(sparePartsSales) },
      { label: 'Service Labor Revenue', value: formatPeso(serviceSales) },
      { label: 'Cash Payments', value: formatPeso(cashSales) },
      { label: 'Online Payments', value: formatPeso(onlineSales) },
      { label: 'Total Transactions', value: transactionCount },
    ]

    const columns = [
      { header: 'Transaction Date', key: 'dateText', wch: 18 },
      { header: 'Transaction ID / Order #', key: 'id', wch: 22 },
      { header: 'Customer', key: 'customerName', wch: 24 },
      { header: 'Parts Subtotal', key: 'partsFormatted', wch: 18 },
      { header: 'Service Subtotal', key: 'serviceFormatted', wch: 18 },
      { header: 'Gross Total', key: 'totalFormatted', wch: 18 },
      { header: 'Payment Method', key: 'paymentMethod', wch: 16 },
      { header: 'Cashier / Processed By', key: 'cashier', wch: 22 },
    ]

    const exportRows = selectedDateTransactions.map((tx) => {
      const d = getLogDate(tx)
      const partsAmt = Number(tx.partsSubtotal ?? (tx.hasServices ? (Number(tx.totalAmount || 0) - Number(tx.serviceSubtotal || 0)) : (tx.totalAmount || 0)))
      const srvAmt = Number(tx.serviceSubtotal ?? 0)
      return {
        dateText: d ? d.toLocaleDateString() : '—',
        id: tx.transactionId || tx.id || '—',
        customerName: tx.customerName || tx.customerPhone || 'Walk-in Customer',
        partsFormatted: formatPeso(partsAmt),
        serviceFormatted: formatPeso(srvAmt),
        totalFormatted: formatPeso(tx.totalAmount || tx.subtotal || 0),
        paymentMethod: (tx.paymentMethod || 'cash').toUpperCase(),
        cashier: tx.cashierEmail || tx.cashierName || tx.recordedBy || 'Cashier',
      }
    })

    exportProfessionalExcel({
      filename: 'bykelink-sales-financial-report',
      sheetName: 'Sales & Revenue',
      reportTitle: 'SALES & REVENUE FINANCIAL AUDIT REPORT',
      subtitle: 'Point-of-Sale Transactions, Parts Revenue, and Labor Breakdown',
      periodText: `${formatReportDate(fromDateFilter)} to ${formatReportDate(toDateFilter)}`,
      generatedBy: currentUser?.displayName || currentUser?.email || 'Administrator',
      kpis,
      columns,
      data: exportRows,
    })
  }

  const handleExportSalesFinancialPdf = () => {
    const kpis = [
      { label: 'Total Sales', value: formatPeso(totalSales) },
      { label: 'Parts Revenue', value: formatPeso(sparePartsSales) },
      { label: 'Service Fees', value: formatPeso(serviceSales) },
      { label: 'Cash Payments', value: formatPeso(cashSales) },
      { label: 'Online Payments', value: formatPeso(onlineSales) },
      { label: 'Transactions', value: transactionCount },
    ]

    const columns = [
      { header: 'Date', key: 'dateText' },
      { header: 'Order #', key: 'id' },
      { header: 'Customer', key: 'customerName' },
      { header: 'Parts (₱)', key: 'partsFormatted' },
      { header: 'Service (₱)', key: 'serviceFormatted' },
      { header: 'Total (₱)', key: 'totalFormatted' },
      { header: 'Payment', key: 'paymentMethod' },
      { header: 'Cashier', key: 'cashier' },
    ]

    const exportRows = selectedDateTransactions.map((tx) => {
      const d = getLogDate(tx)
      const partsAmt = Number(tx.partsSubtotal ?? (tx.hasServices ? (Number(tx.totalAmount || 0) - Number(tx.serviceSubtotal || 0)) : (tx.totalAmount || 0)))
      const srvAmt = Number(tx.serviceSubtotal ?? 0)
      return {
        dateText: d ? d.toLocaleDateString() : '—',
        id: tx.transactionId || tx.id || '—',
        customerName: tx.customerName || tx.customerPhone || 'Walk-in Customer',
        partsFormatted: formatPeso(partsAmt),
        serviceFormatted: formatPeso(srvAmt),
        totalFormatted: formatPeso(tx.totalAmount || tx.subtotal || 0),
        paymentMethod: (tx.paymentMethod || 'cash').toUpperCase(),
        cashier: tx.cashierEmail || tx.cashierName || tx.recordedBy || 'Cashier',
      }
    })

    exportBrandedPdf({
      filename: 'bykelink-sales-financial-report',
      title: 'SALES & REVENUE FINANCIAL AUDIT REPORT',
      subtitle: 'Point-of-Sale Transactions, Parts Revenue, and Labor Breakdown',
      periodText: `${formatReportDate(fromDateFilter)} to ${formatReportDate(toDateFilter)}`,
      generatedBy: currentUser?.displayName || currentUser?.email || 'Administrator',
      kpis,
      columns,
      data: exportRows,
      orientation: 'landscape',
    })
  }

  return (
    <section className={`analytics-section ${!isDarkMode ? 'light-mode' : ''}`}>
      <header className="analytics-report-header">
        <div>
          <p className="analytics-eyebrow">Operations report</p>
          <h1>Sales Analytics</h1>
          <p className="analytics-report-subtitle">Spare parts, service fees, and transaction activity for the selected date range</p>
        </div>
        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportSalesFinancialExcel}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-2 text-xs font-bold text-emerald-300 transition-colors"
              title="Export Financial Sales Audit to Excel (.xlsx)"
            >
              <FileDownloadRoundedIcon sx={{ fontSize: 16 }} />
              Export Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={handleExportSalesFinancialPdf}
              className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 px-3 py-2 text-xs font-bold text-red-300 transition-colors"
              title="Download Financial Sales Statement PDF"
            >
              <PictureAsPdfRoundedIcon sx={{ fontSize: 16 }} />
              Download PDF
            </button>
          </div>
          <div className="analytics-report-date">
            <span>Reporting period</span>
            <strong>From: {formatReportDate(fromDateFilter)} To: {formatReportDate(toDateFilter)}</strong>
          </div>
        </div>
      </header>

      <div className="analytics-kpi-grid">
        <article className="analytics-kpi-card analytics-kpi-card--primary">
          <span>Total sales</span>
          <strong>{formatPeso(totalSales)}</strong>
          <small>Combined parts &amp; service sales</small>
        </article>
        <article className="analytics-kpi-card">
          <span>Spare parts sales</span>
          <strong>{formatPeso(sparePartsSales)}</strong>
          <small>{totalSparePartsUnits} units sold in range</small>
        </article>
        <article className="analytics-kpi-card analytics-kpi-card--service">
          <span>Service sales</span>
          <strong>{formatPeso(serviceSales)}</strong>
          <small>{serviceTransactionCount} transaction(s) with service</small>
        </article>
        <article className="analytics-kpi-card">
          <span>Cash sales</span>
          <strong>{formatPeso(cashSales)}</strong>
          <small>For the selected date range</small>
        </article>
        <article className="analytics-kpi-card">
          <span>Online payments</span>
          <strong>{formatPeso(onlineSales)}</strong>
          <small>GCash, card, and bank transfer</small>
        </article>
        <article className="analytics-kpi-card">
          <span>Transactions</span>
          <strong>{transactionCount}</strong>
          <small>In the selected date range</small>
        </article>
      </div>

      {/* MOST SOLD SPARE PARTS SECTION */}
      <article className="analytics-table-panel analytics-top-parts-panel mb-8">
        <div className="analytics-panel-heading">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 text-amber-400">
              <ConstructionRoundedIcon sx={{ fontSize: 20 }} />
            </div>
            <div>
              <p className="analytics-eyebrow">Product Performance</p>
              <h2>Most Sold Spare Parts</h2>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleExportTopPartsExcel}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1.5 text-xs font-bold text-emerald-300 transition-colors"
              title="Download Excel Report"
            >
              <FileDownloadRoundedIcon sx={{ fontSize: 15 }} />
              Export Excel (.xlsx)
            </button>
            <button
              type="button"
              onClick={handleExportTopPartsPdf}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 px-3 py-1.5 text-xs font-bold text-red-300 transition-colors"
              title="Download PDF Report"
            >
              <PictureAsPdfRoundedIcon sx={{ fontSize: 15 }} />
              Download PDF
            </button>
            <span className="analytics-record-count">
              {topSoldSpareParts.length} distinct spare part(s) sold
            </span>
          </div>
        </div>

        {/* Podium Top 3 */}
        {topSoldSpareParts.length > 0 && (
          <div className="analytics-podium-grid">
            {topSoldSpareParts.slice(0, 3).map((part, index) => {
              const medalColors = [
                'from-amber-500/20 to-amber-700/5 border-amber-500/40 text-amber-300',
                'from-slate-300/20 to-slate-500/5 border-slate-300/40 text-slate-200',
                'from-amber-700/20 to-amber-900/5 border-amber-700/40 text-amber-500',
              ]
              const medalLabels = ['#1 Top Seller', '#2 Runner Up', '#3 Third Place']
              return (
                <div
                  key={part.key}
                  className={`analytics-podium-card rounded-2xl border p-4 bg-linear-to-b ${medalColors[index] || ''}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/40 text-[11px] font-black uppercase tracking-wider">
                      <EmojiEventsRoundedIcon sx={{ fontSize: 15 }} />
                      {medalLabels[index]}
                    </span>
                    <span className="text-xs font-bold opacity-70">SKU: {part.sku}</span>
                  </div>
                  <h4 className="mt-2.5 text-base font-black truncate" title={part.name}>
                    {part.name}
                  </h4>
                  <div className="mt-3 flex items-baseline justify-between">
                    <div>
                      <span className="text-2xl font-black">{part.totalQty}</span>
                      <span className="ml-1 text-xs opacity-70">pcs sold</span>
                    </div>
                    <strong className="text-sm font-bold text-emerald-400">
                      {formatPeso(part.totalRevenue)}
                    </strong>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Filter bar for spare parts */}
        <div className="analytics-filter-bar">
          <label className="analytics-search-field">
            <span>Search Spare Parts</span>
            <input
              type="search"
              value={partsSearchTerm}
              onChange={(e) => {
                setPartsSearchTerm(e.target.value)
                setPartsPage(1)
              }}
              placeholder="Search part name or SKU..."
            />
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`analytics-filter-clear ${partsSortBy === 'qty' ? 'is-active font-bold text-white bg-amber-600/30 border-amber-500' : ''}`}
              onClick={() => setPartsSortBy('qty')}
            >
              Sort by Units Sold
            </button>
            <button
              type="button"
              className={`analytics-filter-clear ${partsSortBy === 'revenue' ? 'is-active font-bold text-white bg-emerald-600/30 border-emerald-500' : ''}`}
              onClick={() => setPartsSortBy('revenue')}
            >
              Sort by Revenue
            </button>
          </div>
        </div>

        {/* Table of ranked spare parts */}
        {paginatedSpareParts.length > 0 ? (
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>Rank</th>
                  <th>Spare Part Name</th>
                  <th>SKU</th>
                  <th style={{ minWidth: '220px' }}>Units Sold</th>
                  <th className="analytics-table-amount">Unit Price</th>
                  <th className="analytics-table-amount">Total Revenue</th>
                </tr>
              </thead>
              <tbody>
                {paginatedSpareParts.map((part, idx) => {
                  const rank = (partsPage - 1) * partsPageSize + idx + 1
                  const pct = Math.max(8, Math.round((part.totalQty / maxPartQty) * 100))
                  return (
                    <tr key={part.key}>
                      <td>
                        <span className={`inline-flex items-center justify-center h-6 w-6 rounded-full text-xs font-black ${
                          rank === 1
                            ? 'bg-amber-500 text-black'
                            : rank === 2
                              ? 'bg-slate-300 text-black'
                              : rank === 3
                                ? 'bg-amber-700 text-white'
                                : 'bg-white/10 text-white/70'
                        }`}>
                          {rank}
                        </span>
                      </td>
                      <td>
                        <strong className="text-white text-sm">{part.name}</strong>
                      </td>
                      <td>
                        <span className="text-xs font-mono opacity-70">{part.sku}</span>
                      </td>
                      <td>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-black text-amber-400">{part.totalQty} pcs</span>
                            <span className="opacity-60">{part.transactionCount} order(s)</span>
                          </div>
                          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-red-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="analytics-table-amount">
                        {formatPeso(part.unitPrice)}
                      </td>
                      <td className="analytics-table-amount">
                        <strong className="text-emerald-400 font-bold">{formatPeso(part.totalRevenue)}</strong>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="analytics-empty-state">
            {topSoldSpareParts.length === 0
              ? 'No spare parts sold in the selected date range.'
              : 'No spare parts match your search filter.'}
          </div>
        )}

        {filteredSpareParts.length > partsPageSize && (
          <div className="analytics-pagination">
            <span>
              Showing {(partsPage - 1) * partsPageSize + 1}-{Math.min(partsPage * partsPageSize, filteredSpareParts.length)} of {filteredSpareParts.length}
            </span>
            <div className="analytics-pagination-actions">
              <button
                type="button"
                disabled={partsPage === 1}
                onClick={() => setPartsPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </button>
              <strong>Page {partsPage} of {totalPartsPages}</strong>
              <button
                type="button"
                disabled={partsPage === totalPartsPages}
                onClick={() => setPartsPage((p) => Math.min(totalPartsPages, p + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </article>

      <article className="analytics-table-panel">
        <div className="analytics-panel-heading">
          <div>
            <p className="analytics-eyebrow">Transaction register</p>
            <h2>Sales activity</h2>
          </div>
          <span className="analytics-record-count">{transactionCount} records • Click a row to view items</span>
        </div>

        <div className="analytics-filter-bar">
          <label className="analytics-search-field">
            <span>Search</span>
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value)
                setCurrentPage(1)
              }}
              placeholder="Search transaction, customer, or product"
            />
          </label>
          <label className="analytics-date-field">
            <span>From</span>
            <input
              type="date"
              value={fromDateFilter}
              max={toDateFilter || undefined}
              onChange={(event) => {
                setFromDateFilter(event.target.value)
                setCurrentPage(1)
              }}
              aria-label="From date"
            />
          </label>
          <label className="analytics-date-field">
            <span>To</span>
            <input
              type="date"
              value={toDateFilter}
              min={fromDateFilter || undefined}
              onChange={(event) => {
                setToDateFilter(event.target.value)
                setCurrentPage(1)
              }}
              aria-label="To date"
            />
          </label>
          <label className="analytics-select-field">
            <span>Payment method</span>
            <select
              value={paymentFilter}
              onChange={(event) => {
                setPaymentFilter(event.target.value)
                setCurrentPage(1)
              }}
            >
              <option value="all">All methods</option>
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
              <option value="card">Card</option>
              <option value="bank">Bank Transfer</option>
              <option value="bank transfer">Bank Transfer (label)</option>
            </select>
          </label>
          {(searchTerm || paymentFilter !== 'all' || fromDateFilter !== todayDateValue || toDateFilter !== todayDateValue) && (
            <button
              type="button"
              className="analytics-filter-clear"
              onClick={() => {
                setSearchTerm('')
                setPaymentFilter('all')
                setFromDateFilter(todayDateValue)
                setToDateFilter(todayDateValue)
                setCurrentPage(1)
              }}
            >
              Clear filters
            </button>
          )}
        </div>

        {paginatedSales.length > 0 ? (
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>Transaction</th>
                  <th>Customer</th>
                  <th>Products / Qty</th>
                  <th>Payment method</th>
                  <th>Date and time</th>
                  <th className="analytics-table-amount">Amount</th>
                </tr>
              </thead>
              <tbody>
                {paginatedSales.map((log) => {
                  const summary = summarizeSaleItems(log.items, log.totalQuantity)
                  return (
                    <tr
                      key={log.id}
                      className="is-clickable"
                      tabIndex={0}
                      role="button"
                      aria-label={`View purchased items for ${log.transactionId || log.id}`}
                      onClick={() => setSelectedTransaction(log)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setSelectedTransaction(log)
                        }
                      }}
                    >
                      <td><strong>{log.transactionId || log.id}</strong></td>
                      <td>{log.customer || 'Walk-in Customer'}</td>
                      <td>
                        <div className="analytics-items-cell">
                          <span className="analytics-items-summary">{summary.summaryLabel}</span>
                          <div className="analytics-items-badges">
                            {summary.totalQuantity > 0 && (
                              <span className="analytics-qty-badge">
                                {summary.totalQuantity} {summary.totalQuantity === 1 ? 'pc' : 'pcs'}
                              </span>
                            )}
                            {summary.isBulk && (
                              <span className="analytics-bulk-badge">Bulk</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td><span className="analytics-payment-label">{log.paymentMethod || 'Cash'}</span></td>
                      <td>{formatLogDate(log)}</td>
                      <td className="analytics-table-amount"><strong>{formatPeso(log.grandTotal)}</strong></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="analytics-empty-state">
            {selectedDateTransactions.length > 0
              ? 'No transactions match the selected filters.'
              : hasValidDateRange
                ? 'No sales recorded for this date range.'
                : 'The start date must be on or before the end date.'}
          </div>
        )}

        {filteredSales.length > 0 && (
          <div className="analytics-pagination">
            <span>
              Showing {(safeCurrentPage - 1) * pageSize + 1}-{Math.min(safeCurrentPage * pageSize, filteredSales.length)} of {filteredSales.length}
            </span>
            <div className="analytics-pagination-actions">
              <button
                type="button"
                disabled={safeCurrentPage === 1}
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              >
                Previous
              </button>
              <strong>Page {safeCurrentPage} of {totalPages}</strong>
              <button
                type="button"
                disabled={safeCurrentPage === totalPages}
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </article>

      {selectedTransaction && selectedSummary && (
        <div
          className="analytics-detail-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="analytics-tx-detail-title"
          onClick={() => setSelectedTransaction(null)}
        >
          <div
            className="analytics-detail-modal"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="analytics-detail-header">
              <div>
                <p className="analytics-eyebrow">Walk-in Purchase Breakdown</p>
                <h3 id="analytics-tx-detail-title">
                  {selectedTransaction.transactionId || selectedTransaction.id}
                </h3>
                <p className="analytics-detail-meta">
                  {selectedTransaction.customer || 'Walk-in Customer'} • {formatLogDate(selectedTransaction)} •{' '}
                  {selectedTransaction.paymentMethod || 'Cash'}
                </p>
              </div>
              <div className="analytics-detail-header-right">
                {selectedSummary.isBulk ? (
                  <span className="analytics-bulk-badge">Bulk Purchase ({selectedSummary.totalQuantity} pcs)</span>
                ) : (
                  selectedSummary.totalQuantity > 0 && (
                    <span className="analytics-qty-badge">{selectedSummary.totalQuantity} {selectedSummary.totalQuantity === 1 ? 'pc' : 'pcs'}</span>
                  )
                )}
                <button
                  type="button"
                  onClick={() => setSelectedTransaction(null)}
                  className="analytics-detail-close"
                  aria-label="Close transaction details"
                >
                  <CloseRoundedIcon sx={{ fontSize: 18 }} />
                </button>
              </div>
            </div>

            <div className="analytics-detail-body">
              {selectedSummary.items.length > 0 ? (
                <div className="analytics-detail-items-wrap">
                  <table className="analytics-detail-items-table">
                    <thead>
                      <tr>
                        <th>Product / Item</th>
                        <th>SKU</th>
                        <th>Qty</th>
                        <th className="analytics-table-amount">Unit Price</th>
                        <th className="analytics-table-amount">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedSummary.items.map((item, idx) => (
                        <tr key={`${item.id || item.name}-${idx}`}>
                          <td><strong>{item.name}</strong></td>
                          <td>{item.sku || '—'}</td>
                          <td>
                            <span className="analytics-qty-badge">×{item.qty}</span>
                          </td>
                          <td className="analytics-table-amount">{formatPeso(item.unitPrice)}</td>
                          <td className="analytics-table-amount"><strong>{formatPeso(item.subtotal)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="analytics-detail-empty">
                  No itemized product list was saved on this legacy transaction record.
                </div>
              )}

              <div className="analytics-detail-totals">
                <div>
                  <span>Subtotal</span>
                  <strong>{formatPeso(selectedTransaction.subtotal)}</strong>
                </div>
                {Number(selectedTransaction.discount || 0) > 0 && (
                  <div>
                    <span>Discount</span>
                    <strong>- {formatPeso(selectedTransaction.discount)}</strong>
                  </div>
                )}
                <div>
                  <span>VAT (12%)</span>
                  <strong>{formatPeso(selectedTransaction.vat)}</strong>
                </div>
                <div className="is-grand">
                  <span>Grand Total</span>
                  <strong>{formatPeso(selectedTransaction.grandTotal)}</strong>
                </div>
                <div>
                  <span>Amount Tendered</span>
                  <strong>{formatPeso(selectedTransaction.amountTendered)}</strong>
                </div>
                <div>
                  <span>Change</span>
                  <strong>{formatPeso(selectedTransaction.change)}</strong>
                </div>
              </div>

              {selectedTransaction.notes && (
                <p className="analytics-detail-notes">
                  <strong>Notes:</strong> {selectedTransaction.notes}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
