const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..');
let visibleNext=null,cancelledSpeech=0;
const context={
  window:{isSecureContext:true,speechSynthesis:{cancel(){cancelledSpeech++;},resume(){},speak(u){setTimeout(()=>u.onend(),1);}}},
  navigator:{mediaDevices:{}},SpeechSynthesisUtterance:class {constructor(text){this.text=text;}},
  document:{body:{dataset:{page:'dialogues'}},getElementById(){return null;},querySelectorAll(){return [];},querySelector(){return visibleNext?{closest(){return {querySelector(){return visibleNext;}};}}:null;}},
  localStorage:{getItem(){return null;},setItem(){}},location:{search:'',hash:'',hostname:'127.0.0.1',protocol:'http:'},
  URLSearchParams,setTimeout,clearTimeout,console,Intl,Blob,AbortController,crypto:webcrypto
};
context.window.SpeechSynthesisUtterance=context.SpeechSynthesisUtterance;
vm.createContext(context);
for(const name of ['data','vocab','dialogues','traps']) vm.runInContext(fs.readFileSync(path.join(root,`assets/${name}.js`),'utf8'),context);
const source=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');
assert.ok(!source.includes('webkitSpeechRecognition'),'do not use the broken browser speech service');
vm.runInContext(source.replace('\n  init();','\n  window.testAPI={compareSpoken,compareLiveSpoken,karaokeSentence,normalizeSpoken,ShadowRecognizer,PcmRecorder,pcmWav,shadowingMarkup,dialogueCard,pauseForShadowing,speak,setShadowing(value){shadowing=value;},setAuto(value){auto=value;},getAuto(){return auto;}};'),context);
const api=context.window.testAPI,target='皆さん、今日は新しい仲間を歓迎しましょう。';
assert.equal(api.compareSpoken(target,'皆さん今日は新しい仲間を歓迎しましょう').matched,true);
assert.equal(api.compareSpoken('サービス１２３','さーびす123').matched,true);
assert.equal(api.compareSpoken(target,'').empty,true);
assert.equal(api.compareSpoken('会社です','かいしゃです').matched,false,'do not invent kanji readings');
let diff=api.compareSpoken(target,'皆さん、今日は仲間を歓迎しましょう。');
assert.equal(diff.operations.find(x=>x.type==='missing').expected,'新しい');
assert.ok(api.compareSpoken(target,'皆さん、明日は新しい仲間を歓迎しましょう。').counts.different);
assert.ok(api.compareSpoken(target,'皆さん、今日は本当に新しい仲間を歓迎しましょう。').counts.extra);
assert.equal(api.compareLiveSpoken(target,'xyz').located,false);
assert.ok(api.compareLiveSpoken(target,'皆さん、明日').hasUncertain);
assert.equal(api.compareLiveSpoken(target,'皆さん、今日').hasUncertain,false,'revised hypotheses clear mismatches');
assert.ok(api.compareLiveSpoken(target,'皆').words.some(x=>x.status==='partial'||x.status==='same'));
const unsafe='<img src=x onerror=alert(1)>';
for(const phase of ['result','typing','listening']) {
  const state={phase,source:'manual',expected:target,transcript:unsafe,comparison:api.compareSpoken(target,unsafe)};
  assert.ok(!api.shadowingMarkup(state).includes('<img'));assert.ok(!api.karaokeSentence(target,state).includes('<img'));
}
assert.ok(api.shadowingMarkup({phase:'result',source:'manual',comparison:api.compareSpoken(target,target)}).includes('不是发音评分'));
assert.ok(api.shadowingMarkup({phase:'consent',key:'line:0'}).includes('不上传互联网'));
for(const dialogue of context.window.BUSINESS_DATA.dialogues) {
  const html=api.dialogueCard(dialogue);
  assert.equal((html.match(/data-shadow-listen=/g)||[]).length,dialogue.turns.length);
  assert.equal((html.match(/data-karaoke-line=/g)||[]).length,dialogue.turns.length);
  for(const turn of dialogue.turns) {
    const chars=Array.from(api.normalizeSpoken(turn.jp));
    for(const end of new Set([1,Math.ceil(chars.length/2),chars.length])) {
      const prefix=api.compareLiveSpoken(turn.jp,chars.slice(0,end).join(''));
      assert.equal(prefix.located,true);assert.equal(prefix.hasUncertain,false);
    }
  }
}
const segmenter=context.Intl.Segmenter;context.Intl.Segmenter=undefined;
assert.equal(api.compareSpoken('こんにちは。','こんにちは').matched,true);
assert.equal(api.compareLiveSpoken(target,'皆さん').located,true);context.Intl.Segmenter=segmenter;

