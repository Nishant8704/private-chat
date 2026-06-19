/**
 * ════════════════════════════════════════════════════════════════════
 *  Private Chat — Client-Side JavaScript
 *  Real-time messaging with Socket.IO, emoji picker, search, and
 *  profile picture uploads.
 * ════════════════════════════════════════════════════════════════════
 */

/* ═══════════════════════════════════════════════════════════════════
   § 1. Socket.IO Connection & Audio
   ═══════════════════════════════════════════════════════════════════ */
const socket = io();
const notificationSound = new Audio('/static/sounds/notification.wav');
notificationSound.volume = 0.3; // Low volume as requested

/* ═══════════════════════════════════════════════════════════════════
   § 2. DOM Element References
   ═══════════════════════════════════════════════════════════════════ */
const messagesContainer = document.getElementById('messages-container');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');
const emojiGrid = document.getElementById('emoji-grid');
const emojiPickerClose = document.getElementById('emoji-picker-close');
const searchBtn = document.getElementById('search-btn');
const searchPanel = document.getElementById('search-panel');
const searchInput = document.getElementById('search-input');
const searchCloseBtn = document.getElementById('search-close-btn');
const typingIndicator = document.getElementById('typing-indicator');
const headerAvatarBtn = document.getElementById('header-avatar-btn');
const headerAvatarImg = document.getElementById('header-avatar-img');
const headerStatus = document.getElementById('header-status');
const statusDot = document.getElementById('status-dot');
const profileModal = document.getElementById('profile-modal');
const modalCloseBtn = document.getElementById('modal-close-btn');
const modalPreviewImg = document.getElementById('modal-preview-img');
const uploadForm = document.getElementById('upload-form');
const fileInput = document.getElementById('file-input');
const fileName = document.getElementById('file-name');
const uploadBtn = document.getElementById('upload-btn');

/* ═══════════════════════════════════════════════════════════════════
   § 3. State Variables
   ═══════════════════════════════════════════════════════════════════ */

/** Map of message ID → DOM element for quick lookups */
const messageElements = new Map();

/** Timeout handle for the "stop typing" debounce */
let typingTimeout = null;

/** Whether the emoji picker has been initialized */
let emojiInitialized = false;

/** Whether the user is currently typing */
let isTyping = false;

/* ═══════════════════════════════════════════════════════════════════
   § 4. Utility Functions
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Escape HTML entities to prevent XSS when inserting user content.
 * @param {string} text - Raw text to sanitize
 * @returns {string} HTML-safe string
 */
const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

/**
 * Parse a UTC timestamp string and return a formatted local time.
 * @param {string} timestamp - Format: 'YYYY-MM-DD HH:MM:SS'
 * @returns {string} Formatted time, e.g. '2:30 PM'
 */
const formatTime = (timestamp) => {
    if (!timestamp) return '';
    // Parse as UTC by appending 'Z'
    const date = new Date(timestamp.replace(' ', 'T') + 'Z');
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    });
};

/**
 * Format a timestamp into a human-readable date string.
 * @param {string} timestamp - Format: 'YYYY-MM-DD HH:MM:SS'
 * @returns {string} 'Today', 'Yesterday', or 'MMM DD, YYYY'
 */
const formatDate = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp.replace(' ', 'T') + 'Z');
    if (isNaN(date.getTime())) return '';

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const messageDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diffDays = Math.floor((today - messageDate) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    return date.toLocaleDateString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    });
};

/**
 * Extract the date portion (YYYY-MM-DD) from a timestamp for grouping.
 * @param {string} timestamp
 * @returns {string}
 */
