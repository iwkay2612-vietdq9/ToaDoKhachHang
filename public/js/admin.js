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
    function renderCustomerTable(data) {
        const list = data || customers;
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
            return `
      <tr>
        <td>${i + 1}</td>
        <td style="font-weight:600; color:var(--text-primary)">${escHtml(c.name)}</td>
        <td>${escHtml(c.account)}</td>
        <td>${escHtml(c.phone)}</td>
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
                showToast(`Đã import ${data.count} khách hàng thành công!`, 'success');
                closeModal('importModal');
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

        // Map search
        document.getElementById('mapSearchInput').addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                const q = e.target.value.trim().toLowerCase();
                if (!q) { loadMapMarkers(); return; }
                const filtered = customers.filter(c =>
                    c.lat && c.lng && (
                        (c.name || '').toLowerCase().includes(q) ||
                        (c.phone || '').toLowerCase().includes(q) ||
                        (c.account || '').toLowerCase().includes(q) ||
                        (c.package || '').toLowerCase().includes(q) ||
                        (c.address || '').toLowerCase().includes(q))
                );
                renderMapMarkers(filtered);
            }, 300);
        });
    }

    function loadMapMarkers() {
        const withCoord = customers.filter(c => c.lat && c.lng);
        renderMapMarkers(withCoord);
    }

    function renderMapMarkers(list) {
        adminMarkers.forEach(m => adminMap.removeLayer(m));
        adminMarkers = [];

        if (list.length === 0) return;

        const bounds = [];
        list.forEach(c => {
            const marker = L.marker([c.lat, c.lng]).addTo(adminMap);
            marker.bindPopup(createPopupContent(c));
            adminMarkers.push(marker);
            bounds.push([c.lat, c.lng]);
        });

        if (bounds.length > 0) {
            adminMap.fitBounds(bounds, { padding: [30, 30] });
        }
    }

    function createPopupContent(c) {
        return `
      <div class="popup-title">${escHtml(c.name)}</div>
      <div class="popup-info">
        <span>📞 <a href="tel:${escHtml(c.phone)}" style="color:#22c55e;text-decoration:none;font-weight:600;" title="Gọi ${escHtml(c.phone)}">📱 ${escHtml(c.phone)}</a></span>
        <span>📦 <strong>${escHtml(c.package)}</strong> - ${escHtml(formatPrice(c.price))}</span>
        <span>📍 <strong>${escHtml(c.address)}</strong></span>
        <span>🏷️ CTV: <strong>${escHtml(c.ctvCode)}</strong></span>
      </div>
      <div class="popup-actions">
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
