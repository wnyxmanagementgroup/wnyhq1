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
// เพิ่มต่อจากเงื่อนไขของ send-memo-page ก็ได้ครับ
    if (targetPageId === 'approval-page') {
        if (typeof loadPendingApprovals === 'function') {
            loadPendingApprovals(); 
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
    
    // 1. ปุ่มสมัครสมาชิก (ผู้ใช้กดเองจากหน้า Login)
    const showRegBtn = document.getElementById('show-register-modal-button');
    if (showRegBtn) {
        showRegBtn.addEventListener('click', () => { 
            document.getElementById('register-modal').style.display = 'flex'; 
            
            // ซ่อนช่องเลือกสิทธิ์ ไม่ให้คนนอกเห็น
            const roleContainer = document.getElementById('reg-role')?.parentElement;
            if (roleContainer) roleContainer.style.display = 'none';
            
            // บังคับค่าให้เป็น 'user' เสมอเพื่อความปลอดภัย
            const roleSelect = document.getElementById('reg-role');
            if (roleSelect) roleSelect.value = 'user';
        });
    }

    // 2. ปุ่มเพิ่มผู้ใช้ (Admin กดจากหน้าจัดการผู้ใช้)
    // เพิ่มดักจับ Event ตรงนี้เพื่อเปิดแสดง Dropdown สิทธิ์
    const addUserBtn = document.getElementById('add-user-button');
    if (addUserBtn) {
        addUserBtn.addEventListener('click', () => {
            document.getElementById('register-modal').style.display = 'flex';
            
            // แสดงช่องเลือกสิทธิ์ให้ Admin ใช้งาน
            const roleContainer = document.getElementById('reg-role')?.parentElement;
            if (roleContainer) roleContainer.style.display = 'block';
            
            // ตั้งค่าเริ่มต้นเป็น user หรือค่าอื่นที่ต้องการ
            const roleSelect = document.getElementById('reg-role');
            if (roleSelect) roleSelect.value = 'user'; 
        });
    }
    
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
    // --- Edit User Management ---
document.getElementById('edit-user-form')?.addEventListener('submit', handleEditUserSubmit);
document.getElementById('edit-user-modal-close')?.addEventListener('click', () => { document.getElementById('edit-user-modal').style.display = 'none'; });
document.getElementById('edit-user-cancel')?.addEventListener('click', () => { document.getElementById('edit-user-modal').style.display = 'none'; });
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
    
    // ตรวจสอบว่ามีลิงก์ลงนามพิเศษ (?sign=TOKEN) หรือไม่
    const _signToken = new URLSearchParams(window.location.search).get('sign');
    if (_signToken) {
        // โหมดลงนามผ่านลิงก์ — ไม่ต้อง Login
        if (typeof handleTokenSignFlow === 'function') {
            handleTokenSignFlow(_signToken);
        }
    } else {
        const user = getCurrentUser();
        if (user) { initializeUserSession(user); } else { showLoginScreen(); }
    }
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
// ==========================================
// 2. ฟังก์ชันหลักสำหรับส่งบันทึกจาก Modal (ปรับปรุง: Admin Bypass File)
// ==========================================
async function handleMemoSubmitFromModal(e) {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) return;

    // ตรวจสอบสิทธิ์ Admin
    const isAdmin = user.role === 'admin';

    const requestId = document.getElementById('memo-modal-request-id').value;
    
    // ตรวจสอบว่ามีการเลือก Radio Button หรือไม่
    const memoTypeInput = document.querySelector('input[name="modal_memo_type"]:checked');
    const memoType = memoTypeInput ? memoTypeInput.value : 'non_reimburse'; 
    
    toggleLoader('send-memo-submit-button', true);

    try {
        let finalFileUrlForAdmin = ""; 

        if (memoType === 'non_reimburse') {
            // --- ดึงไฟล์จาก Input ---
            const fileSigned = document.getElementById('file-signed-memo')?.files[0]; 
            const fileExchange = document.getElementById('file-exchange')?.files[0];  
            const fileRef = document.getElementById('file-ref-doc')?.files[0];        
            const fileOther = document.getElementById('file-other')?.files[0];        

            // กรองไฟล์ที่มีจริง
            const filesToMerge = [fileSigned, fileExchange, fileRef, fileOther].filter(f => f); 

            // --- 1. ตรวจสอบเงื่อนไข (Validation) ---
            // ถ้าไม่ใช่ Admin ต้องแนบไฟล์ครบ
            // ถ้าเป็น Admin แต่ไม่มีไฟล์เลย ก็ให้ผ่านได้ (Bypass)
            // ถ้าเป็น Admin และมีการแนบไฟล์มาบางส่วน ก็ให้รวมไฟล์ตามปกติ
            
            if (!isAdmin) {
                if (!fileSigned || !fileExchange || !fileRef) {
                    throw new Error("กรุณาแนบไฟล์บังคับให้ครบถ้วน:\n1. บันทึกข้อความที่ลงนามแล้ว\n2. ไฟล์แลกคาบสอน\n3. หนังสือต้นเรื่อง");
                }
            }

            // --- 2. รวมไฟล์และอัปโหลด (ถ้ามีไฟล์) ---
            if (filesToMerge.length > 0) {
                // เปลี่ยนข้อความปุ่ม
                const btn = document.getElementById('send-memo-submit-button');
                const originalBtnText = btn.innerHTML;
                btn.innerHTML = '<div class="loader"></div> กำลังรวมไฟล์ PDF...';

                // เรียกฟังก์ชันรวมไฟล์
                const mergedPdfBlob = await mergeFilesToSinglePDF(filesToMerge);

                // --- อัปโหลดไฟล์ ---
                btn.innerHTML = '<div class="loader"></div> กำลังอัปโหลด...';
                
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
                
                // คืนค่าปุ่ม
                btn.innerHTML = originalBtnText;

            } else if (isAdmin) {
                console.log("🛡️ Admin Bypass: ส่งบันทึกโดยไม่มีไฟล์แนบ");
                // กรณี Admin ไม่แนบไฟล์ ระบบจะข้ามขั้นตอน Merge/Upload
                // finalFileUrlForAdmin จะเป็นค่าว่าง ""
            }

            // --- 3. บันทึกลิงก์ลง Database (ถ้ามี URL) ---
            if (finalFileUrlForAdmin) {
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
            }
        } 

        // --- ส่งสถานะ "Submitted" ไปยังระบบ ---
        const result = await apiCall('POST', 'uploadMemo', { 
            refNumber: requestId, 
            file: null, 
            fileUrl: finalFileUrlForAdmin, // ถ้า Admin ไม่แนบ ค่านี้จะเป็น "" ซึ่ง backend ควรรับได้
            username: user.username, 
            memoType: memoType,
            isAdminBypass: isAdmin // (Optional) ส่ง Flag บอก Backend ว่าเป็นการ Bypass
        });

        if (result.status === 'success') { 
            showAlert('สำเร็จ', isAdmin && !finalFileUrlForAdmin 
                ? 'อัปเดตสถานะเรียบร้อยแล้ว (Admin Bypass)' 
                : 'รวมไฟล์และส่งบันทึกข้อความเรียบร้อยแล้ว'); 
            
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
// ในไฟล์ js/main.js

function updateSidebarForRole(user) {
    // รายการ ID ของเมนู User ทั่วไป
    const userMenus = ['nav-dashboard', 'nav-create-request', 'nav-create-memo'];
    const isApprover = ['deputy_acad', 'deputy_personnel', 'saraban', 'director', 'admin'].includes(user.role) ||
                       (user.role && user.role.startsWith('head_'));

    if (isApprover) {
        const inboxMenu = document.getElementById('nav-approval-inbox');
        if (inboxMenu) inboxMenu.style.display = 'flex'; // โชว์เมนูให้ผู้บริหาร
    }
    // รายการ ID ของเมนู Admin
    const adminMenus = ['nav-admin-panel'];

    if (user.username === 'admin') {
        // --- กรณีเป็น Admin ---
        // 1. ซ่อนเมนู User
        userMenus.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });

        // 2. แสดงเมนู Admin
        adminMenus.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'block'; // หรือ 'flex' แล้วแต่ CSS
        });

        // 3. บังคับเปลี่ยนหน้าไปที่ Admin Panel ทันที
        switchPage('admin-panel'); 

    } else {
        // --- กรณีเป็น User ทั่วไป ---
        // 1. แสดงเมนู User
        userMenus.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'block';
        });

        // 2. ซ่อนเมนู Admin
        adminMenus.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.style.display = 'none';
        });
        
        // 3. ไปหน้า Dashboard
        switchPage('dashboard');
    }
}
// --- APPROVAL WORKFLOW SYSTEM ---

