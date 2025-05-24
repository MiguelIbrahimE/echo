/* ==========================================
   EditDocument.tsx              ✨ 2025-05-01
   – Shows side-by-side Markdown preview
   – Always reloads the *latest* README.md
   – Commits reliably, dark-mode, etc.
========================================== */
import React, {
    useState,
    useEffect,
    useCallback,
    useRef,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Cookies from 'js-cookie';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import "../global-css/navbar.css";
import "./CSS/EditDoc.css";

import {
    FiFileText,
    FiFile,
    FiFolder,
} from 'react-icons/fi';
import { FaJsSquare, FaCss3Alt, FaHtml5 } from 'react-icons/fa';
import { IoIosImage } from 'react-icons/io';

import ProgressModal from './ProgressModal';

/* ---------- helper types ---------- */
interface JwtPayload { username?: string; }

// highlight-next-line
export function parseJwt(token: string): JwtPayload | null { // <<< ADDED export
    try {
        const base64Payload = token.split('.')[1];
        const payload = atob(base64Payload);
        return JSON.parse(payload);
    } catch {
        return null;
    }
}

// highlight-next-line
export interface TreeItem { // <<< ADDED export (because your test imports it)
    path: string;
    mode: string;
    type: 'blob' | 'tree';
    sha: string;
    size?: number;
}

interface GitTreeResponse {
    tree: TreeItem[];
}

interface Branch {
    name: string;
    commit: { sha: string; url: string; };
    protected: boolean;
}

// These types are used by buildNestedTree and FileTree, export if tests need them directly
// For now, assuming only TreeItem, parseJwt, and buildNestedTree are directly imported by tests.
export type FileNode = { // <<< Also export if needed by tests, or if buildNestedTree's return type signature in tests needs it.
    name: string;
    type: 'file';
    path: string;
    sha: string;
};
export type FolderNode = { // <<< Also export if needed
    name: string;
    type: 'folder';
    path: string;
    sha: string;
    children: (FolderNode | FileNode)[];
};

/* =================================================================== */

const EditDocument: React.FC = () => {
    // ... (rest of your component logic remains the same) ...
    const navigate   = useNavigate();
    const location   = useLocation();

    /* -------- user / UI state -------- */
    const [loggedInUser, setLoggedInUser] = useState<string | null>(null);
    const [isDarkMode,   setIsDarkMode]   = useState(false);

    /* -------- GitHub state -------- */
    const [token,          setToken]          = useState('');
    const [repoFullName,   setRepoFullName]   = useState('');
    const [branches,       setBranches]       = useState<Branch[]>([]);
    const [selectedBranch, setSelectedBranch] = useState('');
    const [treeItems,      setTreeItems]      = useState<TreeItem[]>([]);
    const [nestedTree,     setNestedTree]     = useState<(FolderNode | FileNode)[]>([]);

    /* -------- editor state -------- */
    const [docContent,  setDocContent]  = useState('');
    const [isAutosaved, setIsAutosaved] = useState(false);
    const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

    /* -------- modal state -------- */
    const [isGenerating, setIsGenerating] = useState(false);
    const [isComplete,   setIsComplete]   = useState(false);

    /* ================================================================
       1.  On mount → read query params, cookies, JWT, branches, README
    ================================================================= */
    useEffect(() => {
        /* dark-mode cookie */
        const darkCookie = Cookies.get('darkMode');
        if (darkCookie === 'true') {
            setIsDarkMode(true);
            document.documentElement.classList.add('dark-mode');
        }

        /* local JWT (for “Signed in as …”) */
        const storedToken = localStorage.getItem('myAppToken');
        const decoded     = storedToken ? parseJwt(storedToken) : null;
        if (decoded?.username) setLoggedInUser(decoded.username);

        /* repo + PAT from query string */
        const params  = new URLSearchParams(location.search);
        const repo    = params.get('repo')   || '';
        const ghToken = params.get('token')  || '';
        setRepoFullName(repo);
        setToken(ghToken);

        if (repo && ghToken) {
            fetchBranches(repo, ghToken);
        }
    }, [location.search]);

    /* ----------------------------------------------------------------
       2.  Whenever the selected branch changes     ★ fetch fresh README
    ---------------------------------------------------------------- */
    useEffect(() => {
        if (!repoFullName || !token || !selectedBranch) return;
        fetchReadme(repoFullName, token, selectedBranch)
            .then((readme) => {
                /* only overwrite if the user hasn’t typed yet */
                const userEditing = typingTimerRef.current !== null;
                if (!userEditing && readme) setDocContent(readme);
            })
            .catch((e) => console.warn('README fetch failed:', e));
    }, [repoFullName, token, selectedBranch]);

    /* ----------------------------------------------------------------
       3.  Build <ul> tree once the flat array arrives
    ---------------------------------------------------------------- */
    useEffect(() => {
        setNestedTree(
            treeItems.length ? buildNestedTree(treeItems) : []
        );
    }, [treeItems]);

    /* ================================================================
       Fetch helpers
    ================================================================= */
    async function fetchBranches(repo: string, accessToken: string) {
        try {
            const [owner, repoName] = repo.split('/');
            const url = `https://api.github.com/repos/${owner}/${repoName}/branches`;
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!res.ok) throw new Error(`GitHub …/branches → ${res.status}`);
            const data: Branch[] = await res.json();
            setBranches(data);

            const main = data.find(b => b.name === 'main') || data[0];
            if (main) { // Ensure main branch or a fallback is found
                setSelectedBranch(main.name);
                await fetchFileTree(repo, accessToken, main.commit.sha);
            } else if (data.length > 0) { // Fallback to the first branch if no 'main' and list is not empty
                setSelectedBranch(data[0].name);
                await fetchFileTree(repo, accessToken, data[0].commit.sha);
            } else {
                console.warn("No branches found for the repository.");
                // Handle case with no branches (e.g., set error state, clear tree)
                setBranches([]);
                setTreeItems([]);
            }
        } catch (err) {
            console.error('[fetchBranches]', err);
        }
    }

    async function fetchFileTree(repo: string, accessToken: string, sha: string) {
        const [owner, repoName] = repo.split('/');
        const url = `https://api.github.com/repos/${owner}/${repoName}/git/trees/${sha}?recursive=1`;
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) throw new Error(`GitHub …/git/trees → ${res.status}`);
        const data: GitTreeResponse = await res.json();
        setTreeItems(data.tree);
    }

    /* ★ fresh README loader – reusable for branch changes */
    async function fetchReadme(
        repoFull: string,
        accessToken: string,
        ref: string   /* branch name or sha */
    ): Promise<string | null> {
        const [owner, repo] = repoFull.split('/');
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/README.md?ref=${ref}`;
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) return null;
        const json = await res.json();
        return json.content && typeof json.content === 'string' // Ensure content is a string
            ? atob(json.content)
            : null;
    }

    /* ================================================================
       UI event handlers
    ================================================================= */
    const toggleDarkMode = () => {
        const html = document.documentElement;
        if (isDarkMode) {
            html.classList.remove('dark-mode');
            Cookies.set('darkMode', 'false');
        } else {
            html.classList.add('dark-mode');
            Cookies.set('darkMode', 'true');
        }
        setIsDarkMode(!isDarkMode);
    };

    const handleBranchChange = async (
        e: React.ChangeEvent<HTMLSelectElement>
    ) => {
        const newBranchName = e.target.value;
        setSelectedBranch(newBranchName);
        // Fetch new file tree for the selected branch
        // Find the commit SHA for the new branch
        const newBranchData = branches.find(b => b.name === newBranchName);
        if (newBranchData && token && repoFullName) {
            await fetchFileTree(repoFullName, token, newBranchData.commit.sha);
        }
    };

    const handleDocChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const newVal = e.target.value;
        setDocContent(newVal);
        setIsAutosaved(false);
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
            localStorage.setItem('docContent', newVal);
            setIsAutosaved(true);
            typingTimerRef.current = null;
        }, 1_000);
    };

    /* ★ commit to GitHub then pull latest README */
    const handleCommitToGithub = useCallback(async () => {
        if (!repoFullName || !token || !selectedBranch) {
            alert('Missing repository, token, or branch information.');
            return;
        }
        const path = 'README.md'; // Assuming we are always editing README.md

        try {
            /* get current sha */
            const [owner, repo] = repoFullName.split('/');
            const shaRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${selectedBranch}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (!shaRes.ok) {
                // If README.md doesn't exist, SHA fetch will fail (e.g. 404).
                // In this case, we might want to commit without a SHA (creates a new file).
                // For simplicity here, we assume it exists. A more robust solution would handle file creation.
                const errorText = await shaRes.text();
                alert(`Could not fetch current file details (SHA). Error: ${shaRes.status} - ${errorText}`);
                return;
            }
            const shaJson = await shaRes.json();
            const currentSha = shaJson.sha;

            if (!currentSha) {
                alert('Could not determine the SHA of the current file. Commit aborted.');
                return;
            }

            /* PUT */
            const putRes = await fetch(
                `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
                {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        Accept: 'application/vnd.github+json',
                    },
                    body: JSON.stringify({
                        message: `Update README.md via echo DocumentPage (branch: ${selectedBranch})`,
                        content: btoa(docContent), // btoa for base64 encoding
                        sha: currentSha,
                        branch: selectedBranch,
                    }),
                }
            );

            if (!putRes.ok) {
                const errorText = await putRes.text();
                alert(`GitHub commit failed:\n${errorText}`);
                return;
            }

            const putJson = await putRes.json();
            const newCommitSha = putJson.commit?.sha;

            if (newCommitSha) {
                /* get fresh tree + README */
                await fetchFileTree(repoFullName, token, newCommitSha);
                const freshReadme = await fetchReadme(repoFullName, token, newCommitSha);
                if (freshReadme !== null) { // Check for null explicitly
                    setDocContent(freshReadme);
                }
                alert('Committed successfully!');
            } else {
                alert('Commit seemed to succeed, but no new commit SHA was returned.');
            }

        } catch (error) {
            console.error("Error during commit process:", error);
            alert(`An error occurred during the commit process: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [docContent, repoFullName, token, selectedBranch]);


    /* Generate user manual (unchanged) */
    const handleGenerateUserManual = async () => {
        if (!repoFullName || !token || !selectedBranch) {
            alert('Missing repository, token, or branch information.');
            return;
        }
        setIsGenerating(true);
        setIsComplete(false);
        try {
            // Ensure the URL matches your backend endpoint for this specific generation
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001'}/documents/generate-user-manual`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    // If this route requires authentication via your app's JWT:
                    'Authorization': `Bearer ${localStorage.getItem('myAppToken') || ''}`,
                },
                // The body should match what the backend expects for generation
                // The old /analyze-repository took { repoFullName, token, selectedBranch }
                // The new /generate-user-manual expects { repoFullName, branchName } in body,
                // and uses user's linked ghToken from DB via authenticateAndLoadUser.
                // So, we need to pass repoFullName and selectedBranch (as branchName)
                body: JSON.stringify({
                    repoFullName,
                    branchName: selectedBranch
                    // The 'token' (GitHub PAT) is now expected to be on the backend,
                    // associated with the user via authenticateAndLoadUser.
                    // If your generate-user-manual still needs the token directly passed, adjust accordingly.
                }),
            });

            if (!res.ok) {
                const errorData = await res.json().catch(() => ({ message: "Unknown error generating manual."}));
                throw new Error(errorData.message || `HTTP error ${res.status}`);
            }

            const json = await res.json();
            // Assuming the new generation routes return a structure like:
            // { echoDocument: { content: "markdown..." }, ... }
            // or directly { markdownContent: "..." }
            // Adjust based on actual backend response for /generate-user-manual
            if (json.echoDocument && typeof json.echoDocument.content === 'string') {
                setDocContent(json.echoDocument.content);
            } else if (typeof json.markdownContent === 'string') { // Fallback if structure is different
                setDocContent(json.markdownContent);
            } else if (typeof json.userManual === 'string') { // For compatibility with old /analyze-repository
                setDocContent(json.userManual);
            } else {
                console.warn("Unexpected format for generated manual:", json);
                setDocContent(JSON.stringify(json, null, 2)); // Display raw JSON if format is unknown
            }
            setIsComplete(true);
        } catch (err) {
            console.error("Error generating user manual:", err);
            alert(`Error generating manual: ${err instanceof Error ? err.message : String(err)}`);
            setIsComplete(false); // Ensure complete isn't true on error
        } finally {
            setIsGenerating(false);
        }
    };
    /* ================================================================
       Render
    ================================================================= */
    return (
        <>
            <nav className="navbar">
                <a href="/" className="brand">echo</a>
                <div className="nav-right">
                    {loggedInUser
                        ? <p>Signed in as: {loggedInUser}</p>
                        : <p>Not signed in</p>}
                    <button onClick={toggleDarkMode}>
                        {isDarkMode ? 'Light Mode' : 'Dark Mode'}
                    </button>
                </div>
            </nav>

            <div className="doc-container">
                <ProgressModal
                    isVisible={isGenerating}
                    isComplete={isComplete}
                    onClose={() => setIsGenerating(false)}
                />

                {/* ---------- LEFT: tree ---------- */}
                <aside className="doc-left-pane">
                    <h3>Repository Tree</h3>
                    <label className="branch-selector">
                        Branch:&nbsp;
                        <select value={selectedBranch} onChange={handleBranchChange}>
                            {branches.map(b => (
                                <option key={b.name} value={b.name}>{b.name}</option>
                            ))}
                        </select>
                    </label>
                    <FileTree nodes={nestedTree} />
                </aside>

                {/* ---------- RIGHT: editor + preview ---------- */}
                <main className="doc-right-pane">
                    <h2>Documentation Editor</h2>
                    <div className="editor-split">
            <textarea
                className="doc-textarea"
                placeholder="Type Markdown here…"
                value={docContent}
                onChange={handleDocChange}
            />
                        <div className="doc-preview">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {docContent}
                            </ReactMarkdown>
                        </div>
                    </div>

                    <footer className="editor-footer">
                        <button className="btn" onClick={() => navigate(-1)}>Back</button>
                        <span className="autosave-status">
              {isAutosaved ? 'Autosaved' : 'Typing…'}
            </span>
                        <button className="btn commit-btn"    onClick={handleCommitToGithub}>Commit</button>
                        <button className="btn generate-btn" onClick={handleGenerateUserManual}>Generate&nbsp;User&nbsp;Manual</button>
                    </footer>
                </main>
            </div>
        </>
    );
};

