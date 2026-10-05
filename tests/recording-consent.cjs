const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');
const store=new Map();
const storage={getItem(key){return store.get(key)||null;},setItem(key,value){store.set(key,value);}};

function load(localStorage=storage,options={}) {
  const starts=[],toast={classList:{toggle(){}},hidden:true};
  const context={
    window:{},document:{body:{dataset:{page:'textbook'}},getElementById(id){return id==='toast'?toast:null;},querySelector(){return null;},querySelectorAll(){return [];}},
    localStorage,location:{search:'',hash:'',protocol:'http:',hostname:'127.0.0.1'},URLSearchParams,setTimeout,clearTimeout,console,Intl
  };
  vm.createContext(context);
  for(const name of ['data','vocab','dialogues','traps']) vm.runInContext(fs.readFileSync(path.join(root,`assets/${name}.js`),'utf8'),context);
  vm.runInContext(source.replace('\n  init();','\n  window.testAPI={SHADOW_CONSENT_KEY,SHADOW_CONSENT_VERSION,checkDialogueLine,cancelShadowConsent,readShadowConsent,switchAccount,getState(){return state;},getResult(key){return shadowStates.get(key);},setController(value){shadowing=value;},setAccount(value){account=value;},clearTimers(){clearTimeout(toast.timer);clearTimeout(syncTimer);}};'),context);
  const api=context.window.testAPI,dialogue=context.window.BUSINESS_DATA.dialogues[0];
  const controller={local:true,supported:true,active:null,stops:0,cancel(){this.active=null;},stop(){this.stops++;this.active=null;},start(key,expected){starts.push({key,expected});this.active={key};},...options};
  api.setController(controller);
  return {api,dialogue,starts,controller,key:`${dialogue.id}:0`,toast};
}

(async()=>{
  const first=load(),otherTab=load(),{api,dialogue,key}=first;
  assert.equal(first.starts.length,0,'loading a page never starts recording');
  api.checkDialogueLine(dialogue,0);
  assert.equal(api.getResult(key).phase,'consent');
  assert.equal(first.starts.length,0,'ask before opening the microphone');
  assert.equal(store.has(api.SHADOW_CONSENT_KEY),false);
  api.cancelShadowConsent();
  assert.equal(api.getResult(key).phase,'cancelled');
  assert.equal(store.has(api.SHADOW_CONSENT_KEY),false,'cancel is not acknowledgement');
  api.checkDialogueLine(dialogue,0,true);
  assert.equal(store.get(api.SHADOW_CONSENT_KEY),api.SHADOW_CONSENT_VERSION);
  assert.equal(first.starts.length,1);
  assert.equal(first.starts[0].expected,dialogue.turns[0].jp);
  api.checkDialogueLine(dialogue,0);
  assert.equal(first.controller.stops,1,'the microphone button still stops an active line');
  api.checkDialogueLine(dialogue,1);
  assert.equal(first.starts.length,2,'the next line does not ask again');
  assert.ok(!JSON.stringify(api.getState()).includes('consent'),'do not sync acknowledgement with learning data');

  const reloaded=load();
  assert.equal(reloaded.api.readShadowConsent(),true);
  assert.equal(reloaded.starts.length,0,'remembered consent is not permission to auto-record');
  reloaded.api.checkDialogueLine(reloaded.dialogue,0);
  assert.equal(reloaded.starts.length,1,'refresh retains acknowledgement');
  otherTab.api.checkDialogueLine(otherTab.dialogue,0);
  assert.equal(otherTab.starts.length,1,'a tab opened before confirmation also sees the saved acknowledgement');

  reloaded.api.setAccount({id:'previous-account'});
  await reloaded.api.switchAccount(null);
  assert.equal(reloaded.controller.active,null,'account changes still stop recording');
  reloaded.api.checkDialogueLine(reloaded.dialogue,0);
  assert.equal(reloaded.starts.length,2,'signing out does not reset the device acknowledgement');

  for(const value of [null,'true','outdated-disclosure']) {
    store.delete(api.SHADOW_CONSENT_KEY);
    if(value!==null) store.set(api.SHADOW_CONSENT_KEY,value);
    const fresh=load();fresh.api.checkDialogueLine(fresh.dialogue,0);
    assert.equal(fresh.starts.length,0,'new/cleared/unknown consent requires confirmation');
    assert.equal(fresh.api.getResult(fresh.key).phase,'consent');
  }
  store.delete(api.SHADOW_CONSENT_KEY);
  const unavailable=load(storage,{local:false});
  unavailable.api.checkDialogueLine(unavailable.dialogue,0,true);
  assert.equal(store.has(api.SHADOW_CONSENT_KEY),false,'an unavailable local engine does not record consent');

  const blocked={getItem(){throw new Error('Storage blocked');},setItem(){throw new Error('Storage blocked');}};
  const temporary=load(blocked);
  temporary.api.checkDialogueLine(temporary.dialogue,0,true);
  assert.ok(temporary.toast.textContent.includes('重新打开后可能需要再确认'));
  temporary.api.checkDialogueLine(temporary.dialogue,1);
  assert.equal(temporary.starts.length,2,'blocked storage still remembers for this page session');
  temporary.api.clearTimers();
  const reopened=load(blocked);reopened.api.checkDialogueLine(reopened.dialogue,0);
  assert.equal(reopened.starts.length,0,'blocked storage is not falsely treated as persistent');
  reopened.api.clearTimers();
  console.log('PASS: one-time local recording acknowledgement, cancel, reload, new lines, existing tabs, sign-out, disclosure versions, storage failures and no automatic recording/cloud sync.');
})().catch(error=>{console.error(error);process.exitCode=1;});
