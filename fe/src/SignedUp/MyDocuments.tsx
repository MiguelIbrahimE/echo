import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUserCircle } from 'react-icons/fa';
import './CSS/MyDocuments.css';            // card styles
import '../global-css/navbar-signedin.css'; // signed-in navbar

interface Doc {
    id: number;
    title: string;
    repo_full_name: string | null;
    branch_name: string | null;
    updated_at: string;
}

const MyDocuments: React.FC = () => {
    const nav = useNavigate();
    const [docs, setDocs] = useState<Doc[]>([]);
    // Add a loading state
    const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    /* fetch docs on mount */
    useEffect(() => {
        (async () => {
            setLoadingState('loading');
            setErrorMessage(null);
            const jwt = localStorage.getItem('myAppToken');
            console.log("MyDocuments: Attempting to fetch with token:", jwt); // Debug: Log token

            if (!jwt) {
                console.warn("MyDocuments: No JWT found. User might need to log in.");
                setLoadingState('error');
                setErrorMessage("You are not logged in. Please log in to see your documents.");
                // Optional: Redirect to login if no token
                // nav('/login');
                return;
            }

            try {
                const res = await fetch(
                    `${import.meta.env.VITE_API_BASE_URL}/documents`,
                    { headers: { Authorization: `Bearer ${jwt}` } }
                );

                console.log("MyDocuments: API response status:", res.status); // Debug: Log status

                if (res.ok) {
                    const data = await res.json();
                    console.log("MyDocuments: Fetched documents:", data); // Debug: Log data
                    setDocs(data);
                    setLoadingState('success');
                } else {
                    // Handle specific HTTP errors
                    const errorText = await res.text(); // Read error response
                    console.error(`MyDocuments: API error ${res.status}: ${errorText}`);
                    setErrorMessage(`Failed to load documents (Error ${res.status}). Please try logging in again.`);
                    if (res.status === 401 || res.status === 403) {
                        // Token is invalid or expired
                        setErrorMessage("Your session has expired or is invalid. Please log in again.");
                        // Optionally clear the bad token and redirect
                        localStorage.removeItem('myAppToken');
                        // localStorage.removeItem('ghToken'); // If GitHub token is also session-dependent
                        // nav('/login'); // Redirect to login
                    }
                    setDocs([]); // Clear any stale docs
                    setLoadingState('error');
                }
            } catch (e) {
                console.error('MyDocuments: Error loading documents (catch block)', e);
                setErrorMessage("An unexpected error occurred while loading documents.");
                setDocs([]);
                setLoadingState('error');
            }
        })();
    }, []); // Effect runs only on mount

    /* open editor */
    const openDoc = (d: Doc) => {
        const ghToken = localStorage.getItem('ghToken') || '';
        if (!d.repo_full_name) {
            // This was an alert, let's make it a more user-friendly message if needed, or handle appropriately
            console.warn('Document has no linked repository:', d.title);
            alert('This document does not have a linked GitHub repository.');
            return;
        }
        nav(
            `/document-page?repo=${encodeURIComponent(d.repo_full_name)}&token=${ghToken}&branch=${d.branch_name || 'main'}`
        );
    };

    // Render logic based on loadingState
    let content;
    if (loadingState === 'loading') {
        content = <p className="status-text">Loading your manuals...</p>;
    } else if (loadingState === 'error') {
        content = <p className="status-text error-text">{errorMessage || "Could not load documents."}</p>;
    } else if (docs.length === 0) {
        content = <p className="empty-text">No documents yet – create one from the editor.</p>;
    } else {
        content = (
            <div className="card-grid">
                {docs.map((d) => (
                    <div key={d.id} className="doc-card">
                        <h3 className="doc-title">{d.title}</h3>
                        {d.repo_full_name && (
                            <p className="repo-name">{d.repo_full_name}</p>
                        )}
                        <p className="updated-at">
                            Last edited: {new Date(d.updated_at).toLocaleString()}
                        </p>
                        <button
                            className="continue-btn"
                            onClick={() => openDoc(d)}
                        >
                            Continue Editing
                        </button>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <>
            {/* Signed-in navbar (avatar only) */}
            <nav className="navbar-signedin">
                <a href="/" className="brand">echo</a>
                <div className="nav-right">
                    <FaUserCircle size={26} onClick={() => nav('/settings')} style={{cursor:'pointer'}} />
                </div>
            </nav>

            <main className="dashboard-container">
                <h2 className="dash-title">My Manuals</h2>
                {content}
            </main>
        </>
    );
};

export default MyDocuments;