import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './CSS/Documents.css';

interface JwtPayload {
    username?: string;
    // add any other fields your JWT might have
}

function parseJwt(token: string): JwtPayload | null {
    try {
        const base64Payload = token.split('.')[1];
        const payload = atob(base64Payload);
        return JSON.parse(payload);
    } catch (e) {
        console.error('Failed to parse token', e);
        return null;
    }
}

// We'll assume your server returns an array of documents like:
// [ { id: 123, repoFullName: "MiguellbrahimE/echo" }, ... ]
interface DocumentData {
    id: number;
    repoFullName: string;
}

const MyDocuments: React.FC = () => {
    const navigate = useNavigate();
    const [loggedInUser, setLoggedInUser] = useState<string | null>(null);
    const [documents, setDocuments] = useState<DocumentData[]>([]);

    useEffect(() => {
        const token = localStorage.getItem('myAppToken');
        if (!token) {
            navigate('/login');
            return;
        }

        const decoded = parseJwt(token);
        if (!decoded || !decoded.username) {
            // token invalid or no username
            navigate('/login');
            return;
        }

        setLoggedInUser(decoded.username);

        // Next, fetch documents from the server
        fetchDocuments(token);
    }, [navigate]);

    const fetchDocuments = async (token: string) => {
        try {
            const res = await fetch('http://localhost:5001/api/documents', {
                method: 'GET',
                headers: {
                    Authorization: `Bearer ${token}`,
                },
            });
            if (!res.ok) {
                throw new Error('Failed to fetch docs');
            }
            const data: DocumentData[] = await res.json();
            setDocuments(data);
        } catch (err) {
            console.error('Error fetching documents:', err);
        }
    };

    const handleCreateNew = () => {
        alert('Create a new document here!');
    };

    // If we want to handle opening an existing doc, we could do:
    const openDocument = (docId: number) => {
        // e.g., navigate to /document-page?docId=docId
        navigate(`/document-page?docId=${docId}`);
    };

    if (!loggedInUser) return null; // Or a spinner/loading

    return (
        <div className="documents-page">
            <h2 className="documents-title">My Documents</h2>
            <div className="documents-grid">
                {documents.map((doc) => (
                    <div
                        key={doc.id}
                        className="document-card"
                        onClick={() => openDocument(doc.id)}
                    >
                        {doc.repoFullName}
                    </div>
                ))}
                <div className="document-card create-new" onClick={handleCreateNew}>
                    + Create More
                </div>
            </div>
        </div>
    );
};

export default MyDocuments;
