// Test walk for the prototype. Not part of the page. Run from the hidden browser.
export async function run(){
  const errs=[], fails=[], q=s=>document.querySelector(s), qa=s=>[...document.querySelectorAll(s)];
  window.addEventListener('error',e=>errs.push(e.message));
  window.addEventListener('unhandledrejection',e=>errs.push('rej '+e.reason));
  const ok=(c,m)=>{if(!c)fails.push(m)};
  const click=s=>{const e=typeof s==='string'?q(s):s; if(!e){fails.push('missing '+s);return false} e.click(); return true};
  const type=(s,v)=>{const e=q(s); if(!e){fails.push('missing input '+s);return} e.value=v; e.dispatchEvent(new Event('input',{bubbles:true}))};
  const key=(s,k)=>{(s?q(s):document.body).dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true}))};
  const act=(a,arg)=>`[data-act="${a}"]`+(arg!=null?`[data-arg="${arg}"]`:'');
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const panel={access:['signed in','signed out','sign-ups closed'],limit:['under','reached'],dress:['loaded','loading'],looks:['loaded','loading','empty'],saving:['works','fails'],theme:['device','light','dark'],screen:['auto','phone']};

  for(const screen of ['auto','phone']){
    StatePanel.reset(); StatePanel.set('screen',screen);
    const tag='['+screen+'] ';
    click(act('nav','dress'));
    // every panel option on every page
    for(const pg of ['dress','looks']){ click(act('nav',pg));
      for(const [row,opts] of Object.entries(panel)){ if(row==='screen')continue; for(const o of opts){StatePanel.set(row,o); ok(q('#app').children.length>0,tag+'blank at '+row+'='+o)} StatePanel.set(row,opts[0]) } }
    click(act('nav','dress'));
    // modes
    let n=0;
    if(screen==='phone') click(act('dressTab','mode'));
    for(const w of ['Hot','Cool','Cold','Training']){ click(act('weather',w)); for(const c of qa('.mcard')){ const id=c.dataset.arg; click(act('mode',id)); n++; ok(q('#fig svg'),tag+'no figure for mode '+id) } }
    ok(n===25,tag+'mode cards '+n);
    // colours, jacket, add, edit
    click(act('weather','Cold')); click(act('mode','17'));
    if(screen==='phone') click(act('dressTab','colours'));
    ok(qa('.grow').length===4,tag+'rows '+qa('.grow').length);
    click(act('jacket','chore|0')); ok(S.open.chore===false,tag+'jacket closed'); click(act('jacket','chore|1'));
    A.mode(20); render(); click(act('jacket','padded|0')); ok(S.open.padded===false,tag+'padded closed'); click(act('jacket','padded|1')); A.mode(17); render();
    click(qa('.grow')[1].querySelectorAll('.sw')[1]); ok(S.cur.sweater===S.pal.sweater[1],tag+'swatch click');
    const before=S.pal.sweater.length;
    click(act('addColour','sweater')); ok(q('.picker'),tag+'picker open');
    type('#hex','zz!'); ok(q('#pickadd').disabled&&q('#hexhint').classList.contains('bad'),tag+'bad hex state');
    type('#hex','0a7'); ok(!q('#pickadd').disabled,tag+'short hex ok'); await sleep(40);
    click('#pickadd'); ok(S.pal.sweater.length===before+1&&S.cur.sweater==='#00AA77',tag+'colour added '+S.cur.sweater);
    click(act('addColour','sweater')); type('#hex','#00aa77'); click('#pickadd'); ok(S.pal.sweater.length===before+1,tag+'duplicate not added');
    click(act('addColour','sweater')); key(null,'Escape'); ok(!q('.picker'),tag+'esc closes picker');
    click(act('addColour','sweater'));
    const sv=q('#sv'),r=sv.getBoundingClientRect();
    sv.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,clientX:r.left+r.width*.7,clientY:r.top+r.height*.3,pointerId:1}));
    document.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:r.left+r.width*.5,clientY:r.top+r.height*.5,pointerId:1}));
    document.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:1}));
    ok(Math.abs(S.ov.s-.5)<.02&&Math.abs(S.ov.v-.5)<.02,tag+'drag square'); click(act('ovClose'));
    click(act('editSq')); click(act('sw','sweater|#00AA77')); ok(!S.pal.sweater.includes('#00AA77'),tag+'square removed'); click(act('editSq'));
    // save
    const lc=S.looks.length;
    click(act('saveOpen')); type('#lname','Walk look'); click(act('tagToggle','Work')); click(act('newTagOpen')); q('#newtag').value='Trip'; click(act('newTagDo'));
    click(act('saveDo','new')); ok(S.looks.length===lc+1&&S.looks[0].name==='Walk look'&&S.looks[0].tags.join()==='Work,Trip',tag+'look saved');
    click(act('saveOpen')); key(null,'Escape'); ok(!S.ov,tag+'esc closes save form');
    // looks
    click(act('nav','looks')); ok(qa('.lcard').length===S.looks.length,tag+'wall cards');
    for(const c of ['Hot','Cool','Cold','Work','Trip','All']) click(act('chip',c));
    const id=S.looks[0].id;
    click(act('openLook',id)); ok(screen==='phone'?S.page==='look':S.sel===id,tag+'open look');
    click(act('copy')); click(act('lookEdit',id)); ok(S.page==='dress'&&S.editing===id&&q('.editbar'),tag+'edit state');
    click(act('editStop')); ok(!S.editing,tag+'edit stop');
    click(act('nav','looks')); click(act('openLook',id)); click(act('lookEdit',id)); click(act('saveOpen')); type('#lname','Walk look 2'); click(act('saveDo','replace'));
    ok(S.looks.find(l=>l.id===id).name==='Walk look 2',tag+'save changes');
    click(act('nav','looks')); click(act('openLook',id)); click(act('lookDel',id)); ok(S.cf,tag+'confirm shows'); click(act('cfNo')); ok(S.looks.some(l=>l.id===id),tag+'cancel delete');
    click(act('lookDel',id)); click(act('cfYes')); ok(!S.looks.some(l=>l.id===id),tag+'look deleted');
    if(S.page!=='looks') click(act('nav','looks'));
    // compare
    click(act('pickStart')); const cards=qa('.lcard'); cards.forEach((c,i)=>{ click(act('openLook',c.dataset.arg)) });
    ok(S.picked.length===Math.min(6,cards.length),tag+'picked '+S.picked.length);
    click(act('compareGo')); ok(S.page==='compare'&&qa('.cc').length===S.picked.length,tag+'compare view'); click(act('back')); ok(S.page==='looks',tag+'back from compare');
    // tags
    click(act('tagsOpen')); click(act('tagRen','Trip')); q('#rentag').value='Travel'; click(act('tagRenDo')); ok(S.tags.includes('Travel'),tag+'tag renamed');
    click(act('tagAdd')); q('#addtag').value='Temp'; click(act('tagAddDo')); ok(S.tags.includes('Temp'),tag+'tag added');
    click(act('tagDel','Temp')); click(act('cfYes')); click(act('tagDel','Travel')); click(act('cfYes')); ok(!S.tags.includes('Temp')&&!S.tags.includes('Travel'),tag+'tags deleted'); click(act('ovClose'));
    // settings
    click(act('settings')); ok(S.page==='settings'&&q(act('accountDel')),tag+'settings');
    click(act('pickFor','skin')); type('#hex','#C68642'); click('#pickadd'); ok(S.skin==='#C68642',tag+'skin set');
    click(act('pickFor','skin')); type('#hex','#D6A27B'); click('#pickadd');
    click(act('signOut')); ok(q('.gate'),tag+'signed out'); click(act('signIn')); ok(!q('.gate'),tag+'signed in');
    StatePanel.set('access','sign-ups closed'); ok(q('.gate'),tag+'closed page'); click(act('signIn')); click(act('settings')); click(act('accountDel')); click(act('cfNo')); ok(!q('.gate'),tag+'cancel account delete'); click(act('accountDel')); click(act('cfYes')); ok(q('.gate'),tag+'account deleted'); click(act('signIn')); StatePanel.set('limit','reached'); click(act('saveOpen')); ok(q(act('saveDo','new')).disabled,tag+'limit blocks save'); click(act('ovClose')); StatePanel.set('limit','under');
    // saving fails
    StatePanel.set('saving','fails'); if(screen==='phone') click(act('dressTab','colours')); click(qa('.sw')[0]); ok(q('.unsaved'),tag+'not saved bar');
    click(act('retry')); ok(q('.unsaved'),tag+'retry still fails'); StatePanel.set('saving','works'); click(act('retry')); ok(!q('.unsaved'),tag+'retry works');
    click(act('settings')); click(act('back'));
  }
  StatePanel.reset();
  return JSON.stringify({fails,errs,looks:S.looks.length});
}
