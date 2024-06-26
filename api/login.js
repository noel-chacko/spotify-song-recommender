const querystring = require('querystring');
const cookie = require('cookie');

module.exports = (req, res) => {
  const state = generateRandomString(16);
  res.setHeader('Set-Cookie', cookie.serialize('spotify_auth_state', state, {
    path: '/',
    httpOnly: true
  }));

  const scope = 'user-top-read';
  const redirectUrl = 'https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: process.env.CLIENT_ID,
      scope: scope,
      redirect_uri: process.env.REDIRECT_URI,
      state: state
    });

  res.redirect(redirectUrl);
};
