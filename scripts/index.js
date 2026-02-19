let currentUser = null;
let selectedGameId = null;
let currentGames = [];
let isLoading = false;

// Функция debounce для ограничения частоты вызовов
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// =============================
// 1) Прелоадер списка игр (ID="preloader")
// =============================
function showLoading() {
  console.log('Showing preloader (main list)');
  const preloader = document.getElementById('preloader');
  if (preloader) {
    preloader.style.display = 'flex';
    preloader.style.opacity = '1'; // Изначально непрозрачный
    isLoading = true;
  }
}

function hideLoading() {
  console.log('Hiding preloader (main list)');
  const preloader = document.getElementById('preloader');
  if (preloader) {
    preloader.style.transition = 'opacity 6s ease-out';
    preloader.style.opacity = '0';
    setTimeout(() => {
      preloader.style.display = 'none';
    }, 6000); // Уменьшил время анимации до 0.5s для плавности
  }
  isLoading = false;
}

// =============================
// 2) Лоадер шестерёнки для загрузки игры (ID="gameLoader") - УЛУЧШЕННАЯ ВЕРСИЯ
// =============================
function showGameLoader() {
  console.log('Showing game loader (gear)');
  const gameLoader = document.getElementById('gameLoader');
  if (gameLoader) {
    gameLoader.classList.add('visible');
  }
}

function hideGameLoader() {
  console.log('Hiding game loader (gear)');
  const gameLoader = document.getElementById('gameLoader');
  if (gameLoader) {
    gameLoader.classList.remove('visible');
  }
}

// Добавляем обработчики для корректного скрытия лоадера при возврате
let loaderTimeout = null;

window.addEventListener('pageshow', function(event) {
  if (event.persisted) {
    console.log('Page restored from cache, hiding loader');
    clearTimeout(loaderTimeout);
    hideGameLoader();
  }
});

document.addEventListener('DOMContentLoaded', function() {
  // Сразу скрываем лоадер при загрузке/восстановлении страницы
  hideGameLoader();
});

// =============================
// 3) Загрузка данных списка игр
// =============================
async function loadData() {
  if (isLoading) {
    console.log('loadData skipped: already loading');
    return;
  }
  showLoading();
  try {
    console.log('Loading data...');
    const token = localStorage.getItem('token');
    if (token) {
      const headers = { 'Authorization': `Bearer ${token}` };
      const userRes = await fetch('/user-data', { headers });
      if (!userRes.ok) {
        console.error('Failed to fetch user data:', userRes.status);
        if (userRes.status === 401 || userRes.status === 403) {
          console.log('Токен недействителен или истёк, продолжаем как гостевой пользователь');
          localStorage.removeItem('token');
          currentUser = null;
          updateAuthPanel(null);
        } else {
          throw new Error('Ошибка загрузки данных пользователя');
        }
      } else {
        currentUser = await userRes.json();
        console.log('User loaded:', currentUser.username);

        if (currentUser.banned && currentUser.banned_until && new Date(currentUser.banned_until) > new Date()) {
          const banEnd = new Date(currentUser.banned_until).toLocaleString('ru-RU');
          alert(`Ваш аккаунт заблокирован до ${banEnd}. Причина: ${currentUser.ban_reason || 'Причина не указана'}`);
          localStorage.removeItem('token');
          currentUser = null;
          updateAuthPanel(null);
          currentGames = [];
          await waitForTemplate();
          renderGames([]);
          return;
        }

        // Синхронизируем избранное
        await syncFavoritesWithServer();
      }
    } else {
      currentUser = null;
      console.log('Нет токена, продолжаем как гость');
      updateAuthPanel(null);
    }

    const gamesRes = await fetch('/games');
    if (!gamesRes.ok) {
      throw new Error('Ошибка загрузки списка игр');
    }
    let games = await gamesRes.json();
    console.log('loadData: games:', games);

    if (token && currentUser) {
      const favoritesRes = await fetch('/favorites', { headers: { 'Authorization': `Bearer ${token}` } });
      if (!favoritesRes.ok) {
        console.error('Failed to fetch favorites:', favoritesRes.status);
        if (favoritesRes.status === 401 || favoritesRes.status === 403) {
          console.log('Токен недействителен для избранного, продолжаем без избранного');
          localStorage.removeItem('token');
          currentUser = null;
          updateAuthPanel(null);
        } else {
          throw new Error('Ошибка загрузки списка избранного');
        }
      } else {
        const favorites = await favoritesRes.json();
        console.log('loadData: favorites:', favorites);
        localStorage.setItem('favorites', JSON.stringify(favorites));
        currentGames = games.map(game => ({
          ...game,
          isFavorite: favorites.some(fav => fav.id === game.id),
          canEdit: currentUser.role === 'admin' || game.author === currentUser.username,
          hasRated: Array.isArray(game.ratings) && game.ratings.some(r => r.user === currentUser.username)
        }));
      }
    } else {
      currentGames = games.map(game => ({
        ...game,
        isFavorite: false,
        canEdit: false,
        hasRated: false
      }));
    }
    currentGames = (currentUser && currentUser.role === 'admin')
      ? currentGames
      : currentGames.filter(game => !game.frozen);

    updateAuthPanel(currentUser);
    await waitForTemplate();
    renderGames(currentGames);
    if (currentUser) {
      showGameOfTheDayModal(currentGames);
    }
  } catch (err) {
    console.error('loadData: Error:', err);
    localStorage.removeItem('token');
    currentUser = null;
    currentGames = [];
    updateAuthPanel(null);
    await waitForTemplate().catch(() => console.error('Template not found, rendering empty list'));
    renderGames([]);
    alert('Ошибка загрузки данных. Пожалуйста, попробуйте позже.');
  } finally {
    hideLoading();
  }
}

