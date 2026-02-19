        // Список запрещенных расширений
        const FORBIDDEN_EXTENSIONS = [
            '.exe', '.bat', '.cmd', '.vbs', '.ps1', '.sh', '.dll', '.sys',
            '.com', '.msi', '.scr', '.jar', '.py', '.rb', '.php', '.zip', '.rar'
        ];

        // Проверка файлов на подозрительные расширения и MIME-типы
        function validateFile(file) {
            const extension = '.' + file.name.split('.').pop().toLowerCase();
            if (FORBIDDEN_EXTENSIONS.includes(extension)) {
                return `Файл ${file.name} имеет недопустимое расширение (${extension})`;
            }

            const allowedTypes = [
                'text/html', 'text/css', 'application/javascript','text/javascript',
                'image/png', 'image/jpeg', 'image/gif',
                'audio/mpeg', 'audio/wav', 'video/mp4'
            ];
            if (!allowedTypes.includes(file.type)) {
                return `Файл ${file.name} имеет недопустимый тип (${file.type || 'неизвестный'})`;
            }

            // Проверка размера файла (10 МБ для gameFiles, 5 МБ для cover)
            const maxSize = file.name === 'cover' ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
            if (file.size > maxSize) {
                return `Файл ${file.name} слишком большой (${(file.size / 1024 / 1024).toFixed(2)} МБ)`;
            }

            return null;
        }

        // Загрузка игр пользователя
