
// --- REQUEST FUNCTIONS (HYBRID SYSTEM: Firebase + GAS + Render) ---

// 1. ตัวจัดการปุ่ม Action ต่างๆ (Router)
async function handleRequestAction(e) {
    // หาปุ่มที่ถูกกด (รองรับการกดโดนไอคอนภายในปุ่ม)
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const requestId = button.dataset.id;
    const action = button.dataset.action;

    console.log("Action triggered:", action, "Request ID:", requestId);

    if (action === 'edit') {
        // ฟังก์ชันแก้ไข (เรียก Modal แก้ไขเดิม)
        console.log("🔄 Opening edit page for:", requestId);
        if (typeof openEditPage === 'function') {
            await openEditPage(requestId);
        } else {
            console.error("Function openEditPage not found");
        }
        
    } else if (action === 'delete') {
        // ฟังก์ชันลบ
        console.log("🗑️ Deleting request:", requestId);
        await handleDeleteRequest(requestId);
        
    } else if (action === 'submit-memo-only') {
        // [NEW] ปุ่มออกเฉพาะ "บันทึกข้อความ" (บังคับ type = memo)
        const req = allRequestsCache.find(r => r.id === requestId);
        if (req) {
            await submitToSheetAndGeneratePDF(req, 'memo');
        } else {
            Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลคำขอ (Cache Miss)', 'error');
        }

    } else if (action === 'submit-and-pdf') {
        // [NEW] ปุ่มอัตโนมัติ (บันทึก + คำสั่ง/บันทึก ตามจำนวนคน)
        const req = allRequestsCache.find(r => r.id === requestId);
        if (req) {
            await submitToSheetAndGeneratePDF(req); // ไม่ระบุ type ให้ระบบคำนวณเอง
        } else {
            Swal.fire('ข้อผิดพลาด', 'ไม่พบข้อมูลคำขอ (Cache Miss)', 'error');
        }
    }
}

// 2. [CORE FUNCTION] บันทึกลง Sheet และส่งไป Render (รองรับทั้ง Memo และ Command)
async function submitToSheetAndGeneratePDF(requestData, forcedDocType = null) {
    try {
        // ถามยืนยันก่อนดำเนินการ
        const confirmResult = await Swal.fire({
            title: 'ยืนยันการดำเนินการ',
            text: "ระบบจะบันทึกสถานะ 'เสร็จสิ้น' ลงในฐานข้อมูล และสร้างไฟล์ PDF ทันที",
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#10b981', // สีเขียว
            cancelButtonColor: '#d33',
            confirmButtonText: 'ตกลง, ดำเนินการ',
            cancelButtonText: 'ยกเลิก'
        });

        if (!confirmResult.isConfirmed) return;

        // แสดง Loading
        Swal.fire({
            title: 'กำลังประมวลผล...',
            html: '1. บันทึกข้อมูลลง Google Sheet<br>2. สร้างไฟล์ PDF ภาษาไทย (Render)<br><small>(อาจใช้เวลา 1-2 นาทีหากเซิร์ฟเวอร์เพิ่งตื่น)</small>',
            allowOutsideClick: false,
            didOpen: () => { Swal.showLoading(); }
        });

        // --- STEP 1: บันทึกสถานะลง Google Sheet (ผ่าน GAS) ---
        const gasResponse = await apiCall('POST', 'updateRequestStatus', {
            id: requestData.id,
            status: 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' 
        });

        if (gasResponse.status !== 'success') {
            throw new Error('บันทึกข้อมูลลง Sheet ไม่สำเร็จ: ' + gasResponse.message);
        }

        // --- STEP 2: เตรียมข้อมูลวันที่ (เลขไทย/อารบิก) ---
        const now = new Date();
        const thMonths = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
        const toThaiNo = (no) => no.toString().replace(/[0-9]/g, d => "๐๑๒๓๔๕๖๗๘๙"[d]);

        // --- STEP 3: กำหนดประเภทเอกสาร ---
        let docType = 'memo'; // ค่าเริ่มต้น
        if (forcedDocType) {
            docType = forcedDocType; // บังคับตามปุ่มที่กด (เช่น กดปุ่มบันทึกข้อความ)
        } else {
            // อัตโนมัติ: ถ้ามีผู้ร่วมเดินทาง หรือมีรายชื่อแนบ -> เป็นคำสั่ง (command)
            const attendeeCount = (requestData.attendees || []).length;
            docType = attendeeCount > 0 ? 'command' : 'memo';
        }

        // --- STEP 4: ส่งข้อมูลไป Render ---
        const payload = {
            doc_type: docType,
            requester_name: requestData.requesterName || requestData.fullName,
            requester_position: requestData.position,
            purpose: requestData.purpose,
            location: requestData.location,
            start_date: requestData.startDate,
            end_date: requestData.endDate,
            duration: requestData.duration,
            attendees: requestData.attendees || [],
            
            // *** [IMPORTANT] ใส่ ID โฟลเดอร์ Google Drive ของคุณที่นี่ ***
            folderId: "1pGiVOigsZZqb-jOix2izMMl0AwzfS27Z", 
            
            requestId: requestData.id,
            
            // ข้อมูลวันที่สำหรับ Word
            doc_date: `${now.getDate()} ${thMonths[now.getMonth()]} ${now.getFullYear() + 543}`,
            doc_date_thai: `${toThaiNo(now.getDate())} ${thMonths[now.getMonth()]} ${toThaiNo(now.getFullYear() + 543)}`,
            year_th: (now.getFullYear() + 543).toString(),
            month_th: thMonths[now.getMonth()],
            day_th: now.getDate().toString()
        };

        const renderResponse = await fetch(RENDER_PDF_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!renderResponse.ok) {
            throw new Error(`Render Error: ${renderResponse.statusText}`);
        }

        const renderResult = await renderResponse.json();

        if (renderResult.status === "success") {
            Swal.fire({
                icon: 'success',
                title: 'เสร็จสิ้น!',
                text: 'บันทึกข้อมูลและสร้างเอกสารเรียบร้อยแล้ว',
                confirmButtonText: 'เปิดไฟล์ PDF',
                allowOutsideClick: false
            }).then(() => {
                window.open(renderResult.pdfUrl, '_blank');
                // รีเฟรชข้อมูลในหน้าเว็บ
                if (typeof fetchUserRequests === 'function') fetchUserRequests();
            });
        } else {
            throw new Error(renderResult.message);
        }

    } catch (error) {
        console.error("Workflow Error:", error);
        Swal.fire('เกิดข้อผิดพลาด', error.message, 'error');
    }
}

