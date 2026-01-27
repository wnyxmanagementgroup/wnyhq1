// --- REQUEST FUNCTIONS (HYBRID SYSTEM: Firebase + GAS) ---

// จัดการปุ่ม Action ต่างๆ (แก้ไข, ลบ, ส่งบันทึก)
async function handleRequestAction(e) {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const requestId = button.dataset.id;
    const action = button.dataset.action;

    console.log("Action triggered:", action, "Request ID:", requestId);

    if (action === 'edit') {
        console.log("🔄 Opening edit page for:", requestId);
        await openEditPage(requestId);
        
    } else if (action === 'delete') {
        console.log("🗑️ Deleting request:", requestId);
        await handleDeleteRequest(requestId);
        
    } else if (action === 'send-memo') {
        console.log("📤 Opening send memo modal for:", requestId);
        document.getElementById('memo-modal-request-id').value = requestId;
        document.getElementById('send-memo-modal').style.display = 'flex';
    }
}

// ลบคำขอ (ลบทั้งใน GAS และ Firebase)
async function handleDeleteRequest(requestId) {
    try {
        const user = getCurrentUser();
        if (!user) {
            showAlert('ผิดพลาด', 'กรุณาเข้าสู่ระบบใหม่');
            return;
        }

        const confirmed = await showConfirm(
            'ยืนยันการลบ', 
            `คุณแน่ใจหรือไม่ว่าต้องการลบคำขอ ${requestId}? การกระทำนี้ไม่สามารถย้อนกลับได้`
        );

        if (!confirmed) return;

        // 1. ส่งคำสั่งลบไปที่ Google Apps Script (Master Data)
        const result = await apiCall('POST', 'deleteRequest', {
            requestId: requestId,
            username: user.username
        });

        if (result.status === 'success') {
            
            // 2. ลบข้อมูลใน Firebase (ถ้าเปิดใช้งาน Hybrid)
            if (typeof db !== 'undefined' && typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE) {
                try {
                    // หาเอกสารที่มี requestId ตรงกันแล้วลบ
                    const query = await db.collection('requests').where('requestId', '==', requestId).get();
                    if (!query.empty) {
                        const batch = db.batch();
                        query.docs.forEach(doc => batch.delete(doc.ref));
                        await batch.commit();
                        console.log("✅ Deleted from Firebase:", requestId);
                    }
                } catch (fbError) {
                    console.warn("⚠️ Failed to delete from Firebase:", fbError);
                }
            }

            showAlert('สำเร็จ', 'ลบคำขอเรียบร้อยแล้ว');
            
            clearRequestsCache();
            await fetchUserRequests(); // โหลดข้อมูลใหม่
            
            // ถ้าอยู่ในหน้า Edit ให้เด้งกลับ Dashboard
            if (document.getElementById('edit-page').classList.contains('hidden') === false) {
                await switchPage('dashboard-page');
            }
            
        } else {
            showAlert('ผิดพลาด', result.message || 'ไม่สามารถลบคำขอได้');
        }

    } catch (error) {
        console.error('Error deleting request:', error);
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการลบคำขอ: ' + error.message);
    }
}



// ✅ [แก้ไข] ดึงข้อมูลและกรองเฉพาะของฉัน (สำหรับ Dashboard)
// --- แก้ไขใน js/requests.js ---

async function fetchUserRequests() {
    try {
        const user = getCurrentUser();
        if (!user) return;

        // 1. ตรวจสอบปีที่เลือก
        const yearSelect = document.getElementById('user-year-select');
        const selectedYear = yearSelect ? parseInt(yearSelect.value) : (new Date().getFullYear() + 543);
        const currentYear = new Date().getFullYear() + 543;
        
        const isHistoryMode = selectedYear !== currentYear; // เช็คว่าเป็นโหมดดูย้อนหลังหรือไม่

        document.getElementById('requests-loader').classList.remove('hidden');
        document.getElementById('requests-list').classList.add('hidden');
        document.getElementById('no-requests-message').classList.add('hidden');

        let requestsData = [];
        let memosData = [];

        // 2. Logic การดึงข้อมูลแยกตามโหมด
        if (isHistoryMode) {
            console.log(`📜 Fetching HISTORY data for year ${selectedYear} directly from GAS...`);
            
            // ★ ยิงตรงไป GAS (ไม่ผ่าน Firebase)
            const res = await apiCall('GET', 'getRequestsByYear', { 
                year: selectedYear, 
                username: user.username 
            });
            
            if (res.status === 'success') requestsData = res.data;
            
            // (Optional) อาจต้องดึง Memo ของปีนั้นด้วย ถ้า API แยกกัน
            // const memoRes = await apiCall('GET', 'getMemosByYear', { ... });

        } else {
            // ★ โหมดปกติ (ปีปัจจุบัน) ใช้ Hybrid/Firebase เหมือนเดิม
            if (typeof fetchRequestsHybrid === 'function' && typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE) {
                const firebaseResult = await fetchRequestsHybrid(user);
                if (firebaseResult !== null) {
                    requestsData = firebaseResult;
                } else {
                    const res = await apiCall('GET', 'getUserRequests', { username: user.username });
                    if (res.status === 'success') requestsData = res.data;
                }
            } else {
                const res = await apiCall('GET', 'getUserRequests', { username: user.username });
                if (res.status === 'success') requestsData = res.data;
            }
            
            // ดึง Memo ปัจจุบัน
            const memosResult = await apiCall('GET', 'getSentMemos', { username: user.username });
            if (memosResult.status === 'success') memosData = memosResult.data || [];
        }

        // 3. กรองและเรียงลำดับ
        if (requestsData && requestsData.length > 0) {
            // ถ้าเป็น GAS (History) อาจจะกรองมาให้แล้ว แต่กรองซ้ำเพื่อความชัวร์
            requestsData = requestsData.filter(req => req.username === user.username);
            
            requestsData.sort((a, b) => {
                const dateA = new Date(a.timestamp || a.docDate || 0).getTime();
                const dateB = new Date(b.timestamp || b.docDate || 0).getTime();
                return dateB - dateA;
            });
        }

        // 4. แสดงผล
        allRequestsCache = requestsData;
        userMemosCache = memosData;
        renderRequestsList(allRequestsCache, userMemosCache);
        
        // ถ้าเป็นโหมดประวัติ อาจปิดการแจ้งเตือนหรือปุ่มแก้ไขบางอย่าง
        if (!isHistoryMode) {
            updateNotifications(allRequestsCache, userMemosCache);
        }

    } catch (error) {
        console.error('Error fetching requests:', error);
        showAlert('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลได้');
    } finally {
        document.getElementById('requests-loader').classList.add('hidden');
    }
}

// ... (ส่วนล่าง renderRequestsList และอื่นๆ คงเดิม) ...