// cache เก็บข้อมูลเอกสารรอลงนาม (ใช้ใน openApprovalDocument)
window._approvalDocs = {};

// 1. ฟังก์ชันโหลดรายการเอกสารที่รอเซ็น
async function loadPendingApprovals() {
    const user = getCurrentUser();
    if (!user) return;

    const container = document.getElementById('approval-list-container');
    container.innerHTML = `<div class="col-span-full flex justify-center py-10"><div class="loader"></div></div>`;

    try {
        const targetStatus = getTargetStatusForUser(user.role);

        if (!targetStatus) {
            container.innerHTML = `<div class="col-span-full text-center py-10 text-gray-500">คุณไม่มีสิทธิ์ในการอนุมัติเอกสาร</div>`;
            return;
        }

        const snapshot = await db.collection('requests')
            .where('docStatus', '==', targetStatus)
            .orderBy('timestamp', 'desc')
            .get();

        if (snapshot.empty) {
            container.innerHTML = `
                <div class="col-span-full text-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200">
                    <span class="text-4xl">🎉</span>
                    <h3 class="text-lg font-bold text-gray-700 mt-4">ไม่มีเอกสารคั่งค้าง</h3>
                    <p class="text-gray-500">โต๊ะทำงานของคุณว่างเปล่า ยอดเยี่ยมมาก!</p>
                </div>`;
            document.getElementById('approval-badge').classList.add('hidden');
            return;
        }

        const badge = document.getElementById('approval-badge');
        badge.innerText = snapshot.size;
        badge.classList.remove('hidden');

        // เก็บข้อมูลไว้ใน cache เพื่อหลีกเลี่ยงการส่ง URL ใน onclick โดยตรง
        window._approvalDocs = {};
        snapshot.forEach(doc => { window._approvalDocs[doc.id] = doc.data(); });

        let html = '';
        snapshot.forEach(doc => {
            const req  = doc.data();
            const pdfUrl = req.pdfUrl || req.memoPdfUrl || req.currentPdfUrl || '';
            const dateStr = req.timestamp ? formatDisplayDate(req.timestamp) : '-';

            // --- กำหนดปุ่มตามบทบาทของผู้ใช้ ---
            let actionBtn = '';
            if (user.role === 'saraban') {
                // สารบรรณ: เปิดระบบออกเลขที่และวันที่
                actionBtn = `
                    <button onclick="openSarabanForApproval('${doc.id}')"
                        class="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium flex justify-center items-center gap-2 transition-colors">
                        <span>📝</span> ออกเลขที่และวันที่เอกสาร
                    </button>`;
            } else if (user.role === 'admin') {
                // แอดมิน: ตรวจสอบและส่งต่อสารบรรณ (ไม่ต้องเซ็น)
                actionBtn = `
                    <div class="flex gap-2 mt-1">
                        <a href="${pdfUrl}" target="_blank"
                            class="flex-1 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium flex justify-center items-center gap-1 text-sm transition-colors">
                            <span>📄</span> ดูเอกสาร
                        </a>
                        <button onclick="adminForwardToSaraban('${doc.id}')"
                            class="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium flex justify-center items-center gap-1 text-sm transition-colors">
                            <span>✅</span> ส่งสารบรรณ
                        </button>
                    </div>`;
            } else {
                // ทุกบทบาทที่เซ็นได้ (หัวหน้า, รองผอ., ผอ.)
                actionBtn = `
                    <button onclick="openApprovalDocument('${doc.id}')"
                        class="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium flex justify-center items-center gap-2 transition-colors">
                        <span>✍️</span> เปิดอ่านและลงนาม
                    </button>`;
            }

            html += `
                <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:shadow-md transition-shadow">
                    <div class="flex justify-between items-start mb-3">
                        <span class="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-bold rounded">
                            ${req.documentType || 'บันทึกข้อความ'}
                        </span>
                        <span class="text-xs text-gray-500">${dateStr}</span>
                    </div>
                    <h3 class="font-bold text-gray-800 text-lg line-clamp-2">${req.purpose || 'ไม่มีหัวข้อ'}</h3>
                    <p class="text-sm text-gray-600 mt-1 mb-4">ผู้ขอ: ${req.requesterName || '-'}</p>
                    ${actionBtn}
                </div>
            `;
        });
        container.innerHTML = html;

    } catch (error) {
        console.error("Error loading approvals:", error);
        container.innerHTML = `<div class="col-span-full text-center py-10 text-red-500">เกิดข้อผิดพลาดในการดึงข้อมูล</div>`;
    }
}

