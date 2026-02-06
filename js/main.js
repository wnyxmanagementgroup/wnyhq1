// --- PAGE NAVIGATION & EVENT LISTENERS ---

let notificationUnsubscribe = null;

async function switchPage(targetPageId) {
    console.log("🔄 Switching to page:", targetPageId);
    
    // ... (โค้ดซ่อนหน้าเดิม) ...
    document.querySelectorAll('.page-view').forEach(page => { page.classList.add('hidden'); });
    
    // ... (โค้ดแสดงหน้าเป้าหมาย) ...
    const targetPage = document.getElementById(targetPageId);
    if (targetPage) { targetPage.classList.remove('hidden'); }

    // ... (โค้ดปรับปุ่ม Active) ...
    document.querySelectorAll('.nav-button').forEach(btn => {
        btn.classList.remove('active');
        if(btn.dataset.target === targetPageId) { btn.classList.add('active'); }
    });

    // --- เพิ่ม Logic สำหรับหน้า send-memo-page ---
    if (targetPageId === 'send-memo-page') {
        if (typeof fetchPendingMemos === 'function') {
            fetchPendingMemos(); // เรียกฟังก์ชันโหลดข้อมูลเฉพาะหน้านี้
        }
    }

    // --- Logic เฉพาะของแต่ละหน้า (Parallel Processing) ---

    if (targetPageId === 'edit-page') { 
        setTimeout(() => { setupEditPageEventListeners(); }, 100); 
    }
    
    if (targetPageId === 'dashboard-page') {
        // [แก้ไข] ลบ await ออก เพื่อให้โหลดข้อมูลแบบ Background Process
        // ผู้ใช้จะเห็น Loader หมุนๆ บนหน้าจอ แต่ Popup จะเด้งได้เลย
        fetchUserRequests(); 
        
        // เรียก Popup แจ้งเตือนทันที
        showReminderModal();
    }
    
    if (targetPageId === 'form-page') { 
        // ฟอร์มควรรอให้รีเซ็ตเสร็จก่อน เพื่อป้องกันข้อมูลค้าง
        await resetRequestForm(); 
        setTimeout(() => { tryAutoFillRequester(); }, 100); 
    }
    
    if (targetPageId === 'profile-page') {
        if (typeof loadProfileData === 'function') loadProfileData();
    }
    
    if (targetPageId === 'stats-page') {
        // [แก้ไข] ลบ await ออก ให้โหลดกราฟเบื้องหลัง
        if (typeof loadStatsData === 'function') loadStatsData(); 
    }
    
    if (targetPageId === 'admin-users-page') {
        // [แก้ไข] ลบ await ออก
        if (typeof fetchAllUsers === 'function') fetchAllUsers();
    }
    
    if (targetPageId === 'command-generation-page') { 
        const tab = document.getElementById('admin-view-requests-tab');
        if(tab) tab.click(); 
    }
}

