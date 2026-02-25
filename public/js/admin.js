// ===== ADMIN DASHBOARD =====
(function () {
    const user = getUser();
    if (!user || user.role !== 'admin') {
        window.location.href = '/';
        return;
    }
    document.getElementById('userDisplay').textContent = `Admin (${user.username})`;

    let customers = [];
    let users = [];
    let adminMap = null;
    let adminMarkers = [];
    let routeLine = null;
    let routeControl = null;
    let myLocationMarker = null;
    let selectedIds = new Set();

    // ===== TAB SWITCHING =====
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tab = link.dataset.tab;
            document.querySelectorAll('.sidebar-nav a').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.getElementById('tab-' + tab).classList.add('active');
            if (tab === 'map') initAdminMap();
            if (tab === 'editlogs') loadEditLogs();
            closeSidebar();
        });
    });

    // ===== MOBILE SIDEBAR =====
    document.getElementById('menuToggle').addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });

    function closeSidebar() {
        document.getElementById('sidebar').classList.remove('open');
    }

    document.querySelector('.main-content').addEventListener('click', closeSidebar);

    // ===== LOGOUT =====
    document.getElementById('logoutBtn').addEventListener('click', (e) => {
        e.preventDefault();
        clearAuth();
        window.location.href = '/';
    });

    // ===== LOAD DATA =====
    async function loadCustomers() {
        const res = await apiCall('/api/customers');
        if (res) {
            customers = await res.json();
            renderCustomerTable();
            updateStats();
        }
    }

    async function loadUsers() {
        const res = await apiCall('/api/users');
        if (res) {
            users = await res.json();
            renderUserTable();
        }
    }

    // ===== STATS =====
    function updateStats() {
        document.getElementById('statTotal').textContent = customers.length;
        const withCoord = customers.filter(c => c.lat && c.lng).length;
        document.getElementById('statCoord').textContent = withCoord;
        document.getElementById('statNoCoord').textContent = customers.length - withCoord;
        const ctvCodes = new Set(customers.map(c => c.ctvCode).filter(Boolean));
        document.getElementById('statCtv').textContent = ctvCodes.size;
    }

    // ===== CUSTOMER TABLE =====
    function getFilteredCustomers() {
        const filters = {};
        document.querySelectorAll('.filter-input').forEach(input => {
            const field = input.dataset.field;
            const val = input.value.trim();
            if (val) filters[field] = val;
        });

        let list = customers;
        Object.keys(filters).forEach(field => {
            const val = filters[field].toLowerCase();
            if (field === 'hasCoord') {
                list = list.filter(c => val === 'yes' ? (c.lat && c.lng) : !(c.lat && c.lng));
            } else if (field === 'billingType') {
                list = list.filter(c => (c.billingType || 'hang_thang') === filters[field]);
            } else {
                list = list.filter(c => (String(c[field] || '')).toLowerCase().includes(val));
            }
        });
        return list;
    }

    function renderCustomerTable(data) {
        const list = data || getFilteredCustomers();
        const tbody = document.getElementById('customerTable');
        const empty = document.getElementById('emptyState');

        if (list.length === 0) {
            tbody.innerHTML = '';
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';

        tbody.innerHTML = list.map((c, i) => {
            let billingLabel = 'Hàng tháng';
            let billingBadge = 'badge-blue';
            if (c.billingType === 'dong_truoc') {
                billingBadge = 'badge-orange';
                const periodMap = { '3_thang': '3T', '6_thang': '6T', '1_nam': '1N' };
                const periodText = periodMap[c.prepaidPeriod] || '';
                const expiryText = c.prepaidExpiry ? formatDateVN(c.prepaidExpiry) : '';
                billingLabel = `ĐT ${periodText}` + (expiryText ? `<br><small style="opacity:0.8">HH: ${expiryText}</small>` : '');
            }
            const checked = selectedIds.has(c.id) ? 'checked' : '';
            return `
      <tr>
        <td><input type="checkbox" class="row-check" data-id="${c.id}" ${checked}></td>
        <td>${i + 1}</td>
        <td><a href="#" class="customer-name-link" onclick="showCustomerDetail('${c.id}');return false;">${escHtml(c.name)}</a></td>
        <td>${escHtml(c.account)}</td>
        <td>${escHtml(c.phone)}${c.phone ? ` <a href="tel:${escHtml(c.phone)}" class="call-btn-inline" title="Gọi ${escHtml(c.phone)}">📞</a>` : ''}</td>
        <td><span class="badge badge-purple">${escHtml(c.package)}</span></td>
        <td>${escHtml(formatPrice(c.price))}</td>
        <td><span class="badge ${billingBadge}">${billingLabel}</span></td>
        <td style="max-width:150px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap" title="${escHtml(c.address)}">${escHtml(c.address)}</td>
        <td>
          ${c.lat && c.lng
                    ? `<span class="coord-status has-coord"><span class="coord-dot active"></span> ${Number(c.lat).toFixed(4)}, ${Number(c.lng).toFixed(4)}</span>`
                    : `<span class="coord-status no-coord"><span class="coord-dot inactive"></span> Chưa có</span>`
                }
        </td>
        <td><span class="badge badge-green">${escHtml(c.ctvCode)}</span></td>
        <td>
          <div class="action-btns">
            <button class="action-btn edit" title="Sửa" onclick="editCustomer('${c.id}')">✏️</button>
            <button class="action-btn delete" title="Xóa" onclick="deleteCustomer('${c.id}', '${escHtml(c.name)}')">🗑️</button>
          </div>
        </td>
      </tr>
    `;
        }).join('');

        // Bind checkbox events
        tbody.querySelectorAll('.row-check').forEach(cb => {
            cb.addEventListener('change', (e) => {
                if (e.target.checked) selectedIds.add(e.target.dataset.id);
                else selectedIds.delete(e.target.dataset.id);
                updateSelectionUI();
            });
        });
        updateSelectionUI();
    }

    function updateSelectionUI() {
        const count = selectedIds.size;
        document.getElementById('selectedCount').textContent = count;
        document.getElementById('deleteSelectedBtn').style.display = count > 0 ? 'inline-flex' : 'none';
        const allCheckboxes = document.querySelectorAll('.row-check');
        const selectAll = document.getElementById('selectAll');
        if (allCheckboxes.length > 0) {
            selectAll.checked = allCheckboxes.length === count;
            selectAll.indeterminate = count > 0 && count < allCheckboxes.length;
        }
    }

    // ===== USER TABLE =====
    function renderUserTable() {
        const tbody = document.getElementById('userTable');
        tbody.innerHTML = users.map((u, i) => `
      <tr>
        <td>${i + 1}</td>
        <td style="font-weight:600; color:var(--text-primary)">${escHtml(u.username)}</td>
        <td><span class="badge ${u.role === 'admin' ? 'badge-red' : 'badge-green'}">${u.role.toUpperCase()}</span></td>
        <td><span class="badge badge-purple">${escHtml(u.ctvCode)}</span></td>
        <td>
          ${u.role !== 'admin' ? `
            <div class="action-btns">
              <button class="action-btn edit" title="Sửa" onclick="editUser('${u.id}')">✏️</button>
              <button class="action-btn delete" title="Xóa" onclick="deleteUser('${u.id}', '${escHtml(u.username)}')">🗑️</button>
            </div>
          ` : '<span style="color:var(--text-muted)">-</span>'}
        </td>
      </tr>
    `).join('');
    }

    // ===== SEARCH =====
    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(async () => {
            const q = e.target.value.trim();
            if (!q) {
                renderCustomerTable();
                return;
            }
            const res = await apiCall('/api/customers/search?q=' + encodeURIComponent(q));
            if (res) {
                const results = await res.json();
                renderCustomerTable(results);
            }
        }, 300);
    });

    // ===== MULTI-FIELD FILTER =====
    document.querySelectorAll('.filter-input').forEach(input => {
        input.addEventListener('input', () => {
            document.getElementById('searchInput').value = '';
            renderCustomerTable();
        });
        input.addEventListener('change', () => {
            document.getElementById('searchInput').value = '';
            renderCustomerTable();
        });
    });

    document.getElementById('clearFilters').addEventListener('click', () => {
        document.querySelectorAll('.filter-input').forEach(input => {
            if (input.tagName === 'SELECT') input.selectedIndex = 0;
            else input.value = '';
        });
        document.getElementById('searchInput').value = '';
        renderCustomerTable();
    });

    // ===== SELECT ALL CHECKBOX =====
    document.getElementById('selectAll').addEventListener('change', (e) => {
        const checked = e.target.checked;
        document.querySelectorAll('.row-check').forEach(cb => {
            if (checked) selectedIds.add(cb.dataset.id);
            else selectedIds.delete(cb.dataset.id);
            cb.checked = checked;
        });
        updateSelectionUI();
    });

    // ===== BULK DELETE =====
    document.getElementById('deleteSelectedBtn').addEventListener('click', async () => {
        const count = selectedIds.size;
        if (count === 0) return;
        if (!confirm(`Xóa ${count} khách hàng đã chọn?`)) return;
        try {
            const res = await apiCall('/api/customers/bulk-delete', {
                method: 'POST',
                body: JSON.stringify({ ids: Array.from(selectedIds) })
            });
            if (res && res.ok) {
                const data = await res.json();
                showToast(`Đã xóa ${data.count} khách hàng`, 'success');
                selectedIds.clear();
                loadCustomers();
            }
        } catch (e) {
            showToast('Lỗi kết nối server', 'error');
        }
    });

    document.getElementById('deleteAllBtn').addEventListener('click', async () => {
        if (customers.length === 0) {
            showToast('Không có khách hàng nào để xóa', 'error');
            return;
        }
        if (!confirm(`Xóa TẤT CẢ ${customers.length} khách hàng? Hành động này không thể hoàn tác!`)) return;
        if (!confirm('Bạn có CHẮC CHẮN muốn xóa tất cả khách hàng?')) return;
        try {
            const res = await apiCall('/api/customers/bulk-delete', {
                method: 'POST',
                body: JSON.stringify({ deleteAll: true })
            });
            if (res && res.ok) {
                const data = await res.json();
                showToast(`Đã xóa tất cả ${data.count} khách hàng`, 'success');
                selectedIds.clear();
                loadCustomers();
            }
        } catch (e) {
            showToast('Lỗi kết nối server', 'error');
        }
    });

    // ===== CTV CODES FOR DROPDOWN =====
    async function loadCtvCodes(selectedCode) {
        try {
            const res = await apiCall('/api/ctv-codes');
            if (res) {
                const ctvList = await res.json();
                const select = document.getElementById('cCtvCode');
                select.innerHTML = '<option value="">-- Chọn CTV --</option>';
                ctvList.forEach(c => {
                    const opt = document.createElement('option');
                    opt.value = c.ctvCode;
                    opt.textContent = `${c.ctvCode} (${c.username})`;
                    if (c.ctvCode === selectedCode) opt.selected = true;
                    select.appendChild(opt);
                });
            }
        } catch (e) { console.error('Error loading CTV codes', e); }
    }

    // ===== CUSTOMER MODAL =====
    // ===== BILLING TYPE TOGGLE =====
    document.getElementById('cBillingType').addEventListener('change', function () {
        document.getElementById('prepaidFields').style.display = this.value === 'dong_truoc' ? 'block' : 'none';
    });

    document.getElementById('addCustomerBtn').addEventListener('click', async () => {
        document.getElementById('customerModalTitle').textContent = 'Thêm khách hàng';
        document.getElementById('customerForm').reset();
        document.getElementById('customerId').value = '';
        document.getElementById('cBillingType').value = 'hang_thang';
        document.getElementById('prepaidFields').style.display = 'none';
        await loadCtvCodes();
        openModal('customerModal');
    });

    window.editCustomer = async function (id) {
        const c = customers.find(x => x.id === id);
        if (!c) return;
        document.getElementById('customerModalTitle').textContent = 'Sửa khách hàng';
        document.getElementById('customerId').value = c.id;
        document.getElementById('cName').value = c.name || '';
        document.getElementById('cAccount').value = c.account || '';
        document.getElementById('cPhone').value = c.phone || '';
        document.getElementById('cPackage').value = c.package || '';
        document.getElementById('cPrice').value = c.price || '';
        document.getElementById('cAddress').value = c.address || '';
        document.getElementById('cLat').value = c.lat || '';
        document.getElementById('cLng').value = c.lng || '';
        document.getElementById('cBillingType').value = c.billingType || 'hang_thang';
        if (c.billingType === 'dong_truoc') {
            document.getElementById('prepaidFields').style.display = 'block';
            document.getElementById('cPrepaidPeriod').value = c.prepaidPeriod || '3_thang';
            document.getElementById('cPrepaidExpiry').value = c.prepaidExpiry || '';
        } else {
            document.getElementById('prepaidFields').style.display = 'none';
        }
        await loadCtvCodes(c.ctvCode || '');
        openModal('customerModal');
    };

    document.getElementById('saveCustomerBtn').addEventListener('click', async () => {
        const id = document.getElementById('customerId').value;
        const billingType = document.getElementById('cBillingType').value;
        const data = {
            name: document.getElementById('cName').value.trim(),
            account: document.getElementById('cAccount').value.trim(),
            phone: document.getElementById('cPhone').value.trim(),
            package: document.getElementById('cPackage').value.trim(),
            price: document.getElementById('cPrice').value.trim(),
            address: document.getElementById('cAddress').value.trim(),
            lat: parseFloat(document.getElementById('cLat').value) || null,
            lng: parseFloat(document.getElementById('cLng').value) || null,
            ctvCode: document.getElementById('cCtvCode').value.trim(),
            billingType: billingType,
            prepaidPeriod: billingType === 'dong_truoc' ? document.getElementById('cPrepaidPeriod').value : '',
            prepaidExpiry: billingType === 'dong_truoc' ? document.getElementById('cPrepaidExpiry').value : ''
        };

        if (!data.name) {
            showToast('Vui lòng nhập tên khách hàng', 'error');
            return;
        }

        try {
            const url = id ? `/api/customers/${id}` : '/api/customers';
            const method = id ? 'PUT' : 'POST';
            const res = await apiCall(url, { method, body: JSON.stringify(data) });
            if (res && res.ok) {
                showToast(id ? 'Đã cập nhật khách hàng' : 'Đã thêm khách hàng', 'success');
                closeModal('customerModal');
                loadCustomers();
            } else {
                const err = await res.json();
                showToast(err.error || 'Có lỗi xảy ra', 'error');
            }
        } catch (e) {
            showToast('Lỗi kết nối server', 'error');
        }
    });

    window.deleteCustomer = async function (id, name) {
        if (!confirm(`Xóa khách hàng "${name}"?`)) return;
        const res = await apiCall(`/api/customers/${id}`, { method: 'DELETE' });
        if (res && res.ok) {
            showToast('Đã xóa khách hàng', 'success');
            loadCustomers();
        }
    };

    // ===== CUSTOMER DETAIL POPUP =====
    window.showCustomerDetail = function (id) {
        const c = customers.find(x => x.id === id);
        if (!c) return;

        const billingTypeMap = { 'hang_thang': 'Cước hàng tháng', 'dong_truoc': 'Cước đóng trước' };
        const periodMap = { '3_thang': '3 tháng', '6_thang': '6 tháng', '1_nam': '1 năm' };
        const billingText = billingTypeMap[c.billingType] || 'Hàng tháng';

        let prepaidHtml = '';
        if (c.billingType === 'dong_truoc') {
            prepaidHtml = `
                <div class="detail-row"><span class="detail-label">⏳ Kỳ đóng trước</span><span class="detail-value">${periodMap[c.prepaidPeriod] || c.prepaidPeriod || '-'}</span></div>
                <div class="detail-row"><span class="detail-label">📅 Ngày hết hạn</span><span class="detail-value">${c.prepaidExpiry ? formatDateVN(c.prepaidExpiry) : '-'}</span></div>
            `;
        }

        const coordText = (c.lat && c.lng) ? `${Number(c.lat).toFixed(6)}, ${Number(c.lng).toFixed(6)}` : 'Chưa có';

        document.getElementById('customerDetailBody').innerHTML = `
            <div class="customer-detail-grid">
                <div class="detail-row"><span class="detail-label">👤 Tên KH</span><span class="detail-value" style="font-size:16px;font-weight:700;">${escHtml(c.name)}</span></div>
                <div class="detail-row"><span class="detail-label">🔑 Account</span><span class="detail-value">${escHtml(c.account) || '-'}</span></div>
                <div class="detail-row"><span class="detail-label">📞 SĐT</span><span class="detail-value">${c.phone ? `${escHtml(c.phone)} <a href="tel:${escHtml(c.phone)}" class="call-btn" title="Gọi ${escHtml(c.phone)}">📱 Gọi</a>` : '-'}</span></div>
                <div class="detail-row"><span class="detail-label">📦 Gói cước</span><span class="detail-value"><span class="badge badge-purple">${escHtml(c.package) || '-'}</span></span></div>
                <div class="detail-row"><span class="detail-label">💰 Giá tiền</span><span class="detail-value" style="color:#22c55e;font-weight:600;">${formatPrice(c.price) || '-'}</span></div>
                <div class="detail-row"><span class="detail-label">💳 Loại cước</span><span class="detail-value">${billingText}</span></div>
                ${prepaidHtml}
                <div class="detail-row"><span class="detail-label">📍 Địa chỉ</span><span class="detail-value">${escHtml(c.address) || '-'}</span></div>
                <div class="detail-row"><span class="detail-label">🗺️ Tọa độ</span><span class="detail-value">${coordText}</span></div>
                <div class="detail-row"><span class="detail-label">🏷️ Mã CTV</span><span class="detail-value"><span class="badge badge-green">${escHtml(c.ctvCode) || '-'}</span></span></div>
            </div>
        `;

        document.getElementById('detailEditBtn').onclick = function () {
            closeModal('customerDetailModal');
            editCustomer(c.id);
        };

        openModal('customerDetailModal');
    };

    // ===== USER MODAL =====
    document.getElementById('addUserBtn').addEventListener('click', () => {
        document.getElementById('userModalTitle').textContent = 'Thêm CTV';
        document.getElementById('userForm').reset();
        document.getElementById('userId').value = '';
        document.getElementById('uPassword').required = true;
        openModal('userModal');
    });

    window.editUser = function (id) {
        const u = users.find(x => x.id === id);
        if (!u) return;
        document.getElementById('userModalTitle').textContent = 'Sửa CTV';
        document.getElementById('userId').value = u.id;
        document.getElementById('uUsername').value = u.username;
        document.getElementById('uPassword').value = '';
        document.getElementById('uPassword').required = false;
        document.getElementById('uPassword').placeholder = 'Để trống nếu không đổi';
        document.getElementById('uCtvCode').value = u.ctvCode;
        openModal('userModal');
    };

    document.getElementById('saveUserBtn').addEventListener('click', async () => {
        const id = document.getElementById('userId').value;
        const data = {
            username: document.getElementById('uUsername').value.trim(),
            password: document.getElementById('uPassword').value,
            ctvCode: document.getElementById('uCtvCode').value.trim()
        };

        if (!data.username || !data.ctvCode) {
            showToast('Vui lòng nhập đầy đủ thông tin', 'error');
            return;
        }
        if (!id && !data.password) {
            showToast('Vui lòng nhập mật khẩu', 'error');
            return;
        }

        try {
            const url = id ? `/api/users/${id}` : '/api/users';
            const method = id ? 'PUT' : 'POST';
            if (id && !data.password) delete data.password;
            const res = await apiCall(url, { method, body: JSON.stringify(data) });
            if (res && res.ok) {
                showToast(id ? 'Đã cập nhật CTV' : 'Đã thêm CTV', 'success');
                closeModal('userModal');
                loadUsers();
            } else {
                const err = await res.json();
                showToast(err.error || 'Có lỗi xảy ra', 'error');
            }
        } catch (e) {
            showToast('Lỗi kết nối server', 'error');
        }
    });

    window.deleteUser = async function (id, name) {
        if (!confirm(`Xóa CTV "${name}"?`)) return;
        const res = await apiCall(`/api/users/${id}`, { method: 'DELETE' });
        if (res && res.ok) {
            showToast('Đã xóa CTV', 'success');
            loadUsers();
        }
    };

    // ===== EXCEL IMPORT =====
    document.getElementById('importExcel').addEventListener('click', () => openModal('importModal'));

    const uploadZone = document.getElementById('uploadZone');
    const excelFile = document.getElementById('excelFile');

    uploadZone.addEventListener('click', () => excelFile.click());
    uploadZone.addEventListener('dragover', (e) => { e.preventDefault(); uploadZone.style.borderColor = 'var(--accent-primary)'; });
    uploadZone.addEventListener('dragleave', () => { uploadZone.style.borderColor = ''; });
    uploadZone.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadZone.style.borderColor = '';
        if (e.dataTransfer.files.length) handleFileUpload(e.dataTransfer.files[0]);
    });

    excelFile.addEventListener('change', (e) => {
        if (e.target.files.length) handleFileUpload(e.target.files[0]);
    });

    async function handleFileUpload(file) {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch(window.location.origin + '/api/customers/import', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + getToken() },
                body: formData
            });
            const data = await res.json();
            if (res.ok) {
                closeModal('importModal');
                // Show detailed result
                let html = '';
                if (data.count > 0) {
                    html += `<div style="padding:12px;background:rgba(34,197,94,0.15);border-radius:8px;margin-bottom:12px;">
                        <strong style="color:#22c55e;">✅ Import thành công: ${data.count} khách hàng</strong>
                    </div>`;
                }
                if (data.errors && data.errors.length > 0) {
                    html += `<div style="padding:12px;background:rgba(239,68,68,0.15);border-radius:8px;margin-bottom:12px;">
                        <strong style="color:#ef4444;">⚠️ Lỗi: ${data.errors.length} dòng không import được</strong>
                    </div>`;
                    html += '<table style="width:100%;font-size:13px;border-collapse:collapse;">';
                    html += '<thead><tr style="background:rgba(99,102,241,0.1);"><th style="padding:6px 8px;text-align:left;">Dòng</th><th style="padding:6px 8px;text-align:left;">Tên KH</th><th style="padding:6px 8px;text-align:left;">Mã CTV</th><th style="padding:6px 8px;text-align:left;">Lý do</th></tr></thead>';
                    html += '<tbody>';
                    data.errors.forEach(err => {
                        html += `<tr style="border-bottom:1px solid rgba(255,255,255,0.06);"><td style="padding:6px 8px;">${err.row}</td><td style="padding:6px 8px;">${escHtml(err.name)}</td><td style="padding:6px 8px;"><span class="badge badge-red">${escHtml(err.ctvCode || '(trống)')}</span></td><td style="padding:6px 8px;color:#ef4444;">${escHtml(err.reason)}</td></tr>`;
                    });
                    html += '</tbody></table>';
                }
                if (!data.count && (!data.errors || data.errors.length === 0)) {
                    html = '<p>File không có dữ liệu.</p>';
                }
                document.getElementById('importResultBody').innerHTML = html;
                openModal('importResultModal');
                loadCustomers();
            } else {
                showToast(data.error || 'Lỗi import', 'error');
            }
        } catch (e) {
            showToast('Lỗi kết nối server', 'error');
        }
    }

    // ===== TEMPLATE DOWNLOAD =====
    function downloadTemplate() {
        window.open(window.location.origin + '/api/template', '_blank');
    }
    document.getElementById('downloadTemplate').addEventListener('click', downloadTemplate);
    document.getElementById('downloadTemplate2').addEventListener('click', downloadTemplate);

    // ===== EXPORT EXCEL =====
    document.getElementById('exportExcel').addEventListener('click', () => {
        window.open(window.location.origin + '/api/customers/export?token=' + getToken(), '_blank');
        showToast('Đang xuất file Excel...', 'info');
    });

    // ===== GET CURRENT LOCATION FOR FORM =====
    document.getElementById('getMyLocationBtn').addEventListener('click', () => {
        if (!navigator.geolocation) {
            showToast('Trình duyệt không hỗ trợ định vị', 'error');
            return;
        }
        const btn = document.getElementById('getMyLocationBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="loading-spinner"></span> Đang lấy tọa độ...';
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                document.getElementById('cLat').value = pos.coords.latitude.toFixed(6);
                document.getElementById('cLng').value = pos.coords.longitude.toFixed(6);
                btn.disabled = false;
                btn.innerHTML = '📍 Lấy tọa độ hiện tại (GPS)';
                showToast(`Đã lấy tọa độ: ${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`, 'success');
            },
            () => {
                btn.disabled = false;
                btn.innerHTML = '📍 Lấy tọa độ hiện tại (GPS)';
                showToast('Không thể lấy vị trí. Hãy bật GPS.', 'error');
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    });

    // ===== MAP =====
    let allMapCustomers = []; // Store all customers with coords for zoom filtering
    let isMapSearchActive = false;

    function initAdminMap() {
        if (adminMap) {
            adminMap.invalidateSize();
            loadMapMarkers();
            return;
        }

        adminMap = L.map('map').setView([11.75, 108.36], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 19
        }).addTo(adminMap);

        setTimeout(() => adminMap.invalidateSize(), 200);
        loadMapMarkers();

        // Zoom-based marker filtering
        adminMap.on('zoomend', () => {
            if (!isMapSearchActive) {
                updateVisibleMarkers();
            }
        });
        adminMap.on('moveend', () => {
            if (!isMapSearchActive) {
                updateVisibleMarkers();
            }
        });

        // Map search
        document.getElementById('mapSearchInput').addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                const q = e.target.value.trim().toLowerCase();
                if (!q) {
                    isMapSearchActive = false;
                    loadMapMarkers();
                    return;
                }
                isMapSearchActive = true;
                const filtered = customers.filter(c =>
                    c.lat && c.lng && (
                        (c.name || '').toLowerCase().includes(q) ||
                        (c.phone || '').toLowerCase().includes(q) ||
                        (c.account || '').toLowerCase().includes(q) ||
                        (c.package || '').toLowerCase().includes(q) ||
                        (c.address || '').toLowerCase().includes(q))
                );
                renderMapMarkers(filtered, true);
            }, 300);
        });
    }

    function loadMapMarkers() {
        allMapCustomers = customers.filter(c => c.lat && c.lng);
        // Initial render with bounds fitting
        renderMapMarkers(allMapCustomers, true);
    }

    function getZoomFilteredMarkers(list) {
        if (!adminMap) return list;
        const zoom = adminMap.getZoom();
        const bounds = adminMap.getBounds();

        // Filter to only markers within current map bounds
        let visible = list.filter(c => bounds.contains([c.lat, c.lng]));

        // At low zoom levels, limit markers to avoid lag
        let maxMarkers;
        if (zoom <= 8) {
            maxMarkers = 50;
        } else if (zoom <= 10) {
            maxMarkers = 100;
        } else if (zoom <= 12) {
            maxMarkers = 200;
        } else {
            maxMarkers = Infinity; // Show all at high zoom
        }

        if (visible.length > maxMarkers) {
            // Sample evenly from the list
            const step = visible.length / maxMarkers;
            const sampled = [];
            for (let i = 0; i < maxMarkers; i++) {
                sampled.push(visible[Math.floor(i * step)]);
            }
            visible = sampled;
        }

        return visible;
    }

    function updateVisibleMarkers() {
        if (!adminMap || allMapCustomers.length === 0) return;
        const filtered = getZoomFilteredMarkers(allMapCustomers);
        renderMapMarkers(filtered, false);
    }

    function updateMarkerCountBadge(showing, total) {
        const badge = document.getElementById('markerCountBadge');
        if (total === 0) {
            badge.style.display = 'none';
            return;
        }
        badge.style.display = 'inline-block';
        badge.textContent = `📍 ${showing}/${total} điểm`;
    }

    function renderMapMarkers(list, fitBounds) {
        adminMarkers.forEach(m => adminMap.removeLayer(m));
        adminMarkers = [];

        const totalWithCoord = allMapCustomers.length || list.length;
        updateMarkerCountBadge(list.length, totalWithCoord);

        if (list.length === 0) return;

        const bounds = [];
        list.forEach(c => {
            const marker = L.marker([c.lat, c.lng]).addTo(adminMap);
            marker.bindPopup(createPopupContent(c));
            adminMarkers.push(marker);
            bounds.push([c.lat, c.lng]);
        });

        if (fitBounds && bounds.length > 0) {
            adminMap.fitBounds(bounds, { padding: [30, 30] });
        }
    }

    function createPopupContent(c) {
        return `
      <div class="popup-title"><a href="#" onclick="showCustomerDetail('${c.id}');return false;" style="color:inherit;text-decoration:none;">${escHtml(c.name)}</a></div>
      <div class="popup-info">
        <span>📞 ${escHtml(c.phone)} ${c.phone ? `<a href="tel:${escHtml(c.phone)}" class="call-btn" title="Gọi ${escHtml(c.phone)}">📱 Gọi</a>` : ''}</span>
        <span>📦 <strong>${escHtml(c.package)}</strong> - ${escHtml(formatPrice(c.price))}</span>
        <span>📍 <strong>${escHtml(c.address)}</strong></span>
        <span>🏷️ CTV: <strong>${escHtml(c.ctvCode)}</strong></span>
      </div>
      <div class="popup-actions">
        <button class="popup-btn directions" onclick="showCustomerDetail('${c.id}')">👤 Chi tiết</button>
        <button class="popup-btn directions" onclick="editCustomer('${c.id}')">✏️ Sửa</button>
        <button class="popup-btn directions" onclick="getDirections(${c.lat}, ${c.lng})">🧭 Chỉ đường</button>
      </div>
    `;
    }

    window.getDirections = function (destLat, destLng) {
        if (!navigator.geolocation) {
            showToast('Trình duyệt không hỗ trợ định vị', 'error');
            return;
        }

        showToast('Đang lấy vị trí hiện tại...', 'info');
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const startLat = pos.coords.latitude;
                const startLng = pos.coords.longitude;

                // Clear previous route
                if (routeLine) adminMap.removeLayer(routeLine);

                try {
                    const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${destLng},${destLat}?overview=full&geometries=geojson`;
                    const res = await fetch(url);
                    const data = await res.json();

                    if (data.routes && data.routes.length > 0) {
                        const route = data.routes[0];
                        const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);

                        routeLine = L.polyline(coords, {
                            color: '#6366f1', weight: 5, opacity: 0.8,
                            dashArray: '10, 10'
                        }).addTo(adminMap);

                        // Add start marker
                        L.marker([startLat, startLng], {
                            icon: L.divIcon({
                                className: '',
                                html: '<div style="background:#22c55e;color:#fff;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 2px 8px rgba(0,0,0,0.3)">📍</div>',
                                iconSize: [30, 30],
                                iconAnchor: [15, 15]
                            })
                        }).addTo(adminMap).bindPopup('Vị trí của bạn');

                        adminMap.fitBounds(routeLine.getBounds(), { padding: [50, 50] });

                        // Show route info
                        const distance = (route.distance / 1000).toFixed(1);
                        const minutes = Math.round(route.duration / 60);
                        document.getElementById('routeDistance').textContent = `${distance} km`;
                        document.getElementById('routeTime').textContent = `${minutes} phút`;
                        document.getElementById('routingInfo').classList.add('active');

                        showToast(`Khoảng cách: ${distance} km, Thời gian: ${minutes} phút`, 'success');
                    }
                } catch (e) {
                    showToast('Không thể tìm đường đi', 'error');
                }
            },
            () => showToast('Không thể lấy vị trí hiện tại', 'error'),
            { enableHighAccuracy: true }
        );
    };

    document.getElementById('clearRoute').addEventListener('click', () => {
        if (routeLine) adminMap.removeLayer(routeLine);
        document.getElementById('routingInfo').classList.remove('active');
    });

    // ===== MY LOCATION ON MAP =====
    document.getElementById('myLocationBtn').addEventListener('click', () => {
        if (!navigator.geolocation) {
            showToast('Trình duyệt không hỗ trợ định vị', 'error');
            return;
        }
        showToast('Đang lấy vị trí...', 'info');
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                if (myLocationMarker) adminMap.removeLayer(myLocationMarker);
                myLocationMarker = L.marker([lat, lng], {
                    icon: L.divIcon({
                        className: '',
                        html: '<div style="background:#22c55e;color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid #fff">📍</div>',
                        iconSize: [32, 32],
                        iconAnchor: [16, 16]
                    })
                }).addTo(adminMap).bindPopup(`<div class="popup-title">Vị trí của bạn</div><div class="popup-info"><span>📍 ${lat.toFixed(6)}, ${lng.toFixed(6)}</span></div>`).openPopup();
                adminMap.setView([lat, lng], 15);
                showToast(`Vị trí: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, 'success');
            },
            () => showToast('Không thể lấy vị trí. Hãy bật GPS.', 'error'),
            { enableHighAccuracy: true, timeout: 10000 }
        );
    });

    // ===== ADD CUSTOMER AT CURRENT LOCATION =====
    document.getElementById('addCustomerAtLocationBtn').addEventListener('click', () => {
        if (!navigator.geolocation) {
            showToast('Trình duyệt không hỗ trợ định vị', 'error');
            return;
        }
        const btn = document.getElementById('addCustomerAtLocationBtn');
        btn.disabled = true;
        btn.innerHTML = '<span class="loading-spinner"></span> Đang lấy tọa độ...';
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                btn.disabled = false;
                btn.innerHTML = '➕ Thêm KH tại đây';
                document.getElementById('customerModalTitle').textContent = 'Thêm khách hàng tại vị trí hiện tại';
                document.getElementById('customerForm').reset();
                document.getElementById('customerId').value = '';
                document.getElementById('cLat').value = pos.coords.latitude.toFixed(6);
                document.getElementById('cLng').value = pos.coords.longitude.toFixed(6);
                await loadCtvCodes();
                openModal('customerModal');
                showToast(`Tọa độ: ${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`, 'success');
            },
            () => {
                btn.disabled = false;
                btn.innerHTML = '➕ Thêm KH tại đây';
                showToast('Không thể lấy vị trí. Hãy bật GPS.', 'error');
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    });

    // ===== HELPERS =====
    function escHtml(s) {
        if (s === null || s === undefined) return '';
        const div = document.createElement('div');
        div.textContent = String(s);
        return div.innerHTML;
    }

    function formatPrice(p) {
        if (!p) return '';
        const num = parseInt(String(p).replace(/[^0-9]/g, ''));
        return isNaN(num) ? String(p) : num.toLocaleString('vi-VN') + 'đ';
    }

    function formatDateVN(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
        return dateStr;
    }

    // ===== MODAL HELPERS =====
    window.openModal = function (id) {
        document.getElementById(id).classList.add('active');
    };

    window.closeModal = function (id) {
        document.getElementById(id).classList.remove('active');
    };

    // Close modal on overlay click
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('active');
        });
    });

    // ===== EDIT LOGS =====
    async function loadEditLogs() {
        try {
            const res = await apiCall('/api/edit-logs');
            if (!res) return;
            const logs = await res.json();
            const tbody = document.getElementById('editLogsTable');
            const empty = document.getElementById('editLogsEmpty');

            if (logs.length === 0) {
                tbody.innerHTML = '';
                empty.style.display = 'block';
                return;
            }
            empty.style.display = 'none';

            const fieldNames = { phone: 'SĐT', package: 'Gói cước', price: 'Giá tiền' };

            tbody.innerHTML = logs.map((log, i) => {
                const time = new Date(log.editedAt);
                const timeStr = time.toLocaleString('vi-VN');
                const changesHtml = log.changes.map(ch =>
                    `<div style="margin-bottom:4px;"><span class="badge badge-purple">${fieldNames[ch.field] || ch.field}</span> <span style="color:#ef4444;text-decoration:line-through">${escHtml(ch.oldValue)}</span> → <span style="color:#22c55e;font-weight:600">${escHtml(ch.newValue)}</span></div>`
                ).join('');
                return `
                <tr>
                    <td>${i + 1}</td>
                    <td style="white-space:nowrap">${timeStr}</td>
                    <td><span class="badge badge-green">${escHtml(log.ctvCode)}</span><br><small>${escHtml(log.ctvUsername)}</small></td>
                    <td style="font-weight:600">${escHtml(log.customerName)}</td>
                    <td>${changesHtml}</td>
                </tr>`;
            }).join('');
        } catch (e) {
            console.error('Error loading edit logs', e);
        }
    }

    // ===== INIT =====
    loadCustomers();
    loadUsers();
})();
