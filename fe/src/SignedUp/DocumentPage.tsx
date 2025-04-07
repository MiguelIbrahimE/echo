import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Global + doc page CSS
import "../global-css/navbar.css";
import "./CSS/DocPage.css";

import { FiFileText, FiFile, FiFolder } from 'react-icons/fi';
import { FaJsSquare, FaCss3Alt, FaHtml5 } from 'react-icons/fa';
import { IoIosImage } from 'react-icons/io';
import ProgressModal from './ProgressModal';

/* ------------------ TYPES/INTERFACES ------------------ */
interface JwtPayload {
  username?: string;
  // Add other JWT fields if needed
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

/* ------------------ COMPONENT ------------------ */
const DocumentPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // 1) Check who’s logged in by reading localStorage token
  const [loggedInUser, setLoggedInUser] = useState<string | null>(null);

  // 2) GitHub-related state
  const [token, setToken] = useState('');
  const [repoFullName, setRepoFullName] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [treeItems, setTreeItems] = useState<TreeItem[]>([]);
  const [nestedTree, setNestedTree] = useState<(FolderNode | FileNode)[]>([]);

  // 3) Editor
  const [docContent, setDocContent] = useState<string>('');
  const [isAutosaved, setIsAutosaved] = useState(false);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 4) Progress modal for “Generate User Manual”
  const [isGenerating, setIsGenerating] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  // 5) Dark mode
  const [isDarkMode, setIsDarkMode] = useState(false);

  /* --------------------------------------------------
   *  useEffect: on mount, parse the token & load data
   * --------------------------------------------------*/
  useEffect(() => {
    // 1) Parse local JWT to see if we have a logged-in user
    const storedToken = localStorage.getItem('myAppToken');
    if (storedToken) {
      const decoded = parseJwt(storedToken);
      if (decoded?.username) {
        setLoggedInUser(decoded.username);
      }
    }

    // 2) Also see if we have a userEmail in localStorage, if needed
    //    (You can skip if your JWT holds the username.)
    // const storedEmail = localStorage.getItem('userEmail');
    // setUserEmail(storedEmail);

    // 3) Parse ?repo=?token= from URL
    const params = new URLSearchParams(location.search);
    const repo = params.get('repo') || '';
    const tk = params.get('token') || '';

    setRepoFullName(repo);
    setToken(tk);

    // 4) If we have a GitHub token + repo, fetch branch data
    if (repo && tk) {
      fetchBranches(repo, tk);
    }

    // 5) Restore doc content if previously saved
    const savedDoc = localStorage.getItem('docContent');
    if (savedDoc) {
      setDocContent(savedDoc);
    }
  }, [location.search]);

  /* --------------------------------------
   * Toggle entire page between dark/light
   * --------------------------------------*/
  const toggleDarkMode = () => {
    const html = document.documentElement;
    if (isDarkMode) {
      html.classList.remove("dark-mode");
    } else {
      html.classList.add("dark-mode");
    }
    setIsDarkMode(!isDarkMode);
  };

  /* --------------------------------------------------
   * Fetch all branches for the chosen repo
   * --------------------------------------------------*/
  async function fetchBranches(repo: string, accessToken: string) {
    try {
      const [owner, repoName] = repo.split('/');
      const url = `https://api.github.com/repos/${owner}/${repoName}/branches`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!resp.ok) {
        throw new Error('Could not fetch branches');
      }
      const data: Branch[] = await resp.json();
      setBranches(data);

      // default to "main" if present, else the first branch
      if (data.length > 0) {
        const main = data.find(b => b.name === 'main') || data[0];
        setSelectedBranch(main.name);
        fetchFileTree(repo, accessToken, main.commit.sha);
      }
    } catch (err) {
      console.error('Error fetching branches:', err);
    }
  }

  /* --------------------------------------------------
   * Fetch entire file tree from GitHub
   * --------------------------------------------------*/
  async function fetchFileTree(repo: string, accessToken: string, commitSha: string) {
    try {
      const [owner, repoName] = repo.split('/');
      const url = `https://api.github.com/repos/${owner}/${repoName}/git/trees/${commitSha}?recursive=1`;
      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!resp.ok) {
        throw new Error('Could not fetch file tree');
      }
      const data: GitTreeResponse = await resp.json();
      setTreeItems(data.tree);
    } catch (err) {
      console.error('Error fetching file tree:', err);
    }
  }

  /* --------------------------------------------------
   * Build nested tree from the flat GitHub tree items
   * --------------------------------------------------*/
  useEffect(() => {
    if (treeItems.length === 0) {
      setNestedTree([]);
      return;
    }
    const root = buildNestedTree(treeItems);
    setNestedTree(root);
  }, [treeItems]);

  /* --------------------------------------------------
   * When branch changes in the <select>
   * --------------------------------------------------*/
  const handleBranchChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newBranch = e.target.value;
    setSelectedBranch(newBranch);
    const br = branches.find(b => b.name === newBranch);
    if (br) {
      fetchFileTree(repoFullName, token, br.commit.sha);
    }
  };

  /* --------------------------------------------------
   * Auto-save doc content to localStorage after 1s
   * --------------------------------------------------*/
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

  /* --------------------------------------------------
   * Utility: fetch a file’s SHA from GitHub
   * --------------------------------------------------*/
  const getFileSha = useCallback(async (path: string) => {
    if (!repoFullName || !token || !selectedBranch) return null;
    const [owner, repoName] = repoFullName.split('/');
    const url = `https://api.github.com/repos/${owner}/${repoName}/contents/${path}?ref=${selectedBranch}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      console.error('Failed to fetch file SHA');
      return null;
    }
    const data = await resp.json();
    return data.sha;
  }, [repoFullName, token, selectedBranch]);

  /* --------------------------------------------------
   * Commit docContent to GitHub (PUT to /contents)
   * --------------------------------------------------*/
  const handleCommitToGithub = useCallback(async () => {
    if (!repoFullName || !token || !selectedBranch) return;

    const path = 'README.md'; // For example, always committing to README
    const sha = await getFileSha(path); // might be null if file doesn’t exist

    const base64Content = btoa(docContent || '');
    const message = `Update doc from DocumentPage on branch ${selectedBranch}`;

    try {
      const [owner, repoName] = repoFullName.split('/');
      const url = `https://api.github.com/repos/${owner}/${repoName}/contents/${path}?ref=${selectedBranch}`;

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
        throw new Error(`GitHub commit failed: ${msg}`);
      }

      alert('Committed to GitHub successfully!');
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      console.error('Error committing to GitHub:', err);
      alert(`Error committing to GitHub: ${err}`);
    }
  }, [docContent, repoFullName, selectedBranch, token, getFileSha]);

  /* --------------------------------------------------
   * Go back in the browser’s history
   * --------------------------------------------------*/
  const goBack = () => {
    navigate(-1);
  };

  /* --------------------------------------------------
   * Generate user manual from the backend
   * --------------------------------------------------*/
  const handleGenerateUserManual = async () => {
    if (!repoFullName || !token || !selectedBranch) return;
    setIsGenerating(true);
    setIsComplete(false);

    try {
      const response = await fetch('http://localhost:5001/documents/analyze-repository', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ repoFullName, token, selectedBranch }),
      });

      if (!response.ok) {
        console.error('Failed to generate user manual:', response.statusText);
        throw new Error('Failed to generate user manual');
      }

      const data = await response.json();
      console.log('User manual generated:', data);

      // The server might return userManual in different shapes. Adjust as needed:
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
      console.error('Error generating user manual:', err);
      alert('Error generating user manual. Check console for details.');
      setIsGenerating(false);
    }
  };

  const handleCloseModal = () => {
    setIsGenerating(false);
  };

  /* --------------------------------------------------
   * Render
   * --------------------------------------------------*/
  return (
      <>
        {/* NAVBAR */}
        <nav className="navbar">
          {/* Brand name → home link */}
          <a
              href="/"
              className="brand"
              style={{ textDecoration: 'none', color: 'grey' }}
          >
            echo
          </a>

          <div className="nav-right">
            {/* Show “Signed in as: ____” if we have a user, otherwise “Not signed in” */}
            {loggedInUser ? (
                <p>Signed in as: {loggedInUser}</p>
            ) : (
                <p>Not signed in</p>
            )}

            {/* Dark Mode Toggle Button */}
            <button
                onClick={toggleDarkMode}
                style={{ marginLeft: '1rem', cursor: 'pointer' }}
            >
              {isDarkMode ? 'Light Mode' : 'Dark Mode'}
            </button>
          </div>
        </nav>

        {/* doc-container: two-pane layout */}
        <div className="doc-container">
          {/* ProgressModal (for “Generate User Manual” spinner) */}
          <ProgressModal
              isVisible={isGenerating}
              isComplete={isComplete}
              onClose={handleCloseModal}
          />

          {/* LEFT PANE = Repository Tree */}
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

          {/* RIGHT PANE = Documentation Editor */}
          <div className="doc-right-pane">
            <h2>Documentation Editor</h2>
            <textarea
                className="doc-textarea"
                placeholder="Type your doc here..."
                value={docContent}
                onChange={handleDocChange}
            />
            <div className="editor-footer">
              <button className="btn" onClick={goBack}>Back</button>
              {isAutosaved ? (
                  <span className="autosave-status">Autosaved</span>
              ) : (
                  <span className="autosave-status typing">Typing...</span>
              )}
              <button className="btn commit-btn" onClick={handleCommitToGithub}>
                Commit to GitHub
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

/*
 * Build a nested tree structure out of the flat array from GitHub’s “trees” API
 */
function buildNestedTree(treeItems: TreeItem[]): (FolderNode | FileNode)[] {
  const rootNodes: (FolderNode | FileNode)[] = [];

  for (const item of treeItems) {
    const parts = item.path.split('/');
    insertPath(rootNodes, parts, item);
  }
  return rootNodes;
}

/*
 * Recursive insertion function
 */
function insertPath(
    currentLevel: (FolderNode | FileNode)[],
    parts: string[],
    item: TreeItem
) {
  const [first, ...rest] = parts;

  // If no more parts left, this is the final node
  if (rest.length === 0) {
    if (item.type === 'blob') {
      // It's a file
      currentLevel.push({
        name: first,
        type: 'file',
        path: item.path,
        sha: item.sha,
      });
    } else {
      // It's a folder but has no children? (Rare case)
      currentLevel.push({
        name: first,
        type: 'folder',
        path: item.path,
        sha: item.sha,
        children: [],
      });
    }
    return;
  }

  // We still have sub-parts, so it must be inside a folder
  let folderNode = currentLevel.find(
      node => node.type === 'folder' && node.name === first
  ) as FolderNode | undefined;

  // If the folder doesn’t exist yet, create it
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

  // Recurse deeper
  insertPath(folderNode.children, rest, item);
}

/*
 * A simple component to display the file/folder tree
 */
function FileTree({ nodes }: { nodes: (FolderNode | FileNode)[] }) {
  // Sort folders above files
  nodes.sort((a, b) => {
    if (a.type === 'folder' && b.type === 'file') return -1;
    if (a.type === 'file' && b.type === 'folder') return 1;
    return a.name.localeCompare(b.name);
  });

  return (
      <ul className="file-tree">
        {nodes.map(node => (
            <FileNodeUI key={`${node.type}-${node.path || node.name}`} node={node} />
        ))}
      </ul>
  );
}

/*
 * Render each file/folder node
 */
function FileNodeUI({ node }: { node: FolderNode | FileNode }) {
  const [isOpen, setIsOpen] = useState(false);

  // You can get fancy with file icons
  const getFileIcon = (fileName: string) => {
    const extension = fileName.split('.').pop()?.toLowerCase();
    if (extension === 'md') return <FiFileText />;
    if (extension === 'js') return <FaJsSquare color="yellow" />;
    if (extension === 'ts') return <FaJsSquare color="blue" />;
    if (extension === 'json') return <FiFile color="orange" />;
    if (extension === 'txt') return <FiFileText />;
    if (extension === 'css') return <FaCss3Alt color="blue" />;
    if (extension === 'html') return <FaHtml5 color="red" />;
    if (/(png|jpg|jpeg|svg)/.test(extension || '')) return <IoIosImage color="purple" />;
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
            <span className="folder-icon">
            <FiFolder color="brown" />
          </span>
            {node.name}
          </div>
          {isOpen && (
              <ul className="folder-children">
                {node.children.map(child => (
                    <FileNodeUI
                        key={`${child.type}-${child.path || child.name}`}
                        node={child}
                    />
                ))}
              </ul>
          )}
        </li>
    );
  }
}

export default DocumentPage;