const getDateKey = (timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp.replace(' ', 'T') + 'Z');
    if (isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/* ═══════════════════════════════════════════════════════════════════
   § 5. Date Separator
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Add a date separator pill to the messages container.
 * @param {string} dateText - Human-readable date string
 */
const addDateSeparator = (dateText) => {
    const separator = document.createElement('div');
    separator.className = 'date-separator';
    separator.innerHTML = `<span class="date-separator-pill">${escapeHtml(dateText)}</span>`;
    messagesContainer.appendChild(separator);
};

/* ═══════════════════════════════════════════════════════════════════
   § 6. Message Rendering
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Render a single message and append it to the messages container.
 * @param {Object} msg - Message object with id, sender, message, timestamp, is_read, is_deleted
 * @param {boolean} animate - Whether to apply entrance animation
 * @returns {HTMLElement} The created message wrapper element
 */
const renderMessage = (msg, animate = false) => {
    const isSent = msg.sender === CURRENT_USER;
    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${isSent ? 'sent' : 'received'}`;
    wrapper.dataset.messageId = msg.id;
    if (animate) wrapper.classList.add('animate');

    // Create Actions Container
    const actions = document.createElement('div');
    actions.className = 'message-actions';
    
    // Reply Button
    const replyBtn = document.createElement('button');
    replyBtn.className = 'action-btn reply-btn';
    replyBtn.title = 'Reply';
    replyBtn.innerHTML = '↩️';
    replyBtn.onclick = (e) => { e.stopPropagation(); initReply(msg.id, msg.message, msg.sender); };
    actions.appendChild(replyBtn);

    if (isSent) {
        // Delete Button
        const delBtn = document.createElement('button');
        delBtn.className = 'action-btn delete-btn';
        delBtn.title = 'Delete';
        delBtn.innerHTML = '🗑️';
        delBtn.onclick = (e) => { e.stopPropagation(); deleteMessage(msg.id); };
        actions.appendChild(delBtn);
    }

    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${isSent ? 'sent' : 'received'}`;

    if (msg.is_deleted) {
        // Deleted message placeholder
        bubble.innerHTML = `<span class="message-deleted">🚫 This message was deleted</span>`;
    } else {
        // Build status ticks for sent messages
        let statusHtml = '';
        if (isSent) {
            if (msg.is_read) {
                statusHtml = `<span class="message-status read-ticks" title="Read">✓✓</span>`;
            } else {
                statusHtml = `<span class="message-status" title="Sent">✓</span>`;
            }
        }
        
        // Build Quoted block if reply
        let quotedHtml = '';
        if (msg.replied_to_id && msg.replied_to_text) {
            const senderName = msg.replied_to_sender === CURRENT_USER ? 'You' : msg.replied_to_sender;
            // Removed onclick for scrollToMessage to keep it simple, or can implement later
            quotedHtml = `
                <div class="quoted-message">
                    <div class="quoted-sender">${escapeHtml(senderName)}</div>
                    <div class="quoted-text">${escapeHtml(msg.replied_to_text)}</div>
                </div>
            `;
        }

        bubble.innerHTML = `
            ${quotedHtml}
            <span class="message-text">${escapeHtml(msg.message)}</span>
            <span class="message-meta">
                <span class="message-time">${formatTime(msg.timestamp)}</span>
                ${statusHtml}
            </span>
        `;
    }

    wrapper.appendChild(bubble);
    wrapper.appendChild(actions);
    messagesContainer.appendChild(wrapper);

    // Store reference for quick updates
    messageElements.set(msg.id, wrapper);

    return wrapper;
};

/* ═══════════════════════════════════════════════════════════════════
   § 7. Chat History Loading & Pagination
   ═══════════════════════════════════════════════════════════════════ */

let currentOffset = CHAT_HISTORY.length;
const BATCH_SIZE = 50;
let hasMoreMessages = CHAT_HISTORY.length === BATCH_SIZE;
let isLoadingMessages = false;
let isSearching = false;

/**
 * Load and render the full chat history from CHAT_HISTORY.
 */
const loadChatHistory = (autoScroll = true) => {
    // Preserve the background emoji element
    const bgEmoji = document.getElementById('bg-emoji');
    messagesContainer.innerHTML = '';
    if (bgEmoji) messagesContainer.appendChild(bgEmoji);
    
    messageElements.clear();

    let currentDateKey = '';

    CHAT_HISTORY.forEach((msg) => {
        const dateKey = getDateKey(msg.timestamp);

        // Insert date separator when the day changes
        if (dateKey !== currentDateKey) {
            currentDateKey = dateKey;
            addDateSeparator(formatDate(msg.timestamp));
        }

        renderMessage(msg);
    });

    if (autoScroll) scrollToBottom();
};

/**
 * Fetch older messages from the server when scrolling up.
 */
const fetchOlderMessages = async () => {
    if (isLoadingMessages || !hasMoreMessages || isSearching) return;
    isLoadingMessages = true;
    
    try {
        const res = await fetch(`/api/messages?offset=${currentOffset}&limit=${BATCH_SIZE}`);
        const olderMessages = await res.json();
        
        if (olderMessages.length > 0) {
            const oldScrollHeight = messagesContainer.scrollHeight;
            const oldScrollTop = messagesContainer.scrollTop;
            
            // Prepend older messages to CHAT_HISTORY
            CHAT_HISTORY.unshift(...olderMessages);
            currentOffset += olderMessages.length;
            
            // Re-render
            loadChatHistory(false);
            
            // Restore scroll position
            messagesContainer.scrollTop = (messagesContainer.scrollHeight - oldScrollHeight) + oldScrollTop;
            
            if (olderMessages.length < BATCH_SIZE) hasMoreMessages = false;
        } else {
            hasMoreMessages = false;
        }
    } catch (err) {
        console.error("Failed to fetch older messages:", err);
    } finally {
        isLoadingMessages = false;
    }
};

messagesContainer.addEventListener('scroll', () => {
    if (messagesContainer.scrollTop <= 50) {
        fetchOlderMessages();
    }
});

/* ═══════════════════════════════════════════════════════════════════
   § 9. Reply Logic
   ═══════════════════════════════════════════════════════════════════ */

let currentReplyToId = null;
const replyContext = document.getElementById('reply-context');
const replyContextSender = document.getElementById('reply-context-sender');
const replyContextText = document.getElementById('reply-context-text');
const cancelReplyBtn = document.getElementById('cancel-reply-btn');

const initReply = (id, text, sender) => {
    currentReplyToId = id;
    replyContextSender.textContent = sender === CURRENT_USER ? 'You' : sender;
    replyContextText.textContent = text;
    replyContext.classList.remove('hidden');
    messageInput.focus();
};

const cancelReply = () => {
    currentReplyToId = null;
    replyContext.classList.add('hidden');
};

if (cancelReplyBtn) {
    cancelReplyBtn.addEventListener('click', cancelReply);
}

/* ═══════════════════════════════════════════════════════════════════
   § 10. Sending & Formatting
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Gather input text and emit the send_message event.
 */
const sendMessage = () => {
    const text = messageInput.value.trim();
    if (!text) return;

    const data = { message: text };
    if (currentReplyToId) {
        data.replied_to_id = currentReplyToId;
    }

    socket.emit('send_message', data);

    messageInput.value = '';
    messageInput.style.height = 'auto'; // Reset textarea height
    isTyping = false;
    socket.emit('stop_typing');
    cancelReply();
    messageInput.focus();
};

/**
 * Fetch older messages from the server when scrolling up.
 */
const fetchOlderMessages = async () => {
    if (isLoadingMessages || !hasMoreMessages || isSearching) return;
    isLoadingMessages = true;
    
    try {
        const res = await fetch(`/api/messages?offset=${currentOffset}&limit=${BATCH_SIZE}`);
        const olderMessages = await res.json();
        
        if (olderMessages.length > 0) {
            const oldScrollHeight = messagesContainer.scrollHeight;
            const oldScrollTop = messagesContainer.scrollTop;
            
            // Prepend older messages to CHAT_HISTORY
            CHAT_HISTORY.unshift(...olderMessages);
            currentOffset += olderMessages.length;
            
            // Re-render
            loadChatHistory(false);
            
            // Restore scroll position
            messagesContainer.scrollTop = (messagesContainer.scrollHeight - oldScrollHeight) + oldScrollTop;
            
            if (olderMessages.length < BATCH_SIZE) hasMoreMessages = false;
        } else {
            hasMoreMessages = false;
        }
    } catch (err) {
        console.error("Failed to fetch older messages:", err);
    } finally {
        isLoadingMessages = false;
    }
};

messagesContainer.addEventListener('scroll', () => {
    if (messagesContainer.scrollTop <= 50) {
        fetchOlderMessages();
    }
});

/* ═══════════════════════════════════════════════════════════════════
   § 8. Scroll Helpers
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Scroll the messages container to the bottom.
 * @param {boolean} smooth - Use smooth scrolling animation
 */
const scrollToBottom = (smooth = false) => {
    if (smooth) {
        messagesContainer.scrollTo({
            top: messagesContainer.scrollHeight,
            behavior: 'smooth',
        });
    } else {
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
};

/* ═══════════════════════════════════════════════════════════════════
   § 9. Sending Messages
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Send the current input message via Socket.IO.
 */
const sendMessage = () => {
    const text = messageInput.value.trim();
    if (!text) return;

    socket.emit('send_message', { message: text });
    messageInput.value = '';
    messageInput.focus();

    // Stop typing indicator
    if (isTyping) {
        isTyping = false;
        socket.emit('stop_typing');
    }
    if (typingTimeout) {
        clearTimeout(typingTimeout);
        typingTimeout = null;
    }
};

/* ═══════════════════════════════════════════════════════════════════
   § 10. Deleting Messages
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Delete a message by ID.
 * @param {number|string} messageId
 */
const deleteMessage = (messageId) => {
    socket.emit('delete_message', { message_id: messageId });
};

/* ═══════════════════════════════════════════════════════════════════
   § 11. Emoji Picker
   ═══════════════════════════════════════════════════════════════════ */

/** Common emojis for the picker */
const EMOJIS = [
    '😀','😃','😄','😁','😆','😅','🤣','😂',
    '🙂','😊','😇','🥰','😍','🤩','😘','😗',
    '😚','😙','🥲','😋','😛','😜','🤪','😝',
    '🤑','🤗','🤭','🤫','🤔','🫡','🤐','🤨',
    '😐','😑','😶','🫥','😏','😒','🙄','😬',
    '🤥','😌','😔','😪','🤤','😴','😷','🤒',
    '🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵',
    '🤯','🤠','🥳','🥸','😎','🤓','🧐','😕',
    '🫤','😟','🙁','😮','😯','😲','😳','🥺',
    '🥹','😦','😧','😨','😰','😥','😢','😭',
    '😱','😖','😣','😞','😓','😩','😫','🥱',
    '😤','😡','😠','🤬','❤️','🧡','💛','💚',
    '💙','💜','🖤','🤍','💯','💢','💥','🔥',
    '✨','💫','👍','👎','👏','🙏','💪','🤝',
];

/**
 * Initialize the emoji picker grid with clickable emoji items.
 */
const initEmojiPicker = () => {
    if (emojiInitialized) return;
    emojiInitialized = true;

    EMOJIS.forEach((emoji) => {
        const item = document.createElement('span');
        item.className = 'emoji-item';
        item.textContent = emoji;
        item.setAttribute('role', 'button');
        item.setAttribute('aria-label', emoji);
        item.addEventListener('click', () => insertEmoji(emoji));
        emojiGrid.appendChild(item);
    });
};

/**
 * Toggle emoji picker visibility.
 */
const toggleEmojiPicker = () => {
    const isActive = emojiPicker.classList.toggle('active');
    emojiBtn.classList.toggle('active', isActive);
    if (isActive) {
        initEmojiPicker();
    }
};

/**
 * Insert an emoji into the message input at the cursor position.
 * @param {string} emoji - The emoji character to insert
 */
const insertEmoji = (emoji) => {
    const start = messageInput.selectionStart;
    const end = messageInput.selectionEnd;
    const value = messageInput.value;

    messageInput.value = value.slice(0, start) + emoji + value.slice(end);
    // Move cursor after the inserted emoji
    const newPos = start + emoji.length;
    messageInput.setSelectionRange(newPos, newPos);
    messageInput.focus();
};

/* ═══════════════════════════════════════════════════════════════════
   § 12. Search
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Toggle the search panel visibility.
 */
const toggleSearch = () => {
    const isActive = searchPanel.classList.toggle('active');
    if (isActive) {
        searchInput.focus();
    } else {
        searchInput.value = '';
        clearSearchHighlights();
    }
};

/**
 * Search/filter messages by querying the backend.
 * @param {string} query - The search term
 */
const searchMessages = async (query) => {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) {
        clearSearchHighlights();
        return;
    }

    isSearching = true;

    try {
        const res = await fetch(`/search_messages?q=${encodeURIComponent(lowerQuery)}`);
        const searchResults = await res.json();

        // Preserve bg emoji
        const bgEmoji = document.getElementById('bg-emoji');
        messagesContainer.innerHTML = '';
        if (bgEmoji) messagesContainer.appendChild(bgEmoji);
        messageElements.clear();

        let currentDateKey = '';

        searchResults.forEach((msg) => {
            const dateKey = getDateKey(msg.timestamp);
            if (dateKey !== currentDateKey) {
                currentDateKey = dateKey;
                addDateSeparator(formatDate(msg.timestamp));
            }

            renderMessage(msg);
            
            // Highlight
            const el = messageElements.get(msg.id);
            if (el) {
                const bubble = el.querySelector('.message-bubble');
                if (bubble) bubble.classList.add('message-highlight');
            }
        });
        
        scrollToBottom();
    } catch (err) {
        console.error("Search failed", err);
    }
};

/**
 * Remove all search highlights and restore normal view.
 */
const clearSearchHighlights = () => {
    isSearching = false;
    loadChatHistory();
};

/* ═══════════════════════════════════════════════════════════════════
   § 13. Profile Picture Upload
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Open the profile picture upload modal.
 */
const openProfileModal = () => {
    profileModal.classList.add('active');
};

/**
 * Close the profile picture upload modal.
 */
const closeProfileModal = () => {
    profileModal.classList.remove('active');
    // Reset form state
    uploadForm.reset();
    fileName.textContent = 'No file selected';
    uploadBtn.disabled = true;
};

/**
 * Upload the selected profile picture to the server.
 * @param {File} file - The image file to upload
 */
const uploadProfilePic = async (file) => {
    const formData = new FormData();
    formData.append('profile_pic', file);

    try {
        const response = await fetch('/upload_profile_pic', {
            method: 'POST',
            body: formData,
        });

        if (response.ok) {
            const data = await response.json();
            // Update the current user's avatar if returned
            if (data.filename) {
                modalPreviewImg.src = `/static/uploads/${data.filename}?t=${Date.now()}`;
            }
            closeProfileModal();
            // Reload to reflect changes
            window.location.reload();
        } else {
            console.error('Upload failed:', response.statusText);
        }
    } catch (err) {
        console.error('Upload error:', err);
    }
};

/* ═══════════════════════════════════════════════════════════════════
   § 14. Typing Indicator Logic
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Handle typing state — emit typing/stop_typing events with debounce.
 */
const handleTypingInput = () => {
    if (!isTyping) {
        isTyping = true;
        socket.emit('typing');
    }

    // Clear any existing timeout
    if (typingTimeout) clearTimeout(typingTimeout);

    // Stop typing after 2 seconds of inactivity
    typingTimeout = setTimeout(() => {
        isTyping = false;
        socket.emit('stop_typing');
        typingTimeout = null;
    }, 2000);
};

/**
 * Show the typing indicator.
 */
const showTypingIndicator = () => {
    typingIndicator.classList.add('active');
    scrollToBottom(true);
};

/**
 * Hide the typing indicator.
 */
const hideTypingIndicator = () => {
    typingIndicator.classList.remove('active');
};

/* ═══════════════════════════════════════════════════════════════════
   § 15. Socket.IO Event Handlers
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Handle incoming messages from the server.
 */
socket.on('receive_message', (msg) => {
    // Check if we need a date separator
    const existingMessages = messagesContainer.querySelectorAll('.message-wrapper');
    if (existingMessages.length > 0) {
        const lastMsg = existingMessages[existingMessages.length - 1];
        const lastMsgId = parseInt(lastMsg.dataset.messageId);
        // Find the last message in history for date comparison
        const lastHistoryMsg = CHAT_HISTORY.length > 0
            ? CHAT_HISTORY[CHAT_HISTORY.length - 1]
            : null;

        const lastDateKey = lastHistoryMsg ? getDateKey(lastHistoryMsg.timestamp) : '';
        const newDateKey = getDateKey(msg.timestamp);

        if (lastDateKey && newDateKey && newDateKey !== lastDateKey) {
            addDateSeparator(formatDate(msg.timestamp));
        }
    } else {
        addDateSeparator(formatDate(msg.timestamp));
    }

    // Add to local history
    CHAT_HISTORY.push(msg);
    currentOffset += 1;

    if (!isSearching) {
        // Check if we need a date separator
        const existingMessages = messagesContainer.querySelectorAll('.message-wrapper');
        if (existingMessages.length > 0) {
            const lastHistoryMsg = CHAT_HISTORY.length > 1
                ? CHAT_HISTORY[CHAT_HISTORY.length - 2]
                : null;

            const lastDateKey = lastHistoryMsg ? getDateKey(lastHistoryMsg.timestamp) : '';
            const newDateKey = getDateKey(msg.timestamp);

            if (lastDateKey && newDateKey && newDateKey !== lastDateKey) {
                addDateSeparator(formatDate(msg.timestamp));
            }
        } else {
            addDateSeparator(formatDate(msg.timestamp));
        }

        renderMessage(msg, true);
        scrollToBottom(true);
    }

    // Mark as read if the message is from the other user and the page is visible
    if (msg.sender !== CURRENT_USER) {
        if (document.visibilityState === 'visible') {
            socket.emit('message_read', { message_ids: [msg.id] });
        } else {
            // User is not on the screen, play notification sound
            notificationSound.play().catch(err => console.log("Audio prevented by browser:", err));
        }
        
        // Hide typing indicator (they sent a message, so they stopped typing)
        hideTypingIndicator();
    }
});

/**
 * Handle user online/offline status updates.
 */
socket.on('user_status', (data) => {
    if (data.username === OTHER_USER) {
        if (data.is_online) {
            statusDot.classList.add('online');
            headerStatus.textContent = 'online';
            headerStatus.classList.add('online-text');
        } else {
            statusDot.classList.remove('online');
            headerStatus.classList.remove('online-text');
            if (data.last_seen) {
                headerStatus.textContent = `last seen ${formatTime(data.last_seen)}`;
            } else {
                headerStatus.textContent = 'offline';
            }
        }
    }
});

/**
 * Handle typing indicator from the other user.
 */
socket.on('typing', (data) => {
    if (data.username === OTHER_USER) {
        showTypingIndicator();
    }
});

/**
 * Handle stop typing from the other user.
 */
socket.on('stop_typing', (data) => {
    if (data.username === OTHER_USER) {
        hideTypingIndicator();
    }
});

/**
 * Handle read receipts — update tick marks to blue.
 */
socket.on('messages_read', (data) => {
    if (!data.message_ids) return;

    data.message_ids.forEach((id) => {
        const el = messageElements.get(id);
        if (!el) return;

        const statusEl = el.querySelector('.message-status');
        if (statusEl) {
            statusEl.classList.add('read-ticks');
            statusEl.textContent = '✓✓';
            statusEl.title = 'Read';
        }
    });
});

/**
 * Handle message deletion events.
 */
socket.on('message_deleted', (data) => {
    const el = messageElements.get(data.message_id);
    if (!el) return;

    const bubble = el.querySelector('.message-bubble');
    if (bubble) {
        bubble.innerHTML = `<span class="message-deleted">🚫 This message was deleted</span>`;
    }

    // Remove actions container if present
    const actions = el.querySelector('.message-actions');
    if (actions) actions.remove();

    // Update local history
    const msg = CHAT_HISTORY.find((m) => m.id === data.message_id);
    if (msg) msg.is_deleted = 1;
});

/**
 * Handle background vibe emoji updates.
 */
socket.on('update_background_emoji', (data) => {
    const bgEmoji = document.getElementById('bg-emoji');
    if (bgEmoji) {
        // Only update if it's different to avoid flashing
        if (bgEmoji.textContent !== data.emoji) {
            bgEmoji.classList.remove('show');
            setTimeout(() => {
                if (data.emoji) {
                    bgEmoji.textContent = data.emoji;
                    bgEmoji.classList.add('show');
                } else {
                    bgEmoji.textContent = '';
                }
            }, 800); // Wait for fade out
        }
    }
});

/* ═══════════════════════════════════════════════════════════════════
   § 16. DOM Event Listeners
   ═══════════════════════════════════════════════════════════════════ */

// --- Send Message ---
sendBtn.addEventListener('click', sendMessage);

messageInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// --- Typing detection ---
messageInput.addEventListener('input', handleTypingInput);

// --- Emoji Picker ---
emojiBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleEmojiPicker();
});

