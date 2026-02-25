const mongoose = require('mongoose');

const editLogSchema = new mongoose.Schema({
    customerId: { type: String, required: true },
    customerName: { type: String, default: '' },
    ctvCode: { type: String, default: '' },
    ctvUsername: { type: String, default: '' },
    editedAt: { type: Date, default: Date.now },
    changes: [{
        field: String,
        oldValue: String,
        newValue: String
    }]
}, { timestamps: true });

module.exports = mongoose.model('EditLog', editLogSchema);
