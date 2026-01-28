// --- PAGE NAVIGATION & EVENT LISTENERS ---

// --- ไฟล์ main.js ---

async function switchPage(targetPageId) {
    console.log("🔄 Switching to page:", targetPageId);
    
    // ซ่อนทุกหน้า
    document.querySelectorAll('.page-view').forEach(page => { page.classList.add('hidden'); });
    
    // แสดงหน้าเป้าหมาย
    const targetPage = document.getElementById(targetPageId);
    if (targetPage) { targetPage.classList.remove('hidden'); }

    // จัดการปุ่มเมนู (Active State)
    document.querySelectorAll('.nav-button').forEach(btn => {
        btn.classList.remove('active');
        if(btn.dataset.target === targetPageId) { btn.classList.add('active'); }
    });

    // Logic เฉพาะของแต่ละหน้า
    if (targetPageId === 'edit-page') { 
        setTimeout(() => { setupEditPageEventListeners(); }, 100); 
    }
    
    if (targetPageId === 'dashboard-page') {
        await fetchUserRequests(); // ดึงข้อมูล (Hybrid)
        
        // ★★★ เพิ่มส่วนนี้: เรียกแสดง Pop-up แจ้งเตือน ★★★
        showReminderModal();
    }
    
   if (targetPageId === 'form-page') { 
        await resetRequestForm(); 
        setTimeout(() => { 
            tryAutoFillRequester(); 
            // 🔥 เรียกฟังก์ชันตั้งค่าลายเซ็นหลังจากหน้าจอแสดงผลแล้ว 200ms
            if (typeof initSignaturePad === 'function') {
                initSignaturePad();
                if (window.resizeSignatureCanvas) window.resizeSignatureCanvas();
            }
        }, 200); 
    }
    
    if (targetPageId === 'profile-page') {
        if (typeof loadProfileData === 'function') loadProfileData();
    }
    
    if (targetPageId === 'stats-page') {
        if (typeof loadStatsData === 'function') await loadStatsData(); 
    }
    
    if (targetPageId === 'admin-users-page') {
        if (typeof fetchAllUsers === 'function') await fetchAllUsers();
    }
    
    if (targetPageId === 'command-generation-page') { 
        const tab = document.getElementById('admin-view-requests-tab');
        if(tab) tab.click(); 
    }
    if (targetPageId === 'vehicle-page') {
    const user = getCurrentUser();
    if(user) {
        document.getElementById('vh-name').value = user.fullName || '';
        document.getElementById('vh-position').value = user.position || '';
    }
}
}

