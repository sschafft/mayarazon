// Step 2: GitHub redirects here with a one-time code. Exchange it for a
// token server-side (the endpoint has no CORS, which is the whole reason
// this proxy exists), then hand the token to the opener page via
// postMessage — restricted to the site origin.
const SITE_ORIGIN = 'https://mayarazon.com';

module.exports = async (req, res) => {
  const { code, state } = req.query;
  let payload;
  try {
    const r = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: process.env.GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const data = await r.json();
    payload = data.access_token
      ? { source: 'mr-oauth', token: data.access_token, state }
      : { source: 'mr-oauth', error: data.error_description || data.error || 'no token returned', state };
  } catch (e) {
    payload = { source: 'mr-oauth', error: e.message, state };
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.send(`<!doctype html><meta charset="utf-8"><title>Signing in…</title>
<body style="font-family:sans-serif;padding:2rem">Completing sign-in…
<script>
  if (window.opener) {
    window.opener.postMessage(${JSON.stringify(payload)}, ${JSON.stringify(SITE_ORIGIN)});
    window.close();
  } else {
    document.body.textContent = 'This window was opened outside the editor — close it and retry from ' + ${JSON.stringify(SITE_ORIGIN)};
  }
</script>`);
};
