// --- ADMIN FUNCTIONS ---

// ตรวจสอบสิทธิ์ Admin (Client-side check)
function checkAdminAccess() {
    const user = getCurrentUser();
    if (!user || user.role !== 'admin') {
        showAlert('ผิดพลาด', 'คุณไม่มีสิทธิ์เข้าถึงหน้านี้');
        return false;
    }
    return true;
}

// --- FETCH DATA ---

async function fetchAllRequestsForCommand() {
    try {
        if (!checkAdminAccess()) return;
        const yearSelect = document.getElementById('admin-year-select');
        const selectedYear = yearSelect ? parseInt(yearSelect.value) : (new Date().getFullYear() + 543);
        const currentYear = new Date().getFullYear() + 543;
        const isHistoryMode = selectedYear !== currentYear;

        const listContainer = document.getElementById('admin-requests-list');
        listContainer.innerHTML = '<div class="text-center p-8"><div class="loader mx-auto"></div><p class="mt-4">กำลังโหลดข้อมูล...</p></div>';

        let requests = [];
        if (isHistoryMode) {
            const result = await apiCall('GET', 'getRequestsByYear', { year: selectedYear, username: 'ADMIN_ALL' });
            if (result.status === 'success') requests = result.data || [];
        } else {
            const result = await apiCall('GET', 'getAllRequests');
            if (result.status === 'success') requests = result.data || [];
        }

        requests.sort((a, b) => {
            const timeA = new Date(a.timestamp || a.docDate || 0).getTime();
            const timeB = new Date(b.timestamp || b.docDate || 0).getTime();
            return timeB - timeA;
        });

        renderAdminRequestsList(requests);
    } catch (error) { 
        console.error(error);
        showAlert('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลคำขอได้'); 
    }
}

async function fetchAllMemos() {
    try {
        if (!checkAdminAccess()) return;
        const result = await apiCall('GET', 'getAllMemos');
        if (result.status === 'success') {
            let memos = result.data || [];
            memos.sort((a, b) => (new Date(b.timestamp || 0) - new Date(a.timestamp || 0)));
            renderAdminMemosList(memos);
        }
    } catch (error) { showAlert('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลบันทึกข้อความได้'); }
}

async function fetchAllUsers() {
    try {
        if (!checkAdminAccess()) return;
        const result = await apiCall('GET', 'getAllUsers');
        if (result.status === 'success') { 
            allUsersCache = result.data; 
            renderUsersList(allUsersCache); 
        }
    } catch (error) { showAlert('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลผู้ใช้ได้'); }
}

// --- HELPER FUNCTIONS ---

function getThaiMonth(dateStr) {
    if (!dateStr) return '.......';
    const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const d = new Date(dateStr);
    return months[d.getMonth()];
}

function getThaiYear(dateStr) {
    if (!dateStr) return '.......';
    const d = new Date(dateStr);
    return (d.getFullYear() + 543).toString();
}

// --- GENERATE COMMAND FUNCTIONS ---

