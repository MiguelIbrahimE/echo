/* =========================================================
   MyDocuments.tsx        (dashboard of saved manuals)
   Shows each document as a card with “Continue editing”
========================================================= */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaUserCircle } from 'react-icons/fa';
import './CSS/mydocuments.css';            // card styles
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

    /* fetch docs on mount */
    useEffect(() => {
        (async () => {
            const jwt = localStorage.getItem('myAppToken');
            if (!jwt) return;
            try {
                const res = await fetch(
                    `${import.meta.env.VITE_API_BASE_URL}/documents`,
                    { headers: { Authorization: `Bearer ${jwt}` } }
                );
                if (res.ok) setDocs(await res.json());
            } catch (e) {
                console.error('Error loading documents', e);
            }
        })();
    }, []);

    /* open editor */
    const openDoc = (d: Doc) => {
        const ghToken = localStorage.getItem('ghToken') || '';
        if (!d.repo_full_name) {
            return alert('Document has no linked repository.');
        }
        nav(
            `/document-page?repo=${encodeURIComponent(d.repo_full_name)}&token=${ghToken}&branch=${d.branch_name || 'main'}`
        );
    };

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

                {docs.length === 0 ? (
                    <p className="empty-text">No documents yet – create one from the editor.</p>
                ) : (
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
                )}
            </main>
        </>
    );
};

export default MyDocuments;
