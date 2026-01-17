// ==========================================================================
// FILE: stats.js
// รายละเอียด: จัดการการแสดงผลกราฟสถิติและการส่งออกรายงาน Excel
// ==========================================================================

// ฟังก์ชันหลัก: โหลดข้อมูลและแสดงผล
async function loadStatsData() {
    try {
        console.log("🔄 Loading stats data...");
        const user = getCurrentUser();
        if (!user) return;

        // 1. Reset UI (แสดง Loading)
        const overview = document.getElementById('stats-overview');
        const chartsContainer = document.getElementById('stats-charts');
        
        if (overview) overview.innerHTML = `<div class="text-center p-8"><div class="loader mx-auto"></div><p class="mt-4">กำลังโหลดสถิติ...</p></div>`;
        if (chartsContainer) chartsContainer.classList.add('hidden');

        // 2. ดึงข้อมูลจาก API
        const [requestsResult, memosResult, usersResult] = await Promise.all([
            apiCall('GET', 'getAllRequests').catch(() => ({ status: 'success', data: [] })),
            apiCall('GET', 'getAllMemos').catch(() => ({ status: 'success', data: [] })),
            apiCall('GET', 'getAllUsers').catch(() => ({ status: 'success', data: [] }))
        ]);

        const requests = requestsResult?.data || [];
        const memos = memosResult?.data || [];
        const users = usersResult?.data || [];

        // 3. กรองข้อมูลตามสิทธิ์ (Admin เห็นหมด / User เห็นแค่ของตัวเอง)
        const userRequests = user.role === 'admin' ? requests : requests.filter(req => req.username === user.username);
        const userMemos = user.role === 'admin' ? memos : memos.filter(memo => memo.submittedBy === user.username);

        // 4. แสดงผล
        renderStatsOverview(userRequests, userMemos, users, user);

    } catch (error) {
        console.error('❌ Error loading stats:', error);
        const overview = document.getElementById('stats-overview');
        if (overview) {
            overview.innerHTML = `<div class="text-center p-8 text-red-500"><p>เกิดข้อผิดพลาดในการโหลดข้อมูล</p><button onclick="loadStatsData()" class="btn btn-primary btn-sm mt-4">ลองใหม่</button></div>`;
        }
    }
}

