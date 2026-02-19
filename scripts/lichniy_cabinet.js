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
          document.querySelector('header').style.borderBottomColor = getThemeGlowColor(theme);
          if (theme === 'rgb') {
              document.body.classList.add('rgb-theme');
          }
      }

      function getThemeColor(theme) {
          switch(theme) {
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
          switch(theme) {
              case 'red': return '#ff4b2b';
              case 'yellow': return '#ffa500';
              case 'green': return '#45a049';
              case 'blue': return '#1e88e5';
              case 'purple': return '#7b1fa2';
              default: return '#ff4b2b';
          }
      }

      function getThemeGlowColor(theme) {
          return getThemeColor(theme);
      }

      function getTextColor(theme) {
          return '#ffffff';
      }

      function getBackgroundGradient(theme) {
          switch(theme) {
              case 'red': return 'linear-gradient(135deg, #1a1a1a, #3a1c26)';
              case 'yellow': return 'linear-gradient(135deg, #1a1a1a, #3a341c)';
              case 'green': return 'linear-gradient(135deg, #1a1a1a, #1c3a1c)';
              case 'blue': return 'linear-gradient(135deg, #1a1a1a, #1c263a)';
              case 'purple': return 'linear-gradient(135deg, #1a1a1a, #2c1c3a)';
              default: return 'linear-gradient(135deg, #1a1a1a, #3a1c26)';
          }
      }

      function getHoverShadowColor(theme) {
          return getThemeGlowColor(theme);
      }

      function getScrollbarThumbColor(theme) {
          return getThemeColor(theme);
      }

      document.addEventListener('DOMContentLoaded', () => {
          const savedTheme = localStorage.getItem('theme') || 'red';
          applyTheme(savedTheme);
      });
// Загрузка данных пользователя
    async function loadUserData() {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          console.warn('Токен отсутствует, перенаправление на страницу входа');
          window.location.href = '/login.html';
          return;
        }

        const response = await fetch('/user-data', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Ошибка загрузки данных пользователя');
        }

        const user = await response.json();
        console.log('Данные пользователя загружены:', user);

        const usernameEl = document.getElementById('username');
        const userRoleEl = document.getElementById('userRole');
        const userStatusEl = document.getElementById('userStatus');
        const lastLoginEl = document.getElementById('lastLogin');
        const userAvatarEl = document.getElementById('userAvatar');

        if (!usernameEl || !userRoleEl || !userStatusEl || !lastLoginEl || !userAvatarEl) {
          throw new Error('Один или несколько элементов DOM не найдены');
        }

        usernameEl.textContent = user.username || 'Неизвестно';
        userRoleEl.textContent = user.role === 'admin' ? 'Админ' : user.role === 'developer' ? 'Разработчик' : 'Игрок';
        userStatusEl.textContent = user.online ? 'Онлайн' : 'Оффлайн';
        lastLoginEl.textContent = user.lastSeen || 'Неизвестно';
        userAvatarEl.src = user.avatar || 'https://via.placeholder.com/150';
        
        // Показать кнопку админ-панели только для админов
        const adminPanelBtn = document.getElementById('adminPanelBtn');
        if (adminPanelBtn) {
          adminPanelBtn.style.display = user.role === 'admin' ? 'block' : 'none';
        }

        // Показать кнопку "Мои игры" только для разработчиков
        const myGamesBtn = document.getElementById('myGamesBtn');
        if (myGamesBtn) {
          myGamesBtn.style.display = user.role === 'developer' ? 'block' : 'none';
        }
      } catch (err) {
        console.error('Ошибка загрузки данных:', err);
        alert(err.message || 'Не удалось загрузить данные пользователя. Попробуйте позже.');
        localStorage.removeItem('token');
        window.location.href = '/login.html';
      }
    }

    // Выход из аккаунта
    async function logout() {
      try {
        const token = localStorage.getItem('token');
        if (token) {
          const response = await fetch('/logout', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка выхода');
          }
        }
        localStorage.removeItem('token');
        window.location.href = 'index.html';
      } catch (err) {
        console.error('Ошибка выхода:', err);
        alert(err.message || 'Не удалось выйти. Попробуйте снова.');
        localStorage.removeItem('token');
        window.location.href = 'index.html';
      }
    }

    // Загрузка и предпросмотр аватара
    function initAvatarUpload() {
      const avatarUpload = document.getElementById('avatarUpload');
      const userAvatar = document.getElementById('userAvatar');
      const avatarLoading = document.getElementById('avatarLoading');
      if (!avatarUpload || !userAvatar || !avatarLoading) {
        console.warn('Элементы avatarUpload, userAvatar или avatarLoading не найдены');
        return;
      }

      avatarUpload.addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if (!file) return;

        // Предпросмотр
        const reader = new FileReader();
        reader.onload = function(e) {
          userAvatar.src = e.target.result;
        };
        reader.readAsDataURL(file);

        // Загрузка на сервер
        try {
          avatarLoading.style.display = 'block';
          const formData = new FormData();
          formData.append('avatar', file);

          const token = localStorage.getItem('token');
          const response = await fetch('/user/avatar', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            },
            body: formData
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка загрузки аватара');
          }

          const result = await response.json();
          userAvatar.src = result.avatar;
          alert('Аватар успешно загружен!');
        } catch (err) {
          console.error('Ошибка загрузки аватара:', err);
          alert(err.message || 'Не удалось загрузить аватар. Попробуйте снова.');
          userAvatar.src = 'https://via.placeholder.com/150';
        } finally {
          avatarLoading.style.display = 'none';
        }
      });
    }

    // Загрузка данных при загрузке страницы
    document.addEventListener('DOMContentLoaded', () => {
      loadUserData();
      initAvatarUpload();
    });