// 2. ฟังก์ชันตรวจสอบว่า Role นี้ ต้องดูเอกสาร Status ไหน
// ฟังก์ชันตรวจสอบว่า Role นี้ ต้องดูเอกสาร Status ไหน
function getTargetStatusForUser(role) {
    // ดักจับกลุ่มหัวหน้ากลุ่มสาระทั้งหมด (ที่ขึ้นต้นด้วย head_)
    if (role && role.startsWith('head_')) {
        // เช่น ถ้า role คือ 'head_thai' จะดึงเอกสารสถานะ 'waiting_head_thai'
        return 'waiting_' + role; 
    }

    // ตำแหน่งอื่นๆ ยังคงรูปแบบเดิม
    switch (role) {
        case 'deputy_acad':      return 'waiting_dep_acad';
        case 'deputy_personnel': return 'waiting_dep_personnel';
        case 'saraban':          return 'waiting_saraban';
        case 'director':         return 'waiting_director';
        case 'admin':            return 'waiting_admin_review'; // แอดมินตรวจสอบก่อนส่งสารบรรณ
        default:                 return null;
    }
}

// 3. ฟังก์ชันเมื่อกดปุ่ม "เปิดอ่านและลงนาม" (อ่านข้อมูลจาก cache _approvalDocs)
function openApprovalDocument(docId) {
    const data = window._approvalDocs?.[docId] || {};
    const pdfUrl = data.pdfUrl || data.memoPdfUrl || data.currentPdfUrl || '';
    const currentDocStatus = data.docStatus || null;

    if (!pdfUrl) {
        alert("ไม่พบไฟล์ PDF ในระบบ กรุณาติดต่อแอดมิน");
        return;
    }
    openSignatureSystem(pdfUrl, docId, "✍️ ลงนามเอกสาร", currentDocStatus);
}