// แสดงรายการคำขอ (Render UI)
function renderRequestsList(requests, memos, searchTerm = '') {
    const container = document.getElementById('requests-list');
    const noRequestsMessage = document.getElementById('no-requests-message');
    
    if (!requests || requests.length === 0) {
        container.classList.add('hidden');
        noRequestsMessage.classList.remove('hidden');
        return;
    }

    let filteredRequests = requests;
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filteredRequests = requests.filter(req => 
            (req.purpose && req.purpose.toLowerCase().includes(term)) ||
            (req.location && req.location.toLowerCase().includes(term)) ||
            (req.id && req.id.toLowerCase().includes(term))
        );
    }

    if (filteredRequests.length === 0) {
        container.classList.add('hidden');
        noRequestsMessage.classList.remove('hidden');
        noRequestsMessage.textContent = 'ไม่พบคำขอที่ตรงกับการค้นหา';
        return;
    }

    container.innerHTML = filteredRequests.map(request => {
        const relatedMemo = memos.find(memo => memo.refNumber === request.id);
        
        let displayRequestStatus = request.status;
        let displayCommandStatus = request.commandStatus;
        
        // ถ้ามี Memo ให้ใช้สถานะจาก Memo แทน (ในกรณีที่ยังไม่ได้ Sync)
        if (relatedMemo) {
            displayRequestStatus = relatedMemo.status;
            displayCommandStatus = relatedMemo.status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' ? 'เสร็จสิ้น' : relatedMemo.status;
        }
        
        // ตรวจสอบไฟล์ที่เสร็จสมบูรณ์ (Priority: จาก Memo -> จาก Request เอง)
        const completedMemoUrl = relatedMemo?.completedMemoUrl || request.completedMemoUrl;
        const completedCommandUrl = relatedMemo?.completedCommandUrl || request.completedCommandUrl;
        const dispatchBookUrl = relatedMemo?.dispatchBookUrl || request.dispatchBookUrl;

        const hasCompletedFiles = completedMemoUrl || completedCommandUrl || dispatchBookUrl;
        
        const isFullyCompleted = displayRequestStatus === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' || displayRequestStatus === 'เสร็จสิ้น';
        
        // Sanitization (ป้องกัน XSS)
        const safeId = escapeHtml(request.id || request.requestId || 'รอออกเลข');
        const safePurpose = escapeHtml(request.purpose || 'ไม่มีวัตถุประสงค์');
        const safeLocation = escapeHtml(request.location || 'ไม่ระบุ');
        const safeDate = `${formatDisplayDate(request.startDate)} - ${formatDisplayDate(request.endDate)}`;
        
        return `
            <div class="border rounded-lg p-4 mb-4 bg-white shadow-sm ${isFullyCompleted ? 'border-green-300 bg-green-50' : ''} hover:shadow-md transition-all">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-2">
                            <h3 class="font-bold text-lg text-indigo-700">${safeId}</h3>
                            ${isFullyCompleted ? `
                                <span class="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full border border-green-200">
                                    ✅ เสร็จสิ้น
                                </span>
                            ` : ''}
                            ${displayRequestStatus === 'นำกลับไปแก้ไข' ? `
                                <span class="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full border border-red-200">
                                    ⚠️ ต้องแก้ไข
                                </span>
                            ` : ''}
                        </div>
                        <p class="text-gray-700 font-medium mb-1">${safePurpose}</p>
                        <p class="text-sm text-gray-500">📍 ${safeLocation} | 📅 ${safeDate}</p>
                        
                        <div class="mt-3 space-y-1">
                            <p class="text-sm">
                                <span class="font-medium">สถานะคำขอ:</span> 
                                <span class="${getStatusColor(displayRequestStatus)}">${translateStatus(displayRequestStatus)}</span>
                            </p>
                            <p class="text-sm">
                                <span class="font-medium">สถานะคำสั่ง:</span> 
                                <span class="${getStatusColor(displayCommandStatus || 'กำลังดำเนินการ')}">${translateStatus(displayCommandStatus || 'กำลังดำเนินการ')}</span>
                            </p>
                        </div>
                        
                        ${hasCompletedFiles ? `
                            <div class="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                                <p class="text-sm font-medium text-green-800 mb-2">📁 ไฟล์ที่พร้อมดาวน์โหลด:</p>
                                <div class="flex flex-wrap gap-2">
                                    ${completedMemoUrl ? `
                                        <a href="${completedMemoUrl}" target="_blank" class="btn btn-success btn-sm text-xs py-1 px-2">
                                            📄 บันทึกข้อความ
                                        </a>
                                    ` : ''}
                                    ${completedCommandUrl ? `
                                        <a href="${completedCommandUrl}" target="_blank" class="btn bg-blue-500 hover:bg-blue-600 text-white btn-sm text-xs py-1 px-2">
                                            📋 คำสั่ง
                                        </a>
                                    ` : ''}
                                    ${dispatchBookUrl ? `
                                        <a href="${dispatchBookUrl}" target="_blank" class="btn bg-purple-500 hover:bg-purple-600 text-white btn-sm text-xs py-1 px-2">
                                            📦 หนังสือส่ง
                                        </a>
                                    ` : ''}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="flex flex-col gap-2 ml-4 min-w-[100px]">
                        ${request.pdfUrl ? `
                            <a href="${request.pdfUrl}" target="_blank" class="btn btn-success btn-sm w-full text-center">
                                📄 ดูคำขอ
                            </a>
                        ` : ''}
                        
                        ${!isFullyCompleted ? `
                            <button data-action="edit" data-id="${request.id || request.requestId}" class="btn bg-blue-500 hover:bg-blue-600 text-white btn-sm w-full">
                                ✏️ แก้ไข
                            </button>
                        ` : ''}
                        
                        ${!isFullyCompleted ? `
                            <button data-action="delete" data-id="${request.id || request.requestId}" class="btn btn-danger btn-sm w-full">
                                🗑️ ลบ
                            </button>
                        ` : ''}
                        
                        ${(displayRequestStatus === 'นำกลับไปแก้ไข' || !relatedMemo) && !isFullyCompleted ? `
                            <button data-action="send-memo" data-id="${request.id || request.requestId}" class="btn bg-green-500 hover:bg-green-600 text-white btn-sm w-full">
                                📤 ส่งบันทึก
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.classList.remove('hidden');
    noRequestsMessage.classList.add('hidden');

    container.addEventListener('click', handleRequestAction);
}

// --- EDIT PAGE FUNCTIONS ---

function resetEditPage() {
    console.log("🧹 Resetting edit page...");
    
    document.getElementById('edit-request-form').reset();
    document.getElementById('edit-attendees-list').innerHTML = '';
    document.getElementById('edit-result').classList.add('hidden');
    
    sessionStorage.removeItem('currentEditRequestId');
    document.getElementById('edit-request-id').value = '';
    document.getElementById('edit-draft-id').value = '';
    
    console.log("✅ Edit page reset complete");
}

function setupEditPageEventListeners() {
    document.getElementById('back-to-dashboard').addEventListener('click', () => {
        console.log("🏠 Returning to dashboard from edit page");
        switchPage('dashboard-page');
    });
    
    document.getElementById('generate-document-button').addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        console.log("Generate document button clicked");
        generateDocumentFromDraft();
    });
    
    document.getElementById('edit-add-attendee').addEventListener('click', () => addEditAttendeeField());
    
    document.querySelectorAll('input[name="edit-expense_option"]').forEach(radio => {
        radio.addEventListener('change', toggleEditExpenseOptions);
    });
    
    document.querySelectorAll('input[name="edit-vehicle_option"]').forEach(radio => {
        radio.addEventListener('change', toggleEditVehicleDetails); // Use the toggleDetails helper
    });
    
    document.getElementById('edit-department').addEventListener('change', (e) => {
        const selectedPosition = e.target.value;
        const headNameInput = document.getElementById('edit-head-name');
        headNameInput.value = specialPositionMap[selectedPosition] || '';
    });
}

async function populateEditForm(requestData) {
    try {
        console.log("Populating edit form with:", requestData);
        document.getElementById('edit-draft-id').value = requestData.draftId || '';
        document.getElementById('edit-request-id').value = requestData.requestId || requestData.id || '';
        
        const formatDateForInput = (dateValue) => {
            if (!dateValue) return '';
            try {
                const date = new Date(dateValue);
                if (isNaN(date)) return '';
                return date.toISOString().split('T')[0];
            } catch (e) { return ''; }
        };
        
        document.getElementById('edit-doc-date').value = formatDateForInput(requestData.docDate);
        document.getElementById('edit-requester-name').value = requestData.requesterName || '';
        document.getElementById('edit-requester-position').value = requestData.requesterPosition || '';
        document.getElementById('edit-location').value = requestData.location || '';
        document.getElementById('edit-purpose').value = requestData.purpose || '';
        document.getElementById('edit-start-date').value = formatDateForInput(requestData.startDate);
        document.getElementById('edit-end-date').value = formatDateForInput(requestData.endDate);
        
        // --- ส่วนที่แก้ไข (แก้ชื่อตัวแปรซ้ำจาก attendeesList เป็น attendeesListEl และ attendeesData) ---
        const attendeesListEl = document.getElementById('edit-attendees-list');
        if (attendeesListEl) attendeesListEl.innerHTML = '';
        
        // ใช้ชื่อตัวแปรใหม่ 'attendeesData' เพื่อไม่ให้ชนกับ Element ID
        let attendeesData = [];
        if (requestData.attendees) {
            if (Array.isArray(requestData.attendees)) {
                attendeesData = requestData.attendees;
            } else if (typeof requestData.attendees === 'string') {
                try {
                    attendeesData = JSON.parse(requestData.attendees);
                } catch (e) {
                    console.warn("Parse attendees error:", e);
                    attendeesData = [];
                }
            }
        }

        // วนลูปแสดงข้อมูล
        if (attendeesData && attendeesData.length > 0) {
            attendeesData.forEach((attendee) => {
                // รองรับทั้งเคสที่มี Property name/position หรือไม่มี (เผื่อข้อมูลเก่า)
                const name = attendee.name || attendee['ชื่อ-นามสกุล'] || '';
                const position = attendee.position || attendee['ตำแหน่ง'] || '';
                
                if (name) {
                    addEditAttendeeField(name, position);
                }
            });
        }
        // ---------------------------------------------------------------------------
        
        if (requestData.expenseOption === 'partial') {
            document.getElementById('edit-expense_partial').checked = true;
            toggleEditExpenseOptions();
            
            if (requestData.expenseItems && requestData.expenseItems.length > 0) {
                const expenseItems = Array.isArray(requestData.expenseItems) ? 
                    requestData.expenseItems : JSON.parse(requestData.expenseItems || '[]');
                    
                expenseItems.forEach(item => {
                    const checkboxes = document.querySelectorAll('input[name="edit-expense_item"]');
                    checkboxes.forEach(chk => {
                        if (chk.dataset.itemName === item.name) {
                            chk.checked = true;
                            if (item.name === 'ค่าใช้จ่ายอื่นๆ' && item.detail) {
                                document.getElementById('edit-expense_other_text').value = item.detail;
                            }
                        }
                    });
                });
            }
            if (requestData.totalExpense) {
                document.getElementById('edit-total-expense').value = requestData.totalExpense;
            }
        } else {
            document.getElementById('edit-expense_no').checked = true;
            toggleEditExpenseOptions();
        }
        
        if (requestData.vehicleOption) {
            const vehicleRadio = document.getElementById(`edit-vehicle_${requestData.vehicleOption}`);
            if (vehicleRadio) {
                vehicleRadio.checked = true;
                toggleEditVehicleDetails();
                
                if (requestData.vehicleOption === 'private' && requestData.licensePlate) {
                    document.getElementById('edit-license-plate').value = requestData.licensePlate;
                }
                 if (requestData.vehicleOption === 'public' && requestData.publicVehicleDetails) {
                     // ใช้ ID ที่ถูกต้องตาม HTML ที่แก้ไปก่อนหน้า
                     const publicInput = document.getElementById('edit-public-vehicle-details');
                     if(publicInput) publicInput.value = requestData.publicVehicleDetails;
                }
            }
        }
        
        if (requestData.department) {
            document.getElementById('edit-department').value = requestData.department;
            // อัปเดตชื่อหัวหน้างานอัตโนมัติ (ถ้ามี map)
            if (typeof specialPositionMap !== 'undefined') {
                const headNameInput = document.getElementById('edit-head-name');
                if(headNameInput) headNameInput.value = specialPositionMap[requestData.department] || '';
            }
        }
        if (requestData.headName) {
            document.getElementById('edit-head-name').value = requestData.headName;
        }
    } catch (error) {
        console.error("Error populating edit form:", error);
        throw error;
    }
}

// --- แก้ไขในไฟล์ requests.js ---

// --- แก้ไขในไฟล์ requests.js ---

async function openEditPage(requestId) {
    try {
        console.log("🔓 Opening edit page for request:", requestId);
        
        if (!requestId) {
            showAlert("ผิดพลาด", "ไม่พบรหัสคำขอ");
            return;
        }

        const user = getCurrentUser();
        if (!user) {
            showAlert("ผิดพลาด", "กรุณาเข้าสู่ระบบใหม่");
            return;
        }
        
        // 1. Reset ฟอร์ม
        resetEditPage();
        
        let requestData = null;

        // 2. [ส่วนสำคัญ] พยายามดึงข้อมูลสดจาก Firebase (Database) ก่อน
        // เพราะ Firebase จะเก็บข้อมูลได้ละเอียดกว่า CSV (เช่น มีรายชื่อครบ)
        try {
            // แปลง ID ให้เป็น format ของ Firebase doc (เช่น บค001/2568 -> บค001-2568)
            const docId = requestId.replace(/[\/\\\:\.]/g, '-');
            const docRef = db.collection('requests').doc(docId);
            const docSnap = await docRef.get();

            if (docSnap.exists) {
                console.log("✅ พบข้อมูล Backup ใน Firebase");
                requestData = docSnap.data();
                
                // ตรวจสอบว่าใน Firebase มีรายชื่อไหม
                if (requestData.attendees) {
                     // ถ้าเก็บเป็น String ให้แปลงกลับเป็น Array
                     if (typeof requestData.attendees === 'string') {
                         try { requestData.attendees = JSON.parse(requestData.attendees); } 
                         catch (e) { requestData.attendees = []; }
                     }
                }
            }
        } catch (firebaseError) {
            console.warn("ไม่สามารถดึงข้อมูลจาก Firebase ได้:", firebaseError);
        }

        // 3. ถ้าใน Firebase ไม่มี (หรือ Error) ให้ลองดูใน Cache (CSV)
        if (!requestData && typeof allRequestsCache !== 'undefined') {
            console.log("⚠️ ไม่พบใน Firebase ใช้ข้อมูลจาก Cache แทน");
            requestData = allRequestsCache.find(r => r.id === requestId || r.requestId === requestId);
        }

        // 4. ถ้ายังไม่เจออีก ให้ไปเรียก API (ทางเลือกสุดท้าย)
        if (!requestData) {
            toggleLoader('requests-table-body', true); // โชว์ loader ชั่วคราว
            const result = await apiCall('GET', 'getDraftRequest', { requestId: requestId, username: user.username });
            if (result.status === 'success' && result.data) {
                requestData = result.data.data || result.data;
            }
            toggleLoader('requests-table-body', false);
        }

        if (requestData) {
            // ตรวจสอบรายชื่อครั้งสุดท้าย
            if (!requestData.attendees || !Array.isArray(requestData.attendees)) {
                requestData.attendees = [];
            }

            sessionStorage.setItem('currentEditRequestId', requestId);
            
            // ใส่ข้อมูลลงฟอร์ม
            await populateEditForm(requestData);
            switchPage('edit-page');
        } else {
            showAlert("ผิดพลาด", "ไม่พบข้อมูลคำขอ");
        }

    } catch (error) {
        console.error(error);
        showAlert("ผิดพลาด", "การเปิดหน้าแก้ไขขัดข้อง: " + error.message);
    }
}
function addEditAttendeeField(name = '', position = '') {
    const list = document.getElementById('edit-attendees-list');
    const attendeeDiv = document.createElement('div');
    attendeeDiv.className = 'grid grid-cols-1 md:grid-cols-3 gap-2 items-center mb-2 bg-gray-50 p-3 rounded border border-gray-200';
    const standardPositions = ['ผู้อำนวยการ', 'รองผู้อำนวยการ', 'ครู', 'ครูผู้ช่วย', 'พนักงานราชการ', 'ครูอัตราจ้าง', 'พนักงานขับรถ', 'นักเรียน'];
    const isStandard = standardPositions.includes(position);
    const selectValue = isStandard ? position : (position ? 'other' : '');
    const otherValue = isStandard ? '' : position;

    attendeeDiv.innerHTML = `
        <div class="md:col-span-1">
            <label class="text-xs text-gray-500 mb-1 block">ชื่อ-นามสกุล</label>
            <input type="text" class="form-input attendee-name w-full" placeholder="ระบุชื่อ-นามสกุล" value="${escapeHtml(name)}" required>
        </div>
        <div class="attendee-position-wrapper md:col-span-1">
            <label class="text-xs text-gray-500 mb-1 block">ตำแหน่ง</label>
            <select class="form-input attendee-position-select w-full">
                <option value="">-- เลือกตำแหน่ง --</option>
                <option value="ผู้อำนวยการ">ผู้อำนวยการ</option>
                <option value="รองผู้อำนวยการ">รองผู้อำนวยการ</option>
                <option value="ครู">ครู</option>
                <option value="ครูผู้ช่วย">ครูผู้ช่วย</option>
                <option value="พนักงานราชการ">พนักงานราชการ</option>
                <option value="ครูอัตราจ้าง">ครูอัตราจ้าง</option>
                <option value="พนักงานขับรถ">พนักงานขับรถ</option>
                <option value="นักเรียน">นักเรียน</option>
                <option value="other">อื่นๆ (โปรดระบุ)</option>
            </select>
            <input type="text" class="form-input attendee-position-other mt-2 w-full ${selectValue === 'other' ? '' : 'hidden'}" placeholder="ระบุตำแหน่งอื่นๆ" value="${escapeHtml(otherValue)}">
        </div>
        <div class="flex items-end h-full pb-1 justify-center md:justify-start">
            <button type="button" class="btn btn-danger btn-sm h-10 w-full md:w-auto px-4" onclick="this.closest('.grid').remove()">ลบรายชื่อ</button>
        </div>
    `;
    list.appendChild(attendeeDiv);

    const select = attendeeDiv.querySelector('.attendee-position-select');
    const otherInput = attendeeDiv.querySelector('.attendee-position-other');
    if (selectValue) select.value = selectValue;
    select.addEventListener('change', () => {
        if (select.value === 'other') {
            otherInput.classList.remove('hidden');
            otherInput.focus();
        } else {
            otherInput.classList.add('hidden');
            otherInput.value = '';
        }
    });
}

function toggleEditExpenseOptions() {
    const partialOptions = document.getElementById('edit-partial-expense-options');
    const totalContainer = document.getElementById('edit-total-expense-container');
    if (document.getElementById('edit-expense_partial')?.checked) {
        partialOptions.classList.remove('hidden');
        totalContainer.classList.remove('hidden');
    } else {
        partialOptions.classList.add('hidden');
        totalContainer.classList.add('hidden');
        document.querySelectorAll('input[name="edit-expense_item"]').forEach(chk => { chk.checked = false; });
        document.getElementById('edit-expense_other_text').value = '';
        document.getElementById('edit-total-expense').value = '';
    }
}

function toggleEditVehicleOptions() {
     toggleEditVehicleDetails();
}

// --- แก้ไขในไฟล์ requests.js ---

function toggleEditVehicleDetails() {
    const privateDetails = document.getElementById('edit-private-vehicle-details'); 
    
    // แก้ไข ID ให้ตรงกับ HTML ใหม่ (เติม -container)
    const publicDetails = document.getElementById('edit-public-vehicle-details-container'); 
    
    const privateCheckbox = document.querySelector('input[name="edit-vehicle_option"][value="private"]');
    const publicCheckbox = document.querySelector('input[name="edit-vehicle_option"][value="public"]');

    if (privateDetails) privateDetails.classList.toggle('hidden', !privateCheckbox?.checked);
    if (publicDetails) publicDetails.classList.toggle('hidden', !publicCheckbox?.checked);
}
// แก้ไขใน requests.js - ฟังก์ชันบันทึกการแก้ไขพร้อมตัวตรวจจับการเปลี่ยนประเภทการเบิกเงิน
async function generateDocumentFromDraft() {
    let requestId = document.getElementById('edit-request-id').value;
    const draftId = document.getElementById('edit-draft-id').value;
    
    // 1. ตรวจสอบ ID
    if (!requestId) requestId = sessionStorage.getItem('currentEditRequestId');
    if (!requestId) { showAlert("ผิดพลาด", "ไม่พบรหัสคำขอ"); return; }

    // 2. ดึงข้อมูลจากฟอร์มแก้ไข
    const formData = getEditFormData();
    if (!formData) return;
    if (!validateEditForm(formData)) return;
    
    formData.requestId = requestId;
    formData.draftId = draftId;
    formData.isEdit = true;
    formData.doctype = 'memo'; 
    formData.id = requestId; 

    toggleLoader('generate-document-button', true);

    try {
        console.log("🚀 กำลังประมวลผลการแก้ไขเอกสาร...");

        // 3. สร้าง PDF หลักเวอร์ชันใหม่ (Cloud Run)
        const { pdfBlob } = await generateOfficialPDF(formData);

        // 4. ตรวจจับเงื่อนไขการเบิกเงิน (Logic เดียวกับตอนสร้างใหม่)
        if (formData.expenseOption !== 'no') {
            // --- กรณีที่ยังเป็นแบบ "เบิกค่าใช้จ่าย" (ไม่ต้องแนบไฟล์) ---
            console.log("💰 กรณีเบิกเงิน: อัปเดตข้อมูลและเปิดไฟล์ทันที");
            
            const pdfBase64 = await blobToBase64(pdfBlob);
            const uploadResult = await apiCall('POST', 'uploadGeneratedFile', {
                data: pdfBase64,
                filename: `บันทึกข้อความแก้ไข_${requestId.replace(/[\/\\:\.]/g, '-')}.pdf`,
                mimeType: 'application/pdf',
                username: formData.username
            });

            if (uploadResult.status !== 'success') throw new Error("Upload failed: " + uploadResult.message);
            
            formData.pdfUrl = uploadResult.url;
            formData.completedMemoUrl = uploadResult.url;

            // บันทึกลง Google Sheets และ Firestore
            await apiCall('POST', 'updateRequest', formData);
            const safeId = requestId.replace(/[\/\\:\.]/g, '-');
            await db.collection('requests').doc(safeId).set({
                pdfUrl: uploadResult.url,
                status: 'รอการตรวจสอบ'
            }, { merge: true });

            window.open(uploadResult.url, '_blank');
            showAlert("สำเร็จ", "อัปเดตข้อมูลและสร้างเอกสารใหม่เรียบร้อยแล้ว");
            
            clearRequestsCache();
            await fetchUserRequests();
            switchPage('dashboard-page');

        } else {
            // --- กรณีเปลี่ยนเป็น "ไม่เบิกค่าใช้จ่าย" (บังคับแนบไฟล์ใหม่) ---
            console.log("📄 กรณีไม่เบิกเงิน: บังคับเข้าสู่กระบวนการแนบเอกสาร");
            
            // บันทึกการเปลี่ยนแปลงข้อความลง Google Sheets ก่อนเพื่อให้ข้อมูลเป็นปัจจุบัน
            await apiCall('POST', 'updateRequest', formData);
            
            // เก็บไฟล์หลักไว้ในตัวแปร Global เพื่อรอรวมไฟล์
            window.currentMainPDF = pdfBlob;
            window.currentFormData = formData;

            // เปิด Modal แนบไฟล์ (ซึ่งจะเช็คเงื่อนไข รอง ผอ. / วัน จ-ศ / รถส่วนตัว ให้อัตโนมัติ)
            openAttachmentModal(requestId, formData);
        }

    } catch (error) {
        console.error("Save Edit Error:", error);
        showAlert("ผิดพลาด", "การอัปเดตขัดข้อง: " + error.message);
    } finally {
        toggleLoader('generate-document-button', false);
    }
}

function getEditFormData() {
    try {
        console.log("📝 เริ่มดึงข้อมูลจากฟอร์มแก้ไข (แบบผสานข้อมูลเดิม)...");

        const user = getCurrentUser();
        if (!user) throw new Error("ไม่พบข้อมูลผู้ใช้งาน (Session หลุด)");

        // ตัวช่วยดึงค่า
        const getValue = (id) => {
            const el = document.getElementById(id);
            return el ? el.value : '';
        };

        // 1. หา ID ของเอกสาร
        let requestId = getValue('edit-request-id');
        if (!requestId) requestId = sessionStorage.getItem('currentEditRequestId');
        
        // 2. ★★★ สำคัญ: ดึงข้อมูลเดิมจาก Cache มาเป็นฐานก่อน (กันข้อมูลหาย) ★★★
        let originalData = {};
        if (typeof allRequestsCache !== 'undefined') {
            const cached = allRequestsCache.find(r => r.id === requestId || r.requestId === requestId);
            if (cached) {
                // คัดลอกข้อมูลเดิมมาทั้งหมด (Clone)
                originalData = JSON.parse(JSON.stringify(cached));
            }
        }

        // 3. ดึงข้อมูลใหม่จากหน้าจอ (เหมือนเดิม)
        const expenseItems = [];
        const expenseOption = document.querySelector('input[name="edit-expense_option"]:checked');
        if (expenseOption && expenseOption.value === 'partial') {
            document.querySelectorAll('input[name="edit-expense_item"]:checked').forEach(chk => {
                const item = { name: chk.dataset.itemName };
                if (item.name === 'ค่าใช้จ่ายอื่นๆ') { 
                    item.detail = getValue('edit-expense_other_text').trim(); 
                }
                expenseItems.push(item);
            });
        }

        const attendees = Array.from(document.querySelectorAll('#edit-attendees-list > div')).map(div => {
            const nameInput = div.querySelector('.attendee-name');
            const select = div.querySelector('.attendee-position-select');
            let position = select ? select.value : '';
            if (position === 'other') { 
                const otherInput = div.querySelector('.attendee-position-other'); 
                position = otherInput ? otherInput.value.trim() : ''; 
            }
            return { name: nameInput ? nameInput.value.trim() : '', position: position };
        }).filter(att => att.name && att.position);

        // 4. ผสานข้อมูล (เอาข้อมูลเดิมตั้ง + ทับด้วยข้อมูลใหม่)
        const formData = {
            ...originalData, // เอาข้อมูลเก่ามาวางก่อน (เช่น timestamp, status เดิม)
            
            // ข้อมูลที่แก้ไขได้ (จะทับข้อมูลเก่า)
            requestId: requestId,
            id: requestId, // ย้ำ ID อีกครั้ง
            draftId: getValue('edit-draft-id') || originalData.draftId,
            username: user.username,
            
            docDate: getValue('edit-doc-date'),
            requesterName: getValue('edit-requester-name').trim(),
            requesterPosition: getValue('edit-requester-position').trim(),
            location: getValue('edit-location').trim(),
            purpose: getValue('edit-purpose').trim(),
            startDate: getValue('edit-start-date'),
            endDate: getValue('edit-end-date'),
            
            attendees: attendees, // รายชื่อผู้ร่วมเดินทางชุดใหม่
            
            expenseOption: expenseOption ? expenseOption.value : 'no',
            expenseItems: expenseItems,
            totalExpense: getValue('edit-total-expense') || 0,
            
            vehicleOption: document.querySelector('input[name="edit-vehicle_option"]:checked')?.value || 'gov',
            licensePlate: getValue('edit-license-plate').trim(),
            publicVehicleDetails: getValue('edit-public-vehicle-details').trim(), // แก้ ID ตามที่คุยกันก่อนหน้า
            
            department: getValue('edit-department'),
            headName: getValue('edit-head-name'),
            
            isEdit: true
        };

        console.log("✅ ข้อมูลสำหรับบันทึก (Merged):", formData);
        return formData;

    } catch (error) {
        console.error('Error in getEditFormData:', error);
        showAlert("พบข้อผิดพลาด", "อ่านข้อมูลไม่สำเร็จ: " + error.message); 
        return null;
    }
}
function validateEditForm(formData) {
    if (!formData.docDate || !formData.requesterName || !formData.location || !formData.purpose || !formData.startDate || !formData.endDate) {
        showAlert("ข้อมูลไม่ครบถ้วน", "กรุณากรอกข้อมูลที่จำเป็นให้ครบ"); return false;
    }
    const startDate = new Date(formData.startDate);
    const endDate = new Date(formData.endDate);
    if (startDate > endDate) { showAlert("ข้อมูลไม่ถูกต้อง", "วันที่เริ่มต้นต้องมาก่อนวันที่สิ้นสุด"); return false; }
    return true;
}

// --- Basic Form Functions ---

async function resetRequestForm() {
    document.getElementById('request-form').reset();
    document.getElementById('form-request-id').value = '';
    document.getElementById('form-attendees-list').innerHTML = '';
    document.getElementById('form-result').classList.add('hidden');
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('form-doc-date').value = today;
    document.getElementById('form-start-date').value = today;
    document.getElementById('form-end-date').value = today;
    document.getElementById('form-department').addEventListener('change', (e) => {
        const selectedDept = e.target.value;
        document.getElementById('form-head-name').value = specialPositionMap[selectedDept] || '';
    });
}

function addAttendeeField() {
    const list = document.getElementById('form-attendees-list');
    const attendeeDiv = document.createElement('div');
    attendeeDiv.className = 'grid grid-cols-1 md:grid-cols-3 gap-2 items-center mb-2';
    attendeeDiv.innerHTML = `
        <input type="text" class="form-input attendee-name md:col-span-1" placeholder="ชื่อ-นามสกุล" required>
        <div class="attendee-position-wrapper md:col-span-1">
             <select class="form-input attendee-position-select">
                <option value="">-- เลือกตำแหน่ง --</option>
                <option value="ผู้อำนวยการ">ผู้อำนวยการ</option>
                <option value="รองผู้อำนวยการ">รองผู้อำนวยการ</option>
                <option value="ครู">ครู</option>
                <option value="ครูผู้ช่วย">ครูผู้ช่วย</option>
                <option value="พนักงานราชการ">พนักงานราชการ</option>
                <option value="ครูอัตราจ้าง">ครูอัตราจ้าง</option>
                <option value="พนักงานขับรถ">พนักงานขับรถ</option>
                <option value="นักเรียน">นักเรียน</option>
                <option value="other">อื่นๆ (โปรดระบุ)</option>
            </select>
            <input type="text" class="form-input attendee-position-other hidden mt-1" placeholder="ระบุตำแหน่ง">
        </div>
        <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">ลบ</button>
    `;
    list.appendChild(attendeeDiv);
    const select = attendeeDiv.querySelector('.attendee-position-select');
    const otherInput = attendeeDiv.querySelector('.attendee-position-other');
    select.addEventListener('change', () => {
        otherInput.classList.toggle('hidden', select.value !== 'other');
    });
}

function toggleExpenseOptions() {
    const partialOptions = document.getElementById('partial-expense-options');
    const totalContainer = document.getElementById('total-expense-container');
    if (document.getElementById('expense_partial').checked) {
        partialOptions.classList.remove('hidden');
        totalContainer.classList.remove('hidden');
    } else {
        partialOptions.classList.add('hidden');
        totalContainer.classList.add('hidden');
    }
}

function toggleVehicleDetails() {
    const privateDetails = document.getElementById('private-vehicle-details');
    const publicDetails = document.getElementById('public-vehicle-details');
    const privateCheckbox = document.querySelector('input[name="vehicle_option"][value="private"]');
    const publicCheckbox = document.querySelector('input[name="vehicle_option"][value="public"]');
    
    if (privateDetails) privateDetails.classList.toggle('hidden', !privateCheckbox?.checked);
    if (publicDetails) publicDetails.classList.toggle('hidden', !publicCheckbox?.checked);
}

// 1. ฟังก์ชันส่งคำขอไปราชการ (Travel Request)
async function handleRequestFormSubmit(e) {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) return;

    const formData = {
        username: user.username,
        docDate: document.getElementById('form-doc-date').value,
        requesterName: document.getElementById('form-requester-name').value,
        requesterPosition: document.getElementById('form-requester-position').value,
        location: document.getElementById('form-location').value,
        purpose: document.getElementById('form-purpose').value,
        startDate: document.getElementById('form-start-date').value,
        endDate: document.getElementById('form-end-date').value,
        attendees: Array.from(document.querySelectorAll('#form-attendees-list > div')).map(div => {
            const select = div.querySelector('.attendee-position-select');
            return { name: div.querySelector('.attendee-name').value, position: select.value };
        }).filter(att => att.name),
        expenseOption: document.querySelector('input[name="expense_option"]:checked').value,
        vehicleOption: document.querySelector('input[name="vehicle_option"]:checked').value,
        licensePlate: document.getElementById('form-license-plate').value,
        department: document.getElementById('form-department').value,
        headName: document.getElementById('form-head-name').value
    };

    toggleLoader('submit-request-button', true);
    
    try {
        // ตรวจสอบเงื่อนไขรถส่วนตัว
        if (formData.vehicleOption === 'private') {
            const vhQuery = await db.collection('vehicle_requests')
                .where('licensePlate', '==', formData.licensePlate)
                .where('startDate', '==', formData.startDate)
                .where('username', '==', formData.username).get();

            if (vhQuery.empty || formData.expenseOption !== 'no') {
                showAlert('ย้ายไปหน้าบันทึกรถ', 'ระบบไม่พบใบขอใช้รถหรือเป็นการเบิกจ่าย โปรดกรอกข้อมูลรถก่อน');
                sessionStorage.setItem('pendingTravelRequest', JSON.stringify(formData));
                switchPage('vehicle-page');
                return;
            }
        }

        let result = await apiCall('POST', 'createRequest', formData);
        if (result.status === 'success') {
            const { pdfBlob } = await generateOfficialPDF({...formData, doctype: 'memo', id: result.data.id});
            if (formData.expenseOption !== 'no') {
                const upload = await apiCall('POST', 'uploadGeneratedFile', {
                    data: await blobToBase64(pdfBlob), filename: `บันทึก_${result.data.id.replace(/\//g,'-')}.pdf`, username: user.username
                });
                await db.collection('requests').doc(result.data.id.replace(/\//g,'-')).set({ pdfUrl: upload.url, status: 'รอแอดมินตรวจสอบ (1)' }, { merge: true });
                window.open(upload.url, '_blank');
                switchPage('dashboard-page');
            } else {
                window.currentMainPDF = pdfBlob;
                window.currentFormData = formData;
                openAttachmentModal(result.data.id, formData);
            }
        }
    } catch (error) { showAlert('ผิดพลาด', error.message); } finally { toggleLoader('submit-request-button', false); }
}

// 2. ฟังก์ชันบันทึกใบขอใช้รถส่วนตัว (Vehicle Request)
async function handleVehicleFormSubmit(e) {
    e.preventDefault();
    const user = getCurrentUser();
    const formData = {
        username: user.username,
        requesterName: document.getElementById('vh-name').value,
        licensePlate: document.getElementById('vh-license').value,
        startDate: document.getElementById('vh-start').value,
        endDate: document.getElementById('vh-end').value,
        doctype: 'vehicle_memo'
    };

    toggleLoader('vh-submit-btn', true);
    try {
        const { pdfBlob } = await generateOfficialPDF(formData);
        const upload = await apiCall('POST', 'uploadGeneratedFile', {
            data: await blobToBase64(pdfBlob), filename: `รถส่วนตัว_${formData.licensePlate}.pdf`, username: user.username
        });
        await db.collection('vehicle_requests').add({...formData, pdfUrl: upload.url});
        window.open(upload.url, '_blank');
        
        const pending = sessionStorage.getItem('pendingTravelRequest');
        if (pending && confirm('กลับไปทำเรื่องไปราชการต่อหรือไม่?')) {
            sessionStorage.removeItem('pendingTravelRequest');
            switchPage('form-page');
        } else {
            switchPage('dashboard-page');
        }
    } catch (e) { showAlert('ผิดพลาด', e.message); } finally { toggleLoader('vh-submit-btn', false); }
}

// 3. ฟังก์ชันแนบไฟล์อัตโนมัติ
async function openAttachmentModal(requestId, formData) {
    document.getElementById('attach-request-id').value = requestId;
    const isVice = formData.requesterPosition.includes("รองผู้อำนวยการ");
    const isAlone = formData.attendees.length === 0;
    
    // ค้นหาไฟล์รถอัตโนมัติ
    const vhSnap = await db.collection('vehicle_requests')
        .where('licensePlate', '==', formData.licensePlate)
        .where('startDate', '==', formData.startDate)
        .where('username', '==', formData.username).get();

    if (!vhSnap.empty) {
        document.getElementById('auto-car-pdf-url').value = vhSnap.docs[0].data().pdfUrl;
        document.getElementById('auto-found-car-msg').classList.remove('hidden');
        document.getElementById('manual-car-upload').classList.add('hidden');
    }
    document.getElementById('upload-attachments-modal').style.display = 'flex';
}

function tryAutoFillRequester(retry = 0) {
    const nameInput = document.getElementById('form-requester-name');
    const posInput = document.getElementById('form-requester-position');
    const dateInput = document.getElementById('form-doc-date');
    if (!nameInput || !posInput) {
        if (retry < 5) setTimeout(() => tryAutoFillRequester(retry + 1), 500);
        return;
    }
    if (dateInput && !dateInput.value) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        dateInput.value = `${yyyy}-${mm}-${dd}`;
    }
    let user = window.currentUser;
    if (!user) {
        const storedUser = sessionStorage.getItem('currentUser');
        if (storedUser) { try { user = JSON.parse(storedUser); window.currentUser = user; } catch (err) {} }
    }
    if (user) { nameInput.value = user.fullName || ''; posInput.value = user.position || ''; }
    else if (retry < 5) setTimeout(() => tryAutoFillRequester(retry + 1), 1000);
}

