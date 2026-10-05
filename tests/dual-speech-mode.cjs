const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');
assert.ok(!/webkitSpeechRecognition|new SpeechRecognition/.test(source));
function load(href,store=new Map()) {
  const url=new URL(href),starts=[],nodes={
    localSpeechStatus:{textContent:''},shadowMode:{value:''},checkMacConnection:{hidden:false},privateMacDetails:{open:false}
  },details={open:false},input={focusCount:0,closest(){return details;},focus(){this.focusCount++;}};
  const context={window:{isSecureContext:true},navigator:{mediaDevices:{}},
    document:{body:{dataset:{page:'dialogues'}},getElementById(id){return nodes[id]||null;},querySelectorAll(){return [];},querySelector(selector){return selector.startsWith('[data-shadow-text=')?input:null;}},
    localStorage:{getItem(key){return store.get(key)||null;},setItem(key,value){store.set(key,value);}},location:url,URL,URLSearchParams,setTimeout,clearTimeout,console,Intl,Blob,AbortController,crypto:webcrypto
  };
  vm.createContext(context);
  for(const name of ['data','vocab','dialogues','traps']) vm.runInContext(fs.readFileSync(path.join(root,`assets/${name}.js`),'utf8'),context);
  vm.runInContext(source.replace('\n  init();','\n  window.testAPI={SHADOW_MODE_KEY,SHADOW_CONSENT_KEY,isWhisperPage,isPrivateWhisperPage,privateMacOrigin,privateMacLink,readShadowMode,shadowModeMarkup,shadowingMarkup,checkDialogueLine,setShadowMode,refreshShadowModeStatus,ShadowRecognizer,getMode(){return shadowMode;},getState(){return state;},getResult(key){return shadowStates.get(key);},setController(value){shadowing=value;}};'),context);
  const api=context.window.testAPI,dialogue=context.window.BUSINESS_DATA.dialogues[0];
  const controller={local:api.isWhisperPage(),supported:true,active:null,cancel(){this.active=null;},start(key,expected){starts.push({key,expected});this.active={key};},async request(){return {ready:true,message:'Ready',model:'small-q5_1',private_origin:url.origin};}};
  api.setController(controller);
  return {api,dialogue,starts,store,nodes,input,details,controller,key:`${dialogue.id}:0`};
}

(async()=>{
  const publicPage=load('https://weinbecher.github.io/business-japanese-with-sandy/conversations.html');
  const {api,dialogue,key}=publicPage;
  assert.equal(api.getMode(),'dictation');assert.equal(api.isWhisperPage(),false);
  api.checkDialogueLine(dialogue,0);
  assert.equal(publicPage.starts.length,0,'iPad-only mode never starts Whisper or requests a microphone');
  assert.equal(api.getResult(key).phase,'dictation');assert.equal(publicPage.details.open,true);assert.equal(publicPage.input.focusCount,1);
  assert.equal(publicPage.store.has(api.SHADOW_CONSENT_KEY),false,'Apple dictation does not consume Whisper consent');
  assert.ok(api.shadowingMarkup(api.getResult(key)).includes('网页不能代替你启动系统听写'));
  api.setShadowMode('whisper');
  assert.ok(publicPage.nodes.localSpeechStatus.textContent.includes('私人 HTTPS'));assert.equal(publicPage.nodes.privateMacDetails.open,true);
  assert.equal(publicPage.starts.length,0,'mode switching is not permission to record');
  api.setShadowMode('dictation');
  assert.equal(load('https://weinbecher.github.io/business-japanese-with-sandy/conversations.html',publicPage.store).api.getMode(),'dictation');
  assert.ok(!JSON.stringify(api.getState()).includes('speech-mode'),'device choice is separate from account/cloud state');
  assert.equal(load('http://127.0.0.1:8765/conversations.html').api.getMode(),'whisper');
  assert.equal(load('http://127.0.0.1:8765/conversations.html?speech=dictation').api.getMode(),'dictation');
  const privatePage=load('https://my-mac.tail123.ts.net/conversations.html');
  assert.equal(privatePage.api.getMode(),'whisper');assert.equal(privatePage.api.isPrivateWhisperPage(),true);
  assert.equal(privatePage.api.privateMacOrigin('https://my-mac.tail123.ts.net/'),'https://my-mac.tail123.ts.net');
  assert.equal(privatePage.api.privateMacLink('https://my-mac.tail123.ts.net'),'https://my-mac.tail123.ts.net/conversations.html?speech=whisper');
  assert.ok(privatePage.api.shadowingMarkup({phase:'consent',key}).includes('my-mac.tail123.ts.net'),'remote disclosure names the receiving Mac');
  for(const value of ['http://my-mac.tail123.ts.net','https://evil.example','https://my-mac.tail123.ts.net.evil.test','https://user:pass@my-mac.tail123.ts.net','https://my-mac.tail123.ts.net:8765','https://my-mac.tail123.ts.net/api/speech','https://my-mac.tail123.ts.net?token=x','javascript:alert(1)']) assert.equal(api.privateMacOrigin(value),null,value);
  assert.equal(load('http://my-mac.tail123.ts.net').api.isWhisperPage(),false,'private microphone pages require HTTPS');
  assert.equal(load('https://evil.ts.net.example').api.isWhisperPage(),false);

  for(const allowed of [false,true]) {
    let microphoneStarts=0,closed=0;
    const phases=[],capture={async start(){microphoneStarts++;},close(){closed++;}};
    const recognizer=new privatePage.api.ShadowRecognizer({supported:true,captureFactory:()=>capture,
      fetcher:async()=>({ok:true,json:async()=>({ready:true,private_origin:allowed?'https://my-mac.tail123.ts.net':'https://other-mac.tail123.ts.net'})}),
      onChange:s=>phases.push(s),setTimer(){return 1;},clearTimer(){}});
    await recognizer.start(key,dialogue.turns[0].jp);
    assert.equal(microphoneStarts,allowed?1:0,'check the configured private origin before opening the microphone');
    assert.equal(phases.at(-1).phase,allowed?'listening':'error');
    recognizer.cancel();assert.ok(closed>0);
  }
  console.log('PASS: iPad-only focus/dictation without recording, persistent device mode, Mac defaults, private HTTPS validation, explicit receiver disclosure and pre-capture origin checks.');
})().catch(error=>{console.error(error);process.exitCode=1;});
