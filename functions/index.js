const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https')
const logger = require('firebase-functions/logger')
const admin = require('firebase-admin')
const { randomUUID } = require('crypto')

admin.initializeApp()

const DEFAULT_OPERATOR_PASSWORD = 'Password123'


const personnelRoles = [
  'mechanics personnel',
  'staff personnel',
  'cashier personnel',
  'customer',
]

const rolePriority = {
  customer: 0,
  'staff personnel': 1,
  'mechanics personnel': 1,
  'cashier personnel': 1,
  admin: 2,
  superadmin: 3,
}

const normalizeRole = (value = 'customer') => {
  const normalizedValue = String(value).trim().toLowerCase().replace(/[\s_-]+/g, '')

  if (normalizedValue === 'superadmin') return 'superadmin'
  if (normalizedValue === 'admin') return 'admin'
  if (normalizedValue === 'staff' || normalizedValue === 'staffpersonnel') return 'staff personnel'
  if (
    normalizedValue === 'mechanic' ||
    normalizedValue === 'mechanics' ||
    normalizedValue === 'mechanicspersonnel' ||
    normalizedValue === 'mechanicpersonnel'
  ) return 'mechanics personnel'
  if (normalizedValue === 'cashier' || normalizedValue === 'cashierpersonnel') return 'cashier personnel'
  return 'customer'
}

const normalizeDashboardPath = (value = '') => {
  const normalizedValue = String(value).trim()

  if (!normalizedValue) return null

  return normalizedValue.startsWith('/') ? normalizedValue : `/${normalizedValue}`
}

const isAuthorizedEntryActive = (entry = {}) => {
  const rawStatus =
    entry.active ?? entry.isActive ?? entry.enabled ?? entry.authorized ?? entry.status ?? true

  if (typeof rawStatus === 'string') {
    return !['inactive', 'disabled', 'revoked', 'false', 'no'].includes(
      rawStatus.trim().toLowerCase(),
    )
  }

  return Boolean(rawStatus)
}

const getDashboardPath = (role, explicitPath = '') => {
  const normalizedPath = normalizeDashboardPath(explicitPath)

  if (normalizedPath) {
    return normalizedPath
  }

  switch (role) {
    case 'superadmin':
      return '/superadmin'
    case 'admin':
      return '/admin'
    case 'staff personnel':
      return '/staff'
    case 'mechanics personnel':
      return '/admin'
    case 'cashier personnel':
      return '/cashier'
    default:
      return '/customer'
  }
}

const getWebApiKey = () =>
  String(
    process.env.FIREBASE_WEB_API_KEY ||
    process.env.WEB_API_KEY ||
    'AIzaSyACbx4Fg8mqeGHVfJZNqUcdA3q4PLUrlPQ',
  ).trim()

const sendFirebaseVerificationEmail = async ({ email, temporaryPassword }) => {
  const apiKey = getWebApiKey()

  if (!apiKey) {
    logger.warn('FIREBASE_WEB_API_KEY is missing. Firebase verification email could not be sent.', {
      email,
      structuredData: true,
    })

    return { sent: false }
  }

  const signInResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: temporaryPassword,
        returnSecureToken: true,
      }),
    },
  )

  const signInData = await signInResponse.json().catch(() => ({}))

  if (!signInResponse.ok || !signInData.idToken) {
    logger.warn('Unable to sign in the invited operator for Firebase verification dispatch.', {
      email,
      details: signInData?.error?.message || 'sign-in failed',
      structuredData: true,
    })

    return { sent: false }
  }

  const verifyResponse = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestType: 'VERIFY_EMAIL',
        idToken: signInData.idToken,
      }),
    },
  )

  const verifyData = await verifyResponse.json().catch(() => ({}))

  if (!verifyResponse.ok) {
    logger.warn('Firebase verification email dispatch failed.', {
      email,
      details: verifyData?.error?.message || 'verify-email failed',
      structuredData: true,
    })

    return { sent: false }
  }

  return { sent: true }
}

const isAuthorizedCollectionSource = (source = '') =>
  ['authorizedSuperadmin', 'authorizedAdmin', 'authorizedPersonnel'].includes(String(source).trim())

const getAuthorizedCollectionNameForRole = (role = 'customer') => {
  const normalizedRole = normalizeRole(role)

  if (normalizedRole === 'superadmin') return 'authorizedSuperadmin'
  if (normalizedRole === 'admin') return 'authorizedAdmin'
  if (['staff personnel', 'mechanics personnel', 'cashier personnel'].includes(normalizedRole)) {
    return 'authorizedPersonnel'
  }

  return null
}

const deleteMatchingUserDocs = async ({ uid = '', email = '' } = {}) => {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const usersCollection = admin.firestore().collection('users')
  const deleteOperations = []

  if (uid) {
    deleteOperations.push(usersCollection.doc(uid).delete().catch(() => undefined))
  }

  if (normalizedEmail) {
    const snapshot = await usersCollection.where('email', '==', normalizedEmail).get()
    snapshot.forEach((docSnapshot) => {
      deleteOperations.push(docSnapshot.ref.delete().catch(() => undefined))
    })
  }

  await Promise.all(deleteOperations)
}

const buildResolvedAccessProfile = (profiles = [], fallbackRole = 'customer') => {
  const normalizedFallbackRole = normalizeRole(fallbackRole)

  return profiles.filter(Boolean).reduce(
    (highestProfile, profile) => {
      const normalizedRole = normalizeRole(profile.role || normalizedFallbackRole)
      const normalizedDashboardPath = getDashboardPath(
        normalizedRole,
        profile.dashboardPath || profile.assignedPage || profile.redirectTo || profile.page,
      )
      const candidateProfile = {
        ...profile,
        role: normalizedRole,
        dashboardPath: normalizedDashboardPath,
      }

      const currentPriority = rolePriority[candidateProfile.role] ?? 0
      const highestPriority = rolePriority[highestProfile.role] ?? 0

      if (currentPriority > highestPriority) {
        return candidateProfile
      }

      if (
        currentPriority === highestPriority &&
        !highestProfile.dashboardPath &&
        candidateProfile.dashboardPath
      ) {
        return candidateProfile
      }

      return highestProfile
    },
    {
      role: normalizedFallbackRole,
      dashboardPath: getDashboardPath(normalizedFallbackRole),
      source: 'default',
    },
  )
}

const getRoleFromEmail = async (email = '', options = {}) => {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  const normalizedUid = String(options.uid || '').trim()
  const claimsRole = normalizeRole(options.claimsRole || 'customer')

  const resolvedProfiles = []

  if (!normalizedEmail && !normalizedUid) {
    return buildResolvedAccessProfile(resolvedProfiles, 'customer')
  }

  const findCollectionRole = async (collectionName, fallbackRole) => {
    const accessCollection = admin.firestore().collection(collectionName)
    const emailFields = ['email', 'emailAddress', 'authorizedEmail', 'userEmail']

    const toAccessProfile = (data = {}) => {
      if (!isAuthorizedEntryActive(data)) {
        return null
      }

      const role = normalizeRole(
        data.role ||
        data.personnelRole ||
        data.assignedRole ||
        data.accessRole ||
        data.accountRole ||
        fallbackRole,
      )

      if (role === 'customer') {
        return null
      }


      return {
        role,
        dashboardPath: getDashboardPath(
          role,
          data.dashboardPath || data.assignedPage || data.redirectTo || data.page,
        ),
        accessibleSections: Array.isArray(data.accessibleSections)
          ? data.accessibleSections
          : [],
        source: collectionName,
      }

    }

    try {
      if (normalizedUid) {
        const uidDoc = await accessCollection.doc(normalizedUid).get()

        if (uidDoc.exists) {
          const uidProfile = toAccessProfile(uidDoc.data() || {})

          if (uidProfile) {
            return uidProfile
          }
        }
      }

      if (normalizedEmail) {
        const emailDoc = await accessCollection.doc(normalizedEmail).get()

        if (emailDoc.exists) {
          const emailProfile = toAccessProfile(emailDoc.data() || {})

          if (emailProfile) {
            return emailProfile
          }
        }

        for (const fieldName of emailFields) {
          const emailSnapshot = await accessCollection.where(fieldName, '==', normalizedEmail).limit(1).get()
          const matchedDoc = emailSnapshot.docs[0]

          if (matchedDoc) {
            const matchedProfile = toAccessProfile(matchedDoc.data() || {})

            if (matchedProfile) {
              return matchedProfile
            }
          }
        }
      }
    } catch (error) {
      logger.warn('Unable to read an access collection while resolving role.', {
        collectionName,
        email: normalizedEmail,
        uid: normalizedUid,
        details: error.message,
        structuredData: true,
      })
    }

    return null
  }

  const [superadminProfileResult, adminProfileResult, personnelProfileResult] = await Promise.allSettled([
    findCollectionRole('authorizedSuperadmin', 'superadmin'),
    findCollectionRole('authorizedAdmin', 'admin'),
    findCollectionRole('authorizedPersonnel', 'staff personnel'),
  ])

  resolvedProfiles.push(
    superadminProfileResult.status === 'fulfilled' ? superadminProfileResult.value : null,
    adminProfileResult.status === 'fulfilled' ? adminProfileResult.value : null,
    personnelProfileResult.status === 'fulfilled' ? personnelProfileResult.value : null,
  )

  const accessLookupErrors = [superadminProfileResult, adminProfileResult, personnelProfileResult]
    .filter((result) => result.status === 'rejected')
    .map((result) => result.reason?.message)
    .filter(Boolean)

  if (accessLookupErrors.length) {
    logger.warn('Some access lookups failed while resolving role; continuing with successful sources.', {
      email: normalizedEmail,
      uid: normalizedUid,
      details: accessLookupErrors.join(' | '),
      structuredData: true,
    })

    if (!resolvedProfiles.filter(Boolean).length && claimsRole !== 'customer') {
      resolvedProfiles.push({
        role: claimsRole,
        dashboardPath: getDashboardPath(claimsRole),
        source: 'auth-claim-fallback',
      })
    }
  }


  const resolved = buildResolvedAccessProfile(resolvedProfiles, 'customer')

  return {
    ...resolved,
    accessibleSections:
      resolvedProfiles.find(profile => profile?.accessibleSections)?.accessibleSections || [],
  }
}

