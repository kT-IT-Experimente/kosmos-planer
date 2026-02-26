const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// The main wrapper that hides the Mint Green body
code = code.replace(/className="flex flex-col h-screen bg-slate-100 font-sans overflow-hidden text-slate-900"/g, 'className="flex flex-col h-screen bg-transparent font-sans overflow-hidden text-[#161616]"');

// Other main panels that should be transparent to let the body background show
code = code.replace(/bg-slate-50 p-6 space-y-6/g, 'bg-transparent p-6 space-y-6'); /* Admin / Speaker panels */
code = code.replace(/flex bg-slate-50/g, 'flex bg-transparent'); /* main content area */

// White panels should stay white, but we already have CSS for it if we want.
// For now, let's fix the main wrappers.
fs.writeFileSync('src/App.jsx', code);
console.log('Main backgrounds set to transparent to allow KDS body color!');