// ★★★ เพิ่มฟังก์ชันนี้ไว้ท้ายไฟล์ main.js หรือบริเวณใกล้เคียง switchPage ★★★
function showReminderModal() {
    // ตรวจสอบว่าเคยแสดงไปแล้วหรือยังใน Session นี้ (ถ้าต้องการให้แสดงทุกครั้งที่ Login ใหม่)
    const hasShown = sessionStorage.getItem('loginReminderShown');
    
    // ถ้ายังไม่เคยแสดง ให้แสดง (เมื่อ Login เข้ามาครั้งแรกจะแสดงแน่นอน)
    if (!hasShown) {
        const modal = document.getElementById('reminder-modal');
        if (modal) {
            modal.style.display = 'flex';
            
            // ตั้งค่าปุ่มปิด
            const closeBtn = document.getElementById('close-reminder-modal');
            
            // ลบ Event Listener เก่าออกก่อนเพื่อป้องกันการซ้อนทับ (Safety)
            const newBtn = closeBtn.cloneNode(true);
            closeBtn.parentNode.replaceChild(newBtn, closeBtn);
            
            newBtn.addEventListener('click', function() {
                modal.style.display = 'none';
                sessionStorage.setItem('loginReminderShown', 'true'); // บันทึกว่าแสดงแล้ว
            });
        }
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
// [เพิ่มฟังก์ชัน Real-time Notification]
function startRealtimeNotifications() {
    const user = getCurrentUser();
    if (!user || typeof db === 'undefined') return;

    // ถ้าเคยฟังอยู่แล้ว ให้ยกเลิกก่อนกันซ้ำ
    if (notificationUnsubscribe) {
        notificationUnsubscribe();
    }

    console.log("🔔 Starting Real-time Notification Listener...");

    // ใช้ onSnapshot เพื่อฟังการเปลี่ยนแปลงข้อมูลแบบทันที
    notificationUnsubscribe = db.collection('requests')
        .where('username', '==', user.username)
        .onSnapshot((snapshot) => {
            let pendingCount = 0;
            let pendingItems = [];

            // วนลูปเช็คเอกสารทุกตัวที่มีการเปลี่ยนแปลง
            snapshot.forEach((doc) => {
                const req = doc.data();
                const reqId = req.requestId || req.id;
                
                // Logic เดียวกับ updateNotifications เดิม
                const hasCreated = (req.pdfUrl && req.pdfUrl !== '') || req.completedMemoUrl;
                
                // ตรวจสอบสถานะว่าเสร็จสิ้นหรือยัง
                const isCompleted = (req.status === 'เสร็จสิ้น' || req.status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' || req.memoStatus === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน');
                const isFixing = (req.status === 'นำกลับไปแก้ไข' || req.memoStatus === 'นำกลับไปแก้ไข');
                
                // ถ้าสร้างไฟล์แล้ว แต่ยังไม่เสร็จ หรือต้องแก้ไข -> นับเป็น pending
                if (hasCreated && (!isCompleted || isFixing)) {
                    pendingCount++;
                    pendingItems.push({
                        id: reqId,
                        purpose: req.purpose,
                        startDate: req.startDate,
                        isFix: isFixing
                    });
                }
            });

            // อัปเดต UI ทันที
            renderNotificationUI(pendingCount, pendingItems);
        }, (error) => {
            console.warn("Real-time Notification Error:", error);
        });
}

function renderNotificationUI(count, items) {
    const badge = document.getElementById('notification-badge');
    const countText = document.getElementById('notification-count-text');
    const listContainer = document.getElementById('notification-list');

    if (!badge) return;

    // Badge จุดแดง
    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
        badge.classList.add('animate-bounce');
        setTimeout(() => badge.classList.remove('animate-bounce'), 1000);
    } else {
        badge.classList.add('hidden');
    }

    if (countText) countText.textContent = `${count} รายการ`;

    // Dropdown List
    if (count === 0) {
        listContainer.innerHTML = `<div class="p-8 text-center text-gray-400 flex flex-col items-center"><svg class="w-8 h-8 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>ส่งครบทุกรายการแล้ว</div>`;
    } else {
        listContainer.innerHTML = items.map(item => {
            const statusBadge = item.isFix 
                ? `<span class="text-xs bg-red-100 text-red-600 px-1.5 rounded border border-red-200">แก้ไข</span>` 
                : `<span class="text-xs bg-yellow-100 text-yellow-600 px-1.5 rounded border border-yellow-200">รอส่ง</span>`;
            
            return `
            <div onclick="openSendMemoFromNotif('${item.id}')" class="p-3 hover:bg-indigo-50 cursor-pointer transition flex justify-between items-start group border-b border-gray-50 last:border-0">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="font-bold text-sm text-indigo-700">${escapeHtml(item.id || 'รอเลข')}</span>
                        ${statusBadge}
                    </div>
                    <p class="text-xs text-gray-500 line-clamp-1">${escapeHtml(item.purpose)}</p>
                </div>
                <div class="text-indigo-400 opacity-0 group-hover:opacity-100 transition transform translate-x-[-5px] group-hover:translate-x-0">➤</div>
            </div>`;
        }).join('');
    }
}
function setupEventListeners() {
    if (typeof setupFormConditions === 'function') setupFormConditions();
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
    document.getElementById('public-attendee-modal-close-btn2')?.addEventListener('click', () => { document.getElementById('public-attendee-modal').style.display = 'none'; });
    
    document.querySelectorAll('.modal').forEach(modal => { 
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; }); 
    });
    
    document.getElementById('register-modal-close-button')?.addEventListener('click', () => document.getElementById('register-modal').style.display = 'none');
    document.getElementById('register-modal-close-button2')?.addEventListener('click', () => document.getElementById('register-modal').style.display = 'none');
    
    document.getElementById('alert-modal-close-button')?.addEventListener('click', () => document.getElementById('alert-modal').style.display = 'none');
    document.getElementById('alert-modal-ok-button')?.addEventListener('click', () => document.getElementById('alert-modal').style.display = 'none');
    document.getElementById('confirm-modal-close-button')?.addEventListener('click', () => document.getElementById('confirm-modal').style.display = 'none');
    
    // --- Admin Commands & Memos ---
    document.getElementById('back-to-admin-command')?.addEventListener('click', async () => { await switchPage('command-generation-page'); });
    document.getElementById('admin-generate-command-button')?.addEventListener('click', handleAdminGenerateCommand);
    document.getElementById('command-approval-form')?.addEventListener('submit', handleCommandApproval);
    document.getElementById('command-approval-modal-close-button')?.addEventListener('click', () => document.getElementById('command-approval-modal').style.display = 'none');
    document.getElementById('command-approval-cancel-button')?.addEventListener('click', () => document.getElementById('command-approval-modal').style.display = 'none');
    
    document.getElementById('dispatch-form')?.addEventListener('submit', handleDispatchFormSubmit);
    document.getElementById('dispatch-modal-close-button')?.addEventListener('click', () => document.getElementById('dispatch-modal').style.display = 'none');
    document.getElementById('dispatch-cancel-button')?.addEventListener('click', () => document.getElementById('dispatch-modal').style.display = 'none');
    
    document.getElementById('admin-memo-action-form')?.addEventListener('submit', handleAdminMemoActionSubmit);
    document.getElementById('admin-memo-action-modal-close-button')?.addEventListener('click', () => document.getElementById('admin-memo-action-modal').style.display = 'none');
    document.getElementById('admin-memo-cancel-button')?.addEventListener('click', () => document.getElementById('admin-memo-action-modal').style.display = 'none');
    
    document.getElementById('send-memo-modal-close-button')?.addEventListener('click', () => document.getElementById('send-memo-modal').style.display = 'none');
    document.getElementById('send-memo-cancel-button')?.addEventListener('click', () => document.getElementById('send-memo-modal').style.display = 'none');
    document.getElementById('send-memo-form')?.addEventListener('submit', handleMemoSubmitFromModal);
