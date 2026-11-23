import { useState, useEffect, useRef } from 'react'
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, orderBy, limit, getDoc, doc, updateDoc, deleteDoc, writeBatch, getDocs } from 'firebase/firestore'
import SendRoundedIcon from '@mui/icons-material/SendRounded'
import SearchRoundedIcon from '@mui/icons-material/SearchRounded'
import AttachFileRoundedIcon from '@mui/icons-material/AttachFileRounded'
import EmojiEmotionsRoundedIcon from '@mui/icons-material/EmojiEmotionsRounded'
import DeleteRoundedIcon from '@mui/icons-material/DeleteRounded'
import { db } from '../../firebase'
import NavHeaderCustomer from './components/NavHeaderCustomer'
import GlobalLoadingScreen from '../../components/GlobalLoadingScreen'
import './CustomerMessagesPage.css'

export default function CustomerMessagesPage({
  currentUser,
  isDarkMode,
  onNavigateToShowroom,
  onNavigateToService,
  onNavigateToMessages,
  onNavigateToProfile,
  onNavigateToServiceBookings,
  onSignOut,
}) {
  const [conversations, setConversations] = useState([])
  const [selectedConversationId, setSelectedConversationId] = useState(null)
  const [messages, setMessages] = useState([])
  const [messageText, setMessageText] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const messagesEndRef = useRef(null)
  const [userAvatar, setUserAvatar] = useState(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }

  // Fetch user avatar
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

  // Fetch conversations for the current user
  useEffect(() => {
    if (!currentUser?.uid) return

    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', currentUser.uid)
    )

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const convo = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        setConversations(convo)
        
        // Validate that selectedConversationId exists in the fetched conversations
        const selectedExists = convo.some(c => c.id === selectedConversationId)
        
        if (convo.length === 0) {
          // No conversations - clear selection
          setSelectedConversationId(null)
        } else if (!selectedExists && !selectedConversationId) {
          // No conversation selected and none exists - select first one
          setSelectedConversationId(convo[0].id)
        } else if (!selectedExists && selectedConversationId) {
          // Selected conversation doesn't exist - clear selection
          setSelectedConversationId(null)
        }
        setIsLoading(false)
      },
      (error) => {
        console.error('Error fetching conversations:', error)
        setIsLoading(false)
      }
    )

    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid])

  // Fetch messages for selected conversation
  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([])
      return
    }

    const q = query(
      collection(db, 'conversations', selectedConversationId, 'messages'),
      orderBy('timestamp', 'asc'),
      limit(100)
    )

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const msgs = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }))
        setMessages(msgs)
      },
      (error) => {
        console.error('Error fetching messages:', error)
        console.error('Error code:', error.code)
        console.error('Error message:', error.message)
        setMessages([])
      }
    )

    return unsubscribe
  }, [selectedConversationId])

  // Scroll to bottom when messages change
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToBottom()
    }, 100)
    return () => clearTimeout(timer)
  }, [messages])

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!messageText.trim() || !selectedConversationId) return

    try {
      const trimmedMessage = messageText.trim()

      await addDoc(collection(db, 'conversations', selectedConversationId, 'messages'), {
        senderId: currentUser.uid,
        senderName: currentUser.displayName || 'User',
        senderAvatar: userAvatar || null,
        sender: 'user',
        type: 'user',
        text: trimmedMessage,
        timestamp: serverTimestamp(),
        read: false,
      })

      await updateDoc(doc(db, 'conversations', selectedConversationId), {
        updatedAt: serverTimestamp(),
        lastMessage: trimmedMessage,
        lastMessageTime: serverTimestamp(),
        title: selectedConversation?.title || currentUser.displayName || 'Customer Support',
        senderName: currentUser.displayName || 'User',
        senderAvatar: userAvatar || null,
        senderId: currentUser.uid,
        userEmail: currentUser.email || '',
        userId: currentUser.uid,
        status: 'open',
      })

      setMessageText('')
    } catch (error) {
      console.error('Error sending message:', error)
    }
  }

  const handleDeleteConversation = async (conversationId) => {


    try {
      // Delete all messages in the conversation
      const messagesRef = collection(db, 'conversations', conversationId, 'messages')
      const messagesSnap = await getDocs(messagesRef)
      
      const batch = writeBatch(db)
      messagesSnap.docs.forEach((doc) => {
        batch.delete(doc.ref)
      })
      await batch.commit()

      // Delete the conversation
      await deleteDoc(doc(db, 'conversations', conversationId))

      // Clear selection if deleted conversation was selected
      if (selectedConversationId === conversationId) {
        setSelectedConversationId(null)
        setMessages([])
      }
    } catch (error) {
      console.error('Error deleting conversation:', error)
      alert('Failed to delete conversation')
    }
  }

  const formatTime = (timestamp) => {
    if (!timestamp) return ''
    const date = timestamp.toDate()
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return ''
    const date = timestamp.toDate()
    const today = new Date()
    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  const filteredConversations = conversations.filter(
    (c) => c.title?.toLowerCase().includes(searchQuery.toLowerCase()) || c.lastMessage?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId)

  if (isLoading) {
    return <GlobalLoadingScreen isDarkMode={isDarkMode} />
  }

  return (
    <div className={`h-screen flex flex-col overflow-hidden ${isDarkMode ? 'bg-slate-950' : 'bg-white'}`}>
      <NavHeaderCustomer
        currentUser={currentUser}
        isDarkMode={isDarkMode}
        onNavigateToShowroom={onNavigateToShowroom}
        onNavigateToService={onNavigateToService}
        onNavigateToMessages={onNavigateToMessages}
        onNavigateToProfile={onNavigateToProfile}
        onNavigateToServiceBookings={onNavigateToServiceBookings}
        onSignOut={onSignOut}
        activePage="messages"
        userAvatar={userAvatar}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Conversations Sidebar */}
        <div className={`hidden md:flex md:w-80 flex-col border-r ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-50'}`}>
          {/* Search Bar */}
          <div className={`border-b p-4 ${isDarkMode ? 'border-slate-800' : 'border-slate-200'}`}>
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 ${isDarkMode ? 'bg-slate-800' : 'bg-white border border-slate-300'}`}>
              <SearchRoundedIcon sx={{ fontSize: 20, color: isDarkMode ? '#94a3b8' : '#64748b' }} />
              <input
                type="text"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`flex-1 bg-transparent text-sm outline-none ${isDarkMode ? 'text-white placeholder-slate-500' : 'text-slate-900 placeholder-slate-400'}`}
              />
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto space-y-0">
            {filteredConversations.length > 0 ? (
              filteredConversations.map((conversation) => (
                <div
                  key={conversation.id}
                  className={`flex items-center border-b transition group ${
                    selectedConversationId === conversation.id
                      ? isDarkMode
                        ? 'bg-slate-800 border-slate-700'
                        : 'bg-blue-50 border-slate-200'
                      : isDarkMode
                        ? 'hover:bg-slate-800/50 border-slate-800'
                        : 'hover:bg-slate-100 border-slate-200'
                  }`}
                >
                  <button
                    onClick={() => setSelectedConversationId(conversation.id)}
                    className="flex-1 px-4 py-3 transition text-left"
                  >
                    <div className="flex items-start gap-3">
                      {conversation.otherUserAvatar ? (
                        <img
                          src={conversation.otherUserAvatar}
                          alt={conversation.title}
                          className="w-12 h-12 rounded-full object-cover shrink-0 border border-red-600"
                        />
                      ) : (
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0 ${isDarkMode ? 'bg-slate-700' : 'bg-slate-400'}`}>
                          {conversation.title?.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{conversation.title}</p>
                        <p className={`text-xs truncate mt-1 ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{conversation.lastMessage}</p>
                        <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>{formatDate(conversation.lastMessageTime)}</p>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => handleDeleteConversation(conversation.id)}
                    className="p-2 opacity-0 group-hover:opacity-100 transition text-slate-400 hover:text-red-600"
                    title="Delete conversation"
                  >
                    <DeleteRoundedIcon sx={{ fontSize: 18 }} />
                  </button>
                </div>
              ))
            ) : (
              <div className={`p-6 text-center ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                <p className="text-sm">No conversations yet</p>
              </div>
            )}
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 flex flex-col bg-slate-950 overflow-hidden">
          {selectedConversation ? (
            <>
              {/* Header */}
              <div className={`shrink-0 border-b p-4 flex items-center justify-between ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
                <div className="flex items-center gap-3">
                  {selectedConversation?.otherUserAvatar ? (
                    <img
                      src={selectedConversation.otherUserAvatar}
                      alt={selectedConversation.title}
                      className="w-10 h-10 rounded-full object-cover border border-red-600"
                    />
                  ) : (
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-bold ${isDarkMode ? 'bg-slate-700' : 'bg-slate-400'}`}>
                      {selectedConversation.title?.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-white">{selectedConversation.title}</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDeleteConversation(selectedConversationId)}
                  className="p-2 text-slate-400 hover:text-red-600 transition"
                  title="Delete conversation"
                >
                  <DeleteRoundedIcon sx={{ fontSize: 20 }} />
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
                {messages.map((message, index) => {
                  const isCurrentUser = message.senderId === currentUser.uid
                  const showAvatar = index === 0 || messages[index - 1]?.senderId !== message.senderId

                  return (
                    <div key={message.id} className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'}`}>
                      <div className={`flex gap-2 max-w-xs ${isCurrentUser ? 'flex-row-reverse' : ''}`}>
                        {showAvatar ? (
                          message.senderAvatar ? (
                            <img
                              src={message.senderAvatar}
                              alt={message.senderName}
                              className="w-8 h-8 rounded-full object-cover border border-red-600 shrink-0"
                            />
                          ) : (
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${isDarkMode ? 'bg-slate-700' : 'bg-slate-400'}`}>
                              {message.senderName?.charAt(0).toUpperCase()}
                            </div>
                          )
                        ) : (
                          <div className="w-8" />
                        )}

                        <div className={`flex flex-col ${isCurrentUser ? 'items-end' : 'items-start'}`}>
                          <div
                            className={`rounded-lg px-4 py-2 ${
                              isCurrentUser
                                ? 'bg-red-600 text-white rounded-br-none'
                                : isDarkMode
                                  ? 'bg-slate-800 text-white rounded-bl-none'
                                  : 'bg-slate-200 text-slate-900 rounded-bl-none'
                            }`}
                          >
                            <p className="text-sm">{message.text}</p>
                          </div>
                          <p className={`text-xs mt-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-500'}`}>{formatTime(message.timestamp)}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <form onSubmit={handleSendMessage} className={`shrink-0 border-t p-4 ${isDarkMode ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-white'}`}>
                <div className={`flex items-end gap-2 rounded-lg border px-4 py-3 ${isDarkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-300 bg-slate-50'}`}>
                  <button
                    type="button"
                    className={`shrink-0 transition ${isDarkMode ? 'text-slate-400 hover:text-red-600' : 'text-slate-600 hover:text-red-600'}`}
                  >
                    <AttachFileRoundedIcon sx={{ fontSize: 20 }} />
                  </button>

                  <input
                    type="text"
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    placeholder="Type a message..."
                    className={`flex-1 bg-transparent text-sm outline-none ${isDarkMode ? 'text-white placeholder-slate-500' : 'text-slate-900 placeholder-slate-400'}`}
                  />

                  <button
                    type="button"
                    className={`shrink-0 transition ${isDarkMode ? 'text-slate-400 hover:text-red-600' : 'text-slate-600 hover:text-red-600'}`}
                  >
                    <EmojiEmotionsRoundedIcon sx={{ fontSize: 20 }} />
                  </button>

                  <button
                    type="submit"
                    disabled={!messageText.trim()}
                    className={`shrink-0 transition ${messageText.trim() ? 'text-red-600 hover:text-red-700' : 'text-slate-400 cursor-not-allowed'}`}
                  >
                    <SendRoundedIcon sx={{ fontSize: 20 }} />
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center flex flex-col items-center gap-4">
                <div className={`inline-block rounded-2xl px-8 py-6 shadow-lg ${isDarkMode ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-900'}`}>
                  <p className="text-xl font-semibold mb-3">You Need Anything?</p>
                  <p className="text-sm mb-2">Contact our Admin Chat Support to help you out!</p>
                  <p className="text-sm mb-5">Just click <span className="font-bold text-red-600">Start Conversation Here!</span></p>
                  <button
                    className="px-6 py-3 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 transition"
                    onClick={async () => {
                      // Create a new conversation with admin
                      if (!currentUser?.uid) return;
                      try {
                        // Check if a conversation with admin already exists
                        const adminId = 'admin'; // Change this to your actual admin UID
                        const existing = conversations.find(c => c.participants?.includes(adminId));
                        if (existing) {
                          setSelectedConversationId(existing.id);
                          return;
                        }
                        const docRef = await addDoc(collection(db, 'conversations'), {
                          participants: [currentUser.uid, adminId],
                          userId: currentUser.uid,
                          userEmail: currentUser.email || '',
                          title: currentUser.displayName || 'Customer Support',
                          displayName: currentUser.displayName || 'Customer',
                          otherUserAvatar: null,
                          lastMessage: '',
                          lastMessageTime: serverTimestamp(),
                          createdAt: serverTimestamp(),
                          updatedAt: serverTimestamp(),
                          senderName: currentUser.displayName || 'Customer',
                          senderAvatar: userAvatar || null,
                          senderId: currentUser.uid,
                          status: 'open',
                          isGuest: false,
                        });
                        setSelectedConversationId(docRef.id);
                      } catch {
                        alert('Failed to start conversation.');
                      }
                    }}
                  >
                    Start Conversation Here!
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
