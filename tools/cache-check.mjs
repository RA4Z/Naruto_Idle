import {chromium} from '@playwright/test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:5178');await page.locator('#new').click();await page.locator('[data-character="naruto"]').click();await page.waitForFunction(()=>window.__idle?.snapshot());await page.locator('#pause').click();
 const entries=await page.evaluate(async()=>{const d=await fetch('/assets/characters/index.json').then(r=>r.json());return d.entities.filter(e=>e.capabilities.npc&&e.identity!=='unidentified'&&!e.starter).slice(0,16).map(e=>e.id);});
 for(const id of entries) {
  await page.locator('#library').click();await page.getByRole('searchbox',{name:'Buscar personagem'}).fill(id);await page.locator(`[data-entity="${id}"] [data-role="npc"]`).click();await page.locator('.entity-library').waitFor({state:'hidden'});
  const state=await page.evaluate(()=>window.__idle.snapshot());assert.ok(state.actorCache.residentEntities<=12);assert.ok(state.npcIds.length<=3);
 }
 const state=await page.evaluate(()=>window.__idle.snapshot());assert.deepEqual(errors,[]);
 const result={sequentialSelections:entries.length,residentActors:state.actorCache.residentEntities,estimatedActorTextureBytes:state.actorCache.estimatedTextureBytes,npcLimit:3,errors};await fs.writeFile('reports/entity-cache-validation.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally {await browser.close();}
