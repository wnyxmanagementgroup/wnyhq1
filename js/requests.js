// ==========================================================================
// FILE: requests.js
// รายละเอียด: จัดการ Logic คำขอ, การบันทึก, การแก้ไข, และการเชื่อมต่อ API
// ==========================================================================

// --- PART 1: ACTION ROUTER & HANDLING ---

// ตัวจัดการปุ่ม Action ต่างๆ ในตาราง (แก้ไข, ลบ, ส่งบันทึก, ออก PDF)
async function handleRequestAction(e) {
    // หาปุ่มที่ถูกกด (รองรับกรณีคลิกโดนไอคอนข้างในปุ่ม)
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
        // เปิด Modal ส่งบันทึกข้อความ (Upload Memo)
        console.log("📤 Opening send memo modal for:", requestId);
        const modal = document.getElementById('send-memo-modal');
        const inputId = document.getElementById('memo-modal-request-id');
        if (modal && inputId) {
            inputId.value = requestId;
            modal.style.display = 'flex';
        } else {
            console.error("Memo modal elements not found");
        }

    } else if (action === 'submit-memo-only') {
        // ปุ่มลัด: ออกเฉพาะบันทึกข้อความ
        const req = allRequestsCache.find(r => r.id === requestId);
        if (req && typeof submitToSheetAndGeneratePDF === 'function') {
            await submitToSheetAndGeneratePDF(req, 'memo');
        }

    } else if (action === 'submit-and-pdf') {
        // ปุ่มลัด: บันทึกและออกเอกสารอัตโนมัติ (Memo/Command)
        const req = allRequestsCache.find(r => r.id === requestId);
        if (req && typeof submitToSheetAndGeneratePDF === 'function') {
            await submitToSheetAndGeneratePDF(req); 
        }
    }
}

// ฟังก์ชันลบคำขอ (รองรับทั้ง GAS และ Firebase)
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

        // 1. ส่งคำสั่งลบไปที่ GAS
        const result = await apiCall('POST', 'deleteRequest', {
            requestId: requestId,
            username: user.username
        });

        if (result.status === 'success') {
            
            // 2. ถ้าเปิดใช้ Firebase ให้ลบใน Firebase ด้วย
            if (typeof db !== 'undefined' && typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE) {
                try {
                    const query = await db.collection('requests').where('requestId', '==', requestId).get();
                    if (!query.empty) {
                        const batch = db.batch();
                        query.docs.forEach(doc => batch.delete(doc.ref));
                        await batch.commit();
                        console.log("Deleted from Firebase");
                    }
                } catch (fbError) {
                    console.warn("⚠️ Failed to delete from Firebase:", fbError);
                }
            }

            showAlert('สำเร็จ', 'ลบคำขอเรียบร้อยแล้ว');
            
            // 3. รีเฟรชหน้าจอ
            clearRequestsCache();
            await fetchUserRequests(); 
            
            // ถ้ากำลังเปิดหน้า Edit ของอันที่ลบอยู่ ให้เด้งกลับ
            if (!document.getElementById('edit-page').classList.contains('hidden')) {
                const currentEditId = sessionStorage.getItem('currentEditRequestId');
                if (currentEditId === requestId) {
                    await switchPage('dashboard-page');
                }
            }
            
        } else {
            showAlert('ผิดพลาด', result.message || 'ไม่สามารถลบคำขอได้');
        }

    } catch (error) {
        console.error('Error deleting request:', error);
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการลบคำขอ: ' + error.message);
    }
}

// --- PART 2: DATA FETCHING & DASHBOARD ---

