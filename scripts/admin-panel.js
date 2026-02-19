   // Theme handling
const themes = ['red', 'yellow', 'green', 'blue', 'purple', 'rgb'];
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
  if (theme === 'rgb') document.body.classList.add('rgb-theme');
  document.documentElement.style.setProperty('--scrollbar-thumb-color', getScrollbarThumbColor(theme));
}

function getThemeColor(theme) {
  const colors = { red: '#ff0000', yellow: 'rgba(255, 215, 0, 0.3)', green: 'rgba(76, 175, 80, 0.3)', blue: 'rgba(33, 150, 243, 0.3)', purple: 'rgba(156, 39, 176, 0.3)', rgb: 'rgba(102, 204, 102, 0.3)' };
  return colors[theme] || '#ff416c';
}

function getThemeSecondaryColor(theme) {
  const colors = { red: '#ff4b2b', yellow: '#ffec80', green: '#8bc34a', blue: '#00bcd4', purple: '#ba68c8', rgb: '#ff4b2b' };
  return colors[theme] || '#ff4b2b';
}

function getThemeGlowColor(theme) {
  const colors = { red: 'rgba(255, 65, 108, 0.8)', yellow: 'rgba(255, 215, 0, 0.8)', green: 'rgba(76, 175, 80, 0.8)', blue: 'rgba(33, 150, 243, 0.8)', purple: 'rgba(156, 39, 176, 0.8)', rgb: 'rgba(255, 65, 108, 0.8)' };
  return colors[theme] || 'rgba(255, 65, 108, 0.8)';
}

function getTextColor(theme) {
  return '#ffffff';
}

function getBackgroundGradient(theme) {
  const gradients = {
    red: 'linear-gradient(135deg, #1a1a1a, #3a1c26)',
    yellow: 'linear-gradient(135deg, #1a1a1a, #3a3a1c)',
    green: 'linear-gradient(135deg, #1a1a1a, #1c3a2e)',
    blue: 'linear-gradient(135deg, #1a1a1a, #1c2a3a)',
    purple: 'linear-gradient(135deg, #1a1a1a, #2a1c3a)',
    rgb: 'linear-gradient(45deg, #ff6666, #66b3ff, #66cc66)'
  };
  return gradients[theme] || 'linear-gradient(135deg, #1a1a1a, #3a1c26)';
}

function getHoverShadowColor(theme) {
  const colors = { red: 'rgba(255, 65, 108, 0.4)', yellow: 'rgba(255, 215, 0, 0.4)', green: 'rgba(76, 175, 80, 0.4)', blue: 'rgba(33, 150, 243, 0.4)', purple: 'rgba(156, 39, 176, 0.4)', rgb: 'rgba(255, 65, 108, 0.4)' };
  return colors[theme] || 'rgba(255, 65, 108, 0.4)';
}

function getScrollbarThumbColor(theme) {
  const colors = { red: '#ff416c', yellow: '#ffd700', green: '#4caf50', blue: '#2196f3', purple: '#9c27b0', rgb: 'linear-gradient(45deg, #ff6666, #66b3ff, #66cc66)' };
  return colors[theme] || '#ff416c';
}

// State
let usersData = [];
let gamesData = [];
let modUser = null;
let modGame = null;
let currentPage = 1;
const itemsPerPage = 10;
let currentAdmin = null;

// DOM Elements
const loader = document.getElementById('loader');
const errorMsg = document.getElementById('errorMsg');
const successMsg = document.getElementById('successMsg');
const searchInput = document.getElementById('searchInput');
const roleFilter = document.getElementById('roleFilter');
const statusFilter = document.getElementById('statusFilter');
const banFilter = document.getElementById('banFilter');
const refreshBtn = document.getElementById('refreshBtn');
const userList = document.getElementById('userList');
const gameList = document.getElementById('gameList');
const gameSearchInput = document.getElementById('gameSearchInput');
const authorFilter = document.getElementById('authorFilter');
const refreshGamesBtn = document.getElementById('refreshGamesBtn');
const prevPage = document.getElementById('prevPage');
const nextPage = document.getElementById('nextPage');
const pageInfo = document.getElementById('pageInfo');
const moderationModal = document.getElementById('moderationModal');
const gameModerationModal = document.getElementById('gameModerationModal');
const modUserName = document.getElementById('modUserName');
const modGameName = document.getElementById('modGameName');
const actionSelect = document.getElementById('actionSelect');
const gameActionSelect = document.getElementById('gameActionSelect');
const roleGroup = document.getElementById('roleGroup');
const banDurationGroup = document.getElementById('banDurationGroup');
const banReasonGroup = document.getElementById('banReasonGroup');
const suspendDurationGroup = document.getElementById('suspendDurationGroup');
const freezeReasonGroup = document.getElementById('freezeReasonGroup');
const banDuration = document.getElementById('banDuration');
const banReason = document.getElementById('banReason');
const suspendDuration = document.getElementById('suspendDuration');
const freezeReason = document.getElementById('freezeReason');
const newRoleSelect = document.getElementById('newRoleSelect');
const confirmBtn = document.getElementById('confirmModeration');
const cancelBtn = document.getElementById('cancelModeration');
const confirmGameBtn = document.getElementById('confirmGameModeration');
const cancelGameBtn = document.getElementById('cancelGameModeration');
const themeToggle = document.getElementById('themeToggle');

