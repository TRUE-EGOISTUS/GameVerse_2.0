console.log('favorites.js loaded');
let isLoading = false;

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

function getScrollbarThumbColor(theme) {
    switch (theme) {
        case 'red': return 'linear-gradient(135deg, #ff416c, #ff4b2b)';
        case 'yellow': return 'linear-gradient(135deg, #ffd700, #ffec80)';
        case 'green': return 'linear-gradient(135deg, #4caf50, #8bc34a)';
        case 'blue': return 'linear-gradient(135deg, #2196f3, #00bcd4)';
        case 'purple': return 'linear-gradient(135deg, #9c27b0, #ba68c8)';
        default: return 'linear-gradient(135deg, #ff416c, #ff4b2b)';
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

function getThemeColor(theme) {
    switch (theme) {
        case 'red': return '#ff0000';
        case 'blue': return 'rgba(33, 150, 243, 0.3)';
        case 'green': return 'rgba(76, 175, 80, 0.3)';
        case 'yellow': return 'rgba(255, 215, 0, 0.3)';
        case 'purple': return 'rgba(156, 39, 176, 0.3)';
        case 'rgb': return 'rgba(102, 204, 102, 0.3)';
        default: return '#ff416c';
    }
}

function getThemeSecondaryColor(theme) {
    switch (theme) {
        case 'red': return '#ff4b2b';
        case 'yellow': return '#ffec80';
        case 'green': return '#8bc34a';
        case 'blue': return '#00bcd4';
        case 'purple': return '#ba68c8';
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
        case 'rgb': return 'rgba(255, 65, 108, 0.8)';
        default: return 'rgba(255, 65, 108, 0.8)';
    }
}

function getTextColor(theme) {
    return '#ffffff';
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

// Добавленные функции showLoading и hideLoading
function showLoading() {
    console.log('Showing preloader');
    const preloader = document.getElementById('preloader');
    if (preloader) {
        preloader.style.display = 'flex';
        isLoading = true;
        console.log('showLoading: Preloader displayed');
    } else {
        console.warn('showLoading: Preloader element not found');
    }
}

function hideLoading() {
    console.log('Hiding preloader');
    const preloader = document.getElementById('preloader');
    if (preloader) {
        preloader.style.display = 'none';
        isLoading = false;
        console.log('hideLoading: Preloader hidden');
    } else {
        console.warn('hideLoading: Preloader element not found');
    }
}

async function loadFavorites() {
    console.log('Starting loadFavorites');
    if (isLoading) {
        console.log('loadFavorites skipped: already loading');
        return;
    }
    showLoading();
    const banMessageDiv = document.getElementById('banMessage');
    console.log('banMessageDiv:', banMessageDiv);
    if (banMessageDiv) banMessageDiv.style.display = 'none';

    try {
        console.log('Fetching favorites...');
        const token = localStorage.getItem('token');
        console.log('Token:', token);
        let favorites = [];

        if (token) {
            const headers = { 'Authorization': `Bearer ${token}` };
            const userRes = await fetch('/user-data', { headers });
            console.log('userRes status:', userRes.status);
            if (!userRes.ok) {
                console.error('Failed to fetch user data:', userRes.status);
                throw new Error('Ошибка загрузки данных пользователя');
            }
            currentUser = await userRes.json();
            console.log('User loaded:', currentUser);

            await syncFavoritesWithServer();
            const favoritesRes = await fetch('/favorites', { headers });
            console.log('favoritesRes status:', favoritesRes.status);
            if (!favoritesRes.ok) {
                console.error('Failed to fetch favorites:', favoritesRes.status);
                throw new Error('Ошибка загрузки списка избранного');
            }
            favorites = await favoritesRes.json();
            console.log('Favorites from server:', favorites);
            localStorage.setItem('favorites', JSON.stringify(favorites));
        } else {
            const savedFavorites = localStorage.getItem('favorites');
            favorites = savedFavorites ? JSON.parse(savedFavorites) : [];
            console.log('Favorites from localStorage:', favorites);
        }

        currentGames = favorites.map(game => ({
            ...game,
            isFavorite: true
        }));
        console.log('currentGames before render:', currentGames);

        updateAuthPanel(currentUser);
        await waitForTemplate();
        console.log('Games to render:', currentGames);
        renderGames(currentGames);

        if (currentGames.length === 0) {
            console.log('No games to render, showing empty message');
            const gamesContainer = document.getElementById('favoritesGrid');
            gamesContainer.innerHTML = '<p style="text-align: center;">У вас нет избранных игр.</p>';
        }
    } catch (err) {
        console.error('loadFavorites error:', err);
        alert('Ошибка загрузки избранного: ' + err.message);
    } finally {
        hideLoading();
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

function renderGames(games) {
    console.log('renderGames: games =', games);
    const gamesContainer = document.getElementById('favoritesGrid');
    const template = document.getElementById('game-card-template');

    if (!gamesContainer) {
        console.error('renderGames: favoritesGrid not found');
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
        console.log('Rendering game:', game.id, game.title);
        const clone = template.content.cloneNode(true);

        const cover = clone.querySelector('.game-cover');
        const placeholder = clone.querySelector('.game-cover-placeholder');
        if (game.cover && typeof game.cover === 'string' && game.cover.startsWith('data:')) {
            cover.src = game.cover;
            cover.style.display = 'block';
            placeholder.style.display = 'none';
        } else {
            cover.src = '';
            cover.style.display = 'none';
            placeholder.style.display = 'flex';
        }

        const titleEl = clone.querySelector('.game-title');
        if (titleEl) {
            titleEl.textContent = game.title || game.name || 'Без названия';
        } else {
            console.error('renderGames: .game-title not found in template');
        }

        const ratingEl = clone.querySelector('.rating-value');
        if (ratingEl) {
            const rating = getAverageRatingValue(game.ratings);
            ratingEl.textContent = rating.toFixed(1);
        } else {
            console.error('renderGames: .rating-value not found in template');
        }

        const infoButton = clone.querySelector('.action-button.info-action');
        if (infoButton) {
            infoButton.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('Opening game description:', game.id);
                window.open(`descr_game.html?id=${game.id}`, '_blank');
            });
        }

        const favoriteButton = clone.querySelector('.action-button.favorite-action');
        if (favoriteButton) {
            favoriteButton.classList.toggle('active', game.isFavorite);
            favoriteButton.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('Toggling favorite for game:', game.id);
                toggleFavorite(game.id, true);
            });
        }

        const card = clone.querySelector('.game-card');
        if (card) {
            card.style.cursor = 'pointer';
            card.addEventListener('click', async () => {
                console.log('Opening game:', game.id);
                const token = localStorage.getItem('token');
                const url = `/games/${game.id}/play`;
                console.log('Opening game URL:', url);

                try {
                    const viewResponse = await fetch(`/games/${game.id}/view`, {
                        method: 'POST',
                        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
                    });
                    console.log('View response status:', viewResponse.status);
                } catch (err) {
                    console.error('Error in view fetch:', err);
                }

                window.open(url, '_blank');
            });
        }

        gamesContainer.appendChild(clone);
    });
}

