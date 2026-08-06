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
2. Paste a GitHub token (see below) the first time. It is checked for push
   access to this repo and kept in that browser's localStorage.
3. Click **✎ Edit page** — every editable text gets a dashed outline. Click
   and type.
4. Click **Save → commit**. The editor writes your changes into
   `_data/content.json` and commits via the GitHub API. The live site
   updates about a minute later.

Authorization is enforced by GitHub, not the page: a commit only succeeds
if the token's owner has push access to `sschafft/mayarazon`. Visitors
without one can type in the boxes all day — nothing can be saved.

### Creating a token

GitHub → Settings → Developer settings → **Fine-grained personal access
tokens** → Generate new token:

- **Repository access:** Only select repositories → `sschafft/mayarazon`
- **Permissions:** Contents → **Read and write** (nothing else)
- Set an expiry you're comfortable with.

Use **Sign out** in the editor bar to remove the token from a browser.

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
