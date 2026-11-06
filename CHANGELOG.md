# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

### Added — 2026-11-06

- **17 herramientas de posts y cuentas**: `admin_list_posts`, `admin_get_post`, `admin_create_post`, `admin_update_post`,
  `admin_delete_post`, `admin_schedule_post`, `admin_unschedule_post`, `admin_publish_post`, `admin_mark_post_published`,
  `admin_unpublish_post`, `admin_generate_post_image`, `admin_generate_post_copy`, `admin_posts_capabilities`,
  `admin_posts_scheduler_status`, `admin_list_social_accounts`, `admin_test_social_account` y
  `admin_set_default_social_account`. Los tokens de las redes no se cargan por el MCP: se guardan en el admin.

### Deprecated — 2026-11-06

- Las 13 herramientas de `social_publication` y de reels de LinkedIn (por ejemplo `admin_create_social_publication`)
  quedan marcadas `[DEPRECATED, use …]`; siguen funcionando mientras exista la capa de compatibilidad.

### Added

- Herramientas de **reels**: `admin_reel_upload_url`, `admin_upsert_reel`, `admin_list_reels`, `admin_get_reel`,
  `admin_reel_download_url`, `admin_update_reel_post` y `admin_delete_reel`.
### Removed

- Campo `category` del tipo `CoverPayload` (`src/cms-client.ts`) y de los parámetros de las tools
  `admin_compose_cover` y `admin_generate_social_image` (`src/create-server.ts`).
- Placeholder `{category}` de las descripciones de `admin_create_template` y `admin_update_template`.
  La API ya no lo soporta; el placeholder equivalente es `{genres}`.

### Changed

- El idioma por defecto de las tools pasa de `es` a `pt`: `list_articles`, `get_article`
  (`src/cms-client.ts`) y el ejemplo de `admin_create_short_link`, que ahora propone el alias sin
  idioma `https://www.macareno.net/articles/{id}` en vez de una URL con `/es/`. El sitio público
  pasó a tener portugués como idioma por defecto y a resolver el idioma del visitante, así que el
  destino del enlace no debe fijar uno.
- Documentación (`README.md`): la tabla de tools de administración se reconstruyó contra el registro real
  del servidor. Corrige cuatro nombres inexistentes (`admin_list_categories`, `admin_generate_image`,
  `admin_delete_media` y la omisión de `admin_publish_article`) y añade las ~40 tools que faltaban
  (taxonomías, plantillas, portadas, publicaciones y prompts sociales, enlaces cortos y analíticas GA4).