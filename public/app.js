// StreamFlix - ES5 compatible version for older browsers and VIDAA Smart TV

var imageBase = "https://image.tmdb.org/t/p";
var rowEndpoints = [
  ["suggestions", "Suggestions", "/trending/movie/week"],
  ["movies", "Popular Movies", "/movie/popular"],
  ["new", "New Releases", "/movie/now_playing"],
  ["series", "TV-Series", "/tv/popular"],
  ["action", "Action", "/discover/movie?with_genres=28&sort_by=popularity.desc"],
  ["top", "Top IMDb", "/movie/top_rated"]
];

var genreEndpoints = [
  ["action", "Action", "/discover/movie?with_genres=28&sort_by=popularity.desc"],
  ["comedy", "Comedy", "/discover/movie?with_genres=35&sort_by=popularity.desc"],
  ["drama", "Drama", "/discover/movie?with_genres=18&sort_by=popularity.desc"],
  ["horror", "Horror", "/discover/movie?with_genres=27&sort_by=popularity.desc"],
  ["romance", "Romance", "/discover/movie?with_genres=10749&sort_by=popularity.desc"],
  ["documentary", "Documentary", "/discover/movie?with_genres=99&sort_by=popularity.desc"]
];

var rowEndpointMap = createMap();
var genreEndpointMap = createMap();
for (var i = 0; i < rowEndpoints.length; i++) {
  var row = rowEndpoints[i];
  rowEndpointMap.set(row[0], { title: row[1], endpoint: row[2] });
}
for (var i = 0; i < genreEndpoints.length; i++) {
  var genre = genreEndpoints[i];
  genreEndpointMap.set(genre[0], { title: genre[1], endpoint: genre[2] });
}

var storageKey = "streamflix.device.v2";

var state = {
  rows: createMap(),
  itemCache: createMap(),
  domains: ["vidsrcme.su", "vidsrc-embed.ru", "vidsrc-embed.su", "vsrc.su"],
  domainIndex: 0,
  rowPages: {},
  selected: null,
  heroIndex: 0,
  heroTimer: null,
  device: loadDeviceState()
};

// Initialize row pages
for (var j = 0; j < rowEndpoints.length; j++) {
  state.rowPages[rowEndpoints[j][0]] = 1;
}
for (var j = 0; j < genreEndpoints.length; j++) {
  state.rowPages[genreEndpoints[j][0]] = 1;
}

var routeConfig = {
  "#/": { key: "suggestions", title: "Home", showHero: true },
  "#/home": { key: "suggestions", title: "Home", showHero: true },
  "#/movies": { key: "movies", title: "Movies", showHero: false },
  "#/series": { key: "series", title: "TV-Series", showHero: false },
  "#/top-imdb": { key: "top", title: "Top IMDb", showHero: false },
  "#/genres": { key: "genres", title: "Genres", showHero: false }
};

function getRouteConfig() {
  var hash = location.hash || "#/";
  if (routeConfig[hash]) {
    return routeConfig[hash];
  }

  if (hash.indexOf("#/genre/") === 0) {
    var slug = hash.substring(8);
    var genreConfig = genreEndpointMap.get ? genreEndpointMap.get(slug) : genreEndpointMap["_" + slug];
    if (genreConfig) {
      return { key: slug, title: genreConfig.title, showHero: false, isGenre: true };
    }
  }

  return routeConfig["#/" ];
}

function updateActiveNav(hash) {
  if (hash.indexOf("#/genre/") === 0) {
    hash = "#/genres";
  }
  var links = document.querySelectorAll("nav a");
  for (var i = 0; i < links.length; i++) {
    var link = links[i];
    var href = link.getAttribute("href");
    if (href === hash) {
      if (link.classList) link.classList.add("is-active");
      else link.className = (link.className || "") + " is-active";
    } else {
      if (link.classList) link.classList.remove("is-active");
      else link.className = (link.className || "").replace(/\bis-active\b/g, "").trim();
    }
  }
}

function getRowConfig(key) {
  var config = rowEndpointMap.get ? rowEndpointMap.get(key) : rowEndpointMap["_" + key];
  if (!config) {
    config = genreEndpointMap.get ? genreEndpointMap.get(key) : genreEndpointMap["_" + key];
  }
  return config;
}

function loadRoute(key) {
  if (key === "genres") return Promise.resolve();
  var config = getRowConfig(key);
  if (!config) return Promise.resolve();
  var page = state.rowPages[key] || 1;
  var endpoint = withPage(config.endpoint, page);
  var fallbackType = endpoint.indexOf("/tv/") !== -1 ? "tv" : "movie";

  return tmdb(endpoint)
    .then(function(payload) {
      var items = [];
      if (payload && payload.results) {
        for (var i = 0; i < payload.results.length && items.length < 18; i++) {
          var item = payload.results[i];
          if (item.poster_path && item.media_type !== "person") {
            items.push(normalize(item, fallbackType));
          }
        }
      }

      if (state.rows.set) {
        state.rows.set(key, { title: config.title, items: items, page: page, totalPages: Math.min(payload.total_pages || 1, 500) });
      } else {
        state.rows._data["_" + key] = { title: config.title, items: items, page: page, totalPages: Math.min(payload.total_pages || 1, 500) };
      }

      for (var j = 0; j < items.length; j++) {
        var cacheK = cacheKey(items[j].mediaType, items[j].id);
        state.itemCache.set ? state.itemCache.set(cacheK, items[j]) : (state.itemCache._data["_" + cacheK] = items[j]);
      }
    })
    .catch(function() {
      if (state.rows.set) {
        state.rows.set(key, { title: config.title, items: [], page: page, totalPages: 1 });
      } else {
        state.rows._data["_" + key] = { title: config.title, items: [], page: page, totalPages: 1 };
      }
    });
}

