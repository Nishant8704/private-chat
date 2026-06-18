import os

class Config:
    """Application configuration settings."""
    SECRET_KEY = os.environ.get('SECRET_KEY', 'your-secret-key-change-in-production-2024')
    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    DATABASE = os.path.join(BASE_DIR, 'database', 'chat.db')
    UPLOAD_FOLDER = os.path.join(BASE_DIR, 'static', 'uploads', 'profile_pics')
    MAX_CONTENT_LENGTH = 2 * 1024 * 1024  # 2MB max upload
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
    ALLOWED_USERS = ['Nishant', 'Friend']
