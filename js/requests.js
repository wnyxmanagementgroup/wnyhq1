// --- REQUEST FUNCTIONS (HYBRID SYSTEM: Firebase + GAS) ---
// --- ส่วนที่เพิ่มใหม่: รายชื่อจังหวัดและ Logic ตรวจสอบเงื่อนไข ---

// --- ส่วนที่เพิ่มใหม่: รายชื่อจังหวัดและ Logic ตรวจสอบเงื่อนไข (ยานพาหนะ + ที่พัก) ---

const THAI_PROVINCES = [
    "กระบี่", "กรุงเทพมหานคร", "กาญจนบุรี", "กาฬสินธุ์", "กำแพงเพชร", "ขอนแก่น", 
    "จันทบุรี", "ฉะเชิงเทรา", "ชลบุรี", "ชัยนาท", "ชัยภูมิ", "ชุมพร", "เชียงราย", 
    "เชียงใหม่", "ตรัง", "ตราด", "ตาก", "นครนายก", "นครปฐม", "นครพนม", "นครราชสีมา", 
    "นครศรีธรรมราช", "นครสวรรค์", "นนทบุรี", "นราธิวาส", "น่าน", "บึงกาฬ", "บุรีรัมย์", 
    "ปทุมธานี", "ประจวบคีรีขันธ์", "ปราจีนบุรี", "ปัตตานี", "พระนครศรีอยุธยา", 
    "พะเยา", "พังงา", "พัทลุง", "พิจิตร", "พิษณุโลก", "เพชรบุรี", "เพชรบูรณ์", "แพร่", 
    "ภูเก็ต", "มหาสารคาม", "มุกดาหาร", "แม่ฮ่องสอน", "ยโสธร", "ยะลา", "ร้อยเอ็ด", 
    "ระนอง", "ระยอง", "ราชบุรี", "ลพบุรี", "ลำปาง", "ลำพูน", "เลย", "ศรีสะเกษ", 
    "สกลนคร", "สงขลา", "สตูล", "สมุทรปราการ", "สมุทรสงคราม", "สมุทรสาคร", 
    "สระแก้ว", "สระบุรี", "สิงห์บุรี", "สุโขทัย", "สุพรรณบุรี", "สุราษฎร์ธานี", 
    "สุรินทร์", "หนองคาย", "หนองบัวลำภู", "อ่างทอง", "อำนาจเจริญ", "อุดรธานี", 
    "อุตรดิตถ์", "อุทัยธานี", "อุบลราชธานี"
];

function initProvinceDropdown() {
    const select = document.getElementById('form-province');
    if (!select) return;

    select.innerHTML = ''; 

    // ค่าเริ่มต้น
    const defaultOption = document.createElement('option');
    defaultOption.value = 'สระแก้ว';
    defaultOption.text = 'สระแก้ว';
    defaultOption.selected = true;
    select.appendChild(defaultOption);

    // วนลูปจังหวัดอื่นๆ
    THAI_PROVINCES.forEach(province => {
        if (province !== 'สระแก้ว') {
            const option = document.createElement('option');
            option.value = province;
            option.text = province;
            select.appendChild(option);
        }
    });

    const otherOption = document.createElement('option');
    otherOption.value = 'other';
    otherOption.text = 'อื่นๆ (ระบุ)';
    select.appendChild(otherOption);
}

// ในไฟล์ requests.js

function setupFormConditions() {
    initProvinceDropdown(); // เรียกฟังก์ชันสร้างจังหวัด

    const province = document.getElementById('form-province');
    const provinceOther = document.getElementById('form-province-other');
    
    // Elements ที่พัก
    const stayContainer = document.getElementById('form-stay-container');
    const stayInput = document.getElementById('form-stay-at');
    
    // Elements ยานพาหนะ (สำหรับหนังสือส่ง) - เพิ่มใหม่
    const vehicleContainer = document.getElementById('form-dispatch-vehicle-container');
    const vehicleTypeInput = document.getElementById('form-dispatch-vehicle-type');
    const vehicleIdInput = document.getElementById('form-dispatch-vehicle-id');

    function checkConditions() {
        if (!province) return;
        
        const isNotSaKaeo = province.value !== 'สระแก้ว';

        // 1. จัดการช่องจังหวัด "อื่นๆ"
        if(province.value === 'other') {
            provinceOther.classList.remove('hidden');
            provinceOther.required = true;
        } else {
            provinceOther.classList.add('hidden');
            provinceOther.required = false;
        }

        // 2. เงื่อนไข: ไม่ใช่สระแก้ว (แสดงและบังคับกรอก)
        if (isNotSaKaeo) {
            // -- ส่วนที่พัก --
            stayContainer.classList.remove('hidden');
            stayInput.required = true;

            // -- ส่วนยานพาหนะหนังสือส่ง (ใหม่) --
            vehicleContainer.classList.remove('hidden');
            vehicleTypeInput.required = true;
            vehicleIdInput.required = true;
        } else {
            // -- ซ่อนและล้างค่า --
            stayContainer.classList.add('hidden');
            stayInput.required = false;
            stayInput.value = '';

            vehicleContainer.classList.add('hidden');
            vehicleTypeInput.required = false;
            vehicleTypeInput.value = '';
            vehicleIdInput.required = false;
            vehicleIdInput.value = '';
        }
    }

    if (province) {
        province.addEventListener('change', checkConditions);
        checkConditions(); // เรียกครั้งแรก
    }
}
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
// ==========================================
// 1. ฟังก์ชันดึงข้อมูล (Fetch Data) - อัปเกรดระบบ Cache
// ==========================================
async function fetchUserRequests(forceRefresh = false) {
    const user = getCurrentUser();
    if (!user) return;

    const yearSelect = document.getElementById('user-year-select');
    const currentYear = new Date().getFullYear() + 543;
    const selectedYear = yearSelect ? parseInt(yearSelect.value) : currentYear;

    // --- 🚀 CACHE CHECK LOGIC ---
    const now = Date.now();
    const isCacheValid = window.userRequestsCache !== null;
    const isSameYear = window.userRequestsCacheYear === selectedYear;
    const isNotExpired = (now - window.userRequestsCacheTime) < CACHE_TTL_MS;

    if (!forceRefresh && isCacheValid && isSameYear && isNotExpired) {
        console.log("⚡ โหลดข้อมูลจาก Cache (ประหยัดเวลาและโควต้า API)");
        renderUserRequests(window.userRequestsCache);
        return; // ออกจากฟังก์ชันเลย ไม่ต้องยิง API
    }

    // UI: แสดง Loader ถ้าต้องยิง API ใหม่
    const container = document.getElementById('user-requests-list');
    const noMsg = document.getElementById('no-requests-message');
    
    if (container) {
        container.classList.remove('hidden');
        container.innerHTML = `
            <div class="flex flex-col items-center justify-center py-10">
                <span class="loader mb-3"></span>
                <p class="text-gray-500 animate-pulse">กำลังดึงข้อมูลล่าสุดจากเซิร์ฟเวอร์...</p>
            </div>`;
    }
    if (noMsg) noMsg.classList.add('hidden');

    try {
        // 1. ดึงข้อมูลหลักจาก Google Sheets (GAS)
        const result = await apiCall('GET', 'getRequestsByYear', { 
            year: selectedYear, 
            username: user.username 
        });

        let requests = (result.status === 'success') ? result.data || [] : [];

        // 2. ดึงข้อมูลจาก Firebase มาทับ (เพื่อให้ได้ลิงก์ล่าสุดแบบ Real-time)
        if (typeof db !== 'undefined') {
            try {
                const snapshot = await db.collection('requests')
                    .where('username', '==', user.username)
                    .get();
                
                const firebaseData = {};
                snapshot.forEach(doc => { firebaseData[doc.id] = doc.data(); });

                requests = requests.map(req => {
                    const safeId = req.id ? req.id.replace(/[\/\\:\.]/g, '-') : '';
                    const fbDoc = safeId ? firebaseData[safeId] : null;
                    
                    if (fbDoc) {
                        return {
                            ...req,
                            fileUrl: fbDoc.fileUrl || req.fileUrl,
                            pdfUrl: fbDoc.pdfUrl || req.pdfUrl,
                            memoPdfUrl: fbDoc.memoPdfUrl || req.memoPdfUrl, 
                            completedMemoUrl: fbDoc.completedMemoUrl || req.completedMemoUrl,
                            commandPdfUrl: fbDoc.commandPdfUrl || fbDoc.commandBookUrl || req.commandPdfUrl,
                            dispatchBookUrl: fbDoc.dispatchBookUrl || fbDoc.dispatchBookPdfUrl || req.dispatchBookUrl,
                            status: fbDoc.status || req.status,
                            commandStatus: fbDoc.commandStatus || req.commandStatus
                        };
                    }
                    return req;
                });
            } catch (e) {
                console.warn("Firebase Sync Error:", e);
            }
        }

        // 3. เรียงลำดับ (ใหม่ -> เก่า)
        if (requests.length > 0) {
            requests.sort((a, b) => {
                const getTime = (d) => d ? new Date(d).getTime() : 0;
                return getTime(b.docDate) - getTime(a.docDate);
            });
        }

        // --- 💾 บันทึกข้อมูลลง CACHE ---
        window.userRequestsCache = requests;
        window.userRequestsCacheTime = Date.now();
        window.userRequestsCacheYear = selectedYear;

        // 4. แสดงผล
        renderUserRequests(requests);

    } catch (error) {
        console.error('Error fetching requests:', error);
        if (container) {
            container.innerHTML = `<p class="text-center text-red-500 py-10">โหลดข้อมูลไม่สำเร็จ: ${error.message}</p>`;
        }
    }
}

