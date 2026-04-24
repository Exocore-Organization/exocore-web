
			const env = location.hostname === 'chat.z.ai' ? 'prod' : 'pre';
			!(function (c, b, d, a) {
				c[a] || (c[a] = {});
				c[a] = {
					pid: 'j2c03hoppk@9a8be198b65ba4b',
					endpoint: 'https://j2c03hoppk-default-cn.rum.aliyuncs.com',
					// 设置环境信息，参考值：'prod' | 'gray' | 'pre' | 'daily' | 'local'
					env: env,
					// 设置路由模式， 参考值：'history' | 'hash'
					spaMode: 'history',
					collectors: {
						// 页面性能指标监听开关，默认开启
						perf: true,
						// WebVitals指标监听开关，默认开启
						webVitals: false,
						// Ajax监听开关，默认开启
						api: true,
						// 静态资源开关，默认开启
						staticResource: true,
						// JS错误监听开关，默认开启
						jsError: true,
						// 控制台错误监听开关，默认开启
						consoleError: false,
						// 用户行为监听开关，默认开启
						action: true
					},
					// 链路追踪配置开关，默认关闭
					tracing: false,
					parseViewName(url) {
						const pathname = new URL(url).pathname;
						if (!pathname) {
							return '/';
						}
						return pathname.replace(/(.*)\/[a-f0-9-]+$/g, '$1');
					},
					evaluateApi(options, response) {
						const traceId = response?.headers?.get?.('X-Trace-Id') || 'unknown';

						return {
							name: options.url.replace(/\/[a-f0-9-]{36}/g, '/**'),
							properties: {
								traceId
							}
						};
					}
				};
				with (b)
					with (body)
						with (insertBefore(createElement('script'), firstChild))
							setAttribute('crossorigin', '', (src = d));
			})(window, document, 'https://sdk.rum.aliyuncs.com/v2/browser-sdk.js', '__rum');
		