
import { useMemo, useState, useEffect } from 'react'
import { addDoc, collection, serverTimestamp, updateDoc, doc, deleteDoc, setDoc, getDocs, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import FilterListRoundedIcon from '@mui/icons-material/FilterListRounded'
import MoreVertRoundedIcon from '@mui/icons-material/MoreVertRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import VerifiedUserRoundedIcon from '@mui/icons-material/VerifiedUserRounded'
import ReportProblemRoundedIcon from '@mui/icons-material/ReportProblemRounded'
import FileDownloadRoundedIcon from '@mui/icons-material/FileDownloadRounded'
import PictureAsPdfRoundedIcon from '@mui/icons-material/PictureAsPdfRounded'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, functions, storage } from '../../../firebase'
import { logSystemAuditEvent } from '../../../services/auditLogService'
import { exportProfessionalExcel, exportBrandedPdf } from '../../../services/reportExportService'
import ConfirmationModal from '../components/ConfirmationModal'
import AdminVerificationModal from '../components/AdminVerificationModal'
import ReturnDamagedModal from '../components/ReturnDamagedModal'
import useToast from '../../../context/useToast'
import './InventorySection.css'

const COLOR_PALETTE = [
  { name: 'Signature Black', swatch: 'bg-neutral-900' },
  { name: 'Velocity Red', swatch: 'bg-red-700' },
  { name: 'Metallic Gray', swatch: 'bg-zinc-500' },
  { name: 'Pearl White', swatch: 'bg-white border-neutral-400' },
  { name: 'Ocean Red', swatch: 'bg-red-700' },
  { name: 'Forest Green', swatch: 'bg-green-800' },
  { name: 'Midnight Purple', swatch: 'bg-purple-900' },
  { name: 'Sunset Orange', swatch: 'bg-orange-600' },
]

const inventoryTabs = [
  { id: 'all', label: 'All' },
  { id: 'motorcycle-parts', label: 'Motorcycle Units' },
  { id: 'spare-parts', label: 'Spare Parts' },
  { id: 'returned-damaged', label: 'Returned / Damaged' },
  { id: 'verifications', label: 'Pending Verifications' },
  { id: 'archived', label: 'Deleted Items' },
]

const defaultItemForm = {
  // Place inside InventorySection component:
  //   const [isSpecModalOpen, setIsSpecModalOpen] = useState(false);
  //   const [specCategory, setSpecCategory] = useState('ENGINE');
  //   const [specFields, setSpecFields] = useState([{ label: '', value: '' }]);
  name: '',
  model: '',
  category: 'Motorcycle Units',
  description: '',
  stock: '1',
  price: '',
  colors: [],
  colorVariants: [],
  status: 'In Stock',
  badge: 'New Arrival',
  showInShowroom: true,
  specs: [], // Array of {category, label, value}
  equipment: [], // Array of strings
}

const normalizeText = (value = '') => String(value).trim().toLowerCase()

const canonicalStatusKey = (value = '') => {
  const normalized = normalizeText(value)
  const compact = normalized.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()

  if (!compact || compact === 'all') return 'all'
  if (['in stock', 'available', 'instock', 'in-stock'].includes(compact)) return 'in stock'
  if (['low stock', 'low-stock', 'low', 'limited'].includes(compact)) return 'low stock'
  if (['out of stock', 'out-of-stock', 'outofstock', 'unavailable', 'not available', 'sold out'].includes(compact)) return 'out of stock'

  return compact
}

