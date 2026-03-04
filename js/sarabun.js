// ตัวแปรควบคุมการจิ้มตำแหน่ง
let sarabanState = {
    pdfBytes: null,    // เก็บไฟล์ PDF ต้นฉบับ
    scale: 1.5,        // ระดับการซูม
    step: 1,           // 1 = รอจิ้มเลขที่, 2 = รอจิ้มวันที่, 3 = พร้อมบันทึก
    posNum: null,      // พิกัดเลขที่ {x, y}
    posDate: null,     // พิกัดวันที่ {x, y}
    docId: null        // ID ของเอกสารใน Firestore
};

// 1. ฟังก์ชันเปิดหน้าต่างสารบรรณ (รับ Base64 หรือ URL ของ PDF มาแสดง)
async function openSarabanModal(pdfDataBytes, documentId) {
    sarabanState.pdfBytes = pdfDataBytes;
    sarabanState.docId = documentId;
    
    // รีเซ็ตค่าเริ่มต้น
    document.getElementById('saraban-doc-num').value = '';
    document.getElementById('saraban-doc-date').value = '';
    resetSarabanMarkers();

    // แสดง Modal
    document.getElementById('saraban-stamper-modal').classList.remove('hidden');

    // โหลด PDF มาแสดงบน Canvas
    const canvas = document.getElementById('saraban-pdf-canvas');
    const ctx = canvas.getContext('2d');
    
    try {
        const pdfBuffer = (pdfDataBytes instanceof ArrayBuffer) ? pdfDataBytes : new Uint8Array(pdfDataBytes).buffer;
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfBuffer) });
        const pdfDoc = await loadingTask.promise;
        const page = await pdfDoc.getPage(1); // แสดงหน้าแรก
        
        const viewport = page.getViewport({ scale: sarabanState.scale });
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: ctx, viewport: viewport }).promise;
    } catch (e) {
        console.error("Error loading PDF:", e);
        showAlert('ข้อผิดพลาด', 'ไม่สามารถโหลดไฟล์ PDF ได้');
    }
}

// 2. ตรวจจับการคลิกบนกระดาษ PDF
document.getElementById('saraban-pdf-canvas').addEventListener('click', function(e) {
    const docNum = document.getElementById('saraban-doc-num').value.trim();
    const docDate = document.getElementById('saraban-doc-date').value.trim();

    if (!docNum || !docDate) {
        alert('กรุณากรอกเลขที่และวันที่ด้านบนให้ครบก่อนทำการระบุตำแหน่งครับ');
        return;
    }

    const canvasRect    = this.getBoundingClientRect();
    const x = e.clientX - canvasRect.left;
    const y = e.clientY - canvasRect.top;

    // พิกัด marker relative to #saraban-pdf-container (position:relative)
    // ต้องคำนวณจาก container โดยตรง เพราะ canvas อาจถูก flex จัดกึ่งกลาง หรือ container scroll
    const container     = document.getElementById('saraban-pdf-container');
    const containerRect = container.getBoundingClientRect();
    const markerLeft    = e.clientX - containerRect.left + container.scrollLeft;
    const markerTop     = e.clientY - containerRect.top  + container.scrollTop;

    if (sarabanState.step === 1) {
        // จิ้มครั้งที่ 1: วางเลขที่หนังสือ
        sarabanState.posNum = { x: x, y: y };
        const marker = document.getElementById('marker-num');
        marker.style.left = `${markerLeft}px`;
        marker.style.top  = `${markerTop}px`;
        marker.classList.remove('hidden');

        sarabanState.step = 2;
        updateSarabanInstruction('👉 ขั้นตอนที่ 2: คลิกบริเวณที่จะวาง "วันที่"', 'bg-blue-100', 'text-blue-800');

    } else if (sarabanState.step === 2) {
        // จิ้มครั้งที่ 2: วางวันที่
        sarabanState.posDate = { x: x, y: y };
        const marker = document.getElementById('marker-date');
        marker.style.left = `${markerLeft}px`;
        marker.style.top  = `${markerTop}px`;
        marker.classList.remove('hidden');
        
        sarabanState.step = 3;
        updateSarabanInstruction('✅ กำหนดตำแหน่งครบแล้ว กดยืนยันการประทับตราได้เลย', 'bg-green-100', 'text-green-800');
        
        // เปิดปุ่มบันทึก
        const btnConfirm = document.getElementById('btn-saraban-confirm');
        btnConfirm.disabled = false;
        btnConfirm.classList.remove('opacity-50', 'cursor-not-allowed');
    }
});

