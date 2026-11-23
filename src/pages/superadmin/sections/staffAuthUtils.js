/**
 * Staff Authorization & Verification Rules Utility
 * Governs direct credential authentication and dual-custody verification workflows.
 */

export const PRIVILEGED_ROLES = ['admin', 'superadmin']

/**
 * Checks if a user's role grants autonomous administrative authority without verification.
 */
export function canPerformDirectAdminAction(userRole = '') {
  const normalized = String(userRole).trim().toLowerCase()
  return PRIVILEGED_ROLES.includes(normalized)
}

/**
 * Validates direct admin credential override payload submitted by staff.
 */
export function validateDirectAuthorizationPayload({ adminEmail, adminPassword, itemId, pendingUpdates } = {}) {
  const errors = []

  if (!adminEmail || !String(adminEmail).includes('@')) {
    errors.push('A valid administrator email is required.')
  }

  if (!adminPassword || String(adminPassword).length < 6) {
    errors.push('Administrator password must be at least 6 characters.')
  }

  if (!itemId || String(itemId).trim() === '') {
    errors.push('Target item ID is required.')
  }

  if (!pendingUpdates || typeof pendingUpdates !== 'object' || Object.keys(pendingUpdates).length === 0) {
    errors.push('Pending update payload must contain at least one field to modify.')
  }

  return {
    isValid: errors.length === 0,
    errors,
  }
}

/**
 * Computes updated product state after admin approval.
 */
export function applyApprovedInventoryUpdates(originalItem = {}, pendingUpdates = {}) {
  const updated = {
    ...originalItem,
    ...pendingUpdates,
  }

  // If explicit color variants were submitted, compute sum from them
  if (Array.isArray(pendingUpdates.colorVariants) && pendingUpdates.colorVariants.length > 0) {
    updated.stock = pendingUpdates.colorVariants.reduce((sum, v) => sum + Number(v.stock || 0), 0)
  } else if (pendingUpdates.stock !== undefined) {
    updated.stock = Number(pendingUpdates.stock || 0)
  } else if (Array.isArray(originalItem.colorVariants) && originalItem.colorVariants.length > 0) {
    updated.stock = originalItem.colorVariants.reduce((sum, v) => sum + Number(v.stock || 0), 0)
  }

  // Recalculate status based on stock level
  if (updated.stock <= 0) {
    updated.status = 'Out of Stock'
  } else if (updated.stock <= 5) {
    updated.status = 'Low Stock'
  } else {
    updated.status = 'In Stock'
  }

  return updated
}
