// projectStructureExplainer.ts
import axios from 'axios';

const OPENAI_API_KEY = process.env.GPT_API_KEY;

interface TreeItem {
    path: string;
    type: 'blob' | 'tree';
}
interface GitTreeResponse {
    tree: TreeItem[];
}

// Common important files/dirs to highlight if they exist
const KEY_FILES_DIRS = [
    'src/', 'source/', 'lib/', 'app/', 'cmd/', 'pkg/', // Source code
    'test/', 'tests/', '__tests__/', // Tests
    'docs/', 'doc/', // Documentation
    'scripts/', 'tools/', // Utility scripts
    'config/', 'cfg/', // Configuration
    'public/', 'static/', 'assets/', // Public assets for web projects
    'server.js', 'main.go', 'app.py', 'main.ts', // Common entry points
    'Dockerfile', 'docker-compose.yml',
    'package.json', 'README.md', '.env.example'
];


export async function explainProjectStructure(
    repoFullName: string,
    githubToken: string,
    branch: string
): Promise<{ structureMarkdown: string }> {
    const [owner, repo] = repoFullName.split('/');
    console.log(`[Struct Explainer] Starting for ${repoFullName}, branch ${branch}`);

    // 1. Get only the top-level and first few levels of the file tree (non-recursive initially)
    // For a deeper explanation, recursive might be needed, but can be too much.
    // Let's try recursive but tell GPT to focus on top-level and key items.
    let treeItems: TreeItem[] = [];
    try {
        const treeRes = await axios.get<GitTreeResponse>(
            `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, // Get full tree
            { headers: { Authorization: `Bearer ${githubToken}` } }
        );
        treeItems = treeRes.data.tree;
        console.log(`[Struct Explainer] Fetched ${treeItems.length} tree items (recursive).`);
    } catch (e: any) {
        console.error(`[Struct Explainer] Error fetching git tree: ${e.message}`);
        return { structureMarkdown: `# Project Structure for ${repoFullName}\n\nCould not fetch project file tree.`};
    }

    if (treeItems.length === 0) {
        return { structureMarkdown: `# Project Structure for ${repoFullName}\n\nProject appears to be empty or tree could not be listed.`};
    }

    // Prepare a simplified list of paths for the prompt
    // Limit the number of paths sent to OpenAI to avoid overly long prompts
    const MAX_PATHS_TO_SEND = 300;
    const pathsForPrompt = treeItems
        .map(item => `${item.type === 'tree' ? 'D' : 'F'} ${item.path}`) // Prefix with D for dir, F for file
        .slice(0, MAX_PATHS_TO_SEND);


    // 2. Ask OpenAI to explain the structure
    const explanation = await openaiExplainStructure(repoFullName, pathsForPrompt, KEY_FILES_DIRS);
    console.log('[Struct Explainer] Project structure explanation complete.');
    return { structureMarkdown: explanation };
}

async function openaiExplainStructure(repoFullName: string, paths: string[], keyFilesAndDirs: string[]): Promise<string> {
    if (!OPENAI_API_KEY) throw new Error("OpenAI API key is not configured.");
    console.log('[Struct Explainer] OpenAI: Explaining structure from file paths.');

    try {
        const res = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: `You are an engineering assistant that explains project structures.
Based on the provided list of file and directory paths (prefixed with 'F ' for files, 'D ' for directories), generate a Markdown document titled "# Project Structure of ${repoFullName}".
Your explanation should:
1. Briefly describe the likely purpose of the most important top-level directories (e.g., src, tests, docs, public).
2. Mention any key configuration or entry-point files found (e.g., package.json, Dockerfile, main.js, README.md).
3. Try to infer the type of project if possible (e.g., web application, library, command-line tool).
4. Keep the explanation concise and high-level. Do not attempt to explain every single file if many are provided.
5. Focus on items from this list if present: ${keyFilesAndDirs.join(', ')}.
Format the output clearly using Markdown lists or paragraphs for different components.`,
                    },
                    {
                        role: 'user',
                        content: `Repository: ${repoFullName}\n\nFile and Directory Paths (D: Directory, F: File):\n${paths.join('\n')}\n\n(Note: This list might be truncated if the project is very large.)`,
                    },
                ],
                max_tokens: 1500,
                temperature: 0.2,
            },
            { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
        );
        return res.data.choices[0].message.content.trim();
    } catch (e: any) {
        console.error(`[Struct Explainer] OpenAI API error: ${e.message}`);
        return `# Project Structure of ${repoFullName}\n\nError generating project structure explanation: ${e.message}.`;
    }
}