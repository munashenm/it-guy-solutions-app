const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const www = path.join(__dirname, 'www');
fs.mkdirSync(www, { recursive: true });

const copies = [
    ['js/native-shell.js', 'native-shell.js'],
    ['lib/staff-shell.js', 'staff-shell.js'],
    ['img/icon.png', 'icon.png'],
    ['img/logo.png', 'logo.png']
];

for (const [from, to] of copies) {
    fs.copyFileSync(path.join(root, from), path.join(www, to));
}
