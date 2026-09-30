<!-- SPDX-License-Identifier: EUPL-1.2 -->
# The public site is a separate, prerendered Angular app

The public homepage and developer docs live in their own Angular app (`site`), prerendered to static files at build time, so search engines index real HTML without a Node process rendering each request; the task app (`pwa`) is client-rendered, zoneless and offline-capable through the Angular service worker. Keeping them apart avoids the known conflict between server rendering and the service worker's index file (angular/angular-cli#28574) and keeps homepage visitors from downloading the app; per-request rendering with `AngularAppEngine` stays available if the site ever needs content that changes per request.
