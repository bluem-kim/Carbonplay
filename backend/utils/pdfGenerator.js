const puppeteer = require('puppeteer');

/**
 * Generates a PDF buffer from HTML content.
 * @param {string} html - The HTML string to render as PDF.
 * @returns {Promise<Buffer>} - The generated PDF as a buffer.
 */
async function generatePdfFromHtml(html) {
    const browser = await puppeteer.launch({
        headless: 'new', // for Puppeteer v20+; use true for older versions
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4' });
    await browser.close();
    return pdfBuffer;
}

module.exports = { generatePdfFromHtml }; 