// Utilities
function setLoading(active) {
  document.body.classList.toggle('loading', active);
  loader.style.display = active ? 'block' : 'none';
}

function showError(message) {
  errorMsg.textContent = message;
  errorMsg.style.display = 'block';
  successMsg.style.display = 'none';
  setTimeout(() => errorMsg.style.display = 'none', 5000);
}

function showSuccess(message) {
  successMsg.textContent = message;
  successMsg.style.display = 'block';
  errorMsg.style.display = 'none';
  setTimeout(() => successMsg.style.display = 'none', 5000);
}

// Debounce for search
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

function applyUserFilters() {
  const q = searchInput.value.toLowerCase();
  const r = roleFilter.value;
  const s = statusFilter.value;
  const b = banFilter.value;
  const filtered = usersData.filter(u => (
    u.username !== currentAdmin &&
    (!r || u.role === r) &&
    (!s || (s === 'online' ? u.online : !u.online)) &&
    (!b || (
      b === 'banned' 
        ? (u.banned === true || (u.bannedUntil && new Date(u.bannedUntil) > new Date()))
        : !(u.banned === true || (u.bannedUntil && new Date(u.bannedUntil) > new Date()))
    )) &&
    u.username.toLowerCase().includes(q)
  ));
  renderUsers(filtered);
  renderBanReasons(filtered);
}

function renderUsers(list) {
  const start = (currentPage - 1) * itemsPerPage;
  const end = start + itemsPerPage;
  const paginatedList = list.slice(start, end);
  userList.innerHTML = paginatedList.map(u => `
    <div class="user-card" tabindex="0">
      <div class="user-info-header">
        <span class="user-name">👤 <strong>${u.username}</strong></span>
        <span class="user-status ${u.online ? 'status-online' : 'status-offline'}">${u.online ? '🟢' : '🔴'}</span>
      </div>
      <div class="user-role-badge role-${u.role}">${u.role === 'admin' ? '👑 Админ' : u.role === 'developer' ? '💻 Разработчик' : '🎮 Игрок'}</div>
      <div class="user-status-info">
        ${u.bannedUntil && new Date(u.bannedUntil) > new Date() ? `<span class="status-banned">🚫 Забанен: ${u.banReason ? u.banReason : 'Причина отсутствует'} (до ${new Date(u.bannedUntil).toLocaleDateString()})</span>` : ''}
        ${u.suspendedUntil && new Date(u.suspendedUntil) > new Date() ? `<span class="status-suspended">⏸ Приостановлен до ${new Date(u.suspendedUntil).toLocaleDateString()}</span>` : ''}
      </div>
      <div class="admin-buttons">
        <button class="rate-btn" onclick="openModeration('${u.username}')">Модерировать</button>
      </div>
    </div>
  `).join('');
  updatePagination(list.length);
}

function renderBanReasons(users) {
  const banReasonsList = document.getElementById('banReasonsList');
  const banReasonsPanel = document.getElementById('banReasonsPanel');
  if (!banReasonsPanel || !banReasonsList) {
    console.error('Error: banReasonsPanel or banReasonsList not found in DOM');
    return;
  }
  const bannedUsers = users.filter(u => u.bannedUntil && new Date(u.bannedUntil) > new Date());
  if (bannedUsers.length > 0 && banFilter.value === 'banned') {
    banReasonsList.innerHTML = bannedUsers.map(u => `
      <li><strong>${u.username}</strong>: ${u.banReason ? u.banReason : 'Причина отсутствует'} (до ${new Date(u.bannedUntil).toLocaleDateString()})</li>
    `).join('');
    banReasonsPanel.style.display = 'block';
  } else {
    banReasonsPanel.style.display = 'none';
  }
}

