// js/main.js - Unified Safe Version

// --- PAGE NAVIGATION ---
async function switchPage(targetPageId) {
    console.log("🔄 Switching to page:", targetPageId);
    
    // ซ่อนทุกหน้า (ที่มีอยู่ในไฟล์ HTML นั้นๆ)
    document.querySelectorAll('.page-view').forEach(page => { 
        page.classList.add('hidden'); 
    });
    
    // แสดงหน้าเป้าหมาย
    const targetPage = document.getElementById(targetPageId);
    if (targetPage) { 
        targetPage.classList.remove('hidden'); 
    } else {
        console.warn(`Page ID '${targetPageId}' not found in this HTML file.`);
        return;
    }

    // จัดการปุ่มเมนู Active
    document.querySelectorAll('.nav-button').forEach(btn => {
        btn.classList.remove('active');
        if(btn.dataset.target === targetPageId) { 
            btn.classList.add('active'); 
        }
    });

    // Logic โหลดข้อมูล (เรียกเมื่อหน้านั้นมีอยู่จริง)
    if (targetPageId === 'dashboard-page' && typeof fetchUserRequests === 'function') {
        await fetchUserRequests(); 
    }
    
    if (targetPageId === 'command-generation-page' && typeof fetchAllRequestsForCommand === 'function') { 
        // Admin Logic
        const tab = document.getElementById('admin-view-requests-tab');
        if(tab) tab.click(); 
    }

    if (targetPageId === 'admin-users-page' && typeof fetchAllUsers === 'function') {
        await fetchAllUsers();
    }
}

// --- EVENT LISTENERS (SAFE MODE) ---
function setupEventListeners() {
    // 1. Auth & Common
    document.getElementById('login-form')?.addEventListener('submit', handleLogin);
    document.getElementById('logout-button')?.addEventListener('click', handleLogout);
    
    // Modals Close Buttons (ใช้ class หรือ id ที่มี ?)
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.target.closest('.modal').style.display = 'none';
        });
    });
    document.getElementById('alert-modal-ok-button')?.addEventListener('click', () => {
        document.getElementById('alert-modal').style.display = 'none';
    });

    // 2. User Specific
    document.getElementById('request-form')?.addEventListener('submit', handleRequestFormSubmit);
    document.getElementById('show-register-modal-button')?.addEventListener('click', () => {
        document.getElementById('register-modal').style.display = 'flex';
    });

    // 3. Admin Specific (ใส่ ? ไว้กัน Error ในหน้า User)
    document.getElementById('admin-generate-command-button')?.addEventListener('click', handleAdminGenerateCommand);
    
    document.getElementById('admin-view-requests-tab')?.addEventListener('click', (e) => {
        document.getElementById('admin-view-memos-tab')?.classList.remove('border-b-2', 'border-indigo-600', 'text-indigo-600', 'font-bold');
        e.target.classList.add('border-b-2', 'border-indigo-600', 'text-indigo-600', 'font-bold');
        document.getElementById('admin-requests-view').classList.remove('hidden');
        document.getElementById('admin-memos-view').classList.add('hidden');
        fetchAllRequestsForCommand();
    });

    document.getElementById('admin-view-memos-tab')?.addEventListener('click', (e) => {
        document.getElementById('admin-view-requests-tab')?.classList.remove('border-b-2', 'border-indigo-600', 'text-indigo-600', 'font-bold');
        e.target.classList.add('border-b-2', 'border-indigo-600', 'text-indigo-600', 'font-bold');
        document.getElementById('admin-memos-view').classList.remove('hidden');
        document.getElementById('admin-requests-view').classList.add('hidden');
        fetchAllMemos();
    });
    
    document.getElementById('admin-sync-btn')?.addEventListener('click', async () => {
        if(!confirm('ยืนยันการ Sync ข้อมูล?')) return;
        toggleLoader('admin-sync-btn', true);
        try {
            await syncAllDataFromSheetToFirebase(); // ต้องมีใน firebaseService.js
            alert('Sync เสร็จสิ้น');
            location.reload();
        } catch(e) { alert(e.message); } 
        finally { toggleLoader('admin-sync-btn', false); }
    });

    // 4. Navigation Links
    document.body.addEventListener('click', async (e) => {
        // ใช้ Event Delegation สำหรับปุ่ม Nav
        const navButton = e.target.closest('.nav-button');
        if (navButton && navButton.dataset.target) { 
            await switchPage(navButton.dataset.target); 
        }
    });
}

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('App Initializing...');
    
    // ฟังก์ชันเช็ค Server Status (ถ้ามี)
    if(typeof checkPDFServerStatus === 'function') checkPDFServerStatus();

    setupEventListeners();

    // เช็ค User Session
    const userStr = sessionStorage.getItem('currentUser');
    if (userStr) {
        const user = JSON.parse(userStr);
        initializeUserSession(user);
    } else {
        // ถ้าไม่มี Session และอยู่ในหน้า Login (index.html) ก็ไม่ต้องทำอะไร
        // แต่ถ้าอยู่ใน admin.html จะถูก admin-guard ดีดออกไปเอง
    }
});

// Helper: Toggle Loader
function toggleLoader(elementId, isLoading) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    if (isLoading) {
        el.dataset.originalText = el.innerHTML;
        el.innerHTML = '<span class="loader-spinner"></span> กำลังทำงาน...';
        el.disabled = true;
        el.classList.add('opacity-75', 'cursor-not-allowed');
    } else {
        el.innerHTML = el.dataset.originalText || 'ตกลง';
        el.disabled = false;
        el.classList.remove('opacity-75', 'cursor-not-allowed');
    }
}

// Helper: Initialize Session UI
function initializeUserSession(user) {
    window.currentUser = user;
    
    // ซ่อน Login, แสดง App Content
    const loginScreen = document.getElementById('login-screen');
    const appContent = document.getElementById('app-content');
    
    if (loginScreen) loginScreen.classList.add('hidden');
    if (appContent) appContent.classList.remove('hidden');

    // แสดงชื่อ
    const userDisplay = document.getElementById('user-display');
    if (userDisplay) {
        userDisplay.innerHTML = `
            <div class="flex flex-col text-right">
                <span class="font-bold">${user.fullName || user.username}</span>
                <span class="text-xs opacity-75">${user.position || 'User'}</span>
            </div>
        `;
    }
}

function handleLogout() {
    sessionStorage.removeItem('currentUser');
    window.location.href = 'index.html';
}