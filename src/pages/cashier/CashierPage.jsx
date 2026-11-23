import { useEffect, useMemo, useState } from 'react'
import { httpsCallable } from 'firebase/functions'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import './CashierPage.css'
import { db, functions } from '../../firebase'
import { buildInvoiceData } from '../../services/posInvoiceService'
import CashierLayout from './CashierLayout'
import CashierTopbar from './components/CashierTopbar'
import BarcodeScanner from './components/BarcodeScanner'
import PriceCheck from './components/PriceCheck'

export default function CashierPage({
  currentUser,
  onNavigateBack,
  onNavigateToService,
  onNavigateToServiceBookings,
  onNavigateToMessages,
  onNavigateToProfile,
  onNavigateToFinancingStatus,
  onSignOut,
}) {
  const [selectedTab, setSelectedTab] = useState('sales-pos')
  const [search, setSearch] = useState('')
  const [serviceSearch, setServiceSearch] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [inventoryItems, setInventoryItems] = useState([])
  const [services, setServices] = useState([])
  const [cartItems, setCartItems] = useState([])
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState('cash')
  const [amountTendered, setAmountTendered] = useState('')
  const [qtyEditorItem, setQtyEditorItem] = useState(null)
  const [draftQty, setDraftQty] = useState(1)
  const [receipt, setReceipt] = useState(null)
  const [isPrintingReceipt, setIsPrintingReceipt] = useState(false)
  const [isCompletingSale, setIsCompletingSale] = useState(false)
  const [transactionComplete, setTransactionComplete] = useState(false)
  const [transactionLogs, setTransactionLogs] = useState([])
  const [isLogsOpen, setIsLogsOpen] = useState(false)
  const [isBarcodeScannerOpen, setIsBarcodeScannerOpen] = useState(false)
  const [isPriceCheckOpen, setIsPriceCheckOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [transactionId, setTransactionId] = useState('')
  const [saleError, setSaleError] = useState('')
  const [customerName, setCustomerName] = useState('Walk-in Customer')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerVehicle, setCustomerVehicle] = useState('')
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false)
  const [draftCustomerName, setDraftCustomerName] = useState('')
  const [draftCustomerPhone, setDraftCustomerPhone] = useState('')
  const [draftCustomerVehicle, setDraftCustomerVehicle] = useState('')

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, 'inventory')), (snapshot) => {
      const nextItems = snapshot.docs
        .map((doc) => {
          const data = doc.data()
          const stockValue = Number(data.stock ?? data.quantity ?? data.onHand ?? 0)
          const priceValue = Number(data.price ?? data.unitPrice ?? data.salePrice ?? data.sellingPrice ?? 0)
          const category = String(data.category || data.type || 'General')
          const itemType = String(data.itemType || data.productType || data.kind || '').toLowerCase()
          const normalizedCategory = category.toLowerCase()
          const isSparePart =
            normalizedCategory.includes('spare') ||
            itemType.includes('spare') ||
            normalizedCategory.includes('part') ||
            itemType.includes('part')

          if (!isSparePart) {
            return null
          }

          return {
            id: doc.id,
            name: data.name || data.model || 'Unnamed Item',
            sku: data.sku || data.itemCode || data.code || `SKU-${doc.id.slice(0, 6).toUpperCase()}`,
            barcode: data.barcode || data.barcodeNumber || data.itemCode || data.code || '',
            itemCode: data.itemCode || '',
            code: data.code || '',
            brand: data.brand || data.manufacturer || 'Bykelink',
            stock: Number.isFinite(stockValue) ? stockValue : 0,
            price: Number.isFinite(priceValue) ? priceValue : 0,
            category,
            imageUrl: data.imageUrl || data.gallery?.[0] || '',
          }
        })
        .filter(Boolean)
        .filter((item) => item.name && item.category)

      setInventoryItems(nextItems)
    })

    return unsubscribe
  }, [])

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'services'),
      (snapshot) => {
        setServices(
          snapshot.docs
            .map((serviceDoc) => {
              const data = serviceDoc.data()
              const fee = Number(data.cost ?? data.fee ?? data.price ?? data.amount ?? 0)

              return {
                id: serviceDoc.id,
                name: data.title || data.name || '',
                fee: Number.isFinite(fee) ? fee : 0,
              }
            })
            .filter((service) => service.name),
        )
      },
      (error) => {
        console.error('Unable to load cashier services', error)
        setServices([])
      },
    )

    return unsubscribe
  }, [])

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, 'transactionLogs'), orderBy('createdAt', 'desc')),
      (snapshot) => {
        const nextLogs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate?.() ?? new Date(),
        }))

        setTransactionLogs(nextLogs)
      },
      (error) => {
        console.warn('Transaction logs stream unavailable for this role:', error?.code || error?.message)
        setTransactionLogs([])
      },
    )

    return unsubscribe
  }, [])

  const requestTransactionId = async () => {
    try {
      const generateTransactionId = httpsCallable(functions, 'generateTransactionId')
      const response = await generateTransactionId()
      const nextId = response?.data?.transactionId

      if (nextId) {
        setTransactionId(nextId)
        return nextId
      }
    } catch (error) {
      console.error('Failed to generate transaction ID from backend:', error)
    }

    return null
  }

  const cancelTransaction = async () => {
    setCartItems([])
    setAmountTendered('')
    setSelectedPaymentMethod('cash')
    setQtyEditorItem(null)
    setDraftQty(1)
    setReceipt(null)
    setNotes('')
    setCustomerName('Walk-in Customer')
    setCustomerPhone('')
    setCustomerVehicle('')

    const nextId = await requestTransactionId()
    if (nextId) {
      setTransactionId(nextId)
    }
  }

  const openCustomerModal = () => {
    setDraftCustomerName(customerName === 'Walk-in Customer' ? '' : customerName)
    setDraftCustomerPhone(customerPhone)
    setDraftCustomerVehicle(customerVehicle)
    setIsCustomerModalOpen(true)
  }

  const handleApplyCustomer = (e) => {
    if (e) e.preventDefault()
    const trimmed = draftCustomerName.trim()
    setCustomerName(trimmed || 'Walk-in Customer')
    setCustomerPhone(draftCustomerPhone.trim())
    setCustomerVehicle(draftCustomerVehicle.trim())
    setIsCustomerModalOpen(false)
  }

  const handleResetToWalkIn = () => {
    setCustomerName('Walk-in Customer')
    setCustomerPhone('')
    setCustomerVehicle('')
    setIsCustomerModalOpen(false)
  }

  const catalogItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    const filtered = inventoryItems.filter((item) => {
      if (!normalizedSearch) return true

      const haystack = `${item.name} ${item.sku} ${item.brand} ${item.category} ${item.model || ''}`.toLowerCase()
      return haystack.includes(normalizedSearch)
    })

    return filtered.slice(0, 4)
  }, [inventoryItems, search])

  const filteredServices = useMemo(() => {
    const normalizedSearch = serviceSearch.trim().toLowerCase()

    return services
      .filter((service) => service.name.toLowerCase().includes(normalizedSearch))
      .slice(0, 6)
  }, [services, serviceSearch])

  const transactionItems = useMemo(() => {
    return cartItems.map((item) => ({
      id: item.id,
      item: item.name,
      sku: item.sku,
      qty: item.qty,
      unitPrice: item.unitPrice,
      disc: 0,
      subtotal: item.qty * item.unitPrice,
    }))
  }, [cartItems])

  const subtotal = useMemo(
    () => transactionItems.reduce((total, item) => total + item.subtotal, 0),
    [transactionItems],
  )

  const amountTenderedValue = Number(amountTendered) || 0
  const discount = 0
  const vatRate = 0.12
  const vatAmount = subtotal * vatRate
  const grandTotal = subtotal + vatAmount - discount
  const change = Math.max(amountTenderedValue - grandTotal, 0)

  const addItemToCart = async (item) => {
    if (!transactionId) {
      const nextId = await requestTransactionId()
      if (!nextId) {
        return
      }
    }

    setCartItems((current) => {
      const existing = current.find((entry) => entry.id === item.id)

      if (existing) {
        return current.map((entry) =>
          entry.id === item.id ? { ...entry, qty: entry.qty + 1 } : entry,
        )
      }

      return [
        ...current,
        {
          id: item.id,
          name: item.name,
          sku: item.sku,
          type: 'product',
          qty: 1,
          unitPrice: item.price || 0,
        },
      ]
    })
  }

  const setCartItemQty = (itemId, nextQty) => {
    setCartItems((current) =>
      current
        .map((entry) => {
          if (entry.id !== itemId) return entry

          const safeQty = Math.max(1, Number(nextQty) || 1)
          return { ...entry, qty: safeQty }
        })
        .filter((entry) => entry.qty > 0),
    )
  }

  const updateCartQty = (itemId, delta) => {
    setCartItems((current) =>
      current
        .map((entry) => {
          if (entry.id !== itemId) return entry

          const nextQty = entry.qty + delta
          return nextQty > 0 ? { ...entry, qty: nextQty } : null
        })
        .filter(Boolean),
    )
  }

  const removeFromCart = (itemId) => {
    setCartItems((current) => current.filter((entry) => entry.id !== itemId))
  }

  const openQtyEditor = (entry) => {
    setQtyEditorItem(entry)
    setDraftQty(entry.qty)
  }

  const saveQtyEditor = () => {
    if (!qtyEditorItem) return
    setCartItemQty(qtyEditorItem.id, draftQty)
    setQtyEditorItem(null)
  }

  const addServiceToCart = async (service) => {
    if (!transactionId) {
      await requestTransactionId()
    }

    setCartItems((current) => {
      const serviceCartId = `service-${service.id}`
      const existing = current.find((entry) => entry.id === serviceCartId)

      if (existing) {
        return current.map((entry) =>
          entry.id === serviceCartId ? { ...entry, qty: entry.qty + 1 } : entry,
        )
      }

      return [
        ...current,
        {
          id: serviceCartId,
          name: service.name,
          sku: 'SERVICE',
          type: 'service',
          qty: 1,
          unitPrice: service.fee,
        },
      ]
    })
  }

  const paymentMethods = [
    { key: 'cash', label: 'Cash', icon: '₱' },
    { key: 'gcash', label: 'GCash', icon: 'G' },
    { key: 'card', label: 'Card', icon: '◫' },
    { key: 'bank', label: 'Bank Transfer', icon: '▣' },
    { key: 'split', label: 'Split Payment', icon: '◉' },
  ]

  const paymentMethodLabel = paymentMethods.find((method) => method.key === selectedPaymentMethod)?.label || 'Cash'
  const canCompleteSale = subtotal > 0 && amountTenderedValue >= grandTotal

  const [logPage, setLogPage] = useState(1)
  const logPageSize = 5

  const todayLogs = useMemo(() => {
    const today = new Date()
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())

    return transactionLogs.filter((log) => {
      const createdAt = log.createdAt instanceof Date ? log.createdAt : new Date(log.createdAt || 0)
      return createdAt >= dayStart
    })
  }, [transactionLogs])

  const totalLogPages = Math.max(1, Math.ceil(todayLogs.length / logPageSize))
  const paginatedTodayLogs = useMemo(() => {
    const start = (logPage - 1) * logPageSize
    return todayLogs.slice(start, start + logPageSize)
  }, [todayLogs, logPage])

  const transactionKpis = useMemo(() => {
    const today = new Date()
    const dayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())

    let cashSales = 0
    let onlinePayments = 0
    let totalDailySales = 0
    let transactionCount = 0

    todayLogs.forEach((log) => {
      const grandTotal = Number(log.grandTotal || 0)
      const method = String(log.paymentMethodKey || log.paymentMethod || '').toLowerCase().trim()
      const createdAt = log.createdAt instanceof Date ? log.createdAt : new Date(log.createdAt || 0)

      transactionCount += 1

      if (createdAt >= dayStart) {
        totalDailySales += grandTotal
      }

      if (method === 'cash') {
        cashSales += grandTotal
      } else if (['gcash', 'card', 'bank', 'bank transfer'].includes(method)) {
        onlinePayments += grandTotal
      }
    })

    return {
      cashSales,
      onlinePayments,
      transactionCount,
      totalDailySales,
    }
  }, [todayLogs])

  const hasTransactionLogs = todayLogs.length > 0

  const formatCurrencyValue = (value) => (hasTransactionLogs ? `₱ ${value.toLocaleString('en-PH')}` : '—')
  const formatCountValue = (value) => (hasTransactionLogs ? value : '—')

  const handleReprintReceipt = async (log) => {
    if (!log) return

    const invoiceData = buildInvoiceData({
      transaction: log,
      cashierUser: currentUser,
      isReprint: true,
    })

    // Open unified sales invoice modal immediately in UI
    setReceipt(invoiceData)

    try {
      const printReceipt = httpsCallable(functions, 'printReceipt')
      const response = await printReceipt({ receipt: invoiceData })
      console.log('[Cashier] Reprint invoice response received', response?.data)
    } catch (error) {
      console.warn('[Cashier] Backend printer skipped or offline:', error?.message)
    }
  }

  const quickActionButtons = [
    { key: 'F2', label: 'Barcode', icon: '▤', onClick: () => setIsBarcodeScannerOpen(true) },
    { key: 'F3', label: 'Transaction Logs', icon: '◔', onClick: () => setIsLogsOpen(true) },
    { key: 'F8', label: 'Price Check', icon: '⎇', onClick: () => setIsPriceCheckOpen(true) },
    { key: 'ESC', label: 'Cancel', icon: '✕', onClick: cancelTransaction },
  ]

  useEffect(() => {
    const handleKeyDown = (event) => {
      const tag = event.target?.tagName?.toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return

      if (event.key === 'F2') {
        event.preventDefault()
        setIsBarcodeScannerOpen(true)
      } else if (event.key === 'F3') {
        event.preventDefault()
        setIsLogsOpen(true)
      } else if (event.key === 'F4') {
        event.preventDefault()
        openCustomerModal()
      } else if (event.key === 'F8') {
        event.preventDefault()
        setIsPriceCheckOpen(true)
      } else if (event.key === 'Escape') {
        event.preventDefault()
        if (isCustomerModalOpen) setIsCustomerModalOpen(false)
        else if (isLogsOpen) setIsLogsOpen(false)
        else if (isBarcodeScannerOpen) setIsBarcodeScannerOpen(false)
        else if (isPriceCheckOpen) setIsPriceCheckOpen(false)
        else if (receipt) setReceipt(null)
        else cancelTransaction()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isCustomerModalOpen, isLogsOpen, isBarcodeScannerOpen, isPriceCheckOpen, receipt, customerName, customerPhone, customerVehicle])

  const finalizeSale = async () => {
    if (!canCompleteSale || isCompletingSale) return

    setIsCompletingSale(true)
    setSaleError('')

    try {
      const generatedFallbackId = `TX-${Date.now().toString().slice(-8)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
      const finalTransactionId = transactionId || (await requestTransactionId()) || generatedFallbackId

      const rawReceiptPayload = {
        id: finalTransactionId,
        timestamp: new Date().toLocaleString('en-PH', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
        customer: customerName,
        customerPhone: customerPhone || null,
        customerVehicle: customerVehicle || null,
        paymentMethod: paymentMethodLabel,
        paymentMethodKey: selectedPaymentMethod,
        subtotal,
        discount,
        vat: vatAmount,
        grandTotal,
        amountTendered: amountTenderedValue,
        change,
        notes,
        items: transactionItems,
      }

      const receiptPayload = buildInvoiceData({
        transaction: rawReceiptPayload,
        cartItems,
        cashierUser: currentUser,
        isReprint: false,
      })

      try {
        const completeSaleTransaction = httpsCallable(functions, 'completeSaleTransaction')
        const saleResponse = await completeSaleTransaction({
          receipt: receiptPayload,
          cartItems,
        })

        console.log('[Cashier] completeSaleTransaction response received', saleResponse?.data)
      } catch (error) {
        console.error('Failed to finalize sale in backend:', error)
        setSaleError(error?.message || 'Unable to record sale in backend. Please verify Cloud Functions deployment and try again.')
        return
      }

      setIsPrintingReceipt(true)

      try {
        console.log('[Cashier] Triggering backend printReceipt call', receiptPayload)
        const printReceipt = httpsCallable(functions, 'printReceipt')
        const response = await printReceipt({ receipt: receiptPayload })
        console.log('[Cashier] printReceipt response received', response?.data)
      } catch (error) {
        console.error('Failed to trigger backend print job:', error)
      }

      setReceipt(receiptPayload)
      setCartItems([])
      setAmountTendered('')
      setSelectedPaymentMethod('cash')
      setNotes('')
      // Reset customer back to Walk-in Customer for the next customer
      setCustomerName('Walk-in Customer')
      setCustomerPhone('')
      setCustomerVehicle('')

      const refreshedId = await requestTransactionId()
      if (refreshedId) {
        setTransactionId(refreshedId)
      }

      setIsPrintingReceipt(false)
    } finally {
      setIsCompletingSale(false)
    }
  }

  return (
    <CashierLayout
      currentUser={currentUser}
      selectedTab={selectedTab}
      setSelectedTab={setSelectedTab}
      onSignOut={onSignOut}
      isSidebarOpen={isSidebarOpen}
      onToggleSidebar={() => setIsSidebarOpen((current) => !current)}
    >
      <CashierTopbar
        currentUser={currentUser}
        onNavigateToProfile={onNavigateToProfile}
        onSignOut={onSignOut}
        onToggleSidebar={() => setIsSidebarOpen((current) => !current)}
        isSidebarOpen={isSidebarOpen}
      />

      <div className="cashier-action-strip" aria-label="Cashier actions">
        {quickActionButtons.map((action) => (
          <button
            key={action.key}
            type="button"
            className="cashier-action-button"
            onClick={action.onClick}
          >
            <span className="cashier-action-key">{action.key}</span>
            <span className="cashier-action-icon">{action.icon}</span>
            <span className="cashier-action-label">{action.label}</span>
          </button>
        ))}
      </div>

      {isBarcodeScannerOpen && (
        <BarcodeScanner
          inventoryItems={inventoryItems}
          onAddItem={addItemToCart}
          onClose={() => setIsBarcodeScannerOpen(false)}
        />
      )}

      {isPriceCheckOpen && (
        <PriceCheck
          inventoryItems={inventoryItems}
          onClose={() => setIsPriceCheckOpen(false)}
        />
      )}

      <div className="cashier-pos-layout">
        <section className="cashier-pos-left panel-card">
          <div className="cashier-searchbar">
            <span className="cashier-search-icon">⌕</span>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by SKU, Barcode, Product Name, Brand, or Model..."
            />
          </div>

          <div className="cashier-product-grid">
            {catalogItems.length > 0 ? (
              catalogItems.map((item) => (
                <article
                  key={item.id}
                  className="cashier-product-card"
                  onClick={() => addItemToCart(item)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      addItemToCart(item)
                    }
                  }}
                >
                  <div className="cashier-product-image">
                    {item.imageUrl ? <img src={item.imageUrl} alt={item.name} /> : <span>◌</span>}
                  </div>
                  <div className="cashier-product-name">{item.name}</div>
                  <div className="cashier-product-meta">{item.sku}</div>
                  <div className="cashier-product-meta">{item.brand}</div>
                  <div className="cashier-product-stock-row">
                    <span>Stock: {item.stock}</span>
                  </div>
                  <div className="cashier-product-price-row">
                    <span className="cashier-product-price">₱ {Number(item.price || 0).toLocaleString('en-PH')}</span>
                    <button
                      type="button"
                      className="cashier-add-button"
                      onClick={(event) => {
                        event.stopPropagation()
                        addItemToCart(item)
                      }}
                    >
                      🛒
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <div className="cashier-empty-state">No inventory items found</div>
            )}
          </div>

          <div className="cashier-service-section">
            <div className="cashier-service-header">Service</div>
            <div className="cashier-searchbar">
              <span className="cashier-search-icon">⌕</span>
              <input
                type="text"
                value={serviceSearch}
                onChange={(event) => setServiceSearch(event.target.value)}
                placeholder="Search services..."
                aria-label="Search services"
              />
            </div>
            <div className="cashier-service-list">
              {filteredServices.map((service) => (
                <button
                  key={service.id}
                  type="button"
                  className="cashier-service-item"
                  onClick={() => addServiceToCart(service)}
                >
                  <span>{service.name}</span>
                  <strong>₱ {service.fee.toLocaleString('en-PH')}</strong>
                </button>
              ))}
              {!filteredServices.length && (
                <div className="cashier-empty-state">
                  {services.length ? 'No matching services found' : 'No services found'}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="cashier-pos-center panel-card">
          <div className="cashier-transaction-head">
            <div className="cashier-transaction-title-wrap">
              <span className="cashier-transaction-icon">▣</span>
              <span className="cashier-transaction-title">Current Transaction</span>
            </div>
            <div className="cashier-transaction-badges">
              <span className="cashier-badge muted">Transaction #</span>
              <span className="cashier-badge">{transactionId || 'New'}</span>
            </div>
          </div>

          <div className="cashier-customer-row">
            <div className="cashier-customer-icon">👤</div>
            <div className="cashier-customer-text">
              <span className="cashier-label">Customer</span>
              <strong className={customerName !== 'Walk-in Customer' ? 'cashier-named-customer' : ''}>
                {customerName}
              </strong>
              {(customerPhone || customerVehicle) && (
                <small className="cashier-customer-subtext">
                  {customerPhone && <span>📞 {customerPhone}</span>}
                  {customerPhone && customerVehicle && <span className="opacity-40"> • </span>}
                  {customerVehicle && <span>🏍️ {customerVehicle}</span>}
                </small>
              )}
            </div>
            <div className="cashier-customer-actions">
              {customerName !== 'Walk-in Customer' && (
                <button
                  type="button"
                  className="cashier-reset-customer-btn"
                  onClick={handleResetToWalkIn}
                  title="Reset to Walk-in Customer"
                >
                  ✕
                </button>
              )}
              <button
                type="button"
                className="cashier-change-button"
                onClick={openCustomerModal}
                title="Customer Information (F4)"
              >
                Information
              </button>
            </div>
          </div>

          <div className="cashier-items-header">
            <span>#</span>
            <span>Item</span>
            <span>Qty</span>
            <span>Unit Price</span>
            <span>Subtotal</span>
          </div>

          <div className="cashier-items-list">
            {transactionItems.length > 0 ? (
              transactionItems.map((entry, index) => (
                <div
                  key={entry.id}
                  className="cashier-item-row"
                  onClick={() => openQtyEditor(entry)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      openQtyEditor(entry)
                    }
                  }}
                >
                  <span className="cashier-item-index">{index + 1}</span>
                  <div className="cashier-item-details">
                    <span>{entry.item}</span>
                    <small>{entry.sku}</small>
                  </div>
                  <div className="cashier-qty-box" aria-label={`Quantity ${entry.qty}`}>
                    <span>{entry.qty}</span>
                  </div>
                  <span className="cashier-money">₱ {entry.unitPrice.toLocaleString('en-PH')}</span>
                  <div className="cashier-subtotal-wrap">
                    <span className="cashier-money">₱ {entry.subtotal.toLocaleString('en-PH')}</span>
                    <button
                      type="button"
                      className="cashier-delete-item"
                      onClick={(event) => {
                        event.stopPropagation()
                        removeFromCart(entry.id)
                      }}
                    >
                      🗑
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <div className="cashier-empty-state">No items in the current transaction</div>
            )}
          </div>

          <div className="cashier-transaction-footer">
            <div className="cashier-notes-block">
              <label className="cashier-notes-label">Notes / Remarks</label>
              <textarea
                className="cashier-notes-input"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Add remarks (optional)..."
              />
            </div>

            <div className="cashier-totals-block">
              <div className="cashier-total-row">
                <span>Subtotal</span>
                <strong>₱ {subtotal.toLocaleString('en-PH')}</strong>
              </div>
              <div className="cashier-total-row">
                <span>Discount</span>
                <strong>₱ {discount.toLocaleString('en-PH')}</strong>
              </div>
              <div className="cashier-total-row">
                <span>VAT (12%)</span>
                <strong>₱ {vatAmount.toLocaleString('en-PH')}</strong>
              </div>
              <div className="cashier-total-row grand-total">
                <span>Grand Total</span>
                <strong>₱ {grandTotal.toLocaleString('en-PH')}</strong>
              </div>
            </div>
          </div>
        </section>

        <aside className="cashier-pos-right panel-card">
          <div className="cashier-payment-header">Payment</div>

          <div className="cashier-payment-list">
            {paymentMethods.map((method) => (
              <button
                key={method.key}
                type="button"
                className={`cashier-payment-option ${selectedPaymentMethod === method.key ? 'active' : ''}`}
                onClick={() => setSelectedPaymentMethod(method.key)}
              >
                <span className="cashier-payment-icon">{method.icon}</span>
                <span>{method.label}</span>
                <span className="cashier-payment-arrow">›</span>
              </button>
            ))}
          </div>

          <div className="cashier-payment-summary">
            <div className="cashier-payment-selected">
              <span>Selected Payment</span>
              <strong>{paymentMethodLabel}</strong>
            </div>

            <div className="cashier-summary-row">
              <span>Subtotal</span>
              <strong>₱ {subtotal.toLocaleString('en-PH')}</strong>
            </div>
            <div className="cashier-summary-row">
              <span>VAT (12%)</span>
              <strong>₱ {vatAmount.toLocaleString('en-PH')}</strong>
            </div>
            <div className="cashier-summary-row">
              <span>Grand Total</span>
              <strong>₱ {grandTotal.toLocaleString('en-PH')}</strong>
            </div>
            <div className="cashier-summary-row">
              <span>Amount Tendered</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amountTendered}
                onChange={(event) => {
                  const nextValue = event.target.value
                  setAmountTendered(nextValue)
                }}
              />
            </div>
            <div className="cashier-summary-row change">
              <span>Change</span>
              <strong>₱ {change.toLocaleString('en-PH')}</strong>
            </div>
            {saleError && (
              <div
                role="alert"
                style={{
                  marginBottom: '0.65rem',
                  padding: '0.6rem 0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid rgba(239, 68, 68, 0.45)',
                  background: 'rgba(239, 68, 68, 0.14)',
                  color: '#fca5a5',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                }}
              >
                {saleError}
              </div>
            )}
            <button
              type="button"
              className="cashier-complete-sale"
              disabled={!canCompleteSale || isCompletingSale}
              onClick={finalizeSale}
            >
              {isCompletingSale ? 'Completing Sale...' : 'Complete Sale'}
            </button>
          </div>
        </aside>
      </div>

      {receipt && (
        <div className="cashier-receipt-backdrop" aria-modal="true" role="dialog" onClick={() => setReceipt(null)}>
          <div className="cashier-receipt-modal" onClick={(e) => e.stopPropagation()}>
            <div className="cashier-receipt-header">
              <div className="cashier-receipt-brand">BYKELINK MOTOR INC.</div>
              <div className="cashier-receipt-subbrand">TAGUM CITY • DAVAO DEL NORTE</div>
              <div className="cashier-receipt-tagline">Dealership & Precision Motorcycle Service Center</div>
              <div className="cashier-receipt-doc-title">OFFICIAL SALES INVOICE</div>
              <div className="cashier-receipt-id">INVOICE NO: {receipt.invoiceNumber || receipt.id}</div>
              {receipt.isReprint && (
                <div className="cashier-receipt-reprint-tag">
                  [ OFFICIAL REPRINT / COPY ]
                </div>
              )}
            </div>

            <div className="cashier-receipt-arrow" aria-hidden="true">↓</div>

            <div className="cashier-receipt-body">
              <div className="cashier-receipt-row compact">
                <span>Date & Time</span>
                <strong>{receipt.timestamp}</strong>
              </div>
              <div className="cashier-receipt-row compact">
                <span>Customer</span>
                <strong>{receipt.customer}</strong>
              </div>
              {receipt.customerPhone && (
                <div className="cashier-receipt-row compact">
                  <span>Contact No.</span>
                  <strong>{receipt.customerPhone}</strong>
                </div>
              )}
              {receipt.customerVehicle && (
                <div className="cashier-receipt-row compact">
                  <span>Vehicle / Plate</span>
                  <strong>{receipt.customerVehicle}</strong>
                </div>
              )}
              <div className="cashier-receipt-row compact">
                <span>Cashier</span>
                <strong>{receipt.cashierName || 'Cashier Counter'}</strong>
              </div>
              <div className="cashier-receipt-row compact">
                <span>Payment Mode</span>
                <strong>{receipt.paymentMethod}</strong>
              </div>

              <div className="cashier-receipt-divider" />

              {/* Line items with clean PART / SERVICE badges */}
              <div className="cashier-receipt-items">
                {receipt.items.map((item) => (
                  <div key={item.id} className="cashier-receipt-item-row">
                    <div className="cashier-receipt-item-main">
                      <div className="cashier-item-header">
                        <span className={`cashier-item-type-badge ${item.type === 'service' ? 'type-service' : 'type-part'}`}>
                          {item.type === 'service' ? 'SERVICE' : 'PART'}
                        </span>
                        <span className="cashier-item-name">{item.name || item.item}</span>
                      </div>
                      <small className="cashier-item-calc">
                        {item.qty}x @ ₱ {Number(item.unitPrice || 0).toLocaleString('en-PH')}
                      </small>
                    </div>
                    <strong className="cashier-item-subtotal">₱ {Number(item.subtotal || 0).toLocaleString('en-PH')}</strong>
                  </div>
                ))}
              </div>

              <div className="cashier-receipt-divider" />

              {/* Subtotal separation if both parts and services exist */}
              {receipt.hasParts && receipt.hasServices && (
                <>
                  <div className="cashier-receipt-total">
                    <span>Spare Parts Subtotal</span>
                    <strong>₱ {Number(receipt.partsSubtotal || 0).toLocaleString('en-PH')}</strong>
                  </div>
                  <div className="cashier-receipt-total">
                    <span>Service Labor Subtotal</span>
                    <strong>₱ {Number(receipt.serviceSubtotal || 0).toLocaleString('en-PH')}</strong>
                  </div>
                </>
              )}

              <div className="cashier-receipt-total">
                <span>Gross Subtotal</span>
                <strong>₱ {Number(receipt.grossSubtotal || receipt.subtotal || 0).toLocaleString('en-PH')}</strong>
              </div>

              {Number(receipt.discount || 0) > 0 && (
                <div className="cashier-receipt-total">
                  <span>Discount</span>
                  <strong>- ₱ {Number(receipt.discount || 0).toLocaleString('en-PH')}</strong>
                </div>
              )}

              <div className="cashier-receipt-total">
                <span>Net VATable Sales</span>
                <strong>₱ {Number(receipt.vatableSales || (receipt.grandTotal / 1.12) || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}</strong>
              </div>

              <div className="cashier-receipt-total">
                <span>VAT (12%)</span>
                <strong>₱ {Number(receipt.vatAmount || receipt.vat || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 })}</strong>
              </div>

              <div className="cashier-receipt-total grand">
                <span>Total Amount Due</span>
                <strong>₱ {Number(receipt.grandTotal || 0).toLocaleString('en-PH')}</strong>
              </div>

              <div className="cashier-receipt-total">
                <span>Amount Tendered ({receipt.paymentMethod || 'Cash'})</span>
                <strong>₱ {Number(receipt.amountTendered || 0).toLocaleString('en-PH')}</strong>
              </div>

              <div className="cashier-receipt-total change">
                <span>Change (Sukli)</span>
                <strong>₱ {Number(receipt.change || 0).toLocaleString('en-PH')}</strong>
              </div>

              <div className="cashier-receipt-divider" />
              <div className="cashier-receipt-footer">
                <p className="cashier-footer-main">{isPrintingReceipt ? 'TRANSMITTING PRINT JOB...' : 'THANK YOU FOR YOUR PATRONAGE!'}</p>
                <p className="cashier-footer-sub">Official Sales Invoice covering spare parts and precision service labor.</p>
              </div>
            </div>

            <div className="cashier-receipt-actions">
              <button
                type="button"
                className="cashier-receipt-print-btn"
                onClick={() => window.print()}
                title="Print Official Sales Invoice"
              >
                🖨 Print Invoice
              </button>
              <button
                type="button"
                className="cashier-receipt-close"
                onClick={() => {
                  const wasReprint = receipt.isReprint
                  setReceipt(null)
                  if (!wasReprint) {
                    setTransactionComplete(true)
                    setTimeout(() => setTransactionComplete(false), 1800)
                  }
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {transactionComplete && (
        <div className="cashier-receipt-backdrop" aria-modal="true" role="dialog">
          <div className="cashier-success-modal">
            <div className="cashier-success-checkmark" aria-hidden="true">✓</div>
            <div className="cashier-success-title">Transaction Complete</div>
            <div className="cashier-success-subtitle">Payment recorded successfully.</div>
          </div>
        </div>
      )}

      {isLogsOpen && (
        <div className="cashier-qty-modal-backdrop" onClick={() => setIsLogsOpen(false)}>
          <div
            className="cashier-qty-modal cashier-logs-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="cashier-qty-modal-header">
              <h3>Transaction Logs</h3>
              <button type="button" onClick={() => setIsLogsOpen(false)}>×</button>
            </div>

            <div className="cashier-kpi-grid">
              <div className="cashier-kpi-card">
                <span className="cashier-kpi-label">Cash Sales</span>
                <strong className="cashier-kpi-value">{formatCurrencyValue(transactionKpis.cashSales)}</strong>
              </div>
              <div className="cashier-kpi-card">
                <span className="cashier-kpi-label">Online Payment</span>
                <strong className="cashier-kpi-value">{formatCurrencyValue(transactionKpis.onlinePayments)}</strong>
              </div>
              <div className="cashier-kpi-card">
                <span className="cashier-kpi-label">Transaction Count</span>
                <strong className="cashier-kpi-value">{formatCountValue(transactionKpis.transactionCount)}</strong>
              </div>
              <div className="cashier-kpi-card">
                <span className="cashier-kpi-label">Total Daily Sales</span>
                <strong className="cashier-kpi-value">{formatCurrencyValue(transactionKpis.totalDailySales)}</strong>
              </div>
            </div>

            <div className="cashier-logs-list">
              {paginatedTodayLogs.length > 0 ? (
                paginatedTodayLogs.map((log) => (
                  <div
                    key={log.id}
                    className="cashier-log-row"
                    onClick={() => handleReprintReceipt(log)}
                    style={{ cursor: 'pointer' }}
                    title="Click to view and print receipt"
                  >
                    <div className="cashier-log-main">
                      <strong>{log.transactionId}</strong>
                      <small>{log.customer}</small>
                      <small className="cashier-log-timestamp">{log.timestamp || new Date(log.createdAt || Date.now()).toLocaleString('en-PH', {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}</small>
                    </div>
                    <div className="cashier-log-meta">
                      <span>{log.paymentMethod}</span>
                      <strong>₱ {Number(log.grandTotal || 0).toLocaleString('en-PH')}</strong>
                    </div>
                    <button
                      type="button"
                      className="cashier-log-print-button"
                      aria-label={`Print receipt for ${log.transactionId}`}
                      title="View & Print Receipt"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleReprintReceipt(log)
                      }}
                    >
                      🖨
                    </button>
                  </div>
                ))
              ) : (
                <div className="cashier-empty-state">No transactions logged yet.</div>
              )}
            </div>

            {todayLogs.length > 0 && (
              <div className="cashier-log-pagination">
                <button
                  type="button"
                  className="cashier-log-page-button"
                  disabled={logPage === 1}
                  onClick={() => setLogPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </button>
                <span className="cashier-log-page-meta">Page {logPage} of {totalLogPages}</span>
                <button
                  type="button"
                  className="cashier-log-page-button"
                  disabled={logPage >= totalLogPages}
                  onClick={() => setLogPage((current) => Math.min(totalLogPages, current + 1))}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {isCustomerModalOpen && (
        <div className="cashier-qty-modal-backdrop" onClick={() => setIsCustomerModalOpen(false)}>
          <div
            className="cashier-qty-modal cashier-customer-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="cashier-qty-modal-header">
              <h3>Customer Information</h3>
              <button type="button" onClick={() => setIsCustomerModalOpen(false)}>×</button>
            </div>

            <form onSubmit={handleApplyCustomer} className="cashier-customer-form">
              <div className="cashier-customer-field">
                <label htmlFor="cashier-cust-name">Customer Name</label>
                <input
                  id="cashier-cust-name"
                  type="text"
                  placeholder="e.g. Juan Dela Cruz (Leave empty for Walk-in)"
                  value={draftCustomerName}
                  onChange={(e) => setDraftCustomerName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="cashier-customer-field">
                <label htmlFor="cashier-cust-phone">Mobile / Contact Number (Optional)</label>
                <input
                  id="cashier-cust-phone"
                  type="tel"
                  placeholder="e.g. 0912 345 6789"
                  value={draftCustomerPhone}
                  onChange={(e) => setDraftCustomerPhone(e.target.value)}
                />
              </div>

              <div className="cashier-customer-field">
                <label htmlFor="cashier-cust-vehicle">Motorcycle / Plate Number (Optional)</label>
                <input
                  id="cashier-cust-vehicle"
                  type="text"
                  placeholder="e.g. Yamaha NMAX (123-ABC)"
                  value={draftCustomerVehicle}
                  onChange={(e) => setDraftCustomerVehicle(e.target.value)}
                />
              </div>

              <div className="cashier-customer-modal-actions">
                <button
                  type="button"
                  className="cashier-btn-walkin"
                  onClick={handleResetToWalkIn}
                >
                  Set as Walk-in
                </button>
                <div className="cashier-customer-modal-actions-right">
                  <button
                    type="button"
                    className="cashier-qty-modal-cancel"
                    onClick={() => setIsCustomerModalOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="cashier-qty-modal-save"
                  >
                    Apply Customer
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {qtyEditorItem && (
        <div className="cashier-qty-modal-backdrop" onClick={() => setQtyEditorItem(null)}>
          <div
            className="cashier-qty-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="cashier-qty-modal-header">
              <h3>Adjust Quantity</h3>
              <button type="button" onClick={() => setQtyEditorItem(null)}>×</button>
            </div>

            <div className="cashier-qty-modal-body">
              <div className="cashier-qty-modal-name">{qtyEditorItem.item}</div>
              <div className="cashier-qty-modal-controls">
                <button
                  type="button"
                  className="cashier-qty-modal-button"
                  onClick={() => setDraftQty((current) => Math.max(1, current - 1))}
                >
                  −
                </button>
                <span>{draftQty}</span>
                <button
                  type="button"
                  className="cashier-qty-modal-button"
                  onClick={() => setDraftQty((current) => current + 1)}
                >
                  +
                </button>
              </div>
            </div>

            <div className="cashier-qty-modal-actions">
              <button type="button" className="cashier-qty-modal-cancel" onClick={() => setQtyEditorItem(null)}>
                Cancel
              </button>
              <button type="button" className="cashier-qty-modal-save" onClick={saveQtyEditor}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </CashierLayout>
  )
}
