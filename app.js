(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const siteName = '不思議スギ！昏睡レンズ！';
  const state = { data: null, activityData: null, profile: null, targets: [], selected: null, index: 0, face: null, scope: 'all', missionId: null, activities: null, today: null, limit: 24, cache: new Map(), failedImages: new Set(), showGuide: false, targetMatches: new Map(), imageVersion: '' };
  const collator = new Intl.Collator('ja');
  const todaySearchFields = window.LensSearch.index([{ value: '[今日/きょう]のお[題/だい]', kind: 'mission', fuzzy: false }]);
  let toastTimer;
  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function plain(text) { return String(text || '').replace(/\[([^/\]]+)\/[^\]]+\]/g, '$1').replace(/\\n/g, '\n'); }
  function gameTitle(profile) { return profile.title.replace(/（[^）]*）/g, ''); }
  function generator() { return window.LensFaceGenerator || null; }
  function safeFaceImage(path) { return typeof path === 'string' && /^\.\/faces\/[A-Za-z0-9][A-Za-z0-9_.-]*\.(?:png|webp)$/.test(path) ? path : null; }
  function imageURL(path) { return `${path}?v=${encodeURIComponent(state.imageVersion)}`; }
  function mappingHasImage(mapping) {
    if (!mapping || !generator() || state.failedImages.has(mapping.code)) return false;
    const calibration = mapping.imageCalibration;
    if (!calibration) return true;
    return calibration.matched === true && (calibration.nativeFaceDetectorVerified !== true || Boolean(safeFaceImage(calibration.imagePath)));
  }
  function canDisplay(target) { return target.codes.some((code) => mappingHasImage(state.mappingByCode?.get(code))); }
  function sanitizeSVG(source) {
    if (!source || typeof source !== 'string') return null;
    const doc = new DOMParser().parseFromString(source, 'image/svg+xml');
    const svg = doc.documentElement;
    if (svg.localName !== 'svg' || doc.querySelector('parsererror')) return null;
    doc.querySelectorAll('script,foreignObject,iframe,object,embed,image,use,style,animate,animateTransform,set').forEach((node) => node.remove());
    doc.querySelectorAll('*').forEach((node) => { for (const attr of [...node.attributes]) { const withoutLocalReferences = attr.value.replace(/url\(\s*['"]?#[A-Za-z_][\w.-]*['"]?\s*\)/g, ''); if (/^on/i.test(attr.name) || /href/i.test(attr.name) || /url\s*\(/i.test(withoutLocalReferences)) node.removeAttribute(attr.name); } });
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', `${state.selected?.name || '妖怪'}の撮影用の顔候補`);
    return new XMLSerializer().serializeToString(svg);
  }
  async function loadCatalog() {
    let data;
    for (const path of ['./data/lens-catalog.json']) {
      try { const response = await fetch(path, { cache: 'no-store' }); if (response.ok) { data = await response.json(); state.imageVersion = response.headers.get('last-modified') || String(Date.now()); break; } } catch {}
    }
    if (!data) { showEmptyCatalog(location.protocol === 'file:' ? 'ローカルの起動ファイルから開いてください' : '掲載データを準備しています', location.protocol === 'file:' ? 'フォルダー内の「サイトを開く」を実行すると、解析データを読み込めます。' : '解析した妖怪と顔の候補がここに並びます。現在、表示できる候補はありません。'); return; }
    state.activityData = null;
    try { const response = await fetch('./data/lens-activities.json', { cache: 'no-store' }); if (response.ok) state.activityData = await response.json(); } catch {}
    try {
      state.data = data;
      const eligibleProfiles = data.profiles.filter((profile) => profile.id === 'yw2-shinuchi-jp' || profile.validation?.nativeVariantImageBatchVerified === true);
      const profileGroups = [['yw2-ganso-jp-update', 'yw2-ganso-jp-base'], ['yw2-honke-jp-update', 'yw2-honke-jp-base'], ['yw2-shinuchi-jp']];
      const profiles = profileGroups.map((ids) => ids.map((id) => eligibleProfiles.find((entry) => entry.id === id)).find(Boolean)).filter(Boolean);
      const profile = profiles.find((entry) => entry.id === data.defaultProfile) || profiles[0];
      const options = profiles.map((entry) => { const option = el('option', '', gameTitle(entry)); option.value = entry.id; return option; });
      $('profile-select').replaceChildren(...options);
      $('profile-picker').hidden = profiles.length < 2;
      applyProfile(profile);
    } catch (error) { console.error('Lens catalog could not be read:', error); showEmptyCatalog('データを読み込めませんでした', 'データを確認して、もう一度読み込んでください。'); }
  }
  function applyProfile(profile) {
      if (!profile || !Array.isArray(profile.outcomes) || !Array.isArray(profile.mappings)) throw new Error('Missing catalog profile.');
      state.profile = profile;
      state.cache.clear();
      state.failedImages.clear();
      state.selected = null;
      state.face = null;
      state.index = 0;
      state.limit = 24;
      state.showGuide = false;
      state.missionId = null;
      $('target-search').value = '';
      $('profile-select').value = profile.id;
      document.title = siteName;
      state.mappingByCode = new Map(profile.mappings.map((mapping) => [mapping.code, mapping]));
      state.targets = state.profile.outcomes.map((outcome) => {
        const analysisCodes = outcome.codes || [];
        const photoCodes = analysisCodes.filter((code) => mappingHasImage(state.mappingByCode.get(code)));
        return { ...outcome, id: String(outcome.charaIdHex || outcome.charaId), name: outcome.name || outcome.charaIdHex,
          analysisCodes, photoCodes, codes: photoCodes.length ? photoCodes : analysisCodes };
      }).sort((a,b) => collator.compare(a.name,b.name));
      state.activities = window.LensActivities.create(profile, state.activityData);
      state.targets.forEach((target) => {
        target.missions = state.activities.missions.filter((mission) => mission.targetIds.includes(target.id));
        target.searchFields = window.LensSearch.index([{ value: target.name, kind: 'name' }, { value: target.nameWithReading, kind: 'name' }, ...target.missions.flatMap((mission) => [{ value: mission.title, kind: 'mission', fuzzy: false }, { value: mission.rewardName, kind: 'reward' }, { value: mission.rewardReading, kind: 'reward' }])]);
      });
      $('target-search').disabled = !state.targets.length;
      $('tribe-filter').hidden = true;
      $('updated-at').textContent = gameTitle(state.profile);
      $('about-data-note').textContent = '顔の表示と画像の保存はこのブラウザー内で行います。画像や入力内容を外部へ送信しません。';
      $('source-details').textContent = `${gameTitle(state.profile)}のゲーム内データをもとに、ふしぎなレンズの妖怪・お題・報酬を掲載しています。`;
      renderDailyMission();
      renderGrid();
      const initial = state.targets.find((target) => target.name === 'ジバニャン' && canDisplay(target)) || state.targets.find(canDisplay);
      if (initial) selectTarget(initial.id, false);
  }
  function showEmptyCatalog(title, copy) {
    $('match-count').textContent = '0件';
    $('catalog-empty').hidden = false; $('empty-title').textContent = title; $('empty-copy').textContent = copy;
    $('about-data-note').textContent = '現在、掲載データは読み込まれていません。';
    $('source-details').textContent = '';
  }
  function filteredTargets() {
    const query = $('target-search').value.trim();
    state.targetMatches.clear();
    if (!['all', 'yokai'].includes(state.scope)) return [];
    const mission = state.activities?.missions.find((entry) => entry.id === state.missionId);
    const targets = state.targets.filter((target) => {
      if (mission && !mission.targetIds.includes(target.id)) return false;
      const fields = target.missions.some((entry) => entry.id === state.today?.id) ? [...target.searchFields, ...todaySearchFields] : target.searchFields;
      const match = window.LensSearch.match(fields, query);
      if (match) state.targetMatches.set(target.id, match);
      return Boolean(match);
    });
    return targets.sort((a, b) => state.targetMatches.get(a.id).score - state.targetMatches.get(b.id).score || collator.compare(a.name, b.name));
  }
  function filteredActivities(kind) {
    const query = $('target-search').value.trim();
    if (state.scope === 'yokai' || state.scope === 'all' && !query) return [];
    if (kind === 'mission' && state.scope === 'rewards' || kind === 'reward' && state.scope === 'missions') return [];
    const entries = kind === 'mission' ? state.activities?.missions || [] : [...state.activities?.missions || [], ...state.activities?.presents || [], ...state.activities?.samples || []];
    return entries.map((entry) => ({ entry, match: window.LensSearch.match(entry.id === state.today?.id ? [...entry.searchFields, ...todaySearchFields] : entry.searchFields, query) })).filter(({ entry, match }) => match && (state.scope !== 'all' || (kind === 'mission' ? match.kind !== 'reward' : entry.kind !== 'mission' || match.kind === 'reward'))).sort((a, b) => a.match.score - b.match.score || (a.entry.ordinal || 0) - (b.entry.ordinal || 0)).map(({ entry }) => entry);
  }
  function activityNode(entry) {
    const card = el('article', 'activity-card');
    const title = entry.kind === 'mission' ? `${entry.ordinal}. ${entry.title}` : entry.title;
    card.append(el('h4', '', title), el('p', 'activity-condition', entry.condition), el('p', 'activity-reward', `報酬：${entry.reward}`));
    if (entry.kind === 'mission' && entry.targetIds.length) {
      const button = el('button', 'text-button', '該当する妖怪を見る'); button.type = 'button'; button.dataset.mission = entry.id; card.append(button);
    }
    return card;
  }
  function applyMission(id) {
    const mission = state.activities?.missions.find((entry) => entry.id === id);
    if (!mission?.targetIds.length) return;
    state.missionId = id; state.scope = 'yokai'; state.limit = 24; $('target-search').value = '';
    updateSearchButtons(); renderGrid();
    $('catalog').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion:reduce)').matches ? 'instant' : 'smooth', block: 'start' });
  }
  function updateSearchButtons() {
    document.querySelectorAll('[data-scope]').forEach((entry) => entry.setAttribute('aria-pressed', String(entry.dataset.scope === state.scope)));
  }
  function renderDailyMission() {
    $('daily-mission').hidden = !state.activities?.missions.length;
    if (!state.activities?.missions.length) return;
    const result = window.LensActivities.daily(state.activities, $('game-clock').value);
    state.today = result.mission;
    const date = result.day;
    $('daily-date').textContent = date ? `${date.getUTCFullYear()}年${date.getUTCMonth() + 1}月${date.getUTCDate()}日のお題` : '今日のお題';
    $('daily-title').textContent = result.mission?.title || '条件解析中';
    $('daily-reward').textContent = result.mission ? `報酬：${result.mission.reward}` : '';
    $('daily-find').hidden = !result.mission?.targetIds.length;
    $('clock-status').textContent = date ? '' : '3DSの日時を2000〜2099年の範囲で入力してください。';
    if (state.selected) renderSelectedRewards(state.selected);
  }
  function renderSelectedRewards(target) {
    const content = document.createDocumentFragment();
    const missions = [...target.missions].sort((a, b) => Number(b.id === state.today?.id) - Number(a.id === state.today?.id) || a.ordinal - b.ordinal);
    if (missions.length) {
      const details = el('details', 'reward-details'); details.open = missions.some((entry) => entry.id === state.today?.id);
      details.append(el('summary', '', `関連するお題の報酬（${missions.length}件）`));
      const list = el('div', 'reward-list');
      missions.forEach((mission) => {
        const row = el('div', 'reward-row');
        row.append(el('strong', '', mission.reward), el('p', '', `${mission.id === state.today?.id ? '今日のお題：' : 'このお題の日：'}${mission.title}`), el('span', '', 'お題の条件を満たしたときのごほうび'));
        list.append(row);
      });
      details.append(list); content.append(details);
    } else content.append(el('p', 'condition-empty', state.activities.missions.every((entry) => entry.resolved) ? 'この妖怪に関連するお題はありません。' : 'この妖怪に関連するお題の条件は確認中です。'));
    const presents = el('details', 'reward-details'); presents.append(el('summary', '', '種類数に応じたごほうび'), el('p', 'reward-help', '初めて激写した妖怪だけを数えます。各ごほうびは一度ずつ受け取れます。'));
    const list = el('div', 'reward-list');
    [...state.activities.presents, ...state.activities.samples].forEach((entry) => { const row = el('div', 'reward-row'); row.append(el('strong', '', entry.reward), el('p', '', entry.condition)); list.append(row); });
    presents.append(list); content.append(presents);
    $('selected-rewards').replaceChildren(content);
  }
  function renderGrid() {
    const targets = filteredTargets(), missions = filteredActivities('mission'), rewards = filteredActivities('reward'); const fragment = document.createDocumentFragment();
    targets.slice(0, state.limit).forEach((target) => {
      const button = el('button', 'target-card'); button.type = 'button'; button.dataset.id = target.id;
      button.setAttribute('aria-pressed', String(state.selected?.id === target.id)); button.setAttribute('aria-label', target.name);
      const body = el('div','target-card-body'); body.append(el('strong','target-card-name',target.name));
      const match = state.targetMatches.get(target.id);
      if (match?.fuzzy) body.append(el('span', 'search-context', '近い名前'));
      else if (match?.kind === 'mission' || match?.kind === 'reward') body.append(el('span', 'search-context', `${match.kind === 'mission' ? 'お題' : '報酬'}：${match.label}`));
      button.append(body); fragment.append(button);
    });
    $('target-grid').replaceChildren(fragment); $('target-grid').hidden = !targets.length;
    $('mission-list').replaceChildren(...missions.slice(0, state.limit).map(activityNode)); $('mission-results').hidden = !missions.length;
    $('reward-list').replaceChildren(...rewards.slice(0, state.limit).map(activityNode)); $('reward-results').hidden = !rewards.length;
    const total = targets.length + missions.length + rewards.length;
    $('match-count').textContent = `${total.toLocaleString('ja-JP')}件`;
    $('load-more').hidden = [targets, missions, rewards].every((entries) => entries.length <= state.limit);
    $('load-more').textContent = `さらに表示（${[targets, missions, rewards].reduce((count, entries) => count + Math.min(state.limit, entries.length), 0)} / ${total}件）`;
    const mission = state.activities?.missions.find((entry) => entry.id === state.missionId);
    $('mission-filter').hidden = !mission; $('mission-filter-label').textContent = mission ? `お題：${mission.title}` : '';
    $('catalog-empty').hidden = total > 0;
    if (!total && state.targets.length) { $('empty-title').textContent = '条件に合うものがありません'; $('empty-copy').textContent = '検索するものや言葉を変えて探してみてください。'; $('clear-filters').hidden = false; } else $('clear-filters').hidden = true;
  }
  function generateFace(mapping) {
    const key = `${state.profile.id}:${mapping.code}`;
    if (state.cache.has(key)) return state.cache.get(key);
    let face = { available: false, code: mapping.code, mapping, status:'candidate' };
    if (mappingHasImage(mapping)) { try { face = { ...face, ...generator().generate(mapping,state.profile) }; face.svg = sanitizeSVG(face.svg); face.image = safeFaceImage(face.image); face.available = Boolean(face.image || face.svg); } catch(error) { console.error('Face generation failed:',error); } }
    state.cache.set(key,face); return face;
  }
  function faceNode(face) {
    if (face.image) {
      const image = el('img'); image.src = imageURL(face.image); image.alt = `${state.selected?.name || '妖怪'}の撮影用の顔候補`;
      image.addEventListener('error', () => {
        if (state.failedImages.has(face.code)) return;
        state.failedImages.add(face.code); state.cache.delete(`${state.profile.id}:${face.code}`);
        renderGrid();
        if (state.face?.code === face.code) renderSelection();
      }, { once: true });
      return image;
    }
    return new DOMParser().parseFromString(face.svg,'image/svg+xml').documentElement.cloneNode(true);
  }
  function fitCaptureGuide(containerWidth, containerHeight, imageWidth, imageHeight) {
    if (imageWidth !== 512 || imageHeight !== 384 || containerWidth <= 0 || containerHeight <= 0) return null;
    const scale = Math.min(containerWidth / imageWidth, containerHeight / imageHeight);
    return { left: (containerWidth - imageWidth * scale) / 2 + 6 * scale,
      top: (containerHeight - imageHeight * scale) / 2 + 42 * scale,
      width: 500 * scale, height: 300 * scale };
  }
  function updateViewerGuide() {
    const stage = $('viewer-face').querySelector('.face-guide-stage');
    const image = stage?.querySelector('img');
    const rect = image ? fitCaptureGuide(stage.clientWidth, stage.clientHeight, image.naturalWidth, image.naturalHeight) : null;
    $('viewer-guide-controls').hidden = !rect;
    $('viewer-guide-help').hidden = !rect;
    $('viewer-guide-toggle').disabled = !rect;
    $('viewer-guide-toggle').checked = state.showGuide;
    const guide = stage?.querySelector('.capture-guide');
    if (!guide) return;
    guide.hidden = !rect || !state.showGuide;
    if (rect) Object.entries(rect).forEach(([name, value]) => { guide.style[name] = `${value}px`; });
  }
  function viewerFaceNode(face) {
    const node = faceNode(face);
    if (!face.image) return node;
    const stage = el('div', 'face-guide-stage');
    const guide = el('div', 'capture-guide'); guide.hidden = true; guide.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 4; i++) guide.append(el('i'));
    node.addEventListener('load', updateViewerGuide, { once: true });
    stage.append(node, guide); return stage;
  }
  function selectTarget(id,scroll=true) {
    const target = state.targets.find((entry) => entry.id === id); if(!target) return;
    state.selected=target; const firstImageIndex=target.codes.findIndex((code)=>mappingHasImage(state.mappingByCode.get(code))); state.index=firstImageIndex<0?0:firstImageIndex; renderGrid(); renderSelection();
    if(scroll && matchMedia('(max-width:740px)').matches) document.querySelector('.preview-panel').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth',block:'start'});
  }
  function setFaceIndex(index) { if(!state.selected?.codes.length) return; state.index=((index%state.selected.codes.length)+state.selected.codes.length)%state.selected.codes.length; renderSelection(); }
  function renderSelection() {
    const target=state.selected; if(!target) return;
    const mapping=state.mappingByCode.get(target.codes[state.index]); const face=mapping?generateFace(mapping):null; state.face=face;
    $('selected-name').textContent=target.name;
    $('condition-status').textContent=`${target.codes.length}候補`; $('frame-index').textContent=`${state.index+1} / ${target.codes.length}`;
    if(face?.available) $('face-view').replaceChildren(faceNode(face)); else {const placeholder=el('div','face-empty');placeholder.append(el('strong','','撮影用の顔を準備中'),el('span','','別の妖怪も一覧から探せます'));$('face-view').replaceChildren(placeholder);}
    $('open-viewer').disabled=!face?.available; $('download-face').disabled=!face?.available;
    ['previous-face','next-face','viewer-previous','viewer-next'].forEach((id)=>{$(id).disabled=target.codes.length<2;});
    const lateWarning=face?.mapping?.imageCalibration?.lateHistoryVerification?.warning;
    const boundaryWarning=face?.mapping?.imageCalibration?.sourceBoundaryCaution||face?.mapping?.imageCalibration?.lateHistoryVerification?.boundaryWarning;
    $('preview-help').textContent=lateWarning||boundaryWarning||'';
    $('preview-help').hidden=!$('preview-help').textContent;
    renderConditions(target,face); renderSelectedRewards(target); if($('viewer-dialog').open) updateViewer();
  }
  function renderConditions(target,face) {
    const content=document.createDocumentFragment();
    if(target.faceText) content.append(el('p','condition-description',plain(target.faceText)));
    if(Array.isArray(target.conditions)&&target.conditions.length&&!face?.mapping?.saveGate?.required){const list=el('ul','conditions-list');target.conditions.filter((condition)=>typeof condition==='string').forEach((condition)=>list.append(el('li','',plain(condition))));content.append(list);}
    if(Array.isArray(face?.mapping?.conditions)){face.mapping.conditions.forEach((condition)=>content.append(el('p','condition-note',plain(condition))));}
    const saveGate = face?.mapping?.saveGate;
    if(saveGate?.required){content.append(el('p','condition-note',`この妖怪の大辞典の登録条件があります。「見た」・写真の記録とは別です。条件を満たさない場合は「${saveGate.allRegistrationBitsClearName || '代替の妖怪'}」になります。`));}
    const outcomeNotes=Array.isArray(target.notes)?target.notes.filter((note)=>typeof note==='string'):[];
    if(outcomeNotes.length) content.append(el('p','condition-note',outcomeNotes.map(plain).join(' ')));
    $('condition-content').replaceChildren(content);
  }
  function updateViewer(){
    if(!state.selected)return;
    const lateWarning=state.face?.mapping?.imageCalibration?.lateHistoryVerification?.warning;
    const boundaryWarning=state.face?.mapping?.imageCalibration?.sourceBoundaryCaution||state.face?.mapping?.imageCalibration?.lateHistoryVerification?.boundaryWarning;
    $('viewer-title').textContent=`${state.selected.name} · 候補 ${state.index+1}`;
    $('viewer-fullscreen').disabled=!state.face?.available;
    if(state.face?.available){$('viewer-face').replaceChildren(viewerFaceNode(state.face));$('viewer-caption').textContent=lateWarning||boundaryWarning||'';}
    else{const placeholder=el('div','face-empty');placeholder.append(el('strong','','この条件の顔は準備中'));$('viewer-face').replaceChildren(placeholder);$('viewer-caption').textContent='表示できる顔がまだありません。';}
    $('viewer-caption').hidden=!$('viewer-caption').textContent;
    $('viewer-guide-help').textContent=lateWarning?'四隅の目安は位置合わせ用です。この候補の撮影タイミングは調整中です。':'四隅の目安を3DSのカメラ画面の四辺に合わせます。目安を消し、数秒動かさずに待ってから撮影してください。';
    $('viewer-note').textContent=lateWarning?'この候補は長く待ったときの判定が安定していません。実機撮影も未確認です。':'画面を3DSに向け、顔が安定するまで数秒動かさずに待ってから撮影してください。';
    updateViewerGuide();
  }
  function openViewer(){if(!state.face?.available)return;state.showGuide=false;updateViewer();$('viewer-dialog').showModal();updateViewerGuide();}
  async function closeViewer(){if(document.fullscreenElement===$('viewer-dialog')){try{await document.exitFullscreen();}catch{}}state.showGuide=false;$('viewer-dialog').classList.remove('expanded');$('viewer-fullscreen').textContent='全画面にする';$('viewer-dialog').close();}
  function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>{$('toast').hidden=true;},4000);}
  async function downloadFace(){
    const face=state.face;if(!face?.available)return;let sourceURL;
    const targetName=state.selected.name;const faceIndex=state.index;
    const extension=face.image?.endsWith('.webp')?'webp':'png';
    try{let blob;
      if(face.image){const response=await fetch(imageURL(face.image));if(!response.ok)throw new Error('Image file unavailable');blob=await response.blob();}
      else{sourceURL=URL.createObjectURL(new Blob([face.svg],{type:'image/svg+xml;charset=utf-8'}));const image=new Image();await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=sourceURL;});const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);blob=await new Promise((resolve)=>canvas.toBlob(resolve,'image/png'));}
      if(!blob)throw new Error('Image creation failed.');const url=URL.createObjectURL(blob);const link=el('a');link.href=url;link.download=`${siteName}_${targetName.replace(/[<>:"/\\|?*]/g,'')}_候補${faceIndex+1}.${extension}`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);toast('画像を保存しました。');
    }catch{toast('画像を保存できませんでした。大きく表示して撮影してください。');}finally{if(sourceURL)URL.revokeObjectURL(sourceURL);}
  }
  $('profile-select').addEventListener('change',async()=>{const profile=state.data?.profiles.find((entry)=>entry.id===$('profile-select').value);if(!profile)return;if($('viewer-dialog').open)await closeViewer();applyProfile(profile);});
  $('target-grid').addEventListener('click',(event)=>{const card=event.target.closest('.target-card');if(card)selectTarget(card.dataset.id);});
  $('target-search').addEventListener('input',()=>{state.limit=24;state.missionId=null;renderGrid();});
  document.querySelector('.search-scopes').addEventListener('click',(event)=>{const button=event.target.closest('[data-scope]');if(!button)return;state.scope=button.dataset.scope;state.missionId=null;state.limit=24;updateSearchButtons();renderGrid();});
  ['mission-list','reward-list'].forEach((id)=>$(id).addEventListener('click',(event)=>{const button=event.target.closest('[data-mission]');if(button)applyMission(button.dataset.mission);}));
  $('daily-find').addEventListener('click',()=>applyMission(state.today?.id));
  $('clear-mission').addEventListener('click',()=>{state.missionId=null;state.limit=24;renderGrid();});
  $('game-clock').addEventListener('input',()=>{renderDailyMission();renderGrid();});
  $('clock-now').addEventListener('click',()=>{$('game-clock').value=window.LensActivities.clockValue();renderDailyMission();renderGrid();});
  $('clear-filters').addEventListener('click',()=>{$('target-search').value='';state.scope='all';state.missionId=null;state.limit=24;updateSearchButtons();renderGrid();});
  $('load-more').addEventListener('click',()=>{state.limit+=24;renderGrid();});
  ['previous-face','viewer-previous'].forEach((id)=>$(id).addEventListener('click',()=>setFaceIndex(state.index-1)));
  ['next-face','viewer-next'].forEach((id)=>$(id).addEventListener('click',()=>setFaceIndex(state.index+1)));
  $('open-viewer').addEventListener('click',openViewer);$('close-viewer').addEventListener('click',closeViewer);$('download-face').addEventListener('click',downloadFace);
  $('viewer-guide-toggle').addEventListener('change',()=>{state.showGuide=$('viewer-guide-toggle').checked;updateViewerGuide();});
  if(typeof ResizeObserver==='function'){new ResizeObserver(updateViewerGuide).observe($('viewer-face'));}else{window.addEventListener('resize',updateViewerGuide);}
  $('about-button').addEventListener('click',()=>$('about-dialog').showModal());$('close-about').addEventListener('click',()=>$('about-dialog').close());
  $('viewer-fullscreen').addEventListener('click',async()=>{const dialog=$('viewer-dialog');if(dialog.classList.contains('expanded')){dialog.classList.remove('expanded');$('viewer-fullscreen').textContent='全画面にする';return;}try{if(document.fullscreenElement)await document.exitFullscreen();else if(document.fullscreenEnabled&&dialog.requestFullscreen)await dialog.requestFullscreen();else throw new Error('Native fullscreen unavailable');}catch{dialog.classList.add('expanded');$('viewer-fullscreen').textContent='全画面を解除';}});
  document.addEventListener('fullscreenchange',()=>{$('viewer-fullscreen').textContent=document.fullscreenElement||$('viewer-dialog').classList.contains('expanded')?'全画面を解除':'全画面にする';});
  $('viewer-dialog').addEventListener('cancel',(event)=>{event.preventDefault();closeViewer();});
  [$('viewer-dialog'),$('about-dialog')].forEach((dialog)=>dialog.addEventListener('click',(event)=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom){if(dialog.id==='viewer-dialog')closeViewer();else dialog.close();}}));
  document.addEventListener('keydown',(event)=>{if(event.key==='/'&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)&&!document.querySelector('dialog[open]')&&!$('target-search').disabled){event.preventDefault();$('target-search').focus();}if($('viewer-dialog').open&&event.key==='ArrowLeft'){event.preventDefault();setFaceIndex(state.index-1);}if($('viewer-dialog').open&&event.key==='ArrowRight'){event.preventDefault();setFaceIndex(state.index+1);}});
  $('game-clock').value=window.LensActivities.clockValue();
  loadCatalog();
  window.LensUI={reload:loadCatalog,getSelection:()=>({targetId:state.selected?.id||null,code:state.face?.code??null,faceIndex:state.index,available:state.face?.available||false})};
})();