emojiPickerClose.addEventListener('click', () => {
    emojiPicker.classList.remove('active');
    emojiBtn.classList.remove('active');
});

// Close emoji picker when clicking outside
document.addEventListener('click', (e) => {
    if (
        emojiPicker.classList.contains('active') &&
        !emojiPicker.contains(e.target) &&
        !emojiBtn.contains(e.target)
    ) {
        emojiPicker.classList.remove('active');
        emojiBtn.classList.remove('active');
    }
});

// --- Search ---
searchBtn.addEventListener('click', toggleSearch);

searchCloseBtn.addEventListener('click', () => {
    searchPanel.classList.remove('active');
    searchInput.value = '';
    clearSearchHighlights();
});

searchInput.addEventListener('input', (e) => {
    searchMessages(e.target.value);
});

// --- Profile Picture Modal ---
headerAvatarBtn.addEventListener('click', openProfileModal);

modalCloseBtn.addEventListener('click', closeProfileModal);

// Close modal when clicking overlay background
profileModal.addEventListener('click', (e) => {
    if (e.target === profileModal) {
        closeProfileModal();
    }
});

// File input change — preview and enable upload
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        fileName.textContent = file.name;
        uploadBtn.disabled = false;

        // Preview the selected image
        const reader = new FileReader();
        reader.onload = (ev) => {
            modalPreviewImg.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    } else {
        fileName.textContent = 'No file selected';
        uploadBtn.disabled = true;
    }
});