// --- Admin: Edit User Modal ---
    document.getElementById('edit-user-modal-close-button')?.addEventListener('click', () => {
        document.getElementById('edit-user-modal').style.display = 'none';
    });
    
    document.getElementById('edit-user-cancel-button')?.addEventListener('click', () => {
        document.getElementById('edit-user-modal').style.display = 'none';
    });

    document.getElementById('edit-user-form')?.addEventListener('submit', handleEditUserSubmit);
    // --- Stats ---
    document.getElementById('refresh-stats')?.addEventListener('click', async () => { 
        if(typeof loadStatsData === 'function') {
            await loadStatsData(true); // Force Refresh
            showAlert('สำเร็จ', 'อัปเดตข้อมูลสถิติเรียบร้อยแล้ว'); 
        }
    });
    document.getElementById('export-stats')?.addEventListener('click', () => {
        if(typeof exportStatsReport === 'function') exportStatsReport();
    });

    // --- Navigation ---
    document.getElementById('navigation')?.addEventListener('click', async (e) => {
        const navButton = e.target.closest('.nav-button');
        if (navButton && navButton.dataset.target) { await switchPage(navButton.dataset.target); }
    });

    // --- Forms & Inputs ---
    setupVehicleOptions();
    
    const adminMemoStatus = document.getElementById('admin-memo-status');
    if (adminMemoStatus) {
        adminMemoStatus.addEventListener('change', function(e) {
            const fileUploads = document.getElementById('admin-file-uploads');
            if (e.target.value === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน') { 
                fileUploads.classList.remove('hidden'); 
            } else { 
                fileUploads.classList.add('hidden'); 
            }
        });
    }

    const reqForm = document.getElementById('request-form');
    if (reqForm) reqForm.addEventListener('submit', handleRequestFormSubmit);
    
    document.getElementById('form-add-attendee')?.addEventListener('click', () => addAttendeeField());
    document.getElementById('form-import-excel')?.addEventListener('click', () => document.getElementById('excel-file-input').click());
    document.getElementById('excel-file-input')?.addEventListener('change', handleExcelImport); 
    document.getElementById('form-download-template')?.addEventListener('click', downloadAttendeeTemplate); 
    
    document.querySelectorAll('input[name="expense_option"]').forEach(radio => radio.addEventListener('change', toggleExpenseOptions));
    
    // --- โค้ดใหม่ (ใช้ ID ที่ถูกต้อง) ---