// 4. แอดมินตรวจสอบแล้ว → ส่งต่อให้งานสารบรรณ (ไม่ต้องเซ็น)
async function adminForwardToSaraban(docId) {
    if (!confirm('ยืนยันการส่งเอกสารไปยังงานสารบรรณ?')) return;
    const safeId = docId.replace(/[\/\\:\.]/g, '-');
    try {
        showAlert('กำลังดำเนินการ', 'กำลังส่งเอกสารไปยังงานสารบรรณ...', false);
        const user = getCurrentUser();
        if (typeof db !== 'undefined') {
            await db.collection('requests').doc(safeId).set({
                docStatus:       'waiting_saraban',
                adminReviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
                adminReviewedBy: user?.name || user?.username || 'admin'
            }, { merge: true });
        }
        apiCall('POST', 'updateRequest', {
            requestId: docId,
            docStatus: 'waiting_saraban'
        }).catch(err => console.warn("Sheet update error:", err));

        document.getElementById('alert-modal').style.display = 'none';
        // แอดมินจะสร้างลิงก์ให้งานสารบรรณผ่านหน้า "จัดการลิงก์ลงนาม" เอง
        showAlert('✅ สำเร็จ', 'ส่งเอกสารไปงานสารบรรณเรียบร้อยแล้ว');
        loadPendingApprovals();
    } catch (e) {
        document.getElementById('alert-modal').style.display = 'none';
        showAlert('ผิดพลาด', e.message);
    }
}