// Upload form submission
uploadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const file = fileInput.files[0];
    if (file) {
        uploadProfilePic(file);
    }
});

// --- Keyboard shortcut: Escape to close overlays ---
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (settingsModal && settingsModal.classList.contains('active')) {
            closeSettingsModal();
        } else if (profileModal.classList.contains('active')) {
            closeProfileModal();
        } else if (emojiPicker.classList.contains('active')) {
            emojiPicker.classList.remove('active');
            emojiBtn.classList.remove('active');
        } else if (searchPanel.classList.contains('active')) {
            searchPanel.classList.remove('active');
            searchInput.value = '';
            clearSearchHighlights();
        }
    }
});

/* ═══════════════════════════════════════════════════════════════════
   § 17. Visibility Change — Mark messages as read
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Collect unread received message IDs and emit a read receipt.
 */
const markUnreadAsRead = () => {
    const unreadIds = CHAT_HISTORY
        .filter((msg) => msg.sender !== CURRENT_USER && !msg.is_read && !msg.is_deleted)
        .map((msg) => msg.id);

    if (unreadIds.length > 0) {
        socket.emit('message_read', { message_ids: unreadIds });
    }
};

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        markUnreadAsRead();
    }
});

/* ═══════════════════════════════════════════════════════════════════
   § 18. Initialization
   ═══════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
    // Render all chat history
    loadChatHistory();

    // Initialize the emoji picker grid
    initEmojiPicker();

    // Mark any existing unread received messages as read
    markUnreadAsRead();

    // Focus the message input
    messageInput.focus();
});

/* ═══════════════════════════════════════════════════════════════════
   § 19. Settings Modal
   ═══════════════════════════════════════════════════════════════════ */