const buildActorFromRequest = (request, roleOverride = '') => {
  const email = String(request?.auth?.token?.email || '').trim().toLowerCase()
  const name = String(
    request?.auth?.token?.name ||
    (email ? email.split('@')[0] : '') ||
    'System',
  ).trim()

  return {
    uid: request?.auth?.uid || '',
    email,
    name,
    role: String(roleOverride || request?.auth?.token?.role || 'unknown').toLowerCase(),
  }
}

const recordAuditLog = async (db, entry = {}) => {
  try {
    const eventId = String(
      entry.eventId ||
      `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    )

    await db.collection('auditLogs').doc(eventId).set({
      eventId,
      module: String(entry.module || 'System'),
      action: String(entry.action || 'SYSTEM_EVENT'),
      summary: String(entry.summary || ''),
      targetType: String(entry.targetType || ''),
      targetId: String(entry.targetId || ''),
      targetName: String(entry.targetName || ''),
      previousData: entry.previousData ?? null,
      newData: entry.newData ?? null,
      amount:
        entry.amount !== undefined &&
          entry.amount !== null &&
          Number.isFinite(Number(entry.amount))
          ? Number(entry.amount)
          : null,
      performedBy: entry.performedBy || {
        uid: '',
        email: 'system',
        name: 'System',
        role: 'system',
      },
      verifiedBy: entry.verifiedBy || null,
      metadata: entry.metadata || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  } catch (error) {
    logger.warn('Failed to record audit log entry', {
      action: entry.action,
      details: error.message,
      structuredData: true,
    })
  }
}

exports.generateTransactionId = onCall({ cors: true }, async () => {
  const timestampPart = Date.now().toString().slice(-8)
  const randomPart = randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()

  return {
    transactionId: `TX-${timestampPart}-${randomPart}`,
  }
})

exports.printReceipt = onCall({ cors: true }, async (request) => {
  const receipt = request.data?.receipt || {}
  const receiptId = receipt.id || `TX-${Date.now()}`
  const payload = {
    receiptId,
    customer: receipt.customer || 'Walk-in Customer',
    paymentMethod: receipt.paymentMethod || 'Cash',
    subtotal: Number(receipt.subtotal || 0),
    vat: Number(receipt.vat || 0),
    grandTotal: Number(receipt.grandTotal || 0),
    amountTendered: Number(receipt.amountTendered || 0),
    change: Number(receipt.change || 0),
    itemCount: Array.isArray(receipt.items) ? receipt.items.length : 0,
    printedAt: new Date().toISOString(),
  }

  logger.info('Receipt print queued for backend processing', {
    structuredData: true,
    payload,
  })

  return {
    ok: true,
    receiptId,
    message: 'Receipt print job accepted successfully.',
  }
})

exports.completeSaleTransaction = onCall({ cors: true }, async (request) => {
  const receipt = request.data?.receipt || {}
  const cartItems = Array.isArray(request.data?.cartItems) ? request.data.cartItems : []

  const normalizedItems = cartItems
    .filter((entry) => entry && (entry.id || entry.name))
    .map((entry) => {
      const id = String(entry.id || '')
      const sku = String(entry.sku || '')
      const qty = Number(entry.qty || 0)
      const unitPrice = Number(entry.unitPrice || 0)
      const isService =
        entry.type === 'service' ||
        id.startsWith('service-') ||
        sku.trim().toUpperCase() === 'SERVICE'
      return {
        id,
        name: String(entry.name || entry.item || 'Item'),
        sku,
        type: isService ? 'service' : 'product',
        qty,
        unitPrice,
        subtotal: Number((qty * unitPrice).toFixed(2)),
      }
    })

  const inventoryUpdates = normalizedItems.filter((entry) => entry.id && entry.type !== 'service')
  const totalQuantity = normalizedItems.reduce((sum, entry) => sum + Number(entry.qty || 0), 0)
  const partsSubtotal = Number(
    normalizedItems
      .filter((entry) => entry.type !== 'service')
      .reduce((sum, entry) => sum + Number(entry.subtotal || 0), 0)
      .toFixed(2),
  )
  const serviceSubtotal = Number(
    normalizedItems
      .filter((entry) => entry.type === 'service')
      .reduce((sum, entry) => sum + Number(entry.subtotal || 0), 0)
      .toFixed(2),
  )
  const hasServices = normalizedItems.some((entry) => entry.type === 'service')

  const paymentMethodKey = String(receipt.paymentMethodKey || receipt.paymentMethod || 'cash').toLowerCase().trim()

  const transactionLog = {
    transactionId: receipt.id || `TX-${Date.now()}`,
    customer: receipt.customer || 'Walk-in Customer',
    paymentMethod: receipt.paymentMethod || 'Cash',
    paymentMethodKey,
    subtotal: Number(receipt.subtotal || 0),
    partsSubtotal,
    serviceSubtotal,
    hasServices,
    discount: Number(receipt.discount || 0),
    vat: Number(receipt.vat || 0),
    grandTotal: Number(receipt.grandTotal || 0),
    amountTendered: Number(receipt.amountTendered || 0),
    change: Number(receipt.change || 0),
    notes: receipt.notes || '',
    itemCount: normalizedItems.length,
    totalQuantity,
    isBulkOrder: totalQuantity >= 5,
    timestamp: receipt.timestamp || new Date().toLocaleString('en-PH', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    items: normalizedItems,
  }

  const inventoryBatch = admin.firestore().batch()

  for (const entry of inventoryUpdates) {
    const inventoryRef = admin.firestore().collection('inventory').doc(entry.id)
    const snapshot = await inventoryRef.get()

    if (!snapshot.exists) {
      continue
    }

    const currentData = snapshot.data() || {}
    const currentStock = Number(currentData.stock ?? currentData.quantity ?? currentData.onHand ?? 0)
    const quantitySold = Number(entry.qty || 0)
    const nextStock = Math.max(0, currentStock - quantitySold)

    inventoryBatch.update(inventoryRef, {
      stock: nextStock,
      quantity: nextStock,
      onHand: nextStock,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    })
  }

  const transactionRef = admin.firestore().collection('transactionLogs').doc(transactionLog.transactionId)
  inventoryBatch.set(transactionRef, transactionLog)
  await inventoryBatch.commit()

  const posActor = request.auth
    ? buildActorFromRequest(request, 'cashier personnel')
    : { uid: '', email: 'pos-cashier', name: 'Cashier POS', role: 'cashier personnel' }

  await recordAuditLog(admin.firestore(), {
    eventId: `SALE-${transactionLog.transactionId}`,
    module: 'POS',
    action: 'SALE_COMPLETED',
    summary: `POS sale ${transactionLog.transactionId} (${transactionLog.paymentMethod}) for ${transactionLog.customer} — ${totalQuantity} pc${totalQuantity === 1 ? '' : 's'}`,
    targetType: 'transaction',
    targetId: transactionLog.transactionId,
    targetName: transactionLog.customer,
    newData: {
      paymentMethod: transactionLog.paymentMethod,
      subtotal: transactionLog.subtotal,
      partsSubtotal: transactionLog.partsSubtotal,
      serviceSubtotal: transactionLog.serviceSubtotal,
      hasServices: transactionLog.hasServices,
      vat: transactionLog.vat,
      discount: transactionLog.discount,
      grandTotal: transactionLog.grandTotal,
      itemCount: transactionLog.itemCount,
      totalQuantity: transactionLog.totalQuantity,
      isBulkOrder: transactionLog.isBulkOrder,
      items: transactionLog.items,
    },
    amount: transactionLog.grandTotal,
    performedBy: posActor,
  })

  logger.info('Sale transaction completed server-side', {
    structuredData: true,
    transactionId: transactionLog.transactionId,
    itemCount: inventoryUpdates.length,
  })

  return {
    ok: true,
    transactionId: transactionLog.transactionId,
    message: 'Inventory deducted and transaction recorded successfully.',
  }
})

exports.submitInventoryChangeRequest = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to submit an inventory verification request.')
  }

  const requesterEmail = String(request.auth.token.email || '').trim().toLowerCase()
  const requesterAccess = await getRoleFromEmail(requesterEmail, {
    uid: request.auth.uid,
    claimsRole: request.auth.token.role,
  })

  if (!['staff personnel', 'admin', 'superadmin'].includes(requesterAccess.role)) {
    throw new HttpsError('permission-denied', 'Only staff or administrators can request inventory changes.')
  }

  const itemId = String(request.data?.itemId || '').trim()
  const requestType = String(request.data?.requestType || '').trim().toLowerCase()
  const proposedName = String(request.data?.proposedName || '').trim()
  const reason = String(request.data?.reason || '').trim()
  const pendingUpdates =
    request.data?.pendingUpdates && typeof request.data.pendingUpdates === 'object'
      ? JSON.parse(JSON.stringify(request.data.pendingUpdates))
      : null

  if (!itemId || !['rename', 'delete', 'update'].includes(requestType)) {
    throw new HttpsError('invalid-argument', 'Valid itemId and requestType (rename, update, or delete) are required.')
  }

  if (requestType === 'rename' && !proposedName) {
    throw new HttpsError('invalid-argument', 'A new product name is required for a rename request.')
  }

  const db = admin.firestore()
  const itemRef = db.collection('inventory').doc(itemId)
  const itemSnap = await itemRef.get()

  if (!itemSnap.exists) {
    throw new HttpsError('not-found', 'Inventory product was not found.')
  }

  const itemData = itemSnap.data() || {}
  const currentName = String(itemData.name || 'Unnamed Product')
  const requestedBy = buildActorFromRequest(request, requesterAccess.role)

  const requestRef = db.collection('inventoryChangeRequests').doc()
  await requestRef.set({
    requestId: requestRef.id,
    requestType,
    status: 'pending',
    itemId,
    currentName,
    proposedName: proposedName || currentName,
    pendingUpdates: pendingUpdates || null,
    itemSnapshot: {
      name: currentName,
      model: itemData.model || '',
      category: itemData.category || '',
      sku: itemData.sku || '',
      stock: Number(itemData.stock ?? 0),
      price: Number(itemData.price ?? 0),
      imageUrl: itemData.imageUrl || '',
    },
    reason,
    requestedBy,
    verifiedBy: null,
    verificationNote: '',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  })

  let actionSummary = `Requested deletion of "${currentName}" (awaiting admin verification)`
  if (requestType === 'rename') {
    actionSummary = `Requested rename of "${currentName}" to "${proposedName}" (awaiting admin verification)`
  } else if (requestType === 'update') {
    actionSummary = `Requested product update for "${currentName}" (awaiting admin verification)`
  }

  await recordAuditLog(db, {
    module: 'Inventory',
    action: requestType === 'rename' ? 'PRODUCT_RENAME_REQUESTED' : requestType === 'update' ? 'PRODUCT_UPDATE_REQUESTED' : 'PRODUCT_DELETE_REQUESTED',
    summary: actionSummary,
    targetType: 'inventory',
    targetId: itemId,
    targetName: currentName,
    previousData: { name: currentName, price: itemData.price, stock: itemData.stock },
    newData: pendingUpdates || (proposedName ? { name: proposedName } : null),
    performedBy: requestedBy,
    metadata: { requestId: requestRef.id, reason },
  })

  return {
    ok: true,
    requestId: requestRef.id,
    message:
      requestType === 'delete'
        ? 'Product deletion request submitted for admin verification.'
        : 'Product updates submitted for admin verification.',
  }
})

exports.verifyInventoryChangeRequest = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to verify inventory requests.')
  }

  const verifierEmail = String(request.auth.token.email || '').trim().toLowerCase()
  const verifierAccess = await getRoleFromEmail(verifierEmail, {
    uid: request.auth.uid,
    claimsRole: request.auth.token.role,
  })

  if (!['admin', 'superadmin'].includes(verifierAccess.role)) {
    throw new HttpsError('permission-denied', 'Only admin or superadmin can verify product name edits or deletions.')
  }

  const requestId = String(request.data?.requestId || '').trim()
  const decision = String(request.data?.decision || '').trim().toLowerCase()
  const verificationNote = String(request.data?.verificationNote || '').trim()
  const verificationMethod = String(request.data?.verificationMethod || 'admin-verification').trim()

  if (!requestId || !['approve', 'reject'].includes(decision)) {
    throw new HttpsError('invalid-argument', 'Valid requestId and decision (approve or reject) are required.')
  }

  const db = admin.firestore()
  const changeReqRef = db.collection('inventoryChangeRequests').doc(requestId)
  const changeReqSnap = await changeReqRef.get()

  if (!changeReqSnap.exists) {
    throw new HttpsError('not-found', 'Verification request not found.')
  }

  const reqData = changeReqSnap.data() || {}
  if (reqData.status !== 'pending') {
    throw new HttpsError('failed-precondition', `This request has already been ${reqData.status}.`)
  }

  const verifiedBy = {
    ...buildActorFromRequest(request, verifierAccess.role),
    method: verificationMethod,
  }
  const timestamp = admin.firestore.FieldValue.serverTimestamp()

  if (decision === 'reject') {
    await changeReqRef.update({
      status: 'rejected',
      verifiedBy,
      verificationNote,
      verifiedAt: timestamp,
      updatedAt: timestamp,
    })

    await recordAuditLog(db, {
      module: 'Inventory',
      action: 'PRODUCT_CHANGE_REJECTED',
      summary: `Rejected ${reqData.requestType} request for "${reqData.currentName}"`,
      targetType: 'inventory',
      targetId: reqData.itemId,
      targetName: reqData.currentName,
      previousData: { name: reqData.currentName },
      newData: reqData.proposedName ? { name: reqData.proposedName } : null,
      performedBy: reqData.requestedBy || verifiedBy,
      verifiedBy,
      metadata: { requestId, verificationNote },
    })

    return { ok: true, status: 'rejected', message: 'Request rejected.' }
  }

  const itemRef = db.collection('inventory').doc(reqData.itemId)
  const itemSnap = await itemRef.get()
  if (!itemSnap.exists) {
    throw new HttpsError('not-found', 'Target inventory product no longer exists.')
  }

  const itemData = itemSnap.data() || {}
  const batch = db.batch()

  if (reqData.requestType === 'rename' || reqData.requestType === 'update') {
    const safeUpdates =
      reqData.pendingUpdates && typeof reqData.pendingUpdates === 'object'
        ? reqData.pendingUpdates
        : {}

    const resolvedName = reqData.proposedName || reqData.currentName
    batch.update(itemRef, {
      ...safeUpdates,
      name: resolvedName,
      lastVerifiedBy: verifiedBy,
      lastVerifiedAt: timestamp,
      updatedAt: timestamp,
    })
  } else if (reqData.requestType === 'delete') {
    const archiveRef = db.collection('deleteArchived').doc(reqData.itemId)
    batch.set(archiveRef, {
      ...itemData,
      recordType: 'inventory',
      deletedAt: timestamp,
      deletedBy: reqData.requestedBy?.name || reqData.requestedBy?.email || verifierEmail,
      verifiedBy,
      verifiedAt: timestamp,
      deletionReason: reqData.reason || verificationNote || '',
      updatedAt: timestamp,
    })
    batch.delete(itemRef)
  }

  batch.update(changeReqRef, {
    status: 'approved',
    verifiedBy,
    verificationNote,
    verifiedAt: timestamp,
    updatedAt: timestamp,
  })

  await batch.commit()

  const finalName = reqData.proposedName || reqData.currentName
  await recordAuditLog(db, {
    module: 'Inventory',
    action:
      reqData.requestType === 'delete'
        ? 'PRODUCT_DELETED'
        : reqData.proposedName && reqData.proposedName !== reqData.currentName
          ? 'PRODUCT_RENAMED'
          : 'PRODUCT_UPDATED',
    summary:
      reqData.requestType === 'delete'
        ? `Verified and deleted product "${reqData.currentName}" (moved to archive)`
        : reqData.proposedName && reqData.proposedName !== reqData.currentName
          ? `Verified and renamed "${reqData.currentName}" to "${reqData.proposedName}"`
          : `Verified and updated product "${finalName}"`,
    targetType: 'inventory',
    targetId: reqData.itemId,
    targetName: reqData.requestType === 'delete' ? reqData.currentName : finalName,
    previousData: { name: reqData.currentName, stock: itemData.stock ?? 0, price: itemData.price ?? 0 },
    newData: reqData.requestType === 'delete' ? null : { name: finalName, ...(reqData.pendingUpdates || {}) },
    performedBy: reqData.requestedBy || verifiedBy,
    verifiedBy,
    metadata: { requestId, verificationNote },
  })

  return {
    ok: true,
    status: 'approved',
    message:
      reqData.requestType === 'delete'
        ? `Product "${reqData.currentName}" verified and deleted.`
        : `Product "${finalName}" verified and updated.`,
  }
})

exports.authorizeInventoryDirectly = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to verify inventory updates.')
  }

  const callerEmail = String(request.auth.token.email || '').trim().toLowerCase()
  const callerAccess = await getRoleFromEmail(callerEmail, {
    uid: request.auth.uid,
    claimsRole: request.auth.token.role,
  })

  if (!['staff personnel', 'admin', 'superadmin'].includes(callerAccess.role)) {
    throw new HttpsError('permission-denied', 'Unauthorized operator.')
  }

  const itemId = String(request.data?.itemId || '').trim()
  const actionType = String(request.data?.actionType || 'update').trim().toLowerCase()
  const adminEmail = String(request.data?.adminEmail || '').trim().toLowerCase()
  const adminPassword = String(request.data?.adminPassword || '').trim()
  const updates = request.data?.updates && typeof request.data.updates === 'object' ? request.data.updates : {}
  const verificationNote = String(request.data?.verificationNote || '').trim()
  const reason = String(request.data?.reason || '').trim()

  if (!itemId) {
    throw new HttpsError('invalid-argument', 'Target itemId is required.')
  }

  let verifierUser = null
  let verifierRole = 'admin'

  // If caller is already admin/superadmin and verifies themselves
  if (['admin', 'superadmin'].includes(callerAccess.role) && (!adminEmail || adminEmail === callerEmail)) {
    verifierUser = {
      uid: request.auth.uid,
      email: callerEmail,
      name: callerEmail.split('@')[0],
      role: callerAccess.role,
      method: 'admin-session',
    }
    verifierRole = callerAccess.role
  } else {
    // Caller is staff (or admin verifying with different admin credential)
    if (!adminEmail || !adminPassword) {
      throw new HttpsError('invalid-argument', 'Admin email and admin password are required for verification.')
    }

    const adminAccess = await getRoleFromEmail(adminEmail, {})
    if (!['admin', 'superadmin'].includes(adminAccess.role)) {
      throw new HttpsError('permission-denied', 'The provided email does not belong to an authorized administrator.')
    }

    const apiKey = getWebApiKey()
    if (!apiKey) {
      throw new HttpsError('failed-precondition', 'Server API key configuration is missing.')
    }

    const signInResponse = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: adminEmail,
          password: adminPassword,
          returnSecureToken: true,
        }),
      },
    )

    const signInData = await signInResponse.json()
    if (!signInResponse.ok || signInData?.error) {
      throw new HttpsError('permission-denied', 'Incorrect administrator credentials. Verification failed.')
    }

    verifierUser = {
      uid: signInData.localId || '',
      email: adminEmail,
      name: adminEmail.split('@')[0],
      role: adminAccess.role,
      method: 'admin-password-on-site',
    }
    verifierRole = adminAccess.role
  }

  const db = admin.firestore()
  const itemRef = db.collection('inventory').doc(itemId)
  const itemSnap = await itemRef.get()

  if (!itemSnap.exists) {
    throw new HttpsError('not-found', 'Inventory product not found.')
  }

  const itemData = itemSnap.data() || {}
  const currentName = String(itemData.name || 'Unnamed Product')
  const timestamp = admin.firestore.FieldValue.serverTimestamp()
  const performedBy = buildActorFromRequest(request, callerAccess.role)

  if (actionType === 'delete') {
    const batch = db.batch()
    const archiveRef = db.collection('deleteArchived').doc(itemId)
    batch.set(archiveRef, {
      ...itemData,
      recordType: 'inventory',
      deletedAt: timestamp,
      deletedBy: performedBy.name || performedBy.email,
      verifiedBy: verifierUser,
      verifiedAt: timestamp,
      deletionReason: reason || verificationNote || 'On-site verified deletion',
      updatedAt: timestamp,
    })
    batch.delete(itemRef)
    await batch.commit()

    await recordAuditLog(db, {
      module: 'Inventory',
      action: 'PRODUCT_DELETED',
      summary: `On-site verified deletion of "${currentName}" (moved to archive)`,
      targetType: 'inventory',
      targetId: itemId,
      targetName: currentName,
      previousData: { name: currentName, stock: itemData.stock ?? 0, price: itemData.price ?? 0 },
      newData: null,
      performedBy,
      verifiedBy: verifierUser,
      metadata: { verificationNote, reason },
    })

    return { ok: true, message: `Product "${currentName}" verified and moved to archive.` }
  }

  // Update flow
  const resolvedName = updates.name ? String(updates.name).trim() : currentName
  const batch = db.batch()
  batch.update(itemRef, {
    ...updates,
    name: resolvedName,
    lastVerifiedBy: verifierUser,
    lastVerifiedAt: timestamp,
    updatedAt: timestamp,
  })
  await batch.commit()

  await recordAuditLog(db, {
    module: 'Inventory',
    action: resolvedName !== currentName ? 'PRODUCT_RENAMED' : 'PRODUCT_UPDATED',
    summary:
      resolvedName !== currentName
        ? `On-site verified rename of "${currentName}" to "${resolvedName}"`
        : `On-site verified update of "${resolvedName}"`,
    targetType: 'inventory',
    targetId: itemId,
    targetName: resolvedName,
    previousData: { name: currentName, price: itemData.price ?? 0, stock: itemData.stock ?? 0 },
    newData: { name: resolvedName, ...(updates || {}) },
    performedBy,
    verifiedBy: verifierUser,
    metadata: { verificationNote, reason },
  })

  return { ok: true, message: `Product "${resolvedName}" verified and updated successfully.` }
})

exports.recordDamagedReturn = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to record returned or damaged products.')
  }

  const requesterEmail = String(request.auth.token.email || '').trim().toLowerCase()
  const callerAccess = await getRoleFromEmail(requesterEmail, {
    uid: request.auth.uid,
    claimsRole: request.auth.token.role,
  })

  const payload = request.data || {}
  const itemId = String(payload.itemId || '').trim()
  const itemName = String(payload.itemName || 'Unnamed Product').trim()
  const quantity = Math.max(1, Number(payload.quantity || 1))
  const condition = String(payload.condition || 'Customer Return - Defective').trim()
  const disposition = String(payload.disposition || 'Pending Inspection').trim()
  const customerOrSource = String(payload.customerOrSource || 'Direct Store Return').trim()
  const reason = String(payload.reason || '').trim()
  const deductStock = Boolean(payload.deductStock)

  const db = admin.firestore()
  const returnId = `RET-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
  const timestamp = admin.firestore.FieldValue.serverTimestamp()

  const returnRecord = {
    returnId,
    itemId,
    itemName,
    itemSku: String(payload.itemSku || ''),
    itemCategory: String(payload.itemCategory || ''),
    quantity,
    condition,
    disposition,
    customerOrSource,
    reason,
    deductedFromStock: deductStock,
    reportedBy: {
      uid: request.auth.uid || '',
      email: requesterEmail,
      name: request.auth.token.name || requesterEmail.split('@')[0] || 'Staff Personnel',
      role: callerAccess.role || 'staff personnel',
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  const batch = db.batch()
  const returnDocRef = db.collection('damagedReturns').doc(returnId)
  batch.set(returnDocRef, returnRecord)

  if (deductStock && itemId) {
    const itemRef = db.collection('inventory').doc(itemId)
    const itemSnap = await itemRef.get()
    if (itemSnap.exists) {
      const currentStock = Number(itemSnap.data()?.stock ?? itemSnap.data()?.quantity ?? 0)
      const nextStock = Math.max(0, currentStock - quantity)
      batch.update(itemRef, {
        stock: nextStock,
        quantity: nextStock,
        updatedAt: timestamp,
      })
    }
  }

  await batch.commit()

  await recordAuditLog(db, {
    module: 'Inventory',
    action: 'DAMAGED_RETURN_RECORDED',
    summary: `Recorded ${quantity} returned/damaged units of "${itemName}" (${condition})`,
    targetType: 'damagedReturn',
    targetId: returnId,
    targetName: itemName,
    amount: null,
    performedBy: {
      uid: request.auth.uid,
      email: requesterEmail,
      name: requesterEmail.split('@')[0],
      role: callerAccess.role || 'staff personnel',
    },
    verifiedBy: null,
    metadata: { returnId, itemId, condition, disposition, quantity, deductStock },
  })

  return {
    ok: true,
    returnId,
    message: `Recorded returned/damaged item ${returnId} successfully.`,
  }
})

exports.api = onRequest((request, response) => {
  logger.info('Bykelink Motor Inc system function called', {
    structuredData: true,
  })

  response.json({
    ok: true,
    message: 'Bykelink Motor Inc system Firebase Cloud Function is running.',
    timestamp: new Date().toISOString(),
  })
})

exports.syncUserAccess = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to sync access.')
  }

  const uid = request.auth.uid
  const email = request.auth.token.email || request.data?.email || ''

  if (!email) {
    throw new HttpsError('failed-precondition', 'No email is associated with this account.')
  }

  const requestedRole = String(request.data?.requestedRole || 'customer').toLowerCase()
  const accessRecord = await getRoleFromEmail(email, {
    uid,
    claimsRole: request.auth.token.role,
  }).catch((error) => {
    logger.warn('Unable to resolve role from Firestore; using a safe fallback profile.', {
      email,
      uid,
      details: error.message,
      structuredData: true,
    })

    return buildResolvedAccessProfile(
      [
        request.auth.token.role
          ? {
            role: request.auth.token.role,
            dashboardPath: getDashboardPath(request.auth.token.role),
            source: 'auth-claim-fallback',
          }
          : null,
      ],
      'customer',
    )
  })
  const role = accessRecord.role
  const dashboardPath = accessRecord.dashboardPath || getDashboardPath(role)
  const isPrivileged = role !== 'customer'
  const shouldSyncUsersCollection = !isAuthorizedCollectionSource(accessRecord.source)
  const userRef = shouldSyncUsersCollection ? admin.firestore().collection('users').doc(uid) : null
  let existingUserData = {}

  if (userRef) {
    try {
      const existingUserSnapshot = await userRef.get()
      existingUserData = existingUserSnapshot.data() || {}
    } catch (error) {
      logger.warn('Unable to read the user profile from Firestore during syncUserAccess.', {
        uid,
        email,
        details: error.message,
        structuredData: true,
      })
    }
  }

  const mustChangePassword = Boolean(existingUserData.mustChangePassword || request.auth.token.mustChangePassword)
  const authorized =
    requestedRole === 'customer' ||
    (rolePriority[role] ?? 0) >= (rolePriority[requestedRole] ?? Number.MAX_SAFE_INTEGER)

  try {
    await admin.auth().setCustomUserClaims(uid, {
      role,
      isPrivileged,
      dashboardPath: dashboardPath || '',
      mustChangePassword,
    })
  } catch (error) {
    logger.warn('Unable to set custom claims for syncUserAccess; continuing without claims.', {
      uid,
      email,
      details: error.message,
      structuredData: true,
    })
  }

  if (userRef) {
    try {
      await userRef.set(
        {
          email: email.toLowerCase(),
          displayName: request.auth.token.name || null,
          role,
          isPrivileged,
          dashboardPath,
          mustChangePassword,
          firstLoginRequired: Boolean(existingUserData.firstLoginRequired || mustChangePassword),
          lastRequestedRole: requestedRole,
          provider: request.auth.token.firebase?.sign_in_provider || 'password',
          accessSource: accessRecord.source,
          lastLoginAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      )
    } catch (error) {
      logger.warn('Unable to persist the synced user profile to Firestore; returning access data without blocking sign-in.', {
        uid,
        email,
        details: error.message,
        structuredData: true,
      })
    }
  } else if (isPrivileged) {
    try {
      await deleteMatchingUserDocs({ uid, email })
    } catch (error) {
      logger.warn('Unable to remove stale customer user documents for a privileged account during syncUserAccess.', {
        uid,
        email,
        details: error.message,
        structuredData: true,
      })
    }
  }

  logger.info('Bykelink access sync complete', {
    uid,
    email,
    role,
    requestedRole,
    authorized,
    dashboardPath,
    mustChangePassword,
    source: accessRecord.source,
    structuredData: true,
  })

  return {
    ok: true,
    role,
    requestedRole,
    authorized,
    isPrivileged,
    dashboardPath,
    mustChangePassword,
    source: accessRecord.source,
  }
})

exports.createOperatorAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to invite an operator.')
  }

  const inviterEmail = String(request.auth.token.email || '').trim().toLowerCase()
  const inviterAccess = await getRoleFromEmail(inviterEmail, {
    uid: request.auth.uid,
    claimsRole: request.auth.token.role,
  })

  const fullName = String(request.data?.fullName || '').trim()
  const email = String(request.data?.email || '').trim().toLowerCase()
  const role = normalizeRole(request.data?.role || 'admin')
  const status = String(request.data?.status || 'active').trim().toLowerCase()
  const temporaryPassword = DEFAULT_OPERATOR_PASSWORD

  if (!fullName) {
    throw new HttpsError('invalid-argument', 'Enter the operator full name first.')
  }

  if (!email || !email.includes('@')) {
    throw new HttpsError('invalid-argument', 'Enter a valid operator email address.')
  }

  const ROLE_HIERARCHY = {
    superadmin: ['superadmin', 'admin', ...personnelRoles],
    admin: personnelRoles,
  }

  // Already normalized earlier
  const allowedRoles = ROLE_HIERARCHY[inviterAccess.role] || []

  if (!allowedRoles.includes(role)) {
    throw new HttpsError(
      'permission-denied',
      inviterAccess.role === 'admin'
        ? 'Admin can only create non-admin operator accounts.'
        : 'You are not allowed to assign this role.'
    )
  }

  const inviterCanCreateRole = allowedRoles.includes(role)

  if (!inviterCanCreateRole) {
    throw new HttpsError(
      'permission-denied',
      inviterAccess.role === 'admin'
        ? 'Admin can only create non-admin operator accounts.'
        : 'Only superadmin can create admin operator accounts.',
    )
  }

  if (temporaryPassword.length < 8) {
    throw new HttpsError(
      'invalid-argument',
      'Temporary password must be at least 8 characters long.',
    )
  }

  const active = status !== 'inactive'
  const isAdminRole = role === 'admin'
  const isPersonnelRole = personnelRoles.includes(role)
  const accessLevel = isAdminRole ? 'admin' : 'staff'
  const targetCollection = isAdminRole ? 'authorizedAdmin' : 'authorizedPersonnel'
  const alternateCollection = isAdminRole ? 'authorizedPersonnel' : 'authorizedAdmin'
  const dashboardPath = getDashboardPath(role)

  // Define default accessible sections based on role
  const defaultAccessibleSections = {
    superadmin: ['dashboard', 'user-management', 'inventory', 'services', 'bookings', 'messages', 'reports', 'settings'],
    admin: ['dashboard', 'user-management', 'inventory', 'services', 'bookings', 'messages', 'reports', 'settings'],
    'staff personnel': ['dashboard', 'inventory', 'services', 'settings'],
    'mechanics personnel': ['dashboard', 'services', 'messages', 'settings'],
  }

  const accessibleSections = request.data?.menuAccess || defaultAccessibleSections[role] || []
  const authApi = admin.auth()
  let operatorUser

  try {
    operatorUser = await authApi.getUserByEmail(email)
    await authApi.updateUser(operatorUser.uid, {
      displayName: fullName,
      password: temporaryPassword,
      disabled: !active,
      emailVerified: false,
    })
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      operatorUser = await authApi.createUser({
        email,
        password: temporaryPassword,
        displayName: fullName,
        emailVerified: false,
        disabled: !active,
      })
    } else {
      throw new HttpsError('internal', `Unable to create the operator account. ${error.message}`)
    }
  }

  try {
    await authApi.setCustomUserClaims(operatorUser.uid, {
      role,
      accessLevel,
      isPrivileged: true,
      dashboardPath: dashboardPath || '',
      mustChangePassword: true,
    })
  } catch (error) {
    logger.warn('Unable to set custom claims for createOperatorAccount.', {
      uid: operatorUser.uid,
      email,
      details: error.message,
      structuredData: true,
    })
  }

  try {
    await Promise.all([
      admin.firestore().collection(targetCollection).doc(email).set(
        {
          email,
          fullName,
          role,
          accessLevel,
          personnelRole: isPersonnelRole ? role : '',
          status,
          active,
          dashboardPath,
          accessibleSections,
          mustChangePassword: true,
          firstLoginRequired: true,
          temporaryPassword,
          invitedBy: inviterEmail,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      ),
      admin.firestore().collection(alternateCollection).doc(email).delete(),
    ])
  } catch (error) {
    logger.warn('Unable to persist operator access records from Cloud Functions. The client will need deployed Firestore rules for direct writes.', {
      email,
      role,
      details: error.message,
      structuredData: true,
    })
  }

  const emailResult = await sendFirebaseVerificationEmail({
    email,
    temporaryPassword,
  })

  if (emailResult.sent) {
    try {
      await Promise.all([
        admin.firestore().collection(targetCollection).doc(email).set(
          {
            verificationEmailSentAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        ),
      ])
    } catch (error) {
      logger.warn('Unable to persist the verification email timestamp for the invited operator.', {
        email,
        uid: operatorUser.uid,
        details: error.message,
        structuredData: true,
      })
    }
  }

  logger.info('Operator invite created successfully.', {
    email,
    role,
    accessLevel,
    emailSent: emailResult.sent,
    targetCollection,
    structuredData: true,
  })

  await recordAuditLog(admin.firestore(), {
    module: 'User Management',
    action: 'USER_CREATED',
    summary: `Created ${role} operator account for ${fullName} (${email})`,
    targetType: 'user',
    targetId: email,
    targetName: fullName,
    newData: { email, role, status, active },
    performedBy: buildActorFromRequest(request, inviterAccess.role),
  })

  return {
    ok: true,
    email,
    role,
    accessLevel,
    emailSent: emailResult.sent,
    message: emailResult.sent
      ? `Firebase verification email sent to ${email}. Please use the newest verification email link.`
      : `Operator created for ${email}. Firebase verification email could not be sent automatically.`,
  }
})

