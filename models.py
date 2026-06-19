"""
models.py - SQLite database helper module.

Provides direct sqlite3 operations without ORM for user management,
message storage, and chat functionality.
"""

import sqlite3
import os
from datetime import datetime, timezone
from werkzeug.security import check_password_hash
from config import Config


def get_db():
    """
    Get a database connection with Row factory enabled.

    Returns:
        sqlite3.Connection: A connection to the SQLite database with
        row_factory set to sqlite3.Row for dict-like access.
    """
    # Ensure the database directory exists before connecting
    db_dir = os.path.dirname(Config.DATABASE)
    if not os.path.exists(db_dir):
        os.makedirs(db_dir)

    conn = sqlite3.connect(Config.DATABASE)
    conn.row_factory = sqlite3.Row  # Enables column-name-based access on rows
    return conn


def init_db():
    """
    Initialize the database by creating tables if they don't exist.

    Creates the 'users' and 'messages' tables with all required columns
    for the chat application.
    """
    conn = get_db()
    cursor = conn.cursor()

    # Users table stores authentication and profile data
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            profile_pic TEXT DEFAULT 'default.png',
            is_online INTEGER DEFAULT 0,
            last_seen TEXT
        )
    ''')

    # Messages table stores all chat messages with read/delete tracking
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender TEXT NOT NULL,
            receiver TEXT NOT NULL,
            message TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            is_deleted INTEGER DEFAULT 0,
            replied_to_id INTEGER,
            FOREIGN KEY (sender) REFERENCES users(username),
            FOREIGN KEY (receiver) REFERENCES users(username),
            FOREIGN KEY (replied_to_id) REFERENCES messages(id)
        )
    ''')

    conn.commit()
    conn.close()


def get_user(username):
    """
    Retrieve a user record by username.

    Args:
        username (str): The username to look up.

    Returns:
        sqlite3.Row or None: The user row if found, otherwise None.
    """
    conn = get_db()
    user = conn.execute(
        'SELECT * FROM users WHERE username = ?', (username,)
    ).fetchone()
    conn.close()
    return user


def verify_password(username, password):
    """
    Verify a user's password against the stored hash.

    Args:
        username (str): The username to authenticate.
        password (str): The plaintext password to verify.

    Returns:
        bool: True if the password matches, False otherwise.
    """
    user = get_user(username)
    if user is None:
        return False
    return check_password_hash(user['password_hash'], password)


def save_message(sender, receiver, message, replied_to_id=None):
    """
    Save a new message to the database.

    Args:
        sender (str): Username of the message sender.
        receiver (str): Username of the message receiver.
        message (str): The message content.
        replied_to_id (int, optional): ID of the message being replied to.

    Returns:
        dict: The complete message record including id and timestamp.
    """
    timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
    conn = get_db()
    cursor = conn.execute(
        'INSERT INTO messages (sender, receiver, message, timestamp, replied_to_id) VALUES (?, ?, ?, ?, ?)',
        (sender, receiver, message, timestamp, replied_to_id)
    )
    message_id = cursor.lastrowid
    conn.commit()
    conn.close()

    return {
        'id': message_id,
        'sender': sender,
        'receiver': receiver,
        'message': message,
        'timestamp': timestamp,
        'is_read': False,
        'is_deleted': False,
        'replied_to_id': replied_to_id,
        'replied_to_text': None,
        'replied_to_sender': None
    }


def get_chat_history(user1, user2, limit=50, offset=0):
    """
    Retrieve all non-deleted messages between two users with pagination.

    Messages are returned in chronological order (oldest first) within the batch.

    Args:
        user1 (str): First user's username.
        user2 (str): Second user's username.
        limit (int): Maximum number of messages to return.
        offset (int): Number of recent messages to skip.

    Returns:
        list[dict]: List of message dictionaries ordered by timestamp.
    """
    conn = get_db()
    messages = conn.execute(
        '''SELECT m1.*, m2.message as replied_to_text, m2.sender as replied_to_sender
           FROM messages m1
           LEFT JOIN messages m2 ON m1.replied_to_id = m2.id
           WHERE ((m1.sender = ? AND m1.receiver = ?) OR (m1.sender = ? AND m1.receiver = ?))
           AND m1.is_deleted = 0
           ORDER BY m1.timestamp DESC
           LIMIT ? OFFSET ?''',
        (user1, user2, user2, user1, limit, offset)
    ).fetchall()
    conn.close()

    # Convert sqlite3.Row objects to plain dicts and reverse to chronological order
    msg_list = [dict(msg) for msg in messages]
    msg_list.reverse()
    return msg_list


def mark_messages_read(message_ids, reader):
    """
    Mark specific messages as read.

    Only marks messages where the reader is the receiver, preventing
    users from marking their own sent messages as read.

    Args:
        message_ids (list[int]): List of message IDs to mark as read.
        reader (str): Username of the reader (must be the receiver).
    """
    if not message_ids:
        return

    conn = get_db()
    # Use parameterized placeholders for the IN clause
    placeholders = ','.join('?' for _ in message_ids)
    conn.execute(
        f'UPDATE messages SET is_read = 1 WHERE id IN ({placeholders}) AND receiver = ?',
        (*message_ids, reader)
    )
    conn.commit()
    conn.close()


