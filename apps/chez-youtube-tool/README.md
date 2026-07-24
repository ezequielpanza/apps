# Chez YouTube Tool

PWA y backend en Cloudflare para centralizar comentarios de YouTube, preparar respuestas, revisar decisiones y construir un perfil de estilo de Chez Team.

## Estado

Segunda base ejecutable:

- PWA responsive e instalable.
- Cloudflare Worker con API REST.
- Base D1 con comentarios, propuestas, revisiones, publicaciones y aprendizaje de estilo.
- Google OAuth 2.0 con PKCE y protección `state`.
- Tokens de YouTube cifrados con AES-GCM antes de guardarse en D1.
- Renovación automática del access token mediante refresh token.
- Sincronización de videos y comentarios del canal.
- Cron configurado cada 15 minutos.
- Acciones para aceptar, editar, rechazar o marcar “no responder”.
- Publicación de respuestas aprobadas mediante `comments.insert`.
- Endpoints preparados para el GPT privado.
- Workflow de GitHub Actions que crea D1, aplica migraciones, despliega y configura secretos.

## Tecnología

- Cloudflare Workers
- Cloudflare D1
- Workers Static Assets
- HTML, CSS y JavaScript
- PWA / Service Worker
- YouTube Data API v3
- Google OAuth 2.0

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
- URL: se obtiene del resultado de `wrangler deploy`

## Secretos de GitHub Actions

Además de los secretos globales de Cloudflare, el repositorio debe contener:

- `CHEZ_YOUTUBE_GOOGLE_CLIENT_ID`
- `CHEZ_YOUTUBE_GOOGLE_CLIENT_SECRET`
- `CHEZ_YOUTUBE_TOKEN_ENCRYPTION_KEY`
- `CHEZ_YOUTUBE_GPT_SHARED_SECRET`
- `CHEZ_YOUTUBE_ALLOWED_EMAILS`

El workflow los carga en el Worker con estos nombres internos:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `TOKEN_ENCRYPTION_KEY`
- `GPT_SHARED_SECRET`
- `ALLOWED_EMAILS`

No deben guardarse valores reales dentro del repositorio.

## Configuración de Google Cloud

1. Crear o elegir un proyecto en Google Cloud.
2. Habilitar **YouTube Data API v3**.
3. Configurar la pantalla de consentimiento OAuth.
4. Crear credenciales OAuth de tipo **Web application**.
5. Agregar como URI de redirección autorizada:

```text
https://<URL-DEL-WORKER>/api/youtube/callback
```

6. Guardar el Client ID y Client Secret en los secretos de GitHub indicados arriba.
7. Abrir la PWA, entrar en **Ajustes** y pulsar **Conectar / renovar**.

El scope utilizado es:

```text
https://www.googleapis.com/auth/youtube.force-ssl
```

## Flujo de comentarios

```text
YouTube → sincronización → comentario pendiente → propuesta →
aceptar/editar/rechazar/no responder → publicar → aprendizaje
```

La publicación solo se habilita después de aceptar o editar una propuesta.

## API del GPT

Autenticación:

```text
Authorization: Bearer GPT_SHARED_SECRET
```

Endpoints iniciales:

- `GET /api/gpt/pending-comments`
- `GET /api/gpt/style-profile`
- `POST /api/gpt/proposals/batch`

## Pendiente

1. Proteger la PWA con Cloudflare Access y configurar los emails permitidos.
2. Crear la Action OpenAPI del GPT privado Chez YouTube.
3. Añadir filtros y procesamiento por episodio.
4. Construir reglas de estilo sugeridas a partir de correcciones repetidas.
