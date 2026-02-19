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
    const root = document.documentElement;
    root.style.setProperty('--scrollbar-thumb-color', getScrollbarThumbColor(theme));
}

function getThemeColor(theme) { return { 'red': '#ff0000', 'blue': 'rgba(33, 150, 243, 0.3)', 'green': 'rgba(76, 175, 80, 0.3)', 'yellow': 'rgba(255, 215, 0, 0.3)', 'purple': 'rgba(156, 39, 176, 0.3)', 'rgb': 'rgba(102, 204, 102, 0.3)' }[theme] || '#ff416c'; }
function getThemeSecondaryColor(theme) { return { 'red': '#ff4b2b', 'yellow': '#ffec80', 'green': '#8bc34a', 'blue': '#00bcd4', 'purple': '#ba68c8' }[theme] || '#ff4b2b'; }
function getThemeGlowColor(theme) { return { 'red': 'rgba(255, 65, 108, 0.8)', 'yellow': 'rgba(255, 215, 0, 0.8)', 'green': 'rgba(76, 175, 80, 0.8)', 'blue': 'rgba(33, 150, 243, 0.8)', 'purple': 'rgba(156, 39, 176, 0.8)', 'rgb': 'rgba(255, 65, 108, 0.8)' }[theme] || 'rgba(255, 65, 108, 0.8)'; }
function getTextColor(theme) { return '#ffffff'; }
function getBackgroundGradient(theme) { return { 'red': 'linear-gradient(135deg, #1a1a1a, #3a1c26)', 'yellow': 'linear-gradient(135deg, #1a1a1a, #3a3a1c)', 'green': 'linear-gradient(135deg, #1a1a1a, #1c3a2e)', 'blue': 'linear-gradient(135deg, #1a1a1a, #1c2a3a)', 'purple': 'linear-gradient(135deg, #1a1a1a, #2a1c3a)', 'rgb': 'linear-gradient(45deg, #ff6666, #66b3ff, #66cc66)' }[theme] || 'linear-gradient(135deg, #1a1a1a, #3a1c26)'; }
function getHoverShadowColor(theme) { return { 'red': 'rgba(255, 65, 108, 0.5)', 'yellow': 'rgba(255, 215, 0, 0.5)', 'green': 'rgba(76, 175, 80, 0.5)', 'blue': 'rgba(33, 150, 243, 0.5)', 'purple': 'rgba(156, 39, 176, 0.5)', 'rgb': 'rgba(255, 65, 108, 0.5)' }[theme] || 'rgba(255, 65, 108, 0.5)'; }
function getScrollbarThumbColor(theme) { return { 'red': '#ff416c', 'yellow': '#ffd700', 'green': '#4caf50', 'blue': '#2196f3', 'purple': '#9c27b0', 'rgb': 'linear-gradient(45deg, #ff6666, #66b3ff, #66cc66)' }[theme] || '#ff416c'; }

function showLoading() { document.getElementById('preloader').style.display = 'flex'; }
function hideLoading() { document.getElementById('preloader').style.display = 'none'; }

function renderReviews(reviews) {
    const container = document.getElementById('reviewsList');
    container.innerHTML = reviews.length > 0 ? reviews.map(review => `
        <div class="review-card">
            <div class="review-header">
                <span class="review-author">👤 ${review.user || 'Аноним'}</span>
                <span class="review-rating">⭐ ${review.rating || 0}/5</span>
                <span class="review-date">${new Date(review.date || Date.now()).toLocaleDateString()}</span>
            </div>
            <p class="review-text">${review.comment || 'Без комментария'}</p>
        </div>
    `).join('') : '<p>Отзывов пока нет</p>';
}

async function loadAnalytics() {
    showLoading();
    const gameId = new URLSearchParams(window.location.search).get('id');
    if (!gameId) {
        alert('Игра не указана');
        window.location.href = 'dashboard.html';
        return;
    }

    const token = localStorage.getItem('token');
    if (!token) {
        alert('Необходима авторизация');
        window.location.href = '/login.html';
        return;
    }

    try {
        const [analyticsRes, reviewsRes, gameRes] = await Promise.all([
            fetch(`/game-analytics/${gameId}`, { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }),
            fetch(`/games/${gameId}/reviews`, { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } }).catch(err => ({ ok: false, status: 500, json: async () => ({ error: err.message }) })),
            fetch(`/games/${gameId}`, { headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' } })
        ]);

        if (analyticsRes.status === 401 || gameRes.status === 401) {
            localStorage.removeItem('token');
            alert('Сессия истекла. Пожалуйста, войдите снова.');
            window.location.href = '/login.html';
            return;
        }

        if (!analyticsRes.ok) throw new Error(`Ошибка загрузки аналитики: ${analyticsRes.status}`);
        if (!gameRes.ok) throw new Error(`Ошибка загрузки данных игры: ${gameRes.status}`);

        const analytics = await analyticsRes.json();
        const game = await gameRes.json();
        let reviews = [];
        if (reviewsRes.ok) reviews = await reviewsRes.json();
        else console.warn('Не удалось загрузить отзывы:', await reviewsRes.json());

        document.getElementById('gameTitle').textContent = `📈 Статистика игры: ${game.title || 'Без названия'}`;
        document.getElementById('viewsCount').textContent = analytics.views || 0;
        document.getElementById('avgRating').textContent = (analytics.averageRating || 0).toFixed(1);
        document.getElementById('reviewsCount').textContent = analytics.ratings || 0;

        const ctx = document.getElementById('statsChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Просмотры', 'Средний рейтинг', 'Количество отзывов'],
                datasets: [{
                    label: 'Статистика',
                    data: [analytics.views || 0, analytics.averageRating || 0, analytics.ratings || 0],
                    backgroundColor: ['#36A2EB80', '#FFCE5680', '#4BC0D080'],
                    borderColor: ['#36A2EB', '#FFCE56', '#4BC0D0'],
                    borderWidth: 1
                }]
            },
            options: {
                scales: { y: { beginAtZero: true }, x: { title: { display: true, text: 'Метрики' } } },
                plugins: { legend: { display: false } }
            }
        });

        renderReviews(reviews);
    } catch (err) {
        console.error('Ошибка:', err);
        alert('Не удалось загрузить данные аналитики: ' + err.message);
        window.location.href = 'dashboard.html';
    } finally {
        hideLoading();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme') || 'red';
    applyTheme(savedTheme);
    loadAnalytics();
});