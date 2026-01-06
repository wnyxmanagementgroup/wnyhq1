async function handleRequestAction(e) {
    const button = e.target.closest('button[data-action]');
    if (!button) return;

    const requestId = button.dataset.id;
    const action = button.dataset.action;
    
    if (action === 'edit') {
        await openEditPage(requestId);
    } else if (action === 'delete') {
        await handleDeleteRequest(requestId);
    } else if (action === 'send-memo') {
        document.getElementById('memo-modal-request-id').value = requestId;
        document.getElementById('send-memo-modal').style.display = 'flex';
    }
}

async function handleDeleteRequest(requestId) {
    try {
        const user = getCurrentUser();
        if (!user) { showAlert('ผิดพลาด', 'กรุณาเข้าสู่ระบบใหม่'); return; }

        const confirmed = await showConfirm(
            'ยืนยันการลบ', 
            `คุณแน่ใจหรือไม่ว่าต้องการลบคำขอ ${requestId}?`
        );
        if (!confirmed) return;

        const result = await apiCall('POST', 'deleteRequest', {
            requestId: requestId,
            username: user.username
        });

        if (result.status === 'success') {
            showAlert('สำเร็จ', 'ลบคำขอเรียบร้อยแล้ว');
            clearRequestsCache();
            await fetchUserRequests();
            // รีเฟรชหน้าแอดมินถ้าเปิดอยู่
             if (document.getElementById('admin-requests-list') && !document.getElementById('admin-requests-list').classList.contains('hidden')) {
                 if (typeof fetchAllRequestsForCommand === 'function') await fetchAllRequestsForCommand();
            }
        } else {
            showAlert('ผิดพลาด', result.message || 'ไม่สามารถลบคำขอได้');
        }
    } catch (error) {
        showAlert('ผิดพลาด', 'เกิดข้อผิดพลาดในการลบคำขอ: ' + error.message);
    }
}