function renderGenrePage(key, title) {
  $("#homeView").hidden = false;
  $("#watchView").hidden = true;
  $("#heroSlider").innerHTML = "";
  $("#scheduleList").innerHTML = "";

  if (key === "genres") {
    var html = '<section class="section-block">' +
      '<div class="section-head"><h2 class="section-title">Browse Genres</h2></div>' +
      '<div class="genre-grid">';

    for (var i = 0; i < genreEndpoints.length; i++) {
      var genre = genreEndpoints[i];
      html += '<button class="genre-card" data-genre="' + genre[0] + '">' +
        '<strong>' + escapeHtml(genre[1]) + '</strong>' +
        '<span>Popular ' + escapeHtml(genre[1]).toLowerCase() + ' movies</span>' +
        '</button>';
    }

    html += '</div></section>';
    $("#sections").innerHTML = html;
    wireGenreButtons();
    return Promise.resolve();
  }

  var row = state.rows.get ? state.rows.get(key) : state.rows["_" + key];
  if (!row) row = { title: title, items: [], page: 1, totalPages: 1 };
  $("#sections").innerHTML = sectionHtml(key, row, true) || '<p class="loading-note">No titles found.</p>';
  wireCards(document);
  wirePaging();
  wireStars(document);
  return Promise.resolve();
}

function renderRoute(key, title) {
  $("#homeView").hidden = false;
  $("#watchView").hidden = true;
  $("#heroSlider").innerHTML = "";
  $("#scheduleList").innerHTML = "";
  var row = state.rows.get ? state.rows.get(key) : state.rows["_" + key];
  if (!row) row = { title: title, items: [], page: 1, totalPages: 1 };
  $("#sections").innerHTML = sectionHtml(key, row, true) || '<p class="loading-note">No titles found.</p>';
  wireCards(document);
  wirePaging();
  wireStars(document);
  return Promise.resolve();
}

function handleRoute() {
  var config = getRouteConfig();
  state.currentRoute = config.key;
  updateActiveNav(location.hash || "#/" );
  if (config.showHero) {
    return loadRows();
  }
  if (config.key === "genres") {
    return renderGenrePage(config.key, config.title);
  }
  return loadRoute(config.key).then(function() {
    return renderRoute(config.key, config.title);
  });
}

// Helper for Map-like behavior with fallback for very old browsers
function createMap() {
  if (typeof Map !== 'undefined') {
    return new Map();
  }
  return {
    _data: {},
    set: function(key, value) {
      this._data['_' + key] = value;
      return this;
    },
    get: function(key) {
      return this._data['_' + key];
    },
    has: function(key) {
      return this._data.hasOwnProperty('_' + key);
    },
    entries: function() {
      var entries = [];
      for (var key in this._data) {
        if (this._data.hasOwnProperty(key) && key.charAt(0) === '_') {
          entries.push([key.substring(1), this._data[key]]);
        }
      }
      return entries;
    },
    values: function() {
      var values = [];
      for (var key in this._data) {
        if (this._data.hasOwnProperty(key) && key.charAt(0) === '_') {
          values.push(this._data[key]);
        }
      }
      return values;
    }
  };
}

function $(selector) {
  return document.querySelector(selector);
}

function $$(selector) {
  var result = document.querySelectorAll(selector);
  var arr = [];
  for (var i = 0; i < result.length; i++) {
    arr.push(result[i]);
  }
  return arr;
}

function tmdb(path) {
  var glue = path.indexOf("?") !== -1 ? "&" : "?";
  return fetchJson("/api/tmdb" + path + glue + "language=en-US");
}

function loadDeviceState() {
  try {
    var existing = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (existing && existing.deviceId) {
      return existing;
    }
  } catch (e) {
    // Start fresh
  }
  var created = {
    deviceId: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : "device-" + Date.now(),
    history: [],
    watchlist: []
  };
  localStorage.setItem(storageKey, JSON.stringify(created));
  return created;
}

function saveDeviceState() {
  localStorage.setItem(storageKey, JSON.stringify(state.device));
}

