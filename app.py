"""
app.py - Main Flask application with Flask-SocketIO for real-time chat.

This is a private chat application restricted to exactly two users:
Nishant and Friend. Features include real-time messaging, typing indicators,
read receipts, emoji support, message deletion, and profile picture uploads.
"""

import os
import html
import re
from datetime import datetime, timezone
from functools import wraps

from flask import (
    Flask, render_template, request, redirect,
    url_for, session, jsonify, flash
)
from flask_socketio import SocketIO, emit
from werkzeug.utils import secure_filename

from config import Config
import models


# ---------------------------------------------------------------------------
# App Initialization
# ---------------------------------------------------------------------------
app = Flask(__name__)
app.config.from_object(Config)
app.config['MAX_CONTENT_LENGTH'] = Config.MAX_CONTENT_LENGTH

# Initialize SocketIO with eventlet async mode for WebSocket support
socketio = SocketIO(app, cors_allowed_origins='*', async_mode='eventlet')

# Track currently connected users: {username: socket_session_id}
online_users = {}

# Counter to track messages for periodic vibe analysis
message_counter = 0

# ---------------------------------------------------------------------------
# Background Vibe Emoji Logic
# ---------------------------------------------------------------------------
VIBE_KEYWORDS = {
    'happy': '😀', 'glad': '😀', 'yay': '😀', 'awesome': '😀',
    'sad': '😢', 'bad': '😢', 'sorry': '😢', 'cry': '😢',
    'angry': '😡', 'mad': '😡', 'hate': '😡', 'furious': '😡',
    'love': '❤️', 'beautiful': '❤️', 'sweet': '❤️', 'cute': '❤️',
    'funny': '😂', 'lol': '😂', 'lmao': '😂', 'haha': '😂',
    'sleep': '😴', 'tired': '😴', 'night': '😴', 'bed': '😴',
    'food': '🍕', 'hungry': '🍕', 'eat': '🍕', 'lunch': '🍕', 'dinner': '🍕',
    'coffee': '☕', 'morning': '☕', 'tea': '☕',
    'party': '🎉', 'celebrate': '🎉', 'woo': '🎉', 'congrats': '🎉',
    'hi': '👋', 'hello': '👋', 'hey': '👋', 'bye': '👋',
}

def analyze_vibe(messages):
    """Analyze the last few messages and return a matching vibe emoji."""
    text = " ".join([m['message'] for m in messages]).lower()
    for word, emoji in VIBE_KEYWORDS.items():
        if re.search(rf'\b{word}\b', text):
            return emoji
    return ''


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def login_required(f):
    """Decorator to protect routes from unauthorized access."""
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'username' not in session:
            return redirect(url_for('login'))
        return f(*args, **kwargs)
    return decorated


def get_other_user(current_user):
    """Return the other user's username (since only 2 users exist)."""
    for user in Config.ALLOWED_USERS:
        if user != current_user:
            return user
    return None


def sanitize_input(text):
    """Sanitize user input to prevent XSS attacks."""
    return html.escape(text.strip())


def allowed_file(filename):
    """Check if an uploaded file has an allowed extension."""
    return '.' in filename and \
        filename.rsplit('.', 1)[1].lower() in Config.ALLOWED_EXTENSIONS


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.route('/', methods=['GET', 'POST'])
def login():
    """Handle user login.

    GET:  Display the login page.
    POST: Validate credentials and start a session.
    """
    # Redirect to chat if already logged in
    if 'username' in session:
        return redirect(url_for('chat'))

    error = None
    if request.method == 'POST':
        username = request.form.get('username', '').strip()
        password = request.form.get('password', '')

        # Check if username is in the allowed list
        if username not in Config.ALLOWED_USERS:
            error = 'Access denied. This is a private chat.'
        elif not models.verify_password(username, password):
            error = 'Invalid password. Please try again.'
        else:
            # Successful login — create session
            session['username'] = username
            session.permanent = True
            return redirect(url_for('chat'))

    return render_template('login.html', error=error)


