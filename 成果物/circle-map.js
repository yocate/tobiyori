// Public sample municipality reference points, never private meeting locations.
const PUBLIC_MAP_POINTS={'前橋市':[36.39,139.06],'高崎市':[36.32,139.00],'桐生市':[36.40,139.33],'太田市':[36.29,139.38]};
let circleSearch=null,activeCircleMap=null,circleMapView=null;
function distanceInMeters(a,b){const rad=Math.PI/180,dlat=(b[0]-a[0])*rad,dlon=(b[1]-a[1])*rad;const h=Math.sin(dlat/2)**2+Math.cos(a[0]*rad)*Math.cos(b[0]*rad)*Math.sin(dlon/2)**2;return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));}
function activitiesInCircle(list,circle=circleSearch){if(!circle)return list;return list.filter(a=>{const point=PUBLIC_MAP_POINTS[a.city];return point&&distanceInMeters(circle.center,point)<=circle.radius;});}
function mapResultHTML(){const list=activitiesInCircle(filteredActivities());return `<h3 style="margin:20px 0 14px" role="status">${circleSearch?'円の範囲内':'この条件'}の活動 ${list.length}件</h3><div class="act-grid">${list.length?list.map(actCardHTML).join(''):'<div class="empty-state"><p>この範囲・条件に合う活動はありません。円を広げるか、絞り込み条件を変更してください。</p></div>'}</div>`;}
function viewMap(){
 const place=mapFilters.city==='all'?'群馬県':'群馬県 '+mapFilters.city;
 return `<div class="container section"><div class="section-head"><div><div class="eyebrow">Community Map</div><h2>地図を囲んで活動を探す</h2><p>好きな場所を円で囲むと、その範囲の活動に絞り込めます。</p></div></div>${filterBarHTML('m_')}<div class="circle-map-tools"><button class="btn btn-primary" id="drawMapCircle" aria-pressed="false">円で囲んで探す</button><button class="btn btn-secondary" id="circleMapCenter">画面の中央を囲む</button><button class="btn btn-ghost" id="clearMapCircle" ${circleSearch?'':'disabled'}>範囲を解除</button><a class="btn btn-ghost" href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(place)}" target="_blank" rel="noopener noreferrer">Googleマップで開く ↗</a></div><p id="circleMapHint" class="hint" role="status">「円で囲んで探す」を押して、中心から外側へドラッグ。タップだけなら半径5kmの円を作れます。</p><div class="circle-radius"><label for="circleRadius">円の半径 <output id="circleRadiusLabel">${circleSearch?(circleSearch.radius/1000).toFixed(1)+'km':'未指定'}</output></label><input id="circleRadius" type="range" min="0.5" max="50" step="0.5" value="${circleSearch?circleSearch.radius/1000:5}" ${circleSearch?'':'disabled'} aria-describedby="circleRadiusNote"><span id="circleRadiusNote" class="faint">円を描いたあと、0.5〜50kmで調整できます。</span></div><div id="circleSearchMap" class="circle-search-map" aria-label="公開エリアから活動を探す地図"></div><p id="circleMapNetwork" class="faint" role="status"></p><p class="faint" style="margin:12px 0">ピンは市町村の代表点を使ったサンプルです。円の検索結果もこの目安の位置で判定します。実際の活動場所や集合場所を示すものではありません。</p><div id="circleMapResults">${mapResultHTML()}</div></div>`;
}
function bindCircleMap(){
 const box=document.getElementById('circleSearchMap'),draw=document.getElementById('drawMapCircle'),clear=document.getElementById('clearMapCircle'),centerButton=document.getElementById('circleMapCenter'),radius=document.getElementById('circleRadius'),radiusLabel=document.getElementById('circleRadiusLabel'),hint=document.getElementById('circleMapHint');
 if(typeof L==='undefined'){box.innerHTML='<div class="empty-state"><p>地図の部品を読み込めませんでした。再読み込みするか、下の一覧から活動を探してください。</p></div>';[draw,centerButton,clear,radius].forEach(el=>el.disabled=true);return;}
 const map=L.map(box,{zoomControl:true,scrollWheelZoom:false,minZoom:7,maxZoom:17});activeCircleMap=map;
 const point=PUBLIC_MAP_POINTS[mapFilters.city]||[36.36,139.16];
 if(circleMapView&&circleMapView.city===mapFilters.city)map.setView(circleMapView.center,circleMapView.zoom);else map.setView(point,mapFilters.city==='all'?10:12);
 const tile=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',referrerPolicy:'strict-origin-when-cross-origin'}).addTo(map);
 const network=document.getElementById('circleMapNetwork');tile.on('tileerror',()=>network.textContent='背景地図を読み込めない箇所があります。公開エリアのピンと円の検索は使えます。Googleマップでも地域を確認できます。');
 L.control.scale({imperial:false}).addTo(map);
 const markers=L.layerGroup().addTo(map);let circleLayer=null,drawing=false,pointer=null;
 const latArray=latlng=>[latlng.lat,latlng.lng];
 const renderCircle=()=>{if(circleLayer)map.removeLayer(circleLayer);circleLayer=circleSearch?L.circle(circleSearch.center,{radius:circleSearch.radius,color:'#075333',weight:3,fillColor:'#C7F238',fillOpacity:.22,interactive:false}).addTo(map):null;};
 const repaint=()=>{
 renderCircle();const list=activitiesInCircle(filteredActivities());markers.clearLayers();
 Object.entries(PUBLIC_MAP_POINTS).forEach(([city,coords])=>{const group=list.filter(a=>a.city===city);if(!group.length)return;const marker=L.circleMarker(coords,{radius:10,color:'#fff',weight:3,fillColor:'#075333',fillOpacity:1}).addTo(markers);const popup=document.createElement('div');const title=document.createElement('strong');title.textContent=city+'の活動 '+group.length+'件（目安の位置）';popup.append(title);group.forEach(a=>{const button=document.createElement('button');button.type='button';button.className='map-activity-link';button.textContent=a.title;button.onclick=()=>nav('detail',a.id);popup.append(button);});marker.bindPopup(popup);marker.bindTooltip(city+' '+group.length+'件',{direction:'top'});});
 const results=document.getElementById('circleMapResults');results.innerHTML=mapResultHTML();results.querySelectorAll('[data-open-detail]').forEach(b=>b.onclick=()=>nav('detail',b.dataset.openDetail));
 radius.disabled=!circleSearch;clear.disabled=!circleSearch;if(circleSearch)radius.value=circleSearch.radius/1000;radiusLabel.textContent=circleSearch?(circleSearch.radius/1000).toFixed(1)+'km':'未指定';
 };
 const setDraw=value=>{drawing=value;draw.setAttribute('aria-pressed',String(value));draw.textContent=value?'円を描くのをやめる':'円で囲んで探す';box.classList.toggle('circle-drawing',value);if(value){map.dragging.disable();map.touchZoom.disable();map.doubleClickZoom.disable();hint.textContent='地図を押したまま外側へ動かして円を描いてください。タップなら半径5kmです。';}else{map.dragging.enable();map.touchZoom.enable();map.doubleClickZoom.enable();hint.textContent=circleSearch?'円の範囲で絞り込みました。半径を調整したり、別の円を描き直せます。':'「円で囲んで探す」を押して、中心から外側へドラッグしてください。';}};
 const clampRadius=value=>Math.min(50000,Math.max(500,Math.round(value/500)*500));
 draw.onclick=()=>setDraw(!drawing);
 centerButton.onclick=()=>{circleSearch={center:latArray(map.getCenter()),radius:5000};setDraw(false);repaint();};
 clear.onclick=()=>{circleSearch=null;pointer=null;setDraw(false);repaint();};
 radius.oninput=()=>{if(circleSearch){circleSearch.radius=Number(radius.value)*1000;repaint();}};
 box.addEventListener('pointerdown',e=>{if(!drawing||e.button>0||e.target.closest('.leaflet-control'))return;e.preventDefault();e.stopPropagation();pointer={id:e.pointerId,x:e.clientX,y:e.clientY,center:latArray(map.mouseEventToLatLng(e)),previous:circleSearch};box.setPointerCapture(e.pointerId);circleSearch={center:pointer.center,radius:500};renderCircle();},true);
 box.addEventListener('pointermove',e=>{if(!pointer||e.pointerId!==pointer.id)return;e.preventDefault();circleSearch.radius=clampRadius(distanceInMeters(pointer.center,latArray(map.mouseEventToLatLng(e))));renderCircle();radiusLabel.textContent=(circleSearch.radius/1000).toFixed(1)+'km';},true);
 box.addEventListener('pointerup',e=>{if(!pointer||e.pointerId!==pointer.id)return;e.preventDefault();e.stopPropagation();if(Math.hypot(e.clientX-pointer.x,e.clientY-pointer.y)<8)circleSearch.radius=5000;pointer=null;if(box.hasPointerCapture(e.pointerId))box.releasePointerCapture(e.pointerId);setDraw(false);repaint();},true);
 box.addEventListener('pointercancel',()=>{if(pointer){circleSearch=pointer.previous;pointer=null;setDraw(false);repaint();}},true);
 box.addEventListener('keydown',e=>{if(e.key==='Escape'){if(pointer){circleSearch=pointer.previous;pointer=null;repaint();}setDraw(false);draw.focus();}});
 map.on('moveend',()=>{circleMapView={center:latArray(map.getCenter()),zoom:map.getZoom(),city:mapFilters.city};});
 map.invalidateSize();repaint();
}
