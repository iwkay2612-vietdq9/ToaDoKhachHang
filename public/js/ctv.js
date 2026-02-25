// ===== CTV DASHBOARD =====
(function () {
    const user = getUser();
    if (!user || user.role !== 'ctv') {
        window.location.href = '/';
        return;
    }
    document.getElementById('userDisplay').textContent = `CTV: ${user.ctvCode} (${user.username})`;

    let customers = [];
    let ctvMap = null;
    let markers = [];
    let routeLine = null;
    let myLocationMarker = null;
    let pendingCoord = null;

    // ===== TAB SWITCHING =====
    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tab = link.dataset.tab;
            document.querySelectorAll('.sidebar-nav a').forEach(l => l.classList.remove('active'));
            link.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            document.getElementById('tab-' + tab).classList.add('active');
            if (tab === 'map') initMap();
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
            renderCustomerList();
            updateStats();
        }
    }

    function updateStats() {
        document.getElementById('statTotal').textContent = customers.length;
        const withCoord = customers.filter(c => c.lat && c.lng).length;
        document.getElementById('statCoord').textContent = withCoord;
        document.getElementById('statNoCoord').textContent = customers.length - withCoord;
    }

    // ===== CUSTOMER LIST =====
    function renderCustomerList(data) {
        const list = data || customers;
        const container = document.getElementById('customerList');
        const empty = document.getElementById('emptyState');

        if (list.length === 0) {
            container.innerHTML = '';
            empty.style.display = 'block';
            return;
        }
        empty.style.display = 'none';

        container.innerHTML = list.map(c => `
      <div class="customer-card" data-id="${c.id}">
        <div class="card-name">${escHtml(c.name)}</div>
        <div class="card-info">
          <span>📞 ${escHtml(c.phone)}</span>
          <span>📦 ${escHtml(c.package)}</span>
          <span>💰 ${escHtml(formatPrice(c.price))}</span>
        </div>
        <div class="card-info" style="margin-top:4px;">
          <span>🏠 ${escHtml(c.address)}</span>
        </div>
        <div class="card-info" style="margin-top:4px;">
          <span>🔑 ${escHtml(c.account)}</span>
          ${c.lat && c.lng
                ? `<span class="coord-status has-coord"><span class="coord-dot active"></span> ${Number(c.lat).toFixed(4)}, ${Number(c.lng).toFixed(4)}</span>`
                : `<span class="coord-status no-coord"><span class="coord-dot inactive"></span> Chưa có tọa độ</span>`
            }
        </div>
        <div class="card-actions">
          ${c.lat && c.lng ? `<button class="btn btn-sm btn-primary" onclick="showOnMap('${c.id}')">🗺️ Xem bản đồ</button>
          <button class="btn btn-sm btn-success" onclick="getDirectionsTo(${c.lat}, ${c.lng})">🧭 Chỉ đường</button>` : ''}
          <button class="btn btn-sm btn-secondary" onclick="goToMapForCoord('${c.id}')">📍 Cập nhật tọa độ</button>
        </div>
      </div>
    `).join('');
    }

    // ===== SEARCH =====
    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(async () => {
            const q = e.target.value.trim();
            if (!q) {
                renderCustomerList();
                return;
            }
            const res = await apiCall('/api/customers/search?q=' + encodeURIComponent(q));
            if (res) {
                const results = await res.json();
                renderCustomerList(results);
            }
        }, 300);
    });

    // ===== MAP =====
    function initMap() {
        if (ctvMap) {
            ctvMap.invalidateSize();
            loadMapMarkers();
            return;
        }

        ctvMap = L.map('map').setView([11.75, 108.36], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap',
            maxZoom: 19
        }).addTo(ctvMap);

        setTimeout(() => ctvMap.invalidateSize(), 200);
        loadMapMarkers();

        // Click on map → update coordinate
        ctvMap.on('click', (e) => {
            pendingCoord = { lat: e.latlng.lat, lng: e.latlng.lng };
            document.getElementById('coordDisplay').textContent = `${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;

            // Populate customer select
            const select = document.getElementById('coordCustomerSelect');
            select.innerHTML = customers.map(c =>
                `<option value="${c.id}">${escHtml(c.name)} - ${escHtml(c.account)}</option>`
            ).join('');

            openModal('coordModal');
        });
    }

    function loadMapMarkers() {
        markers.forEach(m => ctvMap.removeLayer(m));
        markers = [];

        const withCoord = customers.filter(c => c.lat && c.lng);
        if (withCoord.length === 0) return;

        const bounds = [];
        withCoord.forEach(c => {
            const marker = L.marker([c.lat, c.lng]).addTo(ctvMap);
            marker.bindPopup(createPopupContent(c));
            markers.push(marker);
            bounds.push([c.lat, c.lng]);
        });

        if (bounds.length > 0) {
            ctvMap.fitBounds(bounds, { padding: [30, 30] });
        }
    }

    function createPopupContent(c) {
        return `
      <div class="popup-title">${escHtml(c.name)}</div>
      <div class="popup-info">
        <span>📞 <a href="tel:${escHtml(c.phone)}" style="color:#22c55e;text-decoration:none;font-weight:600;" title="Gọi ${escHtml(c.phone)}">📱 ${escHtml(c.phone)}</a></span>
        <span>📦 <strong>${escHtml(c.package)}</strong> - ${escHtml(formatPrice(c.price))}</span>
        <span>📍 <strong>${escHtml(c.address)}</strong></span>
        <span>🔑 Account: <strong>${escHtml(c.account)}</strong></span>
      </div>
      <div class="popup-actions">
        <button class="popup-btn directions" onclick="getDirectionsTo(${c.lat}, ${c.lng})">🧭 Chỉ đường</button>
        <button class="popup-btn" style="background:#6366f1;color:#fff;border:none;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:12px;" onclick="editCustomerFromMap('${c.id}')">✏️ Sửa</button>
      </div>
    `;
    }

    // ===== SHOW ON MAP =====
    window.showOnMap = function (id) {
        const c = customers.find(x => x.id === id);
        if (!c || !c.lat || !c.lng) return;

        // Switch to map tab
        document.querySelectorAll('.sidebar-nav a').forEach(l => l.classList.remove('active'));
        document.querySelector('[data-tab="map"]').classList.add('active');
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.getElementById('tab-map').classList.add('active');

        initMap();
        setTimeout(() => {
            ctvMap.setView([c.lat, c.lng], 16);
            const marker = markers.find(m => {
                const ll = m.getLatLng();
                return Math.abs(ll.lat - c.lat) < 0.0001 && Math.abs(ll.lng - c.lng) < 0.0001;
            });
            if (marker) marker.openPopup();
        }, 300);
    };

    // ===== GO TO MAP FOR COORDINATE UPDATE =====
    window.goToMapForCoord = function (id) {
        // Switch to map tab
        document.querySelectorAll('.sidebar-nav a').forEach(l => l.classList.remove('active'));
        document.querySelector('[data-tab="map"]').classList.add('active');
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.getElementById('tab-map').classList.add('active');

        initMap();
        showToast('Click vào bản đồ để chọn tọa độ cho khách hàng', 'info');
    };

    // ===== DIRECTIONS =====
    window.getDirectionsTo = function (destLat, destLng) {
        if (!navigator.geolocation) {
            showToast('Trình duyệt không hỗ trợ định vị', 'error');
            return;
        }

        // Switch to map tab
        document.querySelectorAll('.sidebar-nav a').forEach(l => l.classList.remove('active'));
        document.querySelector('[data-tab="map"]').classList.add('active');
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.getElementById('tab-map').classList.add('active');

        initMap();

        showToast('Đang lấy vị trí hiện tại...', 'info');
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const startLat = pos.coords.latitude;
                const startLng = pos.coords.longitude;

                // Clear previous route
                if (routeLine) ctvMap.removeLayer(routeLine);

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
                        }).addTo(ctvMap);

                        // Add/update my location marker
                        if (myLocationMarker) ctvMap.removeLayer(myLocationMarker);
                        myLocationMarker = L.marker([startLat, startLng], {
                            icon: L.divIcon({
                                className: '',
                                html: '<div style="background:#22c55e;color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid #fff">📍</div>',
                                iconSize: [32, 32],
                                iconAnchor: [16, 16]
                            })
                        }).addTo(ctvMap).bindPopup('Vị trí của bạn');

                        ctvMap.fitBounds(routeLine.getBounds(), { padding: [50, 50] });

                        const distance = (route.distance / 1000).toFixed(1);
                        const minutes = Math.round(route.duration / 60);
                        document.getElementById('routeDistance').textContent = `${distance} km`;
                        document.getElementById('routeTime').textContent = `${minutes} phút`;
                        document.getElementById('routingInfo').classList.add('active');

                        showToast(`Khoảng cách: ${distance} km, Thời gian: ~${minutes} phút`, 'success');
                    }
                } catch (e) {
                    showToast('Không thể tìm đường đi', 'error');
                }
            },
            () => showToast('Không thể lấy vị trí hiện tại. Hãy bật GPS.', 'error'),
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    // ===== MY LOCATION =====
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
                if (myLocationMarker) ctvMap.removeLayer(myLocationMarker);
                myLocationMarker = L.marker([lat, lng], {
                    icon: L.divIcon({
                        className: '',
                        html: '<div style="background:#22c55e;color:#fff;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 2px 8px rgba(0,0,0,0.3);border:2px solid #fff">📍</div>',
                        iconSize: [32, 32],
                        iconAnchor: [16, 16]
                    })
                }).addTo(ctvMap).bindPopup('Vị trí của bạn').openPopup();
                ctvMap.setView([lat, lng], 15);
                showToast('Đã xác định vị trí của bạn', 'success');
            },
            () => showToast('Không thể lấy vị trí. Hãy bật GPS.', 'error'),
            { enableHighAccuracy: true, timeout: 10000 }
        );
    });

    // ===== SAVE COORDINATE =====
    document.getElementById('saveCoordBtn').addEventListener('click', async () => {
        if (!pendingCoord) return;
        const customerId = document.getElementById('coordCustomerSelect').value;
        if (!customerId) {
            showToast('Vui lòng chọn khách hàng', 'error');
            return;
        }

        try {
            const res = await apiCall(`/api/customers/${customerId}`, {
                method: 'PUT',
                body: JSON.stringify({ lat: pendingCoord.lat, lng: pendingCoord.lng })
            });
            if (res && res.ok) {
                showToast('Đã cập nhật tọa độ thành công!', 'success');
                closeModal('coordModal');
                pendingCoord = null;
                loadCustomers();
                setTimeout(() => loadMapMarkers(), 500);
            } else {
                const err = await res.json();
                showToast(err.error || 'Có lỗi xảy ra', 'error');
            }
        } catch (e) {
            showToast('Lỗi kết nối server', 'error');
        }
    });

    // ===== CLEAR ROUTE =====
    document.getElementById('clearRoute').addEventListener('click', () => {
        if (routeLine) ctvMap.removeLayer(routeLine);
        document.getElementById('routingInfo').classList.remove('active');
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

    window.openModal = function (id) {
        document.getElementById(id).classList.add('active');
    };

    window.closeModal = function (id) {
        document.getElementById(id).classList.remove('active');
    };

    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('active');
        });
    });

    // ===== EDIT CUSTOMER FROM MAP (CTV) =====
    window.editCustomerFromMap = function (id) {
        const c = customers.find(x => x.id === id);
        if (!c) return;
        document.getElementById('editCustId').value = c.id;
        document.getElementById('editCustName').textContent = c.name + ' (' + c.account + ')';
        document.getElementById('editCustPhone').value = c.phone || '';
        document.getElementById('editCustPackage').value = c.package || '';
        document.getElementById('editCustPrice').value = c.price || '';
        openModal('editCustomerModal');
    };

    document.getElementById('saveEditCustBtn').addEventListener('click', async () => {
        const id = document.getElementById('editCustId').value;
        if (!id) return;
        const data = {
            phone: document.getElementById('editCustPhone').value.trim(),
            package: document.getElementById('editCustPackage').value.trim(),
            price: document.getElementById('editCustPrice').value.trim()
        };
        try {
            const res = await apiCall(`/api/customers/${id}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
            if (res && res.ok) {
                showToast('Đã cập nhật thông tin khách hàng!', 'success');
                closeModal('editCustomerModal');
                loadCustomers();
                setTimeout(() => {
                    if (ctvMap) loadMapMarkers();
                }, 500);
            } else {
                const err = await res.json();
                showToast(err.error || 'Có lỗi xảy ra', 'error');
            }
        } catch (e) {
            showToast('Lỗi kết nối server', 'error');
        }
    });

    // ===== SEARCH & ASSIGN CURRENT COORDS =====
    let assignSearchTimeout;
    document.getElementById('assignSearchInput').addEventListener('input', (e) => {
        clearTimeout(assignSearchTimeout);
        assignSearchTimeout = setTimeout(() => {
            const q = e.target.value.trim().toLowerCase();
            const resultsDiv = document.getElementById('assignSearchResults');

            if (!q) {
                resultsDiv.innerHTML = '';
                return;
            }

            const filtered = customers.filter(c =>
                (c.name || '').toLowerCase().includes(q) ||
                (c.account || '').toLowerCase().includes(q) ||
                (c.phone || '').toLowerCase().includes(q)
            );

            if (filtered.length === 0) {
                resultsDiv.innerHTML = '<div style="padding:12px; color:var(--text-muted); text-align:center;">Không tìm thấy khách hàng</div>';
                return;
            }

            resultsDiv.innerHTML = filtered.map(c => `
                <div class="customer-card" style="margin-bottom:8px;">
                    <div class="card-name">${escHtml(c.name)}</div>
                    <div class="card-info">
                        <span>📞 ${escHtml(c.phone)}</span>
                        <span>📦 ${escHtml(c.package)}</span>
                        <span>🔑 ${escHtml(c.account)}</span>
                    </div>
                    <div class="card-info" style="margin-top:4px;">
                        <span>🏠 ${escHtml(c.address)}</span>
                        ${c.lat && c.lng
                    ? `<span class="coord-status has-coord"><span class="coord-dot active"></span> ${Number(c.lat).toFixed(4)}, ${Number(c.lng).toFixed(4)}</span>`
                    : `<span class="coord-status no-coord"><span class="coord-dot inactive"></span> Chưa có tọa độ</span>`
                }
                    </div>
                    <div class="card-actions">
                        <button class="btn btn-sm btn-success" onclick="assignCurrentGPS('${c.id}')">📍 Gán tọa độ hiện tại (GPS)</button>
                        ${c.lat && c.lng ? `<button class="btn btn-sm btn-primary" onclick="showOnMap('${c.id}')">🗺️ Xem bản đồ</button>` : ''}
                    </div>
                </div>
            `).join('');
        }, 300);
    });

    window.assignCurrentGPS = function (customerId) {
        if (!navigator.geolocation) {
            showToast('Trình duyệt không hỗ trợ định vị', 'error');
            return;
        }
        showToast('Đang lấy tọa độ GPS...', 'info');
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                try {
                    const res = await apiCall(`/api/customers/${customerId}`, {
                        method: 'PUT',
                        body: JSON.stringify({ lat, lng })
                    });
                    if (res && res.ok) {
                        const updated = await res.json();
                        showToast(`Đã gán tọa độ ${lat.toFixed(6)}, ${lng.toFixed(6)} cho ${updated.name}`, 'success');
                        loadCustomers();
                        setTimeout(() => {
                            // Re-trigger search to update results
                            const searchInput = document.getElementById('assignSearchInput');
                            if (searchInput.value) {
                                searchInput.dispatchEvent(new Event('input'));
                            }
                            if (ctvMap) loadMapMarkers();
                        }, 500);
                    } else {
                        const err = await res.json();
                        showToast(err.error || 'Có lỗi xảy ra', 'error');
                    }
                } catch (e) {
                    showToast('Lỗi kết nối server', 'error');
                }
            },
            () => showToast('Không thể lấy vị trí. Hãy bật GPS.', 'error'),
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    // ===== INIT =====
    loadCustomers();
})();