function fetchJson(url, timeout) {
  timeout = timeout || 22000;
  
  if (typeof fetch !== 'undefined' && typeof AbortController !== 'undefined') {
    var controller = new AbortController();
    var timer = setTimeout(function() { controller.abort(); }, timeout);
    
    return fetch(url, { signal: controller.signal })
      .then(function(response) {
        clearTimeout(timer);
        if (!response.ok) {
          throw new Error(response.status + " " + response.statusText);
        }
        return response.json();
      })
      .catch(function(error) {
        clearTimeout(timer);
        throw error;
      });
  } else {
    // Fallback for very old browsers using XMLHttpRequest
    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest();
      var timer = setTimeout(function() {
        xhr.abort();
        reject(new Error("Timeout"));
      }, timeout);
      
      xhr.onreadystatechange = function() {
        if (xhr.readyState === 4) {
          clearTimeout(timer);
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch(e) {
              reject(e);
            }
          } else {
            reject(new Error(xhr.status + " " + xhr.statusText));
          }
        }
      };
      
      xhr.onerror = function() {
        clearTimeout(timer);
        reject(new Error("Network error"));
      };
      
      xhr.open("GET", url, true);
      xhr.send();
    });
  }
}

function mediaType(item) {
  if (item.media_type) return item.media_type;
  if (item.first_air_date) return "tv";
  return "movie";
}

function normalize(item, fallbackType) {
  if (!fallbackType) fallbackType = "movie";
  
  var type = item.media_type || fallbackType || mediaType(item);
  var releaseDate = item.release_date || item.first_air_date || "";
  var isNew = releaseDate && releaseDate.substring(0, 4) === "2026";
  
  return {
    id: item.id,
    mediaType: type,
    title: item.title || item.name || "Untitled",
    year: releaseDate.substring(0, 4),
    posterPath: item.poster_path,
    backdropPath: item.backdrop_path || item.poster_path,
    overview: item.overview || "No description available yet.",
    rating: item.vote_average ? String(item.vote_average).substring(0, 3) : "N/A",
    quality: isNew ? "CAM" : "HD",
    imdbID: item.imdb_id || (item.external_ids && item.external_ids.imdb_id) || ""
  };
}

function poster(item, size) {
  if (!size) size = "w342";
  if (!item || !item.posterPath) return "/poster.svg";
  return imageBase + "/" + size + item.posterPath;
}

function backdrop(item, size) {
  if (!size) size = "w1280";
  if (!item || !item.backdropPath) return poster(item, "w780");
  return imageBase + "/" + size + item.backdropPath;
}

function refreshDomains() {
  return fetchJson("/api/vidsrc-domains", 7000)
    .then(function(payload) {
      if (payload && payload.domains && payload.domains.length) {
        state.domains = payload.domains;
      }
    })
    .catch(function() {
      // Keep bundled domains
    });
}

function loadRows() {
  $("#sections").innerHTML = '<p class="loading-note">Loading TMDB trending and recent titles...</p>';
  
  var promises = [];
  for (var k = 0; k < rowEndpoints.length; k++) {
    promises.push(loadRow(rowEndpoints[k][0]));
  }
  
  return Promise.all(promises)
    .then(function() {
      renderHome();
      var first = getFirstItem();
      if (first) state.selected = first;
      startHero();
    });
}

function getFirstItem() {
  var row = state.rows.get ? state.rows.get("suggestions") : state.rows["_suggestions"];
  if (row && row.items && row.items.length) {
    return row.items[0];
  }
  var cached = state.itemCache.values ? state.itemCache.values() : [];
  if (cached.length) return cached[0];
  return null;
}

function loadRow(key) {
  var config = rowEndpointMap.get ? rowEndpointMap.get(key) : rowEndpointMap["_" + key];
  if (!config) return Promise.resolve();
  
  var page = state.rowPages[key] || 1;
  var endpoint = withPage(config.endpoint, page);
  var fallbackType = endpoint.indexOf("/tv/") !== -1 ? "tv" : "movie";
  
  return tmdb(endpoint)
    .then(function(payload) {
      var items = [];
      if (payload && payload.results) {
        for (var i = 0; i < payload.results.length && items.length < 18; i++) {
          var item = payload.results[i];
          if (item.poster_path && item.media_type !== "person") {
            items.push(normalize(item, fallbackType));
          }
        }
      }
      
      var rowMap = state.rows.set ? state.rows : state.rows._data;
      if (state.rows.set) {
        state.rows.set(key, { title: config.title, items: items, page: page, totalPages: Math.min(payload.total_pages || 1, 500) });
      } else {
        rowMap["_" + key] = { title: config.title, items: items, page: page, totalPages: Math.min(payload.total_pages || 1, 500) };
      }
      
      for (var j = 0; j < items.length; j++) {
        var cacheK = cacheKey(items[j].mediaType, items[j].id);
        state.itemCache.set ? state.itemCache.set(cacheK, items[j]) : (state.itemCache._data["_" + cacheK] = items[j]);
      }
    })
    .catch(function() {
      if (state.rows.set) {
        state.rows.set(key, { title: config.title, items: [], page: page, totalPages: 1 });
      } else {
        state.rows._data["_" + key] = { title: config.title, items: [], page: page, totalPages: 1 };
      }
    });
}

function withPage(endpoint, page) {
  var glue = endpoint.indexOf("?") !== -1 ? "&" : "?";
  return endpoint + glue + "page=" + page;
}

function cacheKey(type, id) {
  return type + ":" + id;
}

