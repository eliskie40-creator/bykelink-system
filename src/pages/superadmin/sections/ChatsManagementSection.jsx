import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { collection, getDocs, onSnapshot, query, orderBy, addDoc, serverTimestamp, doc, updateDoc, limit, where } from 'firebase/firestore'
import CloseRoundedIcon from '@mui/icons-material/CloseRounded'
import SendRoundedIcon from '@mui/icons-material/SendRounded'
import SmartToyRoundedIcon from '@mui/icons-material/SmartToyRounded'
import CircleRoundedIcon from '@mui/icons-material/CircleRounded'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import CheckboxOutlinedIcon from '@mui/icons-material/CheckBoxOutlined'
import CheckBoxOutlineBlankIcon from '@mui/icons-material/CheckBoxOutlineBlank'
import DeleteSweepRoundedIcon from '@mui/icons-material/DeleteSweepRounded'
import ArchiveRoundedIcon from '@mui/icons-material/ArchiveRounded'
import EmojiEmotionsRoundedIcon from '@mui/icons-material/EmojiEmotionsRounded'
import UnsubscribeIcon from '@mui/icons-material/Unsubscribe';
import ChatIcon from '@mui/icons-material/Chat'
import { db } from '../../../firebase'
import ConfirmationModal from '../components/ConfirmationModal'
import './ChatsManagementSection.css'

