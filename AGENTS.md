# AGENTS.md — asset-browser rules for any AI agent working on a project that has `asset-browser/` installed

**Her proje dizininde `asset-browser/` klasörü varsa, bu dosyanın kurallarına uy.**

## Asset üretme akışı (zorunlu)

1. **Yeni asset ihtiyacı** olduğunda → önce `asset-browser/data/missing.json` içine ekle (prompt, priority, kind, type dahil).
2. **Hali hazırda var mı** kontrolü → deploy URL'sini aç, arama yap. Duplicate üretme.
3. **Üretimi** kullanıcı yapar (GPT/DALL-E ile). Sen üretme, prompt hazırla.
4. **Upload** kullanıcı tarafından UI üzerinden yapılır → `waiting-for-review`.
5. **Review** sen yaparsın:
   - Uygun → `status: "approved"`, asset'i `config.json` sources'taki uygun dizine taşı/dönüştür (WebP pipeline).
   - Uygun değil → `status: "denied"` + `denyReason` alanı ekle. UI kullanıcıya neden reddedildiğini gösterir.

## missing.json schema

```json
{
  "name": "unique_asset_name",
  "kind": "Character | Building | FX | Cart | Icon | Tile | UI | Nature | Other",
  "type": "Resim | Animasyon",
  "priority": "P0 | P1 | P2 | P3",
  "status": "todo | in-progress | waiting-for-review | approved | denied",
  "notes": "short human note (one line)",
  "prompt": "Full generation prompt — self-contained, ASCII-only, ready to paste into GPT",
  "uploadedFile": "filename (only when waiting-for-review)",
  "denyReason": "why denied (only when denied)"
}
```

## Prompt yazım kuralları

- **ASCII-only** (x yerine x, -> yerine ->, vb. — Unicode özel karakter yok; kopyala-yapıştır korur)
- **Boyut + format + frame sayısı** net (256x256, 6 frame horizontal strip, transparent PNG)
- **Referans asset** belirt ("match style/palette/proportions of <existing_file>.webp exactly")
- **Anchor/konum sabitliği** vurgula ("position IDENTICAL across frames, only X changes")
- **Style lock** — her prompt'un sonuna projenin sabit stil tanımı

## Paket güncelleme

- Paket reposu: https://github.com/SkyWalker2506/asset-browser
- Kod değişikliği yaparken `~/Projects/asset-browser/` içinde düzelt → commit + push → her projede `./install.sh` tekrar çalıştır.
- `config.json`, `data/missing.json`, `data/uploads/` — install'da korunur, asla overwrite etme.

## Deploy

```bash
cd <project>/asset-browser
npm run build
vercel --prod --yes --scope skywalker2506s-projects
# İlk kez: vercel env add GITHUB_TOKEN production
```

## Asla

- `data/missing.json` içinde manuel olarak `uploadedFile` setleme — sadece `/api/upload` yapar.
- Upload'u override etmek için direkt GitHub commit atma — `/api/delete` + yeniden upload akışını kullan.
- Prompt'ta Unicode özel karakter kullanma.
- Kullanıcı onaylamadan status'ü `approved` yapma.