exports.archiveOperatorAccount = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to archive an operator.')
  }

  const requesterEmail = String(request.auth.token.email || '').trim().toLowerCase()

  try {
    var requesterAccess = await getRoleFromEmail(requesterEmail, {
      uid: request.auth.uid,
      claimsRole: request.auth.token.role,
    })
  } catch (error) {
    logger.error('Unable to resolve requester access in archiveOperatorAccount', {
      email: requesterEmail,
      details: error.message,
      structuredData: true,
    })
    throw new HttpsError('internal', `Unable to resolve your access permissions. ${error.message}`)
  }

  if (!['admin', 'superadmin'].includes(requesterAccess.role)) {
    throw new HttpsError('permission-denied', 'Only admin or superadmin can archive user accounts.')
  }

  const email = String(request.data?.email || '').trim().toLowerCase()
  const fullName = String(request.data?.fullName || '').trim()
  const role = normalizeRole(request.data?.role || 'customer')

  if (!email || !email.includes('@')) {
    throw new HttpsError('invalid-argument', 'Enter a valid email address to archive.')
  }

  if (requesterAccess.role === 'admin' && ['admin', 'superadmin'].includes(role)) {
    throw new HttpsError('permission-denied', 'Admin can archive non-admin accounts only.')
  }

  const accessCollection = getAuthorizedCollectionNameForRole(role)
  const archiveRef = admin.firestore().collection('deleteArchived').doc(email)
  const authApi = admin.auth()
  let authUser = null
  let accessRecord = {}

  try {
    if (accessCollection) {
      const accessSnapshot = await admin.firestore().collection(accessCollection).doc(email).get()
      accessRecord = accessSnapshot.data() || {}
    }
  } catch (error) {
    logger.warn('Unable to read the active access record before archiving.', {
      email,
      role,
      details: error.message,
      structuredData: true,
    })
  }

  try {
    authUser = await authApi.getUserByEmail(email)
    await authApi.updateUser(authUser.uid, { disabled: true })
  } catch (error) {
    if (error.code !== 'auth/user-not-found') {
      throw new HttpsError('internal', `Unable to archive the user account. ${error.message}`)
    }
  }

  try {
    await archiveRef.set(
      {
        email,
        fullName: fullName || accessRecord.fullName || authUser?.displayName || '',
        role,
        accessLevel: accessRecord.accessLevel || (role === 'admin' ? 'admin' : 'staff'),
        personnelRole: personnelRoles.includes(role) ? role : '',
        dashboardPath: getDashboardPath(role),
        archivedBy: requesterEmail,
        archivedByRole: requesterAccess.role,
        archivedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'archived',
        active: false,
        authUid: authUser?.uid || '',
        originalCollection: accessCollection || 'users',
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    await Promise.all([
      admin.firestore().collection('authorizedSuperadmin').doc(email).delete().catch(() => undefined),
      admin.firestore().collection('authorizedAdmin').doc(email).delete().catch(() => undefined),
      admin.firestore().collection('authorizedPersonnel').doc(email).delete().catch(() => undefined),
      deleteMatchingUserDocs({ uid: authUser?.uid || '', email }),
    ])
  } catch (error) {
    throw new HttpsError('internal', `Unable to move the user into Delete Archived. ${error.message}`)
  }

  await recordAuditLog(admin.firestore(), {
    module: 'User Management',
    action: 'USER_ARCHIVED',
    summary: `Archived ${role} account for ${fullName || email} (${email})`,
    targetType: 'user',
    targetId: email,
    targetName: fullName || email,
    previousData: { role, status: accessRecord.status || 'active' },
    newData: { status: 'archived' },
    performedBy: buildActorFromRequest(request, requesterAccess.role),
  })

  return {
    ok: true,
    email,
    message: `${email} moved to Delete Archived successfully.`,
  }
})

