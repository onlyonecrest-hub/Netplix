const imageBase = "https://image.tmdb.org/t/p";
const rowEndpoints = [
  ["suggestions", "Suggestions", "/trending/movie/week"],
  ["movies", "Popular Movies", "/movie/popular"],
  ["new", "New Releases", "/movie/now_playing"],
  ["series", "TV-Series", "/tv/popular"],
  ["action", "Action", "/discover/movie?with_genres=28&sort_by=popularity.desc"],
  ["top", "Top IMDb", "/movie/top_rated"]
];
const rowEndpointMap = new Map(rowEndpoints.map(([key, title, endpoint]) => [key, { title, endpoint }]));
const storageKey = "streamflix.device.v2";

const state = {
  rows: new Map(),
  itemCache: new Map(),
  domains: ["vidsrcme.su", "vidsrc-embed.ru", "vidsrc-embed.su", "vsrc.su"],
  domainIndex: 0,
  rowPages: Object.fromEntries(rowEndpoints.map(([key]) => [key, 1])),
  selected: null,
  heroIndex: 0,
  heroTimer: null,
  device: loadDeviceState()
};

const $ = (selector) => document.querySelector(selector);

function tmdb(path) {
  const glue = path.includes("?") ? "&" : "?";
  return fetchJson(`/api/tmdb${path}${glue}language=en-US`);
}

function loadDeviceState() {
  try {
    const existing = JSON.parse(localStorage.getItem(storageKey) || "null");
    if (existing?.deviceId) return existing;
  } catch {
    // Start fresh below.
  }
  const created = {
    deviceId: crypto.randomUUID ? crypto.randomUUID() : `device-${Date.now()}`,
    history: [],
    watchlist: []
  };
  localStorage.setItem(storageKey, JSON.stringify(created));
  return created;
}

function saveDeviceState() {
  localStorage.setItem(storageKey, JSON.stringify(state.device));
}

