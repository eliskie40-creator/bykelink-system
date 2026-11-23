import { useEffect, useRef, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  updateProfile,
  checkActionCode,
} from 'firebase/auth'
import { collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, where } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import HeroSection from './pages/herosection/HeroSection'
import LoginPage from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import PasswordResetConfirmationPage from './pages/PasswordResetConfirmationPage'
import EmailPasswordResetPage from './pages/EmailPasswordResetPage'
import ServicePage from './pages/herosection/ServicePage'
import SparePartsPage from './pages/herosection/SparePartsPage'
import ShowroomPage from './pages/herosection/ShowroomPage'
import CustomerShowroomPage from './pages/customer/CustomerShowroomPage'
import CustomerServicePage from './pages/customer/CustomerServicePage'
import CustomerMessagesPage from './pages/customer/CustomerMessagesPage'
import CustomerServiceBookingsPage from './pages/customer/CustomerServiceBookingsPage'
import CashierPanel from './pages/cashier/CashierPage'
import ProductDetailsPage from './pages/customer/ProductDetailsPage'
import CustomerProfilePage from './pages/customer/CustomerProfilePage'
import PasswordChangeRequiredModal from './pages/superadmin/components/PasswordChangeRequiredModal'
import SuperAdminPage from './pages/superadmin/SuperAdminPage'
import GlobalLoadingScreen from './components/GlobalLoadingScreen'
import ToastNotification from './components/ToastNotification'
import EmailVerifiedModal from './components/EmailVerifiedModal'
import { ToastProvider } from './context/ToastContext'
import { ThemeProvider } from './context/ThemeContext'
import { auth, db, functions, googleProvider } from './firebase'

const navLinks = [
  { label: 'Home', id: 'home' },
  { label: 'Service', id: 'service' },
  { label: 'About', id: 'about' },
  { label: 'Contact', id: 'contact' },
]


const roleLabels = {
  superadmin: 'Superadmin',
  admin: 'Admin',
  'staff personnel': 'Staff Personnel',
  'mechanics personnel': 'Mechanics Personnel',
  'cashier personnel': 'Cashier Personnel',
  customer: 'User',
}

const rolePriority = {
  customer: 0,
  'staff personnel': 1,
  'mechanics personnel': 1,
  'cashier personnel': 1,
  admin: 2,
  superadmin: 3,
}

const dashboardByRole = {
  customer: '/customer',
  'staff personnel': '/staff',
  'mechanics personnel': '/admin',
  'cashier personnel': '/cashier',
  admin: '/admin',
  superadmin: '/superadmin',
}

const dashboardRequirements = {
  '/customer': 'customer',
  '/admin': 'staff personnel',
  '/staff': 'staff personnel',
  '/cashier': 'cashier personnel',
  '/superadmin': 'superadmin',
}

const defaultAccessProfile = {
  role: 'guest',
  label: 'Guest',
  dashboardPath: null,
  isPrivileged: false,
  authorized: false,
  mustChangePassword: false,
  firstLoginRequired: false,
  source: 'guest',
}

const isAuthorizedAccessCollectionSource = (source = '') =>
  [
    'authorized-superadmin-collection',
    'authorized-admin-collection',
    'authorized-personnel-collection',
    'authorizedSuperadmin',
    'authorizedAdmin',
    'authorizedPersonnel',
  ].includes(String(source).trim())

const GOOGLE_AUTH_PERSONA_STORAGE_KEY = 'bykelink-google-auth-persona'
const VERIFICATION_EMAIL_COOLDOWN_MS = 5 * 60 * 1000

const formatAuthError = (error) => {
  switch (error?.code) {
    case 'auth/email-already-in-use':
      return 'This email is already registered. Try signing in instead.'
    case 'auth/invalid-email':
      return 'Please enter a valid email address.'
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password. Please try again.'
    case 'auth/weak-password':
      return 'Password must be at least 8 characters long and include uppercase, lowercase, and a number.'
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was canceled before completion.'
    case 'auth/popup-blocked':
      return 'Google sign-in was blocked by the browser. Please allow popups or try again.'
    case 'auth/web-storage-unsupported':
      return 'This browser mode is blocking Google sign-in storage. Please open the app normally and try again.'
    case 'auth/account-exists-with-different-credential':
      return 'This email already uses a different sign-in method. Try email and password instead.'
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.'
    case 'auth/operation-not-allowed':
      return 'Enable Email/Password and Google sign-in in the account settings to use this form.'
    default:
      return error?.message || 'Something went wrong. Please try again.'
  }
}


const normalizePath = (path) => {
  if (path?.startsWith('/superadmin/')) return path
  if (path?.startsWith('/admin/')) return path
  if (path?.startsWith('/staff/')) return path
  if (path?.startsWith('/customer/')) return path

  if (path?.startsWith('/login')) return '/login'
  if (path?.startsWith('/forgot-password')) return '/forgot-password'
  if (path?.startsWith('/password-reset-confirmation')) return '/password-reset-confirmation'

  if (path?.startsWith('/customer')) return '/customer'
  if (path?.startsWith('/cashier')) return '/cashier'
  if (path?.startsWith('/showroom')) return '/showroom'
  if (path?.startsWith('/spare-parts')) return '/spare-parts'
  if (path?.startsWith('/service')) return '/service'
  if (path?.startsWith('/superadmin')) return '/superadmin'
  if (path?.startsWith('/admin')) return '/admin'
  if (path?.startsWith('/staff')) return '/staff'

  return '/'
}


const getNavLabelForPath = (path, hash = '') => {
  const matchedLink = navLinks.find((link) => link.id === hash)

  if (path === '/showroom') return 'Showroom'
  if (path === '/spare-parts') return 'Spare Parts'
  if (path === '/service') return 'Service'
  if (path?.startsWith('/superadmin') || path?.startsWith('/admin') || path?.startsWith('/staff')) return 'Dashboard'
  if (dashboardRequirements[path]) return 'Dashboard'

  return matchedLink?.label || 'Home'
}

const getDashboardBasePath = (path = '') => {
  if (path?.startsWith('/superadmin')) return '/superadmin'
  if (path?.startsWith('/admin')) return '/admin'
  if (path?.startsWith('/staff')) return '/staff'
  return path
}