// [แก้ไข] ระบบแจ้งเตือนรายการค้างส่ง พร้อมระบบนำทางอัตโนมัติ
async function showReminderModal() {
    // 1. ตรวจสอบว่ามีรายการค้างส่งจริงหรือไม่
    const requests = allRequestsCache || [];
    const memos = userMemosCache || [];
    
    const pendingItems = requests.filter(req => {
        const hasCreated = req.pdfUrl && req.pdfUrl !== '';
        const relatedMemo = memos.find(m => m.refNumber === req.id);
        const isCompleted = relatedMemo && (relatedMemo.status === 'เสร็จสิ้น' || relatedMemo.status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน');
        const isFixing = relatedMemo && relatedMemo.status === 'นำกลับไปแก้ไข';
        return hasCreated && (!isCompleted || isFixing);
    });

    // ถ้าไม่มีรายการค้างส่ง ไม่ต้องโชว์ Modal
    if (pendingItems.length === 0) return;

    // 2. แสดง Modal แจ้งเตือน
    const modal = document.getElementById('reminder-modal');
    if (modal) {
        modal.style.display = 'flex';
        
        const closeBtn = document.getElementById('close-reminder-modal');
        // เปลี่ยนข้อความปุ่มให้ชัดเจน
        closeBtn.innerHTML = `🔔 ไปที่รายการค้างส่ง (${pendingItems.length} รายการ)`;
        
        const newBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newBtn, closeBtn);
        
        newBtn.addEventListener('click', function() {
            modal.style.display = 'none';
            // บันทึกว่าแสดงแล้วในรอบนี้ (Session)
            sessionStorage.setItem('loginReminderShown', 'true'); 
            
            // 3. นำทางไปหน้าส่งงานทันที
            // เปิด Dropdown แจ้งเตือนเพื่อให้ผู้ใช้เลือกส่งไฟล์ได้ทันที
            const notifDropdown = document.getElementById('notification-dropdown');
            if (notifDropdown) {
                notifDropdown.classList.remove('hidden');
                // Scroll ไปที่ส่วนบนสุดของหน้าจอเพื่อความชัดเจน
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        });
    }
}

function setupVehicleOptions() {
    // จัดการ Checkbox ยานพาหนะ (หน้าสร้าง)
    document.querySelectorAll('input[name="vehicle_option"].vehicle-checkbox').forEach(checkbox => { 
        checkbox.addEventListener('change', toggleVehicleDetails); 
    });
    // จัดการ Checkbox ยานพาหนะ (หน้าแก้ไข)
    document.querySelectorAll('input[name="edit-vehicle_option"].vehicle-checkbox').forEach(checkbox => { 
        checkbox.addEventListener('change', toggleEditVehicleDetails); 
    });
}

function setupEventListeners() {
    // --- Auth & User Management ---
    const loginForm = document.getElementById('login-form');
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    
    const logoutBtn = document.getElementById('logout-button');
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    
    const showRegBtn = document.getElementById('show-register-modal-button');
    if (showRegBtn) showRegBtn.addEventListener('click', () => document.getElementById('register-modal').style.display = 'flex');
    
    const regForm = document.getElementById('register-form');
    if (regForm) regForm.addEventListener('submit', handleRegister);
    
    const forgotPwdBtn = document.getElementById('show-forgot-password-modal');
    if (forgotPwdBtn) forgotPwdBtn.addEventListener('click', () => { document.getElementById('forgot-password-modal').style.display = 'flex'; });
    
    document.getElementById('forgot-password-modal-close-button')?.addEventListener('click', () => { document.getElementById('forgot-password-modal').style.display = 'none'; });
    document.getElementById('forgot-password-cancel-button')?.addEventListener('click', () => { document.getElementById('forgot-password-modal').style.display = 'none'; });
    document.getElementById('forgot-password-form')?.addEventListener('submit', handleForgotPassword);
    
    // --- Modals (General) ---
    document.getElementById('public-attendee-modal-close-button')?.addEventListener('click', () => { document.getElementById('public-attendee-modal').style.display = 'none'; });
    
    document.querySelectorAll('.modal').forEach(modal => { 
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; }); 
    });
    
    document.getElementById('register-modal-close-button')?.addEventListener('click', () => document.getElementById('register-modal').style.display = 'none');
    document.getElementById('alert-modal-ok-button')?.addEventListener('click', () => document.getElementById('alert-modal').style.display = 'none');
    
    // [เพิ่มใหม่] ปิด Modal สำหรับระบบใหม่
    document.getElementById('close-approval-modal')?.addEventListener('click', () => { document.getElementById('admin-approval-modal').style.display = 'none'; });
    document.getElementById('close-command-numbering-modal')?.addEventListener('click', () => { document.getElementById('command-numbering-modal').style.display = 'none'; });

    // --- Admin Commands & Memos ---
    document.getElementById('back-to-admin-command')?.addEventListener('click', async () => { await switchPage('command-generation-page'); });
    document.getElementById('admin-generate-command-button')?.addEventListener('click', handleAdminGenerateCommand);
    document.getElementById('command-approval-form')?.addEventListener('submit', handleCommandApproval);
    
    document.getElementById('dispatch-form')?.addEventListener('submit', handleDispatchFormSubmit);
    document.getElementById('admin-memo-action-form')?.addEventListener('submit', handleAdminMemoActionSubmit);
    document.getElementById('send-memo-form')?.addEventListener('submit', handleMemoSubmitFromModal);
    // --- ส่วนควบคุมแท็บในหน้าจัดการบันทึกและคำสั่ง ---
