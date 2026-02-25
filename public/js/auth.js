// ===== AUTH MODULE =====
const API_URL = window.location.origin;

function getToken() {
    return localStorage.getItem('toado_token');
}

function getUser() {
    const u = localStorage.getItem('toado_user');
    return u ? JSON.parse(u) : null;
}

function setAuth(token, user) {
    localStorage.setItem('toado_token', token);
    localStorage.setItem('toado_user', JSON.stringify(user));
}

function clearAuth() {
    localStorage.removeItem('toado_token');
    localStorage.removeItem('toado_user');
}

function authHeaders() {
    return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' };
}

async function apiCall(endpoint, options = {}) {
    const res = await fetch(API_URL + endpoint, {
        ...options,
        headers: { ...authHeaders(), ...options.headers }
    });
    if (res.status === 401) {
        clearAuth();
        window.location.href = '/';
        return null;
    }
    return res;
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Login form
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        // Check if already logged in
        const user = getUser();
        const token = getToken();
        if (user && token) {
            redirectUser(user);
            return;
        }

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value;
            const loginBtn = document.getElementById('loginBtn');
            const loginError = document.getElementById('loginError');

            loginBtn.disabled = true;
            loginBtn.innerHTML = '<span class="loading-spinner"></span> Đang đăng nhập...';
            loginError.style.display = 'none';

            try {
                const res = await fetch(API_URL + '/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });
                const data = await res.json();
                if (!res.ok) {
                    loginError.textContent = data.error || 'Đăng nhập thất bại';
                    loginError.style.display = 'block';
                    loginBtn.disabled = false;
                    loginBtn.textContent = 'Đăng nhập';
                    return;
                }
                setAuth(data.token, data.user);
                redirectUser(data.user);
            } catch (err) {
                loginError.textContent = 'Không thể kết nối đến server';
                loginError.style.display = 'block';
                loginBtn.disabled = false;
                loginBtn.textContent = 'Đăng nhập';
            }
        });
    }
});

function redirectUser(user) {
    if (user.role === 'admin') {
        window.location.href = '/admin.html';
    } else {
        window.location.href = '/ctv.html';
    }
}