document.querySelectorAll('input[name="modal_memo_type"]').forEach(radio => radio.addEventListener('change', (e) => {
    const isReimburse = e.target.value === 'reimburse';
    
    // 1. จัดการกล่องอัปโหลด 3 ไฟล์ (สำหรับแบบไม่เบิก)
    const nonReimburseContainer = document.getElementById('modal-non-reimburse-files');
    if (nonReimburseContainer) {
        if (isReimburse) {
            nonReimburseContainer.classList.add('hidden');
            // ปลดล็อค required (ไม่ต้องกรอก)
            const f1 = document.getElementById('file-exchange');
            const f2 = document.getElementById('file-ref-doc');
            if(f1) f1.required = false;
            if(f2) f2.required = false;
        } else {
            nonReimburseContainer.classList.remove('hidden');
            // บังคับ required (ต้องกรอก)
            const f1 = document.getElementById('file-exchange');
            const f2 = document.getElementById('file-ref-doc');
            if(f1) f1.required = true;
            if(f2) f2.required = true;
        }
    }

    // 2. จัดการกล่องไฟล์เดียว (Legacy - เผื่อยังมีอยู่ใน HTML)
    const singleFileContainer = document.getElementById('modal-single-file-container');
    const oldFileContainer = document.getElementById('modal-memo-file-container'); // เผื่อยังมี ID เก่าหลงเหลือ
    
    if (singleFileContainer) singleFileContainer.classList.add('hidden');
    if (oldFileContainer) oldFileContainer.classList.add('hidden');
}));
    
    document.querySelectorAll('input[name="vehicle_option"]').forEach(checkbox => {checkbox.addEventListener('change', toggleVehicleDetails);});
    
    document.getElementById('profile-form')?.addEventListener('submit', handleProfileUpdate);
    document.getElementById('password-form')?.addEventListener('submit', handlePasswordUpdate);
    document.getElementById('show-password-toggle')?.addEventListener('change', togglePasswordVisibility);
    
    document.getElementById('form-department')?.addEventListener('change', (e) => {
        const selectedPosition = e.target.value;
        const headNameInput = document.getElementById('form-head-name');
        if(headNameInput) headNameInput.value = specialPositionMap[selectedPosition] || '';
    });
    
    const searchInput = document.getElementById('search-requests');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => renderRequestsList(allRequestsCache, userMemosCache, e.target.value));
    }

    // --- Admin User Mgmt ---
    document.getElementById('add-user-button')?.addEventListener('click', openAddUserModal);
    document.getElementById('download-user-template-button')?.addEventListener('click', downloadUserTemplate);
    document.getElementById('import-users-button')?.addEventListener('click', () => document.getElementById('user-excel-input').click());
    document.getElementById('user-excel-input')?.addEventListener('change', handleUserImport);
    
    // --- Admin Tabs ---
    document.getElementById('admin-view-requests-tab')?.addEventListener('click', async (e) => {
        document.getElementById('admin-view-memos-tab').classList.remove('active');
        e.target.classList.add('active');
        document.getElementById('admin-requests-view').classList.remove('hidden');
        document.getElementById('admin-memos-view').classList.add('hidden');
        await fetchAllRequestsForCommand();
    });
    
    document.getElementById('admin-view-memos-tab')?.addEventListener('click', async (e) => {
        document.getElementById('admin-view-requests-tab').classList.remove('active');
        e.target.classList.add('active');
        document.getElementById('admin-memos-view').classList.remove('hidden');
        document.getElementById('admin-requests-view').classList.add('hidden');
        await fetchAllMemos();
    });

    // --- [IMPORTANT] ADMIN SYNC BUTTON (HYBRID) ---
    const adminSyncBtn = document.getElementById('admin-sync-btn');
    if (adminSyncBtn) {
        adminSyncBtn.addEventListener('click', async () => {
            if (!confirm('⚠️ คำเตือน: การ Sync จะดึงข้อมูลทั้งหมดจาก Google Sheets มาทับใน Firebase\n\nควรทำเมื่อ:\n1. เริ่มระบบครั้งแรก\n2. ข้อมูลไม่ตรงกัน\n\nคุณต้องการดำเนินการต่อหรือไม่?')) return;
            
            toggleLoader('admin-sync-btn', true);
            
            try {
                // 1. Sync Requests (คำขอ)
                if (typeof syncAllDataFromSheetToFirebase === 'function') {
                    const reqResult = await syncAllDataFromSheetToFirebase();
                    console.log('Request Sync Result:', reqResult);
                }

                // 2. Sync Users (ผู้ใช้งาน - เพื่อการ Login ที่เร็วขึ้น)
                if (typeof syncUsersToFirebase === 'function') {
                    const userResult = await syncUsersToFirebase();
                    console.log('User Sync Result:', userResult);
                }

                showAlert('สำเร็จ', 'อัปเดตฐานข้อมูล (คำขอและผู้ใช้งาน) เรียบร้อยแล้ว');
                
                // รีโหลดหน้า Admin เพื่อแสดงข้อมูลล่าสุด
                if (typeof fetchAllRequestsForCommand === 'function') await fetchAllRequestsForCommand();

            } catch (error) {
                showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการ Sync: ' + error.message);
            } finally {
                toggleLoader('admin-sync-btn', false);
            }
        });
    }

    // --- [NEW] NOTIFICATION BELL (กระดิ่งแจ้งเตือน) ---
    const notifBtn = document.getElementById('notification-btn');
    const notifDropdown = document.getElementById('notification-dropdown');

    if (notifBtn && notifDropdown) {
        // กดปุ่มกระดิ่ง -> เปิด/ปิด Dropdown
        notifBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // กันไม่ให้ไปโดน event คลิกพื้นหลัง
            notifDropdown.classList.toggle('hidden');
        });

        // คลิกที่อื่น -> ปิด Dropdown
        document.addEventListener('click', (e) => {
            if (!notifBtn.contains(e.target) && !notifDropdown.contains(e.target)) {
                notifDropdown.classList.add('hidden');
            }
        });
    }

    // --- [NEW] PROMPT SEND MEMO MODAL (แจ้งเตือนส่งงานทันทีหลังสร้าง) ---
    const promptModal = document.getElementById('prompt-send-memo-modal');
    const closePrompt = () => { if(promptModal) promptModal.style.display = 'none'; };

    // ปุ่มปิด (X) และปุ่มส่งภายหลัง
    document.getElementById('prompt-send-memo-close-btn')?.addEventListener('click', closePrompt);
    document.getElementById('prompt-send-memo-later-btn')?.addEventListener('click', closePrompt);

    // ปุ่ม "ส่งบันทึกข้อความทันที"
    document.getElementById('prompt-send-memo-now-btn')?.addEventListener('click', () => {
        // 1. ปิดหน้าต่าง Prompt
        closePrompt();
        
        // 2. ดึง ID ที่ฝากไว้
        const requestId = document.getElementById('prompt-send-memo-request-id').value;
        
        // 3. เปิดหน้าต่างส่งบันทึก (Send Memo Modal)
        if (requestId) {
            document.getElementById('memo-modal-request-id').value = requestId;
            document.getElementById('send-memo-modal').style.display = 'flex';
        } else {
            showAlert('ข้อผิดพลาด', 'ไม่พบรหัสคำขอ');
        }
    });

    // Error Handling
    window.addEventListener('error', (event) => {
        console.error('Global error:', event.error);
        if (event.error && event.error.message && event.error.message.includes('openEditPageDirect')) return;
    });
    window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled promise rejection:', event.reason);
    });
    document.getElementById('admin-view-announcement-tab')?.addEventListener('click', (e) => {
        // สลับ Active Tab
        document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        
        // สลับหน้าจอ Admin
        document.getElementById('admin-requests-view').classList.add('hidden');
        document.getElementById('admin-memos-view').classList.add('hidden');
        document.getElementById('admin-announcement-view').classList.remove('hidden');
        
        // โหลดข้อมูลประกาศ
        if(typeof loadAdminAnnouncementSettings === 'function') loadAdminAnnouncementSettings();
    });

    // Submit ฟอร์มประกาศ
    document.getElementById('admin-announcement-form')?.addEventListener('submit', handleSaveAnnouncement);

    // เริ่มต้นระบบแจ้งเตือน (ถ้า User Login อยู่แล้ว)
    const currentUser = getCurrentUser();
    if (currentUser) {
        startRealtimeNotifications();
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
// --- เพิ่ม Helper Function ไว้บนสุดหรือท้ายไฟล์ admin.js ---
function convertToDirectLink(url) {
    if (!url) return null;
    try {
        // ถ้าเป็นลิงก์ Google Drive แบบ View ให้แปลงเป็น Direct Link
        if (url.includes('drive.google.com') && url.includes('/d/')) {
            const fileId = url.split('/d/')[1].split('/')[0];
            return `https://drive.google.com/uc?export=view&id=${fileId}`;
        }
    } catch (e) { console.error("Link conversion error", e); }
    return url;
}

// ฟังก์ชันสำหรับดูตัวอย่างรูปทันทีที่วางลิงก์
function updateAnnouncementPreview(url) {
    const preview = document.getElementById('current-announcement-img-preview');
    const img = preview.querySelector('img');
    const directUrl = convertToDirectLink(url);
    
    if (directUrl) {
        preview.classList.remove('hidden');
        img.src = directUrl;
    }
}

// --- แก้ไขฟังก์ชัน loadAdminAnnouncementSettings ---
async function loadAdminAnnouncementSettings() {
    if (!checkAdminAccess()) return;
    
    // Reset Form
    document.getElementById('announcement-active').checked = false;
    document.getElementById('announcement-title-input').value = '';
    document.getElementById('announcement-message-input').value = '';
    document.getElementById('announcement-image-input').value = ''; // Reset file input
    document.getElementById('announcement-image-url-input').value = ''; // Reset url input
    document.getElementById('current-announcement-img-preview').classList.add('hidden');

    try {
        const doc = await db.collection('settings').doc('announcement').get();
        if (doc.exists) {
            const data = doc.data();
            document.getElementById('announcement-active').checked = data.isActive || false;
            document.getElementById('announcement-title-input').value = data.title || '';
            document.getElementById('announcement-message-input').value = data.message || '';
            
            if (data.imageUrl) {
                const preview = document.getElementById('current-announcement-img-preview');
                preview.classList.remove('hidden');
                
                // แปลงลิงก์ให้แสดงผลได้
                const displayUrl = convertToDirectLink(data.imageUrl);
                preview.querySelector('img').src = displayUrl;
                
                // ใส่ค่าลงในช่อง URL ด้วย เพื่อให้แอดมินเห็นว่าลิงก์เดิมคืออะไร
                document.getElementById('announcement-image-url-input').value = displayUrl;
            }
        }
    } catch (e) { 
        console.error("Load Announcement Error:", e); 
    }
}

// --- แก้ไขฟังก์ชัน handleSaveAnnouncement ---
async function handleSaveAnnouncement(e) {
    e.preventDefault();
    if (!checkAdminAccess()) return;

    toggleLoader('save-announcement-btn', true);

    try {
        const isActive = document.getElementById('announcement-active').checked;
        const title = document.getElementById('announcement-title-input').value;
        const message = document.getElementById('announcement-message-input').value;
        
        const fileInput = document.getElementById('announcement-image-input');
        const urlInput = document.getElementById('announcement-image-url-input');
        
        let imageUrl = null;

        // กรณีที่ 1: มีการอัปโหลดไฟล์ใหม่ (ให้ความสำคัญสูงสุด)
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const fileObj = await fileToObject(file);
            
            const uploadRes = await apiCall('POST', 'uploadGeneratedFile', {
                data: fileObj.data,
                filename: `announcement_${Date.now()}.jpg`,
                mimeType: file.type,
                username: getCurrentUser().username
            });
            
            if (uploadRes.status === 'success') {
                // ได้ลิงก์มาแล้ว แปลงเป็น Direct Link ทันที
                imageUrl = convertToDirectLink(uploadRes.url);
            }
        } 
        // กรณีที่ 2: ไม่ได้อัปไฟล์ใหม่ แต่มีลิงก์ในช่อง URL (ใช้ลิงก์นั้นเลย)
        else if (urlInput.value.trim() !== '') {
            imageUrl = convertToDirectLink(urlInput.value.trim());
        }
        // กรณีที่ 3: ถ้าไม่มีทั้งคู่ ให้เป็น null (ลบรูปออก)

        await db.collection('settings').doc('announcement').set({
            isActive,
            title,
            message,
            imageUrl, // บันทึกลิงก์ที่แปลงแล้วลงฐานข้อมูล
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: getCurrentUser().username
        }, { merge: true });

        showAlert('สำเร็จ', 'บันทึกประกาศเรียบร้อยแล้ว');
        
        // รีโหลดฟอร์ม
        loadAdminAnnouncementSettings(); 

    } catch (error) {
        console.error(error);
        showAlert('ผิดพลาด', 'บันทึกไม่สำเร็จ: ' + error.message);
    } finally {
        toggleLoader('save-announcement-btn', false);
    }
}
// --- เพิ่ม/แก้ไขใน main.js ---