async function toggleFavorite(gameId, isFavoritesPage = true) {
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

        const favoritesRes = await fetch('/favorites', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!favoritesRes.ok) {
            throw new Error('Не удалось загрузить обновлённый список избранного');
        }
        const favorites = await favoritesRes.json();
        console.log('Favorites updated:', favorites);

        localStorage.setItem('favorites', JSON.stringify(favorites));

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
                console.warn(`[${new Date().toISOString()}] syncFavoritesWithServer: Skipping game with no ID: ${JSON.stringify(game)}`);
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
                let error;
                try {
                    error = await response.json();
                } catch (e) {
                    error = { message: 'Unknown error' };
                }
                console.error(`Failed to sync game ${game.id}:`, error);
                if (response.status === 401) {
                    alert('Сессия истекла. Пожалуйста, войдите заново.');
                    localStorage.removeItem('token');
                    window.location.href = '/';
                    return;
                } else if (response.status === 400 && error.message?.includes('already in favorites')) {
                    console.log(`Game ${game.id} already in favorites, skipping`);
                    continue;
                } else if (response.status === 404) {
                    console.warn(`Game ${game.id} not found on server, skipping`);
                    continue;
                }
                console.warn(`Failed to sync game ${game.id}: ${error.message}`);
            }
        }

        const favoritesRes = await fetch('/favorites', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!favoritesRes.ok) {
            throw new Error('Не удалось получить обновлённый список избранных');
        }
        const serverFavorites = await favoritesRes.json();
        localStorage.setItem('favorites', JSON.stringify(serverFavorites));
        console.log('syncFavoritesWithServer: Synced favorites:', serverFavorites);
    } catch (err) {
        console.error('syncFavoritesWithServer: Error:', err);
        alert('Ошибка синхронизации избранного. Попробуйте позже.');
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
        if (currentGames.length > 0) {
            localStorage.setItem('favorites', JSON.stringify(currentGames));
            console.log('Saved favorites to localStorage:', JSON.stringify(currentGames));
        }
        localStorage.removeItem('token');
        currentUser = null;
        updateAuthPanel(null);
        console.log('State cleared, redirecting to index...');
        window.location.href = 'index.html';
    }
}

function getAverageRatingValue(ratings) {
    if (!ratings || ratings.length === 0) return 0;
    return ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
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
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme') || 'red';
    applyTheme(savedTheme);
    loadFavorites();
});