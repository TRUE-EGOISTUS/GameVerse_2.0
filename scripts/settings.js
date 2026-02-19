        let currentUser = null;

        function showLoading() {
            document.getElementById('preloader').style.display = 'flex';
        }

        function hideLoading() {
            document.getElementById('preloader').style.display = 'none';
        }

        async function loadUserData() {
            showLoading();
            try {
                const token = localStorage.getItem('token');
                if (!token) {
                    alert('Требуется авторизация');
                    window.location.href = '/login.html';
                    return;
                }

                const response = await fetch('/user-data', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (response.status === 401) {
                    localStorage.removeItem('token');
                    alert('Сессия истекла. Пожалуйста, войдите снова.');
                    window.location.href = '/login.html';
                    return;
                }

                if (!response.ok) {
                    throw new Error('Ошибка загрузки данных пользователя');
                }

                currentUser = await response.json();
                console.log('Пользователь загружен:', currentUser);
            } catch (err) {
                console.error('Ошибка загрузки данных:', err);
                alert(err.message || 'Не удалось загрузить данные');
                window.location.href = '/login.html';
            } finally {
                hideLoading();
            }
        }

async function changeUsername(event) {
    event.preventDefault();
    const newUsername = document.getElementById('newUsername').value.trim();

    if (!/^[A-Za-z0-9_]+$/.test(newUsername)) {
        alert('Ник может содержать только буквы, цифры и подчеркивания');
        return false;
    }

    try {
        showLoading();
        const token = localStorage.getItem('token');
        const response = await fetch('http://localhost:3000/user/username', {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ newUsername })
        });

        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            throw new Error('Сервер вернул не JSON-ответ');
        }

        const data = await response.json();
        if (response.status === 401) {
            localStorage.removeItem('token');
            alert('Сессия истекла. Пожалуйста, войдите снова.');
            window.location.href = '/login.html';
            return false;
        }

        if (!response.ok) {
            throw new Error(data.error?.message || 'Ошибка смены ника');
        }

        localStorage.setItem('token', data.token);
        currentUser.username = data.username;
        alert('Ник успешно изменён');
        document.getElementById('usernameForm').reset();
    } catch (err) {
        console.error('Ошибка смены ника:', err);
        alert(err.message || 'Не удалось изменить ник');
    } finally {
        hideLoading();
    }
    return false;
}

        async function changePassword(event) {
            event.preventDefault();
            const oldPassword = document.getElementById('oldPassword').value;
            const newPassword = document.getElementById('newPassword').value;

            try {
                showLoading();
                const token = localStorage.getItem('token');
                const response = await fetch('/user/password', {
                    method: 'PUT',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ oldPassword, newPassword })
                });

                if (response.status === 401) {
                    localStorage.removeItem('token');
                    alert('Сессия истекла. Пожалуйста, войдите снова.');
                    window.location.href = '/login.html';
                    return false;
                }

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Ошибка смены пароля');
                }

                alert('Пароль успешно изменён');
                document.getElementById('passwordForm').reset();
            } catch (err) {
                console.error('Ошибка смены пароля:', err);
                alert(err.message || 'Не удалось изменить пароль');
            } finally {
                hideLoading();
            }
            return false;
        }

        async function logout() {
            try {
                const token = localStorage.getItem('token');
                if (token) {
                    await fetch('/logout', {
                        method: 'POST',
                        headers: { 'Authorization': `Bearer ${token}` }
                    });
                }
                localStorage.removeItem('token');
                window.location.href = '/index.html';
            } catch (err) {
                console.error('Ошибка выхода:', err);
                localStorage.removeItem('token');
                window.location.href = '/index.html';
            }
        }

        // Функция для применения темы
        function applyTheme(theme) {
            document.body.classList.remove('rgb-theme');
            document.body.style.setProperty('--theme-color', getThemeColor(theme));
            document.body.style.setProperty('--theme-secondary-color', getThemeSecondaryColor(theme));
            document.body.style.setProperty('--theme-glow-color', getThemeGlowColor(theme));
            document.body.style.setProperty('--text-color', getTextColor(theme));
            document.body.style.setProperty('--bg-gradient', getBackgroundGradient(theme));
            document.body.style.setProperty('--glass-card-border-color', getThemeGlowColor(theme));
            document.body.style.setProperty('--hover-shadow-color', getHoverShadowColor(theme));
  document.body.style.setProperty('--scrollbar-thumb-color', getScrollbarThumbColor(theme));
            if (theme === 'rgb') {
                document.body.classList.add('rgb-theme');
            }
            localStorage.setItem('theme', theme);
            updateThemeCards(theme);
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
}}

        // Функция для получения цвета темы
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
                case 'yellow': return 'rgba(255, 215, 0, 0.3)';
                case 'green': return '#45b649';
                case 'blue': return '#2196f3';
                case 'purple': return '#9c27b0';
                default: return '#ff4b2b';
            }
        }

        function getThemeGlowColor(theme) {
            switch (theme) {
                case 'red': return 'rgba(255, 65, 108, 0.8)';
                case 'yellow': return 'rgba(255, 215, 0, 0.3)';
                case 'green': return 'rgba(76, 175, 80, 0.8)';
                case 'blue': return 'rgba(33, 150, 243, 0.8)';
                case 'purple': return 'rgba(156, 39, 176, 0.8)';
                case 'rgb': return 'rgba(102, 204, 102, 0.8)';
                default: return 'rgba(255, 65, 108, 0.8)';
            }
        }
        // Функция для получения цвета текста
        function getTextColor(theme) {
            switch (theme) {
                case 'yellow': return '#ffffff'; // Чёрный текст для жёлтой темы
                default: return '#ffffff'; // Белый текст для остальных
            }
        }

        // Функция для получения градиента фона
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
    case 'yellow': return 'rgba(255, 215, 0, 0.4)';
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

        // Обновление стилей карточек тем
        function updateThemeCards(selectedTheme) {
            document.querySelectorAll('.theme-card').forEach(card => {
                if (card.dataset.theme === selectedTheme) {
                    card.classList.add('selected');
                } else {
                    card.classList.remove('selected');
                }
            });
        }

        // Добавить функцию для обновления динамических стилей (border header и скроллбар)
        function updateDynamicThemeStyles(theme) {
            const glow = getThemeGlowColor(theme);
            const scrollbar = getScrollbarThumbColor(theme);
            let styleTag = document.getElementById('dynamic-theme-style');
            if (!styleTag) {
                styleTag = document.createElement('style');
                styleTag.id = 'dynamic-theme-style';
                document.head.appendChild(styleTag);
            }
            styleTag.textContent = `
                header {
                    border-bottom: 3px solid ${glow} !important;
                }
                ::-webkit-scrollbar-thumb {
                    background: ${scrollbar} !important;
                }
                ::-webkit-scrollbar-thumb:hover {
                    background: ${glow} !important;
                }
                body {
                    scrollbar-color: ${glow} #222 !important;
                }
            `;
        }

        // Переопределяем applyTheme чтобы обновлять динамические стили
        const origApplyTheme = applyTheme;
        applyTheme = function(theme) {
            origApplyTheme(theme);
            updateDynamicThemeStyles(theme);
        };

        // При загрузке страницы применяем сохранённую тему
        document.addEventListener('DOMContentLoaded', () => {
            loadUserData();
            const savedTheme = localStorage.getItem('theme') || 'red';
            applyTheme(savedTheme);
            // Обработчик для карточек тем
            document.querySelectorAll('.theme-card').forEach(card => {
                card.addEventListener('click', () => {
                    const theme = card.dataset.theme;
                    applyTheme(theme);
                });
            });
        });