// ✅ ฟังก์ชัน Modal ส่งบันทึกข้อความ (ใส่ไว้เพื่อป้องกัน error)
async function handleMemoSubmitFromModal(e) {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) return;
    const requestId = document.getElementById('memo-modal-request-id').value;
    const memoType = document.querySelector('input[name="modal_memo_type"]:checked').value;
    const fileInput = document.getElementById('modal-memo-file');
    let fileObject = null;
    if (memoType === 'non_reimburse' && fileInput.files.length > 0) { fileObject = await fileToObject(fileInput.files[0]); }
    
    toggleLoader('send-memo-submit-button', true);
    try {
        const result = await apiCall('POST', 'uploadMemo', { refNumber: requestId, file: fileObject, username: user.username, memoType: memoType });
        if (result.status === 'success') { 
            showAlert('สำเร็จ', 'ส่งบันทึกข้อความสำเร็จ'); 
            document.getElementById('send-memo-modal').style.display = 'none'; 
            document.getElementById('send-memo-form').reset(); 
            await fetchUserRequests(); 
        } 
        else { showAlert('ผิดพลาด', result.message); }
    } catch (error) { showAlert('ผิดพลาด', error.message); } finally { toggleLoader('send-memo-submit-button', false); }
}

// Public Data
async function loadPublicWeeklyData() {
    try {
        const [requestsResult, memosResult] = await Promise.all([apiCall('GET', 'getAllRequests'), apiCall('GET', 'getAllMemos')]);
        if (requestsResult.status === 'success') {
            const requests = requestsResult.data;
            const memos = memosResult.status === 'success' ? memosResult.data : [];
            const enrichedRequests = requests.map(req => {
                const relatedMemo = memos.find(m => m.refNumber === req.id);
                return { ...req, completedCommandUrl: relatedMemo ? relatedMemo.completedCommandUrl : null, realStatus: relatedMemo ? relatedMemo.status : req.status };
            });
            currentPublicWeeklyData = enrichedRequests;
            renderPublicTable(enrichedRequests);
        } else {
            document.getElementById('public-weekly-list').innerHTML = `<tr><td colspan="4" class="text-center py-4 text-red-500">ไม่สามารถโหลดข้อมูลได้</td></tr>`;
            document.getElementById('current-week-display').textContent = "Connection Error";
        }
    } catch (error) { document.getElementById('public-weekly-list').innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">ไม่พบข้อมูล</td></tr>`; }
}

function renderPublicTable(requests) {
    const tbody = document.getElementById('public-weekly-list');
    tbody.parentElement.classList.add('responsive-table');

    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const monday = new Date(now);
    monday.setDate(now.getDate() - daysToMonday); monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6); sunday.setHours(23, 59, 59, 999);
    const dateOptions = { day: 'numeric', month: 'short', year: '2-digit' };
    document.getElementById('current-week-display').textContent = `${monday.toLocaleDateString('th-TH', dateOptions)} - ${sunday.toLocaleDateString('th-TH', dateOptions)}`;
    
    const weeklyRequests = requests.filter(req => {
        if (!req.startDate || !req.endDate) return false;
        const reqStart = new Date(req.startDate); const reqEnd = new Date(req.endDate);
        reqStart.setHours(0,0,0,0); reqEnd.setHours(0,0,0,0);
        return (reqStart <= sunday && reqEnd >= monday);
    }).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    
    currentPublicWeeklyData = weeklyRequests;
    if (weeklyRequests.length === 0) { tbody.innerHTML = `<tr><td colspan="4" class="text-center py-10 text-gray-500">ไม่มีรายการไปราชการในสัปดาห์นี้</td></tr>`; return; }
    
    tbody.innerHTML = weeklyRequests.map((req, index) => {
        let attendeesList = [];
        if (typeof req.attendees === 'string') { try { attendeesList = JSON.parse(req.attendees); } catch (e) { attendeesList = []; } } else if (Array.isArray(req.attendees)) { attendeesList = req.attendees; }
        let attendeesText = "";
        const count = attendeesList.length > 0 ? attendeesList.length : (req.attendeeCount || 0);
        if (count > 0) { attendeesText = `<div class="text-xs text-indigo-500 mt-1 cursor-pointer hover:underline" onclick="openPublicAttendeeModal(${index})">👥 และคณะรวม ${count + 1} คน</div>`; }
        
        const dateText = `${formatDisplayDate(req.startDate)} - ${formatDisplayDate(req.endDate)}`;
        
        const finalCommandUrl = req.completedCommandUrl; let actionHtml = '';
        if (finalCommandUrl && finalCommandUrl.trim() !== "") {
            actionHtml = `<a href="${finalCommandUrl}" target="_blank" class="btn bg-green-600 hover:bg-green-700 text-white btn-sm shadow-md transition-transform hover:scale-105 inline-flex items-center gap-1">ดูคำสั่ง</a>`;
        } else {
            let displayStatus = req.realStatus || req.status;
            let badgeClass = 'bg-gray-100 text-gray-600'; let icon = '🔄';
            if (displayStatus === 'Pending' || displayStatus === 'กำลังดำเนินการ') { badgeClass = 'bg-yellow-100 text-yellow-700 border border-yellow-200'; icon = '⏳'; }
            else if (displayStatus && displayStatus.includes('แก้ไข')) { badgeClass = 'bg-red-100 text-red-700 border border-red-200'; icon = '⚠️'; }
            else if (displayStatus === 'เสร็จสิ้นรอออกคำสั่งไปราชการ') { badgeClass = 'bg-blue-50 text-blue-600 border border-blue-100'; icon = '📝'; displayStatus = 'รอออกคำสั่ง'; }
            else if (displayStatus === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' || displayStatus === 'เสร็จสิ้น') { badgeClass = 'bg-green-100 text-green-700 border border-green-200'; icon = '✅'; displayStatus = 'เสร็จสิ้น'; }
            actionHtml = `<span class="${badgeClass} px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap">${icon} ${translateStatus(displayStatus)}</span>`;
        }
        
        // Sanitization
        const safeName = escapeHtml(req.requesterName);
        const safePosition = escapeHtml(req.requesterPosition || '');
        const safePurpose = escapeHtml(req.purpose);
        const safeLocation = escapeHtml(req.location);

        return `
        <tr class="border-b hover:bg-gray-50 transition">
            <td class="px-6 py-4 whitespace-nowrap font-medium text-indigo-600" data-label="วัน-เวลา">${dateText}</td>
            <td class="px-6 py-4" data-label="ชื่อผู้ขอ">
                <div class="font-bold text-gray-800">${safeName}</div>
                <div class="text-xs text-gray-500">${safePosition}</div>
            </td>
            <td class="px-6 py-4" data-label="เรื่อง / สถานที่">
                <div class="font-medium text-gray-900 truncate max-w-xs" title="${safePurpose}">${safePurpose}</div>
                <div class="text-xs text-gray-500">ณ ${safeLocation}</div>${attendeesText}
            </td>
            <td class="px-6 py-4 text-center align-middle" data-label="ไฟล์คำสั่ง">${actionHtml}</td>
        </tr>`;
    }).join('');
}

function openPublicAttendeeModal(index) {
    const req = currentPublicWeeklyData[index]; if (!req) return;
    document.getElementById('public-modal-purpose').textContent = req.purpose;
    document.getElementById('public-modal-location').textContent = req.location;
    const startD = new Date(req.startDate); const endD = new Date(req.endDate);
    let dateText = formatDisplayDate(req.startDate); if (startD.getTime() !== endD.getTime()) { dateText += ` ถึง ${formatDisplayDate(req.endDate)}`; }
    document.getElementById('public-modal-date').textContent = dateText;
    const listBody = document.getElementById('public-modal-attendee-list');
    let html = ''; let count = 1;
    html += `<tr class="bg-blue-50/50"><td class="px-4 py-2 font-bold text-center">${count++}</td><td class="px-4 py-2 font-bold text-blue-800">${escapeHtml(req.requesterName)} (ผู้ขอ)</td><td class="px-4 py-2 text-gray-600">${escapeHtml(req.requesterPosition)}</td></tr>`;
    if (req.attendees && req.attendees.length > 0) { req.attendees.forEach(att => { html += `<tr class="border-t"><td class="px-4 py-2 text-center text-gray-500">${count++}</td><td class="px-4 py-2 text-gray-800">${escapeHtml(att.name)}</td><td class="px-4 py-2 text-gray-600">${escapeHtml(att.position)}</td></tr>`; }); }
    listBody.innerHTML = html;
    document.getElementById('public-attendee-modal').style.display = 'flex';
}
// --- [NEW] NOTIFICATION SYSTEM ---

function updateNotifications(requests, memos) {
    const badge = document.getElementById('notification-badge');
    const countText = document.getElementById('notification-count-text');
    const listContainer = document.getElementById('notification-list');
    
    if (!badge || !listContainer) return;

    // 1. กรองรายการที่ "สร้าง PDF แล้ว" แต่ "ยังไม่มีไฟล์สมบูรณ์" หรือ "ต้องแก้ไข"
    const pendingItems = requests.filter(req => {
        // ต้องมีเลขที่เอกสาร หรือสร้าง PDF แล้ว
        const hasCreated = req.pdfUrl && req.pdfUrl !== '';
        
        // เช็คสถานะจาก Memo (ถ้ามี)
        const relatedMemo = memos.find(m => m.refNumber === req.id);
        const isCompleted = relatedMemo && (relatedMemo.status === 'เสร็จสิ้น' || relatedMemo.status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน');
        const isFixing = relatedMemo && relatedMemo.status === 'นำกลับไปแก้ไข';
        
        // เงื่อนไข: สร้างแล้ว แต่ยังไม่เสร็จ (หรือต้องแก้)
        return hasCreated && (!isCompleted || isFixing);
    });

    const count = pendingItems.length;

    // 2. อัปเดต Badge (จุดแดง)
    if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
        badge.classList.add('animate-bounce'); // เพิ่ม Effect เด้งดึ๋ง
        setTimeout(() => badge.classList.remove('animate-bounce'), 1000);
    } else {
        badge.classList.add('hidden');
    }
    
    if (countText) countText.textContent = `${count} รายการ`;

    // 3. สร้างรายการใน Dropdown
    if (count === 0) {
        listContainer.innerHTML = `<div class="p-8 text-center text-gray-400 flex flex-col items-center"><svg class="w-8 h-8 mb-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>ส่งครบทุกรายการแล้ว</div>`;
    } else {
        listContainer.innerHTML = pendingItems.map(req => {
            const isFix = req.status === 'นำกลับไปแก้ไข' || (memos.find(m => m.refNumber === req.id)?.status === 'นำกลับไปแก้ไข');
            const statusBadge = isFix 
                ? `<span class="text-xs bg-red-100 text-red-600 px-1.5 rounded">แก้</span>` 
                : `<span class="text-xs bg-yellow-100 text-yellow-600 px-1.5 rounded">รอส่ง</span>`;
            
            return `
            <div onclick="openSendMemoFromNotif('${req.id}')" class="p-3 hover:bg-blue-50 cursor-pointer transition flex justify-between items-start group">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                        <span class="font-bold text-sm text-indigo-700">${escapeHtml(req.id || 'รอเลข')}</span>
                        ${statusBadge}
                    </div>
                    <p class="text-xs text-gray-500 line-clamp-1">${escapeHtml(req.purpose)}</p>
                    <p class="text-[10px] text-gray-400 mt-0.5">${formatDisplayDate(req.startDate)}</p>
                </div>
                <div class="text-indigo-500 opacity-0 group-hover:opacity-100 transition transform group-hover:translate-x-1">
                    ➤
                </div>
            </div>
            `;
        }).join('');
    }
}

// ฟังก์ชันเปิด Modal ส่งงานเมื่อคลิกจากรายการแจ้งเตือน
function openSendMemoFromNotif(requestId) {
    // ปิด Dropdown
    document.getElementById('notification-dropdown').classList.add('hidden');
    
    // เปิด Modal
    document.getElementById('memo-modal-request-id').value = requestId;
    document.getElementById('send-memo-modal').style.display = 'flex';
}
// --- แก้ไขในไฟล์ requests.js ---

async function openEditPage(requestId) {
    try {
        console.log("🔓 Opening edit page for request:", requestId);
        
        if (!requestId || requestId === 'undefined' || requestId === 'null') {
            showAlert("ผิดพลาด", "ไม่พบรหัสคำขอ");
            return;
        }

        const user = getCurrentUser();
        if (!user) {
            showAlert("ผิดพลาด", "กรุณาเข้าสู่ระบบใหม่");
            return;
        }
        
        // 1. Reset ฟอร์มก่อนเสมอ
        resetEditPage();
        
        // 2. พยายามหาข้อมูลจาก Cache (ข้อมูลที่โชว์ในตาราง Dashboard) ก่อน เพื่อความเร็ว
        let requestData = null;
        if (typeof allRequestsCache !== 'undefined' && allRequestsCache.length > 0) {
            // ค้นหาตาม ID หรือ RequestID
            requestData = allRequestsCache.find(r => r.id === requestId || r.requestId === requestId);
        }

        // 3. ถ้าไม่เจอใน Cache ให้ไปโหลดจาก Server (API/Firebase)
        if (!requestData) {
            document.getElementById('edit-attendees-list').innerHTML = `
                <div class="text-center p-4"><div class="loader mx-auto"></div><p class="mt-2">กำลังโหลดข้อมูล...</p></div>`;
            
            // เรียก Hybrid function หรือ API
            const result = await apiCall('GET', 'getDraftRequest', { requestId: requestId, username: user.username });
            
            if (result.status === 'success' && result.data) {
                requestData = result.data.data || result.data;
            }
        }

        if (requestData) {
            // บันทึก ID ไว้สำหรับการบันทึก
            sessionStorage.setItem('currentEditRequestId', requestId);
            
            // เรียกฟังก์ชันใส่ข้อมูลลงฟอร์ม (Populate)
            await populateEditForm(requestData);
            
            // สลับไปหน้า Edit
            switchPage('edit-page');
        } else {
            showAlert("ผิดพลาด", "ไม่พบข้อมูลคำขอ หรือคุณไม่มีสิทธิ์เข้าถึง");
        }

    } catch (error) {
        console.error(error);
        showAlert("ผิดพลาด", "ไม่สามารถโหลดข้อมูลสำหรับแก้ไขได้: " + error.message);
    }
}
// --- วางต่อท้ายไฟล์ requests.js ---

// ฟังก์ชันบันทึกการแก้ไข (พร้อม Backup ลง Firebase เพื่อกันข้อมูลรายชื่อหาย)
async function saveEditRequest() {
    const btn = document.getElementById('save-edit-btn');
    
    // ป้องกันการกดรัว (Disable ปุ่มชั่วคราว)
    if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        btn.innerHTML = '<span class="loader-sm"></span> กำลังบันทึก...';
    }

    try {
        console.log("💾 กำลังเริ่มกระบวนการบันทึกแก้ไข...");

        // 1. ดึงข้อมูลจากฟอร์ม (ต้องใช้ getEditFormData ตัวล่าสุดที่แก้ไป)
        const formData = getEditFormData();
        
        if (!formData) {
            throw new Error("ไม่สามารถอ่านข้อมูลจากฟอร์มได้ กรุณาตรวจสอบข้อมูล");
        }
        
        // ตรวจสอบข้อมูลจำเป็น
        if (!validateEditForm(formData)) {
            // ถ้า Validate ไม่ผ่าน ให้คืนค่าปุ่มกดและหยุดทำงาน
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
                btn.innerHTML = 'บันทึกการแก้ไข';
            }
            return;
        }

        // 2. ส่งข้อมูลไปอัปเดตที่ Server หลัก (Google Apps Script -> Google Sheets)
        // เพื่อให้ข้อมูลในไฟล์ Excel/CSV อัปเดตตาม
        console.log("📤 Sending update to GAS...");
        const result = await apiCall('POST', 'updateRequest', formData);

        if (result.status === 'success') {
            
            // 3. [ส่วนสำคัญ] ทำ Backup ลง Firebase ทันที (Client-side Backup)
            // เราจะบันทึกข้อมูลชุดเต็ม (รวม attendees) ลง Firestore เพื่อให้ openEditPage ครั้งหน้าดึงข้อมูลนี้ไปใช้ได้
            if (typeof db !== 'undefined' && typeof firebase !== 'undefined') {
                try {
                    // แปลง ID ให้เป็น Format ของ Document ID (เช่น บค001/2568 -> บค001-2568)
                    const docId = formData.requestId.replace(/[\/\\\:\.]/g, '-');
                    
                    // เตรียมข้อมูลที่จะ Backup
                    const firebaseData = {
                        ...formData,
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        isSynced: true, // ระบุว่าข้อมูลนี้ตรงกับ Server แล้ว
                        // สำคัญ: บังคับบันทึก attendees เป็น Array ลงไป
                        attendees: formData.attendees || [] 
                    };

                    // บันทึกแบบ Merge (ทับข้อมูลเดิมที่มีอยู่)
                    await db.collection('requests').doc(docId).set(firebaseData, { merge: true });
                    console.log("✅ Backup data (including attendees) to Firebase completed.");

                } catch (fbError) {
                    console.warn("⚠️ Firebase Backup Warning:", fbError);
                    // ไม่ throw error ออกไป เพราะถือว่าการบันทึกหลัก (GAS) สำเร็จแล้ว
                }
            }

            // แจ้งเตือนความสำเร็จ
            showAlert("สำเร็จ", "บันทึกข้อมูลการแก้ไขเรียบร้อยแล้ว");
            
            // เคลียร์ Cache เพื่อให้หน้า Dashboard โหลดข้อมูลใหม่ที่อัปเดตแล้ว
            if (typeof clearRequestsCache === 'function') {
                clearRequestsCache();
            }
            
            // กลับไปหน้า Dashboard และโหลดข้อมูลใหม่
            await fetchUserRequests(); // รอให้โหลดเสร็จก่อนค่อยเปลี่ยนหน้า
            switchPage('dashboard-page');

        } else {
            throw new Error(result.message || "Server ตอบกลับผิดพลาด");
        }

    } catch (error) {
        console.error("Save Edit Error:", error);
        showAlert("บันทึกไม่สำเร็จ", "เกิดข้อผิดพลาด: " + error.message);
    } finally {
        // คืนค่าปุ่มกด (กรณีเกิด Error)
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            btn.innerHTML = 'บันทึกการแก้ไข';
        }
    }
}
/// [แก้ไข] ฟังก์ชันวิเคราะห์เงื่อนไขและค้นหาบันทึกรถส่วนตัวอัตโนมัติ
async function openAttachmentModal(requestId, formData) {
    document.getElementById('attach-request-id').value = requestId;
    
    // 1. ตรวจสอบเงื่อนไขวัน จันทร์-ศุกร์
    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    let hasWeekday = false;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const day = d.getDay();
        if (day >= 1 && day <= 5) { hasWeekday = true; break; }
    }

    const isViceDirector = formData.requesterPosition.includes("รองผู้อำนวยการ");
    const isAlone = (!formData.attendees || formData.attendees.length === 0);
    const showExchangeField = hasWeekday && !(isViceDirector && isAlone);

    const exchangeField = document.getElementById('field-exchange-class');
    const exchangeInput = document.getElementById('file-exchange');
    if (showExchangeField) {
        exchangeField.classList.remove('hidden');
        exchangeInput.required = true;
    } else {
        exchangeField.classList.add('hidden');
        exchangeInput.required = false;
        exchangeInput.value = "";
    }

    // 2. [ส่วนที่เพิ่มใหม่] จัดการฟิลด์รถส่วนตัวและการค้นหาอัตโนมัติ
    const carField = document.getElementById('field-private-car');
    const carInput = document.getElementById('file-car');
    const manualUploadDiv = document.getElementById('manual-car-upload');
    const autoCarMsg = document.getElementById('auto-found-car-msg');
    const autoCarUrlInput = document.getElementById('auto-car-pdf-url');

    if (formData.vehicleOption === 'private') {
        carField.classList.remove('hidden');
        
        // ล้างค่าสถานะเดิม
        autoCarUrlInput.value = "";
        autoCarMsg.classList.add('hidden');
        manualUploadDiv.classList.remove('hidden');
        carInput.required = true;

        try {
            // ค้นหาใน Firestore (Collection: vehicle_requests) 
            // โดยอิงจาก ทะเบียนรถ + วันที่เริ่ม + วันที่สิ้นสุด + ชื่อผู้ใช้
            const querySnapshot = await db.collection('vehicle_requests')
                .where('licensePlate', '==', formData.licensePlate)
                .where('startDate', '==', formData.startDate)
                .where('endDate', '==', formData.endDate)
                .where('username', '==', formData.username)
                .limit(1)
                .get();

            if (!querySnapshot.empty) {
                // กรณีพบไฟล์ที่ตรงกัน
                const vehicleDoc = querySnapshot.docs[0].data();
                autoCarUrlInput.value = vehicleDoc.pdfUrl; // เก็บ URL ไฟล์ไว้
                
                autoCarMsg.classList.remove('hidden');    // แสดงข้อความสำเร็จ
                manualUploadDiv.classList.add('hidden');  // ซ่อนปุ่มเลือกไฟล์
                carInput.required = false;                // ไม่ต้องบังคับเลือกไฟล์เอง
                console.log("🔍 Auto-Found Vehicle PDF:", vehicleDoc.pdfUrl);
            }
        } catch (error) {
            console.error("Error searching vehicle database:", error);
            // กรณี Error ให้แสดงช่องอัปโหลดปกติ
            manualUploadDiv.classList.remove('hidden');
        }
    } else {
        carField.classList.add('hidden');
    }

    document.getElementById('upload-attachments-modal').style.display = 'flex';
}

