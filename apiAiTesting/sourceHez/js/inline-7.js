
				{
					__sveltekit_platq5 = {
						base: "",
						assets: "https://z-cdn.chatglm.cn/z-ai/frontend/prod-fe-1.1.14"
					};

					const element = document.currentScript.parentElement;

					Promise.all([
						import("https://z-cdn.chatglm.cn/z-ai/frontend/prod-fe-1.1.14/_app/immutable/entry/start.CGpxAbln.js"),
						import("https://z-cdn.chatglm.cn/z-ai/frontend/prod-fe-1.1.14/_app/immutable/entry/app.FKbaCOL2.js")
					]).then(([kit, app]) => {
						kit.start(app, element);
					});
				}
			