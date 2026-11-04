import os
import secrets
from pathlib import Path
from datetime import timedelta

# Build paths inside the project like this: BASE_DIR / 'subdir'.
BASE_DIR = Path(__file__).resolve().parent.parent


def _load_env_file(path):
    """Read simple KEY=VALUE lines into os.environ without overriding real env vars."""
    if not path.is_file():
        return
    for line in path.read_text(encoding='utf-8').splitlines():
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


for _env_file in (BASE_DIR / '.env', BASE_DIR.parent / '.env'):
    _load_env_file(_env_file)


def _env_bool(name, default):
    return os.environ.get(name, str(default)).strip().lower() in ('1', 'true', 'yes', 'on')


def _env_list(name, default):
    return [item.strip() for item in os.environ.get(name, default).split(',') if item.strip()]


def _secret_key():
    """Use DJANGO_SECRET_KEY, else a random key kept in backend/.secret_key (gitignored)."""
    key = os.environ.get('DJANGO_SECRET_KEY', '').strip()
    if key:
        return key
    key_file = BASE_DIR / '.secret_key'
    if key_file.is_file():
        return key_file.read_text(encoding='utf-8').strip()
    key = secrets.token_urlsafe(64)
    key_file.write_text(key, encoding='utf-8')
    return key


# See https://docs.djangoproject.com/en/6.0/howto/deployment/checklist/
# All of these can be set in the project's .env file (see .env.example).
SECRET_KEY = _secret_key()

DEBUG = _env_bool('DJANGO_DEBUG', False)

ALLOWED_HOSTS = _env_list('DJANGO_ALLOWED_HOSTS', '*')

# Open sign-up; set to false once every WG member has an account.
ALLOW_REGISTRATION = _env_bool('DJANGO_ALLOW_REGISTRATION', True)


# Application definition

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',

    # Eigene Apps
    'users',
    'features'
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    # Secure by default: views that should be public say so with AllowAny.
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    # Only views with a `throttle_scope` are limited (login, sign-up, e-mail check).
    'DEFAULT_THROTTLE_CLASSES': (
        'rest_framework.throttling.ScopedRateThrottle',
    ),
    'DEFAULT_THROTTLE_RATES': {
        'login': os.environ.get('DJANGO_LOGIN_RATE', '10/min'),
        'auth': os.environ.get('DJANGO_AUTH_RATE', '30/min'),
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=10),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),

    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,

    "AUTH_HEADER_TYPES": ("Bearer",),
}

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

# The built frontend is served from the same origin as /api, so CORS is only
# needed for the Angular dev server.
CORS_ALLOWED_ORIGINS = _env_list(
    'DJANGO_CORS_ALLOWED_ORIGINS', 'http://localhost:4200,http://127.0.0.1:4200'
)

ROOT_URLCONF = 'backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'backend.wsgi.application'


# Database
# https://docs.djangoproject.com/en/6.0/ref/settings/#databases

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}


# Password validation
# https://docs.djangoproject.com/en/6.0/ref/settings/#auth-password-validators

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]


# Internationalization
# https://docs.djangoproject.com/en/6.0/topics/i18n/

LANGUAGE_CODE = 'de'

TIME_ZONE = 'Europe/Berlin'

USE_I18N = True

USE_TZ = True

AUTH_USER_MODEL = 'users.User'

# Static files (CSS, JavaScript, Images)
# https://docs.djangoproject.com/en/6.0/howto/static-files/

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# Only add the project-level static folder when it exists (avoids staticfiles.W004).
STATICFILES_DIRS = [path for path in [BASE_DIR / 'static'] if path.is_dir()]