// ==========================================
// 2. ฟังก์ชันแสดงผล (Render UI) - ปรับปรุงปุ่มแก้ไขรายการที่ส่งแล้ว
// ==========================================
function renderUserRequests(requests) {
    const container = document.getElementById('user-requests-list');
    const noMsg = document.getElementById('no-requests-message');
    
    if (!container) return;

    if (!requests || requests.length === 0) {
        container.innerHTML = ''; 
        container.classList.add('hidden');
        if (noMsg) {
            noMsg.classList.remove('hidden');
            noMsg.innerHTML = `
                <div class="text-center py-10">
                    <p class="text-gray-400 text-lg">ไม่พบประวัติการขอไปราชการในปีนี้</p>
                    <button onclick="switchPage('form-page')" class="mt-3 btn bg-indigo-500 hover:bg-indigo-600 text-white btn-sm">
                        + สร้างคำขอใหม่
                    </button>
                </div>
            `;
        }
        return;
    }

    // Helper format วันที่
    const formatDate = (date) => {
        if (!date) return '-';
        const d = new Date(date);
        return isNaN(d.getTime()) ? date : d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    container.classList.remove('hidden');
    if (noMsg) noMsg.classList.add('hidden');

    container.innerHTML = requests.map(req => {
        const safeId = escapeHtml(req.id || 'รอเลขที่');
        
        // ลิงก์ไฟล์ต่างๆ
        const completedMemoUrl = req.completedMemoUrl; 
        const draftMemoUrl = req.fileUrl || req.pdfUrl || req.memoPdfUrl; // ลิงก์ไฟล์ที่สร้างจากการแก้ไขจะอยู่ที่นี่
        const completedCommandUrl = req.completedCommandUrl || req.commandPdfUrl || req.commandBookUrl;
        const dispatchBookUrl = req.dispatchBookUrl || req.dispatchBookPdfUrl;

        const isCompleted = (req.status === 'เสร็จสิ้น' || req.status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' || completedMemoUrl);
        const isFixing = (req.status === 'นำกลับไปแก้ไข' || req.memoStatus === 'นำกลับไปแก้ไข');
        const needsToSend = (draftMemoUrl && !completedMemoUrl && req.status !== 'ไม่อนุมัติ' && req.status !== 'ยกเลิก') || isFixing;
        // --- 1. Badge สถานะ ---
        let statusBadge = '';
        if (completedCommandUrl) {
            statusBadge = `<span class="px-2 py-1 rounded-full text-xs bg-green-100 text-green-700 border border-green-200">✅ อนุมัติ/ออกคำสั่งแล้ว</span>`;
        } else if (isCompleted) {
             statusBadge = `<span class="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700 border border-blue-200">☑️ ส่งแล้ว (รอคำสั่ง)</span>`;
        } else if (req.status === 'ไม่อนุมัติ') {
            statusBadge = `<span class="px-2 py-1 rounded-full text-xs bg-red-100 text-red-700 border border-red-200">❌ ไม่อนุมัติ</span>`;
        } else if (isFixing) {
            statusBadge = `<span class="px-2 py-1 rounded-full text-xs bg-red-100 text-red-700 border border-red-200 animate-pulse font-bold">⚠️ ตีกลับ/ต้องแก้ไข</span>`;
        } else if (needsToSend) {
            statusBadge = `<span class="px-2 py-1 rounded-full text-xs bg-orange-100 text-orange-700 border border-orange-200 font-bold">⏳ รอยืนยันการส่ง</span>`;
        } else {
            statusBadge = `<span class="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700 border border-gray-200">... กำลังดำเนินการ</span>`;
        }

        // --- Action Buttons ---
        let actionButtons = '';

        // ปุ่มส่งบันทึก
        if (needsToSend) {
            actionButtons += `
                <button onclick="openSendMemoFromList('${safeId}')" class="btn bg-orange-500 hover:bg-orange-600 text-white btn-sm flex items-center gap-2 shadow-lg animate-pulse border-2 border-orange-300">
                    <span>📤</span> ส่งบันทึก/แนบไฟล์
                </button>`;
        }
        else if (completedMemoUrl && !completedCommandUrl) {
            actionButtons += `
                <button onclick="editRequest('${safeId}')" class="btn bg-yellow-500 hover:bg-yellow-600 text-white btn-sm flex items-center gap-1 shadow-md">
                    ✏️ แก้ไขรายการที่ส่ง
                </button>`;
        }

        // ปุ่มดูไฟล์
        if (completedMemoUrl) {
            // กรณีส่งเสร็จแล้ว
            actionButtons += `
                <a href="${completedMemoUrl}" target="_blank" class="btn bg-blue-600 text-white hover:bg-blue-700 btn-sm flex items-center gap-1 shadow-md">
                    📄 ดูบันทึก (ฉบับส่ง)
                </a>`;
        } else if (draftMemoUrl && !isCompleted) {
            // ★★★ แก้ไขจุดนี้: เปลี่ยนจาก "พิมพ์ร่าง" เป็น "ดูบันทึก" เพื่อให้ตรงความต้องการ ★★★
            actionButtons += `
                <a href="${draftMemoUrl}" target="_blank" class="btn bg-teal-600 text-white hover:bg-teal-700 border border-teal-200 btn-sm flex items-center gap-1 shadow-sm">
                    📄 ดูบันทึก (ฉบับร่าง/แก้ไข)
                </a>`;
        }
        // [C] ปุ่มคำสั่ง (ถ้ามี)
        if (completedCommandUrl) {
            actionButtons += `
                <a href="${completedCommandUrl}" target="_blank" class="btn bg-green-600 text-white hover:bg-green-700 btn-sm flex items-center gap-1 shadow-md">
                    📋 คำสั่ง
                </a>`;
        }

        // [D] ปุ่มหนังสือส่ง (ถ้ามี)
        if (dispatchBookUrl) {
            actionButtons += `
                <a href="${dispatchBookUrl}" target="_blank" class="btn bg-purple-600 text-white hover:bg-purple-700 btn-sm flex items-center gap-1 shadow-md">
                    📦 หนังสือส่ง
                </a>`;
        }

        // --- 3. เงื่อนไขการแก้ไข/ลบ ---
        // อนุญาตให้แก้ไขได้ตราบใดที่ "ยังไม่มีคำสั่ง" (แม้จะส่งบันทึกแล้วก็ตาม)
        const canEdit = !completedCommandUrl;

        // กำหนดสีขอบซ้ายตามสถานะ
        let borderClass = 'border-l-gray-300';
        if (completedCommandUrl) borderClass = 'border-l-green-500';
        else if (isCompleted) borderClass = 'border-l-blue-500';
        else if (needsToSend) borderClass = 'border-l-orange-500';
        else if (isFixing) borderClass = 'border-l-red-500';

        return `
        <div class="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition duration-200 mb-4 border-l-4 ${borderClass}">
            <div class="flex flex-col md:flex-row justify-between gap-4">
                <div class="flex-1">
                    <div class="flex items-center gap-3 mb-2 flex-wrap">
                        <h4 class="font-bold text-indigo-700 text-lg">${safeId}</h4>
                        ${statusBadge}
                    </div>
                    <div class="space-y-1 text-sm text-gray-600">
                        <p><strong>เรื่อง:</strong> ${escapeHtml(req.purpose)}</p>
                        <p><strong>สถานที่:</strong> ${escapeHtml(req.location)}</p>
                        <p><strong>วันที่:</strong> ${formatDate(req.startDate)} - ${formatDate(req.endDate)}</p>
                    </div>
                    ${needsToSend ? `<p class="text-xs text-orange-600 mt-2 font-bold flex items-center gap-1">👉 กรุณากดปุ่ม "ส่งบันทึก" เพื่อยืนยันข้อมูลเข้าระบบ</p>` : ''}
                </div>
                
                <div class="flex flex-col items-end gap-3 min-w-[200px]">
                    <div class="flex flex-col gap-2 w-full items-end">
                        ${actionButtons}
                    </div>
                    
                    ${canEdit ? `
                        <div class="flex gap-3 mt-1 pt-2 border-t border-gray-100 w-full justify-end">
                            ${!isCompleted ? `<button onclick="editRequest('${safeId}')" class="text-xs text-indigo-500 hover:text-indigo-700 font-medium flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded">✏️ แก้ไข</button>` : ''}
                            <button onclick="deleteRequest('${safeId}')" class="text-xs text-red-500 hover:text-red-700 font-medium flex items-center gap-1 bg-red-50 px-2 py-1 rounded">🗑️ ยกเลิก</button>
                        </div>` : ''
                    }
                </div>
            </div>
        </div>`;
    }).join('');
}

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
        
        if (relatedMemo) {
            displayRequestStatus = relatedMemo.status;
            displayCommandStatus = relatedMemo.status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' ? 'เสร็จสิ้น' : relatedMemo.status;
        }
        
        // ลิงก์ไฟล์ต่างๆ
        const completedMemoUrl = relatedMemo?.completedMemoUrl || request.completedMemoUrl || request.memoPdfUrl || request.fileUrl;
        const completedCommandUrl = relatedMemo?.completedCommandUrl || request.completedCommandUrl || request.commandBookUrl;
        const dispatchBookUrl = relatedMemo?.dispatchBookUrl || request.dispatchBookUrl || request.dispatchBookPdfUrl;

        const hasCompletedFiles = completedMemoUrl || completedCommandUrl || dispatchBookUrl;
        const isFullyCompleted = displayRequestStatus === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' || displayRequestStatus === 'เสร็จสิ้น';
        
        const safeId = escapeHtml(request.id || request.requestId || 'รอออกเลข');
        const safePurpose = escapeHtml(request.purpose || 'ไม่มีวัตถุประสงค์');
        const safeLocation = escapeHtml(request.location || 'ไม่ระบุ');
        const safeDate = `${formatDisplayDate(request.startDate)} - ${formatDisplayDate(request.endDate)}`;
        
        // ★★★ แก้ไขจุดนี้: เลือกไฟล์คำขอ (Cloud Run) ก่อนไฟล์ GAS ★★★
        const requestDocUrl = request.fileUrl || request.memoPdfUrl || request.pdfUrl;

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
                        ${requestDocUrl ? `
                            <a href="${requestDocUrl}" target="_blank" class="btn btn-success btn-sm w-full text-center">
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
    const importBtn = document.getElementById('edit-import-excel');
    const fileInput = document.getElementById('edit-excel-file-input');

    if (importBtn && fileInput) {
        // เมื่อกดปุ่มสีฟ้า -> ให้ไปกด input file ที่ซ่อนอยู่
        importBtn.addEventListener('click', () => fileInput.click());
        
        // เมื่อเลือกไฟล์เสร็จ -> เรียกฟังก์ชันประมวลผล
        fileInput.addEventListener('change', handleEditExcelImport);
    }
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

// 1. ฟังก์ชันนำข้อมูลเข้าฟอร์ม (แก้ไขให้ดึงรายชื่อมาสร้างฟิลด์อัตโนมัติ)
// --- แก้ไขในไฟล์ js/requests.js ---

// --- แก้ไขในไฟล์ js/requests.js ---

async function populateEditForm(requestData) {
    try {
        console.log("📝 กำลังเติมข้อมูลลงฟอร์มแก้ไข:", requestData);
        
        // --- 1. ข้อมูลพื้นฐานและ ID ---
        document.getElementById('edit-draft-id').value = requestData.draftId || '';
        document.getElementById('edit-request-id').value = requestData.requestId || requestData.id || '';
        
        // ฟังก์ชันช่วยแปลงวันที่
        const formatDate = (dateValue) => {
            if (!dateValue) return '';
            const d = new Date(dateValue);
            return isNaN(d.getTime()) ? '' : d.toISOString().split('T')[0];
        };
        
        document.getElementById('edit-doc-date').value = formatDate(requestData.docDate);
        document.getElementById('edit-requester-name').value = requestData.requesterName || '';
        document.getElementById('edit-requester-position').value = requestData.requesterPosition || '';
        document.getElementById('edit-location').value = requestData.location || '';
        document.getElementById('edit-purpose').value = requestData.purpose || '';
        document.getElementById('edit-start-date').value = formatDate(requestData.startDate);
        document.getElementById('edit-end-date').value = formatDate(requestData.endDate);
        
        // --- 2. จัดการรายชื่อผู้ร่วมเดินทาง ---
        const attendeesListEl = document.getElementById('edit-attendees-list');
        if (attendeesListEl) attendeesListEl.innerHTML = ''; // ล้างข้อมูลเก่าก่อน

        let attendeesData = [];
        if (requestData.attendees) {
            // รองรับทั้ง Array และ JSON String
            attendeesData = Array.isArray(requestData.attendees) 
                ? requestData.attendees 
                : JSON.parse(requestData.attendees || '[]');
        }

        const requesterNameCheck = (requestData.requesterName || '').trim();

        // วนลูปสร้างฟิลด์รายชื่อ (ถ้าชื่อไม่ตรงกับผู้ขอ ให้แสดงออกมา)
        if (attendeesData.length > 0) {
            attendeesData.forEach(att => {
                const name = att.name || att['ชื่อ-นามสกุล'] || '';
                const position = att.position || att['ตำแหน่ง'] || '';
                
                if (name && name.trim() !== requesterNameCheck) {
                    // เรียกฟังก์ชันเพิ่มฟิลด์ (ต้องมีฟังก์ชัน addEditAttendeeField อยู่ในไฟล์แล้ว)
                    addEditAttendeeField(name, position);
                }
            });
        }
        
        // --- 3. จัดการข้อมูลค่าใช้จ่าย & ไฟล์แนบ (สำคัญ!) ---
        const radioNo = document.getElementById('edit-expense_no');
        const radioPartial = document.getElementById('edit-expense_partial');
        
        // Reset ค่า Checkbox และ Textbox ก่อน
        document.querySelectorAll('input[name="edit-expense_item"]').forEach(chk => chk.checked = false);
        if(document.getElementById('edit-expense_other_text')) document.getElementById('edit-expense_other_text').value = '';
        document.getElementById('edit-total-expense').value = '';

        // ตรวจสอบสถานะการเบิก
        const expenseOption = requestData.expenseOption;

        if (expenseOption === 'partial' || expenseOption === 'ขอเบิกเฉพาะค่าใช้จ่าย') {
            // กรณี: ขอเบิก
            if (radioPartial) radioPartial.checked = true;
            
            let expenseItems = requestData.expenseItems || [];
            if (typeof expenseItems === 'string') try { expenseItems = JSON.parse(expenseItems); } catch(e) {}
            
            if (Array.isArray(expenseItems)) {
                expenseItems.forEach(item => {
                    const itemName = item.name || item;
                    const checkbox = document.querySelector(`input[name="edit-expense_item"][data-item-name="${itemName}"]`);
                    if (checkbox) {
                        checkbox.checked = true;
                        if (itemName === 'ค่าใช้จ่ายอื่นๆ' && item.detail) {
                            document.getElementById('edit-expense_other_text').value = item.detail;
                        }
                    }
                });
            }
            document.getElementById('edit-total-expense').value = requestData.totalExpense || '';
            
        } else {
            // กรณี: ไม่ขอเบิก (หรืออื่นๆ)
            if (radioNo) radioNo.checked = true;
            
            // ★★★ แสดงลิงก์ไฟล์แนบเดิม (ถ้ามี) ★★★
            // ฟังก์ชันย่อยสำหรับจัดการลิงก์
            const setupLink = (url, containerId) => {
                const div = document.getElementById(containerId);
                if (!div) return;
                
                const a = div.querySelector('a');
                if (url && url.startsWith('http')) {
                    div.classList.remove('hidden'); // แสดงลิงก์
                    if(a) a.href = url;
                } else {
                    div.classList.add('hidden'); // ซ่อนลิงก์ถ้าไม่มีไฟล์เดิม
                }
            };
            
            // ดึงลิงก์จาก Field เก่ามาแสดง (ให้ตรงกับ HTML ที่เพิ่มไป)
            setupLink(requestData.fileExchangeUrl, 'link-existing-exchange');
            setupLink(requestData.fileRefDocUrl, 'link-existing-ref-doc');
            setupLink(requestData.fileOtherUrl, 'link-existing-other');
        }
        
        // เรียกฟังก์ชันเพื่อซ่อน/แสดง UI ตาม Radio ที่เลือก
        if (typeof toggleEditExpenseOptions === 'function') {
            toggleEditExpenseOptions(); 
        }
        
        // --- 4. จัดการข้อมูลพาหนะ ---
        const vehicleOption = requestData.vehicleOption || 'gov';
        const vehicleRadio = document.querySelector(`input[name="edit-vehicle_option"][value="${vehicleOption}"]`);
        if (vehicleRadio) vehicleRadio.checked = true;

        document.getElementById('edit-license-plate').value = requestData.licensePlate || '';
        
        const publicVehicleInput = document.getElementById('edit-public-vehicle-details'); 
        if (publicVehicleInput) {
            publicVehicleInput.value = requestData.publicVehicleDetails || '';
        }
        
        if (typeof toggleEditVehicleDetails === 'function') {
            toggleEditVehicleDetails();
        }

        // --- 5. ข้อมูลผู้ลงนาม ---
        const deptSelect = document.getElementById('edit-department');
        if (deptSelect) deptSelect.value = requestData.department || '';
        document.getElementById('edit-head-name').value = requestData.headName || '';

        // ★★★ เก็บข้อมูลเดิมไว้ในตัวแปร Global (สำคัญมากสำหรับการบันทึก) ★★★
        // เพื่อให้ฟังก์ชัน saveEditRequest รู้ว่าไฟล์เดิมคืออะไร หากผู้ใช้ไม่ได้อัปโหลดไฟล์ใหม่ทับ
        window.originalRequestDataForEdit = requestData;

        console.log("✅ เติมข้อมูลลงฟอร์มสำเร็จ");

    } catch (error) {
        console.error("❌ เกิดข้อผิดพลาดใน populateEditForm:", error);
        showAlert("ข้อผิดพลาด", "ไม่สามารถดึงข้อมูลลงแบบฟอร์มได้ครบถ้วน");
    }
}

// 2. ฟังก์ชันจัดการการนำเข้าไฟล์ Excel/CSV ในหน้าแก้ไข (เพิ่มใหม่)
async function handleEditExcelImport(e) {
    const file = e.target.files[0];
    if (!file) return;

    toggleLoader('edit-import-excel', true);
    try {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        jsonData.forEach(row => {
            const name = row['ชื่อ-นามสกุล'] || row['Name'];
            const pos = row['ตำแหน่ง'] || row['Position'];
            if (name) {
                addEditAttendeeField(name, pos); // เพิ่มฟิลด์รายชื่อลงหน้าแก้ไข
            }
        });
        showAlert('สำเร็จ', 'นำเข้าข้อมูลผู้ร่วมเดินทางเรียบร้อยแล้ว');
    } catch (error) {
        showAlert('ผิดพลาด', 'ไม่สามารถอ่านไฟล์ได้: ' + error.message);
    } finally {
        toggleLoader('edit-import-excel', false);
        e.target.value = ''; // ล้างค่าเพื่อให้เลือกไฟล์เดิมซ้ำได้
    }
}



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
        
        // 1. Reset ฟอร์มรอไว้ก่อน
        resetEditPage();
        
        let requestData = null;

        // ------------------------------------------------------------------
        // STEP 1: ลองดึงจาก Firebase (ข้อมูลสด/เร็ว)
        // ------------------------------------------------------------------
        if (typeof db !== 'undefined' && typeof USE_FIREBASE !== 'undefined' && USE_FIREBASE) {
            try {
                // แปลง ID ให้เป็น Format ของ Document (เช่น บค/ -> บค-)
                const docId = requestId.replace(/[\/\\\:\.]/g, '-');
                const docRef = db.collection('requests').doc(docId);
                const docSnap = await docRef.get();

                if (docSnap.exists) {
                    const fbData = docSnap.data();
                    
                    // แปลงรายชื่อให้เป็น Array ถ้ามันถูกเก็บเป็น String
                    let attendeesCheck = [];
                    if (fbData.attendees) {
                        if (Array.isArray(fbData.attendees)) {
                            attendeesCheck = fbData.attendees;
                        } else if (typeof fbData.attendees === 'string') {
                            try { attendeesCheck = JSON.parse(fbData.attendees); } catch (e) {}
                        }
                    }

                    // ★★★ จุดตัดสินใจสำคัญ ★★★
                    // ถ้าใน Firebase มีรายชื่อ > ใช้ข้อมูล Firebase
                    // ถ้าใน Firebase ไม่มีรายชื่อ (แต่ควรจะมี) > ถือว่าข้อมูลไม่ครบ ให้ข้ามไปดึงจาก Google Sheets
                    if (attendeesCheck && attendeesCheck.length > 0) {
                        console.log("✅ พบข้อมูลใน Firebase และมีรายชื่อครบถ้วน");
                        requestData = fbData;
                        // แปลงกลับเป็น Object สมบูรณ์ถ้าจำเป็น
                        requestData.attendees = attendeesCheck; 
                    } else {
                        console.warn("⚠️ พบข้อมูลใน Firebase แต่ 'ไม่มีรายชื่อ' -> จะทำการดึงใหม่จาก Google Sheets");
                        requestData = null; // บังคับให้เป็น null เพื่อให้เข้า Step 3
                    }
                }
            } catch (firebaseError) {
                console.warn("Firebase Error:", firebaseError);
            }
        }

        // ------------------------------------------------------------------
        // STEP 2: ลองดูใน Cache (ถ้า Firebase พลาด)
        // ------------------------------------------------------------------
        if (!requestData && typeof allRequestsCache !== 'undefined') {
            const cached = allRequestsCache.find(r => r.id === requestId || r.requestId === requestId);
            // เช็คเหมือนกัน ถ้า Cache ไม่มีรายชื่อ ก็อย่าเพิ่งใช้
            if (cached) {
                 // ตรวจสอบเบื้องต้น (อาจจะข้ามการตรวจสอบละเอียดเพื่อความเร็ว แต่ถ้าจะให้ชัวร์ก็เช็ค)
                 requestData = cached;
            }
        }

        // ------------------------------------------------------------------
        // STEP 3: ไม้ตายสุดท้าย -> ดึงจาก Google Sheets (Master Data)
        // ------------------------------------------------------------------
        if (!requestData || (requestData.attendees && requestData.attendees.length === 0)) {
            console.log("🔄 กำลังดึงข้อมูลต้นฉบับจาก Google Sheets (GAS)...");
            document.getElementById('edit-attendees-list').innerHTML = `
                <div class="text-center p-4"><div class="loader mx-auto"></div><p class="mt-2 text-blue-600">กำลังดึงรายชื่อจากฐานข้อมูลหลัก...</p></div>`;

            // เรียก API ไปที่ GAS เพื่อดึงข้อมูลแถวนั้นโดยเฉพาะ
            const result = await apiCall('GET', 'getDraftRequest', { 
                requestId: requestId, 
                username: user.username 
            });
            
            if (result.status === 'success' && result.data) {
                // รองรับโครงสร้างข้อมูลที่อาจซ้อนกัน
                requestData = result.data.data || result.data;
                console.log("✅ ได้รับข้อมูลจาก Google Sheets เรียบร้อย");
                
                // [แถม] อัปเดตข้อมูลที่ถูกต้องกลับลง Firebase ทันที เพื่อให้ครั้งหน้าเร็วขึ้น
                if (requestData && typeof db !== 'undefined') {
                    const docId = requestId.replace(/[\/\\\:\.]/g, '-');
                    // แปลงรายชื่อเป็น JSON String หรือ Array ตามที่ระบบคุณชอบ (แนะนำ Array สำหรับ Firebase)
                    let attendeesToSave = requestData.attendees || [];
                    if (typeof attendeesToSave === 'string') {
                        try { attendeesToSave = JSON.parse(attendeesToSave); } catch(e) { attendeesToSave = []; }
                    }
                    
                    db.collection('requests').doc(docId).set({
                        ...requestData,
                        attendees: attendeesToSave, // บันทึกรายชื่อที่ถูกต้องลงไป
                        lastSyncedWithSheet: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true }).catch(e => console.warn("Auto-sync error:", e));
                }
            }
        }

        // ------------------------------------------------------------------
        // STEP 4: นำข้อมูลใส่ฟอร์ม
        // ------------------------------------------------------------------
        if (requestData) {

            // ── Guard: เตือนถ้าเอกสารอยู่ในสายอนุมัติขั้นสูงแล้ว ─────────
            const advancedStatuses = ['waiting_admin_review', 'waiting_saraban', 'waiting_director', 'completed'];
            const currentDocStatus = requestData.docStatus || '';
            if (advancedStatuses.includes(currentDocStatus)) {
                const statusLabels = {
                    'waiting_admin_review': 'รออนุมัติจาก Admin',
                    'waiting_saraban':      'อยู่ระหว่างออกเลขสารบรรณ',
                    'waiting_director':     'รอลงนามโดยผู้อำนวยการ',
                    'completed':            'เสร็จสิ้นแล้ว'
                };
                const label = statusLabels[currentDocStatus] || currentDocStatus;
                const confirmed = confirm(
                    `⚠️ เอกสารนี้อยู่ในสถานะ "${label}"\n\n` +
                    `การแก้ไขจะรีเซ็ตสถานะกลับเป็น "ร่าง" และสายอนุมัติจะต้องเริ่มใหม่ตั้งแต่ต้น\n\n` +
                    `ต้องการแก้ไขต่อไปหรือไม่?`
                );
                if (!confirmed) return;
            }
            // ─────────────────────────────────────────────────────────────

            sessionStorage.setItem('currentEditRequestId', requestId);
            await populateEditForm(requestData);
            switchPage('edit-page');
        } else {
            showAlert("ไม่พบข้อมูล", "ไม่สามารถดึงข้อมูลคำขอนี้ได้ หรือข้อมูลถูกลบไปแล้ว");
            document.getElementById('edit-attendees-list').innerHTML = ''; // ล้าง Loader
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

// --- นำไปทับฟังก์ชัน toggleEditExpenseOptions เดิม ---
function toggleEditExpenseOptions() {
    const partialOptions = document.getElementById('edit-partial-expense-options');
    const totalContainer = document.getElementById('edit-total-expense-container');
    const attachmentContainer = document.getElementById('edit-non-reimburse-attachments'); // กล่องใหม่

    const isPartial = document.getElementById('edit-expense_partial')?.checked;
    const isNoExpense = document.getElementById('edit-expense_no')?.checked;

    if (isPartial) {
        partialOptions.classList.remove('hidden');
        totalContainer.classList.remove('hidden');
        if (attachmentContainer) attachmentContainer.classList.add('hidden');
    } else {
        partialOptions.classList.add('hidden');
        totalContainer.classList.add('hidden');
        
        // ถ้าเลือก "ไม่เบิก" ให้โชว์กล่องแนบไฟล์
        if (isNoExpense && attachmentContainer) {
            attachmentContainer.classList.remove('hidden');
        } else if (attachmentContainer) {
            attachmentContainer.classList.add('hidden');
        }
        
        document.querySelectorAll('input[name="edit-expense_item"]').forEach(chk => { chk.checked = false; });
        if(document.getElementById('edit-expense_other_text')) document.getElementById('edit-expense_other_text').value = '';
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
async function generateDocumentFromDraft() {
    const btn = document.getElementById('generate-document-button');
    const btnText = document.getElementById('generate-doc-button-text');
    const loader = document.getElementById('generate-doc-loader');

    const setBtnStatus = (msg, loading = true) => {
        if (btn) btn.disabled = loading;
        if (loader) loader.classList.toggle('hidden', !loading);
        if (btnText) btnText.textContent = msg;
    };

    try {
        // Step 1: ตรวจสอบและดึงข้อมูลฟอร์ม
        setBtnStatus('กำลังตรวจสอบข้อมูล...', true);
        const formData = getEditFormData();
        if (!validateEditForm(formData)) throw new Error("ข้อมูลไม่ครบถ้วน");

        formData.attachmentUrls = [];
        formData.doctype = 'memo';

        // Step 2: สร้าง PDF
        setBtnStatus('กำลังสร้างเอกสาร...', true);
        const { pdfBlob } = await generateOfficialPDF(formData);

        // Step 3: เตรียมลายเซ็น (ใหม่จาก pad > เดิมจาก cache)
        let signatureBase64 = null;
        if (typeof editSignaturePad !== 'undefined' && editSignaturePad && !editSignaturePad.isEmpty()) {
            signatureBase64 = editSignaturePad.toDataURL('image/png');
        } else if (formData.signatureBase64) {
            signatureBase64 = formData.signatureBase64;
        }

        // Step 4: วางลายเซ็นบน PDF (ถ้ามี)
        let finalBlob = pdfBlob;
        if (signatureBase64) {
            setBtnStatus('กรุณาเลือกตำแหน่งลายเซ็นในเอกสาร...', true);
            finalBlob = await promptForSignature(pdfBlob, signatureBase64);
        }

        // Step 5: อัปโหลดไฟล์ขึ้น Drive
        setBtnStatus('กำลังอัปโหลดไฟล์...', true);
        const finalBase64 = await blobToBase64(finalBlob);
        const safeId = formData.requestId.replace(/[\/\\\:\.\s]/g, '-');
        const filename = `memo_EDIT_${safeId}_${Date.now()}.pdf`;

        const uploadRes = await apiCall('POST', 'uploadGeneratedFile', {
            data: finalBase64,
            filename: filename,
            mimeType: 'application/pdf',
            username: formData.username
        });

        if (uploadRes.status !== 'success') throw new Error('อัปโหลดไฟล์ไม่สำเร็จ: ' + (uploadRes.message || ''));
        const newFileUrl = uploadRes.url;
        console.log('✅ Edit PDF URL:', newFileUrl);

        // Step 6: บันทึกข้อมูลลง Firestore
        setBtnStatus('กำลังบันทึกข้อมูล...', true);
        formData.fileUrl = newFileUrl;
        formData.pdfUrl = newFileUrl;
        formData.memoPdfUrl = newFileUrl;
        if (signatureBase64) formData.signatureBase64 = signatureBase64;

        if (typeof db !== 'undefined') {
            const firestoreUpdate = {
                fileUrl: newFileUrl,
                pdfUrl: newFileUrl,
                memoPdfUrl: newFileUrl,
                docStatus: 'draft',  // รีเซ็ตสายอนุมัติ เพื่อให้ผู้ขออนุมัติใหม่ตั้งแต่ต้น
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            };
            if (signatureBase64) firestoreUpdate.signatureBase64 = signatureBase64;
            await db.collection('requests').doc(safeId).set(firestoreUpdate, { merge: true });
        }

        // Step 7: อัปเดต Sheet (background — ไม่บล็อก UI)
        apiCall('POST', 'updateRequest', formData).catch(e => console.warn('⚠️ Sheet update warn:', e));

        // Step 8: เสร็จสิ้น
        setBtnStatus('✅ บันทึกสำเร็จ', false);
        showAlert('✅ สำเร็จ', 'บันทึกและสร้างเอกสารเรียบร้อยแล้ว');
        if (newFileUrl) window.open(newFileUrl, '_blank');
        if (typeof clearRequestsCache === 'function') clearRequestsCache();
        if (typeof fetchUserRequests === 'function') await fetchUserRequests();
        switchPage('dashboard-page');

    } catch (error) {
        if (error.message === 'USER_CANCEL') {
            // ผู้ใช้กด "ยกเลิก" ใน modal วางลายเซ็น — ไม่ต้องแสดง error
            setBtnStatus('บันทึกและสร้างเอกสาร', false);
            return;
        }
        console.error('generateDocumentFromDraft Error:', error);
        showAlert('ข้อผิดพลาด', error.message);
        setBtnStatus('บันทึกและสร้างเอกสาร', false);
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
    // ดึง ID ของกล่องต่างๆ มาเก็บไว้ในตัวแปร
    const partialOptions = document.getElementById('partial-expense-options');
    const totalContainer = document.getElementById('total-expense-container');
    const attachmentContainer = document.getElementById('non-reimburse-attachments'); // เพิ่มตัวแปรสำหรับกล่องแนบไฟล์

    // ตรวจสอบว่าเลือก "ขอเบิก" อยู่หรือไม่
    const isPartial = document.getElementById('expense_partial').checked;

    if (isPartial) {
        // กรณี: เลือกขอเบิก
        partialOptions.classList.remove('hidden');     // แสดงรายการค่าใช้จ่าย
        totalContainer.classList.remove('hidden');     // แสดงช่องรวมเงิน
        if (attachmentContainer) {
            attachmentContainer.classList.add('hidden'); // ซ่อนกล่องแนบไฟล์
        }
    } else {
        // กรณี: เลือกไม่ขอเบิก
        partialOptions.classList.add('hidden');        // ซ่อนรายการค่าใช้จ่าย
        totalContainer.classList.add('hidden');        // ซ่อนช่องรวมเงิน
        if (attachmentContainer) {
            attachmentContainer.classList.remove('hidden'); // แสดงกล่องแนบไฟล์
        }
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
/**
 * ฟังก์ชันดึงข้อมูลจากฟอร์มบันทึกข้อความ (Matching index.html IDs)
 */
function getRequestFormData() {
    // 1. ดึงรายชื่อผู้ร่วมเดินทางจากรายการที่เพิ่ม
    const attendees = [];
    document.querySelectorAll('#form-attendees-list > div').forEach(div => {
        const nameInput = div.querySelector('.attendee-name');
        const select = div.querySelector('.attendee-position-select');
        const otherInput = div.querySelector('.attendee-position-other');
        
        if (nameInput && nameInput.value.trim()) {
            let position = select ? select.value : '';
            if (position === 'other' && otherInput) {
                position = otherInput.value.trim();
            }
            // เพิ่มเฉพาะคนที่มีทั้งชื่อและตำแหน่ง
            if (nameInput.value.trim()) {
                attendees.push({ name: nameInput.value.trim(), position: position });
            }
        }
    });

    // 2. จัดการข้อมูลค่าใช้จ่าย
    const expenseOption = document.querySelector('input[name="expense_option"]:checked')?.value || 'no';
    let expenseItems = [];
    
    if (expenseOption === 'partial') {
        document.querySelectorAll('input[name="expense_item"]:checked').forEach(cb => {
            let item = { name: cb.getAttribute('data-item-name') || cb.value };
            // กรณีเลือก "ค่าใช้จ่ายอื่นๆ" ให้ดึงรายละเอียด text box มาด้วย
            if (item.name === 'ค่าใช้จ่ายอื่นๆ') {
                const otherText = document.getElementById('expense_other_text')?.value.trim();
                item.detail = otherText;
            }
            expenseItems.push(item);
        });
    }

    // 3. จัดการข้อมูลพาหนะ (เลือกได้หลายตัว แต่ในโค้ดเดิมรองรับตัวเดียว ให้เอาตัวแรกที่เลือก หรือ logic ตามต้องการ)
    // หมายเหตุ: ใน HTML เป็น checkbox name="vehicle_option" อาจเลือกได้หลายตัว แต่ API มักรับค่าเดียว
    // ปรับให้ดึงตัวล่าสุดหรือตัวที่ check
    const vehicleChecked = document.querySelector('input[name="vehicle_option"]:checked');
    const vehicleOption = vehicleChecked ? vehicleChecked.value : 'gov';
    // --- ส่วนที่เพิ่ม: จัดการจังหวัด ---
    let province = document.getElementById('form-province')?.value || 'สระแก้ว';
    if (province === 'other') {
        province = document.getElementById('form-province-other')?.value.trim() || 'อื่นๆ';
    }

    // 4. รวบรวมข้อมูลทั้งหมดเป็น Object
    return {
        docDate: document.getElementById('form-doc-date')?.value || '',
        requesterName: document.getElementById('form-requester-name')?.value.trim(),
        requesterPosition: document.getElementById('form-requester-position')?.value.trim(),
        location: document.getElementById('form-location')?.value.trim(),
       // เพิ่มฟิลด์จังหวัดและที่พัก
        province: document.getElementById('form-province')?.value,
        stayAt: document.getElementById('form-stay-at')?.value.trim(),
        // ข้อมูลยานพาหนะ (สำหรับหนังสือส่ง) - เพิ่มใหม่
        dispatchVehicleType: document.getElementById('form-dispatch-vehicle-type')?.value.trim(),
        dispatchVehicleId: document.getElementById('form-dispatch-vehicle-id')?.value.trim(),

        purpose: document.getElementById('form-purpose')?.value.trim(),
        startDate: document.getElementById('form-start-date')?.value,
        endDate: document.getElementById('form-end-date')?.value,
        
        // เพิ่มเวลา (ถ้ามีใน HTML แล้ว)
        startTime: document.getElementById('form-start-time')?.value || '06:00',
        endTime: document.getElementById('form-end-time')?.value || '18:00',
        
        attendees: attendees,
        
        expenseOption: expenseOption,
        expenseItems: expenseItems,
        totalExpense: document.getElementById('form-total-expense')?.value || 0,
        
        
        vehicleOption: document.querySelector('input[name="vehicle_option"]:checked')?.value || 'gov',
        licensePlate: document.getElementById('form-license-plate')?.value || '',
        publicVehicleDetails: document.getElementById('public-vehicle-details-input')?.value || '', 
        
        department: document.getElementById('form-department')?.value,
        headName: document.getElementById('form-head-name')?.value
    };
}

// =========================================================
// ฟังก์ชันช่วยเหลือ: แสดงหน้าต่างให้ผู้ใช้จิ้มลายเซ็นบน PDF
// =========================================================
function promptForSignature(pdfBlob, signatureBase64) {
    return new Promise(async (resolve, reject) => {

        const RENDER_SCALE = 1.5; // ความละเอียด pdfjs (ไม่เปลี่ยน)

        // ── helper: ปิด modal + ล้าง state ─────────────────────────────
        const cleanup = () => {
            window.cancelSignaturePlacement = null;
            window.skipSignaturePlacement = null;
            const modal = document.getElementById('requester-stamper-modal');
            if (modal) modal.style.display = 'none';
            const pages = document.getElementById('requester-pdf-pages');
            if (pages) pages.innerHTML = '';
        };

        // ── ยกเลิก: กลับไปแก้ไขใหม่ ────────────────────────────────
        window.cancelSignaturePlacement = () => { cleanup(); reject(new Error('USER_CANCEL')); };

        // ── ข้าม: บันทึกโดยไม่วางลายเซ็น ───────────────────────────
        window.skipSignaturePlacement = () => { cleanup(); resolve(pdfBlob); };

        try {
            const modal = document.getElementById('requester-stamper-modal');
            modal.classList.remove('hidden');
            modal.style.display = 'flex';

            const pagesContainer = document.getElementById('requester-pdf-pages');
            pagesContainer.innerHTML =
                '<p class="py-8 text-gray-500 text-sm animate-pulse">⏳ กำลังโหลดเอกสาร...</p>';

            // โหลด PDF ด้วย pdfjs
            const arrayBuffer = await pdfBlob.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
            const numPages = pdf.numPages;

            pagesContainer.innerHTML = ''; // ล้าง loading text

            // ── วนแสดงทุกหน้า ────────────────────────────────────────
            for (let pageNum = 1; pageNum <= numPages; pageNum++) {

                // label บอกเลขหน้า
                const label = document.createElement('div');
                label.className = 'text-xs text-gray-500 font-medium self-start ml-1';
                label.textContent = `หน้า ${pageNum} / ${numPages}`;
                pagesContainer.appendChild(label);

                // สร้าง canvas สำหรับหน้านี้
                const canvas = document.createElement('canvas');
                canvas.className = 'cursor-crosshair border border-gray-300 shadow bg-white block';
                canvas.style.maxWidth = '100%';     // ไม่ยืดเกินกรอบ
                canvas.style.height = 'auto';        // สัดส่วนถูกต้องเสมอ
                canvas.dataset.pageNum = String(pageNum);
                pagesContainer.appendChild(canvas);

                // Render หน้านี้ลง canvas (ขนาด native pixels = viewport * RENDER_SCALE)
                const page = await pdf.getPage(pageNum);
                const viewport = page.getViewport({ scale: RENDER_SCALE });
                canvas.width  = Math.floor(viewport.width);
                canvas.height = Math.floor(viewport.height);
                await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

                // ── click handler: วางลายเซ็นบนหน้านี้ ─────────────
                canvas.addEventListener('click', async function handler(e) {
                    canvas.removeEventListener('click', handler); // รับ 1 ครั้งพอ
                    try {
                        // ── แปลงพิกัดคลิก CSS → พิกัด PDF ────────────────────
                        // getBoundingClientRect() ให้ขนาด CSS ที่แสดงจริง
                        // canvas.width/height คือ native pixel (อาจต่างกันถ้า max-width ลดขนาด)
                        const cssRect = this.getBoundingClientRect();
                        const cssX = e.clientX - cssRect.left;
                        const cssY = e.clientY - cssRect.top;

                        // ratio แปลง CSS px → native canvas px
                        const ratioX = this.width  / cssRect.width;
                        const ratioY = this.height / cssRect.height;

                        const nativePxX = cssX * ratioX;
                        const nativePxY = cssY * ratioY;

                        // PDF coordinates (Y เริ่มจากล่าง)
                        const pdfX = nativePxX / RENDER_SCALE;
                        const pdfY = (this.height - nativePxY) / RENDER_SCALE;

                        cleanup();

                        // ── วาดลายเซ็นลง PDF ด้วย pdf-lib ───────────────────
                        const pageIndex = parseInt(this.dataset.pageNum, 10) - 1;
                        const pdfBytes  = await pdfBlob.arrayBuffer();
                        const pdfDoc    = await PDFLib.PDFDocument.load(pdfBytes);
                        const pdfPage   = pdfDoc.getPages()[pageIndex];

                        // ตัด data: prefix ออก (รองรับทั้ง 2 format)
                        const base64Data = signatureBase64.replace(/^data:image\/\w+;base64,/, '');
                        const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
                        const sigImage   = await pdfDoc.embedPng(imageBytes);

                        const sigW = 100, sigH = 40;
                        pdfPage.drawImage(sigImage, {
                            x: pdfX - sigW / 2,
                            y: pdfY - sigH / 2,
                            width:  sigW,
                            height: sigH
                        });

                        const modifiedBytes = await pdfDoc.save();
                        resolve(new Blob([modifiedBytes], { type: 'application/pdf' }));

                    } catch (err) { reject(err); }
                });
            }

        } catch (err) {
            cleanup();
            reject(err);
        }
    });
}

// =========================================================
// ฟังก์ชันหลัก: ส่งคำขอไปราชการ (รองรับ Create, Edit, Tap-to-Sign)
// =========================================================
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
async function handleRequestFormSubmit(e) {
    e.preventDefault();
    
    const submitBtn = document.getElementById('submit-request-button');
    const setBtnStatus = (msg) => {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = `<span class="loader-sm"></span> ${msg}`;
        }
    };

    try {
        const formData = getRequestFormData();
        if (!validateRequestForm(formData)) throw new Error("กรุณากรอกข้อมูลให้ครบถ้วน");

        const user = getCurrentUser();
        if (!user) throw new Error("ไม่พบข้อมูลผู้ใช้งาน (กรุณา Login ใหม่)");
        formData.username = user.username; 

        // --- เพิ่มเติม: ตรวจสอบว่าเป็นโหมดแก้ไข (Edit) หรือสร้างใหม่ (Create) ---
        const editRequestId = document.getElementById('request-id')?.value;
        const isEdit = editRequestId ? true : false;
        let realId = editRequestId; // ถ้าเป็นการแก้ ให้ใช้ ID เดิมเลย

        // --- เพิ่มเติม: ดึงข้อมูลลายเซ็นจากกระดาน ---
        let signatureBase64 = null;
        if (typeof requesterSignaturePad !== 'undefined' && !requesterSignaturePad.isEmpty()) {
            signatureBase64 = requesterSignaturePad.toDataURL("image/png"); 
        }
        formData.signatureBase64 = signatureBase64;

        const targetDocStatus = mapDepartmentToStatus(formData.department);
        formData.status = 'Pending'; 
        formData.docStatus = targetDocStatus; 

        // --- Step 1: ขอเลขที่เอกสาร (เฉพาะสร้างใหม่เท่านั้น) ---
        if (!isEdit) {
            setBtnStatus('กำลังขอเลขที่เอกสาร...');
            const createPayload = { ...formData, preGeneratedPdfUrl: 'SKIP_GENERATION' };
            const createResult = await apiCall('POST', 'createRequest', createPayload);
            
            if (createResult.status !== 'success') throw new Error(createResult.message || "ไม่สามารถขอเลขที่เอกสารได้");
            realId = createResult.id || createResult.data?.id;
            if (!realId) throw new Error("Server ไม่ได้ส่งเลขที่เอกสารกลับมา");
            console.log("✅ ได้รับเลขที่:", realId);
        }

        // --- Step 2: สร้าง PDF จาก Cloud Run ---
        setBtnStatus('กำลังสร้างไฟล์ PDF...');
        const pdfData = { ...formData, id: realId, requestId: realId, doctype: 'memo' };
        
        // รับ PDF ต้นฉบับมาจาก Cloud Run
        let { pdfBlob } = await generateOfficialPDF(pdfData);

        // --- Step 2.5: ประทับลายเซ็น (Tap-to-Sign) ---
        if (signatureBase64) {
            setBtnStatus('รอการประทับลายเซ็น...');
            document.getElementById('alert-modal').style.display = 'none'; // ซ่อนโหลดดิ้งชั่วคราว
            
            // เรียก Modal ขึ้นมาและหยุดรอ (await) จนกว่าผู้ใช้จะจิ้มหน้าจอเสร็จ
            pdfBlob = await promptForSignature(pdfBlob, signatureBase64);
            
            // จิ้มเสร็จแล้ว แสดงโหลดดิ้งต่อ
            showAlert('กำลังดำเนินการ', 'กำลังบันทึกข้อมูล... กรุณารอสักครู่', false);
        }

        // --- Step 3: อัปโหลดไฟล์ไป Google Drive ---
        setBtnStatus('กำลังบันทึกไฟล์...');
        const finalBase64 = await blobToBase64(pdfBlob);
        const safeIdForFile = realId.replace(/[\/\\\:\.\s]/g, '-'); 
        const safeFilename = `memo_${safeIdForFile}.pdf`;

        const uploadRes = await apiCall('POST', 'uploadGeneratedFile', {
            data: finalBase64,
            filename: safeFilename,
            mimeType: 'application/pdf',
            username: user.username,
            requestId: realId
        });

        if (uploadRes.status !== 'success') throw new Error("อัปโหลดไม่สำเร็จ: " + uploadRes.message);
        const finalFileUrl = uploadRes.url;

        // --- Step 4: อัปเดตข้อมูลกลับฐานข้อมูล ---
        // ไม่ว่าจะ Create หรือ Edit ตรงนี้ใช้ updateRequest ได้เลยเพราะมีแถวข้อมูลใน Sheet/Firebase แล้ว
        setBtnStatus('กำลังปรับปรุงฐานข้อมูล...');

        const updatePayload = {
            requestId: realId,
            fileUrl: finalFileUrl,      
            pdfUrl: finalFileUrl,
            memoPdfUrl: finalFileUrl, 
            status: 'Pending' // รีเซ็ตสถานะกลับเป็น Pending กรณีโดนตีกลับมาแก้
        };

        // 4.1 อัปเดต Google Sheet
        await apiCall('POST', 'updateRequest', updatePayload);

        // 4.2 อัปเดต Firebase (ใช้ merge เพื่อไม่ให้ข้อมูลอื่นหาย)
        if (typeof db !== 'undefined') {
            const docId = realId.replace(/[\/\\\:\.]/g, '-');
            await db.collection('requests').doc(docId).set({
                ...formData, 
                ...updatePayload,
                id: realId,
                timestamp: firebase.firestore.FieldValue.serverTimestamp() // ควรอัปเดตเวลาล่าสุดเสมอ
            }, { merge: true });
        }

        document.getElementById('alert-modal').style.display = 'none';

        resetRequestForm();
        if (typeof requesterSignaturePad !== 'undefined' && requesterSignaturePad) requesterSignaturePad.clear();

        if (typeof clearRequestsCache === 'function') clearRequestsCache();
        await fetchUserRequests();

        // แสดงหน้าผลลัพธ์เพื่อให้ผู้ใช้สามารถลงนามหลังสร้างเอกสาร
        const resultTitle = isEdit ? 'แก้ไขเอกสารเรียบร้อย' : 'สร้างเอกสารเรียบร้อย';
        const resultMessage = `เลขที่เอกสาร: ${realId}`;
        if (typeof showFormResult === 'function') {
            showFormResult(resultTitle, resultMessage, finalFileUrl, realId);
        } else {
            if (finalFileUrl) window.open(finalFileUrl, '_blank');
            showAlert("สำเร็จ", isEdit ? `แก้ไขเอกสารเลขที่ ${realId} เรียบร้อยแล้ว` : `สร้างเอกสารเลขที่ ${realId} เรียบร้อยแล้ว`);
            switchPage('dashboard-page');
        }

    } catch (error) {
        console.error("Submit Error:", error);
        document.getElementById('alert-modal').style.display = 'none';
        showAlert("ข้อผิดพลาด", error.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = 'ส่งบันทึกขอไปราชการ';
        }
    }
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
    monday.setDate(now.getDate() - daysToMonday); 
    monday.setHours(0, 0, 0, 0);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6); 
    sunday.setHours(23, 59, 59, 999);
    
    const dateOptions = { day: 'numeric', month: 'short', year: '2-digit' };
    document.getElementById('current-week-display').textContent = `${monday.toLocaleDateString('th-TH', dateOptions)} - ${sunday.toLocaleDateString('th-TH', dateOptions)}`;
    
    const weeklyRequests = requests.filter(req => {
        if (!req.startDate || !req.endDate) return false;
        const reqStart = new Date(req.startDate); 
        const reqEnd = new Date(req.endDate);
        reqStart.setHours(0,0,0,0); 
        reqEnd.setHours(0,0,0,0);
        return (reqStart <= sunday && reqEnd >= monday);
    }).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    
    currentPublicWeeklyData = weeklyRequests;
    
    if (weeklyRequests.length === 0) { 
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-10 text-gray-500">ไม่มีรายการไปราชการในสัปดาห์นี้</td></tr>`; 
        return; 
    }
    
    tbody.innerHTML = weeklyRequests.map((req, index) => {
        // --- ส่วนที่แก้ไข: ตรรกะการนับจำนวนคนรวม ---
        let attendeesList = [];
        try {
            attendeesList = typeof req.attendees === 'string' ? JSON.parse(req.attendees) : (req.attendees || []);
        } catch (e) { 
            attendeesList = []; 
        }

        const requesterName = (req.requesterName || "").trim().replace(/\s+/g, ' ');
        // เช็คว่าใน Array รายชื่อมีชื่อผู้ขอรวมอยู่ด้วยหรือยัง
        const hasRequesterInList = attendeesList.some(att => (att.name || "").trim().replace(/\s+/g, ' ') === requesterName);
        
        // คำนวณจำนวนคนจริง (ถ้ามีชื่อผู้ขอในลิสต์แล้ว ไม่ต้อง +1 เพิ่ม)
        const totalCount = (attendeesList.length > 0) ? (hasRequesterInList ? attendeesList.length : attendeesList.length + 1) : (req.attendeeCount ? (parseInt(req.attendeeCount) + 1) : 1);
        
        let attendeesText = "";
        if (totalCount > 1) { 
            attendeesText = `<div class="text-xs text-indigo-500 mt-1 cursor-pointer hover:underline" onclick="openPublicAttendeeModal(${index})">👥 และคณะรวม ${totalCount} คน</div>`; 
        }
        
        const dateText = `${formatDisplayDate(req.startDate)} - ${formatDisplayDate(req.endDate)}`;
        
        const finalCommandUrl = req.completedCommandUrl; 
        let actionHtml = '';
        
        if (finalCommandUrl && finalCommandUrl.trim() !== "") {
            actionHtml = `<a href="${finalCommandUrl}" target="_blank" class="btn bg-green-600 hover:bg-green-700 text-white btn-sm shadow-md transition-transform hover:scale-105 inline-flex items-center gap-1">ดูคำสั่ง</a>`;
        } else {
            let displayStatus = req.realStatus || req.status;
            let badgeClass = 'bg-gray-100 text-gray-600'; 
            let icon = '🔄';
            
            if (displayStatus === 'Pending' || displayStatus === 'กำลังดำเนินการ') { 
                badgeClass = 'bg-yellow-100 text-yellow-700 border border-yellow-200'; icon = '⏳'; 
            } else if (displayStatus && displayStatus.includes('แก้ไข')) { 
                badgeClass = 'bg-red-100 text-red-700 border border-red-200'; icon = '⚠️'; 
            } else if (displayStatus === 'เสร็จสิ้นรอออกคำสั่งไปราชการ') { 
                badgeClass = 'bg-blue-50 text-blue-600 border border-blue-100'; icon = '📝'; displayStatus = 'รอออกคำสั่ง'; 
            } else if (displayStatus === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' || displayStatus === 'เสร็จสิ้น') { 
                badgeClass = 'bg-green-100 text-green-700 border border-green-200'; icon = '✅'; displayStatus = 'เสร็จสิ้น'; 
            }
            actionHtml = `<span class="${badgeClass} px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap">${icon} ${translateStatus(displayStatus)}</span>`;
        }
        
        return `
        <tr class="border-b hover:bg-gray-50 transition">
            <td class="px-6 py-4 whitespace-nowrap font-medium text-indigo-600" data-label="วัน-เวลา">${dateText}</td>
            <td class="px-6 py-4" data-label="ชื่อผู้ขอ">
                <div class="font-bold text-gray-800">${escapeHtml(req.requesterName)}</div>
                <div class="text-xs text-gray-500">${escapeHtml(req.requesterPosition || '')}</div>
            </td>
            <td class="px-6 py-4" data-label="เรื่อง / สถานที่">
                <div class="font-medium text-gray-900 truncate max-w-xs" title="${escapeHtml(req.purpose)}">${escapeHtml(req.purpose)}</div>
                <div class="text-xs text-gray-500">ณ ${escapeHtml(req.location)}</div>
                ${attendeesText}
            </td>
            <td class="px-6 py-4 text-center align-middle" data-label="ไฟล์คำสั่ง">${actionHtml}</td>
        </tr>`;
    }).join('');
}

function openPublicAttendeeModal(index) {
    const req = currentPublicWeeklyData[index]; 
    if (!req) return;

    document.getElementById('public-modal-purpose').textContent = req.purpose;
    document.getElementById('public-modal-location').textContent = req.location;
    
    const startD = new Date(req.startDate); 
    const endD = new Date(req.endDate);
    let dateText = formatDisplayDate(req.startDate); 
    if (startD.getTime() !== endD.getTime()) { 
        dateText += ` ถึง ${formatDisplayDate(req.endDate)}`; 
    }
    document.getElementById('public-modal-date').textContent = dateText;
    
    const listBody = document.getElementById('public-modal-attendee-list');
    let html = ''; 
    let rowCount = 1;

    // --- ส่วนที่แก้ไข: จัดการรายชื่อเพื่อไม่ให้ผู้ขอซ้ำ ---
    const requesterName = (req.requesterName || "").trim().replace(/\s+/g, ' ');
    const requesterPos = (req.requesterPosition || "").trim();

    let attendeesList = [];
    if (typeof req.attendees === 'string') { 
        try { attendeesList = JSON.parse(req.attendees); } catch (e) { attendeesList = []; } 
    } else if (Array.isArray(req.attendees)) { 
        attendeesList = req.attendees; 
    }

    // กรองลิสต์คนอื่นๆ โดยเอาชื่อผู้ขอออก (ถ้ามี) เพื่อนำไปวางต่อท้ายลำดับที่ 1
    const others = attendeesList.filter(att => {
        const attName = (att.name || "").trim().replace(/\s+/g, ' ');
        return attName !== "" && attName !== requesterName;
    });

    // 1. แสดงผู้ขอเป็นลำดับแรกเสมอ (ลำดับที่ 1)
    html += `
        <tr class="bg-blue-50/50">
            <td class="px-4 py-2 font-bold text-center">${rowCount++}</td>
            <td class="px-4 py-2 font-bold text-blue-800">${escapeHtml(requesterName)} (ผู้ขอ)</td>
            <td class="px-4 py-2 text-gray-600">${escapeHtml(requesterPos)}</td>
        </tr>`;

    // 2. แสดงผู้ร่วมเดินทางคนอื่นๆ ต่อจากผู้ขอ
    if (others.length > 0) {
        others.forEach(att => { 
            html += `
                <tr class="border-t">
                    <td class="px-4 py-2 text-center text-gray-500">${rowCount++}</td>
                    <td class="px-4 py-2 text-gray-800">${escapeHtml(att.name)}</td>
                    <td class="px-4 py-2 text-gray-600">${escapeHtml(att.position)}</td>
                </tr>`; 
        }); 
    }
    
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


// ฟังก์ชันบันทึกการแก้ไข (พร้อม Backup ลง Firebase เพื่อกันข้อมูลรายชื่อหาย)
// ==========================================
// 📦 ส่วนจัดการไฟล์แนบในหน้าแก้ไข (Edit Page Attachments)
// ==========================================

// 1. ประกาศตัวแปร Global ไว้เก็บรายการไฟล์ปัจจุบัน
let currentEditAttachments = [];

// 2. ฟังก์ชันแสดงรายการไฟล์ (Render UI)
function renderEditAttachments() {
    const container = document.getElementById('edit-existing-attachments-container');
    const list = document.getElementById('edit-existing-attachments-list');
    
    if (!container || !list) return;

    list.innerHTML = ''; // ล้างรายการเก่า

    if (currentEditAttachments && currentEditAttachments.length > 0) {
        container.classList.remove('hidden');
        
        currentEditAttachments.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'flex items-center justify-between bg-white p-3 rounded border border-gray-200 shadow-sm mb-2';
            
            // ตรวจสอบชื่อไฟล์และลิงก์
            const fileName = file.name || file.filename || 'เอกสารแนบ';
            const fileUrl = file.url || file.link || '#';

            item.innerHTML = `
                <div class="flex items-center overflow-hidden">
                    <span class="text-red-500 mr-3 text-xl">📄</span>
                    <div class="flex flex-col">
                        <a href="${fileUrl}" target="_blank" class="text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline truncate max-w-[200px] sm:max-w-xs">
                            ${fileName}
                        </a>
                        <span class="text-xs text-gray-400">${file.type || 'เอกสารเดิม'}</span>
                    </div>
                </div>
                <button type="button" onclick="removeEditAttachment(${index})" class="text-gray-400 hover:text-red-500 transition p-2 rounded-full hover:bg-red-50" title="ลบไฟล์นี้">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            `;
            list.appendChild(item);
        });
    } else {
        container.classList.add('hidden');
    }
}

