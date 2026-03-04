// --- ตัวแปรควบคุมระบบลายเซ็น ---
let sigState = {
    pdfBytes: null,
    docId: null,
    scale: 1.5,
    tapPos: null,          // ตำแหน่งที่ผู้ใช้จิ้ม {x, y}
    padInstance: null,     // เก็บออบเจกต์ของไลบรารี signature_pad
    currentDocStatus: null // สถานะ docStatus ปัจจุบัน (ใช้คำนวณ nextStatus)
};

// --- Helper: กำหนดลำดับขั้นตอน docStatus ---
function getNextDocStatus(currentStatus) {
    const chain = {
        // หัวหน้ากลุ่มสาระทุกกลุ่ม → รองบุคคล
        'waiting_head_thai':    'waiting_dep_personnel',
        'waiting_head_foreign': 'waiting_dep_personnel',
        'waiting_head_science': 'waiting_dep_personnel',
        'waiting_head_art':     'waiting_dep_personnel',
        'waiting_head_social':  'waiting_dep_personnel',
        'waiting_head_health':  'waiting_dep_personnel',
        'waiting_head_career':  'waiting_dep_personnel',
        'waiting_head_math':    'waiting_dep_personnel',
        // รองบุคคล → รองวิชาการ
        'waiting_dep_personnel': 'waiting_dep_acad',
        // รองวิชาการ → แอดมินตรวจสอบก่อนส่งสารบรรณ
        'waiting_dep_acad':     'waiting_admin_review',
        // ผอ. เซ็น → เสร็จสิ้น
        'waiting_director':     'เสร็จสิ้น',
    };
    return chain[currentStatus] || null;
}

// --- Helper: แปลง docStatus เป็นชื่อที่อ่านได้ ---
function getDocStatusLabel(status) {
    const labels = {
        'waiting_dep_personnel': 'รองผู้อำนวยการกลุ่มบริหารงานบุคคล',
        'waiting_dep_acad':      'รองผู้อำนวยการกลุ่มบริหารวิชาการ',
        'waiting_admin_review':  'แอดมิน (รอตรวจสอบก่อนส่งสารบรรณ)',
        'waiting_saraban':       'งานสารบรรณ',
        'waiting_director':      'ผู้อำนวยการ',
        'เสร็จสิ้น':             'เสร็จสิ้น (อนุมัติแล้ว)',
    };
    return labels[status] || status || 'ขั้นตอนถัดไป';
}

// 1. เปิดหน้าจออ่าน PDF เพื่อเตรียมเซ็น
async function openSignatureSystem(pdfUrl, documentId, title = "✍️ ลงนามเอกสาร", currentDocStatus = null) {
    try {
        sigState.docId = documentId;
        sigState.currentDocStatus = currentDocStatus;
        document.getElementById('signature-modal-title').innerText = title;
        document.getElementById('signature-marker').classList.add('hidden');
        
        // แสดง Modal หลัก
        document.getElementById('signature-modal').classList.remove('hidden');

        // โหลด PDF จาก URL
        const response = await fetch(pdfUrl);
        sigState.pdfBytes = await response.arrayBuffer();

        // แสดงผล PDF บน Canvas
        const canvas = document.getElementById('signature-pdf-canvas');
        const ctx = canvas.getContext('2d');
        
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(sigState.pdfBytes) });
        const pdfDoc = await loadingTask.promise;
        const page = await pdfDoc.getPage(1); // ดึงหน้า 1 มาแสดง
        
        const viewport = page.getViewport({ scale: sigState.scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport: viewport }).promise;

    } catch (error) {
        console.error("Error loading PDF for signature:", error);
        alert("ไม่สามารถเปิดไฟล์ PDF ได้");
    }
}

function closeSignatureModal() {
    document.getElementById('signature-modal').classList.add('hidden');
}