async function fetchUserRequests() {
    try {
        const user = getCurrentUser();
        if (!user) return;

        document.getElementById('requests-loader').classList.remove('hidden');
        document.getElementById('requests-list').classList.add('hidden');
        document.getElementById('no-requests-message').classList.add('hidden');

        const [requestsResult, memosResult] = await Promise.all([
            apiCall('GET', 'getUserRequests', { username: user.username }),
            apiCall('GET', 'getSentMemos', { username: user.username })
        ]);

        if (requestsResult.status === 'success') {
            allRequestsCache = requestsResult.data;
            userMemosCache = memosResult.data || [];
            renderRequestsList(allRequestsCache, userMemosCache);
        }
    } catch (error) {
        console.error('Error fetching requests:', error);
    } finally {
        document.getElementById('requests-loader').classList.add('hidden');
    }
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
        filteredRequests = requests.filter(req => 
            (req.purpose && req.purpose.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (req.location && req.location.toLowerCase().includes(searchTerm.toLowerCase())) ||
            (req.id && req.id.toLowerCase().includes(searchTerm.toLowerCase()))
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
        
        const isFullyCompleted = relatedMemo && relatedMemo.status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน';
        
        return `
            <div class="border rounded-lg p-4 mb-4 bg-white shadow-sm ${isFullyCompleted ? 'border-green-300 bg-green-50' : ''}">
                <div class="flex justify-between items-start">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-2">
                            <h3 class="font-bold text-lg">${request.id || 'ไม่มีรหัส'}</h3>
                            ${isFullyCompleted ? `<span class="bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full">✅ เสร็จสิ้นทั้งหมด</span>` : ''}
                            ${relatedMemo && relatedMemo.status === 'นำกลับไปแก้ไข' ? `<span class="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">⚠️ ต้องแก้ไข</span>` : ''}
                        </div>
                        <p class="text-gray-600">${request.purpose || 'ไม่มีวัตถุประสงค์'}</p>
                        <p class="text-sm text-gray-500">สถานที่: ${request.location || 'ไม่ระบุ'} | วันที่: ${formatDisplayDate(request.startDate)} - ${formatDisplayDate(request.endDate)}</p>
                        <div class="mt-2 space-y-1">
                            <p class="text-sm"><span class="font-medium">สถานะคำขอ:</span> <span class="${getStatusColor(displayRequestStatus)}">${translateStatus(displayRequestStatus)}</span></p>
                            <p class="text-sm"><span class="font-medium">สถานะคำสั่ง:</span> <span class="${getStatusColor(displayCommandStatus || 'กำลังดำเนินการ')}">${translateStatus(displayCommandStatus || 'กำลังดำเนินการ')}</span></p>
                        </div>
                        ${isFullyCompleted ? `
                            <div class="mt-3 p-3 bg-green-50 rounded-lg border border-green-200">
                                <p class="text-sm font-medium text-green-800 mb-2">📁 ไฟล์ที่พร้อมดาวน์โหลด:</p>
                                <div class="flex flex-wrap gap-2">
                                    ${relatedMemo.completedMemoUrl ? `<a href="${relatedMemo.completedMemoUrl}" target="_blank" class="btn btn-success btn-sm text-xs">📄 บันทึกข้อความสมบูรณ์</a>` : ''}
                                    ${relatedMemo.completedCommandUrl ? `<a href="${relatedMemo.completedCommandUrl}" target="_blank" class="btn bg-blue-500 text-white btn-sm text-xs">📋 คำสั่งไปราชการสมบูรณ์</a>` : ''}
                                    ${relatedMemo.dispatchBookUrl ? `<a href="${relatedMemo.dispatchBookUrl}" target="_blank" class="btn bg-purple-500 text-white btn-sm text-xs">📦 หนังสือส่งสมบูรณ์</a>` : ''}
                                </div>
                            </div>
                        ` : ''}
                    </div>
                    <div class="flex gap-2 flex-col ml-4">
                        ${request.pdfUrl ? `<a href="${request.pdfUrl}" target="_blank" class="btn btn-success btn-sm">📄 PDF</a>` : ''}
                        ${request.docUrl ? `<a href="${request.docUrl}" target="_blank" class="btn bg-blue-600 hover:bg-blue-700 text-white btn-sm">📝 Word</a>` : ''}
                        
                        ${!isFullyCompleted ? `<button data-action="edit" data-id="${request.id}" class="btn bg-blue-500 text-white btn-sm">✏️ แก้ไข</button>` : ''}
                        ${!isFullyCompleted ? `<button data-action="delete" data-id="${request.id}" class="btn btn-danger btn-sm">🗑️ ลบ</button>` : ''}
                        ${(!relatedMemo || relatedMemo.status === 'นำกลับไปแก้ไข') && !isFullyCompleted ? `<button data-action="send-memo" data-id="${request.id}" class="btn bg-green-500 text-white btn-sm">📤 ส่งบันทึก</button>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.classList.remove('hidden');
    noRequestsMessage.classList.add('hidden');
    container.addEventListener('click', handleRequestAction);
}

function resetEditPage() {
    document.getElementById('edit-request-form').reset();
    document.getElementById('edit-attendees-list').innerHTML = '';
    document.getElementById('edit-result').classList.add('hidden');
    sessionStorage.removeItem('currentEditRequestId');
    document.getElementById('edit-request-id').value = '';
    document.getElementById('edit-draft-id').value = '';
}

async function openEditPage(requestId) {
    try {
        if (!requestId) { showAlert("ผิดพลาด", "ไม่พบรหัสคำขอ"); return; }
        const user = getCurrentUser();
        if (!user) { showAlert("ผิดพลาด", "กรุณาเข้าสู่ระบบใหม่"); return; }
        
        document.getElementById('edit-result').classList.add('hidden');
        document.getElementById('edit-attendees-list').innerHTML = `<div class="text-center p-4"><div class="loader mx-auto"></div><p class="mt-2">กำลังโหลดข้อมูล...</p></div>`;
        
        const result = await apiCall('GET', 'getDraftRequest', { requestId: requestId, username: user.username });
        
        if (result.status === 'success' && result.data) {
            let data = result.data;
            if (result.data.data) { data = result.data.data; }
            if (data.status === 'error') { showAlert("ผิดพลาด", data.message || "เกิดข้อผิดพลาดในการดึงข้อมูล"); return; }
            data.attendees = Array.isArray(data.attendees) ? data.attendees : [];
            
            // ใช้ชื่อ User เดิมหากไม่มีข้อมูล
            if ((!data.requesterName || data.requesterName.trim() === '') && user?.fullName) { data.requesterName = user.fullName; }
            if ((!data.requesterPosition || data.requesterPosition.trim() === '') && user?.position) { data.requesterPosition = user.position; }

            sessionStorage.setItem('currentEditRequestId', requestId);
            await populateEditForm(data);
            switchPage('edit-page');
        } else {
            showAlert("ผิดพลาด", result.message || "ไม่พบข้อมูลคำขอ");
        }
    } catch (error) {
        showAlert("ผิดพลาด", "ไม่สามารถโหลดข้อมูลสำหรับแก้ไขได้: " + error.message);
    }
}

async function populateEditForm(requestData) {
    try {
        document.getElementById('edit-draft-id').value = requestData.draftId || '';
        document.getElementById('edit-request-id').value = requestData.requestId || requestData.id || '';
        const formatDateForInput = (dateValue) => {
            if (!dateValue) return '';
            try { return new Date(dateValue).toISOString().split('T')[0]; } catch (e) { return ''; }
        };
        document.getElementById('edit-doc-date').value = formatDateForInput(requestData.docDate);
        document.getElementById('edit-requester-name').value = requestData.requesterName || '';
        document.getElementById('edit-requester-position').value = requestData.requesterPosition || '';
        document.getElementById('edit-location').value = requestData.location || '';
        document.getElementById('edit-purpose').value = requestData.purpose || '';
        document.getElementById('edit-start-date').value = formatDateForInput(requestData.startDate);
        document.getElementById('edit-end-date').value = formatDateForInput(requestData.endDate);
        
        const attendeesList = document.getElementById('edit-attendees-list');
        attendeesList.innerHTML = '';
        if (requestData.attendees && requestData.attendees.length > 0) {
            requestData.attendees.forEach((attendee) => {
                if (attendee.name && attendee.position) {
                    addEditAttendeeField(attendee.name, attendee.position);
                }
            });
        }
        
        if (requestData.expenseOption === 'partial') {
            document.getElementById('edit-expense_partial').checked = true;
            toggleEditExpenseOptions();
            if (requestData.expenseItems) {
                const expenseItems = typeof requestData.expenseItems === 'string' ? JSON.parse(requestData.expenseItems) : requestData.expenseItems;
                expenseItems.forEach(item => {
                    document.querySelectorAll('input[name="edit-expense_item"]').forEach(chk => {
                        if (chk.dataset.itemName === item.name) {
                            chk.checked = true;
                            if (item.name === 'ค่าใช้จ่ายอื่นๆ') document.getElementById('edit-expense_other_text').value = item.detail || '';
                        }
                    });
                });
            }
            if (requestData.totalExpense) document.getElementById('edit-total-expense').value = requestData.totalExpense;
        } else {
            document.getElementById('edit-expense_no').checked = true;
            toggleEditExpenseOptions();
        }
        
        if (requestData.vehicleOption) {
            const vehicleRadio = document.querySelector(`input[name="edit-vehicle_option"][value="${requestData.vehicleOption}"]`);
            if (vehicleRadio) {
                vehicleRadio.checked = true;
                toggleEditVehicleOptions();
                if (requestData.vehicleOption === 'private') document.getElementById('edit-license-plate').value = requestData.licensePlate || '';
                if (requestData.vehicleOption === 'public') document.getElementById('edit-public-vehicle-details').value = requestData.licensePlate || '';
            }
        }
        
        if (requestData.department) {
            document.getElementById('edit-department').value = requestData.department;
            document.getElementById('edit-head-name').value = specialPositionMap[requestData.department] || '';
        }
        if (requestData.headName) document.getElementById('edit-head-name').value = requestData.headName;

    } catch (error) { console.error("Error populating edit form:", error); }
}

function addEditAttendeeField(name = '', position = '') {
    const list = document.getElementById('edit-attendees-list');
    const div = document.createElement('div');
    div.className = 'grid grid-cols-1 md:grid-cols-3 gap-2 items-center mb-2 bg-gray-50 p-3 rounded border border-gray-200';
    div.innerHTML = `
        <div class="md:col-span-1"><label class="text-xs text-gray-500 mb-1 block">ชื่อ-นามสกุล</label><input type="text" class="form-input attendee-name w-full" value="${name}" required></div>
        <div class="md:col-span-1"><label class="text-xs text-gray-500 mb-1 block">ตำแหน่ง</label><select class="form-input attendee-position-select w-full"><option value="">-- เลือกตำแหน่ง --</option><option value="ครู">ครู</option><option value="other">อื่นๆ (ระบุเอง)</option></select><input type="text" class="form-input attendee-position-other w-full mt-1 hidden" placeholder="ระบุตำแหน่ง" value="${position}"></div>
        <div class="md:col-span-1 text-right"><button type="button" class="text-red-500 remove-attendee-btn">ลบ</button></div>`;
    list.appendChild(div);
    const select = div.querySelector('.attendee-position-select');
    const otherInput = div.querySelector('.attendee-position-other');
    if (position && select.querySelector(`option[value="${position}"]`)) select.value = position;
    else if (position) { select.value = 'other'; otherInput.classList.remove('hidden'); }
    select.addEventListener('change', function() { otherInput.classList.toggle('hidden', this.value !== 'other'); if(this.value !== 'other') otherInput.value = ''; });
    div.querySelector('.remove-attendee-btn').addEventListener('click', () => div.remove());
}

async function generateDocumentFromDraft() {
    // Logic คล้าย createRequest แต่ส่ง draftId/requestId ไปด้วย (โค้ดจะคล้ายเดิมที่ท่านมีอยู่)
    // ต้องแน่ใจว่าเรียก API 'createRequest' หรือ 'updateRequest' ตามบริบท
}
