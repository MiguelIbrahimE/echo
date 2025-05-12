/* =========================================================
   App.tsx – landing page, auth modals, recent docs
   (This version is the same as the previous one, as it's correctly
    set up for initiating OAuth via backend and listening for auth changes.
    The described problem likely lies in the OAuth callback handling
    or LinkGithubRepo.tsx logic AFTER App.tsx has done its part.)
========================================================= */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMenu } from 'react-icons/fi';
import { FaGithub } from 'react-icons/fa';
import './App.css';
import './global-css/navbar.css';

interface ApiResponse {
    message?: string;
    token?: string;
    username?: string;
}
interface DocBrief {
    id: number;
    title: string;
    repo_full_name: string | null;
    branch_name: string | null;
    updated_at: string;
}

/* ---------------- helpers ---------------- */
function parseJwt(token: string) {
    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch (e) {
        console.error("Failed to parse JWT:", e);
        return null;
    }
}

/* ================= component ============== */
const App: React.FC = () => {
    const navigate = useNavigate();

    /* ---------- auth / UI state ---------- */
    const [loggedInUser, setLoggedInUser] = useState<string | null>(null);
    const [isMenuOpen, setIsMenuOpen]     = useState(false);
    const [recentDocs, setRecentDocs]     = useState<DocBrief[]>([]);

    /* ---------- modal state (signup / login) ---------- */
    const [isSignUpOpen, setIsSignUpOpen] = useState(false);
    const [isLoginOpen, setIsLoginOpen]   = useState(false);

    /* ---------- sign‑up fields ---------- */
    const [email, setEmail]                         = useState('');
    const [username, setUsername]                   = useState('');
    const [password, setPassword]                   = useState('');
    const [confirmPassword, setConfirmPassword]     = useState('');

    const [emailError, setEmailError]               = useState('');
    const [usernameError, setUsernameError]         = useState('');
    const [passwordError, setPasswordError]         = useState('');
    const [confirmPasswordError, setConfirmPasswordError] = useState('');

    /* password criteria flags */
    const [hasMinLength, setHasMinLength] = useState(false);
    const [hasUppercase, setHasUppercase] = useState(false);
    const [hasNumber, setHasNumber]       = useState(false);
    const [hasSpecialChar, setHasSpecialChar] = useState(false);

    /* ---------- login fields ---------- */
    const [loginUsername, setLoginUsername] = useState('');
    const [loginPassword, setLoginPassword] = useState('');

    const handleLogout = useCallback(() => {
        localStorage.removeItem('myAppToken');
        localStorage.removeItem('ghToken'); // Also clear GitHub token if stored
        window.dispatchEvent(new Event("storage")); // Trigger auth check to update loggedInUser
        setIsMenuOpen(false);
        navigate('/');
    }, [navigate]);

    /* =====================================================
       1)  Check JWT on mount & listen for storage changes (for OAuth callback)
           This is crucial for recognizing login after OAuth.
    ===================================================== */
    useEffect(() => {
        const checkAuth = () => {
            const token = localStorage.getItem('myAppToken');
            if (token) {
                const decoded = parseJwt(token);
                if (decoded?.username) {
                    setLoggedInUser(decoded.username);
                } else {
                    console.warn("Invalid token structure found in localStorage. Logging out.");
                    localStorage.removeItem('myAppToken'); // Ensure bad token is removed
                    setLoggedInUser(null); // Update state to reflect logged out
                }
            } else {
                setLoggedInUser(null);
            }
        };

        checkAuth(); // Initial check

        window.addEventListener('storage', checkAuth);
        return () => {
            window.removeEventListener('storage', checkAuth);
        };
    }, []);


    /* =====================================================
       2)  Fetch recent documents once we know user is logged
    ===================================================== */
    useEffect(() => {
        if (!loggedInUser) {
            setRecentDocs([]); // Clear docs if user logs out
            return;
        }
        (async () => {
            try {
                const jwt = localStorage.getItem('myAppToken');
                if (!jwt) {
                    // This case means loggedInUser was set, but token disappeared.
                    // The 'storage' event listener should ideally catch this,
                    // but as a fallback:
                    console.warn("loggedInUser is set, but no token in localStorage. Forcing logout.");
                    handleLogout(); // This will trigger a state update and re-evaluation.
                    return;
                }

                const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/documents/recent`, {
                    headers: { Authorization: `Bearer ${jwt}` },
                });
                if (res.ok) {
                    const docsData: DocBrief[] = await res.json();
                    setRecentDocs(docsData);
                } else {
                    console.error('Error fetching recent docs, status:', res.status);
                    if (res.status === 401 || res.status === 403) {
                        alert("Your session may have expired. Please log in again.");
                        handleLogout();
                    } else {
                        setRecentDocs([]);
                    }
                }
            } catch (e) {
                console.error('Exception while fetching recent docs:', e);
                alert("Could not fetch recent documents. Please try again later.");
                setRecentDocs([]);
            }
        })();
    }, [loggedInUser, handleLogout]);

    /* =====================================================
       Validation helpers
    ===================================================== */
    const validateEmail = (val: string) => {
        setEmail(val);
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        setEmailError(re.test(val) ? '' : 'Invalid email format');
    };
    const validateUsername = (val: string) => {
        setUsername(val);
        const re = /^[A-Za-z0-9._]+$/;
        if (val.trim().length === 0) setUsernameError('Username is required');
        else if (!re.test(val)) setUsernameError('Only letters, digits, _ and . allowed');
        else if (val.trim().length < 3) setUsernameError('At least 3 characters');
        else setUsernameError('');
    };
    const handlePasswordChange = (val: string) => {
        setPassword(val);
        const minLength = val.length >= 8;
        const upper = /[A-Z]/.test(val);
        const num = /[0-9]/.test(val);
        const special = /[^A-Za-z0-9]/.test(val);
        setHasMinLength(minLength);
        setHasUppercase(upper);
        setHasNumber(num);
        setHasSpecialChar(special);
        const strong = minLength && upper && num && special;
        setPasswordError(val && !strong ? 'Password is not strong enough' : '');
    };
    const handleConfirmPassword = (val: string) => {
        setConfirmPassword(val);
        setConfirmPasswordError(val && val !== password ? 'Passwords do not match' : '');
    };

    /* =====================================================
       OAuth Initiators (Redirect to Backend)
       These correctly send the user to your backend, which then redirects to GitHub.
    ===================================================== */
    // const handleGoogleSignIn = () => { // If you re-add Google Sign In
    //     window.location.href = `${import.meta.env.VITE_API_BASE_URL}/auth/google`;
    // };

    const handleGithubOAuthSignIn = () => {
        window.location.href = `${import.meta.env.VITE_API_BASE_URL}/auth/github`;
    };


    /* =====================================================
       Signup / Login API handlers
    ===================================================== */
    const performFullFormValidation = () => {
        // Ensure validation functions are called for all fields before checking errors
        validateUsername(username); // ensure state is current before checking usernameError
        validateEmail(email);
        handlePasswordChange(password);
        handleConfirmPassword(confirmPassword);

        // Check if any field is empty after trimming (except password fields which are checked by length)
        if (!email.trim() || !username.trim() || !password || !confirmPassword) {
            return false; // One of the required fields is empty
        }
        // Check for any existing error messages
        if (emailError || usernameError || passwordError || confirmPasswordError) {
            return false;
        }
        // Check password criteria
        if (!(hasMinLength && hasUppercase && hasNumber && hasSpecialChar)) {
            return false;
        }
        return true;
    };

    const handleSignUpSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!performFullFormValidation()) { // Call this to ensure all states are up-to-date for the check
            alert('Please correct the errors in the form and ensure all fields are filled correctly and password meets criteria.');
            return;
        }

        try {
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, username, password }),
            });
            const data: ApiResponse = await res.json().catch(() => ({ message: "Invalid JSON response from server." }));
            if (res.ok && data.token && data.username) {
                localStorage.setItem('myAppToken', data.token);
                window.dispatchEvent(new Event("storage")); // Crucial for checkAuth to run
                alert('Sign‑up successful!');
                handleCloseSignUp();
                navigate('/link-github');
            } else {
                alert(`Sign‑up failed: ${data.message || 'Unknown error (status: ' + res.status + ')' }`);
            }
        } catch (err) {
            console.error("Signup submission error:", err);
            alert('Server error during sign-up. Please try again.');
        }
    };

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!loginUsername || !loginPassword) {
            alert('Username/Email and password are required.');
            return;
        }

        try {
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: loginUsername, password: loginPassword }),
            });
            const data: ApiResponse = await res.json().catch(() => ({ message: "Invalid JSON response from server." }));

            if (res.ok && data.token && data.username) {
                localStorage.setItem('myAppToken', data.token);
                window.dispatchEvent(new Event("storage")); // Crucial for checkAuth to run
                alert('Logged in successfully!');
                handleCloseLogin();
                navigate('/documents');
            } else {
                alert(`Login failed: ${data.message || 'Unknown error (status: ' + res.status + ')'}`);
            }
        } catch (err) {
            console.error("Login submission error:", err);
            alert('Server error during login. Please try again.');
        }
    };

    /* =====================================================
       Navbar & menu helpers
    ===================================================== */
    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
    const handleMenuClick = (path: string) => {
        navigate(path);
        setIsMenuOpen(false);
    };

    /* =====================================================
       Modal toggles & reset
    ===================================================== */
    const resetSignUpForm = () => {
        setEmail(''); setUsername(''); setPassword(''); setConfirmPassword('');
        setEmailError(''); setUsernameError(''); setPasswordError(''); setConfirmPasswordError('');
        setHasMinLength(false); setHasUppercase(false); setHasNumber(false); setHasSpecialChar(false);
    };
    const resetLoginForm = () => {
        setLoginUsername(''); setLoginPassword('');
    };

    const handleOpenSignUp = () => { resetLoginForm(); setIsLoginOpen(false); setIsSignUpOpen(true); };
    const handleCloseSignUp = () => { setIsSignUpOpen(false); resetSignUpForm(); };

    const handleOpenLogin = () => { resetSignUpForm(); setIsSignUpOpen(false); setIsLoginOpen(true); };
    const handleCloseLogin = () => { setIsLoginOpen(false); resetLoginForm(); };


    /* =====================================================
       Recently‑edited open helper
    ===================================================== */
    const openDocument = (doc: DocBrief) => {
        if (!doc.repo_full_name) {
            alert('This document does not have a linked GitHub repository.');
            return;
        }
        // With a backend-centric GitHub token flow, `ghToken` in localStorage or URL becomes less relevant here.
        // Navigation to the document page should ideally just use IDs or repo names,
        // and the DocumentPage component would fetch its content using the app's JWT.
        navigate(`/document-page?repo=${encodeURIComponent(doc.repo_full_name)}&branch=${doc.branch_name || 'main'}`);
    };

    /* =====================================================
       Render
    ===================================================== */
    return (
        <div className="landing-page">
            {/* ---------- Navbar ---------- */}
            <header className="navbar">
                <div className="nav-left"><h1 className="brand" onClick={() => navigate('/')} style={{cursor: 'pointer'}}>echo</h1></div>
                <div className="nav-right">
                    {loggedInUser ? (
                        <div className="nav-container">
                            <span style={{marginRight: "10px", cursor: 'default'}}>Hi, {loggedInUser}!</span>
                            <div className="burger-icon" onClick={toggleMenu} role="button" tabIndex={0} onKeyPress={(e) => e.key === 'Enter' && toggleMenu()} >
                                <FiMenu size={24}/>
                            </div>
                        </div>
                    ) : (
                        <>
                            <button className="nav-btn" onClick={handleOpenLogin}>Log In</button>
                            <button className="nav-btn signup-btn" onClick={handleOpenSignUp}>Sign Up</button>
                        </>
                    )}
                </div>
            </header>

            {/* ---------- Fly‑out menu ---------- */}
            {loggedInUser && isMenuOpen && (
                <div className="menu-overlay" onClick={() => setIsMenuOpen(false)} role="button" tabIndex={0} onKeyPress={(e) => e.key === 'Enter' && setIsMenuOpen(false)} >
                    <div className="nav-items" onClick={e => e.stopPropagation()} role="menu">
                        <div className="nav-item" role="menuitem" tabIndex={0} onClick={() => handleMenuClick('/documents')} onKeyPress={(e) => e.key === 'Enter' && handleMenuClick('/documents')}>My Documents</div>
                        <div className="nav-item" role="menuitem" tabIndex={0} onClick={() => handleMenuClick('/link-github')} onKeyPress={(e) => e.key === 'Enter' && handleMenuClick('/link-github')}>Link GitHub</div>
                        <div className="nav-item" role="menuitem" tabIndex={0} onClick={() => handleMenuClick('/settings')} onKeyPress={(e) => e.key === 'Enter' && handleMenuClick('/settings')}>Settings</div>
                        <div className="nav-item" role="menuitem" tabIndex={0} onClick={handleLogout} onKeyPress={(e) => e.key === 'Enter' && handleLogout}>Logout</div>
                    </div>
                </div>
            )}

            {/* ---------- Hero ---------- */}
            <section className="hero">
                <div className="hero-content">
                    <h2 className="hero-title">Ever <span className="text-red">suffered</span> with <span className="text-teal">code documentation?</span></h2>
                    <p className="hero-subtitle">Give it another <span className="text-green">chance</span> with <span className="text-teal">echo</span></p>
                    <button className="cta-btn" onClick={() => loggedInUser ? navigate('/my-documents') : handleOpenSignUp() }>Try now</button>
                </div>
            </section>

            {/* ---------- Recently edited ---------- */}
            {loggedInUser && (
                <section className="recent-section">
                    <h3>Your recently edited manuals</h3>
                    {recentDocs.length > 0 ? (
                        <ul className="recent-list">
                            {recentDocs.map(d => (
                                <li key={d.id} className="recent-item">
                                    <button className="recent-link" onClick={() => openDocument(d)}>
                                        {d.title} <span className="recent-repo">({d.repo_full_name || 'No repo linked'})</span>
                                    </button>
                                    <time className="recent-date">{new Date(d.updated_at).toLocaleString()}</time>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p>No recently edited manuals found. Start by creating or editing a document!</p>
                    )}
                </section>
            )}


            {/* ---------- Info / Features ---------- */}
            <section className="info-section">
                <div className="code-tree-container">
          <pre className="code-tree">{`Project
├── fe
│   └── src
├── be
│   └── app
│       └── Pages
│          └── App.tsx (You are here!)
│       └── CSS
│          ├── Navbar.css
│          └── ColorPalette.css
├── DB
│   └── init.sql
└── docker-compose.yml`}</pre>
                </div>
                <div className="info-text">
                    <h3>Create manuals that use <span className="text-teal">code sectioning</span>. Document only the idea of selected parts<span className="asterisk">*</span></h3>
                    <p className="note"><span className="asterisk">*</span> Code documentation and <span className="api-color">API</span> get their own special treatment</p>
                </div>
            </section>

            {/* ---------- Modals ---------- */}
            {/* Sign‑Up Modal */}
            {isSignUpOpen && (
                <div className="modal-overlay" onClick={handleCloseSignUp}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <button className="close-btn" onClick={handleCloseSignUp} aria-label="Close sign up form">×</button>
                        <form onSubmit={handleSignUpSubmit} className="signup-form" noValidate>
                            <h3 style={{textAlign: 'center', marginBottom: '20px'}}>Create your Echo Account</h3>
                            <label htmlFor="username_signup" className="signup-label">Username <span className="required-asterisk">*</span></label>
                            <input id="username_signup" value={username} onChange={e => validateUsername(e.target.value)} onBlur={e => validateUsername(e.target.value)} required className="signup-input" autoComplete="username"/>
                            {usernameError && <p className="error-text">{usernameError}</p>}

                            <label htmlFor="email_signup" className="signup-label">Email <span className="required-asterisk">*</span></label>
                            <input id="email_signup" type="email" value={email} onChange={e => validateEmail(e.target.value)} onBlur={e => validateEmail(e.target.value)} required className="signup-input" autoComplete="email"/>
                            {emailError && <p className="error-text">{emailError}</p>}

                            <label htmlFor="password_signup" className="signup-label">Password <span className="required-asterisk">*</span></label>
                            <input id="password_signup" type="password" value={password} onChange={e => handlePasswordChange(e.target.value)} required className="signup-input" autoComplete="new-password"/>
                            {passwordError && <p className="error-text">{passwordError}</p>}

                            <label htmlFor="confirm_signup" className="signup-label">Confirm Password <span className="required-asterisk">*</span></label>
                            <input id="confirm_signup" type="password" value={confirmPassword} onChange={e => handleConfirmPassword(e.target.value)} onBlur={e => handleConfirmPassword(e.target.value)} required className="signup-input" autoComplete="new-password"/>
                            {confirmPasswordError && <p className="error-text">{confirmPasswordError}</p>}

                            <div className="password-criteria">
                                <p className="criteria-title">Password Criteria:</p>
                                {[
                                    { label: 'At least 8 characters', flag: hasMinLength, id: 'len' },
                                    { label: 'At least 1 uppercase letter', flag: hasUppercase, id: 'upper' },
                                    { label: 'At least 1 number', flag: hasNumber, id: 'num' },
                                    { label: 'At least 1 special character', flag: hasSpecialChar, id: 'spec' },
                                ].map(c => (
                                    <div className="criteria-item" key={c.id}>
                                        <input type="checkbox" readOnly checked={c.flag} className="criteria-checkbox" id={`crit_${c.id}_signup`}/>
                                        <label htmlFor={`crit_${c.id}_signup`} className="criteria-label">{c.label}</label>
                                    </div>
                                ))}
                            </div>
                            <button type="submit" className="cta-btn submit-btn">Create Account</button>
                            <div className="form-divider"><span>OR</span></div>
                            <div className="social-signin-container">
                                {/* Google Sign-In Button - Add back if needed
                                <button type="button" className="social-btn google" onClick={handleGoogleSignIn}><FaGoogle size={18} style={{ marginRight: 8 }}/>
                                    Sign up with Google
                                </button>
                                */}
                                <button type="button" className="social-btn github" onClick={handleGithubOAuthSignIn}><FaGithub size={18} style={{ marginRight: 8 }}/>
                                    Sign up with GitHub
                                </button>
                            </div>
                            <p className="auth-switch-text">Already have an account? <span className="auth-switch-link" onClick={() => { handleCloseSignUp(); handleOpenLogin(); }}>Log In</span></p>
                        </form>
                    </div>
                </div>
            )}

            {/* Login Modal */}
            {isLoginOpen && (
                <div className="modal-overlay" onClick={handleCloseLogin}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <button className="close-btn" onClick={handleCloseLogin} aria-label="Close login form">×</button>
                        <div className="thank-you-section"><p className="thank-you-text">Welcome Back!</p></div>
                        <form onSubmit={handleLoginSubmit} className="login-form" noValidate>
                            <h3 style={{textAlign: 'center', marginBottom: '20px'}}>Log in to Echo</h3>
                            <label htmlFor="loginUsername" className="login-label">Username or Email <span className="required-asterisk">*</span></label>
                            <input id="loginUsername" value={loginUsername} onChange={e => setLoginUsername(e.target.value)} required className="login-input" autoComplete="username"/>
                            <label htmlFor="loginPassword" className="login-label">Password <span className="required-asterisk">*</span></label>
                            <input id="loginPassword" type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required className="login-input" autoComplete="current-password"/>
                            <button type="submit" className="cta-btn submit-btn">Log In</button>
                            <div className="form-divider"><span>OR</span></div>
                            <div className="social-signin-container">
                                {/* Google Sign-In Button - Add back if needed
                                <button type="button" className="social-btn google" onClick={handleGoogleSignIn}><FaGoogle size={18} style={{ marginRight: 8 }}/>
                                    Log in with Google
                                </button>
                                */}
                                <button type="button" className="social-btn github" onClick={handleGithubOAuthSignIn}><FaGithub size={18} style={{ marginRight: 8 }}/>
                                    Log in with GitHub
                                </button>
                            </div>
                            <p className="auth-switch-text">Don't have an account? <span className="auth-switch-link" onClick={() => { handleCloseLogin(); handleOpenSignUp();}}>Sign Up</span></p>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;