const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const settingsSuccess = document.getElementById('settings-success');
const settingsError = document.getElementById('settings-error');
const newUsernameInput = document.getElementById('new-username');
const usernamePasswordInput = document.getElementById('username-password');
const changeUsernameBtn = document.getElementById('change-username-btn');
const currentPasswordInput = document.getElementById('current-password');
const newPasswordInput = document.getElementById('new-password');
const changePasswordBtn = document.getElementById('change-password-btn');

/**
 * Open the settings modal.
 */
const openSettingsModal = () => {
    settingsModal.classList.add('active');
    hideSettingsMessages();
};

/**
 * Close the settings modal and reset all fields.
 */
const closeSettingsModal = () => {
    settingsModal.classList.remove('active');
    // Clear all fields
    if (newUsernameInput) newUsernameInput.value = '';
    if (usernamePasswordInput) usernamePasswordInput.value = '';
    if (currentPasswordInput) currentPasswordInput.value = '';
    if (newPasswordInput) newPasswordInput.value = '';
    hideSettingsMessages();
};

/**
 * Hide success/error messages in settings.
 */
const hideSettingsMessages = () => {
    if (settingsSuccess) {
        settingsSuccess.classList.remove('show');
        settingsSuccess.textContent = '';
    }
    if (settingsError) {
        settingsError.classList.remove('show');
        settingsError.textContent = '';
    }
};

