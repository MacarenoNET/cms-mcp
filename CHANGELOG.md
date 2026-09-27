# Changelog

Todos los cambios notables de este proyecto se documentan en este archivo.

El formato se basa en [Keep a Changelog](https://keepachangelog.com/es-ES/1.0.0/),
y este proyecto adhiere a [Semantic Versioning](https://semver.org/lang/es/).

## [Unreleased]

### Removed

- Campo `category` del tipo `CoverPayload` (`src/cms-client.ts`) y de los parámetros de las tools
  `admin_compose_cover` y `admin_generate_social_image` (`src/create-server.ts`).
- Placeholder `{category}` de las descripciones de `admin_create_template` y `admin_update_template`.
  La API ya no lo soporta; el placeholder equivalente es `{genres}`.

### Changed

- Documentación (`README.md`): la tabla de tools de administración se reconstruyó contra el registro real
  del servidor. Corrige cuatro nombres inexistentes (`admin_list_categories`, `admin_generate_image`,
  `admin_delete_media` y la omisión de `admin_publish_article`) y añade las ~40 tools que faltaban
  (taxonomías, plantillas, portadas, publicaciones y prompts sociales, enlaces cortos y analíticas GA4).