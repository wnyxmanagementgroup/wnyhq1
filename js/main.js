// --- PAGE NAVIGATION ---

// 1. ฟังก์ชันสลับหน้าจอ (Router)
async function switchPage(targetPageId) {
    console.log("🔄 Switching to page:", targetPageId);
    
    // ซ่อนทุกหน้า
    document.querySelectorAll('.page-view').forEach(page => { 
        page.classList.add('hidden'); 
    });
    
    // แสดงหน้าเป้าหมาย
    const targetPage = document.getElementById(targetPageId);
    if (targetPage) { 
        targetPage.classList.remove('hidden'); 
    } else {
        console.error(`Page '${targetPageId}' not found in DOM`);
        return;
    }

    // อัปเดตปุ่มเมนู (Active State)
    document.querySelectorAll('.nav-button').forEach(btn => {
        btn.classList.remove('active');
        if(btn.dataset.target === targetPageId) { 
            btn.classList.add('active'); 
        }
    });

    // โหลดข้อมูลเฉพาะของแต่ละหน้า
    if (targetPageId === 'edit-page') { 
        // ถ้าเข้าหน้าแก้ไข ให้โหลด Event Listener ของหน้าแก้ไข (ถ้ามีฟังก์ชันนี้)
        if(typeof setupEditPageEventListeners === 'function') {
            setTimeout(() => { setupEditPageEventListeners(); }, 100); 
        }
    }
    
    if (targetPageId === 'dashboard-page') {
        if(typeof fetchUserRequests === 'function') await fetchUserRequests();
    }
    
    if (targetPageId === 'form-page') { 
        if(typeof resetRequestForm === 'function') await resetRequestForm(); 
        if(typeof tryAutoFillRequester === 'function') setTimeout(() => { tryAutoFillRequester(); }, 100); 
    }
    
    if (targetPageId === 'profile-page') {
        if(typeof loadProfileData === 'function') loadProfileData();
    }
    
    if (targetPageId === 'stats-page') {
        if(typeof loadStatsData === 'function') await loadStatsData();
    }
    
    if (targetPageId === 'admin-users-page') {
        if(typeof fetchAllUsers === 'function') await fetchAllUsers();
    }
    
    if (targetPageId === 'command-generation-page') { 
        const tab = document.getElementById('admin-view-requests-tab');
        if(tab) tab.click(); 
    }
}

// 2. [FIXED] ฟังก์ชันรีเซ็ตหน้าแก้ไข (ที่เคย error ว่าหาไม่เจอ)
function resetEditPage() {
    console.log("🔄 Resetting edit page state...");
    
    const editPage = document.getElementById('edit-page');
    if (editPage) editPage.classList.add('hidden');

    const navEdit = document.getElementById('nav-edit');
    if (navEdit) navEdit.classList.add('hidden');

    const editForm = document.getElementById('edit-request-form');
    if (editForm) editForm.reset();

    const attendeesList = document.getElementById('edit-attendees-list');
    if (attendeesList) attendeesList.innerHTML = '';

    sessionStorage.removeItem('currentEditRequestId');
    
    const editResult = document.getElementById('edit-result');
    if (editResult) editResult.classList.add('hidden');
    
    const editBtn = document.getElementById('generate-document-button');
    if (editBtn) editBtn.classList.remove('hidden');
}

// 3. ตั้งค่าตัวเลือกพาหนะ (Checkbox behavior)
function setupVehicleOptions() {
    document.querySelectorAll('input[name="vehicle_option"].vehicle-checkbox').forEach(checkbox => { 
        checkbox.addEventListener('change', (e) => {
            if(typeof toggleVehicleDetails === 'function') toggleVehicleDetails(e);
        }); 
    });
    // สำหรับหน้าแก้ไข (ถ้ามีฟังก์ชัน toggleEditVehicleDetails ใน requests.js)
    document.querySelectorAll('input[name="edit-vehicle_option"].vehicle-checkbox').forEach(checkbox => { 
        checkbox.addEventListener('change', () => {
            if(typeof toggleEditVehicleDetails === 'function') toggleEditVehicleDetails();
        }); 
    });
}

