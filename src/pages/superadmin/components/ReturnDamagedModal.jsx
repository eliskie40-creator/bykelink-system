import { useEffect, useMemo, useRef, useState } from 'react'
import { doc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import ReportProblemRoundedIcon from '@mui/icons-material/ReportProblemRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import ExpandMoreRoundedIcon from '@mui/icons-material/ExpandMoreRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import SwapHorizRoundedIcon from '@mui/icons-material/SwapHorizRounded'
import Inventory2RoundedIcon from '@mui/icons-material/Inventory2Rounded'
import CircularProgress from '@mui/material/CircularProgress'
import { db, functions } from '../../../firebase'
import { httpsCallable } from 'firebase/functions'
import { logSystemAuditEvent } from '../../../services/auditLogService'
import { resolveActiveInventory, filterInventoryForReturn } from '../sections/damagedReturnsUtils'

const RETURN_CONDITIONS = [
  'Customer Return - Defective',
  'Damaged in Transit / Delivery',
  'Factory / Manufacturing Defect',
  'Store Handling / Floor Damage',
  'Customer Return - Wrong Item',
  'Customer Return - Warranty Claim',
  'Other',
]

const DISPOSITION_OPTIONS = [
  'Pending Inspection',
  'Returned to Supplier',
  'Sent for Repair',
  'Written Off / Scrapped',
  'Restocked to Inventory',
]

export default function ReturnDamagedModal({
  open,
  onClose,
  inventory = [],
  inventoryItems = [],
  onSuccess,
  currentUser = null,
  currentAccessRole = '',
  isDarkMode = true,
}) {
  const [selectedItemId, setSelectedItemId] = useState('')
  const [itemSearch, setItemSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const [condition, setCondition] = useState(RETURN_CONDITIONS[0])
  const [disposition, setDisposition] = useState(DISPOSITION_OPTIONS[0])
  const [customerOrSource, setCustomerOrSource] = useState('')
  const [reason, setReason] = useState('')
  const [deductStock, setDeductStock] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const dropdownRef = useRef(null)

  // Support both 'inventory' and 'inventoryItems' prop names to prevent empty inventory bugs
  const activeInventory = useMemo(() => {
    return resolveActiveInventory(inventory, inventoryItems)
  }, [inventory, inventoryItems])

  // Extract distinct categories from inventory for quick filtering
  const availableCategories = useMemo(() => {
    const cats = new Set()
    activeInventory.forEach((item) => {
      const cat = String(item.category || item.type || '').trim()
      if (cat) cats.add(cat)
    })
    return ['ALL', ...Array.from(cats).sort()]
  }, [activeInventory])

  // Filter inventory based on search query and category chip
  const filteredInventory = useMemo(() => {
    return filterInventoryForReturn(activeInventory, itemSearch, categoryFilter)
  }, [activeInventory, itemSearch, categoryFilter])

  // Get currently selected item details
  const selectedItem = useMemo(() => {
    if (!selectedItemId) return null
    return activeInventory.find((item) => item.id === selectedItemId) || null
  }, [activeInventory, selectedItemId])

  // Close dropdown when user clicks outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  // Reset state when modal opens or closes
  useEffect(() => {
    if (!open) {
      setSelectedItemId('')
      setItemSearch('')
      setCategoryFilter('ALL')
      setIsDropdownOpen(false)
      setQuantity(1)
      setCondition(RETURN_CONDITIONS[0])
      setDisposition(DISPOSITION_OPTIONS[0])
      setCustomerOrSource('')
      setReason('')
      setDeductStock(true)
      setErrorMessage('')
      setIsSubmitting(false)
      return undefined
    }

    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'

    return () => {
      document.documentElement.style.overflow = ''
      document.body.style.overflow = ''
    }
  }, [open])

  if (!open) return null

  const handleSelectItem = (item) => {
    setSelectedItemId(item.id)
    setIsDropdownOpen(false)
    setItemSearch('')
    setErrorMessage('')
  }

  const handleClearSelection = () => {
    setSelectedItemId('')
    setItemSearch('')
    setIsDropdownOpen(true)
  }

  const currentStock = Number(selectedItem?.stock ?? selectedItem?.quantity ?? 0)
  const remainingStock = Math.max(0, currentStock - Number(quantity || 0))

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrorMessage('')

    if (!selectedItemId || !selectedItem) {
      setErrorMessage('Please select a product from inventory.')
      return
    }

    const qtyNumber = Number(quantity)
    if (!Number.isFinite(qtyNumber) || qtyNumber <= 0) {
      setErrorMessage('Quantity must be greater than 0.')
      return
    }

    if (!reason.trim()) {
      setErrorMessage('Please provide a reason or damage description.')
      return
    }

    setIsSubmitting(true)

    try {
      let recordedViaCloud = false
      let generatedReturnId = null

      // Try callable cloud function first (handles atomic inventory deduction & bypasses client security rules)
      try {
        const recordFn = httpsCallable(functions, 'recordDamagedReturn')
        const result = await recordFn({
          itemId: selectedItem.id,
          itemName: selectedItem.name || 'Unnamed Item',
          itemSku: selectedItem.sku || '',
          itemCategory: selectedItem.category || '',
          quantity: qtyNumber,
          condition,
          disposition,
          customerOrSource: customerOrSource.trim() || 'Direct Store Return',
          reason: reason.trim(),
          deductStock: Boolean(deductStock),
        })

        if (result?.data?.ok) {
          recordedViaCloud = true
          generatedReturnId = result?.data?.returnId
        }
      } catch (fnError) {
        console.warn('recordDamagedReturn callable failed or not deployed, attempting direct Firestore write:', fnError)
      }

      // If callable function is not yet deployed, fallback to client-side write
      if (!recordedViaCloud) {
        const returnId = `RET-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
        generatedReturnId = returnId
        const timestamp = serverTimestamp()
        const actorEmail = String(currentUser?.email || '').trim().toLowerCase()
        const actorName = currentUser?.displayName || actorEmail.split('@')[0] || 'Staff User'

        const returnRecord = {
          returnId,
          itemId: selectedItem.id,
          itemName: selectedItem.name || 'Unnamed Item',
          itemSku: selectedItem.sku || '',
          itemCategory: selectedItem.category || '',
          quantity: qtyNumber,
          condition,
          disposition,
          customerOrSource: customerOrSource.trim() || 'Direct Store Return',
          reason: reason.trim(),
          deductedFromStock: Boolean(deductStock),
          reportedBy: {
            uid: currentUser?.uid || '',
            email: actorEmail,
            name: actorName,
            role: String(currentAccessRole || 'staff personnel').toLowerCase(),
          },
          createdAt: timestamp,
          updatedAt: timestamp,
        }

        await setDoc(doc(db, 'damagedReturns', returnId), returnRecord)

        // Optionally deduct stock from live inventory
        if (deductStock && selectedItem.id) {
          try {
            await updateDoc(doc(db, 'inventory', selectedItem.id), {
              stock: remainingStock,
              quantity: remainingStock,
              updatedAt: timestamp,
            })
          } catch (stockError) {
            console.warn('Could not auto-deduct stock from inventory:', stockError)
          }
        }

        await logSystemAuditEvent({
          module: 'Inventory',
          action: 'DAMAGED_RETURN_RECORDED',
          summary: `Recorded ${qtyNumber} returned/damaged units of "${selectedItem.name}" (${condition})`,
          targetType: 'damagedReturn',
          targetId: returnId,
          targetName: selectedItem.name,
          amount: null,
          currentUser,
          accessRole: currentAccessRole,
          metadata: {
            returnId,
            itemId: selectedItem.id,
            condition,
            disposition,
            quantity: qtyNumber,
            deductedFromStock: deductStock,
          },
        })
      }

      onSuccess?.(`Recorded returned/damaged item ${generatedReturnId || 'record'} successfully.`)
      onClose()
    } catch (error) {
      console.error('Failed to record damaged product:', error)
      const isPermissionError = String(error?.code || error?.message || '').toLowerCase().includes('permission')
      if (isPermissionError) {
        setErrorMessage(
          'Missing or insufficient permissions. Please make sure the updated Firestore Security Rules have been published in Firebase Console (or deploy Cloud Functions).'
        )
      } else {
        setErrorMessage(error?.message || 'Unable to record returned product.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{
        zIndex: 99999,
        background: 'rgba(4, 4, 4, 0.8)',
        backdropFilter: 'blur(10px)',
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full max-w-xl rounded-2xl p-6 sm:p-7 shadow-2xl max-h-[90vh] overflow-y-auto ${
          isDarkMode
            ? 'bg-gradient-to-br from-[#1a1a1a] to-[#0f0f0f] border border-white/15 text-white'
            : 'bg-white border border-gray-200 text-gray-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div
              className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                isDarkMode ? 'bg-amber-950/60 text-amber-400' : 'bg-amber-100 text-amber-600'
              }`}
            >
              <ReportProblemRoundedIcon sx={{ fontSize: 22 }} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400">Inventory Operations</p>
              <h3 className="text-lg font-black">Record Returned / Damaged Product</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
              isDarkMode ? 'hover:bg-white/10 text-white/60' : 'hover:bg-gray-100 text-gray-500'
            }`}
          >
            <CloseRoundedIcon sx={{ fontSize: 18 }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Product Selector Section */}
          <div className="space-y-1.5" ref={dropdownRef}>
            <span className={`block text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-white/70' : 'text-gray-700'}`}>
              Select Product / Spare Part *
            </span>

            {selectedItem ? (
              /* Selected Product Summary Card */
              <div
                className={`rounded-xl border p-3.5 transition-all ${
                  isDarkMode
                    ? 'border-amber-500/40 bg-amber-500/10 text-white'
                    : 'border-amber-400 bg-amber-50 text-gray-900'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400">
                      <Inventory2RoundedIcon sx={{ fontSize: 18 }} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black leading-tight text-amber-400 sm:text-base">
                        {selectedItem.name}
                      </h4>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs opacity-80">
                        {selectedItem.sku && (
                          <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] font-bold">
                            SKU: {selectedItem.sku}
                          </span>
                        )}
                        <span>{selectedItem.category || 'General Product'}</span>
                        {selectedItem.price !== undefined && selectedItem.price !== null && (
                          <span className="font-semibold text-emerald-400">
                            ₱{Number(selectedItem.price || 0).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleClearSelection}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-bold text-white transition-colors hover:bg-white/20"
                    title="Change selected product"
                  >
                    <SwapHorizRoundedIcon sx={{ fontSize: 15 }} />
                    Change
                  </button>
                </div>

                {/* Stock deduction live calculation */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 text-[11px]">
                  <span className="font-semibold opacity-75">
                    Current Stock: <strong className="text-white">{currentStock} unit(s)</strong>
                  </span>
                  {deductStock && (
                    <span className="font-bold text-amber-300">
                      After Return Deduction: {currentStock} → {remainingStock} unit(s)
                    </span>
                  )}
                </div>
              </div>
            ) : (
              /* Searchable Combobox Dropdown */
              <div className="relative">
                {/* Search Input Trigger */}
                <div
                  className={`flex items-center gap-2 rounded-xl border px-3.5 py-2.5 transition-all ${
                    isDropdownOpen
                      ? isDarkMode
                        ? 'border-amber-500 bg-black/60 ring-2 ring-amber-500/20'
                        : 'border-amber-600 bg-white ring-2 ring-amber-500/20'
                      : isDarkMode
                      ? 'border-white/15 bg-black/40 text-white hover:border-white/30'
                      : 'border-gray-300 bg-white text-gray-900 hover:border-gray-400'
                  }`}
                  onClick={() => setIsDropdownOpen(true)}
                >
                  <SearchRoundedIcon
                    sx={{ fontSize: 18 }}
                    className={isDarkMode ? 'text-white/40' : 'text-gray-400'}
                  />
                  <input
                    type="text"
                    value={itemSearch}
                    onChange={(e) => {
                      setItemSearch(e.target.value)
                      if (!isDropdownOpen) setIsDropdownOpen(true)
                    }}
                    onFocus={() => setIsDropdownOpen(true)}
                    placeholder="Search by product name, SKU, or category..."
                    className="w-full bg-transparent text-sm outline-none placeholder:text-xs placeholder:opacity-50"
                  />
                  {itemSearch && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setItemSearch('')
                      }}
                      className="p-1 text-xs opacity-60 hover:opacity-100"
                    >
                      <CloseRoundedIcon sx={{ fontSize: 16 }} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setIsDropdownOpen((prev) => !prev)
                    }}
                    className={`transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`}
                  >
                    <ExpandMoreRoundedIcon sx={{ fontSize: 20 }} />
                  </button>
                </div>

                {/* Dropdown Popover */}
                {isDropdownOpen && (
                  <div
                    className={`absolute left-0 right-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border shadow-2xl backdrop-blur-md ${
                      isDarkMode
                        ? 'border-white/20 bg-[#161616]/98 text-white'
                        : 'border-gray-300 bg-white text-gray-900'
                    }`}
                  >
                    {/* Category Filter Chips */}
                    {availableCategories.length > 1 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto border-b border-white/10 p-2.5 scrollbar-thin">
                        {availableCategories.map((cat) => {
                          const isSelected = categoryFilter.toLowerCase() === cat.toLowerCase()
                          return (
                            <button
                              key={cat}
                              type="button"
                              onClick={() => setCategoryFilter(cat)}
                              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors ${
                                isSelected
                                  ? 'bg-amber-500 text-black'
                                  : isDarkMode
                                  ? 'bg-white/10 text-white/70 hover:bg-white/15 hover:text-white'
                                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }`}
                            >
                              {cat}
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {/* Results Counter */}
                    <div className="flex items-center justify-between border-b border-white/5 px-3 py-1.5 text-[10px] uppercase tracking-wider opacity-60">
                      <span>Available Products</span>
                      <span>
                        Showing {filteredInventory.length} of {activeInventory.length}
                      </span>
                    </div>

                    {/* Product List */}
                    <div className="max-h-56 overflow-y-auto divide-y divide-white/5">
                      {filteredInventory.length > 0 ? (
                        filteredInventory.map((item) => {
                          const stockCount = Number(item.stock ?? item.quantity ?? 0)
                          return (
                            <button
                              key={item.id}
                              type="button"
                              onClick={() => handleSelectItem(item)}
                              className={`flex w-full items-center justify-between gap-3 p-3 text-left transition-colors ${
                                isDarkMode ? 'hover:bg-white/8' : 'hover:bg-gray-100'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-black sm:text-sm">
                                  {item.name || item.productName || 'Unnamed Item'}
                                </p>
                                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] opacity-70">
                                  {item.sku && (
                                    <span className="font-mono text-amber-400/90 font-semibold">
                                      {item.sku}
                                    </span>
                                  )}
                                  <span>• {item.category || item.type || 'General'}</span>
                                  {item.price !== undefined && item.price !== null && (
                                    <span>• ₱{Number(item.price || 0).toLocaleString()}</span>
                                  )}
                                </div>
                              </div>

                              <div className="shrink-0 text-right">
                                <span
                                  className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-black ${
                                    stockCount > 5
                                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                      : stockCount > 0
                                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                      : 'bg-red-500/20 text-red-400 border border-red-500/30'
                                  }`}
                                >
                                  Stock: {stockCount}
                                </span>
                              </div>
                            </button>
                          )
                        })
                      ) : (
                        <div className="p-6 text-center text-xs opacity-60">
                          <p>No products found matching &ldquo;{itemSearch}&rdquo;.</p>
                          {(itemSearch || categoryFilter !== 'ALL') && (
                            <button
                              type="button"
                              onClick={() => {
                                setItemSearch('')
                                setCategoryFilter('ALL')
                              }}
                              className="mt-2 text-xs font-bold text-amber-400 underline hover:text-amber-300"
                            >
                              Reset filters & show all products
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Quantity & Condition */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className={`block text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-white/70' : 'text-gray-700'}`}>
                Quantity Returned / Damaged *
              </span>
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value || '1', 10)))}
                required
                className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors ${
                  isDarkMode
                    ? 'border-white/15 bg-black/40 text-white focus:border-amber-500'
                    : 'border-gray-300 bg-white text-gray-900 focus:border-amber-600'
                }`}
              />
            </label>

            <label className="block space-y-1.5">
              <span className={`block text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-white/70' : 'text-gray-700'}`}>
                Condition / Return Category *
              </span>
              <select
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors ${
                  isDarkMode
                    ? 'border-white/15 bg-black/40 text-white focus:border-amber-500'
                    : 'border-gray-300 bg-white text-gray-900 focus:border-amber-600'
                }`}
              >
                {RETURN_CONDITIONS.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Disposition & Customer/Source */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className={`block text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-white/70' : 'text-gray-700'}`}>
                Initial Disposition Status
              </span>
              <select
                value={disposition}
                onChange={(e) => setDisposition(e.target.value)}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors ${
                  isDarkMode
                    ? 'border-white/15 bg-black/40 text-white focus:border-amber-500'
                    : 'border-gray-300 bg-white text-gray-900 focus:border-amber-600'
                }`}
              >
                {DISPOSITION_OPTIONS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className={`block text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-white/70' : 'text-gray-700'}`}>
                Customer / Source Name
              </span>
              <input
                type="text"
                value={customerOrSource}
                onChange={(e) => setCustomerOrSource(e.target.value)}
                placeholder="Customer name or Supplier delivery"
                className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors ${
                  isDarkMode
                    ? 'border-white/15 bg-black/40 text-white focus:border-amber-500'
                    : 'border-gray-300 bg-white text-gray-900 focus:border-amber-600'
                }`}
              />
            </label>
          </div>

          {/* Damage Details */}
          <label className="block space-y-1.5">
            <span className={`block text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-white/70' : 'text-gray-700'}`}>
              Damage Details / Reason for Return *
            </span>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              placeholder="Describe the defect, damage, or customer complaint in detail..."
              className={`w-full rounded-xl border px-3.5 py-2 text-sm outline-none transition-colors resize-none ${
                isDarkMode
                  ? 'border-white/15 bg-black/40 text-white focus:border-amber-500'
                  : 'border-gray-300 bg-white text-gray-900 focus:border-amber-600'
              }`}
            />
          </label>

          {/* Deduct Stock Checkbox */}
          <label className="flex items-center gap-2.5 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={deductStock}
              onChange={(e) => setDeductStock(e.target.checked)}
              className="h-4 w-4 rounded accent-amber-500"
            />
            <span className={`text-xs font-semibold ${isDarkMode ? 'text-white/80' : 'text-gray-700'}`}>
              Automatically deduct {quantity} unit(s) from active sellable inventory stock
            </span>
          </label>

          {/* Error Message */}
          {errorMessage && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs font-semibold text-red-400">
              {errorMessage}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-end gap-2.5 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-50 ${
                isDarkMode ? 'bg-white/10 text-white hover:bg-white/15' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
              }`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 px-5 py-2.5 text-sm font-black text-white transition-colors disabled:opacity-60"
            >
              {isSubmitting ? (
                <>
                  <CircularProgress size={16} color="inherit" />
                  Recording...
                </>
              ) : (
                'Save Return / Damaged Record'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
