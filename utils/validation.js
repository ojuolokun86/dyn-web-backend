const bcrypt = require('bcryptjs');

// Validate email
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Validate password
function isValidPassword(password) {
    return password && password.length >= 6;
}

// Validate username
function isValidUsername(username) {
    return username && username.length >= 3 && /^[a-zA-Z0-9_-]+$/.test(username);
}

// Hash password
async function hashPassword(password) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
}

// Compare password
async function comparePassword(password, hashedPassword) {
    return bcrypt.compare(password, hashedPassword);
}

// Generate random password
function generateRandomPassword() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 12; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}

module.exports = {
    isValidEmail,
    isValidPassword,
    isValidUsername,
    hashPassword,
    comparePassword,
    generateRandomPassword
};
