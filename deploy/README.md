# VPS Docker Deployment

This service is intended to run as a Docker container in the same Docker network as Navidrome.

## Assumptions

- Navidrome container name: `navidrome`
- Docker network: `atiende-plus_default`
- Host music directory: `/opt/navidrome/music`
- Navidrome reads music as read-only.
- This proxy writes downloaded music to the same host music directory.

## Files

- `Dockerfile`: production image with Node.js, ffmpeg, ffprobe, and yt-dlp.
- `compose.proxy.example.yml`: standalone compose file for the proxy container.
- `deploy/env.vps.example`: production environment template.

## Deploy Outline

```bash
git clone https://github.com/derian-rods/navidrome-catalog-proxy.git /opt/navidrome-catalog-proxy
cd /opt/navidrome-catalog-proxy
cp deploy/env.vps.example .env
cp compose.proxy.example.yml docker-compose.yml
docker compose up -d --build
```

## Runtime Checks

```bash
docker logs -f navidrome-catalog-proxy
docker exec navidrome-catalog-proxy node --version
docker exec navidrome-catalog-proxy ffmpeg -version
docker exec navidrome-catalog-proxy yt-dlp --version
```

From another container on the same Docker network, or from the host if exposed through your routing layer:

```bash
curl http://navidrome-catalog-proxy:4540/health
curl http://navidrome-catalog-proxy:4540/api/tools
curl http://navidrome-catalog-proxy:4540/api/catalog/stats
```

## Volumes

The proxy needs write access to the music directory:

```yaml
- /opt/navidrome/music:/music:rw
```

Navidrome itself can keep its music mount read-only.

## Permissions

The proxy container runs as UID/GID `1001:1001` in the example compose file so it can write to `/opt/navidrome/music` when that directory is owned by `1001:1001`.

Prepare persistent folders on the host:

```bash
mkdir -p data cache downloads secrets
chown -R 1001:1001 data cache downloads
```

## YouTube Cookies

If YouTube requires bot verification, export YouTube cookies in Netscape format and mount them at:

```text
./secrets/youtube-cookies.txt
```

Recommended permissions:

```bash
chown 1001:1001 secrets/youtube-cookies.txt
chmod 600 secrets/youtube-cookies.txt
```

The compose example passes:

```env
YTDLP_COOKIES_FILE=/app/secrets/youtube-cookies.txt
YTDLP_JS_RUNTIME=node:/usr/local/bin/node
```

The service passes `--no-cookies-update` to `yt-dlp`, so the cookies file can stay mounted read-only.

## Cleanup Safety

Cleanup is disabled by default:

```env
CLEANUP_ENABLED=false
CLEANUP_DRY_RUN=true
```

When enabled later, the cleanup workflow only targets tracks downloaded by this proxy and uses quarantine before deletion.
