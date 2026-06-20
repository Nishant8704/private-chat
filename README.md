# 📟 Private Chat: Terminal Edition

### A secure, real-time retro chat application for two users

> A beautifully designed, fully functional private chat website built for exactly **two users** — **Nishant** & **Friend**. Powered by Flask, WebSockets, and SQLite, it delivers a seamless real-time messaging experience with a heavily stylized **Retro Hacker Terminal UI**.

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-2.x-000000?style=for-the-badge&logo=flask&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?style=for-the-badge&logo=sqlite&logoColor=white)
![WebSocket](https://img.shields.io/badge/WebSocket-Real--time-010101?style=for-the-badge&logo=socketdotio&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 💬 **Real-time Messaging** | Instant message delivery via WebSocket (Flask-SocketIO) |
| 📹 **Free Video & Audio Calls** | Bulletproof, no-login Discord-style calling via free Jitsi Meet integration |
| 💻 **Retro Terminal UI** | Deep retro aesthetic featuring monospace fonts, ASCII dividers, and phosphor green colors |
| 🟢 **Online/Offline Status** | See exactly when the other user connects or disconnects in real-time |
| ⌨️ **Typing Indicators** | Console-style `> User is typing...` indicator |
| ✅ **Read Receipts** | Terminal tags indicating `[SENT]` vs `[READ]` |
| 🗑️ **Message Deletion** | Delete messages for everyone in the chat log |
| 😊 **Emoji Picker** | Built-in terminal-styled emoji picker |
| 🔍 **Database Query Search** | Search through your SQLite chat history instantly |
| 🖼️ **Profile Settings** | Change username, passwords, and upload custom profile pictures dynamically |
| 💾 **Persistent Chat Log** | All messages securely stored in an SQLite database file |
| 🔐 **Strict Allowlist** | App strictly refuses registration to anyone not explicitly defined in `config.py` |

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Backend** | Python Flask |
| **Real-time** | Flask-SocketIO |
| **Calling** | Jitsi Meet External API (via Freifunk public instance) |
| **Database** | SQLite |
| **Frontend** | Vanilla HTML, CSS, JavaScript |
| **Authentication** | Werkzeug secure password hashing |

---

## 📁 Project Structure

```text
Chatting App/
│
├── app.py                     # Main Flask application & SocketIO routes
├── config.py                  # App configuration (secret key, STRICT allowed users)
├── requirements.txt           # Python dependencies
├── README.md                  # You are here!
│
├── database/
│   ├── init_db.py             # Script to initialize tables and users
│   └── chat.db                # SQLite database (auto-generated)
│
├── static/
│   ├── css/
│   │   └── style.css          # Retro terminal CSS styling
│   ├── js/
│   │   ├── chat.js            # Real-time WebSocket messaging and UI logic
│   │   └── call.js            # Video/Audio calling logic
│   └── uploads/
│       └── profile_pics/      # Directory for user avatars
│
└── templates/
    ├── login.html             # Terminal login screen
    └── chat.html              # Main terminal chat interface
```

---

## 🚀 Local Setup

### Prerequisites

- **Python 3.9+** installed on your system
- **pip** (Python package manager)

### Step-by-step Installation

```bash
# 1. Clone or navigate to the project directory
cd "Chatting App"

# 2. Create a virtual environment
python -m venv venv

# 3. Activate the virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Initialize the database
python database/init_db.py

# 6. Run the application
python app.py

# 7. Open in your browser
# http://localhost:5000
```

> [!TIP]
> To test locally on multiple devices, connect both devices to the same Wi-Fi and navigate to `http://<your-local-ip>:5000`.

---

## 🔑 Access & Configuration

For maximum security, this app operates on a strict **allowlist**. Only usernames defined in `config.py` can register or exist.

**Default Allowed Users:**
- `Nishant`
- `Friend`

### Changing the Allowed Users
1. Edit the `ALLOWED_USERS` list inside `config.py`.
2. Delete the `database/chat.db` file (if you want to wipe the slate clean).
3. Run `python database/init_db.py` to regenerate the database schema with your new usernames.

---

## ☁️ Deployment on Render

This app is production-ready for free hosting services like Render.

1. Create a Web Service on Render and attach your GitHub repository.
2. Set the **Build Command**: `pip install -r requirements.txt && python database/init_db.py`
3. Set the **Start Command**: `gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:$PORT app:app`
4. **Environment Variables**: Add a random `SECRET_KEY`.

> [!IMPORTANT]  
> If deploying to Render, **you MUST set your number of Gunicorn workers (`-w`) to `1`**. Because you are using local Socket.IO without a Redis backend, having multiple workers will cause real-time messages to randomly drop if users are connected to different workers.

> [!CAUTION]  
> SQLite databases on free Render instances are **ephemeral** and will wipe on every redeployment. Consider attaching a persistent disk if you want to keep chat history permanently.

---

## 📞 Calling System Architecture

The video/audio calling feature bypasses typical raw WebRTC limitations (like strict symmetric NATs and STUN/TURN server requirements) by integrating the completely free **Jitsi Meet API**.

When a user clicks `[VIDEO]`, the app does not send a fragile background signal. Instead, it drops a completely bulletproof `[JOIN 📹 CALL]` button directly into the chat history. The other user simply clicks the button to open a new tab directly to a private, randomized, no-login `meet.ffmuc.net` room.

This ensures calls always connect perfectly regardless of deployment firewalls.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  Made with ❤️ by <strong>Nishant</strong>
</p>
<p align="center">
  <em>Terminal interface established. Connection secure.</em>
</p>