// ฟังก์ชันสำหรับรวบรวมไฟล์และส่งไป Merge ที่ Cloud Run
// [แก้ไข] ฟังก์ชันรวบรวมไฟล์ส่งไป Merge (รองรับการดึงไฟล์อัตโนมัติจาก URL)
async function handleAttachmentsSubmit(e) {
    e.preventDefault();
    const requestId = document.getElementById('attach-request-id').value;
    const user = getCurrentUser();
    const btnText = document.getElementById('merge-button-text');
    
    toggleLoader('merge-files-button', true);
    if(btnText) btnText.innerText = "กำลังเตรียมไฟล์และรวบรวมข้อมูล...";

    try {
        const formData = new FormData();
        // 1. ใส่ไฟล์หลัก (บันทึกข้อความ)
        formData.append('files', window.currentMainPDF, '01_บันทึกข้อความขอไปราชการ.pdf');

        // 2. ฟังก์ชันช่วยเพิ่มไฟล์จาก Input
        const addManualFile = (id, label) => {
            const input = document.getElementById(id);
            if (input && input.files[0]) {
                formData.append('files', input.files[0], label + "_" + input.files[0].name);
            }
        };

        addManualFile('file-exchange', '02_บันทึกขอแลกคาบ');
        addManualFile('file-original', '03_หนังสือต้นเรื่อง');

        // 3. [ส่วนที่เพิ่มใหม่] จัดการไฟล์รถส่วนตัว (Auto URL vs Manual File)
        const autoCarUrl = document.getElementById('auto-car-pdf-url').value;
        if (autoCarUrl && autoCarUrl !== "") {
            // กรณีพบไฟล์อัตโนมัติ: ดึงไฟล์จาก URL มาเป็น Blob
            if(btnText) btnText.innerText = "กำลังดึงข้อมูลบันทึกรถส่วนตัวจากระบบ...";
            const response = await fetch(autoCarUrl);
            if (!response.ok) throw new Error("ไม่สามารถดาวน์โหลดไฟล์รถส่วนตัวจากระบบได้");
            const carBlob = await response.blob();
            formData.append('files', carBlob, '04_บันทึกขอใช้รถส่วนตัว_AUTO.pdf');
        } else {
            // กรณีต้องอัปโหลดเอง
            addManualFile('file-car', '04_บันทึกขอใช้รถส่วนตัว');
        }
        
        // อื่นๆ
        const others = document.getElementById('file-others').files;
        for (let i = 0; i < others.length; i++) {
            formData.append('files', others[i], `05_อื่นๆ_${i}_${others[i].name}`);
        }

        if(btnText) btnText.innerText = "กำลังประมวลผลรวมไฟล์ (Merge PDF)...";

        // 4. ส่งไป Cloud Run เพื่อ Merge
        const cloudRunBaseUrl = PDF_ENGINE_CONFIG.BASE_URL;
        const responseMerge = await fetch(`${cloudRunBaseUrl}/pdf/merge`, {
            method: "POST",
            body: formData
        });

        if (!responseMerge.ok) throw new Error("Cloud Run Merge Service Error");
        const mergedBlob = await responseMerge.blob();
        
        // 5. อัปโหลดผลลัพธ์ลง Drive
        const base64 = await blobToBase64(mergedBlob);
        const uploadResult = await apiCall('POST', 'uploadGeneratedFile', {
            data: base64,
            filename: `เอกสารรวม_${requestId.replace(/\//g,'-')}.pdf`,
            mimeType: 'application/pdf',
            username: user.username
        });

        if (uploadResult.status === 'success') {
            const finalUrl = uploadResult.url;
            const safeId = requestId.replace(/[\/\\:\.]/g, '-');
            await db.collection('requests').doc(safeId).set({
                pdfUrl: finalUrl,
                status: 'รอการตรวจสอบ'
            }, { merge: true });

            document.getElementById('upload-attachments-modal').style.display = 'none';
            showAlert('สำเร็จ', 'รวมไฟล์และส่งข้อมูลเรียบร้อยแล้ว');
            window.open(finalUrl, '_blank');
            
            clearRequestsCache();
            await fetchUserRequests();
            switchPage('dashboard-page');
        }

    } catch (error) {
        console.error(error);
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาด: ' + error.message);
    } finally {
        toggleLoader('merge-files-button', false);
        if(btnText) btnText.innerText = "ประมวลผลรวมไฟล์และส่งคำขอ";
    }
}
// [ใหม่] ฟังก์ชันจัดการการส่งฟอร์มขอใช้รถส่วนตัว (Vehicle Memo)
// [แก้ไขทั้งฟังก์ชัน] ฟังก์ชันบันทึกใบขอใช้รถส่วนตัวพร้อมระบบ Redirect กลับ
async function handleVehicleFormSubmit(e) {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) return;

    const formData = {
        username: user.username,
        requesterName: document.getElementById('vh-name').value.trim(),
        requesterPosition: document.getElementById('vh-position').value.trim(),
        vehicleType: document.getElementById('vh-type').value,
        licensePlate: document.getElementById('vh-license').value.trim(),
        reason: document.getElementById('vh-reason').value.trim(),
        destination: document.getElementById('vh-destination').value.trim(),
        location: document.getElementById('vh-location').value.trim(),
        startDate: document.getElementById('vh-start').value,
        endDate: document.getElementById('vh-end').value,
        distance: document.getElementById('vh-distance').value,
        docDate: new Date().toISOString().split('T')[0],
        doctype: 'vehicle_memo' 
    };

    toggleLoader('vh-submit-btn', true);

    try {
        // 1. สร้างเอกสาร PDF ขอใช้รถ
        const { pdfBlob } = await generateOfficialPDF(formData);
        const pdfBase64 = await blobToBase64(pdfBlob);
        
        // 2. อัปโหลดและบันทึกลงฐานข้อมูล
        const uploadResult = await apiCall('POST', 'uploadGeneratedFile', {
            data: pdfBase64,
            filename: `บันทึกขอใช้รถ_${formData.licensePlate}_${formData.startDate}.pdf`,
            mimeType: 'application/pdf',
            username: user.username
        });

        if (uploadResult.status === 'success') {
            const docId = `${user.username}-${formData.licensePlate}-${formData.startDate}`.replace(/[\s\/]/g, '-');
            await db.collection('vehicle_requests').doc(docId).set({
                ...formData,
                pdfUrl: uploadResult.url,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });

            showAlert('สำเร็จ', 'บันทึกข้อมูลรถเรียบร้อยแล้ว ท่านสามารถปริ้นเอกสารนี้ได้ทันที');
            window.open(uploadResult.url, '_blank'); // เปิดให้ปริ้นทันที

            // 3. ตรวจสอบว่ามี "คำขอไปราชการ" ค้างอยู่หรือไม่
            const pendingRequest = sessionStorage.getItem('pendingTravelRequest');
            if (pendingRequest) {
                if (await showConfirm('ดำเนินการต่อ', 'ระบบพบว่าท่านมีคำขอไปราชการที่ค้างอยู่ ต้องการกลับไปดำเนินการต่อหรือไม่?')) {
                    sessionStorage.removeItem('pendingTravelRequest');
                    switchPage('form-page');
                    return;
                }
            }
            switchPage('dashboard-page');
        }
    } catch (error) { 
        showAlert('ผิดพลาด', error.message); 
    } finally { 
        toggleLoader('vh-submit-btn', false); 
    }
}

