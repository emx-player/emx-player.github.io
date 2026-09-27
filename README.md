# EMX Player

Opens EMX records (the `.emx.html` gift files EMX presses at the end of a run) on any device, including
iPhone, where a file opened from Files or Messages shows only a still preview.

**https://emx-player.github.io/**

The player has an origin of its own, the `emx-player` organization's site, rather than a folder on a
shared one. Browsers keep storage, caches and service workers per origin, so no other site can read or
clear what the player keeps, and nothing unrelated is served from the address a record opens under.

## How it works

- Pick a record, or drop it on the page. The file is read on this device; nothing is uploaded.
- The record runs in a sandboxed frame (`sandbox="allow-scripts allow-downloads"`) from a `blob:` URL.
  Without `allow-same-origin` it gets an opaque origin, so a file can't reach the player's page or
  storage.
- The page's `frame-src blob:` policy refuses any navigation of that frame away from `blob:`, so a file
  can't put another page under this address; a file that tries after it has loaded is closed.
- A service worker keeps the page's own files, so the player opens offline; Add to Home Screen installs it.

## What is not here

No songs, no analytics, no third-party requests, and no Fontshare font files: the ITF Free Font
License forbids distributing them through a public repository. The page uses system fonts, and so do
records: their title is drawn into an image when they're pressed.

## The address is load-bearing

Every record links to this address: don't rename the `emx-player` organization or the
`emx-player.github.io` repo.

## Develop

The test and the icon tool need Playwright to be resolvable, for example through `npm i -D playwright`
or `NODE_PATH=<your playwright node_modules>`.

```bash
EMX_WEB=<path to an emx-web checkout> node test/player.test.cjs   # local, served at the site root
EMX_WEB=<path to an emx-web checkout> PLAYER_URL=https://emx-player.github.io/ node test/player.test.cjs   # the live site
node tools/make-icons.cjs                                          # icon.svg → the PNG icons
```

The test presses a record with emx-web's `demo/record-fixtures.cjs` into a temp directory; no record
is ever committed here.
