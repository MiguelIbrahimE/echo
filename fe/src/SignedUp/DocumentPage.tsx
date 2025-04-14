/* ==========================================
   DocumentPage.tsx
   With extra debug logging
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

  // 1) If a user is logged in locally, we store that in localStorage as 'myAppToken'
  const [loggedInUser, setLoggedInUser] = useState<string | null>(null);

  // 2) GitHub-related state
  const [token, setToken] = useState('');             // GitHub token
  const [repoFullName, setRepoFullName] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [treeItems, setTreeItems] = useState<TreeItem[]>([]);
  const [nestedTree, setNestedTree] = useState<(FolderNode | FileNode)[]>([]);

  // 3) Editor content
  const [docContent, setDocContent] = useState<string>('');
  const [isAutosaved, setIsAutosaved] = useState(false);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 4) Progress modal states
  const [isGenerating, setIsGenerating] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  // 5) Dark mode
  const [isDarkMode, setIsDarkMode] = useState(false);

  // 6) Preview mode
  const [isPreview, setIsPreview] = useState(false);

  // ============================================
  // useEffect: parse data from URL, load branches, etc.
  // ============================================
  useEffect(() => {
    // 1) Check for dark-mode cookie
    const darkCookie = Cookies.get('darkMode');
    if (darkCookie === 'true') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark-mode');
    }

    // 2) See if there's a local JWT in localStorage
    const storedToken = localStorage.getItem('myAppToken');
    if (storedToken) {
      const decoded = parseJwt(storedToken);
      if (decoded?.username) {
        setLoggedInUser(decoded.username);
      }
    }

    // 3) Get ?repo= & ?token= from the URL query
    const params = new URLSearchParams(location.search);
    const repo = params.get('repo') || '';
    const ghToken = params.get('token') || '';
    setRepoFullName(repo);
    setToken(ghToken);

    // 4) If we have a GitHub token + repo, fetch branches
    if (repo && ghToken) {
      console.log('[DocumentPage] Found repo:', repo, 'and GH token:', ghToken);
      fetchBranches(repo, ghToken);
    } else {
      console.log('[DocumentPage] No repo or token in URL. repo=', repo, ' token=', ghToken);
    }

    // 5) If there's saved doc content, load it
    const savedDoc = localStorage.getItem('docContent');
    if (savedDoc) {
      setDocContent(savedDoc);
    }
  }, [location.search]);

  // ============================================
  // Toggle dark/light
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

  // ============================================
  // Toggle Editor/Preview
  // ============================================
  const handlePreviewToggle = () => {
    setIsPreview(!isPreview);
  };

  // ============================================
  // Fetch branches from GitHub
  // ============================================
  async function fetchBranches(repo: string, accessToken: string) {
    console.log('[fetchBranches] Requesting branches for', repo, 'with GH token:', accessToken);
    try {
      const [owner, repoName] = repo.split('/');
      const url = `https://api.github.com/repos/${owner}/${repoName}/branches`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!resp.ok) {
        throw new Error(`[fetchBranches] Could not fetch branches: ${resp.status} ${resp.statusText}`);
      }
      const data: Branch[] = await resp.json();
      console.log('[fetchBranches] Received branches:', data);
      setBranches(data);

      // Default to "main" if it exists, else use the first branch
      if (data.length > 0) {
        const mainBranch = data.find(b => b.name === 'main') || data[0];
        setSelectedBranch(mainBranch.name);
        fetchFileTree(repo, accessToken, mainBranch.commit.sha);
      }
    } catch (err) {
      console.error('[fetchBranches] Error:', err);
    }
  }

  // ============================================
  // Fetch entire file tree from GitHub
  // ============================================
  async function fetchFileTree(repo: string, accessToken: string, commitSha: string) {
    console.log('[fetchFileTree] For repo:', repo, 'commitSha:', commitSha);
    try {
      const [owner, repoName] = repo.split('/');
      const url = `https://api.github.com/repos/${owner}/${repoName}/git/trees/${commitSha}?recursive=1`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!resp.ok) {
        throw new Error(`[fetchFileTree] Could not fetch file tree: ${resp.status} ${resp.statusText}`);
      }
      const data: GitTreeResponse = await resp.json();
      console.log('[fetchFileTree] Received tree items. Count:', data.tree.length);
      setTreeItems(data.tree);
    } catch (err) {
      console.error('[fetchFileTree] Error:', err);
    }
  }

  // ============================================
  // Build nested tree from the flat array
  // ============================================
  useEffect(() => {
    if (treeItems.length === 0) {
      setNestedTree([]);
      return;
    }
    console.log('[DocumentPage] Building nested tree for', treeItems.length, 'items.');
    const root = buildNestedTree(treeItems);
    setNestedTree(root);
  }, [treeItems]);

  // ============================================
  // Branch select change
  // ============================================
  const handleBranchChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newBranch = e.target.value;
    setSelectedBranch(newBranch);
    const branchObj = branches.find(b => b.name === newBranch);
    if (branchObj) {
      console.log('[handleBranchChange] Switching to branch:', newBranch);
      fetchFileTree(repoFullName, token, branchObj.commit.sha);
    }
  };

  // ============================================
  // Editor changes -> auto-save local
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
      console.log('[handleDocChange] Autosaved docContent to localStorage.');
    }, 1000);
  };

  // ============================================
  // Utility: get a file's SHA from GitHub
  // ============================================
  const getFileSha = useCallback(
      async (path: string) => {
        if (!repoFullName || !token || !selectedBranch) {
          console.warn('[getFileSha] Missing required info. repoFullName:', repoFullName, 'token:', token, 'branch:', selectedBranch);
          return null;
        }
        console.log('[getFileSha] Checking SHA for file:', path);
        const [owner, repoName] = repoFullName.split('/');
        const url = `https://api.github.com/repos/${owner}/${repoName}/contents/${path}?ref=${selectedBranch}`;
        try {
          const resp = await fetch(url, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!resp.ok) {
            console.error('[getFileSha] Failed to fetch file SHA. Status:', resp.status, resp.statusText);
            return null;
          }
          const data = await resp.json();
          console.log('[getFileSha] Found SHA for', path, '=>', data.sha);
          return data.sha;
        } catch (err) {
          console.error('[getFileSha] Error fetching file SHA:', err);
          return null;
        }
      },
      [repoFullName, token, selectedBranch]
  );

  // ============================================
  // Commit docContent to GitHub
  // ============================================
  const handleCommitToGithub = useCallback(async () => {
    if (!repoFullName || !token || !selectedBranch) {
      console.warn('[handleCommitToGithub] Missing required data:', { repoFullName, token, selectedBranch });
      return;
    }

    const path = 'README.md';
    const sha = await getFileSha(path); // possibly null if no existing README
    console.log('[handleCommitToGithub] Attempting to commit to', path, 'with existing SHA:', sha);

    const base64Content = btoa(docContent || '');
    const message = `Update doc from DocumentPage on branch ${selectedBranch}`;

    try {
      const [owner, repoName] = repoFullName.split('/');
      const url = `https://api.github.com/repos/${owner}/${repoName}/contents/${path}?ref=${selectedBranch}`;
      console.log('[handleCommitToGithub] PUT =>', url);

      const resp = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          Accept: 'application/vnd.github+json',
        },
        body: JSON.stringify({
          message,
          content: base64Content,
          sha: sha || undefined,
        }),
      });

      if (!resp.ok) {
        const msg = await resp.text();
        console.error('[handleCommitToGithub] GitHub commit failed:', msg);
        throw new Error(`GitHub commit failed: ${msg}`);
      }

      alert('Committed to GitHub successfully!');
      console.log('[handleCommitToGithub] Success. Reloading page in 2s...');
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      console.error('[handleCommitToGithub] Error:', err);
      alert(`Error committing to GitHub: ${err}`);
    }
  }, [docContent, repoFullName, selectedBranch, token, getFileSha]);

  // ============================================
  // Go back
  // ============================================
  const goBack = () => {
    navigate(-1);
  };

  // ============================================
  // Analyze repo -> calls your Node server
  // ============================================
  const handleGenerateUserManual = async () => {
    if (!repoFullName || !token || !selectedBranch) {
      console.warn('[handleGenerateUserManual] Missing info =>', { repoFullName, token, selectedBranch });
      return;
    }
    setIsGenerating(true);
    setIsComplete(false);

    console.log('[handleGenerateUserManual] POSTing to /documents/analyze-repository with:', {
      repoFullName,
      token,
      selectedBranch
    });

    try {
      const response = await fetch('http://localhost:5001/documents/analyze-repository', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // No local JWT needed here
        },
        body: JSON.stringify({
          repoFullName,
          token,
          selectedBranch,
        }),
      });

      console.log('[handleGenerateUserManual] Response status:', response.status, response.statusText);
      if (!response.ok) {
        const errText = await response.text();
        console.error('[handleGenerateUserManual] Failed to generate user manual. Body:', errText);
        throw new Error('Failed to generate user manual');
      }

      const data = await response.json();
      console.log('[handleGenerateUserManual] user manual generated:', data);

      let finalText = '';
      if (typeof data.userManual === 'string') {
        finalText = data.userManual;
      } else if (data.userManual && typeof data.userManual.userManual === 'string') {
        finalText = data.userManual.userManual;
      } else {
        finalText = JSON.stringify(data, null, 2);
      }

      setDocContent(finalText);
      setIsComplete(true);
    } catch (err) {
      console.error('[handleGenerateUserManual] Error generating user manual:', err);
      alert('Error generating user manual. Check console for details.');
      setIsGenerating(false);
    }
  };

  const handleCloseModal = () => {
    setIsGenerating(false);
  };

  // ============================================
  // Render
  // ============================================
  return (
      <>
        {/* NAVBAR */}
        <nav className="navbar">
          <a href="/" className="brand" style={{ textDecoration: 'none', color: 'grey' }}>
            echo
          </a>
          <div className="nav-right">
            {loggedInUser ? (
                <p>Signed in as: {loggedInUser}</p>
            ) : (
                <p>Not signed in</p>
            )}
            <button onClick={toggleDarkMode} style={{ marginLeft: '1rem', cursor: 'pointer' }}>
              {isDarkMode ? 'Light Mode' : 'Dark Mode'}
            </button>
          </div>
        </nav>

        <div className="doc-container">
          {/* ProgressModal for “Generate User Manual” */}
          <ProgressModal
              isVisible={isGenerating}
              isComplete={isComplete}
              onClose={handleCloseModal}
          />

          {/* LEFT PANE: Repository Tree */}
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

          {/* RIGHT PANE: Documentation Editor */}
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
                <div className="doc-preview">
                  {docContent}
                </div>
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

/* Build a nested tree structure out of the flat array from GitHub’s “trees” API */
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
    const extension = fileName.split('.').pop()?.toLowerCase();
    if (extension === 'md') return <FiFileText />;
    if (extension === 'js') return <FaJsSquare />;
    if (extension === 'ts') return <FaJsSquare />;
    if (extension === 'json') return <FiFile />;
    if (extension === 'txt') return <FiFileText />;
    if (extension === 'css') return <FaCss3Alt />;
    if (extension === 'html') return <FaHtml5 />;
    if (/(png|jpg|jpeg|svg)/.test(extension || '')) return <IoIosImage />;
    return <FiFile />;
  };

  if (node.type === 'file') {
    const fileIcon = getFileIcon(node.name);
    return (
        <li className="file-item">
          <span className="file-icon">{fileIcon}</span> {node.name}
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