/**
 * Show a success message in the settings modal.
 */
const showSettingsSuccess = (msg) => {
    hideSettingsMessages();
    settingsSuccess.textContent = msg;
    settingsSuccess.classList.add('show');
};

/**
 * Show an error message in the settings modal.
 */
const showSettingsError = (msg) => {
    hideSettingsMessages();
    settingsError.textContent = msg;
    settingsError.classList.add('show');
};

/**
 * Handle username change via API.
 */
const handleChangeUsername = async () => {
    const newUsername = newUsernameInput.value.trim();
    const password = usernamePasswordInput.value;

    if (!newUsername || !password) {
        showSettingsError('Please fill in all fields');
        return;
    }

    try {
        const response = await fetch('/change_username', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                new_username: newUsername,
                current_password: password
            })
        });

        const data = await response.json();

        if (data.success) {
            showSettingsSuccess(data.message || 'Username changed successfully!');
            // Clear the fields
            newUsernameInput.value = '';
            usernamePasswordInput.value = '';
            // Reload after a brief delay so user sees the success message
            setTimeout(() => {
                window.location.reload();
            }, 1500);
        } else {
            showSettingsError(data.error || 'Failed to change username');
        }
    } catch (err) {
        showSettingsError('Network error. Please try again.');
        console.error('Username change error:', err);
    }
};