async function logout() {
    try {
        const token = localStorage.getItem('token');
        if (token) {
            console.log('Logging out...');
            const response = await fetch('/logout', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!response.ok) {
                const error = await response.json();
                console.error('Logout failed:', error);
                throw new Error(error.message || 'Ошибка выхода');
            }
            console.log('Logout request sent');
        }
    } catch (err) {
        console.error('Ошибка выхода:', err);
    } finally {
        // Сохраняем текущий список избранных игр в localStorage
        if (currentGames.length > 0) {
            localStorage.setItem('favorites', JSON.stringify(currentGames.filter(game => game.isFavorite)));
            console.log('Saved favorites to localStorage:', JSON.stringify(currentGames.filter(game => game.isFavorite)));
        }
        localStorage.removeItem('token');
        currentUser = null;
        updateAuthPanel(null);
        console.log('State cleared, redirecting to index...');
        window.location.href = 'index.html';
    }
}

    function updateAuthPanel(user) {
      const authPanel = document.getElementById('authPanel');
      if (!authPanel) {
        console.error('Auth panel not found');
        return;
      }

      console.log('Updating auth panel:', user ? user.username : 'No user');
      if (user && user.username && localStorage.getItem('token')) {
        authPanel.innerHTML = `
          <div class="user-info">
            <img src="${user.avatar || 'https://via.placeholder.com/40'}" alt="Аватар" class="user-avatar">
            <span>${user.username}</span>
            <a href="lichniy_cabinet.html" class="btn neon-btn">Кабинет</a>
            <button onclick="logout()" class="btn neon-btn">Выйти</button>
          </div>
        `;
      } else {
        authPanel.innerHTML = `
          <div class="auth-dropdown">
            <button class="btn neon-btn dropdown-toggle">🔓 Войти / Рег.</button>
            <div class="dropdown-menu">
              <a href="login.html" class="dropdown-item">🚪 Вход</a>
              <a href="register.html" class="dropdown-item">📝 Регистрация</a>
            </div>
          </div>
        `;
        initAuthDropdown();
      }
    }

    async function waitForTemplate(retries = 20, delay = 200) {
      for (let attempt = 1; attempt <= retries; attempt++) {
        const template = document.getElementById('game-card-template');
        if (template) return;
        console.warn(`Попытка ${attempt}: Шаблон 'game-card-template' не найден. Ожидание ${delay}мс...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      throw new Error("Шаблон 'game-card-template' не найден после всех попыток");
    }

// =============================
// 4) Функция отрисовки карточек
// =============================
function renderGames(games) {
  console.log('renderGames: games =', games);
  const gamesContainer = document.getElementById('gamesGrid');
  const template = document.getElementById('game-card-template');

  if (!gamesContainer) {
    console.error('renderGames: gamesGrid not found');
    gamesContainer.innerHTML = '<p class="no-games">Ошибка: контейнер не найден</p>';
    return;
  }
  if (!template) {
    console.error('renderGames: game-card-template not found');
    gamesContainer.innerHTML = '<p class="no-games">Ошибка: шаблон игры не найден</p>';
    return;
  }
  gamesContainer.innerHTML = '';
  if (!games || games.length === 0) {
    console.log('renderGames: No games to render');
    gamesContainer.innerHTML = '<p class="no-games">Игры не найдены</p>';
    return;
  }

  games.forEach((game) => {
    console.log('renderGames: Rendering game =', game);
    const clone = template.content.cloneNode(true);

    // === Обложка ===
    const cover = clone.querySelector('.game-cover');
    const placeholder = clone.querySelector('.game-cover-placeholder');
    console.log(`[DEBUG] Game ${game.id} cover: ${game.cover}`);
    if (game.cover && typeof game.cover === 'string') {
      if (game.cover.startsWith('data:') || game.cover.startsWith('/covers/')) {
        cover.src = game.cover;
      } else {
        console.warn(`Invalid cover URL for game ${game.id}: ${game.cover}, using placeholder`);
        cover.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
        cover.style.display = 'none';
        placeholder.style.display = 'flex';
      }
      cover.style.display = '';
      cover.onerror = () => {
        console.error(`Failed to load cover for game ${game.id}: ${game.cover}`);
        cover.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
        cover.style.display = 'none';
        placeholder.style.display = 'flex';
        cover.onerror = null;
      };
      placeholder.style.display = 'none';
    } else {
      console.log(`No cover for game ${game.id}, using placeholder`);
      cover.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
      cover.style.display = 'none';
      placeholder.style.display = 'flex';
    }

    // === Заголовок ===
    const titleEl = clone.querySelector('.game-title');
    if (titleEl) {
      titleEl.textContent = game.title || game.name || 'Без имени';
    }

    // === Оценка ===
    const ratingEl = clone.querySelector('.rating-value');
    if (ratingEl) {
      const rating = getAverageRatingValue(game.ratings);
      ratingEl.textContent = rating.toFixed(1);
    }

    // === Кнопка “Подробнее” ===
    const infoButton = clone.querySelector('.action-button.info-action');
    if (infoButton) {
      infoButton.addEventListener('click', (e) => {
        e.stopPropagation();
        window.open(`descr_game.html?id=${game.id}`, '_blank');
      });
    }

    // === Кнопка “Избранное” ===
    const favoriteButton = clone.querySelector('.action-button.favorite-action');
    if (favoriteButton) {
      favoriteButton.classList.toggle('active', !!game.isFavorite);
      favoriteButton.title = game.isFavorite
        ? 'Убрать из избранного'
        : 'Добавить в избранное';
      favoriteButton.addEventListener('click', async (e) => {
        e.stopPropagation();
        console.log('Toggling favorite for game:', game.id, 'current isFavorite:', game.isFavorite);
        await toggleFavorite(game.id, false);
      });
    }

    // === Обработчик клика по самой карточке ===
    const card = clone.querySelector('.game-card');
    if (card) {
      card.style.cursor = 'pointer';
      card.addEventListener('click', async () => {
        // 1) Показываем “шестерёночный” лоадер
        showGameLoader();

        const token = localStorage.getItem('token');
        const url = `/games/${game.id}/play`;
        console.log('Opening game URL:', url);

        // 2) Чтобы посчитать просмотр, отправляем POST /view (не дожидаемся ответа)
        try {
          await fetch(`/games/${game.id}/view`, {
            method: 'POST',
            headers: token ? { 'Authorization': `Bearer ${token}` } : {}
          });
        } catch (err) {
          console.error('Error in view fetch:', err);
          // Даже при ошибке продолжаем
        }

        // 3) Делаем минимальную паузу (чтобы пользователь увидел анимацию лоадера хотя бы 300ms)
        setTimeout(() => {
          window.location.href = url;
          // hideGameLoader() не вызываем, так как будет переход на новую страницу
        }, 300);
      });
    }

    gamesContainer.appendChild(clone);
  });
}

// Файл: scripts/index.js
async function toggleFavorite(gameId, isFavoritesPage = false) {
    if (!currentUser) {
        console.error('toggleFavorite: currentUser is null');
        alert('Пожалуйста, войдите в систему, чтобы добавить игру в избранное');
        return;
    }

    try {
        console.log(`toggleFavorite: Toggling favorite for game: ${gameId}, isFavoritesPage: ${isFavoritesPage}`);
        const token = localStorage.getItem('token');
        if (!token) {
            throw new Error('Токен авторизации отсутствует');
        }

        const game = currentGames.find(g => g.id === gameId);
        if (!game) {
            console.error(`toggleFavorite: Game not found: ${gameId}`);
            throw new Error('Игра не найдена в текущем списке');
        }

        const isFavorite = game.isFavorite || false;
        const endpoint = isFavorite ? `/favorites/remove/${gameId}` : `/favorites/add/${gameId}`;
        const method = isFavorite ? 'DELETE' : 'POST';

        console.log(`toggleFavorite: Sending ${method} request to ${endpoint}`);
        const response = await fetch(endpoint, {
            method: method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('toggleFavorite: Error:', error);
            if (response.status === 401) {
                alert('Сессия истекла. Пожалуйста, войдите заново.');
                localStorage.removeItem('token');
                window.location.href = '/login.html';
                return;
            }
            if (response.status === 400 && error.error?.message === 'Игра уже в избранном') {
                console.log('Game already in favorites, skipping add');
                return;
            }
            if (response.status === 404) {
                console.warn(`Game ${gameId} not found on server`);
                alert('Игра не найдена на сервере');
                return;
            }
            throw new Error(error.error?.message || 'Ошибка обновления избранного');
        }

        // Получаем обновлённый список избранного
        const favoritesRes = await fetch('/favorites', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!favoritesRes.ok) {
            throw new Error('Не удалось загрузить обновлённый список избранного');
        }

        const favorites = await favoritesRes.json();
        console.log('toggleFavorite: Updated favorites:', favorites);

        // Сохраняем в localStorage
        localStorage.setItem('favorites', JSON.stringify(favorites));

        // Обновляем currentGames
        if (isFavoritesPage) {
            currentGames = favorites.map(game => ({
                ...game,
                isFavorite: true
            }));
        } else {
            currentGames = currentGames.map(game => ({
                ...game,
                isFavorite: favorites.some(fav => fav.id === game.id),
                canEdit: currentUser.role === 'admin' || game.author === currentUser.username,
                hasRated: Array.isArray(game.ratings) && game.ratings.some(r => r.user === currentUser.username)
            }));
            currentGames = (currentUser && currentUser.role === 'admin')
                ? currentGames
                : currentGames.filter(game => !game.frozen);
        }
        console.log('toggleFavorite: Updated currentGames:', currentGames);

        await waitForTemplate();
        renderGames(currentGames);
    } catch (err) {
        console.error('toggleFavorite: Error:', err);
        alert(err.message || 'Не удалось обновить избранное');
    }
}
    function getAverageRatingValue(ratings) {
      if (!ratings || ratings.length === 0) return 0;
      return ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
    }

function showGameOfTheDayModal(games) {
  if (!currentUser || !currentUser.id) {
    console.log('showGameOfTheDayModal: No user or user ID, skipping');
    return;
  }

  const modal = document.getElementById('gameOfTheDayModal');
  if (!modal) {
    console.error('showGameOfTheDayModal: Modal not found');
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = `gameOfTheDayShown_${currentUser.id}`;
  const cache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
  if (cache.date === today) {
    console.log(`showGameOfTheDayModal: Already shown today for user ID ${currentUser.id}`);
    return;
  }

  const availableGames = (currentUser && currentUser.role === 'admin') ? games : games.filter(game => !game.frozen);
  if (!availableGames.length) {
    console.warn('showGameOfTheDayModal: No available games');
    return;
  }

  const gameCacheKey = `randomGameOfTheDay_${currentUser.id}`;
  let randomGame;
  const gameCache = JSON.parse(localStorage.getItem(gameCacheKey) || '{}');
  if (gameCache.date === today && availableGames.some(g => g.id === gameCache.id)) {
    randomGame = availableGames.find(g => g.id === gameCache.id);
  } else {
    randomGame = availableGames[Math.floor(Math.random() * availableGames.length)];
    localStorage.setItem(gameCacheKey, JSON.stringify({ date: today, id: randomGame.id }));
  }

  if (!randomGame) {
    console.warn('showGameOfTheDayModal: No game selected');
    return;
  }

  console.log('showGameOfTheDayModal: Selected game =', randomGame);

  const cover = document.getElementById('gameOfTheDayCover');
  const placeholder = document.getElementById('gameOfTheDayPlaceholder');
  if (randomGame.cover && (randomGame.cover.startsWith('data:') || randomGame.cover.startsWith('/covers/'))) {
    cover.src = randomGame.cover;
    cover.style.display = '';
    placeholder.style.display = 'none';
    cover.onerror = () => {
      console.error(`Failed to load cover for game ${randomGame.id}: ${randomGame.cover}`);
      cover.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
      cover.style.display = 'none';
      placeholder.style.display = 'flex';
      cover.onerror = null;
    };
  } else {
    cover.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg==';
    cover.style.display = 'none';
    placeholder.style.display = 'flex';
  }

  document.getElementById('gameOfTheDayTitle').textContent = randomGame.title || randomGame.name || 'Без названия';
  document.getElementById('gameOfTheDayRating').textContent = getAverageRatingValue(randomGame.ratings).toFixed(1);
  document.getElementById('ratingSection').style.display = 'none';

  const playButton = document.getElementById('playGameOfTheDay');
  playButton.onclick = () => playGameOfTheDay(randomGame.id);

  const stars = document.querySelectorAll('#ratingStars span');
  let selectedRating = 0;
  stars.forEach(star => {
    star.addEventListener('click', () => {
      selectedRating = parseInt(star.dataset.value);
      stars.forEach(s => s.style.color = parseInt(s.dataset.value) <= selectedRating ? '#ffd700' : '#ccc');
    });
  });

  const submitRatingButton = document.getElementById('submitGameOfTheDayRating');
  submitRatingButton.onclick = () => submitGameOfTheDayRating(randomGame.id, selectedRating);

  modal.style.display = 'flex';
  localStorage.setItem(cacheKey, JSON.stringify({ date: today }));
}

    function playRandomGame(gameId) {
      const token = localStorage.getItem('token');
      fetch(`/games/${gameId}/view`, {
        method: 'POST',
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      }).catch(() => { });
      const gameWindow = window.open(`/games/${gameId}/play`, '_blank');
      if (!gameWindow) {
        alert('Не удалось открыть игру. Проверьте настройки браузера (возможно, заблокированы всплывающие окна).');
      }
    }

async function applyFilters() {
  if (isLoading) {
    console.log('applyFilters: пропущено, уже загружается');
    return;
  }
  console.log('applyFilters: start');
  showLoading();

  const token = localStorage.getItem('token');
  const activeGenreButton = document.querySelector('.genre-button.active');
  const activeFilterButton = document.querySelector('.filter-button.active:not(.clear-filters)');
  const searchInput = document.getElementById('searchInput');

  const params = new URLSearchParams();
  if (activeGenreButton && activeGenreButton.dataset.genre) {
    params.append('genre', activeGenreButton.dataset.genre); // Исправлено: genres → genre
  }
  if (activeFilterButton && activeFilterButton.dataset.sort) {
    params.append('sort', activeFilterButton.dataset.sort);
  }
  if (searchInput && searchInput.value.trim()) {
    const searchQuery = searchInput.value.trim();
    params.append('search', searchQuery);
    console.log('applyFilters: search query =', searchQuery);
  }

  console.log('applyFilters: GET /games?' + params.toString());
  try {
    const res = await fetch(`/games?${params.toString()}`, {
      method: 'GET',
      headers: token ? { 'Authorization': `Bearer ${token}` } : {}
    });
    if (!res.ok) {
      console.error('applyFilters: fetch failed, status:', res.status);
      if (res.status === 401) {
        alert('Сессия истекла. Пожалуйста, войдите заново.');
        window.location.href = '/login';
        return;
      }
      throw new Error('Ошибка сервера при фильтрации');
    }

    let games = await res.json();
    console.log('applyFilters: raw games from server =', games);
    currentGames = games; // Убрали фильтр по frozen для тестирования
    console.log('applyFilters: games =', currentGames);
    console.log('applyFilters: получено игр =', currentGames.length);
    await renderGames(currentGames);
  } catch (err) {
    console.error('applyFilters: ошибка', err);
    alert('Не удалось загрузить игры. Попробуйте позже.');
    currentGames = [];
    await renderGames([]);
  } finally {
    hideLoading();
    console.log('applyFilters: end');
  }
}

    function initFilters() {
      const genreButtons = document.querySelectorAll('.genre-button');
      const filterButtons = document.querySelectorAll('.filter-button');
      const searchInput = document.getElementById('searchInput');

      console.log('initFilters: registering click-handlers');

      genreButtons.forEach(button => {
        button.addEventListener('click', () => {
          genreButtons.forEach(btn => btn.classList.remove('active'));
          button.classList.add('active');
          console.log('initFilters: genre-button clicked, genre=', button.dataset.genre);
          applyFilters();
        });
      });

      filterButtons.forEach(button => {
        button.addEventListener('click', () => {
          if (button.classList.contains('clear-filters')) {
            genreButtons.forEach(btn => btn.classList.remove('active'));
            filterButtons.forEach(btn => btn.classList.remove('active'));
            document.querySelector('.genre-button[data-genre=""]').classList.add('active');
            if (searchInput) searchInput.value = '';
            console.log('initFilters: clear-filters clicked');
            applyFilters();
          } else {
            filterButtons.forEach(btn => {
              if (!btn.classList.contains('clear-filters')) btn.classList.remove('active');
            });
            button.classList.add('active');
            console.log('initFilters: filter-button clicked, sort=', button.dataset.sort);
            applyFilters();
          }
        });
      });

      if (searchInput) {
        console.log('initFilters: registering search input handler');
        const debouncedApplyFilters = debounce(applyFilters, 300);
        searchInput.addEventListener('input', debouncedApplyFilters);
      }
    }

    function initAuthDropdown() {
      const authDropdown = document.querySelector('.auth-dropdown');
      const dropdownToggle = document.querySelector('.dropdown-toggle');

      if (dropdownToggle) {
        console.log('Initializing auth dropdown');
        dropdownToggle.addEventListener('click', (e) => {
          e.stopPropagation();
          authDropdown.classList.toggle('active');
        });

        document.addEventListener('click', (e) => {
          if (!authDropdown.contains(e.target)) {
            authDropdown.classList.remove('active');
          }
        });

        const dropdownItems = document.querySelectorAll('.dropdown-item');
        dropdownItems.forEach(item => {
          item.addEventListener('click', () => {
            authDropdown.classList.remove('active');
          });
        });
      }
    }

    function showRatingModal(gameId) {
      if (!currentUser) {
        alert('Пожалуйста, войдите в систему, чтобы оценить игру');
        return;
      }

      selectedGameId = gameId;
      document.getElementById('selectedGameId').value = gameId;
      document.getElementById('gameRating').value = '';
      document.getElementById('gameComment').value = '';
      document.getElementById('ratingModal').style.display = 'flex';
    }

    function closeRatingModal() {
      document.getElementById('ratingModal').style.display = 'none';
    }

    async function submitRating(e) {
      e.preventDefault();
      const rating = document.getElementById('gameRating').value;
      const comment = document.getElementById('gameComment').value;
      const token = localStorage.getItem('token');

      if (!rating || rating < 1 || rating > 5) {
        alert('Пожалуйста, введите оценку от 1 до 5');
        return false;
      }

      try {
        console.log('Submitting rating for game:', selectedGameId);
        const response = await fetch(`/games/${selectedGameId}/rate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ rating, comment })
        });

        if (response.ok) {
          alert('Спасибо за ваш отзыв!');
          closeRatingModal();
          console.log('Rating submitted, reloading data...');
          await loadData();
        } else {
          const error = await response.json();
          console.error('Rating submission error:', error);
          if (response.status === 401) {
            alert('Сессия истекла. Пожалуйста, войдите заново.');
            window.location.href = '/login';
            return;
          }
          throw new Error(error.error || 'Ошибка сохранения оценки');
        }
      } catch (err) {
        console.error('Ошибка при отправке оценки:', err);
        alert(err.message || 'Ошибка при отправке оценки');
      }
    }

    function editGame(gameId) {
      console.log('Editing game:', gameId);
      window.location.href = `edit-game.html?id=${gameId}`;
    }

    function applyTheme(theme) {
      document.body.classList.remove('rgb-theme');
      document.body.style.setProperty('--theme-color', getThemeColor(theme));
      document.body.style.setProperty('--theme-secondary-color', getThemeSecondaryColor(theme));
      document.body.style.setProperty('--theme-glow-color', getThemeGlowColor(theme));
      document.body.style.setProperty('--text-color', getTextColor(theme));
      document.body.style.setProperty('--bg-gradient', getBackgroundGradient(theme));
      document.body.style.setProperty('--glass-card-border-color', getThemeGlowColor(theme));
      document.body.style.setProperty('--glass-card-glow', getThemeGlowColor(theme));
      document.body.style.setProperty('--hover-shadow-color', getHoverShadowColor(theme));
      document.body.style.setProperty('--scrollbar-thumb-color', getScrollbarThumbColor(theme));
      if (theme === 'rgb') {
        document.body.classList.add('rgb-theme');
      }
      const root = document.documentElement;
      switch (theme) {
        case 'red':
          root.style.setProperty('--scrollbar-thumb-color', getScrollbarThumbColor('red'));
          break;
        case 'yellow':
          root.style.setProperty('--scrollbar-thumb-color', getScrollbarThumbColor('yellow'));
          break;
        case 'green':
          root.style.setProperty('--scrollbar-thumb-color', getScrollbarThumbColor('green'));
          break;
        case 'blue':
          root.style.setProperty('--scrollbar-thumb-color', getScrollbarThumbColor('blue'));
          break;
        case 'purple':
          root.style.setProperty('--scrollbar-thumb-color', getScrollbarThumbColor('purple'));
          break;
        case 'rgb':
          root.style.setProperty('--scrollbar-thumb-color', getScrollbarThumbColor('rgb'));
          break;
        default:
          root.style.setProperty('--scrollbar-thumb-color', getScrollbarThumbColor('red'));
      }
    }

    function getThemeColor(theme) {
      switch (theme) {
        case 'red': return '#ff0000';
        case 'blue': return 'rgba(33, 150, 243, 0.3)';
        case 'green': return 'rgba(76, 175, 80, 0.3)';
        case 'yellow': return 'rgba(255, 215, 0, 0.3)';
        case 'purple': return 'rgba(156, 39, 176, 0.3)';
        case 'rgb': return 'rgba(102, 204, 102, 0.3)';
        default: return 'rgba(255, 65, 108, 0.3)';
      }
    }

    function getThemeSecondaryColor(theme) {
      switch (theme) {
        case 'red': return '#ff4b2b';
        case 'yellow': return '#ffd700';
        case 'green': return '#45b649';
        case 'blue': return '#2196f3';
        case 'purple': return '#9c27b0';
        default: return '#ff4b2b';
      }
    }

    function getThemeGlowColor(theme) {
      switch (theme) {
        case 'red': return 'rgba(255, 65, 108, 0.8)';
        case 'yellow': return 'rgba(255, 215, 0, 0.8)';
        case 'green': return 'rgba(76, 175, 80, 0.8)';
        case 'blue': return 'rgba(33, 150, 243, 0.8)';
        case 'purple': return 'rgba(156, 39, 176, 0.8)';
        case 'rgb': return 'rgba(102, 204, 102, 0.8)';
        default: return 'rgba(255, 65, 108, 0.8)';
      }
    }

    function getTextColor(theme) {
      switch (theme) {
        case 'yellow': return '#ffffff';
        default: return '#ffffff';
      }
    }

    function getBackgroundGradient(theme) {
      switch (theme) {
        case 'red': return 'linear-gradient(135deg, #1a1a1a, #3a1c26)';
        case 'yellow': return 'linear-gradient(135deg, #1a1a1a, #3a3a1c)';
        case 'green': return 'linear-gradient(135deg, #1a1a1a, #1c3a2e)';
        case 'blue': return 'linear-gradient(135deg, #1a1a1a, #1c2a3a)';
        case 'purple': return 'linear-gradient(135deg, #1a1a1a, #2a1c3a)';
        case 'rgb': return 'linear-gradient(45deg, #ff6666, #66b3ff, #66cc66)';
        default: return 'linear-gradient(135deg, #1a1a1a, #3a1c26)';
      }
    }

    function getHoverShadowColor(theme) {
      switch (theme) {
        case 'red': return 'rgba(255, 0, 0, 0.4)';
        case 'yellow': return '#ffa500';
        case 'green': return 'rgba(76, 175, 80, 0.4)';
        case 'blue': return 'rgba(33, 150, 243, 0.4)';
        case 'purple': return 'rgba(156, 39, 176, 0.4)';
        default: return 'rgba(255, 0, 0, 0.4)';
      }
    }

    function getScrollbarThumbColor(theme) {
      switch (theme) {
        case 'red': return 'linear-gradient(135deg, #ff0000, #ff4b2b)';
        case 'yellow': return 'linear-gradient(135deg, #ffd700, #ffec80)';
        case 'green': return 'linear-gradient(135deg, #4caf50, #8bc34a)';
        case 'blue': return 'linear-gradient(135deg, #2196f3, #00bcd4)';
        case 'purple': return 'linear-gradient(135deg, #9c27b0, #ba68c8)';
        default: return 'linear-gradient(135deg, #ff0000, #ff4b2b)';
      }
    }

    document.addEventListener('DOMContentLoaded', () => {
      console.log('DOM loaded, initializing...');
      const savedTheme = localStorage.getItem('theme') || 'red';
      applyTheme(savedTheme);
      loadData();
      initAuthDropdown();
      initFilters();
      initPhysicsBackground();
      initModals();
    });

    // Восстановленная и улучшенная анимация шаров с динамическими цветами по теме
    function initPhysicsBackground() {
      const canvas = document.getElementById('physics-bg-canvas');
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      let width = window.innerWidth;
      let height = window.innerHeight;

      function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        canvas.width = width;
        canvas.height = height;
      }
      resize();
      window.addEventListener('resize', resize);

      const balls = [];
      const BALLS_COUNT = 18;
      const MIN_RADIUS = 32;
      const MAX_RADIUS = 64;

      for (let i = 0; i < BALLS_COUNT; i++) {
        balls.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 1.2,
          vy: (Math.random() - 0.5) * 1.2,
          r: MIN_RADIUS + Math.random() * (MAX_RADIUS - MIN_RADIUS),
          colorT: Math.random(),
          colorIdx: Math.floor(Math.random() * 3)
        });
      }

      function getCurrentTheme() {
        return document.body.getAttribute('data-theme') || localStorage.getItem('theme') || 'red';
      }

      function getThemeColors(theme) {
        switch (theme) {
          case 'yellow': return ['#ffd700', '#ffa500', '#fffbe6'];
          case 'green': return ['#4caf50', '#45a049', '#b2f2bb'];
          case 'blue': return ['#2196f3', '#1e88e5', '#b3e5fc'];
          case 'purple': return ['#9c27b0', '#7b1fa2', '#e1bee7'];
          case 'aqua': return ['#00eaff', '#00b8d9', '#b2f2ff'];
          default: return ['#ff416c', '#ff4b2b', '#ffb3c6'];
        }
      }

      let currentTheme = getCurrentTheme();
      const updateTheme = () => { currentTheme = getCurrentTheme(); };
      const origApplyTheme = window.applyTheme;
      window.applyTheme = function (theme) {
        if (origApplyTheme) origApplyTheme(theme);
        updateTheme();
      };
      const observer = new MutationObserver(updateTheme);
      observer.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });

      function checkCollisions() {
        for (let i = 0; i < balls.length; i++) {
          for (let j = i + 1; j < balls.length; j++) {
            const b1 = balls[i];
            const b2 = balls[j];
            const dx = b2.x - b1.x;
            const dy = b2.y - b1.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < b1.r + b2.r) {
              const nx = dx / dist;
              const ny = dy / dist;
              const dvx = b2.vx - b1.vx;
              const dvy = b2.vy - b1.vy;
              const dv = dvx * nx + dvy * ny;
              if (dv < 0) {
                const imp = dv * 0.1;
                b1.vx += imp * nx;
                b1.vy += imp * ny;
                b2.vx -= imp * nx;
                b2.vy -= imp * ny;
                const overlap = (b1.r + b2.r - dist) / 2;
                b1.x -= overlap * nx;
                b1.y -= overlap * ny;
                b2.x += overlap * nx;
                b2.y += overlap * ny;
              }
            }
          }
        }
      }

      function updateBalls() {
        for (const ball of balls) {
          ball.x += ball.vx;
          ball.y += ball.vy;
          if (ball.x - ball.r < 0) { ball.x = ball.r; ball.vx *= -0.97; }
          if (ball.x + ball.r > width) { ball.x = width - ball.r; ball.vx *= -0.97; }
          if (ball.y - ball.r < 0) { ball.y = ball.r; ball.vy *= -0.97; }
          if (ball.y + ball.r > height) { ball.y = height - ball.r; ball.vy *= -0.97; }
          ball.colorT += 0.003;
          if (ball.colorT >= 1) {
            ball.colorT = 0;
            ball.colorIdx = (ball.colorIdx + 1) % 3;
          }
        }
        checkCollisions();
      }

      function drawBalls() {
        ctx.clearRect(0, 0, width, height);
        const colors = getThemeColors(currentTheme);
        for (const ball of balls) {
          const color1 = colors[ball.colorIdx];
          const color2 = colors[(ball.colorIdx + 1) % colors.length];
          const t = ball.colorT;
          function hexToRgb(hex) {
            hex = hex.replace('#', '');
            return [
              parseInt(hex.substring(0, 2), 16),
              parseInt(hex.substring(2, 4), 16),
              parseInt(hex.substring(4, 6), 16)
            ];
          }
          const rgb1 = hexToRgb(color1);
          const rgb2 = hexToRgb(color2);
          const r = Math.round(rgb1[0] + (rgb2[0] - rgb1[0]) * t);
          const g = Math.round(rgb1[1] + (rgb2[1] - rgb1[1]) * t);
          const b = Math.round(rgb1[2] + (rgb2[2] - rgb1[2]) * t);

          const gradient = ctx.createRadialGradient(
            ball.x, ball.y, 0,
            ball.x, ball.y, ball.r
          );
          gradient.addColorStop(0, `rgba(${r},${g},${b},0.8)`);
          gradient.addColorStop(1, `rgba(${r},${g},${b},0.1)`);

          ctx.beginPath();
          ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
          ctx.fillStyle = gradient;
          ctx.shadowColor = `rgba(${r},${g},${b},0.7)`;
          ctx.shadowBlur = 20;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }

      function animate() {
        updateBalls();
        drawBalls();
        requestAnimationFrame(animate);
      }

      animate();
    }
