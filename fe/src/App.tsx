import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FiMenu } from 'react-icons/fi';
import { FaGoogle, FaGithub } from 'react-icons/fa';
import './App.css';
import '../src/global-css/navbar.css';

interface ApiResponse {
    message?: string;
    token?: string;
    username?: string;
}

function parseJwt(token: string) {
    try {
        const base64Payload = token.split('.')[1];
        const payload = atob(base64Payload);
        return JSON.parse(payload);
    } catch (e) {
        console.error('Failed to parse token', e);
        return null;
    }
}

function App() {
    const navigate = useNavigate();

    // Modals
    const [isSignUpOpen, setIsSignUpOpen] = useState(false);
    const [isLoginOpen, setIsLoginOpen] = useState(false);

    // User
    const [loggedInUser, setLoggedInUser] = useState<string | null>(null);

    // Nav menu
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    // Sign-up fields
    const [email, setEmail] = useState('');
    const [emailError, setEmailError] = useState('');

    const [username, setUsername] = useState('');
    const [usernameError, setUsernameError] = useState('');

    const [password, setPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');

    const [confirmPassword, setConfirmPassword] = useState('');
    const [confirmPasswordError, setConfirmPasswordError] = useState('');

    const [rememberMe, setRememberMe] = useState(false);

    // Password strength
    const [hasMinLength, setHasMinLength] = useState(false);
    const [hasUppercase, setHasUppercase] = useState(false);
    const [hasNumber, setHasNumber] = useState(false);
    const [hasSpecialChar, setHasSpecialChar] = useState(false);

    // Login form
    const [loginUsername, setLoginUsername] = useState('');
    const [loginPassword, setLoginPassword] = useState('');

    useEffect(() => {
        const token = localStorage.getItem('myAppToken');
        if (token) {
            const decoded = parseJwt(token);
            if (decoded && decoded.username) {
                setLoggedInUser(decoded.username);
            }
        }
    }, []);

    // Modal toggles
    const handleOpenSignUp = () => {
        setIsSignUpOpen(true);
        setIsLoginOpen(false);
    };
    const handleCloseSignUp = () => {
        // reset
        setEmail('');
        setUsername('');
        setPassword('');
        setConfirmPassword('');
        setRememberMe(false);
        setEmailError('');
        setUsernameError('');
        setPasswordError('');
        setConfirmPasswordError('');
        setHasMinLength(false);
        setHasUppercase(false);
        setHasNumber(false);
        setHasSpecialChar(false);
        setIsSignUpOpen(false);
    };
    const handleOpenLogin = () => {
        setIsLoginOpen(true);
        setIsSignUpOpen(false);
    };
    const handleCloseLogin = () => {
        setLoginUsername('');
        setLoginPassword('');
        setIsLoginOpen(false);
    };

    // Validations
    const validateEmail = (value: string) => {
        setEmail(value);
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
            setEmailError('Invalid email format');
        } else {
            setEmailError('');
        }
    };

    const validateUsername = (value: string) => {
        const usernameRegex = /^[A-Za-z0-9._]+$/;
        if (!usernameRegex.test(value)) {
            setUsernameError('Username can only contain letters, digits, underscores, and periods.');
        } else if (value.trim().length < 3) {
            setUsernameError('Username must be at least 3 characters long.');
        } else {
            setUsernameError('');
        }
        setUsername(value);
    };

    const handlePasswordChange = (value: string) => {
        setPassword(value);
        setHasMinLength(value.length >= 8);
        setHasUppercase(/[A-Z]/.test(value));
        setHasNumber(/[0-9]/.test(value));
        setHasSpecialChar(/[^A-Za-z0-9]/.test(value));

        if (
            value.length > 0 &&
            (value.length < 8 ||
                !/[A-Z]/.test(value) ||
                !/[0-9]/.test(value) ||
                !/[^A-Za-z0-9]/.test(value))
        ) {
            setPasswordError('Password is not strong enough');
        } else {
            setPasswordError('');
        }
    };

    const handleConfirmPassword = (value: string) => {
        setConfirmPassword(value);
        if (value && value !== password) {
            setConfirmPasswordError('Passwords do not match');
        } else {
            setConfirmPasswordError('');
        }
    };

    // OAuth handlers
    const handleGoogleSignIn = () => {
        alert('Redirecting to Google OAuth...');
    };
    const handleGithubSignIn = () => {
        // We can route to /linkGithubRepo if we want
        navigate('/link-github');
    };

    // SIGN-UP
    const handleSignUpSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (emailError || usernameError || passwordError || confirmPasswordError) {
            alert('Please fix errors before submitting.');
            return;
        }
        if (!username) {
            setUsernameError('Username is required');
            return;
        }
        if (password !== confirmPassword) {
            setConfirmPasswordError('Passwords do not match');
            return;
        }
        if (!hasMinLength || !hasUppercase || !hasNumber || !hasSpecialChar) {
            alert('Please meet all password criteria.');
            return;
        }
        try {
            // Adjust to your actual backend signup endpoint
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, username, password, rememberMe }),
            });
            let data: ApiResponse = {};
            try {
                data = await response.json();
            } catch (err) {
                console.error('Error parsing JSON:', err);
            }

            if (response.ok) {
                // On success, let's route them to /link-github
                alert('Sign-up successful!');
                navigate('/link-github'); // <== changed from /tutorial
                handleCloseSignUp();
            } else {
                const msg = data.message || 'Unknown error';
                alert(`Sign-up failed: ${msg}`);
            }
        } catch (error) {
            console.error('Sign-up error:', error);
            alert('Server error. Please try again.');
        }
    };

    // LOGIN
    const handleLoginSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: loginUsername, password: loginPassword }),
            });

            // Log the response status and text
            console.log('Login response status:', response.status);
            const responseText = await response.text();
            console.log('Login response text:', responseText);

            let data: ApiResponse = {};
            try {
                data = JSON.parse(responseText);
                console.log('Login response data:', data); // Add this line for debugging
            } catch (jsonErr) {
                console.error('Error reading JSON:', jsonErr);
                alert('Server error. Please try again.');
                return;
            }

            if (response.ok) {
                const { token, username } = data;
                if (!token || !username) {
                    alert('Login failed: no token or username returned by server.');
                    return;
                }
                localStorage.setItem('myAppToken', token);
                setLoggedInUser(username);
                alert('Logged in successfully!');
                handleCloseLogin();
                navigate('/link-github');
            } else {
                const msg = data.message || 'Unknown error';
                alert(`Login failed: ${msg}`);
            }
        } catch (error) {
            console.error('Login error:', error);
            alert('Server error. Please try again.');
        }
    };

    // LOG OUT
    const handleLogout = () => {
        localStorage.removeItem('myAppToken');
        setLoggedInUser(null);
        setIsMenuOpen(false);
    };

    // Nav menu toggles
    const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
    const handleMenuItemClick = (path: string) => {
        navigate(path);
        setIsMenuOpen(false);
    };
    const handleOverlayClick = () => setIsMenuOpen(false);
    const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

    return (
        <div className="landing-page">
            {/* Header / Navigation */}
            <header className="navbar">
                <div className="nav-left">
                    <h1 className="brand">echo</h1>
                </div>
                <div className="nav-right">
                    {loggedInUser ? (
                        <nav className="nav-container">
                            <div className="burger-icon" onClick={toggleMenu}>
                                <FiMenu size={24} />
                            </div>
                        </nav>
                    ) : (
                        <>
                            <button className="nav-btn" onClick={handleOpenLogin}>
                                Log In
                            </button>
                            <button className="nav-btn signup-btn" onClick={handleOpenSignUp}>
                                Sign Up
                            </button>
                        </>
                    )}
                </div>
            </header>

            {loggedInUser && isMenuOpen && (
                <div className="menu-overlay" onClick={handleOverlayClick}>
                    <div className="nav-items" onClick={stopPropagation}>
                        <div
                            className="nav-item"
                            onClick={() => handleMenuItemClick('/dashboard')}
                        >
                            Dashboard
                        </div>
                        <div
                            className="nav-item"
                            onClick={() => handleMenuItemClick('/document-page')}
                        >
                            My Documents
                        </div>

                        <div
                            className="nav-item"
                            onClick={() => handleMenuItemClick('/faq')}
                        >
                            FAQ
                        </div>
                        <div className="nav-item" onClick={handleLogout}>
                            Logout
                        </div>
                    </div>
                </div>
            )}

            {/* Hero Section */}
            <section className="hero">
                <div className="hero-content">
                    <h2 className="hero-title">
                        Ever <span className="text-red">suffered</span> with{' '}
                        <span className="text-teal">code documentation?</span>
                    </h2>
                    <p className="hero-subtitle">
                        Give it another <span className="text-green">chance</span> with{' '}
                        <span className="text-teal">echo</span>
                    </p>
                    <button className="cta-btn">Try now</button>
                </div>
            </section>

            {/* Info / Feature Section */}
            <section className="info-section">
                <div className="code-tree-container">
                    <pre className="code-tree">
{`Project
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
└── docker-compose.yml
`}
                    </pre>
                </div>
                <div className="info-text">
                    <h3>
                        Create manuals that use <span className="text-teal">code sectioning</span>.
                        Document only the idea of selected parts
                        <span className="asterisk">*</span>
                    </h3>
                    <p className="note">
                        <span className="asterisk">*</span> Code documentation and{' '}
                        <span className="api-color">API</span> get their own special treatment
                    </p>
                </div>
            </section>

            {/* SIGN-UP MODAL */}
            {isSignUpOpen && (
                <div className="modal-overlay" onClick={handleCloseSignUp}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="close-btn" onClick={handleCloseSignUp}>
                            ×
                        </button>

                        <div className="thank-you-section">
                            <p className="thank-you-text">Thank You for Thinking of Us &lt;3</p>
                        </div>

                        <form onSubmit={handleSignUpSubmit} className="signup-form">
                            {/* Username */}
                            <label htmlFor="username" className="signup-label">
                                Username <span className="required-asterisk">*</span>
                            </label>
                            <input
                                id="username"
                                type="text"
                                placeholder="Your username"
                                value={username}
                                required
                                onBlur={(e) => validateUsername(e.target.value)}
                                onChange={(e) => validateUsername(e.target.value)}
                                className="signup-input"
                            />
                            {usernameError && <p className="error-text">{usernameError}</p>}

                            {/* Email */}
                            <label htmlFor="email" className="signup-label">
                                Email <span className="required-asterisk">*</span>
                            </label>
                            <input
                                id="email"
                                type="email"
                                placeholder="example@example.com"
                                value={email}
                                required
                                onBlur={(e) => validateEmail(e.target.value)}
                                onChange={(e) => validateEmail(e.target.value)}
                                className="signup-input"
                            />
                            {emailError && <p className="error-text">{emailError}</p>}

                            {/* Password */}
                            <label htmlFor="password" className="signup-label">
                                Password <span className="required-asterisk">*</span>
                            </label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                required
                                onChange={(e) => handlePasswordChange(e.target.value)}
                                className="signup-input"
                            />
                            {passwordError && <p className="error-text">{passwordError}</p>}

                            {/* Confirm Password */}
                            <label htmlFor="confirmPassword" className="signup-label">
                                Confirm Password <span className="required-asterisk">*</span>
                            </label>
                            <input
                                id="confirmPassword"
                                type="password"
                                value={confirmPassword}
                                required
                                onBlur={(e) => handleConfirmPassword(e.target.value)}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="signup-input"
                            />
                            {confirmPasswordError && (
                                <p className="error-text">{confirmPasswordError}</p>
                            )}

                            {/* Remember check */}
                            <div className="remember-me-container">
                                <input
                                    type="checkbox"
                                    id="rememberMe"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                    className="remember-me-checkbox"
                                />
                                <label htmlFor="rememberMe" className="remember-me-label">
                                    Remember password
                                </label>
                            </div>

                            {/* Social sign-in */}
                            <div className="social-signin-container">
                                <button
                                    type="button"
                                    className="social-btn google"
                                    onClick={handleGoogleSignIn}
                                >
                                    <FaGoogle size={18} style={{ marginRight: '8px' }} />
                                    Sign in with Google
                                </button>
                                <button
                                    type="button"
                                    className="social-btn github"
                                    onClick={handleGithubSignIn}
                                >
                                    <FaGithub size={18} style={{ marginRight: '8px' }} />
                                    Sign in with GitHub
                                </button>
                            </div>

                            {/* Password Criteria */}
                            <div className="password-criteria">
                                <p className="criteria-title">Password Criteria:</p>
                                <div className="criteria-item">
                                    <input
                                        type="checkbox"
                                        readOnly
                                        checked={hasMinLength}
                                        className="criteria-checkbox"
                                        id="minLengthCheck"
                                    />
                                    <label htmlFor="minLengthCheck" className="criteria-label">
                                        At least 8 characters
                                    </label>
                                </div>
                                <div className="criteria-item">
                                    <input
                                        type="checkbox"
                                        readOnly
                                        checked={hasUppercase}
                                        className="criteria-checkbox"
                                        id="uppercaseCheck"
                                    />
                                    <label htmlFor="uppercaseCheck" className="criteria-label">
                                        At least 1 uppercase letter
                                    </label>
                                </div>
                                <div className="criteria-item">
                                    <input
                                        type="checkbox"
                                        readOnly
                                        checked={hasNumber}
                                        className="criteria-checkbox"
                                        id="numberCheck"
                                    />
                                    <label htmlFor="numberCheck" className="criteria-label">
                                        At least 1 number
                                    </label>
                                </div>
                                <div className="criteria-item">
                                    <input
                                        type="checkbox"
                                        readOnly
                                        checked={hasSpecialChar}
                                        className="criteria-checkbox"
                                        id="specialCheck"
                                    />
                                    <label htmlFor="specialCheck" className="criteria-label">
                                        At least 1 special character
                                    </label>
                                </div>
                            </div>

                            <button type="submit" className="cta-btn submit-btn">
                                Start Documenting
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* LOGIN MODAL */}
            {isLoginOpen && (
                <div className="modal-overlay" onClick={handleCloseLogin}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <button className="close-btn" onClick={handleCloseLogin}>
                            ×
                        </button>
                        <div className="thank-you-section">
                            <p className="thank-you-text">Welcome Back!</p>
                        </div>
                        <form onSubmit={handleLoginSubmit} className="login-form">
                            <label htmlFor="loginUsername" className="login-label">
                                Username <span className="required-asterisk">*</span>
                            </label>
                            <input
                                id="loginUsername"
                                type="text"
                                placeholder="Your username"
                                value={loginUsername}
                                required
                                onChange={(e) => setLoginUsername(e.target.value)}
                                className="login-input"
                            />
                            <label htmlFor="loginPassword" className="login-label">
                                Password <span className="required-asterisk">*</span>
                            </label>
                            <input
                                id="loginPassword"
                                type="password"
                                placeholder="Your password"
                                value={loginPassword}
                                required
                                onChange={(e) => setLoginPassword(e.target.value)}
                                className="login-input"
                            />
                            <button type="submit" className="cta-btn submit-btn">
                                Log In
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
