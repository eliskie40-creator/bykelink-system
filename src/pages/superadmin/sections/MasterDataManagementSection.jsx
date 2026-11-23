import { useState, useEffect, useRef } from 'react'
import { addDoc, collection, serverTimestamp, deleteDoc, doc, getDocs } from 'firebase/firestore'
import AddRoundedIcon from '@mui/icons-material/AddRounded'
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded'
import { db } from '../../../firebase'
import { logSystemAuditEvent } from '../../../services/auditLogService'
import ConfirmationModal from '../components/ConfirmationModal'

const collectionMap = {
  'master-categories': { path: 'categories', label: 'Categories', placeholder: 'e.g., Scooter / Automatic' },
  'master-models': { path: 'models', label: 'Models', placeholder: 'e.g., NMAX, Aerox, Mio' },
  'master-variants': { path: 'variants', label: 'Variants', placeholder: 'Enter variant name' },
  'master-series': { path: 'series', label: 'Series', placeholder: 'e.g., Mio Sporty, Mio i 125' },
}

export default function MasterDataManagementSection({
  dataType,
  categories = [],
  models = [],
  canEditOperations,
  currentUser = null,
  currentAccessRole = '',
  isDarkMode = true,
}) {
  const [items, setItems] = useState([])
  const [newItemName, setNewItemName] = useState('')
  const [selectedParentId, setSelectedParentId] = useState(null)
  const [message, setMessage] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [parentData, setParentData] = useState([])
  const [isParentDropdownOpen, setIsParentDropdownOpen] = useState(false)
  const parentDropdownRef = useRef(null)
  const [confirmModal, setConfirmModal] = useState({ open: false, itemId: null, itemName: '' })

  const config = collectionMap[dataType]

  // Load items on mount or when dataType changes
  useEffect(() => {
    if (!config) return

    const loadItems = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'masterData', 'inventory', config.path))
        setItems(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
      } catch (error) {
        console.warn(`Failed to load ${config.path}`, error)
      }
    }
    loadItems()
  }, [config])

  // Load parent data if needed
  useEffect(() => {
    const loadParentData = async () => {
      try {
        if (dataType === 'master-models') {
          // Always reload from firestore instead of relying on prop to ensure live updates
          const snap = await getDocs(collection(db, 'masterData', 'inventory', 'categories'))
          setParentData(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
        } else if (dataType === 'master-series') {
          // Always reload from firestore instead of relying on prop to ensure live updates
          const snap = await getDocs(collection(db, 'masterData', 'inventory', 'models'))
          setParentData(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
        } else {
          setParentData([])
        }
      } catch (error) {
        console.warn(`Failed to load parent data`, error)
        setParentData([])
      }
    }
    loadParentData()
  }, [dataType, categories, models])

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!parentDropdownRef.current?.contains(event.target)) {
        setIsParentDropdownOpen(false)
      }
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setIsParentDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    document.addEventListener('keydown', handleEscape)

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  const handleAddItem = async () => {
    if (!newItemName.trim()) {
      setMessage({ type: 'error', text: 'Please enter a name.' })
      return
    }

    if ((dataType === 'master-models' || dataType === 'master-series') && !selectedParentId) {
      setMessage({ type: 'error', text: `Please select a ${getParentLabel()}.` })
      return
    }

    setIsLoading(true)
    try {
      const dataToAdd = {
        name: newItemName.trim(),
        createdAt: serverTimestamp(),
      }

      if (dataType === 'master-models' && selectedParentId) {
        dataToAdd.categoryId = selectedParentId
      } else if (dataType === 'master-series' && selectedParentId) {
        dataToAdd.modelId = selectedParentId
      }

      const docRef = await addDoc(collection(db, 'masterData', 'inventory', config.path), dataToAdd)

      await logSystemAuditEvent({
        module: 'Master Data',
        action: 'MASTER_DATA_CREATED',
        summary: `Added ${config.label.slice(0, -1)}: "${newItemName.trim()}"`,
        targetType: 'masterData',
        targetId: docRef.id,
        targetName: newItemName.trim(),
        newData: dataToAdd,
        currentUser,
        accessRole: currentAccessRole,
      })

      setMessage({ type: 'success', text: `${config.label.slice(0, -1)} added successfully!` })
      setNewItemName('')
      setSelectedParentId(null)
      setIsParentDropdownOpen(false)

      // Reload items
      const snapshot = await getDocs(collection(db, 'masterData', 'inventory', config.path))
      setItems(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })))

      // Reload parent data for live updates in related sections
      if (dataType === 'master-categories') {
        const catSnap = await getDocs(collection(db, 'masterData', 'inventory', 'categories'))
        setParentData(catSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
      } else if (dataType === 'master-models') {
        const modSnap = await getDocs(collection(db, 'masterData', 'inventory', 'models'))
        setParentData(modSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
      }
    } catch (error) {
      console.error('Error adding item', error)
      setMessage({ type: 'error', text: `Error: ${error.message}` })
    } finally {
      setIsLoading(false)
    }
  }

  const handleDeleteItem = async (itemId, itemName) => {
    setConfirmModal({ open: true, itemId, itemName })
  }

  const handleConfirmDelete = async () => {
    const { itemId, itemName } = confirmModal
    setConfirmModal({ open: false, itemId: null, itemName: '' })

    setIsLoading(true)
    try {
      await deleteDoc(doc(db, 'masterData', 'inventory', config.path, itemId))
      await logSystemAuditEvent({
        module: 'Master Data',
        action: 'MASTER_DATA_DELETED',
        summary: `Deleted ${config.label.slice(0, -1)}: "${itemName || itemId}"`,
        targetType: 'masterData',
        targetId: itemId,
        targetName: itemName || itemId,
        previousData: { name: itemName || '' },
        currentUser,
        accessRole: currentAccessRole,
      })
      setMessage({ type: 'success', text: 'Item deleted successfully!' })

      // Reload items
      const snapshot = await getDocs(collection(db, 'masterData', 'inventory', config.path))
      setItems(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
    } catch (error) {
      console.error('Error deleting item', error)
      setMessage({ type: 'error', text: `Error: ${error.message}` })
    } finally {
      setIsLoading(false)
    }
  }

  const filteredItems = selectedParentId
    ? items.filter((item) => {
        if (dataType === 'master-models') return item.categoryId === selectedParentId
        if (dataType === 'master-series') return item.modelId === selectedParentId
        return true
      })
    : items

  const getParentLabel = () => {
    if (dataType === 'master-models') return 'Category'
    if (dataType === 'master-series') return 'Model'
    return null
  }

  const getParentName = (parentId) => {
    return parentData.find((p) => p.id === parentId)?.name || 'Unknown'
  }

  if (!config) return null

  return (
    <section className={`master-data-section space-y-6 ${!isDarkMode ? 'light-mode' : ''}`}>
      <div className="master-data-header">
        <h2 className="inventory-control-title font-['Epilogue'] text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
          {config.label}
        </h2>
        <p className={`mt-2 text-sm ${!isDarkMode ? 'text-gray-600' : 'text-white/45'}`}>
          {dataType === 'master-categories' && 'Create and organize categories for inventory items (e.g., Scooter / Automatic).'}
          {dataType === 'master-models' && 'Manage motorcycle models and their relationships to categories.'}
          {dataType === 'master-variants' && 'Define variants for different product specifications and features.'}
          {dataType === 'master-series' && 'Create series/sub-variants within models (e.g., Mio Sporty, Mio i 125).'}
        </p>

        {dataType === 'master-models' && (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Total Models', value: String(items.length) },
              { label: 'Active', value: String(Math.max(0, items.length)) },
              { label: 'Ready to Use', value: 'Yes' },
              { label: 'Last Updated', value: 'Today' },
            ].map((stat) => (
              <article
                key={stat.label}
                className={`rounded-2xl border p-5 ${!isDarkMode ? 'border-gray-200 bg-gray-50' : 'border-white/10 bg-white/4'}`}
              >
                <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${!isDarkMode ? 'text-gray-600' : 'text-white/50'}`}>
                  {stat.label}
                </p>
                <p className={`mt-3 font-['Epilogue'] text-3xl font-black ${!isDarkMode ? 'text-gray-900' : 'text-white'}`}>
                  {stat.value}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className={`master-data-panel rounded-[28px] p-6 ${!isDarkMode ? 'bg-gray-50 border border-gray-200' : 'bg-white/4 border border-white/5'}`}>
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Input Panel */}
          <div className={`master-data-input rounded-2xl p-5 ${!isDarkMode ? 'bg-white border border-gray-200' : 'bg-white/6 border border-white/10'}`}>
            <h3 className={`text-sm font-black uppercase tracking-[0.18em] mb-4 ${!isDarkMode ? 'text-gray-600' : 'text-white/60'}`}>
              Add New {config.label.slice(0, -1)}
            </h3>

            {parentData.length > 0 && (
              <div className="mb-4">
                <label className={`text-xs font-bold uppercase tracking-[0.12em] block mb-2 ${!isDarkMode ? 'text-gray-600' : 'text-white/60'}`}>
                  {getParentLabel()}
                </label>
                <div ref={parentDropdownRef} className="relative z-30">
                  <button
                    type="button"
                    onClick={() => setIsParentDropdownOpen((current) => !current)}
                    disabled={!canEditOperations}
                    aria-haspopup="listbox"
                    aria-expanded={isParentDropdownOpen}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left text-sm font-medium transition-colors disabled:opacity-60 ${
                      !isDarkMode
                        ? 'border-gray-300 bg-gray-100 text-gray-900'
                        : 'border-white/10 bg-white/4 text-white'
                    }`}
                  >
                    <span>{selectedParentId ? getParentName(selectedParentId) : `Select ${getParentLabel()}...`}</span>
                    <span className={`ml-3 text-xs transition-transform ${isParentDropdownOpen ? 'rotate-180' : ''}`} aria-hidden="true">⌄</span>
                  </button>

                  {isParentDropdownOpen && (
                    <div
                      role="listbox"
                      aria-label={`Select ${getParentLabel()}`}
                      className={`absolute left-0 right-0 top-full mt-2 max-h-60 overflow-y-auto rounded-lg border p-1 shadow-2xl ${
                        !isDarkMode
                          ? 'border-gray-300 bg-white'
                          : 'border-white/15 bg-[#25252a]'
                      }`}
                    >
                      <button
                        type="button"
                        role="option"
                        aria-selected={!selectedParentId}
                        onClick={() => {
                          setSelectedParentId(null)
                          setIsParentDropdownOpen(false)
                        }}
                        className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                          !isDarkMode ? 'text-gray-500 hover:bg-gray-100' : 'text-white/60 hover:bg-white/10'
                        }`}
                      >
                        Select {getParentLabel()}...
                      </button>
                      {parentData.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          role="option"
                          aria-selected={selectedParentId === item.id}
                          onClick={() => {
                            setSelectedParentId(item.id)
                            setIsParentDropdownOpen(false)
                          }}
                          className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                            selectedParentId === item.id
                              ? !isDarkMode ? 'bg-red-100 text-red-900' : 'bg-red-500/20 text-red-200'
                              : !isDarkMode ? 'text-gray-900 hover:bg-gray-100' : 'text-white hover:bg-white/10'
                          }`}
                        >
                          {item.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mb-4">
              <label className={`text-xs font-bold uppercase tracking-[0.12em] block mb-2 ${!isDarkMode ? 'text-gray-600' : 'text-white/60'}`}>
                Name
              </label>
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddItem()}
                placeholder={config.placeholder}
                disabled={!canEditOperations}
                className={`w-full px-3 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                  !isDarkMode
                    ? 'bg-gray-100 border-gray-300 text-gray-900 placeholder-gray-400 disabled:opacity-60'
                    : 'bg-white/4 border-white/10 text-white placeholder-white/40 disabled:opacity-60'
                }`}
              />
            </div>

            <button
              type="button"
              onClick={handleAddItem}
              disabled={!canEditOperations || isLoading}
              className="inventory-submit-button w-full inline-flex items-center justify-center gap-2 py-2.5"
            >
              <AddRoundedIcon sx={{ fontSize: 18 }} />
              {isLoading ? 'Adding...' : 'Add'}
            </button>

            {message && (
              <div className={`mt-4 p-3 rounded-lg text-sm font-medium ${
                message.type === 'error'
                  ? !isDarkMode ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-red-950/30 text-red-300 border border-red-900/30'
                  : !isDarkMode ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-emerald-950/30 text-emerald-300 border border-emerald-900/30'
              }`}>
                {message.text}
              </div>
            )}
          </div>

          {/* List Panel */}
          <div className={`master-data-list lg:col-span-2 rounded-2xl p-5 ${!isDarkMode ? 'bg-white border border-gray-200' : 'bg-white/6 border border-white/10'}`}>
            <h3 className={`text-sm font-black uppercase tracking-[0.18em] mb-4 ${!isDarkMode ? 'text-gray-600' : 'text-white/60'}`}>
              {filteredItems.length} {config.label} {selectedParentId ? `in "${getParentName(selectedParentId)}"` : ''}
            </h3>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {filteredItems.length > 0 ? (
                filteredItems.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      !isDarkMode ? 'bg-gray-50 border-gray-200 hover:bg-gray-100' : 'bg-white/4 border-white/10 hover:bg-white/8'
                    } transition-colors`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${!isDarkMode ? 'text-gray-900' : 'text-white'}`}>
                        {item.name}
                      </p>
                      {dataType === 'master-models' && item.categoryId && (
                        <p className={`text-xs truncate ${!isDarkMode ? 'text-gray-500' : 'text-white/50'}`}>
                          {parentData.find((c) => c.id === item.categoryId)?.name || 'Unknown'}
                        </p>
                      )}
                      {dataType === 'master-series' && item.modelId && (
                        <p className={`text-xs truncate ${!isDarkMode ? 'text-gray-500' : 'text-white/50'}`}>
                          {parentData.find((m) => m.id === item.modelId)?.name || 'Unknown'}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleDeleteItem(item.id, item.name)}
                      disabled={!canEditOperations || isLoading}
                      className={`inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors shrink-0 ml-3 disabled:opacity-60 ${
                        !isDarkMode
                            ? 'text-red-600 hover:bg-red-50'
                            : 'text-red-400 hover:bg-red-950/30'
                      }`}
                      title={`Delete ${item.name}`}
                    >
                      <DeleteOutlineRoundedIcon sx={{ fontSize: 18 }} />
                    </button>
                  </div>
                ))
              ) : (
                <div className={`text-center py-8 text-sm ${!isDarkMode ? 'text-gray-500' : 'text-white/50'}`}>
                  {selectedParentId
                    ? `No ${config.label.toLowerCase()} in this ${getParentLabel()?.toLowerCase()}.`
                    : `No ${config.label.toLowerCase()} yet. Add one to get started.`}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {dataType !== 'master-models' && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Total ' + config.label, value: String(items.length) },
            { label: 'Active', value: String(Math.max(0, items.length - 0)) },
            { label: 'Ready to Use', value: 'Yes' },
            { label: 'Last Updated', value: 'Today' },
          ].map((stat, idx) => (
            <article
              key={idx}
              className={`rounded-2xl p-4 ${!isDarkMode ? 'bg-gray-50 border border-gray-200' : 'bg-white/4 border border-white/10'}`}
            >
              <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${!isDarkMode ? 'text-gray-600' : 'text-white/40'}`}>
                {stat.label}
              </p>
              <h3 className="mt-3 font-['Epilogue'] text-3xl font-black text-white">{stat.value}</h3>
            </article>
          ))}
        </div>
      )}

      <ConfirmationModal
        open={confirmModal.open}
        title="Delete Item"
        message={`Are you sure you want to delete "${confirmModal.itemName}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        isDangerous={true}
        isDarkMode={isDarkMode}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmModal({ open: false, itemId: null, itemName: '' })}
      />
    </section>
  )
}
