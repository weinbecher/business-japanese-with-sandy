const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),store=new Map(),spoken=[];
class Utterance { constructor(text){this.text=text;} }
const context={
  window:{SpeechSynthesisUtterance:Utterance,speechSynthesis:{cancel(){},resume(){},speak(u){spoken.push({text:u.text,lang:u.lang});setTimeout(()=>u.onend(),2);}}},
  SpeechSynthesisUtterance:Utterance,
  document:{body:{dataset:{page:'shadowwords'}},getElementById(){return null;},querySelectorAll(){return [];}},
  localStorage:{getItem(key){return store.get(key)||null;},setItem(key,value){store.set(key,value);}},
  location:{search:'',hash:''},URLSearchParams,setTimeout,clearTimeout,console,Intl
};
vm.createContext(context);
for(const name of ['data','vocab','dialogues','traps']) vm.runInContext(fs.readFileSync(path.join(root,`assets/${name}.js`),'utf8'),context);
const source=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');
vm.runInContext(source.replace('\n  init();','\n  window.testAPI={blankState,validateState,readState,mergeState,compareSpoken,compareLiveSpoken,makeShadowWord,shadowWordCandidates,shadowWordActions,shadowingMarkup,karaokeSentence,dialogueCard,reviewCard,setReview,save,reviewFor,reviewPending,baseItems,studyItems,targetUrl,readItem,listenShadowWord,getState(){return state;},getItem(id){return byId.get(id);},setState(value){state=value;refreshShadowWordItems();}};'),context);
const api=context.window.testAPI,d=context.window.BUSINESS_DATA,dialogue=d.dialogues[0],key=`${dialogue.id}:0`,expected=dialogue.turns[0].jp;
const heard='皆さん今日は新しい仲間を勘違いしましょう';
const result={key,phase:'result',source:'manual',expected,transcript:heard,comparison:api.compareSpoken(expected,heard)};
const candidates=api.shadowWordCandidates(result);
assert.equal(candidates.length,1);const word=candidates[0];assert.equal(word.term,'歓迎');
assert.equal(expected.slice(word.start,word.end),word.term);
assert.equal(api.getState().shadowWords[word.id],undefined,'comparison is not automatic collection');
assert.ok(api.shadowingMarkup(result).includes('aria-label="收藏词：歓迎"'));
assert.ok(api.karaokeSentence(expected,result).includes('aria-label="朗读词：歓迎"'));
assert.ok(api.karaokeSentence(expected,{...result,phase:'typing',live:api.compareLiveSpoken(expected,heard)}).includes('data-shadow-word='),'interim yellow words are replayable');
for(const args of [['bad:0',0,1],[key,-1,2],[key,0,9999],[key,.5,2],[key,1,1],[`${dialogue.id}:99`,0,1]]) assert.equal(api.makeShadowWord(...args),null);
const missed={...result,transcript:'皆さん今日は仲間を歓迎しましょう',comparison:api.compareSpoken(expected,'皆さん今日は仲間を歓迎しましょう')};
assert.equal(api.shadowWordCandidates(missed)[0].term,'新しい');
const extra={...result,comparison:api.compareSpoken(expected,'皆さん今日は本当に新しい仲間を歓迎しましょう')};
assert.equal(api.shadowWordCandidates(extra).length,0,'extra heard text is not a correct source word');
assert.equal(api.shadowWordCandidates({...result,comparison:api.compareSpoken(expected,expected)}).length,0);
assert.equal(api.shadowWordCandidates({...result,comparison:api.compareSpoken(expected,'')}).length,0);

