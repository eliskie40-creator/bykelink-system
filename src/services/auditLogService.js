import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../firebase'

/**
 * Appends an immutable system transaction / audit trail record to `auditLogs`.
 * Failures are logged as warnings so primary user operations are not blocked.
 */
export async function logSystemAuditEvent({
  module = 'System',
  action = 'SYSTEM_EVENT',
  summary = '',
  targetType = '',
  targetId = '',
  targetName = '',
  previousData = null,
  newData = null,
  amount = null,
  currentUser = null,
  accessRole = '',
  verifiedBy = null,
  metadata = null,
}) {
  try {
    const eventId = `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
    const actorEmail = String(currentUser?.email || '').trim().toLowerCase()
    const actorName = currentUser?.displayName || actorEmail.split('@')[0] || 'System User'
    const normalizedAmount =
      amount !== undefined && amount !== null && Number.isFinite(Number(amount))
        ? Number(amount)
        : null

    await setDoc(doc(db, 'auditLogs', eventId), {
      eventId,
      module: String(module),
      action: String(action),
      summary: String(summary),
      targetType: String(targetType),
      targetId: String(targetId),
      targetName: String(targetName),
      previousData,
      newData,
      amount: normalizedAmount,
      performedBy: {
        uid: currentUser?.uid || '',
        email: actorEmail,
        name: actorName,
        role: String(accessRole || 'unknown').toLowerCase(),
      },
      verifiedBy,
      metadata,
      createdAt: serverTimestamp(),
    })

    return eventId
  } catch (error) {
    console.warn('[AuditLog] Unable to record system audit event:', action, error)
    return null
  }
}
