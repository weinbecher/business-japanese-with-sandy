const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const utterances=[];
let queued=null;
class Utterance { constructor(text) { this.text=text; } }
const context={
  window:{SpeechSynthesisUtterance:Utterance,speechSynthesis:{cancel(){clearTimeout(queued);},resume(){},speak(u){utterances.push({text:u.text,lang:u.lang});queued=setTimeout(()=>u.onend(),5);}}},
  SpeechSynthesisUtterance:Utterance,
  document:{body:{dataset:{page:'quiz'}},getElementById(){return null;},querySelectorAll(){return []; }},
  localStorage:{getItem(){return null;},setItem(){}},location:{search:'',hash:''},URLSearchParams,setTimeout,clearTimeout,console
};
vm.createContext(context);
for(const name of ['data','vocab','dialogues','traps']) vm.runInContext(fs.readFileSync(path.join(root,`assets/${name}.js`),'utf8'),context);
const source=fs.readFileSync(path.join(root,'assets/app.js'),'utf8').replace('\n  init();','\n  window.testAPI={blankState,mergeState,validateState,optionsFor,questionCard,dialogueCard,toKana,readItem,speak,cancelSpeech};');
vm.runInContext(source,context);
const d=context.window.BUSINESS_DATA,api=context.window.testAPI;
assert.equal(d.chapters.length,9);
assert.equal(d.expressions.length,61);
assert.equal(d.vocab.length,162);
assert.equal(d.dialogues.length,27);
assert.equal(d.traps.length,36);
const all=[...d.expressions,...d.vocab,...d.dialogues,...d.traps];
assert.equal(new Set(all.map(x=>x.id)).size,286);
for(const [index,count] of [6,7,6,8,7,6,8,7,6].entries()) {
  const lesson=index+1;
  assert.equal(d.expressions.filter(x=>x.lesson===lesson).length,count);
  assert.equal(d.vocab.filter(x=>x.lesson===lesson).length,18);
  assert.equal(d.dialogues.filter(x=>x.lesson===lesson).length,3);
  assert.equal(d.traps.filter(x=>x.lesson===lesson).length,4);
}
for(const item of all) {
  for(const key of ['id','term','zh','en','example']) assert.ok(item[key],`${item.id}: ${key}`);
  assert.ok(!/[{}]/.test(item.example),`${item.id}: unresolved answer marker`);
  assert.ok(item.sourcePdf>=7&&item.sourcePdf<=50,`${item.id}: source page`);
}
const answerPositions=new Set();
for(const item of [...d.expressions,...d.traps]) {
  const choices=api.optionsFor(item);
  assert.equal(choices.length,item.kind==='trap'?2:4);
  assert.equal(choices.filter(c=>c.jp===item.answer).length,1);
  assert.equal(new Set(choices.map(c=>c.jp)).size,choices.length);
  for(const choice of choices) assert.ok(choice.en&&!/[ぁ-ヿ一-龯]/.test(choice.en),`${item.id}: English hint missing for ${choice.jp}`);
  answerPositions.add(choices.findIndex(c=>c.jp===item.answer));
  assert.ok(api.questionCard(item,0).includes('aria-label="加入复习本：第 1 题"'),'star does not reveal answer');
}
assert.ok(answerPositions.size>=3,'answers are distributed across positions');
for(const dialogue of d.dialogues) {
  for(const turn of dialogue.turns) for(const field of ['speaker','jp','zh','en']) assert.ok(turn[field],`${dialogue.id}: missing ${field}`);
  const html=api.dialogueCard(dialogue);
  assert.equal((html.match(/<div[\s>]/g)||[]).length,(html.match(/<\/div>/g)||[]).length,`${dialogue.id}: dialogue lines must not nest`);
}
assert.equal(api.toKana('ネットワーク'),'ねっとわーく');
const target=api.blankState(),incoming=api.blankState();
const first=d.vocab[0].id,second=d.vocab[1].id;
target.review[first]={id:first,archived:true,updatedAt:'2026-10-04T12:00:00.000Z'};
incoming.review[first]={id:first,archived:false,updatedAt:'2026-10-03T12:00:00.000Z'};
incoming.review[second]={id:second,isFavorite:true,updatedAt:'2026-10-04T13:00:00.000Z'};
target.progress.vocab={id:first,updatedAt:'2026-10-04T12:00:00.000Z'};
incoming.progress.grammar={id:d.expressions[0].id,updatedAt:'2026-10-04T13:00:00.000Z'};
api.mergeState(target,incoming);
assert.equal(target.review[first].archived,true,'old devices cannot restore removed reviews');
assert.equal(target.review[second].isFavorite,true,'unrelated items survive the merge');
assert.equal(target.progress.vocab.id,first,'page progress remains separate');
assert.equal(target.progress.grammar.id,d.expressions[0].id);
assert.equal(api.validateState({version:1}),false,'reject malformed imports');
api.mergeState(target,{version:1,review:JSON.parse('{"__proto__":{"polluted":true}}'),progress:{},answers:{},preferences:{}});
assert.equal({}.polluted,undefined);
(async()=>{
  const word=d.vocab[0];
  assert.equal(await api.readItem(word),true);
  assert.deepEqual(utterances.map(x=>x.text),[word.reading,word.example],'read only Japanese word and sentence, not labels or translations');
  assert.ok(utterances.every(x=>x.lang==='ja-JP'));
  const reading=api.speak('次の文を読みます。'); api.cancelSpeech();
  assert.equal(await reading,false,'pause resolves the active utterance');
  console.log('PASS: 9 chapters, 286 complete items, choices, English hints, isolated progress, merge tombstones and Japanese-only audio.');
})().catch(error=>{console.error(error);process.exitCode=1;});
