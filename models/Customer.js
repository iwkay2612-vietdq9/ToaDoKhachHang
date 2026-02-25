const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    name: { type: String, required: true },
    account: { type: String, default: '' },
    phone: { type: String, default: '' },
    package: { type: String, default: '' },
    price: { type: String, default: '' },
    address: { type: String, default: '' },
    lat: { type: Number, default: null },
    lng: { type: Number, default: null },
    ctvCode: { type: String, default: '' },
    billingType: { type: String, default: 'hang_thang' },
    prepaidPeriod: { type: String, default: '' },
    prepaidExpiry: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Customer', customerSchema);