export default function InventorySection({
  items,
  canEditOperations,
  inventoryStatusOptions,
  handleCollectionUpdate,
  formatCurrency,
  categories = [],
  models = [],
  variants = [],
  currentUser = null,
  currentAccessRole = '',
  inventoryChangeRequests = [],
  isDarkMode = true,
}) {
  const [activeTab, setActiveTab] = useState('all')
  const [searchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isAddUnitModalOpen, setIsAddUnitModalOpen] = useState(false)
  const [isAddSparepartsModalOpen, setIsAddSparepartsModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isUpdateStocksModalOpen, setIsUpdateStocksModalOpen] = useState(false)
  const [isCriticalStockModalOpen, setIsCriticalStockModalOpen] = useState(false)
  const [isSavingItem, setIsSavingItem] = useState(false)
  const [itemForm, setItemForm] = useState(defaultItemForm)

  // --- Technical Specification Modal State ---
  const [isSpecModalOpen, setIsSpecModalOpen] = useState(false);
  const [specCategory, setSpecCategory] = useState('ENGINE');
  const [specFields, setSpecFields] = useState([{ label: '', value: '' }]);
  const [sparePartsForm, setSparePartsForm] = useState({ ...defaultItemForm, category: 'Spare Parts' })
  const [editingItem, setEditingItem] = useState(null)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState('')
  const [galleryFiles, setGalleryFiles] = useState([])
  const [galleryPreviews, setGalleryPreviews] = useState([])
  const [formMessage, setFormMessage] = useState(null)
  const [stockUpdates, setStockUpdates] = useState({})
  const [editFormData, setEditFormData] = useState({})
  const [selectedModel, setSelectedModel] = useState(null)
  const [selectedVariant, setSelectedVariant] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState(null)
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false)
  const [isVariantDropdownOpen, setIsVariantDropdownOpen] = useState(false)
  const [selectedSparepartsModel, setSelectedSparepartsModel] = useState(null)
  const [selectedSparepartsCategory, setSelectedSparepartsCategory] = useState(null)
  const [editSelectedCategory, setEditSelectedCategory] = useState(null)
  const [editSelectedModel, setEditSelectedModel] = useState(null)
  const [editSelectedVariant, setEditSelectedVariant] = useState(null)
  const [editImageFile, setEditImageFile] = useState(null)
  const [editImagePreview, setEditImagePreview] = useState('')
  const [editGalleryFiles, setEditGalleryFiles] = useState([])
  const [editGalleryPreviews, setEditGalleryPreviews] = useState([])
  const [stockSearchTerm, setStockSearchTerm] = useState('')
  const [selectedColorForVariant, setSelectedColorForVariant] = useState(null)
  const [colorVariantStock, setColorVariantStock] = useState('')
  const [editSelectedColorForVariant, setEditSelectedColorForVariant] = useState(null)
  const [editColorVariantStock, setEditColorVariantStock] = useState('')
  const [confirmModal, setConfirmModal] = useState({ open: false, action: null, itemId: null })
  const [adminVerifyModal, setAdminVerifyModal] = useState({
    open: false,
    mode: 'delete', // 'rename' | 'update' | 'delete' | 'approve-rename' | 'approve-update' | 'approve-delete'
    itemId: null,
    item: null,
    itemName: '',
    proposedName: '',
    requestId: null,
    requestedBy: null,
    reason: '',
    pendingUpdates: null,
  })
  const [isVerifyingAction, setIsVerifyingAction] = useState(false)
  const [archivedItems, setArchivedItems] = useState([])
  const [stockNumberPadOpen, setStockNumberPadOpen] = useState(false)
  const [stockNumberPadValue, setStockNumberPadValue] = useState('')
  const [stockNumberPadItemId, setStockNumberPadItemId] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  // Returned / Damaged Products State
  const [damagedReturns, setDamagedReturns] = useState([])
  const [damagedSearchTerm, setDamagedSearchTerm] = useState('')
  const [damagedFilterStatus, setDamagedFilterStatus] = useState('all')
  const [isReturnDamagedModalOpen, setIsReturnDamagedModalOpen] = useState(false)

  // Real-time subscription to damaged & returned products
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'damagedReturns'), (snap) => {
      const records = snap.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
      records.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0)
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0)
        return timeB - timeA
      })
      setDamagedReturns(records)
    }, (error) => {
      console.warn('Unable to subscribe to damagedReturns collection:', error)
    })
    return () => unsub()
  }, [])

  const filteredDamagedReturns = useMemo(() => {
    return damagedReturns.filter((rec) => {
      const matchesStatus = damagedFilterStatus === 'all' || rec.dispositionStatus === damagedFilterStatus
      if (!matchesStatus) return false
      if (!damagedSearchTerm.trim()) return true
      const term = damagedSearchTerm.trim().toLowerCase()
      const name = String(rec.itemName || '').toLowerCase()
      const sku = String(rec.itemSku || rec.itemId || '').toLowerCase()
      const cust = String(rec.customerSource || '').toLowerCase()
      const reason = String(rec.reasonNotes || '').toLowerCase()
      return name.includes(term) || sku.includes(term) || cust.includes(term) || reason.includes(term)
    })
  }, [damagedReturns, damagedFilterStatus, damagedSearchTerm])

  const handleUpdateDisposition = async (recordId, newDisposition) => {
    try {
      const targetRecord = damagedReturns.find((r) => r.id === recordId)
      await updateDoc(doc(db, 'damagedReturns', recordId), {
        dispositionStatus: newDisposition,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser?.displayName || currentUser?.email || 'Staff',
      })

      // If item was marked repaired_restocked and was originally deducted, restore stock!
      if (newDisposition === 'repaired_restocked' && targetRecord?.deductedFromStock && targetRecord?.itemId) {
        const itemDocRef = doc(db, 'inventory', targetRecord.itemId)
        const currentInvItem = items.find((i) => i.id === targetRecord.itemId)
        if (currentInvItem) {
          const restoredStock = Number(currentInvItem.stock ?? 0) + Number(targetRecord.quantity || 1)
          await updateDoc(itemDocRef, {
            stock: restoredStock,
            status: getInventoryStatus({ stock: restoredStock }),
            updatedAt: serverTimestamp(),
          })
          handleCollectionUpdate?.()
          success(`Updated to Repaired & Restocked. Restored ${targetRecord.quantity} unit(s) back to active inventory!`)
          return
        }
      }

      success(`Updated disposition status to ${newDisposition.replace(/_/g, ' ')}`)
    } catch (err) {
      console.error('Failed to update disposition status:', err)
      toastError('Failed to update disposition status.')
    }
  }

  const handleExportDamagedExcel = () => {
    const totalQty = filteredDamagedReturns.reduce((sum, r) => sum + Number(r.quantity || 0), 0)
    const kpis = [
      { label: 'Total Incidents', value: filteredDamagedReturns.length },
      { label: 'Units Affected', value: `${totalQty} pcs` },
      { label: 'Pending Inspection', value: filteredDamagedReturns.filter((r) => r.dispositionStatus === 'pending_inspection').length },
      { label: 'Supplier Returns', value: filteredDamagedReturns.filter((r) => r.dispositionStatus === 'returned_to_supplier').length },
      { label: 'Written Off', value: filteredDamagedReturns.filter((r) => ['written_off', 'disposed'].includes(r.dispositionStatus)).length },
    ]

    const columns = [
      { header: 'Incident ID', key: 'id', wch: 18 },
      { header: 'Date Logged', key: 'dateText', wch: 14 },
      { header: 'Product Name', key: 'itemName', wch: 30 },
      { header: 'SKU / Code', key: 'itemSku', wch: 16 },
      { header: 'Qty', key: 'quantity', wch: 8 },
      { header: 'Condition', key: 'conditionText', wch: 24 },
      { header: 'Source / Customer', key: 'customerSource', wch: 22 },
      { header: 'Stock Action', key: 'stockAction', wch: 16 },
      { header: 'Disposition Status', key: 'dispositionText', wch: 24 },
      { header: 'Reason Notes', key: 'reasonNotes', wch: 35 },
      { header: 'Logged By', key: 'loggedByText', wch: 20 },
    ]

    const exportRows = filteredDamagedReturns.map((r) => {
      const d = r.createdAt?.toDate ? r.createdAt.toDate() : (r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : new Date(r.createdAt || Date.now()))
      return {
        id: r.id,
        dateText: d.toLocaleDateString(),
        itemName: r.itemName || '—',
        itemSku: r.itemSku || r.itemId || '—',
        quantity: r.quantity || 1,
        conditionText: (r.condition || 'defective').replace(/_/g, ' '),
        customerSource: r.customerSource || 'Store Return',
        stockAction: r.deductedFromStock ? 'Deducted' : 'Not Deducted',
        dispositionText: (r.dispositionStatus || 'pending_inspection').replace(/_/g, ' '),
        reasonNotes: r.reasonNotes || '—',
        loggedByText: r.loggedBy?.name || r.loggedBy?.email || 'Staff',
      }
    })

    exportProfessionalExcel({
      filename: 'bykelink-damaged-returns-report',
      sheetName: 'Damaged & Returns',
      reportTitle: 'DAMAGED & RETURNED PRODUCTS AUDIT REPORT',
      subtitle: 'Motorcycle Dealership & Precision Service Center Management System',
      periodText: damagedFilterStatus === 'all' ? 'All Incidents' : `Status: ${damagedFilterStatus}`,
      generatedBy: currentUser?.displayName || currentUser?.email || 'Administrator',
      kpis,
      columns,
      data: exportRows,
    })
    success('Professional Excel report downloaded successfully.')
  }

  const handleExportDamagedPdf = () => {
    const totalQty = filteredDamagedReturns.reduce((sum, r) => sum + Number(r.quantity || 0), 0)
    const kpis = [
      { label: 'Total Incidents', value: filteredDamagedReturns.length },
      { label: 'Units Affected', value: `${totalQty} pcs` },
      { label: 'Pending Inspection', value: filteredDamagedReturns.filter((r) => r.dispositionStatus === 'pending_inspection').length },
      { label: 'Supplier Returns', value: filteredDamagedReturns.filter((r) => r.dispositionStatus === 'returned_to_supplier').length },
      { label: 'Written Off', value: filteredDamagedReturns.filter((r) => ['written_off', 'disposed'].includes(r.dispositionStatus)).length },
    ]

    const columns = [
      { header: 'ID', key: 'id' },
      { header: 'Date', key: 'dateText' },
      { header: 'Product Name', key: 'itemName' },
      { header: 'SKU', key: 'itemSku' },
      { header: 'Qty', key: 'quantity' },
      { header: 'Condition', key: 'conditionText' },
      { header: 'Source', key: 'customerSource' },
      { header: 'Stock Action', key: 'stockAction' },
      { header: 'Disposition', key: 'dispositionText' },
      { header: 'Reason', key: 'reasonNotes' },
    ]

    const exportRows = filteredDamagedReturns.map((r) => {
      const d = r.createdAt?.toDate ? r.createdAt.toDate() : (r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : new Date(r.createdAt || Date.now()))
      return {
        id: r.id,
        dateText: d.toLocaleDateString(),
        itemName: r.itemName || '—',
        itemSku: r.itemSku || r.itemId || '—',
        quantity: r.quantity || 1,
        conditionText: (r.condition || 'defective').replace(/_/g, ' '),
        customerSource: r.customerSource || 'Store Return',
        stockAction: r.deductedFromStock ? 'Deducted' : 'Not Deducted',
        dispositionText: (r.dispositionStatus || 'pending_inspection').replace(/_/g, ' '),
        reasonNotes: r.reasonNotes || '—',
      }
    })

    exportBrandedPdf({
      filename: 'bykelink-damaged-returns-report',
      title: 'DAMAGED & RETURNED PRODUCTS AUDIT REPORT',
      subtitle: 'Motorcycle Dealership & Precision Service Center Management System',
      periodText: damagedFilterStatus === 'all' ? 'All Incidents' : `Status: ${damagedFilterStatus}`,
      generatedBy: currentUser?.displayName || currentUser?.email || 'Administrator',
      kpis,
      columns,
      data: exportRows,
      orientation: 'landscape',
    })
    success('Printable PDF report downloaded successfully.')
  }

  const handleExportInventoryExcel = () => {
    const totalUnits = items.reduce((sum, item) => sum + Number(item.stock || 0), 0)
    const totalValuation = items.reduce((sum, item) => sum + (Number(item.stock || 0) * Number(item.price || 0)), 0)
    const lowStockCount = items.filter((item) => Number(item.stock || 0) <= 5 && Number(item.stock || 0) > 0).length
    const outOfStockCount = items.filter((item) => Number(item.stock || 0) <= 0).length

    const kpis = [
      { label: 'Total Products', value: items.length },
      { label: 'Units on Hand', value: `${totalUnits} pcs` },
      { label: 'Asset Valuation', value: formatCurrency(totalValuation) },
      { label: 'Low Stock Items', value: lowStockCount },
      { label: 'Out of Stock', value: outOfStockCount },
    ]

    const columns = [
      { header: 'SKU / Code', key: 'sku', wch: 18 },
      { header: 'Product Name', key: 'name', wch: 32 },
      { header: 'Category', key: 'category', wch: 22 },
      { header: 'Model / Variant', key: 'model', wch: 24 },
      { header: 'Available Stock', key: 'stockFormatted', wch: 16 },
      { header: 'Unit Price', key: 'priceFormatted', wch: 18 },
      { header: 'Asset Value', key: 'valuationFormatted', wch: 22 },
      { header: 'Status', key: 'status', wch: 16 },
    ]

    const exportRows = items.map((item) => {
      const st = Number(item.stock || 0)
      const pr = Number(item.price || 0)
      return {
        sku: item.sku || item.code || item.id,
        name: item.name || '—',
        category: item.category || 'General',
        model: `${item.model || ''} ${item.variant || ''}`.trim() || '—',
        stockFormatted: `${st} pcs`,
        priceFormatted: formatCurrency(pr),
        valuationFormatted: formatCurrency(st * pr),
        status: item.status || (st <= 0 ? 'Out of Stock' : st <= 5 ? 'Low Stock' : 'In Stock'),
      }
    })

    exportProfessionalExcel({
      filename: 'bykelink-inventory-valuation-report',
      sheetName: 'Inventory Valuation',
      reportTitle: 'LIVE INVENTORY STOCK & ASSET VALUATION AUDIT REPORT',
      subtitle: 'Warehouse Stock Take, Available Quantities, and Asset Pricing',
      periodText: `Current Live Inventory (${new Date().toLocaleDateString()})`,
      generatedBy: currentUser?.displayName || currentUser?.email || 'Administrator',
      kpis,
      columns,
      data: exportRows,
    })
    success('Inventory valuation Excel downloaded successfully.')
  }

  const handleExportInventoryPdf = () => {
    const totalUnits = items.reduce((sum, item) => sum + Number(item.stock || 0), 0)
    const totalValuation = items.reduce((sum, item) => sum + (Number(item.stock || 0) * Number(item.price || 0)), 0)
    const lowStockCount = items.filter((item) => Number(item.stock || 0) <= 5 && Number(item.stock || 0) > 0).length
    const outOfStockCount = items.filter((item) => Number(item.stock || 0) <= 0).length

    const kpis = [
      { label: 'Total Products', value: items.length },
      { label: 'Units on Hand', value: `${totalUnits} pcs` },
      { label: 'Asset Valuation', value: formatCurrency(totalValuation) },
      { label: 'Low Stock', value: lowStockCount },
      { label: 'Out of Stock', value: outOfStockCount },
    ]

    const columns = [
      { header: 'SKU', key: 'sku' },
      { header: 'Product Name', key: 'name' },
      { header: 'Category', key: 'category' },
      { header: 'Model', key: 'model' },
      { header: 'Stock', key: 'stockFormatted' },
      { header: 'Price', key: 'priceFormatted' },
      { header: 'Total Value', key: 'valuationFormatted' },
      { header: 'Status', key: 'status' },
    ]

    const exportRows = items.map((item) => {
      const st = Number(item.stock || 0)
      const pr = Number(item.price || 0)
      return {
        sku: item.sku || item.code || item.id,
        name: item.name || '—',
        category: item.category || 'General',
        model: `${item.model || ''} ${item.variant || ''}`.trim() || '—',
        stockFormatted: `${st} pcs`,
        priceFormatted: formatCurrency(pr),
        valuationFormatted: formatCurrency(st * pr),
        status: item.status || (st <= 0 ? 'Out of Stock' : st <= 5 ? 'Low Stock' : 'In Stock'),
      }
    })

    exportBrandedPdf({
      filename: 'bykelink-inventory-valuation-report',
      title: 'LIVE INVENTORY STOCK & ASSET VALUATION AUDIT REPORT',
      subtitle: 'Warehouse Stock Take, Available Quantities, and Asset Pricing',
      periodText: `Current Live Inventory (${new Date().toLocaleDateString()})`,
      generatedBy: currentUser?.displayName || currentUser?.email || 'Administrator',
      kpis,
      columns,
      data: exportRows,
      orientation: 'landscape',
    })
    success('Inventory valuation PDF downloaded successfully.')
  }

  const { success, error: toastError } = useToast()
  const normalizedRole = normalizeText(currentAccessRole)
  const isAdminOrSuperadmin = ['admin', 'superadmin'].includes(normalizedRole)

  const pendingVerificationRequests = useMemo(
    () => inventoryChangeRequests.filter((req) => req.status === 'pending'),
    [inventoryChangeRequests],
  )

  const pendingRequestByItemId = useMemo(() => {
    const map = new Map()
    pendingVerificationRequests.forEach((req) => {
      if (req.itemId && !map.has(req.itemId)) {
        map.set(req.itemId, req)
      }
    })
    return map
  }, [pendingVerificationRequests])

  // Load archived items for admin / superadmin
  useEffect(() => {
    const loadArchivedItems = async () => {
      try {
        if (isAdminOrSuperadmin || activeTab === 'archived') {
          const snapshot = await getDocs(collection(db, 'deleteArchived'))
          setArchivedItems(
            snapshot.docs
              .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
              .filter((entry) => entry.recordType === 'inventory' || (!entry.originalCollection && (entry.category || entry.model))),
          )
        }
      } catch (error) {
        console.warn('Failed to load archived items', error)
      }
    }
    loadArchivedItems()
  }, [activeTab, isAdminOrSuperadmin])

  const getInventoryStatus = (item = {}) => {
    const hasStockValue = item?.stock !== undefined && item?.stock !== null && item?.stock !== ''
    if (hasStockValue) {
      const stockValue = Number(item.stock)
      if (Number.isFinite(stockValue)) {
        if (stockValue <= 0) return 'Out of Stock'
        if (stockValue <= 5) return 'Low Stock'
        return 'In Stock'
      }
    }

    const savedStatus = String(item?.status || '').trim()
    const normalizedSavedStatus = normalizeText(savedStatus)

    if (normalizedSavedStatus) {
      if (['in stock', 'available', 'instock', 'in-stock'].includes(normalizedSavedStatus)) return 'In Stock'
      if (['low stock', 'limited', 'low', 'low-stock'].includes(normalizedSavedStatus)) return 'Low Stock'
      if (['out of stock', 'unavailable', 'not available', 'out-of-stock', 'outofstock', 'sold out'].includes(normalizedSavedStatus)) return 'Out of Stock'
    }

    return 'In Stock'
  }

  const normalizeStatusFilter = (statusValue = '') => {
    const normalized = canonicalStatusKey(statusValue)

    if (normalized === 'all') return 'all'
    if (normalized === 'in stock') return 'In Stock'
    if (normalized === 'low stock') return 'Low Stock'
    if (normalized === 'out of stock') return 'Out of Stock'

    return statusValue
  }

  const matchesStatusFilter = (itemStatus, selectedStatus) => {
    const canonicalItemStatus = canonicalStatusKey(itemStatus)
    const canonicalSelectedStatus = canonicalStatusKey(selectedStatus)

    if (canonicalSelectedStatus === 'all') return true
    return canonicalItemStatus === canonicalSelectedStatus
  }

  const getAutoStatus = (itemOrStock) => {
    if (typeof itemOrStock === 'object') {
      return getInventoryStatus(itemOrStock)
    }

    const stockValue = Number(itemOrStock ?? 0)
    return getInventoryStatus({ stock: stockValue })
  }

  const isCriticalStock = (stock) => {
    const stockValue = Number(stock ?? 0)
    return stockValue <= 5 || stockValue === 0
  }

  // Disable page scroll when modals are open
  useEffect(() => {
    if (isAddUnitModalOpen || isAddSparepartsModalOpen || isEditModalOpen || isUpdateStocksModalOpen) {
      document.documentElement.style.overflow = 'hidden'
      document.body.style.overflow = 'hidden'
      return () => {
        document.documentElement.style.overflow = ''
        document.body.style.overflow = ''
      }
    }
  }, [isAddUnitModalOpen, isAddSparepartsModalOpen, isEditModalOpen, isUpdateStocksModalOpen])

  const filteredItems = useMemo(() => {
    // Show archived items when on archived tab
    if (activeTab === 'archived') {
      return archivedItems.filter((item) => {
        const searchHaystack = normalizeText(`${item.name} ${item.model} ${item.category} ${item.description} ${item.sku || ''}`)
        const searchMatch = !searchTerm || searchHaystack.includes(normalizeText(searchTerm))
        return searchMatch
      })
    }

    return items.filter((item) => {
      const searchHaystack = normalizeText(`${item.name} ${item.model} ${item.category} ${item.description} ${item.sku || ''}`)
      const searchMatch = !searchTerm || searchHaystack.includes(normalizeText(searchTerm))
      const itemStatus = getInventoryStatus(item)
      const statusMatch = matchesStatusFilter(itemStatus, statusFilter)

      if (!searchMatch || !statusMatch) {
        return false
      }

      if (activeTab === 'all') {
        return true
      }

      if (activeTab === 'motorcycle-parts') {
        return normalizeText(item.category) === normalizeText('Motorcycle Units')
      }

      if (activeTab === 'spare-parts') {
        return normalizeText(item.category) === normalizeText('Spare Parts')
      }

      return true
    })
  }, [activeTab, items, archivedItems, searchTerm, statusFilter])

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [activeTab, searchTerm, statusFilter])

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedItems = useMemo(() => {
    return filteredItems.slice(startIndex, endIndex)
  }, [filteredItems, startIndex, endIndex])

  const summaryCards = useMemo(() => {
    const totalUnits = items.reduce((sum, item) => sum + Number(item.stock ?? 0), 0)
    const maxStock = Math.max(...items.map((item) => Number(item.stock ?? 0)), 100)
    const criticalStock = items.filter((item) => {
      const stockValue = Number(item.stock ?? 0)
      return stockValue === 0 || stockValue < maxStock * 0.2
    }).length
    const partsMovement = items.length
      ? (items.reduce((sum, item) => sum + Number(item.stock ?? 0), 0) / Math.max(items.length, 1) / 10).toFixed(1)
      : '0.0'
    const uniqueCategories = new Set(items.map((item) => normalizeText(item.category || 'uncategorized'))).size

    return [
      { label: 'Total Stock Units', value: totalUnits.toLocaleString(), detail: `${items.length} SKUs monitored` },
      { label: 'Critical Stock', value: String(criticalStock), detail: 'Low inventory alerts', isCritical: true, onClick: () => setIsCriticalStockModalOpen(true) },
      { label: 'Parts Movement', value: partsMovement, detail: 'Avg stock velocity' },
      { label: 'Stock Groups', value: String(uniqueCategories), detail: 'Segments tracked' },
    ]
  }, [items])

  const handleFormChange = (event, formType = 'unit') => {
    const { name, value, type, checked } = event.target

    if (formType === 'unit') {
      setItemForm((current) => {
        const nextForm = {
          ...current,
          [name]: type === 'checkbox' ? checked : value,
        }

        if (name === 'stock') {
          nextForm.status = getInventoryStatus({ stock: Number(value || 0) })
        }

        return nextForm
      })
    } else {
      setSparePartsForm((current) => {
        const nextForm = {
          ...current,
          [name]: type === 'checkbox' ? checked : value,
        }

        if (name === 'stock') {
          nextForm.status = getInventoryStatus({ stock: Number(value || 0) })
        }

        return nextForm
      })
    }
    setFormMessage(null)
  }

  const handleImageChange = (event) => {
    const file = event.target.files?.[0] || null
    setImageFile(file)
    setImagePreview(file ? URL.createObjectURL(file) : '')
    setFormMessage(null)
  }

  const handleGalleryImageChange = (event, index) => {
    const files = event.target.files
    if (!files || !files[0]) return

    const file = files[0]
    const newFiles = [...galleryFiles]
    const newPreviews = [...galleryPreviews]

    // Replace the image at the specific index
    newFiles[index] = file
    newPreviews[index] = URL.createObjectURL(file)

    setGalleryFiles(newFiles)
    setGalleryPreviews(newPreviews)
    setFormMessage(null)
  }

  const handleRemoveGalleryImageAtIndex = (index) => {
    const newFiles = [...galleryFiles]
    const newPreviews = [...galleryPreviews]

    if (newPreviews[index]) {
      URL.revokeObjectURL(newPreviews[index])
    }

    newFiles.splice(index, 1)
    newPreviews.splice(index, 1)

    setGalleryFiles(newFiles)
    setGalleryPreviews(newPreviews)
  }



  const handleOpenAddUnitModal = () => {
    setItemForm(defaultItemForm)
    setSelectedCategory(null)
    setSelectedModel(null)
    setSelectedVariant(null)
    setImageFile(null)
    setImagePreview('')
    setFormMessage(null)
    setSelectedColorForVariant(null)
    setColorVariantStock('')
    setIsAddUnitModalOpen(true)
  }

  const handleCloseAddUnitModal = () => {
    const hasUnsavedChanges = itemForm.name.trim() || itemForm.price || itemForm.stock !== '1' || imageFile
    if (hasUnsavedChanges) {
      setConfirmModal({ open: true, action: 'add-unit-cancel', itemId: 'unit' })
      return
    }
    setIsAddUnitModalOpen(false)
    setImageFile(null)
    setImagePreview('')
    setGalleryFiles([])
    setGalleryPreviews([])
    setFormMessage(null)
    setItemForm(defaultItemForm)
    setSelectedCategory(null)
    setSelectedModel(null)
    setSelectedVariant(null)
    setSelectedColorForVariant(null)
    setColorVariantStock('')
  }

  const handleOpenAddSparepartsModal = () => {
    setSparePartsForm({ ...defaultItemForm, category: 'Spare Parts' })
    setSelectedSparepartsCategory(null)
    setSelectedSparepartsModel(null)
    setImageFile(null)
    setImagePreview('')
    setFormMessage(null)
    setIsAddSparepartsModalOpen(true)
  }

  const handleCloseAddSparepartsModal = () => {
    const hasUnsavedChanges = sparePartsForm.name.trim() || sparePartsForm.price || sparePartsForm.stock !== '1' || imageFile
    if (hasUnsavedChanges) {
      setConfirmModal({ open: true, action: 'add-spare-parts-cancel', itemId: 'spare' })
      return
    }
    setIsAddSparepartsModalOpen(false)
    setImageFile(null)
    setImagePreview('')
    setGalleryFiles([])
    setGalleryPreviews([])
    setFormMessage(null)
    setSparePartsForm({ ...defaultItemForm, category: 'Spare Parts' })
    setSelectedSparepartsCategory(null)
    setSelectedSparepartsModel(null)
  }

  const handleCreateUnit = async (event) => {
    event.preventDefault()

    if (!canEditOperations) {
      setFormMessage({ type: 'error', text: 'Only staff-level access or higher can create inventory items.' })
      return
    }

    if (!itemForm.name.trim()) {
      setFormMessage({ type: 'error', text: 'Enter the unit name first.' })
      return
    }

    if (!selectedModel) {
      setFormMessage({ type: 'error', text: 'Please select a Model.' })
      return
    }

    if (!itemForm.price || Number(itemForm.price) < 0) {
      setFormMessage({ type: 'error', text: 'Enter a valid unit price.' })
      return
    }

    // Show confirmation dialog before proceeding
    setConfirmModal({ open: true, action: 'add-unit-confirm', itemId: 'unit' })
  }

  const handleProceedCreateUnit = async () => {
    setIsSavingItem(true)
    setFormMessage(null)

    try {
      let imageUrl = ''
      const galleryUrls = []

      if (imageFile) {
        const storageRef = ref(storage, `inventory/${Date.now()}-${imageFile.name}`)
        const uploadSnapshot = await uploadBytes(storageRef, imageFile)
        imageUrl = await getDownloadURL(uploadSnapshot.ref)
      }

      // Upload gallery images
      for (const galleryFile of galleryFiles) {
        const storageRef = ref(storage, `inventory/gallery/${Date.now()}-${Math.random()}-${galleryFile.name}`)
        const uploadSnapshot = await uploadBytes(storageRef, galleryFile)
        const galleryUrl = await getDownloadURL(uploadSnapshot.ref)
        galleryUrls.push(galleryUrl)
      }

      const totalStock = Array.isArray(itemForm.colorVariants) && itemForm.colorVariants.length > 0
        ? itemForm.colorVariants.reduce((sum, v) => sum + (v.stock || 0), 0)
        : Number(itemForm.stock || 0)

      const derivedStatus = getInventoryStatus({ stock: totalStock })

      const newUnitRef = await addDoc(collection(db, 'inventory'), {
        name: itemForm.name.trim(),
        model: selectedModel.name,
        modelId: selectedModel.id,
        variant: selectedVariant?.name || '',
        variantId: selectedVariant?.id || '',
        category: 'Motorcycle Units',
        description: itemForm.description.trim(),
        stock: totalStock,
        price: Number(itemForm.price || 0),
        status: derivedStatus,
        badge: itemForm.badge.trim() || 'New Arrival',
        colorVariants: itemForm.colorVariants,
        specs: itemForm.specs || [],
        equipment: itemForm.equipment || [],
        imageUrl,
        gallery: imageUrl ? [imageUrl, ...galleryUrls] : galleryUrls,
        showInShowroom: Boolean(itemForm.showInShowroom),
        publishedToShowroom: Boolean(itemForm.showInShowroom),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      // Log the inventory addition
      try {
        await addDoc(collection(db, 'inventoryLogs'), {
          itemName: itemForm.name.trim(),
          itemModel: selectedModel.name,
          category: 'Motorcycle Units',
          stock: totalStock,
          price: Number(itemForm.price || 0),
          status: derivedStatus,
          imageUrl: imageUrl || '',
          addedBy: currentUser?.displayName || currentUser?.email || 'Unknown',
          createdAt: serverTimestamp(),
        })
      } catch (logError) {
        console.warn('Unable to log inventory addition', logError)
      }

      await logSystemAuditEvent({
        module: 'Inventory',
        action: 'PRODUCT_CREATED',
        summary: `Added Motorcycle Unit "${itemForm.name.trim()}" (${selectedModel.name}, stock: ${totalStock})`,
        targetType: 'inventory',
        targetId: newUnitRef.id,
        targetName: itemForm.name.trim(),
        newData: {
          name: itemForm.name.trim(),
          model: selectedModel.name,
          category: 'Motorcycle Units',
          stock: totalStock,
          price: Number(itemForm.price || 0),
        },
        currentUser,
        accessRole: currentAccessRole,
      })

      setFormMessage({ type: 'success', text: 'Unit added successfully and synced to the showroom.' })
      window.setTimeout(() => {
        setIsAddUnitModalOpen(false)
        setImageFile(null)
        setImagePreview('')
        setGalleryFiles([])
        setGalleryPreviews([])
        setItemForm(defaultItemForm)
        setSelectedCategory(null)
        setSelectedModel(null)
        setSelectedVariant(null)
        handleCollectionUpdate()
      }, 1500)
    } catch (error) {
      console.error('Unable to create unit', error)
      setFormMessage({
        type: 'error',
        text: `Unable to add the unit. ${error.message}`,
      })
    } finally {
      setIsSavingItem(false)
    }
  }

  const handleCreateSpareParts = async (event) => {
    event.preventDefault()

    if (!canEditOperations) {
      setFormMessage({ type: 'error', text: 'Only staff-level access or higher can create inventory items.' })
      return
    }

    if (!sparePartsForm.name.trim()) {
      setFormMessage({ type: 'error', text: 'Enter the spare part name first.' })
      return
    }

    if (!selectedSparepartsModel) {
      setFormMessage({ type: 'error', text: 'Please select a Unit/Model.' })
      return
    }

    if (!sparePartsForm.price || Number(sparePartsForm.price) < 0) {
      setFormMessage({ type: 'error', text: 'Enter a valid spare part price.' })
      return
    }

    // Show confirmation dialog before proceeding
    setConfirmModal({ open: true, action: 'add-spare-parts-confirm', itemId: 'spare' })
  }

  const handleProceedCreateSpareParts = async () => {
    setIsSavingItem(true)
    setFormMessage(null)

    try {
      let imageUrl = ''
      const totalStock = Number(sparePartsForm.stock || 0)
      const derivedStatus = getInventoryStatus({ stock: totalStock })

      if (imageFile) {
        const storageRef = ref(storage, `inventory/${Date.now()}-${imageFile.name}`)
        const uploadSnapshot = await uploadBytes(storageRef, imageFile)
        imageUrl = await getDownloadURL(uploadSnapshot.ref)
      }

      const newPartRef = await addDoc(collection(db, 'inventory'), {
        name: sparePartsForm.name.trim(),
        model: selectedSparepartsModel.name,
        modelId: selectedSparepartsModel.id,
        category: 'Spare Parts',
        description: sparePartsForm.description.trim(),
        stock: totalStock,
        price: Number(sparePartsForm.price || 0),
        status: derivedStatus,
        badge: sparePartsForm.badge.trim() || 'New Stock',
        specs: sparePartsForm.specs || [],
        equipment: sparePartsForm.equipment || [],
        imageUrl,
        gallery: imageUrl ? [imageUrl] : [],
        showInShowroom: Boolean(sparePartsForm.showInShowroom),
        publishedToShowroom: Boolean(sparePartsForm.showInShowroom),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })

      // Log the spare parts addition
      try {
        await addDoc(collection(db, 'inventoryLogs'), {
          itemName: sparePartsForm.name.trim(),
          itemModel: selectedSparepartsModel.name,
          category: 'Spare Parts',
          stock: totalStock,
          price: Number(sparePartsForm.price || 0),
          status: derivedStatus,
          imageUrl: imageUrl || '',
          addedBy: currentUser?.displayName || currentUser?.email || 'Unknown',
          createdAt: serverTimestamp(),
        })
      } catch (logError) {
        console.warn('Unable to log inventory addition', logError)
      }

      await logSystemAuditEvent({
        module: 'Inventory',
        action: 'PRODUCT_CREATED',
        summary: `Added Spare Part "${sparePartsForm.name.trim()}" (${selectedSparepartsModel.name}, stock: ${totalStock})`,
        targetType: 'inventory',
        targetId: newPartRef.id,
        targetName: sparePartsForm.name.trim(),
        newData: {
          name: sparePartsForm.name.trim(),
          model: selectedSparepartsModel.name,
          category: 'Spare Parts',
          stock: totalStock,
          price: Number(sparePartsForm.price || 0),
        },
        currentUser,
        accessRole: currentAccessRole,
      })

      setFormMessage({ type: 'success', text: 'Spare part added successfully and synced to the showroom.' })
      window.setTimeout(() => {
        setIsAddSparepartsModalOpen(false)
        setImageFile(null)
        setImagePreview('')
        setGalleryFiles([])
        setGalleryPreviews([])
        setSparePartsForm({ ...defaultItemForm, category: 'Spare Parts' })
        setSelectedSparepartsCategory(null)
        setSelectedSparepartsModel(null)
        handleCollectionUpdate()
      }, 1500)
    } catch (error) {
      console.error('Unable to create spare part', error)
      setFormMessage({
        type: 'error',
        text: `Unable to add the spare part. ${error.message}`,
      })
    } finally {
      setIsSavingItem(false)
    }
  }

  const handleNumberPadConfirm = (itemId, currentStock) => {
    if (stockNumberPadValue === '') return
    const addedValue = Number(stockNumberPadValue)
    const newStock = currentStock + addedValue
    setStockUpdates({ ...stockUpdates, [itemId]: newStock })
    setStockNumberPadOpen(false)
    setStockNumberPadValue('')
    setStockNumberPadItemId(null)
  }

  const handleNumberPadAppend = (digit) => {
    setStockNumberPadValue(stockNumberPadValue + String(digit))
  }

  const handleNumberPadBackspace = () => {
    setStockNumberPadValue(stockNumberPadValue.slice(0, -1))
  }

  const handleConfirmDelete = async () => {
    const { itemId, item, action } = confirmModal

    // Handle add unit confirmation
    if (action === 'add-unit-confirm') {
      setConfirmModal({ open: false, action: null, itemId: null })
      await handleProceedCreateUnit()
      return
    }

    // Handle add unit cancel with unsaved changes
    if (action === 'add-unit-cancel') {
      setConfirmModal({ open: false, action: null, itemId: null })
      setIsAddUnitModalOpen(false)
      setImageFile(null)
      setImagePreview('')
      setGalleryFiles([])
      setGalleryPreviews([])
      setFormMessage(null)
      setItemForm(defaultItemForm)
      setSelectedCategory(null)
      setSelectedModel(null)
      setSelectedVariant(null)
      return
    }

    // Handle add spare parts confirmation
    if (action === 'add-spare-parts-confirm') {
      setConfirmModal({ open: false, action: null, itemId: null })
      await handleProceedCreateSpareParts()
      return
    }

    // Handle add spare parts cancel with unsaved changes
    if (action === 'add-spare-parts-cancel') {
      setConfirmModal({ open: false, action: null, itemId: null })
      setIsAddSparepartsModalOpen(false)
      setImageFile(null)
      setImagePreview('')
      setGalleryFiles([])
      setGalleryPreviews([])
      setFormMessage(null)
      setSparePartsForm({ ...defaultItemForm, category: 'Spare Parts' })
      setSelectedSparepartsCategory(null)
      setSelectedSparepartsModel(null)
      return
    }

    // Handle update stocks cancel with unsaved changes
    if (action === 'update-stocks-cancel') {
      setConfirmModal({ open: false, action: null, itemId: null })
      setIsUpdateStocksModalOpen(false)
      setStockUpdates({})
      setStockSearchTerm('')
      return
    }

    // Handle update stocks confirmation
    if (action === 'update-stocks') {
      setConfirmModal({ open: false, action: null, itemId: null })
      setIsSavingItem(true)
      try {
        const stockChanges = []
        for (const idKey of Object.keys(stockUpdates)) {
          if (stockUpdates[idKey] !== undefined && stockUpdates[idKey] !== '') {
            const targetItem = items.find((entry) => entry.id === idKey)
            const prevStock = Number(targetItem?.stock ?? 0)
            const nextStock = Number(stockUpdates[idKey])
            await updateDoc(doc(db, 'inventory', idKey), {
              stock: nextStock,
              status: getInventoryStatus({ stock: nextStock }),
              updatedAt: serverTimestamp(),
            })
            if (prevStock !== nextStock) {
              stockChanges.push({
                id: idKey,
                name: targetItem?.name || idKey,
                previousStock: prevStock,
                newStock: nextStock,
              })
            }
          }
        }
        if (stockChanges.length > 0) {
          await logSystemAuditEvent({
            module: 'Inventory',
            action: 'STOCK_UPDATED',
            summary: `Updated stock for ${stockChanges.map((c) => `${c.name} (${c.previousStock} → ${c.newStock})`).join(', ')}`,
            targetType: 'inventory',
            targetId: stockChanges[0].id,
            targetName: stockChanges.length === 1 ? stockChanges[0].name : `${stockChanges.length} products`,
            previousData: stockChanges.map((c) => ({ name: c.name, stock: c.previousStock })),
            newData: stockChanges.map((c) => ({ name: c.name, stock: c.newStock })),
            currentUser,
            accessRole: currentAccessRole,
          })
        }
        setFormMessage({ type: 'success', text: 'Stock levels updated successfully!' })
        window.setTimeout(() => {
          setIsUpdateStocksModalOpen(false)
          setStockUpdates({})
          setStockSearchTerm('')
          handleCollectionUpdate()
        }, 1500)
      } catch (error) {
        console.error('Error updating stocks:', error)
        setFormMessage({ type: 'error', text: `Failed to update stocks. ${error.message}` })
      } finally {
        setIsSavingItem(false)
      }
      return
    }

    // Handle edit cancel
    if (action === 'edit-cancel') {
      setConfirmModal({ open: false, action: null, itemId: null })
      setIsEditModalOpen(false)
      setEditFormData({})
      setEditingItem(null)
      return
    }

    // Handle edit confirm - open the edit modal
    if (action === 'edit-confirm') {
      setConfirmModal({ open: false, action: null, itemId: null })
      setIsEditModalOpen(true)
      return
    }

    // Handle edit update
    if (action === 'edit-update') {
      setConfirmModal({ open: false, action: null, itemId: null })
      if (!editingItem) return

      const proposedName = String(editFormData.name ?? editingItem.name ?? '').trim()
      if (!proposedName) {
        toastError('Product name cannot be empty.')
        return
      }

      const isNameChanged = proposedName !== String(editingItem.name || '').trim()

      const colorVariants = editFormData.colorVariants !== undefined ? editFormData.colorVariants : (editingItem.colorVariants ?? [])
      const editTotalStock = Array.isArray(colorVariants) && colorVariants.length > 0
        ? colorVariants.reduce((sum, v) => sum + (v.stock || 0), 0)
        : Number(editFormData.stock ?? editingItem.stock ?? 0)

      const updatePayload = {
        name: proposedName,
        model: editFormData.model ?? editingItem.model ?? '',
        modelId: editFormData.modelId ?? editingItem.modelId ?? '',
        variant: editFormData.variant ?? editingItem.variant ?? '',
        variantId: editFormData.variantId ?? editingItem.variantId ?? '',
        stock: editTotalStock,
        status: getInventoryStatus({ stock: editTotalStock }),
        price: Number(editFormData.price ?? editingItem.price ?? 0),
        colorVariants: colorVariants,
        specs: editFormData.specs ?? editingItem.specs ?? [],
        equipment: editFormData.equipment ?? editingItem.equipment ?? [],
        description: editFormData.description ?? editingItem.description ?? '',
      }

      if (!isAdminOrSuperadmin) {
        setIsSavingItem(true)
        try {
          const requestType = isNameChanged ? 'rename' : 'update'
          const requestReason = isNameChanged
            ? `Staff requested rename from "${editingItem.name}" to "${proposedName}"`
            : 'Staff requested product update'

          // Clean payload to prevent undefined fields
          const cleanPendingUpdates = JSON.parse(JSON.stringify(updatePayload))

          let submittedViaCloud = false
          try {
            const submitRequest = httpsCallable(functions, 'submitInventoryChangeRequest')
            const response = await submitRequest({
              itemId: editingItem.id,
              requestType,
              proposedName: isNameChanged ? proposedName : '',
              pendingUpdates: cleanPendingUpdates,
              reason: requestReason,
            })
            if (response?.data?.ok) {
              submittedViaCloud = true
            }
          } catch (fnErr) {
            console.warn('submitInventoryChangeRequest Cloud Function error, falling back to direct Firestore write:', fnErr)
          }

          if (!submittedViaCloud) {
            // Direct write to inventoryChangeRequests so staff is never blocked
            const changeReqRef = doc(collection(db, 'inventoryChangeRequests'))
            await setDoc(changeReqRef, {
              requestId: changeReqRef.id,
              requestType,
              status: 'pending',
              itemId: editingItem.id,
              currentName: editingItem.name || proposedName,
              proposedName: proposedName || editingItem.name,
              pendingUpdates: cleanPendingUpdates,
              itemSnapshot: {
                name: editingItem.name || '',
                model: editingItem.model || '',
                category: editingItem.category || '',
                sku: editingItem.sku || '',
                stock: Number(editingItem.stock ?? 0),
                price: Number(editingItem.price ?? 0),
                imageUrl: editingItem.imageUrl || '',
              },
              reason: requestReason,
              requestedBy: {
                uid: currentUser?.uid || '',
                name: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Staff User',
                email: currentUser?.email || '',
                role: currentAccessRole || 'staff personnel',
              },
              verifiedBy: null,
              verificationNote: '',
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            })

            await logSystemAuditEvent({
              module: 'Inventory',
              action: requestType === 'rename' ? 'PRODUCT_RENAME_REQUESTED' : 'PRODUCT_UPDATE_REQUESTED',
              summary: `${requestReason} for "${editingItem.name}"`,
              targetType: 'inventory',
              targetId: editingItem.id,
              targetName: editingItem.name,
              previousData: { name: editingItem.name, price: editingItem.price, stock: editingItem.stock },
              newData: cleanPendingUpdates,
              currentUser,
              accessRole: currentAccessRole,
              metadata: { requestId: changeReqRef.id, reason: requestReason },
            })
          }

          success('Change request submitted successfully to Super Admin for verification!')
          setIsEditModalOpen(false)
          setEditFormData({})
          setEditingItem(null)
          handleCollectionUpdate?.()
        } catch (error) {
          console.error('Error submitting change request:', error)
          toastError(error?.message || 'Unable to submit change request for admin verification.')
        } finally {
          setIsSavingItem(false)
        }
        return
      }

      if (isNameChanged) {
        // Admin / Superadmin renaming a product: require explicit AdminVerificationModal
        setAdminVerifyModal({
          open: true,
          mode: 'rename',
          itemId: editingItem.id,
          item: editingItem,
          itemName: editingItem.name || '',
          proposedName,
          pendingUpdates: updatePayload,
          requestId: null,
          requestedBy: null,
          reason: '',
        })
        return
      }

      await handleUpdateItem()
      return
    }

    // Handle staff delete verification request
    if (action === 'request-delete') {
      setConfirmModal({ open: false, action: null, itemId: null })
      setIsSavingItem(true)
      try {
        const submitRequest = httpsCallable(functions, 'submitInventoryChangeRequest')
        const response = await submitRequest({
          itemId,
          requestType: 'delete',
          reason: 'Staff requested product deletion',
        })
        success(response?.data?.message || 'Product deletion request sent to admin for verification.')
      } catch (error) {
        console.error('Error submitting delete request:', error)
        toastError(error?.message || 'Unable to submit deletion verification request.')
      } finally {
        setIsSavingItem(false)
      }
      return
    }

    // Fallback: route any direct delete confirmation into AdminVerificationModal
    setConfirmModal({ open: false, action: null, itemId: null })
    if (isAdminOrSuperadmin && item) {
      setAdminVerifyModal({
        open: true,
        mode: 'delete',
        itemId: item.id,
        item,
        itemName: item.name || '',
        proposedName: '',
        requestId: null,
        requestedBy: null,
        reason: '',
      })
    }
  }

  const handleAdminVerificationConfirm = async ({ adminEmail, adminPassword, verificationNote, verificationMethod }) => {
    const { mode, itemId, item, itemName, proposedName, requestId, pendingUpdates } = adminVerifyModal
    setIsVerifyingAction(true)

    try {
      // If staff caller provided on-site admin credentials, verify via server-side callable
      if (adminEmail && adminPassword) {
        const authorizeDirectly = httpsCallable(functions, 'authorizeInventoryDirectly')
        const response = await authorizeDirectly({
          adminEmail,
          adminPassword,
          action: mode === 'delete' ? 'delete' : 'update',
          itemId,
          pendingUpdates: pendingUpdates || (mode === 'rename' ? { name: proposedName } : null),
          verificationNote: verificationNote || '',
        })

        success(response?.data?.message || 'Admin successfully verified and applied changes.')
        setAdminVerifyModal({ open: false, mode: 'delete', itemId: null, item: null, itemName: '', proposedName: '', requestId: null, requestedBy: null, reason: '', pendingUpdates: null })
        setIsEditModalOpen(false)
        setEditFormData({})
        setEditingItem(null)
        handleCollectionUpdate()
        return
      }

      const verifiedBy = {
        uid: currentUser?.uid || '',
        email: String(currentUser?.email || '').trim().toLowerCase(),
        name: currentUser?.displayName || currentUser?.email || 'Admin',
        role: currentAccessRole || 'admin',
        method: verificationMethod,
      }

      if (mode === 'rename' || mode === 'update') {
        await handleUpdateItem({
          verifiedBy,
          verificationNote,
          wasRenamed: mode === 'rename',
          previousName: itemName,
          newName: proposedName,
        })
        setAdminVerifyModal({ open: false, mode: 'delete', itemId: null, item: null, itemName: '', proposedName: '', requestId: null, requestedBy: null, reason: '', pendingUpdates: null })
        return
      }

      if (mode === 'delete') {
        const deletedItemData = {
          ...(item || {}),
          recordType: 'inventory',
          deletedAt: serverTimestamp(),
          deletedBy: currentUser?.displayName || currentUser?.email || 'Admin',
          verifiedBy,
          verifiedAt: serverTimestamp(),
          deletionReason: verificationNote || '',
        }

        await setDoc(doc(db, 'deleteArchived', itemId), deletedItemData)
        await deleteDoc(doc(db, 'inventory', itemId))
        await logSystemAuditEvent({
          module: 'Inventory',
          action: 'PRODUCT_DELETED',
          summary: `Verified and deleted product "${itemName || itemId}" (moved to archive)`,
          targetType: 'inventory',
          targetId: itemId,
          targetName: itemName || itemId,
          previousData: { name: itemName, stock: item?.stock ?? 0, price: item?.price ?? 0 },
          currentUser,
          accessRole: currentAccessRole,
          verifiedBy,
          metadata: { verificationNote },
        })
        success(`"${itemName || itemId}" verified and moved to archive.`)
        setAdminVerifyModal({ open: false, mode: 'delete', itemId: null, item: null, itemName: '', proposedName: '', requestId: null, requestedBy: null, reason: '', pendingUpdates: null })
        handleCollectionUpdate()
        return
      }

      if (mode === 'approve-rename' || mode === 'approve-delete' || mode === 'approve-update') {
        const verifyRequest = httpsCallable(functions, 'verifyInventoryChangeRequest')
        const response = await verifyRequest({
          requestId,
          decision: 'approve',
          verificationNote,
          verificationMethod,
        })
        success(response?.data?.message || 'Verification confirmed.')
        setAdminVerifyModal({ open: false, mode: 'delete', itemId: null, item: null, itemName: '', proposedName: '', requestId: null, requestedBy: null, reason: '', pendingUpdates: null })
        handleCollectionUpdate()
      }
    } catch (error) {
      console.error('Admin verification failed:', error)
      toastError(error?.message || 'Unable to complete verified action.')
    } finally {
      setIsVerifyingAction(false)
    }
  }

  const handleSubmitRemote = async () => {
    const { itemId, mode, proposedName, pendingUpdates, reason } = adminVerifyModal
    if (!itemId) return
    setIsSavingItem(true)
    try {
      const submitRequest = httpsCallable(functions, 'submitInventoryChangeRequest')
      const requestType = mode === 'delete' ? 'delete' : (proposedName ? 'rename' : 'update')
      const response = await submitRequest({
        itemId,
        requestType,
        proposedName: proposedName || '',
        pendingUpdates: pendingUpdates || {},
        reason: reason || 'Staff requested changes via verification modal',
      })
      success(response?.data?.message || 'Change request submitted for remote admin verification.')
      setAdminVerifyModal({ open: false, mode: 'delete', itemId: null, item: null, itemName: '', proposedName: '', requestId: null, requestedBy: null, reason: '', pendingUpdates: null })
      setIsEditModalOpen(false)
      setEditFormData({})
      setEditingItem(null)
      handleCollectionUpdate()
    } catch (error) {
      console.error('Error submitting remote request:', error)
      toastError(error?.message || 'Failed to submit request for remote verification.')
    } finally {
      setIsSavingItem(false)
    }
  }

  const handleRejectChangeRequest = async (req) => {
    if (!isAdminOrSuperadmin || !req?.id) return
    setIsVerifyingAction(true)
    try {
      const verifyRequest = httpsCallable(functions, 'verifyInventoryChangeRequest')
      await verifyRequest({
        requestId: req.id,
        decision: 'reject',
        verificationNote: 'Rejected by admin',
        verificationMethod: 'admin-review',
      })
      success(`Rejected ${req.requestType} request for "${req.currentName}".`)
    } catch (error) {
      console.error('Error rejecting verification request:', error)
      toastError(error?.message || 'Unable to reject request.')
    } finally {
      setIsVerifyingAction(false)
    }
  }

  const handleUpdateItem = async (verificationMeta = null) => {
    if (!editingItem) return

    setIsSavingItem(true)
    try {
      const itemDocRef = doc(db, 'inventory', editingItem.id)
      let imageUrl = editingItem.imageUrl
      const galleryUrls = [...(editingItem.gallery || [])]

      // Upload new main image if provided
      if (editImageFile) {
        const storageRef = ref(storage, `inventory/${Date.now()}-${editImageFile.name}`)
        const uploadSnapshot = await uploadBytes(storageRef, editImageFile)
        imageUrl = await getDownloadURL(uploadSnapshot.ref)
      }

      // Upload new gallery images
      for (let i = 0; i < editGalleryFiles.length; i++) {
        if (editGalleryFiles[i]) {
          const storageRef = ref(storage, `inventory/gallery/${Date.now()}-${Math.random()}-${editGalleryFiles[i].name}`)
          const uploadSnapshot = await uploadBytes(storageRef, editGalleryFiles[i])
          const galleryUrl = await getDownloadURL(uploadSnapshot.ref)
          galleryUrls[i] = galleryUrl
        }
      }

      const colorVariants = editFormData.colorVariants !== undefined ? editFormData.colorVariants : (editingItem.colorVariants ?? [])
      const editTotalStock = Array.isArray(colorVariants) && colorVariants.length > 0
        ? colorVariants.reduce((sum, v) => sum + (v.stock || 0), 0)
        : Number(editFormData.stock ?? editingItem.stock ?? 0)

      const resolvedName = String(editFormData.name ?? editingItem.name ?? '').trim()
      const updateData = {
        name: resolvedName,
        model: editFormData.model ?? editingItem.model,
        modelId: editFormData.modelId ?? editingItem.modelId,
        variant: editFormData.variant ?? editingItem.variant ?? '',
        variantId: editFormData.variantId ?? editingItem.variantId ?? '',
        stock: editTotalStock,
        status: getInventoryStatus({ stock: editTotalStock }),
        price: Number(editFormData.price ?? editingItem.price ?? 0),
        colorVariants: colorVariants,
        specs: editFormData.specs ?? editingItem.specs ?? [],
        equipment: editFormData.equipment ?? editingItem.equipment ?? [],
        description: editFormData.description ?? editingItem.description ?? '',
        imageUrl,
        gallery: galleryUrls.filter(Boolean),
        updatedAt: serverTimestamp(),
      }

      if (verificationMeta?.verifiedBy) {
        updateData.lastVerifiedBy = verificationMeta.verifiedBy
        updateData.lastVerifiedAt = serverTimestamp()
      }

      await updateDoc(itemDocRef, updateData)

      await logSystemAuditEvent({
        module: 'Inventory',
        action: verificationMeta?.wasRenamed ? 'PRODUCT_RENAMED' : 'PRODUCT_UPDATED',
        summary: verificationMeta?.wasRenamed
          ? `Verified and renamed product "${verificationMeta.previousName}" to "${resolvedName}"`
          : `Updated product "${resolvedName}"`,
        targetType: 'inventory',
        targetId: editingItem.id,
        targetName: resolvedName,
        previousData: {
          name: editingItem.name,
          price: editingItem.price ?? 0,
          model: editingItem.model ?? '',
        },
        newData: {
          name: resolvedName,
          price: updateData.price,
          model: updateData.model ?? '',
        },
        currentUser,
        accessRole: currentAccessRole,
        verifiedBy: verificationMeta?.verifiedBy || null,
        metadata: verificationMeta?.verificationNote ? { verificationNote: verificationMeta.verificationNote } : null,
      })

      setFormMessage({ type: 'success', text: 'Item updated successfully.' })
      success('Item updated successfully')
      setIsEditModalOpen(false)
      setEditFormData({})
      setEditingItem(null)
      setEditImageFile(null)
      setEditImagePreview('')
      setEditGalleryFiles([])
      setEditGalleryPreviews([])
      setEditSelectedModel(null)
      setEditSelectedVariant(null)
      setEditSelectedColorForVariant(null)
      setEditColorVariantStock('')
      handleCollectionUpdate()
    } catch (error) {
      console.error('Error updating item:', error)
      setFormMessage({ type: 'error', text: `Failed to update item. ${error.message}` })
      toastError(`Failed to update item. ${error.message}`)
    } finally {
      setIsSavingItem(false)
    }
  }

  return (
    <section className={`inventory-control-shell space-y-6 ${!isDarkMode ? 'light-mode' : ''}`}>
      <div className="inventory-control-header flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="inventory-control-title font-['Epilogue'] text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
            Inventory <span>Control</span>
          </h2>
          <p className="mt-2 text-sm text-white/45">Manage fleet stock and precision parts.</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => setIsUpdateStocksModalOpen(true)}
            disabled={!canEditOperations}
            className="inventory-add-button inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-black text-white disabled:opacity-60"
          >
            <RefreshRoundedIcon sx={{ fontSize: 18 }} />
            Update Stocks
          </button>

          <button
            type="button"
            onClick={handleOpenAddUnitModal}
            disabled={!canEditOperations}
            className="inventory-add-button inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-black text-white disabled:opacity-60"
          >
            <AddRoundedIcon sx={{ fontSize: 18 }} />
            Add Unit
          </button>

          <button
            type="button"
            onClick={handleOpenAddSparepartsModal}
            disabled={!canEditOperations}
            className="inventory-add-button inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-black text-white disabled:opacity-60"
          >
            <AddRoundedIcon sx={{ fontSize: 18 }} />
            Add Spare Parts
          </button>

          <button
            type="button"
            onClick={() => setIsReturnDamagedModalOpen(true)}
            disabled={!canEditOperations}
            className="inventory-add-button inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-black text-white disabled:opacity-60"
          >
            <ReportProblemRoundedIcon sx={{ fontSize: 18 }} />
            Return / Damaged
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <article
            key={card.label}
            className={`inventory-summary-card rounded-2xl p-4 ${card.isCritical ? 'cursor-pointer hover:border-red-600/50 transition-all' : ''}`}
            onClick={card.onClick}
          >
            <p className="text-[10px] font-black uppercase tracking-[0.24em] text-white/40">{card.label}</p>
            <h3 className="mt-3 font-['Epilogue'] text-3xl font-black text-white">{card.value}</h3>
            <p className="mt-2 text-xs text-white/45">{card.detail}</p>
          </article>
        ))}
      </div>

      <div className="inventory-board rounded-[28px] p-4 sm:p-5">
        <div className="mb-5 flex flex-col gap-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="inventory-tab-row flex flex-wrap gap-2">
              {inventoryTabs.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inventory-tab inline-flex items-center gap-2 ${activeTab === tab.id ? 'is-active' : ''}`}
                >
                  <span>{tab.label}</span>
                  {tab.id === 'returned-damaged' && damagedReturns.length > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500/30 border border-red-500/40 px-1.5 text-[10px] font-black text-red-200">
                      {damagedReturns.length}
                    </span>
                  )}
                  {tab.id === 'verifications' && pendingVerificationRequests.length > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500 px-1.5 text-[10px] font-black text-black">
                      {pendingVerificationRequests.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {activeTab !== 'verifications' && activeTab !== 'returned-damaged' && (
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="inventory-filter-button inline-flex items-center rounded-full px-4 py-2 text-xs font-black uppercase tracking-[0.18em] h-10 border border-white/10 bg-white/4"
              >
                <option value="all">All Status</option>
                {inventoryStatusOptions.map((status) => (
                  <option key={status} value={status}>{status}</option>
                ))}
              </select>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportInventoryExcel}
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-3.5 py-2 text-xs font-bold text-emerald-300 transition-colors"
                  title="Export Inventory Asset Valuation to Excel (.xlsx)"
                >
                  <FileDownloadRoundedIcon sx={{ fontSize: 16 }} />
                  Export Valuation (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={handleExportInventoryPdf}
                  className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 px-3.5 py-2 text-xs font-bold text-red-300 transition-colors"
                  title="Download Inventory Valuation PDF"
                >
                  <PictureAsPdfRoundedIcon sx={{ fontSize: 16 }} />
                  Download PDF
                </button>
              </div>
            </div>
          )}
        </div>

        {activeTab === 'returned-damaged' ? (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-1">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white/75 flex items-center gap-2">
                  <ReportProblemRoundedIcon sx={{ fontSize: 18 }} className="text-amber-400" />
                  Returned & Damaged Products Log
                </h3>
                <p className="text-xs text-white/45 mt-1">
                  Track customer returns, supplier warranties, transit damage, and manage inventory dispositions.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportDamagedExcel}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-2 text-xs font-bold text-emerald-300 transition-colors"
                  title="Export to Excel Spreadsheet (.xlsx)"
                >
                  <FileDownloadRoundedIcon sx={{ fontSize: 16 }} />
                  Export Excel (.xlsx)
                </button>
                <button
                  type="button"
                  onClick={handleExportDamagedPdf}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 px-3 py-2 text-xs font-bold text-red-300 transition-colors"
                  title="Download PDF Report"
                >
                  <PictureAsPdfRoundedIcon sx={{ fontSize: 16 }} />
                  Download PDF
                </button>
                <button
                  type="button"
                  onClick={() => setIsReturnDamagedModalOpen(true)}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#C51D34] hover:bg-[#A01728] px-4 py-2 text-xs font-black text-white transition-all shadow-md"
                >
                  <ReportProblemRoundedIcon sx={{ fontSize: 16 }} />
                  Record Return / Defect
                </button>
              </div>
            </div>

            {/* Filter and stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">Total Incidents</span>
                <p className="text-xl font-black text-white mt-1">{damagedReturns.length}</p>
              </div>
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400/80">Pending Inspection</span>
                <p className="text-xl font-black text-amber-300 mt-1">
                  {damagedReturns.filter((r) => r.dispositionStatus === 'pending_inspection').length}
                </p>
              </div>
              <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400/80">Returned to Supplier</span>
                <p className="text-xl font-black text-blue-300 mt-1">
                  {damagedReturns.filter((r) => r.dispositionStatus === 'returned_to_supplier').length}
                </p>
              </div>
              <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-400/80">Written Off / Disposed</span>
                <p className="text-xl font-black text-red-300 mt-1">
                  {damagedReturns.filter((r) => ['written_off', 'disposed'].includes(r.dispositionStatus)).length}
                </p>
              </div>
            </div>

            {/* Search and disposition filter */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <SearchRoundedIcon sx={{ fontSize: 18 }} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  type="search"
                  value={damagedSearchTerm}
                  onChange={(e) => setDamagedSearchTerm(e.target.value)}
                  placeholder="Search item, code, customer, reason..."
                  className="w-full rounded-xl border border-white/10 bg-white/5 pl-9 pr-3 py-2 text-xs text-white placeholder-white/40 focus:border-red-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={damagedFilterStatus}
                  onChange={(e) => setDamagedFilterStatus(e.target.value)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white focus:outline-none"
                >
                  <option value="all">All Dispositions</option>
                  <option value="pending_inspection">Pending Inspection</option>
                  <option value="returned_to_supplier">Returned to Supplier</option>
                  <option value="written_off">Written Off</option>
                  <option value="repaired_restocked">Repaired & Restocked</option>
                  <option value="disposed">Scrapped / Disposed</option>
                </select>
              </div>
            </div>

            {/* Damaged returns table */}
            {filteredDamagedReturns.length > 0 ? (
              <div className="overflow-x-auto rounded-2xl border border-white/10">
                <table className="w-full text-left text-xs text-white">
                  <thead className="bg-white/5 text-[10px] font-black uppercase tracking-wider text-white/60">
                    <tr>
                      <th className="p-3">Date</th>
                      <th className="p-3">Product / SKU</th>
                      <th className="p-3">Qty</th>
                      <th className="p-3">Condition</th>
                      <th className="p-3">Customer / Source</th>
                      <th className="p-3">Stock Action</th>
                      <th className="p-3">Disposition Status</th>
                      <th className="p-3">Reason / Notes</th>
                      <th className="p-3">Logged By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredDamagedReturns.map((record) => {
                      const dateDisplay = record.createdAt?.toDate
                        ? record.createdAt.toDate().toLocaleDateString()
                        : (record.createdAt?.seconds ? new Date(record.createdAt.seconds * 1000).toLocaleDateString() : 'N/A')
                      return (
                        <tr key={record.id} className="hover:bg-white/[0.02] transition-colors">
                          <td className="p-3 whitespace-nowrap opacity-75">{dateDisplay}</td>
                          <td className="p-3">
                            <strong className="block text-white font-semibold">{record.itemName}</strong>
                            <span className="text-[11px] font-mono opacity-60">{record.itemSku || record.itemId}</span>
                          </td>
                          <td className="p-3 font-bold text-red-400">{record.quantity}</td>
                          <td className="p-3">
                            <span className="inline-flex rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold">
                              {(record.condition || 'defective').replace(/_/g, ' ')}
                            </span>
                          </td>
                          <td className="p-3 opacity-80">{record.customerSource || 'N/A'}</td>
                          <td className="p-3">
                            {record.deductedFromStock ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/20 text-red-300 px-2 py-0.5 text-[10px] font-bold">
                                Deducted
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 text-white/60 px-2 py-0.5 text-[10px]">
                                Not Deducted
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            <select
                              value={record.dispositionStatus || 'pending_inspection'}
                              onChange={(e) => handleUpdateDisposition(record.id, e.target.value)}
                              className="rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-[11px] font-bold text-white focus:outline-none"
                            >
                              <option value="pending_inspection">Pending Inspection</option>
                              <option value="returned_to_supplier">Returned to Supplier</option>
                              <option value="written_off">Written Off</option>
                              <option value="repaired_restocked">Repaired & Restocked</option>
                              <option value="disposed">Scrapped / Disposed</option>
                            </select>
                          </td>
                          <td className="p-3 max-w-[200px] truncate opacity-75" title={record.reasonNotes}>
                            {record.reasonNotes || '—'}
                          </td>
                          <td className="p-3 whitespace-nowrap opacity-65">
                            {record.loggedBy?.name || record.loggedBy?.email || 'Staff'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-10 text-center">
                <ReportProblemRoundedIcon sx={{ fontSize: 32 }} className="text-white/30 mb-2" />
                <p className="text-sm font-bold text-white/60">No returned or damaged product records found.</p>
                <p className="text-xs text-white/40 mt-1">Click &ldquo;Record Return / Defect&rdquo; to log a damaged product or customer return.</p>
              </div>
            )}
          </div>
        ) : activeTab === 'verifications' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 px-1">
              <div>
                <h3 className="text-sm font-black uppercase tracking-[0.18em] text-white/75">
                  Admin Verification Queue
                </h3>
                <p className="text-xs text-white/45 mt-1">
                  Product name edits, detail updates, and deletion requests require admin verification before taking effect.
                </p>
              </div>
              <span className="text-xs font-bold text-white/50">
                {inventoryChangeRequests.length} total request(s)
              </span>
            </div>

            {inventoryChangeRequests.length > 0 ? (
              <div className="space-y-2.5">
                {inventoryChangeRequests.map((req) => {
                  const isPending = req.status === 'pending'
                  const isRename = req.requestType === 'rename'
                  const isUpdate = req.requestType === 'update'
                  return (
                    <div
                      key={req.id}
                      className={`flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${isPending
                        ? 'border-amber-500/30 bg-amber-500/5'
                        : 'border-white/10 bg-white/3 opacity-75'
                        }`}
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${isRename
                              ? 'bg-amber-500/20 text-amber-300'
                              : isUpdate
                                ? 'bg-blue-500/20 text-blue-300'
                                : 'bg-red-500/20 text-red-300'
                              }`}
                          >
                            {isRename ? 'Product Name Edit' : isUpdate ? 'Product Update' : 'Product Deletion'}
                          </span>
                          <span
                            className={`inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${req.status === 'approved'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : req.status === 'rejected'
                                ? 'bg-red-500/20 text-red-300'
                                : 'bg-white/10 text-white/75'
                              }`}
                          >
                            {req.status || 'pending'}
                          </span>
                        </div>

                        <p className="text-sm font-bold text-white">
                          {isRename ? (
                            <>
                              <span className="line-through text-red-400">{req.currentName}</span>
                              <span className="mx-2 text-white/40">→</span>
                              <span className="text-emerald-400">{req.proposedName}</span>
                            </>
                          ) : isUpdate ? (
                            <>
                              <span>Update details for &ldquo;{req.currentName}&rdquo;</span>
                              {req.pendingUpdates?.price !== undefined && (
                                <span className="ml-2 text-xs text-emerald-400">
                                  ₱{Number(req.pendingUpdates.price).toLocaleString()}
                                </span>
                              )}
                              {req.pendingUpdates?.stock !== undefined && (
                                <span className="ml-2 text-xs text-amber-400">
                                  Stock: {req.pendingUpdates.stock}
                                </span>
                              )}
                            </>
                          ) : (
                            <span>Delete &ldquo;{req.currentName}&rdquo;</span>
                          )}
                        </p>

                        <p className="text-xs text-white/55">
                          Requested by {req.requestedBy?.name || req.requestedBy?.email || 'Staff'} ({req.requestedBy?.role || 'staff'})
                          {req.reason ? ` • ${req.reason}` : ''}
                        </p>

                        {req.verifiedBy?.email && (
                          <p className="text-xs text-emerald-400 font-semibold">
                            Verified by {req.verifiedBy.email}
                            {req.verificationNote ? ` • Note: ${req.verificationNote}` : ''}
                          </p>
                        )}
                      </div>

                      {isPending && isAdminOrSuperadmin && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={isVerifyingAction}
                            onClick={() =>
                              setAdminVerifyModal({
                                open: true,
                                mode: isRename ? 'approve-rename' : isUpdate ? 'approve-update' : 'approve-delete',
                                itemId: req.itemId,
                                item: req.itemSnapshot || null,
                                itemName: req.currentName || '',
                                proposedName: req.proposedName || '',
                                pendingUpdates: req.pendingUpdates || null,
                                requestId: req.id,
                                requestedBy: req.requestedBy || null,
                                reason: req.reason || '',
                              })
                            }
                            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3.5 py-2 text-xs font-black text-white transition-colors disabled:opacity-50"
                          >
                            <VerifiedUserRoundedIcon sx={{ fontSize: 15 }} />
                            Verify & Confirm
                          </button>
                          <button
                            type="button"
                            disabled={isVerifyingAction}
                            onClick={() => handleRejectChangeRequest(req)}
                            className="inline-flex items-center gap-1 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 px-3 py-2 text-xs font-bold text-red-300 transition-colors disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="inventory-empty rounded-2xl px-4 py-10 text-center text-white/50">
                No product name edit, update, or deletion verification requests yet.
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="hidden grid-cols-[0.8fr_0.8fr_1fr_2fr_1.1fr_1.1fr_1fr_0.8fr] gap-3 border-b border-white/5 px-3 py-3 md:grid">
              <span className="inventory-header-badge">Image</span>
              <span className="inventory-header-badge">Code</span>
              <span className="inventory-header-badge">Category</span>
              <span className="inventory-header-badge">Name / Model</span>
              <span className="inventory-header-badge">Stock Level</span>
              <span className="inventory-header-badge">Status</span>
              <span className="inventory-header-badge">Price</span>
              <span className="inventory-header-badge text-right">Actions</span>
            </div>

            <div className="divide-y divide-white/5">
              {paginatedItems.map((item, index) => {
                const stockValue = Number(item.stock ?? 0)
                const maxStock = Math.max(...items.map((item) => Number(item.stock ?? 0)), 100)
                const stockPercentage = (stockValue / maxStock) * 100
                const itemStatus = getInventoryStatus(item)
                const isCritical = isCriticalStock(stockValue)
                const stockWidth = Math.max(8, Math.min(100, stockPercentage))
                const itemCode = String(item.sku || item.id || `ITM-${index + 1}`).slice(0, 8).toUpperCase()
                const pendingRequest = pendingRequestByItemId.get(item.id)

                return (
                  <div key={item.id} className={`grid gap-3 px-3 py-4 md:grid-cols-[0.8fr_0.8fr_1fr_2fr_1.1fr_1.1fr_1fr_0.8fr] md:items-center relative ${isCritical ? 'bg-red-950/20 border-l-4 border-red-600' : ''
                    }`}>
                    {stockValue === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded pointer-events-none">
                        <span className="text-lg font-black text-white uppercase tracking-widest">Out of Stock</span>
                      </div>
                    )}

                    <div className="h-20 w-20 rounded-lg overflow-hidden bg-white/5 flex items-center justify-center shrink-0">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="text-white/30 text-xs text-center px-1 font-bold">No Image</div>
                      )}
                    </div>

                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/45">{itemCode}</p>
                    </div>

                    <div>
                      <span className="inventory-category-pill inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-white/75">
                        {item.category || 'General'}
                      </span>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold text-white">{item.name || 'Inventory Item'}</p>
                        {pendingRequest && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-300">
                            Pending Verification ({pendingRequest.requestType})
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">{item.model || item.description || 'Precision stock'}</p>
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between text-xs text-white/65">
                        <span>{stockValue} units</span>
                      </div>
                      <div className="inventory-stock-bar h-1.5 overflow-hidden rounded-full">
                        <div className={`inventory-stock-fill h-full rounded-full ${stockValue === 0 ? 'bg-[#ff3b30]' : stockValue < maxStock * 0.2 ? 'bg-[#ff9500]' : 'bg-linear-to-r from-emerald-500 to-emerald-400'
                          }`} style={{ width: `${stockWidth}%` }} />
                      </div>
                    </div>

                    <div>
                      <span className={`text-xs font-bold ${itemStatus === 'Out of Stock' ? 'text-[#ff3b30]' : itemStatus === 'Low Stock' ? 'text-[#ff9500]' : 'text-emerald-400'}`}>
                        {itemStatus}
                      </span>
                    </div>

                    <div>
                      <p className="text-sm font-bold text-white">{formatCurrency(item.price ?? 0)}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingItem(item)
                          setEditFormData({})
                          setEditImageFile(null)
                          setEditImagePreview('')
                          setEditGalleryFiles([])
                          setEditGalleryPreviews([])
                          setEditSelectedColorForVariant(null)
                          setEditColorVariantStock('')
                          const modelItem = models.find(m => m.id === item.modelId)
                          const variantItem = variants.find(v => v.id === item.variantId)
                          setEditSelectedModel(modelItem || null)
                          setEditSelectedVariant(variantItem || null)
                          setConfirmModal({ open: true, action: 'edit-confirm', itemId: item.id, itemName: item.name, item })
                        }}
                        className="inventory-action-button inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
                        title={`Edit ${item.name || item.id}`}
                        aria-label={`Edit ${item.name || item.id}`}
                      >
                        <EditRoundedIcon sx={{ fontSize: 16 }} />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!isAdminOrSuperadmin) {
                            setConfirmModal({ open: true, action: 'request-delete', itemId: item.id, itemName: item.name, item })
                          } else {
                            setAdminVerifyModal({
                              open: true,
                              mode: 'delete',
                              itemId: item.id,
                              item,
                              itemName: item.name || '',
                              proposedName: '',
                              requestId: null,
                              requestedBy: null,
                              reason: '',
                            })
                          }
                        }}
                        className="inventory-action-button inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-red-950/30 text-red-400 hover:text-red-300 transition-colors"
                        title={isAdminOrSuperadmin ? `Verify & Delete ${item.name || item.id}` : `Request Admin Verification to Delete ${item.name || item.id}`}
                        aria-label={`Delete ${item.name || item.id}`}
                      >
                        <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
                      </button>
                    </div>
                  </div>
                )
              })}

              {!filteredItems.length && (
                <div className="inventory-empty rounded-2xl px-4 py-10 text-center text-white/50">
                  No inventory items match this view yet.
                </div>
              )}
            </div>

            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between text-[11px] text-white/40">
              <span>Showing {startIndex + 1}-{Math.min(endIndex, filteredItems.length)} of {filteredItems.length} results</span>

              {totalPages > 1 && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="inventory-pagination-button disabled:opacity-50"
                  >
                    ‹ Prev
                  </button>

                  <div className="flex gap-1">
                    {Array.from({ length: totalPages }).map((_, i) => {
                      const pageNum = i + 1
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`inventory-pagination-page ${currentPage === pageNum ? 'is-active' : ''}`}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                  </div>

                  <button
                    onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="inventory-pagination-button disabled:opacity-50"
                  >
                    Next ›
                  </button>
                </div>
              )}

              <span>Synced live from `inventory`</span>
            </div>
          </>
        )}
      </div>

      {isAddUnitModalOpen && (
        <div className="inventory-modal-overlay">
          <button type="button" className="inventory-modal-backdrop" onClick={handleCloseAddUnitModal} aria-label="Close add unit modal" />

          <div className={`inventory-modal-panel scrollable-modal-panel ${!isDarkMode ? 'light-mode' : ''}`}>
            <div className="inventory-modal-header">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="inventory-modal-kicker">Live Inventory Entry</p>
                  <h3 className="inventory-modal-title">Add Unit</h3>
                  <p className={`inventory-modal-copy ${!isDarkMode ? 'light-mode-text' : ''}`}>Create a new motorcycle unit, upload an image, and publish it to the showroom in one step.</p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseAddUnitModal}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 transition-colors shrink-0 ml-3"
                >
                  <CloseRoundedIcon sx={{ fontSize: 18 }} />
                </button>
              </div>
            </div>

            <form onSubmit={handleCreateUnit} className="inventory-modal-form">
              <div className="inventory-modal-grid">
                <label className="inventory-field">
                  <span>Unit Name</span>
                  <input type="text" name="name" value={itemForm.name} onChange={(e) => handleFormChange(e, 'unit')} placeholder="Yamaha NMAX" />
                </label>

                <label className="inventory-field">
                  <span>Category</span>
                  <select
                    value={selectedCategory?.id || ''}
                    onChange={(e) => {
                      const category = categories.find(c => c.id === e.target.value)
                      setSelectedCategory(category || null)
                      setSelectedModel(null) // Reset model when category changes
                    }}
                    className="dropdown-select"
                  >
                    <option value="">Select Category...</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </label>

                <label className="inventory-field">
                  <span>Model</span>
                  <div className="inventory-custom-select">
                    <button
                      type="button"
                      className={`inventory-custom-select-trigger ${!selectedCategory ? 'is-disabled' : ''}`}
                      onClick={() => selectedCategory && setIsModelDropdownOpen((open) => !open)}
                      disabled={!selectedCategory}
                    >
                      {selectedModel ? selectedModel.name : (selectedCategory ? 'Select Model...' : 'Select Category First...')}
                    </button>

                    {isModelDropdownOpen && selectedCategory && (
                      <div className="inventory-custom-select-menu">
                        {(models.filter((model) => model.categoryId === selectedCategory.id) || []).length > 0 ? (
                          models
                            .filter((model) => model.categoryId === selectedCategory.id)
                            .map((model) => (
                              <button
                                key={model.id}
                                type="button"
                                className={`inventory-custom-select-option ${selectedModel?.id === model.id ? 'is-selected' : ''}`}
                                onClick={() => {
                                  setSelectedModel(model)
                                  setIsModelDropdownOpen(false)
                                }}
                              >
                                {model.name}
                              </button>
                            ))
                        ) : (
                          <div className="inventory-custom-select-empty">No models available</div>
                        )}
                      </div>
                    )}
                  </div>
                </label>

                <label className="inventory-field">
                  <span>Variant (Optional)</span>
                  <div className="inventory-custom-select">
                    <button
                      type="button"
                      className="inventory-custom-select-trigger"
                      onClick={() => setIsVariantDropdownOpen((open) => !open)}
                    >
                      {selectedVariant ? selectedVariant.name : 'Select Variant...'}
                    </button>

                    {isVariantDropdownOpen && (
                      <div className="inventory-custom-select-menu">
                        {variants.length > 0 ? (
                          variants.map((variant) => (
                            <button
                              key={variant.id}
                              type="button"
                              className={`inventory-custom-select-option ${selectedVariant?.id === variant.id ? 'is-selected' : ''}`}
                              onClick={() => {
                                setSelectedVariant(variant)
                                setIsVariantDropdownOpen(false)
                              }}
                            >
                              {variant.name}
                            </button>
                          ))
                        ) : (
                          <div className="inventory-custom-select-empty">No variants available</div>
                        )}
                      </div>
                    )}
                  </div>
                </label>

                <label className="inventory-field">
                  <span>Status</span>
                  <select name="status" value={itemForm.status} onChange={(e) => handleFormChange(e, 'unit')} className="dropdown-select">
                    {inventoryStatusOptions.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>

                <label className="inventory-field">
                  <span>Stock</span>
                  <input
                    type="number"
                    name="stock"
                    min="0"
                    value={Array.isArray(itemForm.colorVariants) && itemForm.colorVariants.length > 0
                      ? itemForm.colorVariants.reduce((sum, v) => sum + (v.stock || 0), 0)
                      : itemForm.stock
                    }
                    onChange={(e) => {
                      if (!itemForm.colorVariants || itemForm.colorVariants.length === 0) {
                        handleFormChange(e, 'unit')
                      }
                    }}
                    placeholder="10"
                    disabled={Array.isArray(itemForm.colorVariants) && itemForm.colorVariants.length > 0}
                    className={Array.isArray(itemForm.colorVariants) && itemForm.colorVariants.length > 0 ? 'opacity-60 cursor-not-allowed' : ''}
                  />
                </label>

                <label className="inventory-field">
                  <span>Price</span>
                  <input
                    type="number"
                    name="price"
                    value={itemForm.price}
                    onChange={(e) => {
                      const val = e.target.value === '' ? '' : Math.max(0, Number(e.target.value))
                      handleFormChange({ target: { name: 'price', type: 'text', value: String(val) } }, 'unit')
                    }}
                    placeholder="145000"
                  />
                </label>

                <label className="inventory-field">
                  <span>Color Variants with Stock</span>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/62 mb-3">Select Color</p>
                      <div className="grid grid-cols-4 gap-2">
                        {COLOR_PALETTE.map((color) => {
                          const isSelected = selectedColorForVariant?.name === color.name
                          return (
                            <button
                              key={color.name}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setSelectedColorForVariant(color)
                              }}
                              className={`h-12 rounded-lg border-2 transition-all ${color.swatch} ${isSelected ? 'border-[#2563eb] ring-2 ring-[#2563eb]/20' : 'border-neutral-600 hover:border-neutral-500'
                                }`}
                              title={color.name}
                              aria-label={color.name}
                            />
                          )
                        })}
                      </div>
                    </div>

                    {selectedColorForVariant && (
                      <div className="flex gap-2 items-end">
                        <label className="inventory-field flex-1">
                          <span>Stock for {selectedColorForVariant.name}</span>
                          <div className="flex gap-2">
                            <input
                              type="number"
                              value={colorVariantStock}
                              onChange={(e) => setColorVariantStock(e.target.value)}
                              placeholder="Enter stock quantity"
                              min="0"
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault()
                                if (colorVariantStock && parseInt(colorVariantStock) > 0) {
                                  setItemForm((current) => {
                                    const variantExists = current.colorVariants?.some(v => v.color.name === selectedColorForVariant.name)
                                    if (variantExists) {
                                      return {
                                        ...current,
                                        colorVariants: current.colorVariants.map(v =>
                                          v.color.name === selectedColorForVariant.name
                                            ? { ...v, stock: parseInt(colorVariantStock) }
                                            : v
                                        )
                                      }
                                    }
                                    return {
                                      ...current,
                                      colorVariants: [...(current.colorVariants || []), { color: selectedColorForVariant, stock: parseInt(colorVariantStock) }]
                                    }
                                  })
                                  setColorVariantStock('')
                                  setSelectedColorForVariant(null)
                                }
                              }}
                              className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                            >
                              Add
                            </button>
                          </div>
                        </label>
                      </div>
                    )}

                    {Array.isArray(itemForm.colorVariants) && itemForm.colorVariants.length > 0 && (
                      <div className="bg-neutral-900/30 rounded-lg p-3 space-y-2">
                        <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/62">Added Colors</p>
                        {itemForm.colorVariants.map((variant, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-neutral-800 p-2 rounded">
                            <div className="flex items-center gap-2">
                              <div className={`w-6 h-6 rounded-full border ${variant.color.swatch}`} />
                              <span className="text-sm font-medium">{variant.color.name}</span>
                              <span className="text-sm text-white/60">Stock: {variant.stock}</span>
                            </div>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault()
                                setItemForm((current) => ({
                                  ...current,
                                  colorVariants: current.colorVariants.filter((_, i) => i !== idx)
                                }))
                              }}
                              className="text-red-500 hover:text-red-400 text-sm font-bold"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </label>

                {/* Technical Specifications - Vertical Section */}
                <div className="w-full mb-6">
                  <label className="inventory-field mb-2 block">
                    <span className="font-bold uppercase tracking-widest text-xs mb-1">Technical Specifications</span>
                    <button
                      type="button"
                      className="inventory-add-btn mb-2"
                      onClick={() => {
                        console.log('Add Specification clicked');
                        setSpecCategory('ENGINE');
                        setSpecFields([{ label: '', value: '' }]);
                        setIsSpecModalOpen(true);
                        setTimeout(() => {
                          console.log('isSpecModalOpen:', true);
                        }, 100);
                      }}
                    >
                      + Add Specification
                    </button>
                  </label>
                  {/* Technical Specification Modal */}
                  {isSpecModalOpen && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={e => e.stopPropagation()}>
                      <div className="bg-neutral-900 rounded-lg p-6 w-full max-w-md shadow-lg" onClick={e => e.stopPropagation()}>
                        <h2 className="text-lg font-bold mb-4">Add Technical Specification</h2>
                        <label className="block mb-4">
                          <span className="block text-xs font-bold mb-1">Category</span>
                          <select
                            className="w-full p-2 rounded bg-neutral-800 border border-neutral-700 text-white focus:ring-2 focus:ring-red-600 focus:border-red-600 appearance-none"
                            style={{ colorScheme: 'dark', color: '#fff', backgroundColor: '#232323', borderColor: '#444' }}
                            value={specCategory}
                            onChange={e => setSpecCategory(e.target.value)}
                          >

                            <option value="ENGINE">ENGINE</option>
                            <option value="FRAMEWORK">FRAMEWORK</option>
                            <option value="ELECTRICAL">ELECTRICAL</option>
                            <option value="DIMENSION">DIMENSION</option>
                            <option value="OTHERS">OTHERS</option>
                          </select>
                        </label>
                        <div className="mb-4">
                          <span className="block text-xs font-bold mb-2">Fields</span>
                          {specFields.map((field, idx) => (
                            <div key={idx} className="flex gap-2 mb-2">
                              <input
                                type="text"
                                placeholder="Label (e.g. Displacement)"
                                value={field.label}
                                onChange={e => {
                                  const val = e.target.value;
                                  setSpecFields(fields => fields.map((f, i) => i === idx ? { ...f, label: val } : f));
                                }}
                                className="flex-1 px-2 py-1 rounded bg-neutral-800 border border-neutral-700"
                              />
                              <input
                                type="text"
                                placeholder="Value (e.g. 155cc)"
                                value={field.value}
                                onChange={e => {
                                  const val = e.target.value;
                                  setSpecFields(fields => fields.map((f, i) => i === idx ? { ...f, value: val } : f));
                                }}
                                className="flex-1 px-2 py-1 rounded bg-neutral-800 border border-neutral-700"
                              />
                              <button
                                type="button"
                                className="text-red-500 font-bold"
                                onClick={() => setSpecFields(fields => fields.filter((_, i) => i !== idx))}
                              >Remove</button>
                            </div>
                          ))}
                          <button
                            type="button"
                            className="inventory-add-btn mt-2"
                            onClick={() => setSpecFields(fields => [...fields, { label: '', value: '' }])}
                          >+ Add Text Field</button>
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                          <button
                            type="button"
                            className="inventory-cancel-button"
                            onClick={() => setIsSpecModalOpen(false)}
                          >Cancel</button>
                          <button
                            type="button"
                            className="inventory-submit-button"
                            onClick={() => {
                              setItemForm(prev => ({
                                ...prev,
                                specs: [
                                  ...(prev.specs || []),
                                  ...specFields.filter(f => f.label && f.value).map(f => ({
                                    category: specCategory,
                                    label: f.label,
                                    value: f.value
                                  }))
                                ]
                              }));
                              setIsSpecModalOpen(false);
                            }}
                          >Save</button>
                        </div>
                      </div>
                    </div>
                  )}
                  {/* Group and display Technical Specifications by category */}
                  <div className="space-y-4">
                    {Object.entries(
                      (itemForm.specs || []).reduce((acc, spec) => {
                        if (!spec.category) return acc;
                        if (!acc[spec.category]) acc[spec.category] = [];
                        acc[spec.category].push(spec);
                        return acc;
                      }, {})
                    ).map(([category, specs]) => (
                      <div key={category}>
                        <div className="font-bold text-xs uppercase tracking-widest mb-1">{category}</div>
                        <ul className="ml-2 space-y-1">
                          {specs.map((spec, idx) => (
                            <li key={idx} className="flex items-center gap-2">
                              <span className="font-semibold">{spec.label}</span>
                              <span className="text-white/70">{spec.value}</span>
                              <button
                                type="button"
                                className="text-red-500 font-bold ml-2 text-xs"
                                onClick={() => setItemForm(prev => ({
                                  ...prev,
                                  specs: prev.specs.filter((s, i) => !(s.category === category && s.label === spec.label && s.value === spec.value && i === prev.specs.findIndex(ss => ss === spec)))
                                }))}
                              >Remove</button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Standard Equipment - Vertical Section */}
                <div className="w-full mb-6">
                  <label className="inventory-field mb-2 block">
                    <span className="font-bold uppercase tracking-widest text-xs mb-1">Standard Equipment</span>
                    <button
                      type="button"
                      className="inventory-add-btn mb-2"
                      onClick={() => setItemForm((prev) => ({
                        ...prev,
                        equipment: [...(prev.equipment || []), ''],
                      }))}
                    >
                      + Add Equipment
                    </button>
                    <div className="space-y-2">
                      {(itemForm.equipment || []).map((eq, idx) => (
                        <div key={idx} className="flex gap-2 items-end">
                          <input
                            type="text"
                            placeholder="Equipment (e.g. ABS Brakes)"
                            value={eq}
                            onChange={e => {
                              const val = e.target.value
                              setItemForm(prev => {
                                const equipment = [...prev.equipment]
                                equipment[idx] = val
                                return { ...prev, equipment }
                              })
                            }}
                            className="flex-1 px-2 py-1 rounded bg-neutral-800 border border-neutral-700"
                          />
                          <button
                            type="button"
                            className="text-red-500 font-bold ml-2"
                            onClick={() => setItemForm(prev => ({
                              ...prev,
                              equipment: prev.equipment.filter((_, i) => i !== idx),
                            }))}
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </label>
                </div>

                {/* Description - Vertical Section */}
                <div className="w-full mb-6">
                  <label className="inventory-field block">
                    <span className="font-bold uppercase tracking-widest text-xs mb-1">Description</span>
                    <textarea name="description" value={itemForm.description} onChange={(e) => handleFormChange(e, 'unit')} rows="3" placeholder="Add a short description for the showroom and inventory listing." className="w-full px-2 py-1 rounded bg-neutral-800 border border-neutral-700" />
                  </label>
                </div>

                {/* CLOSE main inventory-modal-grid */}
              </div>

              <div className="inventory-modal-grid inventory-modal-grid--secondary">
                <label className="inventory-field">
                  <span>Badge</span>
                  <input type="text" name="badge" value={itemForm.badge} onChange={(e) => handleFormChange(e, 'unit')} placeholder="New Arrival" />
                </label>

                <label className="inventory-field inventory-checkbox-field">
                  <span>Showroom Visibility</span>
                  <label className="inventory-checkbox-row">
                    <input type="checkbox" name="showInShowroom" checked={itemForm.showInShowroom} onChange={(e) => handleFormChange(e, 'unit')} />
                    <span>Display this unit in the public showroom</span>
                  </label>
                </label>
              </div>

              <label className="inventory-upload-box">
                <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                <span className="inventory-upload-icon"><CloudUploadRoundedIcon sx={{ fontSize: 20 }} /></span>
                <span className="inventory-upload-title">Upload Unit Image</span>
                <span className="inventory-upload-copy">PNG, JPG, or WEBP — used in the showroom and inventory listing.</span>
              </label>

              {imagePreview && (
                <div className="inventory-image-preview max-w-full">
                  <img src={imagePreview} alt="Unit preview" className="max-h-48 w-auto rounded-2xl object-contain mx-auto" />
                </div>
              )}

              <div className="inventory-gallery-upload-section">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/62 mb-3">Sub Images (Gallery) - Up to 3 images</p>
                <div className="grid grid-cols-3 gap-3">
                  {[0, 1, 2].map((index) => (
                    <label key={index} className="inventory-gallery-upload-box">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleGalleryImageChange(e, index)}
                        className="hidden"
                      />
                      {galleryPreviews[index] ? (
                        <div className="relative group h-full">
                          <img
                            src={galleryPreviews[index]}
                            alt={`Gallery ${index + 1}`}
                            className="w-full h-full rounded-lg object-cover"
                          />
                          <div className="absolute inset-0 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault()
                                handleRemoveGalleryImageAtIndex(index)
                              }}
                              className="bg-red-600 text-white rounded-full p-2 hover:bg-red-700 transition-colors"
                              aria-label="Remove image"
                            >
                              <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
                            </button>
                            <span className="text-white text-xs font-bold">Replace</span>
                          </div>
                        </div>
                      ) : (
                        <div className="inventory-gallery-upload-placeholder">
                          <CloudUploadRoundedIcon sx={{ fontSize: 24 }} className="text-white/40" />
                          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40 text-center">Image {index + 1}</span>
                        </div>
                      )}
                    </label>
                  ))}
                </div>
              </div>

              {formMessage && (
                <div className={`inventory-form-message ${formMessage.type === 'error' ? 'is-error' : 'is-success'}`}>
                  {formMessage.text}
                </div>
              )}

              <div className="inventory-modal-actions">
                <button type="submit" disabled={isSavingItem} className="inventory-submit-button inline-flex items-center justify-center gap-2">
                  <SaveRoundedIcon sx={{ fontSize: 18 }} />
                  {isSavingItem ? 'Saving Unit...' : 'Save Unit'}
                </button>
                <button type="button" onClick={handleCloseAddUnitModal} className="inventory-cancel-button">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isAddSparepartsModalOpen && (
        <div className="inventory-modal-overlay spareparts-modal-overlay">
          <button type="button" className="inventory-modal-backdrop" onClick={handleCloseAddSparepartsModal} aria-label="Close add spare parts modal" />

          <div className={`inventory-modal-panel scrollable-modal-panel ${!isDarkMode ? 'light-mode' : ''}`}>
            <div className="inventory-modal-header sticky top-0 bg-inherit z-10 pb-3 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="inventory-modal-kicker">Live Inventory Entry</p>
                  <h3 className="inventory-modal-title">Add Spare Parts</h3>
                  <p className={`inventory-modal-copy ${!isDarkMode ? 'light-mode-text' : ''}`}>Create a new spare part record, upload an image, and publish it to the showroom in one step.</p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseAddSparepartsModal}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 transition-colors shrink-0 ml-3"
                >
                  <CloseRoundedIcon sx={{ fontSize: 18 }} />
                </button>
              </div>
            </div>

            <form onSubmit={handleCreateSpareParts} className="inventory-modal-form">
              <div className="inventory-modal-grid">
                <label className="inventory-field">
                  <span>Spare Part Name</span>
                  <input type="text" name="name" value={sparePartsForm.name} onChange={(e) => handleFormChange(e, 'spareparts')} placeholder="Engine Filter" />
                </label>

                <label className="inventory-field">
                  <span>Category</span>
                  <select
                    value={selectedSparepartsCategory?.id || ''}
                    onChange={(e) => {
                      const category = categories.find(c => c.id === e.target.value)
                      setSelectedSparepartsCategory(category || null)
                      setSelectedSparepartsModel(null) // Reset model when category changes
                    }}
                    className="dropdown-select"
                  >
                    <option value="">Select Category...</option>
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>{category.name}</option>
                    ))}
                  </select>
                </label>

                <label className="inventory-field">
                  <span>Unit/Model</span>
                  <select
                    value={selectedSparepartsModel?.id || ''}
                    onChange={(e) => {
                      const model = models.find(m => m.id === e.target.value)
                      setSelectedSparepartsModel(model || null)
                    }}
                    className="dropdown-select"
                    disabled={!selectedSparepartsCategory}
                  >
                    <option value="">
                      {selectedSparepartsCategory ? 'Select Unit/Model...' : 'Select Category First...'}
                    </option>
                    {selectedSparepartsCategory
                      ? models
                        .filter(m => m.categoryId === selectedSparepartsCategory.id)
                        .map((model) => (
                          <option key={model.id} value={model.id}>{model.name}</option>
                        ))
                      : models.map((model) => (
                        <option key={model.id} value={model.id}>{model.name}</option>
                      ))
                    }
                  </select>
                </label>

                <label className="inventory-field">
                  <span>Status</span>
                  <select name="status" value={sparePartsForm.status} onChange={(e) => handleFormChange(e, 'spareparts')} className="dropdown-select">
                    {inventoryStatusOptions.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </label>

                <label className="inventory-field">
                  <span>Stock</span>
                  <input type="number" name="stock" min="0" value={sparePartsForm.stock} onChange={(e) => handleFormChange(e, 'spareparts')} placeholder="10" />
                </label>

                <label className="inventory-field">
                  <span>Price</span>
                  <input
                    type="number"
                    name="price"
                    value={sparePartsForm.price}
                    onChange={(e) => {
                      const val = e.target.value === '' ? '' : Math.max(0, Number(e.target.value))
                      handleFormChange({ target: { name: 'price', type: 'text', value: String(val) } }, 'spareparts')
                    }}
                    placeholder="25000"
                  />
                </label>
              </div>

              <label className="inventory-field">
                <span>Description</span>
                <textarea name="description" value={sparePartsForm.description} onChange={(e) => handleFormChange(e, 'spareparts')} rows="3" placeholder="Add a short description for the showroom and inventory listing." />
              </label>

              <div className="inventory-modal-grid inventory-modal-grid--secondary">
                <label className="inventory-field">
                  <span>Badge</span>
                  <input type="text" name="badge" value={sparePartsForm.badge} onChange={(e) => handleFormChange(e, 'spareparts')} placeholder="New Stock" />
                </label>

                <label className="inventory-field inventory-checkbox-field">
                  <span>Showroom Visibility</span>
                  <label className="inventory-checkbox-row">
                    <input type="checkbox" name="showInShowroom" checked={sparePartsForm.showInShowroom} onChange={(e) => handleFormChange(e, 'spareparts')} />
                    <span>Display this spare part in the public showroom</span>
                  </label>
                </label>
              </div>

              <label className="inventory-upload-box">
                <input type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
                <span className="inventory-upload-icon"><CloudUploadRoundedIcon sx={{ fontSize: 20 }} /></span>
                <span className="inventory-upload-title">Upload Spare Part Image</span>
                <span className="inventory-upload-copy">PNG, JPG, or WEBP — used in the showroom and inventory listing.</span>
              </label>

              {imagePreview && (
                <div className="inventory-image-preview max-w-full">
                  <img src={imagePreview} alt="Spare part preview" className="max-h-48 w-auto rounded-2xl object-contain mx-auto" />
                </div>
              )}

              {formMessage && (
                <div className={`inventory-form-message ${formMessage.type === 'error' ? 'is-error' : 'is-success'}`}>
                  {formMessage.text}
                </div>
              )}

              <div className="inventory-modal-actions">
                <button type="submit" disabled={isSavingItem} className="inventory-submit-button inline-flex items-center justify-center gap-2">
                  <SaveRoundedIcon sx={{ fontSize: 18 }} />
                  {isSavingItem ? 'Saving Spare Part...' : 'Save Spare Part'}
                </button>
                <button type="button" onClick={handleCloseAddSparepartsModal} className="inventory-cancel-button">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {isCriticalStockModalOpen && (
        <div className="inventory-modal-overlay">
          <button type="button" className="inventory-modal-backdrop" onClick={() => setIsCriticalStockModalOpen(false)} />
          <div className={`inventory-modal-panel ${!isDarkMode ? 'light-mode' : ''}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="inventory-modal-title">Critical Stock Items</h3>
              <button
                type="button"
                onClick={() => setIsCriticalStockModalOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 transition-colors"
              >
                <CloseRoundedIcon sx={{ fontSize: 18 }} />
              </button>
            </div>
            <p className={`inventory-modal-copy ${!isDarkMode ? 'light-mode-text' : ''}`}>Items with stock below 20% threshold or out of stock.</p>
            <div className="mt-5 space-y-3 max-h-96 overflow-y-auto">
              {items.filter((item) => isCriticalStock(Number(item.stock ?? 0))).map((item) => (
                <div key={item.id} className={`flex items-center gap-3 p-3 rounded-lg border ${!isDarkMode ? 'bg-gray-50 border-gray-200' : 'bg-white/4 border-white/10'}`}>
                  <div className={`h-16 w-16 rounded-lg overflow-hidden flex items-center justify-center shrink-0 ${!isDarkMode ? 'bg-gray-200' : 'bg-white/5'}`}>
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className={`h-full w-full flex items-center justify-center text-xs font-bold ${!isDarkMode ? 'bg-gray-300 text-gray-600' : 'text-white/30'}`}>No Image</div>
                    )}
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-bold ${!isDarkMode ? 'text-gray-900' : 'text-white'}`}>{item.name}</p>
                    <p className={`text-xs ${!isDarkMode ? 'text-gray-500' : 'text-white/50'}`}>{Number(item.stock ?? 0)} units • {getAutoStatus(Number(item.stock ?? 0))}</p>
                  </div>
                  <span className={`text-xs font-black ${Number(item.stock ?? 0) === 0 ? 'text-[#ff3b30]' : 'text-[#ff9500]'
                    }`}>
                    {getAutoStatus(Number(item.stock ?? 0))}
                  </span>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setIsCriticalStockModalOpen(false)}
              className={`inventory-cancel-button mt-5 w-full border rounded-full px-4 py-2 text-xs font-bold transition-colors ${!isDarkMode ? 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50' : 'border-white/10 text-white hover:bg-white/5'}`}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {isUpdateStocksModalOpen && (
        <div className="inventory-modal-overlay">
          <button type="button" className="inventory-modal-backdrop" onClick={() => {
            const hasChanges = Object.values(stockUpdates).some(val => val)
            if (hasChanges) {
              setConfirmModal({ open: true, action: 'update-stocks-cancel', itemId: 'stocks' })
            } else {
              setIsUpdateStocksModalOpen(false)
            }
          }} />
          <div className={`inventory-modal-panel update-stocks-modal ${!isDarkMode ? 'light-mode' : ''}`}>
            <div className="flex items-center justify-between mb-4 sticky top-0 z-10 bg-inherit pb-3 border-b border-white/5">
              <h3 className="inventory-modal-title">Update Stock Levels</h3>
              <button
                type="button"
                onClick={() => {
                  const hasChanges = Object.values(stockUpdates).some(val => val)
                  if (hasChanges) {
                    setConfirmModal({ open: true, action: 'update-stocks-cancel', itemId: 'stocks' })
                  } else {
                    setIsUpdateStocksModalOpen(false)
                  }
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 transition-colors"
              >
                <CloseRoundedIcon sx={{ fontSize: 18 }} />
              </button>
            </div>

            <div className="update-stocks-container">
              {/* Left Panel - Items */}
              <div className="update-stocks-left flex flex-col">
                <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${!isDarkMode ? 'text-gray-600' : 'text-white/60'}`}>Adjust individual item quantities (increase only)</p>

                <div className={`update-stocks-search mb-3 flex items-center gap-2 rounded-lg border px-3 py-2 ${!isDarkMode ? 'border-gray-300 bg-gray-50' : 'border-white/10 bg-white/4'}`}>
                  <SearchRoundedIcon sx={{ fontSize: 16 }} style={{ color: !isDarkMode ? '#666' : 'rgba(255,255,255,0.5)' }} />
                  <input
                    type="text"
                    placeholder="Search items..."
                    value={stockSearchTerm}
                    onChange={(e) => setStockSearchTerm(e.target.value)}
                    className={`flex-1 border-0 bg-transparent text-sm outline-none ${!isDarkMode ? 'text-gray-900 placeholder-gray-400' : 'text-white placeholder-white/40'}`}
                  />
                </div>

                <div className="update-stocks-items space-y-2 max-h-64 overflow-y-auto">
                  {items.filter((item) => {
                    const searchNormalized = stockSearchTerm.toLowerCase().trim()
                    if (!searchNormalized) return true
                    const itemText = `${item.name} ${item.model} ${item.category}`.toLowerCase()
                    return itemText.includes(searchNormalized)
                  }).map((item) => (
                    <div key={item.id} className={`flex items-center gap-3 p-3 rounded-lg border ${!isDarkMode ? 'bg-gray-50 border-gray-200' : 'bg-white/4 border-white/10'}`}>
                      <div className={`h-14 w-14 rounded-lg overflow-hidden shrink-0 ${!isDarkMode ? 'bg-gray-200' : 'bg-white/5'}`}>
                        {item.imageUrl ? (
                          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                        ) : (
                          <div className={`h-full w-full flex items-center justify-center text-xs font-bold ${!isDarkMode ? 'bg-gray-300 text-gray-600' : 'text-white/30'}`}>No Image</div>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`text-sm font-bold ${!isDarkMode ? 'text-gray-900' : 'text-white'}`}>{item.name}</p>
                        <p className={`text-xs ${!isDarkMode ? 'text-gray-500' : 'text-white/50'}`}>{Number(item.stock ?? 0)} units</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setStockNumberPadItemId(item.id)
                            setStockNumberPadValue('')
                            setStockNumberPadOpen(true)
                          }}
                          className={`w-16 px-2 py-1 text-sm rounded border text-center font-bold cursor-pointer transition-colors ${!isDarkMode ? 'border-gray-300 bg-white text-gray-900 hover:bg-gray-100' : 'border-white/10 bg-white/4 text-white hover:bg-white/8'}`}
                        >
                          {stockUpdates[item.id] ?? item.stock ?? 0}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Panel - Modified Summary */}
              <div className="update-stocks-right flex flex-col">
                <div className={`rounded-lg border p-4 flex-1 flex flex-col ${!isDarkMode ? 'bg-gray-50 border-gray-200' : 'bg-white/4 border-white/10'}`}>
                  <p className={`text-xs font-bold uppercase tracking-widest mb-4 ${!isDarkMode ? 'text-gray-600' : 'text-white/60'}`}>Changes Summary</p>

                  <div className="space-y-3 max-h-48 overflow-y-auto">
                    {items.map((item) => {
                      const newStock = stockUpdates[item.id] ?? item.stock ?? 0
                      const oldStock = item.stock ?? 0
                      const diff = Number(newStock) - Number(oldStock)
                      if (diff === 0) return null
                      return (
                        <div key={item.id} className={`flex items-center justify-between p-3 rounded-lg border ${!isDarkMode ? 'bg-white border-gray-200' : 'bg-white/4 border-white/10'}`}>
                          <div className="flex-1">
                            <p className={`text-xs font-bold uppercase ${!isDarkMode ? 'text-gray-600' : 'text-white/50'}`}>{item.name}</p>
                            <p className={`text-sm font-bold ${!isDarkMode ? 'text-gray-900' : 'text-white'}`}>{oldStock} → {newStock} units</p>
                          </div>
                          <span className={`text-sm font-black ml-2 ${diff > 0 ? 'text-emerald-500' : diff < 0 ? 'text-[#ff3b30]' : ''}`}>
                            {diff > 0 ? '+' : ''}{diff}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  <div className={`mt-auto pt-3 border-t ${!isDarkMode ? 'border-gray-300' : 'border-white/10'}`}>
                    <p className={`text-xs font-bold uppercase ${!isDarkMode ? 'text-gray-600' : 'text-white/60'} mb-2`}>Ready to update</p>
                    <p className={`text-lg font-black ${!isDarkMode ? 'text-gray-900' : 'text-white'}`}>
                      {Object.values(stockUpdates).filter((val) => val).length} change(s)
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 mt-4">
                  <button
                    type="button"
                    className="inventory-submit-button flex-1 inline-flex items-center justify-center gap-2 py-2"
                    onClick={() => {
                      const hasChanges = Object.values(stockUpdates).some(val => val)
                      if (hasChanges) {
                        setConfirmModal({ open: true, action: 'update-stocks', itemId: 'stocks' })
                      }
                    }}
                  >
                    <SaveRoundedIcon sx={{ fontSize: 16 }} />
                    Confirm Update
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const hasChanges = Object.values(stockUpdates).some(val => val)
                      if (hasChanges) {
                        setConfirmModal({ open: true, action: 'update-stocks-cancel', itemId: 'stocks' })
                      } else {
                        setIsUpdateStocksModalOpen(false)
                      }
                    }}
                    className={`flex-1 border rounded-full px-4 py-2 text-xs font-bold transition-colors ${!isDarkMode ? 'border-gray-300 bg-white text-gray-900 hover:bg-gray-50' : 'border-white/10 text-white hover:bg-white/5'}`}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isEditModalOpen && editingItem && (
        <div className="inventory-modal-overlay edit-modal-overlay">
          <button type="button" className="inventory-modal-backdrop" onClick={() => {
            const hasChanges = JSON.stringify(editFormData) !== '{}'
            if (hasChanges) {
              setConfirmModal({ open: true, action: 'edit-cancel', itemId: editingItem.id })
            } else {
              setIsEditModalOpen(false)
              setEditFormData({})
            }
          }} aria-label="Close edit modal" />

          <div className={`inventory-modal-panel scrollable-modal-panel ${!isDarkMode ? 'light-mode' : ''}`}>
            <div className="inventory-modal-header sticky top-0 bg-inherit z-10 pb-3 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <p className="inventory-modal-kicker">Live Inventory Update</p>
                  <h3 className="inventory-modal-title">
                    Edit {editingItem?.category === 'Spare Parts' ? 'Spare Part' : editingItem?.itemType === 'Spare Parts' ? 'Spare Part' : editingItem?.category === 'Motorcycle Units' ? 'Motorcycle' : 'Item'}
                  </h3>
                  <p className={`inventory-modal-copy ${!isDarkMode ? 'light-mode-text' : ''}`}>Editing: <strong>{editingItem?.name || 'Unknown'}</strong> • Update item details. Stock and Status are locked and cannot be changed in edit mode.</p>
                  {!isAdminOrSuperadmin && (
                    <div className="mt-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-200 flex items-center gap-2">
                      <span className="text-base">🛡️</span>
                      <span>
                        <strong>Staff Mode:</strong> Products cannot be updated directly. Submitting will send an approval request to the Super Admin for verification.
                      </span>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const hasChanges = JSON.stringify(editFormData) !== '{}'
                    if (hasChanges) {
                      setConfirmModal({ open: true, action: 'edit-cancel', itemId: editingItem.id })
                    } else {
                      setIsEditModalOpen(false)
                      setEditFormData({})
                    }
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 transition-colors shrink-0 ml-3"
                >
                  <CloseRoundedIcon sx={{ fontSize: 18 }} />
                </button>
              </div>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); setConfirmModal({ open: true, action: 'edit-update', itemId: editingItem.id }) }} className="inventory-modal-form">

              {editingItem?.category === 'Spare Parts' || editingItem?.itemType === 'Spare Parts' ? (
                // SPARE PARTS FORM
                <>
                  <div className="inventory-modal-grid">
                    <label className="inventory-field">
                      <span>Spare Part Name</span>
                      <input
                        type="text"
                        value={editFormData.name ?? editingItem?.name ?? ''}
                        onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                        placeholder="Spare part name"
                      />
                    </label>

                    <label className="inventory-field">
                      <span>Category</span>
                      <select
                        value={editSelectedCategory?.id || editingItem?.categoryId || ''}
                        onChange={(e) => {
                          const cat = categories.find(c => c.id === e.target.value)
                          setEditSelectedCategory(cat || null)
                          setEditFormData({ ...editFormData, categoryId: e.target.value })
                        }}
                        className="dropdown-select"
                      >
                        <option value="">Select Category...</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </label>

                    <label className="inventory-field">
                      <span>Unit/Model (Optional)</span>
                      <select
                        value={editSelectedModel?.id || editingItem?.modelId || ''}
                        onChange={(e) => {
                          const model = models.find(m => m.id === e.target.value)
                          setEditSelectedModel(model || null)
                          setEditFormData({ ...editFormData, modelId: e.target.value })
                        }}
                        className="dropdown-select"
                      >
                        <option value="">Select Unit/Model...</option>
                        {models.map((model) => (
                          <option key={model.id} value={model.id}>{model.name}</option>
                        ))}
                      </select>
                    </label>

                    <label className="inventory-field">
                      <span>Status</span>
                      <input
                        type="text"
                        value={editingItem?.status ?? ''}
                        disabled
                        className="dropdown-select opacity-60 cursor-not-allowed"
                      />
                    </label>

                    <label className="inventory-field">
                      <span>Stock</span>
                      <input
                        type="number"
                        value={editingItem?.stock ?? 0}
                        disabled
                        className="opacity-60 cursor-not-allowed"
                      />
                    </label>

                    <label className="inventory-field">
                      <span>Price</span>
                      <input
                        type="number"
                        value={editFormData.price !== undefined ? editFormData.price : (editingItem?.price ?? '')}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Math.max(0, Number(e.target.value))
                          setEditFormData({ ...editFormData, price: val })
                        }}
                        placeholder="0"
                      />
                    </label>
                  </div>

                  <label className="inventory-field">
                    <span>Description</span>
                    <textarea
                      value={editFormData.description ?? editingItem?.description ?? ''}
                      onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                      rows="3"
                      placeholder="Add a short description for the spare part."
                    />
                  </label>

                  <div className="inventory-modal-grid inventory-modal-grid--secondary">
                    <label className="inventory-field">
                      <span>Badge</span>
                      <input
                        type="text"
                        value={editFormData.badge ?? editingItem?.badge ?? ''}
                        onChange={(e) => setEditFormData({ ...editFormData, badge: e.target.value })}
                        placeholder="New Stock"
                      />
                    </label>

                    <label className="inventory-field inventory-checkbox-field">
                      <span>Showroom Visibility</span>
                      <label className="inventory-checkbox-row">
                        <input
                          type="checkbox"
                          checked={editFormData.showInShowroom !== undefined ? editFormData.showInShowroom : (editingItem?.showInShowroom ?? true)}
                          onChange={(e) => setEditFormData({ ...editFormData, showInShowroom: e.target.checked })}
                        />
                        <span>Display this spare part in the public showroom</span>
                      </label>
                    </label>
                  </div>

                  {editingItem.imageUrl || editImagePreview ? (
                    <div className="inventory-image-preview max-w-full">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/62 mb-3">Main Image</p>
                      <div className="relative group inline-block">
                        <img src={editImagePreview || editingItem.imageUrl} alt={editingItem.name} className="max-h-48 w-auto rounded-2xl object-contain mx-auto" />
                        <label className="absolute inset-0 bg-black/50 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                              const file = e.target.files?.[0]
                              if (file) {
                                setEditImageFile(file)
                                setEditImagePreview(URL.createObjectURL(file))
                                setEditFormData({ ...editFormData, imageFile: file })
                              }
                            }}
                            className="hidden"
                          />
                          <span className="text-white text-sm font-bold">Replace Image</span>
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label className="inventory-upload-box">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file) {
                            setEditImageFile(file)
                            setEditImagePreview(URL.createObjectURL(file))
                            setEditFormData({ ...editFormData, imageFile: file })
                          }
                        }}
                        className="hidden"
                      />
                      <span className="inventory-upload-icon"><CloudUploadRoundedIcon sx={{ fontSize: 20 }} /></span>
                      <span className="inventory-upload-title">Upload Spare Part Image</span>
                      <span className="inventory-upload-copy">PNG, JPG, or WEBP</span>
                    </label>
                  )}
                </>
              ) : (
                // MOTORCYCLE FORM
                <>
                  <div className="inventory-modal-grid">
                    <label className="inventory-field">
                      <span>Item Name</span>
                      <input
                        type="text"
                        value={editFormData.name ?? editingItem?.name ?? ''}
                        onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
                        placeholder="Item name"
                      />
                    </label>

                    <label className="inventory-field">
                      <span>Category</span>
                      <select
                        value={editSelectedCategory?.id || editingItem?.categoryId || ''}
                        onChange={(e) => {
                          const cat = categories.find(c => c.id === e.target.value)
                          setEditSelectedCategory(cat || null)
                          setEditFormData({ ...editFormData, categoryId: e.target.value })
                        }}
                        className="dropdown-select"
                      >
                        <option value="">Select Category...</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </label>

                    <label className="inventory-field">
                      <span>Model</span>
                      <select
                        value={editSelectedModel?.id || editingItem?.modelId || ''}
                        onChange={(e) => {
                          const model = models.find(m => m.id === e.target.value)
                          setEditSelectedModel(model || null)
                          setEditFormData({ ...editFormData, model: model?.name || '', modelId: e.target.value })
                        }}
                        className="dropdown-select"
                      >
                        <option value="">Select Model...</option>
                        {models.map((model) => (
                          <option key={model.id} value={model.id}>{model.name}</option>
                        ))}
                      </select>
                    </label>

                    <label className="inventory-field">
                      <span>Variant (Optional)</span>
                      <select
                        value={editSelectedVariant?.id || editingItem?.variantId || ''}
                        onChange={(e) => {
                          const variant = variants.find(v => v.id === e.target.value)
                          setEditSelectedVariant(variant || null)
                          setEditFormData({ ...editFormData, variant: variant?.name || '', variantId: e.target.value })
                        }}
                        className="dropdown-select"
                      >
                        <option value="">Select Variant...</option>
                        {variants.map((variant) => (
                          <option key={variant.id} value={variant.id}>{variant.name}</option>
                        ))}
                      </select>
                    </label>

                    <label className="inventory-field">
                      <span>Status</span>
                      <input
                        type="text"
                        value={editingItem?.status ?? ''}
                        disabled
                        className="dropdown-select opacity-60 cursor-not-allowed"
                      />
                    </label>

                    <label className="inventory-field">
                      <span>Stock</span>
                      <input
                        type="number"
                        value={(() => {
                          const colorVariants = editFormData.colorVariants ?? editingItem?.colorVariants
                          if (Array.isArray(colorVariants) && colorVariants.length > 0) {
                            return colorVariants.reduce((sum, v) => sum + (v.stock || 0), 0)
                          }
                          return editingItem?.stock ?? 0
                        })()}
                        disabled
                        className="opacity-60 cursor-not-allowed"
                      />
                    </label>

                    <label className="inventory-field">
                      <span>Price</span>
                      <input
                        type="number"
                        value={editFormData.price !== undefined ? editFormData.price : (editingItem?.price ?? '')}
                        onChange={(e) => {
                          const val = e.target.value === '' ? '' : Math.max(0, Number(e.target.value))
                          setEditFormData({ ...editFormData, price: val })
                        }}
                        placeholder="0"
                      />
                    </label>

                    <label className="inventory-field">
                      <span>Color Variants with Stock</span>
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/62 mb-3">Select Color</p>
                          <div className="grid grid-cols-4 gap-2">
                            {COLOR_PALETTE.map((color) => {
                              const isSelected = editSelectedColorForVariant?.name === color.name
                              return (
                                <button
                                  key={color.name}
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    setEditSelectedColorForVariant(color)
                                  }}
                                  className={`h-12 rounded-lg border-2 transition-all ${color.swatch} ${isSelected ? 'border-red-600 ring-2 ring-red-600/20' : 'border-neutral-600 hover:border-neutral-500'
                                    }`}
                                  title={color.name}
                                  aria-label={color.name}
                                />
                              )
                            })}
                          </div>
                        </div>

                        {editSelectedColorForVariant && (
                          <div className="flex gap-2 items-end">
                            <label className="inventory-field flex-1">
                              <span>Stock for {editSelectedColorForVariant.name}</span>
                              <div className="flex gap-2">
                                <input
                                  type="number"
                                  value={editColorVariantStock}
                                  onChange={(e) => setEditColorVariantStock(e.target.value)}
                                  placeholder="Enter stock quantity"
                                  min="0"
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault()
                                    if (editColorVariantStock && parseInt(editColorVariantStock) > 0) {
                                      setEditFormData((current) => {
                                        const colorVariants = current.colorVariants ?? (editingItem?.colorVariants || [])
                                        const variantExists = colorVariants.some(v => v.color.name === editSelectedColorForVariant.name)
                                        if (variantExists) {
                                          return {
                                            ...current,
                                            colorVariants: colorVariants.map(v =>
                                              v.color.name === editSelectedColorForVariant.name
                                                ? { ...v, stock: parseInt(editColorVariantStock) }
                                                : v
                                            )
                                          }
                                        }
                                        return {
                                          ...current,
                                          colorVariants: [...(colorVariants || []), { color: editSelectedColorForVariant, stock: parseInt(editColorVariantStock) }]
                                        }
                                      })
                                      setEditColorVariantStock('')
                                      setEditSelectedColorForVariant(null)
                                    }
                                  }}
                                  className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                                >
                                  Add
                                </button>
                              </div>
                            </label>
                          </div>
                        )}

                        {(() => {
                          const currentVariants = editFormData.colorVariants ?? editingItem?.colorVariants ?? []
                          return currentVariants.length > 0 && (
                            <div className="bg-neutral-900/30 rounded-lg p-3 space-y-2">
                              <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/62">Added Colors</p>
                              {currentVariants.map((variant, idx) => (
                                <div key={idx} className="flex items-center justify-between bg-neutral-800 p-2 rounded">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-6 h-6 rounded-full border ${variant.color.swatch}`} />
                                    <span className="text-sm font-medium">{variant.color.name}</span>
                                    <span className="text-sm text-white/60">Stock: {variant.stock}</span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault()
                                      setEditFormData((current) => ({
                                        ...current,
                                        colorVariants: (current.colorVariants ?? editingItem?.colorVariants ?? []).filter((_, i) => i !== idx)
                                      }))
                                    }}
                                    className="text-red-500 hover:text-red-400 text-sm font-bold"
                                  >
                                    Remove
                                  </button>
                                </div>
                              ))}
                            </div>
                          )
                        })()}
                      </div>
                    </label>
                  </div>

                  <label className="inventory-field">
                    <span>Description</span>
                    <textarea
                      value={editFormData.description ?? editingItem?.description ?? ''}
                      onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                      rows="3"
                      placeholder="Add item details."
                    />
                  </label>

                  {editingItem?.category !== 'Spare Parts' && editingItem?.itemType !== 'Spare Parts' && (
                    <>
                      <div className="w-full mb-6">
                        <label className="inventory-field mb-2 block">
                          <span className="font-bold uppercase tracking-widest text-xs mb-1">Technical Specifications</span>
                          <button
                            type="button"
                            className="inventory-add-btn mb-2"
                            onClick={() => {
                              setSpecCategory('ENGINE');
                              setSpecFields([{ label: '', value: '' }]);
                              setIsSpecModalOpen(true);
                            }}
                          >
                            + Add Specification
                          </button>
                        </label>
                        {/* Technical Specification Modal for Edit Item */}
                        {isSpecModalOpen && (
                          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50" onClick={e => e.stopPropagation()}>
                            <div className="bg-neutral-900 rounded-lg p-6 w-full max-w-md shadow-lg" onClick={e => e.stopPropagation()}>
                              <h2 className="text-lg font-bold mb-4">Add Technical Specification</h2>
                              <label className="block mb-4">
                                <span className="block text-xs font-bold mb-1">Category</span>
                                <div style={{ position: 'relative' }}>
                                  <select
                                    className="w-full p-2 rounded bg-neutral-800 border border-neutral-700 text-white focus:ring-2 focus:ring-red-600 focus:border-red-600 appearance-none pr-8 spec-category-dropdown"
                                    style={{ colorScheme: 'dark', color: '#fff', backgroundColor: '#232323', borderColor: '#444' }}
                                    value={specCategory}
                                    onChange={e => setSpecCategory(e.target.value)}
                                    onFocus={e => {
                                      const arrow = e.target.parentNode.querySelector('.dropdown-arrow');
                                      if (arrow) arrow.classList.add('open');
                                    }}
                                    onBlur={e => {
                                      const arrow = e.target.parentNode.querySelector('.dropdown-arrow');
                                      if (arrow) arrow.classList.remove('open');
                                    }}
                                  >
                                    <option value="ENGINE">ENGINE</option>
                                    <option value="FRAMEWORK">FRAMEWORK</option>
                                    <option value="ELECTRICAL">ELECTRICAL</option>
                                    <option value="DIMENSION">DIMENSION</option>
                                    <option value="OTHERS">OTHERS</option>
                                  </select>
                                  <span
                                    className="dropdown-arrow"
                                    style={{
                                      position: 'absolute',
                                      right: '12px',
                                      top: '50%',
                                      transform: 'translateY(-50%)',
                                      pointerEvents: 'none',
                                      color: '#aaa',
                                      fontSize: '18px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
                                    }}
                                  >
                                    ▼
                                  </span>
                                  <style>{`
                              .dropdown-arrow.open {
                                transform: translateY(-50%) rotate(180deg);
                              }
                            `}</style>
                                </div>
                              </label>
                              <div className="mb-4">
                                <span className="block text-xs font-bold mb-2">Fields</span>
                                {specFields.map((field, idx) => (
                                  <div key={idx} className="flex gap-2 mb-2">
                                    <input
                                      type="text"
                                      placeholder="Label (e.g. Displacement)"
                                      value={field.label}
                                      onChange={e => {
                                        const val = e.target.value;
                                        setSpecFields(fields => fields.map((f, i) => i === idx ? { ...f, label: val } : f));
                                      }}
                                      className="flex-1 px-2 py-1 rounded bg-neutral-800 border border-neutral-700"
                                    />
                                    <input
                                      type="text"
                                      placeholder="Value (e.g. 155cc)"
                                      value={field.value}
                                      onChange={e => {
                                        const val = e.target.value;
                                        setSpecFields(fields => fields.map((f, i) => i === idx ? { ...f, value: val } : f));
                                      }}
                                      className="flex-1 px-2 py-1 rounded bg-neutral-800 border border-neutral-700"
                                    />
                                    <button
                                      type="button"
                                      className="text-red-500 font-bold"
                                      onClick={() => setSpecFields(fields => fields.filter((_, i) => i !== idx))}
                                    >Remove</button>
                                  </div>
                                ))}
                                <button
                                  type="button"
                                  className="inventory-add-btn mt-2"
                                  onClick={() => setSpecFields(fields => [...fields, { label: '', value: '' }])}
                                >+ Add Text Field</button>
                              </div>
                              <div className="flex justify-end gap-2 mt-4">
                                <button
                                  type="button"
                                  className="inventory-cancel-button"
                                  onClick={() => setIsSpecModalOpen(false)}
                                >Cancel</button>
                                <button
                                  type="button"
                                  className="inventory-submit-button"
                                  onClick={() => {
                                    setEditFormData(prev => ({
                                      ...prev,
                                      specs: [
                                        ...((prev.specs ?? editingItem.specs) || []),
                                        ...specFields.filter(f => f.label && f.value).map(f => ({
                                          category: specCategory,
                                          label: f.label,
                                          value: f.value
                                        }))
                                      ]
                                    }));
                                    setIsSpecModalOpen(false);
                                  }}
                                >Save</button>
                              </div>
                            </div>
                          </div>
                        )}
                        {/* Group and display Technical Specifications by category */}
                        <div className="space-y-4">
                          {Object.entries(
                            ((editFormData.specs !== undefined ? editFormData.specs : editingItem.specs) || []).reduce((acc, spec) => {
                              if (!spec.category) return acc;
                              if (!acc[spec.category]) acc[spec.category] = [];
                              acc[spec.category].push(spec);
                              return acc;
                            }, {})
                          ).map(([category, specs]) => (
                            <div key={category}>
                              <div className="font-bold text-xs uppercase tracking-widest mb-1">{category}</div>
                              <ul className="ml-2 space-y-1">
                                {specs.map((spec, idx) => (
                                  <li key={idx} className="flex items-center gap-2">
                                    <span className="font-semibold">{spec.label}</span>
                                    <span className="text-white/70">{spec.value}</span>
                                    <button
                                      type="button"
                                      className="text-red-500 font-bold ml-2 text-xs"
                                      onClick={() => setEditFormData(current => ({
                                        ...current,
                                        specs: (current.specs ?? editingItem.specs ?? []).filter((s, i) => !(s.category === category && s.label === spec.label && s.value === spec.value && i === (current.specs ?? editingItem.specs ?? []).findIndex(ss => ss === spec)))
                                      }))}
                                    >Remove</button>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {editingItem?.category !== 'Spare Parts' && editingItem?.itemType !== 'Spare Parts' && (
                    <div className="w-full mb-6">
                      <label className="inventory-field mb-2 block">
                        <span className="font-bold uppercase tracking-widest text-xs mb-1">Standard Equipment</span>
                        <button
                          type="button"
                          className="inventory-add-btn mb-2"
                          onClick={() => setEditFormData(current => ({
                            ...current,
                            equipment: [...(current.equipment ?? editingItem.equipment ?? []), ''],
                          }))}
                        >
                          + Add Equipment
                        </button>
                        <div className="space-y-2">
                          {(editFormData.equipment ?? editingItem.equipment ?? []).map((eq, idx) => (
                            <div key={idx} className="flex gap-2 items-end">
                              <input
                                type="text"
                                placeholder="Equipment (e.g. ABS Brakes)"
                                value={eq}
                                onChange={e => {
                                  const val = e.target.value
                                  setEditFormData(current => {
                                    const equipment = [...(current.equipment ?? editingItem.equipment ?? [])]
                                    equipment[idx] = val
                                    return { ...current, equipment }
                                  })
                                }}
                                className="flex-1 px-2 py-1 rounded bg-neutral-800 border border-neutral-700"
                              />
                              <button
                                type="button"
                                className="text-red-500 font-bold ml-2"
                                onClick={() => setEditFormData(current => ({
                                  ...current,
                                  equipment: (current.equipment ?? editingItem.equipment ?? []).filter((_, i) => i !== idx),
                                }))}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      </label>
                    </div>
                  )}

                  {(editingItem.gallery && editingItem.gallery.length > 0) || editGalleryPreviews.length > 0 ? (
                    <div className="inventory-gallery-section max-w-full">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/62 mb-3">Sub Images (Gallery) - Up to 3 images</p>
                      <div className="grid grid-cols-3 gap-3">
                        {[0, 1, 2].map((index) => {
                          const galleryImage = editGalleryPreviews[index] || editingItem.gallery?.[index]
                          return (
                            <label key={index} className="relative group">
                              {galleryImage ? (
                                <>
                                  <img
                                    src={galleryImage}
                                    alt={`Gallery ${index + 1}`}
                                    className="w-full h-24 rounded-lg object-cover border border-white/10 cursor-pointer"
                                  />
                                  <div className="absolute inset-0 bg-black/50 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <input
                                      type="file"
                                      accept="image/*"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0]
                                        if (file) {
                                          const newFiles = [...editGalleryFiles]
                                          const newPreviews = [...editGalleryPreviews]
                                          newFiles[index] = file
                                          newPreviews[index] = URL.createObjectURL(file)
                                          setEditGalleryFiles(newFiles)
                                          setEditGalleryPreviews(newPreviews)
                                        }
                                      }}
                                      className="hidden"
                                    />
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault()
                                        const newPreviews = [...editGalleryPreviews]
                                        const newFiles = [...editGalleryFiles]
                                        if (newPreviews[index]) {
                                          URL.revokeObjectURL(newPreviews[index])
                                        }
                                        newFiles[index] = undefined
                                        newPreviews[index] = undefined
                                        setEditGalleryFiles(newFiles.filter(Boolean))
                                        setEditGalleryPreviews(newPreviews.filter(Boolean))
                                      }}
                                      className="bg-red-600 text-white rounded-full p-2 hover:bg-red-700 transition-colors"
                                    >
                                      <DeleteOutlineRoundedIcon sx={{ fontSize: 16 }} />
                                    </button>
                                    <span className="text-white text-xs font-bold">Replace</span>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="w-full h-24 rounded-lg border border-dashed border-white/10 flex items-center justify-center bg-white/4 cursor-pointer">
                                    <CloudUploadRoundedIcon sx={{ fontSize: 24 }} className="text-white/40" />
                                  </div>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0]
                                      if (file) {
                                        const newFiles = [...editGalleryFiles]
                                        const newPreviews = [...editGalleryPreviews]
                                        newFiles[index] = file
                                        newPreviews[index] = URL.createObjectURL(file)
                                        setEditGalleryFiles(newFiles)
                                        setEditGalleryPreviews(newPreviews)
                                      }
                                    }}
                                    className="hidden"
                                  />
                                  <span className="absolute inset-0 flex items-center justify-center text-white text-xs font-bold text-center opacity-0 group-hover:opacity-100 transition-opacity">Image {index + 1}</span>
                                </>
                              )}
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className="inventory-gallery-upload-section">
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/62 mb-3">Sub Images (Gallery) - Up to 3 images</p>
                      <div className="grid grid-cols-3 gap-3">
                        {[0, 1, 2].map((index) => (
                          <label key={index} className="inventory-gallery-upload-box cursor-pointer">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) {
                                  const newFiles = [...editGalleryFiles]
                                  const newPreviews = [...editGalleryPreviews]
                                  newFiles[index] = file
                                  newPreviews[index] = URL.createObjectURL(file)
                                  setEditGalleryFiles(newFiles)
                                  setEditGalleryPreviews(newPreviews)
                                }
                              }}
                              className="hidden"
                            />
                            <div className="inventory-gallery-upload-placeholder">
                              <CloudUploadRoundedIcon sx={{ fontSize: 24 }} className="text-white/40" />
                              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/40 text-center">Image {index + 1}</span>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              {formMessage && (
                <div className={`inventory-form-message ${formMessage.type === 'error' ? 'is-error' : 'is-success'}`}>
                  {formMessage.text}
                </div>
              )}

              <div className="inventory-modal-actions">
                <button
                  type="submit"
                  disabled={isSavingItem}
                  className="inventory-submit-button inline-flex items-center justify-center gap-2"
                >
                  <SaveRoundedIcon sx={{ fontSize: 18 }} />
                  {isSavingItem ? 'Submitting...' : isAdminOrSuperadmin ? 'Update Item' : 'Submit for Admin Approval'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const hasChanges = JSON.stringify(editFormData) !== '{}'
                    if (hasChanges) {
                      setConfirmModal({ open: true, action: 'edit-cancel', itemId: editingItem.id })
                    } else {
                      setIsEditModalOpen(false)
                      setEditFormData({})
                    }
                  }}
                  className="inventory-cancel-button"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock Number Pad Modal */}
      {stockNumberPadOpen && (
        <div className="inventory-modal-overlay">
          <button type="button" className="inventory-modal-backdrop" onClick={() => {
            setStockNumberPadOpen(false)
            setStockNumberPadValue('')
            setStockNumberPadItemId(null)
          }} />
          <div className={`inventory-modal-panel ${!isDarkMode ? 'light-mode' : ''}`} style={{ maxWidth: '420px' }}>
            <div className="inventory-modal-header sticky top-0 bg-inherit z-10 pb-3 border-b border-white/5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="inventory-modal-title">Add Stock</h3>
                  <p className={`inventory-modal-copy ${!isDarkMode ? 'light-mode-text' : ''}`}>Enter quantity to add to current stock</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStockNumberPadOpen(false)
                    setStockNumberPadValue('')
                    setStockNumberPadItemId(null)
                  }}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10 transition-colors shrink-0"
                >
                  <CloseRoundedIcon sx={{ fontSize: 18 }} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Display Current and Input */}
              <div className={`rounded-lg border p-4 ${!isDarkMode ? 'bg-gray-50 border-gray-200' : 'bg-white/4 border-white/10'}`}>
                <div className="text-center">
                  <p className={`text-xs font-bold uppercase tracking-widest ${!isDarkMode ? 'text-gray-600' : 'text-white/60'} mb-2`}>Current Stock</p>
                  <p className={`text-2xl font-black ${!isDarkMode ? 'text-gray-900' : 'text-white'}`}>
                    {items.find(i => i.id === stockNumberPadItemId)?.stock ?? 0} units
                  </p>
                </div>
                <div className="my-4 flex items-center justify-center">
                  <div className={`text-center px-6 py-3 rounded-lg border-2 border-dashed ${!isDarkMode ? 'border-green-200 bg-green-50' : 'border-emerald-900/30 bg-emerald-950/20'}`}>
                    <p className={`text-xs font-bold uppercase ${!isDarkMode ? 'text-green-600' : 'text-emerald-400'} mb-1`}>Add</p>
                    <p className={`text-3xl font-black ${!isDarkMode ? 'text-green-900' : 'text-emerald-300'}`}>
                      {stockNumberPadValue || '0'}
                    </p>
                  </div>
                </div>
                <div>
                  <p className={`text-xs font-bold uppercase tracking-widest ${!isDarkMode ? 'text-gray-600' : 'text-white/60'} mb-2 text-center`}>New Total</p>
                  <p className={`text-2xl font-black text-center ${!isDarkMode ? 'text-gray-900' : 'text-white'}`}>
                    {(items.find(i => i.id === stockNumberPadItemId)?.stock ?? 0) + Number(stockNumberPadValue || 0)} units
                  </p>
                </div>
              </div>

              {/* Number Pad */}
              <div className="grid grid-cols-3 gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    onClick={() => handleNumberPadAppend(digit)}
                    className={`py-3 rounded-lg font-bold text-lg transition-colors ${!isDarkMode
                      ? 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                      : 'bg-white/10 text-white hover:bg-white/20'
                      }`}
                  >
                    {digit}
                  </button>
                ))}
              </div>

              {/* Zero and Backspace */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleNumberPadAppend(0)}
                  className={`py-3 rounded-lg font-bold text-lg transition-colors ${!isDarkMode
                    ? 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                    : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                >
                  0
                </button>
                <button
                  type="button"
                  onClick={handleNumberPadBackspace}
                  className={`py-3 rounded-lg font-bold text-lg transition-colors ${!isDarkMode
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : 'bg-red-950/30 text-red-300 hover:bg-red-950/50'
                    }`}
                >
                  ← Back
                </button>
              </div>

              {/* Clear and Confirm */}
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setStockNumberPadValue('')
                  }}
                  className={`py-3 rounded-lg font-bold transition-colors ${!isDarkMode
                    ? 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                    : 'bg-white/10 text-white hover:bg-white/20'
                    }`}
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => handleNumberPadConfirm(stockNumberPadItemId, items.find(i => i.id === stockNumberPadItemId)?.stock ?? 0)}
                  className="inventory-submit-button py-3 rounded-lg font-bold transition-colors"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        open={confirmModal.open}
        title={
          confirmModal.action === 'add-unit-confirm' ? 'Confirm Save Unit' :
            confirmModal.action === 'add-spare-parts-confirm' ? 'Confirm Save Spare Part' :
              confirmModal.action === 'edit-confirm' ? 'Edit Item' :
                confirmModal.action === 'edit-update' ? (isAdminOrSuperadmin ? 'Update Item' : 'Submit for Admin Verification') :
                  confirmModal.action === 'edit-cancel' ? 'Discard Changes' :
                    confirmModal.action === 'update-stocks' ? 'Confirm Stock Update' :
                      confirmModal.action === 'update-stocks-cancel' ? 'Discard Stock Changes' :
                        confirmModal.action === 'add-unit-cancel' ? 'Discard Draft' :
                          confirmModal.action === 'add-spare-parts-cancel' ? 'Discard Draft' :
                            confirmModal.action === 'request-delete' ? 'Request Product Deletion' :
                              'Delete Item'
        }
        message={
          confirmModal.action === 'add-unit-confirm' ? 'Are you sure you want to save this unit? It will be added to the inventory and published to the showroom.' :
            confirmModal.action === 'add-spare-parts-confirm' ? 'Are you sure you want to save this spare part? It will be added to the inventory and published to the showroom.' :
              confirmModal.action === 'edit-confirm' ? 'Edit item details?' :
                confirmModal.action === 'edit-update' ? (!isAdminOrSuperadmin ? 'Submit these product updates for Super Admin verification and approval?' : 'Are you sure you want to update this item? Note: product name changes require admin verification.') :
                  confirmModal.action === 'edit-cancel' ? 'You have unsaved changes. Are you sure you want to discard them?' :
                    confirmModal.action === 'update-stocks' ? 'Are you sure you want to update the stock levels? This will permanently change the inventory counts.' :
                      confirmModal.action === 'update-stocks-cancel' ? 'You have unsaved stock changes. Are you sure you want to discard them?' :
                        confirmModal.action === 'add-unit-cancel' ? 'You have unsaved changes. Are you sure you want to discard the draft?' :
                          confirmModal.action === 'add-spare-parts-cancel' ? 'You have unsaved changes. Are you sure you want to discard the draft?' :
                            confirmModal.action === 'request-delete' ? `Submit a deletion request for "${confirmModal.itemName}"? An admin must verify and confirm before this product is removed.` :
                              `Are you sure you want to delete "${confirmModal.itemName}"? This action cannot be undone.`
        }
        confirmText={
          confirmModal.action === 'add-unit-confirm' ? 'Yes, Save Unit' :
            confirmModal.action === 'add-spare-parts-confirm' ? 'Yes, Save Spare Part' :
              confirmModal.action === 'edit-confirm' ? 'Edit' :
                confirmModal.action === 'edit-update' ? (!isAdminOrSuperadmin ? 'Submit for Verification' : 'Update') :
                  confirmModal.action === 'edit-cancel' ? 'Discard' :
                    confirmModal.action === 'update-stocks' ? 'Update Stocks' :
                      confirmModal.action === 'update-stocks-cancel' ? 'Discard' :
                        confirmModal.action === 'add-unit-cancel' ? 'Discard' :
                          confirmModal.action === 'add-spare-parts-cancel' ? 'Discard' :
                            confirmModal.action === 'request-delete' ? 'Send for Admin Verification' :
                              'Delete'
        }
        cancelText="Cancel"
        isDangerous={['delete', 'request-delete', 'edit-cancel', 'update-stocks-cancel', 'add-unit-cancel', 'add-spare-parts-cancel'].includes(confirmModal.action)}
        isPositive={['add-unit-confirm', 'add-spare-parts-confirm'].includes(confirmModal.action)}
        isDarkMode={isDarkMode}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmModal({ open: false, action: null, itemId: null })}
      />

      <AdminVerificationModal
        open={adminVerifyModal.open}
        mode={adminVerifyModal.mode}
        itemName={adminVerifyModal.itemName}
        proposedName={adminVerifyModal.proposedName}
        requestedBy={adminVerifyModal.requestedBy}
        reason={adminVerifyModal.reason}
        currentUser={currentUser}
        currentUserRole={currentAccessRole}
        isDarkMode={isDarkMode}
        isLoading={isVerifyingAction || isSavingItem}
        onVerify={handleAdminVerificationConfirm}
        onSubmitRemote={handleSubmitRemote}
        onCancel={() =>
          setAdminVerifyModal({
            open: false,
            mode: 'delete',
            itemId: null,
            item: null,
            itemName: '',
            proposedName: '',
            requestId: null,
            requestedBy: null,
            reason: '',
            pendingUpdates: null,
          })
        }
      />

      <ReturnDamagedModal
        open={isReturnDamagedModalOpen}
        onClose={() => setIsReturnDamagedModalOpen(false)}
        inventory={items}
        inventoryItems={items}
        currentUser={currentUser}
        currentAccessRole={currentAccessRole}
        isDarkMode={isDarkMode}
        onSuccess={() => {
          handleCollectionUpdate?.()
          success('Returned/damaged product logged successfully.')
        }}
      />
    </section>
  )
}
