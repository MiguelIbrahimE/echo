/* ==============================================
   Settings.tsx   –  user profile / API key page
============================================== */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../global-css/navbar-signedin.css';
import './CSS/settings.css';

const Settings: React.FC = () => {
    const nav              = useNavigate();
    const [maskedKey, setMaskedKey] = useState<string | null>(null);
    const [editing, setEditing]     = useState(false);
    const [newKey, setNewKey]       = useState('');

    /* fetch current mask */
    useEffect(() => {
        (async () => {
            const jwt = localStorage.getItem('myAppToken');
            if (!jwt) return;
            const res = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/user/api-key`,
                { headers: { Authorization: `Bearer ${jwt}` } }
            );
            if (res.ok) {
                const { apiKey } = await res.json();
                setMaskedKey(apiKey);           // may be null
            }
        })();
    }, []);

    /* save key */
    const saveKey = async () => {
        const jwt = localStorage.getItem('myAppToken') || '';
        if (!newKey || newKey.length < 20) {
            return alert('Please enter a valid key');
        }
        const res = await fetch(
            `${import.meta.env.VITE_API_BASE_URL}/user/api-key`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${jwt}`,
                },
                body: JSON.stringify({ apiKey: newKey }),
            }
        );
        if (res.ok) {
            setMaskedKey(`${newKey.slice(0, 6)}…`);
            setNewKey('');
            setEditing(false);
            alert('API key saved!');
        } else {
            const { message } = await res.json();
            alert(`Error: ${message}`);
        }
    };

    return (
        <>
            <nav className="navbar-signedin">
                <a href="/" className="brand">echo</a>
                <div className="nav-right" onClick={() => nav('/dashboard')}>
                    ← back
                </div>
            </nav>

            <main className="settings-container">
                <h2 className="settings-title">Account Settings</h2>

                <div className="setting-row">
                    <span className="setting-label">ChatGPT API Key:</span>

                    {!editing ? (
                        <>
              <span className="setting-value">
                {maskedKey ?? <em>— using shared key —</em>}
              </span>
                            <button className="edit-btn" onClick={() => setEditing(true)}>
                                {maskedKey ? 'Edit' : 'Add'}
                            </button>
                        </>
                    ) : (
                        <>
                            <input
                                className="key-input"
                                type="text"
                                placeholder="sk-..."
                                value={newKey}
                                onChange={(e) => setNewKey(e.target.value)}
                            />
                            <button className="save-btn" onClick={saveKey}>Save</button>
                            <button className="cancel-btn" onClick={() => {
                                setEditing(false); setNewKey('');
                            }}>
                                Cancel
                            </button>
                        </>
                    )}
                </div>
            </main>
        </>
    );
};

export default Settings;
