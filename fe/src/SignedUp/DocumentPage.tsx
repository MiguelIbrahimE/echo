/* ==========================================
   DocumentPage.tsx
   With extra wait & retry for the newest README
   ========================================== */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Cookies from 'js-cookie';

import "../global-css/navbar.css";
import "./CSS/DocPage.css";

import { FiFileText, FiFile, FiFolder } from 'react-icons/fi';
import { FaJsSquare, FaCss3Alt, FaHtml5 } from 'react-icons/fa';
import { IoIosImage } from 'react-icons/io';
import ProgressModal from './ProgressModal';

interface JwtPayload {
  username?: string;
}

function parseJwt(token: string): JwtPayload | null {
  try {
    const base64Payload = token.split('.')[1];
    const payload = atob(base64Payload);
    return JSON.parse(payload);
  } catch (err) {
    console.error('Failed to parse token', err);
    return null;
  }
}

interface TreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

interface GitTreeResponse {
  sha: string;
  url: string;
  tree: TreeItem[];
  truncated: boolean;
}

interface Branch {
  name: string;
  commit: {
    sha: string;
    url: string;
  };
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

const DocumentPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Logged in user (from local JWT)
  const [loggedInUser, setLoggedInUser] = useState<string | null>(null);

  // GitHub-related states
  const [token, setToken] = useState('');
  const [repoFullName, setRepoFullName] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [treeItems, setTreeItems] = useState<TreeItem[]>([]);
  const [nestedTree, setNestedTree] = useState<(FolderNode | FileNode)[]>([]);