function card(item) {
  var starred = isStarred(item) ? "is-starred" : "";
  var progress = item.progressLabel ? '<span class="progress-badge">' + escapeHtml(item.progressLabel) + '</span>' : "";
  
  return '<button class="movie-card" data-type="' + item.mediaType + '" data-id="' + item.id + '" aria-label="Watch ' + escapeHtml(item.title) + '">' +
    '<span class="star ' + starred + '" data-star-type="' + item.mediaType + '" data-star-id="' + item.id + '" title="Watch later">★</span>' +
    progress +
    '<span class="quality">' + escapeHtml(item.quality) + '</span>' +
    '<img src="' + poster(item) + '" alt="' + escapeHtml(item.title) + ' poster" loading="lazy" onerror="this.src=\'/poster.svg\'" />' +
    '<span class="movie-title">' + escapeHtml(item.title) + '</span>' +
    '</button>';
}

function renderHome() {
  $("#homeView").hidden = false;
  $("#watchView").hidden = true;
  
  var heroRow = state.rows.get ? state.rows.get("suggestions") : state.rows["_suggestions"];
  var heroItems = (heroRow && heroRow.items) ? heroRow.items : [];
  
  renderHero(heroItems);
  renderSchedule(heroItems.slice(0, 6));
  
  var personalRows = [];
  var histItems = historyItems();
  var watchItems = watchlistItems();
  
  if (histItems.length > 0) {
    personalRows.push(["continue", "Continue Watching", histItems]);
  }
  if (watchItems.length > 0) {
    personalRows.push(["watchlist", "Watchlist", watchItems]);
  }
  
  var personalHtml = "";
  for (var p = 0; p < personalRows.length; p++) {
    personalHtml += sectionHtml(personalRows[p][0], { title: personalRows[p][1], items: personalRows[p][2] }, false);
  }
  
  var dynamicHtml = "";
  var rowEntries = [];
  if (state.rows.entries) {
    var entriesResult = state.rows.entries();
    if (entriesResult && typeof entriesResult[Symbol.iterator] === 'function') {
      // Native Map iterator - convert to array (ES5 compatible)
      var iter = entriesResult[Symbol.iterator]();
      var iterResult = iter.next();
      while (!iterResult.done) {
        rowEntries.push(iterResult.value);
        iterResult = iter.next();
      }
    } else if (Array.isArray(entriesResult)) {
      // Custom Map fallback
      rowEntries = entriesResult;
    }
  }
  for (var r = 0; r < rowEntries.length; r++) {
    dynamicHtml += sectionHtml(rowEntries[r][0], rowEntries[r][1], true);
  }
  
  $("#sections").innerHTML = personalHtml + dynamicHtml || '<p class="loading-note">Loading TMDB titles...</p>';
  wireCards(document);
  wirePaging();
  wireStars(document);
}

function sectionHtml(key, row, canPage) {
  if (!row || !row.items || row.items.length === 0) return "";
  
  var pageControls = "";
  if (canPage) {
    var page = row.page || 1;
    pageControls = '<div class="row-pager">' +
      '<button data-page-row="' + key + '" data-page-dir="-1">Previous</button>' +
      '<span>Page ' + page + '</span>' +
      '<button data-page-row="' + key + '" data-page-dir="1">Next</button>' +
      '</div>';
  }
  
  var cardsHtml = "";
  for (var c = 0; c < row.items.length; c++) {
    cardsHtml += card(row.items[c]);
  }
  
  return '<section class="section-block" id="' + key + '">' +
    '<div class="section-head">' +
    '<h2 class="section-title">' + escapeHtml(row.title) + '</h2>' +
    pageControls +
    '</div>' +
    '<div class="poster-grid">' + cardsHtml + '</div>' +
    '</section>';
}

function renderHero(items) {
  if (!items || items.length === 0) {
    $("#heroSlider").innerHTML = "";
    return;
  }
  
  var active = state.heroIndex % Math.min(items.length, 5);
  var slides = "";
  
  for (var h = 0; h < Math.min(items.length, 5); h++) {
    var item = items[h];
    var isActive = h === active ? "is-active" : "";
    slides += '<article class="hero-slide ' + isActive + '" style="background-image:url(\'' + backdrop(item) + '\')">' +
      '<div class="hero-caption">' +
      '<h1>' + escapeHtml(item.title) + '</h1>' +
      '<p>' + escapeHtml(item.overview) + '</p>' +
      '<button data-watch-type="' + item.mediaType + '" data-watch-id="' + item.id + '">Stream in HD</button>' +
      '</div>' +
      '</article>';
  }
  
  $("#heroSlider").innerHTML = slides;
  
  var watchButtons = $$("[data-watch-id]");
  for (var w = 0; w < watchButtons.length; w++) {
    watchButtons[w].onclick = (function(btn) {
      return function() {
        openWatch(btn.dataset.watchType, btn.dataset.watchId);
      };
    })(watchButtons[w]);
  }
}

