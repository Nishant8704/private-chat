"""
init_db.py - Database initialization and seeding script.

Run this script to create the SQLite database, tables, and seed
the two allowed users (Nishant and Friend) with default passwords.

Usage:
    python database/init_db.py
"""

import sys
import os

# Ensure UTF-8 output on Windows (cp1252 can't handle emoji)
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# Add parent directory to path so we can import from project root
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from werkzeug.security import generate_password_hash
from config import Config
import models


def seed_users():
    """
    Seed the database with the two allowed users if they don't already exist.

    Default credentials:
        - Nishant / nishant123
        - Friend  / friend123
    """
    users = [
        ('Nishant', 'nishant123'),
        ('Friend', 'friend123'),
    ]

    conn = models.get_db()
    for username, password in users:
        # Check if user already exists to avoid duplicate errors
        existing = conn.execute(
            'SELECT id FROM users WHERE username = ?', (username,)
        ).fetchone()

        if existing is None:
            password_hash = generate_password_hash(password)
            conn.execute(
                'INSERT INTO users (username, password_hash) VALUES (?, ?)',
                (username, password_hash)
            )
            print(f"  ✓ Created user: {username}")
        else:
            print(f"  • User already exists: {username}")

    conn.commit()
    conn.close()


def create_directories():
    """Create required directories for file uploads and database storage."""
    dirs = [
        os.path.dirname(Config.DATABASE),       # database/
        Config.UPLOAD_FOLDER,                     # static/uploads/profile_pics/
    ]
    for d in dirs:
        os.makedirs(d, exist_ok=True)
        print(f"  ✓ Directory ready: {d}")


def main():
    print("\n🔧 Initializing Private Chat Database...")
    print("-" * 45)

    # Step 1: Create directories
    print("\n📁 Creating directories:")
    create_directories()

    # Step 2: Initialize database tables
    print("\n📊 Creating database tables:")
    models.init_db()
    print(f"  ✓ Database created at: {Config.DATABASE}")

    # Step 3: Seed users
    print("\n👤 Seeding users:")
    seed_users()

    print("\n" + "-" * 45)
    print("✅ Database initialization complete!")
    print("\n📋 Default credentials:")
    print("   Nishant  →  nishant123")
    print("   Friend   →  friend123")
    print("\n⚠️  Change these passwords for production use.\n")


if __name__ == '__main__':
    main()
