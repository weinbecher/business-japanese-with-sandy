(() => {
  "use strict";
  const D=window.BUSINESS_DATA;
  const PAGE=document.body.dataset.page;
  const REASONS=["我被汉字骗了","我被中文意思骗了","我以为两个都可以","我没看出固定搭配","我没听出动词","我没抓主语","我没抓转折","我只是太累了 粗心了"];
  const ROUTES={home:"home.html",practice:"index.html",quiz:"grammar-quiz.html",vocab:"vocab.html",grammar:"grammar.html",dialogues:"conversations.html",mistakes:"mistakes.html",shadowwords:"shadow-words.html",tags:"tag.html",textbook:"textbook.html",login:"login.html"};
  const TITLES={home:"今天，从哪里开始？",practice:"商务判断",quiz:"表达填空",vocab:"核心词汇",grammar:"商务表达",dialogues:"会话跟读",mistakes:"错题与收藏",shadowwords:"跟读错词本",tags:"标签筛选",textbook:"教材原文",login:"Business Japanese · Sign in"};
  const NAV_GROUPS=[
    {id:"learn",label:"学习",hint:"先理解，再记住",items:[{page:"vocab",label:"核心词汇",icon:"book"},{page:"grammar",label:"商务表达",icon:"text"}]},
    {id:"practice",label:"练习",hint:"把日语用起来",items:[{page:"dialogues",label:"会话跟读",icon:"chat"},{page:"quiz",label:"表达填空",icon:"write"},{page:"practice",label:"商务判断",icon:"check"}]},
    {id:"review",label:"复习",hint:"回到还不熟悉的地方",items:[{page:"mistakes",label:"错题与收藏",icon:"star"},{page:"shadowwords",label:"跟读错词本",icon:"text"}]}
  ];
  const SUPPORT_LINKS=[{page:"tags",label:"标签筛选",icon:"filter"},{page:"textbook",label:"教材原文",icon:"file"}];
  const allItems=[...D.vocab,...D.expressions,...D.dialogues,...D.traps];
  const byId=new Map(allItems.map(item=>[item.id,item]));
  const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const $=id=>document.getElementById(id);
  const toKana=value=>String(value||"").normalize("NFKC").replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
  const stamp=()=>new Date().toISOString();
  const blankState=()=>({version:1,review:{},shadowWords:{},progress:{},answers:{},preferences:{}});
  const localKey=id=>`business-sandy:v1:${id}`;
  // Device/site acknowledgement only: never include it in account sync or backups.
  const SHADOW_CONSENT_KEY="business-sandy:local-recording-consent";
  const SHADOW_CONSENT_VERSION="local-whisper-v1";
  let account=null, client=null, scope="guest", state=readState(scope), accountEpoch=0, syncTimer, syncing=false, resync=false, syncCompletion=Promise.resolve();
  let filters=new Set(), favoriteOnly=false, includeMastered=false, query="", currentId=null, restored=false, userInteracted=false, progressSuspended=false;
  let auto=false, autoGeneration=0, speechGeneration=0, speechResolve=null, voices=[], observer=null, listItems=[];
  let boardStrokes=[], drawing=null, boardSize={width:1,height:1}, roleModes=new Map();
  let shadowing=null, shadowConsent=readShadowConsent(), pendingShadowKey=null;
  const shadowStates=new Map();
  const params=new URLSearchParams(location.search);
  let shadowWordItems=[];
  refreshShadowWordItems();

  function readShadowConsent() {
    try { return localStorage.getItem(SHADOW_CONSENT_KEY)===SHADOW_CONSENT_VERSION; } catch { return false; }
  }
  function rememberShadowConsent() {
    shadowConsent=true;
    try { localStorage.setItem(SHADOW_CONSENT_KEY,SHADOW_CONSENT_VERSION); }
    catch { toast("浏览器未允许保存确认，本次无需再确认；重新打开后可能需要再确认一次。",true); }
  }
  function readState(id) {
    try { const parsed=JSON.parse(localStorage.getItem(localKey(id))||"null"); return validateState(parsed)?{shadowWords:{},...parsed}:blankState(); } catch { return blankState(); }
  }
  function validateState(value) {
    return value&&value.version===1&&["review","progress","answers","preferences"].every(k=>value[k]&&typeof value[k]==="object"&&!Array.isArray(value[k]))&&(value.shadowWords===undefined||value.shadowWords&&typeof value.shadowWords==="object"&&!Array.isArray(value.shadowWords));
  }
  function writeLocal() {
    try { localStorage.setItem(localKey(scope),JSON.stringify(state)); } catch { toast("本机储存不可用，请在复习页导出备份。",true); }
  }
  function save(section,key,value) {
    state[section][key]={...value,updatedAt:stamp()}; if(section==="shadowWords") refreshShadowWordItems(); writeLocal(); scheduleSync(); updateNavigation();
  }
  function mergeState(target,incoming) {
    if(!validateState(incoming)) return target;
    target.shadowWords||={};
    for(const section of ["review","shadowWords","progress","answers","preferences"]) for(const [key,value] of Object.entries(incoming[section]||{})) {
      if(["__proto__","constructor","prototype"].includes(key)||!value||typeof value!=="object") continue;
      if(section==="review"&&!byId.has(key)) continue;
      const word=section==="shadowWords"?makeShadowWord(value.key,value.start,value.end):null;
      if(section==="shadowWords"&&(!word||word.id!==key)) continue;
      if(!target[section][key]||String(value.updatedAt||"")>String(target[section][key].updatedAt||"")) target[section][key]=section==="shadowWords"?shadowWordRecord(value):{...value};
    }
    if(target===state) refreshShadowWordItems();
    return target;
  }
  // The existing site's readers explicitly skip vocab- progress records. This reserved
  // snapshot ID reuses its protected notebook table without appearing in any N2 page.
  const CLOUD_ID="vocab-progress-business-japanese-v1";
  const publicConfig={url:"https://dqkulgkvzawpboaoysum.supabase.co",key:"sb_publishable_kd_u18OSCcjCkLLAohOHig_67kwF35H"};
  function scheduleSync() {
    if(!account||!client) return;
    clearTimeout(syncTimer); syncTimer=setTimeout(syncCloud,700);
  }
  async function syncCloud() {
    if(!account||!client) return;
    if(syncing) { resync=true; await syncCompletion; return syncCloud(); }
    clearTimeout(syncTimer);
    syncing=true; let completeSync; syncCompletion=new Promise(resolve=>{ completeSync=resolve; });
    const epoch=accountEpoch; const owner=account.id;
    try {
      let saved=false;
      for(let attempt=0;attempt<3&&!saved;attempt++) {
        const {data,error}=await client.from("mistake_notebook").select("note,updated_at").eq("user_id",owner).eq("question_id",CLOUD_ID).maybeSingle();
        if(error) throw error;
        if(epoch!==accountEpoch) return;
        if(data) { try { mergeState(state,JSON.parse(data.note)); } catch {} }
        writeLocal();
        const payload={user_id:owner,question_id:CLOUD_ID,grammar:"Business Japanese learning state",sentence:"",selected_answer:"",correct_answer:"",note:JSON.stringify(state),updated_at:stamp()};
        if(data) {
          const result=await client.from("mistake_notebook").update(payload).eq("user_id",owner).eq("question_id",CLOUD_ID).eq("updated_at",data.updated_at).select("question_id");
          if(result.error) throw result.error;
          saved=Boolean(result.data?.length);
        } else {
          const result=await client.from("mistake_notebook").insert(payload);
          if(result.error&&result.error.code!=="23505") throw result.error;
          saved=!result.error;
        }
      }
      if(epoch===accountEpoch) updateAccount(saved?"云端已同步":"本机已保存 · 等待同步");
    } catch(error) { if(epoch===accountEpoch) updateAccount("本机已保存 · 云端暂未同步"); console.warn("Business Japanese sync:",error.message); }
    finally { syncing=false; completeSync(); if(resync) { resync=false; scheduleSync(); } }
  }
  async function switchAccount(user) {
    if(account?.id===user?.id) { updateAccount(); return; }
    stopAuto(); shadowStates.clear(); clearTimeout(syncTimer); accountEpoch++; account=user;
    scope=user?.id||"guest"; state=readState(scope); refreshShadowWordItems(); currentId=null;
    if(PAGE==="home") renderHome();
    else if(!["login","textbook"].includes(PAGE)) { loadPagePreferences(); renderFilters(); renderContent(); restoreProgress(true); }
    updateAccount();
    if(!user) return;
    const epoch=accountEpoch;
    try {
      const {data,error}=await client.from("mistake_notebook").select("note").eq("user_id",user.id).eq("question_id",CLOUD_ID).maybeSingle();
      if(error) throw error; if(epoch!==accountEpoch) return;
      if(data) { try { mergeState(state,JSON.parse(data.note)); } catch {} }
      const guest=readState("guest");
      if(!guest.claimedBy) { mergeState(state,guest); guest.claimedBy=user.id; try { localStorage.setItem(localKey("guest"),JSON.stringify(guest)); } catch {} }
      writeLocal(); scheduleSync();
      if(PAGE==="home") renderHome();
      else if(!["login","textbook"].includes(PAGE)) { renderContent(); if(!userInteracted) restoreProgress(true); }
      updateAccount("云端已载入");
    } catch(error) { updateAccount("本机已保存 · 云端暂未同步"); console.warn("Business Japanese account:",error.message); }
  }
  function updateAccount(message) {
    if(!$("accountStatus")) return;
    $("accountStatus").textContent=account?(message||"本机已保存"):`本机自动保存${client?" · 可登录同步":""}`;
    $("signOut").hidden=!account; $("loginLink").hidden=Boolean(account);
    $("accountEmail").textContent=account?.email||"";
  }
  function loadCloudClient() {
    const script=document.createElement("script"); script.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"; script.async=true;
    script.onload=async()=>{
      try {
        client=window.supabase.createClient(publicConfig.url,publicConfig.key,{auth:{storageKey:"business-sandy-auth-v1"}});
        if(PAGE==="login") { setupLogin(); return; }
        const result=await client.auth.getSession(); await switchAccount(result.data.session?.user||null);
        client.auth.onAuthStateChange((event,session)=>setTimeout(()=>switchAccount(session?.user||null),0));
      } catch { updateAccount("本机已保存 · 登录暂不可用"); }
    };
    script.onerror=()=>{ if(PAGE==="login") $("loginMessage").textContent="连接登录服务失败，请检查网络后重试。"; updateAccount(); };
    document.head.appendChild(script);
  }
  function shell() {
    const intro={home:"沿着九个工作场景，把理解、开口和复习串起来。",practice:"在真实商务场景中，判断更合适的措辞。",quiz:"把学过的表达放回日语例句里 · 61 项",vocab:"先看读音，再看汉字 · 162 个核心词",grammar:"接续、用法和商务例句 · 61 个表达",dialogues:"听一句，说一句 · 9 段会话 + 18 段角色练习",mistakes:"错过的题和标过的星，集中在这里复习。",shadowwords:"你点 ☆ 留下的待核对原词 · 点击词听读音，点击原句听完整台词。",tags:"按章节、内容类型和错因组合筛选。",textbook:"原文查阅与章节目录 · PDF 仅保存在本机",login:"Keep your Business Japanese learning in sync."};
    document.title=`${TITLES[PAGE]}｜Business Japanese with Sandy`;
    const group=navigationGroup(PAGE);
    document.body.innerHTML=`<a class="skip-link" href="#mainContent">跳到内容</a>${navigationMarkup(PAGE)}<div class="workspace"><div class="workspace-topbar" id="top"><button class="menu-toggle" id="menuToggle" type="button" aria-controls="appNavigation" aria-expanded="false" aria-label="打开导航">${navIcon("menu")}</button><nav class="breadcrumbs" aria-label="当前位置"><a href="home.html">学习主页</a>${PAGE!=="home"?`<span class="crumb-divider" aria-hidden="true">/</span>${group?`<span class="crumb-group">${group.label}</span><span class="crumb-divider crumb-group" aria-hidden="true">/</span>`:""}<span class="crumb-current" aria-current="page">${esc(TITLES[PAGE])}</span>`:""}</nav><div class="account"><span id="accountStatus">本机自动保存</span><span id="accountEmail"></span><a id="loginLink" href="login.html?redirect=${ROUTES[PAGE]}">Sign in</a><button id="signOut" type="button" hidden>Sign out</button></div></div>${localNavigationMarkup(PAGE)}<main class="app" id="mainContent" tabindex="-1"><header class="page-heading"><div class="eyebrow">${PAGE==="home"?"YOUR LEARNING SPACE":group?`${group.label} · BUSINESS JAPANESE`:"BUSINESS JAPANESE"}</div><h1>${TITLES[PAGE]}</h1><p class="subtitle">${intro[PAGE]}</p></header><div id="pageContent"></div></main></div><div id="toast" class="toast" role="status" hidden></div>`;
    setupNavigation(); updateNavigation();
    $("signOut").onclick=async()=>{ stopAuto(); await syncCloud(); const result=await client?.auth.signOut(); if(result?.error) toast(result.error.message,true); else switchAccount(null); };
  }
  function navIcon(name) {
    const paths={home:'<path d="m3 10 9-7 9 7v10H3Z"/><path d="M9 20v-7h6v7"/>',book:'<path d="M12 5v15M3 4h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v15h-5a4 4 0 0 0-4 2 4 4 0 0 0-4-2H3Z"/>',text:'<path d="M4 5h16M4 10h16M4 15h10M4 20h7"/>',chat:'<path d="M21 11a8 8 0 0 1-8 8H8l-5 3v-6a8 8 0 0 1-1-5 8 8 0 0 1 8-8h3a8 8 0 0 1 8 8Z"/><path d="M7 9h9M7 13h6"/>',write:'<path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14Z"/>',check:'<rect x="3" y="3" width="18" height="18" rx="4"/><path d="m7 12 3 3 7-7"/>',star:'<path d="m12 3 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',filter:'<path d="M4 6h16M7 12h10M10 18h4"/>',file:'<path d="M14 3H5v18h14V8Zm0 0v5h5M8 12h8M8 16h8"/>',menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>'};
    return `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.book}</svg>`;
  }
  function navigationGroup(page) { return NAV_GROUPS.find(group=>group.items.some(item=>item.page===page))||(page==="tags"?NAV_GROUPS[2]:page==="textbook"?NAV_GROUPS[0]:null); }
  function navigationMarkup(page) {
    const link=item=>`<a class="side-link" href="${ROUTES[item.page]}" ${page===item.page?'aria-current="page"':""}>${navIcon(item.icon)}<span>${item.label}</span>${item.page==="mistakes"?'<span class="nav-count" data-review-count hidden></span>':""}</a>`;
    const mobile=[{page:"home",label:"主页",icon:"home"},{page:"vocab",group:"learn",label:"学习",icon:"book"},{page:"dialogues",group:"practice",label:"练习",icon:"chat"},{page:"mistakes",group:"review",label:"复习",icon:"star"}];
    return `<aside class="app-sidebar" id="appNavigation" aria-label="应用导航"><a class="app-brand" href="home.html" aria-label="Business Japanese with Sandy · 学习主页"><img src="assets/sandy-green-eyes.png" alt="" width="44" height="44"><span><strong>Business Japanese</strong><small>with Sandy</small></span></a><nav class="side-navigation" aria-label="主导航"><div class="nav-overview">${link({page:"home",label:"学习主页",icon:"home"})}</div>${NAV_GROUPS.map((group,index)=>`<section class="nav-section" aria-labelledby="nav-${group.id}"><h2 id="nav-${group.id}"><span class="nav-step">0${index+1}</span>${group.label}</h2>${group.items.map(link).join("")}</section>`).join("")}</nav><nav class="support-navigation" aria-label="辅助工具"><p>工具与资料</p>${SUPPORT_LINKS.map(link).join("")}</nav><div class="sidebar-note">每天一点，让表达更自然。<span>9 个工作与生活场景</span></div></aside><nav class="mobile-navigation" aria-label="移动端主导航">${mobile.map(item=>`<a href="${ROUTES[item.page]}" ${page===item.page?'aria-current="page"':item.group===navigationGroup(page)?.id?'aria-current="location"':""}>${navIcon(item.icon)}<span>${item.label}</span></a>`).join("")}</nav>`;
  }
  function localNavigationMarkup(page) {
    const group=navigationGroup(page); if(!group) return "";
    const links=[...group.items,...(group.id==="review"?[SUPPORT_LINKS[0]]:page==="textbook"?[SUPPORT_LINKS[1]]:[])];
    return `<nav class="local-navigation" aria-label="${group.label}中的页面">${links.map(item=>`<a href="${ROUTES[item.page]}" ${page===item.page?'aria-current="page"':""}>${item.label}</a>`).join("")}</nav>`;
  }
  function setupNavigation() {
    const toggle=$("menuToggle"),navigation=$("appNavigation");
    const setOpen=open=>{ document.body.classList.toggle("navigation-open",open); toggle.setAttribute("aria-expanded",String(open)); toggle.setAttribute("aria-label",open?"收起导航":"打开导航"); };
    toggle.onclick=()=>{ const open=toggle.getAttribute("aria-expanded")!=="true"; setOpen(open); if(open) (navigation.querySelector('a[aria-current="page"]')||navigation.querySelector("a"))?.focus(); };
    document.addEventListener("keydown",event=>{ if(event.key==="Escape"&&toggle.getAttribute("aria-expanded")==="true") { setOpen(false); toggle.focus(); } });
    document.addEventListener("click",event=>{ if(!navigation.contains(event.target)&&!toggle.contains(event.target)) setOpen(false); });
    navigation.addEventListener("click",event=>{ if(event.target.closest("a")) setOpen(false); });
    const desktop=window.matchMedia?.("(min-width: 901px)"); desktop?.addEventListener("change",event=>{ if(event.matches) setOpen(false); });
  }
  function reviewPending() { return studyItems().filter(item=>reviewFor(item.id)&&!reviewFor(item.id).mastered).length; }
  function updateNavigation() {
    const count=reviewPending();
    document.querySelectorAll("[data-review-count]").forEach(node=>{ node.hidden=!count; node.textContent=String(count); node.setAttribute("aria-label",`${count} 项待复习`); });
  }
  function resumeLearning() {
    const kinds={vocab:"vocab",grammar:"expression",quiz:"expression",practice:"trap",dialogues:"dialogue"};
    const entries=Object.entries(state.progress).filter(([page,progress])=>kinds[page]&&byId.get(progress?.id)?.kind===kinds[page]);
    entries.sort((a,b)=>String(b[1].updatedAt||"").localeCompare(String(a[1].updatedAt||"")));
    if(!entries.length) return {saved:false,page:"dialogues",item:D.dialogues[0],href:`conversations.html#${D.dialogues[0].id}`};
    const [page,progress]=entries[0],item=byId.get(progress.id);
    return {saved:true,page,item,href:`${ROUTES[page]}#${item.id}`};
  }
  function homeMarkup() {
    const resume=resumeLearning(),chapter=D.chapters[resume.item.lesson-1],pending=reviewPending();
    const answered=Object.entries(state.answers).filter(([id,answer])=>["expression","trap"].includes(byId.get(id)?.kind)&&answer&&!answer.archived).length;
    const resumeTerm=["quiz","practice"].includes(resume.page)?resume.item.question:resume.item.term;
    return `<section class="home-hero" aria-labelledby="resumeTitle"><div class="home-hero-copy"><span class="home-kicker">${resume.saved?"接着上次，不必从头开始":"从一个真实场景开始"}</span><h2 id="resumeTitle">${resume.saved?"继续你的学习":"和 Sandy 开口说日语"}</h2><p>${resume.saved?`${esc(TITLES[resume.page])} · 第 ${String(chapter.id).padStart(2,"0")} 课 ${esc(chapter.zh)}`:"听懂一句，再试着自己说一句。"}</p><div class="resume-term" lang="ja">${esc(resumeTerm)}</div><a class="home-primary" href="${resume.href}">${resume.saved?"继续上次学习":"开始会话跟读"}${navIcon("arrow")}</a></div><div class="home-hero-art" aria-hidden="true"><div class="hero-orbit"></div><img src="assets/sandy-green-eyes.png" alt=""><span>ゆっくり、一緒に。</span></div></section><section class="home-paths" aria-label="选择学习方式">${[{id:"learn",title:"先学懂",description:"看读音、记词汇，理解表达怎么用。",href:"vocab.html",action:"学习词汇",icon:"book"},{id:"practice",title:"再用出来",description:"在会话和句子里练习，而不只记答案。",href:"conversations.html",action:"练习会话",icon:"chat"},{id:"review",title:"回头巩固",description:pending?`${pending} 项待复习，包含错题和星标内容。`:"遇到不熟悉的内容，点 ☆ 留到这里。",href:"mistakes.html",action:pending?"复习待练内容":"查看复习本",icon:"star"}].map((path,index)=>`<a class="home-path" href="${path.href}"><span class="path-number">0${index+1}</span>${navIcon(path.icon)}<h2>${path.title}</h2><p>${path.description}</p><span class="path-action">${path.action}${navIcon("arrow")}</span></a>`).join("")}</section><section class="home-chapters" id="chapters" aria-labelledby="chaptersTitle"><div class="section-heading"><div><span class="eyebrow">按场景学习</span><h2 id="chaptersTitle">九个场景，一条学习路线</h2></div><a href="textbook.html">查阅教材 ${navIcon("arrow")}</a></div><div class="chapter-route">${D.chapters.map(c=>`<article class="chapter-stop"><span class="chapter-number">${String(c.id).padStart(2,"0")}</span><div class="chapter-copy"><span class="chapter-group">${esc(c.group)}</span><h3>${esc(c.zh)}</h3><p lang="ja">${esc(c.title)}</p><div class="chapter-actions"><a href="vocab.html#${D.vocab.find(x=>x.lesson===c.id).id}">词汇</a><a href="grammar.html#expr-${c.id}-1">表达</a><a href="conversations.html#${D.dialogues.find(x=>x.lesson===c.id).id}">会话 ${navIcon("arrow")}</a></div></div></article>`).join("")}</div></section><p class="home-footnote">${answered?`已完成 ${answered} 道练习 · `:""}学习进度和复习记录沿用原来的保存方式。</p>`;
  }
  function renderHome() { $("pageContent").innerHTML=homeMarkup(); updateNavigation(); }
  function toast(text,error=false) { $("toast").textContent=text; $("toast").classList.toggle("error",error); $("toast").hidden=false; clearTimeout(toast.timer); toast.timer=setTimeout(()=>$("toast").hidden=true,3300); }
  function makeShadowWord(key,start,end) {
    if(typeof key!=="string"||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end<=start) return null;
    const parts=key.split(":"); if(parts.length!==2||!/^\d+$/.test(parts[1])) return null;
    const source=D.dialogues.find(item=>item.id===parts[0]),index=Number(parts[1]),turn=source?.turns[index];
    if(!turn||end>turn.jp.length) return null;
    const raw=turn.jp.slice(start,end),lead=raw.match(/^[\p{P}\p{Z}\s]+/u)?.[0].length||0,tail=raw.match(/[\p{P}\p{Z}\s]+$/u)?.[0].length||0;
    start+=lead; end-=tail; if(end<=start) return null;
    const term=turn.jp.slice(start,end); if(!normalizeSpoken(term)) return null;
    const known=D.vocab.find(item=>item.term===term);
    return {id:`shadow-${source.id}-${index}-${start}-${end}`,kind:"shadow-word",key,start,end,sourceId:source.id,turnIndex:index,lesson:source.lesson,category:"跟读错词",term,reading:known?.reading||"",zh:known?.zh||"跟读中标记的词 · 结合原句核对",en:known?.en||"Saved from a shadowing check",example:turn.jp,exampleZh:turn.zh,sourcePage:source.sourcePage,sourcePdf:source.sourcePdf};
  }
  // Persist only a pointer into a known source sentence and review metadata.
  // Never store the recording, complete transcript or the misrecognized spelling.
  function shadowWordRecord(value) {
    return {key:value.key,start:value.start,end:value.end,isFavorite:Boolean(value.isFavorite),mastered:Boolean(value.mastered),archived:Boolean(value.archived),reason:REASONS.includes(value.reason)?value.reason:"",updatedAt:String(value.updatedAt||"")};
  }
  function refreshShadowWordItems() {
    shadowWordItems.forEach(item=>byId.delete(item.id)); shadowWordItems=[];
    state.shadowWords||={};
    for(const [id,record] of Object.entries(state.shadowWords)) {
      if(!record||typeof record!=="object") { delete state.shadowWords[id]; continue; }
      const item=makeShadowWord(record.key,record.start,record.end);
      if(!item||item.id!==id) { delete state.shadowWords[id]; continue; }
      state.shadowWords[id]=shadowWordRecord(record); shadowWordItems.push(item); byId.set(id,item);
    }
  }
  function studyItems() { return [...allItems,...shadowWordItems.filter(item=>reviewFor(item.id))]; }
  function reviewSection(item) { return item.kind==="shadow-word"?"shadowWords":"review"; }
  function reviewFor(id) { const r=byId.get(id)?.kind==="shadow-word"?state.shadowWords[id]:state.review[id]; return r&&!r.archived?r:null; }
  function setReview(item,patch={}) {
    const section=reviewSection(item),previous=state[section][item.id]||{};
    const value={...previous,id:item.id,source:patch.source||previous.source||PAGE,archived:false,isFavorite:previous.isFavorite||false,isWrong:previous.isWrong||false,...patch};
    save(section,item.id,item.kind==="shadow-word"?shadowWordRecord({...value,key:item.key,start:item.start,end:item.end}):value);
  }
  function favorite(item) { return Boolean(reviewFor(item.id)?.isFavorite); }
  function star(item) {
    const label=["practice","quiz"].includes(PAGE)?`第 ${Math.max(1,listItems.findIndex(x=>x.id===item.id)+1)} 题`:item.term;
    return `<button class="icon-button favorite" data-star="${item.id}" type="button" aria-label="${favorite(item)?"取消星标":"加入复习本"}：${esc(label)}" aria-pressed="${favorite(item)}">${favorite(item)?"★":"☆"}</button>`;
  }
  function sourceLink(item) { return `<a href="textbook.html?page=${item.sourcePdf}" class="source-link">教材 p.${item.sourcePage}</a>`; }
  function reasonSelect(item) {
    const reason=reviewFor(item.id)?.reason||"";
    return `<label class="reason-select">错因标签<select data-reason="${item.id}" aria-label="${esc(item.term)}的错因"><option value="">选一个错因…</option>${REASONS.map(r=>`<option ${r===reason?"selected":""} value="${esc(r)}">${r}</option>`).join("")}</select></label>`;
  }
  function itemTags(item) { const c=D.chapters[item.lesson-1]; return [`lesson:${item.lesson}`,`cat:${item.category}`,`kind:${item.kind}`,`group:${c.group}`,...(reviewFor(item.id)?.reason?[`reason:${reviewFor(item.id).reason}`]:[])]; }
  function tagLabel(tag) {
    const [type,...rest]=tag.split(":"); const value=rest.join(":");
    if(type==="lesson") return `${String(value).padStart(2,"0")} ${D.chapters[Number(value)-1]?.zh||value}`;
    if(type==="kind") return {vocab:"词汇",expression:"表达",dialogue:"会话",trap:"商务二选一","shadow-word":"跟读错词"}[value]||value;
    return value;
  }
  function tagLink(tag) { return `<a class="tag" href="tag.html?tag=${encodeURIComponent(tag)}">${esc(tagLabel(tag))}</a>`; }
  function meta(item) { return `<div class="meta">${tagLink(`lesson:${item.lesson}`)}${tagLink(`cat:${item.category}`)}${sourceLink(item)}</div>`; }
  function loadPagePreferences() {
    const pref=state.preferences[`page-${PAGE}`]||{}; filters=new Set(pref.filters||[]); favoriteOnly=Boolean(pref.favoriteOnly); includeMastered=Boolean(pref.includeMastered);
    if(PAGE==="tags"&&params.get("tag")) filters.add(params.get("tag"));
  }
  function savePagePreferences() { save("preferences",`page-${PAGE}`,{filters:[...filters],favoriteOnly,includeMastered}); }
  function baseItems() {
    if(PAGE==="vocab") return D.vocab;
    if(PAGE==="grammar"||PAGE==="quiz") return D.expressions;
    if(PAGE==="practice") return D.traps;
    if(PAGE==="dialogues") return D.dialogues;
    if(PAGE==="mistakes"||PAGE==="shadowwords") return (PAGE==="shadowwords"?shadowWordItems:studyItems()).filter(x=>reviewFor(x.id)&&(!reviewFor(x.id).mastered||includeMastered));
    if(PAGE==="tags") return studyItems();
    return [];
  }
  function visibleItems() {
    const filterGroups=new Map(); filters.forEach(tag=>{ const type=tag.split(":")[0]; if(!filterGroups.has(type)) filterGroups.set(type,[]); filterGroups.get(type).push(tag); });
    const result=baseItems().filter(item=>{ const tags=itemTags(item); return [...filterGroups.values()].every(group=>group.some(tag=>tags.includes(tag))); }).filter(item=>!favoriteOnly||Boolean(reviewFor(item.id))).filter(item=>!query||[item.term,item.reading,item.zh,item.en,item.example,item.category,reviewFor(item.id)?.reason||""].join(" ").toLowerCase().includes(query));
    return PAGE==="vocab"?result.sort((a,b)=>toKana(a.reading).localeCompare(toKana(b.reading),"ja")||a.lesson-b.lesson):["mistakes","shadowwords"].includes(PAGE)?result.sort((a,b)=>String(reviewFor(b.id).updatedAt).localeCompare(String(reviewFor(a.id).updatedAt))):result;
  }
  function toolsUI() {
    return `<section class="toolbar" aria-label="学习工具"><input id="search" class="search" type="search" placeholder="搜索日语、读音、中文、英文…" aria-label="搜索"><label class="voice-picker">日语声音<select id="voiceSelect" aria-label="选择日语声音"><option value="">设备默认日语</option></select></label><button id="soundToggle" class="pill" aria-pressed="true">🔊</button><button id="autoToggle" class="pill" aria-pressed="false">▶ 自动听读</button><button id="reviewOnly" class="pill" aria-pressed="false">★</button><button id="boardToggle" class="pill" aria-expanded="false" aria-label="打开或收起写字板">✎</button></section><details class="filter-panel" id="filters"><summary><span id="filterSummary">筛选标签</span></summary><div class="filter-content" id="filterContent"></div></details><div class="status" id="status" role="status"></div><section class="list" id="list"></section><div class="empty" id="empty" hidden>这里还没有项目。可以调整筛选，或先给想复习的内容加上 ★。</div>`;
  }
  function renderFilters() {
    if(!$("filterContent")) return;
    const source=PAGE==="mistakes"?studyItems().filter(x=>reviewFor(x.id)):PAGE==="shadowwords"?shadowWordItems.filter(x=>reviewFor(x.id)):baseItems();
    const available=new Set(source.flatMap(itemTags));
    const groups=D.chapters.reduce((result,c)=>{ let group=result.find(g=>g.title===c.group); if(!group) { group={title:c.group,tags:[]}; result.push(group); } group.tags.push(`lesson:${c.id}`); return result; },[]);
    groups.push({title:"表达功能 / 词汇类型",tags:[...available].filter(t=>t.startsWith("cat:")).sort((a,b)=>tagLabel(a).localeCompare(tagLabel(b),"zh"))});
    if(["tags","mistakes"].includes(PAGE)) groups.push({title:"内容类型",tags:["kind:vocab","kind:expression","kind:dialogue","kind:trap","kind:shadow-word"]});
    if(["tags","mistakes","shadowwords"].includes(PAGE)||favoriteOnly) groups.push({title:"我的错因",tags:REASONS.map(r=>`reason:${r}`)});
    const sections=groups.filter(g=>g.tags.length);
    $("filterContent").innerHTML=`<button class="pill" id="clearFilters">全部 / 清空筛选</button>${sections.map((g,i)=>{ const groupSelected=g.tags.every(t=>filters.has(t)); return `<section class="filter-group"><div class="group-head"><span>${esc(g.title)}</span><button class="group-select" data-filter-group="${i}" aria-pressed="${groupSelected}">${groupSelected?"取消本组":"全选本组"}</button></div><div class="tags">${g.tags.map(t=>`<button class="tag" data-filter="${esc(t)}" aria-pressed="${filters.has(t)}">${esc(tagLabel(t))} · ${source.filter(x=>itemTags(x).includes(t)).length}</button>`).join("")}</div></section>`; }).join("")}`;
    $("filterContent")._groups=sections;
    $("filterSummary").textContent=filters.size?`筛选标签 · 已选 ${filters.size} 个`:"筛选标签 · 可折叠 / 多选";
  }

  function renderTerm(item) {
    return `<button class="term" data-read="${item.id}" aria-label="朗读 ${esc(item.term)}"><span class="reading" lang="ja">${esc(toKana(item.reading))}</span><span class="kanji" lang="ja">${esc(item.term)}</span></button>`;
  }
  function listCard(item,index) {
    return `<article class="entry" id="${item.id}" data-item="${item.id}"><div class="num"><span>${String(index+1).padStart(3,"0")}</span>${star(item)}</div><div>${renderTerm(item)}${meta(item)}</div><div class="meaning"><strong>${esc(item.zh)}</strong><div class="english">${esc(item.en)}</div>${item.connection?`<div class="english" lang="ja">${esc(item.connection)}</div>`:""}</div><button class="example" data-example="${item.id}" lang="ja" aria-label="朗读日语句子">🔊 ${esc(item.example)}</button><div class="example-translation">${esc(item.translation||"")}</div>${item.kind==="expression"?`<div class="point">${esc(item.note)}</div>`:""}${reviewFor(item.id)?`<div class="point">${reasonSelect(item)}</div>`:""}</article>`;
  }
  function optionsFor(item) {
    const choices=item.options||[{jp:item.answer,en:item.en},...item.wrong.map(jp=>{
      const target=D.expressions.find(x=>x.answer===jp||x.term.replace(/[～（）]/g,"").includes(jp));
      return {jp,en:target?.en||({"に決まっています":"Definitely…","わけにはいきません":"Cannot… because of responsibility","に越したことはありません":"There is nothing better than…","というわけではありません":"It does not mean that…","ことはありません":"There is no need to…","かぎり":"To the extent…","上で":"After doing…"}[jp]||jp)};
    })];
    // Deterministic shuffle preserves the order after returning to a saved question.
    let seed=[...item.id].reduce((n,c)=>(n*31+c.charCodeAt(0))>>>0,7);
    const result=[...choices]; for(let i=result.length-1;i>0;i--) { seed=(seed*1664525+1013904223)>>>0; const j=seed%(i+1); [result[i],result[j]]=[result[j],result[i]]; }
    return result;
  }
  function feedback(item,attempt) {
    if(!attempt||attempt.archived) return "";
    return `<div class="feedback"><h3>${attempt.correct?"٩(◕‿◕)۶ 答对了":"再看一下这个区别"}</h3><p>${esc(item.note)}</p><button class="example" data-example="${item.id}" lang="ja">🔊 ${esc(item.example)}</button>${item.translation?`<div class="english">${esc(item.translation)}</div>`:""}${!attempt.correct||reviewFor(item.id)?reasonSelect(item):""}<div class="feedback-actions"><button class="pill" data-retry="${item.id}">↻ 再练一次</button>${tagLink(`cat:${item.category}`)}</div></div>`;
  }
  function questionCard(item,index) {
    const attempt=state.answers[item.id]; const answered=attempt&&!attempt.archived;
    return `<article class="question-card" id="${item.id}" data-item="${item.id}"><div class="question-meta"><span class="tag">${String(index+1).padStart(3,"0")} · ${esc(D.chapters[item.lesson-1].zh)}</span>${star(item)}</div>${PAGE==="practice"?`<p class="question-context">${esc(item.context)}</p>`:""}<p class="question" lang="ja">${esc(item.question).replace("〔　　〕",'<span class="blank">（　）</span>')}</p><div class="choices">${optionsFor(item).map(option=>`<button class="choice${answered&&option.jp===item.answer?" correct":""}${answered&&option.jp===attempt.selected&&!attempt.correct?" wrong":""}" data-choice="${item.id}" data-value="${esc(option.jp)}" aria-label="${esc(option.jp)}" ${answered?'aria-disabled="true"':""}><strong lang="ja">${esc(option.jp)}</strong><span class="english">${esc(option.en)}</span></button>`).join("")}</div>${feedback(item,attempt)}</article>`;
  }
  function dialogueTurn(item,turn,index,role) {
    const key=`${item.id}:${index}`,jp=karaokeSentence(turn.jp,shadowStates.get(key));
    const readButton=`<div class="dialogue-japanese"><div class="line-sentence" lang="ja" data-turn-read="${item.id}" data-turn-index="${index}" data-karaoke-line="${key}">${jp}</div><button class="icon-button line-read" data-turn-read="${item.id}" data-turn-index="${index}" aria-label="朗读原台词：${esc(turn.jp)}">🔊</button></div>`;
    const spoken=role===turn.speaker?`<details><summary class="role-prompt">轮到你 · ${esc(turn.zh)}</summary>${readButton}</details>`:`${readButton}<div class="english">${esc(turn.zh)}</div><div class="english">${esc(turn.en)}</div>`;
    return `<div class="line" data-turn="${item.id}-${index}"><span class="speaker" lang="ja">${esc(turn.speaker)}</span><div class="turn-content">${spoken}${PAGE==="dialogues"?shadowingTools(item,index):""}</div></div>`;
  }
  function dialogueCard(item) {
    const role=roleModes.get(item.id)||""; const speakers=[...new Set(item.turns.map(x=>x.speaker))];
    return `<article class="dialogue-card" id="${item.id}" data-item="${item.id}"><div class="card-heading"><div><span class="tag">${esc(item.category)}</span><h2 lang="ja">${esc(item.term)}</h2><div class="english">${esc(item.zh)}</div></div>${star(item)}</div>${meta(item)}<div class="role-controls"><button class="pill" data-dialogue-play="${item.id}">▶ 整段听读</button><label>我的角色 <select data-role="${item.id}"><option value="">听全部</option>${speakers.map(s=>`<option value="${esc(s)}" ${s===role?"selected":""}>${esc(s)}</option>`).join("")}</select></label><button class="pill" data-dialogue-next="${item.id}" hidden>我说完了 →</button></div><div class="lines">${item.turns.map((turn,index)=>dialogueTurn(item,turn,index,role)).join("")}</div>${reviewFor(item.id)?reasonSelect(item):""}</article>`;
  }

  // Compare recognized text, not pronunciation. The recognizer may choose different
  // kanji/kana spellings: never present its confidence or this diff as a speech score.
  function normalizeSpoken(text) {
    return toKana(text).toLowerCase().replace(/[\p{P}\p{Z}\p{Cf}\s]/gu,"");
  }
  function spokenTokens(text) {
    const limited=Array.from(String(text||"")).slice(0,1000).join("");
    const segmented=typeof Intl.Segmenter==="function";
    const graphemes=segmented?Array.from(new Intl.Segmenter("ja",{granularity:"grapheme"}).segment(limited),x=>x.segment):Array.from(limited);
    let canonical="";
    const originals=graphemes.map(raw=>{ const start=canonical.length; canonical+=toKana(raw).toLowerCase(); return {raw,start,end:canonical.length}; });
    // Segment the normalized spelling, so サービス and さーびす have the same
    // boundaries. Keep a grapheme map to highlight the original, unmodified text.
    let index=0;
    const pieces=segmented?Array.from(new Intl.Segmenter("ja",{granularity:"word"}).segment(canonical)):Array.from(canonical,segment=>{ const piece={segment,index}; index+=segment.length; return piece; });
    const tokens=[]; let prefix="",cursor=0;
    for(const piece of pieces) {
      const end=piece.index+piece.segment.length; let surface="";
      while(cursor<originals.length&&originals[cursor].start<end) surface+=originals[cursor++].raw;
      const key=normalizeSpoken(piece.segment);
      if(key) { tokens.push({text:prefix+surface,key}); prefix=""; }
      else if(tokens.length) tokens[tokens.length-1].text+=surface;
      else prefix+=surface;
    }
    return tokens;
  }
  function compareSpoken(expected,heard) {
    const a=spokenTokens(expected),b=spokenTokens(heard);
    if(!b.length) return {empty:true,matched:false,operations:[],counts:{missing:0,different:0,extra:0}};
    if(normalizeSpoken(expected)===normalizeSpoken(heard)) return {empty:false,matched:true,operations:[{type:"same",expected:String(expected),heard:String(heard)}],counts:{missing:0,different:0,extra:0}};
    const dp=Array.from({length:a.length+1},()=>new Uint16Array(b.length+1));
    for(let i=0;i<=a.length;i++) dp[i][0]=i;
    for(let j=0;j<=b.length;j++) dp[0][j]=j;
    for(let i=1;i<=a.length;i++) for(let j=1;j<=b.length;j++) dp[i][j]=a[i-1].key===b[j-1].key?dp[i-1][j-1]:Math.min(dp[i-1][j-1],dp[i-1][j],dp[i][j-1])+1;
    const operations=[]; let i=a.length,j=b.length;
    while(i||j) {
      if(i&&j&&a[i-1].key===b[j-1].key&&dp[i][j]===dp[i-1][j-1]) { operations.push({type:"same",expected:a[--i].text,heard:b[--j].text}); }
      else if(i&&j&&dp[i][j]===dp[i-1][j-1]+1) { operations.push({type:"different",expected:a[--i].text,heard:b[--j].text}); }
      else if(i&&dp[i][j]===dp[i-1][j]+1) { operations.push({type:"missing",expected:a[--i].text,heard:""}); }
      else { operations.push({type:"extra",expected:"",heard:b[--j].text}); }
    }
    operations.reverse();
    const chunks=[];
    for(const op of operations) {
      const previous=chunks[chunks.length-1];
      if(previous?.type===op.type) { previous.expected+=op.expected; previous.heard+=op.heard; }
      else chunks.push({...op});
    }
    const counts={missing:0,different:0,extra:0}; chunks.forEach(op=>{ if(op.type!=="same") counts[op.type]++; });
    return {empty:false,matched:dp[a.length][b.length]===0,operations:chunks,counts};
  }
  // Align only the spoken prefix. The unspoken suffix must NOT be treated as
  // missing. Recompute every hypothesis: browsers can revise or remove interim text.
  function compareLiveSpoken(expected,heard) {
    const words=spokenTokens(expected).map(token=>({...token,status:"pending",fill:0,current:false}));
    const chars=words.flatMap((word,wordIndex)=>Array.from(word.key,char=>({char,wordIndex})));
    const heardChars=Array.from(normalizeSpoken(Array.from(String(heard||"")).slice(0,1000).join("")));
    const waiting=()=>({words,located:false,currentText:"",hasUncertain:false});
    if(!chars.length||!heardChars.length) return waiting();
    const n=chars.length,m=heardChars.length,dp=Array.from({length:n+1},()=>new Uint16Array(m+1));
    for(let i=0;i<=n;i++) dp[i][0]=i;
    for(let j=0;j<=m;j++) dp[0][j]=j*2;
    // Prefer an exact later anchor over replacing it with an earlier, skipped word.
    // Insertions/substitutions cost more than a skipped source character.
    for(let i=1;i<=n;i++) for(let j=1;j<=m;j++) dp[i][j]=Math.min(dp[i-1][j-1]+(chars[i-1].char===heardChars[j-1]?0:2),dp[i-1][j]+1,dp[i][j-1]+2);
    let end=0;
    for(let i=1;i<=n;i++) if(dp[i][m]<dp[end][m]) end=i;
    const marks=Array(n).fill("pending"); let i=end,j=m,same=0,lastSpoken=-1,extras=0;
    while(i||j) {
      if(i&&j&&chars[i-1].char===heardChars[j-1]&&dp[i][j]===dp[i-1][j-1]) {
        marks[--i]="same"; j--; same++; lastSpoken=Math.max(lastSpoken,i);
      } else if(i&&j&&dp[i][j]===dp[i-1][j-1]+2) {
        marks[--i]="uncertain"; j--; lastSpoken=Math.max(lastSpoken,i);
      } else if(i&&dp[i][j]===dp[i-1][j]+1) marks[--i]="uncertain";
      else { j--; extras++; }
    }
    // Do not invent a karaoke position for an unrelated hypothesis.
    if(!same||same/Math.max(end,m)<.3) return waiting();
    words.forEach((word,index)=>{
      const parts=chars.flatMap((char,k)=>char.wordIndex===index?[marks[k]]:[]);
      const lit=parts.filter(mark=>mark==="same").length;
      word.fill=Math.round(lit/parts.length*100);
      word.status=parts.includes("uncertain")?"uncertain":lit===parts.length?"same":lit?"partial":"pending";
      word.current=index===chars[lastSpoken]?.wordIndex;
    });
    return {words,located:true,currentText:words.find(word=>word.current)?.text.trim()||"",hasUncertain:extras>0||marks.includes("uncertain")};
  }
  function karaokeSentence(expected,s) {
    if(["starting","listening","processing","typing"].includes(s?.phase)) {
      const live=s.live||compareLiveSpoken(expected,s.transcript);
      const labels={pending:"还未定位到这里",same:"识别文字相符，不是发音评分",partial:"部分文字已对应，等待识别更新",uncertain:"暂时未对应上，待核对，不代表发音错误"};
      let offset=0;
      return `<span class="karaoke-text">${live.words.map(word=>{ const start=offset; offset+=word.text.length; const content=word.status==="uncertain"?shadowWordButton(s,word.text,start,offset,"karaoke-word-read"):esc(word.text); return `<span class="karaoke-word karaoke-${word.status}${word.current?" karaoke-current":""}" style="--karaoke-fill:${word.fill}%" title="${labels[word.status]}" ${word.current?'aria-current="true"':""}>${content}</span>`; }).join("")}</span>`;
    }
    if(s?.phase==="result"&&!s.comparison.empty) return shadowExpectedParts(s);
    return esc(expected);
  }
  function shadowWordButton(s,text,start,end,className) {
    const word=makeShadowWord(s?.key,start,end);
    return word?`<button type="button" class="shadow-word-listen ${className||""}" lang="ja" data-shadow-word="${esc(word.key)}" data-word-start="${word.start}" data-word-end="${word.end}" aria-label="朗读词：${esc(word.term)}" title="单独朗读正确原词：${esc(word.term)}">${esc(text)}</button>`:`<span class="${className||""}">${esc(text)}</span>`;
  }
  function shadowExpectedParts(s) {
    let offset=0;
    return s.comparison.operations.filter(op=>op.expected).map(op=>{ const start=offset; offset+=op.expected.length; return op.type==="same"?`<span class="spoken-same">${esc(op.expected)}</span>`:shadowWordButton(s,op.expected,start,offset,`spoken-${op.type}`); }).join("");
  }
  function shadowWordCandidates(s) {
    if(s?.phase!=="result"||s.comparison?.empty||s.comparison?.matched) return [];
    let offset=0;
    return s.comparison.operations.flatMap(op=>{ const start=offset; offset+=(op.expected||"").length; const word=["missing","different"].includes(op.type)?makeShadowWord(s.key,start,offset):null; return word?[{...word,difference:op.type}]:[]; });
  }
  function shadowWordActions(s) {
    const words=shadowWordCandidates(s); if(!words.length) return "";
    return `<section class="shadow-word-actions" aria-label="本句待核对的词"><div class="shadow-word-heading"><span>点击词听原读音 · ☆ 留到错词本</span><a href="shadow-words.html">错词本 ↗</a></div>${words.map(word=>`<div class="shadow-word-row">${shadowWordButton(s,word.term,word.start,word.end,`spoken-${word.difference}`)}<button type="button" class="icon-button" data-shadow-save="${esc(word.key)}" data-word-start="${word.start}" data-word-end="${word.end}" aria-label="${favorite(word)?"取消收藏词":"收藏词"}：${esc(word.term)}" aria-pressed="${favorite(word)}">${favorite(word)?"★":"☆"}</button><span>${word.difference==="missing"?"可能漏读":"文字不同，待核对"}</span></div>`).join("")}</section>`;
  }
  function recognitionError(code) {
    return {"NotAllowedError":"麦克风未允许。请在浏览器及 macOS 的麦克风设置中允许后重试。","NotFoundError":"找不到麦克风，请检查输入设备。","NotReadableError":"麦克风被占用或无法打开，请检查系统输入设备。","no-speech":"没有识别到日语声音，不作判定。请检查麦克风电平后重新读。","timeout":"等待超时，麦克风已停止。未获得权限时请允许麦克风后重试。","unsupported":"此浏览器未开放录音接口；本机 Whisper 不依赖浏览器的语音服务，但仍需要麦克风权限。请在独立 Safari／Chrome 打开这个本机地址。","local-only":"本地识别只在这台 Mac 的 http://127.0.0.1:8765 页面可用，不会向在线网站发送录音。","connection":"连接不到本机 Whisper。请保持本机预览服务运行，再刷新重试。","capture":"录音启动失败，麦克风已停止。请检查设备及权限后重试。"}[code]||"本机识别失败，不作判定。请重试。";
  }
  function pcmWav(chunks,rate) {
    // Average source intervals when downsampling, then encode mono 16 kHz PCM16.
    const length=chunks.reduce((sum,chunk)=>sum+chunk.length,0),pcm=new Float32Array(length);
    let offset=0; for(const chunk of chunks) { pcm.set(chunk,offset); offset+=chunk.length; }
    const size=Math.floor(length*16000/rate),buffer=new ArrayBuffer(44+size*2),view=new DataView(buffer);
    const ascii=(at,value)=>{ for(let i=0;i<value.length;i++) view.setUint8(at+i,value.charCodeAt(i)); };
    ascii(0,"RIFF"); view.setUint32(4,36+size*2,true); ascii(8,"WAVE"); ascii(12,"fmt ");
    view.setUint32(16,16,true); view.setUint16(20,1,true); view.setUint16(22,1,true); view.setUint32(24,16000,true);
    view.setUint32(28,32000,true); view.setUint16(32,2,true); view.setUint16(34,16,true); ascii(36,"data"); view.setUint32(40,size*2,true);
    for(let i=0;i<size;i++) {
      const start=i*rate/16000,end=(i+1)*rate/16000; let value=0,weight=0;
      for(let j=Math.floor(start);j<Math.ceil(end);j++) { const w=Math.min(end,j+1)-Math.max(start,j); value+=(pcm[j]||0)*w; weight+=w; }
      const sample=Math.max(-1,Math.min(1,value/weight)); view.setInt16(44+i*2,Math.round(sample*(sample<0?32768:32767)),true);
    }
    return new Blob([buffer],{type:"audio/wav"});
  }
  class PcmRecorder {
    constructor(onSamples) {
      const Context=window.AudioContext||window.webkitAudioContext;
      this.context=new Context(); this.rate=this.context.sampleRate; this.onSamples=onSamples; this.closed=false;
      // Resume during the user's click, before waiting for the local server.
      this.resuming=this.context.resume(); this.resuming.catch(()=>{});
    }
    async start() {
      const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});
      if(this.closed) { stream.getTracks().forEach(track=>track.stop()); throw new Error("cancelled"); }
      this.stream=stream;
      stream.getAudioTracks().forEach(track=>track.addEventListener("ended",()=>{ if(!this.closed) this.onError?.({name:"NotReadableError"}); }));
      await this.resuming;
      await this.context.audioWorklet.addModule("assets/mic-worklet.js");
      if(this.closed) throw new Error("cancelled");
      this.node=new AudioWorkletNode(this.context,"sandy-mic",{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
      this.node.onprocessorerror=()=>{ if(!this.closed) this.onError?.({name:"NotReadableError"}); };
      this.node.port.onmessage=event=>{
        if(event.data.samples) this.onSamples(event.data.samples,this.rate);
        if(event.data.flushed) this.flushed?.();
      };
      this.source=this.context.createMediaStreamSource(stream); this.source.connect(this.node); this.node.connect(this.context.destination);
    }
    async close() {
      if(this.closed) return this.closing;
      this.closed=true; this.stream?.getTracks().forEach(track=>track.stop()); this.source?.disconnect();
      this.closing=(async()=>{
        if(this.node) await new Promise(resolve=>{
          const timer=setTimeout(resolve,300); this.flushed=()=>{ clearTimeout(timer); resolve(); }; this.node.port.postMessage("flush");
        });
        this.node?.disconnect(); if(this.node) this.node.port.onmessage=null;
        await this.context.close().catch(()=>{});
      })();
      return this.closing;
    }
  }
  class ShadowRecognizer {
    constructor({local=["127.0.0.1","localhost"].includes(location.hostname)&&location.protocol==="http:",supported=!!(window.isSecureContext&&navigator.mediaDevices?.getUserMedia&&(window.AudioContext||window.webkitAudioContext)&&window.AudioWorkletNode),onChange=()=>{},captureFactory=onSamples=>new PcmRecorder(onSamples),fetcher=(...args)=>window.fetch(...args),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id)}={}) {
      Object.assign(this,{local,supported,onChange,captureFactory,fetcher,setTimer,clearTimer}); this.active=null;
    }
    async request(path,options={},timeout=6000) {
      const controller=new AbortController(),timer=this.setTimer(()=>controller.abort(),timeout);
      try {
        const response=await this.fetcher(path,{...options,signal:controller.signal});
        const data=await response.json();
        if(!response.ok) throw Object.assign(new Error(data.message),{code:data.code});
        return data;
      } catch(error) { if(error.name==="AbortError") throw Object.assign(new Error(recognitionError("timeout")),{code:"timeout"}); throw error; }
      finally { this.clearTimer(timer); }
    }
    emit(run,phase,extra={}) {
      const state={key:run.key,expected:run.expected,transcript:run.text||"",phase,source:"microphone",stage:run.stage,seconds:run.samples/(run.rate||48000),level:run.level||0,...extra};
      if(["starting","listening","processing"].includes(phase)) state.live=compareLiveSpoken(run.expected,state.transcript);
      this.onChange(state);
    }
    release(run) {
      this.clearTimer(run.timer); this.clearTimer(run.tick); this.clearTimer(run.limit);
      if(this.active===run) this.active=null;
      run.capture?.close(); run.chunks=[]; this.cancelJob(run);
    }
    async cancelJob(run) {
      const job=run.job; if(!job) return;
      run.job=null;
      try { await this.request("/api/speech/cancel",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({session:job.id})},3000); } catch {}
      job.controller.abort();
    }
    cancel(message="识别已取消，麦克风已停止。") {
      const run=this.active; if(!run) return;
      this.release(run); this.emit(run,"cancelled",{message});
    }
    fail(run,error) {
      if(this.active!==run) return;
      this.release(run); this.emit(run,"error",{message:error?.code&&error.message?error.message:recognitionError(typeof error==="string"?error:error?.name||"capture")});
    }
    async start(key,expected) {
      this.cancel("已切换到另一句，上一句识别已停止。");
      const run={key,expected,text:"",chunks:[],samples:0,rate:48000,phase:"starting",stage:"checking"};
      if(!this.local||!this.supported) { this.emit(run,"error",{message:recognitionError(!this.local?"local-only":"unsupported")}); return; }
      this.active=run;
      try {
        this.emit(run,"starting");
        run.capture=this.captureFactory((samples,rate)=>{
          if(this.active!==run||!["starting","listening","processing"].includes(run.phase)) return;
          const remaining=Math.max(0,Math.floor(rate*60)-run.samples),chunk=samples.slice(0,remaining);
          run.rate=rate; if(!chunk.length) return; run.chunks.push(chunk); run.samples+=chunk.length;
          run.level=Math.min(100,Math.round(Math.sqrt(chunk.reduce((sum,value)=>sum+value*value,0)/chunk.length)*500));
          if(run.phase==="listening"&&run.samples-(run.shownAt||0)>rate/2) { run.shownAt=run.samples; this.emit(run,"listening"); }
        });
        run.capture.onError=error=>this.fail(run,error);
        const status=await this.request("/api/speech/status");
        if(this.active!==run) return;
        if(!status.ready) throw Object.assign(new Error(status.message),{code:"not-ready"});
        run.stage="permission"; this.emit(run,"starting");
        run.timer=this.setTimer(()=>this.fail(run,"timeout"),20000);
        await run.capture.start();
        if(this.active!==run) { run.capture.close(); return; }
        this.clearTimer(run.timer); run.phase="listening"; run.stage="recording"; this.emit(run,"listening");
        run.limit=this.setTimer(()=>this.stop(),60000);
        this.schedule(run);
      } catch(error) { this.fail(run,error instanceof TypeError?"connection":error); }
    }
    schedule(run) {
      if(this.active===run&&run.phase==="listening") run.tick=this.setTimer(()=>this.transcribe(run,false),3000);
    }
    async transcribe(run,final) {
      if(this.active!==run||(!final&&run.phase!=="listening")) return;
      if(run.samples/run.rate<.25) { if(final) this.fail(run,"no-speech"); else this.schedule(run); return; }
      const job={id:crypto.randomUUID(),controller:new AbortController()}; run.job=job;
      const timer=this.setTimer(()=>job.controller.abort(),95000);
      try {
        const body=pcmWav(run.chunks,run.rate); run.stage="decoding"; this.emit(run,run.phase);
        let data;
        for(let retry=0;retry<8;retry++) {
          const response=await this.fetcher("/api/speech/transcribe",{method:"POST",headers:{"Content-Type":"audio/wav","X-Speech-Session":job.id},body,signal:job.controller.signal});
          data=await response.json();
          if(response.ok) break;
          if(data.code!=="busy"||retry===7) throw Object.assign(new Error(data.message),{code:data.code});
          await new Promise(resolve=>this.setTimer(resolve,350));
          if(this.active!==run||run.job!==job) return;
        }
        if(this.active!==run||run.job!==job) return;
        run.job=null; run.text=data.text||""; run.stage="recording";
        if(final) {
          if(!normalizeSpoken(run.text)) { this.fail(run,"no-speech"); return; }
          this.release(run); this.emit(run,"result",{comparison:compareSpoken(run.expected,run.text)});
        } else this.emit(run,"listening");
      } catch(error) { if(this.active===run&&run.job===job) this.fail(run,error.name==="AbortError"?"timeout":error instanceof TypeError?"connection":error); }
      finally { this.clearTimer(timer); if(run.job===job) run.job=null; if(!final) this.schedule(run); }
    }
    async stop() {
      const run=this.active; if(!run) return;
      if(run.phase!=="listening") { this.cancel(); return; }
      run.phase="processing"; run.stage="finishing"; this.emit(run,"processing");
      this.clearTimer(run.tick); this.clearTimer(run.limit);
      // Stop hardware first, before waiting for any final CPU inference.
      await Promise.all([run.capture.close(),this.cancelJob(run)]);
      if(this.active===run) await this.transcribe(run,true);
    }
  }
  function shadowingMarkup(s) {
    if(!s) return "";
    if(s.phase==="consent") return `<div class="mic-consent"><p>录音只交给这台 Mac 的 Whisper 处理，不上传互联网或学习账户，处理完自动删除。确认后浏览器会请求麦克风权限。</p><p class="comparison-note">此说明只需确认一次，同一浏览器和网站会记住；之后点击「跟读检查」即可开始。</p><div class="tags"><button type="button" class="pill" data-shadow-start="${esc(s.key)}">允许本机录音并开始</button><button type="button" class="link-button" data-shadow-cancel="${esc(s.key)}">取消</button></div></div>`;
    if(["starting","listening","processing","typing"].includes(s.phase)) {
      const live=s.live||compareLiveSpoken(s.expected,s.transcript);
      const status=s.phase==="starting"?(s.stage==="permission"?"请允许浏览器使用麦克风（最多等待 20 秒）":"正在检查本机 Whisper…"):s.phase==="listening"?`本机录音 · ${Math.floor(s.seconds||0)} 秒 · ${s.stage==="decoding"?"Whisper 正在识别，仍可继续读":"读完点「停止并比对」"}`:s.phase==="typing"?"系统听写／输入预览 · 非麦克风识别":"麦克风已停止 · 本机 Whisper 正在比对…";
      return `<p class="mic-status">${status}</p>${s.phase==="listening"?`<div class="mic-level"><span>麦克风电平</span><meter min="0" max="100" value="${s.level||0}">${s.level||0}</meter><span>${s.level?"收到声音":"请读一句，检查电平是否变化"}</span></div>`:""}<div class="karaoke-position">${live.located?`暂定读到 <strong lang="ja">${esc(live.currentText)}</strong>${live.hasUncertain?" · 有片段待核对":""}`:s.transcript?"暂时无法定位，请从句首读或等待文字更新。":"请从句首读，文字会跟着识别结果亮起。"}</div><div class="karaoke-legend"><span class="karaoke-same">文字相符</span><span class="karaoke-uncertain">待核对</span><span class="karaoke-pending">还未读到</span></div>${s.transcript?`<div class="heard-live"><span class="comparison-label">${s.source==="manual"?"输入文字":"暂定识别文字"}</span><span lang="ja">${esc(s.transcript)}</span></div>`:""}<p class="comparison-note">本机识别分段更新，可能延迟数秒；黄色不是发音错误。读完后再判断可能漏读的部分。</p>`;
    }
    if(s.phase!=="result") return `<p class="mic-status ${s.phase==="error"?"error":""}">${esc(s.message)}</p>`;
    const diff=s.comparison;
    if(diff.empty) return '<p class="mic-status">没有识别到日语文字，不作判定。请再读一次。</p>';
    const parts=side=>side==="expected"?shadowExpectedParts(s):diff.operations.filter(op=>op[side]).map(op=>`<span class="spoken-${op.type}" title="${{same:"相符",missing:"可能漏读",different:"文字不同",extra:"识别文字多出"}[op.type]}">${esc(op[side])}</span>`).join("");
    const counts=diff.counts;
    return `<div class="spoken-summary ${diff.matched?"matched":""}">${diff.matched?"✓ 识别文字与台词相符":`${counts.missing} 处可能漏读 · ${counts.different} 处不同 · ${counts.extra} 处多出`}<small>${s.source==="manual"?"手动文字比对":"日语语音识别结果"} · 不是发音评分</small></div>${s.notice?`<p class="comparison-note">${esc(s.notice)}</p>`:""}<div class="spoken-comparison"><div><span class="comparison-label">原台词</span><p lang="ja">${parts("expected")}</p></div><div><span class="comparison-label">${s.source==="manual"?"输入文字":"识别文字"}</span><p lang="ja">${parts("heard")}</p></div></div>${shadowWordActions(s)}${diff.matched?"":'<div class="spoken-legend"><span class="spoken-missing">可能漏读</span><span class="spoken-different">不同</span><span class="spoken-extra">多出</span></div>'}<p class="comparison-note">汉字／假名写法和识别误差可能造成差异，请听原句核对；这里不判断发音、重音或语调。</p>`;
  }
  function shadowingTools(item,index) {
    const key=`${item.id}:${index}`,s=shadowStates.get(key); const active=["starting","listening","processing"].includes(s?.phase);
    return `<div class="shadowing-tools"><button type="button" class="pill mic-button" data-shadow-listen="${item.id}" data-turn-index="${index}" aria-pressed="${active}">${active?(s.phase==="processing"?"× 取消识别":"■ 停止并比对"):"🎙 跟读检查"}</button><details class="manual-shadowing"><summary>⌨ 系统听写／文字比对</summary><form data-shadow-form="${key}"><label for="heard-${key}">粘贴日语，或用键盘的日语听写；输入时也会高亮</label><textarea id="heard-${key}" data-shadow-text="${key}" rows="2" maxlength="1000" lang="ja" placeholder="在这里输入识别出的日语…">${esc(s?.transcript||"")}</textarea><button class="pill" type="submit">比对文字</button></form></details></div><div class="shadowing-result" data-shadow-key="${key}" aria-live="${active||s?.phase==="typing"?"off":"polite"}" aria-atomic="true" ${s?"":"hidden"}>${shadowingMarkup(s)}</div>`;
  }
  function updateShadowing(s) {
    shadowStates.set(s.key,s);
    const result=document.querySelector(`[data-shadow-key="${s.key}"]`);
    if(!result) return;
    result.hidden=false; result.innerHTML=shadowingMarkup(s);
    const line=result.closest(".line"),button=line.querySelector("[data-shadow-listen]");
    const active=["starting","listening","processing"].includes(s.phase);
    const live=active||s.phase==="typing";
    result.setAttribute("aria-live",live?"off":"polite");
    const japanese=line.querySelector("[data-karaoke-line]");
    const [id,rawIndex]=s.key.split(":"),turn=byId.get(id)?.turns[Number(rawIndex)];
    if(japanese&&turn) japanese.innerHTML=karaokeSentence(turn.jp,s);
    if(live||s.phase==="consent") { const prompt=line.querySelector(".role-prompt"); if(prompt) prompt.parentElement.open=true; }
    button.setAttribute("aria-pressed",String(active)); button.textContent=active?(s.phase==="processing"?"× 取消识别":"■ 停止并比对"):"🎙 跟读检查";
    line.classList.toggle("mic-active",active);
    const input=line.querySelector("[data-shadow-text]");
    if(s.transcript&&input!==document.activeElement) input.value=s.transcript;
    if(s.phase==="error") line.querySelector(".manual-shadowing").open=true;
    if($("sandyBubble")) $("sandyBubble").textContent=active?"听你读…":auto?"轮到你…":s.comparison?.matched?"文字一致 ✓":"点我自动听读";
  }
  function pauseForShadowing(key) {
    const result=document.querySelector(`[data-shadow-key="${key}"]`),next=result?.closest(".line")?.querySelector("[data-dialogue-next]");
    if(auto&&next&&!next.hidden) cancelSpeech(); else stopAuto();
  }
  function cancelShadowConsent() {
    if(!pendingShadowKey) return;
    const key=pendingShadowKey; pendingShadowKey=null;
    if(shadowStates.get(key)?.phase==="consent") updateShadowing({key,phase:"cancelled",message:"未开始识别，也没有启用麦克风。"});
  }
  function checkDialogueLine(item,index,confirmed=false) {
    const turn=item?.turns[index]; if(!turn||!shadowing) return;
    const key=`${item.id}:${index}`;
    if(shadowing.active?.key===key) { shadowing.stop(); return; }
    cancelShadowConsent(); pauseForShadowing(key); shadowing.cancel(); save("progress",PAGE,{id:item.id,turn:index});
    shadowConsent=shadowConsent||readShadowConsent();
    if(shadowing.local&&shadowing.supported&&!shadowConsent&&!confirmed) { pendingShadowKey=key; updateShadowing({key,expected:turn.jp,transcript:"",phase:"consent"}); return; }
    if(confirmed&&shadowing.local&&shadowing.supported) rememberShadowConsent();
    shadowing.start(key,turn.jp);
  }
  function setupShadowing() {
    if(PAGE!=="dialogues") return;
    shadowing=new ShadowRecognizer({onChange:updateShadowing});
    $("pageContent").insertAdjacentHTML("afterbegin",`<section class="shadowing-intro"><p>🎙 本机 Whisper · 免费 · 录音不上传</p><p id="localSpeechStatus" role="status">正在检查本机识别…</p><p class="comparison-note">黄色原词可以点听；比对后点 ☆，留到 <a href="shadow-words.html">跟读错词本</a>。</p><details><summary>麦克风与识别说明</summary><p>蓝色对应识别文字，黄色待核对，淡色还未读到。Whisper 每隔几秒处理一次，电脑速度影响延迟。尚未读到的句尾不算漏读；读完点「停止并比对」，再检查可能漏读、不同和多出。这里不判断发音、重音或语调。录音过程中点词听读，会停止麦克风，避免把播放声音识别进去。</p><p>识别在这台 Mac 上运行，不调用浏览器的语音服务，不需要 API 账号。录音临时处理后自动删除，识别文字仅留在页面内存，不上传学习账户。只有你点 ☆ 的正确原词位置和复习标记会保存、备份并随账户同步；不会保存录音或完整识别文字。每句最多 60 秒。只在本机地址可用；GitHub Pages 和其他设备不能运行这个本地模型。</p><p>若浏览器未开放麦克风或未允许权限，请在独立 Safari／Chrome 打开本机地址。仍可使用下方文字比对。</p></details></section>`);
    if(!shadowing.local) $("localSpeechStatus").textContent=recognitionError("local-only");
    else if(!shadowing.supported) $("localSpeechStatus").textContent=recognitionError("unsupported");
    else shadowing.request("/api/speech/status").then(status=>{ $("localSpeechStatus").textContent=`${status.ready?"✓ ":""}${status.message} · ${status.model}`; }).catch(error=>{ $("localSpeechStatus").textContent=`${recognitionError("connection")}（${error.message}）`; });
    $("list").addEventListener("input",event=>{
      const input=event.target.closest("[data-shadow-text]"); if(!input) return;
      const key=input.dataset.shadowText,[id,rawIndex]=key.split(":"),turn=byId.get(id)?.turns[Number(rawIndex)]; if(!turn) return;
      cancelShadowConsent(); pauseForShadowing(key); shadowing.cancel("已切换到文字预览，麦克风已停止。");
      updateShadowing({key,expected:turn.jp,transcript:input.value,phase:"typing",source:"manual",live:compareLiveSpoken(turn.jp,input.value)});
    });
    $("list").addEventListener("submit",event=>{
      const form=event.target.closest("[data-shadow-form]"); if(!form) return; event.preventDefault();
      const key=form.dataset.shadowForm,[id,rawIndex]=key.split(":"),item=byId.get(id),index=Number(rawIndex),turn=item?.turns[index]; if(!turn) return;
      const text=form.querySelector("textarea").value.trim();
      if(!normalizeSpoken(text)) { toast("请先输入日语文字，或使用系统日语听写。",true); return; }
      userInteracted=true; setCurrent(id,true); cancelShadowConsent(); pauseForShadowing(key); shadowing.cancel(); save("progress",PAGE,{id,turn:index});
      updateShadowing({key,expected:turn.jp,transcript:text,phase:"result",source:"manual",comparison:compareSpoken(turn.jp,text)});
    });
  }
  function targetUrl(item) {
    if(item.kind==="shadow-word") return `conversations.html?turn=${item.turnIndex}#${item.sourceId}`;
    const source=reviewFor(item.id)?.source;
    const page=item.kind==="expression"?(source==="quiz"?"quiz":"grammar"):item.kind==="vocab"?"vocab":item.kind==="dialogue"?"dialogues":"practice";
    return `${ROUTES[page]}#${item.id}`;
  }
  function reviewCard(item) {
    const review=reviewFor(item.id);
    if(item.kind==="shadow-word") return `<article class="entry shadow-word-card" id="${item.id}" data-item="${item.id}"><div class="num">${star(item)}<button class="icon-button" data-mastered="${item.id}" aria-label="${review.mastered?"恢复待复习":"标记已掌握"}">${review.mastered?"↩":"✓"}</button></div><div><button class="term word-term" data-read="${item.id}" lang="ja" aria-label="朗读词：${esc(item.term)}">${item.reading?`<span class="reading">${esc(toKana(item.reading))}</span>`:""}<strong>${esc(item.term)}</strong><span class="word-audio-icon" aria-hidden="true">🔊</span></button>${meta(item)}</div><div class="meaning">${esc(item.zh)}<div class="english">${esc(item.en)}</div></div><button class="example" data-example="${item.id}" lang="ja" aria-label="朗读原句：${esc(item.example)}">🔊 ${esc(item.example.slice(0,item.start))}<mark class="spoken-different">${esc(item.term)}</mark>${esc(item.example.slice(item.end))}</button><div class="example-translation">${esc(item.exampleZh)}</div><div class="point">${reasonSelect(item)}<div class="feedback-actions"><a class="pill review-link" href="${targetUrl(item)}">↗ 回到原句</a><button class="link-button" data-archive="${item.id}">移出复习</button></div></div></article>`;
    return `<article class="entry" id="${item.id}" data-item="${item.id}"><div class="num">${star(item)}<button class="icon-button" data-mastered="${item.id}" aria-label="${review.mastered?"恢复待复习":"标记已掌握"}">${review.mastered?"↩":"✓"}</button></div><div><a class="review-link" href="${targetUrl(item)}"><strong>${esc(item.reading?toKana(item.reading):item.term)}</strong>${item.reading?`<br>${esc(item.term)}`:""}</a>${meta(item)}</div><div class="meaning">${esc(item.zh)}<div class="english">${review.isWrong?`曾选：${esc(review.selected)} · 正确：${esc(item.answer||item.term)}`:"★"}</div>${review.reason?`<div class="meta">${tagLink(`reason:${review.reason}`)}</div>`:""}</div><button class="example" data-example="${item.id}">🔊 ${esc(item.kind==="dialogue"?item.turns[0].jp:item.example)}</button><div class="point">${reasonSelect(item)}<div class="feedback-actions"><a class="pill review-link" href="${targetUrl(item)}">↗ 回到原题</a><button class="link-button" data-archive="${item.id}">移出复习</button></div></div></article>`;
  }
  function renderContent() {
    if(!$("list")) return;
    listItems=visibleItems();
    $("list").innerHTML=listItems.map((item,index)=>["mistakes","shadowwords"].includes(PAGE)||item.kind==="shadow-word"||PAGE==="tags"&&favoriteOnly?reviewCard(item):PAGE==="practice"||PAGE==="quiz"?questionCard(item,index):item.kind==="dialogue"?dialogueCard(item):item.kind==="trap"?`<article class="entry" id="${item.id}" data-item="${item.id}"><div class="num">${star(item)}</div><a class="review-link" href="index.html#${item.id}"><strong>${esc(item.question)}</strong>${meta(item)}</a><div class="meaning">${esc(item.context)}</div></article>`:listCard(item,index)).join("");
    $("empty").hidden=Boolean(listItems.length); $("reviewOnly").setAttribute("aria-pressed",String(favoriteOnly));
    $("reviewOnly").textContent=`★ ${studyItems().filter(x=>reviewFor(x.id)).length}`;
    if(["mistakes","shadowwords"].includes(PAGE)) {
      const pool=PAGE==="shadowwords"?shadowWordItems:studyItems();
      $("reviewTotal").textContent=pool.filter(x=>reviewFor(x.id)).length;
      $("reviewWrong").textContent=PAGE==="shadowwords"?pool.filter(x=>reviewFor(x.id)&&!reviewFor(x.id).mastered).length:pool.filter(x=>reviewFor(x.id)?.isWrong).length;
      $("reviewMastered").textContent=pool.filter(x=>reviewFor(x.id)?.mastered).length;
    }
    updateStatus(); observeCards();
  }
  function updateStatus() {
    if(!$("status")) return;
    const pool=baseItems(); const answers=pool.map(x=>state.answers[x.id]).filter(x=>x&&!x.archived); const right=answers.filter(x=>x.correct).length;
    $("status").innerHTML=["practice","quiz"].includes(PAGE)?`显示 ${listItems.length} / ${pool.length} 题 · 已答 ${answers.length} · 答对 ${right}<span class="progress-track"><span style="width:${pool.length?answers.length/pool.length*100:0}%"></span></span>`:`显示 ${listItems.length} / ${pool.length} 个项目${currentId?` · 上次位置：${esc(byId.get(currentId)?.term||"")}`:""}`;
  }
  function observeCards() {
    observer?.disconnect();
    if(!("IntersectionObserver" in window)) return;
    observer=new IntersectionObserver(()=>{ if(!auto) trackVisible(); },{rootMargin:"-20% 0px -45% 0px",threshold:0});
    document.querySelectorAll("[data-item]").forEach(node=>observer.observe(node));
    highlightCurrent();
  }
  function trackVisible() {
    if(auto||!restored||progressSuspended) return;
    // Returning to the top toolbar must not replace the saved reading position with
    // the first card merely peeking into the bottom of the viewport.
    const anchor=window.innerHeight*.35;
    const candidates=[...document.querySelectorAll("[data-item]")].map(node=>({node,rect:node.getBoundingClientRect()})).filter(x=>x.rect.top<=anchor&&x.rect.bottom>=anchor);
    if(candidates[0]) setCurrent(candidates[0].node.dataset.item);
  }
  function setCurrent(id,manual=false) {
    if(!byId.has(id)) return;
    if(manual) progressSuspended=true;
    if(currentId===id) { updateBoard(); return; }
    currentId=id; save("progress",PAGE,{id}); highlightCurrent(); updateBoard(); updateStatus();
  }
  function highlightCurrent() { document.querySelectorAll("[data-item]").forEach(node=>node.classList.toggle("active",node.dataset.item===currentId)); }
  function restoreProgress(force=false) {
    if(restored&&!force) return;
    restored=true;
    let hash=""; try { hash=decodeURIComponent(location.hash.slice(1)); } catch {}
    const id=hash&&byId.has(hash)?hash:state.progress[PAGE]?.id;
    if(id&&baseItems().some(item=>item.id===id)) {
      if(!document.getElementById(id)) { filters.clear(); favoriteOnly=false; query=""; if($("search")) $("search").value=""; renderFilters(); renderContent(); }
      const target=document.getElementById(id);
      if(target) {
        currentId=id; progressSuspended=true; highlightCurrent(); updateBoard();
        const rawTurn=params.get("turn"),turn=rawTurn!==null&&/^\d+$/.test(rawTurn)?Number(rawTurn):-1;
        const line=PAGE==="dialogues"&&byId.get(id)?.turns[turn]?target.querySelector(`[data-turn="${id}-${turn}"]`):null;
        if(line) save("progress",PAGE,{id,turn});
        requestAnimationFrame(()=>(line||target).scrollIntoView({behavior:"instant",block:"start"})); updateStatus();
      }
    }
  }
  async function answerQuestion(item,selected) {
    userInteracted=true; setCurrent(item.id);
    const generation=auto?autoGeneration:null; const previous=state.answers[item.id];
    if(previous&&!previous.archived) { await speak(selected); return; }
    const correct=selected===item.answer;
    save("answers",item.id,{selected,correct,archived:false});
    if(!correct) setReview(item,{isWrong:true,selected,source:PAGE,mastered:false});
    const card=document.getElementById(item.id); card.outerHTML=questionCard(item,listItems.findIndex(x=>x.id===item.id)); highlightCurrent(); updateStatus();
    if(correct) petSandy("٩(◕‿◕)۶",false);
    // Speak only the Japanese option and the complete Japanese sentence. No headings or translations.
    const speechToken=++speechGeneration; const spoken=await speak(selected,null,{cancel:true,token:speechToken});
    if(spoken&&speechToken===speechGeneration) await speak(item.example,document.getElementById(item.id)?.querySelector(".example"),{cancel:false,token:speechToken});
    if(generation!==null&&auto&&generation===autoGeneration) { await delay(1600); advanceAuto(item,generation); }
  }
  function observeEvents() {
    $("search").addEventListener("input",()=>{ userInteracted=true; stopAuto(); query=$("search").value.trim().toLowerCase(); renderContent(); });
    $("filterContent").addEventListener("click",event=>{
      const tag=event.target.closest("[data-filter]"); const group=event.target.closest("[data-filter-group]"); const clear=event.target.closest("#clearFilters"); if(!tag&&!group&&!clear) return;
      stopAuto(); userInteracted=true;
      if(clear) filters.clear();
      if(tag) { const key=tag.dataset.filter; filters.has(key)?filters.delete(key):filters.add(key); }
      if(group) { const tags=$("filterContent")._groups[Number(group.dataset.filterGroup)].tags; const all=tags.every(t=>filters.has(t)); tags.forEach(t=>all?filters.delete(t):filters.add(t)); }
      savePagePreferences(); renderFilters(); renderContent();
    });
    $("reviewOnly").onclick=()=>{ stopAuto(); favoriteOnly=!favoriteOnly; savePagePreferences(); renderFilters(); renderContent(); };
    $("list").addEventListener("change",event=>{
      const reason=event.target.closest("[data-reason]"); const role=event.target.closest("[data-role]");
      if(reason&&REASONS.includes(reason.value)) { setReview(byId.get(reason.dataset.reason),{reason:reason.value}); renderFilters(); toast("错因已记录"); }
      if(role) { stopAuto(); roleModes.set(role.dataset.role,role.value); const item=byId.get(role.dataset.role); $(item.id).outerHTML=dialogueCard(item); }
    });
    $("list").addEventListener("click",async event=>{
      const element=event.target.closest("button")||event.target.closest("[data-turn-read]"); const card=event.target.closest("[data-item]");
      if(card) { userInteracted=true; setCurrent(card.dataset.item,true); }
      if(!element) {
        if(card&&!event.target.closest("a,select,summary,details")&&["vocab","grammar"].includes(PAGE)) {
          if(auto||document.querySelector(".speaking")) stopAuto(); else readItem(byId.get(card.dataset.item));
        } return;
      }
      const get=key=>byId.get(element.dataset[key]);
      if(element.dataset.shadowWord) {
        const word=makeShadowWord(element.dataset.shadowWord,Number(element.dataset.wordStart),Number(element.dataset.wordEnd));
        if(word) await listenShadowWord(word,element);
      } else if(element.dataset.shadowSave) {
        const key=element.dataset.shadowSave,s=shadowStates.get(key),word=makeShadowWord(key,Number(element.dataset.wordStart),Number(element.dataset.wordEnd));
        if(!word||!shadowWordCandidates(s).some(candidate=>candidate.id===word.id)) return;
        const was=favorite(word); setReview(word,{isFavorite:!was,archived:was,mastered:false}); updateShadowing(s);
        toast(was?"已移出跟读错词本":"已留到跟读错词本 · 可单独听词和原句");
      } else if(element.dataset.star) {
        stopAuto();
        const item=get("star"); const was=favorite(item); setReview(item,{isFavorite:!was});
        if(was&&!reviewFor(item.id).isWrong) save(reviewSection(item),item.id,{...state[reviewSection(item)][item.id],archived:true});
        const node=$(item.id); const prior=node?.getBoundingClientRect().top; renderFilters(); renderContent();
        if(node&&prior!==undefined&&$(item.id)) window.scrollBy({top:$(item.id).getBoundingClientRect().top-prior,behavior:"instant"});
      } else if(element.dataset.shadowListen) { checkDialogueLine(get("shadowListen"),Number(element.dataset.turnIndex)); }
      else if(element.dataset.shadowStart) { const [id,index]=element.dataset.shadowStart.split(":"); checkDialogueLine(byId.get(id),Number(index),true); }
      else if(element.dataset.shadowCancel) { cancelShadowConsent(); }
      else if(element.dataset.choice) { await answerQuestion(get("choice"),element.dataset.value); }
      else if(element.dataset.example) { stopAuto(); const item=get("example"); await speak(item.kind==="dialogue"?item.turns[0].jp:item.example,element); }
      else if(element.dataset.read) { const item=get("read"); if(item.kind==="shadow-word") await listenShadowWord(item,element); else { stopAuto(); await speak(item.reading||item.term,element); } }
      else if(element.dataset.retry) { stopAuto(); const item=get("retry"); save("answers",item.id,{...state.answers[item.id],archived:true}); $(item.id).outerHTML=questionCard(item,listItems.indexOf(item)); updateBoard(); updateStatus(); }
      else if(element.dataset.dialoguePlay) { if(auto&&currentId===element.dataset.dialoguePlay) stopAuto(); else startAuto(element.dataset.dialoguePlay,true); }
      else if(element.dataset.turnRead) { stopAuto(); const item=get("turnRead"); await speak(item.turns[Number(element.dataset.turnIndex)].jp,element); }
      else if(element.dataset.dialogueNext) { cancelShadowConsent(); shadowing?.cancel("已继续会话，麦克风已停止。"); const resolve=element._continue; element._continue=null; element.hidden=true; if(resolve) resolve(); }
      else if(element.dataset.mastered) { stopAuto(); const item=get("mastered"); setReview(item,{mastered:!reviewFor(item.id)?.mastered}); renderContent(); }
      else if(element.dataset.archive) { stopAuto(); const item=get("archive"); save(reviewSection(item),item.id,{...state[reviewSection(item)][item.id],archived:true,isFavorite:false,isWrong:false}); renderFilters(); renderContent(); }
    });
  }

  function delay(ms) { return new Promise(resolve=>setTimeout(resolve,ms)); }
  async function listenShadowWord(item,button) {
    stopAuto();
    if(!audioPrefs().enabled) { save("preferences","audio",{...audioPrefs(),enabled:true}); updateAudioControls(); }
    return speak(item.reading||item.term,button);
  }
  function audioPrefs() { return state.preferences.audio||{enabled:true,rate:.85,voice:""}; }
  function cancelSpeech(increment=true) {
    if(increment) speechGeneration++;
    if(speechResolve) { speechResolve(false); speechResolve=null; }
    window.speechSynthesis?.cancel();
    document.querySelectorAll(".speaking").forEach(node=>node.classList.remove("speaking"));
  }
  function speak(text,button=null,options={}) {
    cancelShadowConsent();
    shadowing?.cancel("已切换到日语听读，麦克风已停止。");
    if(!audioPrefs().enabled) return Promise.resolve(false);
    if(!window.speechSynthesis||!window.SpeechSynthesisUtterance) { toast("这个浏览器暂不支持日语朗读，请使用 Safari 或 Chrome。",true); return Promise.resolve(false); }
    if(options.cancel!==false) cancelSpeech(false);
    const generation=options.token??++speechGeneration;
    return new Promise(resolve=>{
      let settled=false;
      const finish=success=>{ if(settled) return; settled=true; clearTimeout(timeout); button?.classList.remove("speaking"); if(speechResolve===finish) speechResolve=null; resolve(success&&generation===speechGeneration); };
      const utterance=new SpeechSynthesisUtterance(String(text).replace(/[～〜]/g,"").trim());
      utterance.lang="ja-JP"; utterance.rate=audioPrefs().rate||.85; utterance.pitch=1;
      const voice=voices.find(v=>v.name===audioPrefs().voice)||voices[0]; if(voice) utterance.voice=voice;
      button?.classList.add("speaking"); speechResolve=finish;
      const timeout=setTimeout(()=>{ window.speechSynthesis.cancel(); toast("朗读没有完成，请点击 🔊 重试。",true); finish(false); },Math.max(12000,String(text).length*650));
      utterance.onend=()=>finish(true); utterance.onerror=event=>{ if(!["canceled","interrupted"].includes(event.error)) toast("日语声音暂不可用，请选择另一个声音。",true); finish(false); };
      window.speechSynthesis.resume(); window.speechSynthesis.speak(utterance);
    });
  }
  function loadVoices() {
    voices=(window.speechSynthesis?.getVoices()||[]).filter(v=>/^ja/i.test(v.lang));
    if(!$("voiceSelect")) return;
    $("voiceSelect").innerHTML=voices.length?voices.map(v=>`<option value="${esc(v.name)}">${esc(v.name)}</option>`).join(""):'<option value="">设备默认日语</option>';
    const preferred=voices.find(v=>v.name===audioPrefs().voice)||voices.find(v=>/siri|kyoko|nanami|haruka/i.test(v.name))||voices[0];
    if(preferred) { $("voiceSelect").value=preferred.name; if(!audioPrefs().voice) { state.preferences.audio={...audioPrefs(),voice:preferred.name,updatedAt:stamp()}; writeLocal(); } }
  }
  function updateAudioControls() {
    if($("soundToggle")) { $("soundToggle").setAttribute("aria-pressed",String(audioPrefs().enabled)); $("soundToggle").textContent=audioPrefs().enabled?"🔊":"🔇"; }
    if($("autoToggle")) { $("autoToggle").setAttribute("aria-pressed",String(auto)); $("autoToggle").textContent=auto?"⏸ 暂停听读":"▶ 自动听读"; }
    if($("sandyToggle")) $("sandyToggle").setAttribute("aria-pressed",String(auto));
    if($("sandyBubble")) $("sandyBubble").textContent=shadowing?.active?"听你读…":auto?"…":"点我自动听读";
  }
  function stopAuto(cancelRecognition=true) {
    if(cancelRecognition) { cancelShadowConsent(); shadowing?.cancel(); }
    auto=false; autoGeneration++; cancelSpeech();
    document.querySelectorAll(".playing").forEach(node=>node.classList.remove("playing"));
    document.querySelectorAll("[data-dialogue-next]").forEach(node=>{ const resolve=node._continue; node._continue=null; node.hidden=true; if(resolve) resolve(); });
    updateAudioControls();
  }
  async function readItem(item) {
    if(!item) return false;
    if(item.kind==="dialogue") return readDialogue(item,autoGeneration);
    const token=++speechGeneration;
    if(!await speak(item.reading||item.term,$(item.id)?.querySelector(".term"),{cancel:true,token})) return false;
    if(token!==speechGeneration) return false;
    await delay(180);
    return speak(item.example,$(item.id)?.querySelector(".example"),{cancel:false,token});
  }
  async function readDialogue(item,generation) {
    const saved=state.progress[PAGE]; const start=saved?.id===item.id?Math.min(saved.turn||0,item.turns.length-1):0;
    for(let i=start;i<item.turns.length;i++) {
      if(!auto||generation!==autoGeneration) return false;
      const turn=item.turns[i]; const node=document.querySelector(`[data-turn="${item.id}-${i}"]`);
      document.querySelectorAll(".line.playing").forEach(n=>n.classList.remove("playing")); node?.classList.add("playing"); node?.scrollIntoView({behavior:"smooth",block:"center"});
      save("progress",PAGE,{id:item.id,turn:i});
      if(roleModes.get(item.id)===turn.speaker) {
        const next=$(item.id)?.querySelector("[data-dialogue-next]");
        if(!next) return false;
        next.hidden=false; $("sandyBubble").textContent="轮到你…";
        // Put the continuation control on the current line, so long dialogues need no jump to the top.
        node?.appendChild(next);
        await new Promise(resolve=>{ next._continue=resolve; });
        if(!auto||generation!==autoGeneration) return false;
        $("sandyBubble").textContent="…";
      } else if(!await speak(turn.jp,node?.querySelector(".line-sentence"))) return false;
      node?.classList.remove("playing"); await delay(350);
    }
    save("progress",PAGE,{id:item.id,turn:0}); return true;
  }
  function startAuto(id=null,oneOnly=false) {
    stopAuto(); userInteracted=true;
    const chosen=id||currentId||state.progress[PAGE]?.id||listItems[0]?.id; let index=listItems.findIndex(x=>x.id===chosen); if(index<0) index=0; if(!listItems.length) return;
    if(!audioPrefs().enabled) save("preferences","audio",{...audioPrefs(),enabled:true});
    auto=true; const generation=++autoGeneration; updateAudioControls(); runAuto(index,generation,oneOnly);
  }
  async function runAuto(index,generation,oneOnly=false) {
    for(let i=index;i<listItems.length;i++) {
      if(!auto||generation!==autoGeneration) return;
      const item=listItems[i]; const node=$(item.id); if(!node) continue;
      setCurrent(item.id); node.scrollIntoView({behavior:"smooth",block:"center"}); node.classList.add("playing");
      await delay(250); if(!auto||generation!==autoGeneration) return;
      let success;
      if(["practice","quiz"].includes(PAGE)) {
        if(!state.answers[item.id]||state.answers[item.id].archived) { $("sandyBubble").textContent="等你选一个…"; return; }
        success=await speak(item.example,node.querySelector(".example"));
      } else if(item.kind==="dialogue") success=await readDialogue(item,generation);
      else success=await readItem(item);
      if(!auto||generation!==autoGeneration) return;
      node.classList.remove("playing");
      if(!success) { stopAuto(); return; }
      if(oneOnly) { stopAuto(); return; }
      await delay(700);
    }
    if(generation===autoGeneration) { stopAuto(); toast("这一组听读完成了 ٩(◕‿◕)۶"); }
  }
  function advanceAuto(item,generation) {
    if(!auto||generation!==autoGeneration) return;
    const index=listItems.findIndex(x=>x.id===item.id); runAuto(index+1,generation);
  }
  function setupAudio() {
    loadVoices(); window.speechSynthesis?.addEventListener("voiceschanged",loadVoices);
    $("soundToggle").onclick=()=>{ const enabled=!audioPrefs().enabled; save("preferences","audio",{...audioPrefs(),enabled}); if(!enabled) stopAuto(); updateAudioControls(); };
    $("voiceSelect").onchange=()=>{ stopAuto(); save("preferences","audio",{...audioPrefs(),voice:$("voiceSelect").value}); };
    $("autoToggle").onclick=()=>auto?stopAuto():startAuto(); updateAudioControls();
    window.addEventListener("wheel",event=>{ if(!event.target.closest(".writing-board,textarea")) { progressSuspended=false; stopAuto(false); } },{passive:true});
    window.addEventListener("touchmove",event=>{ if(!event.target.closest(".writing-board,.sandy,.snack,textarea")) { progressSuspended=false; stopAuto(false); } },{passive:true});
    window.addEventListener("keydown",event=>{ if(!event.target.closest("input,textarea,select,button,a,summary,canvas,[contenteditable='true']")&&["ArrowDown","ArrowUp","PageDown","PageUp","Home","End"," "].includes(event.key)) { progressSuspended=false; stopAuto(); } });
    document.addEventListener("pointerdown",event=>{ if(event.target===document.documentElement) progressSuspended=false; });
  }
  function moveFloating(node,left,top) {
    const rect=node.getBoundingClientRect(); node.style.left=`${Math.max(6,Math.min(left,innerWidth-rect.width-6))}px`; node.style.top=`${Math.max(6,Math.min(top,innerHeight-rect.height-6))}px`; node.style.bottom="auto"; node.style.right="auto";
  }
  function dragFloating(node,handle,key,onTap=null) {
    let drag=null;
    handle.addEventListener("pointerdown",event=>{
      if(event.button!==0||event.target.closest("button")!==handle&&event.target.closest("button")) return;
      const box=node.getBoundingClientRect(); drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:box.left,top:box.top,moved:false}; handle.setPointerCapture(event.pointerId); event.preventDefault();
    });
    handle.addEventListener("pointermove",event=>{ if(!drag||drag.id!==event.pointerId) return; const dx=event.clientX-drag.x,dy=event.clientY-drag.y; if(Math.hypot(dx,dy)>5) drag.moved=true; if(drag.moved) moveFloating(node,drag.left+dx,drag.top+dy); });
    handle.addEventListener("pointerup",event=>{ if(!drag||drag.id!==event.pointerId) return; const moved=drag.moved; drag=null; if(handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId); if(moved) { const r=node.getBoundingClientRect(); save("preferences",key,{left:r.left,top:r.top}); } else onTap?.(); event.preventDefault(); });
    handle.addEventListener("pointercancel",()=>{ drag=null; });
    if(onTap) handle.addEventListener("click",event=>{ if(event.detail===0) onTap(); });
    const pos=state.preferences[key]; if(pos&&Number.isFinite(pos.left)&&Number.isFinite(pos.top)) requestAnimationFrame(()=>moveFloating(node,pos.left,pos.top));
  }
  function petSandy(message="♡",purr=true) {
    if(!$("sandy")) return;
    $("sandy").classList.add("petted"); $("sandyBubble").textContent=message;
    if(audioPrefs().enabled) { const sound=new Audio(`assets/${purr?"sandy-purr-1.wav":"sandy-meow-1.wav"}`); sound.volume=.24; sound.play().catch(()=>{}); }
    clearTimeout(petSandy.timer); petSandy.timer=setTimeout(()=>{ $("sandy").classList.remove("petted"); updateAudioControls(); },1800);
  }
  function floatingUI() {
    document.body.insertAdjacentHTML("beforeend",`<aside class="sandy" id="sandy"><button class="sandy-toggle" id="sandyToggle" aria-label="点击 Sandy 开始或暂停听读；拖动可移动位置" aria-pressed="false"><span class="sandy-bubble" id="sandyBubble">点我自动听读</span><span class="sandy-art"><img src="assets/sandy-green-eyes.png" alt="绿色眼睛的三花猫 Sandy" draggable="false"><span class="closed-eye left" aria-hidden="true"></span><span class="closed-eye right" aria-hidden="true"></span></span></button><span class="sandy-label">SANDY</span><div class="sandy-controls"><button class="icon-button" id="petSandy" aria-label="摸摸 Sandy">♡</button><button class="icon-button" id="floatingBoard" aria-label="打开或收起写字板">✎</button></div></aside><button class="to-top" id="toTop">↑ 返回顶部</button><details class="snacks"><summary>SANDY'S SNACKS</summary><div class="snack-list">${["🐟","🍪","🍓"].map(snack=>`<button class="snack" aria-label="把 ${snack} 拖给 Sandy" data-snack="${snack}">${snack}</button>`).join("")}</div></details>`);
    $("toTop").onclick=()=>{ stopAuto(); progressSuspended=true; window.scrollTo({top:0,behavior:"smooth"}); };
    $("petSandy").onclick=()=>petSandy(); $("floatingBoard").onclick=toggleBoard;
    dragFloating($("sandy"),$("sandyToggle"),"sandyPosition",()=>auto?stopAuto():startAuto());
    document.querySelectorAll("[data-snack]").forEach(button=>{
      let ghost=null, moved=false, origin=null;
      button.onpointerdown=event=>{ if(event.button!==0) return; event.preventDefault(); button.setPointerCapture(event.pointerId); origin={x:event.clientX,y:event.clientY}; moved=false; ghost=document.createElement("span"); ghost.className="snack-ghost"; ghost.textContent=button.dataset.snack; document.body.appendChild(ghost); ghost.style.left=`${event.clientX}px`; ghost.style.top=`${event.clientY}px`; };
      button.onpointermove=event=>{ if(!ghost) return; moved=moved||Math.hypot(event.clientX-origin.x,event.clientY-origin.y)>5; ghost.style.left=`${event.clientX}px`; ghost.style.top=`${event.clientY}px`; };
      button.onpointerup=event=>{ if(!ghost) return; const rect=$("sandy").getBoundingClientRect(); if(!moved||event.clientX>=rect.left&&event.clientX<=rect.right&&event.clientY>=rect.top&&event.clientY<=rect.bottom) petSandy("😻 おいしい！",false); ghost.remove(); ghost=null; if(button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId); };
      button.onpointercancel=()=>{ ghost?.remove(); ghost=null; };
    });
    window.addEventListener("resize",()=>{ for(const id of ["sandy","writingBoard"]) { const node=$(id); if(node&&!node.hidden&&node.style.left) { const box=node.getBoundingClientRect(); moveFloating(node,box.left,box.top); } } });
  }

  function updateBoard() {
    if(!$("boardWord")) return;
    const item=byId.get(currentId); const unanswered=["practice","quiz"].includes(PAGE)&&(!state.answers[currentId]||state.answers[currentId].archived);
    $("boardWord").textContent=unanswered?"先选择答案，再跟着写":item?.term||"点一下或滑到一个词";
    $("boardReading").textContent=!unanswered&&item?.reading?toKana(item.reading):"";
  }
  function toggleBoard() {
    const board=$("writingBoard"); if(!board) return; board.hidden=!board.hidden;
    $("boardToggle")?.setAttribute("aria-expanded",String(!board.hidden));
    save("preferences","writingBoard",{...state.preferences.writingBoard,visible:!board.hidden});
    updateBoard(); if(!board.hidden) resizeCanvas();
  }
  function resizeCanvas() {
    const canvas=$("writingCanvas"); if(!canvas||$("writingBoard").hidden) return;
    const rect=canvas.getBoundingClientRect(); if(rect.width<1||rect.height<1) return;
    boardSize={width:rect.width,height:rect.height}; const dpr=window.devicePixelRatio||1;
    canvas.width=Math.round(rect.width*dpr); canvas.height=Math.round(rect.height*dpr); canvas.getContext("2d").setTransform(dpr,0,0,dpr,0,0); drawCanvas();
  }
  function drawCanvas() {
    const ctx=$("writingCanvas").getContext("2d"); ctx.clearRect(0,0,boardSize.width,boardSize.height);
    ctx.strokeStyle="#28617b"; ctx.fillStyle="#28617b"; ctx.lineCap="round"; ctx.lineJoin="round";
    for(const stroke of boardStrokes) {
      if(stroke.length===1) { const p=stroke[0]; ctx.beginPath(); ctx.arc(p.x*boardSize.width,p.y*boardSize.height,1.5,0,Math.PI*2); ctx.fill(); }
      for(let i=1;i<stroke.length;i++) { const a=stroke[i-1],b=stroke[i]; ctx.lineWidth=1.3+b.pressure*3.2; ctx.beginPath(); ctx.moveTo(a.x*boardSize.width,a.y*boardSize.height); ctx.lineTo(b.x*boardSize.width,b.y*boardSize.height); ctx.stroke(); }
    }
  }
  function setupBoard() {
    document.body.insertAdjacentHTML("beforeend",`<aside id="writingBoard" class="writing-board" aria-label="可移动写字板" hidden><div class="board-bar" id="boardHandle"><span class="board-title">✎ 跟着写 · 拖这里移动</span><div><button class="link-button" id="clearBoard">清空</button><button class="link-button" id="closeBoard" aria-label="收起写字板">×</button></div></div><div class="board-term"><strong id="boardWord"></strong><small id="boardReading"></small></div><div class="canvas-wrap"><canvas id="writingCanvas" aria-label="用 Apple Pencil、手指或鼠标书写"></canvas></div></aside>`);
    const board=$("writingBoard"),canvas=$("writingCanvas");
    dragFloating(board,$("boardHandle"),"boardPosition");
    $("boardToggle").onclick=toggleBoard; $("closeBoard").onclick=toggleBoard;
    $("clearBoard").onclick=()=>{ boardStrokes=[]; drawCanvas(); };
    const point=event=>{ const box=canvas.getBoundingClientRect(); return {x:(event.clientX-box.left)/box.width,y:(event.clientY-box.top)/box.height,pressure:event.pressure||.5}; };
    canvas.onpointerdown=event=>{ if(event.button!==0) return; event.preventDefault(); canvas.setPointerCapture(event.pointerId); drawing={id:event.pointerId,stroke:[point(event)]}; boardStrokes.push(drawing.stroke); drawCanvas(); };
    canvas.onpointermove=event=>{ if(!drawing||drawing.id!==event.pointerId) return; event.preventDefault(); (event.getCoalescedEvents?.()||[event]).forEach(e=>drawing.stroke.push(point(e))); drawCanvas(); };
    const finish=event=>{ if(drawing?.id===event.pointerId) { if(canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); drawing=null; } };
    canvas.onpointerup=finish; canvas.onpointercancel=finish;
    if("ResizeObserver" in window) new ResizeObserver(resizeCanvas).observe(canvas);
    if(state.preferences.writingBoard?.visible) { board.hidden=false; $("boardToggle").setAttribute("aria-expanded","true"); resizeCanvas(); }
    updateBoard();
  }
  function setupBackup() {
    const pool=PAGE==="shadowwords"?shadowWordItems:studyItems(),total=pool.filter(x=>reviewFor(x.id)).length;
    const wrong=PAGE==="shadowwords"?pool.filter(x=>reviewFor(x.id)&&!reviewFor(x.id).mastered).length:pool.filter(x=>reviewFor(x.id)?.isWrong).length;
    $("pageContent").innerHTML=`${PAGE==="shadowwords"?'<p class="notice">黄色表示文字不同，不等于发音错。这里只保存你选择的正确原词和原句位置，不保存录音或完整识别文字。自动听读会依次读「词 → 原句」。</p>':""}<div class="summary-grid"><div class="summary-box"><strong id="reviewTotal">${total}</strong>复习项目</div><div class="summary-box"><strong id="reviewWrong">${wrong}</strong>${PAGE==="shadowwords"?"待核对":"答错过"}</div><div class="summary-box"><strong id="reviewMastered">${pool.filter(x=>reviewFor(x.id)?.mastered).length}</strong>已掌握</div></div><div class="panel"><div class="tags"><button class="pill" id="exportBackup">↓ 导出备份</button><label class="pill file-label">↑ 导入备份<input type="file" id="importBackup" accept="application/json,.json" hidden></label><button class="pill" id="showMastered" aria-pressed="${includeMastered}">✓ 包含已掌握</button></div><p class="english" style="margin-top:10px;margin-bottom:0">未登录时保存在当前浏览器；登录后可同步到你的账户。退出登录不会删除账户记录。</p></div>${toolsUI()}`;
    $("showMastered").onclick=()=>{ stopAuto(); includeMastered=!includeMastered; $("showMastered").setAttribute("aria-pressed",String(includeMastered)); savePagePreferences(); renderFilters(); renderContent(); };
    $("exportBackup").onclick=()=>{
      const blob=new Blob([JSON.stringify({app:"business-sandy",exportedAt:stamp(),state},null,2)],{type:"application/json"});
      const link=document.createElement("a"); link.href=URL.createObjectURL(blob); link.download=`business-sandy-${new Date().toISOString().slice(0,10)}.json`; link.click(); setTimeout(()=>URL.revokeObjectURL(link.href),1500);
    };
    $("importBackup").onchange=async event=>{
      const file=event.target.files[0]; if(!file) return;
      try { const imported=JSON.parse(await file.text()); if(imported.app!=="business-sandy"||!validateState(imported.state)) throw new Error("请选择这个网站导出的备份文件。"); stopAuto(); mergeState(state,imported.state); writeLocal(); scheduleSync(); updateNavigation(); renderFilters(); renderContent(); toast("备份已合并，进度和复习记录已恢复。"); }
      catch(error) { toast(error.message||"备份无法读取。",true); } event.target.value="";
    };
  }
  async function documentDB() {
    return new Promise((resolve,reject)=>{
      const request=indexedDB.open("business-sandy-private-textbook",1);
      request.onupgradeneeded=()=>request.result.createObjectStore("documents");
      request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
    });
  }
  let pdfUrl=null;
  function showPDF(blob,name) {
    if(pdfUrl) URL.revokeObjectURL(pdfUrl); pdfUrl=URL.createObjectURL(blob);
    const page=Math.max(1,Math.min(55,Number(params.get("page"))||1));
    $("pdfFrame").src=`${pdfUrl}#page=${page}`; $("pdfFrame").hidden=false; $("pdfName").textContent=`${name} · PDF 第 ${page} / 55 页`;
    $("pdfOpen").href=`${pdfUrl}#page=${page}`; $("pdfOpen").hidden=false;
  }
  async function setupTextbook() {
    $("pageContent").innerHTML=`<section class="panel"><h2>${esc(D.source.title)}</h2><p class="english">${esc(D.source.institution)}</p><div class="notice">${esc(D.source.description)}<br>教材章节：9 课；「表現」：61 项。教材 PDF 保存在本机浏览器中。</div><div class="tags" style="margin-top:15px"><label class="primary file-label">选择教材 PDF<input id="pdfInput" type="file" accept="application/pdf,.pdf" hidden></label><a class="pill" id="pdfOpen" target="_blank" rel="noopener" hidden>在新标签打开教材</a></div><p class="status" id="pdfName">首次使用请选择你提供的教材。之后同一浏览器可继续查看。</p><iframe class="pdf-frame" id="pdfFrame" title="本机教材 PDF" hidden></iframe></section><section class="panel"><h2>章节目录</h2><div class="lesson-grid">${D.chapters.map(c=>`<a class="lesson-link" href="grammar.html#expr-${c.id}-1"><span class="tag">${String(c.id).padStart(2,"0")} · ${esc(c.group)}</span><strong lang="ja">${esc(c.title)}</strong><small>${esc(c.zh)} · 教材 p.${c.page}</small><div class="english">${esc(c.en)}</div></a>`).join("")}</div></section>`;
    $("pdfInput").onchange=async event=>{
      const file=event.target.files[0]; if(!file) return;
      const header=new TextDecoder().decode(await file.slice(0,5).arrayBuffer()); if(header!=="%PDF-") { toast("请选择 PDF 文件。",true); return; }
      showPDF(file,file.name);
      try { const db=await documentDB(); const tx=db.transaction("documents","readwrite"); tx.objectStore("documents").put({blob:file,name:file.name},"textbook"); tx.oncomplete=()=>{ db.close(); toast("教材已保存在本机浏览器。"); }; tx.onerror=()=>toast("教材已打开，但本机无法持久保存这个文件。",true); }
      catch { toast("教材已打开，下次使用时可能需要重新选择。",true); }
    };
    try { const db=await documentDB(); const req=db.transaction("documents","readonly").objectStore("documents").get("textbook"); req.onsuccess=()=>{ if(req.result?.blob) showPDF(req.result.blob,req.result.name); db.close(); }; }
    catch {}
  }
  function loginUI() {
    $("pageContent").innerHTML=`<section class="login-panel"><h2 id="loginTitle">Welcome back</h2><p class="english">使用现有 Sandy 账户。商务日语的进度和复习记录独立保存。</p><form id="loginForm"><label id="emailLabel" for="email">Email address</label><input id="email" type="email" autocomplete="email" required><label for="password">Password</label><input id="password" type="password" autocomplete="current-password" minlength="8" required><button class="primary" id="loginSubmit" disabled>Connecting…</button></form><div class="login-links"><button class="link-button" id="signup">Create account</button><button class="link-button" id="resetPassword">Reset password</button></div><p id="loginMessage" class="status" role="status"></p></section>`;
  }
  function setupLogin() {
    let mode=location.hash.includes("type=recovery")?"recovery":"signin";
    const redirect=params.get("redirect"); const allowed=Object.values(ROUTES).filter(x=>x!=="login.html"); const target=allowed.includes(redirect)?redirect:"home.html";
    function setMode(next) {
      mode=next; $("loginTitle").textContent=mode==="signup"?"Create your account":mode==="recovery"?"Set a new password":"Welcome back";
      $("loginSubmit").textContent=mode==="signup"?"Create account":mode==="recovery"?"Save new password":"Sign in"; $("loginSubmit").disabled=false;
      $("email").hidden=mode==="recovery"; $("emailLabel").hidden=mode==="recovery"; $("email").required=mode!=="recovery"; $("password").autocomplete=mode==="signin"?"current-password":"new-password";
      document.querySelector(".login-links").hidden=mode==="recovery";
    }
    setMode(mode);
    const redirectUrl=new URL(`login.html?redirect=${encodeURIComponent(target)}`,location.href).href;
    $("signup").onclick=()=>setMode(mode==="signup"?"signin":"signup");
    $("loginForm").onsubmit=async event=>{
      event.preventDefault(); $("loginSubmit").disabled=true; $("loginMessage").textContent="Connecting…";
      try {
        const credentials={email:$("email").value.trim(),password:$("password").value};
        const result=mode==="recovery"?await client.auth.updateUser({password:credentials.password}):mode==="signup"?await client.auth.signUp({...credentials,options:{emailRedirectTo:redirectUrl}}):await client.auth.signInWithPassword(credentials);
        if(result.error) throw result.error;
        if(mode==="signup"&&!result.data.session) { $("loginMessage").textContent="Check your email to confirm your account."; return; }
        location.assign(target);
      } catch(error) { $("loginMessage").textContent=error.message; } finally { $("loginSubmit").disabled=false; }
    };
    $("resetPassword").onclick=async()=>{
      const email=$("email").value.trim(); if(!email) { $("loginMessage").textContent="Enter your email address first."; return; }
      if(location.protocol==="file:") { $("loginMessage").textContent="请在部署后的在线页面使用邮件密码重置。"; return; }
      const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:redirectUrl}); $("loginMessage").textContent=error?error.message:"Password reset link sent.";
    };
    client.auth.onAuthStateChange(event=>{ if(event==="PASSWORD_RECOVERY") setMode("recovery"); });
    client.auth.getSession().then(({data})=>{ if(data.session&&mode!=="recovery") location.assign(target); });
  }
  function init() {
    shell(); loadPagePreferences();
    if(PAGE==="home") { renderHome(); loadCloudClient(); return; }
    if(PAGE==="login") { loginUI(); loadCloudClient(); return; }
    if(PAGE==="textbook") { setupTextbook(); loadCloudClient(); return; }
    if(["mistakes","shadowwords"].includes(PAGE)) setupBackup(); else $("pageContent").innerHTML=toolsUI();
    setupShadowing();
    if(PAGE==="tags") $("pageContent").insertAdjacentHTML("afterbegin",`<p class="notice">同组标签按「任一符合」筛选；章节、类型和错因等不同组可以组合。点 ★ 只看你的复习项目。</p>`);
    renderFilters(); renderContent(); observeEvents(); setupBoard(); floatingUI(); setupAudio(); restoreProgress();
    let scrollTimer; window.addEventListener("scroll",()=>{ clearTimeout(scrollTimer); scrollTimer=setTimeout(trackVisible,120); },{passive:true});
    window.addEventListener("hashchange",()=>restoreProgress(true));
    window.addEventListener("pagehide",()=>{ writeLocal(); stopAuto(); if(account) syncCloud(); });
    document.addEventListener("visibilitychange",()=>{ if(document.hidden) { stopAuto(); if(account) syncCloud(); } });
    loadCloudClient();
  }
  init();
})();
