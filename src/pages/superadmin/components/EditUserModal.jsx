import React from 'react'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import './EditUserModal.css'

export default function EditUserModal({
  open,
  onClose,
  editUserForm,
  setEditUserForm,
  onSubmit,
  canManageAccess,
  isSubmitting,
  sidebarItems = [],
}) {
  // Prevent body scroll when modal is open
  React.useEffect(() => {
    if (open) {
      document.documentElement.style.overflow = 'hidden'
      document.body.style.overflow = 'hidden'
      return () => {
        document.documentElement.style.overflow = ''
        document.body.style.overflow = ''
      }
    }
  }, [open])

  if (!open) {
    return null
  }

  const handleFieldChange = (event) => {
    const { name, value } = event.target

    setEditUserForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  const isActive = editUserForm.status !== 'inactive'

  return (
    <div className="edit-user-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="edit-user-modal-title">
      <div className="edit-user-modal-backdrop" onClick={onClose} />
      <div className="edit-user-modal-panel">
        <div className="edit-user-modal-visual">
          <div>
            <p className="edit-user-modal-visual-kicker">MODIFY ACCESS</p>
            <h3>Secure operator profile update</h3>
            <p>Adjust access level, status, and display details from the control console.</p>
          </div>
        </div>

        <div className="edit-user-modal-content">
          <button 
            type="button" 
            onClick={onClose} 
            className="edit-user-modal-close" 
            aria-label="Close modal"
          >
            <CloseRoundedIcon sx={{ fontSize: 18 }} />
          </button>

          <div className="edit-user-modal-header">
            <p className="edit-user-modal-kicker">User Management</p>
            <h2 id="edit-user-modal-title" className="edit-user-modal-title">
              Edit User
            </h2>
            <p className="edit-user-modal-copy">
              Review the assigned role and activation state before applying changes.
            </p>
          </div>

          <form onSubmit={onSubmit} className="edit-user-modal-form">
            <label className="edit-user-field">
              <span>Full Name</span>
              <input
                type="text"
                name="fullName"
                value={editUserForm.fullName}
                onChange={handleFieldChange}
                placeholder="e.g. Kary Sato"
                disabled={!canManageAccess || isSubmitting}
              />
            </label>

            <label className="edit-user-field">
              <span>Email Address</span>
              <input
                type="email"
                name="email"
                value={editUserForm.email}
                onChange={handleFieldChange}
                placeholder="user@bykelink.com"
                readOnly
                disabled
              />
            </label>
            <div className="edit-user-modal-section">
              <p className="edit-user-modal-section-title">Menu Access</p>
              <div className="edit-user-access-checkboxes">
                {sidebarItems
                  .filter((item) => item.id !== 'transaction-history')
                  .map((item) => (
                  <label key={item.id} className="edit-user-access-checkbox">
                    <input
                      type="checkbox"
                      checked={editUserForm.accessibleSections?.includes(item.id) ?? false}
                      onChange={(event) => {
                        setEditUserForm((current) => {
                          const sections = current.accessibleSections ?? []
                          return {
                            ...current,
                            accessibleSections: event.target.checked
                              ? [...sections, item.id]
                              : sections.filter((s) => s !== item.id),
                          }
                        })
                      }}
                      disabled={!canManageAccess || isSubmitting}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="edit-user-modal-grid">
          
              <div className="edit-user-field edit-user-field--toggle">
                <span>Active</span>
                <label className="edit-user-switch" aria-label="Toggle user active state">
                  <input
                    type="checkbox"
                    checked={isActive}
                    onChange={(event) =>
                      setEditUserForm((current) => ({
                        ...current,
                        status: event.target.checked ? 'active' : 'inactive',
                      }))
                    }
                    disabled={!canManageAccess || isSubmitting}
                  />
                  <span className="edit-user-switch-ui" />
                </label>
              </div>
            </div>

            <div className="edit-user-modal-actions">
              <button
                type="submit"
                disabled={!canManageAccess || isSubmitting}
                className="edit-user-submit"
              >
                {isSubmitting ? 'Updating...' : 'Update User'}
              </button>
              <button type="button" onClick={onClose} className="edit-user-cancel">
                Discard Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
