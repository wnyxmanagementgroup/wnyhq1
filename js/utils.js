// --- CACHE SYSTEM ---
window.userRequestsCache = null;      // เก็บข้อมูลคำขอของ User
window.userRequestsCacheTime = 0;     // เก็บ Timestamp ล่าสุดที่ดึงข้อมูล
window.userRequestsCacheYear = null;  // เก็บปีของข้อมูลที่ Cache ไว้
const CACHE_TTL_MS = 5 * 60 * 1000;   // อายุ Cache: 5 นาที (หน่วยเป็นมิลลิวินาที)

// ฟังก์ชันสำหรับเคลียร์ Cache (จะถูกเรียกใช้เวลา เพิ่ม/ลบ/แก้ไข ข้อมูล)
function clearRequestsCache() {
    window.userRequestsCache = null;
    window.userRequestsCacheTime = 0;
    window.userRequestsCacheYear = null;
    window.allRequestsCache = null;
    if (typeof allRequestsCache !== 'undefined') allRequestsCache = [];
    if (typeof allMemosCache !== 'undefined') allMemosCache = [];
    if (typeof userMemosCache !== 'undefined') userMemosCache = [];
    console.log("🧹 เคลียร์ Cache ข้อมูลเรียบร้อยแล้ว");
}
async function apiCall(method, action, payload = {}, retries = 2) {
    let url = SCRIPT_URL;
    const TIMEOUT_MS = 30000; // 30 วินาที (ถ้าเกินนี้ให้ตัด)

    // ตั้งค่า Headers
    const options = {
        method: method,
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    };

    // จัดการ Parameter
    if (method === 'GET') {
        const params = new URLSearchParams({ action, ...payload, cacheBust: new Date().getTime() }); 
        url += `?${params}`;
    } else {
        options.body = JSON.stringify({ action, payload });
    }

    // ฟังก์ชันสำหรับรอเวลา (Backoff) ก่อนลองใหม่
    const wait = (ms) => new Promise(r => setTimeout(r, ms));

    // ลูปการทำงานเพื่อลองใหม่ (Retry Loop)
    for (let attempt = 0; attempt <= retries; attempt++) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        
        try {
            // เพิ่ม signal เพื่อรองรับ Timeout
            const response = await fetch(url, { ...options, signal: controller.signal });
            clearTimeout(timeoutId); // ยกเลิกตัวจับเวลาถ้าโหลดเสร็จทัน

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const result = await response.json();
            if (result.status === 'error') throw new Error(result.message);
            
            return result; // ถ้าสำเร็จ ส่งค่ากลับทันที

        } catch (error) {
            clearTimeout(timeoutId); // เคลียร์เวลาเมื่อ error

            const isLastAttempt = attempt === retries;
            const isTimeout = error.name === 'AbortError';
            
            console.warn(`⚠️ API Call Failed (Attempt ${attempt + 1}/${retries + 1}):`, error.message);

            if (isLastAttempt) {
                // ถ้าครบโควตาลองใหม่แล้วยังไม่ได้ ให้แจ้ง Error จริงๆ
                console.error('❌ API Call Given Up:', error);
                
                if (isTimeout) {
                    showAlert('หมดเวลาการเชื่อมต่อ', 'ระบบใช้เวลานานเกินไป กรุณาลองใหม่อีกครั้ง');
                } else if (error.message.includes('Failed to fetch')) {
                    showAlert('การเชื่อมต่อล้มเหลว', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาเช็คอินเทอร์เน็ต');
                } else {
                    showAlert('เกิดข้อผิดพลาด', `Server error: ${error.message}`);
                }
                throw error;
            }

            // ถ้ายังไม่ครบโควตา ให้รอแป๊บหนึ่งแล้วลองใหม่ (1 วินาที)
            await wait(1000);
        }
    }
}

// --- UTILITY FUNCTIONS ---
function showAlert(title, message) {
    document.getElementById('alert-modal-title').textContent = title;
    document.getElementById('alert-modal-message').textContent = message;
    document.getElementById('alert-modal').style.display = 'flex';
}

function showConfirm(title, message) {
    document.getElementById('confirm-modal-title').textContent = title;
    document.getElementById('confirm-modal-message').textContent = message;
    document.getElementById('confirm-modal').style.display = 'flex';

    return new Promise((resolve) => {
        const yesButton = document.getElementById('confirm-modal-yes-button');
        const noButton = document.getElementById('confirm-modal-no-button');
        const onYes = () => { cleanup(); resolve(true); };
        const onNo = () => { cleanup(); resolve(false); };
        
        const cleanup = () => {
            document.getElementById('confirm-modal').style.display = 'none';
            yesButton.removeEventListener('click', onYes);
            noButton.removeEventListener('click', onNo);
        };

        yesButton.addEventListener('click', onYes, { once: true });
        noButton.addEventListener('click', onNo, { once: true });
    });
}

