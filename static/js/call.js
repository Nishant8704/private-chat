/**
 * call.js — Chat-Based Jitsi Meet API Integration
 */

let callType = null;
let isInCall = false;
let jitsiApi = null;

const audioCallBtn = document.getElementById('audio-call-btn');
const videoCallBtn = document.getElementById('video-call-btn');
const activeCallScreen = document.getElementById('active-call-screen');
const callUserName = document.getElementById('call-user-name');
const callStatus = document.getElementById('call-status');
const endCallBtn = document.getElementById('end-call-btn');
const jitsiContainer = document.getElementById('jitsi-container');

// Ensure deterministic room name
function getRoomName() {
    const users = [CURRENT_USER, OTHER_USER].sort();
    return `PrivateChatApp_${users[0]}_${users[1]}_Call`;
}

function startCall(type) {
    if (isInCall) {
        console.warn('Already in a call');
        return;
    }

    // Send the chat message invite automatically
    const inviteMessage = `[SYSTEM_CALL_INVITE_${type.toUpperCase()}]`;
    socket.emit('send_message', {
        receiver: OTHER_USER,
        message: inviteMessage
    });

    joinCallFromInvite(type);
}

// Global function exposed so chat.js can call it when a button is clicked
window.joinCallFromInvite = function(type) {
    if (isInCall) return;
    callType = type;
    showActiveCallScreen(type);
    callStatus.textContent = 'Connected';
    initJitsiMeet(type);
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
    
    jitsiApi.addEventListener('videoConferenceLeft', () => {
        endCall();
    });
}

function showActiveCallScreen(type) {
    isInCall = true;
    activeCallScreen.classList.add('active');
    callUserName.textContent = OTHER_USER;
    jitsiContainer.innerHTML = '';
}

function endCall() {
    if (!isInCall) return;
    isInCall = false;

    if (jitsiApi) {
        jitsiApi.dispose();
        jitsiApi = null;
    }

    jitsiContainer.innerHTML = '';
    activeCallScreen.classList.remove('active');
    callType = null;
}

if (audioCallBtn) {
    audioCallBtn.addEventListener('click', () => startCall('audio'));
}

if (videoCallBtn) {
    videoCallBtn.addEventListener('click', () => startCall('video'));
}

if (endCallBtn) {
    endCallBtn.addEventListener('click', () => endCall());
}

window.addEventListener('beforeunload', () => {
    if (isInCall) {
        endCall();
    }
});