export default function ChatsManagementSection({
  searchTerm = '',
  serviceBookings = [],
  isBookingsLoading = false,
  onUnreadCountChange,
  focusRequest,
  onConversationRead,
  isDarkMode = true,
}) {
  const [conversations, setConversations] = useState([])
  const [selectedConversation, setSelectedConversation] = useState(null)
  const [messages, setMessages] = useState([])
  const [responseText, setResponseText] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState(null)
  const [viewMode, setViewMode] = useState('active')
  const [bookedCustomerError, setBookedCustomerError] = useState('')
  const [startingBookedCustomerId, setStartingBookedCustomerId] = useState(null)
  const [conversationLastMessages, setConversationLastMessages] = useState({})
  const [selectedConversationIds, setSelectedConversationIds] = useState(new Set())
  const [deleteConfirmation, setDeleteConfirmation] = useState(null)
  const [isBulkDeleteMode, setIsBulkDeleteMode] = useState(false)
  const unsubscribersRef = useRef(new Map())
  const messagesEndRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }

  // Load all conversations
  useEffect(() => {
    const conversationsRef = collection(db, 'conversations')
    const q = query(conversationsRef, orderBy('updatedAt', 'desc'))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
       const conversationsList = snapshot.docs.map((doc) => {
  const data = doc.data()
  return {
    id: doc.id,
    ...data,
    // normalize for UI
    displayName: data.senderName || "Unknown User",
    otherUserAvatar: data.senderAvatar || data.otherUserAvatar || null,
    userEmail: data.userEmail || "",
  }
})
        setConversations(conversationsList)
        setSelectedConversation((current) => (
          current ? conversationsList.find((conversation) => conversation.id === current.id) ?? null : null
        ))
        
        // Set up real-time listeners for last message of each conversation
        conversationsList.forEach((conv) => {
          
          // Unsubscribe from previous listener if exists
          if (unsubscribersRef.current.has(conv.id)) {
            unsubscribersRef.current.get(conv.id)()
          }

          const messagesRef = collection(db, `conversations/${conv.id}/messages`)
          const msgQuery = query(messagesRef, orderBy('timestamp', 'desc'), limit(1))
          
          // Use real-time listener instead of one-time fetch
          const msgUnsubscribe = onSnapshot(
            msgQuery,
            (msgSnapshot) => {
              if (msgSnapshot.docs.length > 0) {
                const lastMsg = msgSnapshot.docs[0].data()
                setConversationLastMessages((prev) => ({
                  ...prev,
                  [conv.id]: lastMsg,
                }))
              }
            },
            (error) => console.warn(`Error loading messages for conv ${conv.id}`, error)
          )
          
          unsubscribersRef.current.set(conv.id, msgUnsubscribe)
        })
        
        
        setError(null)
        setIsLoading(false)
      },
      (error) => {
        console.error('Error loading conversations:', error)
        setError(error.message || 'Unable to load conversations. Please check your permissions.')
        setIsLoading(false)
      }
    )
    

    return () => {
      unsubscribe()
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const unsubs = unsubscribersRef.current
      unsubs.forEach((unsub) => unsub())
      unsubs.clear()
    }
  }, [])

  // Load messages for selected conversation
  useEffect(() => {
    if (!selectedConversation) return

    const messagesRef = collection(db, `conversations/${selectedConversation.id}/messages`)
    const q = query(messagesRef, orderBy('timestamp', 'asc'))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const messagesList = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp?.toDate?.() || new Date(),
        }))
        setMessages(messagesList)
        
        // Trigger unread count update in parent when messages change
        if (onUnreadCountChange) {
          onUnreadCountChange()
        }
      },
      (error) => {
        console.error('Error loading messages:', error)
      }
    )

    return () => unsubscribe()
  }, [selectedConversation, onUnreadCountChange])

  // Scroll to bottom when messages change
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToBottom()
    }, 100)
    return () => clearTimeout(timer)
  }, [messages])

  const activeConversationCount = useMemo(
    () => conversations.filter((conv) => conv.status !== 'archived' && conv.status !== 'deleted').length,
    [conversations],
  )

  const archivedConversationCount = useMemo(
    () => conversations.filter((conv) => conv.status === 'archived').length,
    [conversations],
  )

  const bookedCustomers = useMemo(() => {
    const customersById = new Map()

    serviceBookings.forEach((booking) => {
      const customerId = booking.customerId || booking.userId || booking.customer?.id || ''
      const customerEmail = booking.customerEmail || booking.email || booking.customer?.email || ''
      const customerName = booking.customerName ||
        booking.customer?.fullName ||
        (typeof booking.customer === 'string' ? booking.customer : '') ||
        'Customer'
      const key = customerId || customerEmail.trim().toLowerCase() || booking.id
      if (!key) return

      const bookingDate = booking.createdAt?.toDate?.() || new Date(booking.createdAt || 0)
      const customer = customersById.get(key) || {
        id: key,
        customerId,
        name: customerName,
        email: customerEmail,
        bookingCount: 0,
        latestBookingDate: bookingDate,
      }

      customer.bookingCount += 1
      if (bookingDate > customer.latestBookingDate) customer.latestBookingDate = bookingDate
      if (!customer.customerId && customerId) customer.customerId = customerId
      if (!customer.email && customerEmail) customer.email = customerEmail
      if ((!customer.name || customer.name === 'Customer') && customerName !== 'Customer') {
        customer.name = customerName
      }
      customersById.set(key, customer)
    })

    return Array.from(customersById.values()).sort(
      (first, second) => second.latestBookingDate - first.latestBookingDate,
    )
  }, [serviceBookings])

  const filteredBookedCustomers = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()
    if (!search) return bookedCustomers

    return bookedCustomers.filter((customer) =>
      [customer.name, customer.email].some((value) => String(value || '').toLowerCase().includes(search)),
    )
  }, [bookedCustomers, searchTerm])

  // Filter conversations based on search and active/archived mode
  const filteredConversations = useMemo(() => {
    if (viewMode === 'booked') return []

    const baseConversations = conversations.filter((conv) => {
      if (viewMode === 'archived') {
        return conv.status === 'archived'
      }

      return conv.status !== 'archived' && conv.status !== 'deleted'
    })

    if (!searchTerm.trim()) return baseConversations

    const searchLower = searchTerm.toLowerCase()
    return baseConversations.filter(
      (conv) =>
        conv.displayName?.toLowerCase().includes(searchLower) ||
        conv.userEmail?.toLowerCase().includes(searchLower)
    )
  }, [conversations, searchTerm, viewMode])

  const handleOpenBookedCustomerChat = async (customer) => {
    if (!customer.customerId || startingBookedCustomerId) return

    setBookedCustomerError('')
    setStartingBookedCustomerId(customer.id)
    try {
      const existingConversation = conversations.find((conversation) =>
        conversation.status !== 'deleted' &&
        (
          conversation.userId === customer.customerId ||
          conversation.senderId === customer.customerId ||
          conversation.participants?.includes(customer.customerId)
        ),
      )

      if (existingConversation) {
        if (existingConversation.status === 'archived') {
          await updateDoc(doc(db, 'conversations', existingConversation.id), {
            status: 'open',
            updatedAt: serverTimestamp(),
          })
        }

        setViewMode('active')
        setSelectedConversation({
          ...existingConversation,
          status: existingConversation.status === 'archived' ? 'open' : existingConversation.status,
        })
        return
      }

      const now = new Date()
      const conversationData = {
        userId: customer.customerId,
        senderId: customer.customerId,
        userName: customer.name,
        senderName: customer.name,
        displayName: customer.name,
        title: customer.name,
        userEmail: customer.email || '',
        senderAvatar: null,
        otherUserAvatar: null,
        participants: [customer.customerId],
        isGuest: false,
        status: 'open',
        lastMessage: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastMessageTime: serverTimestamp(),
      }
      const conversationRef = await addDoc(collection(db, 'conversations'), conversationData)

      setViewMode('active')
      setSelectedConversation({
        ...conversationData,
        id: conversationRef.id,
        createdAt: now,
        updatedAt: now,
      })
    } catch (conversationError) {
      console.error('Unable to open a conversation for booked customer', conversationError)
      setBookedCustomerError(`Unable to open this customer's conversation. ${conversationError.message}`)
    } finally {
      setStartingBookedCustomerId(null)
    }
  }

  const handleSendResponse = async () => {
    if (!responseText.trim() || !selectedConversation) return

    setIsSending(true)
    try {
      const trimmedResponse = responseText.trim()

      // Add admin response to messages
      await addDoc(collection(db, `conversations/${selectedConversation.id}/messages`), {
        type: 'admin',
        text: trimmedResponse,
        sender: 'admin',
        senderName: 'BYKELINK Admin',
        timestamp: serverTimestamp(),
        read: true,
      })

      // Update conversation updatedAt timestamp
      await updateDoc(doc(db, 'conversations', selectedConversation.id), {
        updatedAt: serverTimestamp(),
        lastMessage: trimmedResponse,
        lastMessageTime: serverTimestamp(),
        status: 'responded',
      })

      setResponseText('')
    } catch (error) {
      console.error('Error sending response:', error)
    } finally {
      setIsSending(false)
    }
  }

  // Mark unread messages as read when admin views a conversation
  const markMessagesAsRead = async (conversationId) => {
    try {
      const messagesRef = collection(db, `conversations/${conversationId}/messages`)
      const unreadQuery = query(messagesRef, where('read', '==', false))
      const unreadSnap = await getDocs(unreadQuery)

      for (const msgDoc of unreadSnap.docs) {
        const messageData = msgDoc.data()
        const isCustomerMessage = messageData.type === 'user' || messageData.sender === 'user' || messageData.senderId || messageData.senderName
        if (!isCustomerMessage || messageData.sender === 'admin' || messageData.type === 'admin') {
          continue
        }

        await updateDoc(msgDoc.ref, { read: true })
      }
    } catch (error) {
      console.error('Error marking messages as read:', error)
    }
  }

  // Mark messages as read when conversation is selected
  useEffect(() => {
    if (selectedConversation) {
      markMessagesAsRead(selectedConversation.id)
      onConversationRead?.(selectedConversation.id)
    }
  }, [onConversationRead, selectedConversation])

  useEffect(() => {
    if (!focusRequest?.conversationId || !conversations.length) {
      return
    }

    const targetConversation = conversations.find((conversation) => conversation.id === focusRequest.conversationId)
    if (!targetConversation) {
      return
    }

    setViewMode(targetConversation.status === 'archived' ? 'archived' : 'active')
    setSelectedConversation(targetConversation)
    setSelectedConversationIds(new Set())
    setIsBulkDeleteMode(false)
  }, [conversations, focusRequest])

  const handleConversationStatusChange = useCallback(async (conversationId, status) => {
    try {
      await updateDoc(doc(db, 'conversations', conversationId), {
        status,
        updatedAt: serverTimestamp(),
      })

      setSelectedConversation((current) => (
        current?.id === conversationId
          ? { ...current, status }
          : current
      ))

      if (status === 'archived') {
        setViewMode('archived')
      }

      if (status === 'open') {
        setViewMode('active')
      }

      if (status === 'deleted' && selectedConversation?.id === conversationId) {
        setSelectedConversation(null)
        setMessages([])
        setViewMode('active')
      }
    } catch (error) {
      console.error(`Error updating conversation status to ${status}:`, error)
    }
  }, [selectedConversation])

  const formatDate = (date) => {
    if (!date) return ''
    const now = new Date()
    const diff = now - date
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)

    if (minutes < 1) return 'Just now'
    if (minutes < 60) return `${minutes}m ago`
    if (hours < 24) return `${hours}h ago`
    if (days < 7) return `${days}d ago`

    return date.toLocaleDateString()
  }

  const formatTime = (date) => {
    if (!date) return ''
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })
  }

  const toggleSelectAll = useCallback(() => {
    if (selectedConversationIds.size === filteredConversations.length) {
      setSelectedConversationIds(new Set())
    } else {
      setSelectedConversationIds(new Set(filteredConversations.map((conv) => conv.id)))
    }
  }, [filteredConversations, selectedConversationIds.size])

  const switchViewMode = useCallback((mode) => {
    setViewMode(mode)
    setSelectedConversationIds(new Set())
    setIsBulkDeleteMode(false)
  }, [])

  const handleDeleteChatClick = useCallback((conversationId, e) => {
    e.stopPropagation()
    setDeleteConfirmation({
      type: 'single',
      conversationId,
      title: 'Delete Conversation',
      message: 'Are you sure you want to delete this conversation? This action cannot be undone.',
    })
  }, [])

  const handleBulkDeleteClick = useCallback(() => {
    setDeleteConfirmation({
      type: 'bulk',
      conversationIds: Array.from(selectedConversationIds),
      title: 'Delete Selected Conversations',
      message: `Are you sure you want to delete ${selectedConversationIds.size} conversation${selectedConversationIds.size !== 1 ? 's' : ''}? This action cannot be undone.`,
    })
  }, [selectedConversationIds])

  const confirmDelete = useCallback(async () => {
    if (!deleteConfirmation) return

    try {
      if (deleteConfirmation.type === 'single' && deleteConfirmation.conversationId) {
        await handleConversationStatusChange(deleteConfirmation.conversationId, 'deleted')
      } else if (deleteConfirmation.type === 'bulk' && deleteConfirmation.conversationIds?.length) {
        for (const conversationId of deleteConfirmation.conversationIds) {
          await updateDoc(doc(db, 'conversations', conversationId), {
            status: 'deleted',
            updatedAt: serverTimestamp(),
          })
        }
        setSelectedConversationIds(new Set())
      }
    } catch (error) {
      console.error('Error deleting conversation:', error)
    }

    setDeleteConfirmation(null)
    setIsBulkDeleteMode(false)
  }, [deleteConfirmation, handleConversationStatusChange])

  return (
    <div className={`chats-management-container ${!isDarkMode ? 'light-mode' : ''}`}>
      {/* Conversations List */}
      <div className="conversations-sidebar">
        <div className="sidebar-header">
          <h3 className="text-lg font-bold text-white">
            {viewMode === 'archived' ? 'Archived Messages' : viewMode === 'booked' ? 'Booked Customers' : 'Active Chats'}
          </h3>
          <p className="mt-1 text-xs text-neutral-400">
            {viewMode === 'booked'
              ? `${filteredBookedCustomers.length} customer${filteredBookedCustomers.length !== 1 ? 's' : ''}`
              : `${filteredConversations.length} conversation${filteredConversations.length !== 1 ? 's' : ''}`}
          </p>
          <div className="active-archived">
            <button
              type="button"
              onClick={() => switchViewMode('active')}
              className="conversation-list-active-btn"
            >
             <ChatIcon sx={{ fontSize: 20 }}/>  {activeConversationCount} Active 
            </button>
            <button
              type="button"
              onClick={() => switchViewMode('archived')}
              className="conversation-list-archive1-btn"
            >
              <ArchiveRoundedIcon sx={{ fontSize: 20 }} />Archived ({archivedConversationCount})
            </button>
            <button
              type="button"
              onClick={() => {
                switchViewMode('booked')
                setBookedCustomerError('')
              }}
              className={`conversation-list-booked-btn ${viewMode === 'booked' ? 'is-selected' : ''}`}
            >
              Booked ({bookedCustomers.length})
            </button>
          </div>

          {viewMode === 'active' && filteredConversations.length > 0 && isBulkDeleteMode && (
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-white/60 transition hover:text-white"
                title={selectedConversationIds.size === filteredConversations.length ? 'Deselect all' : 'Select all'}
              >
                {selectedConversationIds.size === filteredConversations.length ? (
                  <CheckboxOutlinedIcon sx={{ fontSize: 20 }} />
                ) : (
                  <CheckBoxOutlineBlankIcon sx={{ fontSize: 20 }} />
                )}
              </button>
              <span className="text-xs text-white/50">
                {selectedConversationIds.size > 0 ? `${selectedConversationIds.size} selected` : 'Select all conversations'}
              </span>
            </div>
          )}

          {viewMode === 'active' && filteredConversations.length > 0 && selectedConversationIds.size > 0 && (
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handleBulkDeleteClick}
                className="conversation-list-checkbox-delete-btn"
              >
                <DeleteSweepRoundedIcon sx={{ fontSize: 20 }} /> 
                 Delete ({selectedConversationIds.size})
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedConversationIds(new Set())
                  setIsBulkDeleteMode(false)
                }}
                className="conversation-list-checkbox-cancel-btn"
              >
                <UnsubscribeIcon sx={{ fontSize: 20 }} /> Cancel
              </button>
            </div>
          )}

          {viewMode === 'active' && filteredConversations.length > 0 && !isBulkDeleteMode && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => {
                  setIsBulkDeleteMode(true)
                  setSelectedConversationIds(new Set())
                }}
                className="rounded-lg bg-white/5 px-3 py-2 text-xs font-bold text-white/70 transition hover:bg-white/10"
              >
                Select for Bulk Delete
              </button>
            </div>
          )}
        </div>

        <div className="conversations-list">
          {viewMode === 'booked' && (bookedCustomerError || error) && (
            <div className="booked-customer-error" role="alert">
              {bookedCustomerError || `Unable to load conversations. ${error}`}
            </div>
          )}
          {viewMode === 'booked' ? (
            isLoading || isBookingsLoading ? (
              <div className="pt-8 text-center text-neutral-400">
                <p className="text-sm">Loading customer conversations...</p>
              </div>
            ) : filteredBookedCustomers.length ? (
              filteredBookedCustomers.map((customer) => (
                <div key={customer.id} className="booked-customer-list-item">
                  <div className="booked-customer-avatar">
                    {(customer.name || 'C').charAt(0).toUpperCase()}
                  </div>
                  <div className="booked-customer-details">
                    <p className="booked-customer-name">{customer.name}</p>
                    <p className="booked-customer-email">{customer.email || 'No email available'}</p>
                    <p className="booked-customer-bookings">
                      {customer.bookingCount} booking{customer.bookingCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="booked-customer-chat-button"
                    onClick={() => handleOpenBookedCustomerChat(customer)}
                    disabled={!customer.customerId || isLoading || Boolean(error) || Boolean(startingBookedCustomerId)}
                    title={customer.customerId ? 'Open conversation' : 'This booking has no linked customer account'}
                    aria-label={`Chat with ${customer.name}`}
                  >
                    {startingBookedCustomerId === customer.id ? 'Opening...' : 'Chat'}
                  </button>
                </div>
              ))
            ) : (
              <div className="pt-8 text-center text-neutral-500">
                <p className="text-sm">No booked customers found</p>
              </div>
            )
          ) : error ? (
            <div className="pt-8 text-center text-red-400">
              <p className="text-sm font-semibold mb-2">Permission Error</p>
              <p className="text-xs text-neutral-400 px-4">{error}</p>
              <p className="text-xs text-neutral-500 mt-4 px-4">Please ensure Firestore rules are configured correctly for conversations collection.</p>
            </div>
          ) : isLoading ? (
            <div className="pt-8 text-center text-neutral-400">
              <p className="text-sm">Loading conversations...</p>
            </div>
          ) : filteredConversations.length ? (
            filteredConversations.map((conv) => {
              const lastMessage = conversationLastMessages[conv.id] || {}
              const isSelected = selectedConversation?.id === conv.id
              const isChecked = selectedConversationIds.has(conv.id)

              return (
                <div
                  key={conv.id}
                  onClick={() => {
                    if (!isBulkDeleteMode) {
                      setSelectedConversation(conv)
                    } else {
                      // Toggle selection in bulk delete mode
                      const newSet = new Set(selectedConversationIds)
                      if (newSet.has(conv.id)) {
                        newSet.delete(conv.id)
                      } else {
                        newSet.add(conv.id)
                      }
                      setSelectedConversationIds(newSet)
                    }
                  }}
                  className={`conversations-list-item ${
                    isBulkDeleteMode
                      ? isChecked
                        ? 'bg-red-200 text-black'
                        : 'hover:bg-red-600/10 border-transparent text-black'
                      : isSelected
                        ? 'bg-slate-700/50 border-red-600 '
                        : 'hover:bg-slate-700/50 border-transparent'
                  }`}
                  role="button"
                  tabIndex={0}
                >
                  <div className="flex items-start gap-3">
                    {isBulkDeleteMode && (
                      <div className="mt-1">
                        {isChecked ? (
                          <CheckboxOutlinedIcon sx={{ fontSize: 20 }} className="text-white" />
                        ) : (
                          <CheckBoxOutlineBlankIcon sx={{ fontSize: 20 }} className="text-white/40" />
                        )}
                      </div>
                    )}
                    
               <div className="shrink-0">
                {conv.otherUserAvatar ? (
                  <img
                    src={conv.otherUserAvatar}
                    alt={conv.displayName}
                    className="w-12 h-12 rounded-full object-cover conversation-avatar"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold conversation-avatar">
                    {(conv.displayName || "U").charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
                    
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-semibold truncate conversation-name ${
                          isBulkDeleteMode
                            ? isChecked
                              ? "text-white"
                              : ""
                            : isSelected
                            ? "text-white"
                            : ""
                        }`}
                      >
                        {conv.displayName || "Unknown User"}
                      </p>
                      <p
                        className={`text-xs truncate mt-1 conversation-last ${
                          isBulkDeleteMode
                            ? isChecked
                              ? ""
                              : ""
                            : isSelected
                            ? ""
                            : ""
                        }`}
                      >
                        {lastMessage?.text || "No messages yet"}
                      </p>
                      <p className="text-xs mt-1 conversation-date">
                        {formatDate(conv.updatedAt?.toDate?.() || new Date())}
                      </p>
                    </div>
                    
                    {!isBulkDeleteMode && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteChatClick(conv.id, e)
                        }}
                        className="conversation-list-delete-btn"
                        title="Delete conversation"
                      >
                        <DeleteRoundedIcon sx={{ fontSize: 20 }} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="pt-8 text-center text-neutral-500">
              <p className="text-sm">{viewMode === 'archived' ? 'No archived conversations yet' : 'No conversations yet'}</p>
            </div>
          )}
        </div>
      </div>

      {/* Chat View */}
      <div className="chat-view">
        {selectedConversation ? (
          <>
            {/* Chat Header */}
            <div className="chat-header">
              <div>
                <h3 className="text-lg font-bold text-white">{selectedConversation.senderName}</h3>
                <p className="text-xs text-neutral-400">{selectedConversation.userEmail}</p>
              </div>
              <div className="flex items-center gap-2">
                {selectedConversation.status === 'archived' ? (
                  <button
                    type="button"
                    onClick={() => handleConversationStatusChange(selectedConversation.id, 'open')}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-700"
                  >
                    Restore
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleConversationStatusChange(selectedConversation.id, 'archived')}
                    className="conversation-list-archive-btn"
                  >
                    <ArchiveRoundedIcon sx={{ fontSize: 25 }} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleConversationStatusChange(selectedConversation.id, 'deleted')}
                  className="conversation-list-delete-btn1"
                >
                  <DeleteRoundedIcon sx={{ fontSize: 25 }} className="md:hidden" />
                </button>
                <button                                 
                  type="button"
                  onClick={() => setSelectedConversation(null)}
                  className="rounded-lg p-2 text-white transition hover:bg-white/10 md:hidden"
                >
                  <CloseRoundedIcon sx={{ fontSize: 25 }} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="messages-container">
              {messages.length ? (
                messages.map((message, index) => {
                  const showAvatar = index === 0 || messages[index - 1]?.senderId !== message.senderId
                  const isAdminMessage = message.sender === 'admin' || message.type === 'admin'

                  return (
                    <div
                      key={message.id}
                      className={`flex gap-2 mb-4 ${isAdminMessage ? 'justify-end' : 'justify-start'}`}
                    >
                      {!isAdminMessage && (
                        <div className="shrink-0">
                          {showAvatar ? (
                            message.senderAvatar ? (
                              <img
                                src={message.senderAvatar}
                                alt={message.senderName}
                                className="w-8 h-8 rounded-full object-cover border border-red-600"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold bg-slate-700">
                                {message.senderName?.charAt(0).toUpperCase() || 'U'}
                              </div>
                            )
                          ) : (
                            <div className="w-8" />
                          )}
                        </div>
                      )}
                      
                     <div className={`max-w-xs ${isAdminMessage ? 'flex-row-reverse' : ''}`}>
                      <div
                        className={`message-bubble ${isDarkMode ? 'dark' : 'light'} ${
                          isAdminMessage ? 'rounded-br-none' : ''
                        }`}
                      >
                        <p className="text-sm">{message.text}</p>
                      </div>
                      <p
                        className={`text-xs mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-500'} ${
                          isAdminMessage ? 'text-right' : 'text-left'
                        }`}
                      >
                        {formatTime(message.timestamp)}
                      </p>
                    </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-center text-neutral-500 pt-8">
                  <SmartToyRoundedIcon sx={{ fontSize: 40 }} className="mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No messages in this conversation</p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Response Input */}
            <div className="response-input">
              <textarea
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
                placeholder={selectedConversation.status === 'archived' ? 'Restore this conversation to reply...' : 'Type your response...'}
                rows="2"
                disabled={selectedConversation.status === 'archived'}
                className="resize-none rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-white placeholder-neutral-500 focus:border-red-600/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="button"
                className="p-2 text-white/60 hover:text-red-600 transition"
                title="Emoji"
              >
                <EmojiEmotionsRoundedIcon sx={{ fontSize: 20 }} />
              </button>
              <button
                onClick={handleSendResponse}
                disabled={isSending || !responseText.trim() || selectedConversation.status === 'archived'}
                className="p-2 text-white/60 hover:text-red-600 transition disabled:opacity-50 disabled:cursor-not-allowed"
                title={isSending ? 'Sending...' : 'Send'}
              >
                <SendRoundedIcon sx={{ fontSize: 20 }} />
              </button>
            </div>
          </>
        ) : (
          <div className="text-center text-neutral-500 flex items-center justify-center h-full">
            <div>
              <SmartToyRoundedIcon sx={{ fontSize: 60 }} className="mx-auto mb-4 opacity-30" />
              <p className="text-lg font-semibold">Select a conversation to view</p>
            </div>
          </div>
        )}
      </div>

      <ConfirmationModal
        open={!!deleteConfirmation}
        title={deleteConfirmation?.title || ''}
        message={deleteConfirmation?.message || ''}
        confirmText={deleteConfirmation?.type === 'bulk' ? 'Delete All' : 'Delete'}
        cancelText="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteConfirmation(null)}
        isDangerous={true}
        isDarkMode={isDarkMode}
      />
    </div>
  )
}