exports.deleteArchivedUserPermanently = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to permanently delete an archived user.')
  }

  const requesterEmail = String(request.auth.token.email || '').trim().toLowerCase()
  const requesterAccess = await getRoleFromEmail(requesterEmail, {
    uid: request.auth.uid,
    claimsRole: request.auth.token.role,
  })

  if (requesterAccess.role !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Only superadmin can permanently delete archived users.')
  }

  const email = String(request.data?.email || '').trim().toLowerCase()

  if (!email || !email.includes('@')) {
    throw new HttpsError('invalid-argument', 'Enter a valid archived user email address.')
  }

  const archiveRef = admin.firestore().collection('deleteArchived').doc(email)
  const archiveSnapshot = await archiveRef.get().catch(() => null)
  const archivedData = archiveSnapshot?.data?.() || {}
  const authApi = admin.auth()
  let authUid = String(archivedData.authUid || '').trim()

  if (!authUid) {
    try {
      const authUser = await authApi.getUserByEmail(email)
      authUid = authUser.uid
    } catch (error) {
      if (error.code !== 'auth/user-not-found') {
        throw new HttpsError('internal', `Unable to inspect the archived auth account. ${error.message}`)
      }
    }
  }

  try {
    if (authUid) {
      try {
        await authApi.deleteUser(authUid)
      } catch (authError) {
        // If user doesn't exist in Auth, that's okay - just continue with DB cleanup
        if (authError.code !== 'auth/user-not-found') {
          throw authError
        }
        logger.warn(`Auth user ${authUid} not found for email ${email}, continuing with DB cleanup`)
      }
    }

    await Promise.all([
      archiveRef.delete().catch(() => undefined),
      admin.firestore().collection('authorizedSuperadmin').doc(email).delete().catch(() => undefined),
      admin.firestore().collection('authorizedAdmin').doc(email).delete().catch(() => undefined),
      admin.firestore().collection('authorizedPersonnel').doc(email).delete().catch(() => undefined),
      deleteMatchingUserDocs({ uid: authUid, email }),
    ])
  } catch (error) {
    throw new HttpsError('internal', `Unable to permanently delete the archived user. ${error.message}`)
  }

  await recordAuditLog(admin.firestore(), {
    module: 'User Management',
    action: 'USER_PERMANENTLY_DELETED',
    summary: `Permanently deleted archived user ${archivedData.fullName || email} (${email})`,
    targetType: 'user',
    targetId: email,
    targetName: archivedData.fullName || email,
    previousData: { email, role: archivedData.role || 'unknown' },
    performedBy: buildActorFromRequest(request, requesterAccess.role),
  })

  return {
    ok: true,
    email,
    message: `${email} was permanently deleted from Delete Archived.`,
  }
})