// [แก้ไขทั้งฟังก์ชัน] openAttachmentModal เพื่อรองรับ Auto-Match
async function openAttachmentModal(requestId, formData) {
    document.getElementById('attach-request-id').value = requestId;
    
    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    let hasWeekday = false;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (d.getDay() >= 1 && d.getDay() <= 5) { hasWeekday = true; break; }
    }

    const isViceDirector = formData.requesterPosition.includes("รองผู้อำนวยการ");
    const isAlone = (!formData.attendees || formData.attendees.length === 0);
    const showExchangeField = hasWeekday && !(isViceDirector && isAlone);

    const exchangeField = document.getElementById('field-exchange-class');
    const exchangeInput = document.getElementById('file-exchange');
    if (showExchangeField) {
        exchangeField.classList.remove('hidden');
        exchangeInput.required = true;
    } else {
        exchangeField.classList.add('hidden');
        exchangeInput.required = false;
        exchangeInput.value = "";
    }

    const carField = document.getElementById('field-private-car');
    const carInput = document.getElementById('file-car');
    const autoCarMsg = document.getElementById('auto-found-car-msg');
    const autoCarUrlInput = document.getElementById('auto-car-pdf-url');

    if (formData.vehicleOption === 'private') {
        carField.classList.remove('hidden');
        autoCarUrlInput.value = ""; autoCarMsg.classList.add('hidden'); carInput.classList.remove('hidden'); carInput.required = true;

        try {
            // ค้นหาใน Firestore อัตโนมัติ
            const snap = await db.collection('vehicle_requests')
                .where('licensePlate', '==', formData.licensePlate)
                .where('startDate', '==', formData.startDate)
                .where('endDate', '==', formData.endDate)
                .where('username', '==', formData.username).get();

            if (!snap.empty) {
                const data = snap.docs[0].data();
                autoCarUrlInput.value = data.pdfUrl;
                autoCarMsg.classList.remove('hidden'); // แสดงข้อความ "พบข้อมูลแล้ว"
                carInput.classList.add('hidden');      // ซ่อนช่องเลือกไฟล์
                carInput.required = false;
            }
        } catch (err) { console.error("Auto-match error:", err); }
    } else { carField.classList.add('hidden'); }

    document.getElementById('upload-attachments-modal').style.display = 'flex';
}