async function fetchJson(url, timeout = 22000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

function mediaType(item) {
  return item.media_type || (item.first_air_date ? "tv" : "movie");
}

function normalize(item, fallbackType = "movie") {
  const type = item.media_type || fallbackType || mediaType(item);
  return {
    id: item.id,
    mediaType: type,
    title: item.title || item.name || "Untitled",
    year: (item.release_date || item.first_air_date || "").slice(0, 4),
    posterPath: item.poster_path,
    backdropPath: item.backdrop_path || item.poster_path,
    overview: item.overview || "No description available yet.",
    rating: item.vote_average ? item.vote_average.toFixed(1) : "N/A",
    quality: item.release_date && item.release_date.startsWith("2026") ? "CAM" : "HD",
    imdbID: item.imdb_id || item.external_ids?.imdb_id || ""
  };
}

function poster(item, size = "w342") {
  if (!item?.posterPath) return "/poster.svg";
  return `${imageBase}/${size}${item.posterPath}`;
}

function backdrop(item, size = "w1280") {
  if (!item?.backdropPath) return poster(item, "w780");
  return `${imageBase}/${size}${item.backdropPath}`;
}

async function refreshDomains() {
  try {
    const payload = await fetchJson("/api/vidsrc-domains", 7000);
    if (payload.domains?.length) state.domains = payload.domains;
  } catch {
    // The bundled domains remain available.
  }
}

async function loadRows() {
  $("#sections").innerHTML = `<p class="loading-note">Loading TMDB trending and recent titles...</p>`;
  for (const [key] of rowEndpoints) {
    await loadRow(key);
    renderHome();
  }
  const first = state.rows.get("suggestions")?.items?.[0] || [...state.itemCache.values()][0];
  if (first) state.selected = first;
  startHero();
}

async function loadRow(key) {
  const config = rowEndpointMap.get(key);
  if (!config) return;
  const page = state.rowPages[key] || 1;
  const endpoint = withPage(config.endpoint, page);
  try {
    const fallbackType = endpoint.includes("/tv/") ? "tv" : "movie";
    const payload = await tmdb(endpoint);
    const items = (payload.results || [])
      .filter((item) => item.poster_path && (item.media_type !== "person"))
      .slice(0, 18)
      .map((item) => normalize(item, fallbackType));
    state.rows.set(key, { title: config.title, items, page, totalPages: Math.min(payload.total_pages || 1, 500) });
    items.forEach((item) => state.itemCache.set(cacheKey(item.mediaType, item.id), item));
  } catch {
    state.rows.set(key, { title: config.title, items: [], page, totalPages: 1 });
  }
}

function withPage(endpoint, page) {
  const glue = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${glue}page=${page}`;
}

function cacheKey(type, id) {
  return `${type}:${id}`;
}

function card(item) {
  const starred = isStarred(item) ? "is-starred" : "";
  return `
    <button class="movie-card" data-type="${item.mediaType}" data-id="${item.id}" aria-label="Watch ${escapeHtml(item.title)}">
      <span class="star ${starred}" data-star-type="${item.mediaType}" data-star-id="${item.id}" title="Watch later">★</span>
      <span class="quality">${escapeHtml(item.quality)}</span>
      <img src="${poster(item)}" alt="${escapeHtml(item.title)} poster" loading="lazy" onerror="this.src='/poster.svg'" />
      <span class="movie-title">${escapeHtml(item.title)}</span>
    </button>
  `;
}

function renderHome() {
  $("#homeView").hidden = false;
  $("#watchView").hidden = true;
  const heroItems = state.rows.get("suggestions")?.items || [];
  renderHero(heroItems);
  renderSchedule(heroItems.slice(0, 6));
  const personalRows = [
    ["continue", "Continue Watching", historyItems()],
    ["watchlist", "Watchlist", watchlistItems()]
  ].filter(([, , items]) => items.length);

  const personalHtml = personalRows.map(([key, title, items]) => sectionHtml(key, { title, items }, false)).join("");
  const dynamicHtml = [...state.rows.entries()].map(([key, row]) => sectionHtml(key, row, true)).join("");

  $("#sections").innerHTML = personalHtml + dynamicHtml || `<p class="loading-note">Loading TMDB titles...</p>`;
  wireCards(document);
  wirePaging();
  wireStars(document);
}

function sectionHtml(key, row, canPage) {
    if (!row.items.length) return "";
    return `
      <section class="section-block" id="${key}">
        <div class="section-head">
          <h2 class="section-title">${escapeHtml(row.title)}</h2>
          ${canPage ? `
            <div class="row-pager">
              <button data-page-row="${key}" data-page-dir="-1">Previous</button>
              <span>Page ${row.page || 1}</span>
              <button data-page-row="${key}" data-page-dir="1">Next</button>
            </div>
          ` : ""}
        </div>
        <div class="poster-grid">${row.items.map(card).join("")}</div>
      </section>
    `;
}

function renderHero(items) {
  if (!items.length) {
    $("#heroSlider").innerHTML = "";
    return;
  }
  const active = state.heroIndex % Math.min(items.length, 5);
  $("#heroSlider").innerHTML = items.slice(0, 5).map((item, index) => `
    <article class="hero-slide ${index === active ? "is-active" : ""}" style="background-image:url('${backdrop(item)}')">
      <div class="hero-caption">
        <h1>${escapeHtml(item.title)}</h1>
        <p>${escapeHtml(item.overview)}</p>
        <button data-watch-type="${item.mediaType}" data-watch-id="${item.id}">Stream in HD</button>
      </div>
    </article>
  `).join("");
  document.querySelectorAll("[data-watch-id]").forEach((button) => {
    button.addEventListener("click", () => openWatch(button.dataset.watchType, button.dataset.watchId));
  });
}

function renderSchedule(items) {
  $("#scheduleList").innerHTML = items.map((item) => `
    <button class="schedule-item" data-type="${item.mediaType}" data-id="${item.id}">
      <img src="${poster(item, "w185")}" alt="" onerror="this.src='/poster.svg'" />
      <span>${escapeHtml(item.title)}<br><small>${escapeHtml(item.year || item.mediaType)}</small></span>
    </button>
  `).join("");
  document.querySelectorAll(".schedule-item").forEach((button) => {
    button.addEventListener("click", () => openWatch(button.dataset.type, button.dataset.id));
  });
}

function startHero() {
  clearInterval(state.heroTimer);
  state.heroTimer = setInterval(() => {
    const items = state.rows.get("suggestions")?.items || [];
    if ($("#homeView").hidden || !items.length) return;
    state.heroIndex = (state.heroIndex + 1) % Math.min(items.length, 5);
    renderHero(items);
  }, 7000);
}

function wireCards(root) {
  root.querySelectorAll(".movie-card").forEach((button) => {
    button.addEventListener("click", () => openWatch(button.dataset.type, button.dataset.id));
  });
}

function wireStars(root) {
  root.querySelectorAll("[data-star-id]").forEach((star) => {
    star.addEventListener("click", (event) => {
      event.stopPropagation();
      const item = state.itemCache.get(cacheKey(star.dataset.starType, star.dataset.starId));
      if (!item) return;
      toggleWatchlist(item);
      renderHome();
    });
  });
}

function wirePaging() {
  document.querySelectorAll("[data-page-row]").forEach((button) => {
    button.addEventListener("click", async () => {
      const key = button.dataset.pageRow;
      const dir = Number(button.dataset.pageDir);
      const row = state.rows.get(key);
      const total = row?.totalPages || 500;
      state.rowPages[key] = Math.max(1, Math.min(total, (state.rowPages[key] || 1) + dir));
      await loadRow(key);
      renderHome();
      document.getElementById(key)?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  });
}

async function getDetails(type, id) {
  const key = cacheKey(type, id);
  const cached = state.itemCache.get(key);
  const endpointType = type === "tv" ? "tv" : "movie";
  const payload = await tmdb(`/${endpointType}/${id}?append_to_response=external_ids,credits,videos`);
  const item = {
    ...normalize(payload, endpointType),
    imdbID: payload.external_ids?.imdb_id || cached?.imdbID || "",
    runtime: endpointType === "tv" ? `${payload.number_of_seasons || 1} season${payload.number_of_seasons === 1 ? "" : "s"}` : `${payload.runtime || "N/A"} min`,
    genres: (payload.genres || []).map((genre) => genre.name).join(", "),
    actors: (payload.credits?.cast || []).slice(0, 4).map((actor) => actor.name).join(", "),
    director: (payload.credits?.crew || []).find((person) => person.job === "Director")?.name || payload.created_by?.[0]?.name || "N/A"
  };
  state.itemCache.set(key, item);
  return item;
}

function activeDomain() {
  return state.domains[state.domainIndex % state.domains.length];
}

function embedUrl(item) {
  const params = new URLSearchParams({ autoplay: "1", ds_lang: "en", autonext: "1" });
  if (item.imdbID) {
    if (item.mediaType === "tv") return `https://${activeDomain()}/embed/tv/${item.imdbID}/1-1?${params}`;
    return `https://${activeDomain()}/embed/movie/${item.imdbID}?${params}`;
  }
  if (item.mediaType === "tv") return `https://${activeDomain()}/embed/tv/${item.id}/1-1?${params}`;
  return `https://${activeDomain()}/embed/movie/${item.id}?${params}`;
}