const canAccessRole = (currentRole, requiredRole) => {
  return (rolePriority[currentRole] ?? -1) >= (rolePriority[requiredRole] ?? Number.MAX_SAFE_INTEGER)
}


const normalizeAccessRole = (value = 'customer') => {
  const normalizedValue = String(value).trim().toLowerCase().replace(/[\s_-]+/g, '')

  if (normalizedValue === 'superadmin') return 'superadmin'
  if (normalizedValue === 'admin') return 'admin'
  if (normalizedValue === 'staff' || normalizedValue === 'staffpersonnel') return 'staff personnel'
  if (normalizedValue === 'mechanic' || normalizedValue === 'mechanics' || normalizedValue === 'mechanicspersonnel') return 'mechanics personnel'
  if (normalizedValue === 'cashier' || normalizedValue === 'cashierpersonnel') return 'cashier personnel'
  if (normalizedValue === 'customer' || normalizedValue === 'user') return 'customer'

  return 'customer'
}

const isCashierAccessRole = (role = '') => normalizeAccessRole(role) === 'cashier personnel'

const normalizeDashboardPath = (value = '') => {
  const normalizedValue = String(value).trim()

  if (!normalizedValue) return null

  return normalizePath(normalizedValue.startsWith('/') ? normalizedValue : `/${normalizedValue}`)
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

const buildAuthorizedAdminProfile = (
  entry = {},
  { fallbackRole = 'admin', source = 'authorized-admin-collection' } = {},
) => {
  if (!isAuthorizedEntryActive(entry)) {
    return null
  }

  const role = normalizeAccessRole(
    entry.role || entry.assignedRole || entry.accessRole || entry.accountRole || fallbackRole,
  )

  if (role === 'customer') {
    return null
  }

  // Log what we're reading from Firestore for debugging
  const sectionsFromFirestore = entry.accessibleSections || []

  return {
    role,
    label: roleLabels[role] || 'Admin',
    dashboardPath:
      normalizeDashboardPath(
        entry.dashboardPath || entry.assignedPage || entry.redirectTo || entry.page,
      ) || dashboardByRole[role] || null,
    isPrivileged: true,
    authorized: true,
    mustChangePassword: Boolean(entry.mustChangePassword),
    firstLoginRequired: Boolean(entry.firstLoginRequired),
    accessibleSections: sectionsFromFirestore,
    source,
  }
}

const getAuthorizedAdminProfile = async (email = '') => {
  const normalizedEmail = email.trim().toLowerCase()

  if (!normalizedEmail) {
    return null
  }

  const collectionsToCheck = [
    {
      name: 'authorizedSuperadmin',
      fallbackRole: 'superadmin',
      source: 'authorized-superadmin-collection',
    },
    {
      name: 'authorizedAdmin',
      fallbackRole: 'admin',
      source: 'authorized-admin-collection',
    },
    {
      name: 'authorizedPersonnel',
      fallbackRole: 'staff personnel',
      source: 'authorized-personnel-collection',
    },
  ]
  const emailFields = ['email', 'emailAddress', 'authorizedEmail', 'userEmail']

  const directProfiles = await Promise.all(
    collectionsToCheck.map(async ({ name: collectionName, fallbackRole, source }) => {
      try {
        const snapshot = await getDoc(doc(db, collectionName, normalizedEmail))

        return snapshot.exists()
          ? buildAuthorizedAdminProfile(snapshot.data(), { fallbackRole, source })
          : null
      } catch {
        return null
      }
    }),
  )
  const directProfile = directProfiles.find(Boolean)

  if (directProfile) {
    return directProfile
  }

  try {
    for (const { name: collectionName, fallbackRole, source } of collectionsToCheck) {
      for (const fieldName of emailFields) {
        let filteredSnapshot

        try {
          filteredSnapshot = await getDocs(
            query(collection(db, collectionName), where(fieldName, '==', normalizedEmail), limit(1)),
          )
        } catch (error) {
          if (error?.code !== 'permission-denied') {
            throw error
          }
          continue
        }

        const matchedDocument = filteredSnapshot.docs[0]

        if (matchedDocument) {
          const docData = matchedDocument.data()
          const matchedProfile = buildAuthorizedAdminProfile(docData, {
            fallbackRole,
            source,
          })

          if (matchedProfile) {
            return matchedProfile
          }
        }
      }
    }
  } catch {
    return null
  }

  return null
}

const isStrongPassword = (password = '') => {
  return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(password)
}

const shouldUseRedirectForGoogleAuth = () => {
  if (typeof window === 'undefined') {
    return false
  }

  return (
    window.matchMedia?.('(display-mode: standalone)')?.matches ||
    window.navigator?.standalone === true ||
    /Android|iPhone|iPad|iPod/i.test(window.navigator?.userAgent || '')
  )
}

function App() {
  const [isPageLoading, setIsPageLoading] = useState(true)
  const [currentPath, setCurrentPath] = useState(() => normalizePath(window.location.pathname))
  const [confirmationEmail, setConfirmationEmail] = useState('')
  const [confirmationType, setConfirmationType] = useState('reset') // 'reset' or 'authorized'
  const [activeSlide, setActiveSlide] = useState(0)
  const [activeNav, setActiveNav] = useState(() =>
    getNavLabelForPath(normalizePath(window.location.pathname), window.location.hash.replace('#', '')),
  )
  const [authMode, setAuthMode] = useState('signup')
  const [authPersona, setAuthPersona] = useState('customer')
  const [authLoading, setAuthLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [isAuthInitializing, setIsAuthInitializing] = useState(true)
  const [isAccessResolving, setIsAccessResolving] = useState(false)
  const [authMessage, setAuthMessage] = useState(null)
  const [authForm, setAuthForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [currentUser, setCurrentUser] = useState(null)
  const [accessProfile, setAccessProfile] = useState(defaultAccessProfile)
  const [requiresPasswordChange, setRequiresPasswordChange] = useState(false)
  const [passwordChangeLoading, setPasswordChangeLoading] = useState(false)
  const [passwordChangeMessage, setPasswordChangeMessage] = useState(null)
  const [passwordChangeSuccess, setPasswordChangeSuccess] = useState(false)
  const [passwordChangeForm, setPasswordChangeForm] = useState({
    currentPassword: '',
    password: '',
    confirmPassword: '',
  })
  const [emailPasswordResetCode, setEmailPasswordResetCode] = useState(null)
  const [emailVerificationCode, setEmailVerificationCode] = useState(null)
  const [emailVerificationEmail, setEmailVerificationEmail] = useState(null)
  const [signupSuccessEmail, setSignupSuccessEmail] = useState(null)
  const [signupSuccessUser, setSignupSuccessUser] = useState(null)
  const [resendingEmail, setResendingEmail] = useState(false)
  const [showEmailVerifiedModal, setShowEmailVerifiedModal] = useState(false)
  const authPersonaRef = useRef(authPersona)
  const completeAccessFlowRef = useRef(null)

  // Extract verification code and email from URL parameters
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const verificationCode = params.get('verification')
    const verificationEmail = params.get('email')
    
    if (verificationCode && verificationEmail) {
      setEmailVerificationCode(verificationCode)
      setEmailVerificationEmail(decodeURIComponent(verificationEmail))
      // Clean up URL to avoid re-processing on every render
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])


  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setIsPageLoading(false)
    }, 5000) // Extended to account for GlobalLoadingScreen completion (~4.3s)

    return () => window.clearTimeout(timerId)
  }, [])

  useEffect(() => {
    authPersonaRef.current = authPersona
  }, [authPersona])

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user)
      setIsAccessResolving(Boolean(user))
      setIsAuthInitializing(false)
    })

    return unsubscribe
  }, [])

  // Check for email verification success when navigating to customer dashboard
  useEffect(() => {
    if (currentPath === '/customer' && currentUser && accessProfile.role === 'customer') {
      const emailVerifiedFlag = window.sessionStorage.getItem('email_verified_success')
      if (emailVerifiedFlag) {
        setShowEmailVerifiedModal(true)
        window.sessionStorage.removeItem('email_verified_success')
      }
    }
  }, [currentPath, currentUser, accessProfile.role])

  useEffect(() => {
    let isSubscribed = true

    const resolveGoogleRedirect = async () => {
      try {
        const credentials = await getRedirectResult(auth)

        if (!credentials?.user || !isSubscribed) {
          return
        }

        const requestedRole =
          window.sessionStorage.getItem(GOOGLE_AUTH_PERSONA_STORAGE_KEY) || authPersonaRef.current || 'customer'

        window.sessionStorage.removeItem(GOOGLE_AUTH_PERSONA_STORAGE_KEY)

        await completeAccessFlowRef.current?.(
          credentials.user,
          requestedRole,
          requestedRole === 'customer'
            ? 'Google sign-in successful. Your rider account is now connected.'
            : `${roleLabels[requestedRole]} access verified with Google sign-in.`,
        )
      } catch (error) {
        if (isSubscribed && error?.code !== 'auth/no-auth-event') {
          setAuthMessage({
            type: 'error',
            text: formatAuthError(error),
          })
        }
      } finally {
        if (isSubscribed) {
          setGoogleLoading(false)
        }
      }
    }

    resolveGoogleRedirect()

    return () => {
      isSubscribed = false
    }
  }, [])

  useEffect(() => {
    const handlePopState = () => {
      const nextPath = normalizePath(window.location.pathname)
      const hash = window.location.hash.replace('#', '')

      setCurrentPath(nextPath)
      setActiveNav(getNavLabelForPath(nextPath, hash))
    }

    window.addEventListener('popstate', handlePopState)

    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // Detect Firebase action codes from email links (password reset, email verification, etc.)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const oobCode = urlParams.get('oobCode')

    if (!oobCode) return

    // Determine the action type by checking the code
    const detectActionType = async () => {
      try {
       
        const actionInfo = await checkActionCode(auth, oobCode)
   

        if (actionInfo?.operation === 'VERIFY_EMAIL') {
       
          setEmailVerificationCode(oobCode)
        } else if (actionInfo?.operation === 'PASSWORD_RESET') {
          
          setEmailPasswordResetCode(oobCode)
        }

        // Clean up URL to remove the query parameters
        window.history.replaceState({}, document.title, window.location.pathname)
      } catch (error) {
        console.error('[AUTH ACTION] Failed to detect action type:', error?.code, error?.message)
      }
    }

    detectActionType()
  }, [])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % 3)
    }, 4500)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    const sections = navLinks
      .map((link) => document.getElementById(link.id))
      .filter(Boolean)

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]

        if (!visibleEntry) return

        const matchedLink = navLinks.find((link) => link.id === visibleEntry.target.id)

        if (matchedLink) {
          setActiveNav(matchedLink.label)
        }
      },
      {
        threshold: [0.25, 0.45, 0.65],
        rootMargin: '-20% 0px -55% 0px',
      },
    )

    sections.forEach((section) => observer.observe(section))

    return () => observer.disconnect()
  }, [currentPath])

  useEffect(() => {
    const elements = document.querySelectorAll('[data-reveal]')

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible')
            observer.unobserve(entry.target)
          }
        })
      },
      {
        threshold: 0.15,
        rootMargin: '0px 0px -40px 0px',
      },
    )

    elements.forEach((element) => observer.observe(element))

    return () => observer.disconnect()
  }, [currentPath])

 
