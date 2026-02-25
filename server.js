const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const XLSX = require('xlsx');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const User = require('./models/User');
const Customer = require('./models/Customer');
const EditLog = require('./models/EditLog');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'toado-app-secret-key-2026';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/toado-app';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Upload config
const upload = multer({ dest: 'uploads/' });

// --- Connect MongoDB ---
mongoose.connect(MONGODB_URI)
  .then(() => console.log('✅ Đã kết nối MongoDB'))
  .catch(err => {
    console.error('❌ Lỗi kết nối MongoDB:', err.message);
    process.exit(1);
  });

// --- Initialize admin user if none exists ---
async function initDB() {
  const adminExists = await User.findOne({ role: 'admin' });
  if (!adminExists) {
    await User.create({
      username: 'admin',
      password: bcrypt.hashSync('admin123', 10),
      role: 'admin',
      ctvCode: 'ADMIN'
    });
    console.log('✅ Tạo tài khoản admin mặc định (admin/admin123)');
  }
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
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu không đúng' });
    }
    const token = jwt.sign(
      { id: user._id.toString(), username: user.username, role: user.role, ctvCode: user.ctvCode },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      token,
      user: { id: user._id.toString(), username: user.username, role: user.role, ctvCode: user.ctvCode }
    });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server: ' + err.message });
  }
});

// ========== USER MANAGEMENT API (Admin only) ==========
app.get('/api/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const users = await User.find({}, { password: 0 });
    res.json(users.map(u => ({ id: u._id.toString(), username: u.username, role: u.role, ctvCode: u.ctvCode })));
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server' });
  }
});

app.post('/api/users', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { username, password, ctvCode } = req.body;
    if (!username || !password || !ctvCode) return res.status(400).json({ error: 'Thiếu thông tin' });
    if (await User.findOne({ username })) {
      return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại' });
    }
    if (await User.findOne({ ctvCode })) {
      return res.status(400).json({ error: 'Mã CTV đã tồn tại, vui lòng chọn mã khác' });
    }
    const newUser = await User.create({
      username,
      password: bcrypt.hashSync(password, 10),
      role: 'ctv',
      ctvCode
    });
    res.json({ id: newUser._id.toString(), username: newUser.username, role: newUser.role, ctvCode: newUser.ctvCode });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server: ' + err.message });
  }
});

app.put('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy user' });
    const { username, password, ctvCode } = req.body;
    if (ctvCode && ctvCode !== user.ctvCode) {
      if (await User.findOne({ ctvCode })) {
        return res.status(400).json({ error: 'Mã CTV đã tồn tại, vui lòng chọn mã khác' });
      }
    }
    if (username) user.username = username;
    if (password) user.password = bcrypt.hashSync(password, 10);
    if (ctvCode) user.ctvCode = ctvCode;
    await user.save();
    res.json({ id: user._id.toString(), username: user.username, role: user.role, ctvCode: user.ctvCode });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server: ' + err.message });
  }
});

// ========== CTV CODES LIST (for dropdowns) ==========
app.get('/api/ctv-codes', authMiddleware, adminOnly, async (req, res) => {
  try {
    const ctvList = await User.find({ role: 'ctv' }, { ctvCode: 1, username: 1 });
    res.json(ctvList.map(u => ({ ctvCode: u.ctvCode, username: u.username })));
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server' });
  }
});

app.delete('/api/users/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'Không tìm thấy user' });
    if (user.role === 'admin') return res.status(400).json({ error: 'Không thể xóa admin' });
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ========== CUSTOMER API ==========
app.get('/api/customers', authMiddleware, async (req, res) => {
  try {
    let filter = {};
    if (req.user.role === 'ctv') {
      filter.ctvCode = req.user.ctvCode;
    }
    const customers = await Customer.find(filter);
    res.json(customers.map(c => ({
      id: c._id.toString(),
      name: c.name, account: c.account, phone: c.phone,
      package: c.package, price: c.price, address: c.address,
      lat: c.lat, lng: c.lng, ctvCode: c.ctvCode,
      billingType: c.billingType, prepaidPeriod: c.prepaidPeriod, prepaidExpiry: c.prepaidExpiry,
      contactStatus: c.contactStatus
    })));
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server' });
  }
});

app.get('/api/customers/search', authMiddleware, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json([]);
    let filter = {};
    if (req.user.role === 'ctv') {
      filter.ctvCode = req.user.ctvCode;
    }
    const customers = await Customer.find(filter);
    const qLower = q.toLowerCase();
    const results = customers.filter(c =>
      (c.name || '').toLowerCase().includes(qLower) ||
      (c.account || '').toLowerCase().includes(qLower) ||
      (c.phone || '').toLowerCase().includes(qLower) ||
      (c.package || '').toLowerCase().includes(qLower) ||
      (c.address || '').toLowerCase().includes(qLower) ||
      (c.ctvCode || '').toLowerCase().includes(qLower) ||
      String(c.price || '').includes(qLower)
    );
    res.json(results.map(c => ({
      id: c._id.toString(),
      name: c.name, account: c.account, phone: c.phone,
      package: c.package, price: c.price, address: c.address,
      lat: c.lat, lng: c.lng, ctvCode: c.ctvCode,
      billingType: c.billingType, prepaidPeriod: c.prepaidPeriod, prepaidExpiry: c.prepaidExpiry,
      contactStatus: c.contactStatus
    })));
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server' });
  }
});