// 1. เพิ่ม Logic การสลับหน้าจอ Modal
function setupMemoModalLogic() {
    const radios = document.querySelectorAll('input[name="modal_memo_type"]');
    const nonReimburseContainer = document.getElementById('modal-non-reimburse-files');
    
    // ตั้งค่าเริ่มต้น
    const updateVisibility = () => {
        const isNonReimburse = document.getElementById('memo_type_non_reimburse').checked;
        if (isNonReimburse) {
            nonReimburseContainer.classList.remove('hidden');
            // บังคับ Required
            document.getElementById('file-exchange').required = true;
            document.getElementById('file-ref-doc').required = true;
        } else {
            nonReimburseContainer.classList.add('hidden');
            // ปลด Required
            document.getElementById('file-exchange').required = false;
            document.getElementById('file-ref-doc').required = false;
        }
    };

    radios.forEach(radio => radio.addEventListener('change', updateVisibility));
    
    // เรียกครั้งแรก
    updateVisibility();
}
// ==========================================
// 🛠️ ส่วนจัดการการส่งบันทึกและรวมไฟล์ (PDF Merge) - ฉบับแก้ไขสมบูรณ์
// ==========================================

// 1. ฟังก์ชันช่วยรวมไฟล์ (PDF และ รูปภาพ) ให้เป็น PDF ไฟล์เดียว
async function mergeFilesToSinglePDF(files) {
    if (typeof PDFLib === 'undefined') {
        throw new Error("ไม่พบไลบรารี PDF-Lib กรุณาตรวจสอบว่าได้ใส่ Script ใน index.html แล้ว");
    }

    const { PDFDocument } = PDFLib;
    const mergedPdf = await PDFDocument.create();

    for (const file of files) {
        if (!file) continue;

        try {
            const arrayBuffer = await file.arrayBuffer();

            if (file.type === 'application/pdf') {
                const pdfSrc = await PDFDocument.load(arrayBuffer);
                const copiedPages = await mergedPdf.copyPages(pdfSrc, pdfSrc.getPageIndices());
                copiedPages.forEach((page) => mergedPdf.addPage(page));
            } else if (file.type.startsWith('image/')) {
                let image;
                if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
                    image = await mergedPdf.embedJpg(arrayBuffer);
                } else if (file.type === 'image/png') {
                    image = await mergedPdf.embedPng(arrayBuffer);
                }

                if (image) {
                    const page = mergedPdf.addPage([595.28, 841.89]); // A4
                    // ปรับขนาดรูปให้พอดี (เว้นขอบ 20px)
                    const { width, height } = image.scaleToFit(555.28, 801.89); 
                    page.drawImage(image, {
                        x: (595.28 - width) / 2,
                        y: (841.89 - height) / 2,
                        width,
                        height,
                    });
                }
            }
        } catch (err) {
            console.error("Error processing file:", file.name, err);
        }
    }

    const pdfBytes = await mergedPdf.save();
    return new Blob([pdfBytes], { type: 'application/pdf' });
}

