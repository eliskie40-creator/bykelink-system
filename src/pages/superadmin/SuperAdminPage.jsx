import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { updateProfile as updateAuthProfile } from 'firebase/auth'
import { collection, doc, limit, onSnapshot, query, serverTimestamp, setDoc, getDocs, where, orderBy, updateDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import AnalyticsRoundedIcon from '@mui/icons-material/AnalyticsRounded'
import BuildRoundedIcon from '@mui/icons-material/BuildRounded'
import ChatBubbleRoundedIcon from '@mui/icons-material/ChatBubbleRounded'
import DashboardRoundedIcon from '@mui/icons-material/DashboardRounded'
import HistoryRoundedIcon from '@mui/icons-material/HistoryRounded'
import ManageAccountsRoundedIcon from '@mui/icons-material/ManageAccountsRounded'
import PersonRoundedIcon from '@mui/icons-material/PersonRounded'
import TwoWheelerRoundedIcon from '@mui/icons-material/TwoWheelerRounded'
import TrendingDownRoundedIcon from '@mui/icons-material/TrendingDownRounded'
import TrendingUpRoundedIcon from '@mui/icons-material/TrendingUpRounded'
import TuneRoundedIcon from '@mui/icons-material/TuneRounded'
import { db, functions, storage } from '../../firebase'
import { useTheme } from '../../context/ThemeContext'
import useToast from '../../context/useToast'
import ConfirmationModal from './components/ConfirmationModal'
import EditUserModal from './components/EditUserModal'
import NewUserModal from './components/NewUserModal'
import NotificationsDrawer from './components/NotificationsDrawer'
import ProfileSection from './components/ProfileSection'
import SuperAdminHeader from './components/SuperAdminHeader'
import SuperAdminSidebar from './components/SuperAdminSidebar/SuperAdminSidebar'
import AnalyticsSection from './sections/AnalyticsSection'
import ChatsManagementSection from './sections/ChatsManagementSection'
import DashboardSection from './sections/DashboardSection'
import InventorySection from './sections/InventorySection'
import InventoryReportsSection from './sections/InventoryReportsSection'
import InventoryDeleteArchivedSection from './sections/InventoryDeleteArchivedSection'
import MasterDataManagementSection from './sections/MasterDataManagementSection'
import ServiceRequestsSection from './sections/ServiceRequestsSection'
import TechniciansSection from './sections/TechniciansSection'
import TransactionHistorySection from './sections/TransactionHistorySection'
import UserManagementSection from './sections/UserManagementSection'
import ServiceTypeSection from './sections/ServiceTypeSection'
import { saveAccessAssignment } from '../../services/userService';
import {
  buildChartBars,
  fallbackTechnicians,
  formatCurrency,
  formatDate,
  getStatusClasses,
  inventoryStatusOptions,
  normalizeText,
  roleOptions,
  serviceStatusOptions,
  technicianStatusOptions,
} from './sections/superadminUtils'
import './SuperAdminPage.css'
import './AdminOfficeTheme.css'

const baseSidebarItems = [
  { id: 'dashboard', label: 'Dashboard', icon: DashboardRoundedIcon },
  { id: 'user-management', label: 'User Management', icon: ManageAccountsRoundedIcon },
  { 
    id: 'inventory-management', 
    label: 'Inventory Management', 
    icon: TwoWheelerRoundedIcon,
    subitems: [
      { id: 'inventory', label: 'Inventory Items' },
      { id: 'inventory-reports', label: 'Inventory Reports' },
      { id: 'inventory-delete-archived', label: 'Inventory Delete Archived' },
    ]
  },
  {
    id: 'unit-management',
    label: 'Unit Management',
    icon: TwoWheelerRoundedIcon,
    subitems: [
      { id: 'master-categories', label: 'Categories' },
      { id: 'master-models', label: 'Models' },
      { id: 'master-variants', label: 'Variants' },
    ],
  },
  { id: 'chats-management', label: 'Chats Management', icon: ChatBubbleRoundedIcon },
  { 
    id: 'service-management', 
    label: 'Service Management', 
    icon: TuneRoundedIcon,
    subitems: [
      { id: 'service-type', label: 'Service Type' },
      { id: 'service-logs', label: 'Service Booking' },
    ]
  },
  { id: 'analytics', label: 'Sales Analytics', icon: AnalyticsRoundedIcon },
  { id: 'transaction-history', label: 'Transaction History', icon: HistoryRoundedIcon },
  { id: 'profile', label: 'Profile', icon: PersonRoundedIcon },
]

const normalizeSectionKey = (value = '') => String(value).trim().toLowerCase().replace(/[\s_-]+/g, '')

const sectionAliases = {
  services: ['service-management'],
  bookings: ['service-logs'],
  servicebooking: ['service-logs'],
  messages: ['chats-management'],
  settings: ['profile'],
  reports: ['inventory-reports', 'analytics'],
}

const expandAccessibleSections = (sections = []) => {
  const sectionIdsByKey = new Map()

  baseSidebarItems.forEach((item) => {
    sectionIdsByKey.set(normalizeSectionKey(item.id), item.id)
    sectionIdsByKey.set(normalizeSectionKey(item.label), item.id)
    item.subitems?.forEach((subitem) => {
      sectionIdsByKey.set(normalizeSectionKey(subitem.id), subitem.id)
      sectionIdsByKey.set(normalizeSectionKey(subitem.label), subitem.id)
    })
  })

  const allowedSections = new Set()

  sections.forEach((section) => {
    const sectionKey = normalizeSectionKey(section)
    const matchedSectionId = sectionIdsByKey.get(sectionKey)
    const sectionIds = sectionAliases[sectionKey] || (matchedSectionId ? [matchedSectionId] : [])

    sectionIds.forEach((sectionId) => {
      allowedSections.add(sectionId)
      const parent = baseSidebarItems.find((item) => item.id === sectionId)
      parent?.subitems?.forEach((subitem) => allowedSections.add(subitem.id))
    })
  })

  return allowedSections
}

const DEFAULT_OPERATOR_PASSWORD = 'Password123'

const defaultInviteForm = {
  fullName: '',
  email: '',
  role: 'admin',
  status: 'active',
  temporaryPassword: DEFAULT_OPERATOR_PASSWORD,
  menuAccess: ['dashboard', 'user-management', 'inventory', 'services', 'bookings', 'messages', 'reports', 'settings'],
}

const defaultEditUserForm = {
  fullName: '',
  email: '',
  role: 'admin',
  status: 'active',
  accessibleSections: [],
}

export default function SuperAdminPage({ onNavigateHome, onSignOut, currentUser, accessProfile, dashboardPath = '/superadmin', currentPath = '/superadmin', initialSection = 'dashboard', onNavigateDashboardPath }) {

  const [activeSection, setActiveSection] = useState(initialSection)
  const [searchTerm, setSearchTerm] = useState('')
  const [users, setUsers] = useState([])
  const [userProfile, setUserProfile] = useState(null)
  const [serviceRequests, setServiceRequests] = useState([])
  const [inventory, setInventory] = useState([])
  const [technicians, setTechnicians] = useState([])
  const [authorizedAdmins, setAuthorizedAdmins] = useState([])
  const [authorizedPersonnel, setAuthorizedPersonnel] = useState([])
  const [archivedUsers, setArchivedUsers] = useState([])
  const [categories, setCategories] = useState([])
  const [models, setModels] = useState([])
  const [variants, setVariants] = useState([])
  const [inventoryLogs, setInventoryLogs] = useState([])
  const [transactionLogs, setTransactionLogs] = useState([])
  const [auditLogs, setAuditLogs] = useState([])
  const [inventoryChangeRequests, setInventoryChangeRequests] = useState([])
  const [deletedItems, setDeletedItems] = useState([])
  const [unreadChatCount, setUnreadChatCount] = useState(0)
  const [previousUnreadCount, setPreviousUnreadCount] = useState(0)
  const audioContextRef = useRef(null)
  const hasHydratedUnreadRef = useRef(false)
  const unreadConversationCountsRef = useRef({})
  const unreadListenersRef = useRef(new Map())

  const [loadingState, setLoadingState] = useState({
    users: true,
    serviceRequests: true,
    inventory: true,
    technicians: true,
    authorizedAdmins: true,
    authorizedPersonnel: true,
    archivedUsers: true,
    categories: true,
    models: true,
    variants: true,
    inventoryLogs: true,
    transactionLogs: true,
    auditLogs: true,
    inventoryChangeRequests: true,
    conversations: true,
  })
  const [actionMessage, setActionMessage] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [inviteForm, setInviteForm] = useState(defaultInviteForm)
  const [editUserForm, setEditUserForm] = useState(defaultEditUserForm)
  const [selectedUser, setSelectedUser] = useState(null)
  const [isNewUserModalOpen, setIsNewUserModalOpen] = useState(false)
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(() =>
    typeof window === 'undefined' ? true : window.innerWidth >= 1024,
  )
  const profileReturnSectionRef = useRef(initialSection === 'profile' ? 'dashboard' : initialSection)
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false)
  const [notificationConfirmation, setNotificationConfirmation] = useState(null)
  const [resetPasswordConfirmation, setResetPasswordConfirmation] = useState(null)
  const [isResetPasswordLoading, setIsResetPasswordLoading] = useState(false)
  const [logoutConfirmation, setLogoutConfirmation] = useState(false)
  const [chatNotifications, setChatNotifications] = useState(() => {
    if (typeof window === 'undefined') {
      return []
    }

    try {
      const storedNotifications = window.localStorage.getItem('bykelink-chat-notifications')
      return storedNotifications ? JSON.parse(storedNotifications) : []
    } catch {
      return []
    }
  })
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = window.localStorage.getItem('bykelink-dismissed-notifications')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [readAlertIds, setReadAlertIds] = useState(() => {
    if (typeof window === 'undefined') return []
    try {
      const saved = window.localStorage.getItem('bykelink-read-alert-ids')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })
  const [chatFocusRequest, setChatFocusRequest] = useState(null)
  const { isDarkMode, toggleTheme } = useTheme()
  const { success: toastSuccess, error: toastError } = useToast()
  const [profileForm, setProfileForm] = useState({
    fullName: '',
    title: '',
    phone: '',
    location: '',
    latitude: '',
    longitude: '',
    bio: '',
  })
  const [savedProfileSnapshot, setSavedProfileSnapshot] = useState(null)
  const [isSaveConfirmOpen, setIsSaveConfirmOpen] = useState(false)
  const [isLeaveConfirmOpen, setIsLeaveConfirmOpen] = useState(false)
  const [pendingSection, setPendingSection] = useState(null)

  const sectionTitle = useMemo(() => {
    return baseSidebarItems.find((item) => item.id === activeSection)?.label ?? 'Dashboard'
  }, [activeSection])

  const adminName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Administrator'
  const adminEmail = currentUser?.email || 'No email'
  const consoleLabel = accessProfile?.label || 'Superadmin'
  const currentAccessRole = accessProfile?.role || 'guest'
  const canManageAccess = ['admin', 'superadmin'].includes(currentAccessRole)
  const canEditOperations = ['admin', 'superadmin', 'staff personnel'].includes(currentAccessRole)
  const personnelInviteRoles = useMemo(
    () => [
      'mechanics personnel',
      'staff',
    ],
    []
  )
  const assignableInviteRoles =
    currentAccessRole === 'superadmin' ? ['admin', ...personnelInviteRoles] : personnelInviteRoles
  const assignableRoleOptions =
    currentAccessRole === 'superadmin'
      ? roleOptions.filter((role) => role !== 'superadmin')
      : roleOptions.filter((role) => !['admin', 'superadmin'].includes(role))


      
 useEffect(() => {
  if (!currentUser?.uid) return

  const unsub = onSnapshot(doc(db, "users", currentUser.uid), (snap) => {
    if (snap.exists()) {
      setUserProfile(snap.data())
    }
  })

  return () => unsub()
}, [currentUser?.uid])

  // Load profile data from Firestore
  useEffect(() => {
    if (!currentUser?.uid) return

    const loadProfile = async () => {
      try {
        const normalizedRole = normalizeText(accessProfile?.role || 'superadmin')
        const privilegedCollectionName =
          normalizedRole === 'superadmin'
            ? 'authorizedSuperadmin'
            : normalizedRole === 'admin'
              ? 'authorizedAdmin'
              : personnelInviteRoles.includes(normalizedRole) || normalizedRole === 'staff'
                ? 'authorizedPersonnel'
                : null
        const profileDocRef =
          privilegedCollectionName && currentUser.email
            ? doc(db, privilegedCollectionName, String(currentUser.email || '').trim().toLowerCase())
            : doc(db, 'users', currentUser.uid)

        // Use real-time listener to keep profile in sync and capture saved snapshot
        const unsubscribe = onSnapshot(profileDocRef, (snap) => {
          if (snap.exists()) {
            const data = snap.data()
            setProfileForm((current) => {
              const updated = {
                ...current,
                fullName: data.fullName || current.fullName,
                title: data.title || current.title,
                phone: data.phone || current.phone,
                location: data.location || current.location,
                bio: data.bio || current.bio,
                latitude: data.latitude || current.latitude,
                longitude: data.longitude || current.longitude,
                avatarUrl: data.avatarUrl || current.avatarUrl,
              }
              // Update saved snapshot with the same values to prevent false unsaved-change detection
              setSavedProfileSnapshot({
                fullName: updated.fullName || '',
                title: updated.title || '',
                phone: updated.phone || '',
                location: updated.location || '',
                bio: updated.bio || '',
                latitude: updated.latitude || '',
                longitude: updated.longitude || '',
                avatarUrl: updated.avatarUrl || '',
              })
              return updated
            })
          }
        })

        return unsubscribe
      } catch (error) {
        console.error('Failed to load profile:', error)
      }
    }

    let unsubscribe
    loadProfile().then((unsub) => {
      unsubscribe = unsub
    })

    return () => {
      if (unsubscribe) unsubscribe()
    }
  }, [currentUser?.uid, currentUser?.email, accessProfile?.role, personnelInviteRoles])

  // Load flagship location from settings
  useEffect(() => {
    const settingsRef = doc(db, 'settings', 'flagshipLocation')
    const unsubscribe = onSnapshot(settingsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data()
        setProfileForm((current) => {
          const updated = {
            ...current,
            latitude: data.latitude || current.latitude,
            longitude: data.longitude || current.longitude,
            location: data.location || current.location,
          }
          // Update saved snapshot to match
          setSavedProfileSnapshot((current) => ({
            ...current,
            latitude: updated.latitude || '',
            longitude: updated.longitude || '',
            location: updated.location || '',
          }))
          return updated
        })
      }
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    setActiveSection(initialSection)
  }, [initialSection])

  useEffect(() => {
    if (!actionMessage) {
      return undefined
    }

    const timerId = window.setTimeout(() => setActionMessage(null), 5000)

    return () => window.clearTimeout(timerId)
  }, [actionMessage])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(
      'bykelink-chat-notifications',
      JSON.stringify(chatNotifications.slice(0, 50)),
    )
  }, [chatNotifications])

  useEffect(() => {
    const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000
    const now = Date.now()

    setChatNotifications((current) => {
      const filtered = current.filter((notification) => {
        const createdAt = notification.createdAt instanceof Date
          ? notification.createdAt.getTime()
          : new Date(notification.createdAt).getTime()
        return now - createdAt < ONE_WEEK_MS
      })
      return filtered.length < current.length ? filtered : current
    })
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsSidebarOpen(true)
      }
    }

    window.addEventListener('resize', handleResize)

    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const subscribeToCollection = ({
      collectionName,
      stateKey,
      setter,
      shouldSubscribe = true,
      orderField = 'updatedAt',
      limitCount = 200,
    }) => {
      if (!shouldSubscribe) {
        setLoadingState((current) => ({ ...current, [stateKey]: false }))
        setter([])
        return () => {}
      }

      const collectionRef = collection(db, collectionName)
      const baseQuery = orderField
        ? limitCount === null
          ? query(collectionRef, orderBy(orderField, 'desc'))
          : query(collectionRef, orderBy(orderField, 'desc'), limit(limitCount))
        : limitCount === null
          ? query(collectionRef)
          : query(collectionRef, limit(limitCount))

      return onSnapshot(
        baseQuery,
        (snapshot) => {
          setter(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
          setLoadingState((current) => ({ ...current, [stateKey]: false }))
        },
        (error) => {
          console.error(`Unable to load ${collectionName}`, error)
          setLoadingState((current) => ({ ...current, [stateKey]: false }))
          setActionMessage({
            type: 'error',
            text: `Unable to load ${collectionName}. Check the access rules for ${consoleLabel.toLowerCase()} access.`,
          })
        },
      )
    }

    const unsubscribers = [
      subscribeToCollection({
        collectionName: 'serviceBookings',
        stateKey: 'serviceRequests',
        setter: setServiceRequests,
        orderField: null,
        limitCount: null,
      }),
      subscribeToCollection({
        collectionName: 'inventory',
        stateKey: 'inventory',
        setter: setInventory,
      }),
     

currentAccessRole === 'staff personnel' && currentUser?.email
  ? onSnapshot(
      doc(db, 'authorizedPersonnel', currentUser.email.toLowerCase()),
      (snap) => {
        if (snap.exists()) {
          setTechnicians([{ id: snap.id, ...snap.data() }])
        } else {
          setTechnicians([])
        }

        setLoadingState((current) => ({
          ...current,
          technicians: false,
        }))
      },
      (error) => {
        console.error('Unable to load authorizedPersonnel (self)', error)
        setTechnicians([]) 
      }
    )
  : subscribeToCollection({
      collectionName: 'authorizedPersonnel',
      stateKey: 'technicians',
      setter: setTechnicians,
    }),


      subscribeToCollection({
        collectionName: 'users',
        stateKey: 'users',
        setter: setUsers,
        shouldSubscribe: canManageAccess,
      }),
      subscribeToCollection({
        collectionName: 'authorizedAdmin',
        stateKey: 'authorizedAdmins',
        setter: setAuthorizedAdmins,
        shouldSubscribe: canManageAccess,
      }),
      subscribeToCollection({
        collectionName: 'authorizedPersonnel',
        stateKey: 'authorizedPersonnel',
        setter: setAuthorizedPersonnel,
        shouldSubscribe: canManageAccess,
      }),
      subscribeToCollection({
        collectionName: 'deleteArchived',
        stateKey: 'archivedUsers',
        setter: setArchivedUsers,
        shouldSubscribe: canManageAccess,
      }),
      subscribeToCollection({
        collectionName: 'inventoryLogs',
        stateKey: 'inventoryLogs',
        setter: setInventoryLogs,
        shouldSubscribe: canManageAccess,
        orderField: null,
        limitCount: null,
      }),
      subscribeToCollection({
        collectionName: 'transactionLogs',
        stateKey: 'transactionLogs',
        setter: setTransactionLogs,
        shouldSubscribe: canManageAccess,
        orderField: 'createdAt',
        limitCount: null,
      }),
      subscribeToCollection({
        collectionName: 'auditLogs',
        stateKey: 'auditLogs',
        setter: setAuditLogs,
        shouldSubscribe: canManageAccess,
        orderField: 'createdAt',
        limitCount: null,
      }),
      subscribeToCollection({
        collectionName: 'inventoryChangeRequests',
        stateKey: 'inventoryChangeRequests',
        setter: setInventoryChangeRequests,
        shouldSubscribe: canEditOperations,
        orderField: 'createdAt',
        limitCount: null,
      }),
      subscribeToCollection({
        collectionName: 'deleteArchived',
        stateKey: 'deletedItems',
        setter: setDeletedItems,
        shouldSubscribe: canManageAccess,
      }),
    ]

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe?.())
    }
  
}, [
  canEditOperations,
  canManageAccess,
  consoleLabel,
  currentAccessRole, 
  currentUser?.email 
])


  // Load unread user messages in real time across all chat conversations
  const recountUnreadMessages = useCallback(() => {
    const totalUnread = Object.values(unreadConversationCountsRef.current).reduce(
      (sum, count) => sum + (Number.isFinite(count) ? count : 0),
      0,
    )
    setUnreadChatCount(totalUnread)
  }, [])

  const refreshUnreadCountsFromFirestore = useCallback(async () => {
    try {
      const conversationsSnap = await getDocs(collection(db, 'conversations'))
      const nextCounts = {}

      await Promise.all(
        conversationsSnap.docs.map(async (conversationDoc) => {
          const unreadSnap = await getDocs(
            query(
              collection(db, 'conversations', conversationDoc.id, 'messages'),
              where('read', '==', false),
            ),
          )

          const customerUnreadMessages = unreadSnap.docs.filter((messageDoc) => {
            const messageData = messageDoc.data()
            return (
              messageData.type === 'user' ||
              messageData.sender === 'user' ||
              Boolean(messageData.senderId) ||
              (messageData.senderName && messageData.senderName !== 'BYKELINK Admin')
            )
          })

          nextCounts[conversationDoc.id] = customerUnreadMessages.length
        }),
      )

      unreadConversationCountsRef.current = nextCounts
      recountUnreadMessages()
    } catch (error) {
      console.error('Error refreshing unread chat counts:', error)
    }
  }, [recountUnreadMessages])

  useEffect(() => {
    if (!canEditOperations || !currentUser?.uid) {
      unreadListenersRef.current.forEach((unsubscribe) => unsubscribe())
      unreadListenersRef.current.clear()
      unreadConversationCountsRef.current = {}
      setUnreadChatCount(0)
      setLoadingState((current) => ({ ...current, conversations: false }))
      return undefined
    }

    const conversationsRef = collection(db, 'conversations')
    const conversationsQuery = query(conversationsRef, limit(100))
    const unreadListeners = unreadListenersRef.current

    const unsubscribe = onSnapshot(
      conversationsQuery,
      (snapshot) => {
        const activeConversationIds = new Set(snapshot.docs.map((conversationDoc) => conversationDoc.id))

        unreadListeners.forEach((stopListening, conversationId) => {
          if (!activeConversationIds.has(conversationId)) {
            stopListening()
            unreadListeners.delete(conversationId)
            delete unreadConversationCountsRef.current[conversationId]
          }
        })

        snapshot.docs.forEach((conversationDoc) => {
          const conversationId = conversationDoc.id
          const conversationData = conversationDoc.data()

          if (unreadListeners.has(conversationId)) {
            return
          }

          const unreadMessagesQuery = query(
            collection(db, `conversations/${conversationId}/messages`),
            where('read', '==', false),
          )

          const stopUnreadListener = onSnapshot(
            unreadMessagesQuery,
            (unreadSnapshot) => {
              const customerUnreadMessages = unreadSnapshot.docs.filter((messageDoc) => {
                const messageData = messageDoc.data()
                return (
                  messageData.type === 'user' ||
                  messageData.sender === 'user' ||
                  messageData.senderId ||
                  messageData.senderName && messageData.senderName !== 'BYKELINK Admin'
                )
              })

              unreadConversationCountsRef.current[conversationId] = customerUnreadMessages.length

              customerUnreadMessages.forEach((messageDoc) => {
                const messageData = messageDoc.data()
                const createdAt = messageData.timestamp?.toDate?.() || new Date()
                const notificationId = `${conversationId}-${messageDoc.id}`

                setChatNotifications((current) => {
                  const existingIndex = current.findIndex((item) => item.id === notificationId)
                  const nextNotification = {
                    id: notificationId,
                    type: 'CHAT',
                    title: `${conversationData.senderName || conversationData.userName || 'Customer'} sent a message`,
                    description: messageData.text || 'New customer message received.',
                    conversationId,
                    messageId: messageDoc.id,
                    read: false,
                    createdAt: createdAt.toISOString(),
                  }

                  if (existingIndex >= 0) {
                    const updated = [...current]
                    updated[existingIndex] = {
                      ...updated[existingIndex],
                      ...nextNotification,
                    }
                    return updated
                  }

                  return [nextNotification, ...current].slice(0, 50)
                })
              })

              recountUnreadMessages()
              setLoadingState((current) => ({ ...current, conversations: false }))
            },
            (error) => {
              console.error(`Error loading unread messages for conversation ${conversationId}:`, error)
              unreadConversationCountsRef.current[conversationId] = 0
              recountUnreadMessages()
              setLoadingState((current) => ({ ...current, conversations: false }))
            },
          )

          unreadListeners.set(conversationId, stopUnreadListener)
        })

        recountUnreadMessages()
        setLoadingState((current) => ({ ...current, conversations: false }))
      },
      (error) => {
        console.error('Error loading chat notification conversations:', error)
        setLoadingState((current) => ({ ...current, conversations: false }))
      },
    )

    return () => {
      unsubscribe()
      unreadListeners.forEach((stopListening) => stopListening())
      unreadListeners.clear()
      unreadConversationCountsRef.current = {}
    }
  }, [canEditOperations, currentUser?.uid, recountUnreadMessages])

  // Load master data collections
  useEffect(() => {
    const loadMasterData = async () => {
      try {
        const categoriesSnap = await getDocs(collection(db, 'masterData', 'inventory', 'categories'))
        setCategories(categoriesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
        setLoadingState((current) => ({ ...current, categories: false }))

        const modelsSnap = await getDocs(collection(db, 'masterData', 'inventory', 'models'))
        setModels(modelsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
        setLoadingState((current) => ({ ...current, models: false }))

        const variantsSnap = await getDocs(collection(db, 'masterData', 'inventory', 'variants'))
        setVariants(variantsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
        setLoadingState((current) => ({ ...current, variants: false }))
      } catch (error) {
        console.warn('Master data collections not yet created', error)
        setLoadingState((current) => ({ ...current, categories: false, models: false, variants: false }))
      }
    }
    loadMasterData()
  }, [])

  const ensureNotificationAudioReady = useCallback(async () => {
    if (typeof window === 'undefined') {
      return
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (!AudioContextClass) {
      return
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass()
    }

    if (audioContextRef.current.state === 'suspended') {
      try {
        await audioContextRef.current.resume()
      } catch (error) {
        console.warn('Could not resume notification audio:', error)
      }
    }
  }, [])

  // Unlock notification audio after the first user interaction
  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    const unlockAudio = () => {
      ensureNotificationAudioReady()
    }

    window.addEventListener('pointerdown', unlockAudio, { once: true })
    window.addEventListener('keydown', unlockAudio, { once: true })

    return () => {
      window.removeEventListener('pointerdown', unlockAudio)
      window.removeEventListener('keydown', unlockAudio)
    }
  }, [ensureNotificationAudioReady])

  // Play notification sound when new unread messages arrive
  const playNotificationSound = useCallback(async () => {
    try {
      await ensureNotificationAudioReady()

      const audioContext = audioContextRef.current
      if (!audioContext) {
        return
      }

      const now = audioContext.currentTime
      const oscillator = audioContext.createOscillator()
      const envelope = audioContext.createGain()

      oscillator.connect(envelope)
      envelope.connect(audioContext.destination)
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(880, now)
      envelope.gain.setValueAtTime(0.0001, now)
      envelope.gain.exponentialRampToValueAtTime(0.25, now + 0.02)
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.28)

      oscillator.start(now)
      oscillator.stop(now + 0.28)
    } catch (error) {
      console.warn('Could not play notification sound:', error)
    }
  }, [ensureNotificationAudioReady])

  useEffect(() => {
    if (!hasHydratedUnreadRef.current) {
      hasHydratedUnreadRef.current = true
      setPreviousUnreadCount(unreadChatCount)
      return
    }

    if (unreadChatCount > previousUnreadCount) {
      playNotificationSound()

      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('New Chat Message', {
          body: `You have ${unreadChatCount} unread message${unreadChatCount !== 1 ? 's' : ''} from customers.`,
          tag: 'bykelink-chat-notification',
          renotify: true,
        })
      }
    }

    setPreviousUnreadCount(unreadChatCount)
  }, [playNotificationSound, unreadChatCount, previousUnreadCount])

  const handleToggleNotifications = useCallback(async () => {
    await ensureNotificationAudioReady()

    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission()
      } catch (error) {
        console.warn('Could not request notification permission:', error)
      }
    }

    setIsNotificationsOpen((current) => !current)
  }, [ensureNotificationAudioReady])

  const visibleTechnicians = technicians.length ? technicians : fallbackTechnicians
  const normalizedSearchTerm = normalizeText(searchTerm)

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const haystack = [user.fullName, user.displayName, user.email, user.role].join(' ')
      return haystack.toLowerCase().includes(normalizedSearchTerm)
    })
  }, [normalizedSearchTerm, users])


  const filteredServiceRequests = useMemo(() => {
    return serviceRequests.filter((request) => {
      const haystack = [request.customer, request.customerName, request.model, request.service, request.status].join(' ')
      return haystack.toLowerCase().includes(normalizedSearchTerm)
    })
  }, [normalizedSearchTerm, serviceRequests])

  // Mechanics with activeJobs count
  const mechanicsWithActiveJobs = useMemo(() => {
    return technicians.map((tech) => {
      const isMechanic = (tech.role || tech.personnelRole || '').toLowerCase().includes('mechanic');
      if (!isMechanic) return tech;
      const activeJobs = serviceRequests.filter(
        (req) =>
          req.status && req.status.toLowerCase() === 'in progress' &&
          req.assignedTechnician &&
          (req.assignedTechnician === tech.email || req.assignedTechnician === tech.id)
      ).length;
      return { ...tech, activeJobs };
    });
  }, [technicians, serviceRequests]);

  const filteredInventory = useMemo(() => {
    return inventory.filter((item) => {
      const haystack = [item.name, item.category, item.status].join(' ')
      return haystack.toLowerCase().includes(normalizedSearchTerm)
    })
  }, [inventory, normalizedSearchTerm])

  const filteredTechnicians = useMemo(() => {
    return visibleTechnicians.filter((item) => {
      const haystack = [item.name, item.specialty, item.status].join(' ')
      return haystack.toLowerCase().includes(normalizedSearchTerm)
    })
  }, [normalizedSearchTerm, visibleTechnicians])

  const filteredAuthorizedAccess = useMemo(() => {
    return [...authorizedAdmins, ...authorizedPersonnel].filter((item) => {
      const haystack = [item.email, item.role, item.personnelRole, item.dashboardPath, item.status].join(' ')
      return haystack.toLowerCase().includes(normalizedSearchTerm)
    })
  }, [authorizedAdmins, authorizedPersonnel, normalizedSearchTerm])

  const myUserRecord = useMemo(() => {
    return users.find((item) => item.id === currentUser?.uid) || {}
  }, [currentUser?.uid, users])

  useEffect(() => {
    setProfileForm({
      fullName: myUserRecord.fullName || currentUser?.displayName || '',
      title: myUserRecord.title || `${consoleLabel} Lead`,
      phone: myUserRecord.phone || '',
      location: myUserRecord.location || 'Bykelink HQ',
      bio:
        myUserRecord.bio ||
        'Focused on real-time operations, service visibility, and secure access control across the Bykelink ecosystem.',
    })
  }, [consoleLabel, currentUser?.displayName, myUserRecord.bio, myUserRecord.fullName, myUserRecord.location, myUserRecord.phone, myUserRecord.title])

  // Load admin contact requests from Firestore
  useEffect(() => {
    if (!canManageAccess) return undefined

    const loadAdminRequests = async () => {
      try {
        const requestsSnapshot = await getDocs(
          query(
            collection(db, 'adminPasswordResetRequests'),
            where('status', '==', 'pending'),
            limit(50)
          )
        )

        const requests = requestsSnapshot.docs.map((doc) => ({
          id: `admin-request-${doc.id}`,
          type: 'PASSWORD_RESET_REQUEST',
          title: 'Password Reset Request',
          description: `Admin contact from ${doc.data().fullName || doc.id}`,
          read: doc.data().read || false,
          createdAt: doc.data().requestedAt?.toISOString?.() || new Date().toISOString(),
          email: doc.id,
        }))

        if (requests.length > 0) {
          // Only add if not already in notifications
          setChatNotifications((current) => {
            const existingIds = new Set(current.map((n) => n.id))
            const newRequests = requests.filter((r) => !existingIds.has(r.id))
            
            if (newRequests.length > 0) {
              const updatedNotifications = [...newRequests, ...current]
              if (typeof window !== 'undefined') {
                window.localStorage.setItem('bykelink-chat-notifications', JSON.stringify(updatedNotifications))
              }
              return updatedNotifications
            }
            return current
          })
        }
      } catch (error) {
        console.error('[SuperAdmin] Error loading admin requests:', error)
      }
    }

    loadAdminRequests()
    
    // Set up real-time listener
    const unsubscribe = onSnapshot(
      query(
        collection(db, 'adminPasswordResetRequests'),
        where('status', '==', 'pending')
      ),
      (snapshot) => {
        const requests = snapshot.docs.map((doc) => ({
          id: `admin-request-${doc.id}`,
          type: 'PASSWORD_RESET_REQUEST',
          title: 'Password Reset Request',
          description: `Admin contact from ${doc.data().fullName || doc.id}`,
          read: doc.data().read || false,
          createdAt: doc.data().requestedAt?.toISOString?.() || new Date().toISOString(),
          email: doc.id,
        }))

        setChatNotifications((current) => {
          const otherNotifications = current.filter((n) => !n.id.startsWith('admin-request-'))
          const updatedNotifications = [...requests, ...otherNotifications]
          
          if (typeof window !== 'undefined') {
            window.localStorage.setItem('bykelink-chat-notifications', JSON.stringify(updatedNotifications))
          }
          return updatedNotifications
        })
      },
      (error) => {
        console.error('[SuperAdmin] Error listening to admin requests:', error)
      }
    )

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe()
      }
    }
  }, [canManageAccess])

  const activeServices = filteredServiceRequests.filter(
    (item) => !['completed', 'cancelled'].includes(normalizeText(item.status)),
  ).length
  const completedServices = filteredServiceRequests.filter(
    (item) => normalizeText(item.status) === 'completed',
  ).length
  const estimatedRevenue = filteredServiceRequests.reduce((total, item) => {
    const nextValue = Number(item.cost ?? item.price ?? item.amount ?? 0)
    return total + (Number.isFinite(nextValue) ? nextValue : 0)
  }, 0)
  const averageServiceHours = filteredServiceRequests.length
    ? (
        filteredServiceRequests.reduce((total, item) => {
          const nextValue = Number(item.estimatedHours ?? item.hours ?? 4)
          return total + (Number.isFinite(nextValue) ? nextValue : 4)
        }, 0) / filteredServiceRequests.length
      ).toFixed(1)
    : '0.0'
  const onlineTechnicians = filteredTechnicians.filter((item) => normalizeText(item.status) === 'online').length
  const techAvailability = filteredTechnicians.length
    ? Math.round((onlineTechnicians / filteredTechnicians.length) * 100)
    : 0
  const chartBars = useMemo(() => buildChartBars(filteredServiceRequests), [filteredServiceRequests])

  const notificationItems = useMemo(() => {
    const items = []

    // 1. Chat notifications
    chatNotifications.forEach((item) => {
      items.push({
        ...item,
        time: item.time || formatDate(new Date(item.createdAt || Date.now())),
      })
    })

    // 2. Pending inventory verification requests
    inventoryChangeRequests.forEach((req) => {
      if (req.status === 'pending') {
        const id = `inv-req-${req.id}`
        const isRename = req.requestType === 'rename'
        const isUpdate = req.requestType === 'update'
        const typeLabel = isRename ? 'Product Name Change' : isUpdate ? 'Product Update' : 'Product Deletion'
        const createdDate = req.createdAt?.toDate ? req.createdAt.toDate() : (req.createdAt?.seconds ? new Date(req.createdAt.seconds * 1000) : new Date(req.createdAt || Date.now()))

        items.push({
          id,
          type: 'INVENTORY_REQUEST',
          title: `${typeLabel} Request`,
          description: `Staff requested ${req.requestType || 'action'} for "${req.currentName || 'Product'}". Verification required.`,
          time: formatDate(createdDate),
          createdAt: createdDate.toISOString(),
          read: readAlertIds.includes(id),
          targetSection: 'inventory',
        })
      }
    })

    // 3. Low stock and out-of-stock items (stock <= 5)
    inventory.forEach((prod) => {
      const stock = Number(prod.stock ?? 0)
      if (stock <= 5) {
        const id = `low-stock-${prod.id}`
        const isOutOfStock = stock <= 0
        const updatedDate = prod.updatedAt?.toDate ? prod.updatedAt.toDate() : (prod.updatedAt?.seconds ? new Date(prod.updatedAt.seconds * 1000) : new Date())

        items.push({
          id,
          type: 'LOW_STOCK',
          title: isOutOfStock ? 'Out of Stock Alert' : 'Low Stock Warning',
          description: `"${prod.name || 'Product'}" has only ${stock} unit(s) remaining in inventory.`,
          time: formatDate(updatedDate),
          createdAt: updatedDate.toISOString(),
          read: readAlertIds.includes(id),
          targetSection: 'inventory',
        })
      }
    })

    // 4. Pending service requests
    serviceRequests.forEach((sr) => {
      if (sr.status === 'pending' || sr.status === 'requested') {
        const id = `srv-req-${sr.id}`
        const createdDate = sr.createdAt?.toDate ? sr.createdAt.toDate() : (sr.createdAt?.seconds ? new Date(sr.createdAt.seconds * 1000) : new Date(sr.createdAt || Date.now()))

        items.push({
          id,
          type: 'SERVICE_BOOKING',
          title: 'New Service Booking',
          description: `${sr.customerName || sr.customerEmail || 'Customer'} requested ${sr.serviceType || sr.serviceName || 'service'}${sr.motorcycleModel ? ` for ${sr.motorcycleModel}` : ''}.`,
          time: formatDate(createdDate),
          createdAt: createdDate.toISOString(),
          read: readAlertIds.includes(id),
          targetSection: 'service-scheduling',
        })
      }
    })

    // Filter out dismissed notifications
    const activeItems = items.filter((n) => !dismissedNotificationIds.includes(n.id))

    // Sort descending by date
    return activeItems.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
  }, [chatNotifications, inventoryChangeRequests, inventory, serviceRequests, dismissedNotificationIds, readAlertIds])

  const unreadNotificationCount = useMemo(() => {
    return notificationItems.filter((item) => !item.read).length
  }, [notificationItems])

  


