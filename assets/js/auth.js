// assets/js/auth.js - Cookie-based authentication (no token in localStorage)
class AuthManager {
  constructor() {
    this.apiBase = '/.netlify/functions';
    this.isLoggedIn = false;
    this.userData = null;
  }

  async checkAuth() {
    try {
      const response = await fetch(`${this.apiBase}/auth/validate-session`, {
        method: 'GET',
        credentials: 'include'
      });
      const data = await response.json();
      if (data.authenticated) {
        this.isLoggedIn = true;
        this.userData = data.user;
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userData', JSON.stringify(data.user));
      } else {
        this.clearLocalData();
      }
      this.updateAuthUI();   // <--- ALWAYS call this
      return data.authenticated ? data : null;
    } catch (error) {
      console.error('Auth check failed:', error);
      this.clearLocalData();
      this.updateAuthUI();   // <--- ALSO here
      return null;
    }
  }

  async login(email, password, rememberMe = false) {
    try {
      const response = await fetch(`${this.apiBase}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe }),
        credentials: 'include'
      });
      const data = await response.json();
      if (response.ok && data.success) {
        this.isLoggedIn = true;
        this.userData = data.user;
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userData', JSON.stringify(data.user));
        this.updateAuthUI();
        return { success: true, user: data.user };
      } else {
        this.updateAuthUI();
        return { success: false, error: data.error || 'Login failed' };
      }
    } catch (error) {
      console.error('Login error:', error);
      this.updateAuthUI();
      return { success: false, error: 'Network error' };
    }
  }

  async register(userData) {
    try {
      const response = await fetch(`${this.apiBase}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
        credentials: 'include'
      });
      const data = await response.json();
      if (response.ok && data.success) {
        this.isLoggedIn = true;
        this.userData = data.user;
        localStorage.setItem('isLoggedIn', 'true');
        localStorage.setItem('userData', JSON.stringify(data.user));
        this.updateAuthUI();
        return { success: true, user: data.user };
      } else {
        this.updateAuthUI();
        return { success: false, error: data.error || 'Registration failed' };
      }
    } catch (error) {
      console.error('Registration error:', error);
      this.updateAuthUI();
      return { success: false, error: 'Network error' };
    }
  }

  async logout() {
    try {
      await fetch(`${this.apiBase}/auth/logout`, {
        method: 'POST',
        credentials: 'include'
      });
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      this.clearLocalData();
      this.updateAuthUI();
      window.location.href = '/index.html';
    }
  }

  getUserType() {
    return this.userData?.userType || null;
  }

  clearLocalData() {
    this.isLoggedIn = false;
    this.userData = null;
    localStorage.removeItem('isLoggedIn');
    localStorage.removeItem('userData');
  }

  getCurrentUser() {
    if (this.userData) return this.userData;
    const stored = localStorage.getItem('userData');
    if (stored) {
      try {
        this.userData = JSON.parse(stored);
        this.isLoggedIn = true;
        return this.userData;
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  isAuthenticated() {
    return this.isLoggedIn || localStorage.getItem('isLoggedIn') === 'true';
  }

  updateAuthUI() {
    const authButtons = document.getElementById('auth-buttons');
    if (!authButtons) return;

    const pagePrefix = window.location.pathname.startsWith('/pages/') ? '' : 'pages/';

    if (this.isAuthenticated() && this.userData) {
      authButtons.style.display = 'flex';
      authButtons.innerHTML = `
        <div class="user-dropdown">
          <button class="user-profile-btn" id="user-profile-btn">
            <i class="fas fa-user-circle"></i>
            <span>${this.userData.firstName || this.userData.email?.split('@')[0] || 'User'}</span>
            <i class="fas fa-chevron-down"></i>
          </button>
          <div class="dropdown-menu" id="user-dropdown-menu">
            <a href="${pagePrefix}profile.html"><i class="fas fa-user"></i> Profili</a>
            <a href="${pagePrefix}saved-routes.html"><i class="fas fa-bookmark"></i> Rruget e Ruajtura</a>
            <div class="divider"></div>
            <a href="#" id="logout-link"><i class="fas fa-sign-out-alt"></i> Dil</a>
          </div>
        </div>
      `;

      const logoutLink = document.getElementById('logout-link');
      if (logoutLink) logoutLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.logout();
      });

      const profileBtn = document.getElementById('user-profile-btn');
      const dropdownMenu = document.getElementById('user-dropdown-menu');
      if (profileBtn && dropdownMenu) {
        profileBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          dropdownMenu.classList.toggle('show');
        });
        document.addEventListener('click', () => {
          dropdownMenu.classList.remove('show');
        });
      }
    } else {
      authButtons.style.display = 'flex';
      authButtons.innerHTML = `
        <a href="${pagePrefix}login.html" class="btn btn-outline"><i class="fas fa-sign-in-alt"></i> Kyçu</a>
        <a href="${pagePrefix}register.html" class="btn btn-primary"><i class="fas fa-user-plus"></i> Regjistrohu</a>
      `;
    }
  }
}

window.authManager = new AuthManager();

document.addEventListener('DOMContentLoaded', () => {
  window.authManager.checkAuth();
});