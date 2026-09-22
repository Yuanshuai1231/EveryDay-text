import { defineConfig } from "@playwright/test";
export default defineConfig({
 testDir:"./tests/e2e",fullyParallel:false,workers:1,timeout:90000,expect:{timeout:15000},reporter:"list",
 use:{baseURL:"http://127.0.0.1:3000",trace:"retain-on-failure",launchOptions:{channel:process.platform==="win32"?"msedge":undefined}},
 webServer:{command:"pnpm dev --hostname 127.0.0.1 --port 3000",url:"http://127.0.0.1:3000",reuseExistingServer:!process.env.CI,timeout:120000},
});