async function openWatch(type, id) {
  const item = await getDetails(type, id);
  state.selected = item;
  const source = embedUrl(item);
  rememberWatching(item);

  $("#homeView").hidden = true;
  $("#watchView").hidden = false;
  $("#breadcrumb").innerHTML = `<a href="#/">Home</a> / ${item.mediaType === "tv" ? "TV-Series" : "Movies"} / ${escapeHtml(item.title)}`;
  $("#playerFrame").src = source;
  $("#serverName").textContent = `Server ${state.domainIndex + 1}`;
  renderServerOptions();
  $("#detailPoster").src = poster(item);
  $("#detailPoster").alt = `${item.title} poster`;
  $("#detailTitle").textContent = item.title;
  $("#detailPlot").textContent = item.overview;
  $("#detailFacts").innerHTML = `
    <span><strong>Genre:</strong> ${escapeHtml(item.genres || item.genre || "N/A")}</span>
    <span><strong>Quality:</strong> <mark>${escapeHtml(item.quality || "HD")}</mark></span>
    <span><strong>Actor:</strong> ${escapeHtml(item.actors || "N/A")}</span>
    <span><strong>Duration:</strong> ${escapeHtml(item.runtime || "N/A")}</span>
    <span><strong>Director:</strong> ${escapeHtml(item.director || "N/A")}</span>
    <span><strong>Release:</strong> ${escapeHtml(item.year || "N/A")}</span>
    <span><strong>IMDb:</strong> ${escapeHtml(item.rating || "N/A")}</span>
    <span><strong>TMDB:</strong> ${escapeHtml(item.id)}</span>
  `;
  await renderSuggestions(type, id);
  updateWatchLaterButton();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function renderSuggestions(type, id) {
  let items = [];
  try {
    const endpointType = type === "tv" ? "tv" : "movie";
    const payload = await tmdb(`/${endpointType}/${id}/recommendations?page=1`);
    items = (payload.results || [])
      .filter((item) => item.poster_path)
      .slice(0, 12)
      .map((item) => normalize(item, endpointType));
    items.forEach((item) => state.itemCache.set(cacheKey(item.mediaType, item.id), item));
  } catch {
    items = [];
  }
  if (!items.length) {
    items = [...state.itemCache.values()]
      .filter((item) => !(item.mediaType === type && String(item.id) === String(id)))
      .slice(0, 12);
  }
  $("#suggestions").innerHTML = items.map(card).join("");
  wireCards($("#suggestions"));
  wireStars($("#suggestions"));
}

async function search(query) {
  $("#sections").innerHTML = `<p class="loading-note">Searching TMDB for "${escapeHtml(query)}"...</p>`;
  try {
    const payload = await tmdb(`/search/multi?query=${encodeURIComponent(query)}&include_adult=false`);
    const items = (payload.results || [])
      .filter((item) => item.media_type === "movie" || item.media_type === "tv")
      .filter((item) => item.poster_path)
      .slice(0, 18)
      .map((item) => normalize(item, item.media_type));
    items.forEach((item) => state.itemCache.set(cacheKey(item.mediaType, item.id), item));
    state.rows.set("suggestions", { title: `Search: ${query}`, items });
    renderHome();
  } catch (error) {
    $("#sections").innerHTML = `<p class="loading-note">${escapeHtml(error.message)}</p>`;
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function wireGlobal() {
  $("#searchForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const query = $("#searchInput").value.trim();
    if (query) search(query);
  });
  $("#streamButton").addEventListener("click", () => state.selected && openWatch(state.selected.mediaType, state.selected.id));
  $("#fullscreenButton").addEventListener("click", toggleFullscreen);
  $("#fullscreenAction").addEventListener("click", toggleFullscreen);
  $("#watchLaterButton").addEventListener("click", () => {
    if (!state.selected) return;
    toggleWatchlist(state.selected);
    updateWatchLaterButton();
    renderSuggestions(state.selected.mediaType, state.selected.id);
  });
  $("#downloadButton").addEventListener("click", () => state.selected && openWatch(state.selected.mediaType, state.selected.id));
  $("#openSource").addEventListener("click", () => document.querySelector(".server-panel")?.classList.toggle("is-open"));
  document.querySelectorAll(".server-option").forEach((button, index) => {
    button.addEventListener("click", () => {
      state.domainIndex = index % state.domains.length;
      document.querySelectorAll(".server-option").forEach((option) => option.classList.remove("is-active"));
      button.classList.add("is-active");
      if (state.selected) openWatch(state.selected.mediaType, state.selected.id);
    });
  });
  window.addEventListener("hashchange", () => {
    if (location.hash === "#/" || location.hash === "") renderHome();
  });
  document.addEventListener("fullscreenchange", () => {
    const label = document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen";
    $("#fullscreenButton").textContent = label;
    $("#fullscreenAction").textContent = document.fullscreenElement ? "Exit Fullscreen" : "Fullscreen Video";
  });
}

async function toggleFullscreen() {
  const target = document.querySelector(".video-panel");
  if (!target) return;
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await target.requestFullscreen({ navigationUI: "hide" });
    }
  } catch {
    const iframe = $("#playerFrame");
    iframe?.requestFullscreen?.();
  }
}

