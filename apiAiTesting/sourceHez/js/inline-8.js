
			var token = localStorage.getItem('token');
			var base = window.WEBUI_BASE_URL || '';
			var lang = localStorage.locale ?? (navigator.language.includes('zh') ? 'zh-CN' : 'en-US');
			var config = {
				credentials: 'include',
				headers: {
					Accept: 'application/json',
					'Content-Type': 'application/json',
					...(token ? { Authorization: `Bearer ${token}` } : {}),
					'Accept-Language': lang
				}
			};

			window.GLOBAL_FETCHES = {
				session: fetch(`${base}/api/v1/auths/`, config).then(async (res) => {
					if (res.status === 401) {
						location.replace('/auth');
					}
					if (!res.ok) throw await res.json();
					return res.json();
				}),
				config: fetch(`${base}/api/config`, config).then(async (res) => {
					if (!res.ok) throw await res.json();
					return res.json();
				}),
				models: token && fetch(`${base}/api/models`, config),
				settings:
					token &&
					fetch(`${base}/api/v1/users/user/settings`, config).then(async (res) => {
						if (!res.ok) throw await res.json();
						return res.json();
					})
			};
		