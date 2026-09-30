"""Narrow actual Chrome follow-up for selected source/current permission distinction."""
import asyncio,json,subprocess,urllib.request,hashlib
from pathlib import Path
from playwright.async_api import async_playwright,expect
ROOT=Path(__file__).resolve().parents[1];URL='http://127.0.0.1:5164'
async def main():
 server=subprocess.Popen(['node','ui-server-v2.mjs'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE);checks=[]
 def passed(name):checks.append({'name':name,'passed':True})
 try:
  for _ in range(80):
   try:urllib.request.urlopen(URL+'/api/session',timeout=1).close();break
   except Exception:await asyncio.sleep(.1)
  async with async_playwright()as p:
   browser=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--disable-gpu']);page=await browser.new_page(viewport={'width':1440,'height':1050});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));await page.goto(URL);await expect(page.locator('#status')).to_contain_text('CURRENT');await page.locator('#order').select_option('SO-B');await expect(page.locator('#minimal')).to_be_visible();await expect(page.locator('#status')).to_contain_text('CURRENT SOURCE VIEW');await expect(page.locator('#status')).to_contain_text('rev 4 / CURRENT permission projection');passed('Current minimal branch explicitly labels selected source revision4 and current Service permission')
   await page.locator('#revision').select_option('3');await expect(page.locator('#status')).to_contain_text('HISTORICAL SOURCE VIEW');await expect(page.locator('#status')).to_contain_text('rev 3 / CURRENT permission projection');await expect(page.locator('#status')).to_contain_text('Service');passed('Historical minimal branch explicitly separates selected source revision3 from current Service permission')
   data=await page.evaluate("async()=>await(await fetch('/api/order?order=SO-B&revision=3')).json()");assert sorted(data)==['owner_role','status'];passed('Historical SO-B Service API remains exactly status/owner_role without added revision or role metadata')
   await page.locator('#role').select_option('Authorized Commercial Review');await expect(page.locator('#notes')).to_contain_text('Fictional commercial-only');await page.locator('#notes button').click();await expect(page.locator('#source-evidence')).to_contain_text('SYNTHETIC-B-CANARY');await page.locator('#role').select_option('Service');await expect(page.locator('#minimal')).to_be_visible();await expect(page.locator('#status')).to_contain_text('HISTORICAL SOURCE VIEW');assert await page.locator('#desk').is_hidden();assert 'SYNTHETIC-B-CANARY'not in await page.content();assert 'Fictional commercial-only'not in await page.content();assert await page.locator('#lines tr').count()==0;assert await page.locator('.receipt-row').count()==0;passed('Historical role downgrade still erases restricted source/receipt DOM while retaining honest selected revision')
   image=ROOT/'docs/ui-refit/08-service-minimal.png';await page.screenshot(path=str(image),full_page=True);assert not errors;passed('No browser errors; actual historical minimal branch screenshot recaptured');await browser.close()
  record={'path':str(image.relative_to(ROOT)),'sha256':hashlib.sha256(image.read_bytes()).hexdigest(),'bytes':image.stat().st_size,'origin':'actual Chrome historical SO-B Service revision3 screenshot'}
  evidence={'kind':'Narrow actual Chrome minimal branch follow-up','executed_in_CI':False,'model_calls':0,'checks':checks,'passed':len(checks),'failed':0,'selected_source_revision':3,'permission_projection':'current session Service','api_fields':['status','owner_role'],'media':[record]};(ROOT/'evidence/ui-refit-minimal-branch.json').write_text(json.dumps(evidence,indent=2)+'\n')
  baseline=ROOT/'evidence/ui-refit-browser-checks.json';data=json.loads(baseline.read_text());data['media']=[record if r['path']==record['path']else r for r in data['media']];data['narrow_followup']='evidence/ui-refit-minimal-branch.json; only screenshot08 recaptured, original21 checks retained';baseline.write_text(json.dumps(data,indent=2,ensure_ascii=False)+'\n');print(json.dumps({'narrow_chrome_checks':len(checks),'recaptured_screenshots':1,'model_calls':0}))
 finally:server.terminate();server.wait(timeout=5)
if __name__=='__main__':asyncio.run(main())