// 5. สารบรรณ: โหลด PDF แล้วเปิดระบบออกเลขที่
async function openSarabanForApproval(docId) {
    const data   = window._approvalDocs?.[docId] || {};
    const pdfUrl = data.pdfUrl || data.memoPdfUrl || data.currentPdfUrl || '';

    if (!pdfUrl) {
        alert("ไม่พบไฟล์ PDF ในระบบ กรุณาติดต่อแอดมิน");
        return;
    }
    try {
        showAlert('กำลังโหลด', 'กำลังโหลดเอกสาร...', false);
        const response    = await fetch(pdfUrl);
        const arrayBuffer = await response.arrayBuffer();
        document.getElementById('alert-modal').style.display = 'none';
        openSarabanModal(arrayBuffer, docId);
    } catch (e) {
        document.getElementById('alert-modal').style.display = 'none';
        alert("ไม่สามารถโหลด PDF ได้: " + e.message);
    }
}
// ฟังก์ชันเปิด Modal และนำข้อมูลเดิมมาแสดง
window.openEditUserModal = function(uid, name, position, department, role) {
    document.getElementById('edit-uid').value = uid || '';
    document.getElementById('edit-name').value = name || '';
    document.getElementById('edit-position').value = position || '';
    document.getElementById('edit-department').value = department || '';
    
    // ตั้งค่า Role เดิมให้ถูกต้อง
    const roleSelect = document.getElementById('edit-role');
    if (roleSelect) {
        roleSelect.value = role || 'user';
    }
    
    // แสดง Modal
    const modal = document.getElementById('edit-user-modal');
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
};

// ฟังก์ชันบันทึกข้อมูลเมื่อกด Submit
// ฟังก์ชันบันทึกข้อมูลเมื่อกด Submit
async function handleEditUserSubmit(e) {
    e.preventDefault();
    
    // ดึงค่าจากฟอร์ม
    const username = document.getElementById('edit-uid').value; 
    const newName = document.getElementById('edit-name').value.trim();
    const newPosition = document.getElementById('edit-position').value.trim();
    const newDepartment = document.getElementById('edit-department').value.trim();
    const newRole = document.getElementById('edit-role').value;
    
    if (!username) {
        showAlert('ผิดพลาด', 'ไม่พบรหัสผู้ใช้งาน');
        return;
    }

    const btnText = document.getElementById('edit-user-btn-text');
    const submitBtn = document.getElementById('edit-user-submit');
    
    btnText.textContent = 'กำลังอัปเดต...';
    submitBtn.disabled = true;

    try {
        // 1. เตรียมข้อมูล Payload ให้ตรงกับที่ Code.gs ต้องการ
        const payload = {
            username: username,
            loginName: username, // ต้องส่งไปด้วย เพื่อไม่ให้ Code.gs ลบค่า LoginName เดิมทิ้ง
            fullName: newName,
            position: newPosition,
            department: newDepartment,
            role: newRole
        };

        // ★★★ จุดที่แก้ไข: เปลี่ยนชื่อ API จาก 'editUser' เป็น 'adminUpdateUser' ★★★
        const result = await apiCall('POST', 'adminUpdateUser', payload);

        if (result.status !== 'success') {
            throw new Error(result.message || 'ไม่สามารถอัปเดตข้อมูลใน Google Sheets ได้');
        }

        // 2. อัปเดตใน Firebase ควบคู่ไปด้วย
        if (typeof db !== 'undefined') {
            try {
                const snapshot = await db.collection('users').where('username', '==', username).get();
                if (!snapshot.empty) {
                    const batch = db.batch();
                    snapshot.forEach(doc => {
                        batch.update(doc.ref, {
                            fullName: newName,
                            position: newPosition,
                            department: newDepartment,
                            role: newRole,
                            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                        });
                    });
                    await batch.commit();
                }
            } catch (fbError) {
                console.warn("Firebase update warning:", fbError);
            }
        }
        
        showAlert('สำเร็จ', 'อัปเดตข้อมูลผู้ใช้เรียบร้อยแล้ว');
        document.getElementById('edit-user-modal').style.display = 'none';
        
        // โหลดตารางใหม่เพื่อให้ข้อมูลอัปเดตทันที
        if (typeof fetchAllUsers === 'function') {
            fetchAllUsers(); 
        }
        
    } catch (error) {
        console.error('Error updating user:', error);
        showAlert('ผิดพลาด', 'ไม่สามารถอัปเดตข้อมูลได้: ' + error.message);
    } finally {
        btnText.textContent = 'บันทึกข้อมูล';
        submitBtn.disabled = false;
    }
}

