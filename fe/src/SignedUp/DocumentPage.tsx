import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Cookies from 'js-cookie';         // For saving dark-mode preference
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

const DocumentPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  // Logged in user
  const [loggedInUser, setLoggedInUser] = useState<string | null>(null);

  // GitHub-related state
  const [token, setToken] = useState('');
  const [repoFullName, setRepoFullName] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [treeItems, setTreeItems] = useState<TreeItem[]>([]);
  const [nestedTree, setNestedTree] = useState<(FolderNode | FileNode)[]>([]);

  // Doc editor
  const [docContent, setDocContent] = useState<string>('');
  const [isAutosaved, setIsAutosaved] = useState(false);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Progress modal
  const [isGenerating, setIsGenerating] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  // Dark mode
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Preview mode
  const [isPreview, setIsPreview] = useState(false);

  // **Dropdown** for user profile menu
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  /**
   *  Simulated properties
   *  In reality, you'd fetch these from your server or user record:
   *  e.g. GET /user/me => { hasSubscription: true, apiKeyOnFile: false }
   */
  const [hasSubscription, setHasSubscription] = useState<boolean>(false);
  const [apiKeyOnFile, setApiKeyOnFile] = useState<boolean>(false);

  /**
   *  Show/hide the "Select plan or add API key" modal
   */
  const [showPlanModal, setShowPlanModal] = useState(false);

  useEffect(() => {
    // 1) Check for dark-mode cookie
    const darkCookie = Cookies.get('darkMode');
    if (darkCookie === 'true') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark-mode');
    }

    // 2) Parse local JWT for user
    const storedToken = localStorage.getItem('myAppToken');
    if (storedToken) {
      const decoded = parseJwt(storedToken);
      if (decoded?.username) {
        setLoggedInUser(decoded.username);
      }
    }

    // 3) Parse ?repo=?token= from URL
    const params = new URLSearchParams(location.search);
    const repo = params.get('repo') || '';
    const tk = params.get('token') || '';

    setRepoFullName(repo);
    setToken(tk);

    // 4) Fetch branches if we have a GitHub token + repo
    if (repo && tk) {
      fetchBranches(repo, tk);
    }

    // 5) Restore doc content if previously saved
    const savedDoc = localStorage.getItem('docContent');
    if (savedDoc) {
      setDocContent(savedDoc);
    }

    // 6) In a real app, we might call an endpoint like GET /user/me
    //    to get these values instead of using local state:
    //    setHasSubscription(userData.hasSubscription);
    //    setApiKeyOnFile(userData.apiKeyOnFile);
  }, [location.search]);

  /* Toggle Dark Mode */
  const toggleDarkMode = () => {
    if (isDarkMode) {
      document.documentElement.classList.remove('dark-mode');
      Cookies.set('darkMode', 'false');
    } else {
      document.documentElement.classList.add('dark-mode');
      Cookies.set('darkMode', 'true');
    }
    setIsDarkMode(!isDarkMode);
  };

  /* Toggle Editor vs. Preview */
  const handlePreviewToggle = () => {
    setIsPreview(!isPreview);
  };

  /* Toggle the user profile menu dropdown */
  const toggleProfileMenu = () => {
    setIsProfileMenuOpen(!isProfileMenuOpen);
  };

  /* A simple logout function */
  const handleLogout = () => {
    localStorage.removeItem('myAppToken');
    setLoggedInUser(null);
    setIsProfileMenuOpen(false);
    navigate('/');
  };

  /*
   * Called in handleGenerateUserManual if user doesn't have subscription nor an API key
   * Just show a modal giving them the 2 choices:
   * 1) pay subscription
   * 2) provide an API key
   */
  const openPlanModal = () => {
    setShowPlanModal(true);
  };

  const closePlanModal = () => {
    setShowPlanModal(false);
  };

  /**
   * "Subscribe" button
   * In a real scenario, you'd call /billing/subscribe or something,
   * then the server updates the user.
   * Here we just simulate:
   */
  const handleSubscribePlan = () => {
    alert('You are now subscribed at $10/month!');
    setHasSubscription(true);
    setShowPlanModal(false);
  };

  /**
   * "Save API Key" flow
   * In a real scenario, you'd call /api/user/set-chatgpt-key
   * with encryption on the server.
   */
  const [tempApiKey, setTempApiKey] = useState('');
  const handleSaveApiKey = () => {
    if (!tempApiKey) {
      alert('Please enter a valid API key!');
      return;
    }
    // In a real scenario: fetch POST to your server to store key encrypted
    alert('API key saved securely on the server.');
    setApiKeyOnFile(true);
    setTempApiKey('');
    setShowPlanModal(false);
  };

  /* Fetch branches from GitHub */
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

      // default to "main" if present, else first
      if (data.length > 0) {
        const main = data.find(b => b.name === 'main') || data[0];
        setSelectedBranch(main.name);
        fetchFileTree(repo, accessToken, main.commit.sha);
      }
    } catch (err) {
      console.error('Error fetching branches:', err);
    }
  }

  /* Fetch entire file tree from GitHub */
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

  useEffect(() => {
    if (treeItems.length === 0) {
      setNestedTree([]);
      return;
    }
    const root = buildNestedTree(treeItems);
    setNestedTree(root);
  }, [treeItems]);

  const handleBranchChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newBranch = e.target.value;
    setSelectedBranch(newBranch);
    const br = branches.find(b => b.name === newBranch);
    if (br) {
      fetchFileTree(repoFullName, token, br.commit.sha);
    }
  };

  /* Auto-save doc content to localStorage */
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

  /* Get a file’s SHA from GitHub */
  const getFileSha = useCallback(
      async (path: string) => {
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
      },
      [repoFullName, token, selectedBranch]
  );

  /* Commit docContent to GitHub */
  const handleCommitToGithub = useCallback(async () => {
    if (!repoFullName || !token || !selectedBranch) return;

    const path = 'README.md';
    const sha = await getFileSha(path);

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

  /* Go back in browser history */
  const goBack = () => {
    navigate(-1);
  };

  /*
   * Generate user manual
   * We check if the user has a subscription or an API key.
   * If not, show the "Select Plan or Provide Key" modal.
   */
  const handleGenerateUserManual = async () => {
    if (!repoFullName || !token || !selectedBranch) return;

    // 1) Check subscription or personal key
    if (!hasSubscription && !apiKeyOnFile) {
      // Show the user the plan modal
      openPlanModal();
      return;
    }

    // 2) If we do have sub or key, proceed normally
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
            {loggedInUser ? (
                <div className="user-profile-container" onClick={toggleProfileMenu}>
                  <img
                      src="https://via.placeholder.com/32?text=User"
                      alt="User Profile"
                      className="user-avatar"
                  />
                  {isProfileMenuOpen && (
                      <div className="profile-dropdown" onClick={(e) => e.stopPropagation()}>
                        <div
                            className="profile-dropdown-item"
                            onClick={() => {
                              setIsProfileMenuOpen(false);
                              navigate('/dashboard');
                            }}
                        >
                          Dashboard
                        </div>
                        <div
                            className="profile-dropdown-item"
                            onClick={() => {
                              setIsProfileMenuOpen(false);
                              navigate('/document-page');
                            }}
                        >
                          My Documents
                        </div>
                        <div
                            className="profile-dropdown-item"
                            onClick={() => {
                              setIsProfileMenuOpen(false);
                              navigate('/settings');
                            }}
                        >
                          Settings
                        </div>
                        <div
                            className="profile-dropdown-item"
                            onClick={handleLogout}
                        >
                          Logout
                        </div>
                      </div>
                  )}
                </div>
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

        {/*
        This modal appears if user has neither subscription nor an API key.
        They can subscribe for $10 or provide an API key to store.
      */}
        {showPlanModal && (
            <div className="modal-overlay" onClick={closePlanModal}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <h2>Select a Plan or Provide Your API Key</h2>
                <p>To use AI-based manual generation, you need either:</p>
                <ul>
                  <li>A monthly subscription ($10/mo)</li>
                  <li>Or your own ChatGPT API key (stored securely)</li>
                </ul>
                <button className="btn" onClick={handleSubscribePlan}>
                  Subscribe for $10/month
                </button>

                <hr />

                <p style={{ marginTop: '1rem' }}>
                  Or enter your own ChatGPT API key below:
                </p>
                <input
                    type="text"
                    placeholder="sk-..."
                    value={tempApiKey}
                    onChange={(e) => setTempApiKey(e.target.value)}
                    style={{
                      width: '100%',
                      marginBottom: '0.5rem',
                      padding: '0.4rem',
                      boxSizing: 'border-box'
                    }}
                />
                <button className="btn" onClick={handleSaveApiKey}>
                  Save API Key
                </button>

                <button
                    className="btn"
                    style={{ marginTop: '1rem' }}
                    onClick={closePlanModal}
                >
                  Close
                </button>
              </div>
            </div>
        )}
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

/* Recursive insertion function */
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
      });
    }
    return;
  }

  let folderNode = currentLevel.find(
      node => node.type === 'folder' && node.name === first
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

/* A simple component to display the file/folder tree */
function FileTree({ nodes }: { nodes: (FolderNode | FileNode)[] }) {
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

/* Render each file/folder node */
function FileNodeUI({ node }: { node: FolderNode | FileNode }) {
  const [isOpen, setIsOpen] = useState(false);

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