function renderSchedule(items) {
  var html = "";
  for (var s = 0; s < items.length; s++) {
    var item = items[s];
    html += '<button class="schedule-item" data-type="' + item.mediaType + '" data-id="' + item.id + '">' +
      '<img src="' + poster(item, "w185") + '" alt="" onerror="this.src=\'/poster.svg\'" />' +
      '<span>' + escapeHtml(item.title) + '<br><small>' + escapeHtml(item.year || item.mediaType) + '</small></span>' +
      '</button>';
  }
  
  $("#scheduleList").innerHTML = html;
  
  var scheduleItems = $$(".schedule-item");
  for (var si = 0; si < scheduleItems.length; si++) {
    scheduleItems[si].onclick = (function(btn) {
      return function() {
        openWatch(btn.dataset.type, btn.dataset.id);
      };
    })(scheduleItems[si]);
  }
}

function startHero() {
  clearInterval(state.heroTimer);
  state.heroTimer = setInterval(function() {
    var suggestionsRow = state.rows.get ? state.rows.get("suggestions") : state.rows["_suggestions"];
    var items = (suggestionsRow && suggestionsRow.items) ? suggestionsRow.items : [];
    
    if ($("#homeView").hidden || !items.length) return;
    
    state.heroIndex = (state.heroIndex + 1) % Math.min(items.length, 5);
    renderHero(items);
  }, 7000);
}

function wireCards(root) {
  var cards = root.querySelectorAll ? root.querySelectorAll(".movie-card") : [];
  for (var i = 0; i < cards.length; i++) {
    cards[i].onclick = (function(card) {
      return function() {
        openWatch(card.dataset.type, card.dataset.id);
      };
    })(cards[i]);
  }
}

function wireGenreButtons() {
  var buttons = document.querySelectorAll(".genre-card");
  for (var i = 0; i < buttons.length; i++) {
    buttons[i].onclick = (function(btn) {
      return function() {
        var genre = btn.dataset.genre;
        location.hash = "#/genre/" + genre;
      };
    })(buttons[i]);
  }
}

function wireStars(root) {
  var stars = root.querySelectorAll ? root.querySelectorAll("[data-star-id]") : [];
  for (var i = 0; i < stars.length; i++) {
    stars[i].onclick = (function(star) {
      return function(event) {
        event.stopPropagation();
        var key = cacheKey(star.dataset.starType, star.dataset.starId);
        var item = state.itemCache.get ? state.itemCache.get(key) : state.itemCache._data["_" + key];
        if (item) {
          toggleWatchlist(item);
          renderHome();
        }
      };
    })(stars[i]);
  }
}

function wirePaging() {
  var pagers = $$("[data-page-row]");
  for (var i = 0; i < pagers.length; i++) {
    pagers[i].onclick = (function(btn) {
      return function() {
        var key = btn.dataset.pageRow;
        var dir = parseInt(btn.dataset.pageDir, 10) || 0;
        var row = state.rows.get ? state.rows.get(key) : state.rows["_" + key];
        var total = (row && row.totalPages) ? row.totalPages : 500;
        state.rowPages[key] = Math.max(1, Math.min(total, (state.rowPages[key] || 1) + dir));
        
        loadRow(key).then(function() {
          handleRoute().then(function() {
            var section = document.getElementById(key);
            if (section && section.scrollIntoView) {
              section.scrollIntoView(false);
            }
          });
        });
      };
    })(pagers[i]);
  }
}

function getDetails(type, id) {
  var key = cacheKey(type, id);
  var cached = state.itemCache.get ? state.itemCache.get(key) : state.itemCache._data["_" + key];
  var endpointType = type === "tv" ? "tv" : "movie";
  
  return tmdb("/" + endpointType + "/" + id + "?append_to_response=external_ids,credits,videos")
    .then(function(payload) {
      var imdbID = (payload.external_ids && payload.external_ids.imdb_id) || (cached && cached.imdbID) || "";
      var seasons = payload.number_of_seasons || 1;
      var runtimeStr = endpointType === "tv" ? 
        (seasons + " season" + (seasons === 1 ? "" : "s")) :
        ((payload.runtime || "N/A") + " min");
      
      var genres = [];
      if (payload.genres) {
        for (var g = 0; g < payload.genres.length; g++) {
          genres.push(payload.genres[g].name);
        }
      }
      
      var actors = [];
      if (payload.credits && payload.credits.cast) {
        for (var a = 0; a < Math.min(payload.credits.cast.length, 4); a++) {
          actors.push(payload.credits.cast[a].name);
        }
      }
      
      var director = "N/A";
      if (payload.credits && payload.credits.crew) {
        for (var d = 0; d < payload.credits.crew.length; d++) {
          if (payload.credits.crew[d].job === "Director") {
            director = payload.credits.crew[d].name;
            break;
          }
        }
      }
      if (director === "N/A" && payload.created_by && payload.created_by.length) {
        director = payload.created_by[0].name;
      }
      
      var item = {
        id: payload.id,
        mediaType: endpointType,
        title: payload.title || payload.name || "Untitled",
        year: (payload.release_date || payload.first_air_date || "").substring(0, 4),
        posterPath: payload.poster_path,
        backdropPath: payload.backdrop_path || payload.poster_path,
        overview: payload.overview || "No description available yet.",
        rating: payload.vote_average ? String(payload.vote_average).substring(0, 3) : "N/A",
        quality: (payload.release_date || payload.first_air_date || "").substring(0, 4) === "2026" ? "CAM" : "HD",
        imdbID: imdbID,
        runtime: runtimeStr,
        genres: genres.join(", "),
        actors: actors.join(", "),
        director: director
      };
      
      state.itemCache.set ? state.itemCache.set(key, item) : (state.itemCache._data["_" + key] = item);
      return item;
    });
}

