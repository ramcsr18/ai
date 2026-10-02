"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.post('/verify-id', authController_1.verifyId);
router.post('/get-voting-token', authMiddleware_1.authMiddleware, authController_1.getVotingToken);
exports.default = router;
