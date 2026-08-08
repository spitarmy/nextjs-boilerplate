const fs = require('fs');
const path = require('path');

const basePath = '/Users/spitarmy/.gemini/antigravity/scratch/nextjs-boilerplate';
const files = [
  "app/api/assess/route.ts",
  "app/api/usage/route.ts",
  "app/api/user-settings/route.ts",
  "app/api/admin/usage/route.ts",
  "app/api/assess/result/route.ts",
  "app/api/assess/enqueue/route.ts",
  "app/api/assess/worker/route.ts",
  "app/api/keepalive/route.ts"
];

for (const relPath of files) {
  const f = path.join(basePath, relPath);
  if (!fs.existsSync(f)) {
    console.log(`File not found: ${f}`);
    continue;
  }
  let content = fs.readFileSync(f, 'utf8');
  
  content = content.replace(/import\s*\{\s*supabase\s*\}\s*from\s*["']([^"']+\/lib\/)supabase["'];?/, 'import { supabaseAdmin } from "$1supabaseAdmin";');
  
  content = content.replace(/\bsupabase\./g, 'supabaseAdmin.');

  fs.writeFileSync(f, content, 'utf8');
  console.log(`Updated ${relPath}`);
}