  // Editor
  const [docContent, setDocContent] = useState<string>('');
  const [isAutosaved, setIsAutosaved] = useState(false);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Progress modal
  const [isGenerating, setIsGenerating] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  // Dark mode & preview mode
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isPreview, setIsPreview] = useState(false);

  // ============================================
  // On mount -> parse data & load
  // ============================================
  useEffect(() => {
    // (1) Dark mode
    const darkCookie = Cookies.get('darkMode');
    if (darkCookie === 'true') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark-mode');
    }

    // (2) Check local JWT
    const storedToken = localStorage.getItem('myAppToken');
    if (storedToken) {
      const decoded = parseJwt(storedToken);
      if (decoded?.username) {
        setLoggedInUser(decoded.username);
      }
    }

    // (3) Get ?repo= & ?token= from URL
    const params = new URLSearchParams(location.search);
    const repo = params.get('repo') || '';
    const ghToken = params.get('token') || '';
    setRepoFullName(repo);
    setToken(ghToken);

    // (4) If we have GH token + repo, fetch branches
    if (repo && ghToken) {
      fetchBranches(repo, ghToken);
    } else {
      console.log('[DocumentPage] No repo or token in URL.', { repo, ghToken });
    }

    // (5) Load doc content from localStorage
    const savedDoc = localStorage.getItem('docContent');
    if (savedDoc) {
      setDocContent(savedDoc);
    }
  }, [location.search]);

  // ============================================
  // Toggle dark mode
  // ============================================
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

  // Toggle editor vs. preview
  const handlePreviewToggle = () => {
    setIsPreview(!isPreview);
  };

  // ============================================
  // Fetch branches
  // ============================================
  async function fetchBranches(repo: string, accessToken: string) {
    try {
      const [owner, repoName] = repo.split('/');
      const url = `https://api.github.com/repos/${owner}/${repoName}/branches`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!resp.ok) {
        throw new Error(`[fetchBranches] Error: ${resp.status} ${resp.statusText}`);
      }
      const data: Branch[] = await resp.json();
      setBranches(data);

      if (data.length > 0) {
        const mainBranch = data.find(b => b.name === 'main') || data[0];
        setSelectedBranch(mainBranch.name);
        await fetchFileTree(repo, accessToken, mainBranch.commit.sha);
      }
    } catch (err) {
      console.error('[fetchBranches] Error:', err);
    }
  }

  // ============================================
  // Fetch file tree
  // ============================================
  async function fetchFileTree(repo: string, accessToken: string, commitSha: string) {
    try {
      const [owner, repoName] = repo.split('/');
      const url = `https://api.github.com/repos/${owner}/${repoName}/git/trees/${commitSha}?recursive=1`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!resp.ok) {
        throw new Error(`[fetchFileTree] Error: ${resp.status} ${resp.statusText}`);
      }
      const data: GitTreeResponse = await resp.json();
      setTreeItems(data.tree);
    } catch (err) {
      console.error('[fetchFileTree] Error:', err);
    }
  }

  // Build nested structure after we get treeItems
  useEffect(() => {
    if (treeItems.length === 0) {
      setNestedTree([]);
      return;
    }
    const root = buildNestedTree(treeItems);
    setNestedTree(root);
  }, [treeItems]);

  // On branch change
  const handleBranchChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newBranch = e.target.value;
    setSelectedBranch(newBranch);
    const branchObj = branches.find(b => b.name === newBranch);
    if (branchObj) {
      await fetchFileTree(repoFullName, token, branchObj.commit.sha);
    }
  };

  // ============================================
  // Editor changes -> autosave
  // ============================================
  const handleDocChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setDocContent(newValue);
    setIsAutosaved(false);

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }
    typingTimerRef.current = setTimeout(() => {
      localStorage.setItem('docContent', newValue);
      setIsAutosaved(true);
    }, 1000);
  };

  // ============================================
  // getFileSha
  // ============================================
  const getFileSha = useCallback(
      async (path: string) => {
        if (!repoFullName || !token || !selectedBranch) {
          console.warn('[getFileSha] Missing info:', { repoFullName, token, selectedBranch });
          return null;
        }
        const [owner, repoName] = repoFullName.split('/');
        const url = `https://api.github.com/repos/${owner}/${repoName}/contents/${path}?ref=${selectedBranch}`;
        try {
          const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
          if (!resp.ok) {
            console.error('[getFileSha] Failed. status=', resp.status);
            return null;
          }
          const data = await resp.json();
          return data.sha;
        } catch (err) {
          console.error('[getFileSha] error:', err);
          return null;
        }
      },
      [repoFullName, token, selectedBranch]
  );

  /**
   * Sleep helper to wait a bit (in ms)
   */
  async function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Try fetching README from a given commit SHA, up to 3 times
   */
  async function fetchReadmeWithRetry(
      owner: string,
      repoName: string,
      commitSha: string,
      attempts = 3
  ): Promise<string | null> {
    const readmeUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/README.md?ref=${commitSha}`;

    for (let i = 1; i <= attempts; i++) {
      console.log(`[fetchReadmeWithRetry] Attempt #${i} for commit=${commitSha}`);

      const resp = await fetch(readmeUrl, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resp.ok) {
        console.warn(`[fetchReadmeWithRetry] Attempt #${i} => status=${resp.status}`);
        // Wait 1 second before trying again
        await sleep(1000);
        continue;
      }

      const jsonData = await resp.json();
      if (jsonData.content) {
        return atob(jsonData.content);
      }

      console.warn(`[fetchReadmeWithRetry] Attempt #${i} => no "content" field returned.`);
      await sleep(1000);
    }

    return null;
  }

  // ============================================
  // handleCommitToGithub -> do PUT, parse new commit SHA
  // then fetch newest README with short wait
  // ============================================
  const handleCommitToGithub = useCallback(async () => {
    if (!repoFullName || !token || !selectedBranch) {
      console.warn('[handleCommitToGithub] Missing data:', { repoFullName, token, selectedBranch });
      return;
    }

    const path = 'README.md';
    const sha = await getFileSha(path);
    console.log('[handleCommitToGithub] current README.md sha:', sha);

    const base64Content = btoa(docContent || '');
    const message = `Update doc from DocumentPage on branch ${selectedBranch}`;

    try {
      const [owner, repoName] = repoFullName.split('/');
      const url = `https://api.github.com/repos/${owner}/${repoName}/contents/${path}?ref=${selectedBranch}`;
      const putResp = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github+json',
        },
        body: JSON.stringify({ message, content: base64Content, sha: sha || undefined }),
      });

      if (!putResp.ok) {
        const msg = await putResp.text();
        throw new Error(`GitHub commit failed: ${msg}`);
      }

      // Parse new commit data
      const putJson = await putResp.json();
      const newCommitSha = putJson.commit?.sha;
      console.log('[handleCommitToGithub] New commit SHA:', newCommitSha);

      if (!newCommitSha) {
        alert('Committed, but could not find the new commit SHA. Something is off.');
        return;
      }

      // (1) Refresh file tree using the new commit SHA
      await fetchFileTree(repoFullName, token, newCommitSha);

      // (2) Attempt up to 3 times to fetch the updated README from the new commit
      const newReadme = await fetchReadmeWithRetry(owner, repoName, newCommitSha, 3);
      if (newReadme) {
        setDocContent(newReadme);
        alert('Committed README.md successfully, and loaded the newest version!');
      } else {
        alert('Committed successfully, but we could not fetch the updated content after 3 tries.');
      }
    } catch (err) {
      console.error('[handleCommitToGithub] Error:', err);
      alert(`Error committing to GitHub: ${err}`);
    }
  }, [
    docContent,
    repoFullName,
    selectedBranch,
    token,
    getFileSha
  ]);

  // ============================================
  // Generate user manual
  // ============================================
  const handleGenerateUserManual = async () => {
    if (!repoFullName || !token || !selectedBranch) {
      console.warn('[handleGenerateUserManual] Missing info:', { repoFullName, token, selectedBranch });
      return;
    }
    setIsGenerating(true);
    setIsComplete(false);

    try {
      const response = await fetch('http://localhost:5001/documents/analyze-repository', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoFullName, token, selectedBranch }),
      });
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`[handleGenerateUserManual] ${errText}`);
      }

      const data = await response.json();
      let finalText = '';
      if (typeof data.userManual === 'string') {
        finalText = data.userManual;
      } else if (data.userManual?.userManual) {
        finalText = data.userManual.userManual;
      } else {
        finalText = JSON.stringify(data, null, 2);
      }

      setDocContent(finalText);
      setIsComplete(true);
    } catch (err) {
      console.error('[handleGenerateUserManual] Error:', err);
      alert('Error generating user manual. See console.');
    } finally {
      setIsGenerating(false);
    }
  };

  // Close modal
  const handleCloseModal = () => {
    setIsGenerating(false);
  };

  // Go back
  const goBack = () => navigate(-1);

  // ============================================
  // RENDER
  // ============================================
  return (
      <>
        <nav className="navbar">
          <a href="/" className="brand" style={{ textDecoration: 'none', color: 'grey' }}>
            echo
          </a>
          <div className="nav-right">
            {loggedInUser ? <p>Signed in as: {loggedInUser}</p> : <p>Not signed in</p>}
            <button onClick={toggleDarkMode} style={{ marginLeft: '1rem', cursor: 'pointer' }}>
              {isDarkMode ? 'Light Mode' : 'Dark Mode'}
            </button>
          </div>
        </nav>

        <div className="doc-container">
          <ProgressModal isVisible={isGenerating} isComplete={isComplete} onClose={handleCloseModal} />

          {/* LEFT PANE */}
          <div className="doc-left-pane">
            <h3>Repository Tree</h3>
            <div className="branch-selector">
              <label>
                Branch:
                <select value={selectedBranch} onChange={handleBranchChange}>
                  {branches.map(b => (
                      <option key={b.name} value={b.name}>
                        {b.name}
                      </option>
                  ))}
                </select>
              </label>
            </div>
            <FileTree nodes={nestedTree} />
          </div>

          {/* RIGHT PANE */}
          <div className="doc-right-pane">
            <h2>Documentation Editor</h2>
            {!isPreview ? (
                <textarea
                    className="doc-textarea"
                    placeholder="Type your doc here..."
                    value={docContent}
                    onChange={handleDocChange}
                />
            ) : (
                <div className="doc-preview">{docContent}</div>
            )}

            <div className="editor-footer">
              <button className="btn" onClick={goBack}>Back</button>
              {isAutosaved ? (
                  <span className="autosave-status">Autosaved</span>
              ) : (
                  <span className="autosave-status typing">Typing...</span>
              )}
              <button className="btn preview-btn" onClick={handlePreviewToggle}>
                {isPreview ? 'Edit Mode' : 'Preview'}
              </button>
              <button className="btn commit-btn" onClick={handleCommitToGithub}>
                Commit
              </button>
              <button className="btn generate-btn" onClick={handleGenerateUserManual}>
                Generate User Manual
              </button>
            </div>
          </div>
        </div>
      </>
  );
};

