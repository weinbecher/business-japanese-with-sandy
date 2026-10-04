(() => {
  "use strict";
  const D=window.BUSINESS_DATA;
  const PAGE=document.body.dataset.page;
  const REASONS=["我被汉字骗了","我被中文意思骗了","我以为两个都可以","我没看出固定搭配","我没听出动词","我没抓主语","我没抓转折","我只是太累了 粗心了"];
  const ROUTES={practice:"index.html",quiz:"grammar-quiz.html",vocab:"vocab.html",grammar:"grammar.html",dialogues:"conversations.html",mistakes:"mistakes.html",tags:"tag.html",textbook:"textbook.html",login:"login.html"};
  const LABELS={practice:"🐾 商务二选一",quiz:"🐾 表达四选一",vocab:"📚 商务词汇",grammar:"📝 商务表达",dialogues:"💬 会话跟读",mistakes:"📘 错题复习",tags:"🏷️ Tags",textbook:"📖 教材"};
  const TITLES={practice:"和 Sandy 练习商务日语",quiz:"和 Sandy 练习商务表达",vocab:"商务日语词汇表",grammar:"商务日语表达表",dialogues:"商务会话 · 听读与角色练习",mistakes:"我的商务日语复习本",tags:"按标签复习商务日语",textbook:"教材与章节",login:"Business Japanese · Sign in"};
  const allItems=[...D.vocab,...D.expressions,...D.dialogues,...D.traps];
  const byId=new Map(allItems.map(item=>[item.id,item]));
  const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const $=id=>document.getElementById(id);
  const toKana=value=>String(value||"").normalize("NFKC").replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
  const stamp=()=>new Date().toISOString();
  const blankState=()=>({version:1,review:{},progress:{},answers:{},preferences:{}});
  const localKey=id=>`business-sandy:v1:${id}`;
  let account=null, client=null, scope="guest", state=readState(scope), accountEpoch=0, syncTimer, syncing=false, resync=false, syncCompletion=Promise.resolve();
  let filters=new Set(), favoriteOnly=false, includeMastered=false, query="", currentId=null, restored=false, userInteracted=false, progressSuspended=false;
  let auto=false, autoGeneration=0, speechGeneration=0, speechResolve=null, voices=[], observer=null, listItems=[];
  let boardStrokes=[], drawing=null, boardSize={width:1,height:1}, roleModes=new Map();
  const params=new URLSearchParams(location.search);

  function readState(id) {
    try { const parsed=JSON.parse(localStorage.getItem(localKey(id))||"null"); return validateState(parsed)?parsed:blankState(); } catch { return blankState(); }
  }
  function validateState(value) {
    return value&&value.version===1&&["review","progress","answers","preferences"].every(k=>value[k]&&typeof value[k]==="object"&&!Array.isArray(value[k]));
  }
  function writeLocal() {
    try { localStorage.setItem(localKey(scope),JSON.stringify(state)); } catch { toast("本机储存不可用，请在复习页导出备份。",true); }
  }
  function save(section,key,value) {
    state[section][key]={...value,updatedAt:stamp()}; writeLocal(); scheduleSync();
  }
  function mergeState(target,incoming) {
    if(!validateState(incoming)) return target;
    for(const section of ["review","progress","answers","preferences"]) for(const [key,value] of Object.entries(incoming[section])) {
      if(["__proto__","constructor","prototype"].includes(key)||!value||typeof value!=="object") continue;
      if(section==="review"&&!byId.has(key)) continue;
      if(!target[section][key]||String(value.updatedAt||"")>String(target[section][key].updatedAt||"")) target[section][key]={...value};
    }
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
    stopAuto(); clearTimeout(syncTimer); accountEpoch++; account=user;
    scope=user?.id||"guest"; state=readState(scope); currentId=null;
    if(PAGE!=="login") { loadPagePreferences(); renderFilters(); renderContent(); restoreProgress(true); }
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
      if(PAGE!=="login") { renderContent(); if(!userInteracted) restoreProgress(true); }
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
    const intro={practice:"从实际商务场景练习措辞、敬语方向和固定搭配。",quiz:"教材 9 课 · 61 个表达 · 日语例句填空",vocab:"ひらがな在前 · 汉字在后 · 162 个核心词条",grammar:"教材 9 课的 61 个表达 · 接续、用法与商务例句",dialogues:"9 段章节会话 + 18 段谈话练习 · 原创辅助练习",mistakes:"词汇、表达、会话和答题记录都整理在这里。",tags:"按章节、功能或错因组合筛选。",textbook:D.source.title,login:"Keep your Business Japanese learning in sync."};
    document.title=`${TITLES[PAGE]}｜Business Japanese with Sandy`;
    document.body.innerHTML=`<main class="app" id="top"><header><div class="eyebrow">BUSINESS JAPANESE · STUDY WITH SANDY</div><h1>${TITLES[PAGE]}</h1><p class="subtitle">${intro[PAGE]}</p><div class="account"><span id="accountStatus">本机自动保存</span><span id="accountEmail"></span><a id="loginLink" href="login.html?redirect=${ROUTES[PAGE]}">Sign in</a><button id="signOut" type="button" hidden>Sign out</button></div><nav class="nav" aria-label="学习页面">${Object.entries(LABELS).map(([key,label])=>`<a href="${ROUTES[key]}" ${key===PAGE?'aria-current="page"':""}>${label}</a>`).join("")}</nav></header><div id="pageContent"></div></main><div id="toast" class="toast" role="status" hidden></div>`;
    $("signOut").onclick=async()=>{ await syncCloud(); const result=await client?.auth.signOut(); if(result?.error) toast(result.error.message,true); else switchAccount(null); };
  }
  function toast(text,error=false) { $("toast").textContent=text; $("toast").classList.toggle("error",error); $("toast").hidden=false; clearTimeout(toast.timer); toast.timer=setTimeout(()=>$("toast").hidden=true,3300); }
  function reviewFor(id) { const r=state.review[id]; return r&&!r.archived?r:null; }
  function setReview(item,patch={}) {
    const previous=state.review[item.id]||{};
    save("review",item.id,{...previous,id:item.id,source:patch.source||previous.source||PAGE,archived:false,isFavorite:previous.isFavorite||false,isWrong:previous.isWrong||false,...patch});
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
    if(type==="kind") return {vocab:"词汇",expression:"表达",dialogue:"会话",trap:"商务二选一"}[value]||value;
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
    if(PAGE==="mistakes") return allItems.filter(x=>reviewFor(x.id)&&(!reviewFor(x.id).mastered||includeMastered));
    if(PAGE==="tags") return allItems;
    return [];
  }
  function visibleItems() {
    const filterGroups=new Map(); filters.forEach(tag=>{ const type=tag.split(":")[0]; if(!filterGroups.has(type)) filterGroups.set(type,[]); filterGroups.get(type).push(tag); });
    const result=baseItems().filter(item=>{ const tags=itemTags(item); return [...filterGroups.values()].every(group=>group.some(tag=>tags.includes(tag))); }).filter(item=>!favoriteOnly||Boolean(reviewFor(item.id))).filter(item=>!query||[item.term,item.reading,item.zh,item.en,item.example,item.category,reviewFor(item.id)?.reason||""].join(" ").toLowerCase().includes(query));
    return PAGE==="vocab"?result.sort((a,b)=>toKana(a.reading).localeCompare(toKana(b.reading),"ja")||a.lesson-b.lesson):PAGE==="mistakes"?result.sort((a,b)=>String(reviewFor(b.id).updatedAt).localeCompare(String(reviewFor(a.id).updatedAt))):result;
  }
  function toolsUI() {
    return `<section class="toolbar" aria-label="学习工具"><input id="search" class="search" type="search" placeholder="搜索日语、读音、中文、英文…" aria-label="搜索"><label class="voice-picker">日语声音<select id="voiceSelect" aria-label="选择日语声音"><option value="">设备默认日语</option></select></label><button id="soundToggle" class="pill" aria-pressed="true">🔊</button><button id="autoToggle" class="pill" aria-pressed="false">▶ 自动听读</button><button id="reviewOnly" class="pill" aria-pressed="false">★</button><button id="boardToggle" class="pill" aria-expanded="false" aria-label="打开或收起写字板">✎</button></section><details class="filter-panel" id="filters"><summary><span id="filterSummary">筛选标签</span></summary><div class="filter-content" id="filterContent"></div></details><div class="status" id="status" role="status"></div><section class="list" id="list"></section><div class="empty" id="empty" hidden>这里还没有项目。可以调整筛选，或先给想复习的内容加上 ★。</div>`;
  }
  function renderFilters() {
    if(!$("filterContent")) return;
    const source=PAGE==="mistakes"?allItems.filter(x=>reviewFor(x.id)):baseItems();
    const available=new Set(source.flatMap(itemTags));
    const groups=D.chapters.reduce((result,c)=>{ let group=result.find(g=>g.title===c.group); if(!group) { group={title:c.group,tags:[]}; result.push(group); } group.tags.push(`lesson:${c.id}`); return result; },[]);
    groups.push({title:"表达功能 / 词汇类型",tags:[...available].filter(t=>t.startsWith("cat:")).sort((a,b)=>tagLabel(a).localeCompare(tagLabel(b),"zh"))});
    if(["tags","mistakes"].includes(PAGE)) groups.push({title:"内容类型",tags:["kind:vocab","kind:expression","kind:dialogue","kind:trap"]});
    if(["tags","mistakes"].includes(PAGE)||favoriteOnly) groups.push({title:"我的错因",tags:REASONS.map(r=>`reason:${r}`)});
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
  function dialogueCard(item) {
    const role=roleModes.get(item.id)||""; const speakers=[...new Set(item.turns.map(x=>x.speaker))];
    return `<article class="dialogue-card" id="${item.id}" data-item="${item.id}"><div class="card-heading"><div><span class="tag">${esc(item.category)}</span><h2 lang="ja">${esc(item.term)}</h2><div class="english">${esc(item.zh)}</div></div>${star(item)}</div>${meta(item)}<div class="role-controls"><button class="pill" data-dialogue-play="${item.id}">▶ 整段听读</button><label>我的角色 <select data-role="${item.id}"><option value="">听全部</option>${speakers.map(s=>`<option value="${esc(s)}" ${s===role?"selected":""}>${esc(s)}</option>`).join("")}</select></label><button class="pill" data-dialogue-next="${item.id}" hidden>我说完了 →</button></div><div class="lines">${item.turns.map((turn,index)=>`<div class="line" data-turn="${item.id}-${index}"><span class="speaker" lang="ja">${esc(turn.speaker)}</span><div>${role===turn.speaker?`<details><summary class="role-prompt">轮到你 · ${esc(turn.zh)}</summary><button class="example" lang="ja" data-turn-read="${item.id}" data-turn-index="${index}">🔊 ${esc(turn.jp)}</button></details>`:`<button class="example" lang="ja" data-turn-read="${item.id}" data-turn-index="${index}">${esc(turn.jp)}</button><div class="english">${esc(turn.zh)}</div><div class="english">${esc(turn.en)}</div>`}</div></div>`).join("")}</div>${reviewFor(item.id)?reasonSelect(item):""}</article>`;
  }
  function targetUrl(item) {
    const source=reviewFor(item.id)?.source;
    const page=item.kind==="expression"?(source==="quiz"?"quiz":"grammar"):item.kind==="vocab"?"vocab":item.kind==="dialogue"?"dialogues":"practice";
    return `${ROUTES[page]}#${item.id}`;
  }
  function reviewCard(item) {
    const review=reviewFor(item.id);
    return `<article class="entry" id="${item.id}" data-item="${item.id}"><div class="num">${star(item)}<button class="icon-button" data-mastered="${item.id}" aria-label="${review.mastered?"恢复待复习":"标记已掌握"}">${review.mastered?"↩":"✓"}</button></div><div><a class="review-link" href="${targetUrl(item)}"><strong>${esc(item.reading?toKana(item.reading):item.term)}</strong>${item.reading?`<br>${esc(item.term)}`:""}</a>${meta(item)}</div><div class="meaning">${esc(item.zh)}<div class="english">${review.isWrong?`曾选：${esc(review.selected)} · 正确：${esc(item.answer||item.term)}`:"★"}</div>${review.reason?`<div class="meta">${tagLink(`reason:${review.reason}`)}</div>`:""}</div><button class="example" data-example="${item.id}">🔊 ${esc(item.kind==="dialogue"?item.turns[0].jp:item.example)}</button><div class="point">${reasonSelect(item)}<div class="feedback-actions"><a class="pill review-link" href="${targetUrl(item)}">↗ 回到原题</a><button class="link-button" data-archive="${item.id}">移出复习</button></div></div></article>`;
  }
  function renderContent() {
    if(!$("list")) return;
    listItems=visibleItems();
    $("list").innerHTML=listItems.map((item,index)=>PAGE==="mistakes"||PAGE==="tags"&&favoriteOnly?reviewCard(item):PAGE==="practice"||PAGE==="quiz"?questionCard(item,index):item.kind==="dialogue"?dialogueCard(item):item.kind==="trap"?`<article class="entry" id="${item.id}" data-item="${item.id}"><div class="num">${star(item)}</div><a class="review-link" href="index.html#${item.id}"><strong>${esc(item.question)}</strong>${meta(item)}</a><div class="meaning">${esc(item.context)}</div></article>`:listCard(item,index)).join("");
    $("empty").hidden=Boolean(listItems.length); $("reviewOnly").setAttribute("aria-pressed",String(favoriteOnly));
    $("reviewOnly").textContent=`★ ${allItems.filter(x=>reviewFor(x.id)).length}`;
    if(PAGE==="mistakes") {
      $("reviewTotal").textContent=allItems.filter(x=>reviewFor(x.id)).length;
      $("reviewWrong").textContent=allItems.filter(x=>reviewFor(x.id)?.isWrong).length;
      $("reviewMastered").textContent=allItems.filter(x=>reviewFor(x.id)?.mastered).length;
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
      if(target) { currentId=id; progressSuspended=true; highlightCurrent(); updateBoard(); requestAnimationFrame(()=>target.scrollIntoView({behavior:"instant",block:"start"})); updateStatus(); }
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
      const element=event.target.closest("button"); const card=event.target.closest("[data-item]");
      if(card) { userInteracted=true; setCurrent(card.dataset.item,true); }
      if(!element) {
        if(card&&!event.target.closest("a,select,summary,details")&&["vocab","grammar"].includes(PAGE)) {
          if(auto||document.querySelector(".speaking")) stopAuto(); else readItem(byId.get(card.dataset.item));
        } return;
      }
      const get=key=>byId.get(element.dataset[key]);
      if(element.dataset.star) {
        stopAuto();
        const item=get("star"); const was=favorite(item); setReview(item,{isFavorite:!was});
        if(was&&!reviewFor(item.id).isWrong) save("review",item.id,{...state.review[item.id],archived:true});
        const node=$(item.id); const prior=node?.getBoundingClientRect().top; renderFilters(); renderContent();
        if(node&&prior!==undefined&&$(item.id)) window.scrollBy({top:$(item.id).getBoundingClientRect().top-prior,behavior:"instant"});
      } else if(element.dataset.choice) { await answerQuestion(get("choice"),element.dataset.value); }
      else if(element.dataset.example) { stopAuto(); const item=get("example"); await speak(item.kind==="dialogue"?item.turns[0].jp:item.example,element); }
      else if(element.dataset.read) { stopAuto(); const item=get("read"); await speak(item.reading||item.term,element); }
      else if(element.dataset.retry) { stopAuto(); const item=get("retry"); save("answers",item.id,{...state.answers[item.id],archived:true}); $(item.id).outerHTML=questionCard(item,listItems.indexOf(item)); updateBoard(); updateStatus(); }
      else if(element.dataset.dialoguePlay) { if(auto&&currentId===element.dataset.dialoguePlay) stopAuto(); else startAuto(element.dataset.dialoguePlay,true); }
      else if(element.dataset.turnRead) { stopAuto(); const item=get("turnRead"); await speak(item.turns[Number(element.dataset.turnIndex)].jp,element); }
      else if(element.dataset.dialogueNext) { const resolve=element._continue; element._continue=null; element.hidden=true; if(resolve) resolve(); }
      else if(element.dataset.mastered) { stopAuto(); const item=get("mastered"); setReview(item,{mastered:!reviewFor(item.id)?.mastered}); renderContent(); }
      else if(element.dataset.archive) { stopAuto(); const item=get("archive"); save("review",item.id,{...state.review[item.id],archived:true,isFavorite:false,isWrong:false}); renderFilters(); renderContent(); }
    });
  }

  function delay(ms) { return new Promise(resolve=>setTimeout(resolve,ms)); }
  function audioPrefs() { return state.preferences.audio||{enabled:true,rate:.85,voice:""}; }
  function cancelSpeech(increment=true) {
    if(increment) speechGeneration++;
    if(speechResolve) { speechResolve(false); speechResolve=null; }
    window.speechSynthesis?.cancel();
    document.querySelectorAll(".speaking").forEach(node=>node.classList.remove("speaking"));
  }
  function speak(text,button=null,options={}) {
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
    if($("sandyBubble")) $("sandyBubble").textContent=auto?"…":"点我自动听读";
  }
  function stopAuto() {
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
      } else if(!await speak(turn.jp,node?.querySelector(".example"))) return false;
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
    window.addEventListener("wheel",event=>{ if(!event.target.closest(".writing-board")) { progressSuspended=false; stopAuto(); } },{passive:true});
    window.addEventListener("touchmove",event=>{ if(!event.target.closest(".writing-board,.sandy,.snack")) { progressSuspended=false; stopAuto(); } },{passive:true});
    window.addEventListener("keydown",event=>{ if(!event.target.closest("input,select,button,a,summary,canvas")&&["ArrowDown","ArrowUp","PageDown","PageUp","Home","End"," "].includes(event.key)) { progressSuspended=false; stopAuto(); } });
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
    const total=allItems.filter(x=>reviewFor(x.id)).length;
    const wrong=allItems.filter(x=>reviewFor(x.id)?.isWrong).length;
    $("pageContent").innerHTML=`<div class="summary-grid"><div class="summary-box"><strong id="reviewTotal">${total}</strong>复习项目</div><div class="summary-box"><strong id="reviewWrong">${wrong}</strong>答错过</div><div class="summary-box"><strong id="reviewMastered">${allItems.filter(x=>reviewFor(x.id)?.mastered).length}</strong>已掌握</div></div><div class="panel"><div class="tags"><button class="pill" id="exportBackup">↓ 导出备份</button><label class="pill file-label">↑ 导入备份<input type="file" id="importBackup" accept="application/json,.json" hidden></label><button class="pill" id="showMastered" aria-pressed="${includeMastered}">✓ 包含已掌握</button></div><p class="english" style="margin-top:10px;margin-bottom:0">未登录时保存在当前浏览器；登录后可同步到你的账户。退出登录不会删除账户记录。</p></div>${toolsUI()}`;
    $("showMastered").onclick=()=>{ stopAuto(); includeMastered=!includeMastered; $("showMastered").setAttribute("aria-pressed",String(includeMastered)); savePagePreferences(); renderFilters(); renderContent(); };
    $("exportBackup").onclick=()=>{
      const blob=new Blob([JSON.stringify({app:"business-sandy",exportedAt:stamp(),state},null,2)],{type:"application/json"});
      const link=document.createElement("a"); link.href=URL.createObjectURL(blob); link.download=`business-sandy-${new Date().toISOString().slice(0,10)}.json`; link.click(); setTimeout(()=>URL.revokeObjectURL(link.href),1500);
    };
    $("importBackup").onchange=async event=>{
      const file=event.target.files[0]; if(!file) return;
      try { const imported=JSON.parse(await file.text()); if(imported.app!=="business-sandy"||!validateState(imported.state)) throw new Error("请选择这个网站导出的备份文件。"); stopAuto(); mergeState(state,imported.state); writeLocal(); scheduleSync(); renderFilters(); renderContent(); toast("备份已合并，进度和复习记录已恢复。"); }
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
    const redirect=params.get("redirect"); const allowed=Object.values(ROUTES).filter(x=>x!=="login.html"); const target=allowed.includes(redirect)?redirect:"index.html";
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
    if(PAGE==="login") { loginUI(); loadCloudClient(); return; }
    if(PAGE==="textbook") { setupTextbook(); loadCloudClient(); return; }
    if(PAGE==="mistakes") setupBackup(); else $("pageContent").innerHTML=toolsUI();
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
