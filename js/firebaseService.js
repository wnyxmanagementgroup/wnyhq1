// --- FIREBASE HYBRID SERVICE ---
// ไฟล์นี้ทำหน้าที่เป็นตัวกลางจัดการข้อมูลระหว่างหน้าเว็บกับ Firebase (Firestore)
// โดยทำงานร่วมกับ Google Apps Script (GAS) เพื่อประสิทธิภาพสูงสุด

// -----------------------------------------------------------------------------
// 1. HELPER FUNCTIONS
// -----------------------------------------------------------------------------

// แปลงวันที่จาก Firebase Timestamp หรือ String ให้เป็น YYYY-MM-DD
function formatFirebaseDate(val) {
    if (!val) return '';
    // ถ้าเป็น Timestamp (รูปแบบของ Firebase)
    if (val && typeof val.toDate === 'function') {
        try {
            return val.toDate().toISOString().split('T')[0];
        } catch (e) { return ''; }
    }
    // ถ้าเป็น String อยู่แล้ว
    return val;
}

// แปลงค่า undefined ให้เป็น null (เพราะ Firebase ไม่รับ undefined)
function safeVal(val) {
    return val === undefined ? null : val;
}

// -----------------------------------------------------------------------------
// 2. DATA FETCHING (READ)
// -----------------------------------------------------------------------------

/**
 * ดึงข้อมูลคำขอ (Read)
 * - ดึงจาก Firebase (เร็วมาก ไม่ติด Quota)
 * - แปลง Timestamp เพื่อให้ JavaScript นำไป Sort ได้ถูกต้อง
 */
async function fetchRequestsHybrid(user) {
    // ถ้าไม่ได้เชื่อมต่อ Firebase ให้กลับไปใช้ระบบเดิม (GAS)
    if (typeof db === 'undefined' || !db || !USE_FIREBASE) return null; 

    try {
        console.log("🚀 Fetching from Firebase...");
        let query = db.collection('requests');

        // Admin เห็นทั้งหมด (จำกัด 100 รายการล่าสุดเพื่อความเร็ว)
        // User เห็นแค่ของตัวเอง
        if (user.role !== 'admin') {
            query = query.where('username', '==', user.username);
        } else {
            query = query.limit(100); 
        }
        
        // หมายเหตุ: การใช้ orderBy('timestamp', 'desc') ต้องสร้าง Index ใน Firebase Console
        // ถ้ายังไม่สร้าง Index โค้ดนี้จะดึงมาแบบไม่เรียง แล้วมาเรียงใน JS แทน (ซึ่งทำไว้ใน requests.js แล้ว)
        // query = query.orderBy('timestamp', 'desc'); 

        const snapshot = await query.get();
        if (snapshot.empty) return [];

        // แปลงข้อมูลให้อยู่ใน Format เดียวกับหน้าบ้าน
        return snapshot.docs.map(doc => {
            const data = doc.data();
            
            // แปลง Timestamp เป็น JS Date Object เพื่อให้ Sort ทำงานได้
            let ts = data.timestamp;
            if (ts && typeof ts.toDate === 'function') {
                ts = ts.toDate(); // แปลง Firestore Timestamp -> Date
            } else if (ts) {
                ts = new Date(ts); // แปลง String -> Date
            }

            return {
                id: data.requestId || 'รอออกเลข', // ใช้เลขที่หนังสือ
                firebaseId: doc.id,
                ...data,
                // ส่งค่า Date Object ไปให้ JS Sort
                timestamp: ts, 
                // แปลงเป็น String เพื่อแสดงผลในตาราง
                startDate: formatFirebaseDate(data.startDate),
                endDate: formatFirebaseDate(data.endDate),
                docDate: formatFirebaseDate(data.docDate)
            };
        });

    } catch (error) {
        console.error("🔥 Firebase Fetch Error:", error);
        return null; // ส่ง null กลับไปเพื่อให้ระบบใช้ Google Script แทน
    }
}

// -----------------------------------------------------------------------------
// 3. DATA CREATION (WRITE)
// -----------------------------------------------------------------------------

/**
 * สร้างคำขอใหม่ (Write)
 * - บันทึกลง Firebase ก่อน (User เห็นทันที)
 * - ส่งไป Google Script เพื่อทำ PDF
 * - อัปเดต Firebase กลับเมื่อเสร็จ
 */