function updatePagination(totalItems) {
  const totalPages = Math.ceil(totalItems / itemsPerPage);
  pageInfo.textContent = `Страница ${currentPage} из ${totalPages}`;
  prevPage.disabled = currentPage === 1;
  nextPage.disabled = currentPage === totalPages || totalPages === 0;
}

let lastFetchedUsers = null; // Кэш для данных пользователей
async function fetchUsers() {
  setLoading(true);
  errorMsg.textContent = '';
  successMsg.textContent = '';
  try {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Не авторизован');
    console.log('[DEBUG] Fetching fresh users data');
    lastFetchedUsers = null; // Сброс кэша
    const res = await fetch('/admin/users', { headers: { 'Authorization': `Bearer ${token}` } });
    if (res.status === 403) throw new Error('Нет прав доступа');
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Ошибка загрузки');
    }
    usersData = await res.json();
    lastFetchedUsers = usersData; // Сохраняем в кэш
    console.log('[DEBUG] Fetched usersData:', JSON.stringify(usersData, null, 2));
    currentPage = 1;
    applyUserFilters();
  } catch (e) {
    showError(e.message);
  } finally {
    setLoading(false);
  }
}

function openModeration(username) {
  modUser = usersData.find(u => u.username === username);
  if (!modUser) {
    showError('Пользователь не найден');
    return;
  }

  modUserName.textContent = modUser.username;

  // Определяем, забанен ли пользователь
  const isBanned = modUser.bannedUntil && new Date(modUser.bannedUntil) > new Date();
  // Определяем, приостановлен ли пользователь, используя правильное поле suspended_until
  const isSuspended = modUser.suspended_until && new Date(modUser.suspended_until) > new Date();

  // Логирование для отладки
  console.log(`[DEBUG] openModeration: User ${username}, isBanned=${isBanned}, isSuspended=${isSuspended}, suspended_until=${modUser.suspended_until}`);

  // Формируем опции для actionSelect
  actionSelect.innerHTML = `
    ${isBanned ? '<option value="unban">Разбанить</option>' : '<option value="ban">Забанить</option>'}
    ${isSuspended ? '<option value="unsuspend">Отменить приостановку</option>' : '<option value="suspend">Приостановить</option>'}
    <option value="change_role">Изменить роль</option>
    <option value="delete">Удалить</option>
  `;

  // Устанавливаем действие по умолчанию
  actionSelect.value = isBanned ? 'unban' : isSuspended ? 'unsuspend' : 'ban';
  roleGroup.style.display = 'none';
  banDurationGroup.style.display = actionSelect.value === 'ban' ? 'block' : 'none';
  banReasonGroup.style.display = actionSelect.value === 'ban' ? 'block' : 'none';
  suspendDurationGroup.style.display = actionSelect.value === 'suspend' ? 'block' : 'none';
  banReason.value = '';
  banDuration.value = '1';
  suspendDuration.value = '7';
  newRoleSelect.value = modUser.role || 'user';
  moderationModal.classList.add('active');
}

