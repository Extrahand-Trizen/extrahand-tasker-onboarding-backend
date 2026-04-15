"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const CertificateReviewController_1 = require("../controllers/CertificateReviewController");
const adminAuth_1 = require("../middleware/adminAuth");
const roleAuth_1 = require("../middleware/roleAuth");
const router = express_1.default.Router();
router.use(adminAuth_1.adminAuthMiddleware);
router.get('/queue', (0, roleAuth_1.requirePermission)('canVerifyUserCertificates'), CertificateReviewController_1.CertificateReviewController.getQueue);
router.put('/:uid/:skillIndex/:certificateIndex/verify', (0, roleAuth_1.requirePermission)('canVerifyUserCertificates'), CertificateReviewController_1.CertificateReviewController.verify);
router.put('/:uid/:skillIndex/:certificateIndex/reject', (0, roleAuth_1.requirePermission)('canVerifyUserCertificates'), CertificateReviewController_1.CertificateReviewController.reject);
exports.default = router;
//# sourceMappingURL=certificateReview.js.map