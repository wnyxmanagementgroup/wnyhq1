// ==============================================================
// ระบบลงนามผ่านลิงก์เฉพาะ (Token-Based Signing)
// ผู้ลงนามไม่ต้องเข้าสู่ระบบ — เพียงเปิดลิงก์และเซ็นได้เลย
// ==============================================================

// ตัวแปร global สำหรับ token page
window._currentSignToken     = null;
window._currentSignTokenData = null;
window._currentSignReqData   = null;
window._tokenPdfUrl          = null;
window._tokenPdfBytes        = null;

// --- 1. สร้าง Token ID แบบสุ่ม ---
function _generateTokenId() {
    if (window.crypto && window.crypto.getRandomValues) {
        const arr = new Uint8Array(16);
        window.crypto.getRandomValues(arr);
        return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    }
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// --- 2. สร้าง Approval Token ใน Firestore และคืนค่า URL ---
async function generateApprovalToken(requestId, nextDocStatus, docMeta) {
    if (typeof db === 'undefined' || !requestId || !nextDocStatus) return null;

    const token  = _generateTokenId();
    const safeId = requestId.replace(/[\/\\:\.]/g, '-');

    try {
        await db.collection('approvalLinks').doc(token).set({
            requestId:  requestId,
            safeId:     safeId,
            docStatus:  nextDocStatus,
            docTitle:   docMeta?.purpose || docMeta?.docTitle || '',
            requester:  docMeta?.requesterName || '',
            createdAt:  firebase.firestore.FieldValue.serverTimestamp(),
            expiresAt:  new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 วัน
            used:       false,
        });
        const base = window.location.origin + window.location.pathname;
        return `${base}?sign=${token}`;
    } catch (e) {
        console.warn("generateApprovalToken error:", e);
        return null;
    }
}

// --- 3. แสดง Dialog สำหรับคัดลอก Link ---
function showApprovalLinkDialog(url, recipientLabel) {
    const existing = document.getElementById('approval-link-dialog');
    if (existing) existing.remove();
    if (!url) return;

    const escaped = url.replace(/'/g, "\\'");
    const html = `
    <div id="approval-link-dialog"
         class="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[300]"
         onclick="if(event.target===this)this.remove()">
      <div class="bg-white rounded-2xl p-6 max-w-lg w-full mx-4 shadow-2xl" onclick="event.stopPropagation()">
        <div class="text-center mb-5">
          <div class="text-4xl mb-2">🔗</div>
          <h3 class="font-bold text-xl text-gray-800">ลิงก์ขั้นตอนถัดไป</h3>
          <p class="text-sm text-gray-500 mt-1">
            ส่งให้ <span class="font-bold text-blue-700">${recipientLabel}</span>
            เพื่อลงนาม (หมดอายุใน 7 วัน)
          </p>
        </div>
        <div class="flex gap-2 mb-3">
          <input type="text" id="_ald_url" value="${url}" readonly
            class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none"
            onclick="this.select()">
          <button id="_ald_btn"
            onclick="(function(){
              var u = document.getElementById('_ald_url').value;
              var b = document.getElementById('_ald_btn');
              if(navigator.clipboard){
                navigator.clipboard.writeText(u).then(function(){
                  b.textContent='✅ คัดลอกแล้ว!';
                  b.className='bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap';
                });
              } else {
                document.getElementById('_ald_url').select();
                document.execCommand('copy');
                b.textContent='✅ คัดลอกแล้ว!';
                b.className='bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap';
              }
            })()"
            class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700 whitespace-nowrap">
            📋 คัดลอก
          </button>
        </div>
        <p class="text-xs text-gray-400 text-center mb-4">
          ⚠️ ลิงก์ใช้ได้ครั้งเดียว ผู้รับไม่ต้องเข้าสู่ระบบ
        </p>
        <button onclick="document.getElementById('approval-link-dialog').remove()"
          class="w-full py-2 text-sm text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg">
          ปิด
        </button>
      </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    setTimeout(() => { const i = document.getElementById('_ald_url'); if (i) i.select(); }, 100);
}

// --- 4. Mark token as used (เรียกหลังลงนามสำเร็จ) ---
async function markCurrentTokenUsed() {
    const token = window._currentSignToken;
    if (!token || typeof db === 'undefined') return;
    try {
        await db.collection('approvalLinks').doc(token).update({ used: true });
    } catch (e) {
        console.warn("markCurrentTokenUsed error:", e);
    }
    window._currentSignToken     = null;
    window._currentSignTokenData = null;
    window._currentSignReqData   = null;
}

// --- 5. แสดงผลสำเร็จบน Token Page พร้อมลิงก์ขั้นถัดไป ---
function showTokenSignSuccess(nextStatus, linkUrl) {
    const contentEl = document.getElementById('token-content');
    if (!contentEl) return;

    const nextLabel = (typeof getDocStatusLabel === 'function')
        ? getDocStatusLabel(nextStatus)
        : (nextStatus || '');

    let linkSection = '';
    if (linkUrl && nextStatus) {
        linkSection = `
        <div class="mt-4">
          <p class="text-sm text-gray-600 mb-2 font-semibold">🔗 ลิงก์สำหรับ ${nextLabel}:</p>
          <div class="flex gap-2">
            <input type="text" value="${linkUrl}" readonly id="_ts_link"
              class="flex-1 border rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none"
              onclick="this.select()">
            <button onclick="(function(){
                var u=document.getElementById('_ts_link').value;
                var b=this;
                if(navigator.clipboard){navigator.clipboard.writeText(u).then(function(){b.textContent='✅';b.className='bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold';});}
                else{document.getElementById('_ts_link').select();document.execCommand('copy');b.textContent='✅';b.className='bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold';}
              }).call(this)"
              class="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-blue-700">
              📋
            </button>
          </div>
        </div>`;
    }

    contentEl.innerHTML = `
      <div class="text-center p-5 bg-green-50 rounded-xl border border-green-200 mb-2">
        <div class="text-4xl mb-2">✅</div>
        <p class="font-bold text-green-800 text-lg">ดำเนินการสำเร็จ</p>
        ${nextStatus
            ? `<p class="text-sm text-green-600 mt-1">เอกสารส่งต่อไปยัง: <strong>${nextLabel}</strong></p>`
            : '<p class="text-sm text-green-600 mt-1">ขั้นตอนสุดท้ายเสร็จสิ้น</p>'}
      </div>
      ${linkSection}`;
    contentEl.classList.remove('hidden');
}

// --- 6. ตรวจสอบ Token และแสดง UI สำหรับลงนาม ---
async function handleTokenSignFlow(token) {
    const overlay   = document.getElementById('token-sign-overlay');
    const loginEl   = document.getElementById('login-screen');
    const mainAppEl = document.getElementById('main-app');

    if (overlay)   overlay.classList.remove('hidden');
    if (loginEl)   loginEl.classList.add('hidden');
    if (mainAppEl) mainAppEl.classList.add('hidden');

    const loadingEl = document.getElementById('token-loading');
    const infoEl    = document.getElementById('token-info');
    const contentEl = document.getElementById('token-content');
    const errorEl   = document.getElementById('token-error');

    // รอ Firebase โหลด (max 5 วินาที)
    let retries = 0;
    while (typeof db === 'undefined' && retries < 50) {
        await new Promise(r => setTimeout(r, 100));
        retries++;
    }

    try {
        if (typeof db === 'undefined') throw new Error("ไม่สามารถเชื่อมต่อฐานข้อมูลได้");

        const tokenDoc = await db.collection('approvalLinks').doc(token).get();
        if (!tokenDoc.exists) throw new Error("ลิงก์ไม่ถูกต้อง หรือไม่พบในระบบ");

        const td = tokenDoc.data();
        if (td.used) throw new Error("ลิงก์นี้ถูกใช้งานไปแล้ว เอกสารได้รับการดำเนินการเรียบร้อยแล้ว");
        if (td.expiresAt && new Date() > td.expiresAt.toDate()) {
            throw new Error("ลิงก์หมดอายุแล้ว (เกิน 7 วัน) กรุณาขอลิงก์ใหม่จากผู้ส่ง");
        }

        const reqDoc = await db.collection('requests').doc(td.safeId).get();
        if (!reqDoc.exists) throw new Error("ไม่พบเอกสารในระบบ");

        const req    = reqDoc.data();
        const pdfUrl = req.pdfUrl || req.memoPdfUrl || req.currentPdfUrl || '';
        if (!pdfUrl) throw new Error("ไม่พบไฟล์ PDF ของเอกสาร");

        // แสดงข้อมูลเอกสาร
        document.getElementById('token-doc-title').textContent     = req.purpose       || 'เอกสารไปราชการ';
        document.getElementById('token-doc-requester').textContent = req.requesterName || '-';
        document.getElementById('token-doc-date').textContent      = req.startDate     || req.date || '-';
        document.getElementById('token-doc-step').textContent      =
            (typeof getDocStatusLabel === 'function') ? getDocStatusLabel(td.docStatus) : td.docStatus;

        // เก็บไว้ใช้ภายหลัง
        window._currentSignToken     = token;
        window._currentSignTokenData = td;
        window._currentSignReqData   = req;

        if (loadingEl) loadingEl.classList.add('hidden');
        if (infoEl)    infoEl.classList.remove('hidden');
        if (!contentEl) return;
        contentEl.classList.remove('hidden');

        // --- สร้างปุ่มตาม docStatus ---
        if (td.docStatus === 'waiting_saraban') {
            // สารบรรณ: โหลด PDF bytes แล้วเปิด saraban modal
            const resp  = await fetch(pdfUrl);
            const bytes = await resp.arrayBuffer();
            window._tokenPdfBytes = bytes;
            contentEl.innerHTML = `
              <button onclick="openSarabanModal(window._tokenPdfBytes, '${td.requestId}')"
                class="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl flex justify-center items-center gap-2 text-lg shadow-md">
                📝 เปิดระบบออกเลขที่และวันที่
              </button>`;

        } else if (td.docStatus === 'waiting_admin_review') {
            // แอดมิน: ไม่ต้องเซ็น แค่กด forward
            contentEl.innerHTML = `
              <div class="space-y-3">
                <a href="${pdfUrl}" target="_blank"
                  class="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl flex justify-center items-center gap-2 font-medium">
                  📄 ดูเอกสาร PDF
                </a>
                <button onclick="tokenAdminForward()"
                  class="w-full py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl flex justify-center items-center gap-2 text-lg shadow-md">
                  ✅ ตรวจสอบแล้ว ส่งไปงานสารบรรณ
                </button>
              </div>`;

        } else {
            // ทุก role ที่ต้องเซ็น (หัวหน้า, รองบุคคล, รองวิชาการ, ผอ.)
            window._tokenPdfUrl = pdfUrl;
            contentEl.innerHTML = `
              <div class="space-y-3">
                <a href="${pdfUrl}" target="_blank"
                  class="w-full py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl flex justify-center items-center gap-2 font-medium">
                  📄 ดูเอกสาร PDF
                </a>
                <button onclick="openTokenSignatureSystem()"
                  class="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl flex justify-center items-center gap-2 text-lg shadow-md">
                  ✍️ เปิดเอกสารและลงนาม
                </button>
              </div>`;
        }

    } catch (e) {
        console.error("Token sign error:", e);
        if (loadingEl) loadingEl.classList.add('hidden');
        if (errorEl) {
            errorEl.textContent = '❌ ' + e.message;
            errorEl.classList.remove('hidden');
        }
    }
}

// --- 7. เปิด Signature System จาก Token Page ---
function openTokenSignatureSystem() {
    const td = window._currentSignTokenData;
    if (!td || !window._tokenPdfUrl) return;
    openSignatureSystem(window._tokenPdfUrl, td.requestId, '✍️ ลงนามเอกสาร', td.docStatus);
}

// --- 8. Admin forward จาก Token Page (ไม่ต้องเซ็น) ---
async function tokenAdminForward() {
    const td  = window._currentSignTokenData;
    const req = window._currentSignReqData || {};
    if (!td) return;
    try {
        showAlert('กำลังดำเนินการ', 'กำลังส่งเอกสารไปงานสารบรรณ...', false);
        if (typeof db !== 'undefined') {
            await db.collection('requests').doc(td.safeId).set({
                docStatus:       'waiting_saraban',
                adminReviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        }
        apiCall('POST', 'updateRequest', { requestId: td.requestId, docStatus: 'waiting_saraban' })
            .catch(e => console.warn(e));
        await markCurrentTokenUsed();

        document.getElementById('alert-modal').style.display = 'none';
        showTokenSignSuccess('waiting_saraban', null);
    } catch (e) {
        document.getElementById('alert-modal').style.display = 'none';
        alert("เกิดข้อผิดพลาด: " + e.message);
    }
}

// ==============================================================
// ระบบจัดการลิงก์ลงนาม (สำหรับแอดมินเท่านั้น)
// ==============================================================

// Cache เอกสารสำหรับหน้าจัดการลิงก์
window._adminApprovalDocs = {};

// --- 9. Admin: โหลดและแสดงหน้าจัดการลิงก์ลงนาม ---
async function loadApprovalLinkManagement() {
    if (typeof switchPage === 'function') switchPage('admin-approval-links-page');

    const container = document.getElementById('approval-links-container');
    if (!container) return;
    container.innerHTML = '<div class="flex justify-center py-10"><div class="loader"></div></div>';

    if (typeof db === 'undefined') {
        container.innerHTML = '<p class="text-center text-red-500 py-8">ไม่สามารถเชื่อมต่อฐานข้อมูลได้</p>';
        return;
    }

    // Firestore "in" query รองรับสูงสุด 10 ค่า แบ่งเป็น 2 batch
    const batch1 = [
        'waiting_head_thai',    'waiting_head_foreign', 'waiting_head_science',
        'waiting_head_art',     'waiting_head_social',  'waiting_head_health',
        'waiting_head_career',  'waiting_head_math',
        'waiting_dep_personnel','waiting_dep_acad'
    ];
    const batch2 = ['waiting_admin_review', 'waiting_saraban', 'waiting_director'];

    try {
        const [snap1, snap2] = await Promise.all([
            db.collection('requests').where('docStatus', 'in', batch1).get(),
            db.collection('requests').where('docStatus', 'in', batch2).get()
        ]);

        // รวมผลลัพธ์ + เก็บ cache
        window._adminApprovalDocs = {};
        const allDocs = [];
        [snap1, snap2].forEach(snap => {
            snap.docs.forEach(doc => {
                const data = doc.data();
                window._adminApprovalDocs[doc.id] = data;
                allDocs.push({ id: doc.id, ...data });
            });
        });

        if (allDocs.length === 0) {
            container.innerHTML = `
              <div class="text-center py-12 text-gray-400">
                <div class="text-5xl mb-3">📭</div>
                <p class="text-lg font-medium">ไม่มีเอกสารรอดำเนินการ</p>
                <p class="text-sm mt-1">เอกสารทั้งหมดได้รับการดำเนินการเรียบร้อยแล้ว</p>
              </div>`;
            return;
        }

        // จัดกลุ่มตาม docStatus
        const grouped = {};
        allDocs.forEach(doc => {
            const s = doc.docStatus || 'unknown';
            if (!grouped[s]) grouped[s] = [];
            grouped[s].push(doc);
        });

        // ลำดับและข้อมูลการแสดงผลของแต่ละ status
        const statusOrder = [
            'waiting_head_thai',    'waiting_head_foreign', 'waiting_head_science',
            'waiting_head_art',     'waiting_head_social',  'waiting_head_health',
            'waiting_head_career',  'waiting_head_math',
            'waiting_dep_personnel','waiting_dep_acad',
            'waiting_admin_review', 'waiting_saraban',      'waiting_director'
        ];

        const groupMeta = {
            'waiting_head_thai':     { label: 'หัวหน้ากลุ่มสาระภาษาไทย',           color: 'border-orange-300 bg-orange-50',   badge: 'bg-orange-100 text-orange-700'  },
            'waiting_head_foreign':  { label: 'หัวหน้ากลุ่มสาระภาษาต่างประเทศ',    color: 'border-orange-300 bg-orange-50',   badge: 'bg-orange-100 text-orange-700'  },
            'waiting_head_science':  { label: 'หัวหน้ากลุ่มสาระวิทยาศาสตร์',      color: 'border-orange-300 bg-orange-50',   badge: 'bg-orange-100 text-orange-700'  },
            'waiting_head_art':      { label: 'หัวหน้ากลุ่มสาระศิลปะ',             color: 'border-orange-300 bg-orange-50',   badge: 'bg-orange-100 text-orange-700'  },
            'waiting_head_social':   { label: 'หัวหน้ากลุ่มสาระสังคมศึกษา',       color: 'border-orange-300 bg-orange-50',   badge: 'bg-orange-100 text-orange-700'  },
            'waiting_head_health':   { label: 'หัวหน้ากลุ่มสาระสุขศึกษา',         color: 'border-orange-300 bg-orange-50',   badge: 'bg-orange-100 text-orange-700'  },
            'waiting_head_career':   { label: 'หัวหน้ากลุ่มสาระการงานอาชีพ',      color: 'border-orange-300 bg-orange-50',   badge: 'bg-orange-100 text-orange-700'  },
            'waiting_head_math':     { label: 'หัวหน้ากลุ่มสาระคณิตศาสตร์',       color: 'border-orange-300 bg-orange-50',   badge: 'bg-orange-100 text-orange-700'  },
            'waiting_dep_personnel': { label: 'รองผู้อำนวยการ กลุ่มบริหารงานบุคคล', color: 'border-blue-300 bg-blue-50',     badge: 'bg-blue-100 text-blue-700'      },
            'waiting_dep_acad':      { label: 'รองผู้อำนวยการ กลุ่มบริหารวิชาการ',  color: 'border-blue-300 bg-blue-50',     badge: 'bg-blue-100 text-blue-700'      },
            'waiting_admin_review':  { label: 'แอดมิน (ตรวจสอบก่อนส่งสารบรรณ)',    color: 'border-yellow-300 bg-yellow-50', badge: 'bg-yellow-100 text-yellow-700'  },
            'waiting_saraban':       { label: 'งานสารบรรณ (ออกเลขที่และวันที่)',    color: 'border-indigo-300 bg-indigo-50', badge: 'bg-indigo-100 text-indigo-700'  },
            'waiting_director':      { label: 'ผู้อำนวยการ (ลงนาม)',               color: 'border-red-300 bg-red-50',       badge: 'bg-red-100 text-red-700'        },
        };

        let html = '';
        statusOrder.forEach(status => {
            const items = grouped[status];
            if (!items || items.length === 0) return;
            const meta = groupMeta[status] || { label: status, color: 'border-gray-300 bg-gray-50', badge: 'bg-gray-100 text-gray-700' };

            html += `
            <div class="border-2 ${meta.color} rounded-xl p-4">
              <div class="flex items-center justify-between mb-3">
                <h3 class="font-bold text-gray-700 flex items-center gap-2 text-sm sm:text-base">
                  🔐 รอลงนาม: <span class="text-blue-700">${meta.label}</span>
                </h3>
                <span class="text-xs px-2.5 py-0.5 rounded-full font-semibold ${meta.badge} whitespace-nowrap">${items.length} รายการ</span>
              </div>
              <div class="space-y-2">`;

            items.forEach(doc => {
                const purpose   = (doc.purpose   || 'เอกสารไปราชการ').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
                const requester = (doc.requesterName || '-').replace(/&/g,'&amp;').replace(/</g,'&lt;');
                const date      = doc.startDate || doc.date || '-';
                const docId     = doc.id; // safeId — ไม่มี special chars

                html += `
                <div class="bg-white rounded-lg border border-gray-200 p-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                  <div class="flex-1 min-w-0">
                    <p class="font-medium text-gray-800 text-sm truncate">${purpose}</p>
                    <p class="text-xs text-gray-500 mt-0.5">ผู้ขอ: ${requester} &nbsp;|&nbsp; วันที่: ${date}</p>
                  </div>
                  <button id="alm-btn-${docId}"
                    onclick="adminGenerateLink(this, '${docId}', '${status}')"
                    class="flex-shrink-0 w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white text-sm font-bold rounded-lg flex items-center justify-center gap-1.5 transition-colors">
                    🔗 สร้างลิงก์ส่งให้
                  </button>
                </div>`;
            });

            html += `</div></div>`;
        });

        container.innerHTML = html;

    } catch (e) {
        console.error("loadApprovalLinkManagement error:", e);
        container.innerHTML = `<p class="text-center text-red-500 py-8">⚠️ เกิดข้อผิดพลาด: ${e.message}</p>`;
    }
}

// --- 10. Admin: สร้างลิงก์ส่งให้ผู้อนุมัติรายเอกสาร ---
async function adminGenerateLink(btn, requestId, docStatus) {
    if (!requestId || !docStatus) return;

    const origHTML  = btn.innerHTML;
    const origClass = btn.className;
    btn.disabled    = true;
    btn.innerHTML   = '⏳ กำลังสร้าง...';

    try {
        const docMeta = window._adminApprovalDocs[requestId] || {};
        const url     = await generateApprovalToken(requestId, docStatus, docMeta);
        if (!url) throw new Error('ไม่สามารถสร้างลิงก์ได้ กรุณาตรวจสอบการเชื่อมต่อ');

        const label = (typeof getDocStatusLabel === 'function')
            ? getDocStatusLabel(docStatus) : docStatus;
        showApprovalLinkDialog(url, label);

        btn.innerHTML = '✅ สร้างลิงก์แล้ว';
        btn.className = 'flex-shrink-0 w-full sm:w-auto px-4 py-2 bg-green-600 text-white text-sm font-bold rounded-lg flex items-center justify-center gap-1.5';

        setTimeout(() => {
            btn.disabled  = false;
            btn.innerHTML = origHTML;
            btn.className = origClass;
        }, 4000);

    } catch (e) {
        console.error("adminGenerateLink error:", e);
        alert("เกิดข้อผิดพลาดในการสร้างลิงก์: " + e.message);
        btn.disabled  = false;
        btn.innerHTML = origHTML;
        btn.className = origClass;
    }
}
