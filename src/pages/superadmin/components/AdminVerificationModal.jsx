import { useEffect, useState } from 'react'
import { EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import VerifiedUserRoundedIcon from '@mui/icons-material/VerifiedUserRounded'
import WarningRoundedIcon from '@mui/icons-material/WarningRounded'
import CircularProgress from '@mui/material/CircularProgress'

/**
 * Admin Verification Modal for sensitive inventory actions (product name edits,
 * product deletions, permanent archive deletions, and approving staff requests).
 *
 * Uses Firebase Auth password re-authentication for password-authenticated admins,
 * or exact product-name confirmation for federated (Google) admins.
 */
export default function AdminVerificationModal({
  open,
  mode = 'delete', // 'rename' | 'update' | 'delete' | 'approve-rename' | 'approve-delete' | 'permanent-delete'
  itemName = '',
  proposedName = '',
  requestedBy = null,
  reason = '',
  currentUser = null,
  currentUserRole = '',
  isDarkMode = true,
  isLoading = false,
  onVerify,
  onSubmitRemote = null,
  onCancel,
}) {
  const [adminEmail, setAdminEmail] = useState('')
  const [password, setPassword] = useState('')
  const [typedConfirmation, setTypedConfirmation] = useState('')
  const [verificationNote, setVerificationNote] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isVerifying, setIsVerifying] = useState(false)

  const isStaffCaller = !['admin', 'superadmin'].includes(String(currentUserRole || '').trim().toLowerCase())

  const hasPasswordProvider = Boolean(
    currentUser?.email &&
      Array.isArray(currentUser?.providerData) &&
      currentUser.providerData.some((provider) => provider?.providerId === 'password'),
  )

  useEffect(() => {
    if (!open) {
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

  const isDeleteFlow = ['delete', 'approve-delete', 'permanent-delete'].includes(mode)
  const expectedPhrase = String(itemName || 'CONFIRM').trim()
  const busy = isLoading || isVerifying

  const titleByMode = {
    rename: 'Admin Verification: Rename Product',
    update: 'Admin Verification: Update Product',
    delete: 'Admin Verification: Delete Product',
    'approve-rename': 'Verify & Confirm Product Rename',
    'approve-delete': 'Verify & Confirm Product Deletion',
    'permanent-delete': 'Admin Verification: Permanent Delete',
  }

  const resetFormState = () => {
    setAdminEmail('')
    setPassword('')
    setTypedConfirmation('')
    setVerificationNote('')
    setErrorMessage('')
    setIsVerifying(false)
  }

  const handleClose = () => {
    if (busy) return
    resetFormState()
    onCancel?.()
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (busy) return
    setErrorMessage('')

    if (isStaffCaller) {
      const emailTrimmed = adminEmail.trim().toLowerCase()
      if (!emailTrimmed || !emailTrimmed.includes('@')) {
        setErrorMessage('Enter the verifying administrator\'s email address.')
        return
      }
      if (!password) {
        setErrorMessage('Enter the verifying administrator\'s password.')
        return
      }

      await onVerify?.({
        adminEmail: emailTrimmed,
        adminPassword: password,
        verificationNote: verificationNote.trim(),
        verificationMethod: 'admin-password-on-site',
      })
      return
    }

    if (hasPasswordProvider) {
      if (!password) {
        setErrorMessage('Enter your admin password to verify and confirm this action.')
        return
      }

      setIsVerifying(true)
      try {
        const credential = EmailAuthProvider.credential(currentUser.email, password)
        await reauthenticateWithCredential(currentUser, credential)
      } catch (error) {
        setIsVerifying(false)
        if (error?.code === 'auth/wrong-password' || error?.code === 'auth/invalid-credential') {
          setErrorMessage('Incorrect admin password. Verification failed.')
        } else if (error?.code === 'auth/too-many-requests') {
          setErrorMessage('Too many verification attempts. Please wait a moment and try again.')
        } else {
          setErrorMessage(error?.message || 'Unable to verify admin credentials.')
        }
        return
      }
      setIsVerifying(false)
    } else if (typedConfirmation.trim() !== expectedPhrase) {
      setErrorMessage(`Type "${expectedPhrase}" exactly to verify this action.`)
      return
    }

    await onVerify?.({
      verificationNote: verificationNote.trim(),
      verificationMethod: hasPasswordProvider ? 'admin-password' : 'admin-phrase-confirmation',
    })
    resetFormState()
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{
        zIndex: 99999,
        background: 'rgba(4, 4, 4, 0.8)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`rounded-2xl p-6 sm:p-7 w-full max-w-lg shadow-2xl ${
          isDarkMode
            ? 'bg-linear-to-br from-[#1a1a1a] to-[#0f0f0f] border border-white/15 text-white'
            : 'bg-white border border-gray-200 text-gray-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-4">
          <div
            className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
              isDeleteFlow
                ? isDarkMode
                  ? 'bg-red-950/50 text-red-400'
                  : 'bg-red-100 text-red-600'
                : isDarkMode
                  ? 'bg-amber-950/50 text-amber-400'
                  : 'bg-amber-100 text-amber-600'
            }`}
          >
            {isDeleteFlow ? <WarningRoundedIcon sx={{ fontSize: 24 }} /> : <VerifiedUserRoundedIcon sx={{ fontSize: 24 }} />}
          </div>

          <div className="flex-1 min-w-0">
            <p className={`text-[10px] font-black uppercase tracking-[0.22em] ${isDeleteFlow ? 'text-red-400' : 'text-amber-400'}`}>
              Admin Verification Required
            </p>
            <h3 className="mt-1 text-lg font-black leading-snug">
              {titleByMode[mode] || 'Admin Verification'}
            </h3>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={busy}
            aria-label="Close verification modal"
            className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
              isDarkMode ? 'hover:bg-white/10 text-white/60' : 'hover:bg-gray-100 text-gray-500'
            }`}
          >
            <CloseRoundedIcon sx={{ fontSize: 18 }} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div
            className={`rounded-xl border p-4 text-sm space-y-2 ${
              isDarkMode ? 'border-white/10 bg-white/4' : 'border-gray-200 bg-gray-50'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-white/50' : 'text-gray-500'}`}>
                Product Name
              </span>
              <span className="font-bold truncate">{itemName || 'Unnamed Product'}</span>
            </div>

            {(mode === 'rename' || mode === 'approve-rename') && (
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
                <span className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-white/50' : 'text-gray-500'}`}>
                  New Product Name
                </span>
                <span className="font-black text-emerald-400 truncate">{proposedName}</span>
              </div>
            )}

            {requestedBy?.email && (
              <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/10">
                <span className={`text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-white/50' : 'text-gray-500'}`}>
                  Requested By
                </span>
                <span className="text-xs font-semibold truncate">
                  {requestedBy.name || requestedBy.email} ({requestedBy.role || 'staff'})
                </span>
              </div>
            )}

            {reason && (
              <div className="pt-1 border-t border-white/10">
                <span className={`block text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-white/50' : 'text-gray-500'}`}>
                  Reason / Notes
                </span>
                <p className={`mt-1 text-xs ${isDarkMode ? 'text-white/80' : 'text-gray-700'}`}>{reason}</p>
              </div>
            )}
          </div>

          {isStaffCaller ? (
            <div className="space-y-3">
              <div
                className={`rounded-xl border p-3 text-xs leading-relaxed ${
                  isDarkMode ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-amber-200 bg-amber-50 text-amber-800'
                }`}
              >
                <strong>Admin Authorization Required:</strong> An authorized Administrator or Superadmin must enter their credentials below to confirm this action on-site.
              </div>

              <label className="block space-y-1.5">
                <span className={`block text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-white/70' : 'text-gray-700'}`}>
                  Admin Email
                </span>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(e) => {
                    setAdminEmail(e.target.value)
                    setErrorMessage('')
                  }}
                  placeholder="admin@bykelink.com"
                  autoFocus
                  disabled={busy}
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors ${
                    isDarkMode
                      ? 'border-white/15 bg-black/40 text-white focus:border-red-500'
                      : 'border-gray-300 bg-white text-gray-900 focus:border-red-600'
                  }`}
                />
              </label>

              <label className="block space-y-1.5">
                <span className={`block text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-white/70' : 'text-gray-700'}`}>
                  Admin Password
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value)
                    setErrorMessage('')
                  }}
                  placeholder="Enter admin password"
                  disabled={busy}
                  className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors ${
                    isDarkMode
                      ? 'border-white/15 bg-black/40 text-white focus:border-red-500'
                      : 'border-gray-300 bg-white text-gray-900 focus:border-red-600'
                  }`}
                />
              </label>
            </div>
          ) : hasPasswordProvider ? (
            <label className="block space-y-1.5">
              <span className={`block text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-white/70' : 'text-gray-700'}`}>
                Enter Admin Password ({currentUser?.email})
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setErrorMessage('')
                }}
                placeholder="Enter your admin password"
                autoFocus
                disabled={busy}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors ${
                  isDarkMode
                    ? 'border-white/15 bg-black/40 text-white focus:border-red-500'
                    : 'border-gray-300 bg-white text-gray-900 focus:border-red-600'
                }`}
              />
            </label>
          ) : (
            <label className="block space-y-1.5">
              <span className={`block text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-white/70' : 'text-gray-700'}`}>
                Type <strong className="text-red-400">{expectedPhrase}</strong> to verify
              </span>
              <input
                type="text"
                value={typedConfirmation}
                onChange={(e) => {
                  setTypedConfirmation(e.target.value)
                  setErrorMessage('')
                }}
                placeholder={expectedPhrase}
                autoFocus
                disabled={busy}
                className={`w-full rounded-xl border px-3.5 py-2.5 text-sm outline-none transition-colors ${
                  isDarkMode
                    ? 'border-white/15 bg-black/40 text-white focus:border-red-500'
                    : 'border-gray-300 bg-white text-gray-900 focus:border-red-600'
                }`}
              />
            </label>
          )}

          <label className="block space-y-1.5">
            <span className={`block text-xs font-bold uppercase tracking-wider ${isDarkMode ? 'text-white/60' : 'text-gray-600'}`}>
              Verification Note (Optional)
            </span>
            <input
              type="text"
              value={verificationNote}
              onChange={(e) => setVerificationNote(e.target.value)}
              placeholder="e.g., Verified physical count / approved update"
              disabled={busy}
              className={`w-full rounded-xl border px-3.5 py-2 text-sm outline-none transition-colors ${
                isDarkMode
                  ? 'border-white/10 bg-black/30 text-white focus:border-white/30'
                  : 'border-gray-200 bg-gray-50 text-gray-900 focus:border-gray-400'
              }`}
            />
          </label>

          {errorMessage && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs font-semibold text-red-400">
              {errorMessage}
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-2.5 pt-2">
            <div>
              {isStaffCaller && onSubmitRemote && (
                <button
                  type="button"
                  onClick={() => {
                    handleClose()
                    onSubmitRemote()
                  }}
                  disabled={busy}
                  className={`text-xs font-bold underline transition-colors ${
                    isDarkMode ? 'text-amber-400 hover:text-amber-300' : 'text-amber-700 hover:text-amber-800'
                  }`}
                >
                  Admin not present? Submit for Remote Approval ›
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={handleClose}
                disabled={busy}
                className={`rounded-xl px-4 py-2.5 text-sm font-bold transition-colors disabled:opacity-50 ${
                  isDarkMode
                    ? 'bg-white/10 text-white hover:bg-white/15'
                    : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
                }`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black text-white transition-colors disabled:opacity-60 ${
                  isDeleteFlow ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {busy ? (
                  <>
                    <CircularProgress size={16} color="inherit" />
                    Verifying...
                  </>
                ) : isDeleteFlow ? (
                  'Verify & Confirm Delete'
                ) : (
                  'Verify & Confirm Update'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
