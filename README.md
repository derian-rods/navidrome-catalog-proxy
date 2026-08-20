# Navidrome Catalog Proxy

Subsonic-compatible proxy for Navidrome that will add a YouTube-backed virtual catalog and download tracks on demand.

## Goal

- Symfonium and other Subsonic clients connect to this proxy instead of Navidrome directly.
- Local library requests are passed through to Navidrome.
- Remote YouTube results are exposed as virtual tracks.
- Playing a virtual track downloads it, tags it, stores it under the Navidrome music directory, and serves it back.

## First Milestone

This bootstrap provides:

- Fastify service skeleton.
- Environment-based configuration.
- Health endpoint.
- Tool discovery endpoint.
- Placeholder Subsonic ping/license endpoints.

## Development

```powershell
npm install
npm run dev
```

Health check:

```powershell
curl http://127.0.0.1:4540/health
```

Tool check:

```powershell
curl http://127.0.0.1:4540/api/tools
```

## Planned Features

- Subsonic passthrough to Navidrome.
- YouTube search via `yt-dlp`.
- Ranking that prioritizes `official audio`, `lyrics`, `letra`, `Topic`, and `visualizer`.
- On-demand download and stream for `yt:*` IDs.
- Metadata and cover resolution using iTunes, MusicBrainz, Cover Art Archive, and optional AcoustID.
- Weekly cleanup with quarantine, never direct deletion.

## Docker Deployment

See `deploy/README.md` and `compose.proxy.example.yml` for the VPS Docker deployment template.
