import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, onSnapshot, query } from 'firebase/firestore'
import ArrowForwardRoundedIcon from '@mui/icons-material/ArrowForwardRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import StorefrontRoundedIcon from '@mui/icons-material/StorefrontRounded'
import bykelinkLogo from '../../assets/bykelinklogo.png'
import { db } from '../../firebase'
import ChatBox from '../../components/ChatBox'
import NavHeader from '../../components/NavHeader'

const showroomLinks = [
  { label: 'Home', href: '/#home', id: 'home' },
  { label: 'Showroom', href: '/showroom', id: 'showroom', active: true },
  { label: 'Spare Parts', href: '/spare-parts', id: 'spare-parts' },
  { label: 'About', href: '/#about', id: 'about' },
  { label: 'Contact', href: '/#contact', id: 'contact' },
]

const normalizeText = (value = '') => String(value).trim().toLowerCase()

const mapInventoryToShowroomModel = (item, masterModels = [], masterCategories = []) => {
  const gallery = Array.isArray(item.gallery) && item.gallery.filter(Boolean).length
    ? item.gallery.filter(Boolean)
    : item.imageUrl
      ? [item.imageUrl]
      : [bykelinkLogo]

  const modelMeta =
    masterModels.find((model) => model.id === item.modelId) ||
    masterModels.find((model) => normalizeText(model.name) === normalizeText(item.model || '')) ||
    null

  const categoryMeta =
    masterCategories.find((category) => category.id === modelMeta?.categoryId) ||
    masterCategories.find((category) => normalizeText(category.name) === normalizeText(item.category || '')) ||
    null

  const resolvedCategory = categoryMeta?.name || item.category || 'Motorcycle Units'
  const resolvedType = modelMeta?.name || item.model || item.type || item.itemType || 'Motorcycle'

  return {
    id: item.id,
    name: String(item.name || 'Yamaha Motorcycle'),
    category: resolvedCategory,
    model: item.model || modelMeta?.name || 'Series',
    variant: item.variant || 'Standard',
    type: resolvedType,
    description:
      item.description ||
      'Premium Yamaha motorcycle available from the live showroom inventory.',
    badge: item.badge || resolvedCategory || 'Featured',
    gallery,
    accent: item.status || 'Available Now',
  }
}