@app.route('/chat')
@login_required
def chat():
    """Render the main chat interface.

    Loads chat history, user profile pictures, and online status
    for the template context.
    """
    current_user = session['username']
    other_user = get_other_user(current_user)

    # Load chat history between the two users
    messages = models.get_chat_history(current_user, other_user)

    # Get profile pictures
    current_user_data = models.get_user(current_user)
    other_user_data = models.get_user(other_user)

    current_user_pic = current_user_data['profile_pic'] if current_user_data else 'default.png'
    other_user_pic = other_user_data['profile_pic'] if other_user_data else 'default.png'

    # Get other user's online status
    other_status = models.get_user_status(other_user)

    return render_template(
        'chat.html',
        current_user=current_user,
        other_user=other_user,
        messages=messages,
        current_user_pic=current_user_pic,
        other_user_pic=other_user_pic,
        other_user_online=other_status['is_online'],
        other_user_last_seen=other_status['last_seen']
    )


@app.route('/logout')
def logout():
    """Clear the user session and redirect to login."""
    session.clear()
    return redirect(url_for('login'))


@app.route('/upload_profile_pic', methods=['POST'])
@login_required
def upload_profile_pic():
    """Handle profile picture upload.

    Accepts image files (png, jpg, jpeg, gif, webp) up to 2MB.
    Saves with filename format: {username}.{extension}
    """
    if 'profile_pic' not in request.files:
        return jsonify({'success': False, 'error': 'No file provided'}), 400

    file = request.files['profile_pic']
    if file.filename == '':
        return jsonify({'success': False, 'error': 'No file selected'}), 400

    if file and allowed_file(file.filename):
        username = session['username']
        # Create a filename based on username to always overwrite the old pic
        ext = file.filename.rsplit('.', 1)[1].lower()
        filename = f"{username}.{ext}"
        safe_filename = secure_filename(filename)

        # Ensure upload directory exists
        os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)

        # Remove any existing profile pics for this user
        for old_file in os.listdir(Config.UPLOAD_FOLDER):
            if old_file.startswith(f"{username}."):
                os.remove(os.path.join(Config.UPLOAD_FOLDER, old_file))

        # Save the new file
        filepath = os.path.join(Config.UPLOAD_FOLDER, safe_filename)
        file.save(filepath)

        # Update database
        models.update_profile_pic(username, safe_filename)

        return jsonify({'success': True, 'filename': safe_filename})

    return jsonify({'success': False, 'error': 'File type not allowed'}), 400


@app.route('/search_messages')
@login_required
def search_messages():
    """Search chat messages by content.

    Query parameter 'q' is the search term.
    Returns JSON array of matching messages.
    """
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify([])

    current_user = session['username']
    other_user = get_other_user(current_user)

    results = models.search_messages(current_user, other_user, query)
    return jsonify(results)


@app.route('/api/messages')
@login_required
def get_messages():
    """Fetch paginated chat history via API.
    
    Query params:
        offset: Number of recent messages to skip
        limit: Maximum number of messages to return
    """
    offset = request.args.get('offset', default=0, type=int)
    limit = request.args.get('limit', default=50, type=int)
    
    current_user = session['username']
    other_user = get_other_user(current_user)
    
    messages = models.get_chat_history(current_user, other_user, limit=limit, offset=offset)
    return jsonify(messages)


# ---------------------------------------------------------------------------
# Settings Routes
# ---------------------------------------------------------------------------
@app.route('/change_password', methods=['POST'])
@login_required
def change_password():
    """Change the current user's password.

    Requires current password verification before allowing the change.
    Expects JSON: {current_password, new_password}
    """
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'Invalid request'}), 400

    current_password = data.get('current_password', '')
    new_password = data.get('new_password', '')

    if not current_password or not new_password:
        return jsonify({'success': False, 'error': 'All fields are required'}), 400

    if len(new_password) < 4:
        return jsonify({'success': False, 'error': 'Password must be at least 4 characters'}), 400

    username = session['username']

    # Verify current password
    if not models.verify_password(username, current_password):
        return jsonify({'success': False, 'error': 'Current password is incorrect'}), 400

    # Change the password
    if models.change_password(username, new_password):
        return jsonify({'success': True, 'message': 'Password changed successfully'})
    else:
        return jsonify({'success': False, 'error': 'Failed to change password'}), 500


