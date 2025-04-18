/* =====================================================
   documentService.ts           ✨ 2025‑04‑patch
   Build a *concrete* user manual from a GitHub repo
===================================================== */
import axios from 'axios';
import { encode } from 'gpt-tokenizer';

const OPENAI_API_KEY = process.env.GPT_API_KEY;
if (!OPENAI_API_KEY) {
  console.error(
      '❌ GPT_API_KEY missing – generation will fail. ' +
      'Make sure the user key was stored or .env is populated.'
  );
}

/* ---------------- types ---------------- */
interface TreeItem {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
}
interface GitTreeResponse {
  tree: TreeItem[];
}

/* ---------------- tuning ---------------- */
const MAX_TOKENS_PER_CHUNK = 3_000;      // keep each request < 8K context
const MAX_FILE_SIZE        = 120_000;    // ~120 KB

/* =====================================================================
   MAIN ENTRY – called from documentsRouter
===================================================================== */
export async function analyzeRepository(
    repoFullName: string,
    githubToken: string,
    branch: string
) {
  const [owner, repo] = repoFullName.split('/');
  /* 1 ▸ get *entire* file tree */
  const treeRes = await axios.get<GitTreeResponse>(
      `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`,
      { headers: { Authorization: `Bearer ${githubToken}` } }
  );
  const blobs = treeRes.data.tree.filter((t) => t.type === 'blob');

  /* 2 ▸ fetch file contents (parallel) */
  const fileContents = await Promise.all(
      blobs.map(async (f) => {
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${f.path}?ref=${branch}`;
        try {
          const r = await axios.get(url, {
            headers: { Authorization: `Bearer ${githubToken}` },
          });
          return {
            path: f.path,
            size: r.data.size as number,
            content: Buffer.from(r.data.content, 'base64').toString('utf-8'),
          };
        } catch {
          return { path: f.path, size: 0, content: '' }; // skip on error
        }
      })
  );

  /* 3 ▸ filter out truly useless stuff (keep docs!) */
  const SKIP = [
    /node_modules/i,
    /\.git/i,
    /dist\//i,
    /\.(png|jpe?g|gif|svg|webp|ico|bmp)$/i,
    /\.lock$/i,
  ];
  const useful = fileContents.filter(
      (f) =>
          f.content &&
          f.size < MAX_FILE_SIZE &&
          !SKIP.some((re) => re.test(f.path))
  );

  /* 4 ▸ summarise each file in token‑chunks */
  const summaries: string[] = [];
  for (const file of useful) {
    const tokens = encode(file.content);
    const chunks = Math.ceil(tokens.length / MAX_TOKENS_PER_CHUNK);

    for (let i = 0; i < chunks; i++) {
      const text = new TextDecoder().decode(
          Uint8Array.from(
              tokens.slice(
                  i * MAX_TOKENS_PER_CHUNK,
                  (i + 1) * MAX_TOKENS_PER_CHUNK
              )
          )
      );

      const summary = await openaiSummarise(
          file.path,
          i + 1,
          chunks,
          text
      );
      summaries.push(summary);
    }
  }

  /* 5 ▸ ask GPT‑4o for the *final* manual */
  const manual = await openaiAssembleManual(
      repoFullName,
      branch,
      summaries
  );

  return { userManual: manual };
}

/* =====================================================================
   OpenAI helpers
===================================================================== */
async function openaiSummarise(
    path: string,
    idx: number,
    total: number,
    content: string
) {
  const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
                'You are an expert engineer. Produce a concise bullet‑style summary of the code the user sends.',
          },
          {
            role: 'user',
            content: `File: ${path}  (chunk ${idx}/${total})\n\n${content}`,
          },
        ],
        max_tokens: 400,
        temperature: 0.1,
      },
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
  );
  return res.data.choices[0].message.content.trim();
}

async function openaiAssembleManual(
    repoFull: string,
    branch: string,
    summaries: string[]
) {
  const res = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
                'You are a professional technical writer. Build a COMPLETE, concrete developer guide. ' +
                'ONLY use information you are certain about; if a detail is unknown, leave the section out.',
          },
          {
            role: 'user',
            content: `Repository ${repoFull} (branch ${branch}) – extracted summaries:\n\n${summaries.join(
                '\n\n'
            )}`,
          },
        ],
        max_tokens: 4_000,
        temperature: 0.25,
      },
      { headers: { Authorization: `Bearer ${OPENAI_API_KEY}` } }
  );
  return res.data.choices[0].message.content.trim();
}
