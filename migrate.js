/**
 * Migration script: Import data từ db.json vào MongoDB
 * 
 * Cách dùng:
 *   set MONGODB_URI=mongodb+srv://...
 *   node migrate.js
 */
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

const User = require('./models/User');
const Customer = require('./models/Customer');
const EditLog = require('./models/EditLog');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/toado-app';
const DB_PATH = path.join(__dirname, 'data', 'db.json');

async function migrate() {
    console.log('🔄 Bắt đầu migrate dữ liệu...');
    console.log(`📦 MongoDB URI: ${MONGODB_URI.replace(/\/\/.*@/, '//***:***@')}`);

    await mongoose.connect(MONGODB_URI);
    console.log('✅ Đã kết nối MongoDB');

    // Check if db.json exists
    if (!fs.existsSync(DB_PATH)) {
        console.log('❌ Không tìm thấy file data/db.json');
        process.exit(1);
    }

    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    console.log(`📊 Dữ liệu từ db.json:`);
    console.log(`   - Users: ${(db.users || []).length}`);
    console.log(`   - Customers: ${(db.customers || []).length}`);
    console.log(`   - Edit Logs: ${(db.editLogs || []).length}`);

    // Clear existing data
    await User.deleteMany({});
    await Customer.deleteMany({});
    await EditLog.deleteMany({});
    console.log('🗑️  Đã xóa dữ liệu cũ trong MongoDB');

    // Migrate Users
    if (db.users && db.users.length > 0) {
        for (const u of db.users) {
            await User.create({
                username: u.username,
                password: u.password, // Already hashed
                role: u.role,
                ctvCode: u.ctvCode
            });
        }
        console.log(`✅ Đã import ${db.users.length} users`);
    }

    // Migrate Customers
    if (db.customers && db.customers.length > 0) {
        for (const c of db.customers) {
            await Customer.create({
                name: c.name || '',
                account: c.account || '',
                phone: c.phone || '',
                package: c.package || '',
                price: c.price || '',
                address: c.address || '',
                lat: c.lat || null,
                lng: c.lng || null,
                ctvCode: c.ctvCode || '',
                billingType: c.billingType || 'hang_thang',
                prepaidPeriod: c.prepaidPeriod || '',
                prepaidExpiry: c.prepaidExpiry || ''
            });
        }
        console.log(`✅ Đã import ${db.customers.length} customers`);
    }

    // Migrate Edit Logs
    if (db.editLogs && db.editLogs.length > 0) {
        for (const log of db.editLogs) {
            await EditLog.create({
                customerId: log.customerId || '',
                customerName: log.customerName || '',
                ctvCode: log.ctvCode || '',
                ctvUsername: log.ctvUsername || '',
                editedAt: log.editedAt ? new Date(log.editedAt) : new Date(),
                changes: log.changes || []
            });
        }
        console.log(`✅ Đã import ${db.editLogs.length} edit logs`);
    }

    console.log('\n🎉 Migration hoàn tất!');
    await mongoose.disconnect();
    process.exit(0);
}

migrate().catch(err => {
    console.error('❌ Lỗi migrate:', err.message);
    process.exit(1);
});