// ============================================================
// ระบบลายเซ็นผู้ขอ (Requester Signature System)
// ============================================================

// ตัวแปร global สำหรับ signature pad ในฟอร์ม (pre-submission)
let requesterSignaturePad = null;
// signature pad ในฟอร์มแก้ไข
let editSignaturePad = null;
// เก็บข้อมูลเอกสารล่าสุดที่สร้างเสร็จ (สำหรับ post-submission e-sign)
window._lastCreatedDoc = { id: null, pdfUrl: null };
// signature pad ใน draw modal (post-submission)
let _reqDrawPadInstance = null;

// --- 1. Initialize signature pad ในฟอร์ม (form-sig-canvas) ---
function initFormSignaturePad() {
    const canvas = document.getElementById('form-sig-canvas');
    if (!canvas) return;

    // ต้อง resize canvas ก่อนเสมอ เพราะ CSS width ≠ canvas pixel width
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d').scale(ratio, ratio);

    if (requesterSignaturePad) {
        requesterSignaturePad.clear();
    } else {
        requesterSignaturePad = new SignaturePad(canvas, {
            penColor: 'blue',
            minWidth: 1.0,
            maxWidth: 2.5
        });
    }
}

// --- 1b. Initialize signature pad ในฟอร์มแก้ไข (edit-sig-canvas) ---
function initEditSignaturePad() {
    const canvas = document.getElementById('edit-sig-canvas');
    if (!canvas) return;

    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d').scale(ratio, ratio);

    if (editSignaturePad) {
        editSignaturePad.clear();
    } else {
        editSignaturePad = new SignaturePad(canvas, {
            penColor: 'blue',
            minWidth: 1.0,
            maxWidth: 2.5
        });
        const clearBtn = document.getElementById('edit-sig-clear-btn');
        if (clearBtn) clearBtn.addEventListener('click', () => editSignaturePad && editSignaturePad.clear());
    }
}

// --- 2. เปิด draw modal สำหรับ post-submission e-sign ---
function openRequesterDrawSigModal() {
    const modal = document.getElementById('requester-draw-sig-modal');
    if (!modal) return;
    modal.classList.remove('hidden');

    const canvas = document.getElementById('requester-draw-canvas');
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d').scale(ratio, ratio);

    if (_reqDrawPadInstance) {
        _reqDrawPadInstance.clear();
    } else {
        _reqDrawPadInstance = new SignaturePad(canvas, {
            penColor: 'blue',
            minWidth: 1.0,
            maxWidth: 2.5
        });
    }
}

// --- 3. ยืนยันลายเซ็นใน draw modal → เปิด stamper modal กับ PDF ---
async function handleRequesterDrawConfirm() {
    if (!_reqDrawPadInstance || _reqDrawPadInstance.isEmpty()) {
        alert('กรุณาเซ็นชื่อก่อนกดยืนยันครับ');
        return;
    }

    const signatureBase64 = _reqDrawPadInstance.toDataURL('image/png');
    document.getElementById('requester-draw-sig-modal').classList.add('hidden');

    const pdfUrl = window._lastCreatedDoc.pdfUrl;
    if (!pdfUrl) {
        alert('ไม่พบไฟล์ PDF กรุณาลองใหม่');
        return;
    }

    try {
        showAlert('กำลังโหลด', 'กำลังโหลดเอกสารสำหรับลงนาม...', false);
        const response = await fetch(pdfUrl);
        if (!response.ok) throw new Error('โหลด PDF ไม่สำเร็จ');
        const pdfBlob = await response.blob();
        document.getElementById('alert-modal').style.display = 'none';

        // เรียก promptForSignature (ใน requests.js) → เปิด requester-stamper-modal
        const signedBlob = await promptForSignature(pdfBlob, signatureBase64);

        // อัปโหลดไฟล์ที่ลงนามแล้วกลับขึ้น Drive
        await reUploadSignedDocument(signedBlob);

    } catch (e) {
        document.getElementById('alert-modal').style.display = 'none';
        alert('เกิดข้อผิดพลาด: ' + e.message);
    }
}

