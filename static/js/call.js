/**
 * call.js — Jitsi Meet API Integration
 *
 * Replaces raw WebRTC with Jitsi Meet for highly reliable video/audio calls.
 * Uses Socket.IO only to "ring" the other user.
 *
 * Dependencies: socket (from chat.js), CURRENT_USER, OTHER_USER globals, JitsiMeetExternalAPI
 */

let callType = null;        // 'audio' or 'video'
let isInCall = false;
let isCaller = false;
let jitsiApi = null;

// DOM Elements
const audioCallBtn = document.getElementById('audio-call-btn');
const videoCallBtn = document.getElementById('video-call-btn');

const incomingCallOverlay = document.getElementById('incoming-call-overlay');
const incomingCallType = document.getElementById('incoming-call-type');
const incomingCallerName = document.getElementById('incoming-caller-name');
const acceptCallBtn = document.getElementById('accept-call-btn');
const rejectCallBtn = document.getElementById('reject-call-btn');

const activeCallScreen = document.getElementById('active-call-screen');
const callUserName = document.getElementById('call-user-name');
const callStatus = document.getElementById('call-status');
const endCallBtn = document.getElementById('end-call-btn');
const jitsiContainer = document.getElementById('jitsi-container');

// Sort usernames alphabetically to ensure both users generate the EXACT SAME room name
function getRoomName() {
    const users = [CURRENT_USER, OTHER_USER].sort();
    return `PrivateChatApp_${users[0]}_${users[1]}_Call`;
}

function startCall(type) {
    if (isInCall) {
        console.warn('Already in a call');
        return;
    }

    // Check if other user is online
    const statusDot = document.getElementById('status-dot');
    if (!statusDot || !statusDot.classList.contains('online')) {
        showCallError('User is offline. Cannot call.');
        return;
    }

    callType = type;
    isCaller = true;

    // Show active call screen with "Calling..." status
    showActiveCallScreen(type);
    callStatus.textContent = 'Ringing...';

    // Send call request via signaling
    socket.emit('call_request', {
        caller: CURRENT_USER,
        callee: OTHER_USER,
        call_type: type
    });
}

function initJitsiMeet(type) {
    if (jitsiApi) {
        jitsiApi.dispose();
    }

    const domain = 'meet.jit.si';
    const options = {
        roomName: getRoomName(),
        width: '100%',
        height: '100%',
        parentNode: jitsiContainer,
        userInfo: {
            displayName: CURRENT_USER
        },
        configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: type === 'audio',
            prejoinPageEnabled: false,
            disableDeepLinking: true
        },
        interfaceConfigOverwrite: {
            SHOW_CHROME_EXTENSION_BANNER: false
        }
    };

    jitsiApi = new JitsiMeetExternalAPI(domain, options);
    
    // Listen for the user clicking "hang up" inside the Jitsi UI
    jitsiApi.addEventListener('videoConferenceLeft', () => {
        endCall(true);
    });
}

function showActiveCallScreen(type) {
    isInCall = true;
    activeCallScreen.classList.add('active');
    callUserName.textContent = OTHER_USER;
    // Clear Jitsi container just in case
    jitsiContainer.innerHTML = '';
}

function endCall(emitSignal = true) {
    if (!isInCall) return;
    isInCall = false;

    if (jitsiApi) {
        jitsiApi.dispose();
        jitsiApi = null;
    }

    jitsiContainer.innerHTML = '';
    activeCallScreen.classList.remove('active');
    hideIncomingCallOverlay();

    if (emitSignal) {
        socket.emit('call_reject', { to: OTHER_USER, reason: 'ended' });
    }
}

function showIncomingCallOverlay(caller, type) {
    incomingCallerName.textContent = caller;
    incomingCallType.textContent = type === 'video' ? '📹 Video Call' : '📞 Audio Call';
    incomingCallOverlay.classList.add('active');
}

function hideIncomingCallOverlay() {
    incomingCallOverlay.classList.remove('active');
}

function showCallError(message) {
    const toast = document.createElement('div');
    toast.className = 'call-error-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

// --- Socket.IO Event Listeners ---

socket.on('incoming_call', (data) => {
    if (isInCall) {
        // Already in a call, auto-reject
        socket.emit('call_reject', { to: data.caller, reason: 'busy' });
        return;
    }

    callType = data.call_type;
    isCaller = false;
    showIncomingCallOverlay(data.caller, data.call_type);
});

socket.on('call_reject', (data) => {
    const reason = data.reason || 'declined';
    
    if (reason === 'ended' && isInCall) {
        // The other person hung up
        endCall(false);
    } else if (isCaller && isInCall && !jitsiApi) {
        // We were ringing them, but they declined or are busy
        if (reason === 'busy') {
            showCallError('User is busy on another call.');
        } else if (reason === 'media_error') {
            showCallError('User had a camera/mic error.');
        } else {
            showCallError('Call declined.');
        }
        endCall(false);
    } else if (isInCall && jitsiApi) {
        // They hung up while in the call
        endCall(false);
    }
});

// Target accepted the call
socket.on('call_accept', () => {
    if (isCaller && isInCall) {
        callStatus.textContent = 'Connected';
        initJitsiMeet(callType);
    }
});

// --- DOM Event Listeners ---

if (audioCallBtn) {
    audioCallBtn.addEventListener('click', () => startCall('audio'));
}

if (videoCallBtn) {
    videoCallBtn.addEventListener('click', () => startCall('video'));
}

if (acceptCallBtn) {
    acceptCallBtn.addEventListener('click', () => {
        hideIncomingCallOverlay();
        showActiveCallScreen(callType);
        callStatus.textContent = 'Connected';
        initJitsiMeet(callType);
        socket.emit('call_accept', { to: OTHER_USER });
    });
}

if (rejectCallBtn) {
    rejectCallBtn.addEventListener('click', () => {
        socket.emit('call_reject', { to: OTHER_USER, reason: 'declined' });
        hideIncomingCallOverlay();
        callType = null;
    });
}

if (endCallBtn) {
    endCallBtn.addEventListener('click', () => endCall(true));
}

// Clean up if user navigates away
window.addEventListener('beforeunload', () => {
    if (isInCall) {
        endCall(true);
    }
});
