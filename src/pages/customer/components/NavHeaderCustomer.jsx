import { useState, useEffect, useRef } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import MenuRoundedIcon from '@mui/icons-material/MenuRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import NotificationsRoundedIcon from '@mui/icons-material/NotificationsRounded'
import ChatRoundedIcon from '@mui/icons-material/ChatRounded'
import AccountCircleRoundedIcon from '@mui/icons-material/AccountCircleRounded'
import PersonRoundedIcon from '@mui/icons-material/PersonRounded'
import BuildRoundedIcon from '@mui/icons-material/BuildRounded'
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded'
import bykelinkLogo from '../../../assets/bykelinklogo.png'
import { db } from '../../../firebase'
import ConfirmationModal from '../../superadmin/components/ConfirmationModal'

export default function NavHeaderCustomer({
  currentUser,
  isDarkMode,
  onNavigateToShowroom,
  onNavigateToService,
  onNavigateToMessages,
  onNavigateToProfile,
  onNavigateToServiceBookings,
  onSignOut,
  activePage = 'service',
  unreadNotifications = [],
  userAvatar = null,
}) {
  const [notifications, setNotifications] = useState([])
  const [messageCount, setMessageCount] = useState(0)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false)
  const [isProfileDrawerOpen, setIsProfileDrawerOpen] = useState(false)
  const [isDrawerAnimating, setIsDrawerAnimating] = useState(false)
  const [isLogoutConfirmationOpen, setIsLogoutConfirmationOpen] = useState(false)
  const bookingAssignmentRef = useRef(new Map())
  const hasLoadedBookingAssignmentRef = useRef(false)
  const bookingStatusRef = useRef(new Map())
  const hasLoadedBookingStatusRef = useRef(false)

  useEffect(() => {
    if (!currentUser?.uid) {
      setNotifications([])
      bookingAssignmentRef.current = new Map()
      hasLoadedBookingAssignmentRef.current = false
      bookingStatusRef.current = new Map()
      hasLoadedBookingStatusRef.current = false
      setMessageCount(0)
      return undefined
    }

    const bookingQuery = query(
      collection(db, 'serviceBookings'),
      where('customerId', '==', currentUser.uid),
    )

    const unsubscribe = onSnapshot(
      bookingQuery,
      (snapshot) => {
        const liveNotifications = snapshot.docs.map((docSnap) => {
          const data = docSnap.data()
          const serviceNames = Array.isArray(data.serviceTitles) && data.serviceTitles.length > 0
            ? data.serviceTitles
            : (data.service ? String(data.service).split(',').map((item) => item.trim()).filter(Boolean) : ['Service Booking'])
          const bookingStatus = String(data.status || 'Pending')
          const createdAt = data.createdAt?.toDate?.() || new Date()

          return {
            id: docSnap.id,
            title: 'Service Booking',
            message: `${serviceNames.join(', ')} — ${bookingStatus}`,
            timestamp: createdAt.toLocaleString(),
            read: false,
          }
        })

        const assignmentNotifications = snapshot.docs
          .map((docSnap) => {
            const data = docSnap.data()
            const assignedTechnician = String(data.assignedTechnician || '').trim()
            const previousAssignment = bookingAssignmentRef.current.get(docSnap.id)

            if (!assignedTechnician || !hasLoadedBookingAssignmentRef.current || previousAssignment) {
              return null
            }

            return {
              id: `mechanic-assigned-${docSnap.id}`,
              title: 'Mechanic Assigned',
              message: `${data.assignedTechnicianName || 'A mechanic'} has been assigned to your ${data.service || 'service'} booking.`,
              timestamp: data.updatedAt?.toDate?.()?.toLocaleString?.() || 'Just now',
              read: false,
            }
          })
          .filter(Boolean)

        const completionNotifications = snapshot.docs
          .map((docSnap) => {
            const data = docSnap.data()
            const bookingStatus = String(data.status || '').trim().toLowerCase()
            const previousStatus = bookingStatusRef.current.get(docSnap.id)
            const wasCompleted = previousStatus === 'services completed' || previousStatus === 'completed'
            const isCompleted = bookingStatus === 'services completed' || bookingStatus === 'completed'

            if (!isCompleted || wasCompleted || !hasLoadedBookingStatusRef.current) {
              return null
            }

            return {
              id: `service-completed-${docSnap.id}`,
              title: 'Service Completed',
              message: `Your ${data.service || 'service'} booking has been completed.`,
              timestamp: data.updatedAt?.toDate?.()?.toLocaleString?.() || 'Just now',
              read: false,
            }
          })
          .filter(Boolean)

        const currentAssignmentState = new Map(
          snapshot.docs.map((docSnap) => [docSnap.id, String(docSnap.data().assignedTechnician || '').trim()]),
        )
        const currentStatusState = new Map(
          snapshot.docs.map((docSnap) => [docSnap.id, String(docSnap.data().status || '').trim().toLowerCase()]),
        )
        setNotifications((current) => {
          const existingUnreadAssignments = current.filter(
            (notification) => notification.id.startsWith('mechanic-assigned-') && !notification.read,
          )
          const existingUnreadCompletions = current.filter(
            (notification) => notification.id.startsWith('service-completed-') && !notification.read,
          )

          return [
            ...assignmentNotifications,
            ...existingUnreadAssignments.filter(
              (existing) => !assignmentNotifications.some((next) => next.id === existing.id),
            ),
            ...completionNotifications,
            ...existingUnreadCompletions.filter(
              (existing) => !completionNotifications.some((next) => next.id === existing.id),
            ),
            ...liveNotifications,
          ]
        })
        bookingAssignmentRef.current = currentAssignmentState
        hasLoadedBookingAssignmentRef.current = true
        bookingStatusRef.current = currentStatusState
        hasLoadedBookingStatusRef.current = true
      },
      (error) => {
        console.error('Unable to load live customer notifications:', error)
        setNotifications([])
      },
    )

    return () => unsubscribe()
  }, [currentUser?.uid])

  useEffect(() => {
    if (!currentUser?.uid) {
      setMessageCount(0)
      return undefined
    }

    const conversationQuery = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', currentUser.uid),
    )

    const unsubscribe = onSnapshot(
      conversationQuery,
      async (snapshot) => {
        try {
          let unreadTotal = 0

          for (const conversationDoc of snapshot.docs) {
            const messagesQuery = query(
              collection(db, 'conversations', conversationDoc.id, 'messages'),
              where('read', '==', false),
              where('senderId', '!=', currentUser.uid),
            )

            const messageSnapshot = await getDocs(messagesQuery)
            unreadTotal += messageSnapshot.docs.length
          }

          setMessageCount(unreadTotal)
        } catch (error) {
          console.error('Unable to load customer message count:', error)
          setMessageCount(0)
        }
      },
      (error) => {
        console.error('Unable to subscribe to customer conversations:', error)
        setMessageCount(0)
      },
    )

    return () => unsubscribe()
  }, [currentUser?.uid])

  // Trigger animation when drawer opens
  useEffect(() => {
    if (isProfileDrawerOpen) {
      // Small delay to ensure the element is mounted before animating
      const timer = setTimeout(() => {
        setIsDrawerAnimating(true)
      }, 10)
      return () => clearTimeout(timer)
    } else {
      // Delay to allow animation to complete before unmounting
      const timer = setTimeout(() => {
        setIsDrawerAnimating(false)
      }, 350)
      return () => clearTimeout(timer)
    }
  }, [isProfileDrawerOpen])

  // Prevent body and html scroll when profile drawer is open
  useEffect(() => {
    console.log('Profile drawer state changed:', isProfileDrawerOpen)
    if (isProfileDrawerOpen) {
      document.body.style.overflow = 'hidden'
      document.documentElement.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'auto'
      document.documentElement.style.overflow = 'auto'
    }
    return () => {
      document.body.style.overflow = 'auto'
      document.documentElement.style.overflow = 'auto'
    }
  }, [isProfileDrawerOpen])

  const handleLogout = () => {
    setIsMenuOpen(false)
    setIsProfileDrawerOpen(false)
    setIsLogoutConfirmationOpen(true)
  }

  const confirmLogout = () => {
    setIsLogoutConfirmationOpen(false)
    onSignOut?.()
  }

  const handleNotificationClick = (notifId) => {
    setNotifications((current) =>
      current.map((notif) =>
        notif.id === notifId
          ? {
              ...notif,
              read: true,
            }
          : notif,
      ),
    )
  }

  const combinedNotifications = notifications

  const handleProfileClick = () => {
    console.log('My Profile clicked, calling onNavigateToProfile:', onNavigateToProfile)
    if (onNavigateToProfile) {
      onNavigateToProfile()
      setTimeout(() => setIsProfileDrawerOpen(false), 50)
    } else {
      console.error('onNavigateToProfile callback not provided!')
    }
  }

  const isActive = (page) => activePage === page

  return (
    <>
      <header 
        className={`sticky top-0 border-b ${isDarkMode ? 'border-slate-800/60 bg-slate-950/95' : 'border-slate-200 bg-white/95'} backdrop-blur-md shadow-lg transition-all duration-300`}
        style={{
          zIndex: isProfileDrawerOpen ? 30 : 50,
        }}
      >
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          {/* Logo Section */}
          <div className="flex items-center gap-3 cursor-pointer">
            <img src={bykelinkLogo} alt="Bykelink logo" className="h-10 w-10 rounded-lg bg-red-600 p-1.5" />
            <div>
              <p className="text-sm font-black uppercase tracking-tight text-red-600">BYEKLINK MOTOR INC.</p>
              <p className="hidden sm:block text-[9px] font-bold text-slate-500 tracking-widest">TAGUM CITY</p>
            </div>
          </div>

          {/* Desktop Navigation */}
          <nav className={`hidden items-center gap-8 lg:flex`}>
            <button
              onClick={onNavigateToShowroom}
              className={`border-b-2 pb-1 text-[11px] font-bold uppercase tracking-[0.2em] transition-colors ${
                isActive('showroom')
                  ? 'border-red-600 text-red-600'
                  : isDarkMode
                    ? 'border-transparent text-slate-400 hover:text-white'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Showroom
            </button>
            <button
              onClick={onNavigateToService}
              className={`border-b-2 pb-1 text-[11px] font-bold uppercase tracking-[0.2em] transition-colors ${
                isActive('service')
                  ? 'border-red-600 text-red-600'
                  : isDarkMode
                    ? 'border-transparent text-slate-400 hover:text-white'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              Service
            </button>
            <button
              onClick={onNavigateToServiceBookings}
              className={`border-b-2 pb-1 text-[11px] font-bold uppercase tracking-[0.2em] transition-colors ${
                isActive('service-bookings')
                  ? 'border-red-600 text-red-600'
                  : isDarkMode
                    ? 'border-transparent text-slate-400 hover:text-white'
                    : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              My Service Bookings
            </button>
          </nav>

          {/* Desktop Right Section */}
          <div className="hidden items-center gap-3 lg:flex">
            <div className="relative">
              <button
                type="button"
                onClick={onNavigateToMessages}
                className={`relative flex h-10 w-10 items-center justify-center rounded-lg transition ${
                  isActive('messages')
                    ? 'bg-red-600/10 text-red-600'
                    : isDarkMode
                      ? 'text-slate-400 hover:text-red-600 hover:bg-slate-800'
                      : 'text-slate-600 hover:text-red-600 hover:bg-slate-100'
                }`}
                aria-label={`Messages${messageCount > 0 ? `, ${messageCount} unread` : ''}`}
                title="Messages"
              >
                <ChatRoundedIcon sx={{ fontSize: 20 }} />
                {messageCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
                    {messageCount > 99 ? '99+' : messageCount}
                  </span>
                )}
              </button>
            </div>

            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setIsNotificationDrawerOpen(!isNotificationDrawerOpen)}
                className={`relative p-2 rounded-lg transition ${isDarkMode ? 'text-slate-400 hover:text-red-600 hover:bg-slate-800' : 'text-slate-600 hover:text-red-600 hover:bg-slate-100'}`}
              >
                <NotificationsRoundedIcon sx={{ fontSize: 22 }} />
                <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-600 rounded-full animate-pulse"></span>
              </button>

              {/* Notification Drawer */}
              {isNotificationDrawerOpen && (
                <div className={`absolute right-0 mt-2 w-80 rounded-lg shadow-2xl z-50 border ${isDarkMode ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <div className={`p-4 border-b ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
                    <h3 className={`font-bold text-sm ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>Notifications</h3>
                  </div>
                  <div className="max-h-96 overflow-y-auto space-y-0">
                    {combinedNotifications.length > 0 ? (
                      combinedNotifications.map((notif) => (
                        <div
                          key={notif.id}
                          onClick={() => handleNotificationClick(notif.id)}
                          className={`border-b px-4 py-3 transition ${isDarkMode ? 'border-slate-800 hover:bg-slate-800/50' : 'border-slate-200 hover:bg-slate-50'} ${!notif.read ? (isDarkMode ? 'bg-slate-800/30' : 'bg-red-50') : ''}`}
                        >
                          <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{notif.title}</p>
                          <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{notif.message}</p>
                          <p className={`text-xs mt-2 ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>{notif.timestamp}</p>
                        </div>
                      ))
                    ) : (
                      <p className={`p-4 text-center text-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>No notifications</p>
                    )}
                  </div>
                </div>
              )}
            </div>


            {/* Profile Button */}
            <button
              type="button"
              onClick={() => setIsProfileDrawerOpen((isOpen) => !isOpen)}
              aria-label={isProfileDrawerOpen ? 'Close profile drawer' : 'Open profile drawer'}
              aria-expanded={isProfileDrawerOpen}
              className={`p-1 rounded-lg transition ${isDarkMode ? 'text-slate-400 hover:text-red-600 hover:bg-slate-800' : 'text-slate-600 hover:text-red-600 hover:bg-slate-100'}`}
            >
              {userAvatar ? (
                <img
                  src={userAvatar}
                  alt="User Avatar"
                  className="w-7 h-7 rounded-full object-cover border border-red-600"
                />
              ) : (
                <AccountCircleRoundedIcon sx={{ fontSize: 28 }} />
              )}
            </button>
          </div>

          {/* Mobile Menu Toggle */}
          <button
            onClick={() => {
              setIsMenuOpen(!isMenuOpen)
              setIsNotificationDrawerOpen(false)
              setIsProfileDrawerOpen(false)
            }}
            className={`rounded-lg border p-2 transition lg:hidden ${isDarkMode ? 'border-slate-700 text-slate-400 hover:text-white hover:border-slate-500' : 'border-slate-300 text-slate-600 hover:text-slate-900 hover:border-slate-400'}`}
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <CloseRoundedIcon sx={{ fontSize: 18 }} /> : <MenuRoundedIcon sx={{ fontSize: 18 }} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <nav className={`space-y-2 border-t px-4 py-3 sm:px-6 lg:hidden ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
            <button onClick={onNavigateToShowroom} className={`block text-[11px] font-bold uppercase tracking-[0.2em] ${isDarkMode ? 'text-slate-400' : 'text-slate-600'} w-full text-left`}>
              Showroom
            </button>
            <button onClick={onNavigateToService} className={`block text-[11px] font-bold uppercase tracking-[0.2em] ${isDarkMode ? 'text-slate-400' : 'text-slate-600'} w-full text-left`}>
              Service
            </button>
            <button onClick={onNavigateToServiceBookings} className={`block text-[11px] font-bold uppercase tracking-[0.2em] ${isDarkMode ? 'text-slate-400' : 'text-slate-600'} w-full text-left`}>
              My Service Bookings
            </button>
            <button onClick={onNavigateToMessages} className={`block text-[11px] font-bold uppercase tracking-[0.2em] ${isDarkMode ? 'text-slate-400' : 'text-slate-600'} w-full text-left`}>
              Messages
            </button>
            <a className={`block text-[11px] font-bold uppercase tracking-[0.2em] ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Support</a>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-2 border-t border-slate-700 pt-3 text-left text-[11px] font-bold uppercase tracking-[0.2em] text-red-600"
            >
              <LogoutRoundedIcon sx={{ fontSize: 18 }} />
              Logout
            </button>
          </nav>
        )}
      </header>

      {/* Right-side Profile Slide Panel and Overlay rendered at root level */}
      {isProfileDrawerOpen && (
        <>
          {/* Keep the profile trigger above the drawer so it can toggle closed. */}
          <div
            className="fixed inset-x-0 bottom-0 z-40 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsProfileDrawerOpen(false)}
            style={{ 
              top: '65px',
              pointerEvents: 'auto',
              opacity: isDrawerAnimating ? 1 : 0,
              transition: 'opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          />

          {/* Slide Panel */}
          <div
            className={`fixed right-0 top-[65px] h-[calc(100dvh-65px)] w-80 z-50 shadow-2xl overflow-y-auto ${
              isDarkMode ? 'bg-slate-950 border-l border-slate-800' : 'bg-white border-l border-slate-200'
            }`}
            style={{
              transform: isDrawerAnimating ? 'translateX(0)' : 'translateX(100%)',
              transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {/* Header */}
            <div className={`sticky top-0 z-10 border-b p-4 sm:p-6 flex items-center justify-between gap-3 ${
              isDarkMode ? 'bg-slate-950 border-slate-800' : 'bg-white border-slate-200'
            }`}>
              <div className="flex items-center gap-3 flex-1">
                {userAvatar ? (
                  <img
                    src={userAvatar}
                    alt="User Avatar"
                    className="w-12 h-12 rounded-full object-cover border border-red-600 shrink-0"
                  />
                ) : (
                  <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-slate-800 border-red-600' : 'bg-slate-100 border-red-600'}`}>
                    <PersonRoundedIcon sx={{ fontSize: 24, color: '#dc2626' }} />
                  </div>
                )}
                <div>
                  <p className={`text-sm font-semibold ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{currentUser?.displayName || 'User'}</p>
                  <p className={`text-xs ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{currentUser?.email}</p>
                </div>
              </div>
              <button
                onClick={() => setIsProfileDrawerOpen(false)}
                className={`p-1 rounded-lg transition shrink-0 ${isDarkMode ? 'hover:bg-slate-800 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-600'}`}
              >
                <CloseRoundedIcon sx={{ fontSize: 24 }} />
              </button>
            </div>

            {/* Menu Items */}
            <div className="space-y-1 p-4 sm:p-6">
              <button
                onClick={handleProfileClick}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition ${
                  isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <PersonRoundedIcon sx={{ fontSize: 20 }} />
                <span className="text-sm font-medium">My Profile</span>
              </button>

              <button
                onClick={() => {
                  if (onNavigateToServiceBookings) {
                    onNavigateToServiceBookings()
                    setTimeout(() => setIsProfileDrawerOpen(false), 50)
                  }
                }}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition ${
                  isDarkMode ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <BuildRoundedIcon sx={{ fontSize: 20 }} />
                <span className="text-sm font-medium">My Service Bookings</span>
              </button>

              <div className={`border-t my-4 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`} />

              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 px-3 py-3 rounded-lg font-semibold transition text-sm bg-red-600 text-white hover:bg-red-700"
              >
                <LogoutRoundedIcon sx={{ fontSize: 20 }} />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </>
      )}
      <ConfirmationModal
        open={isLogoutConfirmationOpen}
        title="Log out"
        message="Are you sure you want to log out? You will need to sign in again to access your account."
        confirmText="Log out"
        cancelText="Cancel"
        isDangerous
        isDarkMode={isDarkMode}
        onConfirm={confirmLogout}
        onCancel={() => setIsLogoutConfirmationOpen(false)}
      />
    </>
  )
}