// 3. ฟังก์ชันลบคำขอ (เหมือนเดิม)
async function handleDeleteRequest(requestId) {
    try {
        const user = getCurrentUser();
        if (!user) { showAlert('ผิดพลาด', 'กรุณาเข้าสู่ระบบใหม่'); return; }

        const confirmed = await showConfirm(
            'ยืนยันการลบ', 
            `คุณแน่ใจหรือไม่ว่าต้องการลบคำขอ ${requestId}? ข้อมูลจะหายไปถาวร`
        );

        if (!confirmed) return;

        // ลบใน GAS
        const result = await apiCall('POST', 'deleteRequest', { id: requestId });
        
        if (result.status === 'success') {
            // ลบใน Firebase (ถ้าเปิดใช้)
            if (typeof db !== 'undefined' && typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE) {
               try {
                   await db.collection('requests').doc(requestId).delete();
               } catch(e) { console.error("Firebase delete error", e); }
            }

            showAlert('สำเร็จ', 'ลบข้อมูลเรียบร้อยแล้ว');
            await fetchUserRequests(); // รีเฟรชตาราง
        } else {
            showAlert('ผิดพลาด', result.message);
        }
    } catch (error) {
        console.error('Delete error:', error);
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการเชื่อมต่อ');
    }
}

// 4. ฟังก์ชันดึงข้อมูล (Hybrid: Firebase -> GAS Fallback) - เก็บไว้ครบถ้วน
// --- [UPDATED] ฟังก์ชันโหลดและแสดงผล Dashboard ---

async function fetchUserRequests() {
    try {
        const user = getCurrentUser();
        if (!user) return;

        // Reset UI States
        document.getElementById('requests-loader').classList.remove('hidden');
        document.getElementById('requests-list').classList.add('hidden');
        document.getElementById('no-requests-message').classList.add('hidden'); // ซ่อนไปก่อน

        let requestsData = [];
        let memosData = [];

        // 1. ดึงข้อมูล (Hybrid Logic)
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

        const memosResult = await apiCall('GET', 'getSentMemos', { username: user.username });
        if (memosResult.status === 'success') memosData = memosResult.data || [];
        
        // 2. กรองเฉพาะของ User (สำคัญมากสำหรับ Dashboard)
        if (requestsData && requestsData.length > 0) {
            requestsData = requestsData.filter(req => req.username === user.username);
            
            // เรียงลำดับ ล่าสุด -> เก่าสุด
            requestsData.sort((a, b) => {
                const dateA = new Date(a.timestamp || a.docDate || 0).getTime();
                const dateB = new Date(b.timestamp || b.docDate || 0).getTime();
                return dateB - dateA;
            });
        }

        // 3. เก็บลง Cache และแสดงผล
        allRequestsCache = requestsData;
        userMemosCache = memosData;
        
        renderRequestsList(allRequestsCache, userMemosCache);
        
        if (typeof updateNotifications === 'function') {
            updateNotifications(allRequestsCache, userMemosCache);
        }

    } catch (error) {
        console.error('Error fetching requests:', error);
        // กรณี Error ให้แสดงข้อความแจ้งเตือนแทน
        const container = document.getElementById('requests-list');
        container.innerHTML = `<div class="text-center py-8 text-red-500">เกิดข้อผิดพลาดในการโหลดข้อมูล<br><button onclick="fetchUserRequests()" class="mt-2 text-blue-500 underline">ลองใหม่</button></div>`;
        container.classList.remove('hidden');
    } finally {
        document.getElementById('requests-loader').classList.add('hidden');
    }
}

