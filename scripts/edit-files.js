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
    let currentGameId = new URLSearchParams(window.location.search).get('id');
    let selectedFilePath = null;

    async function loadFiles() {
      try {
        const token = localStorage.getItem('token');
        if (!token) {
          alert('Необходима авторизация');
          window.location.href = '/login.html';
          return;
        }

        const response = await fetch(`/games/${currentGameId}/files`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });

        if (!response.ok) throw new Error('Ошибка загрузки файлов');
        
        const files = await response.json();
        const fileList = document.getElementById('fileList');
   fileList.innerHTML = files.map(file => `
  <div class="file-item" onclick="selectFile('${file.path}')">
    📄 ${file.name}
    <span class="file-meta">
      ${(file.size / 1024).toFixed(1)} KB | 
      ${file.modified ? new Date(file.modified).toLocaleDateString() : '—'}
    </span>
  </div>
`).join('');
      } catch (err) {
        console.error('Ошибка загрузки файлов:', err);
        alert('Не удалось загрузить список файлов. Попробуйте позже.');
      }
    }

    async function selectFile(path) {
      selectedFilePath = path;
      const fileItems = document.querySelectorAll('.file-item');
      fileItems.forEach(item => item.classList.remove('selected'));
      
      const selectedItem = [...fileItems].find(item => 
        item.textContent.includes(path)
      );
      if (selectedItem) selectedItem.classList.add('selected');

      // Показываем информацию о файле
      const previewContainer = document.getElementById('previewContainer');
      previewContainer.innerHTML = `
        <div class="file-info">
          <h3>📄 ${path}</h3>
          <button onclick="replaceFile()" class="btn neon-btn">🔄 Заменить файл</button>
        </div>
      `;
    }

    async function replaceFile() {
      if (!selectedFilePath) {
        alert('Выберите файл для замены');
        return;
      }

      const token = localStorage.getItem('token');
      if (!token) {
        alert('Необходима авторизация');
        window.location.href = '/login.html';
        return;
      }

      const version = prompt('Введите версию обновления:');
      const description = prompt('Опишите изменения в обновлении:');

      const input = document.createElement('input');
      input.type = 'file';
      input.style.display = 'none';
      document.body.appendChild(input);

      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('filepath', selectedFilePath);
        formData.append('version', version);
        formData.append('description', description);

        try {
          const response = await fetch(`/games/${currentGameId}/files/replace`, {
            method: 'POST',
            body: formData,
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });

          if (!response.ok) throw new Error('Ошибка при замене файла');
          alert('Файл успешно заменен!');
          loadFiles();
        } catch (err) {
          console.error('Ошибка:', err);
          alert('Не удалось заменить файл. Попробуйте позже.');
        } finally {
          document.body.removeChild(input);
        }
      };

      input.click();
    }

    document.addEventListener('DOMContentLoaded', () => {
      if (!currentGameId) {
        alert('ID игры не указан');
        window.location.href = 'dashboard.html';
        return;
      }
      loadFiles();
    });