useEffect(() => {
  const currentDashboardPath = getDashboardBasePath(normalizePath(window.location.pathname))
  const requestedRole = dashboardRequirements[currentDashboardPath] || 'customer';

  if (!currentUser) {
    setAccessProfile(defaultAccessProfile);
    setIsAccessResolving(false);
    return;
  }

  let isMounted = true;
  const timeout = setTimeout(() => {
    if (isMounted) {
      console.warn("Access resolving timeout - forcing stop");
      setIsAccessResolving(false);
    }
  }, 10000);

  const resolveAccessProfile = async () => {
    setIsAccessResolving(true);

    try {
      const profile = await resolveRoleAfterLogin(currentUser, requestedRole);

      if (isMounted) {
        setAccessProfile(profile);
      }
    } catch (error) {
      console.error("Access resolve error:", error);
    } finally {
      if (isMounted) {
        clearTimeout(timeout);
        setIsAccessResolving(false);
      }
    }
  };

  resolveAccessProfile();

  return () => {
    isMounted = false;
    clearTimeout(timeout);
  };

}, [currentUser]);


  useEffect(() => {
    const isCustomerRoute = currentPath === '/customer' || currentPath.startsWith('/customer/')
    const isStaffOnAdminRoute =
      accessProfile.role === 'staff personnel' &&
      (currentPath === '/admin' || currentPath.startsWith('/admin/'))
    const isCashierOnStaffRoute =
      isCashierAccessRole(accessProfile.role) &&
      (currentPath === '/staff' || currentPath.startsWith('/staff/'))
    const isRoleMismatch =
      (isCustomerRoute && accessProfile.role !== 'customer') || isStaffOnAdminRoute || isCashierOnStaffRoute

    if (
      (currentPath === '/' || currentPath === '/login' || isRoleMismatch) &&
      currentUser &&
      !isAccessResolving &&
      accessProfile.dashboardPath &&
      (accessProfile.isPrivileged || accessProfile.role === 'customer' || isCashierAccessRole(accessProfile.role))
    ) {
      const normalizedRole = normalizeAccessRole(accessProfile.role)

      if (normalizedRole === 'cashier personnel') {
        navigateTo('/cashier')
        return
      }

      navigateTo(accessProfile.dashboardPath)
    }
  }, [currentPath, currentUser, isAccessResolving, accessProfile.role, accessProfile.isPrivileged, accessProfile.dashboardPath])

  useEffect(() => {
    if (currentUser) {
      setRequiresPasswordChange(Boolean(accessProfile.mustChangePassword || accessProfile.firstLoginRequired))
    }
  }, [currentUser, accessProfile.firstLoginRequired, accessProfile.mustChangePassword])

  useEffect(() => {
    let isSubscribed = true

    const loadPasswordRequirement = async () => {
      if (!currentUser?.uid) {
        if (isSubscribed) {
          setRequiresPasswordChange(false)
        }
        return
      }

      try {
        const authorizedProfile = await getAuthorizedAdminProfile(currentUser.email || '')

        if (authorizedProfile && isSubscribed) {
          const shouldChangePassword = Boolean(authorizedProfile.mustChangePassword || authorizedProfile.firstLoginRequired)
          setRequiresPasswordChange(shouldChangePassword)
          return
        }

        const userSnapshot = await getDoc(doc(db, 'users', currentUser.uid))
        const userData = userSnapshot.data() || {}
        const shouldChangePassword = Boolean(userData.mustChangePassword || userData.firstLoginRequired)

        if (isSubscribed) {
          setRequiresPasswordChange(shouldChangePassword)
        }
      } catch {
        if (isSubscribed) {
          setRequiresPasswordChange(false)
        }
      }
    }

    loadPasswordRequirement()

    return () => {
      isSubscribed = false
    }
  }, [currentUser])

  const customerName = currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Rider'

  const openAuthPanel = (mode, persona = authPersona) => {
    setAuthPersona(persona)
    setAuthMode(persona === 'customer' ? mode : 'login')
    setAuthMessage(null)
  }

  const goToHomeSection = (sectionId = 'home', label = 'Home') => {
    const nextUrl = sectionId === 'home' ? '/#home' : `/#${sectionId}`

    if (window.location.pathname !== '/' || window.location.hash !== `#${sectionId}`) {
      window.history.pushState({}, '', nextUrl)
    }

    setCurrentPath('/')
    setActiveNav(label)

    // Set authMode to 'login' when navigating to the login section
    if (sectionId === 'login') {
      setAuthMode('login')
    }

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const section = document.getElementById(sectionId)

        if (section) {
          section.scrollIntoView({ behavior: 'smooth', block: 'start' })
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }
      })
    })
  }

  const openAuthSection = (mode, persona = authPersona) => {
    openAuthPanel(mode, persona)
    goToHomeSection(mode === 'signup' && persona === 'customer' ? 'signup' : 'login', 'Home')
  }

  const navigateTo = (path) => {
    const nextPath = normalizePath(path)

    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath)
    }

    setCurrentPath(nextPath)
    setActiveNav(getNavLabelForPath(nextPath))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleSelectAuthPersona = (persona) => {
    setAuthPersona(persona)
    setAuthMode((current) => (persona === 'customer' ? current : 'login'))
    setAuthMessage(null)
  }

  const handleToggleAuthMode = (mode) => {
    setAuthMode(mode)
    setAuthMessage(null)
    setAuthForm({
      fullName: '',
      phone: '',
      email: '',
      password: '',
      confirmPassword: '',
    })
  }

  const handleAuthFieldChange = (event) => {
    const { name, value } = event.target

    setAuthForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  const handlePasswordChangeField = (event) => {
    const { name, value } = event.target

    setPasswordChangeForm((current) => ({
      ...current,
      [name]: value,
    }))
    setPasswordChangeMessage(null)
  }

  const syncUserDocument = async (user, profile = {}) => {
    if (isAuthorizedAccessCollectionSource(profile?.source)) {
      return
    }

    try {
      await setDoc(
        doc(db, 'users', user.uid),
        {
          fullName: authForm.fullName.trim() || user.displayName || user.email?.split('@')[0] || 'Rider',
          phone: authForm.phone.trim(),
          email: user.email?.trim().toLowerCase() || '',
          role: profile?.role || 'customer',
          emailVerified: Boolean(user.emailVerified),
          providers: user.providerData.map((provider) => provider.providerId),
          lastSignInProvider: user.providerData[0]?.providerId || 'password',
          lastLoginAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          
accessibleSections: Array.isArray(profile?.accessibleSections)
      ? profile.accessibleSections
      : [],

        },
        { merge: true },
      )
    } catch (error) {
      console.warn('Unable to sync user document to Firestore.', error)
    }
  }

  const handleResendSignupEmail = async () => {
    if (!signupSuccessUser) return
    setResendingEmail(true)
    try {
      const resendVerificationEmailFn = httpsCallable(functions, 'resendVerificationEmail')
      await resendVerificationEmailFn({ email: signupSuccessUser.email })
      setAuthMessage({
        type: 'success',
        text: 'Verification email sent! Check your inbox.',
      })
    } catch (error) {
      console.error('Error resending email:', error)
      setAuthMessage({
        type: 'error',
        text: 'Unable to resend email. Please try again.',
      })
    } finally {
      setResendingEmail(false)
    }
  }

  const resolveRoleAfterLogin = async (user, requestedRole) => {
    const syncUserAccess = httpsCallable(functions, 'syncUserAccess')

    const localProfilePromise = (async () => {
      try {
        const authorizedAdminProfile = await getAuthorizedAdminProfile(user.email || '')
        if (authorizedAdminProfile) {
          return {
            role: authorizedAdminProfile.role,
            label: roleLabels[authorizedAdminProfile.role] || 'Admin',
            dashboardPath:
              (isCashierAccessRole(authorizedAdminProfile.role)
                ? dashboardByRole[authorizedAdminProfile.role]
                : authorizedAdminProfile.dashboardPath) ||
              dashboardByRole[authorizedAdminProfile.role] ||
              null,
            isPrivileged: true,
            authorized: true,
            mustChangePassword: Boolean(authorizedAdminProfile.mustChangePassword),
            firstLoginRequired: Boolean(
              authorizedAdminProfile.firstLoginRequired || authorizedAdminProfile.mustChangePassword,
            ),
            accessibleSections: authorizedAdminProfile.accessibleSections || [],
            source: authorizedAdminProfile.source,
          }
        }

        const userSnapshot = await getDoc(doc(db, 'users', user.uid)).catch(() => null)
        const userData = userSnapshot?.exists ? userSnapshot.data() : {}
        const firestoreRole = normalizeAccessRole(userData?.role || userData?.accountRole || requestedRole)

        if (firestoreRole !== 'customer') {
          const firestoreSections = Array.isArray(userData?.accessibleSections)
            ? userData.accessibleSections
            : []

          return {
            role: firestoreRole,
            label: roleLabels[firestoreRole] || 'User',
            dashboardPath: dashboardByRole[firestoreRole] || null,
            isPrivileged: true,
            authorized: true,
            mustChangePassword: Boolean(userData?.mustChangePassword),
            firstLoginRequired: Boolean(userData?.firstLoginRequired || userData?.mustChangePassword),
            accessibleSections: firestoreSections,
            source: 'firestore-user-doc',
          }
        }
      } catch {
        // Ignore local role lookup failures and continue with the cloud fallback.
      }

      return null
    })()

    const cloudResultPromise = Promise.race([
      syncUserAccess({ requestedRole }).then((result) => result?.data ?? null).catch(() => null),
      new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
    ])
    const [localProfile, cloudResult] = await Promise.all([
      Promise.race([
        localProfilePromise,
        new Promise((resolve) => setTimeout(() => resolve(null), 2500)),
      ]),
      cloudResultPromise,
    ])

    const resolvedCloudRole = normalizeAccessRole(cloudResult?.role || requestedRole)
    const cloudDashboardPath =
      normalizeDashboardPath(cloudResult?.dashboardPath) ||
      dashboardByRole[resolvedCloudRole] ||
      null

    if (localProfile && localProfile.role !== 'customer') {
      return localProfile
    }

    if (resolvedCloudRole !== 'customer') {
      return {
        role: resolvedCloudRole,
        label: roleLabels[resolvedCloudRole] || 'User',
        dashboardPath:
          cloudDashboardPath && cloudDashboardPath !== '/'
            ? cloudDashboardPath
            : dashboardByRole[resolvedCloudRole],
        isPrivileged: true,
        authorized: true,
        mustChangePassword: Boolean(cloudResult?.mustChangePassword),
        firstLoginRequired: Boolean(cloudResult?.firstLoginRequired || cloudResult?.mustChangePassword),
        accessibleSections: localProfile?.accessibleSections || [],
        source: typeof cloudResult?.source === 'string' ? cloudResult.source : 'firestore-user-doc',
      }
    }

    if (requestedRole === 'customer') {
      return {
        role: 'customer',
        label: roleLabels['customer'] || 'Customer',
        dashboardPath: '/customer',
        isPrivileged: false,
        authorized: true,
        mustChangePassword: false,
        firstLoginRequired: false,
        source: 'customer-login',
      }
    }

    return {
      role: resolvedCloudRole,
      label: roleLabels[resolvedCloudRole] || 'User',
      dashboardPath: cloudDashboardPath && cloudDashboardPath !== '/' ? cloudDashboardPath : dashboardByRole[resolvedCloudRole],
      isPrivileged: resolvedCloudRole !== 'customer',
      authorized: true,
      mustChangePassword: Boolean(cloudResult?.mustChangePassword),
      firstLoginRequired: Boolean(cloudResult?.firstLoginRequired || cloudResult?.mustChangePassword),
      source: cloudResult?.source || 'cloud-function',
    }
  }


  const completeAccessFlow = async (user, requestedRole, successText) => {
    const profile = await resolveRoleAfterLogin(user, requestedRole)

    // If trying to access a higher privilege role than they have
    if (requestedRole !== 'customer' && !profile.authorized && !profile.isPrivileged) {
      await signOut(auth)
      setAccessProfile(defaultAccessProfile)
      setAuthMessage({
        type: 'error',
        text: `This email is not assigned for ${roleLabels[requestedRole]} access. Add it to the proper authorized Firestore collection first.`,
      })
      navigateTo('/')
      return null
    }

    await syncUserDocument(user, profile)
    setAccessProfile(profile)
    setAuthMessage({
      type: 'success',
      text: profile.isPrivileged
        ? `${profile.label} access verified. Opening the secure console.`
        : successText,
    })

    if (profile.dashboardPath) {
      navigateTo(profile.dashboardPath)
    }

      setIsAccessResolving(false);

    return profile
  }

  completeAccessFlowRef.current = completeAccessFlow

  const handleAuthSubmit = async (event) => {
    event.preventDefault()
    setAuthLoading(true)
    setAuthMessage(null)

    try {
      const requestedRole = authPersona

      if (!authForm.email.trim()) {
        throw new Error('Please enter your email address.')
      }

      if (authMode === 'signup') {
        if (!authForm.fullName.trim()) {
          throw new Error('Please enter your full name to create a secure account.')
        }

        if (!isStrongPassword(authForm.password)) {
          throw new Error('Use a stronger password with at least 8 characters, uppercase, lowercase, and a number.')
        }

        if (authForm.password !== authForm.confirmPassword) {
          throw new Error('Passwords do not match. Please confirm your password again.')
        }
      }

      
if (requestedRole === 'customer' && authMode === 'signup') {
  const credentials = await createUserWithEmailAndPassword(
    auth,
    authForm.email.trim().toLowerCase(),
    authForm.password
  );

  if (authForm.fullName.trim()) {
    await updateProfile(credentials.user, {
      displayName: authForm.fullName.trim(),
    });
  }

  await syncUserDocument(credentials.user, {
    role: 'customer',
    source: 'customer-signup',
  });

  const signupEmail = authForm.email.trim().toLowerCase();
  setSignupSuccessEmail(signupEmail);
  setSignupSuccessUser(credentials.user);

  window.sessionStorage.setItem('signup_email', signupEmail);

  setAuthForm({
    fullName: '',
    phone: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  return;
} else {
  // ✅ LOGIN FLOW (clean)
  const credentials = await signInWithEmailAndPassword(
    auth,
    authForm.email.trim().toLowerCase(),
    authForm.password
  );

  if (!credentials.user.emailVerified && requestedRole !== 'superadmin') {
    try {
      const sendVerificationEmailFn = httpsCallable(functions, 'sendVerificationEmail');
      await sendVerificationEmailFn({ email: credentials.user.email });
    } catch (emailError) {
      console.warn('[LOGIN] Failed to send verification email:', emailError?.message);
    }

    await signOut(auth);
    setAccessProfile(defaultAccessProfile);

    throw new Error('Email not verified. Check your inbox.');
  }

  
let actualRole = requestedRole;

// ✅ Try to read Firestore (optional)
const userDoc = await getDoc(doc(db, "users", credentials.user.uid));

if (userDoc.exists()) {
  actualRole = userDoc.data().role?.toLowerCase().trim() || requestedRole;
}

// ✅ fallback if missing
if (!actualRole) {
  actualRole = "customer";
}

  await completeAccessFlow(
    credentials.user,
    actualRole,
    actualRole === 'customer'
      ? 'Welcome back.'
      : `${roleLabels[actualRole] || actualRole} access verified.`,
  );
}

    } catch (error) {
      setAuthMessage({ type: 'error', text: error.message })
    } finally {
      setAuthLoading(false)
    }
  }



  const handleGoogleSignIn = async () => {
    setGoogleLoading(true)
    setAuthMessage(null)

    const requestedRole = authPersona

    try {
      if (shouldUseRedirectForGoogleAuth()) {
        window.sessionStorage.setItem(GOOGLE_AUTH_PERSONA_STORAGE_KEY, requestedRole)
        await signInWithRedirect(auth, googleProvider)
        return
      }

      const credentials = await signInWithPopup(auth, googleProvider)

      await completeAccessFlow(
        credentials.user,
        requestedRole,
        requestedRole === 'customer'
          ? 'Google sign-in successful. Your rider account is now connected.'
          : `${roleLabels[requestedRole]} access verified with Google sign-in.`,
      )
    } catch (error) {
      const shouldFallbackToRedirect =
        error?.code === 'auth/popup-blocked' ||
        error?.code === 'auth/web-storage-unsupported' ||
        String(error?.message || '').includes('Cross-Origin-Opener-Policy')

      if (shouldFallbackToRedirect) {
        window.sessionStorage.setItem(GOOGLE_AUTH_PERSONA_STORAGE_KEY, requestedRole)
        await signInWithRedirect(auth, googleProvider)
        return
      }

      setAuthMessage({
        type: 'error',
        text: formatAuthError(error),
      })
    } finally {
      setGoogleLoading(false)
    }
  }

  const handleSignOut = async () => {
    await signOut(auth)
    setAccessProfile(defaultAccessProfile)
    setRequiresPasswordChange(false)
    setPasswordChangeMessage(null)
    setPasswordChangeForm({
      password: '',
      confirmPassword: '',
    })
    setAuthMessage({
      type: 'success',
      text: 'You have been signed out successfully.',
    })
    navigateTo('/')
  }

  const handleRequiredPasswordChange = async (event) => {
    event.preventDefault()
    setPasswordChangeLoading(true)
    setPasswordChangeMessage(null)

    try {
      if (!passwordChangeForm.password.trim()) {
        throw new Error('Enter your new password first.')
      }

      if (!isStrongPassword(passwordChangeForm.password)) {
        throw new Error('Use a stronger password with at least 8 characters, uppercase, lowercase, and a number.')
      }

      if (passwordChangeForm.password !== passwordChangeForm.confirmPassword) {
        throw new Error('Passwords do not match. Please confirm your password again.')
      }

      const signedInUser = auth.currentUser
      if (!signedInUser?.email) {
        throw new Error('Your session expired. Please sign in again with the temporary password.')
      }

      if (!passwordChangeForm.currentPassword) {
        throw new Error('Enter your temporary password to verify your account.')
      }

      const credential = EmailAuthProvider.credential(
        signedInUser.email,
        passwordChangeForm.currentPassword,
      )
      await reauthenticateWithCredential(signedInUser, credential)
      await updatePassword(signedInUser, passwordChangeForm.password)

      const completeFirstLoginSetup = httpsCallable(functions, 'completeFirstLoginSetup')
      await completeFirstLoginSetup({})

      if (auth.currentUser) {
        try {
          await auth.currentUser.getIdToken(true)
        } catch (tokenError) {
          console.warn('Unable to refresh the auth token after first-login completion.', tokenError)
        }
      }

      // Show success message instead of immediately closing
      setPasswordChangeSuccess(true)
      setPasswordChangeForm({
        currentPassword: '',
        password: '',
        confirmPassword: '',
      })
      setPasswordChangeMessage({
        type: 'success',
        text: 'Password updated successfully. Your account is now fully activated.',
      })
    } catch (error) {
      const passwordMessage =
        ['auth/invalid-credential', 'auth/wrong-password', 'auth/user-mismatch'].includes(error?.code)
          ? 'The temporary password is incorrect. Check it and try again.'
          : error?.code === 'auth/requires-recent-login'
          ? 'Please sign in again using the temporary password, then update it immediately.'
          : formatAuthError(error)

      setPasswordChangeMessage({
        type: 'error',
        text: passwordMessage,
      })
    } finally {
      setPasswordChangeLoading(false)
    }
  }

  const handleDismissPasswordChangeSuccess = () => {
    setPasswordChangeSuccess(false)
    setRequiresPasswordChange(false)
    setPasswordChangeMessage(null)
  }

  const currentDashboardBasePath = getDashboardBasePath(currentPath)
  const requiredDashboardRole = dashboardRequirements[currentDashboardBasePath]
  const normalizedAccessRole = normalizeAccessRole(accessProfile.role)
  const canViewCurrentDashboard = requiredDashboardRole
    ? canAccessRole(normalizedAccessRole, requiredDashboardRole)
    : false

  const shouldShowAccessLoader =
    (Boolean(requiredDashboardRole) && (isAuthInitializing || isAccessResolving)) ||
    (currentPath === '/' &&
      currentUser &&
      (isAuthInitializing || isAccessResolving || (accessProfile.isPrivileged && accessProfile.dashboardPath)))

  const passwordChangeModal = (
    <PasswordChangeRequiredModal
      open={Boolean(currentUser && requiresPasswordChange)}
      currentUser={currentUser}
      passwordChangeForm={passwordChangeForm}
      onFieldChange={handlePasswordChangeField}
      onSubmit={handleRequiredPasswordChange}
      isSubmitting={passwordChangeLoading}
      message={passwordChangeMessage}
      isSuccessful={passwordChangeSuccess}
      onDismissSuccess={handleDismissPasswordChangeSuccess}
    />
  )

  const withSecurityModal = (content) => (
    <>
      {content}
      {passwordChangeModal}
    </>
  )

  // Handle email password reset from link in email
  if (emailPasswordResetCode) {
    return withSecurityModal(
      <EmailPasswordResetPage
        resetCode={emailPasswordResetCode}
        onNavigateBack={() => {
          setEmailPasswordResetCode(null)
          navigateTo('/login')
        }}
      />
    )
  }

  if (currentPath === '/forgot-password') {
    return withSecurityModal(
      <ForgotPasswordPage
        onNavigateBack={() => navigateTo('/login')}
        onGoogleSignIn={handleGoogleSignIn}
        onNavigateConfirmation={(email, type = 'reset') => {
          setConfirmationEmail(email)
          setConfirmationType(type)
          navigateTo('/password-reset-confirmation')
        }}
      />,
    )
  }

  if (currentPath === '/password-reset-confirmation') {
    return withSecurityModal(
      <PasswordResetConfirmationPage
        email={confirmationEmail}
        type={confirmationType}
        onNavigateBack={() => navigateTo('/login')}
        onResendEmail={(email) => setConfirmationEmail(email)}
      />,
    )
  }

  if (currentPath === '/login') {
    return withSecurityModal(
      <LoginPage
        authMode={authMode}
        onGoogleSignIn={handleGoogleSignIn}
        onAuthFieldChange={handleAuthFieldChange}
        onAuthSubmit={handleAuthSubmit}
        onSelectAuthPersona={handleSelectAuthPersona}
        onToggleAuthMode={handleToggleAuthMode}
        authForm={authForm}
        authLoading={authLoading || isAccessResolving}
        googleLoading={googleLoading}
        onNavigateBack={() => navigateTo('/')}
        onNavigateForgotPassword={() => navigateTo('/forgot-password')}
        authMessage={authMessage}
        onClearAuthMessage={() => setAuthMessage(null)}
        signupSuccessEmail={signupSuccessEmail}
        onSetSignupSuccessEmail={setSignupSuccessEmail}
        emailVerificationCode={emailVerificationCode}
        emailVerificationEmail={emailVerificationEmail}
        onResendSignupEmail={handleResendSignupEmail}
        resendingEmail={resendingEmail}
      />,
    )
  }

  if (currentPath === '/showroom') {
    return withSecurityModal(
      <ShowroomPage
        onNavigateHome={() => goToHomeSection('home', 'Home')}
        onNavigateSection={goToHomeSection}
        onNavigateService={() => goToHomeSection('service', 'Service')}
        onNavigateSpareParts={() => navigateTo('/spare-parts')}
        onNavigateLogin={() => navigateTo('/login')}
        onNavigateShowroom={() => navigateTo('/showroom')}
        currentUser={currentUser}
      />,
    )
  }

  if (currentPath === '/spare-parts') {
    return withSecurityModal(
      <SparePartsPage
        onNavigateHome={() => goToHomeSection('home', 'Home')}
        onNavigateSection={goToHomeSection}
        onNavigateService={() => goToHomeSection('service', 'Service')}
        onNavigateShowroom={() => navigateTo('/showroom')}
        onOpenSignup={() => openAuthSection('signup', 'customer')}
        currentUser={currentUser}
      />,
    )
  }

  if (currentPath === '/service') {
    return withSecurityModal(
      <ServicePage
        onNavigateHome={() => goToHomeSection('home', 'Home')}
        onNavigateShowroom={() => navigateTo('/showroom')}
        onNavigateSection={goToHomeSection}
        onOpenSignup={() => openAuthSection('signup', 'customer')}
      />,
    )
  }

  if (currentPath === '/customer' && (!currentUser || accessProfile.role === 'customer')) {
    return withSecurityModal(
      <CustomerShowroomPage
        currentUser={currentUser}
        onSignOut={currentUser ? handleSignOut : null}
        onNavigateToShowroom={() => navigateTo('/customer')}
        onNavigateToService={() => navigateTo('/customer/service')}
        onNavigateToMessages={() => navigateTo('/customer/messages')}
        onNavigateToProfile={() => navigateTo('/customer/profile')}
        onNavigateToServiceBookings={() => navigateTo('/customer/service-bookings')}
        onNavigateBack={() => navigateTo('/customer')}
        onNavigateToProduct={(productId) => navigateTo(`/customer/product/${encodeURIComponent(productId)}`)}
      />,
    )
  }

  // Customer Service Page Route
  if ((currentPath === '/cashier' || (currentPath === '/' && currentUser && isCashierAccessRole(accessProfile.role))) && currentUser && isCashierAccessRole(accessProfile.role)) {
    return withSecurityModal(
      <CashierPanel
        currentUser={currentUser}
        onSignOut={handleSignOut}
        onNavigateBack={() => navigateTo('/cashier')}
        onNavigateToService={() => navigateTo('/customer/service')}
        onNavigateToServiceBookings={() => navigateTo('/customer/service-bookings')}
        onNavigateToMessages={() => navigateTo('/customer/messages')}
        onNavigateToProfile={() => navigateTo('/customer/profile')}
      />,
    )
  }

  if (currentPath === '/customer/service' && currentUser && accessProfile.role === 'customer') {
    return withSecurityModal(
      <CustomerServicePage
        currentUser={currentUser}
        onNavigateHome={() => goToHomeSection('home', 'Home')}
        onSignOut={handleSignOut}
        onNavigateToShowroom={() => navigateTo('/customer')}
        onNavigateToService={() => navigateTo('/customer/service')}
        onNavigateToMessages={() => navigateTo('/customer/messages')}
        onNavigateToProfile={() => navigateTo('/customer/profile')}
        onNavigateToServiceBookings={() => navigateTo('/customer/service-bookings')}
        onNavigateBack={() => navigateTo('/customer')}
      />, 
    )
  }

  // Customer Messages Page Route
  if (currentPath === '/customer/messages' && currentUser && accessProfile.role === 'customer') {
    return withSecurityModal(
      <CustomerMessagesPage
        currentUser={currentUser}
        isDarkMode={true}
        onNavigateToShowroom={() => navigateTo('/customer')}
        onNavigateToService={() => navigateTo('/customer/service')}
        onNavigateToMessages={() => navigateTo('/customer/messages')}
        onNavigateToProfile={() => navigateTo('/customer/profile')}
        onNavigateToServiceBookings={() => navigateTo('/customer/service-bookings')}
        onSignOut={handleSignOut}
      />, 
    )
  }

  // Customer Service Bookings Page Route
  if (currentPath === '/customer/service-bookings' && currentUser && accessProfile.role === 'customer') {
    return withSecurityModal(
      <CustomerServiceBookingsPage
        currentUser={currentUser}
        isDarkMode={true}
        onNavigateToShowroom={() => navigateTo('/customer')}
        onNavigateToService={() => navigateTo('/customer/service')}
        onNavigateToMessages={() => navigateTo('/customer/messages')}
        onNavigateToProfile={() => navigateTo('/customer/profile')}
        onNavigateToServiceBookings={() => navigateTo('/customer/service-bookings')}
        onSignOut={handleSignOut}
      />, 
    )
  }


  // Product Details Page Route
  const productDetailMatch = currentPath.match(/^\/customer\/product\/(.+)$/)
  if (productDetailMatch && currentUser && accessProfile.role === 'customer') {
    const productId = productDetailMatch[1]
    const handleNavigateBack = () => {
      setCurrentPath('/customer')
    }
    return withSecurityModal(
      <ProductDetailsPage
        productId={productId}
        currentUser={currentUser}
        onSignOut={handleSignOut}
        onNavigateBack={handleNavigateBack}
      />,
    )
  }

  // Customer Profile Page Route
  if (currentPath === '/customer/profile' && currentUser && accessProfile.role === 'customer') {
    return withSecurityModal(
      <CustomerProfilePage
        currentUser={currentUser}
        onNavigateBack={() => navigateTo('/customer')}
        onNavigateToShowroom={() => navigateTo('/customer')}
        onNavigateToService={() => navigateTo('/customer/service')}
        onNavigateToMessages={() => navigateTo('/customer/messages')}
        onNavigateToProfile={() => navigateTo('/customer/profile')}
        onNavigateToServiceBookings={() => navigateTo('/customer/service-bookings')}
        onSignOut={handleSignOut}
      />, 
    )
  }

  if (shouldShowAccessLoader) {
    return (
      <GlobalLoadingScreen
        role={requiredDashboardRole ? roleLabels[requiredDashboardRole] : 'Dashboard'}
        delay={300}
        autoComplete={false}
      />
    )
  }

  if (dashboardRequirements[currentDashboardBasePath] && currentUser && canViewCurrentDashboard && !isAccessResolving) {
    return withSecurityModal(
      <SuperAdminPage
        onNavigateHome={() => goToHomeSection('home', 'Home')}
        onSignOut={handleSignOut}
        currentUser={currentUser}
        accessProfile={accessProfile}
        dashboardPath={currentDashboardBasePath}
        currentPath={currentPath}
        initialSection="dashboard"
        onNavigateDashboardPath={(nextPath) => navigateTo(nextPath)}
      />,
    )
  }

  return withSecurityModal(
    <HeroSection
      isPageLoading={isPageLoading}
      activeNav={activeNav}
      activeSlide={activeSlide}
      currentUser={currentUser}
      customerName={customerName}
      onSelectSlide={setActiveSlide}
      onOpenAuthSection={openAuthSection}
      onNavigateShowroom={() => navigateTo('/showroom')}
      onNavigateSpareParts={() => navigateTo('/spare-parts')}
      onNavigateLogin={() => navigateTo('/login')}
      onNavigateSection={goToHomeSection}
      onSignOut={handleSignOut}
    />,
  )
}

function AppWithToast() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <App />
        <ToastNotification />
      </ToastProvider>
    </ThemeProvider>
  )
}

export default AppWithToast
