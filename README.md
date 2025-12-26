# StreamProvider
Welcome to yet another **FMHY** related project! This is an API that developers can use to directly extract m3u8 (HLS) urls from TMDB (The Movie Database) IDs.

It is publicly hosted, but it may eventually be taken down, so consider hosting your own instance. You will need a PostgreSQL database to store the cached data, or you can modify the index.js file to disable caching. I may add a separate config.json file, but since this is designed for developers, I feel like most can figure it out.

## How to use
Public URL: `https://streamprovider.koyeb.app/`
Example Usage:
```
TV Show:
https://streamprovider.koyeb.app/?tmdbId=246&season=2&episode=1
Movie:
https://streamprovider.koyeb.app/?tmdbId=10681
```

`tmdbId` can be retrieved from [The Movie Database](https://themoviedb.org)
