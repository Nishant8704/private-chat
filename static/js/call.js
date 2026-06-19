/**
 * call.js — WebRTC Video & Audio Calling
 *
 * Handles peer-to-peer audio/video calls using WebRTC with
 * Flask-SocketIO as the signaling relay. No media passes through
 * the server — streams flow directly between browsers.
 *
 * Dependencies: socket (from chat.js), CURRENT_USER, OTHER_USER globals
 */

/* ═══════════════════════════════════════════════════════════════════
   § 1. Configuration & State
   ═══════════════════════════════════════════════════════════════════ */

const ICE_SERVERS = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' }
    ]
};

let peerConnection = null;
let localStream = null;
let remoteStream = null;
let callType = null;        // 'audio' or 'video'
let isInCall = false;
let isCaller = false;
let callTimerInterval = null;
let callStartTime = null;
let isMuted = false;
let isCameraOff = false;
let remoteCandidatesQueue = [];

/* ═══════════════════════════════════════════════════════════════════
   § 2. DOM References
   ═══════════════════════════════════════════════════════════════════ */

const audioCallBtn = document.getElementById('audio-call-btn');
const videoCallBtn = document.getElementById('video-call-btn');

// Incoming call overlay
const incomingCallOverlay = document.getElementById('incoming-call-overlay');
const incomingCallType = document.getElementById('incoming-call-type');
const incomingCallerName = document.getElementById('incoming-caller-name');
const acceptCallBtn = document.getElementById('accept-call-btn');
const rejectCallBtn = document.getElementById('reject-call-btn');

// Active call screen
const activeCallScreen = document.getElementById('active-call-screen');
const remoteVideo = document.getElementById('remote-video');
const localVideo = document.getElementById('local-video');
const callUserName = document.getElementById('call-user-name');
const callStatus = document.getElementById('call-status');
const callTimer = document.getElementById('call-timer');
const muteBtn = document.getElementById('mute-btn');
const cameraBtn = document.getElementById('camera-btn');
const endCallBtn = document.getElementById('end-call-btn');

/* ═══════════════════════════════════════════════════════════════════
   § 3. Call Initiation
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Start an outgoing call.
 * @param {'audio'|'video'} type - The type of call to make.
 */
async function startCall(type) {
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

    try {
        // Request camera/mic
        const constraints = {
            audio: true,
            video: type === 'video' ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false
        };

        localStream = await navigator.mediaDevices.getUserMedia(constraints);

        // Show active call screen with "Calling..." status
        showActiveCallScreen(type);
        callStatus.textContent = 'Calling...';

        // Set local video
        if (type === 'video') {
            localVideo.srcObject = localStream;
            localVideo.style.display = 'block';
        } else {
            localVideo.style.display = 'none';
        }

        // Send call request via signaling
        socket.emit('call_request', {
            caller: CURRENT_USER,
            callee: OTHER_USER,
            call_type: type
        });

    } catch (err) {
        console.error('Failed to get media:', err);
        if (err.name === 'NotAllowedError') {
            showCallError('Camera/microphone permission denied. Please allow access in your browser settings.');
        } else if (err.name === 'NotFoundError') {
            showCallError('No camera or microphone found on this device.');
        } else {
            showCallError('Could not access camera/microphone.');
        }
        cleanupCall();
    }
}

/**
 * Show a brief error toast for call issues.
 */
function showCallError(message) {
    // Create a temporary toast
    const toast = document.createElement('div');
    toast.className = 'call-error-toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

/* ═══════════════════════════════════════════════════════════════════
   § 4. WebRTC Peer Connection
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Create and configure the RTCPeerConnection.
 */
function createPeerConnection() {
    peerConnection = new RTCPeerConnection(ICE_SERVERS);

    // Add local tracks to the connection
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    // Handle incoming remote tracks
    peerConnection.ontrack = (event) => {
        if (!remoteStream) {
            remoteStream = new MediaStream();
            remoteVideo.srcObject = remoteStream;
        }
        remoteStream.addTrack(event.track);

        // Update status when media starts flowing
        callStatus.textContent = '';
        if (!callTimerInterval) startCallTimer();
    };

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('ice_candidate', {
                candidate: event.candidate,
                to: OTHER_USER
            });
        }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        const state = peerConnection.connectionState;
        if (state === 'failed' || state === 'closed') {
            endCall(false); // Don't emit, connection already dead
        }
    };

    peerConnection.oniceconnectionstatechange = () => {
        if (peerConnection.iceConnectionState === 'connected') {
            callStatus.textContent = '';
            if (!callTimerInterval) startCallTimer();
        }
    };

    return peerConnection;
}

