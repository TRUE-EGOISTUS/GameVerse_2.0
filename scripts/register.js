 function applyTheme(theme) {
            document.body.classList.remove('rgb-theme');
            document.body.style.setProperty('--theme-color', getThemeColor(theme));
            document.body.style.setProperty('--theme-secondary-color', getThemeSecondaryColor(theme));
            document.body.style.setProperty('--theme-glow-color', getThemeGlowColor(theme));
            document.body.style.setProperty('--text-color', getTextColor(theme));
            document.body.style.setProperty('--bg-gradient', getBackgroundGradient(theme));
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
        // При загрузке страницы применяем тему из localStorage
        document.addEventListener('DOMContentLoaded', () => {
            const savedTheme = localStorage.getItem('theme') || 'red';
            applyTheme(savedTheme);
            loadMyGames();
            initThemePanel();
        });
    async function register() {
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      const role = document.getElementById('role').value;
      const errorMessage = document.getElementById('error-message');

  if (!username || !password) {
  errorMessage.textContent = 'Необходимы имя пользователя и пароль';
  errorMessage.style.display = 'block';
  return;
}

if (username.length > 20) {
  errorMessage.textContent = 'Имя пользователя не должно превышать 20 символов';
  errorMessage.style.display = 'block';
  return;
}


      try {
  const response = await fetch('/register', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password, role }),
  });

  const dataText = await response.text(); // сначала получаем ответ как текст
  let data;
  try {
    data = JSON.parse(dataText); // пытаемся распарсить JSON
  } catch (e) {
    console.error('Ошибка парсинга JSON:', e);
    console.error('Текст ответа сервера:', dataText);
    data = { error: 'Некорректный ответ сервера' };
  }

  if (response.ok) {
    localStorage.setItem('token', data.token);
    window.location.href = '/index.html';
  } else {
    errorMessage.textContent = data.error || 'Ошибка регистрации';
    errorMessage.style.display = 'block';
  }
} catch (err) {
  errorMessage.textContent = 'Ошибка сервера. Попробуйте позже.';
  errorMessage.style.display = 'block';
  console.error('Register error:', err);
}
    }