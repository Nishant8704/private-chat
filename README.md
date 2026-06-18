# 🔒 Private Chat

### A secure, real-time chat application for two users

> A beautifully designed, fully functional private chat website built for exactly **two users** — **Nishant** & **Friend**. Powered by Flask and WebSockets, it delivers a seamless real-time messaging experience with a sleek dark UI inspired by WhatsApp and Telegram.

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
| 🟢 **Online/Offline Status** | See when the other user is online or offline |
| ⌨️ **Typing Indicators** | Know when the other person is typing |
| ✅ **Read Receipts** | Blue ticks (✓✓) when messages are read |
| 🗑️ **Message Deletion** | Delete messages for everyone in the chat |
| 😊 **Emoji Picker** | Built-in emoji picker for expressive conversations |
| 🔍 **Message Search** | Search through your chat history instantly |
| 🖼️ **Profile Picture Upload** | Upload and display custom profile pictures |
| 💾 **Chat History Persistence** | All messages stored in SQLite — never lose a conversation |
| 📱 **Responsive Design** | Works beautifully on mobile, tablet, and desktop |
| 🌙 **Dark Modern UI** | Sleek dark theme inspired by WhatsApp & Telegram |
| 🔐 **Session-based Auth** | Secure login with session management |
| 🔑 **Password Hashing** | Passwords stored securely using Werkzeug hashing |

---

## 🛠️ Tech Stack

| Component | Technology |
|-----------|------------|
| **Backend** | Python Flask |
| **Real-time** | Flask-SocketIO |
| **Database** | SQLite |
| **Frontend** | HTML, CSS, JavaScript |
| **Authentication** | Werkzeug password hashing |
| **Server** | Eventlet (async) |

---

## 📁 Project Structure

```
Chatting App/
│
├── app.py                     # Main Flask application & SocketIO events
├── config.py                  # App configuration (secret key, allowed users)
├── requirements.txt           # Python dependencies
├── render.yaml                # Render deployment blueprint
├── README.md                  # You are here!
│
├── database/
│   ├── init_db.py             # Database initialization & default user creation
│   └── chat.db                # SQLite database (auto-generated)
│
├── static/
│   ├── css/
│   │   └── style.css          # Dark theme styles & responsive layout
│   ├── js/
│   │   └── chat.js            # Client-side chat logic & SocketIO handlers
│   └── uploads/
│       └── profile_pics/      # User-uploaded profile pictures
│
└── templates/
    ├── login.html             # Login page template
    └── chat.html              # Main chat interface template
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

# 5. Initialize the database (creates tables & default users)
python database/init_db.py

# 6. Run the application
python app.py

# 7. Open in your browser
# http://localhost:5000
```

> [!TIP]
> To access from another device on the same network, use `http://<your-local-ip>:5000`

---

## 🔑 Default Credentials

| User | Username | Password |
|------|----------|----------|
| 👤 User 1 | `Nishant` | `nishant123` |
| 👤 User 2 | `Friend` | `friend123` |

> [!WARNING]
> **Change these passwords before deploying to production!**
> Modify the credentials in `database/init_db.py` and re-run the initialization script.

---

## 💬 Usage

1. **Open two browser tabs** (or use two different devices on the same network)
2. **Login as `Nishant`** in one tab
3. **Login as `Friend`** in the other tab
4. **Start chatting!** 🎉

### Network Access

To chat across devices on the same Wi-Fi network:

```
http://<your-local-ip>:5000
```

Find your local IP:
- **Windows:** `ipconfig` → Look for IPv4 Address
- **macOS/Linux:** `ifconfig` or `ip addr`

---

## ☁️ Deployment on Render (Free Hosting)

Deploy your private chat app to the cloud for free using [Render](https://render.com).

### Step-by-step Guide

1. **Push your code to GitHub**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/private-chat.git
   git push -u origin main
   ```

2. **Go to [render.com](https://render.com)** → Sign up / Log in

3. **Create a New Web Service** → Connect your GitHub repository

4. **Configure the service:**

   | Setting | Value |
   |---------|-------|
   | **Name** | `private-chat` (or any name you like) |
   | **Region** | Choose the closest to you |
   | **Branch** | `main` |
   | **Runtime** | `Python 3` |
   | **Build Command** | `pip install -r requirements.txt && python database/init_db.py` |
   | **Start Command** | `gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:$PORT app:app` |

5. **Add Environment Variable:**

   | Key | Value |
   |-----|-------|
   | `SECRET_KEY` | *(Generate a random string)* |

6. **Click "Deploy"** and wait for the build to complete 🚀

> [!NOTE]
> Render's free tier spins down after inactivity. The first load may take **~30 seconds** to wake up.

> [!IMPORTANT]
> SQLite on Render is **ephemeral** — data resets on every redeploy. For persistent data, consider upgrading to Render's PostgreSQL add-on or using an external database service.

### Render Blueprint (`render.yaml`)

For one-click deployment, include this `render.yaml` in your project root:

```yaml
services:
  - type: web
    name: private-chat
    runtime: python
    buildCommand: pip install -r requirements.txt && python database/init_db.py
    startCommand: gunicorn --worker-class eventlet -w 1 --bind 0.0.0.0:$PORT app:app
    envVars:
      - key: SECRET_KEY
        generateValue: true
      - key: PYTHON_VERSION
        value: 3.11.0
```

---

## 🔒 Security Notes

| Aspect | Implementation |
|--------|---------------|
| **Password Storage** | Hashed using Werkzeug (bcrypt-based) — never stored in plain text |
| **User Restriction** | Only two hardcoded users are allowed to register/login |
| **Route Protection** | Session-based authentication protects all chat routes |
| **XSS Prevention** | User input is sanitized to prevent cross-site scripting attacks |
| **Secret Key** | Flask `SECRET_KEY` secures session cookies |

> [!CAUTION]
> Always change the default `SECRET_KEY` before deploying to production. Use a strong, randomly generated string.

---

## 🎨 Customization

### Change Passwords
Edit `database/init_db.py`, update the password values, and re-run:
```bash
python database/init_db.py
```

### Change Usernames
1. Edit `config.py` → Update the `ALLOWED_USERS` list
2. Edit `database/init_db.py` → Update the user creation entries
3. Re-run the init script

### Change Theme Colors
Edit `static/css/style.css` and modify the CSS custom properties (variables) at the top of the file:
```css
:root {
    --primary-color: #00a884;      /* Accent / send button */
    --bg-primary: #111b21;         /* Main background */
    --bg-secondary: #202c33;       /* Sidebar / header */
    --bg-chat: #0b141a;            /* Chat area background */
    /* ... more variables */
}
```

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2026

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 🙏 Acknowledgments

- [**Flask**](https://flask.palletsprojects.com/) & [**Flask-SocketIO**](https://flask-socketio.readthedocs.io/) — for making real-time Python web apps possible
- [**WhatsApp**](https://web.whatsapp.com/) & [**Telegram**](https://web.telegram.org/) — for UI/UX design inspiration
- [**Eventlet**](https://eventlet.net/) — for async networking support
- [**SQLite**](https://www.sqlite.org/) — for lightweight, serverless database storage

---

<p align="center">
  Made with ❤️ by <strong>Nishant</strong>
</p>

<p align="center">
  <em>Built for private conversations. Just you and your friend.</em>
</p>