async function createRequestHybrid(formData) {
    if (typeof db === 'undefined' || !db || !USE_FIREBASE) throw new Error("Firebase not initialized");

    try {
        console.log("💾 Saving to Firebase first...");
        
        // 1. เตรียมข้อมูล
        const timestamp = firebase.firestore.FieldValue.serverTimestamp();
        
        const firebaseData = {
            ...formData,
            status: 'Pending',
            commandStatus: 'กำลังดำเนินการ',
            createdAt: timestamp,
            timestamp: timestamp, // ใช้สำหรับ sort
            pdfUrl: '',
            isHybrid: true
        };

        // Sanitize: วนลูปเช็คทุก field เพื่อป้องกัน undefined (สาเหตุของ Error)
        Object.keys(firebaseData).forEach(key => {
            firebaseData[key] = safeVal(firebaseData[key]);
        });

        // 2. บันทึกลง Firebase (เร็วมาก)
        const docRef = await db.collection('requests').add(firebaseData);
        const firebaseId = docRef.id;
        console.log("✅ Saved to Firebase ID:", firebaseId);

        // 3. ส่งต่อให้ Google Apps Script (Backend Worker)
        // เราส่ง firebaseId ไปด้วย เพื่อให้ GAS รู้ว่าต้องอ้างอิงกับรายการไหน
        const payload = {
            ...formData,
            firebaseId: firebaseId
        };

        // เรียก GAS (รอ PDF)
        const gasResult = await apiCall('POST', 'createRequest', payload);

        // 4. เมื่อ GAS ทำเสร็จ (ได้ PDF มาแล้ว) ให้อัปเดตกลับลง Firebase
        if (gasResult.status === 'success') {
            const updateData = {
                status: 'Submitted', // เปลี่ยนสถานะเป็นรอตรวจสอบ
                requestId: gasResult.data.id // ได้เลขที่หนังสือจริงมาจาก Sheet
            };

            if (gasResult.data.pdfUrl) {
                updateData.pdfUrl = gasResult.data.pdfUrl;
            }

            // Update กลับ
            await db.collection('requests').doc(firebaseId).update(updateData);
            
            return { 
                status: 'success', 
                data: { ...gasResult.data, firebaseId: firebaseId } 
            };
        } else {
            // กรณี GAS พัง อย่างน้อยข้อมูลก็อยู่ใน Firebase แล้ว
            await db.collection('requests').doc(firebaseId).update({ 
                status: 'Error_GAS',
                note: 'บันทึกข้อมูลแล้ว แต่สร้าง PDF ไม่สำเร็จ'
            });
            return { status: 'error', message: 'บันทึกข้อมูลสำเร็จ แต่ระบบสร้าง PDF ขัดข้อง' };
        }

    } catch (error) {
        console.error("🔥 Hybrid Creation Error:", error);
        throw error;
    }
}

// -----------------------------------------------------------------------------
// 4. AUTHENTICATION (HYBRID LOGIN)
// -----------------------------------------------------------------------------

/**
 * ตรวจสอบการเข้าสู่ระบบผ่าน Firebase (เร็วมาก)
 */
async function loginWithFirebase(username, password) {
    if (typeof db === 'undefined' || !db || !USE_FIREBASE) return null;

    try {
        console.log("🔐 Checking login via Firebase...");
        
        // ค้นหา User จาก Collection 'users'
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('username', '==', username).limit(1).get();

        if (snapshot.empty) {
            console.warn("⚠️ User not found in Firebase (Falling back to GAS)");
            return null; // ไม่พบ user (อาจจะยังไม่ได้ sync) ให้ไปถาม GAS
        }

        const userData = snapshot.docs[0].data();

        // ตรวจสอบรหัสผ่าน
        if (userData.password === password) {
            console.log("✅ Firebase Login Success!");
            return {
                status: 'success',
                user: {
                    username: userData.username,
                    fullName: userData.fullName || '',
                    email: userData.email || '',
                    position: userData.position || '',
                    department: userData.department || '',
                    role: userData.role || 'user'
                }
            };
        } else {
            return { status: 'error', message: 'รหัสผ่านไม่ถูกต้อง' };
        }

    } catch (error) {
        console.error("🔥 Firebase Login Error:", error);
        return null; // Error ให้ไปใช้ GAS
    }
}

// -----------------------------------------------------------------------------
// 5. DATA SYNC (ADMIN ONLY)
// -----------------------------------------------------------------------------

/**
 * ฟังก์ชันสำหรับ Admin กดเพื่อดูดข้อมูลจาก Google Sheet มาลง Firebase ทั้งหมด
 * (Requests + Memos Status)
 */
// --- แก้ไขไฟล์ js/firebaseService.js ---

/**
 * ฟังก์ชันสำหรับ Admin กดเพื่อดูดข้อมูลจาก Google Sheet มาลง Firebase ทั้งหมด
 * (ฉบับปรับปรุง: เพิ่มระบบลบข้อมูลที่ไม่อยู่ใน Sheet ออกจาก Firebase)
 */
