const fs = require('fs');
const glob = require('glob');

const files = glob.sync('src/**/*.jsx');

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;

    // Backgrounds
    content = content.replace(/bg-slate-50/g, 'bg-white');
    content = content.replace(/bg-slate-100/g, 'bg-white');
    content = content.replace(/bg-slate-200/g, 'bg-[#161616]/10');
    content = content.replace(/bg-slate-700/g, 'bg-[#161616]');
    content = content.replace(/bg-slate-800/g, 'bg-[#161616]');
    content = content.replace(/bg-slate-900/g, 'bg-[#161616]');

    // Text colors
    content = content.replace(/text-slate-900/g, 'text-[#161616]');
    content = content.replace(/text-slate-800/g, 'text-[#161616]');
    content = content.replace(/text-slate-700/g, 'text-[#161616]/90');
    content = content.replace(/text-slate-600/g, 'text-[#161616]/80');
    content = content.replace(/text-slate-500/g, 'text-[#161616]/60');
    content = content.replace(/text-slate-400/g, 'text-[#161616]/40');

    // Borders
    content = content.replace(/border-slate-100/g, 'border-[#161616]/10');
    content = content.replace(/border-slate-200/g, 'border-[#161616]/20');
    content = content.replace(/border-slate-300/g, 'border-[#161616]/30');
    content = content.replace(/border-slate-400/g, 'border-[#161616]/40');

    if (content !== original) {
        fs.writeFileSync(file, content);
        console.log(`Updated ${file}`);
    }
});