// ฟังก์ชันหลักในการดึงข้อมูลมาแสดงที่ Dashboard
async function fetchUserRequests() {
    try {
        const user = getCurrentUser();
        if (!user) return;

        // Reset UI States
        const loader = document.getElementById('requests-loader');
        const list = document.getElementById('requests-list');
        const noData = document.getElementById('no-requests-message');

        if (loader) loader.classList.remove('hidden');
        if (list) list.classList.add('hidden');
        if (noData) noData.classList.add('hidden'); // ซ่อนข้อความไม่พบข้อมูลไปก่อน

        let requestsData = [];
        let memosData = [];

        // 1. ดึงข้อมูล Requests (พยายามใช้ Firebase ก่อน ถ้ามี)
        if (typeof fetchRequestsHybrid === 'function' && typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE) {
            const firebaseResult = await fetchRequestsHybrid(user);
            if (firebaseResult !== null) {
                requestsData = firebaseResult;
            } else {
                // Fallback to GAS
                const res = await apiCall('GET', 'getUserRequests', { username: user.username });
                if (res.status === 'success') requestsData = res.data;
            }
        } else {
            // Standard GAS Call
            const res = await apiCall('GET', 'getUserRequests', { username: user.username });
            if (res.status === 'success') requestsData = res.data;
        }

        // 2. ดึงข้อมูล Memos (บันทึกข้อความที่เคยส่ง)
        const memosResult = await apiCall('GET', 'getSentMemos', { username: user.username });
        if (memosResult.status === 'success') memosData = memosResult.data || [];
        
        // 3. กรองและเรียงลำดับ
        if (requestsData && requestsData.length > 0) {
            // กรองเฉพาะของ User คนนี้ (กันเหนียว)
            requestsData = requestsData.filter(req => req.username === user.username);
            
            // เรียงจากใหม่ไปเก่า
            requestsData.sort((a, b) => {
                const dateA = new Date(a.timestamp || a.docDate || 0).getTime();
                const dateB = new Date(b.timestamp || b.docDate || 0).getTime();
                return dateB - dateA;
            });
        }

        // 4. เก็บลง Cache และแสดงผล
        allRequestsCache = requestsData;
        userMemosCache = memosData;
        
        renderRequestsList(allRequestsCache, userMemosCache);
        
        // อัปเดตการแจ้งเตือน (Badge)
        if (typeof updateNotifications === 'function') {
            updateNotifications(allRequestsCache, userMemosCache);
        }

    } catch (error) {
        console.error('Error fetching requests:', error);
        const list = document.getElementById('requests-list');
        if (list) {
            list.innerHTML = `<div class="text-center py-8 text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล<br><small>${error.message}</small><br><button onclick="fetchUserRequests()" class="mt-2 text-blue-500 underline">ลองใหม่</button></div>`;
            list.classList.remove('hidden');
        }
    } finally {
        const loader = document.getElementById('requests-loader');
        if (loader) loader.classList.add('hidden');
    }
}

