// GET /api/uploaded?file=xxx.png — proxy uploaded file from GitHub
import { readConfig, gh } from './_config.js';

export default async function handler(req, res) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN env var not set' });
  const config = readConfig();
  const branch = config.github?.branch || 'main';
  const uploadPrefix = config.uploadPath || 'asset-browser/data/uploads';
  const file = (req.query?.file || new URL(req.url, 'http://x').searchParams.get('file') || '').replace(/[^A-Za-z0-9._-]/g, '');
  if (!file) return res.status(400).json({ error: 'file required' });

  try {
    const meta = await gh(token, `${uploadPrefix}/${file}`, { ref: branch, github: config.github });
    const buf = Buffer.from(meta.content, 'base64');
    const ext = (file.split('.').pop() || '').toLowerCase();
    const mime = { png: 'image/png', webp: 'image/webp', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg' }[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.status(200).send(buf);
  } catch (e) {
    res.status(404).json({ error: String(e.message || e) });
  }
}