const allowedSectionIds = useMemo(() => {
  if (['admin', 'superadmin'].includes(accessProfile?.role)) return null

  const roleSections = {
    'staff personnel': ['dashboard', 'inventory', 'service-type', 'service-logs', 'chats-management', 'profile'],
    'mechanics personnel': ['dashboard', 'service-logs', 'chats-management', 'profile'],
  }
  const roleSectionCap = roleSections[accessProfile?.role]

  if (!roleSectionCap) return new Set(['dashboard'])

  const assignedSections = Array.isArray(accessProfile?.accessibleSections)
    ? accessProfile.accessibleSections.filter(Boolean)
    : []
  const requestedSections = assignedSections.length ? assignedSections : roleSectionCap
  const roleAllowedSections = expandAccessibleSections(roleSectionCap)
  const resolvedSections = expandAccessibleSections(requestedSections)
  const allowedSections = new Set(
    [...resolvedSections].filter((sectionId) => roleAllowedSections.has(sectionId)),
  )

  allowedSections.add('dashboard')
  baseSidebarItems.forEach((item) => {
    if (item.subitems?.some((subitem) => allowedSections.has(subitem.id))) {
      allowedSections.add(item.id)
    }
  })

  return allowedSections
}, [accessProfile?.accessibleSections, accessProfile?.role])