/* =========================================================
   Build a nested tree structure from GitHub’s `tree` API
========================================================= */
function buildNestedTree(treeItems: TreeItem[]): (FolderNode | FileNode)[] {
  const rootNodes: (FolderNode | FileNode)[] = [];
  for (const item of treeItems) {
    const parts = item.path.split('/');
    insertPath(rootNodes, parts, item);
  }
  return rootNodes;
}

function insertPath(
    currentLevel: (FolderNode | FileNode)[],
    parts: string[],
    item: TreeItem
) {
  const [first, ...rest] = parts;
  if (rest.length === 0) {
    // final part
    if (item.type === 'blob') {
      currentLevel.push({
        name: first,
        type: 'file',
        path: item.path,
        sha: item.sha,
      });
    } else {
      currentLevel.push({
        name: first,
        type: 'folder',
        path: item.path,
        sha: item.sha,
        children: [],
      } as FolderNode);
    }
    return;
  }

  let folderNode = currentLevel.find(
      (node) => node.type === 'folder' && node.name === first
  ) as FolderNode | undefined;

  if (!folderNode) {
    folderNode = {
      name: first,
      type: 'folder',
      path: '',
      sha: '',
      children: [],
    };
    currentLevel.push(folderNode);
  }

  insertPath(folderNode.children, rest, item);
}

