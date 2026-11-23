import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import MenuRoundedIcon from '@mui/icons-material/MenuRounded'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import FavoriteBorderRoundedIcon from '@mui/icons-material/FavoriteBorderRounded'
import FavoriteRoundedIcon from '@mui/icons-material/FavoriteRounded'
import ArrowBackRoundedIcon from '@mui/icons-material/ArrowBackRounded'
import { auth, db } from '../../firebase'
import ChatBox from '../../components/ChatBox'

const formatPrice = (value) => {
  const amount = Number(value || 0)
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0)
}

export default function ProductDetailsPage({ productId, onSignOut, onNavigateBack }) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [product, setProduct] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [favorites, setFavorites] = useState(new Set())

  useEffect(() => {
    if (!productId) {
      return
    }

    const docRef = doc(db, 'inventory', productId)
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        setProduct({ id: docSnap.id, ...docSnap.data() })
      } else {
        setProduct(null)
      }
      setIsLoading(false)
    }, (error) => {
      console.error('Error loading product:', error)
      setIsLoading(false)
    })

    return unsubscribe
  }, [productId])

  const handleLogout = async () => {
    try {
      await signOut(auth)
      if (onSignOut) onSignOut()
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

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
    return colorArray
  }

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Loading product details...</div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
        <div className="text-slate-400 text-lg mb-4">Product not found</div>
        <button
          onClick={onNavigateBack}
          className="flex items-center gap-2 bg-gray-600 hover:bg-gray-700 text-white px-6 py-2 font-bold uppercase text-sm rounded-sm transition"
        >
          <ArrowBackRoundedIcon sx={{ fontSize: 18 }} />
          Back to Showroom
        </button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800/60 bg-slate-950/95 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <button
            onClick={onNavigateBack}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition"
            aria-label="Go back"
          >
            <ArrowBackRoundedIcon sx={{ fontSize: 24 }} />
          </button>
          <div className="text-xl font-black italic tracking-tighter text-red-600">BYKELINK</div>
          <button
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="rounded-sm border border-slate-700 p-2 text-slate-400 transition hover:text-white hover:border-slate-500 lg:hidden"
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <CloseRoundedIcon sx={{ fontSize: 18 }} /> : <MenuRoundedIcon sx={{ fontSize: 18 }} />}
          </button>
        </div>

        {isMenuOpen && (
          <nav className="space-y-2 border-t border-slate-800 px-4 py-3 sm:px-6 lg:hidden">
            <a className="block text-[11px] font-bold uppercase tracking-[0.2em] text-red-600">Details</a>
            <a className="block text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">Service</a>
            <button
              onClick={handleLogout}
              className="mt-2 inline-flex rounded-sm bg-red-600 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-white"
            >
              Logout
            </button>
          </nav>
        )}
      </header>

      <main>
        {/* Hero Section */}
        <section className="relative overflow-hidden bg-inverse-surface pt-0">
          <div className="absolute inset-0 z-0">
            <img
              className="w-full h-full object-cover opacity-50"
              src={Array.isArray(product.gallery) && product.gallery[0] ? product.gallery[0] : product.imageUrl}
              alt={product.name}
            />
          </div>
          <div className="absolute inset-0 z-0 bg-linear-to-r from-black/80 via-black/50 to-black/10" />

          <div className="container mx-auto px-4 relative z-10 flex flex-col md:flex-row items-end justify-between gap-12 py-20 sm:px-6 lg:px-8">
            <div className="max-w-2xl text-white">
              <div className="flex items-center gap-4 mb-4">
                <span className="bg-red-600 text-white px-3 py-1 text-xs font-bold tracking-widest uppercase rounded-sm">
                  {product.category || 'Motorcycle'}
                </span>
                <span className="text-white/80 font-mono text-sm tracking-tighter">ID: {product.id}</span>
              </div>
              <h1 className="text-4xl md:text-6xl font-black italic uppercase tracking-tighter leading-none mb-4">
                {product.name}
              </h1>
              <p className="text-white/70 text-lg max-w-lg mb-8">
                {product.description || 'Premium Yamaha motorcycle designed for performance and reliability.'}
              </p>
            </div>

          </div>
        </section>

        {/* Specs Section */}
        <section className="bg-slate-950 py-20 px-4 sm:px-6 lg:px-8 border-t border-slate-800">
          <div className="container mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
              {/* Technical Specs Section */}
              <div className="md:col-span-2 space-y-12">
                <div>
                  <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-8 flex items-center gap-4">
                    <span className="w-12 h-0.5 bg-slate-400"></span>
                    Technical Specifications
                  </h2>
                  {product.specs && product.specs.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
                      {Object.entries(
                        (product.specs || []).reduce((acc, spec) => {
                          if (!spec.category) return acc;
                          if (!acc[spec.category]) acc[spec.category] = [];
                          acc[spec.category].push(spec);
                          return acc;
                        }, {})
                      ).map(([category, specs]) => (
                        <div key={category}>
                          <h3 className="font-black uppercase text-xs tracking-[0.2em] text-red-600 mb-6">{category}</h3>
                          <div className="space-y-4">
                            {specs.map((spec, idx) => (
                              <div key={idx}>
                                <p className="text-slate-400 uppercase text-xs font-bold mb-1">{spec.label}</p>
                                <p className="text-white font-semibold text-sm">{spec.value}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-slate-800/60 p-6 rounded-lg border border-slate-700 text-center">
                      <p className="text-slate-300 font-semibold">Specifications coming soon</p>
                      <p className="text-sm text-slate-500 mt-2">Contact our sales team for detailed technical information</p>
                    </div>
                  )}
                </div>

              </div>

              {/* Side Features */}
              <div className="space-y-8">
                <div className="bg-slate-900 text-white p-8 rounded-lg">
                  <h3 className="text-xl font-black uppercase italic mb-6">Standard Equipment</h3>
                  {product.equipment && product.equipment.length > 0 ? (
                    <ul className="space-y-4">
                      {product.equipment.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <span className="text-slate-400 font-black text-xl">→</span>
                          <div>
                            <span className="block font-bold text-sm uppercase">{item}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="text-center">
                      <p className="text-slate-300 font-semibold">No equipment details available</p>
                      <p className="text-xs text-slate-500 mt-2">Contact our sales team for more information</p>
                    </div>
                  )}
                </div>

                <div className="bg-[#e10100] p-1 rounded-lg relative">
                  <div className="bg-slate-900 p-6 rounded-md">
                    <h3 className="font-black uppercase text-sm mb-2 text-white">Showroom Inquiry</h3>
                    <p className="text-xs text-slate-300 mb-4">Visit our branch or connect with our team for unit availability and showroom assistance.</p>
                    <button onClick={onNavigateBack} className="w-full bg-[#e10100] hover:bg-[#b20100] text-white py-3 font-bold uppercase text-xs tracking-widest transition-all">
                      Back to Showroom
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Gallery Section */}
        {Array.isArray(product.gallery) && product.gallery.length > 0 && (
          <section className="pb-20 px-4 sm:px-6 lg:px-8 bg-slate-900 overflow-hidden">
            <div className="container mx-auto">
              <h2 className="text-3xl font-black uppercase italic tracking-tighter mb-8 text-white flex items-center gap-4">
                <span className="w-12 h-0.5 bg-slate-600"></span>
                Gallery
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {product.gallery.map((img, idx) => (
                  <div key={idx} className="relative group bg-slate-800 h-80 overflow-hidden rounded-lg shadow-lg">
                    <img src={img} alt={`${product.name} ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-110 transition duration-500" />
                    <div className="absolute inset-0 bg-linear-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition duration-300 flex items-end p-4">
                      <p className="text-white font-bold text-sm">View</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* CTA Section */}
        <section className="bg-[#e10100] text-white py-20 px-4 sm:px-6 lg:px-8">
          <div className="container mx-auto max-w-2xl text-center">
            <h2 className="text-4xl md:text-5xl font-black italic uppercase tracking-tighter mb-6">Ready to ride?</h2>
            <p className="text-lg mb-8">Connect with our sales experts to inquire about unit availability and schedule a visit.</p>
            <button onClick={onNavigateBack} className="bg-white text-[#e10100] px-8 py-4 font-bold uppercase tracking-widest hover:bg-slate-100 transition-all transform active:scale-90">
              Explore Showroom
            </button>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-950/60 backdrop-blur-sm py-10 px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-red-600">BYKELINK</p>
              <p className="mt-3 max-w-xs text-sm text-slate-400">Premium Yamaha motorcycles with expert service and genuine parts.</p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Quick Links</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-400">
                <li><button onClick={onNavigateBack} className="hover:text-red-600 transition">Showroom</button></li>
                <li><a href="#" className="hover:text-red-600 transition">Service</a></li>
              </ul>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Contact</p>
              <p className="mt-3 text-sm text-slate-400">+63 2 8888 1234</p>
              <p className="text-sm text-slate-400">sales@bykelink.com</p>
            </div>
          </div>
          <div className="mt-8 border-t border-slate-800 pt-8 text-center text-xs text-slate-400">
            © 2024 BYKELINK MOTOR. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  )
}