/**
 * Handle password change via API.
 */
const handleChangePassword = async () => {
    const currentPwd = currentPasswordInput.value;
    const newPwd = newPasswordInput.value;

    if (!currentPwd || !newPwd) {
        showSettingsError('Please fill in all fields');
        return;
    }

    if (newPwd.length < 4) {
        showSettingsError('New password must be at least 4 characters');
        return;
    }

    try {
        const response = await fetch('/change_password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                current_password: currentPwd,
                new_password: newPwd
            })
        });

        const data = await response.json();

        if (data.success) {
            showSettingsSuccess(data.message || 'Password changed successfully!');
            // Clear the fields
            currentPasswordInput.value = '';
            newPasswordInput.value = '';
        } else {
            showSettingsError(data.error || 'Failed to change password');
        }
    } catch (err) {
        showSettingsError('Network error. Please try again.');
        console.error('Password change error:', err);
    }
};

// --- Settings event listeners ---
if (settingsBtn) {
    settingsBtn.addEventListener('click', openSettingsModal);
}

if (settingsCloseBtn) {
    settingsCloseBtn.addEventListener('click', closeSettingsModal);
}

if (settingsModal) {
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            closeSettingsModal();
        }
    });
}

if (changeUsernameBtn) {
    changeUsernameBtn.addEventListener('click', handleChangeUsername);
}

if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', handleChangePassword);
}
