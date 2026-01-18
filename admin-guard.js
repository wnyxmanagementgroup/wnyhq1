// js/admin-guard.js
(function() {
    // อ่านข้อมูลผู้ใช้จาก Session
    const userStr = sessionStorage.getItem('currentUser');
    
    if (!userStr) {
        // กรณีที่ 1: ยังไม่ได้ Login -> ดีดกลับไปหน้า Login
        window.location.href = 'index.html';
        return;
    }

    try {
        const user = JSON.parse(userStr);
        // กรณีที่ 2: Login แล้ว แต่ไม่ใช่ Admin -> ดีดกลับไปหน้า User Dashboard
        if (user.role !== 'admin') {
            alert('⛔ คุณไม่มีสิทธิ์เข้าถึงส่วนของผู้ดูแลระบบ');
            window.location.href = 'index.html';
        }
    } catch (e) {
        // กรณีข้อมูลพัง -> ให้ Login ใหม่
        sessionStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    }
})();