document.getElementById('admin-view-requests-tab')?.addEventListener('click', async function() {
    // สลับสถานะปุ่ม
    this.classList.add('active');
    document.getElementById('admin-view-memos-tab').classList.remove('active');
    // สลับการแสดงผลหน้าจอ
    document.getElementById('admin-requests-view').classList.remove('hidden');
    document.getElementById('admin-memos-view').classList.add('hidden');
    // โหลดข้อมูลใหม่
    if (typeof fetchAllRequestsForCommand === 'function') await fetchAllRequestsForCommand();
});

document.getElementById('admin-view-memos-tab')?.addEventListener('click', async function() {
    // สลับสถานะปุ่ม
    this.classList.add('active');
    document.getElementById('admin-view-requests-tab').classList.remove('active');
    // สลับการแสดงผลหน้าจอ
    document.getElementById('admin-memos-view').classList.remove('hidden');
    document.getElementById('admin-requests-view').classList.add('hidden');
    // โหลดข้อมูลใหม่
    if (typeof fetchAllMemos === 'function') await fetchAllMemos();
});
    // --- Stats ---
    document.getElementById('refresh-stats')?.addEventListener('click', async () => { 
        if(typeof loadStatsData === 'function') {
            await loadStatsData(true); 
            showAlert('สำเร็จ', 'อัปเดตข้อมูลสถิติเรียบร้อยแล้ว'); 
        }
    });

    // --- Navigation ---
    document.getElementById('navigation')?.addEventListener('click', async (e) => {
        const navButton = e.target.closest('.nav-button');
        if (navButton && navButton.dataset.target) { await switchPage(navButton.dataset.target); }
    });

    // --- Forms & Inputs ---
    setupVehicleOptions();
    
    // 1. ฟอร์มหลักต่างๆ
    const reqForm = document.getElementById('request-form');
    if (reqForm) reqForm.addEventListener('submit', handleRequestFormSubmit);

    document.getElementById('vehicle-request-form')?.addEventListener('submit', handleVehicleFormSubmit);
    document.getElementById('attachments-form')?.addEventListener('submit', handleAttachmentsSubmit);
    
    // 2. ล้างลายเซ็น (Signature Pad Controls)
    document.getElementById('clear-travel-sig')?.addEventListener('click', () => { if (travelSignaturePad) travelSignaturePad.clear(); });
    document.getElementById('clear-vehicle-sig')?.addEventListener('click', () => { if (vehicleSignaturePad) vehicleSignaturePad.clear(); });
    document.getElementById('clear-admin-sig')?.addEventListener('click', () => { if (adminSignaturePad) adminSignaturePad.clear(); });

    // 3. แสดง/ซ่อนช่องเซ็นชื่อตามเงื่อนไข (กรณีไม่เบิกเงิน)
    document.querySelectorAll('input[name="expense_option"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const sigSection = document.getElementById('travel-sig-section');
            if (e.target.value === 'no') {
                sigSection?.classList.remove('hidden');
            } else {
                sigSection?.classList.add('hidden');
            }
            toggleExpenseOptions(); 
        });
    });

    // 4. ส่วนประกอบฟอร์มอื่นๆ
    document.getElementById('form-add-attendee')?.addEventListener('click', () => addAttendeeField());
    document.querySelectorAll('input[name="vehicle_option"]').forEach(checkbox => {
        checkbox.addEventListener('change', toggleVehicleDetails);
    });
    
    document.getElementById('form-department')?.addEventListener('change', (e) => {
        const selectedPosition = e.target.value;
        const headNameInput = document.getElementById('form-head-name');
        if(headNameInput) headNameInput.value = specialPositionMap[selectedPosition] || '';
    });
    
    const searchInput = document.getElementById('search-requests');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => renderRequestsList(allRequestsCache, userMemosCache, e.target.value));
    }

    // --- Admin Sync & Notifications ---
    const adminSyncBtn = document.getElementById('admin-sync-btn');
    if (adminSyncBtn) {
        adminSyncBtn.addEventListener('click', async () => {
            if (!confirm('⚠️ ยืนยันการ Sync ข้อมูลจาก Google Sheets?')) return;
            toggleLoader('admin-sync-btn', true);
            try {
                if (typeof syncAllDataFromSheetToFirebase === 'function') await syncAllDataFromSheetToFirebase();
                showAlert('สำเร็จ', 'อัปเดตฐานข้อมูลเรียบร้อยแล้ว');
                if (typeof fetchAllRequestsForCommand === 'function') await fetchAllRequestsForCommand();
            } catch (error) { showAlert('ผิดพลาด', error.message); } 
            finally { toggleLoader('admin-sync-btn', false); }
        });
    }

    const notifBtn = document.getElementById('notification-btn');
    const notifDropdown = document.getElementById('notification-dropdown');
    if (notifBtn && notifDropdown) {
        notifBtn.addEventListener('click', (e) => { e.stopPropagation(); notifDropdown.classList.toggle('hidden'); });
        document.addEventListener('click', (e) => {
            if (!notifBtn.contains(e.target) && !notifDropdown.contains(e.target)) notifDropdown.classList.add('hidden');
        });
    }

    // --- [IMPORTANT] LINE Messenger API Deep Link Trigger ---
    // ส่วนนี้จะดักจับลิงก์ที่คลิกมาจาก LINE เพื่อเปิดหน้าต่างจัดการเอกสารอัตโนมัติ
    const urlParams = new URLSearchParams(window.location.search);
    const action = urlParams.get('action');
    const requestId = urlParams.get('id');

    if (action && requestId) {
        console.log(`🚀 LINE Link Detected: ${action} for ID: ${requestId}`);
        
        // รอให้สถานะการ Login ของ Firebase พร้อม
        firebase.auth().onAuthStateChanged(async (user) => {
            if (user) {
                // แยกตามประเภท Action ที่ส่งมาจาก LINE
                if (action === 'admin-verify') {
                    const step = parseInt(urlParams.get('step') || '1');
                    await handleAdminVerification(requestId, step);
                } else if (action === 'numbering') {
                    await openCommandNumberingModal(requestId);
                } else if (action === 'director-sign') {
                    await openDirectorMultiSignModal(requestId);
                } else if (action === 'vice-sign') {
                    const role = urlParams.get('role');
                    await prepareApprovalModal(requestId, null, role);
                }
            } else {
                showAlert('กรุณาล็อกอิน', 'กรุณาเข้าสู่ระบบเพื่อดำเนินการจัดการเอกสารผ่านลิงก์ LINE');
            }
        });
    }
}

