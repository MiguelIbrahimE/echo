// be/src/githubAuthRouter.ts
import { Router } from 'express';
import fetch from 'node-fetch';
import jwt from 'jsonwebtoken';
import { pool } from '../db';
const githubAuthRouter = Router();

interface GitHubTokenResponse {
    access_token?: string;
    error?: string;
    error_description?: string;
    token_type?: string;
    scope?: string;
}

// GET /github => redirect user to GitHub's OAuth screen
githubAuthRouter.get('/github', (req, res) => {
    const clientId = process.env.GITHUB_CLIENT_ID;
    // This is the URL GitHub will redirect back to after user authorizes
    // Make sure it includes port 5001
    const redirectUri = process.env.GITHUB_REDIRECT_URI || 'http://localhost:5001/auth/github/callback';
    const scope = 'repo';

    const githubAuthorizeUrl =
        `https://github.com/login/oauth/authorize` +
        `?client_id=${clientId}` +
        `&redirect_uri=${redirectUri}` +
        `&scope=${scope}`;

    return res.redirect(githubAuthorizeUrl);
});

// GET /github/callback => handle GitHub's redirect
githubAuthRouter.get('/github/callback', async (req, res) => {
    const code = req.query.code as string;
    if (!code) {
        return res.status(400).send('No code provided in the query string.');
    }

    try {
        const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
            method: 'POST',
            headers: { 'Accept': 'application/json' },
            body: new URLSearchParams({
                client_id: process.env.GITHUB_CLIENT_ID || '',
                client_secret: process.env.GITHUB_CLIENT_SECRET || '',
                code,
                // Must match the redirectUri used above
                redirect_uri: process.env.GITHUB_REDIRECT_URI || 'http://localhost:5001/auth/github/callback',
            }),
        });

        // Read JSON from GitHub
        const tokenData = (await tokenResponse.json()) as GitHubTokenResponse;

        if (tokenData.error) {
            return res
                .status(401)
                .send(`GitHub OAuth error: ${tokenData.error_description || tokenData.error}`);
        }

        const githubAccessToken = tokenData.access_token;
        if (!githubAccessToken) {
            return res.status(401).send('No access token returned from GitHub');
        }

        // Where to send user afterwards (front-end). If none, default to 3000 or your desired port.
        const frontEndUrl = process.env.FRONTEND_URL || 'http://localhost:5173/src/SignedUp/freetier/linkgithub';

        // Pass the token as ?token=...
        return res.redirect(`${frontEndUrl}?token=${githubAccessToken}`);
    } catch (error) {
        console.error('Error exchanging code for token:', error);
        return res.status(500).send('Server error during GitHub OAuth');
    }
});

export default githubAuthRouter;