async function applyModeration() {
  const action = actionSelect.value;
  const token = localStorage.getItem('token');
  try {
    console.log(`[DEBUG] Applying moderation for user: ${modUser.username}, action: ${action}`);
    if (action === 'ban') {
      const reason = banReason.value.trim();
      if (!reason) throw new Error('Укажите причину бана');
      const duration = parseInt(banDuration.value);
      if (isNaN(duration) || duration < 1) throw new Error('Некорректная длительность бана');
      const res = await fetch(`/admin/users/${modUser.username}/ban`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ banReason: reason, banDays: duration })
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || 'Ошибка бана пользователя');
      }
      showSuccess(`Пользователь ${modUser.username} забанен по причине: ${reason}`);
    } else if (action === 'unban') {
      const res = await fetch(`/admin/users/${modUser.username}/unban`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || 'Ошибка разбана пользователя');
      }
      showSuccess(`Пользователь ${modUser.username} разбанен`);
    } else if (action === 'suspend') {
      const duration = parseInt(suspendDuration.value);
      if (isNaN(duration) || duration < 1) throw new Error('Некорректная длительность приостановки');
      const res = await fetch(`/admin/users/${modUser.username}/suspend`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ days: duration })
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || 'Ошибка приостановки пользователя');
      }
      showSuccess(`Пользователь ${modUser.username} приостановлен на ${duration} дней`);
    } else if (action === 'unsuspend') {
      const res = await fetch(`/admin/users/${modUser.username}/unsuspend`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || 'Ошибка отмены приостановки');
      }
      showSuccess(`Приостановка пользователя ${modUser.username} отменена`);
    } else if (action === 'change_role') {
      const newRole = newRoleSelect.value;
      if (!['user', 'developer', 'admin'].includes(newRole)) throw new Error('Некорректная роль');
      const res = await fetch(`/admin/users/${modUser.username}/role`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error?.message || 'Ошибка изменения роли');
      }
      showSuccess(`Роль пользователя ${modUser.username} изменена на ${newRole}`);
    } else if (action === 'delete') {
      console.log(`[DEBUG] Sending DELETE request for user: ${modUser.username}`);
      const res = await fetch(`/admin/users/${modUser.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) {
        const errorData = await res.json();
        console.log(`[DEBUG] Server error response: ${JSON.stringify(errorData)}`);
        throw new Error(errorData.error?.message || 'Ошибка удаления пользователя');
      }
      console.log(`[DEBUG] User ${modUser.username} deleted successfully`);
      showSuccess(`Пользователь ${modUser.username} удалён`);
    }
    await fetchUsers(); // Обновляем список пользователей
    console.log(`[DEBUG] Updated usersData after ${action}:`, JSON.stringify(usersData.find(u => u.username === modUser.username), null, 2));
    applyUserFilters(); // Перерисовываем таблицу
    // Закрываем модальное окно, чтобы при повторном открытии опции обновились
    moderationModal.classList.remove('active');
  } catch (e) {
    console.error(`[ERROR] Moderation failed: ${e.message}`);
    showError(e.message);
  }
}
// Games
function applyGameFilters() {
  const q = gameSearchInput.value.toLowerCase();
  const a = authorFilter.value.toLowerCase();
  const filtered = gamesData.filter(g => (
    g.title.toLowerCase().includes(q) &&
    (!a || g.author.toLowerCase().includes(a))
  ));
  renderGames(filtered);
}

function renderGames(list) {
  gameList.innerHTML = list.map(g => `
    <div class="game-card" tabindex="0">
      <div class="game-info-header">
        <span class="game-title">🎮 <strong>${g.title}</strong></span>
      </div>
      <div class="game-author">Автор: ${g.author}</div>
      <div class="game-status-info">
        <span>Просмотры: ${g.views}</span>
        <span>Дата: ${g.upload_date}</span>
        ${g.frozen ? `<span class="status-frozen">🧊 Заморожена${g.freezeReason ? ': ' + g.freezeReason : ''}</span>` : ''}
      </div>
      <div class="admin-buttons">
        <button class="rate-btn" onclick="openGameModeration('${g.id}', '${g.title}', '${g.author}')">Модерировать</button>
      </div>
    </div>
  `).join('');
}

async function fetchGames() {
  setLoading(true);
  try {
    const token = localStorage.getItem('token');
    if (!token) throw new Error('Не авторизован');
    const res = await fetch('/games', { headers: { 'Authorization': `Bearer ${token}` } });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Ошибка загрузки игр');
    }
    gamesData = await res.json();
    applyGameFilters();
  } catch (e) {
    showError(e.message);
  } finally {
    setLoading(false);
  }
}

function openGameModeration(gameId, gameTitle, gameAuthor) {
  modGame = gamesData.find(g => g.id === gameId);
  if (!modGame) {
    showError('Игра не найдена');
    return;
  }
  modGame = { ...modGame, title: gameTitle, author: gameAuthor }; // Сохраняем title и author

  modGameName.textContent = gameTitle;

  // Проверяем, заморожена ли текущая игра
  const isFrozen = modGame.frozen;
  // Проверяем, есть ли замороженные игры у автора
  const hasFrozenGamesByAuthor = gamesData.some(g => g.author === gameAuthor && g.frozen);

  // Логирование для отладки
  console.log(`[DEBUG] openGameModeration: Game ${gameId}, title=${gameTitle}, author=${gameAuthor}, isFrozen=${isFrozen}, hasFrozenGamesByAuthor=${hasFrozenGamesByAuthor}`);

  // Формируем опции для gameActionSelect
  gameActionSelect.innerHTML = `
    ${isFrozen ? '<option value="unfreeze">Разморозить</option>' : '<option value="freeze">Заморозить</option>'}
    ${hasFrozenGamesByAuthor ? '<option value="unfreeze_author">Разморозить все игры автора</option>' : '<option value="freeze_author">Заморозить все игры автора</option>'}
    <option value="delete">Удалить</option>
  `;

  // Устанавливаем действие по умолчанию
  gameActionSelect.value = isFrozen ? 'unfreeze' : hasFrozenGamesByAuthor ? 'unfreeze_author' : 'freeze';
  freezeReasonGroup.style.display = ['freeze', 'freeze_author'].includes(gameActionSelect.value) ? 'block' : 'none';
  freezeReason.value = '';
  gameModerationModal.classList.add('active');
}

async function applyGameModeration() {
  const action = gameActionSelect.value;
  const token = localStorage.getItem('token');
  try {
    if (action === 'freeze') {
      const reason = freezeReason.value.trim();
      if (!reason) throw new Error('Укажите причину заморозки');
      const res = await fetch(`/admin/games/${modGame.id}/freeze`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ freezeReason: reason })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Ошибка заморозки игры');
      showSuccess(`Игра ${modGame.title} заморожена по причине: ${reason}`);
    } else if (action === 'freeze_author') {
      const reason = freezeReason.value.trim();
      if (!reason) throw new Error('Укажите причину заморозки');
      const res = await fetch(`/admin/games/author/${modGame.author}/freeze`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ freezeReason: reason })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Ошибка заморозки игр автора');
      showSuccess(`Все игры автора ${modGame.author} заморожены по причине: ${reason}`);
    } else if (action === 'unfreeze') {
      const res = await fetch(`/admin/games/${modGame.id}/unfreeze`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Ошибка разморозки игры');
      showSuccess(`Игра ${modGame.title} разморожена`);
    } else if (action === 'unfreeze_author') {
      const res = await fetch(`/admin/games/author/${modGame.author}/unfreeze`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Ошибка разморозки игр автора');
      showSuccess(`Все игры автора ${modGame.author} разморожены`);
    } else if (action === 'delete') {
      const res = await fetch(`/games/${modGame.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Ошибка удаления игры');
      showSuccess(`Игра ${modGame.title} удалена`);
    }
    await fetchGames();
  } catch (e) {
    showError(e.message);
  } finally {
    gameModerationModal.classList.remove('active');
  }
}

// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
  const savedTheme = localStorage.getItem('theme') || 'red';
  applyTheme(savedTheme);
  try {
    const token = localStorage.getItem('token');
    if (!token) throw new Error();
    const usr = await (await fetch('/user-data', { headers: { 'Authorization': `Bearer ${token}` } })).json();
    if (usr.role !== 'admin') throw new Error('Доступ запрещен');
    currentAdmin = usr.username; // Сохраняем имя текущего админа
    await Promise.all([fetchUsers(), fetchGames()]);
    setInterval(fetchUsers, 15000);
  } catch {
    window.location.href = '/login.html';
  }
});

actionSelect.addEventListener('change', () => {
  roleGroup.style.display = actionSelect.value === 'change_role' ? 'block' : 'none';
  banDurationGroup.style.display = actionSelect.value === 'ban' ? 'block' : 'none';
  banReasonGroup.style.display = actionSelect.value === 'ban' ? 'block' : 'none';
  suspendDurationGroup.style.display = actionSelect.value === 'suspend' ? 'block' : 'none';
});

gameActionSelect.addEventListener('change', () => {
  freezeReasonGroup.style.display = ['freeze', 'freeze_author'].includes(gameActionSelect.value) ? 'block' : 'none';
});

cancelBtn.addEventListener('click', () => moderationModal.classList.remove('active'));
confirmBtn.addEventListener('click', applyModeration);
cancelGameBtn.addEventListener('click', () => gameModerationModal.classList.remove('active'));
confirmGameBtn.addEventListener('click', applyGameModeration);
refreshBtn.addEventListener('click', fetchUsers);
refreshGamesBtn.addEventListener('click', fetchGames);
prevPage.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage--;
    applyUserFilters();
  }
});
nextPage.addEventListener('click', () => {
  const totalPages = Math.ceil(usersData.length / itemsPerPage);
  if (currentPage < totalPages) {
    currentPage++;
    applyUserFilters();
  }
});
themeToggle.addEventListener('click', () => {
  const currentTheme = localStorage.getItem('theme') || 'red';
  const nextTheme = themes[(themes.indexOf(currentTheme) + 1) % themes.length];
  localStorage.setItem('theme', nextTheme);
  applyTheme(nextTheme);
});

const debouncedApplyUserFilters = debounce(applyUserFilters, 300);
const debouncedApplyGameFilters = debounce(applyGameFilters, 300);
[searchInput, roleFilter, statusFilter, banFilter].forEach(el => el.addEventListener('input', debouncedApplyUserFilters));
[gameSearchInput, authorFilter].forEach(el => el.addEventListener('input', debouncedApplyGameFilters));