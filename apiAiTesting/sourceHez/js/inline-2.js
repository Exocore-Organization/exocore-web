
			let metrics = {};
			const observer = new PerformanceObserver((list) => {
				const entries = list.getEntries();

				entries.forEach((entry) => {
					// 根据不同的entry类型处理不同的性能指标
					switch (entry.entryType) {
						case 'navigation':
							{
								const navEntry = entry;
								metrics = {
									...metrics,
									dns: navEntry.domainLookupEnd - navEntry.domainLookupStart,
									response: navEntry.responseEnd - navEntry.responseStart,
									dom_parse: navEntry.domInteractive - navEntry.responseEnd,
									dom_ready: navEntry.domContentLoadedEventEnd - navEntry.fetchStart,
									resource: navEntry.domComplete - navEntry.domContentLoadedEventEnd,
									first_interactive: navEntry.domInteractive - navEntry.fetchStart,
									first_byte: navEntry.responseStart - navEntry.domainLookupStart,
									loaded: navEntry.loadEventEnd - navEntry.fetchStart
								};
								sessionStorage.setItem('performance', JSON.stringify(metrics));
								// 发送性能指标到阿里云日志服务
							}
							break;

						case 'paint':
							if (entry.name === 'first-paint') {
								metrics = {
									...metrics,
									first_paint: entry.startTime
								};
								sessionStorage.setItem('performance', JSON.stringify(metrics));
							}
							if (entry.name === 'first-contentful-paint') {
								metrics = {
									...metrics,
									first_contentful_paint: entry.startTime
								};
								sessionStorage.setItem('performance', JSON.stringify(metrics));
							}
							break;
					}
				});
			});

			// 观察的性能指标类型
			observer.observe({
				entryTypes: ['navigation', 'paint']
			});
		