// 3. ฟังก์ชันลบไฟล์ออกจากรายการ (ลบแค่ในตัวแปร ยังไม่บันทึก)
window.removeEditAttachment = function(index) {
    if (confirm('ต้องการนำไฟล์แนบนี้ออกใช่หรือไม่? (ต้องกดบันทึกการแก้ไข ผลจึงจะมีผลถาวร)')) {
        currentEditAttachments.splice(index, 1);
        renderEditAttachments();
    }
};

// ==========================================
// 🛠️ ปรับปรุงฟังก์ชันหลัก (Override Functions)
// ==========================================

// 4. แก้ไข populateEditForm ให้ดึงไฟล์เก่ามาใส่ตัวแปร
// (ให้เอาฟังก์ชันนี้ไปทับ populateEditForm เดิม หรือแก้ไขส่วนที่เกี่ยวข้อง)
const originalPopulateEditForm = populateEditForm; // เก็บตัวเก่าไว้ถ้ามี

populateEditForm = async function(requestData) {
    // เรียกใช้ Logic เดิมก่อนเพื่อเติม Text Input
    if (typeof originalPopulateEditForm === 'function') {
        await originalPopulateEditForm(requestData);
    }

    console.log("📂 Loading attachments for edit...");
    currentEditAttachments = []; // Reset

    // A. ดึงจาก Array attachments (ถ้ามี)
    if (requestData.attachments && Array.isArray(requestData.attachments)) {
        // กรองเอาเฉพาะ Object ที่มี url (กันข้อมูลขยะที่เป็น String รายชื่อคน)
        const files = requestData.attachments.filter(item => item.url && item.name);
        currentEditAttachments.push(...files);
    }

    // B. ดึงจาก Field เก่า (Legacy Support)
    if (requestData.fileExchangeUrl) currentEditAttachments.push({ name: 'ไฟล์แลกคาบสอน (เดิม)', url: requestData.fileExchangeUrl, type: 'legacy' });
    if (requestData.fileRefDocUrl) currentEditAttachments.push({ name: 'หนังสือราชการ (เดิม)', url: requestData.fileRefDocUrl, type: 'legacy' });
    if (requestData.fileOtherUrl) currentEditAttachments.push({ name: 'เอกสารอื่นๆ (เดิม)', url: requestData.fileOtherUrl, type: 'legacy' });
    if (requestData.fileUrl) currentEditAttachments.push({ name: 'เอกสารแนบ (เดิม)', url: requestData.fileUrl, type: 'legacy' });

    // กำจัดไฟล์ซ้ำ (Unique by URL)
    currentEditAttachments = currentEditAttachments.filter((v, i, a) => a.findIndex(t => (t.url === v.url)) === i);

    // แสดงผล
    renderEditAttachments();

    // แสดงลายเซ็นเดิม (ถ้ามี)
    const existingPreview = document.getElementById('edit-existing-sig-preview');
    const existingImg = document.getElementById('edit-existing-sig-img');
    if (existingPreview && existingImg) {
        if (requestData.signatureBase64) {
            existingImg.src = requestData.signatureBase64;
            existingPreview.classList.remove('hidden');
        } else {
            existingPreview.classList.add('hidden');
        }
    }

    // Reset และ initialize signature pad (delay เพื่อให้ DOM render ก่อน)
    editSignaturePad = null; // บังคับสร้างใหม่เสมอ (เผื่อ canvas ถูก re-render)
    setTimeout(() => {
        if (typeof initEditSignaturePad === 'function') initEditSignaturePad();
    }, 300);
};


