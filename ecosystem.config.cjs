// pm2 process file: `pm2 start ecosystem.config.cjs`
module.exports = {
	apps: [
		{
			name: "gibhub",
			cwd: __dirname,
			script: "node_modules/.bin/next",
			args: "start -p 8266",
			env: { NODE_ENV: "production" },
			max_restarts: 10,
			restart_delay: 3000,
			time: true,
		},
	],
};
