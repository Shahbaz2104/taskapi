const express = require('express');
const authController = require('../controllers/auth_controller.js');
const router = express.Router();


router.post('/register', authController.register);
router.post('/login', authController.login);

module.exports = router;