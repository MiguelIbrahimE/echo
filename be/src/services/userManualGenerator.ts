// be/src/services/userManualGenerator.ts
import axios from 'axios';
import { encode } from 'gpt-tokenizer';
import { commitFileToGithub } from './githubCommitService'; // Ensure this path is correct

const OPENAI_API_KEY = process.env.GPT_API_KEY;
if (!OPENAI_API_KEY) {
    console.error(
        '❌ GPT_API_KEY missing – generation will fail. ' +
        'Make sure the user key was stored or .env is populated.'
    );
}

interface TreeItem { path: string; type: 'blob' | 'tree'; sha: string; size?: number; }
interface GitTreeResponse { tree: TreeItem[]; }
const MAX_TOKENS_PER_CHUNK = 3_000;
const MAX_FILE_SIZE = 120_000;

// Renamed analyzeRepository to generateUserManual for clarity and to match router alias
export async function generateUserManual(
    repoFullName: string,
    githubToken: string,
    branch: string
): Promise<{
    success: boolean;
    message: string;
    markdownContent: string; // Standardized key
    githubFileUrl?: string;
    githubCommitUrl?: string;
    error?: string;
}> {
    const [owner, repo] = repoFullName.split('/');
    console.log(`[UserManualGenerator] Analyzing ${repoFullName} (branch ${branch})`);

    try {
        const treeRes = await axios.get<GitTreeResponse>(
            `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
            { headers: { Authorization: `Bearer ${githubToken}` } }
        );
        const blobs = treeRes.data.tree.filter((t) => t.type === 'blob');

        const fileContents = await Promise.all(
            blobs.map(async (f) => {
                const url = `https://api.github.com/repos/${owner}/${repo}/contents/${f.path}?ref=${branch}`;
                try {
                    const r = await axios.get(url, { headers: { Authorization: `Bearer ${githubToken}` } });
                    return {
                        path: f.path,
                        size: r.data.size as number,
                        content: Buffer.from(r.data.content, 'base64').toString('utf-8'),
                    };
                } catch { return { path: f.path, size: 0, content: '' }; }
            })
        );

        const SKIP = [ /node_modules/i, /\.git/i, /dist\//i, /\.(png|jpe?g|gif|svg|webp|ico|bmp)$/i, /\.lock$/i ];
        const useful = fileContents.filter(f => f.content && f.size < MAX_FILE_SIZE && !SKIP.some(re => re.test(f.path)));

        if (useful.length === 0) {
            const noUsefulFilesMsg = "No useful files found for summarization.";
            console.warn(`[UserManualGenerator] ${noUsefulFilesMsg}`);
            // Commit an empty/placeholder README or return error? For now, return placeholder content.
            const placeholderContent = `# ${repoFullName} - README\n\nThis repository currently has no summarizable content according to the generator's criteria.`;
            // Optionally, you could still attempt to commit this placeholder.
            // For this example, let's say generating a README from no content is a "failure" in terms of rich content,
            // but we can still provide a basic README.
            const commitResult = await commitFileToGithub(
                repoFullName, githubToken, branch, "README.md", placeholderContent, "docs: Initialize README.md (no content found by generator)"
            );
            if (commitResult.success) {
                return {
                    success: true, // Commit was successful
                    message: "Generated a basic README as no summarizable files were found.",
                    markdownContent: placeholderContent,
                    githubFileUrl: commitResult.html_url,
                    githubCommitUrl: commitResult.commit_url,
                };
            } else {
                return {
                    success: false,
                    message: "No summarizable files found, and failed to commit placeholder README.",
                    markdownContent: placeholderContent, // Still provide the placeholder
                    error: commitResult.error || "Failed to commit placeholder README."
                };
            }
        }

        const summaries: string[] = [];
        for (const file of useful) {
            const tokens = encode(file.content);
            const chunks = Math.ceil(tokens.length / MAX_TOKENS_PER_CHUNK);
            for (let i = 0; i < chunks; i++) {
                const text = new TextDecoder().decode(Uint8Array.from(tokens.slice(i * MAX_TOKENS_PER_CHUNK, (i + 1) * MAX_TOKENS_PER_CHUNK)));
                const summary = await openaiSummarise(file.path, i + 1, chunks, text);
                summaries.push(summary);
            }
        }

        const generatedManualContent = await openaiAssembleManual(repoFullName, branch, summaries);
        const targetFilePath = "README.md"; // User manuals target README.md
        const commitMessage = `docs: Update README.md with AI-generated guide by EchoDocs`;

        const commitResult = await commitFileToGithub(
            repoFullName, githubToken, branch, targetFilePath, generatedManualContent, commitMessage
        );

        if (commitResult.success) {
            return {
                success: true,
                message: `User Manual (README.md) generated and committed successfully.`,
                markdownContent: generatedManualContent,
                githubFileUrl: commitResult.html_url,
                githubCommitUrl: commitResult.commit_url,
            };
        } else {
            return {
                success: false,
                message: `User Manual generated, but failed to commit to README.md: ${commitResult.error}`,
                markdownContent: generatedManualContent, // Still provide the content for Echo DB
                error: commitResult.error || "GitHub commit failed",
            };
        }
    } catch (error: any) {
        console.error(`[UserManualGenerator] Error in generateUserManual for ${repoFullName}:`, error);
        return {
            success: false,
            message: `Failed to generate User Manual: ${error.message}`,
            markdownContent: `# Error Generating User Manual for ${repoFullName}\n\n${error.message}`,
            error: error.message,
        };
    }
}

// Keep openaiSummarise and openaiAssembleManual as internal helper functions
async function openaiSummarise(path: string, idx: number, total: number, content: string): Promise<string> {
    // ... (implementation as before)
    if (!OPENAI_API_KEY) { console.error("OpenAI API Key not found for openaiSummarise"); return `Error: OpenAI API Key missing. Cannot summarize ${path}.`;}
    const res = await axios.post( 'https://api.openai.com/v1/chat/completions', { model: 'gpt-4o-mini', messages: [ { role: 'system', content: 'You are an expert engineer. Produce a concise bullet‑style summary of the code the user sends.', }, { role: 'user', content: `File: ${path}  (chunk ${idx}/${total})\n\n${content}`, }, ], max_tokens: 400, temperature: 0.1, }, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } });
    return res.data.choices[0].message.content.trim();
}

async function openaiAssembleManual(repoFull: string, branch: string, summaries: string[]): Promise<string> {
    // ... (implementation as before)
    if (!OPENAI_API_KEY) { console.error("OpenAI API Key not found for openaiAssembleManual"); return `# Error: OpenAI API Key missing. Cannot assemble manual for ${repoFull}.`;}
    const res = await axios.post( 'https://api.openai.com/v1/chat/completions', { model: 'gpt-4o-mini', messages: [ { role: 'system', content: 'You are a professional technical writer. Build a COMPLETE, concrete developer guide. ONLY use information you are certain about; if a detail is unknown, leave the section out.', }, { role: 'user', content: `Repository ${repoFull} (branch ${branch}) – extracted summaries:\n\n${summaries.join( '\n\n' )}`, }, ], max_tokens: 4_000, temperature: 0.25, }, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } });
    return res.data.choices[0].message.content.trim();
}