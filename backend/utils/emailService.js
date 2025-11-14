const fs = require('fs');
const path = require('path');

/**
 * Loads an HTML template and replaces variables in the form of {{varName}}.
 * Supports rendering repeated order items for order confirmation emails.
 * @param {string} templateName - The filename of the template (e.g., 'verify_account.html')
 * @param {Object} variables - Key-value pairs to replace in the template
 * @returns {string} - The HTML content with variables replaced
 */
function loadTemplate(templateName, variables = {}) {
    const templatePath = path.join(__dirname, '../email_templates', templateName);
    let template = fs.readFileSync(templatePath, 'utf8');

    // Special handling for order items (for order-confirmation)
    if (Array.isArray(variables.items)) {
        // Replace {{orderItems}} with rendered HTML for all items
        let itemsHtml = '';
        variables.items.forEach((item, idx) => {
            itemsHtml += `
            <div class="item">
                <div class="item-details">
                    <div class="item-name">${item.name} : ${item.price}</div>
                    <div class="item-quantity">Quantity: ${item.quantity}</div>
                </div>
            </div>`;
        });
        template = template.replace(/<!-- Example items - replace with dynamic content -->[\s\S]*<!-- Add more items as needed -->/, itemsHtml);
    }

    // Replace all other variables
    for (const [key, value] of Object.entries(variables)) {
        if (key === 'items') continue; // already handled
        const regex = new RegExp(`{{\s*${key}\s*}}`, 'g');
        template = template.replace(regex, value);
    }
    // Provide a default replacement for {{year}}
    const yearRegex = /{{\s*year\s*}}/g;
    if (yearRegex.test(template)) {
        template = template.replace(yearRegex, String(new Date().getFullYear()));
    }
    return template;
}

module.exports = { loadTemplate };