// 2. ฟังก์ชันหลักสำหรับส่งบันทึกจาก Modal (รวมไฟล์แล้วอัปโหลด)
async function handleMemoSubmitFromModal(e) {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) return;

    const requestId = document.getElementById('memo-modal-request-id').value;
    
    // ตรวจสอบว่ามีการเลือก Radio Button หรือไม่
    const memoTypeInput = document.querySelector('input[name="modal_memo_type"]:checked');
    const memoType = memoTypeInput ? memoTypeInput.value : 'non_reimburse'; 
    
    toggleLoader('send-memo-submit-button', true);

    try {
        let finalFileUrlForAdmin = ""; 

        if (memoType === 'non_reimburse') {
            // --- ดึงไฟล์จาก Input (ตาม ID ใหม่) ---
            // ใช้ Optional Chaining (?.) เพื่อกัน Error ถ้าหา Element ไม่เจอ
            const fileSigned = document.getElementById('file-signed-memo')?.files[0]; // 1. ลงนาม
            const fileExchange = document.getElementById('file-exchange')?.files[0];  // 2. แลกคาบ
            const fileRef = document.getElementById('file-ref-doc')?.files[0];        // 3. ต้นเรื่อง
            const fileOther = document.getElementById('file-other')?.files[0];        // 4. อื่นๆ

            // ตรวจสอบไฟล์บังคับ (1, 2, 3)
            if (!fileSigned || !fileExchange || !fileRef) {
                throw new Error("กรุณาแนบไฟล์บังคับให้ครบถ้วน:\n1. บันทึกข้อความที่ลงนามแล้ว\n2. ไฟล์แลกคาบสอน\n3. หนังสือต้นเรื่อง");
            }

            // --- รวมไฟล์ทั้งหมดเป็นไฟล์เดียว (Merge) ---
            // เรียงลำดับ: ลงนาม -> แลกคาบ -> ต้นเรื่อง -> อื่นๆ
            const filesToMerge = [fileSigned, fileExchange, fileRef, fileOther].filter(f => f); 
            
            // เปลี่ยนข้อความปุ่มเพื่อแจ้งสถานะ
            const btn = document.getElementById('send-memo-submit-button');
            const originalBtnText = btn.innerHTML;
            btn.innerHTML = '<div class="loader"></div> กำลังรวมไฟล์ PDF...';

            // เรียกฟังก์ชันรวมไฟล์
            const mergedPdfBlob = await mergeFilesToSinglePDF(filesToMerge);

            // --- อัปโหลดไฟล์ที่รวมเสร็จแล้ว ---
            btn.innerHTML = '<div class="loader"></div> กำลังอัปโหลด...';
            
            // แปลง Blob เป็น Base64 เพื่อส่งผ่าน API
            const mergedBase64 = await blobToBase64(mergedPdfBlob);
            
            const uploadRes = await apiCall('POST', 'uploadGeneratedFile', {
                data: mergedBase64,
                filename: `Complete_Memo_${requestId.replace(/[\/\\:\.]/g, '-')}.pdf`,
                mimeType: 'application/pdf',
                username: user.username,
                requestId: requestId
            });

            if (uploadRes.status !== 'success') throw new Error("อัปโหลดไฟล์ไม่สำเร็จ: " + uploadRes.message);
            
            finalFileUrlForAdmin = uploadRes.url;

            // --- บันทึกลิงก์ลง Database ---
            await apiCall('POST', 'updateRequest', {
                requestId: requestId,
                completedMemoUrl: finalFileUrlForAdmin 
            });

            if (typeof db !== 'undefined') {
                const docId = requestId.replace(/[\/\\:\.]/g, '-');
                await db.collection('requests').doc(docId).set({
                    completedMemoUrl: finalFileUrlForAdmin,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
            
            // คืนค่าข้อความปุ่ม
            btn.innerHTML = originalBtnText;

        } else {
            // กรณีเบิกเงิน (ส่งเอกสารจริง)
        }

        // --- ส่งสถานะ "Submitted" ไปยังระบบ ---
        const result = await apiCall('POST', 'uploadMemo', { 
            refNumber: requestId, 
            file: null, 
            fileUrl: finalFileUrlForAdmin, 
            username: user.username, 
            memoType: memoType 
        });

        if (result.status === 'success') { 
            showAlert('สำเร็จ', 'รวมไฟล์และส่งบันทึกข้อความเรียบร้อยแล้ว'); 
            document.getElementById('send-memo-modal').style.display = 'none'; 
            document.getElementById('send-memo-form').reset(); 
            
            // รีเฟรชหน้าจอ
            if (!document.getElementById('send-memo-page').classList.contains('hidden')) {
                if (typeof fetchPendingMemos === 'function') await fetchPendingMemos();
            }
            if (typeof fetchUserRequests === 'function') await fetchUserRequests(); 
        } else { 
            throw new Error(result.message); 
        }

    } catch (error) {
        console.error(error);
        showAlert('ผิดพลาด', error.message);
        const btn = document.getElementById('send-memo-submit-button');
        if(btn) btn.innerHTML = 'ยืนยันการส่งบันทึก';
    } finally {
        toggleLoader('send-memo-submit-button', false);
    }
}