@app.route('/change_username', methods=['POST'])
@login_required
def change_username():
    """Change the current user's username.

    Updates the username across all tables (users, messages),
    renames profile pic files, and updates the ALLOWED_USERS list
    at runtime. Requires current password verification.
    Expects JSON: {new_username, current_password}
    """
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'Invalid request'}), 400

    new_username = data.get('new_username', '').strip()
    current_password = data.get('current_password', '')

    if not new_username or not current_password:
        return jsonify({'success': False, 'error': 'All fields are required'}), 400

    if len(new_username) < 2:
        return jsonify({'success': False, 'error': 'Username must be at least 2 characters'}), 400

    if len(new_username) > 20:
        return jsonify({'success': False, 'error': 'Username must be 20 characters or less'}), 400

    # Only allow alphanumeric and basic characters
    if not all(c.isalnum() or c in ' _-' for c in new_username):
        return jsonify({'success': False, 'error': 'Username can only contain letters, numbers, spaces, hyphens, and underscores'}), 400

    old_username = session['username']

    # Verify current password
    if not models.verify_password(old_username, current_password):
        return jsonify({'success': False, 'error': 'Password is incorrect'}), 400

    # Don't allow changing to the same name
    if new_username == old_username:
        return jsonify({'success': True, 'message': 'Username unchanged'})

    # Perform the username change in the database
    if models.change_username(old_username, new_username):
        # Update the ALLOWED_USERS list at runtime
        idx = Config.ALLOWED_USERS.index(old_username)
        Config.ALLOWED_USERS[idx] = new_username

        # Update the session
        session['username'] = new_username

        # Update the online_users tracking dict
        if old_username in online_users:
            online_users[new_username] = online_users.pop(old_username)

        return jsonify({'success': True, 'message': f'Username changed to {new_username}'})
    else:
        return jsonify({'success': False, 'error': 'Username already taken or change failed'}), 400


# ---------------------------------------------------------------------------
# SocketIO Events
# ---------------------------------------------------------------------------
@socketio.on('connect')
def handle_connect():
    """Handle a new WebSocket connection.

    Registers the user as online and broadcasts their status to all clients.
    """
    username = session.get('username')
    if not username:
        return False  # Reject unauthenticated connections

    # Track this user's socket connection
    online_users[username] = request.sid

    # Update database status
    models.set_user_online(username, True)

    # Broadcast online status to all connected clients
    emit('user_status', {
        'username': username,
        'is_online': True,
        'last_seen': None
    }, broadcast=True)


@socketio.on('disconnect')
def handle_disconnect():
    """Handle a WebSocket disconnection.

    Marks the user as offline and broadcasts their status with last seen time.
    """
    username = session.get('username')
    if not username:
        return

    # Only remove if the disconnecting socket is the currently active one.
    # This prevents a race condition during page refresh where the new connection
    # is established before the old connection is fully disconnected.
    if online_users.get(username) == request.sid:
        # Remove from online tracking
        online_users.pop(username, None)

        # Update database status
        models.set_user_online(username, False)

        # Get the updated last seen time
        last_seen = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')

        # Broadcast offline status to all connected clients
        emit('user_status', {
            'username': username,
            'is_online': False,
            'last_seen': last_seen
        }, broadcast=True)


@socketio.on('send_message')
def handle_send_message(data):
    """Handle an incoming chat message.

    Sanitizes the message, saves it to the database, and broadcasts
    it to all connected clients.
    """
    username = session.get('username')
    if not username:
        return

    message_text = data.get('message', '').strip()
    if not message_text:
        return

    # Sanitize the message to prevent XSS
    message_text = sanitize_input(message_text)
    replied_to_id = data.get('replied_to_id')

    # Determine the receiver (the other user)
    receiver = get_other_user(username)

    # Save to database and get the complete message record
    msg = models.save_message(username, receiver, message_text, replied_to_id)
    
    # Populate replied_to fields if it's a reply
    if replied_to_id:
        conn = models.get_db()
        replied_msg = conn.execute('SELECT sender, message FROM messages WHERE id = ?', (replied_to_id,)).fetchone()
        conn.close()
        if replied_msg:
            msg['replied_to_sender'] = replied_msg['sender']
            msg['replied_to_text'] = replied_msg['message']

    # Broadcast to all connected clients (both sender and receiver)
    emit('receive_message', msg, broadcast=True)

    # Periodic vibe analysis
    global message_counter
    message_counter += 1
    if message_counter % 3 == 0:
        recent_msgs = models.get_chat_history(username, receiver, limit=3)
        vibe_emoji = analyze_vibe(recent_msgs)
        if vibe_emoji:
            emit('update_background_emoji', {'emoji': vibe_emoji}, broadcast=True)