async function handleAdminGenerateCommand() {
    const requestId = document.getElementById('admin-command-request-id').value;
    const commandType = document.querySelector('input[name="admin-command-type"]:checked')?.value;
    if (!commandType) { showAlert('ผิดพลาด', 'กรุณาเลือกรูปแบบคำสั่ง'); return; }
    
    const attendees = [];
    document.querySelectorAll('#admin-command-attendees-list > div').forEach(div => {
        const name = div.querySelector('.admin-att-name').value.trim();
        const pos = div.querySelector('.admin-att-pos').value.trim();
        if (name) attendees.push({ name, position: pos });
    });
    
    const requestData = {
        doctype: 'command', templateType: commandType, requestId: requestId, id: requestId,
        docDate: document.getElementById('admin-command-doc-date').value,
        requesterName: document.getElementById('admin-command-requester-name').value.trim(), 
        requesterPosition: document.getElementById('admin-command-requester-position').value.trim(),
        location: document.getElementById('admin-command-location').value.trim(), 
        purpose: document.getElementById('admin-command-purpose').value.trim(),
        startDate: document.getElementById('admin-command-start-date').value, 
        endDate: document.getElementById('admin-command-end-date').value,
        attendees: attendees,
        expenseOption: document.getElementById('admin-expense-option').value,
        expenseItems: document.getElementById('admin-expense-items').value, 
        totalExpense: document.getElementById('admin-total-expense').value,
        vehicleOption: document.getElementById('admin-vehicle-option').value, 
        licensePlate: document.getElementById('admin-license-plate').value,
        createdby: getCurrentUser()?.username || 'admin'
    };
    
    toggleLoader('admin-generate-command-button', true);
    try {
        const { pdfBlob, docxBlob } = await generateOfficialPDF(requestData);
        window.open(URL.createObjectURL(pdfBlob), '_blank');
        
        const pdfBase64 = await blobToBase64(pdfBlob);
        const docBase64 = await blobToBase64(docxBlob);
        
        const pdfUpload = await apiCall('POST', 'uploadGeneratedFile', {
            data: pdfBase64, filename: `คำสั่ง_${requestId.replace(/\//g,'-')}.pdf`,
            mimeType: 'application/pdf', username: requestData.createdby
        });

        const docUpload = await apiCall('POST', 'uploadGeneratedFile', {
            data: docBase64, filename: `คำสั่ง_${requestId.replace(/\//g,'-')}.docx`,
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', username: requestData.createdby
        });

        if (pdfUpload.status === 'success') {
            requestData.preGeneratedPdfUrl = pdfUpload.url;
            requestData.preGeneratedDocUrl = docUpload.url;
            await apiCall('POST', 'approveCommand', requestData);
            
            const safeId = requestId.replace(/[\/\\:\.]/g, '-');
            if (typeof db !== 'undefined') {
                await db.collection('requests').doc(safeId).set({
                    commandStatus: 'เสร็จสิ้น', commandPdfUrl: pdfUpload.url,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
            showAlert('สำเร็จ', 'บันทึกข้อมูลเรียบร้อยแล้ว');
            await fetchAllRequestsForCommand();
        }
    } catch (error) {
        console.error(error);
        showAlert('แจ้งเตือน', 'การบันทึกขัดข้อง: ' + error.message);
    } finally {
        toggleLoader('admin-generate-command-button', false);
    }
}

// --- RENDER FUNCTIONS ---

// --- แก้ไขในไฟล์ js/admin.js ---

function renderAdminRequestsList(requests) {
    const container = document.getElementById('admin-requests-list');
    
    if (!requests || requests.length === 0) { 
        container.innerHTML = `
            <div class="text-center py-10">
                <p class="text-gray-400 text-lg">ไม่พบคำขอไปราชการ</p>
                <p class="text-gray-300 text-sm">รายการคำขอใหม่จะปรากฏที่นี่</p>
            </div>`; 
        return; 
    }
    
    container.innerHTML = requests.map(request => {
        // 1. จัดการรายชื่อและนับจำนวนคน
        let attendeesList = [];
        try {
            attendeesList = typeof request.attendees === 'string' ? JSON.parse(request.attendees) : (request.attendees || []);
        } catch(e) { attendeesList = []; }

        const reqName = (request.requesterName || "").trim();
        const hasRequesterInList = attendeesList.some(att => (att.name || "").trim() === reqName);
        const totalPeople = (attendeesList.length > 0) ? (hasRequesterInList ? attendeesList.length : attendeesList.length + 1) : (request.attendeeCount ? parseInt(request.attendeeCount) + 1 : 1);
        
        let peopleCategory = totalPeople === 1 ? "คำสั่งเดี่ยว" : (totalPeople <= 5 ? "คำสั่งกลุ่มเล็ก" : "คำสั่งกลุ่มใหญ่");
        
        const safeId = escapeHtml(request.id);
        const safeName = escapeHtml(request.requesterName);
        const safePurpose = escapeHtml(request.purpose);
        const safeLocation = escapeHtml(request.location);
        const safeDate = `${formatDisplayDate(request.startDate)} - ${formatDisplayDate(request.endDate)}`;

        // 2. ตรรกะปุ่ม Action (เพิ่มปุ่มหนังสือส่ง)
        let commandActionButtons = '';
        
        // ตรวจสอบว่ามีหนังสือส่งหรือยัง (รองรับทั้งชื่อตัวแปรเก่าและใหม่)
        const dispatchUrl = request.dispatchBookUrl || request.dispatchBookPdfUrl;
        
        if (request.commandPdfUrl) {
            // กรณีออกคำสั่งแล้ว -> แสดงปุ่ม [ดูคำสั่ง] [หนังสือส่ง] [แก้ไข]
            commandActionButtons = `
                <div class="flex flex-wrap gap-2 justify-end mt-2 md:mt-0">
                    <a href="${request.commandPdfUrl}" target="_blank" class="btn bg-blue-600 hover:bg-blue-700 text-white btn-sm flex items-center gap-1 shadow-sm px-3">
                        📄 ดูคำสั่ง
                    </a>
                    
                    ${dispatchUrl ? `
                        <a href="${dispatchUrl}" target="_blank" class="btn bg-purple-600 hover:bg-purple-700 text-white btn-sm flex items-center gap-1 shadow-sm px-3">
                            📦 ดูหนังสือส่ง
                        </a>
                    ` : `
                        <button onclick="openDispatchModal('${safeId}')" class="btn bg-purple-500 hover:bg-purple-600 text-white btn-sm flex items-center gap-1 shadow-sm px-3">
                            📦 ออกหนังสือส่ง
                        </button>
                    `}

                    <button onclick="openAdminGenerateCommand('${safeId}')" class="btn bg-yellow-500 hover:bg-yellow-600 text-white btn-sm flex items-center gap-1 shadow-sm px-3">
                        ✏️ แก้ไข/ออกใหม่
                    </button>
                </div>
            `;
        } else {
            // กรณีรอยังไม่ได้ออกคำสั่ง -> แสดงปุ่ม [ออกคำสั่ง]
            commandActionButtons = `
                <button onclick="openAdminGenerateCommand('${safeId}')" class="btn bg-green-500 hover:bg-green-600 text-white btn-sm shadow-sm w-full md:w-auto">
                    ✅ ออกคำสั่ง (${peopleCategory})
                </button>
            `;
        }

        return `
        <div class="border rounded-xl p-5 bg-white shadow-sm hover:shadow-md transition duration-200 mb-4 border-l-4 ${request.commandPdfUrl ? 'border-l-green-500' : 'border-l-yellow-400'}">
            <div class="flex flex-col md:flex-row justify-between items-start gap-4">
                <div class="flex-1 min-w-[250px]">
                    <div class="flex items-center gap-2 mb-1">
                        <h4 class="font-bold text-indigo-700 text-lg">${safeId}</h4>
                        <span class="text-xs px-2 py-0.5 rounded-full ${request.commandPdfUrl ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}">
                            ${request.commandPdfUrl ? 'ออกคำสั่งแล้ว' : 'รอออกคำสั่ง'}
                        </span>
                        ${dispatchUrl ? `<span class="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">มีหนังสือส่ง</span>` : ''}
                    </div>
                    <p class="text-gray-800 font-bold text-md mb-1">${safeName}</p>
                    <p class="text-gray-600 text-sm mb-2 line-clamp-2">${safePurpose}</p>
                    <div class="flex flex-wrap items-center gap-2 text-sm text-gray-500 bg-gray-50 p-2 rounded-lg">
                        <div class="flex items-center gap-1">📍 ${safeLocation}</div>
                        <div class="border-l border-gray-300 pl-2 ml-1 flex items-center gap-1">📅 ${safeDate}</div>
                    </div>
                    <p class="text-xs text-gray-400 mt-2">
                        จำนวนผู้ไปราชการรวมทั้งหมด: ${totalPeople} คน
                    </p>
                </div>
                
                <div class="flex flex-col gap-2 w-full md:w-auto items-end">
                    <div class="flex gap-2">
                         ${request.pdfUrl ? `<a href="${request.pdfUrl}" target="_blank" class="text-xs text-indigo-500 hover:text-indigo-700 underline flex items-center gap-1">📎 ดูบันทึกข้อความต้นเรื่อง</a>` : ''}
                         <button onclick="deleteRequestByAdmin('${safeId}')" class="text-xs text-red-500 hover:text-red-700 underline flex items-center gap-1">🗑️ ลบรายการ</button>
                    </div>
                    ${commandActionButtons}
                </div>
            </div>
        </div>`;
    }).join('');
}

// --- แก้ไขในไฟล์ js/admin.js ---


async function handleDispatchFormSubmit(e) {
    e.preventDefault();
    const requestId = document.getElementById('dispatch-request-id').value;
    
    // เริ่มแสดง Loader ที่ปุ่มบันทึก
    toggleLoader('dispatch-submit-button', true);

    try {
        // --- 1. รวบรวมข้อมูลจากฟอร์ม (ดึงค่าล่าสุดที่แอดมินตรวจสอบ/แก้ไขแล้ว) ---
        const requestData = {
            doctype: 'dispatch',
            id: requestId,
            
            // ส่วนหัวหนังสือ
            dispatchMonth: document.getElementById('dispatch-month').value,
            dispatchYear: document.getElementById('dispatch-year').value,
            
            // จำนวนคน (ดึงจากช่องที่ระบบนับให้ หรือแอดมินแก้เอง)
            studentCount: document.getElementById('student-count').value,
            teacherCount: document.getElementById('teacher-count').value,
            
            // เนื้อหาและสถานที่
            purpose: document.getElementById('dispatch-purpose').value.trim(),
            location: document.getElementById('dispatch-location').value.trim(),
            stayAt: document.getElementById('dispatch-stay-at').value.trim(), // ที่พัก (ถ้าไม่มีจะเป็นค่าว่าง หรือ -)
            
            // วันเวลาเดินทาง
            dateStart: document.getElementById('dispatch-date-start').value,
            timeStart: document.getElementById('dispatch-time-start').value,
            dateEnd: document.getElementById('dispatch-date-end').value,
            timeEnd: document.getElementById('dispatch-time-end').value,
            
            // ยานพาหนะ
            vehicleType: document.getElementById('dispatch-vehicle-type').value,
            vehicleId: document.getElementById('dispatch-vehicle-id').value,

            // *** สิ่งที่ส่งมาด้วย 1-7 (ดึงจาก Input ที่แอดมินกรอกจำนวนเอง) ***
            qty1: document.getElementById('qty1').value, // หนังสือเชิญ
            qty2: document.getElementById('qty2').value, // คำสั่งโรงเรียน
            qty3: document.getElementById('qty3').value, // รายชื่อนักเรียน
            qty4: document.getElementById('qty4').value, // แผนที่
            qty5: document.getElementById('qty5').value, // ขออนุญาตผู้ปกครอง
            qty6: document.getElementById('qty6').value, // กรมธรรม์
            qty7: document.getElementById('qty7').value, // กำหนดการ

            // Map qty2 ไปเป็น commandCount ด้วย เผื่อ Logic เก่าๆ ยังเรียกใช้
            commandCount: document.getElementById('qty2').value,

            createdby: getCurrentUser() ? getCurrentUser().username : 'admin'
        };
        
        console.log("🚀 Generating Dispatch PDF...", requestData);
        
        // --- 2. ส่งข้อมูลไปสร้าง PDF ---
        const { pdfBlob } = await generateOfficialPDF(requestData);
        
        // --- 3. Preview ไฟล์ทันที ---
        const tempPdfUrl = URL.createObjectURL(pdfBlob);
        window.open(tempPdfUrl, '_blank');
        
        // --- 4. UI Feedback: แสดงข้อความกำลังบันทึก ---
        const modalBody = document.querySelector('#dispatch-modal .modal-content'); 
        if(modalBody) {
            let msg = document.getElementById('dispatch-saving-msg');
            if(!msg) {
                msg = document.createElement('div');
                msg.id = 'dispatch-saving-msg';
                msg.className = 'text-center text-blue-600 font-bold mt-2 animate-pulse';
                msg.innerHTML = '<i class="fas fa-cloud-upload-alt"></i> กำลังบันทึกไฟล์ลงระบบ...';
                
                // แทรกไว้ก่อนปุ่มกด
                const btnContainer = document.querySelector('#dispatch-modal .flex.justify-end');
                if(btnContainer) btnContainer.before(msg);
                else modalBody.appendChild(msg);
            }
        }

        // --- 5. Upload ไฟล์ขึ้น Cloud ---
        const pdfBase64 = await blobToBase64(pdfBlob);
        
        const uploadResult = await apiCall('POST', 'uploadGeneratedFile', {
            data: pdfBase64,
            filename: `หนังสือส่ง_${requestId.replace(/[\/\\:\.]/g, '-')}.pdf`,
            mimeType: 'application/pdf',
            username: requestData.createdby
        });
        
        if (uploadResult.status !== 'success') throw new Error("Upload failed: " + uploadResult.message);
        const permanentPdfUrl = uploadResult.url;

        // --- 6. อัปเดตฐานข้อมูล (GAS + Firebase) ---
        
        // อัปเดต GAS (Google Sheets)
        // --- แก้ไข: ส่งข้อมูลให้ครบถ้วนเพื่อป้องกัน Error ---
requestData.dispatchBookPdfUrl = permanentPdfUrl; // เพิ่ม URL เข้าไปในก้อนข้อมูลเดิม
requestData.dispatchBookUrl = permanentPdfUrl;    // (เผื่อไว้ทั้ง 2 key)

// ใส่ flag หลอกระบบว่าไม่ต้อง Gen PDF หลักซ้ำ (ถ้าทำได้) หรือส่งข้อมูลครบเพื่อให้ Gen ผ่าน
requestData.preGeneratedPdfUrl = "SKIP_GENERATION"; // หรือใส่ URL เดิมถ้ามี

await apiCall('POST', 'updateRequest', requestData);

        // อัปเดต Firebase Firestore
        const safeId = requestId.replace(/[\/\\:\.]/g, '-');
        if (typeof db !== 'undefined') {
             try {
                await db.collection('requests').doc(safeId).set({
                    dispatchBookPdfUrl: permanentPdfUrl,
                    dispatchBookUrl: permanentPdfUrl,
                    // บันทึกข้อมูล Meta Data สำคัญเก็บไว้ด้วย เผื่อดึงกลับมาดู
                    dispatchMeta: {
                        studentCount: requestData.studentCount,
                        teacherCount: requestData.teacherCount,
                        stayAt: requestData.stayAt,
                        generatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    }
                }, { merge: true });
             } catch (e) { console.warn("Firebase update error", e); }
        }

        // --- 7. เสร็จสิ้น: ล้างสถานะและปิดหน้าต่าง ---
        
        // ล้างข้อความแจ้งเตือน
        const msg = document.getElementById('dispatch-saving-msg');
        if(msg) msg.remove();

        // ปิด Modal และ Refresh รายการ
        document.getElementById('dispatch-modal').style.display = 'none';
        document.getElementById('dispatch-form').reset(); // ล้างฟอร์มรอรอบหน้า
        
        showAlert('สำเร็จ', 'บันทึกหนังสือส่งเรียบร้อยแล้ว');
        
        // โหลดรายการใหม่เพื่อให้เห็นสถานะล่าสุด
        await fetchAllRequestsForCommand();

    } catch (error) {
        console.error(error);
        showAlert('แจ้งเตือน', 'เกิดข้อผิดพลาด: ' + error.message);
        
        // ล้างข้อความแจ้งเตือนกรณี error
        const msg = document.getElementById('dispatch-saving-msg');
        if(msg) msg.remove();
        
    } finally {
        toggleLoader('dispatch-submit-button', false);
    }
}
// ฟังก์ชันสร้างบันทึกข้อความแบบ Admin (ที่เคยหายไป)
async function handleAdminGenerateMemo() {
    const requestId = document.getElementById('admin-memo-request-id')?.value || document.getElementById('admin-command-request-id')?.value;
    if (!requestId) { showAlert('ผิดพลาด', 'ไม่พบรหัสคำขอ'); return; }

    const requestData = {
        doctype: 'memo',
        id: requestId,
        docDate: document.getElementById('admin-memo-doc-date')?.value || new Date().toISOString().split('T')[0],
        requesterName: document.getElementById('admin-memo-requester-name')?.value.trim(),
        requesterPosition: document.getElementById('admin-memo-requester-position')?.value.trim(),
        department: document.getElementById('admin-memo-department')?.value.trim(), 
        headName: document.getElementById('admin-memo-head-name')?.value.trim(),   
        location: document.getElementById('admin-memo-location')?.value.trim(),
        purpose: document.getElementById('admin-memo-purpose')?.value.trim(),
        startDate: document.getElementById('admin-memo-start-date')?.value,
        endDate: document.getElementById('admin-memo-end-date')?.value,
        vehicleOption: document.getElementById('admin-memo-vehicle-option')?.value || 'gov', 
        licensePlate: document.getElementById('admin-memo-license-plate')?.value || '',
        expenseOption: document.getElementById('admin-memo-expense-option')?.value || 'no',
        expenseItems: document.getElementById('admin-memo-expense-items')?.value || [], 
        totalExpense: document.getElementById('admin-memo-total-expense')?.value || '0',
        createdby: getCurrentUser() ? getCurrentUser().username : 'admin'
    };
    
    const attendees = [];
    const attendeeList = document.querySelectorAll('#admin-memo-attendees-list > div');
    if (attendeeList.length > 0) {
        attendeeList.forEach(div => {
            const name = div.querySelector('.admin-att-name').value.trim();
            const pos = div.querySelector('.admin-att-pos').value.trim();
            if (name) attendees.push({ name, position: pos });
        });
    }
    requestData.attendees = attendees;

    const btnId = 'admin-generate-memo-button';
    toggleLoader(btnId, true);

    try {
        console.log("🚀 Generating Memo via Cloud Run...");
        const { pdfBlob } = await generateOfficialPDF(requestData);

        const tempPdfUrl = URL.createObjectURL(pdfBlob);
        window.open(tempPdfUrl, '_blank');

        const statusDiv = document.getElementById('admin-memo-result');
        if(statusDiv) {
            statusDiv.innerHTML = `<div class="text-blue-600 font-bold animate-pulse">📄 เปิดเอกสารแล้ว... กำลังบันทึกลงระบบ...</div>`;
            statusDiv.classList.remove('hidden');
        }

        const pdfBase64 = await blobToBase64(pdfBlob);
        const uploadResult = await apiCall('POST', 'uploadGeneratedFile', {
            data: pdfBase64,
            filename: `บันทึกข้อความ_${requestId.replace(/\//g,'-')}.pdf`,
            mimeType: 'application/pdf',
            username: requestData.createdby
        });

        if (uploadResult.status !== 'success') throw new Error("Upload failed");
        const permanentPdfUrl = uploadResult.url;

        const safeId = requestId.replace(/[\/\\:\.]/g, '-');
        if (typeof db !== 'undefined') {
            try {
                await db.collection('requests').doc(safeId).set({
                    memoPdfUrl: permanentPdfUrl,
                    memoStatus: 'สร้างแล้ว',
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            } catch (e) { console.warn("Firestore update error:", e); }
        }

        showAlert('สำเร็จ', 'บันทึกข้อความถูกสร้างเรียบร้อยแล้ว');
        if(statusDiv) {
            statusDiv.innerHTML = `
                <div class="text-green-600 font-bold mb-2">✅ บันทึกเรียบร้อย</div>
                <a href="${permanentPdfUrl}" target="_blank" class="text-blue-500 underline">เปิดไฟล์จาก Google Drive</a>
            `;
        }
        if (typeof fetchAllRequestsForCommand === 'function') await fetchAllRequestsForCommand();

    } catch (error) {
        console.error(error);
        showAlert('แจ้งเตือน', 'เปิดไฟล์ได้ แต่การบันทึกขัดข้อง: ' + error.message);
    } finally {
        toggleLoader(btnId, false);
    }
}

/**
 * ฟังก์ชันสร้างเอกสาร PDF (ฉบับสมบูรณ์: แก้ไข doc_number และ undefined)
 */
async function generateOfficialPDF(requestData) {
    // 1. กำหนดปุ่มสำหรับแสดง Loader ตามประเภทเอกสาร
    let btnId = 'generate-document-button'; 
    if (requestData.doctype === 'dispatch') btnId = 'dispatch-submit-button';
    if (requestData.doctype === 'command') btnId = 'admin-generate-command-button';
    if (requestData.doctype === 'memo') btnId = 'admin-generate-memo-button';
    if (requestData.btnId) btnId = requestData.btnId;
    
    toggleLoader(btnId, true);

    try {
        const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
        
        // Helper: แปลงตัวเลขเป็นเลขไทย (ป้องกันค่า null/undefined)
        const toThaiNum = (num) => {
            if (num === null || num === undefined || num === "") return "";
            return num.toString().replace(/\d/g, d => "๐๑๒๓๔๕๖๗๘๙"[d]);
        };

        // Helper: จัดรูปแบบวันที่แบบไทย (สำหรับใช้ในหนังสือส่ง)
        const formatDateThai = (dateStr) => {
            if (!dateStr) return ".....";
            const d = new Date(dateStr);
            return `${toThaiNum(d.getDate())} ${thaiMonths[d.getMonth()]} ${toThaiNum(d.getFullYear() + 543)}`;
        };

        // --- ส่วนจัดการวันที่ (Common Logic) ---
        // ใช้สำหรับเอกสารทั่วไป (คำสั่ง/บันทึกข้อความ)
        const docDateObj = requestData.docDate ? new Date(requestData.docDate) : new Date();
        const docDay = docDateObj.getDate();
        const docMonth = thaiMonths[docDateObj.getMonth()];
        const docYear = docDateObj.getFullYear() + 543;
        const fullDocDate = `${toThaiNum(docDay)} ${docMonth} ${toThaiNum(docYear)}`; 

        // --- ส่วนจัดการช่วงเวลาเดินทาง (Duration calculation) ---
        let dateRangeStr = "", startDateStr = "", endDateStr = "", durationStr = "0";
        // รองรับทั้งคีย์ startDate (คำสั่ง) และ dateStart (หนังสือส่ง)
        const rawStartDate = requestData.startDate || requestData.dateStart;
        const rawEndDate = requestData.endDate || requestData.dateEnd;

        if (rawStartDate) {
            const start = new Date(rawStartDate);
            startDateStr = formatDateThai(rawStartDate); // ใช้ Helper
            
            if (rawEndDate) {
                const end = new Date(rawEndDate);
                endDateStr = formatDateThai(rawEndDate);
                const diffTime = Math.abs(end - start);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 
                durationStr = diffDays.toString();

                // สร้างข้อความช่วงเวลา (เช่น ระหว่างวันที่ ... ถึง ...)
                if (rawStartDate === rawEndDate) {
                    dateRangeStr = `ในวันที่ ${toThaiNum(start.getDate())} ${thaiMonths[start.getMonth()]} พ.ศ. ${toThaiNum(start.getFullYear() + 543)}`;
                } else if (start.getMonth() === end.getMonth()) {
                    dateRangeStr = `ระหว่างวันที่ ${toThaiNum(start.getDate())} - ${toThaiNum(end.getDate())} ${thaiMonths[start.getMonth()]} พ.ศ. ${toThaiNum(start.getFullYear() + 543)}`;
                } else {
                    dateRangeStr = `ระหว่างวันที่ ${toThaiNum(start.getDate())} ${thaiMonths[start.getMonth()]} - ${toThaiNum(end.getDate())} ${thaiMonths[end.getMonth()]} พ.ศ. ${toThaiNum(start.getFullYear() + 543)}`;
                }
            } else {
                 dateRangeStr = `ในวันที่ ${toThaiNum(start.getDate())} ${thaiMonths[start.getMonth()]} พ.ศ. ${toThaiNum(start.getFullYear() + 543)}`;
                 endDateStr = startDateStr;
                 durationStr = "1";
            }
        }

        // --- ส่วนจัดการรายชื่อผู้ร่วมเดินทาง (Attendees) ---
        const requesterName = (requestData.requesterName || "").trim().replace(/\s+/g, ' ');
        let mergedAttendees = [];
        // ถ้ามีชื่อผู้ขอ ใส่เป็นคนแรก
        if (requesterName) mergedAttendees.push({ name: requesterName, position: requestData.requesterPosition });
        
        if (requestData.attendees && Array.isArray(requestData.attendees)) {
            requestData.attendees.forEach(att => {
                const attName = (att.name || "").trim().replace(/\s+/g, ' ');
                if (attName && attName !== requesterName) {
                    mergedAttendees.push({ name: attName, position: att.position || "" });
                }
            });
        }
        const attendeesWithIndex = mergedAttendees.map((att, index) => ({ i: toThaiNum(index + 1), name: att.name, position: att.position }));
        const totalCount = mergedAttendees.length.toString();

        // --- ส่วนจัดการค่าใช้จ่าย (Expense) ---
        let expense_no = "", expense_partial = "", totalExpenseStr = "";
        let expense_allowance = "", expense_food = "", expense_accommodation = "", expense_transport = "", expense_fuel = "";
        let expense_other_check = "", expense_other_text = ""; 

        if (requestData.expenseOption === 'no' || requestData.expenseOption === 'ไม่ขอเบิก') {
            expense_no = "/"; 
        } else {
            expense_partial = "/";
            let itemsStr = "";
            
            if (Array.isArray(requestData.expenseItems)) {
                itemsStr = JSON.stringify(requestData.expenseItems);
                const otherItem = requestData.expenseItems.find(item => item.name === 'ค่าใช้จ่ายอื่นๆ' || item.name === 'other');
                if (otherItem) {
                    expense_other_check = "/";
                    expense_other_text = otherItem.detail || ""; 
                }
            } else if (typeof requestData.expenseItems === 'string') {
                itemsStr = requestData.expenseItems;
            }

            if (itemsStr.includes('allowance') || itemsStr.includes('เบี้ยเลี้ยง')) expense_allowance = "/";
            if (itemsStr.includes('food') || itemsStr.includes('อาหาร')) expense_food = "/";
            if (itemsStr.includes('accommodation') || itemsStr.includes('ที่พัก')) expense_accommodation = "/";
            if (itemsStr.includes('transport') || itemsStr.includes('พาหนะ')) expense_transport = "/";
            if (itemsStr.includes('fuel') || itemsStr.includes('น้ำมัน')) expense_fuel = "/";

            totalExpenseStr = requestData.totalExpense ? toThaiNum(parseFloat(requestData.totalExpense).toLocaleString('th-TH', {minimumFractionDigits: 2})) : toThaiNum("0");
        }
        
        // --- ส่วนจัดการพาหนะ (Vehicle) ---
        let vehicle_gov = "", vehicle_private = "", vehicle_public = "";
        let license_plate = "", other_detail = "";
        
        if (requestData.vehicleOption === 'gov') { vehicle_gov = "/"; }
        else if (requestData.vehicleOption === 'private') { 
            vehicle_private = "/"; 
            license_plate = toThaiNum(requestData.licensePlate || ""); 
        } else { 
            vehicle_public = "/"; 
            other_detail = toThaiNum(requestData.licensePlate || requestData.publicVehicleDetails || ""); 
        }

        // --- ส่วนจัดการเลขที่เอกสาร (Doc ID) ---
        let rawId = requestData.id || requestData.requestId || "";
        let docNumberRaw = ".....";
        if (rawId) {
            if (rawId.includes('/')) docNumberRaw = rawId.split('/')[0];
            else docNumberRaw = rawId;
            docNumberRaw = docNumberRaw.replace(/บค/gi, '').trim();
        }

        // --- 2. เลือกไฟล์แม่แบบ (Template Selection) ---
        let templateFilename = '';
        if (requestData.doctype === 'dispatch') {
            templateFilename = 'แม่แบบหนังสือส่งใหม่.docx'; // ★ Template ใหม่
        } else if (requestData.doctype === 'memo') {
            templateFilename = 'template_memo.docx';
        } else {
            // Default: Command (คำสั่ง)
            switch (requestData.templateType) {
                case 'groupSmall': templateFilename = 'template_command_small.docx'; break;
                case 'groupLarge': templateFilename = 'template_command_large.docx'; break;
                default: templateFilename = 'template_command_solo.docx'; break;
            }
        }

        // --- 3. โหลดและเตรียมข้อมูล (Render Data) ---
        const response = await fetch(`./${templateFilename}`); // โหลดจากโฟลเดอร์เดียวกัน
        if (!response.ok) throw new Error(`ไม่พบไฟล์แม่แบบ "${templateFilename}"`);
        const content = await response.arrayBuffer();

        const zip = new PizZip(content);
        const doc = new window.docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

        // เตรียมข้อมูลพื้นฐาน (Common Fields)
        let renderData = {
            id: toThaiNum(rawId || "......."), 
            doc_number: toThaiNum(docNumberRaw),
            
            // วันที่เอกสาร
            dd: toThaiNum(docDay), MMMM: docMonth, YYYY: toThaiNum(docYear),
            doc_date: fullDocDate, 
            
            // ช่วงเวลา
            start_date: startDateStr, end_date: endDateStr, duration: toThaiNum(durationStr),
            date_range: dateRangeStr,
            
            // ข้อมูลผู้ขอ
            requesterName, requester_position: requestData.requesterPosition, 
            requesterPosition: requestData.requesterPosition,
            location: toThaiNum(requestData.location || ""), 
            purpose: toThaiNum(requestData.purpose || ""),
            learning_area: requestData.department || "..............", 
            head_name: requestData.headName || "..............",
            
            // ผู้ร่วมเดินทาง
            attendees: attendeesWithIndex, total_count: toThaiNum(totalCount),
            
            // ยานพาหนะ (Checkbox Logic)
            vehicle_gov, vehicle_private, vehicle_public, license_plate, other_detail,
            
            // ค่าใช้จ่าย
            expense_no, expense_partial, 
            expense_allowance, expense_food, expense_accommodation, expense_transport, expense_fuel,
            expense_other_check, expense_other_text: toThaiNum(expense_other_text), 
            expense_total: totalExpenseStr
        };

        // ★★★ เพิ่ม: ข้อมูลเฉพาะสำหรับหนังสือส่ง (Dispatch Specifics) ★★★
        if (requestData.doctype === 'dispatch') {
            Object.assign(renderData, {
                // ส่วนหัว
                dispatch_month: requestData.dispatchMonth || "",
                dispatch_year: toThaiNum(requestData.dispatchYear || ""),
                
                // สิ่งที่ส่งมาด้วย
                qty1: toThaiNum(requestData.qty1 || "๑"),
                qty2: toThaiNum(requestData.qty2 || "๑"),
                qty3: toThaiNum(requestData.qty3 || "๑"),
                qty4: toThaiNum(requestData.qty4 || "๑"),
                qty5: toThaiNum(requestData.qty5 || "๑"),
                qty6: toThaiNum(requestData.qty6 || "๑"),
                qty7: toThaiNum(requestData.qty7 || "๑"),
                
                // เนื้อหาหลัก
                student_count: toThaiNum(requestData.studentCount || "0"),
                teacher_count: toThaiNum(requestData.teacherCount || "0"),
                
                // วันเวลาเดินทาง (ใช้ key: date_start, time_start ตามแม่แบบใหม่)
                date_start: formatDateThai(requestData.dateStart),
                time_start: toThaiNum(requestData.timeStart || ""),
                date_end: formatDateThai(requestData.dateEnd),
                time_end: toThaiNum(requestData.timeEnd || ""),
                
                // ยานพาหนะ (ใช้ข้อความเต็ม ไม่ใช่ Checkbox)
                vehicle_type: requestData.vehicleType || "-",
                vehicle_id: toThaiNum(requestData.vehicleId || "-"),
                
                // ที่พัก (ถ้าว่าง ใส่ขีด)
                stay_at: (requestData.stayAt && requestData.stayAt.trim() !== "") ? requestData.stayAt : "-"
            });
        }

        // กำจัดค่า undefined/null
        Object.keys(renderData).forEach(key => {
            if (renderData[key] === undefined || renderData[key] === null) {
                renderData[key] = ""; 
            }
        });

        // --- 4. Render Template ---
        doc.render(renderData);

        // --- 5. Convert to PDF (Cloud Run) ---
        const docxBlob = doc.getZip().generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        const formData = new FormData();
        formData.append("files", docxBlob, "document.docx");
        
        // ใช้ Config จากไฟล์ config.js ถ้ามี
        const cloudRunBaseUrl = (typeof PDF_ENGINE_CONFIG !== 'undefined') 
            ? PDF_ENGINE_CONFIG.BASE_URL 
            : "https://wny-pdf-engine-660310608742.asia-southeast1.run.app"; // Fallback URL

        const cloudRunResponse = await fetch(`${cloudRunBaseUrl}/forms/libreoffice/convert`, { method: "POST", body: formData });
        
        if (!cloudRunResponse.ok) throw new Error(`Cloud Run Error: ${cloudRunResponse.status}`);
        
        const pdfBlob = await cloudRunResponse.blob();
        return { pdfBlob, docxBlob };

    } catch (error) {
        console.error("PDF Generation Error:", error);
        
        // จัดการ Error ของ Docxtemplater ให้แสดงรายละเอียด
        if (error.properties && error.properties.errors) {
            const errorMessages = error.properties.errors.map(e => e.properties.explanation).join("\n");
            alert(`❌ เกิดข้อผิดพลาดใน Template:\n${errorMessages}`);
        } else {
            alert(`❌ สร้างเอกสารไม่สำเร็จ: ${error.message}`);
        }
        throw error;
    } finally {
        toggleLoader(btnId, false);
    }
}

function renderUsersList(users) {
    const container = document.getElementById('users-content');
    if (!users || users.length === 0) { container.innerHTML = '<p class="text-center text-gray-500">ไม่พบข้อมูลผู้ใช้</p>'; return; }
    container.innerHTML = `<div class="overflow-x-auto"><table class="min-w-full bg-white responsive-table"><thead><tr class="bg-gray-100"><th class="px-4 py-2 text-left">ชื่อผู้ใช้</th><th class="px-4 py-2 text-left">ชื่อ-นามสกุล</th><th class="px-4 py-2 text-left">ตำแหน่ง</th><th class="px-4 py-2 text-left">กลุ่มสาระ/งาน</th><th class="px-4 py-2 text-left">บทบาท</th><th class="px-4 py-2 text-left">การจัดการ</th></tr></thead><tbody>${users.map(user => `<tr class="border-b"><td class="px-4 py-2" data-label="ชื่อผู้ใช้">${escapeHtml(user.username)}</td><td class="px-4 py-2" data-label="ชื่อ-นามสกุล">${escapeHtml(user.fullName)}</td><td class="px-4 py-2" data-label="ตำแหน่ง">${escapeHtml(user.position)}</td><td class="px-4 py-2" data-label="กลุ่มสาระ">${escapeHtml(user.department)}</td><td class="px-4 py-2" data-label="บทบาท">${escapeHtml(user.role)}</td><td class="px-4 py-2" data-label="การจัดการ"><button onclick="deleteUser('${escapeHtml(user.username)}')" class="btn btn-danger btn-sm">ลบ</button></td></tr>`).join('')}</tbody></table></div>`;
}

function renderAdminMemosList(memos) {
    const container = document.getElementById('admin-memos-list');
    if (!memos || memos.length === 0) { 
        container.innerHTML = '<p class="text-center text-gray-500">ไม่พบบันทึกข้อความ</p>'; 
        return; 
    }
    
    container.innerHTML = memos.map(memo => {
        const hasCompletedFiles = memo.completedMemoUrl || memo.completedCommandUrl || memo.dispatchBookUrl;
        const safeId = escapeHtml(memo.id);
        const safeRef = escapeHtml(memo.refNumber);
        const safeUser = escapeHtml(memo.submittedBy);

        return `
        <div class="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition">
            <div class="flex justify-between items-start flex-wrap gap-4">
                <div class="flex-1">
                    <h4 class="font-bold">${safeId}</h4>
                    <p class="text-sm text-gray-600">โดย: ${safeUser} | อ้างอิง: ${safeRef}</p>
                    <p class="text-sm">สถานะ: <span class="font-medium">${translateStatus(memo.status)}</span></p>
                    <div class="mt-2 text-xs text-gray-500">
                        ${memo.completedMemoUrl ? `<div>✓ บันทึกข้อความสมบูรณ์</div>` : ''}
                        ${memo.completedCommandUrl ? `<div>✓ คำสั่งสมบูรณ์</div>` : ''}
                        ${memo.dispatchBookUrl ? `<div>✓ หนังสือส่งสมบูรณ์</div>` : ''}
                    </div>
                </div>
                <div class="flex flex-col gap-2 w-full sm:w-auto items-end">
                    <button onclick="deleteMemoByAdmin('${safeId}')" class="btn bg-red-100 text-red-600 hover:bg-red-200 btn-xs mb-2" title="ลบบันทึกนี้">🗑️ ลบ</button>
                    ${memo.fileURL ? `<a href="${memo.fileURL}" target="_blank" class="btn btn-success btn-sm">ดูไฟล์ต้นทาง</a>` : ''}
                    ${memo.completedMemoUrl ? `<a href="${memo.completedMemoUrl}" target="_blank" class="btn bg-blue-500 text-white btn-sm">ดูบันทึกสมบูรณ์</a>` : ''}
                    ${memo.completedCommandUrl ? `<a href="${memo.completedCommandUrl}" target="_blank" class="btn bg-blue-500 text-white btn-sm">ดูคำสั่งสมบูรณ์</a>` : ''}
                    ${memo.dispatchBookUrl ? `<a href="${memo.dispatchBookUrl}" target="_blank" class="btn bg-purple-500 text-white btn-sm">ดูหนังสือส่ง</a>` : ''}
                    <button onclick="openAdminMemoAction('${safeId}')" class="btn bg-green-500 text-white btn-sm">${hasCompletedFiles ? 'จัดการไฟล์' : 'อัพโหลดไฟล์'}</button>
                </div>
            </div>
        </div>`;
    }).join('');
}

// --- USER MANAGEMENT ---

async function deleteUser(username) {
    if (await showConfirm("ยืนยันการลบ", `คุณแน่ใจหรือไม่ว่าต้องการลบผู้ใช้ ${username}?`)) {
        try { 
            await apiCall('POST', 'deleteUser', { username }); 
            showAlert('สำเร็จ', 'ลบผู้ใช้สำเร็จ'); 
            await fetchAllUsers(); 
        } catch (error) { 
            showAlert('ผิดพลาด', error.message); 
        }
    }
}

function openAddUserModal() { 
    document.getElementById('register-modal').style.display = 'flex'; 
}

function downloadUserTemplate() {
    const ws = XLSX.utils.aoa_to_sheet([['Username', 'Password', 'FullName', 'Position', 'Department', 'Role']]);
    const wb = XLSX.utils.book_new(); 
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'user_template.xlsx');
}

async function handleUserImport(e) {
    const file = e.target.files[0]; 
    if (!file) return;
    try {
        const data = await file.arrayBuffer(); 
        const workbook = XLSX.read(data); 
        const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
        
        const result = await apiCall('POST', 'importUsers', { users: jsonData });
        if (result.status === 'success') { 
            showAlert('สำเร็จ', result.message); 
            await fetchAllUsers(); 
        } else { 
            showAlert('ผิดพลาด', result.message); 
        }
    } catch (error) { 
        showAlert('ผิดพลาด', error.message); 
    } finally { 
        e.target.value = ''; 
    }
}

// --- OTHER MODALS ---

function openCommandApproval(requestId) {
    if (!checkAdminAccess()) return;
    document.getElementById('command-request-id').value = requestId;
    document.getElementById('command-approval-modal').style.display = 'flex';
}

// แก้ไขในไฟล์ admin.js

// ใน admin.js

async function openDispatchModal(requestId) {
    if (!checkAdminAccess()) return;
    
    // 1. Reset Form และเตรียมค่าเริ่มต้น
    document.getElementById('dispatch-form').reset();
    document.getElementById('dispatch-request-id').value = requestId;
    
    // ตั้งค่า Default จำนวนเอกสารแนบ 1-7 เป็น "๑" ทั้งหมด
    for(let i=1; i<=7; i++) {
        const el = document.getElementById(`qty${i}`);
        if(el) el.value = "๑";
    }

    // สร้าง Dropdown เดือน (เหมือนเดิม)
    const thaiMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const now = new Date();
    const monthSelect = document.getElementById('dispatch-month');
    monthSelect.innerHTML = thaiMonths.map(m => `<option value="${m}" ${m === thaiMonths[now.getMonth()] ? 'selected' : ''}>${m}</option>`).join('');
    document.getElementById('dispatch-year').value = now.getFullYear() + 543;

    try {
        toggleLoader('admin-requests-list', true);
        
        // 2. ดึงข้อมูลคำขอ
        const result = await apiCall('GET', 'getDraftRequest', { requestId: requestId });
        let data = {};
        if (result.status === 'success') {
            data = result.data.data || result.data;
        }

        // 3. เติมข้อมูลพื้นฐานลงฟอร์ม
        document.getElementById('dispatch-purpose').value = data.purpose || '';
        document.getElementById('dispatch-location').value = data.location || '';
        document.getElementById('dispatch-stay-at').value = data.stayAt || ''; // ที่พัก

        // 4. จัดการวันที่และเวลา
        const toInputDate = (d) => d ? new Date(d).toISOString().split('T')[0] : '';
        document.getElementById('dispatch-date-start').value = toInputDate(data.startDate);
        document.getElementById('dispatch-date-end').value = toInputDate(data.endDate);
        document.getElementById('dispatch-time-start').value = data.startTime || '06:00';
        document.getElementById('dispatch-time-end').value = data.endTime || '18:00';

        // 5. จัดการยานพาหนะ (Logic ใหม่: เช็คช่องแยกก่อน)
        // ถ้า User กรอกข้อมูลในช่อง "ยานพาหนะสำหรับหนังสือส่ง" (dispatchVehicleType) มาให้ใช้ค่านี้ก่อน
        if (data.dispatchVehicleType && data.dispatchVehicleType.trim() !== "") {
            document.getElementById('dispatch-vehicle-type').value = data.dispatchVehicleType;
            document.getElementById('dispatch-vehicle-id').value = data.dispatchVehicleId || '-';
        } else {
            // Fallback: ถ้าไม่มี (เช่น อยู่ในจังหวัดเดียวกัน หรือเป็นข้อมูลเก่า) ให้แปลงจาก Checkbox เดิม
            let vType = 'รถตู้'; 
            if (data.vehicleOption === 'gov') vType = 'รถบัสโรงเรียน'; 
            else if (data.vehicleOption === 'private') vType = 'รถยนต์ส่วนตัว';
            else if (data.vehicleOption === 'public') vType = 'รถโดยสารสาธารณะ';
            
            document.getElementById('dispatch-vehicle-type').value = vType;
            document.getElementById('dispatch-vehicle-id').value = data.licensePlate || data.publicVehicleDetails || '-';
        }

        // 6. นับจำนวนครู/นักเรียนอัตโนมัติ
        let attendees = [];
        try { 
            attendees = typeof data.attendees === 'string' ? JSON.parse(data.attendees) : (data.attendees || []); 
        } catch(e) { 
            attendees = []; 
        }
        
        let sCount = 0; // นักเรียน
        let tCount = 0; // ครู/บุคลากร
        const isStudent = (pos) => (pos || '').trim().includes('นักเรียน');
        
        // เช็คผู้ขอ
        if (isStudent(data.requesterPosition)) sCount++; else tCount++;
        
        // เช็คผู้ติดตาม (กันชื่อซ้ำกับผู้ขอ)
        attendees.forEach(att => {
            if ((att.name||'').trim() !== (data.requesterName||'').trim()) {
                if (isStudent(att.position)) sCount++; else tCount++;
            }
        });

        document.getElementById('student-count').value = sCount;
        document.getElementById('teacher-count').value = tCount;

        // 7. เปิด Modal
        const modal = document.getElementById('dispatch-modal');
        modal.classList.remove('hidden');
        modal.style.display = 'flex';

    } catch (error) {
        console.error(error);
        showAlert('ผิดพลาด', 'ไม่สามารถดึงข้อมูลคำขอได้');
    } finally {
        toggleLoader('admin-requests-list', false);
    }
}

function openAdminMemoAction(memoId) {
    if (!checkAdminAccess()) return;
    document.getElementById('admin-memo-id').value = memoId;
    document.getElementById('admin-memo-action-modal').style.display = 'flex';
}

async function handleCommandApproval(e) {
    e.preventDefault();
    const requestId = document.getElementById('command-request-id').value;
    const commandType = document.querySelector('input[name="command_type"]:checked')?.value;
    
    if (!commandType) { showAlert('ผิดพลาด', 'กรุณาเลือกรูปแบบคำสั่ง'); return; }
    
    toggleLoader('command-approval-submit-button', true);
    try {
        const result = await apiCall('POST', 'approveCommand', { requestId: requestId, templateType: commandType });
        if (result.status === 'success') { 
            showAlert('สำเร็จ', 'อนุมัติคำสั่งเรียบร้อยแล้ว'); 
            document.getElementById('command-approval-modal').style.display = 'none'; 
            document.getElementById('command-approval-form').reset(); 
            await fetchAllRequestsForCommand(); 
        } else { 
            showAlert('ผิดพลาด', result.message); 
        }
    } catch (error) { 
        showAlert('ผิดพลาด', error.message); 
    } finally { 
        toggleLoader('command-approval-submit-button', false); 
    }
}

async function handleAdminMemoActionSubmit(e) {
    e.preventDefault();
    const memoId = document.getElementById('admin-memo-id').value;
    const status = document.getElementById('admin-memo-status').value;
    
    const completedMemoFile = document.getElementById('admin-completed-memo-file').files[0];
    const completedCommandFile = document.getElementById('admin-completed-command-file').files[0];
    const dispatchBookFile = document.getElementById('admin-dispatch-book-file').files[0];
    
    let completedMemoFileObject = null; 
    let completedCommandFileObject = null; 
    let dispatchBookFileObject = null;
    
    if (completedMemoFile) completedMemoFileObject = await fileToObject(completedMemoFile);
    if (completedCommandFile) completedCommandFileObject = await fileToObject(completedCommandFile);
    if (dispatchBookFile) dispatchBookFileObject = await fileToObject(dispatchBookFile);
    
    toggleLoader('admin-memo-submit-button', true);
    
    try {
        const result = await apiCall('POST', 'updateMemoStatus', { 
            id: memoId, 
            status: status, 
            completedMemoFile: completedMemoFileObject, 
            completedCommandFile: completedCommandFileObject, 
            dispatchBookFile: dispatchBookFileObject 
        });
        
        if (result.status === 'success') {
            const urls = result.data || {}; 
            const safeId = memoId.replace(/[\/\\:\.]/g, '-');

            if (typeof db !== 'undefined') {
                 const updateData = { status: status };
                 if (urls.completedMemoUrl) updateData.completedMemoUrl = urls.completedMemoUrl;
                 if (urls.completedCommandUrl) updateData.completedCommandUrl = urls.completedCommandUrl;
                 if (urls.dispatchBookUrl) updateData.dispatchBookUrl = urls.dispatchBookUrl;

                 try {
                    await db.collection('memos').doc(safeId).set(updateData, { merge: true });
                    await db.collection('requests').doc(safeId).set(updateData, { merge: true });
                 } catch (e) { console.warn("Firestore update error:", e); }
            }

            if (status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน') { 
                const memo = allMemosCache.find(m => m.id === memoId); 
                if (memo && memo.submittedBy) { 
                    await sendCompletionEmail(memo.refNumber, memo.submittedBy, status); 
                } 
            }
            showAlert('สำเร็จ', 'อัปเดตสถานะและไฟล์เรียบร้อยแล้ว'); 
            document.getElementById('admin-memo-action-modal').style.display = 'none'; 
            document.getElementById('admin-memo-action-form').reset(); 
            await fetchAllMemos();
        } else { 
            showAlert('ผิดพลาด', result.message); 
        }
    } catch (error) { 
        showAlert('ผิดพลาด', error.message); 
    } finally { 
        toggleLoader('admin-memo-submit-button', false); 
    }
}

async function sendCompletionEmail(requestId, username, status) {
    try { 
        await apiCall('POST', 'sendCompletionEmail', { requestId: requestId, username: username, status: status }); 
    } catch (error) {}
}

async function openAdminGenerateCommand(requestId) {
    try {
        if (!checkAdminAccess()) return;
        
        document.getElementById('admin-command-result').classList.add('hidden');
        document.getElementById('admin-command-form').classList.remove('hidden');
        document.getElementById('admin-command-attendees-list').innerHTML = '';
        
        const result = await apiCall('GET', 'getDraftRequest', { requestId: requestId });
        
        if (result.status === 'success' && result.data) {
            let data = result.data;
            if (result.data.data) data = result.data.data;

            document.getElementById('admin-command-request-id').value = requestId;
            document.getElementById('admin-command-request-id-display').value = requestId;
            
            const toInputDate = (dateStr) => { 
                if(!dateStr) return ''; 
                const d = new Date(dateStr); 
                return !isNaN(d) ? d.toISOString().split('T')[0] : ''; 
            };
            
            const docDateInput = document.getElementById('admin-command-doc-date');
            docDateInput.value = toInputDate(data.docDate);
            docDateInput.readOnly = true; 
            docDateInput.classList.add('bg-gray-100', 'cursor-not-allowed', 'text-gray-500');

            document.getElementById('admin-command-requester-name').value = data.requesterName || '';
            document.getElementById('admin-command-requester-position').value = data.requesterPosition || '';
            document.getElementById('admin-command-location').value = data.location || '';
            document.getElementById('admin-command-purpose').value = data.purpose || '';
            document.getElementById('admin-command-start-date').value = toInputDate(data.startDate);
            document.getElementById('admin-command-end-date').value = toInputDate(data.endDate);
            
            if (data.attendees && Array.isArray(data.attendees)) { 
                data.attendees.forEach(att => addAdminAttendeeField(att.name, att.position)); 
            } else if (typeof data.attendees === 'string') {
                try {
                    JSON.parse(data.attendees).forEach(att => addAdminAttendeeField(att.name, att.position));
                } catch(e) {}
            }
            
            document.getElementById('admin-expense-option').value = data.expenseOption || 'no';
            document.getElementById('admin-expense-items').value = typeof data.expenseItems === 'object' ? JSON.stringify(data.expenseItems) : (data.expenseItems || '[]');
            document.getElementById('admin-total-expense').value = data.totalExpense || 0;
            document.getElementById('admin-vehicle-option').value = data.vehicleOption || 'gov';
            document.getElementById('admin-license-plate').value = data.licensePlate || '';
            
            const vehicleText = data.vehicleOption === 'gov' ? 'รถราชการ' : 
                              data.vehicleOption === 'private' ? ('รถส่วนตัว ' + (data.licensePlate||'')) : 'อื่นๆ';
            document.getElementById('admin-command-vehicle-info').textContent = `พาหนะ: ${vehicleText}`;
            
            await switchPage('admin-generate-command-page');
            
            const addBtn = document.getElementById('admin-add-attendee-btn');
            const newBtn = addBtn.cloneNode(true); 
            addBtn.parentNode.replaceChild(newBtn, addBtn);
            newBtn.addEventListener('click', () => addAdminAttendeeField());
            
        } else { 
            showAlert('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลคำขอได้'); 
        }
    } catch (error) { 
        console.error(error);
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาด: ' + error.message); 
    }
}

function addAdminAttendeeField(name = '', position = '') {
    const list = document.getElementById('admin-command-attendees-list');
    if (!list) return;
    
    const div = document.createElement('div');
    div.className = 'grid grid-cols-1 md:grid-cols-2 gap-2 mb-2 items-center bg-gray-50 p-2 rounded border border-gray-200';
    div.innerHTML = `
        <input type="text" class="form-input admin-att-name w-full" placeholder="ชื่อ-นามสกุล" value="${escapeHtml(name)}">
        <div class="flex gap-2">
            <input type="text" class="form-input admin-att-pos w-full" placeholder="ตำแหน่ง" value="${escapeHtml(position)}">
            <button type="button" class="btn btn-danger btn-sm px-3 font-bold hover:bg-red-700 transition" onclick="this.closest('.grid').remove()" title="ลบรายชื่อนี้">×</button>
        </div>
    `;
    list.appendChild(div);
}

function showDualLinkResult(containerId, title, docUrl, pdfUrl) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = `
        <h3 class="font-bold text-lg text-green-800">${title}</h3>
        <p class="mt-2 text-gray-700">ดำเนินการเสร็จสิ้น ท่านสามารถเลือกเปิดไฟล์ได้ 2 รูปแบบ:</p>
        <div class="flex justify-center flex-wrap gap-4 mt-4">
            ${docUrl ? `
            <a href="${docUrl}" target="_blank" class="btn bg-blue-600 hover:bg-blue-700 text-white shadow-md flex items-center gap-2">
                📝 แก้ไขใน Google Doc
            </a>` : ''}
            
            ${pdfUrl ? `
            <a href="${pdfUrl}" target="_blank" class="btn bg-red-600 hover:bg-red-700 text-white shadow-md flex items-center gap-2">
                📄 เปิดไฟล์ PDF
            </a>` : ''}
            
            <button onclick="switchPage('command-generation-page')" class="btn bg-gray-500 text-white">กลับหน้าจัดการ</button>
        </div>
    `;
    
    container.classList.remove('hidden');
}

// --- DELETE FUNCTIONS (สำหรับ Admin) ---

async function deleteRequestByAdmin(requestId) {
    if (!await showConfirm("ยืนยันการลบ", `คุณแน่ใจหรือไม่ที่จะลบคำขอเลขที่ ${requestId}?`)) return;
    toggleLoader('admin-requests-list', true);
    try {
        const safeId = requestId.toString().replace(/[\/\\:\.]/g, '-');
        if (typeof db !== 'undefined') { try { await db.collection('requests').doc(safeId).delete(); } catch (e) {} }
        const result = await apiCall('POST', 'deleteRequest', { id: requestId });
        if (result.status === 'success') {
            showAlert('สำเร็จ', 'ลบข้อมูลเรียบร้อยแล้ว');
            await fetchAllRequestsForCommand();
        } else { throw new Error(result.message); }
    } catch (error) {
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาด: ' + error.message);
        await fetchAllRequestsForCommand();
    }
}

async function deleteMemoByAdmin(memoId) {
    if (!await showConfirm("ยืนยันการลบ", `คุณแน่ใจหรือไม่ที่จะลบบันทึกข้อความเลขที่ ${memoId}?`)) return;
    toggleLoader('admin-memos-list', true);
    try {
        const safeId = memoId.toString().replace(/[\/\\:\.]/g, '-');
        if (typeof db !== 'undefined') { 
            try { await db.collection('memos').doc(safeId).delete(); } catch (e) {}
            try { await db.collection('requests').doc(safeId).delete(); } catch (e) {}
        }
        const result = await apiCall('POST', 'deleteMemo', { id: memoId });
        if (result.status === 'success') {
            showAlert('สำเร็จ', 'ลบข้อมูลเรียบร้อยแล้ว');
            await fetchAllMemos();
        } else { throw new Error(result.message); }
    } catch (error) {
        showAlert('ผิดพลาด', 'ไม่สามารถลบได้: ' + error.message);
        await fetchAllMemos();
    }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
        const base64String = reader.result.split(',')[1]; 
        resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
// --- เพิ่มใน js/admin.js ---

/**
 * ฟังก์ชัน Sync ข้อมูลจาก Google Sheets ลง Firebase
 * ใช้สำหรับกู้คืนข้อมูลรายชื่อแนบที่หายไป หรืออัปเดตข้อมูลให้ตรงกัน
 */
async function syncAllDataFromSheetToFirebase() {
    if (!checkAdminAccess()) return;
    
    // ถามยืนยันก่อนทำ เพราะอาจใช้เวลา
    if (!confirm('ยืนยันการ Sync ข้อมูล?\nระบบจะดึงข้อมูลทั้งหมดจาก Google Sheets มาทับใน Firebase เพื่อแก้ไขข้อมูลรายชื่อที่สูญหาย')) return;

    const btn = document.getElementById('admin-sync-btn');
    if(btn) toggleLoader('admin-sync-btn', true);

    try {
        console.log("🚀 Starting Full Sync...");
        
        // 1. ดึงข้อมูลทั้งหมดจาก Google Sheets ผ่าน GAS
        const result = await apiCall('GET', 'getAllRequests');
        
        if (result.status !== 'success' || !result.data) {
            throw new Error("ไม่สามารถดึงข้อมูลจาก Google Sheets ได้");
        }

        const allRequests = result.data;
        console.log(`📥 ได้รับข้อมูลจำนวน ${allRequests.length} รายการ`);

        // 2. เตรียม Batch สำหรับเขียนลง Firebase (Firestore จำกัด 500 ops ต่อ batch)
        const batchSize = 400;
        let batch = db.batch();
        let count = 0;
        let totalUpdated = 0;

        for (const req of allRequests) {
            if (!req.id) continue;

            const safeId = req.id.replace(/[\/\\:\.]/g, '-');
            const docRef = db.collection('requests').doc(safeId);

            // 3. แปลงข้อมูลให้ถูกต้อง (Clean Data)
            let attendees = [];
            if (req.attendees) {
                // ถ้ามาเป็น String ให้แปลงเป็น JSON Array
                if (typeof req.attendees === 'string') {
                    try { attendees = JSON.parse(req.attendees); } catch(e) { attendees = []; }
                } else if (Array.isArray(req.attendees)) {
                    attendees = req.attendees;
                }
            }

            let expenseItems = [];
            if (req.expenseItems) {
                if (typeof req.expenseItems === 'string') {
                    try { expenseItems = JSON.parse(req.expenseItems); } catch(e) { expenseItems = []; }
                } else if (Array.isArray(req.expenseItems)) {
                    expenseItems = req.expenseItems;
                }
            }

            // ข้อมูลที่จะอัปเดตลง Firebase
            const updateData = {
                ...req, // เอาข้อมูลเดิมทั้งหมดตั้ง
                attendees: attendees, // ทับด้วย Array ที่แปลงแล้ว
                expenseItems: expenseItems, // ทับด้วย Array ที่แปลงแล้ว
                lastSynced: firebase.firestore.FieldValue.serverTimestamp()
            };

            batch.set(docRef, updateData, { merge: true });
            count++;
            totalUpdated++;

            // ถ้าครบ Batch ให้ Commit แล้วเริ่มใหม่
            if (count >= batchSize) {
                await batch.commit();
                console.log(`💾 Saved batch of ${count} items...`);
                batch = db.batch();
                count = 0;
            }
        }

        // Commit เศษที่เหลือ
        if (count > 0) {
            await batch.commit();
        }

        console.log("✅ Sync Complete!");
        showAlert('สำเร็จ', `ซิงค์ข้อมูลเรียบร้อยแล้ว จำนวน ${totalUpdated} รายการ\nข้อมูลรายชื่อแนบได้รับการกู้คืนแล้ว`);
        
        // รีโหลดหน้าจอเพื่อแสดงผล
        if (typeof fetchAllRequestsForCommand === 'function') await fetchAllRequestsForCommand();

    } catch (error) {
        console.error("Sync Error:", error);
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการซิงค์: ' + error.message);
    } finally {
        if(btn) toggleLoader('admin-sync-btn', false);
    }
}
// [เพิ่มท้ายไฟล์]

// --- ANNOUNCEMENT MANAGEMENT ---

async function loadAdminAnnouncementSettings() {
    if (!checkAdminAccess()) return;
    
    // Reset Form
    document.getElementById('announcement-active').checked = false;
    document.getElementById('announcement-title-input').value = '';
    document.getElementById('announcement-message-input').value = '';
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
                
                // ★★★ แก้ไขตรงนี้: แปลงลิงก์ก่อนแสดงผล ★★★
                let displayUrl = data.imageUrl;
                if (displayUrl.includes('drive.google.com') && displayUrl.includes('/d/')) {
                    // ดึง File ID ออกมาแล้วสร้างลิงก์แบบ Direct
                    const fileId = displayUrl.split('/d/')[1].split('/')[0];
                    displayUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
                }
                
                preview.querySelector('img').src = displayUrl;
            }
        }
    } catch (e) { 
        console.error("Load Announcement Error:", e);
        showAlert('แจ้งเตือน', 'ไม่สามารถโหลดข้อมูลประกาศล่าสุดได้');
    }
}

async function handleSaveAnnouncement(e) {
    e.preventDefault();
    if (!checkAdminAccess()) return;

    toggleLoader('save-announcement-btn', true);

    try {
        const isActive = document.getElementById('announcement-active').checked;
        const title = document.getElementById('announcement-title-input').value;
        const message = document.getElementById('announcement-message-input').value;
        const fileInput = document.getElementById('announcement-image-input');
        
        let imageUrl = null;

        // ถ้ามีการอัปโหลดรูปใหม่
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const fileObj = await fileToObject(file);
            
            // อัปโหลดไปเก็บที่ Drive (ใช้ API เดิม)
            const uploadRes = await apiCall('POST', 'uploadGeneratedFile', {
                data: fileObj.data,
                filename: `announcement_${Date.now()}.jpg`,
                mimeType: file.type,
                username: getCurrentUser().username
            });
            
            if (uploadRes.status === 'success') {
                imageUrl = uploadRes.url;
            }
        } else {
            // ถ้าไม่ได้อัปใหม่ ให้ใช้รูปเดิม (ดึงจาก src ของ preview)
            const previewImg = document.querySelector('#current-announcement-img-preview img');
            if (previewImg && !document.getElementById('current-announcement-img-preview').classList.contains('hidden')) {
                imageUrl = previewImg.src;
            }
        }

        // บันทึกลง Firestore Collection 'settings' Document 'announcement'
        await db.collection('settings').doc('announcement').set({
            isActive,
            title,
            message,
            imageUrl,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: getCurrentUser().username
        }, { merge: true });

        showAlert('สำเร็จ', 'บันทึกประกาศเรียบร้อยแล้ว');
        
        // ล้างค่า input file
        fileInput.value = '';
        loadAdminAnnouncementSettings(); 

    } catch (error) {
        console.error(error);
        showAlert('ผิดพลาด', 'บันทึกไม่สำเร็จ: ' + error.message);
    } finally {
        toggleLoader('save-announcement-btn', false);
    }
}