// แสดงผลตัวเลขสรุป (Cards)
function renderStatsOverview(requests, memos, users, currentUser) {
    const stats = calculateStats(requests, memos, users, currentUser);
    const container = document.getElementById('stats-overview');
    
    if (!container) return;

    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div class="stat-card bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
                <div class="flex items-center">
                    <div class="bg-blue-100 p-3 rounded-lg text-2xl">📋</div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600">คำขอทั้งหมด</p>
                        <p class="text-2xl font-bold text-gray-900">${stats.totalRequests}</p>
                    </div>
                </div>
            </div>
            <div class="stat-card bg-white rounded-lg shadow p-4 border-l-4 border-green-500">
                <div class="flex items-center">
                    <div class="bg-green-100 p-3 rounded-lg text-2xl">✅</div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600">เสร็จสิ้น</p>
                        <p class="text-2xl font-bold text-gray-900">${stats.completedRequests}</p>
                    </div>
                </div>
            </div>
            <div class="stat-card bg-white rounded-lg shadow p-4 border-l-4 border-purple-500">
                <div class="flex items-center">
                    <div class="bg-purple-100 p-3 rounded-lg text-2xl">📤</div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600">บันทึกข้อความ</p>
                        <p class="text-2xl font-bold text-gray-900">${stats.totalMemos}</p>
                    </div>
                </div>
            </div>
            <div class="stat-card bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500">
                <div class="flex items-center">
                    <div class="bg-yellow-100 p-3 rounded-lg text-2xl">👥</div>
                    <div class="ml-4">
                        <p class="text-sm font-medium text-gray-600">ผู้ใช้ทั้งหมด</p>
                        <p class="text-2xl font-bold text-gray-900">${stats.totalUsers}</p>
                    </div>
                </div>
            </div>
        </div>
        
        <div id="stats-charts" class="mt-8">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="chart-container relative">
                    <h3 class="text-lg font-bold mb-4 text-gray-800">คำขอรายเดือน (6 เดือนล่าสุด)</h3>
                    <canvas id="requests-chart"></canvas>
                </div>
                <div class="chart-container relative">
                    <h3 class="text-lg font-bold mb-4 text-gray-800">สรุปสถานะคำขอ</h3>
                    <canvas id="status-chart"></canvas>
                </div>
            </div>
        </div>`;

    // เรียกสร้างกราฟทันที
    createCharts(stats);
}

// สร้างกราฟ (Charts)
function createCharts(stats) {
    const chartsDiv = document.getElementById('stats-charts');
    if(chartsDiv) chartsDiv.classList.remove('hidden');

    // --- กราฟ 1: รายเดือน ---
    const monthlyCtx = document.getElementById('requests-chart');
    if (monthlyCtx) {
        // Destroy กราฟเก่าเพื่อป้องกันการซ้อนทับ
        if (window.requestsChartInstance) {
            window.requestsChartInstance.destroy();
            window.requestsChartInstance = null;
        }
        
        window.requestsChartInstance = new Chart(monthlyCtx, {
            type: 'bar',
            data: {
                labels: stats.monthlyStats.map(m => m.month),
                datasets: [{
                    label: 'จำนวนคำขอ',
                    data: stats.monthlyStats.map(m => m.count),
                    backgroundColor: 'rgba(79, 70, 229, 0.6)',
                    borderColor: 'rgba(79, 70, 229, 1)',
                    borderWidth: 1,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // บังคับให้กราฟยืดตาม Container
                plugins: { legend: { display: false } },
                scales: { 
                    y: { beginAtZero: true, ticks: { precision: 0 } },
                    x: { grid: { display: false } }
                }
            }
        });
    }

    // --- กราฟ 2: สถานะ ---
    const statusCtx = document.getElementById('status-chart');
    if (statusCtx) {
        if (window.statusChartInstance) {
            window.statusChartInstance.destroy();
            window.statusChartInstance = null;
        }

        const statusEntries = Object.entries(stats.requestStatus);
        window.statusChartInstance = new Chart(statusCtx, {
            type: 'doughnut',
            data: {
                labels: statusEntries.map(([status, count]) => `${status} (${count})`),
                datasets: [{
                    data: statusEntries.map(([status, count]) => count),
                    backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280'],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // บังคับให้กราฟยืดตาม Container
                layout: { padding: 20 },
                plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } } },
                cutout: '60%'
            }
        });
    }
}

// คำนวณข้อมูลสถิติ
function calculateStats(requests, memos, users, currentUser) {
    const requestStatus = {};
    const thStatus = {
        'Submitted': 'รอตรวจสอบ',
        'Approved': 'เสร็จสิ้น',
        'Pending': 'กำลังดำเนินการ',
        'Completed': 'เสร็จสิ้น',
        'เสร็จสิ้น/รับไฟล์ไปใช้งาน': 'เสร็จสิ้น'
    };

    requests.forEach(req => { 
        let rawStatus = req.status || 'กำลังดำเนินการ';
        let status = thStatus[rawStatus] || rawStatus;
        if (status.includes('แก้ไข')) status = 'รอแก้ไข';
        
        requestStatus[status] = (requestStatus[status] || 0) + 1; 
    });
    
    const completedRequests = requests.filter(req => 
        req.status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' || 
        req.status === 'Approved' || 
        req.status === 'เสร็จสิ้น'
    ).length;

    const userStats = { 
        total: users.length, 
        admins: users.filter(u => u.role === 'admin').length, 
        regularUsers: users.filter(u => u.role === 'user').length 
    };
    
    // สถิติรายเดือน (ย้อนหลัง 6 เดือน)
    const monthlyStats = []; 
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = date.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
        
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
        
        const monthRequests = requests.filter(req => {
            const dateString = req.timestamp || req.startDate || req.docDate;
            if (!dateString) return false;
            try { 
                const reqDate = new Date(dateString); 
                return reqDate >= monthStart && reqDate <= monthEnd; 
            } catch (e) { return false; }
        });
        
        monthlyStats.push({ 
            month: monthKey, 
            count: monthRequests.length 
        });
    }
    
    return { 
        totalRequests: requests.length, 
        completedRequests, 
        totalMemos: memos.length, 
        totalUsers: users.length, 
        requestStatus, 
        userStats, 
        monthlyStats 
    };
}

// *** ฟังก์ชันที่หายไป (ตัวต้นเหตุ Error) ***
async function exportStatsReport() {
    try {
        const user = getCurrentUser(); 
        if (!user) return;
        
        toggleLoader('export-stats', true);
        
        // ดึงข้อมูลใหม่ล่าสุด
        const [requestsResult, memosResult, usersResult] = await Promise.all([
            apiCall('GET', 'getAllRequests'), 
            apiCall('GET', 'getAllMemos'), 
            apiCall('GET', 'getAllUsers')
        ]);
        
        const requests = requestsResult.data || []; 
        const memos = memosResult.data || []; 
        const users = usersResult.data || [];
        
        const userRequests = user.role === 'admin' ? requests : requests.filter(req => req.username === user.username);
        const stats = calculateStats(userRequests, memos, users, user);
        
        // เตรียมข้อมูล Excel
        const reportData = [
            ['รายงานสถิติการไปราชการ', '', '', '', ''],
            ['วันที่ออกรายงาน', new Date().toLocaleDateString('th-TH'), '', '', ''],
            ['', '', '', '', ''],
            ['สรุปภาพรวม', '', '', '', ''],
            ['คำขอทั้งหมด', stats.totalRequests, 'รายการ', '', ''],
            ['ดำเนินการเสร็จสิ้น', stats.completedRequests, 'รายการ', '', ''],
            ['', '', '', '', ''],
            ['รายละเอียดรายการ', '', '', '', ''],
            ['วันที่', 'เลขที่/อ้างอิง', 'ผู้ขอ', 'เรื่อง/วัตถุประสงค์', 'สถานที่', 'สถานะ']
        ];

        userRequests.forEach(req => {
            // Helper สำหรับสถานะ (ถ้ามีฟังก์ชัน translateStatus ก็เรียกใช้ได้)
            const statusText = req.status || '-'; 
            
            reportData.push([
                formatDisplayDate(req.startDate),
                req.id || req.requestId || '-',
                req.requesterName || req.username,
                req.purpose,
                req.location,
                statusText
            ]);
        });
        
        // ใช้ Library XLSX
        if (typeof XLSX !== 'undefined') {
            const ws = XLSX.utils.aoa_to_sheet(reportData);
            const wb = XLSX.utils.book_new(); 
            XLSX.utils.book_append_sheet(wb, ws, 'Report');
            XLSX.writeFile(wb, `Report_WNY_${new Date().toISOString().split('T')[0]}.xlsx`);
            
            showAlert('สำเร็จ', 'ส่งออกรายงานเรียบร้อยแล้ว');
        } else {
            throw new Error('ไม่พบไลบรารีสำหรับสร้าง Excel (XLSX)');
        }

    } catch (error) { 
        console.error("Export Error:", error);
        showAlert('ผิดพลาด', 'ไม่สามารถส่งออกรายงานได้: ' + error.message); 
    } finally { 
        toggleLoader('export-stats', false); 
    }
}
