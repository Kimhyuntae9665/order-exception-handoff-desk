"""Actual slower native UI workflow, explicit awaited frame captures; no inference."""
import asyncio,hashlib,json,os,shutil,subprocess,tempfile,time,urllib.request
from pathlib import Path
from playwright.async_api import async_playwright,expect
ROOT=Path(__file__).resolve().parents[1];URL='http://127.0.0.1:5142'
async def main():
 original=ROOT/'fixtures/source-v1.json';source_sha=hashlib.sha256(original.read_bytes()).hexdigest();stages=[]
 with tempfile.TemporaryDirectory(prefix='p14-media-owned-')as directory:
  source=Path(directory)/'source.json';shutil.copyfile(original,source);frames=Path(directory)/'frames';frames.mkdir();server=subprocess.Popen(['node','--input-type=module','-e',"import {createDesk} from './server.mjs';(await createDesk({sourcePath:process.env.P14_SOURCE})).listen(5142,'127.0.0.1')"],cwd=ROOT,env=dict(os.environ,P14_SOURCE=str(source)),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
  try:
   for _ in range(80):
    try:urllib.request.urlopen(URL+'/api/session',timeout=1).close();break
    except Exception:await asyncio.sleep(.1)
   async with async_playwright()as p:
    browser=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--disable-gpu']);page=await browser.new_page(viewport={'width':1440,'height':1050});errors=[];page.on('pageerror',lambda e:errors.append(str(e)));index=0
    async def hold(name,target=None):
     nonlocal index
     if target:await page.locator(target).scroll_into_view_if_needed()
     start=index
     for _ in range(8):await page.screenshot(path=str(frames/f'{index:04d}.png'));index+=1;await asyncio.sleep(.5)
     stages.append({'name':name,'first_frame':start,'last_frame':index-1,'video_start_seconds':start/2,'video_end_seconds':index/2,'actual_status_text':await page.locator('#status').text_content(),'actual_visible_heading':await page.locator('#heading').text_content(),'source_block_changes':False})
    await page.goto(URL);await expect(page.locator('#heading')).to_contain_text('SO-A');await hold('SO-A current schedule lines and unknown confirmation')
    await page.locator('#order').select_option('SO-C');await expect(page.locator('#queue')).to_contain_text('BLK-C2');await hold('SO-C current source events and active BLK-C2','#event-summary')
    await page.locator('#revision').select_option('3');await expect(page.locator('#authority')).to_have_text('HISTORICAL SOURCE VIEW');await expect(page.locator('#review')).to_be_disabled();await hold('Historical revision3 cannot review current instance','#status');await hold('Historical BLK-C1 receipt and event clear','#history')
    await page.locator('#revision').select_option('4');await expect(page.locator('#authority')).to_have_text('CURRENT SOURCE VIEW');await page.locator('#confirm').check();await page.locator('#review').click();await expect(page.locator('#status')).to_contain_text('LOCAL REVIEW RECORDED');await hold('First local review acknowledgment','#status');await hold('Current executed receipt beside historical seeded receipt','#history')
    await page.locator('#confirm').check();await page.locator('#review').click();await expect(page.locator('#status')).to_contain_text('existing receipt');assert await page.locator('#history p').count()==2;await hold('Repeated acknowledgment returns existing receipt','#status')
    await page.locator('#role').select_option('Authorized Commercial Review');await expect(page.locator('#heading')).to_contain_text('SO-C');await page.locator('#order').select_option('SO-B');await expect(page.locator('#notes')).to_contain_text('Fictional commercial-only');await hold('Explicit fictional commercial role view','#status')
    await page.locator('#role').select_option('Service');await expect(page.locator('#minimal')).to_be_visible();assert await page.locator('#desk').is_hidden();assert 'Fictional commercial-only'not in await page.locator('body').inner_text();await hold('Service role downgrade exposes only permitted status and owner','#minimal')
    await page.locator('#order').select_option('SO-C');await expect(page.locator('#heading')).to_contain_text('SO-C');await page.locator('#confirm').check();source.rename(source.with_suffix('.held'));await page.locator('#refresh').click();await expect(page.locator('#status')).to_contain_text('authority revoked');await expect(page.locator('#review')).to_be_disabled();await expect(page.locator('#receipt')).to_be_disabled();await hold('Missing isolated source revokes authority and fresh actions','#status');source.with_suffix('.held').rename(source);assert not errors
    await browser.close()
   destination=ROOT/'docs/cpu-native-demo.mp4';subprocess.run(['ffmpeg','-y','-framerate','2','-i',str(frames/'%04d.png'),'-c:v','libx264','-crf','25','-pix_fmt','yuv420p',str(destination)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration:stream=nb_frames,r_frame_rate','-of','json',str(destination)]));assert int(probe['streams'][0]['nb_frames'])==index;assert float(probe['format']['duration'])==index/2
   out={'kind':'Actual native Chrome CPU workflow recapture; inspected transitions, no model calls','source_sha256':source_sha,'model_calls':0,'executed_in_CI':False,'frame_rate':2,'frame_count':index,'duration_seconds':index/2,'capture':'Each frame awaited from real browser state at half-second intervals; no generated UI or duplicate-frame insertion','stages':stages,'video':{'path':'docs/cpu-native-demo.mp4','bytes':destination.stat().st_size,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()},'original_png_end_states':'Separate15-check local browser evidence; these video stages are not additional CI tests'};(ROOT/'evidence/demo-transitions.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps({'actual_frames':index,'duration_seconds':index/2,'stages':len(stages),'model_calls':0}))
  finally:server.terminate();server.wait(timeout=5)
 assert hashlib.sha256(original.read_bytes()).hexdigest()==source_sha
if __name__=='__main__':asyncio.run(main())
