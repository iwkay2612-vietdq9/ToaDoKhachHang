const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const XLSX = require('xlsx');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = 'toado-app-secret-key-2026';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Upload config
const upload = multer({ dest: 'uploads/' });

// --- Database helpers ---
const DB_PATH = path.join(__dirname, 'data', 'db.json');

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    const initial = {
      users: [{
        id: uuidv4(),
        username: 'admin',
        password: bcrypt.hashSync('admin123', 10),
        role: 'admin',
        ctvCode: 'ADMIN'
      }],
      customers: [],
      editLogs: []
    };
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeDB(data) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// --- Auth Middleware ---
function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token không hợp lệ' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Chỉ Admin mới có quyền' });
  next();
}

// ========== AUTH API ==========
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const db = readDB();
  const user = db.users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
  }
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role, ctvCode: user.ctvCode }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user.id, username: user.username, role: user.role, ctvCode: user.ctvCode } });
});

// ========== USER MANAGEMENT API (Admin only) ==========
app.get('/api/users', authMiddleware, adminOnly, (req, res) => {
  const db = readDB();
  const users = db.users.map(u => ({ id: u.id, username: u.username, role: u.role, ctvCode: u.ctvCode }));
  res.json(users);
});

app.post('/api/users', authMiddleware, adminOnly, (req, res) => {
  const { username, password, ctvCode } = req.body;
  if (!username || !password || !ctvCode) return res.status(400).json({ error: 'Thiếu thông tin' });
  const db = readDB();
  if (db.users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });
  }
  if (db.users.find(u => u.ctvCode === ctvCode)) {
    return res.status(400).json({ error: 'Mã CTV đã tồn tại, vui lòng chọn mã khác' });
  }
  const newUser = {
    id: uuidv4(),
    username,
    password: bcrypt.hashSync(password, 10),
    role: 'ctv',
    ctvCode
  };
  db.users.push(newUser);
  writeDB(db);
  res.json({ id: newUser.id, username: newUser.username, role: newUser.role, ctvCode: newUser.ctvCode });
});

app.put('/api/users/:id', authMiddleware, adminOnly, (req, res) => {
  const db = readDB();
  const idx = db.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy user' });
  const { username, password, ctvCode } = req.body;
  if (ctvCode && ctvCode !== db.users[idx].ctvCode) {
    if (db.users.find(u => u.ctvCode === ctvCode)) {
      return res.status(400).json({ error: 'Mã CTV đã tồn tại, vui lòng chọn mã khác' });
    }
  }
  if (username) db.users[idx].username = username;
  if (password) db.users[idx].password = bcrypt.hashSync(password, 10);
  if (ctvCode) db.users[idx].ctvCode = ctvCode;
  writeDB(db);
  res.json({ id: db.users[idx].id, username: db.users[idx].username, role: db.users[idx].role, ctvCode: db.users[idx].ctvCode });
});

// ========== CTV CODES LIST (for dropdowns) ==========
app.get('/api/ctv-codes', authMiddleware, adminOnly, (req, res) => {
  const db = readDB();
  const ctvList = db.users.filter(u => u.role === 'ctv').map(u => ({ ctvCode: u.ctvCode, username: u.username }));
  res.json(ctvList);
});

