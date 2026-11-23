import { useState, useMemo, useEffect } from 'react'
import { deleteDoc, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import DeleteForeverRoundedIcon from '@mui/icons-material/DeleteForeverRounded'
import RestoreRoundedIcon from '@mui/icons-material/RestoreRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import ConfirmationModal from '../components/ConfirmationModal'
import AdminVerificationModal from '../components/AdminVerificationModal'
import { db } from '../../../firebase'
import { logSystemAuditEvent } from '../../../services/auditLogService'
import './InventoryDeleteArchivedSection.css'

export default function InventoryDeleteArchivedSection({
  deletedItems = [],
  canDeletePermanently = false,
  handleCollectionUpdate,
  formatDate,
  isDarkMode = true,
  currentUser = null,
  currentAccessRole = null,
}) {
  const [confirmModal, setConfirmModal] = useState({ open: false, action: null, itemId: null, itemName: '' })
  const [adminVerifyModal, setAdminVerifyModal] = useState({ open: false, itemId: null, itemName: '' })
  const [isDeleting, setIsDeleting] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 8

  // Debug: Check actual role
  const isSuperAdmin = currentAccessRole && String(currentAccessRole).toLowerCase() === 'superadmin'
  const isAdmin = currentAccessRole && String(currentAccessRole).toLowerCase() === 'admin'
  const canShowDeleteButton = canDeletePermanently || isAdmin || isSuperAdmin
  const canShowRestoreButton = isSuperAdmin || isAdmin

  const filteredItems = useMemo(() => {
    return deletedItems.filter((item) => {
      if (item.recordType === 'inventory') return true
      if (item.originalCollection || (item.email && !item.category && !item.model)) {
        return false
      }
      return Boolean(item.name || item.category || item.model)
    })
  }, [deletedItems])

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1)
  }, [])

  const totalPages = Math.ceil(filteredItems.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedItems = useMemo(() => {
    return filteredItems.slice(startIndex, endIndex)
  }, [filteredItems, startIndex, endIndex])

  const handlePermanentDelete = (itemId, itemName) => {
    if (!canShowDeleteButton) {
      return
    }
    setAdminVerifyModal({ open: true, itemId, itemName })
  }

  const handleRestore = (itemId, itemName) => {
    if (!canShowRestoreButton) {
      return
    }
    setConfirmModal({ open: true, action: 'restore', itemId, itemName })
  }

  const handleConfirmPermanentDelete = async ({ verificationNote, verificationMethod }) => {
    const { itemId, itemName } = adminVerifyModal
    setIsDeleting(true)
    try {
      const targetItem = deletedItems.find((item) => item.id === itemId)
      await deleteDoc(doc(db, 'deleteArchived', itemId))
      await logSystemAuditEvent({
        module: 'Inventory',
        action: 'PRODUCT_PERMANENTLY_DELETED',
        summary: `Verified and permanently deleted archived product "${itemName || itemId}"`,
        targetType: 'inventory',
        targetId: itemId,
        targetName: itemName || itemId,
        previousData: targetItem ? { name: targetItem.name, category: targetItem.category, stock: targetItem.stock } : null,
        currentUser,
        accessRole: currentAccessRole,
        verifiedBy: {
          uid: currentUser?.uid || '',
          email: currentUser?.email || '',
          name: currentUser?.displayName || currentUser?.email || '',
          role: currentAccessRole || '',
          method: verificationMethod,
        },
        metadata: { verificationNote },
      })
      setAdminVerifyModal({ open: false, itemId: null, itemName: '' })
      handleCollectionUpdate()
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleConfirmDelete = async () => {
    const { itemId, itemName } = confirmModal
    setConfirmModal({ open: false, action: null, itemId: null, itemName: '' })

    setIsDeleting(true)
    try {
      const itemToRestore = deletedItems.find((item) => item.id === itemId)
      if (itemToRestore) {
        const {
          id,
          deletedAt: _deletedAt,
          deletedBy: _deletedBy,
          verifiedBy: _verifiedBy,
          verifiedAt: _verifiedAt,
          deletionReason: _deletionReason,
          recordType: _recordType,
          ...itemData
        } = itemToRestore
        await setDoc(doc(db, 'inventory', id), {
          ...itemData,
          updatedAt: serverTimestamp(),
        })
        await deleteDoc(doc(db, 'deleteArchived', itemId))
        await logSystemAuditEvent({
          module: 'Inventory',
          action: 'PRODUCT_RESTORED',
          summary: `Restored archived product "${itemName || itemToRestore.name || itemId}" back to inventory`,
          targetType: 'inventory',
          targetId: itemId,
          targetName: itemName || itemToRestore.name || itemId,
          newData: { name: itemToRestore.name, stock: itemToRestore.stock ?? 0 },
          currentUser,
          accessRole: currentAccessRole,
        })
      }
      handleCollectionUpdate()
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <section className={`inventory-delete-archived-shell space-y-6 ${!isDarkMode ? 'light-mode' : ''}`}>
      <div className="inventory-control-header flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="inventory-control-title font-['Epilogue'] text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
            Inventory <span>Delete Archived</span>
          </h2>
          <p className="mt-2 text-sm text-white/45">Manage deleted inventory items. Superadmin can permanently delete.</p>
        </div>
      </div>

      {/* Items List */}
      <div className={`rounded-2xl border overflow-hidden ${!isDarkMode ? 'bg-white border-gray-200' : 'bg-white/6 border-white/10'}`}>
        <div className="p-4">
          <h3 className={`text-sm font-black uppercase tracking-[0.18em] mb-4 ${!isDarkMode ? 'text-gray-600' : 'text-white/60'}`}>
            {filteredItems.length} Deleted Item{filteredItems.length !== 1 ? 's' : ''}
          </h3>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredItems.length > 0 ? (
              paginatedItems.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${!isDarkMode ? 'bg-gray-50 border-gray-200 hover:bg-gray-100' : 'bg-white/4 border-white/10 hover:bg-white/8'
                    }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      {item.imageUrl && (
                        <img src={item.imageUrl} alt={item.name} className="w-12 h-12 rounded-lg object-cover" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold truncate ${!isDarkMode ? 'text-gray-900' : 'text-white'}`}>
                          {item.name}
                        </p>
                        <p className={`text-xs truncate ${!isDarkMode ? 'text-gray-500' : 'text-white/50'}`}>
                          {item.model} • {item.category}
                        </p>
                        <p className={`text-[10px] font-bold mt-1 ${!isDarkMode ? 'text-gray-600' : 'text-white/40'}`}>
                          Deleted {item.deletedAt ? formatDate(item.deletedAt.seconds ? item.deletedAt.seconds * 1000 : item.deletedAt) : 'Recently'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    {canShowRestoreButton && (
                      <button
                        type="button"
                        onClick={() => handleRestore(item.id, item.name)}
                        disabled={isDeleting}
                        className={`inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors shrink-0 disabled:opacity-60 ${!isDarkMode
                          ? 'text-emerald-600 hover:bg-emerald-50'
                          : 'text-emerald-400 hover:bg-emerald-950/30'
                          }`}
                        title="Restore this item to inventory"
                      >
                        <RestoreRoundedIcon sx={{ fontSize: 18 }} />
                      </button>
                    )}
                    {canShowDeleteButton && (
                      <button
                        type="button"
                        onClick={() => handlePermanentDelete(item.id, item.name)}
                        disabled={isDeleting}
                        className={`inline-flex items-center justify-center h-8 w-8 rounded-full transition-colors shrink-0 disabled:opacity-60 ${!isDarkMode
                          ? 'text-red-600 hover:bg-red-50'
                          : 'text-red-400 hover:bg-red-950/30'
                          }`}
                        title="Permanently delete this item"
                      >
                        <DeleteForeverRoundedIcon sx={{ fontSize: 18 }} />
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className={`text-center py-8 text-sm ${!isDarkMode ? 'text-gray-500' : 'text-white/50'}`}>
                No deleted items yet. Items deleted by users are archived here.
              </div>
            )}
          </div>
        </div>

        {totalPages > 1 && filteredItems.length > 0 && (
          <div className="mt-4 flex items-center justify-between text-[11px] text-white/40">
            <span>Showing {startIndex + 1}-{Math.min(endIndex, filteredItems.length)} of {filteredItems.length} items</span>

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
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[
          { label: 'Total Deleted', value: String(deletedItems.length) },
          { label: 'Showing', value: String(filteredItems.length) },
          { label: 'Superadmin Access', value: isSuperAdmin ? 'Yes' : 'No' },
        ].map((stat, idx) => (
          <article
            key={idx}
            className="inventory-delete-archived-summary-card rounded-2xl p-4"
          >
            <p className={`text-[10px] font-black uppercase tracking-[0.24em] ${!isDarkMode ? 'text-gray-600' : 'text-white/40'}`}>
              {stat.label}
            </p>
            <h3 className="mt-3 font-['Epilogue'] text-3xl font-black text-white">{stat.value}</h3>
          </article>
        ))}
      </div>

      <ConfirmationModal
        open={confirmModal.open}
        title="Restore Item to Inventory"
        message={`Are you sure you want to restore "${confirmModal.itemName}" back to the inventory? It will be available immediately.`}
        confirmText="Yes, Restore"
        cancelText="Cancel"
        isDangerous={false}
        isDarkMode={isDarkMode}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmModal({ open: false, action: null, itemId: null, itemName: '' })}
      />

      <AdminVerificationModal
        open={adminVerifyModal.open}
        mode="permanent-delete"
        itemName={adminVerifyModal.itemName}
        currentUser={currentUser}
        isDarkMode={isDarkMode}
        isLoading={isDeleting}
        onVerify={handleConfirmPermanentDelete}
        onCancel={() => setAdminVerifyModal({ open: false, itemId: null, itemName: '' })}
      />
    </section>
  )
}
