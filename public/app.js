const $ = s => document.querySelector(s);
const state = { user:null, dashboard:null, lastNotificationIds:new Set(), polling:null, audio:null };
const GROUPS=["A+","A-","B+","B-","AB+","AB-","O+","O-"];
const soundKey=()=>`bloodlink_sound_${state.user?.id||"guest"}`;
$("#year").textContent=new Date().getFullYear();

function toast(message){const el=$("#toast");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),3200);}
function show(section){["welcome","profileSetup","workspace"].forEach(id=>$("#"+id).classList.toggle("hidden",id!==section));}
function escapeHtml(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
async function api(url,options={}){const r=await fetch(url,{headers:{"Content-Type":"application/json"},...options});const d=await r.json();if(!r.ok)throw Error(d.error||"Something went wrong.");return d;}
function roleSetup(role){
  $("#profileRole").value=role;
  $("#setupTitle").textContent=role==="donor"?"Create your donor profile":"Create your receiver profile";
  $("#setupDescription").textContent=role==="donor"?"Your blood group and location help us find compatible requests nearby.":"Tell us how to reach you and where blood is needed.";
  document.querySelectorAll(".donor-only").forEach(el=>el.classList.toggle("hidden",role!=="donor"));
  const blood=$("#profileForm [name=bloodGroup]"),age=$("#profileForm [name=age]");
  blood.required=age.required=role==="donor";
  show("profileSetup");
}
document.querySelectorAll(".role-choice").forEach(b=>b.addEventListener("click",()=>roleSetup(b.dataset.role)));
$("#backRoles").addEventListener("click",()=>show("welcome"));
$("#profileForm").addEventListener("submit",async e=>{
  e.preventDefault();const f=e.currentTarget,button=f.querySelector("button[type=submit]"),msg=$("#profileMessage");
  const payload=Object.fromEntries(new FormData(f).entries());
  payload.age=payload.age?Number(payload.age):null;payload.available=new FormData(f).has("available");payload.consent=new FormData(f).has("consent");
  button.disabled=true;button.textContent="Creating workspace…";
  try{const result=await api("/api/users",{method:"POST",body:JSON.stringify(payload)});state.user=result.user;localStorage.setItem("bloodLinkUserId",state.user.id);await enterWorkspace();}
  catch(err){msg.textContent=err.message;msg.className="message error";}
  finally{button.disabled=false;button.innerHTML='Create my workspace <span>→</span>';}
});

async function enterWorkspace(){
  $("#mainNav").classList.remove("hidden");$("#rolePill").classList.remove("hidden");$("#signOut").classList.remove("hidden");
  $("#rolePill").textContent=state.user.role==="donor"?"Donor workspace":"Receiver workspace";
  $("#headMark").textContent=state.user.role==="donor"?"♡":"✚";
  $("#dashEyebrow").textContent=state.user.role==="donor"?"DONOR SPACE":"RECEIVER SPACE";
  $("#welcomeName").textContent=`Welcome, ${state.user.name.split(" ")[0]}.`;
  $("#dashSubtitle").textContent=state.user.role==="donor"?"Your donor activity, local matches and availability.":"Your requests, donor responses and next steps.";
  $("#moduleTitle").textContent=state.user.role==="donor"?"Requests matching you":"Your blood requests";
  $("#moduleIndex").textContent=state.user.role==="donor"?"01":"02";
  $("#agendaTitle").textContent=state.user.role==="donor"?"Donation agenda":"Request agenda";
  const saved=localStorage.getItem(soundKey())||"chime";$("#soundChoice").value=saved;
  show("workspace");await refreshDashboard();await refreshNotifications();
  if(state.polling)clearInterval(state.polling);
  state.polling=setInterval(async()=>{await refreshDashboard();await refreshNotifications(true);},15000);
}
$("#signOut").addEventListener("click",()=>{if(state.polling)clearInterval(state.polling);state.user=null;state.dashboard=null;localStorage.removeItem("bloodLinkUserId");$("#mainNav").classList.add("hidden");$("#rolePill").classList.add("hidden");$("#signOut").classList.add("hidden");show("welcome");});

async function refreshDashboard(){
  if(!state.user)return;
  try{const d=await api(`/api/dashboard/${state.user.id}`);state.dashboard=d;renderDashboard(d);}
  catch(e){toast(e.message);}
}
function stat(label,value){return `<div class="stat-card"><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></div>`;}
function renderDashboard(d){
  if(d.role==="donor"){
    const responded=d.matches.filter(x=>x.interested).length;
    $("#statsGrid").innerHTML=stat("Matching requests",d.matches.length)+stat("Responses sent",responded)+stat("Availability",d.user.available?"Active":"Paused");
    $("#quickTools").innerHTML=`
      <div class="quick-tool"><span class="tool-icon">♡</span><span><b>Donor profile</b><small>${escapeHtml(d.user.bloodGroup)} · ${escapeHtml(d.user.city)}</small></span></div>
      <div class="quick-tool"><span class="tool-icon">⌁</span><span><b>Matching area</b><small>${escapeHtml(d.user.area||d.user.city)}</small></span></div>
      <div class="quick-tool"><span class="tool-icon">✓</span><span><b>Donation readiness</b><small>Confirm eligibility with a blood bank</small></span></div>`;
    $("#moduleContent").innerHTML=`
      <div class="toggle-line"><input id="availabilityToggle" type="checkbox" ${d.user.available?"checked":""}><span><b>I'm available to donate</b><small>Pause alerts whenever you are unavailable.</small></span></div>
      <div style="height:18px"></div>
      ${d.matches.length?d.matches.map(r=>`
        <article class="match-card"><div class="match-top"><div class="blood-tag">${escapeHtml(r.bloodGroup)}</div><div class="match-info"><b>${escapeHtml(r.hospital)}</b><small>${escapeHtml(r.area?r.area+", ":"")}${escapeHtml(r.city)} · ${r.units} unit(s)</small></div><span class="status">${escapeHtml(r.urgency)}</span></div>
        <div class="match-actions"><button class="small-btn respond-btn" data-id="${escapeHtml(r.id)}" ${r.interested?"disabled":""}>${r.interested?"Response sent":"I'm interested →"}</button></div></article>`).join(""):'<div class="module-content-empty">No matching requests in your city right now. Keep your availability up to date. New matching requests will appear here.</div>'}`;
    $("#availabilityToggle").addEventListener("change",async e=>{try{const result=await api(`/api/users/${d.user.id}`,{method:"PATCH",body:JSON.stringify({available:e.target.checked})});state.user=result.user;toast(e.target.checked?"You are marked available.":"Your availability is paused.");await refreshDashboard();}catch(err){toast(err.message);}});
    document.querySelectorAll(".respond-btn").forEach(btn=>btn.addEventListener("click",async()=>{btn.disabled=true;try{const result=await api(`/api/requests/${btn.dataset.id}/respond`,{method:"POST",body:JSON.stringify({donorId:d.user.id})});toast(result.message);await refreshDashboard();}catch(err){toast(err.message);btn.disabled=false;}}));
  }else{
    const open=d.requests.filter(r=>r.status==="Open").length, interested=d.requests.reduce((n,r)=>n+r.interestedDonors,0);
    $("#statsGrid").innerHTML=stat("Your requests",d.requests.length)+stat("Open requests",open)+stat("Donor responses",interested);
    $("#quickTools").innerHTML=`
      <div class="quick-tool"><span class="tool-icon">✚</span><span><b>New emergency request</b><small>Post a blood requirement below</small></span></div>
      <div class="quick-tool"><span class="tool-icon">⌖</span><span><b>Your location</b><small>${escapeHtml(d.user.city)} · ${escapeHtml(d.user.area||"Area not set")}</small></span></div>
      <div class="quick-tool"><span class="tool-icon">♥</span><span><b>Donor coordination</b><small>Review interested donor contact details</small></span></div>`;
    $("#moduleContent").innerHTML=`
      <form id="newRequestForm">
        <div class="field-grid">
          <label>Blood group needed<select name="bloodGroup" required><option value="">Select group</option>${GROUPS.map(g=>`<option>${g}</option>`).join("")}</select></label>
          <label>Units needed<input name="units" type="number" min="1" max="20" value="1" required></label>
          <label class="full">Hospital / blood bank<input name="hospital" required placeholder="Hospital name and branch"></label>
          <label>City<input name="city" value="${escapeHtml(d.user.city)}" required></label>
          <label>Area / locality<input name="area" value="${escapeHtml(d.user.area||"")}" placeholder="Area"></label>
          <label class="full">Urgency<select name="urgency"><option>Urgent</option><option>Within 24 hours</option><option>Planned</option></select></label>
        </div>
        <button class="btn primary wide" type="submit">Publish blood request <span>→</span></button>
        <p class="message" id="requestMessage"></p>
      </form>
      <div style="height:18px"></div>
      ${d.requests.length?d.requests.slice().reverse().map(renderReceiverRequest).join(""):'<div class="module-content-empty">You have not created a blood request yet. Use the form above when you need to find compatible local donors.</div>'}`;
    $("#newRequestForm").addEventListener("submit",submitRequest);
    document.querySelectorAll(".status-btn").forEach(btn=>btn.addEventListener("click",async()=>{try{await api(`/api/requests/${btn.dataset.id}/status`,{method:"PATCH",body:JSON.stringify({receiverId:d.user.id,status:btn.dataset.status})});toast(`Request marked ${btn.dataset.status.toLowerCase()}.`);await refreshDashboard();}catch(e){toast(e.message);}}));
  }
  const agenda=d.agenda||[];
  $("#agendaContent").innerHTML=agenda.length?agenda.map(a=>`<div class="agenda-item"><div class="agenda-date">${new Date(a.date).toLocaleDateString(undefined,{day:"2-digit",month:"short"})}</div><div><b>${escapeHtml(a.title)}</b><small>${new Date(a.date).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"})} · ${escapeHtml(a.status||"Scheduled")}</small></div></div>`).join(""):'<p class="muted">Your agenda is clear. Activity will appear here as you use Blood Link.</p>';
}
function renderReceiverRequest(r){
  return `<article class="request-card"><div class="request-top"><div class="match-top"><div class="blood-tag">${escapeHtml(r.bloodGroup)}</div><div class="match-info"><b>${escapeHtml(r.hospital)}</b><small>${escapeHtml(r.city)} · ${r.units} unit(s) · ${escapeHtml(r.urgency)}</small></div></div><span class="status">${escapeHtml(r.status)}</span></div>
  <p style="font-size:10px;color:#777;margin:12px 0 7px">${r.interestedDonors} donor(s) interested</p>
  ${r.responses.length?r.responses.map(x=>`<div class="quick-tool"><span class="tool-icon">♡</span><span><b>${escapeHtml(x.name)} · ${escapeHtml(x.bloodGroup||"")}</b><small>${escapeHtml(x.city)} · ${escapeHtml(x.phone||"Contact details unavailable")}</small></span></div>`).join(""):""}
  ${r.status==="Open"?`<div class="match-actions"><button class="small-btn status-btn" data-id="${escapeHtml(r.id)}" data-status="Fulfilled">Mark fulfilled</button><button class="small-btn status-btn" data-id="${escapeHtml(r.id)}" data-status="Cancelled">Cancel request</button></div>`:""}</article>`;
}
async function submitRequest(e){
  e.preventDefault();const f=e.currentTarget,button=f.querySelector("button[type=submit]"),msg=$("#requestMessage");
  const payload=Object.fromEntries(new FormData(f).entries());payload.receiverId=state.user.id;payload.units=Number(payload.units);
  button.disabled=true;button.textContent="Finding local donors…";
  try{const result=await api("/api/requests",{method:"POST",body:JSON.stringify(payload)});msg.textContent=`${result.message} ${result.matchedDonors} matching donor(s) found.`;toast("Your request is live.");await refreshDashboard();}
  catch(err){msg.textContent=err.message;msg.className="message error";}
  finally{button.disabled=false;button.innerHTML='Publish blood request <span>→</span>';}
}

function playSound(type){
  if(type==="none")return;
  try{
    const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return;
    const ctx=state.audio||(state.audio=new Ctx());if(ctx.state==="suspended")ctx.resume();
    const now=ctx.currentTime;
    const tone=(freq,start,duration,wave="sine",volume=.09)=>{
      const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type=wave;osc.frequency.setValueAtTime(freq,start);
      gain.gain.setValueAtTime(.0001,start);gain.gain.exponentialRampToValueAtTime(volume,start+.025);
      gain.gain.exponentialRampToValueAtTime(.0001,start+duration);osc.connect(gain);gain.connect(ctx.destination);
      osc.start(start);osc.stop(start+duration+.03);
    };
    if(type==="chime"){tone(660,now,.32);tone(880,now+.12,.42);}
    else if(type==="bell"){tone(1046,now,.55,"sine",.12);tone(1318,now+.05,.45,"triangle",.05);}
    else if(type==="pulse"){tone(95,now,.18,"sine",.14);tone(80,now+.25,.2,"sine",.11);}
    else if(type==="pop"){tone(520,now,.12,"triangle",.08);tone(740,now+.1,.15,"triangle",.06);}
  }catch(e){console.warn("Audio unavailable",e);}
}
$("#soundChoice").addEventListener("change",e=>{localStorage.setItem(soundKey(),e.target.value);playSound(e.target.value);toast("Notification sound preference saved.");});
$("#testSound").addEventListener("click",()=>playSound($("#soundChoice").value));
$("#browserAlerts").addEventListener("change",async e=>{
  if(!e.target.checked)return;
  if(!("Notification" in window)){e.target.checked=false;toast("Browser notifications are not supported here.");return;}
  const permission=await Notification.requestPermission();
  if(permission!=="granted"){e.target.checked=false;toast("Browser notification permission was not granted.");}
  else toast("Browser notifications enabled.");
});
async function refreshNotifications(playNew=false){
  if(!state.user)return;
  try{
    const items=await api(`/api/notifications/${state.user.id}`);
    const unseen=items.filter(n=>!state.lastNotificationIds.has(n.id));
    if(playNew&&unseen.length){playSound(localStorage.getItem(soundKey())||"chime");
      if("Notification"in window&&Notification.permission==="granted"){
        new Notification("Blood Link",{body:state.user.role==="donor"?"A matching blood request is available.":"There is an update on your request."});
      }}
    items.forEach(n=>state.lastNotificationIds.add(n.id));
    $("#notificationList").innerHTML=items.length?items.map(n=>`<div class="notification-row"><span class="notification-dot"></span><p>${n.type==="matching_request"?"A new blood request matches your donor profile.":"A donor has responded to your blood request."}<small>${new Date(n.createdAt).toLocaleString()}</small></p></div>`).join(""):'<p class="muted">No notifications yet. New activity will appear here.</p>';
  }catch(e){console.warn(e);}
}
$("#clearNotifications").addEventListener("click",async()=>{if(!state.user)return;try{await api(`/api/notifications/${state.user.id}/read`,{method:"POST",body:"{}"});toast("Notifications marked as read.");}catch(e){toast(e.message);}});
async function restore(){
  const userId=localStorage.getItem("bloodLinkUserId");if(!userId)return;
  try{const result=await api(`/api/users/${userId}`);state.user=result.user;await enterWorkspace();}
  catch{localStorage.removeItem("bloodLinkUserId");}
}
restore();