function mock(options={}) {
  const states=[],timers=new Map(),calls=[];let id=0;
  const capture={closed:false,async start(){},async close(){this.closed=true;}};
  const controller=new api.ShadowRecognizer({local:true,supported:true,onChange:s=>states.push(s),
    captureFactory(onSamples){capture.feed=onSamples;return capture;},
    fetcher:async(url,request={})=>{calls.push({url,...request});return {ok:true,async json(){return url.endsWith('status')?{ready:true}:url.endsWith('cancel')?{cancelled:true}:{text:target};}};},
    setTimer(fn,ms){timers.set(++id,{fn,ms});return id;},clearTimer(key){timers.delete(key);},...options});
  return {controller,states,timers,capture,calls,last:()=>states.at(-1)};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  for(const rate of [16000,44100,48000]) {
    const wav=await api.pcmWav([new Float32Array(rate).fill(.5)],rate).arrayBuffer(),view=new DataView(wav);
    assert.equal(wav.byteLength,32044);assert.equal(view.getUint32(24,true),16000);assert.equal(view.getUint16(22,true),1);
    assert.equal(view.getInt16(44,true),16384);assert.equal(view.getUint32(40,true),32000);
  }
  let m=mock();await m.controller.start('line:0',target);
  assert.equal(m.last().phase,'listening');m.capture.feed(new Float32Array(48000).fill(.1),48000);
  assert.ok(m.last().level>0);assert.equal(m.last().seconds,1);
  await m.controller.stop();assert.equal(m.capture.closed,true);assert.equal(m.last().phase,'result');assert.equal(m.last().comparison.matched,true);
  assert.equal(m.controller.active,null);assert.equal(m.timers.size,0);
  const post=m.calls.find(x=>x.url.endsWith('transcribe'));
  assert.equal(post.headers['Content-Type'],'audio/wav');assert.ok(post.headers['X-Speech-Session']);
  assert.ok(post.body instanceof Blob,'send audio, not the expected answer');
  m=mock();await m.controller.start('line:0',target);await m.controller.stop();
  assert.equal(m.last().phase,'error');assert.equal(m.last().comparison,undefined);assert.equal(m.capture.closed,true);
  m=mock();await m.controller.start('line:0',target);m.capture.onError({name:'NotReadableError'});
  assert.equal(m.last().phase,'error');assert.equal(m.capture.closed,true,'stop recording on device failure');
  for(const options of [{local:false},{supported:false}]) {
    m=mock(options);await m.controller.start('line:0',target);assert.equal(m.last().phase,'error');assert.equal(m.calls.length,0);
  }
  m=mock({fetcher:async()=>({ok:true,json:async()=>({ready:false,message:'Model missing'})})});await m.controller.start('line:0',target);
  assert.equal(m.last().message,'Model missing');assert.equal(m.capture.closed,true);
  m=mock({captureFactory(){return {async start(){throw {name:'NotAllowedError'};},async close(){}};}});
  await m.controller.start('line:0',target);assert.equal(m.last().phase,'error');assert.ok(m.last().message.includes('麦克风未允许'));
  m=mock();let allow;m.capture.start=()=>new Promise(resolve=>{allow=resolve;});
  const pending=m.controller.start('line:0',target);await flush();
  [...m.timers.values()].find(x=>x.ms===20000).fn();assert.equal(m.capture.closed,true);assert.equal(m.last().phase,'error');
  allow();await pending;assert.equal(m.last().phase,'error','late permission must not reopen recording');
  m=mock();await m.controller.start('line:0',target);m.capture.feed(new Float32Array(48000).fill(.1),48000);
  let interimResolve;const normal=m.controller.fetcher;
  m.controller.fetcher=(url,request)=>url.endsWith('transcribe')?new Promise(resolve=>{interimResolve=resolve;}):normal(url,request);
  const interim=m.controller.transcribe(m.controller.active,false);await flush();
  m.controller.cancel();assert.equal(m.capture.closed,true);assert.equal(m.last().phase,'cancelled');
  interimResolve({ok:true,json:async()=>({text:'別の内容'})});await interim;
  assert.equal(m.last().phase,'cancelled');assert.equal(m.controller.active,null);
  assert.ok(m.calls.some(x=>x.url.endsWith('cancel')),'cancel the CPU job, not just browser UI');
  m=mock();await m.controller.start('line:0',target);m.capture.feed(new Float32Array(48000).fill(.1),48000);
  let snapshots=0;m.controller.fetcher=async(url)=>({ok:true,json:async()=>url.endsWith('transcribe')?{text:++snapshots===1?'皆さん、今日':target}:{cancelled:true}});
  await m.controller.transcribe(m.controller.active,false);assert.equal(m.last().phase,'listening');assert.equal(m.last().live.located,true);
  assert.ok(m.last().live.words.some(x=>x.status==='pending'&&x.text.includes('新しい')));
  await m.controller.stop();assert.equal(m.last().comparison.matched,true);
  let cancelledRecognition=0;api.setShadowing({cancel(){cancelledRecognition++;}});
  visibleNext={hidden:false};api.setAuto(true);api.pauseForShadowing('line:0');assert.equal(api.getAuto(),true);assert.equal(cancelledRecognition,0);
  visibleNext={hidden:true};api.pauseForShadowing('line:0');assert.equal(api.getAuto(),false);assert.ok(cancelledRecognition);
  visibleNext=null;const before=cancelledRecognition;await api.speak('次の台詞です。');assert.ok(cancelledRecognition>before);
  console.log('PASS: all dialogue karaoke, text differences, local WAV encoding, capture/permission/timeout/stop/cancel, stale results and role-play.');
})().catch(error=>{console.error(error);process.exitCode=1;});