app.delete('/api/users/:id', authMiddleware, adminOnly, (req, res) => {
  const db = readDB();
  const idx = db.users.findIndex(u => u.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy user' });
  if (db.users[idx].role === 'admin') return res.status(400).json({ error: 'Không thể xóa admin' });
  db.users.splice(idx, 1);
  writeDB(db);
  res.json({ success: true });
});

// ========== CUSTOMER API ==========
app.get('/api/customers', authMiddleware, (req, res) => {
  const db = readDB();
  let customers = db.customers;
  if (req.user.role === 'ctv') {
    customers = customers.filter(c => c.ctvCode === req.user.ctvCode);
  }
  res.json(customers);
});

app.get('/api/customers/search', authMiddleware, (req, res) => {
  const q = (req.query.q || '').toLowerCase().trim();
  if (!q) return res.json([]);
  const db = readDB();
  let customers = db.customers;
  if (req.user.role === 'ctv') {
    customers = customers.filter(c => c.ctvCode === req.user.ctvCode);
  }
  const results = customers.filter(c =>
    (c.name || '').toLowerCase().includes(q) ||
    (c.account || '').toLowerCase().includes(q) ||
    (c.phone || '').toLowerCase().includes(q) ||
    (c.package || '').toLowerCase().includes(q) ||
    (c.address || '').toLowerCase().includes(q) ||
    (c.ctvCode || '').toLowerCase().includes(q) ||
    String(c.price || '').includes(q)
  );
  res.json(results);
});

app.post('/api/customers', authMiddleware, adminOnly, (req, res) => {
  const { name, account, phone, package: pkg, price, address, lat, lng, ctvCode, billingType, prepaidPeriod, prepaidExpiry } = req.body;
  if (!name) return res.status(400).json({ error: 'Thiếu tên khách hàng' });
  const db = readDB();
  const customer = {
    id: uuidv4(),
    name: name || '',
    account: account || '',
    phone: phone || '',
    package: pkg || '',
    price: price || '',
    address: address || '',
    lat: lat || null,
    lng: lng || null,
    ctvCode: ctvCode || '',
    billingType: billingType || 'hang_thang',
    prepaidPeriod: prepaidPeriod || '',
    prepaidExpiry: prepaidExpiry || ''
  };
  db.customers.push(customer);
  writeDB(db);
  res.json(customer);
});

app.put('/api/customers/:id', authMiddleware, (req, res) => {
  const db = readDB();
  if (!db.editLogs) db.editLogs = [];
  const idx = db.customers.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });

  // CTV can update coordinates + phone, package, price
  if (req.user.role === 'ctv') {
    if (db.customers[idx].ctvCode !== req.user.ctvCode) {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    // Coordinate updates (no logging)
    if (req.body.lat !== undefined) db.customers[idx].lat = req.body.lat;
    if (req.body.lng !== undefined) db.customers[idx].lng = req.body.lng;

    // Editable fields with audit logging
    const editableFields = ['phone', 'package', 'price'];
    const changes = [];
    editableFields.forEach(f => {
      if (req.body[f] !== undefined && req.body[f] !== db.customers[idx][f]) {
        changes.push({
          field: f,
          oldValue: db.customers[idx][f] || '',
          newValue: req.body[f]
        });
        db.customers[idx][f] = req.body[f];
      }
    });

    // Log changes if any editable field was modified
    if (changes.length > 0) {
      db.editLogs.push({
        id: uuidv4(),
        customerId: db.customers[idx].id,
        customerName: db.customers[idx].name,
        ctvCode: req.user.ctvCode,
        ctvUsername: req.user.username,
        editedAt: new Date().toISOString(),
        changes
      });
    }
  } else {
    // Admin can update everything
    const fields = ['name', 'account', 'phone', 'package', 'price', 'address', 'lat', 'lng', 'ctvCode', 'billingType', 'prepaidPeriod', 'prepaidExpiry'];
    fields.forEach(f => {
      if (req.body[f] !== undefined) db.customers[idx][f] = req.body[f];
    });
  }
  writeDB(db);
  res.json(db.customers[idx]);
});

app.delete('/api/customers/:id', authMiddleware, adminOnly, (req, res) => {
  const db = readDB();
  const idx = db.customers.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });
  db.customers.splice(idx, 1);
  writeDB(db);
  res.json({ success: true });
});

// ========== BULK DELETE ==========
app.post('/api/customers/bulk-delete', authMiddleware, adminOnly, (req, res) => {
  const { ids, deleteAll } = req.body;
  const db = readDB();
  if (deleteAll) {
    const count = db.customers.length;
    db.customers = [];
    writeDB(db);
    return res.json({ success: true, count });
  }
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'Chưa chọn khách hàng để xóa' });
  }
  const idsSet = new Set(ids);
  const before = db.customers.length;
  db.customers = db.customers.filter(c => !idsSet.has(c.id));
  const deleted = before - db.customers.length;
  writeDB(db);
  res.json({ success: true, count: deleted });
});