exports.cleanupPrivilegedUserDuplicates = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to clean up duplicated users.')
  }

  const requesterEmail = String(request.auth.token.email || '').trim().toLowerCase()
  const requesterAccess = await getRoleFromEmail(requesterEmail, {
    uid: request.auth.uid,
    claimsRole: request.auth.token.role,
  })

  if (!['admin', 'superadmin'].includes(requesterAccess.role)) {
    throw new HttpsError('permission-denied', 'Only admin or superadmin can clean up duplicated users.')
  }

  const targetCollections = ['authorizedSuperadmin', 'authorizedAdmin', 'authorizedPersonnel']
  const normalizedEmails = new Set()

  for (const collectionName of targetCollections) {
    const snapshot = await admin.firestore().collection(collectionName).get()

    snapshot.forEach((docSnapshot) => {
      const data = docSnapshot.data() || {}
      const emailCandidates = [
        docSnapshot.id,
        data.email,
        data.emailAddress,
        data.authorizedEmail,
        data.userEmail,
      ]

      emailCandidates.forEach((value) => {
        const normalizedEmail = String(value || '').trim().toLowerCase()

        if (normalizedEmail && normalizedEmail.includes('@')) {
          normalizedEmails.add(normalizedEmail)
        }
      })
    })
  }

  const deleted = []
  const skipped = []

  for (const email of normalizedEmails) {
    try {
      let authUid = ''

      try {
        const authUser = await admin.auth().getUserByEmail(email)
        authUid = authUser.uid || ''
      } catch (error) {
        if (error.code !== 'auth/user-not-found') {
          throw error
        }
      }

      const usersSnapshot = await admin
        .firestore()
        .collection('users')
        .where('email', '==', email)
        .get()

      const directUserDoc =
        authUid ? await admin.firestore().collection('users').doc(authUid).get().catch(() => null) : null
      const hasMatchingUserDoc = Boolean((directUserDoc && directUserDoc.exists) || !usersSnapshot.empty)

      if (!hasMatchingUserDoc) {
        skipped.push(email)
        continue
      }

      await deleteMatchingUserDocs({ uid: authUid, email })
      deleted.push(email)
    } catch (error) {
      logger.warn('Unable to clean up a duplicated privileged user.', {
        email,
        details: error.message,
        structuredData: true,
      })
    }
  }

  return {
    ok: true,
    scannedCount: normalizedEmails.size,
    deletedCount: deleted.length,
    skippedCount: skipped.length,
    deleted,
    skipped,
  }
})

