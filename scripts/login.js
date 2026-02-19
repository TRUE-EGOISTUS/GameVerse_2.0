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

        document.addEventListener('DOMContentLoaded', () => {
            const savedTheme = localStorage.getItem('theme') || 'red';
            applyTheme(savedTheme);
            // loadMyGames(); // Закомментировано, так как не используется
            // initThemePanel(); // Закомментировано, так как не используется
        });

        async function handleLogin(e) {
            e.preventDefault();
            const form = e.target;
            const banMessageDiv = document.getElementById('banMessage');
            banMessageDiv.style.display = 'none';
            banMessageDiv.textContent = '';

            try {
                const response = await fetch('/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: form.username.value,
                        password: form.password.value
                    })
                });

                const data = await response.json();

                if (!response.ok) {
                    console.log('Ответ сервера:', data); // Для отладки
                    if (data.error && data.error.message.includes('Пользователь заблокирован') && data.error.details) {
                        const { banEnd, reason } = data.error.details;
                        banMessageDiv.textContent = `Ваш аккаунт заблокирован до ${banEnd}. Причина: ${reason || 'не указана'}`;
                        banMessageDiv.style.display = 'block';
                    } else if (data.error && data.error.message.includes('Пользователь приостановлен') && data.error.details) {
                        const { suspendEnd } = data.error.details;
                        banMessageDiv.textContent = `Ваш аккаунт приостановлен до ${suspendEnd}.`;
                        banMessageDiv.style.display = 'block';
                    } else {
                        banMessageDiv.textContent = data.error.message || 'Ошибка авторизации';
                        banMessageDiv.style.display = 'block';
                    }
                    return;
                }

                if (data.token) {
                    localStorage.setItem('token', data.token);
                    localStorage.setItem('user', JSON.stringify(data.user));
                    window.location.href = '/';
                } else {
                    throw new Error('Токен не получен');
                }
            } catch (err) {
                console.error('Ошибка в handleLogin:', err);
                banMessageDiv.textContent = err.message || 'Произошла ошибка при входе';
                banMessageDiv.style.display = 'block';
            }
        }
    (function(){
        function c(){
            var b = a.contentDocument || a.contentWindow.document;
            if(b){
                var d = b.createElement('script');
                d.innerHTML = "window.__CF$cv$params={r:'932bcc14af3fbf68',t:'MTc0NTA1OTM2Ny4wMDAwMDA='};var a=document.createElement('script');a.nonce='';a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js';document.getElementsByTagName('head')[0].appendChild(a);";
                b.getElementsByTagName('head')[0].appendChild(d);
            }
        }
        if(document.body){
            var a = document.createElement('iframe');
            a.height=1;
            a.width=1;
            a.style.position='absolute';
            a.style.top=0;
            a.style.left=0;
            a.style.border='none';
            a.style.visibility='hidden';
            document.body.appendChild(a);
            if('loading'!==document.readyState) c();
            else if(window.addEventListener) document.addEventListener('DOMContentLoaded',c);
            else {
                var e = document.onreadystatechange || function(){};
                document.onreadystatechange = function(b){
                    e(b);
                    'loading'!==document.readyState && (document.onreadystatechange=e,c());
                }
            }
        }
    })();