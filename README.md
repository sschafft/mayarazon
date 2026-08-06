# mayarazon.com

Maya Razon's personal website — a Jekyll site hosted on GitHub Pages at
[mayarazon.com](https://mayarazon.com).

## How the site is put together

| Path | Purpose |
|---|---|
| `_data/content.json` | **All site copy lives here.** Edit this file to change any text. |
| `index.html` | Page structure (Liquid template reading `content.json`) |
| `_layouts/default.html` | HTML shell: fonts, meta, editor loader |
| `assets/css/main.css` | All styling (terracotta palette from the original design) |
| `assets/js/editor.js` | The in-browser inline editor |
| `CNAME` | Custom domain binding for GitHub Pages |

Pushing to `main` republishes the site automatically (GitHub Pages builds
Jekyll natively — no CI setup). Builds take about a minute.

## Editing copy in the browser

The site has a built-in inline editor that commits straight to this repo.

1. Visit [mayarazon.com/#edit](https://mayarazon.com/#edit) (or press
   **Cmd/Ctrl + Shift + E** on any page).
2. Click **Sign in with GitHub** and approve in the popup (first time
   only per browser). The resulting token is checked for push access to
   this repo and kept in that browser's localStorage.
3. Click **✎ Edit page** — every editable text gets a dashed outline. Click
   and type.
4. Click **Save → commit**. The editor writes your changes into
   `_data/content.json` and commits via the GitHub API. The live site
   updates about a minute later.

Authorization is enforced by GitHub, not the page: a commit only succeeds
if the signed-in account has push access to `sschafft/mayarazon`. Visitors
without it can type in the boxes all day — nothing can be saved.

### How sign-in works

GitHub's OAuth token exchange can't be done from a static page (no CORS),
so a ~40-line proxy in [`oauth-proxy/`](oauth-proxy/) is deployed at
`https://mayarazon-oauth.vercel.app` (Vercel project `mayarazon-oauth`).
It holds the OAuth App's client secret, exchanges the login code for a
token, and posts the token back to the page — nothing else. The site
itself is served entirely by GitHub Pages.

The OAuth App requests the `public_repo` scope (write to the account's
public repos) — that's GitHub's narrowest OAuth-app scope that can commit
here. **Use a token** in the sign-in bar is the fallback: a fine-grained
PAT (Repository access → this repo only; Permissions → Contents: Read &
write) is tighter-scoped if you ever care.

Use **Sign out** in the editor bar to remove the credential from a browser.

### What the editor can't edit

Link URLs, images, section structure, and styling — edit those in the repo
(`_data/content.json` for hrefs, `index.html` / `main.css` for the rest).
For the client list, edit the text between the `·` separators; the editor
splits on `·` when saving.

## Local preview (optional)

```sh
gem install bundler jekyll
jekyll serve
# → http://localhost:4000
```
