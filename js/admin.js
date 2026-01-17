// แก้ไขฟังก์ชันนี้ใน admin.js
async function handleAdminGenerateCommand() {
    // 1. ดึงข้อมูลจากฟอร์ม
    const requestId = document.getElementById('admin-command-request-id').value;
    const commandType = document.querySelector('input[name="admin-command-type"]:checked')?.value;
    
    if (!commandType) { 
        showAlert('ผิดพลาด', 'กรุณาเลือกรูปแบบคำสั่ง'); 
        return; 
    }
    
    // ดึงรายชื่อผู้ร่วมเดินทาง
    const attendees = [];
    document.querySelectorAll('#admin-command-attendees-list > div').forEach(div => {
        const name = div.querySelector('.admin-att-name').value.trim();
        const pos = div.querySelector('.admin-att-pos').value.trim();
        if (name) attendees.push({ name, position: pos });
    });
    
    // เริ่มทำงาน (หมุน Loader)
    toggleLoader('admin-generate-command-button', true);
    
    try {
        // ------------------------------------------------------------------
        // ส่วนที่ 1: บันทึกข้อมูลลง Google Sheets (ผ่าน GAS เดิม)
        // ------------------------------------------------------------------
        console.log("Saving to Google Sheets...");
        
        const saveData = {
            requestId: requestId,
            templateType: commandType,
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
            licensePlate: document.getElementById('admin-license-plate').value
        };

        // เรียก GAS เพื่อบันทึกข้อมูล (Status: Approved)
        const saveResult = await apiCall('POST', 'approveCommand', saveData);
        
        if (saveResult.status !== 'success') {
            throw new Error(saveResult.message || "บันทึกข้อมูลลง Google Sheets ไม่สำเร็จ");
        }

        // ------------------------------------------------------------------
        // ส่วนที่ 2: สร้าง PDF (ผ่าน Cloud Run ใหม่)
        // ------------------------------------------------------------------
        console.log("Generating PDF...");
        
        const pdfRequestData = {
            doctype: 'command', // บอกว่าเป็นคำสั่ง
            templateType: commandType, // solo, groupSmall, groupLarge
            id: requestId,
            // ส่งข้อมูลชุดเดิมไปทำ PDF
            ...saveData 
        };
        
        // เรียกฟังก์ชันสร้าง PDF (ฟังก์ชันนี้อยู่ใน admin.js ด้านล่างสุดแล้ว)
        await generateOfficialPDF(pdfRequestData);

        // ------------------------------------------------------------------
        // ส่วนที่ 3: อัปเดตหน้าจอเมื่อเสร็จ
        // ------------------------------------------------------------------
        document.getElementById('admin-command-result-title').textContent = 'บันทึกและสร้างคำสั่งสำเร็จ!';
        document.getElementById('admin-command-result-message').textContent = 'บันทึกข้อมูลลงระบบเรียบร้อยแล้ว (ไฟล์ PDF จะเปิดในแท็บใหม่)';
        
        // ซ่อนฟอร์ม แสดงผลลัพธ์
        document.getElementById('admin-command-form').classList.add('hidden');
        document.getElementById('admin-command-result').classList.remove('hidden');
        
        // ล้าง Cache เพื่อให้ข้อมูลในตารางอัปเดต
        clearRequestsCache();
        
    } catch (error) {
        console.error(error);
        showAlert('ข้อผิดพลาด', error.message);
    } finally {
        // ปิด Loader
        toggleLoader('admin-generate-command-button', false);
    }
}