@socketio.on('typing')
def handle_typing():
    """Broadcast typing indicator to other clients."""
    username = session.get('username')
    if username:
        emit('typing', {'username': username}, broadcast=True, include_self=False)


@socketio.on('stop_typing')
def handle_stop_typing():
    """Broadcast stop-typing indicator to other clients."""
    username = session.get('username')
    if username:
        emit('stop_typing', {'username': username}, broadcast=True, include_self=False)


@socketio.on('message_read')
def handle_message_read(data):
    """Handle read receipt for messages.

    Marks the specified messages as read in the database and
    notifies all clients about the read status change.
    """
    username = session.get('username')
    if not username:
        return

    message_ids = data.get('message_ids', [])
    if not message_ids:
        return

    # Only mark messages where this user is the receiver
    models.mark_messages_read(message_ids, username)

    # Broadcast read status to all clients
    emit('messages_read', {'message_ids': message_ids}, broadcast=True)


@socketio.on('delete_message')
def handle_delete_message(data):
    """Handle message deletion (delete for everyone).

    Verifies the requester is the message sender before deleting.
    """
    username = session.get('username')
    if not username:
        return

    message_id = data.get('message_id')
    if not message_id:
        return

    # Verify the user is the sender of this message
    conn = models.get_db()
    msg = conn.execute(
        'SELECT sender FROM messages WHERE id = ?', (message_id,)
    ).fetchone()
    conn.close()

    if msg and msg['sender'] == username:
        # Soft-delete the message
        models.delete_message(message_id)

        # Broadcast deletion to all clients
        emit('message_deleted', {'message_id': message_id}, broadcast=True)


# ---------------------------------------------------------------------------
# WebRTC Call Signaling Events
# ---------------------------------------------------------------------------
@socketio.on('call_request')
def handle_call_request(data):
    """Relay a call request to the target user."""
    callee = data.get('callee')
    if callee in online_users:
        emit('incoming_call', {
            'caller': data.get('caller'),
            'call_type': data.get('call_type', 'audio')
        }, to=online_users[callee])


@socketio.on('call_accept')
def handle_call_accept(data):
    """Notify the caller that the callee accepted."""
    target = data.get('to')
    if target in online_users:
        emit('call_accepted', {}, to=online_users[target])


@socketio.on('call_reject')
def handle_call_reject(data):
    """Notify the caller that the callee rejected."""
    target = data.get('to')
    reason = data.get('reason', 'declined')
    if target in online_users:
        emit('call_rejected', {'reason': reason}, to=online_users[target])


@socketio.on('call_end')
def handle_call_end(data):
    """Notify the other user that the call has ended."""
    target = data.get('to')
    if target in online_users:
        emit('call_ended', {}, to=online_users[target])


@socketio.on('webrtc_offer')
def handle_webrtc_offer(data):
    """Relay the WebRTC SDP offer to the target user."""
    target = data.get('to')
    if target in online_users:
        emit('webrtc_offer', {
            'offer': data.get('offer')
        }, to=online_users[target])


@socketio.on('webrtc_answer')
def handle_webrtc_answer(data):
    """Relay the WebRTC SDP answer back to the caller."""
    target = data.get('to')
    if target in online_users:
        emit('webrtc_answer', {
            'answer': data.get('answer')
        }, to=online_users[target])


@socketio.on('ice_candidate')
def handle_ice_candidate(data):
    """Relay ICE candidates between the two peers."""
    target = data.get('to')
    if target in online_users:
        emit('ice_candidate', {
            'candidate': data.get('candidate')
        }, to=online_users[target])


# ---------------------------------------------------------------------------
# Application Startup
# ---------------------------------------------------------------------------

# Ensure upload directory exists
os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)

# Initialize the database tables on startup
models.init_db()


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000, debug=True)
