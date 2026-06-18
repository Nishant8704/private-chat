/**
 * ════════════════════════════════════════════════════════════════════
 *  Private Chat — Client-Side JavaScript
 *  Real-time messaging with Socket.IO, emoji picker, search, and
 *  profile picture uploads.
 * ════════════════════════════════════════════════════════════════════
 */

/* ═══════════════════════════════════════════════════════════════════
   § 1. Socket.IO Connection
   ═══════════════════════════════════════════════════════════════════ */
const socket = io();

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

        bubble.innerHTML = `
            <span class="message-text">${escapeHtml(msg.message)}</span>
            <span class="message-meta">
                <span class="message-time">${formatTime(msg.timestamp)}</span>
                ${statusHtml}
            </span>
        `;

        // Add delete button for own non-deleted messages
        if (isSent) {
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.title = 'Delete message';
            deleteBtn.setAttribute('aria-label', 'Delete message');
            deleteBtn.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z"/>
                    <path fill-rule="evenodd" d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 010-2H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM6 1.5a.5.5 0 01.5-.5h3a.5.5 0 010 1h-3a.5.5 0 01-.5-.5z"/>
                </svg>
            `;
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteMessage(msg.id);
            });
            wrapper.appendChild(deleteBtn);
        }
    }

    wrapper.appendChild(bubble);
    messagesContainer.appendChild(wrapper);

    // Store reference for quick updates
    messageElements.set(msg.id, wrapper);

    return wrapper;
};

/* ═══════════════════════════════════════════════════════════════════
   § 7. Chat History Loading
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Load and render the full chat history from CHAT_HISTORY.
 */
const loadChatHistory = () => {
    messagesContainer.innerHTML = '';
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

    scrollToBottom();
};

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
 * Search/filter messages by query text.
 * @param {string} query - The search term
 */
const searchMessages = (query) => {
    const lowerQuery = query.toLowerCase().trim();

    messageElements.forEach((el) => {
        const textEl = el.querySelector('.message-text');
        const bubble = el.querySelector('.message-bubble');
        if (!textEl) {
            // Deleted messages — hide if query exists
            if (lowerQuery) {
                el.classList.add('search-hidden');
            } else {
                el.classList.remove('search-hidden');
            }
            return;
        }

        const text = textEl.textContent.toLowerCase();

        if (!lowerQuery) {
            el.classList.remove('search-hidden');
            bubble.classList.remove('message-highlight');
        } else if (text.includes(lowerQuery)) {
            el.classList.remove('search-hidden');
            bubble.classList.add('message-highlight');
        } else {
            el.classList.add('search-hidden');
            bubble.classList.remove('message-highlight');
        }
    });

    // Also show/hide date separators
    const separators = messagesContainer.querySelectorAll('.date-separator');
    separators.forEach((sep) => {
        if (lowerQuery) {
            sep.classList.add('search-hidden');
            sep.style.display = 'none';
        } else {
            sep.classList.remove('search-hidden');
            sep.style.display = '';
        }
    });
};

/**
 * Remove all search highlights and show all messages.
 */
const clearSearchHighlights = () => {
    messageElements.forEach((el) => {
        el.classList.remove('search-hidden');
        const bubble = el.querySelector('.message-bubble');
        if (bubble) bubble.classList.remove('message-highlight');
    });

    const separators = messagesContainer.querySelectorAll('.date-separator');
    separators.forEach((sep) => {
        sep.classList.remove('search-hidden');
        sep.style.display = '';
    });
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

    renderMessage(msg, true);
    scrollToBottom(true);

    // Mark as read if the message is from the other user and the page is visible
    if (msg.sender !== CURRENT_USER && document.visibilityState === 'visible') {
        socket.emit('message_read', { message_ids: [msg.id] });
    }

    // Hide typing indicator (they sent a message, so they stopped typing)
    if (msg.sender !== CURRENT_USER) {
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

    // Remove delete button if present
    const deleteBtn = el.querySelector('.delete-btn');
    if (deleteBtn) deleteBtn.remove();

    // Update local history
    const msg = CHAT_HISTORY.find((m) => m.id === data.message_id);
    if (msg) msg.is_deleted = 1;
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
