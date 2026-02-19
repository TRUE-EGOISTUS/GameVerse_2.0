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
    loadGameData();
});

const gameId = new URLSearchParams(window.location.search).get('id');

// Load game data
async function loadGameData() {
    try {
        const token = localStorage.getItem('token');
        console.log('Token:', token); // Добавляем лог для проверки токена
        if (!token) {
            alert('Необходима авторизация');
            window.location.href = '/login.html';
            return;
        }

        console.log('Fetching game data for id:', gameId); // Лог для проверки id
        const response = await fetch(`/games/${gameId}`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        console.log('Response status:', response.status); // Лог статуса ответа
        if (!response.ok) {
            if (response.status === 401) {
                localStorage.removeItem('token');
                alert('Сессия истекла. Пожалуйста, войдите снова.');
                window.location.href = '/login.html';
            }
            throw new Error('Ошибка загрузки данных');
        }
        
        const game = await response.json();
        console.log('Received game data:', game); // Лог полученных данных
        
        // Fill form with translated (Russian) data
        document.getElementById('title').value = game.title || '';
        document.getElementById('description').value = game.description || '';
        document.getElementById('genre').value = game.genre || 'Аркада';
        document.getElementById('tags').value = (game.tags || []).join(', ');
        
        // Show current cover
        if (game.cover) {
            const preview = document.getElementById('coverPreview');
            preview.src = game.cover;
            preview.style.display = 'block';
        }
    } catch (err) {
        console.error('Ошибка:', err);
        alert('Ошибка загрузки данных игры: ' + err.message);
    }
}

// Validate and format tags
function validateAndFormatTags(tagsInput) {
    if (!tagsInput) return '';
    const tags = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag);
    const validTags = tags.filter(tag => /^[a-zA-Zа-яА-Я0-9\s]+$/.test(tag));
    if (validTags.length !== tags.length) {
        throw new Error('Теги могут содержать только буквы, цифры и пробелы');
    }
    return validTags.join(', '); // Изменено с return validTags на строку
}

// Убедитесь, что этот код присутствует в edit-metadata.js
document.getElementById('editForm').onsubmit = async (e) => {
    e.preventDefault();
    
    try {
        const token = localStorage.getItem('token');
        if (!token) throw new Error('Необходима авторизация');

        const tagsInput = document.getElementById('tags').value;
        const formattedTags = validateAndFormatTags(tagsInput);

        const gameData = {
            title: document.getElementById('title').value,
            description: document.getElementById('description').value,
            genre: document.getElementById('genre').value,
            tags: formattedTags
        };

        const coverFile = document.getElementById('cover').files[0];

        console.log('Sending game data (JSON):', gameData);
        console.log('Has cover file:', !!coverFile);
        if (coverFile) {
            console.log('Cover file details:', {
                name: coverFile.name,
                size: coverFile.size,
                type: coverFile.type
            });
        }

        const response = await fetch(`/games/${gameId}`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(gameData)
        });

        console.log('Game update response status:', response.status, response.statusText);
        const gameResult = await response.json();
        console.log('Game update response body:', gameResult);

        if (!response.ok || !gameResult.success) {
            const error = gameResult.error || gameResult.message || 'Ошибка сохранения';
            if (response.status === 401) {
                localStorage.removeItem('token');
                alert('Сессия истекла. Пожалуйста, войдите снова.');
                window.location.href = '/login.html';
            }
            throw new Error(error);
        }

        if (coverFile) {
            if (coverFile.size === 0) {
                console.error('Cover file is empty:', coverFile.name);
                throw new Error('Файл обложки пустой');
            }

            const coverFormData = new FormData();
            coverFormData.append('cover', coverFile);

            console.log('FormData entries:', Array.from(coverFormData.entries()).map(([key, value]) => ({
                key,
                name: value.name,
                size: value.size,
                type: value.type
            })));
            console.log('Sending cover file...', coverFile.name);

            const coverResponse = await fetch(`/games/${gameId}/cover`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                body: coverFormData
            });

            console.log('Cover response status:', coverResponse.status, coverResponse.statusText);
            const coverResult = await coverResponse.json();
            console.log('Cover response body:', coverResult);

            if (!coverResponse.ok) {
                const coverError = coverResult.error || {};
                console.log('Full cover error response:', coverError);
                throw new Error(coverError.message || 'Ошибка загрузки обложки');
            }

            if (!coverResult.success) {
                throw new Error(coverResult.error || 'Неизвестная ошибка при загрузке обложки');
            }

            console.log('Cover uploaded, game data:', coverResult.game);
        }

        alert('Изменения сохранены успешно!');
        window.location.href = 'dashboard.html';

    } catch (err) {
        console.error('Ошибка:', err);
        alert('Ошибка при сохранении изменений: ' + (err.message || 'Неизвестная ошибка'));
    }
};

// Preview selected cover
document.getElementById('cover').onchange = function(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('coverPreview');
            preview.src = e.target.result;
            preview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
};

// Load data on page load
document.addEventListener('DOMContentLoaded', loadGameData);