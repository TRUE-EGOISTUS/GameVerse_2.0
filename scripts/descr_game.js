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
    const gameId = new URLSearchParams(window.location.search).get('id');
    let currentUser = null;
    let gameData = null;
    let ratings = [];
    let token = localStorage.getItem('token');

    async function fetchGameData(scrollToReviews = false) {
      if (!gameId) {
        alert('Игра не указана');
        window.location.href = '/';
        return;
      }
      try {
        const res = await fetch(`/games/${gameId}`, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {}
        });
        if (!res.ok) {
          const error = await res.json().catch(() => ({}));
          throw new Error(error.error || 'Ошибка загрузки игры');
        }
        gameData = await res.json();
        // Проверяем, является ли ratings массивом, если нет — устанавливаем пустой массив
        ratings = Array.isArray(gameData.ratings) ? gameData.ratings : [];
        if (token) {
          const userRes = await fetch('/user-data', { headers: { 'Authorization': `Bearer ${token}` } });
          if (userRes.status === 401) {
            localStorage.removeItem('token');
            alert('Сессия истекла. Пожалуйста, войдите снова.');
            window.location.href = '/login.html';
            return;
          }
          if (userRes.ok) currentUser = await userRes.json();
        }
        await fetch(`/games/${gameId}/view`, { method: 'POST' }); // Увеличиваем счетчик просмотров
        renderLeftPanel();
        renderMain(scrollToReviews);
      } catch (err) {
        console.error('Ошибка загрузки данных:', err);
        alert('Ошибка загрузки данных: ' + err.message);
        window.location.href = '/';
      }
    }

    function renderLeftPanel() {
      const g = gameData;
      const left = document.getElementById('leftPanel');
      left.innerHTML = `
        <img class="descr-cover" src="${g.cover || '/default-cover.png'}" alt="Обложка" onerror="handleImageError(this)">
        <div class="descr-meta">
            <div class="descr-title">${g.title || g.name || 'Без названия'}</div>
            <div class="descr-meta-row">
                <span class="meta-label">Оценка:</span>
                <span>${getAvgRating(ratings).toFixed(1)} ★</span>
            </div>
            <div class="descr-meta-row">
                <span class="meta-label">Автор:</span>
                <span>${g.author || 'Неизвестно'}</span>
            </div>
            <div class="descr-meta-row">
                <span class="meta-label">Просмотры:</span>
                <span>${g.views || 0}</span>
            </div>
            <div class="descr-meta-row">
                <span class="meta-label">Жанр:</span>
                <span>${g.genre || '—'}</span>
            </div>
            <div class="descr-meta-row">
                <span class="meta-label">Теги:</span>
                <span class="descr-tags">${(g.tags || []).map(t => `<span class="descr-tag">${t}</span>`).join('') || '—'}</span>
            </div>
            <div class="descr-meta-row">
                <span class="meta-label">Дата:</span>
                <span>${g.upload_date || '—'}</span>
            </div>
            ${g.canEdit ? `<a href="edit-metadata.html?id=${g.id}" class="btn neon-btn descr-edit-btn">✏️ Редактировать</a>` : ''}
        </div>
    `;
    }

    function handleImageError(img) {
      // Отключаем обработчик onerror, чтобы избежать цикла
      img.onerror = null;
      // Если уже пытались загрузить default-cover.png, используем заглушку
      if (img.src.includes('default-cover.png')) {
        img.src = 'https://via.placeholder.com/150';
        console.error('default-cover.png не найден, использована заглушка');
      } else {
        img.src = '/default-cover.png';
      }
    }

    function renderMain(scrollToReviews = false) {
      const g = gameData;
      const main = document.getElementById('descrMain');
      let description = g.description || g.desc || 'Описание отсутствует.';
      const ratingCounts = [0, 0, 0, 0, 0, 0];
      ratings.forEach(r => {
        const val = Math.round(Number(r.rating));
        if (val >= 1 && val <= 5) ratingCounts[val]++;
      });
      const totalRatings = ratings.length;
      let bars = '';
      for (let i = 5; i >= 1; i--) {
        const count = ratingCounts[i];
        const percent = totalRatings ? (count / totalRatings * 100) : 0;
        bars += `
          <div class="rating-bar-row">
            <span class="rating-bar-label">${i} ★</span>
            <div class="rating-bar">
              <div class="rating-bar-inner rating-bar-${i}" style="width:${percent}%;"></div>
            </div>
            <span class="rating-bar-count">${count}</span>
          </div>
        `;
      }
      let reviewsHtml = '';
      if (ratings.length === 0) {
        reviewsHtml = `<div style="color:var(--text-secondary);margin-bottom:1.5em;">Пока нет отзывов.</div>`;
      } else {
        reviewsHtml = ratings.slice().reverse().map((r, idx) => `
          <div class="review-card" style="animation-delay:${0.05 * idx}s;">
            <div class="review-header">
              <span class="review-author">👤 ${r.user || 'Аноним'}</span>
              <span class="review-rating">★ ${r.rating}</span>
              <span class="review-date">${r.date ? new Date(r.date).toLocaleString() : ''}</span>
            </div>
            <div class="review-text">${r.comment ? escapeHtml(r.comment) : '<span style="color:var(--text-secondary)">Без комментария</span>'}</div>
          </div>
        `).join('');
      }
      let addReviewForm = '';
      const hasRated = ratings.some(r => r.user === currentUser?.username);
      if (token && currentUser && !hasRated) {
        addReviewForm = `
          <form class="add-review-form" id="addReviewForm">
            <label>Ваша оценка (1-5): <input type="number" name="rating" min="1" max="5" required></label>
            <label>Комментарий:<br>
              <textarea name="comment" maxlength="500" placeholder="Ваш отзыв..."></textarea>
            </label>
            <button type="submit">Оставить отзыв</button>
          </form>
        `;
      } else if (!token) {
        addReviewForm = `<div style="color:var(--text-secondary);margin-top:1.5em;">Войдите, чтобы оставить отзыв.</div>`;
      } else if (hasRated) {
        addReviewForm = `<div style="color:var(--text-secondary);margin-top:1.5em;">Вы уже оставили отзыв.</div>`;
      }
      main.innerHTML = `
        <div class="descr-author">Автор: ${g.author || '—'}</div>
        <div class="descr-description">${escapeHtml(description)}</div>
        <div class="rating-summary-block">
          <div class="rating-summary-row">
            <span class="rating-big-value">${getAvgRating(ratings).toFixed(1)}</span>
            <span class="rating-star-big">★</span>
            <div class="rating-bars">${bars}</div>
          </div>
          <div style="color:var(--text-secondary);font-size:1.05em;">Всего отзывов: ${totalRatings}</div>
        </div>
        <div class="reviews-section" id="reviewsSection">
          <div class="reviews-title">Отзывы игроков</div>
          <div id="reviewsList">${reviewsHtml}</div>
          ${addReviewForm}
        </div>
      `;
      const form = document.getElementById('addReviewForm');
      if (form) {
    form.onsubmit = async function(e) {
    e.preventDefault();
    const rating = form.rating.value;
    const comment = form.comment.value;
    try {
        const resp = await fetch(`/games/${gameId}/rate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ rating, comment })
        });
        if (!resp.ok) {
            let errorMessage = 'Ошибка отправки отзыва';
            try {
                const data = await resp.json();
                errorMessage = data.error || data.message || `Ошибка сервера: ${resp.status}`;
            } catch (jsonErr) {
                errorMessage = `Ошибка сервера: ${resp.status} ${resp.statusText}`;
            }
            throw new Error(errorMessage);
        }
        await fetchGameData(true);
        setTimeout(() => {
            document.getElementById('reviewsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 200);
    } catch (err) {
        console.error('Ошибка отправки отзыва:', err);
        alert('Ошибка: ' + err.message);
    }
};
      }
      if (scrollToReviews) {
        setTimeout(() => {
          document.getElementById('reviewsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 200);
      }
    }

    function getAvgRating(ratings) {
      if (!ratings || !ratings.length) return 0;
      return ratings.reduce((s, r) => s + Number(r.rating), 0) / ratings.length;
    }

    function escapeHtml(str) {
      return (str || '').replace(/[&<>"']/g, function (m) {
        return ({
          '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[m];
      });
    }

    document.addEventListener('DOMContentLoaded', () => fetchGameData());