function activeDomain() {
  return state.domains[state.domainIndex % state.domains.length];
}

function embedUrl(item) {
  var params = "autoplay=1&ds_lang=en&autonext=1";
  if (item.imdbID) {
    if (item.mediaType === "tv") return "https://" + activeDomain() + "/embed/tv/" + item.imdbID + "/1-1?" + params;
    return "https://" + activeDomain() + "/embed/movie/" + item.imdbID + "?" + params;
  }
  if (item.mediaType === "tv") return "https://" + activeDomain() + "/embed/tv/" + item.id + "/1-1?" + params;
  return "https://" + activeDomain() + "/embed/movie/" + item.id + "?" + params;
}

function openWatch(type, id) {
  return getDetails(type, id)
    .then(function(item) {
      state.selected = item;
      var source = embedUrl(item);
      rememberWatching(item);
      
      $("#homeView").hidden = true;
      $("#watchView").hidden = false;
      
      var breadcrumbType = item.mediaType === "tv" ? "TV-Series" : "Movies";
      $("#breadcrumb").innerHTML = '<a href="#/">Home</a> / ' + breadcrumbType + ' / ' + escapeHtml(item.title);
      $("#playerFrame").src = source;
      $("#serverName").textContent = "Server " + (state.domainIndex + 1);
      renderServerOptions();
      $("#detailPoster").src = poster(item);
      $("#detailPoster").alt = item.title + " poster";
      $("#detailTitle").textContent = item.title;
      $("#detailPlot").textContent = item.overview;
      
      var detailHtml = '<span><strong>Genre:</strong> ' + escapeHtml(item.genres || "N/A") + '</span>' +
        '<span><strong>Quality:</strong> <mark>' + escapeHtml(item.quality || "HD") + '</mark></span>' +
        '<span><strong>Actor:</strong> ' + escapeHtml(item.actors || "N/A") + '</span>' +
        '<span><strong>Duration:</strong> ' + escapeHtml(item.runtime || "N/A") + '</span>' +
        '<span><strong>Director:</strong> ' + escapeHtml(item.director || "N/A") + '</span>' +
        '<span><strong>Release:</strong> ' + escapeHtml(item.year || "N/A") + '</span>' +
        '<span><strong>IMDb:</strong> ' + escapeHtml(item.rating || "N/A") + '</span>' +
        '<span><strong>TMDB:</strong> ' + escapeHtml(item.id) + '</span>';
      
      $("#detailFacts").innerHTML = detailHtml;
      
      return renderSuggestions(type, id);
    })
    .then(function() {
      updateWatchLaterButton();
      if (window.scrollTo) {
        window.scrollTo(0, 0);
      }
    });
}

function renderSuggestions(type, id) {
  var endpointType = type === "tv" ? "tv" : "movie";
  
  return tmdb("/" + endpointType + "/" + id + "/recommendations?page=1")
    .then(function(payload) {
      var items = [];
      if (payload && payload.results) {
        for (var i = 0; i < payload.results.length && items.length < 12; i++) {
          var item = payload.results[i];
          if (item.poster_path) {
            items.push(normalize(item, endpointType));
          }
        }
      }
      
      for (var j = 0; j < items.length; j++) {
        var cacheK = cacheKey(items[j].mediaType, items[j].id);
        state.itemCache.set ? state.itemCache.set(cacheK, items[j]) : (state.itemCache._data["_" + cacheK] = items[j]);
      }
      
      if (items.length === 0) {
        var cached = state.itemCache.values ? state.itemCache.values() : [];
        for (var k = 0; k < cached.length && items.length < 12; k++) {
          if (!(cached[k].mediaType === type && String(cached[k].id) === String(id))) {
            items.push(cached[k]);
          }
        }
      }
      
      var cardsHtml = "";
      for (var c = 0; c < items.length; c++) {
        cardsHtml += card(items[c]);
      }
      
      $("#suggestions").innerHTML = cardsHtml;
      wireCards($("#suggestions"));
      wireStars($("#suggestions"));
    })
    .catch(function() {
      $("#suggestions").innerHTML = "";
    });
}

function search(query) {
  $("#sections").innerHTML = '<p class="loading-note">Searching TMDB for "' + escapeHtml(query) + '"...</p>';
  
  return tmdb("/search/multi?query=" + encodeURIComponent(query) + "&include_adult=false")
    .then(function(payload) {
      var items = [];
      if (payload && payload.results) {
        for (var i = 0; i < payload.results.length && items.length < 18; i++) {
          var result = payload.results[i];
          if ((result.media_type === "movie" || result.media_type === "tv") && result.poster_path) {
            items.push(normalize(result, result.media_type));
          }
        }
      }
      
      for (var j = 0; j < items.length; j++) {
        var cacheK = cacheKey(items[j].mediaType, items[j].id);
        state.itemCache.set ? state.itemCache.set(cacheK, items[j]) : (state.itemCache._data["_" + cacheK] = items[j]);
      }
      
      if (state.rows.set) {
        state.rows.set("suggestions", { title: "Search: " + query, items: items });
      } else {
        state.rows._data["_suggestions"] = { title: "Search: " + query, items: items };
      }
      
      renderHome();
    })
    .catch(function(error) {
      $("#sections").innerHTML = '<p class="loading-note">' + escapeHtml(error.message) + '</p>';
    });
}

