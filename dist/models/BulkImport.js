"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importStar(require("mongoose"));
const BulkImportSchema = new mongoose_1.Schema({
    importId: { type: String, required: true, unique: true, index: true },
    // Legacy field (kept for backward compatibility)
    adminUid: { type: String, index: true },
    // New creator tracking fields
    createdBy: { type: String, required: true, index: true }, // userId
    createdByName: { type: String, index: true },
    createdByEmail: { type: String, index: true },
    createdByRole: {
        type: String,
        enum: ['qualifier', 'onboarder', 'lead_access_manager'],
        index: true
    },
    // Idempotency - file hash to prevent duplicate uploads
    fileHash: { type: String, unique: true, sparse: true, index: true },
    fileName: { type: String, required: true },
    totalRows: { type: Number, required: true },
    successCount: { type: Number, default: 0 },
    failedCount: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending',
        index: true
    },
    operationType: {
        type: String,
        enum: ['create', 'update', 'delete', 'mixed'],
        index: true
    },
    errors: [{
            row: Number,
            uid: String,
            phone: String,
            error: String
        }],
    importedUserIds: [String],
    updatedUserIds: [String],
    deletedUserIds: [String],
    completedAt: Date
}, { timestamps: true });
// Compound indexes for efficient queries
BulkImportSchema.index({ fileHash: 1, createdBy: 1 }); // Idempotency check
BulkImportSchema.index({ createdBy: 1, createdAt: -1 }); // User's imports
BulkImportSchema.index({ createdByRole: 1, createdAt: -1 }); // Role filter
BulkImportSchema.index({ createdByEmail: 1, createdAt: -1 }); // Email filter
BulkImportSchema.index({ status: 1, createdAt: -1 }); // Status filter
BulkImportSchema.index({ createdByRole: 1, status: 1, createdAt: -1 }); // Combined filter
exports.default = mongoose_1.default.model('BulkImport', BulkImportSchema);
//# sourceMappingURL=BulkImport.js.map