// [แก้ไขทั้งฟังก์ชัน] handleAttachmentsSubmit เพื่อรวมไฟล์จาก URL
async function handleAttachmentsSubmit(e) {
    e.preventDefault();
    const requestId = document.getElementById('attach-request-id').value;
    const user = getCurrentUser();
    toggleLoader('merge-files-button', true);

    try {
        const formData = new FormData();
        formData.append('files', window.currentMainPDF, '01_บันทึกข้อความ.pdf');

        const addFile = (id, label) => {
            const input = document.getElementById(id);
            if (input && input.files[0]) formData.append('files', input.files[0], label + "_" + input.files[0].name);
        };

        addFile('file-exchange', '02_บันทึกขอแลกคาบ');
        addFile('file-original', '03_หนังสือต้นเรื่อง');

        const autoCarUrl = document.getElementById('auto-car-pdf-url').value;
        if (autoCarUrl) {
            // ถ้าพบข้อมูลอัตโนมัติ ให้ดึงจาก URL มา Merge
            const res = await fetch(autoCarUrl);
            const blob = await res.blob();
            formData.append('files', blob, '04_บันทึกรถส่วนตัว_AUTO.pdf');
        } else {
            addFile('file-car', '04_บันทึกรถส่วนตัว');
        }

        const others = document.getElementById('file-others').files;
        for (let i = 0; i < others.length; i++) formData.append('files', others[i], `05_อื่นๆ_${i}_${others[i].name}`);

        const response = await fetch(`${PDF_ENGINE_CONFIG.BASE_URL}pdf/merge`, { method: "POST", body: formData });
        if (!response.ok) throw new Error("Merge Service Error");
        
        const mergedBlob = await response.blob();
        const base64 = await blobToBase64(mergedBlob);
        const upload = await apiCall('POST', 'uploadGeneratedFile', {
            data: base64, filename: `เอกสารรวม_${requestId.replace(/\//g,'-')}.pdf`, mimeType: 'application/pdf', username: user.username
        });

        if (upload.status === 'success') {
            await db.collection('requests').doc(requestId.replace(/[\/\\:\.]/g, '-')).set({ pdfUrl: upload.url, status: 'รอการตรวจสอบ' }, { merge: true });
            document.getElementById('upload-attachments-modal').style.display = 'none';
            window.open(upload.url, '_blank');
            await fetchUserRequests(); switchPage('dashboard-page');
        }
    } catch (error) { showAlert('ผิดพลาด', error.message); } finally { toggleLoader('merge-files-button', false); }
}
