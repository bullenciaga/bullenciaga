import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {ownerKey,testWallet} from './fixture.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.CAMPAIGN_PLAYWRIGHT||'playwright');
const base=process.env.CAMPAIGN_TEST_BASE||'http://127.0.0.1:8839',out=process.env.CAMPAIGN_SCREENSHOTS||'/tmp/campaign-screens';await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CAMPAIGN_CHROME||undefined});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1050},deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  const capture=async name=>{await page.screenshot({path:`${out}/${name}.png`,fullPage:!name.includes('mobile')});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name}: horizontal overflow`);};
  await page.goto(base+'/campaigns');await page.getByRole('heading',{name:'Good company. Better odds.'}).waitFor();await page.locator('.hero-art img').evaluate(img=>img.decode());await capture('public-desktop');
  await page.goto(base+'/campaigns/preview');await page.getByRole('heading',{name:'A little House favour.'}).waitFor();await page.locator('.detail-image').evaluate(img=>img.decode());await capture('campaign-desktop');
  await page.setViewportSize({width:390,height:844});await capture('campaign-mobile');await page.getByRole('button',{name:/Put your name in the room/}).click();await page.getByRole('button',{name:'Claim entries',exact:true}).first().click();assert.match(await page.locator('#toast').innerText(),/preview/);
  await page.setViewportSize({width:1440,height:1050});await page.goto(base+'/campaigns/admin');await page.locator('input[name=key]').fill(ownerKey);await page.getByRole('button',{name:'Open the studio'}).click();await page.getByRole('heading',{name:'Participation, by design.'}).waitFor();await capture('studio-overview');
  await page.getByRole('button',{name:'Use this template'}).first().click();await page.locator('input[name=title]').fill('Browser acceptance invitation');await page.locator('input[name=slug]').fill('browser-acceptance');
  const start=new Date(Date.now()-3600000);await page.locator('input[name=startsAt]').fill(new Date(start-start.getTimezoneOffset()*60000).toISOString().slice(0,16));
  await page.locator('textarea[name=rules]').fill('This is a local test only. Free participation. Only approved entries count. No real prizes are awarded. The fixture tests our full entry flow.');await page.locator('textarea[name=eligibility]').fill('Local automated browser test participants only.');await page.locator('textarea[name=privacy]').fill('Local fixture data stays in an in-memory SQLite database and is destroyed at shutdown.');
  await capture('studio-builder');await page.getByRole('button',{name:'Save draft'}).click();await page.getByRole('button',{name:'Publish campaign'}).waitFor();await page.getByRole('button',{name:'Publish campaign'}).click();await page.getByRole('button',{name:'Pause entries'}).waitFor();
  await page.getByRole('button',{name:'Entry review',exact:true}).click();await page.getByRole('heading',{name:'All clear here.'}).waitFor();await capture('studio-review');
  // A generated fixture wallet exercises real challenge signing. No user wallet
  // or network transaction is involved.
  const wallet=testWallet();await page.exposeFunction('fixtureSign',text=>wallet.sign(text));
  await page.addInitScript(({address})=>{window.phantom={solana:{publicKey:{toString:()=>address},connect:async()=>{},signMessage:async bytes=>({signature:Uint8Array.from(atob((await window.fixtureSign(new TextDecoder().decode(bytes))).replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0))})}};},{address:wallet.address});
  await page.goto(base+'/campaigns/browser-acceptance');await page.getByRole('button',{name:'Sign in to take part'}).click();await page.getByRole('button',{name:'Sign in with phantom'}).click();await page.locator('#consent').waitFor();await page.locator('#consent').check();await page.getByRole('button',{name:'Join the campaign'}).click();await page.getByText('You’re in. Choose your actions below.').waitFor();
  await page.locator('[data-expand="free"]').click();await page.locator('[data-claim="free"]').click();await page.locator('[data-claim="free"]').waitFor();assert.equal(await page.locator('[data-claim="free"]').isDisabled(),true);
  await page.locator('[data-expand="ig"]').click();await page.locator('[data-evidence="ig"]').fill('Instagram @fixture-only; local manual proof for browser acceptance.');await page.locator('[data-claim="ig"]').click();await page.locator('[data-claim="ig"]').waitFor();assert.equal(await page.locator('[data-claim="ig"]').isDisabled(),true);await capture('participant-entered');
  await page.goto(base+'/campaigns/admin');await page.locator('input[name=key]').fill(ownerKey);await page.getByRole('button',{name:'Open the studio'}).click();await page.locator('.side-campaign').filter({hasText:'Browser acceptance invitation'}).click();await page.getByRole('button',{name:'Entry review',exact:true}).click();await page.getByRole('button',{name:'Approve',exact:true}).click();await page.getByRole('heading',{name:'All clear here.'}).waitFor();
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Campaign builder',exact:true}).click();await capture('studio-mobile');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({ok:true,screenshots:out,browserErrors:errors,flows:['landing','detail','responsive','example-no-writes','owner-unlock','draft-create','publish','wallet-sign-in','rule-consent','free-entry','evidence-submission','owner-review']}));
}finally{await browser.close();}
