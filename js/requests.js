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
async function fetchUserRequests() {
    toggleLoader('requests-loader', true);
    const container = document.getElementById('requests-list');
    if (container) container.innerHTML = '';

    try {
        const user = getCurrentUser();
        if (!user) return;

        // 1. ลองดึงจาก Firebase ก่อน
        let requests = null;
        if (typeof fetchRequestsHybrid === 'function') {
            requests = await fetchRequestsHybrid(user);
        }

        // 2. ถ้าไม่มีใน Firebase หรือมีปัญหา ให้ดึงจาก GAS (Fallback)
        if (!requests) {
            console.log("⚠️ Fallback to GAS for requests...");
            const result = await apiCall('GET', 'getUserRequests', { username: user.username });
            if (result.status === 'success') {
                requests = result.data;
            }
        }

        if (requests) {
            // เรียงลำดับ: ล่าสุดขึ้นก่อน
            requests.sort((a, b) => {
                const dateA = new Date(a.timestamp || a.docDate || 0);
                const dateB = new Date(b.timestamp || b.docDate || 0);
                return dateB - dateA; 
            });

            allRequestsCache = requests; // เก็บลง Cache
            renderRequestsList(requests); // แสดงผลรายการ
            updateNotificationUI(requests); // อัปเดตแจ้งเตือน
        }

    } catch (error) {
        console.error('Fetch requests error:', error);
        if(container) container.innerHTML = '<p class="text-center text-red-500 py-4">เกิดข้อผิดพลาดในการโหลดข้อมูล</p>';
    } finally {
        toggleLoader('requests-loader', false);
    }
}

// 5. ฟังก์ชันแสดงผลรายการ (ปรับปรุงปุ่มให้ครบทั้ง Memo และ Command)
function renderRequestsList(requests) {
    const container = document.getElementById('requests-list');
    if (!container) return;

    if (requests.length === 0) {
        container.innerHTML = '<p class="text-center py-8 text-gray-500">ไม่พบรายการคำขอ</p>';
        return;
    }

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

                <button data-id="${req.id}" data-action="submit-and-pdf" class="px-3 py-1 bg-green-500 text-white rounded-lg hover:bg-green-600 shadow-sm transition text-sm flex items-center gap-1" title="บันทึกและออกเอกสารตามจำนวนคน">
                    ✅ บันทึก/คำสั่ง
                </button>

                <button data-id="${req.id}" data-action="delete" class="px-3 py-1 text-red-400 hover:bg-red-50 rounded-lg transition text-sm">
                    ลบ
                </button>
            `;
        } else {
            actionButtons = `
                <span class="text-green-600 text-sm flex items-center gap-1 bg-green-50 px-2 py-1 rounded-full">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                    ดำเนินการเสร็จสิ้น
                </span>
            `;
        }

        return `
        <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition mb-3">
            <div class="flex justify-between items-start mb-2">
                <div>
                    <div class="flex items-center gap-2">
                         <span class="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">${req.id || 'No ID'}</span>
                         <span class="text-xs text-gray-400">${formatDisplayDate(req.startDate)}</span>
                    </div>
                    <h3 class="font-bold text-gray-800 mt-2 text-lg leading-tight">${escapeHtml(req.purpose)}</h3>
                </div>
                <span class="text-xs font-medium px-2.5 py-0.5 rounded-full ${statusColor} bg-opacity-10 border border-opacity-20">
                    ${req.status}
                </span>
            </div>
            
            <div class="text-sm text-gray-600 mb-4 mt-2 pl-1">
                <div class="flex items-center gap-2 mb-1">
                    <span>📍</span> ${escapeHtml(req.location)}
                </div>
            </div>

            <div class="flex flex-wrap gap-2 justify-end border-t border-gray-100 pt-3">
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
