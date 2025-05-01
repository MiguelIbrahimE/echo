/* =========================================================
   App.tsx – landing page, auth modals, recent docs
   Full drop‑in version (2025‑05‑01)
========================================================= */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMenu } from 'react-icons/fi';
import { FaGoogle, FaGithub } from 'react-icons/fa';
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
    } catch {
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
    const [rememberMe, setRememberMe]               = useState(false);

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

    /* =====================================================
       1)  Check JWT on mount
    ===================================================== */
    useEffect(() => {
        const token = localStorage.getItem('myAppToken');
        if (token) {
            const decoded = parseJwt(token);
            if (decoded?.username) setLoggedInUser(decoded.username);
        }
    }, []);

    /* =====================================================
       2)  Fetch recent documents once we know user is logged
    ===================================================== */
    useEffect(() => {
        if (!loggedInUser) return;
        (async () => {
            try {
                const jwt = localStorage.getItem('myAppToken');
                const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/documents/recent`, {
                    headers: { Authorization: `Bearer ${jwt}` },
                });
                if (res.ok) {
                    const docs: DocBrief[] = await res.json();
                    setRecentDocs(docs);
                }
            } catch (e) {
                console.error('Error fetching recent docs', e);
            }
        })();
    }, [loggedInUser]);

    /* =====================================================
       Validation helpers
    ===================================================== */
    const validateEmail = (val: string) => {
        setEmail(val);
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        setEmailError(re.test(val) ? '' : 'Invalid email format');
    };
    const validateUsername = (val: string) => {
        const re = /^[A-Za-z0-9._]+$/;
        if (!re.test(val)) setUsernameError('Only letters, digits, _ and . allowed');
        else if (val.trim().length < 3) setUsernameError('At least 3 characters');
        else setUsernameError('');
        setUsername(val);
    };
    const handlePasswordChange = (val: string) => {
        setPassword(val);
        setHasMinLength(val.length >= 8);
        setHasUppercase(/[A-Z]/.test(val));
        setHasNumber(/[0-9]/.test(val));
        setHasSpecialChar(/[^A-Za-z0-9]/.test(val));
        const strong = val.length >= 8 && /[A-Z]/.test(val) && /[0-9]/.test(val) && /[^A-Za-z0-9]/.test(val);
        setPasswordError(val && !strong ? 'Password is not strong enough' : '');
    };
    const handleConfirmPassword = (val: string) => {
        setConfirmPassword(val);
        setConfirmPasswordError(val && val !== password ? 'Passwords do not match' : '');
    };

    /* =====================================================
       OAuth placeholders
    ===================================================== */
    const handleGoogleSignIn = () => alert('Redirecting to Google OAuth…');
    const handleGithubSignIn = () => navigate('/link-github');

    /* =====================================================
       Signup / Login API handlers
    ===================================================== */
    const handleSignUpSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (emailError || usernameError || passwordError || confirmPasswordError) return alert('Fix errors first');
        if (!username) return setUsernameError('Username is required');
        if (password !== confirmPassword) return setConfirmPasswordError('Passwords do not match');
        if (!(hasMinLength && hasUppercase && hasNumber && hasSpecialChar)) return alert('Password criteria not met');
        try {
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, username, password, rememberMe }),
            });
            const data: ApiResponse = await res.json().catch(() => ({}));
            if (res.ok) {
                alert('Sign‑up successful!');
                navigate('/link-github');
                handleCloseSignUp();
            } else alert(`Sign‑up failed: ${data.message || 'Unknown error'}`);
        } catch (e) {
            console.error(e);
            alert('Server error');
        }
    };

    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: loginUsername, password: loginPassword }),
            });
            const txt = await res.text();
            const data: ApiResponse = JSON.parse(txt);
            if (res.ok && data.token && data.username) {
                localStorage.setItem('myAppToken', data.token);
                setLoggedInUser(data.username);
                alert('Logged in successfully!');
                handleCloseLogin();
                navigate('/link-github');
            } else alert(`Login failed: ${data.message || 'Unknown error'}`);
        } catch (e) {
            console.error(e);
            alert('Server error');
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
    const handleLogout = () => {
        localStorage.removeItem('myAppToken');
        setLoggedInUser(null);
        setIsMenuOpen(false);
    };

    /* =====================================================
       Modal toggles
    ===================================================== */
    const handleOpenSignUp = () => { setIsSignUpOpen(true); setIsLoginOpen(false); };
    const handleCloseSignUp = () => {
        setIsSignUpOpen(false);
        setEmail(''); setUsername(''); setPassword(''); setConfirmPassword(''); setRememberMe(false);
        setEmailError(''); setUsernameError(''); setPasswordError(''); setConfirmPasswordError('');
        setHasMinLength(false); setHasUppercase(false); setHasNumber(false); setHasSpecialChar(false);
    };
    const handleOpenLogin = () => { setIsLoginOpen(true); setIsSignUpOpen(false); };
    const handleCloseLogin = () => { setIsLoginOpen(false); setLoginUsername(''); setLoginPassword(''); };

    /* =====================================================
       Recently‑edited open helper
    ===================================================== */
    const openDocument = (doc: DocBrief) => {
        if (!doc.repo_full_name) return alert('Document has no linked repo');
        const ghToken = localStorage.getItem('ghToken') || '';
        navigate(`/document-page?repo=${encodeURIComponent(doc.repo_full_name)}&token=${ghToken}&branch=${doc.branch_name || 'main'}`);
    };

    /* =====================================================
       Render
    ===================================================== */
    return (
        <div className="landing-page">
            {/* ---------- Navbar ---------- */}
            <header className="navbar">
                <div className="nav-left"><h1 className="brand">echo</h1></div>
                <div className="nav-right">
                    {loggedInUser ? (
                        <div className="nav-container">
                            <div className="burger-icon" onClick={toggleMenu}><FiMenu size={24}/></div>
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
                <div className="menu-overlay" onClick={() => setIsMenuOpen(false)}>
                    <div className="nav-items" onClick={e => e.stopPropagation()}>
                        <div className="nav-item" onClick={() => handleMenuClick('/dashboard')}>Dashboard</div>
                        <div className="nav-item" onClick={() => handleMenuClick('/link-github')}>Link GitHub</div>
                        <div className="nav-item" onClick={() => handleMenuClick('/faq')}>FAQ</div>
                        <div className="nav-item" onClick={handleLogout}>Logout</div>
                    </div>
                </div>
            )}

            {/* ---------- Hero ---------- */}
            <section className="hero">
                <div className="hero-content">
                    <h2 className="hero-title">Ever <span className="text-red">suffered</span> with <span className="text-teal">code documentation?</span></h2>
                    <p className="hero-subtitle">Give it another <span className="text-green">chance</span> with <span className="text-teal">echo</span></p>
                    <button className="cta-btn" onClick={() => navigate('/link-github')}>Try now</button>
                </div>
            </section>

            {/* ---------- Recently edited ---------- */}
            {loggedInUser && recentDocs.length > 0 && (
                <section className="recent-section">
                    <h3>Your recently edited manuals</h3>
                    <ul className="recent-list">
                        {recentDocs.map(d => (
                            <li key={d.id} className="recent-item">
                                <button className="recent-link" onClick={() => openDocument(d)}>
                                    {d.title} <span className="recent-repo">({d.repo_full_name})</span>
                                </button>
                                <time className="recent-date">{new Date(d.updated_at).toLocaleString()}</time>
                            </li>
                        ))}
                    </ul>
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
│          └── App.tsx
│       └── CSS
│          ├── Navbar.css
│          ├── searchbar.css
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
                        <button className="close-btn" onClick={handleCloseSignUp}>×</button>
                        <div className="thank-you-section"><p className="thank-you-text">Thank You for Thinking of Us &lt;3</p></div>
                        {/* Sign‑up form */}
                        <form onSubmit={handleSignUpSubmit} className="signup-form">
                            {/* username */}
                            <label htmlFor="username" className="signup-label">Username <span className="required-asterisk">*</span></label>
                            <input id="username" value={username} onChange={e => validateUsername(e.target.value)} onBlur={e => validateUsername(e.target.value)} required className="signup-input"/>
                            {usernameError && <p className="error-text">{usernameError}</p>}
                            {/* email */}
                            <label htmlFor="email" className="signup-label">Email <span className="required-asterisk">*</span></label>
                            <input id="email" type="email" value={email} onChange={e => validateEmail(e.target.value)} onBlur={e => validateEmail(e.target.value)} required className="signup-input"/>
                            {emailError && <p className="error-text">{emailError}</p>}
                            {/* password */}
                            <label htmlFor="password" className="signup-label">Password <span className="required-asterisk">*</span></label>
                            <input id="password" type="password" value={password} onChange={e => handlePasswordChange(e.target.value)} required className="signup-input"/>
                            {passwordError && <p className="error-text">{passwordError}</p>}
                            {/* confirm */}
                            <label htmlFor="confirm" className="signup-label">Confirm Password <span className="required-asterisk">*</span></label>
                            <input id="confirm" type="password" value={confirmPassword} onChange={e => handleConfirmPassword(e.target.value)} onBlur={e => handleConfirmPassword(e.target.value)} required className="signup-input"/>
                            {confirmPasswordError && <p className="error-text">{confirmPasswordError}</p>}
                            {/* remember */}
                            <div className="remember-me-container">
                                <input type="checkbox" id="rememberMe" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="remember-me-checkbox"/>
                                <label htmlFor="rememberMe" className="remember-me-label">Remember password</label>
                            </div>
                            {/* social */}
                            <div className="social-signin-container">
                                <button type="button" className="social-btn google" onClick={handleGoogleSignIn}><FaGoogle size={18} style={{ marginRight: 8 }}/>
                                    Sign in with Google
                                </button>
                                <button type="button" className="social-btn github" onClick={handleGithubSignIn}><FaGithub size={18} style={{ marginRight: 8 }}/>
                                    Sign in with GitHub
                                </button>
                            </div>
                            {/* criteria */}
                            <div className="password-criteria">
                                <p className="criteria-title">Password Criteria:</p>
                                {[
                                    { label: 'At least 8 characters', flag: hasMinLength, id: 'len' },
                                    { label: 'At least 1 uppercase letter', flag: hasUppercase, id: 'upper' },
                                    { label: 'At least 1 number', flag: hasNumber, id: 'num' },
                                    { label: 'At least 1 special character', flag: hasSpecialChar, id: 'spec' },
                                ].map(c => (
                                    <div className="criteria-item" key={c.id}>
                                        <input type="checkbox" readOnly checked={c.flag} className="criteria-checkbox" id={`crit_${c.id}`}/>
                                        <label htmlFor={`crit_${c.id}`} className="criteria-label">{c.label}</label>
                                    </div>
                                ))}
                            </div>
                            <button type="submit" className="cta-btn submit-btn">Start Documenting</button>
                        </form>
                    </div>
                </div>
            )}

            {/* Login Modal */}
            {isLoginOpen && (
                <div className="modal-overlay" onClick={handleCloseLogin}>
                    <div className="modal-content" onClick={e => e.stopPropagation()}>
                        <button className="close-btn" onClick={handleCloseLogin}>×</button>
                        <div className="thank-you-section"><p className="thank-you-text">Welcome Back!</p></div>
                        <form onSubmit={handleLoginSubmit} className="login-form">
                            <label htmlFor="loginUsername" className="login-label">Username <span className="required-asterisk">*</span></label>
                            <input id="loginUsername" value={loginUsername} onChange={e => setLoginUsername(e.target.value)} required className="login-input"/>
                            <label htmlFor="loginPassword" className="login-label">Password <span className="required-asterisk">*</span></label>
                            <input id="loginPassword" type="password" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} required className="login-input"/>
                            <button type="submit" className="cta-btn submit-btn">Log In</button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;