/**
 * Create and send an SDP offer (caller side).
 */
async function createOffer() {
    createPeerConnection();

    try {
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        socket.emit('webrtc_offer', {
            offer: offer,
            to: OTHER_USER
        });
    } catch (err) {
        console.error('Failed to create offer:', err);
        endCall(true);
    }
}

/**
 * Handle incoming SDP offer and create an answer (callee side).
 */
async function handleOffer(offer) {
    createPeerConnection();

    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        await processQueuedCandidates();

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        socket.emit('webrtc_answer', {
            answer: answer,
            to: OTHER_USER
        });
    } catch (err) {
        console.error('Failed to handle offer:', err);
        endCall(true);
    }
}

/**
 * Handle incoming SDP answer (caller side).
 */
async function handleAnswer(answer) {
    try {
        if (peerConnection) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            await processQueuedCandidates();
        }
    } catch (err) {
        console.error('Failed to handle answer:', err);
    }
}

/**
 * Handle incoming ICE candidate.
 */
async function handleIceCandidate(candidate) {
    try {
        if (peerConnection && peerConnection.remoteDescription && peerConnection.remoteDescription.type) {
            await peerConnection.addIceCandidate(candidate);
        } else {
            remoteCandidatesQueue.push(candidate);
        }
    } catch (err) {
        console.error('Failed to add ICE candidate:', err);
    }
}

/**
 * Apply all buffered remote ICE candidates to the peer connection.
 */
async function processQueuedCandidates() {
    if (!peerConnection) return;
    console.log(`Processing ${remoteCandidatesQueue.length} queued ICE candidates`);
    while (remoteCandidatesQueue.length > 0) {
        const candidate = remoteCandidatesQueue.shift();
        try {
            await peerConnection.addIceCandidate(candidate);
        } catch (err) {
            console.error('Failed to add queued ICE candidate:', err);
        }
    }
}

/* ═══════════════════════════════════════════════════════════════════
   § 5. Call Controls
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Toggle microphone mute.
 */
function toggleMute() {
    if (!localStream) return;

    const audioTracks = localStream.getAudioTracks();
    audioTracks.forEach(track => {
        track.enabled = !track.enabled;
    });

    isMuted = !isMuted;

    // Update button appearance
    muteBtn.classList.toggle('active', isMuted);
    muteBtn.textContent = isMuted ? '[UNMUTE]' : '[MUTE]';
}

/**
 * Toggle camera on/off.
 */
function toggleCamera() {
    if (!localStream) return;

    const videoTracks = localStream.getVideoTracks();
    if (videoTracks.length === 0) return;

    videoTracks.forEach(track => {
        track.enabled = !track.enabled;
    });

    isCameraOff = !isCameraOff;

    // Update button appearance
    cameraBtn.classList.toggle('active', isCameraOff);
    cameraBtn.textContent = isCameraOff ? '[CAMERA ON]' : '[CAMERA OFF]';

    // Toggle local video visibility
    localVideo.style.opacity = isCameraOff ? '0' : '1';
}

/**
 * End the current call.
 * @param {boolean} emitEvent - Whether to notify the other user.
 */
function endCall(emitEvent = true) {
    if (emitEvent) {
        socket.emit('call_end', { to: OTHER_USER });
    }
    cleanupCall();
}

/**
 * Clean up all call resources.
 */
function cleanupCall() {
    // Stop all local media tracks
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }

    // Close peer connection
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    // Reset remote stream
    remoteStream = null;
    if (remoteVideo) remoteVideo.srcObject = null;
    if (localVideo) localVideo.srcObject = null;

    // Stop call timer
    stopCallTimer();

    // Reset state
    isInCall = false;
    isCaller = false;
    callType = null;
    isMuted = false;
    isCameraOff = false;
    remoteCandidatesQueue = [];

    // Hide overlays
    hideIncomingCallOverlay();
    hideActiveCallScreen();

    // Reset button states
    if (muteBtn) muteBtn.classList.remove('active');
    if (cameraBtn) cameraBtn.classList.remove('active');
}

/* ═══════════════════════════════════════════════════════════════════
   § 6. Call Timer
   ═══════════════════════════════════════════════════════════════════ */

function startCallTimer() {
    callStartTime = Date.now();
    callTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
        const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const secs = String(elapsed % 60).padStart(2, '0');
        callTimer.textContent = `${mins}:${secs}`;
    }, 1000);
}

function stopCallTimer() {
    if (callTimerInterval) {
        clearInterval(callTimerInterval);
        callTimerInterval = null;
    }
    callStartTime = null;
    if (callTimer) callTimer.textContent = '00:00';
}

