async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    if (!username || !password) {
        showAlert('ผิดพลาด', 'กรุณากรอกชื่อผู้ใช้และรหัสผ่าน');
        return;
    }

    toggleLoader('login-button', true);
    document.getElementById('login-error').classList.add('hidden');
    
    try {
        const result = await apiCall('POST', 'verifyCredentials', { username, password });
        if (result.status === 'success') {
            sessionStorage.setItem('currentUser', JSON.stringify(result.user));
            window.currentUser = result.user;
            initializeUserSession(result.user);
            showMainApp();
            await switchPage('dashboard-page');
            await fetchUserRequests();
            showAlert('สำเร็จ', 'เข้าสู่ระบบสำเร็จ');
        } else {
            document.getElementById('login-error').textContent = result.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง';
            document.getElementById('login-error').classList.remove('hidden');
        }
    } catch (error) {
        document.getElementById('login-error').textContent = 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ: ' + error.message;
        document.getElementById('login-error').classList.remove('hidden');
    } finally {
        toggleLoader('login-button', false);
    }
}

async function handleForgotPassword(e) {
    e.preventDefault();
    const email = document.getElementById('forgot-password-email').value.trim();
    if (!email) {
        showAlert('ผิดพลาด', 'กรุณากรอกอีเมลที่ลงทะเบียนไว้');
        return;
    }
    toggleLoader('forgot-password-submit-button', true);
    try {
        const result = await apiCall('POST', 'forgotPassword', { email });
        if (result.status === 'success') {
            showAlert('สำเร็จ', 'ส่งลิงก์รีเซ็ตรหัสผ่านไปยังอีเมลของคุณแล้ว');
            document.getElementById('forgot-password-modal').style.display = 'none';
            document.getElementById('forgot-password-form').reset();
        } else {
            showAlert('ผิดพลาด', result.message);
        }
    } catch (error) {
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาด: ' + error.message);
    } finally {
        toggleLoader('forgot-password-submit-button', false);
    }
}

function handleLogout() {
    document.getElementById('nav-edit').classList.add('hidden');
    document.getElementById('edit-page').classList.add('hidden');
    sessionStorage.removeItem('currentUser');
    sessionStorage.removeItem('currentEditRequestId');
    window.currentUser = null;
    showLoginScreen();
    document.getElementById('login-form').reset();
}

async function handleRegister(e) {
    e.preventDefault();
    const formData = {
        username: document.getElementById('register-username').value.trim(),
        password: document.getElementById('register-password').value,
        fullName: document.getElementById('register-fullname').value.trim(),
        position: document.getElementById('register-position').value.trim(),
        department: document.getElementById('register-department').value.trim(),
        email: document.getElementById('register-email').value.trim(),
        role: 'user'
    };
    if (!formData.username || !formData.password || !formData.fullName) {
        showAlert('ผิดพลาด', 'กรุณากรอกข้อมูลให้ครบถ้วน');
        return;
    }
    toggleLoader('register-submit-button', true);
    try {
        const result = await apiCall('POST', 'registerUser', formData);
        if (result.status === 'success') {
            showAlert('สำเร็จ', 'ลงทะเบียนสำเร็จ! กรุณาเข้าสู่ระบบ');
            document.getElementById('register-modal').style.display = 'none';
            document.getElementById('register-form').reset();
        } else {
            showAlert('ผิดพลาด', result.message);
        }
    } catch (error) {
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการลงทะเบียน: ' + error.message);
    } finally {
        toggleLoader('register-submit-button', false);
    }
}

function initializeUserSession(user) {
    updateUIForUser(user);
    showMainApp();
    switchPage('dashboard-page');
}

function updateUIForUser(user) {
    document.getElementById('user-fullname').textContent = user.fullName || 'N/A';
    document.getElementById('user-position').textContent = user.position || 'N/A';
    const isAdmin = user.role === 'admin';
    document.getElementById('admin-nav-command').classList.toggle('hidden', !isAdmin);
    document.getElementById('admin-nav-users').classList.toggle('hidden', !isAdmin);
}

function showMainApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
}

function showLoginScreen() {
    resetEditPage();
    document.querySelectorAll('.page-view').forEach(page => page.classList.add('hidden'));
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
    document.querySelectorAll('.nav-button').forEach(btn => btn.classList.remove('active'));
    document.getElementById('user-nav-dashboard').classList.add('active');
    sessionStorage.removeItem('currentUser');
}

async function handleProfileUpdate(e) {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) return;
    const formData = {
        username: user.username,
        loginName: document.getElementById('profile-loginname').value.trim(),
        fullName: document.getElementById('profile-fullname').value,
        position: document.getElementById('profile-position').value,
        department: document.getElementById('profile-department').value,
        email: document.getElementById('profile-email').value
    };
    toggleLoader('profile-submit-button', true);
    try {
        const result = await apiCall('POST', 'updateUserProfile', formData);
        if (result.status === 'success') {
            const updatedUser = { ...user, ...formData };
            sessionStorage.setItem('currentUser', JSON.stringify(updatedUser));
            updateUIForUser(updatedUser);
            showAlert('สำเร็จ', 'อัปเดตข้อมูลส่วนตัวสำเร็จ');
        } else {
            showAlert('ผิดพลาด', result.message);
        }
    } catch (error) {
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการอัปเดตข้อมูล: ' + error.message);
    } finally {
        toggleLoader('profile-submit-button', false);
    }
}

async function handlePasswordUpdate(e) {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) return;
    const formData = {
        username: user.username,
        oldPassword: document.getElementById('current-password').value,
        newPassword: document.getElementById('new-password').value
    };
    toggleLoader('password-submit-button', true);
    try {
        const result = await apiCall('POST', 'updatePassword', formData);
        if (result.status === 'success') {
            showAlert('สำเร็จ', 'เปลี่ยนรหัสผ่านสำเร็จ');
            document.getElementById('password-form').reset();
        } else {
            showAlert('ผิดพลาด', result.message);
        }
    } catch (error) {
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน: ' + error.message);
    } finally {
        toggleLoader('password-submit-button', false);
    }
}