function handleExcelImport(e) {
    const file = e.target.files[0]; if (!file) return;
    try {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            const attendeesList = document.getElementById('form-attendees-list');
            if(attendeesList) attendeesList.innerHTML = '';
            
            jsonData.forEach(row => {
                if (row['ชื่อ-นามสกุล'] && row['ตำแหน่ง']) {
                    const list = document.getElementById('form-attendees-list');
                    const attendeeDiv = document.createElement('div');
                    attendeeDiv.className = 'grid grid-cols-1 md:grid-cols-3 gap-2 items-center mb-2';
                    attendeeDiv.innerHTML = `
                    <input type="text" class="form-input attendee-name md:col-span-1" value="${escapeHtml(row['ชื่อ-นามสกุล'])}" required>
                    <div class="attendee-position-wrapper md:col-span-1">
                        <select class="form-input attendee-position-select"><option value="other">อื่นๆ</option></select>
                        <input type="text" class="form-input attendee-position-other mt-1" value="${escapeHtml(row['ตำแหน่ง'])}">
                    </div>
                    <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">ลบ</button>`;
                    list.appendChild(attendeeDiv);
                }
            });
            showAlert('สำเร็จ', 'นำเข้าข้อมูลผู้ร่วมเดินทางสำเร็จ');
        };
        reader.readAsArrayBuffer(file);
    } catch (error) { showAlert('ผิดพลาด', error.message); } finally { e.target.value = ''; }
}

function downloadAttendeeTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([['ชื่อ-นามสกุล', 'ตำแหน่ง'],['ตัวอย่าง ผู้ใช้', 'ครู']]);
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'attendee_template.xlsx');
}