function renderRequestsList(requests, memos, searchTerm = '') {
    const container = document.getElementById('requests-list');
    const noRequestsMessage = document.getElementById('no-requests-message');
    
    // Safety check
    if (!container || !noRequestsMessage) return;

    // 1. กรณีไม่มีข้อมูลเลย (Empty State ตั้งแต่ต้น)
    if (!requests || requests.length === 0) {
        container.innerHTML = '';
        container.classList.add('hidden');
        noRequestsMessage.classList.remove('hidden');
        // ปรับข้อความให้เหมาะสม
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
        noRequestsMessage.innerHTML = `<div class="text-center py-8 text-gray-500">ไม่พบข้อมูลที่ตรงกับ "${escapeHtml(searchTerm)}"</div>`;
        return;
    }

    // 4. กรณีมีข้อมูล -> แสดงผล
    noRequestsMessage.classList.add('hidden');
    container.classList.remove('hidden');

    container.innerHTML = filteredRequests.map(request => {
        const relatedMemo = memos ? memos.find(memo => memo.refNumber === request.id) : null;
        
        // Logic การแสดงผลสถานะ (คงเดิมตามที่คุณมี)
        let displayRequestStatus = request.status;
        let displayCommandStatus = request.commandStatus;
        if (relatedMemo) {
            displayRequestStatus = relatedMemo.status;
            displayCommandStatus = relatedMemo.status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' ? 'เสร็จสิ้น' : relatedMemo.status;
        }
        
        const isFullyCompleted = displayRequestStatus === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' || displayRequestStatus === 'เสร็จสิ้น';
        const hasCompletedFiles = request.completedMemoUrl || request.completedCommandUrl || request.dispatchBookUrl || (relatedMemo && (relatedMemo.completedMemoUrl || relatedMemo.completedCommandUrl));

        // Sanitization
        const safeId = escapeHtml(request.id || request.requestId || 'รอออกเลข');
        const safePurpose = escapeHtml(request.purpose || 'ไม่มีวัตถุประสงค์');
        
        return `
            <div class="border rounded-lg p-4 mb-4 bg-white shadow-sm ${isFullyCompleted ? 'border-green-200 bg-green-50/50' : ''} hover:shadow-md transition-all">
                <div class="flex flex-col sm:flex-row justify-between items-start gap-4">
                    <div class="flex-1 w-full">
                        <div class="flex items-center flex-wrap gap-2 mb-2">
                            <span class="bg-indigo-100 text-indigo-800 text-xs font-bold px-2 py-1 rounded">${safeId}</span>
                            ${isFullyCompleted ? '<span class="text-green-600 text-xs font-bold flex items-center gap-1">✅ เสร็จสิ้น</span>' : ''}
                        </div>
                        <h3 class="font-bold text-gray-800 text-lg leading-snug mb-1">${safePurpose}</h3>
                        <p class="text-sm text-gray-500 flex items-center gap-1">
                            📍 ${escapeHtml(request.location)} 
                            <span class="mx-1">|</span> 
                            📅 ${formatDisplayDate(request.startDate)}
                        </p>
                        
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

                        ${hasCompletedFiles ? renderDownloadButtons(request, relatedMemo) : ''}
                    </div>
                    
                    <div class="flex flex-row sm:flex-col gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                        ${renderActionButtons(request, displayRequestStatus, relatedMemo, isFullyCompleted)}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Helper: สร้างปุ่ม Action แยกออกมาเพื่อให้โค้ดอ่านง่าย
function renderActionButtons(request, status, memo, isCompleted) {
    const id = request.id || request.requestId;
    if (isCompleted) {
        return request.pdfUrl ? `<a href="${request.pdfUrl}" target="_blank" class="btn btn-success btn-sm w-full text-center">📄 ดูคำขอ</a>` : '';
    }
    
    let html = '';
    // ปุ่มแก้ไข/ลบ
    html += `
        <button data-action="edit" data-id="${id}" class="btn bg-gray-100 hover:bg-gray-200 text-gray-700 btn-sm w-full">✏️ แก้ไข</button>
        <button data-action="delete" data-id="${id}" class="btn text-red-500 hover:bg-red-50 btn-sm w-full border border-red-100">🗑️ ลบ</button>
    `;
    
    // ปุ่มส่งบันทึก (แสดงเมื่อต้องแก้ หรือยังไม่เคยส่ง)
    if (status === 'นำกลับไปแก้ไข' || !memo) {
        html += `<button data-action="send-memo" data-id="${id}" class="btn bg-blue-600 hover:bg-blue-700 text-white btn-sm w-full shadow-sm mt-1">📤 ส่งบันทึก</button>`;
    }
    
    return html;
}

// Helper: ปุ่มดาวน์โหลดไฟล์ที่เสร็จแล้ว
function renderDownloadButtons(req, memo) {
    const mUrl = memo?.completedMemoUrl || req.completedMemoUrl;
    const cUrl = memo?.completedCommandUrl || req.completedCommandUrl;
    const dUrl = memo?.dispatchBookUrl || req.dispatchBookUrl;
    
    if(!mUrl && !cUrl && !dUrl) return '';

    return `
        <div class="mt-3 flex flex-wrap gap-2">
            ${mUrl ? `<a href="${mUrl}" target="_blank" class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded hover:bg-green-200 border border-green-200 transition">📄 บันทึกข้อความ</a>` : ''}
            ${cUrl ? `<a href="${cUrl}" target="_blank" class="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded hover:bg-blue-200 border border-blue-200 transition">📋 คำสั่ง</a>` : ''}
            ${dUrl ? `<a href="${dUrl}" target="_blank" class="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded hover:bg-purple-200 border border-purple-200 transition">📦 หนังสือส่ง</a>` : ''}
        </div>
    `;
}

// 5. ฟังก์ชันแสดงผลรายการ (ปรับปรุงปุ่มให้ครบทั้ง Memo และ Command)
// แก้ไขฟังก์ชัน renderRequestsList ใน requests.js

function renderRequestsList(requests) {
    const container = document.getElementById('requests-list');
    const noDataMessage = document.getElementById('no-requests-message');
    
    // ตรวจสอบว่ามี Element อยู่จริงหรือไม่ เพื่อป้องกัน Error
    if (!container || !noDataMessage) return;

    // กรณีไม่มีข้อมูล
    if (!requests || requests.length === 0) {
        container.innerHTML = '';
        container.classList.add('hidden');      // ซ่อนรายการ
        noDataMessage.classList.remove('hidden'); // แสดงข้อความ "ไม่พบข้อมูล"
        return;
    }

    // กรณีมีข้อมูล
    container.classList.remove('hidden');    // แสดงรายการ
    noDataMessage.classList.add('hidden');   // ซ่อนข้อความ "ไม่พบข้อมูล"

    // สร้าง HTML การ์ด
    container.innerHTML = requests.map(req => {
        const statusColor = getStatusColor(req.status);
        const isCompleted = req.status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' || req.status === 'Approved';
        
        let actionButtons = '';
        
        if (!isCompleted) {
            actionButtons = `
                <button data-id="${req.id}" data-action="edit" class="px-3 py-1 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition text-sm">
                    แก้ไข
                </button>
                <button data-id="${req.id}" data-action="submit-memo-only" class="px-3 py-1 bg-amber-500 text-white rounded-lg hover:bg-amber-600 shadow-sm transition text-sm" title="ออกเฉพาะบันทึกข้อความ">
                    📄 บันทึกข้อความ
                </button>
                <button data-id="${req.id}" data-action="submit-and-pdf" class="px-3 py-1 bg-green-500 text-white rounded-lg hover:bg-green-600 shadow-sm transition text-sm flex items-center gap-1" title="บันทึกและออกเอกสาร">
                    ✅ บันทึก/คำสั่ง
                </button>
                <button data-id="${req.id}" data-action="delete" class="px-3 py-1 text-red-400 hover:bg-red-50 rounded-lg transition text-sm">
                    ลบ
                </button>
            `;
        } else {
            actionButtons = `
                <span class="text-green-600 text-sm flex items-center gap-1 bg-green-50 px-3 py-1 rounded-full">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                    ดำเนินการเสร็จสิ้น
                </span>
            `;
        }

        return `
        <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition mb-4">
            <div class="flex flex-wrap justify-between items-start mb-3 gap-2">
                <div>
                    <div class="flex items-center gap-2 mb-1">
                         <span class="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100">${req.id || 'No ID'}</span>
                         <span class="text-xs text-gray-500 flex items-center gap-1">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                            ${formatDisplayDate(req.startDate)}
                         </span>
                    </div>
                    <h3 class="font-bold text-gray-800 text-lg leading-tight line-clamp-2">${escapeHtml(req.purpose)}</h3>
                </div>
                <span class="text-xs font-medium px-3 py-1 rounded-full ${statusColor} bg-opacity-10 border border-opacity-20 whitespace-nowrap">
                    ${req.status}
                </span>
            </div>
            
            <div class="text-sm text-gray-600 mb-4 pl-1 border-l-2 border-gray-100 ml-1">
                <div class="flex items-center gap-2 mb-1">
                    <span>📍</span> ${escapeHtml(req.location)}
                </div>
                 <div class="flex items-center gap-2 text-xs text-gray-500">
                    <span>👥</span> ${req.attendeeCount ? req.attendeeCount + ' ผู้ร่วมเดินทาง' : 'เดินทางคนเดียว'}
                </div>
            </div>

            <div class="flex flex-wrap gap-2 justify-end pt-3 border-t border-gray-50">
                ${actionButtons}
            </div>
        </div>
        `;
    }).join('');
}

// 6. ฟังก์ชันจัดการ Notification - คงเดิมไม่เปลี่ยนแปลง
function updateNotificationUI(requests) {
    const badge = document.getElementById('notif-badge');
    const list = document.getElementById('notif-list');
    
    // นับเฉพาะรายการที่ยังไม่เสร็จสิ้น
    const pendingRequests = requests.filter(r => 
        r.status !== 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' && r.status !== 'Approved'
    );

    if (badge) {
        badge.textContent = pendingRequests.length;
        badge.classList.toggle('hidden', pendingRequests.length === 0);
    }

    if (list) {
        renderNotificationList(pendingRequests);
    }
}

function renderNotificationList(requests) {
    const list = document.getElementById('notif-list');
    if (!list) return;

    if (requests.length === 0) {
        list.innerHTML = '<div class="p-4 text-center text-gray-400 text-sm">ไม่มีการแจ้งเตือนใหม่</div>';
    } else {
        list.innerHTML = requests.map(req => {
            const isFix = req.status.includes('แก้ไข');
            const statusBadge = isFix 
                ? `<span class="text-[10px] bg-red-100 text-red-600 px-1 rounded border border-red-200">แก้</span>` 
                : `<span class="text-[10px] bg-yellow-100 text-yellow-600 px-1 rounded border border-yellow-200">รอ</span>`;
            
            return `
            <div onclick="openSendMemoFromNotif('${req.id}')" class="p-3 hover:bg-gray-50 cursor-pointer transition border-b border-gray-100 last:border-0">
                <div class="flex justify-between items-start">
                    <div class="w-full">
                        <div class="flex justify-between items-center mb-1">
                            <span class="font-bold text-xs text-indigo-600">#${req.id}</span>
                            ${statusBadge}
                        </div>
                        <p class="text-xs text-gray-600 font-medium line-clamp-1">${escapeHtml(req.purpose)}</p>
                        <p class="text-[10px] text-gray-400 mt-0.5 text-right">${formatDisplayDate(req.startDate)}</p>
                    </div>
                </div>
            </div>
            `;
        }).join('');
    }
}

// Helper: เปิดหน้า Dashboard จาก Notification
function openSendMemoFromNotif(requestId) {
    // ปิด dropdown (ถ้ามี)
    const dropdown = document.getElementById('notification-dropdown');
    if(dropdown) dropdown.classList.add('hidden');

    // สลับหน้าจอ
    if (typeof switchPage === 'function') switchPage('dashboard-page');

    // เลื่อนหาการ์ด
    setTimeout(() => {
        const cardBtn = document.querySelector(`button[data-id="${requestId}"]`);
        if (cardBtn) {
            const card = cardBtn.closest('.bg-white'); // หา parent div
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.classList.add('ring-2', 'ring-indigo-500', 'ring-offset-2');
                setTimeout(() => card.classList.remove('ring-2', 'ring-indigo-500', 'ring-offset-2'), 2500);
            }
        }
    }, 600);
}
// --- ส่วนฟังก์ชันแก้ไขข้อมูล (ADD-ON สำหรับ Edit) ---

async function openEditPage(requestId) {
    try {
        // 1. ดึงข้อมูลล่าสุด
        let requestData = allRequestsCache.find(r => r.id === requestId);
        
        // ถ้าไม่มีใน Cache ให้ลองดึงจาก Server
        if (!requestData) {
            toggleLoader('requests-loader', true); // ใช้ loader ชั่วคราวถ้ามี
            const result = await apiCall('GET', 'getDraftRequest', { requestId });
            if (result.status === 'success') {
                requestData = result.data;
            } else {
                throw new Error('ไม่พบข้อมูลคำขอนี้');
            }
        }

        if (!requestData) throw new Error('ไม่สามารถโหลดข้อมูลได้');

        // 2. จำ ID ไว้ใน Session
        sessionStorage.setItem('currentEditRequestId', requestId);
        document.getElementById('edit-request-id').value = requestId;
        document.getElementById('edit-draft-id').value = requestId; // เผื่อใช้ field นี้

        // 3. กรอกข้อมูลลงฟอร์มแก้ไข (Map ข้อมูลกลับเข้า Input)
        document.getElementById('edit-doc-date').value = requestData.docDate ? requestData.docDate.split('T')[0] : '';
        document.getElementById('edit-requester-name').value = requestData.requesterName || '';
        document.getElementById('edit-requester-position').value = requestData.requesterPosition || '';
        document.getElementById('edit-location').value = requestData.location || '';
        document.getElementById('edit-purpose').value = requestData.purpose || '';
        document.getElementById('edit-start-date').value = requestData.startDate ? requestData.startDate.split('T')[0] : '';
        document.getElementById('edit-end-date').value = requestData.endDate ? requestData.endDate.split('T')[0] : '';
        
        // ผู้ร่วมเดินทาง
        const attendeesList = document.getElementById('edit-attendees-list');
        attendeesList.innerHTML = '';
        if (requestData.attendees && Array.isArray(requestData.attendees)) {
            requestData.attendees.forEach(att => addEditAttendeeField(att.name, att.position));
        }

        // ค่าใช้จ่าย
        if (requestData.expenseOption === 'no') {
            document.getElementById('edit-expense_no').checked = true;
            toggleEditExpenseOptions();
        } else {
            document.getElementById('edit-expense_partial').checked = true;
            toggleEditExpenseOptions();
            
            // ติ๊ก checkbox รายการ
            const items = requestData.expenseItems || [];
            document.querySelectorAll('input[name="edit-expense_item"]').forEach(cb => {
                cb.checked = items.includes(cb.value);
            });
            
            // ค่าใช้จ่ายอื่นๆ
            const otherItem = items.find(i => !['ค่าเบี้ยเลี้ยง','ค่าอาหาร','ค่าที่พัก','ค่าพาหนะ','ค่าน้ำมัน'].includes(i));
            if (otherItem) {
                document.getElementById('edit-expense_other_check').checked = true;
                document.getElementById('edit-expense_other_text').value = otherItem;
            }
            
            document.getElementById('edit-total-expense').value = requestData.totalExpense || '';
        }

        // พาหนะ
        // รีเซ็ต checkbox ก่อน
        document.querySelectorAll('input[name="edit-vehicle_option"]').forEach(cb => cb.checked = false);
        
        const vOption = requestData.vehicleOption;
        if (vOption === 'gov') {
            document.getElementById('edit-vehicle_gov').checked = true;
        } else if (vOption === 'private') {
            document.getElementById('edit-vehicle_private').checked = true;
            document.getElementById('edit-license-plate').value = requestData.licensePlate || '';
        } else if (vOption === 'public') {
            document.getElementById('edit-vehicle_public').checked = true;
            document.getElementById('edit-public-vehicle-details').value = requestData.licensePlate || ''; // ใช้ field เดียวกันเก็บข้อมูล
        }
        toggleEditVehicleDetails();

        // ผู้ลงนาม
        document.getElementById('edit-department').value = requestData.departmentHead || '';
        document.getElementById('edit-head-name').value = requestData.headName || '';

        // 4. เปลี่ยนหน้า
        switchPage('edit-page');

    } catch (error) {
        console.error("Open Edit Page Error:", error);
        Swal.fire('ผิดพลาด', 'ไม่สามารถเปิดหน้าแก้ไขได้: ' + error.message, 'error');
    }
}

// Helper: เพิ่มช่องกรอกผู้ร่วมเดินทางในหน้าแก้ไข
function addEditAttendeeField(name = '', position = 'ครู') {
    const list = document.getElementById('edit-attendees-list');
    const div = document.createElement('div');
    div.className = 'grid grid-cols-1 md:grid-cols-3 gap-2 items-center mb-2 attendee-row';
    div.innerHTML = `
        <input type="text" class="form-input attendee-name md:col-span-1" placeholder="ชื่อ-นามสกุล" value="${name}" required>
        <div class="attendee-position-wrapper md:col-span-1">
             <input type="text" class="form-input attendee-position-input" placeholder="ตำแหน่ง" value="${position}">
        </div>
        <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()">ลบ</button>
    `;
    list.appendChild(div);
}

// Helper: Toggle การแสดงผลค่าใช้จ่ายหน้าแก้ไข
function toggleEditExpenseOptions() {
    const isPartial = document.getElementById('edit-expense_partial').checked;
    const details = document.getElementById('edit-partial-expense-options');
    const total = document.getElementById('edit-total-expense-container');
    
    if (isPartial) {
        details.classList.remove('hidden');
        total.classList.remove('hidden');
    } else {
        details.classList.add('hidden');
        total.classList.add('hidden');
    }
}

// Helper: Toggle พาหนะหน้าแก้ไข
function toggleEditVehicleDetails() {
    const isPrivate = document.getElementById('edit-vehicle_private').checked;
    const isPublic = document.getElementById('edit-vehicle_public').checked;
    
    document.getElementById('edit-private-vehicle-details').classList.toggle('hidden', !isPrivate);
    document.getElementById('edit-public-vehicle-details').classList.toggle('hidden', !isPublic);
}

// Setup Event Listeners สำหรับหน้าแก้ไข (เรียกจาก main.js switchPage)
function setupEditPageEventListeners() {
    // ปุ่มเพิ่มผู้ร่วมเดินทาง
    const addBtn = document.getElementById('edit-add-attendee');
    // ลบ Event เดิมก่อนเพื่อป้องกันการ bind ซ้ำ
    const newAddBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newAddBtn, addBtn);
    newAddBtn.addEventListener('click', () => addEditAttendeeField());

    // Radio ค่าใช้จ่าย
    document.querySelectorAll('input[name="edit-expense_option"]').forEach(r => {
        r.addEventListener('change', toggleEditExpenseOptions);
    });

    // Checkbox พาหนะ
    document.querySelectorAll('input[name="edit-vehicle_option"]').forEach(c => {
        c.addEventListener('change', () => {
            // ทำให้เลือกได้แค่อย่างเดียว (Behavior แบบ Radio แต UI แบบ Checkbox)
            if(c.checked) {
                document.querySelectorAll('input[name="edit-vehicle_option"]').forEach(other => {
                    if(other !== c) other.checked = false;
                });
            }
            toggleEditVehicleDetails();
        });
    });

    // ปุ่มบันทึกการแก้ไข (generate-document-button)
    const saveBtn = document.getElementById('generate-document-button');
    const newSaveBtn = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(newSaveBtn, saveBtn);
    
    newSaveBtn.addEventListener('click', async () => {
        // ดึงข้อมูลจากฟอร์มแก้ไข
        const requestId = document.getElementById('edit-request-id').value;
        const currentReq = allRequestsCache.find(r => r.id === requestId); // เอาข้อมูลเก่ามา merge
        
        // รวบรวมผู้ร่วมเดินทาง
        const attendees = [];
        document.querySelectorAll('#edit-attendees-list .attendee-row').forEach(row => {
            attendees.push({
                name: row.querySelector('.attendee-name').value,
                position: row.querySelector('.attendee-position-input').value
            });
        });

        // รวบรวมค่าใช้จ่าย
        let expenseOption = document.querySelector('input[name="edit-expense_option"]:checked').value;
        let expenseItems = [];
        let totalExpense = 0;
        if(expenseOption === 'partial') {
            document.querySelectorAll('input[name="edit-expense_item"]:checked').forEach(cb => {
                if(cb.id === 'edit-expense_other_check') {
                    const txt = document.getElementById('edit-expense_other_text').value;
                    if(txt) expenseItems.push(txt);
                } else {
                    expenseItems.push(cb.value);
                }
            });
            totalExpense = document.getElementById('edit-total-expense').value;
        }

        // รวบรวมพาหนะ
        let vehicleOption = 'gov';
        let licensePlate = '';
        if(document.getElementById('edit-vehicle_private').checked) {
            vehicleOption = 'private';
            licensePlate = document.getElementById('edit-license-plate').value;
        } else if(document.getElementById('edit-vehicle_public').checked) {
            vehicleOption = 'public';
            licensePlate = document.getElementById('edit-public-vehicle-details').value;
        }

        // สร้าง Object ข้อมูลใหม่
        const updatedData = {
            ...currentReq, // เอาข้อมูลเดิมมาตั้งต้น
            id: requestId,
            docDate: document.getElementById('edit-doc-date').value,
            requesterName: document.getElementById('edit-requester-name').value,
            requesterPosition: document.getElementById('edit-requester-position').value,
            location: document.getElementById('edit-location').value,
            purpose: document.getElementById('edit-purpose').value,
            startDate: document.getElementById('edit-start-date').value,
            endDate: document.getElementById('edit-end-date').value,
            attendees: attendees,
            expenseOption: expenseOption,
            expenseItems: expenseItems,
            totalExpense: totalExpense,
            vehicleOption: vehicleOption,
            licensePlate: licensePlate,
            departmentHead: document.getElementById('edit-department').value,
            headName: document.getElementById('edit-head-name').value,
            status: 'Submitted' // หรือสถานะเดิมถ้าไม่อยากเปลี่ยน
        };

        // เรียกฟังก์ชันบันทึกและสร้าง PDF (Re-use ฟังก์ชันที่มีอยู่)
        await submitToSheetAndGeneratePDF(updatedData);
    });

    // ปุ่มกลับหน้า Dashboard
    document.getElementById('back-to-dashboard').onclick = () => switchPage('dashboard-page');
}
// --- [ADD-ON] ฟังก์ชันสำหรับหน้า Public Dashboard (แสดงรายการประจำสัปดาห์) ---

async function loadPublicWeeklyData() {
    const container = document.getElementById('public-weekly-list');
    if (!container) return; // ถ้าไม่อยู่หน้า Login ให้ข้ามไป

    try {
        // เรียก API ดึงข้อมูลสาธารณะ
        const result = await apiCall('GET', 'getPublicWeeklyData');
        
        if (result.status === 'success' && result.data) {
             renderPublicWeeklyList(result.data);
        } else {
             // กรณีไม่มีข้อมูล หรือ API ไม่ตอบกลับตามคาด
             container.innerHTML = '<tr><td colspan="4" class="text-center py-4 text-gray-500">ไม่พบรายการในสัปดาห์นี้</td></tr>';
             document.getElementById('current-week-display').textContent = 'ข้อมูลปัจจุบัน';
        }
    } catch (error) {
        console.error('Error loading public data:', error);
        // กรณีเชื่อมต่อไม่ได้ ให้แสดงข้อความแจ้งเตือนในตาราง
        container.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-6 text-red-500">
                    <p>ไม่สามารถโหลดข้อมูลได้</p>
                    <button onclick="loadPublicWeeklyData()" class="mt-2 text-sm text-blue-500 underline">ลองใหม่อีกครั้ง</button>
                </td>
            </tr>
        `;
    }
}

function renderPublicWeeklyList(data) {
    const container = document.getElementById('public-weekly-list');
    const weekDisplay = document.getElementById('current-week-display');
    
    // แสดงช่วงวันที่ของสัปดาห์ (ถ้า API ส่งมา)
    if(data.weekRange && weekDisplay) {
        weekDisplay.textContent = data.weekRange;
    }

    if (!data.requests || data.requests.length === 0) {
        container.innerHTML = '<tr><td colspan="4" class="text-center py-8 text-gray-400">สัปดาห์นี้ไม่มีรายการไปราชการ</td></tr>';
        return;
    }

    // สร้างแถวในตาราง
    container.innerHTML = data.requests.map(req => {
        // ตรวจสอบว่ามีไฟล์คำสั่งหรือไม่
        const commandBtn = req.commandUrl 
            ? `<a href="${req.commandUrl}" target="_blank" class="inline-flex items-center gap-1 bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold hover:bg-green-200 transition shadow-sm border border-green-200">
                 📄 ดูคำสั่ง
               </a>` 
            : `<span class="text-gray-300 text-xs">-</span>`;

        return `
        <tr class="hover:bg-blue-50/50 transition border-b border-gray-100 last:border-0 group">
            <td class="px-6 py-4 align-top">
                <div class="font-bold text-indigo-700 bg-indigo-50 inline-block px-2 py-0.5 rounded text-sm">${formatDisplayDate(req.startDate)}</div>
                ${req.endDate && req.endDate !== req.startDate ? `<div class="text-xs text-gray-500 mt-1">ถึง ${formatDisplayDate(req.endDate)}</div>` : ''}
            </td>
            <td class="px-6 py-4 align-top">
                <div class="font-bold text-gray-800">${req.requesterName}</div>
                <div class="text-xs text-gray-500 mt-0.5">${req.position || '-'}</div>
            </td>
            <td class="px-6 py-4 align-top">
                <div class="text-sm text-gray-800 font-medium mb-1">${req.purpose}</div>
                <div class="text-xs text-gray-500 flex items-center gap-1">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
                    ${req.location}
                </div>
            </td>
            <td class="px-6 py-4 align-top text-center">
                 ${commandBtn}
            </td>
        </tr>
        `;
    }).join('');
}
// --- [ADD-ON] ฟังก์ชันสำหรับหน้าแบบฟอร์มคำขอใหม่ (Form Page) ---

// 1. ฟังก์ชันจัดการการส่งฟอร์ม (Create New Request)
async function handleRequestFormSubmit(e) {
    e.preventDefault();

    // ตรวจสอบว่ากำลังกดปุ่มซ้ำหรือไม่
    const submitBtn = document.getElementById('submit-request-button');
    if (submitBtn.disabled) return;

    // รวบรวมข้อมูลจากฟอร์ม
    const formData = {
        docDate: document.getElementById('form-doc-date').value,
        requesterName: document.getElementById('form-requester-name').value,
        requesterPosition: document.getElementById('form-requester-position').value,
        location: document.getElementById('form-location').value,
        purpose: document.getElementById('form-purpose').value,
        startDate: document.getElementById('form-start-date').value,
        endDate: document.getElementById('form-end-date').value,
        
        // ข้อมูลผู้ร่วมเดินทาง
        attendees: getAttendeesFromForm('form-attendees-list'),
        
        // ข้อมูลผู้ลงนาม
        departmentHead: document.getElementById('form-department').value,
        headName: document.getElementById('form-head-name').value,
        
        // สถานะเริ่มต้น
        status: 'Submitted'
    };

    // จัดการข้อมูลค่าใช้จ่าย
    const expenseOption = document.querySelector('input[name="expense_option"]:checked').value;
    formData.expenseOption = expenseOption;
    formData.expenseItems = [];
    formData.totalExpense = 0;

    if (expenseOption === 'partial') {
        document.querySelectorAll('input[name="expense_item"]:checked').forEach(cb => {
            if (cb.id === 'expense_other_check') {
                const otherText = document.getElementById('expense_other_text').value;
                if (otherText) formData.expenseItems.push(otherText);
            } else {
                formData.expenseItems.push(cb.value);
            }
        });
        formData.totalExpense = document.getElementById('form-total-expense').value || 0;
    }

    // จัดการข้อมูลพาหนะ
    const vehicleCheckboxes = document.querySelectorAll('input[name="vehicle_option"]:checked');
    if (vehicleCheckboxes.length > 0) {
        // เลือกตัวแรกที่ติ๊ก (ปกติควรเลือกได้อย่างเดียว)
        const vOption = vehicleCheckboxes[0].value;
        formData.vehicleOption = vOption;
        
        if (vOption === 'private') {
            formData.licensePlate = document.getElementById('form-license-plate').value;
        } else if (vOption === 'public') {
            // ใช้ field licensePlate เก็บรายละเอียดพาหนะอื่นๆ ชั่วคราว
            formData.licensePlate = document.getElementById('form-public-vehicle-details').value;
        } else {
            formData.licensePlate = '';
        }
    } else {
        formData.vehicleOption = 'gov'; // ค่าเริ่มต้น
    }

    // ตรวจสอบข้อมูลจำเป็น
    if (!formData.docDate || !formData.requesterName || !formData.purpose) {
        Swal.fire('ข้อมูลไม่ครบถ้วน', 'กรุณากรอกข้อมูลที่มีเครื่องหมายดอกจันให้ครบ', 'warning');
        return;
    }

    // เริ่มกระบวนการบันทึก
    toggleLoader('submit-request-button', true);

    try {
        // ส่งข้อมูลไปสร้างในฐานข้อมูล (GAS/Firebase)
        const result = await apiCall('POST', 'submitRequest', formData);

        if (result.status === 'success') {
            // สำเร็จ -> ถามว่าจะออกเอกสารเลยไหม
            const confirmPdf = await Swal.fire({
                title: 'บันทึกสำเร็จ!',
                text: 'คุณต้องการออกเอกสาร PDF เลยหรือไม่?',
                icon: 'success',
                showCancelButton: true,
                confirmButtonText: 'ออกเอกสาร PDF',
                cancelButtonText: 'กลับไปหน้าหลัก',
                confirmButtonColor: '#10b981'
            });

            if (confirmPdf.isConfirmed) {
                // ถ้าจะออก PDF เลย ให้ใช้ ID ที่เพิ่งได้มา เรียกฟังก์ชันทำ PDF
                // ต้องเติม ID ใส่ object ก่อนส่งไป
                formData.id = result.requestId; 
                await submitToSheetAndGeneratePDF(formData);
            } else {
                // ถ้าไม่ทำ PDF ให้กลับไปหน้า Dashboard
                await switchPage('dashboard-page');
                if (typeof fetchUserRequests === 'function') fetchUserRequests();
            }
            
            // ล้างฟอร์ม
            resetRequestForm();
            
        } else {
            throw new Error(result.message);
        }

    } catch (error) {
        console.error('Submit Error:', error);
        Swal.fire('บันทึกไม่สำเร็จ', error.message, 'error');
    } finally {
        toggleLoader('submit-request-button', false);
    }
}

// 2. ฟังก์ชันเพิ่มช่องกรอกผู้ร่วมเดินทาง
function addAttendeeField(name = '', position = 'ครู') {
    const list = document.getElementById('form-attendees-list');
    if (!list) return;

    const div = document.createElement('div');
    div.className = 'grid grid-cols-1 md:grid-cols-3 gap-2 items-center mb-2 attendee-row fade-in';
    div.innerHTML = `
        <input type="text" class="form-input attendee-name md:col-span-1" placeholder="ชื่อ-นามสกุล" value="${name}" required>
        <div class="attendee-position-wrapper md:col-span-1">
             <input type="text" class="form-input attendee-position-input" placeholder="ตำแหน่ง" value="${position}">
        </div>
        <button type="button" class="btn btn-danger btn-sm text-xs px-2 py-1" onclick="this.parentElement.remove()">ลบ</button>
    `;
    list.appendChild(div);
}

// 3. ฟังก์ชันดึงรายชื่อผู้ร่วมเดินทางจากฟอร์ม
function getAttendeesFromForm(listId) {
    const attendees = [];
    document.querySelectorAll(`#${listId} .attendee-row`).forEach(row => {
        const name = row.querySelector('.attendee-name').value.trim();
        const position = row.querySelector('.attendee-position-input').value.trim();
        if (name) {
            attendees.push({ name, position });
        }
    });
    return attendees;
}

// 4. ฟังก์ชันรีเซ็ตฟอร์ม (Clear Form)
function resetRequestForm() {
    document.getElementById('request-form').reset();
    document.getElementById('form-attendees-list').innerHTML = '';
    
    // ตั้งค่าวันที่ปัจจุบัน
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('form-doc-date').value = today;
    document.getElementById('form-start-date').value = today;
    document.getElementById('form-end-date').value = today;
    
    // รีเซ็ตการแสดงผลส่วนซ่อนต่างๆ
    document.getElementById('partial-expense-options').classList.add('hidden');
    document.getElementById('total-expense-container').classList.add('hidden');
    document.getElementById('private-vehicle-details').classList.add('hidden');
    document.getElementById('public-vehicle-details').classList.add('hidden');
}

// 5. ฟังก์ชันเติมข้อมูลผู้ขออัตโนมัติ (Auto Fill)
function tryAutoFillRequester() {
    const user = getCurrentUser();
    if (user) {
        if (!document.getElementById('form-requester-name').value) {
            document.getElementById('form-requester-name').value = user.fullName || '';
        }
        if (!document.getElementById('form-requester-position').value) {
            document.getElementById('form-requester-position').value = user.position || '';
        }
    }
}

// 6. ฟังก์ชันจัดการ Checkbox พาหนะ (ให้เลือกได้แค่อย่างเดียว)
function toggleVehicleDetails(e) {
    if (e && e.target && e.target.checked) {
        // ปลดติ๊กอันอื่น
        document.querySelectorAll('input[name="vehicle_option"]').forEach(cb => {
            if (cb !== e.target) cb.checked = false;
        });
    }

    const isPrivate = document.querySelector('input[name="vehicle_option"][value="private"]').checked;
    const isPublic = document.querySelector('input[name="vehicle_option"][value="public"]').checked;

    const privateDetails = document.getElementById('private-vehicle-details');
    const publicDetails = document.getElementById('public-vehicle-details');

    if (privateDetails) privateDetails.classList.toggle('hidden', !isPrivate);
    if (publicDetails) publicDetails.classList.toggle('hidden', !isPublic);
}

// 7. ฟังก์ชันจัดการ Radio ค่าใช้จ่าย
function toggleExpenseOptions() {
    const isPartial = document.getElementById('expense_partial').checked;
    const details = document.getElementById('partial-expense-options');
    const total = document.getElementById('total-expense-container');

    if (details) details.classList.toggle('hidden', !isPartial);
    if (total) total.classList.toggle('hidden', !isPartial);
}
// --- [ADD-ON] ฟังก์ชันจัดการ Modal ส่งบันทึกข้อความ (Upload Memo) ---

async function handleMemoSubmitFromModal(e) {
    e.preventDefault();

    // 1. ดึงค่าจากฟอร์มใน Modal
    const requestId = document.getElementById('memo-modal-request-id').value;
    const memoType = document.querySelector('input[name="modal_memo_type"]:checked')?.value;
    const fileInput = document.getElementById('modal-memo-file');
    const file = fileInput?.files[0];

    // 2. ตรวจสอบความถูกต้อง
    if (!requestId) {
        Swal.fire('ผิดพลาด', 'ไม่พบรหัสคำขอ (Request ID)', 'error');
        return;
    }

    // กรณีเลือก "ไม่เบิกค่าใช้จ่าย" (non_reimburse) ปกติต้องบังคับให้อัปโหลดไฟล์
    // แต่ถ้าเลือก "เบิกค่าใช้จ่าย" (reimburse) อาจจะไม่ต้องแนบไฟล์ (ส่งเรื่องเปล่าๆ ไป)
    const isReimburse = memoType === 'reimburse';
    if (!isReimburse && !file) {
        Swal.fire('แจ้งเตือน', 'กรุณาแนบไฟล์บันทึกข้อความที่ลงนามแล้ว', 'warning');
        return;
    }

    // 3. เริ่มกระบวนการส่งข้อมูล
    toggleLoader('send-memo-submit-button', true);

    try {
        let fileObj = null;
        if (file) {
            // ใช้ฟังก์ชันแปลงไฟล์เป็น Base64 จาก utils.js
            fileObj = await fileToObject(file);
        }

        // ส่ง API ไปที่ GAS
        // ชื่อ action: 'submitSignedMemo' (หรือชื่อที่ตรงกับ backend ของคุณ)
        const result = await apiCall('POST', 'submitSignedMemo', {
            requestId: requestId,
            memoType: memoType,
            file: fileObj,
            // อัปเดตสถานะเป็น "รอตรวจสอบ" ทันทีที่ส่ง
            status: 'รอตรวจสอบและออกคำสั่งไปราชการ'
        });

        if (result.status === 'success') {
            Swal.fire({
                icon: 'success',
                title: 'ส่งเอกสารสำเร็จ',
                text: 'ระบบได้บันทึกไฟล์เรียบร้อยแล้ว'
            });

            // ปิด Modal
            document.getElementById('send-memo-modal').style.display = 'none';
            document.getElementById('send-memo-form').reset();

            // รีเฟรชตารางงาน
            if (typeof fetchUserRequests === 'function') fetchUserRequests();
        } else {
            throw new Error(result.message);
        }

    } catch (error) {
        console.error('Memo Submit Error:', error);
        Swal.fire('เกิดข้อผิดพลาด', 'ไม่สามารถส่งเอกสารได้: ' + error.message, 'error');
    } finally {
        toggleLoader('send-memo-submit-button', false);
    }
}
