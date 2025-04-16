/* =====================================================
   documentService.ts
   (analyzes the repo and calls OpenAI)
===================================================== */
import axios, { AxiosError } from 'axios';
import { encode } from 'gpt-tokenizer';

// [DEBUG] Confirm GPT key is present
console.log('>>> [documentService.ts] Checking GPT_API_KEY:', process.env.GPT_API_KEY
    ? `Loaded, length=${process.env.GPT_API_KEY.length}`
    : 'Undefined!'
);

const OPENAI_API_KEY = process.env.GPT_API_KEY;
if (!OPENAI_API_KEY) {
  console.warn('Warning: OPENAI_API_KEY is undefined. Make sure it is set in GitHub/ENV');
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

const MAX_TOKENS_PER_CHUNK = 3000;
const MAX_FILE_SIZE = 100_000; // ~100 KB

export async function analyzeRepository(
    repoFullName: string,
    githubToken: string,
    selectedBranch: string
) {
  console.log('[analyzeRepository] Starting with:', {
    repoFullName,
    githubTokenProvided: githubToken ? 'YES' : 'NO',
    selectedBranch,
  });

  const [owner, repoName] = repoFullName.split('/');
  const treeUrl = `https://api.github.com/repos/${owner}/${repoName}/git/trees/${selectedBranch}?recursive=1`;
  console.log('[analyzeRepository] Fetching tree from =>', treeUrl);

  const treeResp = await axios.get<GitTreeResponse>(treeUrl, {
    headers: { Authorization: `Bearer ${githubToken}` },
  });
  console.log('[analyzeRepository] GitHub tree response:', treeResp.status, treeResp.statusText);

  const data = treeResp.data;
  const files = data.tree.filter(item => item.type === 'blob');
  console.log('[analyzeRepository] Blob files found:', files.length);

  // 1) Fetch file contents
  const fileContents = await Promise.all(
      files.map(async (file) => {
        const fileUrl = `https://api.github.com/repos/${owner}/${repoName}/contents/${file.path}?ref=${selectedBranch}`;
        try {
          const fileResp = await axios.get(fileUrl, {
            headers: { Authorization: `Bearer ${githubToken}` },
          });
          const fileData = fileResp.data;
          const decoded = Buffer.from(fileData.content, 'base64').toString('utf-8');
          return {
            path: file.path,
            size: fileData.size || 0,
            content: decoded,
          };
        } catch (err) {
          console.error(`[ERROR] Skipping file ${file.path}:`, err instanceof Error ? err.message : err);
          return {
            path: file.path,
            size: 0,
            content: '',
          };
        }
      })
  );

  // 2) Filter out large/unimportant files
  const skipPatterns = [
    /node_modules/i,
    /\.git/i,
    /venv/i,
    /\.dockerfile$/i,
    /\.gitignore$/i,
    /package(-lock)?\.json$/i,
    /\.env$/i,
    /dist/i,
    /\.(png|jpe?g|gif|svg|ico|bmp|webp)$/i,
    /\.md$/i
  ];

  const filteredFiles = fileContents.filter(f => {
    if (!f.content || f.size > MAX_FILE_SIZE) return false;
    const shouldSkip = skipPatterns.some(p => p.test(f.path));
    if (shouldSkip) {
      console.log(`[SKIP] Ignored file: ${f.path}`);
    }
    return !shouldSkip;
  });

  console.log(`[FILTERED] Remaining files for summarization: ${filteredFiles.length}`);

  // 3) Summarize each file in chunks
  const allSummaries: string[] = [];
  for (const file of filteredFiles) {
    console.log(`\n[SUMMARIZE] File: ${file.path}`);
    const tokens = encode(file.content);
    console.log(`[TOKEN COUNT] ${file.path}: ${tokens.length}`);

    const totalChunks = Math.ceil(tokens.length / MAX_TOKENS_PER_CHUNK);
    const fileSummaries: string[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const chunk = tokens.slice(
          i * MAX_TOKENS_PER_CHUNK,
          (i + 1) * MAX_TOKENS_PER_CHUNK
      );
      const chunkText = decode(chunk);
      console.log(`[CHUNK] ${file.path} [${i + 1}/${totalChunks}]`);

      try {
        const summary = await getSummaryFromOpenAI(chunkText, file.path, i + 1);
        fileSummaries.push(summary);
      } catch (err) {
        console.error(`[ERROR] Summarizing chunk ${i + 1} of ${file.path}:`, err);
        fileSummaries.push(`(Error summarizing chunk ${i + 1})`);
      }
    }

    allSummaries.push(...fileSummaries);
  }

  console.log(`[MERGE] Total summaries collected: ${allSummaries.length}`);

  // 4) Construct final “user manual” prompt with expanded instructions
  const finalPrompt = `
You are a senior software engineer, fully immersed in this codebase. 
Your goal is to produce a thorough, professional user manual that covers:
• The overall architecture and how the components fit together
• The primary purpose and value proposition of the project
• Step-by-step instructions on how to set up, install, or run the app
• Relevant configuration or environment variables and how they are used
• Best practices for contributing or extending functionality
• Any known limitations or pitfalls that developers should watch for

Below are the code summaries from multiple files in this repo. 
Using these details, craft a cohesive, structured manual that helps new developers quickly understand the project and how to contribute effectively.

${allSummaries.map((s, i) => `Summary ${i + 1}:\n${s}`).join('\n\n')}

If any details are unclear, infer them based on best practices for Node.js/TypeScript apps. 
Make sure your final write-up is well-organized, with clear sections, bullet points, and headings.
  `;

  const manualResponse = await callOpenAI(finalPrompt);
  console.log('[OPENAI] User manual generated, length:', manualResponse.length);

  return { userManual: manualResponse };
}

async function getSummaryFromOpenAI(chunkText: string, filePath: string, chunkNum: number): Promise<string> {
  console.log(`[OPENAI] Requesting summary for: ${filePath}, chunk ${chunkNum}`);

  const messages = [
    {
      role: 'system',
      content: 'You are a senior software engineer helping write technical documentation.',
    },
    {
      role: 'user',
      content: `This is chunk ${chunkNum} from the file "${filePath}":\n\n${chunkText}\n\nSummarize what this code does.`,
    },
  ];

  const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages,
        temperature: 0.2,
        max_tokens: 512,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
  );

  return res.data.choices[0].message.content.trim();
}

async function callOpenAI(prompt: string): Promise<string> {
  const messages = [
    { role: 'system', content: 'You are a professional documentation writer.' },
    { role: 'user', content: prompt },
  ];

  const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-3.5-turbo',
        messages,
        temperature: 0.4,
        max_tokens: 1500,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
  );

  return res.data.choices[0].message.content.trim();
}

function decode(tokens: number[]): string {
  return new TextDecoder().decode(Uint8Array.from(tokens));
}
