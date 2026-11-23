import { useMemo, useState } from 'react'
import DownloadRoundedIcon from '@mui/icons-material/DownloadRounded'
import CloudDownloadRoundedIcon from '@mui/icons-material/CloudDownloadRounded'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import VerifiedUserRoundedIcon from '@mui/icons-material/VerifiedUserRounded'
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded'
import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { summarizeSaleItems } from './superadminUtils'
import './TransactionHistorySection.css'

const MODULE_OPTIONS = [
  'all',
  'POS',
  'Inventory',
  'Service',
  'User Management',
  'Master Data',
]

const normalizeText = (value = '') => String(value).trim().toLowerCase()

const toDateObj = (value) => {
  if (!value) return null
  if (typeof value?.toDate === 'function') return value.toDate()
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value === 'object' && typeof value.seconds === 'number') {
    const d = new Date(value.seconds * 1000)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

const getModuleToneClass = (moduleName = '') => {
  const key = normalizeText(moduleName)
  if (key === 'pos') return 'is-pos'
  if (key === 'inventory') return 'is-inventory'
  if (key === 'service') return 'is-service'
  if (key === 'financing') return 'is-financing'
  if (key === 'user management') return 'is-users'
  return 'is-master'
}

export default function TransactionHistorySection({
  auditLogs = [],
  transactionLogs = [],
  formatDate,
  formatCurrency,
  isDarkMode = true,
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [moduleFilter, setModuleFilter] = useState('all')
  const [actionFilter, setActionFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedEntry, setSelectedEntry] = useState(null)
  const pageSize = 15

  const unifiedLogs = useMemo(() => {
    const loggedSaleIds = new Set(
      auditLogs
        .filter((entry) => entry.action === 'SALE_COMPLETED' && entry.targetId)
        .map((entry) => String(entry.targetId)),
    )

    const normalizedAudit = auditLogs.map((entry) => ({
      id: entry.id || entry.eventId,
      eventId: entry.eventId || entry.id,
      module: entry.module || 'System',
      action: entry.action || 'SYSTEM_EVENT',
      summary: entry.summary || '',
      targetType: entry.targetType || '',
      targetId: entry.targetId || '',
      targetName: entry.targetName || '',
      previousData: entry.previousData ?? null,
      newData: entry.newData ?? null,
      amount: entry.amount !== undefined && entry.amount !== null ? Number(entry.amount) : null,
      performedBy: entry.performedBy || { email: 'system', name: 'System', role: 'system' },
      verifiedBy: entry.verifiedBy || null,
      metadata: entry.metadata || null,
      createdAt: entry.createdAt || entry.timestamp || null,
    }))

    const legacySales = transactionLogs
      .filter((tx) => {
        const txId = String(tx.transactionId || tx.id || '')
        return txId && !loggedSaleIds.has(txId)
      })
      .map((tx) => ({
        id: `legacy-${tx.id}`,
        eventId: tx.transactionId || tx.id,
        module: 'POS',
        action: 'SALE_COMPLETED',
        summary: `POS sale ${tx.transactionId || tx.id} (${tx.paymentMethod || 'Cash'}) for ${tx.customer || 'Walk-in Customer'}`,
        targetType: 'transaction',
        targetId: tx.transactionId || tx.id,
        targetName: tx.customer || 'Walk-in Customer',
        previousData: null,
        newData: {
          paymentMethod: tx.paymentMethod || 'Cash',
          items: tx.items || [],
          grandTotal: Number(tx.grandTotal || 0),
        },
        amount: Number(tx.grandTotal || 0),
        performedBy: { email: 'pos-cashier', name: 'Cashier POS', role: 'cashier personnel' },
        verifiedBy: null,
        metadata: null,
        createdAt: tx.createdAt || tx.timestamp || null,
      }))

    return [...normalizedAudit, ...legacySales].sort((a, b) => {
      const aTime = toDateObj(a.createdAt)?.getTime() ?? 0
      const bTime = toDateObj(b.createdAt)?.getTime() ?? 0
      return bTime - aTime
    })
  }, [auditLogs, transactionLogs])

  const actionOptions = useMemo(() => {
    const unique = new Set(unifiedLogs.map((entry) => entry.action).filter(Boolean))
    return ['all', ...Array.from(unique).sort()]
  }, [unifiedLogs])

  const dateFilteredLogs = useMemo(() => {
    const fromDate = dateFrom ? new Date(`${dateFrom}T00:00:00`) : null
    const toDate = dateTo ? new Date(`${dateTo}T00:00:00`) : null
    const isValidRange =
      (!fromDate || !Number.isNaN(fromDate.getTime())) &&
      (!toDate || !Number.isNaN(toDate.getTime())) &&
      (!fromDate || !toDate || fromDate <= toDate)

    if (!isValidRange) return []

    const toDateExclusive = toDate ? new Date(toDate) : null
    toDateExclusive?.setDate(toDateExclusive.getDate() + 1)

    return unifiedLogs.filter((entry) => {
      if (!fromDate && !toDateExclusive) return true
      const entryDate = toDateObj(entry.createdAt)
      return entryDate && (!fromDate || entryDate >= fromDate) && (!toDateExclusive || entryDate < toDateExclusive)
    })
  }, [unifiedLogs, dateFrom, dateTo])

  const filteredLogs = useMemo(() => {
    const needle = normalizeText(searchTerm)

    return dateFilteredLogs.filter((entry) => {
      if (moduleFilter !== 'all' && normalizeText(entry.module) !== normalizeText(moduleFilter)) {
        return false
      }
      if (actionFilter !== 'all' && entry.action !== actionFilter) {
        return false
      }
      if (!needle) return true

      const saleItemsSummary = summarizeSaleItems(entry.newData?.items, entry.newData?.totalQuantity)
      const haystack = normalizeText(
        [
          entry.eventId,
          entry.module,
          entry.action,
          entry.summary,
          entry.targetId,
          entry.targetName,
          saleItemsSummary.searchableText,
          entry.performedBy?.name,
          entry.performedBy?.email,
          entry.performedBy?.role,
          entry.verifiedBy?.email,
          entry.verifiedBy?.name,
        ].join(' '),
      )
      return haystack.includes(needle)
    })
  }, [dateFilteredLogs, moduleFilter, actionFilter, searchTerm])

  const summaryStats = useMemo(() => {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    let financialVolume = 0
    let inventoryEvents = 0
    let verifiedCount = 0
    let todayCount = 0

    filteredLogs.forEach((entry) => {
      if (entry.amount !== null && Number.isFinite(entry.amount)) {
        financialVolume += entry.amount
      }
      if (normalizeText(entry.module) === 'inventory') {
        inventoryEvents += 1
      }
      if (entry.verifiedBy?.email) {
        verifiedCount += 1
      }
      const d = toDateObj(entry.createdAt)
      if (d && d >= startOfToday) {
        todayCount += 1
      }
    })

    return {
      total: filteredLogs.length,
      financialVolume,
      inventoryEvents,
      verifiedCount,
      todayCount,
    }
  }, [filteredLogs])

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const startIndex = (safePage - 1) * pageSize
  const paginatedLogs = filteredLogs.slice(startIndex, startIndex + pageSize)

  const handleExportExcel = () => {
    const rows = filteredLogs.map((entry) => ({
      'Event ID': entry.eventId,
      'Date & Time': formatDate(entry.createdAt),
      Module: entry.module,
      Action: entry.action,
      Target: entry.targetName || entry.targetId || '—',
      Summary: entry.summary,
      'Performed By': entry.performedBy?.email || entry.performedBy?.name || 'System',
      'Actor Role': entry.performedBy?.role || '—',
      'Verified By': entry.verifiedBy?.email || '—',
      Amount: entry.amount !== null ? formatCurrency(entry.amount) : '—',
    }))

    const worksheet = XLSX.utils.json_to_sheet(rows)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Transaction History')
    worksheet['!cols'] = [
      { wch: 24 },
      { wch: 22 },
      { wch: 16 },
      { wch: 26 },
      { wch: 24 },
      { wch: 46 },
      { wch: 26 },
      { wch: 18 },
      { wch: 24 },
      { wch: 15 },
    ]
    XLSX.writeFile(workbook, `transaction-history-audit-${new Date().toISOString().split('T')[0]}.xlsx`)
  }

  const handleExportPDF = () => {
    const pdf = new jsPDF({ orientation: 'landscape' })
    const pageWidth = pdf.internal.pageSize.getWidth()

    pdf.setFontSize(16)
    pdf.text('System Transaction History Log (Audit Trail)', pageWidth / 2, 14, { align: 'center' })
    pdf.setFontSize(9)
    pdf.text(`Generated: ${formatDate(new Date())} • Total Records: ${filteredLogs.length}`, pageWidth / 2, 20, { align: 'center' })

    const body = filteredLogs.map((entry) => [
      formatDate(entry.createdAt),
      entry.module,
      entry.action,
      entry.summary || entry.targetName || '—',
      `${entry.performedBy?.email || entry.performedBy?.name || 'System'} (${entry.performedBy?.role || '—'})`,
      entry.verifiedBy?.email || '—',
      entry.amount !== null ? formatCurrency(entry.amount) : '—',
    ])

    pdf.autoTable({
      head: [['Date & Time', 'Module', 'Action', 'Summary', 'Performed By', 'Verified By', 'Amount']],
      body,
      startY: 26,
      styles: { fontSize: 8, cellPadding: 2.5 },
      headStyles: { fillColor: [225, 1, 0], textColor: [255, 255, 255], fontStyle: 'bold' },
      margin: { left: 10, right: 10 },
    })

    pdf.save(`transaction-history-audit-${new Date().toISOString().split('T')[0]}.pdf`)
  }

  return (
    <section className={`transaction-history-shell space-y-6 ${!isDarkMode ? 'light-mode' : ''}`}>
      <div className="transaction-history-header flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-red-400 mb-2">
            <HistoryRoundedIcon sx={{ fontSize: 14 }} />
            Admin-Only Audit Trail
          </div>
          <h2 className="transaction-history-title">Transaction History Log</h2>
          <p className="transaction-history-subtitle">
            Immutable audit trail of all POS sales, inventory changes, admin verifications, service bookings, and user access events.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={handleExportExcel}
            className="transaction-history-export-btn inline-flex items-center justify-center gap-2 px-4 py-2 text-sm"
          >
            <DownloadRoundedIcon sx={{ fontSize: 16 }} />
            Export Excel
          </button>
          <button
            type="button"
            onClick={handleExportPDF}
            className="transaction-history-export-btn inline-flex items-center justify-center gap-2 px-4 py-2 text-sm"
          >
            <CloudDownloadRoundedIcon sx={{ fontSize: 16 }} />
            Export PDF
          </button>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="transaction-history-kpi-card p-4">
          <p className="transaction-history-kpi-label">Logged Transactions</p>
          <h3 className="transaction-history-kpi-value">{summaryStats.total}</h3>
          <p className="transaction-history-kpi-note">{summaryStats.todayCount} recorded today</p>
        </article>
        <article className="transaction-history-kpi-card p-4">
          <p className="transaction-history-kpi-label">Financial Volume</p>
          <h3 className="transaction-history-kpi-value">{formatCurrency(summaryStats.financialVolume)}</h3>
          <p className="transaction-history-kpi-note">POS sales & service totals</p>
        </article>
        <article className="transaction-history-kpi-card p-4">
          <p className="transaction-history-kpi-label">Inventory Actions</p>
          <h3 className="transaction-history-kpi-value">{summaryStats.inventoryEvents}</h3>
          <p className="transaction-history-kpi-note">Creates, renames, stocks & deletes</p>
        </article>
        <article className="transaction-history-kpi-card p-4">
          <p className="transaction-history-kpi-label">Admin Verified</p>
          <h3 className="transaction-history-kpi-value">{summaryStats.verifiedCount}</h3>
          <p className="transaction-history-kpi-note">Verified name edits & deletions</p>
        </article>
      </div>

      <div className="transaction-history-board">
        <div className="mb-5 flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {MODULE_OPTIONS.map((mod) => (
              <button
                key={mod}
                type="button"
                onClick={() => {
                  setModuleFilter(mod)
                  setCurrentPage(1)
                }}
                className={`transaction-history-tab ${moduleFilter === mod ? 'is-active' : ''}`}
              >
                {mod === 'all' ? 'All Modules' : mod}
              </button>
            ))}
          </div>

          <div className="transaction-history-filters grid gap-2 md:grid-cols-4">
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setCurrentPage(1)
              }}
              placeholder="Search event, user, product, ID..."
              className="transaction-history-input"
            />

            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value)
                setCurrentPage(1)
              }}
              className="transaction-history-input"
            >
              {actionOptions.map((act) => (
                <option key={act} value={act}>
                  {act === 'all' ? 'All Action Types' : act}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={dateFrom}
              max={dateTo || undefined}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setCurrentPage(1)
              }}
              aria-label="From date"
              className="transaction-history-input"
            />

            <div className="flex gap-2">
              <input
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => {
                  setDateTo(e.target.value)
                  setCurrentPage(1)
                }}
                aria-label="To date"
                className="transaction-history-input flex-1"
              />
              {(searchTerm || moduleFilter !== 'all' || actionFilter !== 'all' || dateFrom || dateTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('')
                    setModuleFilter('all')
                    setActionFilter('all')
                    setDateFrom('')
                    setDateTo('')
                    setCurrentPage(1)
                  }}
                  className="transaction-history-clear-btn"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="transaction-history-table-wrap">
          <table className="transaction-history-table">
            <thead>
              <tr>
                <th>Date & Time</th>
                <th>Module</th>
                <th>Action</th>
                <th>Summary / Target</th>
                <th>Performed By</th>
                <th>Verified By</th>
                <th>Amount</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {paginatedLogs.length > 0 ? (
                paginatedLogs.map((entry) => {
                  const saleSummary =
                    entry.action === 'SALE_COMPLETED' || Array.isArray(entry.newData?.items)
                      ? summarizeSaleItems(entry.newData?.items, entry.newData?.totalQuantity)
                      : null

                  return (
                    <tr
                      key={entry.id}
                      onClick={() => setSelectedEntry(entry)}
                      className="cursor-pointer hover:bg-white/5 transition-colors"
                    >
                      <td className="whitespace-nowrap text-xs">{formatDate(entry.createdAt)}</td>
                      <td>
                        <span className={`transaction-history-module-pill ${getModuleToneClass(entry.module)}`}>
                          {entry.module}
                        </span>
                      </td>
                      <td>
                        <span className="transaction-history-action-code">{entry.action}</span>
                      </td>
                      <td>
                        <p className="font-semibold">{entry.summary || entry.targetName || '—'}</p>
                        {saleSummary && saleSummary.items.length > 0 && (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="opacity-85">{saleSummary.summaryLabel}</span>
                            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] font-bold">
                              {saleSummary.totalQuantity} {saleSummary.totalQuantity === 1 ? 'pc' : 'pcs'}
                            </span>
                            {saleSummary.isBulk && (
                              <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[10px] font-black uppercase text-amber-300">
                                Bulk
                              </span>
                            )}
                          </div>
                        )}
                        {entry.previousData?.name && entry.newData?.name && entry.previousData.name !== entry.newData.name && (
                          <p className="text-xs opacity-75 mt-0.5">
                            Name: <span className="line-through text-red-400">{entry.previousData.name}</span> →{' '}
                            <span className="font-bold text-emerald-400">{entry.newData.name}</span>
                          </p>
                        )}
                      </td>
                      <td>
                        <p className="font-semibold text-xs">{entry.performedBy?.name || entry.performedBy?.email || 'System'}</p>
                        <p className="text-[11px] opacity-65">
                          {entry.performedBy?.email || '—'} • {entry.performedBy?.role || '—'}
                        </p>
                      </td>
                      <td>
                        {entry.verifiedBy?.email ? (
                          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                            <VerifiedUserRoundedIcon sx={{ fontSize: 14 }} />
                            {entry.verifiedBy.email}
                          </span>
                        ) : (
                          <span className="opacity-45">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap font-bold">
                        {entry.amount !== null ? formatCurrency(entry.amount) : '—'}
                      </td>
                      <td>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation()
                            setSelectedEntry(entry)
                          }}
                          className="transaction-history-detail-btn"
                          title="Inspect audit details"
                        >
                          <VisibilityRoundedIcon sx={{ fontSize: 16 }} />
                        </button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan="8" className="transaction-history-empty">
                    No transaction history records match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs opacity-70">
          <span>
            Showing {filteredLogs.length === 0 ? 0 : startIndex + 1}-{Math.min(startIndex + pageSize, filteredLogs.length)} of {filteredLogs.length} records
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="transaction-history-page-btn disabled:opacity-40"
              >
                ‹ Prev
              </button>
              <span>
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="transaction-history-page-btn disabled:opacity-40"
              >
                Next ›
              </button>
            </div>
          )}
        </div>
      </div>

      {selectedEntry && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 99998, background: 'rgba(4,4,4,0.78)', backdropFilter: 'blur(8px)' }}
          onClick={() => setSelectedEntry(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className={`w-full max-w-2xl rounded-2xl border p-6 shadow-2xl max-h-[85vh] overflow-y-auto ${
              isDarkMode ? 'bg-[#141416] border-white/15 text-white' : 'bg-white border-gray-200 text-gray-900'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 pb-4 border-b border-white/10">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-400">
                  {selectedEntry.module} • {selectedEntry.action}
                </p>
                <h3 className="mt-1 text-lg font-black">{selectedEntry.eventId}</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEntry(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
              >
                <CloseRoundedIcon sx={{ fontSize: 18 }} />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <p>
                <strong>Summary:</strong> {selectedEntry.summary || '—'}
              </p>
              <p>
                <strong>Timestamp:</strong> {formatDate(selectedEntry.createdAt)}
              </p>
              <p>
                <strong>Target:</strong> {selectedEntry.targetName || '—'} ({selectedEntry.targetType || '—'}: {selectedEntry.targetId || '—'})
              </p>
              <p>
                <strong>Performed By:</strong> {selectedEntry.performedBy?.name || '—'} ({selectedEntry.performedBy?.email || '—'} • {selectedEntry.performedBy?.role || '—'})
              </p>
              {selectedEntry.verifiedBy && (
                <p>
                  <strong>Verified By:</strong> {selectedEntry.verifiedBy.name || selectedEntry.verifiedBy.email} ({selectedEntry.verifiedBy.role || 'admin'} via {selectedEntry.verifiedBy.method || 'verification'})
                </p>
              )}
              {selectedEntry.amount !== null && (
                <p>
                  <strong>Amount:</strong> {formatCurrency(selectedEntry.amount)}
                </p>
              )}
              {selectedEntry.newData?.paymentMethod && (
                <p>
                  <strong>Payment Method:</strong>{' '}
                  <span className="font-semibold text-emerald-400">
                    {selectedEntry.newData.paymentMethod}
                  </span>
                </p>
              )}

              {Array.isArray(selectedEntry.newData?.items) && selectedEntry.newData.items.length > 0 && (() => {
                const detailSale = summarizeSaleItems(selectedEntry.newData.items, selectedEntry.newData.totalQuantity)
                return (
                  <div className="space-y-2 pt-2 border-t border-white/10">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-black uppercase tracking-wider opacity-60">
                        Purchased Items ({detailSale.totalQuantity} {detailSale.totalQuantity === 1 ? 'pc' : 'pcs'})
                      </p>
                      {detailSale.isBulk && (
                        <span className="rounded-full border border-amber-500/40 bg-amber-500/15 px-2.5 py-0.5 text-[10px] font-black uppercase text-amber-300">
                          Bulk Purchase
                        </span>
                      )}
                    </div>
                    <div className="overflow-x-auto rounded-xl border border-white/10">
                      <table className="w-full border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-white/10 text-left opacity-65">
                            <th className="p-2.5">Product</th>
                            <th className="p-2.5">SKU</th>
                            <th className="p-2.5">Qty</th>
                            <th className="p-2.5 text-right">Unit Price</th>
                            <th className="p-2.5 text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailSale.items.map((item, idx) => (
                            <tr key={`${item.id || item.name}-${idx}`} className="border-b border-white/5 last:border-b-0">
                              <td className="p-2.5 font-semibold">{item.name}</td>
                              <td className="p-2.5 opacity-70">{item.sku || '—'}</td>
                              <td className="p-2.5 font-bold">×{item.qty}</td>
                              <td className="p-2.5 text-right">{formatCurrency(item.unitPrice)}</td>
                              <td className="p-2.5 text-right font-bold">{formatCurrency(item.subtotal)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