/* ═══════════════════════════════════════════════════════════════════
   § 7. UI Helpers
   ═══════════════════════════════════════════════════════════════════ */

function showIncomingCallOverlay(caller, type) {
    incomingCallerName.textContent = caller;
    incomingCallType.textContent = type === 'video' ? '📹 Video Call' : '📞 Audio Call';
    incomingCallOverlay.classList.add('active');

    // Play ringtone vibration effect on mobile
    if (navigator.vibrate) {
        navigator.vibrate([300, 200, 300, 200, 300]);
    }
}

function hideIncomingCallOverlay() {
    if (incomingCallOverlay) {
        incomingCallOverlay.classList.remove('active');
    }
}

function showActiveCallScreen(type) {
    isInCall = true;
    callUserName.textContent = OTHER_USER;
    callTimer.textContent = '00:00';

    // Show/hide camera button based on call type
    if (type === 'video') {
        cameraBtn.style.display = 'flex';
        activeCallScreen.classList.add('video-call');
        activeCallScreen.classList.remove('audio-call');
    } else {
        cameraBtn.style.display = 'none';
        activeCallScreen.classList.add('audio-call');
        activeCallScreen.classList.remove('video-call');
    }

    activeCallScreen.classList.add('active');
}

function hideActiveCallScreen() {
    if (activeCallScreen) {
        activeCallScreen.classList.remove('active', 'video-call', 'audio-call');
    }
}

/* ═══════════════════════════════════════════════════════════════════
   § 8. SocketIO Signal Handlers
   ═══════════════════════════════════════════════════════════════════ */

// --- Incoming call request ---
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

// --- Call accepted by the other user ---
socket.on('call_accepted', async (data) => {
    callStatus.textContent = 'Connecting...';
    await createOffer();
});

// --- Call rejected by the other user ---
socket.on('call_rejected', (data) => {
    const reason = data.reason === 'busy' ? 'User is on another call.' : 'Call declined.';
    showCallError(reason);
    cleanupCall();
});

// --- Call ended by the other user ---
socket.on('call_ended', () => {
    showCallError('Call ended.');
    cleanupCall();
});

// --- Receive WebRTC offer ---
socket.on('webrtc_offer', async (data) => {
    await handleOffer(data.offer);
});

// --- Receive WebRTC answer ---
socket.on('webrtc_answer', async (data) => {
    await handleAnswer(data.answer);
});

// --- Receive ICE candidate ---
socket.on('ice_candidate', async (data) => {
    await handleIceCandidate(data.candidate);
});

/* ═══════════════════════════════════════════════════════════════════
   § 9. UI Event Listeners
   ═══════════════════════════════════════════════════════════════════ */

// Header call buttons
if (audioCallBtn) {
    audioCallBtn.addEventListener('click', () => startCall('audio'));
}

if (videoCallBtn) {
    videoCallBtn.addEventListener('click', () => startCall('video'));
}

// Accept incoming call
if (acceptCallBtn) {
    acceptCallBtn.addEventListener('click', async () => {
        hideIncomingCallOverlay();

        try {
            // Get media
            const constraints = {
                audio: true,
                video: callType === 'video' ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false
            };

            localStream = await navigator.mediaDevices.getUserMedia(constraints);

            showActiveCallScreen(callType);
            callStatus.textContent = 'Connecting...';

            if (callType === 'video') {
                localVideo.srcObject = localStream;
                localVideo.style.display = 'block';
            } else {
                localVideo.style.display = 'none';
            }

            // Notify caller we accepted
            socket.emit('call_accept', { to: OTHER_USER });

        } catch (err) {
            console.error('Failed to get media on accept:', err);
            showCallError('Could not access camera/microphone.');
            socket.emit('call_reject', { to: OTHER_USER, reason: 'media_error' });
            cleanupCall();
        }
    });
}

// Reject incoming call
if (rejectCallBtn) {
    rejectCallBtn.addEventListener('click', () => {
        socket.emit('call_reject', { to: OTHER_USER, reason: 'declined' });
        hideIncomingCallOverlay();
        callType = null;
    });
}

// Call controls
if (muteBtn) muteBtn.addEventListener('click', toggleMute);
if (cameraBtn) cameraBtn.addEventListener('click', toggleCamera);
if (endCallBtn) endCallBtn.addEventListener('click', () => endCall(true));

// Escape key to end call
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isInCall) {
        endCall(true);
    }
});

// Clean up if user navigates away
window.addEventListener('beforeunload', () => {
    if (isInCall) {
        endCall(true);
    }
});