function escapeHtml(value) {
  var str = String(value || "");
  var div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function wireGlobal() {
  $("#searchForm").onsubmit = function(event) {
    event.preventDefault();
    var query = $("#searchInput").value.trim();
    if (query) search(query);
  };
  
  $("#streamButton").onclick = function() {
    if (state.selected) openWatch(state.selected.mediaType, state.selected.id);
  };
  
  $("#prevButton").onclick = function() { navigateWatch(-1); };
  $("#nextButton").onclick = function() { navigateWatch(1); };
  $("#zoomButton").onclick = toggleZoom;
  $("#fullscreenButton").onclick = toggleFullscreen;
  $("#fullscreenAction").onclick = toggleFullscreen;
  
  $("#watchLaterButton").onclick = function() {
    if (!state.selected) return;
    toggleWatchlist(state.selected);
    updateWatchLaterButton();
    renderSuggestions(state.selected.mediaType, state.selected.id);
  };
  
  $("#downloadButton").onclick = function() {
    if (state.selected) openWatch(state.selected.mediaType, state.selected.id);
  };
  
  $("#openSource").onclick = function() {
    var panel = document.querySelector(".server-panel");
    if (panel) {
      if (panel.classList && panel.classList.toggle) {
        panel.classList.toggle("is-open");
      } else {
        var classes = (panel.className || "").split(" ");
        var idx = classes.indexOf("is-open");
        if (idx !== -1) {
          classes.splice(idx, 1);
        } else {
          classes.push("is-open");
        }
        panel.className = classes.join(" ");
      }
    }
  };
  
  var serverOptions = $$(".server-option");
  for (var i = 0; i < serverOptions.length; i++) {
    serverOptions[i].onclick = (function(btn, index) {
      return function() {
        state.domainIndex = index % state.domains.length;
        var allOptions = $$(".server-option");
        for (var j = 0; j < allOptions.length; j++) {
          if (allOptions[j].classList) {
            allOptions[j].classList.remove("is-active");
          }
        }
        if (btn.classList) {
          btn.classList.add("is-active");
        }
        renderServerOptions();
        if (state.selected) {
          var source = embedUrl(state.selected);
          $("#playerFrame").src = source;
        }
      };
    })(serverOptions[i], i);
  }
  
  window.onhashchange = function() {
    handleRoute();
  };
  
  document.onFullscreenChange = function() {
    var label = document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen";
    if ($("#fullscreenButton")) $("#fullscreenButton").textContent = label;
    if ($("#fullscreenAction")) {
      $("#fullscreenAction").textContent = document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen Video";
    }
  };
  
  window.onbeforeunload = saveDeviceState;
}

function toggleFullscreen() {
  var target = document.querySelector(".video-panel");
  if (!target) return;
  
  try {
    if (document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
    } else if (target.requestFullscreen) {
      target.requestFullscreen();
    }
  } catch (e) {
    var iframe = $("#playerFrame");
    if (iframe && iframe.requestFullscreen) {
      try {
        iframe.requestFullscreen();
      } catch (ee) {}
    }
  }
}

function getNavigationItems() {
  var suggestionsRow = state.rows.get ? state.rows.get("suggestions") : state.rows["_suggestions"];
  var suggestions = (suggestionsRow && suggestionsRow.items) ? suggestionsRow.items : [];
  
  if (suggestions.length > 1) {
    return suggestions;
  }
  
  var cached = [];
  if (state.itemCache.values) {
    var valuesResult = state.itemCache.values();
    if (valuesResult && typeof valuesResult[Symbol.iterator] === 'function') {
      // Native Map iterator - convert to array (ES5 compatible)
      var iter = valuesResult[Symbol.iterator]();
      var iterResult = iter.next();
      while (!iterResult.done) {
        cached.push(iterResult.value);
        iterResult = iter.next();
      }
    } else if (Array.isArray(valuesResult)) {
      // Custom Map fallback
      cached = valuesResult;
    }
  }
  
  var filtered = [];
  for (var i = 0; i < cached.length; i++) {
    if (cached[i] && cached[i].mediaType === state.selected.mediaType) {
      filtered.push(cached[i]);
    }
  }
  return filtered;
}

function getCurrentWatchIndex(items) {
  if (!state.selected) return -1;
  for (var i = 0; i < items.length; i++) {
    if (items[i].mediaType === state.selected.mediaType && String(items[i].id) === String(state.selected.id)) {
      return i;
    }
  }
  return -1;
}

function navigateWatch(direction) {
  var items = getNavigationItems();
  if (!items.length || !state.selected) return;
  
  var currentIndex = getCurrentWatchIndex(items);
  var nextIndex = ((currentIndex + direction + items.length) % items.length + items.length) % items.length;
  var nextItem = items[nextIndex];
  
  if (nextItem) {
    openWatch(nextItem.mediaType, nextItem.id);
  }
}

function toggleZoom() {
  var shell = document.querySelector(".watch-shell");
  if (!shell) return;
  
  var hasZoom = shell.className && shell.className.indexOf("is-zoomed") !== -1;
  if (hasZoom) {
    if (shell.classList) {
      shell.classList.remove("is-zoomed");
    } else {
      shell.className = (shell.className || "").replace(/\bis-zoomed\b/g, "").trim();
    }
  } else {
    if (shell.classList) {
      shell.classList.add("is-zoomed");
    } else {
      shell.className = (shell.className || "") + " is-zoomed";
    }
  }
  
  var button = $("#zoomButton");
  var isZoomed = shell.className && shell.className.indexOf("is-zoomed") !== -1;
  button.textContent = isZoomed ? "Normal View" : "Zoom";
}

function renderServerOptions() {
  var serverOptions = $$(".server-option");
  for (var i = 0; i < serverOptions.length; i++) {
    var btn = serverOptions[i];
    var serverName = state.domains[i % state.domains.length] || "source";
    var label = (i === 0 ? "Full HD" : (i === 1 ? "Backup HD" : "Fast Stream")) + " - " + serverName;
    btn.textContent = label;
    
    var isActive = i === state.domainIndex;
    if (btn.classList) {
      if (isActive) btn.classList.add("is-active");
      else btn.classList.remove("is-active");
    } else {
      var classes = (btn.className || "").split(" ");
      var idx = classes.indexOf("is-active");
      if (isActive && idx === -1) {
        classes.push("is-active");
      } else if (!isActive && idx !== -1) {
        classes.splice(idx, 1);
      }
      btn.className = classes.join(" ");
    }
  }
  
  var active = state.domains[state.domainIndex % state.domains.length] || "source";
  $("#serverName").textContent = "Server " + (state.domainIndex + 1) + " · " + active;
}

function serializeItem(item) {
  return {
    id: item.id,
    mediaType: item.mediaType,
    title: item.title,
    year: item.year,
    posterPath: item.posterPath,
    backdropPath: item.backdropPath,
    overview: item.overview,
    rating: item.rating,
    quality: item.quality,
    imdbID: item.imdbID
  };
}

function rememberWatching(item) {
  var key = cacheKey(item.mediaType, item.id);
  var serialized = serializeItem(item);
  
  state.device.history = [{
    key: key,
    item: serialized,
    lastWatchedAt: Date.now(),
    status: "Started"
  }].concat(
    state.device.history.filter(function(entry) { return entry.key !== key; })
  ).slice(0, 30);
  
  saveDeviceState();
}

function historyItems() {
  var items = [];
  for (var i = 0; i < state.device.history.length; i++) {
    var entry = state.device.history[i];
    var key = cacheKey(entry.item.mediaType, entry.item.id);
    state.itemCache.set ? state.itemCache.set(key, entry.item) : (state.itemCache._data["_" + key] = entry.item);
    
    items.push({
      id: entry.item.id,
      mediaType: entry.item.mediaType,
      title: entry.item.title,
      year: entry.item.year,
      posterPath: entry.item.posterPath,
      backdropPath: entry.item.backdropPath,
      overview: entry.item.overview,
      rating: entry.item.rating,
      quality: entry.item.quality,
      imdbID: entry.item.imdbID,
      progressLabel: entry.status || "Continue"
    });
  }
  return items;
}

function watchlistItems() {
  var items = [];
  for (var i = 0; i < state.device.watchlist.length; i++) {
    var entry = state.device.watchlist[i];
    var key = cacheKey(entry.mediaType, entry.id);
    state.itemCache.set ? state.itemCache.set(key, entry) : (state.itemCache._data["_" + key] = entry);
    items.push(entry);
  }
  return items;
}

function isStarred(item) {
  for (var i = 0; i < state.device.watchlist.length; i++) {
    var entry = state.device.watchlist[i];
    if (entry.mediaType === item.mediaType && String(entry.id) === String(item.id)) {
      return true;
    }
  }
  return false;
}

function toggleWatchlist(item) {
  var exists = isStarred(item);
  if (exists) {
    var filtered = [];
    for (var i = 0; i < state.device.watchlist.length; i++) {
      var entry = state.device.watchlist[i];
      if (!(entry.mediaType === item.mediaType && String(entry.id) === String(item.id))) {
        filtered.push(entry);
      }
    }
    state.device.watchlist = filtered;
  } else {
    state.device.watchlist = [serializeItem(item)].concat(state.device.watchlist).slice(0, 50);
  }
  saveDeviceState();
}

function updateWatchLaterButton() {
  if (!state.selected) return;
  var btn = $("#watchLaterButton");
  btn.textContent = isStarred(state.selected) ? "Remove from Watchlist" : "Add to Watchlist";
}

function init() {
  wireGlobal();
  return refreshDomains()
    .then(function() {
      return handleRoute();
    })
    .catch(function(error) {
      console.log("Init error:", error);
    });
}

// Start the app when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