app.post('/api/customers', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { name, account, phone, package: pkg, price, address, lat, lng, ctvCode, billingType, prepaidPeriod, prepaidExpiry, contactStatus } = req.body;
    if (!name) return res.status(400).json({ error: 'Thiếu tên khách hàng' });
    const customer = await Customer.create({
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
      prepaidExpiry: prepaidExpiry || '',
      contactStatus: contactStatus || 'chua_goi'
    });
    res.json({
      id: customer._id.toString(),
      name: customer.name, account: customer.account, phone: customer.phone,
      package: customer.package, price: customer.price, address: customer.address,
      lat: customer.lat, lng: customer.lng, ctvCode: customer.ctvCode,
      billingType: customer.billingType, prepaidPeriod: customer.prepaidPeriod, prepaidExpiry: customer.prepaidExpiry,
      contactStatus: customer.contactStatus
    });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server: ' + err.message });
  }
});

app.put('/api/customers/:id', authMiddleware, async (req, res) => {
  try {
    const customer = await Customer.findById(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });

    // CTV can update coordinates + phone, package, price
    if (req.user.role === 'ctv') {
      if (customer.ctvCode !== req.user.ctvCode) {
        return res.status(403).json({ error: 'Không có quyền' });
      }
      // Coordinate updates (no logging)
      if (req.body.lat !== undefined) customer.lat = req.body.lat;
      if (req.body.lng !== undefined) customer.lng = req.body.lng;

      // Editable fields with audit logging
      const editableFields = ['phone', 'package', 'price'];
      const changes = [];
      editableFields.forEach(f => {
        if (req.body[f] !== undefined && req.body[f] !== customer[f]) {
          changes.push({
            field: f,
            oldValue: customer[f] || '',
            newValue: req.body[f]
          });
          customer[f] = req.body[f];
        }
      });

      // Log changes if any editable field was modified
      if (changes.length > 0) {
        await EditLog.create({
          customerId: customer._id.toString(),
          customerName: customer.name,
          ctvCode: req.user.ctvCode,
          ctvUsername: req.user.username,
          editedAt: new Date(),
          changes
        });
      }
    } else {
      // Admin can update everything
      const fields = ['name', 'account', 'phone', 'package', 'price', 'address', 'lat', 'lng', 'ctvCode', 'billingType', 'prepaidPeriod', 'prepaidExpiry', 'contactStatus'];
      fields.forEach(f => {
        if (req.body[f] !== undefined) customer[f] = req.body[f];
      });
    }
    await customer.save();
    res.json({
      id: customer._id.toString(),
      name: customer.name, account: customer.account, phone: customer.phone,
      package: customer.package, price: customer.price, address: customer.address,
      lat: customer.lat, lng: customer.lng, ctvCode: customer.ctvCode,
      billingType: customer.billingType, prepaidPeriod: customer.prepaidPeriod, prepaidExpiry: customer.prepaidExpiry,
      contactStatus: customer.contactStatus
    });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server: ' + err.message });
  }
});

app.delete('/api/customers/:id', authMiddleware, adminOnly, async (req, res) => {
  try {
    const result = await Customer.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Không tìm thấy khách hàng' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ========== BULK DELETE ==========
app.post('/api/customers/bulk-delete', authMiddleware, adminOnly, async (req, res) => {
  try {
    const { ids, deleteAll } = req.body;
    if (deleteAll) {
      const result = await Customer.deleteMany({});
      return res.json({ success: true, count: result.deletedCount });
    }
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Chưa chọn khách hàng để xóa' });
    }
    const result = await Customer.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, count: result.deletedCount });
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server: ' + err.message });
  }
});

