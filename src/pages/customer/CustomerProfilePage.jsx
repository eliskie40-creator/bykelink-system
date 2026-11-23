import { useEffect, useState } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions, storage } from '../../firebase'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import useToast from '../../context/useToast'
import NavHeaderCustomer from './components/NavHeaderCustomer'
import ConfirmationModal from '../superadmin/components/ConfirmationModal'
import LockRoundedIcon from '@mui/icons-material/LockRounded'
import EditRoundedIcon from '@mui/icons-material/EditRounded'
import CloudUploadRoundedIcon from '@mui/icons-material/CloudUploadRounded'
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded'
import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded'
import PhoneRoundedIcon from '@mui/icons-material/PhoneRounded'
import LocationOnRoundedIcon from '@mui/icons-material/LocationOnRounded'
import PersonRoundedIcon from '@mui/icons-material/PersonRounded'

const PASSWORD_REQUIREMENTS = [
  { label: 'At least 8 characters', regex: /.{8,}/ },
  { label: 'At least one uppercase letter', regex: /[A-Z]/ },
  { label: 'At least one lowercase letter', regex: /[a-z]/ },
  { label: 'At least one number', regex: /[0-9]/ },
  { label: 'At least one special character (!@#$%^&*)', regex: /[!@#$%^&*()_+\-={}|:;"'<>,.?]/ },
]

export default function CustomerProfilePage({ currentUser, onNavigateBack, onNavigateToShowroom, onNavigateToService, onNavigateToMessages, onNavigateToProfile, onNavigateToServiceBookings, onSignOut }) {
  const toast = useToast()
  const [isDarkMode, setIsDarkMode] = useState(true)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [userData, setUserData] = useState({
    fullName: '',
    phone: '',
    email: '',
    address: '',
    hasPassword: false,
  })
  const [formData, setFormData] = useState({
    phone: '',
    purok: '',
    barangay: '',
    city: '',
    province: '',
  })
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [, setPasswordRequirementsMet] = useState({})
  const [showPasswordSection, setShowPasswordSection] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [avatarFile, setAvatarFile] = useState(null) // File object
  const [avatarPreview, setAvatarPreview] = useState(null) // Data URL for preview
  const [confirmation, setConfirmation] = useState(null)
  const [isEditingForm, setIsEditingForm] = useState(false) // Track if user is editing the form
  const [unreadNotifications] = useState([
    { id: 1, title: 'Profile Update', message: 'Update your profile information', timestamp: 'Just now', read: false },
  ])

  // Fetch user data on mount
  useEffect(() => {
    if (!currentUser?.uid) {
      setIsLoading(false)
      return
    }

    const fetchUserData = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid))
        if (userDoc.exists()) {
          const data = userDoc.data()
          setUserData({
            fullName: data?.fullName || currentUser.displayName || '',
            phone: data?.phone || '',
            email: currentUser.email || '',
            address: data?.address || '',
            hasPassword: data?.hasPassword || false,
            avatar: data?.avatar || null,
          })
          setAvatarUrl(data?.avatar || null)
          const addressParts = parseAddress(data?.address || '')
          
          // Only update formData if user is not actively editing
          if (!isEditingForm) {
            setFormData({
              phone: data?.phone || '',
              purok: addressParts.purok || '',
              barangay: addressParts.barangay || '',
              city: addressParts.city || '',
              province: addressParts.province || '',
            })
          }
        } else {
          setUserData({
            fullName: currentUser.displayName || '',
            phone: '',
            email: currentUser.email || '',
            address: '',
            hasPassword: false,
            avatar: null,
          })
          setAvatarUrl(null)
          
          // Only reset formData if user is not actively editing
          if (!isEditingForm) {
            setFormData({
              phone: '',
              purok: '',
              barangay: '',
              city: '',
              province: '',
            })
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error)
        toast.error('Failed to load profile data')
      } finally {
        setIsLoading(false)
      }
    }

    fetchUserData()
  }, [currentUser, toast, isEditingForm])

  const parseAddress = (address) => {
    const parts = address.split('|')
    return {
      purok: parts[0]?.trim() || '',
      barangay: parts[1]?.trim() || '',
      city: parts[2]?.trim() || '',
      province: parts[3]?.trim() || '',
    }
  }

  const buildAddress = () => {
    return `${formData.purok}|${formData.barangay}|${formData.city}|${formData.province}`
  }

  const handleAvatarUpload = (file) => {
    if (!file) return
    try {
      // Preview - FileReader is async
      const reader = new FileReader()
      reader.onload = (e) => {
        // Store preview immediately without interfering with form state
        setAvatarPreview(e.target.result)
      }
      reader.readAsDataURL(file)
      
      // Store file reference
      setAvatarFile(file)
      toast.success('Avatar selected. Click "Save Profile" to apply changes.')
    } catch (error) {
      console.error('Error uploading avatar:', error)
      toast.error('Failed to upload avatar. Please try again.')
    }
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target
    
    // Mark as editing when user starts changing form fields
    if (!isEditingForm) {
      setIsEditingForm(true)
    }
    
    // Phone number validation - 11 digits starting with 09, numbers only
    if (name === 'phone') {
      const cleanedValue = value.replace(/\D/g, '')
      if (cleanedValue.length <= 11) {
        setFormData((prev) => {
          const newFormData = { ...prev, [name]: cleanedValue }
          return newFormData
        })
      }
      return
    }
    
    setFormData((prev) => {
      const newFormData = { ...prev, [name]: value }
      return newFormData
    })
  }

  const handlePasswordChange = (e) => {
    const { name, value } = e.target
    setPasswordData((prev) => ({ ...prev, [name]: value }))

    // Check password requirements for new password
    if (name === 'newPassword') {
      const met = {}
      PASSWORD_REQUIREMENTS.forEach((req) => {
        met[req.label] = req.regex.test(value)
      })
      setPasswordRequirementsMet(met)
    }
  }

  const validatePasswordRequirements = (password) => {
    return PASSWORD_REQUIREMENTS.every((req) => req.regex.test(password))
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault()

    if (!formData.phone.trim()) {
      toast.error('Contact Number is required')
      return
    }

    if (formData.phone.length !== 11 || !formData.phone.startsWith('09')) {
      toast.error('Contact Number must be 11 digits starting with 09')
      return
    }

    if (!formData.barangay.trim() || !formData.city.trim() || !formData.province.trim()) {
      toast.error('Barangay, City, and Province are required')
      return
    }

    // Show confirmation modal
    setConfirmation({
      open: true,
      type: 'saveProfile',
      title: 'Save Profile Changes?',
      message: 'Are you sure you want to save these profile changes?',
      confirmText: 'Save Changes',
      cancelText: 'Cancel',
    })
  }

  const handleConfirmSaveProfile = async () => {
    setConfirmation(null)
    try {
      setIsSaving(true)
      const address = buildAddress()
      const phone = formData.phone.trim()

      // Validate before sending to Cloud Function
      if (!phone) {
        toast.error('Phone number is required')
        setIsSaving(false)
        return
      }

      if (!address.split('|').slice(1).every(part => part.trim())) {
        toast.error('Barangay, City, and Province are required')
        setIsSaving(false)
        return
      }

      let avatarUrlToSave = userData.avatar || null
      // If a new avatar file is selected, upload to Firebase Storage
      if (avatarFile) {
        try {
          const avatarRef = ref(storage, `avatars/${currentUser.uid}`)
          await uploadBytes(avatarRef, avatarFile)
          avatarUrlToSave = await getDownloadURL(avatarRef)
        } catch (uploadError) {
          console.error('Error uploading avatar:', uploadError)
          toast.error(`Avatar upload failed: ${uploadError.message}`)
          setIsSaving(false)
          return
        }
      }

      const updateUserProfile = httpsCallable(functions, 'updateUserProfile')
      await updateUserProfile({
        phone,
        address,
        avatar: avatarUrlToSave,
      })

      setUserData((prev) => ({
        ...prev,
        phone,
        address,
        avatar: avatarUrlToSave,
      }))
      // Also update formData to keep the latest values in the form fields
      setFormData((prev) => ({
        ...prev,
        phone,
        purok: formData.purok,
        barangay: formData.barangay,
        city: formData.city,
        province: formData.province,
      }))
      setAvatarFile(null)
      setAvatarPreview(null)
      setIsEditingForm(false) // Reset editing flag after successful save
      toast.success('Profile updated successfully!')
    } catch (error) {
      console.error('Error saving profile:', error)
      const errorMessage = error?.message || 'Failed to save profile. Please try again.'
      const details = error?.code || ''
      toast.error(`${errorMessage}${details ? ` (${details})` : ''}`)
    } finally {
      setIsSaving(false)
    }
  }

  const handleUpdatePassword = async (e) => {
    e.preventDefault()

    if (!passwordData.newPassword.trim()) {
      toast.error('New password is required')
      return
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Passwords do not match')
      return
    }

    if (!validatePasswordRequirements(passwordData.newPassword)) {
      toast.error('Password does not meet all requirements')
      return
    }

    // Show confirmation modal
    setConfirmation({
      open: true,
      type: 'updatePassword',
      title: 'Update Password?',
      message: 'Are you sure you want to update your password? You will need to sign in again with your new password.',
      confirmText: 'Update Password',
      cancelText: 'Cancel',
    })
  }

  const handleConfirmUpdatePassword = async () => {
    setConfirmation(null)
    try {
      setIsSaving(true)

      // Validate password data
      if (!passwordData.newPassword || !passwordData.confirmPassword) {
        toast.error('Please fill in all password fields')
        setIsSaving(false)
        return
      }
      if (passwordData.newPassword !== passwordData.confirmPassword) {
        toast.error('Passwords do not match')
        setIsSaving(false)
        return
      }
      if (!validatePasswordRequirements(passwordData.newPassword)) {
        toast.error('Password does not meet requirements')
        setIsSaving(false)
        return
      }



      const updateUserPassword = httpsCallable(functions, 'updateUserPassword')
      const response = await updateUserPassword({
        currentPassword: userData.hasPassword ? passwordData.currentPassword : null,
        newPassword: passwordData.newPassword,
      })

      if (response?.data?.ok) {
        setPasswordData({
          currentPassword: '',
          newPassword: '',
          confirmPassword: '',
        })
        setShowPasswordSection(false)
        setUserData((prev) => ({
          ...prev,
          hasPassword: true,
        }))
        toast.success('Password updated successfully! Please sign in again.')
        setTimeout(() => {
          onSignOut?.()
        }, 3000)
      } else {
        const backendMsg = response?.data?.message || 'Failed to update password.'
        toast.error(backendMsg)
      }
    } catch (error) {
      console.error('Error updating password:', error)
      // Show more specific error messages from backend
      let errorMessage = 'Failed to update password. Please try again.'
      if (error?.message) {
        errorMessage = error.message
      } else if (error?.details) {
        errorMessage = error.details
      } else if (typeof error === 'string') {
        errorMessage = error
      }
      toast.error(errorMessage)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className={`min-h-screen ${isDarkMode ? 'bg-linear-to-b from-slate-950 via-slate-900 to-slate-950 text-white' : 'bg-white text-slate-900'} flex items-center justify-center`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto mb-4"></div>
          <p className="text-slate-400">Loading profile...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? 'bg-linear-to-b from-slate-950 via-slate-900 to-slate-950 text-white' : 'bg-white text-slate-900'} font-['Manrope']`}>
      <NavHeaderCustomer
        currentUser={currentUser}
        isDarkMode={isDarkMode}
        activePage="profile"
        unreadNotifications={unreadNotifications}
        onNavigateToShowroom={onNavigateToShowroom}
        onNavigateToService={onNavigateToService}
        onNavigateToMessages={onNavigateToMessages}
        onNavigateToProfile={onNavigateToProfile}
        onNavigateToServiceBookings={onNavigateToServiceBookings}
        onSignOut={onSignOut}
        userAvatar={avatarUrl}
      />

      {/* Main Content */}
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* ACCOUNT MANAGEMENT Section */}
        <div className={`${isDarkMode ? 'bg-slate-900/60' : 'bg-slate-100'} border ${isDarkMode ? 'border-slate-800' : 'border-slate-300'} p-6 sm:p-8 backdrop-blur-sm rounded-lg mb-6`}>
          {/* Header */}
          <div className="mb-8 border-b border-red-600 pb-4">
            <p className="text-xs font-black uppercase tracking-widest text-red-600 mb-2">ACCOUNT MANAGEMENT</p>
            <h1 className="text-3xl sm:text-4xl font-black italic tracking-tight text-white">Update Profile</h1>
          </div>

          {/* Profile Form */}
          <form onSubmit={handleSaveProfile} className="space-y-6">
            {/* Full Name and Contact Number Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Full Name */}
              <div className="space-y-2">
                <label className={`block text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Full Name</label>
                <input
                  type="text"
                  value={userData.fullName}
                  disabled
                  className={`w-full ${isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-slate-200 border-slate-400 text-slate-600'} border p-3 sm:p-4 text-xs sm:text-sm font-medium rounded cursor-not-allowed`}
                />
              </div>

              {/* Contact Number */}
              <div className="space-y-2">
                <label className={`block text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Contact Number *</label>
                <div className="relative">
                  <input
                    type="text"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="09xxxxxxxxx"
                    maxLength="11"
                    className={`w-full ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'} border focus:ring-2 focus:ring-red-600 focus:border-transparent p-3 sm:p-4 pr-10 text-xs sm:text-sm font-medium placeholder-slate-500 rounded transition-all`}
                    required
                  />
                  <PhoneRoundedIcon className={`absolute right-3 top-1/2 transform -translate-y-1/2 ${isDarkMode ? 'text-slate-600' : 'text-slate-500'}`} sx={{ fontSize: 18 }} />
                </div>
                <p className={`text-[9px] ${formData.phone.length === 11 && formData.phone.startsWith('09') ? 'text-green-500' : isDarkMode ? 'text-slate-500' : 'text-slate-600'}`}>
                  {formData.phone.length === 11 && formData.phone.startsWith('09') ? '✓ Valid format' : '11 digits starting with 09'}
                </p>
              </div>
            </div>

            {/* Email Address */}
            <div className="space-y-2">
              <label className={`block text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Email Address</label>
              <div className="relative">
                <input
                  type="email"
                  value={userData.email}
                  disabled
                  className={`w-full ${isDarkMode ? 'bg-slate-800 border-slate-700 text-slate-400' : 'bg-slate-200 border-slate-400 text-slate-600'} border p-3 sm:p-4 text-xs sm:text-sm font-medium rounded cursor-not-allowed pr-10`}
                />
                <LockRoundedIcon className={`absolute right-3 top-1/2 transform -translate-y-1/2 ${isDarkMode ? 'text-slate-600' : 'text-slate-500'}`} sx={{ fontSize: 18 }} />
              </div>
            </div>

            {/* Address Fields */}
            <div className="space-y-4 pt-4 border-t border-slate-700">
              <div className="flex items-center gap-2 mb-3">
                <LocationOnRoundedIcon className={isDarkMode ? 'text-slate-400' : 'text-slate-600'} sx={{ fontSize: 18 }} />
                <label className={`block text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Address *</label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Purok */}
                <div className="space-y-2">
                  <label className={`block text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Purok</label>
                  <input
                    type="text"
                    name="purok"
                    value={formData.purok}
                    onChange={handleInputChange}
                    placeholder="Purok/Street"
                    className={`w-full ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'} border focus:ring-2 focus:ring-red-600 focus:border-transparent p-3 sm:p-4 text-xs sm:text-sm font-medium placeholder-slate-500 rounded transition-all`}
                  />
                </div>
                {/* Barangay */}
                <div className="space-y-2">
                  <label className={`block text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Barangay *</label>
                  <input
                    type="text"
                    name="barangay"
                    value={formData.barangay}
                    onChange={handleInputChange}
                    placeholder="Barangay"
                    className={`w-full ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'} border focus:ring-2 focus:ring-red-600 focus:border-transparent p-3 sm:p-4 text-xs sm:text-sm font-medium placeholder-slate-500 rounded transition-all`}
                    required
                  />
                </div>
                {/* City */}
                <div className="space-y-2">
                  <label className={`block text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>City *</label>
                  <input
                    type="text"
                    name="city"
                    value={formData.city}
                    onChange={handleInputChange}
                    placeholder="City/Municipality"
                    className={`w-full ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'} border focus:ring-2 focus:ring-red-600 focus:border-transparent p-3 sm:p-4 text-xs sm:text-sm font-medium placeholder-slate-500 rounded transition-all`}
                    required
                  />
                </div>
                {/* Province */}
                <div className="space-y-2">
                  <label className={`block text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Province *</label>
                  <input
                    type="text"
                    name="province"
                    value={formData.province}
                    onChange={handleInputChange}
                    placeholder="Province"
                    className={`w-full ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'} border focus:ring-2 focus:ring-red-600 focus:border-transparent p-3 sm:p-4 text-xs sm:text-sm font-medium placeholder-slate-500 rounded transition-all`}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Avatar Section */}
            <div className="space-y-4 mt-8 pt-8 border-t border-slate-700">
              <div className="flex items-center gap-2 mb-3">
                <PersonRoundedIcon className={isDarkMode ? 'text-slate-400' : 'text-slate-600'} sx={{ fontSize: 18 }} />
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">Customer Avatar</p>
              </div>
              <div className="flex items-center gap-4">
                <img
                  src={avatarPreview || avatarUrl || "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect fill='%23222333' width='100' height='100'/%3E%3C/svg%3E"}
                  alt="Avatar"
                  className="w-20 h-20 rounded bg-slate-800 object-cover"
                />
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-slate-400">Recommended: 400x400px JPG/PNG</p>
                  <button
                    type="button"
                    onClick={() => document.getElementById('avatar-input')?.click()}
                    className="text-xs font-bold text-red-600 hover:text-red-700 uppercase tracking-widest mt-2 flex items-center gap-1"
                  >
                    <CloudUploadRoundedIcon sx={{ fontSize: 16 }} />
                    Upload Avatar
                  </button>
                  <input
                    id="avatar-input"
                    type="file"
                    accept="image/jpeg,image/png,image/jpg"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      
                      // Validate file size (max 5MB)
                      if (file.size > 5 * 1024 * 1024) {
                        toast.error('File size must be less than 5MB')
                        e.target.value = '' // Clear input
                        return
                      }
                      
                      handleAvatarUpload(file)
                      
                      // Clear the file input after handling - use microtask to avoid state conflicts
                      queueMicrotask(() => {
                        e.target.value = ''
                      })
                    }}
                    className="hidden"
                  />
                </div>
              </div>
            </div>

            {/* DEBUG: Form State Display */}
            <div className={`p-3 rounded text-xs bg-slate-800 border border-slate-700`}>
              <p className="text-slate-300 font-bold mb-2">Form State (Debug):</p>
              <div className="space-y-1 font-mono text-slate-400">
                <p>Phone: <span className="text-yellow-400">{formData.phone || '(empty)'}</span></p>
                <p>Purok: <span className="text-yellow-400">{formData.purok || '(empty)'}</span></p>
                <p>Barangay: <span className="text-yellow-400">{formData.barangay || '(empty)'}</span></p>
                <p>City: <span className="text-yellow-400">{formData.city || '(empty)'}</span></p>
                <p>Province: <span className="text-yellow-400">{formData.province || '(empty)'}</span></p>
              </div>
            </div>

            {/* Buttons */}
            <div className="flex gap-4 pt-8">
              <button
                type="button"
                onClick={onNavigateBack}
                className={`flex-1 py-3 sm:py-4 border ${isDarkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-400 text-slate-700 hover:bg-slate-200'} font-black uppercase tracking-widest transition-all rounded`}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 py-3 sm:py-4 bg-red-600 text-white font-black uppercase tracking-widest hover:bg-red-700 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed rounded"
              >
                {isSaving ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </form>
        </div>

        {/* SECURITY Section */}
        <div className={`${isDarkMode ? 'bg-slate-900/60' : 'bg-slate-100'} border ${isDarkMode ? 'border-slate-800' : 'border-slate-300'} p-6 sm:p-8 backdrop-blur-sm rounded-lg`}>
          {/* Header */}
          <div className="mb-6 border-b border-red-600 pb-4">
            <p className="text-xs font-black uppercase tracking-widest text-red-600 mb-2">SECURITY</p>
            <div className="flex items-center justify-between">
              <h2 className="text-2xl sm:text-3xl font-black italic tracking-tight text-white">
                {userData.hasPassword ? 'Update Password' : 'Set Your Password'}
              </h2>
              <p className={`text-xs font-semibold ${userData.hasPassword ? 'text-yellow-500' : 'text-orange-500'}`}>
                {userData.hasPassword ? '✓ Secure' : '⚠ No password set'}
              </p>
            </div>
          </div>

          {!showPasswordSection ? (
            <button
              type="button"
              onClick={() => setShowPasswordSection(true)}
              className="w-full py-3 sm:py-4 bg-slate-800 text-white font-black uppercase tracking-widest hover:bg-slate-700 transition-all rounded flex items-center justify-center gap-2"
            >
              <LockRoundedIcon sx={{ fontSize: 20 }} />
              {userData.hasPassword ? 'Change Password' : 'Create Password'}
            </button>
          ) : (
            <form onSubmit={handleUpdatePassword} className="space-y-6">
              {/* Current Password (only if user has password) */}
              {userData.hasPassword && (
                <div className="space-y-2">
                  <label className={`block text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Current Password *</label>
                  <input
                    type="password"
                    name="currentPassword"
                    value={passwordData.currentPassword}
                    onChange={handlePasswordChange}
                    placeholder="Enter current password"
                    className={`w-full ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'} border focus:ring-2 focus:ring-red-600 focus:border-transparent p-3 sm:p-4 text-xs sm:text-sm font-medium placeholder-slate-500 rounded transition-all`}
                    required={userData.hasPassword}
                  />
                </div>
              )}

              {/* New Password */}
              <div className="space-y-2">
                <label className={`block text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>New Password *</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    name="newPassword"
                    value={passwordData.newPassword}
                    onChange={handlePasswordChange}
                    placeholder="Enter new password"
                    className={`w-full ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'} border focus:ring-2 focus:ring-red-600 focus:border-transparent p-3 sm:p-4 pr-10 text-xs sm:text-sm font-medium placeholder-slate-500 rounded transition-all`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className={`absolute right-3 top-1/2 transform -translate-y-1/2 ${isDarkMode ? 'text-slate-600 hover:text-slate-400' : 'text-slate-500 hover:text-slate-700'} transition-colors`}
                  >
                    {showNewPassword ? <VisibilityOffRoundedIcon sx={{ fontSize: 18 }} /> : <VisibilityRoundedIcon sx={{ fontSize: 18 }} />}
                  </button>
                </div>
              </div>

              {/* Password Requirements */}
              {passwordData.newPassword && (
                <div className={`p-4 rounded ${isDarkMode ? 'bg-slate-800' : 'bg-slate-200'}`}>
                  <p className={`text-xs font-bold uppercase tracking-widest mb-3 ${isDarkMode ? 'text-slate-300' : 'text-slate-700'}`}>Password Requirements:</p>
                  <div className="space-y-2">
                    {PASSWORD_REQUIREMENTS.map((req) => {
                      const isMet = req.regex.test(passwordData.newPassword)
                      return (
                        <div key={req.label} className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded-full ${isMet ? 'bg-green-600' : isDarkMode ? 'bg-slate-700' : 'bg-slate-400'} flex items-center justify-center`}>
                            {isMet && <span className="text-white text-xs">✓</span>}
                          </div>
                          <p className={`text-xs ${isMet ? (isDarkMode ? 'text-green-400' : 'text-green-700') : isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{req.label}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Confirm Password */}
              <div className="space-y-2">
                <label className={`block text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>Confirm Password *</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    name="confirmPassword"
                    value={passwordData.confirmPassword}
                    onChange={handlePasswordChange}
                    placeholder="Confirm new password"
                    className={`w-full ${isDarkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-300 text-slate-900'} border focus:ring-2 focus:ring-red-600 focus:border-transparent p-3 sm:p-4 pr-10 text-xs sm:text-sm font-medium placeholder-slate-500 rounded transition-all`}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className={`absolute right-3 top-1/2 transform -translate-y-1/2 ${isDarkMode ? 'text-slate-600 hover:text-slate-400' : 'text-slate-500 hover:text-slate-700'} transition-colors`}
                  >
                    {showConfirmPassword ? <VisibilityOffRoundedIcon sx={{ fontSize: 18 }} /> : <VisibilityRoundedIcon sx={{ fontSize: 18 }} />}
                  </button>
                </div>
              </div>

              {/* Password Match Indicator */}
              {passwordData.confirmPassword && (
                <div className={`p-3 rounded text-xs font-semibold ${passwordData.newPassword === passwordData.confirmPassword ? 'bg-green-950/40 border border-green-900 text-green-300' : 'bg-red-950/40 border border-red-900 text-red-300'}`}>
                  {passwordData.newPassword === passwordData.confirmPassword ? '✓ Passwords match' : '✗ Passwords do not match'}
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordSection(false)
                    setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
                    setPasswordRequirementsMet({})
                  }}
                  className={`flex-1 py-3 sm:py-4 border ${isDarkMode ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-400 text-slate-700 hover:bg-slate-200'} font-black uppercase tracking-widest transition-all rounded`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !validatePasswordRequirements(passwordData.newPassword) || passwordData.newPassword !== passwordData.confirmPassword}
                  className="flex-1 py-3 sm:py-4 bg-red-600 text-white font-black uppercase tracking-widest hover:bg-red-700 transition-all active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed rounded"
                >
                  {isSaving ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      <ConfirmationModal
        open={confirmation?.open}
        title={confirmation?.title || ''}
        message={confirmation?.message || ''}
        confirmText={confirmation?.confirmText || 'Confirm'}
        cancelText={confirmation?.cancelText || 'Cancel'}
        isDangerous={confirmation?.type === 'updatePassword'}
        isDarkMode={isDarkMode}
        onConfirm={() => {
          if (confirmation?.type === 'saveProfile') {
            handleConfirmSaveProfile()
          } else if (confirmation?.type === 'updatePassword') {
            handleConfirmUpdatePassword()
          }
        }}
        onCancel={() => setConfirmation(null)}
      />
    </div>
  )
}

