
			// On page load or when changing themes, best to add inline in `head` to avoid FOUC
			const initTheme = () => {
				const metaThemeColorTag = document.querySelector('meta[name="theme-color"]');
				// 取用户浏览器设置的主题
				// const prefersTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

				const prefersTheme = 'light';

				if (!localStorage?.theme) {
					localStorage.theme = prefersTheme;
				}

				if (localStorage.theme === 'system') {
					document.documentElement.classList.add(prefersTheme);
					metaThemeColorTag.setAttribute(
						'content',
						prefersTheme === 'light' ? '#F4F6F8' : '#141618'
					);
				} else if (localStorage.theme === 'light') {
					document.documentElement.classList.add('light');
					metaThemeColorTag.setAttribute('content', '#F4F6F8');
				} else {
					document.documentElement.classList.add('dark');
					metaThemeColorTag.setAttribute('content', '#141618');
				}

				// window.matchMedia('(prefers-color-scheme: dark)').addListener((e) => {
				// 	if (localStorage.theme === 'system') {
				// 		if (e.matches) {
				// 			document.documentElement.classList.add('dark');
				// 			document.documentElement.classList.remove('light');
				// 			metaThemeColorTag.setAttribute('content', '#141618');
				// 		} else {
				// 			document.documentElement.classList.add('light');
				// 			document.documentElement.classList.remove('dark');
				// 			metaThemeColorTag.setAttribute('content', '#F4F6F8');
				// 		}
				// 	}
				// });

				function setSplashImage() {
					const logo = document.getElementById('logo');
					const isDarkMode = document.documentElement.classList.contains('dark');
					const splashContainer = document.getElementById('splash-screen');

					if (isDarkMode) {
						const darkImage = new Image();
						darkImage.src = 'https://z-cdn.chatglm.cn/z-ai/static/logo.svg';
						splashContainer.style.backgroundColor = '#141618';

						darkImage.onload = () => {
							logo.src = 'https://z-cdn.chatglm.cn/z-ai/static/logo.svg';
							logo.style.filter = ''; // Ensure no inversion is applied if splash-dark.png exists
						};

						darkImage.onerror = () => {
							logo.style.filter = 'invert(1)'; // Invert image if splash-dark.png is missing
						};
					} else {
						splashContainer.style.backgroundColor = '#F4F6F8';
					}
				}

				// Runs after classes are assigned
				window.addEventListener('DOMContentLoaded', setSplashImage, { once: true });
			};
			initTheme();
		