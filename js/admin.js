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
        const result = await apiCall('GET', 'getAllRequests');
        if (result.status === 'success') {
            let requests = result.data || [];
            // Sort: Newest First
            requests.sort((a, b) => {
                const timeA = new Date(a.timestamp || a.docDate || 0).getTime();
                const timeB = new Date(b.timestamp || b.docDate || 0).getTime();
                return timeB - timeA;
            });
            renderAdminRequestsList(requests);
        }
    } catch (error) { 
        showAlert('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลคำขอได้'); 
    }
}

async function fetchAllMemos() {
    try {
        if (!checkAdminAccess()) return;
        const result = await apiCall('GET', 'getAllMemos');
        if (result.status === 'success') {
            let memos = result.data || [];
            memos.sort((a, b) => {
                const timeA = new Date(a.timestamp || 0).getTime();
                const timeB = new Date(b.timestamp || 0).getTime();
                return timeB - timeA;
            });
            renderAdminMemosList(memos);
        }
    } catch (error) { 
        showAlert('ผิดพลาด', 'ไม่สามารถโหลดข้อมูลบันทึกข้อความได้'); 
    }
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

// --- HELPER: วันที่และตัวเลข ---
function getThaiMonth(dateStr) {
    const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
    const d = new Date(dateStr);
    return months[d.getMonth()];
}

function getThaiYear(dateStr) {
    const d = new Date(dateStr);
    return (d.getFullYear() + 543).toString();
}

function calculateDuration(start, end) {
    const d1 = new Date(start);
    const d2 = new Date(end);
    const diffTime = Math.abs(d2 - d1);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // นับวันแรกด้วย
    return diffDays;
}

// --- GENERATE COMMAND FUNCTIONS ---

async function handleAdminGenerateCommand() {
    const requestId = document.getElementById('admin-command-request-id').value;
    const commandType = document.querySelector('input[name="admin-command-type"]:checked')?.value;
    
    if (!commandType) { showAlert('ผิดพลาด', 'กรุณาเลือกรูปแบบคำสั่ง'); return; }
    
    // ดึงรายชื่อจากหน้า UI (ที่อาจมีการแก้ไข)
    const attendees = [];
    document.querySelectorAll('#admin-command-attendees-list > div').forEach((div, index) => {
        const name = div.querySelector('.admin-att-name').value.trim();
        const pos = div.querySelector('.admin-att-pos').value.trim();
        if (name) attendees.push({ i: index + 1, name: name, position: pos });
    });
    
    toggleLoader('admin-generate-command-button', true);
    
    try {
        // เตรียมข้อมูลชุดใหญ่ (Full Data Object)
        const rawData = {
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
            // ข้อมูล Hidden Fields
            expenseOption: document.getElementById('admin-expense-option').value,
            expenseItems: document.getElementById('admin-expense-items').value,
            totalExpense: document.getElementById('admin-total-expense').value,
            vehicleOption: document.getElementById('admin-vehicle-option').value,
            licensePlate: document.getElementById('admin-license-plate').value
        };

        // 1. บันทึกข้อมูลลง Google Sheets
        console.log("Saving to Google Sheets...");
        const saveResult = await apiCall('POST', 'approveCommand', rawData);
        if (saveResult.status !== 'success') throw new Error(saveResult.message || "บันทึกข้อมูลไม่สำเร็จ");

        // 2. สร้าง PDF (ส่งข้อมูลไป Generate)
        console.log("Generating PDF...");
        const pdfRequestData = {
            doctype: 'command', 
            templateType: commandType, 
            id: requestId,
            ...rawData 
        };
        await generateOfficialPDF(pdfRequestData);

        // 3. จบการทำงาน
        document.getElementById('admin-command-result-title').textContent = 'สำเร็จ!';
        document.getElementById('admin-command-result-message').textContent = 'บันทึกข้อมูลและสร้างเอกสารเรียบร้อยแล้ว';
        document.getElementById('admin-command-form').classList.add('hidden');
        document.getElementById('admin-command-result').classList.remove('hidden');
        clearRequestsCache();
        
    } catch (error) {
        console.error(error);
        showAlert('ข้อผิดพลาด', error.message);
    } finally {
        toggleLoader('admin-generate-command-button', false);
    }
}

// --- PDF GENERATION ENGINE (CORE) ---

async function generateOfficialPDF(requestData) {
    try {
        let btnId = 'generate-document-button'; 
        if (requestData.doctype === 'dispatch') btnId = 'dispatch-submit-button';
        if (requestData.doctype === 'command') btnId = 'admin-generate-command-button';
        toggleLoader(btnId, true); 

        // 1. เลือกไฟล์ Template
        let templateFilename = '';
        if (requestData.doctype === 'memo') templateFilename = 'template_memo.docx';
        else if (requestData.doctype === 'command') {
            if (requestData.templateType === 'solo') templateFilename = 'template_command_solo.docx';
            else if (requestData.templateType === 'groupSmall') templateFilename = 'template_command_small.docx';
            else if (requestData.templateType === 'groupLarge') templateFilename = 'template_command_large.docx';
            else templateFilename = 'template_command_solo.docx';
        } else if (requestData.doctype === 'dispatch') templateFilename = 'template_dispatch.docx';

        // 2. โหลดไฟล์ Template
        const response = await fetch(`./${templateFilename}`);
        if (!response.ok) throw new Error(`ไม่พบไฟล์ ${templateFilename} บน Server`);
        const content = await response.arrayBuffer();

        // 3. เตรียมข้อมูลสำหรับ Word (Data Mapping) - จุดสำคัญที่ต้องแก้ให้ตรงกับ Word
        const zip = new PizZip(content);
        const doc = new window.docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

        // แปลง Expense Items เป็น Object เพื่อเช็คได้ง่าย
        let expenseItems = [];
        try { expenseItems = typeof requestData.expenseItems === 'string' ? JSON.parse(requestData.expenseItems) : requestData.expenseItems; } catch(e){}
        const hasExpense = (name) => expenseItems.some(i => i.name === name) ? '✓' : ''; // ใช้เครื่องหมายถูกแทน
        const expenseOther = expenseItems.find(i => i.name === 'ค่าใช้จ่ายอื่นๆ');

        const dataToRender = {
            // ข้อมูลพื้นฐาน
            doc_number: requestData.id || ".....",
            doc_date: formatDisplayDate(requestData.docDate),
            requesterName: requestData.requesterName, // ตรงกับ Word: {{requesterName}}
            requester_position: requestData.requesterPosition, // ตรงกับ Word: {{requester_position}}
            location: requestData.location,
            purpose: requestData.purpose,
            start_date: formatDisplayDate(requestData.startDate),
            end_date: formatDisplayDate(requestData.endDate),
            
            // ข้อมูลคำนวณ
            duration: calculateDuration(requestData.startDate, requestData.endDate),
            total_count: (requestData.attendees ? requestData.attendees.length : 0) + 1, // รวมผู้ขอ
            
            // ข้อมูลวันที่แยกส่วน (สำหรับคำสั่ง)
            MMMM: getThaiMonth(requestData.docDate),
            YYYY: getThaiYear(requestData.docDate),
            date_range: `${formatDisplayDate(requestData.startDate)} - ${formatDisplayDate(requestData.endDate)}`,

            // ข้อมูลการเงิน (Checkboxes)
            expense_no: requestData.expenseOption === 'no' ? '✓' : '',
            expense_partial: requestData.expenseOption === 'partial' ? '✓' : '',
            expense_allowance: hasExpense('ค่าเบี้ยเลี้ยง'),
            expense_food: hasExpense('ค่าอาหาร'),
            expense_accommodation: hasExpense('ค่าที่พัก'),
            expense_transport: hasExpense('ค่าพาหนะ'),
            expense_fuel: hasExpense('ค่าน้ำมัน'),
            expense_other_check: expenseOther ? '✓' : '',
            expense_other_text: expenseOther ? expenseOther.detail : '',
            expense_total: requestData.totalExpense ? Number(requestData.totalExpense).toLocaleString() : '-',

            // ข้อมูลพาหนะ
            vehicle_gov: requestData.vehicleOption === 'gov' ? '✓' : '',
            vehicle_private: requestData.vehicleOption === 'private' ? '✓' : '',
            vehicle_public: requestData.vehicleOption === 'public' ? '✓' : '',
            license_plate: requestData.licensePlate || '-',

            // ข้อมูลผู้ลงนาม (สำหรับ Memo)
            head_name: requestData.headName || '.....................................',
            learning_area: requestData.department || '.....................................',

            // ข้อมูลหนังสือส่ง
            dispatch_month: requestData.dispatchMonth,
            dispatch_year: requestData.dispatchYear,
            command_count: requestData.commandCount,
            memo_count: requestData.memoCount,

            // รายชื่อ (Loop) - ใส่ index ให้แล้ว
            attendees: (requestData.attendees || []).map((att, idx) => ({
                i: idx + 1,
                name: att.name,
                position: att.position
            }))
        };

        // 4. Render ข้อมูล
        try {
            doc.render(dataToRender);
        } catch (error) {
            // ดักจับ Error Template โดยละเอียด
            if (error.properties && error.properties.errors) {
                const errorMessages = error.properties.errors.map(err => err.properties.explanation).join("\n");
                throw new Error("Template Syntax Error:\n" + errorMessages);
            }
            throw error;
        }

        // 5. ส่งไปแปลง PDF (Cloud Run)
        const docxBlob = doc.getZip().generate({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
        const formData = new FormData();
        formData.append("files", docxBlob, "document.docx");
        const cloudRunUrl = "https://pdf-engine-660310608742.asia-southeast1.run.app"; 
        
        const pdfResponse = await fetch(`${cloudRunUrl}/forms/libreoffice/convert`, { method: "POST", body: formData });
        if (!pdfResponse.ok) throw new Error("Server แปลงไฟล์ล้มเหลว (Cloud Run Error)");

        // 6. เปิด PDF
        const pdfBlob = await pdfResponse.blob();
        const pdfUrl = window.URL.createObjectURL(pdfBlob);
        window.open(pdfUrl, '_blank');

    } catch (error) {
        console.error(error);
        alert("เกิดข้อผิดพลาด: " + error.message);
    } finally {
        toggleLoader(requestData.doctype === 'dispatch' ? 'dispatch-submit-button' : 'admin-generate-command-button', false);
    }
}

// ... (ฟังก์ชันอื่นๆ เช่น render... ให้คงไว้เหมือนเดิม หรือก๊อปจากไฟล์เก่ามาต่อท้ายได้เลยครับ)
