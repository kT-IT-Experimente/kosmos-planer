import React, { useState, useEffect } from 'react';
import { LogIn, AlertCircle } from 'lucide-react';

/**
 * AuthGate - Identity-Based Authentication Component
 * 
 * Serves as the authentication gatekeeper before the main app loads.
 * Uses Google OAuth for authentication and validates user email against authorized list.
 */

// The AUTHORIZED_EMAILS static list has been removed.
// Authorization is now fetched dynamically from the Google Sheet via the GAS API.

function AuthGate({ onAuthSuccess }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [clientId, setClientId] = useState('');

    useEffect(() => {
        // Initialize: Try to load Client ID from env vars
        const envClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

        if (import.meta.env.DEV) {
            console.log('[AuthGate] Initializing...', {
                hasEnvClientId: !!envClientId,
                clientIdLength: envClientId?.length || 0
            });
        }

        if (envClientId) {
            setClientId(envClientId);
            setLoading(false);
        } else {
            // Fallback: Try to fetch from server
            fetchServerConfig();
        }

        // 1. Check for OAuth callback in URL hash
        const hasHash = checkOAuthCallback();

        // 2. If no callback, check for existing session in localStorage
        if (!hasHash) {
            const savedSession = localStorage.getItem('kosmos_user_session');
            if (savedSession) {
                try {
                    const session = JSON.parse(savedSession);
                    if (session.accessToken) {
                        if (import.meta.env.DEV) console.log('[AuthGate] Found saved session, validating...', { role: session.role });
                        // If we have a saved role, try to fast-path
                        if (session.role && session.role !== 'GUEST') {
                            onAuthSuccess({
                                accessToken: session.accessToken,
                                email: session.email,
                                name: session.name,
                                picture: session.picture,
                                role: session.role
                            });
                        } else {
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

            if (!text) {
                if (import.meta.env.DEV) console.warn('[AuthGate] Empty server config response');
                setLoading(false);
                return;
            }

            try {
                const data = JSON.parse(text);
                if (data.google_client_id) {
                    setClientId(data.google_client_id);
                    setLoading(false);
                } else {
                    setError('Configuration not found on server. Please set VITE_GOOGLE_CLIENT_ID in .env');
                    setLoading(false);
                }
            } catch (jsonErr) {
                if (import.meta.env.DEV) console.warn('[AuthGate] Invalid JSON in server config:', text);
                setError('Invalid server configuration response. Check your .env file.');
                setLoading(false);
            }
        } catch (err) {
            if (import.meta.env.DEV) {
                console.warn('[AuthGate] Server config fetch failed (this is expected locally)', err);
            }
            // If we're local and have no Client ID, it's a common setup issue
            if (!import.meta.env.VITE_GOOGLE_CLIENT_ID) {
                setError('Missing VITE_GOOGLE_CLIENT_ID. Please check your .env file.');
            }
            setLoading(false);
        }
    };

    const checkOAuthCallback = () => {
        const hash = window.location.hash.substring(1);
        if (!hash) return false;

        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        const error = params.get('error');

        if (error) {
            setError(`OAuth Error: ${error}`);
            window.history.replaceState(null, '', window.location.pathname);
            return true;
        }

        if (accessToken) {
            // Get user info to validate email
            validateAndGrantAccess(accessToken);
            window.history.replaceState(null, '', window.location.pathname);
            return true;
        }
        return false;
    };

    const validateAndGrantAccess = async (accessToken) => {
        try {
            // Fetch user's Google profile to get email
            const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            if (!res.ok) throw new Error('Failed to fetch user info');

            const userInfo = await res.json();
            const userEmail = userInfo.email?.toLowerCase();

            if (import.meta.env.DEV) {
                console.log('[AuthGate] User authenticated via Google:', {
                    email: userEmail
                });
            }

            // --- DYNAMIC AUTHORIZATION CHECK ---
            let isAuthorized = false;
            let role = 'GUEST';

            try {
                const baseUrl = localStorage.getItem('kosmos_curation_api_url') || import.meta.env.VITE_CURATION_API_URL;
                if (baseUrl) {
                    const cleanBaseUrl = baseUrl.replace(/\/$/, '').replace(/\/api$/, ''); // Ensure clean base
                    const checkRes = await fetch(`${cleanBaseUrl}/auth/verify`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${accessToken}`
                        },
                        body: JSON.stringify({
                            email: userEmail,
                            token: accessToken
                        })
                    });

                    if (checkRes.ok) {
                        const data = await checkRes.json();
                        // If the backend returned a role other than GUEST, they are authorized
                        if (data.userRole && data.userRole !== 'GUEST') {
                            isAuthorized = true;
                            role = data.userRole;
                        }
                    } else {
                        console.warn('[AuthGate] /auth/verify returned non-OK status:', checkRes.status);
                    }
                } else {
                    // If no API URL is set, we must allow them through so they can set it in settings
                    console.warn('[AuthGate] No n8n API Base URL set. Allowing login to access settings.');
                    isAuthorized = true;
                }
            } catch (apiErr) {
                console.error('[AuthGate] Failed to check authorization against backend:', apiErr);
                // Fall fail-open if the API is unreachable so they can fix configs
                isAuthorized = true;
            }

            if (isAuthorized) {
                // Save session for persistence (including role!)
                localStorage.setItem('kosmos_user_session', JSON.stringify({
                    accessToken,
                    email: userEmail,
                    name: userInfo.name,
                    picture: userInfo.picture,
                    role: role,
                    timestamp: Date.now()
                }));

                // Grant access - pass user info to main app
                onAuthSuccess({
                    accessToken,
                    email: userEmail,
                    name: userInfo.name,
                    picture: userInfo.picture,
                    role: role
                });
            } else {
                setError(`Access denied. The email "${userEmail}" is not authorized for this application.`);
            }
        } catch (err) {
            setError('Failed to validate user. Please try again.');
            console.error('[AuthGate] Validation error:', err);
        }
    };

    const handleLogin = () => {
        if (!clientId) {
            setError('Client ID not available. Cannot proceed with login.');
            return;
        }

        // Ensure redirect_uri exactly matches what's in Google Console
        // We use window.location.origin + window.location.pathname
        // But we must ensure it ends with a slash if testing on root domain
        let redirectUri = window.location.origin + window.location.pathname;
        if (!redirectUri.endsWith('/')) redirectUri += '/';

        const params = new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: 'token',
            scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
            include_granted_scopes: 'true',
            prompt: 'select_account'
        });

        window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
                <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                    <p className="text-slate-600">Initializing authentication...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
                {/* Logo/Header */}
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-slate-800 mb-2">Kosmos Planner</h1>
                    <p className="text-slate-600">Festival Program Management</p>
                </div>

                {/* Error Display */}
                {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-red-800">
                            <p className="font-medium mb-1">Authentication Error</p>
                            <p>{error}</p>
                        </div>
                    </div>
                )}

                {/* Login Button */}
                {clientId && (
                    <button
                        onClick={handleLogin}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-3 px-4 rounded-lg flex items-center justify-center gap-3 transition-colors shadow-md hover:shadow-lg"
                    >
                        <LogIn className="w-5 h-5" />
                        Sign in with Google
                    </button>
                )}

                {/* Developer Info */}
                {import.meta.env.DEV && (
                    <div className="mt-6 p-3 bg-slate-50 rounded border border-slate-200 text-xs">
                        <p className="font-mono text-slate-600">
                            <strong>Dev Mode:</strong> Client ID {clientId ? '✓ Loaded' : '✗ Missing'}
                        </p>
                        {!clientId && (
                            <p className="mt-2 text-slate-500">
                                Add <code className="bg-slate-200 px-1 rounded">VITE_GOOGLE_CLIENT_ID</code> to your .env file
                            </p>
                        )}
                    </div>
                )}

                {/* Footer */}
                <div className="mt-6 text-center text-xs text-slate-500">
                    <p>Authorized users only</p>
                </div>
            </div>
        </div>
    );
}

export default AuthGate;