function closeGameOfTheDayModal() {
  document.getElementById('gameOfTheDayModal').style.display = 'none';
}

function playGameOfTheDay(gameId) {
  const token = localStorage.getItem('token');
  fetch(`/games/${gameId}/view`, {
    method: 'POST',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {}
  }).catch(err => console.error('Error in view fetch:', err));
  const gameWindow = window.open(`/games/${gameId}/play`, '_blank');
  if (!gameWindow) {
    alert('Не удалось открыть игру. Проверьте настройки браузера.');
  }
  document.getElementById('ratingSection').style.display = 'block';
}

async function submitGameOfTheDayRating(gameId, rating) {
  if (!currentUser) {
    alert('Пожалуйста, войдите в систему.');
    return;
  }
  if (!rating || rating < 1 || rating > 5) {
    alert('Пожалуйста, выберите оценку от 1 до 5.');
    return;
  }
  const comment = document.getElementById('gameOfTheDayComment').value;
  const token = localStorage.getItem('token');
  try {
    const response = await fetch(`/games/${gameId}/rate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ rating, comment })
    });
    if (response.ok) {
      alert('Спасибо за ваш отзыв!');
      closeGameOfTheDayModal();
      await loadData();
    } else {
      const error = await response.json();
      if (response.status === 401) {
        alert('Сессия истекла. Пожалуйста, войдите заново.');
        localStorage.removeItem('token');
        window.location.href = '/login.html';
      } else {
        alert(error.error || 'Ошибка отправки отзыва.');
      }
    }
  } catch (err) {
    console.error('Error submitting rating:', err);
    alert('Ошибка отправки отзыва.');
  }
}
function initModals() {
  const modal = document.getElementById('gameOfTheDayModal');

  // Клик вне модалки
  document.addEventListener('click', (event) => {
    if (modal?.style.display === 'flex') {
      const content = modal.querySelector('.modal-content');
      if (content && !content.contains(event.target)) {
        closeGameOfTheDayModal();
      }
    }
  });

  // Закрытие по Esc
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modal?.style.display === 'flex') {
      closeGameOfTheDayModal();
    }
  });
}

    const styles = `
/* ============================= */
/*    Стили для Preloader’а      */
/* ============================= */
.preloader {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: var(--bg-gradient);
  z-index: 9999;
  font-family: 'Press Start 2P', monospace;
  opacity: 1; /* Изначально непрозрачный */
}
/* Анимация появления элементов */
@keyframes fadeIn {
  0% { opacity: 0; transform: translateY(20px); }
  100% { opacity: 1; transform: translateY(0); }
}

.genre-buttons, .search-panel, .filter-buttons, .games-grid, .genre-title, .filter-panel, .genre-panel {
  opacity: 0;
  animation: fadeIn 2s ease-out forwards;
}

/* Задержки для последовательного появления */
.genre-title{
 animation-delay: 0.5s;
}
 .genre-panel{
 animation-delay: 0.5s;
}
.genre-buttons {
  animation-delay: 0.5s;
}

.search-panel {
  animation-delay: 1s;
}

.filter-panel {
  animation-delay: 1.5s;
}

.filter-buttons {
  animation-delay: 2s;
}

.games-grid {
  animation-delay: 2s;
}
.preloader p {
  color: var(--theme-secondary-color);
  font-size: 1.5rem;
  text-transform: uppercase;
  text-shadow:
    0 0 8px var(--theme-glow-color),
    0 0 16px var(--theme-color);
  animation: flicker 2s infinite alternate;
  margin: 0;
  margin-top: 1rem;
}

.progress-bar {
  width: 200px;
  height: 8px;
  background: rgba(0, 0, 0, 0.5);
  border-radius: 4px;
  overflow: hidden;
  margin-top: 1rem;
}

.progress-bar::before {
  content: '';
  display: block;
  width: 50%;
  height: 100%;
  background: var(--theme-glow-color);
  animation: progress 5s linear infinite;
}

/* ============================= */
/*   Стили для SVG-джойстика     */
/* ============================= */
.joystick-container {
  margin-bottom: 0.5rem;
}

.joystick-svg {
  display: block;
  width: 80px;
  height: 80px;
}

/* 1) Основание джойстика */
.joystick-base {
  /* Цвет основы возьмём из --theme-secondary-color или можно задать свою переменную */
  fill: var(--theme-secondary-color);
  animation: base-vibrate 2s ease-in-out infinite alternate;
}

/* 2) Шток джойстика */
.joystick-stick {
  /* Цвет штока — используем основной цвет темы */
  fill: grey;
  transform-origin: 32px 40px;
  animation: stick-tilt 3s ease-in-out infinite;
}

/* 3) Ручка (knob) */
.joystick-knob {
  /* Заливка ручки — основной цвет темы (или вторичный, если хотите) */
  fill: var(--theme-color);
  /* Обводка ручки — вторичный цвет темы */
  stroke: var(--theme-secondary-color);
  stroke-width: 2px;
  transform-origin: 32px 16px;
  animation:
    knob-scale 2s ease-in-out infinite alternate,
    knob-glow 2s ease-in-out infinite alternate;
}

/* ============================= */
/*  Keyframes анимаций:         */
/* ============================= */

/* Мягкая вибрация основания */
@keyframes base-vibrate {
  0% { transform: translateY(0px); }
  25% { transform: translateY(-1px); }
  50% { transform: translateY(0px); }
  75% { transform: translateY(1px); }
  100% { transform: translateY(0px); }
}

/* Шток наклоняется сначала влево, потом вправо */
@keyframes stick-tilt {
  0% { transform: rotate(0deg); }
  25% { transform: rotate(-10deg); }
  50% { transform: rotate(0deg); }
  75% { transform: rotate(10deg); }
  100% { transform: rotate(0deg); }
}

/* Ручка пульсирует в размере */
@keyframes knob-scale {
  0% { transform: scale(1); }
  100% { transform: scale(1.2); }
}

/* Ручка «светится» за счёт drop-shadow */
@keyframes knob-glow {
  0% {
    filter: drop-shadow(0 0 0px rgba(255, 255, 255, 0));
  }
  100% {
    filter: drop-shadow(0 0 8px rgba(255, 255, 255, 0.7));
  }
}

/* Мерцание текста */
@keyframes flicker {
  0% { opacity: 1; }
  100% { opacity: 0.6; }
}

/* Движение полосы */
@keyframes progress {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(200%); }
}


@keyframes container-pulse {
  0% { transform: scale(1); }
  100% { transform: scale(1.05); }
}
/* ================================================= */
/*  Лоадер при загрузке отдельной игры (шестерёнка) */
/* ================================================= */
/* Обновленные стили для реалистичной шестерёнки */
.game-loader {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  visibility: hidden;
  opacity: 0;
  transition: opacity 0.5s ease;
}

.game-loader.visible {
  visibility: visible;
  opacity: 1;
}

.gear-loader-container {
  width: 120px;
  height: 120px;
}

.gear-loader-svg {
  width: 100%;
  height: 100%;
  transform-origin: center center;
  animation: gear-rotate 1.5s linear infinite;
}

.gear-outer-ring {
  fill: var(--theme-color);
  stroke: var(--theme-secondary-color);
  stroke-width: 1.5px;
}

.gear-teeth path {
  fill: var(--theme-secondary-color);
  stroke: var(--theme-glow-color);
  stroke-width: 0.5px;
  filter: drop-shadow(0 0 2px var(--theme-glow-color));
}

.gear-inner-hub {
  fill: var(--theme-color);
  stroke: var(--theme-secondary-color);
  stroke-width: 1.5px;
}

.gear-hole {
  fill: #222;
  stroke: #444;
  stroke-width: 0.5px;
}

@keyframes gear-rotate {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Плавное появление/исчезновение */
.game-loader.visible {
  opacity: 1;
  visibility: visible;
}


      .no-games {
        text-align: center;
        color: var(--text-color, #ffffff);
        font-size: 1.2rem;
        margin: 2rem 0;
      }

      .favorite-action {
        position: absolute;
        top: 10px;
        left: 50px;
        background: rgba(0, 0, 0, 0.7);
        border: none;
        border-radius: 50%;
        width: 30px;
        height: 30px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--theme-color);
      }

      .favorite-action:hover {
        background: var(--theme-color);
        color: var(--text-color, #ffffff);
      }

      .user-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        object-fit: cover;
        border: 2px solid var(--theme-color);
        box-shadow: 0 0 10px var(--theme-color);
        transition: transform 0.3s ease;
      }

      .user-avatar:hover {
        transform: scale(1.1);
      }

      .user-info {
        display: flex;
        align-items: center;
        gap: 1rem;
        flex-wrap: wrap;
        padding: 0.5rem 1rem;
        background: rgba(255,255,255,0.05);
        border-radius: 30px;
      }

      .game-background {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: -1;
        pointer-events: none;
        background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="20" cy="20" r="2" fill="rgba(255,255,255,0.2)"/><circle cx="60" cy="60" r="3" fill="rgba(255,255,255,0.3)"/><path d="M80,80 L85,75 L90,80" stroke="rgba(255,65,108,0.2)" stroke-width="1" fill="none"/></svg>') repeat,
                    radial-gradient(circle, rgba(255,65,108,0.1) 0%, rgba(0,0,0,0.8) 70%);
        animation: backgroundShift 30s linear infinite;
      }

      @keyframes backgroundShift {
        0% { background-position: 0 0; }
        100% { background-position: 100px 100px; }
      }

      .search-panel {
        margin: 1rem 0;
        padding: 1rem;
        display: flex;
        justify-content: center;
      }

      .search-input {
        background: rgba(0, 0, 0, 0.5);
        color: var(--text-color, #ffffff);
        border: 1px solid var(--theme-color);
        padding: 0.5rem 1rem;
        border-radius: 5px;
        font-family: 'Orbitron', sans-serif;
        width: 300px;
        max-width: 100%;
        transition: border-color 0.3s, box-shadow 0.3s;
      }

      .search-input:focus {
        outline: none;
        border-color: var(--theme-glow-color);
        box-shadow: 0 0 5px var(--theme-glow-color);
      }

      .search-input::placeholder {
        color: rgba(255, 255, 255, 0.5);
      }

      .random-game-day {
        max-width: 420px;
        margin: 2rem auto 2rem auto;
        padding: 1.5rem 1.5rem 1.2rem 1.5rem;
        box-shadow: 0 6px 32px 0 rgba(33,150,243,0.13), 0 0 0 1px #2196f322;
        border-radius: 18px;
        background: rgba(0,0,0,0.92);
        display: flex;
        flex-direction: column;
        align-items: center;
        transition: box-shadow 0.3s, transform 0.3s;
      }
      .random-game-day .game-card {
        box-shadow: 0 2px 16px rgba(255,65,108,0.10);
        border-radius: 14px;
        background: rgba(30,30,40,0.97);
        padding: 0.5rem 1rem 1rem 1rem;
        margin: 0 auto;
        transition: box-shadow 0.3s, transform 0.3s;
        max-width: 350px;
        min-width: 220px;
        display: flex;
        flex-direction: column;
        align-items: center;
        cursor: pointer;
      }
      .random-game-day .game-card:hover {
        box-shadow: 0 8px 32px rgba(255,65,108,0.18), 0 0 0 2px var(--theme-color);
        transform: translateY(-3px) scale(1.03);
      }
      .random-game-day .game-cover-wrapper {
        width: 100%;
        height: 160px;
        border-radius: 10px;
        overflow: hidden;
        background: #181828;
        margin-bottom: 0.7rem;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
      }
      .random-game-day .game-cover {
        width: 100%;
        height: 100%;
        object-fit: contain;
        background: #181828;
        border-radius: 10px;
        display: block;
      }
      .random-game-day .game-cover-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #fff;
        font-size: 2.2rem;
        background: #222;
        border-radius: 10px;
      }
      .random-game-day .game-rating {
        position: absolute;
        top: 10px;
        right: 10px;
        background: rgba(0,0,0,0.8);
        padding: 6px 12px;
        border-radius: 16px;
        color: #ffd700;
        font-size: 1.1rem;
        font-weight: bold;
        display: flex;
        align-items: center;
        gap: 4px;
        z-index: 2;
        box-shadow: 0 1px 6px rgba(33,150,243,0.08);
      }
      .random-game-day .game-title {
        font-size: 1.15rem;
        font-weight: 700;
        color: #fff;
        margin: 0.2em 0 0.1em 0;
        text-align: center;
        text-shadow: 0 2px 8px #0008;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        width: 100%;
      }
      .random-game-day .game-genre {
        color: var(--text-secondary, #bbb);
        font-size: 0.98em;
        margin-bottom: 0.5em;
        text-align: center;
      }
      .random-game-day .btn.neon-btn {
        margin-top: 0.7em;
        width: 100%;
        font-size: 1.05em;
        padding: 0.7em 0;
        border-radius: 8px;
        box-shadow: 0 2px 8px rgba(255,65,108,0.10);
      }
      @media (max-width: 600px) {
        .random-game-day {
          max-width: 98vw;
          padding: 1rem 0.2rem;
        }
        .random-game-day .game-card {
          max-width: 98vw;
          min-width: 0;
          padding: 0.5rem 0.2rem 1rem 0.2rem;
        }
        .random-game-day .game-cover-wrapper {
          height: 120px;
        }
      }

      .random-badge-animated {
        position: absolute;
        top: 18px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 3;
        background: linear-gradient(90deg, #ffd700 0%, #ff416c 100%);
        color: #fff;
        padding: 8px 28px;
        border-radius: 30px;
        font-size: 1.15em;
        font-weight: 900;
        letter-spacing: 1px;
        text-shadow: 0 2px 12px #ff416c99, 0 0 8px #ffd700cc;
        border: 3px solid #fffbe6;
        box-shadow: 0 0 24px 6px #ffd70099, 0 2px 8px #ff416c55;
        animation: badgePulse 1.3s infinite alternate;
        pointer-events: auto;
        cursor: help;
      }
      @keyframes badgePulse {
        0% { box-shadow: 0 0 24px 6px #ffd70099, 0 2px 8px #ff416c55; }
        100% { box-shadow: 0 0 40px 12px #ffd700cc, 0 2px 16px #ff416c99; }
      }

      .random-game-highlight {
        box-shadow: 0 0 0 3px var(--theme-color), 0 0 30px var(--theme-color), 0 8px 32px rgba(255,65,108,0.18);
        transition: box-shadow 0.3s, transform 0.3s;
        animation: randomGlow 2s infinite alternate;
      }
      @keyframes randomGlow {
        0% { box-shadow: 0 0 0 3px var(--theme-color), 0 0 30px var(--theme-color), 0 8px 32px rgba(255,65,108,0.18);}
        100% { box-shadow: 0 0 0 6px var(--theme-color), 0 0 60px var(--theme-color), 0 8px 32px rgba(255,65,108,0.25);}
      }

      .random-game-highlight.highlighted {
        box-shadow: 0 0 0 6px #ffd700, 0 0 60px #ffd700, 0 8px 32px rgba(255,215,0,0.25);
        animation: none;
        border: 2px solid #ffd700;
      }

      .highlight-btn {
        background: #fffbe6;
        color: #ffb300;
        border: 2px solid #ffd700;
        border-radius: 50%;
        width: 38px;
        height: 38px;
        font-size: 1.3em;
        font-weight: bold;
        box-shadow: 0 2px 8px #ffd70055;
        cursor: pointer;
        transition: background 0.2s, color 0.2s, border 0.2s;
        outline: none;
      }
      .highlight-btn:hover, .random-game-highlight.highlighted .highlight-btn {
        background: #ffd700;
        color: #fff;
        border: 2px solid #fffbe6;
      }

      #physics-bg-canvas {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: -1;
        pointer-events: none;
        opacity: 0.7;
        transition: opacity 0.5s;
      }

      .main-container {
        margin-top: 70px;
      }

      .games-grid {
        margin: 0;
      }

      .game-description {
        margin: 10px 0;
      }

      .modal-content {
        margin: 15% auto;
      }

      .filter-section {
        margin: 1rem 0;
      }

      .genre-buttons, 
      .filter-buttons {
        display: flex;
        gap: 1rem;
        padding: 4px;
      }
      header {
        background: rgba(0, 0, 0, 0.7);
        border-bottom: 3px solid var(--theme-color);
        box-shadow: 0 0 15px var(--theme-color);
        transition: border-color 0.3s, box-shadow 0.3s;
        width: 100%;
        z-index: 1000;
        position: static;
      }

      .main-container {
        padding-top: 1rem;
        min-height: calc(100vh - 70px);
      }
        .rating-stars {
  display: flex;
  gap: 5px;
  cursor: pointer;
  font-size: 1.5rem;
}
.rating-stars span {
  color: #ccc;
}
.rating-stars span:hover,
.rating-stars span:hover ~ span {
  color: #ccc;
}
.rating-stars span.selected,
.rating-stars span.selected ~ span {
  color: #ffd700;
}
#gameOfTheDayModal {
  display: none;
  position: fixed;
  z-index: 9999;
  left: 0; top: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.85);
  justify-content: center;
  align-items: center;
  overflow: auto;
  padding: 2rem 1rem;
}

#gameOfTheDayModal .modal-content {
  position: relative;
  padding: 1.5rem;
  max-width: 450px;
  width: 100%;
  background: rgba(30, 30, 40, 0.95);
  border-radius: 16px;
  border: 2px solid var(--theme-color);
  box-shadow: 0 0 20px var(--theme-color);
  overflow-y: auto;
  max-height: 90vh;
}

#gameOfTheDayModal .close-button {
  position: absolute;
  top: -1.5rem;
  left: -0.5rem;
  font-size: 1.8rem;
  color: var(--theme-color);
  background: none;
  border: none;
  cursor: pointer;
  z-index: 10;
  text-shadow: 0 0 8px var(--theme-color);
  transition: transform 0.2s, color 0.3s;
}

#gameOfTheDayModal .close-button:hover {
  transform: scale(1.2);
  color: #fff;
}

#gameOfTheDayCover {
  max-height: 200px;
  object-fit: contain;
  width: 100%;
  border-radius: 8px;
}

    `;

    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);

    const errorStyles = `
      .error-message {
        width: 100%;
        max-width: 600px;
        margin: 2rem auto;
        text-align: center;
      }
      
      .error-card {
        background: rgba(255, 0, 0, 0.1);
        border: 1px solid rgba(255, 0, 0, 0.3);
        padding: 2rem;
      }
      
      .error-card h3 {
        color: var(--theme-color);
        margin-bottom: 1rem;
      }
      
      .error-card p {
        margin-bottom: 1.5rem;
      }

      .text-danger {
        color: var(--theme-color);
        font-size: 1.2rem;
        font-weight: bold;
      }

      .text-center {
        text-align: center;
      }
    `;

    document.head.insertAdjacentHTML('beforeend', `<style>${errorStyles}</style>`);
    // Файл: scripts/index.js
async function syncFavoritesWithServer() {
    if (!currentUser || !localStorage.getItem('token')) {
        console.log('syncFavoritesWithServer: No user or token, skipping');
        return;
    }

    try {
        const token = localStorage.getItem('token');
        const savedFavorites = JSON.parse(localStorage.getItem('favorites') || '[]');
        console.log('syncFavoritesWithServer: Saved favorites from localStorage:', savedFavorites);

        for (const game of savedFavorites) {
            if (!game.id) {
                console.warn(`syncFavoritesWithServer: Skipping game with no ID: ${JSON.stringify(game)}`);
                continue;
            }
            console.log(`syncFavoritesWithServer: Adding game ${game.id} to server favorites`);
            const response = await fetch(`/favorites/add/${game.id}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (!response.ok) {
                const error = await response.json();
                console.error(`Failed to add game ${game.id} to favorites:`, error);
                if (response.status === 401) {
                    alert('Сессия истекла. Пожалуйста, войдите заново.');
                    localStorage.removeItem('token');
                    window.location.href = '/login.html';
                    return;
                }
                if (response.status === 400 && error.error?.message === 'Игра уже в избранном') {
                    console.log(`Game ${game.id} already in favorites, skipping`);
                    continue;
                }
                if (response.status === 404) {
                    console.warn(`Game ${game.id} not found on server, skipping`);
                    continue;
                }
                console.warn(`Failed to sync game ${game.id}: ${error.message}`);
            }
        }

        // Обновляем список избранного с сервера
        const favoritesRes = await fetch('/favorites', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!favoritesRes.ok) {
            throw new Error('Не удалось загрузить обновлённый список избранного');
        }
        const serverFavorites = await favoritesRes.json();
        localStorage.setItem('favorites', JSON.stringify(serverFavorites));
        console.log('syncFavoritesWithServer: Synced favorites:', serverFavorites);
    } catch (err) {
        console.error('syncFavoritesWithServer: Error:', err);
        alert('Ошибка синхронизации избранного. Попробуйте позже.');
    }
}