# Chez YouTube Tool

PWA y backend en Cloudflare para centralizar comentarios de YouTube, preparar respuestas, revisar decisiones y construir un perfil de estilo de Chez Team.

## Estado

Primera base ejecutable:

- PWA responsive e instalable.
- Cloudflare Worker con API REST.
- Base D1 con comentarios, propuestas, revisiones, publicaciones y aprendizaje de estilo.
- Acciones para aceptar, editar, rechazar o marcar “no responder”.
- Endpoints preparados para el GPT privado.
- Workflow de GitHub Actions que crea D1, aplica migraciones y despliega Worker + assets.
- Cron configurado cada 15 minutos.

La conexión OAuth con YouTube y la publicación real se implementan en la siguiente etapa.

## Tecnología

- Cloudflare Workers
- Cloudflare D1
- Workers Static Assets
- HTML, CSS y JavaScript
- PWA / Service Worker

## Desarrollo

```bash
npm install
npm run check
npm test
npm run dev
```

## Deploy

- Carpeta: `apps/chez-youtube-tool`
- Worker: `chez-youtube-tool`
- Workflow: `.github/workflows/deploy-chez-youtube-tool.yml`
- URL prevista: `https://chez-youtube-tool.<subdominio-workers>.workers.dev`

## Secretos futuros

No deben guardarse en el repositorio:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `TOKEN_ENCRYPTION_KEY`
- `GPT_SHARED_SECRET`
- `ALLOWED_EMAILS`

## API del GPT

Autenticación futura:

```text
Authorization: Bearer GPT_SHARED_SECRET
```

Endpoints iniciales:

- `GET /api/gpt/pending-comments`
- `GET /api/gpt/style-profile`
- `POST /api/gpt/proposals/batch`

## Próxima etapa

1. Implementar Google OAuth.
2. Sincronizar videos, comentarios e hilos.
3. Publicar respuestas aprobadas.
4. Proteger la PWA con Cloudflare Access.
5. Crear la Action del GPT privado Chez YouTube.
