/* ==============================================
   Settings.tsx   –  user profile / API key page
============================================== */
import React, { useEffect, useState } from 'react';
// import { useNavigate } from 'react-router-dom'; // Original import
import '../global-css/navbar-signedin.css'; // Assuming this file exists or styles are globally available
import './CSS/settings.css';

// Mock useNavigate if not in a router context for standalone preview
const useNavigate = () => {
    return (path: string) => console.log(`Navigating to: ${path}`);
};

const Settings: React.FC = () => {
    const nav = useNavigate();
    const [maskedKey, setMaskedKey] = useState<string | null>(null);
    const [editing, setEditing] = useState(false);
    const [newKey, setNewKey] = useState('');

    /* fetch current mask */
    useEffect(() => {
        const mockFetch = async () => {
            console.log('Fetching API key...');
            await new Promise(resolve => setTimeout(resolve, 500));
            if (Math.random() > 0.5) {
                setMaskedKey('sk-123456…');
            } else {
                setMaskedKey(null);
            }
        };

        if (typeof import.meta === 'undefined' || !import.meta.env || !import.meta.env.VITE_API_BASE_URL) {
            mockFetch();
        } else {
            // ... your existing API call logic ...
            (async () => {
                const jwt = localStorage.getItem('myAppToken');
                if (!jwt) {
                    console.warn('No JWT token found.');
                    setMaskedKey(null);
                    return;
                }
                try {
                    const res = await fetch(
                        `${import.meta.env.VITE_API_BASE_URL}/user/api-key`,
                        { headers: { Authorization: `Bearer ${jwt}` } }
                    );
                    if (res.ok) {
                        const { apiKey } = await res.json();
                        setMaskedKey(apiKey);
                    } else {
                        console.error('Failed to fetch API key:', res.status);
                        setMaskedKey(null);
                    }
                } catch (error) {
                    console.error('Error fetching API key:', error);
                    setMaskedKey(null);
                }
            })();
        }
    }, []);

    /* save key */
    const saveKey = async () => {
        const showAlert = (message: string) => console.log('Alert (mock):', message);

        const jwt = localStorage.getItem('myAppToken') || '';
        if (!newKey || newKey.length < 20) {
            showAlert('Please enter a valid key (at least 20 characters).');
            return;
        }

        if (typeof import.meta === 'undefined' || !import.meta.env || !import.meta.env.VITE_API_BASE_URL) {
            console.log('Saving API key (mock):', newKey);
            await new Promise(resolve => setTimeout(resolve, 500));
            setMaskedKey(`${newKey.slice(0, 6)}…`);
            setNewKey('');
            setEditing(false);
            showAlert('API key saved! (mock)');
            return;
        }
        // ... your existing API save logic ...
        try {
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
                showAlert('API key saved!');
            } else {
                const { message } = await res.json().catch(() => ({ message: 'Failed to save key.' }));
                showAlert(`Error: ${message}`);
            }
        } catch (error) {
            console.error('Error saving API key:', error);
            showAlert('Error: Could not connect to API to save key.');
        }
    };

    const [alertMessage, setAlertMessage] = useState<string | null>(null);
    // showAlertModal can be used if you implement a modal
    // const showAlertModal = (message: string) => setAlertMessage(message);


    return (
        <div className="settings-page-wrapper">
            {alertMessage && (
                <div style={{ position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)', backgroundColor: 'lightcoral', padding: '10px', borderRadius: '5px', zIndex: 1000 }}>
                    {alertMessage}
                </div>
            )}
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
                            <div className="setting-actions"> {/* Added wrapper */}
                                <button className="edit-btn" onClick={() => setEditing(true)}>
                                    {maskedKey ? 'Edit' : 'Add'}
                                </button>
                            </div>
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
                            <div className="setting-actions"> {/* Added wrapper */}
                                <button className="save-btn" onClick={saveKey}>Save</button>
                                <button className="cancel-btn" onClick={() => {
                                    setEditing(false); setNewKey('');
                                }}>
                                    Cancel
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
};

export default Settings;