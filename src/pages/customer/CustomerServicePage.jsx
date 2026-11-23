import { useState, useEffect, useMemo, useRef } from 'react'
import { addDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore'
import { db } from '../../firebase'
import { logSystemAuditEvent } from '../../services/auditLogService'
import BiotechRoundedIcon from '@mui/icons-material/BiotechRounded'
import BuildCircleRoundedIcon from '@mui/icons-material/BuildCircleRounded'
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded'
import CameraAltRoundedIcon from '@mui/icons-material/CameraAltRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded'
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded'
import SpeedRoundedIcon from '@mui/icons-material/SpeedRounded'
import TireRepairRoundedIcon from '@mui/icons-material/TireRepairRounded'
import TwoWheelerRoundedIcon from '@mui/icons-material/TwoWheelerRounded'
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded'
import NavHeaderCustomer from './components/NavHeaderCustomer'
import ChatBox from '../../components/ChatBox'

const bookingSteps = [
  { id: 'service-type', label: 'Service Type', icon: BuildCircleRoundedIcon },
  { id: 'vehicle-info', label: 'Vehicle Info', icon: TwoWheelerRoundedIcon },
  { id: 'schedule', label: 'Schedule', icon: CalendarMonthRoundedIcon },
  { id: 'confirm', label: 'Confirm', icon: CheckCircleRoundedIcon },
]

const BOOKING_START_HOUR = 8
const BOOKING_END_HOUR = 18

const formatDuration = (durationMinutes = 0) => {
  const normalizedMinutes = Math.max(0, Number(durationMinutes) || 0)
  const hours = Math.floor(normalizedMinutes / 60)
  const minutes = normalizedMinutes % 60

  if (hours && minutes) return `${hours}h ${minutes}m`
  if (hours) return `${hours}h`
  return `${minutes}m`
}

const MAX_PROBLEM_IMAGES = 4

const formatDateKey = (date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const formatTimeLabel = (minutesFromMidnight) => {
  const hours24 = Math.floor(minutesFromMidnight / 60)
  const minutes = minutesFromMidnight % 60
  const meridiem = hours24 >= 12 ? 'PM' : 'AM'
  const hours12 = hours24 % 12 || 12
  return `${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${meridiem}`
}

const formatDisplayDate = (dateKey = '') => {
  if (!dateKey) return 'No date selected'

  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, (month || 1) - 1, day || 1)

  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

const buildTimeSlots = () => {
  const slots = []

  for (let hour = BOOKING_START_HOUR; hour < BOOKING_END_HOUR; hour += 1) {
    const minutes = hour * 60
    slots.push({
      label: formatTimeLabel(minutes),
      startMinutes: minutes,
    })
  }

  return slots
}

const overlaps = (startA, endA, startB, endB) => startA < endB && startB < endA

export default function CustomerServicePage({
  currentUser,
  onSignOut,
  onNavigateToShowroom,
  onNavigateToMessages,
  onNavigateToProfile,
  onNavigateToServiceBookings,
  onNavigateBack,
}) {
  const uploadInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const today = useMemo(() => new Date(), [])
  const [isDarkMode] = useState(true)
  const [activeStep, setActiveStep] = useState('service-type')
  const [selectedServices, setSelectedServices] = useState([])
  const [selectedDay, setSelectedDay] = useState(() => formatDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)))
  const [selectedTime, setSelectedTime] = useState('')
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [serviceOptions, setServiceOptions] = useState([])
  const [serviceBookings, setServiceBookings] = useState([])
  const [userVehicles, setUserVehicles] = useState([])
  const [vehicleInfo, setVehicleInfo] = useState({
    model: '',
    year: new Date().getFullYear().toString(),
  })
  const [problemDescription, setProblemDescription] = useState('')
  const [problemImages, setProblemImages] = useState([])
  const [bookingSubmitting, setBookingSubmitting] = useState(false)
  const [currentBooking, setCurrentBooking] = useState(null)

  // Fetch services from Firestore
  useEffect(() => {
    const fetchServices = async () => {
      try {
        const servicesRef = collection(db, 'services')
        const snapshot = await getDocs(servicesRef)
        if (!snapshot.empty) {
          const services = snapshot.docs.map((doc) => {
            const data = doc.data()
            return {
              id: doc.id,
              title: data.title || '',
              description: data.description || '',
              cost: data.cost || 0,
              durationMinutes: data.durationMinutes || 30,
              iconUrl: data.iconUrl || '',
            }
          })
          setServiceOptions(services)
          // Don't auto-select any service - let user choose
        }
      } catch (error) {
        console.error('Error fetching services:', error)
      }
    }

    const fetchUserVehicles = async () => {
      try {
        if (currentUser?.uid) {
          const vehiclesRef = collection(db, `users/${currentUser.uid}/vehicles`)
          const snapshot = await getDocs(vehiclesRef)
          if (!snapshot.empty) {
            const vehicles = snapshot.docs.map((doc) => ({
              id: doc.id,
              ...doc.data(),
            }))
            setUserVehicles(vehicles)
            // Set first vehicle as selected
            if (vehicles.length > 0) {
              setVehicleInfo({
                model: vehicles[0].model || '',
                year: vehicles[0].year || new Date().getFullYear().toString(),
              })
            }
          }
        }
      } catch (error) {
        console.error('Error fetching vehicles:', error)
      }
    }

    const fetchServiceBookings = async () => {
      try {
        const bookingsRef = collection(db, 'serviceBookings')
        const snapshot = await getDocs(bookingsRef)

        if (!snapshot.empty) {
          const bookings = snapshot.docs.map((docSnapshot) => ({
            id: docSnapshot.id,
            ...docSnapshot.data(),
          }))
          setServiceBookings(bookings)
        }
      } catch (error) {
        console.error('Error fetching service bookings:', error)
      }
    }

    fetchServices()
    fetchUserVehicles()
    fetchServiceBookings()
  }, [currentUser])

  useEffect(() => {
    return () => {
      problemImages.forEach((image) => {
        if (image.previewUrl) {
          URL.revokeObjectURL(image.previewUrl)
        }
      })
    }
  }, [problemImages])

  const estimatedCost = selectedServices.reduce((total, serviceId) => {
    const service = serviceOptions.find((s) => s.id === serviceId)
    return total + (service?.cost ?? 0)
  }, 0)

  const estimatedDurationMinutes = selectedServices.reduce((total, serviceId) => {
    const service = serviceOptions.find((s) => s.id === serviceId)
    return total + (service?.durationMinutes ?? 0)
  }, 0)

  const timeSlots = useMemo(() => buildTimeSlots(), [])

  const calendarDays = useMemo(() => {
    const year = visibleMonth.getFullYear()
    const month = visibleMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const firstWeekday = firstDay.getDay()
    const totalDays = lastDay.getDate()
    const days = []

    for (let i = 0; i < firstWeekday; i += 1) {
      days.push(null)
    }

    for (let day = 1; day <= totalDays; day += 1) {
      const currentDate = new Date(year, month, day)
      days.push({
        day,
        dateKey: formatDateKey(currentDate),
        isPast: currentDate < new Date(today.getFullYear(), today.getMonth(), today.getDate()),
      })
    }

    return days
  }, [today, visibleMonth])

  const bookingsForSelectedDay = useMemo(() => {
    return serviceBookings.filter((booking) => {
      const bookingDateKey = String(booking.bookingDateKey || booking.dateKey || '').trim()
      const status = String(booking.status || 'Pending').trim().toLowerCase()

      return (
        bookingDateKey === selectedDay &&
        !['cancelled', 'completed'].includes(status)
      )
    })
  }, [selectedDay, serviceBookings])

  const availableTimeSlots = useMemo(() => {
    const currentDateKey = formatDateKey(today)
    const isToday = selectedDay === currentDateKey
    const currentTime = new Date()
    const currentMinutesFromMidnight = currentTime.getHours() * 60 + currentTime.getMinutes()

    return timeSlots.map((slot) => {
      const requestedDuration = Math.max(estimatedDurationMinutes || 30, 30)
      const requestedEnd = slot.startMinutes + requestedDuration
      const exceedsClosing = requestedEnd > BOOKING_END_HOUR * 60
      const overlapsExisting = bookingsForSelectedDay.some((booking) =>
        overlaps(
          slot.startMinutes,
          requestedEnd,
          Number(booking.bookingStartMinutes || 0),
          Number(booking.bookingEndMinutes || 0),
        ),
      )
      
      // If today is selected, mark past time slots as unavailable
      const isPastSlot = isToday && slot.startMinutes <= currentMinutesFromMidnight

      return {
        ...slot,
        endMinutes: requestedEnd,
        unavailable: exceedsClosing || overlapsExisting || isPastSlot,
      }
    })
  }, [bookingsForSelectedDay, estimatedDurationMinutes, timeSlots, selectedDay, today])

  useEffect(() => {
    const selectedSlotStillAvailable = availableTimeSlots.some(
      (slot) => slot.label === selectedTime && !slot.unavailable,
    )

    if (selectedSlotStillAvailable) {
      return
    }

    const firstAvailableSlot = availableTimeSlots.find((slot) => !slot.unavailable)
    setSelectedTime(firstAvailableSlot?.label || '')
  }, [availableTimeSlots, selectedTime])

  const handleServiceSelect = (serviceId) => {
    setSelectedServices((prev) =>
      prev.includes(serviceId) ? prev.filter((id) => id !== serviceId) : [...prev, serviceId]
    )
  }

  const handleBack = () => {
    const stepIndex = bookingSteps.findIndex((step) => step.id === activeStep)
    if (stepIndex > 0) {
      setActiveStep(bookingSteps[stepIndex - 1].id)
    }
  }

  const handleContinue = () => {
    // Validate current step before moving forward
    if (activeStep === 'service-type' && selectedServices.length === 0) {
      alert('Please select at least one service')
      return
    }
    if (activeStep === 'vehicle-info' && !vehicleInfo.model) {
      alert('Please select or enter a vehicle model')
      return
    }
    if (activeStep === 'schedule' && !selectedDay) {
      alert('Please select a date')
      return
    }
    if (activeStep === 'schedule' && !selectedTime) {
      alert('Please select an available time slot')
      return
    }

    const stepIndex = bookingSteps.findIndex((step) => step.id === activeStep)
    if (stepIndex < bookingSteps.length - 1) {
      setActiveStep(bookingSteps[stepIndex + 1].id)
    }
  }

  const handleProblemImageSelection = (event) => {
    const nextFiles = Array.from(event.target.files || [])

    if (!nextFiles.length) {
      return
    }

    setProblemImages((current) => {
      const remainingSlots = Math.max(0, MAX_PROBLEM_IMAGES - current.length)
      const filesToAdd = nextFiles.slice(0, remainingSlots).map((file) => ({
        id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      }))

      return [...current, ...filesToAdd]
    })

    event.target.value = ''
  }

  const handleRemoveProblemImage = (imageId) => {
    setProblemImages((current) => {
      const targetImage = current.find((image) => image.id === imageId)

      if (targetImage?.previewUrl) {
        URL.revokeObjectURL(targetImage.previewUrl)
      }

      return current.filter((image) => image.id !== imageId)
    })
  }

  const handleOpenUploadPicker = () => {
    uploadInputRef.current?.click()
  }

  const handleOpenCameraCapture = () => {
    cameraInputRef.current?.click()
  }

  const handleScheduleService = async () => {
    const selectedSlot = availableTimeSlots.find((slot) => slot.label === selectedTime)

    if (!selectedSlot || selectedSlot.unavailable) {
      alert('The selected time slot is no longer available. Please choose another time.')
      setActiveStep('schedule')
      return
    }

    setBookingSubmitting(true)

    try {
      const selectedServiceTitles = selectedServices
        .map((id) => serviceOptions.find((service) => service.id === id)?.title)
        .filter(Boolean)

      const bookingPayload = {
        customerId: currentUser?.uid || '',
        customerName: currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Customer',
        customerEmail: currentUser?.email || '',
        model: vehicleInfo.model,
        year: vehicleInfo.year,
        serviceIds: selectedServices,
        serviceTitles: selectedServiceTitles,
        service: selectedServiceTitles.join(', '),
        cost: estimatedCost,
        estimatedDurationMinutes,
        estimatedHours: Number((estimatedDurationMinutes / 60).toFixed(2)),
        bookingDateKey: selectedDay,
        bookingDateLabel: formatDisplayDate(selectedDay),
        bookingTime: selectedTime,
        bookingStartMinutes: selectedSlot.startMinutes,
        bookingEndMinutes: selectedSlot.endMinutes,
        problemDescription: problemDescription.trim(),
        problemImageNames: problemImages.map((image) => image.file?.name || '').filter(Boolean),
        status: 'Pending',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }

      const docRef = await addDoc(collection(db, 'serviceBookings'), bookingPayload)
      const newBooking = { id: docRef.id, ...bookingPayload }
      await logSystemAuditEvent({
        module: 'Service',
        action: 'SERVICE_BOOKING_CREATED',
        summary: `Customer booked ${selectedServiceTitles.join(', ')} for ${vehicleInfo.model} on ${selectedDay} at ${selectedTime}`,
        targetType: 'serviceBooking',
        targetId: docRef.id,
        targetName: bookingPayload.customerName,
        newData: {
          model: vehicleInfo.model,
          service: bookingPayload.service,
          bookingDateKey: selectedDay,
          bookingTime: selectedTime,
        },
        amount: estimatedCost,
        currentUser,
        accessRole: 'customer',
      })
      setServiceBookings((current) => [...current, newBooking])
      setCurrentBooking(newBooking)
      setActiveStep('success')
    } catch (error) {
      console.error('Error scheduling service booking:', error)
      alert('Unable to schedule your service booking right now. Please try again.')
    } finally {
      setBookingSubmitting(false)
    }
  }

  const StepContent = () => {
    switch (activeStep) {
      case 'service-type':
        return (
          <div className="space-y-8">
            {/* Header */}
            <div>
              <h2 className={`text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black italic mb-3 tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                SELECT SERVICE
              </h2>
              <p className={`text-sm font-bold uppercase tracking-widest ${isDarkMode ? 'text-white' : 'text-gray-600'}`}>
                Maintain your edge with precision tuning.
              </p>
            </div>

            {/* Service Grid */}
            <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-2">
              {serviceOptions.map((service) => {
                const isSelected = selectedServices.includes(service.id)
                return (
                  <button
                    key={service.id}
                    onClick={() => handleServiceSelect(service.id)}
                    className={`rounded-2xl text-left transition-all border relative overflow-hidden p-4 sm:p-5 min-h-60 sm:min-h-65 ${
                      isSelected
                        ? isDarkMode
                          ? 'border-red-600 bg-[#171922] border-l-4 border-l-red-600'
                          : 'border-red-600 bg-white border-l-4 border-l-red-600'
                        : isDarkMode
                          ? 'border-white/5 bg-[#171922] hover:bg-[#1b1e28]'
                          : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    {/* Icon cover/overlay */}
                    {service.iconUrl ? (
                      <>
                        <img
                          src={service.iconUrl}
                          alt={service.title}
                          className="absolute inset-0 w-full h-full object-cover opacity-25"
                        />
                        <div className={`absolute inset-0 ${isDarkMode ? 'bg-linear-to-b from-black/15 via-[#10141f]/55 to-[#10141f]/72' : 'bg-linear-to-b from-white/45 via-white/85 to-white/95'}`}></div>
                      </>
                    ) : (
                      <div className={`absolute inset-0 ${isDarkMode ? 'bg-linear-to-b from-[#242938] to-[#151925]' : 'bg-linear-to-b from-gray-100 to-white'}`}></div>
                    )}

                    <div className="relative z-10 flex items-start justify-between mb-5">
                      <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-lg flex items-center justify-center shrink-0 ${isDarkMode ? 'bg-black/35' : 'bg-white/80 border border-gray-200'}`}>
                        {service.iconUrl ? (
                          <img
                            src={service.iconUrl}
                            alt={service.title}
                            className="w-8 h-8 sm:w-10 sm:h-10 object-contain"
                          />
                        ) : (
                          <CloudUploadRoundedIcon sx={{ fontSize: 24, opacity: 0.55 }} />
                        )}
                      </div>
                    </div>

                    {/* Content area */}
                    <div className="relative z-10 space-y-3 drop-shadow">
                      <h3 className={`font-black text-2xl sm:text-3xl md:text-4xl italic uppercase tracking-tight ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {service.title}
                      </h3>
                      <p className={`text-sm sm:text-base md:text-lg leading-relaxed line-clamp-2 ${isDarkMode ? 'text-white' : 'text-gray-600'}`}>
                        {service.description}
                      </p>
                      <p className={`text-xs sm:text-sm font-black uppercase tracking-widest ${isSelected ? 'text-red-400' : isDarkMode ? 'text-white' : 'text-gray-500'}`}>
                        Estimated Duration: {formatDuration(service.durationMinutes)}
                      </p>
                      <p className={`pt-2 text-sm font-black uppercase tracking-widest ${isSelected ? 'text-red-400' : isDarkMode ? 'text-white' : 'text-gray-500'}`}>
                        {isSelected ? 'Selected ✓' : '+ Add Service'}
                      </p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )

      case 'vehicle-info':
        return (
          <div className="space-y-8 max-w-4xl">
            <div>
              <h2 className={`text-3xl font-black italic tracking-tight mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Vehicle Information
              </h2>
              <p className={`text-sm font-bold uppercase tracking-widest ${isDarkMode ? 'text-white/80' : 'text-gray-600'}`}>
                Select your motorcycle and tell us what issue needs attention.
              </p>
            </div>
            {userVehicles.length > 0 && (
              <div className={`rounded-2xl border p-5 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'}`}>
                <label className={`block text-sm font-bold mb-3 uppercase tracking-widest ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  My Vehicles
                </label>
                <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                  {userVehicles.map((vehicle) => (
                    <button
                      key={vehicle.id}
                      onClick={() => setVehicleInfo({ model: vehicle.model, year: vehicle.year })}
                      className={`rounded-lg p-4 text-left border-2 transition ${
                        vehicleInfo.model === vehicle.model
                          ? 'border-red-600 bg-red-50 dark:bg-red-950/20'
                          : isDarkMode
                            ? 'border-white/10 bg-white/5 hover:bg-white/10'
                            : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                      }`}
                    >
                      <p className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                        {vehicle.model}
                      </p>
                      <p className={`text-sm ${isDarkMode ? 'text-white' : 'text-gray-600'}`}>
                        {vehicle.year}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
              <div className={`rounded-2xl border p-5 space-y-5 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'}`}>
                <div>
                  <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    Motorcycle Details
                  </h3>
                  <p className={`mt-1 text-sm ${isDarkMode ? 'text-white/70' : 'text-gray-600'}`}>
                    Confirm the bike model and production year before scheduling.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                  <div>
                    <label className={`block text-sm font-bold mb-2 uppercase tracking-widest ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      Model
                    </label>
                    <input
                      type="text"
                      value={vehicleInfo.model}
                      onChange={(e) => setVehicleInfo({ ...vehicleInfo, model: e.target.value })}
                      placeholder="E.g., YZF-R5M"
                      className={`w-full rounded-xl px-4 py-3 border ${
                        isDarkMode
                          ? 'border-white/10 bg-slate-950/70 text-white placeholder-white/40'
                          : 'border-gray-300 bg-white text-gray-900'
                      }`}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-bold mb-2 uppercase tracking-widest ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                      Year
                    </label>
                    <div className="relative">
                      <select
                        value={vehicleInfo.year}
                        onChange={(e) => setVehicleInfo({ ...vehicleInfo, year: e.target.value })}
                        className={`w-full appearance-none rounded-xl px-4 py-3 pr-11 border ${
                          isDarkMode
                            ? 'border-white/10 bg-slate-950/70 text-white scheme-dark'
                            : 'border-gray-300 bg-white text-gray-900'
                        }`}
                      >
                        {Array.from({ length: 20 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                          <option
                            key={year}
                            value={year}
                            className={isDarkMode ? 'bg-slate-950 text-white' : 'bg-white text-gray-900'}
                          >
                            {year}
                          </option>
                        ))}
                      </select>
                      <ChevronRightRoundedIcon
                        sx={{ fontSize: 20 }}
                        className={`pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 rotate-90 ${
                          isDarkMode ? 'text-white/70' : 'text-gray-500'
                        }`}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className={`rounded-2xl border p-5 space-y-4 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'}`}>
                <div>
                  <h3 className={`text-lg font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  Problem Details
                  </h3>
                  <p className={`mt-1 text-sm ${isDarkMode ? 'text-white/70' : 'text-gray-600'}`}>
                    Describe the issue and attach photos so the service team can assess it faster.
                  </p>
                </div>

                <div>
                  <label className={`block text-sm font-bold mb-2 uppercase tracking-widest ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    Describe the problem
                  </label>
                  <textarea
                    value={problemDescription}
                    onChange={(event) => setProblemDescription(event.target.value.slice(0, 800))}
                    maxLength={800}
                    rows={5}
                    aria-describedby="problem-description-limit"
                    placeholder="Example: Engine starts late in the morning, front brake feels soft, and there is a rattling sound near the fairing."
                    className={`w-full rounded-xl px-4 py-3 border resize-none ${
                      isDarkMode
                        ? 'border-white/10 bg-slate-950/70 text-white placeholder-white/40'
                        : 'border-gray-300 bg-white text-gray-900 placeholder-gray-400'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-sm font-bold mb-3 uppercase tracking-widest ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  <div
                    id="problem-description-limit"
                    className={`mt-2 text-right text-xs ${
                      problemDescription.length >= 800
                        ? 'text-amber-400'
                        : isDarkMode ? 'text-white/50' : 'text-gray-500'
                    }`}
                  >
                    {problemDescription.length}/800 characters
                  </div>
                    Upload or capture problem photos
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={handleOpenUploadPicker}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition ${
                        isDarkMode
                          ? 'border border-white/10 bg-slate-950/60 text-white hover:bg-slate-900'
                          : 'border border-gray-300 bg-white text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      <CloudUploadRoundedIcon sx={{ fontSize: 18 }} />
                      Upload Images
                    </button>
                    <button
                      type="button"
                      onClick={handleOpenCameraCapture}
                      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition ${
                        isDarkMode
                          ? 'border border-red-500/40 bg-red-600/10 text-red-300 hover:bg-red-600/20'
                          : 'border border-red-300 bg-red-50 text-red-700 hover:bg-red-100'
                      }`}
                    >
                      <CameraAltRoundedIcon sx={{ fontSize: 18 }} />
                      Capture Photo
                    </button>
                    <input
                      ref={uploadInputRef}
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleProblemImageSelection}
                      className="hidden"
                    />
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleProblemImageSelection}
                      className="hidden"
                    />
                  </div>
                  <p className={`mt-2 text-xs font-bold uppercase tracking-widest ${isDarkMode ? 'text-white/50' : 'text-gray-500'}`}>
                    Up to {MAX_PROBLEM_IMAGES} images
                  </p>
                </div>

                {problemImages.length > 0 && (
                  <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
                    {problemImages.map((image) => (
                      <div key={image.id} className="relative overflow-hidden rounded-xl border border-white/10 bg-black/20">
                        <img
                          src={image.previewUrl}
                          alt={image.file?.name || 'Problem attachment'}
                          className="h-28 w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveProblemImage(image.id)}
                          className="absolute right-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-white"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )

      case 'schedule':
        return (
          <div className="space-y-6 max-w-4xl">
            <div>
              <h2 className={`text-3xl font-black italic tracking-tight mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Pick a Date
              </h2>
              <p className={`text-sm font-bold uppercase tracking-widest ${isDarkMode ? 'text-white/80' : 'text-gray-600'}`}>
                Select a day and an available start time for {formatDuration(Math.max(estimatedDurationMinutes || 30, 30))}.
              </p>
            </div>

            <div className={`rounded-2xl border p-6 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-100'}`}>
              <div className="mb-5 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
                  className={`inline-flex items-center justify-center rounded-full p-2 transition ${
                    isDarkMode ? 'bg-white/5 text-white hover:bg-white/10' : 'bg-white text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  <ChevronLeftRoundedIcon sx={{ fontSize: 18 }} />
                </button>
                <h3 className={`text-lg font-black uppercase tracking-widest ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {visibleMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </h3>
                <button
                  type="button"
                  onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
                  className={`inline-flex items-center justify-center rounded-full p-2 transition ${
                    isDarkMode ? 'bg-white/5 text-white hover:bg-white/10' : 'bg-white text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  <ChevronRightRoundedIcon sx={{ fontSize: 18 }} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day} className={`text-center text-xs font-bold uppercase tracking-widest ${isDarkMode ? 'text-white/70' : 'text-gray-500'}`}>
                    {day}
                  </div>
                ))}
                {calendarDays.map((day, index) =>
                  day ? (
                    <button
                      key={day.dateKey}
                      onClick={() => setSelectedDay(day.dateKey)}
                      disabled={day.isPast}
                      className={`rounded-xl p-3 text-center font-bold transition ${
                        selectedDay === day.dateKey
                          ? 'bg-red-600 text-white'
                          : day.isPast
                            ? isDarkMode
                              ? 'bg-white/3 text-white/25'
                              : 'bg-gray-100 text-gray-400'
                            : isDarkMode
                              ? 'bg-white/5 text-white hover:bg-white/10'
                              : 'bg-white text-gray-900 hover:bg-gray-200'
                      }`}
                    >
                      {day.day}
                    </button>
                  ) : (
                    <div key={`empty-${index}`} className="rounded-xl p-3" />
                  ),
                )}
              </div>
            </div>

            <div>
              <h3 className={`text-lg font-bold mb-4 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Select Time
              </h3>
              <div className="mb-3 flex items-center justify-between">
                <p className={`text-sm ${isDarkMode ? 'text-white/70' : 'text-gray-600'}`}>
                  {formatDisplayDate(selectedDay)}
                </p>
                <p className={`text-xs font-bold uppercase tracking-widest ${isDarkMode ? 'text-white/50' : 'text-gray-500'}`}>
                  {bookingsForSelectedDay.length} booked
                </p>
              </div>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
                {availableTimeSlots.map((slot) => (
                  <button
                    key={slot.label}
                    onClick={() => setSelectedTime(slot.label)}
                    disabled={slot.unavailable}
                    className={`rounded-xl px-4 py-4 text-left text-sm font-bold transition ${
                      selectedTime === slot.label
                        ? 'bg-red-600 text-white'
                        : slot.unavailable
                          ? isDarkMode
                            ? 'border border-white/5 bg-white/3 text-white/25'
                            : 'border border-gray-200 bg-gray-100 text-gray-400'
                          : isDarkMode
                            ? 'border border-white/10 bg-white/5 text-white hover:bg-white/10'
                            : 'border border-gray-300 bg-white text-gray-900 hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span>{slot.label}</span>
                      <span className="text-[11px] uppercase tracking-widest">
                        {formatTimeLabel(slot.endMinutes)}
                      </span>
                    </div>
                    <p className={`mt-2 text-[11px] uppercase tracking-widest ${
                      selectedTime === slot.label
                        ? 'text-white/80'
                        : slot.unavailable
                          ? isDarkMode
                            ? 'text-white/20'
                            : 'text-gray-400'
                          : isDarkMode
                            ? 'text-white/60'
                            : 'text-gray-500'
                    }`}>
                      {slot.unavailable ? 'Booked for this duration' : `Runs until ${formatTimeLabel(slot.endMinutes)}`}
                    </p>
                  </button>
                ))}
              </div>
              {!availableTimeSlots.some((slot) => !slot.unavailable) && (
                <p className={`mt-4 text-sm font-bold ${isDarkMode ? 'text-red-300' : 'text-red-600'}`}>
                  No available slots for this date and duration. Please choose another day.
                </p>
              )}
            </div>

            <div className={`rounded-2xl border p-4 ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'}`}>
              <p className={`text-xs font-bold uppercase tracking-widest ${isDarkMode ? 'text-white/50' : 'text-gray-500'}`}>
                Booking Window
              </p>
              <p className={`mt-2 text-base font-black ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {selectedTime ? `${selectedTime} to ${formatTimeLabel((availableTimeSlots.find((slot) => slot.label === selectedTime)?.endMinutes) || 0)}` : 'Select an available time slot'}
              </p>
              <p className={`mt-1 text-sm ${isDarkMode ? 'text-white/70' : 'text-gray-600'}`}>
                Time slots that overlap with an existing booking for your selected duration are automatically blocked.
              </p>
            </div>
          </div>
        )

      case 'confirm':
        return (
          <div className="space-y-6 max-w-2xl">
            <h2 className={`text-2xl font-bold mb-6 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              Confirm Booking
            </h2>

            {/* Service Summary */}
            <div className={`rounded-2xl p-6 border ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'}`}>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className={isDarkMode ? 'text-white' : 'text-gray-600'}>Services:</span>
                  <span className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {selectedServices.length > 0 
                      ? selectedServices.map(id => serviceOptions.find((s) => s.id === id)?.title).join(', ')
                      : 'No services selected'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={isDarkMode ? 'text-white' : 'text-gray-600'}>Vehicle:</span>
                  <span className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {vehicleInfo.model} {vehicleInfo.year}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={isDarkMode ? 'text-white' : 'text-gray-600'}>Date:</span>
                  <span className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {formatDisplayDate(selectedDay)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={isDarkMode ? 'text-white' : 'text-gray-600'}>Time:</span>
                  <span className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{selectedTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className={isDarkMode ? 'text-white' : 'text-gray-600'}>Estimated Duration:</span>
                  <span className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {formatDuration(estimatedDurationMinutes)}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className={isDarkMode ? 'text-white' : 'text-gray-600'}>Problem Notes:</span>
                  <span className={`max-w-[60%] break-words text-right font-bold whitespace-pre-wrap [overflow-wrap:anywhere] ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {problemDescription.trim() || 'No description provided'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={isDarkMode ? 'text-white' : 'text-gray-600'}>Problem Photos:</span>
                  <span className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {problemImages.length}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleScheduleService}
              disabled={bookingSubmitting || !selectedTime}
              className="w-full rounded-lg bg-red-600 px-6 py-3 font-bold text-white hover:bg-red-700 transition disabled:cursor-not-allowed disabled:opacity-60"
            >
              {bookingSubmitting ? 'Scheduling...' : 'Confirm & Schedule Service'}
            </button>
          </div>
        )

      case 'success':
        return (
          <div className="space-y-6 max-w-2xl">
            {/* Success Header */}
            <div className="text-center space-y-4 py-8">
              <div className="flex justify-center mb-6">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center ${isDarkMode ? 'bg-green-500/20' : 'bg-green-100'}`}>
                  <svg className="w-10 h-10 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
              </div>
              <h2 className={`text-3xl sm:text-4xl font-black ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                Booking Successful!
              </h2>
              <p className={`text-lg ${isDarkMode ? 'text-white/70' : 'text-gray-600'}`}>
                Your service booking has been submitted
              </p>
            </div>

            {/* Booking Reference */}
            <div className={`rounded-2xl p-6 border ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'}`}>
              <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${isDarkMode ? 'text-white/60' : 'text-gray-500'}`}>
                Booking Reference
              </p>
              <p className={`text-2xl font-black font-mono ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {currentBooking?.id?.substring(0, 12).toUpperCase() || 'N/A'}
              </p>
            </div>

            {/* Status Timeline */}
            <div className={`rounded-2xl p-6 border ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'}`}>
              <p className={`text-xs font-bold uppercase tracking-widest mb-6 ${isDarkMode ? 'text-white/60' : 'text-gray-500'}`}>
                Booking Status
              </p>
              <div className="space-y-4">
                {/* Step 1: Submitted */}
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-white ${isDarkMode ? 'bg-green-600' : 'bg-green-500'}`}>
                      ✓
                    </div>
                    <div className={`w-1 h-12 mt-2 ${isDarkMode ? 'bg-white/20' : 'bg-gray-300'}`}></div>
                  </div>
                  <div className="pt-1">
                    <p className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Booking Submitted</p>
                    <p className={`text-xs ${isDarkMode ? 'text-white/60' : 'text-gray-500'}`}>Your request has been received</p>
                  </div>
                </div>

                {/* Step 2: Mechanic Assignment */}
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${isDarkMode ? 'bg-yellow-600 text-white' : 'bg-yellow-300 text-gray-900'}`}>
                      ⏳
                    </div>
                    <div className={`w-1 h-12 mt-2 ${isDarkMode ? 'bg-white/20' : 'bg-gray-300'}`}></div>
                  </div>
                  <div className="pt-1">
                    <p className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>Waiting for Mechanic Assignment</p>
                    <p className={`text-xs ${isDarkMode ? 'text-white/60' : 'text-gray-500'}`}>We're finding the best technician for your service</p>
                  </div>
                </div>

                {/* Step 3: Booking Accepted */}
                <div className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${isDarkMode ? 'bg-white/20 text-white/50' : 'bg-gray-300 text-gray-600'}`}>
                      ◯
                    </div>
                  </div>
                  <div className="pt-1">
                    <p className={`font-bold ${isDarkMode ? 'text-white/60' : 'text-gray-500'}`}>Booking Accepted</p>
                    <p className={`text-xs ${isDarkMode ? 'text-white/60' : 'text-gray-500'}`}>Technician will confirm your appointment</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Booking Details Summary */}
            <div className={`rounded-2xl p-6 border ${isDarkMode ? 'border-white/10 bg-white/5' : 'border-gray-200 bg-gray-50'}`}>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className={isDarkMode ? 'text-white/60' : 'text-gray-600'}>Services:</span>
                  <span className={`font-bold text-right ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {currentBooking?.serviceTitles?.join(', ') || 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={isDarkMode ? 'text-white/60' : 'text-gray-600'}>Vehicle:</span>
                  <span className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {currentBooking?.model} {currentBooking?.year}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={isDarkMode ? 'text-white/60' : 'text-gray-600'}>Scheduled Date & Time:</span>
                  <span className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {currentBooking?.bookingDateLabel}, {currentBooking?.bookingTime}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={isDarkMode ? 'text-white/60' : 'text-gray-600'}>Estimated Duration:</span>
                  <span className={`font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {formatDuration(currentBooking?.estimatedDurationMinutes || 0)}
                  </span>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 sm:gap-4">
              <button
                onClick={() => onNavigateBack()}
                className="flex-1 bg-slate-600 px-6 py-3 sm:py-4 font-black text-white hover:bg-slate-700 transition uppercase text-xs sm:text-sm tracking-widest"
              >
                Back to Services
              </button>
              <button
                onClick={() => onNavigateToServiceBookings()}
                className="flex-1 bg-red-600 px-6 py-3 sm:py-4 font-black text-white hover:bg-red-700 transition uppercase text-xs sm:text-sm tracking-widest"
              >
                View Booking
              </button>
            </div>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div
      className={`min-h-screen overflow-x-hidden font-['Manrope'] ${
        isDarkMode ? 'bg-linear-to-b from-slate-950 via-slate-900 to-slate-950 text-[#e5e2e1]' : 'bg-white text-slate-900'
      }`}
    >
      <NavHeaderCustomer
        currentUser={currentUser}
        isDarkMode={isDarkMode}
        activePage="service"
        onNavigateToShowroom={onNavigateToShowroom}
        onNavigateToService={onNavigateBack}
        onNavigateToMessages={onNavigateToMessages}
        onNavigateToProfile={onNavigateToProfile}
        onNavigateToServiceBookings={onNavigateToServiceBookings}
        onSignOut={onSignOut}
      />

      <main className="pt-20 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          {/* Steps Navigation - Matching Design */}
          <div className="mb-14">
            <div className="mb-10">
              <h1 className={`text-3xl sm:text-4xl md:text-5xl font-black mb-3 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                <span className={isDarkMode ? 'text-white' : 'text-gray-600'}>SERVICE</span>
                <span className="text-red-600">BOOKING</span>
              </h1>
            </div>
            <div className="flex items-center gap-4 sm:gap-6 md:gap-8 lg:gap-10 overflow-x-auto pb-2">
              {bookingSteps.map((step, index) => {
                const isActive = activeStep === step.id

                return (
                  <div key={step.id} className="flex items-center gap-3 sm:gap-5 shrink-0">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <span className={`text-2xl sm:text-3xl md:text-4xl font-black italic ${isActive ? 'text-red-600' : isDarkMode ? 'text-white' : 'text-gray-500'}`}>
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className={`text-xs sm:text-sm font-black uppercase tracking-widest whitespace-nowrap ${isActive ? (isDarkMode ? 'text-white' : 'text-gray-900') : isDarkMode ? 'text-white' : 'text-gray-500'}`}>
                        {step.label}
                      </span>
                    </div>
                    {index < bookingSteps.length - 1 && (
                      <span className={`w-6 sm:w-10 md:w-14 h-0.5 ${isActive ? 'bg-red-600' : isDarkMode ? 'bg-white/35' : 'bg-gray-300'}`}></span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Content Area */}
          <div className="grid gap-4 sm:gap-6 lg:gap-8 grid-cols-1 lg:grid-cols-3">
            <div className="lg:col-span-2">
              {StepContent()}
            </div>

            {/* Right Sidebar - SERVICE SUMMARY */}
            {activeStep !== 'success' && (
            <div
              className={`rounded-2xl p-4 sm:p-6 lg:p-8 h-fit lg:sticky lg:top-24 border-t-4 border-t-red-600 ${
                isDarkMode ? 'bg-[#171922] border border-t-4 border-t-red-600 border-white/5' : 'bg-white border border-t-4 border-t-red-600 border-gray-200'
              }`}
            >
              <h3 className={`text-base sm:text-lg font-black italic mb-6 sm:mb-8 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                SERVICE SUMMARY
              </h3>

              {/* Selected Services */}
              {selectedServices.length > 0 && (
                <div className={`mb-4 sm:mb-6 pb-4 sm:pb-6 border-b space-y-3 ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                  <p className={`text-xs font-bold uppercase tracking-widest ${isDarkMode ? 'text-white' : 'text-gray-500'}`}>
                    Services ({selectedServices.length})
                  </p>
                  {selectedServices.map((serviceId) => {
                    const service = serviceOptions.find((s) => s.id === serviceId)
                    return (
                      <div key={serviceId} className="flex items-start justify-between gap-3">
                        <div>
                          <p className={`text-base font-black uppercase ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                            {service?.title}
                          </p>
                          <p className={`text-[11px] font-bold uppercase tracking-widest ${isDarkMode ? 'text-white/60' : 'text-gray-500'}`}>
                            {formatDuration(service?.durationMinutes ?? 0)}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Technician Info */}
              <div className={`mb-4 sm:mb-6 pb-4 sm:pb-6 border-b space-y-2 ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${isDarkMode ? 'text-white' : 'text-gray-500'}`}>
                  Technician
                </p>
                <p className={`text-base sm:text-lg font-black uppercase ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {activeStep === 'confirm' ? 'Senior Master' : 'To be assigned'}
                </p>
              </div>

              {/* Schedule Info */}
              <div className={`mb-6 sm:mb-8 pb-6 sm:pb-8 border-b space-y-2 ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${isDarkMode ? 'text-white' : 'text-gray-500'}`}>
                  Schedule
                </p>
                {activeStep === 'confirm' ? (
                  <p className={`text-base sm:text-lg font-black uppercase ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                    {formatDisplayDate(selectedDay)}, {selectedTime}
                  </p>
                ) : (
                  <p className={`text-base sm:text-lg font-black uppercase ${isDarkMode ? 'text-white' : 'text-gray-500'}`}>
                    To be confirmed
                  </p>
                )}
              </div>

              <div className={`mb-6 sm:mb-8 pb-6 sm:pb-8 border-b space-y-2 ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${isDarkMode ? 'text-white' : 'text-gray-500'}`}>
                  Problem Report
                </p>
                <p className={`max-w-full break-words text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] ${isDarkMode ? 'text-white' : 'text-gray-700'}`}>
                  {problemDescription.trim() || 'No description added yet.'}
                </p>
                <p className={`text-xs font-bold uppercase tracking-widest ${isDarkMode ? 'text-white/60' : 'text-gray-500'}`}>
                  {problemImages.length} attachment{problemImages.length === 1 ? '' : 's'}
                </p>
              </div>

              {/* Estimated Duration */}
              <div className={`mb-6 sm:mb-8 pb-6 sm:pb-8 border-b ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}>
                <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${isDarkMode ? 'text-white' : 'text-gray-500'}`}>
                  Estimated Duration
                </p>
                <p className={`text-base sm:text-lg font-black uppercase ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                  {formatDuration(estimatedDurationMinutes)}
                </p>
              </div>

              {/* Button Group */}
              <div className="flex gap-3 sm:gap-4">
                {activeStep !== 'service-type' && (
                  <button
                    onClick={handleBack}
                    className="flex-1 bg-slate-600 px-6 py-3 sm:py-4 font-black text-white hover:bg-slate-700 transition uppercase text-xs sm:text-sm tracking-widest"
                  >
                    ← Back
                  </button>
                )}
                {activeStep === 'confirm' ? (
                  <button
                    onClick={handleScheduleService}
                    disabled={bookingSubmitting || !selectedTime}
                    className="flex-1 bg-red-600 px-6 py-3 sm:py-4 font-black text-white hover:bg-red-700 transition mb-4 sm:mb-6 uppercase text-xs sm:text-sm tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {bookingSubmitting ? 'Scheduling...' : 'Confirm & Schedule Service'}
                  </button>
                ) : (
                  <button
                    onClick={handleContinue}
                    disabled={
                      (activeStep === 'service-type' && selectedServices.length === 0) ||
                      (activeStep === 'vehicle-info' && !vehicleInfo.model) ||
                      (activeStep === 'schedule' && !selectedTime)
                    }
                    className="flex-1 bg-red-600 px-6 py-3 sm:py-4 font-black text-white hover:bg-red-700 transition mb-4 sm:mb-6 uppercase text-xs sm:text-sm tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next Step →
                  </button>
                )}
              </div>
            </div>
            )}
          </div>
        </div>
      </main>

    </div>
  )
}
