require('dotenv').config();
const express = require('express');
const axios = require('axios');
const querystring = require('querystring');
const cookieParser = require('cookie-parser');

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

                let allTracksHtml = '<ul id="top-tracks-list" class="collapsed">';
                topTracks.forEach(track => {
                  allTracksHtml += `<li><strong>${track.name}</strong> by ${track.artists[0].name} - <a href="${track.external_urls.spotify}" target="_blank">Listen</a></li>`;
                });
                allTracksHtml += '</ul>';

                res.send(`
                  <!DOCTYPE html>
                  <html lang="en">
                  <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Spotify Song Recommender</title>
                    <style>
                      body {
                        font-family: 'Quicksand', sans-serif;
                        background-color: #f5f5f5;
                        color: #333;
                        margin: 0;
                        padding: 20px;
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                      }
                      header {
                        position: fixed;
                        top: 0;
                        width: 100%;
                        background-color: #2ecc71;
                        color: white;
                        text-align: center;
                        padding: 10px 0;
                        font-size: 24px;
                        font-weight: bold;
                      }
                      footer {
                        position: fixed;
                        bottom: 0;
                        width: 100%;
                        background-color: #2ecc71;
                        color: white;
                        text-align: center;
                        padding: 5px 0;
                        font-size: 14px;
                      }
                      h1 {
                        color: #2ecc71;
                        margin-bottom: 20px;
                      }
                      .top-tracks-button {
                        color: white;
                        cursor: pointer;
                        background-color: #2ecc71;
                        padding: 10px 20px;
                        border-radius: 25px;
                        transition: background-color 0.3s;
                        width: 100%;
                        max-width: 600px;
                        text-align: center;
                        margin-bottom: 0;
                      }
                      .top-tracks-button:hover {
                        background-color: #27ae60;
                      }
                      ul {
                        list-style-type: none;
                        padding: 0;
                        max-height: 0;
                        overflow: hidden;
                        transition: max-height 0.5s ease-out;
                        text-align: center;
                        margin-top: 0;
                      }
                      ul.expanded {
                        max-height: 1000px;
                      }
                      li {
                        margin: 5px 0;
                      }
                      a {
                        color: #2ecc71;
                        text-decoration: none;
                      }
                      a:hover {
                        text-decoration: underline;
                      }
                      .recommendation {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        text-align: center;
                        margin-bottom: 20px;
                        padding-top: 40px;
                      }
                      .recommendation img {
                        width: 200px;
                        height: 200px;
                        border-radius: 15px;
                        margin-bottom: 10px;
                      }
                      .recommendation p a {
                        color: #2ecc71;
                        font-weight: bold;
                      }
                      .info-text {
                        margin-top: 20px;
                        padding: 20px;
                        background-color: #e0f7e9;
                        border-radius: 10px;
                        max-width: 600px;
                        text-align: center;
                      }
                      .info-image {
                        margin-top: 20px;
                        width: 250px;
                        height: auto;
                      }
                    </style>
                    <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@300;400;500;600;700&display=swap" rel="stylesheet">
                    <script>
                      function toggleTopTracks() {
                        var topTracksList = document.getElementById('top-tracks-list');
                        topTracksList.classList.toggle('expanded');
                      }
                    </script>
                  </head>
                  <body>
                    <header>Solo Song</header>
                    <div class="recommendation">
                      <h1>Today's Song Recommendation</h1>
                      <a href="${recommendationInfo.url}" target="_blank">
                        <img src="${recommendationInfo.image}" alt="${recommendationInfo.name} Album Art">
                      </a>
                      <p><a href="${recommendationInfo.url}" target="_blank"><strong>${recommendationInfo.name}</strong></a> by ${recommendationInfo.artist}</p>
                    </div>
                    <div class="top-tracks-button" onclick="toggleTopTracks()">Your Top Tracks</div>
                    ${allTracksHtml}
                    <div class="info-text">
                      Overstimulation is a constant in our everyday lives. We are always watching or listening to something. While screen time has many concerned, we haven't stopped to think about it 24/7 music listening could be overstimulating our brains as well. <strong><span style="color: #2ecc71;">Solo Song</span></strong> intends to give you just one song per day to listen to in order to cherish music and allow for time to be away from media throughout the day.
                    </div>
                    <img class="info-image" src="soloLogo.png" alt="Solo Song Logo">
                    <footer>&copy; 2024 Solo Song</footer>
                  </body>
                  </html>
                `);
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
