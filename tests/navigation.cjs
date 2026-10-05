const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const badges=[{setAttribute(name,value){this[name]=value;}}];
const context={
  window:{},document:{body:{dataset:{page:'home'}},getElementById(){return null;},querySelectorAll(){return badges;}},
  localStorage:{getItem(){return null;},setItem(){}},location:{search:'',hash:''},URLSearchParams,setTimeout,clearTimeout,console
};
vm.createContext(context);
for(const name of ['data','vocab','dialogues','traps']) vm.runInContext(fs.readFileSync(path.join(root,`assets/${name}.js`),'utf8'),context);
const source=fs.readFileSync(path.join(root,'assets/app.js'),'utf8');
vm.runInContext(source.replace('\n  init();','\n  window.testAPI={ROUTES,NAV_GROUPS,blankState,navigationGroup,navigationMarkup,localNavigationMarkup,setupNavigation,resumeLearning,homeMarkup,reviewPending,updateNavigation,setState(value){state=value;}};'),context);
const api=context.window.testAPI,d=context.window.BUSINESS_DATA;
const all=[...d.vocab,...d.expressions,...d.dialogues,...d.traps],byId=new Map(all.map(x=>[x.id,x]));
assert.equal(api.NAV_GROUPS.map(g=>g.id).join(','),'learn,practice,review');
for(const [page,url] of Object.entries(api.ROUTES)) {
  assert.ok(fs.existsSync(path.join(root,url)),`${page}: route file exists`);
  const html=api.navigationMarkup(page);
  const sidebar=html.split('<nav class="mobile-navigation"')[0];
  assert.equal((sidebar.match(/aria-current="page"/g)||[]).length,page==='login'?0:1,`${page}: one current sidebar link`);
  assert.equal((html.match(/class="nav-section"/g)||[]).length,3);
  assert.ok(html.includes('aria-label="主导航"')&&html.includes('aria-label="辅助工具"'));
  assert.ok(html.includes('aria-label="移动端主导航"'));
  if(api.navigationGroup(page)) assert.ok(api.localNavigationMarkup(page).includes('aria-current="page"'),`${page}: active local tab`);
}
assert.equal(api.navigationGroup('quiz').id,'practice');
assert.equal(api.navigationGroup('textbook').id,'learn');
assert.equal(api.navigationGroup('tags').id,'review');
assert.equal(api.ROUTES.practice,'index.html','existing quiz URL is preserved');
assert.equal(api.ROUTES.dialogues,'conversations.html');

let state=api.blankState();api.setState(state);
assert.equal(api.resumeLearning().saved,false);
assert.equal(api.resumeLearning().href,`conversations.html#${d.dialogues[0].id}`);
assert.ok(api.homeMarkup().includes('开始会话跟读'));
state.progress={
  vocab:{id:d.vocab[9].id,updatedAt:'2026-10-01T12:00:00Z'},
  grammar:{id:d.expressions[8].id,updatedAt:'2026-10-02T12:00:00Z'},
  mistakes:{id:d.traps[0].id,updatedAt:'2026-10-04T12:00:00Z'},
  tags:{id:d.dialogues[0].id,updatedAt:'2026-10-05T12:00:00Z'},
  quiz:{id:d.vocab[0].id,updatedAt:'2026-10-05T12:00:00Z'},
  dialogues:{id:'removed-item',updatedAt:'2026-10-05T12:00:00Z'}
};
assert.equal(api.resumeLearning().href,`grammar.html#${d.expressions[8].id}`,'ignore incidental review, removed IDs and wrong content kinds');
for(const [page,items] of [['vocab',d.vocab],['grammar',d.expressions],['quiz',d.expressions],['practice',d.traps],['dialogues',d.dialogues]]) {
  state.progress={[page]:{id:items[0].id,updatedAt:'2026-10-05T12:00:00Z'}};
  const resumed=api.resumeLearning();
  assert.equal(resumed.saved,true);assert.equal(resumed.page,page);
  assert.equal(resumed.href,`${api.ROUTES[page]}#${items[0].id}`);
  const hero=api.homeMarkup().split('<section class="home-paths"')[0];
  assert.ok(hero.includes('继续上次学习'));
  if(['quiz','practice'].includes(page)) {
    assert.ok(hero.includes(items[0].question),'resume preview uses the unanswered question');
    assert.ok(!hero.includes(items[0].answer),'do not leak the saved question answer on the homepage');
  }
}
state.review={
  [d.vocab[0].id]:{isFavorite:true},
  [d.expressions[0].id]:{isWrong:true},
  [d.vocab[1].id]:{isFavorite:true,archived:true},
  [d.vocab[2].id]:{isFavorite:true,mastered:true},
  'removed-item':{isWrong:true}
};
assert.equal(api.reviewPending(),2,'only existing, unarchived and unmastered items contribute');
api.updateNavigation();assert.equal(badges[0].textContent,'2');assert.equal(badges[0].hidden,false);
assert.equal(badges[0]['aria-label'],'2 项待复习');
state.review={};api.updateNavigation();assert.equal(badges[0].hidden,true);
const home=api.homeMarkup();
assert.equal((home.match(/class="chapter-stop"/g)||[]).length,9);
for(const match of home.matchAll(/href="([^"#]+)(?:#([^"#]+))?"/g)) {
  assert.ok(fs.existsSync(path.join(root,match[1])),`homepage destination exists: ${match[1]}`);
  if(match[2]) assert.ok(byId.has(match[2]),`chapter/resume item exists: ${match[2]}`);
}

// Disclosure behaviour can be tested without changing a real user's browser state.
const events={},classes=new Set();let mediaChange;
const toggle={attrs:{'aria-expanded':'false'},setAttribute(name,value){this.attrs[name]=value;},getAttribute(name){return this.attrs[name];},contains(node){return node===this;},focus(){this.focused=true;}};
const activeLink={focus(){this.focused=true;},closest(){return this;}};
const navigation={querySelector(){return activeLink;},contains(node){return node===activeLink;},addEventListener(name,handler){events[`nav:${name}`]=handler;}};
context.document.body.classList={toggle(name,on){on?classes.add(name):classes.delete(name);}};
context.document.getElementById=id=>({menuToggle:toggle,appNavigation:navigation}[id]||null);
context.document.addEventListener=(name,handler)=>{events[name]=handler;};
context.window.matchMedia=()=>({addEventListener(name,handler){mediaChange=handler;}});
api.setupNavigation();
toggle.onclick();assert.ok(classes.has('navigation-open'));assert.equal(toggle.attrs['aria-expanded'],'true');assert.equal(activeLink.focused,true);
events.keydown({key:'Escape'});assert.equal(toggle.attrs['aria-expanded'],'false');assert.equal(toggle.focused,true);
toggle.onclick();events.click({target:toggle});assert.ok(classes.has('navigation-open'),'opening click is not treated as outside');
events.click({target:{}});assert.equal(toggle.attrs['aria-expanded'],'false');
toggle.onclick();events['nav:click']({target:activeLink});assert.equal(toggle.attrs['aria-expanded'],'false');
toggle.onclick();mediaChange({matches:true});assert.equal(toggle.attrs['aria-expanded'],'false','close drawer when moving to desktop');
console.log('PASS: grouped navigation, current-page markers, all routes/anchors, safe resume, review badge, mobile disclosure and keyboard dismissal.');