/* ==================== helpers (unchanged) ==================== */
// highlight-next-line
export function buildNestedTree(tree: TreeItem[]): (FolderNode | FileNode)[] { // <<< ADDED export
    const root: (FolderNode | FileNode)[] = [];
    tree.forEach(t => insertPath(root, t.path.split('/'), t));
    return root;
}

// This function is used internally by buildNestedTree.
// It doesn't need to be exported unless you plan to test it directly.
function insertPath(
    lvl: (FolderNode | FileNode)[],
    parts: string[],
    item: TreeItem
) {
    const [segment, ...rest] = parts;
    if (!segment) return; // Should not happen with valid paths

    let existingNode = lvl.find(n => n.name === segment);

    if (!rest.length) { // This is the final part of the path (file or empty folder)
        if (!existingNode) { // Only add if it doesn't exist (handles case where folder is listed before its contents)
            lvl.push(item.type === 'blob'
                ? { name: segment, type: 'file',   path: item.path, sha: item.sha }
                : { name: segment, type: 'folder', path: item.path, sha: item.sha, children: [] }
            );
        } else if (existingNode.type === 'folder' && item.type === 'tree' && !existingNode.path) {
            // If we found a placeholder folder and now we have the actual tree item for it
            existingNode.path = item.path;
            existingNode.sha = item.sha;
        }
        return;
    }

    // This part is for a folder in the path, ensure it exists or create it
    let folderNode = existingNode as FolderNode | undefined;
    if (!folderNode || folderNode.type !== 'folder') { // If it's not a folder or doesn't exist
        folderNode = { name: segment, type: 'folder', path: segment, sha: '', children: [] }; // Path here is partial initially
        if (!existingNode) {
            lvl.push(folderNode);
        } else { // It exists but is not a folder (conflicting path, unusual) - replace or error
            // For simplicity, let's assume paths are consistent. In a real-world scenario, handle conflicts.
            const index = lvl.indexOf(existingNode);
            lvl.splice(index, 1, folderNode);
        }
    }
    // Reconstruct the path for the current folder segment if it was a placeholder
    // This is tricky if the API doesn't always list parent folders first or with their own 'tree' items.
    // The recursive git tree API usually gives full paths for all items.

    insertPath(folderNode.children, rest, item);
}