// 4. ตั้งค่า Event Listeners ทั้งหมดของระบบ
function setupEventListeners() {
    console.log("🛠 Setting up event listeners...");

    // Auth Events
    const loginForm = document.getElementById('login-form');
    if(loginForm) loginForm.addEventListener('submit', handleLogin);
    
    const logoutBtn = document.getElementById('logout-button');
    if(logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    
    const showRegBtn = document.getElementById('show-register-modal-button');
    if(showRegBtn) showRegBtn.addEventListener('click', () => document.getElementById('register-modal').style.display = 'flex');
    
    const regForm = document.getElementById('register-form');
    if(regForm) regForm.addEventListener('submit', handleRegister);
    
    // Forgot Password Events
    const showForgotBtn = document.getElementById('show-forgot-password-modal');
    if(showForgotBtn) showForgotBtn.addEventListener('click', () => document.getElementById('forgot-password-modal').style.display = 'flex');
    
    const closeForgotBtn = document.getElementById('forgot-password-modal-close-button');
    if(closeForgotBtn) closeForgotBtn.addEventListener('click', () => document.getElementById('forgot-password-modal').style.display = 'none');
    
    const cancelForgotBtn = document.getElementById('forgot-password-cancel-button');
    if(cancelForgotBtn) cancelForgotBtn.addEventListener('click', () => document.getElementById('forgot-password-modal').style.display = 'none');
    
    const forgotForm = document.getElementById('forgot-password-form');
    if(forgotForm) forgotForm.addEventListener('submit', handleForgotPassword);

    // Public Modal Events
    const closePublicModalBtn = document.getElementById('public-attendee-modal-close-button');
    if(closePublicModalBtn) closePublicModalBtn.addEventListener('click', () => document.getElementById('public-attendee-modal').style.display = 'none');
    
    const closePublicModalBtn2 = document.getElementById('public-attendee-modal-close-btn2');
    if(closePublicModalBtn2) closePublicModalBtn2.addEventListener('click', () => document.getElementById('public-attendee-modal').style.display = 'none');
    
    // Admin Command Events
    const backAdminBtn = document.getElementById('back-to-admin-command');
    if(backAdminBtn) backAdminBtn.addEventListener('click', async () => { await switchPage('command-generation-page'); });
    
    const genCommandBtn = document.getElementById('admin-generate-command-button');
    if(genCommandBtn) genCommandBtn.addEventListener('click', handleAdminGenerateCommand);
    
    setupVehicleOptions();

    // Stats Events
    const refreshStatsBtn = document.getElementById('refresh-stats');
    if(refreshStatsBtn) refreshStatsBtn.addEventListener('click', async () => { await loadStatsData(); showAlert('สำเร็จ', 'อัปเดตข้อมูลสถิติเรียบร้อยแล้ว'); });
    
    const exportStatsBtn = document.getElementById('export-stats');
    if(exportStatsBtn) exportStatsBtn.addEventListener('click', exportStatsReport);

    // Navigation Events
    const navContainer = document.getElementById('navigation');
    if(navContainer) {
        navContainer.addEventListener('click', async (e) => {
            const navButton = e.target.closest('.nav-button');
            if (navButton && navButton.dataset.target) { await switchPage(navButton.dataset.target); }
        });
    }

    // Modal Close Events (Global)
    document.querySelectorAll('.modal').forEach(modal => { 
        modal.addEventListener('click', (e) => { 
            if (e.target === modal) modal.style.display = 'none'; 
        }); 
    });
    
    const regCloseBtn = document.getElementById('register-modal-close-button');
    if(regCloseBtn) regCloseBtn.addEventListener('click', () => document.getElementById('register-modal').style.display = 'none');
    
    const regCloseBtn2 = document.getElementById('register-modal-close-button2');
    if(regCloseBtn2) regCloseBtn2.addEventListener('click', () => document.getElementById('register-modal').style.display = 'none');
    
    const alertCloseBtn = document.getElementById('alert-modal-close-button');
    if(alertCloseBtn) alertCloseBtn.addEventListener('click', () => document.getElementById('alert-modal').style.display = 'none');
    
    const alertOkBtn = document.getElementById('alert-modal-ok-button');
    if(alertOkBtn) alertOkBtn.addEventListener('click', () => document.getElementById('alert-modal').style.display = 'none');
    
    const confirmCloseBtn = document.getElementById('confirm-modal-close-button');
    if(confirmCloseBtn) confirmCloseBtn.addEventListener('click', () => document.getElementById('confirm-modal').style.display = 'none');
    
    const sendMemoCloseBtn = document.getElementById('send-memo-modal-close-button');
    if(sendMemoCloseBtn) sendMemoCloseBtn.addEventListener('click', () => document.getElementById('send-memo-modal').style.display = 'none');
    
    const sendMemoCancelBtn = document.getElementById('send-memo-cancel-button');
    if(sendMemoCancelBtn) sendMemoCancelBtn.addEventListener('click', () => document.getElementById('send-memo-modal').style.display = 'none');

    // Admin Approval Events
    const commandApproveForm = document.getElementById('command-approval-form');
    if(commandApproveForm) commandApproveForm.addEventListener('submit', handleCommandApproval);
    
    const commandApproveClose = document.getElementById('command-approval-modal-close-button');
    if(commandApproveClose) commandApproveClose.addEventListener('click', () => document.getElementById('command-approval-modal').style.display = 'none');
    
    const commandApproveCancel = document.getElementById('command-approval-cancel-button');
    if(commandApproveCancel) commandApproveCancel.addEventListener('click', () => document.getElementById('command-approval-modal').style.display = 'none');
    
    // Dispatch Book Events
    const dispatchForm = document.getElementById('dispatch-form');
    if(dispatchForm) dispatchForm.addEventListener('submit', handleDispatchFormSubmit);
    
    const dispatchClose = document.getElementById('dispatch-modal-close-button');
    if(dispatchClose) dispatchClose.addEventListener('click', () => document.getElementById('dispatch-modal').style.display = 'none');
    
    const dispatchCancel = document.getElementById('dispatch-cancel-button');
    if(dispatchCancel) dispatchCancel.addEventListener('click', () => document.getElementById('dispatch-modal').style.display = 'none');
    
    // Admin Memo Action Events
    const adminMemoForm = document.getElementById('admin-memo-action-form');
    if(adminMemoForm) adminMemoForm.addEventListener('submit', handleAdminMemoActionSubmit);
    
    const adminMemoClose = document.getElementById('admin-memo-action-modal-close-button');
    if(adminMemoClose) adminMemoClose.addEventListener('click', () => document.getElementById('admin-memo-action-modal').style.display = 'none');
    
    const adminMemoCancel = document.getElementById('admin-memo-cancel-button');
    if(adminMemoCancel) adminMemoCancel.addEventListener('click', () => document.getElementById('admin-memo-action-modal').style.display = 'none');
    
    const adminMemoStatus = document.getElementById('admin-memo-status');
    if(adminMemoStatus) {
        adminMemoStatus.addEventListener('change', function(e) {
            const fileUploads = document.getElementById('admin-file-uploads');
            if (e.target.value === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน') { 
                fileUploads.classList.remove('hidden'); 
            } else { 
                fileUploads.classList.add('hidden'); 
            }
        });
    }

    // Request Form Events
    const reqForm = document.getElementById('request-form');
    if(reqForm) reqForm.addEventListener('submit', handleRequestFormSubmit); // ฟังก์ชันนี้ต้องอยู่ใน requests.js
    
    const addAttendeeBtn = document.getElementById('form-add-attendee');
    if(addAttendeeBtn) addAttendeeBtn.addEventListener('click', () => addAttendeeField());
    
    const importExcelBtn = document.getElementById('form-import-excel');
    if(importExcelBtn) importExcelBtn.addEventListener('click', () => document.getElementById('excel-file-input').click());
    
    const excelInput = document.getElementById('excel-file-input');
    if(excelInput) excelInput.addEventListener('change', handleExcelImport); 
    
    const dlTemplateBtn = document.getElementById('form-download-template');
    if(dlTemplateBtn) dlTemplateBtn.addEventListener('click', downloadAttendeeTemplate); 
    
    document.querySelectorAll('input[name="expense_option"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            if(typeof toggleExpenseOptions === 'function') toggleExpenseOptions();
        });
    });
    
    // Memo Modal Submit
    const memoModalForm = document.getElementById('send-memo-form');
    if(memoModalForm) memoModalForm.addEventListener('submit', handleMemoSubmitFromModal); // ฟังก์ชันนี้ต้องอยู่ใน requests.js
    
    document.querySelectorAll('input[name="modal_memo_type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const fileContainer = document.getElementById('modal-memo-file-container');
            const fileInput = document.getElementById('modal-memo-file');
            const isReimburse = e.target.value === 'reimburse';
            if(fileContainer) fileContainer.classList.toggle('hidden', isReimburse);
            if(fileInput) fileInput.required = !isReimburse;
        });
    });
    
    // Profile & Password Events
    const profileForm = document.getElementById('profile-form');
    if(profileForm) profileForm.addEventListener('submit', handleProfileUpdate);
    
    const pwForm = document.getElementById('password-form');
    if(pwForm) pwForm.addEventListener('submit', handlePasswordUpdate);
    
    const showPwToggle = document.getElementById('show-password-toggle');
    if(showPwToggle) showPwToggle.addEventListener('change', togglePasswordVisibility);
    
    // Form Auto-fill Logic
    const deptSelect = document.getElementById('form-department');
    if(deptSelect) {
        deptSelect.addEventListener('change', (e) => {
            const selectedPosition = e.target.value;
            const headNameInput = document.getElementById('form-head-name');
            // specialPositionMap ต้องถูกประกาศใน config.js
            if(typeof specialPositionMap !== 'undefined') {
                headNameInput.value = specialPositionMap[selectedPosition] || '';
            }
        });
    }
    
    // Search Events
    const searchReqInput = document.getElementById('search-requests');
    if(searchReqInput) {
        searchReqInput.addEventListener('input', (e) => {
            // allRequestsCache, userMemosCache ต้องอยู่ใน config.js
            if(typeof renderRequestsList === 'function' && typeof allRequestsCache !== 'undefined') {
                 // กรองและแสดงผลใหม่ (อาจต้องปรับ logic ใน requests.js ให้รับค่า search)
                 // ปกติ renderRequestsList รับ (requests)
                 const term = e.target.value.toLowerCase();
                 const filtered = allRequestsCache.filter(r => 
                     (r.purpose && r.purpose.toLowerCase().includes(term)) ||
                     (r.location && r.location.toLowerCase().includes(term))
                 );
                 renderRequestsList(filtered);
            }
        });
    }

    // Admin User Management
    const addUserBtn = document.getElementById('add-user-button');
    if(addUserBtn) addUserBtn.addEventListener('click', openAddUserModal);
    
    const dlUserTemplateBtn = document.getElementById('download-user-template-button');
    if(dlUserTemplateBtn) dlUserTemplateBtn.addEventListener('click', downloadUserTemplate);
    
    const importUsersBtn = document.getElementById('import-users-button');
    if(importUsersBtn) importUsersBtn.addEventListener('click', () => document.getElementById('user-excel-input').click());
    
    const userExcelInput = document.getElementById('user-excel-input');
    if(userExcelInput) userExcelInput.addEventListener('change', handleUserImport);
    
    // Admin Tabs
    const reqTab = document.getElementById('admin-view-requests-tab');
    if(reqTab) {
        reqTab.addEventListener('click', async (e) => {
            document.getElementById('admin-view-memos-tab').classList.remove('active');
            e.target.classList.add('active');
            document.getElementById('admin-requests-view').classList.remove('hidden');
            document.getElementById('admin-memos-view').classList.add('hidden');
            if(typeof fetchAllRequestsForCommand === 'function') await fetchAllRequestsForCommand();
        });
    }
    
    const memoTab = document.getElementById('admin-view-memos-tab');
    if(memoTab) {
        memoTab.addEventListener('click', async (e) => {
            document.getElementById('admin-view-requests-tab').classList.remove('active');
            e.target.classList.add('active');
            document.getElementById('admin-memos-view').classList.remove('hidden');
            document.getElementById('admin-requests-view').classList.add('hidden');
            if(typeof fetchAllMemos === 'function') await fetchAllMemos();
        });
    }

    // Global Error Handlers
    window.addEventListener('error', (event) => {
        console.error('Global error:', event.error);
        if (event.error && event.error.message && event.error.message.includes('openEditPageDirect')) return;
        // ปิด alert ไว้ก่อน เพื่อไม่ให้รบกวนผู้ใช้มากเกินไปถ้าเป็น error เล็กน้อย
        // showAlert("ข้อผิดพลาดระบบ", "เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณารีเฟรชหน้าเว็บ");
    });
    
    window.addEventListener('unhandledrejection', (event) => {
        console.error('Unhandled promise rejection:', event.reason);
        // showAlert("ข้อผิดพลาดระบบ", "เกิดข้อผิดพลาดในการทำงาน กรุณารีเฟรชหน้าเว็บ");
    });
}