async function loadMyGames() {
    try {
        const token = localStorage.getItem('token');
        if (!token) {
            window.location.href = '/login.html';
            return;
        }

        const response = await fetch("/developer/games", {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка загрузки игр');
        }

        const games = await response.json();
        renderMyGames(games);
    } catch (err) {
        console.error("Ошибка:", err);
        document.getElementById("myGamesContainer").innerHTML = '<p>Ошибка загрузки игр. Попробуйте позже.</p>';
    }
}

function renderMyGames(games) {
    const container = document.getElementById("myGamesContainer");
    if (games.length === 0) {
        container.innerHTML = '<p>У вас пока нет загруженных игр.</p>';
        return;
    }
    container.innerHTML = games.map(game => {
        console.log(`[DEBUG] Game ${game.id} cover: ${game.cover}`); // Логируем cover
        return `
            <div class="game-card">
                <div class="game-cover-wrapper">
                    ${game.cover ? `<img src="${game.cover}" class="game-cover" alt="${game.title}" onerror="this.src='/default-cover.png'; console.error('Failed to load cover for game ${game.id}: ${game.cover}')">` : `
                    <div class="game-cover-placeholder">
                        <span>🎮</span>
                        <span class="no-cover-text">Нет обложки</span>
                    </div>`}
                </div>
                <h3>${game.title}</h3>
                <p class="game-description">${game.description}</p>
                <div class="game-meta">
                    <span>👤 ${game.author}</span>
                    <span>📅 ${game.upload_date || '—'}</span>
                    <span>🎮 ${game.genre}</span>
                    <span>👁 ${game.views || 0} просмотров</span>
                    <span>⭐ ${getAverageRating(game.ratings)}</span>
                </div>
                <div class="game-actions">
                    <a href="edit-options.html?id=${game.id}" class="btn small-btn">✏️ Редактировать</a>
                    <button onclick="deleteGame('${game.id}')" class="btn small-btn danger">🗑 Удалить</button>
                    <a href="analytics.html?id=${game.id}" class="btn small-btn">📊 Аналитика</a>
                </div>
            </div>
        `;
    }).join('');
}
        function getAverageRating(ratings) {
            if (!ratings || ratings.length === 0) return '0.0';
            const avg = ratings.reduce((sum, r) => sum + r.rating, 0) / ratings.length;
            return avg.toFixed(1) + ' ★';
        }
        
        // Модальное окно редактирования
        const modal = document.getElementById("editModal");
        const closeBtn = document.querySelector(".close-btn");
        
        function openEditModal(gameId) {
            fetch(`/games/${gameId}`)
                .then(res => {
                    if (!res.ok) throw new Error('Игра не найдена');
                    return res.json();
                })
                .then(game => {
                    document.getElementById("editGameId").value = game.id;
                    document.getElementById("editTitle").value = game.title;
                    document.getElementById("editDescription").value = game.description;
                    document.getElementById("editGenre").value = game.genre;
                    document.getElementById("editTags").value = game.tags?.join(', ') || '';
                    modal.style.display = "block";
                })
                .catch(err => {
                    console.error("Ошибка:", err);
                    alert(err.message);
                });
        }
        
        closeBtn.onclick = () => modal.style.display = "none";
        window.onclick = (e) => e.target === modal ? modal.style.display = "none" : null;
        
        // Обработка формы редактирования
        document.getElementById("editForm").addEventListener("submit", function(e) {
            e.preventDefault();
            
            const gameId = document.getElementById("editGameId").value;
            const gameData = {
                title: document.getElementById("editTitle").value,
                description: document.getElementById("editDescription").value,
                genre: document.getElementById("editGenre").value,
                tags: document.getElementById("editTags").value.split(',').map(tag => tag.trim())
            };
            
            fetch(`/games/${gameId}`, {
                method: "PUT",
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(gameData)
            })
            .then(res => {
                if (!res.ok) throw new Error('Ошибка сохранения');
                return res.json();
            })
            .then(() => {
                modal.style.display = "none";
                loadMyGames();
            })
            .catch(err => {
                console.error("Ошибка обновления:", err);
                alert(err.message);
            });
        });
        
        // Удаление игры
        async function deleteGame(gameId) {
            if (!confirm('Вы уверены, что хотите удалить эту игру?')) return;
            try {
                const response = await fetch(`/games/${gameId}`, {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
                if (!response.ok) throw new Error('Ошибка удаления');
                alert('Игра успешно удалена');
                loadMyGames();
            } catch (err) {
                console.error("Ошибка:", err);
                alert('Ошибка при удалении игры');
            }
        }
        
        // --- Новый функционал для накопления файлов ---
        let selectedGameFiles = [];

        const gameFilesInput = document.getElementById('gameFiles');
        const addFilesBtn = document.getElementById('addFilesBtn');
        const fileList = document.getElementById('fileList');

        addFilesBtn.addEventListener('click', () => {
            gameFilesInput.value = ''; // Сбросить input, чтобы можно было выбрать те же файлы снова
            gameFilesInput.click();
        });

        gameFilesInput.addEventListener('change', () => {
            // Добавляем новые файлы к уже выбранным, избегая дубликатов по имени
            const newFiles = Array.from(gameFilesInput.files);
            const existingNames = selectedGameFiles.map(f => f.name);
            newFiles.forEach(file => {
                if (!existingNames.includes(file.name)) {
                    selectedGameFiles.push(file);
                }
            });
            renderFileList();
        });

        function renderFileList() {
            fileList.innerHTML = '';
            if (selectedGameFiles.length === 0) {
                fileList.innerHTML = '<p>Файлы не выбраны</p>';
                return;
            }
            let hasIndexHtml = false;
            selectedGameFiles.forEach((file, idx) => {
                if (file.name.toLowerCase() === 'index.html') hasIndexHtml = true;
                const p = document.createElement('p');
                p.textContent = `${file.name} (${(file.size/1024).toFixed(1)} КБ)`;
                // Кнопка удаления файла из списка
                const delBtn = document.createElement('button');
                delBtn.textContent = '✖';
                delBtn.type = 'button';
                delBtn.style.marginLeft = '8px';
                delBtn.onclick = () => {
                    selectedGameFiles.splice(idx, 1);
                    renderFileList();
                };
                p.appendChild(delBtn);
                fileList.appendChild(p);
            });
            if (!hasIndexHtml) {
                const err = document.createElement('p');
                err.textContent = 'Внимание: среди файлов должен быть index.html!';
                err.className = 'error';
                fileList.appendChild(err);
            }
        }

        // --- Обработка формы загрузки ---
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM загружен, ищу форму...');
    console.log(document.body.innerHTML); // Проверка содержимого
    const form = document.getElementById('upload-game-form');
    if (!form) {
        console.error('Форма с id="upload-game-form" не найдена!');
        return;
    }
    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        console.log('Форма отправлена!');

        if (!selectedGameFiles.some(file => file.name.toLowerCase() === 'index.html')) {
            alert('Среди файлов должен быть index.html');
            console.log('Ошибка: отсутствует index.html');
            return;
        }

        for (const file of selectedGameFiles) {
            const validationError = validateFile(file);
            if (validationError) {
                alert(validationError);
                console.log('Ошибка валидации:', validationError);
                return;
            }
        }
        const coverInput = document.getElementById('cover');
        if (coverInput && coverInput.files[0]) {
            const coverValidationError = validateFile(coverInput.files[0]);
            if (coverValidationError) {
                alert(coverValidationError);
                console.log('Ошибка валидации обложки:', coverValidationError);
                return;
            }
        }

        const formData = new FormData(this);
        selectedGameFiles.forEach(file => formData.append('gameFiles', file));
        if (coverInput && coverInput.files[0]) formData.append('cover', coverInput.files[0]);

        try {
            const token = localStorage.getItem('token');
            if (!token) {
                alert('Пожалуйста, войдите в систему');
                console.log('Токен отсутствует');
                window.location.href = '/login.html';
                return;
            }
            console.log('Токен:', token);

            console.log('Отправка FormData:');
            for (const pair of formData.entries()) {
                console.log(`${pair[0]}:`, pair[1]);
            }

            const res = await fetch('http://localhost:3000/games/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: formData
            });

            console.log('Ответ сервера:', res.status, res.statusText);

            let result;
            const contentType = res.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                result = await res.json();
            } else {
                const text = await res.text();
                alert('Ошибка загрузки: ' + (text.slice(0, 200) || 'Неизвестная ошибка'));
                console.log('Не-JSON ответ:', text);
                return;
            }

            if (res.ok && result.success) {
                alert('Игра успешно загружена! ID: ' + result.gameId);
                this.reset();
                selectedGameFiles = [];
                renderFileList();
                const coverPreview = document.getElementById('coverPreview');
                if (coverPreview) coverPreview.style.display = 'none';
                loadMyGames();
            } else {
                alert(result.error?.message || 'Ошибка загрузки');
                console.log('Ошибка от сервера:', result);
            }
        } catch (err) {
            console.error('Ошибка при отправке:', err);
            alert('Ошибка загрузки: ' + err.message);
        }
    });
});
        
        async function logout() {
            try {
                const response = await fetch("/logout", {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${localStorage.getItem('token')}`
                    }
                });
                if (!response.ok) throw new Error('Ошибка выхода');
                localStorage.removeItem('token');
                window.location.href = "index.html";
            } catch (err) {
                console.error("Ошибка выхода:", err);
                alert(err.message);
            }
        }
        
        // ====== Поддержка смены темы ======
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
        function getHoverShadowColor(theme) {
            switch (theme) {
                case 'red': return 'rgba(255, 65, 108, 0.4)';
                case 'yellow': return 'rgba(255, 215, 0, 0.4)';
                case 'green': return 'rgba(76, 175, 80, 0.4)';
                case 'blue': return 'rgba(33, 150, 243, 0.4)';
                case 'purple': return 'rgba(156, 39, 176, 0.4)';
                case 'rgb': return 'rgba(255, 65, 108, 0.4)';
                default: return 'rgba(255, 65, 108, 0.4)';
            }
        }
        function getScrollbarThumbColor(theme) {
            switch (theme) {
                case 'red': return '#ff416c';
                case 'yellow': return '#ffd700';
                case 'green': return '#4caf50';
                case 'blue': return '#2196f3';
                case 'purple': return '#9c27b0';
                case 'rgb': return 'linear-gradient(45deg, #ff6666, #66b3ff, #66cc66)';
                default: return '#ff416c';
            }
        }
        // При загрузке страницы применяем тему из localStorage
        document.addEventListener('DOMContentLoaded', () => {
            const savedTheme = localStorage.getItem('theme') || 'red';
            applyTheme(savedTheme);
            loadMyGames();

        });