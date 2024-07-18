require('dotenv').config();
const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;
const redirect_uri = process.env.REDIRECT_URI;

console.log('Redirect URI:', redirect_uri);  // Debugging line

app.use(cookieParser());
app.use(express.static(__dirname));

const generateRandomString = (length) => {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
};

const stateKey = 'spotify_auth_state';

app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  const state = generateRandomString(16);
  res.cookie(stateKey, state);

  const scope = 'user-top-read';
  res.redirect('https://accounts.spotify.com/authorize?' +
    querystring.stringify({
      response_type: 'code',
      client_id: client_id,
      scope: scope,
      redirect_uri: redirect_uri,
      state: state
    }));
});

app.get('/callback', (req, res) => {
  const code = req.query.code || null;
  const state = req.query.state || null;
  const storedState = req.cookies ? req.cookies[stateKey] : null;

  if (state === null || state !== storedState) {
    res.redirect('/#' +
      querystring.stringify({
        error: 'state_mismatch'
      }));
  } else {
    res.clearCookie(stateKey);
    const authOptions = {
      url: 'https://accounts.spotify.com/api/token',
      form: {
        code: code,
        redirect_uri: redirect_uri,
        grant_type: 'authorization_code'
      },
      headers: {
        'Authorization': 'Basic ' + (Buffer.from(client_id + ':' + client_secret).toString('base64'))
      },
      json: true
    };

    axios.post(authOptions.url, querystring.stringify(authOptions.form), { headers: authOptions.headers })
      .then(response => {
        const access_token = response.data.access_token;
        console.log('Access Token:', access_token); // Debugging line

        const options = {
          url: 'https://api.spotify.com/v1/me/top/tracks',
          headers: { 'Authorization': 'Bearer ' + access_token },
          json: true
        };

        axios.get(options.url, { headers: options.headers })
          .then(response => {
            const topTracks = response.data.items;
            console.log('Top Tracks:', topTracks); // Debugging line

            if (!topTracks.length) {
              res.send('No top tracks found for this user.');
              return;
            }

            const seed_artists = topTracks.map(track => track.artists[0].id).slice(0, 5);
            const seed_genres = topTracks.flatMap(track => track.genres).slice(0, 5);

            const recOptions = {
              url: 'https://api.spotify.com/v1/recommendations',
              headers: { 'Authorization': 'Bearer ' + access_token },
              params: {
                seed_artists: seed_artists.join(','),
                seed_genres: seed_genres.join(','),
                limit: 1
              },
              json: true
            };

            axios.get(recOptions.url, { headers: recOptions.headers, params: recOptions.params })
              .then(recResponse => {
                const recommendation = recResponse.data.tracks[0];
                console.log('Recommendation:', recommendation); // Debugging line

                const recommendationInfo = {
                  name: recommendation.name,
                  artist: recommendation.artists[0].name,
                  url: recommendation.external_urls.spotify,
                  image: recommendation.album.images[0].url
                };

                let topTracksHtml = '';
                topTracks.forEach(track => {
                  topTracksHtml += `<li><strong>${track.name}</strong> by ${track.artists[0].name} - <a href="${track.external_urls.spotify}" target="_blank">Listen</a></li>`;
                });

                fs.readFile(path.join(__dirname, 'index.html'), 'utf8', (err, data) => {
                  if (err) {
                    res.status(500).send('Error reading HTML file');
                    return;
                  }

                  const updatedHtml = data.replace(
                    '<script>updatePage(recommendationInfo, topTracksHtml);</script>',
                    `<script>
                      document.getElementById('recommendation-image').src = '${recommendationInfo.image}';
                      document.getElementById('recommendation-link').href = '${recommendationInfo.url}';
                      document.getElementById('recommendation-name').textContent = '${recommendationInfo.name}';
                      document.getElementById('recommendation-artist').textContent = '${recommendationInfo.artist}';
                      document.getElementById('top-tracks-list').innerHTML = \`${topTracksHtml}\`;
                    </script>`
                  );

                  res.send(updatedHtml);
                });
              })
              .catch(error => {
                console.error('Error fetching recommendations:', error.response ? error.response.data : error); // Debugging line
                res.send('Error fetching recommendations');
              });
          })
          .catch(error => {
            console.error('Error fetching top tracks:', error.response ? error.response.data : error); // Debugging line
            res.send('Error fetching top tracks');
          });
      })
      .catch(error => {
        console.error('Error getting token:', error.response ? error.response.data : error); // Debugging line
        res.send('Error getting token');
      });
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
