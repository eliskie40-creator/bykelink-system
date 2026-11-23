import { useState, useEffect } from 'react'
// import CircularProgress from '@mui/material/CircularProgress' // Duplicate import removed

// Live countdown hook
// ...existing code...

// CountdownTimer component
function CountdownTimer({ startedAt, estimatedHours }) {
  const countdown = useCountdown(startedAt, estimatedHours, true);
  return <span className="mt-1 text-xs font-mono text-green-400">{countdown}</span>;
}
import CircularProgress from '@mui/material/CircularProgress'

// Live countdown hook (must be after all components to avoid unused warning)
function useCountdown(startedAt, estimatedHours, active) {
  const [countdown, setCountdown] = useState('');
  useEffect(() => {
    if (!active || !startedAt || !estimatedHours) return;
    function updateCountdown() {
      const start = startedAt?.toDate ? startedAt.toDate() : new Date(startedAt);
      const end = new Date(start.getTime() + estimatedHours * 60 * 60 * 1000);
      const now = new Date();
      const diff = end - now;
      if (diff <= 0) {
        setCountdown('Time elapsed');
        return;
      }
      const hours = Math.floor(diff / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setCountdown(`${hours}h ${minutes}m ${seconds}s remaining`);
    }
    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [startedAt, estimatedHours, active]);
  return countdown;
}
import { collection, query, where, onSnapshot } from 'firebase/firestore'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import HourglassEmptyRoundedIcon from '@mui/icons-material/HourglassEmptyRounded'
import BuildRoundedIcon from '@mui/icons-material/BuildRounded'
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded'
import { db } from '../../firebase'
import NavHeaderCustomer from './components/NavHeaderCustomer'

export default function CustomerServiceBookingsPage({
  currentUser,
  isDarkMode,
  onNavigateToShowroom,
  onNavigateToService,
  onNavigateToMessages,
  onNavigateToProfile,
  onNavigateToServiceBookings,
  onSignOut,
}) {
  const [bookings, setBookings] = useState([])
  const [filteredBookings, setFilteredBookings] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Fetch service bookings
  useEffect(() => {
    if (!currentUser?.uid) return

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsLoading(true)
    const bookingsRef = collection(db, 'serviceBookings')
    const q = query(bookingsRef, where('customerId', '==', currentUser.uid))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedBookings = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        setBookings(fetchedBookings)
        setIsLoading(false)
      },
      (error) => {
        console.error('Error fetching bookings:', error)
        setIsLoading(false)
      },
    )

    return () => unsubscribe()
  }, [currentUser?.uid])

  // Filter bookings based on search and status
  useEffect(() => {
    let filtered = bookings

    if (statusFilter !== 'all') {
      filtered = filtered.filter((booking) => booking.status?.toLowerCase() === statusFilter.toLowerCase())
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (booking) =>
          booking.service?.toLowerCase().includes(query) ||
          booking.model?.toLowerCase().includes(query) ||
          booking.year?.toString().includes(query) ||
          booking.id?.toLowerCase().includes(query),
      )
    }

    // Sort by creation date (newest first)
    filtered.sort((a, b) => {
      const dateA = a.createdAt?.toDate?.() || new Date(0)
      const dateB = b.createdAt?.toDate?.() || new Date(0)
      return dateB - dateA
    })

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFilteredBookings(filtered)
  }, [bookings, searchQuery, statusFilter])

  const getStatusBadgeColor = (status) => {
    if (status?.toLowerCase() === 'pending') return 'bg-yellow-100 text-yellow-800'
    if (status?.toLowerCase() === 'confirmed') return 'bg-blue-100 text-blue-800'
    if (status?.toLowerCase() === 'completed') return 'bg-green-100 text-green-800'
    if (status?.toLowerCase() === 'cancelled') return 'bg-red-100 text-red-800'
    return 'bg-gray-100 text-gray-800'
  }

  const getStatusDarkBadgeColor = (status) => {
    if (status?.toLowerCase() === 'pending') return 'bg-yellow-900/30 text-yellow-400'
    if (status?.toLowerCase() === 'confirmed') return 'bg-blue-900/30 text-blue-400'
    if (status?.toLowerCase() === 'completed') return 'bg-green-900/30 text-green-400'
    if (status?.toLowerCase() === 'cancelled') return 'bg-red-900/30 text-red-400'
    return 'bg-white/10 text-white/70'
  }

  const getStatusIcon = (status) => {
    if (status?.toLowerCase() === 'pending')
      return <HourglassEmptyRoundedIcon sx={{ fontSize: 18 }} className="animate-pulse" />
    if (status?.toLowerCase() === 'confirmed') return <BuildRoundedIcon sx={{ fontSize: 18 }} />
    if (status?.toLowerCase() === 'completed') return <CheckCircleRoundedIcon sx={{ fontSize: 18 }} />
    return <AccessTimeRoundedIcon sx={{ fontSize: 18 }} />
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A'
    const date = timestamp.toDate?.() || new Date(timestamp)
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
  }

  const formatBookingDate = (booking) => {
    if (booking.bookingDateLabel) return booking.bookingDateLabel

    const dateKey = booking.bookingDateKey || booking.dateKey
    if (dateKey) {
      const [year, month, day] = String(dateKey).split('-').map(Number)
      const date = new Date(year, month - 1, day)
      if (!Number.isNaN(date.getTime())) {
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      }
    }

    return formatDate(booking.createdAt)
  }

  const formatTime = (label) => label || 'N/A'

  return (
    <div
      className={`min-h-screen overflow-x-hidden font-['Manrope'] ${
        isDarkMode ? 'bg-linear-to-b from-slate-950 via-slate-900 to-slate-950 text-[#e5e2e1]' : 'bg-white text-slate-900'
      }`}
    >
      <NavHeaderCustomer
        currentUser={currentUser}
        isDarkMode={isDarkMode}
        activePage="service-bookings"
        unreadNotifications={[]}
        onNavigateToShowroom={onNavigateToShowroom}
        onNavigateToService={onNavigateToService}
        onNavigateToMessages={onNavigateToMessages}
        onNavigateToProfile={onNavigateToProfile}
        onNavigateToServiceBookings={onNavigateToServiceBookings}
        onSignOut={onSignOut}
      />

      <main className="pt-20 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          {/* Header */}
          <div className="mb-12">
            <h1 className={`text-3xl sm:text-4xl md:text-5xl font-black mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              <span className={isDarkMode ? 'text-white' : 'text-gray-600'}>MY SERVICE</span>
              <span className="text-red-600"> BOOKINGS</span>
            </h1>
            <p className={`text-sm font-bold uppercase tracking-widest ${isDarkMode ? 'text-white/60' : 'text-gray-500'}`}>
              Track the status of your service appointments
            </p>
          </div>

          {/* Search and Filter Section */}
          <div className="mb-8 space-y-4">
            {/* Search Bar */}
            <div className={`rounded-2xl border p-4 flex items-center gap-3 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'}`}>
              <SearchRoundedIcon sx={{ fontSize: 20 }} className={isDarkMode ? 'text-white/40' : 'text-gray-400'} />
              <input
                type="text"
                placeholder="Search by service, vehicle, reference ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`flex-1 outline-none text-sm ${isDarkMode ? 'bg-transparent text-white placeholder-white/40' : 'bg-transparent text-gray-900 placeholder-gray-400'}`}
              />
            </div>

            {/* Status Filter */}
            <div className="flex gap-3 overflow-x-auto pb-2">
              {['all', 'pending', 'confirmed', 'completed', 'cancelled'].map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-4 py-2 rounded-lg font-bold text-sm uppercase whitespace-nowrap transition ${
                    statusFilter === status
                      ? 'bg-red-600 text-white'
                      : isDarkMode
                        ? 'bg-white/10 text-white hover:bg-white/20'
                        : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  {status === 'all' ? 'All Bookings' : status}
                </button>
              ))}
            </div>
          </div>

          {/* Bookings List */}
          <div className="space-y-4">
            {isLoading ? (
              <div className="text-center py-12">
                <p className={isDarkMode ? 'text-white/60' : 'text-gray-500'}>Loading bookings...</p>
              </div>
            ) : filteredBookings.length === 0 ? (
              <div
                className={`rounded-2xl border-2 border-dashed p-12 text-center ${
                  isDarkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'
                }`}
              >
                <BuildRoundedIcon sx={{ fontSize: 48 }} className={isDarkMode ? 'text-white/20 mx-auto mb-3' : 'text-gray-300 mx-auto mb-3'} />
                <p className={`font-bold text-lg ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>No Service Bookings Found</p>
                <p className={`text-sm mt-2 ${isDarkMode ? 'text-white/60' : 'text-gray-600'}`}>
                  {searchQuery || statusFilter !== 'all' ? 'Try adjusting your search or filters' : 'Start by booking a service appointment'}
                </p>
              </div>
            ) : (
              filteredBookings.map((booking) => (
                <div
                  key={booking.id}
                  className={`rounded-2xl border p-6 transition hover:shadow-lg ${
                    isDarkMode ? 'border-white/10 bg-white/5 hover:bg-white/10' : 'border-gray-200 bg-gray-50 hover:bg-white'
                  }`}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Left Column */}
                    <div className="space-y-4">
                      {/* Status Badge and Reference */}
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${isDarkMode ? 'text-white/60' : 'text-gray-500'}`}>
                            Reference ID
                          </p>
                          <p className={`font-mono text-sm font-black ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                            {booking.id?.substring(0, 12).toUpperCase() || 'N/A'}
                          </p>
                        </div>
                        <div
                          className={`px-3 py-1 rounded-full text-xs font-bold uppercase flex items-center gap-1.5 ${
                            isDarkMode ? getStatusDarkBadgeColor(booking.status) : getStatusBadgeColor(booking.status)
                          }`}
                        >
                          {getStatusIcon(booking.status)}
                          {booking.status || 'Unknown'}
                        </div>
                      </div>

                      {/* Service Details */}
                      <div>
                        <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${isDarkMode ? 'text-white/60' : 'text-gray-500'}`}>
                          Services
                        </p>
                        <p className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{booking.service || 'No services'}</p>
                      </div>

                      {/* Vehicle Info */}
                      <div>
                        <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${isDarkMode ? 'text-white/60' : 'text-gray-500'}`}>
                          Vehicle
                        </p>
                        <p className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {booking.model} {booking.year}
                        </p>
                      </div>

                      {/* Problem Description */}
                      <div>
                        <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${isDarkMode ? 'text-white/60' : 'text-gray-500'}`}>
                          Problem Description
                        </p>
                        <p className={`text-sm ${isDarkMode ? 'text-white/70' : 'text-gray-700'}`}>
                          {booking.problemDescription || 'No description provided'}
                        </p>
                      </div>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-4">
                      {/* Booking submission and schedule details */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${isDarkMode ? 'text-white/60' : 'text-gray-500'}`}>
                            Book Submitted
                          </p>
                          <p className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                            {formatDate(booking.createdAt)}
                          </p>
                        </div>
                        <div>
                          <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${isDarkMode ? 'text-white/60' : 'text-gray-500'}`}>
                            Booking Schedule Date
                          </p>
                          <p className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                            {formatBookingDate(booking)}
                          </p>
                        </div>
                        <div>
                          <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${isDarkMode ? 'text-white/60' : 'text-gray-500'}`}>
                            Time Slot
                          </p>
                          <p className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{formatTime(booking.bookingTime)}</p>
                        </div>
                      </div>

                      {/* Estimated Duration */}
                      <div>
                        <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${isDarkMode ? 'text-white/60' : 'text-gray-500'}`}>
                          Estimated Duration
                        </p>
                        <p className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {booking.estimatedHours || 'N/A'} hours
                        </p>
                      </div>

                      {/* Technician Info */}
                      <div>
                        <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${isDarkMode ? 'text-white/60' : 'text-gray-500'}`}>
                          Assigned Technician
                        </p>
                        <p className={`text-sm font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                          {booking.assignedTechnician || 'To be assigned'}
                        </p>
                      </div>

                      {/* Status Timeline - Horizontal Modern */}
                      <div className="mt-6 pt-4 border-t border-white/10">
                        <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${isDarkMode ? 'text-white/60' : 'text-gray-500'}`}>
                          Status Timeline
                        </p>
                        <div className="flex flex-col items-center">
                          <div className="flex items-center w-full justify-between max-w-xs mx-auto">
                            {/* Booking Submitted */}
                            {(() => {
                              const status = (booking.status || '').toLowerCase();
                              const isCompleted = status === 'services completed' || status === 'completed';
                              const isInProgress = status === 'in progress';
                              // Booking Submitted
                              return <>
                                <div className="flex flex-col items-center flex-1">
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${status ? 'bg-green-500 border-green-500 shadow-lg' : isDarkMode ? 'bg-slate-800 border-white/20' : 'bg-gray-100 border-gray-300'}`}>
                                    <span className={`w-3 h-3 rounded-full ${status ? 'bg-white' : isDarkMode ? 'bg-slate-700' : 'bg-gray-300'}`}></span>
                                  </div>
                                  <span className={`mt-2 text-xs font-medium text-center ${status ? (isDarkMode ? 'text-green-400' : 'text-green-600') : isDarkMode ? 'text-white/40' : 'text-gray-400'}`}>Booking<br/>Submitted</span>
                                </div>
                                {/* Line */}
                                <div className="flex-1 h-1 mx-1 bg-linear-to-r from-green-400 via-green-200 to-gray-300 rounded-full" style={{ minWidth: 24, maxWidth: 48 }}></div>
                                {/* Technician Assigned / In Progress */}
                                <div className="flex flex-col items-center flex-1">
                                  {isInProgress ? (
                                    <div className="relative flex items-center justify-center">
                                      <CircularProgress size={32} thickness={5} color="success" />
                                      <span className="absolute w-3 h-3 rounded-full bg-green-500"></span>
                                    </div>
                                  ) : (
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${status === 'confirmed' || isCompleted || isInProgress ? 'bg-green-500 border-green-500 shadow-lg' : isDarkMode ? 'bg-slate-800 border-white/20' : 'bg-gray-100 border-gray-300'}`}>
                                      <span className={`w-3 h-3 rounded-full ${status === 'confirmed' || isCompleted || isInProgress ? 'bg-white' : isDarkMode ? 'bg-slate-700' : 'bg-gray-300'}`}></span>
                                    </div>
                                  )}
                                  <span className={`mt-2 text-xs font-medium text-center ${status === 'confirmed' || isCompleted || isInProgress ? (isDarkMode ? 'text-green-400' : 'text-green-600') : isDarkMode ? 'text-white/40' : 'text-gray-400'}`}>
                                    {isInProgress ? 'In Progress' : 'Technician'}<br/>{isInProgress ? ' ' : 'Assigned'}
                                  </span>
                                  {/* Countdown Timer */}
                                  {isInProgress && (
                                    <CountdownTimer startedAt={booking.startedAt} estimatedHours={booking.estimatedHours} />
                                  )}
                                </div>
                                {/* Line */}
                                <div className="flex-1 h-1 mx-1 bg-linear-to-r from-green-400 via-green-200 to-gray-300 rounded-full" style={{ minWidth: 24, maxWidth: 48 }}></div>
                                {/* Service Completed */}
                                <div className="flex flex-col items-center flex-1">
                                  <div className={`w-6 h-6 rounded-full flex items-center justify-center border-2 transition-all duration-300 ${isCompleted ? 'bg-green-500 border-green-500 shadow-lg' : isDarkMode ? 'bg-slate-800 border-white/20' : 'bg-gray-100 border-gray-300'}`}>
                                    <span className={`w-3 h-3 rounded-full ${isCompleted ? 'bg-white' : isDarkMode ? 'bg-slate-700' : 'bg-gray-300'}`}></span>
                                  </div>
                                  <span className={`mt-2 text-xs font-medium text-center ${isCompleted ? (isDarkMode ? 'text-green-400' : 'text-green-600') : isDarkMode ? 'text-white/40' : 'text-gray-400'}`}>Service<br/>Completed</span>
                                </div>
                              </>;
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