// ฟังก์ชัน Render HTML ของรายการคำขอ
function renderRequestsList(requests, memos, searchTerm = '') {
    const container = document.getElementById('requests-list');
    const noRequestsMessage = document.getElementById('no-requests-message');
    
    // Safety check
    if (!container || !noRequestsMessage) return;

    // 1. กรณีไม่มีข้อมูลเลย
    if (!requests || requests.length === 0) {
        container.innerHTML = '';
        container.classList.add('hidden');
        noRequestsMessage.classList.remove('hidden');
        // ปรับข้อความให้ดูดี
        noRequestsMessage.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10">
                <div class="bg-gray-100 p-4 rounded-full mb-3">
                    <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                </div>
                <p class="text-gray-500 font-medium">ยังไม่มีรายการคำขอไปราชการ</p>
                <button onclick="switchPage('form-page')" class="mt-3 text-indigo-600 hover:underline text-sm">สร้างคำขอใหม่</button>
            </div>
        `;
        return;
    }

    // 2. การค้นหา (Filtering)
    let filteredRequests = requests;
    if (searchTerm) {
        const term = searchTerm.toLowerCase();
        filteredRequests = requests.filter(req => 
            (req.purpose && req.purpose.toLowerCase().includes(term)) ||
            (req.location && req.location.toLowerCase().includes(term)) ||
            (req.id && req.id.toLowerCase().includes(term))
        );
    }

    // 3. กรณีค้นหาแล้วไม่เจอ
    if (filteredRequests.length === 0) {
        container.classList.add('hidden');
        noRequestsMessage.classList.remove('hidden');
        noRequestsMessage.textContent = `ไม่พบข้อมูลที่ตรงกับ "${searchTerm}"`;
        return;
    }

    // 4. แสดงรายการ
    noRequestsMessage.classList.add('hidden');
    container.classList.remove('hidden');

    container.innerHTML = filteredRequests.map(request => {
        // หา Memo ที่เกี่ยวข้องกับ Request นี้
        const relatedMemo = memos ? memos.find(memo => memo.refNumber === request.id) : null;
        
        // Logic การแสดงสถานะ
        let displayRequestStatus = request.status;
        let displayCommandStatus = request.commandStatus;
        
        if (relatedMemo) {
            displayRequestStatus = relatedMemo.status;
            displayCommandStatus = relatedMemo.status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' ? 'เสร็จสิ้น' : relatedMemo.status;
        }
        
        const isFullyCompleted = displayRequestStatus === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' || displayRequestStatus === 'เสร็จสิ้น';
        
        // ตรวจสอบไฟล์ที่เสร็จสมบูรณ์
        const completedMemoUrl = relatedMemo?.completedMemoUrl || request.completedMemoUrl;
        const completedCommandUrl = relatedMemo?.completedCommandUrl || request.completedCommandUrl;
        const dispatchBookUrl = relatedMemo?.dispatchBookUrl || request.dispatchBookUrl;
        const hasCompletedFiles = completedMemoUrl || completedCommandUrl || dispatchBookUrl;

        // Sanitization ป้องกัน XSS
        const safeId = escapeHtml(request.id || request.requestId || 'รอออกเลข');
        const safePurpose = escapeHtml(request.purpose || 'ไม่มีวัตถุประสงค์');
        const safeLocation = escapeHtml(request.location || 'ไม่ระบุ');
        
        return `
            <div class="border rounded-lg p-4 mb-4 bg-white shadow-sm ${isFullyCompleted ? 'border-green-200 bg-green-50/30' : ''} hover:shadow-md transition-all">
                <div class="flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div class="flex-1 w-full">
                        <div class="flex items-center flex-wrap gap-2 mb-2">
                            <span class="bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-1 rounded border border-indigo-200">${safeId}</span>
                            ${isFullyCompleted ? '<span class="text-green-600 text-xs font-bold flex items-center gap-1">✅ เสร็จสิ้น</span>' : ''}
                            ${displayRequestStatus === 'นำกลับไปแก้ไข' ? '<span class="bg-red-100 text-red-800 text-xs px-2 py-1 rounded">⚠️ แก้ไข</span>' : ''}
                        </div>
                        <h3 class="font-bold text-gray-800 text-lg leading-snug mb-1">${safePurpose}</h3>
                        <p class="text-sm text-gray-500">📍 ${safeLocation} | 📅 ${formatDisplayDate(request.startDate)}</p>
                        
                        <div class="mt-3 grid grid-cols-2 gap-2 text-sm max-w-md">
                            <div class="bg-gray-50 p-2 rounded border border-gray-100">
                                <span class="text-gray-500 text-xs block">สถานะคำขอ</span>
                                <span class="${getStatusColor(displayRequestStatus)} font-medium">${translateStatus(displayRequestStatus)}</span>
                            </div>
                            <div class="bg-gray-50 p-2 rounded border border-gray-100">
                                <span class="text-gray-500 text-xs block">สถานะคำสั่ง</span>
                                <span class="${getStatusColor(displayCommandStatus || 'กำลังดำเนินการ')} font-medium">${translateStatus(displayCommandStatus || 'กำลังดำเนินการ')}</span>
                            </div>
                        </div>

                        ${hasCompletedFiles ? `
                            <div class="mt-3 flex flex-wrap gap-2">
                                ${completedMemoUrl ? `<a href="${completedMemoUrl}" target="_blank" class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 border border-green-200">📄 บันทึกข้อความ</a>` : ''}
                                ${completedCommandUrl ? `<a href="${completedCommandUrl}" target="_blank" class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 border border-blue-200">📋 คำสั่ง</a>` : ''}
                                ${dispatchBookUrl ? `<a href="${dispatchBookUrl}" target="_blank" class="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded hover:bg-purple-200 border border-purple-200">📦 หนังสือส่ง</a>` : ''}
                            </div>
                        ` : ''}
                    </div>
                    
                    <div class="flex flex-row sm:flex-col gap-2 w-full sm:w-auto mt-2 sm:mt-0 min-w-[120px]">
                        ${request.pdfUrl ? `<a href="${request.pdfUrl}" target="_blank" class="btn btn-success btn-sm w-full text-center">📄 ดูคำขอ</a>` : ''}
                        
                        ${!isFullyCompleted ? `
                            <button data-action="edit" data-id="${request.id || request.requestId}" class="btn bg-gray-100 hover:bg-gray-200 text-gray-700 btn-sm w-full">✏️ แก้ไข</button>
                            <button data-action="delete" data-id="${request.id || request.requestId}" class="btn text-red-500 hover:bg-red-50 btn-sm w-full border border-red-100">🗑️ ลบ</button>
                        ` : ''}
                        
                        ${(displayRequestStatus === 'นำกลับไปแก้ไข' || (!relatedMemo && !isFullyCompleted)) ? 
                            `<button data-action="send-memo" data-id="${request.id || request.requestId}" class="btn bg-blue-600 hover:bg-blue-700 text-white btn-sm w-full shadow-sm">📤 ส่งบันทึก</button>` 
                        : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// --- PART 3: FORM HANDLING (CREATE) ---

// ✅ แก้ไข: ฟังก์ชันนี้ใช้ Radio Button แล้ว
function toggleVehicleDetails() {
    // หา Radio ที่ถูก check
    const selected = document.querySelector('input[name="vehicle_option"]:checked');
    const value = selected ? selected.value : 'gov'; // Default gov

    const privateDetails = document.getElementById('private-vehicle-details');
    const publicDetails = document.getElementById('public-vehicle-details');

    if (privateDetails) privateDetails.classList.toggle('hidden', value !== 'private');
    if (publicDetails) publicDetails.classList.toggle('hidden', value !== 'public');
}

// ฟังก์ชัน Toggle ค่าใช้จ่าย
function toggleExpenseOptions() {
    const isPartial = document.getElementById('expense_partial').checked;
    const details = document.getElementById('partial-expense-options');
    const total = document.getElementById('total-expense-container');

    if (details) details.classList.toggle('hidden', !isPartial);
    if (total) total.classList.toggle('hidden', !isPartial);
}

// ✅ แก้ไข: ฟังก์ชันบันทึกข้อมูล (แก้บั๊กบันทึกไม่ได้)
async function handleRequestFormSubmit(e) {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) { showAlert('ผิดพลาด', 'กรุณาเข้าสู่ระบบก่อน'); return; }

    // Safety check for button
    const submitBtn = document.getElementById('submit-request-button');
    if (submitBtn && submitBtn.disabled) return;

    // 1. ดึงค่าจาก Radio (แบบปลอดภัย)
    const vehicleInput = document.querySelector('input[name="vehicle_option"]:checked');
    const vehicleOption = vehicleInput ? vehicleInput.value : 'gov';

    // 2. รวบรวมข้อมูล
    const formData = {
        username: user.username,
        docDate: document.getElementById('form-doc-date').value,
        requesterName: document.getElementById('form-requester-name').value,
        requesterPosition: document.getElementById('form-requester-position').value,
        location: document.getElementById('form-location').value,
        purpose: document.getElementById('form-purpose').value,
        startDate: document.getElementById('form-start-date').value,
        endDate: document.getElementById('form-end-date').value,
        
        attendees: getAttendeesFromForm('form-attendees-list'),
        
        expenseOption: document.querySelector('input[name="expense_option"]:checked')?.value || 'no',
        expenseItems: [],
        totalExpense: document.getElementById('form-total-expense').value || 0,
        
        vehicleOption: vehicleOption, // ใช้ค่าที่ดึงมาอย่างถูกต้อง
        licensePlate: document.getElementById('form-license-plate').value,
        publicVehicleDetails: document.getElementById('form-public-vehicle-details').value, // แก้ชื่อ field ให้ตรงกับ HTML
        
        department: document.getElementById('form-department').value,
        headName: document.getElementById('form-head-name').value,
        isEdit: false,
        status: 'Submitted'
    };

    // 3. จัดการ Checkbox รายการค่าใช้จ่าย
    if (formData.expenseOption === 'partial') {
        document.querySelectorAll('input[name="expense_item"]:checked').forEach(chk => {
            const item = { name: chk.dataset.itemName || chk.value };
            if (item.name === 'ค่าใช้จ่ายอื่นๆ') { 
                item.detail = document.getElementById('expense_other_text').value; 
            }
            formData.expenseItems.push(item);
        });
    }

    // 4. Validation เบื้องต้น
    if (!formData.docDate || !formData.requesterName || !formData.purpose) {
        Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอกข้อมูลสำคัญให้ครบถ้วน', 'warning');
        return;
    }

    toggleLoader('submit-request-button', true);
    
    try {
        let result;
        // Logic Hybrid: ส่ง Firebase ถ้ามี, ถ้าไม่มีส่ง GAS
        if (typeof createRequestHybrid === 'function' && typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE) {
            result = await createRequestHybrid(formData);
        } else {
            result = await apiCall('POST', 'createRequest', formData);
        }

        if (result.status === 'success') {
            // แจ้งเตือนสำเร็จ
            if (typeof Swal !== 'undefined') {
                Swal.fire({
                    icon: 'success',
                    title: 'บันทึกสำเร็จ',
                    text: 'กำลังสร้างเอกสาร PDF...',
                    timer: 2000,
                    showConfirmButton: false
                });
            } else {
                showAlert('สำเร็จ', 'บันทึกสำเร็จ');
            }

            // เปิด PDF
            if (result.data && result.data.pdfUrl) {
                const pdfUrl = result.data.pdfUrl;
                setTimeout(() => window.open(pdfUrl, '_blank'), 1500);
                
                const linkBtn = document.getElementById('form-result-link');
                if(linkBtn) {
                    linkBtn.href = pdfUrl;
                    linkBtn.classList.remove('hidden');
                }
            }
            
            // แสดงผลลัพธ์และรีเซ็ต
            const resDiv = document.getElementById('form-result');
            if(resDiv) resDiv.classList.remove('hidden');
            
            resetRequestForm();
            
            clearRequestsCache();
            await fetchUserRequests(); 
        } else { 
            throw new Error(result.message);
        }
    } catch (error) { 
        console.error("Submit Error:", error);
        showAlert('บันทึกไม่สำเร็จ', error.message); 
    } finally { 
        toggleLoader('submit-request-button', false); 
    }
}

// ฟังก์ชัน Reset Form
function resetRequestForm() {
    const form = document.getElementById('request-form');
    if (form) form.reset();
    
    const attList = document.getElementById('form-attendees-list');
    if (attList) attList.innerHTML = '';
    
    // ตั้งค่าวันที่ปัจจุบัน
    const today = new Date().toISOString().split('T')[0];
    ['form-doc-date', 'form-start-date', 'form-end-date'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = today;
    });

    // Reset UI State
    toggleVehicleDetails();
    toggleExpenseOptions();
    
    // Auto fill again
    tryAutoFillRequester();
}

// Auto Fill ผู้ขอ
function tryAutoFillRequester() {
    const user = getCurrentUser();
    if(user) {
        const nameEl = document.getElementById('form-requester-name');
        const posEl = document.getElementById('form-requester-position');
        if(nameEl && !nameEl.value) nameEl.value = user.fullName || '';
        if(posEl && !posEl.value) posEl.value = user.position || '';
    }
}

// Helper: ดึงรายชื่อผู้ร่วมเดินทาง
function getAttendeesFromForm(listId) {
    const list = document.getElementById(listId);
    if (!list) return [];
    return Array.from(list.children).map(div => {
        const nameInput = div.querySelector('.attendee-name');
        const posInput = div.querySelector('.attendee-position-input'); // หรือ .attendee-position-other
        
        return { 
            name: nameInput ? nameInput.value.trim() : '', 
            position: posInput ? posInput.value.trim() : '' 
        };
    }).filter(att => att.name); // เอาเฉพาะที่มีชื่อ
}

// ฟังก์ชันเพิ่มผู้ร่วมเดินทาง
function addAttendeeField(name = '', position = 'ครู') {
    const list = document.getElementById('form-attendees-list');
    if(!list) return;
    const div = document.createElement('div');
    div.className = 'grid grid-cols-1 md:grid-cols-3 gap-2 items-center mb-2 attendee-row';
    div.innerHTML = `
        <div class="md:col-span-1"><input type="text" class="form-input attendee-name w-full" placeholder="ชื่อ-นามสกุล" value="${escapeHtml(name)}"></div>
        <div class="md:col-span-1"><input type="text" class="form-input attendee-position-input w-full" placeholder="ตำแหน่ง" value="${escapeHtml(position)}"></div>
        <button type="button" class="btn btn-danger btn-sm px-3" onclick="this.parentElement.remove()">ลบ</button>`;
    list.appendChild(div);
}

// --- PART 4: EDIT PAGE HANDLING ---

// รีเซ็ตหน้าแก้ไข
function resetEditPage() {
    console.log("🧹 Resetting edit page...");
    const form = document.getElementById('edit-request-form');
    if(form) form.reset();
    
    const list = document.getElementById('edit-attendees-list');
    if(list) list.innerHTML = '';
    
    document.getElementById('edit-result')?.classList.add('hidden');
    sessionStorage.removeItem('currentEditRequestId');
    
    // Reset hidden fields
    ['edit-request-id', 'edit-draft-id'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = '';
    });
}

// ตั้งค่า Event Listeners สำหรับหน้าแก้ไข
function setupEditPageEventListeners() {
    const backBtn = document.getElementById('back-to-dashboard');
    if(backBtn) backBtn.addEventListener('click', () => switchPage('dashboard-page'));
    
    const genBtn = document.getElementById('generate-document-button');
    if(genBtn) genBtn.addEventListener('click', generateDocumentFromDraft);
    
    const addAttBtn = document.getElementById('edit-add-attendee');
    if(addAttBtn) addAttBtn.addEventListener('click', () => addEditAttendeeField());
    
    // Radio events
    document.querySelectorAll('input[name="edit-expense_option"]').forEach(r => r.addEventListener('change', toggleEditExpenseOptions));
    document.querySelectorAll('input[name="edit-vehicle_option"]').forEach(r => r.addEventListener('change', toggleEditVehicleDetails)); 
    
    // Deparment dropdown
    const deptSelect = document.getElementById('edit-department');
    if(deptSelect) {
        deptSelect.addEventListener('change', (e) => {
            const headEl = document.getElementById('edit-head-name');
            if(headEl && typeof specialPositionMap !== 'undefined') {
                headEl.value = specialPositionMap[e.target.value] || '';
            }
        });
    }
}

// เปิดหน้าแก้ไข (Load Data)
async function openEditPage(requestId) {
    try {
        if (!requestId) return showAlert("ผิดพลาด", "ไม่พบรหัสคำขอ");
        const user = getCurrentUser();
        if (!user) return showAlert("ผิดพลาด", "กรุณาเข้าสู่ระบบใหม่");
        
        document.getElementById('edit-result').classList.add('hidden');
        
        // เรียก API ดึงข้อมูล Draft
        const result = await apiCall('GET', 'getDraftRequest', { requestId: requestId, username: user.username });

        if (result.status === 'success' && result.data) {
            sessionStorage.setItem('currentEditRequestId', requestId);
            
            // ข้อมูลอาจซ้อนอยู่ใน data.data หรือ data ชั้นนอก
            const data = result.data.data || result.data;
            await populateEditForm(data);
            
            switchPage('edit-page');
        } else {
            showAlert("ผิดพลาด", result.message || "ไม่พบข้อมูลคำขอ");
        }
    } catch (error) { 
        showAlert("ผิดพลาด", "ไม่สามารถโหลดข้อมูลได้: " + error.message); 
    }
}

// นำข้อมูลลงฟอร์มแก้ไข
async function populateEditForm(requestData) {
    try {
        // IDs
        document.getElementById('edit-draft-id').value = requestData.draftId || '';
        document.getElementById('edit-request-id').value = requestData.requestId || requestData.id || '';
        
        // Date Helper
        const formatDate = (d) => d ? new Date(d).toISOString().split('T')[0] : '';
        
        // Basic Info
        document.getElementById('edit-doc-date').value = formatDate(requestData.docDate);
        document.getElementById('edit-requester-name').value = requestData.requesterName || '';
        document.getElementById('edit-requester-position').value = requestData.requesterPosition || '';
        document.getElementById('edit-location').value = requestData.location || '';
        document.getElementById('edit-purpose').value = requestData.purpose || '';
        document.getElementById('edit-start-date').value = formatDate(requestData.startDate);
        document.getElementById('edit-end-date').value = formatDate(requestData.endDate);
        
        // Attendees
        const attendeesList = document.getElementById('edit-attendees-list');
        attendeesList.innerHTML = '';
        let attendees = requestData.attendees;
        // Parse JSON if needed
        if (typeof attendees === 'string') {
            try { attendees = JSON.parse(attendees); } catch(e) { attendees = []; }
        }
        if (attendees && Array.isArray(attendees)) {
            attendees.forEach(att => { 
                if(att.name) addEditAttendeeField(att.name, att.position); 
            });
        }
        
        // Expenses
        if (requestData.expenseOption === 'partial') {
            document.getElementById('edit-expense_partial').checked = true;
            toggleEditExpenseOptions();
            
            let expenseItems = requestData.expenseItems;
            if (typeof expenseItems === 'string') {
                try { expenseItems = JSON.parse(expenseItems); } catch(e) { expenseItems = []; }
            }
            
            if (Array.isArray(expenseItems)) {
                expenseItems.forEach(item => {
                    const itemName = item.name || item; // Handle both object and string format
                    const chk = document.querySelector(`input[name="edit-expense_item"][value="${itemName}"]`) || 
                                document.querySelector(`input[name="edit-expense_item"][data-item-name="${itemName}"]`);
                    
                    if(chk) { 
                        chk.checked = true; 
                        if(itemName === 'ค่าใช้จ่ายอื่นๆ') {
                            document.getElementById('edit-expense_other_text').value = item.detail || ''; 
                        }
                    }
                });
            }
            document.getElementById('edit-total-expense').value = requestData.totalExpense || '';
        } else {
            document.getElementById('edit-expense_no').checked = true;
            toggleEditExpenseOptions();
        }
        
        // Vehicles (แก้ไขให้รองรับ Radio)
        if (requestData.vehicleOption) {
            const vehicleRadio = document.querySelector(`input[name="edit-vehicle_option"][value="${requestData.vehicleOption}"]`);
            if (vehicleRadio) {
                vehicleRadio.checked = true;
                toggleEditVehicleDetails();
                
                if (requestData.vehicleOption === 'private') {
                    document.getElementById('edit-license-plate').value = requestData.licensePlate || '';
                }
                if (requestData.vehicleOption === 'public') {
                    // บางทีใช้ field licensePlate เก็บแทน public details ใน legacy code
                    const details = requestData.publicVehicleDetails || requestData.licensePlate || '';
                    document.getElementById('edit-public-vehicle-details').value = details;
                }
            }
        } else {
            // Default gov
            const gov = document.getElementById('edit-vehicle_gov');
            if(gov) gov.checked = true;
        }
        
        // Department
        if (requestData.department) {
            document.getElementById('edit-department').value = requestData.department;
            const headName = requestData.headName || (typeof specialPositionMap !== 'undefined' ? specialPositionMap[requestData.department] : '');
            document.getElementById('edit-head-name').value = headName || '';
        }
    } catch (error) { 
        console.error("Error populating edit form:", error); 
    }
}

// เพิ่มผู้ร่วมเดินทางหน้าแก้ไข
function addEditAttendeeField(name = '', position = '') {
    const list = document.getElementById('edit-attendees-list');
    const div = document.createElement('div');
    div.className = 'grid grid-cols-1 md:grid-cols-3 gap-2 items-center mb-2 bg-gray-50 p-3 rounded border border-gray-200';
    div.innerHTML = `
        <div class="md:col-span-1"><input type="text" class="form-input attendee-name w-full" placeholder="ชื่อ-นามสกุล" value="${escapeHtml(name)}" required></div>
        <div class="md:col-span-1"><input type="text" class="form-input attendee-position-other w-full" placeholder="ตำแหน่ง" value="${escapeHtml(position)}"></div>
        <button type="button" class="btn btn-danger btn-sm" onclick="this.closest('.grid').remove()">ลบ</button>`;
    list.appendChild(div);
}

// Toggle หน้าแก้ไข
function toggleEditExpenseOptions() {
    const show = document.getElementById('edit-expense_partial')?.checked;
    const details = document.getElementById('edit-partial-expense-options');
    const total = document.getElementById('edit-total-expense-container');
    if(details) details.classList.toggle('hidden', !show);
    if(total) total.classList.toggle('hidden', !show);
}

function toggleEditVehicleDetails() {
    const val = document.querySelector('input[name="edit-vehicle_option"]:checked')?.value;
    const pvt = document.getElementById('edit-private-vehicle-details');
    const pub = document.getElementById('edit-public-vehicle-details');
    if(pvt) pvt.classList.toggle('hidden', val !== 'private');
    if(pub) pub.classList.toggle('hidden', val !== 'public');
}

// บันทึกการแก้ไข (Update Request)
async function generateDocumentFromDraft() {
    let requestId = document.getElementById('edit-request-id').value || sessionStorage.getItem('currentEditRequestId');
    if (!requestId) return showAlert("ผิดพลาด", "ไม่พบรหัสคำขอ");

    const formData = getEditFormData();
    if (!validateEditForm(formData)) return;
    
    toggleLoader('generate-document-button', true);
    try {
        let result;
        // ลอง Update ก่อน ถ้าไม่เจอ Create ใหม่
        try { 
            result = await apiCall('POST', 'updateRequest', formData); 
        } catch (e) { 
            console.warn("Update failed, trying Create", e);
            result = await apiCall('POST', 'createRequest', formData); 
        }
        
        if (result.status === 'success') {
            document.getElementById('edit-result-title').textContent = 'อัปเดตเอกสารสำเร็จ!';
            const link = document.getElementById('edit-result-link');
            if (result.data.pdfUrl) {
                link.href = result.data.pdfUrl;
                link.classList.remove('hidden');
                setTimeout(() => window.open(result.data.pdfUrl, '_blank'), 1000);
            }
            document.getElementById('edit-result').classList.remove('hidden');
            
            clearRequestsCache();
            await fetchUserRequests();
            showAlert("สำเร็จ", "อัปเดตเอกสารเรียบร้อยแล้ว");
        } else { 
            showAlert("ผิดพลาด", result.message); 
        }
    } catch (error) { 
        showAlert("เกิดข้อผิดพลาด", error.message); 
    } finally { 
        toggleLoader('generate-document-button', false); 
    }
}

// รวบรวมข้อมูลจากหน้าแก้ไข
function getEditFormData() {
    try {
        const expenseItems = [];
        if (document.querySelector('input[name="edit-expense_option"]:checked')?.value === 'partial') {
            document.querySelectorAll('input[name="edit-expense_item"]:checked').forEach(chk => {
                const item = { name: chk.dataset.itemName || chk.value };
                if (item.name === 'ค่าใช้จ่ายอื่นๆ') {
                    item.detail = document.getElementById('edit-expense_other_text').value.trim();
                }
                expenseItems.push(item);
            });
        }
        
        const attendees = Array.from(document.querySelectorAll('#edit-attendees-list .grid')).map(div => ({
            name: div.querySelector('.attendee-name').value.trim(),
            position: div.querySelector('.attendee-position-other').value.trim()
        })).filter(att => att.name);

        return {
            requestId: document.getElementById('edit-request-id').value,
            draftId: document.getElementById('edit-draft-id').value,
            username: getCurrentUser()?.username,
            docDate: document.getElementById('edit-doc-date').value,
            requesterName: document.getElementById('edit-requester-name').value.trim(),
            requesterPosition: document.getElementById('edit-requester-position').value.trim(),
            location: document.getElementById('edit-location').value.trim(),
            purpose: document.getElementById('edit-purpose').value.trim(),
            startDate: document.getElementById('edit-start-date').value,
            endDate: document.getElementById('edit-end-date').value,
            attendees: attendees,
            expenseOption: document.querySelector('input[name="edit-expense_option"]:checked')?.value || 'no',
            expenseItems: expenseItems,
            totalExpense: document.getElementById('edit-total-expense').value || 0,
            
            vehicleOption: document.querySelector('input[name="edit-vehicle_option"]:checked')?.value || 'gov',
            licensePlate: document.getElementById('edit-license-plate').value.trim(),
            publicVehicleDetails: document.getElementById('edit-public-vehicle-details').value.trim(),
            
            department: document.getElementById('edit-department').value,
            headName: document.getElementById('edit-head-name').value,
            isEdit: true
        };
    } catch (error) { 
        console.error(error);
        return null; 
    }
}

function validateEditForm(formData) {
    if (!formData || !formData.docDate || !formData.requesterName || !formData.location || !formData.purpose) {
        showAlert("ข้อมูลไม่ครบถ้วน", "กรุณากรอกข้อมูลที่จำเป็นให้ครบ"); return false;
    }
    return true;
}

// --- PART 5: PUBLIC & UTILS ---

// โหลดข้อมูล Public Dashboard (หน้า Login)
async function loadPublicWeeklyData() {
    const table = document.getElementById('public-weekly-list');
    const label = document.getElementById('current-week-display');
    if(!table) return;

    try {
        // เรียก API ใหม่ (getPublicWeeklyData)
        const res = await apiCall('GET', 'getPublicWeeklyData'); 
        
        if (res.status === 'success' && res.data) {
            if(label && res.data.weekRange) label.textContent = res.data.weekRange;
            renderPublicTable(res.data.requests || []);
        } else {
            table.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">ไม่พบข้อมูลในสัปดาห์นี้</td></tr>`;
        }
    } catch (e) { 
        console.error(e);
        table.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-400">ไม่สามารถโหลดข้อมูลได้</td></tr>`; 
    }
}