function toggleLoader(buttonId, show) {
    const button = document.getElementById(buttonId);
    if (!button) {
        // console.warn(`Button with id '${buttonId}' not found`);
        return;
    }
    
    const loader = button.querySelector('.loader');
    const text = button.querySelector('span');
    
    if (show) {
        if (loader) loader.classList.remove('hidden');
        if (text) text.classList.add('hidden');
        button.disabled = true;
    } else {
        if (loader) loader.classList.add('hidden');
        if (text) text.classList.remove('hidden');
        button.disabled = false;
    }
}

function getCurrentUser() {
    const userJson = sessionStorage.getItem('currentUser');
    return userJson ? JSON.parse(userJson) : null;
}

function fileToObject(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const parts = reader.result ? reader.result.toString().split(',') : [];
            const data = parts.length > 1 ? parts[1] : '';
            resolve({ filename: file.name, mimeType: file.type, data: data });
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
        const parts = reader.result ? reader.result.split(',') : [];
        const base64String = parts.length > 1 ? parts[1] : '';
        resolve(base64String);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function formatDisplayDate(dateString) {
    if (!dateString) return 'ไม่ระบุ';
    try {
        const date = new Date(dateString);
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        return date.toLocaleDateString('th-TH', options);
    } catch (e) {
        return 'ไม่ระบุ';
    }
}

// clearRequestsCache ถูกรวมไว้ที่ด้านบนของไฟล์แล้ว

function checkAdminAccess() {
    const user = getCurrentUser();
    return user && user.role === 'admin';
}

async function loadSpecialPositions() {
    return new Promise(resolve => {
        console.log('Special positions loaded:', Object.keys(specialPositionMap).length);
        resolve();
    });
}

function getStatusColor(status) {
    const statusColors = {
        'เสร็จสิ้น': 'text-green-600 font-semibold',
        'Approved': 'text-green-600 font-semibold',
        'กำลังดำเนินการ': 'text-yellow-600',
        'Pending': 'text-yellow-600',
        'Submitted': 'text-blue-600',
        'รอเอกสาร (เบิก)': 'text-orange-600',
        'นำกลับไปแก้ไข': 'text-red-600',
    };
    return statusColors[status] || 'text-gray-600';
}
// --- PDF MERGE UTILITIES ---

/**
 * ฟังก์ชันรวมไฟล์ PDF (Main PDF + Attachments)
 * @param {Blob} mainPdfBlob - ไฟล์ PDF หลักที่ระบบสร้างขึ้น
 * @param {Array} attachmentFiles - รายการไฟล์แนบ (URL string หรือ File object)
 * @returns {Promise<Blob>} - ไฟล์ PDF ที่รวมเสร็จแล้ว
 */
async function mergePDFs(mainPdfBlob, attachmentFiles = []) {
    try {
        const { PDFDocument } = PDFLib;
        const mergedPdf = await PDFDocument.create();
        
        // Helper: โหลดไฟล์ PDF เป็น ArrayBuffer
        const loadPdfBytes = async (source) => {
            if (source instanceof Blob || source instanceof File) {
                return await source.arrayBuffer();
            } else if (typeof source === 'string' && source.startsWith('http')) {
                const res = await fetch(source);
                if (!res.ok) throw new Error(`Cannot fetch PDF: ${source}`);
                return await res.arrayBuffer();
            }
            return null;
        };

        // 1. ใส่ไฟล์หลักก่อน
        const mainBytes = await loadPdfBytes(mainPdfBlob);
        const mainDoc = await PDFDocument.load(mainBytes);
        const copiedPagesMain = await mergedPdf.copyPages(mainDoc, mainDoc.getPageIndices());
        copiedPagesMain.forEach((page) => mergedPdf.addPage(page));

        // 2. วนลูปใส่ไฟล์แนบ
        for (const file of attachmentFiles) {
            try {
                const bytes = await loadPdfBytes(file);
                if (bytes) {
                    const doc = await PDFDocument.load(bytes);
                    const copiedPages = await mergedPdf.copyPages(doc, doc.getPageIndices());
                    copiedPages.forEach((page) => mergedPdf.addPage(page));
                }
            } catch (err) {
                console.warn("Skipping invalid attachment:", err);
            }
        }

        // 3. บันทึกและคืนค่าเป็น Blob
        const mergedBytes = await mergedPdf.save();
        return new Blob([mergedBytes], { type: 'application/pdf' });

    } catch (error) {
        console.error("Merge PDF Error:", error);
        // ถ้า error ให้คืนค่าไฟล์หลักเดิมไปแทน (กันระบบพัง)
        return mainPdfBlob;
    }
}