// 5. ฟังก์ชันบันทึกการแก้ไขฉบับเต็ม (Save Edit Request - Full Function)

async function saveEditRequest() {
    const btn = document.getElementById('save-edit-btn');
    
    const setBtnStatus = (msg, icon = 'loader-sm') => {
        if (btn) {
            btn.disabled = true;
            // ถ้า icon เป็น loader ให้หมุน ถ้าไม่ใช่ให้แสดงปกติ
            const iconHtml = icon === 'loader-sm' ? '<span class="loader-sm"></span>' : `<i class="${icon}"></i>`;
            btn.innerHTML = `${iconHtml} ${msg}`;
            btn.classList.add('opacity-70', 'cursor-not-allowed');
        }
    };

    try {
        const formData = getEditFormData();
        if (!formData || !validateEditForm(formData)) return;

        // --- Step 1: สร้าง PDF ใหม่ ---
        setBtnStatus('กำลังสร้างไฟล์ PDF ใหม่...');
        
        // บังคับปิด attachments (ตาม Logic เดิม)
        formData.attachments = []; 
        formData.attachmentUrls = [];

        const pdfData = { ...formData, doctype: 'memo' };
        const { pdfBlob } = await generateOfficialPDF(pdfData);

        // --- Step 2: อัปโหลดไฟล์ ---
        setBtnStatus('กำลังอัปโหลดไฟล์...');
        
        const finalBase64 = await blobToBase64(pdfBlob);
        const safeId = formData.requestId.replace(/[\/\\\:\.\s]/g, '-');
        const filename = `memo_EDIT_${safeId}_${Date.now()}.pdf`;

        const uploadRes = await apiCall('POST', 'uploadGeneratedFile', {
            data: finalBase64,
            filename: filename,
            mimeType: 'application/pdf',
            username: formData.username
        });

        if (uploadRes.status !== 'success') throw new Error("อัปโหลดไฟล์แก้ไขไม่สำเร็จ");
        const newFileUrl = uploadRes.url;
        console.log("✅ New File URL:", newFileUrl);

        // --- Step 3: บันทึกข้อมูล ---
        setBtnStatus('กำลังบันทึกข้อมูล...');
        
        formData.fileUrl = newFileUrl;
        formData.pdfUrl = newFileUrl;
        formData.memoPdfUrl = newFileUrl;

        const result = await apiCall('POST', 'updateRequest', formData);

        if (result.status === 'success') {
            // อัปเดต Firestore
            if (typeof db !== 'undefined') {
                const docId = formData.requestId.replace(/[\/\\\:\.]/g, '-');
                await db.collection('requests').doc(docId).set({
                    ...formData,
                    fileUrl: newFileUrl,
                    pdfUrl: newFileUrl,
                    memoPdfUrl: newFileUrl,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }

            // ★★★ ส่วนที่ปรับปรุงตามโจทย์ ★★★
            
            // 1. เปลี่ยนข้อความปุ่มให้รู้ว่าเสร็จแล้ว
            if (btn) {
                btn.innerHTML = '✅ ดูไฟล์ที่สร้างสำเร็จ';
                btn.classList.remove('bg-yellow-500', 'hover:bg-yellow-600');
                btn.classList.add('bg-green-600', 'hover:bg-green-700');
            }

            showAlert("สำเร็จ", "บันทึกการแก้ไขเรียบร้อยแล้ว");
            
            // 2. เปิดไฟล์ใหม่ให้ดูทันที (ใน Tab ใหม่)
            if (newFileUrl) window.open(newFileUrl, '_blank');
            
            // 3. รีเฟรช Dashboard และพากลับไป
            if (typeof clearRequestsCache === 'function') clearRequestsCache();
            window.allRequestsCache = null; 
            
            await fetchUserRequests(); // โหลดข้อมูลใหม่เพื่อให้ Dashboard มีลิงก์ล่าสุด
            
            // กลับไปหน้า Dashboard
            switchPage('dashboard-page');

        } else {
            throw new Error(result.message || "Server Error");
        }

    } catch (error) {
        console.error("Save Edit Error:", error);
        showAlert("บันทึกไม่สำเร็จ", "เกิดข้อผิดพลาด: " + error.message);
        // คืนค่าปุ่มกรณี Error
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = 'บันทึกการแก้ไข';
            btn.classList.remove('opacity-70', 'cursor-not-allowed');
        }
    }
}
// --- ฟังก์ชันแยก: รวมไฟล์และอัปเดตย้อนหลัง (Background Process) ---
async function mergeAndBackfillPDF(requestId, mainPdfUrl, attachments, user) {
    if (!requestId || !mainPdfUrl || !attachments || attachments.length === 0) {
        console.log("ℹ️ No attachments to merge. Skipping.");
        return;
    }

    // แสดงแจ้งเตือนมุมจอว่ากำลังทำงานเบื้องหลัง
    const toastId = 'toast-' + Date.now();
    const showToast = (msg) => {
        const div = document.createElement('div');
        div.id = toastId;
        div.className = "fixed bottom-4 right-4 bg-gray-800 text-white px-4 py-2 rounded shadow-lg z-50 text-sm flex items-center";
        div.innerHTML = `<span class="loader-sm mr-2 border-white"></span> ${msg}`;
        document.body.appendChild(div);
    };
    const updateToast = (msg, success=true) => {
        const div = document.getElementById(toastId);
        if(div) {
            div.innerHTML = success ? `✅ ${msg}` : `⚠️ ${msg}`;
            if(success) div.classList.replace('bg-gray-800', 'bg-green-600');
            setTimeout(() => div.remove(), 5000);
        }
    };

    try {
        console.log("🔄 Starting Background Merge for:", requestId);
        showToast("กำลังรวมไฟล์แนบอยู่เบื้องหลัง...");

        // 1. ดาวน์โหลดไฟล์หลัก (Main PDF)
        const mainRes = await fetch(mainPdfUrl);
        const mainBlob = await mainRes.blob();

        // 2. รวบรวม URL ไฟล์แนบ
        const attachmentUrls = attachments.map(a => a.url).filter(url => url);
        
        // 3. รวมไฟล์ (Client-side Merge)
        // (ต้องมั่นใจว่ามีฟังก์ชัน mergePDFs ใน utils.js)
        if (typeof mergePDFs !== 'function') throw new Error("mergePDFs function missing");
        
        const mergedBlob = await mergePDFs(mainBlob, attachmentUrls);
        
        // 4. อัปโหลดไฟล์ที่รวมเสร็จแล้ว (Merged PDF)
        const mergedBase64 = await blobToBase64(mergedBlob);
        const uploadRes = await apiCall('POST', 'uploadGeneratedFile', {
            data: mergedBase64,
            filename: `merged_request_${requestId}_${Date.now()}.pdf`,
            mimeType: 'application/pdf',
            username: user.username
        });

        if (uploadRes.status === 'success') {
            const finalUrl = uploadRes.url;
            console.log("✅ Merge & Upload Success:", finalUrl);

            // 5. อัปเดตลิงก์ในฐานข้อมูล (Update Request)
            // อัปเดตทั้ง GAS และ Firebase
            await apiCall('POST', 'updateRequest', {
                requestId: requestId,
                fileUrl: finalUrl // อัปเดตลิงก์หลักเป็นไฟล์ที่รวมแล้ว
            });

            if (typeof db !== 'undefined') {
                await db.collection('requests').doc(requestId.replace(/[\/\\\:\.]/g, '-')).set({
                    fileUrl: finalUrl,
                    isMerged: true,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }

            updateToast("รวมไฟล์เอกสารเสร็จสมบูรณ์", true);
        }

    } catch (error) {
        console.error("Background Merge Failed:", error);
        updateToast("การรวมไฟล์ขัดข้อง (เอกสารหลักยังอยู่ครบ)", false);
        // ไม่ต้อง throw error เพื่อไม่ให้กระทบ Flow หลัก
    }
}
/**
 * ฟังก์ชันตรวจสอบความถูกต้องของข้อมูล (Validation Check)
 * @param {Object} data - ข้อมูลที่ดึงมาจากฟอร์ม
 * @returns {Boolean} - true ถ้าข้อมูลถูกต้อง, false ถ้าข้อมูลไม่ครบ
 */
function validateRequestForm(data) {
    // 1. ตรวจสอบข้อมูลบังคับ (ชื่อ, ตำแหน่ง, วัตถุประสงค์, สถานที่)
    if (!data.requesterName || !data.requesterPosition || !data.purpose || !data.location) {
        // แจ้งเตือนผ่าน Console หรือ UI (ใน handleRequestFormSubmit จะจับ error นี้)
        return false;
    }

    // 2. ตรวจสอบวันที่
    if (!data.docDate || !data.startDate || !data.endDate) {
        return false;
    }

    // 3. ตรวจสอบตรรกะวันที่ (วันกลับต้องไม่มาก่อนวันเริ่ม)
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);
    if (start > end) {
        alert('วันที่เริ่มต้นและสิ้นสุดไม่ถูกต้อง (วันกลับต้องอยู่หลังวันเริ่ม)');
        return false;
    }

    return true;
}
window.editRequest = async function(requestId) {
    console.log("Triggering edit for:", requestId);
    await openEditPage(requestId);
};

window.deleteRequest = async function(requestId) {
    console.log("Triggering delete for:", requestId);
    await handleDeleteRequest(requestId);
};
// ไฟล์: js/requests.js

// ==========================================
// 3. ฟังก์ชันสำหรับหน้า "ส่งบันทึก" (แยกออกมาเฉพาะ)
// ==========================================

async function fetchPendingMemos() {
    const user = getCurrentUser();
    if (!user) return;

    // UI Setup
    const container = document.getElementById('pending-memos-list');
    const loader = document.getElementById('pending-memos-loader');
    const noMsg = document.getElementById('no-pending-memos-message');
    
    container.innerHTML = '';
    loader.classList.remove('hidden');
    noMsg.classList.add('hidden');

    try {
        // ใช้ Logic เดียวกับ fetchUserRequests แต่เราจะกรองในขั้นถัดไป
        // เพื่อความชัวร์ ให้ดึงข้อมูลปีปัจจุบันและย้อนหลัง 1 ปี (เผื่อมีงานค้างข้ามปี)
        const currentYear = new Date().getFullYear() + 543;
        
        // ดึงข้อมูลปีปัจจุบัน
        const resultNow = await apiCall('GET', 'getRequestsByYear', { year: currentYear, username: user.username });
        let requests = (resultNow.status === 'success') ? resultNow.data || [] : [];

        // ผสานข้อมูล Firebase เพื่อสถานะที่แม่นยำ
        if (typeof db !== 'undefined') {
            const snapshot = await db.collection('requests').where('username', '==', user.username).get();
            const firebaseData = {};
            snapshot.forEach(doc => { firebaseData[doc.id] = doc.data(); });

            requests = requests.map(req => {
                const safeId = req.id.replace(/[\/\\:\.]/g, '-');
                const fbDoc = firebaseData[safeId];
                if (fbDoc) {
                    return { ...req, ...fbDoc }; // ใช้ข้อมูลล่าสุดจาก FB
                }
                return req;
            });
        }

        // ★ กรองเฉพาะรายการที่ต้องส่งบันทึก ★
        // เงื่อนไข: (มีเลขที่เอกสาร) AND (ยังไม่เสร็จสิ้น OR สถานะ = นำกลับไปแก้ไข)
        const pendingRequests = requests.filter(req => {
            const hasId = req.id && req.id !== '' && !req.id.includes('รอ');
            
            // เช็คสถานะเสร็จสิ้น
            const isCompleted = 
                req.status === 'เสร็จสิ้น' || 
                req.status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' || 
                req.memoStatus === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' ||
                req.commandStatus === 'เสร็จสิ้น'; // ถ้าออกคำสั่งแล้วถือว่าผ่านขั้นตอนนี้แล้ว

            // เช็คสถานะแก้ไข
            const isFixing = req.status === 'นำกลับไปแก้ไข' || req.memoStatus === 'นำกลับไปแก้ไข';
            
            // ยังไม่มีไฟล์แนบ (หรือมีแต่ต้องแก้) และยังไม่จบกระบวนการ
            // หมายเหตุ: เช็ค completedMemoUrl ด้วย เพราะบางทีอาจจะส่งแล้วแต่ status ยังไม่อัปเดต
            const hasMemoFile = req.completedMemoUrl && req.completedMemoUrl !== "";

            if (!hasId) return false; // ไม่มีเลข ไม่ต้องแสดง
            
            // แสดงถ้า: (ต้องแก้ไข) หรือ (ยังไม่เสร็จ และ ยังไม่มีไฟล์แนบสมบูรณ์)
            return isFixing || (!isCompleted && !hasMemoFile);
        });

        // เรียงลำดับ (เก่า -> ใหม่ จะได้รีบเคลียร์ของเก่า)
        pendingRequests.sort((a, b) => new Date(a.docDate) - new Date(b.docDate));

        renderPendingMemos(pendingRequests);

    } catch (error) {
        console.error("Error fetching pending memos:", error);
        container.innerHTML = `<p class="text-center text-red-500">โหลดข้อมูลไม่สำเร็จ: ${error.message}</p>`;
    } finally {
        loader.classList.add('hidden');
    }
}

function renderPendingMemos(requests) {
    const container = document.getElementById('pending-memos-list');
    const noMsg = document.getElementById('no-pending-memos-message');

    if (requests.length === 0) {
        noMsg.classList.remove('hidden');
        return;
    }

    container.innerHTML = requests.map(req => {
        const safeId = escapeHtml(req.id);
        const isFixing = req.status === 'นำกลับไปแก้ไข' || req.memoStatus === 'นำกลับไปแก้ไข';
        
        let statusBadge = isFixing 
            ? `<span class="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded border border-red-200">⚠️ ตีกลับให้แก้ไข</span>`
            : `<span class="bg-yellow-100 text-yellow-700 text-xs font-bold px-2 py-1 rounded border border-yellow-200">⏳ รอส่งบันทึก</span>`;

        // ปุ่มดูไฟล์ (เพื่อให้ดูเลขที่/รายละเอียดก่อนแนบ)
        const viewFileUrl = req.fileUrl || req.pdfUrl;
        const viewBtn = viewFileUrl 
            ? `<a href="${viewFileUrl}" target="_blank" class="text-indigo-600 hover:underline text-sm mr-4">📄 ดูรายละเอียด</a>` 
            : '';

        return `
        <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div class="flex-1">
                    <div class="flex items-center gap-3 mb-1">
                        <h4 class="text-lg font-bold text-gray-800">${safeId}</h4>
                        ${statusBadge}
                    </div>
                    <p class="text-gray-600 font-medium">${escapeHtml(req.purpose)}</p>
                    <p class="text-sm text-gray-500 mt-1">
                        📅 ${formatDisplayDate(req.startDate)} | 📍 ${escapeHtml(req.location)}
                    </p>
                    <div class="mt-2">
                        ${viewBtn}
                    </div>
                </div>
                
                <div class="w-full sm:w-auto">
                    <button onclick="openSendMemoFromList('${safeId}')" class="btn bg-teal-600 hover:bg-teal-700 text-white w-full sm:w-auto shadow-md flex items-center justify-center gap-2 py-2 px-6">
                        <span>📤</span>
                        <span>ส่งบันทึก/แนบไฟล์</span>
                    </button>
                </div>
            </div>
        </div>`;
    }).join('');
}

// ฟังก์ชันเปิด Modal จากหน้านี้ (เพิ่ม Global Function)
// ฟังก์ชันตอนเปิด Modal ส่งงาน
window.openSendMemoFromList = function(requestId, departmentName = null) {
    document.getElementById('memo-modal-request-id').value = requestId;
    document.getElementById('send-memo-form').reset();
    
    // ตั้งค่าประเภทอัตโนมัติเป็น ไม่เบิก
    const nonReimburseRadio = document.getElementById('memo_type_non_reimburse');
    if(nonReimburseRadio) {
        nonReimburseRadio.checked = true;
        nonReimburseRadio.dispatchEvent(new Event('change'));
    }

    // เลือกแผนกที่จะส่งต่อให้อัตโนมัติ (ถ้ามีส่งมา)
    if (departmentName) {
        const targetStatus = mapDepartmentToStatus(departmentName);
        const forwardSelect = document.getElementById('modal-forward-to');
        if (forwardSelect) forwardSelect.value = targetStatus;
    }

    document.getElementById('send-memo-modal').style.display = 'flex';
};

// ---------------------------------------------------------
// ฟังก์ชันกดยืนยันการส่งต่อ (ปุ่มสุดท้าย)
// ---------------------------------------------------------
async function handleMemoSubmitFromModal(e) {
    e.preventDefault();
    const user = getCurrentUser();
    if (!user) return;

    const requestId = document.getElementById('memo-modal-request-id').value;
    const memoType = document.querySelector('input[name="modal_memo_type"]:checked')?.value || 'non_reimburse'; 
    const forwardToStatus = document.getElementById('modal-forward-to')?.value; // ดึงค่าการส่งต่อ

    if (!forwardToStatus) {
        return showAlert('แจ้งเตือน', 'กรุณาเลือกผู้ที่จะส่งบันทึกต่อให้ถูกต้อง');
    }

    toggleLoader('send-memo-submit-button', true);

    try {
        let finalFileUrlForAdmin = ""; 

        if (memoType === 'non_reimburse') {
            const filesToMerge = [
                document.getElementById('file-signed-memo')?.files[0],
                document.getElementById('file-exchange')?.files[0],
                document.getElementById('file-ref-doc')?.files[0],
                document.getElementById('file-other')?.files[0]
            ].filter(f => f); 

            // ตรวจสอบเงื่อนไข 
            if (user.role !== 'admin' && filesToMerge.length < 3) {
                // ถ้าเพิ่งเซ็นออนไลน์มา อนุโลมให้ไม่ต้องแนบไฟล์ช่องที่ 1 ได้ (เพราะระบบอัปเดตไฟล์หลักให้แล้ว)
                // หรือบังคับตาม logic เก่าของคุณ
            }

            if (filesToMerge.length > 0) {
                const btn = document.getElementById('send-memo-submit-button');
                btn.innerHTML = '<span class="loader-sm w-4 h-4"></span> กำลังรวมไฟล์ PDF...';

                const mergedPdfBlob = await mergeFilesToSinglePDF(filesToMerge);
                
                btn.innerHTML = '<span class="loader-sm w-4 h-4"></span> กำลังอัปโหลด...';
                const mergedBase64 = await blobToBase64(mergedPdfBlob);
                const uploadRes = await apiCall('POST', 'uploadGeneratedFile', {
                    data: mergedBase64, filename: `Complete_Memo_${requestId.replace(/[\/\\:\.]/g, '-')}.pdf`,
                    mimeType: 'application/pdf', username: user.username, requestId: requestId
                });

                if (uploadRes.status !== 'success') throw new Error("อัปโหลดไม่สำเร็จ");
                finalFileUrlForAdmin = uploadRes.url;
            }
        } 

        // ★ อัปเดตสถานะการส่งต่อ (docStatus) เข้าไปใน Database ด้วย
        const updatePayload = {
            requestId: requestId,
            docStatus: forwardToStatus, // กำหนดว่าส่งไปให้ใคร
            status: 'Submitted'         // สถานะหลัก
        };
        
        if (finalFileUrlForAdmin) updatePayload.completedMemoUrl = finalFileUrlForAdmin;

        await apiCall('POST', 'updateRequest', updatePayload);

        if (typeof db !== 'undefined') {
            const docId = requestId.replace(/[\/\\:\.]/g, '-');
            await db.collection('requests').doc(docId).set({
                ...updatePayload,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        }

        showAlert('สำเร็จ', 'ส่งต่อบันทึกข้อความให้หัวหน้าเพื่อพิจารณาเรียบร้อยแล้ว'); 
        document.getElementById('send-memo-modal').style.display = 'none'; 
        
        await fetchUserRequests(); 
        switchPage('dashboard-page');

    } catch (error) {
        console.error(error);
        showAlert('ผิดพลาด', error.message);
    } finally {
        const btn = document.getElementById('send-memo-submit-button');
        if(btn) btn.innerHTML = 'ส่งต่อบันทึก';
        toggleLoader('send-memo-submit-button', false);
    }
}
// ฟังก์ชันแปลงชื่อกลุ่มสาระ เป็น Status สำหรับคิวการอนุมัติ
function mapDepartmentToStatus(departmentName) {
    if (!departmentName) return 'Pending';
    if (departmentName.includes('ภาษาไทย')) return 'waiting_head_thai';
    if (departmentName.includes('ภาษาต่างประเทศ')) return 'waiting_head_foreign';
    if (departmentName.includes('วิทยาศาสตร์')) return 'waiting_head_science';
    if (departmentName.includes('ศิลปะ')) return 'waiting_head_art';
    if (departmentName.includes('สังคม')) return 'waiting_head_social';
    if (departmentName.includes('สุขศึกษา')) return 'waiting_head_health';
    if (departmentName.includes('การงานอาชีพ')) return 'waiting_head_career';
    if (departmentName.includes('คณิตศาสตร์')) return 'waiting_head_math';
    return 'Pending'; // ถ้าไม่ตรงกลุ่มสาระใดเลย ให้เป็น Pending ปกติ
}
// ตัวแปรเก็บสถานะชั่วคราวระหว่างการจิ้มลายเซ็น
let requesterStamperState = {
    pdfBlob: null,
    formData: null,
    signatureBase64: null,
    isEdit: false
};

// ---------------------------------------------------------
// 1. ฟังก์ชันหลักสำหรับเริ่มกระบวนการ สร้าง/แก้ไข คำขอ
// ---------------------------------------------------------
async function processAndSignDocument(formData, isEdit = false) {
    toggleLoader('submit-button', true); // หมุน Loader ที่ปุ่ม Submit
    try {
        console.log("Generating PDF from Cloud Run...");
        // ให้ Cloud Run สร้าง PDF ออกมาก่อน
        const pdfBlob = await generatePdfFromCloudRun('template_memo.docx', formData);
        
        // เก็บข้อมูลไว้ใช้ตอนจิ้ม
        requesterStamperState.pdfBlob = pdfBlob;
        requesterStamperState.formData = formData;
        requesterStamperState.isEdit = isEdit;
        requesterStamperState.signatureBase64 = formData.signatureBase64; // ลายเซ็นจาก Signature Pad

        if (formData.signatureBase64) {
            // ถ้ามีการเซ็นมา -> เปิด Modal ให้จิ้มตำแหน่ง
            await renderPdfForRequesterStamper(pdfBlob);
        } else {
            // ถ้าไม่ได้เซ็นมา -> ข้ามไปเซฟเลย
            await finalizeDocumentSubmission(pdfBlob);
        }
    } catch (error) {
        console.error(error);
        showAlert('ผิดพลาด', 'ไม่สามารถสร้างเอกสารได้: ' + error.message);
        toggleLoader('submit-button', false);
    }
}

// ---------------------------------------------------------
// 2. ฟังก์ชันแสดง PDF ให้ผู้ขอจิ้มตำแหน่ง
// ---------------------------------------------------------
async function renderPdfForRequesterStamper(pdfBlob) {
    const modal = document.getElementById('requester-stamper-modal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    const canvas = document.getElementById('requester-pdf-canvas');
    const ctx = canvas.getContext('2d');
    
    // โหลด PDF ด้วย pdf.js
    const arrayBuffer = await pdfBlob.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    // ดึงหน้า 1 มาแสดง
    const page = await pdf.getPage(1);
    const scale = 1.5; // ขนาดซูม
    const viewport = page.getViewport({ scale: scale });
    
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    
    await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    toggleLoader('submit-button', false); // ปิดหมุนๆ เพราะรอให้ผู้ใช้จิ้ม

    // ดักจับการคลิกบนหน้ากระดาษ
    canvas.onclick = async function(e) {
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        
        // แปลงพิกัด HTML กลับเป็นพิกัด PDF (PDF-lib นับ Y จากล่างขึ้นบน)
        const pdfX = canvasX / scale;
        const pdfY = (canvas.height - canvasY) / scale; 

        // ปิด Modal
        modal.style.display = 'none';
        
        // ส่งไปแปะลายเซ็นและเซฟ
        await stampAndSave(pdfX, pdfY);
    };
}

// ---------------------------------------------------------
// 3. ฟังก์ชันประทับลายเซ็นด้วย pdf-lib
// ---------------------------------------------------------
async function stampAndSave(x, y) {
    showAlert('กำลังดำเนินการ', 'กำลังประทับลายเซ็นและบันทึกข้อมูล... กรุณารอสักครู่', false); // แจ้งเตือนแบบซ่อนปุ่ม OK
    
    try {
        const pdfBytes = await requesterStamperState.pdfBlob.arrayBuffer();
        const pdfDoc = await PDFLib.PDFDocument.load(pdfBytes);
        const page = pdfDoc.getPages()[0]; // หน้าแรก

        // แปะภาพลายเซ็น
        const base64Data = requesterStamperState.signatureBase64.split(',')[1];
        const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        const signatureImage = await pdfDoc.embedPng(imageBytes);
        
        const sigWidth = 100; // ความกว้างรูปลายเซ็น
        const sigHeight = 40; // ความสูงรูปลายเซ็น

        page.drawImage(signatureImage, {
            x: x - (sigWidth / 2), // ลบครึ่งนึงเพื่อให้ภาพอยู่กึ่งกลางจุดที่คลิกพอดี
            y: y - (sigHeight / 2),
            width: sigWidth,
            height: sigHeight
        });

        const modifiedPdfBytes = await pdfDoc.save();
        const finalPdfBlob = new Blob([modifiedPdfBytes], { type: 'application/pdf' });

        // ส่งเข้ากระบวนการเซฟข้อมูล
        await finalizeDocumentSubmission(finalPdfBlob);
        
    } catch (error) {
        console.error(error);
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการประทับลายเซ็น: ' + error.message);
    }
}

// ---------------------------------------------------------
// 4. ★ ฟังก์ชันเซฟข้อมูล (แก้บั๊ก Edit ไม่ติดอยู่ที่นี่) ★
// ---------------------------------------------------------
async function finalizeDocumentSubmission(pdfBlob) {
    const formData = requesterStamperState.formData;
    const isEdit = requesterStamperState.isEdit;

    try {
        // 1. แปลงไฟล์ใหม่เป็น Base64 และอัปโหลดขึ้น Google Drive
        const base64Data = await blobToBase64(pdfBlob);
        const fileName = `memo_${formData.username}_${Date.now()}.pdf`;

        const uploadRes = await apiCall('POST', 'uploadGeneratedFile', {
            data: base64Data,
            filename: fileName,
            mimeType: 'application/pdf',
            username: formData.username
        });

        if (uploadRes.status !== 'success') throw new Error("Upload Failed");

        formData.pdfUrl = uploadRes.url; // นำ URL ใหม่ใส่กลับเข้าไป
        
        // 2. จัดการบันทึกฐานข้อมูล
        if (isEdit) {
            // โหมดแก้ไข: บังคับเรียก API updateRequest
            formData.action = 'updateRequest'; 
            await apiCall('POST', 'updateRequest', formData);
            
            // อัปเดตใน Firebase ควบคู่ (ใช้ merge เพื่อป้องกันข้อมูลอื่นถูกล้าง)
            if (typeof db !== 'undefined') {
                const safeId = formData.id.replace(/[\/\\:\.]/g, '-');
                await db.collection('requests').doc(safeId).set({
                    ...formData,
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                }, { merge: true });
            }
            
            document.getElementById('alert-modal').style.display = 'none'; // ปิดแจ้งเตือนกำลังโหลด
            showAlert('สำเร็จ', 'บันทึกการแก้ไขและสร้างเอกสารใหม่เรียบร้อยแล้ว');
        } else {
            // โหมดสร้างใหม่
            formData.action = 'createRequest';
            const gasRes = await apiCall('POST', 'createRequest', formData);
            
            if (gasRes.data && gasRes.data.id) formData.id = gasRes.data.id;

            if (typeof db !== 'undefined') {
                const safeId = formData.id.replace(/[\/\\:\.]/g, '-');
                await db.collection('requests').doc(safeId).set({
                    ...formData,
                    status: 'Pending',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }

            document.getElementById('alert-modal').style.display = 'none';
            showAlert('สำเร็จ', 'สร้างคำขอไปราชการเรียบร้อยแล้ว');
        }

        // รีเซ็ตฟอร์ม เคลียร์แคช และเด้งกลับหน้า Dashboard
        document.getElementById('request-form').reset();
        if (requesterSignaturePad) requesterSignaturePad.clear();
        if (typeof clearRequestsCache === 'function') clearRequestsCache();
        switchPage('dashboard-page');

    } catch (error) {
        console.error(error);
        document.getElementById('alert-modal').style.display = 'none';
        showAlert('ผิดพลาด', 'บันทึกข้อมูลไม่สำเร็จ: ' + error.message);
    }
}