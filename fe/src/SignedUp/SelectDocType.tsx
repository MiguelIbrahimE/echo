// fe/src/SignedUp/SelectDocType.tsx
import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom';
// import "./CSS/SelectDocType.css"; // Create this CSS file for styling

interface DocTypeOption {
    id: string;
    name: string;
    description: string;
    endpoint: string; // Backend endpoint to call for this doc type
    outputFileName?: string; // Suggested output file name for display/saving
}

const docTypes: DocTypeOption[] = [
    {
        id: 'userManual',
        name: 'Developer Guide / User Manual',
        description: 'Generates a comprehensive guide based on code summaries (similar to README or Developer Guide).',
        endpoint: '/documents/generate-user-manual', // Matches your userManualGenerator
        outputFileName: 'USER_MANUAL.md'
    },

    {
        id: 'contributingGuide',
        name: 'Contributing Guide',
        description: 'Generates a CONTRIBUTING.md file based on project setup, test scripts, and common practices.',
        endpoint: '/documents/generate-contributing-guide',
        outputFileName: 'CONTRIBUTING.md'
    },
    {
        id: 'projectStructure',
        name: 'Project Structure Explanation',
        description: 'Provides a high-level explanation of your project\'s directory and file structure.',
        endpoint: '/documents/explain-project-structure',
        outputFileName: 'PROJECT_STRUCTURE.md'
    },
    // Add more types here as you create their backend generators
];

const SelectDocType: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const location = useLocation(); // To get state if passed

    const [repoFullName, setRepoFullName] = useState<string | null>(null);
    const [branchName, setBranchName] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedDocType, setSelectedDocType] = useState<DocTypeOption | null>(null);
    const [error, setError] = useState<string | null>(null);

    const appUserToken = localStorage.getItem("myAppToken");

    useEffect(() => {
        if (!appUserToken) {
            alert("You need to be logged in to select a documentation type.");
            navigate('/'); // Redirect to login or home
            return;
        }

        const repo = searchParams.get('repo');
        const branch = searchParams.get('branch');

        if (!repo || !branch) {
            console.error("SelectDocType: Missing repo or branch in query parameters.");
            setError("Repository details are missing. Please go back and select a repository.");
            // navigate('/link-github'); // Optionally redirect back
            return;
        }
        setRepoFullName(repo);
        setBranchName(branch);
    }, [searchParams, navigate, appUserToken]);

    const handleDocTypeSelect = async (docType: DocTypeOption) => {
        if (!repoFullName || !branchName || !appUserToken) {
            setError("Missing repository information or not logged in.");
            return;
        }
        setSelectedDocType(docType);
        setIsLoading(true);
        setError(null);

        console.log(`SelectDocType: Requesting '${docType.name}' for ${repoFullName} (branch: ${branchName})`);

        try {
            // The backend endpoint uses appUserToken to identify the user
            // and then uses their *stored* GitHub token to access the repo.
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}${docType.endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${appUserToken}`,
                },
                body: JSON.stringify({
                    repoFullName,
                    branchName,
                    // title: `${docType.name} for ${repoFullName.split('/')[1]}` // Backend can set default title
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ message: `Failed to initiate ${docType.name} generation.` }));
                throw new Error(errorData.message || `Server error: ${response.status}`);
            }

            const result = await response.json();
            // Assuming the backend responds with the newly created document's details,
            // especially an ID or enough info to navigate to the editor.
            // For now, let's assume it creates the document and we navigate based on repo/branch and type.
            // Or, if the backend /documents POST for creation returns the ID:
            // navigate(`/document-page/${result.documentId}`);

            console.log(`SelectDocType: Successfully initiated ${docType.name}. Navigating to editor.`);
            // You need to decide what parameters your document editor page expects.
            // It might just be the repo, branch, and a way to identify the document (e.g., title or a new doc ID).
            // If your userManualGenerator was already creating documents and navigating, model after that.
            // Let's assume for now it creates a document record and the editor page can find it.
            alert(`${docType.name} generation started! You will be redirected to the document page.`);

            // This navigation assumes your editor page can load a document based on repo, branch,
            // and potentially a title or a specific document ID if your backend /documents endpoint
            // creates a placeholder document record first.
            // The existing userManualGenerator's `handleRepoSelect` navigated to:
            // `/document-page?repo=${encodeURIComponent(repoFull)}&token=${token || ""}&branch=${defaultBranch}`
            // We should remove the `&token=` (GitHub token) from this URL if the editor page
            // also uses the backend-centric approach for any further GitHub API calls.
            navigate(
                `/document-page?repo=${encodeURIComponent(repoFullName)}&branch=${encodeURIComponent(branchName)}&docType=${docType.id}`
                // You might want to pass a specific document ID if your POST to docType.endpoint returns one.
                // For example: &docId=${result.id}
            );

        } catch (e: any) {
            console.error(`SelectDocType: Error generating ${docType.name}:`, e);
            setError(`Failed to generate ${docType.name}: ${e.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    if (!repoFullName || !branchName) {
        // Still loading or error occurred in useEffect
        return (
            <div className="select-doc-type-page"> {/* Add a class for styling */}
                <nav className="navbar">
                    <h1 className="brand" onClick={() => navigate("/")} style={{cursor: "pointer"}}>echo</h1>
                </nav>
                <div className="container" style={{padding: "20px"}}>
                    {error ? <p className="error-text">{error}</p> : <p>Loading repository details...</p>}
                    <button onClick={() => navigate('/link-github')}>Back to Repository Selection</button>
                </div>
            </div>
        );
    }


    return (
        <div className="select-doc-type-page"> {/* Add a class for styling */}
            <nav className="navbar">
                <h1 className="brand" onClick={() => navigate("/")} style={{cursor: "pointer"}}>echo</h1>
                {/* Add user menu if needed */}
            </nav>
            <div className="container" style={{padding: "20px", maxWidth: "800px", margin: "20px auto"}}>
                <h2>Select Documentation Type</h2>
                <p>Repository: <strong>{repoFullName}</strong> (Branch: <strong>{branchName}</strong>)</p>

                {isLoading && <p className="loading-text">Generating documentation, please wait... This might take a moment.</p>}
                {error && <p className="error-text" style={{color: 'red'}}>{error}</p>}

                {!isLoading && (
                    <div className="doc-type-options" style={{marginTop: "20px"}}>
                        {docTypes.map((docType) => (
                            <div key={docType.id} className="doc-type-option" style={{border: "1px solid #ccc", padding: "15px", marginBottom: "15px", borderRadius: "5px"}}>
                                <h3>{docType.name}</h3>
                                <p>{docType.description}</p>
                                <button
                                    onClick={() => handleDocTypeSelect(docType)}
                                    disabled={isLoading}
                                    style={{padding: "10px 15px", background: "#007bff", color: "white", border: "none", borderRadius: "4px", cursor: "pointer"}}
                                >
                                    Generate {docType.name}
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SelectDocType;