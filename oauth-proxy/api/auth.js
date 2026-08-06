// Step 1 of the OAuth dance: bounce the popup to GitHub's authorize page.
// GITHUB_CLIENT_ID is set in the Vercel project's environment variables.
module.exports = (req, res) => {
  const { state } = req.query;
  const params = new URLSearchParams({
    client_id: process.env.GITHUB_CLIENT_ID,
    redirect_uri: `https://${req.headers.host}/api/callback`,
    scope: 'public_repo',
    state: state || '',
  });
  res.redirect(302, `https://github.com/login/oauth/authorize?${params}`);
};