// 2. เมื่อผู้ใช้จิ้มกระดาษ PDF -> บันทึกพิกัด และเปิดกระดานตวัดลายเซ็น
document.getElementById('signature-pdf-canvas').addEventListener('click', function(e) {
    const canvasRect    = this.getBoundingClientRect();

    // --- พิกัดสำหรับคำนวณตำแหน่งใน PDF (relative to canvas) ---
    const x = e.clientX - canvasRect.left;
    const y = e.clientY - canvasRect.top;
    sigState.tapPos = { x: x, y: y };

    // --- พิกัดสำหรับวาง marker (relative to #signature-pdf-container ที่มี position:relative) ---
    // ต้องคำนวณจาก container โดยตรง เพราะ canvas อาจอยู่กึ่งกลาง (flex justify-center)
    // หรือเลื่อนออกไป และ container อาจถูก scroll ด้วย
    const container      = document.getElementById('signature-pdf-container');
    const containerRect  = container.getBoundingClientRect();
    const markerLeft     = e.clientX - containerRect.left + container.scrollLeft;
    const markerTop      = e.clientY - containerRect.top  + container.scrollTop;

    const marker = document.getElementById('signature-marker');
    marker.style.left = `${markerLeft}px`;
    marker.style.top  = `${markerTop}px`;
    marker.classList.remove('hidden');

    // เตรียมเปิดกระดานวาด
    openSignaturePadModal();
});


// 3. ระบบกระดานตวัดลายเซ็น (Signature Pad)
function openSignaturePadModal() {
    // 1. *** ต้องเปิดหน้าต่างให้แสดงผลก่อน (ลบ hidden) ถึงจะคำนวณขนาดได้ ***
    document.getElementById('signature-pad-modal').classList.remove('hidden');
    
    const canvas = document.getElementById('signature-pad-canvas');
    
    // 2. คำนวณขนาด Canvas ให้พอดีกับหน้าจอ (ทำหลังจากเปิดหน้าต่างแล้ว)
    const ratio =  Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext("2d").scale(ratio, ratio);
    
    // 3. ผูกระบบ SignaturePad เข้ากับ Canvas
    if (!sigState.padInstance) {
        sigState.padInstance = new SignaturePad(canvas, {
            penColor: "blue", // สีน้ำเงิน
            minWidth: 1.0,
            maxWidth: 2.5
        });
    }
    
    // 4. เคลียร์กระดานให้สะอาดพร้อมเซ็น
    sigState.padInstance.clear();
}

function closeSignaturePadModal() {
    document.getElementById('signature-pad-modal').classList.add('hidden');
}

function clearSignaturePad() {
    if (sigState.padInstance) sigState.padInstance.clear();
}

