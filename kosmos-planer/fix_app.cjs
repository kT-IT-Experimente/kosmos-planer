const fs = require('fs');
let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. isPublished Read
code = code.replace(/stageDispo: row\[21\]\?\.trim\(\) \|\| ''/g, "stageDispo: row[21]?.trim() || '',\n          isPublished: row[23] === 'TRUE'");

// 2. liveMode Read
code = code.replace(/aktiv: r\[4\] === 'TRUE'/g, "aktiv: r[4] === 'TRUE',\n          liveMode: configThemen[0] && configThemen[0][5] === 'TRUE'");
code = code.replace(/valRanges\[4\]/g, 'valRanges[5]');
code = code.replace(/const \[configGeneral, configUsers, configBereiche, configThemen, configTags\] = valRanges;/g, 'const [configGeneral, configUsers, configBereiche, configThemen, configTags, valStages] = valRanges;');


// 3. liveMode State + toggleLiveMode
const oldLiveMode = "const [liveMode, setLiveMode] = useState(() => localStorage.getItem('kosmos_live_mode') === 'true');";
const newLiveMode = `  const [liveMode, setLiveMode] = useState(false);
  const [isTogglingLive, setIsTogglingLive] = useState(false);

  useEffect(() => {
    if (data.configThemen && typeof data.configThemen.liveMode === 'boolean') {
      setLiveMode(data.configThemen.liveMode);
    }
  }, [data.configThemen]);

  const toggleLiveMode = useCallback(async () => {
    setIsTogglingLive(true);
    const newMode = !liveMode;
    setLiveMode(newMode);

    try {
      if (config.n8nBaseUrl) {
        const token = authenticatedUser?.accessToken || authenticatedUser?.magicToken;
        const resp = await fetch(\`\${config.n8nBaseUrl}/auth/verify\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${token}\` },
          body: JSON.stringify({ action: 'toggleLiveMode', newMode })
        });
        if (!resp.ok) throw new Error('API Error');
        addToast(\`System ist nun \${newMode ? 'LIVE' : 'OFFLINE'}\`, 'success');
      }
    } catch (e) {
      setLiveMode(!newMode);
      addToast('Fehler beim Umschalten des Live-Modus', 'error');
    } finally {
      setIsTogglingLive(false);
    }
  }, [liveMode, config.n8nBaseUrl, authenticatedUser, addToast]);`;
code = code.replace(oldLiveMode, newLiveMode);

// 4. toggleFavorite UUID
const oldFavRegex = /if \(config\.n8nBaseUrl\) \{\s*const token = authenticatedUser\.accessToken \|\| authenticatedUser\.magicToken;\s*fetch\(`\$\{config\.n8nBaseUrl\}\/webcal\/toggle`, \{\s*method: 'POST',\s*headers: \{ 'Content-Type': 'application\/json', 'Authorization': `Bearer \$\{token\}` \},\s*body: JSON\.stringify\(\{\s*userId: authenticatedUser\.email,\s*sessionId: session\.id,\s*sessionTitle: session\.title,\s*action\s*\}\)\s*\}\)\.catch\(e => console\.warn\('\[Favorites\] Webhook error:', e\)\);\s*\}\s*return next;\s*\}\);\s*\}, \[config\.n8nBaseUrl, authenticatedUser\.accessToken, authenticatedUser\.magicToken, authenticatedUser\.email\]\);/g;

const newFav = `if (config.n8nBaseUrl) {
        let anonToken = localStorage.getItem('kosmos_anon_token');
        if (!anonToken) {
          anonToken = 'anon-' + Math.random().toString(36).substr(2, 9);
          localStorage.setItem('kosmos_anon_token', anonToken);
        }
        const token = authenticatedUser?.accessToken || authenticatedUser?.magicToken || anonToken;
        const userIdentifier = authenticatedUser?.email || anonToken;

        fetch(\`\${config.n8nBaseUrl}/webcal/toggle\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': \`Bearer \${token}\` },
          body: JSON.stringify({
            userId: userIdentifier,
            sessionId: session.id,
            sessionTitle: session.title,
            action
          })
        }).catch(e => console.warn('[Favorites] Webhook error:', e));
      }

      return next;
    });
  }, [config.n8nBaseUrl, authenticatedUser]);`;
code = code.replace(oldFavRegex, newFav);

// 5. isPublished save
code = code.replace(/s\.internalFeedback \|\| ''/g, "s.internalFeedback || '',\n          s.isPublished ? 'TRUE' : 'FALSE'");
code = code.replace(/'Master_Einreichungen!O2:W'/g, "'Master_Einreichungen!O2:X'");
code = code.replace(/A2:W`/g, "A2:X`");
code = code.replace(/A2:E`/g, "A2:F`");

// 6. Admin Live Button
const oldBtnRegex = /<button onClick=\{\(\) => \{\s*const newMode = !liveMode;\s*setLiveMode\(newMode\);\s*localStorage\.setItem\('kosmos_live_mode', String\(newMode\)\);\s*\}\} className=\{`flex items-center gap-2[\s\S]*?<\/button>/m;
const newBtn = `<button 
                onClick={toggleLiveMode}
                disabled={isTogglingLive}
                className={\`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all border \${isTogglingLive ? 'opacity-50 cursor-not-allowed' : ''} \${liveMode ? 'bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-red-500/10 border-red-500/50 text-red-500 hover:bg-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.3)]'}\`}
              >
                {isTogglingLive ? <Loader2 className="w-4 h-4 animate-spin" /> : <span className={\`w-2 h-2 rounded-full \${liveMode ? 'bg-red-500 animate-pulse' : 'bg-red-500'}\`} />}
                {liveMode ? 'LIVE' : 'Live Mode'}
              </button>`;
code = code.replace(oldBtnRegex, newBtn);

// CI COLOR INJECTIONS (The new Light Theme)
// By changing `bg-indigo-900` to the new Dark Purple `#351E8B`
code = code.replace(/bg-indigo-900/g, 'bg-[#351E8B]');
code = code.replace(/bg-indigo-800/g, 'bg-[#4A2EBA]');
code = code.replace(/bg-indigo-600/g, 'bg-[#81C7A9] text-[#161616]'); // primary buttons: Mint Green background with black text
code = code.replace(/text-indigo-600/g, 'text-[#351E8B]');
code = code.replace(/bg-indigo-50/g, 'bg-[#351E8B]/10');
code = code.replace(/border-indigo-600/g, 'border-[#351E8B]');

// Add import Loader2
if (!code.includes('import { Loader2')) {
  code = code.replace(/import {/, 'import { Loader2, ');
}

fs.writeFileSync('src/App.jsx', code);
console.log('App.jsx fixed and themed!');
