import React, { useState, useEffect } from 'react';
import { LogIn, AlertCircle, Mail, ArrowRight, CheckCircle2, Loader2, ArrowLeft, Send } from 'lucide-react';

/**
 * AuthGate - Dual Authentication: Google OAuth + Magic Link (Email)
 * 
 * Google users: Standard OAuth flow
 * Non-Google users: Magic Link via n8n (email-based, JWT token)
 * 
 * Magic Link flow:
 * 1. User enters email → POST /auth/request-magic-link
 * 2. n8n sends email with link containing JWT token
 * 3. User clicks link → ?magic=TOKEN in URL
 * 4. Frontend sends token to POST /auth/verify-magic
 * 5. n8n validates JWT → returns role + user info
 */

function AuthGate({ onAuthSuccess }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [clientId, setClientId] = useState('');

    // Magic Link state
    const [authMode, setAuthMode] = useState('choose'); // 'choose' | 'email' | 'sent' | 'verifying'
    const [emailInput, setEmailInput] = useState('');
    const [emailSending, setEmailSending] = useState(false);
    const [emailSent, setEmailSent] = useState(false);

    const n8nBaseUrl = (import.meta.env.VITE_CURATION_API_URL || '').replace(/\/$/, '').replace(/\/api$/, '');

    useEffect(() => {
        const envClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
        if (envClientId) {
            setClientId(envClientId);
            setLoading(false);
        } else {
            fetchServerConfig();
        }

        // 1. Check for Magic Link token in URL
        const urlParams = new URLSearchParams(window.location.search);
        const magicToken = urlParams.get('magic');
        if (magicToken) {
            setAuthMode('verifying');
            verifyMagicLink(magicToken);
            // Clean URL
            window.history.replaceState(null, '', window.location.pathname);
            return;
        }

        // 2. Check for OAuth callback in URL hash
        const hasHash = checkOAuthCallback();

        // 3. If no callback, check for existing session in localStorage
        if (!hasHash) {
            const savedSession = localStorage.getItem('kosmos_user_session');
            if (savedSession) {
                try {
                    const session = JSON.parse(savedSession);
                    // Check if Google token is expired (1h lifetime for implicit flow)
                    if (session.accessToken && session.expiresAt && Date.now() > session.expiresAt) {
                        console.log('[AuthGate] Google token expired, clearing session');
                        localStorage.removeItem('kosmos_user_session');
                        setLoading(false);
                        return; // Show login page
                    }
                    if (session.accessToken || session.magicToken) {
                        if (session.role && session.role !== 'GUEST') {
                            onAuthSuccess({
                                accessToken: session.accessToken || '',
                                magicToken: session.magicToken || '',
                                email: session.email,
                                name: session.name,
                                picture: session.picture,
                                role: session.role,
                                isNewUser: false,
                                authType: session.authType || 'google'
                            });
                        } else if (session.accessToken) {
                            validateAndGrantAccess(session.accessToken);
                        }
                    }
                } catch (e) {
                    localStorage.removeItem('kosmos_user_session');
                }
            }
        }
    }, []);

    const fetchServerConfig = async () => {
        try {
            const res = await fetch('/api/auth/config');
            const text = await res.text();
            if (!text) { setLoading(false); return; }
            try {
                const data = JSON.parse(text);
                if (data.google_client_id) { setClientId(data.google_client_id); }
                setLoading(false);
            } catch { setLoading(false); }
        } catch {
            if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) {
                setError('Missing VITE_GOOGLE_CLIENT_ID. Please check your .env file.');
            }
            setLoading(false);
        }
    };

    // --- GOOGLE OAUTH ---
    const checkOAuthCallback = () => {
        const hash = window.location.hash.substring(1);
        if (!hash) return false;
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const errorParam = params.get('error');
        if (errorParam) {
            setError(`OAuth Error: ${errorParam}`);
            window.history.replaceState(null, '', window.location.pathname);
            return true;
        }
        if (accessToken) {
            validateAndGrantAccess(accessToken);
            window.history.replaceState(null, '', window.location.pathname);
            return true;
        }
        return false;
    };

    const validateAndGrantAccess = async (accessToken) => {
        try {
            const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            if (!res.ok) throw new Error('Failed to fetch user info');
            const userInfo = await res.json();
            const userEmail = userInfo.email?.toLowerCase();

            let role = 'GUEST';
            try {
                if (n8nBaseUrl) {
                    const checkRes = await fetch(`${n8nBaseUrl}/auth/verify`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
                        body: JSON.stringify({ email: userEmail, token: accessToken })
                    });
                    if (checkRes.ok) {
                        const data = await checkRes.json();
                        role = data.userRole || 'GUEST';
                    }
                }
            } catch (apiErr) {
                console.error('[AuthGate] Backend check failed:', apiErr);
            }

            localStorage.setItem('kosmos_user_session', JSON.stringify({
                accessToken, email: userEmail, name: userInfo.name,
                picture: userInfo.picture, role, authType: 'google',
                timestamp: Date.now(),
                expiresAt: Date.now() + 3500 * 1000  // ~58 min (Google implicit token = 1h, with buffer)
            }));

            onAuthSuccess({
                accessToken, email: userEmail, name: userInfo.name,
                picture: userInfo.picture, role, isNewUser: false, authType: 'google'
            });
        } catch (err) {
            setError('Authentifizierung fehlgeschlagen. Bitte versuche es erneut.');
        }
    };

    const handleGoogleLogin = () => {
        if (!clientId) { setError('Client ID nicht verfügbar.'); return; }
        let redirectUri = window.location.origin;
        if (window.location.pathname && window.location.pathname !== '/') redirectUri += window.location.pathname;
        const params = new URLSearchParams({
            client_id: clientId, redirect_uri: redirectUri, response_type: 'token',
            scope: 'https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
            include_granted_scopes: 'true', prompt: 'select_account'
        });
        window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    };

    // --- MAGIC LINK ---
    const handleRequestMagicLink = async () => {
        if (!emailInput || !emailInput.includes('@')) {
            setError('Bitte gib eine gültige Email-Adresse ein.');
            return;
        }
        if (!n8nBaseUrl) {
            setError('API nicht konfiguriert. Bitte wende dich an das Admin-Team.');
            return;
        }

        setEmailSending(true);
        setError(null);

        try {
            const res = await fetch(`${n8nBaseUrl}/auth/request-magic-link`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: emailInput.toLowerCase().trim() })
            });

            const data = await res.json();

            if (data.ok) {
                setEmailSent(true);
                setAuthMode('sent');
            } else {
                setError(data.error || 'Magic Link konnte nicht gesendet werden.');
            }
        } catch (err) {
            setError('Verbindungsfehler. Bitte versuche es später erneut.');
        }
        setEmailSending(false);
    };

    const verifyMagicLink = async (token) => {
        try {
            const res = await fetch(`${n8nBaseUrl}/auth/verify-magic`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token })
            });

            if (!res.ok) throw new Error(`Server error: ${res.status}`);
            const data = await res.json();

            if (data.ok) {
                localStorage.setItem('kosmos_user_session', JSON.stringify({
                    magicToken: token, email: data.email, name: data.name || '',
                    role: data.role || 'TEILNEHMENDE', authType: 'magic',
                    timestamp: Date.now()
                }));

                onAuthSuccess({
                    accessToken: '', magicToken: token,
                    email: data.email, name: data.name || '',
                    role: data.role || 'TEILNEHMENDE',
                    isNewUser: data.isNewUser || false,
                    authType: 'magic'
                });
            } else {
                setError(data.error || 'Der Magic Link ist ungültig oder abgelaufen.');
                setAuthMode('choose');
            }
        } catch (err) {
            setError('Der Magic Link konnte nicht verifiziert werden. Bitte fordere einen neuen an.');
            setAuthMode('choose');
        }
    };

    // --- RENDER ---
    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
                    <p className="text-slate-600">Initialisiere...</p>
                </div>
            </div>
        );
    }

    if (authMode === 'verifying') {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
                    <Loader2 className="w-12 h-12 text-indigo-600 animate-spin mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-slate-800 mb-2">Magic Link wird überprüft...</h2>
                    <p className="text-sm text-slate-500">Einen Moment bitte.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-slate-800 mb-2">Kosmos Planner</h1>
                    <p className="text-slate-500 text-sm">Festival Program Management</p>
                </div>

                {/* Error Display */}
                {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-red-800">
                            <p>{error}</p>
                        </div>
                        <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">×</button>
                    </div>
                )}

                {/* AUTH MODE: CHOOSE */}
                {authMode === 'choose' && (
                    <div className="space-y-4">
                        {/* Google Login */}
                        {clientId && (
                            <button onClick={handleGoogleLogin}
                                className="w-full bg-white hover:bg-slate-50 border-2 border-slate-200 text-slate-700 font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-all hover:border-slate-300 hover:shadow-sm">
                                <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" /><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" /><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A10.96 10.96 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" /><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" /></svg>
                                Mit Google anmelden
                            </button>
                        )}

                        {/* Divider */}
                        <div className="flex items-center gap-3">
                            <div className="flex-1 h-px bg-slate-200" />
                            <span className="text-xs text-slate-400 font-medium">ODER</span>
                            <div className="flex-1 h-px bg-slate-200" />
                        </div>

                        {/* Email Magic Link */}
                        <button onClick={() => { setAuthMode('email'); setError(null); }}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-colors shadow-md hover:shadow-lg">
                            <Mail className="w-5 h-5" />
                            Mit Email-Link anmelden
                        </button>

                        <p className="text-xs text-slate-400 text-center mt-2">
                            Kein Google-Konto nötig — du bekommst einen Einmal-Link per Email.
                        </p>
                    </div>
                )}

                {/* AUTH MODE: EMAIL INPUT */}
                {authMode === 'email' && (
                    <div className="space-y-5">
                        <button onClick={() => { setAuthMode('choose'); setError(null); }}
                            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 transition-colors">
                            <ArrowLeft className="w-3 h-3" /> Zurück
                        </button>

                        {/* Step indicator */}
                        <div className="flex items-center gap-2 mb-2">
                            <div className="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-bold">1</div>
                            <span className="text-sm font-bold text-slate-700">Email-Adresse eingeben</span>
                        </div>

                        <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 text-sm text-indigo-700">
                            <p className="font-medium mb-1">So funktioniert's:</p>
                            <ol className="list-decimal list-inside space-y-1 text-xs text-indigo-600">
                                <li>Gib deine Email-Adresse ein</li>
                                <li>Du bekommst einen Einmal-Link per Email</li>
                                <li>Klicke auf den Link — fertig!</li>
                            </ol>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-slate-500 mb-1.5">Deine Email-Adresse</label>
                            <input type="email" value={emailInput} onChange={e => setEmailInput(e.target.value)}
                                placeholder="name@beispiel.de"
                                onKeyDown={e => e.key === 'Enter' && handleRequestMagicLink()}
                                autoFocus
                                className="w-full px-4 py-3 border border-slate-300 rounded-lg text-sm text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500" />
                        </div>

                        <button onClick={handleRequestMagicLink} disabled={emailSending || !emailInput}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors">
                            {emailSending ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Wird gesendet...</>
                            ) : (
                                <><Send className="w-4 h-4" /> Magic Link anfordern</>
                            )}
                        </button>
                    </div>
                )}

                {/* AUTH MODE: SENT */}
                {authMode === 'sent' && (
                    <div className="space-y-5 text-center">
                        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                            <CheckCircle2 className="w-8 h-8 text-green-600" />
                        </div>

                        <div>
                            <h2 className="text-xl font-bold text-slate-800 mb-2">Email verschickt!</h2>
                            <p className="text-sm text-slate-500 mb-1">
                                Wir haben einen Magic Link an
                            </p>
                            <p className="font-bold text-indigo-600 text-base">{emailInput}</p>
                            <p className="text-sm text-slate-500 mt-1">gesendet.</p>
                        </div>

                        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-left">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center text-xs font-bold">2</div>
                                <span className="text-sm font-bold text-slate-700">Nächster Schritt</span>
                            </div>
                            <ol className="list-decimal list-inside space-y-1.5 text-xs text-slate-600">
                                <li>Öffne dein Email-Postfach</li>
                                <li>Suche nach einer Email von <strong>Kosmos Planner</strong></li>
                                <li>Klicke auf den Link in der Email</li>
                                <li>Du wirst automatisch eingeloggt</li>
                            </ol>
                            <p className="text-[10px] text-slate-400 mt-3">
                                Der Link ist <strong>7 Tage</strong> gültig. Prüfe auch deinen Spam-Ordner.
                            </p>
                        </div>

                        <div className="flex flex-col gap-2">
                            <button onClick={() => { setAuthMode('email'); setEmailSent(false); setError(null); }}
                                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium underline">
                                Erneut senden oder andere Email verwenden
                            </button>
                            <button onClick={() => { setAuthMode('choose'); setEmailSent(false); setError(null); }}
                                className="text-xs text-slate-400 hover:text-slate-600">
                                ← Zurück zur Anmeldung
                            </button>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div className="mt-6 text-center text-xs text-slate-400">
                    <p>Kosmos Festival · Programm-Planung</p>
                </div>
            </div>
        </div>
    );
}

export default AuthGate;
