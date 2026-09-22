import { chromium } from "@playwright/test";
const browser=await chromium.launch({channel:"msedge",headless:true});
const page=await browser.newPage();
await page.goto("http://127.0.0.1:3000",{timeout:120000});
console.log(await page.title());
await page.screenshot({path:"test-results/home-initial.png",fullPage:true});
await browser.close();