function enhanceEditFunctionSafety() {
    const requiredFunctions = ['openEditPage', 'generateDocumentFromDraft', 'getEditFormData'];
    requiredFunctions.forEach(funcName => {
        if (typeof window[funcName] !== 'function') {
            console.warn(`Function ${funcName} is not yet loaded.`);
            window[funcName] = function() { showAlert("ระบบกำลังโหลด", "กรุณารอสักครู่หรือรีเฟรชหน้า"); };
        }
    });
}

// ✅ ฟังก์ชันตรวจสอบสถานะ Server (Health Check)
async function checkPDFServerStatus() {
    const statusContainer = document.getElementById('server-status-container');
    const statusText = document.getElementById('server-status-text');
    const statusDot = document.getElementById('status-dot');
    const statusPing = document.getElementById('status-ping');

    if (!statusContainer) return;

    statusContainer.classList.remove('hidden');

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        // ตรวจสอบการเชื่อมต่อ (no-cors เพื่อไม่ให้ติด Block)
        await fetch(PDF_ENGINE_CONFIG.BASE_URL, {
            method: 'GET',
            signal: controller.signal,
            mode: 'no-cors'
        });

        clearTimeout(timeoutId);

        // Online State
        statusText.textContent = "ระบบ PDF พร้อมใช้งาน";
        statusText.className = "font-medium text-green-600";
        statusDot.className = "relative inline-flex rounded-full h-2 w-2 bg-green-500";
        statusPing.className = "animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75";
        statusContainer.className = "hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-green-50 border border-green-200 text-xs";

    } catch (error) {
        // Offline State
        console.warn("PDF Server Check Failed:", error);
        statusText.textContent = "ระบบ PDF ขัดข้อง";
        statusText.className = "font-medium text-red-600";
        statusDot.className = "relative inline-flex rounded-full h-2 w-2 bg-red-500";
        statusPing.className = "hidden";
        statusContainer.className = "hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-red-50 border border-red-200 text-xs";
    }
}

document.addEventListener('DOMContentLoaded', () => {
    console.log('App Initializing...');
    setupYearSelectors();
    // Check Config
    if (typeof escapeHtml !== 'function') {
        console.error("Config.js not loaded or missing escapeHtml!");
        alert("System Error: Configuration missing. Please refresh.");
        return;
    }

    if (typeof loadPublicWeeklyData === 'function') loadPublicWeeklyData();
    
    // ✅ เรียกใช้ฟังก์ชันตรวจสอบสถานะ PDF Server
    checkPDFServerStatus();

    setupEventListeners();
    enhanceEditFunctionSafety();
    
    if (typeof Chart !== 'undefined') {
        Chart.defaults.font.family = "'Sarabun', sans-serif";
        Chart.defaults.font.size = 14;
        Chart.defaults.color = '#374151';
    }
    
    const navEdit = document.getElementById('nav-edit');
    if (navEdit) navEdit.classList.add('hidden');
    
    if (typeof resetEditPage === 'function') resetEditPage();
    
    const user = getCurrentUser();
    if (user) { initializeUserSession(user); } else { showLoginScreen(); }
});
// ฟังก์ชันสร้างตัวเลือกปี (ย้อนหลัง 3 ปี)
function setupYearSelectors() {
    const currentYear = new Date().getFullYear() + 543;
    const years = [currentYear, currentYear - 1, currentYear - 2]; // กำหนดจำนวนปีที่ต้องการ
    
    const createOptions = (selectId) => {
        const select = document.getElementById(selectId);
        if (!select) return;
        
        select.innerHTML = years.map(y => 
            `<option value="${y}" ${y === currentYear ? 'selected' : ''}>📂 ปีงบประมาณ ${y} ${y === currentYear ? '(ปัจจุบัน)' : ''}</option>`
        ).join('');

        // เมื่อเปลี่ยนปี ให้โหลดข้อมูลใหม่ทันที
        select.addEventListener('change', async (e) => {
            if (selectId === 'user-year-select') {
                await fetchUserRequests();
            } else if (selectId === 'admin-year-select') {
                await fetchAllRequestsForCommand();
            }
        });
    };

    createOptions('user-year-select');
    createOptions('admin-year-select');
}
