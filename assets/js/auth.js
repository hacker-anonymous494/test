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

    if (this.isAuthenticated() && this.userData) {
      authButtons.style.display = 'none';
      const userProfile = document.getElementById('user-profile');
      if (userProfile) userProfile.style.display = 'block';
    } else {
      authButtons.style.display = 'flex';
      const userProfile = document.getElementById('user-profile');
      if (userProfile) userProfile.style.display = 'none';
      authButtons.innerHTML = `
        <a href="pages/login.html" class="btn btn-outline"><i class="fas fa-sign-in-alt"></i> Kyçu</a>
        <a href="pages/register.html" class="btn btn-primary"><i class="fas fa-user-plus"></i> Regjistrohu</a>
      `;
    }
  }
}

window.authManager = new AuthManager();

document.addEventListener('DOMContentLoaded', () => {
  window.authManager.checkAuth();
});