// 3. ฟังก์ชันรีเซ็ตจุด
function resetSarabanMarkers() {
    sarabanState.step = 1;
    sarabanState.posNum = null;
    sarabanState.posDate = null;
    document.getElementById('marker-num').classList.add('hidden');
    document.getElementById('marker-date').classList.add('hidden');
    updateSarabanInstruction('👉 ขั้นตอนที่ 1: กรอกข้อมูลให้ครบ แล้วคลิกบริเวณที่จะวาง "เลขที่"', 'bg-yellow-100', 'text-yellow-800');
    
    const btnConfirm = document.getElementById('btn-saraban-confirm');
    btnConfirm.disabled = true;
    btnConfirm.classList.add('opacity-50', 'cursor-not-allowed');
}

function updateSarabanInstruction(text, bgClass, textClass) {
    const inst = document.getElementById('saraban-instruction').parentElement;
    document.getElementById('saraban-instruction').innerText = text;
    inst.className = `px-4 py-2 rounded-lg border text-sm font-bold ${bgClass} ${textClass}`;
}

function closeSarabanModal() {
    document.getElementById('saraban-stamper-modal').classList.add('hidden');
}

// 4. ฟังก์ชันประทับตราจริง (pdf-lib)
async function applySarabanStamps() {
    try {
        toggleLoader('btn-saraban-confirm', true);
        
        const docNum = document.getElementById('saraban-doc-num').value.trim();
        const docDate = document.getElementById('saraban-doc-date').value.trim();
        
        // โหลด PDF ต้นฉบับ
        const pdfDoc = await PDFLib.PDFDocument.load(sarabanState.pdfBytes);
        pdfDoc.registerFontkit(window.fontkit); // ต้องใช้คู่กับ @pdf-lib/fontkit
        
        // โหลดฟอนต์ (คุณต้องมีไฟล์ THSarabun.ttf ในโฟลเดอร์โปรเจกต์)
        // [ข้อควรระวัง] URL ตรงนี้ต้องชี้ไปที่ฟอนต์ในเว็บของคุณ
        let customFont;
        try {
            const fontRes = await fetch('/fonts/THSarabun.ttf');
            if (!fontRes.ok) throw new Error(`โหลดฟอนต์ไม่สำเร็จ (HTTP ${fontRes.status})`);
            const fontBytes = await fontRes.arrayBuffer();
            customFont = await pdfDoc.embedFont(fontBytes);
        } catch (fontErr) {
            console.error("Font loading failed:", fontErr);
            throw new Error("ไม่สามารถโหลดฟอนต์ THSarabun ได้ กรุณาตรวจสอบไฟล์ /fonts/THSarabun.ttf");
        }

        const page       = pdfDoc.getPages()[0];
        const pageWidth  = page.getWidth();
        const pageHeight = page.getHeight();

        // ใช้ getBoundingClientRect ของ canvas เพื่อให้ถูกต้องแม้บนจอที่ CSS scale canvas
        const sarabanCanvas = document.getElementById('saraban-pdf-canvas');
        const cssW = sarabanCanvas.getBoundingClientRect().width;
        const cssH = sarabanCanvas.getBoundingClientRect().height;

        // ฟังก์ชันช่วยแปลงพิกัดจากหน้าจอ (CSS px relative to canvas) -> พิกัด PDF (แกน Y กลับด้าน)
        const getPdfCoords = (screenPos) => ({
            x: screenPos.x * (pageWidth  / cssW),
            y: pageHeight - screenPos.y * (pageHeight / cssH) - 6 // ปรับชดเชยความสูงฟอนต์
        });

        const pdfPosNum = getPdfCoords(sarabanState.posNum);
        const pdfPosDate = getPdfCoords(sarabanState.posDate);

        // ฟังก์ชันแปลงเลขเป็นเลขไทย (คุณมีฟังก์ชัน toThaiNum อยู่แล้วใน utils.js หรือใช้ตามนี้)
        const thaiNum = docNum.replace(/\d/g, match => '๐๑๒๓๔๕๖๗๘๙'[match]);
        const thaiDate = docDate.replace(/\d/g, match => '๐๑๒๓๔๕๖๗๘๙'[match]);

        // พิมพ์ข้อความลง PDF
        page.drawText(thaiNum, { x: pdfPosNum.x, y: pdfPosNum.y, size: 16, font: customFont, color: PDFLib.rgb(0,0,0) });
        page.drawText(thaiDate, { x: pdfPosDate.x, y: pdfPosDate.y, size: 16, font: customFont, color: PDFLib.rgb(0,0,0) });

        // --- บันทึก PDF และอัปโหลดขึ้น Google Drive ---
        const modifiedPdfBytes = await pdfDoc.save();
        const modifiedBlob = new Blob([modifiedPdfBytes], { type: "application/pdf" });

        showAlert('กำลังดำเนินการ', 'กำลังบันทึกและส่งเอกสารไปยังผู้อำนวยการ...', false);

        const user   = (typeof getCurrentUser === 'function') ? getCurrentUser() : null;
        const docId  = sarabanState.docId;
        const safeId = docId ? docId.replace(/[\/\\:\.]/g, '-') : 'unknown';

        const base64Data = await blobToBase64(modifiedBlob);
        const uploadRes  = await apiCall('POST', 'uploadGeneratedFile', {
            data:      base64Data,
            filename:  `saraban_${safeId}.pdf`,
            mimeType:  'application/pdf',
            username:  user?.username || 'saraban'
        });

        if (!uploadRes || uploadRes.status !== 'success') {
            throw new Error(uploadRes?.message || 'อัปโหลดไม่สำเร็จ');
        }

        const newPdfUrl = uploadRes.url;

        // --- อัปเดต Firestore ---
        if (typeof db !== 'undefined') {
            await db.collection('requests').doc(safeId).set({
                pdfUrl:          newPdfUrl,
                currentPdfUrl:   newPdfUrl,
                memoPdfUrl:      newPdfUrl,
                docStatus:       'waiting_director',
                sarabanDocNum:   docNum,
                sarabanDocDate:  docDate,
                sarabanStampedAt: firebase.firestore.FieldValue.serverTimestamp(),
                sarabanStampedBy: user?.name || user?.username || 'saraban',
                lastUpdated:     firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        }

        // --- อัปเดต Google Sheet (ไม่ blocking) ---
        apiCall('POST', 'updateRequest', {
            requestId: docId,
            pdfUrl:    newPdfUrl,
            docStatus: 'waiting_director',
            refNumber: docNum,
        }).catch(err => console.warn("Sheet update error:", err));

        document.getElementById('alert-modal').style.display = 'none';
        closeSarabanModal();

        // แจ้งผลลัพธ์ (แอดมินจะสร้างลิงก์ให้ผู้อำนวยการผ่านหน้าจัดการลิงก์)
        if (window._currentSignToken) {
            // ลงนามผ่าน Token Page: mark used + แสดงผลสำเร็จ
            if (typeof markCurrentTokenUsed === 'function') await markCurrentTokenUsed();
            if (typeof showTokenSignSuccess === 'function') {
                showTokenSignSuccess('waiting_director', null);
            }
        } else {
            // ลงนามจาก Dashboard: alert เท่านั้น
            showAlert('✅ สำเร็จ', `ออกเลขที่ ${docNum} เรียบร้อย เอกสารส่งไปยังผู้อำนวยการแล้ว`);
            if (typeof loadPendingApprovals === 'function') loadPendingApprovals();
        }

    } catch (e) {
        console.error(e);
        const alertModal = document.getElementById('alert-modal');
        if (alertModal) alertModal.style.display = 'none';
        alert('เกิดข้อผิดพลาด: ' + e.message);
    } finally {
        toggleLoader('btn-saraban-confirm', false);
    }
}