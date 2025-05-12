// be/src/services/projectStructureExplainer.ts
import axios from 'axios';
import { commitFileToGithub } from './githubCommitService'; // Ensure this path is correct

const OPENAI_API_KEY = process.env.GPT_API_KEY;

interface TreeItemInternal { path: string; type: 'blob' | 'tree'; }
interface GitTreeResponseInternal { tree: TreeItemInternal[]; }
const KEY_FILES_DIRS = [ /* ... as before ... */
    'src/', 'source/', 'lib/', 'app/', 'cmd/', 'pkg/', 'test/', 'tests/', '__tests__/',
    'docs/', 'doc/', 'scripts/', 'tools/', 'config/', 'cfg/', 'public/', 'static/', 'assets/',
    'server.js', 'main.go', 'app.py', 'main.ts', 'Dockerfile', 'docker-compose.yml',
    'package.json', 'README.md', '.env.example'
];

export async function explainProjectStructure(
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
    console.log(`[StructExplainer] Explaining structure for ${repoFullName} (branch ${branch})`);

    try {
        let treeItems: TreeItemInternal[] = [];
        try {
            const treeRes = await axios.get<GitTreeResponseInternal>(
                `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
                { headers: { Authorization: `Bearer ${githubToken}` } }
            );
            treeItems = treeRes.data.tree;
        } catch (e: any) {
            throw new Error(`Could not fetch project file tree: ${e.message}`);
        }

        if (treeItems.length === 0) {
            const noTreeMsg = "Project appears to be empty or tree could not be listed.";
            // Decide if you want to commit a placeholder for PROJECT_STRUCTURE.md
            return { success: false, message: noTreeMsg, markdownContent: `# Project Structure for ${repoFullName}\n\n${noTreeMsg}`, error: noTreeMsg };
        }

        const MAX_PATHS_TO_SEND = 300;
        const pathsForPrompt = treeItems
            .map(item => `${item.type === 'tree' ? 'D' : 'F'} ${item.path}`)
            .slice(0, MAX_PATHS_TO_SEND);

        const generatedExplanation = await openaiExplainStructure(repoFullName, pathsForPrompt, KEY_FILES_DIRS);

        const targetFilePath = "PROJECT_STRUCTURE.md"; // Target filename
        const commitMessage = `docs: Add/Update project structure explanation by EchoDocs`;

        const commitResult = await commitFileToGithub(
            repoFullName, githubToken, branch, targetFilePath, generatedExplanation, commitMessage
        );

        if (commitResult.success) {
            return {
                success: true,
                message: `Project structure explanation generated and committed successfully.`,
                markdownContent: generatedExplanation,
                githubFileUrl: commitResult.html_url,
                githubCommitUrl: commitResult.commit_url,
            };
        } else {
            return {
                success: false,
                message: `Project structure explanation generated, but failed to commit to GitHub: ${commitResult.error}`,
                markdownContent: generatedExplanation,
                error: commitResult.error || "GitHub commit failed",
            };
        }
    } catch (error: any) {
        console.error(`[StructExplainer] Error in explainProjectStructure for ${repoFullName}:`, error);
        return {
            success: false,
            message: `Failed to explain project structure: ${error.message}`,
            markdownContent: `# Error Explaining Project Structure for ${repoFullName}\n\n${error.message}`,
            error: error.message,
        };
    }
}

// Keep openaiExplainStructure as an internal helper function
async function openaiExplainStructure(repoFullName: string, paths: string[], keyFilesAndDirs: string[]): Promise<string> {
    // ... (implementation as before)
    if (!OPENAI_API_KEY) { console.error("OpenAI API Key not found for openaiExplainStructure"); return `# Error: OpenAI API Key missing. Cannot explain structure for ${repoFullName}.`;}
    try {
        const res = await axios.post( 'https://api.openai.com/v1/chat/completions', { model: 'gpt-4o-mini', messages: [ { role: 'system', content: `You are an engineering assistant that explains project structures... Focus on items from this list if present: ${keyFilesAndDirs.join(', ')}. ...`, }, { role: 'user', content: `Repository: ${repoFullName}\n\nFile and Directory Paths (D: Directory, F: File):\n${paths.join('\n')}\n\n(Note: This list might be truncated if the project is very large.)`, }, ], max_tokens: 1500, temperature: 0.2, }, { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } } );
        return res.data.choices[0].message.content.trim();
    } catch (e: any) {
        console.error(`[Struct Explainer] OpenAI API error: ${e.message}`);
        return `# Project Structure of ${repoFullName}\n\nError generating project structure explanation via OpenAI: ${e.message}.`;
    }
}