// 5. นำเข้า Excel ผู้ร่วมเดินทาง (Utility)
function handleExcelImport(e) {
    const file = e.target.files[0]; 
    if (!file) return;
    
    try {
        const reader = new FileReader();
        reader.onload = async function(e) {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);
            
            const attendeesList = document.getElementById('form-attendees-list');
            attendeesList.innerHTML = ''; // ล้างค่าเก่า
            
            jsonData.forEach(row => {
                // รองรับชื่อคอลัมน์หลายแบบ
                const name = row['ชื่อ-นามสกุล'] || row['ชื่อ'] || row['Name'];
                const position = row['ตำแหน่ง'] || row['Position'] || 'ครู';
                
                if (name) {
                    if(typeof addAttendeeField === 'function') {
                        addAttendeeField(name, position);
                    }
                }
            });
            showAlert('สำเร็จ', 'นำเข้าข้อมูลผู้ร่วมเดินทางสำเร็จ');
        };
        reader.readAsArrayBuffer(file);
    } catch (error) { 
        showAlert('ผิดพลาด', 'รูปแบบไฟล์ไม่ถูกต้อง: ' + error.message); 
    } finally { 
        e.target.value = ''; 
    }
}

function downloadAttendeeTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([['ชื่อ-นามสกุล', 'ตำแหน่ง'],['ตัวอย่าง สมชาย', 'ครู']]);
    const wb = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'attendee_template.xlsx');
}