// ========== EXCEL IMPORT ==========
app.post('/api/customers/import', authMiddleware, adminOnly, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Không có file' });
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);
    const db = readDB();

    // Build valid CTV codes list
    const validCtvCodes = new Set(db.users.filter(u => u.role === 'ctv').map(u => u.ctvCode));

    const imported = [];
    const errors = [];

    rows.forEach((row, idx) => {
      const ctvCode = String(row['Mã CTV'] || row['ctvCode'] || '').trim();
      const name = String(row['Tên khách hàng'] || row['name'] || '').trim();

      // Validate ctvCode exists in CTV list
      if (!ctvCode) {
        errors.push({ row: idx + 2, name, ctvCode, reason: 'Thiếu mã CTV' });
        return;
      }
      if (!validCtvCodes.has(ctvCode)) {
        errors.push({ row: idx + 2, name, ctvCode, reason: `Mã CTV "${ctvCode}" không tồn tại trong danh sách CTV` });
        return;
      }

      const customer = {
        id: uuidv4(),
        name: name,
        account: String(row['Account'] || row['account'] || ''),
        phone: String(row['Số điện thoại'] || row['phone'] || ''),
        package: String(row['Gói cước'] || row['package'] || ''),
        price: String(row['Giá tiền'] || row['price'] || ''),
        address: String(row['Địa chỉ'] || row['address'] || ''),
        lat: parseFloat(row['Latitude'] || row['lat']) || null,
        lng: parseFloat(row['Longitude'] || row['lng']) || null,
        ctvCode: ctvCode,
        billingType: String(row['Loại cước'] || row['billingType'] || 'hang_thang'),
        prepaidPeriod: String(row['Kỳ đóng trước'] || row['prepaidPeriod'] || ''),
        prepaidExpiry: String(row['Ngày hết hạn cước'] || row['prepaidExpiry'] || '')
      };
      db.customers.push(customer);
      imported.push(customer);
    });

    writeDB(db);
    // Clean up uploaded file
    fs.unlinkSync(req.file.path);
    res.json({ count: imported.length, customers: imported, errors });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi đọc file Excel: ' + err.message });
  }
});

// Download Excel Template
app.get('/api/template', (req, res) => {
  const wb = XLSX.utils.book_new();
  const data = [
    ['Tên khách hàng', 'Account', 'Số điện thoại', 'Gói cước', 'Giá tiền', 'Địa chỉ', 'Latitude', 'Longitude', 'Mã CTV', 'Loại cước', 'Kỳ đóng trước', 'Ngày hết hạn cước'],
    ['Nguyễn Văn A', 'ACC001', '0901234567', 'FiberMax', '200000', '123 Đường ABC, TP.HCM', '10.7769', '106.7009', 'CTV01', 'dong_truoc', '6_thang', '2026-08-25']
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 20 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 18 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'KhachHang');
  const filePath = path.join(__dirname, 'uploads', 'template.xlsx');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  XLSX.writeFile(wb, filePath);
  res.download(filePath, 'template_khachhang.xlsx');
});

// ========== EXCEL EXPORT ==========
app.get('/api/customers/export', (req, res) => {
  // Support token via query param (for direct download links)
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
  let user;
  try {
    user = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Token không hợp lệ' });
  }
  // Only admin can export
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Chỉ Admin mới có quyền xuất file' });
  }

  try {
    const db = readDB();
    let customers = db.customers;
    if (user.role === 'ctv') {
      customers = customers.filter(c => c.ctvCode === user.ctvCode);
    }
    const data = [
      ['Tên khách hàng', 'Account', 'Số điện thoại', 'Gói cước', 'Giá tiền', 'Địa chỉ', 'Latitude', 'Longitude', 'Mã CTV', 'Loại cước', 'Kỳ đóng trước', 'Ngày hết hạn cước']
    ];
    customers.forEach(c => {
      data.push([
        c.name || '', c.account || '', c.phone || '', c.package || '',
        c.price || '', c.address || '',
        c.lat || '', c.lng || '', c.ctvCode || '',
        c.billingType || 'hang_thang', c.prepaidPeriod || '', c.prepaidExpiry || ''
      ]);
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 35 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 18 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'KhachHang');
    const filePath = path.join(__dirname, 'uploads', 'export_khachhang.xlsx');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    XLSX.writeFile(wb, filePath);
    res.download(filePath, 'dulieu_khachhang.xlsx');
  } catch (err) {
    res.status(500).json({ error: 'Lỗi xuất file: ' + err.message });
  }
});

// ========== EDIT LOGS (Admin only) ==========
app.get('/api/edit-logs', authMiddleware, adminOnly, (req, res) => {
  const db = readDB();
  const logs = db.editLogs || [];
  // Return newest first
  res.json(logs.slice().reverse());
});

// ========== SPA Routing ==========
app.get('*', (req, res) => {
  // Serve index.html for any non-API, non-static route
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// ========== START ==========
app.listen(PORT, () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
  // Initialize DB on startup
  readDB();
});