/* ======== tree UI ======== */
// These are React components, they are not typically exported for direct unit testing
// in the same way as utility functions, unless they are complex library components.
// They will be tested implicitly via the EditDocument component's rendering.
function FileTree({ nodes }: { nodes: (FolderNode | FileNode)[] }) {
    const sorted = [...nodes].sort((a, b) => (
        a.type === b.type
            ? a.name.localeCompare(b.name)
            : a.type === 'folder' ? -1 : 1
    ));
    return (
        <ul className="file-tree">
            {sorted.map(n => <FileNodeUI key={n.path || n.name} node={n} />)}
        </ul>
    );
}

function FileNodeUI({ node }: { node: FolderNode | FileNode }) {
    const [open, setOpen] = useState(false);
    const getIcon = (name: string) => {
        const ext = name.split('.').pop()?.toLowerCase();
        if (ext === 'md') return <FiFileText/>;
        if (['js','ts', 'jsx', 'tsx'].includes(ext!)) return <FaJsSquare/>; // Added jsx, tsx
        if (ext === 'json') return <FiFile/>;
        if (ext === 'txt')  return <FiFileText/>;
        if (ext === 'css')  return <FaCss3Alt/>;
        if (ext === 'html') return <FaHtml5/>;
        if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico'].includes(ext!)) return <IoIosImage/>; // Expanded image types
        return <FiFile/>;
    };

    if (node.type === 'file') {
        return (
            <li className="file-item" title={node.path}> {/* Added title for full path */}
                <span className="file-icon">{getIcon(node.name)}</span> {node.name}
            </li>
        );
    }
    return (
        <li className="folder-item">
            <div className="folder-label" onClick={() => setOpen(!open)} title={node.path}> {/* Added title */}
                <span className="folder-arrow">{open ? '▼' : '▶'}</span>
                <span className="folder-icon"><FiFolder/></span>
                {node.name}
            </div>
            {open && (node.children.length > 0 ? // Only render ul if children exist
                    (<ul className="folder-children">
                        {node.children.map(c => (
                            <FileNodeUI key={c.path || c.name} node={c}/>
                        ))}
                    </ul>) : <ul className="folder-children"><li className="file-item empty-folder"><em>(empty)</em></li></ul>
            )}
        </li>
    );
}


export default EditDocument;