// 4. การฝังลายเซ็นลง PDF → อัปโหลด → อัปเดตสถานะ
async function applySignatureToPdf() {
    if (!sigState.padInstance || sigState.padInstance.isEmpty()) {
        alert("กรุณาเซ็นชื่อก่อนกดยืนยันครับ");
        return;
    }

    try {
        toggleLoader('btn-confirm-signature', true);

        // --- 1. ฝังลายเซ็นลง PDF ---
        const sigBase64 = sigState.padInstance.toDataURL("image/png");
        const pdfDoc = await PDFLib.PDFDocument.load(sigState.pdfBytes);
        const page = pdfDoc.getPages()[0];
        const sigImage = await pdfDoc.embedPng(sigBase64);

        const sigWidth = 100;
        const sigHeight = (sigImage.height / sigImage.width) * sigWidth;

        const pdfWidth  = page.getWidth();
        const pdfHeight = page.getHeight();
        const canvas    = document.getElementById('signature-pdf-canvas');
        const cssWidth  = canvas.getBoundingClientRect().width;
        const cssHeight = canvas.getBoundingClientRect().height;
        const ratioX    = pdfWidth  / cssWidth;
        const ratioY    = pdfHeight / cssHeight;

        const pdfX = (sigState.tapPos.x * ratioX) - (sigWidth  / 2);
        const pdfY = pdfHeight - (sigState.tapPos.y * ratioY)  - (sigHeight / 2);

        page.drawImage(sigImage, { x: pdfX, y: pdfY, width: sigWidth, height: sigHeight });

        const finalPdfBytes = await pdfDoc.save();
        const signedBlob    = new Blob([finalPdfBytes], { type: "application/pdf" });

        // --- 2. อัปโหลดไฟล์ที่เซ็นแล้วขึ้น Google Drive ---
        closeSignaturePadModal();
        showAlert('กำลังดำเนินการ', 'กำลังบันทึกเอกสารที่ลงนามแล้ว... กรุณารอสักครู่', false);

        const user    = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        const docId   = sigState.docId;
        const safeId  = docId ? docId.replace(/[\/\\:\.]/g, '-') : 'unknown';

        const base64Data = await blobToBase64(signedBlob);
        const uploadRes  = await apiCall('POST', 'uploadGeneratedFile', {
            data:      base64Data,
            filename:  `signed_${safeId}.pdf`,
            mimeType:  'application/pdf',
            username:  user?.username || 'approver'
        });

        if (!uploadRes || uploadRes.status !== 'success') {
            throw new Error(uploadRes?.message || 'อัปโหลดไม่สำเร็จ');
        }

        const newPdfUrl   = uploadRes.url;
        const nextStatus  = getNextDocStatus(sigState.currentDocStatus);

        // --- 3. อัปเดต Firestore ---
        if (typeof db !== 'undefined') {
            const updateData = {
                pdfUrl:        newPdfUrl,
                currentPdfUrl: newPdfUrl,
                memoPdfUrl:    newPdfUrl,
                lastUpdated:   firebase.firestore.FieldValue.serverTimestamp(),
            };
            if (nextStatus) updateData.docStatus = nextStatus;
            if (user?.role) {
                updateData[`signedBy_${user.role}`] = user.name || user.username || '';
                updateData[`signedAt_${user.role}`] = firebase.firestore.FieldValue.serverTimestamp();
            }
            await db.collection('requests').doc(safeId).set(updateData, { merge: true });
        }

        // --- 4. อัปเดต Google Sheet (ไม่ blocking) ---
        apiCall('POST', 'updateRequest', {
            requestId: docId,
            pdfUrl:    newPdfUrl,
            docStatus: nextStatus || sigState.currentDocStatus,
        }).catch(err => console.warn("Sheet update error:", err));

        // --- 5. ปิด Modal ---
        document.getElementById('alert-modal').style.display = 'none';
        closeSignatureModal();

        // --- 6. แจ้งผลลัพธ์ ---
        if (window._currentSignToken) {
            // กรณีลงนามผ่าน Token Page: mark used + แสดงผลสำเร็จ (ไม่มีลิงก์ — แอดมินจัดการ)
            await markCurrentTokenUsed();
            if (typeof showTokenSignSuccess === 'function') {
                showTokenSignSuccess(nextStatus, null);
            }
        } else {
            // กรณีลงนามจาก Dashboard: แสดง alert เท่านั้น (แอดมินจะสร้างลิงก์ขั้นถัดไปเอง)
            const nextLabel = getDocStatusLabel(nextStatus);
            showAlert(
                '✅ ลงนามสำเร็จ',
                nextStatus
                    ? `เอกสารถูกส่งต่อไปยัง: ${nextLabel} เรียบร้อยแล้ว`
                    : 'ลงนามเอกสารเรียบร้อยแล้ว'
            );
            if (typeof loadPendingApprovals === 'function') loadPendingApprovals();
        }

    } catch (e) {
        console.error(e);
        document.getElementById('alert-modal').style.display = 'none';
        alert("เกิดข้อผิดพลาดในการประทับลายเซ็น: " + e.message);
    } finally {
        toggleLoader('btn-confirm-signature', false);
    }
}