// 6. เพิ่มความปลอดภัยให้ฟังก์ชันแก้ไข (Fail-safe)
function enhanceEditFunctionSafety() {
    const requiredFunctions = ['openEditPage', 'generateDocumentFromDraft', 'getEditFormData'];
    requiredFunctions.forEach(funcName => {
        if (typeof window[funcName] !== 'function') {
            // ถ้าไม่มีฟังก์ชัน ให้สร้างตัวปลอมไว้กัน error
            console.warn(`Function ${funcName} is missing, creating placeholder.`);
            window[funcName] = function() { 
                console.error(`${funcName} called but not defined.`);
                showAlert("ระบบผิดพลาด", "ฟังก์ชันไม่พร้อมใช้งาน กรุณารีเฟรชหน้า"); 
            };
        }
    });
}

// 7. MAIN INITIALIZATION
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 App Initializing...');
    
    // โหลดข้อมูล Dashboard หน้า Login (ต้องมี loadPublicWeeklyData ใน requests.js)
    if(typeof loadPublicWeeklyData === 'function') {
        loadPublicWeeklyData();
    } else {
        console.warn('loadPublicWeeklyData not found in requests.js');
    }
    
    setupEventListeners();
    enhanceEditFunctionSafety();
    
    // ตั้งค่า ChartJS
    if(typeof Chart !== 'undefined') {
        Chart.defaults.font.family = "'Sarabun', sans-serif";
        Chart.defaults.font.size = 14;
        Chart.defaults.color = '#374151';
    }
    
    // รีเซ็ตหน้าแก้ไข
    const navEdit = document.getElementById('nav-edit');
    if (navEdit) navEdit.classList.add('hidden');
    resetEditPage();
    
    // ตรวจสอบ Session ผู้ใช้
    const user = getCurrentUser();
    if (user) { 
        if(typeof initializeUserSession === 'function') {
            initializeUserSession(user); 
        }
    } else { 
        if(typeof showLoginScreen === 'function') {
            showLoginScreen(); 
        }
    }
    
    // Event Delegate สำหรับปุ่ม Action ในตาราง (Edit, Delete, PDF)
    // เพื่อให้ปุ่มที่ render ทีหลังทำงานได้
    document.body.addEventListener('click', function(e) {
        // เช็คว่ากดปุ่มที่มี data-action หรือไม่
        const targetBtn = e.target.closest('button[data-action]');
        if(targetBtn) {
            if(typeof handleRequestAction === 'function') {
                handleRequestAction(e);
            }
        }
    });
});
