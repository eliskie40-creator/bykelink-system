import './ServiceRequestsSection.css'
import { useMemo, useState } from 'react'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import SaveRoundedIcon from '@mui/icons-material/SaveRounded'
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded'
import useMechanicsPersonnel from '../../../hooks/useMechanicsPersonnel'
import { logSystemAuditEvent } from '../../../services/auditLogService'
import AssignMechanicModal from '../components/AssignMechanicModal'

export default function ServiceRequestsSection({
  requests,
  canEditOperations,
  handleCollectionUpdate,
  formatCurrency,
  formatDate,
  getStatusClasses,
  isDarkMode = true,
  currentUser = null,
  currentAccessRole = '',
  mechanics: _mechanics = [], // mechanics can be passed as prop, but default to []
}) {
  // Fetch mechanics from Firestore
  const mechanicsFromFirestore = useMechanicsPersonnel();
  const mechanics = mechanicsFromFirestore.length ? mechanicsFromFirestore : _mechanics;

  // Helper to get conditional text colors
  const getTextClass = (intensity) => {
    if (isDarkMode) {
      return intensity === 'main' ? 'text-white' : intensity === 'secondary' ? 'text-white/70' : 'text-white/40'
    }
    return intensity === 'main' ? 'text-gray-900' : intensity === 'secondary' ? 'text-gray-600' : 'text-gray-500'
  }

  const getBgClass = () => isDarkMode ? 'bg-white/5' : 'bg-gray-100'
  
  const [assignModalOpen, setAssignModalOpen] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [scheduleModal, setScheduleModal] = useState(null)
  const [scheduleForm, setScheduleForm] = useState({ date: '', time: '' })
  const [isScheduleSaving, setIsScheduleSaving] = useState(false)
  const [scheduleMonth, setScheduleMonth] = useState(() => new Date())
  const [scheduleError, setScheduleError] = useState('')

  const formatDateKey = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const parseTimeToMinutes = (bookingTime = '') => {
    const match = String(bookingTime).trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
    if (!match) return null
    let hours = Number(match[1])
    const minutes = Number(match[2])
    const period = match[3]?.toUpperCase()
    if (period === 'PM' && hours !== 12) hours += 12
    if (period === 'AM' && hours === 12) hours = 0
    return (hours * 60) + minutes
  }

  const formatScheduleDate = (dateKey = '') => {
    if (!dateKey) return 'No date selected'

    const [year, month, day] = dateKey.split('-').map(Number)
    const date = new Date(year, (month || 1) - 1, day || 1)

    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    })
  }

  const getTimeInputValue = (bookingTime = '') => {
    const match = String(bookingTime).trim().match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i)
    if (!match) return ''

    let hours = Number(match[1])
    const minutes = Number(match[2])
    const period = match[3]?.toUpperCase()

    if (period === 'PM' && hours !== 12) hours += 12
    if (period === 'AM' && hours === 12) hours = 0

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  const openScheduleEditor = (request) => {
    if (
      !canEditOperations ||
      String(request?.status || 'Pending').trim().toLowerCase() !== 'pending'
    ) return

    setScheduleModal(request)
    setScheduleError('')
    const initialDate = request.bookingDateKey || request.dateKey || ''
    setScheduleMonth(initialDate
      ? new Date(`${initialDate}T00:00:00`)
      : new Date())
    setScheduleForm({
      date: initialDate,
      time: getTimeInputValue(request.bookingTime),
    })
  }

  const closeScheduleEditor = () => {
    if (isScheduleSaving) return
    setScheduleModal(null)
    setScheduleForm({ date: '', time: '' })
    setScheduleError('')
  }

  const scheduleCalendarDays = useMemo(() => {
    if (!scheduleModal) return []

    const year = scheduleMonth.getFullYear()
    const month = scheduleMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const days = []

    for (let index = 0; index < firstDay.getDay(); index += 1) {
      days.push(null)
    }

    for (let day = 1; day <= lastDay.getDate(); day += 1) {
      days.push(new Date(year, month, day))
    }

    return days
  }, [scheduleModal, scheduleMonth])

  const scheduleDurationMinutes = Math.round((scheduleModal?.estimatedHours ?? 4) * 60)
  const scheduleTimeSlots = useMemo(() => {
    const slots = []
    for (let minutes = 8 * 60; minutes < 18 * 60; minutes += 60) {
      const hours24 = Math.floor(minutes / 60)
      const minute = minutes % 60
      const meridiem = hours24 >= 12 ? 'PM' : 'AM'
      const hours12 = hours24 % 12 || 12
      slots.push({
        minutes,
        label: `${String(hours12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${meridiem}`,
      })
    }
    return slots
  }, [])

  const getScheduleDayStatus = (date) => {
    if (!scheduleModal || !date) return { unavailable: true, availableCount: 0 }

    const dateKey = formatDateKey(date)
    const today = new Date()
    const isPast = date < new Date(today.getFullYear(), today.getMonth(), today.getDate())
    if (isPast) return { unavailable: true, availableCount: 0 }

    let availableCount = 0
    scheduleTimeSlots.forEach((slot) => {
      if (!isScheduleTimeUnavailable(dateKey, slot.minutes)) availableCount += 1
    })

    return { unavailable: availableCount === 0, availableCount }
  }

  const isScheduleTimeUnavailable = (dateKey, startMinutes) => {
    if (!scheduleModal) return true

    const endMinutes = startMinutes + scheduleDurationMinutes
    if (endMinutes > 18 * 60) return true

    const today = new Date()
    const isToday = dateKey === formatDateKey(today)
    const currentMinutes = (today.getHours() * 60) + today.getMinutes()
    if (isToday && startMinutes <= currentMinutes) return true

    return requests.some((booking) => {
      if (booking.id === scheduleModal.id) return false
      const bookingDate = booking.bookingDateKey || booking.dateKey
      if (String(bookingDate || '') !== dateKey) return false
      const status = String(booking.status || 'Pending').trim().toLowerCase()
      if (['cancelled', 'completed', 'services completed'].includes(status)) return false

      let existingStart = Number(booking.bookingStartMinutes)
      if (!existingStart) existingStart = parseTimeToMinutes(booking.bookingTime) || 0
      let existingEnd = Number(booking.bookingEndMinutes)
      if (!existingEnd) existingEnd = existingStart + Math.round((booking.estimatedHours ?? 4) * 60)

      return startMinutes < existingEnd && existingStart < endMinutes
    })
  }

  const saveSchedule = async () => {
    if (!scheduleModal?.id || !scheduleForm.date || !scheduleForm.time) return

    const [hours, minutes] = scheduleForm.time.split(':').map(Number)
    const startMinutes = (hours * 60) + minutes
    if (isScheduleTimeUnavailable(scheduleForm.date, startMinutes)) {
      setScheduleError('This date and time is not available. Please choose another schedule.')
      return
    }
    setScheduleError('')

    setIsScheduleSaving(true)
    try {
      const meridiem = hours >= 12 ? 'PM' : 'AM'
      const displayHours = hours % 12 || 12
      const bookingTime = `${String(displayHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${meridiem}`
      const estimatedMinutes = Math.round((scheduleModal.estimatedHours ?? 4) * 60)

      await handleCollectionUpdate('serviceBookings', scheduleModal.id, {
        bookingDateKey: scheduleForm.date,
        dateKey: scheduleForm.date,
        bookingDateLabel: formatScheduleDate(scheduleForm.date),
        bookingTime,
        bookingStartMinutes: startMinutes,
        bookingEndMinutes: startMinutes + estimatedMinutes,
      })

      await logSystemAuditEvent({
        module: 'Service',
        action: 'SERVICE_SCHEDULE_UPDATED',
        summary: `Rescheduled booking ${scheduleModal.bookingId || scheduleModal.id} to ${formatScheduleDate(scheduleForm.date)} at ${bookingTime}`,
        targetType: 'serviceBooking',
        targetId: scheduleModal.id,
        targetName: scheduleModal.customerName || scheduleModal.customer || scheduleModal.id,
        previousData: {
          bookingDateKey: scheduleModal.bookingDateKey || '',
          bookingTime: scheduleModal.bookingTime || '',
        },
        newData: {
          bookingDateKey: scheduleForm.date,
          bookingTime,
        },
        currentUser,
        accessRole: currentAccessRole,
      })

      closeScheduleEditor()
    } finally {
      setIsScheduleSaving(false)
    }
  }

  const handleAcceptRequest = (request) => {
    setSelectedRequest(request)
    setAssignModalOpen(true)
  }

  const handleAssignMechanic = async (mechanicId) => {
    if (selectedRequest && mechanicId) {
      const selectedMechanic = mechanics.find((mechanic) => mechanic.id === mechanicId)
      const mechanicName = selectedMechanic?.name || selectedMechanic?.fullName || selectedMechanic?.email || mechanicId

      await handleCollectionUpdate('serviceBookings', selectedRequest.id, {
        status: 'In Progress',
        assignedTechnician: mechanicId,
        assignedTechnicianName: mechanicName,
      })

      await logSystemAuditEvent({
        module: 'Service',
        action: 'SERVICE_MECHANIC_ASSIGNED',
        summary: `Assigned mechanic ${mechanicName} to booking ${selectedRequest.bookingId || selectedRequest.id} (Status: In Progress)`,
        targetType: 'serviceBooking',
        targetId: selectedRequest.id,
        targetName: selectedRequest.customerName || selectedRequest.customer || selectedRequest.id,
        previousData: { status: selectedRequest.status || 'Pending' },
        newData: { status: 'In Progress', assignedTechnicianName: mechanicName },
        currentUser,
        accessRole: currentAccessRole,
      })
    }
    setAssignModalOpen(false)
    setSelectedRequest(null)
  }

  const handleCloseModal = () => {
    setAssignModalOpen(false)
    setSelectedRequest(null)
  }

  const getBookingTimeRange = (bookingTime, estimatedHours) => {
    if (!bookingTime) return ''
    
    // Parse booking time (format: HH:MM AM/PM or HH:MM)
    const timeRegex = /(\d{1,2}):(\d{2})\s*(AM|PM)?/i
    const match = bookingTime.match(timeRegex)
    
    if (!match) return bookingTime
    
    let hours = parseInt(match[1])
    const minutes = parseInt(match[2])
    const period = match[3] ? match[3].toUpperCase() : null
    
    // Convert to 24-hour format if AM/PM provided
    if (period) {
      if (period === 'PM' && hours !== 12) hours += 12
      if (period === 'AM' && hours === 12) hours = 0
    }
    
    // Create a date object to calculate end time
    const startDate = new Date()
    startDate.setHours(hours, minutes, 0, 0)
    
    const endDate = new Date(startDate.getTime() + (estimatedHours || 0) * 60 * 60 * 1000)
    
    // Format end time
    let endHours = endDate.getHours()
    const endMinutes = endDate.getMinutes()
    let endPeriod = 'AM'
    
    if (endHours >= 12) {
      endPeriod = 'PM'
      if (endHours > 12) endHours -= 12
    } else if (endHours === 0) {
      endHours = 12
    }
    
    const startTimeStr = bookingTime
    const endTimeStr = `${endHours}:${endMinutes.toString().padStart(2, '0')} ${endPeriod}`
    
    return `${startTimeStr} - ${endTimeStr}`
  }

  return (
    <section className={`service-requests-section rounded-xl p-6 ${!isDarkMode ? 'light-mode' : ''}`}>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h3 className={`font-['Epilogue'] text-xl font-extrabold uppercase italic tracking-tighter ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
            Service Requests
          </h3>
          <p className={`text-sm ${getTextClass('tertiary')}`}>Realtime booking queue from `serviceBookings`.</p>
        </div>
        <div className={`rounded-full ${getBgClass()} px-4 py-2 text-xs font-bold ${getTextClass('secondary')}`}>
          {requests.length} synced requests
        </div>
      </div>

      <div className="service-requests-list grid gap-4">
        {requests.map((request) => (
          <div key={request.id} className={`service-request-card grid gap-4 rounded-2xl p-4 lg:grid-cols-[1.2fr_1fr_0.8fr] lg:items-center`}>
            <div>
              <p className={`text-xs uppercase tracking-[0.24em] ${getTextClass('tertiary')}`}>{request.bookingId || request.id}</p>
              <h4 className={`mt-2 text-lg font-bold ${getTextClass('main')}`}>{request.customerName || request.customer || 'Walk-in Client'}</h4>
              <p className={`text-sm ${getTextClass('secondary')}`}>
                {request.model || 'Yamaha Unit'} • {request.service || 'General Service'}
              </p>
              <p className={`mt-1 text-xs ${getTextClass('tertiary')}`}>Book Submitted: {formatDate(request.createdAt || request.updatedAt)}</p>
              <div className={`service-schedule-line mt-1 flex items-center gap-2 text-xs ${getTextClass('tertiary')}`}>
                <span>
                  Booking Date Schedule: {request.bookingDateLabel || formatDate(request.bookingDateKey) || 'Not scheduled'} {request.bookingTime ? `at ${getBookingTimeRange(request.bookingTime, request.estimatedHours)}` : ''}
                </span>
                {String(request.status || 'Pending').trim().toLowerCase() === 'pending' && (
                  <button
                    type="button"
                    className="service-schedule-edit-button"
                    onClick={() => openScheduleEditor(request)}
                    disabled={!canEditOperations}
                    title="Edit booking date schedule"
                    aria-label={`Edit booking date schedule for ${request.customerName || request.customer || 'customer'}`}
                  >
                    <EditRoundedIcon sx={{ fontSize: 16 }} />
                  </button>
                )}
              </div>
            </div>
            <div className={`space-y-2 text-sm ${getTextClass('secondary')}`}>
              <p>Package: <span className={`font-semibold ${getTextClass('main')}`}>{request.package || 'Standard'}</span></p>
              <p>Est. Hours: <span className={`font-semibold ${getTextClass('main')}`}>{request.estimatedHours ?? 4}</span></p>
              <p>Cost: <span className={`font-semibold ${getTextClass('main')}`}>{formatCurrency(request.cost ?? 0)}</span></p>
            </div>
            <div className="space-y-2">
              {request.status === 'Pending' && (
                <button
                  className="w-full rounded-xl bg-green-600 hover:bg-green-700 text-white font-bold px-3 py-2 text-sm transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-green-600"
                  onClick={() => handleAcceptRequest(request)}
                  disabled={!canEditOperations}
                >
                  Accept & Assign Mechanic
                </button>
              )}
              <span className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase ${getStatusClasses(request.status)}`}>
                {request.status || 'Pending'}
              </span>
              {request.status === 'In Progress' && (
                <button
                  className="w-full mt-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold px-3 py-2 text-sm transition disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-red-600"
                  onClick={async () => {
                    await handleCollectionUpdate('serviceBookings', request.id, { status: 'Services Completed' })
                    await logSystemAuditEvent({
                      module: 'Service',
                      action: 'SERVICE_COMPLETED',
                      summary: `Marked service booking ${request.bookingId || request.id} as Services Completed`,
                      targetType: 'serviceBooking',
                      targetId: request.id,
                      targetName: request.customerName || request.customer || request.id,
                      previousData: { status: request.status || 'In Progress' },
                      newData: { status: 'Services Completed' },
                      amount: Number(request.cost ?? 0),
                      currentUser,
                      accessRole: currentAccessRole,
                    })
                  }}
                  disabled={!canEditOperations}
                >
                  SERVICE COMPLETED
                </button>
              )}
            </div>
          </div>
        ))}

        {!requests.length && (
          <div className={`service-request-empty rounded-2xl p-8 text-center ${getTextClass('secondary')}`}>
            No service requests found yet.
          </div>
        )}
      </div>
      <AssignMechanicModal
        open={assignModalOpen}
        onClose={handleCloseModal}
        onAssign={handleAssignMechanic}
        mechanics={mechanics}
        request={selectedRequest}
      />
      {scheduleModal && (
        <div
          className="service-schedule-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="service-schedule-modal-title"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeScheduleEditor()
          }}
        >
          <div className="service-schedule-modal-panel">
            <div className="service-schedule-modal-header">
              <div>
                <p className="service-schedule-modal-kicker">Service Booking</p>
                <h3 id="service-schedule-modal-title">Edit Booking Date Schedule</h3>
              </div>
              <button
                type="button"
                className="service-schedule-modal-close"
                onClick={closeScheduleEditor}
                disabled={isScheduleSaving}
                aria-label="Close schedule editor"
              >
                <CloseRoundedIcon sx={{ fontSize: 18 }} />
              </button>
            </div>

            <div className="service-schedule-modal-calendar">
              <div className="service-schedule-calendar-header">
                <button
                  type="button"
                  onClick={() => setScheduleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                  disabled={isScheduleSaving}
                  aria-label="Previous month"
                >
                  <ChevronLeftRoundedIcon sx={{ fontSize: 18 }} />
                </button>
                <strong>
                  {scheduleMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </strong>
                <button
                  type="button"
                  onClick={() => setScheduleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                  disabled={isScheduleSaving}
                  aria-label="Next month"
                >
                  <ChevronRightRoundedIcon sx={{ fontSize: 18 }} />
                </button>
              </div>

              <div className="service-schedule-weekdays" aria-hidden="true">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="service-schedule-calendar-grid">
                {scheduleCalendarDays.map((date, index) => {
                  if (!date) return <span key={`empty-${index}`} className="service-schedule-calendar-empty" />

                  const dateKey = formatDateKey(date)
                  const status = getScheduleDayStatus(date)
                  const isSelected = scheduleForm.date === dateKey

                  return (
                    <button
                      type="button"
                      key={dateKey}
                      className={`${isSelected ? 'is-selected' : ''} ${status.unavailable ? 'is-unavailable' : 'is-available'}`}
                      disabled={isScheduleSaving || status.unavailable}
                      onClick={() => {
                        setScheduleForm((current) => ({ ...current, date: dateKey, time: '' }))
                        setScheduleError('')
                      }}
                      title={status.unavailable ? 'Not available' : `${status.availableCount} time slot${status.availableCount === 1 ? '' : 's'} available`}
                    >
                      <span>{date.getDate()}</span>
                      <small>{status.unavailable ? 'Unavailable' : 'Available'}</small>
                    </button>
                  )
                })}
              </div>
            </div>

            {scheduleForm.date && (
              <div className="service-schedule-time-section">
                <div className="service-schedule-time-heading">
                  <strong>Available Times</strong>
                  <span>{formatScheduleDate(scheduleForm.date)}</span>
                </div>
                <div className="service-schedule-time-grid">
                  {scheduleTimeSlots.map((slot) => {
                    const unavailable = isScheduleTimeUnavailable(scheduleForm.date, slot.minutes)
                    const isSelected = scheduleForm.time === getTimeInputValue(slot.label)

                    return (
                      <button
                        type="button"
                        key={slot.minutes}
                        className={`${isSelected ? 'is-selected' : ''} ${unavailable ? 'is-unavailable' : 'is-available'}`}
                        disabled={isScheduleSaving || unavailable}
                        onClick={() => {
                          setScheduleForm((current) => ({ ...current, time: getTimeInputValue(slot.label) }))
                          setScheduleError('')
                        }}
                      >
                        <span>{slot.label}</span>
                        <small>{unavailable ? 'Unavailable' : 'Available'}</small>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {scheduleError && (
              <p className="service-schedule-modal-error" role="alert">
                {scheduleError}
              </p>
            )}

            <div className="service-schedule-modal-actions">
              <button
                type="button"
                className="service-schedule-modal-cancel"
                onClick={closeScheduleEditor}
                disabled={isScheduleSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="service-schedule-modal-save"
                onClick={saveSchedule}
                disabled={isScheduleSaving || !scheduleForm.date || !scheduleForm.time}
              >
                <SaveRoundedIcon sx={{ fontSize: 17 }} />
                {isScheduleSaving ? 'Saving...' : 'Save Schedule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
