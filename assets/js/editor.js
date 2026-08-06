/* Inline copy editor for mayarazon.com
 *
 * Edits elements annotated with data-edit / data-edit-html / data-edit-list,
 * maps them back onto _data/content.json, and commits the result to GitHub
 * via the Contents API. GitHub Pages then rebuilds the site (~1 min).
 *
 * Authorization is enforced by GitHub itself: commits only succeed with a
 * token whose owner has push access to the repository. The token is a
 * fine-grained personal access token (Contents: Read & write on this repo),
 * stored in localStorage on this browser only.
 */
(() => {
  'use strict';

  const OWNER = 'sschafft';
  const REPO = 'mayarazon';
  const BRANCH = 'main';
  const DATA_PATH = '_data/content.json';
  const LS_TOKEN = 'mr_gh_token';
  const API = 'https://api.github.com';
  // OAuth proxy (oauth-proxy/ in this repo, deployed on Vercel). GitHub's
  // token-exchange endpoint has no CORS, so a static site cannot complete
  // the OAuth flow alone — this tiny function does the exchange and posts
  // the token back to this page.
  const OAUTH_PROXY = 'https://mayarazon-oauth.vercel.app';

  const state = {
    token: null,
    login: null,
    editing: false,
    originals: new Map(), // element -> original value
  };

  // ---------- utilities ----------

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const b64decode = (b64) =>
    new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));
  const b64encode = (str) => {
    const bytes = new TextEncoder().encode(str);
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin);
  };

  const getPath = (obj, path) =>
    path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
  const setPath = (obj, path, value) => {
    const keys = path.split('.');
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) o = o[keys[i]];
    o[keys[keys.length - 1]] = value;
  };

  const api = async (path, opts = {}) => {
    const res = await fetch(API + path, {
      ...opts,
      cache: 'no-store', // GitHub API sends max-age=60; consecutive saves must see fresh content

      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: 'Bearer ' + state.token,
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = new Error(body.message || res.status + ' ' + res.statusText);
      err.status = res.status;
      throw err;
    }
    return res.json();
  };

  // Editable-field value extraction
  const readValue = (el) => {
    if (el.hasAttribute('data-edit-html')) return cleanHTML(el);
    if (el.hasAttribute('data-edit-list'))
      return el.textContent.split('·').map((s) => s.trim()).filter(Boolean);
    // textContent, not innerText: innerText reflects rendered text, so CSS
    // text-transform:uppercase would get baked into the saved copy.
    return el.textContent.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
  };
  const pathOf = (el) =>
    el.getAttribute('data-edit') || el.getAttribute('data-edit-html') || el.getAttribute('data-edit-list');

  // Minimal sanitizer for HTML fields: keep em/strong/br/a, drop everything else.
  const cleanHTML = (el) => {
    const clone = el.cloneNode(true);
    const walk = (node) => {
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const tag = child.tagName.toLowerCase();
          if (['em', 'strong', 'br', 'a'].includes(tag)) {
            for (const attr of Array.from(child.attributes)) {
              if (!(tag === 'a' && ['href', 'target', 'rel'].includes(attr.name)))
                child.removeAttribute(attr.name);
            }
            walk(child);
          } else {
            // unwrap: replace element with its children
            while (child.firstChild) node.insertBefore(child.firstChild, child);
            node.removeChild(child);
          }
        }
      }
    };
    walk(clone);
    return clone.innerHTML.replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
  };

  // ---------- UI ----------

  const css = `
    .mre-bar{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:1000;
      background:#33302B;color:#F7EFE3;border-radius:24px;padding:10px 14px;
      display:flex;gap:10px;align-items:center;flex-wrap:wrap;justify-content:center;
      box-shadow:0 10px 34px rgba(0,0,0,.28);font-family:'Hanken Grotesk',sans-serif;
      font-size:13px;max-width:calc(100vw - 24px);box-sizing:border-box}
    .mre-bar button{cursor:pointer;border:none;border-radius:999px;padding:7px 14px;
      font-family:inherit;font-size:12px;font-weight:700;letter-spacing:.04em;white-space:nowrap;
      background:#F7EFE3;color:#33302B}
    .mre-bar button:hover{background:#C65A33;color:#F7EFE3}
    .mre-bar button.mre-ghost{background:transparent;color:#F7EFE3;opacity:.75}
    .mre-bar button.mre-ghost:hover{opacity:1;background:transparent;color:#E8A87C}
    .mre-bar input{border:none;border-radius:999px;padding:7px 12px;font-family:inherit;
      font-size:12px;width:230px;background:#F7EFE3;color:#33302B}
    .mre-status{opacity:.85}
    .mre-editing [data-edit],.mre-editing [data-edit-html],.mre-editing [data-edit-list]{
      outline:1.5px dashed rgba(198,90,51,.65);outline-offset:3px;border-radius:2px;
      cursor:text;transition:outline-color .15s}
    .mre-editing [data-edit]:hover,.mre-editing [data-edit-html]:hover,.mre-editing [data-edit-list]:hover{
      outline-color:#C65A33}
    .mre-editing [contenteditable]:focus{outline:2px solid #C65A33;outline-offset:3px}
    .mre-dirty{outline-color:#C65A33 !important;outline-style:solid !important}
  `;

  let bar;

  const mount = () => {
    if (bar) return;
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    bar = document.createElement('div');
    bar.className = 'mre-bar';
    document.body.appendChild(bar);
  };

  const render = (html) => {
    mount();
    bar.innerHTML = html;
  };

  const status = (msg) => {
    const el = $('.mre-status', bar);
    if (el) el.textContent = msg;
  };

  const renderSignIn = (msg) => {
    render(`
      <span class="mre-status">${msg || 'Sign in to edit this site'}</span>
      <button class="mre-gh">Sign in with GitHub</button>
      <button class="mre-ghost mre-token-toggle">Use a token</button>
      <button class="mre-ghost mre-close">Close</button>
    `);
    $('.mre-gh', bar).onclick = signInWithGitHub;
    $('.mre-token-toggle', bar).onclick = () => renderTokenSignIn();
    $('.mre-close', bar).onclick = teardown;
  };

  const renderTokenSignIn = (msg) => {
    render(`
      <span class="mre-status">${msg || 'Paste a GitHub token (repo-scoped)'}</span>
      <input type="password" class="mre-token" placeholder="github_pat_… or ghp_…" autocomplete="off">
      <button class="mre-signin">Sign in</button>
      <button class="mre-ghost mre-back">Back</button>
    `);
    $('.mre-signin', bar).onclick = () => auth($('.mre-token', bar).value.trim());
    $('.mre-token', bar).onkeydown = (e) => {
      if (e.key === 'Enter') auth($('.mre-token', bar).value.trim());
    };
    $('.mre-back', bar).onclick = () => renderSignIn();
  };

  const signInWithGitHub = () => {
    const state = crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2);
    try { sessionStorage.setItem('mre_oauth_state', state); } catch (e) {}
    status('Waiting for GitHub — check the popup…');
    const w = window.open(
      OAUTH_PROXY + '/api/auth?state=' + encodeURIComponent(state),
      'mre-oauth',
      'width=640,height=760'
    );
    if (!w) renderSignIn('Popup blocked — allow popups for this site and retry');
  };

  window.addEventListener('message', (e) => {
    if (e.origin !== OAUTH_PROXY) return;
    const d = e.data;
    if (!d || d.source !== 'mr-oauth') return;
    let expect = null;
    try { expect = sessionStorage.getItem('mre_oauth_state'); } catch (err) {}
    if (!expect || d.state !== expect) { renderSignIn('Sign-in state mismatch — try again'); return; }
    try { sessionStorage.removeItem('mre_oauth_state'); } catch (err) {}
    if (d.error) { renderSignIn('GitHub sign-in failed: ' + d.error); return; }
    auth(d.token);
  });

  const renderIdle = () => {
    render(`
      <span class="mre-status">Signed in as ${state.login}</span>
      <button class="mre-edit">✎ Edit page</button>
      <button class="mre-ghost mre-signout">Sign out</button>
      <button class="mre-ghost mre-close">Close</button>
    `);
    $('.mre-edit', bar).onclick = enterEdit;
    $('.mre-signout', bar).onclick = signOut;
    $('.mre-close', bar).onclick = teardown;
  };

  const renderEditing = () => {
    render(`
      <span class="mre-status">Editing — click any outlined text</span>
      <button class="mre-save">Save → commit</button>
      <button class="mre-ghost mre-discard">Discard</button>
    `);
    $('.mre-save', bar).onclick = save;
    $('.mre-discard', bar).onclick = discard;
  };

  const teardown = () => {
    exitEdit(false);
    if (bar) { bar.remove(); bar = null; }
  };

  // ---------- auth ----------

  const auth = async (token) => {
    if (!token) return;
    state.token = token;
    status('Checking access…');
    try {
      const [user, repo] = await Promise.all([api('/user'), api(`/repos/${OWNER}/${REPO}`)]);
      if (!repo.permissions || !repo.permissions.push) {
        state.token = null;
        renderSignIn(`@${user.login} has no push access to ${OWNER}/${REPO}`);
        return;
      }
      state.login = user.login;
      try { localStorage.setItem(LS_TOKEN, token); } catch (e) {}
      renderIdle();
      if (location.hash === '#edit') enterEdit();
    } catch (e) {
      state.token = null;
      renderSignIn(e.status === 401 ? 'Token rejected by GitHub — check it and try again' : 'Error: ' + e.message);
    }
  };

  const signOut = () => {
    try { localStorage.removeItem(LS_TOKEN); } catch (e) {}
    state.token = null;
    state.login = null;
    renderSignIn('Signed out.');
  };

  // ---------- editing ----------

  const editables = () => $$('[data-edit],[data-edit-html],[data-edit-list]');

  const enterEdit = () => {
    state.editing = true;
    state.originals.clear();
    for (const el of editables()) {
      state.originals.set(el, el.innerHTML);
      const plain = !el.hasAttribute('data-edit-html');
      el.setAttribute('contenteditable', plain ? 'plaintext-only' : 'true');
      // Firefox: plaintext-only unsupported → falls back
      if (plain && el.contentEditable !== 'plaintext-only') el.setAttribute('contenteditable', 'true');
      el.addEventListener('input', markDirty);
    }
    document.documentElement.classList.add('mre-editing');
    renderEditing();
  };

  const markDirty = (e) => e.currentTarget.classList.add('mre-dirty');

  const exitEdit = (keep) => {
    if (!state.editing) return;
    for (const el of editables()) {
      if (!keep && state.originals.has(el)) el.innerHTML = state.originals.get(el);
      el.removeAttribute('contenteditable');
      el.classList.remove('mre-dirty');
      el.removeEventListener('input', markDirty);
    }
    document.documentElement.classList.remove('mre-editing');
    state.editing = false;
  };

  const discard = () => {
    exitEdit(false);
    renderIdle();
  };

  const collectPatches = (data) => {
    const patches = [];
    for (const el of editables()) {
      const path = pathOf(el);
      const value = readValue(el);
      const current = getPath(data, path);
      const changed = Array.isArray(value)
        ? JSON.stringify(value) !== JSON.stringify(current)
        : String(value) !== String(current);
      if (changed) patches.push({ path, value });
    }
    return patches;
  };

  const save = async () => {
    status('Saving…');
    try {
      // Always start from the latest committed JSON so concurrent edits merge by field.
      const file = await api(`/repos/${OWNER}/${REPO}/contents/${DATA_PATH}?ref=${BRANCH}`);
      const data = JSON.parse(b64decode(file.content));
      const patches = collectPatches(data);
      if (patches.length === 0) {
        status('No changes to save.');
        return;
      }
      for (const p of patches) setPath(data, p.path, p.value);
      const body = {
        message: `Edit site copy (${patches.length} field${patches.length > 1 ? 's' : ''}) via inline editor`,
        content: b64encode(JSON.stringify(data, null, 2) + '\n'),
        sha: file.sha,
        branch: BRANCH,
      };
      let result;
      try {
        result = await api(`/repos/${OWNER}/${REPO}/contents/${DATA_PATH}`, {
          method: 'PUT',
          body: JSON.stringify(body),
        });
      } catch (e) {
        if (e.status === 409 || e.status === 422) {
          // Someone committed in between — refetch, re-apply, retry once.
          const fresh = await api(`/repos/${OWNER}/${REPO}/contents/${DATA_PATH}?ref=${BRANCH}`);
          const freshData = JSON.parse(b64decode(fresh.content));
          for (const p of patches) setPath(freshData, p.path, p.value);
          body.content = b64encode(JSON.stringify(freshData, null, 2) + '\n');
          body.sha = fresh.sha;
          result = await api(`/repos/${OWNER}/${REPO}/contents/${DATA_PATH}`, {
            method: 'PUT',
            body: JSON.stringify(body),
          });
        } else throw e;
      }
      exitEdit(true); // keep edited text on screen; it now matches the committed data
      renderIdle();
      status(`Committed ${result.commit.sha.slice(0, 7)} — live in ~1 min`);
    } catch (e) {
      status('Save failed: ' + e.message);
    }
  };

  // ---------- boot ----------

  const boot = () => {
    mount();
    let saved = null;
    try { saved = localStorage.getItem(LS_TOKEN); } catch (e) {}
    if (saved) auth(saved);
    else renderSignIn();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