// --- 4. อัปโหลดไฟล์ที่ลงนามแล้วและอัปเดต Firestore ---
async function reUploadSignedDocument(signedBlob) {
    const docId = window._lastCreatedDoc.id;
    if (!docId) { alert('ไม่พบรหัสเอกสาร'); return; }

    try {
        showAlert('กำลังบันทึก', 'กำลังบันทึกเอกสารที่ลงนามแล้ว...', false);

        const user = getCurrentUser();
        const base64 = await blobToBase64(signedBlob);
        const safeId = docId.replace(/[\/\\:\.]/g, '-');
        const filename = `memo_signed_${safeId}.pdf`;

        const uploadRes = await apiCall('POST', 'uploadGeneratedFile', {
            data: base64,
            filename: filename,
            mimeType: 'application/pdf',
            username: user?.username || 'user'
        });

        if (uploadRes.status !== 'success') throw new Error(uploadRes.message || 'Upload ไม่สำเร็จ');

        // อัปเดต Firestore ด้วย URL ใหม่
        if (typeof db !== 'undefined') {
            await db.collection('requests').doc(safeId).set({
                memoPdfUrl: uploadRes.url,
                pdfUrl: uploadRes.url,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }

        document.getElementById('alert-modal').style.display = 'none';
        showAlert('สำเร็จ', 'ลงนามเอกสารเรียบร้อยแล้ว!');
        if (typeof clearRequestsCache === 'function') clearRequestsCache();

    } catch (e) {
        document.getElementById('alert-modal').style.display = 'none';
        showAlert('ผิดพลาด', 'บันทึกไม่สำเร็จ: ' + e.message);
    }
}

// --- 5. แสดง form-result หลังสร้างเอกสารสำเร็จ ---
function showFormResult(title, message, pdfUrl, requestId) {
    // ซ่อนฟอร์ม แสดง result
    document.getElementById('request-form').classList.add('hidden');
    const resultDiv = document.getElementById('form-result');
    resultDiv.classList.remove('hidden');

    document.getElementById('form-result-title').textContent = title;
    document.getElementById('form-result-message').textContent = message;

    // ตั้งค่าปุ่มพิมพ์
    const btnPrint = document.getElementById('btn-print-doc');
    if (pdfUrl) {
        btnPrint.href = pdfUrl;
        btnPrint.classList.remove('hidden');
    } else {
        btnPrint.classList.add('hidden');
    }

    // เก็บข้อมูลสำหรับใช้กับ btn-esign-doc
    window._lastCreatedDoc = { id: requestId, pdfUrl: pdfUrl };
}

// --- 6. ปุ่ม "กลับหน้าหลัก" ใน form-result ---
function goToDashboardFromResult() {
    document.getElementById('form-result').classList.add('hidden');
    document.getElementById('request-form').classList.remove('hidden');
    if (typeof clearRequestsCache === 'function') clearRequestsCache();
    if (typeof fetchUserRequests === 'function') fetchUserRequests();
    switchPage('dashboard-page');
}

// --- 7. ผูก Event Listeners ทั้งหมด ---
document.addEventListener('DOMContentLoaded', function () {

    // ผูก form-sig-canvas (pre-submission pad)
    const formNavBtn = document.getElementById('user-nav-form');
    if (formNavBtn) {
        formNavBtn.addEventListener('click', () => setTimeout(initFormSignaturePad, 150));
    }
    // init ครั้งแรกเผื่อหน้า form เปิดตอนโหลด
    setTimeout(initFormSignaturePad, 500);

    // ปุ่มล้าง pre-submission pad
    document.getElementById('form-sig-clear-btn')?.addEventListener('click', () => {
        if (requesterSignaturePad) requesterSignaturePad.clear();
    });

    // ปุ่ม btn-esign-doc (post-submission)
    document.getElementById('btn-esign-doc')?.addEventListener('click', openRequesterDrawSigModal);

    // ปุ่มล้างใน draw modal
    document.getElementById('req-sig-clear-btn')?.addEventListener('click', () => {
        if (_reqDrawPadInstance) _reqDrawPadInstance.clear();
    });

    // ปุ่มยืนยันใน draw modal
    document.getElementById('req-sig-confirm-btn')?.addEventListener('click', handleRequesterDrawConfirm);
});
