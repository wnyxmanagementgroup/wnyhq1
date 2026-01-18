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
// --- แก้ไขไฟล์ js/firebaseService.js ---

/**
 * ฟังก์ชันสำหรับ Admin กดเพื่อดูดข้อมูลจาก Google Sheet มาลง Firebase ทั้งหมด
 * (ฉบับแก้ไข: ล้างข้อมูลขยะที่ ID ไม่ตรงกัน หรือข้อมูลเก่าที่ค้างอยู่ออกทั้งหมด)
 */
async function syncAllDataFromSheetToFirebase() {
    if (typeof db === 'undefined' || !db || !USE_FIREBASE) return;

    try {
        console.log("🔄 Start Syncing Requests (Deep Clean Mode)...");
        
        // 1. ดึงข้อมูลทั้งหมดจาก Google Sheets (ข้อมูลต้นฉบับที่ถูกต้อง)
        const [requestsRes, memosRes] = await Promise.all([
            apiCall('GET', 'getAllRequests'),
            apiCall('GET', 'getAllMemos')
        ]);

        if (requestsRes.status !== 'success') throw new Error("ดึงข้อมูล Requests ไม่สำเร็จ");

        const requests = requestsRes.data || [];
        const memos = memosRes.data || [];

        // สร้างรายการ ID ที่ "ถูกต้อง" จาก Google Sheets เก็บไว้เช็ค
        // เราจะเก็บทั้ง 'id' และ 'requestId' เผื่อไว้
        const validIds = new Set(
            requests.map(r => r.id || r.requestId).filter(id => id && id !== "")
        );

        console.log(`📋 Found ${validIds.size} valid records in Sheets.`);

        // 2. ล้างบาง! ตรวจสอบข้อมูลใน Firebase ทุกตัว
        const firebaseSnapshot = await db.collection('requests').get();
        const batch = db.batch(); // เตรียม Batch สำหรับลบและอัปเดต
        let deleteCount = 0;
        let updateCount = 0;

        // วนลูปดูข้อมูลทุกตัวใน Firebase
        firebaseSnapshot.forEach(doc => {
            const data = doc.data();
            // ดูว่าข้อมูลนี้ มี ID ตรงกับใน Google Sheets ไหม? (เช็คที่เนื้อหา field id/requestId)
            const recordId = data.id || data.requestId;

            if (!recordId || !validIds.has(recordId)) {
                // ❌ ถ้าไม่มี ID หรือ ID นั้นไม่อยู่ใน Sheets แล้ว -> ลบทิ้ง!
                batch.delete(doc.ref);
                deleteCount++;
                console.log(`🗑️ Mark for delete: ${doc.id} (Ref ID: ${recordId})`);
            }
        });

        // 3. เอาข้อมูลที่ถูกต้องจาก Sheets ยัดลงไปใหม่ (Update/Insert)
        // (ใช้ Batch เดียวกันเพื่อให้ทำงานรวดเร็ว)
        
        // หมายเหตุ: Firebase จำกัด 1 Batch ไม่เกิน 500 operation ถ้าข้อมูลเยอะต้องแบ่งรอบ
        // แต่เพื่อความง่ายในเคสนี้ที่ข้อมูลอาจไม่ถึง 500 หรือถ้าเกิน ระบบจะตัดรอบให้ใน Loop นี้
        
        // เรา Commit ชุดที่ลบไปก่อน เพื่อเคลียร์ที่
        if (deleteCount > 0) {
            await batch.commit();
            console.log(`✅ Deleted ${deleteCount} old records.`);
            // สร้าง Batch ใหม่สำหรับการเขียน
        }
        
        // เริ่ม Batch ใหม่สำหรับการเขียน
        let writeBatch = db.batch();
        let opsCount = 0;

        for (const req of requests) {
            if (!req.id) continue;

            const relatedMemo = memos.find(m => m.refNumber === req.id);
            const parseDate = (d) => {
                if (!d) return null;
                const date = new Date(d);
                return isNaN(date.getTime()) ? null : date;
            };
            
            // ตั้งชื่อ Document ID ให้ตรงกับเลขที่หนังสือ (แทนที่ / ด้วย -)
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

            // แก้ค่า undefined เป็น null
            Object.keys(dataToSave).forEach(key => {
                if (dataToSave[key] === undefined) dataToSave[key] = null;
            });

            writeBatch.set(docRef, dataToSave, { merge: true });
            opsCount++;
            updateCount++;

            // ถ้าครบ 450 รายการ ให้บันทึกก่อน (เผื่อ safety limit 500)
            if (opsCount >= 450) {
                await writeBatch.commit();
                writeBatch = db.batch();
                opsCount = 0;
            }
        }

        if (opsCount > 0) {
            await writeBatch.commit();
        }

        console.log(`✅ Sync Complete: Updated/Inserted ${updateCount} records.`);
        return { status: 'success', message: `ซิงค์ข้อมูลสมบูรณ์ (ลบ ${deleteCount}, อัปเดต ${updateCount})` };

    } catch (error) {
        console.error("Sync Error:", error);
        return { status: 'error', message: error.message };
    }
}
