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
function parseJwt(token: string): JwtPayload | null {
    try {
        const base64Payload = token.split('.')[1];
        const payload = atob(base64Payload);
        return JSON.parse(payload);
    } catch {
        return null;
    }
}

interface TreeItem {
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

type FileNode = {
    name: string;
    type: 'file';
    path: string;
    sha: string;
};
type FolderNode = {
    name: string;
    type: 'folder';
    path: string;
    sha: string;
    children: (FolderNode | FileNode)[];
};

/* =================================================================== */

const EditDocument: React.FC = () => {
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
            setSelectedBranch(main.name);
            await fetchFileTree(repo, accessToken, main.commit.sha);
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
        return json.content
            ? atob(json.content as string)
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
        setSelectedBranch(e.target.value);
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
        if (!repoFullName || !token || !selectedBranch) return alert('Missing repo/token.');
        const path = 'README.md';

        /* get current sha */
        const [owner, repo] = repoFullName.split('/');
        const shaRes = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${selectedBranch}`,
            { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!shaRes.ok) return alert('Could not fetch README sha.');
        const shaJson = await shaRes.json();
        const currentSha = shaJson.sha;

        /* PUT */
        const put = await fetch(
            `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
            {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    Accept: 'application/vnd.github+json',
                },
                body: JSON.stringify({
                    message: `Update README via echo DocumentPage (${selectedBranch})`,
                    content: btoa(docContent),
                    sha: currentSha,
                    branch: selectedBranch,
                }),
            }
        );
        if (!put.ok) {
            const msg = await put.text();
            return alert(`GitHub commit failed:\n${msg}`);
        }
        const putJson = await put.json();
        const newCommitSha = putJson.commit?.sha;

        /* get fresh tree + README */
        await fetchFileTree(repoFullName, token, newCommitSha);
        const fresh = await fetchReadme(repoFullName, token, newCommitSha);
        if (fresh) setDocContent(fresh);
        alert('Committed successfully!');
    }, [docContent, repoFullName, token, selectedBranch]);

    /* Generate user manual (unchanged) */
    const handleGenerateUserManual = async () => {
        if (!repoFullName || !token || !selectedBranch) return alert('Missing repo/token.');
        setIsGenerating(true);
        setIsComplete(false);
        try {
            const res = await fetch('http://localhost:5001/documents/analyze-repository', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ repoFullName, token, selectedBranch }),
            });
            if (!res.ok) throw new Error(await res.text());
            const json = await res.json();
            setDocContent(
                typeof json.userManual === 'string'
                    ? json.userManual
                    : JSON.stringify(json, null, 2)
            );
            setIsComplete(true);
        } catch (err) {
            console.error(err);
            alert('Error generating manual – see console.');
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
                                <option key={b.name}>{b.name}</option>
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
function buildNestedTree(tree: TreeItem[]): (FolderNode | FileNode)[] {
    const root: (FolderNode | FileNode)[] = [];
    tree.forEach(t => insertPath(root, t.path.split('/'), t));
    return root;
}
function insertPath(
    lvl: (FolderNode | FileNode)[],
    parts: string[],
    item: TreeItem
) {
    const [segment, ...rest] = parts;
    if (!rest.length) {
        lvl.push(item.type === 'blob'
            ? { name: segment, type: 'file',   path: item.path, sha: item.sha }
            : { name: segment, type: 'folder', path: item.path, sha: item.sha, children: [] }
        );
        return;
    }
    let folder = lvl.find(n => n.type === 'folder' && n.name === segment) as FolderNode;
    if (!folder) {
        folder = { name: segment, type: 'folder', path: '', sha: '', children: [] };
        lvl.push(folder);
    }
    insertPath(folder.children, rest, item);
}

/* ======== tree UI ======== */
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
        if (['js','ts'].includes(ext!)) return <FaJsSquare/>;
        if (ext === 'json') return <FiFile/>;
        if (ext === 'txt')  return <FiFileText/>;
        if (ext === 'css')  return <FaCss3Alt/>;
        if (ext === 'html') return <FaHtml5/>;
        if (/png|jpe?g|svg/.test(ext!)) return <IoIosImage/>;
        return <FiFile/>;
    };
    if (node.type === 'file') {
        return (
            <li className="file-item">
                <span className="file-icon">{getIcon(node.name)}</span> {node.name}
            </li>
        );
    }
    return (
        <li className="folder-item">
            <div className="folder-label" onClick={() => setOpen(!open)}>
                <span className="folder-arrow">{open ? '▼' : '▶'}</span>
                <span className="folder-icon"><FiFolder/></span>
                {node.name}
            </div>
            {open && (
                <ul className="folder-children">
                    {node.children.map(c => (
                        <FileNodeUI key={c.path || c.name} node={c}/>
                    ))}
                </ul>
            )}
        </li>
    );
}

export default EditDocument;