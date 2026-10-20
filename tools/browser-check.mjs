import {chromium} from '@playwright/test';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox']});
const results=[];const errors=[];
try{
 for(const character of ['naruto','sasuke','sakura']){
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>errors.push(String(e)));await page.goto('http://127.0.0.1:5178');await page.locator('#new').click();await page.locator(`[data-character="${character}"]`).click();await page.waitForFunction(()=>window.__idle?.snapshot().phase==='explorando');
  const start=await page.evaluate(()=>window.__idle.snapshot());await page.waitForTimeout(1200);const moved=await page.evaluate(()=>window.__idle.snapshot());assert.ok(Math.hypot(start.hero.x-moved.hero.x,start.hero.y-moved.hero.y)>10);
  await page.locator('#pause').click();await page.waitForTimeout(200);const paused=await page.evaluate(()=>window.__idle.snapshot());await page.waitForTimeout(400);const still=await page.evaluate(()=>window.__idle.snapshot());assert.deepEqual(paused.hero,still.hero);await page.locator('#pause').click();
  await page.waitForFunction(()=>window.__idle.snapshot().phase==='iniciando combate',{},{timeout:60000});const encounter=await page.evaluate(()=>window.__idle.snapshot());await page.waitForFunction(()=>window.__idle.snapshot().phase==='combatendo');const combat=await page.evaluate(()=>window.__idle.snapshot());assert.equal(encounter.scene,combat.scene);assert.deepEqual(encounter.hero,combat.hero);
  await page.screenshot({path:`reports/${character}-combat.png`,fullPage:true});await page.waitForFunction(()=>window.__idle.snapshot().kills>0,{},{timeout:20000});await page.waitForFunction(()=>window.__idle.snapshot().phase==='explorando');const victory=await page.evaluate(()=>window.__idle.snapshot());assert.equal(victory.kills,1);
  await page.reload();await page.locator('#continue').click();await page.waitForFunction(()=>window.__idle?.snapshot().kills===1);await page.screenshot({path:`reports/${character}-hunt.png`,fullPage:true});
  results.push({character,movement:true,pause:true,sameScene:true,sameEncounterPosition:true,victory:true,returnToExploration:true,reload:true});await page.close();
 }
 assert.deepEqual(errors,[]);await fs.writeFile('reports/browser-validation.json',JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));
}finally{await browser.close()}