// ========== EXCEL IMPORT ==========
app.post('/api/customers/import', authMiddleware, adminOnly, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Không có file' });
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet);

    // Build valid CTV codes list
    const ctvUsers = await User.find({ role: 'ctv' });
    const validCtvCodes = new Set(ctvUsers.map(u => u.ctvCode));

    const imported = [];
    const errors = [];

    for (let idx = 0; idx < rows.length; idx++) {
      const row = rows[idx];
      const ctvCode = String(row['Mã CTV'] || row['ctvCode'] || '').trim();
      const name = String(row['Tên khách hàng'] || row['name'] || '').trim();

      // Validate ctvCode exists in CTV list
      if (!ctvCode) {
        errors.push({ row: idx + 2, name, ctvCode, reason: 'Thiếu mã CTV' });
        continue;
      }
      if (!validCtvCodes.has(ctvCode)) {
        errors.push({ row: idx + 2, name, ctvCode, reason: `Mã CTV "${ctvCode}" không tồn tại trong danh sách CTV` });
        continue;
      }

      const contactVal = String(row['Tiếp xúc'] || row['contactStatus'] || '').trim().toLowerCase();
      const contactStatus = (contactVal === 'da_goi' || contactVal === 'đã gọi') ? 'da_goi' : 'chua_goi';
      const customer = await Customer.create({
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
        prepaidExpiry: String(row['Ngày hết hạn cước'] || row['prepaidExpiry'] || ''),
        contactStatus: contactStatus
      });
      imported.push({
        id: customer._id.toString(),
        name: customer.name, account: customer.account, phone: customer.phone,
        package: customer.package, price: customer.price
      });
    }

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
    ['Tên khách hàng', 'Account', 'Số điện thoại', 'Gói cước', 'Giá tiền', 'Địa chỉ', 'Latitude', 'Longitude', 'Mã CTV', 'Loại cước', 'Kỳ đóng trước', 'Ngày hết hạn cước', 'Tiếp xúc'],
    ['Nguyễn Văn A', 'ACC001', '0901234567', 'FiberMax', '200000', '123 Đường ABC, TP.HCM', '10.7769', '106.7009', 'CTV01', 'dong_truoc', '6_thang', '2026-08-25', 'chua_goi']
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 20 }, { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 12 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'KhachHang');
  const filePath = path.join(__dirname, 'uploads', 'template.xlsx');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  XLSX.writeFile(wb, filePath);
  res.download(filePath, 'template_khachhang.xlsx');
});

// ========== EXCEL EXPORT ==========
app.get('/api/customers/export', async (req, res) => {
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
    let filter = {};
    if (user.role === 'ctv') {
      filter.ctvCode = user.ctvCode;
    }
    const customers = await Customer.find(filter);
    const data = [
      ['Tên khách hàng', 'Account', 'Số điện thoại', 'Gói cước', 'Giá tiền', 'Địa chỉ', 'Latitude', 'Longitude', 'Mã CTV', 'Loại cước', 'Kỳ đóng trước', 'Ngày hết hạn cước', 'Tiếp xúc']
    ];
    customers.forEach(c => {
      data.push([
        c.name || '', c.account || '', c.phone || '', c.package || '',
        c.price || '', c.address || '',
        c.lat || '', c.lng || '', c.ctvCode || '',
        c.billingType || 'hang_thang', c.prepaidPeriod || '', c.prepaidExpiry || '',
        c.contactStatus || 'chua_goi'
      ]);
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 35 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 12 }
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
app.get('/api/edit-logs', authMiddleware, adminOnly, async (req, res) => {
  try {
    const logs = await EditLog.find({}).sort({ editedAt: -1 });
    res.json(logs.map(l => ({
      id: l._id.toString(),
      customerId: l.customerId,
      customerName: l.customerName,
      ctvCode: l.ctvCode,
      ctvUsername: l.ctvUsername,
      editedAt: l.editedAt.toISOString(),
      changes: l.changes
    })));
  } catch (err) {
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// ========== SPA Routing ==========
app.get('*', (req, res) => {
  // Serve index.html for any non-API, non-static route
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

// ========== START ==========
app.listen(PORT, async () => {
  console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
  await initDB();
});