def delete_message(message_id):
    """
    Soft-delete a message by setting is_deleted flag.

    Uses soft deletion to preserve database integrity while hiding
    the message from the chat interface.

    Args:
        message_id (int): The ID of the message to delete.

    Returns:
        bool: True if a message was deleted, False if not found.
    """
    conn = get_db()
    cursor = conn.execute(
        'UPDATE messages SET is_deleted = 1 WHERE id = ?',
        (message_id,)
    )
    conn.commit()
    rows_affected = cursor.rowcount
    conn.close()
    return rows_affected > 0


def search_messages(user1, user2, query):
    """
    Search messages between two users by content (case insensitive).

    Args:
        user1 (str): First user's username.
        user2 (str): Second user's username.
        query (str): The search term to look for within messages.

    Returns:
        list[dict]: List of matching message dictionaries.
    """
    conn = get_db()
    messages = conn.execute(
        '''SELECT m1.*, m2.message as replied_to_text, m2.sender as replied_to_sender
           FROM messages m1
           LEFT JOIN messages m2 ON m1.replied_to_id = m2.id
           WHERE ((m1.sender = ? AND m1.receiver = ?) OR (m1.sender = ? AND m1.receiver = ?))
           AND m1.is_deleted = 0
           AND m1.message LIKE ?
           ORDER BY m1.timestamp ASC''',
        (user1, user2, user2, user1, f'%{query}%')
    ).fetchall()
    conn.close()

    return [dict(msg) for msg in messages]


def update_profile_pic(username, filename):
    """
    Update a user's profile picture filename in the database.

    Args:
        username (str): The username whose profile pic to update.
        filename (str): The new profile picture filename.
    """
    conn = get_db()
    conn.execute(
        'UPDATE users SET profile_pic = ? WHERE username = ?',
        (filename, username)
    )
    conn.commit()
    conn.close()


def set_user_online(username, is_online):
    """
    Update a user's online status and last seen timestamp.

    When going offline, the last_seen field is updated to the current UTC time.
    When coming online, last_seen is set to None (user is currently active).

    Args:
        username (str): The username to update.
        is_online (bool): True if the user is online, False if offline.
    """
    conn = get_db()
    last_seen = None if is_online else datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S')
    conn.execute(
        'UPDATE users SET is_online = ?, last_seen = ? WHERE username = ?',
        (1 if is_online else 0, last_seen, username)
    )
    conn.commit()
    conn.close()


def get_user_status(username):
    """
    Get a user's current online status and last seen time.

    Args:
        username (str): The username to check.

    Returns:
        dict: Contains 'is_online' (bool) and 'last_seen' (str or None).
              Returns default offline status if user not found.
    """
    conn = get_db()
    user = conn.execute(
        'SELECT is_online, last_seen FROM users WHERE username = ?',
        (username,)
    ).fetchone()
    conn.close()

    if user:
        return {
            'is_online': bool(user['is_online']),
            'last_seen': user['last_seen']
        }
    return {'is_online': False, 'last_seen': None}


def change_password(username, new_password):
    """
    Update a user's password hash.

    Args:
        username (str): The username whose password to change.
        new_password (str): The new plaintext password (will be hashed).

    Returns:
        bool: True if updated successfully, False if user not found.
    """
    from werkzeug.security import generate_password_hash

    user = get_user(username)
    if user is None:
        return False

    new_hash = generate_password_hash(new_password)
    conn = get_db()
    conn.execute(
        'UPDATE users SET password_hash = ? WHERE username = ?',
        (new_hash, username)
    )
    conn.commit()
    conn.close()
    return True


def change_username(old_username, new_username):
    """
    Change a user's username across all tables.

    Updates the users table and all message sender/receiver references
    in a single transaction to maintain data integrity.

    Args:
        old_username (str): The current username.
        new_username (str): The desired new username.

    Returns:
        bool: True if changed successfully, False if old user not found
              or new username already taken.
    """
    # Check that the old user exists
    old_user = get_user(old_username)
    if old_user is None:
        return False

    # Check that the new username isn't already taken
    if old_username != new_username:
        existing = get_user(new_username)
        if existing is not None:
            return False

    conn = get_db()
    try:
        # Update username in users table
        conn.execute(
            'UPDATE users SET username = ? WHERE username = ?',
            (new_username, old_username)
        )
        # Update all message sender references
        conn.execute(
            'UPDATE messages SET sender = ? WHERE sender = ?',
            (new_username, old_username)
        )
        # Update all message receiver references
        conn.execute(
            'UPDATE messages SET receiver = ? WHERE receiver = ?',
            (new_username, old_username)
        )
        conn.commit()

        # Also rename profile pic files if they exist
        import os
        upload_dir = Config.UPLOAD_FOLDER
        if os.path.exists(upload_dir):
            for f in os.listdir(upload_dir):
                if f.startswith(f"{old_username}."):
                    ext = f.rsplit('.', 1)[1]
                    old_path = os.path.join(upload_dir, f)
                    new_path = os.path.join(upload_dir, f"{new_username}.{ext}")
                    os.rename(old_path, new_path)
                    # Update profile pic filename in DB
                    conn2 = get_db()
                    conn2.execute(
                        'UPDATE users SET profile_pic = ? WHERE username = ?',
                        (f"{new_username}.{ext}", new_username)
                    )
                    conn2.commit()
                    conn2.close()

        return True
    except Exception:
        conn.rollback()
        return False
    finally:
        conn.close()