async function syncAllDataFromSheetToFirebase() {
    if (typeof db === 'undefined' || !db || !USE_FIREBASE) return;

    try {
        console.log("🔄 Start Syncing Requests (Full Sync)...");
        
        // 1. ดึงข้อมูลทั้งหมดจาก Google Sheets
        const [requestsRes, memosRes] = await Promise.all([
            apiCall('GET', 'getAllRequests'),
            apiCall('GET', 'getAllMemos')
        ]);

        if (requestsRes.status !== 'success') throw new Error("ดึงข้อมูล Requests ไม่สำเร็จ");

        const requests = requestsRes.data || [];
        const memos = memosRes.data || [];

        // ⚠️ [ส่วนที่เพิ่มใหม่] 2. ตรวจสอบและลบข้อมูลเก่าใน Firebase ที่ไม่มีใน Sheets แล้ว
        // เก็บรายชื่อ ID จาก Sheets ไว้ใน Set เพื่อความเร็วในการค้นหา
        const sheetIds = new Set(requests.map(r => r.id ? r.id.replace(/\//g, '-') : null).filter(id => id !== null));
        
        const firebaseSnapshot = await db.collection('requests').get();
        const deleteBatch = db.batch();
        let deleteCount = 0;

        firebaseSnapshot.forEach(doc => {
            // ถ้า ID ใน Firebase ไม่พบใน Sheets แสดงว่าคือข้อมูลขยะที่ต้องลบ
            if (!sheetIds.has(doc.id)) {
                deleteBatch.delete(doc.ref);
                deleteCount++;
            }
        });

        // ถ้ามีรายการต้องลบ ให้ทำการลบก่อน
        if (deleteCount > 0) {
            await deleteBatch.commit();
            console.log(`🗑️ Cleanup: Deleted ${deleteCount} old records from Firebase.`);
        }

        // 3. (Logic เดิม) อัปเดตข้อมูลจาก Sheets ลง Firebase
        const batchSize = 500;
        let batch = db.batch();
        let count = 0;
        let totalUpdated = 0;

        for (const req of requests) {
            if (!req.id) continue;

            const relatedMemo = memos.find(m => m.refNumber === req.id);
            
            const parseDate = (d) => {
                if (!d) return null;
                const date = new Date(d);
                return isNaN(date.getTime()) ? null : date;
            };
            
            const docId = req.id.replace(/\//g, '-'); 
            const docRef = db.collection('requests').doc(docId);

            const dataToSave = {
                ...req,
                timestamp: parseDate(req.timestamp) || new Date(),
                startDate: safeVal(req.startDate), 
                docDate: safeVal(req.docDate),
                memoStatus: relatedMemo ? safeVal(relatedMemo.status) : null,
                completedMemoUrl: relatedMemo ? safeVal(relatedMemo.completedMemoUrl) : null,
                completedCommandUrl: relatedMemo ? safeVal(relatedMemo.completedCommandUrl) : null,
                dispatchBookUrl: relatedMemo ? safeVal(relatedMemo.dispatchBookUrl) : null,
                isSynced: true
            };

            Object.keys(dataToSave).forEach(key => {
                if (dataToSave[key] === undefined) {
                    dataToSave[key] = null;
                }
            });

            batch.set(docRef, dataToSave, { merge: true });
            count++;
            totalUpdated++;

            if (count >= batchSize) {
                await batch.commit();
                batch = db.batch();
                count = 0;
            }
        }

        if (count > 0) {
            await batch.commit();
        }

        console.log(`✅ Sync Requests Complete: Updated ${totalUpdated}, Deleted ${deleteCount}.`);
        return { status: 'success', message: `ซิงค์ข้อมูลเสร็จสิ้น (อัปเดต ${totalUpdated}, ลบ ${deleteCount} รายการ)` };

    } catch (error) {
        console.error("Sync Error:", error);
        return { status: 'error', message: error.message };
    }
}
/**
 * ฟังก์ชัน Sync Users จาก Google Sheet ลง Firebase
 */
async function syncUsersToFirebase() {
    if (typeof db === 'undefined' || !db || !USE_FIREBASE) return;

    try {
        console.log("👥 Start Syncing Users...");
        
        const result = await apiCall('GET', 'getAllUsers');
        if (result.status !== 'success') throw new Error("ดึงข้อมูลผู้ใช้จาก Server ไม่สำเร็จ");

        const users = result.data;
        const batch = db.batch();
        let count = 0;

        for (const user of users) {
            if (!user.username) continue;

            const docRef = db.collection('users').doc(user.username);
            
            const userData = {
                username: safeVal(user.username),
                password: safeVal(user.password),
                fullName: safeVal(user.fullName),
                email: safeVal(user.email),
                position: safeVal(user.position),
                department: safeVal(user.department),
                role: safeVal(user.role) || 'user',
                isSynced: true
            };

            batch.set(docRef, userData, { merge: true });
            count++;
        }

        await batch.commit();
        console.log(`✅ User Sync Complete: ${count} users.`);
        return { status: 'success', message: `อัปเดตข้อมูลผู้ใช้เสร็จสิ้น ${count} รายชื่อ` };

    } catch (error) {
        console.error("User Sync Error:", error);
        return { status: 'error', message: error.message };
    }
}