useEffect(() => {
  if (!allowedSectionIds) return

  if (!allowedSectionIds.has(activeSection)) {
    setActiveSection('dashboard')
  }
}, [activeSection, allowedSectionIds])

  const sidebarItems = useMemo(() => {
  const pendingInventoryVerifications = inventoryChangeRequests.filter(
    (req) => req.status === 'pending',
  ).length

  return baseSidebarItems
    .filter((item) => item.id !== 'transaction-history' || canManageAccess)
    .map((item) => {
      const visibleSubitems = item.subitems?.filter(
        (subitem) => !allowedSectionIds || allowedSectionIds.has(subitem.id),
      ).map((subitem) => {
        if (subitem.id === 'service-logs') {
          return {
            ...subitem,
            badge: serviceRequests.filter(
              (request) => String(request.status || 'pending').toLowerCase() === 'pending',
            ).length || null,
          }
        }
        if (subitem.id === 'inventory') {
          return {
            ...subitem,
            badge: pendingInventoryVerifications > 0 ? pendingInventoryVerifications : null,
          }
        }
        return subitem
      })

      return item.subitems ? { ...item, subitems: visibleSubitems } : item
    })
    .filter((item) =>
      !allowedSectionIds ||
      allowedSectionIds.has(item.id) ||
      item.subitems?.length > 0,
    )
    .map((item) => {
      if (item.id === 'chats-management') {
        return {
          ...item,
          badge: unreadChatCount > 0 ? unreadChatCount : null,
        }
      }

      return item
    })
  }, [allowedSectionIds, canManageAccess, inventoryChangeRequests, serviceRequests, unreadChatCount])




  const metricCards = useMemo(
    () => [
      {
        title: 'Active Services',
        value: String(activeServices),
        detail: `${filteredServiceRequests.length} total requests synced`,
        tone: 'emerald',
      },
      {
        title: 'Total Revenue (MTD)',
        value: formatCurrency(estimatedRevenue),
        detail: `${completedServices} completed jobs`,
        tone: 'emerald',
      },
      {
        title: 'Avg Service Time',
        value: `${averageServiceHours} hrs`,
        detail: `${filteredTechnicians.length} technicians active`,
        tone: 'red',
      },
      {
        title: 'Tech Availability',
        value: `${techAvailability}%`,
        progress: techAvailability,
      },
    ],
    [activeServices, averageServiceHours, completedServices, estimatedRevenue, filteredServiceRequests.length, filteredTechnicians.length, techAvailability],
  )

  const handleCollectionUpdate = async (collectionName, docId, payload) => {
    // If called without parameters, just trigger a re-subscription refresh
    if (!collectionName || !docId) {
      return
    }

    if (!canEditOperations) {
      setActionMessage({
        type: 'error',
        text: 'Your current role can view this data but cannot change it.',
      })
      return
    }

    try {
      await setDoc(
        doc(db, collectionName, docId),
        {
          ...payload,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      )

      setActionMessage({
        type: 'success',
        text: `${collectionName} updated successfully.`,
      })
    } catch (error) {
      console.error(`Unable to update ${collectionName}`, error)
      setActionMessage({
        type: 'error',
        text: `Unable to update ${collectionName}. ${error.message}`,
      })
    }
  }

  const handleOpenNewUserModal = () => {
    if (!canManageAccess) {
      setActionMessage({
        type: 'error',
        text: 'Only admin or superadmin can open the account registration form.',
      })
      return
    }

    setInviteForm({
      ...defaultInviteForm,
      role: assignableInviteRoles[0] || defaultInviteForm.role,
      temporaryPassword: DEFAULT_OPERATOR_PASSWORD,
    })
    setIsNewUserModalOpen(true)
  }

  const handleCloseNewUserModal = () => {
    setIsNewUserModalOpen(false)
    setInviteForm(defaultInviteForm)
  }

  const handleOpenEditUserModal = (user) => {
    if (!canManageAccess) {
      setActionMessage({
        type: 'error',
        text: 'Only admin or superadmin can edit user access records.',
      })
      return
    }

    const normalizedRole = normalizeText(user?.role)

    if (currentAccessRole === 'admin' && ['admin', 'superadmin'].includes(normalizedRole)) {
      setActionMessage({
        type: 'error',
        text: 'Admin can edit non-admin users only.',
      })
      return
    }

    setSelectedUser(user)
    setEditUserForm({
      fullName: user.fullName || user.displayName || '',
      email: user.email || '',
      role: user.role || assignableRoleOptions[0] || 'customer',
      status: user.status?.toLowerCase() === 'suspended' ? 'inactive' : 'active',
      accessibleSections: user.accessibleSections || [],
    })
    setIsEditUserModalOpen(true)
  }

  const handleCloseEditUserModal = () => {
    setSelectedUser(null)
    setEditUserForm(defaultEditUserForm)
    setIsEditUserModalOpen(false)
  }

  const saveProfileToFirebase = async () => {
    if (!currentUser?.uid) {
      throw new Error('No authenticated profile is available to update.')
    }

    const fullName = profileForm.fullName.trim() || currentUser.displayName || adminName
    const normalizedRole = normalizeText(accessProfile?.role || 'superadmin')
    const privilegedCollectionName =
      normalizedRole === 'superadmin'
        ? 'authorizedSuperadmin'
        : normalizedRole === 'admin'
          ? 'authorizedAdmin'
          : personnelInviteRoles.includes(normalizedRole) || normalizedRole === 'staff'
            ? 'authorizedPersonnel'
            : null
    const profileDocRef =
      privilegedCollectionName && currentUser.email
        ? doc(db, privilegedCollectionName, String(currentUser.email || '').trim().toLowerCase())
        : doc(db, 'users', currentUser.uid)

    if (fullName && fullName !== currentUser.displayName) {
      await updateAuthProfile(currentUser, {
        displayName: fullName,
      })
    }

    let avatarUrl = null
    // Upload avatar to Storage if file exists
    if (profileForm.avatarFile instanceof File) {
      const avatarPath = `users/${currentUser.uid}/avatar.${profileForm.avatarFile.name.split('.').pop()}`
      const avatarRef = ref(storage, avatarPath)
      await uploadBytes(avatarRef, profileForm.avatarFile)
      avatarUrl = await getDownloadURL(avatarRef)
    }

    // Save profile information
    const profileData = {
      fullName,
      phone: profileForm.phone.trim(),
      title: profileForm.title.trim(),
      location: profileForm.location.trim(),
      bio: profileForm.bio.trim(),
      role: accessProfile?.role || 'superadmin',
      email: currentUser.email || '',
      active: true,
      status: 'active',
      updatedAt: serverTimestamp(),
    }
    if (avatarUrl) profileData.avatarUrl = avatarUrl

    await setDoc(
      profileDocRef,
      profileData,
      { merge: true },
    )

    // Save flagship location to settings if coordinates are provided
    if (profileForm.latitude && profileForm.longitude) {
      const flagshipLocationRef = doc(db, 'settings', 'flagshipLocation')
      await setDoc(
        flagshipLocationRef,
        {
          latitude: parseFloat(profileForm.latitude),
          longitude: parseFloat(profileForm.longitude),
          location: profileForm.location.trim() || 'Bykelink Flagship Location',
          updatedAt: serverTimestamp(),
          updatedBy: currentUser.email || currentUser.uid,
        },
        { merge: true },
      )
    }
  }

  const handleProfileFieldChange = (event) => {
    const { name, value } = event.target

    setProfileForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  const handleProfileSave = async (event) => {
    event.preventDefault()
    setIsSaveConfirmOpen(true)
  }

  const doSaveProfile = async () => {
    setIsSaveConfirmOpen(false)
    setIsSubmitting(true)
    try {
      await saveProfileToFirebase()
      toastSuccess('Profile updated successfully!')
      setSavedProfileSnapshot({
        fullName: profileForm.fullName || '',
        title: profileForm.title || '',
        phone: profileForm.phone || '',
        location: profileForm.location || '',
        bio: profileForm.bio || '',
        latitude: profileForm.latitude || '',
        longitude: profileForm.longitude || '',
        avatarUrl: profileForm.avatarUrl || '',
      })
    } catch (error) {
      console.error('Unable to save profile', error)
      toastError(`Unable to save profile: ${error.message}`)
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSectionChange = (sectionId) => {
    if (sectionId === 'transaction-history' && !canManageAccess) return

    if (allowedSectionIds && !allowedSectionIds.has(sectionId)) return

    // If navigating away from profile and there are unsaved changes, confirm
    const hasUnsaved = (() => {
      if (!savedProfileSnapshot) return false

      const normalizePhone = (p) => String(p || '').replace(/\D/g, '')
      const numEqual = (a, b) => {
        const na = parseFloat(a)
        const nb = parseFloat(b)
        if (Number.isNaN(na) && Number.isNaN(nb)) return true
        if (Number.isNaN(na) || Number.isNaN(nb)) return false
        return Math.abs(na - nb) < 0.000001
      }

      // Compare relevant keys with normalization for phone and numeric tolerance for coords
      if (String(profileForm.fullName || '') !== String(savedProfileSnapshot.fullName || '')) return true
      if (String(profileForm.title || '') !== String(savedProfileSnapshot.title || '')) return true
      if (normalizePhone(profileForm.phone) !== normalizePhone(savedProfileSnapshot.phone)) return true
      if (String(profileForm.location || '') !== String(savedProfileSnapshot.location || '')) return true
      if (String(profileForm.bio || '') !== String(savedProfileSnapshot.bio || '')) return true
      if (!numEqual(profileForm.latitude, savedProfileSnapshot.latitude)) return true
      if (!numEqual(profileForm.longitude, savedProfileSnapshot.longitude)) return true
      if (String(profileForm.avatarUrl || '') !== String(savedProfileSnapshot.avatarUrl || '')) return true

      return false
    })()

    if (activeSection === 'profile' && sectionId !== 'profile' && hasUnsaved) {
      setPendingSection(sectionId)
      setIsLeaveConfirmOpen(true)
      return
    }

    if (sectionId === 'profile' && activeSection !== 'profile') {
      profileReturnSectionRef.current = activeSection
    }

    setActiveSection(sectionId)

    // Update URL based on section type
    if (sectionId !== 'dashboard') {
      onNavigateDashboardPath?.(dashboardPath)
    } else {
      onNavigateDashboardPath?.(dashboardPath)
    }

    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsSidebarOpen(false)
    }
  }

  const handleProfileToggle = () => {
    handleSectionChange(
      activeSection === 'profile' ? profileReturnSectionRef.current : 'profile',
    )
  }

  const markConversationNotificationsRead = useCallback(async (conversationId) => {
    if (!conversationId) {
      return
    }

    try {
      const unreadMessagesQuery = query(
        collection(db, 'conversations', conversationId, 'messages'),
        where('read', '==', false),
      )

      const unreadMessagesSnap = await getDocs(unreadMessagesQuery)

      const updates = unreadMessagesSnap.docs
        .filter((messageDoc) => {
          const messageData = messageDoc.data()
          return (
            messageData.type === 'user' ||
            messageData.sender === 'user' ||
            Boolean(messageData.senderId) ||
            (messageData.senderName && messageData.senderName !== 'BYKELINK Admin')
          )
        })
        .map((messageDoc) => updateDoc(messageDoc.ref, { read: true }))

      await Promise.all(updates)
    } catch (error) {
      console.error('Error marking conversation messages as read:', error)
    }

    unreadConversationCountsRef.current[conversationId] = 0
    await refreshUnreadCountsFromFirestore()

    setChatNotifications((current) =>
      current.map((item) =>
        item.conversationId === conversationId
          ? { ...item, read: true }
          : item,
      ),
    )
  }, [refreshUnreadCountsFromFirestore])

  useEffect(() => {
    if (activeSection !== 'chats-management') {
      return
    }

    let isCancelled = false

    const syncAllUnreadChats = async () => {
      try {
        const conversationsSnap = await getDocs(collection(db, 'conversations'))
        const nextCounts = {}
        let totalUnread = 0

        for (const conversationDoc of conversationsSnap.docs) {
          const conversationId = conversationDoc.id
          const unreadMessagesQuery = query(
            collection(db, 'conversations', conversationId, 'messages'),
            where('read', '==', false),
          )
          const unreadMessagesSnap = await getDocs(unreadMessagesQuery)

          const customerUnreadMessages = unreadMessagesSnap.docs.filter((messageDoc) => {
            const messageData = messageDoc.data()
            return (
              messageData.type === 'user' ||
              messageData.sender === 'user' ||
              Boolean(messageData.senderId) ||
              (messageData.senderName && messageData.senderName !== 'BYKELINK Admin')
            )
          })

          nextCounts[conversationId] = customerUnreadMessages.length
          totalUnread += customerUnreadMessages.length

          if (customerUnreadMessages.length > 0) {
            await Promise.all(
              customerUnreadMessages.map((messageDoc) => updateDoc(messageDoc.ref, { read: true })),
            )
          }
        }

        if (isCancelled) {
          return
        }

        unreadConversationCountsRef.current = nextCounts
        setUnreadChatCount(totalUnread)
        setChatNotifications((current) =>
          current.map((item) =>
            item.type === 'CHAT' && item.conversationId
              ? { ...item, read: true }
              : item,
          ),
        )
      } catch (error) {
        console.error('Error syncing unread chat state:', error)
      }
    }

    syncAllUnreadChats()

    return () => {
      isCancelled = true
    }
  }, [activeSection])

  const handleNotificationClick = useCallback((notification) => {
    if (!notification) {
      return
    }

    // Mark clicked alert as read
    setReadAlertIds((prev) => {
      const next = Array.from(new Set([...prev, notification.id]))
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('bykelink-read-alert-ids', JSON.stringify(next))
      }
      return next
    })

    // Handle password reset notifications from admin reset action
    if (notification.type === 'PASSWORD_RESET') {
      setIsNotificationsOpen(false)
      setActiveSection('user-management')
      
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setIsSidebarOpen(false)
      }
      
      return
    }

    // Handle password reset request notifications from "Contact Administrator"
    if (notification.type === 'PASSWORD_RESET_REQUEST') {
      setIsNotificationsOpen(false)
      setActiveSection('user-management')
      
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setIsSidebarOpen(false)
      }
      
      return
    }

    // Handle inventory verification requests and low stock alerts
    if (notification.type === 'INVENTORY_REQUEST' || notification.type === 'LOW_STOCK') {
      setIsNotificationsOpen(false)
      setActiveSection('inventory')
      
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setIsSidebarOpen(false)
      }
      
      return
    }

    // Handle service booking alerts
    if (notification.type === 'SERVICE_BOOKING') {
      setIsNotificationsOpen(false)
      setActiveSection('service-scheduling')
      
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setIsSidebarOpen(false)
      }
      
      return
    }

    // Handle chat notifications
    if (notification?.conversationId) {
      markConversationNotificationsRead(notification.conversationId)
      setChatFocusRequest({
        conversationId: notification.conversationId,
        requestedAt: Date.now(),
      })
      setIsNotificationsOpen(false)
      setActiveSection('chats-management')

      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setIsSidebarOpen(false)
      }
      return
    }

    if (notification.targetSection) {
      setIsNotificationsOpen(false)
      setActiveSection(notification.targetSection)
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setIsSidebarOpen(false)
      }
    }
  }, [markConversationNotificationsRead])

  const handleDeleteNotification = useCallback((notificationId) => {
    setNotificationConfirmation({
      type: 'delete',
      notificationId,
      title: 'Delete Notification',
      message: 'Are you sure you want to delete this notification? This action cannot be undone.',
    })
  }, [])

  const handleDeleteAllNotifications = useCallback(() => {
    setNotificationConfirmation({
      type: 'deleteAll',
      title: 'Delete All Notifications',
      message: 'Are you sure you want to delete all notifications? This action cannot be undone.',
    })
  }, [])

  const handleMarkAllAsRead = useCallback(() => {
    const allIds = notificationItems.map((n) => n.id)
    setReadAlertIds((prev) => {
      const next = Array.from(new Set([...prev, ...allIds]))
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('bykelink-read-alert-ids', JSON.stringify(next))
      }
      return next
    })
    setChatNotifications((current) =>
      current.map((item) => ({ ...item, read: true }))
    )
  }, [notificationItems])

  const confirmNotificationAction = useCallback(async () => {
    if (!notificationConfirmation) return

    if (notificationConfirmation.type === 'delete' && notificationConfirmation.notificationId) {
      const id = notificationConfirmation.notificationId
      setDismissedNotificationIds((prev) => {
        const next = Array.from(new Set([...prev, id]))
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('bykelink-dismissed-notifications', JSON.stringify(next))
        }
        return next
      })
      setChatNotifications((current) =>
        current.filter((item) => item.id !== id)
      )
    } else if (notificationConfirmation.type === 'deleteAll') {
      const allIds = notificationItems.map((n) => n.id)
      setDismissedNotificationIds((prev) => {
        const next = Array.from(new Set([...prev, ...allIds]))
        if (typeof window !== 'undefined') {
          window.localStorage.setItem('bykelink-dismissed-notifications', JSON.stringify(next))
        }
        return next
      })
      setChatNotifications([])
    }

    setNotificationConfirmation(null)
  }, [notificationConfirmation, notificationItems])

  const handleLogoutClick = useCallback(() => {
    setLogoutConfirmation(true)
  }, [])

  const confirmLogout = useCallback(() => {
    setLogoutConfirmation(false)
    onSignOut?.()
  }, [onSignOut])

 const handleEditUserSave = async (event) => {
  event.preventDefault();

  if (!selectedUser?.email) {
    setActionMessage({
      type: 'error',
      text: 'No user record is selected for editing.',
    });
    return;
  }

  setIsSubmitting(true);

  try {
    const fullName = editUserForm.fullName.trim();
    if (!fullName) {
      throw new Error('Enter the full name before saving the user profile.');
    }

    const normalizedRole = normalizeText(editUserForm.role);

    const updatePayload = {
      fullName,
      status: editUserForm.status,
      accessibleSections: editUserForm.accessibleSections || [],
      temporaryPassword: selectedUser.temporaryPassword || DEFAULT_OPERATOR_PASSWORD,
      mustChangePassword: Boolean(selectedUser.mustChangePassword || selectedUser.requiresPasswordChange),
      firstLoginRequired: Boolean(selectedUser.firstLoginRequired || selectedUser.requiresPasswordChange),
      createdAt: selectedUser.createdAt,
      invitedBy: selectedUser.invitedBy,
    };

    // ✅ Call service layer
    await saveAccessAssignment(editUserForm.email.trim().toLowerCase(), normalizedRole, updatePayload);

    setActionMessage({
      type: 'success',
      text: `${editUserForm.email} updated successfully.`,
    });
    handleCloseEditUserModal();
  } catch (error) {
    console.error('Unable to update user', error);
    setActionMessage({
      type: 'error',
      text: `Unable to update the user. ${error.message}`,
    });
  } finally {
    setIsSubmitting(false);
  }
};

  const handleGrantAccess = async (event) => {
    event.preventDefault()

    if (!canManageAccess) {
      setActionMessage({
        type: 'error',
        text: 'Only admin or superadmin can manage account access assignments.',
      })
      return
    }

    const normalizedEmail = inviteForm.email.trim().toLowerCase()

    if (!normalizedEmail) {
      setActionMessage({
        type: 'error',
        text: 'Enter an email address before granting access.',
      })
      return
    }

    setIsSubmitting(true)

    try {
      if (!inviteForm.fullName.trim()) {
        throw new Error('Enter the operator full name before creating the account entry.')
      }

      const normalizedInviteRole = normalizeText(inviteForm.role)

      
      // Define allowed roles dynamically
      const allowedRolesByUser = {
        admin: ['staff personnel', 'mechanics personnel', 'cashier personnel', 'customer'],
        superadmin: [
          'staff personnel',
          'mechanics personnel',
          'cashier personnel',
          'customer',
          'admin',
          'superadmin',
        ],
      }

      const assignableInviteRoles = allowedRolesByUser[currentAccessRole] || []

      if (!assignableInviteRoles.includes(normalizedInviteRole)) {
        throw new Error(
          currentAccessRole === 'admin'
            ? 'Admin accounts can only register non-admin operator roles.'
            : 'You are not allowed to assign that role from this console.',
        )
      }

      const temporaryPassword = DEFAULT_OPERATOR_PASSWORD
      const createOperatorAccount = httpsCallable(functions, 'createOperatorAccount')
      const response = await createOperatorAccount({
        ...inviteForm,
        email: normalizedEmail,
        temporaryPassword,
      })

      await saveAccessAssignment(normalizedEmail, inviteForm.role, {
        ...inviteForm,
        temporaryPassword,
        mustChangePassword: true,
        firstLoginRequired: true,
        accessibleSections: inviteForm.menuAccess || [],
      })

      setActionMessage({
        type: 'success',
        text:
          response?.data?.message ||
          `${normalizedEmail} now has ${inviteForm.role} access and a verification email has been prepared.`,
      })
      handleCloseNewUserModal()
    } catch (error) {
      console.error('Unable to grant access', error)
      setActionMessage({
        type: 'error',
        text: `Unable to save access assignment. ${error.message}`,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleArchiveUser = async (user) => {
    if (!canManageAccess) {
      setActionMessage({
        type: 'error',
        text: 'Only admin or superadmin can archive user accounts.',
      })
      return
    }

    const normalizedRole = normalizeText(user.role)

    if (currentAccessRole === 'admin' && ['admin', 'superadmin'].includes(normalizedRole)) {
      setActionMessage({
        type: 'error',
        text: 'Admin can archive non-admin users only.',
      })
      return
    }

    setIsSubmitting(true)

    try {
      const archiveOperatorAccount = httpsCallable(functions, 'archiveOperatorAccount')
      const response = await archiveOperatorAccount({
        email: String(user.email || '').trim().toLowerCase(),
        role: normalizedRole,
        fullName: user.fullName || user.displayName || '',
      })

      setActionMessage({
        type: 'success',
        text: response?.data?.message || `${user.email || user.id} moved to Delete Archived.`,
      })
    } catch (error) {
      console.error('Unable to archive user', error)
      setActionMessage({
        type: 'error',
        text: `Unable to archive the user. ${error.message}`,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteArchivedUserPermanently = async (user) => {
    if (currentAccessRole !== 'superadmin') {
      setActionMessage({
        type: 'error',
        text: 'Only superadmin can permanently delete archived records.',
      })
      return
    }

    setIsSubmitting(true)

    try {
      const deleteArchivedUserPermanently = httpsCallable(functions, 'deleteArchivedUserPermanently')
      const response = await deleteArchivedUserPermanently({
        email: String(user.email || '').trim().toLowerCase(),
      })

      setActionMessage({
        type: 'success',
        text: response?.data?.message || `${user.email || user.id} permanently deleted.`,
      })
    } catch (error) {
      console.error('Unable to permanently delete archived user', error)
      setActionMessage({
        type: 'error',
        text: `Unable to permanently delete the archived user. ${error.message}`,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleResetPassword = (user) => {
    if (!canManageAccess) {
      setActionMessage({
        type: 'error',
        text: 'Only admin or superadmin can reset user passwords.',
      })
      return
    }

    const normalizedRole = normalizeText(user.role)

    if (currentAccessRole === 'admin' && ['admin', 'superadmin'].includes(normalizedRole)) {
      setActionMessage({
        type: 'error',
        text: 'Admin can reset non-admin passwords only.',
      })
      return
    }

    // Show confirmation modal
    setResetPasswordConfirmation({
      user,
    })
  }

  const handleConfirmResetPassword = async () => {
    if (!resetPasswordConfirmation?.user) return

    const user = resetPasswordConfirmation.user
    setIsResetPasswordLoading(true)

    try {
      const resetUserPassword = httpsCallable(functions, 'resetUserPassword')
      const response = await resetUserPassword({
        email: String(user.email || '').trim().toLowerCase(),
        newPassword: DEFAULT_OPERATOR_PASSWORD,
      })

      // Add notification for password reset
      const newNotification = {
        id: `password-reset-${user.email}-${Date.now()}`,
        type: 'PASSWORD_RESET',
        title: 'Password Reset',
        description: `Password reset for ${user.fullName || user.email}`,
        read: false,
        createdAt: new Date().toISOString(),
        email: user.email,
      }

      const updatedNotifications = [newNotification, ...chatNotifications]
      setChatNotifications(updatedNotifications)
      
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('bykelink-chat-notifications', JSON.stringify(updatedNotifications))
      }

      setActionMessage({
        type: 'success',
        text: response?.data?.message || `${user.email || user.id} password reset to default.`,
      })
      
      toastSuccess(`Password reset successfully for ${user.fullName || user.email}`)
      
      // Close modal after success
      setResetPasswordConfirmation(null)
    } catch (error) {
      console.error('Unable to reset user password', error)
      setActionMessage({
        type: 'error',
        text: `Unable to reset password. ${error.message}`,
      })
      
      toastError(`Failed to reset password: ${error.message}`)
      
      // Close modal after error
      setResetPasswordConfirmation(null)
    } finally {
      setIsResetPasswordLoading(false)
    }
  }

  const handleCleanupDuplicatedPrivilegedUsers = async () => {
    if (!canManageAccess) {
      setActionMessage({
        type: 'error',
        text: 'Only admin or superadmin can clean up duplicated users.',
      })
      return
    }



    setIsSubmitting(true)

    try {
      const cleanupPrivilegedUserDuplicates = httpsCallable(functions, 'cleanupPrivilegedUserDuplicates')
      const response = await cleanupPrivilegedUserDuplicates({})
      const deletedCount = Number(response?.data?.deletedCount || 0)
      const skippedCount = Number(response?.data?.skippedCount || 0)

      setActionMessage({
        type: 'success',
        text: `Duplicate cleanup finished. Deleted ${deletedCount} stale user record(s) and skipped ${skippedCount}.`,
      })
    } catch (error) {
      console.error('Unable to clean up duplicated privileged users', error)
      setActionMessage({
        type: 'error',
        text: `Unable to clean up duplicated privileged users. ${error.message}`,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  

  const isDashboardView = activeSection === 'dashboard'

  const renderActiveSection = () => {
    switch (activeSection) {
      case 'service-logs':
      case 'service-requests':
        return (
          <ServiceRequestsSection
            requests={filteredServiceRequests}
            canEditOperations={canEditOperations}
            serviceStatusOptions={serviceStatusOptions}
            handleCollectionUpdate={handleCollectionUpdate}
            formatCurrency={formatCurrency}
            formatDate={formatDate}
            getStatusClasses={getStatusClasses}
            currentUser={currentUser}
            currentAccessRole={currentAccessRole}
            isDarkMode={isDarkMode}
          />
        )
      case 'chats-management':
        return (
          <ChatsManagementSection
            searchTerm={searchTerm}
            serviceBookings={serviceRequests}
            isBookingsLoading={loadingState.serviceRequests}
            onUnreadCountChange={recountUnreadMessages}
            focusRequest={chatFocusRequest}
            onConversationRead={markConversationNotificationsRead}
            isDarkMode={isDarkMode}
          />
        )
      case 'service-management':
      case 'service-type':
        return (
          <ServiceTypeSection
            currentUser={currentUser}
            currentAccessRole={currentAccessRole}
            isDarkMode={isDarkMode}
          />
        )
      case 'technicians':
        return (
          <TechniciansSection
            technicians={filteredTechnicians}
            canEditOperations={canEditOperations}
            technicianStatusOptions={technicianStatusOptions}
            handleCollectionUpdate={handleCollectionUpdate}
            getStatusClasses={getStatusClasses}
            isDarkMode={isDarkMode}
          />
        )
      case 'analytics':
        return (
          <AnalyticsSection
            users={users}
            authorizedAdmins={[...authorizedAdmins, ...authorizedPersonnel]}
            serviceRequests={serviceRequests}
            inventory={inventory}
            technicians={technicians}
            roleOptions={roleOptions}
            normalizeText={normalizeText}
            transactionLogs={transactionLogs}
            isDarkMode={isDarkMode}
            currentUser={currentUser}
          />
        )
      case 'transaction-history':
        return canManageAccess ? (
          <TransactionHistorySection
            auditLogs={auditLogs}
            transactionLogs={transactionLogs}
            formatDate={formatDate}
            formatCurrency={formatCurrency}
            isDarkMode={isDarkMode}
          />
        ) : null
      case 'user-management':
        return (
          <UserManagementSection
            filteredAuthorizedAdmins={filteredAuthorizedAccess}
            filteredUsers={filteredUsers}
            archivedUsers={archivedUsers}
            canManageAccess={canManageAccess}
            currentAccessRole={currentAccessRole}
            isSubmitting={isSubmitting}
            roleOptions={assignableRoleOptions}
            formatDate={formatDate}
            getStatusClasses={getStatusClasses}
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            onOpenNewUserModal={handleOpenNewUserModal}
            onCleanupDuplicates={handleCleanupDuplicatedPrivilegedUsers}
            onEditUser={handleOpenEditUserModal}
            onArchiveUser={handleArchiveUser}
            onDeleteArchivedUser={handleDeleteArchivedUserPermanently}
            onResetPassword={handleResetPassword}
            isDarkMode={isDarkMode}
          />
        )
      case 'profile':
        return (
          <ProfileSection
            currentUser={currentUser}
            accessProfile={accessProfile}
            profileForm={profileForm}
            onProfileFieldChange={handleProfileFieldChange}
            onProfileSave={handleProfileSave}
            isSubmitting={isSubmitting}
            formatDate={formatDate}
            isDarkMode={isDarkMode}
          />
        )
      case 'inventory':
        return (
          <InventorySection
            items={filteredInventory}
            canEditOperations={canEditOperations}
            inventoryStatusOptions={inventoryStatusOptions}
            handleCollectionUpdate={handleCollectionUpdate}
            formatCurrency={formatCurrency}
            getStatusClasses={getStatusClasses}
            categories={categories}
            models={models}
            variants={variants}
            currentUser={currentUser}
            currentAccessRole={currentAccessRole}
            inventoryChangeRequests={inventoryChangeRequests}
            isDarkMode={isDarkMode}
          />
        )
      case 'inventory-reports':
        return (
          <InventoryReportsSection
            inventoryLogs={inventoryLogs}
            formatDate={formatDate}
            formatCurrency={formatCurrency}
            currentUser={currentUser}
            isDarkMode={isDarkMode}
          />
        )
      case 'inventory-delete-archived':
        return (
          <InventoryDeleteArchivedSection
            deletedItems={deletedItems}
            canDeletePermanently={currentAccessRole === 'superadmin'}
            handleCollectionUpdate={handleCollectionUpdate}
            formatDate={formatDate}
            formatCurrency={formatCurrency}
            isDarkMode={isDarkMode}
            currentUser={currentUser}
            currentAccessRole={currentAccessRole}
          />
        )
      case 'master-categories':
      case 'master-models':
      case 'master-variants':
        return (
          <MasterDataManagementSection
            dataType={activeSection}
            categories={categories}
            models={models}
            canEditOperations={canEditOperations}
            currentUser={currentUser}
            currentAccessRole={currentAccessRole}
            isDarkMode={isDarkMode}
          />
        )
      default:
        return (
          <DashboardSection
            chartBars={chartBars}
            technicians={mechanicsWithActiveJobs}
            serviceRequests={filteredServiceRequests}
            setActiveSection={handleSectionChange}
            getStatusClasses={getStatusClasses}
            isDarkMode={isDarkMode}
          />
        )
    }
  }

  return (
    <div 
      className="superadmin-shell font-['Manrope']"
      data-theme={isDarkMode ? 'dark' : 'light'}
    >
      <NotificationsDrawer
        open={isNotificationsOpen}
        notifications={notificationItems}
        onClose={() => setIsNotificationsOpen(false)}
        onNotificationClick={handleNotificationClick}
        onDeleteNotification={handleDeleteNotification}
        onDeleteAllNotifications={handleDeleteAllNotifications}
        onMarkAllAsRead={handleMarkAllAsRead}
      />

      <NewUserModal
        open={isNewUserModalOpen}
        onClose={handleCloseNewUserModal}
        inviteForm={inviteForm}
        setInviteForm={setInviteForm}
        onSubmit={handleGrantAccess}
        availableRoles={assignableInviteRoles}
        canManageAccess={canManageAccess}
        isSubmitting={isSubmitting}
        isDarkMode={isDarkMode}
        currentUserRole={currentAccessRole}
      />

      <EditUserModal
        open={isEditUserModalOpen}
        onClose={handleCloseEditUserModal}
        editUserForm={editUserForm}
        setEditUserForm={setEditUserForm}
        onSubmit={handleEditUserSave}
        availableRoles={assignableRoleOptions}
        currentUserRole={userProfile?.role}
        canManageAccess={canManageAccess}
        isSubmitting={isSubmitting}
        sidebarItems={baseSidebarItems}
        userMenuAccess={userProfile?.accessibleSections ?? []}
      />

      <ConfirmationModal
        open={!!notificationConfirmation}
        title={notificationConfirmation?.title || ''}
        message={notificationConfirmation?.message || ''}
        confirmText={notificationConfirmation?.type === 'deleteAll' ? 'Delete All' : 'Delete'}
        cancelText="Cancel"
        onConfirm={confirmNotificationAction}
        onCancel={() => setNotificationConfirmation(null)}
        isDangerous={true}
        isDarkMode={isDarkMode}
      />

      <ConfirmationModal
        open={logoutConfirmation}
        title="Logout?"
        message="Are you sure you want to log out? You will need to sign in again to access this dashboard."
        confirmText="Logout"
        cancelText="Cancel"
        onConfirm={confirmLogout}
        onCancel={() => setLogoutConfirmation(false)}
        isDangerous={true}
        isDarkMode={isDarkMode}
      />

      <ConfirmationModal
        open={!!resetPasswordConfirmation}
        title="Reset Password?"
        message={`Reset password for ${resetPasswordConfirmation?.user?.fullName || resetPasswordConfirmation?.user?.email || 'this user'} to default (${DEFAULT_OPERATOR_PASSWORD})?`}
        confirmText="Reset Password"
        cancelText="Cancel"
        onConfirm={handleConfirmResetPassword}
        onCancel={() => setResetPasswordConfirmation(null)}
        isDangerous={true}
        isDarkMode={isDarkMode}
        isLoading={isResetPasswordLoading}
      />

      <SuperAdminSidebar
        sidebarItems={sidebarItems}
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((current) => !current)}
        onCloseSidebar={() => setIsSidebarOpen(false)}
        onNavigateHome={onNavigateHome}
        onSignOut={handleLogoutClick}
        consoleLabel={consoleLabel}
        userMenuAccess={allowedSectionIds ? [...allowedSectionIds] : userProfile?.accessibleSections ?? []}
      />

      <div className="superadmin-content">
        <SuperAdminHeader
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
          sectionTitle={sectionTitle}
          isDarkMode={isDarkMode}
          onToggleTheme={toggleTheme}
          onToggleNotifications={handleToggleNotifications}
          notificationCount={unreadNotificationCount}
          adminName={adminName}
          consoleLabel={consoleLabel}
          onOpenProfile={handleProfileToggle}
          avatarUrl={profileForm.avatarUrl}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((current) => !current)}
        />

        {/* Confirmation modals for save and unsaved-navigation */}
        <ConfirmationModal
          open={isSaveConfirmOpen}
          title="Save Profile & Location"
          message="Do you want to save the profile and location now?"
          confirmText="Save"
          cancelText="Cancel"
          onConfirm={doSaveProfile}
          onCancel={() => setIsSaveConfirmOpen(false)}
          isDangerous={false}
          isDarkMode={isDarkMode}
        />

        <ConfirmationModal
          open={isLeaveConfirmOpen}
          title="Unsaved Changes"
          message="You have unsaved changes. Leave without saving?"
          confirmText="Leave"
          cancelText="Stay"
          onConfirm={() => {
            // discard changes and navigate
            if (savedProfileSnapshot) {
              setProfileForm(() => ({ ...savedProfileSnapshot }))
            }
            setIsLeaveConfirmOpen(false)
            if (pendingSection) setActiveSection(pendingSection)
            setPendingSection(null)
          }}
          onCancel={() => setIsLeaveConfirmOpen(false)}
          isDangerous={true}
          isDarkMode={isDarkMode}
        />

        <main
          className={`superadmin-main ml-64 px-4 pb-12 pt-24 sm:px-6 lg:px-8 ${
            isSidebarOpen ? 'is-sidebar-open' : 'is-sidebar-collapsed'
          }`}
        >
          {isDashboardView && (
            <div className="mb-10 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="font-['Epilogue'] text-4xl font-black uppercase italic tracking-tighter sm:text-5xl">
                  Velocity <span className="text-red-600">Pulse</span>
                </h2>
              </div>

              <div className="flex flex-wrap gap-4">
                <div className="superadmin-summary-card flex flex-col rounded-lg px-4 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Signed in as</span>
                  <span className="font-['Epilogue'] text-sm font-bold text-white">{adminEmail}</span>
                </div>
                
              </div>
            </div>
          )}

          {actionMessage && (
            <div
              className={`superadmin-alert mb-6 rounded-2xl border px-4 py-3 text-sm ${
                actionMessage.type === 'success'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                  : 'border-red-500/30 bg-red-500/10 text-red-200'
              }`}
            >
              {actionMessage.text}
            </div>
          )}

          {isDashboardView && (
            <div className="dashboard-kpi-grid mb-8 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              {metricCards.map((card) => (
                <article
                  key={card.title}
                  className="superadmin-summary-card superadmin-metric-card dashboard-kpi-card"
                >
                  <p className="dashboard-kpi-label">{card.title}</p>
                  <h3 className="dashboard-kpi-value">{card.value}</h3>

                  {card.progress !== undefined ? (
                    <div className="dashboard-kpi-progress">
                      <div style={{ width: `${card.progress}%` }} />
                    </div>
                  ) : (
                    <div className={`dashboard-kpi-detail ${card.tone === 'emerald' ? 'is-positive' : 'is-negative'}`}>
                      {card.tone === 'emerald' ? (
                        <TrendingUpRoundedIcon sx={{ fontSize: 16 }} />
                      ) : (
                        <TrendingDownRoundedIcon sx={{ fontSize: 16 }} />
                      )}
                      {card.detail}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}

          {renderActiveSection()}
        </main>
      </div>
    </div>
  )
}
