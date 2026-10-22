const $=id=>document.getElementById(id);
const canvas=$('preview'),ctx=canvas.getContext('2d'),waveCanvas=$('wavePreview'),wctx=waveCanvas.getContext('2d');
let audioURL='',personImg=null,sceneImgs=[],captionStyle='bold',waveStyle='bars',ratio='landscape',audioCtx=null,analyser=null,source=null,raf=null;
const audio=$('audio');
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3800)}
function loadImage(file){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=URL.createObjectURL(file)})}
$('audioFile').addEventListener('change',e=>{const f=e.target.files[0];if(!f)return;audioURL=URL.createObjectURL(f);audio.src=audioURL;$('audioName').textContent=f.name;$('previewHint').textContent='Audio loaded · add scene images for your visual story';audio.onloadedmetadata=()=>{$('timeReadout').textContent='00:00 / '+fmt(audio.duration);$('scrub').max=audio.duration||100;};draw();});
$('personFile').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;personImg=await loadImage(f);$('personName').textContent=f.name;draw()});
$('sceneFiles').addEventListener('change',async e=>{sceneImgs=await Promise.all([...e.target.files].map(loadImage));$('sceneName').textContent=sceneImgs.length+' image(s) selected';draw()});
function fmt(s){if(!isFinite(s))s=0;return String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0')}
function cover(im,x,y,w,h){const r=Math.max(w/im.width,h/im.height),iw=im.width*r,ih=im.height*r;ctx.drawImage(im,x+(w-iw)/2,y+(h-ih)/2,iw,ih)}
function drawScene(im,x,y,w,h,alpha=1,zoom=1){
 if(!im)return;
 ctx.save();ctx.globalAlpha=alpha;
 const cx=x+w/2,cy=y+h/2;ctx.translate(cx,cy);ctx.scale(zoom,zoom);ctx.translate(-cx,-cy);
 cover(im,x,y,w,h);ctx.restore();
}
function drawTransitionedScene(x,y,w,h,idx,t){
 if(!sceneImgs.length)return;
 const style=$('transitionStyle')?.value||'fade';
 const duration=+$('transitionDuration')?.value||0.7;
 const sceneLength=6,elapsed=t%sceneLength;
 const current=sceneImgs[idx];
 if(style==='cut'||elapsed>=duration||sceneImgs.length<2){drawScene(current,x,y,w,h,1,style==='fadezoom'?1.025:1);return;}
 const progress=Math.max(0,Math.min(1,elapsed/duration));
 // Crossfade old still out while the new still fades in.
 const previous=sceneImgs[(idx-1+sceneImgs.length)%sceneImgs.length];
 drawScene(previous,x,y,w,h,1-progress,style==='fadezoom'?1.035:1);
 drawScene(current,x,y,w,h,progress,style==='fadezoom'?1.0+0.025*progress:1);
}
function draw(){
 const W=canvas.width,H=canvas.height;ctx.clearRect(0,0,W,H);
 const grad=ctx.createLinearGradient(0,0,W,H);grad.addColorStop(0,'#15212b');grad.addColorStop(.55,'#243a43');grad.addColorStop(1,'#0c1118');ctx.fillStyle=grad;ctx.fillRect(0,0,W,H);
 const t=audio.currentTime||0,idx=sceneImgs.length?Math.floor(t/6)%sceneImgs.length:-1,layout=$('layout').value;
 if(layout==='corner'){
   if(idx>=0)drawTransitionedScene(0,0,W,H,idx,t);
   else {ctx.fillStyle='#182630';ctx.fillRect(0,0,W,H);ctx.fillStyle='#9aacb9';ctx.font='32px Inter';ctx.fillText('Add AI scene images',60,100)}
   if(personImg){ctx.save();ctx.beginPath();ctx.roundRect(W-250,H-330,210,290,12);ctx.clip();cover(personImg,W-250,H-330,210,290);ctx.restore()}
 }else{
   let leftW=layout==='left'?W*.36:W*.64,rightW=W-leftW;
   if(idx>=0){if(layout==='left')drawTransitionedScene(leftW,0,rightW,H,idx,t);else drawTransitionedScene(0,0,leftW,H,idx,t)}
   else {ctx.fillStyle='#17232d';ctx.fillRect(layout==='left'?leftW:0,0,layout==='left'?rightW:leftW,H);ctx.fillStyle='#a9b8c6';ctx.font='30px Inter';ctx.fillText('ADD SCENE IMAGES',layout==='left'?leftW+55:60,H/2)}
   if(personImg){if(layout==='left')cover(personImg,0,0,leftW,H);else cover(personImg,leftW,0,rightW,H)}
   ctx.fillStyle='#05080bcc';ctx.fillRect(layout==='left'?leftW-2:0,0,4,H);
 }
 // subtle cinematic overlay
 const vg=ctx.createRadialGradient(W/2,H/2,H*.2,W/2,H/2,H*.8);vg.addColorStop(0,'#00000000');vg.addColorStop(1,'#00000077');ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);
 drawCaption(ctx,W,H);
 drawWave(wctx,waveCanvas.width,waveCanvas.height,true);
 $('timeReadout').textContent=fmt(t)+' / '+fmt(audio.duration||0);
 $('scrub').value=t;
}
function drawCaption(c,W,H){
 let raw=$('captionText').value.trim().toUpperCase()||'YOUR CAPTION HERE';
 let words=raw.split(/\s+/),lines=['',''];let cut=Math.ceil(words.length/2);lines[0]=words.slice(0,cut).join(' ');lines[1]=words.slice(cut).join(' ');
 const fs=+$('fontSize').value*(W/1280),style=captionStyle,hl=$('highlight').value;
 c.save();c.textAlign='center';c.textBaseline='middle';c.font=`900 ${fs}px Inter, Arial`;const y=H*.78;
 if(style==='boxed'){c.fillStyle='#030609cc';c.fillRect(W*.12,y-fs*.8,W*.76,fs*2.15)}
 lines.forEach((line,i)=>{if(!line)return;let yy=y+(i-.5)*fs*1.08;
   if(style==='yellow'){c.fillStyle=hl;c.strokeStyle='#111';c.lineWidth=fs*.08;c.strokeText(line,W/2,yy);c.fillText(line,W/2,yy)}
   else if(style==='clean'){c.font=`600 ${fs*.72}px Inter, Arial`;c.fillStyle='#fff';c.shadowColor='#000';c.shadowBlur=8;c.fillText(line,W/2,yy)}
   else if(style==='outline'){c.strokeStyle=hl;c.lineWidth=fs*.045;c.strokeText(line,W/2,yy);c.fillStyle='#fff';c.fillText(line,W/2,yy)}
   else if(style==='word'){c.fillStyle=i===1?hl:'#fff';c.strokeStyle='#000';c.lineWidth=fs*.09;c.strokeText(line,W/2,yy);c.fillText(line,W/2,yy)}
   else {c.fillStyle='#fff';c.strokeStyle='#05070a';c.lineWidth=fs*.1;c.lineJoin='round';c.strokeText(line,W/2,yy);c.fillText(line,W/2,yy)}
 });
 c.restore()
}
function drawWave(c,W,H,preview=false){
 c.clearRect(0,0,W,H);const color=$('waveColor').value,size=+$('waveSize').value/100,mid=H/2;
 c.strokeStyle=color;c.fillStyle=color;c.lineWidth=3;c.lineCap='round';
 const n=preview?48:42,step=W/(n+2),phase=(audio.currentTime||0)*4;
 for(let i=0;i<n;i++){let amp=(.15+Math.abs(Math.sin(i*1.71+phase))*.65+Math.abs(Math.cos(i*.41+phase*.7))*.2)*(H*.42)*size;let x=step*(i+1);
  if(waveStyle==='line'){if(i===0)c.beginPath();c.lineTo(x,mid+Math.sin(i*.48+phase)*amp*.6);if(i===n-1)c.stroke()}
  else if(waveStyle==='dots'){c.beginPath();c.arc(x,mid,Math.max(1.5,amp*.13),0,Math.PI*2);c.fill();c.beginPath();c.arc(x,mid-amp*.45,Math.max(1.5,amp*.12),0,Math.PI*2);c.fill()}
  else if(waveStyle==='ring'){let r=H*.19+Math.sin(phase)*3;c.beginPath();c.arc(W/2,mid,r,0,Math.PI*2);c.stroke();for(let j=0;j<24;j++){let a=j*Math.PI/12,rr=r+Math.abs(Math.sin(j*1.3+phase))*H*.17*size;c.beginPath();c.moveTo(W/2+Math.cos(a)*r,mid+Math.sin(a)*r);c.lineTo(W/2+Math.cos(a)*rr,mid+Math.sin(a)*rr);c.stroke()}break}
  else {let h=waveStyle==='mirror'?amp*.45:amp;c.fillRect(x,mid-h/2,Math.max(2,step*.45),h);if(waveStyle==='mirror')c.fillRect(x,mid,Math.max(2,step*.45),h)}
 }
}
$('captionText').addEventListener('input',draw);$('fontSize').addEventListener('input',draw);$('highlight').addEventListener('input',draw);$('layout').addEventListener('change',draw);
document.querySelectorAll('#captionTemplates .template').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('#captionTemplates .template').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');captionStyle=b.dataset.style;draw()}));
document.querySelectorAll('#waveTemplates .template').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('#waveTemplates .template').forEach(x=>x.classList.remove('wave-selected'));b.classList.add('wave-selected');waveStyle=b.dataset.wave;draw()}));
$('waveColor').addEventListener('input',draw);$('waveSize').addEventListener('input',draw);
document.querySelectorAll('[data-ratio]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-ratio]').forEach(x=>x.classList.remove('active'));b.classList.add('active');ratio=b.dataset.ratio;if(ratio==='vertical'){canvas.width=720;canvas.height=1280}else{canvas.width=1280;canvas.height=720}draw();toast('Preview changed to '+(ratio==='vertical'?'9:16 Shorts':'16:9 YouTube')+'.')}));
$('playBtn').addEventListener('click',async()=>{if(!audio.src){toast('Upload a voiceover audio file first.');return}if(audio.paused){await audio.play();$('playBtn').textContent='Ⅱ Pause preview';animate()}else{audio.pause();$('playBtn').textContent='▶ Play preview';cancelAnimationFrame(raf)}});
function animate(){draw();if(!audio.paused)raf=requestAnimationFrame(animate)}
audio.addEventListener('ended',()=>{$('playBtn').textContent='▶ Play preview';cancelAnimationFrame(raf);draw()});
$('scrub').addEventListener('input',e=>{if(audio.duration)audio.currentTime=+e.target.value;draw()});
$('jumpCaptions').onclick=()=>$('captionPanel').scrollIntoView({behavior:'smooth'});$('jumpWave').onclick=()=>$('wavePanel').scrollIntoView({behavior:'smooth'});
$('resetBtn').onclick=()=>{if(confirm('Reset this local project?'))location.reload()};
$('exportBtn').onclick=()=>toast('Export rendering is not connected in this starter yet. The next step is a local FFmpeg or browser-render pipeline; AI API keys must stay on a secure backend.');
draw();