function renderPublicTable(requests) {
    const tbody = document.getElementById('public-weekly-list');
    if(!requests || requests.length === 0) { 
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">ไม่มีรายการไปราชการในสัปดาห์นี้</td></tr>`; 
        return; 
    }
    
    tbody.innerHTML = requests.map(req => `
        <tr class="border-b hover:bg-gray-50 transition">
            <td class="px-6 py-4">
                <span class="bg-blue-50 text-blue-700 px-2 py-1 rounded text-sm font-semibold">${formatDisplayDate(req.startDate)}</span>
            </td>
            <td class="px-6 py-4 font-bold text-gray-700">${escapeHtml(req.requesterName)}</td>
            <td class="px-6 py-4 text-gray-600">
                <div class="font-medium">${escapeHtml(req.purpose)}</div>
                <div class="text-xs text-gray-400 mt-1">📍 ${escapeHtml(req.location)}</div>
            </td>
            <td class="px-6 py-4 text-center">
                ${req.commandUrl ? 
                    `<a href="${req.commandUrl}" target="_blank" class="inline-flex items-center gap-1 bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold hover:bg-green-200 transition">
                        📄 ดูคำสั่ง
                    </a>` 
                : '<span class="text-gray-300">-</span>'}
            </td>
        </tr>`).join('');
}