api.setReview(word,{isFavorite:true,mastered:false});
assert.equal(api.reviewPending(),1);assert.equal(api.baseItems().length,1);
assert.equal(api.getItem(word.id).kind,'shadow-word');
assert.equal(api.studyItems().length,287,'the original 286 course items remain unchanged');
assert.ok(api.shadowWordActions(result).includes('aria-label="取消收藏词：歓迎"'));
assert.equal(api.targetUrl(word),`conversations.html?turn=0#${dialogue.id}`);
const card=api.reviewCard(word);assert.ok(card.includes('data-read=')&&card.includes('data-example='));
assert.ok(card.includes('回到原句')&&card.includes('data-mastered=')&&card.includes('data-reason='));
const persisted=JSON.stringify(api.getState().shadowWords);
assert.ok(!persisted.includes(heard)&&!persisted.includes('勘違い')&&!persisted.includes(expected),'save pointers, not recognized transcripts or audio');
assert.deepEqual(Object.keys(api.getState().shadowWords[word.id]).sort(),['key','start','end','isFavorite','mastered','archived','reason','updatedAt'].sort());
api.setReview(word,{isFavorite:true});assert.equal(api.baseItems().length,1,'repeated checks deduplicate the same source span');
api.setReview(word,{mastered:true});assert.equal(api.baseItems().length,0);assert.equal(api.reviewPending(),0);
api.setReview(word,{mastered:false,reason:'我没听出动词'});assert.equal(api.reviewFor(word.id).reason,'我没听出动词');

const saved=JSON.parse(JSON.stringify(api.getState()));
api.setState(api.blankState());assert.equal(api.getItem(word.id),undefined,'switching account clears dynamic word lookup');
assert.equal(api.baseItems().length,0);api.mergeState(api.getState(),saved);assert.equal(api.baseItems().length,1);
api.setReview(word,{archived:true,isFavorite:false});
const current=api.getState(),removed=current.shadowWords[word.id];
removed.updatedAt='2026-10-06T12:00:00Z';saved.shadowWords[word.id].updatedAt='2026-10-05T12:00:00Z';
api.mergeState(current,saved);assert.equal(api.reviewFor(word.id),null,'old backup cannot undo removal');
const legacy={version:1,review:{},progress:{},answers:{},preferences:{}};
assert.equal(api.validateState(legacy),true);api.mergeState(current,legacy);
assert.equal(api.validateState({...legacy,shadowWords:[]}),false);
const forged=api.blankState();forged.shadowWords[word.id]={key,start:0,end:2,updatedAt:'2099'};
api.mergeState(current,forged);assert.equal(api.reviewFor(word.id),null,'reject a forged ID/source range');
const injected=api.blankState();injected.shadowWords[word.id]={...saved.shadowWords[word.id],updatedAt:'2026-10-07T00:00:00Z',transcript:'PRIVATE',audio:'PRIVATE',term:'<img onerror=x>'};
api.mergeState(current,injected);assert.equal(api.getItem(word.id).term,'歓迎');assert.ok(!JSON.stringify(current.shadowWords).includes('PRIVATE'));
api.setState(current);store.set('business-sandy:v1:guest',JSON.stringify(current));
const restored=api.readState('guest');assert.equal(restored.shadowWords[word.id].isFavorite,true);
const unsafe={...result,transcript:'<img src=x onerror=alert(1)>',comparison:api.compareSpoken(expected,'<img src=x onerror=alert(1)>')};
assert.ok(!api.shadowingMarkup(unsafe).includes('<img'));
const dialogueHtml=api.dialogueCard(dialogue);assert.equal((dialogueHtml.match(/<div[\s>]/g)||[]).length,(dialogueHtml.match(/<\/div>/g)||[]).length);
assert.ok(!/<button[^>]*data-karaoke-line/.test(dialogueHtml),'word buttons must not nest in a sentence button');
(async()=>{
  api.save('preferences','audio',{enabled:false,rate:.85});
  assert.equal(await api.listenShadowWord(word,null),true);assert.equal(spoken.at(-1).text,'歓迎');assert.equal(api.getState().preferences.audio.enabled,true);
  spoken.length=0;assert.equal(await api.readItem(word),true);
  assert.deepEqual(spoken.map(u=>u.text),[word.term,word.example]);assert.ok(spoken.every(u=>u.lang==='ja-JP'));
  console.log('PASS: replayable yellow words, explicit collection, deduplication, notebook cards, Japanese-only audio, privacy, legacy import, account isolation and removal tombstones.');
})().catch(error=>{console.error(error);process.exitCode=1;});