function FileTree({ nodes }: { nodes: (FolderNode | FileNode)[] }) {
  // Sort so folders appear before files
  nodes.sort((a, b) => {
    if (a.type === 'folder' && b.type === 'file') return -1;
    if (a.type === 'file' && b.type === 'folder') return 1;
    return a.name.localeCompare(b.name);
  });

  return (
      <ul className="file-tree">
        {nodes.map((node) => (
            <FileNodeUI key={node.path || node.name} node={node} />
        ))}
      </ul>
  );
}

function FileNodeUI({ node }: { node: FolderNode | FileNode }) {
  const [isOpen, setIsOpen] = useState(false);

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    if (ext === 'md') return <FiFileText />;
    if (ext === 'js') return <FaJsSquare />;
    if (ext === 'ts') return <FaJsSquare />;
    if (ext === 'json') return <FiFile />;
    if (ext === 'txt') return <FiFileText />;
    if (ext === 'css') return <FaCss3Alt />;
    if (ext === 'html') return <FaHtml5 />;
    if (/(png|jpg|jpeg|svg)/.test(ext || '')) return <IoIosImage />;
    return <FiFile />;
  };

  if (node.type === 'file') {
    return (
        <li className="file-item">
          <span className="file-icon">{getFileIcon(node.name)}</span> {node.name}
        </li>
    );
  } else {
    // folder
    const toggleOpen = () => setIsOpen(!isOpen);
    return (
        <li className="folder-item">
          <div className="folder-label" onClick={toggleOpen}>
            <span className="folder-arrow">{isOpen ? '▼' : '▶'}</span>
            <span className="folder-icon"><FiFolder /></span>
            {node.name}
          </div>
          {isOpen && (
              <ul className="folder-children">
                {node.children.map((child) => (
                    <FileNodeUI key={child.path || child.name} node={child} />
                ))}
              </ul>
          )}
        </li>
    );
  }
}

export default DocumentPage;