// Notification Placeholder (ป้องกัน Error ถ้ายังไม่ได้ implement)
function updateNotifications(requests, memos) {
    // Implement Notification Logic Here if needed
}

// Modal Memo Submit Handler
async function handleMemoSubmitFromModal(e) {
    e.preventDefault();
    const requestId = document.getElementById('memo-modal-request-id').value;
    const memoType = document.querySelector('input[name="modal_memo_type"]:checked')?.value;
    const fileInput = document.getElementById('modal-memo-file');
    const file = fileInput?.files[0];

    if (!requestId) return showAlert('ผิดพลาด', 'ไม่พบ Request ID');
    
    // ถ้าเบิกเงิน ต้องมีไฟล์ (หรือแล้วแต่ Logic)
    // แต่ถ้าไม่เบิกเงิน ต้องมีไฟล์แน่ๆ
    if (memoType === 'non_reimburse' && !file) {
        return showAlert('แจ้งเตือน', 'กรุณาแนบไฟล์บันทึกข้อความ');
    }

    toggleLoader('send-memo-submit-button', true);
    try {
        let fileObj = null;
        if(file) fileObj = await fileToObject(file);

        const res = await apiCall('POST', 'submitSignedMemo', {
            requestId: requestId,
            memoType: memoType,
            username: getCurrentUser().username,
            file: fileObj
        });

        if(res.status === 'success') {
            showAlert('สำเร็จ', 'ส่งบันทึกข้อความเรียบร้อย');
            document.getElementById('send-memo-modal').style.display = 'none';
            await fetchUserRequests();
        } else {
            throw new Error(res.message);
        }
    } catch(err) {
        showAlert('ผิดพลาด', err.message);
    } finally {
        toggleLoader('send-memo-submit-button', false);
    }
}
