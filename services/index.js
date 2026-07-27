const path = require('path');
const fs = require('fs');

/**
 * 确保 services 目录存在
 */
const servicesDir = path.join(__dirname, 'services');
if (!fs.existsSync(servicesDir)) {
    fs.mkdirSync(servicesDir, { recursive: true });
}

module.exports = {
    servicesDir
};