exports.completeFirstLoginSetup = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to complete first-time setup.')
  }

  const uid = request.auth.uid
  const email = String(request.auth.token.email || '').trim().toLowerCase()
  const accessRecord = await getRoleFromEmail(email, {
    uid,
    claimsRole: request.auth.token.role,
  }).catch((error) => {
    logger.warn('Unable to resolve access during first-login completion; falling back to auth claims.', {
      uid,
      email,
      details: error.message,
      structuredData: true,
    })

    return buildResolvedAccessProfile(
      [
        request.auth.token.role
          ? {
            role: request.auth.token.role,
            dashboardPath: getDashboardPath(request.auth.token.role),
            source: 'auth-claim-fallback',
          }
          : null,
      ],
      'customer',
    )
  })
  const role = accessRecord.role
  const dashboardPath = accessRecord.dashboardPath || getDashboardPath(role)
  const shouldSyncUsersCollection = !isAuthorizedCollectionSource(accessRecord.source)
  const accessCollectionsToSync = email
    ? [
      accessRecord.source === 'authorizedSuperadmin' || role === 'superadmin'
        ? 'authorizedSuperadmin'
        : role === 'admin'
          ? 'authorizedAdmin'
          : personnelRoles.includes(role) || role === 'staff'
            ? 'authorizedPersonnel'
            : null,
    ].filter(Boolean)
    : []

  try {
    await admin.auth().setCustomUserClaims(uid, {
      role,
      isPrivileged: role !== 'customer',
      dashboardPath: dashboardPath || '',
      mustChangePassword: false,
    })
  } catch (error) {
    logger.warn('Unable to clear mustChangePassword claim during first-login completion.', {
      uid,
      email,
      details: error.message,
      structuredData: true,
    })
  }

  let firestoreSyncCompleted = false

  try {
    // Get accessible sections from authorized collections
    let accessibleSections = []
    for (const collectionName of accessCollectionsToSync) {
      const doc = await admin.firestore().collection(collectionName).doc(email).get()
      if (doc.exists) {
        const data = doc.data() || {}
        if (Array.isArray(data.accessibleSections)) {
          accessibleSections = data.accessibleSections
          break
        }
      }
    }

    await Promise.all([
      ...(shouldSyncUsersCollection
        ? [
          admin.firestore().collection('users').doc(uid).set(
            {
              mustChangePassword: false,
              firstLoginRequired: false,
              temporaryPassword: '',
              accessibleSections,
              emailVerified: Boolean(request.auth.token.email_verified),
              passwordChangedAt: admin.firestore.FieldValue.serverTimestamp(),
              updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            },
            { merge: true },
          ),
        ]
        : []),
      ...accessCollectionsToSync.map((collectionName) =>
        admin.firestore().collection(collectionName).doc(email).set(
          {
            mustChangePassword: false,
            firstLoginRequired: false,
            temporaryPassword: '',
            passwordChangedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        ),
      ),
    ])

    if (!shouldSyncUsersCollection && role !== 'customer') {
      await deleteMatchingUserDocs({ uid, email })
    }

    firestoreSyncCompleted = true
  } catch (error) {
    logger.warn('Unable to persist first-login completion flags to Firestore; activation will continue using auth claims.', {
      uid,
      email,
      role,
      details: error.message,
      structuredData: true,
    })
  }

  return {
    ok: true,
    role,
    dashboardPath,
    firestoreSyncCompleted,
  }
})

