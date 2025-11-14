const nodemailer = require('nodemailer');

// Ensure all required environment variables are set
const { MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS, MAIL_FROM } = process.env;
if (!MAIL_HOST || !MAIL_PORT || !MAIL_USER || !MAIL_PASS) {
    throw new Error('Mail credentials are not fully set in environment variables.');
}

const PORT = Number(MAIL_PORT);
const secure = PORT === 465; // SMTPS

const transporter = nodemailer.createTransport({
    host: MAIL_HOST,
    port: PORT,
    secure, // true for 465, false for 587/others (STARTTLS)
    auth: {
        user: MAIL_USER,
        pass: MAIL_PASS
    }
});

/**
 * Send an email
 * @param {Object} options - { to, subject, html }
 * @returns {Promise}
 */
function sendMail(options) {
    const from = MAIL_FROM || MAIL_USER;
    return transporter.sendMail({
        from,
        ...options
    });
}

function verifyTransport() {
    return transporter.verify();
}

module.exports = { sendMail, verifyTransport }; 