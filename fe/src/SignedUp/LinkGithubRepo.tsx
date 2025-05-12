/* ==========================================
   LinkGithubRepo.tsx              ✨ 2025-05-01
   • Lets the user choose a repo
   • Saves that repo for the user  (POST /repositories)
   • Creates an empty document     (POST /documents)
   • Then routes straight into the editor
========================================== */
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import "./CSS/repolinking.css";

interface Repo {
    id: number;
    full_name: string;   // e.g. "octocat/hello-world"
    default_branch: string;
}

const LinkGithubRepo: React.FC = () => {
    const [token, setToken]   = useState<string | null>(null);
    const [repos, setRepos]   = useState<Repo[]>([]);
    const [selectedRepo, setSelectedRepo] = useState<string | null>(null);

    const location = useLocation();
    const navigate = useNavigate();

    /* ------------------------------------------
       Read PAT from ?token= or localStorage
    ------------------------------------------ */
    useEffect(() => {
        const q = new URLSearchParams(location.search);
        const t = q.get("token") || localStorage.getItem("ghToken");
        if (t) {
            setToken(t);
            localStorage.setItem("ghToken", t);
            fetchRepositories(t);
        }
    }, [location.search]);

    /* ------------------------------------------
       GitHub API call
    ------------------------------------------ */
    async function fetchRepositories(accessToken: string) {
        try {
            const res = await fetch(
                "https://api.github.com/user/repos?per_page=100",
                { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (!res.ok) throw new Error("GitHub API error");
            setRepos(await res.json());
        } catch (e) {
            console.error(e);
            alert("Could not load repositories");
        }
    }

    /* ------------------------------------------
       When a repo is chosen
    ------------------------------------------ */
    const handleRepoSelect = async (repoFull: string, defaultBranch = "main") => {
        setSelectedRepo(repoFull);

        const jwt = localStorage.getItem("myAppToken") || "";
        if (!jwt) {
            alert("You must be logged in first.");
            return;
        }

        /* 1 ▸ save / update repo for this user ---------------- */
        try {
            await fetch(`${import.meta.env.VITE_API_BASE_URL}/repositories`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${jwt}`,
                },
                body: JSON.stringify({
                    repoFullName: repoFull,
                    githubToken: token,
                }),
            });
        } catch (e) {
            console.warn("Repo save failed (continuing)…", e);
        }

        /* 2 ▸ create (or retrieve existing) blank manual ------- */
        try {
            const title   = `Manual – ${repoFull.split("/")[1]}`;
            const docRes  = await fetch(
                `${import.meta.env.VITE_API_BASE_URL}/documents`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${jwt}`,
                    },
                    body: JSON.stringify({
                        title,
                        content: "",
                        repoFullName: repoFull,
                        branchName : defaultBranch,
                    }),
                }
            );
            if (!docRes.ok) {
                const txt = await docRes.text();
                console.warn("Doc create failed:", txt);
            }
        } catch (e) {
            console.error("Error creating document:", e);
        }

        /* 3 ▸ jump into editor ------------------------------- */
        navigate(
            `/document-page?repo=${encodeURIComponent(repoFull)}&token=${token || ""}&branch=${defaultBranch}`
        );
    };

    /* ------------------------------------------
       Start OAuth flow
    ------------------------------------------ */
    const handleGithubSignIn = () => {
        window.location.href = "http://localhost:5001/auth/github";
    };

    /* ------------------------------------------
       Render
    ------------------------------------------ */
    return (
        <div className="bg-light" style={{ minHeight: "100vh" }}>
            <nav className="navbar">
                <h1 className="brand" onClick={() => navigate("/")}>echo</h1>
            </nav>

            <div className="main-container">
                <div className="github-card">
                    {!token ? (
                        <button className="github-signin-btn" onClick={handleGithubSignIn}>
                            <span className="btn-text">Link Up Your GitHub</span>
                        </button>
                    ) : (
                        <>
                            <h3>Select a Repository:</h3>
                            <ul className="repo-list">
                                {repos.map((r) => (
                                    <li key={r.id}>
                                        <button
                                            className="repo-btn"
                                            onClick={() => handleRepoSelect(r.full_name, r.default_branch)}
                                        >
                                            {r.full_name}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                            {selectedRepo && (
                                <p className="selected-repo">
                                    Selected: <strong>{selectedRepo}</strong>
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