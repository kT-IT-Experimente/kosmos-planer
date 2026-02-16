import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import AuthGate from './AuthGate.jsx';
import './index.css';

function Root() {
  const [authUser, setAuthUser] = useState(null);

  if (!authUser) {
    return <AuthGate onAuthSuccess={setAuthUser} />;
  }

  return <App authenticatedUser={authUser} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
