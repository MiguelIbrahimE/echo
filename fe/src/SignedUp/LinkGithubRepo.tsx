/* ==========================================
   LinkGithubRepo.tsx              ✨ (Modified for Doc Type Selection)
   • Lets the user choose a repo
   • Saves that repo for the user  (POST /repositories) - Optional here
   • Navigates to SelectDocType page
========================================== */
import React, { useState, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import "./CSS/repolinking.css";
// Assuming a shared Navbar component might be better placed in a layout component
// import "../global-css/navbar.css";

interface Repo {
    id: number;
    full_name: string;
    default_branch: string;
}

const LinkGithubRepo: React.FC = () => {
    // This 'token' state is intended for the GitHub Access Token (ghToken)
    // It's used for initially fetching the list of repos directly from GitHub.
    const [githubAccessToken, setGithubAccessToken] = useState<string | null>(null);
    const [repos, setRepos] = useState<Repo[]>([]);
    const [selectedRepoFullName, setSelectedRepoFullName] = useState<string | null>(null); // For UI feedback
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const location = useLocation();
    const navigate = useNavigate();
    const appUserToken = localStorage.getItem("myAppToken"); // Echo app's JWT

    // Effect to get the GitHub access token if provided in URL (e.g., from a simpler OAuth flow)
    // or from localStorage if previously set.
    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const tokenFromUrl = queryParams.get("token"); // Expects GitHub token if backend sends it directly

        if (tokenFromUrl) {
            console.log("LinkGithubRepo: GitHub token found in URL.");
            setGithubAccessToken(tokenFromUrl);
            localStorage.setItem("ghToken", tokenFromUrl); // Persist for this session if needed
            fetchRepositoriesFromGitHub(tokenFromUrl);
            // Clean the token from URL? Optional, for tidiness.
            // navigate(location.pathname, { replace: true });
        } else {
            const tokenFromStorage = localStorage.getItem("ghToken");
            if (tokenFromStorage) {
                console.log("LinkGithubRepo: GitHub token found in localStorage.");
                setGithubAccessToken(tokenFromStorage);
                fetchRepositoriesFromGitHub(tokenFromStorage);
            } else if (appUserToken) {
                // If logged into Echo & no ghToken, fetch repos via backend (preferred)
                console.log("LinkGithubRepo: Echo user logged in, attempting to fetch repos via backend.");
                fetchReposViaBackend();
            } else {
                // No appUserToken means user isn't logged into Echo.
                // No ghToken means GitHub isn't linked directly yet for this page view.
                console.log("LinkGithubRepo: No Echo session or GitHub token found.");
                setIsLoading(false); // Stop loading if no token to fetch with
            }
        }
    }, [location.search, appUserToken]); // Rerun if appUserToken changes (e.g., after login)

    const fetchRepositoriesFromGitHub = useCallback(async (ghToken: string) => {
        setIsLoading(true);
        setError(null);
        console.log("LinkGithubRepo: Fetching repos directly from GitHub API.");
        try {
            const res = await fetch(
                "https://api.github.com/user/repos?sort=updated&per_page=100",
                { headers: { Authorization: `Bearer ${ghToken}` } }
            );
            if (!res.ok) {
                if (res.status === 401) throw new Error("GitHub token is invalid or expired. Please re-link.");
                throw new Error(`GitHub API error: ${res.statusText}`);
            }
            const repoData: Repo[] = await res.json();
            setRepos(repoData);
        } catch (e: any) {
            console.error("LinkGithubRepo: Error fetching repositories from GitHub:", e);
            setError(e.message || "Could not load repositories from GitHub.");
            setRepos([]); // Clear repos on error
            if (e.message.includes("invalid or expired")) localStorage.removeItem("ghToken");
        } finally {
            setIsLoading(false);
        }
    }, []);

    const fetchReposViaBackend = useCallback(async () => {
        if (!appUserToken) return; // Should be logged into Echo
        setIsLoading(true);
        setError(null);
        console.log("LinkGithubRepo: Fetching repos via backend.");
        try {
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/github/repos`, {
                headers: { Authorization: `Bearer ${appUserToken}` },
            });
            if (!res.ok) {
                if (res.status === 401) { // App token issue
                    alert("Your session has expired. Please log in again.");
                    localStorage.removeItem("myAppToken");
                    window.dispatchEvent(new Event("storage"));
                    navigate("/"); // Redirect to login or home
                    return;
                }
                if (res.status === 403) { // GitHub not linked for this user on backend
                    setError("GitHub account not linked to your Echo account. Please link it first.");
                    setRepos([]);
                    setIsLoading(false);
                    // UI should ideally show a link button here.
                    return;
                }
                throw new Error(`Failed to fetch repositories via backend: ${res.statusText}`);
            }
            const repoData: Repo[] = await res.json();
            setRepos(repoData);
        } catch (e: any) {
            console.error("LinkGithubRepo: Error fetching repositories via backend:", e);
            setError(e.message || "Could not load repositories via backend.");
        } finally {
            setIsLoading(false);
        }
    }, [appUserToken, navigate]);


    const handleRepoSelect = async (repoFullName: string, defaultBranch = "main") => {
        setSelectedRepoFullName(repoFullName); // For UI feedback

        if (!appUserToken) {
            alert("You must be logged in to Echo to select a repository.");
            // Optionally, initiate login flow or redirect to login page
            // For now, we assume this page is protected and appUserToken should exist.
            return;
        }

        // Optional: Save the repository choice to your backend.
        // This step ensures the user's chosen repo is associated with their Echo account,
        // even before a specific document is generated.
        // Your backend /repositories endpoint should use the appUserToken to identify the user
        // and then store the repoFullName. It might also need/use the ghToken if it
        // needs to verify access to that repo or store the ghToken with the repo link.
        // However, the ghToken should ideally already be stored with the user during OAuth.
        try {
            console.log("LinkGithubRepo: Saving repository choice to backend.");
            const saveRepoResponse = await fetch(`${import.meta.env.VITE_API_BASE_URL}/repositories`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${appUserToken}`, // Authenticate with Echo
                },
                body: JSON.stringify({
                    repoFullName: repoFullName,
                    // githubToken: githubAccessToken, // Send if your backend /repositories endpoint specifically needs it here
                    // and isn't using the one stored with the user.
                    // Best practice: backend uses its stored token.
                }),
            });
            if (!saveRepoResponse.ok) {
                console.warn("LinkGithubRepo: Saving repository choice failed. Status:", saveRepoResponse.status);
                // Decide if this is a critical failure. For now, we'll proceed.
                alert("Could not save repository choice to your account, but you can still proceed to select a document type.");
            } else {
                console.log("LinkGithubRepo: Repository choice saved.");
            }
        } catch (e) {
            console.warn("LinkGithubRepo: Network error saving repository choice (continuing):", e);
        }

        // Navigate to the new page for selecting documentation type
        console.log(`LinkGithubRepo: Navigating to select doc type for ${repoFullName}, branch ${defaultBranch}`);
        navigate(
            `/select-doc-type?repo=${encodeURIComponent(repoFullName)}&branch=${encodeURIComponent(defaultBranch)}`
        );
    };

    // This button is for initiating the GitHub OAuth flow if no ghToken is available
    // and the user wants to link their GitHub account (or re-link).
    // This should ideally be handled by the main App.tsx login/signup flow
    // or a dedicated "Link Account" button if the user is already logged into Echo.
    const handleInitiateGithubLink = () => {
        // Redirects to your backend's /auth/github endpoint
        // The backend then redirects to GitHub.
        // After GitHub auth, backend's /auth/github/callback handles token exchange,
        // user creation/linking in Echo, issues appToken, and redirects to
        // FRONTEND_OAUTH_CALLBACK_URL (e.g., /auth/oauth-callback on frontend).
        // That frontend callback page then sets myAppToken and navigates here.
        console.log("LinkGithubRepo: Initiating GitHub OAuth link process.");
        window.location.href = `${import.meta.env.VITE_API_BASE_URL}/auth/github`;
    };

    if (!appUserToken && !isLoading) { // If not logged into Echo, don't show content
        return (
            <div className="bg-light link-github-page">
                <nav className="navbar">
                    <h1 className="brand" onClick={() => navigate("/")} style={{cursor: "pointer"}}>echo</h1>
                </nav>
                <div className="main-container">
                    <div className="github-card">
                        <p>Please log in to Echo to link and select repositories.</p>
                        <button className="github-signin-btn" onClick={() => navigate('/')}>Go to Homepage</button>
                    </div>
                </div>
            </div>
        );
    }


    return (
        <div className="bg-light link-github-page">
            <nav className="navbar">
                <h1 className="brand" onClick={() => navigate("/")} style={{cursor: "pointer"}}>echo</h1>
                {/* You might want a user profile/logout button here if appUserToken exists */}
            </nav>

            <div className="main-container">
                <div className="github-card">
                    <h2>Link Your GitHub Repository</h2>
                    {isLoading && <p className="loading-text">Loading repositories...</p>}
                    {error && <p className="error-text">{error}</p>}

                    {!isLoading && !error && !githubAccessToken && !repos.length && ( // No ghToken, and backend didn't provide repos
                        <div>
                            <p>Link your GitHub account to see your repositories.</p>
                            <button className="github-signin-btn" onClick={handleInitiateGithubLink}>
                                <span className="btn-text">Link Up Your GitHub</span>
                            </button>
                        </div>
                    )}

                    {!isLoading && !error && (githubAccessToken || repos.length > 0) && ( // ghToken exists OR backend provided repos
                        <>
                            <h3>Select a Repository:</h3>
                            {repos.length === 0 && <p>No repositories found. You might need to grant access or ensure you have repositories.</p>}
                            <ul className="repo-list">
                                {repos.map((r) => (
                                    <li key={r.id}>
                                        <button
                                            className={`repo-btn ${selectedRepoFullName === r.full_name ? 'selected' : ''}`}
                                            onClick={() => handleRepoSelect(r.full_name, r.default_branch)}
                                            disabled={!appUserToken} // Disable if not logged into Echo
                                        >
                                            {r.full_name}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            {selectedRepoFullName && (
                                <p className="selected-repo">
                                    You will generate documentation for: <strong>{selectedRepoFullName}</strong>
                                </p>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default LinkGithubRepo;