export default function ShowroomPage({
  onNavigateHome,
  onNavigateSection,
  onNavigateService,
  onNavigateSpareParts,
  onNavigateLogin,
  onNavigateShowroom,
  currentUser,
}) {
  const [inventoryModels, setInventoryModels] = useState([])
  const [masterCategories, setMasterCategories] = useState([])
  const [masterModels, setMasterModels] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedType, setSelectedType] = useState('all')
  const [featuredItemId, setFeaturedItemId] = useState('')
  const [activeGalleryIndex, setActiveGalleryIndex] = useState(0)

  useEffect(() => {
    const loadMasterData = async () => {
      try {
        const [categoriesSnap, modelsSnap] = await Promise.all([
          getDocs(collection(db, 'masterData', 'inventory', 'categories')),
          getDocs(collection(db, 'masterData', 'inventory', 'models')),
        ])

        setMasterCategories(categoriesSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
        setMasterModels(modelsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })))
      } catch (error) {
        console.warn('Unable to load master data for showroom filters', error)
        setMasterCategories([])
        setMasterModels([])
      }
    }

    loadMasterData()
  }, [])

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, 'inventory')),
      (snapshot) => {
        const nextItems = snapshot.docs
          .map((doc) => ({ id: doc.id, ...doc.data() }))
          .filter((item) => item.category !== 'Spare Parts' && item.showInShowroom !== false && item.publishedToShowroom !== false)
          .map((item) => mapInventoryToShowroomModel(item, masterModels, masterCategories))

        setInventoryModels(nextItems)
        setIsLoading(false)
      },
      (error) => {
        console.error('Unable to load showroom inventory', error)
        setInventoryModels([])
        setIsLoading(false)
      },
    )

    return unsubscribe
  }, [masterCategories, masterModels])

  const categories = useMemo(() => {
    const categoryMap = new Map()

    inventoryModels.forEach((item) => {
      const category = String(item.category || '').trim()
      if (category) {
        const key = normalizeText(category)
        if (!categoryMap.has(key)) {
          categoryMap.set(key, category)
        }
      }
    })

    if (masterCategories.length && categoryMap.size === 0) {
      masterCategories.forEach((category) => categoryMap.set(normalizeText(category.name), category.name))
    }

    return ['all', ...Array.from(categoryMap.values())]
  }, [inventoryModels, masterCategories])

  const types = useMemo(() => {
    const typeMap = new Map()

    inventoryModels.forEach((item) => {
      const type = String(item.type || '').trim()
      if (type) {
        const key = normalizeText(type)
        if (!typeMap.has(key)) {
          typeMap.set(key, type)
        }
      }
    })

    if (masterModels.length && typeMap.size === 0) {
      masterModels.forEach((model) => typeMap.set(normalizeText(model.name), model.name))
    }

    return ['all', ...Array.from(typeMap.values())]
  }, [inventoryModels, masterModels])

  const filteredModels = useMemo(() => {
    let results = inventoryModels
    const query = normalizeText(searchQuery)
    const selectedCategoryKey = normalizeText(selectedCategory)
    const selectedTypeKey = normalizeText(selectedType)

    if (query) {
      results = results.filter((item) => {
        const haystack = [item.name, item.model, item.description, item.category, item.type]
          .join(' ')
          .toLowerCase()

        return haystack.includes(query)
      })
    }

    if (selectedCategoryKey && selectedCategoryKey !== 'all') {
      results = results.filter((item) => normalizeText(item.category) === selectedCategoryKey)
    }

    if (selectedTypeKey && selectedTypeKey !== 'all') {
      results = results.filter((item) => normalizeText(item.type) === selectedTypeKey)
    }

    return results
  }, [inventoryModels, searchQuery, selectedCategory, selectedType])

  const clearFilters = () => {
    setSearchQuery('')
    setSelectedCategory('all')
    setSelectedType('all')
  }

  const featuredItem = useMemo(
    () => filteredModels.find((item) => item.id === featuredItemId) ?? filteredModels[0] ?? null,
    [featuredItemId, filteredModels],
  )

  const featuredGallery = useMemo(() => {
    const gallery = featuredItem?.gallery?.length ? featuredItem.gallery : [bykelinkLogo]
    return Array.from({ length: 4 }, (_, index) => gallery[index] || gallery[0])
  }, [featuredItem])

  useEffect(() => {
    if (!filteredModels.length) {
      setFeaturedItemId('')
      setActiveGalleryIndex(0)
      return
    }

    if (!featuredItemId || !filteredModels.some((item) => item.id === featuredItemId)) {
      setFeaturedItemId(filteredModels[0].id)
    }
  }, [filteredModels, featuredItemId])

  useEffect(() => {
    if (featuredItem) {
      setActiveGalleryIndex(0)
    }
  }, [featuredItem?.id])

  const handleNavClick = (link) => {
    if (link.id === 'home') {
      onNavigateHome()
      return
    }

    if (link.id === 'showroom') {
      onNavigateShowroom()
      return
    }

    if (link.id === 'spare-parts') {
      onNavigateSpareParts()
      return
    }

    if (link.id === 'service') {
      onNavigateService?.()
      return
    }

    onNavigateSection(link.id, link.label)
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-linear-to-b from-slate-950 via-slate-900 to-slate-950 text-white font-['Manrope']">
      <NavHeader
        currentUser={currentUser}
        customerName={currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Rider'}
        activeNav="Showroom"
        navLinks={showroomLinks}
        onLogoClick={onNavigateHome}
        onNavigateClick={handleNavClick}
        onUserMenuClick={() => onNavigateLogin?.()}
        onSignOut={() => {}}
        onAuthClick={onNavigateLogin}
      />

      <main className="pt-24 pb-20">
        <section className="relative flex min-h-96 items-center overflow-hidden bg-linear-to-r from-red-980 via-red-800 to-slate-600">
          <div className="absolute inset-0 opacity-30">
            <img
              alt="Yamaha motorcycle showroom"
              className="h-full w-full object-cover"
              src={inventoryModels[0]?.gallery?.[0] || 'https://images.unsplash.com/photo-1558981808-9d7f3d7cf35f?auto=format&fit=crop&w=1600&q=80'}
            />
          </div>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative z-10 mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl">
              <p className="mb-2 text-sm font-bold uppercase tracking-widest text-red-200">Yamaha Showroom</p>
              <h1 className="mb-4 text-4xl font-black leading-tight text-white sm:text-5xl lg:text-6xl">
                Find Your Next <span className="bg-linear-to-r from-yellow-300 to-white bg-clip-text text-transparent">Perfect Ride</span>
              </h1>
              <p className="max-w-2xl text-base text-white/90 sm:text-lg">
                Discover the latest Yamaha motorcycles, compare standout models, and explore the lineup through the same polished showroom experience as our customer dashboard.
              </p>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-screen-2xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-4 shadow-2xl shadow-slate-950/40 backdrop-blur-sm sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex-1">
                <div className="relative">
                  <SearchRoundedIcon className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" sx={{ fontSize: 18 }} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search motorcycles or variants"
                    className="w-full rounded-full border border-white/10 bg-slate-950/80 py-3 pl-12 pr-4 text-sm text-white placeholder:text-slate-500 outline-none transition focus:border-red-500"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <select
                  value={selectedCategory}
                  onChange={(event) => setSelectedCategory(event.target.value)}
                  className="rounded-full border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none focus:border-red-500"
                >
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category === 'all' ? 'All Categories' : category}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedType}
                  onChange={(event) => setSelectedType(event.target.value)}
                  className="rounded-full border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white outline-none focus:border-red-500"
                >
                  {types.map((type) => (
                    <option key={type} value={type}>
                      {type === 'all' ? 'All Types' : type}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-full border border-white/10 bg-slate-950/80 px-4 py-3 text-xs font-black uppercase tracking-[0.18em] text-slate-300 transition hover:border-red-500 hover:text-white"
                >
                  Reset
                </button>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-screen-2xl px-4 pb-12 sm:px-6 lg:px-8">
          {isLoading ? (
            <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-12 text-center text-slate-300">
              Loading showroom inventory...
            </div>
          ) : filteredModels.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/15 bg-slate-900/60 p-12 text-center text-slate-300">
              No motorcycles match your current search and filters.
            </div>
          ) : (
            <>
              {featuredItem && (
                <div className="mb-10 overflow-hidden rounded-[2rem] border border-white/10 bg-slate-900/80 p-4 shadow-2xl shadow-slate-950/30 sm:p-5 lg:p-6">
                  <div className="grid gap-6 lg:grid-cols-[1.5fr_0.9fr] lg:items-start">
                    <div className="space-y-4">
                      <div className="relative overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-950">
                        <img
                          src={featuredItem.gallery[activeGalleryIndex] || featuredItem.gallery[0] || bykelinkLogo}
                          alt={featuredItem.name}
                          className="h-[420px] w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-linear-to-t from-slate-950 via-slate-950/10 to-transparent" />
                        <span className="absolute left-5 top-5 rounded-full border border-white/15 bg-slate-950/70 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-white">
                          {featuredItem.badge}
                        </span>
                      </div>

                      <div className="grid grid-cols-4 gap-3">
                        {featuredGallery.map((image, index) => (
                          <button
                            key={`${featuredItem.id}-${index}`}
                            type="button"
                            onClick={() => setActiveGalleryIndex(index)}
                            className={`overflow-hidden rounded-2xl border transition ${
                              activeGalleryIndex === index
                                ? 'border-red-500 ring-2 ring-red-500/40'
                                : 'border-white/10 hover:border-red-500/50'
                            }`}
                          >
                            <img
                              src={image || bykelinkLogo}
                              alt={`${featuredItem.name} gallery ${index + 1}`}
                              className="h-20 w-full object-cover"
                            />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-col justify-between gap-5 pt-2">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-red-500">{featuredItem.model}</p>
                        <h3 className="mt-3 text-4xl font-black text-white sm:text-5xl">{featuredItem.name}</h3>
                        <p className="mt-4 text-base leading-7 text-slate-300">{featuredItem.description}</p>
                      </div>

                      <button
                        type="button"
                        onClick={onNavigateLogin}
                        className="inline-flex w-full items-center justify-between gap-3 rounded-2xl border border-red-500/50 bg-red-600/10 px-5 py-4 text-left text-[11px] font-black uppercase tracking-[0.18em] text-red-200 transition hover:bg-red-600 hover:text-white"
                      >
                        <span>Sign In to Inquire</span>
                        <ArrowForwardRoundedIcon sx={{ fontSize: 18 }} />
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
                {filteredModels.map((item) => (
                  <article
                    key={item.id}
                    onClick={() => {
                      setFeaturedItemId(item.id)
                      setActiveGalleryIndex(0)
                    }}
                    className="group cursor-pointer overflow-hidden rounded-3xl border border-white/10 bg-slate-900/80 shadow-2xl shadow-slate-950/30 transition duration-300 hover:-translate-y-1 hover:border-red-600/60"
                  >
                    <div className="relative h-60 overflow-hidden">
                      <img
                        src={item.gallery[0] || bykelinkLogo}
                        alt={item.name}
                        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-linear-to-t from-slate-950 via-slate-950/15 to-transparent" />
                      <span className="absolute left-4 top-4 rounded-full border border-white/15 bg-slate-950/70 px-3 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-white">
                        {item.badge}
                      </span>
                    </div>

                    <div className="space-y-4 p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500">{item.model}</p>
                          <h3 className="mt-2 text-2xl font-black text-white">{item.name}</h3>
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      </main>

      <ChatBox currentUser={currentUser} />
    </div>
  )
}
