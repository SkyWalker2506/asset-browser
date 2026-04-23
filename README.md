# asset-browser

Reusable asset browser for game/creative projects. Scans your project's asset dirs, generates a searchable/filterable web UI, handles "missing assets" workflow with prompts + upload + review.

## Features

- **Browse** existing assets: filter by type (image/animation), category, kind, format
- **Download** any asset (original filename preserved)
- **Missing tab**: list pending assets with detailed prompts + copy-to-GPT button
- **Upload** raw generated files; status flips to `waiting-for-review`
- **Review workflow**: approve or deny (with reason) via `missing.json` edits
- Auto-deploys to Vercel; commits via GitHub API on upload

## Install into a project

```bash
cd ~/Projects/asset-browser
./install.sh /path/to/YourProject YourGitHubUser/YourRepo
```

This creates `YourProject/asset-browser/` with `config.json`, scripts, api, public. Edit `config.json` to point at your asset dirs.

## Per-project config

`config.json`:
```json
{
  "title": "My Game",
  "projectRoot": "..",
  "sources": [
    { "dir": "public/assets", "category": "Runtime", "tag": "game" },
    { "dir": "assets/raw", "category": "Raw", "tag": "raw" }
  ],
  "github": { "owner": "user", "repo": "repo", "branch": "main" },
  "uploadPath": "asset-browser/data/uploads"
}
```

## Deploy

```bash
cd YourProject/asset-browser
npm run build
vercel --prod
vercel env add GITHUB_TOKEN production   # paste token with repo write
vercel --prod                              # redeploy with env
```

## Missing items schema (`data/missing.json`)

```json
{
  "name": "fire_loop_6f",
  "kind": "FX",
  "type": "Animasyon",
  "priority": "P0",
  "status": "todo",
  "notes": "short human note",
  "prompt": "Full GPT prompt to generate this asset..."
}
```

Status: `todo | in-progress | waiting-for-review | approved | denied`.
When denied, add `denyReason` field.
