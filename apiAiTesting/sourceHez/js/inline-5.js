
			// 炫酷的控制台介绍 - 根据语言显示
			(function () {
				// 检测用户语言偏好
				const userLang = navigator.language || navigator.userLanguage;
				const isChinese =
					userLang.startsWith('zh') ||
					userLang.includes('CN') ||
					userLang.includes('TW') ||
					userLang.includes('HK');

				// 共同的 ASCII Logo
				const logoLines = [
					'%c███████╗     █████╗ ██╗',
					'%c╚══███╔╝    ██╔══██╗██║',
					'%c  ███╔╝     ███████║██║',
					'%c ███╔╝      ██╔══██║██║',
					'%c███████╗ ██╗██║  ██║██║',
					'%c╚══════╝ ╚═╝╚═╝  ╚═╝╚═╝'
				];
				const logoColors = [
					'color: #ff6b6b; font-family: monospace; font-size: 12px;',
					'color: #4ecdc4; font-family: monospace; font-size: 12px;',
					'color: #45b7d1; font-family: monospace; font-size: 12px;',
					'color: #f9ca24; font-family: monospace; font-size: 12px;',
					'color: #ff9ff3; font-family: monospace; font-size: 12px;',
					'color: #6c5ce7; font-family: monospace; font-size: 12px;'
				];

				if (isChinese) {
					// 中文版本
					console.log(
						'%c🚀 欢迎来到 Z.ai 🚀',
						'color: #00d4ff; font-size: 20px; font-weight: bold; text-shadow: 0 0 10px #00d4ff;'
					);
					logoLines.forEach((line, index) => console.log(line, logoColors[index]));
					console.log('');
					console.log(
						'%c✨ 基于开源GLM模型的智能AI助手',
						'color: #a29bfe; font-size: 14px; font-weight: bold;'
					);
					console.log('%c🧠 支持文本生成、推理和深度研究', 'color: #fd79a8; font-size: 12px;');
					console.log('%c🌍 为中英文用户量身定制', 'color: #00b894; font-size: 12px;');
					console.log('%c💡 免费开源的ChatGPT替代方案', 'color: #fdcb6e; font-size: 12px;');
					console.log('');
					console.log('%c---', 'color: #ddd;');
					console.log(
						'%c由 ❤️ 和大量 ☕ 驱动',
						'color: #e84393; font-size: 11px; font-style: italic;'
					);
					console.log('');
					console.log(
						'%c🚀 加入我们！我们正在招聘优秀人才！',
						'color: #00b894; font-size: 13px; font-weight: bold;'
					);
					console.log(
						'%c💼 查看职位: https://zhipu-ai.jobs.feishu.cn/s/stmyTm5lxaU',
						'color: #0984e3; font-size: 12px; text-decoration: underline;'
					);
				} else {
					// 英文版本
					console.log(
						'%c🚀 Welcome to Z.ai 🚀',
						'color: #00d4ff; font-size: 20px; font-weight: bold; text-shadow: 0 0 10px #00d4ff;'
					);
					logoLines.forEach((line, index) => console.log(line, logoColors[index]));
					console.log('');
					console.log(
						'%c✨ Advanced AI assistant powered by open-source GLM models',
						'color: #a29bfe; font-size: 14px; font-weight: bold;'
					);
					console.log(
						'%c🧠 Supports text generation, reasoning, and deep research',
						'color: #fd79a8; font-size: 12px;'
					);
					console.log(
						'%c🌍 Tailored for both English and Chinese users',
						'color: #00b894; font-size: 12px;'
					);
					console.log(
						'%c💡 Free and open-source ChatGPT alternative',
						'color: #fdcb6e; font-size: 12px;'
					);
					console.log('');
					console.log('%c---', 'color: #ddd;');
					console.log(
						'%cPowered by ❤️ and lots of ☕',
						'color: #e84393; font-size: 11px; font-style: italic;'
					);
					console.log('');
					console.log(
						'%c🚀 Join us! We are hiring talented people!',
						'color: #00b894; font-size: 13px; font-weight: bold;'
					);
					console.log(
						'%c💼 View jobs: https://zhipu-ai.jobs.feishu.cn/s/stmyTm5lxaU',
						'color: #0984e3; font-size: 12px; text-decoration: underline;'
					);
				}
			})();
		