exports.updateUserProfile = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to update your profile.')
  }

  const uid = request.auth.uid
  const email = String(request.auth.token.email || '').trim().toLowerCase()
  const phone = String(request.data?.phone || '').trim()
  const address = String(request.data?.address || '').trim()
  const avatar = request.data?.avatar || null

  logger.info('updateUserProfile called', {
    uid,
    email,
    phone,
    address: address ? address.substring(0, 50) + '...' : 'empty',
    avatarProvided: !!avatar,
    structuredData: true,
  })

  if (!uid) {
    throw new HttpsError('invalid-argument', 'User ID is invalid.')
  }

  if (!email) {
    throw new HttpsError('invalid-argument', 'Email is required.')
  }

  if (!phone) {
    throw new HttpsError('invalid-argument', 'Contact number is required.')
  }

  if (!address) {
    throw new HttpsError('invalid-argument', 'Address is required.')
  }

  // Validate phone format
  if (!/^09\d{9}$/.test(phone)) {
    throw new HttpsError('invalid-argument', 'Phone must be 11 digits starting with 09.')
  }

  // Validate address has all parts
  const addressParts = address.split('|')
  if (addressParts.length !== 4 || !addressParts.every(part => part.trim())) {
    throw new HttpsError('invalid-argument', 'Address must have all required parts: purok, barangay, city, province.')
  }

  try {
    logger.info('Starting profile update', {
      uid,
      email,
      hasPhone: !!phone,
      hasAddress: !!address,
      hasAvatar: !!avatar,
      structuredData: true,
    })

    const db = admin.firestore()
    const userRef = db.collection('users').doc(uid)

    const updateData = {
      email,
      phone,
      address,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }

    // Only update avatar if provided and is a valid URL
    if (avatar && avatar.startsWith('http')) {
      updateData.avatar = avatar
      logger.info('Avatar included in update', {
        uid,
        avatarUrlLength: avatar.length,
        structuredData: true,
      })
    }

    logger.info('Attempting Firestore write', {
      uid,
      updateDataKeys: Object.keys(updateData),
      phone,
      addressLength: address.length,
      structuredData: true,
    })

    await userRef.set(updateData, { merge: true })

    logger.info('Firestore write completed successfully', {
      uid,
      email,
      structuredData: true,
    })

    return {
      ok: true,
      message: 'Profile updated successfully.',
    }
  } catch (error) {
    logger.error('Error updating user profile', {
      uid,
      email,
      errorCode: error.code,
      errorMessage: error.message,
      errorName: error.name,
      stack: error.stack?.substring(0, 200),
      structuredData: true,
    })

    // Return specific error if it's an HttpsError, otherwise wrap it
    if (error instanceof HttpsError) {
      throw error
    }

    throw new HttpsError('internal', `Failed to update profile: ${error.message}`)
  }
})

exports.updateUserPassword = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to update your password.')
  }

  const uid = request.auth.uid
  const email = String(request.auth.token.email || '').trim().toLowerCase()
  const currentPassword = String(request.data?.currentPassword || '').trim()
  const newPassword = String(request.data?.newPassword || '').trim()
  const provider = request.auth.token.firebase?.sign_in_provider || 'password'

  logger.info('updateUserPassword called', {
    uid,
    email,
    provider,
    hasCurrentPassword: !!currentPassword,
    passwordLength: newPassword.length,
    structuredData: true,
  })

  if (!newPassword) {
    throw new HttpsError('invalid-argument', 'New password is required.')
  }

  if (newPassword.length < 8) {
    throw new HttpsError('invalid-argument', 'Password must be at least 8 characters long.')
  }

  // Check password requirements
  const passwordRequirements = [
    /.{8,}/,
    /[A-Z]/,
    /[a-z]/,
    /[0-9]/,
    /[!@#$%^&*()_+\-={}|:;"'<>,.?]/,
  ]

  const meetsRequirements = passwordRequirements.every((regex) => regex.test(newPassword))

  if (!meetsRequirements) {
    throw new HttpsError(
      'invalid-argument',
      'Password must contain uppercase, lowercase, number, and special character.',
    )
  }

  try {
    // If user previously signed in with Google, verify current password is not required
    if (provider === 'google.com' || !currentPassword) {
      logger.info('Setting password for first time (Google provider or no current password)', {
        uid,
        provider,
        structuredData: true,
      })
      // User is setting password for the first time (Google sign-in)
      await admin.auth().updateUser(uid, {
        password: newPassword,
      })
    } else {
      // User already has a password - verify current password
      const apiKey = getWebApiKey()

      if (!apiKey) {
        throw new Error('Firebase Web API Key is not configured.')
      }

      logger.info('Verifying current password', {
        uid,
        structuredData: true,
      })

      const verifyResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password: currentPassword,
            returnSecureToken: true,
          }),
        },
      )

      const verifyData = await verifyResponse.json().catch(() => ({}))

      if (!verifyResponse.ok) {
        logger.warn('Current password verification failed', {
          uid,
          statusCode: verifyResponse.status,
          errorMessage: verifyData?.error?.message,
          structuredData: true,
        })
        throw new HttpsError('unauthenticated', 'Current password is incorrect.')
      }

      logger.info('Current password verified successfully', {
        uid,
        structuredData: true,
      })

      // Password verified, now update to new password
      await admin.auth().updateUser(uid, {
        password: newPassword,
      })
    }

    // Update Firestore to mark that user has a password
    logger.info('Updating Firestore hasPassword flag', {
      uid,
      structuredData: true,
    })

    await admin.firestore().collection('users').doc(uid).set(
      {
        hasPassword: true,
        passwordChangedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    )

    logger.info('User password updated successfully.', {
      uid,
      email,
      structuredData: true,
    })

    return {
      ok: true,
      message: 'Password updated successfully.',
    }
  } catch (error) {
    if (error.code && error.code.startsWith('http/')) {
      // Already an HttpsError
      throw error
    }

    logger.error('Error updating user password.', {
      uid,
      email,
      errorCode: error.code,
      errorMessage: error.message,
      structuredData: true,
    })

    throw new HttpsError('internal', `Failed to update password. ${error.message}`)
  }
})

exports.updateUserAccess = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to update your access.')
  }

  const { email, role, status, accessibleSections, fullName } = request.data;

  if (!email || !fullName || !role) {
    throw new HttpsError('invalid-argument', 'Missing required fields.');
  }

  try {
    const db = admin.firestore();
    const userRef = db.collection('users').doc(email.trim().toLowerCase());

    const updateData = {
      fullName,
      role,
      status,
      accessibleSections,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await userRef.set(updateData, { merge: true });
    await recordAuditLog(db, {
      module: 'User Management',
      action: 'USER_ACCESS_UPDATED',
      summary: `Updated access for ${fullName} (${email}) — Role: ${role}, Status: ${status}`,
      targetType: 'user',
      targetId: email.trim().toLowerCase(),
      targetName: fullName,
      newData: { role, status, accessibleSections },
      performedBy: buildActorFromRequest(request),
    })
    return { ok: true, message: 'Access updated successfully.' };
  } catch (error) {
    throw new HttpsError('internal', `Failed to update access. ${error.message}`);
  }
});

exports.checkEmailExists = onCall(async (request) => {
  // No authentication required - this is for the forgot password page
  const email = String(request.data?.email || '').trim().toLowerCase()

  if (!email || !email.includes('@')) {
    throw new HttpsError('invalid-argument', 'A valid email address is required.')
  }

  try {
    // Check if email exists in Firebase Auth
    let authMethods = []
    try {
      authMethods = await admin.auth().fetchSignInMethodsForEmail(email)
    } catch (error) {
      if (error.code !== 'auth/user-not-found') {
        logger.warn('Error checking Firebase Auth for email', {
          email,
          errorCode: error.code,
          errorMessage: error.message,
          structuredData: true,
        })
      }
    }

    // If email exists in Firebase Auth, return immediately
    if (authMethods && authMethods.length > 0) {
      logger.info('Email found in Firebase Auth', {
        email,
        methods: authMethods,
        structuredData: true,
      })
      return {
        found: true,
        collection: 'auth',
        authMethods: authMethods,
      }
    }

    // Check if email exists in any of the Firestore collections
    const collectionsToCheck = ['users', 'authorizedAdmin', 'authorizedSuperadmin', 'authorizedPersonnel']
    const db = admin.firestore()

    for (const collectionName of collectionsToCheck) {
      try {
        const snapshot = await db
          .collection(collectionName)
          .where('email', '==', email)
          .limit(1)
          .get()

        if (!snapshot.empty) {
          const userData = snapshot.docs[0].data()
          // If authMethods is empty (no Firebase Auth entry), get providers from Firestore document
          let resolvedAuthMethods = authMethods
          if (!authMethods || authMethods.length === 0) {
            resolvedAuthMethods = userData.providers || []
          }

          logger.info('Email found in Firestore', {
            email,
            collection: collectionName,
            providersFromDoc: userData.providers || [],
            structuredData: true,
          })
          return {
            found: true,
            collection: collectionName,
            authMethods: resolvedAuthMethods,
          }
        }
      } catch (error) {
        logger.warn('Error checking Firestore collection', {
          email,
          collection: collectionName,
          errorCode: error.code,
          errorMessage: error.message,
          structuredData: true,
        })
      }
    }

    // Email not found anywhere
    logger.info('Email not found in any collection', {
      email,
      structuredData: true,
    })
    return {
      found: false,
      collection: null,
      authMethods: [],
    }
  } catch (error) {
    logger.error('Unexpected error in checkEmailExists', {
      email,
      errorCode: error.code,
      errorMessage: error.message,
      structuredData: true,
    })
    throw new HttpsError('internal', `Unable to check email: ${error.message}`)
  }
})

