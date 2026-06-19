/**
 * call.js — Chat-Based Jitsi Meet (New Tab)
 */

const audioCallBtn = document.getElementById('audio-call-btn');
const videoCallBtn = document.getElementById('video-call-btn');

// Ensure deterministic room name
function getRoomName() {
    const users = [CURRENT_USER, OTHER_USER].sort();
    return `PrivateChatApp_${users[0]}_${users[1]}_Call`;
}

function startCall(type) {
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
    // Open the free Jitsi meeting in a new tab to bypass all iframe and camera security blocks
    const url = `https://meet.ffmuc.net/${getRoomName()}#config.startWithVideoMuted=${type === 'audio' ? 'true' : 'false'}`;
    window.open(url, '_blank');
}

if (audioCallBtn) {
    audioCallBtn.addEventListener('click', () => startCall('audio'));
}

if (videoCallBtn) {
    videoCallBtn.addEventListener('click', () => startCall('video'));
}