function renderServerOptions() {
  document.querySelectorAll(".server-option").forEach((button, index) => {
    button.textContent = `${index === 0 ? "Full HD" : index === 1 ? "Backup HD" : "Fast Stream"} - ${state.domains[index % state.domains.length] || "source"}`;
    button.classList.toggle("is-active", index === state.domainIndex);
  });
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
  const key = cacheKey(item.mediaType, item.id);
  state.device.history = [
    { key, item: serializeItem(item), lastWatchedAt: Date.now(), status: "Started" },
    ...state.device.history.filter((entry) => entry.key !== key)
  ].slice(0, 30);
  saveDeviceState();
}

function historyItems() {
  return state.device.history.map((entry) => {
    state.itemCache.set(cacheKey(entry.item.mediaType, entry.item.id), entry.item);
    return { ...entry.item, progressLabel: entry.status || "Continue" };
  });
}

function watchlistItems() {
  return state.device.watchlist.map((entry) => {
    state.itemCache.set(cacheKey(entry.mediaType, entry.id), entry);
    return entry;
  });
}

function isStarred(item) {
  return state.device.watchlist.some((entry) => entry.mediaType === item.mediaType && String(entry.id) === String(item.id));
}

function toggleWatchlist(item) {
  const exists = isStarred(item);
  if (exists) {
    state.device.watchlist = state.device.watchlist.filter((entry) => !(entry.mediaType === item.mediaType && String(entry.id) === String(item.id)));
  } else {
    state.device.watchlist = [serializeItem(item), ...state.device.watchlist].slice(0, 50);
  }
  saveDeviceState();
}

function updateWatchLaterButton() {
  if (!state.selected) return;
  $("#watchLaterButton").textContent = isStarred(state.selected) ? "Remove from Watchlist" : "Add to Watchlist";
}

async function init() {
  wireGlobal();
  await refreshDomains();
  await loadRows();
}

init();