// Reset user password to default
exports.resetUserPassword = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'You must be signed in to reset a user password.')
  }

  const requesterEmail = String(request.auth.token.email || '').trim().toLowerCase()

  try {
    var requesterAccess = await getRoleFromEmail(requesterEmail, {
      uid: request.auth.uid,
      claimsRole: request.auth.token.role,
    })
  } catch (error) {
    logger.error('Unable to resolve requester access in resetUserPassword', {
      email: requesterEmail,
      details: error.message,
      structuredData: true,
    })
    throw new HttpsError('internal', `Unable to resolve your access permissions. ${error.message}`)
  }

  if (!['admin', 'superadmin'].includes(requesterAccess.role)) {
    throw new HttpsError('permission-denied', 'Only admin or superadmin can reset user passwords.')
  }

  const email = String(request.data?.email || '').trim().toLowerCase()
  const newPassword = request.data?.newPassword || DEFAULT_OPERATOR_PASSWORD

  if (!email || !email.includes('@')) {
    throw new HttpsError('invalid-argument', 'Enter a valid email address to reset password.')
  }

  // Get the target user's role
  let targetUserRole = 'customer'
  try {
    const targetAccess = await getRoleFromEmail(email, {})
    targetUserRole = targetAccess.role
  } catch (error) {
    logger.warn('Unable to resolve target user role', {
      email,
      details: error.message,
      structuredData: true,
    })
  }

  // Admins can only reset non-admin passwords
  if (requesterAccess.role === 'admin' && ['admin', 'superadmin'].includes(targetUserRole)) {
    throw new HttpsError('permission-denied', 'Admin can reset non-admin user passwords only.')
  }

  const authApi = admin.auth()

  try {
    logger.info('Attempting to reset password for user', {
      email,
      requesterEmail,
      structuredData: true,
    })

    // Get user by email
    const authUser = await authApi.getUserByEmail(email)

    // Update password
    await authApi.updateUser(authUser.uid, {
      password: newPassword,
    })

    // Set mustChangePassword flag in custom claims
    try {
      await authApi.setCustomUserClaims(authUser.uid, {
        ...authUser.customClaims,
        mustChangePassword: true,
      })
    } catch (claimsError) {
      logger.warn('Unable to set mustChangePassword in custom claims', {
        uid: authUser.uid,
        email,
        details: claimsError.message,
        structuredData: true,
      })
    }

    // Set mustChangePassword flag in Firestore user document
    let userDocPath
    if (targetUserRole === 'customer') {
      userDocPath = `users/${authUser.uid}`
    } else if (targetUserRole === 'superadmin') {
      userDocPath = `authorizedSuperadmin/${email}`
    } else if (targetUserRole === 'admin') {
      userDocPath = `authorizedAdmin/${email}`
    } else {
      // Personnel or other roles
      userDocPath = `authorizedPersonnel/${email}`
    }

    try {
      await admin.firestore().doc(userDocPath).set(
        {
          email: email.toLowerCase(),
          mustChangePassword: true,
          firstLoginRequired: true,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    } catch (firestoreError) {
      logger.warn('Unable to set mustChangePassword flag in Firestore', {
        uid: authUser.uid,
        email,
        path: userDocPath,
        details: firestoreError.message,
        structuredData: true,
      })
    }

    logger.info('Password reset successfully', {
      email,
      uid: authUser.uid,
      requesterEmail,
      structuredData: true,
    })

    await recordAuditLog(admin.firestore(), {
      module: 'User Management',
      action: 'USER_PASSWORD_RESET',
      summary: `Reset password to default for ${email} (${targetUserRole})`,
      targetType: 'user',
      targetId: email,
      targetName: email,
      newData: { mustChangePassword: true },
      performedBy: buildActorFromRequest(request, requesterAccess.role),
    })

    return {
      success: true,
      message: `Password reset successfully for ${email}`,
      uid: authUser.uid,
    }
  } catch (error) {
    logger.error('Unable to reset user password', {
      email,
      errorCode: error.code,
      errorMessage: error.message,
      requesterEmail,
      structuredData: true,
    })
    throw new HttpsError('internal', `Unable to reset password for ${email}. ${error.message}`)
  }
})

// Send verification email
exports.sendVerificationEmail = onCall({ cors: true }, async (request) => {
  const email = String(request.data?.email || '').trim().toLowerCase()

  if (!email || !email.includes('@')) {
    throw new HttpsError('invalid-argument', 'A valid email address is required.')
  }

  const { generateVerificationCode, sendVerificationEmail: sendEmail } = require('./email-service')

  try {
    // Generate verification code
    const verificationCode = generateVerificationCode()

    // Store in Firestore with expiry (24 hours)
    const expiryTime = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now

    await admin.firestore().collection('emailVerifications').doc(email).set(
      {
        code: verificationCode,
        email: email,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: expiryTime,
        verified: false,
      },
      { merge: true }
    )

    // Send email
    await sendEmail(email, verificationCode)

    logger.info('Verification email sent successfully', {
      email,
      structuredData: true,
    })

    return {
      success: true,
      message: 'Verification email sent successfully. Please check your inbox.',
    }
  } catch (error) {
    logger.error('Failed to send verification email', {
      email,
      errorMessage: error.message,
      structuredData: true,
    })
    throw new HttpsError('internal', `Failed to send verification email: ${error.message}`)
  }
})

// Verify email code
exports.verifyEmailCode = onCall({ cors: true }, async (request) => {
  const email = String(request.data?.email || '').trim().toLowerCase()
  const code = String(request.data?.code || '').trim()

  if (!email || !email.includes('@')) {
    throw new HttpsError('invalid-argument', 'A valid email address is required.')
  }

  if (!code) {
    throw new HttpsError('invalid-argument', 'Verification code is required.')
  }

  try {
    const docSnapshot = await admin.firestore().collection('emailVerifications').doc(email).get()

    if (!docSnapshot.exists) {
      throw new HttpsError('not-found', 'No verification record found for this email.')
    }

    const data = docSnapshot.data()

    // Check if expired
    const expiresAt = data.expiresAt?.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt)
    if (new Date() > expiresAt) {
      throw new HttpsError('invalid-argument', 'Verification code has expired. Please request a new one.')
    }

    // Check if already verified
    if (data.verified) {
      throw new HttpsError('invalid-argument', 'This email has already been verified.')
    }

    // Check code
    if (data.code !== code) {
      throw new HttpsError('invalid-argument', 'Invalid verification code.')
    }

    // Mark as verified in Firestore
    await admin.firestore().collection('emailVerifications').doc(email).update({
      verified: true,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    })

    // ✅ Also update Firebase Auth user
    const userRecord = await admin.auth().getUserByEmail(email)
    await admin.auth().updateUser(userRecord.uid, { emailVerified: true })

    logger.info('Email verified successfully', { email, structuredData: true })

    return {
      success: true,
      message: 'Email verified successfully!',
      email: email,
    }
  } catch (error) {
    if (error instanceof HttpsError) {
      throw error
    }

    logger.error('Email verification failed', {
      email,
      errorMessage: error.message,
      structuredData: true,
    })
    throw new HttpsError('internal', `Email verification failed: ${error.message}`)
  }
})

// Resend verification email
exports.resendVerificationEmail = onCall({ cors: true }, async (request) => {
  const email = String(request.data?.email || '').trim().toLowerCase()

  if (!email || !email.includes('@')) {
    throw new HttpsError('invalid-argument', 'A valid email address is required.')
  }

  const { generateVerificationCode, sendVerificationEmail: sendEmail } = require('./email-service')

  try {
    // Generate new code
    const verificationCode = generateVerificationCode()

    // Update in Firestore with new expiry
    const expiryTime = new Date(Date.now() + 24 * 60 * 60 * 1000)

    await admin.firestore().collection('emailVerifications').doc(email).set(
      {
        code: verificationCode,
        email: email,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: expiryTime,
        verified: false,
      },
      { merge: false } // Overwrite to reset
    )

    // Send email
    await sendEmail(email, verificationCode)

    logger.info('Verification email resent successfully', {
      email,
      structuredData: true,
    })

    return {
      success: true,
      message: 'Verification email has been resent. Please check your inbox.',
    }
  } catch (error) {
    logger.error('Failed to resend verification email', {
      email,
      errorMessage: error.message,
      structuredData: true,
    })
    throw new HttpsError('internal', `Failed to resend verification email: ${error.message}`)
  }
})

// Contact administrator for password reset request
exports.contactAdministrator = onCall(async (request) => {
  const email = String(request.data?.email || '').trim().toLowerCase()
  const fullName = String(request.data?.fullName || '').trim()

  if (!email || !email.includes('@')) {
    throw new HttpsError('invalid-argument', 'Enter a valid email address.')
  }

  logger.info('Contact administrator request', {
    email,
    fullName,
    structuredData: true,
  })

  try {
    const adminRequestsRef = admin.firestore().collection('adminPasswordResetRequests').doc(email)

    await adminRequestsRef.set({
      email,
      fullName: fullName || email,
      requestedAt: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending',
      read: false,
    }, { merge: true })

    logger.info('Admin contact request stored', {
      email,
      structuredData: true,
    })

    return {
      success: true,
      message: `Password reset request submitted for ${email}`,
    }
  } catch (error) {
    logger.error('Unable to store admin contact request', {
      email,
      errorCode: error.code,
      errorMessage: error.message,
      structuredData: true,
    })
    throw new HttpsError('internal', `Unable to submit request: ${error.message}`)
  }
})

// Send custom email verification link to the app domain
exports.sendCustomEmailVerification = onCall({ enforceAppCheck: false }, async (request) => {
  const email = String(request.data?.email || '').trim().toLowerCase()

  if (!email || !email.includes('@')) {
    throw new HttpsError('invalid-argument', 'Email is required')
  }

  try {
    logger.info('Generating custom email verification link', { email })

    const verificationLink = await admin.auth().generateEmailVerificationLink(email, {
      url: process.env.APP_URL || 'https://bykelink-system.web.app',
      handleCodeInApp: true,
    })

    logger.info('Custom email verification link generated', {
      email,
      linkPrefix: verificationLink?.substring(0, 50),
    })

    return {
      success: true,
      verificationLink,
      message: 'Verification link generated successfully',
    }
  } catch (error) {
    logger.error('Unable to generate verification link', {
      email,
      errorCode: error.code,
      errorMessage: error.message,
    })

    throw new HttpsError('internal', `Unable to generate verification link: ${error.message}`)
  }
})

const fetch = require('node-fetch')

