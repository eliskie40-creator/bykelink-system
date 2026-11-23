import { useState, useEffect, useMemo } from 'react'
import { collection, onSnapshot, query, doc, getDoc } from 'firebase/firestore'
import FavoriteBorderRoundedIcon from '@mui/icons-material/FavoriteBorderRounded'
import FavoriteRoundedIcon from '@mui/icons-material/FavoriteRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import TuneRoundedIcon from '@mui/icons-material/TuneRounded'
import { db } from '../../firebase'
import NavHeaderCustomer from './components/NavHeaderCustomer'
import ChatBox from '../../components/ChatBox'

const formatPrice = (value) => {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0)
}

export default function CustomerShowroomPage({ currentUser, onSignOut, onNavigateToProduct, onNavigateToService, onNavigateToMessages, onNavigateToProfile, onNavigateToServiceBookings, onNavigateBack }) {
  const [isDarkMode, setIsDarkMode] = useState(true)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [unreadNotifications] = useState([
    { id: 1, title: 'New Inventory', message: 'Yamaha YZF-R1M now in stock', timestamp: 'Just now', read: false },
  ])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedType, setSelectedType] = useState('all')
  const [selectedEngine, setSelectedEngine] = useState('all')
  const [inStockOnly, setInStockOnly] = useState(false)
  const [inventory, setInventory] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [favorites, setFavorites] = useState(new Set())
  const [hasPermissionError, setHasPermissionError] = useState(false)
  const [userAvatar, setUserAvatar] = useState(null)

  // Fetch user avatar from Firestore
  useEffect(() => {
    if (!currentUser?.uid) return

    const fetchUserAvatar = async () => {
      try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid))
        if (userDoc.exists() && userDoc.data()?.avatar) {
          setUserAvatar(userDoc.data().avatar)
        }
      } catch (error) {
        console.error('Error fetching user avatar:', error)
      }
    }

    fetchUserAvatar()
  }, [currentUser?.uid])

  // Fetch inventory from Firestore
  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, 'inventory')),
      (snapshot) => {
        const items = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((item) => item.showInShowroom !== false && item.publishedToShowroom !== false)
          .filter((item) => item.category !== 'Spare Parts' && item.itemType !== 'Spare Parts')

        setInventory(items)
        setIsLoading(false)
        setHasPermissionError(false)
      },
      (error) => {
        console.error('Unable to load inventory:', error)
        // If permission error, show a message but don't crash
        if (error.code === 'permission-denied') {
          setHasPermissionError(true)
        }
        setInventory([])
        setIsLoading(false)
      },
    )

    return unsubscribe
  }, [])

  const motorcycleTypes = ['all', 'Scooters', 'Sports', 'Underbikes', 'Off-Road']
  const engineDisplacements = ['all', '100cc', '150cc', '250cc', '450cc', '600cc+']

  const filteredAndSorted = useMemo(() => {
    let results = inventory

    // Category filter
    if (selectedCategory !== 'all') {
      results = results.filter((item) => item.category === selectedCategory)
    }

    // Type filter (using category as proxy)
    if (selectedType !== 'all') {
      results = results.filter((item) => {
        const itemType = item.itemType || item.type || item.category || ''
        return itemType.toLowerCase().includes(selectedType.toLowerCase())
      })
    }

    // Engine filter (search in model name/description)
    if (selectedEngine !== 'all') {
      results = results.filter((item) => {
        const modelStr = `${item.name || ''} ${item.model || ''} ${item.description || ''}`.toLowerCase()
        return modelStr.includes(selectedEngine.toLowerCase())
      })
    }

    // In stock filter
    if (inStockOnly) {
      results = results.filter((item) => (item.stock || 0) > 0)
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      results = results.filter(
        (item) =>
          item.name?.toLowerCase().includes(q) ||
          item.category?.toLowerCase().includes(q) ||
          item.description?.toLowerCase().includes(q),
      )
    }

    // Sorting (default: newest)
    results.sort((a, b) => {
      return (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
    })

    return results
  }, [inventory, selectedCategory, selectedType, selectedEngine, inStockOnly, searchQuery])

  const toggleFavorite = (itemId) => {
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) {
        next.delete(itemId)
      } else {
        next.add(itemId)
      }
      return next
    })
  }

  const handleViewDetails = (item) => {
    if (onNavigateToProduct) {
      onNavigateToProduct(item.id)
    }
  }

  const handleResetFilters = () => {
    setSearchQuery('')
    setSelectedCategory('all')
    setSelectedType('all')
    setSelectedEngine('all')
    setInStockOnly(false)
  }

  const visibleInventory = useMemo(() => filteredAndSorted.slice(0, 9), [filteredAndSorted])

  // Extract colors from item (assuming stored as array or comma-separated)
  const getColors = (item) => {
    let colorArray = []
    if (Array.isArray(item.colors)) {
      colorArray = item.colors.filter(c => c && typeof c === 'string').map(c => c.trim())
    } else if (Array.isArray(item.colorVariants)) {
      colorArray = item.colorVariants
        .map(c => (typeof c === 'string' ? c : c?.name || c?.color || String(c)))
        .filter(c => c && typeof c === 'string')
        .map(c => c.trim())
    } else if (typeof item.colors === 'string') {
      colorArray = item.colors.split(',').filter(c => c).map(c => c.trim())
    }
    return colorArray.slice(0, 3)
  }

  // Map color names to hex values
  const getColorHex = (colorName) => {
    if (!colorName || typeof colorName !== 'string') return '#808080'
    const lower = colorName.toLowerCase().trim()
    
    // Check for specific motorcycle color names first
    if (lower.includes('velocity') || lower.includes('red')) return '#e10100'
    if (lower.includes('sunset') || lower.includes('orange')) return '#ff6b35'
    if (lower.includes('pearl') || lower.includes('white')) return '#f5f5f5'
    if (lower.includes('signature') || lower.includes('black')) return '#1a1a1a'
    if (lower.includes('blue')) return '#0066cc'
    if (lower.includes('yellow') || lower.includes('gold')) return '#ffd700'
    if (lower.includes('silver') || lower.includes('grey') || lower.includes('gray')) return '#a0a0a0'
    if (lower.includes('cyan') || lower.includes('aqua')) return '#00d4ff'
    if (lower.includes('purple') || lower.includes('violet')) return '#8b00ff'
    if (lower.includes('green')) return '#00b74a'
    if (lower.includes('brown') || lower.includes('bronze')) return '#8b4513'
    
    // Default to gray if no match
    return '#808080'
  }

  const getStockStatus = (item) => {
    const rawStatus = String(item?.stockStatus || item?.status || item?.availability || '')
      .trim()
      .toLowerCase()

    if (item?.isAvailable === false || item?.available === false || rawStatus === 'not available' || rawStatus === 'unavailable') {
      return 'Not Available'
    }

    const stockValue = Number(item?.stock ?? item?.availableStock ?? item?.inventoryCount ?? 0)

    if (stockValue <= 0 || rawStatus === 'out of stock') {
      return 'Out of Stock'
    }

    if (stockValue <= 5 || rawStatus === 'low stock') {
      return 'Low Stock'
    }

    if (rawStatus === 'available' || stockValue > 0) {
      return 'Available'
    }

    return 'Not Available'
  }

  const getStatusStyle = (status) => {
    switch (status) {
      case 'Available':
        return 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35'
      case 'Low Stock':
        return 'bg-amber-500/15 text-amber-300 border border-amber-500/35'
      case 'Out of Stock':
        return 'bg-red-500/15 text-red-300 border border-red-500/35'
      case 'Not Available':
      default:
        return 'bg-slate-700/60 text-slate-300 border border-slate-600'
    }
  }

  return (
    <div className={`min-h-screen overflow-x-hidden ${isDarkMode ? 'bg-linear-to-b from-slate-950 via-slate-900 to-slate-950 text-[#e5e2e1]' : 'bg-white text-slate-900'} font-['Manrope']`}>
      <NavHeaderCustomer
        currentUser={currentUser}
        isDarkMode={isDarkMode}
        activePage="showroom"
        unreadNotifications={unreadNotifications}
        onNavigateToShowroom={onNavigateBack}
        onNavigateToService={onNavigateToService}
        onNavigateToMessages={onNavigateToMessages}
        onNavigateToProfile={onNavigateToProfile}
        onNavigateToServiceBookings={onNavigateToServiceBookings}
        onSignOut={onSignOut}
        userAvatar={userAvatar}
      />

      <main>
        <section className="relative">
          <div className="h-80 sm:h-96 bg-[#111316]">
            <img
              alt="Yamaha Motorcycle"
              className="h-full w-full object-cover opacity-40"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuDOYh1VE8GHnBGKvUvSZok4TgFf2UfOuQCaQZ1zDAYQLB-CkhLmw1mQ4zqEPTDQEUeQuoTFexJfBfonEo4ur4Hg8cBLp_o5Q5kCBDopOu9q1bSc3ZFFcwmdiqVz11uDgBIGg0xGPC2u-cL_cF9Md1LCiEpRfDeP6G4GS1k4R2zG6wcOb9rVXOVdNuu5KLvwh3YXr0SERtwaLZyAxXX3SMLIzgCWI_yCfGdz056mrFGBy7kXZmqVlY3XxcybIssMFPmGCwon5xXy0J8"
            />
          </div>
          <div className="absolute inset-0 bg-linear-to-r from-black/80 via-black/50 to-black/10" />

          <div className="absolute inset-0 mx-auto flex w-full max-w-7xl items-end px-4 pb-8 sm:px-6 lg:px-8 lg:pb-12">
            <div className="max-w-2xl text-white">
              <p className="mb-3 inline-flex bg-red-600 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-white rounded-sm">
                Featured Collection
              </p>
              <h1 className="text-4xl font-black uppercase leading-[0.95] tracking-tight sm:text-6xl">
                Find Your
                <br />
                Perfect Ride
              </h1>
              <p className="mt-4 max-w-md text-sm text-slate-300 sm:text-base">
                Explore premium Yamaha motorcycles engineered for performance and precision.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Filter Sidebar */}
            <aside className="lg:col-span-3 space-y-6">
              <div className="space-y-4 border border-slate-800 bg-slate-900/60 p-5 backdrop-blur-sm rounded-lg">
                <div className="flex items-center gap-2">
                  <TuneRoundedIcon sx={{ fontSize: 18 }} className="text-red-600" />
                  <h3 className="text-[11px] font-black uppercase tracking-[0.24em] text-red-600">Filters</h3>
                </div>

                {/* Search */}
                <div className="space-y-2 border-t border-slate-800 pt-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Search</p>
                  <div className="relative">
                    <SearchRoundedIcon className="pointer-events-none absolute left-3 top-2.5 text-slate-500" sx={{ fontSize: 18 }} />
                    <input
                      type="text"
                      placeholder="Model or category"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full border border-slate-700 bg-slate-800/50 py-2 pl-9 pr-3 text-sm text-slate-200 placeholder-slate-500 outline-none transition focus:border-red-600/50 rounded-sm"
                    />
                  </div>
                </div>

                {/* Motorcycle Type */}
                <div className="space-y-2 border-t border-slate-800 pt-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Motorcycle Type</p>
                  <div className="space-y-1.5">
                    {motorcycleTypes.map((type) => (
                      <label key={type} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={
                            selectedType === 'all' 
                              ? type === 'all' 
                              : type === selectedType
                          }
                          onChange={() => setSelectedType(type === selectedType && type !== 'all' ? 'all' : type)}
                          className="h-4 w-4 accent-red-600 border-slate-600 bg-slate-700 rounded cursor-pointer"
                        />
                        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300">
                          {type === 'all' ? 'All Types' : type}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Engine Displacement */}
                <div className="space-y-2 border-t border-slate-800 pt-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Engine Displacement</p>
                  <div className="space-y-1.5">
                    {engineDisplacements.map((engine) => (
                      <label key={engine} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={
                            selectedEngine === 'all'
                              ? engine === 'all'
                              : engine === selectedEngine
                          }
                          onChange={() => setSelectedEngine(engine === selectedEngine && engine !== 'all' ? 'all' : engine)}
                          className="h-4 w-4 accent-red-600 border-slate-600 bg-slate-700 rounded cursor-pointer"
                        />
                        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300">
                          {engine === 'all' ? 'All Engines' : engine}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Availability */}
                <div className="space-y-2 border-t border-slate-800 pt-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Availability</p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={inStockOnly}
                      onChange={(e) => setInStockOnly(e.target.checked)}
                      className="h-4 w-4 accent-red-600 border-slate-600 bg-slate-700 rounded cursor-pointer"
                    />
                    <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-300">In Stock Only</span>
                  </label>
                </div>

                {/* Reset Button */}
                <button
                  onClick={handleResetFilters}
                  className="w-full border border-slate-700 bg-slate-800/40 px-4 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300 transition hover:bg-slate-800 hover:text-white rounded-sm"
                >
                  Reset All Filters
                </button>

                {/* Find Your Match CTA */}
                <div className="border border-red-600/50 bg-red-600/10 p-6 rounded-lg backdrop-blur-sm">
                  <div className="space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-600">Need Help?</p>
                    <h3 className="text-2xl font-black uppercase text-white leading-tight">Find Your Match</h3>
                    <p className="text-sm text-slate-300">Our experts are ready to help you choose the right ride.</p>
                    <button onClick={onNavigateToMessages} className="w-full bg-red-600 hover:bg-red-700 text-white py-3 px-4 text-[11px] font-black uppercase tracking-[0.18em] transition rounded-sm">
                      Chat With Us
                    </button>
                  </div>
                </div>
              </div>
            </aside>

            {/* Main Content */}
            <div className="lg:col-span-9 space-y-6">
              <div className="flex flex-col gap-2 border-b border-slate-800 pb-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-600">Featured Models</p>
                  <h2 className="text-3xl font-black uppercase tracking-tight text-white">Showroom Lineup</h2>
                </div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">
                  {filteredAndSorted.length} model{filteredAndSorted.length !== 1 ? 's' : ''} available
                </p>
              </div>

              {isLoading ? (
                <div className="grid min-h-72 place-items-center border border-slate-800 bg-slate-900/40 rounded-lg">
                  <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">Loading inventory...</p>
                </div>
              ) : hasPermissionError ? (
                <div className="border border-slate-800 bg-slate-900/40 p-8 text-center rounded-lg">
                  <p className="text-base font-bold uppercase tracking-[0.14em] text-slate-300">Inventory temporarily unavailable</p>
                  <p className="mt-2 text-sm text-slate-400">Please refresh the page or contact support.</p>
                </div>
              ) : visibleInventory.length === 0 ? (
                <div className="border border-slate-800 bg-slate-900/40 p-8 text-center rounded-lg">
                  <p className="text-base font-bold uppercase tracking-[0.14em] text-slate-300">No motorcycles found</p>
                  <p className="mt-2 text-sm text-slate-400">Try adjusting your filters or search terms.</p>
                </div>
              ) : (
                <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                  {visibleInventory.map((item) => (
                    <article
                      key={item.id}
                      className="group border border-slate-800 bg-slate-900/50 backdrop-blur-sm rounded-lg overflow-hidden transition hover:border-slate-700 hover:shadow-xl hover:shadow-black/50"
                    >
                      {/* Image */}
                      <div className="relative h-48 overflow-hidden bg-slate-800">
                        <img
                          src={Array.isArray(item.gallery) && item.gallery[0] ? item.gallery[0] : item.imageUrl}
                          alt={item.name}
                          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                        />
                        <span className={`absolute left-3 top-3 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] rounded-sm ${getStatusStyle(getStockStatus(item))}`}>
                          {getStockStatus(item)}
                        </span>
                        <button
                          onClick={() => toggleFavorite(item.id)}
                          className="absolute right-3 top-3 bg-slate-900/80 backdrop-blur p-2 text-slate-300 transition hover:text-red-600 rounded-sm"
                          aria-label={`Toggle favorite for ${item.name || 'item'}`}
                        >
                          {favorites.has(item.id) ? (
                            <FavoriteRoundedIcon sx={{ fontSize: 18 }} className="text-red-600" />
                          ) : (
                            <FavoriteBorderRoundedIcon sx={{ fontSize: 18 }} />
                          )}
                        </button>
                      </div>

                      {/* Content */}
                      <div className="space-y-3 p-4">
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">
                          {item.category || 'Motorcycle Units'}
                        </p>
                        <h3 className="min-h-10 text-base font-black uppercase leading-tight text-white">
                          {item.name || 'Yamaha Motorcycle'}
                        </h3>
                        <p className="line-clamp-2 min-h-9 text-xs text-slate-400">
                          {item.description || 'Purpose-built performance and road-ready reliability.'}
                        </p>

                        {/* Color Variants with Stock */}
                        {/* Colors */}  
                        {getColors(item).length > 0 && !Array.isArray(item.colorVariants) && (
                          <div className="space-y-1 border-t border-slate-800 pt-3">
                            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-500">Available Colors</p>
                            <div className="flex gap-2 flex-wrap">
                              {getColors(item).map((color, idx) => (
                                <div
                                  key={idx}
                                  className="flex items-center gap-1.5"
                                >
                                  <div
                                    className="h-3 w-3 rounded-sm border border-slate-600 shadow-sm"
                                    style={{
                                      backgroundColor: getColorHex(color)
                                    }}
                                    title={color}
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* View Details Button */}
                        <button
                          onClick={() => handleViewDetails(item)}
                          className="w-full bg-gray-600 hover:bg-gray-700 text-white py-2 text-[10px] font-black uppercase tracking-[0.18em] transition rounded-sm"
                        >
                          View Details
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>
        </section>
      </main>

      {/* Chat Box */}
      {isChatOpen && <ChatBox currentUser={currentUser} onClose={() => setIsChatOpen(false)} />}

      {/* Footer */}
      <footer className="border-t border-slate-800 mt-16 bg-slate-950/60 backdrop-blur-sm py-10">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 sm:px-6 md:grid-cols-3 lg:px-8">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-red-600">BYKELINK</p>
            <p className="mt-3 max-w-xs text-sm text-slate-400 leading-relaxed">
              Premium Yamaha motorcycles for Filipino riders with dedicated showroom and service support.
            </p>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Information</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-400">
              <li><a className="hover:text-red-600 transition">Showroom</a></li>
              <li><a className="hover:text-red-600 transition">Service</a></li>
              <li><a className="hover:text-red-600 transition">Support</a></li>
            </ul>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Contact</p>
            <p className="mt-3 text-sm text-slate-400">{currentUser?.displayName || currentUser?.email?.split('@')[0]}</p>
            <p className="text-sm text-slate-400">{currentUser?.email}</p>
            <p className="mt-3 text-sm text-slate-400">+63 2 8888 1234</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
