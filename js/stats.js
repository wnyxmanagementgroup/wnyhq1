async function loadStatsData() {
    try {
        console.log("🔄 Loading stats data...");
        const user = getCurrentUser();
        if (!user) return;

        // 1. Reset UI
        document.getElementById('stats-overview').innerHTML = `<div class="text-center p-8"><div class="loader mx-auto"></div><p class="mt-4">กำลังโหลดสถิติ...</p></div>`;
        const chartsContainer = document.getElementById('stats-charts');
        if(chartsContainer) chartsContainer.classList.add('hidden');

        // 2. Load Data
        const [requestsResult, memosResult, usersResult] = await Promise.all([
            apiCall('GET', 'getAllRequests').catch(() => ({ status: 'success', data: [] })),
            apiCall('GET', 'getAllMemos').catch(() => ({ status: 'success', data: [] })),
            apiCall('GET', 'getAllUsers').catch(() => ({ status: 'success', data: [] }))
        ]);

        const requests = requestsResult?.data || [];
        const memos = memosResult?.data || [];
        const users = usersResult?.data || [];

        const userRequests = user.role === 'admin' ? requests : requests.filter(req => req.username === user.username);
        const userMemos = user.role === 'admin' ? memos : memos.filter(memo => memo.submittedBy === user.username);

        // 3. Render
        renderStatsOverview(userRequests, userMemos, users, user);

    } catch (error) {
        console.error('❌ Error loading stats:', error);
        document.getElementById('stats-overview').innerHTML = `<div class="text-center p-8 text-red-500"><p>เกิดข้อผิดพลาดในการโหลดข้อมูล</p><button onclick="loadStatsData()" class="btn btn-primary btn-sm mt-4">ลองใหม่</button></div>`;
    }
}

function renderStatsOverview(requests, memos, users, currentUser) {
    const stats = calculateStats(requests, memos, users, currentUser);
    const container = document.getElementById('stats-overview');
    
    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div class="stat-card bg-white rounded-lg shadow p-4 border-l-4 border-blue-500"><div class="flex items-center"><div class="bg-blue-100 p-3 rounded-lg text-2xl">📋</div><div class="ml-4"><p class="text-sm font-medium text-gray-600">คำขอทั้งหมด</p><p class="text-2xl font-bold text-gray-900">${stats.totalRequests}</p></div></div></div>
            <div class="stat-card bg-white rounded-lg shadow p-4 border-l-4 border-green-500"><div class="flex items-center"><div class="bg-green-100 p-3 rounded-lg text-2xl">✅</div><div class="ml-4"><p class="text-sm font-medium text-gray-600">เสร็จสิ้น</p><p class="text-2xl font-bold text-gray-900">${stats.completedRequests}</p></div></div></div>
            <div class="stat-card bg-white rounded-lg shadow p-4 border-l-4 border-purple-500"><div class="flex items-center"><div class="bg-purple-100 p-3 rounded-lg text-2xl">📤</div><div class="ml-4"><p class="text-sm font-medium text-gray-600">บันทึกข้อความ</p><p class="text-2xl font-bold text-gray-900">${stats.totalMemos}</p></div></div></div>
            <div class="stat-card bg-white rounded-lg shadow p-4 border-l-4 border-yellow-500"><div class="flex items-center"><div class="bg-yellow-100 p-3 rounded-lg text-2xl">👥</div><div class="ml-4"><p class="text-sm font-medium text-gray-600">ผู้ใช้ทั้งหมด</p><p class="text-2xl font-bold text-gray-900">${stats.totalUsers}</p></div></div></div>
        </div>
        <div id="stats-charts" class="mt-8 hidden">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div class="chart-container relative"><h3 class="text-lg font-bold mb-4 text-gray-800">คำขอรายเดือน (6 เดือนล่าสุด)</h3><canvas id="requests-chart"></canvas></div>
                <div class="chart-container relative"><h3 class="text-lg font-bold mb-4 text-gray-800">สรุปสถานะคำขอ</h3><canvas id="status-chart"></canvas></div>
            </div>
        </div>`;

    // เรียกสร้างกราฟทันที (ลบ setTimeout ออกแล้ว)
    createCharts(stats);
}

function createCharts(stats) {
    const chartsDiv = document.getElementById('stats-charts');
    if(chartsDiv) chartsDiv.classList.remove('hidden');

    const monthlyCtx = document.getElementById('requests-chart');
    if (monthlyCtx) {
        if (window.requestsChartInstance) { window.requestsChartInstance.destroy(); }
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
                maintainAspectRatio: false, // สำคัญมาก
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { precision: 0 } }, x: { grid: { display: false } } }
            }
        });
    }

    const statusCtx = document.getElementById('status-chart');
    if (statusCtx) {
        if (window.statusChartInstance) { window.statusChartInstance.destroy(); }
        const statusEntries = Object.entries(stats.requestStatus);
        window.statusChartInstance = new Chart(statusCtx, {
            type: 'doughnut',
            data: {
                labels: statusEntries.map(([status, count]) => `${translateStatus(status)} (${count})`),
                datasets: [{
                    data: statusEntries.map(([status, count]) => count),
                    backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#6b7280'],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // สำคัญมาก
                layout: { padding: 20 },
                plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, padding: 20 } } },
                cutout: '60%'
            }
        });
    }
}

function calculateStats(requests, memos, users, currentUser) {
    const requestStatus = {};
    requests.forEach(req => { 
        let status = req.status || 'กำลังดำเนินการ';
        if (status === 'Submitted') status = 'รอการตรวจสอบ';
        requestStatus[status] = (requestStatus[status] || 0) + 1; 
    });
    
    const completedRequests = requests.filter(req => req.status === 'เสร็จสิ้น/รับไฟล์ไปใช้งาน' || req.status === 'Approved' || req.status === 'เสร็จสิ้น').length;
    const userStats = { total: users.length, admins: users.filter(u => u.role === 'admin').length, regularUsers: users.filter(u => u.role === 'user').length };
    
    const monthlyStats = []; const now = new Date();
    for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const monthKey = date.toLocaleDateString('th-TH', { month: 'short', year: '2-digit' });
        const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
        const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59);
        const monthRequests = requests.filter(req => {
            const dateString = req.timestamp || req.startDate || req.docDate;
            if (!dateString) return false;
            try { const reqDate = new Date(dateString); return reqDate >= monthStart && reqDate <= monthEnd; } catch (e) { return false; }
        });
        monthlyStats.push({ month: monthKey, count: monthRequests.length });
    }
    return { totalRequests: requests.length, completedRequests, totalMemos: memos.length, totalUsers: users.length, requestStatus, userStats, monthlyStats };
}

// ฟังก์ชัน exportStatsReport คงเดิมได้เลย
